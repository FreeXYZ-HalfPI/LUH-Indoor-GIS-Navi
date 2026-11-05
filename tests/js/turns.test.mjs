// SPDX-License-Identifier: GPL-3.0-or-later
// Unit tests for web/js/turns.js (run: node --test "tests/js/*.test.mjs").
import { test } from "node:test";
import assert from "node:assert/strict";
import { turnSteps } from "../../web/js/turns.js";

// Build a route line from local east/north metres, the way turns.js reads it back.
const LAT0 = 52.38;
const LON0 = 9.71;
const K = Math.cos((LAT0 * Math.PI) / 180);
const line = (pts) => pts.map(([x, y]) => [LAT0 + y / 111320, LON0 + x / (111320 * K)]);

/** Points every `step` metres from a to b (a included, b included). */
function seg([x0, y0], [x1, y1], step = 5) {
  const n = Math.max(1, Math.round(Math.hypot(x1 - x0, y1 - y0) / step));
  return Array.from({ length: n + 1 }, (_, i) => [x0 + ((x1 - x0) * i) / n, y0 + ((y1 - y0) * i) / n]);
}
/** A polyline through the given corners, sampled every 5 m. */
const walk = (...corners) => line(corners.slice(1).flatMap((c, i) => seg(corners[i], c).slice(i ? 1 : 0)));

const near = (a, b, tol = 0.5) => assert.ok(Math.abs(a - b) <= tol, `${a} is not within ${tol} of ${b}`);

test("too short a line has no steps", () => {
  assert.deepEqual(turnSteps([], 3), []);
  assert.deepEqual(turnSteps(null, 3), []);
  assert.deepEqual(turnSteps(line([[0, 0]]), 3), []);
});

test("a straight line is one step without a turn", () => {
  const steps = turnSteps(walk([0, 0], [0, 100]), 3);
  assert.equal(steps.length, 1);
  assert.equal(steps[0].turn, null);
  near(steps[0].metres, 100);
});

test("right and left turns", () => {
  const right = turnSteps(walk([0, 0], [0, 30], [20, 30]), 3);
  assert.deepEqual(right.map((s) => s.turn), [null, "right"]);
  near(right[0].metres, 30);
  near(right[1].metres, 20);

  const left = turnSteps(walk([0, 0], [0, 30], [-20, 30]), 3);
  assert.deepEqual(left.map((s) => s.turn), [null, "left"]);
});

test("slight, sharp and u-turns", () => {
  const dir = (deg, m) => [m * Math.sin((deg * Math.PI) / 180), 30 + m * Math.cos((deg * Math.PI) / 180)];
  const turnAt = (deg) => turnSteps(walk([0, 0], [0, 30], dir(deg, 30)), 3)[1]?.turn;
  assert.equal(turnAt(40), "slightRight");
  assert.equal(turnAt(-40), "slightLeft");
  assert.equal(turnAt(90), "right");
  assert.equal(turnAt(150), "sharpRight");
  assert.equal(turnAt(-150), "sharpLeft");
  assert.equal(turnAt(180), "uturn");
});

test("small wiggles are not turns", () => {
  // a corridor centre line that zig-zags half a metre every 5 m
  const pts = Array.from({ length: 21 }, (_, i) => [i % 2 ? 0.5 : -0.5, i * 5]);
  const steps = turnSteps(line(pts), 3);
  assert.equal(steps.length, 1);
  near(steps[0].metres, 20 * Math.hypot(1, 5), 0.01); // the wiggly path, measured as walked
});

test("a short recess shorter than minRun is not its own step", () => {
  // 30 m north, 1 m east (a door recess), 30 m north
  const pts = line([[0, 0], [0, 10], [0, 20], [0, 30], [1, 30], [1, 40], [1, 50], [1, 60]]);
  const steps = turnSteps(pts, 3);
  assert.equal(steps.length, 1);
  near(steps[0].metres, 61);
  // with a smaller minRun the recess becomes two turns
  assert.ok(turnSteps(pts, 0.5).length > 1);
});

test("step lengths add up to the line length", () => {
  const steps = turnSteps(walk([0, 0], [0, 40], [25, 40], [25, 10], [60, 10]), 3);
  assert.deepEqual(steps.map((s) => s.turn), [null, "right", "right", "left"]);
  near(steps.reduce((m, s) => m + s.metres, 0), 40 + 25 + 30 + 35, 1);
});
