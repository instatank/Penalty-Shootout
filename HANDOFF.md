# Handoff — continue the Penalty Shootout build (next: Phase 4)

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
> plainly. Develop on branch `claude/penalty-shootout-setup-9bs643`; commit + push
> each working step there. Don't open a PR unless I ask.

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
- Keeper-mode timing now bites (Phase 2 model); `RESOLUTION.diveLateWindowMs` is the
  knob if the owner wants it more/less forgiving (shared with Taker — judge together).
- Taker `SESSION.opponentScoreChance` (0.68) is the AI-opponent strength dial for the
  shootout; tune for a fair, winnable game.
- The debug overlay (top-left) can overlap the centered scoreboard on a narrow phone;
  it's a dev tool — tap DBG to hide it. Not worth special-casing unless the owner asks.
