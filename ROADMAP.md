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
- [x] Geodesy institutes as first targets: IPI and GIH (3101), IfE (3109
      Verfügungsgebäude, 298/313 rooms), IKG (3408 Hochhaus, 843/926 rooms)
- [ ] 3408 floor 017: CAFM draws it without room highlights (45 rooms), place
      them by hand; floor 018 (12 rooms) is not mapped yet
- [x] Turn-by-turn directions (left / right / straight on) with distances in steps
- [ ] Remaining unrouted rooms: no corridor visible on the plan (e.g. 1101
      C201–C209 strip), drawn outside the outline, or no red highlight
- [ ] Walk the routes in the 3 example buildings on site and correct their `source.json`
- Scope for now: these **3 example buildings**. More buildings come later.

## Path to a real-world solution

Plan from the project evaluation of 2026-11-05 (see [docs/RISKS.md](docs/RISKS.md)).
Phases 0–2 above are the prototype. The order below matters: trust and
permission come before scale. Phase B starts now and runs in parallel.

### Phase A: Make the pilot trustworthy (1–2 months)
- [ ] Field-test the 5 buildings: 30–50 routes per building (cross-floor and
      cross-building) with 5–10 real students; fix `source.json`
- [ ] "Report a problem with this route" link that opens a pre-filled GitHub
      issue with the from/to IDs only (no personal data)
- [ ] JavaScript tests for `router.js`, `turns.js`, `rooms.js`
- [ ] CI check: every routable room reaches an entrance; no route cuts
      through a third building
- [ ] Show confidence per building and floor: "approximate" vs "verified on site"
- [ ] Cheap pilot gaps: H-wing `room_points`, 3408 floors 017/018, 1101 floor 005,
      1101 C201–C209 strip

### Phase B: Legal and institutional foundation (start now)
- [ ] Contact LUH (Dezernat 3 / Gebäudemanagement, CAFM team, Rechenzentrum,
      Datenschutzbeauftragte): written permission for the derived data, an official
      export (CAD/DWG/IFC, room lists, entrances), a named contact
      (draft: [docs/LUH_REQUEST.md](docs/LUH_REQUEST.md))
- [ ] Find a university sponsor (the geodesy institutes, Zentrale Studienberatung)
- [ ] Decide on people search: approval and opt-out process, or limit to offices
      (Dezernate, institute secretariats)
- [ ] Privacy statement and imprint (required for a public site in Germany)
- [ ] Hosting plan: a `*.uni-hannover.de` subdomain, GitHub stays the open-source home

### Phase C: Data that scales (3–6 months)
- [ ] Importer for official CAD/IFC data into the existing indoor format, if LUH provides it
- [ ] Otherwise semi-automatic tracing: medial axis of the free space, detected
      door openings, a small review editor for contributors
- [ ] Lazy loading per building (index file + service worker caches opened buildings)
- [ ] Scheduled GitHub Action: refresh room lists and flag changes
- [ ] 15–20 buildings that cover the daily traffic (library, main lecture halls,
      Nordstadt and Welfengarten buildings)

### Phase D: Positioning and accessibility (parallel with C)
- [ ] QR / short codes at entrances, stairs and lifts ("You are here", on the
      device only) and a printable sign generator; start with 1101 and 3101
- [ ] Deep links for StudIP (`…/#from=…&to=…`, already supported by the app)
- [ ] Step-free routing with the Behindertenbeauftragte: door widths, ramps, lift
      availability, staff-only lifts, accessible toilets; "avoid steps" as a hard
      constraint on request
- [ ] Audit the UI: screen reader, contrast, font scaling, high-contrast mode

### Phase E: Launch (about month 6–9)
- [ ] Official launch before a winter semester: Orientierungswoche, university
      website, StudIP, flyer with a QR code
- [ ] Own map tiles (self-hosted or commercial); the public OSM tile server is
      not for production traffic
- [ ] Aggregate, privacy-preserving metrics only, with a written policy
- [ ] Monitoring of broken data (routability regressions in CI) and a named
      person who answers issues

### Phase F: Grow into a service
- [ ] Other campuses (Garbsen, Herrenhausen, Linden) and links to the GVH / Üstra planner
- [ ] Event mode and an International Office / EULiST guide in English
- [ ] Timetable integration ("navigate to my next lecture"), processed on the device
- [ ] Live status of lift outages and closures from a feed that facility management keeps
- [ ] Handover: 3–5 maintainers, funding (university project or student-initiative
      fund), documented transfer to a university team

### Ideas (not planned)
- [ ] Orient the site plan to the user's view without sensors (pick a visible landmark)
- [ ] Digital-twin / IFC integration if LUH provides BIM data

## Future goals (written down, not started)

These guide the next phases. Each needs its own concrete plan before work starts.

**Next places to cover**
- [ ] International Office (first stop for every exchange student)
- [ ] Mensa and the university's public services: ServiceCenter,
      Immatrikulationsamt, library, Studentenwerk counters, IT help desk

**People the navigator is for**
- [ ] **EULiST exchange students**: they come to Hannover for a short stay, or
      leave for another EULiST university, and need to find their way from day one
      (English first, offline, no account)
- [ ] **Visitors at events** in the Hauptgebäude and at public ceremonies
      (graduations, open days, conferences): guests who have never been on campus
- [ ] **People with a specific physical disability**: needs more concrete ideas
      first, e.g. with the university's Behindertenbeauftragte. Step-free
      routes, door widths, lifts that work, accessible toilets, quiet routes
- [ ] **New students** in their first weeks (Orientierungswoche): lecture halls,
      seminar rooms, the offices they must visit
- [ ] **Everyone at the university day to day**: students and staff who know
      their own building but not the others
