import type {
  Collider2D,
  CollisionLayer,
  GameObjectData,
} from '../core/types';

export interface WorldColliderBox {
  kind: 'box';
  objectId: string;
  colliderId: string;
  isSensor: boolean;
  layer: CollisionLayer;
  mask?: CollisionLayer[];
  left: number;
  right: number;
  top: number;
  bottom: number;
  cx: number;
  cy: number;
}

export interface WorldColliderCircle {
  kind: 'circle';
  objectId: string;
  colliderId: string;
  isSensor: boolean;
  layer: CollisionLayer;
  mask?: CollisionLayer[];
  cx: number;
  cy: number;
  radius: number;
  left: number;
  right: number;
  top: number;
  bottom: number;
}

export type WorldCollider = WorldColliderBox | WorldColliderCircle;

const DEFAULT_LAYER_MATRIX: Record<CollisionLayer, CollisionLayer[]> = {
  Default: ['Default', 'Player', 'Enemy', 'World', 'Ground', 'Projectile', 'Collectible', 'Sensor'],
  Player: ['Default', 'Enemy', 'World', 'Ground', 'Projectile', 'Collectible', 'Sensor'],
  Enemy: ['Default', 'Player', 'World', 'Ground', 'Projectile', 'Sensor'],
  World: ['Default', 'Player', 'Enemy', 'Projectile'],
  Ground: ['Default', 'Player', 'Enemy', 'Projectile'],
  Projectile: ['Default', 'Player', 'Enemy', 'World', 'Ground', 'Sensor'],
  Collectible: ['Default', 'Player'],
  Sensor: ['Default', 'Player', 'Enemy', 'Projectile'],
  UI: [],
};

export function canLayersCollide(
  layerA: CollisionLayer,
  layerB: CollisionLayer,
  maskA?: CollisionLayer[],
  maskB?: CollisionLayer[]
): boolean {
  if (layerA === 'UI' || layerB === 'UI') return false;
  const allowA = maskA && maskA.length > 0 ? maskA.includes(layerB) : DEFAULT_LAYER_MATRIX[layerA]?.includes(layerB) ?? true;
  const allowB = maskB && maskB.length > 0 ? maskB.includes(layerA) : DEFAULT_LAYER_MATRIX[layerB]?.includes(layerA) ?? true;
  return allowA && allowB;
}

export function inferDefaultLayer(obj: GameObjectData): CollisionLayer {
  if (obj.layer) return obj.layer;
  if (
    obj.type === 'ui_button' ||
    obj.type === 'ui_panel' ||
    obj.type === 'ui_progress_bar' ||
    obj.type === 'ui_leaderboard'
  ) {
    return 'UI';
  }
  const types = new Set(obj.components.filter((c) => c.enabled).map((c) => c.type));
  if (types.has('player_platformer') || types.has('player_topdown') || types.has('click_to_move')) return 'Player';
  if (types.has('chase_player') || types.has('patrol') || types.has('waypoints')) return 'Enemy';
  if (types.has('collectible')) return 'Collectible';
  if (types.has('projectile')) return 'Projectile';
  if (types.has('solid')) return obj.type === 'tilemap' ? 'Ground' : 'World';
  return 'Default';
}

export function getObjectBoundingAABB(obj: GameObjectData): {
  left: number;
  right: number;
  top: number;
  bottom: number;
} {
  const w = Math.abs(obj.transform.width * obj.transform.scaleX);
  const h = Math.abs(obj.transform.height * obj.transform.scaleY);
  const left = obj.transform.x - w * obj.transform.anchorX;
  const top = obj.transform.y - h * obj.transform.anchorY;
  return { left, right: left + w, top, bottom: top + h };
}

/**
 * Obtiene la lista de colliders en espacio de mundo para un objeto.
 * Si el objeto no define `colliders[]` manualmente, genera automáticamente un collider AABB o Circle
 * ajustado al tamaño visual para mantener compatibilidad total.
 */
