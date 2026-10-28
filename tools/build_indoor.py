#!/usr/bin/env python3
# SPDX-License-Identifier: GPL-3.0-or-later
"""Build an indoor routing graph for one building from the LUH CAFM floor plans
and a small hand-made source file (data/indoor/<building>/source.json).

  build_indoor.py fit 1101     fit georeference (plan pixels ↔ OSM outline) and
                               register the upper floors onto the ground floor;
                               prints values to paste into source.json
                               (--coarse, or no "georef" yet: global search first)
  build_indoor.py build 1101   write web/data/indoor/1101.json and
                               data/indoor/1101/1101.geojson
                               (--debug also writes overlay PNGs to data/raw/)

How a build works, in short:
  1. Every floor plan image is turned into a cost map: walls are impassable,
     free space near walls is a bit more expensive (so paths keep to the middle
     of a corridor), and space outside the OSM building outline is expensive.
  2. The rough corridor lines from source.json are routed through that cost
     map with a pixel Dijkstra, so they follow the real corridors.
  3. Every room, entrance, stair and lift gets a short "spur" path to the
     nearest corridor.
  4. Chains of pixels are contracted into graph edges with a length in metres.
     The web app runs its own Dijkstra on that small graph.

See docs/INDOOR_FORMAT.md. Needs Pillow and numpy (maintainer tool only;
the web app needs neither).
"""
import argparse
import glob
import heapq
import json
import math
import sys
import time
import urllib.request
from collections import defaultdict
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parent.parent
RAW = ROOT / "data" / "raw"
CAFM = "https://info.cafm.uni-hannover.de/images/room/floorplan/"
USER_AGENT = "LUH-Indoor-GIS-Navi/0.1 (+https://github.com/FreeXYZ-HalfPI/LUH-Indoor-GIS-Navi)"

# Edge flags, a bit field so one edge can carry several (e.g. VERTICAL | STAIRS).
# The web app reads the same numbers (web/js/router.js).
STAIRS, ELEVATOR, VERTICAL = 1, 4, 8

# Routing costs of vertical moves, in "metres of walking". The plans carry no
# real stair geometry, so these are estimates that make the router prefer a
# short walk over an extra floor, and stairs over a lift for one floor.
STAIRS_M_PER_LEVEL = 10    # one flight of stairs
ELEVATOR_M = 25            # waiting + riding, independent of the number of floors

# Plans are cropped to the building, but window gaps in the outer wall look
# like free space. Pixels outside the OSM outline cost 8× more, so paths never
# take a "shortcut" through the courtyard or the street.
OUTSIDE_PENALTY = 8

# One metre in degrees of latitude (and of longitude at the equator).
M_PER_DEGREE = 111320


def level_num(code):
    """Floor code → level number: "000" → 0, "004" → 4, "U01" or "-01" → -1.

    LUH writes basement floors as U01, U02 …; numbers make them sortable."""
    return -int(code[1:]) if code[0] in "U-" else int(code)


def read_json(path, default=None):
    """Parse a UTF-8 JSON file, or return `default` when it does not exist."""
    return json.loads(path.read_text(encoding="utf-8")) if path.exists() else default


def red_mask(rgb):
    """Pixels of the red room highlight that CAFM paints into a room's plan.

    The thresholds accept the anti-aliased edge of the fill but not the
    dark-red or orange lines that some plans use for other things."""
    return (rgb[:, :, 0] > 200) & (rgb[:, :, 1] < 60) & (rgb[:, :, 2] < 60)


def point_in_red(red):
    """A red pixel close to the centre of the highlight, or None without one.

    The plain centroid of an L- or U-shaped room can lie outside the room
    (in a wall or the next room), so we take the red pixel nearest to it."""
    ys, xs = np.nonzero(red)
    if not len(xs):
        return None
    i = np.argmin((xs - xs.mean()) ** 2 + (ys - ys.mean()) ** 2)
    return int(xs[i]), int(ys[i])


# ---------------------------------------------------------------- inputs

def fetch_plan(room):
    """The CAFM floor plan image with `room` highlighted, cached in data/raw/floorplans."""
    path = RAW / "floorplans" / f"{room}.png"
    if not path.exists():
        path.parent.mkdir(parents=True, exist_ok=True)
        req = urllib.request.Request(CAFM + room, headers={"User-Agent": USER_AGENT})
        with urllib.request.urlopen(req, timeout=30) as r:
            data = r.read()
        if not data.startswith(b"\x89PNG"):      # unknown rooms get an HTML error page, not a 404
            raise RuntimeError(f"no floor plan for {room}")
        path.write_bytes(data)
        time.sleep(0.5)                           # be polite to the university server
    return Image.open(path).convert("RGB")


def plan_frame_size(src):
    """(width, height) of the plan frame: the ground-floor image of the building.

    All floors are scaled into this frame, so one pixel grid serves the
    whole building. Some buildings have portrait plans, so it is per building."""
    return fetch_plan(src["plan_room"]["000"]).size


