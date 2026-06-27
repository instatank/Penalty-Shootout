/**
 * config.ts — THE single source of truth for every tunable value.
 *
 * Architecture RULE 1: no magic numbers anywhere else in the codebase. If a
 * value affects how the game looks, feels, or resolves, it lives here, grouped
 * and commented by system (mirrors PRD §11).
 *
 * Milestone 1 only actually *uses* the GAME / COLORS / GEOMETRY / DEBUG groups.
 * The INPUT / FLIGHT / CPU / RESOLUTION / SESSION groups are declared now (with
 * sensible starting defaults) so the shape is fixed early and later milestones
 * just fill in behaviour — they are marked "(not wired until Mn)".
 */

// ─────────────────────────────────────────────────────────────────────────────
// GAME — the fixed design resolution. Everything is authored against this space
// and Phaser's Scale.FIT scales it to the real screen. Portrait 9:16.
// ─────────────────────────────────────────────────────────────────────────────
const GAME = {
  // LANDSCAPE (owner decision 2026-06-27, overrides the PRD's original portrait
  // lock): a real goal is wide (~3:1), so a sideways frame fits it naturally and
  // removes the portrait "dead space". Authored against 1280x720; Scale.FIT
  // scales this design space to the device while preserving aspect.
  width: 1280,
  height: 720,
  backgroundColor: '#0d1b2a', // dark stadium tone (also fills any letterbox bars)
} as const;

// ─────────────────────────────────────────────────────────────────────────────
// COLORS — every colour as a 0xRRGGBB number for Phaser graphics.
// ─────────────────────────────────────────────────────────────────────────────
const COLORS = {
  // Backdrop behind/above the goal line — a dark stadium tone. This is the key
  // contrast move: it breaks up the all-green screen and makes the white goal
  // frame and net pop.
  stadium: 0x0d1b2a, // dark navy stand shadow
  stadiumBand: 0x16344a, // a lighter band suggesting stands/crowd

  pitch: 0x2f7d33, // grass (richer, less flat than before)
  pitchStripe: 0x276b2c, // mowed-stripe alternate
  boxLine: 0xf5f5f5, // penalty-box / spot markings

  goalFrame: 0xfafafa, // posts + crossbar
  goalFrameShadow: 0x8a9097,
  net: 0xffffff,
  zoneLine: 0xffffff, // 3x2 grid lines drawn on the goal mouth

  // Ball modelled on the adidas "Trionda" (FIFA World Cup 2026 official ball):
  // a white ball with three bold colour waves for the host nations + gold.
  ball: 0xffffff, // white base
  ballBlue: 0x2657d6, // USA wave
  ballRed: 0xe5202e, // Canada wave
  ballGreen: 0x16a34a, // Mexico wave
  ballGold: 0xf2c14e, // gold trophy accent
  ballOutline: 0xb8c0c8,

  keeperBody: 0x1565c0, // keeper kit (blue — strong contrast vs green + navy)
  keeperGloves: 0xffeb3b,
  keeperSkin: 0xe8b38a,

  debugText: 0x00ff66,
  debugBg: 0x000000,

  // Swipe-feedback visuals (the M2 aim preview).
  swipePath: 0xffe082, // the sampled finger path
  aimLine: 0xffffff, // ball → target aim line
  aimReticle: 0xff5252, // crosshair at the target point
  aimRing: 0xff8a80, // scatter ring (errorRadius)
  zoneHighlight: 0xffeb3b, // the targeted 3x2 cell

  // Outcome banner colours.
  outcomeGoal: 0x4caf50, // GOAL
  outcomeSave: 0xff7043, // SAVE
  outcomeMiss: 0x90a4ae, // MISS
} as const;

