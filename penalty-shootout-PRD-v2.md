# PRD — Penalty Shootout (v2)

> **Owner amendment (2026-06-27):** The game is now **responsive in both
> orientations** instead of portrait-locked. The scene fills the screen and
> adapts to portrait or landscape (landscape is the primary, best-looking view —
> a real goal is wide). Wherever this doc says "portrait-locked" (esp. §3, §12),
> read "responsive, both orientations". Milestone 7 ships a PWA that supports
> both rather than locking one. Everything else stands.

## 0. How to read this doc
This is the source of truth for the build. The game ships in two stages:
- **Stage 1 (Milestones 1–7):** complete single-player game, both modes vs CPU. Shippable on its own.
- **Stage 2 (Milestone 8):** online 2-player via room code, added on top with no rewrite.

The reason Stage 2 is cheap is **Section 7 (the unified resolution model)** and **Section 8 (the input-provider abstraction)**. Build those correctly in Stage 1 and online becomes plumbing, not surgery. Do not skip or shortcut them.

---

## 1. Summary
A mobile-first PWA penalty game controlled by a single swipe. Two modes:
- **Taker** — swipe to shoot; a keeper tries to save.
- **Keeper** — a taker shoots; swipe/tap to dive and save.

Single-player (vs CPU) ships first. Online 2-player (one takes, one saves, via a shared room code) ships second as a contained addition.

The whole game lives or dies on **swipe feel**. Everything else is scaffolding around that one mechanic.

---

## 2. Goals / Non-goals

**Goals**
- A swipe-to-shoot that feels physically connected and rewards control over power.
- Two modes that each test a *different* skill (spatial precision vs timing/prediction).
- One place to tune every feel value.
- Installable PWA, playable one-handed on a phone.
- Architecture that makes online 2-player a clean add-on.

**Non-goals (v2 entirely)**
- Real-time/twitch netcode, server-authoritative physics, automatic matchmaking. Online is turn-based commit/reveal over room codes only.
- Accounts, profiles, persistent leaderboards, rankings.
- 3+ players, tournaments, leagues.
- Run-up timing mechanic, player/keeper customization, sprite art (procedural visuals for v2).
- 3D.

---

## 3. Platform & stack (decided — do not substitute without asking)
- **Phaser 3** (latest stable 3.x). *Not Phaser 4* — 3.x is far better documented and more reliable for AI-assisted code generation. Scaffold from the official `phaserjs/template-vite-ts`.
- **TypeScript** + **Vite** (hot reload, type safety, production build, Vercel-ready out of the box).
- **Firebase Realtime Database** + **anonymous auth** for online (Milestone 8 only).
- **Vercel** for hosting.
- **PWA**: manifest + service worker, installable, portrait-locked.
- **One `config.ts`** holding every tunable constant as a plain typed object. No magic numbers anywhere else.

---

## 4. Input layer (the make-or-break section)
Use the **Pointer Events API**, not legacy touch/mouse events. This is the 2026 standard, unifies touch + mouse + stylus, and removes tap delay.

Required implementation details (each prevents a specific, common bug):
- **`setPointerCapture(pointerId)`** on `pointerdown` — keeps the swipe locked to the input handler even if the finger slides off the ball or off-screen. Without this the swipe "drops" mid-gesture.
- **`touch-action: none`** (CSS) on the game canvas/container — stops the browser from interpreting the swipe as scroll/pan/zoom and fighting the game for the gesture.
- **Sample the swipe path** as an array of `{x, y, t}` on every `pointermove`. You need the intermediate points to compute curve; start+end alone is not enough.
- **Mouse fallback** comes free with Pointer Events, so desktop testing works without separate code.

Derived inputs (computed on `pointerup`):
- **Direction** = vector from swipe start (on/near the ball) to release point → mapped to a target on the goal plane. Horizontal angle sets left/right; vertical magnitude sets height.
- **Power** = **release velocity**, measured over the last ~80ms of the swipe (not the whole-gesture average), clamped `[minPower, maxPower]`. This rewards a snappy flick and ignores a slow drag-then-stop.
- **Curve** = signed lateral deviation of the path's midpoint from the straight start→end line, capped at `maxCurve` (low — it's a penalty). Sign sets bend direction.

---

## 5. Taker mode

### Targeting & accuracy
- Goal divided into a **3×2 zone grid** (TL, TM, TR, BL, BM, BR), used for both aiming and resolution.
- **Accuracy is mostly deterministic.** A clean swipe goes where aimed. Error is small and grows only with power:
  ```
  errorRadius = baseError + (kPower * power)      // baseError small; no roughness term
  landingPoint = targetPoint + randomPointWithin(errorRadius)
  ```
