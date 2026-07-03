# LEARNINGS — Penalty-Shootout friction ledger

Concept cards appended by `/wrap`. Format + method: `playbook/LEARNING_METHOD.md` in `instatank/time-tracker`. One card per friction, not per session; zero is a valid count.

### 2026-06-29 — Every on-screen button was dead for real users (SwipeInput pointer capture)

- What happened: `SwipeInput` called `setPointerCapture` + `e.preventDefault()` on the pointer stream, which silently starved Phaser's own input — every on-screen button (DBG, MODE, difficulty, Play Again) was dead for real fingers, while all headless checks stayed green. Fixed by starting the gesture on the canvas but tracking it on the **window** with no capture and no preventDefault (scroll is already blocked by `touch-action:none` in index.html).
- Concept: your test environment didn't press buttons the way real fingers do — **a passing test only covers the environment it ran in** (PLAYBOOK L8/L10). Headless synthetic events bypassed the exact input plumbing the capture had broken, so the checks couldn't see the breakage.
- In my words: (pending — answer at next wrap)
- Where else: (pending — answer at next wrap)
- Quiz question: "All automated checks are green but a playtest says every button is dead — what class of bug do you suspect first?"
- Internalized: no
