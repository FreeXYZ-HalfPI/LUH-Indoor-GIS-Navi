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
