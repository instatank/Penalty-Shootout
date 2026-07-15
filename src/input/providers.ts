/**
 * providers.ts — the input-provider abstraction that makes online cheap (PRD §8).
 *
 * Both the taker's action and the keeper's action arrive through ONE interface.
 * The game loop asks the provider for an input and NEVER branches on "is this
 * CPU or human." Swapping providers swaps the opponent:
 *   • Solo Taker  = LocalHumanProvider (taker) + CpuProvider (keeper)   ← M4
 *   • Solo Keeper = CpuProvider (taker) + LocalHumanProvider (keeper)   ← M5
 *   • Online      = LocalHumanProvider + RemoteProvider                 ← M8
 *
 * The methods take a PenaltyContext (seed + live geometry) so inputs can be
 * built deterministically; this is a small, deliberate extension of the PRD's
 * bare signatures and keeps the "same loop, swapped providers" property intact.
 */

import { CONFIG } from '../config';
import { ZONE_IDS, zoneIndices, zoneFrom, type Rect, type ZoneId } from '../game/zones';
import { finalizeShot, cpuShot, type Aim } from '../game/aim';
import { seededRandom, type TakerInput, type KeeperInput } from '../game/resolve';
import type { SwipeSample } from './SwipeInput';

export interface PenaltyContext {
  seed: number; // shared per-kick seed (deterministic outcomes)
  goal: Rect; // live goal mouth
}

// ── Difficulty lerps (owner 2026-07-15) ─────────────────────────────────────
// ONE 0..1 difficulty knob (CONFIG.CPU_KEEPER.difficulty / the EASY-MED-HARD
// button) now scales BOTH CPUs: the keeper you shoot against AND the taker you
// defend against. These small pure helpers keep the lerp in one place — the
// provider uses them for behaviour, the scene for the matching visuals (tell
// lean size, replayed dive timing).

function lerpByDifficulty(easy: number, hard: number, difficulty: number): number {
  const d = difficulty < 0 ? 0 : difficulty > 1 ? 1 : difficulty;
  return easy + (hard - easy) * d;
}

/** ms after the strike the CPU keeper commits its dive (hard = snappier). */
export function cpuKeeperReactionMs(difficulty: number): number {
  const k = CONFIG.CPU_KEEPER;
  return lerpByDifficulty(k.reactionDelayEasy, k.reactionDelayHard, difficulty);
}

/** How obvious the CPU taker's pre-strike body lean is (hard = subtler). */
export function cpuTellStrength(difficulty: number): number {
  const c = CONFIG.CPU_TAKER;
  return lerpByDifficulty(c.tellStrengthEasy, c.tellStrengthHard, difficulty);
}

/** The CPU taker's release-power range (hard = faster shots = shorter windows). */
export function cpuTakerPowerRange(difficulty: number): { min: number; max: number } {
  const c = CONFIG.CPU_TAKER;
  return {
    min: lerpByDifficulty(c.powerMinEasy, c.powerMinHard, difficulty),
    max: lerpByDifficulty(c.powerMaxEasy, c.powerMaxHard, difficulty),
  };
}

export interface InputProvider {
  // null = the wait was cancelled (e.g. a resize) and the loop should retry.
  getTakerInput(ctx: PenaltyContext): Promise<TakerInput | null>;
  // null = cancelled, same as the taker. (CPU resolves instantly and never null.)
  getKeeperInput(ctx: PenaltyContext, taker: TakerInput): Promise<KeeperInput | null>;
}

/**
 * Reads a live human — as the TAKER (M4) or the KEEPER (M5).
 *  • As taker: the scene feeds completed swipes via submitSwipe().
 *  • As keeper: getKeeperInput() asks the scene to PRESENT the CPU shot (via the
 *    onAwaitKeeper hook the scene registers) so the human can watch and dive; the
 *    scene then feeds the dive back via submitDive().
 * The kick loop only ever sees the InputProvider interface, so it cannot tell a
 * human from a CPU — swapping providers is all that switches modes (PRD §8).
 */
