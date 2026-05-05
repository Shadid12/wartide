import Phaser from 'phaser';
import { generateMap } from '../utils/MapGenerator.js';
import { createTileTextures } from '../utils/TextureFactory.js';
import Worker from '../entities/Worker.js';
import TownHall, { TOWNHALL_FOOTPRINT, TOWNHALL_BLOCK, TRAIN_COST } from '../entities/TownHall.js';
import {
  TILE_SIZE, MAP_WIDTH, MAP_HEIGHT,
  MINIMAP_WIDTH, MINIMAP_HEIGHT, MINIMAP_X, MINIMAP_Y,
  TERRAIN, RESOURCE, TERRAIN_COLORS, RESOURCE_COLORS, WALKABLE,
} from '../config/gameConfig.js';


const CAM_SPEED = 400;
const SCROLL_MARGIN = 24;
const DRAG_THRESHOLD = 6;       // px of mouse travel before it's a drag
const WORKER_COUNT = 2;
const FORMATION_SPACING = 44;   // px between workers in move formation

const BUILDINGS = {
  farm:     { w: 2, h: 2, goldCost: 0,   woodCost: 500, color: 0x5a9e5a, label: 'Farm' },
  barracks: { w: 3, h: 3, goldCost: 700, woodCost: 0,   color: 0x8b3030, label: 'Barracks' },
};

function formationPositions(cx, cy, count) {
  if (count === 1) return [{ x: cx, y: cy }];
  const cols = Math.ceil(Math.sqrt(count));
  return Array.from({ length: count }, (_, i) => {
    const col = i % cols - (cols - 1) / 2;
    const row = Math.floor(i / cols) - (Math.ceil(count / cols) - 1) / 2;
    return { x: cx + col * FORMATION_SPACING, y: cy + row * FORMATION_SPACING };
  });
}

export default class GameScene extends Phaser.Scene {
  constructor() {
    super({ key: 'GameScene' });
  }

  preload() {
    this.load.spritesheet('worker_idle', 'assets/sprites/worker/worker_Idle.png', {
      frameWidth: 192,
      frameHeight: 192,
    });
    this.load.spritesheet('worker_run', 'assets/sprites/worker/worker_Run.png', {
      frameWidth: 192,
      frameHeight: 192,
    });
    this.load.spritesheet('tree1', 'assets/sprites/trees/Tree1.png', {
      frameWidth: 192,
      frameHeight: 256,
    });
    this.load.spritesheet('worker_axe', 'assets/sprites/worker/worker_Interact_Axe.png', {
      frameWidth: 192,
      frameHeight: 192,
    });
    this.load.spritesheet('worker_run_wood', 'assets/sprites/worker/worker_run_wood.png', {
      frameWidth: 192,
      frameHeight: 192,
    });
    this.load.spritesheet('worker_pickaxe', 'assets/sprites/worker/worker_Interact_pickaxe.png', {
      frameWidth: 192,
      frameHeight: 192,
    });
    this.load.spritesheet('worker_run_gold', 'assets/sprites/worker/worker_run_Gold.png', {
      frameWidth: 192,
      frameHeight: 192,
    });
    this.load.image('townhall', 'assets/sprites/townhall/town.png');
    this.load.image('stump', 'assets/sprites/trees/Stump_1.png');
  }

  create() {
    createTileTextures(this);

    this.anims.create({
      key: 'worker_idle',
      frames: this.anims.generateFrameNumbers('worker_idle', { start: 0, end: 7 }),
      frameRate: 8,
      repeat: -1,
    });
    this.anims.create({
      key: 'worker_run',
      frames: this.anims.generateFrameNumbers('worker_run', { start: 0, end: 5 }),
      frameRate: 10,
      repeat: -1,
    });
    this.anims.create({
      key: 'worker_axe',
      frames: this.anims.generateFrameNumbers('worker_axe', { start: 0, end: 5 }),
      frameRate: 8,
      repeat: -1,
    });
    this.anims.create({
      key: 'worker_run_gold',
      frames: this.anims.generateFrameNumbers('worker_run_gold', { start: 0, end: 5 }),
      frameRate: 10,
      repeat: -1,
    });
    this.anims.create({
      key: 'worker_pickaxe',
      frames: this.anims.generateFrameNumbers('worker_pickaxe', { start: 0, end: 5 }),
      frameRate: 8,
      repeat: -1,
    });
    this.anims.create({
      key: 'worker_run_wood',
      frames: this.anims.generateFrameNumbers('worker_run_wood', { start: 0, end: 5 }),
      frameRate: 10,
      repeat: -1,
    });
    this.anims.create({
      key: 'tree_sway',
      frames: this.anims.generateFrameNumbers('tree1', { start: 0, end: 7 }),
      frameRate: 6,
      repeat: -1,
    });

    const { tiles, resources } = generateMap();
    this.mapTiles = tiles;
    this.mapResources = resources;

    this.buildTileMap();
    this.buildResourceLayer();
    this.buildForestLayer();
    this.setupCamera();
    this.buildMinimap();
    this.buildHUD();

    this.spawnTownHall();

    this.gold = 10000;
    this.wood  = 0;
    this.oil   = 0;
    this.updateResourceHUD();

    this.selectedBuilding = null;
    this.buildBuildingPanel();
    this.buildWorkerPanel();

    this._buildMode = null;
    this._buildGhost = this.add.graphics().setDepth(50);

    this.workers = [];
    this.selectedWorkers = [];

    // Debug overlay
    this.debugGraphics = this.add.graphics().setDepth(50);

    // Shared selection ring graphics (world space)
    this.selectionGraphics = this.add.graphics().setDepth(4);

    // Drag-box overlay (screen space)
    this.dragBoxGraphics = this.add.graphics().setScrollFactor(0).setDepth(400);

    // Move marker (world space, fades out)
    this.moveMarker = this.add.graphics().setDepth(6);

    // Rally point state
    this.rallyPoint  = null; // { wx, wy }
    this.rallyMarker = this.add.graphics().setDepth(6);
    this.rallyLine   = this.add.graphics().setDepth(2);

    this.spawnWorkers();
    this.setupInput();

    // Suppress right-click context menu
    this.game.canvas.addEventListener('contextmenu', e => e.preventDefault());
  }

  // ─── Map ───────────────────────────────────────────────────────────────────

  buildTileMap() {
    this.tileLayer = this.add.container(0, 0);
    for (let y = 0; y < MAP_HEIGHT; y++) {
      for (let x = 0; x < MAP_WIDTH; x++) {
        const terrain = this.mapTiles[y][x];
        this.tileLayer.add(
          this.add.image(
            x * TILE_SIZE + TILE_SIZE / 2,
            y * TILE_SIZE + TILE_SIZE / 2,
            `tile_${terrain}`
          )
        );
      }
    }
  }

