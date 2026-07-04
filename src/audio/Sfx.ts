/**
 * Sfx.ts — tiny procedural sound effects via the Web Audio API.
 *
 * No audio files to ship: a "cheer" (filtered noise swell + a little rising
 * sparkle) for a goal, and a "groan" (a falling, muffled tone) for a save/miss.
 * They're stylised, not real crowd recordings — good enough for feel, and easy
 * to swap for sampled audio later. Sound is optional in v2 (PRD §11).
 *
 * Browsers block audio until a user gesture, so unlock() is called on the first
 * touch and creates/resumes the AudioContext then.
 */

import { CONFIG } from '../config';

export class Sfx {
  private ctx?: AudioContext;
  private master?: GainNode;

  /** Create/resume the AudioContext. Safe to call repeatedly; no-op if disabled. */
  unlock(): void {
    if (!CONFIG.SOUND.enabled) return;
    if (!this.ctx) {
      const AC: typeof AudioContext | undefined =
        window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!AC) return;
      this.ctx = new AC();
      this.master = this.ctx.createGain();
      this.master.gain.value = CONFIG.SOUND.volume;
      this.master.connect(this.ctx.destination);
    }
    if (this.ctx.state === 'suspended') void this.ctx.resume();
  }

  private noiseSource(dur: number): AudioBufferSourceNode | null {
    if (!this.ctx) return null;
    const sr = this.ctx.sampleRate;
    const len = Math.max(1, Math.floor(sr * dur));
    const buf = this.ctx.createBuffer(1, len, sr);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
    const src = this.ctx.createBufferSource();
    src.buffer = buf;
    return src;
  }

  /** Crowd cheer for a goal. */
  cheer(): void {
    if (!CONFIG.SOUND.enabled || !this.ctx || !this.master) return;
    const t0 = this.ctx.currentTime;

    // Band-passed noise that swells then fades = a crowd roar.
    const src = this.noiseSource(1.1);
    if (!src) return;
    const bp = this.ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = 1100;
    bp.Q.value = 0.6;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(0.55, t0 + 0.12);
    g.gain.exponentialRampToValueAtTime(0.3, t0 + 0.45);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + 1.1);
    src.connect(bp).connect(g).connect(this.master);
    src.start(t0);
    src.stop(t0 + 1.1);

    // A short rising sparkle on top.
    const o = this.ctx.createOscillator();
    o.type = 'triangle';
    o.frequency.setValueAtTime(520, t0);
    o.frequency.exponentialRampToValueAtTime(950, t0 + 0.25);
    const og = this.ctx.createGain();
    og.gain.setValueAtTime(0.0001, t0);
    og.gain.exponentialRampToValueAtTime(0.12, t0 + 0.1);
    og.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.55);
    o.connect(og).connect(this.master);
    o.start(t0);
    o.stop(t0 + 0.55);
  }

  /** A sharp metallic "clang" for a shot that hits the post/crossbar (Track A3):
   *  two closely-detuned tones with a fast decay, plus a brief noise transient
   *  for the impact texture. */
  postPing(): void {
    if (!CONFIG.SOUND.enabled || !this.ctx || !this.master) return;
    const t0 = this.ctx.currentTime;
    const ctx = this.ctx;
    const master = this.master;

    [1400, 2100].forEach((freq, i) => {
      const o = ctx.createOscillator();
      o.type = 'triangle';
      o.frequency.setValueAtTime(freq, t0);
      o.frequency.exponentialRampToValueAtTime(freq * 0.6, t0 + 0.18);
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, t0);
      g.gain.exponentialRampToValueAtTime(i === 0 ? 0.25 : 0.14, t0 + 0.008);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.22);
      o.connect(g).connect(master);
      o.start(t0);
      o.stop(t0 + 0.22);
    });

    const n = this.noiseSource(0.06);
    if (n) {
      const hp = ctx.createBiquadFilter();
      hp.type = 'highpass';
      hp.frequency.value = 2000;
      const ng = ctx.createGain();
      ng.gain.setValueAtTime(0.3, t0);
      ng.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.05);
      n.connect(hp).connect(ng).connect(master);
      n.start(t0);
      n.stop(t0 + 0.06);
    }
  }

  /** A single soft low thump (Track B5) — one beat of tension as a decisive
   *  (sudden-death / last-kick) attempt begins. Not a looping heartbeat, just
   *  one honest pulse; a real loop would need a continuous ambient bed we don't
   *  have yet. */
  heartbeat(): void {
    if (!CONFIG.SOUND.enabled || !this.ctx || !this.master) return;
    const t0 = this.ctx.currentTime;
    const o = this.ctx.createOscillator();
    o.type = 'sine';
    o.frequency.setValueAtTime(60, t0);
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(0.35, t0 + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.22);
    o.connect(g).connect(this.master);
    o.start(t0);
    o.stop(t0 + 0.22);
  }

  /** Disappointed "ohh" for a save or miss. */
  groan(): void {
    if (!CONFIG.SOUND.enabled || !this.ctx || !this.master) return;
    const t0 = this.ctx.currentTime;
    const o = this.ctx.createOscillator();
    o.type = 'sawtooth';
    o.frequency.setValueAtTime(250, t0);
    o.frequency.exponentialRampToValueAtTime(150, t0 + 0.5);
    const lp = this.ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 700;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(0.22, t0 + 0.1);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.6);
    o.connect(lp).connect(g).connect(this.master);
    o.start(t0);
    o.stop(t0 + 0.6);
  }
}
