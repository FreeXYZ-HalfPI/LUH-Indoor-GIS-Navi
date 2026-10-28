// SPDX-License-Identifier: GPL-3.0-or-later
// On-device routing on the outdoor walk graph (tools/build_walk_graph.py) merged
// with indoor graphs (tools/build_indoor.py). One Dijkstra, door to door.
//
// Why one merged graph and not "outdoor route + indoor route": the best
// entrance depends on where the room is. With both in one graph, Dijkstra
// picks the entrance itself, and no special cases are needed.

// Edge flags, a bit field. 1, 2, 4 and 8 come from the Python tools
// (build_walk_graph.py, build_indoor.py); 16 and 32 are only set here, when graphs are merged.
export const STEPS = 1; // outdoor steps or indoor stairs
const LINK = 2; // outdoor: entrance → path network (not used here, routed like any path; listed for completeness)
const ELEVATOR = 4;
const VERTICAL = 8; // stairs or lift between two floors
const INDOOR = 16; // edge of an indoor graph
const DOOR = 32; // outdoor entrance ↔ indoor entrance

// "Avoid steps" makes steps 20× as expensive instead of forbidding them, so a
// route still exists where steps cannot be avoided.
const AVOID_STEPS_FACTOR = 20;

/** Binary min-heap of [priority, value] pairs, the priority queue of Dijkstra. */
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
      // sift up: swap with the parent while smaller
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
      // move the last item to the root and sift it down
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

/** [x0, y0, x1, y1, …] → [[x0, y0], [x1, y1], …] */
function pairs(flat) {
  const out = [];
  for (let i = 0; i < flat.length; i += 2) out.push([flat[i], flat[i + 1]]);
  return out;
}

export class WalkGraph {
  constructor(data) {
    this.nodes = data.nodes; // [lat, lon]
    this.level = new Array(this.nodes.length).fill(null); // floor of each node; null = outdoors
    this.px = []; // plan pixels of indoor nodes, by node index (to draw the route on the floor plan)
    // [a, b, length m, flags, [lat, lon, …] shape, plan-pixel shape (indoor only)]
    this.edges = data.edges.map(([a, b, len, flags, mid]) => [a, b, len, flags, mid, null]);
    this.edgeBuilding = []; // building of each indoor/door edge (indexed like edges)
    this.buildings = data.buildings;
    this.indoor = {}; // building → {rooms, levels, size, approximate, listed}
    // adjacency list of edge indices: a node's edges are found without scanning all edges
    this.adj = Array.from({ length: this.nodes.length }, () => []);
    this.edges.forEach(([a, b], i) => {
      this.adj[a].push(i);
      this.adj[b].push(i);
    });
  }

