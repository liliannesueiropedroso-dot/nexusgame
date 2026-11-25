import type {
  CameraVolume3D,
  GameObjectData,
  MemoryBudgetLimits,
  MemoryBudgetProfile,
  OcclusionVolume3D,
  SceneData,
  WorldActivityLevel,
  WorldStreamingConfig,
} from '../core/types';
import type { ProjectAssetMeta } from '../../project/models/project';

export const DEFAULT_WORLD_STREAMING_CONFIG: WorldStreamingConfig = {
  enabled: false,
  chunkSize: 64,
  loadRadius: 140,
  unloadRadius: 210,
  farProxyRadius: 340,
  maxLoadsPerFrame: 2,
  frustumPreloadWeight: 1.35,
  velocityPreloadSec: 1.6,
  enableHlod: true,
  enableOcclusionCulling: true,
  budgetProfile: 'pc',
};

export interface WorldChunkBounds {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
  centerX: number;
  centerZ: number;
}

export interface WorldChunkRecord {
  key: string;
  cx: number;
  cz: number;
  bounds: WorldChunkBounds;
  objectIds: string[];
  colliderIds: string[];
  lightIds: string[];
  waterIds: string[];
  foliageIds: string[];
  terrainIds: string[];
  triggerIds: string[];
  audioIds: string[];
  persistentIds: string[];
  transientIds: string[];
  splineIds: string[];
  hasNavMeshCoverage: boolean;
  assetDependencies: string[];
  scriptDependencies: string[];
  neighborKeys: string[];
}

export interface ChunkManifest {
  chunkSize: number;
  chunks: Map<string, WorldChunkRecord>;
  objectToChunk: Map<string, string>;
  globalAnchorIds: string[];
  builtAt: number;
}

export interface StreamingCue {
  playerPos: { x: number; y: number; z: number };
  cameraPos?: { x: number; y: number; z: number };
  cameraForwardXZ?: { x: number; z: number };
  velocityXZ?: { x: number; z: number };
  fovDeg?: number;
}

export type StreamingPriority = 1 | 2 | 3 | 4 | 5 | 6;

export interface StreamingQueueItem {
  key: string;
  priority: StreamingPriority;
  distSq: number;
}

export interface LoadedChunkState {
  key: string;
  loadedAt: number;
  lastLoadMs: number;
  activity: WorldActivityLevel;
}

export interface ActivationPolicy {
  level: WorldActivityLevel;
  render: 'full' | 'lod' | 'proxy' | 'none';
  physics: 'full' | 'simplified' | 'sleeping' | 'none';
  ai: 'full' | 'reduced' | 'simulated' | 'saved';
  scripts: 'every_frame' | 'reduced' | 'suspended' | 'none';
  scriptStride: number;
  aiStride: number;
}

export interface HlodChunkProxy {
  chunkKey: string;
  centerX: number;
  centerY: number;
  centerZ: number;
  width: number;
  height: number;
  depth: number;
  color: string;
  memberCount: number;
  estimatedTriangles: number;
}

export interface WorldSaveState {
  destroyedIds: Set<string>;
  triggeredIds: Set<string>;
  objectTransforms: Map<string, { x: number; y: number; z?: number }>;
  updatedAt: number;
}

export interface StreamingControllerState {
  loaded: Map<string, LoadedChunkState>;
  queue: StreamingQueueItem[];
  objectActivity: Map<string, WorldActivityLevel>;
  hlodProxies: Map<string, HlodChunkProxy>;
  culledObjectIds: Set<string>;
  totalLoads: number;
  totalUnloads: number;
  lastFrameLoadMs: number;
  avgLoadMs: number;
  frameIndex: number;
}

export interface MemoryResidencyReport {
  profile: MemoryBudgetProfile;
  limits: MemoryBudgetLimits;
  usage: {
    texturesMB: number;
    modelsMB: number;
    audioMB: number;
    geometryMB: number;
    particlesMax: number;
    shadowLightsMax: number;
    physicsBodiesMax: number;
    activeEntitiesMax: number;
    scriptsMax: number;
  };
  warnings: string[];
  overBudgetCount: number;
}

export interface StreamingProfilerReport {
  loadedChunks: number;
  totalManifestChunks: number;
  queueLength: number;
  avgLoadMs: number;
  lastFrameLoadMs: number;
  activeNear: number;
  activeMedium: number;
  activeFar: number;
  unloadedCount: number;
  hlodProxyCount: number;
  culledByOcclusion: number;
  memoryWarnings: string[];
  residency: MemoryResidencyReport;
}