export class LocalHumanProvider implements InputProvider {
  private resolveTaker?: (t: TakerInput | null) => void;
  private resolveKeeper?: (k: KeeperInput | null) => void;
  private ctx?: PenaltyContext;

  /**
   * Registered by the scene. Called when getKeeperInput() starts so the scene
   * can play the tell + ball flight and open the dive window. Kept as a plain
   * callback (no Phaser types) so this provider stays engine-agnostic.
   */
  onAwaitKeeper?: (ctx: PenaltyContext, taker: TakerInput) => void;

  getTakerInput(ctx: PenaltyContext): Promise<TakerInput | null> {
    this.ctx = ctx;
    return new Promise<TakerInput | null>((resolve) => {
      this.resolveTaker = resolve;
    });
  }

  /** True while a swipe is being awaited (scene gates input on this). */
  isAwaitingTaker(): boolean {
    return !!this.resolveTaker;
  }

  /** Called by the scene when a valid swipe completes; finalizes the shot. */
  submitSwipe(sample: SwipeSample, aim: Aim): boolean {
    if (!this.resolveTaker || !this.ctx) return false;
    const taker = finalizeShot(aim, sample, this.ctx.goal, this.ctx.seed);
    const resolve = this.resolveTaker;
    this.resolveTaker = undefined;
    this.ctx = undefined;
    resolve(taker);
    return true;
  }

  /**
   * Abort ANY pending wait (e.g. on resize or a mode switch). MUST resolve the
   * outstanding promise (with null) — otherwise the loop's `await get…Input()`
   * would hang forever and no later input could ever resolve it.
   */
  cancel(): void {
    const t = this.resolveTaker;
    const k = this.resolveKeeper;
    this.resolveTaker = undefined;
    this.resolveKeeper = undefined;
    this.ctx = undefined;
    t?.(null);
    k?.(null);
  }

  // ── Human as KEEPER (Milestone 5) ──────────────────────────────────────────
  getKeeperInput(ctx: PenaltyContext, taker: TakerInput): Promise<KeeperInput | null> {
    return new Promise<KeeperInput | null>((resolve) => {
      this.resolveKeeper = resolve;
      // Ask the scene to present the shot + open the dive window. If no scene is
      // wired (shouldn't happen in Keeper mode) the promise simply waits for a
      // submitDive()/cancel(), so the loop never deadlocks.
      this.onAwaitKeeper?.(ctx, taker);
    });
  }

  /** True while a dive is being awaited (scene gates dive input on this). */
  isAwaitingKeeper(): boolean {
    return !!this.resolveKeeper;
  }

  /**
   * Called by the scene once the dive window closes, with the human's dive (or a
   * "no dive" default). Resolves the pending getKeeperInput().
   */
  submitDive(diveZone: ZoneId, diveTiming: number): boolean {
    if (!this.resolveKeeper) return false;
    const resolve = this.resolveKeeper;
    this.resolveKeeper = undefined;
    resolve({ diveZone, diveTiming });
    return true;
  }
}

/**
 * Generates the CPU's action.
 *  • As keeper (solo Taker mode, M4): guesses a dive zone + timing from difficulty.
 *  • As taker  (solo Keeper mode, M5): commits a {zone, power, curve} shot.
 * Everything is derived from the kick `seed`, so the CPU is deterministic too.
 */
export class CpuProvider implements InputProvider {
  /** Live difficulty override (0..1). Falls back to CONFIG.CPU_KEEPER.difficulty.
   *  Lets the owner change difficulty on the fly while playtesting (Phase 2).
   *  Drives BOTH roles (2026-07-15): the keeper's read/reaction AND the taker's
   *  shot pace + tell subtlety. */
  difficulty?: number;

