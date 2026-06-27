/**
 * zones.ts — the 3x2 aiming/resolution grid (PRD §5).
 *
 * The goal mouth is divided into six zones: top and bottom rows × left/middle/
 * right columns. These same zone definitions are used by BOTH the renderer
 * (drawing the grid) and later the pure resolvePenalty() (Milestone 4) — one
 * definition, no drift.
 *
 * The goal rectangle is passed IN (computed responsively in game/layout.ts)
 * rather than read from fixed config pixels, so zones adapt to any screen size
 * and stay side-effect-free for the future pure resolver.
 */

import { CONFIG } from '../config';

/** The six zone ids: row (T/B) + column (L/M/R). */
export type ZoneId = 'TL' | 'TM' | 'TR' | 'BL' | 'BM' | 'BR';

/** All zones in reading order (top row left→right, then bottom row). */
export const ZONE_IDS: readonly ZoneId[] = ['TL', 'TM', 'TR', 'BL', 'BM', 'BR'];

export interface Rect {
  x: number; // top-left
  y: number;
  width: number;
  height: number;
}

/** Column index 0..2 (L,M,R) and row index 0..1 (T,B) for a zone id. */
export function zoneIndices(id: ZoneId): { col: number; row: number } {
  const row = id[0] === 'T' ? 0 : 1;
  const colChar = id[1];
  const col = colChar === 'L' ? 0 : colChar === 'M' ? 1 : 2;
  return { col, row };
}

/** Build a zone id from column (0..2) and row (0..1) indices. */
export function zoneFrom(col: number, row: number): ZoneId {
  const colChar = col === 0 ? 'L' : col === 1 ? 'M' : 'R';
  const rowChar = row === 0 ? 'T' : 'B';
  return `${rowChar}${colChar}` as ZoneId;
}

/** Pixel rectangle of a given zone within the supplied goal mouth. */
export function zoneRect(id: ZoneId, goal: Rect): Rect {
  const { zoneCols, zoneRows } = CONFIG.GEOMETRY;
  const { col, row } = zoneIndices(id);
  const cellW = goal.width / zoneCols;
  const cellH = goal.height / zoneRows;
  return {
    x: goal.x + col * cellW,
    y: goal.y + row * cellH,
    width: cellW,
    height: cellH,
  };
}

/** Centre point of a zone — the default aim target for that cell. */
export function zoneCenter(id: ZoneId, goal: Rect): { x: number; y: number } {
  const r = zoneRect(id, goal);
  return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
}

/** Which zone a point on the goal plane falls into (null if outside the goal). */
export function zoneAtPoint(x: number, y: number, goal: Rect): ZoneId | null {
  if (x < goal.x || x > goal.x + goal.width || y < goal.y || y > goal.y + goal.height) {
    return null;
  }
  const { zoneCols, zoneRows } = CONFIG.GEOMETRY;
  const col = Math.min(zoneCols - 1, Math.floor(((x - goal.x) / goal.width) * zoneCols));
  const row = Math.min(zoneRows - 1, Math.floor(((y - goal.y) / goal.height) * zoneRows));
  const colChar = col === 0 ? 'L' : col === 1 ? 'M' : 'R';
  const rowChar = row === 0 ? 'T' : 'B';
  return `${rowChar}${colChar}` as ZoneId;
}
