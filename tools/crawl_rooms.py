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

from build_indoor import Georef, level_num

ROOT = Path(__file__).resolve().parent.parent
RAW = ROOT / "data" / "raw"
CAFM = "https://info.cafm.uni-hannover.de"
USER_AGENT = "LUH-Indoor-GIS-Navi/0.1 (+https://github.com/FreeXYZ-HalfPI/LUH-Indoor-GIS-Navi)"

ROOM_RE = re.compile(r'href="/de/room/([^"]+)"')
LABEL_RE = re.compile(r"^([A-Z]*)(\d+)([A-Z]*)$")
SUFFIXES = "ABCDEFGHIJ"
FLOOR_NAMES = {"Untergeschoss": "U", "Erdgeschoss": "000"}


def retry(fn, tries=5):
    """Run fn(); on network errors wait 5, 10, 20, 40 s and try again."""
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
        time.sleep(5 * 2 ** i)


def get(url):
    def once():
        req = urllib.request.Request(url, headers={"User-Agent": USER_AGENT})
        with urllib.request.urlopen(req, timeout=30) as r:
            return r.read()
    return retry(once)


def exists(url):
    def once():
        req = urllib.request.Request(url, method="HEAD", headers={"User-Agent": USER_AGENT})
        try:
            with urllib.request.urlopen(req, timeout=30) as r:
                return r.headers.get_content_type() == "image/png"
        except urllib.error.HTTPError as e:
            if e.code == 404:
                return False
            raise
    return retry(once)


def page_details(html):
    """Area, room type and floor name from a room page (Rauminfo shows them as label/value rows)."""
    text = re.sub(r"(?s)<(script|style)[^>]*>.*?</\1>", "", html)
    text = [t.strip() for t in re.sub(r"<[^>]+>", "\n", text).split("\n")]
    text = [t for t in text if t]
    out = {}
    for i, t in enumerate(text[:-1]):
        if t == "Raumart":
            out["type"] = text[i + 1]
        elif t == "(m²)":
            try:
                out["area_m2"] = float(text[i + 1])
            except ValueError:
                pass
        elif t == "Lageplan":
            out["floor_name"] = text[i + 1]
    return out


def highlight(path):
    """Red room fill on a plan: centroid, a pixel inside the room near it, bbox, convex hull (image pixels)."""
    a = np.asarray(Image.open(path).convert("RGB")).astype(int)
    red = (a[:, :, 0] > 200) & (a[:, :, 1] < 60) & (a[:, :, 2] < 60)
    ys, xs = np.nonzero(red)
    if not len(xs):
        return None
    cx, cy = xs.mean(), ys.mean()
    i = np.argmin((xs - cx) ** 2 + (ys - cy) ** 2)   # centroid of an L-shaped room may lie outside it
    return {
        "point": [int(xs[i]), int(ys[i])],
        "bbox": [int(xs.min()), int(ys.min()), int(xs.max()), int(ys.max())],
        "outline": hull(np.stack([xs, ys], 1)),
        "pixels": int(len(xs)),
    }, red


def hull(p):
    """Convex hull (monotone chain) of integer points, as [[x, y], …]."""
    p = sorted(set(map(tuple, p.tolist())))
    if len(p) < 3:
        return [list(q) for q in p]

    def half(pts):
        h = []
        for q in pts:
            while len(h) >= 2 and (h[-1][0] - h[-2][0]) * (q[1] - h[-2][1]) - (h[-1][1] - h[-2][1]) * (q[0] - h[-2][0]) <= 0:
                h.pop()
            h.append(q)
        return h[:-1]

    return [list(q) for q in half(p) + half(p[::-1])]


class Cache:
    """data/raw/probe_<b>.json: room id → True/False, saved as we go."""

    def __init__(self, bid, refresh):
        self.path = RAW / f"probe_{bid}.json"
        self.d = {} if refresh or not self.path.exists() else json.loads(self.path.read_text(encoding="utf-8"))
        self.n = 0

    def check(self, rid, delay):
        if rid not in self.d:
            self.d[rid] = exists(f"{CAFM}/images/room/floorplan/{rid}")
            self.n += 1
            if self.n % 50 == 0:
                self.save()
                print(f"    … {self.n} probes", file=sys.stderr)
            time.sleep(delay)
        return self.d[rid]

    def save(self):
        self.path.parent.mkdir(parents=True, exist_ok=True)
        self.path.write_text(json.dumps(self.d, sort_keys=True), encoding="utf-8")


