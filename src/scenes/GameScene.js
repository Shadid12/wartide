import Phaser from 'phaser';
import { generateMap } from '../utils/MapGenerator.js';
import { createTileTextures } from '../utils/TextureFactory.js';
import {
  TILE_SIZE, MAP_WIDTH, MAP_HEIGHT,
  MINIMAP_WIDTH, MINIMAP_HEIGHT, MINIMAP_X, MINIMAP_Y,
  TERRAIN, RESOURCE, TERRAIN_COLORS, RESOURCE_COLORS,
} from '../config/gameConfig.js';

const CAM_SPEED = 400;
const SCROLL_MARGIN = 24;

export default class GameScene extends Phaser.Scene {
  constructor() {
    super({ key: 'GameScene' });
  }

  create() {
    createTileTextures(this);

    const { tiles, resources } = generateMap();
    this.mapTiles = tiles;
    this.mapResources = resources;

    this.buildTileMap();
    this.buildResourceLayer();
    this.setupCamera();
    this.buildMinimap();
    this.buildHUD();
    this.setupInput();
  }

  buildTileMap() {
    this.tileLayer = this.add.container(0, 0);

    for (let y = 0; y < MAP_HEIGHT; y++) {
      for (let x = 0; x < MAP_WIDTH; x++) {
        const terrain = this.mapTiles[y][x];
        const img = this.add.image(
          x * TILE_SIZE + TILE_SIZE / 2,
          y * TILE_SIZE + TILE_SIZE / 2,
          `tile_${terrain}`
        );
        this.tileLayer.add(img);
      }
    }
  }

  buildResourceLayer() {
    this.resourceSprites = [];

    for (const res of this.mapResources) {
      const key = `resource_${res.type}`;
      const sprite = this.add.image(
        res.x * TILE_SIZE + TILE_SIZE / 2,
        res.y * TILE_SIZE + TILE_SIZE / 2,
        key
      );
      sprite.setDepth(1);
      sprite.setInteractive();
      sprite.on('pointerover', () => this.showResourceTooltip(res, sprite));
      sprite.on('pointerout',  () => this.hideResourceTooltip());
      this.resourceSprites.push(sprite);
    }
  }

  setupCamera() {
    const worldW = MAP_WIDTH  * TILE_SIZE;
    const worldH = MAP_HEIGHT * TILE_SIZE;

    this.cameras.main.setBounds(0, 0, worldW, worldH);
    this.cameras.main.setZoom(1);

    // Start camera near center of map
    this.cameras.main.centerOn(worldW / 2, worldH / 2);
  }

