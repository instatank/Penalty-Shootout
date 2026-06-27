# Handoff — start here for Milestone 6 (Sessions + scoring + practice)

Paste the **prompt block** below into a fresh Claude Code session to continue the
build. Everything else in this file is context for that session.

---

## Prompt to paste

> We are continuing the Penalty Shootout build. **Read `CLAUDE.md` and
> `penalty-shootout-PRD-v2.md` in full before writing any code** — CLAUDE.md has
> the current status, the architecture rules, and a "Milestone 6" section. The PRD
> is the source of truth.
>
> Milestones 1–5 are **done, playtested, and pushed**: a complete single-player
> game with BOTH modes vs CPU (Taker and Keeper), a unified deterministic
> `resolvePenalty()`, the `InputProvider` abstraction (loop never branches on
> CPU-vs-human), and aesthetics. We are now starting **Milestone 6 — sessions +
> scoring + practice** (PRD §9 / §13.6): a 5-kick session per mode (Taker counts
> goals, Keeper counts saves), an end screen with result + restart, and an
> unlimited Practice mode. This is where the minimal MODE toggle becomes the real
> Splash → Mode-select (Take / Save / Practice) menu (§12).
>
> Honor the four non-negotiable architecture rules (one `config.ts`; mandatory
> debug overlay; Pointer Events input; pure deterministic `resolvePenalty()` +
> `InputProvider` interface with the loop NEVER branching on CPU-vs-human). Do
> **not** modify `resolvePenalty()` or the loop's provider-agnostic shape. Build
> ONLY Milestone 6, then **stop at the ⏸ checkpoint** for the owner to playtest.
> Update `CLAUDE.md` when done.
>
> I'm a non-technical owner: write clear, well-commented code and explain
> decisions plainly. Develop on the branch `claude/penalty-shootout-setup-9bs643`,
> and commit + push each working step to that branch.

---

## Where things stand
- **Stack:** Phaser 3.90.0 (not 4) + TypeScript + Vite. Responsive (Scale.RESIZE),
  works in portrait and landscape (landscape is primary). Vercel-hosted PWA later.
- **Done:** M1 scaffold/static scene, M2 swipe input + debug overlay, M3 ball
  flight, M4 Taker mode (CPU keeper) with a unified **geometric** `resolvePenalty`,
  **M5 Keeper mode** (CPU taker + tell + human dive/timing, in a behind-the-keeper
  camera where the ball grows toward you — `computeLayout(..,'keeper')`), plus aesthetics
  (Trionda ball, net shake on goal, celebratory banner, procedural crowd SFX).
  All feel values are in `src/config.ts`.
- **Branch:** `claude/penalty-shootout-setup-9bs643` (develop + push here).

## Milestone 6 task (summary — full detail in CLAUDE.md + PRD §9/§12)
1. A **session = 5 kicks** in the chosen mode. Taker: count goals. Keeper: count
   saves. End screen shows the result and offers restart / back to menu.
2. **Practice mode:** unlimited kicks, no score (used for feel-tuning / warm-up).
3. Replace the minimal **MODE: TAKE/SAVE** toggle (GameScene) with a real
   **Splash → Mode-select (Take / Save / Practice)** flow (§12). Keep chrome
   minimal — the pitch/goal/ball are the screen; controls in the lower thumb zone.
4. Do NOT touch `resolvePenalty()` or the loop's provider-agnostic shape. Mode is
   already just a provider swap (GameScene.setMode) — build scoring/session state
   around the existing loop, not inside it.

## Key code facts to reuse (don't relearn the hard way)
- The kick loop (`GameScene.runKickLoop`) is mode-agnostic: it pulls taker +
  keeper inputs through `this.takerProvider` / `this.keeperProvider` and resolves.
  Switching mode = swapping which concrete provider (`this.human` / `this.cpu`)
  fills each role. The loop continues across switches via `epoch` + `human.cancel()`.
- `result.saved` = the player succeeded in **Keeper** mode; `result.scored` = the
  player succeeded in **Taker** mode. `showOutcome` already flips cheer/celebration
  by mode (`playerWon`) — reuse that signal for scoring.
- Outcome banner uses `outcomeText`; debug overlay via `this.debug.setLines(...)`.

## How to verify (this has worked well)
- `npm install` first (fresh container), then `npm run build` must be clean
  (it runs `tsc --noEmit` then Vite).
- Headless check with the pre-installed Chromium: install `playwright-core` in a
  scratch dir and launch with `executablePath:
  '/opt/pw-browsers/chromium-1194/chrome-linux/chrome'`. Drive the game by
  dispatching PointerEvents on `#game-container canvas` (with real awaited gaps),
  screenshot, and read the DEV hooks (`window.__penalty.getState/setMode`,
  `window.__lastResult`, `window.__lastTaker`, `window.__lastAim`) — DEV only.
  Headless caveat: Phaser timers run on the throttled rAF/game clock while swipe
  timestamps are wall-clock, so dive-timing reads off headless but aligns on-device.
- Stop at the ⏸ checkpoint and hand to the owner to playtest on their phone (the
  Vercel link auto-updates on push).

## Known follow-ups (not M6)
- Replace placeholder procedural SFX with real crowd samples (owner request).
- iOS has no Web Vibration API (haptics Android-only) — possible M7 experiment.
- Keeper-mode timing bites softly (shared CONFIG.RESOLUTION.timingFloor). If the
  owner wants timing to matter more, lower timingFloor / shorten CPU_TAKER.flightTime
  at playtest (both also affect Taker feel).
