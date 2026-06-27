/**
 * GameScene.ts — Milestone 1 static scene (now RESPONSIVE).
 *
 * Draws the whole pitch procedurally (no sprite art in v2): a dark stadium
 * backdrop, a perspective penalty box, the goal frame + net, the 3x2 aiming
 * grid, a keeper in goal, and the ball on the spot.
 *
 * Responsive: every visual is positioned from a Layout computed for the LIVE
 * canvas size (game/layout.ts), so the scene fills any screen with no letterbox
 * bars and adapts to portrait or landscape. On resize / orientation change the
 * scene recomputes the layout and redraws.
 *
 * There is NO input and NO ball flight yet — those arrive in Milestones 2–3.
 * Every position reads from CONFIG via the layout, so the scene is fully
 * tunable from config.ts (architecture RULE 1).
 */

import Phaser from 'phaser';
import { CONFIG } from '../../config';
import { ZONE_IDS, zoneRect, zoneCenter } from '../zones';
import { computeLayout, type Layout } from '../layout';
import { computeAim } from '../aim';
import { SwipeInput, deriveSwipe, type SwipePhase, type SwipePoint } from '../../input/SwipeInput';
import { DebugOverlay } from '../../ui/DebugOverlay';

export class GameScene extends Phaser.Scene {
  private debug!: DebugOverlay;
  private world!: Phaser.GameObjects.Container; // all pitch visuals live here
  private fx!: Phaser.GameObjects.Graphics; // swipe / aim feedback overlay
  private layout!: Layout;

  constructor() {
    super('GameScene');
  }

