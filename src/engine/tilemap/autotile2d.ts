import type { TileCollisionKind, TilemapProperties } from '../core/types';

export function computeCardinalBitmask(
  cells: Record<string, number>,
  col: number,
  row: number
): number {
  let mask = 0;
  if (cells[`${col},${row - 1}`] !== undefined) mask |= 1; // N
  if (cells[`${col + 1},${row}`] !== undefined) mask |= 2; // E
  if (cells[`${col},${row + 1}`] !== undefined) mask |= 4; // S
  if (cells[`${col - 1},${row}`] !== undefined) mask |= 8; // W
  return mask;
}

export function resolveAutotileIndex(
  tilemap: TilemapProperties,
  mask: number,
  fallbackIndex: number
): number {
  const custom = tilemap.autotileBitmaskMap?.[mask];
  if (typeof custom === 'number' && Number.isFinite(custom)) {
    return Math.max(0, Math.round(custom));
  }
  const base = Math.max(0, Math.round(tilemap.autotileBaseTile ?? 0));
  const totalTiles = Math.max(1, (tilemap.tilesetCols || 1) * (tilemap.tilesetRows || 1));
  if (base + mask < totalTiles) {
    return base + mask;
  }
  return Math.max(0, fallbackIndex);
}

export function applyAutotile4Bit(
  tilemap: TilemapProperties,
  col: number,
  row: number,
  erase = false,
  paintTileIndex?: number
): Record<string, number> {
  const next = { ...tilemap.cells };
  const cols = Math.max(1, tilemap.cols);
  const rows = Math.max(1, tilemap.rows);
  if (col < 0 || row < 0 || col >= cols || row >= rows) return next;

  const baseIdx = paintTileIndex ?? tilemap.selectedTileIndex ?? 0;
  const key = `${col},${row}`;
  if (erase) {
    delete next[key];
  } else {
    next[key] = baseIdx;
  }

  // Recalcular celda y sus 4 vecinos cardinales
  const targets: Array<[number, number]> = [
    [col, row],
    [col, row - 1],
    [col + 1, row],
    [col, row + 1],
    [col - 1, row],
  ];

  for (const [tx, ty] of targets) {
    if (tx < 0 || ty < 0 || tx >= cols || ty >= rows) continue;
    const tk = `${tx},${ty}`;
    if (next[tk] === undefined) continue;
    const mask = computeCardinalBitmask(next, tx, ty);
    next[tk] = resolveAutotileIndex(tilemap, mask, baseIdx);
  }
  return next;
}

export function paintRectTilemap(
  tilemap: TilemapProperties,
  c0: number,
  r0: number,
  c1: number,
  r1: number,
  erase = false,
  autotile = false
): Record<string, number> {
  let next = { ...tilemap.cells };
  const minC = Math.max(0, Math.min(c0, c1));
  const maxC = Math.min(Math.max(0, tilemap.cols - 1), Math.max(c0, c1));
  const minR = Math.max(0, Math.min(r0, r1));
  const maxR = Math.min(Math.max(0, tilemap.rows - 1), Math.max(r0, r1));
  const tileIdx = tilemap.selectedTileIndex ?? 0;

  for (let r = minR; r <= maxR; r++) {
    for (let c = minC; c <= maxC; c++) {
      const key = `${c},${r}`;
      if (erase) {
        delete next[key];
      } else {
        next[key] = tileIdx;
      }
    }
  }

  if (autotile) {
    for (let r = Math.max(0, minR - 1); r <= Math.min(tilemap.rows - 1, maxR + 1); r++) {
      for (let c = Math.max(0, minC - 1); c <= Math.min(tilemap.cols - 1, maxC + 1); c++) {
        const key = `${c},${r}`;
        if (next[key] === undefined) continue;
        const mask = computeCardinalBitmask(next, c, r);
        next[key] = resolveAutotileIndex(tilemap, mask, tileIdx);
      }
    }
  }
  return next;
}

export function floodFillTilemap(
  tilemap: TilemapProperties,
  startCol: number,
  startRow: number,
  erase = false,
  autotile = false,
  maxFilled = 4096
): Record<string, number> {
  const cols = Math.max(1, tilemap.cols);
  const rows = Math.max(1, tilemap.rows);
  if (startCol < 0 || startRow < 0 || startCol >= cols || startRow >= rows) {
    return { ...tilemap.cells };
  }
  const next = { ...tilemap.cells };
  const targetIdx = erase ? undefined : (tilemap.selectedTileIndex ?? 0);
  const originIdx = next[`${startCol},${startRow}`];
  if (originIdx === targetIdx) return next;

  const queue: Array<[number, number]> = [[startCol, startRow]];
  const visited = new Set<string>([`${startCol},${startRow}`]);
  const modified: Array<[number, number]> = [];

  while (queue.length > 0 && modified.length < maxFilled) {
    const [c, r] = queue.shift()!;
    const key = `${c},${r}`;
    if (next[key] !== originIdx) continue;
    if (erase) {
      delete next[key];
    } else {
      next[key] = targetIdx!;
    }
    modified.push([c, r]);

    const neighbors: Array<[number, number]> = [
      [c, r - 1],
      [c + 1, r],
      [c, r + 1],
      [c - 1, r],
    ];
    for (const [nc, nr] of neighbors) {
      if (nc < 0 || nr < 0 || nc >= cols || nr >= rows) continue;
      const nKey = `${nc},${nr}`;
      if (visited.has(nKey)) continue;
      if (next[nKey] === originIdx) {
        visited.add(nKey);
        queue.push([nc, nr]);
      }
    }
  }

  if (autotile) {
    for (const [c, r] of modified) {
      const targets: Array<[number, number]> = [
        [c, r],
        [c, r - 1],
        [c + 1, r],
        [c, r + 1],
        [c - 1, r],
      ];
      for (const [tc, tr] of targets) {
        if (tc < 0 || tr < 0 || tc >= cols || tr >= rows) continue;
        const tk = `${tc},${tr}`;
        if (next[tk] === undefined) continue;
        const mask = computeCardinalBitmask(next, tc, tr);
        next[tk] = resolveAutotileIndex(tilemap, mask, tilemap.selectedTileIndex ?? 0);
      }
    }
  }

  return next;
}

export function getTileCollisionKind(
  tilemap: TilemapProperties | undefined,
  tileIndex: number
): { kind: TileCollisionKind; damagePerSec: number } {
  if (!tilemap || tileIndex < 0) {
    return { kind: 'none', damagePerSec: 0 };
  }
  const entry = tilemap.tileTypes?.[String(tileIndex)];
  if (!entry) {
    return { kind: 'solid', damagePerSec: 0 };
  }
  return {
    kind: entry.collision ?? 'solid',
    damagePerSec: Math.max(0, Number(entry.damagePerSec ?? 20)),
  };
}
