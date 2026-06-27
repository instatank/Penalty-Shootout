# Claude Code Kickoff Prompt — Penalty Shootout (v2)

> **How to use this:**
> 1. Put `penalty-shootout-PRD-v2.md` in the repo root.
> 2. Start Claude Code with **Opus 4.8 (high)** for Milestone 1–2 and Milestone 8. Use **Sonnet 4.6** for Milestones 3–7.
> 3. Start a **fresh session for each milestone** to keep context lean.
> 4. Paste the block below at the start of Milestone 1. For later milestones, paste the short per-milestone line at the bottom.

---

## Milestone 1 kickoff (paste this)

You are building a mobile-first PWA penalty shootout game. The full spec is in `penalty-shootout-PRD-v2.md` in the repo root. **Read it in full before writing any code and treat it as the source of truth.** I am a non-technical owner — write clear, well-commented code and explain decisions in plain language, not jargon.

**Stack (decided — do not substitute without asking me first):**
- Phaser 3 (latest stable 3.x) — NOT Phaser 4. Scaffold from the official `phaserjs/template-vite-ts`.
- TypeScript + Vite. Vercel for hosting. PWA, portrait-locked.
- Firebase Realtime Database + anonymous auth — but ONLY at Milestone 8. Do not add Firebase before then.

**Non-negotiable architecture (these make later milestones cheap — get them right early):**
1. **One `config.ts`** holds every feel/tuning constant as a plain typed object. No magic numbers anywhere else in the code. Group and comment by system per PRD §11.
2. **A mandatory toggleable debug overlay** that prints live swipe-derived values (vector, power, curve, errorRadius, target zone, landing zone, and later keeper zone + timing + save/goal). This is required, not optional — it's how I tune feel.
3. **The input layer must use Pointer Events** with `setPointerCapture()` and `touch-action: none` on the canvas, and must sample the swipe path as `{x,y,t}` points. Power = release velocity over the last ~80ms, not whole-gesture average. (PRD §4.)
4. When you reach it, **`resolvePenalty()` must be a single pure, deterministic function** (PRD §7), and both taker and keeper actions must flow through a shared **`InputProvider` interface** (PRD §8). The game loop must never branch on "CPU vs human." This is what lets online drop in later without a rewrite — do not collapse or shortcut it even though Milestone 1 only needs the local human path.

**Process rules:**
- Follow the build order in PRD §13 **exactly**. Build ONE milestone at a time.
- **Stop at every ⏸ checkpoint** and tell me to playtest before continuing. Do not run ahead.
- First, generate a `CLAUDE.md` summarizing the stack, the architecture rules above, the file structure, and the current milestone, so future sessions stay consistent. Keep it short.

**Start now with Milestone 1 only:** scaffold the project from the Phaser 3 Vite TypeScript template, build the static scene (perspective goal, ball, keeper, 3×2 zone grid drawn — no input, no flight yet), confirm it runs locally with `npm run dev`, and confirm the production build works for Vercel. Then **stop** and wait for me before Milestone 2.

Ask me anything genuinely ambiguous before coding, but don't ask about things the PRD already decides.

---

## Per-milestone continuation line (paste at the start of each later session)

> Read `CLAUDE.md` and `penalty-shootout-PRD-v2.md`. We are starting **Milestone [N]: [name]** from PRD §13. Build only this milestone, honor the architecture rules in CLAUDE.md (config.ts, debug overlay, Pointer Events, pure `resolvePenalty`, InputProvider interface), and **stop at the ⏸ checkpoint** for me to playtest. Update CLAUDE.md when done.

---

## Reminder for Milestone 8 (online)
Switch back to **Opus 4.8 (high)** for this one. Before starting it, I will give you my Firebase project config (Realtime Database + anonymous auth enabled). Build the RemoteProvider against the existing `InputProvider` interface and reuse the existing `resolvePenalty()` unchanged — if you find yourself needing to change the resolution function or the game loop to support online, stop and tell me, because that means the Stage 1 abstraction wasn't clean and we should fix that rather than fork the logic.