// ─────────────────────────────────────────────────────────────────────────────
// GEOMETRY — the perspective scene laid out in design-space pixels.
//
// The "goal mouth" rectangle (goalLeft..goalRight, goalTop..goalBottom) is the
// target plane: the 3x2 zone grid is computed from it (see zones.ts), and later
// the ball's landing point is expressed in this plane. Change the goal here and
// everything that references it follows.
// ─────────────────────────────────────────────────────────────────────────────
const GEOMETRY = {
  // ── PROPORTIONAL / RESPONSIVE LAYOUT ──────────────────────────────────────
  // The scene fills whatever screen size and orientation the device gives us
  // (no letterbox bars), so geometry is expressed as FRACTIONS of the live
  // canvas size. game/layout.ts → computeLayout(w, h) turns these into pixels,
  // and re-runs whenever the screen size or orientation changes. Two profiles
  // (landscape / portrait) keep BOTH orientations looking intentional.

  // Shared shape constants.
  goalAspect: 2.6, // goal mouth width : height (a real goal is ~3:1)
  postThicknessFrac: 0.05, // post/crossbar thickness as a fraction of goal height
  netRows: 8, // net hatch density
  netCols: 16,
  zoneCols: 3, // the 3x2 aiming grid
  zoneRows: 2,
  keeperHeightFrac: 0.54, // keeper height as a fraction of goal height
  keeperWidthFrac: 0.095, // keeper body width as a fraction of goal width
  // (Keeper covers ~1 zone so the CPU is clearly beatable by corners — PRD §5.)

  // Landscape profile (used when the screen is wider than it is tall).
  landscape: {
    goalWidthFrac: 0.6, // goal mouth width / screen width
    goalTopFrac: 0.17, // crossbar y / screen height
    boxFarPadFrac: 0.02, // far box half-width = goal half-width + this * width
    boxNearHalfWidthFrac: 0.47, // near box half-width / screen width (sells depth)
    boxNearYFrac: 0.92, // near edge y / screen height
    spotYFrac: 0.68, // penalty spot y / screen height
    ballYFrac: 0.8, // ball rest y / screen height — lifted from 0.88 so the ball
    //  sits clear of the iOS home-swipe bar at the bottom in landscape (starting
    //  a swipe there must not trigger the phone's home gesture).
    ballRadiusFrac: 0.039, // ball radius / screen height
  },

  // Portrait profile (used when the screen is taller than it is wide). The goal
  // fills more of the narrower width and sits higher, leaving the lower screen
  // for the run-up — so portrait no longer feels empty.
  portrait: {
    goalWidthFrac: 0.92,
    goalTopFrac: 0.16,
    boxFarPadFrac: 0.015,
    boxNearHalfWidthFrac: 0.47,
    boxNearYFrac: 0.93,
    spotYFrac: 0.66,
    ballYFrac: 0.84,
    ballRadiusFrac: 0.034,
  },
} as const;

// ─────────────────────────────────────────────────────────────────────────────
// INPUT (PRD §4) — swipe → derived values. (Not wired until Milestone 2.)
// ─────────────────────────────────────────────────────────────────────────────
const INPUT = {
  // Power = release velocity over the LAST velocityWindowMs, normalised to 0..1.
  minPower: 0.15, // clamp floor
  maxPower: 1.0, // clamp ceiling
  velocityWindowMs: 80, // measure speed over the last ~80ms (rewards a snappy flick)
  fullPowerSpeed: 3.6, // swipe speed (in screen-HEIGHTS per second) that = max power.
  //  Raised from 2.6 so power no longer pins at 1.0 — a normal flick lands
  //  mid-range and only a genuinely fast flick reaches full power. Resolution-
  //  independent: scales with screen size.

  // Curve = signed lateral deviation of the path midpoint from the straight
  // start→end line, as a fraction of swipe length, capped LOW — penalties barely
  // bend, so this is for subtle effect only, never a banana kick (owner note).
  maxCurve: 0.25,

  // Accuracy scatter: errorRadius = (baseError + kPower * power) * goalWidth.
  // Fractions of goal width so the scatter scales with screen. Used for the M2
  // scatter ring preview and the M4 landing point.
  baseError: 0.015, // ~1.5% of goal width at zero power (small)
  kPower: 0.09, // grows with power — high power widens the error (PRD §5)

  minSwipeDistFrac: 0.03, // shorter than this (fraction of screen height) = a tap, ignored
} as const;

