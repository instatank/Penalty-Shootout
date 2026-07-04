# CLAUDE.md — Penalty Shootout

Project guide for AI sessions. Keep it short. Read `penalty-shootout-PRD-v2.md` for the full spec — it is the source of truth.

## What this is
A mobile-first PWA penalty-shootout game that is **responsive in both orientations**. **Portrait is the primary/best-looking view** (one-handed phone play — Phase 0 of the new phased plan, 2026-06-29, overriding the earlier landscape-primary call); landscape still works. The whole game lives or dies on **swipe feel**. Ships in two stages:
- **Stage 1 (Milestones 1–7):** complete single-player game, both modes vs CPU.
- **Stage 2 (Milestone 8):** online 2-player over room codes, added on top with no rewrite.

## Shared playbook (cross-project — read at session start)

The single source of truth for global working rules, transferable lessons, and the ship / verify SOPs is the **`playbook/` folder of `instatank/time-tracker`** (`PLAYBOOK.md` first). Read `/home/user/time-tracker/playbook/PLAYBOOK.md` if that repo is cloned in this environment; otherwise fetch it via GitHub `get_file_contents` (repo `instatank/time-tracker`, path `playbook/PLAYBOOK.md`). Before ending a session that shipped commits, run the **`/wrap`** skill (a Stop hook nudges once if forgotten) — it reconciles `HANDOFF.md` + this file's "Current status" against reality, appends friction cards to `LEARNINGS.md`, and asks the founder the learning questions from `playbook/LEARNING_METHOD.md`. Pre-push ritual = the **`/ship`** skill.

