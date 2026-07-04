# Design Rework — One-Shot Action Plan

**Status: EXECUTING.** Track A core **A1 + A2 + A4 = DONE** (2026-07-04, awaiting
owner playtest ⏸ — see CLAUDE.md / HANDOFF.md for what landed). Remaining: A3 + A5
(Sonnet), Track B (Sonnet, after A), Track C (Opus).
Date: 2026-07-03. Branch: `claude/fable5-design-rework-1avwyo`.

Goal: make the game **aesthetically attractive** and **functionally trustworthy** in one
coordinated execution pass. Built from (1) a full code audit of every functional flaw
(including the three the owner reported, all confirmed with root causes) and (2) design
research on the best games in the category (Football Strike, Flick Kick Football,
Score! Hero, Penalty Kick Online, Penalty Shooters 2, FIFA Mobile).

Non-negotiables preserved throughout: `resolvePenalty` stays **pure + deterministic**
(seeded — the online keystone), the kick loop stays **provider-agnostic**, all new
tunables go in `CONFIG` (Rule 1), portrait-primary responsive layout.

---

## Part 1 — Root causes of the reported bugs (confirmed)

### Bug 1: "Ball goes through the keeper / can't tell if it's saved"
Four compounding causes, all in keeper view unless noted:
1. **The flight is played before the result exists.** `beginKeeperReaction` flies the
   ball all the way to its landing point in the net (`GameScene.ts:1206,1241`); the
   penalty is only resolved after the dive window closes, then `settleKeeperOutcome`
   (`GameScene.ts:1186`) tweens the already-landed ball back to the gloves. The save is
   a 200 ms after-the-fact teleport.
2. **Draw order:** the ball (depth 400) always renders in front of the keeper
   (depth 380) (`GameScene.ts:140-142`) — it literally draws *through* the body.
3. **The dive you see isn't the dive that's judged.** The human dive animates to the
   zone centre (`GameScene.ts:1063`), but `resolvePenalty` judges the hands at a
   timing-interpolated point (`resolve.ts:100-104`). A late dive shows the keeper on
   the ball yet resolves GOAL.
4. **Invisible dice:** the reach ellipse (±20 %/±30 % of the goal) is much bigger than
   the drawn keeper (~17 % wide), and a wide `margin: 0.18` band makes glove-edge shots
   a hidden seeded coin flip — two identical-looking shots resolve differently.
   Plus the outcome banner colours are keyed to the raw outcome, so in keeper view a
   **conceded goal shows as a green celebratory "GOAL!"** (`GameScene.ts:1355-1361`).

### Bug 2: "Power doesn't affect whether the goalie gets there"
The CPU keeper's dive timing is pure ±45 ms jitter (`providers.ts:161`), never derived
from the ball's flight time; with `diveLateWindowMs: 240` its dive progress is always
≥ 0.81 — it always "gets there". Flight duration does scale with power
(760→470 ms) but is **animation-only**; it is never fed into resolution. The only power
effect is a max-20 % reach shrink (`powerReachPenalty`). In keeper view, flight time is
a fixed 800 ms regardless of the CPU's shot power.

### Bug 3: "Ball hits the post but still counts as a goal"
There is **no woodwork in the model at all**. `resolvePenalty` scores the entire goal
rect (`resolve.ts:93`); posts are drawn centred on the rect edges with 5 %-of-goal-height
thickness (`GameScene.ts:1686-1694`), so landings visually on the post resolve as clean
goals (and just-wide "misses" can also visually overlap the post).

### Other confirmed flaws found in the audit
- **B1 (High):** keeper-mode dive lateness is measured from the *strike*, not ball
  *arrival* — with an 800 ms flight, any dive later than ~370 ms after the strike is
  judged "never moved", even though the animation completes and the keeper visibly
  covers the ball. Waiting to see the ball guarantees a goal.
- **B2 (Med):** `strikeAt` is predicted on the wall clock but the strike fires on
  Phaser's rAF clock (`GameScene.ts:1221-1233`) — frame drops silently skew every dive
  late.
- **B3 (Med):** the CPU keeper "reads" the post-scatter **landing** zone, not the aimed
  zone (`providers.ts:141`) — scatter can never wrong-foot it, weakening the
  power/accuracy tradeoff further.
- **B4 (Low):** on a wide/over miss the keeper lurches to dead centre instead of its
  committed dive (`resolve.ts:95` + `GameScene.ts:1136`).
- **B5 (Low-Med):** the end screen restarts on any pointer-up, so a finger still down
  from the final action instantly skips the score.
- **B6 (Low-Med):** rotating the phone right after a resolved kick voids the kick and
  retakes it — the result should be recorded once resolved; only presentation should
  abort.
- **B7 (Low):** scatter is a circle in *pixels* on a 2.6:1 goal — vertical error is
  effectively 2.6× the horizontal, so power shots sky over the bar far more than they
  go wide.
