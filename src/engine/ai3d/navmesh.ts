/**
 * Sistema de Navegación Espacial IA (NavMesh en 1 clic + Pathfinding A* + Evasión local).
 * Escanea la geometría estática de la escena 3D, construye la malla transitable según
 * pendiente máxima y altura de paso, y calcula rutas óptimas evitando obstáculos.
 */

import type { GameObjectData, NavMeshData, NavMeshObjectRole, SceneData } from '../core/types';
import { sampleTerrainHeightAt } from '../three3d/terrainSystem';

export interface BuildNavMeshOptions {
  cellSize?: number;
  maxSlopeDeg?: number;
  agentRadius?: number;
  boundsHalfSize?: number;
}

export interface NavMeshPoint3D {
  x: number;
  y: number;
  z: number;
}

interface StaticNavItem {
  obj: GameObjectData;
  role: NavMeshObjectRole;
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
  minZ: number;
  maxZ: number;
  isGround: boolean;
  isRamp: boolean;
  isTerrainMesh: boolean;
}

function getBoxBounds3D(obj: GameObjectData): StaticNavItem | null {
  if (obj.type !== 'mesh_3d' || !obj.visible) return null;
  if (obj.navRole === 'ignore' || obj.mesh3d?.shape === 'water' || obj.mesh3d?.shape === 'grass_field') {
    return null;
  }

  const t = obj.transform3d ?? { x: 0, y: 0, z: 0, rx: 0, ry: 0, rz: 0, sx: 1, sy: 1, sz: 1 };
  const isTerrainMesh = obj.mesh3d?.shape === 'terrain' && Boolean(obj.mesh3d?.terrainData);
  const td = obj.mesh3d?.terrainData;
  const hx = isTerrainMesh && td ? (td.width * Math.abs(t.sx || 1)) * 0.5 : Math.abs(t.sx) * 0.5;
  const hy = isTerrainMesh && td ? Math.max(1, td.amplitude * Math.abs(t.sy || 1)) : Math.abs(t.sy) * 0.5;
  const hz = isTerrainMesh && td ? (td.depth * Math.abs(t.sz || 1)) * 0.5 : Math.abs(t.sz) * 0.5;

  const role: NavMeshObjectRole = obj.navRole ?? 'auto';
  const isGround =
    role === 'terrain'
      ? true
      : role === 'obstacle'
        ? false
        : isTerrainMesh || obj.mesh3d?.shape === 'plane' || obj.layer === 'Ground' || t.sy <= 0.8;

  return {
    obj,
    role,
    minX: t.x - hx,
    maxX: t.x + hx,
    minY: t.y - hy,
    maxY: t.y + hy,
    minZ: t.z - hz,
    maxZ: t.z + hz,
    isGround,
    isRamp: obj.mesh3d?.shape === 'ramp',
    isTerrainMesh,
  };
}

