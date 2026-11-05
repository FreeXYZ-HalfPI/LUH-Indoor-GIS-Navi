# Contributing

Thanks for helping students find their lecture rooms! 🎓

## Ways to help
- **Report a wrong route or a missing entrance.** Open an issue with the
  building number and a description. A photo or OSM link helps too.
- **Map entrances in OpenStreetMap.** Add `entrance=main` / `entrance=yes`
  nodes on LUH building outlines. Then re-run `tools/build_walk_graph.py`.
- **Digitise a building** (Phase 2). See [docs/INDOOR_FORMAT.md](docs/INDOOR_FORMAT.md).
- **Walk test routes on site.** The [field-test kit](docs/field-test/README.md)
  has checklists of 40 routes per building. Or walk any route and tell us
  where the app sends you the wrong way (the *Report a problem with this
  route* link under the directions opens a filled-in issue). When all routes of a floor are right,
  maintainers mark it as verified: see
  [Marking a floor as verified](docs/INDOOR_FORMAT.md#marking-a-floor-as-verified).
- **Code:** UI, routing, translations, accessibility.

## Development setup
No build step and no Node.js required to run the app.

Tests (all offline):

```bash
python3 -m unittest discover tests   # data tools and generated data (needs numpy, pillow)
node --test "tests/js/*.test.mjs"   # router, turns, rooms; every routable room reaches an entrance (Node 22+, no npm packages)
```

```bash
# serve the web app locally
python3 -m http.server 8000 --directory web
# open http://localhost:8000
```

Refresh the data (maintainers only, please don't hammer the servers):

```bash
python3 tools/fetch_luh_data.py      # buildings + rooms → web/data/
python3 tools/build_walk_graph.py    # OSM footpaths + entrances → web/data/walkgraph.json
```

Indoor graphs (needs `pip install pillow numpy`):

```bash
python3 tools/build_indoor.py build 1101 --debug   # → web/data/indoor/1101.json, overlays in data/raw/
```

To improve a building, edit `data/indoor/<building>/source.json` (rough corridor
lines and stairs in floor-plan pixels), rebuild, and check the overlay PNGs.
See [docs/INDOOR_FORMAT.md](docs/INDOOR_FORMAT.md).

## Rules
- Code is licensed **GPL-3.0-or-later**. By contributing, you agree to license
  your contribution under it.
- Keep it privacy-friendly: no trackers, no analytics, no third-party
  requests with user data.
- Plain JavaScript (ES modules) for the web app. The data tools use only the
  Python standard library, except `build_indoor.py` (Pillow + numpy for image work).
- One topic per pull request. Describe what you changed and how you tested it.

Please follow the [Code of Conduct](CODE_OF_CONDUCT.md).