def ink(img):
    """Wall pixels: dark or coloured (LUH plans use black or green), but not the red room highlight."""
    a = np.asarray(img).astype(int)
    return (a.sum(axis=2) < 384) & ~red_mask(a)   # 384 = mid grey: below it the pixel is "drawn"


def to_plan_frame(img, reg, size):
    """Scale/shift a floor image into the ground-floor plan frame.

    The CAFM images of different floors have different scales and offsets.
    `reg` = {"s": scale, "dx": .., "dy": ..} comes from `build_indoor.py fit`."""
    w, h = size
    scaled = img.resize((round(w * reg["s"]), round(h * reg["s"])), Image.LANCZOS)
    canvas = Image.new("RGB", (w, h), "white")
    canvas.paste(scaled, (reg["dx"], reg["dy"]))
    return canvas


def image_to_plan(x, y, reg):
    """A pixel of a floor's own image → the same point in the plan frame."""
    return x * reg["s"] + reg["dx"], y * reg["s"] + reg["dy"]


# Simple binary morphology with numpy only (no scipy dependency).
# np.roll wraps around the image border; that is harmless here because the
# plans have a white margin.

def shift(m, dy, dx):
    return np.roll(np.roll(m, dy, 0), dx, 1)


def erode(m, r=1):
    """A pixel stays True only if its whole (2r+1)² neighbourhood is True."""
    o = m.copy()
    for dy in range(-r, r + 1):
        for dx in range(-r, r + 1):
            o &= shift(m, dy, dx)
    return o


def dilate(m, r=1):
    """A pixel becomes True if any pixel of its (2r+1)² neighbourhood is True."""
    o = m.copy()
    for dy in range(-r, r + 1):
        for dx in range(-r, r + 1):
            o |= shift(m, dy, dx)
    return o


def osm_outline(osm_id):
    """Outer rings of the building's OSM outline (one id or a list) from the cached Overpass data.

    The Overpass dumps are written by tools/build_walk_graph.py, so the
    builder works offline and uses exactly the outline the app shows."""
    if isinstance(osm_id, list):                  # a building made of several OSM objects
        return [r for i in osm_id for r in osm_outline(i)]
    if not osm_id:
        return []
    typ, oid = osm_id.split("/")                  # "way/123" or "relation/456"
    for f in sorted(glob.glob(str(RAW / "osm_cluster_*.json"))):
        for el in json.loads(Path(f).read_text(encoding="utf-8"))["elements"]:
            if el["type"] == typ and el["id"] == int(oid):
                if typ == "way":
                    return [[(g["lat"], g["lon"]) for g in el["geometry"]]]
                # a multipolygon: only the outer rings; inner rings are courtyards
                return [[(g["lat"], g["lon"]) for g in m["geometry"]]
                        for m in el["members"] if m.get("role") == "outer" and "geometry" in m]
    return []


# ---------------------------------------------------------------- georeference

class Georef:
    """Similarity transform between WGS84 and plan pixels.

    Over one building the earth is flat enough for a local east/north metric
    grid around (lat0, lon0). The plan is that grid rotated by `theta`,
    scaled by `scale` px/m and shifted by (tx, ty). Pixel y points down, north up."""

    def __init__(self, g):
        self.lat0, self.lon0 = g["lat0"], g["lon0"]
        self.th, self.s, self.tx, self.ty = g["theta"], g["scale"], g["tx"], g["ty"]
        self.k = math.cos(math.radians(self.lat0))   # a degree of longitude shrinks towards the poles

    def to_px(self, lat, lon):
        east = (lon - self.lon0) * M_PER_DEGREE * self.k
        north = (lat - self.lat0) * M_PER_DEGREE
        c, s = math.cos(self.th), math.sin(self.th)
        return self.tx + self.s * (east * c - north * s), self.ty - self.s * (east * s + north * c)

    def affine(self):
        """Coefficients for lat/lon = c0 + c1·x + c2·y (the inverse of to_px).

        The app gets these 6 numbers instead of the parameters, so it needs
        no trigonometry to place a pixel on the map."""
        c, s, m = math.cos(self.th), math.sin(self.th), self.s * M_PER_DEGREE
        mk = m * self.k
        lat = [self.lat0 + (self.tx * s + self.ty * c) / m, -s / m, -c / m]
        lon = [self.lon0 + (-self.tx * c + self.ty * s) / mk, c / mk, -s / mk]
        return {"lat": lat, "lon": lon}

    def to_latlon(self, x, y):
        a = self.affine()
        return (a["lat"][0] + a["lat"][1] * x + a["lat"][2] * y, a["lon"][0] + a["lon"][1] * x + a["lon"][2] * y)


def to_lonlat(geo, x, y):
    """Plan pixel → [lon, lat], the coordinate order of GeoJSON."""
    lat, lon = geo.to_latlon(x, y)
    return [lon, lat]


