import type { WaterConfig } from '../core/types';

export interface WaterSampleTarget {
  id: string;
  x: number;
  y: number;
  z: number;
  config: WaterConfig;
}

export interface WaterTrailNode {
  x: number;
  y: number;
  z: number;
  leftX: number;
  leftZ: number;
  rightX: number;
  rightZ: number;
  age: number;
}

export interface WaterTrailState {
  nodes: WaterTrailNode[];
  maxNodes: number;
  maxAge: number;
  emitTimer: number;
}

export interface WaterRippleInstance {
  active: boolean;
  x: number;
  y: number;
  z: number;
  age: number;
  maxAge: number;
  scale: number;
  opacity: number;
}

export interface WaterEntityTracker {
  wasInWater: boolean;
  wasAboveSurface: boolean;
  rippleTimer: number;
}

export interface WaterInteractionEvent {
  kind: 'splash' | 'ripple';
  waterId: string;
  entityId: string;
  x: number;
  y: number;
  z: number;
}

/**
 * Calcula la altura exacta de la ola Y en un punto del mundo (X, Z) usando la
 * misma ecuación de onda que el Vertex Shader del agua para sincronizar flotación y visuales.
 */
export function sampleWaterWaveHeightAt(
  water: WaterSampleTarget,
  worldX: number,
  worldZ: number,
  timeSec: number
): number | null {
  const hw = Math.max(2, (water.config.width || 24) * 0.5);
  const hd = Math.max(2, (water.config.depth || 24) * 0.5);
  if (Math.abs(worldX - water.x) > hw || Math.abs(worldZ - water.z) > hd) {
    return null;
  }
  const speed = water.config.waveSpeed ?? 1.8;
  const amp = water.config.waveAmplitude ?? 0.14;
  const fx = water.config.flowX ?? 0.6;
  const fz = water.config.flowZ ?? 0.2;
  const t = timeSec * speed;
  const w1 =
    Math.sin(worldX * 0.75 + t + fx * t * 0.8) *
    Math.cos(worldZ * 0.65 + fz * t * 0.8);
  const w2 = Math.sin((worldX + worldZ) * 1.4 - t * 1.3) * 0.4;
  return water.y + (w1 + w2) * amp;
}

export function createWaterTrailState(maxNodes = 26, maxAge = 2.4): WaterTrailState {
  return {
    nodes: [],
    maxNodes,
    maxAge,
    emitTimer: 0,
  };
}

/**
 * Actualiza una cinta ligera de estela (Ribbon Trail) detrás de barcos o nadadores.
 */
export function updateWaterTrailPoints(
  trail: WaterTrailState,
  x: number,
  waterY: number,
  z: number,
  forwardX: number,
  forwardZ: number,
  speed: number,
  baseHalfWidth: number,
  dt: number
): void {
  for (let i = trail.nodes.length - 1; i >= 0; i--) {
    trail.nodes[i].age += dt;
    if (trail.nodes[i].age >= trail.maxAge) {
      trail.nodes.splice(i, 1);
    }
  }

  if (speed > 0.25) {
    trail.emitTimer += dt;
    const last = trail.nodes[0];
    const movedDist = last ? Math.hypot(x - last.x, z - last.z) : 999;
    if (trail.emitTimer >= 0.06 || movedDist >= 0.45) {
      trail.emitTimer = 0;
      const len = Math.hypot(forwardX, forwardZ) || 1;
      const nx = forwardX / len;
      const nz = forwardZ / len;
      // Vector perpendicular lateral al agua
      const perpX = -nz;
      const perpZ = nx;
      const hw = Math.max(0.35, baseHalfWidth);
      trail.nodes.unshift({
        x,
        y: waterY + 0.04,
        z,
        leftX: x - perpX * hw,
        leftZ: z - perpZ * hw,
        rightX: x + perpX * hw,
        rightZ: z + perpZ * hw,
        age: 0,
      });
      if (trail.nodes.length > trail.maxNodes) {
        trail.nodes.length = trail.maxNodes;
      }
    }
  }
}

/**
 * Construye los vértices de cinta (triángulos por segmento) y opacidades para malla BufferGeometry ligera.
 */
export function buildWaterTrailRibbonBuffers(
  trail: WaterTrailState,
  outPositions: Float32Array,
  outAlphas: Float32Array
): number {
  const count = trail.nodes.length;
  if (count < 2) return 0;
  let vIdx = 0;
  for (let i = 0; i < count - 1; i++) {
    const a = trail.nodes[i];
    const b = trail.nodes[i + 1];
    const ageA = Math.min(1, a.age / trail.maxAge);
    const ageB = Math.min(1, b.age / trail.maxAge);
    const widenA = 1 + ageA * 1.85;
    const widenB = 1 + ageB * 1.85;

    const aLx = a.x + (a.leftX - a.x) * widenA;
    const aLz = a.z + (a.leftZ - a.z) * widenA;
    const aRx = a.x + (a.rightX - a.x) * widenA;
    const aRz = a.z + (a.rightZ - a.z) * widenA;

    const bLx = b.x + (b.leftX - b.x) * widenB;
    const bLz = b.z + (b.leftZ - b.z) * widenB;
    const bRx = b.x + (b.rightX - b.x) * widenB;
    const bRz = b.z + (b.rightZ - b.z) * widenB;

    const alphaA = Math.max(0, (1 - ageA) * 0.72);
    const alphaB = Math.max(0, (1 - ageB) * 0.72);

    const triPts = [
      aLx, a.y, aLz, alphaA,
      bLx, b.y, bLz, alphaB,
      aRx, a.y, aRz, alphaA,
      aRx, a.y, aRz, alphaA,
      bLx, b.y, bLz, alphaB,
      bRx, b.y, bRz, alphaB,
    ];
    for (let k = 0; k < 6; k++) {
      if (vIdx * 3 + 2 >= outPositions.length) break;
      outPositions[vIdx * 3] = triPts[k * 4];
      outPositions[vIdx * 3 + 1] = triPts[k * 4 + 1];
      outPositions[vIdx * 3 + 2] = triPts[k * 4 + 2];
      outAlphas[vIdx] = triPts[k * 4 + 3];
      vIdx++;
    }
  }
  return vIdx;
}

