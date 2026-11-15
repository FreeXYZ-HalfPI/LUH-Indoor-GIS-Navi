// @license magnet:?xt=urn:btih:1f739d935676111cfff4b4693e3816e664797050&dn=gpl-3.0.txt GPL-v3-or-later
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
    skip: "Skip to route planner",
    aboutBtn: "About",
    quickTitle: "Popular places",
    quick: [
      ["from", "t:hannover-hauptbahnhof", "🚉", "I am at the Hauptbahnhof"],
      ["to", "s:international-office", "🌍", "International Office"],
      ["to", "b:3110", "🍽️", "Hauptmensa"],
      ["to", "b:1101", "🏛️", "Hauptgebäude"],
    ],
    avoidWarn: "Watch out! Attention!",
    avoidWarnText: (stairs, steps) =>
      `No way without steps was found. This route still has ${[stairs ? `${stairs} flight${stairs > 1 ? "s" : ""} of stairs` : "", steps ? `${steps} outdoor step${steps > 1 ? "s" : ""}` : ""].filter(Boolean).join(" and ")}. Ask for help or check the way on site.`,
    avoidOk: "No stairs or steps on this route, as far as our data knows. It is drawn from floor plans, so check on site.",
    commentBtn: "Comment on this route",
    commentTitle: "Comment on this route",
    commentCatLabel: "What is it about?",
    commentCat: { entrance: "Wrong entrance", closed: "Door locked or closed", stairs: "Stairs or lift wrong", floor: "Wrong floor", other: "Something else" },
    commentStep: "Which step? (optional)",
    commentStepNone: "Not about one step",
    commentText: "Your comment",
    commentPh: "Tell us what you found on site …",
    commentSend: "Send comment",
    commentCancel: "Cancel",
    commentNote: "Sending opens GitHub in a new tab with your comment filled in (a GitHub account is needed). Nothing is sent before you press the button there. Only room codes and your text are included, so please leave out names.",
    commentCat0: "Comment",
    lineMode: { tram: "Stadtbahn", bus: "bus" },
    stopKinds: { rail: "Train station", tram: "Stadtbahn", bus: "Bus" },
    stepStartStop: (n) => `Start at the stop <b>${n}</b>.`,
    stepStartHub: (n) => `Start at <b>${n}</b>.`,
    stepRide: (hub, stop, lines, direct) =>
      direct
        ? `Ride ${lines} from <b>${hub}</b> to the stop <b>${stop}</b>.`
        : `Ride to the stop <b>${stop}</b> by public transport${lines ? ` (served by ${lines})` : ""}. Look up the connection in the GVH planner.`,
    stepRideTo: (stop, hub, lines, direct) =>
      direct
        ? `Ride ${lines} from <b>${stop}</b> to <b>${hub}</b>.`
        : `Ride from the stop <b>${stop}</b> to <b>${hub}</b> by public transport. Look up the connection in the GVH planner.`,
    hubNote: 'The walking time and distance below are for the walk from or to the stop. Times and tickets: <a href="https://www.gvh.de/" target="_blank" rel="noopener">GVH planner</a>. Lines come from OpenStreetMap and can be incomplete or out of date.',
    hubAlt: (list) => `Other stops near the goal: ${list}.`,
    hubPlannerOnly: 'Between two stations you ride, not walk: use the <a href="https://www.gvh.de/" target="_blank" rel="noopener">GVH planner</a>.',
    hubPlannerOnly: 'Zwischen zwei Haltestellen fährst du, statt zu gehen: nutze den <a href="https://www.gvh.de/" target="_blank" rel="noopener">GVH-Fahrplan</a>.',
    hubNoStop: 'No stop near the goal was found. Use the <a href="https://www.gvh.de/" target="_blank" rel="noopener">GVH planner</a>.',
    serviceInfo: "Opening hours and contact",
    stepWord: "Step",
    loadingBuilding: "Loading the building map …",
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
    // indoor directions are short: where to turn, what you pass, where it ends (no step counts)
    indoorHow: (turns, via) => `${turns.length ? `turn <b>${turns.join("</b>, then <b>")}</b>, ` : ""}follow the corridor${via.length ? ` past ${via.join(", ")}` : ""}`,
    turnWord: { left: "left", right: "right" },
    landmark: (room, name) => `<b>${room}</b> (${name})`,
    stepIndoorTo: (fl, how, r) => `On the <b>${fl}</b>, ${how} to room <b>${r}</b>.`,
    stepIndoorToVertical: (fl, how, type) => `On the <b>${fl}</b>, ${how} to the ${type === "elevator" ? "lift" : "stairs"}.`,
    stepIndoorToExit: (fl, how) => `On the <b>${fl}</b>, ${how} to the exit.`,
    stepArrivePerson: (r, name) => `You are at <b>${r}</b>. Say hi to <b>${name}</b>! 👋`,
    stepVertical: (type, up, fl) => `Take the ${type === "elevator" ? "lift" : "stairs"} ${up ? "up" : "down"} to the <b>${fl}</b>.`,
    indoorApprox: "ℹ️ The route inside the building is approximate: it was digitised from floor plans and not yet checked on site.",
    indoorVerified: (list) => `✅ The route inside the building was checked on site: ${list}.`,
    indoorMixed: (ok, approx) => `ℹ️ Checked on site: ${ok}. Still approximate (digitised from floor plans, not yet checked): ${approx}.`,
    confTitle: "Confidence",
    confLevel: { high: "high", medium: "medium", low: "low" },
    confReason: {
      verified: "Every floor was checked on site.",
      plansOnly: "Digitised from floor plans, not yet walked on site.",
      partlyVerified: "Some floors were checked on site, the others only digitised from plans.",
      noIndoorStart: "The start has no indoor map yet: the route only leads from the building's door.",
      noIndoorEnd: "The destination has no indoor map yet: the route only leads to the building's door.",
      estimatedEntrance: "An entrance of this building is not mapped yet: that end of the route is a guess.",
      unconfirmedRoom: "This room code is not in the university's room list.",
    },
    confOk: (date) => `✓ checked on site ${date}`,
    confApprox: "≈ approximate",
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
    report: "Report a problem with this route",
    reportNote: "Your comment helps the next person. Only room codes and your text are sent, no names.",
    reportText: {
      title: (a, b) => `Route problem: ${a} → ${b}`,
      whatWrong: "What went wrong?",
      body: ["<!-- e.g. wrong entrance, door locked, a staircase that does not exist, wrong floor. Which step? -->", ""],
    },
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
    helpBtn: "Help",
    helpTitle: "How to use the Navigator",
    close: "Close",
    welcomeTitle: "Find your way in 3 steps",
    steps3: [
      "<b>Where are you?</b> Type a room code (like 3101.001.A104), a building number (like 1101) or a person's name into the field <b>A</b>.",
      "<b>Where do you want to go?</b> Do the same in the field <b>B</b>.",
      "<b>Follow the steps.</b> The route appears on the map and as a list. The numbers on the map are the numbers in the list; tap one to see the other.",
    ],
    tryExample: "Try an example (one tap)",
    examples: ["Lecture hall A104 → Hauptmensa", "Hauptgebäude: ground floor → 4th floor", "Find a person: Prof. Heipke → Prof. Sester", "New here? Hauptgebäude → International Office", "At the station? Hauptbahnhof → room A260 (3101)"],
    hintNeedTo: "Good. Now choose <b>where you want to go</b> in the field B.",
    hintNeedFrom: "Good. Now choose <b>where you are</b> in the field A.",
    accessHint: "Need a way without stairs? Tick <b>Avoid steps</b> before you start.",
    helpLegend: "What you see on the map",
    legend: [
      ["A", "Your start."],
      ["B", "Your destination."],
      ["3", "Step number 3 of the directions. Faint: it is on another floor."],
      ["▭", "A purple dashed frame: a building with rooms you can explore. Zoom in and tap a room."],
      ["G 1 2", "The floor buttons on the right. A dot marks the floors your route passes."],
    ],
    helpOptions: "Good to know",
    helpTips: [
      "<b>Avoid steps</b> prefers lifts and flat paths.",
      "<b>Share route</b> sends a link; whoever opens it sees the same route.",
      "<b>⇅</b> swaps start and destination. <b>DE / EN</b> changes the language.",
      "<b>Confidence</b> tells how far a route can be trusted. Until a floor is walked on site, routes are drawn from floor plans and may be a few metres off.",
      "Works offline after your first visit. Nothing is installed, no account is needed and your location is never requested.",
    ],
    aboutProject: "About the idea and the project",
  },
  de: {
    title: "LUH Campus-Navi",
    subtitle: "Von Raum zu Raum an der Leibniz Universität Hannover. Ohne GPS, ohne Tracking.",
    from: "Von",
    to: "Nach",
    fromPh: "Raum, Gebäude oder Person, z. B. Volker Epping",
    toPh: "Raum, Gebäude oder Person, z. B. Christian Heipke",
    skip: "Zur Routenplanung springen",
    aboutBtn: "Über",
    quickTitle: "Beliebte Ziele",
    quick: [
      ["from", "t:hannover-hauptbahnhof", "🚉", "Ich bin am Hauptbahnhof"],
      ["to", "s:international-office", "🌍", "International Office"],
      ["to", "b:3110", "🍽️", "Hauptmensa"],
      ["to", "b:1101", "🏛️", "Hauptgebäude"],
    ],
    avoidWarn: "Pass auf! Achtung!",
    avoidWarnText: (stairs, steps) =>
      `Es wurde kein Weg ohne Stufen gefunden. Diese Route hat trotzdem ${[stairs ? `${stairs} Treppe${stairs > 1 ? "n" : ""}` : "", steps ? `${steps} Stufe${steps > 1 ? "n" : ""} draußen` : ""].filter(Boolean).join(" und ")}. Bitte um Hilfe oder prüfe den Weg vor Ort.`,
    avoidOk: "Keine Treppen oder Stufen auf dieser Route, soweit unsere Daten reichen. Sie ist aus Grundrissen gezeichnet, prüfe sie bitte vor Ort.",
    commentBtn: "Kommentar zu dieser Route",
    commentTitle: "Kommentar zu dieser Route",
    commentCatLabel: "Worum geht es?",
    commentCat: { entrance: "Falscher Eingang", closed: "Tür verschlossen oder geschlossen", stairs: "Treppe oder Aufzug falsch", floor: "Falsche Etage", other: "Etwas anderes" },
    commentStep: "Welcher Schritt? (optional)",
    commentStepNone: "Betrifft keinen einzelnen Schritt",
    commentText: "Dein Kommentar",
    commentPh: "Schreibe, was du vor Ort gefunden hast …",
    commentSend: "Kommentar senden",
    commentCancel: "Abbrechen",
    commentNote: "Beim Senden öffnet sich GitHub in einem neuen Tab mit deinem ausgefüllten Kommentar (GitHub-Konto nötig). Erst wenn du dort auf den Knopf drückst, wird etwas gesendet. Enthalten sind nur Raumcodes und dein Text, bitte lass Namen weg.",
    commentCat0: "Kommentar",
    lineMode: { tram: "Stadtbahn", bus: "Bus" },
    stopKinds: { rail: "Bahnhof", tram: "Stadtbahn", bus: "Bus" },
    stepStartStop: (n) => `Starte an der Haltestelle <b>${n}</b>.`,
    stepStartHub: (n) => `Starte an <b>${n}</b>.`,
    stepRide: (hub, stop, lines, direct) =>
      direct
        ? `Fahre mit ${lines} von <b>${hub}</b> bis zur Haltestelle <b>${stop}</b>.`
        : `Fahre mit dem ÖPNV bis zur Haltestelle <b>${stop}</b>${lines ? ` (bedient von ${lines})` : ""}. Suche die Verbindung im GVH-Fahrplan.`,
    stepRideTo: (stop, hub, lines, direct) =>
      direct
        ? `Fahre mit ${lines} von <b>${stop}</b> nach <b>${hub}</b>.`
        : `Fahre von der Haltestelle <b>${stop}</b> mit dem ÖPNV nach <b>${hub}</b>. Suche die Verbindung im GVH-Fahrplan.`,
    hubNote: 'Zeit und Strecke unten gelten für den Fußweg von oder zur Haltestelle. Fahrzeiten und Tickets: <a href="https://www.gvh.de/" target="_blank" rel="noopener">GVH-Fahrplan</a>. Die Linien stammen aus OpenStreetMap und können unvollständig oder veraltet sein.',
    hubAlt: (list) => `Weitere Haltestellen in der Nähe des Ziels: ${list}.`,
    hubNoStop: 'Keine Haltestelle in der Nähe des Ziels gefunden. Nutze den <a href="https://www.gvh.de/" target="_blank" rel="noopener">GVH-Fahrplan</a>.',
    serviceInfo: "Öffnungszeiten und Kontakt",
    stepWord: "Schritt",
    loadingBuilding: "Gebäudeplan wird geladen …",
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
    indoorHow: (turns, via) => `${turns.length ? `biege <b>${turns.join("</b>, dann <b>")}</b> ab, ` : ""}folge dem Flur${via.length ? ` vorbei an ${via.join(", ")}` : ""}`,
    turnWord: { left: "links", right: "rechts" },
    landmark: (room, name) => `<b>${room}</b> (${name})`,
    stepIndoorTo: (fl, how, r) => `Im <b>${fl}</b>: ${how} zu Raum <b>${r}</b>.`,
    stepIndoorToVertical: (fl, how, type) => `Im <b>${fl}</b>: ${how} ${type === "elevator" ? "zum Aufzug" : "zur Treppe"}.`,
    stepIndoorToExit: (fl, how) => `Im <b>${fl}</b>: ${how} zum Ausgang.`,
    stepArrivePerson: (r, name) => `Du bist bei <b>${r}</b>. Sag <b>${name}</b> Hallo! 👋`,
    stepVertical: (type, up, fl) => `Nimm ${type === "elevator" ? "den Aufzug" : "die Treppe"} ${up ? "nach oben" : "nach unten"} ins <b>${fl}</b>.`,
    indoorApprox: "ℹ️ Der Weg im Gebäude ist ungefähr: aus Grundrissen digitalisiert und noch nicht vor Ort geprüft.",
    indoorVerified: (list) => `✅ Der Weg im Gebäude wurde vor Ort geprüft: ${list}.`,
    indoorMixed: (ok, approx) => `ℹ️ Vor Ort geprüft: ${ok}. Noch ungefähr (aus Grundrissen digitalisiert, nicht geprüft): ${approx}.`,
    confTitle: "Verlässlichkeit",
    confLevel: { high: "hoch", medium: "mittel", low: "niedrig" },
    confReason: {
      verified: "Jedes Stockwerk wurde vor Ort geprüft.",
      plansOnly: "Aus Grundrissen digitalisiert, noch nicht vor Ort abgelaufen.",
      partlyVerified: "Einige Stockwerke wurden vor Ort geprüft, die anderen sind nur aus Grundrissen digitalisiert.",
      noIndoorStart: "Für den Start gibt es noch keinen Gebäudeplan: der Weg beginnt erst an der Gebäudetür.",
      noIndoorEnd: "Für das Ziel gibt es noch keinen Gebäudeplan: der Weg führt nur bis zur Gebäudetür.",
      estimatedEntrance: "Ein Eingang dieses Gebäudes ist noch nicht kartiert: dieses Ende der Route ist geschätzt.",
      unconfirmedRoom: "Dieser Raumcode steht nicht in der Raumliste der Universität.",
    },
    confOk: (date) => `✓ vor Ort geprüft am ${date}`,
    confApprox: "≈ ungefähr",
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
    report: "Problem mit dieser Route melden",
    reportNote: "Dein Kommentar hilft dem nächsten Menschen. Gesendet werden nur Raumcodes und dein Text, keine Namen.",
    reportText: {
      title: (a, b) => `Routenproblem: ${a} → ${b}`,
      whatWrong: "Was war falsch?",
      body: ["<!-- z. B. falscher Eingang, Tür verschlossen, eine Treppe, die es nicht gibt, falsches Stockwerk. Welcher Schritt? -->", ""],
    },
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
    helpBtn: "Hilfe",
    helpTitle: "So benutzt du den Navigator",
    close: "Schließen",
    welcomeTitle: "In 3 Schritten zum Ziel",
    steps3: [
      "<b>Wo bist du?</b> Tippe einen Raumcode (z. B. 3101.001.A104), eine Gebäudenummer (z. B. 1101) oder einen Namen in das Feld <b>A</b>.",
      "<b>Wohin willst du?</b> Mache dasselbe im Feld <b>B</b>.",
      "<b>Folge den Schritten.</b> Der Weg erscheint auf der Karte und als Liste. Die Zahlen auf der Karte sind die Zahlen der Liste; tippe auf eine, um die andere zu sehen.",
    ],
    tryExample: "Probiere ein Beispiel (ein Tipp)",
    examples: ["Hörsaal A104 → Hauptmensa", "Hauptgebäude: Erdgeschoss → 4. Etage", "Person finden: Prof. Heipke → Prof. Sester", "Neu hier? Hauptgebäude → International Office", "Am Bahnhof? Hauptbahnhof → Raum A260 (3101)"],
    hintNeedTo: "Gut. Wähle jetzt im Feld B, <b>wohin du willst</b>.",
    hintNeedFrom: "Gut. Wähle jetzt im Feld A, <b>wo du bist</b>.",
    accessHint: "Du brauchst einen Weg ohne Treppen? Hake vorher <b>Treppen meiden</b> an.",
    helpLegend: "Was du auf der Karte siehst",
    legend: [
      ["A", "Dein Start."],
      ["B", "Dein Ziel."],
      ["3", "Schritt Nummer 3 der Wegbeschreibung. Blass: er liegt auf einer anderen Etage."],
      ["▭", "Ein lila gestrichelter Rahmen: ein Gebäude mit Räumen zum Erkunden. Zoome hinein und tippe auf einen Raum."],
      ["G 1 2", "Die Etagen-Knöpfe rechts. Ein Punkt markiert die Etagen, die dein Weg berührt."],
    ],
    helpOptions: "Gut zu wissen",
    helpTips: [
      "<b>Treppen meiden</b> bevorzugt Aufzüge und ebene Wege.",
      "<b>Route teilen</b> sendet einen Link; wer ihn öffnet, sieht dieselbe Route.",
      "<b>⇅</b> tauscht Start und Ziel. <b>DE / EN</b> wechselt die Sprache.",
      "<b>Verlässlichkeit</b> zeigt, wie sehr man einem Weg trauen kann. Solange eine Etage nicht vor Ort abgelaufen wurde, sind Wege aus Grundrissen gezeichnet und können einige Meter abweichen.",
      "Funktioniert nach dem ersten Besuch auch offline. Nichts wird installiert, kein Konto nötig, dein Standort wird nie abgefragt.",
    ],
    aboutProject: "Über die Idee und das Projekt",
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
// @license-end
