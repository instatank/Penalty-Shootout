/**
 * game/main.ts — the Phaser.Game configuration.
 *
 * Scale.FIT + CENTER_BOTH renders the fixed 720x1280 design space scaled to the
 * device while preserving aspect (portrait). The scene list grows as milestones
 * land; for now there is just the static GameScene.
 */

import Phaser from 'phaser';
import { CONFIG } from '../config';
import { GameScene } from './scenes/GameScene';

const config: Phaser.Types.Core.GameConfig = {
  type: Phaser.AUTO,
  parent: 'game-container',
  backgroundColor: CONFIG.GAME.backgroundColor,
  scale: {
    mode: Phaser.Scale.FIT,
    autoCenter: Phaser.Scale.CENTER_BOTH,
    width: CONFIG.GAME.width,
    height: CONFIG.GAME.height,
  },
  // Procedural visuals only in v2 — no physics engine needed yet. Ball flight
  // (Milestone 3) is tween-driven, not physics-driven.
  scene: [GameScene],
};

export function startGame(): Phaser.Game {
  return new Phaser.Game(config);
}
