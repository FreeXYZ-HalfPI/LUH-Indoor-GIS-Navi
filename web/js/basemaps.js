// @license magnet:?xt=urn:btih:1f739d935676111cfff4b4693e3816e664797050&dn=gpl-3.0.txt GPL-v3-or-later
// SPDX-License-Identifier: GPL-3.0-or-later
// The background map and the picker to change it (a Leaflet control on the map).
//
// Raster maps are Leaflet tile layers. Vector maps use MapLibre GL JS, which is big (800 kB), so it
// is loaded from web/vendor/maplibre only when a vector map is chosen. The choice is remembered on
// the device (localStorage, never sent anywhere). The picker shows colour swatches, not previews:
// opening it must not contact every provider. See BASEMAPS in config.js.

import { BASEMAPS } from "./config.js";

const KEY = "luh-navi-basemap";
const TEXT = {
  en: {
    button: "Map style",
    title: "Choose the background map",
    groups: { germany: "Germany", world: "World maps", vector: "Vector maps (MapLibre)" },
    privacy: "Your choice is saved on this device. The provider of the map you pick sees which area you look at and your IP address, like any map site.",
    failed: "That map could not be loaded. Back to the previous map.",
    noWebgl: "Vector maps need WebGL, which this browser does not offer. Raster maps work.",
    close: "Close",
  },
  de: {
    button: "Kartenstil",
    title: "Hintergrundkarte wählen",
    groups: { germany: "Deutschland", world: "Weltkarten", vector: "Vektorkarten (MapLibre)" },
    privacy: "Deine Wahl wird auf diesem Gerät gespeichert. Der Anbieter der gewählten Karte sieht, welchen Ausschnitt du ansiehst, und deine IP-Adresse, wie bei jeder Kartenseite.",
    failed: "Diese Karte konnte nicht geladen werden. Zurück zur vorigen Karte.",
    noWebgl: "Vektorkarten brauchen WebGL, das dieser Browser nicht bietet. Rasterkarten funktionieren.",
    close: "Schließen",
  },
};

const read = () => {
  try {
    return localStorage.getItem(KEY);
  } catch {
    return null; // private window or blocked storage: the default map
  }
};
const write = (id) => {
  try {
    localStorage.setItem(KEY, id);
  } catch {}
};

let webglOk = null;
/** Can this browser draw WebGL? Vector maps need it (older phones, some browsers and remote desktops do not have it). */
function hasWebGL() {
  if (webglOk === null) {
    try {
      const c = document.createElement("canvas");
      webglOk = !!(c.getContext("webgl2") || c.getContext("webgl"));
    } catch {
      webglOk = false;
    }
  }
  return webglOk;
}

let maplibreReady = null;
/** Load MapLibre GL JS and its Leaflet binding once (css, then the two scripts in order). */
function loadMapLibre() {
  if (maplibreReady) return maplibreReady;
  const base = "vendor/maplibre/";
  const script = (src) =>
    new Promise((resolve, reject) => {
      const el = document.createElement("script");
      el.src = base + src;
      el.onload = resolve;
      el.onerror = () => reject(new Error(src));
      document.head.append(el);
    });
  const css = document.createElement("link");
  css.rel = "stylesheet";
  css.href = base + "maplibre-gl.css";
  document.head.append(css);
  maplibreReady = script("maplibre-gl.js")
    .then(() => script("leaflet-maplibre-gl.js"))
    .catch((e) => {
      maplibreReady = null; // try again next time
      throw e;
    });
  return maplibreReady;
}

/**
 * Put the background map on `map` and add the picker.
 * opts: getLang() → "en" | "de", toast(msg) for errors. Returns {set(id), current(), refresh()}.
 */
