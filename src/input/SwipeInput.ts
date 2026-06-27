/**
 * SwipeInput.ts — the make-or-break input layer (PRD §4).
 *
 * Uses the raw Pointer Events API (NOT Phaser's pointer wrapper) so we get:
 *   - setPointerCapture() on pointerdown → the swipe stays locked to us even if
 *     the finger slides off the ball or off-screen (no mid-gesture "drop").
 *   - {x, y, t} path sampling on every pointermove → enough detail to compute
 *     curve, not just start/end.
 *   - mouse + stylus support for free (desktop testing works unchanged).
 * touch-action:none on the canvas (index.html) stops the browser stealing the
 * gesture for scroll/zoom.
 *
 * This class only COLLECTS the gesture and reports phases; deriveSwipe() (pure)
 * turns a path into the derived values (vector, power, curve). Keeping them
 * separate means a future LocalHumanProvider (PRD §8) can reuse both as-is.
 */

import Phaser from 'phaser';
import { CONFIG } from '../config';

export interface SwipePoint {
  x: number;
  y: number;
  t: number; // ms timestamp (performance.now)
}

export type SwipePhase = 'start' | 'move' | 'end';

/** Everything derived from one swipe path. */
export interface SwipeSample {
  start: SwipePoint;
  end: SwipePoint;
  points: SwipePoint[];
  dx: number;
  dy: number;
  distance: number;
  angleDeg: number; // 0 = +x (right), -90 = up
  durationMs: number;
  speedPxPerMs: number; // release velocity (last velocityWindowMs)
  power: number; // normalised 0..1, clamped to [minPower, maxPower]
  curve: number; // signed, fraction of swipe length, capped to ±maxCurve
}

function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}

/**
 * Pure: derive the swipe values from a sampled path. `screenHeight` makes power
 * resolution-independent (speed is normalised against screen-heights/second).
 */
export function deriveSwipe(points: SwipePoint[], screenHeight: number): SwipeSample {
  const cfg = CONFIG.INPUT;
  const start = points[0];
  const end = points[points.length - 1];
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const distance = Math.hypot(dx, dy);
  const angleDeg = (Math.atan2(dy, dx) * 180) / Math.PI;
  const durationMs = Math.max(0, end.t - start.t);

  // Power = release velocity over the LAST velocityWindowMs (a snappy flick),
  // NOT the whole-gesture average — a slow drag that stops releases weak.
  const windowStart = end.t - cfg.velocityWindowMs;
  let i0 = points.length - 1;
  while (i0 > 0 && points[i0 - 1].t >= windowStart) i0--;
  let windowDist = 0;
  for (let i = i0 + 1; i < points.length; i++) {
    windowDist += Math.hypot(points[i].x - points[i - 1].x, points[i].y - points[i - 1].y);
  }
  const windowTime = end.t - points[i0].t;
  const speedPxPerMs =
    windowTime > 0 ? windowDist / windowTime : durationMs > 0 ? distance / durationMs : 0;

  // Normalise: fullPowerSpeed is expressed in screen-heights per second.
  const refSpeed = (cfg.fullPowerSpeed * screenHeight) / 1000; // px per ms
  const power = clamp(refSpeed > 0 ? speedPxPerMs / refSpeed : 0, cfg.minPower, cfg.maxPower);

  // Curve = signed lateral deviation of the path's (temporal) midpoint from the
  // straight start→end line, as a fraction of swipe length, capped low.
  let curve = 0;
  if (distance > 1) {
    const tMid = (start.t + end.t) / 2;
    let mid = points[0];
    let best = Infinity;
    for (const p of points) {
      const d = Math.abs(p.t - tMid);
      if (d < best) {
        best = d;
        mid = p;
      }
    }
    // Signed perpendicular distance from the start→end line (cross product / len).
    const cross = (dx * (mid.y - start.y) - dy * (mid.x - start.x)) / distance;
    curve = clamp(cross / distance, -cfg.maxCurve, cfg.maxCurve);
  }

  return {
    start,
    end,
    points,
    dx,
    dy,
    distance,
    angleDeg,
    durationMs,
    speedPxPerMs,
    power,
    curve,
  };
}

export interface SwipeHandlers {
  onUpdate: (phase: SwipePhase, points: SwipePoint[]) => void;
}

/** Attaches Pointer Events to the game canvas and reports gesture phases. */
export class SwipeInput {
  private scene: Phaser.Scene;
  private canvas: HTMLCanvasElement;
  private handlers: SwipeHandlers;
  private activeId: number | null = null;
  private points: SwipePoint[] = [];
  private readonly maxPoints = 256;

  private onDown: (e: PointerEvent) => void;
  private onMove: (e: PointerEvent) => void;
  private onUp: (e: PointerEvent) => void;

  constructor(scene: Phaser.Scene, handlers: SwipeHandlers) {
    this.scene = scene;
    this.canvas = scene.game.canvas;
    this.handlers = handlers;

    this.onDown = (e) => this.handleDown(e);
    this.onMove = (e) => this.handleMove(e);
    this.onUp = (e) => this.handleUp(e);

    this.canvas.addEventListener('pointerdown', this.onDown, { passive: false });
    this.canvas.addEventListener('pointermove', this.onMove, { passive: false });
    this.canvas.addEventListener('pointerup', this.onUp, { passive: false });
    this.canvas.addEventListener('pointercancel', this.onUp, { passive: false });

    scene.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.destroy());
  }

  /** Convert a DOM pointer event to game/world coordinates. */
  private toGame(e: PointerEvent): SwipePoint {
    const rect = this.canvas.getBoundingClientRect();
    const sx = this.scene.scale.width / rect.width;
    const sy = this.scene.scale.height / rect.height;
    return {
      x: (e.clientX - rect.left) * sx,
      y: (e.clientY - rect.top) * sy,
      t: performance.now(),
    };
  }

  private handleDown(e: PointerEvent): void {
    if (this.activeId !== null) return; // already tracking one pointer
    this.activeId = e.pointerId;
    try {
      this.canvas.setPointerCapture(e.pointerId);
    } catch {
      /* capture is best-effort */
    }
    this.points = [this.toGame(e)];
    this.handlers.onUpdate('start', this.points);
    e.preventDefault();
  }

  private handleMove(e: PointerEvent): void {
    if (e.pointerId !== this.activeId) return;
    this.points.push(this.toGame(e));
    if (this.points.length > this.maxPoints) this.points.shift();
    this.handlers.onUpdate('move', this.points);
    e.preventDefault();
  }

  private handleUp(e: PointerEvent): void {
    if (e.pointerId !== this.activeId) return;
    this.points.push(this.toGame(e));
    try {
      this.canvas.releasePointerCapture(e.pointerId);
    } catch {
      /* ignore */
    }
    this.handlers.onUpdate('end', this.points);
    this.activeId = null;
    e.preventDefault();
  }

  destroy(): void {
    this.canvas.removeEventListener('pointerdown', this.onDown);
    this.canvas.removeEventListener('pointermove', this.onMove);
    this.canvas.removeEventListener('pointerup', this.onUp);
    this.canvas.removeEventListener('pointercancel', this.onUp);
    this.activeId = null;
  }
}