export function buildNavMeshFromScene(
  scene: SceneData,
  options: BuildNavMeshOptions = {}
): NavMeshData {
  const cellSize = Math.max(0.5, options.cellSize ?? 1.2);
  const maxSlopeDeg = Math.max(10, Math.min(75, options.maxSlopeDeg ?? 45));
  const agentRadius = Math.max(0.2, options.agentRadius ?? 0.5);

  const staticBoxes: StaticNavItem[] = [];
  let minX = -18;
  let maxX = 18;
  let minZ = -18;
  let maxZ = 18;

  for (const obj of scene.objects) {
    if (obj.type !== 'mesh_3d' || !obj.visible) continue;
    // Excluir agentes móviles dinámicos o jugador del horneado estático (salvo si el usuario marcó navRole explícito)
    const isDynamic =
      obj.physics3d?.bodyType === 'dynamic' ||
      obj.aiAgent?.enabled ||
      (obj.components ?? []).some((c) => c.enabled && c.type === 'player_3d');
    if (isDynamic && (!obj.navRole || obj.navRole === 'auto')) continue;
    const b = getBoxBounds3D(obj);
    if (!b) continue;
    staticBoxes.push(b);
    minX = Math.min(minX, b.minX);
    maxX = Math.max(maxX, b.maxX);
    minZ = Math.min(minZ, b.minZ);
    maxZ = Math.max(maxZ, b.maxZ);
  }

  const maxSpan = options.boundsHalfSize ?? 45;
  minX = Math.max(-maxSpan, Math.floor(minX));
  maxX = Math.min(maxSpan, Math.ceil(maxX));
  minZ = Math.max(-maxSpan, Math.floor(minZ));
  maxZ = Math.min(maxSpan, Math.ceil(maxZ));

  const cols = Math.max(4, Math.min(80, Math.ceil((maxX - minX) / cellSize)));
  const rows = Math.max(4, Math.min(80, Math.ceil((maxZ - minZ) / cellSize)));
  const walkable = new Array<number>(cols * rows).fill(0);
  const heights = new Array<number>(cols * rows).fill(0);

  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const wx = minX + (c + 0.5) * cellSize;
      const wz = minZ + (r + 0.5) * cellSize;
      let highestSurface: number | null = null;
      let blockedByWall = false;

      for (const b of staticBoxes) {
        const pad = b.isGround ? 0 : agentRadius * 0.45;
        const insideFootprint =
          wx >= b.minX - pad && wx <= b.maxX + pad && wz >= b.minZ - pad && wz <= b.maxZ + pad;
        if (!insideFootprint) continue;

        if (b.role === 'obstacle') {
          blockedByWall = true;
          continue;
        }

        if (b.isTerrainMesh) {
          const th = sampleTerrainHeightAt(b.obj, wx, wz);
          if (th !== null && (highestSurface === null || th > highestSurface)) {
            highestSurface = th;
          }
          continue;
        }

        if (b.isGround || b.isRamp || b.role === 'terrain') {
          let surfY = b.maxY;
          if (b.isRamp) {
            const frac = Math.max(0, Math.min(1, (wx - b.minX) / Math.max(0.01, b.maxX - b.minX)));
            surfY = b.maxY - frac * (b.maxY - b.minY);
          }
          if (highestSurface === null || surfY > highestSurface) {
            highestSurface = surfY;
          }
        } else {
          // Bloque/pared elevada: si tiene altura sobre el suelo (> 0.65m), bloquea el paso
          const topY = b.maxY;
          const baseGround = highestSurface ?? 0;
          if (topY - baseGround > 0.65) {
            blockedByWall = true;
          } else if (highestSurface === null || topY > highestSurface) {
            highestSurface = topY;
          }
        }
      }

      const idx = r * cols + c;
      if (highestSurface !== null && !blockedByWall) {
        walkable[idx] = 1;
        heights[idx] = highestSurface;
      }
    }
  }

  // Verificar pendiente entre celdas vecinas
  const maxStepHeight = Math.tan((maxSlopeDeg * Math.PI) / 180) * cellSize + 0.35;
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const idx = r * cols + c;
      if (!walkable[idx]) continue;
      // Mantener transitable si al menos 1 vecino es válido o no hay salto imposible
      const h = heights[idx];
      let validNeighbors = 0;
      for (const [dc, dr] of [
        [1, 0],
        [-1, 0],
        [0, 1],
        [0, -1],
      ]) {
        const nc = c + dc;
        const nr = r + dr;
        if (nc >= 0 && nc < cols && nr >= 0 && nr < rows) {
          const nidx = nr * cols + nc;
          if (walkable[nidx] && Math.abs(heights[nidx] - h) <= maxStepHeight) {
            validNeighbors++;
          }
        }
      }
      if (validNeighbors === 0 && cols * rows > 16) {
        walkable[idx] = 0;
      }
    }
  }

  return {
    cellSize,
    originX: minX,
    originZ: minZ,
    cols,
    rows,
    walkable,
    heights,
    maxSlopeDeg,
    builtAt: Date.now(),
  };
}

function worldToCell(nav: NavMeshData, x: number, z: number): { c: number; r: number } {
  const c = Math.max(0, Math.min(nav.cols - 1, Math.floor((x - nav.originX) / nav.cellSize)));
  const r = Math.max(0, Math.min(nav.rows - 1, Math.floor((z - nav.originZ) / nav.cellSize)));
  return { c, r };
}

function cellToWorld(nav: NavMeshData, c: number, r: number): NavMeshPoint3D {
  const idx = r * nav.cols + c;
  return {
    x: nav.originX + (c + 0.5) * nav.cellSize,
    y: nav.heights[idx] ?? 0,
    z: nav.originZ + (r + 0.5) * nav.cellSize,
  };
}

