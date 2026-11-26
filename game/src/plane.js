// The Kestrel: one small bush plane, one arcade flight model. Throttle sets
// speed, bank turns the nose, pitch trades speed for height, and below stall
// speed the wing gives up and the nose drops. Wind pushes the plane around.
import { PLANE } from './config.js';
import { clamp, wrapAngle } from './random.js';

export const GEAR_DOWN_SPEED = 55;

export function newPlane(x, y, z, heading) {
  return {
    x, y, z,
    heading, // radians, 0 = +z (north), grows clockwise
    pitch: 0,
    roll: 0,
    speed: PLANE.cruiseSpeed,
    throttle: 0.62,
    fuel: PLANE.fuelCapacity,
    damage: 0,
    gearDown: false,
    verticalSpeed: 0,
    crashed: false,
    landed: false,
    engineOut: false,
  };
}

/**
 * Advance the plane one fixed step. `ctrl` is { pitch, roll, throttle, yaw }
 * in [-1, 1] (throttle is a delta here, applied by the caller), `wind` is
 * { x, z, lift } in m/s, and `terrain` answers heightAt(x, z).
 * Returns an event string: 'stall' | 'terrain' | 'water' | null.
 */
export function stepPlane(p, ctrl, wind, terrain, dt) {
  if (p.crashed) return null;
  // Throttle: the caller feeds a -1..1 delta; holding it changes throttle.
  p.throttle = clamp(p.throttle + ctrl.throttle * dt * 0.55, 0, 1);
  if (p.fuel <= 0) {
    p.engineOut = true;
    p.throttle = 0;
  }
  // Speed chases the throttle's target; drag grows with speed.
  const target = 18 + (PLANE.maxSpeed - 18) * p.throttle;
  const accel = (target - p.speed) * 0.55 - p.speed * p.speed * PLANE.drag * 0.02;
  p.speed = Math.max(0, p.speed + accel * dt);
  // Roll and pitch answer the stick, softened near the stall.
  const authority = clamp((p.speed - 12) / 40, 0.25, 1);
  const rollTarget = ctrl.roll * PLANE.maxRoll;
  p.roll += clamp(rollTarget - p.roll, -PLANE.rollRate * authority * dt, PLANE.rollRate * authority * dt);
  const pitchTarget = ctrl.pitch * PLANE.maxPitch;
  p.pitch += clamp(pitchTarget - p.pitch, -PLANE.pitchRate * authority * dt, PLANE.pitchRate * authority * dt);
  // A slow wing drops its nose.
  if (p.speed < PLANE.stallSpeed) p.pitch -= (PLANE.stallSpeed - p.speed) * 0.006 * dt;
  p.pitch = clamp(p.pitch, -PLANE.maxPitch, PLANE.maxPitch);
  // A banked turn: banking right (roll > 0) turns the nose right, so the
  // heading grows with the bank and falls with speed.
  p.heading = wrapAngle(p.heading + Math.tan(p.roll) * 9.81 / Math.max(p.speed, 18) * dt + ctrl.yaw * PLANE.yawRate * dt);
  // Climb from pitch, sink when slow, wind on top.
  const climb = Math.sin(p.pitch) * p.speed * 0.92;
  const sink = p.speed < PLANE.stallSpeed ? (PLANE.stallSpeed - p.speed) * 0.22 : 0;
  p.verticalSpeed = climb - sink + wind.lift;
  p.y += p.verticalSpeed * dt;
  const fx = Math.sin(p.heading);
  const fz = Math.cos(p.heading);
  p.x += (fx * p.speed + wind.x) * dt;
  p.z += (fz * p.speed + wind.z) * dt;
  // Fuel burns with throttle; a dead engine glides.
  if (!p.engineOut) p.fuel = Math.max(0, p.fuel - (PLANE.fuelBurnIdle + p.throttle * PLANE.fuelBurnFull) * dt);
  p.gearDown = p.speed < GEAR_DOWN_SPEED;
  // Terrain.
  const ground = terrain.heightAt(p.x, p.z);
  if (p.y <= ground + 1.6) {
    p.y = ground + 1.6;
    return terrain.isWater(p.x, p.z) ? 'water' : 'terrain';
  }
  if (p.speed < PLANE.stallSpeed - 6) return 'stall';
  return null;
}

/** Airspeed in knots, for the instruments. */
export function knots(p) {
  return Math.round(p.speed * 1.94384);
}

/** Altitude in feet above the valley floor. */
export function feet(p) {
  return Math.round(p.y * 3.28084);
}

/** Compass heading in degrees, 0 = north. */
export function headingDeg(p) {
  return Math.round(((p.heading * 180) / Math.PI) % 360 + 360) % 360;
}
