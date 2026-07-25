/* ══════════════════════════════════════════════════════════════════
   NYX-7 — generative ambient score
   Everything is synthesised at runtime: no audio files, no network.
   Design brief: non-intrusive, slow, wide. Nothing percussive, nothing
   that competes with the visual. Master ceiling is deliberately low.
   ══════════════════════════════════════════════════════════════════ */

const mtof = (m) => 440 * Math.pow(2, (m - 69) / 12);

/* Slow four-chord cycle, each held for a full bar of ~15 s. */
const PROGRESSION = [
  { root: 33, notes: [57, 60, 64, 71] },   // Am9
  { root: 29, notes: [53, 57, 60, 64] },   // Fmaj7
  { root: 36, notes: [60, 64, 67, 74] },   // Cmaj9
  { root: 31, notes: [55, 59, 62, 69] },   // Gsus / Bm
];
const BELL_SCALE = [69, 72, 74, 76, 79, 81, 84, 86];

export class AmbientScore {
  constructor() {
    this.ctx = null;
    this.ready = false;
    this.enabled = false;
    this.volume = 0.55;
    this.chordIndex = 0;
    this._timers = [];
    this._ducked = false;
  }

  /* ── graph ───────────────────────────────────────────────────── */
  async start() {
    if (this.ready) return this.resume();

    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    const ctx = this.ctx = new AC({ latencyHint: 'playback' });
    if (ctx.state === 'suspended') await ctx.resume();

    // master ─ limiter ─ out
    const limiter = ctx.createDynamicsCompressor();
    limiter.threshold.value = -14;
    limiter.knee.value = 22;
    limiter.ratio.value = 8;
    limiter.attack.value = 0.02;
    limiter.release.value = 0.35;
    limiter.connect(ctx.destination);

    const master = this.master = ctx.createGain();
    master.gain.value = 0;
    master.connect(limiter);

    // Gentle high shelf cut so the pad never gets brittle on phone speakers
    const tilt = ctx.createBiquadFilter();
    tilt.type = 'highshelf';
    tilt.frequency.value = 4200;
    tilt.gain.value = -6;
    tilt.connect(master);
    this.bus = tilt;

    // Reverb — procedurally generated impulse response
    const verb = this.verb = ctx.createConvolver();
    verb.buffer = this._impulse(3.6, 2.6);
    const verbGain = ctx.createGain();
    verbGain.gain.value = 0.9;
    verb.connect(verbGain).connect(this.bus);
    this.send = ctx.createGain();
    this.send.gain.value = 1;
    this.send.connect(verb);

    this._buildDrone();
    this._buildAir();

    this.ready = true;
    this.enabled = true;
    this._fade(this.volume, 4.5);

    this._cycle();                       // pad progression
    this._scheduleBell();                // sparse melodic motes

    document.addEventListener('visibilitychange', () => this._autoDuck());
  }

  /** Exponentially decaying stereo noise → a clean, smooth tail. */
  _impulse(seconds, decay) {
    const ctx = this.ctx;
    const len = Math.floor(ctx.sampleRate * seconds);
    const buf = ctx.createBuffer(2, len, ctx.sampleRate);
    for (let ch = 0; ch < 2; ch++) {
      const d = buf.getChannelData(ch);
      let b0 = 0, b1 = 0, b2 = 0;
      for (let i = 0; i < len; i++) {
        const w = Math.random() * 2 - 1;
        // light pinking so the tail is warm rather than hissy
        b0 = 0.99765 * b0 + w * 0.0990460;
        b1 = 0.96300 * b1 + w * 0.2965164;
        b2 = 0.57000 * b2 + w * 1.0526913;
        const pink = (b0 + b1 + b2 + w * 0.1848) * 0.16;
        const env = Math.pow(1 - i / len, decay);
        const preDelay = i < ctx.sampleRate * 0.02 ? 0 : 1;
        d[i] = pink * env * preDelay;
      }
    }
    return buf;
  }

