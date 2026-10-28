#!/usr/bin/env python3
# SPDX-License-Identifier: GPL-3.0-or-later
"""Find every room of one LUH building and where it is, from the public
Rauminfo (CAFM) floor plans.

  crawl_rooms.py 3101
  crawl_rooms.py https://info.cafm.uni-hannover.de/de/building/3101/rooms
  crawl_rooms.py 3101 --extra A61A,B099      odd room numbers read off the plan
  crawl_rooms.py 1101 3101 3110              several buildings, one after the other

Rauminfo lists only some rooms of a building (lecture and seminar rooms), but
every floor plan prints the numbers of all rooms, and the plan image of any
room (with that room filled in red) is served at /images/room/floorplan/<id>.
So the crawler

  1. reads the public room list (seeds: floors, wing letters, page details),
  2. guesses candidate numbers per floor and wing (A000–A099 on the ground
     floor, A100–A199 on the first, …, each also with suffixes A, B, … and Z),
  3. keeps the candidates that have a plan image (HEAD request),
  4. takes each room's position from its red highlight.

Writes:
  data/indoor/<b>/rooms.json   all rooms with floor, position (plan pixels and,
                               if source.json has a georef, WGS84) and outline
  data/indoor/<b>/rooms.geojson  the same as points/polygons, for QGIS
  web/data/rooms.json          the building's room list, so the app finds them
  data/raw/rooms_<b>_<floor>.png  coverage check: every found room painted in;
                               rooms still white on the plan were missed → --extra

Probe results are cached in data/raw/, so an interrupted run resumes and a
re-run is quick (--refresh to start over). Needs Pillow and numpy.
"""
import argparse
import atexit
import json
import re
import sys
import time
import urllib.error
import urllib.request
from pathlib import Path

import numpy as np
from PIL import Image

# Shared with the builder, so both tools read plans and floor codes the same way.
from build_indoor import Georef, image_to_plan, level_num, point_in_red, read_json, red_mask

ROOT = Path(__file__).resolve().parent.parent
RAW = ROOT / "data" / "raw"
PLANS = RAW / "floorplans"
APP_ROOMS = ROOT / "web" / "data" / "rooms.json"
CAFM = "https://info.cafm.uni-hannover.de"
# Identify the tool and give a contact, so the university can see who crawls and why.
USER_AGENT = "LUH-Indoor-GIS-Navi/0.1 (+https://github.com/FreeXYZ-HalfPI/LUH-Indoor-GIS-Navi)"

ROOM_RE = re.compile(r'href="/de/room/([^"]+)"')      # room links on a building's room list
# A room number: optional wing letters, digits, optional suffix letters
# ("A020" → A/020/"", "B063A" → B/063/A, "011I" → ""/011/I).
LABEL_RE = re.compile(r"^([A-Z]*)(\d+)([A-Z]*)$")
# Suffixes split a room (B063A, B063B, …). They are tried in order and the
# search stops at the first gap; ten letters were always enough on LUH plans.
SUFFIXES = "ABCDEFGHIJ"
# "Z" rooms are side rooms that exist without the letters in between,
# so they get a probe of their own.
SIDE_ROOM = "Z"


# ---------------------------------------------------------------- network

def retry(fn, tries=5):
    """Run fn(); on network errors wait 5, 10, 20, 40 s and try again.

    A crawl of a big building makes thousands of requests; one dropped
    connection must not end it. Client errors (4xx) are real answers and
    are not retried."""
    for i in range(tries):
        try:
            return fn()
        except urllib.error.HTTPError as e:
            if e.code < 500 or i == tries - 1:
                raise
        except (urllib.error.URLError, TimeoutError, ConnectionError):
            if i == tries - 1:
                raise
        print(f"    network error, retrying in {5 * 2 ** i} s …", file=sys.stderr)
        time.sleep(5 * 2 ** i)                     # exponential backoff: give a busy server room


def request(url, method="GET"):
    return urllib.request.Request(url, method=method, headers={"User-Agent": USER_AGENT})


def get(url):
    """Body of a GET request, as bytes."""
    def once():
        with urllib.request.urlopen(request(url), timeout=30) as r:
            return r.read()
    return retry(once)


