// @license magnet:?xt=urn:btih:1f739d935676111cfff4b4693e3816e664797050&dn=gpl-3.0.txt GPL-v3-or-later
// SPDX-License-Identifier: GPL-3.0-or-later
// The About page: why the Navigator exists, who it is for, how to use it, what it knows and
// what it does not. Written for people who have never seen it (new and international
// students, visitors, staff). The same text as docs/IDEA.md, in short.

const REPO = "https://github.com/FreeXYZ-HalfPI/LUH-Indoor-GIS-Navi";

const TEXT = {
  en: {
    title: "About the Navigator",
    heroTitle: "Find your way from room to room, on your own.",
    heroText:
      "LUH Campus Navigator helps anyone find their way at Leibniz Universität Hannover: on the phone, with nothing to install, no account, no GPS and no tracking.",
    whyTitle: "Why we built it",
    why: [
      "On the first day nobody knows where to go. Buildings have numbers instead of names, and rooms have codes like <b>1101.003.G315</b>.",
      "The Standortfinder shows <i>where</i> a building is. Rauminfo shows a floor plan with the room in red. Neither says <i>how to get there</i>: which entrance, which way, which floor. Outdoor navigation apps stop at the door.",
      "So people ask, arrive late, or give up. For some groups this is a bigger obstacle than for others.",
    ],
    whoTitle: "Who it is for",
    who: [
      ["🎓", "New arrivals", "First weeks, first lectures, the offices you have to visit."],
      ["🌍", "International students", "A new language and a new numbering system. English and German, in short plain sentences."],
      ["🧳", "Short-term exchange students", "A few weeks only, for example EULiST. Nothing to install or sign up for; works offline after the first visit."],
      ["♿", "People with disabilities", "Chancenvielfalt means equal chances. “Avoid steps” prefers lifts and flat paths, and the app warns you when a route still has stairs. Step-free details will be built together with the Behindertenbeauftragte."],
      ["🎟️", "Visitors and guests", "Ceremonies, open days, conferences: one link or QR code opens the exact route."],
      ["🏫", "Everyone on campus", "Students, professors and staff who know their own building but not the others. You can also search by name."],
    ],
    howTitle: "How it works",
    ideaTitle: "The idea",
    idea: [
      ["🚪", "One route, door to door", "Indoors and outdoors are one calculation: out of room XX, along the campus paths, into building YY, up the right stairs or lift, to room ZZ."],
      ["👣", "Directions anyone can follow", "“Turn left, then walk 30 steps (23 m).” With landmarks, and a numbered marker on the map for every step."],
      ["📍", "No GPS needed", "You say where you are: a room, a building, a stop. The app never asks for your location."],
    ],
    trustTitle: "Private and honest",
    trust: [
      "The route is calculated <b>on your phone</b>. No account, no cookies, no analytics.",
      "Every route shows how far it can be trusted (<b>high, medium, low</b>) and whether a floor was <b>checked on site</b> or is <b>approximate</b>. Nobody should be sent the wrong way with false certainty.",
      "<b>Free Software</b> (GPL-3.0). The code is public, so the university can host, audit and keep it.",
    ],
    statusTitle: "Where we are",
    status: (n) =>
      `A pilot in <b>${n} buildings</b>, plus stations and stops. All routes are drawn from floor plans and <b>not yet walked on site</b>, and the app says so. Next: field tests with students, official data from the university, step-free routing, more buildings and services such as the International Office.`,
    helpTitle: "Help us get it right",
    help: "Walked a route and something was wrong? Tap <b>Comment on this route</b> under the directions. It takes a minute and helps the next person.",
    tryBtn: "Try an example",
    sourceLink: "Source code and project",
    dataNote: "Map data © OpenStreetMap contributors · Building and room data © Leibniz Universität Hannover",
    close: "Back to the map",
  },
  de: {
    title: "Über den Navigator",
    heroTitle: "Finde selbstständig den Weg von Raum zu Raum.",
    heroText:
      "Der LUH Campus-Navigator hilft allen, sich an der Leibniz Universität Hannover zurechtzufinden: auf dem Handy, ohne Installation, ohne Konto, ohne GPS und ohne Tracking.",
    whyTitle: "Warum es das gibt",
    why: [
      "Am ersten Tag weiß niemand, wohin. Gebäude haben Nummern statt Namen, Räume haben Codes wie <b>1101.003.G315</b>.",
      "Der Standortfinder zeigt, <i>wo</i> ein Gebäude steht. Rauminfo zeigt einen Grundriss mit dem Raum in Rot. Beide sagen nicht, <i>wie man hinkommt</i>: welcher Eingang, welcher Weg, welche Etage. Navigations-Apps für draußen enden an der Tür.",
      "Also fragen die Leute, kommen zu spät oder geben auf. Für manche Gruppen ist das ein größeres Hindernis als für andere.",
    ],
    whoTitle: "Für wen",
    who: [
      ["🎓", "Neu Angekommene", "Die ersten Wochen, die ersten Vorlesungen, die Büros, die man aufsuchen muss."],
      ["🌍", "Internationale Studierende", "Eine neue Sprache und ein neues Nummernsystem. Deutsch und Englisch, in kurzen, einfachen Sätzen."],
      ["🧳", "Austauschstudierende auf Zeit", "Nur wenige Wochen, zum Beispiel EULiST. Nichts zu installieren, keine Anmeldung; nach dem ersten Besuch auch offline nutzbar."],
      ["♿", "Menschen mit Behinderung", "Chancenvielfalt heißt gleiche Chancen. „Treppen meiden“ bevorzugt Aufzüge und ebene Wege, und die App warnt, wenn eine Route trotzdem Treppen hat. Stufenfreie Details entstehen gemeinsam mit der Behindertenbeauftragten."],
      ["🎟️", "Besucherinnen und Gäste", "Feiern, Tag der offenen Tür, Tagungen: ein Link oder QR-Code öffnet genau die Route."],
      ["🏫", "Alle auf dem Campus", "Studierende, Professorinnen und Beschäftigte, die ihr eigenes Gebäude kennen, aber nicht die anderen. Du kannst auch nach Namen suchen."],
    ],
    howTitle: "So funktioniert es",
    ideaTitle: "Die Idee",
    idea: [
      ["🚪", "Eine Route, von Tür zu Tür", "Drinnen und draußen sind eine Berechnung: aus Raum XX, über die Campuswege, in Gebäude YY, über die richtige Treppe oder den Aufzug, zu Raum ZZ."],
      ["👣", "Wegbeschreibung für alle", "„Biege links ab, dann gehe 30 Schritte (23 m).“ Mit Orientierungspunkten und einem nummerierten Marker auf der Karte für jeden Schritt."],
      ["📍", "Kein GPS nötig", "Du sagst, wo du bist: ein Raum, ein Gebäude, eine Haltestelle. Die App fragt nie nach deinem Standort."],
    ],
    trustTitle: "Privat und ehrlich",
    trust: [
      "Die Route wird <b>auf deinem Handy</b> berechnet. Kein Konto, keine Cookies, keine Analyse.",
      "Jede Route zeigt, wie sehr man ihr trauen kann (<b>hoch, mittel, niedrig</b>) und ob eine Etage <b>vor Ort geprüft</b> wurde oder <b>ungefähr</b> ist. Niemand soll mit falscher Sicherheit in die falsche Richtung geschickt werden.",
      "<b>Freie Software</b> (GPL-3.0). Der Code ist öffentlich, die Universität kann ihn betreiben, prüfen und behalten.",
    ],
    statusTitle: "Wo wir stehen",
    status: (n) =>
      `Ein Pilot in <b>${n} Gebäuden</b>, dazu Bahnhöfe und Haltestellen. Alle Wege sind aus Grundrissen gezeichnet und <b>noch nicht vor Ort abgelaufen</b>, und die App sagt das. Als Nächstes: Praxistests mit Studierenden, offizielle Daten der Universität, stufenfreie Wege, mehr Gebäude und Dienste wie das International Office.`,
    helpTitle: "Hilf uns, es richtig zu machen",
    help: "Du bist eine Route gegangen und etwas stimmte nicht? Tippe unter der Wegbeschreibung auf <b>Kommentar zu dieser Route</b>. Das dauert eine Minute und hilft dem nächsten Menschen.",
    tryBtn: "Beispiel ausprobieren",
    sourceLink: "Quellcode und Projekt",
    dataNote: "Kartendaten © OpenStreetMap-Mitwirkende · Gebäude- und Raumdaten © Leibniz Universität Hannover",
    close: "Zurück zur Karte",
  },
};

