import { degToRad, getObjectWorldCorners, getWorldTransform } from '../core/math';
import { buildObjectMap } from '../core/sceneGraph';
import type { EditorTool, GameObjectData, Vector2 } from '../core/types';

export type GizmoHandleType =
  | 'move-free'
  | 'move-x'
  | 'move-y'
  | 'scale-nw'
  | 'scale-n'
  | 'scale-ne'
  | 'scale-e'
  | 'scale-se'
  | 'scale-s'
  | 'scale-sw'
  | 'scale-w'
  | 'rotate';

export interface GizmoHandlePoint {
  type: GizmoHandleType;
  stageX: number;
  stageY: number;
}

/**
 * Comprueba si un punto en coordenadas del escenario cae dentro de un objeto (OBB).
 */
export function hitTestObject(
  stageX: number,
  stageY: number,
  obj: GameObjectData,
  objectMap: Map<string, GameObjectData>
): boolean {
  if (!obj.visible || obj.locked) return false;
  // Verificar que ningún ancestro esté oculto o bloqueado
  let parentId = obj.parentId;
  const visited = new Set<string>([obj.id]);
  while (parentId && !visited.has(parentId)) {
    visited.add(parentId);
    const parent = objectMap.get(parentId);
    if (!parent) break;
    if (!parent.visible || parent.locked) return false;
    parentId = parent.parentId;
  }

  const world = getWorldTransform(obj, objectMap);
  const w = Math.abs(obj.transform.width * world.scaleX);
  const h = Math.abs(obj.transform.height * world.scaleY);
  if (w < 1 || h < 1) return false;

  const dx = stageX - world.x;
  const dy = stageY - world.y;
  const rad = -degToRad(world.rotation);
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);

  const localX = dx * cos - dy * sin;
  const localY = dx * sin + dy * cos;

  const left = -w * obj.transform.anchorX;
  const right = w * (1 - obj.transform.anchorX);
  const top = -h * obj.transform.anchorY;
  const bottom = h * (1 - obj.transform.anchorY);

  return localX >= left && localX <= right && localY >= top && localY <= bottom;
}

/**
 * Encuentra el objeto más arriba (mayor orden Z / último en la lista) bajo el puntero.
 * Ignora contenedores vacíos si hay un hijo visual encima.
 */
export function pickTopObjectAt(
  stageX: number,
  stageY: number,
  objects: GameObjectData[]
): GameObjectData | null {
  const objectMap = buildObjectMap(objects);
  for (let i = objects.length - 1; i >= 0; i--) {
    const obj = objects[i];
    if (obj.type === 'container') continue;
    if (hitTestObject(stageX, stageY, obj, objectMap)) {
      return obj;
    }
  }
  for (let i = objects.length - 1; i >= 0; i--) {
    const obj = objects[i];
    if (obj.type !== 'container') continue;
    if (hitTestObject(stageX, stageY, obj, objectMap)) {
      return obj;
    }
  }
  return null;
}

/**
 * Busca un botón UI interactivo (o cualquier objeto visible) bajo el puntero en Preview.
 */
export function pickInteractiveUiAt(
  stageX: number,
  stageY: number,
  objects: GameObjectData[]
): GameObjectData | null {
  const objectMap = buildObjectMap(objects);
  for (let i = objects.length - 1; i >= 0; i--) {
    const obj = objects[i];
    if (!obj.visible || obj.type !== 'ui_button') continue;
    if (hitTestObject(stageX, stageY, obj, objectMap)) {
      return obj;
    }
  }
  return null;
}

/**
 * Calcula las posiciones en escenario de los puntos de control (gizmos)
 * para un objeto seleccionado según la herramienta activa.
 */
export function computeGizmoHandles(
  obj: GameObjectData,
  objectMap: Map<string, GameObjectData>,
  tool: EditorTool,
  zoom: number
): GizmoHandlePoint[] {
  if (obj.locked || tool === 'pan' || tool === 'tilebrush') return [];

  const world = getWorldTransform(obj, objectMap);
  const corners = getObjectWorldCorners(obj, objectMap); // NW, NE, SE, SW
  const [nw, ne, se, sw] = corners;

  const mid = (a: Vector2, b: Vector2): Vector2 => ({
    x: (a.x + b.x) / 2,
    y: (a.y + b.y) / 2,
  });

  const handles: GizmoHandlePoint[] = [];
  const invZoom = 1 / Math.max(zoom, 0.1);

  if (tool === 'select' || tool === 'scale') {
    const n = mid(nw, ne);
    const e = mid(ne, se);
    const s = mid(se, sw);
    const w = mid(sw, nw);

    handles.push(
      { type: 'scale-nw', stageX: nw.x, stageY: nw.y },
      { type: 'scale-n', stageX: n.x, stageY: n.y },
      { type: 'scale-ne', stageX: ne.x, stageY: ne.y },
      { type: 'scale-e', stageX: e.x, stageY: e.y },
      { type: 'scale-se', stageX: se.x, stageY: se.y },
      { type: 'scale-s', stageX: s.x, stageY: s.y },
      { type: 'scale-sw', stageX: sw.x, stageY: sw.y },
      { type: 'scale-w', stageX: w.x, stageY: w.y }
    );
  }

  if (tool === 'select' || tool === 'rotate') {
    const topCenter = mid(nw, ne);
    const rad = degToRad(world.rotation);
    // Vector normal hacia arriba respecto al objeto
    const upX = Math.sin(rad);
    const upY = -Math.cos(rad);
    const dist = (tool === 'rotate' ? 36 : 26) * invZoom;
    handles.push({
      type: 'rotate',
      stageX: topCenter.x + upX * dist,
      stageY: topCenter.y + upY * dist,
    });
  }

  if (tool === 'move') {
    const axisLen = 58 * invZoom;
    handles.push(
      { type: 'move-x', stageX: world.x + axisLen, stageY: world.y },
      { type: 'move-y', stageX: world.x, stageY: world.y + axisLen },
      { type: 'move-free', stageX: world.x, stageY: world.y }
    );
  }

  return handles;
}

