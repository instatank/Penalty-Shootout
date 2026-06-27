/**
 * GameScene.ts — Milestone 1 static scene.
 *
 * Draws the whole pitch procedurally (no sprite art in v2): a perspective
 * penalty box, the goal frame + net, the 3x2 aiming grid on the goal mouth, a
 * keeper standing in goal, and the ball on the penalty spot.
 *
 * There is NO input and NO ball flight yet — those arrive in Milestones 2–3.
 * Everything positioned here reads from CONFIG.GEOMETRY / CONFIG.COLORS so the
 * scene is fully tunable from config.ts (architecture RULE 1).
 */

import Phaser from 'phaser';
import { CONFIG } from '../../config';
import { ZONE_IDS, zoneRect, zoneCenter, goalRect } from '../zones';
import { DebugOverlay } from '../../ui/DebugOverlay';

export class GameScene extends Phaser.Scene {
  private debug!: DebugOverlay;

  constructor() {
    super('GameScene');
  }

  create(): void {
    this.drawBackground();
    this.drawPenaltyBox();
    this.drawGoal();
    this.drawNet();
    this.drawZoneGrid();
    this.drawKeeper();
    this.drawBall();

    // Mandatory tuning overlay (RULE 2). No swipe values yet in M1.
    this.debug = new DebugOverlay(this);
    this.debug.setLines([
      'PENALTY SHOOTOUT',
      'Milestone 1 — static scene',
      'landscape ' + CONFIG.GAME.width + 'x' + CONFIG.GAME.height,
      'no input / flight yet',
      'tap DBG to hide',
    ]);
  }

  // ── Background: dark stadium above the goal line, green pitch below ────────
  // Splitting the screen at the goal line is the main contrast move — it breaks
  // up the all-green look and makes the white goal frame read clearly.
  private drawBackground(): void {
    const { width, height } = CONFIG.GAME;
    const horizon = CONFIG.GEOMETRY.boxFarY; // goal line = where stadium meets grass
    const g = this.add.graphics();

    // Stadium backdrop (everything above the goal line).
    g.fillStyle(CONFIG.COLORS.stadium, 1);
    g.fillRect(0, 0, width, horizon);
    // A lighter band suggesting stands/crowd, for depth.
    g.fillStyle(CONFIG.COLORS.stadiumBand, 1);
    g.fillRect(0, horizon * 0.28, width, horizon * 0.22);

    // Grass (everything below the goal line).
    g.fillStyle(CONFIG.COLORS.pitch, 1);
    g.fillRect(0, horizon, width, height - horizon);

    // Horizontal mowed stripes that grow taller toward the camera (cheap depth).
    g.fillStyle(CONFIG.COLORS.pitchStripe, 1);
    const stripes = 8;
    for (let i = 0; i < stripes; i += 2) {
      const t0 = i / stripes;
      const t1 = (i + 1) / stripes;
      // Ease so near stripes (bottom) are taller than far stripes (top).
      const y0 = horizon + Math.pow(t0, 1.6) * (height - horizon);
      const y1 = horizon + Math.pow(t1, 1.6) * (height - horizon);
      g.fillRect(0, y0, width, y1 - y0);
    }
  }

  // ── Perspective penalty box: a trapezoid narrow at the goal, wide near you ─
  private drawPenaltyBox(): void {
    const geo = CONFIG.GEOMETRY;
    const cx = CONFIG.GAME.width / 2;
    const g = this.add.graphics();
    g.lineStyle(4, CONFIG.COLORS.boxLine, 0.85);

    const farL = cx - geo.boxFarHalfWidth;
    const farR = cx + geo.boxFarHalfWidth;
    const nearL = cx - geo.boxNearHalfWidth;
    const nearR = cx + geo.boxNearHalfWidth;

    // Box outline (two converging sides + near edge; far edge is the goal line).
    g.beginPath();
    g.moveTo(farL, geo.boxFarY);
    g.lineTo(nearL, geo.boxNearY);
    g.lineTo(nearR, geo.boxNearY);
    g.lineTo(farR, geo.boxFarY);
    g.strokePath();

    // Goal line across the far edge.
    g.lineBetween(farL, geo.boxFarY, farR, geo.boxFarY);

    // Penalty spot.
    g.fillStyle(CONFIG.COLORS.boxLine, 1);
    g.fillCircle(cx, geo.penaltySpotY, 6);
  }

