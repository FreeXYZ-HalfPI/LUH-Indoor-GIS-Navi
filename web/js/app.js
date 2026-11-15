// @license magnet:?xt=urn:btih:1f739d935676111cfff4b4693e3816e664797050&dn=gpl-3.0.txt GPL-v3-or-later
// SPDX-License-Identifier: GPL-3.0-or-later
// LUH Campus Navigator: UI, map and route guidance.
//
// A static page, no framework and no build step: the app must run from any
// web server (GitHub Pages) and be easy for students to read and change.
import { Places, parseRoomId } from "./rooms.js";
import { WalkGraph, haversine, compass } from "./router.js";
import { t, getLang, setLang, formatWalk } from "./i18n.js";
import { turnSteps } from "./turns.js";
import { reportUrl } from "./report.js";
import { stepTag, floorTag, parseStep, placeStep } from "./steptags.js";
import { routeFloors, confidence, routeConfidence } from "./confidence.js";
import { TILE_URL, TILE_ATTRIBUTION, TILE_MAX_NATIVE_ZOOM } from "./config.js";

const CAFM = "https://info.cafm.uni-hannover.de";
const WALK_M_PER_MIN = 80; // ~4.8 km/h, a usual walking speed for route planners

const COLOR_FROM = "#2e8540"; // green: start
const COLOR_TO = "#c8102e"; // red: destination (and the LUH red)
const COLOR_INDOOR = "#7b2cbf"; // purple: everything indoors

const $ = (sel) => document.querySelector(sel);
// escape for innerHTML; names come from data files, never trust them as HTML
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
// Place keys: "b:1101" for a building, "r:1101.000.E028" for a room, "p:christian-heipke" for a person
const state = { from: null, to: null, avoidSteps: false };
let places, graph, map, routeLayer;
let landmarks = {}; // room code → {en, de}: rooms people recognise (data/landmarks.json)
const indoorData = {}; // building → generated indoor JSON (outlines, meta, georef); filled as buildings are loaded
let indoorList = []; // buildings that have an indoor map
const frameBounds = {}; // building → map frame (data/indoor/frames.json), known before the building is loaded
const indoorLoading = {}; // building → promise of its indoor file (a building is fetched once, and only when needed)
let updateToken = 0; // a newer update() makes an older one that waited for a building stop

// ---------- boot ----------

async function boot() {
  const load = (f) => fetch(`data/${f}`).then((r) => r.json());
  // The outdoor data and the people list load at start. A building's indoor map (50–200 kB)
  // loads when a route or the map needs it, and the rest in the background when the phone is idle.
  const [buildings, rooms, walk, list, frames, people, lm, svc, stp] = await Promise.all([
    load("buildings.json"),
    load("rooms.json"),
    load("walkgraph.json"),
    load("indoor/index.json").catch(() => []), // the app still works outdoors without indoor data
    load("indoor/frames.json").catch(() => ({})), // map frames of the indoor buildings
    load("people.json").catch(() => ({ people: [] })), // and without the people search
    load("landmarks.json").catch(() => ({ rooms: {} })), // and without landmarks in the directions
    load("services.json").catch(() => ({ services: [] })), // and without named services
    load("stops.json").catch(() => ({ stops: [] })), // and without stations and stops
  ]);
  landmarks = lm.rooms;
  places = new Places(buildings, rooms, people.people, svc.services, stp.stops);
  graph = new WalkGraph(walk);
  indoorList = list;
  for (const [b, [s, w, n, e]] of Object.entries(frames)) frameBounds[b] = L.latLngBounds([[s, w], [n, e]]);

  initMap(buildings);
  initPicker("from");
  initPicker("to");
  $("#swap").addEventListener("click", () => {
    [state.from, state.to] = [state.to, state.from];
    syncInputs();
    update();
  });
  $("#avoid-steps").addEventListener("change", (e) => {
    state.avoidSteps = e.target.checked;
    update();
  });
  $("#lang").addEventListener("click", () => {
    setLang(getLang() === "de" ? "en" : "de");
    applyTexts();
    syncInputs();
    update();
  });
  $("#share").addEventListener("click", share);
  $("#help-btn").addEventListener("click", openHelp);
  $("#help").addEventListener("click", (e) => e.target.id === "help" && e.target.close()); // a tap outside the box closes it
  window.addEventListener("hashchange", readHash);

  applyTexts();
  readHash();
  document.body.classList.remove("loading");
  prefetchIndoor();
}

/**
 * Load the indoor map of the given buildings once, and merge it into the router.
 * Resolves when done; a building that cannot be loaded (offline, never cached) is skipped,
 * so the route falls back to the building's entrance, and is tried again after 30 s.
 */
function ensureIndoor(ids) {
  return Promise.all(
    ids
      .filter((b) => indoorList.includes(b))
      .map(
        (b) =>
          (indoorLoading[b] ??= fetch(`data/indoor/${b}.json`)
            .then((r) => (r.ok ? r.json() : Promise.reject(new Error(r.status))))
            .then((d) => {
              graph.addIndoor(d);
              indoorData[b] = d;
            })
            .catch(() => {
              setTimeout(() => delete indoorLoading[b], 30000); // no retry loop, but a later try
            })),
      ),
  );
}

/** When the phone is idle, fetch the remaining buildings (unless the user saves data), so that offline use keeps working. */
function prefetchIndoor() {
  if (navigator.connection?.saveData) return;
  const idle = window.requestIdleCallback || ((f) => setTimeout(f, 3000));
  idle(async () => {
    for (const b of indoorList) {
      if (indoorData[b]) continue;
      await ensureIndoor([b]);
      drawExplorer(); // rooms of this building may be in view now
    }
  });
}

// ---------- texts ----------

/** Fill every element marked data-t / data-t-html with the string of the current language. */
function applyTexts() {
  document.documentElement.lang = getLang();
  document.querySelectorAll("[data-t]").forEach((el) => (el.textContent = t[el.dataset.t]));
  document.querySelectorAll("[data-t-html]").forEach((el) => (el.innerHTML = t[el.dataset.tHtml]));
  $("#from-input").placeholder = t.fromPh;
  $("#to-input").placeholder = t.toPh;
  $("#swap").title = $("#swap").ariaLabel = t.swap;
  $("#help-btn").title = $("#help-btn").ariaLabel = t.helpBtn;
  $("#lang").lang = getLang() === "de" ? "en" : "de"; // the label is in the other language
  $("#lang").textContent = getLang() === "de" ? "EN" : "DE"; // the button names the language you switch to
}

function placeLabel(p) {
  if (!p) return "";
  if (p.person) return `${p.person.name} · ${p.room.id}`;
  if (p.stop) return p.stop.name;
  if (p.service) return `${p.service.name[getLang()] || p.service.name.en} · ${p.building.id}`;
  if (p.type === "building") return `${p.building.id} ${p.building.name}`;
  return `${p.room.id} · ${p.building.name}`;
}

const address = (b) => [b.street, b.house_number].filter(Boolean).join(" ");

