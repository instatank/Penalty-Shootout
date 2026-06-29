# Juice & Game-Feel Brief — Penalty Shootout (Phaser 3)

> This is the owner's brief, saved verbatim (2026-06-29). The companion file
> [`juice-plan.md`](./juice-plan.md) is Claude's step-by-step implementation
> plan derived from it (grounded in the actual codebase). On any clash, this
> brief is the intent; the plan is how we deliver it.

## Context for Claude Code

This is a 2D penalty shootout game built in **Phaser 3** (Vite, deploys to Vercel). It already has working core mechanics (taker shot with single-gesture aim+power, reach-based keeper with commit-timing, shootout loop). The game currently looks plain. This brief adds the **"juice" layer** — motion, lighting, camera, and feedback — that makes it read as a proper game.

**Art lane:** stylized / low-poly 3D look (NOT photoreal). All juice below should complement that: clean directional lighting, crisp grounded shadows, controlled-saturation palette, bloom on the floodlights. Avoid realism filters.

**Philosophy:** perceived quality is mostly motion + lighting + sound, not asset fidelity. Everything in this doc is **code-only unless flagged `[NEEDS ASSET]`** — build it against existing placeholders/assets.

**Global rule — easing everywhere:** nothing moves or appears linearly. Every transform, fade, and UI change uses an easing curve (ease-out for arrivals, ease-in for exits, back/elastic sparingly for personality). Linear motion is the #1 tell of an unpolished game.

**Restraint:** screen shake, bloom, and particles are easy to overdo. Build each with a tunable intensity parameter and default to subtle. More is not better.

---

## Build in three tiers. Do Tier 1 first and stop for review before Tier 2.

The first four items deliver most of the visual jump with zero new art. Build them, then let me judge the difference before continuing.

---

## TIER 1 — Highest payoff, do first

### 1. Dynamic net (the money shot)
A static net looks dead; a net that ripples and bulges when the ball hits it is the single most impactful item here.

- Build the net as a grid of points connected by springs (verlet or spring-mass), rendered as a mesh/rope, OR as a frame-based ripple animation triggered on goal.
- On a goal, the ball transfers impulse to the nearest net points, producing a localized bulge that propagates and settles. The net should overshoot and oscillate before resting (springy, not a single snap).
- Tune stiffness and damping so it feels taut but alive.

**Acceptance:** a scored ball visibly punches and ripples the net at the point of entry, then settles. Different entry points ripple in different places.

### 2. Ball shadow + grounded depth
A moving, scaling shadow under the ball is the cheapest, strongest depth cue in a 2D scene.

- Add a separate blurred-ellipse shadow sprite under the ball.
- As the ball travels toward goal and rises, the shadow moves independently, **scales smaller, and softens (lower alpha / more blur)** with height. As the ball descends, the shadow grows and sharpens back.
- Apply the same grounded-shadow treatment to the keeper and the taker so all actors sit in real space.

**Acceptance:** when the ball is high and far, its shadow is small, faint, and offset from it; the separation reads clearly as "off the ground."

### 3. Dynamic camera (never hold a static frame)
Real football games constantly move the camera. This is pure Phaser camera work (`zoomTo`, `pan`, `shake`).

- Slight push-in (zoom) during the run-up / aim.
- On the strike: brief snap toward the ball.
- On a **goal**: zoom/celebration framing on the net + scorer.
- On a **save**: framing that favors the keeper.
- Between turns: smooth re-frame to the neutral penalty view.
- All moves eased, never instant cuts.

**Acceptance:** the camera is subtly alive at all times and reacts differently to a goal vs a save vs a new turn. Nothing snaps without easing.

### 4. Hit-stop on contact
A micro-freeze on impact makes strikes and saves feel weighty.

- Freeze the frame for ~60–100ms at the moment of ball-strike, and again at the moment of a save (ball meets keeper).
- Implement via a brief drop of `timeScale` to 0 (scene tweens + physics) then restore, or an equivalent short pause. Keep it short enough to feel like weight, not lag.

