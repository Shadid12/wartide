import { MAP_WIDTH, MAP_HEIGHT, WALKABLE } from '../config/gameConfig.js';

const SQRT2 = Math.SQRT2;

// 8-directional neighbours: cardinal first, then diagonals
const DIRS = [
  [0, -1, 1], [0, 1, 1], [-1, 0, 1], [1, 0, 1],
  [-1, -1, SQRT2], [1, -1, SQRT2], [-1, 1, SQRT2], [1, 1, SQRT2],
];

function h(ax, ay, bx, by) {
  const dx = Math.abs(ax - bx), dy = Math.abs(ay - by);
  return (dx + dy) + (SQRT2 - 2) * Math.min(dx, dy); // octile heuristic
}

class MinHeap {
  constructor() { this.d = []; }
  push(item) {
    this.d.push(item);
    this._up(this.d.length - 1);
  }
  pop() {
    const top = this.d[0];
    const last = this.d.pop();
    if (this.d.length) { this.d[0] = last; this._down(0); }
    return top;
  }
  isEmpty() { return this.d.length === 0; }
  _up(i) {
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (this.d[p].f <= this.d[i].f) break;
      [this.d[p], this.d[i]] = [this.d[i], this.d[p]];
      i = p;
    }
  }
  _down(i) {
    const n = this.d.length;
    for (;;) {
      let s = i;
      const l = 2 * i + 1, r = l + 1;
      if (l < n && this.d[l].f < this.d[s].f) s = l;
      if (r < n && this.d[r].f < this.d[s].f) s = r;
      if (s === i) break;
      [this.d[s], this.d[i]] = [this.d[i], this.d[s]];
      i = s;
    }
  }
}

function nearestWalkable(tiles, tx, ty) {
  for (let r = 1; r < 15; r++) {
    for (let dy = -r; dy <= r; dy++) {
      for (let dx = -r; dx <= r; dx++) {
        if (Math.abs(dx) !== r && Math.abs(dy) !== r) continue;
        const nx = tx + dx, ny = ty + dy;
        if (nx < 0 || ny < 0 || nx >= MAP_WIDTH || ny >= MAP_HEIGHT) continue;
        if (WALKABLE.has(tiles[ny][nx])) return { x: nx, y: ny };
      }
    }
  }
  return null;
}

/**
 * Returns array of tile {x, y} from start to end (inclusive), or null if no path.
 * Destination is automatically redirected to nearest walkable tile if impassable.
 */
export function findPath(tiles, startTX, startTY, endTX, endTY) {
  startTX = Math.max(0, Math.min(MAP_WIDTH - 1, startTX));
  startTY = Math.max(0, Math.min(MAP_HEIGHT - 1, startTY));
  endTX   = Math.max(0, Math.min(MAP_WIDTH - 1, endTX));
  endTY   = Math.max(0, Math.min(MAP_HEIGHT - 1, endTY));

  if (!WALKABLE.has(tiles[endTY][endTX])) {
    const w = nearestWalkable(tiles, endTX, endTY);
    if (!w) return null;
    endTX = w.x; endTY = w.y;
  }

  if (startTX === endTX && startTY === endTY) return [{ x: startTX, y: startTY }];

  const idx   = (x, y) => y * MAP_WIDTH + x;
  const gCost = new Float32Array(MAP_WIDTH * MAP_HEIGHT).fill(Infinity);
  const from  = new Int32Array(MAP_WIDTH * MAP_HEIGHT).fill(-1);
  const open  = new MinHeap();

  gCost[idx(startTX, startTY)] = 0;
  open.push({ x: startTX, y: startTY, f: h(startTX, startTY, endTX, endTY) });

  while (!open.isEmpty()) {
    const { x: cx, y: cy } = open.pop();

    if (cx === endTX && cy === endTY) {
      const path = [];
      let cur = idx(cx, cy);
      while (cur !== -1) {
        path.unshift({ x: cur % MAP_WIDTH, y: Math.floor(cur / MAP_WIDTH) });
        cur = from[cur];
      }
      return path;
    }

    const cg = gCost[idx(cx, cy)];

    for (const [ddx, ddy, cost] of DIRS) {
      const nx = cx + ddx, ny = cy + ddy;
      if (nx < 0 || ny < 0 || nx >= MAP_WIDTH || ny >= MAP_HEIGHT) continue;
      if (!WALKABLE.has(tiles[ny][nx])) continue;
      // Prevent diagonal corner-cutting through obstacles
      if (ddx !== 0 && ddy !== 0) {
        if (!WALKABLE.has(tiles[cy][nx]) || !WALKABLE.has(tiles[ny][cx])) continue;
      }

      const ng = cg + cost;
      const ni = idx(nx, ny);
      if (ng < gCost[ni]) {
        gCost[ni] = ng;
        from[ni]  = idx(cx, cy);
        open.push({ x: nx, y: ny, f: ng + h(nx, ny, endTX, endTY) });
      }
    }
  }

  return null;
}