/** Second line of a search result: address; role · institute · floor; or floor · wing · type · people. */
function placeDetail(p) {
  if (p.stop) return [p.stop.kinds.map((k) => t.stopKinds[k]).join(" · "), linesText(p.stop.lines, 4)].filter(Boolean).join(" · ");
  if (p.type === "building") return `${t.building} · ${address(p.building)}`;
  if (p.person) return [p.person.role, p.person.org, t.floor(p.room.floor)].filter(Boolean).join(" · ");
  const bits = [t.floor(p.room.floor)];
  if (p.room.wing) bits.push(t.wing(p.room.wing));
  const meta = roomMeta(p.room.id);
  if (meta) bits.push(meta);
  else if (!places.roomIndex.has(p.room.id)) bits.push(t.unlisted); // a typed code we cannot confirm
  const people = places.peopleInRoom.get(p.room.id) || [];
  if (people.length) bits.push(people.map((x) => x.name).join(", ")); // who sits here
  return bits.join(" · ");
}

// ---------- search pickers ----------

/** A search box with a suggestion list (ARIA combobox pattern: keyboard and screen readers work). */
function initPicker(which) {
  const input = $(`#${which}-input`);
  const list = $(`#${which}-list`);
  let items = [];
  let active = -1; // highlighted suggestion, -1 = none

  const close = () => {
    list.hidden = true;
    input.setAttribute("aria-expanded", "false");
    input.removeAttribute("aria-activedescendant"); // never point at an option that is gone
    active = -1;
  };
  const choose = (place) => {
    state[which] = place.key;
    input.value = placeLabel(place);
    close();
    update();
    if (which === "from" && !state.to) $("#to-input").focus(); // guide the user on to the next field
    else input.blur(); // hides the phone keyboard, so the route becomes visible
  };
  const render = () => {
    items = places.search(input.value);
    list.innerHTML = "";
    if (!items.length) {
      list.innerHTML = input.value.trim() ? `<li class="empty" role="presentation">${t.noResults}</li>` : "";
    }
    items.forEach((p, i) => {
      const li = document.createElement("li");
      li.role = "option";
      li.id = `${which}-opt-${i}`;
      li.className = i === active ? "active" : "";
      li.innerHTML = `<span class="ico">${p.person ? "👤" : p.service ? "ℹ️" : p.stop ? (p.stop.kinds.includes("rail") ? "🚉" : "🚏") : p.type === "room" ? "🚪" : "🏛️"}</span><span><b></b><small></small></span>`;
      li.querySelector("b").textContent = placeLabel(p); // textContent: data is never parsed as HTML
      li.querySelector("small").textContent = placeDetail(p);
      // pointerdown, not click: it fires before the input's blur closes the list
      li.addEventListener("pointerdown", (e) => {
        e.preventDefault();
        choose(p);
      });
      list.append(li);
    });
    list.hidden = !list.children.length;
    input.setAttribute("aria-expanded", String(!list.hidden));
    li_selected();
  };
  // tell assistive technology which option is highlighted (aria-selected on it, activedescendant on the input)
  function li_selected() {
    [...list.children].forEach((li, i) => li.role === "option" && li.setAttribute("aria-selected", String(i === active)));
    if (active >= 0 && !list.hidden) input.setAttribute("aria-activedescendant", `${which}-opt-${active}`);
    else input.removeAttribute("aria-activedescendant");
  }

  input.addEventListener("input", () => {
    active = -1;
    state[which] = null; // typing invalidates the previous choice
    render();
  });
  input.addEventListener("focus", () => {
    if (!state[which]) render();
    else input.select(); // a chosen place: select it, so typing replaces it
  });
  input.addEventListener("blur", () => setTimeout(close, 100)); // let a tap on a suggestion land first
  input.addEventListener("keydown", (e) => {
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      if (list.hidden) render();
      active = Math.max(0, Math.min(items.length - 1, active + (e.key === "ArrowDown" ? 1 : -1)));
      render();
      list.children[active]?.scrollIntoView({ block: "nearest" }); // keep the highlighted option visible
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (!items.length) render();
      if (items.length) choose(items[Math.max(0, active)]); // Enter without arrows takes the best match
    } else if (e.key === "Escape") close();
  });
}

function syncInputs() {
  $("#from-input").value = placeLabel(places.resolve(state.from));
  $("#to-input").value = placeLabel(places.resolve(state.to));
}

// ---------- URL hash (stays on the device; fragments are never sent to a server) ----------
// The route lives in the hash (#from=…&to=…), so a link or a QR code can open it.

function readHash() {
  const h = new URLSearchParams(location.hash.slice(1));
  // 4 digits = a building, a room code = a room, anything else = a person (#to=christian-heipke)
  // a name from data/services.json = a service (#to=international-office)
  const key = (v) => (!v ? null : /^\d{4}$/.test(v) ? `b:${v}` : parseRoomId(v) ? `r:${v}` : places.services.has(v) ? `s:${v}` : places.stops.has(v) ? `t:${v}` : `p:${v}`);
  const from = places.resolve(key(h.get("from")));
  const to = places.resolve(key(h.get("to")));
  state.from = from?.key ?? null;
  state.to = to?.key ?? null;
  state.avoidSteps = h.get("steps") === "0";
  $("#avoid-steps").checked = state.avoidSteps;
  syncInputs();
  update(false); // the hash is already right: writing it again would add nothing
}

function writeHash() {
  const h = new URLSearchParams();
  if (state.from) h.set("from", state.from.slice(2));
  if (state.to) h.set("to", state.to.slice(2));
  if (state.avoidSteps) h.set("steps", "0");
  const s = h.toString();
  // replaceState: picking places should not fill the back button history
  history.replaceState(null, "", s ? `#${s}` : location.pathname);
}

async function share() {
  const url = location.href;
  try {
    if (navigator.share) await navigator.share({ title: t.title, url }); // the phone's share sheet
    else {
      await navigator.clipboard.writeText(url);
      toast(t.copied);
    }
  } catch {} // the user closed the share sheet: nothing to report
}

function toast(msg) {
  const el = $("#toast");
  el.textContent = msg;
  el.hidden = false; // #toast is role="status": screen readers announce it
  setTimeout(() => (el.hidden = true), 1800);
}

// ---------- map ----------

function initMap(buildings) {
  map = L.map("map", { zoomControl: true, attributionControl: true }).setView([52.3826, 9.7175], 15); // Welfengarten
  L.tileLayer(TILE_URL, {
    maxZoom: 21, // room explorer: zoom past the tiles (scaled up from 19)
    maxNativeZoom: TILE_MAX_NATIVE_ZOOM,
    // the OSM tile policy requires a Referer; send only our origin (the page default is no-referrer)
    referrerPolicy: "strict-origin-when-cross-origin",
    attribution: TILE_ATTRIBUTION,
  }).addTo(map);

  for (const b of buildings) {
    const m = L.circleMarker([b.lat, b.lon], { radius: 5, color: "#003366", weight: 1, fillColor: "#5b8fc7", fillOpacity: 0.8 }).addTo(map);
    m.bindTooltip(`${b.id} ${b.name}`);
    m.on("click", () => placePopup(`${b.id} ${b.name}`, address(b), `b:${b.id}`, [b.lat, b.lon]));
  }
  routeLayer = L.layerGroup().addTo(map);
  initExplorer();
}

