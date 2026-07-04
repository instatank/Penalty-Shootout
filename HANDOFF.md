# Handoff — Penalty Shootout (design rework COMPLETE; A+B live, C awaiting playtest)

Paste the **Prompt block** below into a fresh Claude Code session. Everything under
it is context for that session. **Source of truth order:** the owner's phased plan
(sent one phase at a time) → `CLAUDE.md` (living status + locked decisions) →
`penalty-shootout-PRD-v2.md` (original spec; superseded wherever the phased plan
clashes).

---

## Prompt to paste

> We are continuing the Penalty Shootout build. **Read `CLAUDE.md` and
> `penalty-shootout-PRD-v2.md` in full before writing any code.** CLAUDE.md has the
> current status, the non-negotiable architecture rules, and the locked decisions
> from the owner's phased plan.
>
> We are now tracking a **phase-wise plan** (the owner sends ONE phase at a time);
> it replaces the old PRD milestone order. **On any clash with the PRD or earlier
> work, the new plan wins** — but flag genuine conflicts and confirm anything
> destructive before doing it. Phases 0–3 are DONE: Taker mode is a complete,
> shippable single-player game (drag-to-shoot, AI keeper, best-of-5 shootout with
> early-clinch / sudden-death / win-lose / play-again), and Keeper mode exists as
> free practice. **Wait for me to paste the Phase 4 spec, then build ONLY that
> phase and stop at the ⏸ checkpoint for me to playtest.** Update `CLAUDE.md` and
> `HANDOFF.md` when the phase lands.
>
> Honor the four architecture rules (one `config.ts`; mandatory toggleable debug
> overlay; Pointer Events input; pure deterministic `resolvePenalty()` +
> `InputProvider` interface, loop NEVER branching on CPU-vs-human). Do NOT change
> `resolvePenalty` or the loop's provider-agnostic shape, and do NOT re-add
> `setPointerCapture`/`preventDefault` to SwipeInput (they break every on-screen
> button — see CLAUDE.md).
>
> I'm a non-technical owner: write clear, well-commented code and explain decisions
> plainly. Develop on branch `claude/fable5-design-rework-1avwyo`; commit + push
> each working step there. Don't open a PR unless I ask.
>
> **`docs/design-rework-plan.md` is fully executed.** Track A (correctness) + Track B
> (feedback/feel) are DONE and **LIVE in production**; Track C (aesthetic rework) is
> DONE on this branch and **awaiting the owner's playtest before it's deployed live**.
> There is no queued build work — the next session likely responds to owner playtest
> feedback, then (on approval) deploys Track C to production the same way A+B went
> (fast-forward the default branch `claude/penalty-shootout-setup-9bs643`), or moves on
> to Phase 6 (online).

---

## Where things stand (Phases 0–3 done)
- **Stack:** Phaser 3.90.0 (NOT 4) + TypeScript + Vite. Responsive (Scale.RESIZE),
  **portrait-primary**, landscape also works. Vercel-hosted; PWA + Firebase are later.
