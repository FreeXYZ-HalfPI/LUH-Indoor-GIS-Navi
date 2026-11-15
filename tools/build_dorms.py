#!/usr/bin/env python3
# SPDX-License-Identifier: GPL-3.0-or-later
"""Student dorms of the Studentenwerk Hannover as places: "from the dorm in the Dorotheenstraße to A260".

  build_dorms.py             read the dorm pages and geocode (cached in data/raw/dorms/), write web/data/dorms.json
  build_dorms.py --refresh   ignore the caches

1. The list of houses is read from https://www.studentenwerk-hannover.de/wohnen/wohnhaeuser.
2. Each house's detail page gives the street, number, postcode and city of the house. Only that address is
   kept: the pages also name staff with phone numbers, which this tool never stores.
3. The address is geocoded with Nominatim (OpenStreetMap, at most one request per second, cached).
   data/dorms_overrides.json can correct a position or an address by hand ({"id": {"lat": .., "lon": ..}}).
4. The position is snapped to the walk graph (web/data/walkgraph.json) when a walkable node is within
   SNAP_MAX_M, and the campus cluster of the nearest LUH building is recorded. A dorm off the walk graph
   has no node: the app then treats it like a station, ride to a stop near the goal and walk from there.

Writes web/data/dorms.json: {dorms: [{id, name, street, zip, city, lat, lon, node, cluster, url}]}.
Standard library only. Addresses: Studentenwerk Hannover (public pages); positions: © OpenStreetMap
contributors, ODbL.
"""
import argparse
import html
import json
import re
import sys
import time
import urllib.parse
import urllib.request
from pathlib import Path

from build_stops import slug, snap
from build_walk_graph import OUT, RAW, dist

ROOT = Path(__file__).resolve().parent.parent
BASE = "https://www.studentenwerk-hannover.de"
LIST_URL = f"{BASE}/wohnen/wohnhaeuser"
NOMINATIM = "https://nominatim.openstreetmap.org/search"
USER_AGENT = "LUH-Indoor-GIS-Navi/0.1 (+https://github.com/FreeXYZ-HalfPI/LUH-Indoor-GIS-Navi)"
CACHE = RAW / "dorms"
OVERRIDES = ROOT / "data" / "dorms_overrides.json"
SNAP_MAX_M = 250     # a dorm farther than this from any walkable node is "off the graph" (the point is the middle of a big house)
VIEWBOX = "9.55,52.45,9.90,52.30"   # left,top,right,bottom: Hannover and Garbsen; stops a street name from matching another town
DELAY = 1.1          # Nominatim allows one request per second; the dorm pages get the same pause

ZIP_RE = re.compile(r"^(\d{5}) (.+)$")


def get(url, name, refresh):
    """A page as text, cached in data/raw/dorms/<name>."""
    path = CACHE / name
    if path.exists() and not refresh:
        return path.read_text(encoding="utf-8")
    req = urllib.request.Request(url, headers={"User-Agent": USER_AGENT})
    with urllib.request.urlopen(req, timeout=60) as r:
        text = r.read().decode("utf-8")
    CACHE.mkdir(parents=True, exist_ok=True)
    path.write_text(text, encoding="utf-8")
    time.sleep(DELAY)
    return text


def text_lines(page):
    """The visible lines of an HTML page (scripts and styles removed)."""
    page = re.sub(r"<script.*?</script>|<style.*?</style>", "", page, flags=re.S)
    page = html.unescape(re.sub(r"<[^>]+>", "\n", page))
    return [l.strip() for l in page.split("\n") if l.strip()]


def house_links(list_html):
    """[(name, detail path)] of the houses on the overview page, in page order, without duplicates."""
    out, seen = [], set()
    for path, name in re.findall(r'href="(/wohnen/wohnhaeuser/detailansicht/[^"]+)"[^>]*>(.*?)</a>', list_html, flags=re.S):
        name = html.unescape(re.sub(r"<[^>]+>", "", name)).strip()
        if path not in seen and name:
            seen.add(path)
            out.append((name, path))
    return out


def parse_address(lines, name):
    """(streets, zip, city) of a house from its detail page.

    Under its title the page prints the house: street lines, then "30419 Hannover", before the heading
    "Informationen" (a house named after its street has the street in the title). Some pages print the
    house manager's block in between; only the street lines right above the postcode are used. The
    staff contacts further down have other addresses and are never read."""
    if "Informationen" not in lines:
        return None
    end = lines.index("Informationen")
    start = max((i for i, l in enumerate(lines[:end]) if l in ("Zurück zur Auswahl", "Wohnheime")), default=-1)
    zi = next((i for i in range(start + 1, end) if ZIP_RE.match(lines[i])), None)
    if zi is None:
        return None
    m = ZIP_RE.match(lines[zi])
    streets, j = [], zi - 1
    while j > start and re.search(r"\d", lines[j]):          # street lines have a house number
        streets.insert(0, lines[j])
        j -= 1
    streets = [x for k, x in enumerate(streets) if k == 0 or x != streets[k - 1]]   # a title printed twice
    return (streets or [name]), m.group(1), m.group(2)


