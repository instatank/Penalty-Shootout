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
  width: 720,
  height: 1280,
  backgroundColor: '#0b5d2b', // pitch green (behind everything)
} as const;

// ─────────────────────────────────────────────────────────────────────────────
// COLORS — every colour as a 0xRRGGBB number for Phaser graphics.
// ─────────────────────────────────────────────────────────────────────────────
const COLORS = {
  pitch: 0x0b5d2b,
  pitchStripe: 0x0a5226, // subtle mowed-stripe alternate
  boxLine: 0xffffff, // penalty-box / spot markings
  goalFrame: 0xf2f2f2, // posts + crossbar
  goalFrameShadow: 0xc9c9c9,
  net: 0xffffff,
  zoneLine: 0xffffff, // 3x2 grid lines drawn on the goal mouth
  ball: 0xffffff,
  ballPanel: 0x222222, // pentagon hint on the ball
  keeperBody: 0x1976d2, // keeper kit
  keeperGloves: 0xffd54f,
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
  // Goal mouth on screen (the plane balls are aimed at).
  goalLeft: 120,
  goalRight: 600,
  goalTop: 300,
  goalBottom: 560,

  postThickness: 14, // visual thickness of posts + crossbar
  netRows: 9, // net hatch density
  netCols: 13,

  // The 3x2 aiming grid (cols x rows) drawn over the goal mouth.
  zoneCols: 3,
  zoneRows: 2,

  // Perspective ground: the penalty box is drawn as a trapezoid that is narrow
  // at the goal (far) and wide at the player (near), selling fake depth.
  boxFarHalfWidth: 250, // half-width of the box at the goal line (far)
  boxNearHalfWidth: 330, // half-width of the box at the near edge
  boxFarY: 560, // far edge sits at the goal line
  boxNearY: 980, // near edge of the penalty box

  // Penalty spot + ball rest position (near the camera, so it is drawn large).
  penaltySpotY: 900,
  ballRestX: 360,
  ballRestY: 1080,
  ballRadius: 34,

  // Keeper standing pose, centred in the goal. Sized to cover ~1.3 zones so the
  // CPU is beatable by corners (PRD §5).
  keeperX: 360,
  keeperFeetY: 560, // feet on the goal line
  keeperHeight: 150,
  keeperWidth: 70,
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
