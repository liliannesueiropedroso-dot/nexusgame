/**
 * Sistema de Cámara Inteligente estilo Cinemachine para 2D y 3D.
 * Soporta modos: fixed, smooth_follow (con look-ahead), deadzone, third_person_orbit,
 * raycast anti-paredes en 3D, límites de escenario (bounds) y transición suave entre cámaras.
 */

import type { CameraVolume3D, SmartCameraConfig } from '../core/types';

export interface SmartCameraState {
  activeCameraId: string | null;
  activeVolumeId?: string | null;
  posX: number;
  posY: number;
  posZ: number;
  lookAtX: number;
  lookAtY: number;
  lookAtZ: number;
  fov: number;
  orbitYawDeg: number;
  orbitPitchDeg: number;
  shoulderSide?: 1 | -1;
  smoothWallT?: number;
  transitionFrom?: {
    posX: number;
    posY: number;
    posZ: number;
    lookAtX: number;
    lookAtY: number;
    lookAtZ: number;
    fov: number;
  } | null;
  transitionElapsed: number;
  transitionDuration: number;
}

export interface CameraWallOccluder3D {
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
  minZ: number;
  maxZ: number;
  yawDeg?: number;
  isSmallProp?: boolean;
  cameraCollision?: 'auto' | 'always' | 'never';
  triangles?: Float32Array;
}

export interface CameraTargetPose {
  x: number;
  y: number;
  z: number;
  vx?: number;
  vy?: number;
  vz?: number;
}

const CAMERA_PROBE_RADIUS = 0.34;
const CAMERA_TRIMESH_MARGIN = 0.42;

export function createInitialSmartCameraState(
  initialCameraId: string | null = null,
  pos = { x: 0, y: 6, z: 12 }
): SmartCameraState {
  return {
    activeCameraId: initialCameraId,
    activeVolumeId: null,
    posX: pos.x,
    posY: pos.y,
    posZ: pos.z,
    lookAtX: 0,
    lookAtY: 1,
    lookAtZ: 0,
    fov: 55,
    orbitYawDeg: 0,
    orbitPitchDeg: -18,
    shoulderSide: 1,
    smoothWallT: 1,
    transitionFrom: null,
    transitionElapsed: 0,
    transitionDuration: 0,
  };
}

export function beginSmartCameraSwitch(
  state: SmartCameraState,
  targetCameraId: string,
  durationSec = 0.65
): void {
  if (state.activeCameraId === targetCameraId) return;
  const dur = Math.max(0, durationSec);
  if (dur > 0.01) {
    state.transitionFrom = {
      posX: state.posX,
      posY: state.posY,
      posZ: state.posZ,
      lookAtX: state.lookAtX,
      lookAtY: state.lookAtY,
      lookAtZ: state.lookAtZ,
      fov: state.fov,
    };
    state.transitionElapsed = 0;
    state.transitionDuration = dur;
  } else {
    state.transitionFrom = null;
    state.transitionDuration = 0;
  }
  state.activeCameraId = targetCameraId;
}

/**
 * Evalúa qué volumen de cámara 3D de mundo abierto aplica al jugador según posición y prioridad.
 */
export function evaluateActiveCameraVolumes(
  volumes: CameraVolume3D[] | undefined,
  targetPos: { x: number; y: number; z: number } | null | undefined,
  isMountedVehicle = false
): CameraVolume3D | null {
  if (!volumes || volumes.length === 0 || !targetPos) return null;
  let best: CameraVolume3D | null = null;
  for (const v of volumes) {
    if (!v.enabled) continue;
    if (v.zoneType === 'vehicle' && !isMountedVehicle) continue;
    const b = v.bounds;
    const inside =
      targetPos.x >= b.minX &&
      targetPos.x <= b.maxX &&
      targetPos.y >= b.minY &&
      targetPos.y <= b.maxY &&
      targetPos.z >= b.minZ &&
      targetPos.z <= b.maxZ;
    if (!inside) continue;
    if (!best || v.priority > best.priority) {
      best = v;
    }
  }
  return best;
}

/**
 * Aplica mezcla suave al entrar o salir de un CameraVolume3D.
 */
