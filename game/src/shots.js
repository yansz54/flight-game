// The screenshot scenes behind ?shot=cover|cockpit|title|landing. Each one
// plays the real rules forward from a fresh world for a fixed number of steps,
// steered by the autopilot, so the frame is what a short game really looks
// like and the same seed always gives the same frame.
import { flyMission } from './autopilot.js';

const STEP = 1 / 60;
const COVER_SECONDS = 18;
const COCKPIT_SECONDS = 22;
const LANDING_LIMIT_SECONDS = 180;

/** Run the autopilot for `seconds` of sim time, one fixed step at a time. */
function autoFly(world, seconds) {
  const steps = Math.round(seconds / STEP);
  for (let i = 0; i < steps; i += 1) {
    if (world.screen !== 'play') break;
    world.step(STEP, flyMission(world), true);
  }
}

/**
 * Set `world` to the named scene (cover, cockpit, title or landing) and
 * return the screen to draw over it.
 */
export function stageShot(name, world) {
  if (name === 'title') {
    world.reset('rings');
    world.screen = 'title';
    return { screen: 'title' };
  }
  if (name === 'cockpit') {
    world.reset('rings');
    world.view = 'cockpit';
    autoFly(world, COCKPIT_SECONDS);
    return { screen: 'play' };
  }
  if (name === 'landing') {
    world.reset('mail');
    world.view = 'chase';
    // Fly until the first strip is landed on, or the limit runs out: either
    // way the frame shows a low final approach over a lit runway.
    const steps = Math.round(LANDING_LIMIT_SECONDS / STEP);
    for (let i = 0; i < steps; i += 1) {
      if (world.screen !== 'play') break;
      world.step(STEP, flyMission(world), true);
      if (world.plane.onGround) {
        // Roll a little further down the strip for a settled frame.
        for (let j = 0; j < 45; j += 1) world.step(STEP, { pitch: 0, roll: 0, throttle: -0.4, yaw: 0 }, true);
        break;
      }
    }
    return { screen: 'play' };
  }
  // cover
  world.reset('rings');
  world.view = 'chase';
  autoFly(world, COVER_SECONDS);
  return { screen: 'play' };
}
