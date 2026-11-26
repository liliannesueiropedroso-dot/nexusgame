/**
 * Motor de Física y Simulación 3D real para NEXUS GAME ENGINE.
 * Incluye:
 * - Cuerpos 3D (static, dynamic, kinematic), gravedad Y, detección Box/Sphere/Rampa,
 *   restitución, fricción y flag `isGrounded`.
 * - Pares de colisión enter/stay/exit conectados a reglas CUANDO -> SI -> ENTONCES.
 * - Controlador `player_3d` (WASD/Flechas + Salto + Coyote time + rotación suave).
 * - Máquina de Estados de Animación 3D (`animStateMachine`) con evaluación de condiciones y crossFade.
 * - Agentes IA (`aiAgent`) con Pathfinding A* sobre `NavMeshData` + evasión local.
 * - Scripts JS (`NexusScriptAsset`) y SmartCamera3D integrados.
 */

import type {
  ActionDefinition,
  AnimationStateMachineConfig,
  ConditionDefinition,
  GameMechanic,
  GameObjectData,
  NavMeshData,
  SceneContextType,
  SceneData,
  SmartCameraConfig,
  Transform3D,
} from '../core/types';
import type { NexusPluginPackage, NexusScriptAsset } from '../../project/models/project';
import { compileRuntimePlugins, type CompiledRuntimePlugin } from '../../plugins/pluginSystem';
import { compareValues, evaluateNumericExpression, type VariableMap } from '../runtime/expressionEvaluator';
import {
  beginSmartCameraSwitch,
  createInitialSmartCameraState,
  evaluateActiveCameraVolumes,
  getCameraForwardXZ,
  getCameraRightXZ,
  getCameraStreamingCues,
  resolveCameraConfigWithVolume,
  stepSmartCamera3D,
  type CameraWallOccluder3D,
  type SmartCameraState,
} from '../camera/smartCamera';
import {
  buildChunkManifest,
  buildStreamingProfilerReport,
  createStreamingControllerState,
  createWorldSaveState,
  getActivationPolicy,
  stepStreamingController,
  type ActivationPolicy,
  type ChunkManifest,
  type StreamingControllerState,
  type StreamingProfilerReport,
  type WorldSaveState,
} from '../streaming/worldStreaming';
import type { ProjectAssetMeta } from '../../project/models/project';
import { buildNavMeshFromScene, findNavMeshPath, type NavMeshPoint3D } from '../ai3d/navmesh';
import {
  buildWorldTrimeshData,
  resolveBodyVsOBB3D,
  resolveBodyVsTrimesh,
  type WorldTrimeshData,
} from './trimeshCollider';
import { ParticlePool } from '../vfx/particlePool';
import {
  compileNexusScript,
  type CompiledScriptEntry,
  type NexusObjectHandle,
  type NexusScriptAPI,
} from '../scripting/scriptRuntime';
import { stepAnimationFSM } from '../runtime/animFsmEvaluator';
import { evaluateEasing, getParticlePresetDefaults } from '../runtime/behaviorRuntime';
import { getBehaviorEntry } from '../components/behaviorRegistry';
import { PersistenceStore } from '../wiring/persistenceStore';
import { EngineWiringSystem } from '../wiring/wiringEngine';
import { groundHeightAt, sampleTerrainHeightAt } from '../three3d/terrainSystem';
import { sampleSpline3D } from '../three3d/splineTerrain';
import {
  evaluateWaterEntityInteractions,
  sampleWaterWaveHeightAt,
  type WaterEntityTracker,
  type WaterInteractionEvent,
} from '../three3d/waterEffects';
import {
  applyLocalGravityZone,
  computeSaddleWorldPosition,
  createSoftBodySimulation,
  createVehicle4WState,
  shouldStepVehiclePhysics,
  stepBoatVehicle,
  stepHelicopterVehicle,
  stepHorseVehicle,
  stepPlaneVehicle,
  stepSoftBodySimulation,
  stepSpaceshipVehicle,
  stepVehicle4W,
  type SoftBodySimulationState,
  type Vehicle4WRuntimeState,
} from '../physics/softBodyPhysics';

function lerpAngleDeg(cur: number, target: number, alpha: number): number {
  const diff = ((target - cur + 540) % 360) - 180;
  return cur + diff * Math.max(0, Math.min(1, alpha));
}

export interface Sim3DObjectState {
  id: string;
  name: string;
  type: GameObjectData['type'];
  visible: boolean;
  layer: string;
  tags: string[];
  t3: Transform3D;
  vx: number;
  vy: number;
  vz: number;
  isGrounded: boolean;
  coyoteTimer: number;
  jumpBufferTimer: number;
  jumpsUsed?: number;
  dashTimer?: number;
  dashCooldownTimer?: number;
  hp: number;
  maxHp: number;
  invulnTimer: number;
  currentAnimState: string;
  activeClip: string;
  activeAnimAssetId?: string | null;
  blendDuration: number;
  animTimeScale: number;
  animLoopMode: 'LoopRepeat' | 'LoopOnce' | 'LoopPingPong';
  animProgress?: number;
  animFinished?: boolean;
  animElapsed?: number;
  _lastSeenAnimProgress?: number;
  originT3: { x: number; y: number; z: number };
  patrolPhase: number;
  waypointIndex: number;
  waypointForward: boolean;
  scriptData: Record<string, unknown>;
  navPath: NavMeshPoint3D[];
  navTimer: number;
  alertTimer?: number;
  lastKnownTarget?: { x: number; y: number; z: number } | null;
  _prevHp?: number;
  source: GameObjectData;
}

export interface Runtime3DAudioHooks {
  playSfx?: (assetIdOrPreset: string, volume?: number, spatialPos?: { x: number; y: number; z: number }) => void;
  playMusic?: (assetId: string, volume?: number) => void;
  stopMusic?: () => void;
  setBusVolume?: (bus: 'master' | 'music' | 'sfx' | 'ui', volume: number) => void;
  setBusMuted?: (bus: 'master' | 'music' | 'sfx' | 'ui', muted: boolean) => void;
}

export interface Runtime3DSceneHooks {
  loadScene?: (sceneNameOrId: string) => void;
  nextLevel?: () => void;
  restartScene?: () => void;
  uiControl?: (op: 'open' | 'close' | 'toggle', target: string) => void;
  startDialogue?: (dialogueId: string) => void;
  setLocale?: (locale: 'es' | 'en' | 'pt') => void;
  onLog?: (msg: string) => void;
}

export interface Sim3DStepInput {
  dt: number;
  heldKeys: Set<string>;
  justPressedKeys: Set<string>;
  moveAxisX?: number;
  moveAxisY?: number;
  orbitDeltaYawDeg?: number;
  orbitDeltaPitchDeg?: number;
}

function defaultTransform3D(obj: GameObjectData): Transform3D {
  return obj.transform3d
    ? { ...obj.transform3d }
    : { x: 0, y: 1, z: 0, rx: 0, ry: 0, rz: 0, sx: 1, sy: 1, sz: 1 };
}

function getHalfExtents3D(o: Sim3DObjectState): { x: number; y: number; z: number } {
  const p3 = o.source.physics3d;
  if (p3?.shape === 'sphere' && typeof p3.radius === 'number' && p3.radius > 0) {
    const r = Math.max(0.1, p3.radius);
    return { x: r, y: r, z: r };
  }
  if (p3?.halfExtents) {
    return p3.halfExtents;
  }
  return {
    x: Math.max(0.2, Math.abs(o.t3.sx) * 0.5),
    y: Math.max(0.1, Math.abs(o.t3.sy) * 0.5),
    z: Math.max(0.2, Math.abs(o.t3.sz) * 0.5),
  };
}

function getColliderWorldOffset(
  t3: Transform3D,
  offset?: { x: number; y: number; z: number }
): { x: number; y: number; z: number } {
  if (!offset || (offset.x === 0 && offset.y === 0 && offset.z === 0)) {
    return { x: 0, y: 0, z: 0 };
  }
  const rx = (t3.rx * Math.PI) / 180;
  const ry = (t3.ry * Math.PI) / 180;
  const rz = (t3.rz * Math.PI) / 180;
  if (rx === 0 && ry === 0 && rz === 0) {
    return { x: offset.x, y: offset.y, z: offset.z };
  }
  const cx = Math.cos(rx), sx = Math.sin(rx);
  const cy = Math.cos(ry), sy = Math.sin(ry);
  const cz = Math.cos(rz), sz = Math.sin(rz);
  return {
    x: cy * cz * offset.x - cy * sz * offset.y + sy * offset.z,
    y: (cx * sz + sx * sy * cz) * offset.x + (cx * cz - sx * sy * sz) * offset.y - sx * cy * offset.z,
    z: (sx * sz - cx * sy * cz) * offset.x + (sx * cz + cx * sy * sz) * offset.y + cx * cy * offset.z,
  };
}

