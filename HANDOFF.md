# Handoff — start here for Milestone 5 (Keeper mode)

Paste the **prompt block** below into a fresh Claude Code session to continue the
build. Everything else in this file is context for that session.

---

## Prompt to paste

> We are continuing the Penalty Shootout build. **Read `CLAUDE.md` and
> `penalty-shootout-PRD-v2.md` in full before writing any code** — CLAUDE.md has
> the current status, the architecture rules, and a "Milestone 5" section with
> the exact plan. The PRD is the source of truth.
>
> Milestones 1–4 (complete single-player **Taker** mode vs CPU) plus an owner
> aesthetic pass are **done, playtested, and pushed**. We are now starting
> **Milestone 5 — Keeper mode** (PRD §6 / §13.5): the CPU takes (with a subtle
> tell), and the player swipes/taps to dive and save, resolved through the SAME
> `resolvePenalty()`.
>
> Honor the four non-negotiable architecture rules (one `config.ts`; mandatory
> debug overlay; Pointer Events input; pure deterministic `resolvePenalty()` +
> `InputProvider` interface with the loop NEVER branching on CPU-vs-human).
> Implement keeper mode by filling the two provider stubs that currently throw
> "Milestone 5" and swapping which provider is taker/keeper — do **not** modify
> `resolvePenalty()` or the loop's provider-agnostic shape. Build ONLY Milestone 5,
> then **stop at the ⏸ checkpoint** for the owner to playtest. Update `CLAUDE.md`
> when done.
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
  plus aesthetics (Trionda ball, net shake on goal, celebratory banner, procedural
  crowd SFX). All feel values are in `src/config.ts`.
- **Branch:** `claude/penalty-shootout-setup-9bs643` (develop + push here).

## Milestone 5 task (summary — full detail in CLAUDE.md)
1. `CpuProvider.getTakerInput()` — generate {targetZone, power, curve} → seeded
   `TakerInput` (CONFIG.CPU_TAKER: targetWeights, tellStrength, tellLeadTime,
   flightTime).
2. `LocalHumanProvider.getKeeperInput()` — read the player's dive swipe/tap →
   {diveZone, diveTiming} (timing relative to the strike).
3. Solo Keeper mode = CpuProvider taker + LocalHumanProvider keeper — same loop,
   swapped providers. Add a minimal way to enter keeper mode (full menu is M6).
4. CPU taker telegraphs subtly before striking; player dive timing matters.
   `result.saved` now means the player (keeper) succeeded.

## How to verify (this has worked well)
- `npm run build` must be clean (it runs `tsc --noEmit` then Vite).
- Headless check with the pre-installed Chromium: install `playwright-core` in a
  scratch dir and launch with `executablePath:
  '/opt/pw-browsers/chromium-1194/chrome-linux/chrome'`. Drive the game by
  dispatching PointerEvents on `#game-container canvas` (with real awaited gaps so
  timing/velocity are realistic), screenshot, and read the DEV hooks
  (`window.__lastResult`, `window.__penalty`, `window.__lastAim`) which exist only
  under `import.meta.env.DEV`.
- Stop at the ⏸ checkpoint and hand to the owner to playtest on their phone (the
  Vercel link auto-updates on push).

## Known follow-ups (not M5)
- Replace placeholder procedural SFX with real crowd samples (owner request).
- iOS has no Web Vibration API (haptics Android-only) — possible M7 experiment.