- **Design intent:** precision is reliable; the *risk* comes from geometry, not RNG. Aiming for a corner leaves less margin before the ball sails wide/over, and high power widens the error — so a controlled corner shot is the skilled play, a blasted corner is a gamble, and a safe central shot is easily saved. Risk/reward is emergent, not random punishment.

### Flight & outcome
- Ball travels along an arc (+ curve) to its landing point; scales down as it travels (fake depth).
- Keeper acts (CPU in solo). Resolve via **Section 7**.

### CPU keeper (opponent in solo Taker mode)
- Commits a dive `{zone, timing}` with a **reaction delay** after the strike.
- Difficulty = reaction speed + zone-guess accuracy (single `difficulty` knob in config).
- Must be beatable: well-placed corners beat it; lazy central shots get saved. Frustration kills a practice game — err toward beatable.

---

## 6. Keeper mode

### CPU taker (opponent in solo Keeper mode)
- Commits `{targetZone, power, curve}`.
- **Telegraphs subtly** — a small body lean / plant-foot cue a beat before striking — so a sharp player can read it. Tell is readable but not 100% reliable (`tellStrength`, `tellLeadTime` in config).
- Ball has a defined `flightTime` giving the player a reaction window.

### Player input (solo)
- Swipe or tap a direction → dive to a zone. Captured as `{diveZone, diveTiming}`, where `diveTiming` = the moment of input relative to the strike.
- **Timing matters:** diving at the right moment = full reach; too late = can't get there even if the direction was right; early commit is allowed but locks you in.

### Resolve
Same function as Taker mode (**Section 7**). The keeper's input object is identical regardless of who/what produced it.

---

## 7. Unified resolution model (the keystone — build this as a pure function)
A single pure function computes every save/goal in the game:

```
resolvePenalty(takerInput, keeperInput, seed) -> { saved: boolean, ballPath, keeperPath, ... }

takerInput  = { targetZone, power, curve, landingPoint }
keeperInput = { diveZone, diveTiming }
```

Save probability:
```
saveChance = baseSaveChance
           + zoneMatchBonus      // keeper's dive zone overlaps ball's landing zone
           + timingQuality       // how close diveTiming was to the ideal window
           - powerPenalty        // harder shots are harder to stop
           - cornerPenalty       // shots tight to post/bar are harder to reach
saved = seededRandom(seed) < clamp(saveChance, 0, maxSaveChance)
```
- `maxSaveChance` < 1.0 so a perfectly-placed corner is effectively unsaveable (keeps skill meaningful).
- All weights live in `config.ts`.
- **Critical property:** this function does not know or care whether `keeperInput`/`takerInput` came from the CPU, a local human, or a remote human. That property is what makes online a plug-in (Section 8).
- **Determinism:** identical inputs + identical `seed` always produce the identical result. Required so that, online, both phones can replay the same outcome.

---

## 8. Input-provider abstraction (the thing that makes online cheap)
Both the taker's action and the keeper's action arrive through a common interface:

```
interface InputProvider {
  getTakerInput(): Promise<TakerInput>
  getKeeperInput(): Promise<KeeperInput>
}
```

Three implementations:
- **LocalHumanProvider** — reads the live swipe.
- **CpuProvider** — generates the AI's action (keeper or taker).
- **RemoteProvider** — reads the opponent's committed action from Firebase (Milestone 8).

The game loop asks the provider for an input; it never branches on "is this CPU or human." Solo Taker mode = LocalHuman (taker) + Cpu (keeper). Solo Keeper mode = Cpu (taker) + LocalHuman (keeper). Online = LocalHuman + Remote. **Same loop, same resolution function, swapped providers.**

---

## 9. Single-player session & scoring (Stage 1)
- A session = **5 kicks** in the chosen mode.
- Taker: count goals scored. Keeper: count saves made.
- End screen with result + restart.
- **Practice mode:** unlimited kicks, no score, used for feel-tuning and warm-up.

---

## 10. Online 2-player (Milestone 8 — fully specified, built last)

### Flow
1. Player A taps **Create Room** → app generates a 4–5 char code → writes `/rooms/{code}` in Realtime DB, becomes **host**.
2. Player B taps **Join Room**, enters the code → joins `/rooms/{code}` as **guest**.
3. Presence: both marked online; either leaving is detected (`onDisconnect`).