## Plan re-review (owner, 2026-06-29) — now tracking a phased plan
The owner is re-reviewing the build against a fresh **phase-wise** plan (inspired by existing apps), replacing the milestone framing going forward. Rule: **on any clash, the new plan wins.** Phases arrive one at a time. Decisions locked so far:
- **Phase 0 (scaffold & static scene):** already satisfied by M1–M5. Reconciliation decisions — **keep TypeScript** (not the plan's "vanilla JS"; no rewrite, builds/deploys identically); **keep the keeper's-eye camera** for Keeper mode (Taker stays behind-the-taker — the plan's "behind-the-taker everywhere" does NOT override the recent keeper's-eye decision); **portrait-primary** (both orientations supported).
- **Phase 3 (full shootout loop, Taker vs AI): DONE (awaiting owner playtest ⏸).** New pure state machine `game/shootout.ts` (createShootout/recordKick) drives a best-of-5 ALTERNATING shootout with **early clinch** + **sudden death** + winner — engine-free, reused by Phase 4/6. GameScene now runs a **session controller**: Taker mode = a full shootout (`runShootout`), Keeper mode = free practice (`runPractice`); a `session` counter cleanly stops/restarts loops on mode-switch / play-again. Player kicks reuse the existing shot flow; the **AI opponent's** kicks are simulated to a tally (`SESSION.opponentScoreChance`) with a simple ball+keeper sequence. Persistent **scoreboard** (score + per-kick green/red dots + round / "SUDDEN DEATH"), **Win/Lose end screen** with final score, **Play Again** (tap the end screen → full reset, no state leaks). Difficulty is selectable via a bottom-right EASY/MED/HARD button (CPU_KEEPER.presets). Verified headless: clinch/SD/reset logic, full playthrough to a decided result, Play Again reset. Knobs: SESSION.opponentScoreChance/kicksPerSession, CPU_KEEPER.difficulty.
  - **⚠️ Input bugfix (important, keep it):** `SwipeInput` previously called `setPointerCapture` + `e.preventDefault()` on the pointer stream, which silently **starved Phaser's own input** — every on-screen button (DBG, MODE, difficulty, Play Again) was dead for real users. Fixed: the gesture now starts on the canvas but is tracked on the **window** (no capture), and we **do NOT preventDefault** (scroll is already blocked by `touch-action:none` in index.html). Phaser GameObject buttons + scene input now work. Do not re-add capture/preventDefault to SwipeInput.
- **Phase 2 (resolution core & keeper logic): DONE (awaiting owner playtest ⏸).** Reworked `resolvePenalty` to Phase 2's exact **hands-at-arrival reach model** (replaces the old reach-shrink/timingFloor model): the keeper's hands travel from goal CENTRE toward the dive target; `diveProgress = 1 − max(0,diveTiming)/RESOLUTION.diveLateWindowMs` (early/on-time = fully there, late = hands stay near centre); save if the ball lands within the reach ellipse (RESOLUTION.reachX/reachY, shrunk a touch by power) of the hands' arrival point. Tuned reach SMALLER so a correct dive saves most of a side but the **extreme corner is unsaveable**; a resting/late keeper keeps a small **central** reach (centre saveable, but punished against a committed diving keeper). Still pure + deterministic (keystone). AI keeper: difficulty is a single 0..1 DIRECTIONAL knob (commits ON TIME via timingJitterMs; beaten by wrong reads + corners) — column read = guessAccuracyMin/Max, height read = rowAccuracyMin/Max, both lerp by difficulty (presets EASY 0.25 / MED 0.5 / HARD 0.85). Verified headless: correct dive saves the zone but corner = goal; centre punished vs diver, saved vs rester; late dive can't reach; EASY 2/12 vs HARD 12/12 saves on a readable shot (corners still beat HARD). Keeper's-eye mode now has timing that bites (read-not-react). Dev hook: `__penalty.setKeeperDifficulty(0..1)`. Tuning knobs: RESOLUTION.reachX/reachY/diveLateWindowMs/powerReachPenalty, CPU_KEEPER.difficulty/guessAccuracy*/rowAccuracy*.
- **Phase 1 (taker shot mechanic): DONE (awaiting owner playtest ⏸).** Most of it already existed (M2–M4: drag-aim + live aim indicator + power-scatter + arced depth flight + reset). Phase 1 added/sharpened: (1) **power → ball speed** — taker flight time lerps CONFIG.FLIGHT.flightDurationSlow→Fast by power; (2) a **live power meter** (CONFIG.UI.powerMeter) that fills green and shows a red overshoot past the accuracy threshold; (3) a **threshold-based power/accuracy tradeoff** — `aim.scatterRadius()` stays at baseError until CONFIG.INPUT.powerAccuracyThreshold, then grows by kPower·excess^scatterExponent (overrides PRD §5's linear scatter); (4) `aim.shotOutcome()` → on-target/wide/over, shown in the debug overlay. **Power model reconciliation:** Phase 1's "distance/speed = power" is kept as **release speed (velocity)** — it matches the acceptance ("fast drags") and is the only model that frees both aim axes from one 2D drag. To switch to pull-distance charging instead, that's a separate change (aim height would need a new source). Tuning knobs: INPUT.kPower/powerAccuracyThreshold/scatterExponent, FLIGHT.flightDurationSlow/Fast.

## Juice & game-feel track (owner design brief, 2026-06-29 — parallel to phases)
A separate **presentation-only** polish pass the owner requested, built in three tiers.
Full brief: `docs/juice-brief.md`; build plan + live status: `docs/juice-plan.md`.
**Nothing here touches `resolvePenalty` or the provider-agnostic kick loop** — it reads
results, never feeds them (online-replay determinism stays intact). All knobs live in
**`CONFIG.JUICE`** (RULE 1). Build tier by tier; stop at each ⏸ for owner playtest.
- **Tier 1 — DONE (awaiting owner playtest ⏸).** (1) **Dynamic net** — new pure
  `game/net/NetSim.ts` damped-wave spring grid; a scored ball `punchNet`es the entry
  point and the bulge propagates/overshoots/settles, rendered by redrawing the existing
  hatch lines through the displaced nodes (only steps while it has energy → free at rest;
  at rest it's pixel-identical to the old net). Replaces the old whole-net `shakeNet`.
  (2) **Grounded shadows** — one soft blurred-ellipse texture under ball + keeper + taker;
  the ball's shadow shrinks + fades with arc height (driven from `flyBall` onUpdate), the
  keeper's slides with a dive. Replaces the static baked `drawBallShadow`. (3) **Dynamic
  camera** — `cameraBeat(aim|strike|goal|save)` + `resetCamera`: eased push-ins/framing
  that react per outcome, snap to neutral on resize/mode-switch (UI pinned
  `scrollFactor(0)` so it never drifts; swipe aim is screen-space so zoom doesn't affect
  it). (4) **Hit-stop** — `timeScale→0` micro-freeze at strike + save, restored on a
  REAL-time `setTimeout` (the game clock is frozen during the freeze), with
  `abortAll`/SHUTDOWN guards so a resize mid-freeze can't deadlock. **NOTE: deliberately
  NO hit-stop on the keeper-mode strike** — the human dive timing is wall-clock and a
  freeze would desync the read-and-react window. Verified: `npm run build` clean +
  headless (net ripples→settles, freeze fires + always restores, taker↔keeper switches
  clean, no errors). Dev hooks added: `__penalty.getTimeScale()`, `__penalty.getNetEnergy()`.
- **Tier 2 — DONE (awaiting owner playtest ⏸).** (5) **Screen shake** —
  `cameras.main.shake`, STRIKE intensity scales with shot power, fixed SAVE shake;
  subtle defaults (`CONFIG.JUICE.shake`). (6) **Particles** — procedural soft-dot +
  rect textures (no asset files) feeding four emitters: turf flecks at the strike
  point, white net spray on a goal, a dust puff where a keeper lands a dive, and a
  one-shot confetti burst (screen-pinned) on a match win (`CONFIG.JUICE.particles`,
  counts kept low for mobile). (7) **Ball trail + spin** — a follow-emitter motion
  streak whose density scales with power, plus `flyBall` spin rate scaled by power
  (`CONFIG.JUICE.trail`). `flyBall` now takes an `{power}` opt driving spin + trail.
  **NO strike shake in keeper mode on purpose** (same reason as the hit-stop skip —
  it would spoil the wall-clock read). Verified: build clean + headless (all five
  emitters fire at configured counts, timeScale restored, taker+keeper clean, no
  errors). Dev hooks: `__penalty.getParticleCounts()`, `burstConfetti()`.
- **Tier 3 — DONE (awaiting owner playtest ⏸).** (8) **Slow-mo replay** — after a
  taker goal into a CORNER or a keeper SAVE, `playReplay` re-simulates the SAME
  deterministic flight at a slowed duration (NOT timeScale — keeps hit-stop isolated)
  from a tight `cameraReplay` push-in, with a "▶ REPLAY" badge; **tap anywhere to
  skip** (real pointer → scene input); fully abort/epoch-safe. (9) **Post-FX grade**
  — `applyPostFX` adds vignette + restrained floodlight **bloom** + a subtle colour
  grade to the main camera (WebGL only; graceful no-op on Canvas); `drawFloodlights`
  paints bright banks for the bloom to sit on. **Phaser 3.90 gotcha:** camera *post*
  FX live in `camera.postPipelines` (FX.add → setPostPipeline), NOT `postFX.list`.
  (10) **UI transition juice** — eased + staggered end-screen entrance with a
  **count-up** final score, **button press states** (scale-down + bounce on
  MODE/difficulty/Play-Again), and a scoreboard **pop** when the score changes.
  Knobs: `CONFIG.JUICE.replay/grade/ui`. Verified: build clean + headless (replay
  fires/skips, 3 post-FX pipelines, end screen animates, timeScale restored, taker+
  keeper clean, no errors). Dev hooks: `getRenderer()`, `getPostFXCount()`,
  `isReplaying()`.
- **Juice track COMPLETE** (all three tiers ⏸ awaiting a combined owner playtest).

## Stack (decided — do not substitute without asking the owner)
- **Phaser 3.x** (pinned to 3.90.0). **NOT Phaser 4.**
- **TypeScript + Vite.** Build is type-checked (`tsc --noEmit`) then bundled by Vite.
- **Vercel** hosting. **PWA** (Milestone 7). **Responsive**: Scale.RESIZE fills the screen; `game/layout.ts` computes a pixel layout from proportional config for the live size + orientation (portrait & landscape profiles). No fixed design-space pixels.
- **Firebase** Realtime DB + anonymous auth — **Milestone 8 ONLY.** Do not add Firebase before then.

## Non-negotiable architecture rules
These make later milestones cheap. Get them right; do not shortcut them.

1. **One `src/config.ts`** holds every feel/tuning constant as a plain typed object. **No magic numbers anywhere else.** Grouped + commented by system (PRD §11).
2. **Toggleable debug overlay** (`src/ui/DebugOverlay.ts`) prints live derived values (swipe vector, power, curve, errorRadius, target/landing zone, and later keeper zone + timing + save/goal). Mandatory — it is how the owner tunes feel. Toggle key + on-screen button.
3. **Input uses Pointer Events** + `touch-action: none` on the canvas (index.html). Gesture STARTS on the canvas, is TRACKED on the `window`, and does **NOT** use `setPointerCapture` or `preventDefault` — both starve Phaser's own input and silently kill every on-screen button (learned the hard way in Phase 3; see the bugfix note below). Sample the swipe path as `{x,y,t}` points. Power = release velocity over the last ~80ms (`velocityWindowMs`), **not** whole-gesture average. (PRD §4.)
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
    SwipeInput.ts       # RULE 3 — Pointer Events (canvas down, window move/up; NO capture/preventDefault); deriveSwipe()
    providers.ts        # RULE 4 — InputProvider interface + LocalHumanProvider + CpuProvider
  game/
    main.ts             # Phaser.Game config (Scale.RESIZE, scene list)
    viewport.ts         # robust full-screen sizing across orientation changes
    layout.ts           # responsive layout: computeLayout(w,h,view) -> pixel positions (taker + keeper'-eye cameras)
    aim.ts              # swipe → target/zone; scatterRadius/landShot/finalizeShot/cpuShot/computeDive/shotOutcome
    resolve.ts          # RULE 4 — pure deterministic resolvePenalty() + seededRandom (no Phaser)
    shootout.ts         # Phase 3 — pure best-of-5 shootout state machine (clinch/sudden-death); no Phaser
    net/NetSim.ts       # Juice Tier 1 — pure damped-wave net spring grid (punch/step/point); no Phaser
    zones.ts            # 3x2 zone grid: ids, rects, centers (take goal rect; shared by render + resolve)
    scenes/
      GameScene.ts      # the pitch + session controller (runShootout/runPractice) + kick loop + scoreboard/end screen
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
- **We now track the owner's phased plan** (see "Plan re-review" above), NOT the old PRD milestone order. The owner sends ONE phase at a time; build only that phase. **On any clash with the PRD/earlier work, the new plan wins** — but flag genuine conflicts and surface anything destructive before doing it.
- **Stop at every ⏸ checkpoint** and let the owner playtest before continuing. Update this file + HANDOFF.md when a phase lands.
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
- Dev-only test hooks (under import.meta.env.DEV, stripped from prod): `window.__penalty` = { resolvePenalty, createShootout, recordKick, getState() → {mode,state,diveCaptured}, getShootout(), setMode(m), setKeeperDifficulty(0..1), forceEnd() }, plus `window.__lastResult`/`__lastAim`/`__lastTaker`. Handy for headless verification.
- **Headless test gotchas (important):** (1) Phaser **GameObject buttons + scene input only fire for REAL/CDP events — use Playwright `page.mouse.*`, NOT `dispatchEvent`.** (2) Our SwipeInput uses raw window listeners, so **swipes** are best driven with `dispatchEvent` PointerEvents on the canvas. (3) Phaser timers run on the rAF/game clock (throttled without a display) while swipe timestamps are wall-clock, so dive-timing numbers look off headless but align on-device — don't "fix" timing based on headless reads. (4) Use the pre-installed Chromium at `/opt/pw-browsers/chromium-1194/chrome-linux/chrome` with `playwright-core`.

## Integrated take-and-save shootout (Phase 4) — DONE (awaiting owner playtest ⏸).
The shootout is now a **single alternating take-AND-save game** (owner request, replacing
Phase 3's simulated opponent). Each turn FLIPS the view: **your turn = taker view** (you
shoot vs the CPU keeper), **CPU turn = keeper view** (you swipe to DIVE and save the CPU's
kick). Both turns run through the SAME provider-driven `playKick()`; `result.scored` (did the
side that kicked score) feeds the unchanged `game/shootout.ts` machine — taker view: you
scored; keeper view: the CPU scored (you failed to save). **The architecture made this small:**
no change to `resolvePenalty`, the kick loop, or the shootout machine — just per-turn view
switching. Key pieces:
- **`this.mode`** is now the CURRENT view/role (flips each turn); **`sessionKind`** ('shootout'
  | 'practice') is which game runs. The **MODE button** toggles `sessionKind` (was TAKE/SAVE).
- **`setView(mode)`** — lightweight per-turn switch (provider swap + camera + rebuild), does
  NOT restart the session (unlike the old `setMode`). **`setSessionKind`** restarts the loop.
- **`beginTurn(side)`** — shows "YOUR TURN" / "DEFEND!" + fades through a black overlay
  (`viewFade`, depth 890) while `setView` rebuilds, so the view change isn't a hard cut.
- **`runShootout`** now calls `beginTurn` + `playKick` for BOTH sides; the simulated
  `playOpponentShot` was removed (`SESSION.opponentScoreChance/opponentPaceMs` now legacy).
- Keeper-mode pieces reused as-is: keeper's-eye layout/camera, `beginKeeperReaction` (tell →
  strike → dive window), `onDiveSwipe`, `CpuProvider.getTakerInput`. Practice mode kept on the
  MODE toggle (`runPractice`, unscored, keeper view).
Verified headless: view flips taker↔keeper per turn, both player + CPU kicks recorded
(player.taken + opponent.taken advance), dives register, timeScale restored, no errors;
practice toggle + switches clean. Difficulty button still sets the CPU **keeper** difficulty
(your taking turns); the CPU **taker** uses CONFIG.CPU_TAKER.
- ⏸ Stop for owner playtest. Tuning knobs: UI.turnBannerMs/viewFadeMs, KEEPER.* (dive feel),
  CPU_TAKER.* (how the CPU shoots at you).

## Design rework (owner request 2026-07-04) — plan: `docs/design-rework-plan.md`
Full audit + category research → Tracks **A correctness / B feedback / C aesthetics**.
Agreed model split: Track A core on Fable, A3/A5 + Track B on Sonnet, Track C on Opus.
- **Track A core (A1/A2/A4): DONE (awaiting owner playtest ⏸).**
  - **A2+A4 — the race:** `resolvePenalty(taker, keeper, seed, flightMs)` — `diveTiming`
    = ms after the strike the dive was committed; `diveProgress = clamp((flightMs −
    commit) / RESOLUTION.diveTravelMs)`. Shot power (ball speed) now genuinely races
    the keeper: a blasted shot beats a dive a soft one can't (taker AND keeper views —
    keeper-view flight lerps `CPU_TAKER.flightTimeSlow→Fast` by CPU power); a dive
    committed while the ball still flies counts as arriving (lateness is judged vs
    ARRIVAL, not the strike — waiting to see the ball no longer auto-concedes).
    `resolve.ts kickFlightMs(power, view)` is the ONE flight-time source for animation
    + resolution. CPU keeper commits at `reactionDelay ± jitter` and its dive ANIMATES
    from that commit to `result.keeperNorm` exactly at ball arrival (fast shot = dive
    visibly falls short). REMOVED knobs: `diveLateWindowMs`, `idealReactMs`,
    `CPU_TAKER.flightTime`. `strikeAt` is re-stamped wall-clock inside the strike
    callback (rAF drift fix).
  - **A1 — saves read as saves (keeper view):** dives submit MID-flight (early commits
    held to the strike; no-dive deadline = ball arrival), so the kick resolves in the
    air; on a save the flight END retargets into the gloves (`flyBall` live `endRef`)
    — the ball NEVER lands in the net first; the visible dive re-aims to the judged
    `keeperNorm`; keeper (depth 410) occludes the ball in keeper view; banners are
    player-perspective (green SAVED! / red CONCEDED / WIDE!).
  - Keystone intact: resolver still pure/deterministic; loop still provider-agnostic.
    Dev hooks: `resolvePenalty` takes 4 args now; added `kickFlightMs`, `getBallPos`,
    `getGoalRect`. Verified headless 14/14 (fast-vs-slow outcome flip on the same
    dive; airborne dive = full progress; frozen keeper = centre only; ball ends at
    gloves on saves / landing on goals; timeScale restored; no errors).
  - ⏸ Playtest knobs: RESOLUTION.diveTravelMs / powerReachPenalty, CPU_KEEPER.
    reactionDelay, CPU_TAKER.flightTimeSlow/Fast, FLIGHT.flightDurationSlow/Fast.
- **Next:** A3 (woodwork) + A5 (fairness details) + Track B on Sonnet, then Track C on
  Opus. See the plan doc §Part 3 and HANDOFF.md.

## Then — Phase 6 (online 2-player). Still later; the provider-swap keystone holds.