  /* ── continuous layers ───────────────────────────────────────── */
  _buildDrone() {
    const ctx = this.ctx;
    const g = this.droneGain = ctx.createGain();
    g.gain.value = 0.0;
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 220;
    g.connect(lp).connect(this.bus);

    const o = this.drone = ctx.createOscillator();
    o.type = 'sine';
    o.frequency.value = mtof(PROGRESSION[0].root);
    const o2 = this.drone2 = ctx.createOscillator();
    o2.type = 'triangle';
    o2.frequency.value = mtof(PROGRESSION[0].root + 12);
    const g2 = ctx.createGain();
    g2.gain.value = 0.22;
    o2.connect(g2).connect(g);
    o.connect(g);
    o.start(); o2.start();
    g.gain.linearRampToValueAtTime(0.16, ctx.currentTime + 8);
  }

  _buildAir() {
    const ctx = this.ctx;
    const len = ctx.sampleRate * 4;
    const buf = ctx.createBuffer(2, len, ctx.sampleRate);
    for (let ch = 0; ch < 2; ch++) {
      const d = buf.getChannelData(ch);
      let last = 0;
      for (let i = 0; i < len; i++) {
        last = last * 0.982 + (Math.random() * 2 - 1) * 0.018;
        d[i] = last * 6;
      }
    }
    const src = ctx.createBufferSource();
    src.buffer = buf; src.loop = true;

    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass'; bp.frequency.value = 900; bp.Q.value = 1.1;

    const pan = ctx.createStereoPanner ? ctx.createStereoPanner() : null;
    const g = ctx.createGain();
    g.gain.value = 0.0;

    const lfo = ctx.createOscillator(); lfo.frequency.value = 0.035;
    const lfoG = ctx.createGain(); lfoG.gain.value = 420;
    lfo.connect(lfoG).connect(bp.frequency);
    lfo.start();

    if (pan) {
      const plfo = ctx.createOscillator(); plfo.frequency.value = 0.021;
      const plfoG = ctx.createGain(); plfoG.gain.value = 0.75;
      plfo.connect(plfoG).connect(pan.pan);
      plfo.start();
      src.connect(bp).connect(pan).connect(g);
    } else {
      src.connect(bp).connect(g);
    }
    g.connect(this.bus);
    g.connect(this.send);
    src.start();
    g.gain.linearRampToValueAtTime(0.030, this.ctx.currentTime + 12);
  }

  /* ── pad progression ─────────────────────────────────────────── */
  _cycle() {
    if (!this.ready) return;
    const chord = PROGRESSION[this.chordIndex % PROGRESSION.length];
    this.chordIndex++;

    const t = this.ctx.currentTime;
    this.drone.frequency.setTargetAtTime(mtof(chord.root), t, 2.4);
    this.drone2.frequency.setTargetAtTime(mtof(chord.root + 12), t, 2.4);

    chord.notes.forEach((n, i) => this._padVoice(n, t + i * 0.55, 15.5));

    this._timers.push(setTimeout(() => this._cycle(), 14200));
  }

  _padVoice(midi, at, dur) {
    const ctx = this.ctx;
    const f = mtof(midi);

    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, at);
    g.gain.linearRampToValueAtTime(0.055, at + 5.0);
    g.gain.linearRampToValueAtTime(0.040, at + dur - 5.5);
    g.gain.linearRampToValueAtTime(0.0001, at + dur);

    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.setValueAtTime(420, at);
    lp.frequency.linearRampToValueAtTime(1150, at + 6);
    lp.frequency.linearRampToValueAtTime(520, at + dur);
    lp.Q.value = 0.6;

    lp.connect(g);
    g.connect(this.bus);
    const s = ctx.createGain(); s.gain.value = 0.55;
    g.connect(s).connect(this.send);

    const oscs = [];
    for (const [type, detune, lvl] of [['sawtooth', -7, 0.30], ['sawtooth', 7, 0.30], ['triangle', 0, 0.55], ['sine', -1200, 0.40]]) {
      const o = ctx.createOscillator();
      o.type = type;
      o.frequency.value = f;
      o.detune.value = detune;
      const og = ctx.createGain(); og.gain.value = lvl;
      o.connect(og).connect(lp);
      o.start(at);
      o.stop(at + dur + 0.4);
      oscs.push(o);
    }

