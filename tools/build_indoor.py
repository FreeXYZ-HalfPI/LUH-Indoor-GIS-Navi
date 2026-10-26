#!/usr/bin/env python3
# SPDX-License-Identifier: GPL-3.0-or-later
"""Build an indoor routing graph for one building from the LUH CAFM floor plans
and a small hand-made source file (data/indoor/<building>/source.json).

  build_indoor.py fit 1101     fit georeference (plan pixels ↔ OSM outline) and
                               register the upper floors onto the ground floor;
                               prints values to paste into source.json
  build_indoor.py build 1101   write web/data/indoor/1101.json and
                               data/indoor/1101/1101.geojson
                               (--debug also writes overlay PNGs to data/raw/)

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
W, H = 1600, 1200

STAIRS, ELEVATOR, VERTICAL = 1, 4, 8
STAIRS_M_PER_LEVEL = 10    # routing cost of one flight of stairs, in metres of walking
ELEVATOR_M = 25            # waiting + riding
OUTSIDE_PENALTY = 8        # pixels outside the OSM outline are expensive (window gaps!)


def level_num(code):
    return -int(code[1:]) if code[0] in "U-" else int(code)


# ---------------------------------------------------------------- inputs

def fetch_plan(room):
    path = RAW / "floorplans" / f"{room}.png"
    if not path.exists():
        path.parent.mkdir(parents=True, exist_ok=True)
        req = urllib.request.Request(CAFM + room, headers={"User-Agent": USER_AGENT})
        with urllib.request.urlopen(req, timeout=30) as r:
            data = r.read()
        if not data.startswith(b"\x89PNG"):
            raise RuntimeError(f"no floor plan for {room}")
        path.write_bytes(data)
        time.sleep(0.5)
    return Image.open(path).convert("RGB")


def to_plan_frame(img, reg):
    """Scale/shift a floor image into the ground-floor plan frame."""
    s = reg["s"]
    im = img.resize((round(W * s), round(H * s)), Image.LANCZOS)
    can = Image.new("RGB", (W, H), "white")
    can.paste(im, (reg["dx"], reg["dy"]))
    return can


def shift(m, dy, dx):
    return np.roll(np.roll(m, dy, 0), dx, 1)


def erode(m, r=1):
    o = m.copy()
    for dy in range(-r, r + 1):
        for dx in range(-r, r + 1):
            o &= shift(m, dy, dx)
    return o


def dilate(m, r=1):
    o = m.copy()
    for dy in range(-r, r + 1):
        for dx in range(-r, r + 1):
            o |= shift(m, dy, dx)
    return o


def osm_outline(osm_id):
    """Outer rings of the building's OSM outline from the cached Overpass data."""
    typ, oid = osm_id.split("/")
    for f in sorted(glob.glob(str(RAW / "osm_cluster_*.json"))):
        for el in json.loads(Path(f).read_text(encoding="utf-8"))["elements"]:
            if el["type"] == typ and el["id"] == int(oid):
                if typ == "way":
                    return [[(g["lat"], g["lon"]) for g in el["geometry"]]]
                return [[(g["lat"], g["lon"]) for g in m["geometry"]]
                        for m in el["members"] if m.get("role") == "outer" and "geometry" in m]
    return []


# ---------------------------------------------------------------- georeference

class Georef:
    def __init__(self, g):
        self.lat0, self.lon0, self.th, self.s, self.tx, self.ty = g["lat0"], g["lon0"], g["theta"], g["scale"], g["tx"], g["ty"]
        self.k = math.cos(math.radians(self.lat0))

    def to_px(self, lat, lon):
        e = (lon - self.lon0) * 111320 * self.k
        n = (lat - self.lat0) * 111320
        c, s = math.cos(self.th), math.sin(self.th)
        return self.tx + self.s * (e * c - n * s), self.ty - self.s * (e * s + n * c)

    def affine(self):
        """Coefficients for lat/lon = c0 + c1·x + c2·y."""
        c, s, m = math.cos(self.th), math.sin(self.th), self.s * 111320
        mk = m * self.k
        lat = [self.lat0 + (self.tx * s + self.ty * c) / m, -s / m, -c / m]
        lon = [self.lon0 + (-self.tx * c + self.ty * s) / mk, c / mk, -s / mk]
        return {"lat": lat, "lon": lon}

    def to_latlon(self, x, y):
        a = self.affine()
        return (a["lat"][0] + a["lat"][1] * x + a["lat"][2] * y, a["lon"][0] + a["lon"][1] * x + a["lon"][2] * y)