/** A map popup with "Start here" / "Go here" buttons that set the place `key`. */
function placePopup(title, detail, key, latlng) {
  const div = document.createElement("div");
  div.className = "popup";
  div.innerHTML = `<b></b><br><small></small><div class="popup-btns"><button data-w="from"></button><button data-w="to"></button></div>`;
  div.querySelector("b").textContent = title;
  div.querySelector("small").textContent = detail;
  div.querySelector('[data-w="from"]').textContent = t.fromHere;
  div.querySelector('[data-w="to"]').textContent = t.toHere;
  div.querySelectorAll("button").forEach((btn) =>
    btn.addEventListener("click", () => {
      state[btn.dataset.w] = key;
      syncInputs();
      map.closePopup();
      update();
    }),
  );
  L.popup().setLatLng(latlng).setContent(div).openOn(map);
}

// ---------- room explorer: every room of the mapped buildings, per floor ----------

// Below zoom 18 a building is a few dozen pixels wide: room shapes would be noise.
const EXPLORER_ZOOM = 18;
// From zoom 20 rooms are big enough to print their numbers on them.
const LABEL_ZOOM = 20;
let explorerLayer, floorLayer, floorCtl;
let explorerLevel = 0;
// The route on screen and its start/destination rooms. The map shows one floor at a time,
// so the parts of the route that belong to other floors are drawn faint (see drawFloorLayer).
let currentRoute = null;
let chosenRooms = [];

/** "Hörsaal · 192 m²" for public rooms, else "". */
function roomMeta(id) {
  const m = indoorData[id.slice(0, 4)]?.meta?.[id];
  return m ? [m[0], m[1] ? t.area(m[1]) : ""].filter(Boolean).join(" · ") : "";
}

/** Plan pixel → [lat, lon], with the affine georef of a building's indoor data. */
const planToLatLon = ({ lat: A, lon: B }, x, y) => [A[0] + A[1] * x + A[2] * y, B[0] + B[1] * x + B[2] * y];

/** Room outline as lat/lon ring, or null. */
function roomRing(id) {
  const d = indoorData[id.slice(0, 4)]; // room ids start with the building id
  const flat = d?.outlines?.[id];
  if (!flat) return null;
  const ring = [];
  for (let i = 0; i < flat.length; i += 2) ring.push(planToLatLon(d.georef, flat[i], flat[i + 1]));
  return ring;
}

function initExplorer() {
  explorerLayer = L.layerGroup().addTo(map);
  floorLayer = L.layerGroup().addTo(map);
  stepLayer = L.layerGroup().addTo(map);
  // a dashed frame shows which buildings have rooms to explore (from frames.json: no building is loaded for it)
  for (const bounds of Object.values(frameBounds)) {
    L.rectangle(bounds, { color: COLOR_INDOOR, weight: 1, dashArray: "4 4", fill: false, interactive: false }).addTo(map);
  }
  floorCtl = L.control({ position: "topright" });
  floorCtl.onAdd = () => {
    const div = L.DomUtil.create("div", "leaflet-bar floor-ctl");
    L.DomEvent.disableClickPropagation(div); // a tap on a floor button must not reach the map
    return div;
  };
  floorCtl.addTo(map);
  map.on("zoomend moveend", drawExplorer);
  drawExplorer();
}

/** Indoor data of the buildings in view, when zoomed in far enough. */
function visibleIndoor() {
  if (map.getZoom() < EXPLORER_ZOOM) return [];
  const view = map.getBounds();
  const inView = Object.keys(frameBounds).filter((b) => frameBounds[b].intersects(view));
  const missing = inView.filter((b) => !indoorData[b]);
  if (missing.length) ensureIndoor(missing).then(drawExplorer); // draws the rooms as soon as they are there
  return inView.map((b) => indoorData[b]).filter(Boolean);
}

/** The floor buttons for the given levels (highest first, like a lift panel). */
function drawFloorControl(div, levels) {
  // floors the route passes get a dot, so nobody has to guess where to look
  const onRoute = new Set((currentRoute?.legs ?? []).filter((l) => l.kind === "indoor").map((l) => l.level));
  div.innerHTML =
    `<span class="floor-ctl-title">${t.floorCtl}</span>` +
    levels
      .map((l) => `<a href="#" role="button" data-l="${l}" class="${l === explorerLevel ? "on" : ""}${onRoute.has(l) ? " route" : ""}" title="${esc(t.floor(l))}" aria-label="${esc(t.floor(l))}" aria-pressed="${l === explorerLevel}">${t.floorShort(l)}</a>`)
      .join("");
  div.querySelectorAll("a").forEach((a) =>
    a.addEventListener("click", (e) => {
      e.preventDefault();
      explorerLevel = Number(a.dataset.l);
      drawExplorer();
    }),
  );
}

/**
 * Start and destination room, and the indoor parts of the route, for the shown floor:
 * this floor's part is solid, the other floors' parts are faint. Runs with every floor change.
 */
function drawFloorLayer() {
  floorLayer.clearLayers();
  drawStepMarkers();
  for (const [p, color] of chosenRooms) {
    if (p.room.floor !== explorerLevel) continue; // a room is only outlined on its own floor
    const ring = roomRing(p.room.id);
    if (ring) L.polygon(ring, { color, weight: 2, fillOpacity: 0.45, interactive: false }).addTo(floorLayer);
  }
  for (const leg of currentRoute?.legs ?? []) {
    if (leg.kind !== "indoor" || !leg.coords) continue;
    const style = leg.level === explorerLevel ? { weight: 5, opacity: 0.85, dashArray: "8 6" } : { weight: 3, opacity: 0.25 };
    L.polyline(leg.coords, { color: COLOR_INDOOR, interactive: false, ...style }).addTo(floorLayer);
  }
}

