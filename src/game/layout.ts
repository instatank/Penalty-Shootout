/**
 * layout.ts — responsive layout solver.
 *
 * Given the live canvas size (width, height), computeLayout() turns the
 * proportional values in CONFIG.GEOMETRY into concrete pixel positions for the
 * goal, perspective box, penalty spot, ball and keeper. It picks the landscape
 * or portrait profile based on the screen's aspect, so the same scene fills any
 * device in either orientation with no letterbox bars.
 *
 * The scene calls this on create and again on every resize / orientation change.
 */

import { CONFIG } from '../config';
import type { Rect } from './zones';

/** The perspective penalty box as four corners (narrow far, wide near). */
export interface BoxTrapezoid {
  farL: number;
  farR: number;
  nearL: number;
  nearR: number;
  farY: number;
  nearY: number;
}

export interface Layout {
  width: number;
  height: number;
  isLandscape: boolean;
  goal: Rect; // goal mouth (the aiming plane)
  post: number; // post / crossbar thickness in px
  horizonY: number; // goal line — where the stadium meets the pitch
  box: BoxTrapezoid;
  spot: { x: number; y: number };
  ball: { x: number; y: number; r: number };
  keeper: { x: number; feetY: number; w: number; h: number };
  taker: { x: number; feetY: number; w: number; h: number }; // CPU striker (Keeper mode)
}

export function computeLayout(width: number, height: number): Layout {
  const G = CONFIG.GEOMETRY;
  const isLandscape = width >= height;
  const p = isLandscape ? G.landscape : G.portrait;
  const cx = width / 2;

  // Goal mouth: width is a fraction of the screen; height follows the fixed
  // real-goal aspect so it never looks stretched.
  const goalW = width * p.goalWidthFrac;
  const goalH = goalW / G.goalAspect;
  const goalTop = height * p.goalTopFrac;
  const goal: Rect = { x: cx - goalW / 2, y: goalTop, width: goalW, height: goalH };

  const horizonY = goalTop + goalH; // goal line = stadium/pitch split
  const post = goalH * G.postThicknessFrac;

  // Perspective box: narrow at the goal (far), wide near the camera.
  const farHalf = goalW / 2 + width * p.boxFarPadFrac;
  const nearHalf = width * p.boxNearHalfWidthFrac;
  const box: BoxTrapezoid = {
    farL: cx - farHalf,
    farR: cx + farHalf,
    nearL: cx - nearHalf,
    nearR: cx + nearHalf,
    farY: horizonY,
    nearY: height * p.boxNearYFrac,
  };

  const spot = { x: cx, y: height * p.spotYFrac };
  const ball = { x: cx, y: height * p.ballYFrac, r: height * p.ballRadiusFrac };
  const keeper = {
    x: cx,
    feetY: horizonY,
    w: goalW * G.keeperWidthFrac,
    h: goalH * G.keeperHeightFrac,
  };

  // CPU taker (Keeper mode only): stands just behind + beside the ball, nearer
  // the camera. Offset to the left so the ball sits in front of its kicking side.
  const takerH = goalH * G.takerHeightFrac;
  const taker = {
    x: cx - ball.r * 2.4,
    feetY: Math.min(height - 4, ball.y + ball.r * 2.6),
    w: goalW * G.takerWidthFrac,
    h: takerH,
  };

  return { width, height, isLandscape, goal, post, horizonY, box, spot, ball, keeper, taker };
}
