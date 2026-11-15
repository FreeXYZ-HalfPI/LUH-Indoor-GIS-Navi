#!/usr/bin/env python3
# SPDX-License-Identifier: GPL-3.0-or-later
"""Stations and stops around the campus, from OpenStreetMap, for "I am at the station".

  build_stops.py             download (cached in data/raw/stops.json) and write web/data/stops.json
  build_stops.py --refresh   ignore the cache

Reads web/data/walkgraph.json (run build_walk_graph.py first), asks the Overpass API for
railway stations, tram/Stadtbahn stops, bus stops and bus stations inside the area of the walk
graph, merges the platforms of one stop (same name, closer than 250 m) and snaps each stop
to the nearest walkable node (at most 120 m away, else the stop is dropped: the app could not
route from it). Writes

  web/data/stops.json
    stops: [{id, name, kinds: ["rail" | "tram" | "bus"], lines: [{mode, ref}], aliases, lat, lon, node}]
           (node: the walkable node the stop is snapped to; none for a "hub")
    hubs are the big places far from the walk graph (the main station, the central bus station);
    they have "hub": true and no node. The app routes by public transport to a stop near the goal.

The lines come from the OSM route relations (bus, tram, Stadtbahn) that stop at the stop. They
are as good as OpenStreetMap: the app says so and links the GVH planner for times.

Only the standard library is used. OSM data © OpenStreetMap contributors, ODbL. The app does
not know lines or timetables: for those it links the GVH planner.
"""
import argparse
import json
import math
import re
import sys
import time
from pathlib import Path

from build_walk_graph import OUT, RAW, dist, overpass

HUBS = {   # id: (name, pattern on the stop names that belong to the hub, aliases people type)
    "hannover-hauptbahnhof": ("Hannover Hauptbahnhof", re.compile(r"hauptbahnhof", re.I),
                              ["hbf", "hannover hbf", "hauptbahnhof", "bahnhof", "train station", "main station", "railway station"]),
    "zob-hannover": ("ZOB Hannover (central bus station)", re.compile(r"\bzob\b|omnibusbahnhof", re.I),
                     ["zob", "bus station", "busbahnhof", "zentraler omnibusbahnhof", "central bus station"]),
}
# Stops that are not for everyday use: replacement buses (SEV), depots, sightseeing buses.
NOT_FOR_PASSENGERS = re.compile(r"\(SEV\)|betriebs|stadtrundfahrt|/Betriebshof", re.I)
MODE = {"bus": "bus", "tram": "tram", "light_rail": "tram", "subway": "tram"}

SNAP_MAX_M = 120     # a stop farther than this from any walkable node cannot be routed from
MERGE_M = 250        # platforms of one stop (same name) closer than this are one stop

# Where to look: the box of the walk graph's main campus cluster plus the main station.
BOX = (52.366, 9.690, 52.400, 9.748)   # south, west, north, east


def query():
    s, w, n, e = BOX
    return f"""[out:json][timeout:120][bbox:{s},{w},{n},{e}];
(
  node[public_transport=platform][name];
  node[highway=bus_stop][name];
  node[railway=tram_stop][name];
  node[railway~"^(station|halt)$"][name];
  nwr[amenity=bus_station][name];
);
out center tags;"""


def routes_query():
    s, w, n, e = BOX
    return f"""[out:json][timeout:180][bbox:{s},{w},{n},{e}];
rel[route~"^(bus|tram|light_rail|subway)$"];
out body;"""


def kinds_of(tags):
    """Which kinds of vehicle an OSM stop element serves: rail, tram (incl. Stadtbahn), bus."""
    kinds = set()
    if tags.get("railway") in ("station", "halt"):
        station = tags.get("station")
        kinds.add("tram" if station in ("subway", "light_rail") and tags.get("train") != "yes" else "rail")
    if tags.get("railway") == "tram_stop" or tags.get("tram") == "yes" or tags.get("light_rail") == "yes" or tags.get("subway") == "yes":
        kinds.add("tram")
    if tags.get("highway") == "bus_stop" or tags.get("bus") == "yes" or tags.get("amenity") == "bus_station":
        kinds.add("bus")
    if tags.get("train") == "yes":
        kinds.add("rail")
    return kinds or {"bus"}


def slug(name):
    s = name.lower().replace("ä", "a").replace("ö", "o").replace("ü", "u").replace("ß", "ss")
    return re.sub(r"[^a-z0-9]+", "-", s).strip("-")


def merge(elements):
    """One entry per stop name: platforms closer than MERGE_M are averaged into one place."""
    groups = []                                           # [{name, points: [(lat, lon)], kinds, tags}]
    for el in elements:
        tags = el.get("tags", {})
        name = tags.get("name")
        lat = el.get("lat", el.get("center", {}).get("lat"))
        lon = el.get("lon", el.get("center", {}).get("lon"))
        if not name or lat is None:
            continue
        for g in groups:
            if g["name"] == name and dist((lat, lon), g["centre"]) < MERGE_M:
                g["ids"].add(el["id"])
                g["points"].append((lat, lon))
                g["kinds"] |= kinds_of(tags)
                g["centre"] = tuple(sum(c) / len(g["points"]) for c in zip(*g["points"]))
                break
        else:
            groups.append({"name": name, "ids": {el["id"]}, "points": [(lat, lon)], "centre": (lat, lon), "kinds": kinds_of(tags)})
    return groups


