/**
 * resolve.ts — THE keystone (PRD §7). A single PURE, DETERMINISTIC function
 * decides every save/goal/miss in the game.
 *
 * It does not know or care whether the taker/keeper input came from a local
 * human, the CPU, or (Milestone 8) a remote opponent — that property is exactly
 * what lets online drop in as plumbing rather than a rewrite (PRD §8). It also
 * imports NO Phaser and NO geometry: callers pass already-derived discrete
 * values, so the function is trivially testable and replayable.
 *
 * Determinism: identical inputs + identical `seed` ⇒ identical result. Required
 * so that, online, both phones replay the same outcome from the same seed.
 */

import { CONFIG } from '../config';
import { zoneIndices, type ZoneId } from './zones';

export type Outcome = 'goal' | 'save' | 'miss';

/** The taker's committed action (PRD §7). Geometry already reduced to scalars. */
export interface TakerInput {
  targetZone: ZoneId | null; // where they aimed (null = aimed off the goal)
  landingZone: ZoneId | null; // where the ball actually ends up (null = wide/over → miss)
  power: number; // 0..1
  curve: number; // signed, for animation
  cornerness: number; // 0..1, how tight to a post/bar the landing is
  landingPoint: { x: number; y: number }; // pixels, for animation only
}

/** The keeper's committed action (PRD §7). Identical shape for CPU/human/remote. */
export interface KeeperInput {
  diveZone: ZoneId;
  diveTiming: number; // ms offset from the ideal moment (0 = perfectly timed)
}

export interface PenaltyResult {
  outcome: Outcome;
  saved: boolean;
  scored: boolean;
  saveChance: number; // the clamped probability that was rolled against
  zoneMatch: number; // 0 / 0.5 / 1 — how well the dive zone covered the landing
  timingQuality: number; // 0..1
}

function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}

/**
 * Deterministic [0,1) PRNG (mulberry32-style hash). `salt` yields independent
 * streams from the same kick seed (scatter, keeper guess, save roll, …).
 */
export function seededRandom(seed: number, salt = 0): number {
  let t = (Math.imul(seed ^ 0x9e3779b9, 0x85ebca77) ^ Math.imul(salt + 1, 0xc2b2ae35)) >>> 0;
  t = (t + 0x6d2b79f5) >>> 0;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

/** How well a dive zone covers a landing zone: 1 same, 0.5 adjacent, else 0. */
export function zoneMatch(dive: ZoneId, landing: ZoneId): number {
  if (dive === landing) return 1;
  const a = zoneIndices(dive);
  const b = zoneIndices(landing);
  const manhattan = Math.abs(a.col - b.col) + Math.abs(a.row - b.row);
  return manhattan === 1 ? 0.5 : 0;
}

/**
 * Compute the outcome of one penalty. Pure: same inputs + seed ⇒ same result.
 *
 * saveChance = base + zoneMatch·zoneBonus·timingQuality − power·powerPenalty
 *              − cornerness·cornerPenalty   (PRD §7)
 * The timing factor gates the zone bonus: diving the right way but mistimed
 * doesn't save. A landing that's off the goal is a miss regardless of the keeper.
 */
export function resolvePenalty(taker: TakerInput, keeper: KeeperInput, seed: number): PenaltyResult {
  const R = CONFIG.RESOLUTION;

  if (taker.landingZone === null) {
    return { outcome: 'miss', saved: false, scored: false, saveChance: 0, zoneMatch: 0, timingQuality: 0 };
  }

  const zm = zoneMatch(keeper.diveZone, taker.landingZone);
  const timingQuality = clamp(1 - Math.abs(keeper.diveTiming) / R.timingWindowMs, 0, 1);

  let chance =
    R.baseSaveChance +
    zm * R.zoneMatchBonus * timingQuality -
    taker.power * R.powerPenalty -
    taker.cornerness * R.cornerPenalty;
  chance = clamp(chance, 0, R.maxSaveChance);

  const saved = seededRandom(seed, 0) < chance;
  return {
    outcome: saved ? 'save' : 'goal',
    saved,
    scored: !saved,
    saveChance: chance,
    zoneMatch: zm,
    timingQuality,
  };
}
