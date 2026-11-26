// Ember Ridge — Ring Runner. Tuning constants: one place for every number the
// flight model, the missions and the renderer agree on.
export const WORLD = {
  minX: -1800,
  maxX: 1800,
  minZ: -300,
  maxZ: 3800,
  cell: 8, // heightmap grid step in metres
  waterLevel: 11,
};

export const PLANE = {
  maxSpeed: 95, // m/s, full throttle level flight
  stallSpeed: 30, // m/s, below this the wing stops flying
  cruiseSpeed: 62,
  accel: 14, // m/s^2 at full throttle
  drag: 0.09, // 1/s, quadratic-ish drag factor
  rollRate: 1.9, // rad/s at full aileron
  maxRoll: 1.05, // rad, about 60 degrees of bank
  pitchRate: 0.85, // rad/s at full elevator
  maxPitch: 0.55, // rad
  yawRate: 0.22, // rad/s rudder
  fuelCapacity: 100,
  fuelBurnIdle: 0.22, // units/s
  fuelBurnFull: 0.62, // units/s at full throttle
  crashDamage: 100,
  hardLandingDamage: 25,
};

export const CAMERA = {
  fov: (80 * Math.PI) / 180,
  horizon: 0.45, // fraction of screen height where the level horizon sits
  chaseDistance: 26, // metres behind the plane in chase view
  chaseHeight: 7, // metres above the plane in chase view
  far: 1500, // metres, terrain draw distance
};

export const SCORING = {
  ringBase: 100,
  ringCentreBonus: 50,
  landing: 500,
  delivery: 800,
  rescue: 1200,
  nearMiss: 25,
};

export const MISSIONS = [
  { id: 'rings', num: 1, name: 'RING RUN', tag: '14 rings, best time', par: 150 },
  { id: 'mail', num: 2, name: 'MAIL RUN', tag: 'Land at 3 strips', par: 420 },
  { id: 'rescue', num: 3, name: 'DUSK RESCUE', tag: 'Reach the beacon', par: 240 },
];

export const COLORS = {
  skyTop: '#1c2342',
  skyMid: '#5a4a72',
  skyHorizon: '#e8863c',
  skyLow: '#f7c98a',
  sun: '#ffd9a0',
  fog: '#d99a6b',
};
