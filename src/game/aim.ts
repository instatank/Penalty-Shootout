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

  const errorRadius = (CONFIG.INPUT.baseError + CONFIG.INPUT.kPower * swipe.power) * goal.width;
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
  const landingPoint = { x: targetX + Math.cos(ang) * rad, y: targetY + Math.sin(ang) * rad };
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
  const errorRadius = (CONFIG.INPUT.baseError + CONFIG.INPUT.kPower * power) * goal.width;
  return landShot(center.x, center.y, errorRadius, targetZone, power, curve, goal, seed);
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