def exists(url):
    """Does `url` serve a PNG? A HEAD request, so no image is downloaded.

    Unknown room ids answer with 404 or redirect to an HTML page, hence
    the content-type check rather than only the status."""
    def once():
        try:
            with urllib.request.urlopen(request(url, "HEAD"), timeout=30) as r:
                return r.headers.get_content_type() == "image/png"
        except urllib.error.HTTPError as e:
            if e.code == 404:
                return False
            raise
    return retry(once)


def plan_url(rid):
    return f"{CAFM}/images/room/floorplan/{rid}"


# ---------------------------------------------------------------- parsing

def building_id(target):
    """"3101" or ".../building/3101/rooms" → "3101"."""
    m = re.search(r"building/([^/]+)", target)
    return m.group(1) if m else target.strip()


def page_details(html):
    """Area, room type and floor name from a room page (Rauminfo shows them as label/value rows).

    The page has no stable ids or classes, so we strip all tags and read the
    text line that follows each label. Scripts are dropped first, because
    they contain the label words too."""
    text = re.sub(r"(?s)<(script|style)[^>]*>.*?</\1>", "", html)
    lines = [t.strip() for t in re.sub(r"<[^>]+>", "\n", text).split("\n")]
    lines = [t for t in lines if t]
    out = {}
    for label, value in zip(lines, lines[1:]):
        if label == "Raumart":
            out["type"] = value
        elif label == "(m²)":                      # the area label is split: "Fläche" / "(m²)" / value
            try:
                out["area_m2"] = float(value)
            except ValueError:
                pass
        elif label == "Lageplan":
            out["floor_name"] = value
    return out


def highlight(path):
    """Red room fill on a plan: a pixel inside the room near its centre, bbox, convex hull (image pixels).

    Returns (info, red mask), or None if the plan has no red fill."""
    red = red_mask(np.asarray(Image.open(path).convert("RGB")).astype(int))
    ys, xs = np.nonzero(red)
    if not len(xs):
        return None
    return {
        "point": list(point_in_red(red)),
        "bbox": [int(xs.min()), int(ys.min()), int(xs.max()), int(ys.max())],
        "outline": hull(np.stack([xs, ys], 1)),    # a hull is small and good enough for a tap target
        "pixels": int(len(xs)),
    }, red


def hull(p):
    """Convex hull (Andrew's monotone chain) of integer points, as [[x, y], …].

    Sort the points, then build the lower and the upper half; a point is
    dropped while it makes a clockwise (or straight) turn."""
    p = sorted(set(map(tuple, p.tolist())))
    if len(p) < 3:
        return [list(q) for q in p]

    def cross(o, a, b):
        return (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0])

    def half(pts):
        h = []
        for q in pts:
            while len(h) >= 2 and cross(h[-2], h[-1], q) <= 0:
                h.pop()
            h.append(q)
        return h[:-1]                              # the last point starts the other half

    return [list(q) for q in half(p) + half(p[::-1])]


def floor_digit(code):
    """The digit room numbers start with on a floor: "003" → 3, "U01" → 1 (A1xx on floor 1)."""
    return abs(level_num(code)) % 10


def floor_code(lvl):
    """Level number → floor code: 2 → "002", -1 → "U01"."""
    return f"U{-lvl:02d}" if lvl < 0 else f"{lvl:03d}"


# ---------------------------------------------------------------- probing

class Cache:
    """data/raw/probe_<b>.json: room id → True/False, saved as we go.

    Most guesses do not exist, and asking the server again for them on every
    run would multiply the load; the cache makes re-runs nearly free."""

    def __init__(self, bid, refresh):
        self.path = RAW / f"probe_{bid}.json"
        self.known = {} if refresh else read_json(self.path, {})
        self.new_probes = 0

    def mark_existing(self, rids):
        """Rooms from the public list exist; no need to probe them."""
        for rid in rids:
            self.known[rid] = True

    def check(self, rid, delay):
        """Does room `rid` exist? Asks the server only the first time."""
        if rid not in self.known:
            self.known[rid] = exists(plan_url(rid))
            self.new_probes += 1
            if self.new_probes % 50 == 0:          # save now and then, and show progress
                self.save()
                print(f"    … {self.new_probes} probes", file=sys.stderr)
            time.sleep(delay)                      # one request at a time, with a pause: be polite
        return self.known[rid]

    def save(self):
        self.path.parent.mkdir(parents=True, exist_ok=True)
        self.path.write_text(json.dumps(self.known, sort_keys=True), encoding="utf-8")


