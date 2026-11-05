# Risks

From the project evaluation of 2026-11-05. Each risk names what to do about it;
the work items are in [ROADMAP.md](../ROADMAP.md).

| # | Risk | Why it matters | Mitigation (phase) |
|---|---|---|---|
| 1 | **No ground truth.** Indoor graphs are derived from plans and not walked. | A wrong "turn left" costs trust faster than a missing building. | Field test, problem-report link, confidence labels (A) |
| 2 | **No permission from LUH.** Data comes from crawling CAFM, including guessed room numbers checked with HEAD requests. | Blocks any public launch and any scaling beyond hand-tracing. | Written permission and official export (B) |
| 3 | **People search and GDPR.** Names, roles and office rooms of 343 staff are in a public file. | Public data is not automatically free to reuse. Needs a legal basis, an opt-out and the data protection officer. | Decide scope, approval, opt-out process (B) |
| 4 | **Hand-tracing does not scale.** Corridors are traced per floor by hand. | 100+ buildings are out of reach for one person. | CAD/IFC importer or semi-automatic tracing (C) |
| 5 | **Plans lack operational facts.** Locked doors, closures, lift outages, opening hours, accessible entrances. | Routes can be impossible or unsafe for some users. | Accessibility data, live status feed (D, F) |
| 6 | **Positioning is manual.** | Slow in a hurry; "you are here" needs QR codes. | QR / short codes (D) |
| 7 | **Thin automated testing.** 17 Python tests; no JS tests, no graph regression checks. | Data and router changes can break routes unnoticed. | JS tests, CI routability checks (A) |
| 8 | **Operational dependencies.** Public OSM tile server, hot-linked LUH plan images, GitHub Pages. | OSM tile policy forbids production-scale use. | Own tiles, university hosting (B, E) |
| 9 | **Sustainability.** One maintainer, data goes stale. | The project stops when the maintainer does. | Sponsor, scheduled refresh, maintainers' group (B, C, F) |
| 10 | **Everything is preloaded** (1.5 MB of data now), cache version bumped by hand. | Does not scale to 100 buildings. | Lazy loading per building, automatic cache versioning (C) |
