# Changelog

## [Unreleased]
### Added
- **One command per building:** `tools/run_building.py <building>` runs crawl, fit, corridors, build, entrances and
  coverage, and prints the result (rooms found, routable, why not). `--report`, `--debug`, `--serve` (local web app).
- **Automatic corridors, stairs and lifts:** `tools/auto_corridors.py` finds them from the floor plans (centre lines of
  the walkable space; stairs by their tread lines, lifts by the boxed cross), written to `auto_corridors` and
  `auto_connectors` in `source.json`; hand-made `corridors` and `connectors` still work and are never overwritten.
  `build_indoor.py fit --debug` draws the OSM outline on the plan.
- **3703 TI-Gebäude** mapped door to door (6 floors, 206 rooms, all routable; corridors automatic, not verified on site).
### Added
- `tools/check_links.py` and a weekly *Link check* workflow (opens an issue with dead links); tests that fail when the
  room and people counts in README, IDEA.md and RISKS.md drift from the data; New ideas section in `docs/IDEA.md`.
### Changed
- Deploys write the commit id into the service worker cache name; vector map files (OpenFreeMap) are cached for offline
  use; the Overpass fallback mirrors are now `z.` and `lz4.overpass-api.de` and the tool prints which one answered.
### Fixed
- Review of 2026-11-23 (all links, tools, docs): the TopPlus Open "Datenquellen" attribution link (404) now points to the
  BKG data page; `docs/RISKS.md` numbers brought up to date (393 people, tests); `CONTRIBUTING.md` says that
  `crawl_rooms.py` also needs Pillow + numpy. Open findings are tracked as GitHub issues.
### Added
- **International Office and partners:** the Wilhelm-Grunwald-Haus (1106, 3 floors, 94 rooms) and the
  house Im Moore 13 (1139, ptb, 26 rooms) are mapped door to door. New named destinations in
  `web/data/services.json`: International Office (room 013), Welcome Centre (031), ServiceCenter (1101.001.F135),
  AStA (building 1112 Lessinghaus, with the note that its rooms are reachable by steps only), ptb (1139) and
  ZQS (3428, room 314). A service can now carry a `room`; the route then ends in that room.
- **People:** 28 staff of the International Office and 22 of the ZQS are findable by name
  (393 people in total; 368 door to door). The ZQS and AStA buildings (3428, 1112) have their room lists but
  no indoor map yet: the OpenStreetMap outlines do not fit the floor plans.
- **Hauptgebäude path review:** the 2nd-floor south wing had no corridor, so its rooms and the stairs
  `S-south-west` were cut off; two corridors added (`data/indoor/1101/source.json`). Check: all 1,106
  routable rooms and 15 entrances form one connected graph, no detour edges.

- **AStA and ZQS buildings mapped:** 1112 Lessinghaus (2 floors) and 3428 Callinstraße 14 (5 floors) are
  routable door to door (63/65 and 85/89 rooms). The automatic fit failed on their OSM outlines, so the
  plans were placed by an overlap search (rotation, scale, shift) and checked on an overlay; 3428 uses two
  OSM ways, 1112 forces its east wing in. Entrance of 3428 added by hand. 390 of 393 people are now door to door.

### Fixed
- `tools/crawl_rooms.py` skipped floors that lie between two floors with public rooms (floor 001 of 1106 and
  floor 002 of 3428 were missing). It now looks at every floor between the lowest and the highest.

- **Student dorms as start or destination:** the 19 open houses of the Studentenwerk Hannover
  (`web/data/dorms.json`, built by `tools/build_dorms.py` from the Studentenwerk's public pages and
  geocoded with Nominatim; only name, address and position are stored). Type *Dorotheenstraße*,
  *Schneiderberg*, *Wohnheim* ... Houses on the walk graph are routed door to door, for example
  Dorotheenstraße 5A/5B → 3101.002.A260 (2.1 km on foot). Houses far from the campus paths, or in another
  campus area than the goal, are treated like stations (ride to a stop near the goal, then walk).
  Menschingstraße is left out (emptied for demolition; the new building is expected from autumn 2026).
