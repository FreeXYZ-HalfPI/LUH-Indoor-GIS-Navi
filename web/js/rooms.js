// SPDX-License-Identifier: GPL-3.0-or-later
// LUH room codes, people and place search.
//
// Room IDs look like BBBB.FFF.RRRR, e.g. 1101.000.E028:
//   BBBB building, FFF floor (000 ground, 001 first, U01 basement), RRRR room.

// 4-digit building, floor (optional U/- for basements, 2–3 digits), room number
const ROOM_RE = /^(\d{4})\.([U-]?\d{2,3})\.([\w-]+)$/i;

/** Split a room id into its parts, or null if it is not one. */
export function parseRoomId(id) {
  const m = ROOM_RE.exec(id.trim());
  if (!m) return null;
  const [, building, floorCode, room] = m;
  const fc = floorCode.toUpperCase();
  let floor;
  if (fc[0] === "U" || fc[0] === "-") floor = -parseInt(fc.slice(1), 10);
  else floor = parseInt(fc, 10);
  // a leading letter is the wing (E028 → wing E); some buildings have no wings
  const wing = /^[A-Z]/i.test(room) ? room[0].toUpperCase() : null;
  return { id: `${building}.${fc}.${room.toUpperCase()}`, building, floorCode: fc, floor, room: room.toUpperCase(), wing };
}

/** Normalise user input like "1101 e028", "1101-000-E028" or "1101.000.e028". */
function normalise(q) {
  // spaces, commas, slashes and underscores all become the dot of a room id
  return q.trim().toUpperCase().replace(/[\s,/_]+/g, ".").replace(/\.{2,}/g, ".");
}

// lower case without accents, ß → ss: "Hauptgebaude" and "hauptgebäude" both find Hauptgebäude
const fold = (s) => (s || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/ß/g, "ss");

// Academic titles are not part of a name: "Prof. Dr.-Ing. habil. Christian Heipke" → christian, heipke.
// A token with a dot (Prof., Dr.-Ing., apl.) or in parentheses ((FH)) is a title.
const TITLE_WORDS = new Set(["pd", "habil", "mba", "msc", "bsc", "ma", "ba"]);
function nameTokens(name) {
  return fold(name)
    .split(/\s+/)
    .filter((w) => w && !w.includes(".") && !/^\(.*\)$/.test(w) && !TITLE_WORDS.has(w));
}

/** Edit distance of two short words, stopping early once it exceeds `max` (typo tolerance). */
function editDistance(a, b, max) {
  if (Math.abs(a.length - b.length) > max) return max + 1;
  let prev = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    for (let j = 1; j <= b.length; j++) cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    if (Math.min(...cur) > max) return max + 1; // every path is already too far
    prev = cur;
  }
  return prev[b.length];
}

/**
 * How well query words match a person's name words, as a search score (0 = no match).
 * Every query word must match some name word: exactly, as a prefix ("heip"),
 * or with one typo in words of 4+ letters ("Eping" → Epping).
 */
function nameScore(query, words) {
  if (!query.length) return 0;
  let score = 85;
  for (const q of query) {
    if (words.includes(q)) continue;
    if (words.some((w) => w.startsWith(q))) score = Math.min(score, 75);
    else if (q.length >= 4 && words.some((w) => editDistance(q, w, 1) <= 1)) score = Math.min(score, 45);
    else return 0;
  }
  return score;
}

/** All buildings, rooms and people the app knows, and the search over them. */
export class Places {
  constructor(buildings, rooms, people = []) {
    this.buildings = new Map(buildings.map((b) => [b.id, b]));
    this.rooms = [];
    for (const [bid, list] of Object.entries(rooms)) {
      for (const id of list) {
        const r = parseRoomId(id);
        if (r && this.buildings.has(bid)) this.rooms.push(r); // a room needs a building on the map
      }
    }
    this.roomIndex = new Map(this.rooms.map((r) => [r.id, r])); // id → room, for exact lookups

    // People (web/data/people.json, from tools/crawl_people.py). Each one gets a
    // short readable key for links: #to=christian-heipke
    this.people = new Map();
    this.peopleInRoom = new Map(); // room id → people, to show who sits in a room
    for (const p of people) {
      const room = this.roomIndex.get(p.room);
      if (!room) continue; // a person is only useful if we can route to their room
      const words = nameTokens(p.name);
      let slug = words.join("-");
      for (let n = 2; this.people.has(slug); n++) slug = `${words.join("-")}-${n}`; // two people, one name
      const person = { ...p, slug, words, search: fold(`${p.role} ${p.org}`) };
      this.people.set(slug, person);
      if (!this.peopleInRoom.has(p.room)) this.peopleInRoom.set(p.room, []);
      this.peopleInRoom.get(p.room).push(person);
    }
  }

  /** A person as a place: their office room, with the person attached for labels. */
  personPlace(person) {
    const room = this.roomIndex.get(person.room);
    return { type: "room", key: `p:${person.slug}`, room, building: this.buildings.get(room.building), person };
  }

  building(id) {
    return this.buildings.get(id);
  }

  /** Resolve an exact place key ("b:1101", "r:1101.000.E028" or "p:christian-heipke"); unlisted but valid room codes are accepted. */
  resolve(key) {
    if (!key) return null;
    if (key.startsWith("p:")) {
      const person = this.people.get(key.slice(2));
      return person ? this.personPlace(person) : null;
    }
    if (key.startsWith("b:")) {
      const b = this.buildings.get(key.slice(2));
      return b ? { type: "building", key, building: b } : null;
    }
    const r = this.roomIndex.get(key.slice(2)) || parseRoomId(key.slice(2));
    if (!r || !this.buildings.has(r.building)) return null;
    return { type: "room", key: `r:${r.id}`, room: r, building: this.buildings.get(r.building) };
  }

  /**
   * Ranked suggestions for a free-text query.
   * Scores order the kinds of match: an exact code beats a prefix, a prefix beats
   * a match inside a name. Short queries only match from the start, so typing "1"
   * does not list thousands of rooms.
   */
  search(q, limit = 12) {
    const raw = q.trim();
    if (!raw) return [];
    const n = normalise(raw);
    const f = fold(raw);
    const out = [];
    const seen = new Set();
    const push = (score, place) => {
      // each place once, with its first (best) score
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

    // people: by name (with typo tolerance), or by role and institute ("Präsident", "Photogrammetrie")
    const words = nameTokens(raw);
    for (const person of this.people.values()) {
      let s = nameScore(words, person.words);
      // a role that starts with the word ranks first: "Präsident" → the president, then the vice-presidents
      if (!s && f.length >= 4 && person.search.includes(f)) s = person.search.startsWith(f) ? 35 : 30;
      if (s) push(s, this.personPlace(person));
    }

    out.sort((a, b) => b.score - a.score || a.place.key.localeCompare(b.place.key));
    return out.slice(0, limit).map((x) => x.place);
  }
}
