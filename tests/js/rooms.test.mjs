// SPDX-License-Identifier: GPL-3.0-or-later
// Unit tests for web/js/rooms.js (run: node --test "tests/js/*.test.mjs").
import { test } from "node:test";
import assert from "node:assert/strict";
import { Places, parseRoomId } from "../../web/js/rooms.js";

test("parseRoomId splits building, floor, room and wing", () => {
  assert.deepEqual(parseRoomId("1101.000.E028"), { id: "1101.000.E028", building: "1101", floorCode: "000", floor: 0, room: "E028", wing: "E" });
  assert.equal(parseRoomId("1101.004.f407").id, "1101.004.F407");
  assert.equal(parseRoomId("  3101.001.B143 ").floor, 1);
  assert.equal(parseRoomId("3110.002.205A").wing, null); // no wing letter
  assert.equal(parseRoomId("3408.U01.001").floor, -1); // basement
  assert.equal(parseRoomId("3408.-01.001").floor, -1);
  assert.equal(parseRoomId("3408.017.1701").floor, 17); // high-rise floors
});

test("parseRoomId rejects what is not a room id", () => {
  for (const s of ["", "1101", "1101.000", "110.000.E028", "1101.0.E028", "Hauptgebäude", "1101.000.E 028"]) {
    assert.equal(parseRoomId(s), null, s);
  }
});

const buildings = [
  { id: "1101", name: "Hauptgebäude", street: "Welfengarten", house_number: "1" },
  { id: "3101", name: "Schneiderberg-Gebäude", street: "Schneiderberg", house_number: "50" },
  { id: "3110", name: "Hauptmensa", street: "Callinstraße", house_number: "23" },
];
const rooms = {
  1101: ["1101.000.E028", "1101.004.F407", "1101.001.A120"],
  3101: ["3101.001.B143", "3101.000.A020"],
  9999: ["9999.000.X001"], // no building on the map: dropped
};
const people = [
  { name: "Prof. Dr.-Ing. Christian Heipke", role: "Professor", org: "Institut für Photogrammetrie und GeoInformation", room: "3101.001.B143" },
  { name: "Prof. Dr. Volker Epping", role: "Präsident", org: "Präsidium", room: "1101.001.A120" },
  { name: "Christian Heipke", role: "", org: "Somewhere else", room: "1101.004.F407" }, // same name, other person
  { name: "Max Mustermann, M. Sc.", role: "", org: "IPI", room: "1101.000.Z999" }, // room unknown: dropped
];
const places = new Places(buildings, rooms, people);
const keys = (q, n) => places.search(q, n).map((p) => p.key);

test("rooms without a building on the map are dropped", () => {
  assert.equal(places.rooms.length, 5);
  assert.equal(places.roomIndex.has("9999.000.X001"), false);
});

test("people get readable slugs without titles; duplicates are numbered", () => {
  assert.deepEqual([...places.people.keys()].sort(), ["christian-heipke", "christian-heipke-2", "volker-epping"]);
  assert.equal(places.peopleInRoom.get("3101.001.B143")[0].slug, "christian-heipke");
});

test("resolve accepts building, room, person and unlisted room keys", () => {
  assert.equal(places.resolve("b:1101").building.name, "Hauptgebäude");
  assert.equal(places.resolve("r:1101.000.E028").room.wing, "E");
  assert.equal(places.resolve("r:1101.003.G315").room.id, "1101.003.G315"); // valid code, not in the list
  const p = places.resolve("p:volker-epping");
  assert.equal(p.type, "room");
  assert.equal(p.room.id, "1101.001.A120");
  assert.equal(p.person.name, "Prof. Dr. Volker Epping");
  for (const k of [null, "", "b:0000", "p:nobody", "r:0000.000.A001", "r:garbage"]) assert.equal(places.resolve(k), null, k);
});

test("search: exact room code first, in any notation", () => {
  for (const q of ["1101.000.E028", "1101 000 e028", "1101/000/E028","1101_000_E028"]) {
    assert.equal(keys(q)[0], "r:1101.000.E028", q);
  }
  // a valid code that is not in the list is still offered
  assert.equal(keys("1101.003.G315")[0], "r:1101.003.G315");
});

test("search: buildings by number, name (without accents) and street", () => {
  assert.equal(keys("1101")[0], "b:1101");
  assert.equal(keys("Hauptgebaude")[0], "b:1101");
  assert.equal(keys("hauptgebäude")[0], "b:1101");
  assert.ok(keys("mensa").includes("b:3110"));
  assert.ok(keys("callinstrasse").includes("b:3110")); // ß → ss
});

test("search: short room numbers only match from the start", () => {
  assert.deepEqual(keys("E0"), []); // too short to search inside room numbers
  assert.ok(keys("E02").includes("r:1101.000.E028"));
  assert.ok(keys("3101.B143").includes("r:3101.001.B143")); // building.room without the floor
});

test("search: people by name, prefix, typo and role", () => {
  assert.equal(keys("Christian Heipke")[0].startsWith("p:christian-heipke"), true);
  assert.ok(keys("Heip").includes("p:christian-heipke"));
  assert.ok(keys("Eping").includes("p:volker-epping")); // one typo
  assert.ok(!keys("Epx").includes("p:volker-epping")); // short words get no typo tolerance
  assert.equal(keys("Präsident")[0], "p:volker-epping");
  assert.ok(keys("Photogrammetrie").includes("p:christian-heipke"));
});

test("search: empty query, limit and stable order", () => {
  assert.deepEqual(places.search("   "), []);
  assert.equal(places.search("1", 2).length, 2);
  assert.deepEqual(keys("1101"), keys("1101"));
});
