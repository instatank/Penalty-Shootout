/**
 * GameScene.ts — Milestone 4: Taker mode complete (RESPONSIVE).
 *
 * The human swipes to shoot; a CPU keeper dives; the single pure resolvePenalty()
 * decides GOAL / SAVE / MISS. Crucially the kick loop pulls both actions through
 * the InputProvider interface and NEVER branches on "CPU vs human" — that is what
 * lets online (M8) drop in by swapping providers (PRD §7/§8).
 *
 * Flow per kick: enterAiming → await taker (LocalHumanProvider, a real swipe) →
 * await keeper (CpuProvider dive) → resolvePenalty(seed) → animate ball + dive →
 * reveal outcome → reset. Sessions/scoring are Milestone 6.
 *
 * Responsive: every visual is positioned from a Layout computed for the LIVE
 * canvas size (game/layout.ts). The pitch is static (world container); the ball
 * and keeper are separate movable objects so they can fly/dive.
 */

import Phaser from 'phaser';
import { CONFIG } from '../../config';
import { ZONE_IDS, zoneRect, zoneCenter } from '../zones';
import { computeLayout, type Layout } from '../layout';
import { computeAim } from '../aim';
import { resolvePenalty, type PenaltyResult, type TakerInput, type KeeperInput } from '../resolve';
import { LocalHumanProvider, CpuProvider, type PenaltyContext } from '../../input/providers';
import { SwipeInput, deriveSwipe, type SwipePhase, type SwipePoint } from '../../input/SwipeInput';
import { DebugOverlay } from '../../ui/DebugOverlay';

type SceneState = 'aiming' | 'busy';

export class GameScene extends Phaser.Scene {
  private debug!: DebugOverlay;
  private world!: Phaser.GameObjects.Container; // static pitch visuals
  private fx!: Phaser.GameObjects.Graphics; // swipe / aim feedback overlay
  private ball!: Phaser.GameObjects.Container;
  private ballGfx!: Phaser.GameObjects.Graphics;
  private keeper!: Phaser.GameObjects.Container;
  private keeperGfx!: Phaser.GameObjects.Graphics;
  private outcomeText!: Phaser.GameObjects.Text;
  private layout!: Layout;

  private state: SceneState = 'aiming';
  private epoch = 0; // bumps on resize to invalidate an in-flight kick
  private alive = true;
  private activeResolvers: Array<() => void> = []; // pending awaitable resolvers

  private taker = new LocalHumanProvider();
  private keeperProvider = new CpuProvider();

  constructor() {
    super('GameScene');
  }