- **"Long walk" ride tip:** when the walk is over 1.5 km, the directions also name a stop near the start and a
  stop near the goal that share a Stadtbahn or bus line (from OpenStreetMap), with the distances, and link the GVH
  planner. Example: Dorotheenstraße → A260: *ride Stadtbahn 4, 5 from Schaumburgstraße to Schneiderberg /
  Wilhelm-Busch-Museum*. A sixth one-tap example on the start page.

- **Choose the background map** (button **Map style** / **Kartenstil** on the map, bottom left): 10 maps
  in three groups. *Germany*: OpenStreetMap Deutschland (German names) and the official
  **BKG TopPlus Open** in colour, grey and light. *World*: OpenStreetMap (default), OpenTopoMap,
  CyclOSM. *Vector (MapLibre)*: OpenFreeMap Liberty, Positron and Bright, drawn with MapLibre GL JS
  (BSD-3-Clause, vendored in `web/vendor/maplibre`, loaded only when a vector map is picked). Each card
  has a colour swatch and a one-line note; nothing is fetched from a provider until it is chosen. The
  choice is saved on the device. Attribution switches with the map. Without WebGL the vector maps are
  greyed out with a note, and a vector map that fails to start leaves the previous map in place.
  The list is `BASEMAPS` in `web/js/config.js`; the privacy drafts name the providers.

- **Offline-ready message** in the footer once every building is saved ("✓ Ready offline: routes and
  directions work without internet; the map background only where you have looked"), or a
  hint when only some are (data saver, or a building not opened yet). Says nothing when the
  browser cannot save the app (private window): no false promise.
- **Install on your phone** button (when the browser offers it) and an iPhone tip in the About page.
- **Print directions** button under a route, and a print layout (title with the route and link, the
  steps only, no map or buttons), for people who prefer paper.

- **About page** inside the app (the **About** / **Über** button replaces the **?**): why the Navigator
  exists, who it is for (new and international students, exchange students, people with disabilities,
  visitors, everyone on campus), the idea, how to use it, what the map symbols mean, privacy and
  honesty, where the project stands. Full screen, German and English, with an "Try an example" button.
- **Comment on this route** replaces the "Report a problem" link: a form with a category (wrong
  entrance, door locked, stairs or lift wrong, wrong floor, other), an optional step number and the
  person's own words. Sending opens GitHub with the comment filled in (still a GitHub account; a
  real anonymous comment box would need a server). Only room codes and the text go in. Fixed:
  a route that started at a stop was reported as `stop:kropcke` with a broken app link.
- **"Pass auf! Achtung!"** with "Avoid steps" on: a loud red warning when no step-free way exists
  and the route still has stairs or steps (counts them), else a calm green note that there are none.
- **Responsive layout**: two columns on a desktop (planner, guide and directions left, a tall map on
  the right), one column on tablet and phone; before a route is chosen the guide comes first on a
  phone. New header with a logo, **Popular places** chips (I am at the Hauptbahnhof, International
  Office, Hauptmensa, Hauptgebäude), softer cards.

- **Start (or end) at a station or stop:** type *Hbf*, *Hauptbahnhof*, *ZOB* or the name of a
  tram/bus stop near the campus (64 stops, from OpenStreetMap, `web/data/stops.json`, built by
  `tools/build_stops.py`). From a **campus stop** the walk is routed door to door. The two **big
  stations** lie outside the walk graph, so the directions say: ride to the stop nearest to the goal
  (with the Stadtbahn/bus lines OpenStreetMap lists for it, and "other stops near the goal"), link the
  GVH planner for times, then walk from that stop to the room. Works the other way round (room →
  station). Example: *Hauptbahnhof → 3101.002.A260*. A fifth one-tap example on the start page.
  Lines can be incomplete; the app says so and never promises a direct ride it cannot know.

- **Umlauts without a German keyboard:** the search treats `ae`, `oe`, `ue` like `ä`, `ö`, `ü`
  (and `ss` like `ß`, as before): "Mueller" finds Müller, "Verfuegungsgebaeude" finds the
  Verfügungsgebäude, "Hochschulbuero" finds the International Office. Useful for international
  students. Data and query are folded the same way, so names like "Michael" still match.