export function resolveStreamingConfig(
  cfg?: WorldStreamingConfig | null
): WorldStreamingConfig {
  if (!cfg) return { ...DEFAULT_WORLD_STREAMING_CONFIG };
  return {
    ...DEFAULT_WORLD_STREAMING_CONFIG,
    ...cfg,
    chunkSize: Math.max(16, cfg.chunkSize || DEFAULT_WORLD_STREAMING_CONFIG.chunkSize),
    loadRadius: Math.max(24, cfg.loadRadius || DEFAULT_WORLD_STREAMING_CONFIG.loadRadius),
    unloadRadius: Math.max(
      (cfg.loadRadius || DEFAULT_WORLD_STREAMING_CONFIG.loadRadius) + 24,
      cfg.unloadRadius || DEFAULT_WORLD_STREAMING_CONFIG.unloadRadius
    ),
    farProxyRadius: Math.max(
      (cfg.unloadRadius || DEFAULT_WORLD_STREAMING_CONFIG.unloadRadius) + 30,
      cfg.farProxyRadius || DEFAULT_WORLD_STREAMING_CONFIG.farProxyRadius
    ),
    maxLoadsPerFrame: Math.max(1, Math.min(16, cfg.maxLoadsPerFrame || 2)),
  };
}

export function worldCoordToChunkCoords(
  x: number,
  z: number,
  chunkSize: number
): { cx: number; cz: number; key: string } {
  const safeSize = Math.max(16, chunkSize);
  const cx = Math.floor(x / safeSize);
  const cz = Math.floor(z / safeSize);
  return { cx, cz, key: `${cx},${cz}` };
}

export function parseChunkKey(key: string): { cx: number; cz: number } {
  const [rawX, rawZ] = key.split(',');
  return {
    cx: Number(rawX) || 0,
    cz: Number(rawZ) || 0,
  };
}

function getObjectWorldPositionXZ(obj: GameObjectData): { x: number; y: number; z: number } {
  if (obj.transform3d) {
    return {
      x: obj.transform3d.x,
      y: obj.transform3d.y,
      z: obj.transform3d.z,
    };
  }
  return {
    x: obj.transform?.x ?? 0,
    y: 0,
    z: obj.transform?.y ?? 0,
  };
}

function collectObjectAssetDeps(obj: GameObjectData): string[] {
  const deps = new Set<string>();
  if (obj.sprite?.assetId) deps.add(obj.sprite.assetId);
  if (obj.mesh3d) {
    if (obj.mesh3d.glbAssetId) deps.add(obj.mesh3d.glbAssetId);
    if (obj.mesh3d.textureAssetId) deps.add(obj.mesh3d.textureAssetId);
    if (obj.mesh3d.normalAssetId) deps.add(obj.mesh3d.normalAssetId);
    if (obj.mesh3d.roughnessAssetId) deps.add(obj.mesh3d.roughnessAssetId);
    if (obj.mesh3d.metalnessAssetId) deps.add(obj.mesh3d.metalnessAssetId);
    if (obj.mesh3d.aoAssetId) deps.add(obj.mesh3d.aoAssetId);
    if (obj.mesh3d.emissiveAssetId) deps.add(obj.mesh3d.emissiveAssetId);
    if (obj.mesh3d.foliageConfig?.assetId) deps.add(obj.mesh3d.foliageConfig.assetId);
    if (obj.mesh3d.foliageConfig?.modelAssetId) deps.add(obj.mesh3d.foliageConfig.modelAssetId);
  }
  return Array.from(deps);
}

/**
 * WorldPartition + ChunkManifest: divide la escena espacialmente en celdas con todas sus
 * dependencias (objetos, terreno, vegetación, colisiones, navmesh, splines, agua, audio, luces, triggers).
 */