def densify(rings, step_m):
    """Points every `step_m` metres along the edges of lat/lon rings.

    Fitting compares points with wall pixels, so a long wall must count as
    much as many short ones: sample by length, not by vertex."""
    pts = []
    for ring in rings:
        for a, b in zip(ring, ring[1:]):
            n = max(1, int(math.dist(a, b) * M_PER_DEGREE / step_m))
            pts += [(a[0] + (b[0] - a[0]) * i / n, a[1] + (b[1] - a[1]) * i / n) for i in range(n)]
    return pts


# ---------------------------------------------------------------- pixel pathfinding

# 8-connected neighbours (dx, dy, step length): diagonals cost √2 so paths are not jagged.
NEIGH = [(-1, 0, 1.0), (1, 0, 1.0), (0, -1, 1.0), (0, 1, 1.0),
         (-1, -1, 1.4142), (-1, 1, 1.4142), (1, -1, 1.4142), (1, 1, 1.4142)]


def snap_free(cost, x, y, r=25):
    """Nearest passable pixel to (x, y) within r pixels, or None.

    Hand-traced points and room centres often sit on a wall line; snapping
    keeps source.json forgiving."""
    h, w = cost.shape
    x, y = int(round(x)), int(round(y))
    best = None
    for dy in range(-r, r + 1):
        for dx in range(-r, r + 1):
            xx, yy = x + dx, y + dy
            if 0 <= xx < w and 0 <= yy < h and np.isfinite(cost[yy, xx]):
                d = dx * dx + dy * dy
                if best is None or d < best[0]:
                    best = (d, xx, yy)
    return (best[1], best[2]) if best else None


def dijkstra(cost, start, is_goal, box):
    """Cheapest pixel path from start to the first pixel where is_goal(p) is true.

    The search is limited to box=(x0, y0, x1, y1): a full plan has ~2 million
    pixels, and a nearby goal never needs more than a small window.
    Returns a list of (x, y) or None."""
    h, w = cost.shape
    x0, y0, x1, y1 = max(0, box[0]), max(0, box[1]), min(w - 1, box[2]), min(h - 1, box[3])
    dist = {start: 0.0}
    prev = {}
    heap = [(0.0, start)]
    while heap:
        d, p = heapq.heappop(heap)
        if d > dist[p]:                           # an outdated heap entry
            continue
        if is_goal(p):
            path = [p]
            while p in prev:
                p = prev[p]
                path.append(p)
            return path[::-1]
        x, y = p
        for dx, dy, step in NEIGH:
            q = (x + dx, y + dy)
            if not (x0 <= q[0] <= x1 and y0 <= q[1] <= y1):
                continue
            c = cost[q[1], q[0]]
            if not np.isfinite(c):                # a wall
                continue
            nd = d + step * c
            if nd < dist.get(q, math.inf):
                dist[q] = nd
                prev[q] = p
                heapq.heappush(heap, (nd, q))
    return None


def straight_line(a, b):
    """Pixels on the straight line a → b (fallback when no free path exists)."""
    n = max(abs(b[0] - a[0]), abs(b[1] - a[1]), 1)
    return [(round(a[0] + (b[0] - a[0]) * i / n), round(a[1] + (b[1] - a[1]) * i / n)) for i in range(n + 1)]


def rdp(pts, eps=1.5):
    """Ramer–Douglas–Peucker: drop points that lie within eps pixels of the line.

    Pixel paths have a point every pixel; after simplification only the
    corners remain, which keeps the app's data files small."""
    if len(pts) < 3:
        return pts
    (x1, y1), (x2, y2) = pts[0], pts[-1]
    length = math.hypot(x2 - x1, y2 - y1) or 1e-9   # first == last on closed rings: see simplify_ring
    i, dmax = 0, -1
    for j in range(1, len(pts) - 1):
        x, y = pts[j]
        d = abs((x2 - x1) * (y1 - y) - (x1 - x) * (y2 - y1)) / length   # distance from the chord
        if d > dmax:
            i, dmax = j, d
    if dmax <= eps:
        return [pts[0], pts[-1]]
    return rdp(pts[: i + 1], eps)[:-1] + rdp(pts[i:], eps)


def simplify_ring(ring, eps=1.5):
    """rdp for a closed ring.

    rdp measures distances from the chord first → last, which has no
    length on a ring. So split the ring at the point farthest from the
    first one and simplify both halves."""
    k = max(range(len(ring)), key=lambda i: math.dist(ring[0], ring[i]))
    return rdp(ring[: k + 1], eps)[:-1] + rdp(ring[k:] + ring[:1], eps)[:-1]


def walk_cost(img, inside):
    """Cost of stepping on each pixel of a floor: inf on walls, 1 in open space, up to 4 next to walls."""
    walls = dilate(erode(ink(img), 1), 1)     # an "opening" removes thin door swings, text and furniture lines
    free = ~walls
    clearance = np.zeros(free.shape)
    m = free.copy()
    for _ in range(6):                        # cheap distance transform: how far from a wall (max 6 px)
        clearance += m
        m = erode(m, 1)
    cost = 1 + 3 * (6 - clearance) / 6        # keeps paths in the middle of a corridor, not along a wall
    cost[~inside] *= OUTSIDE_PENALTY
    cost[walls] = np.inf
    return cost


