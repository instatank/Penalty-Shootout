/**
 * aim.ts — map a swipe to a target on the goal plane (PRD §4 "Direction" + §5).
 *
 * Model (the feel-critical part): the two axes are INDEPENDENT and driven by how
 * far you swipe, not the swipe's angle. This keeps all six zones reachable and
 * makes the reticle track the finger directly:
 *   • sideways swipe distance (dx) → left/right placement across the goal.
 *   • upward   swipe distance (-dy) → height: a SHORT up-flick aims low (ground,
 *     bottom row), a LONG up-flick aims high (crossbar, top row).
 *
 * Reach distances live in CONFIG.AIM and are the main thing to calibrate by
 * playtest. PRELIMINARY at Milestone 2 (drives the reticle/overlay); Milestone 3
 * feeds this same target into actual ball flight.
 */

import { CONFIG } from '../config';
import { zoneAtPoint, zoneCenter, zoneFrom, type ZoneId, type Rect } from './zones';
import type { SwipeSample } from '../input/SwipeInput';
import { seededRandom, type TakerInput } from './resolve';

export interface Aim {
  targetX: number;
  targetY: number;
  xFrac: number; // -1 = left post, 0 = centre, +1 = right post (may overshoot)
  heightFrac: number; // 0 = ground/bottom, 1 = crossbar/top (may overshoot)
  errorRadius: number; // px scatter (grows with power) — drawn as a ring
  targetZone: ZoneId | null; // null = aimed wide/over (a miss)
}

function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}

/**
 * The power/accuracy tradeoff (Phase 1, PRD §5). Scatter radius in pixels: stays
 * at baseError up to powerAccuracyThreshold, then grows fast. A controlled shot
 * lands where aimed; a greedy max-power shot may miss the target — or the frame.
 */
export function scatterRadius(power: number, goalWidth: number): number {
  const I = CONFIG.INPUT;
  const excess = Math.max(0, (power - I.powerAccuracyThreshold) / (1 - I.powerAccuracyThreshold));
  return (I.baseError + I.kPower * Math.pow(excess, I.scatterExponent)) * goalWidth;
}

/** The shot's own outcome, ignoring the keeper (Phase 1): did it hit the frame? */
export type ShotOutcome = 'on-target' | 'wide' | 'over';
export function shotOutcome(landingNorm: { x: number; y: number }): ShotOutcome {
  if (landingNorm.y < 0) return 'over'; // above the crossbar
  if (landingNorm.x < 0 || landingNorm.x > 1 || landingNorm.y > 1) return 'wide';
  return 'on-target';
}

export function computeAim(
  swipe: SwipeSample,
  goal: Rect,
  screenW: number,
  screenH: number,
): Aim {
  const a = CONFIG.AIM;
  const cx = goal.x + goal.width / 2;
  const goalBottom = goal.y + goal.height;

  // Horizontal: sideways displacement as a fraction of the reach distance.
  const xFrac = clamp(swipe.dx / (screenW * a.reachX), -a.overshoot, a.overshoot);
  const targetX = cx + xFrac * (goal.width / 2);

  // Vertical: upward displacement mapped from "reachLow" (ground) to "reachHigh"
  // (crossbar). Downward swipes clamp to the ground.
  const up = -swipe.dy; // px upward (negative dy = up the screen)
  const span = Math.max(1e-6, a.reachHigh - a.reachLow);
  const heightFrac = clamp((up / screenH - a.reachLow) / span, 0, a.overshoot);
  const targetY = goalBottom - heightFrac * goal.height;

  const errorRadius = scatterRadius(swipe.power, goal.width);
  const targetZone = zoneAtPoint(targetX, targetY, goal);

  return { targetX, targetY, xFrac, heightFrac, errorRadius, targetZone };
}

/**
 * Land a shot: apply the power-based accuracy scatter DETERMINISTICALLY from the
 * kick `seed` and package the result as a TakerInput (PRD §7). Shared by BOTH the
 * human taker (finalizeShot) and the CPU taker (cpuShot) so there is exactly one
 * scatter rule. Seeded so an online opponent replays the identical landing.
 */
