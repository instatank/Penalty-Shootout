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
import { ZONE_IDS, zoneRect, zoneCenter, type ZoneId } from '../zones';
import { computeLayout, type Layout } from '../layout';
import { NetSim } from '../net/NetSim';
import { computeAim, computeDive, shotOutcome } from '../aim';
import { resolvePenalty, kickFlightMs, type PenaltyResult, type TakerInput, type KeeperInput } from '../resolve';
import { createShootout, recordKick, currentRound, type ShootoutState, type Side } from '../shootout';
import { LocalHumanProvider, CpuProvider, type InputProvider, type PenaltyContext } from '../../input/providers';
import { SwipeInput, deriveSwipe, type SwipePhase, type SwipePoint } from '../../input/SwipeInput';
import { DebugOverlay } from '../../ui/DebugOverlay';
import { Sfx } from '../../audio/Sfx';

// 'aiming' = idle/ready (human aims in Taker mode); 'busy' = a kick is resolving;
// 'keeping' = the human-keeper's dive window is open (Keeper mode).
type SceneState = 'aiming' | 'busy' | 'keeping';

// Which role the human plays. Swapping mode = swapping which provider is taker vs
// keeper — the kick loop itself never changes (PRD §8).
type GameMode = 'taker' | 'keeper';

// The four corner zones — a taker goal into one of these is "replay-worthy" (Tier 3).
const CORNER_ZONES = new Set<ZoneId>(['TL', 'TR', 'BL', 'BR']);

export class GameScene extends Phaser.Scene {
  private debug!: DebugOverlay;
  private world!: Phaser.GameObjects.Container; // static pitch visuals
  private netGfx!: Phaser.GameObjects.Graphics; // the net (Tier 1: live NetSim ripple)
  private netSim = new NetSim(); // Tier 1 item 1 — spring-mass net, punched on a goal
  private ballShadow!: Phaser.GameObjects.Image; // Tier 1 item 2 — grounded depth cue
  private keeperShadow!: Phaser.GameObjects.Image;
  private takerShadow!: Phaser.GameObjects.Image;
  private hitStopTimer: number | null = null; // Tier 1 item 4 — real-time freeze timer
  // Tier 2 — particle emitters (created once, exploded at key moments) + ball trail.
  private turfEmitter!: Phaser.GameObjects.Particles.ParticleEmitter;
  private sprayEmitter!: Phaser.GameObjects.Particles.ParticleEmitter;
  private dustEmitter!: Phaser.GameObjects.Particles.ParticleEmitter;
  private confettiEmitter!: Phaser.GameObjects.Particles.ParticleEmitter;
  private ballTrail!: Phaser.GameObjects.Particles.ParticleEmitter;
  private replayLabel!: Phaser.GameObjects.Text; // Tier 3 — "REPLAY" badge
  private replaySkip = false; // Tier 3 — tap-to-skip flag during a replay
  private lastScoreStr = ''; // Tier 3 — detect a score change to pop the scoreboard
  private fx!: Phaser.GameObjects.Graphics; // swipe / aim feedback overlay
  private powerGfx!: Phaser.GameObjects.Graphics; // live power meter (Phase 1)
  private ball!: Phaser.GameObjects.Container;
  private ballGfx!: Phaser.GameObjects.Graphics;
  private keeper!: Phaser.GameObjects.Container;
  private keeperGfx!: Phaser.GameObjects.Graphics;
  private takerFigure!: Phaser.GameObjects.Container; // CPU striker (Keeper mode only)
  private takerGfx!: Phaser.GameObjects.Graphics;
  private outcomeText!: Phaser.GameObjects.Text;
  private modeButton!: Phaser.GameObjects.Text; // minimal TAKE/SAVE toggle (full menu = M6)
  private layout!: Layout;
  private sfx = new Sfx();

  private state: SceneState = 'aiming';
  // `mode` is the CURRENT view/role for the kick in progress (taker = you shoot,
  // keeper = you defend). In the integrated shootout it FLIPS every turn.
  private mode: GameMode = 'taker';
  // `sessionKind` is what game is running: the full alternating take-and-save
  // SHOOTOUT, or endless keeper PRACTICE. The MODE button toggles this.
  private sessionKind: 'shootout' | 'practice' = 'shootout';
  private viewFade!: Phaser.GameObjects.Rectangle; // black cover for taker↔keeper switches
  private epoch = 0; // bumps on resize / mode switch to invalidate an in-flight kick
  private alive = true;
  private activeResolvers: Array<() => void> = []; // pending awaitable resolvers

  // The two concrete providers exist for the whole session; the role fields below
  // point at them and are what the loop reads, so a mode switch is just a swap.
  private human = new LocalHumanProvider();
  private cpu = new CpuProvider();
  private takerProvider: InputProvider = this.human; // Taker mode: human shoots
  private keeperProvider: InputProvider = this.cpu; //  Taker mode: CPU saves

  // Keeper-mode reaction state: when the strike happens (timing reference) and the
  // dive the human committed this window (null until they flick).
  private strikeAt = 0;
  private diveCaptured: { zone: ZoneId; timing: number } | null = null;
  // Keeper-view flight bookkeeping (Track A1): the flight's END is a mutable
  // point so a mid-flight save can bend the last stretch into the gloves (the
  // ball must END where the save happens, never land in the net first), and the
  // flight promise lets the outcome settle exactly when the ball arrives.
  private keeperFlightEnd: { x: number; y: number } | null = null;
  private keeperFlightDone: Promise<void> | null = null;
  private arrivalAt = 0; // wall-clock estimate of ball arrival (keeper view)

  // ── Shootout session (Phase 3) ────────────────────────────────────────────
  private session = 0; // bumps to stop the running loop (mode switch / play again)
  private shootout: ShootoutState = createShootout(); // Taker-mode score machine
  private scoreboard!: Phaser.GameObjects.Container;
  private scoreText!: Phaser.GameObjects.Text;
  private scoreSub!: Phaser.GameObjects.Text;
  private scoreDots!: Phaser.GameObjects.Graphics;
  private endBg!: Phaser.GameObjects.Rectangle;
  private endTitle!: Phaser.GameObjects.Text;
  private endScore!: Phaser.GameObjects.Text;
  private endBtn!: Phaser.GameObjects.Text;
  private diffButton!: Phaser.GameObjects.Text;
  private diffNames = ['easy', 'medium', 'hard'] as const;
  private diffIndex = 1; // default medium
  private endShown = false; // true while the end screen is up (tap anywhere → play again)

  constructor() {
    super('GameScene');
  }

