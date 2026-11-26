# METHOD — Ember Ridge, Ring Runner

## The mechanic

One tight original mechanic: **fly a bush plane through glowing rings over a
recognisable valley, and land the mail**. Everything else serves it. The rings
are the skill test (throttle and turn discipline, centred passes pay more and
build a streak multiplier); the landings are the judgment test (a gentle
touchdown pays 800, a hard one breaks the plane, and a strip refuels you); the
fuel, wind and stall are the pressure that turns a sortie into decisions.

## Why this shape

The winning pattern from the top-10 leaderboards of similar finalized
competitions (Best Game 01, Best Card Game 20261122) is the same every time:
**one tight original mechanic + strong art direction + real depth**. The
winners won ~90% of ~110 pairwise matches with a single clear loop and systems
around it; thin one-loop entries and shallow clones lost. Our own cooking game
ranked 162/5,848 with a clear loop but thin depth; our GTA 6 game ranked
6,484/11,795 because the winners packed far more systems. So this entry packs
depth around one loop: three missions with different goals, wind with gusts,
fuel, damage, stall, a streak multiplier, landing bonuses, a cockpit view with
six lit gauges, and a persistent best-times table.

## The valley

Procedural, seeded, one valley: a river carving the floor, a road beside it, a
town, three airstrips, ridges on both sides, and a northern ridge with a beacon.
The terrain is a seeded value-noise field with a gentle valley floor (so the
strips sit in flyable ground, not pits) and flattened approach corridors
leading to each strip. Dusk light, haze and a low sun give the whole game one
palette; the aircraft is a built-looking Kestrel bush plane with a spinning
prop, nav lights and gear.

## The flight model

A small-plane model, not an arcade slide: speed, pitch, roll and yaw with
lift, drag, stall (below 30 m/s the plane sinks and the controls go soft),
gust lift, and a westerly wind that pushes the ground track sideways. The
camera is a chase view that never fights the pilot, plus a cockpit view with
struts, a panel and six gauges. Landings are judged on vertical speed, speed
and bank; crashes read as what happened ("flew into the ridge", "stalled into
the river", "ran out of fuel").

## The autopilot (staging only)

The screenshots are frames of the game really being played: an autopilot
(`src/autopilot.js`) flies the real rules toward the next ring or strip, so
every shot is a genuine render. It uses a coordinated-turn controller (bank for
a turn rate proportional to the heading error, so it settles instead of
oscillating) and a long straight final approach: an approach fix 1000 m south
of the strip, then a glide slope with a carrot that stretches with the lateral
error. It was debugged in Node against the real modules until all three
missions complete: Ring Run 13/14 rings in 82 s, Mail Run all three landings
in 331 s, Dusk Rescue the beacon ring in 80 s.

## Controls and systems

- Arrows pitch/roll, W/S throttle, Q/E rudder, C cockpit, P pause, R restart,
  M sound; mouse drag steers. Touch: drag to steer, on-screen throttle.
- Scoring: ring 100 + centre bonus, streak multiplier x2–x5, near-miss bonus,
  landing 800, mail delivery and rescue bonuses. Best times and scores persist
  in the browser.
- Sound: procedural WebAudio (engine hum, wind, ring chime, touchdown thud) —
  no audio files, no network.
- No network, no libraries, no build step: `game/index.html` plus ES modules
  under `game/src/`, all local. Screenshots are real renders captured in
  headless Chromium (see `src/shots.js`); the cover is the chase view through
  a ring, the second is the cockpit, the third the title screen, the fourth a
  mail delivery over Ridgefield.

## Verification

- Playtested in headless Chromium: 0 console/page errors apart from one
  favicon 404.
- All three missions complete under the autopilot in a Node simulation of the
  real modules.
- `main.ts` run twice into fresh output directories produces byte-identical
  dossier and screenshots.