# ---------------------------------------------------------------- pixel pathfinding

NEIGH = [(-1, 0, 1.0), (1, 0, 1.0), (0, -1, 1.0), (0, 1, 1.0),
         (-1, -1, 1.4142), (-1, 1, 1.4142), (1, -1, 1.4142), (1, 1, 1.4142)]


def snap_free(cost, x, y, r=25):
    """Nearest passable pixel to (x, y)."""
    x, y = int(round(x)), int(round(y))
    best = None
    for dy in range(-r, r + 1):
        for dx in range(-r, r + 1):
            xx, yy = x + dx, y + dy
            if 0 <= xx < W and 0 <= yy < H and np.isfinite(cost[yy, xx]):
                d = dx * dx + dy * dy
                if best is None or d < best[0]:
                    best = (d, xx, yy)
    return (best[1], best[2]) if best else None


def dijkstra(cost, start, is_goal, box):
    """Pixel Dijkstra inside box=(x0, y0, x1, y1). Returns list of (x, y) or None."""
    x0, y0, x1, y1 = max(0, box[0]), max(0, box[1]), min(W - 1, box[2]), min(H - 1, box[3])
    dist = {start: 0.0}
    prev = {}
    heap = [(0.0, start)]
    while heap:
        d, p = heapq.heappop(heap)
        if d > dist[p]:
            continue
        if is_goal(p):
            path = [p]
            while p in prev:
                p = prev[p]
                path.append(p)
            return path[::-1]
        x, y = p
        for dx, dy, f in NEIGH:
            q = (x + dx, y + dy)
            if not (x0 <= q[0] <= x1 and y0 <= q[1] <= y1):
                continue
            c = cost[q[1], q[0]]
            if not np.isfinite(c):
                continue
            nd = d + f * c
            if nd < dist.get(q, math.inf):
                dist[q] = nd
                prev[q] = p
                heapq.heappush(heap, (nd, q))
    return None


def rdp(pts, eps=1.5):
    if len(pts) < 3:
        return pts
    (x1, y1), (x2, y2) = pts[0], pts[-1]
    L = math.hypot(x2 - x1, y2 - y1) or 1e-9
    i, dmax = 0, -1
    for j in range(1, len(pts) - 1):
        x, y = pts[j]
        d = abs((x2 - x1) * (y1 - y) - (x1 - x) * (y2 - y1)) / L
        if d > dmax:
            i, dmax = j, d
    if dmax <= eps:
        return [pts[0], pts[-1]]
    return rdp(pts[: i + 1], eps)[:-1] + rdp(pts[i:], eps)


# ---------------------------------------------------------------- build