- **Service places** (`web/data/services.json`): a named place that people look for by name and that
  points to a building. First one: the **International Office** (Wilhelm-Grunwald-Haus, building 1106).
  Type "International" and route door to door to it (or `#to=international-office`); the directions
  add where it is and link its page for opening hours, which are not stored. The way inside the
  building is not mapped yet. A fourth one-tap example ("New here? Hauptgebäude → International
  Office"). Tests for the lookup and for a route to every service.

- **Guide for first-time users:** the start page now says what to do (three steps, a hint
  for the next field once one is chosen, a note on "Avoid steps", and three one-tap example
  routes). A **?** button opens a help dialog with the same steps, a legend of the map
  symbols (A, B, numbered steps, floor buttons, purple frames) and tips. German and English.
- **Idea and motivation** ([docs/IDEA.md](docs/IDEA.md)): the problem, the target groups
  (new arrivals, international and short-term exchange students, people with disabilities
  as Chancenvielfalt, visitors, everyday users), principles, what exists, what we do not
  claim, and what we ask of the International Office. With a German summary.

### Changed
- `docs/IDEA.md`: "What exists today" brought up to date (stations, dorms, International Office, About page,
  offline, map styles). The presentation for the International Office has a new slide "From the station,
  from your dorm, to the office".
- Text size follows the browser or phone setting (body font in `rem`, not `px`); the A/B dots and
  the swap button scale with it. Checked at 200 % on a 375 px screen.
- 1101 re-crawled after the weekly room check flagged `1101.004.B419`: it is now a public
  room on Rauminfo (Besprechungsraum, 37 m²) and shows its type and size. The map was
  already routing to it; coverage is unchanged (1106 of 1227 rooms).
- The step-tag logic (place and floor of a direction step) moved from `app.js` into
  `web/js/steptags.js` and has unit tests (`tests/js/steptags.test.mjs`).

### Added
- **Numbered step markers on the map:** every step of the directions that happens at a
  place (leave a door, walk, stairs or lift, enter a building) gets a purple numbered
  marker, and the number is the number in the list. Tap a step and the map moves to its
  place, switches to its floor and enlarges the marker; tap a marker and its sentence is
  highlighted in the list (a bar and a background, not colour alone). Markers on other
  floors are faint; the first and last step stand at A and B and get no marker of their own.

- **Weekly room-list check** (`tools/check_rooms.py`, `.github/workflows/room-check.yml`):
  compares the public Rauminfo room list of each mapped building with the rooms our
  maps were built from, and opens or updates one GitHub issue when rooms are new or
  gone, or a page could not be read. Standard library only, one request per building.
  The first run already found a new room: `1101.004.B419`.

- **Lazy loading per building:** the app starts with the outdoor data only; a
  building's indoor map (45–195 kB) is fetched when a route starts or ends in it
  or when it comes into view on the map, and the others load in the background
  when the phone is idle (not with "data saver" on). The purple map frames come
  from the new `data/indoor/frames.json` (written by `build_indoor.py` with
  `index.json`), so adding buildings no longer slows the first start. The
  service worker caches each building file on first use. Tests: a route over
  two lazily loaded buildings equals the full-graph route.
  Known gap: public-room type and size in the search list appear once a
  building has loaded.

- **Accessibility first pass:** visible keyboard focus everywhere, a "skip to route
  planner" link, 44 px touch targets (floor buttons, swap, chips), readable
  confidence colours in dark mode, `aria-selected` / `aria-activedescendant`
  kept in sync in the search lists, named and `aria-pressed` floor buttons,
  `prefers-reduced-motion` and `forced-colors` support.

- **Route confidence level** at the top of the directions: ●●● high (every floor
  checked on site), ●●○ medium (traced from floor plans, not yet walked) or
  ●○○ low (an end without indoor map, a guessed entrance, or a room code that is
  not in the room list), with the reason in one line. German and English. Rules in
  `routeConfidence()` (`web/js/confidence.js`) with tests; today every route is
  medium or low, because no floor has been walked yet.

- **Field-test kit** (`docs/field-test/`): a protocol for testers and
  maintainers, checklists of 40 routes per building (entrance to every floor,
  same floor, across floors with and without steps, to the nearest buildings)
  with a link per route, and `routes.csv` for the results. Generated by
  `tools/field_test.py`; a test checks that every route stays routable.
- **Drafts of the imprint and privacy statement** (`docs/legal/`, German and
  English), written from what the app actually sends and stores, with
  placeholders for the operator's details and the open decisions (people
  search, map tiles, hosting). Not published in the app yet.