  buildResourceLayer() {
    for (const res of this.mapResources) {
      const sprite = this.add.image(
        res.x * TILE_SIZE + TILE_SIZE / 2,
        res.y * TILE_SIZE + TILE_SIZE / 2,
        `resource_${res.type}`
      ).setDepth(1).setInteractive();
      sprite.on('pointerover', () => this.showResourceTooltip(res, sprite));
      sprite.on('pointerout',  () => this.hideResourceTooltip());
      res.sprite    = sprite;
      res.maxAmount = res.amount; // record initial amount for depletion scaling
    }
  }

  buildForestLayer() {
    this.treeSprites = new Map(); // key: "x,y" → sprite

    for (let y = 0; y < MAP_HEIGHT; y++) {
      for (let x = 0; x < MAP_WIDTH; x++) {
        if (this.mapTiles[y][x] !== TERRAIN.FOREST) continue;

        const wx = x * TILE_SIZE + TILE_SIZE / 2;
        const wy = y * TILE_SIZE + TILE_SIZE;
        const startFrame = (x * 3 + y * 7) % 8;

        const tree = this.add.sprite(wx, wy, 'tree1')
          .setDepth(3)
          .setOrigin(0.5, 1)
          .setScale(0.84)
          .play({ key: 'tree_sway', startFrame });

        this.treeSprites.set(`${x},${y}`, tree);
      }
    }
  }

  setupCamera() {
    const worldW = MAP_WIDTH  * TILE_SIZE;
    const worldH = MAP_HEIGHT * TILE_SIZE;
    this.cameras.main.setBounds(0, 0, worldW, worldH);
    this.cameras.main.setZoom(1);
    this.cameras.main.centerOn(worldW / 2, worldH / 2);
  }

  // ─── TownHall ───────────────────────────────────────────────────────────────

  spawnTownHall() {
    const cx = Math.floor(MAP_WIDTH  / 2);
    const cy = Math.floor(MAP_HEIGHT / 2);
    const fp = TOWNHALL_FOOTPRINT;

    // Search outward from center for a clear fp×fp walkable area
    for (let r = 0; r < 30; r++) {
      for (let dy = -r; dy <= r; dy++) {
        for (let dx = -r; dx <= r; dx++) {
          if (Math.abs(dx) !== r && Math.abs(dy) !== r) continue;
          const tx = cx + dx - Math.floor(fp / 2);
          const ty = cy + dy - Math.floor(fp / 2);

          let valid = true;
          for (let fy = 0; fy < fp && valid; fy++) {
            for (let fx = 0; fx < fp && valid; fx++) {
              const nx = tx + fx, ny = ty + fy;
              if (nx < 1 || ny < 1 || nx >= MAP_WIDTH - 1 || ny >= MAP_HEIGHT - 1) { valid = false; break; }
              if (!WALKABLE.has(this.mapTiles[ny][nx])) { valid = false; break; }
            }
          }

          if (valid) {
            // Building block dimensions — must match _drawDebug cyan box
            const offset = Math.floor((TOWNHALL_BLOCK - fp) / 2);
            const blockX = tx - offset;
            const blockY = ty - offset - 2; // shifted up to match sprite visual top
            const blockW = TOWNHALL_BLOCK;
            const blockH = TOWNHALL_BLOCK - 1;

            for (let fy = 0; fy < blockH; fy++) {
              for (let fx = 0; fx < blockW; fx++) {
                const nx = blockX + fx;
                const ny = blockY + fy;
                if (nx < 0 || ny < 0 || nx >= MAP_WIDTH || ny >= MAP_HEIGHT) continue;
                this.mapTiles[ny][nx] = TERRAIN.BUILDING;
              }
            }

            this.townHall = new TownHall(this, tx, ty);
            // Store block bounds for debug rendering and navigation
            this.townHall.blockX = blockX;
            this.townHall.blockY = blockY;
            this.townHall.blockW = blockW;
            this.townHall.blockH = blockH;
            return;
          }
        }
      }
    }
  }

  // ─── Workers ────────────────────────────────────────────────────────────────

  spawnWorkers() {
    const cx = Math.floor(MAP_WIDTH  / 2);
    const cy = Math.floor(MAP_HEIGHT / 2);

    // Find walkable tiles starting well outside the townhall visual area
    const placed = [];
    for (let r = 8; r < 30 && placed.length < WORKER_COUNT; r++) {
      for (let dy = -r; dy <= r && placed.length < WORKER_COUNT; dy++) {
        for (let dx = -r; dx <= r && placed.length < WORKER_COUNT; dx++) {
          if (Math.abs(dx) !== r && Math.abs(dy) !== r) continue; // only ring
          const tx = cx + dx, ty = cy + dy;
          if (tx < 0 || ty < 0 || tx >= MAP_WIDTH || ty >= MAP_HEIGHT) continue;
          if (!WALKABLE.has(this.mapTiles[ty][tx])) continue;
          if (placed.some(p => p.tx === tx && p.ty === ty)) continue;
          placed.push({ tx, ty });
        }
      }
    }

    for (const { tx, ty } of placed) {
      const wx = tx * TILE_SIZE + TILE_SIZE / 2;
      const wy = ty * TILE_SIZE + TILE_SIZE / 2;
      this.workers.push(new Worker(this, wx, wy));
    }
  }

  // ─── Selection ──────────────────────────────────────────────────────────────

  selectWorkers(list, append = false) {
    if (!append) {
      this.selectedWorkers.forEach(w => w.setSelected(false));
      this.selectedWorkers = [];
      this._hideBuildingPanel();
    }
    for (const w of list) {
      if (!w.selected) {
        w.setSelected(true);
        this.selectedWorkers.push(w);
      }
    }
    this.workerPanel?.setVisible(this.selectedWorkers.length > 0);
    this.updateUnitCountHUD();
  }

  deselectAll() {
    this.selectedWorkers.forEach(w => w.setSelected(false));
    this.selectedWorkers = [];
    this._hideBuildingPanel();
    this.workerPanel?.setVisible(false);
    this._cancelBuildMode();
    this.updateUnitCountHUD();
  }

  _hideBuildingPanel() {
    this.selectedBuilding = null;
    this.buildingPanel?.setVisible(false);
  }

  selectBuilding(building) {
    this.selectedWorkers.forEach(w => w.setSelected(false));
    this.selectedWorkers = [];
    this.workerPanel?.setVisible(false);
    this._cancelBuildMode();
    this.updateUnitCountHUD();
    this.selectedBuilding = building;
    this.buildingPanel.setVisible(true);
    this.updateBuildingPanel();
  }

  workerAtWorldPoint(wx, wy) {
    return this.workers.find(w => w.hitTest(wx, wy)) ?? null;
  }

