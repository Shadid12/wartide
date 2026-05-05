import { TILE_SIZE } from '../config/gameConfig.js';

const SPEED = 140; // px/sec
const HIT_RADIUS = 18;

export default class Worker {
  constructor(scene, x, y) {
    this.scene = scene;
    this.x = x;
    this.y = y;
    this.targetX = x;
    this.targetY = y;
    this.moving = false;
    this.selected = false;

    this.sprite = scene.add.sprite(x, y, 'worker_idle')
      .setDepth(5)
      .setOrigin(0.5, 0.6)
      .setScale(0.75)
      .play('worker_idle');
  }

  moveTo(x, y) {
    this.targetX = x;
    this.targetY = y;
    if (!this.moving) {
      this.moving = true;
      this.sprite.play('worker_run');
    }
  }

  setSelected(val) {
    this.selected = val;
  }

  // Returns true if world point (px, py) hits this worker
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

    if (dist < 2) {
      this.x = this.targetX;
      this.y = this.targetY;
      this.moving = false;
      this.sprite.play('worker_idle');
    } else {
      const step = Math.min(SPEED * dt, dist);
      this.x += (dx / dist) * step;
      this.y += (dy / dist) * step;
      this.sprite.setFlipX(dx < 0);
    }

    this.sprite.setPosition(this.x, this.y);
  }

  destroy() {
    this.sprite.destroy();
  }
}