/**
 * The About page as HTML. t = the app's UI strings (for the three steps and the map legend),
 * lang = "en" | "de", buildingCount = mapped buildings.
 */
export function aboutHtml(t, lang, buildingCount) {
  const a = TEXT[lang] || TEXT.en;
  const cards = (list) => list.map(([i, h, p]) => `<div class="about-card"><span class="about-ico" aria-hidden="true">${i}</span><h3>${h}</h3><p>${p}</p></div>`).join("");
  return `<div class="about-bar">
      <button type="button" class="about-close">← ${a.close}</button>
      <button type="button" class="chip about-lang" lang="${lang === "de" ? "en" : "de"}">${lang === "de" ? "EN" : "DE"}</button>
    </div>
    <article class="about-body">
      <div class="about-hero">
        <h2 id="about-title">${a.heroTitle}</h2>
        <p>${a.heroText}</p>
        <button type="button" class="about-try">${a.tryBtn}</button>
      </div>
      <section><h3 class="about-h">${a.whyTitle}</h3>${a.why.map((x) => `<p>${x}</p>`).join("")}</section>
      <section><h3 class="about-h">${a.whoTitle}</h3><div class="about-grid">${cards(a.who)}</div></section>
      <section><h3 class="about-h">${a.ideaTitle}</h3><div class="about-grid three">${cards(a.idea)}</div></section>
      <section><h3 class="about-h">${a.howTitle}</h3>
        <ol class="guide-steps">${t.steps3.map((x) => `<li><span>${x}</span></li>`).join("")}</ol>
        <h4 class="about-sub">${t.helpLegend}</h4>
        <ul class="legend">${t.legend.map(([k, v]) => `<li><span class="legend-key">${k}</span> ${v}</li>`).join("")}</ul>
        <h4 class="about-sub">${t.helpOptions}</h4>
        <ul class="tips">${t.helpTips.map((x) => `<li>${x}</li>`).join("")}</ul>
      </section>
      <section><h3 class="about-h">${a.trustTitle}</h3><ul class="tips">${a.trust.map((x) => `<li>${x}</li>`).join("")}</ul></section>
      <section><h3 class="about-h">${a.statusTitle}</h3><p>${a.status(buildingCount)}</p></section>
      <section class="about-help"><h3 class="about-h">${a.helpTitle}</h3><p>${a.help}</p></section>
      <footer class="about-foot">
        <p><a href="${REPO}" target="_blank" rel="noopener">${a.sourceLink}</a></p>
        <p>${a.dataNote}</p>
      </footer>
    </article>`;
}
// @license-end