  create(): void {
    // Container we can wipe and rebuild whenever the screen size changes.
    this.world = this.add.container(0, 0);

    this.rebuild(this.scale.width, this.scale.height);

    // Swipe-feedback layer sits above the pitch but below the debug overlay.
    this.fx = this.add.graphics().setDepth(500);

    // Mandatory tuning overlay (RULE 2).
    this.debug = new DebugOverlay(this);
    this.showIdleDebug();

    // Input layer (PRD §4): raw Pointer Events + capture + path sampling. The
    // instance stays alive via its own canvas listeners and self-cleans on
    // scene shutdown, so it needs no stored reference.
    new SwipeInput(this, { onUpdate: (phase, pts) => this.onSwipe(phase, pts) });

    // Redraw on resize / orientation change.
    this.scale.on('resize', this.onResize, this);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.scale.off('resize', this.onResize, this);
    });
  }

  private onResize(gameSize: Phaser.Structs.Size): void {
    this.rebuild(gameSize.width, gameSize.height);
    this.fx.clear(); // any in-flight swipe feedback is stale after a resize
    this.showIdleDebug();
  }

  // ── Input → live aim preview + debug readout (no ball flight yet, M2) ──────
  private onSwipe(phase: SwipePhase, points: SwipePoint[]): void {
    if (points.length < 2) {
      // Just a touch-down so far — nothing to derive.
      if (phase === 'start') this.fx.clear();
      return;
    }

    const sample = deriveSwipe(points, this.scale.height);
    const aim = computeAim(sample, this.layout.goal, this.scale.width, this.scale.height);

    // Test hook (dev only; stripped from production builds).
    if (import.meta.env.DEV) (window as unknown as { __lastAim?: unknown }).__lastAim = aim;

    // Ignore taps (tiny gestures) on release.
    const minDist = this.scale.height * CONFIG.INPUT.minSwipeDistFrac;
    if (phase === 'end' && sample.distance < minDist) {
      this.fx.clear();
      this.showIdleDebug();
      return;
    }

    // Swipe displacement as % of screen — handy for calibrating reach distances.
    const upPct = Math.round((-sample.dy / this.scale.height) * 100);
    const sidePct = Math.round((sample.dx / this.scale.width) * 100);

    this.drawSwipeFeedback(sample.points, aim);
    this.debug.setLines([
      'SWIPE' + (phase === 'end' ? ' (release)' : ''),
      'swipe  up ' + upPct + '%   side ' + (sidePct >= 0 ? '+' : '') + sidePct + '%',
      'power ' + sample.power.toFixed(2) + '   curve ' + (sample.curve >= 0 ? '+' : '') + sample.curve.toFixed(2),
      'aim  x ' + aim.xFrac.toFixed(2) + '   height ' + aim.heightFrac.toFixed(2),
      'errR ' + Math.round(aim.errorRadius) + 'px',
      'target ' + (aim.targetZone ?? 'MISS (wide/over)'),
    ]);
  }

  private drawSwipeFeedback(points: SwipePoint[], aim: ReturnType<typeof computeAim>): void {
    const g = this.fx;
    g.clear();

    // Targeted zone cell (faint fill).
    if (aim.targetZone) {
      const r = zoneRect(aim.targetZone, this.layout.goal);
      g.fillStyle(CONFIG.COLORS.zoneHighlight, 0.18);
      g.fillRect(r.x, r.y, r.width, r.height);
    }

    // Sampled finger path.
    g.lineStyle(2, CONFIG.COLORS.swipePath, 0.9);
    g.beginPath();
    g.moveTo(points[0].x, points[0].y);
    for (let i = 1; i < points.length; i++) g.lineTo(points[i].x, points[i].y);
    g.strokePath();

    // Aim line from the ball to the target.
    const ball = this.layout.ball;
    g.lineStyle(2, CONFIG.COLORS.aimLine, 0.5);
    g.lineBetween(ball.x, ball.y, aim.targetX, aim.targetY);

    // Scatter ring (errorRadius) — grows with power.
    g.lineStyle(2, CONFIG.COLORS.aimRing, 0.8);
    g.strokeCircle(aim.targetX, aim.targetY, aim.errorRadius);

    // Reticle crosshair at the target.
    const s = Math.max(8, ball.r * 0.6);
    g.lineStyle(3, CONFIG.COLORS.aimReticle, 1);
    g.lineBetween(aim.targetX - s, aim.targetY, aim.targetX + s, aim.targetY);
    g.lineBetween(aim.targetX, aim.targetY - s, aim.targetX, aim.targetY + s);
  }

  /** Recompute the layout for the given size and redraw every pitch visual. */
  private rebuild(width: number, height: number): void {
    this.layout = computeLayout(width, height);
    this.world.removeAll(true); // destroy old visuals

    this.drawBackground();
    this.drawPenaltyBox();
    this.drawGoal();
    this.drawNet();
    this.drawZoneGrid();
    this.drawKeeper();
    this.drawBall();
  }

  private showIdleDebug(): void {
    const l = this.layout;
    this.debug.setLines([
      'PENALTY SHOOTOUT',
      'Milestone 2 — input layer',
      (l.isLandscape ? 'landscape' : 'portrait') + ' ' + Math.round(l.width) + 'x' + Math.round(l.height),
      'swipe to aim →',
      'tap DBG to hide',
    ]);
  }

  /** Helper: a fresh graphics object parented to the world container. */
  private g(): Phaser.GameObjects.Graphics {
    const gfx = this.add.graphics();
    this.world.add(gfx);
    return gfx;
  }

  // ── Background: dark stadium above the goal line, green pitch below ────────
  // Splitting at the goal line breaks up the all-green look and makes the white
  // goal frame read clearly.
  private drawBackground(): void {
    const { width, height } = this.layout;
    const horizon = this.layout.horizonY;
    const g = this.g();

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
      const y0 = horizon + Math.pow(t0, 1.6) * (height - horizon);
      const y1 = horizon + Math.pow(t1, 1.6) * (height - horizon);
      g.fillRect(0, y0, width, y1 - y0);
    }
  }

  // ── Perspective penalty box: a trapezoid narrow at the goal, wide near you ─
  private drawPenaltyBox(): void {
    const b = this.layout.box;
    const g = this.g();
    g.lineStyle(4, CONFIG.COLORS.boxLine, 0.85);

    g.beginPath();
    g.moveTo(b.farL, b.farY);
    g.lineTo(b.nearL, b.nearY);
    g.lineTo(b.nearR, b.nearY);
    g.lineTo(b.farR, b.farY);
    g.strokePath();

    // Goal line across the far edge.
    g.lineBetween(b.farL, b.farY, b.farR, b.farY);

    // Penalty spot.
    const spot = this.layout.spot;
    g.fillStyle(CONFIG.COLORS.boxLine, 1);
    g.fillCircle(spot.x, spot.y, Math.max(4, this.layout.ball.r * 0.2));
  }

  // ── Goal frame: two posts + crossbar with a faint shadow for solidity ─────
  private drawGoal(): void {
    const goal = this.layout.goal;
    const t = this.layout.post;
    const g = this.g();
    const left = goal.x;
    const right = goal.x + goal.width;
    const top = goal.y;
    const bottom = goal.y + goal.height;

    // Shadow offset slightly down-right.
    g.fillStyle(CONFIG.COLORS.goalFrameShadow, 1);
    g.fillRect(left - t / 2 + 3, top - t / 2 + 3, t, goal.height + t);
    g.fillRect(right - t / 2 + 3, top - t / 2 + 3, t, goal.height + t);
    g.fillRect(left - t / 2 + 3, top - t / 2 + 3, goal.width + t, t);

    // Frame: left post, right post, crossbar.
    g.fillStyle(CONFIG.COLORS.goalFrame, 1);
    g.fillRect(left - t / 2, top - t / 2, t, goal.height + t);
    g.fillRect(right - t / 2, top - t / 2, t, goal.height + t);
    g.fillRect(left - t / 2, top - t / 2, goal.width + t, t);

    // (bottom unused but keeps the four edges explicit for readers)
    void bottom;
  }

  // ── Net: a light cross-hatch inside the goal mouth ────────────────────────
  private drawNet(): void {
    const r = this.layout.goal;
    const geo = CONFIG.GEOMETRY;
    const g = this.g();
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
    const goal = this.layout.goal;
    const g = this.g();
    g.lineStyle(2, CONFIG.COLORS.zoneLine, 0.5);

    const fontPx = Math.round(Math.min(goal.width, goal.height) * 0.09);
    for (const id of ZONE_IDS) {
      const rect = zoneRect(id, goal);
      g.strokeRect(rect.x, rect.y, rect.width, rect.height);

      if (CONFIG.DEBUG.showZoneLabels) {
        const c = zoneCenter(id, goal);
        const label = this.add
          .text(c.x, c.y, id, {
            fontFamily: 'monospace',
            fontSize: fontPx + 'px',
            color: '#ffffff',
          })
          .setOrigin(0.5)
          .setAlpha(0.6);
        this.world.add(label);
      }
    }
  }

  // ── Keeper: a simple procedural humanoid standing in goal ─────────────────
  private drawKeeper(): void {
    const k = this.layout.keeper;
    const g = this.g();
    const cx = k.x;
    const feetY = k.feetY;
    const w = k.w;
    const h = k.h;
    const headR = w * 0.34;
    const armLen = w * 0.38;
    const armY = feetY - h + h * 0.18;
    const gloveR = w * 0.2;

    // Body (kit).
    g.fillStyle(CONFIG.COLORS.keeperBody, 1);
    g.fillRoundedRect(cx - w / 2, feetY - h, w, h - headR, Math.max(6, w * 0.16));

    // Arms slightly out (ready stance) + gloves at the ends.
    g.fillRoundedRect(cx - w / 2 - armLen, armY, armLen, h * 0.13, 6);
    g.fillRoundedRect(cx + w / 2, armY, armLen, h * 0.13, 6);
    g.fillStyle(CONFIG.COLORS.keeperGloves, 1);
    g.fillCircle(cx - w / 2 - armLen, armY + h * 0.065, gloveR);
    g.fillCircle(cx + w / 2 + armLen, armY + h * 0.065, gloveR);

    // Head.
    g.fillStyle(CONFIG.COLORS.keeperSkin, 1);
    g.fillCircle(cx, feetY - h + headR * 0.2, headR);
  }

  // ── Ball: white circle on the penalty spot with a pentagon hint ───────────
  private drawBall(): void {
    const ball = this.layout.ball;
    const g = this.g();

    // Soft ground shadow under the ball.
    g.fillStyle(0x000000, 0.22);
    g.fillEllipse(ball.x, ball.y + ball.r * 0.9, ball.r * 1.8, ball.r * 0.5);

    // Ball body.
    g.fillStyle(CONFIG.COLORS.ball, 1);
    g.fillCircle(ball.x, ball.y, ball.r);

    // Pentagon panel hint in the centre.
    g.fillStyle(CONFIG.COLORS.ballPanel, 1);
    const pr = ball.r * 0.42;
    const pts: Phaser.Types.Math.Vector2Like[] = [];
    for (let i = 0; i < 5; i++) {
      const a = -Math.PI / 2 + (i * 2 * Math.PI) / 5;
      pts.push({ x: ball.x + Math.cos(a) * pr, y: ball.y + Math.sin(a) * pr });
    }
    g.fillPoints(pts as Phaser.Geom.Point[], true);
  }
}
