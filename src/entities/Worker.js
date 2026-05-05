import { TILE_SIZE, WALKABLE } from '../config/gameConfig.js';
import { findPath } from '../utils/Pathfinder.js';

const SPEED = 140; // px/sec
const HIT_RADIUS = 18;
const ARRIVE_DIST = 2;

export default class Worker {
  constructor(scene, x, y) {
    this.scene = scene;
    this.x = x;
    this.y = y;
    this.targetX = x;
    this.targetY = y;
    this.moving = false;
    this.selected = false;
    this._path = [];
    this._pathIdx = 0;

    this.sprite = scene.add.sprite(x, y, 'worker_idle')
      .setDepth(5)
      .setOrigin(0.5, 0.6)
      .setScale(0.75)
      .play('worker_idle');
  }

  moveTo(wx, wy) {
    const tiles = this.scene.mapTiles;
    const startTX = Math.floor(this.x / TILE_SIZE);
    const startTY = Math.floor(this.y / TILE_SIZE);
    const endTX   = Math.floor(wx / TILE_SIZE);
    const endTY   = Math.floor(wy / TILE_SIZE);

    const tilePath = findPath(tiles, startTX, startTY, endTX, endTY);
    if (!tilePath || tilePath.length <= 1) return;

    // Convert tile coords to world-space waypoints (tile centres)
    this._path = tilePath.slice(1).map(p => ({
      x: p.x * TILE_SIZE + TILE_SIZE / 2,
      y: p.y * TILE_SIZE + TILE_SIZE / 2,
    }));
    this._pathIdx = 0;
    this.targetX  = this._path[0].x;
    this.targetY  = this._path[0].y;

    if (!this.moving) {
      this.moving = true;
      this.sprite.play('worker_run');
    }
  }

  setSelected(val) {
    this.selected = val;
  }

  hitTest(px, py) {
    const dx = this.x - px;
    const dy = this.y - py;
    return dx * dx + dy * dy < HIT_RADIUS * HIT_RADIUS;
  }

  update(delta) {
    if (!this.moving) return;

    const dt = delta / 1000;
    const dx = this.targetX - this.x;
    const dy = this.targetY - this.y;
    const dist = Math.sqrt(dx * dx + dy * dy);

    if (dist < ARRIVE_DIST) {
      this.x = this.targetX;
      this.y = this.targetY;

      this._pathIdx++;
      if (this._pathIdx < this._path.length) {
        this.targetX = this._path[this._pathIdx].x;
        this.targetY = this._path[this._pathIdx].y;
      } else {
        this._path = [];
        this.moving = false;
        this.sprite.play('worker_idle');
      }
    } else {
      const step = Math.min(SPEED * dt, dist);
      const nx = this.x + (dx / dist) * step;
      const ny = this.y + (dy / dist) * step;

      const tiles = this.scene.mapTiles;
      const tileX = Math.floor(nx / TILE_SIZE);
      const tileY = Math.floor(ny / TILE_SIZE);
      if (WALKABLE.has(tiles[tileY]?.[tileX])) {
        this.x = nx;
        this.y = ny;
      } else {
        // Blocked mid-step (e.g. pushed by separation) — stop and replan
        this._path  = [];
        this.moving = false;
        this.sprite.play('worker_idle');
      }

      this.sprite.setFlipX(dx < 0);
    }

    this.sprite.setPosition(this.x, this.y);
  }

  destroy() {
    this.sprite.destroy();
  }
}
