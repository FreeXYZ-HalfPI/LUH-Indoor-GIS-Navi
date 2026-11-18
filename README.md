# LUH-Indoor-GIS-Navi

[![Tests](https://github.com/FreeXYZ-HalfPI/LUH-Indoor-GIS-Navi/actions/workflows/tests.yml/badge.svg)](https://github.com/FreeXYZ-HalfPI/LUH-Indoor-GIS-Navi/actions/workflows/tests.yml)

A Free Software prototype of an indoor navigation system for Leibniz
Universität Hannover. It uses GIS data, graph-based routing and building
floor plans.

**From room XX in building YY → to room ZZ in building WW.** It runs in the
phone browser, with nothing to install, no GPS and no personal data.

> **Why this exists, and who it is for** (new arrivals, international and exchange students,
> people with disabilities, visitors, everyday users): [docs/IDEA.md](docs/IDEA.md).

## Project overview
Finding rooms inside university buildings is often hard for new students and
visitors. LUH's [Standortfinder](https://standortfinder.uni-hannover.de/de/)
shows *where* a building is, and [Rauminfo](https://info.cafm.uni-hannover.de/de/)
shows a floor plan with the room in red. Neither tells you *how to get there*:
which entrance, which way, which floor. Outdoor navigation ends at the building
door, and nobody guides you inside.

## Goal
Build an open-source navigation web app that routes students from one room to
another across the campus:

1. You enter where you are (a room or building code) and where you want to go.
2. The app computes the walking route **on your phone**, between the best
   building entrances, using OpenStreetMap footpaths.
3. It tells you the floor and wing of the target room and shows the official
   floor plan.
4. In **9 buildings** it already routes door to door: corridors, stairs and
   lifts, drawn on the floor plans (pilot, approximate): **1101 Hauptgebäude**,
   **3101 Schneiderberg-Gebäude** (IPI, GIH), **3109 Verfügungsgebäude** (IfE),
   **3408 Hochhaus Appelstraße** (IKG), **3110 Hauptmensa**, **1106 Wilhelm-Grunwald-Haus**
   (International Office) **1139 Im Moore 13** (ptb), **1112 Lessinghaus** (AStA) and **3428 Callinstraße 14** (ZQS).
   The geodesy institutes IPI, GIH, IKG and IfE are the first targets.
5. Directions say **left, right or straight on**, and distances come in
   **steps** (an average adult step, 0.75 m) with the metres behind them:
   "Turn left, then walk 30 steps (23 m)."

   ![Turn-by-turn directions from Prof. Heipke's office (3101) to Prof. Flury's office (3109): each walk split into arrows and steps](docs/img/turn-by-turn.jpg)

🚀 **Try it:** <https://freexyz-halfpi.github.io/LUH-Indoor-GIS-Navi/>
(examples: [Hauptgebäude E028 → TI-Gebäude 3703.001.107](https://freexyz-halfpi.github.io/LUH-Indoor-GIS-Navi/#from=1101.000.E028&to=3703.001.107),
[inside the Hauptgebäude, ground floor → 4th floor](https://freexyz-halfpi.github.io/LUH-Indoor-GIS-Navi/#from=1101.000.E028&to=1101.004.F407),
[lecture hall A104 → Hauptmensa 205A](https://freexyz-halfpi.github.io/LUH-Indoor-GIS-Navi/#from=3101.001.A104&to=3110.002.205A))

**In the app:** the **About** button explains the idea and how to use it; every route has a
**Comment on this route** form; with *Avoid steps* on you get a clear warning when a route still
needs stairs. The layout adapts to phone, tablet and desktop.

### Living in a dorm of the Studentenwerk

Type the name or street of a dorm (*Dorotheenstraße*, *Schneiderberg*, *Wohnheim*) as your start, then
your room: [Dorotheenstraße 5A/5B → A260 in the Schneiderberg-Gebäude](https://freexyz-halfpi.github.io/LUH-Indoor-GIS-Navi/#from=dorotheenstrasse-5a-und-5b&to=3101.002.A260).
19 houses of the Studentenwerk Hannover are included. Dorms near the campus are routed on foot; for a
long walk the directions also name the stop near your dorm, the stop near your goal and the Stadtbahn or bus line
they share. Dorms far away are treated like stations: ride to a stop near the goal, then walk.

### Coming from the station or the bus stop

Choose **Hannover Hauptbahnhof**, the **ZOB** or any tram/bus stop near the campus as your start
(type *Hbf*, *Bahnhof*, a stop name), then the room you want, for example
[Hauptbahnhof → room A260 in the Schneiderberg-Gebäude](https://freexyz-halfpi.github.io/LUH-Indoor-GIS-Navi/#from=hannover-hauptbahnhof&to=3101.002.A260).
The big stations are far from the campus paths, so the app names the stop nearest to your goal
(with the lines OpenStreetMap lists for it), links the GVH planner for times, and routes the walk from
that stop to the room, door to door. It works the other way round too (room → station).

## What works today

| Person to person | Room to room, door to door | Every room on the map, per floor |
|---|---|---|
| ![Route from the office of the LUH president (1101.001.A120) to the office of Prof. Heipke (3101.001.B143)](docs/img/person-to-person.jpg) | ![Route from 1101.001.F111 to lecture hall F102, both rooms outlined on the map](docs/img/room-to-room.jpg) | ![Room explorer: labelled room outlines of the Schneiderberg-Gebäude ground floor, room A020 selected](docs/img/room-explorer.jpg) |

- **3,235 rooms** in the 9 mapped buildings, found by the room crawler. LUH
  Rauminfo lists only 143 of them (the lecture and seminar rooms).
- **2,981 rooms (92%) are routable** door to door, across floors and buildings
  ([coverage per floor](docs/COVERAGE.md)).
- **Find people:** type a name instead of a room code ("Christian Heipke",
  even with a typo like "Eping" for Epping) and the app routes to their office.
  393 people of the Präsidium, 4 Dezernate, 14 institutes, the International Office and the ZQS in
  1101, 1106, 3101, 3109, 3408 and 3428, read from the contact cards on public LUH pages
  (`tools/crawl_people.py`, no phone or e-mail); 390 of them door to door.
- **Room explorer:** zoom in on a building with a purple dashed frame, pick a
  floor, tap any room and choose *Start here* / *Go here*. Public rooms show
  their type and size.

Try: [Prof. Heipke (IPI) → Prof. Sester (IKG, 6th floor of the Hochhaus)](https://freexyz-halfpi.github.io/LUH-Indoor-GIS-Navi/#from=christian-heipke&to=monika-sester) ·
[Prof. Heipke (IPI) → Prof. Flury (IfE)](https://freexyz-halfpi.github.io/LUH-Indoor-GIS-Navi/#from=christian-heipke&to=jakob-flury) ·
[the president's office → Prof. Heipke](https://freexyz-halfpi.github.io/LUH-Indoor-GIS-Navi/#from=volker-epping&to=christian-heipke) ·
[room A020 on the map](https://freexyz-halfpi.github.io/LUH-Indoor-GIS-Navi/#to=3101.000.A020) ·
[3rd-floor office in the Hauptgebäude → Mensa 2nd floor](https://freexyz-halfpi.github.io/LUH-Indoor-GIS-Navi/#from=1101.003.G315&to=3110.002.262) ·
[2nd-floor mezzanine F220 → 3101 attic A320](https://freexyz-halfpi.github.io/LUH-Indoor-GIS-Navi/#from=1101.002.F220&to=3101.003.A320)

### Crawl all rooms of a building

```bash
python3 tools/crawl_rooms.py https://info.cafm.uni-hannover.de/de/building/3101/rooms
python3 tools/build_indoor.py build 3101
python3 tools/coverage.py
```

People: `python3 tools/crawl_people.py` reads the pages listed in
[data/people_sources.json](data/people_sources.json).

The crawler guesses room numbers per floor and wing, keeps those that have a
CAFM floor plan, and reads each room's position and outline from its red
highlight. It is polite (one request at a time, cached, resumable). See
[data/README.md](data/README.md) and [docs/INDOOR_FORMAT.md](docs/INDOOR_FORMAT.md).

➡ Full idea: **[docs/CONCEPT.md](docs/CONCEPT.md)** · Plan: **[ROADMAP.md](ROADMAP.md)** ·
Field test: **[docs/field-test/](docs/field-test/README.md)** ·
Data: **[docs/DATA_SOURCES.md](docs/DATA_SOURCES.md)**

## Principles
- 📱 **Mobile web app (PWA).** Open the link, optionally "Add to Home Screen".
  Works offline after the first visit.
- 🔒 **Privacy first.** No GPS, no accounts, no tracking. Routes are computed
  on the device.
- 🗺️ **Open data.** OpenStreetMap plus public LUH building and room data.
- 🆓 **Free Software.** [GNU GPL v3](LICENSE).

## Features
- [x] Indoor routing (9 buildings, approximate)
- [x] Turn-by-turn directions (left / right / straight on), distances in steps
- [x] Multi-floor buildings, stairs and lifts
- [x] Outdoor → indoor transition
- [x] All rooms of a building, not only the public ones (room crawler)
- [x] Room explorer on the map
- [x] Search for people: route to a person's office
- [x] Mobile interface, works offline
- [ ] QR-code positioning
- [ ] Accessible (step-free) routing with verified data ("Avoid steps" uses lifts today)
- [ ] Digital-twin integration
- [ ] International Office, Mensa and public services; directions for exchange
      students, event visitors, new students, people with disabilities
      ([future goals](ROADMAP.md#future-goals-written-down-not-started))

The user journey: *Where are you? → Where do you want to go? → exact address
of the classroom → best path → site plan oriented to where you are, with no
sensors and no IMU.*

## Repository layout
```
docs/    concept, architecture, data sources, indoor graph format
tools/   Python scripts that build the data (LUH rooms, room and people crawlers, OSM walk graph, indoor graphs, coverage, field-test routes)
tests/   offline tests: Python tools and data (python3 -m unittest discover tests),
         web app JavaScript and routability (node --test "tests/js/*.test.mjs", Node 22+)
web/     the static mobile web app (served by GitHub Pages)
data/    indoor sources per building, entrance overrides, raw cache (not committed)
```

## Run locally
```bash
python3 -m http.server 8000 --directory web
```
Then open <http://localhost:8000>.

## License
Copyright © 2026 Mohammad B. Saryazdi and contributors.
Licensed under the **GNU General Public License v3.0 or later**. See [LICENSE](LICENSE).

The GPL covers the **program code**. The data is separate and has its own terms,
listed in [web/data/LICENSE-DATA.md](web/data/LICENSE-DATA.md):

- Map data © [OpenStreetMap](https://www.openstreetmap.org/copyright) contributors (ODbL).
- Building and room data, floor plans and the graphs derived from them
  © Leibniz Universität Hannover. Not free-licensed until LUH grants permission.
- The people file is personal data from public LUH pages, not free-licensed.

Documentation and screenshots in `docs/` are offered under GPL-3.0-or-later too,
unless a file says otherwise. The map server can be changed in
[web/js/config.js](web/js/config.js).
