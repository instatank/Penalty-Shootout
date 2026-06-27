# CLAUDE.md — Penalty Shootout

Project guide for AI sessions. Keep it short. Read `penalty-shootout-PRD-v2.md` for the full spec — it is the source of truth.

## What this is
A mobile-first PWA penalty-shootout game that is **responsive in both orientations** (owner decision 2026-06-27, replacing the PRD's original portrait-only lock). Landscape is the primary/best-looking view (a real goal is wide); portrait also works. The whole game lives or dies on **swipe feel**. Ships in two stages:
- **Stage 1 (Milestones 1–7):** complete single-player game, both modes vs CPU.
- **Stage 2 (Milestone 8):** online 2-player over room codes, added on top with no rewrite.

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
index.html              # touch-action:none viewport + portrait "rotate" hint
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
- **Milestone 4 — Taker mode complete: COMPLETE (in owner playtest).**
  Pure deterministic resolvePenalty() (game/resolve.ts, no Phaser): saveChance = base + zoneMatch·zoneBonus·timingQuality − power·powerPenalty − cornerness·cornerPenalty, seeded roll. InputProvider interface (input/providers.ts): LocalHumanProvider (live swipe → seeded TakerInput via aim.finalizeShot) + CpuProvider keeper (dive zone+timing from CONFIG.CPU_KEEPER.difficulty). GameScene runs a provider-driven kick loop that NEVER branches CPU/human (the M8 keystone): aim → CPU keeper dive → resolve → GOAL/SAVE/MISS banner → reset. Verified: corner+power is unsaveable even on a correct keeper read (PRD risk/reward); loop survives orientation changes (cancel() resolves the pending taker promise).
- Next: ⏸ owner playtest sign-off, then **Milestone 5 — Keeper mode** (CpuProvider taker + tell + human dive input + timing, resolved through the SAME function).
