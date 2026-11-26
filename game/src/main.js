// Ember Ridge — Ring Runner. The world: one plane, one valley, three missions,
// and the loop that ties input, physics, scoring and rendering together.
import { MISSIONS, SCORING } from './config.js';
import { Terrain } from './terrain.js';
import { buildMission, crossRing, missionDone, nextRing, ringsPassed, ringsTotal, windAt } from './missions.js';
import { feet, headingDeg, knots, newPlane, stepPlane } from './plane.js';
import { renderWorld, titleCards } from './render.js';
import { stageShot } from './shots.js';
import { Input } from './input.js';
import { AudioBus } from './audio.js';

const STEP = 1 / 60;

function loadBest() {
  try {
    return JSON.parse(localStorage.getItem('ember-ridge-best') ?? '{}');
  } catch {
    return {};
  }
}

function saveBest(best) {
  try {
    localStorage.setItem('ember-ridge-best', JSON.stringify(best));
  } catch {
    // A browser that forgets scores still plays fine.
  }
}

export function createWorld(seed = 1) {
  const terrain = new Terrain();
  const world = {
    terrain,
    missions: MISSIONS,
    best: loadBest(),
    seed,
    view: 'chase',
    screen: 'title',
    time: 0,
    score: 0,
    streak: 0,
    messages: [],
    hoverMission: null,
    crashReason: null,
    completeTitle: null,
    summaryLines: null,
    mission: buildMission('rings', terrain),
    plane: null,
    lastStallSay: -10,

    reset(missionId) {
      this.mission = buildMission(missionId, this.terrain);
      const s = this.mission.start;
      this.plane = newPlane(s.x, s.y, s.z, s.heading);
      this.plane.fuel = this.mission.fuel;
      this.plane.onGround = false;
      this.view = 'chase';
      this.screen = 'play';
      this.time = 0;
      this.score = 0;
      this.streak = 0;
      this.messages = [];
      this.crashReason = null;
      this.completeTitle = null;
      this.summaryLines = null;
    },

    say(text, color = '#dffaff') {
      this.messages.push({ text, at: this.time, color });
      if (this.messages.length > 4) this.messages.shift();
    },

    /** One fixed step of the live game. `ctrl` is the stick; `auto` skips input. */
    step(dt, ctrl, auto = false) {
      if (this.screen !== 'play') return;
      const p = this.plane;
      const m = this.mission;
      this.time += dt;
      const wind = windAt(m, this.time);
      const prevZ = p.z;
      if (p.onGround) {
        // Taxi: throttle rolls the plane, pitch lifts it off past stall speed.
        p.throttle = Math.max(0, Math.min(1, p.throttle + ctrl.throttle * dt * 0.55));
        const target = 18 + (95 - 18) * p.throttle;
        p.speed += (target - p.speed) * 0.4 * dt;
        p.heading += -p.roll * 0.1 * dt;
        p.roll += (ctrl.roll * 0.3 - p.roll) * 2 * dt;
        p.x += Math.sin(p.heading) * p.speed * dt;
        p.z += Math.cos(p.heading) * p.speed * dt;
        p.y = this.terrain.heightAt(p.x, p.z) + 1.6;
        if (p.speed > 34 && ctrl.pitch > 0.25) {
          p.onGround = false;
          p.y += 1;
          this.say('AIRBORNE', '#8ff7ff');
        }
        return;
      }
      const event = stepPlane(p, ctrl, wind, this.terrain, dt);
      if (event === 'stall' && this.time - this.lastStallSay > 3) {
        this.lastStallSay = this.time;
        this.say('STALL — NOSE DOWN, THROTTLE UP', '#ff5a40');
      }
      if (event === 'terrain' || event === 'water') {
        const strip = this.terrain.stripAt(p.x, p.z);
        const gentle = Math.abs(p.verticalSpeed) < 7 && p.speed > 25 && Math.abs(p.roll) < 0.5;
        if (strip && gentle && event === 'terrain') {
          this.land(strip);
        } else {
          this.crash(event === 'water' ? 'DITCHED IN THE RIVER' : 'FLEW INTO THE RIDGE');
        }
        return;
      }
      // Rings.
      const cross = crossRing(m, p, prevZ);
      if (cross) {
        if (cross.missed) {
          this.streak = 0;
          this.say('RING MISSED', '#ff8a70');
        } else {
          this.streak += 1;
          const points = Math.round((SCORING.ringBase + SCORING.ringCentreBonus * cross.centre) * (1 + 0.2 * (this.streak - 1)));
          this.score += points;
          if (cross.fuel) {
            p.fuel = Math.min(100, p.fuel + cross.fuel);
            this.say(`RING +${points}  FUEL +${cross.fuel}`, '#8ff7ff');
          } else {
            this.say(`RING +${points}${this.streak > 1 ? `  STREAK x${this.streak}` : ''}`, '#8ff7ff');
          }
          this.audio?.ring();
          if (missionDone(m)) this.complete();
        }
      }
      // Out of the valley or out of fuel with no hope: the flight ends.
      if (p.y > 700) {
        this.say('TOO HIGH — THE AIR IS THIN UP HERE', '#ff8a70');
        p.y = 700;
      }
      if (p.fuel <= 0 && p.speed < 20 && p.y < this.terrain.heightAt(p.x, p.z) + 30) {
        this.crash('OUT OF FUEL');
      }
    },

    land(strip) {
      const p = this.plane;
      p.onGround = true;
      p.damage += Math.abs(p.verticalSpeed) > 4 ? SCORING.hardLandingDamage / 4 : 0;
      p.fuel = 100;
      p.engineOut = false;
      const mail = this.mission.landings.find((l) => l.name === strip.name);
      if (mail && !mail.done) {
        mail.done = true;
        this.score += SCORING.delivery;
        this.say(`MAIL DELIVERED — ${strip.name}  +${SCORING.delivery}`, '#8ff7ff');
        this.audio?.delivery();
      } else {
        this.score += 250;
        this.say(`LANDED — ${strip.name}  REFUELLED  +250`, '#8ff7ff');
      }
      if (missionDone(this.mission)) this.complete();
    },

    crash(reason) {
      const p = this.plane;
      p.crashed = true;
      this.crashReason = reason;
      this.screen = 'crash';
      this.audio?.thud();
      const best = this.best[this.mission.id] ?? 0;
      if (this.score > best) {
        this.best[this.mission.id] = this.score;
        saveBest(this.best);
      }
    },

    complete() {
      this.screen = 'complete';
      const m = this.mission;
      const lines = [`Rings flown ${ringsPassed(m)} of ${ringsTotal(m)}`];
      if (m.id === 'rings') {
        const bonus = Math.max(0, Math.round((m.par - this.time) * 10));
        this.score += bonus;
        lines.push(`Time ${Math.floor(this.time)}s — par ${m.par}s, time bonus +${bonus}`);
        this.completeTitle = 'RING RUN COMPLETE';
      } else if (m.id === 'mail') {
        lines.push('All three strips served — the valley has its mail');
        this.completeTitle = 'MAIL RUN COMPLETE';
      } else {
        this.score += SCORING.rescue;
        lines.push(`Beacon reached — rescue bonus +${SCORING.rescue}`);
        this.completeTitle = 'RESCUE COMPLETE';
      }
      lines.push(`Final score ${this.score}`);
      this.summaryLines = lines;
      const best = this.best[m.id] ?? 0;
      if (this.score > best) {
        this.best[m.id] = this.score;
        saveBest(this.best);
        this.summaryLines.push('New best for this mission');
      }
      this.audio?.ring();
    },
  };
  world.plane = newPlane(0, 150, 120, 0);
  return world;
}