def build(bid, debug=False):
    src = json.loads((ROOT / "data" / "indoor" / bid / "source.json").read_text(encoding="utf-8"))
    geo = Georef(src["georef"])
    px_per_m = src["georef"]["scale"]
    rooms_all = json.loads((ROOT / "web" / "data" / "rooms.json").read_text(encoding="utf-8")).get(bid, [])
    walk = json.loads((ROOT / "web" / "data" / "walkgraph.json").read_text(encoding="utf-8"))

    foot = Image.new("L", (W, H), 0)
    for ring in osm_outline(src.get("osm_outline", "")):
        ImageDraw.Draw(foot).polygon([geo.to_px(*p) for p in ring], fill=255)
    inside = np.asarray(dilate(np.asarray(foot) > 0, 4)) if np.asarray(foot).any() else np.ones((H, W), bool)

    adj = defaultdict(dict)       # (lvl, x, y) → {neighbour: flags}
    pins = {}                     # (lvl, x, y) → ("room"|"entrance"|"connector", ref)
    warnings = []
    costs, plans = {}, {}

    def add_path(code, path, flags=0):
        for a, b in zip(path, path[1:]):
            ka, kb = (code, *a), (code, *b)
            adj[ka][kb] = flags
            adj[kb][ka] = flags

    for code, reg in src["levels"].items():
        img = to_plan_frame(fetch_plan(src["plan_room"][code]), reg)
        plans[code] = img
        rgb = np.asarray(img)
        black = (rgb < 128).all(axis=2)           # not the red room highlight
        walls = dilate(erode(black, 1), 1)        # opening removes thin door swings, text, furniture lines
        free = ~walls
        clear = np.zeros((H, W))
        m = free.copy()
        for _ in range(6):                        # cheap clearance: how far from a wall (max 6 px)
            clear += m
            m = erode(m, 1)
        cost = 1 + 3 * (6 - clear) / 6
        cost[~inside] *= OUTSIDE_PENALTY
        cost[walls] = np.inf
        costs[code] = cost

        # corridors: route each rough segment through the free space
        for line in src["corridors"].get(code, []):
            snapped = [snap_free(cost, x, y) for x, y in line]
            for (a, b), raw in zip(zip(snapped, snapped[1:]), zip(line, line[1:])):
                if a is None or b is None:
                    warnings.append(f"{code}: corridor vertex in wall near {raw}")
                    continue
                path = None
                for m_ in (50, 150):
                    box = (min(a[0], b[0]) - m_, min(a[1], b[1]) - m_, max(a[0], b[0]) + m_, max(a[1], b[1]) + m_)
                    path = dijkstra(cost, a, lambda p, b=b: p == b, box)
                    if path:
                        break
                if not path:
                    warnings.append(f"{code}: no free path {raw[0]}→{raw[1]}, using straight line")
                    n = max(abs(b[0] - a[0]), abs(b[1] - a[1]), 1)
                    path = [(round(a[0] + (b[0] - a[0]) * i / n), round(a[1] + (b[1] - a[1]) * i / n)) for i in range(n + 1)]
                add_path(code, path)

    corridor_px = defaultdict(set)
    for (code, x, y) in adj:
        corridor_px[code].add((x, y))

    def spur(code, x, y, kind, ref, radius=220):
        """Connect a point to the corridor network of a level through the free space."""
        start = snap_free(costs[code], x, y)
        if start is None:
            warnings.append(f"{code}: {kind} {ref} sits in a wall")
            return None
        targets = corridor_px[code]
        if not targets:
            warnings.append(f"{code}: no corridors for {kind} {ref}")
            return None
        path = dijkstra(costs[code], start, lambda p: p in targets, (x - radius, y - radius, x + radius, y + radius))
        if not path:
            warnings.append(f"{code}: {kind} {ref} not connected")
            return None
        if len(path) / px_per_m > 30:
            warnings.append(f"{code}: {kind} {ref} needs a {len(path) / px_per_m:.0f} m link to a corridor, check it")
        add_path(code, path)
        key = (code, *start)
        pins[key] = (kind, ref)
        return key

    # rooms: the red highlight in each room's own floor plan
    room_nodes = {}
    for rid in rooms_all:
        code = rid.split(".")[1]
        if code not in src["levels"] or rid in src.get("skip_rooms", {}):
            continue
        a = np.asarray(fetch_plan(rid)).astype(int)
        red = (a[:, :, 0] > 200) & (a[:, :, 1] < 60) & (a[:, :, 2] < 60)
        ys, xs = np.nonzero(red)
        if not len(xs):
            warnings.append(f"{rid}: no red highlight")
            continue
        i = np.argmin((xs - xs.mean()) ** 2 + (ys - ys.mean()) ** 2)   # a red pixel near the centroid
        reg = src["levels"][code]
        x, y = xs[i] * reg["s"] + reg["dx"], ys[i] * reg["s"] + reg["dy"]
        forced = rid in src.get("force_rooms", {})
        if not forced and not (0 <= x < W and 0 <= y < H and inside[int(y), int(x)]):
            warnings.append(f"{rid}: highlight lies outside the building outline (inset drawing?), skipped")
            continue
        key = spur(code, x, y, "room", rid)
        if key:
            room_nodes[rid] = key

    # entrances from OSM (same coordinates as in walkgraph.json)
    entrances = []
    for en in walk["buildings"].get(bid, {}).get("entrances", []):
        if en.get("node") is None or en.get("kind") == "estimated":
            continue
        x, y = geo.to_px(en["lat"], en["lon"])
        key = spur("000", x, y, "entrance", f"{en['lat']},{en['lon']}", radius=160)
        if key:
            entrances.append((key, en["lat"], en["lon"]))

    # stairs and lifts
    for c in src["connectors"]:
        keys = [spur(code, *c["at"], "connector", c["id"], radius=150) for code in c["levels"]]
        keys = [k for k in keys if k]             # a stair may pass a floor without a mapped exit
        flags = VERTICAL | (ELEVATOR if c["type"] == "elevator" else STAIRS)
        for ka, kb in zip(keys, keys[1:]):
            adj[ka][kb] = flags
            adj[kb][ka] = flags

    # contract degree-2 pixel chains into edges
    def is_vertex(v):
        return v in pins or len(adj[v]) != 2

    index, nodes, edges, done = {}, [], [], set()

    def idx(v):
        if v not in index:
            index[v] = len(nodes)
            nodes.append([v[1], v[2], level_num(v[0])])
        return index[v]

    for v in list(adj):
        if not is_vertex(v):
            continue
        for u in adj[v]:
            if (v, u) in done:
                continue
            path, flags, prev, cur = [v, u], adj[v][u], v, u
            while not is_vertex(cur):
                nxt = next(x for x in adj[cur] if x != prev)
                flags |= adj[cur][nxt]
                prev, cur = cur, nxt
                path.append(cur)
            done.add((v, path[1]))
            done.add((cur, path[-2]))
            if flags & VERTICAL:
                steps = abs(level_num(v[0]) - level_num(cur[0]))
                length = ELEVATOR_M if flags & ELEVATOR else STAIRS_M_PER_LEVEL * steps
                mid = []
            else:
                length = sum(math.hypot(a[1] - b[1], a[2] - b[2]) for a, b in zip(path, path[1:])) / px_per_m
                mid = [c for p in rdp([(p[1], p[2]) for p in path])[1:-1] for c in p]
            if v == cur and not mid:
                continue
            edges.append([idx(v), idx(cur), round(length, 1), flags, mid])

    levels = {str(level_num(code)): {"code": code, **reg, "room": src["plan_room"][code]} for code, reg in src["levels"].items()}
    out = {
        "building": bid,
        "approximate": True,
        "generated": time.strftime("%Y-%m-%d"),
        "attribution": "Derived from LUH Rauminfo floor plans © Leibniz Universität Hannover; outline © OpenStreetMap contributors (ODbL)",
        "georef": geo.affine(),
        "px_per_m": px_per_m,
        "levels": levels,
        "nodes": nodes,
        "edges": edges,
        "rooms": {rid: index[k] for rid, k in sorted(room_nodes.items()) if k in index},
        "entrances": [{"node": index[k], "lat": lat, "lon": lon} for k, lat, lon in entrances if k in index],
    }
    dest = ROOT / "web" / "data" / "indoor" / f"{bid}.json"
    dest.parent.mkdir(parents=True, exist_ok=True)
    dest.write_text(json.dumps(out, separators=(",", ":")), encoding="utf-8")
    available = sorted(p.stem for p in dest.parent.glob("*.json") if p.stem != "index")
    (dest.parent / "index.json").write_text(json.dumps(available), encoding="utf-8")

    # GeoJSON for review in QGIS / geojson.io
    feats = []
    for a, b, length, flags, mid in edges:
        if flags & VERTICAL:
            continue
        pts = [nodes[a][:2]] + [mid[i:i + 2] for i in range(0, len(mid), 2)] + [nodes[b][:2]]
        feats.append({"type": "Feature", "properties": {"level": nodes[a][2], "length_m": length},
                      "geometry": {"type": "LineString", "coordinates": [list(reversed(geo.to_latlon(*p))) for p in pts]}})
    for key, (kind, ref) in pins.items():
        if key in index:
            lat, lon = geo.to_latlon(key[1], key[2])
            feats.append({"type": "Feature", "properties": {"kind": kind, "ref": ref, "level": level_num(key[0])},
                          "geometry": {"type": "Point", "coordinates": [lon, lat]}})
    (ROOT / "data" / "indoor" / bid / f"{bid}.geojson").write_text(
        json.dumps({"type": "FeatureCollection", "features": feats}), encoding="utf-8")

    if debug:
        for code, img in plans.items():
            im = img.copy()
            dr = ImageDraw.Draw(im)
            lvl = level_num(code)
            for a, b, _, flags, mid in edges:
                if nodes[a][2] == lvl and nodes[b][2] == lvl:
                    pts = [tuple(nodes[a][:2])] + [tuple(mid[i:i + 2]) for i in range(0, len(mid), 2)] + [tuple(nodes[b][:2])]
                    dr.line(pts, fill=(0, 120, 255), width=3)
            for key, (kind, ref) in pins.items():
                if key[0] == code:
                    col = {"room": (220, 0, 0), "entrance": (0, 170, 0), "connector": (160, 0, 200)}[kind]
                    dr.ellipse((key[1] - 5, key[2] - 5, key[1] + 5, key[2] + 5), fill=col)
            im.save(RAW / f"indoor_{bid}_{code}.png")

    # sanity: everything reachable from the first entrance?
    seen, stack = set(), [index[entrances[0][0]]] if entrances else []
    nb = defaultdict(list)
    for a, b, *_ in edges:
        nb[a].append(b)
        nb[b].append(a)
    while stack:
        v = stack.pop()
        if v not in seen:
            seen.add(v)
            stack.extend(nb[v])
    unreachable = sorted(r for r, k in out["rooms"].items() if k not in seen)
    for w in warnings:
        print("  warning:", w, file=sys.stderr)
    print(f"{bid}: {len(nodes)} nodes, {len(edges)} edges, {len(out['rooms'])}/{len(rooms_all)} rooms, "
          f"{len(out['entrances'])} entrances", file=sys.stderr)
    if unreachable:
        print(f"  rooms not reachable from the entrances: {' '.join(unreachable)}", file=sys.stderr)


