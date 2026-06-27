/**
 * game/main.ts — the Phaser.Game configuration.
 *
 * Scale.RESIZE makes the canvas match the window exactly (no letterbox bars) in
 * any orientation; the scene lays itself out responsively from the live size
 * (see game/layout.ts). CONFIG.GAME.width/height are just the initial size.
 * The scene list grows as milestones land; for now there is just GameScene.
 */

import Phaser from 'phaser';
import { CONFIG } from '../config';
import { GameScene } from './scenes/GameScene';

const config: Phaser.Types.Core.GameConfig = {
  type: Phaser.AUTO,
  parent: 'game-container',
  backgroundColor: CONFIG.GAME.backgroundColor,
  scale: {
    mode: Phaser.Scale.RESIZE,
    width: window.innerWidth,
    height: window.innerHeight,
  },
  // Procedural visuals only in v2 — no physics engine needed yet. Ball flight
  // (Milestone 3) is tween-driven, not physics-driven.
  scene: [GameScene],
};

export function startGame(): Phaser.Game {
  return new Phaser.Game(config);
}