export function partitionSceneIntoChunks(
  scene: SceneData,
  config?: WorldStreamingConfig | null
): ChunkManifest {
  const cfg = resolveStreamingConfig(config ?? scene.worldStreaming);
  const chunkSize = cfg.chunkSize;
  const chunks = new Map<string, WorldChunkRecord>();
  const objectToChunk = new Map<string, string>();
  const globalAnchorIds: string[] = [];

  const ensureChunk = (cx: number, cz: number): WorldChunkRecord => {
    const key = `${cx},${cz}`;
    const existing = chunks.get(key);
    if (existing) return existing;
    const minX = cx * chunkSize;
    const minZ = cz * chunkSize;
    const neighbors: string[] = [];
    for (let dx = -1; dx <= 1; dx++) {
      for (let dz = -1; dz <= 1; dz++) {
        if (dx === 0 && dz === 0) continue;
        neighbors.push(`${cx + dx},${cz + dz}`);
      }
    }
    const rec: WorldChunkRecord = {
      key,
      cx,
      cz,
      bounds: {
        minX,
        maxX: minX + chunkSize,
        minZ,
        maxZ: minZ + chunkSize,
        centerX: minX + chunkSize * 0.5,
        centerZ: minZ + chunkSize * 0.5,
      },
      objectIds: [],
      colliderIds: [],
      lightIds: [],
      waterIds: [],
      foliageIds: [],
      terrainIds: [],
      triggerIds: [],
      audioIds: [],
      persistentIds: [],
      transientIds: [],
      splineIds: [],
      hasNavMeshCoverage: false,
      assetDependencies: [],
      scriptDependencies: [],
      neighborKeys: neighbors,
    };
    chunks.set(key, rec);
    return rec;
  };

  for (const obj of scene.objects) {
    // Objetos globales o planos gigantes son anclas globales para no desaparecer nunca
    const isGlobalPlane =
      obj.type === 'camera_3d' ||
      (obj.mesh3d?.shape === 'plane' &&
        Math.max(Math.abs(obj.transform3d?.sx ?? 1), Math.abs(obj.transform3d?.sz ?? 1)) >= chunkSize * 1.5);
    if (isGlobalPlane) {
      globalAnchorIds.push(obj.id);
    }

    const pos = getObjectWorldPositionXZ(obj);
    const parsedCoord = obj.streaming?.chunkCoord ? parseChunkKey(obj.streaming.chunkCoord) : null;
    const coord = parsedCoord ?? worldCoordToChunkCoords(pos.x, pos.z, chunkSize);
    const chunk = ensureChunk(coord.cx, coord.cz);
    chunk.objectIds.push(obj.id);
    objectToChunk.set(obj.id, chunk.key);

    if (obj.physics3d?.enabled || (obj.colliders && obj.colliders.length > 0)) {
      chunk.colliderIds.push(obj.id);
    }
    if (obj.type === 'light_3d' || obj.type === 'light_2d') {
      chunk.lightIds.push(obj.id);
    }
    if (obj.mesh3d?.shape === 'water') {
      chunk.waterIds.push(obj.id);
    }
    if (obj.mesh3d?.shape === 'grass_field' || obj.mesh3d?.foliageConfig) {
      chunk.foliageIds.push(obj.id);
    }
    if (obj.mesh3d?.shape === 'terrain') {
      chunk.terrainIds.push(obj.id);
      // Un terreno puede abarcar varios chunks: indexarlo como terreno disponible
      const td = obj.mesh3d.terrainData;
      if (td) {
        const minCx = Math.floor((pos.x - td.width * 0.5) / chunkSize);
        const maxCx = Math.floor((pos.x + td.width * 0.5) / chunkSize);
        const minCz = Math.floor((pos.z - td.depth * 0.5) / chunkSize);
        const maxCz = Math.floor((pos.z + td.depth * 0.5) / chunkSize);
        for (let tx = minCx; tx <= maxCx; tx++) {
          for (let tz = minCz; tz <= maxCz; tz++) {
            const tc = ensureChunk(tx, tz);
            if (!tc.terrainIds.includes(obj.id)) tc.terrainIds.push(obj.id);
          }
        }
      }
    }
    if (obj.physics3d?.isTrigger || obj.colliders?.some((c) => c.isSensor)) {
      chunk.triggerIds.push(obj.id);
    }
    if (obj.components.some((c) => c.type.startsWith('audio.'))) {
      chunk.audioIds.push(obj.id);
    }
    if (obj.streaming?.persistence === 'transient') {
      chunk.transientIds.push(obj.id);
    } else {
      chunk.persistentIds.push(obj.id);
    }
    for (const dep of collectObjectAssetDeps(obj)) {
      if (!chunk.assetDependencies.includes(dep)) chunk.assetDependencies.push(dep);
    }
    for (const b of obj.scriptBindings ?? []) {
      if (b.enabled && !chunk.scriptDependencies.includes(b.scriptId)) {
        chunk.scriptDependencies.push(b.scriptId);
      }
    }
  }

  // Vincular splines al chunk de sus puntos
  for (const sp of scene.splines3d ?? []) {
    for (const pt of sp.points) {
      const c = worldCoordToChunkCoords(pt.x, pt.z, chunkSize);
      const chunk = ensureChunk(c.cx, c.cz);
      if (!chunk.splineIds.includes(sp.id)) chunk.splineIds.push(sp.id);
    }
  }

  // Marcar cobertura de NavMesh
  if (scene.navMesh) {
    const nm = scene.navMesh;
    const nmMinX = nm.originX;
    const nmMaxX = nm.originX + nm.cols * nm.cellSize;
    const nmMinZ = nm.originZ;
    const nmMaxZ = nm.originZ + nm.rows * nm.cellSize;
    for (const chunk of chunks.values()) {
      const overlaps =
        chunk.bounds.maxX >= nmMinX &&
        chunk.bounds.minX <= nmMaxX &&
        chunk.bounds.maxZ >= nmMinZ &&
        chunk.bounds.minZ <= nmMaxZ;
      chunk.hasNavMeshCoverage = overlaps;
    }
  }

  return {
    chunkSize,
    chunks,
    objectToChunk,
    globalAnchorIds,
    builtAt: Date.now(),
  };
}

export function buildChunkManifest(
  scene: SceneData,
  config?: WorldStreamingConfig | null
): ChunkManifest {
  return partitionSceneIntoChunks(scene, config);
}

/**
 * ActivationManager: determina el nivel de actividad (Cerca / Medio / Lejos / Descargado)
 * para evitar simular física, IA y scripts innecesarios en entidades distantes.
 */
export function resolveActivityLevel(
  distanceMeters: number,
  config?: WorldStreamingConfig | null
): WorldActivityLevel {
  const cfg = resolveStreamingConfig(config);
  const nearLimit = cfg.loadRadius * 0.68;
  if (distanceMeters <= nearLimit) return 'near';
  if (distanceMeters <= cfg.loadRadius) return 'medium';
  if (distanceMeters <= cfg.farProxyRadius) return 'far';
  return 'unloaded';
}

