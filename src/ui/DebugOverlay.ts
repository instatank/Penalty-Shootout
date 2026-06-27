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

    // Readout panel, pinned top-left. depth high so it sits above the pitch.
    this.bg = scene.add
      .rectangle(8, 8, 300, 120, CONFIG.COLORS.debugBg, 0.55)
      .setOrigin(0, 0);
    this.text = scene.add
      .text(16, 14, '', {
        fontFamily: 'monospace',
        fontSize: '16px',
        color: '#' + CONFIG.COLORS.debugText.toString(16).padStart(6, '0'),
        lineSpacing: 2,
      })
      .setOrigin(0, 0);

    this.container = scene.add.container(0, 0, [this.bg, this.text]).setDepth(1000);
    this.container.setScrollFactor(0);

    // Always-present tap target so the overlay can be toggled on a phone.
    // Anchored to the live right edge so it stays put through resize/rotation.
    this.button = scene.add
      .text(scene.scale.width - 8, 8, 'DBG', {
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

    // Keep the button pinned to the right edge when the screen size changes.
    const reanchor = (size: Phaser.Structs.Size) => this.button.setX(size.width - 8);
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

  private render(): void {
    this.text.setText(this.lines.join('\n'));
    // Grow the backdrop to fit the text.
    this.bg.width = Math.max(220, this.text.width + 16);
    this.bg.height = Math.max(40, this.text.height + 12);
  }
}