export function resolveCameraConfigWithVolume(
  state: SmartCameraState,
  baseConfig: SmartCameraConfig,
  volume: CameraVolume3D | null
): SmartCameraConfig {
  const nextVolId = volume?.id ?? null;
  const prevVolId = state.activeVolumeId ?? null;
  if (nextVolId !== prevVolId) {
    const blend = Math.max(0.15, volume?.blendDurationSec ?? 0.55);
    state.transitionFrom = {
      posX: state.posX,
      posY: state.posY,
      posZ: state.posZ,
      lookAtX: state.lookAtX,
      lookAtY: state.lookAtY,
      lookAtZ: state.lookAtZ,
      fov: state.fov,
    };
    state.transitionElapsed = 0;
    state.transitionDuration = blend;
    state.activeVolumeId = nextVolId;
  }
  if (!volume) return baseConfig;
  return {
    ...baseConfig,
    mode: volume.mode ?? baseConfig.mode,
    fov: volume.fov ?? baseConfig.fov,
    distance: volume.distance ?? baseConfig.distance,
    shoulderOffsetX: volume.shoulderOffsetX ?? baseConfig.shoulderOffsetX,
    shoulderOffsetY: volume.shoulderOffsetY ?? baseConfig.shoulderOffsetY,
    terrainMinClearance: volume.terrainMinClearance ?? baseConfig.terrainMinClearance,
    targetObjectId: volume.targetObjectId !== undefined ? volume.targetObjectId : baseConfig.targetObjectId,
  };
}

/**
 * Encuadre adaptativo para multijugador local en mundo abierto:
 * calcula el punto medio entre jugadores y la distancia necesaria para mantenerlos en cuadro.
 */
export function computeAdaptiveMultiplayerFraming(
  targets: CameraTargetPose[],
  minDistance = 8,
  maxDistance = 32
): { center: CameraTargetPose; recommendedDistance: number } | null {
  if (targets.length === 0) return null;
  if (targets.length === 1) {
    return { center: { ...targets[0] }, recommendedDistance: minDistance };
  }
  let sx = 0;
  let sy = 0;
  let sz = 0;
  let svx = 0;
  let svz = 0;
  for (const t of targets) {
    sx += t.x;
    sy += t.y;
    sz += t.z;
    svx += t.vx ?? 0;
    svz += t.vz ?? 0;
  }
  const n = targets.length;
  const cx = sx / n;
  const cy = sy / n;
  const cz = sz / n;
  let maxSpread = 0;
  for (const t of targets) {
    const d = Math.hypot(t.x - cx, t.y - cy, t.z - cz);
    if (d > maxSpread) maxSpread = d;
  }
  const recommendedDistance = Math.max(minDistance, Math.min(maxDistance, minDistance + maxSpread * 1.45));
  return {
    center: { x: cx, y: cy, z: cz, vx: svx / n, vz: svz / n },
    recommendedDistance,
  };
}

/**
 * Exporta pistas de cámara (frustum forward + posición + velocidad del jugador)
 * para priorización anticipada del streaming de chunks en mundo abierto.
 */
export function getCameraStreamingCues(
  state: SmartCameraState,
  target: CameraTargetPose | null
): {
  playerPos: { x: number; y: number; z: number };
  cameraPos: { x: number; y: number; z: number };
  cameraForwardXZ: { x: number; z: number };
  velocityXZ: { x: number; z: number };
  fovDeg: number;
} {
  const fwd = getCameraForwardXZ(state);
  return {
    playerPos: target
      ? { x: target.x, y: target.y, z: target.z }
      : { x: state.lookAtX, y: state.lookAtY, z: state.lookAtZ },
    cameraPos: { x: state.posX, y: state.posY, z: state.posZ },
    cameraForwardXZ: fwd,
    velocityXZ: { x: target?.vx ?? 0, z: target?.vz ?? 0 },
    fovDeg: state.fov,
  };
}

interface SegmentAabbHit {
  t: number;
  inside: boolean;
}

