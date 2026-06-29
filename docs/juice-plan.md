# Juice & Game-Feel — Implementation Plan

Companion to [`juice-brief.md`](./juice-brief.md) (the owner's brief). This is the
step-by-step build plan, grounded in the current codebase. **Build tier by tier.
Stop at every ⏸ checkpoint for the owner to playtest before continuing.**

## Guiding constraints (carried from CLAUDE.md — do NOT break these)
- **RULE 1 — one `config.ts`.** Every new intensity/duration/colour goes in
  `src/config.ts` under a new `JUICE` group (and small additions to existing
  groups). No magic numbers in the scene. Each effect gets a tunable parameter so
  feel can be dialed in after seeing it move.
- **RULE 2 — debug overlay stays.** Where useful, surface new derived values
  (e.g. net impulse, hit-stop active) in `DebugOverlay`.
- **RULE 3 — input untouched.** Do NOT touch `SwipeInput` / re-add
  `setPointerCapture` / `preventDefault`. Camera zoom must not break pointer→world
  mapping for aim/dive swipes (we read raw screen-space `{x,y,t}`, so this is safe,
  but verify on-device).
- **RULE 4 — `resolvePenalty` + the provider-agnostic kick loop are frozen.** All
  juice is *presentation only*. It hangs off the existing reveal/flight/outcome
  methods; it never changes what gets resolved or which side wins. Determinism for
  online replay (M8) must stay intact — juice reads results, never feeds them.
- **Easing everywhere.** No linear tweens. Ease-out for arrivals, ease-in for
  exits, `Back`/`Elastic` sparingly. (The codebase already favours `Quad.easeOut`
  / `Back.easeOut` / `Sine.easeInOut` — match that vocabulary.)
- **Abort-safety.** Every new async effect (hit-stop, slow-mo) must respect the
  existing `epoch`/`session` invalidation + `abortAll()` so a resize / mode-switch
  / play-again can't deadlock or leak a frozen `timeScale`. Always restore
  `timeScale` in a `finally`-style guard.
- **60fps on mobile.** Cap particle counts; keep the net sim resolution modest
  (reuse `netCols:16 × netRows:8`, not finer). Prefer one `Graphics` redraw per
  frame over many GameObjects.

## Codebase touch-points (where each item plugs in)
- `src/game/scenes/GameScene.ts` — the hub. Key methods:
  - `rebuild(w,h)` (948) — rebuilds all visuals on create/resize. New persistent
    objects (shadows, net sim, particle managers) get created/re-laid-out here.
  - `drawNet()` (1096) / `netGfx` / `shakeNet()` (817) — net. Item 1 replaces the
    static lines with a sim; `shakeNet` is folded into the net impulse.
  - `drawBallShadow()` (1132) — currently bakes a static shadow into world
    graphics. Item 2 replaces it with a live shadow object.
  - `flyBall(...)` (702) — the tween that moves/scales/spins the ball. Items 2, 4,
    7 hook the per-frame `onUpdate` here (shadow tracking, trail, spin rate).
  - `revealTakerKick` (594) / `settleKeeperOutcome` (631) / `beginKeeperReaction`
    (645) — the per-mode reveal sequences. Camera beats (item 3), hit-stop (item 4)
    and the strike particle burst (item 6) trigger from here, around the strike and
    the ball→keeper contact.
  - `announceOutcome` (786) / `showOutcome` (764) — outcome banner + crowd + net
    shake. Goal/save camera framing (item 3), net spray + win confetti (item 6),
    and slow-mo trigger (item 8) hang off here.
  - `buildSessionUI` (319) / `updateScoreboard` (375) / `showEndScreen` (409) —
    HUD + end screen. Item 10 (count-up, staggered entrances, transitions) lives here.
  - Helpers to reuse: `tweenP` (847, awaitable tween), `delayP` (836, awaitable
    delay), `abortAll` (863), `activeResolvers`.
- `src/config.ts` — add a `JUICE` group; small touch-ups to `UI`/`FLIGHT`.
- `src/game/main.ts` — `Phaser.AUTO`. Item 9 (postFX) needs **WebGL**; AUTO picks
  WebGL when available. Plan: detect renderer, apply postFX only under WebGL, and
  no-op gracefully on Canvas (don't hard-require WebGL).
- `src/game/layout.ts` — if floodlights (item 9 bloom anchor) need positions, add
  them here as proportional layout values, consistent with the responsive model.
- `src/ui/DebugOverlay.ts` — optional readouts for new tunables.

---

## TIER 1 — Highest payoff (items 1–4). ✅ BUILT — ⏸ awaiting owner playtest.
> Status (2026-06-29): all four items implemented, `npm run build` clean, headless
> smoke green (6/6 goals ripple the net then settle; hit-stop freeze observed +
> always restored; mode-switch taker↔keeper clean; no console/page errors). New
> code: `src/game/net/NetSim.ts`; `CONFIG.JUICE` (net/shadow/camera/hitStop);
> GameScene `update()`, `punchNet`, `positionBallShadow`/`positionActorShadow`,
> `cameraBeat`/`resetCamera`, `hitStop`/`endHitStop`. The old whole-net `shakeNet`
> + static `drawBallShadow` were removed (superseded). Tune via `CONFIG.JUICE`.

### Step 1.1 — Dynamic net (the money shot)
**Approach:** a verlet point-grid spring sim, rendered each frame by redrawing
`netGfx` (no physics engine needed; we already have none and flight is tween-based).
- New module `src/game/net/NetSim.ts` (pure-ish, Phaser-free math): a grid of
  `netCols+1 × netRows+1` points. Top row + side edges are **pinned** (attached to
  posts/crossbar); interior points are free. Each step: integrate
  `pos += (pos - prevPos) * (1 - damping)`, then satisfy structural + shear spring
  constraints a few iterations, then re-pin edges. A `z`/offset per point gives the
  bulge depth, projected to a small screen-space displacement when drawn.
- GameScene owns a `NetSim` instance, built in `rebuild()` from `layout.goal`
  (resize rebuilds it). `update(dt)` steps it; `drawNet()` redraws from point
  positions (same hatch lines, now displaced) — keep the existing faint-line look.
- `punchNet(normX, normY, power)` — convert the ball's landing point (we already
  compute it in resolve/aim as normalised goal coords) to the nearest grid points
  and apply an inward impulse scaled by `power`. Overshoot + oscillate comes free
  from the spring/damping. **Replaces** `shakeNet()` (delete the whole-net jitter;
  call `punchNet` at the moment the ball crosses the goal line on a goal).
- Config: `JUICE.net = { stiffness, damping, iterations, impulse, maxBulgeFrac,
  restSettleMs }`. Default taut-but-alive; expose in DebugOverlay while tuning.
- **Acceptance:** a scored ball punches + ripples the net at its entry point, then
  oscillates and settles; different entry points ripple in different places.
- **Perf note:** only step the sim while it has energy (a `settled` flag) so it's
  free when at rest. 16×8 grid × ~3 constraint iters is cheap.

### Step 1.2 — Ball shadow + grounded depth
- Replace static `drawBallShadow()` with a **live shadow GameObject** (a blurred
  ellipse — an `Image` of a soft radial texture generated once, or a `Graphics`
  ellipse with low alpha). One each for **ball**, **keeper**, **taker**.
- Ground projection: the shadow sits on the pitch ground line under each actor;
  the ball's shadow tracks the ball's *ground* x (independent of arc lift) while
  the ball rises. Drive it from `flyBall`'s `onUpdate` (702): as arc height (the
  `arcPx * sin` term) grows, shadow **scales down + lowers alpha** (and conceptually
  blurs); on descent it grows + sharpens. In keeper-eye view the ball grows toward
  camera — shadow grows with it correspondingly.
