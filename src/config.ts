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
  // PORTRAIT-PRIMARY, responsive to both orientations (Phase 0, 2026-06-29). The
  // real layout is computed live from the screen size in game/layout.ts (Scale.
  // RESIZE — no fixed design-space pixels); these width/height are only the
  // initial canvas size before the first resize fires.
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

  // CPU taker (Keeper mode) — a red kit so it reads as the "other team" vs the
  // blue keeper.
  takerBody: 0xd32f2f,
  takerShorts: 0x1a1a1a,
  takerSkin: 0xc98a5e,

  debugText: 0x00ff66,
  debugBg: 0x000000,

  // Swipe-feedback visuals (the M2 aim preview).
  swipePath: 0xffe082, // the sampled finger path
  aimLine: 0xffffff, // ball → target aim line
  aimReticle: 0xff5252, // crosshair at the target point
  aimRing: 0xff8a80, // scatter ring (errorRadius)
  zoneHighlight: 0xffeb3b, // the targeted 3x2 cell

  // Power meter (Phase 1). Fill is green in the dependable range, red past the
  // accuracy threshold — a live read on the power/accuracy tradeoff.
  powerSafe: 0x4caf50,
  powerRisky: 0xff5252,
  powerMeterBg: 0x10202c,
  powerMeterEdge: 0xffffff,

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

  // The CPU taker figure (only shown in Keeper mode — M5). It stands behind the
  // ball, nearer the camera than the keeper, so it is drawn a little bigger. Its
  // pre-strike body lean is the "tell" the player reads (PRD §6).
  takerHeightFrac: 0.72, // taker height as a fraction of goal height
  takerWidthFrac: 0.12, // taker body width as a fraction of goal width

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
    ballRadiusFrac: 0.072, // ball radius / screen height. Raised from 0.039:
    //  in landscape the screen height is the SHORT side, so the old value made
    //  the ball much smaller than in portrait. ~0.034 × a typical phone aspect
    //  ratio makes the landscape ball match the (good) portrait ball, which also
    //  fixes it being too small by the time it reaches the goal.
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

  // ── KEEPER'S-EYE VIEW (Keeper mode — owner decision 2026-06-27) ────────────
  // A SECOND camera, used only in Keeper mode: we sit behind the keeper looking
  // OUT at the pitch. The taker is far + small; the ball is kicked TOWARD us and
  // GROWS. The "goal" we defend is the near foreground plane the ball arrives in,
  // and (crucially) it is what we hand to resolvePenalty as the goal rect, so all
  // the normalised-coord math is reused unchanged — only the pixels move.
  // Fractions of the live screen; shared across orientations (tune by playtest).
  keeperView: {
    horizonYFrac: 0.22, // stadium/pitch split (far)
    spotYFrac: 0.34, // far penalty spot = where the ball launches from
    goalTopFrac: 0.4, // near goal plane: crossbar (top)
    goalBottomFrac: 0.84, // near goal plane: ground line (bottom)
    goalWidthFrac: 0.84, // near goal plane width / screen width
    boxFarHalfFrac: 0.1, // perspective box half-width far (at horizon)
    boxNearHalfFrac: 0.49, // perspective box half-width near (foreground)
    keeperFeetYFrac: 0.92, // foreground keeper feet (big, near the camera)
    keeperHeightFrac: 0.3, // foreground keeper height / screen height
    keeperAspect: 0.45, // keeper width : height — width is DERIVED from height so the
    //  figure stays human-proportioned in both orientations (≈ the taker-view keeper).
    takerHeightFrac: 0.12, // far taker height / screen height (small)
    takerAspect: 0.43, // far taker width : height
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

  // POWER / ACCURACY TRADEOFF (Phase 1 — the core skill). Scatter radius (as a
  // fraction of goal width) stays at baseError up to powerAccuracyThreshold, then
  // grows fast: errorRadius = (baseError + kPower * excess^scatterExponent) * goalW,
  // where excess = (power - threshold) / (1 - threshold), clamped ≥0. So a
  // controlled shot lands where aimed; a greedy max-power shot may miss the frame.
  baseError: 0.015, // ~1.5% of goal width below the threshold (reliably accurate)
  kPower: 0.17, // extra scatter at max power — big enough to miss a tight corner
  powerAccuracyThreshold: 0.55, // power below which accuracy is dependable
  scatterExponent: 1.6, // how sharply accuracy degrades past the threshold

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
  // Higher power = faster ball travel (Phase 1). The taker flight time lerps from
  // slow (a gentle shot) to fast (a blasted shot) by power. (Keeper-view flight
  // uses CONFIG.CPU_TAKER.flightTime — the reaction window — instead.)
  flightDurationSlow: 760, // ms at min power
  flightDurationFast: 470, // ms at max power
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
  // Difficulty is the simple parameter to change (Phase 2). 0..1 master knob —
  // presets: EASY ≈ 0.25 (large directional error, often dives wrong), MEDIUM ≈
  // 0.5 (reads the side often), HARD ≈ 0.85 (accurate read, beaten only by true
  // corners thanks to the reach limit). Difficulty is DIRECTIONAL, not timing —
  // the CPU commits on time (it reaches its guess); corners + wrong reads beat it.
  difficulty: 0.5,
  // Zone-guess accuracy is lerp(min,max) by difficulty (chance of reading the
  // right column). Kept modest so well-placed corners beat the keeper.
  guessAccuracyMin: 0.25, // column (left/right) read accuracy, lerp by difficulty
  guessAccuracyMax: 0.85,
  rowAccuracyMin: 0.5, // height (high/low) read accuracy, lerp by difficulty — at
  rowAccuracyMax: 0.9, //  easy it's a coin flip; at hard it usually reads height too
  timingJitterMs: 45, // small ± noise on the CPU's (on-time) commit, so it isn't robotic
  reactionDelay: 160, // ms after the strike before the dive animation starts
  diveDuration: 420, // ms for the dive animation
} as const;

