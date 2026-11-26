// Ember Ridge terrain: one seeded valley, a winding river, a road, a town and
// three airstrips. The heightfield is baked once into a grid, so sampling it is
// a bilinear lookup and the renderer stays fast enough for a smooth game.
import { WORLD } from './config.js';
import { clamp, fbm, hash2, lerp, smoothstep } from './random.js';

export const RIVER_X = (z) => -250 + 130 * Math.sin(z * 0.0011) + 60 * Math.sin(z * 0.00037 + 2.1);
export const ROAD_X = (z) => 150 + 45 * Math.sin(z * 0.0009 + 0.7);

// The three airstrips: { x, z, length, width, name }. Runways run along +z.
export const STRIPS = [
  { x: 0, z: 520, length: 420, width: 36, name: 'RIDGEFIELD', pad: 26 },
  { x: 250, z: 2300, length: 380, width: 34, name: 'MILLTOWN', pad: 30 },
  { x: -350, z: 3350, length: 360, width: 34, name: 'HIGHLAKE', pad: 34 },
];

export const TOWN = { x0: 120, x1: 480, z0: 2080, z1: 2520 };
export const BEACON = { x: -820, z: 3620, pad: 40 };

const SEED = 20261126;

function baseHeight(x, z) {
  // Rolling hills with real relief, so the valley reads from the air — but
  // the valley floor itself stays gentle, or the airstrips would sit in pits
  // no approach could descend into.
  const valley = 0.35 + 0.65 * smoothstep(Math.abs(x), 100, 900);
  let h = 14 + 92 * fbm(x, z, 380, SEED, 3) * valley;
  // Canyon walls rise with |x|, close enough to see from the course.
  const wall = smoothstep(Math.abs(x), 800, 1400);
  h += wall * (170 + 120 * fbm(x, z, 240, SEED + 7, 3));
  // A ridge line across the far north, where the rescue beacon sits.
  const ridge = smoothstep(z, 3300, 3700);
  h += ridge * 70 * (0.6 + 0.4 * fbm(x, z, 300, SEED + 13, 2));
  // Carve the river down to the water.
  const rx = RIVER_X(z);
  const river = smoothstep(Math.abs(x - rx), 70, 22);
  h = lerp(h, 8, river);
  return h;
}

function flattenPads(x, z, h) {
  // Keep every strip and the town level so landings and the town read cleanly.
  for (const s of STRIPS) {
    const dx = Math.abs(x - s.x) / (s.width / 2 + 46);
    const dz = Math.abs(z - s.z) / (s.length / 2 + 46);
    const d = Math.max(dx, dz);
    if (d < 1) h = lerp(s.pad, h, d * d * (3 - 2 * d));
  }
  if (x > TOWN.x0 - 30 && x < TOWN.x1 + 30 && z > TOWN.z0 - 30 && z < TOWN.z1 + 30) {
    const d = Math.max(
      (TOWN.x0 - 30 - x) / 30, (x - TOWN.x1 - 30) / 30,
      (TOWN.z0 - 30 - z) / 30, (z - TOWN.z1 - 30) / 30, 0,
    );
    h = lerp(34, h, clamp(d, 0, 1));
  }
  const bd = Math.hypot(x - BEACON.x, z - BEACON.z) / (BEACON.pad + 30);
  if (bd < 1) h = lerp(96, h, bd * bd * (3 - 2 * bd));
  return h;
}

function stripAt(x, z) {
  for (const s of STRIPS) {
    if (Math.abs(x - s.x) < s.width / 2 + 2 && Math.abs(z - s.z) < s.length / 2 + 2) return s;
  }
  return null;
}

function townBlock(x, z) {
  if (x < TOWN.x0 || x > TOWN.x1 || z < TOWN.z0 || z > TOWN.z1) return -1;
  const bx = Math.floor((x - TOWN.x0) / 34);
  const bz = Math.floor((z - TOWN.z0) / 34);
  return hash2(bx, bz, SEED + 31);
}

