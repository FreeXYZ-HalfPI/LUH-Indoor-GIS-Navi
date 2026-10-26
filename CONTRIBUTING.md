# Contributing

Thanks for helping students find their lecture rooms! 🎓

## Ways to help
- **Report a wrong route or a missing entrance.** Open an issue with the
  building number and a description. A photo or OSM link helps too.
- **Map entrances in OpenStreetMap.** Add `entrance=main` / `entrance=yes`
  nodes on LUH building outlines. Then re-run `tools/build_walk_graph.py`.
- **Digitise an indoor floor** (Phase 2). See [ROADMAP.md](ROADMAP.md).
- **Code:** UI, routing, translations, accessibility.

## Development setup
No build step and no Node.js required.

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

## Rules
- Code is licensed **GPL-3.0-or-later**. By contributing, you agree to license
  your contribution under it.
- Keep it privacy-friendly: no trackers, no analytics, no third-party
  requests with user data.
- Plain JavaScript (ES modules) for the web app and only the Python standard
  library for the tools, unless there is a good reason to add something.
- One topic per pull request. Describe what you changed and how you tested it.

Please follow the [Code of Conduct](CODE_OF_CONDUCT.md).
