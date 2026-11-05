// SPDX-License-Identifier: GPL-3.0-or-later
// Unit tests for web/js/router.js on a small hand-made graph (run: node --test "tests/js/*.test.mjs").
//
//   building A ── 100 m ── O1 ── 100 m ── building B
//        \_________ building C (10 m corridor) _________/
//
// C's corridor is a shortcut between the entrances of A and B; a route from A to
// B must not use it, because routes never walk through a third building.
import { test } from "node:test";
import assert from "node:assert/strict";
import { WalkGraph, STEPS, haversine, compass } from "../../web/js/router.js";

const ELEVATOR = 4;
const VERTICAL = 8;
const O = [
  [52.0, 9.0],
  [52.0, 9.001],
  [52.0, 9.002],
];
const ent = (i) => ({ lat: O[i][0], lon: O[i][1], node: i });

function outdoor() {
  return {
    nodes: O,
    edges: [
      [0, 1, 100, 0, [52.0, 9.0005]], // one shape point in the middle
      [1, 2, 100, 0, []],
    ],
    buildings: {
      A: { cluster: 0, entrances: [ent(0)] },
      B: { cluster: 0, entrances: [ent(2)] },
      C: { cluster: 0, entrances: [ent(0), ent(2)] },
      N: { cluster: 0, entrances: [{ lat: 1, lon: 1, node: null }] }, // no entrance on the path network
    },
  };
}

// plan pixel → lat/lon; the exact numbers do not matter, lengths come from the edges
const georef = { lat: [52, 0, 1e-5], lon: [9, 1e-5, 0] };
const indoor = (building, nodes, edges, rooms, entrances) => ({
  building,
  georef,
  nodes,
  edges,
  rooms,
  entrances,
  levels: {},
  plan_size: [100, 100],
  approximate: true,
  listed: Object.keys(rooms),
});

function graph() {
  const g = new WalkGraph(outdoor());
  // A: entrance and room on floor 0; room R1 on floor 1 by stairs (short) or lift (longer)
  g.addIndoor(
    indoor(
      "A",
      [[0, 0, 0], [10, 0, 0], [10, 0, 1], [20, 0, 1], [0, 0, 1]],
      [
        [0, 1, 10, 0, [5, 0]],
        [1, 2, 5, STEPS | VERTICAL, []],
        [2, 3, 10, 0, []],
        [0, 4, 8, ELEVATOR | VERTICAL, []],
        [4, 3, 20, 0, []],
      ],
      { "A.000.R0": 1, "A.001.R1": 3 },
      [{ node: 0, lat: O[0][0], lon: O[0][1] }],
    ),
  );
  // B: one staircase from floor 0 to floor 2
  g.addIndoor(
    indoor(
      "B",
      [[0, 0, 0], [0, 0, 1], [0, 0, 2]],
      [
        [0, 1, 4, STEPS | VERTICAL, []],
        [1, 2, 4, STEPS | VERTICAL, []],
      ],
      { "B.002.R": 2 },
      [{ node: 0, lat: O[2][0], lon: O[2][1] }],
    ),
  );
  // C: the shortcut
  g.addIndoor(
    indoor("C", [[0, 0, 0], [10, 0, 0]], [[0, 1, 10, 0, []]], {}, [
      { node: 0, lat: O[0][0], lon: O[0][1] },
      { node: 1, lat: O[2][0], lon: O[2][1] },
    ]),
  );
  return g;
}

const room = (b, id) => ({ type: "room", building: { id: b }, room: { id } });
const bldg = (b) => ({ type: "building", building: { id: b } });
const kinds = (r) => r.legs.map((l) => l.kind);

test("indoor entrances are joined to the outdoor entrances with the same coordinates", () => {
  const g = graph();
  const doors = g.edges.filter((e) => e[3] & 32);
  assert.equal(doors.length, 4); // A 1, B 1, C 2
  assert.ok(doors.every((e) => g.level[e[0]] === null && g.level[e[1]] !== null));
});

test("room to room across buildings: door to door, never through a third building", () => {
  const g = graph();
  const r = g.route(room("A", "A.000.R0"), room("B", "B.002.R"));
  assert.ok(r);
  assert.deepEqual(kinds(r), ["indoor", "door", "outdoor", "door", "vertical"]);
  assert.equal(r.distance, 210); // 10 indoor + 200 outdoor; doors and stairs are not distance
  assert.equal(r.time, 218); // stairs count as time
  assert.ok(r.legs.every((l) => l.building == null || l.building === "A" || l.building === "B"));
  assert.equal(r.start.indoor, true);
  assert.equal(r.end.indoor, true);
  assert.deepEqual(r.legs[1], { kind: "door", enter: false, at: O[0], building: "A" });
  assert.equal(r.legs[3].enter, true);
});

test("several floors on one staircase are one vertical leg", () => {
  const r = graph().route(bldg("B"), room("B", "B.002.R"));
  const v = r.legs.filter((l) => l.kind === "vertical");
  assert.equal(v.length, 1);
  assert.deepEqual([v[0].type, v[0].fromLevel, v[0].toLevel], ["stairs", 0, 2]);
});

test("avoid steps prefers the lift but still finds a route with only stairs", () => {
  const g = graph();
  const pick = (opts) => g.route(bldg("A"), room("A", "A.001.R1"), opts).legs.find((l) => l.kind === "vertical").type;
  assert.equal(pick({}), "stairs");
  assert.equal(pick({ avoidSteps: true }), "elevator");
  assert.ok(g.route(bldg("B"), room("B", "B.002.R"), { avoidSteps: true })); // B has no lift
});

test("indoor legs are split by floor and carry plan pixels", () => {
  const r = graph().route(room("A", "A.000.R0"), room("A", "A.001.R1"));
  assert.deepEqual(kinds(r), ["vertical", "indoor"]);
  const leg = r.legs[1];
  assert.equal(leg.level, 1);
  assert.deepEqual(leg.px, [[10, 0], [20, 0]]);
});

test("edge shapes are reversed when an edge is walked backwards", () => {
  const g = graph();
  const fwd = g.route(bldg("A"), bldg("B")).coords.map((c) => c[1]);
  const back = g.route(bldg("B"), bldg("A")).coords.map((c) => c[1]);
  assert.deepEqual(fwd, [9.0, 9.0005, 9.001, 9.002]);
  assert.deepEqual(back, [...fwd].reverse());
});

test("unmapped rooms fall back to the building entrances", () => {
  const r = graph().route(room("A", "A.003.UNKNOWN"), bldg("B"));
  assert.equal(r.start.indoor, false);
  assert.equal(r.start.entrance.node, 0);
  assert.equal(r.distance, 200);
});

test("no route without entrances; an empty route for the same place", () => {
  const g = graph();
  assert.equal(g.route(bldg("N"), bldg("A")), null);
  assert.equal(g.route(bldg("A"), bldg("Missing")), null);
  const same = g.route(room("A", "A.000.R0"), room("A", "A.000.R0"));
  assert.deepEqual([same.legs, same.distance, same.coords.length], [[], 0, 1]);
});

test("haversine and compass", () => {
  assert.ok(Math.abs(haversine([52, 9], [53, 9]) - 111195) < 10); // one degree of latitude
  assert.equal(haversine([52, 9], [52, 9]), 0);
  assert.equal(compass([52, 9], [52.01, 9]), "N");
  assert.equal(compass([52, 9], [52, 9.01]), "E");
  assert.equal(compass([52, 9], [51.99, 8.99]), "SW");
});
