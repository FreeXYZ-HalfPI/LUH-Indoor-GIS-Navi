// SPDX-License-Identifier: GPL-3.0-or-later
// On-device routing on the outdoor walk graph (tools/build_walk_graph.py) merged
// with indoor graphs (tools/build_indoor.py). One Dijkstra, door to door.

export const STEPS = 1; // outdoor steps or indoor stairs
const LINK = 2; // outdoor: entrance → path network
const ELEVATOR = 4;
const VERTICAL = 8;
const INDOOR = 16;
const DOOR = 32; // outdoor entrance ↔ indoor entrance

class MinHeap {
  constructor() {
    this.a = [];
  }
  get size() {
    return this.a.length;
  }
  push(item) {
    const a = this.a;
    a.push(item);
    let i = a.length - 1;
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (a[p][0] <= a[i][0]) break;
      [a[p], a[i]] = [a[i], a[p]];
      i = p;
    }
  }
  pop() {
    const a = this.a;
    const top = a[0];
    const last = a.pop();
    if (a.length) {
      a[0] = last;
      let i = 0;
      for (;;) {
        const l = 2 * i + 1;
        const r = l + 1;
        let m = i;
        if (l < a.length && a[l][0] < a[m][0]) m = l;
        if (r < a.length && a[r][0] < a[m][0]) m = r;
        if (m === i) break;
        [a[m], a[i]] = [a[i], a[m]];
        i = m;
      }
    }
    return top;
  }
}

export class WalkGraph {
  constructor(data) {
    this.nodes = data.nodes; // [lat, lon]
    this.level = new Array(this.nodes.length).fill(null); // null = outdoors
    this.px = []; // plan pixels of indoor nodes, by node index
    this.edges = data.edges.map(([a, b, len, flags, mid]) => [a, b, len, flags, mid, null]);
    this.edgeBuilding = []; // building of each indoor/door edge (indexed like edges)
    this.buildings = data.buildings;
    this.indoor = {}; // building → {rooms, levels, approximate}
    this.adj = Array.from({ length: this.nodes.length }, () => []);
    this.edges.forEach(([a, b], i) => {
      this.adj[a].push(i);
      this.adj[b].push(i);
    });
  }

  /** Merge a building's indoor graph and connect it at the entrances. */
  addIndoor(data) {
    const off = this.nodes.length;
    const { lat: A, lon: B } = data.georef;
    const ll = (x, y) => [A[0] + A[1] * x + A[2] * y, B[0] + B[1] * x + B[2] * y];
    for (const [x, y, l] of data.nodes) {
      const i = this.nodes.push(ll(x, y)) - 1;
      this.level[i] = l;
      this.px[i] = [x, y];
      this.adj.push([]);
    }
    const addEdge = (e) => {
      const i = this.edges.push(e) - 1;
      this.edgeBuilding[i] = data.building;
      this.adj[e[0]].push(i);
      this.adj[e[1]].push(i);
    };
    for (const [a, b, len, flags, mid] of data.edges) {
      const geo = [];
      for (let i = 0; i < mid.length; i += 2) geo.push(...ll(mid[i], mid[i + 1]));
      addEdge([a + off, b + off, len, flags | INDOOR, geo, mid]);
    }
    const outside = this.buildings[data.building]?.entrances || [];
    for (const en of data.entrances) {
      const o = outside.find((e) => e.node != null && e.lat === en.lat && e.lon === en.lon);
      if (o) addEdge([o.node, en.node + off, 1, DOOR, [], null]);
    }
    const rooms = {};
    for (const [id, n] of Object.entries(data.rooms)) rooms[id] = n + off;
    this.indoor[data.building] = { rooms, levels: data.levels, size: data.plan_size, approximate: data.approximate, listed: data.listed && new Set(data.listed) };
  }

  entrances(buildingId) {
    return (this.buildings[buildingId]?.entrances || []).filter((e) => e.node != null);
  }

  /** Graph nodes a place starts/ends at: the room node if mapped indoors, else the building's entrances. */
  endpoints(place) {
    if (place.type === "room") {
      const n = this.indoor[place.building.id]?.rooms[place.room.id];
      if (n != null) return { nodes: [n], indoor: true };
    }
    return { nodes: this.entrances(place.building.id).map((e) => e.node), indoor: false };
  }