export function createRippleRingPool(poolSize = 24): WaterRippleInstance[] {
  const pool: WaterRippleInstance[] = [];
  for (let i = 0; i < poolSize; i++) {
    pool.push({
      active: false,
      x: 0,
      y: 0,
      z: 0,
      age: 0,
      maxAge: 1.35,
      scale: 0.1,
      opacity: 0,
    });
  }
  return pool;
}

export function spawnRippleInPool(
  pool: WaterRippleInstance[],
  x: number,
  y: number,
  z: number,
  maxAge = 1.35
): void {
  let slot = pool.find((r) => !r.active);
  if (!slot) {
    // Reutilizar el anillo más antiguo (zero GC)
    slot = pool.reduce((oldest, cur) => (cur.age > oldest.age ? cur : oldest), pool[0]);
  }
  if (!slot) return;
  slot.active = true;
  slot.x = x;
  slot.y = y + 0.04;
  slot.z = z;
  slot.age = 0;
  slot.maxAge = maxAge;
  slot.scale = 0.1;
  slot.opacity = 0.85;
}

export function stepRippleRingPool(pool: WaterRippleInstance[], dt: number): void {
  for (let i = 0; i < pool.length; i++) {
    const r = pool[i];
    if (!r.active) continue;
    r.age += dt;
    const p = r.age / Math.max(0.1, r.maxAge);
    if (p >= 1) {
      r.active = false;
      r.opacity = 0;
      continue;
    }
    // Escala de 0.1 a 3.0 y desvanecimiento suave de 0.85 a 0
    r.scale = 0.1 + p * 2.9;
    r.opacity = (1 - p) * 0.85;
  }
}

/**
 * Detecta cruce por superficie de agua y movimiento continuo (>0.1 m/s -> ondas cada 0.25 s)
 * exclusivamente para las entidades configuradas en `interactingEntities` (o fallback jugador).
 */
export function evaluateWaterEntityInteractions(
  water: WaterSampleTarget,
  entities: Array<{
    id: string;
    x: number;
    y: number;
    z: number;
    halfY: number;
    speed: number;
  }>,
  trackers: Map<string, WaterEntityTracker>,
  timeSec: number,
  dt: number
): WaterInteractionEvent[] {
  const events: WaterInteractionEvent[] = [];
  const configured = water.config.interactingEntities;
  const filterSet = configured && configured.length > 0 ? new Set(configured) : null;

  for (const ent of entities) {
    if (filterSet && !filterSet.has(ent.id)) continue;
    const waveY = sampleWaterWaveHeightAt(water, ent.x, ent.z, timeSec);
    const trackerKey = `${water.id}:${ent.id}`;
    let tr = trackers.get(trackerKey);
    if (!tr) {
      tr = { wasInWater: false, wasAboveSurface: true, rippleTimer: 0 };
      trackers.set(trackerKey, tr);
    }

    if (waveY === null) {
      tr.wasInWater = false;
      tr.wasAboveSurface = true;
      continue;
    }

    const bottomY = ent.y - ent.halfY;
    const topY = ent.y + ent.halfY;
    const isInWater = bottomY <= waveY + 0.35 && topY >= waveY - 3.5;
    const isAboveSurface = bottomY > waveY + 0.05;

    // Cruce por la superficie Y del agua -> salpicadura + onda inicial
    if ((tr.wasAboveSurface && !isAboveSurface && isInWater) || (!tr.wasInWater && isInWater)) {
      events.push({
        kind: 'splash',
        waterId: water.id,
        entityId: ent.id,
        x: ent.x,
        y: waveY,
        z: ent.z,
      });
      tr.rippleTimer = 0;
    } else if (isInWater && ent.speed > 0.1) {
      // Ondas circulares periódicas cada 0.25 s mientras se desplaza en el agua
      tr.rippleTimer += dt;
      if (tr.rippleTimer >= 0.25) {
        tr.rippleTimer = 0;
        events.push({
          kind: 'ripple',
          waterId: water.id,
          entityId: ent.id,
          x: ent.x,
          y: waveY,
          z: ent.z,
        });
      }
    }

    tr.wasInWater = isInWater;
    tr.wasAboveSurface = isAboveSurface;
  }

  return events;
}
