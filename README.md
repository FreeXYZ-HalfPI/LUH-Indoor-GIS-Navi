# LUH-Indoor-GIS-Navi

A Free Software prototype of an indoor navigation system for Leibniz
Universität Hannover. It uses GIS data, graph-based routing and building
floor plans.

**From room XX in building YY → to room ZZ in building WW.** It runs in the
phone browser, with nothing to install, no GPS and no personal data.

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
4. Later: door-to-door indoor routing, and QR codes for "You are here".

➡ Full idea: **[docs/CONCEPT.md](docs/CONCEPT.md)** · Plan: **[ROADMAP.md](ROADMAP.md)** ·
Data: **[docs/DATA_SOURCES.md](docs/DATA_SOURCES.md)**

## Principles
- 📱 **Mobile web app (PWA).** Open the link, optionally "Add to Home Screen".
  Works offline after the first visit.
- 🔒 **Privacy first.** No GPS, no accounts, no tracking. Routes are computed
  on the device.
- 🗺️ **Open data.** OpenStreetMap plus public LUH building and room data.
- 🆓 **Free Software.** [GNU GPL v3](LICENSE).

## Features (planned)
- Indoor routing
- Multi-floor buildings
- Outdoor → indoor transition
- QR-code positioning
- Accessible (step-free) routing
- Mobile interface
- Digital-twin integration

The user journey: *Where are you? → Where do you want to go? → exact address
of the classroom → best path → site plan oriented to where you are, with no
sensors and no IMU.*

## Repository layout
```
docs/    concept, architecture, data sources
tools/   Python scripts that build the data (LUH rooms, OSM walk graph)
web/     the static mobile web app (served by GitHub Pages)
data/    raw cached downloads (not committed)
```

## Run locally
```bash
python3 -m http.server 8000 --directory web
```
Then open <http://localhost:8000>.

## License
Copyright © 2026 Mohammad B. Saryazdi and contributors.
Licensed under the **GNU General Public License v3.0 or later**. See [LICENSE](LICENSE).

Map data © [OpenStreetMap](https://www.openstreetmap.org/copyright) contributors (ODbL).
Building and room data and floor plans © Leibniz Universität Hannover.