// ─────────────────────────────────────────────────────────────────────────────
// CPU_TAKER (PRD §6) — opponent in solo Keeper mode. (Not wired until M5.)
// ─────────────────────────────────────────────────────────────────────────────
const CPU_TAKER = {
  tellStrength: 0.6, // how obvious the pre-strike body lean is (0..1). Subtle on
  //  purpose: a sharp player reads it, a casual one shoots blind (PRD §6).
  tellLeanMaxRad: 0.4, // body-lean angle at tellStrength=1 (radians) — the visual size of a full tell
  tellLeadTime: 350, // ms the tell (body lean) shows BEFORE the strike
  flightTime: 800, // ms the ball takes to reach the goal = the keeper's reaction
  //  window. Lower this to make Keeper mode harder (less time to read + dive).
  // Relative likelihood the CPU aims at each zone, in ZONE_IDS order
  // (TL,TM,TR,BL,BM,BR) — corners favoured, centre rare, so most shots are
  // genuinely savable by reading the side.
  targetWeights: [1.2, 0.7, 1.2, 1.0, 0.6, 1.0],
  // How hard the CPU strikes (release power 0..1). It hits firmly but not always
  // flat-out, so power varies the keeper's reach shot to shot.
  powerMin: 0.55,
  powerMax: 0.95,
  curveJitter: 0.1, // small random bend (±) so flights are not all dead straight
  onTargetInset: 0.08, // Keeper mode: clamp the CPU's landing this far inside the goal
  //  so it stays on-target (the challenge is saving it, not the CPU spraying wide).
} as const;

// ─────────────────────────────────────────────────────────────────────────────
// KEEPER (PRD §6) — the HUMAN keeper's dive input in solo Keeper mode. (Wired at
// Milestone 5.) A flick's DIRECTION picks the dive zone; its TIMING relative to
// the strike sets reach (resolvePenalty turns the timing into timingQuality).
// ─────────────────────────────────────────────────────────────────────────────
const KEEPER = {
  // Direction → zone. A flick must clear these distances (fractions of the live
  // screen) to commit a side / a high dive; below them it is a centre / low dive.
  diveColThreshFrac: 0.05, // sideways flick (fraction of screen WIDTH) to commit Left/Right
  diveRowThreshFrac: 0.07, // upward flick (fraction of screen HEIGHT) to commit a HIGH dive

  // Timing. The "perfect" dive is committed this many ms AFTER the strike (a
  // human cannot react in 0ms, so the sweet spot sits a beat after the kick).
  // resolvePenalty reads diveTiming where 0 = perfect; we map the real dive to
  // that. Diving earlier (during the tell) or later both drift off-perfect.
  idealReactMs: 130,
  diveDuration: 360, // ms for the player-keeper's dive animation
  readyMs: 550, // a short "set" beat after the ball is placed, before the tell,
  //  so the next shot does not start the instant the previous one ends.

  // Keeper's-eye flight: the ball launches small (far) and GROWS as it rushes the
  // camera (the opposite of the taker view, which shrinks into the distance).
  flightScaleStart: 0.3, // ball scale at the far spot
  flightScaleEnd: 1.25, // ball scale as it reaches the near goal plane
} as const;

// ─────────────────────────────────────────────────────────────────────────────
// RESOLUTION (PRD §7) — weights for the single pure resolvePenalty(). (Not
// wired until Milestone 4.) maxSaveChance < 1 keeps perfect corners unsaveable.
// ─────────────────────────────────────────────────────────────────────────────
const RESOLUTION = {
  // REACH-BASED save model (Phase 2). The keeper's hands travel from goal centre
  // toward the dive target; the ball is saved if it lands within this reach
  // ellipse of where the hands have reached when it arrives. Reach is in
  // NORMALISED goal coords (fraction of goal width / height). It is an ellipse
  // because the goal is wide — these values ≈ a real circular reach, and are
  // tuned SMALLER than the corner distance so the extreme corners are unsaveable
  // (a correct dive still saves most of that side). The PRIMARY tuning knobs.
  reachX: 0.2, // horizontal reach radius around the hands
  reachY: 0.3, // vertical reach radius around the hands
  diveLateWindowMs: 240, // how late a dive can be before the hands never leave
  //  centre (0 = perfect → hands fully reach the target; ≥ this late → stay centre).
  //  This is what makes a save a READ, not a reaction (Phase 2 commit-timing).
  powerReachPenalty: 0.2, // a hard shot shrinks reach by up to this (× power)
  margin: 0.18, // soft save/goal band at the very edge of reach (seeded tie-break)
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
  // Live power meter (Phase 1), pinned in the lower thumb zone while aiming.
  powerMeter: {
    widthFrac: 0.46, // bar width / screen width
    heightFrac: 0.024, // bar height / screen height
    bottomFrac: 0.04, // gap from the bottom edge / screen height
  },
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
  KEEPER,
  RESOLUTION,
  SESSION,
  HAPTICS,
  UI,
  SOUND,
  DEBUG,
} as const;

export type Config = typeof CONFIG;