  create(): void {
    this.world = this.add.container(0, 0);

    // Movable actors (the pitch behind them is static).
    this.ballGfx = this.add.graphics();
    this.ball = this.add.container(0, 0, [this.ballGfx]).setDepth(400);
    this.keeperGfx = this.add.graphics();
    this.keeper = this.add.container(0, 0, [this.keeperGfx]).setDepth(380);

    this.rebuild(this.scale.width, this.scale.height);

    this.fx = this.add.graphics().setDepth(500);

    // Big GOAL / SAVE / MISS banner, centred, hidden until a result.
    this.outcomeText = this.add
      .text(0, 0, '', { fontFamily: 'sans-serif', fontStyle: 'bold', fontSize: '64px', color: '#ffffff' })
      .setOrigin(0.5)
      .setDepth(900)
      .setVisible(false);

    this.debug = new DebugOverlay(this);
    this.showIdleDebug();

    // Dev-only hook for headless tests (stripped from production).
    if (import.meta.env.DEV) {
      (window as unknown as Record<string, unknown>).__penalty = { resolvePenalty };
    }

    // Input layer (PRD §4). Self-cleans on shutdown.
    new SwipeInput(this, { onUpdate: (phase, pts) => this.onSwipe(phase, pts) });

    this.scale.on('resize', this.onResize, this);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.alive = false;
      this.scale.off('resize', this.onResize, this);
    });

    void this.runKickLoop();
  }

  // ── The provider-driven kick loop (never branches on CPU vs human) ────────
  private async runKickLoop(): Promise<void> {
    while (this.alive) {
      const epoch = this.epoch;
      try {
        this.enterAiming();

        const ctx: PenaltyContext = { seed: this.makeSeed(), goal: this.layout.goal };

        // Taker action: a real swipe (LocalHumanProvider). null = cancelled (resize).
        const taker = await this.taker.getTakerInput(ctx).catch(() => null);
        if (!taker || epoch !== this.epoch) continue;

        this.state = 'busy';
        const keeper = await this.keeperProvider.getKeeperInput(ctx, taker);
        if (epoch !== this.epoch) continue;

        const result = resolvePenalty(taker, keeper, ctx.seed);

        await this.animateKick(taker, keeper, result);
        if (epoch !== this.epoch) continue;
        await this.showOutcome(result);
        if (epoch !== this.epoch) continue;
        await this.delayP(CONFIG.UI.betweenKicksMs);
      } catch (e) {
        // A single kick failing must not kill the loop.
        console.error('[kick loop]', e);
        await this.delayP(200);
      }
    }
  }

  private makeSeed(): number {
    return Math.floor(Math.random() * 0x7fffffff);
  }

  private enterAiming(): void {
    this.abortAll();
    this.state = 'aiming';
    this.fx.clear();
    this.outcomeText.setVisible(false);
    this.resetBall();
    this.resetKeeper();
    this.showIdleDebug();
  }

  private onResize(gameSize: Phaser.Structs.Size): void {
    this.epoch++; // invalidate the current kick's post-await steps
    this.taker.cancel(); // unblock a pending aim wait
    this.abortAll(); // resolve any pending animations/delays
    this.rebuild(gameSize.width, gameSize.height);
    this.fx.clear();
    this.outcomeText.setPosition(gameSize.width / 2, gameSize.height * 0.42);
    this.showIdleDebug();
  }

  // ── Input → aim preview while aiming; commit the shot on release ───────────
  private onSwipe(phase: SwipePhase, points: SwipePoint[]): void {
    if (this.state !== 'aiming') return; // ignore input while a kick is resolving

    if (points.length < 2) {
      if (phase === 'start') this.fx.clear();
      return;
    }

    const sample = deriveSwipe(points, this.scale.height);
    const aim = computeAim(sample, this.layout.goal, this.scale.width, this.scale.height);

    if (import.meta.env.DEV) {
      (window as unknown as { __lastAim?: unknown }).__lastAim = aim;
      (window as unknown as { __lastPower?: number }).__lastPower = sample.power;
    }

    const minDist = this.scale.height * CONFIG.INPUT.minSwipeDistFrac;
    if (phase === 'end' && sample.distance < minDist) {
      this.fx.clear();
      this.showIdleDebug();
      return;
    }

    const upPct = Math.round((-sample.dy / this.scale.height) * 100);
    const sidePct = Math.round((sample.dx / this.scale.width) * 100);

    this.drawSwipeFeedback(sample.points, aim);
    this.debug.setLines([
      'SWIPE' + (phase === 'end' ? ' (release)' : ''),
      'swipe  up ' + upPct + '%   side ' + (sidePct >= 0 ? '+' : '') + sidePct + '%',
      'power ' + sample.power.toFixed(2) + '   curve ' + (sample.curve >= 0 ? '+' : '') + sample.curve.toFixed(2),
      'aim  x ' + aim.xFrac.toFixed(2) + '   height ' + aim.heightFrac.toFixed(2),
      'target ' + (aim.targetZone ?? 'MISS (wide/over)'),
    ]);

    if (phase === 'end') this.taker.submitSwipe(sample, aim); // hand off to the loop
  }

  // ── Animate the ball flight + keeper dive together ────────────────────────
  private async animateKick(taker: TakerInput, keeper: KeeperInput, result: PenaltyResult): Promise<void> {
    const F = CONFIG.FLIGHT;
    const K = CONFIG.CPU_KEEPER;
    const goal = this.layout.goal;
    const start = { x: this.layout.ball.x, y: this.layout.ball.y };

    // Keeper dives to the SAME point the resolver used (result.keeperNorm), so
    // the visible dive and the outcome always agree. Hands reach (handX, handY).
    const handX = goal.x + result.keeperNorm.x * goal.width;
    const handY = goal.y + result.keeperNorm.y * goal.height;
    const feetX = handX;
    const feetY = handY + this.layout.keeper.h * 0.5; // place the body so the gloves cover handY
    const lean = Phaser.Math.Clamp((handX - this.layout.keeper.x) / (goal.width * 0.5), -1, 1) * 0.7;
    this.time.delayedCall(K.reactionDelay, () => {
      this.tweens.add({ targets: this.keeper, x: feetX, y: feetY, rotation: lean, duration: K.diveDuration, ease: 'Quad.easeOut' });
    });

    // Ball end: a save meets the keeper's gloves; otherwise its landing point.
    const end = result.saved ? { x: handX, y: handY } : taker.landingPoint;
    this.drawLandingMarker(taker.landingPoint);

    const arcPx = this.scale.height * F.arcHeightFrac;
    const bendPx = taker.curve * F.curveGain * goal.width;
    if (CONFIG.HAPTICS.enabled) navigator.vibrate?.(CONFIG.HAPTICS.kickMs);

    this.debug.setLines([
      'FLIGHT',
      'power ' + taker.power.toFixed(2),
      'landing ' + (taker.landingZone ?? 'WIDE/OVER') + '   keeper ' + keeper.diveZone,
      'timing ' + result.timingQuality.toFixed(2) + '   reach ' + result.reachMargin.toFixed(2),
    ]);

    const prog = { t: 0 };
    await this.tweenP({
      targets: prog,
      t: 1,
      duration: F.flightDuration,
      ease: F.easing,
      onUpdate: () => {
        const t = prog.t;
        const x = start.x + (end.x - start.x) * t + bendPx * Math.sin(Math.PI * t);
        const y = start.y + (end.y - start.y) * t - arcPx * Math.sin(Math.PI * t);
        this.ball.setPosition(x, y);
        this.ball.setScale(F.scaleStart + (F.scaleEnd - F.scaleStart) * t);
      },
    });

    // On a save, the ball deflects off the keeper (a short rebound out + down).
    if (result.saved) {
      const dir = handX <= this.layout.keeper.x ? -1 : 1;
      await this.tweenP({
        targets: this.ball,
        x: handX + dir * goal.width * 0.08,
        y: handY + goal.height * 0.22,
        duration: 200,
        ease: 'Quad.easeOut',
      });
    }
  }

  private async showOutcome(result: PenaltyResult): Promise<void> {
    if (import.meta.env.DEV) (window as unknown as { __lastResult?: unknown }).__lastResult = result;
    const label = result.outcome === 'goal' ? 'GOAL!' : result.outcome === 'save' ? 'SAVED!' : 'MISS!';
    const color =
      result.outcome === 'goal'
        ? CONFIG.COLORS.outcomeGoal
        : result.outcome === 'save'
          ? CONFIG.COLORS.outcomeSave
          : CONFIG.COLORS.outcomeMiss;

    if (CONFIG.HAPTICS.enabled) {
      const ms = result.saved ? CONFIG.HAPTICS.saveMs : result.scored ? CONFIG.HAPTICS.goalMs : 0;
      if (ms) navigator.vibrate?.(ms);
    }

    this.outcomeText
      .setText(label)
      .setColor('#' + color.toString(16).padStart(6, '0'))
      .setFontSize(Math.round(Math.min(this.scale.width, this.scale.height) * 0.16) + 'px')
      .setPosition(this.scale.width / 2, this.scale.height * 0.42)
      .setVisible(true)
      .setScale(0.7)
      .setAlpha(1);
    this.tweens.add({ targets: this.outcomeText, scale: 1, duration: 220, ease: 'Back.easeOut' });

    await this.delayP(CONFIG.UI.outcomeHoldMs);
    this.outcomeText.setVisible(false);
  }

  // ── Awaitable, abortable timers/tweens (so a resize can't deadlock the loop)
  private delayP(ms: number): Promise<void> {
    return new Promise<void>((resolve) => {
      const done = () => {
        this.removeResolver(done);
        resolve();
      };
      this.activeResolvers.push(done);
      this.time.delayedCall(ms, done);
    });
  }

  private tweenP(cfg: Phaser.Types.Tweens.TweenBuilderConfig): Promise<void> {
    return new Promise<void>((resolve) => {
      const done = () => {
        this.removeResolver(done);
        resolve();
      };
      this.activeResolvers.push(done);
      this.tweens.add({ ...cfg, onComplete: done });
    });
  }

  private removeResolver(fn: () => void): void {
    const i = this.activeResolvers.indexOf(fn);
    if (i >= 0) this.activeResolvers.splice(i, 1);
  }

  private abortAll(): void {
    this.tweens.killAll();
    this.time.removeAllEvents();
    const pending = this.activeResolvers.slice();
    this.activeResolvers = [];
    pending.forEach((r) => r());
  }

  private drawSwipeFeedback(points: SwipePoint[], aim: ReturnType<typeof computeAim>): void {
    const g = this.fx;
    g.clear();

    if (aim.targetZone) {
      const r = zoneRect(aim.targetZone, this.layout.goal);
      g.fillStyle(CONFIG.COLORS.zoneHighlight, 0.18);
      g.fillRect(r.x, r.y, r.width, r.height);
    }

    g.lineStyle(2, CONFIG.COLORS.swipePath, 0.9);
    g.beginPath();
    g.moveTo(points[0].x, points[0].y);
    for (let i = 1; i < points.length; i++) g.lineTo(points[i].x, points[i].y);
    g.strokePath();

    const ball = this.layout.ball;
    g.lineStyle(2, CONFIG.COLORS.aimLine, 0.5);
    g.lineBetween(ball.x, ball.y, aim.targetX, aim.targetY);

    g.lineStyle(2, CONFIG.COLORS.aimRing, 0.8);
    g.strokeCircle(aim.targetX, aim.targetY, aim.errorRadius);

    const s = Math.max(8, ball.r * 0.6);
    g.lineStyle(3, CONFIG.COLORS.aimReticle, 1);
    g.lineBetween(aim.targetX - s, aim.targetY, aim.targetX + s, aim.targetY);
    g.lineBetween(aim.targetX, aim.targetY - s, aim.targetX, aim.targetY + s);
  }

  private drawLandingMarker(p: { x: number; y: number }): void {
    const g = this.fx;
    g.clear();
    const r = Math.max(5, this.layout.ball.r * 0.35);
    g.lineStyle(3, CONFIG.COLORS.aimReticle, 0.9);
    g.strokeCircle(p.x, p.y, r);
  }

  /** Recompute the layout and redraw every STATIC pitch visual + reset actors. */
  private rebuild(width: number, height: number): void {
    this.layout = computeLayout(width, height);
    this.world.removeAll(true);

    this.drawBackground();
    this.drawPenaltyBox();
    this.drawGoal();
    this.drawNet();
    this.drawZoneGrid();
    this.drawBallShadow();

    this.resetBall();
    this.resetKeeper();
  }

  private resetBall(): void {
    this.drawBallGraphic(this.layout.ball.r);
    this.ball.setScale(1).setPosition(this.layout.ball.x, this.layout.ball.y);
  }

  private resetKeeper(): void {
    const k = this.layout.keeper;
    this.drawKeeperGraphic(k.w, k.h);
    this.keeper.setRotation(0).setPosition(k.x, k.feetY);
  }

  private showIdleDebug(): void {
    const l = this.layout;
    this.debug.setLines([
      'PENALTY SHOOTOUT',
      'Milestone 4 — Taker mode',
      (l.isLandscape ? 'landscape' : 'portrait') + ' ' + Math.round(l.width) + 'x' + Math.round(l.height),
      'swipe to shoot →  beat the keeper',
      'tap DBG to hide',
    ]);
  }

  /** Helper: a fresh graphics object parented to the world container. */
  private g(): Phaser.GameObjects.Graphics {
    const gfx = this.add.graphics();
    this.world.add(gfx);
    return gfx;
  }

  private drawBackground(): void {
    const { width, height } = this.layout;
    const horizon = this.layout.horizonY;
    const g = this.g();

    g.fillStyle(CONFIG.COLORS.stadium, 1);
    g.fillRect(0, 0, width, horizon);
    g.fillStyle(CONFIG.COLORS.stadiumBand, 1);
    g.fillRect(0, horizon * 0.28, width, horizon * 0.22);

    g.fillStyle(CONFIG.COLORS.pitch, 1);
    g.fillRect(0, horizon, width, height - horizon);

    g.fillStyle(CONFIG.COLORS.pitchStripe, 1);
    const stripes = 8;
    for (let i = 0; i < stripes; i += 2) {
      const y0 = horizon + Math.pow(i / stripes, 1.6) * (height - horizon);
      const y1 = horizon + Math.pow((i + 1) / stripes, 1.6) * (height - horizon);
      g.fillRect(0, y0, width, y1 - y0);
    }
  }

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
    g.lineBetween(b.farL, b.farY, b.farR, b.farY);

    const spot = this.layout.spot;
    g.fillStyle(CONFIG.COLORS.boxLine, 1);
    g.fillCircle(spot.x, spot.y, Math.max(4, this.layout.ball.r * 0.2));
  }

  private drawGoal(): void {
    const goal = this.layout.goal;
    const t = this.layout.post;
    const g = this.g();
    const left = goal.x;
    const right = goal.x + goal.width;
    const top = goal.y;

    g.fillStyle(CONFIG.COLORS.goalFrameShadow, 1);
    g.fillRect(left - t / 2 + 3, top - t / 2 + 3, t, goal.height + t);
    g.fillRect(right - t / 2 + 3, top - t / 2 + 3, t, goal.height + t);
    g.fillRect(left - t / 2 + 3, top - t / 2 + 3, goal.width + t, t);

    g.fillStyle(CONFIG.COLORS.goalFrame, 1);
    g.fillRect(left - t / 2, top - t / 2, t, goal.height + t);
    g.fillRect(right - t / 2, top - t / 2, t, goal.height + t);
    g.fillRect(left - t / 2, top - t / 2, goal.width + t, t);
  }

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
          .text(c.x, c.y, id, { fontFamily: 'monospace', fontSize: fontPx + 'px', color: '#ffffff' })
          .setOrigin(0.5)
          .setAlpha(0.5);
        this.world.add(label);
      }
    }
  }

  private drawBallShadow(): void {
    const ball = this.layout.ball;
    const g = this.g();
    g.fillStyle(0x000000, 0.22);
    g.fillEllipse(ball.x, ball.y + ball.r * 0.9, ball.r * 1.8, ball.r * 0.5);
  }

  private drawBallGraphic(r: number): void {
    const g = this.ballGfx;
    g.clear();
    g.fillStyle(CONFIG.COLORS.ball, 1);
    g.fillCircle(0, 0, r);
    g.fillStyle(CONFIG.COLORS.ballPanel, 1);
    const pr = r * 0.42;
    const pts: Phaser.Types.Math.Vector2Like[] = [];
    for (let i = 0; i < 5; i++) {
      const a = -Math.PI / 2 + (i * 2 * Math.PI) / 5;
      pts.push({ x: Math.cos(a) * pr, y: Math.sin(a) * pr });
    }
    g.fillPoints(pts as Phaser.Geom.Point[], true);
  }

  // Keeper drawn with FEET at the local origin (so rotation = a dive lean).
  private drawKeeperGraphic(w: number, h: number): void {
    const g = this.keeperGfx;
    g.clear();
    const headR = w * 0.34;
    const armLen = w * 0.38;
    const armY = -h + h * 0.18;
    const gloveR = w * 0.2;

    g.fillStyle(CONFIG.COLORS.keeperBody, 1);
    g.fillRoundedRect(-w / 2, -h, w, h - headR, Math.max(6, w * 0.16));
    g.fillRoundedRect(-w / 2 - armLen, armY, armLen, h * 0.13, 6);
    g.fillRoundedRect(w / 2, armY, armLen, h * 0.13, 6);

    g.fillStyle(CONFIG.COLORS.keeperGloves, 1);
    g.fillCircle(-w / 2 - armLen, armY + h * 0.065, gloveR);
    g.fillCircle(w / 2 + armLen, armY + h * 0.065, gloveR);

    g.fillStyle(CONFIG.COLORS.keeperSkin, 1);
    g.fillCircle(0, -h + headR * 0.2, headR);
  }
}
