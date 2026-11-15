// SPDX-License-Identifier: GPL-3.0-or-later
// Checks the list of background maps in web/js/config.js (run: node --test "tests/js/*.test.mjs").
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { BASEMAPS } from "../../web/js/config.js";

test("every background map is complete and its place in the picker is valid", () => {
  const ids = new Set();
  for (const b of BASEMAPS) {
    assert.ok(/^[a-z0-9-]+$/.test(b.id) && !ids.has(b.id), `${b.id}: id`);
    ids.add(b.id);
    assert.ok(["raster", "vector"].includes(b.kind), `${b.id}: kind`);
    assert.ok(["germany", "world", "vector"].includes(b.group), `${b.id}: group`);
    assert.ok(b.name.en && b.name.de && b.note.en && b.note.de, `${b.id}: texts in both languages`);
    assert.ok(b.attribution && /<a /.test(b.attribution), `${b.id}: attribution with a link (providers require it)`);
    assert.equal(b.swatch.length, 3, `${b.id}: three swatch colours`);
    assert.equal(b.kind === "vector", b.group === "vector", `${b.id}: vector maps are the vector group`);
  }
});

test("raster maps have a https tile URL with {z}/{x}/{y}; vector maps a https style URL", () => {
  for (const b of BASEMAPS) {
    if (b.kind === "raster") {
      assert.match(b.url, /^https:\/\//, b.id);
      for (const k of ["{z}", "{x}", "{y}"]) assert.ok(b.url.includes(k), `${b.id}: ${k}`);
      assert.ok(Number.isInteger(b.maxNativeZoom) && b.maxNativeZoom >= 15 && b.maxNativeZoom <= 22, `${b.id}: maxNativeZoom`);
    } else {
      assert.match(b.style, /^https:\/\/.+\/styles\//, b.id);
    }
  }
});

test("the default map is OpenStreetMap, and MapLibre is vendored with its licenses", () => {
  assert.equal(BASEMAPS[0].id, "osm");
  const dir = new URL("../../web/vendor/maplibre/", import.meta.url);
  for (const f of ["maplibre-gl.js", "maplibre-gl.css", "leaflet-maplibre-gl.js", "LICENSE-maplibre-gl.txt", "LICENSE-maplibre-gl-leaflet.txt"]) {
    assert.ok(existsSync(new URL(f, dir)), `${f} missing`);
  }
  for (const f of ["maplibre-gl.js", "leaflet-maplibre-gl.js"]) {
    assert.match(readFileSync(new URL(f, dir), "utf8").slice(0, 400), /@license magnet:/, `${f}: LibreJS header`);
  }
});
