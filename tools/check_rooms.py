#!/usr/bin/env python3
# SPDX-License-Identifier: GPL-3.0-or-later
"""Has the public room list of a mapped building changed since we built its map?

  check_rooms.py                       all buildings of web/data/indoor/index.json
  check_rooms.py 3101 3110             only these
  check_rooms.py --report report.md    also write the findings as Markdown (for an issue)

For each building it reads the public Rauminfo (CAFM) room list, one request per
building, and compares it with the "listed" rooms stored in the building's indoor
data. A room that is new there, or gone, means the floor plans or the room numbers
changed, and the building should be crawled and built again
(`crawl_rooms.py`, `build_indoor.py build`). Standard library only: it runs in a
scheduled GitHub Action (.github/workflows/room-check.yml).

Exit code: 0 nothing changed, 1 changes found, 2 a building could not be checked.
"""
import argparse
import json
import re
import sys
import time
import urllib.error
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
INDOOR = ROOT / "web" / "data" / "indoor"
CAFM = "https://info.cafm.uni-hannover.de"
USER_AGENT = "LUH-Indoor-GIS-Navi/0.1 (+https://github.com/FreeXYZ-HalfPI/LUH-Indoor-GIS-Navi)"
ROOM_RE = re.compile(r'href="/de/room/([^"]+)"')


def parse_listed(html):
    """The room ids on a Rauminfo building page, sorted and without duplicates."""
    return sorted(set(ROOM_RE.findall(html)))


def compare(known, live):
    """(new, gone): rooms in the live list we do not know, and known rooms no longer listed."""
    return sorted(set(live) - set(known)), sorted(set(known) - set(live))


def fetch(url, tries=3):
    """A page as text; waits and retries on network errors and 5xx answers."""
    req = urllib.request.Request(url, headers={"User-Agent": USER_AGENT})
    for i in range(tries):
        try:
            with urllib.request.urlopen(req, timeout=30) as r:
                return r.read().decode("utf-8")
        except urllib.error.HTTPError as e:
            if e.code < 500 or i == tries - 1:
                raise
        except (urllib.error.URLError, TimeoutError, ConnectionError):
            if i == tries - 1:
                raise
        time.sleep(5 * 2 ** i)


def report(results, failed):
    """Markdown for an issue: what changed per building, and what to do about it."""
    lines = ["The public Rauminfo room list differs from the rooms our maps were built from.", ""]
    for bid, (new, gone) in sorted(results.items()):
        if not (new or gone):
            continue
        lines.append(f"### Building {bid}")
        if new:
            lines.append(f"- **new** ({len(new)}): " + ", ".join(f"`{r}`" for r in new))
        if gone:
            lines.append(f"- **no longer listed** ({len(gone)}): " + ", ".join(f"`{r}`" for r in gone))
        lines.append("")
    if failed:
        lines.append("Could not be checked: " + ", ".join(f"{b} ({why})" for b, why in sorted(failed.items())) + "\n")
    lines.append("To update: `python3 tools/crawl_rooms.py <building>`, `python3 tools/build_indoor.py build <building>`, "
                 "`python3 tools/coverage.py`, then the tests.")
    return "\n".join(lines) + "\n"


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("buildings", nargs="*", help="building ids (default: every mapped building)")
    ap.add_argument("--report", type=Path, help="write the findings as Markdown to this file")
    args = ap.parse_args()

    buildings = args.buildings or json.loads((INDOOR / "index.json").read_text(encoding="utf-8"))
    results, failed = {}, {}
    for bid in buildings:
        known = json.loads((INDOOR / f"{bid}.json").read_text(encoding="utf-8")).get("listed") or []
        try:
            live = parse_listed(fetch(f"{CAFM}/de/building/{bid}/rooms"))
        except (urllib.error.URLError, TimeoutError, ConnectionError) as e:
            failed[bid] = str(e)
            print(f"{bid}: not checked ({e})", file=sys.stderr)
            continue
        if not live:                      # an empty list is more likely a changed page than an empty building
            failed[bid] = "no rooms found on the page"
            print(f"{bid}: no rooms on the page, was it redesigned?", file=sys.stderr)
            continue
        results[bid] = compare(known, live)
        new, gone = results[bid]
        print(f"{bid}: {len(live)} listed, {len(new)} new, {len(gone)} gone")
        time.sleep(1)                     # one request per second is plenty

    changed = any(new or gone for new, gone in results.values())
    if args.report and (changed or failed):
        args.report.write_text(report(results, failed), encoding="utf-8")
    return 2 if failed else 1 if changed else 0


if __name__ == "__main__":
    sys.exit(main())