function raycastSegmentAabb3DDetailed(
  ox: number,
  oy: number,
  oz: number,
  dx: number,
  dy: number,
  dz: number,
  minX: number,
  maxX: number,
  minY: number,
  maxY: number,
  minZ: number,
  maxZ: number
): SegmentAabbHit | null {
  let rawTMin = -Infinity;
  let rawTMax = Infinity;
  const axes: Array<[number, number, number, number]> = [
    [ox, dx, minX, maxX],
    [oy, dy, minY, maxY],
    [oz, dz, minZ, maxZ],
  ];
  for (const [o, d, bmin, bmax] of axes) {
    if (Math.abs(d) < 1e-7) {
      if (o < bmin || o > bmax) return null;
    } else {
      let t1 = (bmin - o) / d;
      let t2 = (bmax - o) / d;
      if (t1 > t2) {
        const tmp = t1;
        t1 = t2;
        t2 = tmp;
      }
      if (t1 > rawTMin) rawTMin = t1;
      if (t2 < rawTMax) rawTMax = t2;
      if (rawTMin > rawTMax) return null;
    }
  }
  if (rawTMax < 0 || rawTMin > 1) return null;
  if (rawTMin < 0) {
    return { t: 0, inside: true };
  }
  return { t: rawTMin, inside: false };
}

/**
 * Intersección segmento-AABB en 3D para evitar que la cámara quede detrás de una pared.
 * Devuelve fracción t en [0..1] donde choca el rayo del objetivo hacia la cámara.
 */
export function raycastSegmentAabb3D(
  ox: number,
  oy: number,
  oz: number,
  dx: number,
  dy: number,
  dz: number,
  box: CameraWallOccluder3D
): number | null {
  const hit = raycastSegmentAabb3DDetailed(
    ox,
    oy,
    oz,
    dx,
    dy,
    dz,
    box.minX,
    box.maxX,
    box.minY,
    box.maxY,
    box.minZ,
    box.maxZ
  );
  return hit ? hit.t : null;
}

function raycastSegmentObb3DDetailed(
  ox: number,
  oy: number,
  oz: number,
  dx: number,
  dy: number,
  dz: number,
  box: CameraWallOccluder3D,
  inflate = 0
): SegmentAabbHit | null {
  const yaw = box.yawDeg ?? 0;
  if (Math.abs(yaw % 360) < 0.05) {
    return raycastSegmentAabb3DDetailed(
      ox,
      oy,
      oz,
      dx,
      dy,
      dz,
      box.minX - inflate,
      box.maxX + inflate,
      box.minY - inflate,
      box.maxY + inflate,
      box.minZ - inflate,
      box.maxZ + inflate
    );
  }
  const cx = (box.minX + box.maxX) * 0.5;
  const cz = (box.minZ + box.maxZ) * 0.5;
  const hx = (box.maxX - box.minX) * 0.5 + inflate;
  const hz = (box.maxZ - box.minZ) * 0.5 + inflate;
  const rad = (-yaw * Math.PI) / 180;
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);

  const rx0 = ox - cx;
  const rz0 = oz - cz;
  const lox = rx0 * cos - rz0 * sin;
  const loz = rx0 * sin + rz0 * cos;
  const ldx = dx * cos - dz * sin;
  const ldz = dx * sin + dz * cos;

  return raycastSegmentAabb3DDetailed(
    lox,
    oy,
    loz,
    ldx,
    dy,
    ldz,
    -hx,
    hx,
    box.minY - inflate,
    box.maxY + inflate,
    -hz,
    hz
  );
}

export function raycastSegmentObb3D(
  ox: number,
  oy: number,
  oz: number,
  dx: number,
  dy: number,
  dz: number,
  box: CameraWallOccluder3D
): number | null {
  const hit = raycastSegmentObb3DDetailed(ox, oy, oz, dx, dy, dz, box, 0);
  return hit ? hit.t : null;
}

/**
 * Intersección segmento vs malla triangular en espacio mundo (Möller–Trumbore doble cara).
 * Ideal para casas .glb/.fbx, edificios CSG, arcos y geometría hueca con interiores.
 */
