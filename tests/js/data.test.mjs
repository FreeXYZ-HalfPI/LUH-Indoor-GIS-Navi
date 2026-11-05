// SPDX-License-Identifier: GPL-3.0-or-later
// Checks the generated app data in web/data/ with the app's own router
// (run: node --test "tests/js/*.test.mjs"). It catches routability regressions after a
// rebuild of the walk graph or of a building's indoor graph.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { WalkGraph } from "../../web/js/router.js";

const DATA = new URL("../../web/data/", import.meta.url);
const load = (f) => JSON.parse(readFileSync(new URL(f, DATA), "utf8"));

const walk = load("walkgraph.json");
const indoorList = load("indoor/index.json");
const indoor = indoorList.map((b) => load(`indoor/${b}.json`));
const graph = new WalkGraph(walk);
for (const d of indoor) graph.addIndoor(d);

const DOOR = 32;
const room = (b, id) => ({ type: "room", building: { id: b }, room: { id } });
const outside = (b) => ({ type: "building", building: { id: b } });
/** First few items of a list of failures, for a readable assertion message. */
const show = (list) => `${list.length}: ${list.slice(0, 20).join(", ")}${list.length > 20 ? ", …" : ""}`;

test("every indoor building is on the walk graph", () => {
  for (const d of indoor) {
    assert.ok(graph.buildings[d.building], `${d.building} missing in walkgraph.json`);
    assert.ok(graph.entrances(d.building).length, `${d.building} has no outdoor entrance on the path network`);
  }
});

test("every indoor entrance is joined to an outdoor entrance", () => {
  const joined = new Set();
  graph.edges.forEach((e, i) => {
    if (e[3] & DOOR) joined.add(`${graph.edgeBuilding[i]}:${e[0]}:${e[1]}`);
  });
  for (const d of indoor) {
    const doors = [...joined].filter((k) => k.startsWith(`${d.building}:`)).length;
    const lost = d.entrances.filter((en) => !graph.entrances(d.building).some((o) => o.lat === en.lat && o.lon === en.lon));
    assert.deepEqual(
      lost.map((en) => `node ${en.node} (${en.lat}, ${en.lon})`),
      [],
      `${d.building}: indoor entrances that match no OSM entrance (moved in OSM? rebuild the indoor graph)`,
    );
    assert.equal(doors, d.entrances.length, `${d.building}: door edges`);
  }
});

test("every routable room reaches an entrance of its own building", () => {
  for (const d of indoor) {
    const failed = [];
    for (const id of Object.keys(d.rooms)) {
      const r = graph.route(room(d.building, id), outside(d.building));
      if (!r || !r.start.indoor) failed.push(id);
      else if (r.legs.some((l) => l.building != null && l.building !== d.building)) failed.push(`${id} (leaves the building)`);
    }
    assert.equal(failed.length, 0, `${d.building}: rooms without a way out ${show(failed)}`);
  }
});

test("routes between mapped buildings never cut through a third building", () => {
  // a few rooms per building, spread over its floors, routed to every other building of the same campus
  const sample = (d) => {
    const ids = Object.keys(d.rooms);
    return [0, 0.25, 0.5, 0.75, 1].map((f) => ids[Math.min(ids.length - 1, Math.floor(f * ids.length))]);
  };
  const failed = [];
  for (const a of indoor) {
    for (const b of indoor) {
      if (a === b || graph.buildings[a.building].cluster !== graph.buildings[b.building].cluster) continue;
      for (const [ra, rb] of sample(a).map((id, i) => [id, sample(b)[i]])) {
        const r = graph.route(room(a.building, ra), room(b.building, rb));
        if (!r) failed.push(`${ra} → ${rb} (no route)`);
        else {
          const other = r.legs.find((l) => l.building != null && l.building !== a.building && l.building !== b.building);
          if (other) failed.push(`${ra} → ${rb} (through ${other.building})`);
        }
      }
    }
  }
  assert.equal(failed.length, 0, `bad routes ${show(failed)}`);
});