  getKeeperInput(ctx: PenaltyContext, taker: TakerInput): Promise<KeeperInput | null> {
    const k = CONFIG.CPU_KEEPER;
    const difficulty = this.difficulty ?? k.difficulty;

    // Zone-guess accuracy scales with the difficulty knob — this is the keeper's
    // READ. Difficulty is directional: the CPU commits on time (below), so it is
    // beaten by a wrong read or a true corner, not by fumbled timing (Phase 2).
    const acc = k.guessAccuracyMin + (k.guessAccuracyMax - k.guessAccuracyMin) * difficulty;
    // Track A5: read the taker's AIMED (intended) zone, not the post-scatter
    // landing zone. Reading the landing zone let the keeper "see" exactly where
    // the ball would end up regardless of scatter — a lucky/unlucky scatter
    // could never wrong-foot it, undermining the whole power/accuracy tradeoff.
    const aim = taker.targetZone ?? taker.landingZone ?? 'BM';
    const { col, row } = zoneIndices(aim);

    let guessCol: number;
    let guessRow: number;
    if (seededRandom(ctx.seed, 10) < acc) {
      // Good read: right column, usually right row.
      guessCol = col;
      const rowAcc = k.rowAccuracyMin + (k.rowAccuracyMax - k.rowAccuracyMin) * difficulty;
      guessRow = seededRandom(ctx.seed, 12) < rowAcc ? row : row === 0 ? 1 : 0;
    } else {
      // Wrong read: commit to a different column.
      const others = [0, 1, 2].filter((c) => c !== col);
      guessCol = others[Math.floor(seededRandom(ctx.seed, 13) * others.length)];
      guessRow = Math.floor(seededRandom(ctx.seed, 14) * 2);
    }
    const diveZone = zoneFrom(guessCol, guessRow);

    // The CPU commits its dive a beat after the strike (difficulty-lerped
    // reaction ± jitter — a hard keeper snaps, an easy one hesitates). Since
    // Track A2 this commit moment is judged by resolvePenalty as the start
    // of the hands' travel, RACING the ball's flight — so a blasted shot arrives
    // before the hands do, while a soft shot gives them time. Beatability is now
    // direction + corners + genuine shot speed.
    const diveTiming = cpuKeeperReactionMs(difficulty) + (seededRandom(ctx.seed, 11) * 2 - 1) * k.timingJitterMs;

    return Promise.resolve({ diveZone, diveTiming });
  }

  // ── CPU as TAKER (Milestone 5) ─────────────────────────────────────────────
  getTakerInput(ctx: PenaltyContext): Promise<TakerInput | null> {
    const c = CONFIG.CPU_TAKER;
    // The SAME difficulty knob that tunes the CPU keeper also tunes how the CPU
    // shoots AT you (owner 2026-07-15): harder = faster shots (shorter reaction
    // windows — the power range lerps up, and power drives kickFlightMs).
    const difficulty = this.difficulty ?? CONFIG.CPU_KEEPER.difficulty;

    // 1) Pick a target zone by the weighted distribution (corners favoured).
    const targetZone = this.pickWeightedZone(c.targetWeights, seededRandom(ctx.seed, 20));

    // 2) Pick power (within the difficulty-lerped range) and a small curve, seeded.
    const { min: pMin, max: pMax } = cpuTakerPowerRange(difficulty);
    const power = pMin + (pMax - pMin) * seededRandom(ctx.seed, 21);
    const curve = (seededRandom(ctx.seed, 22) * 2 - 1) * c.curveJitter;

    // 3) Land it deterministically (same scatter rule as a human shot).
    return Promise.resolve(cpuShot(targetZone, power, curve, ctx.goal, ctx.seed));
  }

  /** Choose a zone from relative weights (ZONE_IDS order) using r ∈ [0,1). */
  private pickWeightedZone(weights: readonly number[], r: number): ZoneId {
    const total = weights.reduce((a, b) => a + b, 0);
    let acc = r * total;
    for (let i = 0; i < ZONE_IDS.length; i++) {
      acc -= weights[i];
      if (acc < 0) return ZONE_IDS[i];
    }
    return ZONE_IDS[ZONE_IDS.length - 1];
  }
}
