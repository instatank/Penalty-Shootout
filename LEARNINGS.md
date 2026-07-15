# LEARNINGS — Penalty-Shootout friction ledger

Concept cards appended by `/wrap`. Format + method: `playbook/LEARNING_METHOD.md` in `instatank/time-tracker`. One card per friction, not per session; zero is a valid count.

### 2026-06-29 — Every on-screen button was dead for real users (SwipeInput pointer capture)

- What happened: `SwipeInput` called `setPointerCapture` + `e.preventDefault()` on the pointer stream, which silently starved Phaser's own input — every on-screen button (DBG, MODE, difficulty, Play Again) was dead for real fingers, while all headless checks stayed green. Fixed by starting the gesture on the canvas but tracking it on the **window** with no capture and no preventDefault (scroll is already blocked by `touch-action:none` in index.html).
- Concept: your test environment didn't press buttons the way real fingers do — **a passing test only covers the environment it ran in** (PLAYBOOK L8/L10). Headless synthetic events bypassed the exact input plumbing the capture had broken, so the checks couldn't see the breakage.
- In my words: (pending — answer at next wrap)
- Where else: (pending — answer at next wrap)
- Quiz question: "All automated checks are green but a playtest says every button is dead — what class of bug do you suspect first?"
- Internalized: no (quizzed 2026-07-12: founder answered "I don't know" — answer re-explained: suspect a gap between how the TESTS press buttons and how REAL FINGERS do — the test environment exercised a different input path than the one that's broken. Streak 0.)

### 2026-07-04 — Verification checks failed against a game that keeps playing itself (snapshot vs convergence)

- What happened: while verifying Track A headless, two checks "failed" on correct code. (1) The timeScale check sampled the game at one instant and caught a legitimate 90 ms hit-stop freeze mid-flight — because practice mode keeps auto-kicking while the test runs, there is always a chance of sampling inside a real, temporary freeze. (2) The ball-position check sampled at a fixed 450 ms delay and sometimes raced the game's own loop (next kick had already reset the ball). Fixed by asserting **convergence**, not an instant: wait until timeScale RETURNS to 1, and sample the ball only once it is STATIONARY.
- Concept: a live system that acts on its own schedule can't be judged by one snapshot — **assert what the system settles to, not what it happens to be at the moment you looked.** Fixed-delay sampling and instant-state asserts are flaky by construction against anything self-running.
- In my words: (pending — answer at next wrap)
- Where else: (pending — answer at next wrap)
- Quiz question: "A check that reads live system state passes 8 runs out of 10 with no code changes in between — what's the first fix to try?"
- Internalized: no

### 2026-07-12 — The shared playbook was unreachable from this session (cross-repo docs dependency)

- What happened: CLAUDE.md's session-start step says to read `playbook/PLAYBOOK.md` from the `instatank/time-tracker` repo (locally or via GitHub). This session's access was scoped to `instatank/penalty-shootout` only, so both routes were denied and the shared SOPs/learning method couldn't be consulted — the session had to fall back to the copies/summaries inside this repo (`.claude/skills/ship`, `/wrap`, LEARNINGS.md's own format examples).
- Concept: a "single source of truth" stored in a DIFFERENT repo is a hard runtime dependency on cross-repo access — any session/tool/person without that access silently loses the rulebook. Either grant the access with the task, or keep a self-sufficient copy of the operating rules inside each repo that needs them (and treat the external one as the master to sync from).
- In my words: "the playbook needs to be stored in every repo (not rely on the time-tracker repo to be available)" (founder, 2026-07-12)
- Where else: "same as 2" — i.e., anywhere that relies on the time-tracker repo being reachable (founder, 2026-07-12)
- Quiz question: "Your project docs point to a rulebook in another repo — what must be true for every future work session for that pointer to actually work, and what's the fallback if it isn't?"
- Internalized: no (teach-back 2026-07-12 captured the fix — local copies per repo)

### 2026-07-12 — Goalie visibly dove but the game judged a frozen keeper (phantom saves)

- What happened: the owner reported ~5% of keeper-mode kicks where the goalie visibly dove one way, the ball went another, and it still counted as a SAVE — while the slow-mo replay showed the goalie NOT moving. Root cause: a dive flick whose finger touched DOWN before the CPU's strike (very natural — anticipating) was captured and ANIMATED, but never SUBMITTED to the resolver, because the submit was gated on the sign of "flick start minus strike time" instead of on whether the strike had actually happened. The unsubmitted dive fell through to the "no dive" deadline, which judges a frozen keeper standing at centre — and a frozen keeper legitimately stops central balls. So the screen showed one dive, the rules judged another. The replay was the tell: it re-plays the JUDGED dive, so it showed the truth (an unmoved keeper) disagreeing with the live animation.
- Concept: what the player SEES and what the game JUDGES must be fed by the same committed fact — the moment an animation and a rule read DIFFERENT state, you get outcomes that look wrong even when each half is "working". And gate logic on the event itself (did the strike happen?), never on a proxy for it (a timestamp's sign) — proxies break on inputs you didn't imagine, like a finger already resting on the glass.
- In my words: (pending — answer at next wrap)
- Where else: (pending — answer at next wrap)
- Quiz question: "The live action and its replay show two different things — which one is the truth the game scored, and what does the disagreement itself tell you?"
- Internalized: no

### 2026-07-15 — The repo's own testing notes pointed the wrong way (stale recipe)

- What happened: CLAUDE.md's headless gotchas said swipes are "best driven with dispatchEvent PointerEvents on the canvas". This session those synthetic swipes reached the input layer (the live aim updated) but silently failed at the final release/submit step, and debugging time went into suspecting the game code before suspecting the recipe. Real CDP input (`page.mouse`) worked first try. The note was written in an earlier session/container where the synthetic route happened to work. Fixed in place: CLAUDE.md now says to drive swipes with real `page.mouse` events.
- Concept: notes about HOW to test are themselves code that goes stale — a "known good" recipe is only known-good in the environment it was written in. When a documented recipe fails, make the recipe a suspect as early as the code, and once disproven, correct the doc immediately so the trap doesn't reload for the next session.
- In my words: (pending — answer at next wrap)
- Where else: (pending — answer at next wrap)
- Quiz question: "A step-by-step testing recipe from your own project docs fails today — name the two suspects, and the one most people forget to check."
- Internalized: no
