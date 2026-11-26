// Procedural sound, no audio files: an engine drone that follows the throttle,
// wind that follows speed, a chime for a ring, a thud for a crash. Everything
// is guarded — headless runs and muted browsers simply stay silent.
export class AudioBus {
  constructor() {
    this.ctx = null;
    this.muted = false;
    this.engine = null;
    this.engineGain = null;
    this.wind = null;
    this.windGain = null;
  }

  /** Call from a user gesture; safe to call any number of times. */
  unlock() {
    if (this.ctx || this.muted) return;
    try {
      const AC = window.AudioContext ?? window.webkitAudioContext;
      if (!AC) return;
      this.ctx = new AC();
      const engine = this.ctx.createOscillator();
      engine.type = 'sawtooth';
      engine.frequency.value = 55;
      const engineFilter = this.ctx.createBiquadFilter();
      engineFilter.type = 'lowpass';
      engineFilter.frequency.value = 320;
      this.engineGain = this.ctx.createGain();
      this.engineGain.gain.value = 0;
      engine.connect(engineFilter);
      engineFilter.connect(this.engineGain);
      this.engineGain.connect(this.ctx.destination);
      engine.start();
      this.engine = engine;
      const noise = this.ctx.createBuffer(1, this.ctx.sampleRate, this.ctx.sampleRate);
      const data = noise.getChannelData(0);
      for (let i = 0; i < data.length; i += 1) data[i] = Math.random() * 2 - 1;
      const src = this.ctx.createBufferSource();
      src.buffer = noise;
      src.loop = true;
      const windFilter = this.ctx.createBiquadFilter();
      windFilter.type = 'bandpass';
      windFilter.frequency.value = 500;
      this.windGain = this.ctx.createGain();
      this.windGain.gain.value = 0;
      src.connect(windFilter);
      windFilter.connect(this.windGain);
      this.windGain.connect(this.ctx.destination);
      src.start();
      this.wind = src;
    } catch {
      this.ctx = null;
    }
  }

  /** Called every frame with the live flight state. */
  update(throttle, speed, flying) {
    if (!this.ctx || this.muted) return;
    try {
      if (this.ctx.state === 'suspended') void this.ctx.resume();
      const t = this.ctx.currentTime;
      this.engineGain.gain.setTargetAtTime(flying ? 0.05 + throttle * 0.06 : 0, t, 0.1);
      this.engine.frequency.setTargetAtTime(48 + throttle * 46 + speed * 0.2, t, 0.1);
      this.windGain.gain.setTargetAtTime(flying ? Math.min(0.05, speed * 0.0006) : 0, t, 0.2);
    } catch {
      // Sound never breaks the game.
    }
  }

  blip(freq, dur, type = 'sine', vol = 0.12) {
    if (!this.ctx || this.muted) return;
    try {
      const t = this.ctx.currentTime;
      const o = this.ctx.createOscillator();
      o.type = type;
      o.frequency.value = freq;
      const g = this.ctx.createGain();
      g.gain.setValueAtTime(vol, t);
      g.gain.exponentialRampToValueAtTime(0.001, t + dur);
      o.connect(g);
      g.connect(this.ctx.destination);
      o.start(t);
      o.stop(t + dur);
    } catch {
      // Sound never breaks the game.
    }
  }

  ring() {
    this.blip(880, 0.25);
    setTimeout(() => this.blip(1318, 0.3), 70);
  }

  delivery() {
    this.blip(659, 0.2);
    setTimeout(() => this.blip(880, 0.2), 90);
    setTimeout(() => this.blip(1046, 0.35), 180);
  }

  thud() {
    this.blip(70, 0.4, 'triangle', 0.25);
  }

  toggleMute() {
    this.muted = !this.muted;
    if (this.engineGain) this.engineGain.gain.value = 0;
    if (this.windGain) this.windGain.gain.value = 0;
    return this.muted;
  }
}
