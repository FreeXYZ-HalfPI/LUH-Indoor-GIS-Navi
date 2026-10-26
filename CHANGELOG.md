# Changelog

## [Unreleased]
### Added
- Indoor routing for two more example buildings: 3101 Schneiderberg-Gebäude
  and 3110 Hauptmensa (3 example buildings in total)
- `build_indoor.py fit --coarse`: automatic georeferencing by matching the
  plan's exterior boundary to the OSM outline (rotation, scale, shift);
  coloured wall lines, any image size, several OSM outlines per building,
  hand-placed `room_points`
- `data/buildings_override.json` for names missing in the LUH data
### Fixed
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