class Scanner:
    """Guesses room numbers on a building's floors and keeps those that exist.

    Rauminfo numbers rooms as <wing><floor digit><two digits>, e.g. A104 is
    room 04 of wing A on floor 1. The public list tells us the wings and how
    many digits a number has, so the guesses stay few."""

    def __init__(self, bid, cache, listed, wings, delay):
        self.bid, self.cache, self.delay = bid, cache, delay
        parsed = [(r.split(".")[1], LABEL_RE.match(r.split(".")[2])) for r in listed]
        self.seed_floors = sorted({f for f, _ in parsed}, key=level_num)
        self.wings = wings.split(",") if wings else sorted({m.group(1) for _, m in parsed if m})
        self.width = max((len(m.group(2)) for _, m in parsed if m), default=3)   # 3 digits: A104

    def has(self, code, number):
        return self.cache.check(f"{self.bid}.{code}.{number}", self.delay)

    def candidates(self, code):
        """Base numbers of every wing on a floor: A100 … A199 on floor 001."""
        span = 10 ** (self.width - 1)
        base = floor_digit(code) * span
        for w in self.wings:
            for n in range(base, base + span):
                yield f"{w}{n:0{self.width}d}"

    def scan_floor(self, code):
        """All room numbers that exist on a floor, with their suffixes."""
        found = []
        for num in self.candidates(code):
            if self.has(code, num):
                found.append(num)
            for s in SUFFIXES:                     # A, B, … while they exist (B063A exists without B063)
                if not self.has(code, num + s):
                    break
                found.append(num + s)
            if self.has(code, num + SIDE_ROOM):
                found.append(num + SIDE_ROOM)
        return found

    def find_floors(self):
        """The floors of the public list, plus the floor below and above if they have rooms.

        Basements and top floors often hold only offices and technical rooms,
        so no public room points at them. Only base numbers are probed there,
        which is enough to tell whether the floor exists at all."""
        floors = list(self.seed_floors)
        lo, hi = level_num(self.seed_floors[0]), level_num(self.seed_floors[-1])
        for lvl in (lo - 1, hi + 1):
            code = floor_code(lvl)
            if code in floors:
                continue
            print(f"  looking for floor {code} …", file=sys.stderr)
            if any(self.has(code, num) for num in self.candidates(code)):
                floors.append(code)
        return sorted(floors, key=level_num)

    def resolve_extras(self, requested, kept, floors):
        """Full ids for the --extra numbers; a bare number is tried on every floor.

        `kept` are the extras of earlier runs (stored in rooms.json), so a
        maintainer does not have to repeat them."""
        extras = set(kept)
        for e in filter(None, (x.strip().upper() for x in requested.split(","))):
            if e.count(".") == 2:                  # already a full id like 3101.000.A61A
                extras.add(e)
                continue
            hits = [f"{self.bid}.{code}.{e}" for code in floors if self.has(code, e)]
            if not hits:
                print(f"  warning: --extra {e} not found on floors {','.join(floors)}", file=sys.stderr)
            extras |= set(hits)
        return extras


# ---------------------------------------------------------------- room records

def download_plan(rid, refresh, delay):
    """The room's plan image in data/raw/floorplans, or None if the server has none."""
    png = PLANS / f"{rid}.png"
    if not png.exists() or refresh:
        data = get(plan_url(rid))
        if not data.startswith(b"\x89PNG"):        # the PNG signature; anything else is an error page
            return None
        png.write_bytes(data)
        time.sleep(delay)
    return png


def room_details(rid, previous, refresh, delay):
    """Type, area and floor name of a public room; taken from the last run when known."""
    if rid in previous and "type" in previous[rid] and not refresh:
        # keep the stored key order, so a re-run does not reshuffle rooms.json
        return {k: v for k, v in previous[rid].items() if k in ("type", "area_m2", "floor_name")}
    details = page_details(get(f"{CAFM}/de/room/{rid}").decode("utf-8"))
    time.sleep(delay)
    return details