# ---------------------------------------------------------------- fit

def fit(bid):
    """Fit plan→OSM georeference (starting from source.json) and register upper floors by FFT correlation."""
    src = json.loads((ROOT / "data" / "indoor" / bid / "source.json").read_text(encoding="utf-8"))
    g = dict(src["georef"])
    base = np.asarray(fetch_plan(src["plan_room"]["000"]).convert("L")) < 128

    geo = Georef(g)
    pts = []
    for ring in osm_outline(src["osm_outline"]):
        for a, b in zip(ring, ring[1:]):
            n = max(1, int(math.dist(a, b) * 111320 / 0.5))
            pts += [((a[0] + (b[0] - a[0]) * i / n), (a[1] + (b[1] - a[1]) * i / n)) for i in range(n)]
    E = np.array([(lon - geo.lon0) * 111320 * geo.k for lat, lon in pts])
    N = np.array([(lat - geo.lat0) * 111320 for lat, lon in pts])

    def score(p, D):
        th, s, tx, ty = p
        x = (tx + s * (E * math.cos(th) - N * math.sin(th))).round().astype(int)
        y = (ty - s * (E * math.sin(th) + N * math.cos(th))).round().astype(int)
        ok = (x >= 0) & (x < W) & (y >= 0) & (y < H)
        return D[y[ok], x[ok]].sum() / len(x)

    p = [g["theta"], g["scale"], g["tx"], g["ty"]]
    for r, steps in ((8, (0.01, 0.02, 4)), (3, (0.003, 0.005, 1)), (3, (0.001, 0.002, 0.5))):
        D = dilate(base, r)
        best = score(p, D)
        improved = True
        while improved:
            improved = False
            for i, st in enumerate((steps[0], steps[1], steps[2], steps[2])):
                for sg in (-1, 1):
                    c = list(p)
                    c[i] += sg * st
                    sc = score(c, D)
                    if sc > best:
                        best, p, improved = sc, c, True
    print(json.dumps({"georef": {"lat0": g["lat0"], "lon0": g["lon0"], "theta": round(p[0], 7), "scale": round(p[1], 6),
                                 "tx": round(p[2], 3), "ty": round(p[3], 3)}}))

    R = np.zeros((H, W))
    for dy in range(-3, 4):
        for dx in range(-3, 4):
            R += shift(base.astype(float), dy, dx)
    FR = np.fft.rfft2(R)
    for code, room in src["plan_room"].items():
        if code == "000":
            continue
        m = (np.asarray(fetch_plan(room).convert("L")) < 128).astype(np.uint8) * 255
        best = None
        for s in np.arange(0.80, 1.25, 0.005):
            a = np.asarray(Image.fromarray(m).resize((int(W * s), int(H * s)), Image.BILINEAR)) / 255.0
            mm = np.zeros((H, W))
            mm[: min(H, a.shape[0]), : min(W, a.shape[1])] = a[:H, :W]
            c = np.fft.irfft2(FR * np.conj(np.fft.rfft2(mm)), s=R.shape)
            i = np.unravel_index(c.argmax(), c.shape)
            v = c[i] / mm.sum()
            if best is None or v > best[0]:
                best = (v, s, i)
        _, s, (dy, dx) = best
        dy, dx = (dy - H if dy > H // 2 else dy), (dx - W if dx > W // 2 else dx)
        print(json.dumps({code: {"s": round(float(s), 3), "dx": int(dx), "dy": int(dy)}}))


if __name__ == "__main__":
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("command", choices=["fit", "build"])
    ap.add_argument("building")
    ap.add_argument("--debug", action="store_true", help="write overlay PNGs to data/raw/")
    a = ap.parse_args()
    fit(a.building) if a.command == "fit" else build(a.building, a.debug)
