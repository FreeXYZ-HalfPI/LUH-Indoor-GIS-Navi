#!/usr/bin/env python3
# SPDX-License-Identifier: GPL-3.0-or-later
"""Pick the routes for a field test and write the checklists.

  field_test.py                      40 routes per mapped building
  field_test.py --per-building 30 --buildings 1101 3101 --seed 7

Writes docs/field-test/<building>.md (a checklist to print or open on a phone,
one app link per route) and docs/field-test/routes.csv (one row per route, to
collect the results in a spreadsheet). The protocol is docs/field-test/README.md.

The routes cover what can go wrong, in this mix per building:
  - from outside to one room on every mapped floor: entrance, stairs or lifts
  - same floor: corridors and turns, pairs at least 20 m apart
  - across floors: stairs; every 4th with "avoid steps", which tests the lifts
  - to or from one of the two nearest other mapped buildings: the way out,
    outdoors, the way in (near ones, so a test round stays on foot)
Public rooms (lecture and seminar rooms, the ones students look for) are
preferred for half of the endpoints. Only routable rooms are used (the rooms of
web/data/indoor/<building>.json). The same seed always gives the same routes.

Only the Python standard library is used.
"""
import argparse
import csv
import json
import math
import random
import time
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
DATA = ROOT / "web" / "data"
OUT = ROOT / "docs" / "field-test"
APP = "https://freexyz-halfpi.github.io/LUH-Indoor-GIS-Navi/"

MIN_SAME_FLOOR_M = 20   # shorter pairs are often next door: nothing to test
# the share of the routes left after "one per floor from outside"
MIX = (("same-floor", 0.40), ("cross-floor", 0.35), ("cross-building", 0.25))
KINDS = {
    "entrance": "from outside to a room (entrance, stairs or lift)",
    "same-floor": "same floor (corridors, turns)",
    "cross-floor": "between floors (stairs; lift when 'avoid steps')",
    "cross-building": "to or from another building (exit, outdoor walk, entrance)",
}


def floor_name(code):
    """Floor code → readable name: "000" → "ground", "003" → "+3", "U01" → "-1" (as in coverage.py)."""
    lvl = -int(code[1:]) if code[0] in "U-" else int(code)
    return "ground" if lvl == 0 else f"+{lvl}" if lvl > 0 else str(lvl)


class Building:
    """The routable rooms of one building, by floor, with their plan positions."""

    def __init__(self, data, info):
        self.id = data["building"]
        self.name = info.get("name", "")
        self.at = (info.get("lat"), info.get("lon"))
        self.px_per_m = data["px_per_m"]
        listed = set(data.get("listed", []))
        self.floors = {}                    # floor code → [room ids]
        self.public = {}                    # floor code → [public room ids]
        self.pos = {}                       # room id → (x, y) plan pixels of its node
        for rid, node in sorted(data["rooms"].items()):
            code = rid.split(".")[1]
            self.floors.setdefault(code, []).append(rid)
            if rid in listed:
                self.public.setdefault(code, []).append(rid)
            self.pos[rid] = tuple(data["nodes"][node][:2])
        self.codes = sorted(self.floors, key=lambda c: (-int(c[1:]) if c[0] in "U-" else int(c)))

    def room(self, rng, code=None):
        """A random room, on a floor if given; a public room half of the time when the floor has one."""
        code = code or rng.choice(self.codes)
        pool = self.public.get(code) if rng.random() < 0.5 and self.public.get(code) else self.floors[code]
        return rng.choice(pool)

    def metres(self, a, b):
        (x0, y0), (x1, y1) = self.pos[a], self.pos[b]
        return math.hypot(x1 - x0, y1 - y0) / self.px_per_m


def nearest(b, others, k=2):
    """The k buildings nearest to b (flat-earth metres are fine on one campus)."""
    def dist(o):
        if None in b.at or None in o.at:
            return math.inf
        k_lon = math.cos(math.radians(b.at[0]))
        return math.hypot(o.at[0] - b.at[0], (o.at[1] - b.at[1]) * k_lon)
    return sorted(others, key=lambda o: (dist(o), o.id))[:k]


