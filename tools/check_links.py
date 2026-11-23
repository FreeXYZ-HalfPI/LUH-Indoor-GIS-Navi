#!/usr/bin/env python3
# SPDX-License-Identifier: GPL-3.0-or-later
"""Check the URLs in the README, the docs and the app settings; list the dead ones.

    python3 tools/check_links.py [--report report.md]

Exit code 0: all fine, 1: at least one link is dead (the report says which), 2: no network
(nothing could be reached at all, so no report). Standard library only, one request at a time per URL,
a pause between hosts' requests is not needed at this size (about 270 links).
"""
import argparse
import re
import sys
import urllib.error
import urllib.request
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
FILES = [ROOT / "README.md", ROOT / "CONTRIBUTING.md", ROOT / "ROADMAP.md", ROOT / "CHANGELOG.md", *sorted((ROOT / "docs").rglob("*.md")), ROOT / "web" / "js" / "config.js"]
URL = re.compile(r"https?://[^\s)\"'<>\]`,|\\]+")
# API endpoints and URL prefixes that are not pages (a GET answers 404, 405 or 406 by design)
SKIP = ("localhost", "example.com", "overpass", "standortfinder.uni-hannover.de/search", "info.cafm.uni-hannover.de/de/room/",
        "info.cafm.uni-hannover.de/images/", "{", "$", "...", "xlink", "w3.org")
UA = "Mozilla/5.0 (compatible; luh-navi-linkcheck; +https://github.com/FreeXYZ-HalfPI/LUH-Indoor-GIS-Navi)"


def urls():
    found = {}
    for f in FILES:
        if not f.exists():
            continue
        for u in URL.findall(f.read_text(encoding="utf-8")):
            u = u.rstrip(".;:*}")
            if not any(s in u for s in SKIP):
                found.setdefault(u, f.relative_to(ROOT))
    return found


def check(u):
    try:
        req = urllib.request.Request(u, headers={"User-Agent": UA})
        with urllib.request.urlopen(req, timeout=20) as r:
            return r.status
    except urllib.error.HTTPError as e:
        return e.code
    except Exception as e:  # DNS, timeout, TLS
        return type(e).__name__


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--report", help="write a Markdown report here when links are dead")
    a = ap.parse_args()
    found = urls()
    with ThreadPoolExecutor(8) as ex:
        res = dict(zip(found, ex.map(check, found)))
    bad = {u: c for u, c in res.items() if c != 200}
    if len(bad) == len(res):
        print("no network: nothing could be reached", file=sys.stderr)
        return 2
    for u, c in sorted(bad.items()):
        print(f"{c}  {u}  ({found[u]})")
    print(f"{len(res)} links checked, {len(bad)} not OK")
    if bad and a.report:
        lines = ["These links did not answer with 200 in the weekly check:", ""]
        lines += [f"- `{c}` <{u}> (in `{found[u]}`)" for u, c in sorted(bad.items())]
        Path(a.report).write_text("\n".join(lines) + "\n", encoding="utf-8")
    return 1 if bad else 0


if __name__ == "__main__":
    sys.exit(main())
