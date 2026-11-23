import type { CameraState, GameObjectData, Vector2 } from './types';

export const DEG_TO_RAD = Math.PI / 180;
export const RAD_TO_DEG = 180 / Math.PI;

export function degToRad(degrees: number): number {
  return degrees * DEG_TO_RAD;
}

export function radToDeg(radians: number): number {
  return radians * RAD_TO_DEG;
}

export function normalizeDegrees(degrees: number): number {
  const mod = ((degrees % 360) + 360) % 360;
  return mod > 180 ? mod - 360 : mod;
}

/**
 * Convierte coordenadas del viewport del lienzo (CSS px relativos al canvas)
 * a coordenadas internas del escenario (en píxeles del juego).
 */
export function screenToStage(screenX: number, screenY: number, camera: CameraState): Vector2 {
  const safeZoom = camera.zoom === 0 ? 1 : camera.zoom;
  return {
    x: (screenX - camera.x) / safeZoom,
    y: (screenY - camera.y) / safeZoom,
  };
}

/**
 * Convierte coordenadas internas del escenario a coordenadas del viewport del lienzo.
 */
export function stageToScreen(stageX: number, stageY: number, camera: CameraState): Vector2 {
  return {
    x: stageX * camera.zoom + camera.x,
    y: stageY * camera.zoom + camera.y,
  };
}

/**
 * Ajusta un valor al tamaño de cuadrícula si el snap está activo.
 */
export function snapValue(value: number, gridSize: number, enabled: boolean): number {
  if (!enabled || gridSize <= 0) return value;
  return Math.round(value / gridSize) * gridSize;
}

/**
 * Calcula la transformación global acumulada (posición, rotación y escala aproximada)
 * de un objeto considerando su jerarquía de contenedores padre.
 */
export function getWorldTransform(
  obj: GameObjectData,
  objectMap: Map<string, GameObjectData>
): { x: number; y: number; rotation: number; scaleX: number; scaleY: number } {
  const chain: GameObjectData[] = [];
  let current: GameObjectData | undefined = obj;
  const visited = new Set<string>();

  while (current && !visited.has(current.id)) {
    visited.add(current.id);
    chain.unshift(current);
    current = current.parentId ? objectMap.get(current.parentId) : undefined;
  }

  let x = 0;
  let y = 0;
  let rotation = 0;
  let scaleX = 1;
  let scaleY = 1;

  for (const node of chain) {
    const rad = degToRad(rotation);
    const cos = Math.cos(rad);
    const sin = Math.sin(rad);

    const lx = node.transform.x * scaleX;
    const ly = node.transform.y * scaleY;

    x += lx * cos - ly * sin;
    y += lx * sin + ly * cos;
    rotation += node.transform.rotation;
    scaleX *= node.transform.scaleX;
    scaleY *= node.transform.scaleY;
  }

  return { x, y, rotation, scaleX, scaleY };
}

/**
 * Convierte un delta en coordenadas del escenario al espacio local del padre de un objeto.
 */
export function stageDeltaToParentLocal(
  dxStage: number,
  dyStage: number,
  parentId: string | null,
  objectMap: Map<string, GameObjectData>
): Vector2 {
  if (!parentId) {
    return { x: dxStage, y: dyStage };
  }
  const parent = objectMap.get(parentId);
  if (!parent) {
    return { x: dxStage, y: dyStage };
  }
  const parentWorld = getWorldTransform(parent, objectMap);
  const rad = -degToRad(parentWorld.rotation);
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);
  const rx = dxStage * cos - dyStage * sin;
  const ry = dxStage * sin + dyStage * cos;

  const sx = Math.abs(parentWorld.scaleX) < 0.0001 ? 1 : parentWorld.scaleX;
  const sy = Math.abs(parentWorld.scaleY) < 0.0001 ? 1 : parentWorld.scaleY;
  return { x: rx / sx, y: ry / sy };
}

/**
 * Calcula las esquinas globales (en coordenadas de escenario) de la caja orientada de un objeto.
 */
export function getObjectWorldCorners(
  obj: GameObjectData,
  objectMap: Map<string, GameObjectData>
): Vector2[] {
  const world = getWorldTransform(obj, objectMap);
  const w = obj.transform.width * world.scaleX;
  const h = obj.transform.height * world.scaleY;
  const ax = obj.transform.anchorX;
  const ay = obj.transform.anchorY;

  const left = -w * ax;
  const right = w * (1 - ax);
  const top = -h * ay;
  const bottom = h * (1 - ay);

  const rad = degToRad(world.rotation);
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);

  const localCorners: Vector2[] = [
    { x: left, y: top },
    { x: right, y: top },
    { x: right, y: bottom },
    { x: left, y: bottom },
  ];

  return localCorners.map((c) => ({
    x: world.x + (c.x * cos - c.y * sin),
    y: world.y + (c.x * sin + c.y * cos),
  }));
}

/**
 * Resuelve un SpriteImagePoint nombrado ("mano", "punta_arma", "pies", etc.)
 * a coordenadas globales de escenario considerando flipX/flipY, rotación y escala.
 */
export function getSpriteImagePointWorld(
  obj: GameObjectData,
  pointName: string,
  objectMap: Map<string, GameObjectData>
): Vector2 {
  const wt = getWorldTransform(obj, objectMap);
  const pt = obj.sprite?.imagePoints?.find((p) => p.name === pointName);
  if (!pt) return { x: wt.x, y: wt.y };

  const w = obj.transform.width * wt.scaleX;
  const h = obj.transform.height * wt.scaleY;
  const nx = obj.sprite?.flipX ? 1 - pt.nx : pt.nx;
  const ny = obj.sprite?.flipY ? 1 - pt.ny : pt.ny;
  const lx = (nx - obj.transform.anchorX) * w;
  const ly = (ny - obj.transform.anchorY) * h;

  const rad = degToRad(wt.rotation);
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);
  return {
    x: wt.x + (lx * cos - ly * sin),
    y: wt.y + (lx * sin + ly * cos),
  };
}

