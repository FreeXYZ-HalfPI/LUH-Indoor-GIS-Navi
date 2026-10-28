# Roadmap

See [docs/CONCEPT.md](docs/CONCEPT.md) for the full idea.

## Phase 0: Concept & repository ✅
- [x] Problem statement, principles, architecture ([docs/CONCEPT.md](docs/CONCEPT.md))
- [x] GPLv3 license, contribution guide, roadmap
- [x] Document the data sources ([docs/DATA_SOURCES.md](docs/DATA_SOURCES.md))

## Phase 1: Building-to-building navigator (MVP) 🚧
- [x] `tools/fetch_luh_data.py`: crawl buildings and rooms from LUH Rauminfo
      (CAFM) and get coordinates from the Standortfinder
- [x] `tools/build_walk_graph.py`: extract the pedestrian network and building
      entrances from OpenStreetMap (Overpass API)
- [x] Static mobile web app (`web/`)
  - [x] Search "From" / "To" by room code, building number or building name
  - [x] Parse room code → building, floor, wing
  - [x] Outdoor walking route between the best entrance pair (Dijkstra, on device)
  - [x] Map with route, distance and walking time
  - [x] Step-by-step text guidance, including floor and wing hints
  - [x] Link to and preview of the official CAFM floor plan of the target room
  - [x] German / English
  - [x] Installable PWA with offline cache
- [x] Deploy to GitHub Pages (workflow in `.github/workflows/pages.yml`)
- [ ] Field test on campus Welfengarten with real students; collect feedback

## Phase 2: Better data & indoor routing for pilot buildings 🚧
- [ ] Verify and add missing building entrances (OSM edits + local overrides)
- [x] Indoor graph format ([docs/INDOOR_FORMAT.md](docs/INDOOR_FORMAT.md)): rough
      corridors by hand, everything else derived from the CAFM floor plans
      (`tools/build_indoor.py`)
- [x] Digitise the pilot building **1101 Hauptgebäude** (5 floors, 48 of 57
      public rooms, 15 entrances, 12 staircases, 3 lifts; approximate)
- [x] Indoor + outdoor routing combined into one route (door to door)
- [x] Floor plan viewer with the route drawn on top
- [x] Two more example buildings: **3101 Schneiderberg-Gebäude** (3 floors,
      9/9 rooms) and **3110 Hauptmensa** (4 floors, 8/8 rooms)
- [x] Crawl all rooms of the 3 example buildings (`tools/crawl_rooms.py`):
      1101 1227 rooms (1035 routable), 3101 261 (232), 3110 234 (217)
- [x] Trace corridors for the 1101 2nd-floor mezzanine and the attic floors
      3101/003 and 3110/004: 1101 1082 routable, 3101 240, 3110 222
- [x] Search for people (`tools/crawl_people.py`): 302 people in 1101 and 3101
      from public LUH contact cards (Präsidium, 4 Dezernate, 12 institutes);
      route by name, e.g. president → Prof. Heipke
- [x] 1101 H wing and E2xx strip routable (outline tolerance): 1101 1106
      routable rooms, 3101 244; 299 of 302 people door to door
- [ ] More people: institutes without a team page with rooms (Angewandte
      Mathematik, Didaktik der Mathematik und Physik, Simulation), the ServiceCenter
- [ ] 16 rooms in the 1101 H wing (e.g. H102) have no shape on the CAFM plans;
      place them by hand (`room_points`) after a visit on site
- [ ] Remaining unrouted rooms: no corridor visible on the plan (e.g. 1101
      C201–C209 strip), drawn outside the outline, or no red highlight
- [ ] Walk the routes in the 3 example buildings on site and correct their `source.json`
- Scope for now: these **3 example buildings**. More buildings come later.

## Phase 3: Positioning without GPS
- [ ] QR codes / short codes at entrances, stairs and junctions ("You are here")
- [ ] Printable QR sign generator for the university
- [ ] Deep links: `…/#from=1101.000.E028&to=3403.001.123` (shareable, e.g. in StudIP)

## Phase 4: Accessibility & polish
- [ ] Step-free routing (elevators, ramps) using LUH barrier-free data
- [ ] Screen-reader friendly route text, high-contrast mode
- [ ] Links to the public-transport planner for distant campuses (Garbsen, Herrenhausen)
- [ ] Automated data refresh (scheduled GitHub Action)

## Phase 5: Ideas
- [ ] Orient the site plan to the user's view without sensors (pick a visible landmark)
- [ ] Digital-twin / IFC integration if LUH provides BIM data
- [ ] Timetable integration: "Navigate to my next lecture"