// ---- Boot ----------------------------------------------------------------

const params = new URLSearchParams(window.location.search);
const seed = Number(params.get('seed') ?? 1) || 1;
const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');
const input = new Input(canvas);
const audio = new AudioBus();
const world = createWorld(seed);
world.audio = audio;

function resize() {
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;
}
window.addEventListener('resize', resize);
resize();

const statusEl = document.getElementById('status');
function announce(text) {
  if (statusEl) statusEl.textContent = text;
}

function missionFromPoint(x, y) {
  for (const card of titleCards(canvas.width)) {
    if (x >= card.x && x <= card.x + card.w && y >= card.y && y <= card.y + card.h) return card.id;
  }
  return null;
}

function handleKeys() {
  if (input.take('p') && world.screen === 'play') world.screen = 'pause';
  else if (input.take('p') && world.screen === 'pause') world.screen = 'play';
  if (input.take('c') && world.screen === 'play') {
    world.view = world.view === 'cockpit' ? 'chase' : 'cockpit';
  }
  if (input.take('m')) audio.toggleMute();
  if (input.take('r') && world.screen !== 'title') world.reset(world.mission.id);
  for (const n of ['1', '2', '3']) {
    if (input.take(n)) world.reset(MISSIONS[Number(n) - 1].id);
  }
  if (input.take('enter') && world.screen === 'title') world.reset('rings');
  if (input.takeClick()) {
    audio.unlock();
    if (world.screen === 'title') {
      const pt = input.pointer(canvas);
      const id = missionFromPoint(pt.x, pt.y);
      if (id) world.reset(id);
    } else if (world.screen === 'crash' || world.screen === 'complete') {
      world.reset(world.mission.id);
    }
  }
  // Hover highlight on the title cards.
  if (world.screen === 'title') {
    const pt = input.pointer(canvas);
    world.hoverMission = missionFromPoint(pt.x, pt.y);
  }
}

let last = performance.now();
let acc = 0;
function frame(now) {
  const dt = Math.min(0.1, (now - last) / 1000);
  last = now;
  handleKeys();
  if (world.screen === 'play') {
    acc += dt;
    while (acc >= STEP) {
      world.step(STEP, input.stick());
      acc -= STEP;
    }
    audio.update(world.plane.throttle, world.plane.speed, true);
  } else {
    audio.update(0, 0, false);
  }
  renderWorld(ctx, canvas.width, canvas.height, world);
  announce(world.screen === 'play'
    ? `${world.mission.name}: score ${world.score}, rings ${ringsPassed(world.mission)} of ${ringsTotal(world.mission)}, altitude ${feet(world.plane)} feet, speed ${knots(world.plane)} knots, heading ${headingDeg(world.plane)} degrees`
    : world.screen);
  requestAnimationFrame(frame);
}

const shot = params.get('shot');
if (shot) {
  // Staged screenshot: one deterministic frame, no loop, no input.
  stageShot(shot, world);
  renderWorld(ctx, canvas.width, canvas.height, world);
  window.__ready = true;
} else {
  requestAnimationFrame(frame);
}