**Acceptance:** striking the ball and making a save each produce a perceptible, satisfying "thunk" pause, not a stutter.

---

## TIER 2 — Core feel

### 5. Screen shake
- Short, sharp shake via `cameras.main.shake(duration, intensity)`.
- Trigger on a powerful strike and on a save. Scale intensity with shot power.
- Tunable; default subtle. Overdone shake is nauseating — err low.

**Acceptance:** a max-power strike has a noticeable but tasteful kick; a soft shot barely shakes.

### 6. Particles
Good games are always quietly breathing with particles.

- Turf/grass flecks kicking up at the strike point on contact.
- A spray off the net on a goal.
- Confetti / pyro burst on a match win.
- A small dust puff where the keeper lands on a dive.
- Use Phaser's particle emitters; keep counts modest for mobile performance.

**Acceptance:** each key moment (strike, goal, save-dive, win) has its own appropriate particle burst.

### 7. Ball trail + spin
- A motion-blur trail behind the ball in flight (alpha-decaying afterimages or a trail emitter).
- Visible spin on the ball (rotate the sprite; faster spin on harder shots).
- Combined with the existing depth scale-down, flight should feel fast and physical.

**Acceptance:** a struck ball leaves a clean trail and visibly spins; harder shots spin and blur more.

---

## TIER 3 — The finish

### 8. Slow-motion replay
A signature of the best penalty games; high perceived value.

- After a **goal** or a **notable save**, replay the last ~1.5s in slow motion from a more dramatic camera angle, then return to play.
- Implement by recording the relevant transforms over the final moments and playing them back at reduced `timeScale` with the camera repositioned, OR by re-simulating the resolved shot for the replay cam.
- Add a skip/tap-to-continue so it never blocks a player who wants pace.

**Acceptance:** scoring a good goal triggers a brief, skippable slow-mo from a flattering angle that makes the moment feel earned.

### 9. Post-processing grade (ties everything together)
Phaser 3.60+ has built-in FX (`postFX` / `preFX`) — use them.

- A subtle **vignette** to focus the frame.
- **Bloom** concentrated on the floodlights / bright highlights (this is what sells the stylized-stadium look).
- A consistent color grade across all scenes so the whole game feels like one product.
- Keep bloom restrained — low-poly + tasteful bloom reads premium; heavy bloom reads cheap.

**Acceptance:** the whole game shares one cohesive graded look; floodlights glow softly; the frame has gentle edge falloff.

### 10. UI / screen-transition juice
UI polish is what reads as "professional" before a player even kicks a ball.

- No hard cuts between screens — animate every transition (slide/fade/scale, eased).
- Buttons get press states and tactile feedback (scale-down on press, subtle bounce on release).
- On the results screen, **count the score up** rather than snapping it; stagger element entrances.
- A clean HUD: current score, round/shot indicator, whose turn — all animated when they change.
- `[NEEDS ASSET]` a strong sporty display typeface and a coherent UI kit (buttons, panels, icons) materially upgrade this; flag where placeholder UI should later be swapped for the sourced kit.

**Acceptance:** moving between menu → match → results never hard-cuts; buttons feel tactile; the final score animates in with weight.

---

## Lighting note for the low-poly lane (applies across all of the above)

Low-poly reads best with a **single clear directional "key" light** (the floodlight), **crisp grounded shadows**, a touch of ambient fill so shadows aren't black, and a **saturated-but-controlled palette**. The bloom in item 9 should sit on the floodlights specifically. This lighting model is what makes flat low-poly geometry feel three-dimensional — lean into it rather than fighting for realism.

---

## Suggested order of operations

1. Tier 1 items 1–4. **Stop and review.**
2. Tier 2 items 5–7.
3. Tier 3 items 8–10 (slow-mo and post-grade are the finishing layer — do them once the rest feels good).

Build each item with a tunable intensity/parameter so feel can be dialed in after seeing it in motion. Prioritize 60fps on mobile throughout — cap particle counts and keep the net sim resolution modest.
