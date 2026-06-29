/**
 * resolve.ts — THE keystone (PRD §7). A single PURE, DETERMINISTIC function
 * decides every save/goal/miss in the game.
 *
 * Model (Phase 2): GEOMETRIC reach, not a hidden dice roll. The keeper's hands
 * travel from goal centre toward the dive target; the ball is saved if it lands
 * within the reach ellipse around where the hands have ACTUALLY reached when it
 * arrives (a late dive = hands still near centre). High power shrinks reach a
 * touch; the extreme corners sit outside reach (unsaveable). So the outcome
 * matches the visible ball↔keeper interaction: ball meets keeper ⇒ save, ball
 * beats keeper ⇒ goal. A small seeded band at the edge keeps borderline shots
 * lively (and replayable online).
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
  keeperNorm: { x: number; y: number }; // hands position at ball arrival, normalised (drives the visual)
  timingQuality: number; // dive progress 0..1 (1 = hands fully reached the target)
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
 * REACH-BASED model (Phase 2 — "build exactly this"). The keeper's hands start at
 * goal centre and travel toward the committed dive target. `diveProgress` is how
 * far they get by the moment the ball ARRIVES: an early/on-time commit reaches the
 * target (1); diving late leaves the hands near centre (→0). The ball is SAVED if
 * it lands within the keeper's reach ellipse around the hands' ARRIVAL position; a
 * thin `margin` band at the edge is a seeded tie-break.
 *
 * This yields the three Phase-2 behaviours: (a) a correct, well-timed dive saves
 * most of that side but NOT the extreme corner (reach is tuned smaller than the
 * corner distance); (b) a keeper who doesn't commit / dives late keeps a small
 * central reach, so dead-centre is saveable and a corner is not; (c) diving the
 * wrong way OR too late leaves the goal open — a save must be a READ, not a reaction.
 */
export function resolvePenalty(taker: TakerInput, keeper: KeeperInput, seed: number): PenaltyResult {
  const R = CONFIG.RESOLUTION;
  const center = { x: 0.5, y: 0.5 }; // resting hands position (goal centre)
  const diveTarget = zoneCenterNorm(keeper.diveZone);

  const ln = taker.landingNorm;
  const offGoal = ln.x < 0 || ln.x > 1 || ln.y < 0 || ln.y > 1;
  if (offGoal) {
    return { outcome: 'miss', saved: false, scored: false, keeperNorm: center, timingQuality: 0, reachMargin: Infinity };
  }

  // How far the hands have travelled toward the dive target by ball arrival.
  // Early/on-time (diveTiming ≤ 0) = fully there; later = progressively less.
  const diveProgress = clamp(1 - Math.max(0, keeper.diveTiming) / R.diveLateWindowMs, 0, 1);
  const hands = {
    x: center.x + (diveTarget.x - center.x) * diveProgress,
    y: center.y + (diveTarget.y - center.y) * diveProgress,
  };

  // A hard shot is fractionally harder to reach/hold (shrinks the reach a touch).
  const reachScale = 1 - taker.power * R.powerReachPenalty;
  const rx = Math.max(1e-4, R.reachX * reachScale);
  const ry = Math.max(1e-4, R.reachY * reachScale);

  const dx = (ln.x - hands.x) / rx;
  const dy = (ln.y - hands.y) / ry;
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
    keeperNorm: hands, // where the hands are judged = the visual dive endpoint
    timingQuality: diveProgress,
    reachMargin: ellipse,
  };
}
