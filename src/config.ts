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

  ball: 0xffffff,
  ballPanel: 0x1a1a1a, // pentagon hint on the ball

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
  // start→end line, as a fraction of swipe length, capped here (low — penalty).
  maxCurve: 0.35,

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
  flightDuration: 650, // ms ball takes to reach the goal plane
  arcHeight: 120, // px of vertical arc at the apex
  easing: 'Quad.easeOut', // Phaser easing name for the travel
  scaleStart: 1.0, // ball scale at the foot (near)
  scaleEnd: 0.45, // ball scale at the goal (far) — sells depth
} as const;

// ─────────────────────────────────────────────────────────────────────────────
// CPU_KEEPER (PRD §5) — opponent in solo Taker mode. (Not wired until M4.)
// ─────────────────────────────────────────────────────────────────────────────
const CPU_KEEPER = {
  reactionDelay: 180, // ms after strike before the keeper commits a dive
  guessAccuracy: 0.5, // 0..1 chance of guessing the correct zone column
  diveSpeed: 1.0, // animation speed multiplier
  reach: 1.0, // how far the dive covers (scales zoneMatch overlap)
  difficulty: 0.5, // single master knob (PRD §5) — blends the above
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
  baseSaveChance: 0.18,
  zoneMatchBonus: 0.55, // keeper dive zone overlaps ball landing zone
  timingWindowMs: 140, // how tight the ideal dive-timing window is
  powerPenalty: 0.22, // harder shots are harder to stop
  cornerPenalty: 0.3, // shots tight to post/bar are harder to reach
  maxSaveChance: 0.92, // ceiling (<1 so a perfect corner can't be saved)
} as const;

// ─────────────────────────────────────────────────────────────────────────────
// SESSION (PRD §9) — scoring. (Not wired until Milestone 6.)
// ─────────────────────────────────────────────────────────────────────────────
const SESSION = {
  kicksPerSession: 5,
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
  DEBUG,
} as const;

export type Config = typeof CONFIG;
