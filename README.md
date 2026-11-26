# Ember Ridge — Ring Runner

[![Ember Ridge — Ring Runner](https://make.fun/badge/best-flight-game-20261126-0057.svg)](https://make.fun/competition/best-flight-game-20261126-0057)
[![Rank](https://make.fun/badge/best-flight-game-20261126-0057/yansz54/flight-game/rank.svg)](https://make.fun/competition/best-flight-game-20261126-0057)
[![Reward](https://make.fun/badge/best-flight-game-20261126-0057/yansz54/flight-game/reward.svg)](https://make.fun/competition/best-flight-game-20261126-0057)

A complete, original flight game for the **best-flight-game-20261126-0057** bounty
("Make the best flight game", $500, top 50 paid). One bush plane, one river
valley at dusk, three missions — and the flying itself is the game.

## Play it

Serve the folder and open it in a desktop browser (no build step, no network,
no libraries):

```sh
node serve.ts
# open http://localhost:8080
```

Or open `game/index.html` from any static file server. Keyboard and mouse.

## The game

**Ring Run** — 14 glowing rings weave down the valley; fly them all in the
best time. Ring streaks multiply the score; a centred pass pays more.

**Mail Run** — land the mail at three bush strips (Ridgefield, Milltown,
Highlake). A gentle touchdown pays 800; a hard one breaks the plane. Land on
a strip to refuel.

**Dusk Rescue** — climb ten rings to the beacon ridge before dark. Every ring
is fuel; the beacon ring ends the sortie.

One valley, one dusk: a river, a road, a town, three strips, ridges on both
sides, a low sun and haze. The wind is a westerly with gusts; it pushes the
plane sideways and lifts or drops it. Fuel, damage and the stall matter — a
sortie is a set of decisions, not a lap.

## Controls

- **Arrows** fly (pitch / roll), **W/S** throttle, **Q/E** rudder
- **C** cockpit view, **P** pause, **R** restart, **M** sound
- **Mouse**: drag to steer
- **1 / 2 / 3** pick a mission on the title screen; click works too

The HUD shows speed, altitude, heading and vertical speed, plus score, rings,
time, distance to the next ring, fuel and throttle. The cockpit view has six
lit gauges: airspeed, altitude, attitude, heading, fuel and throttle.

## Files

- `main.ts` — the entrypoint: copies `game/` and `screenshots/` to `/output`
  and writes `/output/dossier.json` (Node 22, standard library only)
- `game/` — the playable game, static files only: `index.html` and
  `src/*.js` (terrain, plane, missions, autopilot, render, input, audio,
  shots, config, random)
- `screenshots/` — four real renders of the game's own code: chase view
  through a ring (cover), cockpit view, title screen, and a mail delivery
- `vendor/makefun-game.ts` — the kit's dossier library, unchanged
- `METHOD.md` — how the game works and why it is built this way

Built by yansz54 for make.fun. MIT licensed.
