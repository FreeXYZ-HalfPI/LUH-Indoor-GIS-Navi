// SPDX-License-Identifier: GPL-3.0-or-later
// LUH room codes and place search.
//
// Room IDs look like BBBB.FFF.RRRR, e.g. 1101.000.E028:
//   BBBB building, FFF floor (000 ground, 001 first, U01 basement), RRRR room.

const ROOM_RE = /^(\d{4})\.([U-]?\d{2,3})\.([\w-]+)$/i;

export function parseRoomId(id) {
  const m = ROOM_RE.exec(id.trim());
  if (!m) return null;
  const [, building, floorCode, room] = m;
  const fc = floorCode.toUpperCase();
  let floor;
  if (fc[0] === "U" || fc[0] === "-") floor = -parseInt(fc.slice(1), 10);
  else floor = parseInt(fc, 10);
  const wing = /^[A-Z]/i.test(room) ? room[0].toUpperCase() : null;
  return { id: `${building}.${fc}.${room.toUpperCase()}`, building, floorCode: fc, floor, room: room.toUpperCase(), wing };
}

/** Normalise user input like "1101 e028", "1101-000-E028" or "1101.000.e028". */
function normalise(q) {
  return q.trim().toUpperCase().replace(/[\s,/_]+/g, ".").replace(/\.{2,}/g, ".");
}

const fold = (s) => (s || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/ß/g, "ss");

export class Places {
  constructor(buildings, rooms) {
    this.buildings = new Map(buildings.map((b) => [b.id, b]));
    this.rooms = [];
    for (const [bid, list] of Object.entries(rooms)) {
      for (const id of list) {
        const r = parseRoomId(id);
        if (r && this.buildings.has(bid)) this.rooms.push(r);
      }
    }
    this.roomIndex = new Map(this.rooms.map((r) => [r.id, r]));
  }

  building(id) {
    return this.buildings.get(id);
  }

  /** Resolve an exact place key ("b:1101" or "r:1101.000.E028"); unlisted but valid room codes are accepted. */
  resolve(key) {
    if (!key) return null;
    if (key.startsWith("b:")) {
      const b = this.buildings.get(key.slice(2));
      return b ? { type: "building", key, building: b } : null;
    }
    const r = this.roomIndex.get(key.slice(2)) || parseRoomId(key.slice(2));
    if (!r || !this.buildings.has(r.building)) return null;
    return { type: "room", key: `r:${r.id}`, room: r, building: this.buildings.get(r.building) };
  }

  /** Ranked suggestions for a free-text query. */
  search(q, limit = 12) {
    const raw = q.trim();
    if (!raw) return [];
    const n = normalise(raw);
    const f = fold(raw);
    const out = [];
    const seen = new Set();
    const push = (score, place) => {
      if (!seen.has(place.key)) {
        seen.add(place.key);
        out.push({ score, place });
      }
    };

    // exact room code typed (maybe not in the public list)
    const exact = parseRoomId(n);
    if (exact && this.buildings.has(exact.building)) push(100, this.resolve(`r:${exact.id}`));

    for (const b of this.buildings.values()) {
      const name = fold(b.name);
      const street = fold(`${b.street || ""} ${b.house_number || ""}`);
      let s = 0;
      if (b.id === n) s = 90;
      else if (b.id.startsWith(n)) s = 60;
      else if (name.startsWith(f)) s = 55;
      else if (name.includes(f)) s = 40;
      else if (f.length >= 3 && street.includes(f)) s = 30;
      if (s) push(s, { type: "building", key: `b:${b.id}`, building: b });
    }

    for (const r of this.rooms) {
      let s = 0;
      const short = `${r.building}.${r.room}`;
      if (r.id === n) s = 95;
      else if (r.id.startsWith(n) || short.startsWith(n)) s = 70;
      else if (n.length >= 3 && (r.room === n || r.room.startsWith(n))) s = 50;
      else if (n.length >= 4 && r.id.includes(n)) s = 35;
      if (s) push(s, { type: "room", key: `r:${r.id}`, room: r, building: this.buildings.get(r.building) });
    }

    out.sort((a, b) => b.score - a.score || a.place.key.localeCompare(b.place.key));
    return out.slice(0, limit).map((x) => x.place);
  }
}
