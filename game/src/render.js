// Ember Ridge renderer: a dusk sky, a voxel-space valley, glowing rings, one
// hand-drawn bush plane, a lit cockpit and a full HUD. Everything is drawn
// with the canvas 2D API from the game's own state — no images, no fonts.
import { CAMERA, COLORS } from './config.js';
import { feet, headingDeg, knots } from './plane.js';
import { nextRing, ringsPassed, ringsTotal } from './missions.js';
import { clamp, lerp } from './random.js';

export function focalLength(w) {
  return (w / 2) / Math.tan(CAMERA.fov / 2);
}

export function makeCamera(world) {
  const p = world.plane;
  if (world.view === 'cockpit') {
    return {
      x: p.x + Math.sin(p.heading) * 2.5,
      y: p.y + 1.4,
      z: p.z + Math.cos(p.heading) * 2.5,
      heading: p.heading,
      pitch: p.pitch,
    };
  }
  return {
    x: p.x - Math.sin(p.heading) * CAMERA.chaseDistance,
    y: p.y + CAMERA.chaseHeight,
    z: p.z - Math.cos(p.heading) * CAMERA.chaseDistance,
    heading: p.heading,
    pitch: p.pitch * 0.6,
  };
}

function skyGradient(ctx, w, h) {
  // The whole frame, so a high camera never leaves an unfilled band between
  // the sky and the far terrain: the warm low stop is the haze at the foot
  // of the world, and the terrain paints over it wherever it reaches.
  const g = ctx.createLinearGradient(0, 0, 0, h);
  g.addColorStop(0, COLORS.skyTop);
  g.addColorStop(0.32, COLORS.skyMid);
  g.addColorStop(0.48, COLORS.skyHorizon);
  g.addColorStop(0.62, COLORS.skyLow);
  g.addColorStop(1, '#c98a5a');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);
}

export function drawSky(ctx, w, h, cam, time) {
  skyGradient(ctx, w, h);
  const focal = focalLength(w);
  const horizonY = h * CAMERA.horizon - Math.tan(cam.pitch) * focal;
  // The sun sits low in the west; its screen x follows the heading.
  const sunAz = Math.PI * 1.5; // west
  let rel = sunAz - cam.heading;
  while (rel > Math.PI) rel -= Math.PI * 2;
  while (rel < -Math.PI) rel += Math.PI * 2;
  const sx = w / 2 + Math.tan(rel) * focal;
  const sy = horizonY - 46;
  if (sx > -120 && sx < w + 120) {
    const glow = ctx.createRadialGradient(sx, sy, 4, sx, sy, 130);
    glow.addColorStop(0, 'rgba(255, 217, 160, 0.95)');
    glow.addColorStop(0.25, 'rgba(255, 170, 90, 0.45)');
    glow.addColorStop(1, 'rgba(255, 150, 70, 0)');
    ctx.fillStyle = glow;
    ctx.fillRect(sx - 140, sy - 140, 280, 280);
    ctx.fillStyle = COLORS.sun;
    ctx.beginPath();
    ctx.arc(sx, sy, 26, 0, Math.PI * 2);
    ctx.fill();
  }
  // Slow clouds: faint, high puffs that drift with the heading.
  ctx.fillStyle = 'rgba(255, 220, 190, 0.14)';
  for (let i = 0; i < 8; i += 1) {
    const cx = (((i * 317 + 140 - cam.heading * 260) % (w + 320)) + w + 320) % (w + 320) - 160;
    const cy = horizonY - 190 - ((i * 53) % 110);
    const cw = 60 + ((i * 61) % 70);
    ctx.beginPath();
    ctx.ellipse(cx, cy, cw, 10 + (i % 3) * 3, 0, 0, Math.PI * 2);
    ctx.fill();
  }
  // Stars fading in above the dusk, deterministic from the index.
  ctx.fillStyle = 'rgba(255, 255, 255, 0.7)';
  for (let i = 0; i < 40; i += 1) {
    const sx2 = (i * 197 + 31) % w;
    const sy2 = ((i * 131 + 17) % Math.floor(h * 0.2));
    if (sy2 < horizonY - 90) ctx.fillRect(sx2, sy2, 1.6, 1.6);
  }
}

