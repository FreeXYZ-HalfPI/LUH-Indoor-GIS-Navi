# Concept — LUH Indoor GIS Navi

## 1. The problem

Leibniz Universität Hannover (LUH) has more than 100 buildings spread across
several campus areas: Welfengarten / Nordstadt, Herrenhausen, Linden, Garbsen
(Maschinenbau campus) and more. Every building has its own room numbering
and many rooms.

The university already offers two useful tools:

| Tool | What it does | What is missing |
|---|---|---|
| [Standortfinder](https://standortfinder.uni-hannover.de/de/) | Search a building, room or facility and see it on a city map | No route. No information about entrances. |
| [Rauminfo / CAFM](https://info.cafm.uni-hannover.de/de/building/1101/rooms) | Room lists per building, and a floor plan per room with the room in **red** ([example](https://info.cafm.uni-hannover.de/de/room/1101.000.E028)) | You see *where* the room is, but not *how to get there*: which entrance, which staircase, which floor, which way along the corridor. |

A first-semester student who has to get from **room 1101.000.E028
(Hauptgebäude)** to **a lecture hall in building 3403** in a 15-minute break
does not get a route from either tool.

## 2. The idea

A **web app** (a Progressive Web App, PWA) that students and staff open in the
phone browser. **Nothing to install** (you can still "Add to Home Screen").

> **From:** Room XX in building YY → **To:** Room ZZ in building WW
>
> → walking route on a map, plus step-by-step text:
> *"Leave building 1101 by the main entrance → walk 320 m (≈ 4 min) to building
> 3403 → go in at the north entrance → go up to the 1st floor → the room is in
> wing B."*

## 3. Principles

1. **No GPS needed, no personal data.** The user *says* where they are (a
   room, a building, or later a scanned QR code). Location is never tracked,
   stored or sent. There are no accounts, no cookies and no analytics.
2. **Works on any phone.** It is plain HTML/CSS/JS that loads fast on mobile data
   and works offline after the first visit (Service Worker).
3. **Open data and free software.** GPLv3 code, OpenStreetMap paths, and public
   LUH room data. Anyone can check how it works and help improve it.
4. **Routing runs on the device.** The walking graph is a static file. Routes
   are computed in the browser, so no routing server sees where people go.
5. **Grow step by step.** Outdoor routing between building entrances comes
   first. Indoor routing is added building by building as indoor data becomes
   available.

## 4. How a route is built

```
 [Start room]──indoor──▶[Entrance A]──outdoor──▶[Entrance B]──indoor──▶[Target room]
   1101.000.E028          of 1101       OSM footpaths   of 3403         3403.001.xxx
```

1. **Parse the room code.** LUH room IDs look like `BBBB.FFF.RRRR`:
   - `BBBB`: building number (e.g. `1101` = Hauptgebäude)
   - `FFF`: floor (`000` = ground floor / Erdgeschoss, `001` = 1st floor …,
     `-01` / `U01` style = basement)
   - `RRRR`: room number. The first letter is often the wing/section (e.g. `E028`).
2. **Look up the building.** Building number → coordinates, address and
   entrances (from OSM `entrance=*` nodes on the building outline).
3. **Outdoor leg.** Shortest walking path (Dijkstra / A\*) on a pedestrian
   graph extracted from OpenStreetMap, from an entrance of the start building
   to an entrance of the target building. The app picks the entrance pair with
   the shortest total distance.
4. **Indoor legs.**
   - *Phase 1:* text guidance from the room code (floor, wing), plus the
     official CAFM floor plan with the room in red.
   - *Phase 2+:* real indoor graph (corridors, stairs, elevators, doors) per
     building, digitised from floor plans or OSM
     [Simple Indoor Tagging](https://wiki.openstreetmap.org/wiki/Simple_Indoor_Tagging),
     which allows door-to-door routing.
5. **Positioning without GPS (Phase 3).** QR codes / short codes at entrances,
   staircases and corridor junctions. Scanning one sets "You are here" on the
   device only.

## 5. Architecture

```
tools/ (Python, run by maintainers)          web/ (static PWA, served by GitHub Pages)
 ├─ fetch_luh_data.py  ── LUH CAFM +          ├─ index.html   UI: From / To / Route
 │                        Standortfinder ──▶  ├─ js/app.js    UI logic
 │                                    data/   ├─ js/router.js Dijkstra on walk graph
 └─ build_walk_graph.py ── OSM Overpass ──▶   ├─ js/rooms.js  room-code parser, search
                                    *.json    ├─ sw.js        offline cache
                                              └─ data/        buildings, rooms, graph
```

- **No backend.** Everything is static, so hosting is free on GitHub Pages and
  the app could later move to a university server.
- **Map:** [Leaflet](https://leafletjs.com/) with OpenStreetMap tiles.
- **Data refresh:** maintainers re-run the Python tools. Later a scheduled
  GitHub Action can do it.

## 6. Target users

- New students (Erstis) and exchange students. The UI is in **German and
  English**.
- Visitors, guest lecturers and conference participants.
- Later: people with reduced mobility (step-free routes, elevators). The
  Standortfinder already has barrier-free (`bf_*`) data that can be used.

## 7. Out of scope (for now)

- Live GPS tracking or turn-by-turn voice navigation.
- Public-transport routing between distant campuses (Garbsen ↔ Nordstadt).
  For those the app links to the GVH / Üstra journey planner instead.
- Room booking, timetables, opening hours. These could be added later through
  StudIP / LSF links.

## 8. Open questions

- **Data permission.** We should ask LUH (Gebäudemanagement / CAFM team) for
  permission or an official export of building, room and entrance data. Floor
  plan images are **linked, not copied**.
- **Indoor data source.** Do CAD/IFC/DWG plans exist that LUH could share? If
  not, we digitise them by hand from the public floor-plan images.
- **Hosting.** GitHub Pages for now. Later perhaps a `*.uni-hannover.de`
  subdomain.
