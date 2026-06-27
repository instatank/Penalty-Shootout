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
    boxNearYFrac: 0.96, // near edge y / screen height
    spotYFrac: 0.75, // penalty spot y / screen height
    ballYFrac: 0.88, // ball rest y / screen height
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
  minPower: 0.15, // clamp floor for normalised power [0..1]
  maxPower: 1.0,
  velocityWindowMs: 80, // power = release velocity over the LAST ~80ms only
  maxCurve: 0.35, // cap on lateral bend (low — it's a penalty)
  baseError: 8, // px of aim scatter at zero power (small)
  kPower: 46, // extra px of scatter per unit power (errorRadius growth)
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
  FLIGHT,
  CPU_KEEPER,
  CPU_TAKER,
  RESOLUTION,
  SESSION,
  DEBUG,
} as const;

export type Config = typeof CONFIG;
