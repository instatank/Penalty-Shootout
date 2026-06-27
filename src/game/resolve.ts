/**
 * resolve.ts — THE keystone (PRD §7). A single PURE, DETERMINISTIC function
 * decides every save/goal/miss in the game.
 *
 * Model (revised after playtest): GEOMETRIC, not a hidden dice roll. The keeper
 * saves when the ball lands within its dive REACH — an ellipse around the point
 * it actually dives to. Bad timing and high power shrink that reach; corners sit
 * outside it. So the outcome matches the visible ball↔keeper interaction: ball
 * meets keeper ⇒ save, ball beats keeper ⇒ goal. A small seeded band at the very
 * edge of reach keeps borderline shots lively (and replayable online).
 *
 * It imports NO Phaser and works in normalised goal coordinates (0..1 across the
 * goal mouth), so it is resolution-independent, trivially testable, and — given
 * identical inputs + seed — perfectly deterministic for online replay (PRD §8).
 */

import { CONFIG } from '../config';
import { zoneIndices, type ZoneId } from './zones';

export type Outcome = 'goal' | 'save' | 'miss';

/** The taker's committed action (PRD §7). */
export interface TakerInput {
  targetZone: ZoneId | null; // where they aimed
  landingZone: ZoneId | null; // zone the ball lands in (for debug/animation)
  landingNorm: { x: number; y: number }; // landing in normalised goal coords (outside [0,1] = off goal)
  power: number; // 0..1
  curve: number; // signed, for animation
  landingPoint: { x: number; y: number }; // pixels, for animation
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
  keeperNorm: { x: number; y: number }; // where the keeper dives, normalised (drives the visual)
  timingQuality: number; // 0..1
  reachMargin: number; // ellipse value (≤1 inside reach) — for debug
}

function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}

/**
 * Deterministic [0,1) PRNG (mulberry32-style hash). `salt` yields independent
 * streams from the same kick seed.
 */
export function seededRandom(seed: number, salt = 0): number {
  let t = (Math.imul(seed ^ 0x9e3779b9, 0x85ebca77) ^ Math.imul(salt + 1, 0xc2b2ae35)) >>> 0;
  t = (t + 0x6d2b79f5) >>> 0;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

/** Normalised centre of a zone within the goal mouth (x,y ∈ 0..1). */
function zoneCenterNorm(zone: ZoneId): { x: number; y: number } {
  const { col, row } = zoneIndices(zone);
  return { x: (col + 0.5) / CONFIG.GEOMETRY.zoneCols, y: (row + 0.5) / CONFIG.GEOMETRY.zoneRows };
}

/**
 * Compute the outcome of one penalty. Pure: same inputs + seed ⇒ same result.
 *
 * The keeper dives to its guessed zone (keeperNorm). Its reach is an ellipse
 * (reachX × reachY) scaled down by poor timing and by shot power. The ball is
 * SAVED if its landing sits inside that ellipse; a thin `margin` band at the
 * edge is decided by a seeded coin-flip weighted by how close it is.
 */
export function resolvePenalty(taker: TakerInput, keeper: KeeperInput, seed: number): PenaltyResult {
  const R = CONFIG.RESOLUTION;
  const keeperNorm = zoneCenterNorm(keeper.diveZone);

  const ln = taker.landingNorm;
  const offGoal = ln.x < 0 || ln.x > 1 || ln.y < 0 || ln.y > 1;
  if (offGoal) {
    return { outcome: 'miss', saved: false, scored: false, keeperNorm, timingQuality: 0, reachMargin: Infinity };
  }

  const timingQuality = clamp(1 - Math.abs(keeper.diveTiming) / R.timingWindowMs, 0, 1);
  // Effective reach: full when well-timed and the shot is soft; shrinks otherwise.
  const reachScale = (R.timingFloor + (1 - R.timingFloor) * timingQuality) * (1 - taker.power * R.powerReachPenalty);
  const rx = Math.max(1e-4, R.reachX * reachScale);
  const ry = Math.max(1e-4, R.reachY * reachScale);

  const dx = (ln.x - keeperNorm.x) / rx;
  const dy = (ln.y - keeperNorm.y) / ry;
  const ellipse = dx * dx + dy * dy; // ≤1 ⇒ inside reach

  let saved: boolean;
  if (ellipse <= 1 - R.margin) {
    saved = true;
  } else if (ellipse >= 1 + R.margin) {
    saved = false;
  } else {
    // Borderline: seeded coin-flip, more likely to save the closer it is.
    const p = (1 + R.margin - ellipse) / (2 * R.margin); // 1 at inner edge → 0 at outer
    saved = seededRandom(seed, 3) < p;
  }

  return {
    outcome: saved ? 'save' : 'goal',
    saved,
    scored: !saved,
    keeperNorm,
    timingQuality,
    reachMargin: ellipse,
  };
}
