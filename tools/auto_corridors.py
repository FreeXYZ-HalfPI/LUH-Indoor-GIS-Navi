#!/usr/bin/env python3
# SPDX-License-Identifier: GPL-3.0-or-later
"""Find corridors, stairs and lifts of a building automatically, so nobody has to trace them by hand.

  auto_corridors.py 3703            find them and write "auto_corridors" / "auto_connectors" into
                                    data/indoor/3703/source.json (your hand-made "corridors" and
                                    "connectors" are never touched; the builder uses both)
  auto_corridors.py 3703 --dry-run  only report what it would write
  auto_corridors.py 3703 --debug    also write data/raw/auto_3703_<floor>.png (skeleton blue,
                                    stairs green, lifts purple) to check the result by eye

How it works (needs source.json with georef and levels from `build_indoor.py fit`):

  Corridors: on each floor the walkable space is taken from the same cost map the builder uses (walls
    are impassable, thin lines like door swings and text are ignored). Slivers and pockets are removed,
    and what is left is thinned to its centre line (a "skeleton", Zhang-Suen). Every door opening is part
    of that space, so the centre line runs from room to room through the doors. Short dead-end twigs are
    cut off, and the lines are simplified into polylines.
  Stairs: a stairwell is a room with many parallel tread lines. The crawler painted every room red on its
    own plan image; inside that red area we count rows or columns that are mostly ink. Stair rooms on
    neighbouring floors at the same place form one connector (levels 000, 001, 002 ...).
  Lifts: a small, nearly square room with a box and a cross (both diagonals drawn), on two or more
    neighbouring floors at the same place. Shafts look the same, so a candidate must also be reachable
    from the corridors through a door opening on the floor.

The result is a draft, as rough as a hand trace: "approximate" in the app until floors are verified on
site. Standard library, numpy and Pillow only.
"""
import argparse
import json
import math
import sys
from collections import defaultdict, deque
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw

sys.path.insert(0, str(Path(__file__).resolve().parent))
import build_indoor as bi    # noqa: E402  (the cost map, plan loading and path search are shared with the builder)

ROOT = bi.ROOT

SCALE = 2                    # the skeleton is computed at half resolution: 4× faster, and corridors are rough anyway
MIN_REGION_M2 = 1.5          # walkable pockets smaller than this are furniture gaps, not corridors
SLIVER_PX = 3                # walkable strips thinner than 2·SLIVER_PX+1 px are gaps between lines, not passages
TWIG_M = 1.5                 # dead ends shorter than this are skeleton noise
MIN_TREADS = 5               # tread lines that make a stairwell
MAX_TREAD_GAP_M = 0.8        # treads are this close; the cubicle walls of a toilet are about 1 m apart
STAIR_AREA_M2 = (3, 70)      # a stairwell room is neither a cupboard nor a hall
LIFT_AREA_M2 = (1.2, 10)
MATCH_M = 3.0                # stair rooms of two floors closer than this are the same stairs
MAX_SPUR_M = 15              # a stair or lift must be this close to a corridor


# ───────────────────────────── skeleton ─────────────────────────────

def thin(mask):
    """Zhang-Suen thinning: peel boundary pixels until a one-pixel-wide centre line is left."""
    m = np.pad(mask.astype(np.uint8), 1)
    while True:
        changed = False
        for first in (True, False):
            p2, p3, p4, p5, p6, p7, p8, p9 = (np.roll(np.roll(m, dy, 0), dx, 1) for dy, dx in
                                              ((-1, 0), (-1, 1), (0, 1), (1, 1), (1, 0), (1, -1), (0, -1), (-1, -1)))
            nb = p2 + p3 + p4 + p5 + p6 + p7 + p8 + p9                       # neighbours set
            seq = [p2, p3, p4, p5, p6, p7, p8, p9, p2]
            trans = sum(((seq[i] == 0) & (seq[i + 1] == 1)).astype(np.uint8) for i in range(8))   # 0→1 transitions
            if first:
                cond = (p2 * p4 * p6 == 0) & (p4 * p6 * p8 == 0)
            else:
                cond = (p2 * p4 * p8 == 0) & (p2 * p6 * p8 == 0)
            kill = (m == 1) & (nb >= 2) & (nb <= 6) & (trans == 1) & cond
            if kill.any():
                m[kill] = 0
                changed = True
        if not changed:
            return m[1:-1, 1:-1].astype(bool)