  workersInRect(x1, y1, x2, y2) {
    const minX = Math.min(x1, x2), maxX = Math.max(x1, x2);
    const minY = Math.min(y1, y2), maxY = Math.max(y1, y2);
    return this.workers.filter(w => w.x >= minX && w.x <= maxX && w.y >= minY && w.y <= maxY);
  }

  issueMove(worldX, worldY) {
    if (this.selectedWorkers.length === 0) return;
    const positions = formationPositions(worldX, worldY, this.selectedWorkers.length);
    this.selectedWorkers.forEach((w, i) => w.moveTo(positions[i].x, positions[i].y));
    this.showMoveMarker(worldX, worldY);
  }

  // ─── Resource harvesting ────────────────────────────────────────────────────

  _resourceAtWorldPoint(wx, wy) {
    for (const res of this.mapResources) {
      const rx = res.x * TILE_SIZE + TILE_SIZE / 2;
      const ry = res.y * TILE_SIZE + TILE_SIZE / 2;
      const dx = wx - rx, dy = wy - ry;
      if (dx * dx + dy * dy < (TILE_SIZE * 0.8) ** 2) return res;
    }
    return null;
  }

  issueHarvest(resource) {
    for (const w of this.selectedWorkers) w.harvestResource(resource);
    this.showMoveMarker(
      resource.x * TILE_SIZE + TILE_SIZE / 2,
      resource.y * TILE_SIZE + TILE_SIZE / 2,
    );
  }

  // Called when worker finishes a chop cycle. Deducts from the resource and
  // returns how much was actually collected. HUD update happens at dropoff.
  onWorkerHarvest(worker, resource, amount) {
    if (!resource || resource.amount <= 0) {
      worker._cancelHarvest();
      return 0;
    }

    const collected = Math.min(amount, resource.amount);
    resource.amount -= collected;

    const key = `${resource.x},${resource.y}`;
    const treeSprite = this.treeSprites?.get(key);

    // Below 1200 wood: swap to stump and make tile walkable (one-time transition)
    if (resource.amount < 1200 && this.mapTiles[resource.y][resource.x] === TERRAIN.FOREST) {
      this.mapTiles[resource.y][resource.x] = TERRAIN.GRASS;
      treeSprite?.destroy();
      const stump = this.add.image(
        resource.x * TILE_SIZE + TILE_SIZE / 2,
        resource.y * TILE_SIZE + TILE_SIZE,
        'stump'
      ).setDepth(3).setOrigin(0.5, 1).setScale(0.84);
      this.treeSprites.set(key, stump);
    } else if (treeSprite && this.mapTiles[resource.y][resource.x] === TERRAIN.FOREST) {
      // Still a full tree — scale it down as wood is removed
      const ratio = resource.amount / resource.maxAmount;
      treeSprite.setScale(0.84 * Math.max(0.4, ratio));
    }

    if (resource.amount <= 0) {
      resource.sprite?.destroy();
      this.treeSprites?.get(key)?.destroy();
      this.treeSprites?.delete(key);
      if (this.mapTiles[resource.y][resource.x] !== TERRAIN.GRASS) {
        this.mapTiles[resource.y][resource.x] = TERRAIN.GRASS;
      }
      const idx = this.mapResources.indexOf(resource);
      if (idx !== -1) this.mapResources.splice(idx, 1);
      // Cancel all other workers targeting this depleted resource
      for (const w of this.workers) {
        if (w !== worker && w._harvestTarget === resource) w._cancelHarvest();
      }
      // Clear the current worker's target so they don't return after dropoff
      worker._harvestTarget = null;
    }

    return collected;
  }

  // Called when a worker arrives back at the townhall with carried resources.
  onWorkerDropoff(worker, amount, type) {
    if (type === RESOURCE.WOOD)       this.wood += amount;
    else if (type === RESOURCE.GOLD)  this.gold += amount;
    else if (type === RESOURCE.OIL)   this.oil  += amount;

    this.updateResourceHUD();

    const th = this.townHall;
    const px = th ? (th.tileX + 1.5) * TILE_SIZE : worker.x;
    const py = th ? th.tileY * TILE_SIZE - 20      : worker.y;
    const color = type === RESOURCE.GOLD ? '#ffd700' : type === RESOURCE.OIL ? '#aaaaaa' : '#00ff88';
    this._showHarvestPopup(px, py, `+${amount} ${type}`, color);
  }

  _showHarvestPopup(wx, wy, text, color = '#00ff88') {
    const t = this.add.text(wx, wy - 20, text, {
      fontSize: '12px', fontFamily: 'monospace',
      color, stroke: '#000000', strokeThickness: 2,
    }).setDepth(10).setOrigin(0.5, 1);

    this.tweens.add({
      targets: t,
      y: wy - 50,
      alpha: 0,
      duration: 1200,
      ease: 'Quad.Out',
      onComplete: () => t.destroy(),
    });
  }

  // ─── Input ──────────────────────────────────────────────────────────────────

  setupInput() {
    this.cursors = this.input.keyboard.createCursorKeys();
    this.wasd = this.input.keyboard.addKeys({
      up:    Phaser.Input.Keyboard.KeyCodes.W,
      down:  Phaser.Input.Keyboard.KeyCodes.S,
      left:  Phaser.Input.Keyboard.KeyCodes.A,
      right: Phaser.Input.Keyboard.KeyCodes.D,
    });

    this.input.on('wheel', (_p, _o, _dx, dy) => {
      const zoom = this.cameras.main.zoom;
      this.cameras.main.setZoom(Phaser.Math.Clamp(zoom - dy * 0.001, 0.4, 2.0));
    });

    // Drag selection state
    this._dragStart  = null;   // { wx, wy, sx, sy } world + screen start
    this._isDragging = false;
    this._shiftHeld  = false;

    this.input.keyboard.on('keydown-SHIFT', () => { this._shiftHeld = true;  });
    this.input.keyboard.on('keyup-SHIFT',   () => { this._shiftHeld = false; });
    this.input.keyboard.on('keydown-T', () => {
      if (this.selectedBuilding === this.townHall) this.trainWorker();
    });
    this.input.keyboard.on('keydown-ESC', () => { this._cancelBuildMode(); });

    this.input.on('pointerdown', this._onPointerDown, this);
    this.input.on('pointermove', this._onPointerMove, this);
    this.input.on('pointerup',   this._onPointerUp,   this);
  }

  _isOverMinimap(sx, sy) {
    return sx >= MINIMAP_X && sx <= MINIMAP_X + MINIMAP_WIDTH &&
           sy >= MINIMAP_Y && sy <= MINIMAP_Y + MINIMAP_HEIGHT;
  }

