#!/usr/bin/env python3
# SPDX-License-Identifier: GPL-3.0-or-later
"""One command per building: building number in, results out.

  run_building.py 3101                 run every step that is still open for building 3101
  run_building.py 3101 1101            several buildings, one after the other
  run_building.py 3101 --report        no network, no build: only show the current results
  run_building.py 3101 --debug         also write overlay PNGs (data/raw/) to check corridors and fit
  run_building.py 3101 --recrawl       crawl the rooms again (default: reuse data/indoor/<b>/rooms.json)
  run_building.py 3101 --refit         fit the georeference again, even if source.json has one
  run_building.py 3101 --osm way/123,way/456   OSM outline(s) of the building, if the walk graph does not know them
  run_building.py --layer              list the indexed buildings (number, name, rooms) and write the GIS layer
                                       data/indoor/indexed_buildings.geojson (open it in QGIS or geojson.io)
  run_building.py --serve              start the web app at http://localhost:8000 (no building needed)

The steps, in order. Each one is skipped when its output already exists:

  1. rooms      tools/crawl_rooms.py          in: building number          out: data/indoor/<b>/rooms.json
  2. source     skeleton source.json          in: rooms.json, walk graph   out: data/indoor/<b>/source.json
  3. fit        build_indoor.py fit --coarse  in: plan images + OSM outline out: georef and floors in source.json
  4. corridors  tools/auto_corridors.py       in: plan images, rooms.json  out: "auto_corridors", "auto_connectors" in source.json
                (automatic; a hand-made "corridors"/"connectors" in source.json is used too and never overwritten)
  5. build      build_indoor.py build         in: source.json, plans       out: web/data/indoor/<b>.json
  6. entrances  build_walk_graph.py + build   in: the new outline          out: entrances shared by outdoor and indoor graph
  7. coverage   tools/coverage.py             in: all build reports        out: docs/COVERAGE.md
  8. report     (printed here)                in: build_report.json        out: rooms found / routable / why not

Nothing is manual any more. The automatic corridors are a draft: look at data/raw/auto_<b>_<floor>.png
(--debug) and, where it is wrong, add lines by hand to "corridors" (docs/INDOOR_FORMAT.md) and run again.
  --reauto     find corridors, stairs and lifts again (default: reuse the ones in source.json)
Needs Pillow and numpy (pip install pillow numpy). Everything else is the standard library.
"""
import argparse
import functools
import http.server
import json
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
TOOLS = ROOT / "tools"
WEB = ROOT / "web"


def read(p):
    return json.loads(Path(p).read_text(encoding="utf-8"))


def write(p, data):
    Path(p).write_text(json.dumps(data, ensure_ascii=False, indent=1) + "\n", encoding="utf-8")


def say(msg=""):
    print(msg, flush=True)


def step(n, name, why):
    say(f"\n[{n}/8] {name}: {why}")


def run(args, capture=False):
    """Run another tool of this project; its progress goes to this terminal."""
    cmd = [sys.executable, *map(str, args)]
    say("      $ " + " ".join(["python3", *map(str, args)]))
    res = subprocess.run(cmd, cwd=ROOT, text=True, stdout=subprocess.PIPE if capture else None)
    if res.returncode:
        raise SystemExit(f"      the tool failed (exit code {res.returncode}); see the message above")
    return res.stdout


def check_dependencies():
    try:
        import numpy, PIL  # noqa: F401, E401
    except ImportError:
        raise SystemExit("Pillow and numpy are needed for the indoor builder:  pip install pillow numpy")


def building_info(bid):
    path = WEB / "data" / "buildings.json"
    if not path.exists():
        run([TOOLS / "fetch_luh_data.py"])
    found = next((b for b in read(path) if b["id"] == bid), None)
    if not found:
        raise SystemExit(f"building {bid} is not in LUH's building list (web/data/buildings.json). Check the number.")
    return found


# ───────────────────────────── the steps ─────────────────────────────

def step_rooms(bid, recrawl):
    f = ROOT / "data" / "indoor" / bid / "rooms.json"
    step(1, "rooms", "find every room of the building on the CAFM floor plans")
    if f.exists() and not recrawl:
        say(f"      done before: {f.relative_to(ROOT)} ({len(read(f)['rooms'])} rooms). --recrawl to repeat")
    else:
        run([TOOLS / "crawl_rooms.py", bid])
    run([TOOLS / "fetch_luh_data.py"])    # cached: adds the crawled rooms to the app's room list (web/data/rooms.json)