export function getActivationPolicy(level: WorldActivityLevel): ActivationPolicy {
  switch (level) {
    case 'near':
      return {
        level,
        render: 'full',
        physics: 'full',
        ai: 'full',
        scripts: 'every_frame',
        scriptStride: 1,
        aiStride: 1,
      };
    case 'medium':
      return {
        level,
        render: 'lod',
        physics: 'simplified',
        ai: 'reduced',
        scripts: 'reduced',
        scriptStride: 3,
        aiStride: 3,
      };
    case 'far':
      return {
        level,
        render: 'proxy',
        physics: 'sleeping',
        ai: 'simulated',
        scripts: 'suspended',
        scriptStride: 0,
        aiStride: 12,
      };
    case 'unloaded':
    default:
      return {
        level: 'unloaded',
        render: 'none',
        physics: 'none',
        ai: 'saved',
        scripts: 'none',
        scriptStride: 0,
        aiStride: 0,
      };
  }
}

/**
 * AssetResidencyManager: presupuestos reales de memoria y entidades para PC / Móvil / Personalizado.
 */
export function getBudgetLimitsForProfile(
  profile: MemoryBudgetProfile = 'pc',
  custom?: Partial<MemoryBudgetLimits>
): MemoryBudgetLimits {
  const base: MemoryBudgetLimits =
    profile === 'mobile'
      ? {
          texturesMB: 128,
          modelsMB: 96,
          audioMB: 32,
          geometryMB: 64,
          particlesMax: 250,
          shadowLightsMax: 2,
          physicsBodiesMax: 90,
          activeEntitiesMax: 160,
          scriptsMax: 45,
        }
      : {
          texturesMB: 512,
          modelsMB: 384,
          audioMB: 128,
          geometryMB: 256,
          particlesMax: 1200,
          shadowLightsMax: 8,
          physicsBodiesMax: 450,
          activeEntitiesMax: 900,
          scriptsMax: 220,
        };
  if (profile === 'custom' && custom) {
    return { ...base, ...custom };
  }
  return base;
}

export function evaluateMemoryResidency(
  scene: SceneData,
  assets: ProjectAssetMeta[],
  streamingState?: StreamingControllerState
): MemoryResidencyReport {
  const cfg = resolveStreamingConfig(scene.worldStreaming);
  const limits = getBudgetLimitsForProfile(cfg.budgetProfile, cfg.customBudgets);

  let texturesBytes = 0;
  let modelsBytes = 0;
  let audioBytes = 0;
  for (const a of assets) {
    const k = a.kind ?? (a.format === 'glb' || a.format === 'gltf' || a.format === 'fbx' ? 'model3d' : 'image');
    if (k === 'model3d') modelsBytes += a.size || 650_000;
    else if (k === 'audio') audioBytes += a.size || 240_000;
    else texturesBytes += a.size || 180_000;
  }

  let geometryEstBytes = 0;
  let particlesMax = 0;
  let shadowLightsMax = 0;
  let physicsBodiesMax = 0;
  let activeEntitiesMax = 0;
  let scriptsMax = (scene.scriptIds ?? []).length;

  for (const obj of scene.objects) {
    const act = streamingState?.objectActivity.get(obj.id) ?? 'near';
    if (act === 'unloaded') continue;
    activeEntitiesMax += 1;
    if (obj.mesh3d?.terrainData) {
      const seg = obj.mesh3d.terrainData.segments || 32;
      geometryEstBytes += (seg + 1) * (seg + 1) * 64;
    } else if (obj.mesh3d?.foliageConfig) {
      geometryEstBytes += (obj.mesh3d.foliageConfig.instances.length || 0) * 96;
    } else if (obj.mesh3d) {
      geometryEstBytes += 32_768;
    }
    if (obj.particleEmitter) particlesMax += obj.particleEmitter.maxParticles || 80;
    if (obj.light3d?.castShadow) shadowLightsMax += 1;
    if (obj.physics3d?.enabled) physicsBodiesMax += 1;
    scriptsMax += (obj.scriptBindings ?? []).filter((b) => b.enabled).length;
  }

  const usage = {
    texturesMB: Number((texturesBytes / (1024 * 1024)).toFixed(2)),
    modelsMB: Number((modelsBytes / (1024 * 1024)).toFixed(2)),
    audioMB: Number((audioBytes / (1024 * 1024)).toFixed(2)),
    geometryMB: Number((geometryEstBytes / (1024 * 1024)).toFixed(2)),
    particlesMax,
    shadowLightsMax,
    physicsBodiesMax,
    activeEntitiesMax,
    scriptsMax,
  };

  const warnings: string[] = [];
  let overBudgetCount = 0;
  const check = (label: string, val: number, max: number, unit = '') => {
    if (max <= 0) return;
    if (val > max) {
      overBudgetCount += 1;
      warnings.push(`Presupuesto excedido en ${label}: ${val}${unit} / ${max}${unit}`);
    } else if (val >= max * 0.85) {
      warnings.push(`Presupuesto al límite en ${label}: ${val}${unit} / ${max}${unit}`);
    }
  };
  check('Texturas', usage.texturesMB, limits.texturesMB, ' MB');
  check('Modelos 3D', usage.modelsMB, limits.modelsMB, ' MB');
  check('Audio', usage.audioMB, limits.audioMB, ' MB');
  check('Geometría', usage.geometryMB, limits.geometryMB, ' MB');
  check('Partículas', usage.particlesMax, limits.particlesMax);
  check('Luces con sombra', usage.shadowLightsMax, limits.shadowLightsMax);
  check('Cuerpos físicos', usage.physicsBodiesMax, limits.physicsBodiesMax);
  check('Entidades activas', usage.activeEntitiesMax, limits.activeEntitiesMax);
  check('Scripts activos', usage.scriptsMax, limits.scriptsMax);

  return {
    profile: cfg.budgetProfile,
    limits,
    usage,
    warnings,
    overBudgetCount,
  };
}