  /** Merge a building's indoor graph and connect it at the entrances. */
  addIndoor(data) {
    const off = this.nodes.length; // indoor node i becomes node off + i
    const { lat: A, lon: B } = data.georef;
    // the affine georef from build_indoor.py: plan pixel → lat/lon without trigonometry
    const toLatLon = (x, y) => [A[0] + A[1] * x + A[2] * y, B[0] + B[1] * x + B[2] * y];
    for (const [x, y, l] of data.nodes) {
      const i = this.nodes.push(toLatLon(x, y)) - 1;
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
      const geo = pairs(mid).flatMap(([x, y]) => toLatLon(x, y));
      addEdge([a + off, b + off, len, flags | INDOOR, geo, mid]);
    }
    // Both tools write the OSM entrance coordinates unchanged, so equal numbers
    // mean "the same door"; that is the join between outside and inside.
    const outside = this.buildings[data.building]?.entrances || [];
    for (const en of data.entrances) {
      const o = outside.find((e) => e.node != null && e.lat === en.lat && e.lon === en.lon);
      if (o) addEdge([o.node, en.node + off, 1, DOOR, [], null]); // 1 m: stepping through the door
    }
    const rooms = {};
    for (const [id, n] of Object.entries(data.rooms)) rooms[id] = n + off;
    this.indoor[data.building] = {
      rooms,
      levels: data.levels,
      size: data.plan_size,
      approximate: data.approximate,
      listed: data.listed && new Set(data.listed), // a Set: looked up for every room in search results
    };
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
   * Dijkstra from several start nodes to the nearest of several goal nodes.
   * Starting from all entrances at once finds the best entrance in one search.
   * Returns {goal, hops} with hops = [[from node, to node, edge index], …], or null.
   */
  search(starts, goals, allowed, opts) {
    const n = this.nodes.length;
    const dist = new Float64Array(n).fill(Infinity); // typed arrays: the graph has >10 000 nodes
    const prevEdge = new Int32Array(n).fill(-1);
    const heap = new MinHeap();
    for (const v of starts) {
      dist[v] = 0;
      heap.push([0, v]);
    }
    let goal = -1;
    while (heap.size) {
      const [d, v] = heap.pop();
      if (d > dist[v]) continue; // an outdated heap entry (no decrease-key in this heap)
      if (goals.has(v)) {
        goal = v; // the first goal popped is the nearest one
        break;
      }
      for (const ei of this.adj[v]) {
        const [a, b, len, flags] = this.edges[ei];
        if (flags & (INDOOR | DOOR) && !allowed.has(this.edgeBuilding[ei])) continue;
        const u = a === v ? b : a;
        const cost = len * (opts.avoidSteps && flags & STEPS ? AVOID_STEPS_FACTOR : 1);
        if (d + cost < dist[u]) {
          dist[u] = d + cost;
          prevEdge[u] = ei;
          heap.push([d + cost, u]);
        }
      }
    }
    if (goal < 0) return null;

    // walk back from the goal along prevEdge
    const hops = [];
    let v = goal;
    while (prevEdge[v] >= 0) {
      const ei = prevEdge[v];
      const [a, b] = this.edges[ei];
      const u = a === v ? b : a;
      hops.push([u, v, ei]);
      v = u;
    }
    return { goal, hops: hops.reverse() };
  }

  /**
   * Split a path into legs for the directions list and the map:
   * outdoor, indoor (one per floor), vertical (stairs/lift) and door.
   */
  legs(hops) {
    const legs = [];
    let distance = 0;
    let time = 0;
    const last = () => legs[legs.length - 1];
    for (const [u, w, ei] of hops) {
      const [a, , len, flags, geo, mid] = this.edges[ei];
      if (flags & VERTICAL) {
        const type = flags & ELEVATOR ? "elevator" : "stairs";
        // several floors on the same stair are one step: "stairs from 0 to 3"
        if (last()?.kind === "vertical" && last().type === type) last().toLevel = this.level[w];
        else legs.push({ kind: "vertical", type, fromLevel: this.level[u], toLevel: this.level[w], at: this.nodes[w], building: this.edgeBuilding[ei] });
        time += len; // counts as time (its cost is "metres of walking"), not as distance
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
      // a new leg whenever we change between outdoors/indoors, floor or building
      if (!leg || leg.kind !== (indoor ? "indoor" : "outdoor") || leg.level !== level || leg.building !== building) {
        leg = { kind: indoor ? "indoor" : "outdoor", level, building, distance: 0, steps: 0, coords: [this.nodes[u]], px: indoor ? [this.px[u]] : null };
        legs.push(leg);
      }
      const pts = pairs(geo);
      const pxs = mid ? pairs(mid) : [];
      if (u !== a) {
        pts.reverse(); // geometry is stored a → b; we walk it b → a
        pxs.reverse();
      }
      leg.coords.push(...pts, this.nodes[w]);
      if (indoor) leg.px.push(...pxs, this.px[w]);
      leg.distance += len;
      if (flags & STEPS) leg.steps++;
      distance += len;
      time += len;
    }
    return { legs, distance, time };
  }

  /**
   * Shortest route between two places (see Places in rooms.js).
   * Returns {distance, time, coords, legs, start, end} or null when unreachable.
   */
  route(from, to, opts = {}) {
    const s = this.endpoints(from);
    const t = this.endpoints(to);
    if (!s.nodes.length || !t.nodes.length) return null;
    // only walk through the start and destination buildings, never through others as a shortcut
    const allowed = new Set([from.building.id, to.building.id]);
    const found = this.search(s.nodes, new Set(t.nodes), allowed, opts);
    if (!found) return null;

    const { goal, hops } = found;
    const startNode = hops.length ? hops[0][0] : goal; // no hops: start and destination are the same node
    const { legs, distance, time } = this.legs(hops);
    const coords = [this.nodes[startNode]];
    for (const l of legs) if (l.coords) coords.push(...l.coords.slice(1)); // slice: each leg repeats the previous end
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
  const R = 6371000; // mean earth radius
  const r = Math.PI / 180;
  const dLat = (lat2 - lat1) * r;
  const dLon = (lon2 - lon1) * r;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * r) * Math.cos(lat2 * r) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

/** Compass direction (N, NE, …) of point p as seen from centre c. */
export function compass(c, p) {
  const k = Math.cos((c[0] * Math.PI) / 180); // shrink longitude, so east and north use the same unit
  const ang = (Math.atan2((p[1] - c[1]) * k, p[0] - c[0]) * 180) / Math.PI; // 0° = north, clockwise
  return ["N", "NE", "E", "SE", "S", "SW", "W", "NW"][Math.round(((ang + 360) % 360) / 45) % 8];
}
