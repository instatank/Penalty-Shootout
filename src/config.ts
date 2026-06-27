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
  // Goal mouth on screen (the plane balls are aimed at). Wide and high in the
  // frame so it reads like a real goal and dominates the view (landscape).
  goalLeft: 330,
  goalRight: 950,
  goalTop: 150,
  goalBottom: 380,

  postThickness: 14, // visual thickness of posts + crossbar
  netRows: 8, // net hatch density
  netCols: 16, // more columns — the goal is wide

  // The 3x2 aiming grid (cols x rows) drawn over the goal mouth.
  zoneCols: 3,
  zoneRows: 2,

  // Perspective ground: the penalty box is drawn as a trapezoid that is narrow
  // at the goal (far) and wide at the player (near), selling fake depth. In
  // landscape the near edge is much wider than the goal, which gives a strong,
  // natural sense of depth.
  boxFarHalfWidth: 340, // half-width of the box at the goal line (far)
  boxNearHalfWidth: 600, // half-width of the box at the near edge
  boxFarY: 380, // far edge sits at the goal line
  boxNearY: 690, // near edge of the penalty box

  // Penalty spot + ball rest position (near the camera, so it is drawn large).
  penaltySpotY: 540,
  ballRestX: 640,
  ballRestY: 635,
  ballRadius: 28,

  // Keeper standing pose, centred in the goal. Covers ~1 zone so the CPU is
  // clearly beatable by corners (PRD §5).
  keeperX: 640,
  keeperFeetY: 380, // feet on the goal line
  keeperHeight: 124,
  keeperWidth: 58,
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