/**
 * WorldProxySystem: genera proxies agrupados (HLOD) por chunk para representar grandes
 * grupos de edificios/árboles a larga distancia como bloques simplificados/impostors.
 */
export function buildHlodProxiesForChunks(
  scene: SceneData,
  manifest: ChunkManifest
): Map<string, HlodChunkProxy> {
  const objMap = new Map(scene.objects.map((o) => [o.id, o]));
  const proxies = new Map<string, HlodChunkProxy>();

  for (const chunk of manifest.chunks.values()) {
    const members = chunk.objectIds
      .map((id) => objMap.get(id))
      .filter(
        (o): o is GameObjectData =>
          Boolean(
            o &&
              o.visible &&
              o.type === 'mesh_3d' &&
              o.mesh3d &&
              o.mesh3d.shape !== 'plane' &&
              o.mesh3d.shape !== 'terrain' &&
              o.mesh3d.shape !== 'water'
          )
      );
    if (members.length < 2) continue;

    let minX = Infinity;
    let maxX = -Infinity;
    let minY = Infinity;
    let maxY = -Infinity;
    let minZ = Infinity;
    let maxZ = -Infinity;
    let tris = 0;

    for (const m of members) {
      const t = m.transform3d ?? { x: 0, y: 0, z: 0, sx: 1, sy: 1, sz: 1 };
      const hx = Math.max(0.5, Math.abs(t.sx) * 0.5);
      const hy = Math.max(0.5, Math.abs(t.sy) * 0.5);
      const hz = Math.max(0.5, Math.abs(t.sz) * 0.5);
      minX = Math.min(minX, t.x - hx);
      maxX = Math.max(maxX, t.x + hx);
      minY = Math.min(minY, t.y - hy);
      maxY = Math.max(maxY, t.y + hy);
      minZ = Math.min(minZ, t.z - hz);
      maxZ = Math.max(maxZ, t.z + hz);
      tris += m.mesh3d?.foliageConfig ? m.mesh3d.foliageConfig.instances.length * 6 : 24;
    }

    proxies.set(chunk.key, {
      chunkKey: chunk.key,
      centerX: (minX + maxX) * 0.5,
      centerY: (minY + maxY) * 0.5,
      centerZ: (minZ + maxZ) * 0.5,
      width: Math.max(1, maxX - minX),
      height: Math.max(1, maxY - minY),
      depth: Math.max(1, maxZ - minZ),
      color: members[0].mesh3d?.color ?? '#64748b',
      memberCount: members.length,
      estimatedTriangles: tris,
    });
  }
  return proxies;
}

function rayIntersectsAabb(
  ox: number,
  oy: number,
  oz: number,
  dx: number,
  dy: number,
  dz: number,
  maxDist: number,
  b: { minX: number; maxX: number; minY: number; maxY: number; minZ: number; maxZ: number }
): boolean {
  let tMin = 0;
  let tMax = maxDist;
  const axes: Array<[number, number, number, number]> = [
    [ox, dx, b.minX, b.maxX],
    [oy, dy, b.minY, b.maxY],
    [oz, dz, b.minZ, b.maxZ],
  ];
  for (const [o, d, bMin, bMax] of axes) {
    if (Math.abs(d) < 1e-6) {
      if (o < bMin || o > bMax) return false;
    } else {
      let t1 = (bMin - o) / d;
      let t2 = (bMax - o) / d;
      if (t1 > t2) {
        const tmp = t1;
        t1 = t2;
        t2 = tmp;
      }
      tMin = Math.max(tMin, t1);
      tMax = Math.min(tMax, t2);
      if (tMin > tMax) return false;
    }
  }
  return tMax >= tMin && tMin > 0.2 && tMin < maxDist - 0.5;
}

function pointInsideAabb(
  px: number,
  py: number,
  pz: number,
  b: { minX: number; maxX: number; minY: number; maxY: number; minZ: number; maxZ: number }
): boolean {
  return (
    px >= b.minX &&
    px <= b.maxX &&
    py >= b.minY &&
    py <= b.maxY &&
    pz >= b.minZ &&
    pz <= b.maxZ
  );
}

