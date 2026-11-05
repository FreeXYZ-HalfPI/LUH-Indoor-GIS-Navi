# Datenschutzerklärung / Privacy statement

> Draft: see [README.md](README.md). Placeholders are written `[[like this]]`;
> `[[check: …]]` marks a fact to confirm before publishing.

## Deutsch

Stand: [[Date]]

### 1. Verantwortlicher

[[Name]], [[Address]], E-Mail: [[E-mail]]
(siehe [Impressum](impressum.md)).

### 2. Das Wichtigste in Kürze

- Die App fragt **nie deinen Standort** ab und nutzt keine Sensoren.
- Es gibt **keine Konten, keine Cookies, keine Analyse- oder Werbedienste**.
- **Suche und Routenberechnung laufen auf deinem Gerät.** Was du eintippst,
  wird nicht übertragen. Die Route steht nur im Teil der Adresse nach `#`
  (z. B. `#from=…&to=…`); diesen Teil senden Browser an keinen Server.
- Daten werden nur übertragen, soweit das technisch nötig ist, um die Seite,
  die Karte und, wenn du es antippst, einen Grundriss zu laden (Abschnitte 3–5).

### 3. Hosting (GitHub Pages)

Die App wird von GitHub Pages ausgeliefert, einem Dienst der GitHub, Inc.,
88 Colin P. Kelly Jr. Street, San Francisco, CA 94107, USA. Beim Aufruf
überträgt dein Browser technisch notwendige Daten an GitHub, insbesondere
deine IP-Adresse, Datum und Uhrzeit, die aufgerufene Datei, Browser und
Betriebssystem. GitHub verarbeitet diese Daten, um die Seite auszuliefern und
ihre Sicherheit zu gewährleisten, und kann sie dafür zeitweise speichern.

Rechtsgrundlage ist Art. 6 Abs. 1 lit. f DSGVO: Das berechtigte Interesse
liegt darin, die App zuverlässig und sicher bereitzustellen. GitHub ist unter
dem EU-U.S. Data Privacy Framework zertifiziert, für die Übermittlung in die
USA gilt damit der Angemessenheitsbeschluss der EU-Kommission (Art. 45 DSGVO)
[[check: GitHub, Inc. is listed at dataprivacyframework.gov]]. Weitere
Informationen: <https://docs.github.com/site-policy/privacy-policies/github-general-privacy-statement>.

### 4. Kartenkacheln

