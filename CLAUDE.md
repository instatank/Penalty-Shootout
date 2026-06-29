# CLAUDE.md — Penalty Shootout

Project guide for AI sessions. Keep it short. Read `penalty-shootout-PRD-v2.md` for the full spec — it is the source of truth.

## What this is
A mobile-first PWA penalty-shootout game that is **responsive in both orientations**. **Portrait is the primary/best-looking view** (one-handed phone play — Phase 0 of the new phased plan, 2026-06-29, overriding the earlier landscape-primary call); landscape still works. The whole game lives or dies on **swipe feel**. Ships in two stages:
- **Stage 1 (Milestones 1–7):** complete single-player game, both modes vs CPU.
- **Stage 2 (Milestone 8):** online 2-player over room codes, added on top with no rewrite.

## Plan re-review (owner, 2026-06-29) — now tracking a phased plan
The owner is re-reviewing the build against a fresh **phase-wise** plan (inspired by existing apps), replacing the milestone framing going forward. Rule: **on any clash, the new plan wins.** Phases arrive one at a time. Decisions locked so far:
- **Phase 0 (scaffold & static scene):** already satisfied by M1–M5. Reconciliation decisions — **keep TypeScript** (not the plan's "vanilla JS"; no rewrite, builds/deploys identically); **keep the keeper's-eye camera** for Keeper mode (Taker stays behind-the-taker — the plan's "behind-the-taker everywhere" does NOT override the recent keeper's-eye decision); **portrait-primary** (both orientations supported).
- **Phase 1 (taker shot mechanic): DONE (awaiting owner playtest ⏸).** Most of it already existed (M2–M4: drag-aim + live aim indicator + power-scatter + arced depth flight + reset). Phase 1 added/sharpened: (1) **power → ball speed** — taker flight time lerps CONFIG.FLIGHT.flightDurationSlow→Fast by power; (2) a **live power meter** (CONFIG.UI.powerMeter) that fills green and shows a red overshoot past the accuracy threshold; (3) a **threshold-based power/accuracy tradeoff** — `aim.scatterRadius()` stays at baseError until CONFIG.INPUT.powerAccuracyThreshold, then grows by kPower·excess^scatterExponent (overrides PRD §5's linear scatter); (4) `aim.shotOutcome()` → on-target/wide/over, shown in the debug overlay. **Power model reconciliation:** Phase 1's "distance/speed = power" is kept as **release speed (velocity)** — it matches the acceptance ("fast drags") and is the only model that frees both aim axes from one 2D drag. To switch to pull-distance charging instead, that's a separate change (aim height would need a new source). Tuning knobs: INPUT.kPower/powerAccuracyThreshold/scatterExponent, FLIGHT.flightDurationSlow/Fast.

## Stack (decided — do not substitute without asking the owner)
- **Phaser 3.x** (pinned to 3.90.0). **NOT Phaser 4.**
- **TypeScript + Vite.** Build is type-checked (`tsc --noEmit`) then bundled by Vite.
- **Vercel** hosting. **PWA** (Milestone 7). **Responsive**: Scale.RESIZE fills the screen; `game/layout.ts` computes a pixel layout from proportional config for the live size + orientation (portrait & landscape profiles). No fixed design-space pixels.
- **Firebase** Realtime DB + anonymous auth — **Milestone 8 ONLY.** Do not add Firebase before then.

## Non-negotiable architecture rules
These make later milestones cheap. Get them right; do not shortcut them.

1. **One `src/config.ts`** holds every feel/tuning constant as a plain typed object. **No magic numbers anywhere else.** Grouped + commented by system (PRD §11).
2. **Toggleable debug overlay** (`src/ui/DebugOverlay.ts`) prints live derived values (swipe vector, power, curve, errorRadius, target/landing zone, and later keeper zone + timing + save/goal). Mandatory — it is how the owner tunes feel. Toggle key + on-screen button.
3. **Input uses Pointer Events** with `setPointerCapture()` and `touch-action: none` on the canvas. Sample the swipe path as `{x,y,t}` points. Power = release velocity over the last ~80ms (`velocityWindowMs`), **not** whole-gesture average. (PRD §4.)
4. **`resolvePenalty()` is one pure, deterministic function** (PRD §7). Both taker and keeper actions flow through a shared **`InputProvider` interface** (PRD §8). The game loop must **never** branch on "CPU vs human." This is what lets online drop in later without a rewrite.

## File structure
```
index.html              # touch-action:none, viewport pinned (position:fixed) for stable rotation
vite/config.dev.mjs     # dev server
vite/config.prod.mjs    # production build (Vercel-ready)
src/
  main.ts               # boots the Phaser game
  config.ts             # RULE 1 — all tuning constants, grouped by system
  input/
    SwipeInput.ts       # RULE 3 — Pointer Events + capture + {x,y,t} sampling; deriveSwipe()
    providers.ts        # RULE 4 — InputProvider interface + LocalHumanProvider + CpuProvider
  game/
    main.ts             # Phaser.Game config (Scale.RESIZE, scene list)
    viewport.ts         # robust full-screen sizing across orientation changes
    layout.ts           # responsive layout: computeLayout(w,h) -> pixel positions
    aim.ts              # swipe → target/zone; finalizeShot() builds the TakerInput (seeded landing)
    resolve.ts          # RULE 4 — pure deterministic resolvePenalty() + seededRandom (no Phaser)
    zones.ts            # 3x2 zone grid: ids, rects, centers (take goal rect; shared by render + resolve)
    scenes/
      GameScene.ts      # the pitch + provider-driven kick loop + keeper dive + outcome
  audio/
    Sfx.ts              # procedural Web Audio crowd cheer/groan (no asset files)
  ui/
    DebugOverlay.ts     # RULE 2 — toggleable live value readout
```

## Build / run
- `npm run dev` — local dev server (Vite, port 8080).
- `npm run build` — type-check + production bundle to `dist/` (deploy this to Vercel).
- `npm run preview` — serve the production build locally.

## Process rules
- Follow PRD §13 build order **exactly**. Build ONE milestone at a time.
- **Stop at every ⏸ checkpoint** and ask the owner to playtest before continuing.
- Owner is non-technical: clear, well-commented code; explain decisions in plain language.

## Current status
- **Milestone 1 — Scaffold + static scene: COMPLETE.** Responsive scene, both orientations. (Plus an orientation-resize bugfix: game/viewport.ts.)
- **Milestone 2 — Input layer + debug overlay: COMPLETE.**
  Raw Pointer Events with setPointerCapture + {x,y,t} path sampling (input/SwipeInput.ts). deriveSwipe() → vector, power (release velocity over velocityWindowMs, resolution-independent), signed curve. Live overlay + aim reticle/ring/zone highlight.
  AIM MODEL (game/aim.ts, CONFIG.AIM): decoupled & distance-driven — sideways swipe distance sets the column, upward swipe distance sets the height (short flick = bottom row, long flick = top row). All six zones reachable. reachX/reachLow/reachHigh are the calibration knobs.
- **Milestone 3 — Ball flight: COMPLETE (in owner playtest — the big "is the feel good?" ⏸ checkpoint).**
  On release the ball launches from the spot along an arc (CONFIG.FLIGHT.arcHeightFrac) with a SUBTLE curve (penalties barely bend — owner note; maxCurve 0.25, small curveGain), shrinking scaleStart→scaleEnd for fake depth, landing at aim target + small power-based scatter (Math.random for now; M4 makes it seeded in resolvePenalty). Haptic kick buzz. Resets after FLIGHT.resetDelay. NO keeper / save-goal yet (M4). Movable ball is its own object; pitch stays static.
- **Milestone 4 — Taker mode complete: COMPLETE (owner playtested + iterated).**
  InputProvider interface (input/providers.ts): LocalHumanProvider (live swipe → seeded TakerInput via aim.finalizeShot) + CpuProvider keeper (dive zone+timing scaled by CONFIG.CPU_KEEPER.difficulty). GameScene runs a provider-driven kick loop that NEVER branches CPU/human (the M8 keystone): aim → CPU keeper dive → resolve → GOAL/SAVE/MISS banner → reset. The loop uses abortable awaitable tweens/timers and survives orientation changes (LocalHumanProvider.cancel() resolves the pending taker promise with null so the loop can't deadlock — this WAS a real bug, keep it).
  **RESOLUTION MODEL (game/resolve.ts) — revised after playtest to GEOMETRIC + deterministic** (replaced the PRD §7 probabilistic saveChance, which felt random and made everything a goal): the keeper saves when the ball lands inside its dive REACH — an ellipse (CONFIG.RESOLUTION.reachX/reachY in normalised goal coords) around result.keeperNorm, shrunk by poor timing (timingFloor) and by power (powerReachPenalty); a thin seeded `margin` band decides edge-of-reach shots. Outcome now matches the visible ball↔keeper interaction. Still pure + deterministic (same inputs+seed ⇒ same result) so online replay (M8) is unaffected. resolvePenalty returns keeperNorm so the scene dives the keeper to the SAME point it judged.
- **Aesthetic pass (owner requests, on top of M4):** net shakes on a goal only; celebratory banner zoom (small→pop, goal pulses) + procedural crowd cheer (goal)/groan (save/miss) in audio/Sfx.ts; ball restyled as the adidas "Trionda" (FIFA WC 2026) — white with 3 colour waves (USA blue, Mexico green, Canada red) + gold, spins in flight. Landscape ball radius enlarged to match portrait.
- **Milestone 5 — Keeper mode: COMPLETE (awaiting owner playtest ⏸).**
  Both provider stubs are filled; the SAME loop runs Keeper mode by SWAPPING which provider is taker/keeper — resolvePenalty() and the loop's provider-agnostic shape are untouched (the M8 keystone). Mode is just a field-swap (GameScene.setMode): Taker = human taker + CPU keeper; Keeper = CPU taker + human keeper.
  • **KEEPER'S-EYE CAMERA (owner decision 2026-06-27):** Keeper mode swaps the camera to behind the keeper looking OUT — the taker is far + small, the ball is kicked TOWARD you and GROWS (CONFIG.KEEPER.flightScaleStart→End), and you (big, foreground, back view) dive to save. It is a SECOND camera, not a logic change: `computeLayout(w,h,'keeper')` makes the near foreground plane the `goal` rect, and because that rect is what's handed to resolvePenalty + zones, ALL the normalised-coord math (landing, dive zone, keeperNorm) is reused unchanged — only the pixels move. GameScene.rebuild() branches on mode (keeper view: no far goal/grid/net, a subtle near-goal frame instead; grow-flight; far taker / big foreground keeper). Taker mode is untouched. CONFIG.GEOMETRY.keeperView holds the layout; figure widths are DERIVED from height (keeperAspect/takerAspect) so they stay human-proportioned in portrait too. The CPU taker's landing is clamped on-target (CONFIG.CPU_TAKER.onTargetInset) so Keeper mode is about saving, not gifted CPU misses.
  • `CpuProvider.getTakerInput()` commits a seeded {targetZone (weighted, corners-favoured), power, curve} → TakerInput via the shared scatter helper `aim.landShot`/`cpuShot` (CONFIG.CPU_TAKER). `finalizeShot` now also routes through landShot — one scatter rule for human + CPU.
  • `LocalHumanProvider.getKeeperInput()` asks the scene (via an `onAwaitKeeper` hook — providers stay Phaser-free) to PRESENT the shot, then captures the human's dive via `submitDive`. The scene (GameScene.beginKeeperReaction) plays: ready beat → subtle body-lean **tell** on a red CPU striker (CONFIG.CPU_TAKER.tellStrength/tellLeadTime/tellLeanMaxRad) → strike → ball flight over `flightTime` (the reaction window). A dive flick → {diveZone (aim.computeDive: sideways flick = column, up = high row), diveTiming} measured vs the strike (CONFIG.KEEPER). No dive = a frozen centre stance (you concede unless it's hit straight at you). The dive window resolves at flight-end so the full flight always plays before the outcome.
  • Outcome feedback FLIPS by mode (showOutcome.playerWon): in Keeper mode a **save** is the player's win (cheer + celebratory pop), a goal is conceded (groan). Net shake still fires on any physical goal. `result.saved` = player succeeded (M6 scores saves).
  • Minimal **MODE: TAKE/SAVE** toggle button (lower-left thumb zone) + "M" key swaps modes live; full Splash→Mode-select menu is M6 (§12).
  • NOTE for tuning: timing currently bites softly because CONFIG.RESOLUTION.timingFloor (0.72) is shared with Taker mode — a correct-DIRECTION dive saves even with mediocre timing. If the owner wants timing to matter MORE in Keeper mode, lower timingFloor / shorten flightTime (both also affect Taker feel — judge the trade-off at playtest).

## Follow-ups / open notes (carry forward)
- **Sound effects are placeholder** (procedural Web Audio). Owner wants them replaced with better/real crowd samples later. Toggle: CONFIG.SOUND.
- iOS Safari has **no Vibration API** — haptics only fire on Android. iOS haptic is a possible M7 experiment (fragile switch-element hack).
- Vercel hosting: owner is connecting the GitHub repo themselves (auto-deploys on push to the working branch). vercel.json is set.
- Dev-only test hooks: GameScene exposes `window.__penalty.resolvePenalty`, `window.__penalty.getState()` (live {mode,state,diveCaptured}), `window.__penalty.setMode(m)`, plus `window.__lastResult`/`__lastAim`/`__lastTaker` under import.meta.env.DEV (stripped from prod) — handy for headless verification. Headless caveat: Phaser timers run on the rAF/game clock (throttled without a display) while swipe timestamps are wall-clock, so dive-timing numbers look off headless but align on-device.

## Milestone 6 — Sessions + scoring + practice (NEXT). PRD §9 + §13.6
M5 (Keeper mode) is done. Next: a 5-kick session per mode (Taker counts goals, Keeper counts saves), an end screen with result + restart, and a Practice mode (unlimited, no score). This is where the minimal MODE toggle grows into the real Splash → Mode-select (Take / Save / Practice) menu (§12). Do NOT change resolvePenalty or the loop's provider-agnostic shape.
- ⏸ As always: stop at the checkpoint for owner playtest. Update this file when done.