export function raycastSegmentTrimesh3D(
  ox: number,
  oy: number,
  oz: number,
  dx: number,
  dy: number,
  dz: number,
  box: CameraWallOccluder3D,
  triangles: Float32Array
): number | null {
  const segHit = raycastSegmentAabb3DDetailed(
    ox,
    oy,
    oz,
    dx,
    dy,
    dz,
    box.minX - 0.1,
    box.maxX + 0.1,
    box.minY - 0.1,
    box.maxY + 0.1,
    box.minZ - 0.1,
    box.maxZ + 0.1
  );
  if (!segHit) return null;

  let closestT: number | null = null;
  for (let i = 0; i + 8 < triangles.length; i += 9) {
    const ax = triangles[i];
    const ay = triangles[i + 1];
    const az = triangles[i + 2];
    const bx = triangles[i + 3];
    const by = triangles[i + 4];
    const bz = triangles[i + 5];
    const cx = triangles[i + 6];
    const cy = triangles[i + 7];
    const cz = triangles[i + 8];

    const e1x = bx - ax;
    const e1y = by - ay;
    const e1z = bz - az;
    const e2x = cx - ax;
    const e2y = cy - ay;
    const e2z = cz - az;

    // px = d x e2
    const px = dy * e2z - dz * e2y;
    const py = dz * e2x - dx * e2z;
    const pz = dx * e2y - dy * e2x;

    const det = e1x * px + e1y * py + e1z * pz;
    if (det > -1e-7 && det < 1e-7) continue;
    const invDet = 1 / det;

    const tx = ox - ax;
    const ty = oy - ay;
    const tz = oz - az;
    const u = (tx * px + ty * py + tz * pz) * invDet;
    if (u < -0.001 || u > 1.001) continue;

    // q = t x e1
    const qx = ty * e1z - tz * e1y;
    const qy = tz * e1x - tx * e1z;
    const qz = tx * e1y - ty * e1x;
    const v = (dx * qx + dy * qy + dz * qz) * invDet;
    if (v < -0.001 || u + v > 1.001) continue;

    const t = (e2x * qx + e2y * qy + e2z * qz) * invDet;
    if (t >= 0.002 && t <= 1 && (closestT === null || t < closestT)) {
      closestT = t;
    }
  }
  return closestT;
}

function isLargeHollowShell(box: CameraWallOccluder3D): boolean {
  const bw = box.maxX - box.minX;
  const bh = box.maxY - box.minY;
  const bd = box.maxZ - box.minZ;
  return Math.min(bw, bd) >= 8 && bh >= 5;
}

function shouldCheckOccluder(box: CameraWallOccluder3D): boolean {
  if (box.cameraCollision === 'never') return false;
  if (box.cameraCollision === 'always') return true;
  if (box.isSmallProp) return false;
  if (box.triangles && box.triangles.length >= 9) return true;
  const bw = box.maxX - box.minX;
  const bh = box.maxY - box.minY;
  const bd = box.maxZ - box.minZ;
  const maxHoriz = Math.max(bw, bd);
  if (bh < 1.35 || (bw < 0.75 && bd < 0.75 && bh < 2.2) || maxHoriz < 0.85) {
    return false;
  }
  return true;
}

/**
 * Devuelve la fracción máxima segura [0..1] a lo largo del segmento (origin -> origin+dir)
 * garantizando que el frustum/esfera de cámara no traspase ningún muro (OBB o Trimesh).
 */