  /**
   * Shortest route between two places (see Places in rooms.js).
   * Returns {distance, time, coords, legs, start, end} or null when unreachable.
   */
  route(from, to, opts = {}) {
    const s = this.endpoints(from);
    const t = this.endpoints(to);
    if (!s.nodes.length || !t.nodes.length) return null;
    const goals = new Set(t.nodes);
    // only walk through the start and destination buildings, never through others as a shortcut
    const allowed = new Set([from.building.id, to.building.id]);

    const n = this.nodes.length;
    const dist = new Float64Array(n).fill(Infinity);
    const prevEdge = new Int32Array(n).fill(-1);
    const heap = new MinHeap();
    for (const v of s.nodes) {
      dist[v] = 0;
      heap.push([0, v]);
    }
    let goal = -1;
    while (heap.size) {
      const [d, v] = heap.pop();
      if (d > dist[v]) continue;
      if (goals.has(v)) {
        goal = v;
        break;
      }
      for (const ei of this.adj[v]) {
        const [a, b, len, flags] = this.edges[ei];
        if (flags & (INDOOR | DOOR) && !allowed.has(this.edgeBuilding[ei])) continue;
        const u = a === v ? b : a;
        const cost = len * (opts.avoidSteps && flags & STEPS ? 20 : 1);
        if (d + cost < dist[u]) {
          dist[u] = d + cost;
          prevEdge[u] = ei;
          heap.push([d + cost, u]);
        }
      }
    }
    if (goal < 0) return null;

    const hops = [];
    let v = goal;
    while (prevEdge[v] >= 0) {
      const ei = prevEdge[v];
      const [a, b] = this.edges[ei];
      const u = a === v ? b : a;
      hops.push([u, v, ei]);
      v = u;
    }
    hops.reverse();
    const startNode = v;

    // split into legs: outdoor / indoor (one per floor) / vertical / door
    const legs = [];
    let distance = 0;
    let time = 0;
    const last = () => legs[legs.length - 1];
    for (const [u, w, ei] of hops) {
      const [a, , len, flags, geo, mid] = this.edges[ei];
      if (flags & VERTICAL) {
        const type = flags & ELEVATOR ? "elevator" : "stairs";
        if (last()?.kind === "vertical" && last().type === type) last().toLevel = this.level[w];
        else legs.push({ kind: "vertical", type, fromLevel: this.level[u], toLevel: this.level[w], at: this.nodes[w], building: this.edgeBuilding[ei] });
        time += len;
        continue;
      }
      if (flags & DOOR) {
        const out = this.level[u] == null ? u : w;
        legs.push({ kind: "door", enter: this.level[u] == null, at: this.nodes[out], building: this.edgeBuilding[ei] });
        continue;
      }
      const indoor = !!(flags & INDOOR);
      const level = indoor ? this.level[u] : null;
      const building = indoor ? this.edgeBuilding[ei] : null;
      let leg = last();
      if (!leg || leg.kind !== (indoor ? "indoor" : "outdoor") || leg.level !== level || leg.building !== building) {
        leg = { kind: indoor ? "indoor" : "outdoor", level, building, distance: 0, steps: 0, coords: [this.nodes[u]], px: indoor ? [this.px[u]] : null };
        legs.push(leg);
      }
      const pts = [];
      for (let i = 0; i < geo.length; i += 2) pts.push([geo[i], geo[i + 1]]);
      const pxs = [];
      if (mid) for (let i = 0; i < mid.length; i += 2) pxs.push([mid[i], mid[i + 1]]);
      if (u !== a) {
        pts.reverse(); // geometry is stored a → b
        pxs.reverse();
      }
      leg.coords.push(...pts, this.nodes[w]);
      if (indoor) leg.px.push(...pxs, this.px[w]);
      leg.distance += len;
      if (flags & STEPS) leg.steps++;
      distance += len;
      time += len;
    }

    const coords = [this.nodes[startNode]];
    for (const l of legs) if (l.coords) coords.push(...l.coords.slice(1));
    return {
      distance,
      time,
      coords,
      legs,
      start: { node: startNode, indoor: s.indoor, entrance: s.indoor ? null : this.entrances(from.building.id).find((e) => e.node === startNode) },
      end: { node: goal, indoor: t.indoor, entrance: t.indoor ? null : this.entrances(to.building.id).find((e) => e.node === goal) },
    };
  }
}

/** Great-circle distance in metres. */
export function haversine([lat1, lon1], [lat2, lon2]) {
  const R = 6371000;
  const r = Math.PI / 180;
  const dLat = (lat2 - lat1) * r;
  const dLon = (lon2 - lon1) * r;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * r) * Math.cos(lat2 * r) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

/** Compass direction (N, NE, …) of point p as seen from centre c. */
export function compass(c, p) {
  const k = Math.cos((c[0] * Math.PI) / 180);
  const ang = (Math.atan2((p[1] - c[1]) * k, p[0] - c[0]) * 180) / Math.PI;
  return ["N", "NE", "E", "SE", "S", "SW", "W", "NW"][Math.round(((ang + 360) % 360) / 45) % 8];
}
