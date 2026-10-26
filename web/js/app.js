// SPDX-License-Identifier: GPL-3.0-or-later
// LUH Campus Navigator: UI, map and route guidance.
import { Places } from "./rooms.js";
import { WalkGraph, haversine, compass } from "./router.js";
import { t, getLang, setLang, formatDistance } from "./i18n.js";

const CAFM = "https://info.cafm.uni-hannover.de";
const WALK_M_PER_MIN = 80;

const $ = (sel) => document.querySelector(sel);
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
const state = { from: null, to: null, avoidSteps: false };
let places, graph, map, routeLayer;

// ---------- boot ----------

async function boot() {
  const load = (f) => fetch(`data/${f}`).then((r) => r.json());
  const [buildings, rooms, walk, indoorList] = await Promise.all([
    load("buildings.json"),
    load("rooms.json"),
    load("walkgraph.json"),
    load("indoor/index.json").catch(() => []),
  ]);
  places = new Places(buildings, rooms);
  graph = new WalkGraph(walk);
  for (const indoor of await Promise.all(indoorList.map((b) => load(`indoor/${b}.json`)))) graph.addIndoor(indoor);

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

function applyTexts() {
  document.documentElement.lang = getLang();
  document.querySelectorAll("[data-t]").forEach((el) => (el.textContent = t[el.dataset.t]));
  document.querySelectorAll("[data-t-html]").forEach((el) => (el.innerHTML = t[el.dataset.tHtml]));
  $("#from-input").placeholder = t.fromPh;
  $("#to-input").placeholder = t.toPh;
  $("#swap").title = $("#swap").ariaLabel = t.swap;
  $("#lang").textContent = getLang() === "de" ? "EN" : "DE";
}

function placeLabel(p) {
  if (!p) return "";
  if (p.type === "building") return `${p.building.id} ${p.building.name}`;
  return `${p.room.id} · ${p.building.name}`;
}

function placeDetail(p) {
  const b = p.building;
  const addr = [b.street, b.house_number].filter(Boolean).join(" ");
  if (p.type === "building") return `${t.building} · ${addr}`;
  const bits = [t.floor(p.room.floor)];
  if (p.room.wing) bits.push(t.wing(p.room.wing));
  if (!places.roomIndex.has(p.room.id)) bits.push(t.unlisted);
  return bits.join(" · ");
}

// ---------- search pickers ----------

function initPicker(which) {
  const input = $(`#${which}-input`);
  const list = $(`#${which}-list`);
  let items = [];
  let active = -1;

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
    if (which === "from" && !state.to) $("#to-input").focus();
    else input.blur();
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
      li.querySelector("b").textContent = placeLabel(p);
      li.querySelector("small").textContent = placeDetail(p);
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
    state[which] = null;
    render();
  });
  input.addEventListener("focus", () => {
    if (!state[which]) render();
    else input.select();
  });
  input.addEventListener("blur", () => setTimeout(close, 100));
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
      if (items.length) choose(items[Math.max(0, active)]);
    } else if (e.key === "Escape") close();
  });
}

function syncInputs() {
  $("#from-input").value = placeLabel(places.resolve(state.from));
  $("#to-input").value = placeLabel(places.resolve(state.to));
}

// ---------- URL hash (stays on the device; fragments are never sent to a server) ----------

function readHash() {
  const h = new URLSearchParams(location.hash.slice(1));
  const key = (v) => (!v ? null : /^\d{4}$/.test(v) ? `b:${v}` : `r:${v}`);
  const from = places.resolve(key(h.get("from")));
  const to = places.resolve(key(h.get("to")));
  state.from = from?.key ?? null;
  state.to = to?.key ?? null;
  state.avoidSteps = h.get("steps") === "0";
  $("#avoid-steps").checked = state.avoidSteps;
  syncInputs();
  update(false);
}

function writeHash() {
  const h = new URLSearchParams();
  if (state.from) h.set("from", state.from.slice(2));
  if (state.to) h.set("to", state.to.slice(2));
  if (state.avoidSteps) h.set("steps", "0");
  const s = h.toString();
  history.replaceState(null, "", s ? `#${s}` : location.pathname);
}

async function share() {
  const url = location.href;
  try {
    if (navigator.share) await navigator.share({ title: t.title, url });
    else {
      await navigator.clipboard.writeText(url);
      toast(t.copied);
    }
  } catch {}
}

function toast(msg) {
  const el = $("#toast");
  el.textContent = msg;
  el.hidden = false;
  setTimeout(() => (el.hidden = true), 1800);
}