export function getWorldColliders(obj: GameObjectData): WorldCollider[] {
  const sx = Math.abs(obj.transform.scaleX);
  const sy = Math.abs(obj.transform.scaleY);
  const baseLayer = inferDefaultLayer(obj);

  if (obj.colliders && obj.colliders.length > 0) {
    const out: WorldCollider[] = [];
    for (const col of obj.colliders) {
      const cx = obj.transform.x + col.offsetX * obj.transform.scaleX;
      const cy = obj.transform.y + col.offsetY * obj.transform.scaleY;
      const layer = col.layer || baseLayer;
      if (col.shape === 'circle') {
        const r = Math.max(2, col.radius * Math.max(sx, sy));
        out.push({
          kind: 'circle',
          objectId: obj.id,
          colliderId: col.id,
          isSensor: col.isSensor,
          layer,
          mask: col.mask,
          cx,
          cy,
          radius: r,
          left: cx - r,
          right: cx + r,
          top: cy - r,
          bottom: cy + r,
        });
      } else {
        const w = Math.max(2, col.width * sx);
        const h = Math.max(2, col.height * sy);
        const left = cx - w * 0.5;
        const top = cy - h * 0.5;
        out.push({
          kind: 'box',
          objectId: obj.id,
          colliderId: col.id,
          isSensor: col.isSensor,
          layer,
          mask: col.mask,
          left,
          right: left + w,
          top,
          bottom: top + h,
          cx,
          cy,
        });
      }
    }
    return out;
  }

  // Fallback automático compatible con objetos existentes
  const w = Math.max(2, Math.abs(obj.transform.width * obj.transform.scaleX));
  const h = Math.max(2, Math.abs(obj.transform.height * obj.transform.scaleY));
  const left = obj.transform.x - w * obj.transform.anchorX;
  const top = obj.transform.y - h * obj.transform.anchorY;
  const cx = left + w * 0.5;
  const cy = top + h * 0.5;
  const isSensor = obj.components.some(
    (c) => c.enabled && (c.type === 'collectible' || c.type === 'goal_portal' || c.type === 'checkpoint')
  );

  if (obj.type === 'circle') {
    const r = Math.max(2, Math.min(w, h) * 0.5);
    return [
      {
        kind: 'circle',
        objectId: obj.id,
        colliderId: 'auto',
        isSensor,
        layer: baseLayer,
        cx,
        cy,
        radius: r,
        left: cx - r,
        right: cx + r,
        top: cy - r,
        bottom: cy + r,
      },
    ];
  }

  return [
    {
      kind: 'box',
      objectId: obj.id,
      colliderId: 'auto',
      isSensor,
      layer: baseLayer,
      left,
      right: left + w,
      top,
      bottom: top + h,
      cx,
      cy,
    },
  ];
}

export function createDefaultColliderForObject(obj: GameObjectData, isSensor = false): Collider2D {
  const w = Math.max(8, Math.round(obj.transform.width));
  const h = Math.max(8, Math.round(obj.transform.height));
  return {
    id: `col_${Math.random().toString(36).slice(2, 8)}`,
    shape: obj.type === 'circle' ? 'circle' : 'box',
    isSensor,
    offsetX: (0.5 - obj.transform.anchorX) * w,
    offsetY: (0.5 - obj.transform.anchorY) * h,
    width: w,
    height: h,
    radius: Math.round(Math.min(w, h) * 0.5),
    layer: inferDefaultLayer(obj),
  };
}

export function worldCollidersOverlap(a: WorldCollider, b: WorldCollider): boolean {
  if (!canLayersCollide(a.layer, b.layer, a.mask, b.mask)) return false;

  if (a.kind === 'box' && b.kind === 'box') {
    return a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top;
  }

  if (a.kind === 'circle' && b.kind === 'circle') {
    const dx = a.cx - b.cx;
    const dy = a.cy - b.cy;
    const rSum = a.radius + b.radius;
    return dx * dx + dy * dy < rSum * rSum;
  }

  const circle = a.kind === 'circle' ? a : (b as WorldColliderCircle);
  const box = a.kind === 'box' ? a : (b as WorldColliderBox);
  const closestX = Math.max(box.left, Math.min(circle.cx, box.right));
  const closestY = Math.max(box.top, Math.min(circle.cy, box.bottom));
  const dx = circle.cx - closestX;
  const dy = circle.cy - closestY;
  return dx * dx + dy * dy < circle.radius * circle.radius;
}

export function objectsOverlap(a: GameObjectData, b: GameObjectData): boolean {
  if (!a.visible || !b.visible) return false;
  const colsA = getWorldColliders(a);
  const colsB = getWorldColliders(b);
  for (const ca of colsA) {
    for (const cb of colsB) {
      if (worldCollidersOverlap(ca, cb)) return true;
    }
  }
  return false;
}
