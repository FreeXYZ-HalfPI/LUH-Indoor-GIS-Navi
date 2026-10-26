// SPDX-License-Identifier: GPL-3.0-or-later
// On-device pedestrian routing on the walk graph built by tools/build_walk_graph.py.

const STEPS = 1;

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
    this.nodes = data.nodes;
    this.edges = data.edges;
    this.buildings = data.buildings;
    this.adj = Array.from({ length: this.nodes.length }, () => []);
    this.edges.forEach(([a, b], i) => {
      this.adj[a].push(i);
      this.adj[b].push(i);
    });
  }

  entrances(buildingId) {
    return (this.buildings[buildingId]?.entrances || []).filter((e) => e.node != null);
  }

  /**
   * Shortest walk from any entrance of building `from` to any entrance of building `to`.
   * opts.avoidSteps adds a heavy penalty to stairs.
   * Returns {distance, coords, fromEntrance, toEntrance, steps} or null when unreachable.
   */
  route(from, to, opts = {}) {
    const starts = this.entrances(from);
    const goals = new Map(this.entrances(to).map((e) => [e.node, e]));
    if (!starts.length || !goals.size) return null;

    const n = this.nodes.length;
    const dist = new Float64Array(n).fill(Infinity);
    const prevEdge = new Int32Array(n).fill(-1);
    const heap = new MinHeap();
    for (const s of starts) {
      dist[s.node] = 0;
      heap.push([0, s.node]);
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

    // walk back from the goal, then emit geometry start → goal
    const hops = [];
    let v = goal;
    while (prevEdge[v] >= 0) {
      const ei = prevEdge[v];
      const [a, b] = this.edges[ei];
      const u = a === v ? b : a;
      hops.push([u, v, ei]);
      v = u;
    }
    const startNode = v;
    const coords = [this.nodes[startNode]];
    let distance = 0;
    let steps = 0;
    for (const [u, w, ei] of hops.reverse()) {
      const [a, , len, flags, mid] = this.edges[ei];
      const pts = [];
      for (let i = 0; i < mid.length; i += 2) pts.push([mid[i], mid[i + 1]]);
      if (u !== a) pts.reverse(); // geometry is stored a → b
      coords.push(...pts, this.nodes[w]);
      distance += len;
      if (flags & STEPS) steps++;
    }
    return {
      distance,
      coords,
      steps,
      fromEntrance: starts.find((s) => s.node === startNode),
      toEntrance: goals.get(goal),
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