# ---------------------------------------------------------------- build

class PixelGraph:
    """The routing network while it is still made of pixels.

    A node is (floor code, x, y); every pixel step of a traced path is an edge.
    Pixels make it trivial to join paths: two paths that touch share nodes."""

    def __init__(self, px_per_m):
        self.adj = defaultdict(dict)    # node → {neighbour: flags}
        self.pins = {}                  # node → ("room"|"entrance"|"connector", ref): must stay graph nodes
        self.warnings = []
        self.costs = {}                 # floor code → cost map
        self.corridors = {}             # floor code → set of corridor pixels, the targets of spurs
        self.px_per_m = px_per_m

    def link(self, a, b, flags=0):
        self.adj[a][b] = flags
        self.adj[b][a] = flags

    def add_path(self, code, path, flags=0):
        for a, b in zip(path, path[1:]):
            self.link((code, *a), (code, *b), flags)

    def trace_corridor(self, code, line):
        """Route a hand-drawn corridor polyline through the free space of a floor."""
        cost = self.costs[code]
        snapped = [snap_free(cost, x, y) for x, y in line]
        for (a, b), raw in zip(zip(snapped, snapped[1:]), zip(line, line[1:])):
            if a is None or b is None:
                self.warnings.append(f"{code}: corridor vertex in wall near {raw}")
                continue
            path = None
            for margin in (50, 150):          # try a tight search window first: much faster
                box = (min(a[0], b[0]) - margin, min(a[1], b[1]) - margin,
                       max(a[0], b[0]) + margin, max(a[1], b[1]) + margin)
                path = dijkstra(cost, a, lambda p, b=b: p == b, box)
                if path:
                    break
            if not path:                      # e.g. a door drawn closed: keep the corridor, but warn
                self.warnings.append(f"{code}: no free path {raw[0]}→{raw[1]}, using straight line")
                path = straight_line(a, b)
            self.add_path(code, path)

    def freeze_corridors(self):
        """Remember the corridor pixels per floor. Spurs connect to these only,
        not to each other, so a room never routes through its neighbour room."""
        self.corridors = defaultdict(set)
        for code, x, y in self.adj:
            self.corridors[code].add((x, y))

    def spur(self, code, x, y, kind, ref, radius=220):
        """Connect a point (room, entrance, stair) to the corridors of its floor. Returns its node or None."""
        start = snap_free(self.costs[code], x, y)
        if start is None:
            self.warnings.append(f"{code}: {kind} {ref} sits in a wall")
            return None
        targets = self.corridors[code]
        if not targets:
            self.warnings.append(f"{code}: no corridors for {kind} {ref}")
            return None
        box = (x - radius, y - radius, x + radius, y + radius)
        path = dijkstra(self.costs[code], start, lambda p: p in targets, box)
        if not path:
            self.warnings.append(f"{code}: {kind} {ref} not connected")
            return None
        if len(path) / self.px_per_m > 30:    # a long spur usually means a missing corridor
            self.warnings.append(f"{code}: {kind} {ref} needs a {len(path) / self.px_per_m:.0f} m link to a corridor, check it")
        self.add_path(code, path)
        node = (code, *start)
        self.pins[node] = (kind, ref)
        return node

    def contract(self):
        """Turn pixel chains into edges between junctions and pins.

        Returns (index, nodes, edges): index maps a pixel node to its number,
        nodes are [x, y, level], edges are [a, b, length m, flags, [x, y, x, y …]]
        with the simplified shape of the path in between."""
        def is_vertex(v):
            return v in self.pins or len(self.adj[v]) != 2   # a plain corridor pixel has exactly 2 neighbours

        index, nodes, edges, done = {}, [], [], set()

        def number(v):
            if v not in index:
                index[v] = len(nodes)
                nodes.append([v[1], v[2], level_num(v[0])])
            return index[v]

        for v in list(self.adj):
            if not is_vertex(v):
                continue
            for u in self.adj[v]:
                if (v, u) in done:            # walked this chain already, from its other end
                    continue
                path, flags, prev, cur = [v, u], self.adj[v][u], v, u
                while not is_vertex(cur):
                    nxt = next(x for x in self.adj[cur] if x != prev)
                    flags |= self.adj[cur][nxt]
                    prev, cur = cur, nxt
                    path.append(cur)
                done.add((v, path[1]))
                done.add((cur, path[-2]))
                if flags & VERTICAL:          # stairs/lift: fixed cost, the plan shows no real geometry
                    floors = abs(level_num(v[0]) - level_num(cur[0]))
                    length = ELEVATOR_M if flags & ELEVATOR else STAIRS_M_PER_LEVEL * floors
                    shape = []
                else:
                    length = sum(math.hypot(a[1] - b[1], a[2] - b[2]) for a, b in zip(path, path[1:])) / self.px_per_m
                    shape = [c for p in rdp([(p[1], p[2]) for p in path])[1:-1] for c in p]
                if v == cur and not shape:    # a loop that collapsed to a point
                    continue
                edges.append([number(v), number(cur), round(length, 1), flags, shape])
        return index, nodes, edges