/**
 * Occlusion Culling por volúmenes oclusores, muros grandes y sectores/portales.
 */
export function isTargetOccluded(
  cameraPos: { x: number; y: number; z: number },
  targetPos: { x: number; y: number; z: number },
  targetHalfExtents: { x: number; y: number; z: number },
  occlusionVolumes: OcclusionVolume3D[] = [],
  blockerBoxes: Array<{
    id: string;
    minX: number;
    maxX: number;
    minY: number;
    maxY: number;
    minZ: number;
    maxZ: number;
  }> = [],
  targetId?: string
): boolean {
  const dx = targetPos.x - cameraPos.x;
  const dy = targetPos.y - cameraPos.y;
  const dz = targetPos.z - cameraPos.z;
  const dist = Math.hypot(dx, dy, dz);
  if (dist < 4) return false;

  // 1. Verificar aislamiento por sectores y portales si la cámara está dentro de un sector
  const activeVolumes = occlusionVolumes.filter((v) => v.enabled);
  const sectors = activeVolumes.filter((v) => v.kind === 'sector');
  if (sectors.length > 0) {
    const camSector = sectors.find((s) =>
      pointInsideAabb(cameraPos.x, cameraPos.y, cameraPos.z, s.bounds)
    );
    const tgtSector = sectors.find((s) =>
      pointInsideAabb(targetPos.x, targetPos.y, targetPos.z, s.bounds)
    );
    if (camSector && tgtSector && camSector.id !== tgtSector.id) {
      const connected = new Set(camSector.connectedSectorIds ?? []);
      if (!connected.has(tgtSector.id)) {
        return true;
      }
    }
  }

  // 2. Verificar volúmenes oclusores y muros altos entre cámara y objetivo
  const invD = 1 / dist;
  const dirX = dx * invD;
  const dirY = dy * invD;
  const dirZ = dz * invD;
  const targetRadius = Math.max(targetHalfExtents.x, targetHalfExtents.y, targetHalfExtents.z);
  const effectiveDist = Math.max(0.1, dist - targetRadius);

  for (const vol of activeVolumes) {
    if (vol.kind !== 'occluder') continue;
    if (pointInsideAabb(cameraPos.x, cameraPos.y, cameraPos.z, vol.bounds)) continue;
    if (rayIntersectsAabb(cameraPos.x, cameraPos.y, cameraPos.z, dirX, dirY, dirZ, effectiveDist, vol.bounds)) {
      return true;
    }
  }

  for (const box of blockerBoxes) {
    if (targetId && box.id === targetId) continue;
    if (pointInsideAabb(cameraPos.x, cameraPos.y, cameraPos.z, box)) continue;
    if (rayIntersectsAabb(cameraPos.x, cameraPos.y, cameraPos.z, dirX, dirY, dirZ, effectiveDist, box)) {
      return true;
    }
  }

  return false;
}

export function createStreamingControllerState(
  scene?: SceneData,
  manifest?: ChunkManifest
): StreamingControllerState {
  const hlodProxies =
    scene && manifest ? buildHlodProxiesForChunks(scene, manifest) : new Map();
  return {
    loaded: new Map(),
    queue: [],
    objectActivity: new Map(),
    hlodProxies,
    culledObjectIds: new Set(),
    totalLoads: 0,
    totalUnloads: 0,
    lastFrameLoadMs: 0,
    avgLoadMs: 0,
    frameIndex: 0,
  };
}

/**
 * StreamingController: planifica cola por 6 niveles de prioridad usando frustum + velocidad + navmesh,
 * carga sin bloquear (respetando maxLoadsPerFrame) y descarga chunks lejanos guardando estado.
 */
