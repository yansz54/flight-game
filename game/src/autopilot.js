// Autopilot: flies the real rules toward a target, so a staged screenshot is
// a frame of a game really being played, never a posed picture. It steers for
// the next ring, climbs when the ground ahead is high, and can fly a landing.
import { GEAR_DOWN_SPEED } from './plane.js';
import { clamp, wrapAngle } from './random.js';
import { nextRing } from './missions.js';

/**
 * Steer toward a point: returns { pitch, roll, throttle, yaw } in [-1, 1].
 * `clearance` is how far above the ground ahead the pilot stays; landings
 * call with a small one so the glide slope can actually reach the strip.
 */
export function steerTo(plane, tx, ty, tz, terrain, throttle = 0.68, clearance = 42) {
  const dx = tx - plane.x;
  const dz = tz - plane.z;
  const dist = Math.hypot(dx, dz);
  const wantHeading = Math.atan2(dx, dz);
  const dHeading = wrapAngle(wantHeading - plane.heading);
  // Bank into the turn with a coordinated-turn controller: ask for a turn
  // rate proportional to the heading error, then bank exactly enough for
  // that rate. A plain proportional bank oscillates and overshoots the
  // centreline; this one settles on it.
  const turnRate = clamp(dHeading * 0.9, -0.3, 0.3);
  const roll = clamp(Math.atan((turnRate * plane.speed) / 9.81), -0.9, 0.9);
  // Pitch for the target height, with a look-ahead climb over high ground.
  const ahead = terrain.heightAt(
    plane.x + Math.sin(plane.heading) * 160,
    plane.z + Math.cos(plane.heading) * 160,
  );
  const wantY = Math.max(ty, ahead + clearance);
  const dy = wantY - plane.y;
  const pitch = clamp(dy / 65, -1, 1);
  // Slow down when close to a landing target.
  const thr = dist < 260 ? Math.min(throttle, 0.42) : throttle;
  return { pitch, roll, throttle: (thr - plane.throttle) * 2.4, yaw: clamp(-dHeading * 0.2, -1, 1) };
}

/** Fly the mission: next ring, or the next strip to land on. */
export function flyMission(world) {
  const { plane, mission, terrain } = world;
  if (mission.id === 'mail') {
    const strip = mission.landings.find((l) => !l.done);
    if (strip) {
      const d = Math.hypot(strip.x - plane.x, strip.z - plane.z);
      // Every strip runs north-south, so every landing must be flown from
      // the south, along the strip. A plane arriving from the east or west
      // crosses the strip sideways and lands in the hills beside it.
      // The approach is a long straight final: the fix sits 1000 m south
      // of the strip, and the glide slope engages as soon as the plane is
      // in the corridor heading north, however far out — so a plane that
      // turns onto final at the fix flies straight in instead of orbiting
      // a point. A plane crossing the corridor sideways at 50 m/s has a
      // turn radius of ~200 m, so it must go around to the fix and come
      // back heading north; the glide slope never tries to catch it.
      const inCorridor = Math.abs(plane.x - strip.x) < 300
        && plane.z < strip.z + strip.length / 2 && plane.z > strip.z - 1400;
      const headingNorth = Math.abs(wrapAngle(plane.heading)) < 1.0;
      if (d < 1500 && (!inCorridor || !headingNorth)) {
        // Route to the approach fix: on the centreline, 1000 m south of the
        // strip, at a slower speed so the turn onto final is a tight one.
        // A closer fix does not leave room for the turn onto final at
        // approach speed, and the plane orbits instead of landing.
        return steerTo(plane, strip.x, strip.pad + 80, strip.z - 1000, terrain, 0.45, 42);
      }
      if (inCorridor && headingNorth) {
        // Final approach on a glide slope: the target height falls as the
        // threshold nears, so the plane descends onto the strip itself. The
        // heading target is a point ahead on the centreline, not the strip
        // centre: chasing the centre makes the plane turn across the runway
        // as it passes it. The carrot stretches with the lateral error, so
        // a plane 150 m off the line turns gently onto it instead of
        // over-banking and orbiting; close in, the short carrot holds the
        // line against the crosswind.
        const threshold = strip.z - strip.length / 2;
        const distToThreshold = Math.max(0, threshold - plane.z);
        // Over the strip itself, aim below the pad: the touchdown fires when
        // the plane sinks to pad + 1.6, and a target of pad + 2 holds it
        // 0.4 m above that forever while it flies off the far end. Before
        // the threshold, stay on the slope above the approach corridor.
        const overStrip = terrain.stripAt(plane.x, plane.z)?.name === strip.name;
        const wantY = overStrip
          ? strip.pad - 2
          : strip.pad + Math.max(2, distToThreshold * 0.12);
        const carrot = Math.max(80, Math.abs(strip.x - plane.x) * 2);
        const ctrl = steerTo(plane, strip.x, wantY, plane.z + carrot, terrain, 0.35, 0);
        // Only in the last metres above the strip, level the wings for
        // touchdown: a banked landing is a crash. Damping any earlier cripples
        // the approach and the plane lands beside the strip.
        if (plane.y < strip.pad + 4) ctrl.roll *= 0.35;
        return ctrl;
      }
      // En route: fly the next ring, or the fix if the rings are done.
      const ring = nextRing(mission);
      if (ring) return steerTo(plane, ring.x, ring.y, ring.z, terrain, 0.7, 42);
      return steerTo(plane, strip.x, strip.pad + 75, strip.z - 450, terrain, 0.55, 42);
    }
  }
  const r = nextRing(mission);
  if (r) return steerTo(plane, r.x, r.y, r.z, terrain, 0.7);
  return { pitch: 0, roll: 0, throttle: 0, yaw: 0 };
}

/** True when the plane is on a final approach to a strip. */
export function onApproach(world) {
  const { plane, mission } = world;
  if (mission.id !== 'mail') return false;
  const strip = mission.landings.find((l) => !l.done);
  if (!strip) return false;
  const d = Math.hypot(strip.x - plane.x, strip.z - plane.z);
  return d < 900 && plane.speed < GEAR_DOWN_SPEED + 12;
}
