# data/

- `raw/`: cached downloads from LUH and Overpass (git-ignored). Delete it or
  use `--refresh` to fetch fresh data.
- `entrances_override.json`: entrances to add for buildings whose entrances
  are not (yet) in OpenStreetMap. Mapping them in OSM is better, but this is
  a quick local fix:

```json
{
  "1111": [{ "lat": 52.3831, "lon": 9.7193, "kind": "main", "name": "Haupteingang" }]
}
```

After editing, re-run `python3 tools/build_walk_graph.py`.

## `indoor/<building>/rooms.json`

Every room of the building, written by `python3 tools/crawl_rooms.py <building>`
(see the script's help). Per room: `id`, `floor`, `level`, `number`, `wing`,
`listed` (has a public Rauminfo page; then also `type`, `area_m2`,
`floor_name`), `image` (red highlight on the room's CAFM plan, in image
pixels: `point` inside the room, `bbox`, convex `outline`) and, when the
building has a georeferenced `source.json`, `lat`/`lon` and `outline_lonlat`.
`extra` holds room numbers added by hand with `--extra` (odd numbers like
`A61A` that the crawler cannot guess). `rooms.geojson` is the same for QGIS.

## `people_sources.json` → `web/data/people.json`

Public LUH web pages (institute team pages, staff directories, Präsidium)
whose contact cards give a person's building and room.
`python3 tools/crawl_people.py` reads them and writes `web/data/people.json`,
so the app can route to a person: type "Christian Heipke" and it finds room
3101.001.B143. Only people in buildings with indoor data are kept.

Privacy: only what the university itself publishes for finding an office is
stored (name, role, institute, room and the source page); phone numbers and
e-mail addresses are never stored. A person who does not want to be listed
goes into `exclude`; then re-run the crawler. To add an institute, add its
team page to `pages`.

`build_report.json` (written by `tools/build_indoor.py build`) lists every room
the app cannot route to yet and why; `tools/coverage.py` turns the reports into
[docs/COVERAGE.md](../docs/COVERAGE.md).
