# SPDX-License-Identifier: GPL-3.0-or-later
"""Offline tests for the data tools and the generated app data.

  python3 -m unittest discover tests

No network access; needs Pillow and numpy (like the tools).
"""
import json
import sys
import tempfile
import unittest
from pathlib import Path

import numpy as np
from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "tools"))     # the tools are scripts, not a package

import build_indoor  # noqa: E402
import crawl_people  # noqa: E402
import crawl_rooms  # noqa: E402
import field_test  # noqa: E402

# A trimmed copy of a real Rauminfo room page: the script holds a label word on
# purpose (it must be ignored), and the area label is split over two <dt>.
ROOM_PAGE = """<html><body><script>var x = "Raumart";</script>
<h1>Raum 3101.000.A020</h1>
<dt>Lageplan</dt><dd>Erdgeschoss</dd>
<h2>Informationen</h2>
<dt>Fläche</dt><dt>(m²)</dt><dd>48.37</dd>
<dt>Raumart</dt><dd>Besprechungsraum</dd>
</body></html>"""


class CrawlerTest(unittest.TestCase):
    def test_page_details(self):
        self.assertEqual(crawl_rooms.page_details(ROOM_PAGE),
                         {"floor_name": "Erdgeschoss", "area_m2": 48.37, "type": "Besprechungsraum"})

    def test_room_labels(self):
        # wing letters, digits and suffix letters, including the odd forms found in 1101
        for label, parts in {"A020": ("A", "020", ""), "B063A": ("B", "063", "A"), "A61A": ("A", "61", "A"),
                             "011I": ("", "011", "I"), "068C": ("", "068", "C")}.items():
            self.assertEqual(crawl_rooms.LABEL_RE.match(label).groups(), parts)

    def test_hull_of_a_square_with_inner_points(self):
        # inner points and a point on an edge (10, 5) must not be hull corners
        pts = np.array([[0, 0], [10, 0], [10, 10], [0, 10], [5, 5], [3, 7], [10, 5]])
        self.assertEqual(sorted(map(tuple, crawl_rooms.hull(pts))), [(0, 0), (0, 10), (10, 0), (10, 10)])

    def test_highlight_finds_the_red_room(self):
        a = np.full((60, 80, 3), 255, np.uint8)
        a[10:20, 30:50] = (255, 0, 0)          # the room, filled red like on CAFM plans
        a[40:42, :] = (0, 0, 0)                # a wall
        with tempfile.TemporaryDirectory() as d:
            png = Path(d) / "room.png"
            Image.fromarray(a).save(png)
            info, mask = crawl_rooms.highlight(png)
        self.assertEqual(info["bbox"], [30, 10, 49, 19])
        self.assertEqual(info["pixels"], 200)
        x, y = info["point"]
        self.assertTrue(30 <= x <= 49 and 10 <= y <= 19)
        self.assertEqual(mask.sum(), 200)

    def test_candidates_follow_floor_times_100(self):
        # a high-rise has 105 on floor 1 and 1004 on floor 10 (3408); wing letters work the same
        scanner = crawl_rooms.Scanner.__new__(crawl_rooms.Scanner)
        scanner.wings, scanner.width = [""], 4
        self.assertEqual([next(iter(scanner.candidates(c))) for c in ("000", "001", "010")], ["000", "100", "1000"])
        self.assertEqual(list(scanner.candidates("010"))[-1], "1099")
        scanner.wings, scanner.width = ["A"], 3
        self.assertEqual(list(scanner.candidates("004"))[:2], ["A400", "A401"])

    def test_floor_digit(self):
        # room numbers on floor 3 start with 3; basement U01 rooms start with 1
        self.assertEqual([crawl_rooms.floor_digit(c) for c in ("000", "003", "U01")], [0, 3, 1])


# The two layouts LUH pages use for people, trimmed. A contact card is rendered
# twice (mobile and desktop), the second copy without the name.
CARD_PAGE = """<div class="c-card  c-card--contact  c-card--contact--image">
<div class="c-card--contact__title" translate="no"> Prof. Dr. Volker Epping </div>
<div class="c-card--contact__misc"> Präsidentin/Präsident<br/> </div>
<div class="c-card--contact__subtitle "> Telefon </div><a href="tel:+495117622201">+49 511 762 2201</a>
<div class="c-card--contact__subtitle "> Raum </div>
<a href="https://info.cafm.uni-hannover.de/room/1101/A120">A120</a>
<div class="c-card--contact__content-container--desktop">
<a href="https://info.cafm.uni-hannover.de/room/1101/A120">A120</a></div></div>"""
LIST_PAGE = """<div class="c-contact-list__item__name"><span class="pname" translate="no"> Anna Jagdmann</span></div>
<a href="https://info.cafm.uni-hannover.de/room/1101/A411" class="c-link"> A411 </a>
<div class="c-contact-list__item__name"><span class="pname" translate="no"> Dr. B&ouml;deker</span></div>
<a href="https://info.cafm.uni-hannover.de/room/3101/b 143" class="c-link"> B143 </a>"""