def floor_digit(code):
    return abs(level_num(code)) % 10


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
    if args.extra and len(args.buildings) > 1:
        ap.error("--extra needs a single building")
    for target in args.buildings:
        crawl(target, args)


def crawl(target, args):
    m = re.search(r"building/([^/]+)", target)
    bid = m.group(1) if m else target.strip()
    out_dir = ROOT / "data" / "indoor" / bid
    out_file = out_dir / "rooms.json"
    previous = json.loads(out_file.read_text(encoding="utf-8")) if out_file.exists() else {}
    cache = Cache(bid, args.refresh)
    atexit.register(cache.save)                    # keep the probes even if the run stops (Ctrl+C, network)

    # 1. public list
    listed = sorted(set(ROOM_RE.findall(get(f"{CAFM}/de/building/{bid}/rooms").decode("utf-8"))))
    if not listed:
        print(f"{bid}: no rooms listed – check the id/URL", file=sys.stderr)
        return
    print(f"{bid}: {len(listed)} rooms in the public list", file=sys.stderr)
    for rid in listed:
        cache.d[rid] = True

    parsed = [(r.split(".")[1], LABEL_RE.match(r.split(".")[2])) for r in listed]
    seed_floors = sorted({f for f, _ in parsed}, key=level_num)
    wings = args.wings.split(",") if args.wings else sorted({m.group(1) for _, m in parsed if m})
    width = max((len(m.group(2)) for _, m in parsed if m), default=3)

    # 2. candidates
    def candidates(code):
        base = floor_digit(code) * 10 ** (width - 1)
        for w in wings:
            for n in range(base, base + 10 ** (width - 1)):
                yield f"{w}{n:0{width}d}"

    def scan(code, suffixes=True):
        found = []
        for num in candidates(code):
            if cache.check(f"{bid}.{code}.{num}", args.delay):
                found.append(num)
            if not suffixes:
                continue
            for s in SUFFIXES:                     # A, B, … while they exist (B063A exists without B063)
                if not cache.check(f"{bid}.{code}.{num}{s}", args.delay):
                    break
                found.append(num + s)
            if cache.check(f"{bid}.{code}.{num}Z", args.delay):
                found.append(num + "Z")
        return found

    if args.floors:
        floors = args.floors.split(",")
    else:
        floors = list(seed_floors)
        lo, hi = level_num(seed_floors[0]), level_num(seed_floors[-1])
        for lvl in (lo - 1, hi + 1):               # floors without a public room, base numbers only
            code = f"U{-lvl:02d}" if lvl < 0 else f"{lvl:03d}"
            if code in floors:
                continue
            print(f"  looking for floor {code} …", file=sys.stderr)
            if any(cache.check(f"{bid}.{code}.{num}", args.delay) for num in candidates(code)):
                floors.append(code)
        floors.sort(key=level_num)

    rooms = set(listed)
    for code in floors:
        print(f"  scanning floor {code} (wings {','.join(wings) or '-'}) …", file=sys.stderr)
        found = scan(code)
        rooms |= {f"{bid}.{code}.{num}" for num in found}
        print(f"  floor {code}: {len(found)} rooms", file=sys.stderr)

    extras = set(previous.get("extra", []))
    for e in filter(None, (x.strip().upper() for x in args.extra.split(","))):
        if e.count(".") == 2:
            extras.add(e)
            continue
        hit = [f"{bid}.{code}.{e}" for code in floors if cache.check(f"{bid}.{code}.{e}", args.delay)]
        if not hit:                                # a bare number is tried on every floor
            print(f"  warning: --extra {e} not found on floors {','.join(floors)}", file=sys.stderr)
        extras |= set(hit)
    for rid in sorted(extras):
        if cache.check(rid, args.delay):
            rooms.add(rid)
        else:
            print(f"  warning: extra room {rid} has no plan, dropped", file=sys.stderr)
    cache.save()

    # 3. details and positions
    src_file = out_dir / "source.json"
    src = json.loads(src_file.read_text(encoding="utf-8")) if src_file.exists() else {}
    geo = Georef(src["georef"]) if "georef" in src else None
    plans = RAW / "floorplans"
    plans.mkdir(parents=True, exist_ok=True)
    old = {r["id"]: r for r in previous.get("rooms", [])}

    result, masks = [], {}
    for rid in sorted(rooms, key=lambda r: (level_num(r.split(".")[1]), r)):
        code, num = rid.split(".")[1:]
        png = plans / f"{rid}.png"
        if not png.exists() or args.refresh:
            data = get(f"{CAFM}/images/room/floorplan/{rid}")
            if not data.startswith(b"\x89PNG"):
                print(f"  warning: {rid}: no plan image", file=sys.stderr)
                continue
            png.write_bytes(data)
            time.sleep(args.delay)
        room = {"id": rid, "floor": code, "level": level_num(code), "number": num,
                "wing": (LABEL_RE.match(num).group(1) if LABEL_RE.match(num) else "") or None,
                "listed": rid in listed}
        if rid in listed:
            if rid in old and "type" in old[rid] and not args.refresh:
                room.update({k: old[rid][k] for k in ("type", "area_m2", "floor_name") if k in old[rid]})
            else:
                room.update(page_details(get(f"{CAFM}/de/room/{rid}").decode("utf-8")))
                time.sleep(args.delay)
        h = highlight(png)
        if h is None:
            print(f"  warning: {rid}: no red highlight on its plan", file=sys.stderr)
            room["image"] = None
        else:
            room["image"], red = h
            masks.setdefault(code, []).append(red)
            reg = src.get("levels", {}).get(code)
            if geo and reg:
                to_plan = lambda x, y: (x * reg["s"] + reg["dx"], y * reg["s"] + reg["dy"])
                lat, lon = geo.to_latlon(*to_plan(*room["image"]["point"]))
                room["lat"], room["lon"] = round(lat, 7), round(lon, 7)
                room["outline_lonlat"] = [[round(v, 7) for v in reversed(geo.to_latlon(*to_plan(x, y)))]
                                          for x, y in room["image"]["outline"]]
        result.append(room)

    out = {
        "building": bid,
        "source": f"{CAFM}/de/building/{bid}/rooms",
        "crawled": previous["crawled"] if previous and not cache.n else time.strftime("%Y-%m-%d"),   # cache-only re-run
        "attribution": "Room numbers and floor plans © Leibniz Universität Hannover (Rauminfo/CAFM)",
        "floors": floors,
        "wings": wings,
        "extra": sorted(extras),
        "counts": {"listed": len(listed), "total": len(result),
                   "per_floor": {c: sum(r["floor"] == c for r in result) for c in floors}},
        "rooms": result,
    }
    out_dir.mkdir(parents=True, exist_ok=True)
    out_file.write_text(json.dumps(out, ensure_ascii=False, indent=1), encoding="utf-8")

    feats = []
    for r in result:
        if "lat" not in r:
            continue
        props = {k: r[k] for k in ("id", "level", "listed", "type", "area_m2") if k in r}
        feats.append({"type": "Feature", "properties": props, "geometry": {"type": "Point", "coordinates": [r["lon"], r["lat"]]}})
        if len(r["outline_lonlat"]) >= 3:
            feats.append({"type": "Feature", "properties": props,
                          "geometry": {"type": "Polygon", "coordinates": [r["outline_lonlat"] + r["outline_lonlat"][:1]]}})
    if feats:
        (out_dir / "rooms.geojson").write_text(json.dumps({"type": "FeatureCollection", "features": feats}), encoding="utf-8")

    # the app's room list
    app_rooms_file = ROOT / "web" / "data" / "rooms.json"
    app_rooms = json.loads(app_rooms_file.read_text(encoding="utf-8")) if app_rooms_file.exists() else {}
    app_rooms[bid] = sorted(set(app_rooms.get(bid, [])) | {r["id"] for r in result})
    app_rooms_file.write_text(json.dumps(app_rooms, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")

    # coverage check images
    for code, ms in masks.items():
        base = next(p for p in (plans / f"{r['id']}.png" for r in result if r["floor"] == code))
        a = np.asarray(Image.open(base).convert("RGB")).copy()
        a[np.any(ms, axis=0)] = (255, 170, 0)
        Image.fromarray(a).save(RAW / f"rooms_{bid}_{code}.png")

    print(f"{bid}: {len(result)} rooms ({len(listed)} public) on floors {','.join(floors)} → "
          f"{out_file.relative_to(ROOT)}; {cache.n} new probes", file=sys.stderr)
    print(f"  check the coverage images data/raw/rooms_{bid}_<floor>.png: rooms left white were missed "
          f"(add them with --extra)", file=sys.stderr)


if __name__ == "__main__":
    main()