  buildMinimap() {
    const scaleX = MINIMAP_WIDTH  / (MAP_WIDTH  * TILE_SIZE);
    const scaleY = MINIMAP_HEIGHT / (MAP_HEIGHT * TILE_SIZE);

    // Fixed minimap container (stays in screen space)
    this.minimapContainer = this.add.container(0, 0).setScrollFactor(0).setDepth(100);

    // Background border
    const border = this.add.graphics();
    border.fillStyle(0x000000, 0.85);
    border.fillRect(
      MINIMAP_X - 3,
      MINIMAP_Y - 3,
      MINIMAP_WIDTH + 6,
      MINIMAP_HEIGHT + 6
    );
    border.lineStyle(2, 0x888888);
    border.strokeRect(
      MINIMAP_X - 3,
      MINIMAP_Y - 3,
      MINIMAP_WIDTH + 6,
      MINIMAP_HEIGHT + 6
    );
    this.minimapContainer.add(border);

    // Draw terrain pixels
    const terrainGraphics = this.add.graphics();
    for (let y = 0; y < MAP_HEIGHT; y++) {
      for (let x = 0; x < MAP_WIDTH; x++) {
        const terrain = this.mapTiles[y][x];
        const color = TERRAIN_COLORS[terrain] ?? 0x000000;
        terrainGraphics.fillStyle(color);
        const px = MINIMAP_X + x * MINIMAP_WIDTH  / MAP_WIDTH;
        const py = MINIMAP_Y + y * MINIMAP_HEIGHT / MAP_HEIGHT;
        const pw = Math.ceil(MINIMAP_WIDTH  / MAP_WIDTH);
        const ph = Math.ceil(MINIMAP_HEIGHT / MAP_HEIGHT);
        terrainGraphics.fillRect(px, py, pw, ph);
      }
    }
    this.minimapContainer.add(terrainGraphics);

    // Draw resource dots
    const resGraphics = this.add.graphics();
    for (const res of this.mapResources) {
      const color = RESOURCE_COLORS[res.type] ?? 0xffffff;
      resGraphics.fillStyle(color);
      const px = MINIMAP_X + res.x * MINIMAP_WIDTH  / MAP_WIDTH;
      const py = MINIMAP_Y + res.y * MINIMAP_HEIGHT / MAP_HEIGHT;
      resGraphics.fillRect(px, py, 2, 2);
    }
    this.minimapContainer.add(resGraphics);

    // Camera viewport rectangle (updates each frame)
    this.minimapViewport = this.add.graphics().setScrollFactor(0).setDepth(101);
    this.minimapContainer.add(this.minimapViewport);

    // Click on minimap to move camera
    const minimapZone = this.add.zone(
      MINIMAP_X + MINIMAP_WIDTH / 2,
      MINIMAP_Y + MINIMAP_HEIGHT / 2,
      MINIMAP_WIDTH,
      MINIMAP_HEIGHT
    ).setScrollFactor(0).setDepth(102).setInteractive();

    minimapZone.on('pointerdown', (pointer) => {
      const nx = (pointer.x - MINIMAP_X) / MINIMAP_WIDTH;
      const ny = (pointer.y - MINIMAP_Y) / MINIMAP_HEIGHT;
      this.cameras.main.centerOn(
        nx * MAP_WIDTH  * TILE_SIZE,
        ny * MAP_HEIGHT * TILE_SIZE
      );
    });

    this.minimapScaleX = scaleX;
    this.minimapScaleY = scaleY;
  }

  buildHUD() {
    // HUD bar at bottom
    this.hudContainer = this.add.container(0, 0).setScrollFactor(0).setDepth(200);

    const { width: W, height: H } = this.cameras.main;

    const hudBg = this.add.graphics();
    hudBg.fillStyle(0x1a1a2e, 0.9);
    hudBg.fillRect(0, H - 48, W, 48);
    hudBg.lineStyle(1, 0x444466);
    hudBg.strokeRect(0, H - 48, W, 48);
    this.hudContainer.add(hudBg);

    const style = { fontSize: '14px', color: '#ffd700', fontFamily: 'monospace' };

    const goldIcon = this.add.text(16, H - 34, 'GOLD', { ...style, color: '#ffd700' });
    this.goldText  = this.add.text(72, H - 34, '0', { ...style, color: '#ffffff' });

    const woodIcon = this.add.text(160, H - 34, 'WOOD', { ...style, color: '#8fbc8f' });
    this.woodText  = this.add.text(216, H - 34, '0', { ...style, color: '#ffffff' });

    const oilIcon  = this.add.text(300, H - 34, 'OIL',  { ...style, color: '#aaaaaa' });
    this.oilText   = this.add.text(340, H - 34, '0', { ...style, color: '#ffffff' });

    const titleText = this.add.text(W / 2, H - 34, 'W A R T I D E', {
      fontSize: '16px', color: '#ccccff', fontFamily: 'monospace', fontStyle: 'bold'
    }).setOrigin(0.5, 0);

    this.hudContainer.add([goldIcon, this.goldText, woodIcon, this.woodText, oilIcon, this.oilText, titleText]);

    // Tooltip
    this.tooltip = this.add.container(0, 0).setScrollFactor(0).setDepth(300).setVisible(false);
    const tooltipBg = this.add.graphics();
    tooltipBg.fillStyle(0x000000, 0.85);
    tooltipBg.fillRoundedRect(0, 0, 160, 44, 6);
    tooltipBg.lineStyle(1, 0x888888);
    tooltipBg.strokeRoundedRect(0, 0, 160, 44, 6);
    this.tooltipBg = tooltipBg;
    this.tooltipText = this.add.text(8, 6, '', { fontSize: '12px', color: '#ffffff', fontFamily: 'monospace' });
    this.tooltip.add([tooltipBg, this.tooltipText]);
  }