def load_rooms(bid):
    """(crawler records, all room ids, publicly listed ids) of a building.

    Prefers the crawler output (all rooms). Without it, falls back to the
    public list in web/data/rooms.json, so a new building can be built first
    and crawled later."""
    crawl = read_json(ROOT / "data" / "indoor" / bid / "rooms.json")
    if crawl:
        rooms = crawl["rooms"]
        return rooms, [r["id"] for r in rooms], sorted(r["id"] for r in rooms if r["listed"])
    public = read_json(ROOT / "web" / "data" / "rooms.json", {}).get(bid, [])
    return [], public, public


def footprint(src, geo, size):
    """Boolean mask of the plan pixels inside the OSM building outline (grown by 4 px).

    The growth keeps doors in the outer wall inside. Without an outline
    every pixel counts as inside."""
    w, h = size
    img = Image.new("L", (w, h), 0)
    for ring in osm_outline(src.get("osm_outline", "")):
        ImageDraw.Draw(img).polygon([geo.to_px(*p) for p in ring], fill=255)
    mask = np.asarray(img) > 0
    return dilate(mask, 4) if mask.any() else np.ones((h, w), bool)


def room_position(rid, src):
    """Where a room's spur starts, in plan-frame pixels, or None without a highlight."""
    if rid in src.get("room_points", {}):     # hand-placed, e.g. near the door of a big hall
        return tuple(src["room_points"][rid])
    p = point_in_red(red_mask(np.asarray(fetch_plan(rid)).astype(int)))
    if p is None:
        return None
    return image_to_plan(*p, src["levels"][rid.split(".")[1]])


def connect_rooms(graph, rids, src, inside):
    """Give every room a node. Returns (room → node, room → why it has none)."""
    w, h = inside.shape[1], inside.shape[0]
    room_nodes, unrouted = {}, {}
    for rid in rids:
        code = rid.split(".")[1]
        if code not in src["levels"]:
            unrouted[rid] = "floor not mapped"
            continue
        if rid in src.get("skip_rooms", {}):
            unrouted[rid] = "skipped by hand"
            continue
        pos = room_position(rid, src)
        if pos is None:
            graph.warnings.append(f"{rid}: no red highlight")
            unrouted[rid] = "no red highlight on its plan"
            continue
        x, y = pos
        # Some plans show a small inset drawing (another wing, a mezzanine) next to
        # the building; a highlight there must not be linked to the corridors.
        forced = rid in src.get("force_rooms", {}) or rid in src.get("room_points", {})
        if not forced and not (0 <= x < w and 0 <= y < h and inside[int(y), int(x)]):
            graph.warnings.append(f"{rid}: highlight lies outside the building outline (inset drawing?), skipped")
            unrouted[rid] = "outside the building outline"
            continue
        node = graph.spur(code, x, y, "room", rid)
        if node:
            room_nodes[rid] = node
        else:
            unrouted[rid] = "no corridor reachable"
    return room_nodes, unrouted


def connect_entrances(graph, bid, geo):
    """Link the OSM entrances of the building (from walkgraph.json) to the ground floor.

    The same coordinates are in the outdoor walk graph, which is how the
    app joins the outdoor and the indoor route."""
    walk = read_json(ROOT / "web" / "data" / "walkgraph.json")
    entrances = []
    for en in walk["buildings"].get(bid, {}).get("entrances", []):
        if en.get("node") is None or en.get("kind") == "estimated":   # guessed entrances are not on the plan
            continue
        x, y = geo.to_px(en["lat"], en["lon"])
        node = graph.spur("000", x, y, "entrance", f"{en['lat']},{en['lon']}", radius=160)
        if node:
            entrances.append((node, en["lat"], en["lon"]))
    return entrances


def connect_floors(graph, connectors):
    """Join the floors with the stairs and lifts listed in source.json."""
    for c in connectors:
        nodes = [graph.spur(code, *c["at"], "connector", c["id"], radius=150) for code in c["levels"]]
        nodes = [n for n in nodes if n]       # a stair may pass a floor without a mapped exit
        flags = VERTICAL | (ELEVATOR if c["type"] == "elevator" else STAIRS)
        for a, b in zip(nodes, nodes[1:]):
            graph.link(a, b, flags)


def room_outlines(crawl, src):
    """Room shapes for the explorer, plus type/size of the public rooms.

    Returns ({room: [x, y, x, y, …] in plan pixels}, {room: [type, area m²]})."""
    outlines, meta = {}, {}
    for r in crawl:
        reg = src["levels"].get(r["floor"])
        if reg and r["image"] and len(r["image"]["outline"]) >= 3:
            ring = [tuple(round(v) for v in image_to_plan(x, y, reg)) for x, y in r["image"]["outline"]]
            ring = simplify_ring(ring)
            if len(ring) >= 3:
                outlines[r["id"]] = [c for p in ring for c in p]   # flat list: about half the JSON size
        if r.get("type"):
            meta[r["id"]] = [r["type"], r.get("area_m2")]
    return outlines, meta