export function initBasemaps(map, { getLang, toast = () => {} }) {
  let layer = null;
  let current = null;
  let token = 0; // the newest choice wins when a vector map is still loading
  const lang = () => (getLang() === "de" ? "de" : "en");
  const find = (id) => BASEMAPS.find((b) => b.id === id);

  async function makeLayer(b) {
    if (b.kind === "vector") {
      await loadMapLibre();
      return L.maplibreGL({ style: b.style, attribution: b.attribution, pane: "tilePane" });
    }
    return L.tileLayer(b.url, {
      maxZoom: 21, // room explorer: zoom past the tiles (scaled up from the last native zoom)
      maxNativeZoom: b.maxNativeZoom,
      subdomains: b.subdomains || "abc",
      // the OSM tile policy requires a Referer; send only our origin (the page default is no-referrer)
      referrerPolicy: "strict-origin-when-cross-origin",
      attribution: b.attribution,
    });
  }

  async function set(id, remember = true) {
    const b = find(id) || BASEMAPS[0];
    if (b.id === current) return;
    if (b.kind === "vector" && !hasWebGL()) {
      toast(TEXT[lang()].noWebgl);
      redrawRadios();
      return;
    }
    const mine = ++token;
    let next;
    try {
      next = await makeLayer(b);
    } catch {
      if (mine === token) toast(TEXT[lang()].failed);
      if (!current) await set(BASEMAPS[0].id, false); // never leave the map empty
      return;
    }
    if (mine !== token) return; // a newer choice replaced this one while it loaded
    const old = layer;
    try {
      next.addTo(map);
    } catch {
      // the vector layer could not start (WebGL lost, style error): keep the map we had
      try {
        map.removeLayer(next);
      } catch {}
      toast(TEXT[lang()].failed);
      redrawRadios();
      return;
    }
    if (next.bringToBack) next.bringToBack();
    if (old) map.removeLayer(old);
    layer = next;
    current = b.id;
    if (remember) write(b.id);
    redrawRadios();
  }
  /** The picker shows the map that is really shown (also after a failed choice). */
  function redrawRadios() {
    document.querySelectorAll("#basemap-panel input[name=basemap]").forEach((r) => (r.checked = r.value === current));
  }

  // ----- the picker: a button on the map that opens a panel of cards -----
  const Control = L.Control.extend({
    options: { position: "bottomleft" },
    onAdd() {
      const box = L.DomUtil.create("div", "basemap-ctl leaflet-bar");
      L.DomEvent.disableClickPropagation(box);
      L.DomEvent.disableScrollPropagation(box);
      box.innerHTML = `<button type="button" class="basemap-btn" aria-haspopup="true" aria-expanded="false"></button>
        <div id="basemap-panel" class="basemap-panel" role="group" hidden></div>`;
      const btn = box.querySelector("button");
      const panel = box.querySelector(".basemap-panel");
      const toggle = (open) => {
        panel.hidden = !open;
        btn.setAttribute("aria-expanded", String(open));
        if (open) draw();
      };
      btn.addEventListener("click", () => toggle(panel.hidden));
      panel.addEventListener("keydown", (e) => e.key === "Escape" && (toggle(false), btn.focus()));
      this._toggle = toggle;
      this._btn = btn;
      this._panel = panel;
      return box;
    },
  });
  const control = new Control().addTo(map);

  function label() {
    const tx = TEXT[lang()];
    control._btn.innerHTML = `<span aria-hidden="true">🗺️</span> ${tx.button}`;
    control._btn.title = tx.title;
  }

  function draw() {
    const tx = TEXT[lang()];
    const groups = ["germany", "world", "vector"].map((g) => {
      const cards = BASEMAPS.filter((b) => b.group === g)
        .map((b) => {
          const [a, c, d] = b.swatch;
          const off = b.kind === "vector" && !hasWebGL();
          return `<label class="bm-card${off ? " off" : ""}"${off ? ` title="${tx.noWebgl}"` : ""}><input type="radio" name="basemap" value="${b.id}"${b.id === current ? " checked" : ""}${off ? " disabled" : ""}>
            <span class="bm-swatch" style="background:linear-gradient(135deg, ${a} 0 40%, ${c} 40% 70%, ${d} 70%)" aria-hidden="true"></span>
            <span class="bm-text"><b>${b.name[lang()]}</b><small>${b.note[lang()]}</small></span></label>`;
        })
        .join("");
      return `<fieldset class="bm-group"><legend>${tx.groups[g]}</legend>${cards}</fieldset>`;
    });
    control._panel.innerHTML = `<p class="bm-title">${tx.title}</p>${groups.join("")}<p class="bm-note">${tx.privacy}</p>
      <button type="button" class="bm-close">${tx.close}</button>`;
    control._panel.querySelectorAll("input[name=basemap]").forEach((r) => r.addEventListener("change", () => set(r.value)));
    control._panel.querySelector(".bm-close").addEventListener("click", () => {
      control._toggle(false);
      control._btn.focus();
    });
  }

  label();
  const saved = read();
  set(find(saved) ? saved : BASEMAPS[0].id, false);
  return {
    set,
    current: () => current,
    refresh() {
      label();
      if (!control._panel.hidden) draw();
    },
  };
}
// @license-end
