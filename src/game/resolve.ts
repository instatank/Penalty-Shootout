/**
 * resolve.ts — THE keystone (PRD §7). A single PURE, DETERMINISTIC function
 * decides every save/goal/miss in the game.
 *
 * Model (Phase 2, retimed by design-rework Track A2/A4): GEOMETRIC reach, not a
 * hidden dice roll. The keeper's hands travel from goal centre toward the dive
 * target and RACE the ball: the dive is committed `diveTiming` ms after the
 * strike, the hands need diveTravelMs to fully arrive, and the ball lands after
 * `flightMs` (a harder shot flies faster ⇒ less hand-travel time). The ball is
 * saved if it lands within the reach ellipse around where the hands have
 * ACTUALLY reached at arrival. High power also shrinks reach a touch; the
 * extreme corners sit outside reach (unsaveable). So the outcome matches the
 * visible ball↔keeper interaction: ball meets keeper ⇒ save, ball beats keeper
 * ⇒ goal. A small seeded band at the edge keeps borderline shots lively (and
 * replayable online).
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
  diveTiming: number; // ms AFTER the strike the dive was committed (≤0 = at/
  // before the strike). resolvePenalty races it against the kick's flightMs:
  // the hands get (flightMs − max(0, diveTiming)) of travel time (Track A2/A4).
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
 * The kick's flight time in ms, from shot power — the SHARED source for both the
 * animation and resolvePenalty, so what you see is exactly what is judged
 * (Track A2). 'taker' view = the behind-the-taker flight; 'keeper' view = the
 * keeper's-eye flight (= the human keeper's reaction window). Pure.
 */
export function kickFlightMs(power: number, view: 'taker' | 'keeper'): number {
  const p = clamp(power, 0, 1);
  if (view === 'keeper') {
    const C = CONFIG.CPU_TAKER;
    return C.flightTimeSlow + (C.flightTimeFast - C.flightTimeSlow) * p;
  }
  const F = CONFIG.FLIGHT;
  return F.flightDurationSlow + (F.flightDurationFast - F.flightDurationSlow) * p;
}

/**
 * Compute the outcome of one penalty. Pure: same inputs + seed ⇒ same result.
 *
 * REACH-BASED model (Phase 2, retimed by Track A2/A4). The keeper's hands start
 * at goal centre and travel toward the committed dive target. `diveProgress` is
 * how far they get by the moment the ball ARRIVES: the dive is committed
 * max(0, diveTiming) ms after the strike, the hands need diveTravelMs for the
 * full journey, and the ball lands after `flightMs` — so progress =
 * (flightMs − commit) / diveTravelMs, clamped 0..1. The ball is SAVED if it
 * lands within the keeper's reach ellipse around the hands' ARRIVAL position; a
 * thin `margin` band at the edge is a seeded tie-break.
 *
 * Behaviours this yields: (a) a correct, promptly-committed dive saves most of
 * that side but NOT the extreme corner (reach is tuned smaller than the corner
 * distance); (b) a keeper who never commits keeps only the small central reach —
 * dead-centre is saveable, anything else is not; (c) the wrong way OR too late
 * leaves the goal open; (d) a BLASTED shot (small flightMs) genuinely beats a
 * keeper that a soft shot would not — power races the dive (Track A2).
 */
export function resolvePenalty(
  taker: TakerInput,
  keeper: KeeperInput,
  seed: number,
  flightMs: number, // the kick's flight time (use kickFlightMs — Track A2)
): PenaltyResult {
  const R = CONFIG.RESOLUTION;
  const center = { x: 0.5, y: 0.5 }; // resting hands position (goal centre)
  const diveTarget = zoneCenterNorm(keeper.diveZone);

  const ln = taker.landingNorm;
  const offGoal = ln.x < 0 || ln.x > 1 || ln.y < 0 || ln.y > 1;
  if (offGoal) {
    return { outcome: 'miss', saved: false, scored: false, keeperNorm: center, timingQuality: 0, reachMargin: Infinity };
  }

  // How far the hands have travelled toward the dive target by ball arrival:
  // the time between the dive commit and the ball landing, over a full dive's
  // travel time. Early commits (diveTiming ≤ 0) get the whole flight (Track A4).
  const commitMs = Math.max(0, keeper.diveTiming);
  const diveProgress = clamp((flightMs - commitMs) / R.diveTravelMs, 0, 1);
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