  create(): void {
    this.world = this.add.container(0, 0);

    // Net is its own object so it can ripple on a goal (sits above the frame,
    // below the actors). The bulge is driven by NetSim (Tier 1, item 1).
    this.netGfx = this.add.graphics().setDepth(10);

    // Soft grounded shadows (Tier 1, item 2). One reusable blurred-ellipse texture,
    // instanced under the ball + both figures. Depth 6 = above the pitch, below the
    // net frame (10) and the actors (380+).
    this.ensureSoftShadowTexture();
    this.ballShadow = this.add.image(0, 0, 'softShadow').setDepth(6).setVisible(false);
    this.keeperShadow = this.add.image(0, 0, 'softShadow').setDepth(6).setVisible(false);
    this.takerShadow = this.add.image(0, 0, 'softShadow').setDepth(6).setVisible(false);
    for (const s of [this.ballShadow, this.keeperShadow, this.takerShadow]) {
      s.setTint(0x000000).setAlpha(CONFIG.JUICE.shadow.groundAlpha);
    }

    // Particles + ball trail (Tier 2) — emitters built once, fired on demand.
    this.createParticleSystems();

    // Movable actors (the pitch behind them is static).
    this.ballGfx = this.add.graphics();
    this.ball = this.add.container(0, 0, [this.ballGfx]).setDepth(400);
    this.keeperGfx = this.add.graphics();
    this.keeper = this.add.container(0, 0, [this.keeperGfx]).setDepth(380);
    // CPU striker — only shown in Keeper mode. Below the ball's depth so the ball
    // passes in front of it as it is struck.
    this.takerGfx = this.add.graphics();
    this.takerFigure = this.add.container(0, 0, [this.takerGfx]).setDepth(390).setVisible(false);

    // The human keeper's dive flows through the SAME LocalHumanProvider. When the
    // loop awaits its keeper input, the provider asks us (here) to present the CPU
    // shot so the human can watch and dive.
    this.human.onAwaitKeeper = (ctx, taker) => this.beginKeeperReaction(ctx, taker);

    this.rebuild(this.scale.width, this.scale.height);

    this.fx = this.add.graphics().setDepth(500);
    this.powerGfx = this.add.graphics().setDepth(950).setScrollFactor(0); // power meter (Phase 1)

    // Big GOAL / SAVE / MISS banner, centred, hidden until a result.
    this.outcomeText = this.add
      .text(0, 0, '', { fontFamily: 'sans-serif', fontStyle: 'bold', fontSize: '64px', color: '#ffffff' })
      .setOrigin(0.5)
      .setDepth(900)
      .setScrollFactor(0) // pinned to the screen so the dynamic camera can't drift it
      .setVisible(false);

    // "REPLAY" badge (Tier 3) — top-centre during a slow-mo replay, screen-pinned.
    // Blinks while a replay runs so it's unmistakable (see playReplay).
    this.replayLabel = this.add
      .text(0, 0, '● REPLAY', { fontFamily: 'monospace', fontStyle: 'bold', fontSize: '26px', color: '#ff5252', backgroundColor: '#000000aa', padding: { x: 14, y: 8 } })
      .setOrigin(0.5, 0)
      .setDepth(905)
      .setScrollFactor(0)
      .setVisible(false);

    // Black cover used to hide the taker↔keeper rebuild during a shootout turn
    // switch (depth 890: above the play field + actors, below the banner/HUD).
    this.viewFade = this.add
      .rectangle(0, 0, this.scale.width, this.scale.height, 0x07121c, 1)
      .setOrigin(0, 0)
      .setDepth(890)
      .setScrollFactor(0)
      .setAlpha(0);

    // Session toggle: the full take-and-save SHOOTOUT vs endless keeper PRACTICE.
    // Lives in the lower thumb zone. Tap, or press "M", to switch.
    this.modeButton = this.add
      .text(8, this.scale.height - 8, 'MODE: SHOOTOUT', {
        fontFamily: 'monospace',
        fontSize: '18px',
        color: '#ffffff',
        backgroundColor: '#00000088',
        padding: { x: 8, y: 6 },
      })
      .setOrigin(0, 1)
      .setDepth(1001)
      .setScrollFactor(0)
      .setInteractive({ useHandCursor: true });
    this.modeButton.on('pointerup', () => this.toggleMode());
    this.input.keyboard?.on('keydown-M', () => this.toggleMode());

    // Difficulty selector (Phase 2/3) — cycles EASY/MEDIUM/HARD, bottom-right.
    this.diffButton = this.add
      .text(this.scale.width - 8, this.scale.height - 8, '', {
        fontFamily: 'monospace',
        fontSize: '18px',
        color: '#ffffff',
        backgroundColor: '#00000088',
        padding: { x: 8, y: 6 },
      })
      .setOrigin(1, 1)
      .setDepth(1001)
      .setScrollFactor(0)
      .setInteractive({ useHandCursor: true });
    this.diffButton.on('pointerup', () => this.cycleDifficulty());
    this.applyDifficulty(); // set label + cpu.difficulty from diffIndex

    this.buildSessionUI(); // scoreboard + end screen (Phase 3)

    // Tier 3: cohesive post-FX grade (WebGL only) + tactile button press states.
    this.applyPostFX();
    this.addButtonFeedback(this.modeButton);
    this.addButtonFeedback(this.diffButton);
    this.addButtonFeedback(this.endBtn);

    this.debug = new DebugOverlay(this);
    this.showIdleDebug();

    // Dev-only hook for headless tests (stripped from production).
    if (import.meta.env.DEV) {
      (window as unknown as Record<string, unknown>).__penalty = {
        resolvePenalty, // NOTE: takes (taker, keeper, seed, flightMs) since Track A2
        kickFlightMs,
        getBallPos: () => ({ x: this.ball.x, y: this.ball.y }),
        getGoalRect: () => ({ ...this.layout.goal }),
        createShootout,
        recordKick, // expose the pure shootout logic for headless unit tests
        getState: () => ({ mode: this.mode, state: this.state, diveCaptured: this.diveCaptured }),
        getTimeScale: () => ({ clock: this.time.timeScale, tweens: this.tweens.timeScale }), // hit-stop check
        getNetEnergy: () => (this.netSim.isSettled() ? 0 : 1), // 0 = net at rest
        getParticleCounts: () => ({
          turf: this.turfEmitter.getAliveParticleCount(),
          spray: this.sprayEmitter.getAliveParticleCount(),
          dust: this.dustEmitter.getAliveParticleCount(),
          confetti: this.confettiEmitter.getAliveParticleCount(),
          trail: this.ballTrail.getAliveParticleCount(),
        }),
        burstConfetti: () => this.burstConfetti(), // headless: exercise the win-confetti path
        getRenderer: () => (this.renderer.type === Phaser.WEBGL ? 'webgl' : 'canvas'),
        // Post FX live in the camera's postPipelines (not postFX.list). 0 on canvas / when disabled.
        getPostFXCount: () => this.cameras.main.postPipelines.length,
        isReplaying: () => this.replayLabel.visible, // headless: detect a running replay
        getCamera: () => ({ zoom: this.cameras.main.zoom, sx: this.cameras.main.scrollX, sy: this.cameras.main.scrollY }),
        getShootout: () => this.shootout,
        setMode: (m: GameMode) => this.setMode(m),
        setKeeperDifficulty: (d: number) => {
          this.cpu.difficulty = d;
        },
        forceEnd: () => this.showEndScreen('opponent'), // headless: pop the end screen to test Play Again
      };
    }

    // Restart on a tap anywhere while the end screen is up. Driven by SCENE input
    // (reliable) rather than the button's own hit area — a GameObject created
    // hidden then shown doesn't always re-register for hit testing in Phaser.
    this.input.on('pointerup', () => {
      if (this.endShown) this.playAgain();
    });

    // Input layer (PRD §4). Self-cleans on shutdown.
    new SwipeInput(this, { onUpdate: (phase, pts) => this.onSwipe(phase, pts) });

    this.resetCamera(0); // guarantee a neutral, full-screen camera on first load

    this.scale.on('resize', this.onResize, this);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.alive = false;
      this.endHitStop(); // clear any pending hit-stop timer + restore timeScale
      this.scale.off('resize', this.onResize, this);
    });

    this.startSession();
  }

  // Per-frame: advance the net ripple (Tier 1, item 1). Only steps while the net
  // has energy (settled → free) and never during a hit-stop freeze (timeScale 0),
  // so the freeze holds the net still too.
  update(): void {
    if (this.mode === 'taker' && this.time.timeScale > 0 && !this.netSim.isSettled()) {
      if (this.netSim.step()) this.drawNet();
    }
  }

  // ── Tier 1, item 1: net ripple ────────────────────────────────────────────
  /** Transfer the ball's impact into the net at a normalised goal point (0..1). */
  private punchNet(normX: number, normY: number, power: number): void {
    if (this.mode !== 'taker') return; // keeper-view goal frame is static (no sim net)
    this.netSim.punch(normX, normY, power);
    this.drawNet();
  }

  // ── Tier 1, item 2: build the reusable soft-shadow texture once ───────────
  private ensureSoftShadowTexture(): void {
    if (this.textures.exists('softShadow')) return;
    const size = 64;
    const tex = this.textures.createCanvas('softShadow', size, size);
    if (!tex) return;
    const ctx = tex.getContext();
    const grad = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
    grad.addColorStop(0, 'rgba(255,255,255,1)'); // white → tinted black at runtime
    grad.addColorStop(0.55, 'rgba(255,255,255,0.75)');
    grad.addColorStop(1, 'rgba(255,255,255,0)'); // soft blurred edge
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, size, size);
    tex.refresh();
  }

  /** Place the ball's shadow on the ground for a given ground point, ball scale and
   *  "lift" (0 = on the ground, 1 = top of the arc). Higher = smaller + fainter. */
  private positionBallShadow(groundX: number, groundY: number, ballScale: number, liftFrac: number): void {
    if (!CONFIG.JUICE.shadow.enabled) return;
    const S = CONFIG.JUICE.shadow;
    const r = this.layout.ball.r;
    const lift = Phaser.Math.Clamp(liftFrac, 0, 1);
    const scale = ballScale * Phaser.Math.Linear(1, S.minScale, lift);
    const w = r * 2 * S.ballScaleX * scale;
    const h = r * 2 * S.ballScaleY * scale;
    this.ballShadow
      .setVisible(true)
      .setPosition(groundX, groundY)
      .setDisplaySize(w, h)
      .setAlpha(Phaser.Math.Linear(S.groundAlpha, S.minAlpha, lift));
  }

  /** Static grounded shadow under a figure (keeper / taker). */
  private positionActorShadow(img: Phaser.GameObjects.Image, x: number, feetY: number, figW: number): void {
    if (!CONFIG.JUICE.shadow.enabled) {
      img.setVisible(false);
      return;
    }
    const S = CONFIG.JUICE.shadow;
    img.setVisible(true).setPosition(x, feetY).setDisplaySize(figW * S.actorScaleX, figW * S.actorScaleY).setAlpha(S.groundAlpha);
  }

  // ── Tier 1, item 3: dynamic camera ────────────────────────────────────────
  // A gentle, CENTRED zoom pulse on a goal / save only — NO panning (panning
  // toward a focus point cropped the frame and read as a lurching camera) and NO
  // aim/strike zoom (too frequent). Centred zoom can't crop asymmetrically, so the
  // frame always stays whole. The `focus` arg is ignored (kept for call-site shape).
  private cameraBeat(kind: 'aim' | 'strike' | 'goal' | 'save', _focus?: { x: number; y: number }): void {
    const C = CONFIG.JUICE.camera;
    if (!C.enabled) return;
    if (kind === 'aim' || kind === 'strike') return; // no camera move on these
    const zoom = C.baseZoom * (kind === 'goal' ? C.goalZoom : C.saveZoom);
    this.cameras.main.zoomTo(zoom, C.moveMs, C.ease, true);
  }

  /** Ease (ms>0) or snap (ms<=0) the camera back to the neutral (pulled-back) view. */
  private resetCamera(ms: number): void {
    const cam = this.cameras.main;
    const base = CONFIG.JUICE.camera.enabled ? CONFIG.JUICE.camera.baseZoom : 1;
    if (ms <= 0 || !CONFIG.JUICE.camera.enabled) {
      cam.zoomEffect.reset();
      cam.setZoom(base);
      cam.centerOn(this.scale.width / 2, this.scale.height / 2);
      return;
    }
    cam.zoomTo(base, ms, CONFIG.JUICE.camera.ease, true);
  }

  // ── Tier 1, item 4: hit-stop ──────────────────────────────────────────────
  // Freeze the game clock + tweens for a few real milliseconds at contact, then
  // restore. Uses window.setTimeout (NOT a scene timer) because the scene clock is
  // frozen during the stop. abortAll() always restores it, so a resize/mode-switch
  // mid-freeze can never leave the game stuck.
  private hitStop(ms: number): void {
    if (!CONFIG.JUICE.hitStop.enabled || ms <= 0) return;
    if (this.hitStopTimer !== null) clearTimeout(this.hitStopTimer);
    this.time.timeScale = 0;
    this.tweens.timeScale = 0;
    this.hitStopTimer = window.setTimeout(() => {
      this.hitStopTimer = null;
      this.endHitStop();
    }, ms);
  }

  private endHitStop(): void {
    if (this.hitStopTimer !== null) {
      clearTimeout(this.hitStopTimer);
      this.hitStopTimer = null;
    }
    this.time.timeScale = 1;
    this.tweens.timeScale = 1;
  }

  // ── Tier 2, item 5: screen shake ──────────────────────────────────────────
  private screenShake(intensity: number): void {
    if (!CONFIG.JUICE.shake.enabled || intensity <= 0) return;
    this.cameras.main.shake(CONFIG.JUICE.shake.durationMs, intensity);
  }

  /** Strike shake scaled by shot power (a soft shot barely shakes). */
  private strikeShake(power: number): void {
    const S = CONFIG.JUICE.shake;
    this.screenShake(Phaser.Math.Linear(S.strikeMin, S.strikeMax, Phaser.Math.Clamp(power, 0, 1)));
  }

  // ── Tier 2, items 6 & 7: particle systems + ball trail ────────────────────
  private ensureParticleTextures(): void {
    if (!this.textures.exists('pSoft')) {
      const g = this.make.graphics({ x: 0, y: 0 });
      g.fillStyle(0xffffff, 0.35).fillCircle(8, 8, 8); // soft halo
      g.fillStyle(0xffffff, 0.7).fillCircle(8, 8, 5);
      g.fillStyle(0xffffff, 1).fillCircle(8, 8, 3); // bright core
      g.generateTexture('pSoft', 16, 16);
      g.destroy();
    }
    if (!this.textures.exists('pRect')) {
      const g = this.make.graphics({ x: 0, y: 0 });
      g.fillStyle(0xffffff, 1).fillRect(0, 0, 6, 6);
      g.generateTexture('pRect', 6, 6);
      g.destroy();
    }
  }

  private createParticleSystems(): void {
    this.ensureParticleTextures();
    const P = CONFIG.JUICE.particles;

    // Grass flecks at the strike point (kick up + fall).
    this.turfEmitter = this.add
      .particles(0, 0, 'pSoft', {
        emitting: false,
        speed: { min: 70, max: 240 },
        angle: { min: 210, max: 330 }, // upward fan (270 = straight up)
        gravityY: 760,
        lifespan: 520,
        scale: { start: 0.5, end: 0 },
        alpha: { start: 0.95, end: 0 },
        tint: [...P.turfColors],
      })
      .setDepth(395);

    // Spray off the net on a goal (a quick outward sparkle).
    this.sprayEmitter = this.add
      .particles(0, 0, 'pSoft', {
        emitting: false,
        speed: { min: 60, max: 280 },
        angle: { min: 0, max: 360 },
        gravityY: 240,
        lifespan: 460,
        scale: { start: 0.45, end: 0 },
        alpha: { start: 0.9, end: 0 },
        tint: P.sprayColor,
        blendMode: 'ADD',
      })
      .setDepth(12); // above the net (10), below the actors

    // Dust puff where a keeper lands a dive.
    this.dustEmitter = this.add
      .particles(0, 0, 'pSoft', {
        emitting: false,
        speed: { min: 40, max: 130 },
        angle: { min: 200, max: 340 },
        gravityY: 240,
        lifespan: 540,
        scale: { start: 0.6, end: 0 },
        alpha: { start: 0.5, end: 0 },
        tint: P.dustColor,
      })
      .setDepth(7);

    // Confetti on a match win — pinned to the screen so it rains over the UI.
    this.confettiEmitter = this.add
      .particles(0, 0, 'pRect', {
        emitting: false,
        speed: { min: 200, max: 470 },
        angle: { min: 55, max: 125 }, // downward fan
        gravityY: 380,
        lifespan: 1900,
        scale: { start: 0.95, end: 0.7 },
        alpha: { start: 1, end: 0 },
        rotate: { min: 0, max: 360 },
        tint: [...P.confettiColors],
      })
      .setDepth(1104)
      .setScrollFactor(0);

    // Ball trail (item 7) — a follow-emitter that leaves a fading streak in flight.
    this.ballTrail = this.add
      .particles(0, 0, 'pSoft', {
        emitting: false,
        speed: 0, // afterimages fade in place
        lifespan: CONFIG.JUICE.trail.lifespan,
        scale: { start: CONFIG.JUICE.trail.scaleStart, end: 0 },
        alpha: { start: 0.55, end: 0 },
        tint: CONFIG.JUICE.trail.color,
        blendMode: 'ADD',
      })
      .setDepth(399); // just behind the ball (400)
  }

  private burstTurf(x: number, y: number): void {
    if (CONFIG.JUICE.particles.enabled) this.turfEmitter.explode(CONFIG.JUICE.particles.turfCount, x, y);
  }
  private burstNetSpray(x: number, y: number): void {
    if (CONFIG.JUICE.particles.enabled) this.sprayEmitter.explode(CONFIG.JUICE.particles.netSprayCount, x, y);
  }
  private burstDust(x: number, y: number): void {
    if (CONFIG.JUICE.particles.enabled) this.dustEmitter.explode(CONFIG.JUICE.particles.dustCount, x, y);
  }
  private burstConfetti(): void {
    if (!CONFIG.JUICE.particles.enabled) return;
    this.confettiEmitter.explode(CONFIG.JUICE.particles.confettiCount, this.scale.width / 2, -10);
  }

  /** Begin the ball trail; density scales with shot power (harder = denser). */
  private startBallTrail(power: number): void {
    if (!CONFIG.JUICE.trail.enabled) return;
    const T = CONFIG.JUICE.trail;
    const freq = Phaser.Math.Linear(T.frequencyMin, T.frequencyMax, Phaser.Math.Clamp(power, 0, 1));
    this.ballTrail.setFrequency(freq);
    this.ballTrail.startFollow(this.ball);
    this.ballTrail.start();
  }
  private stopBallTrail(): void {
    this.ballTrail?.stop();
    this.ballTrail?.stopFollow();
  }

  // ── Tier 3, item 8: slow-motion replay ────────────────────────────────────
  /** Is this kick worth a replay? Taker goal into a corner, or a keeper save. */
  private isReplayWorthy(taker: TakerInput, result: PenaltyResult): boolean {
    const R = CONFIG.JUICE.replay;
    if (!R.enabled) return false;
    if (this.mode === 'keeper') return R.onSaves && result.saved;
    return R.onCornerGoals && result.scored && !!taker.landingZone && CORNER_ZONES.has(taker.landingZone);
  }

  /** Re-simulate the resolved shot in slow motion from a tight, dramatic camera.
   *  Tap anywhere to skip. Re-runs the SAME deterministic flight — never re-resolves
   *  — and is fully abort/epoch-safe (a resize/mode-switch cleanly ends it). */
  private async playReplay(taker: TakerInput, result: PenaltyResult, epoch: number): Promise<void> {
    const R = CONFIG.JUICE.replay;
    const goal = this.layout.goal;
    const handX = goal.x + result.keeperNorm.x * goal.width;
    const handY = goal.y + result.keeperNorm.y * goal.height;

    // Reset actors to pre-strike, then frame the contact point dramatically.
    this.resetBall();
    this.resetKeeper();
    this.resetTaker();
    const keeperMode = this.mode === 'keeper';
    const start = { x: this.layout.ball.x, y: this.layout.ball.y };
    const end = result.saved ? { x: handX, y: handY } : taker.landingPoint;
    const bendPx = taker.curve * CONFIG.FLIGHT.curveGain * goal.width;
    const focus = keeperMode ? { x: handX, y: handY } : end;

    this.replaySkip = false;
    const skip = () => {
      this.replaySkip = true;
      this.abortAll(); // resolve the in-flight replay tweens immediately
    };
    this.input.once('pointerdown', skip);

    // Blinking "REPLAY" badge so it's unmistakable we're in replay (not live) mode.
    this.replayLabel.setPosition(this.scale.width / 2, this.scale.height * 0.12).setVisible(true).setAlpha(1);
    this.tweens.add({ targets: this.replayLabel, alpha: { from: 1, to: 0.2 }, duration: 420, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
    this.cameraReplay(focus);

    // Slowed durations (re-simulation, NOT timeScale — keeps hit-stop isolated).
    // Same shared flight-time source as the live kick (Track A2).
    const baseDur = kickFlightMs(taker.power, keeperMode ? 'keeper' : 'taker');
    const slowDur = baseDur * R.slowFactor;
    const scaleStart = keeperMode ? CONFIG.KEEPER.flightScaleStart : CONFIG.FLIGHT.scaleStart;
    const scaleEnd = keeperMode ? CONFIG.KEEPER.flightScaleEnd : CONFIG.FLIGHT.scaleEnd;

    // Re-dive the keeper to the same point, slowed.
    this.time.delayedCall(CONFIG.CPU_KEEPER.reactionDelay * R.slowFactor, () =>
      this.diveKeeperTo(handX, handY, CONFIG.CPU_KEEPER.diveDuration * R.slowFactor),
    );

    await this.flyBall(start, end, bendPx, slowDur, scaleStart, scaleEnd, { power: taker.power });
    if (!this.replaySkip && epoch === this.epoch) {
      if (result.saved) {
        await this.deflectBall(handX, handY);
      } else if (result.scored) {
        this.punchNet(taker.landingNorm.x, taker.landingNorm.y, taker.power);
        this.burstNetSpray(end.x, end.y);
      }
      await this.delayP(R.holdMs);
    }

    // Cleanup (runs on normal finish AND on skip/abort).
    this.input.off('pointerdown', skip);
    this.tweens.killTweensOf(this.replayLabel); // stop the blink
    this.replayLabel.setVisible(false);
    this.resetCamera(0);
  }

  private cameraReplay(_focus: { x: number; y: number }): void {
    if (!CONFIG.JUICE.camera.enabled) return;
    const C = CONFIG.JUICE.camera;
    const R = CONFIG.JUICE.replay;
    // Zoom-only (centred) — no pan, to match the rest of the camera (no cropping).
    // Relative to the pulled-back base so the dramatic push-in is consistent.
    this.cameras.main.zoomTo(C.baseZoom * R.zoom, R.inMs, C.ease, true);
  }

  // ── Tier 3, item 9: post-processing grade (WebGL only) ────────────────────
  private applyPostFX(): void {
    const G = CONFIG.JUICE.grade;
    if (!G.enabled) return;
    if (this.renderer.type !== Phaser.WEBGL) return; // Canvas renderer → graceful no-op
    const fx = this.cameras.main.postFX;
    if (G.vignetteStrength > 0) fx.addVignette(0.5, 0.5, G.vignetteRadius, G.vignetteStrength);
    if (G.bloomStrength > 0) fx.addBloom(0xffffff, 1, 1, G.bloomBlur, G.bloomStrength); // glows the bright floodlights
    const cm = fx.addColorMatrix();
    cm.brightness(G.brightness, true);
    cm.saturate(G.saturate, true);
  }

  /** Bright floodlight banks at the top so the bloom has something to sit on. */
  private drawFloodlights(): void {
    if (!CONFIG.JUICE.grade.floodlights) return;
    const { width } = this.layout;
    const horizon = this.layout.horizonY;
    const g = this.g();
    const y = Math.max(8, horizon * 0.12);
    const lampW = Math.max(26, width * 0.07);
    const lampH = lampW * 0.42;
    for (const cx of [width * 0.16, width * 0.84]) {
      // Soft glow halo (bloom amplifies this).
      g.fillStyle(0xfff6cc, 0.5);
      g.fillCircle(cx, y + lampH * 0.5, lampW * 0.7);
      // Bright lamp box + a hot white core.
      g.fillStyle(0xfff2c4, 1);
      g.fillRoundedRect(cx - lampW / 2, y, lampW, lampH, lampH * 0.3);
      g.fillStyle(0xffffff, 1);
      g.fillRoundedRect(cx - lampW * 0.34, y + lampH * 0.22, lampW * 0.68, lampH * 0.42, lampH * 0.2);
    }
  }

  // ── Tier 3, item 10: UI / transition juice ────────────────────────────────
  /** Tactile press feedback on a text button: scale-down on press, bounce back. */
  private addButtonFeedback(txt: Phaser.GameObjects.Text): void {
    if (!txt) return;
    const U = CONFIG.JUICE.ui;
    txt.on('pointerdown', () => txt.setScale(U.pressScale));
    const release = () => this.tweens.add({ targets: txt, scale: 1, duration: U.releaseMs, ease: 'Back.easeOut' });
    txt.on('pointerup', release);
    txt.on('pointerout', release);
  }

  /** Eased, staggered entrance for the end screen + a count-up of the final score. */
  private animateEndScreenIn(playerScore: number, oppScore: number): void {
    const U = CONFIG.JUICE.ui;
    this.endBg.setAlpha(0);
    this.endTitle.setScale(0.6).setAlpha(0);
    this.endScore.setAlpha(0);
    this.endBtn.setScale(0.6).setAlpha(0);
    this.tweens.add({ targets: this.endBg, alpha: 1, duration: U.endInMs, ease: 'Quad.easeOut' });
    this.tweens.add({ targets: this.endTitle, scale: 1, alpha: 1, duration: U.endInMs, delay: U.endStaggerMs, ease: 'Back.easeOut' });
    this.tweens.add({
      targets: this.endScore,
      alpha: 1,
      duration: U.endInMs,
      delay: U.endStaggerMs * 2,
      ease: 'Quad.easeOut',
      onComplete: () => this.countUpScore(playerScore, oppScore),
    });
    this.tweens.add({ targets: this.endBtn, scale: 1, alpha: 1, duration: U.endInMs, delay: U.endStaggerMs * 3, ease: 'Back.easeOut' });
  }

  private countUpScore(playerScore: number, oppScore: number): void {
    const o = { p: 0 };
    this.tweens.add({
      targets: o,
      p: 1,
      duration: CONFIG.JUICE.ui.countUpMs,
      ease: 'Cubic.easeOut',
      onUpdate: () => this.endScore.setText('FINAL   YOU  ' + Math.round(playerScore * o.p) + '  –  ' + Math.round(oppScore * o.p) + '  CPU'),
    });
  }

  /** Snap the end screen to its final shown state (used after a resize abort). */
  private snapEndScreen(): void {
    const s = this.shootout;
    this.endBg.setAlpha(1);
    this.endTitle.setScale(1).setAlpha(1);
    this.endScore.setScale(1).setAlpha(1).setText('FINAL   YOU  ' + s.player.scored + '  –  ' + s.opponent.scored + '  CPU');
    this.endBtn.setScale(1).setAlpha(1);
  }

  private popScore(): void {
    const U = CONFIG.JUICE.ui;
    this.scoreText.setScale(1);
    this.tweens.add({ targets: this.scoreText, scale: U.scorePopScale, duration: U.scorePopMs, yoyo: true, ease: 'Quad.easeOut' });
  }

  // ── Session controller ────────────────────────────────────────────────────
  // SHOOTOUT = the full alternating take-and-save game (you shoot, then you defend
  // the CPU's kick, each turn flipping the view). PRACTICE = endless keeper drills.
  // Bumping `session` makes any running loop exit so a switch / play-again is clean.
  private startSession(): void {
    this.session++;
    const session = this.session;
    this.hideEndScreen();
    if (this.sessionKind === 'shootout') {
      this.setView('taker'); // a shootout always opens on the player's (taker) turn
      void this.runShootout(session);
    } else {
      this.setView('keeper'); // keeper practice is always the defend view
      void this.runPractice(session);
    }
  }

  /** Switch the per-turn VIEW/ROLE: which provider shoots vs defends, the camera/
   *  layout, and the input routing. Lightweight (rebuild + provider swap) — does NOT
   *  restart the session, so the shootout loop can flip it every turn. */
  private setView(mode: GameMode): void {
    if (this.mode === mode && this.layout) return; // already in this view — no-op
    this.mode = mode;
    if (mode === 'taker') {
      this.takerProvider = this.human; // you shoot
      this.keeperProvider = this.cpu; //  CPU keeps
    } else {
      this.takerProvider = this.cpu; //   CPU shoots
      this.keeperProvider = this.human; // you defend
    }
    this.resetCamera(0);
    this.rebuild(this.scale.width, this.scale.height);
  }

  /** One provider-driven kick (never branches on CPU vs human). Returns the
   *  result, or null if it was cancelled mid-flight (resize) and should retake. */
  private async playKick(): Promise<PenaltyResult | null> {
    const epoch = this.epoch;
    this.enterAiming();
    const ctx: PenaltyContext = { seed: this.makeSeed(), goal: this.layout.goal };

    const taker = await this.takerProvider.getTakerInput(ctx).catch(() => null);
    if (!taker || epoch !== this.epoch) return null;

    this.state = 'busy';
    const keeper = await this.keeperProvider.getKeeperInput(ctx, taker).catch(() => null);
    if (!keeper || epoch !== this.epoch) return null;

    // The kick's flight time comes from ONE shared, pure source (Track A2) so the
    // ball you see and the race the model judges are the same thing. In keeper
    // view the human's dive is submitted MID-flight (Track A1), so this resolves
    // while the ball is still in the air and the flight can end honestly.
    const flightMs = kickFlightMs(taker.power, this.mode);
    const result = resolvePenalty(taker, keeper, ctx.seed, flightMs);
    await this.revealKick(taker, keeper, result);
    if (epoch !== this.epoch) return null;
    await this.showOutcome(result);
    // Slow-mo replay of a great moment (Tier 3) — skippable, presentation-only.
    if (epoch === this.epoch && this.isReplayWorthy(taker, result)) await this.playReplay(taker, result, epoch);
    return result;
  }

  /** Keeper-mode (and any free-play) loop: take kicks forever, no score. */
  private async runPractice(session: number): Promise<void> {
    this.setScoreboardVisible(false);
    while (this.alive && session === this.session) {
      try {
        await this.playKick();
        if (this.alive && session === this.session) await this.delayP(CONFIG.UI.betweenKicksMs);
      } catch (e) {
        console.error('[practice loop]', e);
        await this.delayP(200);
      }
    }
  }

  /** The integrated take-and-save shootout: each turn flips the view — you SHOOT on
   *  your turn (taker view) and DEFEND the CPU's kick on its turn (keeper view). Both
   *  go through the same provider-driven playKick(); `result.scored` (did the kicking
   *  side score) feeds the same shootout machine. Early clinch + sudden death + end
   *  screen unchanged. */
  private async runShootout(session: number): Promise<void> {
    this.shootout = createShootout(CONFIG.SESSION.kicksPerSession);
    this.setScoreboardVisible(true);
    this.updateScoreboard();

    while (this.alive && session === this.session && this.shootout.phase !== 'done') {
      try {
        const side: Side | null = this.shootout.next;
        if (!side) break;
        // Turn break + view switch: "YOUR TURN" (you shoot) / "DEFEND!" (you save).
        await this.beginTurn(side);
        if (session !== this.session) return;

        const r = await this.playKick(); // interactive in BOTH views now
        if (session !== this.session) return; // session switch / play again
        if (!r) continue; // cancelled (resize) → retake the same kick

        // result.scored = did the side that just kicked score. Taker view: you.
        // Keeper view: the CPU (i.e. you failed to save). Same field, both turns.
        this.shootout = recordKick(this.shootout, r.scored);
        this.updateScoreboard();
        if (this.shootout.phase !== 'done') await this.delayP(CONFIG.UI.betweenKicksMs);
      } catch (e) {
        console.error('[shootout]', e);
        await this.delayP(200);
      }
    }

    if (this.alive && session === this.session && this.shootout.phase === 'done') {
      this.showEndScreen(this.shootout.winner ?? 'opponent');
    }
  }

  /** A clear turn break that ALSO switches the view: shows "YOUR TURN" / "DEFEND!",
   *  fades through black, swaps to the taker (player kick) or keeper (player save)
   *  view behind the fade, then holds the banner. The fade hides the rebuild so the
   *  view change isn't a hard cut. Abortable on a session switch / resize. */
  private async beginTurn(side: Side): Promise<void> {
    const player = side === 'player';
    const fadeMs = CONFIG.UI.viewFadeMs;
    const t = this.outcomeText;

    // Banner up (sits above the fade overlay).
    this.tweens.killTweensOf(t);
    t.setText(player ? 'YOUR TURN' : 'DEFEND!')
      .setColor(player ? '#ffffff' : '#ffa726')
      .setFontSize(Math.round(Math.min(this.scale.width, this.scale.height) * 0.11) + 'px')
      .setPosition(this.scale.width / 2, this.scale.height * 0.42)
      .setVisible(true)
      .setAlpha(0)
      .setScale(0.8);
    this.tweens.add({ targets: t, alpha: 1, scale: 1, duration: 240, ease: 'Back.easeOut' });

    // Fade to black → switch view → fade back (the rebuild is hidden under black).
    this.viewFade.setSize(this.scale.width, this.scale.height).setPosition(0, 0);
    await this.tweenP({ targets: this.viewFade, alpha: 1, duration: fadeMs, ease: 'Quad.easeIn' });
    this.setView(player ? 'taker' : 'keeper');
    t.setVisible(true); // (rebuild leaves the top-level banner alone, but be safe)
    await this.tweenP({ targets: this.viewFade, alpha: 0, duration: fadeMs, ease: 'Quad.easeOut' });

    // Hold the rest of the banner, then clear it for the kick's own banners.
    await this.delayP(Math.max(0, CONFIG.UI.turnBannerMs - 2 * fadeMs - 240));
    this.tweens.killTweensOf(t);
    t.setVisible(false).setScale(1).setAlpha(1);
  }

  private makeSeed(): number {
    return Math.floor(Math.random() * 0x7fffffff);
  }

  // ── Session UI: scoreboard, difficulty, end screen (Phase 3) ──────────────
  private buildSessionUI(): void {
    // Scoreboard (top-centre): score line, kick dots, phase/round sub-line.
    this.scoreText = this.add.text(0, 0, '', { fontFamily: 'sans-serif', fontStyle: 'bold', fontSize: '24px', color: '#ffffff' }).setOrigin(0.5, 0);
    this.scoreSub = this.add.text(0, 0, '', { fontFamily: 'monospace', fontSize: '13px', color: '#cfe8ff' }).setOrigin(0.5, 0);
    this.scoreDots = this.add.graphics();
    this.scoreboard = this.add.container(0, 0, [this.scoreText, this.scoreDots, this.scoreSub]).setDepth(960).setScrollFactor(0).setVisible(false);

    // End screen — TOP-LEVEL objects (not a container): Phaser input on container
    // children is unreliable, but a plain top-level interactive Text works (same
    // as the mode button). Depths: backdrop 1100 (blocks underlying buttons),
    // texts/button above it.
    this.endBg = this.add.rectangle(0, 0, 10, 10, 0x07121c, 0.86).setOrigin(0.5).setDepth(1100).setScrollFactor(0).setVisible(false);
    this.endTitle = this.add.text(0, 0, '', { fontFamily: 'sans-serif', fontStyle: 'bold', fontSize: '52px', color: '#ffffff' }).setOrigin(0.5).setDepth(1102).setScrollFactor(0).setVisible(false);
    this.endScore = this.add.text(0, 0, '', { fontFamily: 'monospace', fontSize: '22px', color: '#cfe8ff' }).setOrigin(0.5).setDepth(1102).setScrollFactor(0).setVisible(false);
    this.endBtn = this.add
      .text(0, 0, 'PLAY AGAIN', { fontFamily: 'monospace', fontStyle: 'bold', fontSize: '22px', color: '#07121c', backgroundColor: '#4caf50', padding: { x: 18, y: 12 } })
      .setOrigin(0.5)
      .setDepth(1103)
      .setScrollFactor(0)
      .setVisible(false);
    // Restart is handled by the scene-level pointerup (tap anywhere) — see create().

    this.layoutSessionUI(this.scale.width, this.scale.height);
  }

  private layoutSessionUI(w: number, h: number): void {
    if (!this.scoreboard) return;
    this.scoreText.setScale(1).setPosition(w / 2, 6); // reset any in-flight score pop
    this.scoreSub.setPosition(w / 2, 62);
    this.endBg.setPosition(w / 2, h / 2).setSize(w, h);
    this.endTitle.setPosition(w / 2, h * 0.4);
    this.endScore.setPosition(w / 2, h * 0.4 + 52);
    this.endBtn.setPosition(w / 2, h * 0.61);
    this.updateScoreboard();
  }

  private setScoreboardVisible(v: boolean): void {
    this.scoreboard?.setVisible(v);
  }

  private setEndScreenVisible(v: boolean): void {
    this.endShown = v;
    this.endBg?.setVisible(v);
    this.endTitle?.setVisible(v);
    this.endScore?.setVisible(v);
    this.endBtn?.setVisible(v);
    // While the end screen is up, don't let taps fall through to the other buttons.
    if (v) {
      this.modeButton?.disableInteractive();
      this.diffButton?.disableInteractive();
    } else {
      this.modeButton?.setInteractive({ useHandCursor: true });
      this.diffButton?.setInteractive({ useHandCursor: true });
    }
  }

  private updateScoreboard(): void {
    if (!this.scoreboard) return;
    const s = this.shootout;
    const str = 'YOU  ' + s.player.scored + '  –  ' + s.opponent.scored + '  CPU';
    if (this.lastScoreStr && this.lastScoreStr !== str) this.popScore(); // Tier 3 — pop on change
    this.lastScoreStr = str;
    this.scoreText.setText(str);
    this.scoreSub.setText(s.phase === 'suddenDeath' ? 'SUDDEN DEATH' : 'ROUND ' + Math.min(currentRound(s), s.regulationKicks) + ' / ' + s.regulationKicks);
    this.drawScoreDots();
  }

  /** Two rows of kick markers (green = scored, red = missed, outline = pending). */
  private drawScoreDots(): void {
    const g = this.scoreDots;
    g.clear();
    const s = this.shootout;
    const cx = this.scale.width / 2;
    const slots = Math.max(s.regulationKicks, s.player.taken, s.opponent.taken);
    const gap = 16;
    const r = 5;
    const rowW = (slots - 1) * gap;
    const drawRow = (results: boolean[], taken: number, y: number) => {
      for (let i = 0; i < slots; i++) {
        const x = cx - rowW / 2 + i * gap;
        if (i < taken) {
          g.fillStyle(results[i] ? CONFIG.COLORS.outcomeGoal : CONFIG.COLORS.outcomeSave, 1);
          g.fillCircle(x, y, r);
        } else {
          g.lineStyle(1.5, 0xffffff, 0.4);
          g.strokeCircle(x, y, r);
        }
      }
    };
    drawRow(s.player.results, s.player.taken, 40);
    drawRow(s.opponent.results, s.opponent.taken, 54);
  }

  private showEndScreen(winner: Side): void {
    const s = this.shootout;
    const win = winner === 'player';
    this.endTitle.setText(win ? 'YOU WIN!' : 'YOU LOSE').setColor(win ? '#4caf50' : '#ff7043');
    this.endScore.setText('FINAL   YOU  0  –  0  CPU'); // count-up fills this in
    this.setEndScreenVisible(true);
    this.animateEndScreenIn(s.player.scored, s.opponent.scored); // Tier 3 — eased entrance + count-up
    if (win) {
      this.sfx.cheer();
      this.burstConfetti(); // Tier 2 — confetti rains over the win screen
    } else {
      this.sfx.groan();
    }
  }

  private hideEndScreen(): void {
    this.setEndScreenVisible(false);
  }

  /** Full reset to a fresh shootout (Phase 3 — no state leaks between games). */
  private playAgain(): void {
    this.hideEndScreen();
    this.epoch++;
    this.human.cancel();
    this.enterAiming();
    this.startSession();
  }

  private cycleDifficulty(): void {
    this.diffIndex = (this.diffIndex + 1) % this.diffNames.length;
    this.applyDifficulty();
  }

  private applyDifficulty(): void {
    const name = this.diffNames[this.diffIndex];
    this.cpu.difficulty = CONFIG.CPU_KEEPER.presets[name];
    this.diffButton.setText(name.toUpperCase());
  }

  private enterAiming(): void {
    this.abortAll();
    this.state = 'aiming';
    this.diveCaptured = null;
    this.keeperFlightEnd = null;
    this.keeperFlightDone = null;
    this.fx.clear();
    this.hidePowerMeter();
    this.outcomeText.setVisible(false);
    this.netSim.reset(); // settle any leftover ripple
    if (this.mode === 'taker') this.drawNet();
    this.stopBallTrail(); // never leave the trail emitting between kicks
    this.resetCamera(CONFIG.JUICE.camera.returnMs); // ease back to the neutral view
    this.resetBall();
    this.resetKeeper();
    this.resetTaker();
    this.showIdleDebug();
  }

  private onResize(gameSize: Phaser.Structs.Size): void {
    this.epoch++; // invalidate the current kick's post-await steps
    this.human.cancel(); // unblock a pending aim / dive wait
    this.abortAll(); // resolve any pending animations/delays
    this.resetCamera(0); // snap to neutral for the NEW layout (no cross-layout pan)
    this.rebuild(gameSize.width, gameSize.height);
    this.fx.clear();
    this.outcomeText.setPosition(gameSize.width / 2, gameSize.height * 0.42);
    this.viewFade?.setSize(gameSize.width, gameSize.height).setPosition(0, 0);
    this.modeButton?.setY(gameSize.height - 8); // keep pinned to the bottom edge
    this.diffButton?.setPosition(gameSize.width - 8, gameSize.height - 8);
    this.layoutSessionUI(gameSize.width, gameSize.height);
    if (this.endShown) this.snapEndScreen(); // restore the end screen if a resize aborted its entrance
    this.replayLabel?.setVisible(false); // a replay can't survive a layout change
    this.showIdleDebug();
  }

  // ── Session toggle: full SHOOTOUT vs keeper PRACTICE ──────────────────────
  private toggleMode(): void {
    this.setSessionKind(this.sessionKind === 'shootout' ? 'practice' : 'shootout');
  }

  /** Switch which GAME is running (shootout vs keeper practice) and restart it.
   *  (The per-turn view is handled by setView inside the loop.) */
  private setSessionKind(kind: 'shootout' | 'practice'): void {
    this.sessionKind = kind;
    this.modeButton.setText('MODE: ' + (kind === 'shootout' ? 'SHOOTOUT' : 'PRACTICE'));
    // Tear down any in-flight kick and start a fresh session.
    this.epoch++;
    this.human.cancel();
    this.startSession(); // sets the initial view + runs the chosen loop (bumps session)
  }

  /** Dev/test hook compatibility: map the old taker/keeper mode to a session kind
   *  (taker → the take-and-save shootout, keeper → keeper practice). */
  private setMode(mode: GameMode): void {
    this.setSessionKind(mode === 'taker' ? 'shootout' : 'practice');
  }

  // ── Input router: aim (Taker mode) vs dive (Keeper mode) ──────────────────
  private onSwipe(phase: SwipePhase, points: SwipePoint[]): void {
    if (phase === 'start') this.sfx.unlock(); // first touch unlocks Web Audio

    if (this.mode === 'keeper') {
      this.onDiveSwipe(phase, points);
      return;
    }
    this.onAimSwipe(phase, points);
  }

  // Keeper mode: a flick during the open dive window commits a dive (PRD §6).
  private onDiveSwipe(phase: SwipePhase, points: SwipePoint[]): void {
    if (this.state !== 'keeping') return; // window not open yet / already closed
    if (phase !== 'end') return; // commit on release (one dive per window)
    if (this.diveCaptured) return; // already dived this window — locked in
    if (points.length < 2) return;

    const sample = deriveSwipe(points, this.scale.height);
    const zone = computeDive(sample, this.scale.width, this.scale.height);

    // Timing (Track A4): the raw ms between the strike and the flick's START.
    // resolvePenalty races this against the ball's flight — committing while the
    // ball still has ≥ diveTravelMs of air time = the hands fully arrive; later
    // commits get proportionally less far. Early (negative) = locked in, full dive.
    const sinceStrike = sample.start.t - this.strikeAt;
    this.diveCaptured = { zone, timing: sinceStrike };

    // Dive the keeper toward the chosen zone NOW (instant feedback). When the
    // result lands (moments later), settleKeeperOutcome re-aims this dive to the
    // JUDGED hand position, so what completes is what was judged (Track A1).
    const hp = zoneCenter(zone, this.layout.goal);
    this.diveKeeperTo(hp.x, hp.y, CONFIG.KEEPER.diveDuration);

    // Commit the dive to the loop IMMEDIATELY (mid-flight) so the kick resolves
    // while the ball is in the air and the flight can end honestly — gloves on a
    // save, net on a goal (Track A1). Pre-strike commits are held and submitted
    // by the strike callback (the race doesn't exist yet).
    if (sinceStrike >= 0 && this.human.isAwaitingKeeper()) {
      this.human.submitDive(zone, sinceStrike);
    }

    this.debug.setLines([
      'DIVE',
      'zone ' + zone + (sinceStrike < 0 ? '   (early commit)' : ''),
      'since strike ' + Math.round(sinceStrike) + 'ms',
    ]);
  }

  // Taker mode: live aim preview while aiming; commit the shot on release.
  private onAimSwipe(phase: SwipePhase, points: SwipePoint[]): void {
    if (this.state !== 'aiming') return; // ignore input while a kick is resolving

    if (phase === 'start') this.cameraBeat('aim'); // subtle push-in as the player aims

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
      this.hidePowerMeter();
      this.resetCamera(CONFIG.JUICE.camera.returnMs); // no shot → drop the aim push-in
      this.showIdleDebug();
      return;
    }

    const upPct = Math.round((-sample.dy / this.scale.height) * 100);
    const sidePct = Math.round((sample.dx / this.scale.width) * 100);

    // Live power meter: fills with power, turns red past the accuracy threshold.
    if (phase === 'end') this.hidePowerMeter();
    else this.drawPowerMeter(sample.power);

    this.drawSwipeFeedback(sample.points, aim);
    this.debug.setLines([
      'SWIPE' + (phase === 'end' ? ' (release)' : ''),
      'swipe  up ' + upPct + '%   side ' + (sidePct >= 0 ? '+' : '') + sidePct + '%',
      'power ' + sample.power.toFixed(2) + '   curve ' + (sample.curve >= 0 ? '+' : '') + sample.curve.toFixed(2),
      'aim  x ' + aim.xFrac.toFixed(2) + '   height ' + aim.heightFrac.toFixed(2),
      'target ' + (aim.targetZone ?? 'MISS (wide/over)'),
    ]);

    if (phase === 'end') this.human.submitSwipe(sample, aim); // hand off to the loop
  }

  // ── Reveal the outcome ────────────────────────────────────────────────────
  // One entry point for the loop; the presentation differs by MODE (not by who
  // produced the input — the loop stays provider-agnostic). In Taker mode the
  // flight is the reveal; in Keeper mode the flight is ALREADY IN THE AIR (the
  // dive was submitted mid-flight — Track A1), so we steer its ending to match
  // the result and wait for it to land.
  private async revealKick(taker: TakerInput, keeper: KeeperInput, result: PenaltyResult): Promise<void> {
    if (this.mode === 'keeper') return this.settleKeeperOutcome(result);
    return this.revealTakerKick(taker, keeper, result);
  }

  // Taker mode: the human has shot; the CPU keeper dives and the ball flies. The
  // dive goes to result.keeperNorm so the visible dive and the outcome agree.
  private async revealTakerKick(taker: TakerInput, keeper: KeeperInput, result: PenaltyResult): Promise<void> {
    const goal = this.layout.goal;
    const start = { x: this.layout.ball.x, y: this.layout.ball.y };
    const handX = goal.x + result.keeperNorm.x * goal.width;
    const handY = goal.y + result.keeperNorm.y * goal.height;

    // Higher power = faster ball travel (Phase 1) — the SAME flight time the
    // resolution raced the dive against (Track A2).
    const dur = kickFlightMs(taker.power, 'taker');

    // The CPU keeper's dive starts when it COMMITTED (keeper.diveTiming, the
    // judged moment) and its hands land on result.keeperNorm exactly as the ball
    // arrives — so on a blasted shot you SEE the dive still mid-travel, falling
    // short, which is precisely what the model judged (Track A2).
    const commitMs = Math.max(0, keeper.diveTiming);
    const diveMs = Phaser.Math.Clamp(dur - commitMs, 120, CONFIG.RESOLUTION.diveTravelMs);
    this.time.delayedCall(commitMs, () => this.diveKeeperTo(handX, handY, diveMs));

    // Ball end: a save meets the keeper's gloves; otherwise its landing point.
    const end = result.saved ? { x: handX, y: handY } : taker.landingPoint;
    this.drawLandingMarker(taker.landingPoint);
    const bendPx = taker.curve * CONFIG.FLIGHT.curveGain * goal.width;
    if (CONFIG.HAPTICS.enabled) navigator.vibrate?.(CONFIG.HAPTICS.kickMs);

    // The shot's own outcome (ignores the keeper) — Phase 1 diagnostic.
    const shot = shotOutcome(taker.landingNorm).toUpperCase();

    this.debug.setLines([
      'FLIGHT',
      'power ' + taker.power.toFixed(2) + '   flight ' + Math.round(dur) + 'ms   shot ' + shot,
      'landing ' + (taker.landingZone ?? 'OFF FRAME') + '   keeper ' + keeper.diveZone,
      'dive p ' + result.timingQuality.toFixed(2) + '   reach ' + result.reachMargin.toFixed(2),
    ]);

    // Strike: camera snap + micro hit-stop (Tier 1) + power-scaled shake + turf
    // flecks kicked up at the foot (Tier 2).
    this.cameraBeat('strike', end);
    this.hitStop(CONFIG.JUICE.hitStop.strikeMs);
    this.strikeShake(taker.power);
    this.burstTurf(start.x, start.y);

    await this.flyBall(start, end, bendPx, dur, undefined, undefined, { power: taker.power });

    if (result.saved) {
      this.hitStop(CONFIG.JUICE.hitStop.saveMs); // "thunk" as the ball meets the gloves
      this.screenShake(CONFIG.JUICE.shake.saveAmt);
      await this.deflectBall(handX, handY);
    } else if (result.scored) {
      // GOAL — punch the net + spray off it at the entry point (Tier 1 + 2).
      this.punchNet(taker.landingNorm.x, taker.landingNorm.y, taker.power);
      this.burstNetSpray(end.x, end.y);
    }
  }

  // Keeper mode (Track A1): the dive was submitted MID-flight, so the result is
  // known while the ball is still in the air. Here we (a) re-aim the visible dive
  // to the JUDGED hand position (short of the target on a late/rushed dive — the
  // dive you see is the dive that was judged), (b) on a save bend the remaining
  // flight into the gloves so the ball ENDS there — it never lands in the net
  // first — and (c) wait for the flight to finish before the outcome shows.
  private async settleKeeperOutcome(result: PenaltyResult): Promise<void> {
    const goal = this.layout.goal;
    const handX = goal.x + result.keeperNorm.x * goal.width;
    const handY = goal.y + result.keeperNorm.y * goal.height;
    const remaining = Math.max(0, this.arrivalAt - performance.now());

    // Re-aim the in-progress dive to where the hands were judged to arrive.
    if (this.diveCaptured) {
      this.tweens.killTweensOf(this.keeper);
      this.diveKeeperTo(handX, handY, Phaser.Math.Clamp(remaining, 120, CONFIG.RESOLUTION.diveTravelMs));
    }

    if (result.saved && this.keeperFlightEnd) {
      // Bend the last stretch of the flight into the gloves (smooth, no jump —
      // the endpoint itself is tweened while flyBall keeps reading it live).
      this.tweens.add({
        targets: this.keeperFlightEnd,
        x: handX,
        y: handY,
        duration: Math.max(80, Math.min(remaining * 0.9, 300)),
        ease: 'Quad.easeOut',
      });
    }

    if (this.keeperFlightDone) await this.keeperFlightDone; // ball arrives

    if (result.saved) {
      this.hitStop(CONFIG.JUICE.hitStop.saveMs); // "thunk" as the ball meets the gloves
      this.screenShake(CONFIG.JUICE.shake.saveAmt); // Tier 2, item 5
      await this.deflectBall(handX, handY);
    }
  }

  // ── Keeper-mode reaction (Milestone 5) ────────────────────────────────────
  // Present the CPU taker's committed shot so the human can read it and dive:
  //   ready beat → subtle body-lean tell → strike → ball flight (the dive window).
  // Called (synchronously) when the human keeper's getKeeperInput() begins; it
  // schedules everything and resolves that input via submitDive() when the window
  // closes — so by the time the loop resolves the kick, the flight is complete.
  private beginKeeperReaction(_ctx: PenaltyContext, taker: TakerInput): void {
    const C = CONFIG.CPU_TAKER;
    const goal = this.layout.goal;
    const start = { x: this.layout.ball.x, y: this.layout.ball.y };
    const bendPx = taker.curve * CONFIG.FLIGHT.curveGain * goal.width;
    // The CPU's shot power sets the ball's speed = YOUR reaction window (Track
    // A2) — the same value resolvePenalty races the dive against.
    const flightMs = kickFlightMs(taker.power, 'keeper');

    this.diveCaptured = null;
    this.keeperFlightEnd = null;
    this.keeperFlightDone = null;
    this.state = 'busy'; // not diveable yet — the "set" beat
    this.fx.clear();

    // Dev-only: expose the committed CPU shot for headless tests (stripped from prod).
    if (import.meta.env.DEV) (window as unknown as { __lastTaker?: unknown }).__lastTaker = taker;

    // The body-lean tell points to the shot's side (read it to dive early).
    const tellSide = taker.landingNorm.x - 0.5; // <0 = the keeper's right side, etc.

    // PREDICTED strike instant so an EARLY commit (during the tell) can be timed
    // ("early commit is allowed but locks you in" — PRD §6). The strike callback
    // below re-stamps it with the REAL wall-clock moment, because Phaser timers
    // run on the rAF clock and can drift late under load (Track A4).
    const now = performance.now();
    this.strikeAt = now + CONFIG.KEEPER.readyMs + C.tellLeadTime;
    this.arrivalAt = this.strikeAt + flightMs;

    // Ready → tell: lean the striker; open the dive window (early commit allowed).
    this.time.delayedCall(CONFIG.KEEPER.readyMs, () => {
      this.state = 'keeping';
      this.showTakerTell(tellSide);
      this.debug.setLines(['KEEPER MODE', 'read the striker…', 'swipe to dive']);
    });

    // Strike → launch the flight (the dive window stays open through it). The ball
    // grows as it rushes the camera (keeper's-eye), toward a RETARGETABLE end: if
    // the dive resolves a save mid-flight, the last stretch bends into the gloves.
    this.time.delayedCall(CONFIG.KEEPER.readyMs + C.tellLeadTime, () => {
      this.strikeAt = performance.now(); // the REAL strike moment (Track A4)
      this.arrivalAt = this.strikeAt + flightMs;
      this.kickTakerFigure(tellSide);
      if (CONFIG.HAPTICS.enabled) navigator.vibrate?.(CONFIG.HAPTICS.kickMs);
      // Camera snap toward the incoming ball + turf flecks at the far spot. NOTE: no
      // hit-stop AND no screen shake here on purpose — the keeper's dive timing is
      // wall-clock, so a freeze would desync it and a shake would spoil the read.
      this.cameraBeat('strike', taker.landingPoint);
      this.burstTurf(start.x, start.y);
      this.keeperFlightEnd = { x: taker.landingPoint.x, y: taker.landingPoint.y };
      this.keeperFlightDone = this.flyBall(
        start,
        this.keeperFlightEnd,
        bendPx,
        flightMs,
        CONFIG.KEEPER.flightScaleStart,
        CONFIG.KEEPER.flightScaleEnd,
        { power: taker.power, endRef: this.keeperFlightEnd },
      );
      // A dive committed EARLY (during the tell) was held until the race exists —
      // submit it now so the loop can resolve while the ball flies (Track A1).
      if (this.diveCaptured && this.human.isAwaitingKeeper()) {
        this.human.submitDive(this.diveCaptured.zone, this.diveCaptured.timing);
      }
    });

    // No-dive deadline = BALL ARRIVAL (Track A1: the window closes when the ball
    // does — dives during the whole flight were already submitted on capture).
    this.time.delayedCall(CONFIG.KEEPER.readyMs + C.tellLeadTime + flightMs, () => {
      if (!this.human.isAwaitingKeeper()) return;
      this.state = 'busy';
      // Frozen keeper: judged as committed only at arrival — the hands never
      // leave centre, so only a shot hit straight at them is stopped.
      this.human.submitDive('BM', flightMs + CONFIG.RESOLUTION.diveTravelMs);
    });
  }

  // ── Shared animation helpers ──────────────────────────────────────────────
  /** Fly the ball start→end over durationMs with the arc, curve, depth-scale and
   *  spin used everywhere. scaleStart/End default to the taker view (shrink into
   *  the distance); the keeper view passes a growing scale (rushes the camera). */
  private async flyBall(
    start: { x: number; y: number },
    end: { x: number; y: number },
    bendPx: number,
    durationMs: number,
    scaleStart: number = CONFIG.FLIGHT.scaleStart,
    scaleEnd: number = CONFIG.FLIGHT.scaleEnd,
    // endRef: a LIVE endpoint read every frame — lets a mid-flight save bend the
    // last stretch of the flight into the gloves (Track A1). Omit for a fixed end.
    opts?: { power?: number; endRef?: { x: number; y: number } },
  ): Promise<void> {
    const F = CONFIG.FLIGHT;
    const T = CONFIG.JUICE.trail;
    const power = Phaser.Math.Clamp(opts?.power ?? 0.6, 0, 1);
    // Power-scaled spin (Tier 2, item 7): harder shots visibly spin faster.
    const spinTurns = F.spinTurns * Phaser.Math.Linear(T.spinMin, T.spinMax, power);
    const arcPx = this.scale.height * F.arcHeightFrac;
    const prog = { t: 0 };
    this.startBallTrail(power); // motion trail follows the ball through the flight
    await this.tweenP({
      targets: prog,
      t: 1,
      duration: durationMs,
      ease: F.easing,
      onUpdate: () => {
        const t = prog.t;
        const e = opts?.endRef ?? end; // live endpoint (retargetable — Track A1)
        const lift = arcPx * Math.sin(Math.PI * t); // height above the straight path
        const x = start.x + (e.x - start.x) * t + bendPx * Math.sin(Math.PI * t);
        const groundY = start.y + (e.y - start.y) * t; // path y BEFORE the arc lift
        const y = groundY - lift;
        const s = scaleStart + (scaleEnd - scaleStart) * t;
        this.ball.setPosition(x, y);
        this.ball.setScale(s);
        this.ball.setRotation(t * Math.PI * 2 * spinTurns);
        // Grounded shadow tracks the ball's GROUND point and shrinks/fades with lift
        // (Tier 1, item 2): the higher the ball, the smaller + fainter + more offset.
        const liftFrac = arcPx > 0 ? lift / arcPx : 0;
        this.positionBallShadow(x, groundY + this.layout.ball.r * 0.9 * s, s, liftFrac);
      },
    });
    this.stopBallTrail();
  }

  /** Dive the keeper so its gloves reach (handX, handY), leaning into the dive. */
  private diveKeeperTo(handX: number, handY: number, durationMs: number): void {
    const goal = this.layout.goal;
    const feetY = handY + this.layout.keeper.h * 0.5; // place the body so the gloves cover handY
    const lean = Phaser.Math.Clamp((handX - this.layout.keeper.x) / (goal.width * 0.5), -1, 1) * 0.7;
    const groundY = this.layout.keeper.feetY;
    this.tweens.add({
      targets: this.keeper,
      x: handX,
      y: feetY,
      rotation: lean,
      duration: durationMs,
      ease: 'Quad.easeOut',
      onComplete: () => this.burstDust(handX, groundY), // dust puff on landing (Tier 2)
    });
    // The grounded shadow slides along the ground with the dive (Tier 1, item 2).
    if (CONFIG.JUICE.shadow.enabled) {
      this.tweens.add({ targets: this.keeperShadow, x: handX, duration: durationMs, ease: 'Quad.easeOut' });
    }
  }

  /** Short rebound off the keeper's gloves after a save. */
  private deflectBall(handX: number, handY: number): Promise<void> {
    const goal = this.layout.goal;
    const dir = handX <= this.layout.keeper.x ? -1 : 1;
    return this.tweenP({
      targets: this.ball,
      x: handX + dir * goal.width * 0.08,
      y: handY + goal.height * 0.22,
      duration: 200,
      ease: 'Quad.easeOut',
    });
  }

  /** The pre-strike tell: lean the striker toward the shot side (PRD §6). The
   *  lean is scaled by tellStrength so it stays subtle. */
  private showTakerTell(side: number): void {
    const C = CONFIG.CPU_TAKER;
    const lean = Phaser.Math.Clamp(side * 2, -1, 1) * C.tellLeanMaxRad * C.tellStrength;
    this.tweens.add({ targets: this.takerFigure, rotation: lean, duration: C.tellLeadTime, ease: 'Sine.easeInOut' });
  }

  /** A quick scale punch at the moment of the strike. */
  private kickTakerFigure(_side: number): void {
    this.tweens.add({ targets: this.takerFigure, scaleX: 1.06, scaleY: 0.96, duration: 110, yoyo: true, ease: 'Quad.easeOut' });
  }

  // Player-kick outcome → reuses announceOutcome with the mode's win meaning.
  private async showOutcome(result: PenaltyResult): Promise<void> {
    if (import.meta.env.DEV) (window as unknown as { __lastResult?: unknown }).__lastResult = result;
    const keeperView = this.mode === 'keeper';
    // Banner + colour from the PLAYER's perspective (Track A1): in keeper view a
    // conceded goal must never show as a green celebratory "GOAL!" — your save is
    // the green one, a concession is the red one, a CPU spray is your let-off.
    const label =
      result.outcome === 'goal'
        ? keeperView
          ? 'CONCEDED'
          : 'GOAL!'
        : result.outcome === 'save'
          ? 'SAVED!'
          : keeperView
            ? 'WIDE!'
            : 'MISS!';
    // Whether the PLAYER won this kick: as taker only a goal is; as keeper any
    // non-goal (a save, or the CPU missing) went your way.
    const playerWon = keeperView ? !result.scored : result.scored;
    const color =
      result.outcome === 'miss'
        ? CONFIG.COLORS.outcomeMiss
        : playerWon
          ? CONFIG.COLORS.outcomeGoal
          : CONFIG.COLORS.outcomeSave;

    // Outcome framing (Tier 1, item 3): celebrate a goal on the net, favour the
    // keeper on a save, then ease back to neutral on the next enterAiming.
    if (result.scored) this.cameraBeat('goal', { x: this.ball.x, y: this.ball.y });
    else if (result.saved) this.cameraBeat('save', { x: this.keeper.x, y: this.keeper.y });

    if (CONFIG.HAPTICS.enabled) {
      const ms = result.saved ? CONFIG.HAPTICS.saveMs : result.scored ? CONFIG.HAPTICS.goalMs : 0;
      if (ms) navigator.vibrate?.(ms);
    }
    await this.announceOutcome(label, color, playerWon, result.outcome === 'goal');
  }

  /** Show the big centred banner + crowd + net shake for one kick. `playerWon`
   *  drives the celebration; `isGoal` (the ball physically hit the net) drives the
   *  net shake. Shared by player kicks and simulated opponent kicks (Phase 3). */
  private async announceOutcome(label: string, color: number, playerWon: boolean, _isGoal: boolean): Promise<void> {
    if (playerWon) this.sfx.cheer();
    else this.sfx.groan();
    // (The net reaction is now a localized ripple punched at the entry point during
    // the flight — see punchNet — not a whole-net shake here.)

    this.outcomeText
      .setText(label)
      .setColor('#' + color.toString(16).padStart(6, '0'))
      .setFontSize(Math.round(Math.min(this.scale.width, this.scale.height) * (playerWon ? 0.18 : 0.15)) + 'px')
      .setPosition(this.scale.width / 2, this.scale.height * 0.42)
      .setVisible(true)
      .setScale(0.2)
      .setAlpha(1);

    this.tweens.add({
      targets: this.outcomeText,
      scale: playerWon ? CONFIG.UI.goalZoomPeak : 1.0,
      duration: playerWon ? 300 : 220,
      ease: 'Back.easeOut',
      onComplete: () => {
        if (playerWon) {
          this.tweens.add({ targets: this.outcomeText, scale: CONFIG.UI.goalZoomPeak * 0.86, duration: 480, yoyo: true, repeat: 1, ease: 'Sine.easeInOut' });
        }
      },
    });

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
    this.endHitStop(); // never leave the game frozen if we abort mid hit-stop
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

    // The swipe path comes in as SCREEN coords; this `fx` layer is world-space, so
    // map each point through the camera (matters once the neutral zoom is < 1).
    const cam = this.cameras.main;
    const wp = (p: SwipePoint) => cam.getWorldPoint(p.x, p.y);
    g.lineStyle(2, CONFIG.COLORS.swipePath, 0.9);
    g.beginPath();
    const p0 = wp(points[0]);
    g.moveTo(p0.x, p0.y);
    for (let i = 1; i < points.length; i++) {
      const p = wp(points[i]);
      g.lineTo(p.x, p.y);
    }
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

  /** Live power meter (Phase 1): a bar that fills with power and turns red past
   *  the accuracy threshold — a direct read on the power/accuracy tradeoff. */
  private drawPowerMeter(power: number): void {
    const pm = CONFIG.UI.powerMeter;
    const w = this.scale.width * pm.widthFrac;
    const h = this.scale.height * pm.heightFrac;
    const x = (this.scale.width - w) / 2;
    const y = this.scale.height * (1 - pm.bottomFrac) - h;
    const radius = h * 0.4;
    const p = Phaser.Math.Clamp(power, 0, 1);
    const thr = CONFIG.INPUT.powerAccuracyThreshold;

    const g = this.powerGfx;
    g.clear();
    g.fillStyle(CONFIG.COLORS.powerMeterBg, 0.7);
    g.fillRoundedRect(x, y, w, h, radius);
    // Fill in two segments: green up to the threshold (controlled), then red for
    // the overshoot beyond it (the risky zone) — shows HOW far past the line you are.
    const safeW = w * Math.min(p, thr);
    g.fillStyle(CONFIG.COLORS.powerSafe, 0.95);
    g.fillRect(x + 1, y + 1, Math.max(0, safeW - 1), h - 2);
    if (p > thr) {
      g.fillStyle(CONFIG.COLORS.powerRisky, 0.95);
      g.fillRect(x + w * thr, y + 1, w * (p - thr), h - 2);
    }
    // Threshold tick + edge.
    const tx = x + w * thr;
    g.lineStyle(2, CONFIG.COLORS.powerMeterEdge, 0.85);
    g.lineBetween(tx, y - 1, tx, y + h + 1);
    g.lineStyle(2, CONFIG.COLORS.powerMeterEdge, 0.5);
    g.strokeRoundedRect(x, y, w, h, radius);
  }

  private hidePowerMeter(): void {
    this.powerGfx.clear();
  }

  /** Recompute the layout and redraw every STATIC pitch visual + reset actors.
   *  The camera follows the mode: Taker = behind the taker; Keeper = behind the
   *  keeper looking out (the ball flies toward you). */
  private rebuild(width: number, height: number): void {
    this.layout = computeLayout(width, height, this.mode);
    this.world.removeAll(true);

    // Draw order (Track A1): in the keeper's-eye view YOU are the nearest thing
    // on the pitch, so the keeper must occlude the incoming ball — the ball can
    // no longer draw "through" the body. Taker view keeps the ball on top (it is
    // nearer the camera than the far keeper for the whole flight).
    this.keeper.setDepth(this.mode === 'keeper' ? 410 : 380);

    this.drawBackground();
    this.drawFloodlights(); // Tier 3 — bright banks for the bloom to sit on
    this.drawPenaltyBox();

    if (this.mode === 'keeper') {
      // Keeper's-eye: no far goal/net/grid; a subtle near frame is the goal we
      // defend. Clear the taker-view net so it doesn't linger after a switch.
      this.netGfx.clear();
      this.drawNearGoalFrame();
    } else {
      this.drawGoal();
      this.netSim.resize(this.layout.goal); // (re)build the net grid for this goal
      this.drawNet();
      this.drawZoneGrid();
    }

    this.resetBall();
    this.resetKeeper();
    this.resetTaker();
  }

  /** Keeper's-eye: a subtle posts+crossbar frame around the near goal plane, so
   *  the player can see the goal they are defending (we are standing in it). */
  private drawNearGoalFrame(): void {
    const goal = this.layout.goal;
    const t = this.layout.post;
    const g = this.g();
    const left = goal.x;
    const right = goal.x + goal.width;
    const top = goal.y;
    const bottom = goal.y + goal.height;
    g.fillStyle(CONFIG.COLORS.goalFrame, 0.85);
    g.fillRect(left - t / 2, top - t / 2, goal.width + t, t); // crossbar
    g.fillRect(left - t / 2, top - t / 2, t, bottom - top); // left post
    g.fillRect(right - t / 2, top - t / 2, t, bottom - top); // right post
    // Faint net hatch so the frame reads as a goal mouth.
    g.lineStyle(1, CONFIG.COLORS.net, 0.1);
    const geo = CONFIG.GEOMETRY;
    for (let c = 1; c < geo.netCols; c++) {
      const x = left + (c / geo.netCols) * goal.width;
      g.lineBetween(x, top, x, bottom);
    }
    for (let r = 1; r < geo.netRows; r++) {
      const y = top + (r / geo.netRows) * goal.height;
      g.lineBetween(left, y, right, y);
    }
  }

  private resetBall(): void {
    this.drawBallGraphic(this.layout.ball.r);
    // Keeper's-eye: at rest the ball sits far away (small). Taker view: full size.
    const restScale = this.mode === 'keeper' ? CONFIG.KEEPER.flightScaleStart : 1;
    this.ball.setScale(restScale).setRotation(0).setPosition(this.layout.ball.x, this.layout.ball.y);
    // Grounded ball shadow at rest (Tier 1, item 2): on the ground, full size.
    const b = this.layout.ball;
    this.positionBallShadow(b.x, b.y + b.r * 0.9, restScale, 0);
  }

  private resetKeeper(): void {
    const k = this.layout.keeper;
    this.drawKeeperGraphic(k.w, k.h);
    this.keeper.setRotation(0).setPosition(k.x, k.feetY);
    this.positionActorShadow(this.keeperShadow, k.x, k.feetY, k.w);
  }

  /** Reset the CPU striker, shown only in Keeper mode. */
  private resetTaker(): void {
    const t = this.layout.taker;
    this.drawTakerGraphic(t.w, t.h);
    this.takerFigure.setRotation(0).setScale(1).setPosition(t.x, t.feetY).setVisible(this.mode === 'keeper');
    if (this.mode === 'keeper') this.positionActorShadow(this.takerShadow, t.x, t.feetY, t.w);
    else this.takerShadow.setVisible(false);
  }

  private showIdleDebug(): void {
    const l = this.layout;
    const keeperMode = this.mode === 'keeper';
    this.debug.setLines([
      'PENALTY SHOOTOUT',
      'Milestone 5 — ' + (keeperMode ? 'Keeper mode (you save)' : 'Taker mode (you shoot)'),
      (l.isLandscape ? 'landscape' : 'portrait') + ' ' + Math.round(l.width) + 'x' + Math.round(l.height),
      keeperMode ? 'read the striker → swipe to dive' : 'swipe to shoot →  beat the keeper',
      'tap MODE to switch · DBG to hide',
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

    // OVERSCAN: the neutral camera is pulled back (CONFIG.JUICE.camera.baseZoom < 1),
    // which reveals area beyond the canvas. Paint the stadium/pitch past every edge
    // by this margin so the pulled-back view shows more field, never empty bars.
    const M = CONFIG.JUICE.camera.enabled ? Math.max(width, height) * 0.18 : 0;
    const L = -M;
    const W = width + 2 * M;

    g.fillStyle(CONFIG.COLORS.stadium, 1);
    g.fillRect(L, -M, W, horizon + M); // stands (extended up + sideways)
    g.fillStyle(CONFIG.COLORS.stadiumBand, 1);
    g.fillRect(L, horizon * 0.28, W, horizon * 0.22);

    g.fillStyle(CONFIG.COLORS.pitch, 1);
    g.fillRect(L, horizon, W, height - horizon + M); // grass (extended down + sideways)

    g.fillStyle(CONFIG.COLORS.pitchStripe, 1);
    const stripes = 8;
    for (let i = 0; i < stripes; i += 2) {
      const y0 = horizon + Math.pow(i / stripes, 1.6) * (height - horizon);
      const y1 = horizon + Math.pow((i + 1) / stripes, 1.6) * (height - horizon);
      g.fillRect(L, y0, W, y1 - y0);
    }
    // One extra stripe band below the bottom edge so the overscan grass isn't flat.
    g.fillRect(L, height, W, M);
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

  /** Draw the net as polylines through the NetSim nodes, so a punched bulge curves
   *  the hatch lines where the ball went in (Tier 1, item 1). At rest every node is
   *  flat, so this is pixel-identical to the old static net. */
  private drawNet(): void {
    const sim = this.netSim;
    const cols = sim.gridCols;
    const rows = sim.gridRows;
    const g = this.netGfx;
    g.clear();
    g.setPosition(0, 0);
    g.lineStyle(1, CONFIG.COLORS.net, 0.18);

    // Interior verticals (each as a polyline down its column).
    for (let c = 1; c < cols; c++) {
      const p0 = sim.point(c, 0);
      g.beginPath();
      g.moveTo(p0.x, p0.y);
      for (let row = 1; row <= rows; row++) {
        const p = sim.point(c, row);
        g.lineTo(p.x, p.y);
      }
      g.strokePath();
    }
    // Interior horizontals (each as a polyline across its row).
    for (let row = 1; row < rows; row++) {
      const p0 = sim.point(0, row);
      g.beginPath();
      g.moveTo(p0.x, p0.y);
      for (let c = 1; c <= cols; c++) {
        const p = sim.point(c, row);
        g.lineTo(p.x, p.y);
      }
      g.strokePath();
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

  // Ball modelled on the adidas "Trionda" (FIFA World Cup 2026): white base with
  // three bold colour waves (USA blue, Mexico green, Canada red) pinwheeling out
  // from a gold centre, plus soft 3D shading. Drawn at the local origin.
  private drawBallGraphic(r: number): void {
    const C = CONFIG.COLORS;
    const g = this.ballGfx;
    g.clear();

    // White base.
    g.fillStyle(C.ball, 1);
    g.fillCircle(0, 0, r);

    // Three colour "waves" 120° apart, each a tapering petal toward the rim.
    const waveColors = [C.ballBlue, C.ballGreen, C.ballRed];
    const k = 2.6; // petal narrowness (higher = thinner, more white showing)
    const reach = r * 0.86;
    const span = Math.PI / 2 / k; // angle at which the petal closes
    const steps = 16;
    for (let i = 0; i < 3; i++) {
      const a = -Math.PI / 2 + i * ((2 * Math.PI) / 3);
      const pts: Phaser.Types.Math.Vector2Like[] = [{ x: 0, y: 0 }];
      for (let s = 0; s <= steps; s++) {
        const th = a - span + 2 * span * (s / steps);
        const rad = reach * Math.max(0, Math.cos(k * (th - a)));
        pts.push({ x: Math.cos(th) * rad, y: Math.sin(th) * rad });
      }
      g.fillStyle(waveColors[i], 1);
      g.fillPoints(pts as Phaser.Geom.Point[], true);
    }

    // Gold centre nub (trophy homage).
    g.fillStyle(C.ballGold, 1);
    g.fillCircle(0, 0, r * 0.17);

    // Soft 3D shading: highlight top-left, shadow bottom-right.
    g.fillStyle(0xffffff, 0.16);
    g.fillCircle(-r * 0.33, -r * 0.33, r * 0.5);
    g.fillStyle(0x000000, 0.12);
    g.fillCircle(r * 0.34, r * 0.34, r * 0.55);

    // Rim outline.
    g.lineStyle(Math.max(1, r * 0.05), C.ballOutline, 0.85);
    g.strokeCircle(0, 0, r);
  }

  // Keeper drawn with FEET at the local origin (so rotation = a dive lean).
  // Keeper's-eye (Keeper mode) shows the keeper BIG from BEHIND, so it uses a
  // smaller head sitting above broad shoulders; the far Taker-mode keeper keeps
  // its original chunky-head proportions (it is only a few px tall).
  private drawKeeperGraphic(w: number, h: number): void {
    const g = this.keeperGfx;
    g.clear();
    const back = this.mode === 'keeper';
    const headR = w * (back ? 0.2 : 0.34);
    const armLen = w * 0.38;
    const armY = -h + h * 0.22;
    const gloveR = w * (back ? 0.22 : 0.2);
    const torsoTop = back ? -h + headR * 1.7 : -h; // head sits above the torso (back view)

    g.fillStyle(CONFIG.COLORS.keeperBody, 1);
    g.fillRoundedRect(-w / 2, torsoTop, w, -torsoTop, Math.max(6, w * 0.16));
    g.fillRoundedRect(-w / 2 - armLen, armY, armLen, h * 0.13, 6);
    g.fillRoundedRect(w / 2, armY, armLen, h * 0.13, 6);

    g.fillStyle(CONFIG.COLORS.keeperGloves, 1);
    g.fillCircle(-w / 2 - armLen, armY + h * 0.065, gloveR);
    g.fillCircle(w / 2 + armLen, armY + h * 0.065, gloveR);

    g.fillStyle(CONFIG.COLORS.keeperSkin, 1);
    g.fillCircle(0, back ? -h + headR : -h + headR * 0.2, headR);
  }

  // CPU taker (Keeper mode) — a simple back-view striker, FEET at the local origin
  // so a rotation reads as a body lean (the tell). Kept deliberately minimal.
  private drawTakerGraphic(w: number, h: number): void {
    const C = CONFIG.COLORS;
    const g = this.takerGfx;
    g.clear();
    const headR = w * 0.32;
    const legW = w * 0.34;
    const legTop = -h * 0.42; // legs from here down to the feet (origin)

    // Legs (two), then shorts band, torso, head — drawn bottom-up.
    g.fillStyle(C.takerShorts, 1);
    g.fillRoundedRect(-w / 2, legTop, legW, -legTop, Math.max(3, w * 0.1));
    g.fillRoundedRect(w / 2 - legW, legTop, legW, -legTop, Math.max(3, w * 0.1));

    g.fillStyle(C.takerBody, 1);
    g.fillRoundedRect(-w / 2, -h + headR, w, -(-h + headR) + legTop, Math.max(6, w * 0.16));

    g.fillStyle(C.takerSkin, 1);
    g.fillCircle(0, -h + headR * 0.9, headR);
  }
}
