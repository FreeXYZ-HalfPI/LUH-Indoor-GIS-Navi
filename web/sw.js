// SPDX-License-Identifier: GPL-3.0-or-later
// Offline support: app shell + data are cached; map tiles are cached as they are viewed.
//
// Students often have weak mobile data inside big buildings, so the app must
// still route there once it has been opened once.
// Bump on every change to the app or its data: a new name makes the browser install
// the new files and "activate" delete the old cache.
const VERSION = "v12";
const SHELL = `shell-${VERSION}`;
const TILES = "tiles-v1"; // tiles do not change with the app, so they keep their cache
const MAX_TILES = 600; // ~10 MB: enough for the campus around you, small enough for any phone

// everything the app needs to start and route offline
const ASSETS = [
  "./",
  "index.html",
  "css/style.css",
  "js/app.js",
  "js/rooms.js",
  "js/router.js",
  "js/i18n.js",
  "data/buildings.json",
  "data/rooms.json",
  "data/walkgraph.json",
  "data/people.json",
  "data/indoor/index.json",
  "data/indoor/1101.json",
  "data/indoor/3101.json",
  "data/indoor/3110.json",
  "vendor/leaflet/leaflet.js",
  "vendor/leaflet/leaflet.css",
  "icons/icon.svg",
  "manifest.webmanifest",
];

self.addEventListener("install", (e) => {
  // skipWaiting: use the new version at once instead of after all tabs are closed
  e.waitUntil(caches.open(SHELL).then((c) => c.addAll(ASSETS)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== SHELL && k !== TILES).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

/** Delete the oldest tiles above MAX_TILES (cache keys keep their insertion order). */
async function trimTiles() {
  const c = await caches.open(TILES);
  const keys = await c.keys();
  for (const k of keys.slice(0, Math.max(0, keys.length - MAX_TILES))) await c.delete(k);
}

self.addEventListener("fetch", (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== "GET") return;

  // cache first for tiles: they rarely change, and it spares the OSM servers
  if (url.hostname === "tile.openstreetmap.org") {
    e.respondWith(
      caches.open(TILES).then(async (c) => {
        const hit = await c.match(e.request);
        if (hit) return hit;
        const res = await fetch(e.request);
        if (res.ok) c.put(e.request, res.clone()).then(trimTiles);
        return res;
      }),
    );
    return;
  }

  if (url.origin === location.origin) {
    // network first so updates arrive quickly, cache as offline fallback
    e.respondWith(
      fetch(e.request)
        .then((res) => {
          if (res.ok) caches.open(SHELL).then((c) => c.put(e.request, res.clone()));
          return res;
        })
        // offline: the cached file; for an unknown page the app itself
        .catch(() => caches.match(e.request, { ignoreSearch: true }).then((r) => r || caches.match("index.html"))),
    );
  }
});