/** Redraw the room shapes of the chosen floor; runs after every pan and zoom. */
function drawExplorer() {
  explorerLayer.clearLayers();
  drawFloorLayer();
  const shown = visibleIndoor();
  const div = floorCtl.getContainer();
  const levels = [...new Set(shown.flatMap((d) => Object.keys(d.levels).map(Number)))].sort((a, b) => b - a);
  if (!levels.length) {
    div.hidden = true;
    return;
  }
  // the chosen floor may not exist in the buildings now in view: fall back to the ground floor
  if (!levels.includes(explorerLevel)) explorerLevel = levels.includes(0) ? 0 : levels.at(-1);
  div.hidden = false;
  drawFloorControl(div, levels);

  // room ids of start and destination (a person's key is not a room id, so resolve the keys)
  const chosen = new Map(
    [[state.from, COLOR_FROM], [state.to, COLOR_TO]].map(([k, c]) => [places.resolve(k)?.room?.id, c]).filter(([id]) => id),
  );
  for (const d of shown) {
    for (const id of Object.keys(d.outlines)) {
      const r = places.resolve(`r:${id}`)?.room;
      if (!r || r.floor !== explorerLevel) continue;
      const routable = id in d.rooms;
      // purple = routable, grey = not routable yet, orange fill = public room with a Rauminfo page
      const poly = L.polygon(roomRing(id), {
        weight: chosen.has(id) ? 3 : 1,
        color: chosen.get(id) || (routable ? COLOR_INDOOR : "#888"),
        fillColor: d.meta?.[id] ? "#f4a300" : routable ? "#b794f4" : "#bbb",
        fillOpacity: chosen.has(id) ? 0.5 : 0.25,
      }).addTo(explorerLayer);
      poly.bindTooltip(r.room, { direction: "center", className: "room-label", permanent: map.getZoom() >= LABEL_ZOOM });
      poly.on("click", (e) => placePopup(id, placeDetail(places.resolve(`r:${id}`)), `r:${id}`, e.latlng));
    }
  }
}

const pin = (cls, label) =>
  L.divIcon({ className: `pin ${cls}`, html: `<span>${label}</span>`, iconSize: [28, 28], iconAnchor: [14, 14] });

// ---------- route & guidance ----------

const buildingName = (b) => esc(`${b.id} ${b.name}`);
const buildingAddress = (b) => esc(address(b));
const entranceKind = (e) => (e.kind === "main" ? t.mainEntrance : "");
// "north" etc.: on which side of the building an entrance is, the easiest hint without GPS
const sideOf = (b, p) => t.dirs[compass([b.lat, b.lon], p)];
const minutes = (m) => Math.max(1, Math.round(m / WALK_M_PER_MIN));
// "3101.001.B143 – Prof. Dr.-Ing. habil. Christian Heipke" when the place is a person
const roomText = (p) => (p.person ? `${p.room.id} – ${esc(p.person.name)}` : p.room.id);
const findRoomStep = (p) => t.stepFindRoom(roomText(p), p.room.wing ? t.wing(p.room.wing) : "");

// ---------- guide for first-time users ----------

const EXAMPLES = [
  ["r:3101.001.A104", "r:3110.002.205A"],
  ["r:1101.000.E028", "r:1101.004.F407"],
  ["p:christian-heipke", "p:monika-sester"],
  ["b:1101", "s:international-office"],
  ["t:hannover-hauptbahnhof", "r:3101.002.A260"],
];

/** What to do next, instead of an empty space: three steps, a hint for the next field, one-tap examples. */
function welcomeCard(from, to) {
  const hint = from || to ? `<p class="guide-hint" role="status">${from ? t.hintNeedTo : t.hintNeedFrom}</p>` : "";
  const examples = EXAMPLES.map(([a, b], i) => `<button type="button" class="example" data-from="${a}" data-to="${b}">${esc(t.examples[i])}</button>`).join("");
  return `<div class="welcome">
    <h2>${t.welcomeTitle}</h2>
    ${hint}
    <ol class="guide-steps">${t.steps3.map((x) => `<li><span>${x}</span></li>`).join("")}</ol>
    <p class="guide-access">♿ ${t.accessHint}</p>
    <h3>${t.tryExample}</h3>
    <div class="examples">${examples}</div>
  </div>`;
}

function wireWelcome(out) {
  out.querySelectorAll("button.example").forEach((b) =>
    b.addEventListener("click", () => {
      state.from = places.resolve(b.dataset.from)?.key ?? null;
      state.to = places.resolve(b.dataset.to)?.key ?? null;
      syncInputs();
      update();
      $("#map").scrollIntoView({ block: "nearest" });
    }),
  );
}

/** The help dialog: how to use the page, what the map symbols mean, and a link to the idea. */
function openHelp() {
  const d = $("#help");
  d.innerHTML = `<h2 id="help-title">${t.helpTitle}</h2>
    <ol class="guide-steps">${t.steps3.map((x) => `<li><span>${x}</span></li>`).join("")}</ol>
    <h3>${t.helpLegend}</h3>
    <ul class="legend">${t.legend.map(([k, v]) => `<li><span class="legend-key">${esc(k)}</span> ${esc(v)}</li>`).join("")}</ul>
    <h3>${t.helpOptions}</h3>
    <ul class="tips">${t.helpTips.map((x) => `<li>${x}</li>`).join("")}</ul>
    <p><a href="https://github.com/FreeXYZ-HalfPI/LUH-Indoor-GIS-Navi/blob/main/docs/IDEA.md" target="_blank" rel="noopener">${t.aboutProject}</a></p>
    <p><button type="button" class="close-help">${t.close}</button></p>`;
  d.querySelector(".close-help").addEventListener("click", () => d.close());
  d.showModal();
}

/** Recompute everything after a change of start, destination or options. */
function update(push = true) {
  if (push) writeHash();
  const token = ++updateToken;
  // the indoor maps of both ends must be in the router before it runs
  const need = [state.from, state.to].map((k) => places.resolve(k)?.building?.id).filter((b) => b && indoorList.includes(b) && !indoorData[b]);
  if (!need.length) return render();
  routeLayer.clearLayers();
  currentRoute = null;
  $("#result").innerHTML = `<p class="note">${t.loadingBuilding}</p>`;
  ensureIndoor(need).then(() => token === updateToken && render()); // a newer choice has already replaced this one
}

function render() {
  routeLayer.clearLayers();
  currentRoute = null;
  stepLocs = [];
  activeStep = -1;
  const out = $("#result");
  const from = places.resolve(state.from);
  const to = places.resolve(state.to);
  $("#share").hidden = !(from && to);
  outlineChosenRooms(from, to);
  if (!from || !to) {
    out.innerHTML = welcomeCard(from, to);
    wireWelcome(out);
    focusPlace(from || to);
    return;
  }

  const g = guidance(from, to);
  const parsed = g.steps.map(parseStep);
  stepLocs = parsed.map((p) => (p.at || p.floor != null ? { at: p.at, level: p.level, floor: p.floor } : null));
  activeStep = -1;
  drawExplorer(); // the route is known now: draw its parts and the step markers on the shown floor
  const plans = g.indoorLegs.length ? routePlans(g.indoorLegs, from, to) : [];
  // the destination's own plan, when the route ends at the door (no indoor data for it)
  if (to.type === "room" && !g.route?.end.indoor) plans.push({ room: to.room.id, title: plans.length ? `${t.floor(to.room.floor)} · ${t.building} ${to.building.id}` : "" });
  out.innerHTML = `
    ${g.summary ? `<p class="summary">${g.summary}</p>` : ""}
    ${g.notes.map((n) => `<p class="note">${n}</p>`).join("")}
    <ol class="steps">${parsed.map(stepItem).join("")}</ol>
    ${plans.length ? floorplanBlock(plans, to) : ""}
    ${reportBlock(from, to, !!g.route)}`;
  out.querySelectorAll(".steps > li[data-i]").forEach((li) => {
    const go = () => selectStep(Number(li.dataset.i));
    li.addEventListener("click", (e) => {
      if (!e.target.closest("a")) go();
    });
    li.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        go();
      }
    });
  });
  const btn = out.querySelector("#show-plan");
  if (btn)
    // plans are images from the university server: load them only on request (mobile data, privacy)
    btn.addEventListener("click", () => {
      out.querySelectorAll(".plan image[data-src]").forEach((img) => {
        img.addEventListener("error", () => (img.closest("figure").hidden = true));
        img.setAttribute("href", img.dataset.src);
        img.closest("figure").hidden = false;
      });
      btn.remove();
    });
}

