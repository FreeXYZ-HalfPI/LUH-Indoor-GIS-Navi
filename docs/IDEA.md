# The idea and the motivation

*Why this page exists, who it is for, and what it should become. Written for the
International Office, the university's diversity work (Chancenvielfalt), and everyone
who wants to help.*

## In one sentence

**LUH Campus Navigator helps anyone find their way from one room to another at
Leibniz Universität Hannover, on their own, on their phone, with nothing to install,
no account, no GPS and no tracking.**

## The problem

On the first day nobody knows where to go. The university has many buildings, with
numbers instead of names, floors that do not line up between wings, stairs that only
lead to some floors, and room codes like `1101.003.G315`.

Today's tools answer only half of the question:

- The **Standortfinder** shows *where a building is*.
- **Rauminfo** shows a floor plan with the room in red.
- Neither says **how to get there**: which entrance, which way, which floor.
- Outdoor navigation apps stop at the door. Nobody guides you inside.

So people do what they always did: they ask at the porter's lodge, they arrive late,
or they give up and miss the appointment. For some groups this is a bigger obstacle
than for others.

## Who it is for

| Group | What they run into | What the Navigator gives them |
|---|---|---|
| **Arriving by train or bus** (everyone on the first day) | They step out at the Hauptbahnhof or the ZOB with a room code | Start from the station: the app names the stop nearest to the goal and routes the walk from there to the room |
| **New students**, first weeks (Orientierungswoche) | Many buildings, unknown codes, lecture halls and offices to find within days | Type the room code from the timetable, get the way, floor by floor |
| **International and degree-seeking students** | A foreign language, a new system of building numbers, no one to ask yet | The whole app in **English and German**, directions in short plain sentences, steps and metres instead of cardinal directions |
| **Short-term exchange students** (e.g. EULiST) | A few weeks only; they cannot afford to spend the first ones lost | Nothing to install, nothing to sign up for, works offline after the first visit, a link or QR code opens the exact route |
| **People with disabilities** (Chancenvielfalt: equal chances, many ways of studying) | Stairs, lifts that are far away, long detours that nobody tells you about | An **"Avoid steps"** option that routes through lifts and flat paths; one-line route confidence so nobody is sent on a guess. Step-free details (door widths, ramps, lift availability) are the next step and will be built **with** the Behindertenbeauftragte |
| **Visitors and event guests** (ceremonies, open days, conferences) | They have never been on campus | One link or QR code in the invitation opens the route from the entrance to the hall |
| **Everyday users**: students, professors, staff | They know their own building, but not the others | Room to room across buildings, **and search by name**: type "Christian Heipke" and get the way to the office |

## The idea behind it

1. **Door to door, indoors and outdoors in one route.** The route runs from room XX in
   building YY to room ZZ in building WW: out of the building by the best exit, along
   the campus paths (OpenStreetMap), into the next building, up the right stairs or
   lift, to the right wing. It is one calculation, not an outdoor route plus a floor
   plan.
2. **Directions people can follow without a map.** "Turn left, then walk 30 steps
   (23 m)", with landmarks ("past B205"). Steps are easier to estimate than metres, and
   a numbered marker on the map belongs to every step in the list.
3. **No GPS indoors is needed.** The person says where they are (a room, a building, a
   scanned code). The app never asks for the location.
4. **Privacy by design.** The route is calculated on the phone. No account, no
   cookies, no analytics, no personal data leaves the device. The only thing that can
   leave it is a problem report the person chooses to send, and it contains room codes
   only.
5. **Honest about what it knows.** Every route shows a confidence level (high, medium,
   low) and says whether a floor was **checked on site** or is **approximate**. Nobody
   is told "go left" with a certainty the data does not have.
6. **Free Software, open data approach.** The code is GPL-3.0-or-later and public on
   GitHub. The university can host it, change it, audit it, and keep it.

## The motivation

- **Equal chances from the first day.** Orientation should not depend on who happens to
  know someone. A tool that works for the exchange student in week one and for the
  student who cannot take stairs is a small, concrete piece of Chancenvielfalt.
- **Less stress, fewer missed appointments.** The first weeks decide whether people feel
  they belong. Not finding the room for the first exam or the first visit to the
  International Office is a bad start.
- **Relief for staff.** Reception desks, the International Office and the secretariats
  answer the same "where is…?" questions every semester. A link in the welcome mail
  answers most of them.
- **It starts with what already exists.** The data come from the university's own
  public pages and from OpenStreetMap. No new sensors, no hardware, no installation.

## What exists today (pilot)

