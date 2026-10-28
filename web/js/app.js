// SPDX-License-Identifier: GPL-3.0-or-later
// LUH Campus Navigator: UI, map and route guidance.
//
// A static page, no framework and no build step: the app must run from any
// web server (GitHub Pages) and be easy for students to read and change.
import { Places } from "./rooms.js";
import { WalkGraph, haversine, compass } from "./router.js";
import { t, getLang, setLang, formatDistance } from "./i18n.js";

const CAFM = "https://info.cafm.uni-hannover.de";
const WALK_M_PER_MIN = 80; // ~4.8 km/h, a usual walking speed for route planners

const COLOR_FROM = "#2e8540"; // green: start
const COLOR_TO = "#c8102e"; // red: destination (and the LUH red)
const COLOR_INDOOR = "#7b2cbf"; // purple: everything indoors

const $ = (sel) => document.querySelector(sel);
// escape for innerHTML; names come from data files, never trust them as HTML
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
// Place keys: "b:1101" for a building, "r:1101.000.E028" for a room
const state = { from: null, to: null, avoidSteps: false };
let places, graph, map, routeLayer;
const indoorData = {}; // building → generated indoor JSON (outlines, meta, georef)

// ---------- boot ----------

async function boot() {
  const load = (f) => fetch(`data/${f}`).then((r) => r.json());
  // all data is loaded at start: routing then works offline and without waiting
  const [buildings, rooms, walk, indoorList] = await Promise.all([
    load("buildings.json"),
    load("rooms.json"),
    load("walkgraph.json"),
    load("indoor/index.json").catch(() => []), // the app still works outdoors without indoor data
  ]);
  places = new Places(buildings, rooms);
  graph = new WalkGraph(walk);
  for (const indoor of await Promise.all(indoorList.map((b) => load(`indoor/${b}.json`)))) {
    graph.addIndoor(indoor);
    indoorData[indoor.building] = indoor;
  }

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
  window.addEventListener("hashchange", readHash);

  applyTexts();
  readHash();
  document.body.classList.remove("loading");
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
  $("#lang").textContent = getLang() === "de" ? "EN" : "DE"; // the button names the language you switch to
}

function placeLabel(p) {
  if (!p) return "";
  if (p.type === "building") return `${p.building.id} ${p.building.name}`;
  return `${p.room.id} · ${p.building.name}`;
}

const address = (b) => [b.street, b.house_number].filter(Boolean).join(" ");

/** Second line of a search result: address, or floor · wing · type. */
function placeDetail(p) {
  if (p.type === "building") return `${t.building} · ${address(p.building)}`;
  const bits = [t.floor(p.room.floor)];
  if (p.room.wing) bits.push(t.wing(p.room.wing));
  const meta = roomMeta(p.room.id);
  if (meta) bits.push(meta);
  else if (!places.roomIndex.has(p.room.id)) bits.push(t.unlisted); // a typed code we cannot confirm
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
      list.innerHTML = input.value.trim() ? `<li class="empty">${t.noResults}</li>` : "";
    }
    items.forEach((p, i) => {
      const li = document.createElement("li");
      li.role = "option";
      li.id = `${which}-opt-${i}`;
      li.className = i === active ? "active" : "";
      li.innerHTML = `<span class="ico">${p.type === "room" ? "🚪" : "🏛️"}</span><span><b></b><small></small></span>`;
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
  };

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
      input.setAttribute("aria-activedescendant", `${which}-opt-${active}`);
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
  const key = (v) => (!v ? null : /^\d{4}$/.test(v) ? `b:${v}` : `r:${v}`); // 4 digits = a building
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
  el.hidden = false;
  setTimeout(() => (el.hidden = true), 1800);
}

// ---------- map ----------

