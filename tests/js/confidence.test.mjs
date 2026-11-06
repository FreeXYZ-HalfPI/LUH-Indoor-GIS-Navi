// SPDX-License-Identifier: GPL-3.0-or-later
// Unit tests for web/js/confidence.js (run: node --test "tests/js/*.test.mjs").
import { test } from "node:test";
import assert from "node:assert/strict";
import { routeFloors, confidence } from "../../web/js/confidence.js";

// graph.indoor as WalkGraph.addIndoor stores it: levels keyed by level number as a string
const indoor = {
  1101: { levels: { 0: { code: "000", verified: "2026-11-20" }, 1: { code: "001" } } },
  3101: { levels: { 0: { code: "000" } } },
};
const leg = (kind, building, level) => ({ kind, building, level });

test("routeFloors: indoor floors in route order, each once, with their check date", () => {
  const legs = [
    leg("indoor", "1101", 1),
    leg("vertical", "1101", null),
    leg("indoor", "1101", 0),
    leg("door", "1101", null),
    leg("outdoor", null, null),
    leg("indoor", "3101", 0),
    leg("indoor", "1101", 1), // back on a floor already listed
  ];
  assert.deepEqual(routeFloors(legs, indoor), [
    { building: "1101", level: 1, verified: null },
    { building: "1101", level: 0, verified: "2026-11-20" },
    { building: "3101", level: 0, verified: null },
  ]);
});

test("routeFloors: unknown buildings or floors count as not verified", () => {
  assert.deepEqual(routeFloors([leg("indoor", "9999", 0), leg("indoor", "1101", 7)], indoor), [
    { building: "9999", level: 0, verified: null },
    { building: "1101", level: 7, verified: null },
  ]);
  assert.deepEqual(routeFloors([leg("outdoor", null, null)], indoor), []);
});

test("confidence: approximate, verified, mixed or nothing indoors", () => {
  const f = (verified) => ({ building: "1101", level: 0, verified });
  assert.equal(confidence([]), null);
  assert.equal(confidence([f(null), f(null)]), "approximate");
  assert.equal(confidence([f("2026-11-20"), f("2026-11-21")]), "verified");
  assert.equal(confidence([f("2026-11-20"), f(null)]), "mixed");
});

import { routeConfidence } from "../../web/js/confidence.js";

const f = (verified) => ({ building: "3101", level: 1, verified });
const ok = { startIndoor: true, endIndoor: true, estimatedEntrance: false, unconfirmedRoom: false };

test("routeConfidence: high only when every floor was checked on site", () => {
  assert.deepEqual(routeConfidence({ ...ok, floors: [f("2026-11-20")] }), { level: "high", reasons: ["verified"] });
});

test("routeConfidence: medium when traced from plans, or only partly checked", () => {
  assert.deepEqual(routeConfidence({ ...ok, floors: [f(null)] }), { level: "medium", reasons: ["plansOnly"] });
  assert.deepEqual(routeConfidence({ ...ok, floors: [f("2026-11-20"), f(null)] }), { level: "medium", reasons: ["partlyVerified"] });
});

test("routeConfidence: low when an end has no indoor map, an entrance is guessed or the room is unknown", () => {
  const floors = [f("2026-11-20")]; // even verified floors cannot make up for a missing end
  assert.equal(routeConfidence({ ...ok, floors, endIndoor: false }).level, "low");
  assert.deepEqual(routeConfidence({ ...ok, floors, startIndoor: false, estimatedEntrance: true }).reasons, ["noIndoorStart", "estimatedEntrance"]);
  assert.deepEqual(routeConfidence({ ...ok, floors, unconfirmedRoom: true }), { level: "low", reasons: ["unconfirmedRoom"] });
});