// ---------- map ----------

function initMap(buildings) {
  map = L.map("map", { zoomControl: true, attributionControl: true }).setView([52.3826, 9.7175], 15);
  L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
    maxZoom: 19,
    // the OSM tile policy requires a Referer; send only our origin (the page default is no-referrer)
    referrerPolicy: "strict-origin-when-cross-origin",
    attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
  }).addTo(map);

  for (const b of buildings) {
    const m = L.circleMarker([b.lat, b.lon], { radius: 5, color: "#003366", weight: 1, fillColor: "#5b8fc7", fillOpacity: 0.8 }).addTo(map);
    m.bindTooltip(`${b.id} ${b.name}`);
    m.on("click", () => {
      const div = document.createElement("div");
      div.className = "popup";
      div.innerHTML = `<b></b><br><small></small><div class="popup-btns"><button data-w="from"></button><button data-w="to"></button></div>`;
      div.querySelector("b").textContent = `${b.id} ${b.name}`;
      div.querySelector("small").textContent = [b.street, b.house_number].filter(Boolean).join(" ");
      div.querySelector('[data-w="from"]').textContent = t.fromHere;
      div.querySelector('[data-w="to"]').textContent = t.toHere;
      div.querySelectorAll("button").forEach((btn) =>
        btn.addEventListener("click", () => {
          state[btn.dataset.w] = `b:${b.id}`;
          syncInputs();
          map.closePopup();
          update();
        }),
      );
      L.popup().setLatLng([b.lat, b.lon]).setContent(div).openOn(map);
    });
  }
  routeLayer = L.layerGroup().addTo(map);
}

const pin = (cls, label) =>
  L.divIcon({ className: `pin ${cls}`, html: `<span>${label}</span>`, iconSize: [28, 28], iconAnchor: [14, 14] });

// ---------- route & guidance ----------

