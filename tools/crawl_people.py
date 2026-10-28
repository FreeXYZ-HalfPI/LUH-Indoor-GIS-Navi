#!/usr/bin/env python3
# SPDX-License-Identifier: GPL-3.0-or-later
"""Find the office rooms of people from the public LUH web pages, so the app
can route to a person ("Christian Heipke") instead of a room code.

  crawl_people.py              read the pages in data/people_sources.json
  crawl_people.py --refresh    download the pages again

All LUH websites are built with the same CMS, and every person is shown in
the same contact cards or lists: name, role, phone, e-mail, address,
building and room. The room is a link to Rauminfo, e.g.
info.cafm.uni-hannover.de/room/3101/B143, which gives building and room
number without any guessing. The crawler

  1. downloads each listed page (cached in data/raw/people/),
  2. reads name, role, building and room of each person on it,
  3. keeps the cards in buildings with indoor data, and turns the room
     number into a full room id with the crawled room list (B143 → 3101.001.B143).

Writes web/data/people.json. Only name, role, organisation and office room
are stored: no phone numbers and no e-mail addresses, which the app does not
need. Names listed under "exclude" in the sources file are left out.
Only the Python standard library is used.
"""
import argparse
import hashlib
import html
import json
import re
import sys
import time
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SOURCES = ROOT / "data" / "people_sources.json"
CACHE = ROOT / "data" / "raw" / "people"
OUT = ROOT / "web" / "data" / "people.json"
USER_AGENT = "LUH-Indoor-GIS-Navi/0.1 (+https://github.com/FreeXYZ-HalfPI/LUH-Indoor-GIS-Navi)"
DELAY_S = 1.0     # one page per second: the pages are large and come from the university's servers

# Two layouts show people. Contact cards (a person's own page, team pages):
# the name is in c-card--contact__title, the role in the first "misc" line after it.
# Contact lists (staff directories): the name is in <span class="pname">, no role.
TITLE_RE = re.compile(r'class="c-card--contact__title"[^>]*>(.*?)</div>\s*(?:<div class="c-card--contact__misc"[^>]*>(.*?)</div>)?', re.S)
PNAME_RE = re.compile(r'<span class="pname"[^>]*>(.*?)</span>', re.S)
# Rauminfo link of the room: /room/<building>/<room number>, sometimes /room/<full id>
ROOM_LINK_RE = re.compile(r'info\.cafm\.uni-hannover\.de/(?:de/|en/)?room/(\d{4})[/.]([^"/?#]+)"')


def fetch(url, refresh):
    """Page text, cached under data/raw/people/ by a hash of its URL."""
    path = CACHE / (hashlib.sha1(url.encode()).hexdigest()[:16] + ".html")
    if path.exists() and not refresh:
        return path.read_text(encoding="utf-8")
    req = urllib.request.Request(url, headers={"User-Agent": USER_AGENT})
    with urllib.request.urlopen(req, timeout=30) as r:   # follows the CMS's redirects (/de/… → /…)
        text = r.read().decode("utf-8", "replace")
    CACHE.mkdir(parents=True, exist_ok=True)
    path.write_text(text, encoding="utf-8")
    time.sleep(DELAY_S)
    return text


def clean(fragment):
    """HTML fragment → one line of plain text (line breaks become ", ")."""
    text = re.sub(r"<br\s*/?>", ", ", fragment)
    text = html.unescape(re.sub(r"<[^>]+>", " ", text))
    return re.sub(r"\s*,\s*(,\s*)*", ", ", re.sub(r"\s+", " ", text)).strip(" ,")


def parse_cards(page):
    """People with a room on a page: [{name, role, building, number}], without duplicates.

    Instead of cutting the page into cards (their HTML differs between sites),
    every Rauminfo room link is taken as an anchor, and the person is the
    last name that appears before it. The CMS renders each card twice (mobile
    and desktop layout); the second copy has no name of its own, so the last
    name seen carries over, and the duplicate is dropped."""
    cards, seen = [], set()
    name, role, pos = "", "", 0
    for link in ROOM_LINK_RE.finditer(page):
        before = page[pos:link.start()]
        names = [(m.start(), clean(m.group(1)), clean(m.group(2) or "")) for m in TITLE_RE.finditer(before)]
        names += [(m.start(), clean(m.group(1)), "") for m in PNAME_RE.finditer(before)]
        if names:
            _, name, role = max(names)               # the nearest name before the link
        pos = link.end()
        number = re.sub(r"\s+", "", html.unescape(link.group(2))).upper()
        key = (name, link.group(1), number)
        if name and key not in seen:
            seen.add(key)
            cards.append({"name": name, "role": role, "building": link.group(1), "number": number})
    return cards


