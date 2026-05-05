import { TILE_SIZE, WALKABLE } from '../config/gameConfig.js';
import { findPath } from '../utils/Pathfinder.js';

const SPEED          = 140;           // px/sec
const HIT_RADIUS     = 18;
const ARRIVE_DIST    = 2;
const HARVEST_DURATION = 10000;       // ms per collection tick
const HARVEST_AMOUNT   = 20;
const HARVEST_RANGE    = TILE_SIZE * 1.5; // px – must be within this to start collecting

export default class Worker {
  constructor(scene, x, y) {
    this.scene   = scene;
    this.x       = x;
    this.y       = y;
    this.targetX = x;
    this.targetY = y;
    this.moving  = false;
    this.selected = false;
    this._path    = [];
    this._pathIdx = 0;

    // Harvest state
    this._harvestTarget      = null;  // resource object being collected
    this._harvesting         = false;
    this._harvestTimer       = 0;
    this._carrying           = null;  // { amount, type } while walking back to dropoff
    this._returningToDropoff = false;

    this.sprite = scene.add.sprite(x, y, 'worker_idle')
      .setDepth(5)
      .setOrigin(0.5, 0.6)
      .setScale(0.75)
      .play('worker_idle');
  }

  // ─── Navigation ─────────────────────────────────────────────────────────────

  _navigateTo(endTX, endTY, anim = 'worker_run') {
    const tiles  = this.scene.mapTiles;
    const startTX = Math.floor(this.x / TILE_SIZE);
    const startTY = Math.floor(this.y / TILE_SIZE);
    const tilePath = findPath(tiles, startTX, startTY, endTX, endTY);
    if (!tilePath || tilePath.length <= 1) return;

    this._path    = tilePath.slice(1).map(p => ({
      x: p.x * TILE_SIZE + TILE_SIZE / 2,
      y: p.y * TILE_SIZE + TILE_SIZE / 2,
    }));
    this._pathIdx = 0;
    this.targetX  = this._path[0].x;
    this.targetY  = this._path[0].y;

    if (!this.moving) {
      this.moving = true;
    }
    this.sprite.play(anim);
  }

  moveTo(wx, wy) {
    this._cancelHarvest();
    this._navigateTo(Math.floor(wx / TILE_SIZE), Math.floor(wy / TILE_SIZE));
  }

  // ─── Harvesting ─────────────────────────────────────────────────────────────

  harvestResource(resource) {
    this._harvestTarget  = resource;
    this._harvesting     = false;
    this._harvestTimer   = 0;
    this._navigateTo(resource.x, resource.y);
  }

  _cancelHarvest() {
    this._harvestTarget      = null;
    this._harvesting         = false;
    this._harvestTimer       = 0;
    this._carrying           = null;
    this._returningToDropoff = false;
    this.sprite.play('worker_idle');
  }

  _navigateToDropoff() {
    const th = this.scene.townHall;
    if (!th) return;
    const type = this._carrying?.type;
    const anim = type === 'wood' ? 'worker_run_wood' : type === 'gold' ? 'worker_run_gold' : 'worker_run';
    this._navigateTo(th.tileX + 1, th.tileY + 1, anim);
  }

  _tryBeginHarvest() {
    const res = this._harvestTarget;
    if (!res || res.amount <= 0) { this._cancelHarvest(); return; }
    const rx = res.x * TILE_SIZE + TILE_SIZE / 2;
    const ry = res.y * TILE_SIZE + TILE_SIZE / 2;
    const dx = this.x - rx, dy = this.y - ry;
    if (Math.sqrt(dx * dx + dy * dy) <= HARVEST_RANGE) {
      this._harvesting   = true;
      this._harvestTimer = 0;
      this.sprite.play(res.type === 'gold' ? 'worker_pickaxe' : 'worker_axe');
    } else {
      this._cancelHarvest();
    }
  }

  // ─── Selection ──────────────────────────────────────────────────────────────

  setSelected(val) { this.selected = val; }

  hitTest(px, py) {
    const dx = this.x - px, dy = this.y - py;
    return dx * dx + dy * dy < HIT_RADIUS * HIT_RADIUS;
  }

  // ─── Per-frame update ───────────────────────────────────────────────────────

  update(delta) {
    // ── Harvesting phase ──
    if (this._harvesting) {
      this._harvestTimer += delta;
      if (this._harvestTimer >= HARVEST_DURATION) {
        this._harvestTimer -= HARVEST_DURATION;
        const resourceRef = this._harvestTarget;
        const collected   = this.scene.onWorkerHarvest(this, resourceRef, HARVEST_AMOUNT);
        if (collected > 0) {
          this._carrying           = { amount: collected, type: resourceRef.type };
          this._harvesting         = false;
          this._returningToDropoff = true;
          this._navigateToDropoff();
        }
      }
      return;
    }

    // ── Arrived at dropoff ──
    if (!this.moving && this._returningToDropoff) {
      this.scene.onWorkerDropoff(this, this._carrying.amount, this._carrying.type);
      this._carrying           = null;
      this._returningToDropoff = false;
      if (this._harvestTarget) {
        this._navigateTo(this._harvestTarget.x, this._harvestTarget.y);
      } else {
        this.sprite.play('worker_idle');
      }
      return;
    }

    // ── Arrived: check if we should begin harvesting ──
    if (!this.moving) {
      if (this._harvestTarget) this._tryBeginHarvest();
      return;
    }

    // ── Normal movement ──
    const dt   = delta / 1000;
    const dx   = this.targetX - this.x;
    const dy   = this.targetY - this.y;
    const dist = Math.sqrt(dx * dx + dy * dy);

    if (dist < ARRIVE_DIST) {
      this.x = this.targetX;
      this.y = this.targetY;

      this._pathIdx++;
      if (this._pathIdx < this._path.length) {
        this.targetX = this._path[this._pathIdx].x;
        this.targetY = this._path[this._pathIdx].y;
      } else {
        this._path  = [];
        this.moving = false;
        this.sprite.play('worker_idle');
      }
    } else {
      const step = Math.min(SPEED * dt, dist);
      const nx   = this.x + (dx / dist) * step;
      const ny   = this.y + (dy / dist) * step;

      const tiles = this.scene.mapTiles;
      if (WALKABLE.has(tiles[Math.floor(ny / TILE_SIZE)]?.[Math.floor(nx / TILE_SIZE)])) {
        this.x = nx;
        this.y = ny;
      } else {
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
