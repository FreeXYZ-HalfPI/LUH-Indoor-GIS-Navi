#!/usr/bin/env python3
# SPDX-License-Identifier: GPL-3.0-or-later
"""Build the pedestrian routing graph and building entrances from OpenStreetMap.

Reads web/data/buildings.json (from fetch_luh_data.py), groups buildings
into campus clusters, downloads footpaths, building outlines and entrance
nodes for each cluster from the Overpass API, and writes

  web/data/walkgraph.json
    nodes:     [[lat, lon], ...]
    edges:     [[a, b, length_m, flags, [lat, lon, lat, lon, ...]], ...]
               flags: 1 = steps, 2 = link from an entrance to the path network
    buildings: {id: {cluster, osm, entrances: [{node, lat, lon, kind, name}]}}

Only the Python standard library is used. OSM data © OpenStreetMap
contributors, ODbL.
"""
import argparse
import json
import math
import sys
import time
import urllib.parse
import urllib.request
from collections import defaultdict
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
RAW = ROOT / "data" / "raw"
OUT = ROOT / "web" / "data"
OVERRIDES = ROOT / "data" / "entrances_override.json"

# Two public Overpass servers: when the main one is busy (429/504) the mirror usually answers.
OVERPASS = ["https://overpass-api.de/api/interpreter", "https://overpass.kumi.systems/api/interpreter"]
USER_AGENT = "LUH-Indoor-GIS-Navi/0.1 (+https://github.com/FreeXYZ-HalfPI/LUH-Indoor-GIS-Navi)"

# LUH buildings are spread over Hannover. One Overpass query for the whole city
# would be huge and mostly useless, so buildings are grouped into campuses and
# each campus gets its own query and its own part of the walk graph.
CLUSTER_DIST_M = 1200   # buildings closer than this share a walk graph
BBOX_BUFFER_M = 400     # paths around the campus, so a route may leave it briefly
LINK_MAX_M = 80         # max distance from an entrance to the path network
MIN_COMPONENT = 30      # drop tiny disconnected path fragments (nodes): they trap the router

STEPS, ENTRANCE_LINK = 1, 2     # edge flags, read by web/js/router.js

# OSM highway types a pedestrian may use. Big roads are included because their
# sidewalks are often not mapped separately; the foot/access filter in the query
# removes the forbidden ones.
WALKABLE = ("footway|path|pedestrian|steps|living_street|residential|service|unclassified|"
            "tertiary|tertiary_link|secondary|secondary_link|primary|primary_link|cycleway|"
            "track|corridor|road")

# Entrance tags that are not for everyday use, so a route must not end there.
NOT_AN_ENTRANCE = (None, "no", "emergency", "exit")

M_PER_DEGREE = 111_320


def dist(a, b):
    """Equirectangular distance in metres between (lat, lon) pairs; fine at campus scale."""
    k = math.cos(math.radians((a[0] + b[0]) / 2))
    dy = (a[0] - b[0]) * M_PER_DEGREE
    dx = (a[1] - b[1]) * M_PER_DEGREE * k
    return math.hypot(dx, dy)


def clusters(buildings):
    """Single-linkage clustering of buildings by distance (union-find), largest cluster first.

    Single linkage chains neighbours: a long campus stays one cluster even
    if its two ends are far apart."""
    parent = list(range(len(buildings)))

    def find(i):
        while parent[i] != i:
            parent[i] = parent[parent[i]]          # path halving keeps the trees flat
            i = parent[i]
        return i

    pts = [(b["lat"], b["lon"]) for b in buildings]
    for i in range(len(pts)):
        for j in range(i + 1, len(pts)):
            if dist(pts[i], pts[j]) < CLUSTER_DIST_M:
                parent[find(i)] = find(j)
    groups = defaultdict(list)
    for i, b in enumerate(buildings):
        groups[find(i)].append(b)
    return sorted(groups.values(), key=len, reverse=True)


def bbox(group):
    """(south, west, north, east) around a group of buildings, plus the buffer."""
    lat = [b["lat"] for b in group]
    lon = [b["lon"] for b in group]
    dlat = BBOX_BUFFER_M / M_PER_DEGREE
    dlon = dlat / math.cos(math.radians(sum(lat) / len(lat)))
    return min(lat) - dlat, min(lon) - dlon, max(lat) + dlat, max(lon) + dlon