  setupInput() {
    this.cursors = this.input.keyboard.createCursorKeys();
    this.wasd = this.input.keyboard.addKeys({
      up:    Phaser.Input.Keyboard.KeyCodes.W,
      down:  Phaser.Input.Keyboard.KeyCodes.S,
      left:  Phaser.Input.Keyboard.KeyCodes.A,
      right: Phaser.Input.Keyboard.KeyCodes.D,
    });

    // Zoom with mouse wheel
    this.input.on('wheel', (pointer, objs, dx, dy) => {
      const zoom = this.cameras.main.zoom;
      const newZoom = Phaser.Math.Clamp(zoom - dy * 0.001, 0.4, 2.0);
      this.cameras.main.setZoom(newZoom);
    });
  }

  showResourceTooltip(res, sprite) {
    const screenPos = this.cameras.main.getWorldPoint(0, 0);
    const sx = (sprite.x - this.cameras.main.worldView.x) * this.cameras.main.zoom;
    const sy = (sprite.y - this.cameras.main.worldView.y) * this.cameras.main.zoom;

    const labels = { gold: 'Gold Mine', wood: 'Lumber', oil: 'Oil Deposit' };
    const colors = { gold: '#ffd700', wood: '#8fbc8f', oil: '#aaaaaa' };
    const label  = labels[res.type] || res.type;

    this.tooltipText.setText(`${label}\nAmount: ${res.amount}`);
    this.tooltipText.setColor(colors[res.type] || '#ffffff');
    this.tooltip.setPosition(sx + 16, sy - 50);
    this.tooltip.setVisible(true);
  }

  hideResourceTooltip() {
    this.tooltip.setVisible(false);
  }

  updateMinimapViewport() {
    const cam   = this.cameras.main;
    const ww    = MAP_WIDTH  * TILE_SIZE;
    const wh    = MAP_HEIGHT * TILE_SIZE;

    const vx = MINIMAP_X + (cam.worldView.x / ww) * MINIMAP_WIDTH;
    const vy = MINIMAP_Y + (cam.worldView.y / wh) * MINIMAP_HEIGHT;
    const vw = (cam.worldView.width  / ww) * MINIMAP_WIDTH;
    const vh = (cam.worldView.height / wh) * MINIMAP_HEIGHT;

    this.minimapViewport.clear();
    this.minimapViewport.lineStyle(2, 0xffffff, 0.9);
    this.minimapViewport.strokeRect(vx, vy, vw, vh);
  }

  update(time, delta) {
    this.handleCameraScroll(delta);
    this.updateMinimapViewport();
  }

  handleCameraScroll(delta) {
    const cam   = this.cameras.main;
    const speed = CAM_SPEED * (delta / 1000) / cam.zoom;
    const { width: W, height: H } = this.game.canvas;
    const pointer = this.input.activePointer;

    let dx = 0, dy = 0;

    if (this.cursors.left.isDown  || this.wasd.left.isDown  || pointer.x < SCROLL_MARGIN) dx -= speed;
    if (this.cursors.right.isDown || this.wasd.right.isDown || pointer.x > W - SCROLL_MARGIN) dx += speed;
    if (this.cursors.up.isDown    || this.wasd.up.isDown    || pointer.y < SCROLL_MARGIN) dy -= speed;
    if (this.cursors.down.isDown  || this.wasd.down.isDown  || pointer.y > H - SCROLL_MARGIN) dy += speed;

    if (dx !== 0 || dy !== 0) {
      cam.scrollX += dx;
      cam.scrollY += dy;
    }
  }
}