// ─────────────────────────────────────────────────────────────────────────────
// AIM (PRD §4/§5) — how a swipe's DISPLACEMENT maps to a spot in the goal.
// These are the primary "feel" knobs and the first thing to calibrate by
// playtest. The two axes are independent so all six zones are reachable:
//   • sideways swipe distance  → left/right placement
//   • upward swipe distance    → height (short flick = low, long flick = high)
// All values are fractions of the live SCREEN size, so they scale per device.
// ─────────────────────────────────────────────────────────────────────────────
const AIM = {
  reachX: 0.2, // sideways swipe (fraction of screen WIDTH) to aim at a post
  reachLow: 0.03, // up-swipe (fraction of screen HEIGHT) at/below which = ground (bottom)
  reachHigh: 0.34, // up-swipe (fraction of screen HEIGHT) that = the crossbar (top)
  overshoot: 1.15, // allow aiming slightly past the posts/bar so misses are possible
} as const;

// ─────────────────────────────────────────────────────────────────────────────
// FLIGHT (PRD §5) — ball travel + fake depth. (Not wired until Milestone 3.)
// ─────────────────────────────────────────────────────────────────────────────
const FLIGHT = {
  flightDuration: 620, // ms ball takes to reach the goal plane
  easing: 'Quad.easeOut', // decelerate into the goal (reads as perspective)
  arcHeightFrac: 0.075, // apex lift above the straight path, as a fraction of screen height.
  //  Lowered from 0.12 — the vertical arc read too floaty (owner note). Sideways
  //  curve (curveGain below) is separate and was left as-is.
  curveGain: 0.15, // lateral bend at apex = curve * curveGain * goalWidth.
  //  Small on purpose — penalties barely curve (owner note); effect only.
  scaleStart: 1.0, // ball scale at the foot (near)
  scaleEnd: 0.42, // ball scale at the goal (far) — sells fake depth
  resetDelay: 900, // ms to hold the landed ball before resetting to the spot
  spinTurns: 1.5, // how many times the ball spins during its flight (visual life)
} as const;

// ─────────────────────────────────────────────────────────────────────────────
// CPU_KEEPER (PRD §5) — opponent in solo Taker mode. (Not wired until M4.)
// ─────────────────────────────────────────────────────────────────────────────
const CPU_KEEPER = {
  difficulty: 0.5, // single master knob (PRD §5). Keep beatable — err low.
  // Zone-guess accuracy is lerp(min,max) by difficulty (chance of reading the
  // right column). Kept modest so well-placed corners beat the keeper.
  guessAccuracyMin: 0.25,
  guessAccuracyMax: 0.8,
  // Dive timing spread (× timingWindowMs) is lerp(max,min) by difficulty — a
  // better keeper times the dive tighter. Kept modest so a right-direction guess
  // mostly translates into a save.
  timingSpreadMin: 0.2,
  timingSpreadMax: 0.9,
  reactionDelay: 160, // ms after the strike before the dive animation starts
  diveDuration: 420, // ms for the dive animation
  reach: 0.92, // how far toward the zone the keeper visibly reaches (0..1)
} as const;

// ─────────────────────────────────────────────────────────────────────────────
// CPU_TAKER (PRD §6) — opponent in solo Keeper mode. (Not wired until M5.)
// ─────────────────────────────────────────────────────────────────────────────
const CPU_TAKER = {
  tellStrength: 0.6, // how obvious the pre-strike body lean is (0..1)
  tellLeadTime: 350, // ms the tell appears before the strike
  flightTime: 800, // ms reaction window for the keeper-player
  // Relative likelihood the CPU aims at each zone (TL,TM,TR,BL,BM,BR).
  targetWeights: [1.2, 0.7, 1.2, 1.0, 0.6, 1.0],
} as const;