// Colour of one terrain cell, before fog: [r, g, b] 0..255.
function cellColor(x, z, h, slope) {
  const rx = RIVER_X(z);
  if (Math.abs(x - rx) < 24 && h <= WORLD.waterLevel + 1.5) {
    const shimmer = 0.9 + 0.25 * hash2(Math.floor(x / 6), Math.floor(z / 6), SEED + 41);
    return [74 * shimmer, 128 * shimmer, 178 * shimmer];
  }
  const strip = stripAt(x, z);
  if (strip) {
    if (Math.abs(x - strip.x) < 1.2) return [214, 208, 190]; // centreline
    const dz = Math.abs(z - strip.z);
    if (dz > strip.length / 2 - 14 && Math.abs(x - strip.x) < strip.width / 2 - 3) return [206, 200, 182];
    return [46, 46, 52]; // asphalt
  }
  const road = Math.abs(x - ROAD_X(z));
  if (road < 4) return [74, 70, 66];
  const block = townBlock(x, z);
  if (block >= 0) {
    if (block < 0.55) return [168, 122, 88]; // terracotta roofs
    if (block < 0.8) return [122, 128, 138]; // slate roofs
    return [196, 186, 158]; // pale walls
  }
  // Grass and rock by height, shaded by slope so ridges read in the dusk.
  let r; let g; let b;
  if (h < 40) { r = 106; g = 122; b = 63; }
  else if (h < 120) { r = 125; g = 107; b = 63; }
  else if (h < 220) { r = 112; g = 96; b = 74; }
  else if (h < 300) { r = 104; g = 94; b = 86; }
  else { r = 168; g = 158; b = 146; } // high rock, almost snow in the last light
  const shade = clamp(1 - slope * 1.4, 0.55, 1.15);
  // Warm dusk light from the west (-x): west-facing slopes glow.
  const west = clamp(1 - slope * 0.4, 0.8, 1.12);
  return [r * shade * west, g * shade * west, b * shade * west];
}

export class Terrain {
  constructor() {
    this.cols = Math.round((WORLD.maxX - WORLD.minX) / WORLD.cell) + 1;
    this.rows = Math.round((WORLD.maxZ - WORLD.minZ) / WORLD.cell) + 1;
    this.height = new Float32Array(this.cols * this.rows);
    this.color = new Uint8Array(this.cols * this.rows * 3);
    for (let iz = 0; iz < this.rows; iz += 1) {
      const z = WORLD.minZ + iz * WORLD.cell;
      for (let ix = 0; ix < this.cols; ix += 1) {
        const x = WORLD.minX + ix * WORLD.cell;
        let h = flattenPads(x, z, baseHeight(x, z));
        const idx = iz * this.cols + ix;
        this.height[idx] = h;
        // Slope from the neighbour 2 cells east: drives the shading.
        const hx = flattenPads(x + WORLD.cell * 2, z, baseHeight(x + WORLD.cell * 2, z));
        const slope = (hx - h) / (WORLD.cell * 2);
        const c = cellColor(x, z, h, slope);
        this.color[idx * 3] = c[0];
        this.color[idx * 3 + 1] = c[1];
        this.color[idx * 3 + 2] = c[2];
      }
    }
  }

  /** Bilinear height at any (x, z); outside the map the edge height holds. */
  heightAt(x, z) {
    const gx = clamp((x - WORLD.minX) / WORLD.cell, 0, this.cols - 1.001);
    const gz = clamp((z - WORLD.minZ) / WORLD.cell, 0, this.rows - 1.001);
    const ix = Math.floor(gx);
    const iz = Math.floor(gz);
    const fx = gx - ix;
    const fz = gz - iz;
    const i = iz * this.cols + ix;
    const a = this.height[i];
    const b = this.height[i + 1];
    const c = this.height[i + this.cols];
    const d = this.height[i + this.cols + 1];
    return a + (b - a) * fx + (c - a) * fz + (a - b - c + d) * fx * fz;
  }

  /** Nearest-cell colour at (x, z) as [r, g, b]. */
  colorAt(x, z) {
    const ix = clamp(Math.round((x - WORLD.minX) / WORLD.cell), 0, this.cols - 1);
    const iz = clamp(Math.round((z - WORLD.minZ) / WORLD.cell), 0, this.rows - 1);
    const i = (iz * this.cols + ix) * 3;
    return [this.color[i], this.color[i + 1], this.color[i + 2]];
  }

  stripAt(x, z) {
    return stripAt(x, z);
  }

  isWater(x, z) {
    return Math.abs(x - RIVER_X(z)) < 20 && this.heightAt(x, z) <= WORLD.waterLevel + 1.5;
  }
}
