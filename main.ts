// Ember Ridge — Ring Runner: the entrypoint (Node 22, standard library only).
// It hands the game in: copies game/ and screenshots/ from this repository to
// /output and writes /output/dossier.json with the vendored make.fun library,
// the summary the judge reads. Outside the grader, MAKEFUN_OUTPUT_DIR stands
// in for /output:
//
//   mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts
//
// The grader mounts the repository at /bot, not as the working directory, so
// the repository is found by trying, in order, $MAKEFUN_BOT_DIR, /bot, the
// directory this file lives in, and the working directory — the first that
// holds game/index.html and vendor/makefun-game.ts wins.

import { cpSync, existsSync, lstatSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildDossier } from './vendor/makefun-game.ts';

const out = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';
const here = dirname(fileURLToPath(import.meta.url));

// Where the repository might be: the grader mounts it at /bot (or wherever
// $MAKEFUN_BOT_DIR points), and a local run has it beside this file or as the
// working directory. The first candidate that holds the game wins.
function findRepo() {
  const candidates = [
    process.env.MAKEFUN_BOT_DIR,
    '/bot',
    here,
    process.cwd(),
  ].filter((c): c is string => typeof c === 'string' && c.length > 0);
  for (const c of candidates) {
    const root = resolve(c);
    if (
      existsSync(join(root, 'game', 'index.html'))
      && existsSync(join(root, 'vendor', 'makefun-game.ts'))
    ) {
      return root;
    }
  }
  throw new Error(
    'Ember Ridge: could not find the repository (no game/index.html beside '
    + 'vendor/makefun-game.ts) in $MAKEFUN_BOT_DIR, /bot, the script directory, or the working directory.',
  );
}

const repo = findRepo();

// The scorer's own caps (competition.yaml, gate): only text_max_bytes shapes
// the bytes; the others refuse an entry the scorer would refuse — more than
// 4 screenshots or one over 256 KiB; more than 993 files in game/ or 48 MiB
// of game files in all, or a path under game/ over 1000 bytes.
const CAPS = {
  text_max_bytes: 163840,
  screenshots: { max: 4, max_bytes: 262144 },
  game_max_files: 993,
  game_max_bytes: 50331648,
  game_path_max_bytes: 1000,
};

mkdirSync(out, { recursive: true });
// The output directory is shared between entries, and stale files from an
// earlier hand-in would leak into this one and count against the caps, so
// clear the two trees this program owns before copying fresh.
rmSync(join(out, 'game'), { recursive: true, force: true });
rmSync(join(out, 'screenshots'), { recursive: true, force: true });
cpSync(join(repo, 'game'), join(out, 'game'), { recursive: true });
mkdirSync(join(out, 'screenshots'), { recursive: true });
if (existsSync(join(repo, 'screenshots'))) {
  cpSync(join(repo, 'screenshots'), join(out, 'screenshots'), { recursive: true });
}

const dossier = buildDossier(out, CAPS);
writeFileSync(join(out, 'dossier.json'), dossier);

// Read a JPEG's dimensions from its start-of-frame marker, so the hand-in
// can check the gate's size rule (long side at most 1280, short side at
// least 480) without any image library.
function jpegSize(buf) {
  if (buf[0] !== 0xff || buf[1] !== 0xd8) return null;
  let i = 2;
  while (i + 9 < buf.length) {
    if (buf[i] !== 0xff) { i += 1; continue; }
    const marker = buf[i + 1];
    if (marker === 0xd8 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) { i += 2; continue; }
    const len = buf.readUInt16BE(i + 2);
    if (marker === 0xc0 || marker === 0xc1 || marker === 0xc2) {
      return { height: buf.readUInt16BE(i + 5), width: buf.readUInt16BE(i + 7) };
    }
    i += 2 + len;
  }
  return null;
}

// A quick self-check, so a bad hand-in fails here instead of at the gate:
// 3 or 4 screenshots, each a JPEG or PNG under the cap and within the
// dimension rule, game/index.html present, and the dossier byte-identical
// to a fresh build from the same files.
const shots = readdirSync(join(out, 'screenshots'))
  .filter((n) => !n.startsWith('.'))
  .sort();
if (shots.length < 3 || shots.length > 4) {
  throw new Error(`Ember Ridge: expected 3 or 4 screenshots, found ${shots.length}.`);
}
for (const name of shots) {
  const path = join(out, 'screenshots', name);
  const size = statSync(path).size;
  if (size > CAPS.screenshots.max_bytes) {
    throw new Error(`Ember Ridge: screenshot ${name} is ${size} bytes, over the 256 KiB cap.`);
  }
  const dims = jpegSize(readFileSync(path));
  if (dims) {
    const long = Math.max(dims.width, dims.height);
    const short = Math.min(dims.width, dims.height);
    if (long > 1280 || short < 480) {
      throw new Error(`Ember Ridge: screenshot ${name} is ${dims.width}x${dims.height}, outside the 1280x480 rule.`);
    }
  }
}
if (!existsSync(join(out, 'game', 'index.html'))) {
  throw new Error('Ember Ridge: game/index.html missing from the output.');
}
// The gate's game_files row: game/ is plain files and directories only (no
// symlinks), at most 993 entries and 48 MiB in all, every path at most 1000
// UTF-8 bytes, and index.html at most 1 MiB.
let gameEntries = 0;
let gameBytes = 0;
const walk = (dir) => {
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    const st = lstatSync(path);
    gameEntries += 1;
    if (st.isSymbolicLink()) {
      throw new Error(`Ember Ridge: game/ holds a symlink at ${path}.`);
    }
    if (Buffer.byteLength(path, 'utf8') > CAPS.game_path_max_bytes) {
      throw new Error(`Ember Ridge: game path over 1000 bytes at ${path}.`);
    }
    if (st.isDirectory()) walk(path);
    else gameBytes += st.size;
  }
};
walk(join(out, 'game'));
if (gameEntries > CAPS.game_max_files) {
  throw new Error(`Ember Ridge: game/ holds ${gameEntries} entries, over the 993 cap.`);
}
if (gameBytes > CAPS.game_max_bytes) {
  throw new Error(`Ember Ridge: game/ is ${gameBytes} bytes, over the 48 MiB cap.`);
}
if (statSync(join(out, 'game', 'index.html')).size > 1048576) {
  throw new Error('Ember Ridge: game/index.html is over the 1 MiB cap.');
}
const rebuilt = buildDossier(out, CAPS);
if (!Buffer.from(rebuilt).equals(Buffer.from(dossier))) {
  throw new Error('Ember Ridge: dossier is not stable — a fresh build differs.');
}
console.log(`Ember Ridge handed in: ${shots.length} screenshots, dossier written to ${join(out, 'dossier.json')}.`);
