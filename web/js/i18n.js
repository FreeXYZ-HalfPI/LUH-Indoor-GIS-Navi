// SPDX-License-Identifier: GPL-3.0-or-later
// German / English UI strings. Functions take parameters, strings don't.
//
// A plain object per language, no i18n library: two languages do not need one,
// and a translator can edit this file without knowing any tooling.

const dict = {
  en: {
    title: "LUH Campus Navigator",
    subtitle: "Room to room across Leibniz Universität Hannover. No GPS, no tracking.",
    from: "From",
    to: "To",
    fromPh: "Room, building or person, e.g. Volker Epping",
    toPh: "Room, building or person, e.g. Christian Heipke",
    swap: "Swap start and destination",
    go: "Show route",
    avoidSteps: "Avoid steps",
    share: "Share route",
    copied: "Link copied",
    noResults: "No matching room or building",
    building: "Building",
    unlisted: "room code (not in public list)",
    floor: (f) => (f === 0 ? "ground floor" : f > 0 ? `${ordinal(f)} floor` : `basement ${-f}`),
    wing: (w) => `wing / section ${w}`,
    pickBoth: "Please choose both a start and a destination.",
    sameBuilding: (b) => `Both are in building ${b}. No outdoor walk needed.`,
    stepStartRoom: (r, b, fl) => `Start in room <b>${r}</b> (${fl}) in building <b>${b}</b>.`,
    stepStartBuilding: (b) => `Start at building <b>${b}</b>.`,
    stepGoDown: (fl) => `Go to the <b>ground floor</b> (you are on the ${fl}).`,
    stepExit: (dir, kind) => `Leave the building through the <b>${dir}</b> entrance${kind}.`,
    stepWalk: (m, min, steps) => `Walk <b>${m}</b>, about <b>${min} min</b>, following the blue line${steps ? `, including ${steps} flight(s) of steps` : ""}.`,
    stepEnter: (b, addr, dir, kind) => `Enter building <b>${b}</b> (${addr}) through the <b>${dir}</b> entrance${kind}.`,
    stepGoTo: (b, addr) => `Travel to building <b>${b}</b> (${addr}).`,
    stepIndoorTo: (fl, d, r) => `On the <b>${fl}</b>, walk <b>${d}</b> along the corridor to room <b>${r}</b>.`,
    stepIndoorToVertical: (fl, d, type) => `On the <b>${fl}</b>, walk <b>${d}</b> to the ${type === "elevator" ? "lift" : "stairs"}.`,
    stepIndoorToExit: (fl, d) => `On the <b>${fl}</b>, walk <b>${d}</b> to the exit.`,
    stepVertical: (type, up, fl) => `Take the ${type === "elevator" ? "lift" : "stairs"} ${up ? "up" : "down"} to the <b>${fl}</b>.`,
    indoorApprox: "ℹ️ The route inside the building is approximate: it was digitised from floor plans and not yet checked on site.",
    showPlans: "Show floor plans with route",
    planTitle: (fl, b) => `${fl[0].toUpperCase() + fl.slice(1)} · building ${b}`,
    stepFloor: (fl) => `Take the stairs or lift to the <b>${fl}</b>.`,
    stepStayFloor: (fl) => `Stay on the <b>${fl}</b>.`,
    stepFindRoom: (r, wing) => `Find room <b>${r}</b>${wing ? ` in ${wing}` : ""}. The floor plan below shows it in red.`,
    stepArrive: "You have arrived at your destination. 🏁",
    // turn-by-turn lines under a leg; w = "12 steps (9 m)"
    turnFirst: (w) => `Walk <b>${w}</b>.`,
    turn: (dir, w) => `${dir}, then walk <b>${w}</b>.`,
    turnDirs: {
      straight: "Go straight on",
      slightLeft: "Bear <b>slightly left</b>",
      slightRight: "Bear <b>slightly right</b>",
      left: "Turn <b>left</b>",
      right: "Turn <b>right</b>",
      sharpLeft: "Turn <b>sharp left</b>",
      sharpRight: "Turn <b>sharp right</b>",
      uturn: "<b>Turn around</b>",
    },
    steps: (n) => `${n} steps`,
    mainEntrance: " (main entrance)",
    estimated: "⚠️ The entrance of this building is not mapped yet, so the route ends at the building's centre point.",
    farApart: (km) => `These buildings are on different campuses, about <b>${km} km</b> apart. Please use public transport (GVH):`,
    noRoute: "Sorry, no walking route was found between these buildings.",
    floorplan: "Official floor plan (LUH Rauminfo)",
    showPlan: "Show floor plan",
    planNote: "Loads the image from info.cafm.uni-hannover.de",
    openInfo: "Room info",
    dirs: { N: "north", NE: "north-east", E: "east", SE: "south-east", S: "south", SW: "south-west", W: "west", NW: "north-west" },
    total: (m, min) => `${m} · ${min} min walk`,
    fromHere: "Start here",
    toHere: "Go here",
    floorCtl: "Floor",
    floorShort: (f) => (f === 0 ? "G" : f > 0 ? String(f) : `B${-f}`),
    area: (a) => `${a.toLocaleString("en", { maximumFractionDigits: 0 })} m²`,
    about: "About",
    aboutText:
      'Free Software (GPL-3.0) · Map data © <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors · Building and room data © Leibniz Universität Hannover · <a href="https://github.com/FreeXYZ-HalfPI/LUH-Indoor-GIS-Navi">Source code &amp; feedback</a>',
    privacy: "Your location is never requested or stored. Routes are calculated on your phone.",
  },
  de: {
    title: "LUH Campus-Navi",
    subtitle: "Von Raum zu Raum an der Leibniz Universität Hannover. Ohne GPS, ohne Tracking.",
    from: "Von",
    to: "Nach",
    fromPh: "Raum, Gebäude oder Person, z. B. Volker Epping",
    toPh: "Raum, Gebäude oder Person, z. B. Christian Heipke",
    swap: "Start und Ziel tauschen",
    go: "Route anzeigen",
    avoidSteps: "Treppen meiden",
    share: "Route teilen",
    copied: "Link kopiert",
    noResults: "Kein passender Raum oder Gebäude",
    building: "Gebäude",
    unlisted: "Raumcode (nicht in öffentlicher Liste)",
    floor: (f) => (f === 0 ? "Erdgeschoss" : f > 0 ? `${f}. Obergeschoss` : `${-f}. Untergeschoss`),
    wing: (w) => `Bereich / Flügel ${w}`,
    pickBoth: "Bitte Start und Ziel auswählen.",
    sameBuilding: (b) => `Beide liegen in Gebäude ${b}. Kein Weg nach draußen nötig.`,
    stepStartRoom: (r, b, fl) => `Start in Raum <b>${r}</b> (${fl}) in Gebäude <b>${b}</b>.`,
    stepStartBuilding: (b) => `Start am Gebäude <b>${b}</b>.`,
    stepGoDown: (fl) => `Gehe ins <b>Erdgeschoss</b> (du bist im ${fl}).`,
    stepExit: (dir, kind) => `Verlasse das Gebäude durch den Eingang auf der <b>${dir}</b>${kind}.`,
    stepWalk: (m, min, steps) => `Gehe <b>${m}</b>, ca. <b>${min} Min.</b>, entlang der blauen Linie${steps ? `, inkl. ${steps} Treppe(n)` : ""}.`,
    stepEnter: (b, addr, dir, kind) => `Betritt Gebäude <b>${b}</b> (${addr}) durch den Eingang auf der <b>${dir}</b>${kind}.`,
    stepGoTo: (b, addr) => `Fahre zu Gebäude <b>${b}</b> (${addr}).`,
    stepIndoorTo: (fl, d, r) => `Gehe im <b>${fl}</b> <b>${d}</b> über den Flur zu Raum <b>${r}</b>.`,
    stepIndoorToVertical: (fl, d, type) => `Gehe im <b>${fl}</b> <b>${d}</b> ${type === "elevator" ? "zum Aufzug" : "zur Treppe"}.`,
    stepIndoorToExit: (fl, d) => `Gehe im <b>${fl}</b> <b>${d}</b> zum Ausgang.`,
    stepVertical: (type, up, fl) => `Nimm ${type === "elevator" ? "den Aufzug" : "die Treppe"} ${up ? "nach oben" : "nach unten"} ins <b>${fl}</b>.`,
    indoorApprox: "ℹ️ Der Weg im Gebäude ist ungefähr: aus Grundrissen digitalisiert und noch nicht vor Ort geprüft.",
    showPlans: "Grundrisse mit Route anzeigen",
    planTitle: (fl, b) => `${fl} · Gebäude ${b}`,
    stepFloor: (fl) => `Nimm Treppe oder Aufzug ins <b>${fl}</b>.`,
    stepStayFloor: (fl) => `Bleib im <b>${fl}</b>.`,
    stepFindRoom: (r, wing) => `Suche Raum <b>${r}</b>${wing ? ` im ${wing}` : ""}. Der Grundriss unten zeigt ihn rot.`,
    stepArrive: "Du bist an deinem Ziel angekommen. 🏁",
    turnFirst: (w) => `Gehe <b>${w}</b>.`,
    turn: (dir, w) => `${dir}, dann gehe <b>${w}</b>.`,
    turnDirs: {
      straight: "Geradeaus weiter",
      slightLeft: "<b>Halb links</b> halten",
      slightRight: "<b>Halb rechts</b> halten",
      left: "<b>Links</b> abbiegen",
      right: "<b>Rechts</b> abbiegen",
      sharpLeft: "<b>Scharf links</b> abbiegen",
      sharpRight: "<b>Scharf rechts</b> abbiegen",
      uturn: "<b>Umdrehen</b>",
    },
    steps: (n) => `${n} Schritte`,
    mainEntrance: " (Haupteingang)",
    estimated: "⚠️ Der Eingang dieses Gebäudes ist noch nicht kartiert. Die Route endet am Gebäudemittelpunkt.",
    farApart: (km) => `Diese Gebäude liegen auf verschiedenen Campus, ca. <b>${km} km</b> entfernt. Bitte nutze den ÖPNV (GVH):`,
    noRoute: "Leider wurde kein Fußweg zwischen diesen Gebäuden gefunden.",
    floorplan: "Offizieller Grundriss (LUH Rauminfo)",
    showPlan: "Grundriss anzeigen",
    planNote: "Lädt das Bild von info.cafm.uni-hannover.de",
    openInfo: "Rauminfo",
    dirs: { N: "Nordseite", NE: "Nordostseite", E: "Ostseite", SE: "Südostseite", S: "Südseite", SW: "Südwestseite", W: "Westseite", NW: "Nordwestseite" },
    total: (m, min) => `${m} · ${min} Min. zu Fuß`,
    fromHere: "Start hier",
    toHere: "Ziel hier",
    floorCtl: "Etage",
    floorShort: (f) => (f === 0 ? "EG" : f > 0 ? String(f) : `U${-f}`),
    area: (a) => `${a.toLocaleString("de", { maximumFractionDigits: 0 })} m²`,
    about: "Über",
    aboutText:
      'Freie Software (GPL-3.0) · Kartendaten © <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>-Mitwirkende · Gebäude- und Raumdaten © Leibniz Universität Hannover · <a href="https://github.com/FreeXYZ-HalfPI/LUH-Indoor-GIS-Navi">Quellcode &amp; Feedback</a>',
    privacy: "Dein Standort wird nie abgefragt oder gespeichert. Routen werden auf deinem Handy berechnet.",
  },
};