Die Kartenansicht lädt Kartenbilder („Kacheln“) von [[Tile provider; today:
der OpenStreetMap Foundation, St John’s Innovation Centre, Cowley Road,
Cambridge, CB4 0WS, Vereinigtes Königreich (`tile.openstreetmap.org`)]].
Dabei werden deine IP-Adresse, die Browserkennung und die angefragten Kacheln
übertragen, also der Kartenausschnitt, den du ansiehst. Rechtsgrundlage ist
Art. 6 Abs. 1 lit. f DSGVO (Darstellung der Karte). Für das Vereinigte
Königreich besteht ein Angemessenheitsbeschluss der EU-Kommission
[[check: still in force]]. Datenschutzhinweise des Anbieters:
[[https://osmfoundation.org/wiki/Privacy_Policy]].

### 5. Grundrisse der Leibniz Universität Hannover

Grundrisse werden nur geladen, wenn du **„Grundriss anzeigen“** oder **„Grundrisse mit Route anzeigen“** antippst. Sie
kommen direkt vom Server der Leibniz Universität Hannover
(`info.cafm.uni-hannover.de`), der dabei deine IP-Adresse und die angefragte
Datei erhält. Rechtsgrundlage ist Art. 6 Abs. 1 lit. f DSGVO (Anzeige des
gewünschten Grundrisses). Verantwortlich für diesen Server ist die Leibniz
Universität Hannover, Welfengarten 1, 30167 Hannover; deren
Datenschutzerklärung: <https://www.uni-hannover.de/de/datenschutzerklaerung>
[[check: link]].

### 6. Speicherung auf deinem Gerät

Die App speichert in deinem Browser:

- deine **Sprachwahl** (Deutsch oder Englisch) im `localStorage`;
- einen **Offline-Speicher** der App, ihrer Daten und der zuletzt angesehenen
  Kartenkacheln (Service Worker, Cache Storage), damit sie auch ohne
  Mobilfunk im Gebäude funktioniert.

Diese Daten verlassen dein Gerät nicht. Die Speicherung ist unbedingt
erforderlich, um die von dir gewünschten Funktionen bereitzustellen
(§ 25 Abs. 2 Nr. 2 TDDDG). Du kannst sie jederzeit löschen, indem du die
Websitedaten in deinem Browser löschst.

### 7. Links und „Problem mit dieser Route melden“

Links auf andere Seiten (LUH Rauminfo, GVH, GitHub) werden erst aufgerufen,
wenn du sie antippst; dann gelten die Datenschutzhinweise des jeweiligen
Anbieters.

Der Link **„Problem mit dieser Route melden“** öffnet auf GitHub ein neues
Issue, das mit den Raum- bzw. Gebäudecodes von Start und Ziel, der Einstellung
„Treppen meiden“ und einem Link zur Route vorausgefüllt ist. Namen von
Personen werden nie eingesetzt. Abgeschickt wird erst, wenn du es auf GitHub
selbst tust; dafür brauchst du ein GitHub-Konto. Issues sind **öffentlich**
sichtbar. Für die Verarbeitung auf GitHub gilt die Datenschutzerklärung von
GitHub (Abschnitt 3).

### 8. Personensuche: Daten von Beschäftigten der LUH

> [[Decide with the LUH data protection officer before publishing: legal
> basis, scope (all staff or offices only) and opt-out. Shorten or remove
> this section if the people search is switched off.]]

Damit man den Weg zu einem Büro auch über den Namen findet, enthält die App
**Namen, akademische Titel, Funktionen, Einrichtungen und Büroräume** von
Beschäftigten der Leibniz Universität Hannover. Telefonnummern und
E-Mail-Adressen sind nicht enthalten.

- **Quelle:** öffentlich zugängliche Personen- und Kontaktseiten der LUH
  (Art. 14 Abs. 2 lit. f DSGVO).
- **Zweck:** Wegbeschreibung zum Büro einer Person.
- **Rechtsgrundlage:** [[Legal basis people search, e.g. Art. 6 Abs. 1 lit. f
  DSGVO (berechtigtes Interesse an der Orientierung auf dem Campus) or, if run
  by LUH, Art. 6 Abs. 1 lit. e DSGVO]].
- **Speicherdauer:** bis zur nächsten Aktualisierung der Daten; wer nicht mehr
  auf den Seiten der LUH steht, wird dabei entfernt.
- **Widerspruch:** Wer nicht gefunden werden möchte, schreibt an
  [[E-mail]]. Der Eintrag wird mit der nächsten Version der App, spätestens
  innerhalb von [[14]] Tagen, entfernt.

### 9. Deine Rechte

Du hast das Recht auf Auskunft (Art. 15 DSGVO), Berichtigung (Art. 16),
Löschung (Art. 17), Einschränkung der Verarbeitung (Art. 18),
Datenübertragbarkeit (Art. 20) und Widerspruch gegen Verarbeitungen auf
Grundlage von Art. 6 Abs. 1 lit. e oder f (Art. 21). Schreib dafür an
[[E-mail]].

Du kannst dich bei einer Datenschutz-Aufsichtsbehörde beschweren
(Art. 77 DSGVO), zum Beispiel bei der Landesbeauftragten für den Datenschutz
Niedersachsen, Prinzenstraße 5, 30159 Hannover,
<https://www.lfd.niedersachsen.de>.

Eine automatisierte Entscheidungsfindung oder Profilbildung findet nicht statt.

### 10. Änderungen

Diese Datenschutzerklärung wird angepasst, wenn die App neue Funktionen
bekommt, die Daten übertragen oder speichern. Die jeweils aktuelle Fassung
steht in der App und im Quellcode-Repository.

---

## English

*The German version is the binding one.*

Last updated: [[Date]]

### 1. Controller

[[Name]], [[Address]], e-mail: [[E-mail]]
(see [imprint](impressum.md)).

### 2. In short

- The app **never asks for your location** and uses no sensors.
- There are **no accounts, no cookies, no analytics and no advertising**.
- **Search and route calculation run on your device.** What you type is not
  sent anywhere. The route is only in the part of the address after `#`
  (e.g. `#from=…&to=…`), which browsers never send to a server.
- Data is only sent where this is technically needed to load the site, the
  map and, when you tap it, a floor plan (sections 3–5).

### 3. Hosting (GitHub Pages)

The app is served by GitHub Pages, a service of GitHub, Inc., 88 Colin P. Kelly
Jr. Street, San Francisco, CA 94107, USA. When you open it, your browser sends
technically necessary data to GitHub, in particular your IP address, date and
time, the requested file, browser and operating system. GitHub processes this
data to deliver the site and keep it secure, and may store it for a while for
that purpose.

The legal basis is Art. 6(1)(f) GDPR: the legitimate interest is to provide
the app reliably and securely. GitHub is certified under the EU-U.S. Data
Privacy Framework, so the European Commission's adequacy decision covers the
transfer to the USA (Art. 45 GDPR) [[check: GitHub, Inc. is listed at
dataprivacyframework.gov]]. More information:
<https://docs.github.com/site-policy/privacy-policies/github-general-privacy-statement>.

### 4. Map tiles

The map loads map images ("tiles") from [[Tile provider; today: the
OpenStreetMap Foundation, St John's Innovation Centre, Cowley Road, Cambridge,
CB4 0WS, United Kingdom (`tile.openstreetmap.org`)]]. This sends your IP
address, your browser's user agent and the requested tiles, that is, the part
of the map you look at. The legal basis is Art. 6(1)(f) GDPR (showing the map).
The European Commission has an adequacy decision for the United Kingdom
[[check: still in force]]. The provider's privacy policy:
[[https://osmfoundation.org/wiki/Privacy_Policy]].

### 5. Floor plans of Leibniz Universität Hannover

Floor plans are only loaded when you tap **"Show floor plan"** or **"Show floor plans with route"**. They come
straight from the server of Leibniz Universität Hannover
(`info.cafm.uni-hannover.de`), which receives your IP address and the requested
file. The legal basis is Art. 6(1)(f) GDPR (showing the floor plan you asked
for). Leibniz Universität Hannover, Welfengarten 1, 30167 Hannover, is
responsible for that server; its privacy statement:
<https://www.uni-hannover.de/en/datenschutzerklaerung> [[check: link]].

### 6. Storage on your device

The app stores in your browser:

- your **language choice** (German or English) in `localStorage`;
- an **offline copy** of the app, its data and the map tiles you viewed last
  (service worker, Cache Storage), so it works without mobile data inside
  buildings.

This data never leaves your device. Storing it is strictly necessary to
provide the features you use (§ 25(2) no. 2 TDDDG). You can delete it at any
time by clearing the site data in your browser.

### 7. Links and "Report a problem with this route"

Links to other sites (LUH Rauminfo, GVH, GitHub) are only opened when you tap
them; the privacy policy of that provider then applies.

The link **"Report a problem with this route"** opens a new issue on GitHub,
filled in with the room or building codes of start and destination, the
"avoid steps" setting and a link to the route. Names of people are never
included. Nothing is sent until you submit it on GitHub yourself, which needs
a GitHub account. Issues are **public**. GitHub's privacy statement applies to
the processing on GitHub (section 3).

### 8. People search: data of LUH staff

> [[Decide with the LUH data protection officer before publishing: legal
> basis, scope (all staff or offices only) and opt-out. Shorten or remove
> this section if the people search is switched off.]]

So that an office can be found by a person's name, the app contains the
**names, academic titles, roles, institutes and office rooms** of staff of
Leibniz Universität Hannover. Phone numbers and e-mail addresses are not
included.

- **Source:** publicly accessible staff and contact pages of LUH
  (Art. 14(2)(f) GDPR).
- **Purpose:** directions to a person's office.
- **Legal basis:** [[Legal basis people search, e.g. Art. 6(1)(f) GDPR
  (legitimate interest in finding one's way on campus) or, if run by LUH,
  Art. 6(1)(e) GDPR]].
- **Storage:** until the next data update; people no longer listed on the LUH
  pages are removed then.
- **Objection:** anyone who does not want to be found writes to [[E-mail]].
  The entry is removed with the next version of the app, at the latest within
  [[14]] days.

### 9. Your rights

You have the right of access (Art. 15 GDPR), rectification (Art. 16), erasure
(Art. 17), restriction of processing (Art. 18), data portability (Art. 20) and
to object to processing based on Art. 6(1)(e) or (f) (Art. 21). Write to
[[E-mail]].

You can complain to a data protection supervisory authority (Art. 77 GDPR),
for example the Landesbeauftragte für den Datenschutz Niedersachsen,
Prinzenstraße 5, 30159 Hannover, Germany, <https://www.lfd.niedersachsen.de>.

There is no automated decision-making or profiling.

### 10. Changes

This privacy statement is updated when the app gets new features that send or
store data. The current version is in the app and in the source code
repository.
