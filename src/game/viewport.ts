/**
 * viewport.ts — robust full-screen sizing across orientation changes.
 *
 * Phaser's Scale.RESIZE normally tracks the window, but on mobile the browser
 * reports STALE dimensions for a moment right after an orientation flip. If
 * Phaser samples the size during that window it locks to the wrong size and the
 * view ends up cropped / "zoomed" with no way to recover except relaunching.
 *
 * This driver fixes that by explicitly resizing the game to the live layout
 * viewport (window.innerWidth/Height) on resize / orientationchange / visual-
 * viewport changes — and, after an orientationchange, retrying a few times over
 * ~0.6s so the final call lands after the browser has settled on the real size.
 */

import Phaser from 'phaser';

function applySize(game: Phaser.Game): void {
  const w = Math.max(1, Math.floor(window.innerWidth));
  const h = Math.max(1, Math.floor(window.innerHeight));
  const s = game.scale;
  if (s.width !== w || s.height !== h) {
    s.resize(w, h);
  }
  // Keep the page pinned at the origin (belt-and-braces against scroll drift).
  window.scrollTo(0, 0);
}

export function installViewportFix(game: Phaser.Game): void {
  let rafId = 0;
  const apply = () => {
    cancelAnimationFrame(rafId);
    rafId = requestAnimationFrame(() => applySize(game));
  };
  // Schedule one or more attempts at the given delays (ms).
  const schedule = (delays: number[]) => {
    for (const d of delays) window.setTimeout(apply, d);
  };

  window.addEventListener('resize', () => schedule([0]));
  // orientationchange needs retries: mobile reports the old size at first.
  window.addEventListener('orientationchange', () => schedule([0, 150, 350, 600]));
  window.visualViewport?.addEventListener('resize', () => schedule([0]));

  // Initial sync (and once more after first paint settles).
  schedule([0, 200]);
}
