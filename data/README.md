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