/** The "Report a problem with this route" link under the directions (room codes only, see report.js). */
function reportBlock(from, to, found) {
  const href = reportUrl(from, to, { appUrl: location.origin + location.pathname, avoidSteps: state.avoidSteps, found, text: t.reportText });
  return `<p class="report"><a href="${esc(href)}" target="_blank" rel="noopener">${t.report}</a><br><small>${t.reportNote}</small></p>`;
}

const STEP_PIN_SKIP_M = 4; // a marker this close to A or B would hide it: that step is placed, but gets no marker
let stepLocs = []; // per step of the shown route: {at, level, floor} (null when the step has no place)
let activeStep = -1; // the step that is selected (list and map show it)
let stepLayer;

function stepItem(p, i) {
  const attrs = p.at || p.floor != null ? ` data-i="${i}" tabindex="0" role="button"` : "";
  return `<li${attrs}>${p.body}</li>`;
}

/** Numbered markers for the steps on the shown floor; the others are faint, the selected one is big. */
function drawStepMarkers() {
  stepLayer.clearLayers();
  const ends = [currentRoute?.coords?.[0], currentRoute?.coords?.at(-1)].filter(Boolean);
  stepLocs.forEach((st, i) => {
    if (!st?.at) return;
    if (ends.some((e) => haversine(e, st.at) < STEP_PIN_SKIP_M)) return; // A and B stand for the first and the last step
    const here = st.level == null || st.level === explorerLevel; // indoors only on its own floor
    const cls = `${here ? "" : "off "}${i === activeStep ? "active" : ""}`;
    const m = L.marker(st.at, {
      icon: L.divIcon({ className: `step-pin ${cls}`, html: `<span>${i + 1}</span>`, iconSize: [26, 26], iconAnchor: [13, 13] }),
      zIndexOffset: i === activeStep ? 900 : here ? 100 : 0,
      keyboard: false,
      title: `${t.stepWord} ${i + 1}`,
    }).addTo(stepLayer);
    m.on("click", () => selectStep(i, true));
  });
}

/** Select step i: highlight it in the list and on the map, and show its floor and place. */
function selectStep(i, fromMap = false) {
  const st = stepLocs[i];
  if (!st) return;
  activeStep = i;
  if (st.level != null) explorerLevel = st.level;
  else if (st.floor != null) explorerLevel = st.floor;
  const items = [...document.querySelectorAll("#result .steps > li")];
  items.forEach((li, k) => li.classList.toggle("active", k === i));
  if (fromMap) items[i]?.scrollIntoView({ block: "nearest" }); // a tap on a marker: bring its sentence into view
  else if (st.at) map.setView(st.at, Math.max(map.getZoom(), st.level == null ? 17 : 19), { animate: false });
  drawExplorer();
}

/** Draw the start and destination rooms and switch the explorer to their floor. */
function outlineChosenRooms(from, to) {
  const focus = to?.type === "room" ? to : from?.type === "room" ? from : null; // the destination matters more
  if (focus) explorerLevel = focus.room.floor;
  chosenRooms = [[from, COLOR_FROM], [to, COLOR_TO]].filter(([p]) => p?.type === "room");
  drawExplorer();
}

/** Only one place chosen: show it (a link like #to=3101.000.A020 opens on the room). */
function focusPlace(one) {
  const ring = one?.type === "room" && roomRing(one.room.id);
  if (ring) map.fitBounds(L.latLngBounds(ring).pad(1.5), { maxZoom: 19 });
  else if (one) map.setView([one.building.lat, one.building.lon], 17);
}

// ---------- stations and stops ----------

/** "Stadtbahn 4, 5 · bus 120": the lines of a stop (at most `max` per kind, then …). */
function linesText(lines, max = 6) {
  const by = {};
  for (const l of lines || []) (by[l.mode] ??= []).push(l.ref);
  return Object.entries(by)
    .map(([m, refs]) => `${t.lineMode[m]} ${refs.slice(0, max).join(", ")}${refs.length > max ? " …" : ""}`)
    .join(" · ");
}

/**
 * Stops near `other` (a room or building on the campus) to get off at or board at, best first:
 * by walking distance, with a bonus for stops that share a line with the hub (probably a direct ride).
 */
function campusStops(other, hub, hubIsFrom) {
  const o = other.building;
  const hubLines = new Set(hub.stop.lines.map((l) => l.mode + l.ref));
  return [...places.stops.values()]
    .filter((s) => !s.hub)
    .map((s) => ({ s, d: haversine([s.lat, s.lon], [o.lat, o.lon]) }))
    .sort((a, b) => a.d - b.d)
    .slice(0, 8) // the nearest few by air line; the walk decides
    .map(({ s }) => {
      const place = places.stopPlace(s);
      const r = hubIsFrom ? graph.route(place, other, { avoidSteps: state.avoidSteps }) : graph.route(other, place, { avoidSteps: state.avoidSteps });
      const direct = s.lines.filter((l) => hubLines.has(l.mode + l.ref));
      return r ? { place, walk: r.distance, direct } : null;
    })
    .filter(Boolean)
    .sort((a, b) => a.walk - (a.direct.length ? 300 : 0) - (b.walk - (b.direct.length ? 300 : 0)));
}

/**
 * A big station (the hub: main station, central bus station) is far from the campus walk graph.
 * Route from or to the stop nearest to the goal and say how to get between the hub and that stop.
 */