### Match structure
- A standard alternating shootout: A takes / B keeps, then B takes / A keeps, alternating for 5 rounds each; sudden death if level.
- Each kick is **commit/reveal**:
  - Taker commits `{direction, power, curve}` to the room.
  - Keeper commits `{zone}` to the room. (Online keeper timing simplifies to zone prediction — see note.)
  - When both inputs are present, the **host** runs `resolvePenalty(...)` with a shared `seed` and writes the result.
  - Both clients read the result and play the identical animation.
  - Swap roles, next kick.

### Why host-authoritative
One side computing the outcome and broadcasting it guarantees the two phones never disagree. Simpler and more robust than a Cloud Function for a casual 2-player game. (Server-side validation via Cloud Functions is a later anti-cheat upgrade, out of scope for v2.)

### Data shape (single small room node — fine for 2 players)
```
/rooms/{code}
  host: uid
  guest: uid
  state: "waiting" | "takerCommit" | "keeperCommit" | "reveal" | "done"
  round: number
  seed: number
  takerInput: {...} | null
  keeperInput: {...} | null
  result: {...} | null
  score: { host: n, guest: n }
  presence: { hostOnline, guestOnline }
```

### Online interaction note
Online keeper is **prediction**, not reaction: the keeper commits a zone blind, then the reveal animates both committed actions. This is authentic to real penalties (keepers commit before they can react) and keeps netcode trivial. The full timing-reaction experience remains in **solo** keeper mode. Depth online still exists because power and placement interact with the keeper's guess in the resolution function.

### Disconnect handling (minimum viable)
- If a player disconnects mid-match: show "opponent left," offer return to menu. No reconnection/resume in v2.

### Out of scope for online v2
Auto-matchmaking, ranking, chat, reconnection, spectators, >2 players.

---

## 11. Feel & tuning (where the real work is)
Every value below in `config.ts`, grouped and commented:
- **Input:** `minPower`, `maxPower`, `velocityWindowMs`, `maxCurve`, `baseError`, `kPower`.
- **Flight:** `flightDuration`, `arcHeight`, easing curve, `scaleStart`, `scaleEnd`.
- **CPU keeper:** `reactionDelay`, `guessAccuracy`, `diveSpeed`, `reach`, `difficulty`.
- **CPU taker:** `tellStrength`, `tellLeadTime`, `flightTime`, target-distribution weights.
- **Resolution:** `baseSaveChance`, `zoneMatchBonus`, `timingWindowMs`, `powerPenalty`, `cornerPenalty`, `maxSaveChance`.

**Mandatory debug overlay** (toggle in a corner): prints live swipe vector, power, curve, errorRadius, target zone, landing zone, keeper zone, timing quality, and save/goal. Feel cannot be tuned blind — this is the single biggest tuning accelerator.

**Haptics:** `navigator.vibrate` on ball contact and on save. Sound optional in v2.

---

## 12. UI flow
Splash → Mode select (Take / Save / Practice / **Online** [Milestone 8]) → gameplay → result → menu.
Minimal chrome. The pitch, goal, and ball are the screen. Primary controls in the lower thumb zone.

---

## 13. Build order (sequenced so feel is proven before complexity stacks)
Stop for a human playtest at the ⏸ checkpoints before continuing.

1. **Scaffold** from `template-vite-ts`. Static scene: perspective goal, ball, keeper, 3×2 zone grid. Runs locally, deploys to Vercel.
2. **Input layer**: Pointer Events + capture + `touch-action:none` + path sampling. **Debug overlay** printing derived swipe values. No ball flight yet.
3. **Ball flight** from the swipe (no keeper). ⏸ **Stop and tune feel. This checkpoint decides whether the game is good.**
4. **Unified `resolvePenalty` (Section 7)** + **InputProvider interface (Section 8)** + zones + CpuProvider keeper → **Taker mode complete**. ⏸
5. **Keeper mode**: CpuProvider taker + tell + dive input + timing → resolves through the *same* function. ⏸
6. **Sessions + scoring + practice mode.**
7. **PWA** (manifest, service worker, install, portrait lock) + haptics + visual polish. **← Stage 1 ships here.**
8. **Online (Section 10)**: Firebase init + anonymous auth + RemoteProvider + Create/Join room UI + commit/reveal + host-authoritative resolution + presence/disconnect. ⏸

---

## 14. Definition of done
- **Stage 1:** both modes playable as 5-kick sessions + practice, swipe feels good (subjective but real — the bar is "I want one more go"), installs as a PWA, all feel values in `config.ts`, debug overlay works.
- **Stage 2:** two phones join by code, play a full alternating shootout with identical outcomes on both screens, graceful handling when someone leaves.
