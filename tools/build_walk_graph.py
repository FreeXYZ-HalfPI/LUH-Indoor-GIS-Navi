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

OVERPASS = ["https://overpass-api.de/api/interpreter", "https://overpass.kumi.systems/api/interpreter"]
USER_AGENT = "LUH-Indoor-GIS-Navi/0.1 (+https://github.com/FreeXYZ-HalfPI/LUH-Indoor-GIS-Navi)"

CLUSTER_DIST_M = 1200   # buildings closer than this share a walk graph
BBOX_BUFFER_M = 400
LINK_MAX_M = 80         # max distance from an entrance to the path network
MIN_COMPONENT = 30      # drop tiny disconnected path fragments (nodes)

WALKABLE = ("footway|path|pedestrian|steps|living_street|residential|service|unclassified|"
            "tertiary|tertiary_link|secondary|secondary_link|primary|primary_link|cycleway|"
            "track|corridor|road")


def dist(a, b):
    """Equirectangular distance in metres between (lat, lon) pairs; fine at campus scale."""
    k = math.cos(math.radians((a[0] + b[0]) / 2))
    dy = (a[0] - b[0]) * 111_320
    dx = (a[1] - b[1]) * 111_320 * k
    return math.hypot(dx, dy)


def clusters(buildings):
    """Single-linkage clustering of buildings by distance."""
    parent = list(range(len(buildings)))

    def find(i):
        while parent[i] != i:
            parent[i] = parent[parent[i]]
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
    lat = [b["lat"] for b in group]
    lon = [b["lon"] for b in group]
    dlat = BBOX_BUFFER_M / 111_320
    dlon = dlat / math.cos(math.radians(sum(lat) / len(lat)))
    return min(lat) - dlat, min(lon) - dlon, max(lat) + dlat, max(lon) + dlon


def overpass(query, cache_name, refresh):
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
                time.sleep(2)
                return json.loads(text)
            except Exception as e:  # network errors, 429, 504 …
                last = e
                print(f"    overpass {url} failed ({e}), retrying", file=sys.stderr)
                time.sleep(10 * (attempt + 1))
    raise RuntimeError(f"Overpass failed: {last}")


def cluster_query(s, w, n, e):
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
    lat, lon = p
    inside = False
    for i in range(len(ring)):
        (y1, x1), (y2, x2) = ring[i - 1], ring[i]
        if (y1 > lat) != (y2 > lat) and lon < (x2 - x1) * (lat - y1) / (y2 - y1) + x1:
            inside = not inside
    return inside


def dist_to_ring(p, ring):
    best = math.inf
    k = math.cos(math.radians(p[0]))
    px, py = p[1] * k, p[0]
    for i in range(len(ring)):
        (y1, x1), (y2, x2) = ring[i - 1], ring[i]
        x1, x2 = x1 * k, x2 * k
        dx, dy = x2 - x1, y2 - y1
        t = 0 if dx == dy == 0 else max(0, min(1, ((px - x1) * dx + (py - y1) * dy) / (dx * dx + dy * dy)))
        best = min(best, math.hypot(px - (x1 + t * dx), py - (y1 + t * dy)) * 111_320)
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
    def __init__(self):
        self.coords = {}           # osm node id → (lat, lon)
        self.adj = defaultdict(dict)  # node → {node: flags}

    def add_way(self, nodes, flags):
        for a, b in zip(nodes, nodes[1:]):
            if a in self.coords and b in self.coords and a != b:
                self.adj[a][b] = flags
                self.adj[b][a] = flags

    def components(self):
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