def add_coordinates(room, geo, reg):
    """WGS84 point and outline of a room, through the floor's registration and the georef.

    Each floor image has its own scale and offset (`reg`, from
    build_indoor.py fit); the georef is defined on the ground-floor frame."""
    def latlon(x, y):
        lat, lon = geo.to_latlon(*image_to_plan(x, y, reg))
        return round(lat, 7), round(lon, 7)       # 7 decimals ≈ 1 cm: more is noise

    room["lat"], room["lon"] = latlon(*room["image"]["point"])
    room["outline_lonlat"] = [list(reversed(latlon(x, y))) for x, y in room["image"]["outline"]]   # GeoJSON order


def room_record(rid, listed, previous, src, geo, args):
    """Everything we know about one room, plus its red mask (for the coverage image).

    Returns (record, mask); record is None when the server has no plan."""
    code, num = rid.split(".")[1:]
    png = download_plan(rid, args.refresh, args.delay)
    if png is None:
        print(f"  warning: {rid}: no plan image", file=sys.stderr)
        return None, None
    label = LABEL_RE.match(num)
    room = {"id": rid, "floor": code, "level": level_num(code), "number": num,
            "wing": (label.group(1) if label else "") or None,
            "listed": rid in listed}
    if rid in listed:                              # only public rooms have a details page
        room.update(room_details(rid, previous, args.refresh, args.delay))
    h = highlight(png)
    if h is None:
        print(f"  warning: {rid}: no red highlight on its plan", file=sys.stderr)
        room["image"] = None
        return room, None
    room["image"], red = h
    reg = src.get("levels", {}).get(code)
    if geo and reg:                                # only registered floors can be placed on the map
        add_coordinates(room, geo, reg)
    return room, red


# ---------------------------------------------------------------- outputs

def write_geojson(path, rooms):
    """Each placed room as a point and, if it has one, a polygon (GeoJSON rings must be closed)."""
    feats = []
    for r in rooms:
        if "lat" not in r:
            continue
        props = {k: r[k] for k in ("id", "level", "listed", "type", "area_m2") if k in r}
        feats.append({"type": "Feature", "properties": props, "geometry": {"type": "Point", "coordinates": [r["lon"], r["lat"]]}})
        if len(r["outline_lonlat"]) >= 3:
            feats.append({"type": "Feature", "properties": props,
                          "geometry": {"type": "Polygon", "coordinates": [r["outline_lonlat"] + r["outline_lonlat"][:1]]}})
    if feats:
        path.write_text(json.dumps({"type": "FeatureCollection", "features": feats}), encoding="utf-8")