export function createSimulation3DState(
  scene: SceneData,
  scripts: NexusScriptAsset[] = [],
  initialVars?: VariableMap,
  audioHooks?: Runtime3DAudioHooks,
  sceneHooks?: Runtime3DSceneHooks,
  plugins: NexusPluginPackage[] = []
) {
  const variables: VariableMap = new Map<string, number | boolean | string>();
  if (initialVars) {
    for (const [k, v] of initialVars.entries()) {
      variables.set(k, v);
    }
  }
  if (!variables.has('puntos')) variables.set('puntos', 0);
  if (!variables.has('salud')) variables.set('salud', 100);

  const objects: Sim3DObjectState[] = scene.objects.map((src) => {
    const t3 = defaultTransform3D(src);
    const animInitial =
      src.animStateMachine?.states.find((s) => s.id === src.animStateMachine?.initialStateId) ??
      src.animStateMachine?.states[0];
    const hpComp = (src.components ?? []).find(
      (c) => c.enabled && (c.type === 'health' || c.type === 'combat.health_system')
    );
    const maxHpInit = Math.max(
      1,
      Number(hpComp?.config.maxHealth ?? hpComp?.config.maxHp ?? 100) || 100
    );
    const curHpInit = Math.max(
      0,
      Number(hpComp?.config.currentHealth ?? hpComp?.config.currentHp ?? maxHpInit) || maxHpInit
    );
    return {
      id: src.id,
      name: src.name,
      type: src.type,
      visible: src.visible,
      layer: src.layer ?? 'Default',
      tags: [...(src.tags ?? [])],
      t3,
      vx: 0,
      vy: 0,
      vz: 0,
      isGrounded: false,
      coyoteTimer: 0,
      jumpBufferTimer: 0,
      jumpsUsed: 0,
      dashTimer: 0,
      dashCooldownTimer: 0,
      hp: curHpInit,
      maxHp: maxHpInit,
      _prevHp: curHpInit,
      invulnTimer: 0,
      currentAnimState: animInitial?.name ?? '',
      activeClip: animInitial?.clipName ?? src.mesh3d?.clipNames?.[0] ?? '',
      activeAnimAssetId: animInitial?.assetId ?? null,
      blendDuration: 0.25,
      animTimeScale: animInitial?.timeScale ?? 1,
      animLoopMode: animInitial?.loopMode ?? 'LoopRepeat',
      animProgress: 0,
      animFinished: false,
      originT3: { x: t3.x, y: t3.y, z: t3.z },
      patrolPhase: 0,
      waypointIndex: 0,
      waypointForward: true,
      scriptData: {},
      navPath: [],
      navTimer: 0,
      alertTimer: 0,
      lastKnownTarget: null,
      source: src,
    };
  });

  const mainCamObj =
    objects.find((o) => o.type === 'camera_3d' && o.source.camera3d?.isMainCamera) ??
    objects.find((o) => o.type === 'camera_3d') ??
    null;

  const cameraState: SmartCameraState = createInitialSmartCameraState(
    mainCamObj?.id ?? null,
    mainCamObj ? { x: mainCamObj.t3.x, y: mainCamObj.t3.y, z: mainCamObj.t3.z } : { x: 0, y: 7, z: 14 }
  );

  const navMesh: NavMeshData | null =
    scene.navMesh ??
    (objects.some((o) => o.source.aiAgent?.enabled)
      ? buildNavMeshFromScene(scene)
      : null);

  const logs: string[] = [];
  const pushLog = (msg: string) => {
    logs.push(msg);
    if (logs.length > 60) logs.shift();
    sceneHooks?.onLog?.(msg);
  };
  const compiledScripts = new Map<string, CompiledScriptEntry>();
  for (const sc of scripts) {
    if (sc.kind === 'script') {
      const entry = compileNexusScript(sc);
      compiledScripts.set(sc.id, entry);
      if (entry.error) {
        pushLog(`Error compilando script ${sc.name}: ${entry.error}`);
      }
    }
  }
  const compiledPlugins: CompiledRuntimePlugin[] = compileRuntimePlugins(plugins);
  const startedPluginIds = new Set<string>();

  const particlePool = new ParticlePool(900);
  const trimeshCache = new Map<string, WorldTrimeshData | null>();
  for (const o of objects) {
    if (
      o.type === 'mesh_3d' &&
      (o.source.physics3d?.shape === 'mesh_exact' ||
        o.source.mesh3d?.shape === 'arch' ||
        o.source.mesh3d?.shape === 'stairs' ||
        o.source.mesh3d?.shape === 'csg' ||
        (o.source.mesh3d?.shape === 'ramp' && Math.abs((o.t3.ry ?? 0) % 360) > 1))
    ) {
      trimeshCache.set(o.id, buildWorldTrimeshData(o.source));
    }
  }
  const softBodySims = new Map<string, SoftBodySimulationState>();
  const vehicleSims = new Map<string, Vehicle4WRuntimeState>();
  for (const o of objects) {
    if (o.source.softBody?.enabled) {
      softBodySims.set(o.id, createSoftBodySimulation(o.source.softBody, o.t3.x, o.t3.y, o.t3.z));
    }
    if (o.source.vehicle?.enabled) {
      vehicleSims.set(o.id, createVehicle4WState(o.t3.x, o.t3.y, o.t3.z, o.t3.ry, o.source.vehicle));
    }
  }
  const inWaterObjects = new Set<string>();
  let lastSplashPos = { x: 9999, y: -999, z: 9999, time: -10 };
  const waterTrackers = new Map<string, WaterEntityTracker>();
  const waterInteractionQueue: WaterInteractionEvent[] = [];
  const splineProgress = new Map<string, number>();
  const prevCollisions = new Set<string>();
  const startedScriptBindings = new Set<string>();
  const loggedScriptErrors = new Set<string>();
  const sceneScriptData = new Map<string, Record<string, unknown>>();
  const tweenStates3D = new Map<string, { elapsed: number; playing: boolean }>();
  const scriptTweens: Array<{
    targetId: string;
    elapsed: number;
    duration: number;
    from: Record<string, number>;
    to: Record<string, number>;
  }> = [];
  const mechanicTimers = new Map<string, number>();
  const queuedEvents: string[] = [];
  const activeToasts: Array<{ id: string; text: string; remaining: number }> = [];
  const dynamicWidgets: Array<{ id: string; html: string; x: number; y: number; css?: string; visible: boolean }> = [];
  const sunOverride: { intensity?: number; color?: string; timeOfDay?: number } = {};
  const sceneContext: SceneContextType = scene.sceneContext ?? 'gameplay';
  const wiringSys = new EngineWiringSystem(new PersistenceStore());
  wiringSys.setSceneContext(sceneContext);
  wiringSys.wiringLinks = [...(scene.wiringLinks ?? [])];
  for (const obj of objects) {
    wiringSys.createEntity({
      id: obj.id,
      name: obj.name,
      role: obj.source.role ?? 'generic',
      transform: { x: obj.t3.x, y: obj.t3.y, z: obj.t3.z, rotY: obj.t3.ry },
      net: {
        replicated: Boolean(obj.source.net?.replicated),
        ownerId: obj.source.net?.ownerId ?? null,
      },
    });
    for (const comp of obj.source.components ?? []) {
      wiringSys.addBehavior(obj.id, comp.type, comp.config, comp.source ?? 'manual');
    }
  }
  wiringSys.startAll();
  const behaviorTimers = new Map<string, number>();
  let cameraFollowOverride3D: string | null = null;
  let activeMountedVehicleId: string | null = null;
  let mountedActorId: string | null = null;
  let vehicleToggledThisStep = false;
  let spawnCounter = 0;
  let cameraManualLock = false;
  let cameraBlend: {
    active: boolean;
    elapsed: number;
    duration: number;
    from: { px: number; py: number; pz: number; lx: number; ly: number; lz: number; fov: number };
    to: { px: number; py: number; pz: number; lx: number; ly: number; lz: number; fov: number };
  } | null = null;
  let elapsedTime = 0;
  let started = false;
  let cameraShakeTimer = 0;
  let cameraShakeIntensity = 0;

  let streamingFrame = 0;
  let lastStreamPx = Number.NaN;
  let lastStreamPz = Number.NaN;
  let lastStreamCamX = Number.NaN;
  let lastStreamCamZ = Number.NaN;
  const descendantSeenSet = new Set<string>();
  const chunkManifest: ChunkManifest | null = scene.worldStreaming?.enabled
    ? buildChunkManifest(scene, scene.worldStreaming)
    : null;
  const streamingState: StreamingControllerState | null = chunkManifest
    ? createStreamingControllerState(scene, chunkManifest)
    : null;
  const worldSaveState: WorldSaveState | null = chunkManifest ? createWorldSaveState() : null;
  const streamingSceneView: SceneData | null = chunkManifest
    ? {
        ...scene,
        objects: objects.map((o) => ({
          ...o.source,
          get visible() {
            return o.visible;
          },
          get transform3d() {
            return o.t3;
          },
        })),
      }
    : null;
  const getObjectPolicy = (objId: string): ActivationPolicy | null => {
    if (!streamingState || !scene.worldStreaming?.enabled) return null;
    return getActivationPolicy(streamingState.objectActivity.get(objId) ?? 'near');
  };

  const logScriptError = (errorKey: string, scriptName: string, err: unknown) => {
    if (loggedScriptErrors.has(errorKey)) return;
    loggedScriptErrors.add(errorKey);
    pushLog(`Script ${scriptName}: ${err instanceof Error ? err.message : String(err)}`);
  };

  const objById = new Map<string, Sim3DObjectState>(objects.map((o) => [o.id, o]));
  const getWorldT3 = (o: Sim3DObjectState): Transform3D => {
    if (!o.source.parentId || o.source.parentId === o.id) return o.t3;
    const chain: Sim3DObjectState[] = [];
    let cur: Sim3DObjectState | undefined = o;
    const vis = new Set<string>();
    while (cur && !vis.has(cur.id)) {
      vis.add(cur.id);
      chain.unshift(cur);
      cur = cur.source.parentId ? objById.get(cur.source.parentId) : undefined;
    }
    let wx = 0;
    let wy = 0;
    let wz = 0;
    let wsx = 1;
    let wsy = 1;
    let wsz = 1;
    let wry = 0;
    for (const node of chain) {
      const rad = (wry * Math.PI) / 180;
      const cos = Math.cos(rad);
      const sin = Math.sin(rad);
      const lx = node.t3.x * wsx;
      const lz = node.t3.z * wsz;
      wx += lx * cos + lz * sin;
      wy += node.t3.y * wsy;
      wz += -lx * sin + lz * cos;
      wry += node.t3.ry;
      wsx *= node.t3.sx;
      wsy *= node.t3.sy;
      wsz *= node.t3.sz;
    }
    return {
      ...o.t3,
      x: wx,
      y: wy,
      z: wz,
      ry: wry,
      sx: wsx,
      sy: wsy,
      sz: wsz,
    };
  };

  const resolveObjectRef = (ref?: string | null): Sim3DObjectState | null => {
    if (!ref) return null;
    return objects.find((o) => o.id === ref || o.name === ref) ?? null;
  };

  const makeHandle = (o: Sim3DObjectState, params: Record<string, unknown> = {}): NexusObjectHandle => ({
    get id() {
      return o.id;
    },
    get name() {
      return o.name;
    },
    get type() {
      return o.type;
    },
    get tags() {
      return o.tags;
    },
    get x() {
      return o.t3.x;
    },
    set x(v: number) {
      if (Number.isFinite(v)) o.t3.x = v;
    },
    get y() {
      return o.t3.y;
    },
    set y(v: number) {
      if (Number.isFinite(v)) o.t3.y = v;
    },
    get z() {
      return o.t3.z;
    },
    set z(v: number) {
      if (Number.isFinite(v)) o.t3.z = v;
    },
    get rx() {
      return o.t3.rx;
    },
    set rx(v: number) {
      if (Number.isFinite(v)) o.t3.rx = v;
    },
    get ry() {
      return o.t3.ry;
    },
    set ry(v: number) {
      if (Number.isFinite(v)) o.t3.ry = v;
    },
    get rz() {
      return o.t3.rz;
    },
    set rz(v: number) {
      if (Number.isFinite(v)) o.t3.rz = v;
    },
    get rotation() {
      return o.t3.ry;
    },
    set rotation(v: number) {
      if (Number.isFinite(v)) o.t3.ry = v;
    },
    get vx() {
      return o.vx;
    },
    set vx(v: number) {
      if (Number.isFinite(v)) o.vx = v;
    },
    get vy() {
      return o.vy;
    },
    set vy(v: number) {
      if (Number.isFinite(v)) o.vy = v;
    },
    get vz() {
      return o.vz;
    },
    set vz(v: number) {
      if (Number.isFinite(v)) o.vz = v;
    },
    get scaleX() {
      return o.t3.sx;
    },
    set scaleX(v: number) {
      if (Number.isFinite(v)) o.t3.sx = v;
    },
    get scaleY() {
      return o.t3.sy;
    },
    set scaleY(v: number) {
      if (Number.isFinite(v)) o.t3.sy = v;
    },
    get scaleZ() {
      return o.t3.sz;
    },
    set scaleZ(v: number) {
      if (Number.isFinite(v)) o.t3.sz = v;
    },
    get opacity() {
      return o.source.opacity;
    },
    set opacity(v: number) {
      if (Number.isFinite(v)) o.source.opacity = v;
    },
    get visible() {
      return o.visible;
    },
    set visible(v: boolean) {
      o.visible = Boolean(v);
    },
    get isGrounded() {
      return o.isGrounded;
    },
    get speed() {
      return Math.hypot(o.vx, o.vz);
    },
    data: o.scriptData,
    params,
    hasTag(tag) {
      return Array.isArray(o.tags) && o.tags.includes(tag);
    },
    addTag(tag) {
      if (tag && !o.tags.includes(tag)) o.tags.push(tag);
    },
    removeTag(tag) {
      o.tags = o.tags.filter((t) => t !== tag);
    },
    moveTowards(
      targetOrX: { x: number; y: number; z?: number } | number,
      speedOrY: number,
      stepOrZOrSpeed: number,
      maybeSpeedOrDt?: number,
      maybeDt5?: number
    ) {
      let tx = o.t3.x;
      let ty = o.t3.y;
      let tz = o.t3.z;
      let maxStep = 0;
      if (typeof targetOrX === 'object' && targetOrX !== null) {
        tx = Number(targetOrX.x ?? o.t3.x);
        ty = Number(targetOrX.y ?? o.t3.y);
        tz = Number(targetOrX.z ?? o.t3.z);
        maxStep = Number(speedOrY || 0) * Number(stepOrZOrSpeed || 0);
      } else if (maybeDt5 !== undefined) {
        tx = Number(targetOrX);
        ty = Number(speedOrY);
        tz = Number(stepOrZOrSpeed);
        maxStep = Number(maybeSpeedOrDt || 0) * Number(maybeDt5 || 0);
      } else {
        tx = Number(targetOrX);
        ty = Number(speedOrY);
        maxStep =
          maybeSpeedOrDt !== undefined
            ? Number(stepOrZOrSpeed || 0) * Number(maybeSpeedOrDt || 0)
            : Number(stepOrZOrSpeed || 0);
      }
      if (!Number.isFinite(tx) || !Number.isFinite(ty) || !Number.isFinite(tz) || maxStep <= 0) return;
      const dx = tx - o.t3.x;
      const dy = ty - o.t3.y;
      const dz = tz - o.t3.z;
      const dist = Math.hypot(dx, dy, dz);
      if (dist > 1e-4) {
        const stepDist = Math.min(dist, maxStep);
        o.t3.x += (dx / dist) * stepDist;
        o.t3.y += (dy / dist) * stepDist;
        o.t3.z += (dz / dist) * stepDist;
      }
    },
    applyImpulse(ix, iy, iz = 0) {
      o.vx += Number(ix || 0);
      o.vy += Number(iy || 0);
      o.vz += Number(iz || 0);
    },
    setVelocity(vx, vy, vz = 0) {
      o.vx = Number(vx || 0);
      o.vy = Number(vy || 0);
      o.vz = Number(vz || 0);
    },
    playAnim(clipName) {
      o.activeClip = clipName;
      o.activeAnimAssetId = null;
    },
    setAnimState(stateName) {
      const fsm = o.source.animStateMachine;
      const node = fsm?.states.find((s) => s.name === stateName || s.id === stateName);
      if (node) {
        o.currentAnimState = node.name;
        o.activeClip = node.clipName;
        o.activeAnimAssetId = node.assetId ?? null;
        o.animTimeScale = node.timeScale ?? 1;
        o.animLoopMode = node.loopMode ?? 'LoopRepeat';
        o.animProgress = 0;
        o.animFinished = false;
        o.blendDuration = 0.25;
      } else {
        o.currentAnimState = stateName;
        o.activeClip = stateName;
        o.animProgress = 0;
        o.animFinished = false;
      }
    },
    playState(stateName) {
      const fsm = o.source.animStateMachine;
      const node = fsm?.states.find((s) => s.name === stateName || s.id === stateName);
      if (node) {
        o.currentAnimState = node.name;
        o.activeClip = node.clipName;
        o.activeAnimAssetId = node.assetId ?? null;
        o.animTimeScale = node.timeScale ?? 1;
        o.animLoopMode = node.loopMode ?? 'LoopRepeat';
        o.animProgress = 0;
        o.animFinished = false;
        o.blendDuration = 0.25;
      } else {
        o.activeClip = stateName;
        o.animProgress = 0;
        o.animFinished = false;
      }
    },
    call(methodName, ...args) {
      for (const b of o.source.scriptBindings ?? []) {
        if (!b.enabled) continue;
        const entry = compiledScripts.get(b.scriptId);
        const fn = entry?.hooks[methodName];
        if (typeof fn === 'function') {
          try {
            const typedFn = fn as (...a: unknown[]) => unknown;
            const h = makeHandle(o, { ...entry?.hooks.params, ...(b.params ?? {}) });
            const apiObj = createApi(0);
            if (args.length === 0 && typedFn.length >= 3) {
              return typedFn(h, undefined, apiObj);
            }
            return typedFn(h, ...args, apiObj);
          } catch (err) {
            logScriptError(`${o.id}:${b.scriptId}:${methodName}`, entry?.name ?? b.scriptId, err);
          }
        }
      }
      return undefined;
    },
    destroy() {
      o.visible = false;
    },
  });

  const makeSceneHandle = (scriptId: string, params: Record<string, unknown> = {}): NexusObjectHandle => {
    let data = sceneScriptData.get(scriptId);
    if (!data) {
      data = {};
      sceneScriptData.set(scriptId, data);
    }
    return {
      get id() { return scene.id; },
      get name() { return scene.name; },
      get type() { return 'scene'; },
      get tags() { return ['scene']; },
      x: 0,
      y: 0,
      z: 0,
      rx: 0,
      ry: 0,
      rz: 0,
      rotation: 0,
      vx: 0,
      vy: 0,
      vz: 0,
      scaleX: 1,
      scaleY: 1,
      scaleZ: 1,
      opacity: 1,
      visible: true,
      isGrounded: false,
      speed: 0,
      data,
      params,
      hasTag: (tag) => tag === 'scene',
      addTag: () => {},
      removeTag: () => {},
      moveTowards: () => {},
      applyImpulse: () => {},
      setVelocity: () => {},
      playAnim: () => {},
      setAnimState: () => {},
      playState: () => {},
      call(methodName, ...args) {
        const entry = compiledScripts.get(scriptId);
        const fn = entry?.hooks[methodName];
        if (typeof fn === 'function') {
          try {
            return (fn as (...a: unknown[]) => unknown)(
              makeSceneHandle(scriptId, { ...(entry?.hooks.params ?? {}) }),
              ...args,
              createApi(0)
            );
          } catch (err) {
            logScriptError(`scene:${scriptId}:${methodName}`, entry?.name ?? scriptId, err);
          }
        }
        return undefined;
      },
      destroy: () => {},
    };
  };

  let activeHeldKeys = new Set<string>();
  let activeJustPressedKeys = new Set<string>();
  let activeMoveAxisX = 0;
  let activeMoveAxisY = 0;

  const createApi = (dt: number): NexusScriptAPI => ({
    dt,
    time: elapsedTime,
    findByName: (name) => {
      const f = objects.find((o) => o.visible && o.name === name);
      return f ? makeHandle(f) : null;
    },
    findById: (id) => {
      const f = objects.find((o) => o.visible && o.id === id);
      return f ? makeHandle(f) : null;
    },
    findByTag: (tag) => objects.filter((o) => o.visible && o.tags.includes(tag)).map((o) => makeHandle(o)),
    getAll: () => objects.filter((o) => o.visible).map((o) => makeHandle(o)),
    spawnPrefab: (nameOrId, x = 0, y = 1, z = 0) => {
      const tpl = resolveObjectRef(nameOrId);
      if (!tpl) return null;
      spawnCounter += 1;
      const cloneSrc: GameObjectData = JSON.parse(JSON.stringify(tpl.source));
      cloneSrc.id = `${tpl.id}_clone_${Date.now()}_${spawnCounter}`;
      cloneSrc.visible = true;
      cloneSrc.transform3d = { ...tpl.t3, x, y, z };
      const clone: Sim3DObjectState = {
        ...tpl,
        id: cloneSrc.id,
        name: `${tpl.name}_clon`,
        visible: true,
        tags: [...(cloneSrc.tags ?? [])],
        t3: { ...tpl.t3, x, y, z },
        vx: 0,
        vy: 0,
        vz: 0,
        animProgress: 0,
        animFinished: false,
        scriptData: {},
        navPath: [],
        source: cloneSrc,
      };
      objects.push(clone);
      objById.set(clone.id, clone);
      return makeHandle(clone);
    },
    destroyById: (id) => {
      const f = resolveObjectRef(id);
      if (f) f.visible = false;
    },
    emitEvent: (eventName) => {
      if (eventName) queuedEvents.push(eventName);
    },
    log: (m) => pushLog(m),
    vars: {
      get: (name) => variables.get(name),
      set: (name, value) => {
        variables.set(name, value);
      },
      add: (name, delta) => {
        const cur = Number(variables.get(name) ?? 0);
        const next = (Number.isFinite(cur) ? cur : 0) + delta;
        variables.set(name, next);
        return next;
      },
    },
    audio: {
      play: (id, vol) => audioHooks?.playSfx?.(id, vol),
      playSfx: (id, vol) => audioHooks?.playSfx?.(id, vol),
      playMusic: (id, vol) => audioHooks?.playMusic?.(id, vol),
      stopMusic: () => audioHooks?.stopMusic?.(),
      setBusVolume: (bus, vol) => audioHooks?.setBusVolume?.(bus, vol),
      setBusMuted: (bus, muted) => audioHooks?.setBusMuted?.(bus, muted),
    },
    particles: {
      burst: (x, y, presetOrColorOrZ = '#fbbf24', countOrPreset = 18, maybeCount) => {
        const z = typeof presetOrColorOrZ === 'number' ? presetOrColorOrZ : 0;
        const count =
          typeof presetOrColorOrZ === 'number'
            ? typeof countOrPreset === 'number'
              ? countOrPreset
              : typeof maybeCount === 'number'
                ? maybeCount
                : 18
            : typeof countOrPreset === 'number'
              ? countOrPreset
              : typeof maybeCount === 'number'
                ? maybeCount
                : 18;
        const rawStyle =
          typeof presetOrColorOrZ === 'string'
            ? presetOrColorOrZ
            : typeof countOrPreset === 'string'
              ? countOrPreset
              : '#fbbf24';
        const color = rawStyle.startsWith('#') ? rawStyle : '#fbbf24';
        particlePool.burst(
          'script_vfx',
          x,
          y,
          z,
          Math.max(4, Math.min(48, Number(count) || 18)),
          {
            enabled: true,
            preset: 'sparks',
            rate: 30,
            maxParticles: 150,
            speedMin: 35,
            speedMax: 120,
            angleDeg: -90,
            spreadDeg: 360,
            gravity: 160,
            sizeStart: 0.45,
            sizeEnd: 0.05,
            lifetime: 0.75,
            colorStart: color,
            colorEnd: '#ef4444',
            blendAlpha: 0.9,
            alphaStart: 1,
            alphaEnd: 0,
          },
          true
        );
      },
    },
    vfx: {
      emit: (opts) => {
        const tgt =
          typeof opts.target === 'string'
            ? resolveObjectRef(opts.target)
            : opts.target?.id
              ? resolveObjectRef(opts.target.id)
              : null;
        const px = opts.x ?? tgt?.t3.x ?? 0;
        const py = opts.y ?? tgt?.t3.y ?? 1;
        const pz = opts.z ?? tgt?.t3.z ?? 0;
        const presetId = (opts.preset ?? 'sparks') as 'fire' | 'smoke' | 'sparks' | 'magic' | 'explosion' | 'liquid' | 'waterfall' | 'ripple';
        const defs = getParticlePresetDefaults(presetId);
        particlePool.burst(
          'script_vfx',
          px,
          py,
          pz,
          Math.max(4, Math.min(60, Number(opts.count ?? 20))),
          {
            enabled: true,
            preset: presetId,
            rate: defs.rate ?? 30,
            maxParticles: defs.maxParticles ?? 150,
            speedMin: defs.speedMin ?? 40,
            speedMax: defs.speedMax ?? 130,
            angleDeg: defs.angleDeg ?? -90,
            spreadDeg: defs.spreadDeg ?? 360,
            gravity: defs.gravity ?? 150,
            sizeStart: 0.45,
            sizeEnd: 0.06,
            lifetime: defs.lifetime ?? 0.75,
            colorStart: opts.color ?? defs.colorStart ?? '#fbbf24',
            colorEnd: defs.colorEnd ?? '#ef4444',
            blendAlpha: defs.blendAlpha ?? 0.9,
            alphaStart: 1,
            alphaEnd: 0,
            particleShape: defs.particleShape,
            emitterShape: defs.emitterShape,
          },
          true
        );
      },
      spawnBurst: (x, y, zOrPreset = 0, presetOrColor = 'sparks', count = 20) => {
        const z = typeof zOrPreset === 'number' ? zOrPreset : 0;
        const presetStr = typeof zOrPreset === 'string' ? zOrPreset : presetOrColor;
        const color = presetStr.startsWith('#') ? presetStr : undefined;
        const presetId = (!presetStr.startsWith('#') ? presetStr : 'sparks') as 'fire' | 'smoke' | 'sparks' | 'magic' | 'explosion' | 'liquid' | 'waterfall' | 'ripple';
        const defs = getParticlePresetDefaults(presetId);
        particlePool.burst(
          'script_vfx',
          x,
          y,
          z,
          Math.max(4, Math.min(60, Number(count) || 20)),
          {
            enabled: true,
            preset: presetId,
            rate: defs.rate ?? 30,
            maxParticles: defs.maxParticles ?? 150,
            speedMin: defs.speedMin ?? 40,
            speedMax: defs.speedMax ?? 130,
            angleDeg: defs.angleDeg ?? -90,
            spreadDeg: defs.spreadDeg ?? 360,
            gravity: defs.gravity ?? 150,
            sizeStart: 0.45,
            sizeEnd: 0.06,
            lifetime: defs.lifetime ?? 0.75,
            colorStart: color ?? defs.colorStart ?? '#fbbf24',
            colorEnd: defs.colorEnd ?? '#ef4444',
            blendAlpha: defs.blendAlpha ?? 0.9,
            alphaStart: 1,
            alphaEnd: 0,
            particleShape: defs.particleShape,
          },
          true
        );
      },
    },
    tween: (target, props, durationSec = 0.35) => {
      const targetId = typeof target === 'string' ? target : target?.id;
      const obj = resolveObjectRef(targetId);
      if (!obj) return;
      const from: Record<string, number> = {};
      const to: Record<string, number> = {};
      for (const [k, v] of Object.entries(props)) {
        if (typeof v !== 'number' || !Number.isFinite(v)) continue;
        to[k] = v;
        if (k === 'x') from[k] = obj.t3.x;
        else if (k === 'y') from[k] = obj.t3.y;
        else if (k === 'z') from[k] = obj.t3.z;
        else if (k === 'rx') from[k] = obj.t3.rx;
        else if (k === 'ry' || k === 'rotation') from[k] = obj.t3.ry;
        else if (k === 'rz') from[k] = obj.t3.rz;
        else if (k === 'scaleX') from[k] = obj.t3.sx;
        else if (k === 'scaleY') from[k] = obj.t3.sy;
        else if (k === 'scaleZ') from[k] = obj.t3.sz;
        else if (k === 'opacity') from[k] = obj.source.opacity;
        else if (k === 'fov') from[k] = obj.source.camera3d?.fov ?? cameraState.fov;
      }
      scriptTweens.push({
        targetId: obj.id,
        elapsed: 0,
        duration: Math.max(0.02, durationSec),
        from,
        to,
      });
    },
    camera: {
      shake: (intensity = 0.35, duration = 0.25) => {
        cameraShakeIntensity = Math.max(cameraShakeIntensity, intensity);
        cameraShakeTimer = Math.max(cameraShakeTimer, duration);
      },
      switchCamera: (camRef, durationSec = 0.65) => {
        const cam = resolveObjectRef(camRef);
        if (cam && cam.type === 'camera_3d') {
          cameraManualLock = false;
          cameraBlend = null;
          beginSmartCameraSwitch(cameraState, cam.id, durationSec);
        }
      },
      getForward: () => {
        const dx = cameraState.lookAtX - cameraState.posX;
        const dy = cameraState.lookAtY - cameraState.posY;
        const dz = cameraState.lookAtZ - cameraState.posZ;
        const len = Math.hypot(dx, dy, dz) || 1;
        return { x: dx / len, y: dy / len, z: dz / len };
      },
      getRight: () => {
        const r = getCameraRightXZ(cameraState);
        return { x: r.x, y: 0, z: r.z };
      },
      setPosition: (x, y, z) => {
        cameraManualLock = true;
        cameraBlend = null;
        if (Number.isFinite(x)) cameraState.posX = x;
        if (Number.isFinite(y)) cameraState.posY = y;
        if (Number.isFinite(z)) cameraState.posZ = z;
      },
      lookAt: (x, y, z) => {
        cameraManualLock = true;
        cameraBlend = null;
        if (Number.isFinite(x)) cameraState.lookAtX = x;
        if (Number.isFinite(y)) cameraState.lookAtY = y;
        if (Number.isFinite(z)) cameraState.lookAtZ = z;
      },
      blendTo: (opts) => {
        const dur = Math.max(0.05, Number(opts.duration ?? 0.65));
        cameraBlend = {
          active: true,
          elapsed: 0,
          duration: dur,
          from: {
            px: cameraState.posX,
            py: cameraState.posY,
            pz: cameraState.posZ,
            lx: cameraState.lookAtX,
            ly: cameraState.lookAtY,
            lz: cameraState.lookAtZ,
            fov: cameraState.fov,
          },
          to: {
            px: opts.x ?? cameraState.posX,
            py: opts.y ?? cameraState.posY,
            pz: opts.z ?? cameraState.posZ,
            lx: opts.lookAtX ?? cameraState.lookAtX,
            ly: opts.lookAtY ?? cameraState.lookAtY,
            lz: opts.lookAtZ ?? cameraState.lookAtZ,
            fov: opts.fov ?? cameraState.fov,
          },
        };
      },
    },
    scene: {
      load: (ref) => sceneHooks?.loadScene?.(ref),
      restart: () => sceneHooks?.restartScene?.(),
      nextLevel: () => sceneHooks?.nextLevel?.(),
    },
    ui: {
      open: (target) => sceneHooks?.uiControl?.('open', target),
      close: (target) => sceneHooks?.uiControl?.('close', target),
      toggle: (target) => sceneHooks?.uiControl?.('toggle', target),
      showToast: (text, durationSec = 2.5) => {
        const clean = String(text ?? '').trim();
        if (!clean) return;
        activeToasts.push({
          id: `toast_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
          text: clean,
          remaining: Math.max(0.4, durationSec),
        });
        if (activeToasts.length > 5) activeToasts.shift();
      },
      createWidget: (id, html, opts) => {
        const cleanId = String(id || '').trim();
        if (!cleanId) return;
        const idx = dynamicWidgets.findIndex((w) => w.id === cleanId);
        const entry = {
          id: cleanId,
          html: String(html ?? ''),
          x: opts?.x ?? 24,
          y: opts?.y ?? 24,
          css: opts?.css,
          visible: true,
        };
        if (idx >= 0) dynamicWidgets[idx] = entry;
        else dynamicWidgets.push(entry);
      },
      updateWidget: (id, patch) => {
        const w = dynamicWidgets.find((item) => item.id === id);
        if (!w) return;
        if (patch.html !== undefined) w.html = patch.html;
        if (patch.text !== undefined) w.html = patch.text;
        if (patch.visible !== undefined) w.visible = Boolean(patch.visible);
      },
      removeWidget: (id) => {
        const idx = dynamicWidgets.findIndex((item) => item.id === id);
        if (idx >= 0) dynamicWidgets.splice(idx, 1);
      },
      clearWidgets: () => {
        dynamicWidgets.length = 0;
      },
    },
    spawn: {
      clone: (nameOrId, x = 0, y = 1, z = 0) => createApi(dt).spawnPrefab(nameOrId, x, y, z),
      primitive: (shape, opts = {}) => {
        spawnCounter += 1;
        const id = `spawn_prim_${Date.now()}_${spawnCounter}`;
        const px = Number(opts.x ?? 0);
        const py = Number(opts.y ?? 1);
        const pz = Number(opts.z ?? 0);
        const sx = Number(opts.sx ?? 1);
        const sy = Number(opts.sy ?? 1);
        const sz = Number(opts.sz ?? 1);
        const t3: Transform3D = { x: px, y: py, z: pz, rx: 0, ry: 0, rz: 0, sx, sy, sz };
        const src: GameObjectData = {
          id,
          name: opts.name || `Prim_${spawnCounter}`,
          type: 'mesh_3d',
          parentId: null,
          visible: true,
          locked: false,
          opacity: 1,
          layer: 'World',
          tags: ['spawned'],
          transform: { x: 0, y: 0, rotation: 0, scaleX: 1, scaleY: 1, width: 64, height: 64, anchorX: 0.5, anchorY: 0.5 },
          transform3d: { ...t3 },
          mesh3d: {
            shape,
            color: opts.color || '#38bdf8',
            roughness: 0.55,
            metalness: 0.15,
            castShadow: true,
            receiveShadow: true,
          },
          physics3d: opts.physics === false
            ? { enabled: false, bodyType: 'static', shape: 'box', mass: 1, restitution: 0.1, friction: 0.7, isTrigger: false, gravityScale: 1 }
            : { enabled: true, bodyType: opts.dynamic ? 'dynamic' : 'static', shape: shape === 'stairs' ? 'mesh_exact' : shape === 'sphere' ? 'sphere' : 'box', mass: 1, restitution: 0.1, friction: 0.7, isTrigger: false, gravityScale: 1 },
          components: [],
        };
        const simObj: Sim3DObjectState = {
          id,
          name: src.name,
          type: 'mesh_3d',
          visible: true,
          layer: 'World',
          tags: ['spawned'],
          t3,
          vx: 0,
          vy: 0,
          vz: 0,
          isGrounded: false,
          coyoteTimer: 0,
          jumpBufferTimer: 0,
          jumpsUsed: 0,
          hp: 100,
          maxHp: 100,
          invulnTimer: 0,
          currentAnimState: '',
          activeClip: '',
          activeAnimAssetId: null,
          blendDuration: 0.25,
          animTimeScale: 1,
          animLoopMode: 'LoopRepeat',
          animProgress: 0,
          animFinished: false,
          originT3: { x: px, y: py, z: pz },
          patrolPhase: 0,
          waypointIndex: 0,
          waypointForward: true,
          scriptData: {},
          navPath: [],
          navTimer: 0,
          source: src,
        };
        objects.push(simObj);
        objById.set(id, simObj);
        return makeHandle(simObj);
      },
    },
    world: {
      raycast: (ox, oy, oz, dx, dy, dz, maxDist = 100) => {
        const dLen = Math.hypot(dx, dy, dz) || 1;
        const ndx = dx / dLen;
        const ndy = dy / dLen;
        const ndz = dz / dLen;
        let bestT = maxDist;
        let bestObj: Sim3DObjectState | null = null;

        for (const cand of objects) {
          if (!cand.visible || cand.type !== 'mesh_3d') continue;
          if (cand.source.mesh3d?.shape === 'terrain' || cand.source.mesh3d?.shape === 'grass_field') continue;
          const w = getWorldT3(cand);
          const he = getHalfExtents3D(cand);
          let tmin = 0;
          let tmax = bestT;
          const axes: Array<[number, number, number, number]> = [
            [ox, ndx, w.x - he.x, w.x + he.x],
            [oy, ndy, w.y - he.y, w.y + he.y],
            [oz, ndz, w.z - he.z, w.z + he.z],
          ];
          let missed = false;
          for (const [oVal, dVal, bmin, bmax] of axes) {
            if (Math.abs(dVal) < 1e-6) {
              if (oVal < bmin || oVal > bmax) {
                missed = true;
                break;
              }
            } else {
              let t1 = (bmin - oVal) / dVal;
              let t2 = (bmax - oVal) / dVal;
              if (t1 > t2) {
                const tmp = t1;
                t1 = t2;
                t2 = tmp;
              }
              tmin = Math.max(tmin, t1);
              tmax = Math.min(tmax, t2);
              if (tmin > tmax) {
                missed = true;
                break;
              }
            }
          }
          if (!missed && tmin >= 0 && tmin < bestT) {
            bestT = tmin;
            bestObj = cand;
          }
        }

        // También muestrear el terreno a lo largo del rayo si apunta hacia abajo o choca antes
        const steps = 40;
        const stepLen = Math.min(bestT, maxDist) / steps;
        if (stepLen > 0.01) {
          for (let s = 1; s <= steps; s++) {
            const dist = s * stepLen;
            const px = ox + ndx * dist;
            const py = oy + ndy * dist;
            const pz = oz + ndz * dist;
            const gy = groundHeightAt(scene, px, pz);
            if (py <= gy) {
              return {
                hit: true,
                objectId: 'terrain',
                objectName: 'Terreno',
                distance: dist,
                x: px,
                y: gy,
                z: pz,
              };
            }
          }
        }

        if (bestObj) {
          return {
            hit: true,
            objectId: bestObj.id,
            objectName: bestObj.name,
            distance: bestT,
            x: ox + ndx * bestT,
            y: oy + ndy * bestT,
            z: oz + ndz * bestT,
          };
        }
        return {
          hit: false,
          distance: maxDist,
          x: ox + ndx * maxDist,
          y: oy + ndy * maxDist,
          z: oz + ndz * maxDist,
        };
      },
      getTerrainHeight: (x, z) => groundHeightAt(scene, x, z),
    },
    lights: {
      setSun: (opts) => {
        if (opts.intensity !== undefined) sunOverride.intensity = opts.intensity;
        if (opts.color !== undefined) sunOverride.color = opts.color;
        if (opts.timeOfDay !== undefined) sunOverride.timeOfDay = opts.timeOfDay;
      },
      setLight: (nameOrId, opts) => {
        const lObj = resolveObjectRef(nameOrId);
        if (!lObj || !lObj.source.light3d) return;
        if (opts.intensity !== undefined) lObj.source.light3d.intensity = opts.intensity;
        if (opts.color !== undefined) lObj.source.light3d.color = opts.color;
        if (opts.distance !== undefined) lObj.source.light3d.distance = opts.distance;
        if (opts.visible !== undefined) lObj.visible = Boolean(opts.visible);
      },
    },
    input: {
      isHeld: (k) => activeHeldKeys.has(k),
      justPressed: (k) => activeJustPressedKeys.has(k),
      getAxis: () => {
        let x = activeMoveAxisX;
        let y = activeMoveAxisY;
        if (Math.abs(x) < 0.05) {
          x = (activeHeldKeys.has('KeyD') || activeHeldKeys.has('ArrowRight') ? 1 : 0) -
              (activeHeldKeys.has('KeyA') || activeHeldKeys.has('ArrowLeft') ? 1 : 0);
        }
        if (Math.abs(y) < 0.05) {
          y = (activeHeldKeys.has('KeyS') || activeHeldKeys.has('ArrowDown') ? 1 : 0) -
              (activeHeldKeys.has('KeyW') || activeHeldKeys.has('ArrowUp') ? 1 : 0);
        }
        return { x, y };
      },
    },
  });

  const evaluateCondition = (c: ConditionDefinition, selfObj?: Sim3DObjectState): boolean => {
    switch (c.type) {
      case 'variable.compare': {
        const lhs = c.variable ? variables.get(c.variable) ?? 0 : 0;
        const rhs = c.secondaryVariable ? variables.get(c.secondaryVariable) : c.value;
        return compareValues(lhs, c.operator ?? '==', rhs);
      }
      case 'object.visible': {
        const t = resolveObjectRef(c.target) ?? selfObj;
        return Boolean(t?.visible);
      }
      case 'object.grounded': {
        const t = resolveObjectRef(c.target) ?? selfObj;
        return Boolean(t?.isGrounded);
      }
      case 'input.held':
        return Boolean(c.key && activeHeldKeys.has(c.key));
      case 'distance.less':
      case 'distance.greater': {
        const a = resolveObjectRef(c.target) ?? selfObj;
        const b = resolveObjectRef(c.secondaryTarget);
        if (!a || !b) return false;
        const dist = Math.hypot(a.t3.x - b.t3.x, a.t3.y - b.t3.y, a.t3.z - b.t3.z);
        const th = Number(c.value ?? 5);
        return c.type === 'distance.less' ? dist < th : dist > th;
      }
      case 'random.chance':
        return Math.random() * 100 <= Number(c.value ?? 50);
      default:
        return true;
    }
  };

  const executeAction = (act: ActionDefinition, owner?: Sim3DObjectState, other?: Sim3DObjectState) => {
    const p = act.parameters ?? {};
    const api = createApi(0);
    const targetObj =
      p.target === '$other'
        ? other ?? null
        : p.target === '$self'
          ? owner ?? null
          : resolveObjectRef(String(p.target ?? '')) ?? owner ?? null;

    switch (act.type) {
      case 'variable.set':
        if (typeof p.variable === 'string') {
          variables.set(p.variable, evaluateNumericExpression(String(p.value ?? 0), variables));
        }
        break;
      case 'variable.add':
        if (typeof p.variable === 'string') {
          api.vars.add(p.variable, evaluateNumericExpression(String(p.amount ?? 1), variables));
        }
        break;
      case 'audio.play':
        audioHooks?.playSfx?.(String(p.assetId ?? p.preset ?? 'coin'), Number(p.volume ?? 1));
        break;
      case 'music.play':
        if (typeof p.assetId === 'string') audioHooks?.playMusic?.(p.assetId, Number(p.volume ?? 0.8));
        break;
      case 'music.stop':
        audioHooks?.stopMusic?.();
        break;
      case 'object.destroy':
      case 'object.hide':
        if (targetObj) targetObj.visible = false;
        break;
      case 'object.show':
        if (targetObj) targetObj.visible = true;
        break;
      case 'object.teleport':
        if (targetObj) {
          targetObj.t3.x = Number(p.x ?? targetObj.t3.x);
          targetObj.t3.y = Number(p.y ?? targetObj.t3.y);
          targetObj.t3.z = Number(p.z ?? targetObj.t3.z);
        }
        break;
      case 'physics.impulse':
        if (targetObj) {
          targetObj.vx += Number(p.ix ?? 0);
          targetObj.vy += Number(p.iy ?? 7);
          targetObj.vz += Number(p.iz ?? 0);
        }
        break;
      case 'camera.switch': {
        const cam = resolveObjectRef(String(p.cameraId ?? p.target ?? ''));
        if (cam) beginSmartCameraSwitch(cameraState, cam.id, Number(p.duration ?? 0.65));
        break;
      }
      case 'vehicle.enterExit': {
        if (vehicleToggledThisStep) break;
        const actor =
          (typeof p.actorId === 'string' && p.actorId ? resolveObjectRef(p.actorId) : null) ??
          resolvePlayerActor();
        if (!actor) break;
        const maxDist = Number(p.maxDistance ?? 12);
        const preferredVeh =
          (typeof p.vehicleId === 'string' && p.vehicleId ? resolveObjectRef(p.vehicleId) : null) ??
          (typeof p.target === 'string' && p.target ? resolveObjectRef(p.target) : null);

        if (activeMountedVehicleId) {
          const curVeh =
            objById.get(activeMountedVehicleId) ??
            (preferredVeh?.source.vehicle?.enabled ? preferredVeh : null);
          if (curVeh && actor.id !== curVeh.id) {
            const exitOffsetX = Number(p.exitOffsetX ?? 2.6);
            const yaw = (curVeh.t3.ry * Math.PI) / 180;
            actor.t3.x = curVeh.t3.x + Math.cos(yaw) * exitOffsetX;
            actor.t3.z = curVeh.t3.z - Math.sin(yaw) * exitOffsetX;
            const gY = groundHeightAt(scene, actor.t3.x, actor.t3.z);
            const heA = getHalfExtents3D(actor);
            actor.t3.y = Math.max(curVeh.t3.y + 0.5, gY + heA.y);
            actor.t3.rx = 0;
            actor.t3.rz = 0;
            actor.vx = 0;
            actor.vy = 0;
            actor.vz = 0;
            actor.visible = true;
            activeMountedVehicleId = null;
            mountedActorId = null;
            cameraFollowOverride3D = null;
            cameraManualLock = false;
            vehicleToggledThisStep = true;
          }
        } else {
          let vehTarget: Sim3DObjectState | null =
            preferredVeh && preferredVeh.source.vehicle?.enabled ? preferredVeh : null;
          if (!vehTarget) {
            let bestDist = Infinity;
            for (const cand of objects) {
              if (!cand.visible || cand.id === actor.id || !cand.source.vehicle?.enabled) continue;
              const xzD = Math.hypot(actor.t3.x - cand.t3.x, actor.t3.z - cand.t3.z);
              if (xzD > maxDist) continue;
              const d3 = Math.hypot(actor.t3.x - cand.t3.x, actor.t3.y - cand.t3.y, actor.t3.z - cand.t3.z);
              if (d3 < bestDist) {
                bestDist = d3;
                vehTarget = cand;
              }
            }
          }
          if (vehTarget && vehTarget.id !== actor.id) {
            const dist = Math.hypot(actor.t3.x - vehTarget.t3.x, actor.t3.z - vehTarget.t3.z);
            if (dist <= maxDist) {
              const vCfg = vehTarget.source.vehicle;
              const vKind = vCfg?.vehicleKind ?? 'car';
              const isSaddle =
                vCfg?.mountStyle === 'saddle' ||
                (!vCfg?.mountStyle && (vKind === 'moto' || vKind === 'horse'));
              activeMountedVehicleId = vehTarget.id;
              mountedActorId = actor.id;
              actor.vx = 0;
              actor.vy = 0;
              actor.vz = 0;
              if (isSaddle) {
                actor.visible = true;
                const pos = computeSaddleWorldPosition(
                  vehTarget.t3,
                  vehTarget.t3,
                  vCfg?.seatOffset ?? { x: 0, y: vKind === 'horse' ? 1.05 : 0.85, z: -0.1 }
                );
                actor.t3.x = pos.x;
                actor.t3.y = pos.y;
                actor.t3.z = pos.z;
                actor.t3.rx = vehTarget.t3.rx;
                actor.t3.ry = vehTarget.t3.ry;
                actor.t3.rz = vehTarget.t3.rz;
              } else {
                actor.visible = false;
                actor.t3.x = vehTarget.t3.x;
                actor.t3.y = vehTarget.t3.y;
                actor.t3.z = vehTarget.t3.z;
              }
              cameraFollowOverride3D = vCfg?.parts?.cameraId || vehTarget.id;
              cameraManualLock = false;
              vehicleToggledThisStep = true;
            }
          }
        }
        break;
      }
      case 'camera.shake':
        api.camera.shake(Number(p.intensity ?? 0.35), Number(p.duration ?? 0.25));
        break;
      case 'anim3d.setState':
        if (targetObj && typeof p.stateName === 'string') {
          makeHandle(targetObj).setAnimState(p.stateName);
        }
        break;
      case 'vfx.emit': {
        const ref = targetObj;
        const x = Number(p.x ?? ref?.t3.x ?? 0);
        const y = Number(p.y ?? ref?.t3.y ?? 1);
        const z = Number(p.z ?? ref?.t3.z ?? 0);
        const count = Number(p.count ?? 22);
        const emitterCfg = ref?.source.particleEmitter ?? {
          enabled: true,
          preset: 'sparks',
          rate: 30,
          maxParticles: 150,
          speedMin: 40,
          speedMax: 160,
          angleDeg: -90,
          spreadDeg: 360,
          gravity: 160,
          sizeStart: 0.45,
          sizeEnd: 0.05,
          lifetime: 0.75,
          colorStart: String(p.color ?? '#fbbf24'),
          colorEnd: '#ef4444',
          blendAlpha: 0.9,
          alphaStart: 1,
          alphaEnd: 0,
        };
        particlePool.burst(ref?.id ?? 'vfx', x, y, z, count, emitterCfg, true);
        break;
      }
      case 'ai.chase':
        if (targetObj) {
          if (!targetObj.source.aiAgent) {
            targetObj.source.aiAgent = {
              enabled: true,
              speed: Number(p.speed ?? 4),
              acceleration: 12,
              avoidanceRadius: 1,
              stoppingDistance: 1.5,
              mode: 'chase',
              targetObjectId: String(p.chaseTargetId ?? ''),
            };
          } else {
            targetObj.source.aiAgent.enabled = true;
            targetObj.source.aiAgent.mode = 'chase';
            targetObj.source.aiAgent.targetObjectId = String(p.chaseTargetId ?? '');
          }
        }
        break;
      case 'ai.moveTo':
        if (targetObj) {
          if (!targetObj.source.aiAgent) {
            targetObj.source.aiAgent = {
              enabled: true,
              speed: Number(p.speed ?? 4),
              acceleration: 12,
              avoidanceRadius: 1,
              stoppingDistance: 1,
              mode: 'moveTo',
              targetX: Number(p.x ?? 0),
              targetY: Number(p.y ?? 0),
              targetZ: Number(p.z ?? 0),
            };
          } else {
            targetObj.source.aiAgent.enabled = true;
            targetObj.source.aiAgent.mode = 'moveTo';
            targetObj.source.aiAgent.targetX = Number(p.x ?? 0);
            targetObj.source.aiAgent.targetZ = Number(p.z ?? 0);
          }
        }
        break;
      case 'ai.stop':
        if (targetObj?.source.aiAgent) {
          targetObj.source.aiAgent.mode = 'idle';
          targetObj.navPath = [];
        }
        break;
      case 'script.call':
        if (typeof p.methodName === 'string' && p.methodName.trim()) {
          const methodName = p.methodName.trim();
          const callArgsFor3D = (fn: (...a: unknown[]) => unknown, h: NexusObjectHandle): unknown[] => {
            if (p.arg !== undefined && p.arg !== '') return [h, p.arg, api];
            if (fn.length >= 3) return [h, undefined, api];
            return [h, api];
          };
          const explicitTarget =
            p.target === '$other'
              ? other ?? null
              : p.target === '$self'
                ? owner ?? null
                : p.target
                  ? resolveObjectRef(String(p.target))
                  : null;
          if (explicitTarget) {
            const h = makeHandle(explicitTarget);
            if (p.arg !== undefined && p.arg !== '') h.call(methodName, p.arg);
            else h.call(methodName);
          } else if (typeof p.scriptId === 'string' && p.scriptId) {
            const entry = compiledScripts.get(p.scriptId);
            const fn = entry?.hooks[methodName];
            if (entry && typeof fn === 'function') {
              const typedFn = fn as (...a: unknown[]) => unknown;
              let invoked = false;
              for (const obj of objects) {
                const bind = (obj.source.scriptBindings ?? []).find(
                  (b) => b.enabled && b.scriptId === p.scriptId
                );
                if (bind) {
                  invoked = true;
                  try {
                    const h = makeHandle(obj, { ...(entry.hooks.params ?? {}), ...(bind.params ?? {}) });
                    typedFn(...callArgsFor3D(typedFn, h));
                  } catch (err) {
                    logScriptError(`${obj.id}:${p.scriptId}:${methodName}`, entry.name, err);
                  }
                }
              }
              if (!invoked) {
                try {
                  const sh = makeSceneHandle(p.scriptId, { ...(entry.hooks.params ?? {}) });
                  typedFn(...callArgsFor3D(typedFn, sh));
                } catch (err) {
                  logScriptError(`scene:${p.scriptId}:${methodName}`, entry.name, err);
                }
              }
            }
          }
        }
        break;
      case 'ui.openInterface':
        sceneHooks?.uiControl?.('open', String(p.target ?? ''));
        break;
      case 'ui.closeInterface':
        sceneHooks?.uiControl?.('close', String(p.target ?? ''));
        break;
      case 'ui.toggleInterface':
        sceneHooks?.uiControl?.('toggle', String(p.target ?? ''));
        break;
      case 'scene.load':
        sceneHooks?.loadScene?.(String(p.sceneId ?? ''));
        break;
      case 'scene.nextLevel':
        sceneHooks?.nextLevel?.();
        break;
      case 'scene.restart':
        sceneHooks?.restartScene?.();
        break;
      case 'event.emit':
        if (typeof p.eventName === 'string') queuedEvents.push(p.eventName);
        break;
      case 'dialogue.start':
        if (typeof p.dialogueId === 'string') sceneHooks?.startDialogue?.(p.dialogueId);
        break;
      case 'i18n.setLocale':
        if (p.locale === 'es' || p.locale === 'en' || p.locale === 'pt') {
          sceneHooks?.setLocale?.(p.locale);
        }
        break;
    }
  };

  const resolvePlayerActor = (): Sim3DObjectState | null =>
    objects.find(
      (o) =>
        o.visible &&
        (o.source.components ?? []).some(
          (c) =>
            c.enabled &&
            (c.type === 'player_3d' ||
              c.type === 'player_platformer' ||
              c.type === 'player_topdown' ||
              c.type === 'movement.platformer_pro' ||
              c.type === 'movement.topdown_8dir')
        )
    ) ??
    objects.find(
      (o) =>
        o.visible &&
        (o.tags.some((t) => t.toLowerCase() === 'player' || t.toLowerCase() === 'jugador') ||
          o.name.toLowerCase() === 'player' ||
          o.name.toLowerCase() === 'jugador')
    ) ??
    null;

  const emitWiredSignal3D = (
    sourceObjectId: string,
    sourceBehavior: string,
    signal: string,
    payload: Record<string, unknown> = {}
  ) => {
    wiringSys.emitBehaviorSignal(sourceObjectId, sourceBehavior, signal, payload);
    for (const link of scene.wiringLinks ?? []) {
      if (
        link.sourceObjectId !== sourceObjectId ||
        link.sourceBehavior !== sourceBehavior ||
        link.signal !== signal
      ) {
        continue;
      }
      if (link.targetBehavior === 'juice.camera_follow' && link.action === 'setTarget') {
        cameraFollowOverride3D = typeof payload.targetId === 'string' ? payload.targetId : null;
      } else if (link.targetBehavior === 'inventory.backpack' && typeof payload.itemId === 'string') {
        const k = `inv_${payload.itemId}`;
        if (!variables.has(k)) {
          variables.set(k, Number(payload.amount ?? 1));
        }
      }
    }
  };

  const evaluateAnimFSM = (obj: Sim3DObjectState, dt: number) => {
    const fsm: AnimationStateMachineConfig | undefined = obj.source.animStateMachine;
    if (!fsm || fsm.states.length === 0) return;

    // Avance de progreso de respaldo si no hay mixer externo actualizando animProgress
    obj.animElapsed = (obj.animElapsed ?? 0) + dt;
    const extProg = obj.animProgress ?? 0;
    const prevSeen = obj._lastSeenAnimProgress ?? 0;
    if (extProg === prevSeen && (obj.animElapsed ?? 0) > 0) {
      const estDur = 0.65 / Math.max(0.2, obj.animTimeScale || 1);
      const fallbackProg = Math.min(1, obj.animElapsed / estDur);
      obj.animProgress = fallbackProg;
      if (obj.animLoopMode === 'LoopOnce' && fallbackProg >= 0.99) {
        obj.animFinished = true;
      }
    }
    obj._lastSeenAnimProgress = obj.animProgress ?? 0;

    // Si es un hijo (ej. malla 3D animada dentro de un Jugador padre), hereda velocidad/suelo del ancestro activo
    let motionRef = obj;
    if (Math.hypot(obj.vx, obj.vz) < 0.01 && obj.source.parentId) {
      let curPid: string | null | undefined = obj.source.parentId;
      let hop = 0;
      while (curPid && hop < 8) {
        const pObj = objects.find((x) => x.id === curPid);
        if (!pObj) break;
        if (Math.hypot(pObj.vx, pObj.vz) > 0.01 || Math.abs(pObj.vy) > 0.01 || pObj.isGrounded) {
          motionRef = pObj;
          break;
        }
        curPid = pObj.source.parentId;
        hop++;
      }
    }

    const prevProgressForEvents = obj.animProgress ?? 0;
    const res = stepAnimationFSM(fsm, obj.currentAnimState, {
      speed: Math.hypot(motionRef.vx, motionRef.vz),
      vy: motionRef.vy,
      isGrounded: motionRef.isGrounded,
      animFinished: Boolean(obj.animFinished),
      animProgress: prevProgressForEvents,
      heldKeys: activeHeldKeys,
      justPressedKeys: activeJustPressedKeys,
      variables,
    });
    if (res && res.changed) {
      obj.currentAnimState = res.stateName;
      obj.activeClip = res.clipName;
      obj.activeAnimAssetId = res.assetId ?? null;
      obj.blendDuration = res.blendDuration;
      obj.animTimeScale = res.timeScale;
      obj.animLoopMode = res.loopMode;
      obj.animProgress = 0;
      obj._lastSeenAnimProgress = 0;
      obj.animElapsed = 0;
      obj.animFinished = false;
    } else {
      const activeNode = fsm.states.find(
        (s) => s.name === obj.currentAnimState || s.clipName === obj.activeClip
      );
      if (activeNode?.frameEvents && activeNode.frameEvents.length > 0) {
        const totalFrames = Math.max(1, activeNode.frameCount ?? 12);
        const curFrameIdx = Math.floor((obj.animProgress ?? 0) * totalFrames) % totalFrames;
        const feKey = `fe3d:${obj.id}:${activeNode.id}`;
        const prevFrameIdx = Math.floor(behaviorTimers.get(feKey) ?? -1);
        if (curFrameIdx !== prevFrameIdx) {
          behaviorTimers.set(feKey, curFrameIdx);
          for (const fe of activeNode.frameEvents) {
            if (fe.frameIndex === curFrameIdx) {
              if (fe.eventName) queuedEvents.push(fe.eventName);
              if (fe.soundAssetId) {
                const wp = getWorldT3(obj);
                audioHooks?.playSfx?.(fe.soundAssetId, 0.9, { x: wp.x, y: wp.y, z: wp.z });
              }
            }
          }
        }
      }
    }
  };

  const runMechanicsForEvent = (
    event: GameMechanic['trigger']['event'],
    owner?: Sim3DObjectState,
    other?: Sim3DObjectState,
    extra?: { key?: string; eventName?: string }
  ) => {
    const mechs = (scene.mechanics ?? []).filter((m) => m.enabled).sort((a, b) => b.priority - a.priority);
    for (const m of mechs) {
      if (m.trigger.event !== event) continue;
      if (m.trigger.sourceObjectId && owner && m.trigger.sourceObjectId !== owner.id) continue;
      if (m.trigger.target && other) {
        const tgt = m.trigger.target;
        const matchesOther =
          other.id === tgt || other.name === tgt || other.tags.includes(tgt) || other.layer === tgt;
        if (!matchesOther) continue;
      } else if (m.trigger.target && event.startsWith('collision.')) {
        continue;
      }
      if (m.trigger.key && extra?.key && m.trigger.key !== extra.key) continue;
      if (m.trigger.eventName && extra?.eventName && m.trigger.eventName !== extra.eventName) continue;
      const conds = m.conditions ?? [];
      const combinator = m.conditionCombinator ?? 'all';
      const ok =
        conds.length === 0
          ? true
          : combinator === 'any'
            ? conds.some((c) => evaluateCondition(c, owner))
            : combinator === 'none'
              ? !conds.some((c) => evaluateCondition(c, owner))
              : conds.every((c) => evaluateCondition(c, owner));
      if (!ok) continue;
      for (const act of m.actions) {
        executeAction(act, owner, other);
      }
    }
  };

  const step = (input: Sim3DStepInput) => {
    const dt = Math.min(0.05, Math.max(0.001, input.dt));
    elapsedTime += dt;
    activeHeldKeys = input.heldKeys;
    activeJustPressedKeys = input.justPressedKeys;
    activeMoveAxisX = input.moveAxisX ?? 0;
    activeMoveAxisY = input.moveAxisY ?? 0;
    vehicleToggledThisStep = false;

    // Decrementar toasts dinámicos
    for (let i = activeToasts.length - 1; i >= 0; i--) {
      activeToasts[i].remaining -= dt;
      if (activeToasts[i].remaining <= 0) activeToasts.splice(i, 1);
    }

    const api = createApi(dt);
    for (const pl of compiledPlugins) {
      if (startedPluginIds.has(pl.id)) continue;
      startedPluginIds.add(pl.id);
      if (pl.onStart) {
        try {
          pl.onStart(api);
        } catch (err) {
          logScriptError(`plugin:${pl.id}:onStart`, pl.name, err);
        }
      }
    }
    // Avanzar animaciones de Keyframes 3D/Cámara (SceneAnimatorPanel)
    for (const obj of objects) {
      if (!obj.visible || !obj.source.tweens || obj.source.tweens.length === 0) continue;
      for (const track of obj.source.tweens) {
        const sk = `${obj.id}:${track.id}`;
        let ts = tweenStates3D.get(sk);
        if (!ts) {
          ts = { elapsed: 0, playing: Boolean(track.autoPlay) };
          tweenStates3D.set(sk, ts);
        }
        if (!ts.playing) continue;
        ts.elapsed += dt;
        const delay = Math.max(0, track.delay || 0);
        if (ts.elapsed < delay) continue;
        const dur = Math.max(0.05, track.duration || 0.5);
        let prog = (ts.elapsed - delay) / dur;
        if (track.pingPong) {
          const cycle = Math.floor(prog);
          const frac = prog - cycle;
          if (!track.loop && cycle >= 2) {
            prog = 0;
            ts.playing = false;
          } else {
            prog = cycle % 2 === 1 ? 1 - frac : frac;
          }
        } else if (track.loop) {
          prog = prog % 1;
        } else if (prog >= 1) {
          prog = 1;
          ts.playing = false;
        }
        const val = track.from + (track.to - track.from) * evaluateEasing(track.easing, prog);
        if (track.property === 'x') obj.t3.x = val;
        else if (track.property === 'y') obj.t3.y = val;
        else if (track.property === 'z') obj.t3.z = val;
        else if (track.property === 'rx') obj.t3.rx = val;
        else if (track.property === 'ry' || track.property === 'rotation') obj.t3.ry = val;
        else if (track.property === 'rz') obj.t3.rz = val;
        else if (track.property === 'scaleX') obj.t3.sx = val;
        else if (track.property === 'scaleY') obj.t3.sy = val;
        else if (track.property === 'scaleZ') obj.t3.sz = val;
        else if (track.property === 'opacity') obj.source.opacity = Math.max(0, Math.min(1, val));
        else if (track.property === 'fov' && obj.source.camera3d) obj.source.camera3d.fov = Math.max(20, Math.min(120, val));
        trimeshCache.delete(obj.id);
      }
    }

    // Avanzar tweens programáticos de nexus.tween()
    for (let ti = scriptTweens.length - 1; ti >= 0; ti--) {
      const tw = scriptTweens[ti];
      tw.elapsed += dt;
      const ratio = Math.min(1, tw.elapsed / tw.duration);
      const t = 1 - Math.pow(1 - ratio, 2);
      const twObj = resolveObjectRef(tw.targetId);
      if (twObj) {
        for (const [prop, endVal] of Object.entries(tw.to)) {
          const startVal = tw.from[prop] ?? endVal;
          const val = startVal + (endVal - startVal) * t;
          if (prop === 'x') twObj.t3.x = val;
          else if (prop === 'y') twObj.t3.y = val;
          else if (prop === 'z') twObj.t3.z = val;
          else if (prop === 'rx') twObj.t3.rx = val;
          else if (prop === 'ry' || prop === 'rotation') twObj.t3.ry = val;
          else if (prop === 'rz') twObj.t3.rz = val;
          else if (prop === 'scaleX') twObj.t3.sx = val;
          else if (prop === 'scaleY') twObj.t3.sy = val;
          else if (prop === 'scaleZ') twObj.t3.sz = val;
          else if (prop === 'opacity') twObj.source.opacity = val;
          else if (prop === 'fov') {
            if (twObj.source.camera3d) twObj.source.camera3d.fov = Math.max(20, Math.min(120, val));
            else cameraState.fov = Math.max(20, Math.min(120, val));
          }
        }
        trimeshCache.delete(twObj.id);
      }
      if (ratio >= 1) scriptTweens.splice(ti, 1);
    }

    // Ejecutar onStart por cada script de escena y objeto (incluye clones recién creados)
    for (const sid of scene.scriptIds ?? []) {
      const sKey = `scene:${sid}`;
      if (!startedScriptBindings.has(sKey)) {
        startedScriptBindings.add(sKey);
        const entry = compiledScripts.get(sid);
        if (entry?.hooks.onStart) {
          try {
            entry.hooks.onStart(makeSceneHandle(sid, { ...(entry.hooks.params ?? {}) }), api);
          } catch (err) {
            logScriptError(`${sKey}:onStart`, entry.name, err);
          }
        }
      }
    }
    for (const obj of [...objects]) {
      for (const b of obj.source.scriptBindings ?? []) {
        if (!b.enabled) continue;
        const bKey = `obj:${obj.id}:${b.id}`;
        if (startedScriptBindings.has(bKey)) continue;
        startedScriptBindings.add(bKey);
        const entry = compiledScripts.get(b.scriptId);
        if (entry?.hooks.onStart) {
          try {
            entry.hooks.onStart(
              makeHandle(obj, { ...(entry.hooks.params ?? {}), ...(b.params ?? {}) }),
              api
            );
          } catch (err) {
            logScriptError(`${bKey}:onStart`, entry.name, err);
          }
        }
      }
    }

    if (!started) {
      started = true;
      runMechanicsForEvent('scene.start');
    }

    if (input.orbitDeltaYawDeg) cameraState.orbitYawDeg += input.orbitDeltaYawDeg;
    if (input.orbitDeltaPitchDeg) cameraState.orbitPitchDeg += input.orbitDeltaPitchDeg;
    if (cameraShakeTimer > 0) cameraShakeTimer = Math.max(0, cameraShakeTimer - dt);

    // 1. Controlador Player 3D y Comportamientos 3D (Jugador, Perseguir IA Inteligente, Patrulla, Waypoints, Spin, Luz parpadeante, etc.)
    const primaryPlayer = resolvePlayerActor();
    streamingFrame += 1;
    if (chunkManifest && streamingState && streamingSceneView && scene.worldStreaming?.enabled) {
      const playerWorld = primaryPlayer ? getWorldT3(primaryPlayer) : null;
      const cue = getCameraStreamingCues(
        cameraState,
        primaryPlayer && playerWorld
          ? {
              x: playerWorld.x,
              y: playerWorld.y,
              z: playerWorld.z,
              vx: primaryPlayer.vx,
              vy: primaryPlayer.vy,
              vz: primaryPlayer.vz,
            }
          : null
      );
      const movedEnough =
        Number.isNaN(lastStreamPx) ||
        Math.hypot(cue.playerPos.x - lastStreamPx, cue.playerPos.z - lastStreamPz) >= 0.75 ||
        Math.hypot(cameraState.posX - lastStreamCamX, cameraState.posZ - lastStreamCamZ) >= 0.75;
      if (
        streamingFrame === 1 ||
        streamingState.queue.length > 0 ||
        movedEnough ||
        streamingFrame % 4 === 1
      ) {
        lastStreamPx = cue.playerPos.x;
        lastStreamPz = cue.playerPos.z;
        lastStreamCamX = cameraState.posX;
        lastStreamCamZ = cameraState.posZ;
        stepStreamingController(
          streamingState,
          streamingSceneView,
          chunkManifest,
          cue,
          scene.worldStreaming,
          worldSaveState ?? undefined
        );
      }
    }
    const aiObstacleBoxes = objects
      .filter(
        (o) =>
          o.visible &&
          o.type === 'mesh_3d' &&
          o.source.mesh3d?.shape !== 'grass_field' &&
          o.source.mesh3d?.shape !== 'terrain' &&
          o.source.mesh3d?.shape !== 'water' &&
          o.source.mesh3d?.shape !== 'plane' &&
          (o.source.physics3d?.enabled ?? true) &&
          (o.source.physics3d?.bodyType ?? 'static') === 'static' &&
          !o.source.physics3d?.isTrigger
      )
      .map((s) => {
        const sw = getWorldT3(s);
        const he = getHalfExtents3D(s);
        const off = getColliderWorldOffset(sw, s.source.physics3d?.offset);
        return {
          id: s.id,
          minX: sw.x + off.x - he.x,
          maxX: sw.x + off.x + he.x,
          minY: sw.y + off.y - he.y,
          maxY: sw.y + off.y + he.y,
          minZ: sw.z + off.z - he.z,
          maxZ: sw.z + off.z + he.z,
        };
      });

    const hasAiLineOfSight = (
      ax: number,
      ay: number,
      az: number,
      bx: number,
      by: number,
      bz: number,
      ignoreIds: Set<string>
    ): boolean => {
      const dx = bx - ax;
      const dy = by - ay;
      const dz = bz - az;
      const dist = Math.hypot(dx, dy, dz);
      const steps = Math.max(2, Math.ceil(dist / 0.6));
      for (let i = 1; i < steps; i++) {
        const t = i / steps;
        const px = ax + dx * t;
        const py = ay + dy * t;
        const pz = az + dz * t;
        for (const box of aiObstacleBoxes) {
          if (ignoreIds.has(box.id)) continue;
          if (
            px >= box.minX &&
            px <= box.maxX &&
            py >= box.minY &&
            py <= box.maxY &&
            pz >= box.minZ &&
            pz <= box.maxZ
          ) {
            return false;
          }
        }
      }
      return true;
    };

    const probeColumn = (
      px: number,
      pz: number,
      footY: number,
      bodyH: number,
      radius: number,
      ignoreId: string
    ) => {
      let lowestWallMinY = Infinity;
      let highestObsMaxY = -Infinity;
      let tallWallBlocking = false;
      let vaultSillMaxY = -Infinity;

      for (const box of aiObstacleBoxes) {
        if (box.id === ignoreId) continue;
        if (px + radius < box.minX || px - radius > box.maxX) continue;
        if (pz + radius < box.minZ || pz - radius > box.maxZ) continue;
        if (box.maxY <= footY + 0.18 || box.minY >= footY + bodyH) continue;
        highestObsMaxY = Math.max(highestObsMaxY, box.maxY);
        lowestWallMinY = Math.min(lowestWallMinY, box.minY);
        if (box.minY <= footY + 0.9 && box.maxY - footY > 0.25) {
          vaultSillMaxY = Math.max(vaultSillMaxY, box.maxY);
        }
      }
      if (highestObsMaxY <= footY + 0.22) {
        return { blocked: false, canVault: false, tallWallBlocking: false };
      }
      // Verificar si encima del alféizar/obstáculo hay espacio para saltar (ej. ventana abierta o muro bajo)
      const clearanceNeeded = Math.max(0.95, bodyH * 0.72);
      const sillTop = vaultSillMaxY > -Infinity ? vaultSillMaxY : highestObsMaxY;
      let ceilingClear = true;
      for (const box of aiObstacleBoxes) {
        if (box.id === ignoreId) continue;
        if (px + radius < box.minX || px - radius > box.maxX) continue;
        if (pz + radius < box.minZ || pz - radius > box.maxZ) continue;
        if (box.maxY > sillTop + 0.05 && box.minY < sillTop + clearanceNeeded) {
          ceilingClear = false;
          tallWallBlocking = true;
          break;
        }
      }
      const canVault = vaultSillMaxY > -Infinity && ceilingClear;
      return {
        blocked: true,
        canVault,
        vaultHeight: canVault ? sillTop - footY : Infinity,
        tallWallBlocking: tallWallBlocking || !canVault,
      };
    };

    const steerSmartEnemy3D = (
      obj: Sim3DObjectState,
      targetObj: Sim3DObjectState,
      opts: {
        baseSpeed: number;
        detectRadius: number;
        stopDist: number;
        visionFovDeg: number;
        visionRange: number;
        requireLineOfSight: boolean;
        canJumpObstacles: boolean;
        maxJumpHeight: number;
        fleeHealthRatio: number;
        insistDamageRatio: number;
      }
    ): { active: boolean; fleeing: boolean; distToTarget: number } => {
      const myW = getWorldT3(obj);
      const tgW = getWorldT3(targetObj);
      const heObj = getHalfExtents3D(obj);
      const footY = myW.y - heObj.y;
      const bodyH = Math.max(1.2, heObj.y * 2);
      const bodyRad = Math.max(0.32, Math.min(0.8, Math.max(heObj.x, heObj.z) * 0.85));
      const dx = tgW.x - myW.x;
      const dz = tgW.z - myW.z;
      const dist = Math.hypot(dx, dz);

      const hpRatio = obj.maxHp > 0 ? obj.hp / obj.maxHp : 1;
      const targetHpRatio = targetObj.maxHp > 0 ? targetObj.hp / targetObj.maxHp : 1;
      const isFleeing = hpRatio <= opts.fleeHealthRatio;
      const isInsisting = !isFleeing && targetHpRatio <= opts.insistDamageRatio;

      // Comprobar cono de visión + memoria de alerta (4.5s) + oído de proximidad (3.2m)
      const range = Math.max(opts.detectRadius, opts.visionRange);
      const fwdRad = (obj.t3.ry * Math.PI) / 180;
      const fwdX = Math.sin(fwdRad);
      const fwdZ = Math.cos(fwdRad);
      const invD = dist > 0.001 ? 1 / dist : 1;
      const dot = (dx * invD) * fwdX + (dz * invD) * fwdZ;
      const cosHalfFov = Math.cos(((Math.min(360, opts.visionFovDeg) * 0.5) * Math.PI) / 180);
      const inCone = opts.visionFovDeg >= 359 || dot >= cosHalfFov || dist <= 3.2;
      const ignoreIds = new Set<string>([obj.id, targetObj.id]);
      const clearLos = !opts.requireLineOfSight || hasAiLineOfSight(
        myW.x,
        myW.y + 0.5,
        myW.z,
        tgW.x,
        tgW.y + 0.5,
        tgW.z,
        ignoreIds
      );
      const seesTarget = dist <= range && inCone && clearLos;
      if (seesTarget) {
        obj.alertTimer = 4.5;
        obj.lastKnownTarget = { x: tgW.x, y: tgW.y, z: tgW.z };
      }

      const alerted = seesTarget || (obj.alertTimer ?? 0) > 0 || isFleeing;
      if (!alerted || dist > range * 1.35) {
        obj.vx *= Math.max(0, 1 - 10 * dt);
        obj.vz *= Math.max(0, 1 - 10 * dt);
        return { active: false, fleeing: false, distToTarget: dist };
      }

      const effStop = isInsisting ? Math.max(0.45, opts.stopDist * 0.7) : opts.stopDist;
      const effSpeed = isFleeing
        ? opts.baseSpeed * 1.14
        : isInsisting
          ? opts.baseSpeed * 1.28
          : opts.baseSpeed;

      if (!isFleeing && seesTarget && dist <= effStop) {
        obj.vx *= Math.max(0, 1 - 12 * dt);
        obj.vz *= Math.max(0, 1 - 12 * dt);
        return { active: true, fleeing: false, distToTarget: dist };
      }

      // Objetivo espacial: huir del jugador o ir al jugador / última posición conocida (con NavMesh si existe)
      let goalX = isFleeing ? myW.x - dx : (seesTarget || !obj.lastKnownTarget ? tgW.x : obj.lastKnownTarget.x);
      let goalZ = isFleeing ? myW.z - dz : (seesTarget || !obj.lastKnownTarget ? tgW.z : obj.lastKnownTarget.z);

      if (!isFleeing && navMesh && !clearLos) {
        obj.navTimer -= dt;
        if (obj.navTimer <= 0 || obj.navPath.length === 0) {
          obj.navTimer = 0.3;
          obj.navPath = findNavMeshPath(navMesh, { x: myW.x, z: myW.z }, { x: goalX, z: goalZ });
        }
        while (obj.navPath.length > 1 && Math.hypot(obj.navPath[0].x - myW.x, obj.navPath[0].z - myW.z) < 0.85) {
          obj.navPath.shift();
        }
        if (obj.navPath.length > 0) {
          goalX = obj.navPath[0].x;
          goalZ = obj.navPath[0].z;
        }
      }

      const gdx = goalX - myW.x;
      const gdz = goalZ - myW.z;
      const gd = Math.hypot(gdx, gdz) || 1;
      let moveDirX = gdx / gd;
      let moveDirZ = gdz / gd;

      // Analizar columna al frente (1.25m y 2.2m) para diferenciar ventana/obstáculo saltable vs muro alto
      const probeNear = probeColumn(myW.x + moveDirX * 1.25, myW.z + moveDirZ * 1.25, footY, bodyH, bodyRad, obj.id);
      const probeMid = probeColumn(myW.x + moveDirX * 2.25, myW.z + moveDirZ * 2.25, footY, bodyH, bodyRad, obj.id);

      const canVaultNear =
        probeNear.canVault && (probeNear.vaultHeight ?? Infinity) <= opts.maxJumpHeight;
      const canVaultMid =
        probeMid.canVault && (probeMid.vaultHeight ?? Infinity) <= opts.maxJumpHeight;

      if ((canVaultNear || canVaultMid) && !probeNear.tallWallBlocking && !probeMid.tallWallBlocking) {
        if (opts.canJumpObstacles && obj.isGrounded) {
          obj.vy = Math.max(obj.vy, Math.min(11.5, 6.2 + opts.maxJumpHeight * 1.9));
          obj.isGrounded = false;
        }
      } else if (probeNear.blocked || probeMid.blocked) {
        // Muro alto adelante: JAMÁS saltar contra muro alto; buscar borde, puerta o ventana lateral en abanico
        const baseAngle = Math.atan2(moveDirX, moveDirZ);
        const offsetsDeg = [-32, 32, -62, 62, -90, 90, -120, 120, -150, 150];
        let bestScore = -Infinity;
        let bestX = moveDirX;
        let bestZ = moveDirZ;
        for (const deg of offsetsDeg) {
          const ang = baseAngle + (deg * Math.PI) / 180;
          const cx = Math.sin(ang);
          const cz = Math.cos(ang);
          const p1 = probeColumn(myW.x + cx * 1.35, myW.z + cz * 1.35, footY, bodyH, bodyRad, obj.id);
          const p2 = probeColumn(myW.x + cx * 2.7, myW.z + cz * 2.7, footY, bodyH, bodyRad, obj.id);
          const p3 = probeColumn(myW.x + cx * 4.2, myW.z + cz * 4.2, footY, bodyH, bodyRad, obj.id);
          const vaultOk =
            opts.canJumpObstacles &&
            ((p1.canVault && (p1.vaultHeight ?? 99) <= opts.maxJumpHeight) ||
              (p2.canVault && (p2.vaultHeight ?? 99) <= opts.maxJumpHeight));
          if (!p1.tallWallBlocking && !p2.tallWallBlocking) {
            const alignBonus = Math.cos((deg * Math.PI) / 180) * 2.2;
            const depthBonus = !p3.tallWallBlocking ? 1.5 : 0.4;
            const vaultBonus = vaultOk && !p1.blocked ? 0.8 : 0;
            const score = alignBonus + depthBonus + vaultBonus;
            if (score > bestScore) {
              bestScore = score;
              bestX = cx;
              bestZ = cz;
            }
          }
        }
        if (bestScore > -Infinity) {
          moveDirX = bestX;
          moveDirZ = bestZ;
          const chosenProbe = probeColumn(myW.x + moveDirX * 1.35, myW.z + moveDirZ * 1.35, footY, bodyH, bodyRad, obj.id);
          if (opts.canJumpObstacles && obj.isGrounded && chosenProbe.canVault && (chosenProbe.vaultHeight ?? 99) <= opts.maxJumpHeight) {
            obj.vy = Math.max(obj.vy, Math.min(11.5, 6.2 + opts.maxJumpHeight * 1.9));
            obj.isGrounded = false;
          }
        }
      }

      obj.vx = moveDirX * effSpeed;
      obj.vz = moveDirZ * effSpeed;
      const targetYaw = (Math.atan2(obj.vx, obj.vz) * 180) / Math.PI;
      obj.t3.ry = lerpAngleDeg(obj.t3.ry, targetYaw, Math.min(1, 10 * dt));
      return { active: true, fleeing: isFleeing, distToTarget: dist };
    };

    for (const obj of objects) {
      if (!obj.visible) continue;
      const actPolicy = obj.id === primaryPlayer?.id ? null : getObjectPolicy(obj.id);
      if (actPolicy && actPolicy.ai === 'saved') {
        continue;
      }
      if (obj._prevHp !== undefined && obj.hp < obj._prevHp) {
        obj.alertTimer = Math.max(obj.alertTimer ?? 0, 5.0);
      }
      obj._prevHp = obj.hp;
      if ((obj.alertTimer ?? 0) > 0) obj.alertTimer = Math.max(0, (obj.alertTimer ?? 0) - dt);
      if (obj.invulnTimer > 0) obj.invulnTimer = Math.max(0, obj.invulnTimer - dt);
      if ((obj.dashTimer ?? 0) > 0) obj.dashTimer = Math.max(0, (obj.dashTimer ?? 0) - dt);
      if ((obj.dashCooldownTimer ?? 0) > 0) obj.dashCooldownTimer = Math.max(0, (obj.dashCooldownTimer ?? 0) - dt);

      if (obj.type === 'light_3d' && obj.source.light3d) {
        const flick = (obj.source.components ?? []).find((c) => c.enabled && c.type === 'lighting.flicker');
        if (flick) {
          const spd = Number(flick.config.speed ?? 8);
          const amt = Number(flick.config.amount ?? 0.25);
          const l3 = obj.source.light3d as typeof obj.source.light3d & { __baseIntensity?: number };
          const baseInt = l3.__baseIntensity ?? l3.intensity;
          l3.__baseIntensity = baseInt;
          l3.intensity = Math.max(0.05, baseInt * (1 + Math.sin(elapsedTime * spd) * amt));
        }
      }

      for (const comp of obj.source.components ?? []) {
        if (!comp.enabled) continue;
        const compContexts = comp.contexts ?? getBehaviorEntry(comp.type)?.contexts ?? ['gameplay', 'open_world'];
        if (!compContexts.includes(sceneContext) && sceneContext !== 'open_world') continue;

        if (
          comp.type === 'player_3d' ||
          comp.type === 'player_platformer' ||
          comp.type === 'player_topdown' ||
          comp.type === 'movement.platformer_pro' ||
          comp.type === 'movement.topdown_8dir'
        ) {
          if (mountedActorId === obj.id && activeMountedVehicleId) {
            const mVeh = objById.get(activeMountedVehicleId);
            if (mVeh) {
              const vCfgM = mVeh.source.vehicle;
              const vKindM = vCfgM?.vehicleKind ?? 'car';
              const isSaddleM =
                vCfgM?.mountStyle === 'saddle' ||
                (!vCfgM?.mountStyle && (vKindM === 'moto' || vKindM === 'horse'));
              if (isSaddleM) {
                obj.visible = true;
                const pos = computeSaddleWorldPosition(
                  mVeh.t3,
                  mVeh.t3,
                  vCfgM?.seatOffset ?? { x: 0, y: vKindM === 'horse' ? 1.05 : 0.85, z: -0.1 }
                );
                obj.t3.x = pos.x;
                obj.t3.y = pos.y;
                obj.t3.z = pos.z;
                obj.t3.rx = mVeh.t3.rx;
                obj.t3.ry = mVeh.t3.ry;
                obj.t3.rz = mVeh.t3.rz;
              } else {
                obj.visible = false;
                obj.t3.x = mVeh.t3.x;
                obj.t3.y = mVeh.t3.y;
                obj.t3.z = mVeh.t3.z;
              }
              obj.vx = mVeh.vx;
              obj.vy = mVeh.vy;
              obj.vz = mVeh.vz;
            }
            continue;
          }
          const rawSpeed = Number(comp.config.speed ?? comp.config.maxSpeed ?? 6.5);
          const baseSpeed = rawSpeed > 35 ? rawSpeed / 35 : rawSpeed;
          const sprintKey = String(comp.config.sprintKey ?? 'ShiftLeft');
          const sprintMult =
            comp.type === 'movement.topdown_8dir' && activeHeldKeys.has(sprintKey)
              ? Number(comp.config.sprintMultiplier ?? 1.6)
              : 1;
          const speed = baseSpeed * sprintMult;
          const rawJump = Number(comp.config.jumpForce ?? 8.5);
          const jumpForce = rawJump > 40 ? rawJump / 55 : rawJump;
          const maxJumps = Math.max(1, Math.round(Number(comp.config.maxJumps ?? 1)));

          let moveX = 0;
          let moveZ = 0;
          if (activeHeldKeys.has('KeyA') || activeHeldKeys.has('ArrowLeft')) moveX -= 1;
          if (activeHeldKeys.has('KeyD') || activeHeldKeys.has('ArrowRight')) moveX += 1;
          if (activeHeldKeys.has('KeyW') || activeHeldKeys.has('ArrowUp')) moveZ -= 1;
          if (activeHeldKeys.has('KeyS') || activeHeldKeys.has('ArrowDown')) moveZ += 1;
          if (moveX === 0 && moveZ === 0 && (Math.abs(activeMoveAxisX) > 0.05 || Math.abs(activeMoveAxisY) > 0.05)) {
            moveX = activeMoveAxisX;
            moveZ = activeMoveAxisY;
          }

          if (
            comp.type === 'movement.platformer_pro' &&
            comp.config.dashEnabled &&
            activeJustPressedKeys.has(String(comp.config.dashKey ?? 'ShiftLeft')) &&
            (obj.dashCooldownTimer ?? 0) <= 0
          ) {
            obj.dashTimer = Number(comp.config.dashDuration ?? 0.16);
            obj.dashCooldownTimer = Number(comp.config.dashCooldown ?? 0.5);
          }

          const len = Math.hypot(moveX, moveZ);
          if ((obj.dashTimer ?? 0) > 0) {
            const rawDash = Number(comp.config.dashSpeed ?? 640);
            const dSpd = rawDash > 35 ? rawDash / 35 : rawDash;
            const yawRad = (obj.t3.ry * Math.PI) / 180;
            obj.vx = Math.sin(yawRad) * dSpd;
            obj.vz = Math.cos(yawRad) * dSpd;
          } else if (len > 0.02) {
            const fwd = getCameraForwardXZ(cameraState);
            const right = getCameraRightXZ(cameraState);
            const mag = Math.min(1, len);
            const nx = moveX / len;
            const nz = moveZ / len;
            const worldDirX = nx * right.x - nz * fwd.x;
            const worldDirZ = nx * right.z - nz * fwd.z;
            obj.vx = worldDirX * speed * mag;
            obj.vz = worldDirZ * speed * mag;
            if (comp.config.rotateToMovement !== false) {
              const targetYaw = (Math.atan2(worldDirX, worldDirZ) * 180) / Math.PI;
              obj.t3.ry = lerpAngleDeg(obj.t3.ry, targetYaw, Math.min(1, 14 * dt));
            }
          } else {
            obj.vx *= Math.max(0, 1 - 12 * dt);
            obj.vz *= Math.max(0, 1 - 12 * dt);
          }

          if (obj.isGrounded) {
            obj.coyoteTimer = 0.12;
            obj.jumpsUsed = 0;
          } else {
            obj.coyoteTimer = Math.max(0, obj.coyoteTimer - dt);
          }
          if (activeJustPressedKeys.has('Space')) obj.jumpBufferTimer = 0.14;
          else obj.jumpBufferTimer = Math.max(0, obj.jumpBufferTimer - dt);

          const canCoyoteJump = obj.jumpBufferTimer > 0 && obj.coyoteTimer > 0;
          const canAirJump =
            obj.jumpBufferTimer > 0 &&
            maxJumps > 1 &&
            (obj.jumpsUsed ?? 0) < maxJumps;

          if (canCoyoteJump || canAirJump) {
            obj.vy = jumpForce;
            obj.isGrounded = false;
            obj.coyoteTimer = 0;
            obj.jumpBufferTimer = 0;
            obj.jumpsUsed = (obj.jumpsUsed ?? 0) + 1;
            const jmpSnd = String(comp.config.jumpSoundAssetId ?? '');
            audioHooks?.playSfx?.(jmpSnd || 'jump', 0.8);
          }
        } else if (comp.type === 'chase_player' || comp.type === 'ai.enemy_chaser') {
          if (actPolicy && actPolicy.aiStride > 1 && streamingFrame % actPolicy.aiStride !== 0) {
            continue;
          }
          const targetObj =
            (comp.config.targetObjectId ? resolveObjectRef(String(comp.config.targetObjectId)) : null) ??
            (primaryPlayer && primaryPlayer.id !== obj.id ? primaryPlayer : null);
          if (targetObj && targetObj.visible) {
            const rawSpd = Number(comp.config.speed ?? 3.8);
            const chSpd = rawSpd > 25 ? rawSpd / 35 : rawSpd;
            const rawRad = Number(comp.config.detectRadius ?? 28);
            const chRad = rawRad > 60 ? rawRad / 16 : rawRad;
            const rawStop = Number(comp.config.stopDistance ?? 1.1);
            const chStop = rawStop > 10 ? rawStop / 25 : rawStop;
            const aiCfg = obj.source.aiAgent;
            const rawCone = Number(comp.config.visionFovDeg ?? aiCfg?.visionFovDeg ?? 360);
            const useCone3d =
              comp.config.requireVisionCone === true ||
              (comp.config.visionFovDeg !== undefined && rawCone < 359) ||
              (Boolean(aiCfg?.enabled) && rawCone < 359);

            const aiRes = steerSmartEnemy3D(obj, targetObj, {
              baseSpeed: chSpd,
              detectRadius: chRad,
              stopDist: chStop,
              visionFovDeg: useCone3d ? Math.min(359, Math.max(10, Number(comp.config.visionFovDeg ?? aiCfg?.visionFovDeg ?? 130))) : 360,
              visionRange: Number(comp.config.visionRange ?? aiCfg?.visionRange ?? chRad),
              requireLineOfSight: comp.config.requireLineOfSight === true || (Boolean(aiCfg?.enabled) && aiCfg?.requireLineOfSight !== false),
              canJumpObstacles: comp.config.canJumpObstacles !== false && (aiCfg?.canJumpObstacles !== false),
              maxJumpHeight: Number(comp.config.maxJumpHeight ?? aiCfg?.maxJumpHeight ?? 2.1),
              fleeHealthRatio: Number(comp.config.fleeHealthRatio ?? aiCfg?.fleeHealthRatio ?? 0.28),
              insistDamageRatio: Number(comp.config.insistDamageRatio ?? aiCfg?.insistDamageRatio ?? 0.45),
            });

            if (comp.type === 'ai.enemy_chaser' && !aiRes.fleeing && aiRes.distToTarget <= chStop + 0.65) {
              const dmg = Number(comp.config.contactDamage ?? 15);
              if (dmg > 0 && targetObj.invulnTimer <= 0) {
                targetObj.invulnTimer = 0.85;
                targetObj.hp = Math.max(0, targetObj.hp - dmg);
                const curSalud = Number(variables.get('salud') ?? 100);
                variables.set('salud', Math.max(0, curSalud - dmg));
                audioHooks?.playSfx?.('hit', 0.75);
                queuedEvents.push('player_hit');
              }
            }
          }
        } else if (comp.type === 'patrol') {
          const rawDist = Number(comp.config.distance ?? 4);
          const patDist = rawDist > 25 ? rawDist / 25 : rawDist;
          const rawSpd = Number(comp.config.speed ?? 2.8);
          const patSpd = rawSpd > 25 ? rawSpd / 35 : rawSpd;
          const axis = String(comp.config.axis ?? 'x').toLowerCase();
          const omega = patDist > 0.05 ? patSpd / patDist : 1;
          obj.patrolPhase += omega * dt;
          const dirSign = Math.cos(obj.patrolPhase);
          const targetOffset = Math.sin(obj.patrolPhase) * patDist;
          if (axis === 'y' || axis === 'z') {
            const desiredZ = obj.originT3.z + targetOffset;
            obj.vz = (desiredZ - obj.t3.z) / Math.max(0.001, dt);
            obj.t3.z = desiredZ;
            obj.vx = 0;
            obj.t3.ry = dirSign >= 0 ? 0 : 180;
          } else {
            const desiredX = obj.originT3.x + targetOffset;
            obj.vx = (desiredX - obj.t3.x) / Math.max(0.001, dt);
            obj.t3.x = desiredX;
            obj.vz = 0;
            obj.t3.ry = dirSign >= 0 ? 90 : -90;
          }
        } else if (comp.type === 'movement.path_waypoints') {
          const rawWps = String(comp.config.waypoints ?? '0,0; 6,0; 6,6; 0,6')
            .split(';')
            .map((part) => {
              const [sx, sz] = part.trim().split(',').map(Number);
              if (!Number.isFinite(sx) || !Number.isFinite(sz)) return null;
              return {
                x: Math.abs(sx) > 40 ? sx / 25 : sx,
                z: Math.abs(sz) > 40 ? sz / 25 : sz,
              };
            })
            .filter((p): p is { x: number; z: number } => p !== null);
          if (rawWps.length > 0) {
            const idx = Math.max(0, Math.min(rawWps.length - 1, obj.waypointIndex));
            const wp = rawWps[idx];
            const rawSpd = Number(comp.config.speed ?? 3.5);
            const wpSpd = rawSpd > 25 ? rawSpd / 35 : rawSpd;
            const dx = wp.x - obj.t3.x;
            const dz = wp.z - obj.t3.z;
            const dist = Math.hypot(dx, dz);
            if (dist <= Math.max(0.15, wpSpd * dt * 1.5)) {
              obj.vx = 0;
              obj.vz = 0;
              if (comp.config.pingPong) {
                if (obj.waypointForward) {
                  if (idx + 1 >= rawWps.length) {
                    obj.waypointForward = false;
                    obj.waypointIndex = Math.max(0, idx - 1);
                  } else {
                    obj.waypointIndex = idx + 1;
                  }
                } else {
                  if (idx - 1 < 0) {
                    obj.waypointForward = true;
                    obj.waypointIndex = Math.min(rawWps.length - 1, idx + 1);
                  } else {
                    obj.waypointIndex = idx - 1;
                  }
                }
              } else {
                obj.waypointIndex = (idx + 1) % rawWps.length;
              }
            } else {
              obj.vx = (dx / dist) * wpSpd;
              obj.vz = (dz / dist) * wpSpd;
              obj.t3.x += obj.vx * dt;
              obj.t3.z += obj.vz * dt;
              if (comp.config.rotateToPath !== false) {
                const targetYaw = (Math.atan2(obj.vx, obj.vz) * 180) / Math.PI;
                obj.t3.ry = lerpAngleDeg(obj.t3.ry, targetYaw, Math.min(1, 10 * dt));
              }
            }
          }
        } else if (comp.type === 'spin') {
          obj.t3.ry += Number(comp.config.degPerSec ?? 90) * dt;
        } else if (comp.type === 'movement.sine_float') {
          const rawAmp = Number(comp.config.amplitude ?? 0.35);
          const amp = rawAmp > 5 ? rawAmp / 40 : rawAmp;
          const freq = Number(comp.config.frequency ?? 1.2);
          const axis = String(comp.config.axis ?? 'y');
          const off = Math.sin(elapsedTime * freq * Math.PI * 2) * amp;
          if (axis === 'x') obj.t3.x = obj.originT3.x + off;
          else obj.t3.y = obj.originT3.y + off;
        } else if (comp.type === 'movement.constant_velocity') {
          const rvx = Number(comp.config.vx ?? 0);
          const rvy = Number(comp.config.vy ?? 0);
          obj.vx = Math.abs(rvx) > 30 ? rvx / 35 : rvx;
          obj.vz = Math.abs(rvy) > 30 ? rvy / 35 : rvy;
          if (!(obj.source.physics3d?.enabled && obj.source.physics3d.bodyType === 'dynamic')) {
            obj.t3.x += obj.vx * dt;
            obj.t3.z += obj.vz * dt;
          }
        } else if (comp.type === 'world.resource_node') {
          const respawnKey = `res3d:${obj.id}`;
          const respawnRem = behaviorTimers.get(respawnKey) ?? 0;
          if (respawnRem > 0) {
            const nextRem = Math.max(0, respawnRem - dt);
            behaviorTimers.set(respawnKey, nextRem);
            if (nextRem <= 0) obj.visible = true;
          } else if (primaryPlayer && primaryPlayer.id !== obj.id) {
            const rawRad = Number(comp.config.interactRadius ?? 2.2);
            const r = rawRad > 12 ? rawRad / 25 : rawRad;
            const d = Math.hypot(primaryPlayer.t3.x - obj.t3.x, primaryPlayer.t3.z - obj.t3.z);
            const autoPickup = comp.config.autoPickup !== false;
            const triggered = d <= r && (autoPickup || activeJustPressedKeys.has('KeyE'));
            if (triggered) {
              const itemId = String(comp.config.itemId ?? 'crystal');
              const amount = Math.max(1, Math.round(Number(comp.config.amount ?? 1)));
              const actionId = `node3d_${obj.id}_${Math.floor(elapsedTime * 10)}`;
              const res = wiringSys.persistence.addItem(itemId, amount, actionId);
              if (res.accepted) {
                variables.set(`inv_${itemId}`, Number(variables.get(`inv_${itemId}`) ?? 0) + amount);
                variables.set('puntos', Number(variables.get('puntos') ?? 0) + amount * 10);
                audioHooks?.playSfx?.('coin', 0.8);
                emitWiredSignal3D(obj.id, comp.type, 'onCollected', {
                  itemId,
                  amount,
                  playerId: primaryPlayer.id,
                  actionId,
                });
                const respawnSec = Number(comp.config.respawnSec ?? 20);
                if (respawnSec > 0) {
                  obj.visible = false;
                  behaviorTimers.set(respawnKey, respawnSec);
                } else {
                  obj.visible = false;
                }
              }
            }
          }
        } else if (comp.type === 'tool.fishing_rod') {
          const castKey = String(comp.config.castKey ?? 'KeyF');
          const castCd = `rod3d_cd:${comp.id}`;
          const rem = behaviorTimers.get(castCd) ?? 0;
          if (rem > 0) {
            const nextRem = Math.max(0, rem - dt);
            behaviorTimers.set(castCd, nextRem);
            if (nextRem <= 0) {
              const pool = String(comp.config.fishPool ?? 'trucha,salmon,pez_dorado')
                .split(',')
                .map((s) => s.trim())
                .filter(Boolean);
              const fish = pool[Math.floor(Math.random() * Math.max(1, pool.length))] ?? 'trucha';
              const actionId = `fish3d_${comp.id}_${Math.floor(elapsedTime * 100)}`;
              wiringSys.persistence.addItem(fish, 1, actionId);
              variables.set(`inv_${fish}`, Number(variables.get(`inv_${fish}`) ?? 0) + 1);
              activeToasts.push({ id: actionId, text: `¡Pescaste: ${fish}!`, remaining: 2.2 });
              audioHooks?.playSfx?.('coin', 0.85);
              emitWiredSignal3D(obj.id, comp.type, 'onFishCaught', { itemId: fish, amount: 1, actionId });
            }
          } else if (activeJustPressedKeys.has(castKey)) {
            behaviorTimers.set(castCd, Math.max(0.4, Number(comp.config.biteTimeSec ?? 1.8)));
            activeToasts.push({ id: `cast_${elapsedTime}`, text: 'Lanzando caña...', remaining: 1.5 });
          }
        } else if (comp.type === 'tool.capture_net') {
          const swingKey = String(comp.config.swingKey ?? 'KeyG');
          const cdKey = `net3d_cd:${comp.id}`;
          const cd = Math.max(0, (behaviorTimers.get(cdKey) ?? 0) - dt);
          behaviorTimers.set(cdKey, cd);
          if (cd <= 0 && activeJustPressedKeys.has(swingKey)) {
            behaviorTimers.set(cdKey, Math.max(0.25, Number(comp.config.cooldownSec ?? 1.0)));
            const rawR = Number(comp.config.radius ?? 4.5);
            const r = rawR > 15 ? rawR / 25 : rawR;
            const maxT = Math.max(1, Math.round(Number(comp.config.maxTargets ?? 5)));
            const captured: Array<{ itemId: string; amount: number; actionId: string }> = [];
            for (const cand of objects) {
              if (!cand.visible || cand.id === obj.id || captured.length >= maxT) continue;
              const nodeComp = (cand.source.components ?? []).find(
                (c) => c.enabled && c.type === 'world.resource_node'
              );
              if (!nodeComp) continue;
              if (Math.hypot(cand.t3.x - obj.t3.x, cand.t3.z - obj.t3.z) <= r) {
                const itemId = String(nodeComp.config.itemId ?? 'crystal');
                const amount = Math.max(1, Math.round(Number(nodeComp.config.amount ?? 1)));
                const actionId = `net3d_${cand.id}_${Math.floor(elapsedTime * 100)}`;
                wiringSys.persistence.addItem(itemId, amount, actionId);
                variables.set(`inv_${itemId}`, Number(variables.get(`inv_${itemId}`) ?? 0) + amount);
                captured.push({ itemId, amount, actionId });
                cand.visible = false;
              }
            }
            if (captured.length > 0) {
              activeToasts.push({ id: `net_${elapsedTime}`, text: `Red capturó ${captured.length} objetos`, remaining: 2 });
              emitWiredSignal3D(obj.id, comp.type, 'onBatchCaptured', { items: captured });
            }
          }
        } else if (comp.type === 'tool.harvest') {
          const swingKey = String(comp.config.swingKey ?? 'KeyE');
          const cdKey = `harv3d_cd:${comp.id}`;
          const cd = Math.max(0, (behaviorTimers.get(cdKey) ?? 0) - dt);
          behaviorTimers.set(cdKey, cd);
          if (cd <= 0 && activeJustPressedKeys.has(swingKey)) {
            behaviorTimers.set(cdKey, Math.max(0.2, Number(comp.config.cooldownSec ?? 0.45)));
            const rawR = Number(comp.config.range ?? 3.5);
            const r = rawR > 12 ? rawR / 25 : rawR;
            for (const cand of objects) {
              if (!cand.visible || cand.id === obj.id) continue;
              const isHarvestable = (cand.source.components ?? []).some(
                (c) => c.enabled && (c.type === 'world.resource_node' || c.type === 'world.crop_farm')
              );
              if (isHarvestable && Math.hypot(cand.t3.x - obj.t3.x, cand.t3.z - obj.t3.z) <= r) {
                const itemId = String(cand.source.components.find((c) => c.config?.itemId)?.config.itemId ?? 'recurso');
                const actionId = `harv3d_${cand.id}_${Math.floor(elapsedTime * 100)}`;
                wiringSys.persistence.addItem(itemId, 1, actionId);
                variables.set(`inv_${itemId}`, Number(variables.get(`inv_${itemId}`) ?? 0) + 1);
                cand.visible = false;
                audioHooks?.playSfx?.('hit', 0.65);
                emitWiredSignal3D(obj.id, comp.type, 'onHarvested', { itemId, amount: 1, actionId });
                break;
              }
            }
          }
        } else if (comp.type === 'physics.water_buoyancy') {
          const waterY = Number(comp.config.waterLevel ?? 0);
          const buoyancy = Number(comp.config.buoyancy ?? 14);
          if (obj.t3.y <= waterY) {
            obj.vy += (waterY - obj.t3.y) * buoyancy * dt;
            obj.vy *= Math.max(0, 1 - 4 * dt);
            obj.t3.y += obj.vy * dt;
          }
        } else if (comp.type === 'vehicle.watercraft' || comp.type === 'vehicle.mount') {
          const boardKey = String(comp.config.boardKey ?? 'KeyE');
          const boardStateKey = `boarded3d:${obj.id}`;
          const isBoarded = (behaviorTimers.get(boardStateKey) ?? 0) === 1;
          if (primaryPlayer && primaryPlayer.id !== obj.id) {
            const d = Math.hypot(primaryPlayer.t3.x - obj.t3.x, primaryPlayer.t3.z - obj.t3.z);
            if (activeJustPressedKeys.has(boardKey) && (isBoarded || d <= 3.5)) {
              const nextBoarded = !isBoarded;
              behaviorTimers.set(boardStateKey, nextBoarded ? 1 : 0);
              emitWiredSignal3D(
                obj.id,
                comp.type,
                comp.type === 'vehicle.watercraft' ? 'onBoardStateChanged' : 'onMounted',
                { boarded: nextBoarded, targetId: nextBoarded ? obj.id : primaryPlayer.id }
              );
            }
            if (isBoarded) {
              const spd = Math.min(18, Math.max(3, Number(comp.config.maxSpeed ?? 9)));
              let mx = 0;
              let mz = 0;
              if (activeHeldKeys.has('KeyW') || activeHeldKeys.has('ArrowUp')) mz -= 1;
              if (activeHeldKeys.has('KeyS') || activeHeldKeys.has('ArrowDown')) mz += 1;
              if (activeHeldKeys.has('KeyA') || activeHeldKeys.has('ArrowLeft')) mx -= 1;
              if (activeHeldKeys.has('KeyD') || activeHeldKeys.has('ArrowRight')) mx += 1;
              const len = Math.hypot(mx, mz);
              if (len > 0) {
                obj.vx = (mx / len) * spd;
                obj.vz = (mz / len) * spd;
                obj.t3.x += obj.vx * dt;
                obj.t3.z += obj.vz * dt;
                obj.t3.ry = (Math.atan2(obj.vx, obj.vz) * 180) / Math.PI;
              }
              primaryPlayer.t3.x = obj.t3.x;
              primaryPlayer.t3.y = obj.t3.y + 0.6;
              primaryPlayer.t3.z = obj.t3.z;
            }
          }
        } else if (comp.type === 'survival.vitals') {
          const hungerDrain = Number(comp.config.hungerDrainPerMin ?? 3) / 60;
          const thirstDrain = Number(comp.config.thirstDrainPerMin ?? 4) / 60;
          const hunger = Math.max(0, Number(variables.get('hambre') ?? 100) - hungerDrain * dt);
          const thirst = Math.max(0, Number(variables.get('sed') ?? 100) - thirstDrain * dt);
          variables.set('hambre', Number(hunger.toFixed(4)));
          variables.set('sed', Number(thirst.toFixed(4)));
          if (hunger <= 0 || thirst <= 0) {
            obj.hp = Math.max(0, obj.hp - 2 * dt);
            variables.set('salud', Math.round(obj.hp));
          }
        } else if (comp.type === 'world.day_night_weather') {
          const cycleSec = Math.max(10, Number(comp.config.cycleSeconds ?? 120));
          const tod = ((elapsedTime % cycleSec) / cycleSec) * 24;
          sunOverride.timeOfDay = Number(tod.toFixed(2));
          variables.set('hora_dia', sunOverride.timeOfDay);
        } else if (comp.type === 'world.crop_farm') {
          const growKey = `crop3d:${obj.id}`;
          const growSec = Math.max(1, Number(comp.config.growthTimeSec ?? 12));
          const cur = Math.min(growSec, (behaviorTimers.get(growKey) ?? 0) + dt);
          behaviorTimers.set(growKey, cur);
          const frac = cur / growSec;
          obj.t3.sy = Math.max(0.25, 0.4 + 0.6 * frac);
          if (frac >= 1 && primaryPlayer && activeJustPressedKeys.has('KeyE')) {
            if (Math.hypot(primaryPlayer.t3.x - obj.t3.x, primaryPlayer.t3.z - obj.t3.z) <= 3.2) {
              const itemId = String(comp.config.harvestItem ?? 'trigo');
              const actionId = `crop3d_${obj.id}_${Math.floor(elapsedTime * 10)}`;
              wiringSys.persistence.addItem(itemId, 1, actionId);
              variables.set(`inv_${itemId}`, Number(variables.get(`inv_${itemId}`) ?? 0) + 1);
              behaviorTimers.set(growKey, 0);
              emitWiredSignal3D(obj.id, comp.type, 'onHarvested', { itemId, amount: 1, actionId });
            }
          }
        } else if (comp.type === 'world.fire_status') {
          const rawR = Number(comp.config.radius ?? 2.2);
          const r = rawR > 12 ? rawR / 25 : rawR;
          const dps = Math.max(0, Number(comp.config.damagePerSec ?? 8));
          for (const cand of objects) {
            if (!cand.visible || cand.id === obj.id) continue;
            if (Math.hypot(cand.t3.x - obj.t3.x, cand.t3.z - obj.t3.z) <= r) {
              cand.hp = Math.max(0, cand.hp - dps * dt);
              if (cand.id === primaryPlayer?.id) {
                variables.set('salud', Math.round(cand.hp));
              }
            }
          }
        } else if (comp.type === 'rpg.loot_drop') {
          const doneKey = `loot3d:${comp.id}`;
          if (obj.hp <= 0 && !behaviorTimers.has(doneKey)) {
            behaviorTimers.set(doneKey, 1);
            const itemId = String(comp.config.itemId ?? 'gold_coin');
            const amount = Math.max(1, Math.round(Number(comp.config.minAmount ?? 1)));
            const actionId = `loot3d_${obj.id}_${Math.floor(elapsedTime * 10)}`;
            wiringSys.persistence.addItem(itemId, amount, actionId);
            variables.set(`inv_${itemId}`, Number(variables.get(`inv_${itemId}`) ?? 0) + amount);
            emitWiredSignal3D(obj.id, comp.type, 'onLootDropped', { itemId, amount, actionId });
          }
        } else if (comp.type === 'rpg.quest_giver') {
          const doneKey = `quest3d:${comp.id}`;
          if (!behaviorTimers.has(doneKey) && primaryPlayer) {
            if (Math.hypot(primaryPlayer.t3.x - obj.t3.x, primaryPlayer.t3.z - obj.t3.z) <= 3.5) {
              const targetItem = String(comp.config.targetItem ?? 'crystal');
              const req = Math.max(1, Math.round(Number(comp.config.requiredAmount ?? 3)));
              const have = Number(variables.get(`inv_${targetItem}`) ?? 0);
              if (have >= req) {
                behaviorTimers.set(doneKey, 1);
                const reward = Number(comp.config.rewardPoints ?? 100);
                variables.set('puntos', Number(variables.get('puntos') ?? 0) + reward);
                activeToasts.push({ id: doneKey, text: `Misión completada (+${reward} pts)`, remaining: 3 });
                audioHooks?.playSfx?.('win', 0.9);
                emitWiredSignal3D(obj.id, comp.type, 'onQuestCompleted', {
                  questId: String(comp.config.questId ?? 'quest'),
                  rewardPoints: reward,
                });
              }
            }
          }
        } else if (comp.type === 'rpg.shop_vendor') {
          const buyKey = String(comp.config.buyKey ?? 'KeyE');
          if (activeJustPressedKeys.has(buyKey) && primaryPlayer) {
            if (Math.hypot(primaryPlayer.t3.x - obj.t3.x, primaryPlayer.t3.z - obj.t3.z) <= 3.5) {
              const price = Math.max(1, Number(comp.config.price ?? 25));
              const itemId = String(comp.config.itemId ?? 'potion');
              const pts = Number(variables.get('puntos') ?? 0);
              if (pts >= price) {
                variables.set('puntos', pts - price);
                variables.set(`inv_${itemId}`, Number(variables.get(`inv_${itemId}`) ?? 0) + 1);
                audioHooks?.playSfx?.('coin', 0.85);
                emitWiredSignal3D(obj.id, comp.type, 'onPurchased', { itemId, price });
              }
            }
          }
        } else if (comp.type === 'ai.stealth_sensor') {
          const rawR = Number(comp.config.visionRange ?? 9);
          const vRange = rawR > 30 ? rawR / 25 : rawR;
          if (primaryPlayer && Math.hypot(primaryPlayer.t3.x - obj.t3.x, primaryPlayer.t3.z - obj.t3.z) <= vRange) {
            const cdKey = `stealth3d:${comp.id}`;
            const rem = Math.max(0, (behaviorTimers.get(cdKey) ?? 0) - dt);
            if (rem <= 0) {
              behaviorTimers.set(cdKey, 1.5);
              queuedEvents.push('player_spotted');
              emitWiredSignal3D(obj.id, comp.type, 'onPlayerSpotted', { detectorId: obj.id });
            } else {
              behaviorTimers.set(cdKey, rem);
            }
          }
        } else if (comp.type === 'ui.menu_nav') {
          const targetSceneId = String(comp.config.targetSceneId ?? '');
          if (activeJustPressedKeys.has('Enter') && targetSceneId) {
            sceneHooks?.loadScene?.(targetSceneId);
            emitWiredSignal3D(obj.id, comp.type, 'onMenuSelected', { targetSceneId });
          }
        } else if (comp.type === 'persistence.player_save') {
          const accKey = `psave3d:${comp.id}`;
          const interval = Math.max(3, Number(comp.config.autoSaveSec ?? 15));
          const acc = (behaviorTimers.get(accKey) ?? 0) + dt;
          if (acc >= interval) {
            behaviorTimers.set(accKey, 0);
            wiringSys.persistence.saveLocal();
          } else {
            behaviorTimers.set(accKey, acc);
          }
        } else if (comp.type === 'combat.projectile_spawner') {
          const fireKey = String(comp.config.fireKey ?? 'KeyF');
          const cdKey = `proj3d_cd:${comp.id}`;
          const cd = Math.max(0, (behaviorTimers.get(cdKey) ?? 0) - dt);
          behaviorTimers.set(cdKey, cd);
          const wantsFire = comp.config.autoFire
            ? true
            : activeHeldKeys.has(fireKey) || activeJustPressedKeys.has(fireKey);
          if (wantsFire && cd <= 0) {
            const fireRate = Math.max(0.1, Number(comp.config.cooldownSec ?? 0.35));
            behaviorTimers.set(cdKey, fireRate);
            const yawRad = (obj.t3.ry * Math.PI) / 180;
            const dirX = Math.sin(yawRad);
            const dirZ = Math.cos(yawRad);
            const speed = Number(comp.config.speed ?? 18);
            const spd3d = speed > 40 ? speed / 25 : speed;
            const dmg = Math.max(1, Number(comp.config.damage ?? 25));
            const pObj = createApi(dt).spawn.primitive('sphere', {
              name: `Proj_${obj.name}`,
              x: obj.t3.x + dirX * 1.1,
              y: obj.t3.y + 0.7,
              z: obj.t3.z + dirZ * 1.1,
              sx: 0.35,
              sy: 0.35,
              sz: 0.35,
              color: String(comp.config.color ?? '#facc15'),
              physics: false,
            });
            const rawProj = pObj ? objById.get(pObj.id) : null;
            if (rawProj) {
              rawProj.vx = dirX * spd3d;
              rawProj.vz = dirZ * spd3d;
              rawProj.layer = 'Projectile';
              rawProj.source.components.push({
                id: `proj3d_${Date.now()}_${spawnCounter}`,
                type: 'projectile_3d',
                enabled: true,
                config: {
                  ownerId: obj.id,
                  damage: dmg,
                  lifetimeSec: Number(comp.config.lifetimeSec ?? 2.2),
                  isEnemy: obj.layer === 'Enemy',
                },
              });
            }
            audioHooks?.playSfx?.(String(comp.config.soundAssetId ?? 'powerup'), 0.7, {
              x: obj.t3.x,
              y: obj.t3.y,
              z: obj.t3.z,
            });
          }
        } else if (comp.type === 'combat.melee_attack') {
          const atkKey = String(comp.config.attackKey ?? 'KeyJ');
          const cdKey = `melee3d_cd:${comp.id}`;
          const cd = Math.max(0, (behaviorTimers.get(cdKey) ?? 0) - dt);
          behaviorTimers.set(cdKey, cd);
          if ((activeJustPressedKeys.has(atkKey) || activeJustPressedKeys.has('KeyE')) && cd <= 0) {
            behaviorTimers.set(cdKey, Math.max(0.15, Number(comp.config.cooldownSec ?? 0.45)));
            const rawReach = Number(comp.config.range ?? 3.0);
            const reach = rawReach > 15 ? rawReach / 25 : rawReach;
            const dmg = Math.max(1, Number(comp.config.damage ?? 30));
            const knock = Number(comp.config.knockback ?? 6);
            const yawRad = (obj.t3.ry * Math.PI) / 180;
            const hx = obj.t3.x + Math.sin(yawRad) * (reach * 0.5);
            const hz = obj.t3.z + Math.cos(yawRad) * (reach * 0.5);
            for (const cand of objects) {
              if (!cand.visible || cand.id === obj.id) continue;
              const isEnemyOrDamagable =
                cand.layer === 'Enemy' ||
                cand.tags.some((t) => t.toLowerCase() === 'enemy' || t.toLowerCase() === 'enemigo') ||
                (cand.source.components ?? []).some((c) => c.enabled && (c.type === 'health' || c.type === 'combat.health_system'));
              if (!isEnemyOrDamagable) continue;
              const d = Math.hypot(cand.t3.x - hx, cand.t3.z - hz);
              if (d <= reach) {
                cand.hp = Math.max(0, cand.hp - dmg);
                const kDirX = cand.t3.x - obj.t3.x;
                const kDirZ = cand.t3.z - obj.t3.z;
                const kLen = Math.hypot(kDirX, kDirZ) || 1;
                cand.vx += (kDirX / kLen) * knock;
                cand.vz += (kDirZ / kLen) * knock;
                cand.vy = Math.max(cand.vy, 3.2);
                particlePool.burst(cand.id, cand.t3.x, cand.t3.y + 0.6, cand.t3.z, 10, {
                  ...getParticlePresetDefaults('sparks'),
                  enabled: true,
                  preset: 'sparks',
                  rate: 20,
                  maxParticles: 60,
                  speedMin: 2,
                  speedMax: 6,
                  angleDeg: -90,
                  spreadDeg: 180,
                  gravity: 10,
                  sizeStart: 0.28,
                  sizeEnd: 0.05,
                  lifetime: 0.35,
                  colorStart: '#fde047',
                  colorEnd: '#ef4444',
                  blendAlpha: 0.9,
                }, true);
                if (cand.hp <= 0) cand.visible = false;
              }
            }
            audioHooks?.playSfx?.('hit', 0.85, { x: obj.t3.x, y: obj.t3.y, z: obj.t3.z });
          }
        } else if (comp.type === 'combat.homing_missile') {
          const targetTag = String(comp.config.targetTag ?? 'Enemy');
          const spd = Number(comp.config.speed ?? 12);
          const turnRate = Number(comp.config.turnSpeed ?? 5.5);
          const nearest = objects
            .filter((o) => o.visible && o.id !== obj.id && (o.layer === targetTag || o.tags.includes(targetTag)))
            .sort((a, b) => Math.hypot(a.t3.x - obj.t3.x, a.t3.z - obj.t3.z) - Math.hypot(b.t3.x - obj.t3.x, b.t3.z - obj.t3.z))[0];
          if (nearest) {
            const dx = nearest.t3.x - obj.t3.x;
            const dy = nearest.t3.y + 0.5 - obj.t3.y;
            const dz = nearest.t3.z - obj.t3.z;
            const dLen = Math.hypot(dx, dy, dz) || 1;
            const tx = (dx / dLen) * spd;
            const ty = (dy / dLen) * spd;
            const tz = (dz / dLen) * spd;
            obj.vx += (tx - obj.vx) * Math.min(1, turnRate * dt);
            obj.vy += (ty - obj.vy) * Math.min(1, turnRate * dt);
            obj.vz += (tz - obj.vz) * Math.min(1, turnRate * dt);
            obj.t3.x += obj.vx * dt;
            obj.t3.y += obj.vy * dt;
            obj.t3.z += obj.vz * dt;
            obj.t3.ry = (Math.atan2(obj.vx, obj.vz) * 180) / Math.PI;
            if (dLen <= 0.9) {
              nearest.hp = Math.max(0, nearest.hp - Number(comp.config.damage ?? 35));
              if (nearest.hp <= 0) nearest.visible = false;
              obj.visible = false;
            }
          }
        } else if (comp.type === 'ai.turret_shooter') {
          const rawR = Number(comp.config.range ?? 18);
          const range = rawR > 40 ? rawR / 20 : rawR;
          if (primaryPlayer && primaryPlayer.visible && primaryPlayer.id !== obj.id) {
            const dx = primaryPlayer.t3.x - obj.t3.x;
            const dz = primaryPlayer.t3.z - obj.t3.z;
            const dist = Math.hypot(dx, dz);
            if (dist <= range) {
              const targetYaw = (Math.atan2(dx, dz) * 180) / Math.PI;
              obj.t3.ry = lerpAngleDeg(obj.t3.ry, targetYaw, Math.min(1, 8 * dt));
              const cdKey = `turret3d_cd:${comp.id}`;
              const cd = Math.max(0, (behaviorTimers.get(cdKey) ?? 0) - dt);
              if (cd <= 0) {
                behaviorTimers.set(cdKey, Math.max(0.3, Number(comp.config.fireIntervalSec ?? 1.4)));
                const dLen = dist || 1;
                const spd = Number(comp.config.projectileSpeed ?? 14);
                const pObj = createApi(dt).spawn.primitive('sphere', {
                  name: `TurretShot_${obj.name}`,
                  x: obj.t3.x + (dx / dLen) * 1.1,
                  y: obj.t3.y + 0.8,
                  z: obj.t3.z + (dz / dLen) * 1.1,
                  sx: 0.35,
                  sy: 0.35,
                  sz: 0.35,
                  color: '#f87171',
                  physics: false,
                });
                const rawProj = pObj ? objById.get(pObj.id) : null;
                if (rawProj) {
                  rawProj.vx = (dx / dLen) * spd;
                  rawProj.vz = (dz / dLen) * spd;
                  rawProj.layer = 'Projectile';
                  rawProj.source.components.push({
                    id: `tproj3d_${Date.now()}_${spawnCounter}`,
                    type: 'projectile_3d',
                    enabled: true,
                    config: {
                      ownerId: obj.id,
                      damage: Number(comp.config.damage ?? 15),
                      lifetimeSec: 2.5,
                      isEnemy: true,
                    },
                  });
                }
              } else {
                behaviorTimers.set(cdKey, cd);
              }
            }
          }
        } else if (comp.type === 'projectile_3d') {
          const life = Number(comp.config.lifetimeSec ?? 2.0) - dt;
          comp.config.lifetimeSec = life;
          obj.t3.x += obj.vx * dt;
          obj.t3.y += obj.vy * dt;
          obj.t3.z += obj.vz * dt;
          if (life <= 0) {
            obj.visible = false;
          } else {
            const ownerId = String(comp.config.ownerId ?? '');
            const isEnemy = Boolean(comp.config.isEnemy);
            const dmg = Number(comp.config.damage ?? 20);
            for (const cand of objects) {
              if (!cand.visible || cand.id === obj.id || cand.id === ownerId) continue;
              if (cand.type !== 'mesh_3d') continue;
              const isPlayerCand = cand.id === primaryPlayer?.id;
              if (isEnemy && !isPlayerCand) continue;
              if (!isEnemy && isPlayerCand) continue;
              const canHit =
                isPlayerCand ||
                cand.layer === 'Enemy' ||
                cand.tags.some((t) => t.toLowerCase() === 'enemy' || t.toLowerCase() === 'enemigo') ||
                (cand.source.components ?? []).some((c) => c.enabled && (c.type === 'health' || c.type === 'combat.health_system'));
              if (!canHit) continue;
              if (Math.hypot(cand.t3.x - obj.t3.x, cand.t3.y - obj.t3.y, cand.t3.z - obj.t3.z) <= 1.05) {
                cand.hp = Math.max(0, cand.hp - dmg);
                if (isPlayerCand) variables.set('salud', Math.round(cand.hp));
                else if (cand.hp <= 0) cand.visible = false;
                obj.visible = false;
                audioHooks?.playSfx?.('hit', 0.75, { x: obj.t3.x, y: obj.t3.y, z: obj.t3.z });
                break;
              }
            }
          }
        }
      }

      // 2. Agentes NavMesh A* + Cono de Visión + Vaulting/Táctica
      const ai = obj.source.aiAgent;
      const aiThrottled = Boolean(actPolicy && actPolicy.aiStride > 1 && streamingFrame % actPolicy.aiStride !== 0);
      if (ai?.enabled && ai.mode !== 'idle' && !aiThrottled) {
        const targetObj = ai.targetObjectId
          ? resolveObjectRef(ai.targetObjectId)
          : primaryPlayer;
        if (ai.mode === 'chase' && targetObj && targetObj.visible) {
          steerSmartEnemy3D(obj, targetObj, {
            baseSpeed: ai.speed ?? 3.8,
            detectRadius: ai.maxChaseDistance ?? ai.visionRange ?? 32,
            stopDist: ai.stoppingDistance ?? 1.2,
            visionFovDeg: ai.visionFovDeg ?? 130,
            visionRange: ai.visionRange ?? ai.maxChaseDistance ?? 28,
            requireLineOfSight: ai.requireLineOfSight !== false,
            canJumpObstacles: ai.canJumpObstacles !== false,
            maxJumpHeight: ai.maxJumpHeight ?? 2.1,
            fleeHealthRatio: ai.fleeHealthRatio ?? 0.28,
            insistDamageRatio: ai.insistDamageRatio ?? 0.45,
          });
        } else {
          obj.navTimer -= dt;
          const goalPos = { x: ai.targetX ?? obj.t3.x, z: ai.targetZ ?? obj.t3.z };
          const distToGoal = Math.hypot(goalPos.x - obj.t3.x, goalPos.z - obj.t3.z);
          if (distToGoal <= (ai.stoppingDistance ?? 1.2)) {
            obj.vx *= 0.8;
            obj.vz *= 0.8;
          } else {
            if (obj.navTimer <= 0 || obj.navPath.length === 0) {
              obj.navTimer = 0.35;
              obj.navPath = navMesh
                ? findNavMeshPath(navMesh, { x: obj.t3.x, z: obj.t3.z }, goalPos)
                : [{ x: goalPos.x, y: obj.t3.y, z: goalPos.z }];
            }
            while (obj.navPath.length > 1) {
              const wp = obj.navPath[0];
              if (Math.hypot(wp.x - obj.t3.x, wp.z - obj.t3.z) < 0.75) {
                obj.navPath.shift();
              } else {
                break;
              }
            }
            const nextWp = obj.navPath[0] ?? { x: goalPos.x, y: obj.t3.y, z: goalPos.z };
            let dirX = nextWp.x - obj.t3.x;
            let dirZ = nextWp.z - obj.t3.z;
            const dLen = Math.hypot(dirX, dirZ) || 1;
            dirX /= dLen;
            dirZ /= dLen;

            for (const otherAgent of objects) {
              if (otherAgent === obj || !otherAgent.visible || !otherAgent.source.aiAgent?.enabled) continue;
              const sepX = obj.t3.x - otherAgent.t3.x;
              const sepZ = obj.t3.z - otherAgent.t3.z;
              const sepD = Math.hypot(sepX, sepZ);
              const avoidR = Math.max(0.8, ai.avoidanceRadius ?? 1.2);
              if (sepD > 0.01 && sepD < avoidR) {
                const push = (avoidR - sepD) / avoidR;
                dirX += (sepX / sepD) * push * 0.8;
                dirZ += (sepZ / sepD) * push * 0.8;
              }
            }
            const finalLen = Math.hypot(dirX, dirZ) || 1;
            obj.vx = (dirX / finalLen) * (ai.speed ?? 3.8);
            obj.vz = (dirZ / finalLen) * (ai.speed ?? 3.8);
            const targetYaw = (Math.atan2(obj.vx, obj.vz) * 180) / Math.PI;
            obj.t3.ry = lerpAngleDeg(obj.t3.ry, targetYaw, Math.min(1, 10 * dt));
          }
        }
      }
    }

    // 3. Física 3D (gravedad + integración + terreno procedural + agua + colisión AABB/Rampa/Trimesh)
    const objIdSet = new Set(objects.map((o) => o.id));
    const hasParentInScene = (o: Sim3DObjectState) =>
      Boolean(o.source.parentId && o.source.parentId !== o.id && objIdSet.has(o.source.parentId));
    const hasDynamicBehavior = (o: Sim3DObjectState) =>
      (o.source.components ?? []).some(
        (c) =>
          c.enabled &&
          (c.type === 'player_3d' ||
            c.type === 'player_platformer' ||
            c.type === 'player_topdown' ||
            c.type === 'movement.platformer_pro' ||
            c.type === 'movement.topdown_8dir' ||
            c.type === 'chase_player' ||
            c.type === 'ai.enemy_chaser')
      ) || Boolean(o.source.aiAgent?.enabled && o.source.aiAgent.mode !== 'idle');

    const dynamicBodies = objects.filter((o) => {
      if (mountedActorId === o.id && activeMountedVehicleId) return false;
      if (!o.visible || hasParentInScene(o)) return false;
      if (o.id !== primaryPlayer?.id && o.id !== activeMountedVehicleId) {
        const physPolicy = getObjectPolicy(o.id);
        if (physPolicy && (physPolicy.physics === 'none' || physPolicy.physics === 'sleeping')) {
          return false;
        }
      }
      if (o.type !== 'mesh_3d' && o.type !== 'container') return false;
      if (
        o.type === 'mesh_3d' &&
        (o.source.mesh3d?.shape === 'terrain' ||
          o.source.mesh3d?.shape === 'water' ||
          o.source.mesh3d?.shape === 'grass_field')
      ) {
        return false;
      }
      if (o.source.vehicle?.enabled) return true;
      if (o.source.physics3d?.enabled && o.source.physics3d.bodyType === 'dynamic') return true;
      if (o.source.physics3d?.bodyType === 'kinematic') return false;
      return hasDynamicBehavior(o);
    });
    const dynamicIdSet = new Set(dynamicBodies.map((b) => b.id));
    const isDescendantOfDynamic = (o: Sim3DObjectState): boolean => {
      let pid: string | null | undefined = o.source.parentId;
      if (!pid) return false;
      let guard = 0;
      descendantSeenSet.clear();
      descendantSeenSet.add(o.id);
      while (pid && !descendantSeenSet.has(pid) && guard < 12) {
        if (dynamicIdSet.has(pid)) return true;
        descendantSeenSet.add(pid);
        pid = objById.get(pid)?.source.parentId;
        guard++;
      }
      return false;
    };

    const staticSolids = objects.filter(
      (o) =>
        o.visible &&
        !dynamicIdSet.has(o.id) &&
        !isDescendantOfDynamic(o) &&
        o.type === 'mesh_3d' &&
        o.source.mesh3d?.shape !== 'grass_field' &&
        (o.source.physics3d?.enabled ?? true) &&
        (o.source.physics3d?.bodyType ?? 'static') !== 'dynamic'
    );

    const GRAVITY_Y = -20;
    const currentCollisions = new Set<string>();

    for (const body of dynamicBodies) {
      // Resolver vehículos multi-modo (Auto, Moto, Bote, Avión, Nave Espacial 6DOF) con LOD
      const vCfg = body.source.vehicle;
      const vState = vehicleSims.get(body.id);
      if (vCfg?.enabled && vState) {
        const lodActive = shouldStepVehiclePhysics(
          vState,
          { x: cameraState.posX, y: cameraState.posY, z: cameraState.posZ },
          vCfg.physicsLodDistance
        );
        if (!lodActive) continue;

        const hasDriverControl =
          !primaryPlayer ||
          activeMountedVehicleId === body.id ||
          body.id === primaryPlayer.id ||
          !objects.some((o) => o.id !== body.id && o.source.vehicle?.enabled && activeMountedVehicleId === o.id);

        // Si hay una regla explícita para otro vehículo y el jugador está a pie, conducir solo si montado o no hay jugador
        const playerControlsThis =
          !primaryPlayer || activeMountedVehicleId === body.id || body.id === primaryPlayer.id;

        let thr = 0;
        let str = 0;
        let pitchIn = 0;
        let ascendIn = 0;
        let yawIn = 0;
        if (playerControlsThis && hasDriverControl) {
          if (activeHeldKeys.has('KeyW') || activeHeldKeys.has('ArrowUp')) thr += 1;
          if (activeHeldKeys.has('KeyS') || activeHeldKeys.has('ArrowDown')) thr -= 1;
          if (activeHeldKeys.has('KeyA') || activeHeldKeys.has('ArrowLeft')) str -= 1;
          if (activeHeldKeys.has('KeyD') || activeHeldKeys.has('ArrowRight')) str += 1;
          if (activeHeldKeys.has('Space')) ascendIn += 1;
          if (activeHeldKeys.has('ShiftLeft') || activeHeldKeys.has('ControlLeft')) ascendIn -= 1;
          if (activeHeldKeys.has('KeyQ')) yawIn -= 1;
          if (activeHeldKeys.has('KeyE') && !activeMountedVehicleId) yawIn += 1;
          if (activeHeldKeys.has('ArrowUp')) pitchIn -= 1;
          if (activeHeldKeys.has('ArrowDown')) pitchIn += 1;
          if (thr === 0 && Math.abs(activeMoveAxisY) > 0.05) thr = -activeMoveAxisY;
          if (str === 0 && Math.abs(activeMoveAxisX) > 0.05) str = activeMoveAxisX;
        }

        const kind = vCfg.vehicleKind ?? 'car';
        const patrolSplineId = vCfg.patrolSplineId || body.source.followSplineId;
        const patrolSpline = patrolSplineId
          ? (scene.splines3d ?? []).find((sp) => sp.id === patrolSplineId)
          : null;

        const sampleDriveGroundY = (wx: number, wz: number): number => {
          let bestY: number | null = null;
          for (const sol of staticSolids) {
            const sm3 = sol.source.mesh3d;
            if (sm3?.shape === 'water' || sm3?.shape === 'grass_field' || sol.source.physics3d?.isTrigger) continue;
            if (sm3?.shape === 'terrain' && sm3.terrainData) {
              const th = sampleTerrainHeightAt({ ...sol.source, transform3d: getWorldT3(sol) }, wx, wz);
              if (th !== null && (bestY === null || th > bestY)) bestY = th;
              continue;
            }
            if (sol.source.navRole === 'ignore') continue;
            const solW = getWorldT3(sol);
            const heB = getHalfExtents3D({ ...sol, t3: solW });
            const ryRad = ((solW.ry ?? 0) * Math.PI) / 180;
            const cosR = Math.cos(ryRad);
            const sinR = Math.sin(ryRad);
            const dxW = wx - solW.x;
            const dzW = wz - solW.z;
            const lx = dxW * cosR - dzW * sinR;
            const lz = dxW * sinR + dzW * cosR;
            if (Math.abs(lx) > heB.x || Math.abs(lz) > heB.z) continue;
            if (sm3?.shape === 'ramp') {
              const frac = Math.max(0, Math.min(1, (lx + heB.x) / Math.max(0.01, heB.x * 2)));
              const rampY = solW.y + heB.y - frac * (heB.y * 2);
              if (rampY <= vState.y + 1.15 && (bestY === null || rampY > bestY)) bestY = rampY;
              continue;
            }
            const topY = solW.y + heB.y;
            if (topY <= vState.y + 0.72 && (bestY === null || topY > bestY)) {
              bestY = topY;
            }
          }
          return bestY ?? 0;
        };

        const resolveVehicleWallCollisions = () => {
          const heVeh = getHalfExtents3D(body);
          const colRx = Math.min(heVeh.x, heVeh.z) * 0.85;
          const colHy = Math.max(0.35, heVeh.y * 0.75);
          for (const sol of staticSolids) {
            const sm3 = sol.source.mesh3d;
            if (!sm3 || sm3.shape === 'terrain' || sm3.shape === 'water' || sm3.shape === 'ramp' || sm3.shape === 'plane' || sol.source.physics3d?.isTrigger) continue;
            const solW = getWorldT3(sol);
            const heB = getHalfExtents3D({ ...sol, t3: solW });
            const solTop = solW.y + heB.y;
            if (solTop <= vState.y - heVeh.y + 0.35) continue;
            const solShape = sol.source.physics3d?.shape;
            if (solShape === 'mesh_exact' || sm3.shape === 'arch' || sm3.shape === 'stairs') {
              let tri = trimeshCache.get(sol.id);
              if (tri === undefined) {
                tri = buildWorldTrimeshData({ ...sol.source, transform3d: solW });
                trimeshCache.set(sol.id, tri);
              }
              if (tri) {
                const tRes = resolveBodyVsTrimesh(vState.x, vState.y, vState.z, colRx, colHy, colRx, tri);
                if (tRes.collided && tRes.hitWall) {
                  vState.x += tRes.dx;
                  vState.z += tRes.dz;
                  const vn = vState.vx * tRes.wallNx + vState.vz * tRes.wallNz;
                  if (vn < 0) {
                    vState.vx -= vn * tRes.wallNx * 1.15;
                    vState.vz -= vn * tRes.wallNz * 1.15;
                    const fwdX = Math.sin(vState.yawRad);
                    const fwdZ = Math.cos(vState.yawRad);
                    vState.speedForward = vState.vx * fwdX + vState.vz * fwdZ;
                  }
                }
                continue;
              }
            }
            const oRes = resolveBodyVsOBB3D(
              vState.x,
              vState.y,
              vState.z,
              colRx,
              colHy,
              colRx,
              solW.x,
              solW.y,
              solW.z,
              heB.x,
              heB.y,
              heB.z,
              solW.rx ?? 0,
              solW.ry ?? 0,
              solW.rz ?? 0
            );
            if (oRes.collided && oRes.hitWall) {
              vState.x += oRes.dx;
              vState.z += oRes.dz;
              const vn = vState.vx * oRes.wallNx + vState.vz * oRes.wallNz;
              if (vn < 0) {
                vState.vx -= vn * oRes.wallNx * 1.15;
                vState.vz -= vn * oRes.wallNz * 1.15;
                const fwdX = Math.sin(vState.yawRad);
                const fwdZ = Math.cos(vState.yawRad);
                vState.speedForward = vState.vx * fwdX + vState.vz * fwdZ;
              }
            }
          }
        };

        if (patrolSpline && patrolSpline.points.length >= 2 && !activeMountedVehicleId) {
          const curT = splineProgress.get(body.id) ?? 0;
          const spdRatio = Math.max(0.02, (vCfg.maxSpeed || 14) * 0.008);
          const nextT = patrolSpline.closed ? (curT + spdRatio * dt) % 1 : Math.min(1, curT + spdRatio * dt);
          splineProgress.set(body.id, nextT);
          const pt = sampleSpline3D(patrolSpline.points, patrolSpline.closed, nextT);
          vState.prevX = vState.x;
          vState.prevY = vState.y;
          vState.prevZ = vState.z;
          vState.vx = (pt.x - vState.x) / Math.max(0.001, dt);
          vState.vy = (pt.y - vState.y) / Math.max(0.001, dt);
          vState.vz = (pt.z - vState.z) / Math.max(0.001, dt);
          vState.x = pt.x;
          vState.y = pt.y;
          vState.z = pt.z;
          vState.yawRad = Math.atan2(pt.tx, pt.tz);
          vState.speedForward = Math.hypot(vState.vx, vState.vz);
          vState.propellerSpinRad += 14 * dt;
        } else if (kind === 'boat') {
          const linkedWater = vCfg.waterObjectId
            ? objects.find((o) => o.id === vCfg.waterObjectId && o.source.mesh3d?.waterConfig)
            : objects.find((o) => o.source.mesh3d?.shape === 'water' && o.source.mesh3d.waterConfig);
          stepBoatVehicle(vState, vCfg, thr, str, dt, (wx, wz) => {
            if (!linkedWater?.source.mesh3d?.waterConfig) return groundHeightAt(scene, wx, wz);
            return sampleWaterWaveHeightAt(
              {
                id: linkedWater.id,
                x: linkedWater.t3.x,
                y: linkedWater.t3.y,
                z: linkedWater.t3.z,
                config: linkedWater.source.mesh3d.waterConfig,
              },
              wx,
              wz,
              elapsedTime
            );
          });
        } else if (kind === 'plane') {
          const planePitch =
            pitchIn !== 0
              ? pitchIn
              : activeHeldKeys.has('Space')
                ? 0.85
                : activeHeldKeys.has('ShiftLeft')
                  ? -0.85
                  : 0;
          stepPlaneVehicle(
            vState,
            vCfg,
            thr,
            planePitch,
            -str,
            yawIn,
            dt,
            (wx, wz) => groundHeightAt(scene, wx, wz)
          );
        } else if (kind === 'helicopter') {
          const engineActive = !primaryPlayer || activeMountedVehicleId === body.id || body.id === primaryPlayer.id;
          stepHelicopterVehicle(
            vState,
            vCfg,
            thr,
            str,
            ascendIn,
            yawIn,
            dt,
            (wx, wz) => groundHeightAt(scene, wx, wz),
            engineActive
          );
        } else if (kind === 'spaceship') {
          stepSpaceshipVehicle(vState, vCfg, thr, str, ascendIn, yawIn, pitchIn, 0, dt);
        } else if (kind === 'horse') {
          stepHorseVehicle(
            vState,
            vCfg,
            thr,
            str,
            playerControlsThis && hasDriverControl && (activeJustPressedKeys.has('Space') || activeHeldKeys.has('Space')),
            dt,
            sampleDriveGroundY
          );
          resolveVehicleWallCollisions();
        } else {
          stepVehicle4W(vState, vCfg, thr, str, dt, sampleDriveGroundY);
          resolveVehicleWallCollisions();
        }

        body.t3.x = vState.x;
        body.t3.y = vState.y;
        body.t3.z = vState.z;
        body.t3.ry = (vState.yawRad * 180) / Math.PI;
        body.t3.rx = (vState.pitchRad * 180) / Math.PI;
        body.t3.rz = (vState.rollRad * 180) / Math.PI;
        body.vx = vState.vx;
        body.vy = vState.vy;
        body.vz = vState.vz;
        body.isGrounded =
          kind === 'boat'
            ? vState.pontoons.some((p) => p.submerged > 0)
            : kind === 'helicopter' || kind === 'plane'
              ? vState.y <= groundHeightAt(scene, vState.x, vState.z) + 1.15
              : kind === 'spaceship'
                ? false
                : vState.wheels.some((w) => w.grounded);

        // Sincronizar en el mismo frame al jinete montado en silla ('moto' / 'horse' / mountStyle === 'saddle')
        if (activeMountedVehicleId === body.id && mountedActorId) {
          const mAct = objById.get(mountedActorId);
          if (mAct) {
            const isSaddle =
              vCfg.mountStyle === 'saddle' ||
              (!vCfg.mountStyle && (kind === 'moto' || kind === 'horse'));
            if (isSaddle) {
              mAct.visible = true;
              const sPos = computeSaddleWorldPosition(
                body.t3,
                body.t3,
                vCfg.seatOffset ?? { x: 0, y: kind === 'horse' ? 1.05 : 0.85, z: -0.1 }
              );
              mAct.t3.x = sPos.x;
              mAct.t3.y = sPos.y;
              mAct.t3.z = sPos.z;
              mAct.t3.rx = body.t3.rx;
              mAct.t3.ry = body.t3.ry;
              mAct.t3.rz = body.t3.rz;
            } else {
              mAct.visible = false;
              mAct.t3.x = body.t3.x;
              mAct.t3.y = body.t3.y;
              mAct.t3.z = body.t3.z;
            }
            mAct.vx = body.vx;
            mAct.vy = body.vy;
            mAct.vz = body.vz;
          }
        }

        // Zona de Gravedad Local para naves espaciales grandes: el jugador puede caminar dentro en movimiento
        if (
          kind === 'spaceship' &&
          vCfg.localGravityBox?.enabled &&
          primaryPlayer &&
          mountedActorId !== primaryPlayer.id
        ) {
          const heP = getHalfExtents3D(primaryPlayer);
          const lg = applyLocalGravityZone(vState, vCfg.localGravityBox, primaryPlayer.t3, heP.y);
          if (lg.inside) {
            primaryPlayer.t3.x = lg.nextX;
            primaryPlayer.t3.y = lg.nextY;
            primaryPlayer.t3.z = lg.nextZ;
            if (primaryPlayer.vy < 0) primaryPlayer.vy = 0;
            primaryPlayer.isGrounded = true;
          }
        }
        continue;
      }

      const gScale = body.source.physics3d?.gravityScale ?? 1;
      body.vy += GRAVITY_Y * gScale * dt;
      body.isGrounded = false;

      const heA = getHalfExtents3D(body);
      const bodyOff = getColliderWorldOffset(body.t3, body.source.physics3d?.offset);
      const stepHoriz = Math.hypot(body.vx * dt, body.vz * dt);
      const minHeHoriz = Math.max(0.15, Math.min(heA.x, heA.z));
      const subSteps = Math.min(4, Math.max(1, Math.ceil(stepHoriz / (minHeHoriz * 0.55))));
      const subDt = dt / subSteps;

      for (let sub = 0; sub < subSteps; sub++) {
        body.t3.x += body.vx * subDt;
        body.t3.y += body.vy * subDt;
        body.t3.z += body.vz * subDt;

        for (const sol of staticSolids) {
          const solW = getWorldT3(sol);
          const solM3 = sol.source.mesh3d;
          const bCx = body.t3.x + bodyOff.x;
          const bCy = body.t3.y + bodyOff.y;
          const bCz = body.t3.z + bodyOff.z;

          // Terreno procedural 3D con heightmap
          if (solM3?.shape === 'terrain' && solM3.terrainData) {
            const surfY = sampleTerrainHeightAt({ ...sol.source, transform3d: solW }, bCx, bCz);
            if (surfY !== null && bCy - heA.y <= surfY) {
              body.t3.y = surfY + heA.y - bodyOff.y;
              if (body.vy < 0) body.vy = 0;
              body.isGrounded = true;
              currentCollisions.add([body.id, sol.id].sort().join('|'));
            }
            continue;
          }

          // Agua / Río interactivo (flotación + corriente + salpicadura)
          if (solM3?.shape === 'water' && solM3.waterConfig) {
            if (sub > 0) continue;
            const wc = solM3.waterConfig;
            const hw = Math.max(2, wc.width * 0.5);
            const hd = Math.max(2, wc.depth * 0.5);
            const inWater =
              Math.abs(bCx - solW.x) <= hw &&
              Math.abs(bCz - solW.z) <= hd &&
              bCy - heA.y <= solW.y + 0.35;
            if (inWater) {
              body.vx += (wc.flowX ?? 0) * 1.8 * dt;
              body.vz += (wc.flowZ ?? 0) * 1.8 * dt;
              body.vy += 12 * dt; // flotación suave
              body.vy *= Math.max(0, 1 - 2.5 * dt);
              if (!inWaterObjects.has(body.id)) {
                inWaterObjects.add(body.id);
                lastSplashPos = { x: bCx, y: solW.y, z: bCz, time: elapsedTime };
                particlePool.burst(sol.id, bCx, solW.y + 0.25, bCz, 18, {
                  enabled: true,
                  preset: 'sparks',
                  rate: 20,
                  maxParticles: 80,
                  speedMin: 30,
                  speedMax: 90,
                  angleDeg: -90,
                  spreadDeg: 180,
                  gravity: 220,
                  sizeStart: 0.35,
                  sizeEnd: 0.05,
                  lifetime: 0.55,
                  colorStart: '#e0f2fe',
                  colorEnd: '#38bdf8',
                  blendAlpha: 0.9,
                }, true);
              }
            } else {
              inWaterObjects.delete(body.id);
            }
            continue;
          }

          const solP3d = sol.source.physics3d;
          const heB = solP3d?.shape === 'sphere' && typeof solP3d.radius === 'number' && solP3d.radius > 0
            ? { x: solP3d.radius, y: solP3d.radius, z: solP3d.radius }
            : {
                x: solP3d?.halfExtents?.x ?? Math.max(0.2, Math.abs(solW.sx) * 0.5),
                y: solP3d?.halfExtents?.y ?? Math.max(0.1, Math.abs(solW.sy) * 0.5),
                z: solP3d?.halfExtents?.z ?? Math.max(0.2, Math.abs(solW.sz) * 0.5),
              };
          const solOff = getColliderWorldOffset(solW, solP3d?.offset);
          const sCx = solW.x + solOff.x;
          const sCy = solW.y + solOff.y;
          const sCz = solW.z + solOff.z;

          const solShape = solP3d?.shape;
          const isTrimesh =
            solShape === 'mesh_exact' ||
            sol.source.mesh3d?.shape === 'arch' ||
            sol.source.mesh3d?.shape === 'stairs' ||
            (sol.source.mesh3d?.shape === 'ramp' && Math.abs((solW.ry ?? 0) % 360) > 1);
          if (isTrimesh) {
            let tri = trimeshCache.get(sol.id);
            if (tri === undefined) {
              tri = buildWorldTrimeshData({ ...sol.source, transform3d: solW });
              trimeshCache.set(sol.id, tri);
            }
            if (tri) {
              const res = resolveBodyVsTrimesh(bCx, bCy, bCz, heA.x, heA.y, heA.z, tri);
              if (res.collided) {
                body.t3.x += res.dx;
                body.t3.y += res.dy;
                body.t3.z += res.dz;
                if (res.hitFloor) {
                  if (body.vy < 0) body.vy = 0;
                  body.isGrounded = true;
                }
                if (res.hitCeiling && body.vy > 0) body.vy = 0;
                if (res.hitWall && (res.wallNx !== 0 || res.wallNz !== 0)) {
                  const vn = body.vx * res.wallNx + body.vz * res.wallNz;
                  if (vn < 0) {
                    body.vx -= vn * res.wallNx;
                    body.vz -= vn * res.wallNz;
                  }
                }
                currentCollisions.add([body.id, sol.id].sort().join('|'));
              }
              continue;
            }
          }

          const isRamp = sol.source.mesh3d?.shape === 'ramp';
          if (isRamp) {
            const inX = bCx + heA.x > sCx - heB.x && bCx - heA.x < sCx + heB.x;
            const inZ = bCz + heA.z > sCz - heB.z && bCz - heA.z < sCz + heB.z;
            if (inX && inZ) {
              const frac = Math.max(0, Math.min(1, (bCx - (sCx - heB.x)) / Math.max(0.01, heB.x * 2)));
              const rampTopY = sCy + heB.y - frac * (heB.y * 2);
              if (bCy - heA.y <= rampTopY + 0.15 && bCy >= sCy - heB.y) {
                body.t3.y = rampTopY + heA.y - bodyOff.y;
                if (body.vy < 0) body.vy = 0;
                body.isGrounded = true;
                currentCollisions.add([body.id, sol.id].sort().join('|'));
              }
            }
            continue;
          }

          // Resolver OBB (cajas alineadas o rotadas en cualquier ángulo rx/ry/rz + deslizamiento suave por pared)
          const obbRes = resolveBodyVsOBB3D(
            bCx,
            bCy,
            bCz,
            heA.x,
            heA.y,
            heA.z,
            sCx,
            sCy,
            sCz,
            heB.x,
            heB.y,
            heB.z,
            solW.rx ?? 0,
            solW.ry ?? 0,
            solW.rz ?? 0
          );
          if (obbRes.collided) {
            body.t3.x += obbRes.dx;
            body.t3.y += obbRes.dy;
            body.t3.z += obbRes.dz;
            const restitution = body.source.physics3d?.restitution ?? 0;
            if (obbRes.hitFloor) {
              if (body.vy < 0) {
                body.vy = Math.abs(body.vy) > 3 && restitution > 0.1 ? -body.vy * restitution : 0;
              }
              body.isGrounded = true;
            }
            if (obbRes.hitCeiling && body.vy > 0) body.vy = 0;
            if (obbRes.hitWall && (obbRes.wallNx !== 0 || obbRes.wallNz !== 0)) {
              const vn = body.vx * obbRes.wallNx + body.vz * obbRes.wallNz;
              if (vn < 0) {
                body.vx -= vn * obbRes.wallNx;
                body.vz -= vn * obbRes.wallNz;
              }
            }
            currentCollisions.add([body.id, sol.id].sort().join('|'));
          }
        }
      }

      // Colisiones entre cuerpos dinámicos
      for (const other of dynamicBodies) {
        if (other.id <= body.id) continue;
        const heB = getHalfExtents3D(other);
        if (
          Math.abs(body.t3.x - other.t3.x) < heA.x + heB.x &&
          Math.abs(body.t3.y - other.t3.y) < heA.y + heB.y &&
          Math.abs(body.t3.z - other.t3.z) < heA.z + heB.z
        ) {
          const pair = [body.id, other.id].sort().join('|');
          currentCollisions.add(pair);
        }
      }

      // Suelo de seguridad mínimo para evitar caída infinita si el usuario borra el suelo
      if (body.t3.y < -35) {
        body.t3.y = 4;
        body.vy = 0;
      }
    }

    // Detección adicional de solapamiento para pares con scripts onCollisionEnter (kinematic/trigger)
    for (let i = 0; i < objects.length; i++) {
      const a = objects[i];
      if (!a.visible) continue;
      const aHas = (a.source.scriptBindings ?? []).some(
        (b) => b.enabled && typeof compiledScripts.get(b.scriptId)?.hooks.onCollisionEnter === 'function'
      );
      for (let j = i + 1; j < objects.length; j++) {
        const b = objects[j];
        if (!b.visible) continue;
        const bHas = (b.source.scriptBindings ?? []).some(
          (bind) => bind.enabled && typeof compiledScripts.get(bind.scriptId)?.hooks.onCollisionEnter === 'function'
        );
        if (!aHas && !bHas) continue;
        const pair = [a.id, b.id].sort().join('|');
        if (currentCollisions.has(pair)) continue;
        const wA = getWorldT3(a);
        const wB = getWorldT3(b);
        const heA = getHalfExtents3D(a);
        const heB = getHalfExtents3D(b);
        if (
          Math.abs(wA.x - wB.x) < heA.x + heB.x &&
          Math.abs(wA.y - wB.y) < heA.y + heB.y &&
          Math.abs(wA.z - wB.z) < heA.z + heB.z
        ) {
          currentCollisions.add(pair);
        }
      }
    }

    // 4. Emitir colisiones enter & scripts onCollisionEnter (simétrico para ambos objetos)
    for (const pair of currentCollisions) {
      if (!prevCollisions.has(pair)) {
        const [idA, idB] = pair.split('|');
        const objA = objects.find((o) => o.id === idA);
        const objB = objects.find((o) => o.id === idB);
        if (objA && objB) {
          runMechanicsForEvent('collision.enter', objA, objB);
          runMechanicsForEvent('collision.enter', objB, objA);
          for (const b of objA.source.scriptBindings ?? []) {
            const e = compiledScripts.get(b.scriptId);
            if (b.enabled && e?.hooks.onCollisionEnter) {
              try {
                e.hooks.onCollisionEnter(
                  makeHandle(objA, { ...(e.hooks.params ?? {}), ...(b.params ?? {}) }),
                  makeHandle(objB),
                  api
                );
              } catch (err) {
                logScriptError(`${objA.id}:${b.scriptId}:onCollisionEnter`, e.name, err);
              }
            }
          }
          for (const b of objB.source.scriptBindings ?? []) {
            const e = compiledScripts.get(b.scriptId);
            if (b.enabled && e?.hooks.onCollisionEnter) {
              try {
                e.hooks.onCollisionEnter(
                  makeHandle(objB, { ...(e.hooks.params ?? {}), ...(b.params ?? {}) }),
                  makeHandle(objA),
                  api
                );
              } catch (err) {
                logScriptError(`${objB.id}:${b.scriptId}:onCollisionEnter`, e.name, err);
              }
            }
          }
        }
      }
    }
    prevCollisions.clear();
    for (const p of currentCollisions) prevCollisions.add(p);

    // 5. Ejecutar onUpdate scripts, Animación FSM, Partículas y Mecánicas
    for (const sid of scene.scriptIds ?? []) {
      const e = compiledScripts.get(sid);
      if (e?.hooks.onUpdate) {
        try {
          e.hooks.onUpdate(makeSceneHandle(sid, { ...(e.hooks.params ?? {}) }), dt, api);
        } catch (err) {
          logScriptError(`scene:${sid}:onUpdate`, e.name, err);
        }
      }
    }
    for (const obj of [...objects]) {
      if (!obj.visible) continue;
      const scPolicy = obj.id === primaryPlayer?.id ? null : getObjectPolicy(obj.id);
      const skipScriptsByActivity =
        scPolicy !== null &&
        (scPolicy.scripts === 'none' ||
          scPolicy.scripts === 'suspended' ||
          (scPolicy.scriptStride > 1 && streamingFrame % scPolicy.scriptStride !== 0));
      if (!skipScriptsByActivity) {
        for (const b of obj.source.scriptBindings ?? []) {
          if (!b.enabled) continue;
          const e = compiledScripts.get(b.scriptId);
          if (e?.hooks.onUpdate) {
            try {
              e.hooks.onUpdate(makeHandle(obj, { ...(e.hooks.params ?? {}), ...(b.params ?? {}) }), dt, api);
            } catch (err) {
              logScriptError(`${obj.id}:${b.scriptId}:onUpdate`, e.name, err);
            }
          }
        }
      }
      if (!scPolicy || scPolicy.level === 'near' || scPolicy.level === 'medium') {
        evaluateAnimFSM(obj, dt);
      }

      // Emisor continuo 3D (soporta emisor base + capas múltiples VFX)
      const em = obj.source.particleEmitter;
      if (em?.enabled) {
        const activeLayers =
          em.layers && em.layers.length > 0
            ? em.layers.filter((l) => l.enabled)
            : [em];
        for (let lIdx = 0; lIdx < activeLayers.length; lIdx++) {
          const layerCfg = activeLayers[lIdx];
          const timerKey = `em_${obj.id}_${lIdx}`;
          const acc = (mechanicTimers.get(timerKey) ?? 0) + dt * (layerCfg.rate || 15);
          const emitCount = Math.floor(acc);
          mechanicTimers.set(timerKey, acc - emitCount);
          const offX = 'offsetX' in layerCfg ? Number(layerCfg.offsetX ?? 0) * 0.02 : 0;
          const offY = 'offsetY' in layerCfg ? Number(layerCfg.offsetY ?? 0) * -0.02 : 0;
          for (let k = 0; k < Math.min(8, emitCount); k++) {
            particlePool.spawnOne(
              obj.id,
              obj.t3.x + offX,
              obj.t3.y + offY,
              obj.t3.z,
              {
                ...em,
                ...layerCfg,
                enabled: true,
              },
              true
            );
          }
        }
      }
    }

    // Actualizar Soft-Bodies / Cuerdas / Cadenas / Gel / Arena
    const primaryActor = resolvePlayerActor();
    const actorPush = primaryActor
      ? { x: primaryActor.t3.x, y: primaryActor.t3.y, z: primaryActor.t3.z, radius: 0.75 }
      : undefined;
    for (const sb of softBodySims.values()) {
      stepSoftBodySimulation(sb, dt, (wx, wz) => groundHeightAt(scene, wx, wz), actorPush);
    }

    particlePool.step(dt, 9.8, true);

    // Evaluar interacciones de Agua (cruce de superficie + ondas cada 0.25s + rieles Spline 3D)
    for (const obj of objects) {
      if (obj.visible && obj.source.followSplineId && !obj.source.vehicle?.enabled) {
        const sp = (scene.splines3d ?? []).find((s) => s.id === obj.source.followSplineId);
        if (sp && sp.points.length >= 2) {
          const curT = splineProgress.get(obj.id) ?? 0;
          const spd = Math.max(0.02, (obj.source.followSplineSpeed ?? 6) * 0.015);
          const nextT = sp.closed ? (curT + spd * dt) % 1 : Math.min(1, curT + spd * dt);
          splineProgress.set(obj.id, nextT);
          const pt = sampleSpline3D(sp.points, sp.closed, nextT);
          obj.t3.x = pt.x;
          obj.t3.y = pt.y;
          obj.t3.z = pt.z;
          obj.t3.ry = (Math.atan2(pt.tx, pt.tz) * 180) / Math.PI;
        }
      }
      if (obj.visible && obj.source.mesh3d?.shape === 'water' && obj.source.mesh3d.waterConfig) {
        const wc = obj.source.mesh3d.waterConfig;
        const candidates = objects
          .filter((ent) => ent.visible && ent.id !== obj.id && (ent.type === 'mesh_3d' || Boolean(ent.source.vehicle?.enabled)))
          .map((ent) => {
            const he = getHalfExtents3D(ent);
            return {
              id: ent.id,
              x: ent.t3.x,
              y: ent.t3.y,
              z: ent.t3.z,
              halfY: he.y,
              speed: Math.hypot(ent.vx, ent.vz),
            };
          });
        const wEvents = evaluateWaterEntityInteractions(
          { id: obj.id, x: obj.t3.x, y: obj.t3.y, z: obj.t3.z, config: wc },
          candidates,
          waterTrackers,
          elapsedTime,
          dt
        );
        for (const ev of wEvents) {
          waterInteractionQueue.push(ev);
          if (ev.kind === 'splash') {
            lastSplashPos = { x: ev.x, y: ev.y, z: ev.z, time: elapsedTime };
            particlePool.burst(obj.id, ev.x, ev.y + 0.25, ev.z, 16, {
              enabled: true,
              preset: 'sparks',
              rate: 20,
              maxParticles: 80,
              speedMin: 28,
              speedMax: 85,
              angleDeg: -90,
              spreadDeg: 180,
              gravity: 210,
              sizeStart: 0.34,
              sizeEnd: 0.05,
              lifetime: 0.55,
              colorStart: '#e0f2fe',
              colorEnd: '#38bdf8',
              blendAlpha: 0.9,
            }, true);
          }
        }
      }
    }

    runMechanicsForEvent('tick');
    for (const k of activeJustPressedKeys) {
      runMechanicsForEvent('input.pressed', undefined, undefined, { key: k });
    }
    // Acceso rápido integrado Tecla E para subir/bajar de cualquier vehículo aunque no tenga mecánica manual
    if (!vehicleToggledThisStep && activeJustPressedKeys.has('KeyE')) {
      const actorQuick = (mountedActorId ? objById.get(mountedActorId) : null) ?? resolvePlayerActor();
      if (actorQuick) {
        if (activeMountedVehicleId) {
          const curVeh = objById.get(activeMountedVehicleId);
          if (curVeh && curVeh.source.vehicle?.allowQuickEnterExit !== false) {
            const yaw = (curVeh.t3.ry * Math.PI) / 180;
            actorQuick.t3.x = curVeh.t3.x + Math.cos(yaw) * 2.6;
            actorQuick.t3.z = curVeh.t3.z - Math.sin(yaw) * 2.6;
            const gY = groundHeightAt(scene, actorQuick.t3.x, actorQuick.t3.z);
            const heA = getHalfExtents3D(actorQuick);
            actorQuick.t3.y = Math.max(curVeh.t3.y + 0.5, gY + heA.y);
            actorQuick.t3.rx = 0;
            actorQuick.t3.rz = 0;
            actorQuick.vx = 0;
            actorQuick.vy = 0;
            actorQuick.vz = 0;
            actorQuick.visible = true;
            activeMountedVehicleId = null;
            mountedActorId = null;
            cameraFollowOverride3D = null;
            cameraManualLock = false;
            vehicleToggledThisStep = true;
          }
        } else {
          let nearestVeh: Sim3DObjectState | null = null;
          let bestDist = Infinity;
          for (const cand of objects) {
            if (
              !cand.visible ||
              cand.id === actorQuick.id ||
              !cand.source.vehicle?.enabled ||
              cand.source.vehicle.allowQuickEnterExit === false
            ) {
              continue;
            }
            const xzD = Math.hypot(actorQuick.t3.x - cand.t3.x, actorQuick.t3.z - cand.t3.z);
            if (xzD > 12) continue;
            const d3 = Math.hypot(
              actorQuick.t3.x - cand.t3.x,
              actorQuick.t3.y - cand.t3.y,
              actorQuick.t3.z - cand.t3.z
            );
            if (d3 < bestDist) {
              bestDist = d3;
              nearestVeh = cand;
            }
          }
          if (nearestVeh) {
            const vCfg = nearestVeh.source.vehicle!;
            const vKind = vCfg.vehicleKind ?? 'car';
            const isSaddle =
              vCfg.mountStyle === 'saddle' ||
              (!vCfg.mountStyle && (vKind === 'moto' || vKind === 'horse'));
            activeMountedVehicleId = nearestVeh.id;
            mountedActorId = actorQuick.id;
            actorQuick.vx = 0;
            actorQuick.vy = 0;
            actorQuick.vz = 0;
            if (isSaddle) {
              actorQuick.visible = true;
              const sPos = computeSaddleWorldPosition(
                nearestVeh.t3,
                nearestVeh.t3,
                vCfg.seatOffset ?? { x: 0, y: vKind === 'horse' ? 1.05 : 0.85, z: -0.1 }
              );
              actorQuick.t3.x = sPos.x;
              actorQuick.t3.y = sPos.y;
              actorQuick.t3.z = sPos.z;
              actorQuick.t3.rx = nearestVeh.t3.rx;
              actorQuick.t3.ry = nearestVeh.t3.ry;
              actorQuick.t3.rz = nearestVeh.t3.rz;
            } else {
              actorQuick.visible = false;
              actorQuick.t3.x = nearestVeh.t3.x;
              actorQuick.t3.y = nearestVeh.t3.y;
              actorQuick.t3.z = nearestVeh.t3.z;
            }
            cameraFollowOverride3D = vCfg.parts?.cameraId || nearestVeh.id;
            cameraManualLock = false;
            vehicleToggledThisStep = true;
          }
        }
      }
    }
    for (const pl of compiledPlugins) {
      if (!pl.onUpdate) continue;
      try {
        pl.onUpdate(dt, api);
      } catch (err) {
        logScriptError(`plugin:${pl.id}:onUpdate`, pl.name, err);
      }
    }
    while (queuedEvents.length > 0) {
      const ev = queuedEvents.shift()!;
      runMechanicsForEvent('custom.event', undefined, undefined, { eventName: ev });
      for (const pl of compiledPlugins) {
        if (!pl.onEvent) continue;
        try {
          pl.onEvent(ev, undefined, api);
        } catch (err) {
          logScriptError(`plugin:${pl.id}:onEvent`, pl.name, err);
        }
      }
    }

    // 6. Actualizar SmartCamera3D
    const activeCamObj =
      objects.find((o) => o.id === cameraState.activeCameraId) ??
      objects.find((o) => o.type === 'camera_3d') ??
      null;

    const camCfg: SmartCameraConfig = activeCamObj?.source.camera3d ??
      scene.cameraConfig?.smartCamera ?? {
        isMainCamera: true,
        mode: 'smooth_follow',
        targetObjectId: primaryActor?.id ?? null,
        dampingFactor: 0.14,
        lookAhead: 1.4,
        offsetX: 0,
        offsetY: 6.5,
        offsetZ: 11,
        distance: 11,
        pitchMinDeg: -50,
        pitchMaxDeg: 25,
        fov: 55,
        deadzoneW: 2,
        deadzoneH: 2,
        collideWithWalls: true,
        useBounds: false,
        boundsMinX: -60,
        boundsMaxX: 60,
        boundsMinY: 1,
        boundsMaxY: 40,
        boundsMinZ: -60,
        boundsMaxZ: 60,
      };

    const camTarget =
      (cameraFollowOverride3D ? resolveObjectRef(cameraFollowOverride3D) : null) ??
      resolveObjectRef(camCfg.targetObjectId) ??
      primaryActor;

    const occluders: CameraWallOccluder3D[] = [];
    for (const s of objects) {
      if (!s.visible || s.type !== 'mesh_3d' || dynamicIdSet.has(s.id) || isDescendantOfDynamic(s)) {
        continue;
      }
      const p3 = s.source.physics3d;
      if (p3?.isTrigger) continue;
      const camCol = p3?.cameraCollision ?? 'auto';
      if (camCol === 'never') continue;

      const shape3d = s.source.mesh3d?.shape;
      if (camCol === 'auto') {
        if (p3?.enabled === false) continue;
        if (p3?.bodyType === 'dynamic') continue;
        if (
          shape3d === 'plane' ||
          shape3d === 'terrain' ||
          shape3d === 'water' ||
          shape3d === 'grass_field'
        ) {
          continue;
        }
      } else {
        // cameraCollision === 'always': solo excluir campos de hierba decorativos
        if (shape3d === 'grass_field') continue;
      }

      const sw = getWorldT3(s);
      let tri = trimeshCache.get(s.id);
      if (
        tri === undefined &&
        (p3?.shape === 'mesh_exact' ||
          shape3d === 'arch' ||
          shape3d === 'stairs' ||
          shape3d === 'csg')
      ) {
        tri = buildWorldTrimeshData({ ...s.source, transform3d: sw });
        trimeshCache.set(s.id, tri);
      }

      const useExactTri =
        Boolean(
          tri &&
            tri.triangles.length >= 9 &&
            tri.triangles.length <= 72000 &&
            (p3?.shape === 'mesh_exact' ||
              shape3d === 'arch' ||
              shape3d === 'stairs' ||
              shape3d === 'csg' ||
              shape3d === 'glb')
        );

      if (tri && tri.triangles.length >= 9 && (useExactTri || shape3d === 'glb')) {
        const bw = tri.maxX - tri.minX;
        const bh = tri.maxY - tri.minY;
        const bd = tri.maxZ - tri.minZ;
        const isSmallProp =
          camCol !== 'always' &&
          (bh < 1.25 || (bw < 0.7 && bd < 0.7 && bh < 2.0) || Math.max(bw, bd) < 0.85);
        occluders.push({
          minX: tri.minX,
          maxX: tri.maxX,
          minY: tri.minY,
          maxY: tri.maxY,
          minZ: tri.minZ,
          maxZ: tri.maxZ,
          yawDeg: 0,
          isSmallProp,
          cameraCollision: camCol,
          triangles: useExactTri ? tri.triangles : undefined,
        });
        continue;
      }

      const he = {
        x: p3?.halfExtents?.x ?? Math.max(0.2, Math.abs(sw.sx) * 0.5),
        y: p3?.halfExtents?.y ?? Math.max(0.1, Math.abs(sw.sy) * 0.5),
        z: p3?.halfExtents?.z ?? Math.max(0.2, Math.abs(sw.sz) * 0.5),
      };
      const off = getColliderWorldOffset(sw, p3?.offset);
      const bw = he.x * 2;
      const bh = he.y * 2;
      const bd = he.z * 2;
      const isSmallProp =
        camCol !== 'always' &&
        (bh < 1.25 || (bw < 0.7 && bd < 0.7 && bh < 2.0) || Math.max(bw, bd) < 0.85);
      occluders.push({
        minX: sw.x + off.x - he.x,
        maxX: sw.x + off.x + he.x,
        minY: sw.y + off.y - he.y,
        maxY: sw.y + off.y + he.y,
        minZ: sw.z + off.z - he.z,
        maxZ: sw.z + off.z + he.z,
        yawDeg: sw.ry ?? 0,
        isSmallProp,
        cameraCollision: camCol,
      });
    }

    const camTargetWorld = camTarget ? getWorldT3(camTarget) : null;
    const activeVol = evaluateActiveCameraVolumes(
      scene.cameraVolumes,
      camTargetWorld,
      Boolean(activeMountedVehicleId)
    );
    const effectiveCamCfg = resolveCameraConfigWithVolume(cameraState, camCfg, activeVol);
    if (activeJustPressedKeys.has('KeyV') && effectiveCamCfg.allowShoulderSwap !== false) {
      cameraState.shoulderSide =
        (cameraState.shoulderSide ?? effectiveCamCfg.shoulderSide ?? 1) === 1 ? -1 : 1;
    }

    if (cameraBlend?.active) {
      cameraBlend.elapsed += dt;
      const ratio = Math.min(1, cameraBlend.elapsed / cameraBlend.duration);
      const sm = ratio * ratio * (3 - 2 * ratio);
      cameraState.posX = cameraBlend.from.px + (cameraBlend.to.px - cameraBlend.from.px) * sm;
      cameraState.posY = cameraBlend.from.py + (cameraBlend.to.py - cameraBlend.from.py) * sm;
      cameraState.posZ = cameraBlend.from.pz + (cameraBlend.to.pz - cameraBlend.from.pz) * sm;
      cameraState.lookAtX = cameraBlend.from.lx + (cameraBlend.to.lx - cameraBlend.from.lx) * sm;
      cameraState.lookAtY = cameraBlend.from.ly + (cameraBlend.to.ly - cameraBlend.from.ly) * sm;
      cameraState.lookAtZ = cameraBlend.from.lz + (cameraBlend.to.lz - cameraBlend.from.lz) * sm;
      cameraState.fov = cameraBlend.from.fov + (cameraBlend.to.fov - cameraBlend.from.fov) * sm;
      if (ratio >= 1) {
        cameraBlend.active = false;
        cameraManualLock = true;
      }
    } else if (!cameraManualLock) {
      stepSmartCamera3D(
        cameraState,
        effectiveCamCfg,
        activeCamObj ? getWorldT3(activeCamObj) : { x: 0, y: 7, z: 13 },
        camTarget && camTargetWorld
          ? {
              x: camTargetWorld.x,
              y: camTargetWorld.y,
              z: camTargetWorld.z,
              vx: camTarget.vx,
              vy: camTarget.vy,
              vz: camTarget.vz,
            }
          : null,
        occluders,
        dt,
        (wx, wz) => groundHeightAt(scene, wx, wz)
      );
    }

    if (cameraShakeTimer > 0) {
      cameraState.posX += (Math.random() - 0.5) * cameraShakeIntensity;
      cameraState.posY += (Math.random() - 0.5) * cameraShakeIntensity;
    }
  };

  return {
    objects,
    variables,
    cameraState,
    particlePool,
    softBodySims,
    vehicleSims,
    getLastWaterSplash: () => lastSplashPos,
    consumeWaterInteractionEvents: () => waterInteractionQueue.splice(0, waterInteractionQueue.length),
    getMountedVehicleId: () => activeMountedVehicleId,
    getMountedActorId: () => mountedActorId,
    getElapsedTime: () => elapsedTime,
    getUiOverlayState: () => ({ toasts: activeToasts, widgets: dynamicWidgets }),
    getSunOverride: () => sunOverride,
    getSpawnVersion: () => spawnCounter,
    navMesh,
    wiringSys,
    getCameraFollowOverrideId: () => cameraFollowOverride3D,
    getStreamingState: () => streamingState,
    getChunkManifest: () => chunkManifest,
    getWorldSaveState: () => worldSaveState,
    getStreamingReport: (assets: ProjectAssetMeta[] = []): StreamingProfilerReport | null =>
      chunkManifest && streamingState && streamingSceneView
        ? buildStreamingProfilerReport(streamingSceneView, assets, chunkManifest, streamingState)
        : null,
    logs,
    step,
    registerObjectTrimesh: (id: string, data: WorldTrimeshData | null) => {
      trimeshCache.set(id, data);
    },
    getApi: () => createApi(0),
    emitEvent: (ev: string) => {
      queuedEvents.push(ev);
    },
    triggerObjectClick: (id: string) => {
      const o = resolveObjectRef(id);
      if (o) {
        runMechanicsForEvent('ui.click', o);
        const api = createApi(0);
        for (const b of o.source.scriptBindings ?? []) {
          const e = compiledScripts.get(b.scriptId);
          if (b.enabled && e?.hooks.onClick) {
            try {
              e.hooks.onClick(
                makeHandle(o, { ...(e.hooks.params ?? {}), ...(b.params ?? {}) }),
                api
              );
            } catch (err) {
              logScriptError(`${o.id}:${b.scriptId}:onClick`, e.name, err);
            }
          }
        }
      }
    },
  };
}