def pick_routes(b, others, n, rng):
    """About n routes for building b: one from outside per floor, then the MIX. Returns [{kind, from, to, avoid_steps}]."""
    routes, seen = [], set()

    def add(kind, a, z, avoid=False):
        if a == z or (a, z) in seen:
            return False
        seen.add((a, z))
        routes.append({"kind": kind, "from": a, "to": z, "avoid_steps": avoid})
        return True

    for code in b.codes:                                  # every floor at least once
        add("entrance", b.id, b.room(rng, code))
    left = max(0, n - len(routes))
    counts = [round(left * share) for _, share in MIX]
    counts[0] += left - sum(counts)                       # rounding: the rest to same-floor
    if not others:                                        # no second building: their share goes to cross-floor
        counts[1] += counts[2]
        counts[2] = 0
    if len(b.codes) < 2:                                  # one floor only: no stairs to test
        counts[0] += counts[1]
        counts[1] = 0

    for kind, count in zip([k for k, _ in MIX], counts):
        made = tries = 0
        while made < count and tries < count * 50:      # tries: small buildings run out of distinct pairs
            tries += 1
            if kind == "same-floor":
                code = b.codes[made % len(b.codes)]       # round-robin, so every floor gets corridors tested
                a, z = b.room(rng, code), b.room(rng, code)
                if b.metres(a, z) < MIN_SAME_FLOOR_M and tries < count * 40:
                    continue
                ok = add(kind, a, z)
            elif kind == "cross-floor":
                lo, hi = rng.sample(b.codes, 2)
                a, z = (b.room(rng, lo), b.room(rng, hi)) if rng.random() < 0.5 else (b.room(rng, hi), b.room(rng, lo))
                ok = add(kind, a, z, avoid=made % 4 == 3)
            else:
                o = rng.choice(others)
                a, z = b.room(rng), o.room(rng)
                ok = add(kind, *((a, z) if made % 2 == 0 else (z, a)))
            made += ok
    return routes


def app_link(r):
    q = f"from={r['from']}&to={r['to']}" + ("&steps=0" if r["avoid_steps"] else "")
    return f"{APP}#{q}"


def place_text(pid, names):
    """A room code as it is, a building number with its name ("from outside")."""
    return f"outside {pid} {names.get(pid, '')}".strip() if "." not in pid else pid


def checklist(b, routes, names, seed):
    """Markdown checklist for one building."""
    lines = [
        f"# Field test {b.id} {b.name}", "",
        f"Generated by `python3 tools/field_test.py` on {time.strftime('%Y-%m-%d')} (seed {seed}).",
        "How to run the test and what to check: [README.md](README.md).", "",
        f"Tester: ______________________  Date: ____________  Phone / browser: ______________", "",
        "Tick each check that is right; write the step number and what is wrong in *notes*.", "",
        "| # | from | to | test | entrance / exit | turns & distances | stairs / lift | arrived | notes |",
        "|---:|---|---|---|:---:|:---:|:---:|:---:|---|",
    ]
    for i, r in enumerate(routes, 1):
        test = r["kind"] + (", avoid steps" if r["avoid_steps"] else "")
        lines.append(f"| [{i}]({app_link(r)}) | {place_text(r['from'], names)} | {place_text(r['to'], names)} "
                     f"| {test} | ☐ | ☐ | ☐ | ☐ | |")
    floors = ", ".join(f"{floor_name(c)} (`{c}`)" for c in b.codes)
    lines += ["", f"Floors covered: {floors}.", "",
              "Route kinds: " + "; ".join(f"**{k}**: {v}" for k, v in KINDS.items()) + "."]
    return "\n".join(lines) + "\n"


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--per-building", type=int, default=40, help="routes per building (default 40; at least one per floor)")
    ap.add_argument("--buildings", nargs="*", help="building numbers (default: every mapped building)")
    ap.add_argument("--seed", type=int, default=2026, help="same seed, same routes (default 2026)")
    a = ap.parse_args()

    info = {x["id"]: x for x in json.loads((DATA / "buildings.json").read_text(encoding="utf-8"))}
    names = {bid: x["name"] for bid, x in info.items()}
    mapped = json.loads((DATA / "indoor" / "index.json").read_text(encoding="utf-8"))
    buildings = {bid: Building(json.loads((DATA / "indoor" / f"{bid}.json").read_text(encoding="utf-8")), info.get(bid, {}))
                 for bid in mapped}
    chosen = a.buildings or mapped
    unknown = [bid for bid in chosen if bid not in buildings]
    if unknown:
        raise SystemExit(f"no indoor data for {' '.join(unknown)}; mapped: {' '.join(mapped)}")

    OUT.mkdir(parents=True, exist_ok=True)
    rows = []
    for bid in chosen:
        b = buildings[bid]
        rng = random.Random(f"{a.seed}:{bid}")           # per building: adding a building keeps the others' routes
        routes = pick_routes(b, nearest(b, [o for k, o in buildings.items() if k != bid]), a.per_building, rng)
        (OUT / f"{bid}.md").write_text(checklist(b, routes, names, a.seed), encoding="utf-8")
        rows += [{"building": bid, "no": i, "kind": r["kind"], "from": r["from"], "to": r["to"],
                  "avoid_steps": "yes" if r["avoid_steps"] else "no", "link": app_link(r),
                  "entrance_ok": "", "turns_ok": "", "vertical_ok": "", "arrived": "", "notes": "", "issue": ""}
                 for i, r in enumerate(routes, 1)]
        print(f"{bid}: {len(routes)} routes on {len(b.codes)} floors -> {(OUT / f'{bid}.md').relative_to(ROOT)}")
    with (OUT / "routes.csv").open("w", newline="", encoding="utf-8") as f:
        w = csv.DictWriter(f, fieldnames=list(rows[0]))
        w.writeheader()
        w.writerows(rows)
    print(f"{len(rows)} routes -> {(OUT / 'routes.csv').relative_to(ROOT)}")


if __name__ == "__main__":
    main()