def edge_points(nodes, edge):
    """All (x, y) points of an edge: start node, shape points, end node."""
    a, b, _, _, shape = edge
    return [tuple(nodes[a][:2])] + [tuple(shape[i:i + 2]) for i in range(0, len(shape), 2)] + [tuple(nodes[b][:2])]


def write_geojson(bid, geo, graph, index, nodes, edges):
    """Corridors and pins as GeoJSON, for review in QGIS or geojson.io."""
    feats = []
    for e in edges:
        if e[3] & VERTICAL:                   # stairs have no horizontal extent to draw
            continue
        feats.append({"type": "Feature", "properties": {"level": nodes[e[0]][2], "length_m": e[2]},
                      "geometry": {"type": "LineString", "coordinates": [to_lonlat(geo, *p) for p in edge_points(nodes, e)]}})
    for node, (kind, ref) in graph.pins.items():
        if node in index:
            feats.append({"type": "Feature", "properties": {"kind": kind, "ref": ref, "level": level_num(node[0])},
                          "geometry": {"type": "Point", "coordinates": to_lonlat(geo, node[1], node[2])}})
    (ROOT / "data" / "indoor" / bid / f"{bid}.geojson").write_text(
        json.dumps({"type": "FeatureCollection", "features": feats}), encoding="utf-8")


def write_debug_images(bid, plans, graph, nodes, edges):
    """data/raw/indoor_<b>_<floor>.png: the graph drawn on each plan, to spot mistakes."""
    colours = {"room": (220, 0, 0), "entrance": (0, 170, 0), "connector": (160, 0, 200)}
    for code, img in plans.items():
        im = img.copy()
        draw = ImageDraw.Draw(im)
        lvl = level_num(code)
        for e in edges:
            if nodes[e[0]][2] == lvl and nodes[e[1]][2] == lvl:
                draw.line(edge_points(nodes, e), fill=(0, 120, 255), width=3)
        for (c, x, y), (kind, _) in graph.pins.items():
            if c == code:
                draw.ellipse((x - 5, y - 5, x + 5, y + 5), fill=colours[kind])
        im.save(RAW / f"indoor_{bid}_{code}.png")


def reachable_from(start, edges):
    """Node numbers reachable from `start` (depth-first search; edges are two-way)."""
    neighbours = defaultdict(list)
    for a, b, *_ in edges:
        neighbours[a].append(b)
        neighbours[b].append(a)
    seen, stack = set(), [start] if start is not None else []
    while stack:
        v = stack.pop()
        if v not in seen:
            seen.add(v)
            stack.extend(neighbours[v])
    return seen


def build(bid, debug=False):
    src = read_json(ROOT / "data" / "indoor" / bid / "source.json")
    size = plan_frame_size(src)
    geo = Georef(src["georef"])
    crawl, rooms_all, listed = load_rooms(bid)
    inside = footprint(src, geo, size)

    # 1. a cost map per floor, then the corridors traced on it
    graph = PixelGraph(px_per_m=src["georef"]["scale"])
    plans = {}
    for code, reg in src["levels"].items():
        plans[code] = to_plan_frame(fetch_plan(src["plan_room"][code]), reg, size)
        graph.costs[code] = walk_cost(plans[code], inside)
        for line in src["corridors"].get(code, []):
            graph.trace_corridor(code, line)
    graph.freeze_corridors()

    # 2. rooms, entrances and stairs/lifts, each linked to the corridors
    room_nodes, unrouted = connect_rooms(graph, rooms_all, src, inside)
    entrances = connect_entrances(graph, bid, geo)
    connect_floors(graph, src["connectors"])

    # 3. the compact graph for the app
    index, nodes, edges = graph.contract()
    outlines, meta = room_outlines(crawl, src)
    levels = {str(level_num(code)): {"code": code, **reg, "room": src["plan_room"][code]}
              for code, reg in src["levels"].items()}
    out = {
        "building": bid,
        "approximate": True,
        "generated": time.strftime("%Y-%m-%d"),
        "attribution": "Derived from LUH Rauminfo floor plans © Leibniz Universität Hannover; outline © OpenStreetMap contributors (ODbL)",
        "georef": geo.affine(),
        "px_per_m": graph.px_per_m,
        "plan_size": list(size),   # CAFM plan image size (some buildings are portrait)
        "levels": levels,
        "nodes": nodes,
        "edges": edges,
        "rooms": {rid: index[n] for rid, n in sorted(room_nodes.items()) if n in index},
        "listed": listed,          # rooms with a public Rauminfo page
        "outlines": outlines,      # {room: [x, y, x, y, …]} plan pixels, for the room explorer
        "meta": meta,              # {room: [type, area m²]} for public rooms
        "entrances": [{"node": index[n], "lat": lat, "lon": lon} for n, lat, lon in entrances if n in index],
    }
    dest = ROOT / "web" / "data" / "indoor" / f"{bid}.json"
    dest.parent.mkdir(parents=True, exist_ok=True)
    dest.write_text(json.dumps(out, separators=(",", ":")), encoding="utf-8")   # compact: it is downloaded by phones
    available = sorted(p.stem for p in dest.parent.glob("*.json") if p.stem != "index")
    (dest.parent / "index.json").write_text(json.dumps(available), encoding="utf-8")   # the app has no directory listing

    write_geojson(bid, geo, graph, index, nodes, edges)
    if debug:
        write_debug_images(bid, plans, graph, nodes, edges)

    # 4. sanity check: every room must be reachable from the first entrance,
    # otherwise a corridor is missing a link (often a stair on one floor)
    seen = reachable_from(index[entrances[0][0]] if entrances else None, edges)
    unreachable = sorted(r for r, n in out["rooms"].items() if n not in seen)
    for w in graph.warnings:
        print("  warning:", w, file=sys.stderr)
    print(f"{bid}: {len(nodes)} nodes, {len(edges)} edges, {len(out['rooms'])}/{len(rooms_all)} rooms, "
          f"{len(out['entrances'])} entrances", file=sys.stderr)
    if unreachable:
        print(f"  rooms not reachable from the entrances: {' '.join(unreachable)}", file=sys.stderr)
    for rid in unreachable:
        unrouted[rid] = "not reachable from the entrances"
    report = {"building": bid, "generated": out["generated"], "total": len(rooms_all),
              "routable": len(out["rooms"]) - len(unreachable), "unrouted": dict(sorted(unrouted.items()))}
    (ROOT / "data" / "indoor" / bid / "build_report.json").write_text(json.dumps(report, indent=1), encoding="utf-8")


