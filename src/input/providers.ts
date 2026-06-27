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
import type { Rect } from '../game/zones';
import { zoneIndices, zoneFrom } from '../game/zones';
import { finalizeShot, type Aim } from '../game/aim';
import { seededRandom, type TakerInput, type KeeperInput } from '../game/resolve';
import type { SwipeSample } from './SwipeInput';

export interface PenaltyContext {
  seed: number; // shared per-kick seed (deterministic outcomes)
  goal: Rect; // live goal mouth
}

export interface InputProvider {
  // null = the wait was cancelled (e.g. a resize) and the loop should retry.
  getTakerInput(ctx: PenaltyContext): Promise<TakerInput | null>;
  getKeeperInput(ctx: PenaltyContext, taker: TakerInput): Promise<KeeperInput>;
}

/** Reads a live human. The scene feeds completed swipes via submitSwipe(). */
export class LocalHumanProvider implements InputProvider {
  private resolveTaker?: (t: TakerInput | null) => void;
  private ctx?: PenaltyContext;

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
   * Abort a pending wait (e.g. on resize). MUST resolve the outstanding promise
   * (with null) — otherwise the loop's `await getTakerInput()` would hang forever
   * and no later swipe could ever resolve it.
   */
  cancel(): void {
    const resolve = this.resolveTaker;
    this.resolveTaker = undefined;
    this.ctx = undefined;
    resolve?.(null);
  }

  // Human-as-keeper is Milestone 5.
  getKeeperInput(): Promise<KeeperInput> {
    return Promise.reject(new Error('LocalHumanProvider keeper input is Milestone 5'));
  }
}

/** Generates the CPU's action. M4 uses it as the keeper in solo Taker mode. */
export class CpuProvider implements InputProvider {
  getKeeperInput(ctx: PenaltyContext, taker: TakerInput): Promise<KeeperInput> {
    const k = CONFIG.CPU_KEEPER;

    // Zone-guess accuracy scales with the single difficulty knob (PRD §5).
    const acc = k.guessAccuracyMin + (k.guessAccuracyMax - k.guessAccuracyMin) * k.difficulty;
    const aim = taker.landingZone ?? taker.targetZone ?? 'BM';
    const { col, row } = zoneIndices(aim);

    let guessCol: number;
    let guessRow: number;
    if (seededRandom(ctx.seed, 10) < acc) {
      // Good read: right column, usually right row.
      guessCol = col;
      guessRow = seededRandom(ctx.seed, 12) < 0.65 ? row : row === 0 ? 1 : 0;
    } else {
      // Wrong read: commit to a different column.
      const others = [0, 1, 2].filter((c) => c !== col);
      guessCol = others[Math.floor(seededRandom(ctx.seed, 13) * others.length)];
      guessRow = Math.floor(seededRandom(ctx.seed, 14) * 2);
    }
    const diveZone = zoneFrom(guessCol, guessRow);

    // Timing: better difficulty → tighter timing (smaller offset from ideal).
    const spread = CONFIG.RESOLUTION.timingWindowMs * (k.timingSpreadMax - (k.timingSpreadMax - k.timingSpreadMin) * k.difficulty);
    const diveTiming = (seededRandom(ctx.seed, 11) * 2 - 1) * spread;

    return Promise.resolve({ diveZone, diveTiming });
  }

  // CPU-as-taker is Milestone 5.
  getTakerInput(): Promise<TakerInput> {
    return Promise.reject(new Error('CpuProvider taker input is Milestone 5'));
  }
}
