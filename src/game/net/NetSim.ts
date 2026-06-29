/**
 * NetSim.ts — a tiny spring-mass net simulation (Tier 1, item 1: "the money shot").
 *
 * The goal net is a grid of nodes. The four edges (top crossbar, both posts, the
 * ground line) are PINNED to the frame; every interior node carries a single depth
 * value `z` — how far that bit of net is punched BACK into the goal (0 = flat at
 * rest). A scored ball transfers an impulse to the nearest nodes (`punch`), and the
 * grid then behaves like a damped membrane: the bulge propagates to neighbours,
 * overshoots, and oscillates before settling — taut but alive.
 *
 * It is deliberately Phaser-free and cheap (one small grid, a handful of integration
 * passes per frame, and it stops stepping entirely once settled). The SCENE owns the
 * rendering: it reads `point(col, row)` for each node's displaced screen position and
 * redraws the existing faint hatch lines through those points (see GameScene.drawNet).
 *
 * The model is a discrete damped wave equation on the grid:
 *   accel = stiffness · (avg(neighbour z) − z)   ← coupling: the ripple spreads
 *         − springBack · z                        ← each node pulls back toward flat
 *   z' = z + (z − zPrev)·(1 − damping) + accel    ← Verlet step (velocity = z − zPrev)
 * Stiffness < 0.5 keeps it stable; `maxBulge` clamps as a hard safety net. All of the
 * feel constants live in CONFIG.JUICE.net so the owner can dial it in by playtest.
 */

import { CONFIG } from '../../config';
import type { Rect } from '../zones';

export class NetSim {
  private cols: number;
  private rows: number;
  private z: number[]; // current depth per node (row-major, (cols+1)·(rows+1))
  private zPrev: number[]; // previous depth (Verlet history)
  private goal: Rect = { x: 0, y: 0, width: 0, height: 0 };
  private spacing = 0; // node spacing in px (drives how a unit of z maps to screen)
  private settled = true; // true when the net is at rest (skip stepping → free)

  constructor() {
    // One node per grid intersection, INCLUSIVE of the border (so cols+1 × rows+1).
    this.cols = CONFIG.GEOMETRY.netCols;
    this.rows = CONFIG.GEOMETRY.netRows;
    const n = (this.cols + 1) * (this.rows + 1);
    this.z = new Array(n).fill(0);
    this.zPrev = new Array(n).fill(0);
  }

  /** Relayout for a new goal rectangle (called on create / resize) and reset flat. */
  resize(goal: Rect): void {
    this.goal = goal;
    const cellW = goal.width / this.cols;
    const cellH = goal.height / this.rows;
    this.spacing = Math.min(cellW, cellH);
    this.reset();
  }

  /** Snap the whole net back to flat/rest. */
  reset(): void {
    this.z.fill(0);
    this.zPrev.fill(0);
    this.settled = true;
  }

  private idx(col: number, row: number): number {
    return row * (this.cols + 1) + col;
  }

  /** A node is pinned if it sits on any of the four frame edges. */
  private pinned(col: number, row: number): boolean {
    return col === 0 || row === 0 || col === this.cols || row === this.rows;
  }

  /**
   * Punch the net at a normalised goal coordinate (0..1 across width/height) with a
   * strength scaled by shot power. Nearby interior nodes get an inward velocity that
   * falls off with distance (a soft gaussian), so different entry points bulge in
   * different places.
   */
  punch(normX: number, normY: number, power: number): void {
    const N = CONFIG.JUICE.net;
    const cx = Phaser_clamp01(normX) * this.cols;
    const cy = Phaser_clamp01(normY) * this.rows;
    // Impact radius in GRID cells (config is a fraction of goal width).
    const radCells = Math.max(0.6, N.impactRadiusFrac * this.cols);
    const strength = N.impulse * (0.4 + 0.6 * Phaser_clamp01(power)); // firm even on a soft goal

    for (let row = 1; row < this.rows; row++) {
      for (let col = 1; col < this.cols; col++) {
        const dx = col - cx;
        const dy = row - cy;
        const d2 = dx * dx + dy * dy;
        const falloff = Math.exp(-d2 / (2 * radCells * radCells));
        if (falloff < 0.02) continue;
        const i = this.idx(col, row);
        // Add depth + give it inward velocity (push zPrev the other way).
        const add = strength * falloff;
        this.z[i] = clampAbs(this.z[i] + add, N.maxBulge);
        this.zPrev[i] = this.z[i] - add * 0.9; // velocity ≈ 0.9·add inward
      }
    }
    this.settled = false;
  }