def components(mask):
    """Connected regions (8-neighbourhood) of a boolean mask → list of pixel lists."""
    h, w = mask.shape
    seen = np.zeros_like(mask, bool)
    out = []
    for y0, x0 in zip(*np.nonzero(mask)):
        if seen[y0, x0]:
            continue
        seen[y0, x0] = True
        comp, queue = [], deque([(x0, y0)])
        while queue:
            x, y = queue.popleft()
            comp.append((x, y))
            for dx, dy, _ in bi.NEIGH:
                u, v = x + dx, y + dy
                if 0 <= u < w and 0 <= v < h and mask[v, u] and not seen[v, u]:
                    seen[v, u] = True
                    queue.append((u, v))
        out.append(comp)
    return out


def neighbours(pts):
    """pixel → set of 8-neighbours that are also in the set"""
    return {p: {(p[0] + dx, p[1] + dy) for dx, dy, _ in bi.NEIGH if (p[0] + dx, p[1] + dy) in pts} for p in pts}


def prune(pts, min_len):
    """Cut dead-end twigs shorter than min_len pixels, twice (cutting a twig can expose a new one)."""
    for _ in range(2):
        nb = neighbours(pts)
        for end in [p for p, n in nb.items() if len(n) == 1]:
            chain, prev, cur = [end], None, end
            while True:
                nxt = [q for q in nb[cur] if q != prev and q not in chain]
                if len(nxt) != 1 or len(nb[nxt[0]]) > 2:      # reached a junction (or the end of a line)
                    break
                prev, cur = cur, nxt[0]
                chain.append(cur)
            junction = bool(nxt) and len(nb[nxt[0]]) > 2
            if junction and len(chain) < min_len:
                pts -= set(chain)
    return pts


def polylines(pts):
    """Skeleton pixels → polylines between endpoints and junctions (and loops), as [(x, y), …]."""
    nb = neighbours(pts)
    node = {p for p, n in nb.items() if len(n) != 2}
    used, lines = set(), []

    def walk(start, nxt):
        line, prev, cur = [start], start, nxt
        while True:
            line.append(cur)
            used.add(frozenset((prev, cur)))
            if cur in node:
                return line
            step = [q for q in nb[cur] if q != prev and frozenset((cur, q)) not in used]
            if not step:
                return line
            prev, cur = cur, step[0]

    for n in node:
        for q in nb[n]:
            if frozenset((n, q)) not in used:
                lines.append(walk(n, q))
    for p in pts:                                    # loops without a junction
        for q in nb[p]:
            if frozenset((p, q)) not in used:
                lines.append(walk(p, q))
    return lines