export function stepStreamingController(
  state: StreamingControllerState,
  scene: SceneData,
  manifest: ChunkManifest,
  cue: StreamingCue,
  config?: WorldStreamingConfig | null,
  saveState?: WorldSaveState
): StreamingControllerState {
  const cfg = resolveStreamingConfig(config ?? scene.worldStreaming);
  state.frameIndex += 1;

  const px = cue.playerPos.x;
  const pz = cue.playerPos.z;
  const playerChunk = worldCoordToChunkCoords(px, pz, cfg.chunkSize);

  const velX = cue.velocityXZ?.x ?? 0;
  const velZ = cue.velocityXZ?.z ?? 0;
  const predX = px + velX * cfg.velocityPreloadSec;
  const predZ = pz + velZ * cfg.velocityPreloadSec;
  const predChunk = worldCoordToChunkCoords(predX, predZ, cfg.chunkSize);

  const camFwdX = cue.cameraForwardXZ?.x ?? 0;
  const camFwdZ = cue.cameraForwardXZ?.z ?? -1;
  const fwdLen = Math.hypot(camFwdX, camFwdZ) || 1;
  const fnX = camFwdX / fwdLen;
  const fnZ = camFwdZ / fwdLen;

  const queue: StreamingQueueItem[] = [];

  for (const chunk of manifest.chunks.values()) {
    const dx = chunk.bounds.centerX - px;
    const dz = chunk.bounds.centerZ - pz;
    const distSq = dx * dx + dz * dz;
    const dist = Math.sqrt(distSq);

    // Descargar si supera unloadRadius y está fuera de farProxyRadius
    if (dist > cfg.unloadRadius && state.loaded.has(chunk.key)) {
      if (saveState) {
        for (const oid of chunk.objectIds) {
          const obj = scene.objects.find((o) => o.id === oid);
          if (obj && obj.transform3d) {
            recordObjectTransform(saveState, oid, obj.transform3d.x, obj.transform3d.y, obj.transform3d.z);
          }
          if (obj && !obj.visible) {
            recordDestroyedEntity(saveState, oid);
          }
        }
      }
      state.loaded.delete(chunk.key);
      state.totalUnloads += 1;
    }

    const inFrustum =
      dist <= cfg.loadRadius * cfg.frustumPreloadWeight &&
      (dist < cfg.chunkSize || (dx / Math.max(1, dist)) * fnX + (dz / Math.max(1, dist)) * fnZ >= 0.32);

    let priority: StreamingPriority = 6;
    if (chunk.key === playerChunk.key) {
      priority = 1;
    } else if (chunk.key === predChunk.key || inFrustum) {
      priority = 2;
    } else if (chunk.hasNavMeshCoverage || chunk.splineIds.length > 0) {
      priority = 3;
    } else if (dist <= cfg.loadRadius) {
      priority = 4;
    } else if (dist <= cfg.farProxyRadius) {
      priority = 5;
    } else {
      priority = 6;
    }

    if (dist <= cfg.loadRadius && !state.loaded.has(chunk.key)) {
      queue.push({ key: chunk.key, priority, distSq });
    }
  }

  queue.sort((a, b) => a.priority - b.priority || a.distSq - b.distSq);
  state.queue = queue;

  const tStart = typeof performance !== 'undefined' ? performance.now() : Date.now();
  const budgetLoads = Math.min(cfg.maxLoadsPerFrame, queue.length);
  for (let i = 0; i < budgetLoads; i++) {
    const item = queue[i];
    const t0 = typeof performance !== 'undefined' ? performance.now() : Date.now();
    const chunk = manifest.chunks.get(item.key);
    const dist = chunk ? Math.hypot(chunk.bounds.centerX - px, chunk.bounds.centerZ - pz) : 0;
    const elapsedChunk = Math.max(
      0.01,
      (typeof performance !== 'undefined' ? performance.now() : Date.now()) - t0
    );
    state.loaded.set(item.key, {
      key: item.key,
      loadedAt: Date.now(),
      lastLoadMs: elapsedChunk,
      activity: resolveActivityLevel(dist, cfg),
    });
    state.totalLoads += 1;
  }
  state.queue = queue.slice(budgetLoads);
  const frameMs = Math.max(
    0,
    (typeof performance !== 'undefined' ? performance.now() : Date.now()) - tStart
  );
  state.lastFrameLoadMs = frameMs;
  if (budgetLoads > 0) {
    state.avgLoadMs = state.avgLoadMs === 0 ? frameMs : state.avgLoadMs * 0.8 + frameMs * 0.2;
  }

  // Actualizar nivel de actividad por objeto (N1..N4) y oclusión
  const globalSet = new Set(manifest.globalAnchorIds);
  const blockerBoxes = cfg.enableOcclusionCulling
    ? scene.objects
        .filter(
          (o) =>
            o.visible &&
            o.type === 'mesh_3d' &&
            o.mesh3d &&
            o.mesh3d.shape !== 'plane' &&
            o.mesh3d.shape !== 'terrain' &&
            o.mesh3d.shape !== 'water' &&
            o.transform3d &&
            Math.abs(o.transform3d.sy) >= 3.2 &&
            Math.max(Math.abs(o.transform3d.sx), Math.abs(o.transform3d.sz)) >= 3.5
        )
        .map((o) => {
          const t = o.transform3d!;
          const hx = Math.abs(t.sx) * 0.5;
          const hy = Math.abs(t.sy) * 0.5;
          const hz = Math.abs(t.sz) * 0.5;
          return {
            id: o.id,
            minX: t.x - hx,
            maxX: t.x + hx,
            minY: t.y - hy,
            maxY: t.y + hy,
            minZ: t.z - hz,
            maxZ: t.z + hz,
          };
        })
    : [];

  state.culledObjectIds.clear();
  const camPos = cue.cameraPos ?? cue.playerPos;

  for (const obj of scene.objects) {
    if (globalSet.has(obj.id) || obj.type === 'camera_3d') {
      state.objectActivity.set(obj.id, 'near');
      continue;
    }
    const pos = getObjectWorldPositionXZ(obj);
    const dist = Math.hypot(pos.x - px, pos.z - pz);
    let level = resolveActivityLevel(dist, cfg);
    const cKey = manifest.objectToChunk.get(obj.id);
    if (cKey && !state.loaded.has(cKey) && level !== 'far' && level !== 'unloaded') {
      level = cfg.enableHlod ? 'far' : 'unloaded';
    }
    state.objectActivity.set(obj.id, level);

    if (cKey && state.loaded.has(cKey)) {
      const lc = state.loaded.get(cKey)!;
      lc.activity = level;
    }

    if (
      cfg.enableOcclusionCulling &&
      (level === 'near' || level === 'medium') &&
      obj.type === 'mesh_3d' &&
      obj.mesh3d?.shape !== 'terrain' &&
      obj.mesh3d?.shape !== 'water' &&
      obj.mesh3d?.shape !== 'plane' &&
      obj.transform3d
    ) {
      const t = obj.transform3d;
      const occluded = isTargetOccluded(
        camPos,
        { x: t.x, y: t.y, z: t.z },
        {
          x: Math.abs(t.sx) * 0.5,
          y: Math.abs(t.sy) * 0.5,
          z: Math.abs(t.sz) * 0.5,
        },
        scene.occlusionVolumes ?? [],
        blockerBoxes,
        obj.id
      );
      if (occluded) {
        state.culledObjectIds.add(obj.id);
      }
    }
  }

  return state;
}