- **Confidence per floor:** a floor can be marked as *verified on site* after a
  field test (`"verified": {"000": "2026-11-20"}` in `source.json`, then
  `python3 tools/build_indoor.py status <building>`, which needs no floor plans
  or network). The directions say which floors of a route were checked and tag
  each indoor step *✓ checked on site* or *≈ approximate*; `docs/COVERAGE.md`
  gets an "on site" column. No floor is verified yet.
- **"Report a problem with this route"** link under the directions: opens a
  new GitHub issue filled in with the start and destination codes, the
  "avoid steps" setting and a link back to the route. A person is reported as
  their office room, never by name.
- **JavaScript tests** for the router, the turn-by-turn steps and the search
  (`tests/js/`, Node 22+ built-in test runner, no npm packages), and a
  **routability check** on the generated data: every indoor entrance joins an
  OSM entrance, every routable room reaches an entrance of its building, and
  routes between buildings never cut through a third one. Runs in CI.
- **Free-software compliance** (after reviewing the GNU/FSF guidelines): `web/data/LICENSE-DATA.md`
  states that data files have their own terms (OSM ODbL, LUH, people file) and are not
  GPL; LibreJS `@license` headers on all scripts and Leaflet; the map tile server is
  now set in `web/js/config.js` (the service worker caches tiles from any host).
- **Roadmap to a real-world solution** (`ROADMAP.md` phases A–F), risk list
  (`docs/RISKS.md`) and a draft request to LUH (`docs/LUH_REQUEST.md`).
- **Turn-by-turn directions:** every walk is split into straight runs, and
  the steps say *turn left*, *turn right*, *bear slightly left*, … with an
  arrow (`web/js/turns.js`). Small wiggles of corridors and footpaths are
  ignored (indoors below 5 m, outdoors below 15 m).
- **Distances in steps:** "30 steps (23 m)", with an average adult step of
  0.75 m; the route summary too.
- Two new buildings for the geodesy institutes: **3109 Verfügungsgebäude**
  (IfE; 313 rooms, 298 routable, 2 staircases, 2 lifts) and **3408 Hochhaus
  Appelstraße** (IKG; 926 rooms on 18 floors, 843 routable, ring corridor,
  stairs and 2 lift groups). The people search adds IfE (19) and IKG (20):
  343 people, 340 door to door. All buildings: 2713 of 2961 rooms routable.
- `ROADMAP.md`: future goals (International Office, Mensa and public
  services; exchange students, event visitors, people with disabilities,
  new students, everyone at the university).

### Changed
- **Shorter indoor directions.** Indoor steps no longer list step counts, metres
  or a turn-by-turn sublist. A step says where to turn (left/right only), which
  known room you pass and where it ends: "On the 1st floor, turn left, follow the
  corridor past B124 (GIH library) to room 3101.001.B147." Rooms people recognise
  live in `web/data/landmarks.json` (hand-written; add more). A route to a person
  ends with "Say hi to <name>! 👋". Outdoor steps are unchanged.
### Fixed
- **The map follows the floor of the route.** The start room and the indoor
  route were drawn on whatever floor was shown, so a route from 3101.001.B154 to
  3101.002.A255 looked as if both rooms were on the same floor. Now a room is outlined
  only on its own floor, the route's parts on other floors are faint, the floor
  buttons of the route's floors have a dot, and tapping a step ("On the 1st floor, walk
  …", "Take the stairs up …") shows that floor and its part of the route.

### Fixed
- Updates arrive at once: the service worker revalidates every file with the
  server (GitHub Pages lets browsers cache for 10 minutes, so phones ran the
  old version), and an open page reloads once when a new version takes over.