/** 1 → 1st, 2 → 2nd, 11 → 11th, 23 → 23rd. */
function ordinal(n) {
  const s = ["th", "st", "nd", "rd"];
  const v = n % 100;
  // 21–23 etc. via (v - 20) % 10, 1–3 via s[v]; 11–13 hit neither and get "th"
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
}

// saved choice first, then the browser language; German speakers get German
let lang = (() => {
  try {
    const saved = localStorage.getItem("lang");
    if (saved in dict) return saved;
  } catch {} // localStorage is blocked in some private modes
  return (navigator.language || "en").toLowerCase().startsWith("de") ? "de" : "en";
})();

// t.key reads the current language and falls back to English, so a missing
// German string shows English instead of "undefined"
export const t = new Proxy({}, { get: (_, k) => dict[lang][k] ?? dict.en[k] });
export const getLang = () => lang;
export function setLang(l) {
  lang = l;
  try {
    localStorage.setItem("lang", l);
  } catch {}
}

// Step length of an average adult walking at a normal pace (~0.75 m; men ~0.78, women ~0.70).
// Steps are easier to follow indoors than metres: nobody can see 20 m, everybody can count.
export const STEP_M = 0.75;

/** 9 → "12 steps (9 m)", 437 → "about 580 steps (440 m)": steps rounded more the longer the walk. */
export function formatWalk(m) {
  const n = m / STEP_M;
  const steps = n < 30 ? Math.max(1, Math.round(n)) : n < 200 ? Math.round(n / 5) * 5 : Math.round(n / 10) * 10;
  return `${t.steps(steps)} (${m < 100 ? `${Math.max(1, Math.round(m))} m` : formatDistance(m)})`;
}

/** 437 → "440 m", 1250 → "1.3 km" ("1,3 km" in German). Rounded: the routes are estimates. */
export function formatDistance(m) {
  return m < 1000 ? `${Math.round(m / 10) * 10} m` : `${(m / 1000).toFixed(1).replace(".", lang === "de" ? "," : ".")} km`;
}