function initMap(buildings) {
  map = L.map("map", { zoomControl: true, attributionControl: true }).setView([52.3826, 9.7175], 15); // Welfengarten
  L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
    maxZoom: 21, // room explorer: zoom past the tiles (scaled up from 19)
    maxNativeZoom: 19,
    // the OSM tile policy requires a Referer; send only our origin (the page default is no-referrer)
    referrerPolicy: "strict-origin-when-cross-origin",
    attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
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
let explorerLayer, floorCtl;
let explorerLevel = 0;

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
  // a dashed frame shows which buildings have rooms to explore
  for (const d of Object.values(indoorData)) {
    const ids = Object.keys(d.outlines || {});
    if (!ids.length) continue;
    d.bounds = L.latLngBounds(ids.flatMap((id) => roomRing(id)));
    L.rectangle(d.bounds, { color: COLOR_INDOOR, weight: 1, dashArray: "4 4", fill: false, interactive: false }).addTo(map);
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
  return Object.values(indoorData).filter((d) => d.bounds?.intersects(view));
}

/** The floor buttons for the given levels (highest first, like a lift panel). */
function drawFloorControl(div, levels) {
  div.innerHTML =
    `<span class="floor-ctl-title">${t.floorCtl}</span>` +
    levels.map((l) => `<a href="#" role="button" data-l="${l}" class="${l === explorerLevel ? "on" : ""}" title="${esc(t.floor(l))}">${t.floorShort(l)}</a>`).join("");
  div.querySelectorAll("a").forEach((a) =>
    a.addEventListener("click", (e) => {
      e.preventDefault();
      explorerLevel = Number(a.dataset.l);
      drawExplorer();
    }),
  );
}

/** Redraw the room shapes of the chosen floor; runs after every pan and zoom. */
function drawExplorer() {
  explorerLayer.clearLayers();
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

  const chosen = new Map([[state.from, COLOR_FROM], [state.to, COLOR_TO]].filter(([k]) => k).map(([k, c]) => [k.slice(2), c]));
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
const findRoomStep = (room) => t.stepFindRoom(room.id, room.wing ? t.wing(room.wing) : "");

/** Recompute everything after a change of start, destination or options. */
function update(push = true) {
  if (push) writeHash();
  routeLayer.clearLayers();
  const out = $("#result");
  const from = places.resolve(state.from);
  const to = places.resolve(state.to);
  $("#share").hidden = !(from && to);
  outlineChosenRooms(from, to);
  if (!from || !to) {
    out.innerHTML = "";
    focusPlace(from || to);
    return;
  }

  const g = guidance(from, to);
  const plans = g.indoorLegs.length ? routePlans(g.indoorLegs, from, to) : [];
  // the destination's own plan, when the route ends at the door (no indoor data for it)
  if (to.type === "room" && !g.route?.end.indoor) plans.push({ room: to.room.id, title: plans.length ? `${t.floor(to.room.floor)} · ${t.building} ${to.building.id}` : "" });
  out.innerHTML = `
    ${g.summary ? `<p class="summary">${g.summary}</p>` : ""}
    ${g.notes.map((n) => `<p class="note">${n}</p>`).join("")}
    <ol class="steps">${g.steps.map((s) => `<li>${s}</li>`).join("")}</ol>
    ${plans.length ? floorplanBlock(plans, to) : ""}`;
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

/** Draw the start and destination rooms and switch the explorer to their floor. */
function outlineChosenRooms(from, to) {
  const focus = to?.type === "room" ? to : from?.type === "room" ? from : null; // the destination matters more
  if (focus) explorerLevel = focus.room.floor;
  for (const [p, color] of [[from, COLOR_FROM], [to, COLOR_TO]]) {
    const ring = p?.type === "room" && roomRing(p.room.id);
    if (ring) L.polygon(ring, { color, weight: 2, fillOpacity: 0.45, interactive: false }).addTo(routeLayer);
  }
  drawExplorer();
}

/** Only one place chosen: show it (a link like #to=3101.000.A020 opens on the room). */
function focusPlace(one) {
  const ring = one?.type === "room" && roomRing(one.room.id);
  if (ring) map.fitBounds(L.latLngBounds(ring).pad(1.5), { maxZoom: 19 });
  else if (one) map.setView([one.building.lat, one.building.lon], 17);
}

/**
 * Route, directions and notes for a start and a destination.
 * Three cases: a real route; both in one building without indoor data;
 * buildings on different campuses (no walk graph between them).
 */
function guidance(from, to) {
  const steps = [];
  const notes = [];
  let summary = "";
  let indoorLegs = [];
  const fb = from.building;
  const tb = to.building;

  if (from.type === "room") steps.push(t.stepStartRoom(from.room.id, buildingName(fb), t.floor(from.room.floor)));
  else steps.push(t.stepStartBuilding(buildingName(fb)));

  // each campus has its own walk graph; across campuses there is no route to find
  const sameCluster = graph.buildings[fb.id]?.cluster === graph.buildings[tb.id]?.cluster;
  const r = sameCluster ? graph.route(from, to, { avoidSteps: state.avoidSteps }) : null;
  const trivial = r && !r.legs.length; // same building, no indoor data: start entrance = goal entrance

  if (r && !trivial) {
    summary = t.total(formatDistance(r.distance), minutes(r.time));
    steps.push(...routeSteps(r, from, to));
    indoorLegs = r.legs.filter((l) => l.kind === "indoor");
    if (indoorLegs.length) notes.push(t.indoorApprox);
    // a guessed entrance only matters when the route really starts or ends at a door
    const estimated = [fb.id, tb.id].some((id) => graph.buildings[id]?.estimated && !(r.start.indoor && r.end.indoor));
    if (estimated) notes.push(t.estimated);
    drawRoute(r);
  } else if (fb.id === tb.id) {
    notes.push(t.sameBuilding(buildingName(tb)));
    L.marker([tb.lat, tb.lon], { icon: pin("to", "B") }).addTo(routeLayer);
    map.setView([tb.lat, tb.lon], 18);
    if (to.type === "room") {
      const startFloor = from.type === "room" ? from.room.floor : 0;
      steps.push(to.room.floor === startFloor ? t.stepStayFloor(t.floor(to.room.floor)) : t.stepFloor(t.floor(to.room.floor)));
      steps.push(findRoomStep(to.room));
    }
  } else {
    if (from.type === "room" && from.room.floor !== 0) steps.push(t.stepGoDown(t.floor(from.room.floor)));
    const km = (haversine([fb.lat, fb.lon], [tb.lat, tb.lon]) / 1000).toFixed(1);
    // far apart: point to the public transport planner instead of a 10 km walk
    notes.push(sameCluster ? t.noRoute : `${t.farApart(km)} <a href="https://www.gvh.de/" target="_blank" rel="noopener">gvh.de</a>`);
    steps.push(t.stepGoTo(buildingName(tb), buildingAddress(tb)));
    if (to.type === "room") {
      steps.push(t.stepFloor(t.floor(to.room.floor)));
      steps.push(findRoomStep(to.room));
    }
    const line = L.polyline([[fb.lat, fb.lon], [tb.lat, tb.lon]], { color: "#888", weight: 3, dashArray: "6 8" }).addTo(routeLayer);
    L.marker([fb.lat, fb.lon], { icon: pin("from", "A") }).addTo(routeLayer);
    L.marker([tb.lat, tb.lon], { icon: pin("to", "B") }).addTo(routeLayer);
    map.fitBounds(line.getBounds(), { padding: [30, 30] });
  }
  steps.push(t.stepArrive);
  return { steps, notes, summary, indoorLegs, route: r };
}

/** Turn-by-turn steps for a route: one sentence per leg, plus the way out and in. */
function routeSteps(r, from, to) {
  const steps = [];
  const fb = from.building;
  const tb = to.building;
  // starting at a building without indoor data: first get out of it
  if (!r.start.indoor && r.start.entrance && fb.id !== tb.id) {
    if (from.type === "room" && from.room.floor !== 0) steps.push(t.stepGoDown(t.floor(from.room.floor)));
    steps.push(t.stepExit(sideOf(fb, [r.start.entrance.lat, r.start.entrance.lon]), entranceKind(r.start.entrance)));
  }
  r.legs.forEach((leg, i) => {
    const next = r.legs[i + 1];
    if (leg.kind === "indoor") {
      // an indoor sentence names where the leg ends: the room, a stair/lift or the exit
      const fl = t.floor(leg.level);
      const d = formatDistance(leg.distance);
      if (!next) steps.push(t.stepIndoorTo(fl, d, to.room.id));
      else if (next.kind === "vertical") steps.push(t.stepIndoorToVertical(fl, d, next.type));
      else if (next.kind === "door") steps.push(t.stepIndoorToExit(fl, d));
    } else if (leg.kind === "vertical") {
      steps.push(t.stepVertical(leg.type, leg.toLevel > leg.fromLevel, t.floor(leg.toLevel)));
    } else if (leg.kind === "door") {
      const b = places.building(leg.building);
      steps.push(leg.enter ? t.stepEnter(buildingName(b), buildingAddress(b), sideOf(b, leg.at), "") : t.stepExit(sideOf(b, leg.at), ""));
    } else {
      steps.push(t.stepWalk(formatDistance(leg.distance), minutes(leg.distance), leg.steps));
    }
  });
  // ending at a building without indoor data: enter it and find the room by its number
  if (!r.end.indoor) {
    if (r.end.entrance && r.legs.at(-1).kind === "outdoor")
      steps.push(t.stepEnter(buildingName(tb), buildingAddress(tb), sideOf(tb, [r.end.entrance.lat, r.end.entrance.lon]), entranceKind(r.end.entrance)));
    if (to.type === "room") {
      steps.push(to.room.floor === 0 ? t.stepStayFloor(t.floor(0)) : t.stepFloor(t.floor(to.room.floor)));
      steps.push(findRoomStep(to.room));
    }
  }
  return steps;
}

/** Draw a route: blue outdoors, dashed purple indoors, A and B markers. */
function drawRoute(r) {
  const all = [];
  for (const leg of r.legs) {
    if (!leg.coords) continue; // vertical and door legs have no line
    all.push(...leg.coords);
    if (leg.kind === "outdoor") {
      L.polyline(leg.coords, { color: "#0066cc", weight: 6, opacity: 0.85 }).addTo(routeLayer);
      L.polyline(leg.coords, { color: "#fff", weight: 2, opacity: 0.9, dashArray: "1 10" }).addTo(routeLayer); // dots show the direction
    } else {
      L.polyline(leg.coords, { color: COLOR_INDOOR, weight: 5, opacity: 0.85, dashArray: "8 6" })
        .bindTooltip(t.floor(leg.level))
        .addTo(routeLayer);
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
if ("serviceWorker" in navigator) navigator.serviceWorker.register("sw.js").catch(() => {});

boot().catch((e) => {
  document.body.classList.remove("loading");
  $("#result").innerHTML = `<p class="note">Error loading data: ${esc(e.message)}</p>`;
  console.error(e);
});