def overpass(query, cache_name, refresh):
    """Run an Overpass query, cached in data/raw/ (the indoor builder reads the outlines there too)."""
    path = RAW / cache_name
    if path.exists() and not refresh:
        return json.loads(path.read_text(encoding="utf-8"))
    body = urllib.parse.urlencode({"data": query}).encode()
    last = None
    for url in OVERPASS:
        for attempt in range(3):
            try:
                req = urllib.request.Request(url, data=body, headers={"User-Agent": USER_AGENT})
                with urllib.request.urlopen(req, timeout=300) as r:
                    text = r.read().decode("utf-8")
                path.parent.mkdir(parents=True, exist_ok=True)
                path.write_text(text, encoding="utf-8")
                time.sleep(2)                      # Overpass asks for a pause between queries
                return json.loads(text)
            except Exception as e:  # network errors, 429, 504 …
                last = e
                print(f"    overpass {url} failed ({e}), retrying", file=sys.stderr)
                time.sleep(10 * (attempt + 1))
    raise RuntimeError(f"Overpass failed: {last}")


def cluster_query(s, w, n, e):
    """Overpass QL: walkable ways (with their nodes), building outlines and entrance nodes in a box.

    `out skel` for the way nodes returns only coordinates, which keeps the
    download small; `out geom` gives outlines with coordinates inline."""
    return f"""[out:json][timeout:240][bbox:{s:.5f},{w:.5f},{n:.5f},{e:.5f}];
way[highway~"^({WALKABLE})$"][area!=yes][foot!~"^(no|private)$"][access!=no];
out body qt;
>;
out skel qt;
wr[building];
out geom qt;
node[entrance];
out body qt;
"""


def point_in_ring(p, ring):
    """Even-odd ray casting: is the (lat, lon) point inside the ring?"""
    lat, lon = p
    inside = False
    for i in range(len(ring)):
        (y1, x1), (y2, x2) = ring[i - 1], ring[i]
        if (y1 > lat) != (y2 > lat) and lon < (x2 - x1) * (lat - y1) / (y2 - y1) + x1:
            inside = not inside
    return inside


def dist_to_ring(p, ring):
    """Distance in metres from a point to the nearest edge of a ring.

    Entrance nodes are usually on the outline, but are sometimes drawn a
    little outside it, so "inside" alone would miss them."""
    best = math.inf
    k = math.cos(math.radians(p[0]))               # scale longitudes, so both axes are in the same unit
    px, py = p[1] * k, p[0]
    for i in range(len(ring)):
        (y1, x1), (y2, x2) = ring[i - 1], ring[i]
        x1, x2 = x1 * k, x2 * k
        dx, dy = x2 - x1, y2 - y1
        # position of the closest point on the segment, clamped to its ends
        t = 0 if dx == dy == 0 else max(0, min(1, ((px - x1) * dx + (py - y1) * dy) / (dx * dx + dy * dy)))
        best = min(best, math.hypot(px - (x1 + t * dx), py - (y1 + t * dy)) * M_PER_DEGREE)
    return best


def outlines(elements):
    """Outer rings of building ways and multipolygon relations: [(osm_id, ring)]."""
    res = []
    for el in elements:
        if "building" not in el.get("tags", {}):
            continue
        if el["type"] == "way" and "geometry" in el:
            res.append((f"way/{el['id']}", [(g["lat"], g["lon"]) for g in el["geometry"]]))
        elif el["type"] == "relation":
            for m in el.get("members", []):
                if m.get("role") == "outer" and "geometry" in m:
                    res.append((f"relation/{el['id']}", [(g["lat"], g["lon"]) for g in m["geometry"]]))
    return res


class Graph:
    """The walk network with OSM node ids, before it is compacted for the app."""

    def __init__(self):
        self.coords = {}              # osm node id → (lat, lon)
        self.adj = defaultdict(dict)  # node → {node: flags}

    def link(self, a, b, flags):
        self.adj[a][b] = flags
        self.adj[b][a] = flags

    def add_way(self, nodes, flags):
        for a, b in zip(nodes, nodes[1:]):
            if a in self.coords and b in self.coords and a != b:   # nodes outside the box have no coordinates
                self.link(a, b, flags)

    def components(self):
        """Connected parts of the network, as lists of nodes (iterative DFS: no recursion limit)."""
        seen, comps = set(), []
        for start in self.adj:
            if start in seen:
                continue
            stack, comp = [start], []
            seen.add(start)
            while stack:
                v = stack.pop()
                comp.append(v)
                for u in self.adj[v]:
                    if u not in seen:
                        seen.add(u)
                        stack.append(u)
            comps.append(comp)
        return comps

    def drop_small_components(self):
        """Remove path fragments with fewer than MIN_COMPONENT nodes; returns the kept nodes.

        A building linked to an isolated fragment (a courtyard path, say)
        could not be reached from anywhere."""
        keep = set()
        for comp in self.components():
            if len(comp) >= MIN_COMPONENT:
                keep.update(comp)
        self.adj = defaultdict(dict, {v: {u: f for u, f in nb.items() if u in keep}
                                      for v, nb in self.adj.items() if v in keep})
        return keep


