// SPDX-License-Identifier: GPL-3.0-or-later
// German / English UI strings. Functions take parameters, strings don't.

const dict = {
  en: {
    title: "LUH Campus Navigator",
    subtitle: "Room to room across Leibniz Universität Hannover. No GPS, no tracking.",
    from: "From",
    to: "To",
    fromPh: "Room or building, e.g. 1101.000.E028",
    toPh: "Room or building, e.g. 3403 or Hauptgebäude",
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
    stepWalk: (m, min, steps) => `Walk <b>${m}</b> (about <b>${min} min</b>) following the blue line${steps ? `, including ${steps} flight(s) of steps` : ""}.`,
    stepEnter: (b, addr, dir, kind) => `Enter building <b>${b}</b> (${addr}) through the <b>${dir}</b> entrance${kind}.`,
    stepGoTo: (b, addr) => `Travel to building <b>${b}</b> (${addr}).`,
    stepFloor: (fl) => `Take the stairs or lift to the <b>${fl}</b>.`,
    stepStayFloor: (fl) => `Stay on the <b>${fl}</b>.`,
    stepFindRoom: (r, wing) => `Find room <b>${r}</b>${wing ? ` in ${wing}` : ""}. The floor plan below shows it in red.`,
    stepArrive: "You have arrived. Good luck with your lecture! 🎓",
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
    fromPh: "Raum oder Gebäude, z. B. 1101.000.E028",
    toPh: "Raum oder Gebäude, z. B. 3403 oder Hauptgebäude",
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
    stepWalk: (m, min, steps) => `Gehe <b>${m}</b> (ca. <b>${min} Min.</b>) entlang der blauen Linie${steps ? `, inkl. ${steps} Treppe(n)` : ""}.`,
    stepEnter: (b, addr, dir, kind) => `Betritt Gebäude <b>${b}</b> (${addr}) durch den Eingang auf der <b>${dir}</b>${kind}.`,
    stepGoTo: (b, addr) => `Fahre zu Gebäude <b>${b}</b> (${addr}).`,
    stepFloor: (fl) => `Nimm Treppe oder Aufzug ins <b>${fl}</b>.`,
    stepStayFloor: (fl) => `Bleib im <b>${fl}</b>.`,
    stepFindRoom: (r, wing) => `Suche Raum <b>${r}</b>${wing ? ` im ${wing}` : ""}. Der Grundriss unten zeigt ihn rot.`,
    stepArrive: "Du bist angekommen. Viel Erfolg in der Vorlesung! 🎓",
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
    about: "Über",
    aboutText:
      'Freie Software (GPL-3.0) · Kartendaten © <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>-Mitwirkende · Gebäude- und Raumdaten © Leibniz Universität Hannover · <a href="https://github.com/FreeXYZ-HalfPI/LUH-Indoor-GIS-Navi">Quellcode &amp; Feedback</a>',
    privacy: "Dein Standort wird nie abgefragt oder gespeichert. Routen werden auf deinem Handy berechnet.",
  },
};

function ordinal(n) {
  const s = ["th", "st", "nd", "rd"];
  const v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
}

let lang = (() => {
  try {
    const saved = localStorage.getItem("lang");
    if (saved in dict) return saved;
  } catch {}
  return (navigator.language || "en").toLowerCase().startsWith("de") ? "de" : "en";
})();

export const t = new Proxy({}, { get: (_, k) => dict[lang][k] ?? dict.en[k] });
export const getLang = () => lang;
export function setLang(l) {
  lang = l;
  try {
    localStorage.setItem("lang", l);
  } catch {}
}

export function formatDistance(m) {
  return m < 1000 ? `${Math.round(m / 10) * 10} m` : `${(m / 1000).toFixed(1).replace(".", lang === "de" ? "," : ".")} km`;
}