  // ── Goal frame: two posts + crossbar with a faint shadow for solidity ─────
  private drawGoal(): void {
    const geo = CONFIG.GEOMETRY;
    const t = geo.postThickness;
    const g = this.add.graphics();

    // Shadow offset slightly down-right.
    g.fillStyle(CONFIG.COLORS.goalFrameShadow, 1);
    g.fillRect(geo.goalLeft - t / 2 + 3, geo.goalTop - t / 2 + 3, t, geo.goalBottom - geo.goalTop + t);
    g.fillRect(geo.goalRight - t / 2 + 3, geo.goalTop - t / 2 + 3, t, geo.goalBottom - geo.goalTop + t);
    g.fillRect(geo.goalLeft - t / 2 + 3, geo.goalTop - t / 2 + 3, geo.goalRight - geo.goalLeft + t, t);

    // Frame.
    g.fillStyle(CONFIG.COLORS.goalFrame, 1);
    // Left post, right post, crossbar.
    g.fillRect(geo.goalLeft - t / 2, geo.goalTop - t / 2, t, geo.goalBottom - geo.goalTop + t);
    g.fillRect(geo.goalRight - t / 2, geo.goalTop - t / 2, t, geo.goalBottom - geo.goalTop + t);
    g.fillRect(geo.goalLeft - t / 2, geo.goalTop - t / 2, geo.goalRight - geo.goalLeft + t, t);
  }

  // ── Net: a light cross-hatch inside the goal mouth ────────────────────────
  private drawNet(): void {
    const r = goalRect();
    const geo = CONFIG.GEOMETRY;
    const g = this.add.graphics();
    g.lineStyle(1, CONFIG.COLORS.net, 0.18);

    for (let c = 1; c < geo.netCols; c++) {
      const x = r.x + (c / geo.netCols) * r.width;
      g.lineBetween(x, r.y, x, r.y + r.height);
    }
    for (let row = 1; row < geo.netRows; row++) {
      const y = r.y + (row / geo.netRows) * r.height;
      g.lineBetween(r.x, y, r.x + r.width, y);
    }
  }

  // ── 3x2 aiming grid on the goal mouth (PRD §5) ────────────────────────────
  private drawZoneGrid(): void {
    const g = this.add.graphics();
    g.lineStyle(2, CONFIG.COLORS.zoneLine, 0.5);

    for (const id of ZONE_IDS) {
      const rect = zoneRect(id);
      g.strokeRect(rect.x, rect.y, rect.width, rect.height);

      if (CONFIG.DEBUG.showZoneLabels) {
        const c = zoneCenter(id);
        this.add
          .text(c.x, c.y, id, {
            fontFamily: 'monospace',
            fontSize: '20px',
            color: '#ffffff',
          })
          .setOrigin(0.5)
          .setAlpha(0.6);
      }
    }
  }

  // ── Keeper: a simple procedural humanoid standing in goal ─────────────────
  private drawKeeper(): void {
    const geo = CONFIG.GEOMETRY;
    const g = this.add.graphics();
    const cx = geo.keeperX;
    const feetY = geo.keeperFeetY;
    const w = geo.keeperWidth;
    const h = geo.keeperHeight;
    const headR = w * 0.34;

    // Body (kit).
    g.fillStyle(CONFIG.COLORS.keeperBody, 1);
    g.fillRoundedRect(cx - w / 2, feetY - h, w, h - headR, 10);

    // Arms slightly out (ready stance) — yellow gloves at the ends.
    g.fillStyle(CONFIG.COLORS.keeperBody, 1);
    g.fillRoundedRect(cx - w / 2 - 22, feetY - h + 14, 22, 16, 6);
    g.fillRoundedRect(cx + w / 2, feetY - h + 14, 22, 16, 6);
    g.fillStyle(CONFIG.COLORS.keeperGloves, 1);
    g.fillCircle(cx - w / 2 - 22, feetY - h + 22, 11);
    g.fillCircle(cx + w / 2 + 22, feetY - h + 22, 11);

    // Head.
    g.fillStyle(CONFIG.COLORS.keeperSkin, 1);
    g.fillCircle(cx, feetY - h + headR * 0.2, headR);
  }

  // ── Ball: white circle on the penalty spot with a pentagon hint ───────────
  private drawBall(): void {
    const geo = CONFIG.GEOMETRY;
    const g = this.add.graphics();
    g.fillStyle(CONFIG.COLORS.ball, 1);
    g.fillCircle(geo.ballRestX, geo.ballRestY, geo.ballRadius);
    // Simple pentagon panel hint in the centre.
    g.fillStyle(CONFIG.COLORS.ballPanel, 1);
    const pr = geo.ballRadius * 0.42;
    const pts: Phaser.Types.Math.Vector2Like[] = [];
    for (let i = 0; i < 5; i++) {
      const a = -Math.PI / 2 + (i * 2 * Math.PI) / 5;
      pts.push({ x: geo.ballRestX + Math.cos(a) * pr, y: geo.ballRestY + Math.sin(a) * pr });
    }
    g.fillPoints(pts as Phaser.Geom.Point[], true);

    // Soft ground shadow under the ball.
    const shadow = this.add.graphics();
    shadow.fillStyle(0x000000, 0.22);
    shadow.fillEllipse(geo.ballRestX, geo.ballRestY + geo.ballRadius * 0.9, geo.ballRadius * 1.8, geo.ballRadius * 0.5);
    shadow.setDepth(-1);
  }
}