def aliases_of(name, kinds):
    """Words people type for a place: Hbf, Bahnhof, ZOB ... Only for what the name says."""
    low = name.lower()
    out = []
    if "hauptbahnhof" in low:
        out += ["hbf", "hannover hbf", "bahnhof", "train station", "main station"]
    elif "bahnhof" in low and "rail" in kinds:
        out += ["bahnhof", "train station"]
    if "zob" in low or "busbahnhof" in low or "omnibus" in low:
        out += ["zob", "bus station", "busbahnhof"]
    return out


def snap(nodes, point):
    """Index of the walk-graph node nearest to point, and its distance in m (grid lookup)."""
    best, best_d = None, math.inf
    for i, n in enumerate(nodes):
        if abs(n[0] - point[0]) > 0.003 or abs(n[1] - point[1]) > 0.005:   # ~330 m: skip far nodes cheaply
            continue
        d = dist(point, n)
        if d < best_d:
            best, best_d = i, d
    return best, best_d


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--refresh", action="store_true", help="ignore the cached Overpass answer")
    args = ap.parse_args()

    walk = json.loads((OUT / "walkgraph.json").read_text(encoding="utf-8"))
    nodes = walk["nodes"]
    elements = overpass(query(), "stops.json", args.refresh)["elements"]
    groups = merge(elements)

    relations = overpass(routes_query(), "stops_routes.json", args.refresh)["elements"]
    by_node = {}                                          # OSM node id → {(mode, ref)} of the routes that stop there
    for rel in relations:
        tags = rel.get("tags", {})
        if tags.get("route") not in MODE or not tags.get("ref"):
            continue
        for m in rel.get("members", []):
            if m["type"] == "node":
                by_node.setdefault(m["ref"], set()).add((MODE[tags["route"]], tags["ref"]))

    def lines_of(g):
        found = set().union(*(by_node.get(i, set()) for i in g["ids"]))
        return [{"mode": m, "ref": r} for m, r in sorted(found, key=lambda x: (x[0] != "tram", x[1].zfill(4)))]

    order = {"rail": 0, "tram": 1, "bus": 2}
    stops, used = [], {}
    taken = set()                                         # groups that became part of a hub
    for hid, (hname, pattern, hal) in HUBS.items():
        members = [g for g in groups if pattern.search(g["name"]) and id(g) not in taken]   # the first hub claims a shared stop
        if not members:
            continue
        taken |= {id(g) for g in members}
        pts = [p for g in members for p in g["points"]]
        kinds = set().union(*(g["kinds"] for g in members))
        lines = {(l["mode"], l["ref"]) for g in members for l in lines_of(g)}
        stops.append({
            "id": hid, "name": hname, "hub": True, "kinds": sorted(kinds, key=order.get),
            "lines": [{"mode": m, "ref": r} for m, r in sorted(lines, key=lambda x: (x[0] != "tram", x[1].zfill(4)))],
            "aliases": hal, "lat": round(sum(p[0] for p in pts) / len(pts), 6), "lon": round(sum(p[1] for p in pts) / len(pts), 6),
        })
    for g in sorted(groups, key=lambda g: g["name"]):
        if id(g) in taken or NOT_FOR_PASSENGERS.search(g["name"]):
            continue
        node, d = snap(nodes, g["centre"])
        if node is None or d > SNAP_MAX_M:
            continue
        sid = slug(g["name"])
        used[sid] = used.get(sid, 0) + 1
        if used[sid] > 1:                                  # two stops with one name (two sides of a road)
            sid = f"{sid}-{used[sid]}"
        stops.append({
            "id": sid, "name": g["name"], "kinds": sorted(g["kinds"], key=order.get), "lines": lines_of(g),
            "aliases": aliases_of(g["name"], g["kinds"]),
            "lat": round(g["centre"][0], 6), "lon": round(g["centre"][1], 6), "node": node,
        })
    out = {
        "attribution": "Stops © OpenStreetMap contributors (ODbL)",
        "generated": time.strftime("%Y-%m-%d"),
        "stops": stops,
    }
    (OUT / "stops.json").write_text(json.dumps(out, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    hubs = [x["id"] for x in stops if x.get("hub")]
    by_kind = {k: sum(1 for x in stops if k in x["kinds"]) for k in ("rail", "tram", "bus")}
    print(f"{len(stops)} stops ({by_kind}), hubs {hubs}, {len(groups) - len(stops)} groups left out (not near a walkable path)", file=sys.stderr)


if __name__ == "__main__":
    main()