  /**
   * Advance the simulation one frame (a few fixed integration passes — Verlet is
   * stable at a fixed step, so we deliberately ignore the real delta to avoid the
   * instability variable-dt Verlet is prone to). Returns true if anything moved this
   * frame (so the scene only redraws the net when it actually changed).
   */
  step(): boolean {
    if (this.settled) return false;
    const N = CONFIG.JUICE.net;

    for (let pass = 0; pass < N.iterations; pass++) {
      // Compute next z into a scratch then commit (so neighbours read this-frame z).
      for (let row = 1; row < this.rows; row++) {
        for (let col = 1; col < this.cols; col++) {
          const i = this.idx(col, row);
          // Neighbour average (pinned/border neighbours contribute z = 0).
          const zl = this.z[this.idx(col - 1, row)];
          const zr = this.z[this.idx(col + 1, row)];
          const zu = this.z[this.idx(col, row - 1)];
          const zd = this.z[this.idx(col, row + 1)];
          const avg = (zl + zr + zu + zd) * 0.25;
          const cur = this.z[i];
          const vel = (cur - this.zPrev[i]) * (1 - N.damping);
          const accel = N.stiffness * (avg - cur) - N.springBack * cur;
          const next = clampAbs(cur + vel + accel, N.maxBulge);
          this.zPrev[i] = cur;
          this.z[i] = next;
        }
      }
    }

    // Settle test: if every node is near-flat AND near-still, snap to rest.
    let maxAbs = 0;
    let maxVel = 0;
    for (let row = 1; row < this.rows; row++) {
      for (let col = 1; col < this.cols; col++) {
        const i = this.idx(col, row);
        maxAbs = Math.max(maxAbs, Math.abs(this.z[i]));
        maxVel = Math.max(maxVel, Math.abs(this.z[i] - this.zPrev[i]));
      }
    }
    if (maxAbs < N.settleEps && maxVel < N.settleEps) {
      this.reset();
      return true; // one final redraw to the flat rest pose
    }
    return true;
  }

  /** Whether the net is currently at rest (lets the scene skip per-frame redraws). */
  isSettled(): boolean {
    return this.settled;
  }

  /** Displaced SCREEN position of a node, for rendering. Pinned border nodes sit
   *  exactly on the frame; interior nodes are offset along the push direction by z. */
  point(col: number, row: number): { x: number; y: number } {
    const baseX = this.goal.x + (col / this.cols) * this.goal.width;
    const baseY = this.goal.y + (row / this.rows) * this.goal.height;
    if (this.pinned(col, row)) return { x: baseX, y: baseY };
    const N = CONFIG.JUICE.net;
    const z = this.z[this.idx(col, row)];
    return {
      x: baseX + N.pushXFrac * this.spacing * z,
      y: baseY + N.pushYFrac * this.spacing * z,
    };
  }

  get gridCols(): number {
    return this.cols;
  }
  get gridRows(): number {
    return this.rows;
  }
}

// Small local clamps (kept here so NetSim stays Phaser-free / unit-testable).
function clampAbs(v: number, max: number): number {
  return v > max ? max : v < -max ? -max : v;
}
function Phaser_clamp01(v: number): number {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}
