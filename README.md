# Penalty Shootout

A mobile-first, portrait PWA penalty-shootout game. Swipe to shoot; a keeper
tries to save (and a Keeper mode where the roles flip). Single-player vs CPU
ships first; online 2-player over room codes is added last.

Full spec: **`penalty-shootout-PRD-v2.md`** (the source of truth).
Build/architecture notes for future coding sessions: **`CLAUDE.md`**.

## Running it on your computer

You need [Node.js](https://nodejs.org) installed (version 18 or newer). Then, in
a terminal inside this folder:

```bash
npm install      # one-time: download the building blocks
npm run dev      # start the game locally
```

It will print a local address (e.g. `http://localhost:8080/`). Open that in a
browser to play. It also prints a "Network" address you can open on your phone
(as long as the phone is on the same Wi-Fi) to test the real touch feel.

To stop the server, press `Ctrl + C` in the terminal.

## Building the production version (what gets hosted)

```bash
npm run build    # creates the optimized site in the dist/ folder
npm run preview  # preview that production build locally
```

Hosting is on **Vercel**: connecting this repo to a Vercel project will build
and deploy it automatically on every push (settings are in `vercel.json`).

## The debug overlay

There is a tuning overlay in the top-left corner that shows live values. Toggle
it with the **`D`** key on a keyboard, or tap the **`DBG`** button (top-right)
on a phone. From Milestone 2 it shows the live swipe vector, power, curve and
more — that is how we tune how the swipe feels.

## Current status

**Milestone 1 — Scaffold + static scene: complete.** The pitch, goal, net,
keeper, ball and the 3×2 aiming grid are drawn. No swipe input or ball flight
yet — those come next. See `CLAUDE.md` for the milestone plan.