/** Project a world point to screen space; null when behind the camera. */
export function project(cam, x, y, z, w, h) {
  const focal = focalLength(w);
  const horizonY = h * CAMERA.horizon - Math.tan(cam.pitch) * focal;
  const dx = x - cam.x;
  const dy = y - cam.y;
  const dz = z - cam.z;
  const forward = Math.sin(cam.heading) * dx + Math.cos(cam.heading) * dz;
  if (forward < 6) return null;
  const right = Math.cos(cam.heading) * dx - Math.sin(cam.heading) * dz;
  const sx = w / 2 + (right * focal) / forward;
  const sy = horizonY - (dy * focal) / forward;
  return { x: sx, y: sy, d: forward, scale: focal / forward };
}

export function drawTerrain(ctx, w, h, cam, terrain) {
  const focal = focalLength(w);
  const horizonY = h * CAMERA.horizon - Math.tan(cam.pitch) * focal;
  const step = 2;
  for (let col = 0; col < w; col += step) {
    const a = cam.heading + (col / w - 0.5) * CAMERA.fov;
    const dx = Math.sin(a);
    const dz = Math.cos(a);
    let maxY = h;
    let d = 16;
    while (d < CAMERA.far) {
      const x = cam.x + dx * d;
      const z = cam.z + dz * d;
      const th = terrain.heightAt(x, z);
      const y = horizonY - (th - cam.y) * (focal / d);
      if (y < maxY) {
        const c = terrain.colorAt(x, z);
        const fog = clamp(d / 2000, 0, 0.55);
        const r = Math.round(lerp(c[0], 217, fog));
        const g = Math.round(lerp(c[1], 154, fog));
        const b = Math.round(lerp(c[2], 107, fog));
        ctx.fillStyle = `rgb(${r},${g},${b})`;
        ctx.fillRect(col, Math.max(0, y), step, maxY - Math.max(0, y));
        maxY = Math.max(0, y);
        if (maxY <= horizonY + 1.5) break;
      }
      d += 1.5 + d * 0.012;
    }
    // Anything below the last drawn column is haze to the bottom of the frame.
    if (maxY < h) {
      ctx.fillStyle = 'rgba(217,154,107,0.25)';
      ctx.fillRect(col, maxY, step, h - maxY);
    }
  }
}

export function drawRings(ctx, w, h, cam, mission) {
  const list = mission.rings.filter((r) => !r.passed && !r.missed);
  const projected = [];
  for (const r of list) {
    const p = project(cam, r.x, r.y, r.z, w, h);
    if (p) projected.push({ r, p });
  }
  projected.sort((a, b) => b.p.d - a.p.d);
  for (const { r, p } of projected) {
    const rad = Math.max(3, r.r * p.scale);
    const isNext = mission.rings.indexOf(r) === mission.rings.findIndex((x) => !x.passed && !x.missed);
    ctx.save();
    ctx.globalAlpha = isNext ? 1 : 0.45;
    ctx.strokeStyle = isNext ? '#8ff7ff' : '#5fb8c9';
    ctx.lineWidth = Math.max(2, rad * 0.09);
    ctx.shadowColor = '#7df9ff';
    ctx.shadowBlur = isNext ? 18 : 6;
    ctx.beginPath();
    ctx.arc(p.x, p.y, rad, 0, Math.PI * 2);
    ctx.stroke();
    ctx.shadowBlur = 0;
    ctx.fillStyle = isNext ? 'rgba(125, 249, 255, 0.10)' : 'rgba(95, 184, 201, 0.06)';
    ctx.fill();
    ctx.restore();
    if (isNext && p.d < 900) {
      ctx.fillStyle = '#dffaff';
      ctx.font = 'bold 15px system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(`${Math.round(p.d)} m`, p.x, p.y + rad + 22);
    }
  }
}