def step_source(bid, info, osm):
    f = ROOT / "data" / "indoor" / bid / "source.json"
    step(2, "source", "the small hand-edited description of the building")
    if f.exists():
        say(f"      done before: {f.relative_to(ROOT)}")
        return
    walk = read(WEB / "data" / "walkgraph.json")["buildings"].get(bid)
    outline = [x for x in (osm or (walk or {}).get("osm", "")).split(",") if x]
    if not outline:
        raise SystemExit(f"      the walk graph has no OSM outline for {bid}. Find the building on openstreetmap.org and run again with\n"
                         f"      --osm way/<id>   (several parts: --osm way/1,way/2). Or run tools/build_walk_graph.py first.")
    crawl = read(f.parent / "rooms.json")
    plan_room = {}
    for r in sorted(crawl["rooms"], key=lambda r: (not r["listed"], r["id"])):    # a public room first: its plan is reliable
        plan_room.setdefault(r["floor"], r["id"])
    src = {
        "building": bid,
        "name": info["name"],
        "note": "Draft made by tools/run_building.py. Corridors still to trace; not verified on site.",
        "osm_outline": outline if len(outline) > 1 else outline[0],
        "plan_room": dict(sorted(plan_room.items())),
    }
    write(f, src)
    say(f"      wrote {f.relative_to(ROOT)}: floors {', '.join(src['plan_room'])}, outline {', '.join(outline)}")


def step_fit(bid, refit, debug):
    f = ROOT / "data" / "indoor" / bid / "source.json"
    step(3, "fit", "lay the floor plans onto the OpenStreetMap building outline")
    src = read(f)
    if "georef" in src and "levels" in src and not refit:
        say("      done before: georef and levels are in source.json. --refit to repeat")
        return
    out = run([TOOLS / "build_indoor.py", "fit", bid, "--coarse"], capture=True)
    georef, levels = None, {"000": {"s": 1.0, "dx": 0, "dy": 0}}
    for line in out.splitlines():
        line = line.strip()
        if not line.startswith("{"):
            continue
        d = json.loads(line)
        if "georef" in d:
            georef = d["georef"]
        else:
            levels.update(d)
    if not georef:
        raise SystemExit("      the fit found no result. Check the OSM outline (--osm) of the building.")
    src["georef"], src["levels"] = georef, dict(sorted(levels.items()))
    write(f, src)
    say(f"      wrote georef and {len(levels)} floor(s) to source.json. LOOK at the overlay before you trust it (--debug)")


def has_corridors(src):
    return any(src.get(k, {}).get(code) for k in ("corridors", "auto_corridors") for code in src["levels"])


def step_corridors(bid, reauto, debug):
    step(4, "corridors", "find corridors, stairs and lifts on the plans (automatic)")
    f = ROOT / "data" / "indoor" / bid / "source.json"
    src = read(f)
    if has_corridors(src) and not reauto:
        n = sum(len(v) for k in ("corridors", "auto_corridors") for v in src.get(k, {}).values())
        c = len(src.get("connectors", [])) + len(src.get("auto_connectors", []))
        say(f"      done before: {n} corridor line(s), {c} stair/lift connector(s) in source.json. --reauto to repeat")
        return
    run([TOOLS / "auto_corridors.py", bid, *(["--debug"] if debug else [])])
    if not has_corridors(read(f)):
        raise SystemExit("      no corridors found. Is the fit right? Run with --refit --debug and look at data/raw/fit_<b>.png")


def step_build(bid, debug):
    step(5, "build", "turn plans + corridors into the routing graph")
    run([TOOLS / "build_indoor.py", "build", bid, *(["--debug"] if debug else [])])


def step_entrances(bid, debug):
    step(6, "entrances", "refresh the walk graph so outdoor and indoor graph share the same doors")
    run([TOOLS / "build_walk_graph.py"])
    run([TOOLS / "build_indoor.py", "build", bid, *(["--debug"] if debug else [])])


def step_coverage():
    step(7, "coverage", "update docs/COVERAGE.md")
    run([TOOLS / "coverage.py"])


def report(bid):
    step(8, "report", f"results for building {bid}")
    base = ROOT / "data" / "indoor" / bid
    crawl = read(base / "rooms.json") if (base / "rooms.json").exists() else None
    rep = read(base / "build_report.json") if (base / "build_report.json").exists() else None
    src = read(base / "source.json") if (base / "source.json").exists() else {}
    if not crawl:
        say("      no rooms crawled yet.")
        return
    total = len(crawl["rooms"])
    listed = sum(r["listed"] for r in crawl["rooms"])
    say(f"      building        {bid} {src.get('name', '')}")
    say(f"      rooms found     {total}  (public on Rauminfo: {listed})")
    say(f"      floors          crawled {', '.join(crawl['floors'])}; mapped {', '.join(src.get('levels', {})) or '-'}; "
        f"verified on site {', '.join(src.get('verified', {})) or '-'}")
    if not rep:
        say("      routable        0   (no indoor graph yet)")
        return
    bad = rep["unrouted"]
    say(f"      routable        {rep['routable']} of {rep['total']}  ({rep['routable'] / max(1, rep['total']):.0%})   built {rep['generated']}")
    reasons = {}
    for rid, why in bad.items():
        reasons.setdefault(why, []).append(rid)
    for why, ids in sorted(reasons.items(), key=lambda kv: -len(kv[1])):
        say(f"      not routable    {len(ids):>3} × {why}: {', '.join(sorted(ids)[:6])}{' …' if len(ids) > 6 else ''}")
    ok = next((r["id"] for r in crawl["rooms"] if r["id"] not in bad), None)
    say(f"      indoor file     web/data/indoor/{bid}.json")
    say(f"      try it          http://localhost:8000/#to={ok}   (python3 tools/run_building.py --serve)" if ok else "")


