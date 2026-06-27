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

/** Which camera to lay out: the taker's view (default) or the keeper's-eye view. */
export type LayoutView = 'taker' | 'keeper';

export function computeLayout(width: number, height: number, view: LayoutView = 'taker'): Layout {
  if (view === 'keeper') return computeKeeperLayout(width, height);

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

/**
 * Keeper's-eye view (Keeper mode): we sit behind the keeper looking OUT. The
 * `goal` here is the NEAR foreground plane the ball arrives in — it doubles as
 * the goal rect handed to resolvePenalty, so all normalised-coord math is reused.
 * The taker + penalty spot sit far + small; the keeper is big in the foreground;
 * the ball launches at the far spot and grows toward the camera.
 */
function computeKeeperLayout(width: number, height: number): Layout {
  const G = CONFIG.GEOMETRY;
  const kv = G.keeperView;
  const isLandscape = width >= height;
  const cx = width / 2;

  // Near goal plane (the save/target plane) — large, in the foreground.
  const goalW = width * kv.goalWidthFrac;
  const goalTop = height * kv.goalTopFrac;
  const goalBottom = height * kv.goalBottomFrac;
  const goal: Rect = { x: cx - goalW / 2, y: goalTop, width: goalW, height: goalBottom - goalTop };

  const horizonY = height * kv.horizonYFrac; // stadium/pitch split (far)
  const post = goal.height * G.postThicknessFrac;

  // Perspective box: narrow far (at the horizon) → wide near (the foreground).
  const box: BoxTrapezoid = {
    farL: cx - width * kv.boxFarHalfFrac,
    farR: cx + width * kv.boxFarHalfFrac,
    nearL: cx - width * kv.boxNearHalfFrac,
    nearR: cx + width * kv.boxNearHalfFrac,
    farY: horizonY,
    nearY: height * 0.99,
  };

  const spot = { x: cx, y: height * kv.spotYFrac };
  // Ball launches at the far spot. Its radius is the near (big) size; the flight
  // scales it up from small (far) — see CONFIG.KEEPER.flightScale*.
  const ballR = height * (isLandscape ? G.landscape.ballRadiusFrac : G.portrait.ballRadiusFrac);
  const ball = { x: spot.x, y: spot.y, r: ballR };

  // Width is DERIVED from height (human aspect) so figures don't stretch into
  // pillars on a narrow portrait screen.
  const keeperH = height * kv.keeperHeightFrac;
  const keeper = { x: cx, feetY: height * kv.keeperFeetYFrac, w: keeperH * kv.keeperAspect, h: keeperH };
  const takerH = height * kv.takerHeightFrac;
  const taker = { x: spot.x, feetY: spot.y + height * 0.015, w: takerH * kv.takerAspect, h: takerH };

  return { width, height, isLandscape, goal, post, horizonY, box, spot, ball, keeper, taker };
}