function drawAircraft(ctx, w, h, plane, time) {
  const cx = w / 2;
  const cy = h * 0.62;
  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(plane.roll); // banking right tilts the sprite clockwise
  const s = 1.12;
  ctx.scale(s, s);
  // Prop disc, spinning.
  ctx.save();
  ctx.translate(0, -82);
  ctx.fillStyle = 'rgba(220, 220, 220, 0.16)';
  ctx.beginPath();
  ctx.ellipse(0, 0, 36, 9, 0, 0, Math.PI * 2);
  ctx.fill();
  const blade = (time * 38) % Math.PI;
  ctx.strokeStyle = 'rgba(40, 36, 30, 0.55)';
  ctx.lineWidth = 5;
  ctx.beginPath();
  ctx.moveTo(-Math.cos(blade) * 34, -Math.sin(blade) * 8);
  ctx.lineTo(Math.cos(blade) * 34, Math.sin(blade) * 8);
  ctx.stroke();
  ctx.restore();
  // Wings: left in shade, right catching the last sun.
  ctx.fillStyle = '#8a7a58';
  ctx.beginPath();
  ctx.moveTo(-6, -18); ctx.lineTo(-122, -4); ctx.lineTo(-116, 12); ctx.lineTo(-6, 8);
  ctx.closePath(); ctx.fill();
  ctx.fillStyle = '#e3d3a4';
  ctx.beginPath();
  ctx.moveTo(6, -18); ctx.lineTo(122, -4); ctx.lineTo(116, 12); ctx.lineTo(6, 8);
  ctx.closePath(); ctx.fill();
  // Wingtip lights.
  ctx.fillStyle = '#ff3b30';
  ctx.beginPath(); ctx.arc(-120, 2, 4, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#35e05a';
  ctx.beginPath(); ctx.arc(120, 2, 4, 0, Math.PI * 2); ctx.fill();
  // Tailplane and fin.
  ctx.fillStyle = '#b3402e';
  ctx.beginPath();
  ctx.moveTo(-8, 34); ctx.lineTo(-52, 44); ctx.lineTo(-48, 54); ctx.lineTo(-6, 50);
  ctx.closePath(); ctx.fill();
  ctx.beginPath();
  ctx.moveTo(8, 34); ctx.lineTo(52, 44); ctx.lineTo(48, 54); ctx.lineTo(6, 50);
  ctx.closePath(); ctx.fill();
  ctx.beginPath();
  ctx.moveTo(-4, 30); ctx.lineTo(0, 2); ctx.lineTo(6, 30);
  ctx.closePath(); ctx.fill();
  // Fuselage, cream with a red cheatline, nose up and away.
  ctx.fillStyle = '#e8dcc0';
  ctx.beginPath();
  ctx.moveTo(0, -84);
  ctx.quadraticCurveTo(9, -50, 10, -10);
  ctx.quadraticCurveTo(11, 22, 7, 44);
  ctx.quadraticCurveTo(0, 52, -7, 44);
  ctx.quadraticCurveTo(-11, 22, -10, -10);
  ctx.quadraticCurveTo(-9, -50, 0, -84);
  ctx.fill();
  ctx.fillStyle = '#b3402e';
  ctx.fillRect(-10, -14, 20, 5);
  // Canopy, lit warm from inside.
  ctx.fillStyle = '#ffd9a0';
  ctx.beginPath();
  ctx.ellipse(0, -38, 6.5, 13, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = 'rgba(60, 40, 20, 0.35)';
  ctx.beginPath();
  ctx.ellipse(0, -38, 6.5, 13, 0, 0, Math.PI * 2);
  ctx.stroke();
  // Landing gear when slow.
  if (plane.gearDown) {
    ctx.strokeStyle = '#3a342c';
    ctx.lineWidth = 4;
    ctx.beginPath(); ctx.moveTo(-8, 30); ctx.lineTo(-14, 56); ctx.moveTo(8, 30); ctx.lineTo(14, 56); ctx.stroke();
    ctx.fillStyle = '#22201c';
    ctx.beginPath(); ctx.arc(-14, 58, 6, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(14, 58, 6, 0, Math.PI * 2); ctx.fill();
  }
  // Tail strobe blinking.
  if (Math.sin(time * 6) > 0.2) {
    ctx.fillStyle = '#ffffff';
    ctx.beginPath(); ctx.arc(0, 50, 3.5, 0, Math.PI * 2); ctx.fill();
  }
  ctx.restore();
}

function drawGauge(ctx, cx, cy, r, label, value, min, max, unit) {
  ctx.save();
  ctx.translate(cx, cy);
  // Lit dial face.
  const glow = ctx.createRadialGradient(0, 0, 1, 0, 0, r);
  glow.addColorStop(0, '#3a2f1e');
  glow.addColorStop(1, '#17130c');
  ctx.fillStyle = glow;
  ctx.beginPath(); ctx.arc(0, 0, r, 0, Math.PI * 2); ctx.fill();
  ctx.strokeStyle = '#8a7a58';
  ctx.lineWidth = 2;
  ctx.stroke();
  // Ticks.
  ctx.strokeStyle = '#e8dcc0';
  ctx.fillStyle = '#e8dcc0';
  for (let i = 0; i <= 10; i += 1) {
    const a = Math.PI * 0.75 + (i / 10) * Math.PI * 1.5;
    const x1 = Math.cos(a) * (r - 3);
    const y1 = Math.sin(a) * (r - 3);
    const x2 = Math.cos(a) * (r - (i % 5 === 0 ? 10 : 7));
    const y2 = Math.sin(a) * (r - (i % 5 === 0 ? 10 : 7));
    ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
  }
  const frac = clamp((value - min) / (max - min), 0, 1);
  const na = Math.PI * 0.75 + frac * Math.PI * 1.5;
  ctx.strokeStyle = '#ffb84d';
  ctx.lineWidth = 2.5;
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.lineTo(Math.cos(na) * (r - 12), Math.sin(na) * (r - 12));
  ctx.stroke();
  ctx.fillStyle = '#ffb84d';
  ctx.beginPath(); ctx.arc(0, 0, 3, 0, Math.PI * 2); ctx.fill();
  ctx.font = 'bold 11px system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.fillStyle = '#e8dcc0';
  ctx.fillText(label, 0, r * 0.42);
  ctx.font = 'bold 13px system-ui, sans-serif';
  ctx.fillText(String(Math.round(value)), 0, -r * 0.45);
  if (unit) {
    ctx.font = '9px system-ui, sans-serif';
    ctx.fillStyle = '#b8a888';
    ctx.fillText(unit, 0, r * 0.66);
  }
  ctx.restore();
}

function drawAttitude(ctx, cx, cy, r, pitch, roll) {
  ctx.save();
  ctx.translate(cx, cy);
  ctx.beginPath(); ctx.arc(0, 0, r, 0, Math.PI * 2); ctx.clip();
  ctx.rotate(-roll);
  const off = clamp(pitch * r * 1.6, -r, r);
  ctx.fillStyle = '#7a6a8a';
  ctx.fillRect(-r, -r + off - r, r * 2, r * 2);
  ctx.fillStyle = '#c98a4b';
  ctx.fillRect(-r, off, r * 2, r * 2);
  ctx.fillStyle = '#e8dcc0';
  ctx.fillRect(-r, off - 1, r * 2, 2);
  ctx.restore();
  ctx.strokeStyle = '#8a7a58';
  ctx.lineWidth = 2;
  ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.stroke();
  // Fixed wings of the symbol.
  ctx.strokeStyle = '#ffd9a0';
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(cx - r * 0.55, cy); ctx.lineTo(cx - r * 0.15, cy);
  ctx.moveTo(cx + r * 0.15, cy); ctx.lineTo(cx + r * 0.55, cy);
  ctx.stroke();
  ctx.fillStyle = '#e8dcc0';
  ctx.beginPath(); ctx.arc(cx, cy, 3, 0, Math.PI * 2); ctx.fill();
}

function drawCockpit(ctx, w, h, plane) {
  // Canopy pillars.
  ctx.strokeStyle = '#1c1a16';
  ctx.lineWidth = 14;
  ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(w * 0.22, h * 0.78); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(w, 0); ctx.lineTo(w * 0.78, h * 0.78); ctx.stroke();
  // Cowling nose at the bottom centre.
  ctx.fillStyle = '#2a2118';
  ctx.beginPath();
  ctx.moveTo(w * 0.42, h); ctx.lineTo(w * 0.47, h * 0.9); ctx.lineTo(w * 0.53, h * 0.9); ctx.lineTo(w * 0.58, h);
  ctx.closePath(); ctx.fill();
  // Dashboard.
  const dashY = h * 0.78;
  const g = ctx.createLinearGradient(0, dashY, 0, h);
  g.addColorStop(0, '#241d16');
  g.addColorStop(1, '#100d0a');
  ctx.fillStyle = g;
  ctx.fillRect(0, dashY, w, h - dashY);
  ctx.fillStyle = '#3a2c1c';
  ctx.fillRect(0, dashY, w, 4);
  const gy = dashY + (h - dashY) / 2;
  drawGauge(ctx, w * 0.16, gy, 34, 'AIRSPEED', knots(plane), 0, 220, 'KT');
  drawGauge(ctx, w * 0.30, gy, 34, 'ALTITUDE', feet(plane), 0, 12000, 'FT');
  drawAttitude(ctx, w * 0.44, gy, 34, plane.pitch, plane.roll);
  drawGauge(ctx, w * 0.58, gy, 34, 'HEADING', headingDeg(plane), 0, 360, 'DEG');
  drawGauge(ctx, w * 0.72, gy, 34, 'FUEL', plane.fuel, 0, 100, 'L');
  drawGauge(ctx, w * 0.86, gy, 34, 'THROTTLE', plane.throttle * 100, 0, 100, '%');
}

function compassStrip(ctx, w, h, heading) {
  const cx = w / 2;
  const top = 14;
  ctx.fillStyle = 'rgba(16, 14, 12, 0.55)';
  ctx.fillRect(cx - 210, top - 4, 420, 30);
  ctx.strokeStyle = 'rgba(232, 220, 192, 0.5)';
  ctx.strokeRect(cx - 210, top - 4, 420, 30);
  ctx.font = 'bold 14px system-ui, sans-serif';
  ctx.textAlign = 'center';
  const names = { 0: 'N', 90: 'E', 180: 'S', 270: 'W' };
  for (let d = -50; d <= 50; d += 5) {
    const deg = Math.round(((heading * 180) / Math.PI + d + 360) % 360);
    const x = cx + d * 4;
    const major = deg % 30 === 0;
    ctx.strokeStyle = major ? '#e8dcc0' : 'rgba(232, 220, 192, 0.45)';
    ctx.beginPath();
    ctx.moveTo(x, top + (major ? 4 : 12));
    ctx.lineTo(x, top + 22);
    ctx.stroke();
    if (deg % 30 === 0) {
      ctx.fillStyle = '#e8dcc0';
      ctx.fillText(names[deg] ?? String(deg), x, top + 12);
    }
  }
  ctx.fillStyle = '#ffb84d';
  ctx.beginPath();
  ctx.moveTo(cx - 6, top - 4); ctx.lineTo(cx + 6, top - 4); ctx.lineTo(cx, top + 4);
  ctx.closePath(); ctx.fill();
}

function textPanel(ctx, x, y, lines, align = 'left') {
  ctx.font = 'bold 15px system-ui, sans-serif';
  ctx.textAlign = align;
  ctx.fillStyle = 'rgba(16, 14, 12, 0.55)';
  const width = 210;
  ctx.fillRect(x - (align === 'right' ? width : 0), y - 18, width, lines.length * 22 + 12);
  lines.forEach((line, i) => {
    ctx.fillStyle = i === 0 ? '#ffb84d' : '#e8dcc0';
    ctx.fillText(line, x + (align === 'right' ? -8 : 8), y + i * 22);
  });
}

export function drawHUD(ctx, w, h, world) {
  const p = world.plane;
  const m = world.mission;
  compassStrip(ctx, w, h, p.heading);
  textPanel(ctx, 16, 40, [
    `SPD ${knots(p)} KT`,
    `ALT ${feet(p)} FT`,
    `HDG ${String(headingDeg(p)).padStart(3, '0')} DEG`,
    `V/S ${p.verticalSpeed >= 0 ? '+' : ''}${Math.round(p.verticalSpeed * 196)} FPM`,
  ]);
  const next = nextRing(m);
  textPanel(ctx, w - 16, 40, [
    `SCORE ${world.score}`,
    `RINGS ${ringsPassed(m)}/${ringsTotal(m)}`,
    `TIME ${Math.floor(world.time)}s`,
    next ? `NEXT ${Math.round(Math.hypot(next.x - p.x, next.z - p.z))} m` : 'COURSE CLEAR',
  ], 'right');
  // Fuel bar.
  const fw = 180;
  const fx = w - fw - 16;
  const fy = 148;
  ctx.fillStyle = 'rgba(16, 14, 12, 0.55)';
  ctx.fillRect(fx - 8, fy - 16, fw + 16, 34);
  ctx.fillStyle = p.fuel < 20 ? '#e04a3a' : '#ffb84d';
  ctx.font = 'bold 12px system-ui, sans-serif';
  ctx.textAlign = 'left';
  ctx.fillText('FUEL', fx, fy - 2);
  ctx.fillStyle = '#3a2c1c';
  ctx.fillRect(fx, fy + 2, fw, 10);
  ctx.fillStyle = p.fuel < 20 ? '#e04a3a' : '#7fb069';
  ctx.fillRect(fx, fy + 2, fw * clamp(p.fuel / 100, 0, 1), 10);
  // Throttle bar, bottom right.
  const th = 120;
  ctx.fillStyle = 'rgba(16, 14, 12, 0.55)';
  ctx.fillRect(w - th - 24, h - 34, th + 16, 26);
  ctx.fillStyle = '#3a2c1c';
  ctx.fillRect(w - th - 16, h - 26, th, 10);
  ctx.fillStyle = '#ffb84d';
  ctx.fillRect(w - th - 16, h - 26, th * p.throttle, 10);
  ctx.fillStyle = '#e8dcc0';
  ctx.font = 'bold 12px system-ui, sans-serif';
  ctx.textAlign = 'right';
  ctx.fillText('THR', w - th - 22, h - 16);
  // Reticle.
  ctx.strokeStyle = 'rgba(232, 220, 192, 0.85)';
  ctx.lineWidth = 1.5;
  ctx.beginPath(); ctx.arc(w / 2, h * 0.42, 12, 0, Math.PI * 2); ctx.stroke();
  ctx.fillStyle = 'rgba(232, 220, 192, 0.85)';
  ctx.beginPath(); ctx.arc(w / 2, h * 0.42, 2, 0, Math.PI * 2); ctx.fill();
  // Objective line.
  ctx.font = 'bold 15px system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.fillStyle = '#dffaff';
  ctx.fillText(m.goal.toUpperCase(), w / 2, h * 0.42 + 34);
  // Floating messages.
  ctx.font = 'bold 22px system-ui, sans-serif';
  world.messages.forEach((msg, i) => {
    const age = world.time - msg.at;
    if (age > 2.2) return;
    ctx.globalAlpha = clamp(1.4 - age / 1.6, 0, 1);
    ctx.fillStyle = msg.color;
    ctx.fillText(msg.text, w / 2, h * 0.3 - i * 30);
    ctx.globalAlpha = 1;
  });
  // Low-fuel warning.
  if (p.fuel < 20 && !p.engineOut) {
    ctx.fillStyle = Math.sin(world.time * 8) > 0 ? '#ff5a40' : '#ffb84d';
    ctx.font = 'bold 20px system-ui, sans-serif';
    ctx.fillText('LOW FUEL — FIND A STRIP', w / 2, h - 52);
  }
  if (p.engineOut) {
    ctx.fillStyle = '#ff5a40';
    ctx.font = 'bold 20px system-ui, sans-serif';
    ctx.fillText('ENGINE OUT — GLIDE AND LAND', w / 2, h - 52);
  }
}

function panel(ctx, w, h, title, lines, footer) {
  ctx.fillStyle = 'rgba(12, 10, 8, 0.72)';
  ctx.fillRect(0, 0, w, h);
  const pw = 640;
  const ph = 120 + lines.length * 30 + (footer ? 52 : 10);
  const px = (w - pw) / 2;
  const py = (h - ph) / 2;
  ctx.fillStyle = '#1c1812';
  ctx.fillRect(px, py, pw, ph);
  ctx.strokeStyle = '#b3402e';
  ctx.lineWidth = 3;
  ctx.strokeRect(px, py, pw, ph);
  ctx.textAlign = 'center';
  ctx.fillStyle = '#ffb84d';
  ctx.font = 'bold 34px system-ui, sans-serif';
  ctx.fillText(title, w / 2, py + 52);
  ctx.fillStyle = '#e8dcc0';
  ctx.font = '18px system-ui, sans-serif';
  lines.forEach((line, i) => ctx.fillText(line, w / 2, py + 96 + i * 30));
  if (footer) {
    ctx.fillStyle = '#ffb84d';
    ctx.font = 'bold 16px system-ui, sans-serif';
    ctx.fillText(footer, w / 2, py + ph - 22);
  }
}

/** The mission cards' rectangles on a title screen of width `w`. */
export function titleCards(w) {
  const cw = 300;
  const gap = 24;
  const total = 3 * cw + 2 * gap;
  const x0 = (w - total) / 2;
  return [
    { id: 'rings', x: x0, y: 300, w: cw, h: 170 },
    { id: 'mail', x: x0 + cw + gap, y: 300, w: cw, h: 170 },
    { id: 'rescue', x: x0 + 2 * (cw + gap), y: 300, w: cw, h: 170 },
  ];
}

export function drawTitle(ctx, w, h, world) {
  // Cinematic backdrop: high above the valley, looking down the course.
  const cam = { x: 0, y: 300, z: -160, heading: 0, pitch: -0.16 };
  drawSky(ctx, w, h, cam, world.time);
  drawTerrain(ctx, w, h, cam, world.terrain);
  ctx.fillStyle = 'rgba(12, 10, 8, 0.45)';
  ctx.fillRect(0, 0, w, h);
  ctx.textAlign = 'center';
  ctx.fillStyle = '#ffb84d';
  ctx.font = 'bold 15px system-ui, sans-serif';
  ctx.fillText('M A K E F U N   •   B E S T   F L I G H T   G A M E', w / 2, 92);
  ctx.fillStyle = '#f7ead0';
  ctx.font = 'bold 84px system-ui, sans-serif';
  ctx.fillText('EMBER RIDGE', w / 2, 178);
  ctx.fillStyle = '#8ff7ff';
  ctx.font = 'bold 30px system-ui, sans-serif';
  ctx.fillText('— RING RUNNER —', w / 2, 222);
  ctx.fillStyle = '#e8dcc0';
  ctx.font = '18px system-ui, sans-serif';
  ctx.fillText('One bush plane. One valley at dusk. Fly the rings, mind the fuel, land the mail.', w / 2, 258);
  // Mission cards.
  const cards = world.missions;
  const rects = titleCards(w);
  rects.forEach((rect, i) => {
    const m = cards[i];
    const best = world.best[m.id] ?? 0;
    ctx.fillStyle = world.hoverMission === m.id ? '#2c2417' : '#1c1812';
    ctx.fillRect(rect.x, rect.y, rect.w, rect.h);
    ctx.strokeStyle = world.hoverMission === m.id ? '#ffb84d' : '#8a7a58';
    ctx.lineWidth = 2;
    ctx.strokeRect(rect.x, rect.y, rect.w, rect.h);
    ctx.fillStyle = '#ffb84d';
    ctx.font = 'bold 26px system-ui, sans-serif';
    ctx.fillText(`${i + 1}  ${m.name}`, rect.x + rect.w / 2, rect.y + 44);
    ctx.fillStyle = '#e8dcc0';
    ctx.font = '16px system-ui, sans-serif';
    ctx.fillText(m.tag, rect.x + rect.w / 2, rect.y + 76);
    ctx.fillStyle = '#8ff7ff';
    ctx.font = '15px system-ui, sans-serif';
    ctx.fillText(best > 0 ? `BEST ${best}` : 'NOT FLOWN YET', rect.x + rect.w / 2, rect.y + 108);
    ctx.fillStyle = '#b8a888';
    ctx.font = '13px system-ui, sans-serif';
    ctx.fillText('CLICK OR PRESS ' + (i + 1), rect.x + rect.w / 2, rect.y + 140);
  });
  ctx.fillStyle = '#e8dcc0';
  ctx.font = '16px system-ui, sans-serif';
  ctx.fillText('Arrows fly, W/S throttle, Q/E rudder, C cockpit view, P pause, R restart, M sound', w / 2, 516);
  ctx.fillText('Mouse: drag to steer. Land gently on a strip to refuel — hard hits break the plane.', w / 2, 544);
  ctx.fillStyle = 'rgba(16, 14, 12, 0.6)';
  ctx.fillRect(w / 2 - 260, h - 44, 520, 26);
  ctx.fillStyle = '#d8c9a3';
  ctx.font = '14px system-ui, sans-serif';
  ctx.fillText('A game by yansz54 — built for make.fun, no network, no libraries', w / 2, h - 26);
}

export function drawScreens(ctx, w, h, world) {
  if (world.screen === 'pause') {
    panel(ctx, w, h, 'PAUSED', ['The valley waits. The fuel does not.'], 'Press P to keep flying');
  } else if (world.screen === 'complete') {
    const lines = world.summaryLines ?? [];
    panel(ctx, w, h, world.completeTitle ?? 'MISSION COMPLETE', lines, 'Press R to fly again — or 1, 2, 3 for another mission');
  } else if (world.screen === 'crash') {
    panel(ctx, w, h, 'CRASHED', [world.crashReason ?? 'The ridge always wins.', `Score ${world.score} — best ${world.best[world.mission.id] ?? 0}`], 'Press R to fly again');
  }
}

/** Full frame: sky, terrain, rings, plane or cockpit, HUD, and any screen. */
export function renderWorld(ctx, w, h, world) {
  const cam = makeCamera(world);
  if (world.screen === 'title') {
    drawTitle(ctx, w, h, world);
    return;
  }
  drawSky(ctx, w, h, cam, world.time);
  drawTerrain(ctx, w, h, cam, world.terrain);
  drawRings(ctx, w, h, cam, world.mission);
  if (world.view === 'cockpit') drawCockpit(ctx, w, h, world.plane);
  else drawAircraft(ctx, w, h, world.plane, world.time);
  drawHUD(ctx, w, h, world);
  drawScreens(ctx, w, h, world);
}