def entrance_record(node, kind=None, name=None, osm=None):
    return {"osm": osm, "lat": node["lat"], "lon": node["lon"], "kind": kind, "name": name}


def building_entrances(b, rings, ring_entrances, overrides):
    """(OSM outline id, entrances) of one building.

    Standortfinder gives one point per building, not an outline. The point
    can sit inside nested outlines (building parts, courtyard wings), so
    the containing outline with the most entrances wins."""
    p = (b["lat"], b["lon"])
    cands = [(oid, r) for oid, r in rings if point_in_ring(p, r)]
    if not cands:                                  # the point is just outside: the nearest outline within 40 m
        cands = [t for t in rings if dist_to_ring(p, t[1]) < 40]
    scored = [(len(ring_entrances(r)), oid, r) for oid, r in cands]
    best = max(scored, key=lambda t: t[0], default=None)
    hit = (best[1], best[2]) if best else None
    ents = ring_entrances(hit[1]) if hit else []

    # A digitised building may consist of several OSM outlines (data/indoor/<id>/source.json).
    # Its entrances must be those of all of them, the same ones the indoor graph links to.
    indoor = ROOT / "data" / "indoor" / b["id"] / "source.json"
    if indoor.exists():
        ids = json.loads(indoor.read_text(encoding="utf-8")).get("osm_outline", [])
        ids = [ids] if isinstance(ids, str) else ids
        ents, seen = [], set()
        for oid, r in rings:
            if oid not in ids:
                continue
            for e in ring_entrances(r):
                if e["osm"] not in seen:           # an entrance on a shared wall belongs to both outlines
                    seen.add(e["osm"])
                    ents.append(e)
        hit = (",".join(ids), None)

    # hand-made entrances for buildings where OSM has none or the wrong ones
    for o in overrides.get(b["id"], []):
        ents.append({"osm": None, "lat": o["lat"], "lon": o["lon"], "kind": o.get("kind", "yes"), "name": o.get("name", "")})
    return (hit[0] if hit else None), ents


def read_cluster(ci, group, graph, overrides, meta, refresh):
    """Download one campus, add its paths to the graph and its buildings' entrances to meta."""
    s, w, n, e = bbox(group)
    print(f"cluster {ci}: {len(group)} buildings ({', '.join(b['id'] for b in group[:6])}…)", file=sys.stderr)
    cache_name = f"osm_cluster_{ci}_{'_'.join(sorted(b['id'] for b in group))[:60]}.json"
    els = overpass(cluster_query(s, w, n, e), cache_name, refresh)["elements"]
    for el in els:                                 # coordinates first: ways only list node ids
        if el["type"] == "node":
            graph.coords[el["id"]] = (el["lat"], el["lon"])
    for el in els:
        if el["type"] == "way" and "highway" in el.get("tags", {}) and "nodes" in el:
            graph.add_way(el["nodes"], STEPS if el["tags"]["highway"] == "steps" else 0)

    rings = outlines(els)
    entrances = [el for el in els if el["type"] == "node"
                 and el.get("tags", {}).get("entrance") not in NOT_AN_ENTRANCE]

    def ring_entrances(ring):
        """Entrance nodes inside a building outline or within 3 m of it."""
        return [entrance_record(en, en["tags"]["entrance"], en["tags"].get("name") or en["tags"].get("ref") or "", en["id"])
                for en in entrances
                if point_in_ring((en["lat"], en["lon"]), ring) or dist_to_ring((en["lat"], en["lon"]), ring) < 3]

    for b in group:
        osm, ents = building_entrances(b, rings, ring_entrances, overrides)
        meta[b["id"]] = {"cluster": ci, "osm": osm, "entrances": ents, "estimated": not ents}
        if not ents:  # no mapped entrance: fall back to the building point, so the building is still routable
            ents.append(entrance_record(b, "estimated", ""))


