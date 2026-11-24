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

test("every field-test route (docs/field-test/routes.csv) is routable door to door", () => {
  // the checklists are generated once and printed; a rebuild must not break them unnoticed
  const csv = readFileSync(new URL("../../docs/field-test/routes.csv", import.meta.url), "utf8").trim().split(/\r?\n/);
  const head = csv[0].split(",");
  const col = (row, name) => row[head.indexOf(name)];
  const place = (id) => (id.includes(".") ? room(id.slice(0, 4), id) : outside(id));
  const failed = [];
  for (const line of csv.slice(1)) {
    const row = line.split(","); // no field holds a comma: codes, yes/no and links only
    const [a, z] = [col(row, "from"), col(row, "to")];
    const r = graph.route(place(a), place(z), { avoidSteps: col(row, "avoid_steps") === "yes" });
    const indoorEnds = [a, z].filter((id) => id.includes(".")).length;
    if (!r || [r.start.indoor, r.end.indoor].filter(Boolean).length !== indoorEnds) failed.push(`${a} → ${z}`);
  }
  assert.ok(csv.length > 1);
  assert.equal(failed.length, 0, `field-test routes without a door-to-door route ${show(failed)} (rerun tools/field_test.py)`);
});

test("loading only the two buildings of a route gives the same route as loading all (lazy loading)", () => {
  const pairs = [["3101", "3110"], ["1101", "3408"], ["3109", "3101"]];
  for (const [a, b] of pairs) {
    const lazy = new WalkGraph(load("walkgraph.json"));
    for (const id of [a, b]) lazy.addIndoor(load(`indoor/${id}.json`));
    const ra = indoor.find((d) => d.building === a);
    const rb = indoor.find((d) => d.building === b);
    const from = room(a, Object.keys(ra.rooms)[0]);
    const to = room(b, Object.keys(rb.rooms).at(-1));
    const full = graph.route(from, to);
    const part = lazy.route(from, to);
    assert.ok(full && part, `${a} → ${b}: no route`);
    // the same route, unless the full graph walks through a third building (then the lazy one is the intended result)
    if (full.legs.every((l) => l.building == null || l.building === a || l.building === b)) {
      assert.equal(Math.round(part.distance), Math.round(full.distance), `${a} → ${b}: different distance`);
    }
    assert.ok(part.start.indoor && part.end.indoor, `${a} → ${b}: an end fell back to the entrance`);
  }
});

test("frames.json has a frame for every indoor building", () => {
  const frames = load("indoor/frames.json");
  assert.deepEqual(Object.keys(frames).sort(), [...indoorList].sort());
  for (const [s, w, n, e] of Object.values(frames)) assert.ok(s < n && w < e);
});

test("every service in services.json points to a building that can be walked to", () => {
  const { services } = load("services.json");
  assert.ok(services.length);
  for (const sv of services) {
    assert.ok(graph.buildings[sv.building], `${sv.id}: building ${sv.building} is not on the walk graph`);
    assert.ok(graph.entrances(sv.building).length, `${sv.id}: building ${sv.building} has no entrance`);
    assert.ok(sv.name.en && sv.name.de && sv.detail.en && sv.detail.de && /^https:\/\//.test(sv.url), `${sv.id}: incomplete entry`);
    const from = sv.building === "1101" ? "3101" : "1101"; // a service in the Hauptgebäude is walked to from elsewhere
    const r = graph.route(outside(from), outside(sv.building));
    assert.ok(r && r.distance > 0, `${sv.id}: no route from ${from}`);
  }
});

test("every stop in stops.json can be walked from to a room (the app routes from stops)", () => {
  const { stops } = load("stops.json");
  const hubs = stops.filter((s) => s.hub);
  assert.ok(hubs.length >= 1, "no hub (main station) in stops.json");
  const target = room("3101", Object.keys(indoor.find((d) => d.building === "3101").rooms)[0]);
  const lost = [];
  for (const s of stops.filter((x) => !x.hub)) {
    assert.ok(s.node != null && graph.nodes[s.node], `${s.id}: no valid node`);
    const r = graph.route({ type: "stop", building: { id: `stop:${s.id}` }, stop: s }, target);
    if (!r) lost.push(s.id);
  }
  assert.equal(lost.length, 0, `stops that cannot reach 3101: ${show(lost)}`);
});

test("dorms.json: complete entries; a dorm on the walk graph can walk to a room of its campus area", () => {
  const { dorms } = load("dorms.json");
  assert.ok(dorms.length >= 10, "dorms missing");
  const ids = new Set();
  const lost = [];
  for (const d of dorms) {
    assert.ok(/^[a-z0-9-]+$/.test(d.id) && !ids.has(d.id), `${d.id}: id`);
    ids.add(d.id);
    assert.ok(d.name && d.street && /^\d{5}$/.test(d.zip) && d.city && d.url.startsWith("https://"), `${d.id}: incomplete`);
    assert.ok(d.lat > 52.2 && d.lat < 52.5 && d.lon > 9.5 && d.lon < 9.95, `${d.id}: position outside Hannover (${d.lat}, ${d.lon})`);
    if (d.node == null) continue; // off the walk graph: the app rides to a stop instead
    assert.ok(graph.nodes[d.node], `${d.id}: no valid node`);
    const target = room("3101", Object.keys(indoor.find((x) => x.building === "3101").rooms)[0]);
    if (d.cluster === graph.buildings["3101"].cluster && !graph.route({ type: "dorm", building: { id: `dorm:${d.id}` }, dorm: d }, target)) lost.push(d.id);
  }
  assert.equal(lost.length, 0, `dorms that cannot walk to 3101: ${show(lost)}`);
});
