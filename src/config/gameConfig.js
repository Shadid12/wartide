export const TILE_SIZE = 48;
export const MAP_WIDTH = 64;   // tiles
export const MAP_HEIGHT = 64;  // tiles

export const MINIMAP_WIDTH = 200;
export const MINIMAP_HEIGHT = 200;
export const MINIMAP_X = 10;
export const MINIMAP_Y = 10;

// Terrain tile indices (used as keys in our procedural texture map)
export const TERRAIN = {
  DEEP_WATER: 0,
  SHALLOW_WATER: 1,
  SAND: 2,
  GRASS: 3,
  DARK_GRASS: 4,
  FOREST: 5,
  MOUNTAIN: 6,
  SNOW: 7,
};

// Resource types
export const RESOURCE = {
  GOLD: 'gold',
  WOOD: 'wood',
  OIL: 'oil',
};

// Terrain colors for minimap
export const TERRAIN_COLORS = {
  [TERRAIN.DEEP_WATER]:    0x1a3a6e,
  [TERRAIN.SHALLOW_WATER]: 0x2a5298,
  [TERRAIN.SAND]:          0xd4b483,
  [TERRAIN.GRASS]:         0x4a7c3f,
  [TERRAIN.DARK_GRASS]:    0x2d5a1b,
  [TERRAIN.FOREST]:        0x1a3d0a,
  [TERRAIN.MOUNTAIN]:      0x7a6a5a,
  [TERRAIN.SNOW]:          0xe8e8e8,
};

export const RESOURCE_COLORS = {
  [RESOURCE.GOLD]: 0xffd700,
  [RESOURCE.WOOD]: 0x8b4513,
  [RESOURCE.OIL]:  0x1a1a1a,
};
