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
