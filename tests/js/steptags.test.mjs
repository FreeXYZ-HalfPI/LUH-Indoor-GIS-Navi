// SPDX-License-Identifier: GPL-3.0-or-later
// Unit tests for web/js/steptags.js (run: node --test "tests/js/*.test.mjs").
import { test } from "node:test";
import assert from "node:assert/strict";
import { stepTag, floorTag, parseStep, placeStep, endSentence } from "../../web/js/steptags.js";

test("a step without a tag has no floor and no place", () => {
  assert.deepEqual(parseStep("Walk 20 steps."), { body: "Walk 20 steps.", floor: null, at: null, level: null });
});

test("floor, place and marker floor survive a round trip (also floor 0 and basements)", () => {
  for (const level of [0, 3, -1]) {
    const s = stepTag({ floor: level, at: [52.3851, 9.7131], level }) + "Take the stairs.";
    assert.deepEqual(parseStep(s), { body: "Take the stairs.", floor: level, at: [52.3851, 9.7131], level });
  }
});

test("an outdoor place has no marker floor; a floor-only tag has no place", () => {
  assert.deepEqual(parseStep(stepTag({ at: [52.38, 9.71] }) + "Walk."), { body: "Walk.", floor: null, at: [52.38, 9.71], level: null });
  assert.deepEqual(parseStep(floorTag(2) + "Start."), { body: "Start.", floor: 2, at: null, level: null });
});

test("placeStep keeps the floor and adds the place", () => {
  const placed = placeStep(floorTag(1) + "Start in room A104.", [52.3, 9.7], 1);
  assert.deepEqual(parseStep(placed), { body: "Start in room A104.", floor: 1, at: [52.3, 9.7], level: 1 });
  assert.deepEqual(parseStep(placeStep("Arrive.", [52.3, 9.7], null)), { body: "Arrive.", floor: null, at: [52.3, 9.7], level: null });
});

test("endSentence avoids a double full stop after a degree, also inside bold text", () => {
  assert.equal(endSentence("Ask <b>Dr. M. Sc.</b>."), "Ask <b>Dr. M. Sc.</b>");
  assert.equal(endSentence("Walk 5 steps."), "Walk 5 steps.");
  assert.equal(endSentence("Ask M. Sc.."), "Ask M. Sc.");
});