export function hitTestGizmoHandle(
  stageX: number,
  stageY: number,
  handles: GizmoHandlePoint[],
  zoom: number
): GizmoHandlePoint | null {
  const threshold = 11 / Math.max(zoom, 0.1);
  let closest: GizmoHandlePoint | null = null;
  let bestDist = Infinity;

  for (const handle of handles) {
    const dx = stageX - handle.stageX;
    const dy = stageY - handle.stageY;
    const dist = Math.hypot(dx, dy);
    if (dist <= threshold && dist < bestDist) {
      bestDist = dist;
      closest = handle;
    }
  }
  return closest;
}

export type ColliderHandleType = 'col-move' | 'col-n' | 'col-s' | 'col-e' | 'col-w' | 'col-r';

export interface ColliderHandlePoint {
  type: ColliderHandleType;
  colliderId: string;
  stageX: number;
  stageY: number;
}

export function computeColliderHandles(
  obj: GameObjectData,
  objectMap: Map<string, GameObjectData>
): ColliderHandlePoint[] {
  const world = getWorldTransform(obj, objectMap);
  const sx = world.scaleX || 1;
  const sy = world.scaleY || 1;
  const cols = obj.colliders ?? [];

  if (cols.length === 0) {
    // Usar el contorno visual como colisionador implícito editable (se materializa al arrastrar)
    const w = Math.abs(obj.transform.width * sx);
    const h = Math.abs(obj.transform.height * sy);
    const cx = world.x + (0.5 - obj.transform.anchorX) * w;
    const cy = world.y + (0.5 - obj.transform.anchorY) * h;
    return [
      { type: 'col-move', colliderId: '__auto__', stageX: cx, stageY: cy },
      { type: 'col-n', colliderId: '__auto__', stageX: cx, stageY: cy - h / 2 },
      { type: 'col-s', colliderId: '__auto__', stageX: cx, stageY: cy + h / 2 },
      { type: 'col-e', colliderId: '__auto__', stageX: cx + w / 2, stageY: cy },
      { type: 'col-w', colliderId: '__auto__', stageX: cx - w / 2, stageY: cy },
    ];
  }

  const col = cols[0];
  const cx = world.x + (col.offsetX ?? 0) * sx;
  const cy = world.y + (col.offsetY ?? 0) * sy;
  if (col.shape === 'circle') {
    const r = Math.max(4, (col.radius ?? 24) * Math.max(Math.abs(sx), Math.abs(sy)));
    return [
      { type: 'col-move', colliderId: col.id, stageX: cx, stageY: cy },
      { type: 'col-r', colliderId: col.id, stageX: cx + r, stageY: cy },
    ];
  }

  const hw = Math.max(4, ((col.width ?? obj.transform.width) * Math.abs(sx)) / 2);
  const hh = Math.max(4, ((col.height ?? obj.transform.height) * Math.abs(sy)) / 2);
  return [
    { type: 'col-move', colliderId: col.id, stageX: cx, stageY: cy },
    { type: 'col-n', colliderId: col.id, stageX: cx, stageY: cy - hh },
    { type: 'col-s', colliderId: col.id, stageX: cx, stageY: cy + hh },
    { type: 'col-e', colliderId: col.id, stageX: cx + hw, stageY: cy },
    { type: 'col-w', colliderId: col.id, stageX: cx - hw, stageY: cy },
  ];
}

export function hitTestColliderHandle(
  stageX: number,
  stageY: number,
  handles: ColliderHandlePoint[],
  zoom: number
): ColliderHandlePoint | null {
  const threshold = 11 / Math.max(zoom, 0.1);
  let closest: ColliderHandlePoint | null = null;
  let bestDist = Infinity;
  for (const h of handles) {
    const dist = Math.hypot(stageX - h.stageX, stageY - h.stageY);
    if (dist <= threshold && dist < bestDist) {
      bestDist = dist;
      closest = h;
    }
  }
  return closest;
}