def link_entrances(graph, keep, meta):
    """Give every entrance a graph node. Returns the set of these nodes.

    An OSM entrance that is part of a path is used as is. Otherwise a new
    node (negative id, never used by OSM) is linked to the nearest path
    node, if one is within LINK_MAX_M."""
    grid = defaultdict(list)  # ~110 m cells for nearest-node search (1/1000° lat, 1/600° lon at 52° N)
    for v in keep:
        lat, lon = graph.coords[v]
        grid[(int(lat * 1000), int(lon * 600))].append(v)

    def nearest(p):
        cy, cx = int(p[0] * 1000), int(p[1] * 600)
        cand = [v for dy in (-1, 0, 1) for dx in (-1, 0, 1) for v in grid[(cy + dy, cx + dx)]]
        return min(cand, key=lambda v: dist(p, graph.coords[v]), default=None)

    pinned = set()
    fake_id = -1
    for m in meta.values():
        for en in m["entrances"]:
            p = (en["lat"], en["lon"])
            v = en["osm"] if en["osm"] in keep else None
            if v is None:
                near = nearest(p)
                if near is None or dist(p, graph.coords[near]) > LINK_MAX_M:
                    en["node"] = None              # too far from any path: the app walks there directly
                    continue
                v = fake_id
                fake_id -= 1
                graph.coords[v] = p
                graph.link(v, near, ENTRANCE_LINK)
            en["node"] = v
            pinned.add(v)
    return pinned


def contract(graph, pinned):
    """Contract chains of degree-2 nodes into edges with geometry.

    Most OSM nodes only bend a path. Dropping them as graph nodes makes the
    app's Dijkstra much faster; their coordinates stay as the edge shape."""
    def is_vertex(v):
        return v in pinned or len(graph.adj[v]) != 2

    index, nodes, edges, done = {}, [], [], set()

    def number(v):
        if v not in index:
            index[v] = len(nodes)
            lat, lon = graph.coords[v]
            nodes.append([round(lat, 6), round(lon, 6)])   # 6 decimals ≈ 10 cm
        return index[v]

    for v in list(graph.adj):
        if not is_vertex(v):
            continue
        for u in graph.adj[v]:
            if (v, u) in done:                     # walked this chain already, from its other end
                continue
            path, flags, prev, cur = [v, u], graph.adj[v][u], v, u
            while not is_vertex(cur):
                nxt = next(x for x in graph.adj[cur] if x != prev)
                flags |= graph.adj[cur][nxt]
                prev, cur = cur, nxt
                path.append(cur)
            done.add((v, path[1]))
            done.add((cur, path[-2]))
            length = sum(dist(graph.coords[a], graph.coords[b]) for a, b in zip(path, path[1:]))
            shape = [round(c, 5) for x in path[1:-1] for c in graph.coords[x]]   # 5 decimals ≈ 1 m: enough to draw
            edges.append([number(v), number(cur), round(length, 1), flags, shape])
    return index, nodes, edges


def build(refresh):
    buildings = json.loads((OUT / "buildings.json").read_text(encoding="utf-8"))
    overrides = json.loads(OVERRIDES.read_text(encoding="utf-8")) if OVERRIDES.exists() else {}
    graph = Graph()
    meta = {}
    for ci, group in enumerate(clusters(buildings)):
        read_cluster(ci, group, graph, overrides, meta, refresh)

    keep = graph.drop_small_components()
    pinned = link_entrances(graph, keep, meta)
    index, nodes, edges = contract(graph, pinned)

    for m in meta.values():                        # OSM ids → node numbers of the compact graph
        for en in m["entrances"]:
            en["node"] = index.get(en.pop("node", None))
            en.pop("osm", None)

    out = {"attribution": "© OpenStreetMap contributors, ODbL", "generated": time.strftime("%Y-%m-%d"),
           "nodes": nodes, "edges": edges, "buildings": meta}
    (OUT / "walkgraph.json").write_text(json.dumps(out, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    missing = sorted(b for b, m in meta.items() if m["estimated"])
    unlinked = sorted(b for b, m in meta.items() if all(en["node"] is None for en in m["entrances"]))
    print(f"wrote {len(nodes)} nodes, {len(edges)} edges", file=sys.stderr)
    print(f"{len(missing)} buildings without mapped entrance (estimated): {' '.join(missing)}", file=sys.stderr)
    print(f"{len(unlinked)} buildings not linked to paths: {' '.join(unlinked)}", file=sys.stderr)


if __name__ == "__main__":
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--refresh", action="store_true", help="ignore cached Overpass responses")
    build(ap.parse_args().refresh)
