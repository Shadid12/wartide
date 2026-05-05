import { TERRAIN, RESOURCE, MAP_WIDTH, MAP_HEIGHT } from '../config/gameConfig.js';

// Simple noise function using permutation table
function fade(t) { return t * t * t * (t * (t * 6 - 15) + 10); }
function lerp(a, b, t) { return a + t * (b - a); }
function grad(hash, x, y) {
  const h = hash & 3;
  const u = h < 2 ? x : y;
  const v = h < 2 ? y : x;
  return ((h & 1) ? -u : u) + ((h & 2) ? -v : v);
}

class PerlinNoise {
  constructor(seed = 42) {
    this.perm = new Uint8Array(512);
    const p = new Uint8Array(256);
    for (let i = 0; i < 256; i++) p[i] = i;
    // Seeded shuffle
    let s = seed;
    for (let i = 255; i > 0; i--) {
      s = (s * 1664525 + 1013904223) >>> 0;
      const j = s % (i + 1);
      [p[i], p[j]] = [p[j], p[i]];
    }
    for (let i = 0; i < 512; i++) this.perm[i] = p[i & 255];
  }

  noise(x, y) {
    const X = Math.floor(x) & 255;
    const Y = Math.floor(y) & 255;
    x -= Math.floor(x);
    y -= Math.floor(y);
    const u = fade(x);
    const v = fade(y);
    const a  = this.perm[X]     + Y;
    const aa = this.perm[a];
    const ab = this.perm[a + 1];
    const b  = this.perm[X + 1] + Y;
    const ba = this.perm[b];
    const bb = this.perm[b + 1];
    return lerp(
      lerp(grad(this.perm[aa], x,     y    ), grad(this.perm[ba], x - 1, y    ), u),
      lerp(grad(this.perm[ab], x,     y - 1), grad(this.perm[bb], x - 1, y - 1), u),
      v
    );
  }

  octave(x, y, octaves = 6, persistence = 0.5, lacunarity = 2.0) {
    let value = 0, amplitude = 1, frequency = 1, max = 0;
    for (let i = 0; i < octaves; i++) {
      value += this.noise(x * frequency, y * frequency) * amplitude;
      max += amplitude;
      amplitude *= persistence;
      frequency *= lacunarity;
    }
    return value / max;
  }
}

export function generateMap(seed = Math.floor(Math.random() * 10000)) {
  const heightNoise = new PerlinNoise(seed);
  const moistureNoise = new PerlinNoise(seed + 1337);
  const resourceNoise = new PerlinNoise(seed + 2674);

  const tiles = [];
  const resources = [];

  const scale = 0.035;

  for (let y = 0; y < MAP_HEIGHT; y++) {
    tiles[y] = [];
    for (let x = 0; x < MAP_WIDTH; x++) {
      // Fade edges toward water
      const edgeFadeX = Math.min(x, MAP_WIDTH  - 1 - x) / (MAP_WIDTH  * 0.15);
      const edgeFadeY = Math.min(y, MAP_HEIGHT - 1 - y) / (MAP_HEIGHT * 0.15);
      const edgeFade  = Math.min(1, Math.min(edgeFadeX, edgeFadeY));

      const h = (heightNoise.octave(x * scale, y * scale) * 0.5 + 0.5) * edgeFade;
      const m = moistureNoise.octave(x * scale * 0.8, y * scale * 0.8) * 0.5 + 0.5;

      // High-frequency noise used to scatter trees rather than solid blobs
      const treeThreshold = resourceNoise.noise(x * 0.38, y * 0.38) * 0.5 + 0.5;

      let terrain;
      if      (h < 0.25) terrain = TERRAIN.DEEP_WATER;
      else if (h < 0.32) terrain = TERRAIN.SHALLOW_WATER;
      else if (h < 0.38) terrain = TERRAIN.SAND;
      else if (h < 0.60) terrain = m > 0.6 ? TERRAIN.DARK_GRASS : TERRAIN.GRASS;
      else if (h < 0.72) terrain = treeThreshold > 0.52
                           ? TERRAIN.FOREST
                           : (m > 0.6 ? TERRAIN.DARK_GRASS : TERRAIN.GRASS);
      else if (h < 0.85) terrain = TERRAIN.MOUNTAIN;
      else               terrain = TERRAIN.SNOW;

      tiles[y][x] = terrain;
    }
  }

  // Place resources using noise
  for (let y = 0; y < MAP_HEIGHT; y++) {
    for (let x = 0; x < MAP_WIDTH; x++) {
      const terrain = tiles[y][x];
      const rn = resourceNoise.noise(x * 0.3, y * 0.3) * 0.5 + 0.5;

      if (terrain === TERRAIN.FOREST) {
        resources.push({ x, y, type: RESOURCE.WOOD, amount: 1000 + Math.floor(rn * 500) });
      } else if ((terrain === TERRAIN.MOUNTAIN || terrain === TERRAIN.DARK_GRASS) && rn > 0.80) {
        resources.push({ x, y, type: RESOURCE.GOLD, amount: 2000 + Math.floor(rn * 3000) });
      } else if (terrain === TERRAIN.SHALLOW_WATER && rn > 0.82) {
        resources.push({ x, y, type: RESOURCE.OIL, amount: 1500 + Math.floor(rn * 2000) });
      }
    }
  }

  return { tiles, resources, seed };
}