    // slow vibrato — keeps the pad alive without wobbling
    const vib = ctx.createOscillator(); vib.frequency.value = 0.16 + Math.random() * 0.1;
    const vibG = ctx.createGain(); vibG.gain.value = 2.2;
    oscs.forEach(o => vib.connect(vibG).connect(o.detune));
    vib.start(at); vib.stop(at + dur + 0.4);
  }

  /* ── sparse bells ────────────────────────────────────────────── */
  _scheduleBell() {
    const wait = 5200 + Math.random() * 9000;
    this._timers.push(setTimeout(() => {
      if (this.ready && !this._ducked) this._bell();
      this._scheduleBell();
    }, wait));
  }

  _bell() {
    const ctx = this.ctx;
    const at = ctx.currentTime + 0.02;
    const midi = BELL_SCALE[Math.floor(Math.random() * BELL_SCALE.length)];
    const f = mtof(midi);

    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, at);
    g.gain.exponentialRampToValueAtTime(0.045, at + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, at + 3.6);

    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass'; lp.frequency.value = 2600;
    lp.connect(g);
    g.connect(this.bus);
    const s = ctx.createGain(); s.gain.value = 0.85;
    g.connect(s).connect(this.send);

    const carrier = ctx.createOscillator();
    carrier.type = 'sine'; carrier.frequency.value = f;
    const mod = ctx.createOscillator();
    mod.type = 'sine'; mod.frequency.value = f * 2.01;
    const modG = ctx.createGain(); modG.gain.value = f * 0.7;
    modG.gain.setValueAtTime(f * 0.7, at);
    modG.gain.exponentialRampToValueAtTime(0.01, at + 0.9);
    mod.connect(modG).connect(carrier.frequency);
    carrier.connect(lp);

    carrier.start(at); mod.start(at);
    carrier.stop(at + 3.8); mod.stop(at + 3.8);
  }

  /* ── interface sounds ────────────────────────────────────────── */
  tick(pitch = 1) {
    if (!this.ready || !this.enabled) return;
    const ctx = this.ctx, at = ctx.currentTime;
    const o = ctx.createOscillator();
    o.type = 'triangle';
    o.frequency.setValueAtTime(1180 * pitch, at);
    o.frequency.exponentialRampToValueAtTime(760 * pitch, at + 0.07);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, at);
    g.gain.exponentialRampToValueAtTime(0.030, at + 0.006);
    g.gain.exponentialRampToValueAtTime(0.0001, at + 0.13);
    o.connect(g); g.connect(this.bus);
    const s = ctx.createGain(); s.gain.value = 0.4;
    g.connect(s).connect(this.send);
    o.start(at); o.stop(at + 0.15);
  }

  swoosh() {
    if (!this.ready || !this.enabled) return;
    const ctx = this.ctx, at = ctx.currentTime;
    const len = Math.floor(ctx.sampleRate * 0.5);
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const src = ctx.createBufferSource(); src.buffer = buf;
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass'; bp.Q.value = 2.4;
    bp.frequency.setValueAtTime(420, at);
    bp.frequency.exponentialRampToValueAtTime(2400, at + 0.34);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, at);
    g.gain.exponentialRampToValueAtTime(0.030, at + 0.05);
    g.gain.exponentialRampToValueAtTime(0.0001, at + 0.45);
    src.connect(bp).connect(g); g.connect(this.bus);
    const s = ctx.createGain(); s.gain.value = 0.7;
    g.connect(s).connect(this.send);
    src.start(at);
  }

  /* ── control ─────────────────────────────────────────────────── */
  _fade(to, seconds) {
    if (!this.master) return;
    const t = this.ctx.currentTime;
    this.master.gain.cancelScheduledValues(t);
    this.master.gain.setValueAtTime(Math.max(0.0001, this.master.gain.value), t);
    this.master.gain.linearRampToValueAtTime(Math.max(0.0001, to), t + seconds);
  }

  setVolume(v) {
    this.volume = v;
    if (this.ready && this.enabled && !this._ducked) this._fade(v, 0.4);
  }

  setEnabled(on) {
    this.enabled = on;
    if (!this.ready) return;
    this._fade(on ? this.volume : 0, on ? 1.4 : 0.9);
    if (on && this.ctx.state === 'suspended') this.ctx.resume();
  }

  resume() {
    if (this.ctx && this.ctx.state === 'suspended') this.ctx.resume();
  }

  _autoDuck() {
    if (!this.ready) return;
    this._ducked = document.hidden;
    if (!this.enabled) return;
    this._fade(document.hidden ? 0 : this.volume, document.hidden ? 0.6 : 1.6);
  }
}
