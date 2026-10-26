# Data sources

| Data | Source | How we use it | License / status |
|---|---|---|---|
| Building list (number, name) | Rauminfo, `https://info.cafm.uni-hannover.de/de/` | Crawled by `tools/fetch_luh_data.py` | © LUH. Factual data. Permission requested (see below) |
| Room list per building | `https://info.cafm.uni-hannover.de/de/building/<id>/rooms` | Crawled; IDs only | © LUH |
| Room details & floor plan image | `https://info.cafm.uni-hannover.de/de/room/<room-id>`, image `…/images/room/floorplan/<room-id>` | **Linked**, never copied. The image loads directly from LUH servers | © LUH |
| Building coordinates & address | Standortfinder search endpoint `https://standortfinder.uni-hannover.de/search` (POST `search=<building-id>`) | Fetched once per building | © LUH |
| Indoor graph (corridors, room positions) | Derived from the CAFM floor plan images by `tools/build_indoor.py` | Only the derived graph is committed; the images stay on LUH servers and are cached locally in `data/raw/` | © LUH (derived), see Permission |
| Footpaths, building outlines, entrances | OpenStreetMap via the Overpass API | `tools/build_walk_graph.py` builds `web/data/walkgraph.json` | © OpenStreetMap contributors, [ODbL](https://opendatacommons.org/licenses/odbl/) |
| Map tiles | `tile.openstreetmap.org` | Background map in the app | © OpenStreetMap contributors. [Tile usage policy](https://operations.osmfoundation.org/policies/tiles/) |

## Room ID format

`BBBB.FFF.RRRR`, for example `1101.000.E028`:

- `1101`: building (Hauptgebäude, Welfengarten 1)
- `000`: floor. `000` is the ground floor, `001` the 1st floor, `002` the 2nd
  floor. Basements use negative or `U`-prefixed codes (the parser in
  `web/js/rooms.js` handles both).
- `E028`: room. The letter is usually the wing or section of the building.

## Being a good citizen

- The crawlers send a descriptive `User-Agent`, wait between requests, and
  cache results in `data/raw/`. They are run rarely, by hand.
- The app never calls the LUH servers from the user's phone, except for loading
  the floor-plan image when the user opens it.

## Permission

The building and room data comes from public LUH web pages. Before a public
launch we will contact LUH (Dezernat 3 / Gebäudemanagement, CAFM team) to ask
for permission and, ideally, an official data export including entrances.