def first_house_number(street):
    """One street and number for the geocoder: "Dorotheenstraße 5A und 5B", "Nobelring 10 + 12",
    "Marie-Curie-Straße 1 - 3", "Hufelandstraße 16/16A" → the first house."""
    return re.split(r"\s+(?:und|\+|&)\s+|\s+[-–]\s+|(?<=\d)\s*/|\s*\(|\s*,", street)[0].strip()


def geocode(street, zip_, city, cache, refresh):
    street = first_house_number(street)
    key = f"{street}, {zip_} {city}"
    if key in cache and not refresh:
        return cache[key]
    params = urllib.parse.urlencode({"street": street, "postalcode": zip_, "city": city, "country": "Germany", "viewbox": VIEWBOX, "bounded": 1, "format": "jsonv2", "limit": 1})
    req = urllib.request.Request(f"{NOMINATIM}?{params}", headers={"User-Agent": USER_AGENT})
    with urllib.request.urlopen(req, timeout=60) as r:
        res = json.loads(r.read().decode("utf-8"))
    time.sleep(DELAY)
    cache[key] = {"lat": float(res[0]["lat"]), "lon": float(res[0]["lon"])} if res else None
    return cache[key]


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--refresh", action="store_true", help="ignore the cached pages and geocoding")
    args = ap.parse_args()

    walk = json.loads((OUT / "walkgraph.json").read_text(encoding="utf-8"))
    nodes = walk["nodes"]
    buildings = json.loads((OUT / "buildings.json").read_text(encoding="utf-8"))
    clusters = {b["id"]: walk["buildings"][b["id"]]["cluster"] for b in buildings if b["id"] in walk["buildings"]}
    overrides = json.loads(OVERRIDES.read_text(encoding="utf-8")) if OVERRIDES.exists() else {}
    geo_path = CACHE / "geocode.json"
    geo = json.loads(geo_path.read_text(encoding="utf-8")) if geo_path.exists() else {}

    houses = house_links(get(LIST_URL, "list.html", args.refresh))
    print(f"{len(houses)} houses on the overview page", file=sys.stderr)
    dorms, used = [], {}
    for name, path in houses:
        if overrides.get(slug(name), {}).get("skip"):
            print(f"  {slug(name)}: skipped ({overrides[slug(name)].get('why')})", file=sys.stderr)
            continue
        lines = text_lines(get(BASE + path, f"{slug(name)}.html", args.refresh))
        addr = parse_address(lines, name)
        if not addr:
            print(f"  {name}: no address found, skipped", file=sys.stderr)
            continue
        streets, zip_, city = addr
        street = " · ".join(streets)    # several entrances: "Morwegsgasse 27 (Haus A+B) · Lodyweg 2 (Haus C)"
        sid = slug(name)
        used[sid] = used.get(sid, 0) + 1
        if used[sid] > 1:
            sid = f"{sid}-{used[sid]}"
        o = overrides.get(sid, {})
        if o.get("skip"):
            print(f"  {sid}: skipped ({o.get('why', 'see data/dorms_overrides.json')})", file=sys.stderr)
            continue
        street = o.get("street", street)
        pos = {"lat": o["lat"], "lon": o["lon"]} if "lat" in o else geocode(streets[0], o.get("zip", zip_), o.get("city", city), geo, args.refresh)
        geo_path.write_text(json.dumps(geo, ensure_ascii=False, indent=1), encoding="utf-8")
        if not pos:
            print(f"  {name} ({street}, {zip_} {city}): not found by the geocoder, skipped (add it to data/dorms_overrides.json)", file=sys.stderr)
            continue
        point = (pos["lat"], pos["lon"])
        node, d = snap(nodes, point)
        near = min(buildings, key=lambda b: dist(point, (b["lat"], b["lon"])))
        dorms.append({
            "id": sid, "name": name, "street": street, "zip": zip_, "city": city,
            "lat": round(pos["lat"], 6), "lon": round(pos["lon"], 6),
            "node": node if node is not None and d <= SNAP_MAX_M else None,
            "cluster": clusters.get(near["id"]),
            "url": BASE + path,
        })
        far = round(dist(point, (52.3826, 9.7175)) / 1000, 1)
        if far > 12:
            print(f"  WARNING {sid}: {far} km from the campus, the geocoder may have found another street. Check and add a position to data/dorms_overrides.json", file=sys.stderr)
        print(f"  {sid}: {street}, {zip_} {city} → {pos['lat']:.5f},{pos['lon']:.5f}  {'on graph' if dorms[-1]['node'] is not None else 'off graph'}, {far} km from Welfengarten", file=sys.stderr)

    out = {
        "attribution": "Houses and addresses: Studentenwerk Hannover (public pages). Positions © OpenStreetMap contributors (ODbL).",
        "generated": time.strftime("%Y-%m-%d"),
        "dorms": dorms,
    }
    (OUT / "dorms.json").write_text(json.dumps(out, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    on = sum(1 for d in dorms if d["node"] is not None)
    print(f"{len(dorms)} dorms, {on} on the walk graph, {len(dorms) - on} off it", file=sys.stderr)


if __name__ == "__main__":
    main()
