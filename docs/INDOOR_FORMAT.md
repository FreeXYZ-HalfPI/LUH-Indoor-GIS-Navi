# Indoor graph format

Indoor routing needs, for each building, a graph of where people can walk:
corridors, doors into rooms, staircases, lifts and the building entrances.
We digitise it from the official LUH floor plans (Rauminfo/CAFM) with as
little manual work as possible.

## The idea in one picture

```
 CAFM floor plan (one PNG per room, same frame for all rooms of a floor)
        │
        │  red pixels  → room position            (automatic)
        │  black walls → walls / free space mask  (automatic)
        ▼
 data/indoor/<building>/source.json   ← hand-made, small:
        - rough corridor polylines per floor (in plan pixels)
        - staircases and lifts (position + floors)
        - georeference + floor registration (fitted by tools/build_indoor.py fit)
        │
        │  tools/build_indoor.py build <building>
        │    · snaps corridors to the free space between walls (pixel pathfinding)
        │    · connects every room and every OSM entrance to the corridors
        │      through the real door openings in the plan
        │    · links floors through stairs and lifts
        ▼
 web/data/indoor/<building>.json      ← used by the app
 data/indoor/<building>/<building>.geojson ← for QGIS / geojson.io review
```

## Coordinate frames

- **Plan frame**: pixel coordinates `(x, y)` of the building's ground-floor
  plan image (1600 × 1200 or 1200 × 1600 for LUH). Walls may be drawn in black
  or in colour (3101 uses green). All floors are registered into this frame.
- **Image frame of floor *f***: the CAFM image of that floor. Its relation to
  the plan frame is `plan = s · image + (dx, dy)` (`levels[f].s/dx/dy`).
- **WGS84**: `lat = lat[0] + lat[1]·x + lat[2]·y`, same for `lon` (`georef`).
  The affine is fitted against the OpenStreetMap building outline.

## Adding a building

0. `python3 tools/crawl_rooms.py <id>` finds all rooms of the building (not
   only the public ones) and writes `data/indoor/<id>/rooms.json`; the builder
   then routes to all of them. Look at `data/raw/rooms_<id>_<floor>.png`:
   rooms left white were missed, add them with `--extra`.
1. Create `data/indoor/<id>/source.json` with `building`, `osm_outline` (one
   OSM id or a list, if the building is mapped as several ways) and
   `plan_room` (any listed room per floor; its CAFM image is that floor's plan).
2. `python3 tools/build_indoor.py fit <id> --coarse` searches rotation, scale
   and shift by matching the plan's **exterior boundary** to the OSM outline,
   then registers the upper floors. Paste the printed `georef` and `levels`
   into `source.json`. Check the result visually; a wrong OSM outline gives a
   wrong fit (for 3101 the long neighbouring institute had to be left out).
3. Trace rough `corridors` and `connectors` (stairs, lifts) per floor.
4. `python3 tools/build_indoor.py build <id> --debug`, look at the overlay
   PNGs in `data/raw/`, adjust, repeat. Then re-run `tools/build_walk_graph.py`
   so the building's entrances come from all its outlines.

Optional keys: `room_points` (place a room node by hand, e.g. near the door of
a lecture hall full of seats), `force_rooms` (keep a room outside the OSM
outline), `skip_rooms` (rooms drawn as insets).

## `source.json` (hand-edited)

```jsonc
{
  "building": "1101",
  "osm_outline": "relation/2743600",                                 // or a list of ways
  "plan_room": { "000": "1101.000.E028", "001": "1101.001.F102" },  // any room per floor → CAFM image of that floor
  "georef": { "lat0": 52.3826, "lon0": 9.7172, "theta": 0.0895, "scale": 6.152, "tx": 702, "ty": 720 },
  "levels": { "000": { "s": 1, "dx": 0, "dy": 0 }, "001": { "s": 1.005, "dx": -2, "dy": 65 } },
  "corridors": {
    "000": [ [[105,370],[105,585],[200,600], …], … ]   // rough polylines, shared vertices = junctions
  },
  "connectors": [
    { "id": "S-lichthof-nw", "type": "stairs",   "at": [890,640], "levels": ["000","001","002","003"] },
    { "id": "L-main",        "type": "elevator", "at": [1076,598], "levels": ["000","001","002","003","004"] }
  ]
}
```

Rough is fine: a vertex may be several pixels off; the builder routes each
corridor segment through the free space and prefers the middle of a corridor.

## `web/data/indoor/<building>.json` (generated)

| key | meaning |
|---|---|
| `georef` | `{lat:[a0,a1,a2], lon:[b0,b1,b2]}` plan pixel → WGS84 |
| `px_per_m` | plan pixels per metre |
| `levels` | `{"0": {code:"000", s, dx, dy, room:"1101.000.E028"}}` keyed by numeric level |
| `nodes` | `[[x, y, level], …]` in plan pixels |
| `edges` | `[[a, b, length_m, flags, [x, y, x, y, …]], …]` intermediate geometry in plan pixels |
| `rooms` | `{room_id: node}` |
| `entrances` | `[{node, lat, lon}]`, matched to the OSM entrances in `walkgraph.json` |

Edge flags: `1` stairs, `4` lift, `8` vertical connection (between floors).

Numeric levels: `000` → 0, `001` → 1, `U01` → −1.

## Quality

The pilot data is **approximate**. It is derived from floor plans, not
surveyed. The app says so. Corrections from people who know the building are
very welcome: edit `source.json`, run the builder and open a pull request.
