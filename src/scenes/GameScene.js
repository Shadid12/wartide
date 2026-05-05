import Phaser from 'phaser';
import { generateMap } from '../utils/MapGenerator.js';
import { createTileTextures } from '../utils/TextureFactory.js';
import Worker from '../entities/Worker.js';
import TownHall, { TOWNHALL_FOOTPRINT } from '../entities/TownHall.js';
import {
  TILE_SIZE, MAP_WIDTH, MAP_HEIGHT,
  MINIMAP_WIDTH, MINIMAP_HEIGHT, MINIMAP_X, MINIMAP_Y,
  TERRAIN, RESOURCE, TERRAIN_COLORS, RESOURCE_COLORS, WALKABLE,
} from '../config/gameConfig.js';


const CAM_SPEED = 400;
const SCROLL_MARGIN = 24;
const DRAG_THRESHOLD = 6;       // px of mouse travel before it's a drag
const WORKER_COUNT = 8;
const FORMATION_SPACING = 44;   // px between workers in move formation

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
    this.load.image('townhall', 'assets/sprites/townhall/town.png');
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

    this.workers = [];
    this.selectedWorkers = [];

    // Shared selection ring graphics (world space)
    this.selectionGraphics = this.add.graphics().setDepth(4);

    // Drag-box overlay (screen space)
    this.dragBoxGraphics = this.add.graphics().setScrollFactor(0).setDepth(400);

    // Move marker (world space, fades out)
    this.moveMarker = this.add.graphics().setDepth(6);

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
    this.resourceSprites = [];
    for (const res of this.mapResources) {
      const sprite = this.add.image(
        res.x * TILE_SIZE + TILE_SIZE / 2,
        res.y * TILE_SIZE + TILE_SIZE / 2,
        `resource_${res.type}`
      ).setDepth(1).setInteractive();
      sprite.on('pointerover', () => this.showResourceTooltip(res, sprite));
      sprite.on('pointerout',  () => this.hideResourceTooltip());
      this.resourceSprites.push(sprite);
    }
  }

  buildForestLayer() {
    for (let y = 0; y < MAP_HEIGHT; y++) {
      for (let x = 0; x < MAP_WIDTH; x++) {
        if (this.mapTiles[y][x] !== TERRAIN.FOREST) continue;

        const wx = x * TILE_SIZE + TILE_SIZE / 2;
        const wy = y * TILE_SIZE + TILE_SIZE;

        // Stagger start frame so trees don't all sway in sync
        const startFrame = (x * 3 + y * 7) % 8;

        this.add.sprite(wx, wy, 'tree1')
          .setDepth(3)
          .setOrigin(0.5, 1)
          .setScale(0.84)
          .play({ key: 'tree_sway', startFrame });
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
            for (let fy = 0; fy < fp; fy++)
              for (let fx = 0; fx < fp; fx++)
                this.mapTiles[ty + fy][tx + fx] = TERRAIN.BUILDING;

            this.townHall = new TownHall(this, tx, ty);
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

    // Find nearby walkable tiles starting from center
    const placed = [];
    for (let r = 0; r < 20 && placed.length < WORKER_COUNT; r++) {
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
    }
    for (const w of list) {
      if (!w.selected) {
        w.setSelected(true);
        this.selectedWorkers.push(w);
      }
    }
    this.updateUnitCountHUD();
  }

  deselectAll() {
    this.selectedWorkers.forEach(w => w.setSelected(false));
    this.selectedWorkers = [];
    this.updateUnitCountHUD();
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

    this.input.on('pointerdown', this._onPointerDown, this);
    this.input.on('pointermove', this._onPointerMove, this);
    this.input.on('pointerup',   this._onPointerUp,   this);
  }

  _isOverMinimap(sx, sy) {
    return sx >= MINIMAP_X && sx <= MINIMAP_X + MINIMAP_WIDTH &&
           sy >= MINIMAP_Y && sy <= MINIMAP_Y + MINIMAP_HEIGHT;
  }

  _onPointerDown(pointer) {
    if (pointer.rightButtonDown()) {
      // Right-click: move command (ignore minimap area)
      if (this._isOverMinimap(pointer.x, pointer.y)) return;
      this.issueMove(pointer.worldX, pointer.worldY);
      return;
    }

    if (!pointer.leftButtonDown()) return;
    if (this._isOverMinimap(pointer.x, pointer.y)) return;

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

  update(time, delta) {
    this.handleCameraScroll(delta);

    for (const w of this.workers) w.update(delta);
    this.drawSelectionRings();
    this.updateMinimapViewport();
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
