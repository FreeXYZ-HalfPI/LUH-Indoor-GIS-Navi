#!/usr/bin/env python3
# SPDX-License-Identifier: GPL-3.0-or-later
"""Fetch LUH buildings and rooms from the public Rauminfo (CAFM) pages and
building coordinates from the Standortfinder.

Writes:
  web/data/buildings.json  [{id, name, street, house_number, zip, city, lat, lon}]
  web/data/rooms.json      {building_id: [room_id, ...]}

Responses are cached in data/raw/ so re-runs don't hit the servers again.
Use --refresh to ignore the cache. Only the Python standard library is used.
"""
import argparse
import json
import re
import sys
import time
import urllib.parse
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
RAW = ROOT / "data" / "raw"
OUT = ROOT / "web" / "data"

CAFM = "https://info.cafm.uni-hannover.de"
SOF = "https://standortfinder.uni-hannover.de"
# Identify the tool and give a contact, so the university can see who fetches and why.
USER_AGENT = "LUH-Indoor-GIS-Navi/0.1 (+https://github.com/FreeXYZ-HalfPI/LUH-Indoor-GIS-Navi)"
DELAY_S = 0.5           # pause after each uncached request: ~200 requests must not burden the servers

# A building link on the Rauminfo start page: <a href="/de/building/1101">1101 - Hauptgebäude</a>.
# \1 requires the link text to start with the same id, which skips other links.
BUILDING_RE = re.compile(r'href="/de/building/([^"/]+)">\s*\1\s*(?:-\s*([^<]*?))?\s*</a>', re.S)
ROOM_RE = re.compile(r'href="/de/room/([^"]+)"')     # room links on a building's room list

# One opener with the User-Agent, shared by every request of this tool.
opener = urllib.request.build_opener()
opener.addheaders = [("User-Agent", USER_AGENT)]


def cached(name, fetch, refresh):
    """Text of data/raw/<name>; calls fetch() and stores the result when the file
    is missing or `refresh` is set.

    Caching makes re-runs offline and fast, and a failed run can be
    restarted without asking the servers again for what it already got."""
    path = RAW / name
    if path.exists() and not refresh:
        return path.read_text(encoding="utf-8")
    text = fetch()
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(text, encoding="utf-8")
    time.sleep(DELAY_S)
    return text


def get(url):
    """Body of a GET request, decoded as UTF-8."""
    with opener.open(url, timeout=30) as r:
        return r.read().decode("utf-8")


def sof_search(term):
    """POST to the Standortfinder search endpoint, as its own web page does.

    Standortfinder has no documented API; this is the request its search box
    sends. It answers with JSON that holds the building coordinates."""
    body = urllib.parse.urlencode({"search": term, "page": 0}).encode()
    req = urllib.request.Request(SOF + "/search", data=body, headers={"Referer": SOF + "/de/"})
    with opener.open(req, timeout=30) as r:
        return r.read().decode("utf-8")


def main():
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--refresh", action="store_true", help="ignore cached responses")
    args = ap.parse_args()

    index = cached("cafm_buildings.html", lambda: get(CAFM + "/de/"), args.refresh)
    listed = [(bid, (name or "").strip()) for bid, name in BUILDING_RE.findall(index)]
    print(f"{len(listed)} buildings in Rauminfo", file=sys.stderr)

    buildings, rooms = [], {}
    for i, (bid, name) in enumerate(listed, 1):
        html = cached(f"rooms_{bid}.html", lambda: get(f"{CAFM}/de/building/{bid}/rooms"), args.refresh)
        rooms[bid] = sorted(set(ROOM_RE.findall(html)))   # a set: rooms can be linked twice on a page

        res = json.loads(cached(f"sof_{bid}.json", lambda: sof_search(bid), args.refresh))
        # item_type 2 = a building (the search also returns rooms and institutes)
        hit = next((d for d in res.get("data", []) if d.get("item_type") == 2 and d.get("building_id") == bid), None)
        if hit is None or hit.get("lat") is None:
            print(f"  [{i}] {bid}: no coordinates, skipped", file=sys.stderr)
            continue
        buildings.append({
            "id": bid,
            "name": hit.get("building_name") or name,
            "street": hit.get("street"),
            "house_number": hit.get("house_number"),
            "zip": hit.get("zip_code"),
            "city": hit.get("city"),
            "lat": hit["lat"],
            "lon": hit["lon"],
            "position_ok": bool(hit.get("is_position_correct", True)),
            "barrier_free": bool(hit.get("building_bf")),
        })
        print(f"  [{i}] {bid} {name}: {len(rooms[bid])} rooms", file=sys.stderr)

    override = ROOT / "data" / "buildings_override.json"   # e.g. names missing in the LUH data
    if override.exists():
        fixes = json.loads(override.read_text(encoding="utf-8"))
        for b in buildings:
            b.update(fixes.get(b["id"], {}))

    OUT.mkdir(parents=True, exist_ok=True)
    known = {b["id"] for b in buildings}
    # Rauminfo lists only public rooms; add all rooms found by tools/crawl_rooms.py,
    # so running this tool again never loses them
    for f in (ROOT / "data" / "indoor").glob("*/rooms.json"):
        crawl = json.loads(f.read_text(encoding="utf-8"))
        rooms[crawl["building"]] = sorted(set(rooms.get(crawl["building"], [])) | {r["id"] for r in crawl["rooms"]})
    rooms = {k: v for k, v in rooms.items() if k in known and v}   # only buildings the app can show on the map
    (OUT / "buildings.json").write_text(json.dumps(buildings, ensure_ascii=False, indent=1), encoding="utf-8")
    (OUT / "rooms.json").write_text(json.dumps(rooms, ensure_ascii=False, separators=(",", ":")),   # compact: phones download it
                                    encoding="utf-8")
    print(f"wrote {len(buildings)} buildings, {sum(map(len, rooms.values()))} rooms", file=sys.stderr)


if __name__ == "__main__":
    main()