- Keeper/taker shadows are static ellipses under their feet, scaled to figure size
  in `rebuild()`; they lean/offset slightly during a dive for life.
- Config: `JUICE.shadow = { groundAlpha, minAlpha, minScale, blurFrac, offsetFrac }`.
- **Acceptance:** when the ball is high+far, its shadow is small, faint and offset
  from it; the separation reads clearly as "off the ground."

### Step 1.3 — Dynamic camera
- All via `cameras.main` (`zoomTo`, `pan`, `shake`), every move eased; **no instant
  cuts**. Centralise in a small helper `cameraBeat(kind)` so beats are consistent
  and abort-safe (cancel in-flight cam tweens on `abortAll`/resize; always return
  to neutral).
- Beats:
  - **Aim/run-up:** slight push-in (zoom ~1.04–1.08) as the player drags / before a
    CPU strike. Reset on release if no shot.
  - **Strike:** brief snap/pan toward the ball + quick settle.
  - **Goal:** zoom/celebration framing toward the net entry point (pair with item 1
    ripple); hold during the banner, then ease back.
  - **Save:** framing favouring the keeper.
  - **Between turns / new kick:** smooth `pan`+`zoomTo` back to the neutral penalty
    view (per-mode: taker view vs keeper-eye view).
- **Resize-safety:** Scale.RESIZE changes the viewport; on resize, snap camera to
  neutral for the current layout (don't animate across a layout change).
- Config: `JUICE.camera = { aimZoom, strikeZoom, goalZoom, saveZoom, panMs,
  zoomMs, ease }`. Default subtle.
- **Verify:** pointer→world aim/dive mapping still correct under zoom (we use raw
  screen `{x,y,t}` for swipes, so aim math is unaffected — confirm on-device).
- **Acceptance:** camera is subtly alive at all times and reacts differently to
  goal vs save vs new turn; nothing snaps without easing.

### Step 1.4 — Hit-stop on contact
- A short global freeze via `this.time.timeScale = 0` **and** `this.tweens.timeScale
  = 0` (no physics engine to pause). Restore after ~60–100ms of *real* time
  (use a `window.setTimeout`, not a scene timer — scene timers are frozen at
  timeScale 0). **Guard:** wrap so an abort/resize during the freeze always restores
  timeScale (never leave the game frozen).
- Triggers: at **ball-strike** (start of flight) and at **ball-meets-keeper** on a
  **save** (in `settleKeeperOutcome` / the save branch). Keep it short — weight,
  not lag.
- Config: `JUICE.hitStop = { strikeMs, saveMs, enabled }`.
- **Acceptance:** strike and save each produce a perceptible, satisfying "thunk"
  pause, not a stutter.

> ### ⏸ CHECKPOINT 1 — owner playtests Tier 1 (items 1–4) before Tier 2.
> Commit + push. Update CLAUDE.md + HANDOFF.md. These four deliver most of the
> visual jump with zero new art — judge the difference before continuing.

---

## TIER 2 — Core feel (items 5–7). ✅ BUILT — ⏸ awaiting owner playtest.
> Status (2026-06-29): all three items implemented, build clean, headless smoke
> green (turf/spray/dust/trail/confetti emitters all fire at configured counts;
> timeScale restored; taker + keeper paths clean; no errors). New code in GameScene:
> `screenShake`/`strikeShake`, `createParticleSystems` + `burstTurf/NetSpray/Dust/
> Confetti`, `startBallTrail`/`stopBallTrail`, and `flyBall` now takes `{power}` for
> power-scaled spin + trail density. Knobs: `CONFIG.JUICE.shake/particles/trail`.
> Deliberately NO strike shake in keeper mode (would spoil the wall-clock read).

### Step 2.1 — Screen shake
- `cameras.main.shake(duration, intensity)`. **Intensity scales with shot power**
  (use the taker `power` already on `TakerInput`). Triggers: powerful strike, save.
- Reconcile with item 1.3 camera beats (shake composes over the active pan/zoom —
  Phaser supports this) and with item 4 hit-stop ordering (freeze, then shake on
  release).
- Config: `JUICE.shake = { strikeMax, saveAmt, durationMs, powerCurve }`. Default
  subtle — err low (nausea risk).
- **Acceptance:** a max-power strike has a noticeable but tasteful kick; a soft shot
  barely shakes.

### Step 2.2 — Particles
- Phaser particle emitters (`this.add.particles`). Generate small soft textures
  procedurally at boot (no asset files), matching the no-asset-files ethos of
  `Sfx.ts`. Modest counts for mobile.
- Bursts: **turf flecks** at the strike point on contact; **net spray** on a goal
  (at the entry point, pairs with item 1); **dust puff** where the keeper lands a
  dive; **confetti/pyro** on a **match win** (end screen).
- Config: `JUICE.particles = { turfCount, netSprayCount, dustCount, confettiCount,
  enabled }` + colours (reuse palette + a confetti set).
- **Acceptance:** each key moment (strike, goal, save-dive, win) has its own
  appropriate burst.

### Step 2.3 — Ball trail + spin
- **Trail:** alpha-decaying afterimages of the ball during flight (a small ring
  buffer of faded ball ghosts redrawn each `flyBall` frame, OR a particle trail
  emitter following the ball). Harder shots = longer/denser trail.
- **Spin:** the ball already rotates in `flyBall` via `FLIGHT.spinTurns`. Make spin
  rate scale with `power` (faster spin + more blur on harder shots).
- Config: `JUICE.trail = { length, fadeMs, powerScale }`; promote spin scaling into
  `FLIGHT`/`JUICE`.
- **Acceptance:** a struck ball leaves a clean trail and visibly spins; harder shots
  spin and blur more.

> ### ⏸ CHECKPOINT 2 — owner playtests Tier 2. Commit + push, update docs.

---

## TIER 3 — The finish (items 8–10). Do once the rest feels good.

### Step 3.1 — Slow-motion replay
- After a **goal** or a **notable save**, replay the last ~1.5s in slow motion from
  a more dramatic camera angle, then return to play.
- **Approach (record-and-replay):** record the ball/keeper/taker transforms over
  the final moments into a ring buffer, then play them back at reduced `timeScale`
  with the camera repositioned (a lower/closer dramatic angle). Reuses the same
  visuals — deterministic, no re-resolve. (Alternative: re-run `flyBall` with the
  stored result + a replay camera; record-and-replay is simpler and exact.)
- **Skippable:** tap-to-continue so it never blocks a player who wants pace. Respect
  abort/epoch.
- "Notable save" = define via result (e.g. corner-bound shot saved, or any save in
  sudden death) — a small predicate, presentation-only.
- Config: `JUICE.replay = { enabled, durationMs, timeScale, triggerOn }`.
- **Acceptance:** scoring a good goal triggers a brief, skippable slow-mo from a
  flattering angle that makes the moment feel earned.

### Step 3.2 — Post-processing grade
- Phaser 3.60+ `postFX`/`preFX` — **WebGL only**. Detect renderer in `main.ts`/scene
  and apply only under WebGL (graceful no-op on Canvas).
- **Vignette** (subtle edge falloff), **Bloom concentrated on the floodlights /
  bright highlights** (sells the stylized stadium), and a **consistent colour
  grade** across scenes (one look). Keep bloom **restrained** — heavy bloom reads
  cheap.
- Floodlights: add simple bright light shapes (low-poly lane) anchored via
  `layout.ts` proportional positions; bloom sits on them specifically.
- Config: `JUICE.grade = { vignette, bloomStrength, bloomThreshold, tint, enabled }`.
- **Acceptance:** the whole game shares one cohesive graded look; floodlights glow
  softly; the frame has gentle edge falloff.

### Step 3.3 — UI / screen-transition juice
- **No hard cuts:** animate every screen transition (menu ↔ match ↔ results) with
  eased slide/fade/scale. (Note: there's no separate Splash/Menu scene yet — the
  Splash→Mode-select menu is still pending per CLAUDE.md §12 / Phase 6 notes. Apply
  transition juice to the existing end-screen / play-again / mode-toggle now, and
  to the menu when it lands.)
- **Buttons:** press states — scale-down on press, subtle bounce (`Back.easeOut`) on
  release. Apply to MODE / difficulty / Play Again / end-screen buttons.
- **Results screen:** **count the score up** (tween a counter, not a snap); stagger
  element entrances (title, score, button) with eased offsets.
- **HUD:** score / round-shot indicator / whose-turn animate when they change
  (pop/slide), not instant text swaps. Builds on `updateScoreboard`/`drawScoreDots`.
- `[NEEDS ASSET]` flag: a strong sporty display typeface + a coherent UI kit
  (buttons, panels, icons) would materially upgrade this. Mark the placeholder
  text/buttons that should later swap to the sourced kit; build against current
  placeholders for now.
- Config: `JUICE.ui = { pressScale, releaseBounceMs, countUpMs, staggerMs,
  transitionMs, ease }`.
- **Acceptance:** menu → match → results never hard-cuts; buttons feel tactile; the
  final score animates in with weight.

> ### ⏸ CHECKPOINT 3 — owner playtests Tier 3. Commit + push, update docs. Done.

---

## Config shape (single new group, plus minor existing-group additions)
Add `JUICE` to `src/config.ts` with sub-objects mirroring the steps:
`net, shadow, camera, hitStop, shake, particles, trail, replay, grade, ui`.
Each holds intensities/durations/eases with **subtle defaults**. Minor additions to
`FLIGHT` (spin-power scaling) and `UI` (count-up / transition timing) where they
fit those groups better. Nothing else in the codebase gets a magic number.

## Verification per tier (matches HANDOFF workflow)
- `npm run build` (`tsc --noEmit` + Vite) clean after every step.
- Headless smoke via `playwright-core` + the pre-installed Chromium: drive a kick,
  confirm no errors, confirm timeScale always restores (hit-stop/slow-mo), confirm
  resize during an effect doesn't deadlock (`abortAll`). Remember the headless
  gotchas (buttons need `page.mouse.*`; swipes need `dispatchEvent`; timing reads
  look off headless — don't retune feel from them).
- Real feel is judged by the owner on-device at each ⏸ (Vercel auto-deploys on push
  to the working branch).

## Branch / process
- Develop on the designated working branch; commit each working step with a clear
  message; push when a tier is at its ⏸. No PR unless the owner asks.
- One tier at a time; stop at each ⏸ for playtest. Update CLAUDE.md + HANDOFF.md
  when a tier lands.