function viaHub(from, to) {
  const hubIsFrom = !!from.stop?.hub;
  const hub = hubIsFrom ? from : to;
  const other = hubIsFrom ? to : from;
  const hubName = esc(hub.stop.name);
  const none = (steps, note = t.hubNoStop) => ({ steps, notes: [note], summary: "", indoorLegs: [], route: null });
  if (other.stop) return none([t.stepStartHub(esc(from.stop.name)), t.stepArrive], t.hubPlannerOnly); // station to stop: only the planner can help
  const cands = campusStops(other, hub, hubIsFrom);
  if (!cands.length) return none(hubIsFrom ? [t.stepStartHub(hubName), t.stepArrive] : [t.stepStartBuilding(buildingName(other.building)), t.stepArrive]);
  const best = cands[0];
  const stopName = esc(best.place.stop.name);
  const lines = linesText(best.direct.length ? best.direct : best.place.stop.lines);
  const g = hubIsFrom ? walkGuidance(best.place, to) : walkGuidance(from, best.place);
  const steps = hubIsFrom
    ? [t.stepStartHub(hubName), t.stepRide(hubName, stopName, lines, best.direct.length > 0), ...g.steps.slice(1)] // the walk's own start step is the stop
    : [...g.steps.slice(0, -1), t.stepRideTo(stopName, hubName, lines, best.direct.length > 0), t.stepArrive];
  const alt = cands.slice(1, 3).map((c) => `${esc(c.place.stop.name)} (${Math.round(c.walk / 10) * 10} m)`);
  const notes = [...g.notes, t.hubNote];
  if (alt.length) notes.push(t.hubAlt(alt.join(", ")));
  return { ...g, steps, notes };
}

function guidance(from, to) {
  return from.stop?.hub || to.stop?.hub ? viaHub(from, to) : walkGuidance(from, to);
}

/**
 * Route, directions and notes for a start and a destination.
 * Three cases: a real route; both in one building without indoor data;
 * buildings on different campuses (no walk graph between them).
 */
function walkGuidance(from, to) {
  const steps = [];
  const notes = [];
  let summary = "";
  let indoorLegs = [];
  const fb = from.building;
  const tb = to.building;

  if (from.type === "room") steps.push(floorTag(from.room.floor) + t.stepStartRoom(roomText(from), buildingName(fb), t.floor(from.room.floor)));
  else if (from.stop) steps.push(t.stepStartStop(esc(from.stop.name)));
  else steps.push(t.stepStartBuilding(buildingName(fb)));

  // each campus has its own walk graph; across campuses there is no route to find
  const clusterOf = (p) => (p.stop ? 0 : graph.buildings[p.building.id]?.cluster); // the stops lie in the main campus area
  const sameCluster = clusterOf(from) === clusterOf(to);
  const r = sameCluster ? graph.route(from, to, { avoidSteps: state.avoidSteps }) : null;
  const trivial = r && !r.legs.length; // same building, no indoor data: start entrance = goal entrance

  if (r && !trivial) {
    summary = t.total(formatWalk(r.distance), minutes(r.time));
    steps[0] = placeStep(steps[0], r.coords[0], r.start.indoor ? from.room.floor : null); // the start: A
    steps.push(...routeSteps(r, from, to));
    indoorLegs = r.legs.filter((l) => l.kind === "indoor");
    const floors = routeFloors(r.legs, graph.indoor);
    // a guessed entrance only matters when the route really starts or ends at a door
    const estimated =
      (!r.start.indoor && !!graph.buildings[fb.id]?.estimated) || (!r.end.indoor && !!graph.buildings[tb.id]?.estimated);
    const conf = routeConfidence({
      floors,
      startIndoor: r.start.indoor || from.type === "building" || !!from.stop, // "from the building" or a stop has no room to map
      endIndoor: r.end.indoor || to.type === "building" || !!to.stop,
      estimatedEntrance: estimated,
      unconfirmedRoom: [from, to].some((p) => p.type === "room" && !places.roomIndex.has(p.room.id)),
    });
    notes.push(confidenceBadge(conf));
    // the badge says it all unless some floors were checked on site: then name them, with their dates
    const note = ["verified", "partlyVerified"].includes(conf.reasons[0]) ? confidenceNote(floors) : "";
    if (note) notes.push(note);
    if (estimated) notes.push(t.estimated);
    drawRoute(r);
  } else if (fb.id === tb.id) {
    notes.push(confidenceBadge({ level: "low", reasons: ["noIndoorEnd"] })); // no indoor map: we only point at the building
    notes.push(t.sameBuilding(buildingName(tb)));
    L.marker([tb.lat, tb.lon], { icon: pin("to", "B") }).addTo(routeLayer);
    map.setView([tb.lat, tb.lon], 18);
    if (to.type === "room") {
      const startFloor = from.type === "room" ? from.room.floor : 0;
      steps.push(to.room.floor === startFloor ? t.stepStayFloor(t.floor(to.room.floor)) : t.stepFloor(t.floor(to.room.floor)));
      steps.push(findRoomStep(to));
    }
  } else {
    if (from.type === "room" && from.room.floor !== 0) steps.push(t.stepGoDown(t.floor(from.room.floor)));
    const km = (haversine([fb.lat, fb.lon], [tb.lat, tb.lon]) / 1000).toFixed(1);
    // far apart: point to the public transport planner instead of a 10 km walk
    notes.push(sameCluster ? t.noRoute : `${t.farApart(km)} <a href="https://www.gvh.de/" target="_blank" rel="noopener">gvh.de</a>`);
    steps.push(t.stepGoTo(buildingName(tb), buildingAddress(tb)));
    if (to.type === "room") {
      steps.push(t.stepFloor(t.floor(to.room.floor)));
      steps.push(findRoomStep(to));
    }
    const line = L.polyline([[fb.lat, fb.lon], [tb.lat, tb.lon]], { color: "#888", weight: 3, dashArray: "6 8" }).addTo(routeLayer);
    L.marker([fb.lat, fb.lon], { icon: pin("from", "A") }).addTo(routeLayer);
    L.marker([tb.lat, tb.lon], { icon: pin("to", "B") }).addTo(routeLayer);
    map.fitBounds(line.getBounds(), { padding: [30, 30] });
  }
  // a service: say where it is and link its page (opening hours change, so they live there)
  for (const p of [from, to]) {
    if (p.service) notes.push(`${esc(p.service.detail[getLang()] || p.service.detail.en)} <a href="${esc(p.service.url)}" target="_blank" rel="noopener">${t.serviceInfo}</a>`);
  }
  const arrive = to.person ? t.stepArrivePerson(to.room.id, esc(to.person.name)) : t.stepArrive;
  steps.push(r && !trivial ? placeStep(arrive, r.coords.at(-1), r.end.indoor ? to.room.floor : null) : arrive); // the end: B
  return { steps, notes, summary, indoorLegs, route: r };
}

/** "Confidence: ●●○ medium" and the reason, one line, at the top of the directions. */
function confidenceBadge({ level, reasons }) {
  const dots = { high: "●●●", medium: "●●○", low: "●○○" }[level];
  const why = reasons.slice(0, 2).map((k) => t.confReason[k]).join(" ");
  return `<span class="conf-level conf-${level}"><b>${t.confTitle}:</b> <span aria-hidden="true">${dots}</span> ${t.confLevel[level]}</span> ${why}`;
}

/** The note on how far the indoor part can be trusted: approximate, checked on site, or a mix (per floor). */
function confidenceNote(floors) {
  const c = confidence(floors);
  if (!c) return "";
  if (c === "approximate") return t.indoorApprox;
  const name = (f) => `${buildingName(places.building(f.building))}, ${t.floor(f.level)}`;
  const ok = floors.filter((f) => f.verified).map((f) => `${name(f)} (${esc(formatDate(f.verified))})`).join("; ");
  if (c === "verified") return t.indoorVerified(ok);
  return t.indoorMixed(ok, floors.filter((f) => !f.verified).map(name).join("; "));
}