- **B8 (Low):** `margin: 0.18` coin-flip band is far too wide (see Bug 1.4).
- **B9 (Low):** camera `baseZoom: 0.9` also shrinks/insets all pinned HUD.
- **B10 (decision):** in sudden death the player always kicks first every round —
  fine for a game, but make it a deliberate call.

---

## Part 2 — What the best games in the category do (research digest)

- **Football Strike (Miniclip, ~100 M installs)** validates our exact two-view model
  (behind-taker shooting, keeper-POV saving with a glove-throw swipe). Its saves are
  unmistakable because the gloves **visibly parry the ball away** — deflection, never
  vanish. Swipe speed = shot speed, and fast shots visibly beat slow gloves. Corners
  score premium points.
- **Flick Kick Football (PikPok)** proves a strong flat/poster **art concept beats
  cheap realism** — 2-tone silhouettes, halftone crowd, warm limited palette — all
  achievable procedurally. Its modern reviews also warn: flick **input latency is the
  #1 killer**.
- **Score! Hero** — drama staging: slow-mo on the decisive shot, big camera cut on
  goals, crowd swell; single-thumb portrait flow with minimal chrome during play.
- **FIFA Mobile / EA FC** — tension via silence: crowd ducks to a hush before the kick,
  heartbeat beat, then the noise explodes on the result.
- **Penalty Shooters 2** — the alternating shoot/save duel plus a lightweight
  **tournament bracket** wrapper is what gives a simple penalty game long replay value;
  keepers leak readable tells on purpose.
- **Hyper-casual (Ketchapp)** — graded precision scoring (edge vs dead-centre) and a
  sub-second retry loop.
- Research-grade penalty psychology (plant-foot reads, ~400-600 ms commitment window,
  deception lowers save rates) directly validates our tell-then-strike keeper mode and
  suggests a future "fake tell" mechanic.

---

## Part 3 — The action plan

Three tracks, executed in order (A → B → C), each ending at a build + headless
verification gate, with one owner playtest ⏸ at the end of the whole pass (or per
track if preferred). Estimated shape: A and B are logic/feedback surgery in existing
files; C is a rewrite of the `draw*` layer only (safe: resolution never reads visuals).

### Track A — Correctness core (fix the game's honesty)

**A1. "The save happens where you see it" — keeper-view outcome rework.**
Resolve the penalty at (or before) ball arrival, not 250 ms after: close the dive
window at arrival; on a save, the flight tween **ends at the gloves** (as taker view
already does) with an impact + parry, never landing in the net first. Swap ball/keeper
depths in keeper view so the body can occlude the ball. Animate the human dive to the
*judged* hand position (`result.keeperNorm`), not the zone centre. Theme banner text +
colour by `playerWon` ("SAVED!" green when you're the keeper; conceded = red "GOAL
CONCEDED"). Files: `GameScene.ts` (beginKeeperReaction / settleKeeperOutcome /
onDiveSwipe / showOutcome).

