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
