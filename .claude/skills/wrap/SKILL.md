---
name: wrap
description: Session-wrap ritual - run before ending any session that shipped commits (the Stop hook will nudge once if forgotten). Reconciles HANDOFF.md + CLAUDE.md "Current status" against reality, appends friction cards to LEARNINGS.md, asks the founder the teach-back/transfer questions, quizzes one old card. Also triggered by "wrap and teach" or "wrap up".
---

# /wrap — Penalty-Shootout

The learning half lives in `playbook/LEARNING_METHOD.md` in `instatank/time-tracker`; this skill is its trigger. The founder is non-technical — plain language throughout.

1. **Reconcile the handoff docs against reality** (PLAYBOOK Rule 6 — code is the source of truth):
   - `HANDOFF.md` — verify every stated fact: current branch, last commit, which phase is done vs awaiting playtest, open ⏸ checkpoints. Fix drift in place.
   - `CLAUDE.md` **"Current status"** section (and the phase entries under "Plan re-review") — same check; update if this session moved a phase or landed a decision.
2. **Friction cards:** for each genuine friction this session (0 is a valid count — don't pad), append a card to `LEARNINGS.md` using the format in `playbook/LEARNING_METHOD.md` (time-tracker). Fill every field except the two founder fields.
3. **Ask the founder, and wait for answers** (use AskUserQuestion or plain questions):
   - Teach-back: "One sentence, your words — what's the concept behind today's friction?" → record verbatim in the card's *In my words*. If it misses the concept, re-explain plainly and invite one retry.
   - Transfer: "Where else in your stack could this same failure bite?" → record in *Where else*.
4. **Quiz one old card:** pick the oldest card with `Internalized: no` or `streak 1`, ask its quiz question. Correct → bump streak; streak 2 on separate dates → mark `Internalized: YES (date)`. Wrong → say the answer plainly, streak resets.
5. **Recap:** produce the `wrap and teach` session recap (this session only, no padding) — plain English, non-technical founder.
6. **Mark done:** `touch "${TMPDIR:-/tmp}/wrap-done-$(basename "$(git rev-parse --show-toplevel)")-$(date +%F)"` so the Stop-hook reminder stays quiet.
7. Commit the doc updates (HANDOFF.md + CLAUDE.md + LEARNINGS.md) and push.

If the founder doesn't respond to step 3 (unattended session): leave the two founder fields as `(pending — answer at next wrap)`, complete everything else, and surface the questions at the start of the next wrap.