export function landShot(
  targetX: number,
  targetY: number,
  errorRadius: number,
  targetZone: ZoneId | null,
  power: number,
  curve: number,
  goal: Rect,
  seed: number,
): TakerInput {
  const ang = seededRandom(seed, 1) * Math.PI * 2;
  const rad = Math.sqrt(seededRandom(seed, 2)) * errorRadius; // uniform over the disc
  // Track A5/B7: errorRadius is authored as a fraction of goal WIDTH, but the
  // goal is goalAspect:1 (wide) — a circular scatter in raw pixels therefore
  // covers a much bigger fraction of the (shorter) HEIGHT than of the width, so
  // power shots skied over the bar far more than they went wide. Shrink the
  // vertical component by goalAspect so the scatter is isotropic in NORMALISED
  // goal coords (equal miss chance high/low as left/right).
  const aspect = goal.width / goal.height;
  const landingPoint = { x: targetX + Math.cos(ang) * rad, y: targetY + (Math.sin(ang) * rad) / aspect };
  const landingZone = zoneAtPoint(landingPoint.x, landingPoint.y, goal);
  const landingNorm = {
    x: (landingPoint.x - goal.x) / goal.width,
    y: (landingPoint.y - goal.y) / goal.height,
  };

  return { targetZone, landingZone, landingNorm, power, curve, landingPoint };
}

/**
 * Turn a human's aim + swipe into the committed TakerInput (PRD §7). Thin wrapper
 * over landShot using the aim's target point, scatter radius and the swipe's
 * power/curve.
 */
export function finalizeShot(aim: Aim, swipe: SwipeSample, goal: Rect, seed: number): TakerInput {
  return landShot(aim.targetX, aim.targetY, aim.errorRadius, aim.targetZone, swipe.power, swipe.curve, goal, seed);
}

/**
 * Build the CPU taker's committed TakerInput (PRD §6) — Keeper mode. The CPU has
 * already chosen a {targetZone, power, curve}; we aim at that zone's centre, apply
 * the SAME power-based scatter as a human (so corners stay reachable but tight),
 * and land it deterministically from `seed`.
 */
export function cpuShot(targetZone: ZoneId, power: number, curve: number, goal: Rect, seed: number): TakerInput {
  const center = zoneCenter(targetZone, goal);
  const errorRadius = scatterRadius(power, goal.width);
  const shot = landShot(center.x, center.y, errorRadius, targetZone, power, curve, goal, seed);

  // Keep the CPU on-target: clamp the landing inside the goal so it never sprays
  // wide/over (in Keeper mode the player should have to SAVE every shot, not get
  // gifted CPU misses). The near goal plane is short, so unclamped pixel scatter
  // skies too many — this also makes the clamp aspect-independent.
  const inset = CONFIG.CPU_TAKER.onTargetInset;
  const nx = clamp(shot.landingNorm.x, inset, 1 - inset);
  const ny = clamp(shot.landingNorm.y, inset, 1 - inset);
  if (nx !== shot.landingNorm.x || ny !== shot.landingNorm.y) {
    shot.landingNorm = { x: nx, y: ny };
    shot.landingPoint = { x: goal.x + nx * goal.width, y: goal.y + ny * goal.height };
    shot.landingZone = zoneAtPoint(shot.landingPoint.x, shot.landingPoint.y, goal);
  }
  return shot;
}

/**
 * Map a HUMAN keeper's dive flick to a dive zone (PRD §6) — Keeper mode. The two
 * axes are independent and distance-driven (mirrors the taker's aim model):
 *   • sideways flick distance → Left / Centre / Right column
 *   • upward flick distance   → High (top row) vs Low (bottom row)
 * A tap or a tiny flick (no clear direction) defends low-centre (BM).
 */
export function computeDive(swipe: SwipeSample, screenW: number, screenH: number): ZoneId {
  const k = CONFIG.KEEPER;
  const colThresh = screenW * k.diveColThreshFrac;
  const rowThresh = screenH * k.diveRowThreshFrac;

  const col = swipe.dx < -colThresh ? 0 : swipe.dx > colThresh ? 2 : 1;
  const row = -swipe.dy > rowThresh ? 0 : 1; // up beyond threshold = High (top)
  return zoneFrom(col, row);
}
