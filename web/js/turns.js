// SPDX-License-Identifier: GPL-3.0-or-later
// Turn-by-turn instructions from a route line: "walk 12 steps, turn left, walk 30 steps, …".
//
// The line comes from pixel paths and OSM ways, so it is full of small bends that
// nobody would call a turn. The line is first straightened into "runs" (pieces a
// person walks without thinking about direction), then the angle between two runs
// says left, right or straight on.

// Bends below this angle are not turns: corridors and footpaths wiggle.
const STRAIGHT_DEG = 25;
// Up to here a turn is "slight", above SHARP_DEG it is "sharp", above UTURN_DEG you turn around.
const SLIGHT_DEG = 50;
const SHARP_DEG = 135;
const UTURN_DEG = 165;

/** [lat, lon] pairs → local east/north metres around the first point (flat earth is fine for a campus). */
function toMetres(coords) {
  const [lat0, lon0] = coords[0];
  const k = Math.cos((lat0 * Math.PI) / 180);
  return coords.map(([lat, lon]) => [(lon - lon0) * 111320 * k, (lat - lat0) * 111320]);
}

const heading = (a, b) => (Math.atan2(b[0] - a[0], b[1] - a[1]) * 180) / Math.PI; // 0° = north, clockwise
const length = (a, b) => Math.hypot(b[0] - a[0], b[1] - a[1]);
/** Signed change of direction from heading h1 to h2, in (-180, 180]; positive = to the right. */
const delta = (h1, h2) => ((h2 - h1 + 540) % 360) - 180;

/**
 * Straighten a line into runs [{from, to, length}] (indices into pts).
 * A point joins the current run while the run, measured from its start, keeps
 * its direction. The chord (start → current point) is used instead of the last
 * segment, so many small wiggles cannot add up to a turn unnoticed.
 */
function straighten(pts) {
  const runs = [];
  let start = 0;
  for (let i = 1; i < pts.length; i++) {
    if (i - start < 2) continue; // a run needs two segments before it can bend
    const runHeading = heading(pts[start], pts[i - 1]);
    if (Math.abs(delta(runHeading, heading(pts[i - 1], pts[i]))) > STRAIGHT_DEG) {
      runs.push({ from: start, to: i - 1 });
      start = i - 1;
    }
  }
  runs.push({ from: start, to: pts.length - 1 });
  return runs.map((r) => ({ ...r, length: pathLength(pts, r.from, r.to) }));
}

function pathLength(pts, from, to) {
  let m = 0;
  for (let i = from; i < to; i++) m += length(pts[i], pts[i + 1]);
  return m;
}

/** Merge runs shorter than minRun into the next one (a door recess is not worth a turn). */
function dropShortRuns(pts, runs, minRun) {
  const out = [];
  for (const r of runs) {
    const prev = out[out.length - 1];
    if (prev && prev.length < minRun) {
      prev.to = r.to;
      prev.length += r.length;
    } else out.push({ ...r });
  }
  // a short last run joins the one before it
  if (out.length > 1 && out[out.length - 1].length < minRun) {
    const last = out.pop();
    out[out.length - 1].to = last.to;
    out[out.length - 1].length += last.length;
  }
  return out;
}

/** Name of a change of direction: "left", "slightRight", "sharpLeft", "uturn" or "straight". */
function turnName(d) {
  const a = Math.abs(d);
  if (a <= STRAIGHT_DEG) return "straight";
  if (a > UTURN_DEG) return "uturn";
  const side = d > 0 ? "Right" : "Left";
  if (a <= SLIGHT_DEG) return `slight${side}`;
  if (a > SHARP_DEG) return `sharp${side}`;
  return side.toLowerCase();
}

/**
 * Turn-by-turn steps of a route line.
 * Returns [{turn, metres}]: the first step has turn null (the walker's direction
 * at the start is unknown), the others say how to turn before walking `metres`.
 * minRun: shortest straight piece worth its own step (indoors a few metres, outdoors more).
 */
export function turnSteps(coords, minRun) {
  if (!coords || coords.length < 2) return [];
  const pts = toMetres(coords);
  const runs = dropShortRuns(pts, straighten(pts), minRun);
  const steps = [];
  runs.forEach((r, i) => {
    const turn = i === 0 ? null : turnName(delta(heading(pts[runs[i - 1].from], pts[runs[i - 1].to]), heading(pts[r.from], pts[r.to])));
    const prev = steps[steps.length - 1];
    if (turn === "straight" && prev) prev.metres += r.length; // no instruction for "keep going"
    else steps.push({ turn, metres: r.length });
  });
  return steps;
}
