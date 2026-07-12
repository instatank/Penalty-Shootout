/**
 * DebugOverlay.ts — the mandatory, toggleable tuning overlay (architecture
 * RULE 2 / PRD §11).
 *
 * It is how feel gets tuned: it prints live derived values in a screen corner.
 * In Milestone 1 there is no swipe yet, so it shows scene/build info. From
 * Milestone 2 on, the scene feeds it the live swipe vector, power, curve,
 * errorRadius, target/landing zone, keeper zone, timing and save/goal via
 * `setLines()`.
 *
 * Toggle: press the configured key (default "D") on desktop, or tap the small
 * on-screen "DBG" button (always available on touch devices).
 */

import Phaser from 'phaser';
import { CONFIG } from '../config';

export class DebugOverlay {
  private container: Phaser.GameObjects.Container;
  private bg: Phaser.GameObjects.Rectangle;
  private text: Phaser.GameObjects.Text;
  private button: Phaser.GameObjects.Text;
  private visible: boolean;
  private lines: string[] = [];

  constructor(scene: Phaser.Scene) {
    this.visible = CONFIG.DEBUG.enabledByDefault;

    // Readout panel, pinned HARD to the top-left corner and kept compact (owner
    // 2026-07-12: smaller + further left — the scoreboard owns the top-right).
    // Word-wrap caps its width so it can never grow under the scoreboard panel.
    this.bg = scene.add
      .rectangle(4, 4, 220, 96, CONFIG.COLORS.debugBg, 0.55)
      .setOrigin(0, 0);
    this.text = scene.add
      .text(9, 9, '', {
        fontFamily: 'monospace',
        fontSize: '11px',
        color: '#' + CONFIG.COLORS.debugText.toString(16).padStart(6, '0'),
        lineSpacing: 2,
        wordWrap: { width: this.wrapWidth(scene.scale.width) },
      })
      .setOrigin(0, 0);

    this.container = scene.add.container(0, 0, [this.bg, this.text]).setDepth(1000);
    this.container.setScrollFactor(0);

    // Always-present tap target so the overlay can be toggled on a phone.
    // Anchored to the live right edge, tucked BELOW the right-aligned scoreboard
    // panel (which now owns the top-right corner).
    const btnY = CONFIG.UI.scoreboard.marginPx + CONFIG.UI.scoreboard.heightPx + 8;
    this.button = scene.add
      .text(scene.scale.width - 8, btnY, 'DBG', {
        fontFamily: 'monospace',
        fontSize: '18px',
        color: '#ffffff',
        backgroundColor: '#00000088',
        padding: { x: 8, y: 6 },
      })
      .setOrigin(1, 0)
      .setDepth(1001)
      .setScrollFactor(0)
      .setInteractive({ useHandCursor: true });
    this.button.on('pointerup', () => this.toggle());

    // Desktop keyboard toggle.
    scene.input.keyboard?.on('keydown-' + CONFIG.DEBUG.toggleKey, () => this.toggle());

    // Keep the button pinned to the right edge (and the readout's wrap width in
    // step) when the screen size changes.
    const reanchor = (size: Phaser.Structs.Size) => {
      this.button.setX(size.width - 8);
      this.text.setWordWrapWidth(this.wrapWidth(size.width));
      if (this.visible) this.render();
    };
    scene.scale.on('resize', reanchor);
    scene.events.once(Phaser.Scenes.Events.SHUTDOWN, () => scene.scale.off('resize', reanchor));

    this.applyVisibility();
  }

  /** Replace the readout with a fresh set of "label: value" lines. */
  setLines(lines: string[]): void {
    this.lines = lines;
    if (this.visible) this.render();
  }

  toggle(): void {
    this.visible = !this.visible;
    this.applyVisibility();
  }

  isVisible(): boolean {
    return this.visible;
  }

  private applyVisibility(): void {
    this.container.setVisible(this.visible);
    if (this.visible) this.render();
  }

  /** Cap the readout's text width so the box stays clear of the right-aligned
   *  scoreboard even on a narrow portrait phone. */
  private wrapWidth(screenW: number): number {
    return Math.min(screenW * 0.38, 250);
  }

  private render(): void {
    this.text.setText(this.lines.join('\n'));
    // Grow the backdrop to fit the (wrapped) text.
    this.bg.width = Math.max(140, this.text.width + 10);
    this.bg.height = Math.max(28, this.text.height + 10);
  }
}