  _isOverBuildingPanel(sx, sy) {
    if (this.buildingPanel?.visible && this._buildingPanelBounds) {
      const { x, y, w, h } = this._buildingPanelBounds;
      if (sx >= x && sx <= x + w && sy >= y && sy <= y + h) return true;
    }
    if (this.workerPanel?.visible && this._workerPanelBounds) {
      const { x, y, w, h } = this._workerPanelBounds;
      if (sx >= x && sx <= x + w && sy >= y && sy <= y + h) return true;
    }
    return false;
  }

  _onPointerDown(pointer) {
    if (pointer.rightButtonDown()) {
      if (this._buildMode) { this._cancelBuildMode(); return; }
      if (this._isOverMinimap(pointer.x, pointer.y)) return;
      if (this.selectedBuilding === this.townHall) {
        this.setRallyPoint(pointer.worldX, pointer.worldY);
        return;
      }
      const res = this._resourceAtWorldPoint(pointer.worldX, pointer.worldY);
      if (res && this.selectedWorkers.length > 0) {
        this.issueHarvest(res);
      } else {
        this.issueMove(pointer.worldX, pointer.worldY);
      }
      return;
    }

    if (!pointer.leftButtonDown()) return;
    if (this._isOverMinimap(pointer.x, pointer.y)) return;

    if (this._buildMode) {
      this._tryPlaceBuilding(pointer.worldX, pointer.worldY);
      return;
    }

    if (this._isOverBuildingPanel(pointer.x, pointer.y)) return;

    // Building click check (before worker check so the building takes priority)
    if (this._hitTestTownHall(pointer.worldX, pointer.worldY)) {
      this.selectBuilding(this.townHall);
      this._dragStart = null;
      return;
    }

    const hit = this.workerAtWorldPoint(pointer.worldX, pointer.worldY);
    if (hit) {
      // Direct worker click — handle immediately, don't start drag
      if (this._shiftHeld) {
        // Toggle selection
        if (hit.selected) {
          hit.setSelected(false);
          this.selectedWorkers = this.selectedWorkers.filter(w => w !== hit);
        } else {
          this.selectWorkers([hit], true);
        }
      } else {
        this.selectWorkers([hit], false);
      }
      this._dragStart = null;
    } else {
      // Start potential drag-box
      this._dragStart = {
        wx: pointer.worldX, wy: pointer.worldY,
        sx: pointer.x,      sy: pointer.y,
      };
      this._isDragging = false;
    }
  }

  _onPointerMove(pointer) {
    if (this._buildMode) { this._updateBuildGhost(pointer.worldX, pointer.worldY); return; }
    if (!pointer.isDown || !pointer.leftButtonDown() || !this._dragStart) return;

    const dx = pointer.x - this._dragStart.sx;
    const dy = pointer.y - this._dragStart.sy;
    if (!this._isDragging && Math.sqrt(dx * dx + dy * dy) < DRAG_THRESHOLD) return;

    this._isDragging = true;
    this._drawDragBox(this._dragStart.sx, this._dragStart.sy, pointer.x, pointer.y);
  }

  _onPointerUp(pointer) {
    if (!pointer.leftButtonReleased()) { this._clearDragState(); return; }

    if (this._isDragging && this._dragStart) {
      const inBox = this.workersInRect(
        this._dragStart.wx, this._dragStart.wy,
        pointer.worldX, pointer.worldY
      );
      this.selectWorkers(inBox, this._shiftHeld);
    } else if (this._dragStart && !this.workerAtWorldPoint(pointer.worldX, pointer.worldY)) {
      // Click on empty ground — deselect
      if (!this._shiftHeld) this.deselectAll();
    }

    this._clearDragState();
  }

  _clearDragState() {
    this._dragStart  = null;
    this._isDragging = false;
    this.dragBoxGraphics.clear();
  }

  _drawDragBox(x1, y1, x2, y2) {
    const g = this.dragBoxGraphics;
    g.clear();
    g.fillStyle(0x44ff88, 0.08);
    g.fillRect(x1, y1, x2 - x1, y2 - y1);
    g.lineStyle(1, 0x44ff88, 0.9);
    g.strokeRect(x1, y1, x2 - x1, y2 - y1);
  }

  // ─── Move Marker ────────────────────────────────────────────────────────────

  showMoveMarker(wx, wy) {
    if (this._moveMarkerTween) this._moveMarkerTween.stop();
    this._moveMarkerAlpha = 1;

    this._moveMarkerTween = this.tweens.add({
      targets: this,
      _moveMarkerAlpha: 0,
      duration: 700,
      ease: 'Quad.Out',
      onUpdate: () => this._drawMoveMarker(wx, wy, this._moveMarkerAlpha),
      onComplete: () => this.moveMarker.clear(),
    });

    this._drawMoveMarker(wx, wy, 1);
  }

  _drawMoveMarker(wx, wy, alpha) {
    const g = this.moveMarker;
    g.clear();
    g.lineStyle(2, 0x44ff88, alpha);
    g.strokeCircle(wx, wy, 14);
    // Cross
    g.lineStyle(1.5, 0x44ff88, alpha);
    g.lineBetween(wx - 6, wy, wx + 6, wy);
    g.lineBetween(wx, wy - 6, wx, wy + 6);
  }

  // ─── Building panel ─────────────────────────────────────────────────────────