- **Phase 0** — scaffold/static scene: satisfied. Decisions: keep TypeScript (not
  the plan's "vanilla JS"), portrait-primary, keep the keeper's-eye camera.
- **Phase 1** — taker shot: drag-to-aim + live aim indicator + live **power meter**
  + threshold **power/accuracy tradeoff** (`aim.scatterRadius`) + power→ball-speed +
  on-target/wide/over outcome. Power = release **velocity**.
- **Phase 2** — resolution + keeper: `resolvePenalty` is a pure **hands-at-arrival
  reach model** (hands travel centre→dive-target by `diveProgress`; save if ball
  within the reach ellipse of the hands' arrival point; extreme corners unsaveable;
  resting/late keeper covers centre). AI keeper difficulty = one directional knob.
- **Phase 3** — full **Taker-mode shootout vs AI**: pure `game/shootout.ts`
  (best-of-5 alternating, early clinch, sudden death, winner) drives a GameScene
  **session controller** (Taker = `runShootout`, Keeper = `runPractice`). Persistent
  scoreboard, Win/Lose end screen, Play Again (tap the end screen). Difficulty
  selector (EASY/MED/HARD). **Plus a critical input bugfix** — see below.
- Aesthetics carried through: Trionda ball, net shake on goal, celebratory banner,
  procedural crowd SFX.
- **Branch:** `claude/penalty-shootout-setup-9bs643` (develop + push here).
- **Every phase is at an owner-playtest ⏸ checkpoint** (not yet signed off on device).

## Architecture you'll reuse (don't relearn the hard way)
- **`game/resolve.ts` — the keystone.** Pure, deterministic, no Phaser. Works in
  normalised goal coords. Do NOT change its shape (online replay depends on it).
- **`input/providers.ts` — `InputProvider`.** `LocalHumanProvider` (human, taker or
  keeper) + `CpuProvider` (AI, taker or keeper). The kick loop pulls inputs through
  these and NEVER branches on CPU-vs-human. **Mode = a provider swap** (GameScene.setMode).
- **`game/shootout.ts` — pure score machine.** `createShootout()/recordKick()`;
  tracks per-side {taken, scored, results[]}, phase regulation/suddenDeath/done,
  `next` side, winner. **Reuse this for Phase 4 (Keeper) and Phase 6 (online).**
- **GameScene session controller.** `startSession()` picks `runShootout` (Taker) or
  `runPractice` (Keeper) by `this.mode`; a `session` counter cleanly stops/restarts
  loops on mode-switch / play-again. `playKick()` = one provider-driven kick (shared).
  `playOpponentShot()` = simulated AI opponent kick (probability-based, Taker mode).
- **Dual camera in `game/layout.ts`:** `computeLayout(w,h,'taker'|'keeper')`. Keeper
  view = behind-the-keeper, ball grows toward you; the near plane IS the `goal` rect
  handed to resolve, so all coord math is reused — only pixels move.
- **`result.scored`** = player won in Taker mode; **`result.saved`** = player won in
  Keeper mode. `showOutcome`/`announceOutcome` already flip the celebration by mode.

## ⚠️ Input: do NOT re-add capture/preventDefault
`SwipeInput` must keep: gesture starts on the canvas, tracked on the **window**, with
**no `setPointerCapture` and no `preventDefault`** (scroll is blocked by
`touch-action:none` in index.html). Capture/preventDefault silently starve Phaser's
own input and kill every on-screen button (DBG/MODE/difficulty/Play Again). This was
a real Phase-3 bug; keep the fix.

## How to verify (this workflow works well)
- Fresh container: `npm install` first. Then `npm run build` (runs `tsc --noEmit`
  then Vite) must be clean.
- Headless: `npm run dev` (port 8080), drive with `playwright-core` + the
  pre-installed Chromium at `/opt/pw-browsers/chromium-1194/chrome-linux/chrome`
  (`--no-sandbox`). Read DEV hooks: `window.__penalty` (resolvePenalty, createShootout,
  recordKick, getState, getShootout, setMode, setKeeperDifficulty, forceEnd) and
  `window.__lastResult/__lastAim/__lastTaker`.
- **Test gotchas:** Phaser **buttons + scene input fire only for `page.mouse.*`
  (CDP), NOT `dispatchEvent`**; **swipes** are best driven with `dispatchEvent`
  PointerEvents on the canvas. Phaser timers are throttled headless (game clock) vs
  wall-clock swipe timestamps — dive-timing reads look off headless but align
  on-device; don't retune timing from headless numbers. Restart the dev server after
  edits (HMR doesn't re-run a Phaser scene's `create()`; a fresh `goto` does).
- Stop at the ⏸ checkpoint; the owner playtests on their phone (Vercel auto-deploys
  on push to the working branch).

## Juice & game-feel track (parallel to phases — owner brief 2026-06-29)
A presentation-only polish pass (`docs/juice-brief.md` = brief, `docs/juice-plan.md` =
plan + status), built in three tiers. **Touches nothing in `resolvePenalty` / the kick
loop** — reads results only. All knobs in **`CONFIG.JUICE`**.
- **Tier 1 — DONE, awaiting owner playtest ⏸:** dynamic net (`game/net/NetSim.ts`
  spring grid, punched on a goal — replaces `shakeNet`), grounded shadows (live soft
  ellipse under ball/keeper/taker — replaces static `drawBallShadow`), dynamic camera
  (`cameraBeat`/`resetCamera`, UI pinned so it can't drift), and hit-stop (`timeScale→0`
  micro-freeze at strike+save, real-time restore, abort-guarded; NO hit-stop on the
  keeper-mode strike — would desync the wall-clock dive timing). Build clean + headless
  smoke green. New dev hooks: `__penalty.getTimeScale()`, `getNetEnergy()`.
- **Tier 2 — DONE, awaiting owner playtest ⏸:** power-scaled screen shake (strike +
  save; none on the keeper-mode strike), procedural particles (turf at strike, net
  spray on goal, dust on a keeper dive, confetti on a match win), and a power-scaled
  ball trail + spin (`flyBall` takes `{power}`). Knobs: `CONFIG.JUICE.shake/particles/
  trail`. Build clean + headless smoke green. Dev hooks: `getParticleCounts()`,
  `burstConfetti()`.
- **Tier 3 — DONE, awaiting owner playtest ⏸:** skippable slow-mo replay (re-sims the
  resolved flight slowed, on corner goals / saves; tap to skip), WebGL post-FX grade
  (vignette + restrained floodlight bloom + colour grade; no-op on Canvas), and UI
  transition juice (animated end-screen entrance + count-up score, button press
  states, scoreboard pop). Knobs: `CONFIG.JUICE.replay/grade/ui`.
- **The whole juice track is now built (Tiers 1–3), all ⏸ for a combined playtest.**
- Headless tips: `playwright-core` isn't a project dep — install `--no-save`. Launch
  Chromium with `--use-gl=swiftshader` to get WebGL (so the post-FX path is exercised).
  Phaser 3.90 camera *post* FX register in `camera.postPipelines`, NOT `postFX.list`.

## Integrated take-and-save shootout (Phase 4) — DONE, awaiting playtest ⏸
The shootout now alternates **shoot then defend**: your turn = taker view (shoot vs CPU
keeper), CPU turn = keeper view (you dive to save the CPU's kick). Both run through the same
`playKick()`; `result.scored` feeds the unchanged shootout machine. New: `sessionKind`
(shootout vs keeper practice, on the MODE button), `setView` (lightweight per-turn view swap),
`beginTurn` ("YOUR TURN"/"DEFEND!" + black-fade view switch). Removed the simulated
`playOpponentShot`. No change to resolvePenalty / kick loop / shootout machine. Verified
headless (view flips per turn, both sides' kicks recorded, dives register, no errors).

## Design rework — Track A + Track B — DONE, awaiting playtest ⏸
Full plan: `docs/design-rework-plan.md` (audit of every functional flaw + research on
the best games in the category; Tracks A correctness / B feedback / C aesthetics).
Track A fixed the owner's three worst reports; Track B made every outcome unmistakable.

### Track A core (A1/A2/A4 — Fable)
- **A2+A4 — THE RACE (one formula):** `resolvePenalty(taker, keeper, seed, flightMs)`
  — `diveTiming` is now "ms after the strike the dive was committed" and
  `diveProgress = clamp((flightMs − commit) / RESOLUTION.diveTravelMs)`. Ball speed
  (power) genuinely races the keeper's hands: a blasted shot beats a dive a soft shot
  can't; a dive committed with air time left counts as arriving (no more "saved on
  screen, goal in the maths"). `resolve.ts kickFlightMs(power, view)` is the ONE
  flight-time source shared by animation + resolution. CPU keeper commits at
  `CPU_KEEPER.reactionDelay ± timingJitterMs` (judged AND animated from that moment,
  landing on `result.keeperNorm` exactly at ball arrival). Keeper-view flight time
  lerps `CPU_TAKER.flightTimeSlow→Fast` by CPU power (was fixed 800ms). Removed:
  `RESOLUTION.diveLateWindowMs`, `KEEPER.idealReactMs`, `CPU_TAKER.flightTime`.
- **A1 — the save happens where you see it (keeper view):** the human dive is
  submitted MID-flight (or held to the strike for early commits; no-dive deadline =
  ball arrival), so the kick resolves while the ball is in the air; on a save the
  flight's END is retargeted into the gloves (`flyBall` gained a live `endRef`) — the
  ball never lands in the net first. The visible dive is re-aimed to the JUDGED
  `keeperNorm` (short of target on late dives). Keeper (depth 410) now occludes the
  ball (400) in keeper view only. Banner is player-perspective: keeper-view save =
  green "SAVED!", conceded = red "CONCEDED", CPU spray = "WIDE!" (no more green
  celebratory GOAL! when you concede).
- Still pure/deterministic (seed + flightMs in ⇒ same result out) — the M8 keystone
  holds. `__penalty.resolvePenalty` now takes 4 args; new hooks: `kickFlightMs`,
  `getBallPos()`, `getGoalRect()`.
- Verified headless (scratchpad `verify-track-a.mjs` pattern): 14/14 — model truths
  (slow saved vs blasted scored on the same dive; airborne "late" dive = full dive;
  frozen keeper = centre only), live taker kick, live keeper-view kicks with the ball
  ending at the GLOVES on saves / the LANDING on goals, timeScale restored, no errors.

### Track A3 + A5 (Sonnet) — the third reported bug + fairness details
- **A3 — woodwork:** `resolvePenalty` now has a post/crossbar band derived directly
  from `GEOMETRY.postThicknessFrac`/`goalAspect` (guaranteed to match the drawn frame
  — no separate duplicate config). A landing in-band → outcome `'post'` (not scored)
  or, with a small seeded `RESOLUTION.postDeflectInChance` (0.15) chance, a lucky
  deflection IN (`hitPost: true` + outcome `'goal'`). New `PenaltyResult.hitPost`
  field. Payoff: `flashWoodwork` (a bright spark at the contact point), `Sfx.postPing`
  (a metallic clang), `deflectOffPost` (the ball rebounds back toward the pitch, never
  into the net), a "OFF THE POST!"/"IN OFF THE POST!" banner tier, and a guaranteed
  slow-mo replay (`isReplayWorthy` now fires on any `hitPost`).
- **A5 — fairness/detail fixes:**
  - `resolvePenalty` now computes the keeper's hand position UNCONDITIONALLY (for
    every outcome, not just save/goal) — a genuine wide/over MISS now shows the
    keeper's real committed dive instead of snapping to centre (was flaw B4).
  - `CpuProvider` reads the taker's AIMED zone (`targetZone`), not the post-scatter
    LANDING zone — scatter can finally wrong-foot the keeper (was flaw B3).
  - `aim.ts landShot` scatter is now elliptical (vertical component divided by the
    goal's aspect ratio) so power-shot misses are no longer skewed ~2.6× toward
    "over the bar" vs wide (was flaw B7).
  - `RESOLUTION.margin` shrunk 0.18→0.05 — the edge-of-reach coin-flip band is much
    thinner now that saves/misses/woodwork all read honestly (was flaw B8).
  - `playKick` now only discards a kick as "cancelled, retake it" if `taker`/`keeper`
    came back null (no decision made yet); once `resolvePenalty` has actually run, the
    result is ALWAYS returned even if a resize/mode-switch cuts the presentation
    short — a rotated phone can no longer silently drop a resolved kick (was flaw B6).
  - The end-screen "tap anywhere to restart" now only arms after the entrance
    animation fully completes (`endTapArmed`) — a finger still down from the winning
    kick can no longer instantly skip the score screen (was flaw B5).

### Track B — feedback & feel (Sonnet), all built on top of the honest Track A model
- **B1 — catch vs parry:** a save's animation now differs by how comfortable it was
  (`resolvePenalty`'s `reachMargin`): a central save is a CATCH (squash + hold, no
  rebound); a stretching reach save is the existing outward PUNCH/PARRY.
- **B2 — fingertip near-miss:** a goal that only just beat the reach
  (`reachMargin ≤ JUICE.parry.grazeReachMargin`) still fires a small white spark at
  the keeper's hands — "so close."
- **B3 — honest misses:** an over-the-bar shot now keeps sailing away and shrinking
  into the crowd instead of freezing mid-air; a wide shot gets a firm thud-and-settle
  squash instead of silently stopping.
- **B4 — graded goals:** a taker goal into a true corner now shows "TOP CORNER!"
  (plus a touch of extra screen shake) instead of a generic "GOAL!".
- **B5 — tension staging:** a brief "held breath" dim rides the CPU taker's existing
  tell window in keeper view (releases exactly at the strike — adds ZERO latency,
  and deliberately does NOT touch the human's own taker kick, where any delay would
  just read as input lag). From sudden death / the last regulation kick, the game
  goes "high stakes": the resting camera tightens a touch, the vignette deepens (the
  vignette FX object is now kept as a live-adjustable field), the scoreboard dots
  pulse, and one soft heartbeat thump plays as a decisive kick begins.
- **B6 — speed made visible:** the keeper's dive pose now stretches thinner + leans
  harder the LOWER its judged progress is — a dive that's still falling short of a
  blasted shot visibly reads as desperate/overreaching, not identical to a dive that
  comfortably arrived (`diveKeeperTo` gained a `progress` parameter).
- **B7 — dead time & skip:** the outcome banner hold and the "YOUR TURN"/"DEFEND!"
  turn banner are now tap-to-skip (`skippableDelay`) — release→launch was already
  instant.
- Verified headless (scratchpad `verify-track-a3-b.mjs`): woodwork classification +
  ~15% deflect-in rate over 400 seeds, miss reports a real (non-centre) keeper dive,
  scatter is isotropic in normalised coords, end-screen arm-guard (early tap ignored,
  armed tap restarts), tap-to-skip actually shortens the hold, no console errors.
- New dev hooks: `landShot`, `scatterRadius`, `getHighStakes()`,
  `getVignetteStrength()`, `isEndShown()`, `isEndArmed()`.
- **Verification note (be transparent about this at playtest):** one older regression
  script (`verify-track-a.mjs`) showed an intermittent large ball-position reading for
  plain keeper-view goals under rapid scripted dive-swipes. Traced it down to a
  TEST-HARNESS race (the polling loop occasionally sampled during the *next* kick's
  ball-reset, and separately one flaky run had the simulated dive-swipe itself fail to
  register, producing a frozen-keeper result) — not a game defect. Confirmed via (a)
  100%-passing pure-math checks on `resolvePenalty` itself, (b) a dedicated slower
  trace script showing the ball holding the exact correct landing position for a full
  1000ms window before any reset, and (c) the newer dedicated Track A3/B suite (which
  samples immediately rather than polling) passing consistently across repeated runs.
  Worth an eye on-device regardless, per the "headless-green ≠ device-acceptable" rule.

### Track C — aesthetic rework (Opus) — DONE, awaiting playtest ⏸
A full procedural night-match restyle — **no asset files**, everything through CONFIG.
New `CONFIG.STADIUM` group + a big `CONFIG.COLORS` expansion (sky/crowd/floodlight/
hoarding/pitch-lighting/goal-depth/character tones). Resolution + the kick loop are
untouched (the plan's "C rewrites the draw* layer only").
- **C1 stadium** — `drawBackground` now composes, back-to-front: `drawSky` (a dusk→night
  vertical gradient via `fillGradientStyle`), `drawCrowd` (banked tiers of seeded 2-tone
  cells + rare bright accent specks, top rows fading into the sky; a goal pulses the whole
  crowd brighter via `flashCrowd`, wired in `showOutcome`), `drawStadiumFloodlights`
  (pylons + lamp banks + stacked-disc glow pools), `drawPitch` (mow stripes + a centre
  light-pool + shaded edges = an on-turf vignette), `drawHoardings` (perimeter ad panels
  on the goal line — also what a wide/over miss thuds into). The old flat navy band and
  the bloom-era `drawFloodlights` were removed.
- **C1b goal frame** — `drawGoal` + `drawNearGoalFrame` now have depth: a shaded receding
  side face, a bright front face + highlight edge, a soft floodlit glow, and a ground
  shadow under the posts.
- **C2 characters** — `drawKeeperGraphic`/`drawTakerGraphic` are now articulated
  silhouettes (tapered torso via `fillPoints`, round-capped limbs, gloves, 2-tone
  shading), feet-at-origin kept so the dive lean/stretch still works. The keeper takes a
  `reach` pose param (0 = ready spread, 1 = arms up-and-out) and `diveKeeperTo` redraws it
  reaching when a dive commits. The CPU taker does a short **run-up** (jogs onto the ball
  with a bob over the ready+tell window) at the top of `beginKeeperReaction`.
- **C4 UI** — a rounded scoreboard backing panel (`scorePanel`) lifts the HUD off the busy
  stadium; MODE/difficulty buttons restyled to match; the always-on debug 3x2 zone grid +
  "TL/TM/…" letters are gone from normal play (`DEBUG.showZoneLabels` now defaults OFF and
  only draws a faint guide when on — the live aim reticle already shows the target).
- **C5 aim read** — `drawSwipeFeedback` draws the aim guide as the PREDICTED curved flight
  (bows by the same `curve·curveGain·goalWidth` the real shot uses), so a curled swipe
  visibly wraps toward the target.
- **Deliberately deferred:** the dedicated UI camera (old flaw B9 — the 0.9 base zoom
  slightly insets the pinned HUD) — low severity, high regression risk (a dual-camera
  ignore-list touches every object + input hit-testing), and the new scoreboard panel
  makes it a visual non-issue. C3's "flying gloves cursor" is covered by the articulated
  keeper visibly reaching its gloves to the dive target.
- **Verified:** build clean; both functional regression suites green (14/14 A3/B). The one
  legacy `verify-track-a.mjs` A1 line still intermittently "fails" — re-confirmed (again)
  it's the harness sampling race / occasional missed scripted-swipe, NOT a regression: the
  `trace-goal.mjs` script shows goals settle at the EXACT landing point and hold ~1s before
  the next kick resets. Screenshots of taker + keeper views (portrait/landscape) and the
  curved aim guide were reviewed for the look.
- ⏸ **Owner playtest before deploy.** When approved, deploy exactly as A+B went live:
  `git push origin claude/fable5-design-rework-1avwyo:claude/penalty-shootout-setup-9bs643`
  (a fast-forward of the default/production branch Vercel auto-deploys).

## Deploy note — how "live" works here
There is no `main`/`master`. The repo default (and Vercel production) branch is
`claude/penalty-shootout-setup-9bs643`. Work happens on `claude/fable5-design-rework-1avwyo`
and reaches production by fast-forwarding the default branch to it (both are in lockstep
history — FF only, no merge commits). Track A+B were pushed live this way on 2026-07-04
with owner authorization; Track C is committed on the working branch but NOT yet on the
production branch (awaiting playtest).

## (Superseded) earlier Phase-4 expectation
Keeper mode currently runs as free practice. Phase 4 will almost certainly make it a
**scored session reusing `game/shootout.ts`** (Keeper counts SAVES; player keeps goal
on their turns, AI takes on the opponent's turns) with the same scoreboard / end
screen / play-again. The real Splash → Mode-select (Take / Save / Practice) menu is
also still pending. **Wait for the owner's actual Phase 4 text before building.**

## Known follow-ups / open notes (carry forward)
- SFX are placeholder procedural Web Audio (CONFIG.SOUND); owner wants real crowd
  samples later.
- iOS Safari has no Vibration API (haptics Android-only); possible later experiment.
- Keeper timing knob is now `RESOLUTION.diveTravelMs` (hands' full-dive travel time;
  bigger = more forgiving) + the flight-time ranges (`FLIGHT.flightDuration*`,
  `CPU_TAKER.flightTime*`) — shared by Taker + Keeper; judge together at playtest.
- Taker `SESSION.opponentScoreChance` (0.68) is the AI-opponent strength dial for the
  shootout; tune for a fair, winnable game.
- The debug overlay (top-left) can overlap the centered scoreboard on a narrow phone;
  it's a dev tool — tap DBG to hide it. Not worth special-casing unless the owner asks.