function findSafeCameraRayFraction(
  rayOx: number,
  rayOy: number,
  rayOz: number,
  rayDx: number,
  rayDy: number,
  rayDz: number,
  occluders: CameraWallOccluder3D[],
  useWhiskers: boolean
): number {
  const rayLen = Math.hypot(rayDx, rayDy, rayDz);
  if (rayLen < 0.02) return 1;

  let safeT = 1;
  const horizLen = Math.hypot(rayDx, rayDz) || 1;
  const perpX = -rayDz / horizLen;
  const perpZ = rayDx / horizLen;
  const whiskerOffsets: Array<[number, number, number]> = useWhiskers
    ? [
        [0, 0, 0],
        [perpX * 0.28, 0, perpZ * 0.28],
        [-perpX * 0.28, 0, -perpZ * 0.28],
        [0, 0.22, 0],
        [0, -0.16, 0],
      ]
    : [[0, 0, 0]];

  for (const box of occluders) {
    if (!shouldCheckOccluder(box)) continue;

    // 1) Malla triangular exacta (casas GLB, arcos, escaleras, CSG): soporta interiores y huecos reales
    if (box.triangles && box.triangles.length >= 9) {
      let bestTriT = 1;
      for (const [wx, wy, wz] of whiskerOffsets) {
        const hitT = raycastSegmentTrimesh3D(
          rayOx + wx,
          rayOy + wy,
          rayOz + wz,
          rayDx,
          rayDy,
          rayDz,
          box,
          box.triangles
        );
        if (hitT !== null && hitT < bestTriT) {
          bestTriT = hitT;
        }
      }
      if (bestTriT < 1) {
        const marginT = Math.min(0.32, CAMERA_TRIMESH_MARGIN / rayLen);
        const clamped = Math.max(0.06, bestTriT - marginT);
        if (clamped < safeT) safeT = clamped;
      }
      continue;
    }

    // 2) Caja / OBB sólida (muros, pilares, bloques):
    // Verificar primero el rayo central exacto para distinguir interior de habitación vs choque frontal
    const exactCenter = raycastSegmentObb3DDetailed(
      rayOx,
      rayOy,
      rayOz,
      rayDx,
      rayDy,
      rayDz,
      box,
      0
    );

    if (exactCenter?.inside && box.cameraCollision !== 'always' && isLargeHollowShell(box)) {
      // Compatibilidad con cajas gigantes usadas como cuarto hueco sin CSG/Trimesh
      continue;
    }

    // Comprobar OBB inflado con radio de cámara (SpringArm sphere-cast): evita clipping en ángulos rasantes
    const inflatedCenter = raycastSegmentObb3DDetailed(
      rayOx,
      rayOy,
      rayOz,
      rayDx,
      rayDy,
      rayDz,
      box,
      CAMERA_PROBE_RADIUS
    );

    if (inflatedCenter && !inflatedCenter.inside) {
      if (inflatedCenter.t < safeT) {
        safeT = Math.max(0.06, inflatedCenter.t);
      }
    } else if (exactCenter) {
      if (!exactCenter.inside) {
        // El origen está a < 0.34m de la pared pero fuera de ella: respetar el impacto exacto con margen
        const marginT = Math.min(0.35, 0.24 / rayLen);
        const clamped = Math.max(0.05, exactCenter.t - marginT);
        if (clamped < safeT) safeT = clamped;
      } else if (box.cameraCollision === 'always') {
        // Muro marcado explícitamente como "Siempre bloquear": si el punto de partida toca la pared, acercar al objetivo
        const endInside = raycastSegmentObb3DDetailed(
          rayOx + rayDx,
          rayOy + rayDy,
          rayOz + rayDz,
          -rayDx,
          -rayDy,
          -rayDz,
          box,
          0
        );
        if (endInside) {
          safeT = Math.min(safeT, 0.08);
        }
      }
    }

    // Barrido de bigotes adicionales contra OBB con pequeño margen para esquinas
    if (useWhiskers) {
      for (let wi = 1; wi < whiskerOffsets.length; wi++) {
        const [wx, wy, wz] = whiskerOffsets[wi];
        const wHit = raycastSegmentObb3DDetailed(
          rayOx + wx,
          rayOy + wy,
          rayOz + wz,
          rayDx,
          rayDy,
          rayDz,
          box,
          0.14
        );
        if (wHit && !wHit.inside && wHit.t < safeT) {
          safeT = Math.max(0.06, wHit.t);
        }
      }
    }
  }

  return safeT;
}

function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v));
}

function smoothstep(t: number): number {
  const c = clamp(t, 0, 1);
  return c * c * (3 - 2 * c);
}

export function getCameraForwardXZ(state: SmartCameraState): { x: number; z: number } {
  const dx = state.lookAtX - state.posX;
  const dz = state.lookAtZ - state.posZ;
  const len = Math.hypot(dx, dz);
  if (len > 0.05) {
    return { x: dx / len, z: dz / len };
  }
  const yawRad = (state.orbitYawDeg * Math.PI) / 180;
  return { x: -Math.sin(yawRad), z: -Math.cos(yawRad) };
}

export function getCameraRightXZ(state: SmartCameraState): { x: number; z: number } {
  const fwd = getCameraForwardXZ(state);
  // Derecha perpendicular en mano derecha (+Y arriba): cross(fwd, +Y) = (-fwd.z, fwd.x)
  return { x: -fwd.z, z: fwd.x };
}

