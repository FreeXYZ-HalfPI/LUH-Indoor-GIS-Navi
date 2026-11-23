// @license magnet:?xt=urn:btih:1f739d935676111cfff4b4693e3816e664797050&dn=gpl-3.0.txt GPL-v3-or-later
// SPDX-License-Identifier: GPL-3.0-or-later
// Settings a fork or a host may want to change without touching the app code.

// Background map. The public OpenStreetMap server is fine for a prototype, but
// its tile usage policy forbids heavy production use. To self-host or use another
// provider, change TILE_URL (any "{z}/{x}/{y}" raster tile URL) and the attribution.
// https://operations.osmfoundation.org/policies/tiles/
export const TILE_URL = "https://tile.openstreetmap.org/{z}/{x}/{y}.png";
export const TILE_ATTRIBUTION = '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>';
export const TILE_MAX_NATIVE_ZOOM = 19;

// The background maps people can choose (the picker on the map). The first is the default.
// Every provider sees the map area a person looks at and their IP address, like any map site, so
// the choice is the person's and the privacy statement names them (docs/legal/). A fork can
// remove or add entries; raster entries need a "{z}/{x}/{y}" URL, vector entries a MapLibre
// style URL (then MapLibre GL JS is loaded from web/vendor/maplibre only when it is chosen).
//   group:  "world" | "germany" | "vector"   (headings in the picker)
//   swatch: three colours that hint at the look (no image is loaded from the provider)
export const BASEMAPS = [
  {
    id: "osm", kind: "raster", group: "world", url: TILE_URL, attribution: TILE_ATTRIBUTION, maxNativeZoom: TILE_MAX_NATIVE_ZOOM,
    name: { en: "OpenStreetMap", de: "OpenStreetMap" },
    note: { en: "The standard map: familiar and detailed.", de: "Die Standardkarte: vertraut und detailreich." },
    swatch: ["#f2efe9", "#aad3df", "#c8facc"],
  },
  {
    id: "osmde", kind: "raster", group: "germany", url: "https://tile.openstreetmap.de/{z}/{x}/{y}.png", maxNativeZoom: 19,
    attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>-Mitwirkende · Karte: <a href="https://openstreetmap.de/">openstreetmap.de</a>',
    name: { en: "OpenStreetMap Deutschland", de: "OpenStreetMap Deutschland" },
    note: { en: "German place names, as people here read the map.", de: "Deutsche Ortsnamen, so wie man hier die Karte liest." },
    swatch: ["#f2efe9", "#99b3cc", "#add19e"],
  },
  {
    id: "topplus", kind: "raster", group: "germany", maxNativeZoom: 18,
    url: "https://sgx.geodatenzentrum.de/wmts_topplus_open/tile/1.0.0/web/default/WEBMERCATOR/{z}/{y}/{x}.png",
    attribution: '© <a href="https://www.bkg.bund.de/">GeoBasis-DE / BKG</a> (dl-de/by-2-0) · <a href="https://gdz.bkg.bund.de/index.php/default/wmts-topplusopen-wmts-topplus-open.html">Datenquellen</a>',
    name: { en: "TopPlus Open (BKG)", de: "TopPlus Open (BKG)" },
    note: { en: "The official map of the German federal mapping agency.", de: "Die amtliche Karte des Bundesamts für Kartographie und Geodäsie." },
    swatch: ["#f3ecd9", "#b4d3e6", "#c7dba6"],
  },
  {
    id: "topplus-grau", kind: "raster", group: "germany", maxNativeZoom: 18,
    url: "https://sgx.geodatenzentrum.de/wmts_topplus_open/tile/1.0.0/web_grau/default/WEBMERCATOR/{z}/{y}/{x}.png",
    attribution: '© <a href="https://www.bkg.bund.de/">GeoBasis-DE / BKG</a> (dl-de/by-2-0) · <a href="https://gdz.bkg.bund.de/index.php/default/wmts-topplusopen-wmts-topplus-open.html">Datenquellen</a>',
    name: { en: "TopPlus Open, grey (BKG)", de: "TopPlus Open, grau (BKG)" },
    note: { en: "Calm and grey: your route stands out.", de: "Ruhig und grau: deine Route fällt auf." },
    swatch: ["#ececec", "#c9d0d4", "#d9dcd5"],
  },
  {
    id: "topplus-light", kind: "raster", group: "germany", maxNativeZoom: 18,
    url: "https://sgx.geodatenzentrum.de/wmts_topplus_open/tile/1.0.0/web_light/default/WEBMERCATOR/{z}/{y}/{x}.png",
    attribution: '© <a href="https://www.bkg.bund.de/">GeoBasis-DE / BKG</a> (dl-de/by-2-0) · <a href="https://gdz.bkg.bund.de/index.php/default/wmts-topplusopen-wmts-topplus-open.html">Datenquellen</a>',
    name: { en: "TopPlus Open, light (BKG)", de: "TopPlus Open, hell (BKG)" },
    note: { en: "A soft, light version of the official map.", de: "Eine weiche, helle Version der amtlichen Karte." },
    swatch: ["#f7f4ec", "#cfe2ee", "#dfe8cf"],
  },
  {
    id: "opentopo", kind: "raster", group: "world", maxNativeZoom: 17,
    url: "https://tile.opentopomap.org/{z}/{x}/{y}.png",
    attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>-Mitwirkende, SRTM · <a href="https://opentopomap.org/">OpenTopoMap</a> (CC-BY-SA)',
    name: { en: "OpenTopoMap", de: "OpenTopoMap" },
    note: { en: "Topographic: hills, forests and paths.", de: "Topografisch: Höhenlinien, Wälder und Wege." },
    swatch: ["#e9efd9", "#a5bfdd", "#9fc08a"],
  },
  {
    id: "cyclosm", kind: "raster", group: "world", maxNativeZoom: 19, subdomains: "abc",
    url: "https://{s}.tile-cyclosm.openstreetmap.fr/cyclosm/{z}/{x}/{y}.png",
    attribution: '<a href="https://www.cyclosm.org/">CyclOSM</a> · © <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>-Mitwirkende · Tiles: OpenStreetMap France',
    name: { en: "CyclOSM", de: "CyclOSM" },
    note: { en: "Made for cycling: bike lanes and bike parking stand out.", de: "Fürs Radfahren: Radwege und Fahrradständer fallen auf." },
    swatch: ["#f8f4ee", "#9ec6e8", "#8ccf7e"],
  },
  {
    id: "liberty", kind: "vector", group: "vector", style: "https://tiles.openfreemap.org/styles/liberty",
    attribution: '<a href="https://openfreemap.org">OpenFreeMap</a> © <a href="https://openmaptiles.org/">OpenMapTiles</a> · Data © <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
    name: { en: "Liberty (vector)", de: "Liberty (Vektor)" },
    note: { en: "Crisp vector map with soft colours, sharp at every zoom.", de: "Scharfe Vektorkarte in weichen Farben, bei jedem Zoom klar." },
    swatch: ["#f7f3ea", "#7cc0e6", "#a6d9a0"],
  },
  {
    id: "positron", kind: "vector", group: "vector", style: "https://tiles.openfreemap.org/styles/positron",
    attribution: '<a href="https://openfreemap.org">OpenFreeMap</a> © <a href="https://openmaptiles.org/">OpenMapTiles</a> · Data © <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
    name: { en: "Positron (vector)", de: "Positron (Vektor)" },
    note: { en: "Light and minimal: the route is the star.", de: "Hell und schlicht: die Route steht im Mittelpunkt." },
    swatch: ["#f4f4f1", "#d5dde2", "#e6ebe3"],
  },
  {
    id: "bright", kind: "vector", group: "vector", style: "https://tiles.openfreemap.org/styles/bright",
    attribution: '<a href="https://openfreemap.org">OpenFreeMap</a> © <a href="https://openmaptiles.org/">OpenMapTiles</a> · Data © <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
    name: { en: "Bright (vector)", de: "Bright (Vektor)" },
    note: { en: "Vector map with strong colours and clear roads.", de: "Vektorkarte mit kräftigen Farben und klaren Straßen." },
    swatch: ["#f8f4f0", "#8ec5ee", "#b5dba4"],
  },
];
// @license-end
