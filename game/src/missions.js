// Missions: three different ways to fly the same valley. Each one has its own
// rings, its own goal and its own wind, so a sortie is a decision, not a lap.
import { SCORING } from './config.js';
import { BEACON, STRIPS } from './terrain.js';
import { clamp } from './random.js';

function ring(x, y, z, r, fuel = 0) {
  return { x, y, z, r, fuel, passed: false, missed: false };
}

// Every ring hangs at least 45 m above the ground beneath it, so no ring is
// ever buried in a hill the pilot cannot see through.
function ringAbove(terrain, x, y, z, r, fuel = 0) {
  const ground = terrain ? terrain.heightAt(x, z) : 30;
  return ring(x, Math.max(y, ground + 45 + r * 0.5), z, r, fuel);
}

// Ring Run: fourteen rings weaving down the valley, best time wins.
function ringRunRings(terrain) {
  const rings = [];
  for (let i = 0; i < 14; i += 1) {
    const z = 380 + i * 235;
    const x = 250 * Math.sin(z * 0.0011) + 90 * Math.sin(z * 0.0029 + 1.3);
    const y = 95 + 40 * Math.sin(z * 0.0016 + 0.4);
    rings.push(ringAbove(terrain, x, y, z, 20));
  }
  return rings;
}

// Mail Run: six rings on the way, three landings that pay the mail.
function mailRings(terrain) {
  return [
    ringAbove(terrain, -180, 95, 900, 22), ringAbove(terrain, 320, 120, 1500, 22),
    ringAbove(terrain, -60, 100, 1950, 22), ringAbove(terrain, 420, 115, 2650, 22),
    ringAbove(terrain, -220, 130, 3050, 22), ringAbove(terrain, -420, 110, 3450, 22),
  ];
}

// Dusk Rescue: ten rings climb to the beacon ridge; each one is fuel.
function rescueRings(terrain) {
  const rings = [];
  for (let i = 0; i < 10; i += 1) {
    const t = i / 9;
    rings.push(ringAbove(terrain,
      -120 - 620 * t + 90 * Math.sin(i * 1.7),
      95 + 85 * t,
      700 + 2850 * t,
      22, 6,
    ));
  }
  rings.push(ringAbove(terrain, BEACON.x, 150, BEACON.z, 34, 0));
  return rings;
}

export function buildMission(id, terrain) {
  // The plane spawns 45 m above the ground beneath it: the valley floor is
  // uneven, and a fixed start height can put the plane inside a hill.
  const spawnY = (x, z) => (terrain ? terrain.heightAt(x, z) : 40) + 45;
  if (id === 'mail') {
    return {
      id, name: 'MAIL RUN', goal: 'Land at all three strips',
      rings: mailRings(terrain),
      landings: STRIPS.map((s) => ({ ...s, done: false })),
      windBase: 3, gust: 3, fuel: 200,
      start: { x: 0, y: spawnY(0, 120), z: 120, heading: 0 },
    };
  }
  if (id === 'rescue') {
    return {
      id, name: 'DUSK RESCUE', goal: 'Fly the beacon ring before dark',
      rings: rescueRings(terrain),
      landings: [],
      windBase: 6, gust: 8, fuel: 62,
      start: { x: -60, y: spawnY(-60, 120), z: 120, heading: 0 },
    };
  }
  return {
    id: 'rings', name: 'RING RUN', goal: '14 rings, fastest time',
    rings: ringRunRings(terrain),
    landings: [],
    windBase: 2, gust: 2, fuel: 100,
    start: { x: 0, y: spawnY(0, 120), z: 120, heading: 0 },
  };
}

/** Wind at sim time `t` for a mission: a base westerly plus gusts. */
export function windAt(mission, t) {
  const g = mission.gust;
  return {
    x: -(mission.windBase + g * (0.5 + 0.5 * Math.sin(t * 0.31) * Math.sin(t * 0.13 + 2))),
    z: g * 0.4 * Math.sin(t * 0.21 + 1),
    lift: g * 0.9 * Math.sin(t * 0.47) * Math.sin(t * 0.19 + 0.5),
  };
}

export function nextRing(mission) {
  return mission.rings.find((r) => !r.passed && !r.missed) ?? null;
}

/**
 * Score a ring crossing. Returns { points, centre } or null when the plane
 * missed the ring (crossed its plane outside the circle).
 */
export function crossRing(mission, plane, prevZ) {
  const r = nextRing(mission);
  if (!r) return null;
  if (prevZ < r.z === plane.z < r.z) return null; // did not cross the plane
  const dx = plane.x - r.x;
  const dy = plane.y - r.y;
  const dist = Math.hypot(dx, dy);
  if (dist > r.r) {
    r.missed = true;
    return { points: 0, centre: 0, missed: true };
  }
  r.passed = true;
  const centre = clamp(1 - dist / r.r, 0, 1);
  return { points: SCORING.ringBase, centre, missed: false, fuel: r.fuel };
}

export function missionDone(mission) {
  if (mission.id === 'rings') return mission.rings.every((r) => r.passed || r.missed);
  if (mission.id === 'mail') return mission.landings.every((l) => l.done);
  const last = mission.rings[mission.rings.length - 1];
  return last.passed;
}

export function ringsPassed(mission) {
  return mission.rings.filter((r) => r.passed).length;
}

export function ringsTotal(mission) {
  return mission.rings.length;
}