/** "2026-11-20" → "20 Nov 2026" / "20.11.2026" in the app's language. */
function formatDate(iso) {
  const d = new Date(`${iso}T12:00:00`); // noon: no time zone moves it to another day
  return isNaN(d) ? iso : d.toLocaleDateString(getLang() === "de" ? "de-DE" : "en-GB", { day: "numeric", month: "short", year: "numeric" });
}

/** A small tag after an indoor step: checked on site (with the date) or approximate. */
function confidenceTag(leg) {
  const date = graph.indoor[leg.building]?.levels?.[String(leg.level)]?.verified;
  return date ? ` <span class="conf ok">${t.confOk(esc(formatDate(date)))}</span>` : ` <span class="conf">${t.confApprox}</span>`;
}

// Shortest straight piece that gets its own turn instruction. Indoors a few metres
// matter (a corridor corner, not a door recess); outdoors the OSM paths bend a lot, so only real turns count.
const MIN_RUN_INDOOR_M = 5;
const MIN_RUN_OUTDOOR_M = 15;

/**
 * Turn-by-turn list for one leg: "Walk 12 steps (9 m)." "Turn left, then walk 30 steps (23 m)."
 * Empty when the leg is one straight walk: its sentence already says the distance.
 */
function turnList(leg) {
  const parts = turnSteps(leg.coords, leg.kind === "indoor" ? MIN_RUN_INDOOR_M : MIN_RUN_OUTDOOR_M);
  if (parts.length < 2) return "";
  // the line on the map and the graph measure slightly differently; keep the leg total
  const scale = leg.distance / parts.reduce((s, p) => s + p.metres, 0);
  const items = parts.map((p) => {
    const walk = formatWalk(p.metres * scale);
    return `<li data-turn="${p.turn || "start"}">${p.turn ? t.turn(t.turnDirs[p.turn], walk) : t.turnFirst(walk)}</li>`;
  });
  return `<ol class="turns">${items.join("")}</ol>`;
}

// Rooms nearer to the route than this count as "passed" (plan scale, a corridor is ~2-3 m wide).
const LANDMARK_M = 5;
// Only real turns are named indoors; at most this many per leg (a long list is noise).
const MAX_TURNS = 2;

/** Squared distance of point p to segment a-b (all [x, y]) and where on the segment (0..1) it is closest. */
function toSegment(p, a, b) {
  const dx = b[0] - a[0], dy = b[1] - a[1];
  const len2 = dx * dx + dy * dy;
  const u = len2 ? Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / len2)) : 0;
  return { d2: (p[0] - a[0] - u * dx) ** 2 + (p[1] - a[1] - u * dy) ** 2, u };
}

/** Landmark rooms the leg passes, in walking order: ["<b>B205</b> (GuG student council room)", …]. */
function landmarksAlong(leg, skip) {
  const d = graph.indoor[leg.building];
  if (!d || !leg.px || leg.px.length < 2) return [];
  const found = [];
  for (const [id, names] of Object.entries(landmarks)) {
    const node = d.rooms[id];
    const room = places.resolve(`r:${id}`)?.room;
    if (node == null || !room || room.floor !== leg.level || skip.has(id)) continue;
    let best = { d2: Infinity, at: 0 };
    for (let i = 1; i < leg.px.length; i++) {
      const s = toSegment(graph.px[node], leg.px[i - 1], leg.px[i]);
      if (s.d2 < best.d2) best = { d2: s.d2, at: i - 1 + s.u };
    }
    if (Math.sqrt(best.d2) / d.pxPerM <= LANDMARK_M) found.push({ at: best.at, text: t.landmark(room.room, names[getLang()] || names.en) });
  }
  return found.sort((a, b) => a.at - b.at).map((f) => f.text);
}

/** "turn left, follow the corridor past B205 (…)": the way along one indoor leg, in a few words. */
function indoorHow(leg, from, to) {
  const parts = turnSteps(leg.coords, MIN_RUN_INDOOR_M).slice(1); // the first part has no turn
  const turns = parts.map((p) => (/^(sharp)?(Left|Right)$/i.test(p.turn) ? p.turn.replace(/^sharp/i, "").toLowerCase() : null)).filter(Boolean).slice(0, MAX_TURNS);
  const skip = new Set([from.room?.id, to.room?.id]); // the start and the goal are named anyway
  return t.indoorHow(turns.map((w) => t.turnWord[w]), landmarksAlong(leg, skip));
}

/** Turn-by-turn steps for a route: one sentence per leg (with its turns), plus the way out and in. */
function routeSteps(r, from, to) {
  const steps = [];
  const fb = from.building;
  const tb = to.building;
  // starting at a building without indoor data: first get out of it
  if (!r.start.indoor && r.start.entrance && fb.id !== tb.id) {
    if (from.type === "room" && from.room.floor !== 0) steps.push(t.stepGoDown(t.floor(from.room.floor)));
    steps.push(stepTag({ at: [r.start.entrance.lat, r.start.entrance.lon] }) + t.stepExit(sideOf(fb, [r.start.entrance.lat, r.start.entrance.lon]), entranceKind(r.start.entrance)));
  }
  // tags per indoor step only once some floor of the route was checked: with none, the one note says it all
  const tags = confidence(routeFloors(r.legs, graph.indoor)) !== "approximate";
  r.legs.forEach((leg, i) => {
    const next = r.legs[i + 1];
    if (leg.kind === "indoor") {
      // an indoor sentence names where the leg ends: the room, a stair/lift or the exit
      const fl = t.floor(leg.level);
      const how = indoorHow(leg, from, to);
      const tag = tags ? confidenceTag(leg) : "";
      const at = stepTag({ floor: leg.level, at: leg.coords[0], level: leg.level });
      if (!next) steps.push(at + t.stepIndoorTo(fl, how, to.room.id) + tag);
      else if (next.kind === "vertical") steps.push(at + t.stepIndoorToVertical(fl, how, next.type) + tag);
      else if (next.kind === "door") steps.push(at + t.stepIndoorToExit(fl, how) + tag);
    } else if (leg.kind === "vertical") {
      steps.push(stepTag({ floor: leg.toLevel, at: leg.at, level: leg.fromLevel }) + t.stepVertical(leg.type, leg.toLevel > leg.fromLevel, t.floor(leg.toLevel)));
    } else if (leg.kind === "door") {
      const b = places.building(leg.building);
      steps.push(stepTag({ at: leg.at }) + (leg.enter ? t.stepEnter(buildingName(b), buildingAddress(b), sideOf(b, leg.at), "") : t.stepExit(sideOf(b, leg.at), "")));
    } else {
      steps.push(stepTag({ at: leg.coords[0] }) + t.stepWalk(formatWalk(leg.distance), minutes(leg.distance), leg.steps) + turnList(leg));
    }
  });
  // ending at a building without indoor data: enter it and find the room by its number
  if (!r.end.indoor) {
    if (r.end.entrance && r.legs.at(-1).kind === "outdoor")
      steps.push(stepTag({ at: [r.end.entrance.lat, r.end.entrance.lon] }) + t.stepEnter(buildingName(tb), buildingAddress(tb), sideOf(tb, [r.end.entrance.lat, r.end.entrance.lon]), entranceKind(r.end.entrance)));
    if (to.type === "room") {
      steps.push(to.room.floor === 0 ? t.stepStayFloor(t.floor(0)) : t.stepFloor(t.floor(to.room.floor)));
      steps.push(findRoomStep(to));
    }
  }
  return steps;
}