/**
 * Avanza un paso la cámara inteligente 3D.
 */
export function stepSmartCamera3D(
  state: SmartCameraState,
  config: SmartCameraConfig,
  cameraOwnPos: { x: number; y: number; z: number },
  target: CameraTargetPose | null,
  occluders: CameraWallOccluder3D[],
  dt: number,
  sampleFloorY?: (x: number, z: number) => number
): void {
  const safeDt = Math.min(0.05, Math.max(0.001, dt));
  const lerpAlpha = 1 - Math.pow(1 - clamp(config.dampingFactor || 0.12, 0.02, 0.99), safeDt * 60);

  let desiredPosX = cameraOwnPos.x;
  let desiredPosY = cameraOwnPos.y;
  let desiredPosZ = cameraOwnPos.z;
  let desiredLookX = target?.x ?? 0;
  let desiredLookY = (target?.y ?? 1) + 0.8;
  let desiredLookZ = target?.z ?? 0;

  // Punto seguro centrado en el jugador (no desplazado por hombro/lookAhead dentro de muros)
  const safeAnchorX = target?.x ?? desiredLookX;
  const safeAnchorY = (target?.y ?? 1) + 0.95;
  const safeAnchorZ = target?.z ?? desiredLookZ;

  if (state.shoulderSide === undefined) {
    state.shoulderSide = config.shoulderSide ?? 1;
  }
  const effectiveShoulderSide = state.shoulderSide ?? config.shoulderSide ?? 1;
  const shoulderX = (config.shoulderOffsetX ?? 0) * effectiveShoulderSide;
  const shoulderY = config.shoulderOffsetY ?? 0;
  const horizSpeed = target ? Math.hypot(target.vx ?? 0, target.vz ?? 0) : 0;

  if (config.mode === 'fixed' || !target) {
    desiredPosX = cameraOwnPos.x;
    desiredPosY = cameraOwnPos.y;
    desiredPosZ = cameraOwnPos.z;
    if (!target) {
      desiredLookX = cameraOwnPos.x;
      desiredLookY = Math.max(0, cameraOwnPos.y - 2);
      desiredLookZ = cameraOwnPos.z - 8;
    }
  } else if (config.mode === 'first_person') {
    const yawRad = (state.orbitYawDeg * Math.PI) / 180;
    const clampedPitch = clamp(state.orbitPitchDeg, -75, 75);
    state.orbitPitchDeg = clampedPitch;
    const pitchRad = (clampedPitch * Math.PI) / 180;
    const eyeY = target.y + (shoulderY !== 0 ? shoulderY : 0.65);
    desiredPosX = target.x;
    desiredPosY = eyeY;
    desiredPosZ = target.z;
    const cosP = Math.cos(pitchRad);
    desiredLookX = desiredPosX - Math.sin(yawRad) * cosP * 8;
    desiredLookY = desiredPosY + Math.sin(pitchRad) * 8;
    desiredLookZ = desiredPosZ - Math.cos(yawRad) * cosP * 8;
  } else if (config.mode === 'top_down') {
    const height = Math.max(8, config.distance || 16);
    const aheadX = (target.vx ?? 0) * config.lookAhead * 0.2;
    const aheadZ = (target.vz ?? 0) * config.lookAhead * 0.2;
    desiredLookX = target.x + aheadX;
    desiredLookY = target.y + 0.4;
    desiredLookZ = target.z + aheadZ;
    desiredPosX = desiredLookX + (config.offsetX ?? 0);
    desiredPosY = target.y + height;
    desiredPosZ = desiredLookZ + (Math.abs(config.offsetZ) > 0.5 ? config.offsetZ : 5.5);
  } else if (config.mode === 'third_person_orbit') {
    const yawRad = (state.orbitYawDeg * Math.PI) / 180;
    const clampedPitch = clamp(state.orbitPitchDeg, config.pitchMinDeg, config.pitchMaxDeg);
    state.orbitPitchDeg = clampedPitch;
    const pitchRad = (clampedPitch * Math.PI) / 180;
    const dist = Math.max(2.5, config.distance || 10);
    const horiz = Math.cos(pitchRad) * dist;
    // Vector lateral derecho de la cámara orbital para desplazamiento de hombro (OTS)
    const rightX = Math.cos(yawRad);
    const rightZ = -Math.sin(yawRad);
    desiredLookX = target.x + (target.vx ?? 0) * config.lookAhead * 0.15 + rightX * shoulderX;
    desiredLookY = target.y + 1.1 + shoulderY;
    desiredLookZ = target.z + (target.vz ?? 0) * config.lookAhead * 0.15 + rightZ * shoulderX;
    desiredPosX = desiredLookX + Math.sin(yawRad) * horiz;
    desiredPosY = desiredLookY - Math.sin(pitchRad) * dist;
    desiredPosZ = desiredLookZ + Math.cos(yawRad) * horiz;
  } else if (config.mode === 'deadzone') {
    const dx = target.x - state.lookAtX;
    const dz = target.z - state.lookAtZ;
    const halfW = Math.max(0.2, config.deadzoneW * 0.5);
    const halfH = Math.max(0.2, config.deadzoneH * 0.5);
    const shiftX = Math.abs(dx) > halfW ? dx - Math.sign(dx) * halfW : 0;
    const shiftZ = Math.abs(dz) > halfH ? dz - Math.sign(dz) * halfH : 0;
    desiredLookX = state.lookAtX + shiftX + shoulderX;
    desiredLookY = target.y + 0.8 + shoulderY;
    desiredLookZ = state.lookAtZ + shiftZ;
    desiredPosX = desiredLookX + config.offsetX;
    desiredPosY = desiredLookY + config.offsetY;
    desiredPosZ = desiredLookZ + config.offsetZ;
  } else {
    // smooth_follow
    const aheadX = (target.vx ?? 0) * config.lookAhead * 0.25;
    const aheadZ = (target.vz ?? 0) * config.lookAhead * 0.25;
    desiredLookX = target.x + aheadX + shoulderX;
    desiredLookY = target.y + 0.8 + shoulderY;
    desiredLookZ = target.z + aheadZ;
    desiredPosX = desiredLookX + config.offsetX;
    desiredPosY = desiredLookY + config.offsetY;
    desiredPosZ = desiredLookZ + config.offsetZ;
  }

  const checkWallCollision =
    config.collideWithWalls &&
    target &&
    occluders.length > 0 &&
    config.mode !== 'fixed' &&
    config.mode !== 'first_person';

  // Colisión inteligente de cámara estilo SpringArm:
  // 1) Evita que lookAt (hombro/lookAhead) atraviese muros desde el centro seguro del jugador
  // 2) Trazado con esfera/radio contra OBB inflado y triángulos exactos, con acercamiento instantáneo
  if (checkWallCollision) {
    const lookDx = desiredLookX - safeAnchorX;
    const lookDy = desiredLookY - safeAnchorY;
    const lookDz = desiredLookZ - safeAnchorZ;
    if (Math.hypot(lookDx, lookDy, lookDz) > 0.15) {
      const lookSafeT = findSafeCameraRayFraction(
        safeAnchorX,
        safeAnchorY,
        safeAnchorZ,
        lookDx,
        lookDy,
        lookDz,
        occluders,
        false
      );
      if (lookSafeT < 1) {
        desiredLookX = safeAnchorX + lookDx * lookSafeT;
        desiredLookY = safeAnchorY + lookDy * lookSafeT;
        desiredLookZ = safeAnchorZ + lookDz * lookSafeT;
      }
    }

    const rayOx = safeAnchorX;
    const rayOy = safeAnchorY;
    const rayOz = safeAnchorZ;
    const rayDx = desiredPosX - rayOx;
    const rayDy = desiredPosY - rayOy;
    const rayDz = desiredPosZ - rayOz;
    const targetWallT = findSafeCameraRayFraction(
      rayOx,
      rayOy,
      rayOz,
      rayDx,
      rayDy,
      rayDz,
      occluders,
      true
    );

    const prevWallT = state.smoothWallT ?? 1;
    // Acercar cámara instantáneamente al encontrar pared para jamás traspasar un muro al girar rápido;
    // alejar suavemente cuando la línea de visión queda libre.
    const nextWallT =
      targetWallT <= prevWallT
        ? targetWallT
        : prevWallT + (targetWallT - prevWallT) * Math.min(1, safeDt * 7.5);
    state.smoothWallT = nextWallT;

    if (nextWallT < 0.999) {
      desiredPosX = rayOx + rayDx * nextWallT;
      desiredPosY = rayOy + rayDy * nextWallT;
      desiredPosZ = rayOz + rayDz * nextWallT;
    }
  } else {
    state.smoothWallT = 1;
  }

  const floorMinClearance =
    sampleFloorY &&
    (config.terrainMinClearance ?? 0) > 0 &&
    config.mode !== 'fixed' &&
    config.mode !== 'first_person'
      ? Number(config.terrainMinClearance)
      : 0;

  if (floorMinClearance > 0 && sampleFloorY) {
    const floorH = sampleFloorY(desiredPosX, desiredPosZ);
    if (Number.isFinite(floorH)) {
      desiredPosY = Math.max(desiredPosY, floorH + floorMinClearance);
    }
  }

  if (config.useBounds) {
    desiredPosX = clamp(desiredPosX, config.boundsMinX, config.boundsMaxX);
    desiredPosY = clamp(desiredPosY, config.boundsMinY, config.boundsMaxY);
    desiredPosZ = clamp(desiredPosZ, config.boundsMinZ, config.boundsMaxZ);
  }

  const targetFov = (config.fov || 55) + clamp(horizSpeed * (config.fovKick ?? 0), 0, 22);
  let nextPosX = state.posX + (desiredPosX - state.posX) * lerpAlpha;
  let nextPosY = state.posY + (desiredPosY - state.posY) * lerpAlpha;
  let nextPosZ = state.posZ + (desiredPosZ - state.posZ) * lerpAlpha;
  const nextLookX = state.lookAtX + (desiredLookX - state.lookAtX) * lerpAlpha;
  const nextLookY = state.lookAtY + (desiredLookY - state.lookAtY) * lerpAlpha;
  const nextLookZ = state.lookAtZ + (desiredLookZ - state.lookAtZ) * lerpAlpha;
  const nextFov = state.fov + (targetFov - state.fov) * lerpAlpha;

  // Hard-clamp post-lerp: evita que la interpolación corte esquinas o deje la cámara detrás de un muro
  if (checkWallCollision) {
    const pDx = nextPosX - safeAnchorX;
    const pDy = nextPosY - safeAnchorY;
    const pDz = nextPosZ - safeAnchorZ;
    const postSafeT = findSafeCameraRayFraction(
      safeAnchorX,
      safeAnchorY,
      safeAnchorZ,
      pDx,
      pDy,
      pDz,
      occluders,
      true
    );
    if (postSafeT < 1) {
      nextPosX = safeAnchorX + pDx * postSafeT;
      nextPosY = safeAnchorY + pDy * postSafeT;
      nextPosZ = safeAnchorZ + pDz * postSafeT;
    }
  }

  if (floorMinClearance > 0 && sampleFloorY) {
    const postFloorH = sampleFloorY(nextPosX, nextPosZ);
    if (Number.isFinite(postFloorH)) {
      nextPosY = Math.max(nextPosY, postFloorH + floorMinClearance);
    }
  }

  if (state.transitionFrom && state.transitionDuration > 0) {
    state.transitionElapsed += safeDt;
    const t = smoothstep(state.transitionElapsed / state.transitionDuration);
    const f = state.transitionFrom;
    state.posX = f.posX + (nextPosX - f.posX) * t;
    state.posY = f.posY + (nextPosY - f.posY) * t;
    state.posZ = f.posZ + (nextPosZ - f.posZ) * t;
    state.lookAtX = f.lookAtX + (nextLookX - f.lookAtX) * t;
    state.lookAtY = f.lookAtY + (nextLookY - f.lookAtY) * t;
    state.lookAtZ = f.lookAtZ + (nextLookZ - f.lookAtZ) * t;
    state.fov = f.fov + (nextFov - f.fov) * t;
    if (t >= 1) {
      state.transitionFrom = null;
      state.transitionDuration = 0;
    }
  } else {
    state.posX = nextPosX;
    state.posY = nextPosY;
    state.posZ = nextPosZ;
    state.lookAtX = nextLookX;
    state.lookAtY = nextLookY;
    state.lookAtZ = nextLookZ;
    state.fov = nextFov;
  }
}