class PeopleTest(unittest.TestCase):
    def test_contact_card_once_without_phone(self):
        self.assertEqual(crawl_people.parse_cards(CARD_PAGE),
                         [{"name": "Prof. Dr. Volker Epping", "role": "Präsidentin/Präsident", "building": "1101", "number": "A120"}])

    def test_contact_list(self):
        cards = crawl_people.parse_cards(LIST_PAGE)
        self.assertEqual([(c["name"], c["building"], c["number"]) for c in cards],
                         [("Anna Jagdmann", "1101", "A411"), ("Dr. Bödeker", "3101", "B143")])

    def test_resolve_room(self):
        self.assertEqual(crawl_people.resolve_room("A120", ["1101.001.A120"]), "1101.001.A120")
        # the same number on two floors: the first digit names the floor
        self.assertEqual(crawl_people.resolve_room("A120", ["1101.000.A120", "1101.001.A120"]), "1101.001.A120")
        self.assertIsNone(crawl_people.resolve_room("A120", []))


class BuilderTest(unittest.TestCase):
    def test_level_num(self):
        self.assertEqual([build_indoor.level_num(c) for c in ("000", "004", "U01", "-02")], [0, 4, -1, -2])

    def test_rdp_keeps_corners(self):
        # a 0.4 px wiggle is noise, the right angle at (10, 0) is a corner
        line = [(0, 0), (5, 0.4), (10, 0), (10, 5), (10, 10)]
        self.assertEqual(build_indoor.rdp(line, 1.0), [(0, 0), (10, 0), (10, 10)])

    def test_georef_round_trip(self):
        # to_latlon must be the exact inverse of to_px, or rooms drift on the map
        g = build_indoor.Georef({"lat0": 52.3826, "lon0": 9.7172, "theta": 0.09, "scale": 6.15, "tx": 700, "ty": 720})
        x, y = g.to_px(52.3830, 9.7180)
        lat, lon = g.to_latlon(x, y)
        self.assertAlmostEqual(lat, 52.3830, places=7)
        self.assertAlmostEqual(lon, 9.7180, places=7)


class StatusTest(unittest.TestCase):
    """Floors verified on site (source.json "verified") → the app data."""

    SRC = {"levels": {"000": {}, "001": {}, "U01": {}}}

    def app(self):
        return {"levels": {"0": {"code": "000"}, "1": {"code": "001"}, "-1": {"code": "U01"}}, "approximate": True}

    def test_no_floor_verified(self):
        out = build_indoor.apply_status(self.app(), self.SRC)
        self.assertTrue(out["approximate"])
        self.assertFalse(any("verified" in lvl for lvl in out["levels"].values()))

    def test_some_and_all_floors_verified(self):
        some = build_indoor.apply_status(self.app(), {**self.SRC, "verified": {"001": "2026-11-20", "U01": "2026-11-21"}})
        self.assertEqual(some["levels"]["1"]["verified"], "2026-11-20")
        self.assertEqual(some["levels"]["-1"]["verified"], "2026-11-21")
        self.assertNotIn("verified", some["levels"]["0"])
        self.assertTrue(some["approximate"])
        every = {c: "2026-11-20" for c in self.SRC["levels"]}
        self.assertFalse(build_indoor.apply_status(self.app(), {**self.SRC, "verified": every})["approximate"])

    def test_unverifying_a_floor_removes_its_date(self):
        out = build_indoor.apply_status(self.app(), {**self.SRC, "verified": {"000": "2026-11-20"}})
        out = build_indoor.apply_status(out, self.SRC)
        self.assertNotIn("verified", out["levels"]["0"])

    def test_typos_are_errors(self):
        for bad in ({"002": "2026-11-20"}, {"000": "20.11.2026"}, {"000": "2026-13-01"}, {"000": None}):
            with self.assertRaises(ValueError, msg=bad):
                build_indoor.verified_levels({**self.SRC, "verified": bad})


