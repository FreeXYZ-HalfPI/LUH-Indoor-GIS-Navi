// @license magnet:?xt=urn:btih:1f739d935676111cfff4b4693e3816e664797050&dn=gpl-3.0.txt GPL-v3-or-later
// SPDX-License-Identifier: GPL-3.0-or-later
// The hidden tag at the start of a direction step: where the step happens, so the map can
// show a numbered marker for it. The tag carries the floor N (tapping the step shows that
// floor), the place [lat, lon] and the floor the marker belongs to (no floor: outdoors, the
// marker is always shown).

// A name that ends with a degree ("M. Sc.") already ends the sentence: avoid "M. Sc.."
export const endSentence = (s) => s.replace(/\.(<\/b>)?\.(?=<ol|$)/, ".$1");

const STEP_TAG = /^<i( data-floor="-?\d+")?( data-at="[^"]*")?( data-ml="-?\d+")? hidden><\/i>/;

export const stepTag = ({ floor, at, level }) =>
  `<i${floor != null ? ` data-floor="${floor}"` : ""}${at ? ` data-at="${at[0]},${at[1]}"` : ""}${at && level != null ? ` data-ml="${level}"` : ""} hidden></i>`;

export const floorTag = (level) => stepTag({ floor: level });

/** {body, floor, at: [lat, lon] | null, level} of a step sentence (see stepTag). */
export function parseStep(s) {
  const m = s.match(STEP_TAG);
  const attr = (k) => m?.[0].match(new RegExp(`data-${k}="([^"]*)"`))?.[1];
  const at = attr("at")?.split(",").map(Number) ?? null;
  return {
    body: endSentence(s.replace(STEP_TAG, "")),
    floor: attr("floor") != null ? Number(attr("floor")) : null,
    at,
    level: attr("ml") != null ? Number(attr("ml")) : null,
  };
}

/** The same step, now placed at a point (keeps its floor). */
export const placeStep = (s, at, level) => stepTag({ floor: parseStep(s).floor, at, level }) + s.replace(STEP_TAG, "");
