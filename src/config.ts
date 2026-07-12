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
  // ── STADIUM / SKY (Track C aesthetic rework) ───────────────────────────────
  // A night match under floodlights: a deep dusk-to-night sky gradient behind
  // banked crowd tiers, so the lit pitch + white goal read as the bright focal
  // point. The gradient runs skyTop (high, near-black indigo) → skyHorizon (a
  // warm glow where the stands meet the pitch).
  skyTop: 0x070b1a, // near-black indigo at the very top
  skyHorizon: 0x223a5e, // lifted, slightly warm blue where the crowd sits
  stadium: 0x0d1b2a, // legacy backstop fill (kept so nothing renders transparent)
  stadiumBand: 0x16344a, // legacy — no longer the main backdrop

  // Crowd — tiers of small 2-tone silhouette cells. Kept DARK + desaturated so
  // the crowd reads as a mass in shadow and never competes with the pitch; a
  // sprinkle of the accent palette per cell gives it life. Brightens on a goal.
  crowdDark: 0x0c1424, // the shaded base of the stand
  crowdCellA: 0x1b2740, // most crowd cells (cool shadow tone)
  crowdCellB: 0x27324d, // a lighter minority (rows catching the lights)
  crowdAccents: [0x2657d6, 0xe5202e, 0x16a34a, 0xf2c14e, 0xcfd8e6], // rare bright specks (flags/shirts)

  // Floodlights — cool-white banks up top with a soft glow pool.
  floodlightPylon: 0x2a3550,
  floodlightLamp: 0xfff6d8,
  floodlightGlow: 0xbfd0ff,

  // Perimeter advertising hoardings — a bright band at the goal line (also the
  // thing a wide/over shot thuds into). Alternating panels in the host palette.
  hoardingBase: 0x0f1830,
  hoardingPanels: [0x14213d, 0x1c2b4d],
  hoardingTrim: 0x3a6ea5,

  // Pitch — a richer, lit-from-above green. A brighter centre pool (under the
  // lights) falling to darker edges is painted on top of the mow stripes.
  pitch: 0x1f8a3b, // grass base (more saturated, "floodlit" green)
  pitchStripe: 0x18762f, // mowed-stripe alternate
  pitchLightPool: 0x33a94e, // the bright pool under the floodlights (centre)
  pitchEdgeShade: 0x125427, // darker toward the edges (vignette on the turf)
  boxLine: 0xf5f5f5, // penalty-box / spot markings

  goalFrame: 0xffffff, // posts + crossbar (front face)
  goalFrameSide: 0xc7d0dc, // the shaded side face that sells the frame's depth
  goalFrameShadow: 0x0a1220, // cast shadow on the ground behind the frame
  net: 0xeaf2ff, // a faintly cool white net under the lights
  zoneLine: 0xffffff, // 3x2 grid lines drawn on the goal mouth

  // Ball modelled on the adidas "Trionda" (FIFA World Cup 2026 official ball):
  // a white ball with three bold colour waves for the host nations + gold.
  ball: 0xffffff, // white base
  ballBlue: 0x2657d6, // USA wave
  ballRed: 0xe5202e, // Canada wave
  ballGreen: 0x16a34a, // Mexico wave
  ballGold: 0xf2c14e, // gold trophy accent
  ballOutline: 0xb8c0c8,

  // Keeper kit — a vivid amber/orange that pops against both the green pitch and
  // the night sky (real keepers wear a colour distinct from both teams). Shaded
  // second tone for simple limb modelling.
  keeperBody: 0xff9e2c, // keeper shirt (bright amber)
  keeperBodyShade: 0xe07d10, // shaded side of shirt/limbs
  keeperShorts: 0x1a2233, // dark shorts
  keeperGloves: 0xf5f7fb, // near-white gloves (were garish yellow)
  keeperGlovesShade: 0xc2ccd8,
  keeperSkin: 0xe8b38a,
  keeperSkinShade: 0xc98f68,

  // CPU taker (Keeper mode) — a crisp red kit so it reads as the "other team".
  takerBody: 0xe4242f,
  takerBodyShade: 0xb3151f,
  takerShorts: 0x141821,
  takerSkin: 0xd79a6e,
  takerSkinShade: 0xb87c52,

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
  outcomePost: 0xffca28, // OFF THE POST! (Track A3) — neither a clean goal nor a save
  woodworkFlash: 0xffffff, // the frame-flash spark on a post/crossbar hit
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
// STADIUM (Track C aesthetic rework) — the procedural night-match backdrop:
// sky gradient, floodlights, banked crowd, perimeter hoardings, pitch lighting.
// Purely presentational; all fractions of the live screen so it scales per device.
// ─────────────────────────────────────────────────────────────────────────────
const STADIUM = {
  // Crowd tiers filling the stand area (sky above the goal line, down to the
  // hoardings). A grid of small cells with seeded per-cell colour variance.
  crowd: {
    rows: 9, // tiers of spectators from the hoardings up toward the sky
    cellFrac: 0.026, // approx cell size as a fraction of screen width
    gapFrac: 0.2, // gap between cells as a fraction of a cell (breathing room)
    accentChance: 0.12, // chance a cell is a bright accent speck (flag/shirt)
    lighterChance: 0.3, // chance a cell uses the lighter (lights-catching) tone
    topFadeRows: 3, // the top N rows fade toward the sky so the stand melts into night
    goalFlashAlpha: 0.5, // extra brightness the whole crowd pulses to on a goal
    goalFlashMs: 260,
  },
  // Floodlight pylons + lamp banks along the top of the stands.
  floodlights: {
    count: 2, // banks (left + right); positioned at these x fractions
    xFracs: [0.2, 0.8],
    lampGlowFrac: 0.13, // glow-pool radius as a fraction of screen width
    lampBankFrac: 0.11, // lamp bank width as a fraction of screen width
  },
  // Perimeter hoardings — a lit ad band sitting on the goal line.
  hoardings: {
    heightFrac: 0.035, // band height as a fraction of screen height
    panelFrac: 0.14, // panel width as a fraction of screen width
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
  // lerps CONFIG.CPU_TAKER.flightTimeSlow→Fast — the reaction window — instead.
  // Both go through resolve.ts kickFlightMs, the ONE flight-time source that the
  // resolution also races the keeper's dive against — Track A2.)
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
  presets: { easy: 0.25, medium: 0.5, hard: 0.85 }, // the selectable difficulty levels
  // Zone-guess accuracy is lerp(min,max) by difficulty (chance of reading the
  // right column). Kept modest so well-placed corners beat the keeper.
  guessAccuracyMin: 0.25, // column (left/right) read accuracy, lerp by difficulty
  guessAccuracyMax: 0.85,
  rowAccuracyMin: 0.5, // height (high/low) read accuracy, lerp by difficulty — at
  rowAccuracyMax: 0.9, //  easy it's a coin flip; at hard it usually reads height too
  timingJitterMs: 45, // ± noise on the commit moment (reactionDelay), so it isn't robotic
  reactionDelay: 160, // ms after the strike the CPU COMMITS its dive. Since Track A2
  //  this is judged too: the hands get (flightMs − reactionDelay) to travel, so a
  //  blasted shot genuinely arrives before them while a soft shot does not.
  diveDuration: 420, // ms for a FULL dive animation (kept = RESOLUTION.diveTravelMs
  //  so the animated dive and the judged hand-travel agree)
} as const;

// ─────────────────────────────────────────────────────────────────────────────
// CPU_TAKER (PRD §6) — opponent in solo Keeper mode. (Not wired until M5.)
// ─────────────────────────────────────────────────────────────────────────────
const CPU_TAKER = {
  tellStrength: 0.6, // how obvious the pre-strike body lean is (0..1). Subtle on
  //  purpose: a sharp player reads it, a casual one shoots blind (PRD §6).
  tellLeanMaxRad: 0.4, // body-lean angle at tellStrength=1 (radians) — the visual size of a full tell
  tellLeadTime: 350, // ms the tell (body lean) shows BEFORE the strike
  // Ball speed BY POWER = your reaction window (Track A2). The CPU's release
  // power (powerMin/Max below) lerps the flight time between these, so a blasted
  // CPU shot gives you visibly less time to read + dive, a soft one more.
  // (Replaces the old fixed flightTime: 800.)
  flightTimeSlow: 900, // ms flight at power 0 (the longest reaction window)
  flightTimeFast: 620, // ms flight at power 1 (the shortest)
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

  // Responsiveness (owner request 2026-07-12): the dive no longer waits for the
  // finger to LIFT — it commits MID-GESTURE the moment the flick has travelled
  // this far (fraction of screen height), so the keeper launches the instant the
  // flick is readable. A shorter/slower drag still commits on release as before.
  // (Judged timing is unchanged either way — it uses the flick's START time.)
  commitDistFrac: 0.11,

  // Timing (Track A4): diveTiming = ms after the strike the flick STARTED, and
  // resolvePenalty races it against the ball's flight — commit while the ball
  // still has ≥ RESOLUTION.diveTravelMs of air time and the hands fully arrive;
  // later commits get proportionally less far. No fixed "sweet spot" any more
  // (the old idealReactMs offset punished dives that visibly completed in time).
  diveDuration: 360, // ms for the player-keeper's dive animation
  readyMs: 550, // a short "set" beat after the ball is placed, before the tell,
  //  so the next shot does not start the instant the previous one ends.

  // Keeper's-eye flight: the ball launches small (far) and GROWS as it rushes the
  // camera (the opposite of the taker view, which shrinks into the distance).
  flightScaleStart: 0.3, // ball scale at the far spot
  flightScaleEnd: 1.25, // ball scale as it reaches the near goal plane
} as const;

// ─────────────────────────────────────────────────────────────────────────────
// RESOLUTION (PRD §7) — weights for the single pure resolvePenalty().
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
  // THE RACE (design-rework Track A2 + A4). The keeper commits a dive
  // `diveTiming` ms after the strike; the hands need diveTravelMs to fully reach
  // the dive target; the ball arrives after the kick's flightMs (faster shot =
  // less travel time). diveProgress = clamp((flightMs − commit) / diveTravelMs).
  // So a BLASTED shot genuinely beats a keeper a soft shot would not (A2), and a
  // dive committed while the ball still has ≥diveTravelMs of air time counts as
  // fully arriving — lateness is judged vs BALL ARRIVAL, not the strike (A4).
  // (Replaces the old strike-anchored diveLateWindowMs, which punished dives
  // that visibly completed before a slow ball arrived, and let the CPU keeper
  // always "get there" regardless of shot speed.)
  diveTravelMs: 420, // hands' travel time centre → dive target (a full dive)
  powerReachPenalty: 0.2, // a hard shot ALSO shrinks reach by up to this (× power)
  margin: 0.05, // soft save/goal band at the very edge of reach (seeded tie-break).
  // Shrunk from 0.18 (Track A5) — now that saves/misses/woodwork all read
  // honestly, a wide hidden coin-flip band was the last "I can't tell why that
  // resolved that way" gap; a thin band still keeps edge-of-reach shots lively.
  // UNSAVEABLE CORNERS (owner request 2026-07-12): a shot that lands inside the
  // extreme-corner window AND was struck with real pace ALWAYS scores — perfect
  // placement + speed together beat any keeper, even a perfect read. The window
  // is checked after the woodwork band (the frame still wins) and the 3x2 zone
  // CENTRES sit outside it, so it takes genuine precision to find — a hard shot
  // also scatters more (INPUT.kPower), which is the risk that pays for the reward.
  corner: {
    xFrac: 0.15, // within this of a post (fraction of goal width)
    yFrac: 0.22, // within this of the crossbar or the ground (fraction of height)
    minPower: 0.6, // pace at/above which a corner-window shot is unstoppable
  },
  postDeflectInChance: 0.15, // Track A3 — a shot that clangs off the woodwork has
  // this small seeded chance of deflecting IN rather than staying out (still
  // pure/deterministic from the kick seed — real shootouts occasionally get this
  // lucky bounce; the frame flash + ping fires either way, see GameScene).
} as const;