# ---------------------------------------------------------------- fit

def exterior(base):
    """Outer boundary of the building on a plan: close gaps, flood the outside, take its edge.

    OSM maps only the outer walls, so fitting against all walls would let
    inner walls pull the result off."""
    h, w = base.shape
    closed = dilate(base, 6)                  # close doors and windows so the flood cannot leak in
    im = Image.fromarray(np.where(closed, 0, 255).astype(np.uint8))
    padded = Image.new("L", (w + 2, h + 2), 255)   # a white border so (0, 0) is surely outside
    padded.paste(im, (1, 1))
    ImageDraw.floodfill(padded, (0, 0), 128)
    outside = np.asarray(padded)[1:-1, 1:-1] == 128
    foot = erode(~outside, 6)                 # undo the closing
    return foot & ~erode(foot, 2)             # keep a 2 px band at the edge


def local_metres(pts, lat0, lon0):
    """lat/lon points → numpy arrays of east and north metres around (lat0, lon0)."""
    k = math.cos(math.radians(lat0))
    east = np.array([(lon - lon0) * M_PER_DEGREE * k for lat, lon in pts])
    north = np.array([(lat - lat0) * M_PER_DEGREE for lat, lon in pts])
    return east, north


def wrap_shift(i, n):
    """FFT correlation peaks wrap around: an index past n/2 is a negative shift."""
    return i - n if i > n // 2 else i


