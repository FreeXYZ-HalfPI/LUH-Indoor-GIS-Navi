// SPDX-License-Identifier: GPL-3.0-or-later
// How far the indoor part of a route can be trusted, floor by floor.
//
// Indoor graphs are traced from floor plans, so every floor starts out
// "approximate". After a field test a maintainer marks the floor as verified
// in source.json ("verified": {"000": "2026-11-20"}); tools/build_indoor.py
// writes that date into the floor's entry in the app data (levels[n].verified).

/**
 * The floors an indoor route walks on, in route order, each once:
 * [{building, level, verified}] with verified = date of the on-site check or null.
 * legs: WalkGraph.legs(); indoor: WalkGraph.indoor.
 */
export function routeFloors(legs, indoor) {
  const floors = new Map();
  for (const leg of legs) {
    if (leg.kind !== "indoor") continue;
    const key = `${leg.building}:${leg.level}`;
    if (!floors.has(key)) {
      const verified = indoor[leg.building]?.levels?.[String(leg.level)]?.verified ?? null;
      floors.set(key, { building: leg.building, level: leg.level, verified });
    }
  }
  return [...floors.values()];
}

/** "verified" when every floor was checked on site, "approximate" when none was, "mixed" otherwise; null without indoor floors. */
export function confidence(floors) {
  if (!floors.length) return null;
  const ok = floors.filter((f) => f.verified).length;
  return ok === floors.length ? "verified" : ok === 0 ? "approximate" : "mixed";
}
