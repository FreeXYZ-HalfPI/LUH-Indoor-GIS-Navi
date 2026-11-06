// @license magnet:?xt=urn:btih:1f739d935676111cfff4b4693e3816e664797050&dn=gpl-3.0.txt GPL-v3-or-later
// SPDX-License-Identifier: GPL-3.0-or-later
// Settings a fork or a host may want to change without touching the app code.

// Background map. The public OpenStreetMap server is fine for a prototype, but
// its tile usage policy forbids heavy production use. To self-host or use another
// provider, change TILE_URL (any "{z}/{x}/{y}" raster tile URL) and the attribution.
// https://operations.osmfoundation.org/policies/tiles/
export const TILE_URL = "https://tile.openstreetmap.org/{z}/{x}/{y}.png";
export const TILE_ATTRIBUTION = '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>';
export const TILE_MAX_NATIVE_ZOOM = 19;
// @license-end