/** Draw a route: blue outdoors, A and B markers. Dashed purple indoor parts: see drawFloorLayer. */
function drawRoute(r) {
  currentRoute = r; // its indoor parts are drawn per floor by drawFloorLayer
  const all = [];
  for (const leg of r.legs) {
    if (!leg.coords) continue; // vertical and door legs have no line
    all.push(...leg.coords);
    if (leg.kind === "outdoor") {
      L.polyline(leg.coords, { color: "#0066cc", weight: 6, opacity: 0.85 }).addTo(routeLayer);
      L.polyline(leg.coords, { color: "#fff", weight: 2, opacity: 0.9, dashArray: "1 10" }).addTo(routeLayer); // dots show the direction
    }
  }
  L.marker(r.coords[0], { icon: pin("from", "A") }).addTo(routeLayer);
  L.marker(r.coords.at(-1), { icon: pin("to", "B") }).addTo(routeLayer);
  map.fitBounds(L.latLngBounds(all.length ? all : r.coords), { padding: [30, 30], maxZoom: 19 });
}

/** One floor plan per building floor the route passes indoors, with the route drawn on top. */
function routePlans(legs, from, to) {
  const groups = new Map();
  for (const leg of legs) {
    const key = `${leg.building}:${leg.level}`; // a route can visit a floor twice (e.g. two stairs)
    if (!groups.has(key)) groups.set(key, { building: leg.building, level: leg.level, lines: [] });
    groups.get(key).lines.push(leg.px);
  }
  return [...groups.values()].map((g) => {
    const lv = graph.indoor[g.building].levels[String(g.level)];
    // show the plan of the start or destination room if it is on this floor: its room is red on it
    const pick = [to, from].find((p) => p.type === "room" && p.building.id === g.building && p.room.floor === g.level);
    // the graph uses the ground-floor frame; undo the floor's registration to draw on its own image
    const toImage = ([x, y]) => [(x - lv.dx) / lv.s, (y - lv.dy) / lv.s];
    return {
      room: pick ? pick.room.id : lv.room,
      grey: !pick, // another room's plan: hide its red highlight
      title: t.planTitle(t.floor(g.level), g.building),
      size: graph.indoor[g.building].size,
      lines: g.lines.map((l) => l.map(toImage)),
    };
  });
}

/** SVG viewBox around the route on a W×H plan: 90 px margin, at least 480 px wide, never past the edges. */
function planViewBox(lines, W, H) {
  const pts = lines.flat();
  const xs = pts.map((q) => q[0]);
  const ys = pts.map((q) => q[1]);
  let [x0, x1, y0, y1] = [Math.min(...xs) - 90, Math.max(...xs) + 90, Math.min(...ys) - 90, Math.max(...ys) + 90];
  const w = Math.max(x1 - x0, 480);
  const h = Math.max(y1 - y0, w * 0.6); // not too flat: a phone screen is tall
  x0 = Math.max(0, Math.min(W - w, (x0 + x1 - w) / 2));
  y0 = Math.max(0, Math.min(H - h, (y0 + y1 - h) / 2));
  return [x0, y0, w, h].map((v) => Math.round(v));
}

/** The floor plan section: SVG figures (plan image + route) behind a "show" button, and a Rauminfo link. */
function floorplanBlock(plans, to) {
  const figs = plans
    .map((p) => {
      const [W, H] = p.size || [1600, 1200]; // the usual CAFM plan size, for plans without route data
      const vb = p.lines ? planViewBox(p.lines, W, H) : [0, 0, W, H];
      const lines = (p.lines || [])
        .map((l) => {
          const pts = l.map(([x, y]) => `${x.toFixed(0)},${y.toFixed(0)}`).join(" ");
          const [sx, sy] = l[0];
          const [ex, ey] = l.at(-1);
          return `<polyline points="${pts}"/><circle class="s" cx="${sx.toFixed(0)}" cy="${sy.toFixed(0)}" r="8"/><circle class="e" cx="${ex.toFixed(0)}" cy="${ey.toFixed(0)}" r="8"/>`;
        })
        .join("");
      const src = `${CAFM}/images/room/floorplan/${encodeURIComponent(p.room)}`;
      // data-src instead of href: the image is only fetched after "Show floor plan"
      return `<figure hidden>${p.title ? `<figcaption>${p.title}</figcaption>` : ""}
        <svg class="plan-svg" viewBox="${vb.join(" ")}" role="img" aria-label="${esc(p.title || p.room)}">
          <rect x="0" y="0" width="${W}" height="${H}" fill="#fff"/>
          <image data-src="${src}" width="${W}" height="${H}" class="${p.grey ? "grey" : ""}"/>${lines}
        </svg></figure>`;
    })
    .join("");
  const listed = to.type === "room" && graph.indoor[to.building.id]?.listed;
  const hasPage = to.type === "room" && (!listed || listed.has(to.room.id)); // other rooms have no public Rauminfo page
  const info = hasPage ? `<p><a href="${CAFM}/${getLang()}/room/${encodeURIComponent(to.room.id)}" target="_blank" rel="noopener">${t.openInfo} ${to.room.id} ↗</a></p>` : "";
  return `<section class="plan">
    <h3>${t.floorplan}</h3>
    <button id="show-plan" type="button">${plans.some((p) => p.lines) ? t.showPlans : t.showPlan}</button> <small>${t.planNote}</small>
    ${figs}
    ${info}
  </section>`;
}

// ---------- service worker ----------

// offline use after the first visit; a failure (e.g. file:// or private mode) only loses that
if ("serviceWorker" in navigator) {
  // reload once when a new version takes over, so an open page does not keep running old code
  const hadController = !!navigator.serviceWorker.controller; // not on the very first visit
  navigator.serviceWorker.addEventListener("controllerchange", () => {
    if (hadController) location.reload();
  });
  navigator.serviceWorker.register("sw.js", { updateViaCache: "none" }).catch(() => {}); // always fetch a fresh sw.js
}

boot().catch((e) => {
  document.body.classList.remove("loading");
  $("#result").innerHTML = `<p class="note">Error loading data: ${esc(e.message)}</p>`;
  console.error(e);
});
// @license-end
