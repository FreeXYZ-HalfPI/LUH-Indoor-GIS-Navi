# Legal pages: drafts

> **Drafts, not legal advice.** These texts were written from what the app
> does (checked in the code on 2026-11-05) and from the usual structure of
> German imprints and privacy statements. Have them checked before
> publishing, ideally by the LUH data protection officer
> (Datenschutzbeauftragte) and legal department (Justiziariat), who are
> already in copy of the [LUH request](../LUH_REQUEST.md).

| File | What it is | Required by |
|---|---|---|
| [impressum.md](impressum.md) | imprint (Impressum), German and English | § 5 Digitale-Dienste-Gesetz (DDG) |
| [datenschutz.md](datenschutz.md) | privacy statement (Datenschutzerklärung), German and English | Art. 13 and 14 GDPR (DSGVO) |

They live in `docs/`, not in `web/`, on purpose: everything in `web/` is
published by GitHub Pages at once, and the drafts still hold placeholders.

## Fill in before publishing

Every placeholder is written `[[like this]]`. Search for `[[`:

| Placeholder | What to put there |
|---|---|
| `[[Name]]`, `[[Address]]` | the person (or institution) running the site and a postal address where letters reach them (no P.O. box) |
| `[[E-mail]]` | a contact address that is read; it is also the opt-out address for the people search |
| `[[Phone or contact form]]` | a second fast way to reach you (phone, or a contact form) |
| `[[Tile provider]]` | the map tile service, once the public OSM tile server is replaced (roadmap Phase E) |
| `[[Legal basis people search]]` | decided with the LUH data protection officer (roadmap Phase B) |
| `[[Date]]` | the date the statement takes effect |

## Decisions these texts depend on

1. **Who runs the site.** If LUH hosts the app (e.g. on a `*.uni-hannover.de`
   subdomain), the university is the provider: its own imprint and privacy
   statement apply, and these drafts become the app-specific part of them.
   If you run it privately, you are the controller.
2. **People search.** Section 8 of the privacy statement covers the names and
   offices of staff. Its legal basis and the opt-out process must be agreed
   with LUH first (risk 3 in [RISKS.md](../RISKS.md)). If the people search is
   switched off or limited to offices for the first version, shorten or
   remove that section.
3. **Map tiles.** Section 4 names the OpenStreetMap Foundation's tile server,
   which the app uses today. Update it when the provider changes.
4. **Hosting.** Section 3 describes GitHub Pages. Update it if the app moves.

## What the statements are based on

The app, as of `main` on 2026-11-05:

- no accounts, no cookies, no analytics, no advertising, no GPS or other sensors;
- routes and searches run on the device; the route in the address (`#from=…&to=…`)
  is never sent to a server (browsers do not send the part after `#`);
- requests to other servers: the site itself (GitHub Pages), map tiles
  (`tile.openstreetmap.org`) and, only after a tap on a floor-plan button, floor
  plan images from `info.cafm.uni-hannover.de` (*Show floor plan* / *Show floor
  plans with route*); Leaflet is bundled, no CDN;
- on the device: the language choice (`localStorage`) and an offline cache of
  the app, its data and viewed map tiles (service worker);
- links that leave the app only when tapped: LUH Rauminfo, GVH, GitHub (source
  code, *Report a problem with this route*);
- `web/data/people.json`: names, roles, institutes and office rooms of 343 LUH
  staff from public LUH web pages, no phone numbers or e-mail addresses.

Check this list again before publishing: a new feature that talks to a server
or stores something needs a section in the privacy statement.

## Publishing (later)

Once filled in and checked: copy the texts into `web/impressum.html` and
`web/datenschutz.html` (or one page per language), link them from the footer
of `web/index.html` next to the source-code link, and add them to the service
worker's `ASSETS` so they are readable offline.
