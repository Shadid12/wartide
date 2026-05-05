import { TILE_SIZE } from '../config/gameConfig.js';

const FOOTPRINT = 3;
const SPRITE_ASPECT = 1264 / 843;
const VISUAL_SCALE = 2.5;
const QUEUE_MAX = 5;

export const TOWNHALL_FOOTPRINT = FOOTPRINT;
export const TOWNHALL_BLOCK = 7; // impassable tile area (matches visual width)
export const TRAIN_COST = 50;
export const TRAIN_TIME = 30000; // ms

export default class TownHall {
  constructor(scene, tileX, tileY) {
    this.tileX = tileX;
    this.tileY = tileY;
    this.selected = false;
    this._queue = []; // [{ elapsed: ms }, ...]

    const footW = FOOTPRINT * TILE_SIZE * VISUAL_SCALE;
    const footH = footW * SPRITE_ASPECT;

    const anchorX = (tileX + FOOTPRINT / 2) * TILE_SIZE;
    const anchorY = (tileY + FOOTPRINT) * TILE_SIZE;

    this.sprite = scene.add.image(anchorX, anchorY, 'townhall')
      .setOrigin(0.5, 1)
      .setDisplaySize(footW, footH)
      .setDepth(2)
      .setInteractive();

    const labelY = anchorY - footH - 4;
    this.label = scene.add.text(anchorX, labelY, 'TOWN HALL', {
      fontSize: '11px',
      fontFamily: 'monospace',
      color: '#ffd700',
      stroke: '#000000',
      strokeThickness: 3,
    }).setOrigin(0.5, 1).setDepth(7);
  }

  get isTraining()         { return this._queue.length > 0; }
  get queueLength()        { return this._queue.length; }
  get trainProgress()      { return this.isTraining ? this._queue[0].elapsed / TRAIN_TIME : 0; }
  get trainTimeRemaining() { return this.isTraining ? Math.ceil((TRAIN_TIME - this._queue[0].elapsed) / 1000) : 0; }

  setSelected(val) { this.selected = val; }

  enqueue() {
    if (this._queue.length >= QUEUE_MAX) return false;
    this._queue.push({ elapsed: 0 });
    return true;
  }

  // Returns the number of workers that finished training this tick
  update(delta) {
    if (this._queue.length === 0) return 0;
    let completed = 0;
    this._queue[0].elapsed += delta;
    while (this._queue.length > 0 && this._queue[0].elapsed >= TRAIN_TIME) {
      const leftover = this._queue[0].elapsed - TRAIN_TIME;
      this._queue.shift();
      if (this._queue.length > 0) this._queue[0].elapsed = leftover;
      completed++;
    }
    return completed;
  }

  destroy() {
    this.sprite.destroy();
    this.label.destroy();
  }
}
