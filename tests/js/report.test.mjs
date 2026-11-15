// SPDX-License-Identifier: GPL-3.0-or-later
// Unit tests for web/js/report.js (run: node --test "tests/js/*.test.mjs").
import { test } from "node:test";
import assert from "node:assert/strict";
import { ISSUES_URL, placeId, reportUrl } from "../../web/js/report.js";
import { t, setLang } from "../../web/js/i18n.js";

const APP = "https://freexyz-halfpi.github.io/LUH-Indoor-GIS-Navi/";
const room = { type: "room", key: "r:1101.000.E028", room: { id: "1101.000.E028" }, building: { id: "1101" } };
const building = { type: "building", key: "b:3110", building: { id: "3110", name: "Hauptmensa" } };
// a person is a room place with the person attached (Places.personPlace)
const person = {
  type: "room",
  key: "p:christian-heipke",
  room: { id: "3101.001.B143" },
  building: { id: "3101", name: "Schneiderberg-Gebäude" },
  person: { name: "Prof. Dr.-Ing. Christian Heipke", slug: "christian-heipke", org: "IPI" },
};

/** Split a report URL into its issue title and body. */
function issue(url) {
  assert.ok(url.startsWith(`${ISSUES_URL}?`), url);
  const q = new URL(url).searchParams;
  return { title: q.get("title"), body: q.get("body") };
}

test("placeId: room code or building number", () => {
  assert.equal(placeId(room), "1101.000.E028");
  assert.equal(placeId(building), "3110");
  assert.equal(placeId(person), "3101.001.B143");
});

test("the issue names both places and links back to the same route", () => {
  setLang("en");
  const { title, body } = issue(reportUrl(room, building, { appUrl: APP, avoidSteps: true, text: t.reportText }));
  assert.equal(title, "Route problem: 1101.000.E028 → 3110");
  assert.match(body, /From: `1101\.000\.E028`/);
  assert.match(body, /To: `3110`/);
  assert.match(body, /Avoid steps: yes/);
  assert.match(body, /Route found: yes/);
  assert.ok(body.includes(`${APP}#from=1101.000.E028&to=3110&steps=0`), body);
  assert.match(body, /### What went wrong\?/);
});

test("a person is reported by office room only, never by name", () => {
  setLang("en");
  const url = reportUrl(person, room, { appUrl: APP, found: false, text: t.reportText });
  const { title, body } = issue(url);
  for (const s of [url, title, body]) {
    assert.ok(!/heipke|christian/i.test(decodeURIComponent(s)), `name leaked: ${s}`);
  }
  assert.ok(body.includes("#from=3101.001.B143&to=1101.000.E028"));
  assert.match(body, /Route found: no/);
});

test("German texts; the facts stay in English for whoever fixes the data", () => {
  setLang("de");
  const { title, body } = issue(reportUrl(room, room, { appUrl: APP, text: t.reportText }));
  assert.equal(title, "Routenproblem: 1101.000.E028 → 1101.000.E028");
  assert.match(body, /### Was war falsch\?/);
  assert.match(body, /Avoid steps: no/);
  setLang("en");
});

test("a stop or a service is reported by its slug, and the app link opens it", () => {
  setLang("en");
  const stop = { type: "stop", key: "t:kropcke", building: { id: "stop:kropcke" }, stop: { id: "kropcke", name: "Kröpcke" } };
  const service = { type: "building", key: "s:international-office", building: { id: "1106" }, service: { id: "international-office" } };
  assert.equal(placeId(stop), "kropcke");
  assert.equal(placeId(service), "international-office");
  const { title, body } = issue(reportUrl(stop, room, { appUrl: APP, text: t.reportText }));
  assert.equal(title, "Route problem: kropcke → 1101.000.E028");
  assert.ok(body.includes(`${APP}#from=kropcke&to=1101.000.E028`), body);
});

test("a comment adds the category, the step number and the person's own words", () => {
  setLang("en");
  const comment = { category: "Door locked or closed", step: "3", message: "  The side door was locked.  " };
  const { body } = issue(reportUrl(room, building, { appUrl: APP, text: t.reportText, comment }));
  assert.match(body, /- About: Door locked or closed/);
  assert.match(body, /- Step: 3/);
  assert.match(body, /### What went wrong\?\n\nThe side door was locked\.\n/);
  assert.ok(!body.includes("<!--"), "the placeholder comment is replaced by the message");
  // an empty comment keeps the template
  const empty = issue(reportUrl(room, building, { appUrl: APP, text: t.reportText, comment: { category: "", step: "", message: "  " } })).body;
  assert.ok(empty.includes("<!--"));
  assert.ok(!/- About:|- Step:/.test(empty));
});