def corridors_of(cost, inside, px_per_m):
    """Centre lines of the walkable space of one floor, as polylines in full-resolution plan pixels."""
    free = np.isfinite(cost) & inside      # outside the OSM outline is the street, not a corridor
    free = bi.erode(free, SLIVER_PX)
    h, w = free.shape
    h2, w2 = h // SCALE, w // SCALE
    small = free[: h2 * SCALE, : w2 * SCALE].reshape(h2, SCALE, w2, SCALE).all(axis=(1, 3))
    keep = np.zeros_like(small)
    min_px = MIN_REGION_M2 * (px_per_m / SCALE) ** 2
    for comp in components(small):
        if len(comp) >= min_px:
            for x, y in comp:
                keep[y, x] = True
    if not keep.any():
        return []
    skel = thin(keep)
    pts = prune({(int(x), int(y)) for y, x in zip(*np.nonzero(skel))}, TWIG_M * px_per_m / SCALE)
    lines = []
    for line in polylines(pts):
        line = bi.rdp(line, 2.5)
        if len(line) >= 2:
            lines.append([[x * SCALE + SCALE // 2, y * SCALE + SCALE // 2] for x, y in line])
    return lines


# ───────────────────────────── stairs and lifts ─────────────────────────────

def room_picture(room):
    """(room mask, ink mask, offset) of a room on its own plan image, cropped to the room.

    The red fill leaves holes where lines are drawn on top of it (treads, a lift's cross), so the
    room mask is the fill with its small holes closed, and the lines are the dark pixels inside."""
    rgb = np.asarray(bi.fetch_plan(room["id"])).astype(int)
    red = bi.red_mask(rgb)
    ys, xs = np.nonzero(red)
    if not len(xs):
        return None
    x0, x1, y0, y1 = max(0, xs.min() - 6), xs.max() + 7, max(0, ys.min() - 6), ys.max() + 7
    crop = (slice(y0, y1), slice(x0, x1))
    ink = bi.ink(Image.fromarray(rgb.astype(np.uint8)))[crop]      # dark lines, not the red fill
    red = red[crop]
    room_mask = bi.erode(bi.dilate(red, 2), 2)         # closing: fills lines up to 4 px wide
    return room_mask, ink & room_mask, (x0, y0)


def longest_runs(m):
    """Length of the longest run of True in each row of a boolean array."""
    out = np.zeros(m.shape[0], int)
    for i, row in enumerate(m):
        best = cur = 0
        for v in row:
            cur = cur + 1 if v else 0
            best = max(best, cur)
        out[i] = best
    return out


def tread_lines(room, ink, px_per_m):
    """Longest chain of closely spaced parallel lines inside the room: stair treads are about 0.3 m apart.

    A cubicle row of a toilet has parallel lines too, but 0.9 m apart; a corridor has none."""
    inner = bi.erode(room, 3)
    lines = ink & inner
    best = 0
    for arr in (lines, lines.T):
        extent = max(1, int(inner.any(axis=0).sum()) if arr is lines else int(inner.any(axis=1).sum()))
        runs_ = longest_runs(arr)
        on = runs_ >= max(0.8 * px_per_m, 0.25 * extent)      # this row is a line, not a speck
        centres, i = [], 0
        while i < len(on):                                       # a line may be 2-3 rows thick: one centre each
            if on[i]:
                j = i
                while j + 1 < len(on) and on[j + 1]:
                    j += 1
                centres.append((i + j) / 2)
                i = j + 1
            else:
                i += 1
        chain = 1 if centres else 0
        for a, b in zip(centres, centres[1:]):
            chain = chain + 1 if (b - a) <= MAX_TREAD_GAP_M * px_per_m else 1
            best = max(best, chain)
        best = max(best, chain)
    return best


def crossed_box(room, ink, px_per_m):
    """A small box with both diagonals drawn and little else: a lift (or a shaft, which looks the same)."""
    inner = bi.erode(room, 3)
    if (ink & inner).sum() > 0.35 * inner.sum():                 # a busy room is furniture, not a cross
        return False
    ys, xs = np.nonzero(ink & inner)          # the drawn box: the red fill leaves a margin around it
    if len(xs) < 20:
        return False
    x0, x1, y0, y1 = xs.min(), xs.max(), ys.min(), ys.max()
    if min(x1 - x0, y1 - y0) < 0.7 * px_per_m:     # a lift car is at least about a metre wide
        return False
    n = max(x1 - x0, y1 - y0, 1)
    score = []
    for flip in (False, True):
        hit = 0
        for i in range(n + 1):
            x = round(x0 + (x1 - x0) * i / n)
            y = round((y1 - (y1 - y0) * i / n) if flip else (y0 + (y1 - y0) * i / n))
            hit += ink[max(0, y - 2): y + 3, max(0, x - 2): x + 3].any()
        score.append(hit / (n + 1))
    return min(score) >= 0.85


def candidates(bid, src, crawl, px_per_m):
    """Stair and lift rooms per floor: [{kind, code, id, at (plan px), area}]"""
    out = []
    for r in crawl:
        code = r["floor"]
        if code not in src["levels"] or not r.get("image"):
            continue
        pic = room_picture(r)
        if pic is None:
            continue
        red, ink, (ox, oy) = pic
        area = red.sum() / px_per_m ** 2
        ys, xs = np.nonzero(red)
        aspect = max(np.ptp(xs) + 1, np.ptp(ys) + 1) / max(1, min(np.ptp(xs) + 1, np.ptp(ys) + 1))
        kind = None
        if STAIR_AREA_M2[0] <= area <= STAIR_AREA_M2[1] and tread_lines(red, ink, px_per_m) >= MIN_TREADS:
            kind = "stairs"
        elif LIFT_AREA_M2[0] <= area <= LIFT_AREA_M2[1] and aspect <= 1.7 and crossed_box(red, ink, px_per_m):
            kind = "elevator"
        if kind:
            px, py = r["image"]["point"]
            at = bi.image_to_plan(px, py, src["levels"][code])
            out.append({"kind": kind, "code": code, "id": r["id"], "at": [round(at[0]), round(at[1])], "area": round(area, 1)})
    return out


def group(cands, px_per_m):
    """Rooms at the same place on neighbouring floors → connectors with their levels."""
    out = []
    for kind in ("stairs", "elevator"):
        groups = []                            # each: {"at", "rooms": {code: candidate}}
        for c in sorted((c for c in cands if c["kind"] == kind), key=lambda c: bi.level_num(c["code"])):
            for g in groups:
                last = g["rooms"][max(g["rooms"], key=bi.level_num)]
                near = math.dist(c["at"], last["at"]) <= MATCH_M * px_per_m
                next_floor = bi.level_num(c["code"]) - bi.level_num(last["code"]) == 1
                if near and next_floor:
                    g["rooms"][c["code"]] = c
                    break
            else:
                groups.append({"rooms": {c["code"]: c}})
        out += [(kind, g["rooms"]) for g in groups if len(g["rooms"]) >= 2]
    return out


def reachable(cost, skeleton, at, px_per_m):
    """Is there a walkable path of at most MAX_SPUR_M from `at` to the skeleton of its floor?"""
    start = bi.snap_free(cost, *at, r=12)
    if start is None or not skeleton:
        return False
    box = (at[0] - 300, at[1] - 300, at[0] + 300, at[1] + 300)
    path = bi.dijkstra(cost, start, lambda p: p in skeleton, box)
    return bool(path) and len(path) / px_per_m <= MAX_SPUR_M


# ───────────────────────────── main ─────────────────────────────

def find(bid, debug=False):
    src = bi.read_json(ROOT / "data" / "indoor" / bid / "source.json")
    if not src or "georef" not in src or "levels" not in src:
        raise SystemExit(f"{bid}: run `build_indoor.py fit {bid}` first (source.json needs georef and levels)")
    crawl, _, _ = bi.load_rooms(bid)
    if not crawl:
        raise SystemExit(f"{bid}: no rooms.json; run tools/crawl_rooms.py {bid} first")
    size = bi.plan_frame_size(src)
    geo = bi.Georef(src["georef"])
    inside = bi.footprint(src, geo, size)
    ppm = src["georef"]["scale"]

    plans, costs, corridors, skeletons = {}, {}, {}, {}
    for code, reg in src["levels"].items():
        plans[code] = bi.to_plan_frame(bi.fetch_plan(src["plan_room"][code]), reg, size)
        costs[code] = bi.walk_cost(plans[code], inside)
        corridors[code] = corridors_of(costs[code], inside, ppm)
        pix = set()
        for line in corridors[code]:                       # the pixels the builder would reach with these lines
            for a, b in zip(line, line[1:]):
                pix.update(bi.straight_line(tuple(a), tuple(b)))
        skeletons[code] = pix
        print(f"  floor {code}: {len(corridors[code])} corridor lines", file=sys.stderr)

    cands = candidates(bid, src, crawl, ppm)
    connectors = []
    for kind, rooms in group(cands, ppm):
        ok = {code: c for code, c in rooms.items() if reachable(costs[code], skeletons[code], c["at"], ppm)}
        codes = sorted(ok, key=bi.level_num)
        # keep the longest run of neighbouring floors that are reachable
        best, cur = [], []
        for code in codes:
            cur = cur + [code] if cur and bi.level_num(code) - bi.level_num(cur[-1]) == 1 else [code]
            best = cur if len(cur) > len(best) else best
        if len(best) >= 2:
            first = ok[best[0]]
            connectors.append({"id": f"auto-{'L' if kind == 'elevator' else 'S'}{len(connectors) + 1}-{first['id'].split('.')[-1]}",
                               "type": kind, "at": first["at"], "levels": best})
    print(f"  {sum(c['type'] == 'stairs' for c in connectors)} stairs, "
          f"{sum(c['type'] == 'elevator' for c in connectors)} lifts "
          f"({len(cands)} stair/lift rooms seen, {len(group(cands, ppm))} groups)", file=sys.stderr)

    if debug:
        for code, im in plans.items():
            im = im.copy()
            d = ImageDraw.Draw(im)
            for line in corridors[code]:
                d.line([tuple(p) for p in line], fill=(0, 120, 255), width=3)
            for c in cands:
                if c["code"] == code:
                    x, y = c["at"]
                    d.ellipse((x - 9, y - 9, x + 9, y + 9), outline=(0, 160, 0) if c["kind"] == "stairs" else (160, 0, 200), width=4)
            for c in connectors:
                if code in c["levels"]:
                    x, y = c["at"]
                    d.ellipse((x - 5, y - 5, x + 5, y + 5), fill=(0, 160, 0) if c["type"] == "stairs" else (160, 0, 200))
            im.save(bi.RAW / f"auto_{bid}_{code}.png")
    return src, corridors, connectors


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("building")
    ap.add_argument("--dry-run", action="store_true", help="report only, do not write source.json")
    ap.add_argument("--debug", action="store_true", help="write overlay PNGs to data/raw/")
    a = ap.parse_args()
    src, corridors, connectors = find(a.building, a.debug)
    lines = sum(len(v) for v in corridors.values())
    if a.dry_run:
        print(f"{a.building}: would write {lines} corridor lines and {len(connectors)} connectors (dry run)")
        return
    path = ROOT / "data" / "indoor" / a.building / "source.json"
    src["auto_corridors"] = corridors
    src["auto_connectors"] = connectors
    path.write_text(json.dumps(src, ensure_ascii=False, indent=1) + "\n", encoding="utf-8")
    print(f"{a.building}: wrote {lines} corridor lines and {len(connectors)} connectors to {path.relative_to(ROOT)}")


if __name__ == "__main__":
    main()
