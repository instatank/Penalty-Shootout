/**
 * aim.ts — map a swipe to a target on the goal plane (PRD §4 "Direction" + §5
 * targeting). PRELIMINARY at Milestone 2: it drives the on-screen reticle and
 * the debug overlay's target zone so feel can be eyeballed. Milestone 3 wires
 * this same mapping into actual ball flight, and Milestone 4 adds the RNG
 * landing point + resolution.
 *
 * Model (PRD §4): horizontal angle of the swipe (measured from straight-up)
 * sets left/right across the goal; how "upward" the swipe is sets the height.
 * A near-horizontal flick = a low corner; a strong upward flick = high.
 */

import { CONFIG } from '../config';
import { zoneAtPoint, type ZoneId, type Rect } from './zones';
import type { SwipeSample } from '../input/SwipeInput';

export interface Aim {
  targetX: number;
  targetY: number;
  xFrac: number; // -1..+1 across the goal (may exceed for a wide miss)
  heightFrac: number; // 0 = bottom of goal, 1 = top (may exceed = over the bar)
  errorRadius: number; // px scatter (grows with power) — drawn as a ring
  targetZone: ZoneId | null; // null = aimed wide/over (a miss)
}

function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}

export function computeAim(swipe: SwipeSample, goal: Rect): Aim {
  const cfg = CONFIG.INPUT;
  const cx = goal.x + goal.width / 2;
  const goalBottom = goal.y + goal.height;

  // Horizontal: angle of the swipe measured from straight-up (+ = right).
  const angFromUp = Math.atan2(swipe.dx, -swipe.dy); // radians
  const range = (cfg.aimAngleRange * Math.PI) / 180;
  const xFrac = clamp(range > 0 ? angFromUp / range : 0, -cfg.aimOvershoot, cfg.aimOvershoot);
  const targetX = cx + xFrac * (goal.width / 2);

  // Vertical: how "upward" the swipe is (1 = straight up → top of goal).
  const upness = swipe.distance > 0 ? -swipe.dy / swipe.distance : 0;
  const heightFrac = clamp(upness, 0, cfg.aimOvershoot);
  const targetY = goalBottom - heightFrac * goal.height;

  const errorRadius = (cfg.baseError + cfg.kPower * swipe.power) * goal.width;
  const targetZone = zoneAtPoint(targetX, targetY, goal);

  return { targetX, targetY, xFrac, heightFrac, errorRadius, targetZone };
}