class FieldTestTest(unittest.TestCase):
    """tools/field_test.py picks routes from the real app data."""

    @classmethod
    def setUpClass(cls):
        data = ROOT / "web" / "data"
        info = {b["id"]: b for b in json.loads((data / "buildings.json").read_text(encoding="utf-8"))}
        cls.b = {bid: field_test.Building(json.loads((data / "indoor" / f"{bid}.json").read_text(encoding="utf-8")), info[bid])
                 for bid in json.loads((data / "indoor" / "index.json").read_text(encoding="utf-8"))}

    def routes(self, bid, n=40, seed=1):
        import random
        others = field_test.nearest(self.b[bid], [o for k, o in self.b.items() if k != bid])
        return field_test.pick_routes(self.b[bid], others, n, random.Random(seed)), others

    def test_mix_coverage_and_validity(self):
        for bid, b in self.b.items():
            routes, others = self.routes(bid)
            with self.subTest(building=bid):
                self.assertEqual(len(routes), 40)
                pairs = [(r["from"], r["to"]) for r in routes]
                self.assertEqual(len(set(pairs)), len(pairs))               # no route twice
                ends = {p for pair in pairs for p in pair}
                known = set(b.pos) | {bid} | {rid for o in others for rid in o.pos}
                self.assertFalse(ends - known)                               # only routable rooms or this building
                floors = {r["to"].split(".")[1] for r in routes if r["kind"] == "entrance"}
                self.assertEqual(floors, set(b.codes))                       # every floor from outside
                self.assertTrue(any(r["avoid_steps"] for r in routes))       # the lifts get tested
                for r in routes:
                    kind = r["kind"]
                    a, z = r["from"].split("."), r["to"].split(".")
                    if kind == "same-floor":
                        self.assertEqual((a[0], a[1]), (z[0], z[1]))
                    elif kind == "cross-floor":
                        self.assertEqual(a[0], z[0])
                        self.assertNotEqual(a[1], z[1])
                    elif kind == "cross-building":
                        self.assertNotEqual(a[0], z[0])
                        self.assertIn(bid, (a[0], z[0]))

    def test_same_seed_same_routes(self):
        self.assertEqual(self.routes("3101", seed=7)[0], self.routes("3101", seed=7)[0])
        self.assertNotEqual(self.routes("3101", seed=7)[0], self.routes("3101", seed=8)[0])

    def test_links_open_the_route(self):
        r = {"from": "3101", "to": "3101.001.B151", "avoid_steps": True}
        self.assertEqual(field_test.app_link(r), field_test.APP + "#from=3101&to=3101.001.B151&steps=0")


class AppDataTest(unittest.TestCase):
    """The generated files in web/data must agree with each other."""

    @classmethod
    def setUpClass(cls):
        data = ROOT / "web" / "data"
        cls.rooms = json.loads((data / "rooms.json").read_text(encoding="utf-8"))
        cls.indoor = {b: json.loads((data / "indoor" / f"{b}.json").read_text(encoding="utf-8"))
                      for b in json.loads((data / "indoor" / "index.json").read_text(encoding="utf-8"))}

    def test_indoor_rooms_are_searchable(self):
        # a routable room the search cannot find would be unreachable in the app
        for b, d in self.indoor.items():
            known = set(self.rooms.get(b, []))
            with self.subTest(building=b):
                self.assertFalse(set(d["rooms"]) - known)
                self.assertFalse(set(d.get("outlines", {})) - known)

    def test_room_nodes_and_edges_are_valid(self):
        # broken indices would crash the router in the browser, where nobody sees the error
        for b, d in self.indoor.items():
            n = len(d["nodes"])
            with self.subTest(building=b):
                self.assertTrue(all(0 <= v < n for v in d["rooms"].values()))
                self.assertTrue(all(0 <= a < n and 0 <= c < n and length >= 0 for a, c, length, *_ in d["edges"]))
                levels = {int(k) for k in d["levels"]}
                self.assertTrue(all(lvl in levels for *_, lvl in d["nodes"]))

    def test_verified_floors_match_the_sources(self):
        # a field test is recorded in source.json; forgetting `build_indoor.py status` would hide it in the app
        for b, d in self.indoor.items():
            src = json.loads((ROOT / "data" / "indoor" / b / "source.json").read_text(encoding="utf-8"))
            with self.subTest(building=b):
                expect = build_indoor.apply_status(json.loads(json.dumps(d)), src)
                self.assertEqual(d["levels"], expect["levels"], "run: python3 tools/build_indoor.py status " + b)
                self.assertEqual(d["approximate"], expect["approximate"])

    def test_outlines_lie_on_the_plan(self):
        # at least 3 points each; a generous frame catches a wrong floor registration
        for b, d in self.indoor.items():
            w, h = d["plan_size"]
            with self.subTest(building=b):
                for flat in d["outlines"].values():
                    self.assertGreaterEqual(len(flat), 6)
                    self.assertTrue(all(-w <= v <= 2 * w for v in flat))

    def test_people_are_findable_and_minimal(self):
        # every person must lead to a known room of a mapped building (rooms that are not
        # routable yet still get a route to the building), and no contact details may be stored
        people = json.loads((ROOT / "web" / "data" / "people.json").read_text(encoding="utf-8"))["people"]
        for p in people:
            with self.subTest(person=p["name"]):
                self.assertIn(p["room"][:4], self.indoor)
                self.assertIn(p["room"], self.rooms[p["room"][:4]])
                self.assertEqual(set(p), {"name", "role", "org", "room", "source"})

    def test_crawl_files_match_app_list(self):
        # every crawled room must reach the app's room list, and the counts must add up
        for f in (ROOT / "data" / "indoor").glob("*/rooms.json"):
            crawl = json.loads(f.read_text(encoding="utf-8"))
            with self.subTest(building=crawl["building"]):
                self.assertEqual({r["id"] for r in crawl["rooms"]} - set(self.rooms[crawl["building"]]), set())
                self.assertEqual(crawl["counts"]["total"], len(crawl["rooms"]))


if __name__ == "__main__":
    unittest.main()
