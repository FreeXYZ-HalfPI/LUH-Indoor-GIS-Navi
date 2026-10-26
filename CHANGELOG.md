# Changelog

## [Unreleased]
### Added
- `tools/crawl_rooms.py`: finds **all** rooms of a building, not only the
  public ones. Rauminfo lists few rooms, but every floor plan exists for every
  room; the crawler guesses room numbers per floor and wing, keeps those with
  a plan, and takes each room's position and outline from its red highlight.
  Output `data/indoor/<b>/rooms.json` (+ GeoJSON) is used by the app and by
  `build_indoor.py`. The "Room info" link is shown only for public rooms.
- 3101 Schneiderberg-Gebäude: 261 rooms found (9 public), 232 routable
- 3110 Hauptmensa: 234 rooms found (8 public), 217 routable
- 1101 Hauptgebäude: 1227 rooms found (57 public), 1035 routable
- Indoor routing for two more example buildings: 3101 Schneiderberg-Gebäude
  and 3110 Hauptmensa (3 example buildings in total)
- `build_indoor.py fit --coarse`: automatic georeferencing by matching the
  plan's exterior boundary to the OSM outline (rotation, scale, shift);
  coloured wall lines, any image size, several OSM outlines per building,
  hand-placed `room_points`
- `data/buildings_override.json` for names missing in the LUH data
### Fixed
- Floor plans of portrait buildings (3101, 3110) were squeezed, so the route
  was drawn beside the building; the plan size now comes from the indoor data
- Map tiles were blocked by OpenStreetMap (403) because no Referer was sent
### Added (earlier)
- Phase 2 pilot: indoor routing for building 1101 (Hauptgebäude), door to
  door across 5 floors, with stairs/lifts and "avoid steps" using lifts
- `tools/build_indoor.py`: georeferences CAFM floor plans to the OSM outline,
  registers floors, snaps hand-drawn corridors to the plan and connects rooms
  and entrances through the door openings; exports app JSON + GeoJSON
- Indoor graph format documented in `docs/INDOOR_FORMAT.md`
- Route-aware floor plans: each floor the route uses, zoomed, with the path drawn
- Phase 1 MVP web app (`web/`): room/building search, on-device walking route
  between the best entrance pair, step-by-step guidance with floor and wing,
  CAFM floor-plan preview, German/English, shareable links, offline PWA
- `tools/fetch_luh_data.py`: 108 buildings and 702 public rooms from LUH
  Rauminfo and the Standortfinder
- `tools/build_walk_graph.py`: OSM pedestrian graph and building entrances
  (67 of 108 buildings have mapped entrances)
- GitHub Pages deployment workflow
- Concept, architecture and data-source documentation (`docs/`)
- Roadmap with phases 0–5
- Contribution guide and code of conduct