def room_index(bid):
    """Room number → full ids of a building, from the room crawler's output (tools/crawl_rooms.py)."""
    path = ROOT / "data" / "indoor" / bid / "rooms.json"
    index = {}
    for r in json.loads(path.read_text(encoding="utf-8"))["rooms"]:
        index.setdefault(r["number"], []).append(r["id"])
    return index


def routable_rooms(bid):
    """Room ids the indoor graph of a building can route to (web/data/indoor/<b>.json)."""
    path = ROOT / "web" / "data" / "indoor" / f"{bid}.json"
    return set(json.loads(path.read_text(encoding="utf-8"))["rooms"]) if path.exists() else set()


def resolve_room(number, ids):
    """The full room id for a room number, or None.

    The number usually exists on one floor only. If it exists on several,
    take the floor its first digit names (A120 → floor 1), the LUH numbering rule."""
    if len(ids) == 1:
        return ids[0]
    digits = re.search(r"\d", number)
    same_floor = [i for i in ids if digits and i.split(".")[1].lstrip("U").endswith(digits.group())]
    return same_floor[0] if len(same_floor) == 1 else None


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--refresh", action="store_true", help="download the pages again")
    args = ap.parse_args()

    sources = json.loads(SOURCES.read_text(encoding="utf-8"))
    excluded = {n.casefold() for n in sources.get("exclude", [])}
    # only buildings the app can route inside; a room elsewhere would be a dead end
    buildings = {p.parent.name: room_index(p.parent.name) for p in (ROOT / "data" / "indoor").glob("*/rooms.json")}

    people, seen, unresolved = [], set(), []
    for src in sources["pages"]:
        cards = parse_cards(fetch(src["url"], args.refresh))
        kept = 0
        for c in cards:
            if c["building"] not in buildings or c["name"].casefold() in excluded:
                continue
            rid = resolve_room(c["number"], buildings[c["building"]].get(c["number"], []))
            if rid is None:
                unresolved.append(f"{c['name']} ({c['building']} {c['number']})")
                continue
            key = (c["name"], rid)
            if key in seen:                      # the same person on two pages (e.g. a team page and their own page)
                continue
            seen.add(key)
            people.append({"name": c["name"], "role": c["role"], "org": src["org"], "room": rid, "source": src["url"]})
            kept += 1
        print(f"{src['url']}: {len(cards)} cards, {kept} people kept", file=sys.stderr)

    people.sort(key=lambda p: (p["name"].split()[-1].casefold(), p["name"]))   # by surname, like a phone book
    out = {
        "generated": time.strftime("%Y-%m-%d"),
        "attribution": "Names and office rooms from public web pages of Leibniz Universität Hannover",
        "people": people,
    }
    OUT.write_text(json.dumps(out, ensure_ascii=False, indent=0), encoding="utf-8")
    print(f"wrote {OUT.relative_to(ROOT)}: {len(people)} people in {len({p['room'][:4] for p in people})} buildings",
          file=sys.stderr)
    # rooms without an indoor route still work (route to the building, then floor and room),
    # but they are worth knowing: tools/coverage.py says why each one is not routable
    unrouted = [p for p in people if p["room"] not in routable_rooms(p["room"][:4])]
    if unrouted:
        print(f"  {len(people) - len(unrouted)} door to door; {len(unrouted)} in rooms not routable yet: "
              + ", ".join(sorted({p['room'] for p in unrouted})), file=sys.stderr)
    if unresolved:
        print(f"  {len(unresolved)} rooms not in the crawled room list (re-crawl with --extra?): "
              + "; ".join(unresolved), file=sys.stderr)


if __name__ == "__main__":
    main()