function findNearestWalkableCell(
  nav: NavMeshData,
  startC: number,
  startR: number
): { c: number; r: number } | null {
  if (nav.walkable[startR * nav.cols + startC] === 1) {
    return { c: startC, r: startR };
  }
  const maxRadius = Math.max(nav.cols, nav.rows);
  for (let rad = 1; rad <= maxRadius; rad++) {
    for (let dr = -rad; dr <= rad; dr++) {
      for (let dc = -rad; dc <= rad; dc++) {
        if (Math.abs(dr) !== rad && Math.abs(dc) !== rad) continue;
        const nc = startC + dc;
        const nr = startR + dr;
        if (nc >= 0 && nc < nav.cols && nr >= 0 && nr < nav.rows) {
          if (nav.walkable[nr * nav.cols + nc] === 1) {
            return { c: nc, r: nr };
          }
        }
      }
    }
  }
  return null;
}

/**
 * Búsqueda de ruta A* en 8 direcciones sobre `NavMeshData`.
 */
export function findNavMeshPath(
  nav: NavMeshData,
  start: { x: number; z: number },
  goal: { x: number; z: number }
): NavMeshPoint3D[] {
  const sRaw = worldToCell(nav, start.x, start.z);
  const gRaw = worldToCell(nav, goal.x, goal.z);
  const sCell = findNearestWalkableCell(nav, sRaw.c, sRaw.r);
  const gCell = findNearestWalkableCell(nav, gRaw.c, gRaw.r);
  if (!sCell || !gCell) {
    return [{ x: goal.x, y: 0, z: goal.z }];
  }

  const total = nav.cols * nav.rows;
  const gScore = new Float32Array(total).fill(Infinity);
  const fScore = new Float32Array(total).fill(Infinity);
  const cameFrom = new Int32Array(total).fill(-1);
  const closed = new Uint8Array(total);
  const inOpen = new Uint8Array(total);
  const openList: number[] = [];

  const startIdx = sCell.r * nav.cols + sCell.c;
  const goalIdx = gCell.r * nav.cols + gCell.c;

  const heuristic = (idx: number): number => {
    const c = idx % nav.cols;
    const r = Math.floor(idx / nav.cols);
    return Math.hypot(gCell.c - c, gCell.r - r);
  };

  gScore[startIdx] = 0;
  fScore[startIdx] = heuristic(startIdx);
  openList.push(startIdx);
  inOpen[startIdx] = 1;

  const maxStepHeight = Math.tan((nav.maxSlopeDeg * Math.PI) / 180) * nav.cellSize + 0.45;
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

  while (openList.length > 0) {
    let bestPos = 0;
    for (let i = 1; i < openList.length; i++) {
      if (fScore[openList[i]] < fScore[openList[bestPos]]) {
        bestPos = i;
      }
    }
    const current = openList.splice(bestPos, 1)[0];
    inOpen[current] = 0;

    if (current === goalIdx) {
      const path: NavMeshPoint3D[] = [];
      let cur = current;
      while (cur !== -1) {
        const c = cur % nav.cols;
        const r = Math.floor(cur / nav.cols);
        path.push(cellToWorld(nav, c, r));
        cur = cameFrom[cur];
      }
      path.reverse();
      if (path.length > 0) {
        path[path.length - 1] = {
          x: goal.x,
          y: nav.heights[goalIdx] ?? path[path.length - 1].y,
          z: goal.z,
        };
      }
      return path;
    }

    closed[current] = 1;
    const cc = current % nav.cols;
    const cr = Math.floor(current / nav.cols);
    const curH = nav.heights[current] ?? 0;

    for (const [dc, dr, cost] of dirs) {
      const nc = cc + dc;
      const nr = cr + dr;
      if (nc < 0 || nc >= nav.cols || nr < 0 || nr >= nav.rows) continue;
      const nIdx = nr * nav.cols + nc;
      if (closed[nIdx] || nav.walkable[nIdx] !== 1) continue;
      if (Math.abs((nav.heights[nIdx] ?? 0) - curH) > maxStepHeight) continue;
      // Evitar cortar esquinas en diagonal
      if (dc !== 0 && dr !== 0) {
        if (nav.walkable[cr * nav.cols + nc] !== 1 || nav.walkable[nr * nav.cols + cc] !== 1) {
          continue;
        }
      }

      const tentativeG = gScore[current] + cost;
      if (tentativeG < gScore[nIdx]) {
        cameFrom[nIdx] = current;
        gScore[nIdx] = tentativeG;
        fScore[nIdx] = tentativeG + heuristic(nIdx);
        if (!inOpen[nIdx]) {
          openList.push(nIdx);
          inOpen[nIdx] = 1;
        }
      }
    }
  }

  return [{ x: goal.x, y: nav.heights[goalIdx] ?? 0, z: goal.z }];
}