def layer():
    """The buildings with an indoor map as a GIS layer: one polygon (map frame of all room outlines) per building.

    Reads only generated files, so it needs no network. The web app draws the same frames as its
    "Mapped buildings" layer (web/data/indoor/frames.json)."""
    names = {b["id"]: b for b in read(WEB / "data" / "buildings.json")}
    frames = read(WEB / "data" / "indoor" / "frames.json")
    features = []
    say(f"{'building':<10}{'name':<34}{'rooms':>6}{'routable':>10}  floors")
    for bid, (s, w, n, e) in sorted(frames.items()):
        base = ROOT / "data" / "indoor" / bid
        rep = read(base / "build_report.json") if (base / "build_report.json").exists() else {}
        app = read(WEB / "data" / "indoor" / f"{bid}.json")
        floors = [lv["code"] for lv in sorted(app["levels"].values(), key=lambda lv: lv["code"])]
        name = names.get(bid, {}).get("name", "")
        say(f"{bid:<10}{name[:32]:<34}{rep.get('total', '-'):>6}{rep.get('routable', '-'):>10}  {', '.join(floors)}")
        features.append({"type": "Feature",
                         "properties": {"building": bid, "name": name, "rooms": rep.get("total"), "routable": rep.get("routable"),
                                        "floors": ", ".join(floors), "approximate": app["approximate"], "built": app.get("generated")},
                         "geometry": {"type": "Polygon", "coordinates": [[[w, s], [e, s], [e, n], [w, n], [w, s]]]}})
    out = ROOT / "data" / "indoor" / "indexed_buildings.geojson"
    out.write_text(json.dumps({"type": "FeatureCollection", "features": features}, ensure_ascii=False, indent=1) + "\n", encoding="utf-8")
    say(f"\n{len(features)} buildings -> {out.relative_to(ROOT)} (WGS84)")


def serve(port=8000):
    handler = functools.partial(http.server.SimpleHTTPRequestHandler, directory=str(WEB))
    say(f"web app: http://localhost:{port}/   (Ctrl+C to stop)")
    say("note: a service worker caches the app; after changes use a private window or DevTools > Application > Unregister")
    try:
        http.server.ThreadingHTTPServer(("127.0.0.1", port), handler).serve_forever()
    except KeyboardInterrupt:
        say("\nstopped")


def process(bid, a):
    say(f"\n{'═' * 70}\n building {bid}\n{'═' * 70}")
    if a.report:
        report(bid)
        return
    check_dependencies()
    info = building_info(bid)
    say(f" {info['name']}, {info.get('street') or ''} {info.get('house_number') or ''}")
    step_rooms(bid, a.recrawl)
    step_source(bid, info, a.osm)
    step_fit(bid, a.refit, a.debug)
    step_corridors(bid, a.reauto, a.debug)
    step_build(bid, a.debug)
    step_entrances(bid, a.debug)
    step_coverage()
    report(bid)


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("buildings", nargs="*", metavar="building", help="building number, e.g. 3101")
    ap.add_argument("--report", action="store_true", help="only show current results (no network)")
    ap.add_argument("--debug", action="store_true", help="write overlay PNGs to data/raw/")
    ap.add_argument("--recrawl", action="store_true", help="crawl the rooms again")
    ap.add_argument("--refit", action="store_true", help="fit the georeference again")
    ap.add_argument("--reauto", action="store_true", help="find corridors, stairs and lifts again")
    ap.add_argument("--osm", help="OSM outline(s) of the building, e.g. way/123,way/456")
    ap.add_argument("--layer", action="store_true", help="list the indexed buildings and write the GeoJSON layer")
    ap.add_argument("--serve", action="store_true", help="serve the web app on http://localhost:8000")
    ap.add_argument("--port", type=int, default=8000)
    a = ap.parse_args()
    if a.layer:
        layer()
        if not a.buildings and not a.serve:
            return
    if a.serve and not a.buildings:
        return serve(a.port)
    if not a.buildings:
        ap.error("give a building number, e.g.  python3 tools/run_building.py 3101")
    for bid in a.buildings:
        process(bid, a)
    if a.serve:
        serve(a.port)


if __name__ == "__main__":
    main()