  buildBuildingPanel() {
    const { height: H } = this.cameras.main;
    const PW = 284, PH = 142, PX = 8, PY = H - 48 - PH - 4;

    // Store bounds so _onPointerDown can ignore clicks inside the panel
    this._buildingPanelBounds = { x: PX, y: PY, w: PW, h: PH };

    this.buildingPanel = this.add.container(0, 0).setScrollFactor(0).setDepth(205).setVisible(false);

    const bg = this.add.graphics();
    bg.fillStyle(0x1a1a2e, 0.93);
    bg.fillRoundedRect(PX, PY, PW, PH, 6);
    bg.lineStyle(1, 0x555588);
    bg.strokeRoundedRect(PX, PY, PW, PH, 6);

    const title = this.add.text(PX + 10, PY + 8, 'TOWN HALL', {
      fontSize: '13px', fontFamily: 'monospace', color: '#ffd700', fontStyle: 'bold',
    });

    // Square icon-style button (Warcraft 2 style)
    const BTN_X = PX + 10, BTN_Y = PY + 32, BTN_W = 52, BTN_H = 52;
    this._btnGeom = { x: BTN_X, y: BTN_Y, w: BTN_W, h: BTN_H };
    this._trainBtnBg = this.add.graphics();
    this._drawTrainBtn(false);

    // Animated worker sprite as the icon
    const workerIcon = this.add.sprite(BTN_X + BTN_W / 2, BTN_Y + BTN_H / 2 - 4, 'worker_idle')
      .setScale(0.23)
      .setOrigin(0.5, 0.5)
      .play('worker_idle');

    // Cost badge at bottom of button
    const costLabel = this.add.text(BTN_X + BTN_W / 2, BTN_Y + BTN_H - 1, `${TRAIN_COST}g`, {
      fontSize: '9px', fontFamily: 'monospace', color: '#ffd700', align: 'center',
      stroke: '#000000', strokeThickness: 2,
    }).setOrigin(0.5, 1);

    // Keybind hint
    const keyHint = this.add.text(BTN_X + BTN_W - 2, BTN_Y + 2, 'T', {
      fontSize: '8px', fontFamily: 'monospace', color: '#888888',
    }).setOrigin(1, 0);

    this._queueText = this.add.text(BTN_X + BTN_W + 12, BTN_Y + 4, '', {
      fontSize: '11px', fontFamily: 'monospace', color: '#aaaaff', lineSpacing: 4,
    });

    const BAR_X = PX + 10, BAR_Y = PY + 96, BAR_W = PW - 20;
    this._barGeom = { x: BAR_X, y: BAR_Y, w: BAR_W, h: 14 };

    const barBg = this.add.graphics();
    barBg.fillStyle(0x222244, 1);
    barBg.fillRoundedRect(BAR_X, BAR_Y, BAR_W, 14, 3);

    this._progressFill = this.add.graphics();
    this._progressText = this.add.text(PX + PW / 2, BAR_Y - 3, '', {
      fontSize: '10px', fontFamily: 'monospace', color: '#88ccff',
    }).setOrigin(0.5, 1);

    this.buildingPanel.add([
      bg, title, this._trainBtnBg, workerIcon, costLabel, keyHint,
      this._queueText, barBg, this._progressFill, this._progressText,
    ]);

    // Interactive zone lives outside the container so Phaser hit-tests it correctly
    const btnZone = this.add.zone(BTN_X + BTN_W / 2, BTN_Y + BTN_H / 2, BTN_W, BTN_H)
      .setScrollFactor(0).setDepth(206).setInteractive();
    btnZone.on('pointerdown', () => { if (this.buildingPanel.visible) this.trainWorker(); });
    btnZone.on('pointerover', () => { if (this.buildingPanel.visible) this._drawTrainBtn(true); });
    btnZone.on('pointerout',  () => { if (this.buildingPanel.visible) this._drawTrainBtn(false); });
  }

  buildWorkerPanel() {
    const { height: H } = this.cameras.main;
    const PW = 160, PH = 108, PX = 8, PY = H - 48 - PH - 4;
    this._workerPanelBounds = { x: PX, y: PY, w: PW, h: PH };

    this.workerPanel = this.add.container(0, 0).setScrollFactor(0).setDepth(205).setVisible(false);

    const bg = this.add.graphics();
    bg.fillStyle(0x1a1a2e, 0.93);
    bg.fillRoundedRect(PX, PY, PW, PH, 6);
    bg.lineStyle(1, 0x555588);
    bg.strokeRoundedRect(PX, PY, PW, PH, 6);

    const title = this.add.text(PX + 10, PY + 8, 'BUILD', {
      fontSize: '13px', fontFamily: 'monospace', color: '#88ccff', fontStyle: 'bold',
    });

    const BTN_W = 52, BTN_H = 52;
    const FARM_X = PX + 10, FARM_Y = PY + 30;
    const BARR_X = FARM_X + BTN_W + 8, BARR_Y = FARM_Y;

    this._farmBtnBg  = this.add.graphics();
    this._barrBtnBg  = this.add.graphics();
    this._drawWorkerBtn(this._farmBtnBg, FARM_X, FARM_Y, BTN_W, BTN_H, false);
    this._drawWorkerBtn(this._barrBtnBg, BARR_X, BARR_Y, BTN_W, BTN_H, false);

    const farmIcon = this.add.graphics();
    farmIcon.fillStyle(0x5a9e5a, 0.8);
    farmIcon.fillRect(FARM_X + 8, FARM_Y + 8, BTN_W - 16, BTN_H - 22);

    const barrIcon = this.add.graphics();
    barrIcon.fillStyle(0x8b3030, 0.8);
    barrIcon.fillRect(BARR_X + 8, BARR_Y + 8, BTN_W - 16, BTN_H - 22);

    const farmCost = this.add.text(FARM_X + BTN_W / 2, FARM_Y + BTN_H - 2, '500w', {
      fontSize: '9px', fontFamily: 'monospace', color: '#8fbc8f',
      stroke: '#000000', strokeThickness: 2,
    }).setOrigin(0.5, 1);
    const farmName = this.add.text(FARM_X + BTN_W / 2, FARM_Y + BTN_H + 3, 'Farm', {
      fontSize: '9px', fontFamily: 'monospace', color: '#cccccc',
    }).setOrigin(0.5, 0);
    const farmKey = this.add.text(FARM_X + BTN_W - 2, FARM_Y + 2, 'F', {
      fontSize: '8px', fontFamily: 'monospace', color: '#888888',
    }).setOrigin(1, 0);

    const barrCost = this.add.text(BARR_X + BTN_W / 2, BARR_Y + BTN_H - 2, '700g', {
      fontSize: '9px', fontFamily: 'monospace', color: '#ffd700',
      stroke: '#000000', strokeThickness: 2,
    }).setOrigin(0.5, 1);
    const barrName = this.add.text(BARR_X + BTN_W / 2, BARR_Y + BTN_H + 3, 'Barracks', {
      fontSize: '9px', fontFamily: 'monospace', color: '#cccccc',
    }).setOrigin(0.5, 0);
    const barrKey = this.add.text(BARR_X + BTN_W - 2, BARR_Y + 2, 'B', {
      fontSize: '8px', fontFamily: 'monospace', color: '#888888',
    }).setOrigin(1, 0);

    this.workerPanel.add([
      bg, title,
      this._farmBtnBg, farmIcon, farmCost, farmName, farmKey,
      this._barrBtnBg, barrIcon, barrCost, barrName, barrKey,
    ]);

    const farmZone = this.add.zone(FARM_X + BTN_W / 2, FARM_Y + BTN_H / 2, BTN_W, BTN_H)
      .setScrollFactor(0).setDepth(206).setInteractive();
    farmZone.on('pointerdown', () => { if (this.workerPanel.visible) this.startBuildMode('farm'); });
    farmZone.on('pointerover', () => { if (this.workerPanel.visible) this._drawWorkerBtn(this._farmBtnBg, FARM_X, FARM_Y, BTN_W, BTN_H, true); });
    farmZone.on('pointerout',  () => { if (this.workerPanel.visible) this._drawWorkerBtn(this._farmBtnBg, FARM_X, FARM_Y, BTN_W, BTN_H, false); });

    const barrZone = this.add.zone(BARR_X + BTN_W / 2, BARR_Y + BTN_H / 2, BTN_W, BTN_H)
      .setScrollFactor(0).setDepth(206).setInteractive();
    barrZone.on('pointerdown', () => { if (this.workerPanel.visible) this.startBuildMode('barracks'); });
    barrZone.on('pointerover', () => { if (this.workerPanel.visible) this._drawWorkerBtn(this._barrBtnBg, BARR_X, BARR_Y, BTN_W, BTN_H, true); });
    barrZone.on('pointerout',  () => { if (this.workerPanel.visible) this._drawWorkerBtn(this._barrBtnBg, BARR_X, BARR_Y, BTN_W, BTN_H, false); });

    this.input.keyboard.on('keydown-F', () => {
      if (this.workerPanel?.visible && this.selectedWorkers.length > 0) this.startBuildMode('farm');
    });
    this.input.keyboard.on('keydown-B', () => {
      if (this.workerPanel?.visible && this.selectedWorkers.length > 0) this.startBuildMode('barracks');
    });
  }

