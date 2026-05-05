import { TILE_SIZE, TERRAIN } from '../config/gameConfig.js';

// Procedurally draws tile textures onto Phaser graphics, then generates textures
export function createTileTextures(scene) {
  const ts = TILE_SIZE;

  const terrainDefs = [
    {
      key: `tile_${TERRAIN.DEEP_WATER}`,
      draw(g) {
        g.fillStyle(0x1a3a6e); g.fillRect(0, 0, ts, ts);
        g.fillStyle(0x1f4580, 0.5);
        for (let i = 0; i < 6; i++) {
          g.fillRect(4 + i * 7, 10 + (i % 3) * 12, 18, 3);
        }
      }
    },
    {
      key: `tile_${TERRAIN.SHALLOW_WATER}`,
      draw(g) {
        g.fillStyle(0x2a5298); g.fillRect(0, 0, ts, ts);
        g.fillStyle(0x3a6abf, 0.6);
        for (let i = 0; i < 4; i++) {
          g.fillRect(6 + i * 10, 8 + (i % 2) * 14, 22, 4);
        }
      }
    },
    {
      key: `tile_${TERRAIN.SAND}`,
      draw(g) {
        g.fillStyle(0xd4b483); g.fillRect(0, 0, ts, ts);
        g.fillStyle(0xc8a870, 0.4);
        g.fillRect(5, 5, 10, 3); g.fillRect(25, 15, 8, 2);
        g.fillRect(12, 28, 14, 3); g.fillRect(33, 35, 9, 2);
      }
    },
    {
      key: `tile_${TERRAIN.GRASS}`,
      draw(g) {
        g.fillStyle(0x4a7c3f); g.fillRect(0, 0, ts, ts);
        g.fillStyle(0x5a9c4f, 0.5);
        g.fillRect(3, 8, 4, 8); g.fillRect(15, 3, 4, 10);
        g.fillRect(28, 12, 3, 7); g.fillRect(38, 5, 4, 9);
        g.fillRect(8, 30, 3, 8); g.fillRect(22, 36, 4, 7);
        g.fillRect(35, 28, 3, 9);
      }
    },
    {
      key: `tile_${TERRAIN.DARK_GRASS}`,
      draw(g) {
        g.fillStyle(0x2d5a1b); g.fillRect(0, 0, ts, ts);
        g.fillStyle(0x3a7022, 0.5);
        g.fillRect(2, 6, 5, 10); g.fillRect(14, 2, 5, 12);
        g.fillRect(27, 10, 4, 8); g.fillRect(36, 4, 5, 11);
        g.fillRect(7, 28, 4, 10); g.fillRect(20, 34, 5, 9);
      }
    },
    {
      key: `tile_${TERRAIN.FOREST}`,
      draw(g) {
        g.fillStyle(0x1a3d0a); g.fillRect(0, 0, ts, ts);
        // Tree canopies
        g.fillStyle(0x2a6015);
        g.fillTriangle(12, 4, 4, 20, 20, 20);
        g.fillTriangle(35, 2, 27, 18, 43, 18);
        g.fillTriangle(22, 24, 14, 40, 30, 40);
        g.fillTriangle(42, 26, 34, 42, 50, 42);
        // Trunks
        g.fillStyle(0x5c3d1e);
        g.fillRect(10, 20, 4, 6); g.fillRect(33, 18, 4, 6);
        g.fillRect(20, 40, 4, 6); g.fillRect(40, 42, 4, 4);
      }
    },
    {
      key: `tile_${TERRAIN.MOUNTAIN}`,
      draw(g) {
        g.fillStyle(0x7a6a5a); g.fillRect(0, 0, ts, ts);
        // Mountain peaks
        g.fillStyle(0x9a8a7a);
        g.fillTriangle(12, 8, 2, 36, 22, 36);
        g.fillTriangle(34, 4, 24, 36, 44, 36);
        // Snow caps
        g.fillStyle(0xe8e8e8);
        g.fillTriangle(12, 8, 7, 20, 17, 20);
        g.fillTriangle(34, 4, 29, 16, 39, 16);
        // Shadow
        g.fillStyle(0x5a4a3a, 0.4);
        g.fillTriangle(2, 36, 12, 8, 22, 36);
      }
    },
    {
      key: `tile_${TERRAIN.SNOW}`,
      draw(g) {
        g.fillStyle(0xe8e8e8); g.fillRect(0, 0, ts, ts);
        g.fillStyle(0xd0d0d0, 0.6);
        g.fillRect(4, 10, 18, 4); g.fillRect(22, 22, 20, 3);
        g.fillRect(8, 34, 16, 4); g.fillRect(30, 6, 14, 3);
      }
    },
  ];

  terrainDefs.forEach(({ key, draw }) => {
    const g = scene.add.graphics();
    draw(g);
    g.generateTexture(key, ts, ts);
    g.destroy();
  });

  // Resource textures
  createResourceTextures(scene, ts);
}

function createResourceTextures(scene, ts) {
  // Gold mine
  const gm = scene.add.graphics();
  gm.fillStyle(0x8b6914); gm.fillRect(0, 0, ts, ts);
  gm.fillStyle(0xffd700);
  gm.fillRect(8, 8, ts - 16, ts - 16);
  gm.fillStyle(0xffaa00, 0.8);
  gm.fillRect(12, 12, 10, 10); gm.fillRect(28, 16, 8, 8);
  gm.fillRect(14, 28, 12, 8);
  gm.fillStyle(0xffe066);
  gm.fillRect(16, 16, 5, 5); gm.fillRect(30, 20, 4, 4);
  gm.generateTexture('resource_gold', ts, ts);
  gm.destroy();

  // Wood (lumber)
  const wm = scene.add.graphics();
  wm.fillStyle(0x1a3d0a); wm.fillRect(0, 0, ts, ts);
  // Big tree
  wm.fillStyle(0x2a6015);
  wm.fillCircle(ts / 2, ts / 2 - 4, 18);
  wm.fillStyle(0x3a8020, 0.7);
  wm.fillCircle(ts / 2 - 6, ts / 2 - 8, 10);
  wm.fillCircle(ts / 2 + 6, ts / 2 - 6, 10);
  wm.fillStyle(0x5c3d1e);
  wm.fillRect(ts / 2 - 3, ts / 2 + 10, 6, 10);
  wm.generateTexture('resource_wood', ts, ts);
  wm.destroy();

  // Oil patch
  const om = scene.add.graphics();
  om.fillStyle(0x2a5298); om.fillRect(0, 0, ts, ts);
  om.fillStyle(0x0a0a0a, 0.85);
  om.fillEllipse(ts / 2, ts / 2, 36, 28);
  om.fillStyle(0x3a3a3a, 0.5);
  om.fillEllipse(ts / 2 - 6, ts / 2 - 4, 16, 10);
  // Oil derrick outline
  om.lineStyle(2, 0x888888);
  om.strokeRect(ts / 2 - 3, ts / 2 - 14, 6, 12);
  om.generateTexture('resource_oil', ts, ts);
  om.destroy();
}