def coarse_georef(base, rings):
    """Global search over rotation and scale (FFT correlation for the shift) at 1/4 resolution.

    Only needed once per building, when no georef exists yet. Correlation
    finds the best shift for a whole image in one FFT, so only rotation and
    scale have to be tried one by one."""
    h, w = base.shape
    allp = [p for r in rings for p in r]
    lat0 = sum(p[0] for p in allp) / len(allp)
    lon0 = sum(p[1] for p in allp) / len(allp)
    east, north = local_metres(densify(rings, 1.0), lat0, lon0)
    f = 4                                     # 1/4 resolution: 16× fewer pixels, still precise enough to start
    small = base[: h // f * f, : w // f * f].reshape(h // f, f, w // f, f).any(axis=(1, 3))
    walls = dilate(small, 1).astype(float)
    walls_fft = np.fft.rfft2(walls)
    hl, wl = walls.shape
    ys, xs = np.nonzero(base)
    # first guess of the scale: the plan's diagonal over the outline's diagonal
    s0 = math.hypot(xs.max() - xs.min(), ys.max() - ys.min()) / math.hypot(east.max() - east.min(), north.max() - north.min())
    best = None
    for s in s0 * np.arange(0.6, 1.5, 0.03):
        for deg in range(0, 360, 2):
            th = math.radians(deg)
            x = s * (east * math.cos(th) - north * math.sin(th)) / f + wl / 2
            y = -s * (east * math.sin(th) + north * math.cos(th)) / f + hl / 2
            outline = np.zeros_like(walls)
            xi, yi = x.round().astype(int), y.round().astype(int)
            ok = (xi >= 0) & (xi < wl) & (yi >= 0) & (yi < hl)
            outline[yi[ok], xi[ok]] = 1
            corr = np.fft.irfft2(walls_fft * np.conj(np.fft.rfft2(outline)), s=walls.shape)
            i = np.unravel_index(corr.argmax(), corr.shape)
            score = corr[i] / outline.sum()   # share of outline points that land on a wall
            if best is None or score > best[0]:
                dy, dx = wrap_shift(i[0], hl), wrap_shift(i[1], wl)
                best = (score, th, s, w / 2 + f * dx, h / 2 + f * dy)
    print(f"  coarse fit: {math.degrees(best[1]):.0f}°, {best[2]:.2f} px/m, score {best[0]:.2f}", file=sys.stderr)
    return {"lat0": round(lat0, 6), "lon0": round(lon0, 6), "theta": best[1], "scale": best[2], "tx": best[3], "ty": best[4]}


def refine_georef(g, edge, rings):
    """Hill-climb rotation, scale and shift until the outline sits on the walls.

    Three rounds with a narrower wall band and smaller steps each time:
    a wide band first, so the search sees a gradient from far away."""
    h, w = edge.shape
    geo = Georef(g)
    east, north = local_metres(densify(rings, 0.5), geo.lat0, geo.lon0)

    def score(p, band):
        th, s, tx, ty = p
        x = (tx + s * (east * math.cos(th) - north * math.sin(th))).round().astype(int)
        y = (ty - s * (east * math.sin(th) + north * math.cos(th))).round().astype(int)
        ok = (x >= 0) & (x < w) & (y >= 0) & (y < h)
        return band[y[ok], x[ok]].sum() / len(x)

    p = [g["theta"], g["scale"], g["tx"], g["ty"]]
    best = 0
    for radius, (d_theta, d_scale, d_px) in ((8, (0.01, 0.02, 4)), (3, (0.003, 0.005, 1)), (3, (0.001, 0.002, 0.5))):
        band = dilate(edge, radius)
        best = score(p, band)
        improved = True
        while improved:
            improved = False
            for i, step in enumerate((d_theta, d_scale, d_px, d_px)):
                for sign in (-1, 1):
                    candidate = list(p)
                    candidate[i] += sign * step
                    sc = score(candidate, band)
                    if sc > best:
                        best, p, improved = sc, candidate, True
    return p, best


def register_floor(base_fft, plan, size):
    """Scale and shift that lay an upper floor's walls onto the ground floor's walls.

    The upper-floor images are drawn at other scales, but the building's
    outer and structural walls are the same on every floor."""
    w, h = size
    walls = ink(plan).astype(np.uint8) * 255
    best = None
    for s in np.arange(0.80, 1.25, 0.005):
        a = np.asarray(Image.fromarray(walls).resize((int(w * s), int(h * s)), Image.BILINEAR)) / 255.0
        frame = np.zeros((h, w))
        frame[: min(h, a.shape[0]), : min(w, a.shape[1])] = a[:h, :w]
        corr = np.fft.irfft2(base_fft * np.conj(np.fft.rfft2(frame)), s=(h, w))
        i = np.unravel_index(corr.argmax(), corr.shape)
        score = corr[i] / frame.sum()
        if best is None or score > best[0]:
            best = (score, s, i)
    _, s, (dy, dx) = best
    return {"s": round(float(s), 3), "dx": int(wrap_shift(dx, w)), "dy": int(wrap_shift(dy, h))}


def fit(bid, coarse=False):
    """Fit plan→OSM georeference and register the upper floors onto the ground floor (FFT correlation).

    Prints JSON snippets to paste into source.json; it never edits the file,
    so a maintainer can check the result (with `build --debug`) first."""
    src = read_json(ROOT / "data" / "indoor" / bid / "source.json")
    size = plan_frame_size(src)
    base = ink(fetch_plan(src["plan_room"]["000"]))
    rings = osm_outline(src["osm_outline"])
    edge = exterior(base)
    g = coarse_georef(edge, rings) if coarse or "georef" not in src else dict(src["georef"])

    p, best = refine_georef(g, edge, rings)
    print(f"  refined: {math.degrees(p[0]):.1f}°, {p[1]:.3f} px/m, {best:.0%} of the outline on walls", file=sys.stderr)
    print(json.dumps({"georef": {"lat0": g["lat0"], "lon0": g["lon0"], "theta": round(p[0], 7), "scale": round(p[1], 6),
                                 "tx": round(p[2], 3), "ty": round(p[3], 3)}}))

    # blur the ground-floor walls by 3 px, so nearly matching walls still score
    blurred = np.zeros(base.shape)
    for dy in range(-3, 4):
        for dx in range(-3, 4):
            blurred += shift(base.astype(float), dy, dx)
    base_fft = np.fft.rfft2(blurred)
    for code, room in src["plan_room"].items():
        if code != "000":
            print(json.dumps({code: register_floor(base_fft, fetch_plan(room), size)}))


if __name__ == "__main__":
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("command", choices=["fit", "build"])
    ap.add_argument("building")
    ap.add_argument("--debug", action="store_true", help="write overlay PNGs to data/raw/")
    ap.add_argument("--coarse", action="store_true", help="fit: search rotation/scale from scratch")
    a = ap.parse_args()
    if a.command == "fit":
        fit(a.building, a.coarse)
    else:
        build(a.building, a.debug)