def build(refresh):
    buildings = json.loads((OUT / "buildings.json").read_text(encoding="utf-8"))
    overrides = json.loads(OVERRIDES.read_text(encoding="utf-8")) if OVERRIDES.exists() else {}
    graph = Graph()
    meta = {}

    for ci, group in enumerate(clusters(buildings)):
        s, w, n, e = bbox(group)
        print(f"cluster {ci}: {len(group)} buildings ({', '.join(b['id'] for b in group[:6])}…)", file=sys.stderr)
        data = overpass(cluster_query(s, w, n, e), f"osm_cluster_{ci}_{'_'.join(sorted(b['id'] for b in group))[:60]}.json", refresh)
        els = data["elements"]
        for el in els:
            if el["type"] == "node":
                graph.coords[el["id"]] = (el["lat"], el["lon"])
        for el in els:
            if el["type"] == "way" and "highway" in el.get("tags", {}) and "nodes" in el:
                graph.add_way(el["nodes"], 1 if el["tags"]["highway"] == "steps" else 0)

        rings = outlines(els)
        entrances = [el for el in els if el["type"] == "node"
                     and el.get("tags", {}).get("entrance") not in (None, "no", "emergency", "exit")]

        def ring_entrances(ring):
            return [{"osm": en["id"], "lat": en["lat"], "lon": en["lon"], "kind": en["tags"]["entrance"],
                     "name": en["tags"].get("name") or en["tags"].get("ref") or ""}
                    for en in entrances
                    if point_in_ring((en["lat"], en["lon"]), ring) or dist_to_ring((en["lat"], en["lon"]), ring) < 3]

        for b in group:
            p = (b["lat"], b["lon"])
            # the point can sit inside nested outlines (building parts, courtyard wings):
            # take the containing outline with the most entrances
            cands = [(oid, r) for oid, r in rings if point_in_ring(p, r)]
            if not cands:
                cands = [t for t in rings if dist_to_ring(p, t[1]) < 40]
            scored = [(len(ring_entrances(r)), oid, r) for oid, r in cands]
            best = max(scored, key=lambda t: t[0], default=None)
            hit = (best[1], best[2]) if best else None
            ents = ring_entrances(hit[1]) if hit else []
            # a digitised building may consist of several OSM outlines (data/indoor/<id>/source.json)
            indoor = ROOT / "data" / "indoor" / b["id"] / "source.json"
            if indoor.exists():
                ids = json.loads(indoor.read_text(encoding="utf-8")).get("osm_outline", [])
                ids = [ids] if isinstance(ids, str) else ids
                seen = set()
                ents = [e for oid, r in rings if oid in ids for e in ring_entrances(r)
                        if not (e["osm"] in seen or seen.add(e["osm"]))]
                hit = (",".join(ids), None)
            for o in overrides.get(b["id"], []):
                ents.append({"osm": None, "lat": o["lat"], "lon": o["lon"], "kind": o.get("kind", "yes"), "name": o.get("name", "")})
            meta[b["id"]] = {"cluster": ci, "osm": hit[0] if hit else None, "entrances": ents, "estimated": not ents}
            if not ents:  # no mapped entrance: fall back to the building point
                ents.append({"osm": None, "lat": p[0], "lon": p[1], "kind": "estimated", "name": ""})
            meta[b["id"]]["entrances"] = ents

    # drop tiny fragments, then link entrances to the nearest remaining path node
    keep = set()
    for comp in graph.components():
        if len(comp) >= MIN_COMPONENT:
            keep.update(comp)
    graph.adj = defaultdict(dict, {v: {u: f for u, f in nb.items() if u in keep} for v, nb in graph.adj.items() if v in keep})

    grid = defaultdict(list)  # ~110 m cells for nearest-node search
    for v in keep:
        lat, lon = graph.coords[v]
        grid[(int(lat * 1000), int(lon * 600))].append(v)

    def nearest(p):
        cy, cx = int(p[0] * 1000), int(p[1] * 600)
        cand = [v for dy in (-1, 0, 1) for dx in (-1, 0, 1) for v in grid[(cy + dy, cx + dx)]]
        return min(cand, key=lambda v: dist(p, graph.coords[v]), default=None)

    pinned = set()
    fake_id = -1
    for bid, m in meta.items():
        for en in m["entrances"]:
            p = (en["lat"], en["lon"])
            v = en["osm"] if en["osm"] in keep else None
            if v is None:
                near = nearest(p)
                if near is None or dist(p, graph.coords[near]) > LINK_MAX_M:
                    en["node"] = None
                    continue
                v = fake_id
                fake_id -= 1
                graph.coords[v] = p
                graph.adj[v][near] = 2
                graph.adj[near][v] = 2
            en["node"] = v
            pinned.add(v)

    # contract chains of degree-2 nodes into edges with geometry
    def is_vertex(v):
        return v in pinned or len(graph.adj[v]) != 2

    index, nodes, edges, done = {}, [], [], set()

    def idx(v):
        if v not in index:
            index[v] = len(nodes)
            lat, lon = graph.coords[v]
            nodes.append([round(lat, 6), round(lon, 6)])
        return index[v]

    for v in list(graph.adj):
        if not is_vertex(v):
            continue
        for u in graph.adj[v]:
            if (v, u) in done:
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
            mid = [round(c, 5) for x in path[1:-1] for c in graph.coords[x]]
            edges.append([idx(v), idx(cur), round(length, 1), flags, mid])

    for m in meta.values():
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
