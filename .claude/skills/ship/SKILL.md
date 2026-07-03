---
name: ship
description: Penalty-Shootout pre-push ship ritual - run before every push that reaches users. Runs the build gate (type-check + bundle), refuses to push red. Use when about to commit/push user-facing changes, or when the user says "ship it".
---

# /ship — Penalty-Shootout

Repo-specific config for the shared `playbook/SOP-ship.md` in `instatank/time-tracker` (read it for the why and the full ordering). Never push red.

1. `git status` + `git diff` — confirm the diff contains only the asked-for change (no bundled fixes, PLAYBOOK Rule 1).
2. **Cache bump:** none yet — this repo has **no service worker**. PWA is Milestone 7; when it lands, add its cache-key bump step here (PLAYBOOK L9) and update `SOP-ship.md`'s repo table.
3. **Gate:** `npm run build` (runs `tsc --noEmit` type-check, then Vite production bundle to `dist/`). Must pass clean.
4. **Standing repo warnings — check the diff against these:**
   - **Never re-add `setPointerCapture` or `preventDefault` to `SwipeInput`.** Both starve Phaser's own input and silently kill every on-screen button (DBG / MODE / difficulty / Play Again) for real users while headless checks stay green. Gesture starts on the canvas, tracks on the **window**, no capture. (See LEARNINGS.md 2026-06-29 card.)
   - **Headless-green ≠ device-acceptable.** Every phase ends at an owner-playtest ⏸ checkpoint. Remember the headless gotchas (CLAUDE.md): Phaser buttons need REAL/CDP events, timers run on the throttled rAF clock, dive-timing numbers look off headless — don't "fix" timing based on headless reads.
5. **Silent-failure question** for any new write/scheduled/external path in the diff (PLAYBOOK Rule 4).
6. Commit (clear message) and push to the working branch.
7. **If the change touches feel or visuals (anything the player sees or swipes): produce the verify-on-phone checklist** (`playbook/SOP-verify-on-phone.md` in time-tracker) — mandatory, not optional. State which verification rung you reached; never claim the phone/device rung — that belongs to the owner's playtest.