**A2. Power vs keeper — couple ball speed into resolution.**
Pass the shot's actual flight time into the model: `resolvePenalty(taker, keeper, seed,
{flightMs})` stays pure/deterministic. CPU keeper `diveTiming` becomes
`commitTime + jitter − flightMs`, so a blasted shot genuinely arrives before the hands
and a soft shot gives the keeper time; dive *animation* duration scales to the flight so
the eye agrees. Keeper view: CPU shot power scales the 800 ms flight window too (fast
CPU shots = harder saves). Raise `powerReachPenalty`'s role accordingly and retune.
New knobs: `RESOLUTION.keeperCommitMs`, `CPU_TAKER.flightTimeFast/Slow`.
Files: `resolve.ts`, `providers.ts`, `GameScene.ts`, `config.ts`.

**A3. Woodwork.**
Add a post/crossbar band in normalised coords (`RESOLUTION.postBandNorm`, matched to the
drawn 5 % frame) inside `resolvePenalty` → new outcome `'post'` (not scored, seeded
optional lucky-deflection-in stays deterministic). Scene plays the payoff: frame flash,
sharp procedural *ping*, ball rebounds back toward the pitch, micro-shake, "OFF THE
POST!" banner. Near-misses become the most emotional moment instead of a lie.
Files: `resolve.ts`, `aim.ts` (shotOutcome), `GameScene.ts`, `Sfx.ts`, `config.ts`.

**A4. Keeper-mode timing that matches what you see.**
Judge dive lateness against **ball arrival** (flight time), not the strike: diving any
time the ball is still in the air, early enough for the dive animation to finish,
counts as reaching. Set `strikeAt` from the real strike callback (wall-clock at fire
time), keeping early-commit support. Files: `GameScene.ts`, `config.ts`
(`diveLateWindowMs` semantics), `resolve.ts` docs.

**A5. Fairness details.**
CPU keeper reads the **aimed** zone, not the scattered landing (`providers.ts`);
miss → keeper still dives its committed zone; elliptical scatter matched to goal aspect
(fixes over-the-bar bias); shrink `margin` to ≤ 0.05 once A1-A3 land; record a resolved
kick even if a rotation aborts its presentation; end-screen restart only arms after the
entrance animation completes.

**A6. Decisions to confirm with the owner (one-line answers, defaults proposed):**
sudden-death first-kicker alternates (ABBA-lite) — default **yes**; lucky post
deflection-in chance — default **small (≈15 %, seeded)**.

### Track B — Feedback & feel (make every outcome unmistakable)

**B1. Keeper parry/catch language (both views).** Central-ish saves = a **catch** with
a squash-and-hold on the gloves; reach saves = a **punch/parry** that sends the ball on
a believable outgoing vector (corner saves punched wide) with a glove impact spark.
Replaces the current generic 200 ms deflect tween.

**B2. Fingertip near-miss.** When a goal lands just outside reach, the keeper still
dives at full stretch and the ball gets a fingertip graze (spark + slight wobble) — the
data (distance vs reach-ellipse edge) already exists in the result.

**B3. Honest misses.** Over → the ball sails into the crowd (keeps flying, shrinks,
crowd "ooh"); wide → thuds off an ad hoarding. No more ball freezing in empty space.

**B4. Graded goals.** "GOAL!" vs "TOP CORNER!" tier (extra confetti, bigger banner —
replay already triggers on corners). Rewards precision beyond winning.

**B5. Tension staging.** 400-600 ms pre-kick hush (crowd ducks, subtle vignette pulse);
from kick 5 / sudden death: darker grade, tighter default camera, heartbeat between
kicks, pulsing score dots. Contrast makes the payoff moments hit.

**B6. Speed made visible.** Keeper pose differentiates by `diveProgress`: on fast shots
a stretched, falling-short dive; on soft shots a comfortable arrival. Players must *see*
why power mattered (pairs with A2).

**B7. Dead-time & latency audit.** Release→launch must feel instant; full kick loop
under ~4 s; tap-to-skip on every banner/break (already on replay — extend everywhere).

### Track C — Aesthetic rework (the "make it attractive" pass)

Everything stays procedural (no asset files); all colours/geometry through `CONFIG`.

**C1. Art direction: flat poster/silhouette style** (Flick Kick-inspired). A committed
palette pass; stadium becomes rows of 2-tone silhouette **crowd cells with per-cell
colour variance that stand up in a wave on goals**; gradient dusk sky + floodlight
glow pools; halftone-feel mow stripes; ad hoardings (also the wide-miss target);
richer goal frame with depth (front/back post shading, stanchions).

**C2. Characters with life.** Articulated keeper (separate limbs → real dive poses:
stretch, catch, punch, deflated concede) and a taker **run-up** (2-3 steps; the plant
foot becomes the natural home of the keeper-mode tell). Silhouette style keeps this
cheap — poses, not skeletal animation.

**C3. Keeper-mode glove presence.** Render gloves flying to your dive target during a
human dive (Football Strike's throw-the-gloves feel) so you see what you did.

**C4. UI restyle.** One type/colour system: HUD scoreboard, buttons, banners, power
meter, end screen redesigned to the poster palette; **dedicated UI camera** so juice
zoom never shrinks pinned HUD (fixes B9); banner system gains tiers (goal / top corner
/ post / save / concede).

**C5. Aim & curve read.** Aim indicator shows the **predicted bend** of a curved swipe;
the flight visibly wraps around the keeper's dive — signature-feel skill ceiling.

### Track D — optional, after playtest (not in the one-shot)
Tournament bracket wrapper (flag/team pick, group → knockout of best-of-5s) on top of
`shootout.ts`; CPU keeper pre-kick mind-games (line shuffling, bait leans); "fake tell"
taker mechanic for Phase 6 PvP.

---

## Part 4 — Execution & verification plan

1. Execute Track A → `npm run build` + headless suite: power sweep (soft vs blasted
   shot vs same dive → different outcomes), post-band landings → `'post'`, keeper-view
   save never shows net contact, late-but-airborne dives save, resolved-kick survives
   rotation. Extend `__penalty` dev hooks for each.
2. Execute Track B → headless: parry/catch selected by save geometry, near-miss graze
   fires, miss trajectories, skip-taps everywhere, loop-time budget.
3. Execute Track C → visual pass on portrait + landscape, both views; build gate;
   perf check (crowd cells + particles at 60 fps on mobile-class throttling).
4. `/ship` ritual, push, single owner playtest ⏸ of the whole rework.

Determinism guarantee: every change to `resolvePenalty` (flightMs input, post band,
smaller margin) keeps it pure and seeded — same inputs ⇒ same result — so Phase 6
online replay is unaffected. The provider-agnostic loop shape is untouched.