- Turn arrows are larger and the turn lines in full colour.
- Lifts paid their waiting time on every floor (25 m per floor), so routes
  climbed 6 floors by stairs. Now every lift stop links to every other stop and
  a ride costs 20 m + 2 m per floor: stairs for 1–2 floors, the lift above.

### Changed
- The arrival message is general ("You have arrived at your destination"),
  not about lectures.
- `crawl_rooms.py`: room numbers are guessed as floor × 100 + room, so a
  high-rise works (105 on floor 1, 1004 on floor 10).

### Fixed
- Hauptgebäude **H wing** and **E2xx strip** are routable: their rooms lie up
  to 3.6 m outside the OSM outline (georeference drift at the ends of the
  200 m building). Rooms up to 4 m outside now count as inside
  (`ROOM_OUTLINE_TOLERANCE_M`); inset drawings, 4.6 m and more away, stay out.
  1101: 1106 routable rooms (was 1082), 3101: 244 (was 240); people 299 of
  302 door to door (was 293).
- People search: names with a degree after a comma ("Christian Beckemeier,
  M. Sc.") were not found by surname; no more "M. Sc.." at sentence ends.

### Added
- **Find people:** type a name ("Christian Heipke", typos allowed: "Eping")
  and the app routes to that person's office; room popups list who sits there.
  Links work with names: `#from=volker-epping&to=christian-heipke`.
  `tools/crawl_people.py` reads the contact cards of public LUH pages listed
  in `data/people_sources.json` → `web/data/people.json` (302 people in 1101
  and 3101: Präsidium, Dezernate 1/3/5/6 and 12 institutes found with the
  Standortfinder; name, role, institute and room only). People whose room is
  not routable yet (9) get a route to the building, then floor and room.
- **Room explorer** on the map: zoom in on a mapped building, pick a floor,
  tap any room to start or end a route there. Selected rooms are outlined;
  public rooms show type and size. The map now zooms to room level (21).
- `tools/coverage.py` → `docs/COVERAGE.md`: rooms found / routable per floor
  and why the rest is not routable yet (from the new `build_report.json`)
- `crawl_rooms.py` takes several buildings in one run
- Offline tests (`tests/`) and a GitHub Actions workflow running them
- `tools/crawl_rooms.py`: finds **all** rooms of a building, not only the
  public ones. Rauminfo lists few rooms, but every floor plan exists for every
  room; the crawler guesses room numbers per floor and wing, keeps those with
  a plan, and takes each room's position and outline from its red highlight.
  Output `data/indoor/<b>/rooms.json` (+ GeoJSON) is used by the app and by
  `build_indoor.py`. The "Room info" link is shown only for public rooms.
- 3101 Schneiderberg-Gebäude: 261 rooms found (9 public), 232 routable
- 3110 Hauptmensa: 234 rooms found (8 public), 217 routable
- 1101 Hauptgebäude: 1227 rooms found (57 public), 1035 routable
- Corridors traced for the 1101 2nd-floor mezzanine (north corridor, middle
  wing, west wing, Lichthof gallery) and the attic floors 3101/003 and
  3110/004, with their stairs: 1101 now routes to 1082 rooms, 3101 to 240,
  3110 to 222
- Indoor routing for two more example buildings: 3101 Schneiderberg-Gebäude
  and 3110 Hauptmensa (3 example buildings in total)
- `build_indoor.py fit --coarse`: automatic georeferencing by matching the
  plan's exterior boundary to the OSM outline (rotation, scale, shift);
  coloured wall lines, any image size, several OSM outlines per building,
  hand-placed `room_points`
- `data/buildings_override.json` for names missing in the LUH data
### Changed
- Code readability: every tool and app module now explains its decisions in
  comments ("why", not only "what"), and long functions are split into small
  named steps (`build_indoor.build`, `crawl_rooms.crawl`, the walk-graph
  builder, the router and the guidance in `app.js`). Outputs are unchanged:
  rebuilt data is byte-identical and 6,050 test routes match the old router.

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