def update_app_rooms(bid, rooms):
    """Add the found rooms to the app's search list (web/data/rooms.json).

    A union, not a replacement: rooms from tools/fetch_luh_data.py stay
    even if a crawl missed them."""
    app_rooms = read_json(APP_ROOMS, {})
    app_rooms[bid] = sorted(set(app_rooms.get(bid, [])) | {r["id"] for r in rooms})
    APP_ROOMS.write_text(json.dumps(app_rooms, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")


def write_coverage_images(bid, rooms, masks):
    """data/raw/rooms_<b>_<floor>.png: one plan per floor with every found room in orange.

    A room left white on it was missed by the guesses; a maintainer can
    read its number off the plan and pass it with --extra."""
    for code, ms in masks.items():
        base = next(PLANS / f"{r['id']}.png" for r in rooms if r["floor"] == code)
        a = np.asarray(Image.open(base).convert("RGB")).copy()
        a[np.any(ms, axis=0)] = (255, 170, 0)
        Image.fromarray(a).save(RAW / f"rooms_{bid}_{code}.png")


# ---------------------------------------------------------------- main

def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("buildings", nargs="+", metavar="building", help="building id (3101) or its Rauminfo URL")
    ap.add_argument("--floors", help="floor codes to scan, e.g. U01,000,001 (default: floors of the public list, "
                                     "plus a quick look at the floor below and above)")
    ap.add_argument("--wings", help="wing letters to scan, e.g. A,B (default: letters of the public list)")
    ap.add_argument("--extra", default="", help="extra room numbers or ids, comma-separated (kept on later runs)")
    ap.add_argument("--delay", type=float, default=0.1, help="pause between requests in seconds (default 0.1)")
    ap.add_argument("--refresh", action="store_true", help="ignore cached probes and plans")
    args = ap.parse_args()
    if args.extra and len(args.buildings) > 1:     # room numbers are only meaningful in one building
        ap.error("--extra needs a single building")
    for target in args.buildings:
        crawl(target, args)


def crawl(target, args):
    bid = building_id(target)
    out_dir = ROOT / "data" / "indoor" / bid
    out_file = out_dir / "rooms.json"
    previous = read_json(out_file, {})
    cache = Cache(bid, args.refresh)
    atexit.register(cache.save)                    # keep the probes even if the run stops (Ctrl+C, network)

    # 1. the public list seeds everything else
    listed = sorted(set(ROOM_RE.findall(get(f"{CAFM}/de/building/{bid}/rooms").decode("utf-8"))))
    if not listed:
        print(f"{bid}: no rooms listed – check the id/URL", file=sys.stderr)
        return
    print(f"{bid}: {len(listed)} rooms in the public list", file=sys.stderr)
    cache.mark_existing(listed)

    # 2. guess and probe room numbers floor by floor
    scanner = Scanner(bid, cache, listed, args.wings, args.delay)
    floors = args.floors.split(",") if args.floors else scanner.find_floors()
    rooms = set(listed)
    for code in floors:
        print(f"  scanning floor {code} (wings {','.join(scanner.wings) or '-'}) …", file=sys.stderr)
        found = scanner.scan_floor(code)
        rooms |= {f"{bid}.{code}.{num}" for num in found}
        print(f"  floor {code}: {len(found)} rooms", file=sys.stderr)

    extras = scanner.resolve_extras(args.extra, previous.get("extra", []), floors)
    for rid in sorted(extras):
        if cache.check(rid, args.delay):
            rooms.add(rid)
        else:
            print(f"  warning: extra room {rid} has no plan, dropped", file=sys.stderr)
    cache.save()

    # 3. details and positions of every room
    src = read_json(out_dir / "source.json", {})
    geo = Georef(src["georef"]) if "georef" in src else None
    PLANS.mkdir(parents=True, exist_ok=True)
    old = {r["id"]: r for r in previous.get("rooms", [])}
    result, masks = [], {}
    for rid in sorted(rooms, key=lambda r: (level_num(r.split(".")[1]), r)):   # floor by floor, bottom up
        room, red = room_record(rid, listed, old, src, geo, args)
        if room is None:
            continue
        if red is not None:
            masks.setdefault(room["floor"], []).append(red)
        result.append(room)

    # 4. write the outputs
    out = {
        "building": bid,
        "source": f"{CAFM}/de/building/{bid}/rooms",
        # a re-run that asked the server nothing new keeps its date, so the file only changes when the data does
        "crawled": previous["crawled"] if previous and not cache.new_probes else time.strftime("%Y-%m-%d"),
        "attribution": "Room numbers and floor plans © Leibniz Universität Hannover (Rauminfo/CAFM)",
        "floors": floors,
        "wings": scanner.wings,
        "extra": sorted(extras),
        "counts": {"listed": len(listed), "total": len(result),
                   "per_floor": {c: sum(r["floor"] == c for r in result) for c in floors}},
        "rooms": result,
    }
    out_dir.mkdir(parents=True, exist_ok=True)
    out_file.write_text(json.dumps(out, ensure_ascii=False, indent=1), encoding="utf-8")   # indent=1: readable diffs
    write_geojson(out_dir / "rooms.geojson", result)
    update_app_rooms(bid, result)
    write_coverage_images(bid, result, masks)

    print(f"{bid}: {len(result)} rooms ({len(listed)} public) on floors {','.join(floors)} → "
          f"{out_file.relative_to(ROOT)}; {cache.new_probes} new probes", file=sys.stderr)
    print(f"  check the coverage images data/raw/rooms_{bid}_<floor>.png: rooms left white were missed "
          f"(add them with --extra)", file=sys.stderr)


if __name__ == "__main__":
    main()