  _drawWorkerBtn(g, x, y, w, h, hovered) {
    g.clear();
    g.fillStyle(hovered ? 0x3a3a6e : 0x252540, 1);
    g.fillRoundedRect(x, y, w, h, 4);
    g.lineStyle(1, hovered ? 0x8888cc : 0x555580);
    g.strokeRoundedRect(x, y, w, h, 4);
  }

  // ─── Build mode ──────────────────────────────────────────────────────────────

  startBuildMode(type) {
    this._buildMode = { type };
    if (this._buildModeText) this._buildModeText.destroy();
    const def = BUILDINGS[type];
    const { width: W } = this.cameras.main;
    this._buildModeText = this.add.text(W / 2, 16,
      `Placing ${def.label}  (${def.goldCost ? def.goldCost + 'g' : ''}${def.woodCost ? def.woodCost + 'w' : ''})  — RMB or ESC to cancel`, {
        fontSize: '11px', fontFamily: 'monospace', color: '#88ccff',
        stroke: '#000000', strokeThickness: 2,
        backgroundColor: '#00000099', padding: { x: 8, y: 4 },
      }).setScrollFactor(0).setDepth(400).setOrigin(0.5, 0);
  }

  _cancelBuildMode() {
    if (!this._buildMode) return;
    this._buildMode = null;
    this._buildGhost.clear();
    this._buildModeText?.destroy();
    this._buildModeText = null;
  }

  _isBuildLocationValid(tx, ty, w, h) {
    for (let fy = 0; fy < h; fy++) {
      for (let fx = 0; fx < w; fx++) {
        const nx = tx + fx, ny = ty + fy;
        if (nx < 0 || ny < 0 || nx >= MAP_WIDTH || ny >= MAP_HEIGHT) return false;
        if (!WALKABLE.has(this.mapTiles[ny][nx])) return false;
      }
    }
    return true;
  }

  _updateBuildGhost(wx, wy) {
    const g = this._buildGhost;
    g.clear();
    if (!this._buildMode) return;
    const def = BUILDINGS[this._buildMode.type];
    const tx = Math.floor(wx / TILE_SIZE) - Math.floor(def.w / 2);
    const ty = Math.floor(wy / TILE_SIZE) - Math.floor(def.h / 2);
    const bx = tx * TILE_SIZE, by = ty * TILE_SIZE;
    const bw = def.w * TILE_SIZE, bh = def.h * TILE_SIZE;
    const valid = this._isBuildLocationValid(tx, ty, def.w, def.h);
    g.fillStyle(def.color, valid ? 0.35 : 0.15);
    g.fillRect(bx, by, bw, bh);
    g.lineStyle(2, valid ? 0x00ff88 : 0xff4444, 0.9);
    g.strokeRect(bx, by, bw, bh);
  }

  _tryPlaceBuilding(wx, wy) {
    if (!this._buildMode) return;
    const def = BUILDINGS[this._buildMode.type];
    const tx = Math.floor(wx / TILE_SIZE) - Math.floor(def.w / 2);
    const ty = Math.floor(wy / TILE_SIZE) - Math.floor(def.h / 2);

    if (!this._isBuildLocationValid(tx, ty, def.w, def.h)) return;
    if (this.gold < def.goldCost || this.wood < def.woodCost) {
      this._showHarvestPopup(wx, wy, 'Not enough resources!', '#ff4444');
      return;
    }

    this.gold -= def.goldCost;
    this.wood -= def.woodCost;
    this.updateResourceHUD();

    for (let fy = 0; fy < def.h; fy++) {
      for (let fx = 0; fx < def.w; fx++) {
        this.mapTiles[ty + fy][tx + fx] = TERRAIN.BUILDING;
      }
    }

    const bx = tx * TILE_SIZE, by = ty * TILE_SIZE;
    const bw = def.w * TILE_SIZE, bh = def.h * TILE_SIZE;
    const bg = this.add.graphics().setDepth(4);
    bg.fillStyle(def.color, 1);
    bg.fillRect(bx, by, bw, bh);
    bg.lineStyle(2, 0xffffff, 0.4);
    bg.strokeRect(bx, by, bw, bh);
    this.add.text(bx + bw / 2, by + bh / 2, def.label, {
      fontSize: '10px', fontFamily: 'monospace', color: '#ffffff',
      stroke: '#000000', strokeThickness: 2,
    }).setDepth(5).setOrigin(0.5, 0.5);

    this._cancelBuildMode();
  }

  _drawTrainBtn(hovered) {
    const g = this._trainBtnBg;
    if (!g || !this._btnGeom) return;
    const { x, y, w, h } = this._btnGeom;
    g.clear();
    g.fillStyle(hovered ? 0x3a3a6e : 0x252540, 1);
    g.fillRoundedRect(x, y, w, h, 4);
    g.lineStyle(1, hovered ? 0x8888cc : 0x555580);
    g.strokeRoundedRect(x, y, w, h, 4);
  }

  updateBuildingPanel() {
    if (!this.buildingPanel?.visible || !this.townHall) return;
    const th = this.townHall;

    const dots = '●'.repeat(th.queueLength) + '○'.repeat(5 - th.queueLength);
    this._queueText.setText(`Queue\n${dots}`);

    const { x, y, w, h } = this._barGeom;
    this._progressFill.clear();
    if (th.isTraining) {
      this._progressFill.fillStyle(0x44aa44, 1);
      this._progressFill.fillRoundedRect(x, y, Math.max(4, w * th.trainProgress), h, 3);
      this._progressText.setText(`${th.trainTimeRemaining}s`);
    } else {
      this._progressText.setText(th.queueLength > 0 ? '' : 'Ready');
    }
  }

  // ─── Training ───────────────────────────────────────────────────────────────

