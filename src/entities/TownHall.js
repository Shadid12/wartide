import { TILE_SIZE } from '../config/gameConfig.js';

const FOOTPRINT = 3;            // tiles wide & tall (collision)
const SPRITE_ASPECT = 1264 / 843; // original h/w ratio
const VISUAL_SCALE = 2.5;         // sprite is rendered 5× the tile footprint

export const TOWNHALL_FOOTPRINT = FOOTPRINT;

export default class TownHall {
  constructor(scene, tileX, tileY) {
    this.tileX = tileX;
    this.tileY = tileY;

    const footW = FOOTPRINT * TILE_SIZE * VISUAL_SCALE;
    const footH = footW * SPRITE_ASPECT;

    // Anchor sprite bottom-center at the bottom edge of the 3×3 footprint
    const anchorX = (tileX + FOOTPRINT / 2) * TILE_SIZE;
    const anchorY = (tileY + FOOTPRINT) * TILE_SIZE;

    this.sprite = scene.add.image(anchorX, anchorY, 'townhall')
      .setOrigin(0.5, 1)
      .setDisplaySize(footW, footH)
      .setDepth(2);

    // Name label floats above the rooftop
    const labelY = anchorY - footH - 4;
    this.label = scene.add.text(anchorX, labelY, 'TOWN HALL', {
      fontSize: '11px',
      fontFamily: 'monospace',
      color: '#ffd700',
      stroke: '#000000',
      strokeThickness: 3,
    }).setOrigin(0.5, 1).setDepth(7);
  }

  destroy() {
    this.sprite.destroy();
    this.label.destroy();
  }
}
