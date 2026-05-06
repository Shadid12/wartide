import { TILE_SIZE } from '../config/gameConfig.js';

const FOOTPRINT_W = 2;
const FOOTPRINT_H = 2;

export default class Tower {
  constructor(scene, tileX, tileY) {
    this.scene  = scene;
    this.tileX  = tileX;
    this.tileY  = tileY;
    this.selected = false;

    const anchorX = (tileX + FOOTPRINT_W / 2) * TILE_SIZE;
    const anchorY = (tileY + FOOTPRINT_H) * TILE_SIZE;

    this.sprite = scene.add.image(anchorX, anchorY, 'tower_icon')
      .setOrigin(0.5, 1)
      .setDisplaySize(FOOTPRINT_W * TILE_SIZE, FOOTPRINT_H * TILE_SIZE * 1.5)
      .setDepth(4)
      .setInteractive();
  }

  setSelected(val) { this.selected = val; }

  destroy() {
    this.sprite.destroy();
  }
}