- **5 buildings** routable door to door: 1101 Hauptgebäude, 3101 Schneiderberg-Gebäude,
  3109 Verfügungsgebäude, 3408 Hochhaus Appelstraße, 3110 Hauptmensa.
- **2,961 rooms** found, **2,713 (92 %)** routable, **343 people** findable by name
  (office rooms of the Präsidium, Dezernate and institutes, from public pages;
  no phone numbers, no e-mail).
- German and English; installable on the phone home screen; offline after the first
  visit; "Avoid steps"; share link; room explorer with all floors.
- Everything is **approximate until walked**: no floor is verified on site yet. That is
  why the app says so on every route.

## What we ask of the International Office

1. **A first test group.** 5 to 10 students (new arrivals and exchange students if
   possible) who walk 3 to 5 routes each, using the field-test kit
   ([field-test/](field-test/README.md)). It takes about an hour per person.
2. **A place in the welcome material.** A link and a QR code in the welcome mail, the
   Orientierungswoche programme and the exchange-student guide. The link
   `…/#to=<room>` opens the exact destination, for example the International Office
   itself once it is mapped.
3. **The International Office as a destination.** The app already leads to the door of the
   International Office (Wilhelm-Grunwald-Haus, building 1106): type *International Office*, or
   open `…/#to=international-office`. The way **inside** the building is not mapped yet. We would
   like to map it, and the counters every exchange student must visit, with the help of your
   team (room, entrance, who to ask). Opening hours are not stored in the app (they change);
   it links to your page.
4. **A named contact** at the university for questions about room data, legal pages
   and hosting. Draft of the request: [LUH_REQUEST.md](LUH_REQUEST.md).

## What we do not claim

- It is a **prototype**. It does not replace signs, the porter's lodge or the
  International Office itself.
- Floors and corridors are **traced from public floor plans**, not surveyed. Where the
  data are guessed, the app lowers the confidence level.
- The disability support today is **"avoid steps"** only. Real step-free guidance needs
  door widths, ramps, lift status and accessible toilets, and must be built with the
  people it is for.
- The privacy statement and imprint are **drafts** ([legal/](legal/README.md)); the
  people search needs a decision and an opt-out process before a public launch.

## Where it is going

See [ROADMAP.md](../ROADMAP.md). In short: field-test the pilot buildings; get
permission and an official data export from the university; a printable
"you are here" sign at entrances; step-free routing with the Behindertenbeauftragte;
more buildings, the International Office and public services; an English guide for
EULiST students; a university-hosted launch before a winter semester.

## Try it

<https://freexyz-halfpi.github.io/LUH-Indoor-GIS-Navi/>, for example
[lecture hall A104 → Hauptmensa](https://freexyz-halfpi.github.io/LUH-Indoor-GIS-Navi/#from=3101.001.A104&to=3110.002.205A).

---

## Kurzfassung (Deutsch)

**Der LUH Campus-Navigator führt Studierende, Gäste und Beschäftigte der Leibniz
Universität Hannover selbstständig von Raum zu Raum**, auf dem Handy, ohne Installation,
ohne Konto, ohne GPS und ohne Tracking.

*Warum?* Am ersten Tag weiß niemand, wohin. Standortfinder und Rauminfo zeigen, wo ein
Gebäude liegt und wie ein Grundriss aussieht, aber nicht den **Weg**. Das trifft Neu-
ankömmlinge, internationale Studierende und Kurzzeit-Austauschstudierende am stärksten,
ebenso Menschen mit Behinderung, für die ein Umweg über Treppen mehr bedeutet als ein
paar Minuten (Chancenvielfalt). Auch im Alltag kennt jede und jeder nur das eigene
Gebäude.

*Wie?* Der Weg wird auf dem Handy berechnet: von Tür zu Tür, mit Treppen und Aufzügen,
in kurzen Sätzen ("links abbiegen, dann 30 Schritte") und mit nummerierten Markern auf
der Karte. Die App sagt ehrlich, wie sicher ein Weg ist (hoch, mittel, niedrig), und ob
ein Stockwerk vor Ort geprüft wurde. Zweisprachig (DE/EN), offline nutzbar,
Open Source (GPL-3.0).

*Stand:* Pilot mit 5 Gebäuden, 2.713 begehbaren Räumen und 343 Personen. Alle Wege sind
noch **ungeprüft** (aus Grundrissen gezeichnet). **Wir bitten das International Office
um** eine kleine Testgruppe, einen Platz im Willkommensmaterial, die Abbildung des
International Office als Ziel und eine feste Ansprechperson.