// ─────────────────────────────────────────────────────────────────────────────
// RESOLUTION (PRD §7) — weights for the single pure resolvePenalty(). (Not
// wired until Milestone 4.) maxSaveChance < 1 keeps perfect corners unsaveable.
// ─────────────────────────────────────────────────────────────────────────────
const RESOLUTION = {
  // GEOMETRIC save model: the keeper saves when the ball lands within its dive
  // reach (an ellipse around where it actually dives). This makes the outcome
  // match the visible ball↔keeper interaction instead of a hidden dice roll.
  // Reach is in NORMALISED goal coords (fraction of goal width / height).
  reachX: 0.34, // horizontal reach around the dive point
  reachY: 0.4, // vertical reach (a touch more — rows are tall)
  timingWindowMs: 140, // dive-timing tolerance; worse timing → less reach
  timingFloor: 0.72, // reach kept even with the worst timing (0..1). High so a
  //  correct DIRECTION guess reliably saves — beatability comes from the keeper
  //  guessing the wrong way, not from fumbled timing (owner feel note).
  powerReachPenalty: 0.3, // hard shots shrink reach by up to this (× power)
  margin: 0.3, // soft save/goal band at the very edge of reach (seeded tie-break)
} as const;

// ─────────────────────────────────────────────────────────────────────────────
// SESSION (PRD §9) — scoring. (Not wired until Milestone 6.)
// ─────────────────────────────────────────────────────────────────────────────
const SESSION = {
  kicksPerSession: 5,
} as const;

// ─────────────────────────────────────────────────────────────────────────────
// HAPTICS (PRD §11) — navigator.vibrate cues. Kick buzz lands here at M3; the
// save/goal buzz arrives with the keeper (M5).
// ─────────────────────────────────────────────────────────────────────────────
const HAPTICS = {
  enabled: true,
  kickMs: 12, // short buzz on ball contact (the kick)
  goalMs: 20, // buzz on a goal
  saveMs: 30, // buzz on a save
} as const;

// ─────────────────────────────────────────────────────────────────────────────
// UI — outcome reveal (PRD §12). Big GOAL / SAVE / MISS banner between kicks.
// ─────────────────────────────────────────────────────────────────────────────
const UI = {
  outcomeHoldMs: 1200, // how long the GOAL/SAVE/MISS banner stays up
  betweenKicksMs: 250, // small beat before the ball resets for the next kick
  goalZoomPeak: 1.3, // banner overshoot scale on a GOAL (celebratory pop)
  netShakeAmpFrac: 0.014, // net shake amplitude as a fraction of goal width (goal only)
  netShakeMs: 480, // net shake duration
} as const;

// ─────────────────────────────────────────────────────────────────────────────
// SOUND (PRD §11 — optional) — lightweight procedural crowd SFX via Web Audio,
// so there are no audio asset files to ship. Cheer on a goal, groan on a save/
// miss. Unlocked on first touch (browsers require a user gesture).
// ─────────────────────────────────────────────────────────────────────────────
const SOUND = {
  enabled: true,
  volume: 0.4,
} as const;

// ─────────────────────────────────────────────────────────────────────────────
// DEBUG (PRD §11) — the mandatory tuning overlay (architecture RULE 2).
// ─────────────────────────────────────────────────────────────────────────────
const DEBUG = {
  enabledByDefault: true, // show the overlay on load during development
  toggleKey: 'D', // keyboard toggle (desktop)
  showZoneLabels: true, // label the 3x2 grid cells (TL, TM, ...)
} as const;

// Single exported object — import { CONFIG } and read CONFIG.<group>.<value>.
export const CONFIG = {
  GAME,
  COLORS,
  GEOMETRY,
  INPUT,
  AIM,
  FLIGHT,
  CPU_KEEPER,
  CPU_TAKER,
  RESOLUTION,
  SESSION,
  HAPTICS,
  UI,
  SOUND,
  DEBUG,
} as const;

export type Config = typeof CONFIG;