  trainWorker() {
    if (!this.townHall) return;
    if (this.gold < TRAIN_COST) return;
    if (!this.townHall.enqueue()) return; // queue full
    this.gold -= TRAIN_COST;
    this.updateResourceHUD();
    this.updateBuildingPanel();
  }

  spawnWorkerAtRallyPoint() {
    if (!this.townHall) return;
    const { tileX, tileY } = this.townHall;
    const fp = TOWNHALL_FOOTPRINT;
    const cx = tileX + Math.floor(fp / 2);
    const cy = tileY + Math.floor(fp / 2);

    for (let r = 5; r < 20; r++) {
      for (let dy = -r; dy <= r; dy++) {
        for (let dx = -r; dx <= r; dx++) {
          if (Math.abs(dx) !== r && Math.abs(dy) !== r) continue;
          const nx = cx + dx, ny = cy + dy;
          if (nx < 0 || ny < 0 || nx >= MAP_WIDTH || ny >= MAP_HEIGHT) continue;
          if (!WALKABLE.has(this.mapTiles[ny][nx])) continue;
          const worker = new Worker(this, nx * TILE_SIZE + TILE_SIZE / 2, ny * TILE_SIZE + TILE_SIZE / 2);
          this.workers.push(worker);
          this.updateUnitCountHUD();
          if (this.rallyPoint) worker.moveTo(this.rallyPoint.wx, this.rallyPoint.wy);
          return;
        }
      }
    }
  }

  // ─── Rally point ─────────────────────────────────────────────────────────────

  setRallyPoint(wx, wy) {
    this.rallyPoint = { wx, wy };
    this.showMoveMarker(wx, wy);
  }

  _drawRallyMarker() {
    const g = this.rallyMarker;
    g.clear();
    if (!this.rallyPoint || this.selectedBuilding !== this.townHall) return;
    const { wx, wy } = this.rallyPoint;
    // Flagpole
    g.lineStyle(2, 0xffd700, 1);
    g.lineBetween(wx, wy, wx, wy - 22);
    // Flag triangle
    g.fillStyle(0xffd700, 1);
    g.fillTriangle(wx, wy - 22, wx + 13, wy - 16, wx, wy - 10);
    // Base
    g.lineStyle(2, 0xffd700, 0.7);
    g.strokeCircle(wx, wy, 4);
  }

  _drawRallyLine() {
    const g = this.rallyLine;
    g.clear();
    if (!this.rallyPoint || this.selectedBuilding !== this.townHall || !this.townHall) return;
    const th = this.townHall;
    const tx = (th.tileX + 1.5) * TILE_SIZE;
    const ty = (th.tileY + 1.5) * TILE_SIZE;
    g.lineStyle(1, 0xffd700, 0.4);
    g.lineBetween(tx, ty, this.rallyPoint.wx, this.rallyPoint.wy);
  }

  _hitTestTownHall(wx, wy) {
    if (!this.townHall) return false;
    const { blockX, blockY, blockW, blockH } = this.townHall;
    const bx = blockX * TILE_SIZE, by = blockY * TILE_SIZE;
    return wx >= bx && wx <= bx + blockW * TILE_SIZE && wy >= by && wy <= by + blockH * TILE_SIZE;
  }

  _drawDebug() {
  }

  // ─── Minimap ────────────────────────────────────────────────────────────────

  buildMinimap() {
    this.minimapContainer = this.add.container(0, 0).setScrollFactor(0).setDepth(100);

    const border = this.add.graphics();
    border.fillStyle(0x000000, 0.85);
    border.fillRect(MINIMAP_X - 3, MINIMAP_Y - 3, MINIMAP_WIDTH + 6, MINIMAP_HEIGHT + 6);
    border.lineStyle(2, 0x888888);
    border.strokeRect(MINIMAP_X - 3, MINIMAP_Y - 3, MINIMAP_WIDTH + 6, MINIMAP_HEIGHT + 6);
    this.minimapContainer.add(border);

    const terrainG = this.add.graphics();
    for (let y = 0; y < MAP_HEIGHT; y++) {
      for (let x = 0; x < MAP_WIDTH; x++) {
        const color = TERRAIN_COLORS[this.mapTiles[y][x]] ?? 0x000000;
        terrainG.fillStyle(color);
        terrainG.fillRect(
          MINIMAP_X + x * MINIMAP_WIDTH  / MAP_WIDTH,
          MINIMAP_Y + y * MINIMAP_HEIGHT / MAP_HEIGHT,
          Math.ceil(MINIMAP_WIDTH  / MAP_WIDTH),
          Math.ceil(MINIMAP_HEIGHT / MAP_HEIGHT)
        );
      }
    }
    this.minimapContainer.add(terrainG);

    const resG = this.add.graphics();
    for (const res of this.mapResources) {
      resG.fillStyle(RESOURCE_COLORS[res.type] ?? 0xffffff);
      resG.fillRect(
        MINIMAP_X + res.x * MINIMAP_WIDTH  / MAP_WIDTH,
        MINIMAP_Y + res.y * MINIMAP_HEIGHT / MAP_HEIGHT,
        2, 2
      );
    }
    this.minimapContainer.add(resG);

    // Viewport rect (redrawn each frame)
    this.minimapViewport = this.add.graphics().setScrollFactor(0).setDepth(101);
    this.minimapContainer.add(this.minimapViewport);

    // Worker dots on minimap (redrawn each frame)
    this.minimapWorkerDots = this.add.graphics().setScrollFactor(0).setDepth(102);
    this.minimapContainer.add(this.minimapWorkerDots);

    const minimapZone = this.add.zone(
      MINIMAP_X + MINIMAP_WIDTH  / 2,
      MINIMAP_Y + MINIMAP_HEIGHT / 2,
      MINIMAP_WIDTH, MINIMAP_HEIGHT
    ).setScrollFactor(0).setDepth(103).setInteractive();

    minimapZone.on('pointerdown', (pointer) => {
      const nx = (pointer.x - MINIMAP_X) / MINIMAP_WIDTH;
      const ny = (pointer.y - MINIMAP_Y) / MINIMAP_HEIGHT;
      this.cameras.main.centerOn(
        nx * MAP_WIDTH  * TILE_SIZE,
        ny * MAP_HEIGHT * TILE_SIZE
      );
    });
  }

