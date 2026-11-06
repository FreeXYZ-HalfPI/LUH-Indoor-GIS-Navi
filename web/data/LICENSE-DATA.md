# Licenses of the data in this folder

The GNU GPL-3.0-or-later in `/LICENSE` covers the **program code** (`web/js`,
`web/sw.js`, `web/css`, `web/index.html`, `tools/`, `tests/`). The data files
are separate works with their own terms. Do not assume they are GPL.

| Files | Origin | Terms |
|---|---|---|
| `walkgraph.json` | OpenStreetMap footpaths, outlines, entrances (Overpass API) | © OpenStreetMap contributors, [ODbL 1.0](https://opendatacommons.org/licenses/odbl/). Share-alike and attribution apply. The FSF lists ODbL as GPL-incompatible, so keep this data separate from code. |
| `buildings.json`, `rooms.json` | LUH Rauminfo (CAFM) and Standortfinder | © Leibniz Universität Hannover. **No license granted yet**; permission is requested (`docs/LUH_REQUEST.md`). Not free-licensed. |
| `indoor/*.json` (and `data/indoor/`) | Graphs derived by hand from LUH CAFM floor plans | Derived from © LUH material. Same status as above until LUH answers. Our own tracing work may be offered under CC BY-SA 4.0 or ODbL once LUH agrees. |
| `people.json` | Names and office rooms from public LUH institute pages | © the respective institutes. **No license granted**; personal data (GDPR). Not free-licensed. May be removed on request (open an issue). |

Until LUH grants permission, these LUH-derived files are published for the
prototype only and **may not be reused or redistributed** under the GPL or
any other free license. Forks that want a fully free distribution should
delete the LUH-derived files and rebuild them from an official export.

Map tiles are loaded from the server set in `web/js/config.js` and are not
part of this repository.
