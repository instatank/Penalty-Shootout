# LEARNINGS — Penalty-Shootout friction ledger

Concept cards appended by `/wrap`. Format + method: `playbook/LEARNING_METHOD.md` in `instatank/time-tracker`. One card per friction, not per session; zero is a valid count.

### 2026-06-29 — Every on-screen button was dead for real users (SwipeInput pointer capture)

- What happened: `SwipeInput` called `setPointerCapture` + `e.preventDefault()` on the pointer stream, which silently starved Phaser's own input — every on-screen button (DBG, MODE, difficulty, Play Again) was dead for real fingers, while all headless checks stayed green. Fixed by starting the gesture on the canvas but tracking it on the **window** with no capture and no preventDefault (scroll is already blocked by `touch-action:none` in index.html).
- Concept: your test environment didn't press buttons the way real fingers do — **a passing test only covers the environment it ran in** (PLAYBOOK L8/L10). Headless synthetic events bypassed the exact input plumbing the capture had broken, so the checks couldn't see the breakage.
- In my words: (pending — answer at next wrap)
- Where else: (pending — answer at next wrap)
- Quiz question: "All automated checks are green but a playtest says every button is dead — what class of bug do you suspect first?"
- Internalized: no

### 2026-07-04 — Verification checks failed against a game that keeps playing itself (snapshot vs convergence)

- What happened: while verifying Track A headless, two checks "failed" on correct code. (1) The timeScale check sampled the game at one instant and caught a legitimate 90 ms hit-stop freeze mid-flight — because practice mode keeps auto-kicking while the test runs, there is always a chance of sampling inside a real, temporary freeze. (2) The ball-position check sampled at a fixed 450 ms delay and sometimes raced the game's own loop (next kick had already reset the ball). Fixed by asserting **convergence**, not an instant: wait until timeScale RETURNS to 1, and sample the ball only once it is STATIONARY.
- Concept: a live system that acts on its own schedule can't be judged by one snapshot — **assert what the system settles to, not what it happens to be at the moment you looked.** Fixed-delay sampling and instant-state asserts are flaky by construction against anything self-running.
- In my words: (pending — answer at next wrap)
- Where else: (pending — answer at next wrap)
- Quiz question: "A check that reads live system state passes 8 runs out of 10 with no code changes in between — what's the first fix to try?"
- Internalized: no
