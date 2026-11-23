import type { GameObjectData, SceneData, Vector2 } from '../core/types';
import { getWorldColliders } from '../physics/collision2d';

export interface GridNav2D {
  cellSize: number;
  cols: number;
  rows: number;
  blocked: Uint8Array;
}

export function buildGridNav2D(
  scene: SceneData,
  worldWidth: number,
  worldHeight: number,
  cellSize = 32
): GridNav2D {
  const cs = Math.max(16, cellSize);
  const cols = Math.max(4, Math.ceil(worldWidth / cs));
  const rows = Math.max(4, Math.ceil(worldHeight / cs));
  const blocked = new Uint8Array(cols * rows);

  for (const obj of scene.objects) {
    if (!obj.visible) continue;
    const isSolid = obj.components.some((c) => c.enabled && c.type === 'solid');
    if (!isSolid) continue;

    if (obj.type === 'tilemap' && obj.tilemap) {
      const tm = obj.tilemap;
      const tw = tm.tileWidth * obj.transform.scaleX;
      const th = tm.tileHeight * obj.transform.scaleY;
      const ox = obj.transform.x - tm.cols * tw * obj.transform.anchorX;
      const oy = obj.transform.y - tm.rows * th * obj.transform.anchorY;
      for (const k of Object.keys(tm.cells)) {
        const [cStr, rStr] = k.split(',');
        const l = ox + Number(cStr) * tw;
        const t = oy + Number(rStr) * th;
        markRectBlocked(blocked, cols, rows, cs, l, t, l + tw, t + th);
      }
    } else {
      for (const col of getWorldColliders(obj)) {
        if (!col.isSensor) {
          markRectBlocked(blocked, cols, rows, cs, col.left, col.top, col.right, col.bottom);
        }
      }
    }
  }

  return { cellSize: cs, cols, rows, blocked };
}

function markRectBlocked(
  blocked: Uint8Array,
  cols: number,
  rows: number,
  cs: number,
  left: number,
  top: number,
  right: number,
  bottom: number
): void {
  const c0 = Math.max(0, Math.floor(left / cs));
  const c1 = Math.min(cols - 1, Math.floor((right - 0.1) / cs));
  const r0 = Math.max(0, Math.floor(top / cs));
  const r1 = Math.min(rows - 1, Math.floor((bottom - 0.1) / cs));
  for (let r = r0; r <= r1; r++) {
    for (let c = c0; c <= c1; c++) {
      blocked[r * cols + c] = 1;
    }
  }
}

export function findPath2D(nav: GridNav2D, start: Vector2, goal: Vector2): Vector2[] {
  const sc = Math.max(0, Math.min(nav.cols - 1, Math.floor(start.x / nav.cellSize)));
  const sr = Math.max(0, Math.min(nav.rows - 1, Math.floor(start.y / nav.cellSize)));
  const gc = Math.max(0, Math.min(nav.cols - 1, Math.floor(goal.x / nav.cellSize)));
  const gr = Math.max(0, Math.min(nav.rows - 1, Math.floor(goal.y / nav.cellSize)));

  const startIdx = sr * nav.cols + sc;
  const goalIdx = gr * nav.cols + gc;
  if (startIdx === goalIdx) return [goal];

  const total = nav.cols * nav.rows;
  const gScore = new Float32Array(total).fill(Infinity);
  const fScore = new Float32Array(total).fill(Infinity);
  const cameFrom = new Int32Array(total).fill(-1);
  const closed = new Uint8Array(total);
  const open = [startIdx];

  gScore[startIdx] = 0;
  fScore[startIdx] = Math.hypot(gc - sc, gr - sr);
  const dirs = [
    [1, 0, 1],
    [-1, 0, 1],
    [0, 1, 1],
    [0, -1, 1],
    [1, 1, 1.414],
    [-1, 1, 1.414],
    [1, -1, 1.414],
    [-1, -1, 1.414],
  ];

  let guard = 0;
  while (open.length > 0 && guard++ < 4000) {
    let bestPos = 0;
    for (let i = 1; i < open.length; i++) {
      if (fScore[open[i]] < fScore[open[bestPos]]) bestPos = i;
    }
    const cur = open.splice(bestPos, 1)[0];
    if (cur === goalIdx) {
      const path: Vector2[] = [];
      let trace = cur;
      while (trace !== -1 && trace !== startIdx) {
        const c = trace % nav.cols;
        const r = Math.floor(trace / nav.cols);
        path.unshift({
          x: (c + 0.5) * nav.cellSize,
          y: (r + 0.5) * nav.cellSize,
        });
        trace = cameFrom[trace];
      }
      if (path.length > 0) path[path.length - 1] = goal;
      return path;
    }

    closed[cur] = 1;
    const cc = cur % nav.cols;
    const cr = Math.floor(cur / nav.cols);

    for (const [dc, dr, cost] of dirs) {
      const nc = cc + dc;
      const nr = cr + dr;
      if (nc < 0 || nc >= nav.cols || nr < 0 || nr >= nav.rows) continue;
      const nIdx = nr * nav.cols + nc;
      if (closed[nIdx] || (nav.blocked[nIdx] === 1 && nIdx !== goalIdx)) continue;
      if (dc !== 0 && dr !== 0) {
        if (nav.blocked[cr * nav.cols + nc] === 1 || nav.blocked[nr * nav.cols + cc] === 1) continue;
      }
      const tg = gScore[cur] + cost;
      if (tg < gScore[nIdx]) {
        cameFrom[nIdx] = cur;
        gScore[nIdx] = tg;
        fScore[nIdx] = tg + Math.hypot(gc - nc, gr - nr);
        if (!open.includes(nIdx)) open.push(nIdx);
      }
    }
  }
  return [goal];
}

export function hasLineOfSight2D(
  a: Vector2,
  b: Vector2,
  solidObjects: GameObjectData[]
): boolean {
  const dist = Math.hypot(b.x - a.x, b.y - a.y);
  const steps = Math.max(2, Math.ceil(dist / 12));
  for (let i = 1; i < steps; i++) {
    const t = i / steps;
    const px = a.x + (b.x - a.x) * t;
    const py = a.y + (b.y - a.y) * t;
    for (const solid of solidObjects) {
      for (const col of getWorldColliders(solid)) {
        if (!col.isSensor && px >= col.left && px <= col.right && py >= col.top && py <= col.bottom) {
          return false;
        }
      }
    }
  }
  return true;
}