/**
 * WorldSaveState: persiste destruidos, activados y posiciones modificadas al descargar chunks.
 */
export function createWorldSaveState(): WorldSaveState {
  return {
    destroyedIds: new Set(),
    triggeredIds: new Set(),
    objectTransforms: new Map(),
    updatedAt: Date.now(),
  };
}

export function recordDestroyedEntity(save: WorldSaveState, id: string): void {
  save.destroyedIds.add(id);
  save.updatedAt = Date.now();
}

export function recordTriggeredEntity(save: WorldSaveState, id: string): void {
  save.triggeredIds.add(id);
  save.updatedAt = Date.now();
}

export function recordObjectTransform(
  save: WorldSaveState,
  id: string,
  x: number,
  y: number,
  z?: number
): void {
  save.objectTransforms.set(id, { x, y, z });
  save.updatedAt = Date.now();
}

export function serializeWorldSaveState(save: WorldSaveState): {
  destroyedIds: string[];
  triggeredIds: string[];
  objectTransforms: Record<string, { x: number; y: number; z?: number }>;
} {
  const transforms: Record<string, { x: number; y: number; z?: number }> = {};
  save.objectTransforms.forEach((v, k) => {
    transforms[k] = { ...v };
  });
  return {
    destroyedIds: Array.from(save.destroyedIds),
    triggeredIds: Array.from(save.triggeredIds),
    objectTransforms: transforms,
  };
}

export function applyWorldSaveStateToScene(
  scene: SceneData,
  save: WorldSaveState
): SceneData {
  return {
    ...scene,
    objects: scene.objects.map((o) => {
      const next = { ...o };
      if (save.destroyedIds.has(o.id)) {
        next.visible = false;
      }
      const savedT = save.objectTransforms.get(o.id);
      if (savedT) {
        if (next.transform3d && savedT.z !== undefined) {
          next.transform3d = {
            ...next.transform3d,
            x: savedT.x,
            y: savedT.y,
            z: savedT.z,
          };
        } else {
          next.transform = {
            ...next.transform,
            x: savedT.x,
            y: savedT.y,
          };
        }
      }
      return next;
    }),
  };
}

/**
 * StreamingProfiler: genera métricas en tiempo real para el editor/diagnóstico.
 */
export function buildStreamingProfilerReport(
  scene: SceneData,
  assets: ProjectAssetMeta[],
  manifest: ChunkManifest,
  state: StreamingControllerState
): StreamingProfilerReport {
  let activeNear = 0;
  let activeMedium = 0;
  let activeFar = 0;
  let unloadedCount = 0;
  for (const level of state.objectActivity.values()) {
    if (level === 'near') activeNear += 1;
    else if (level === 'medium') activeMedium += 1;
    else if (level === 'far') activeFar += 1;
    else unloadedCount += 1;
  }
  const residency = evaluateMemoryResidency(scene, assets, state);
  return {
    loadedChunks: state.loaded.size,
    totalManifestChunks: manifest.chunks.size,
    queueLength: state.queue.length,
    avgLoadMs: Number(state.avgLoadMs.toFixed(2)),
    lastFrameLoadMs: Number(state.lastFrameLoadMs.toFixed(2)),
    activeNear,
    activeMedium,
    activeFar,
    unloadedCount,
    hlodProxyCount: state.hlodProxies.size,
    culledByOcclusion: state.culledObjectIds.size,
    memoryWarnings: residency.warnings,
    residency,
  };
}

export function findMatchingCameraVolume(
  volumes: CameraVolume3D[] | undefined,
  pos: { x: number; y: number; z: number }
): CameraVolume3D | null {
  if (!volumes || volumes.length === 0) return null;
  let best: CameraVolume3D | null = null;
  for (const v of volumes) {
    if (!v.enabled) continue;
    if (pointInsideAabb(pos.x, pos.y, pos.z, v.bounds)) {
      if (!best || v.priority > best.priority) {
        best = v;
      }
    }
  }
  return best;
}