function update(push = true) {
  if (push) writeHash();
  routeLayer.clearLayers();
  const out = $("#result");
  const from = places.resolve(state.from);
  const to = places.resolve(state.to);
  $("#share").hidden = !(from && to);
  if (!from || !to) {
    out.innerHTML = "";
    const one = from || to;
    if (one) map.setView([one.building.lat, one.building.lon], 17);
    return;
  }

  const steps = [];
  const notes = [];
  let summary = "";
  const fb = from.building;
  const tb = to.building;
  const name = (b) => esc(`${b.id} ${b.name}`);
  const addr = (b) => esc([b.street, b.house_number].filter(Boolean).join(" "));
  const kind = (e) => (e.kind === "main" ? t.mainEntrance : "");
  const dirOf = (b, p) => t.dirs[compass([b.lat, b.lon], p)];
  const mins = (m) => Math.max(1, Math.round(m / WALK_M_PER_MIN));

  if (from.type === "room") steps.push(t.stepStartRoom(from.room.id, name(fb), t.floor(from.room.floor)));
  else steps.push(t.stepStartBuilding(name(fb)));

  const sameCluster = graph.buildings[fb.id]?.cluster === graph.buildings[tb.id]?.cluster;
  const r = sameCluster ? graph.route(from, to, { avoidSteps: state.avoidSteps }) : null;
  const trivial = r && !r.legs.length; // same building, no indoor data: start entrance = goal entrance
  let indoorLegs = [];

  if (r && !trivial) {
    summary = t.total(formatDistance(r.distance), mins(r.time));
    if (!r.start.indoor && r.start.entrance && fb.id !== tb.id) {
      if (from.type === "room" && from.room.floor !== 0) steps.push(t.stepGoDown(t.floor(from.room.floor)));
      steps.push(t.stepExit(dirOf(fb, [r.start.entrance.lat, r.start.entrance.lon]), kind(r.start.entrance)));
    }
    r.legs.forEach((leg, i) => {
      const next = r.legs[i + 1];
      if (leg.kind === "indoor") {
        const fl = t.floor(leg.level);
        const d = formatDistance(leg.distance);
        if (!next) steps.push(t.stepIndoorTo(fl, d, to.room.id));
        else if (next.kind === "vertical") steps.push(t.stepIndoorToVertical(fl, d, next.type));
        else if (next.kind === "door") steps.push(t.stepIndoorToExit(fl, d));
      } else if (leg.kind === "vertical") {
        steps.push(t.stepVertical(leg.type, leg.toLevel > leg.fromLevel, t.floor(leg.toLevel)));
      } else if (leg.kind === "door") {
        const b = places.building(leg.building);
        steps.push(leg.enter ? t.stepEnter(name(b), addr(b), dirOf(b, leg.at), "") : t.stepExit(dirOf(b, leg.at), ""));
      } else {
        steps.push(t.stepWalk(formatDistance(leg.distance), mins(leg.distance), leg.steps));
      }
    });
    if (!r.end.indoor) {
      if (r.end.entrance && r.legs.at(-1).kind === "outdoor")
        steps.push(t.stepEnter(name(tb), addr(tb), dirOf(tb, [r.end.entrance.lat, r.end.entrance.lon]), kind(r.end.entrance)));
      if (to.type === "room") {
        steps.push(to.room.floor === 0 ? t.stepStayFloor(t.floor(0)) : t.stepFloor(t.floor(to.room.floor)));
        steps.push(t.stepFindRoom(to.room.id, to.room.wing ? t.wing(to.room.wing) : ""));
      }
    }
    indoorLegs = r.legs.filter((l) => l.kind === "indoor");
    if (indoorLegs.length) notes.push(t.indoorApprox);
    const estimated = [fb.id, tb.id].some((id) => graph.buildings[id]?.estimated && !(r.start.indoor && r.end.indoor));
    if (estimated) notes.push(t.estimated);

    const all = [];
    for (const leg of r.legs) {
      if (!leg.coords) continue;
      all.push(...leg.coords);
      if (leg.kind === "outdoor") {
        L.polyline(leg.coords, { color: "#0066cc", weight: 6, opacity: 0.85 }).addTo(routeLayer);
        L.polyline(leg.coords, { color: "#fff", weight: 2, opacity: 0.9, dashArray: "1 10" }).addTo(routeLayer);
      } else {
        L.polyline(leg.coords, { color: "#7b2cbf", weight: 5, opacity: 0.85, dashArray: "8 6" })
          .bindTooltip(t.floor(leg.level))
          .addTo(routeLayer);
      }
    }
    L.marker(r.coords[0], { icon: pin("from", "A") }).addTo(routeLayer);
    L.marker(r.coords.at(-1), { icon: pin("to", "B") }).addTo(routeLayer);
    map.fitBounds(L.latLngBounds(all.length ? all : r.coords), { padding: [30, 30], maxZoom: 19 });
  } else if (fb.id === tb.id) {
    notes.push(t.sameBuilding(name(tb)));
    L.marker([tb.lat, tb.lon], { icon: pin("to", "B") }).addTo(routeLayer);
    map.setView([tb.lat, tb.lon], 18);
    if (to.type === "room") {
      const startFloor = from.type === "room" ? from.room.floor : 0;
      steps.push(to.room.floor === startFloor ? t.stepStayFloor(t.floor(to.room.floor)) : t.stepFloor(t.floor(to.room.floor)));
      steps.push(t.stepFindRoom(to.room.id, to.room.wing ? t.wing(to.room.wing) : ""));
    }
  } else {
    if (from.type === "room" && from.room.floor !== 0) steps.push(t.stepGoDown(t.floor(from.room.floor)));
    const km = (haversine([fb.lat, fb.lon], [tb.lat, tb.lon]) / 1000).toFixed(1);
    notes.push(sameCluster ? t.noRoute : `${t.farApart(km)} <a href="https://www.gvh.de/" target="_blank" rel="noopener">gvh.de</a>`);
    steps.push(t.stepGoTo(name(tb), addr(tb)));
    if (to.type === "room") {
      steps.push(t.stepFloor(t.floor(to.room.floor)));
      steps.push(t.stepFindRoom(to.room.id, to.room.wing ? t.wing(to.room.wing) : ""));
    }
    const line = L.polyline([[fb.lat, fb.lon], [tb.lat, tb.lon]], { color: "#888", weight: 3, dashArray: "6 8" }).addTo(routeLayer);
    L.marker([fb.lat, fb.lon], { icon: pin("from", "A") }).addTo(routeLayer);
    L.marker([tb.lat, tb.lon], { icon: pin("to", "B") }).addTo(routeLayer);
    map.fitBounds(line.getBounds(), { padding: [30, 30] });
  }
  steps.push(t.stepArrive);

  const plans = indoorLegs.length ? routePlans(indoorLegs, from, to) : [];
  if (to.type === "room" && !r?.end.indoor) plans.push({ room: to.room.id, title: plans.length ? `${t.floor(to.room.floor)} · ${t.building} ${tb.id}` : "" });
  out.innerHTML = `
    ${summary ? `<p class="summary">${summary}</p>` : ""}
    ${notes.map((n) => `<p class="note">${n}</p>`).join("")}
    <ol class="steps">${steps.map((s) => `<li>${s}</li>`).join("")}</ol>
    ${plans.length ? floorplanBlock(plans, to) : ""}`;
  const btn = out.querySelector("#show-plan");
  if (btn)
    btn.addEventListener("click", () => {
      out.querySelectorAll(".plan image[data-src]").forEach((img) => {
        img.addEventListener("error", () => (img.closest("figure").hidden = true));
        img.setAttribute("href", img.dataset.src);
        img.closest("figure").hidden = false;
      });
      btn.remove();
    });
}