// ─────────────────────────────────────────────────────────────────────────────
// SESSION (PRD §9) — scoring. (Not wired until Milestone 6.)
// ─────────────────────────────────────────────────────────────────────────────
const SESSION = {
  kicksPerSession: 5, // penalties per side in regulation (best-of-5)
  // LEGACY (unused since the integrated take-and-save shootout): the opponent's
  // kicks are no longer a simulated dice-roll — you DEFEND them in keeper view, and
  // the real save/goal result feeds the tally. Kept for reference / a possible
  // "quick sim" fallback mode.
  opponentScoreChance: 0.68,
  opponentPaceMs: 650,
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
  // Scoreboard panel — RIGHT-ALIGNED at the top (owner request 2026-07-12) so it
  // shares the top edge with the (smaller, hard-left) debug readout without
  // overlapping. The DBG toggle button tucks in just below it.
  scoreboard: {
    widthFrac: 0.5, // panel width / screen width…
    maxWidthPx: 240, // …capped so it never sprawls on wide screens
    heightPx: 78,
    marginPx: 6, // gap from the top + right screen edges
  },
  outcomeHoldMs: 1200, // how long the GOAL/SAVE/MISS banner stays up
  betweenKicksMs: 250, // small beat before the ball resets for the next kick
  turnBannerMs: 1500, // how long the "YOUR TURN / DEFEND!" break shows between kicks
  viewFadeMs: 170, // fade-through-black when the shootout switches taker↔keeper view
  goalZoomPeak: 1.3, // banner overshoot scale on a GOAL (celebratory pop)
  // (Net feedback moved from a whole-net shake to a localized NetSim ripple punched
  //  at the ball's entry point — see CONFIG.JUICE.net.)
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
// JUICE — game-feel layer (docs/juice-brief.md). Motion, lighting, camera and
// feedback that make the game read as a polished product. PRESENTATION ONLY: none
// of this touches resolvePenalty or the provider-agnostic kick loop. Every effect
// has a tunable intensity and a SUBTLE default — more is not better. Built tier by
// tier; this group grows as tiers land. Tier 1 = net / shadow / camera / hitStop.
// ─────────────────────────────────────────────────────────────────────────────
const JUICE = {
  // ── 1. Dynamic net (NetSim) ──────────────────────────────────────────────
  // A damped-wave membrane: a scored ball punches the nearest nodes, the bulge
  // propagates, overshoots and settles. Keep stiffness < 0.5 for stability.
  net: {
    stiffness: 0.3, // neighbour coupling — how fast a ripple spreads across the net
    springBack: 0.06, // pull each node back toward flat (its natural frequency)
    damping: 0.05, // velocity damping per pass (lower = the net rings longer)
    iterations: 2, // integration passes per frame (more = stiffer/faster waves)
    impulse: 1.8, // base bulge depth (in node-spacing units) at full power
    impactRadiusFrac: 0.22, // gaussian punch radius as a fraction of goal width
    pushXFrac: 0.0, // screen offset per unit z, sideways (0 = straight back)
    pushYFrac: 0.6, // ...and downward, so the bulge billows down + back into goal
    maxBulge: 3.0, // hard clamp on |z| (node-spacing units) — anti-explosion safety
    settleEps: 0.004, // below this depth + velocity everywhere → snap to rest (free)
  },

  // ── 2. Grounded shadows ──────────────────────────────────────────────────
  // A separate soft ellipse under each actor. The ball's shadow scales DOWN and
  // fades as the ball rises (off the ground), and grows/sharpens as it descends.
  shadow: {
    enabled: true,
    groundAlpha: 0.3, // opacity when the actor is on the ground
    minAlpha: 0.06, // opacity at the top of the ball's arc (most "lifted")
    minScale: 0.5, // shadow scale multiplier at the top of the arc
    ballScaleX: 1.9, // ball-shadow width  vs ball radius
    ballScaleY: 0.55, // ball-shadow height vs ball radius (a flat ellipse)
    actorScaleX: 1.4, // keeper/taker shadow width  vs figure width
    actorScaleY: 0.3, // keeper/taker shadow height vs figure width
  },

  // ── 3. Dynamic camera ────────────────────────────────────────────────────
  // ZOOM-ONLY, centred pulses on a goal / save, then ease back to neutral. We do
  // NOT pan toward a focus point (panning shoved content off-frame and read as a
  // lurching camera) and we do NOT zoom on aim/strike (too frequent / jittery).
  // Centred zoom can never crop asymmetrically, so the frame always stays whole.
  camera: {
    enabled: true,
    // NEUTRAL view is pulled back below 1.0 so there's breathing room (pitch +
    // stands) around the goal/box. The scene background is OVERSCANNED to fill the
    // margin (see GameScene.drawBackground) so this never shows empty bars.
    baseZoom: 0.9, // resting zoom (<1 = pulled back; 1.0 = exactly full-screen)
    // goal/save are MULTIPLIERS on baseZoom — the push-in stays gentle and, with
    // baseZoom 0.9, lands around ~0.95 so it never slams to full-screen/too-close.
    goalZoom: 1.06, // celebratory push-in on a goal (× baseZoom)
    saveZoom: 1.05, // push-in on a save (× baseZoom)
    aimZoom: 1.0, // no push-in while aiming (1.0 = no-op)
    strikeZoom: 1.0, // no zoom on the strike (1.0 = no-op)
    moveMs: 260, // zoom-in duration for a beat
    returnMs: 380, // ease back to the neutral (baseZoom) view between kicks
    ease: 'Sine.easeInOut',
  },

  // ── 4. Hit-stop ──────────────────────────────────────────────────────────
  // A micro-freeze (timeScale → 0) at contact, restored on a REAL-time timer so it
  // works even though the game clock is frozen. Short = weight, not lag.
  hitStop: {
    enabled: true,
    strikeMs: 65, // freeze at ball-strike
    saveMs: 90, // freeze when the ball meets the keeper (a save)
  },

  // ── 5. Screen shake (Tier 2) ─────────────────────────────────────────────
  // cameras.main.shake — intensity is a fraction of the viewport. STRIKE shake
  // scales with shot power; SAVE shake is fixed. Default subtle (overdone = nausea).
  shake: {
    enabled: true,
    strikeMin: 0.002, // intensity at minimum power (a soft shot barely shakes)
    strikeMax: 0.009, // intensity at full power (a noticeable but tasteful kick)
    saveAmt: 0.006, // intensity on a save
    durationMs: 180,
  },

  // ── 6. Particles (Tier 2) ────────────────────────────────────────────────
  // Modest bursts at the key moments. Counts kept low for mobile 60fps. Textures
  // are generated procedurally at boot (no asset files).
  particles: {
    enabled: true,
    turfCount: 14, // grass flecks kicked up at the strike point
    netSprayCount: 18, // spray off the net on a goal
    dustCount: 10, // dust puff where a keeper lands a dive
    confettiCount: 90, // confetti on a match win (one-shot)
    grazeCount: 6, // Track B2 — small white spark when a goal only just beats the reach
    turfColors: [0x2f7d33, 0x276b2c, 0x3a8f3f], // grass greens
    dustColor: 0xddcca8, // pale turf dust
    sprayColor: 0xffffff, // white net spray
    confettiColors: [0xe5202e, 0x2657d6, 0x16a34a, 0xf2c14e, 0xffffff], // host-nation palette + white
  },

  // ── 7. Ball trail + spin (Tier 2) ────────────────────────────────────────
  // A follow-emitter motion trail behind the ball in flight, plus power-scaled
  // spin. Harder shots = denser/longer trail and faster spin.
  trail: {
    enabled: true,
    lifespan: 180, // afterimage lifespan (ms) — how long the streak lingers
    frequencyMin: 26, // ms between emits at low power (sparser trail)
    frequencyMax: 9, // ...at high power (denser trail)
    scaleStart: 0.6, // trail-dot start scale (the 'pSoft' texture is 16px)
    spinMin: 0.7, // ball spinTurns multiplier at low power
    spinMax: 1.9, // ...at high power (faster visible spin)
    color: 0xfff2cc, // warm white/gold streak
  },

  // ── 8. Slow-motion replay (Tier 3) ───────────────────────────────────────
  // After a corner goal / a save, re-simulate the resolved shot at a slowed flight
  // speed from a tight, dramatic camera. Tap anywhere to skip. Presentation-only —
  // it re-runs the SAME deterministic flight, never re-resolves.
  // Re-enabled with a BLINKING "REPLAY" badge so it's unmistakable when a replay is
  // running (vs the live game). The badge blink + clear turn breaks address the
  // earlier "feels like it's auto-playing" confusion.
  replay: {
    enabled: true,
    slowFactor: 2.6, // flight-duration multiplier (higher = slower replay)
    zoom: 1.18, // gentle push-in for the replay camera (zoom-only, no pan)
    inMs: 520, // ease-in time for the replay framing + label
    holdMs: 420, // hold on the final frame before returning to play
    onCornerGoals: true, // replay a taker goal struck into a corner
    onSaves: true, // replay a keeper-mode save
  },

  // ── 9. Post-processing grade (Tier 3) ────────────────────────────────────
  // WebGL-only camera FX (vignette + restrained floodlight bloom + a subtle colour
  // grade) for one cohesive look. Gracefully no-ops on the Canvas renderer. Keep
  // bloom LOW — heavy bloom reads cheap.
  // NOTE: camera bloom blooms the WHOLE bright frame (the pitch + white goal), not
  // just the floodlights — that read as a hazy wash. So bloom is OFF; we keep only
  // a very subtle vignette + a near-neutral grade. (A future pass can bloom JUST a
  // dedicated floodlight object via its own FX instead of the whole camera.)
  grade: {
    enabled: true,
    vignetteStrength: 0.22, // gentle edge darkening only (no haze)
    vignetteRadius: 0.9, // reaches only the very corners
    bloomStrength: 0.0, // OFF — full-frame bloom hazed everything
    bloomBlur: 1.1, // (unused while bloomStrength = 0)
    saturate: 1.03, // a whisper more colour
    brightness: 1.0, // unchanged
    floodlights: false, // off — they only existed to give the (now-removed) bloom a source
  },

  // ── 10. UI / transition juice (Tier 3) ───────────────────────────────────
  // No hard cuts: eased entrances, count-up score, tactile button press states.
  ui: {
    pressScale: 0.92, // button scale on press-down
    releaseMs: 220, // bounce-back time on release (Back.easeOut)
    endInMs: 360, // end-screen element entrance time
    endStaggerMs: 110, // delay between staggered end-screen elements
    countUpMs: 650, // final-score count-up duration
    scorePopScale: 1.18, // scoreboard pop scale when the score changes
    scorePopMs: 260,
  },

  // ── 11. Keeper parry/catch language (Track B1) ───────────────────────────
  // A save's ANIMATION differs by how comfortable it was: a central save is a
  // CATCH (squash + hold, no rebound); a stretching reach save is a PUNCH/PARRY
  // (the existing outward deflect). Read from resolvePenalty's `reachMargin`
  // (≤1 = inside reach; smaller = more central/comfortable).
  parry: {
    catchReachMargin: 0.45, // ellipse value at/below which a save reads as a catch
    catchSquashX: 1.16, // ball squash on catching (wider)
    catchSquashY: 0.82, // ...and flatter
    catchMs: 160, // squash + recover duration
    vanishMs: 170, // keeper view (owner request 2026-07-12): after a save settles,
    // the ball fades into the gloves (smothered) instead of lying in the box
    grazeReachMargin: 1.5, // Track B2 — a GOAL this close to reach still shows a
    // fingertip graze (small spark) even though it wasn't saved
  },

  // ── 12. Honest misses (Track B3) ─────────────────────────────────────────
  // A miss never just freezes in empty space: an over-the-bar shot keeps sailing
  // away into the crowd (shrinking); a wide shot thuds to a stop against the
  // hoarding (a firm squash, not a silent freeze).
  miss: {
    overExtraFrac: 0.35, // extra travel (fraction of screen height) as it sails away
    overShrinkTo: 0.4, // ball scale multiplier as it vanishes into the stands
    overMs: 260,
    wideThudMs: 140,
  },

  // ── 13. Tension staging (Track B5) ───────────────────────────────────────
  // Presentation-only contrast so the payoff moments hit harder. The pre-kick
  // hush rides the CPU taker's existing tell window in keeper view (adds zero
  // extra latency — no hush on the human's OWN taker kick, which would just
  // read as input lag). High-stakes (sudden death / the last regulation kick)
  // tightens the default framing + deepens the vignette + pulses the score dots.
  tension: {
    enabled: true,
    hushAlpha: 0.16, // pre-kick dim overlay during the CPU's tell (keeper view only)
    suddenDeathZoomMult: 0.94, // × the normal baseZoom once it's high-stakes
    suddenDeathVignette: 0.4, // deeper edge darkening once it's high-stakes
  },
} as const;

// ─────────────────────────────────────────────────────────────────────────────
// DEBUG (PRD §11) — the mandatory tuning overlay (architecture RULE 2).
// ─────────────────────────────────────────────────────────────────────────────
const DEBUG = {
  enabledByDefault: true, // show the overlay on load during development
  toggleKey: 'D', // keyboard toggle (desktop)
  showZoneLabels: false, // draw the faint 3x2 grid + TL/TM/… letters on the goal.
  //  Off for the polished look; flip on as a tuning aid. Track C.
  showAimGuide: false, // draw the aim line / crosshair reticle / scatter ring /
  //  zone highlight while aiming. OFF for real play (owner, 2026-07-12: a visible
  //  aim guide feels like a cheat — the swipe itself is the skill). Everything
  //  still COMPUTES exactly as before (overlay + resolution read the same aim);
  //  only the drawing is gated. Flip on as a tuning aid.
} as const;

// Single exported object — import { CONFIG } and read CONFIG.<group>.<value>.
export const CONFIG = {
  GAME,
  COLORS,
  GEOMETRY,
  STADIUM,
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
  JUICE,
  DEBUG,
} as const;

export type Config = typeof CONFIG;