  updateMinimapViewport() {
    const cam = this.cameras.main;
    const ww = MAP_WIDTH  * TILE_SIZE;
    const wh = MAP_HEIGHT * TILE_SIZE;

    const vx = MINIMAP_X + (cam.worldView.x / ww) * MINIMAP_WIDTH;
    const vy = MINIMAP_Y + (cam.worldView.y / wh) * MINIMAP_HEIGHT;
    const vw = (cam.worldView.width  / ww) * MINIMAP_WIDTH;
    const vh = (cam.worldView.height / wh) * MINIMAP_HEIGHT;

    this.minimapViewport.clear();
    this.minimapViewport.lineStyle(2, 0xffffff, 0.9);
    this.minimapViewport.strokeRect(vx, vy, vw, vh);

    // Worker dots
    const ww2 = MAP_WIDTH * TILE_SIZE;
    const wh2 = MAP_HEIGHT * TILE_SIZE;
    this.minimapWorkerDots.clear();
    for (const w of this.workers) {
      const color = w.selected ? 0x00ff88 : 0xeebb44;
      this.minimapWorkerDots.fillStyle(color);
      this.minimapWorkerDots.fillRect(
        MINIMAP_X + (w.x / ww2) * MINIMAP_WIDTH  - 1,
        MINIMAP_Y + (w.y / wh2) * MINIMAP_HEIGHT - 1,
        3, 3
      );
    }
  }

  // ─── HUD ────────────────────────────────────────────────────────────────────

  buildHUD() {
    this.hudContainer = this.add.container(0, 0).setScrollFactor(0).setDepth(200);
    const { width: W, height: H } = this.cameras.main;

    const hudBg = this.add.graphics();
    hudBg.fillStyle(0x1a1a2e, 0.9);
    hudBg.fillRect(0, H - 48, W, 48);
    hudBg.lineStyle(1, 0x444466);
    hudBg.strokeRect(0, H - 48, W, 48);
    this.hudContainer.add(hudBg);

    const style = { fontSize: '14px', fontFamily: 'monospace' };

    const goldIcon = this.add.text(16,  H - 34, 'GOLD', { ...style, color: '#ffd700' });
    this.goldText  = this.add.text(72,  H - 34, '0',    { ...style, color: '#ffffff' });
    const woodIcon = this.add.text(160, H - 34, 'WOOD', { ...style, color: '#8fbc8f' });
    this.woodText  = this.add.text(216, H - 34, '0',    { ...style, color: '#ffffff' });
    const oilIcon  = this.add.text(300, H - 34, 'OIL',  { ...style, color: '#aaaaaa' });
    this.oilText   = this.add.text(340, H - 34, '0',    { ...style, color: '#ffffff' });

    this.unitCountText = this.add.text(W - 200, H - 34, '', { ...style, color: '#88ccff' });

    const titleText = this.add.text(W / 2, H - 34, 'W A R T I D E', {
      fontSize: '16px', color: '#ccccff', fontFamily: 'monospace', fontStyle: 'bold'
    }).setOrigin(0.5, 0);

    this.hudContainer.add([
      goldIcon, this.goldText, woodIcon, this.woodText,
      oilIcon, this.oilText, this.unitCountText, titleText,
    ]);

    // Tooltip
    this.tooltip = this.add.container(0, 0).setScrollFactor(0).setDepth(300).setVisible(false);
    const tooltipBg = this.add.graphics();
    tooltipBg.fillStyle(0x000000, 0.85);
    tooltipBg.fillRoundedRect(0, 0, 160, 44, 6);
    tooltipBg.lineStyle(1, 0x888888);
    tooltipBg.strokeRoundedRect(0, 0, 160, 44, 6);
    this.tooltipText = this.add.text(8, 6, '', { fontSize: '12px', color: '#ffffff', fontFamily: 'monospace' });
    this.tooltip.add([tooltipBg, this.tooltipText]);
  }

  updateUnitCountHUD() {
    const sel = this.selectedWorkers.length;
    const total = this.workers.length;
    this.unitCountText?.setText(sel > 0 ? `Workers: ${sel}/${total} selected` : `Workers: ${total}`);
  }

  updateResourceHUD() {
    this.goldText?.setText(this.gold.toString());
    this.woodText?.setText(this.wood.toString());
    this.oilText?.setText(this.oil.toString());
  }

  showResourceTooltip(res, sprite) {
    const sx = (sprite.x - this.cameras.main.worldView.x) * this.cameras.main.zoom;
    const sy = (sprite.y - this.cameras.main.worldView.y) * this.cameras.main.zoom;
    const labels = { gold: 'Gold Mine', wood: 'Lumber', oil: 'Oil Deposit' };
    const colors = { gold: '#ffd700', wood: '#8fbc8f', oil: '#aaaaaa' };
    this.tooltipText.setText(`${labels[res.type] || res.type}\nAmount: ${res.amount}`);
    this.tooltipText.setColor(colors[res.type] || '#ffffff');
    this.tooltip.setPosition(sx + 16, sy - 50);
    this.tooltip.setVisible(true);
  }

  hideResourceTooltip() {
    this.tooltip.setVisible(false);
  }

  // ─── Selection ring rendering ────────────────────────────────────────────────

  drawSelectionRings() {
    const g = this.selectionGraphics;
    g.clear();
    for (const w of this.selectedWorkers) {
      // Ground ellipse (shadow ring)
      g.lineStyle(2, 0x00ff44, 0.5);
      g.strokeEllipse(w.x, w.y + 12, 32, 11);
      // Full selection circle
      g.lineStyle(2, 0x00ff44, 0.9);
      g.strokeCircle(w.x, w.y, 22);
    }
  }

  // ─── Main loop ──────────────────────────────────────────────────────────────

  update(_time, delta) {
    this.handleCameraScroll(delta);

    if (this.townHall) {
      const completed = this.townHall.update(delta);
      for (let i = 0; i < completed; i++) this.spawnWorkerAtRallyPoint();
    }

    for (const w of this.workers) w.update(delta);
    this._drawDebug();
    this.drawSelectionRings();
    this._drawRallyMarker();
    this._drawRallyLine();
    this.updateMinimapViewport();
    this.updateBuildingPanel();
  }

  handleCameraScroll(delta) {
    const cam   = this.cameras.main;
    const speed = CAM_SPEED * (delta / 1000) / cam.zoom;
    const { width: W, height: H } = this.game.canvas;
    const pointer = this.input.activePointer;

    // Don't edge-scroll when dragging a selection box
    if (this._isDragging) return;

    let dx = 0, dy = 0;
    if (this.cursors.left.isDown  || this.wasd.left.isDown  || pointer.x < SCROLL_MARGIN)         dx -= speed;
    if (this.cursors.right.isDown || this.wasd.right.isDown || pointer.x > W - SCROLL_MARGIN)     dx += speed;
    if (this.cursors.up.isDown    || this.wasd.up.isDown    || pointer.y < SCROLL_MARGIN)         dy -= speed;
    if (this.cursors.down.isDown  || this.wasd.down.isDown  || pointer.y > H - SCROLL_MARGIN)     dy += speed;

    if (dx !== 0 || dy !== 0) { cam.scrollX += dx; cam.scrollY += dy; }
  }
}