/** One floor plan per building floor the route passes indoors, with the route drawn on top. */
function routePlans(legs, from, to) {
  const groups = new Map();
  for (const leg of legs) {
    const key = `${leg.building}:${leg.level}`;
    if (!groups.has(key)) groups.set(key, { building: leg.building, level: leg.level, lines: [] });
    groups.get(key).lines.push(leg.px);
  }
  return [...groups.values()].map((g) => {
    const lv = graph.indoor[g.building].levels[String(g.level)];
    const pick = [to, from].find((p) => p.type === "room" && p.building.id === g.building && p.room.floor === g.level);
    const toImage = ([x, y]) => [(x - lv.dx) / lv.s, (y - lv.dy) / lv.s];
    return {
      room: pick ? pick.room.id : lv.room,
      grey: !pick, // another room's plan: hide its red highlight
      title: t.planTitle(t.floor(g.level), g.building),
      lines: g.lines.map((l) => l.map(toImage)),
    };
  });
}

function floorplanBlock(plans, to) {
  const figs = plans
    .map((p) => {
      // zoom to the part of the plan the route uses
      let vb = [0, 0, 1600, 1200];
      if (p.lines) {
        const pts = p.lines.flat();
        const xs = pts.map((q) => q[0]);
        const ys = pts.map((q) => q[1]);
        let [x0, x1, y0, y1] = [Math.min(...xs) - 90, Math.max(...xs) + 90, Math.min(...ys) - 90, Math.max(...ys) + 90];
        const w = Math.max(x1 - x0, 480);
        const h = Math.max(y1 - y0, w * 0.6);
        x0 = Math.max(0, Math.min(1600 - w, (x0 + x1 - w) / 2));
        y0 = Math.max(0, Math.min(1200 - h, (y0 + y1 - h) / 2));
        vb = [x0, y0, w, h].map((v) => Math.round(v));
      }
      const lines = (p.lines || [])
        .map((l) => {
          const pts = l.map(([x, y]) => `${x.toFixed(0)},${y.toFixed(0)}`).join(" ");
          const [sx, sy] = l[0];
          const [ex, ey] = l.at(-1);
          return `<polyline points="${pts}"/><circle class="s" cx="${sx.toFixed(0)}" cy="${sy.toFixed(0)}" r="8"/><circle class="e" cx="${ex.toFixed(0)}" cy="${ey.toFixed(0)}" r="8"/>`;
        })
        .join("");
      const src = `${CAFM}/images/room/floorplan/${encodeURIComponent(p.room)}`;
      return `<figure hidden>${p.title ? `<figcaption>${p.title}</figcaption>` : ""}
        <svg class="plan-svg" viewBox="${vb.join(" ")}" role="img" aria-label="${esc(p.title || p.room)}">
          <rect x="0" y="0" width="1600" height="1200" fill="#fff"/>
          <image data-src="${src}" width="1600" height="1200" class="${p.grey ? "grey" : ""}"/>${lines}
        </svg></figure>`;
    })
    .join("");
  const info = to.type === "room" ? `<p><a href="${CAFM}/${getLang()}/room/${encodeURIComponent(to.room.id)}" target="_blank" rel="noopener">${t.openInfo} ${to.room.id} ↗</a></p>` : "";
  return `<section class="plan">
    <h3>${t.floorplan}</h3>
    <button id="show-plan" type="button">${plans.some((p) => p.lines) ? t.showPlans : t.showPlan}</button> <small>${t.planNote}</small>
    ${figs}
    ${info}
  </section>`;
}

// ---------- service worker ----------

if ("serviceWorker" in navigator) navigator.serviceWorker.register("sw.js").catch(() => {});

boot().catch((e) => {
  document.body.classList.remove("loading");
  $("#result").innerHTML = `<p class="note">Error loading data: ${e.message}</p>`;
  console.error(e);
});
