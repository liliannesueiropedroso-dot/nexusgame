import type { NexusScriptAsset, PrefabDefinition } from '../../project/models/project';
import { createId } from '../../utils/id';
import { stageDeltaToParentLocal } from '../core/math';
import { buildGridNav2D, findPath2D, hasLineOfSight2D, type GridNav2D } from '../ai2d/gridPathfinding2d';
import {
  resolvePlatformerConfig,
  resolveTopDownConfig,
  moveTowards,
} from '../physics/characterController2d';
import {
  canLayersCollide,
  getWorldColliders,
  type WorldCollider,
} from '../physics/collision2d';
import type {
  ActionDefinition,
  ConditionDefinition,
  GameMechanic,
  GameObjectData,
  I18nLocale,
  ParticleBurstVisual,
  ProjectVariable,
  SceneData,
  SceneTransitionType,
  StageResolution,
} from '../core/types';
import { getTileCollisionKind } from '../tilemap/autotile2d';
import {
  applyDamageToObject,
  applyObjectTweens,
  cloneTemplateObject,
  emitParticlesFromConfig,
  getParticlePresetDefaults,
  stepEmitterParticles,
  stepExtendedObjectBehavior,
  type RuntimeParticle,
} from './behaviorRuntime';
import { compareValues, evaluateNumericExpression } from './expressionEvaluator';
import {
  compileNexusScript,
  type CompiledScriptEntry,
  type NexusObjectHandle,
  type NexusScriptAPI,
} from '../scripting/scriptRuntime';
import { stepAnimationFSM } from './animFsmEvaluator';
import { getBehaviorEntry } from '../components/behaviorRegistry';
import { PersistenceStore } from '../wiring/persistenceStore';
import { PortalBridge } from '../wiring/portalBridge';
import { EngineWiringSystem } from '../wiring/wiringEngine';

export const FIXED_DT = 1 / 60;

export interface InputState {
  left: boolean;
  right: boolean;
  up: boolean;
  down: boolean;
  jump: boolean;
  axisX?: number;
  axisY?: number;
  action1?: boolean;
  action2?: boolean;
  pointerX?: number;
  pointerY?: number;
  pressedKeys?: Set<string> | string[];
  justPressedKeys?: Set<string> | string[];
  pointerDown?: boolean;
  pointerJustPressed?: boolean;
  pointerJustReleased?: boolean;
  swipeDir?: 'left' | 'right' | 'up' | 'down' | null;
}

export interface BodyPhysicsState {
  vx: number;
  vy: number;
  ax: number;
  ay: number;
  grounded: boolean;
  wasGrounded?: boolean;
  coyoteTimer: number;
  jumpBufferTimer: number;
  jumpsUsed: number;
  originX: number;
  originY: number;
  patrolPhase: number;
  waypointIndex: number;
  waypointForward?: boolean;
  customInitialized?: boolean;
  health: number;
  maxHealth: number;
  invulnerableTimer: number;
  lifetimeRemaining?: number;
}

export interface PendingSoundEvent {
  kind: 'asset' | 'synth' | 'setVolume' | 'musicPlay' | 'musicStop' | 'stopAll';
  assetId?: string;
  preset?: 'coin' | 'jump' | 'hit' | 'powerup' | 'step' | 'win';
  channel: 'music' | 'sfx' | 'ui';
  volume?: number;
  pitch?: number;
  loop?: boolean;
  keepIfSame?: boolean;
  setChannel?: 'master' | 'music' | 'sfx' | 'ui';
  spatialX?: number;
  spatialY?: number;
}

export interface PendingWaitAction {
  remainingSec: number;
  actions: ActionDefinition[];
  mechId: string;
  ownerId?: string;
  otherId?: string;
}

export interface PendingSceneCommand {
  kind: 'load' | 'overlay' | 'pop' | 'restart' | 'nextLevel';
  sceneId?: string;
  transition?: SceneTransitionType;
}

export interface LeaderboardEntry {
  name: string;
  score: number;
  date: number;
}

export interface StorageAdapter {
  get: (key: string) => string | null;
  set: (key: string, value: string) => void;
}

export interface ScreenFlashEffect {
  color: string;
  alpha: number;
  duration: number;
  age: number;
}

export interface SimulationState {
  scene: SceneData;
  elapsed: number;
  accumulator: number;
  score: number;
  bodies: Map<string, BodyPhysicsState>;
  variables: Map<string, number | boolean | string>;
  prevVariables: Map<string, number | boolean | string>;
  persistentVarNames: Set<string>;
  storageAdapter?: StorageAdapter;
  leaderboard: LeaderboardEntry[];
  sceneStarted: boolean;
  activeCollisions: Set<string>;
  activeTriggers: Set<string>;
  prevInput: InputState;
  timerAccumulators: Map<string, number>;
  runtimeTimers: Map<string, number>;
  soundQueue: PendingSoundEvent[];
  particles: ParticleBurstVisual[];
  emitterParticles: RuntimeParticle[];
  screenFlash: ScreenFlashEffect | null;
  flashTimers: Map<string, { color: string; remaining: number }>;
  visualSquash: Map<string, { sx: number; sy: number }>;
  tweenStates: Map<string, { elapsed: number; playing: boolean }>;
  shakeTimeRemaining: number;
  shakeIntensity: number;
  runtimeLogs: string[];
  clickedObjectIds: string[];
  hoveredObjectId: string | null;
  emittedEvents: string[];
  portalEventsQueue: Array<'adClosed' | 'rewarded'>;
  countdownZeroQueue: string[];
  pendingWaits: PendingWaitAction[];
  pendingSceneCommand: PendingSceneCommand | null;
  pendingPauseToggle: boolean;
  paused: boolean;
  checkpoint: { x: number; y: number } | null;
  cameraPos: { x: number; y: number };
  prefabMap: Map<string, PrefabDefinition>;
  stage: StageResolution;
  compiledScripts?: Map<string, CompiledScriptEntry>;
  scriptObjectData?: Map<string, Record<string, unknown>>;
  startedScriptBindings?: Set<string>;
  scriptActivePairs?: Set<string>;
  loggedScriptErrors?: Set<string>;
  scriptTweens?: Array<{
    targetId: string;
    elapsed: number;
    duration: number;
    from: Record<string, number>;
    to: Record<string, number>;
  }>;
  pendingUiCommands?: Array<{ op: 'open' | 'close' | 'toggle'; target: string }>;
  dynamicToasts?: Array<{ id: string; text: string; remaining: number }>;
  dynamicWidgets?: Array<{ id: string; html: string; x: number; y: number; css?: string; visible: boolean }>;
  wiringSys?: EngineWiringSystem;
  cameraFollowOverrideId?: string | null;
  pendingDialogueId?: string | null;
  pendingLocale?: I18nLocale | null;
  tileDamageZones?: Array<{ left: number; right: number; top: number; bottom: number; dps: number }>;
}

interface SolidBox {
  left: number;
  right: number;
  top: number;
  bottom: number;
  layer: WorldCollider['layer'];
  mask?: WorldCollider['mask'];
  oneWay?: boolean;
}

function getHealthComponent(obj: GameObjectData) {
  return obj.components.find(
    (c) => c.enabled && (c.type === 'health' || c.type === 'combat.health_system')
  );
}

function createBodyForObject(obj: GameObjectData): BodyPhysicsState {
  const healthComp = getHealthComponent(obj);
  const destructible = obj.components.find(
    (c) => c.enabled && c.type === 'arcade.destructible'
  );
  const projComp = obj.components.find((c) => c.enabled && c.type === 'projectile');
  const maxHealth = Number(
    healthComp?.config.maxHealth ??
      healthComp?.config.maxHp ??
      destructible?.config.hitsToBreak ??
      100
  );
  const currentHealth = Number(
    healthComp?.config.currentHealth ?? healthComp?.config.currentHp ?? maxHealth
  );
  const lifetime = projComp?.config.lifetime ?? projComp?.config.lifetimeSec;
  return {
    vx: projComp ? Number(projComp.config.vx ?? 360) : 0,
    vy: projComp ? Number(projComp.config.vy ?? 0) : 0,
    ax: 0,
    ay: 0,
    grounded: false,
    wasGrounded: false,
    coyoteTimer: 0,
    jumpBufferTimer: 0,
    jumpsUsed: 0,
    originX: obj.transform.x,
    originY: obj.transform.y,
    patrolPhase: 0,
    waypointIndex: 0,
    waypointForward: true,
    health: currentHealth,
    maxHealth,
    invulnerableTimer: 0,
    lifetimeRemaining: projComp ? Number(lifetime ?? 2.5) : undefined,
  };
}

function collectSolidBoxes(
  objects: GameObjectData[],
  objectMap: Map<string, GameObjectData>,
  damageZones?: Array<{ left: number; right: number; top: number; bottom: number; dps: number }>
): SolidBox[] {
  const boxes: SolidBox[] = [];
  for (const obj of objects) {
    if (!obj.visible) continue;
    const hasSolid = obj.components.some((c) => c.enabled && c.type === 'solid');
    const isStaticBody = obj.rigidbody?.bodyType === 'static';
    if (!hasSolid && !isStaticBody) continue;

    if (obj.type === 'tilemap' && obj.tilemap && hasSolid) {
      const tm = obj.tilemap;
      const sx = obj.transform.scaleX;
      const sy = obj.transform.scaleY;
      const originX = obj.transform.x - tm.cols * tm.tileWidth * sx * obj.transform.anchorX;
      const originY = obj.transform.y - tm.rows * tm.tileHeight * sy * obj.transform.anchorY;
      const tw = tm.tileWidth * sx;
      const th = tm.tileHeight * sy;
      for (const [key, tileIdx] of Object.entries(tm.cells)) {
        const [cs, rs] = key.split(',');
        const col = Number(cs);
        const row = Number(rs);
        if (!Number.isFinite(col) || !Number.isFinite(row)) continue;
        const tileMeta = getTileCollisionKind(tm, Number(tileIdx));
        if (tileMeta.kind === 'none') continue;
        const left = originX + col * tw;
        const top = originY + row * th;
        if (tileMeta.kind === 'damage') {
          damageZones?.push({
            left,
            right: left + tw,
            top,
            bottom: top + th,
            dps: tileMeta.damagePerSec,
          });
          continue;
        }
        boxes.push({
          left,
          right: left + tw,
          top,
          bottom: top + th,
          layer: obj.layer ?? 'Ground',
          oneWay: tileMeta.kind === 'one_way',
        });
      }
    } else {
      const cols = getWorldColliders(obj, objectMap);
      for (const c of cols) {
        if (c.isSensor) continue;
        boxes.push({
          left: c.left,
          right: c.right,
          top: c.top,
          bottom: c.bottom,
          layer: c.layer,
          mask: c.mask,
        });
      }
    }
  }
  return boxes;
}

function getMoverSolidColliders(
  obj: GameObjectData,
  objectMap?: Map<string, GameObjectData>
): WorldCollider[] {
  return getWorldColliders(obj, objectMap).filter((c) => !c.isSensor);
}

function boxOverlaps(
  a: { left: number; right: number; top: number; bottom: number },
  b: SolidBox
): boolean {
  return a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top;
}

function applyStagePushout(
  obj: GameObjectData,
  dxStage: number,
  dyStage: number,
  objectMap: Map<string, GameObjectData>
): void {
  if (!obj.parentId) {
    obj.transform.x += dxStage;
    obj.transform.y += dyStage;
    return;
  }
  const local = stageDeltaToParentLocal(dxStage, dyStage, obj.parentId, objectMap);
  obj.transform.x += local.x;
  obj.transform.y += local.y;
}

function resolveAxisHorizontal(
  obj: GameObjectData,
  body: BodyPhysicsState,
  solids: SolidBox[],
  objectMap: Map<string, GameObjectData>
): boolean {
  let collided = false;
  const cols = getMoverSolidColliders(obj, objectMap);
  for (const col of cols) {
    for (const solid of solids) {
      if (solid.oneWay) continue;
      if (!canLayersCollide(col.layer, solid.layer, col.mask, solid.mask)) continue;
      if (boxOverlaps(col, solid)) {
        collided = true;
        if (body.vx > 0) {
          applyStagePushout(obj, -(col.right - solid.left), 0, objectMap);
        } else if (body.vx < 0) {
          applyStagePushout(obj, solid.right - col.left, 0, objectMap);
        }
        body.vx = 0;
        resolveAxisHorizontalRecursive(obj, body, solids, objectMap, 2);
        return true;
      }
    }
  }
  return collided;
}

function resolveAxisHorizontalRecursive(
  obj: GameObjectData,
  body: BodyPhysicsState,
  solids: SolidBox[],
  objectMap: Map<string, GameObjectData>,
  depth: number
): void {
  if (depth <= 0) return;
  const cols = getMoverSolidColliders(obj, objectMap);
  for (const col of cols) {
    for (const solid of solids) {
      if (solid.oneWay) continue;
      if (!canLayersCollide(col.layer, solid.layer, col.mask, solid.mask)) continue;
      if (boxOverlaps(col, solid)) {
        if (col.cx < (solid.left + solid.right) * 0.5) {
          applyStagePushout(obj, -(col.right - solid.left), 0, objectMap);
        } else {
          applyStagePushout(obj, solid.right - col.left, 0, objectMap);
        }
        body.vx = 0;
        return;
      }
    }
  }
}

function resolveAxisVertical(
  obj: GameObjectData,
  body: BodyPhysicsState,
  solids: SolidBox[],
  objectMap: Map<string, GameObjectData>
): void {
  body.grounded = false;
  for (let pass = 0; pass < 2; pass++) {
    let adjusted = false;
    const cols = getMoverSolidColliders(obj, objectMap);
    for (const col of cols) {
      for (const solid of solids) {
        if (!canLayersCollide(col.layer, solid.layer, col.mask, solid.mask)) continue;
        if (boxOverlaps(col, solid)) {
          if (solid.oneWay) {
            const prevBottom = col.bottom - body.vy * FIXED_DT;
            if (body.vy >= 0 && prevBottom <= solid.top + 8) {
              applyStagePushout(obj, 0, -(col.bottom - solid.top), objectMap);
              body.vy = 0;
              body.grounded = true;
              adjusted = true;
              break;
            }
            continue;
          }
          if (body.vy >= 0) {
            applyStagePushout(obj, 0, -(col.bottom - solid.top), objectMap);
            body.vy = 0;
            body.grounded = true;
          } else {
            applyStagePushout(obj, 0, solid.bottom - col.top, objectMap);
            body.vy = 0;
          }
          adjusted = true;
          break;
        }
      }
      if (adjusted) break;
    }
    if (!adjusted) break;
  }
}

function persistVariableIfNeeded(state: SimulationState, name: string, value: number | boolean | string): void {
  if (state.persistentVarNames.has(name) && state.storageAdapter) {
    try {
      state.storageAdapter.set(`nx_var_${name}`, JSON.stringify(value));
    } catch {
      // Ignorar errores de almacenamiento restringido
    }
  }
}

function readPersistedVariable(
  adapter: StorageAdapter | undefined,
  name: string,
  fallback: number | boolean | string
): number | boolean | string {
  if (!adapter) return fallback;
  try {
    const raw = adapter.get(`nx_var_${name}`);
    if (raw === null || raw === undefined) return fallback;
    const parsed = JSON.parse(raw);
    if (typeof parsed === 'number' || typeof parsed === 'boolean' || typeof parsed === 'string') {
      return parsed;
    }
    return fallback;
  } catch {
    return fallback;
  }
}

function loadLeaderboard(adapter?: StorageAdapter): LeaderboardEntry[] {
  if (!adapter) return [];
  try {
    const raw = adapter.get('nx_leaderboard');
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((e) => e && typeof e.name === 'string' && typeof e.score === 'number')
      .sort((a, b) => b.score - a.score)
      .slice(0, 10);
  } catch {
    return [];
  }
}

function saveLeaderboard(adapter: StorageAdapter | undefined, entries: LeaderboardEntry[]): void {
  if (!adapter) return;
  try {
    adapter.set('nx_leaderboard', JSON.stringify(entries.slice(0, 10)));
  } catch {
    // Ignorar errores de cuota
  }
}

export function createSimulationState(
  sourceScene: SceneData,
  projectVariables: ProjectVariable[] = [],
  options?: {
    prefabs?: PrefabDefinition[];
    scripts?: NexusScriptAsset[];
    stage?: StageResolution;
    preservedVariables?: Map<string, number | boolean | string>;
    storageAdapter?: StorageAdapter;
    leaderboard?: LeaderboardEntry[];
  }
): SimulationState {
  const scene = structuredClone(sourceScene);
  const bodies = new Map<string, BodyPhysicsState>();
  for (const obj of scene.objects) {
    bodies.set(obj.id, createBodyForObject(obj));
  }

  const persistentVarNames = new Set<string>();
  const variables = new Map<string, number | boolean | string>();
  for (const v of projectVariables) {
    if (v.persistent) {
      persistentVarNames.add(v.name);
      variables.set(v.name, readPersistedVariable(options?.storageAdapter, v.name, v.initialValue));
    } else {
      variables.set(v.name, v.initialValue);
    }
  }
  if (options?.preservedVariables) {
    for (const [k, val] of options.preservedVariables.entries()) {
      variables.set(k, val);
    }
  }
  if (!variables.has('puntos')) {
    variables.set('puntos', 0);
  }

  const prefabMap = new Map<string, PrefabDefinition>();
  for (const pf of options?.prefabs ?? []) {
    prefabMap.set(pf.id, structuredClone(pf));
  }

  const compiledScripts = new Map<string, CompiledScriptEntry>();
  const runtimeLogs: string[] = [];
  for (const sc of options?.scripts ?? []) {
    if (sc.kind === 'script') {
      const compiled = compileNexusScript(sc);
      compiledScripts.set(sc.id, compiled);
      if (compiled.error) {
        runtimeLogs.push(`Error compilando ${sc.name}: ${compiled.error}`);
      }
    }
  }

  const leaderboard = options?.leaderboard ?? loadLeaderboard(options?.storageAdapter);

  const storeAdapter = options?.storageAdapter;
  const persistence = new PersistenceStore('local_player');
  if (storeAdapter) {
    try {
      const rawSaved = storeAdapter.get('local_player');
      if (rawSaved) {
        const parsed = JSON.parse(rawSaved) as Partial<typeof persistence.state>;
        if (parsed && typeof parsed === 'object') {
          persistence.state = { ...persistence.state, ...parsed };
        }
      }
    } catch {
      // Ignore malformed custom adapter save
    }
  } else {
    persistence.loadLocal();
  }
  const wiringSys = new EngineWiringSystem(persistence, new PortalBridge('auto'));
  wiringSys.setSceneContext(scene.sceneContext ?? 'gameplay');
  wiringSys.wiringLinks = [...(scene.wiringLinks ?? [])];
  for (const obj of scene.objects) {
    const ent = wiringSys.createEntity({
      id: obj.id,
      name: obj.name,
      role: obj.role ?? (obj.tags?.includes('Player') || obj.tags?.includes('player') ? 'player' : 'generic'),
      transform: { x: obj.transform.x, y: obj.transform.y, z: 0, rotY: obj.transform.rotation },
    });
    for (const c of obj.components) {
      if (c.enabled) {
        const entry = getBehaviorEntry(c.type);
        const inst = wiringSys.addBehavior(obj.id, c.type, c.config, c.source ?? 'manual');
        if (inst && (c.contexts || entry?.contexts)) {
          inst.contexts = c.contexts ?? entry?.contexts ?? ['gameplay'];
        }
      }
    }
    ent.started = true;
  }

  return {
    scene,
    elapsed: 0,
    accumulator: 0,
    score: Number(variables.get('puntos') ?? 0) || 0,
    bodies,
    variables,
    prevVariables: new Map(variables),
    persistentVarNames,
    storageAdapter: options?.storageAdapter,
    leaderboard,
    sceneStarted: false,
    activeCollisions: new Set<string>(),
    activeTriggers: new Set<string>(),
    prevInput: {
      left: false,
      right: false,
      up: false,
      down: false,
      jump: false,
      pressedKeys: [],
      pointerDown: false,
    },
    timerAccumulators: new Map<string, number>(),
    runtimeTimers: new Map<string, number>(),
    soundQueue: [],
    particles: [],
    emitterParticles: [],
    screenFlash: null,
    flashTimers: new Map(),
    visualSquash: new Map(),
    tweenStates: new Map(),
    shakeTimeRemaining: 0,
    shakeIntensity: 0,
    runtimeLogs,
    clickedObjectIds: [],
    hoveredObjectId: null,
    emittedEvents: [],
    portalEventsQueue: [],
    countdownZeroQueue: [],
    pendingWaits: [],
    pendingSceneCommand: null,
    pendingPauseToggle: false,
    paused: false,
    checkpoint: null,
    cameraPos: { x: 0, y: 0 },
    prefabMap,
    stage: options?.stage ?? { width: 1280, height: 720 },
    compiledScripts,
    scriptObjectData: new Map(),
    startedScriptBindings: new Set(),
    scriptActivePairs: new Set(),
    loggedScriptErrors: new Set(),
    scriptTweens: [],
    pendingUiCommands: [],
    dynamicToasts: [],
    dynamicWidgets: [],
    wiringSys,
    cameraFollowOverrideId: null,
  };
}

export function isKeyPressed(key: string, input: InputState): boolean {
  if (input.pressedKeys) {
    if (input.pressedKeys instanceof Set) {
      if (input.pressedKeys.has(key)) return true;
    } else if (Array.isArray(input.pressedKeys)) {
      if (input.pressedKeys.includes(key)) return true;
    }
  }
  switch (key) {
    case 'Space':
      return Boolean(input.jump);
    case 'ArrowLeft':
    case 'KeyA':
      return Boolean(input.left);
    case 'ArrowRight':
    case 'KeyD':
      return Boolean(input.right);
    case 'ArrowUp':
    case 'KeyW':
      return Boolean(input.up);
    case 'ArrowDown':
    case 'KeyS':
      return Boolean(input.down);
    case 'KeyE':
    case 'KeyJ':
    case 'KeyZ':
      return Boolean(input.action1);
    case 'KeyK':
    case 'KeyX':
    case 'ShiftLeft':
      return Boolean(input.action2);
    default:
      return false;
  }
}

function readObjectProperty(
  obj: GameObjectData,
  prop: string,
  state: SimulationState
): number | boolean | string {
  const body = state.bodies.get(obj.id);
  switch (prop) {
    case 'x':
      return obj.transform.x;
    case 'y':
      return obj.transform.y;
    case 'rotation':
      return obj.transform.rotation;
    case 'scaleX':
      return obj.transform.scaleX;
    case 'scaleY':
      return obj.transform.scaleY;
    case 'opacity':
      return obj.opacity;
    case 'vx':
      return body?.vx ?? 0;
    case 'vy':
      return body?.vy ?? 0;
    case 'health':
      return body?.health ?? 0;
    case 'visible':
      return obj.visible;
    case 'flipped':
      return Boolean(obj.sprite?.flipX);
    default:
      return 0;
  }
}

function evaluateSingleCondition(
  cond: ConditionDefinition,
  state: SimulationState,
  objectMap: Map<string, GameObjectData>,
  input: InputState
): boolean {
  switch (cond.type) {
    case 'boolean': {
      const val = cond.variable ? state.variables.get(cond.variable) : false;
      return Boolean(val) === (cond.value === undefined ? true : Boolean(cond.value));
    }
    case 'variable.compare': {
      const left = cond.variable ? state.variables.get(cond.variable) ?? 0 : 0;
      const op = cond.operator ?? '==';
      return compareValues(left, op, cond.value ?? 0);
    }
    case 'variable.objectCompare': {
      const left = cond.variable ? state.variables.get(cond.variable) ?? 0 : 0;
      const right = cond.secondaryVariable ? state.variables.get(cond.secondaryVariable) ?? 0 : 0;
      return compareValues(left, cond.operator ?? '==', right);
    }
    case 'object.visible': {
      const obj = cond.target ? objectMap.get(cond.target) : undefined;
      const expected = cond.value === undefined ? true : Boolean(cond.value);
      return Boolean(obj && obj.visible === expected);
    }
    case 'object.exists': {
      const obj = cond.target ? objectMap.get(cond.target) : undefined;
      return Boolean(obj);
    }
    case 'object.grounded': {
      const body = cond.target ? state.bodies.get(cond.target) : undefined;
      const expected = cond.value === undefined ? true : Boolean(cond.value);
      return Boolean(body && body.grounded === expected);
    }
    case 'object.property': {
      const obj = cond.target ? objectMap.get(cond.target) : undefined;
      if (!obj) return false;
      const val = readObjectProperty(obj, cond.property ?? 'x', state);
      return compareValues(val, cond.operator ?? '==', cond.value ?? 0);
    }
    case 'object.hasTag': {
      const obj = cond.target ? objectMap.get(cond.target) : undefined;
      const tag = String(cond.tag ?? cond.value ?? '').trim();
      return Boolean(obj && tag && obj.tags?.includes(tag));
    }
    case 'object.animating': {
      const obj = cond.target ? objectMap.get(cond.target) : undefined;
      return Boolean(obj?.sprite?.animation?.enabled && obj.sprite.animation.playing);
    }
    case 'object.flipped': {
      const obj = cond.target ? objectMap.get(cond.target) : undefined;
      const expected = cond.value === undefined ? true : Boolean(cond.value);
      return Boolean(obj && Boolean(obj.sprite?.flipX) === expected);
    }
    case 'health.compare': {
      const body = cond.target ? state.bodies.get(cond.target) : undefined;
      if (!body) return false;
      return compareValues(body.health, cond.operator ?? '<=', Number(cond.value ?? 0));
    }
    case 'state.is': {
      const obj = cond.target ? objectMap.get(cond.target) : undefined;
      return Boolean(obj?.stateMachine && obj.stateMachine.currentState === String(cond.value ?? ''));
    }
    case 'input.held': {
      return isKeyPressed(cond.key ?? 'Space', input);
    }
    case 'distance.less': {
      const a = cond.target ? objectMap.get(cond.target) : undefined;
      const b = cond.secondaryTarget ? objectMap.get(cond.secondaryTarget) : undefined;
      if (!a || !b || !a.visible || !b.visible) return false;
      const maxD = Number(cond.value ?? 120);
      return Math.hypot(a.transform.x - b.transform.x, a.transform.y - b.transform.y) <= maxD;
    }
    case 'distance.greater': {
      const a = cond.target ? objectMap.get(cond.target) : undefined;
      const b = cond.secondaryTarget ? objectMap.get(cond.secondaryTarget) : undefined;
      if (!a || !b || !a.visible || !b.visible) return false;
      const minD = Number(cond.value ?? 200);
      return Math.hypot(a.transform.x - b.transform.x, a.transform.y - b.transform.y) > minD;
    }
    case 'random.chance': {
      const pct = Math.max(0, Math.min(100, Number(cond.value ?? 50)));
      return Math.random() * 100 < pct;
    }
    default:
      return true;
  }
}

function evaluateConditions(
  mech: GameMechanic,
  state: SimulationState,
  objectMap: Map<string, GameObjectData>,
  input: InputState
): boolean {
  if (!mech.conditions || mech.conditions.length === 0) return true;
  const combinator = mech.conditionCombinator ?? 'all';
  if (combinator === 'any') {
    return mech.conditions.some((c) => evaluateSingleCondition(c, state, objectMap, input));
  }
  if (combinator === 'none') {
    return mech.conditions.every((c) => !evaluateSingleCondition(c, state, objectMap, input));
  }
  return mech.conditions.every((c) => evaluateSingleCondition(c, state, objectMap, input));
}

function spawnPrefabInstance(
  prefab: PrefabDefinition,
  x: number,
  y: number,
  state: SimulationState
): GameObjectData[] {
  const idRemap = new Map<string, string>();
  for (const o of prefab.objects) {
    idRemap.set(o.id, createId('inst'));
  }
  const rootOld = prefab.objects.find((o) => o.id === prefab.rootObjectId) ?? prefab.objects[0];
  const baseX = rootOld ? rootOld.transform.x : 0;
  const baseY = rootOld ? rootOld.transform.y : 0;

  return prefab.objects.map((orig) => {
    const copy = structuredClone(orig);
    copy.id = idRemap.get(orig.id)!;
    copy.prefabId = prefab.id;
    copy.parentId = orig.parentId && idRemap.has(orig.parentId) ? idRemap.get(orig.parentId)! : null;
    if (copy.parentId === null) {
      copy.transform.x = x + (orig.transform.x - baseX);
      copy.transform.y = y + (orig.transform.y - baseY);
    }
    state.scene.objects.push(copy);
    state.bodies.set(copy.id, createBodyForObject(copy));
    return copy;
  });
}

interface ActionTargetContext {
  owner?: GameObjectData;
  other?: GameObjectData;
}

function resolveActionTarget(
  ref: unknown,
  objectMap: Map<string, GameObjectData>,
  ctx?: ActionTargetContext
): GameObjectData | undefined {
  if (!ref) return undefined;
  const s = String(ref).trim();
  if (!s) return undefined;
  if (s === '$self' || s === 'self') return ctx?.owner;
  if (s === '$other' || s === 'other') return ctx?.other;
  const direct = objectMap.get(s);
  if (direct) return direct;
  for (const o of objectMap.values()) {
    if (o.name === s) return o;
  }
  return undefined;
}

function executeActionList(
  actions: ActionDefinition[],
  mechId: string,
  state: SimulationState,
  objectMap: Map<string, GameObjectData>,
  ctx?: ActionTargetContext
): void {
  for (let i = 0; i < actions.length; i++) {
    const action = actions[i];
    const p = action.parameters ?? {};

    if (action.type === 'wait') {
      const waitSec = Math.max(0.01, Number(p.seconds ?? p.duration ?? 0.5));
      const remaining = actions.slice(i + 1);
      if (remaining.length > 0) {
        state.pendingWaits.push({
          remainingSec: waitSec,
          actions: remaining,
          mechId,
          ownerId: ctx?.owner?.id,
          otherId: ctx?.other?.id,
        });
      }
      break;
    }

    switch (action.type) {
      case 'variable.add': {
        const varName = String(p.variable ?? 'puntos');
        const current = Number(state.variables.get(varName) ?? 0) || 0;
        const delta = evaluateNumericExpression(
          (p.amount as string | number) ?? 1,
          state.variables
        );
        const next = current + delta;
        state.variables.set(varName, next);
        persistVariableIfNeeded(state, varName, next);
        if (varName === 'puntos' || varName === 'score') {
          state.score = next;
        }
        break;
      }
      case 'variable.set': {
        const varName = String(p.variable ?? 'puntos');
        const rawVal = p.value;
        const nextVal =
          typeof rawVal === 'boolean'
            ? rawVal
            : typeof rawVal === 'number'
              ? rawVal
              : !Number.isNaN(Number(rawVal)) && String(rawVal).trim() !== ''
                ? Number(rawVal)
                : String(rawVal ?? '');
        state.variables.set(varName, nextVal);
        persistVariableIfNeeded(state, varName, nextVal);
        if ((varName === 'puntos' || varName === 'score') && typeof nextVal === 'number') {
          state.score = nextVal;
        }
        break;
      }
      case 'audio.play': {
        const assetId = String(p.assetId ?? p.asset ?? '');
        if (assetId) {
          const baseVol = Number(p.volume ?? 1);
          const basePitch = Number(p.pitch ?? 1);
          const randPitch = Number(p.randomPitch ?? 0);
          const pitch = basePitch + (randPitch > 0 ? (Math.random() * 2 - 1) * randPitch : 0);
          const channel = (p.channel as 'music' | 'sfx' | 'ui') ?? 'sfx';
          const loop = Boolean(p.loop);
          const originObj = resolveActionTarget(p.target, objectMap, ctx) ?? ctx?.owner;
          state.soundQueue.push({
            kind: channel === 'music' ? 'musicPlay' : 'asset',
            assetId,
            channel,
            volume: Math.max(0, Math.min(2, baseVol)),
            pitch: Math.max(0.25, Math.min(3, pitch)),
            loop,
            spatialX: originObj ? originObj.transform.x : undefined,
            spatialY: originObj ? originObj.transform.y : undefined,
          });
        }
        break;
      }
      case 'music.play': {
        const assetId = String(p.assetId ?? p.asset ?? '');
        if (assetId) {
          state.soundQueue.push({
            kind: 'musicPlay',
            assetId,
            channel: 'music',
            volume: Math.max(0, Math.min(1.5, Number(p.volume ?? 0.85))),
            pitch: Math.max(0.25, Math.min(3, Number(p.pitch ?? 1))),
            loop: p.loop !== false,
            keepIfSame: p.keepIfSame !== false,
          });
        }
        break;
      }
      case 'music.stop': {
        state.soundQueue.push({
          kind: 'musicStop',
          channel: 'music',
        });
        break;
      }
      case 'audio.stopAll': {
        state.soundQueue.push({
          kind: 'stopAll',
          channel: 'sfx',
        });
        break;
      }
      case 'audio.beep': {
        const baseVol = Number(p.volume ?? 1);
        const basePitch = Number(p.pitch ?? 1);
        const randPitch = Number(p.randomPitch ?? 0);
        const randVol = Number(p.randomVolume ?? 0);
        const pitch = basePitch + (randPitch > 0 ? (Math.random() * 2 - 1) * randPitch : 0);
        const vol = baseVol + (randVol > 0 ? (Math.random() * 2 - 1) * randVol : 0);
        state.soundQueue.push({
          kind: 'synth',
          preset: (p.preset as PendingSoundEvent['preset']) ?? 'coin',
          channel: (p.channel as 'music' | 'sfx' | 'ui') ?? 'sfx',
          volume: Math.max(0.05, Math.min(2, vol)),
          pitch: Math.max(0.25, Math.min(3, pitch)),
        });
        break;
      }
      case 'audio.setVolume': {
        state.soundQueue.push({
          kind: 'setVolume',
          channel: 'sfx',
          setChannel: (p.channel as 'master' | 'music' | 'sfx' | 'ui') ?? 'master',
          volume: Math.max(0, Math.min(1, Number(p.volume ?? 0.8))),
        });
        break;
      }
      case 'object.destroy':
      case 'object.hide': {
        const target = resolveActionTarget(p.target, objectMap, ctx);
        if (target && target.visible) {
          target.visible = false;
          for (const c of target.components) {
            if (c.enabled && c.type === 'audio.sound_trigger' && c.config.event === 'onDestroy') {
              const aid = String(c.config.audioAssetId ?? '');
              const ch = (c.config.channel as 'sfx' | 'music' | 'ui') ?? 'sfx';
              const vol = Number(c.config.volume ?? 1);
              const pitch = Number(c.config.pitch ?? 1);
              if (aid) {
                state.soundQueue.push({ kind: 'asset', assetId: aid, channel: ch, volume: vol, pitch });
              } else {
                state.soundQueue.push({
                  kind: 'synth',
                  preset: (c.config.preset as PendingSoundEvent['preset']) ?? 'hit',
                  channel: ch,
                  volume: vol,
                  pitch,
                });
              }
            }
          }
        }
        break;
      }
      case 'object.show': {
        const target = resolveActionTarget(p.target, objectMap, ctx);
        if (target) target.visible = true;
        break;
      }
      case 'object.move': {
        const target = resolveActionTarget(p.target, objectMap, ctx);
        if (target) {
          target.transform.x += Number(p.dx ?? 0);
          target.transform.y += Number(p.dy ?? 0);
        }
        break;
      }
      case 'object.teleport': {
        const target = resolveActionTarget(p.target, objectMap, ctx);
        if (target) {
          if (p.toCheckpoint && state.checkpoint) {
            target.transform.x = state.checkpoint.x;
            target.transform.y = state.checkpoint.y;
          } else {
            if (p.x !== undefined) target.transform.x = Number(p.x);
            if (p.y !== undefined) target.transform.y = Number(p.y);
          }
          const body = state.bodies.get(target.id);
          if (body) {
            body.vx = 0;
            body.vy = 0;
          }
        }
        break;
      }
      case 'object.spawn': {
        const tpl = resolveActionTarget(p.target, objectMap, ctx);
        if (tpl) {
          const anchor = p.atObjectId ? resolveActionTarget(p.atObjectId, objectMap, ctx) : undefined;
          const sx = anchor ? anchor.transform.x + Number(p.offsetX ?? 0) : Number(p.x ?? tpl.transform.x);
          const sy = anchor ? anchor.transform.y + Number(p.offsetY ?? 0) : Number(p.y ?? tpl.transform.y);
          cloneTemplateObject(state, objectMap, tpl, sx, sy);
        }
        break;
      }
      case 'object.setProperty': {
        const target = resolveActionTarget(p.target, objectMap, ctx);
        if (target) {
          const prop = String(p.property ?? 'opacity');
          const val = Number(p.value ?? 1);
          if (prop === 'x') target.transform.x = val;
          else if (prop === 'y') target.transform.y = val;
          else if (prop === 'rotation') target.transform.rotation = val;
          else if (prop === 'scaleX') target.transform.scaleX = val;
          else if (prop === 'scaleY') target.transform.scaleY = val;
          else if (prop === 'opacity') target.opacity = Math.max(0, Math.min(1, val));
          else if (prop === 'flipX' && target.sprite) target.sprite.flipX = Boolean(p.value);
          else if (prop === 'text' && target.text) target.text.text = String(p.value ?? '');
        }
        break;
      }
      case 'object.rotateToward': {
        const target = resolveActionTarget(p.target, objectMap, ctx);
        const lookAt = resolveActionTarget(p.lookAtTarget, objectMap, ctx);
        if (target && lookAt) {
          const angle = Math.atan2(
            lookAt.transform.y - target.transform.y,
            lookAt.transform.x - target.transform.x
          );
          target.transform.rotation = (angle * 180) / Math.PI;
        }
        break;
      }
      case 'object.flash': {
        const target = resolveActionTarget(p.target, objectMap, ctx);
        const color = String(p.color ?? '#ffffff');
        const dur = Math.max(0.05, Number(p.duration ?? 0.18));
        if (target) {
          state.flashTimers.set(target.id, { color, remaining: dur });
        } else {
          state.screenFlash = { color, alpha: 0.7, duration: dur, age: 0 };
        }
        break;
      }
      case 'component.toggle': {
        const target = resolveActionTarget(p.target, objectMap, ctx);
        const compType = String(p.componentType ?? '');
        if (target && compType) {
          for (const c of target.components) {
            if (c.type === compType) {
              c.enabled = p.enabled === 'toggle' ? !c.enabled : Boolean(p.enabled ?? true);
            }
          }
        }
        break;
      }
      case 'physics.impulse': {
        const target = resolveActionTarget(p.target, objectMap, ctx);
        const body = target ? state.bodies.get(target.id) : undefined;
        if (body) {
          body.vx += Number(p.ix ?? 0);
          body.vy += Number(p.iy ?? 0);
        }
        break;
      }
      case 'physics.force': {
        const target = resolveActionTarget(p.target, objectMap, ctx);
        const body = target ? state.bodies.get(target.id) : undefined;
        if (body) {
          body.ax += Number(p.fx ?? 0);
          body.ay += Number(p.fy ?? 0);
        }
        break;
      }
      case 'physics.setVelocity': {
        const target = resolveActionTarget(p.target, objectMap, ctx);
        const body = target ? state.bodies.get(target.id) : undefined;
        if (body) {
          if (p.vx !== undefined && p.vx !== '') body.vx = Number(p.vx);
          if (p.vy !== undefined && p.vy !== '') body.vy = Number(p.vy);
        }
        break;
      }
      case 'health.damage': {
        const target = resolveActionTarget(p.target, objectMap, ctx);
        if (target) {
          applyDamageToObject(
            state,
            target,
            Math.max(0, Number(p.amount ?? 10)),
            Number(p.invulnerability ?? 0.35)
          );
        }
        break;
      }
      case 'health.heal': {
        const target = resolveActionTarget(p.target, objectMap, ctx);
        const body = target ? state.bodies.get(target.id) : undefined;
        if (body) {
          const heal = Math.max(0, Number(p.amount ?? 20));
          body.health = Math.min(body.maxHealth, body.health + heal);
          state.variables.set('salud', body.health);
        }
        break;
      }
      case 'animation.play': {
        const target = resolveActionTarget(p.target, objectMap, ctx);
        if (target?.sprite?.animation) {
          target.sprite.animation.enabled = true;
          target.sprite.animation.playing = true;
          if (p.clip) target.sprite.animation.activeClip = String(p.clip);
        }
        break;
      }
      case 'tween.play': {
        const target = resolveActionTarget(p.target, objectMap, ctx);
        const trackName = String(p.trackName ?? '').trim();
        if (target?.tweens) {
          for (const tr of target.tweens) {
            if (!trackName || tr.name === trackName || tr.id === trackName) {
              state.tweenStates.set(`${target.id}:${tr.id}`, { elapsed: 0, playing: true });
            }
          }
        }
        break;
      }
      case 'state.set': {
        const target = resolveActionTarget(p.target, objectMap, ctx);
        if (target) {
          const nextState = String(p.state ?? 'idle');
          const prev = target.stateMachine ?? { currentState: nextState, states: [nextState] };
          target.stateMachine = {
            currentState: nextState,
            states: prev.states.includes(nextState) ? prev.states : [...prev.states, nextState],
          };
        }
        break;
      }
      case 'scene.load': {
        const sceneId = String(p.sceneId ?? '');
        if (sceneId) {
          state.pendingSceneCommand = {
            kind: 'load',
            sceneId,
            transition: (p.transition as SceneTransitionType) ?? 'fadeBlack',
          };
        }
        break;
      }
      case 'scene.overlay': {
        const sceneId = String(p.sceneId ?? '');
        if (sceneId) {
          state.pendingSceneCommand = {
            kind: 'overlay',
            sceneId,
            transition: (p.transition as SceneTransitionType) ?? 'none',
          };
        }
        break;
      }
      case 'scene.pop': {
        state.pendingSceneCommand = { kind: 'pop' };
        break;
      }
      case 'scene.restart': {
        state.pendingSceneCommand = {
          kind: 'restart',
          transition: (p.transition as SceneTransitionType) ?? 'fadeBlack',
        };
        break;
      }
      case 'scene.nextLevel': {
        state.pendingSceneCommand = {
          kind: 'nextLevel',
          sceneId: state.scene.nextSceneId ?? undefined,
          transition: (p.transition as SceneTransitionType) ?? 'fadeBlack',
        };
        break;
      }
      case 'scene.pause': {
        state.pendingPauseToggle = true;
        break;
      }
      case 'checkpoint.save': {
        const target = resolveActionTarget(p.target, objectMap, ctx);
        if (target) {
          state.checkpoint = { x: target.transform.x, y: target.transform.y };
        }
        break;
      }
      case 'prefab.spawn': {
        const pf = p.prefabId ? state.prefabMap.get(String(p.prefabId)) : undefined;
        if (pf) {
          const anchor = p.atObjectId ? resolveActionTarget(p.atObjectId, objectMap, ctx) : undefined;
          const sx = anchor ? anchor.transform.x + Number(p.offsetX ?? 0) : Number(p.x ?? 640);
          const sy = anchor ? anchor.transform.y + Number(p.offsetY ?? 0) : Number(p.y ?? 360);
          const spawned = spawnPrefabInstance(pf, sx, sy, state);
          for (const sp of spawned) {
            objectMap.set(sp.id, sp);
          }
        }
        break;
      }
      case 'camera.shake': {
        state.shakeIntensity = Math.max(state.shakeIntensity, Number(p.intensity ?? 8));
        state.shakeTimeRemaining = Math.max(state.shakeTimeRemaining, Number(p.duration ?? 0.25));
        break;
      }
      case 'particles.burst': {
        const target = resolveActionTarget(p.target, objectMap, ctx);
        const x = target ? target.transform.x : Number(p.x ?? 640);
        const y = target ? target.transform.y : Number(p.y ?? 360);
        state.particles.push({
          x,
          y,
          color: String(p.color ?? '#34d399'),
          count: Math.max(4, Math.min(32, Number(p.count ?? 12))),
          age: 0,
          duration: 0.45,
        });
        break;
      }
      case 'particles.emit': {
        const target = resolveActionTarget(p.target, objectMap, ctx);
        const x = target ? target.transform.x : Number(p.x ?? 640);
        const y = target ? target.transform.y : Number(p.y ?? 360);
        const preset = (p.preset as 'explosion' | 'fire' | 'smoke' | 'sparks' | 'magic' | 'dust' | 'rain' | 'snow') ?? 'explosion';
        const defs = getParticlePresetDefaults(preset);
        emitParticlesFromConfig(
          state,
          x,
          y,
          {
            enabled: true,
            preset,
            rate: 30,
            maxParticles: 120,
            speedMin: defs.speedMin ?? 80,
            speedMax: defs.speedMax ?? 220,
            angleDeg: defs.angleDeg ?? 0,
            spreadDeg: defs.spreadDeg ?? 360,
            gravity: defs.gravity ?? 120,
            sizeStart: defs.sizeStart ?? 6,
            sizeEnd: defs.sizeEnd ?? 1,
            lifetime: defs.lifetime ?? 0.5,
            colorStart: String(p.color ?? defs.colorStart ?? '#fde047'),
            colorEnd: defs.colorEnd ?? '#dc2626',
            blendAlpha: defs.blendAlpha ?? 1,
          },
          Math.max(4, Math.min(48, Number(p.count ?? 18)))
        );
        break;
      }
      case 'storage.save': {
        const vn = String(p.variable ?? 'puntos');
        const val = state.variables.get(vn);
        if (val !== undefined && state.storageAdapter) {
          state.persistentVarNames.add(vn);
          persistVariableIfNeeded(state, vn, val);
        }
        break;
      }
      case 'storage.load': {
        const vn = String(p.variable ?? 'puntos');
        const fallback = state.variables.get(vn) ?? 0;
        const loaded = readPersistedVariable(state.storageAdapter, vn, fallback);
        state.variables.set(vn, loaded);
        if ((vn === 'puntos' || vn === 'score') && typeof loaded === 'number') {
          state.score = loaded;
        }
        break;
      }
      case 'leaderboard.submit': {
        const vn = String(p.variable ?? 'puntos');
        const scoreVal = Number(state.variables.get(vn) ?? state.score) || 0;
        const playerName = String(p.playerName ?? 'Jugador').trim() || 'Jugador';
        state.leaderboard = [
          ...state.leaderboard,
          { name: playerName, score: Math.round(scoreVal), date: Date.now() },
        ]
          .sort((a, b) => b.score - a.score)
          .slice(0, 10);
        saveLeaderboard(state.storageAdapter, state.leaderboard);
        break;
      }
      case 'event.emit': {
        const evName = String(p.eventName ?? '').trim();
        if (evName) {
          state.emittedEvents.push(evName);
        }
        break;
      }
      case 'script.call': {
        const methodName = String(p.methodName ?? '').trim();
        const target = resolveActionTarget(p.target, objectMap, ctx);
        const scriptId = p.scriptId ? String(p.scriptId) : '';
        if (!methodName || !state.compiledScripts) break;
        const callArgsFor = (fn: (...a: unknown[]) => unknown, h: NexusObjectHandle, apiObj: NexusScriptAPI): unknown[] => {
          if (p.arg !== undefined && p.arg !== '') return [h, p.arg, apiObj];
          if (fn.length >= 3) return [h, undefined, apiObj];
          return [h, apiObj];
        };
        if (target) {
          const handle = build2DObjectHandle(target, state, objectMap, {});
          if (p.arg !== undefined && p.arg !== '') handle.call(methodName, p.arg);
          else handle.call(methodName);
        } else if (scriptId) {
          let invoked = false;
          for (const obj of state.scene.objects) {
            const binding = (obj.scriptBindings ?? []).find(
              (b) => b.enabled && b.scriptId === scriptId
            );
            if (!binding) continue;
            const entry = state.compiledScripts.get(scriptId);
            const fn = entry?.hooks[methodName];
            if (typeof fn === 'function') {
              invoked = true;
              try {
                const typedFn = fn as (...a: unknown[]) => unknown;
                const h = build2DObjectHandle(
                  obj,
                  state,
                  objectMap,
                  { ...(entry?.hooks.params ?? {}), ...(binding.params ?? {}) }
                );
                typedFn(...callArgsFor(typedFn, h, build2DScriptApi(state, objectMap, 0)));
              } catch (err) {
                log2DScriptError(state, `${scriptId}:call:${methodName}`, entry?.name ?? scriptId, err);
              }
            }
          }
          if (!invoked) {
            const entry = state.compiledScripts.get(scriptId);
            const fn = entry?.hooks[methodName];
            if (typeof fn === 'function') {
              try {
                const typedFn = fn as (...a: unknown[]) => unknown;
                const sh = build2DSceneHandle(state, objectMap, { ...(entry?.hooks.params ?? {}) });
                typedFn(...callArgsFor(typedFn, sh, build2DScriptApi(state, objectMap, 0)));
              } catch (err) {
                log2DScriptError(state, `${scriptId}:call:${methodName}`, entry?.name ?? scriptId, err);
              }
            }
          }
        }
        break;
      }
      case 'ui.openInterface':
      case 'ui.closeInterface':
      case 'ui.toggleInterface': {
        const targetRef = String(p.target ?? p.widgetId ?? '').trim();
        const op =
          action.type === 'ui.openInterface'
            ? 'open'
            : action.type === 'ui.closeInterface'
              ? 'close'
              : 'toggle';
        const widget = state.scene.objects.find(
          (o) => o.type === 'ui_widget' && (o.id === targetRef || o.name === targetRef)
        );
        if (widget) {
          widget.visible = op === 'open' ? true : op === 'close' ? false : !widget.visible;
        }
        state.pendingUiCommands?.push({ op, target: targetRef });
        break;
      }
      case 'camera.switch': {
        const targetRef = String(p.cameraId ?? p.target ?? '').trim();
        const followObj = state.scene.objects.find(
          (o) => o.id === targetRef || o.name === targetRef
        );
        if (followObj && state.scene.cameraConfig) {
          state.scene.cameraConfig.followObjectId = followObj.id;
        }
        break;
      }
      case 'vehicle.enterExit': {
        // Implementado activamente en el motor 3D (physics3d / HTML5 3D)
        break;
      }
      case 'vfx.emit': {
        const target = resolveActionTarget(p.target, objectMap, ctx);
        const x = target ? target.transform.x : Number(p.x ?? 640);
        const y = target ? target.transform.y : Number(p.y ?? 360);
        const defs = getParticlePresetDefaults('sparks');
        emitParticlesFromConfig(
          state,
          x,
          y,
          target?.particleEmitter ?? {
            enabled: true,
            preset: 'sparks',
            rate: 30,
            maxParticles: 120,
            speedMin: defs.speedMin ?? 80,
            speedMax: defs.speedMax ?? 220,
            angleDeg: defs.angleDeg ?? 0,
            spreadDeg: defs.spreadDeg ?? 360,
            gravity: defs.gravity ?? 120,
            sizeStart: defs.sizeStart ?? 6,
            sizeEnd: defs.sizeEnd ?? 1,
            lifetime: defs.lifetime ?? 0.5,
            colorStart: String(p.color ?? defs.colorStart ?? '#fde047'),
            colorEnd: defs.colorEnd ?? '#dc2626',
            blendAlpha: defs.blendAlpha ?? 1,
          },
          Math.max(4, Math.min(48, Number(p.count ?? 18)))
        );
        break;
      }
      case 'dialogue.start': {
        const dId = String(p.dialogueId ?? p.target ?? '').trim();
        if (dId) {
          state.pendingDialogueId = dId;
        }
        break;
      }
      case 'i18n.setLocale': {
        const loc = String(p.locale ?? 'es');
        if (loc === 'es' || loc === 'en' || loc === 'pt') {
          state.pendingLocale = loc;
        }
        break;
      }
    }
  }
}

function log2DScriptError(
  state: SimulationState,
  errorKey: string,
  scriptName: string,
  err: unknown
): void {
  if (!state.loggedScriptErrors) state.loggedScriptErrors = new Set();
  if (state.loggedScriptErrors.has(errorKey)) return;
  state.loggedScriptErrors.add(errorKey);
  const msg = `Script ${scriptName}: ${err instanceof Error ? err.message : String(err)}`;
  state.runtimeLogs.push(msg);
  if (state.runtimeLogs.length > 60) state.runtimeLogs.shift();
}

function build2DScriptApi(
  state: SimulationState,
  objectMap: Map<string, GameObjectData>,
  dt: number,
  input?: InputState
): NexusScriptAPI {
  const playSfxFn = (id: string, vol = 1) => {
    const knownPresets = new Set(['coin', 'jump', 'hit', 'powerup', 'step', 'win']);
    if (knownPresets.has(id)) {
      state.soundQueue.push({
        kind: 'synth',
        preset: id as PendingSoundEvent['preset'],
        channel: 'sfx',
        volume: vol,
      });
    } else {
      state.soundQueue.push({ kind: 'asset', assetId: id, channel: 'sfx', volume: vol });
    }
  };
  return {
    dt,
    time: state.elapsed,
    findByName: (name) => {
      const f = state.scene.objects.find((o) => o.visible && o.name === name);
      return f ? build2DObjectHandle(f, state, objectMap, {}, input) : null;
    },
    findById: (id) => {
      const f = objectMap.get(id);
      return f && f.visible ? build2DObjectHandle(f, state, objectMap, {}, input) : null;
    },
    findByTag: (tag) =>
      state.scene.objects
        .filter((o) => o.visible && o.tags?.includes(tag))
        .map((o) => build2DObjectHandle(o, state, objectMap, {}, input)),
    getAll: () =>
      state.scene.objects
        .filter((o) => o.visible)
        .map((o) => build2DObjectHandle(o, state, objectMap, {}, input)),
    spawnPrefab: (nameOrId, x = 640, y = 360) => {
      const pf = Array.from(state.prefabMap.values()).find(
        (p) => p.id === nameOrId || p.name === nameOrId
      );
      if (pf) {
        const list = spawnPrefabInstance(pf, x, y, state);
        for (const sp of list) objectMap.set(sp.id, sp);
        return list[0] ? build2DObjectHandle(list[0], state, objectMap, {}, input) : null;
      }
      return null;
    },
    destroyById: (id) => {
      const f = objectMap.get(id);
      if (f) f.visible = false;
    },
    emitEvent: (evName) => {
      if (evName) state.emittedEvents.push(evName);
    },
    log: (msg) => {
      state.runtimeLogs.push(String(msg));
      if (state.runtimeLogs.length > 60) state.runtimeLogs.shift();
    },
    vars: {
      get: (name) => state.variables.get(name),
      set: (name, value) => {
        state.variables.set(name, value);
        persistVariableIfNeeded(state, name, value);
        if ((name === 'puntos' || name === 'score') && typeof value === 'number') state.score = value;
      },
      add: (name, delta) => {
        const next = (Number(state.variables.get(name) ?? 0) || 0) + delta;
        state.variables.set(name, next);
        persistVariableIfNeeded(state, name, next);
        if (name === 'puntos' || name === 'score') state.score = next;
        return next;
      },
    },
    audio: {
      play: playSfxFn,
      playSfx: playSfxFn,
      playMusic: (id, vol = 0.8) => {
        state.soundQueue.push({ kind: 'musicPlay', assetId: id, channel: 'music', volume: vol, loop: true });
      },
      stopMusic: () => state.soundQueue.push({ kind: 'musicStop', channel: 'music' }),
      setBusVolume: (bus, vol) =>
        state.soundQueue.push({ kind: 'setVolume', channel: 'sfx', setChannel: bus, volume: vol }),
      setBusMuted: (bus, muted) =>
        state.soundQueue.push({ kind: 'setVolume', channel: 'sfx', setChannel: bus, volume: muted ? 0 : 1 }),
    },
    particles: {
      burst: (x, y, presetOrColor = '#fde047', countOrPreset = 16, maybeCount) => {
        const count =
          typeof countOrPreset === 'number'
            ? countOrPreset
            : typeof maybeCount === 'number'
              ? maybeCount
              : 16;
        const rawStyle =
          typeof presetOrColor === 'string'
            ? presetOrColor
            : typeof countOrPreset === 'string'
              ? countOrPreset
              : '#fde047';
        const color = rawStyle.startsWith('#') ? rawStyle : '#fde047';
        state.particles.push({
          x,
          y,
          color,
          count: Math.max(4, Math.min(40, Number(count) || 14)),
          age: 0,
          duration: 0.45,
        });
      },
    },
    vfx: {
      emit: (opts) => {
        const tgt =
          typeof opts.target === 'string'
            ? state.scene.objects.find((o) => o.id === opts.target || o.name === opts.target)
            : opts.target?.id
              ? objectMap.get(opts.target.id)
              : undefined;
        const x = opts.x ?? tgt?.transform.x ?? 640;
        const y = opts.y ?? tgt?.transform.y ?? 360;
        const presetId = (opts.preset ?? 'sparks') as 'fire' | 'smoke' | 'sparks' | 'magic' | 'explosion' | 'liquid' | 'waterfall' | 'ripple';
        const defs = getParticlePresetDefaults(presetId);
        emitParticlesFromConfig(
          state,
          x,
          y,
          {
            enabled: true,
            preset: presetId,
            rate: defs.rate ?? 30,
            maxParticles: defs.maxParticles ?? 140,
            speedMin: defs.speedMin ?? 80,
            speedMax: defs.speedMax ?? 220,
            angleDeg: defs.angleDeg ?? -90,
            spreadDeg: defs.spreadDeg ?? 360,
            gravity: defs.gravity ?? 120,
            sizeStart: defs.sizeStart ?? 6,
            sizeEnd: defs.sizeEnd ?? 1,
            lifetime: defs.lifetime ?? 0.6,
            colorStart: opts.color ?? defs.colorStart ?? '#fde047',
            colorEnd: defs.colorEnd ?? '#dc2626',
            blendAlpha: defs.blendAlpha ?? 1,
            particleShape: defs.particleShape,
            emitterShape: defs.emitterShape,
          },
          Math.max(4, Math.min(60, Number(opts.count ?? 20)))
        );
      },
      spawnBurst: (x, y, zOrPreset = 'sparks', presetOrColor, count = 20) => {
        const rawStyle = typeof zOrPreset === 'string' ? zOrPreset : presetOrColor ?? 'sparks';
        const isHex = rawStyle.startsWith('#');
        const presetId = (!isHex ? rawStyle : 'sparks') as 'fire' | 'smoke' | 'sparks' | 'magic' | 'explosion' | 'liquid' | 'waterfall' | 'ripple';
        const defs = getParticlePresetDefaults(presetId);
        emitParticlesFromConfig(
          state,
          x,
          y,
          {
            enabled: true,
            preset: presetId,
            rate: defs.rate ?? 30,
            maxParticles: defs.maxParticles ?? 140,
            speedMin: defs.speedMin ?? 80,
            speedMax: defs.speedMax ?? 220,
            angleDeg: defs.angleDeg ?? -90,
            spreadDeg: defs.spreadDeg ?? 360,
            gravity: defs.gravity ?? 120,
            sizeStart: defs.sizeStart ?? 6,
            sizeEnd: defs.sizeEnd ?? 1,
            lifetime: defs.lifetime ?? 0.6,
            colorStart: (isHex ? rawStyle : defs.colorStart) ?? '#fde047',
            colorEnd: defs.colorEnd ?? '#dc2626',
            blendAlpha: defs.blendAlpha ?? 1,
            particleShape: defs.particleShape,
          },
          Math.max(4, Math.min(60, Number(count) || 20))
        );
      },
    },
    tween: (target, props, durationSec = 0.35) => {
      const targetId = typeof target === 'string' ? target : target?.id;
      const obj = targetId
        ? state.scene.objects.find((o) => o.id === targetId || o.name === targetId)
        : undefined;
      if (!obj) return;
      const from: Record<string, number> = {};
      const to: Record<string, number> = {};
      for (const [k, v] of Object.entries(props)) {
        if (typeof v !== 'number' || !Number.isFinite(v)) continue;
        to[k] = v;
        if (k === 'x') from[k] = obj.transform.x;
        else if (k === 'y') from[k] = obj.transform.y;
        else if (k === 'rotation' || k === 'rz') from[k] = obj.transform.rotation;
        else if (k === 'scaleX') from[k] = obj.transform.scaleX;
        else if (k === 'scaleY') from[k] = obj.transform.scaleY;
        else if (k === 'opacity') from[k] = obj.opacity;
      }
      if (!state.scriptTweens) state.scriptTweens = [];
      state.scriptTweens.push({
        targetId: obj.id,
        elapsed: 0,
        duration: Math.max(0.02, durationSec),
        from,
        to,
      });
    },
    camera: {
      shake: (intensity = 8, duration = 0.25) => {
        state.shakeIntensity = Math.max(state.shakeIntensity, intensity);
        state.shakeTimeRemaining = Math.max(state.shakeTimeRemaining, duration);
      },
      switchCamera: (targetNameOrId) => {
        const followObj = state.scene.objects.find(
          (o) => o.id === targetNameOrId || o.name === targetNameOrId
        );
        if (followObj && state.scene.cameraConfig) {
          state.scene.cameraConfig.followObjectId = followObj.id;
        }
      },
      getForward: () => ({ x: 1, y: 0, z: 0 }),
      getRight: () => ({ x: 1, y: 0, z: 0 }),
      setPosition: (x, y) => {
        if (Number.isFinite(x)) state.cameraPos.x = x;
        if (Number.isFinite(y)) state.cameraPos.y = y;
      },
      lookAt: (x, y) => {
        if (Number.isFinite(x)) state.cameraPos.x = x - state.stage.width * 0.5;
        if (Number.isFinite(y)) state.cameraPos.y = y - state.stage.height * 0.5;
      },
      blendTo: (opts) => {
        if (opts.x !== undefined) state.cameraPos.x = opts.x;
        if (opts.y !== undefined) state.cameraPos.y = opts.y;
      },
    },
    scene: {
      load: (sceneRef) => {
        state.pendingSceneCommand = { kind: 'load', sceneId: sceneRef, transition: 'fadeBlack' };
      },
      restart: () => {
        state.pendingSceneCommand = { kind: 'restart', transition: 'fadeBlack' };
      },
      nextLevel: () => {
        state.pendingSceneCommand = { kind: 'nextLevel', transition: 'fadeBlack' };
      },
    },
    ui: {
      open: (target) => {
        const w = state.scene.objects.find((o) => o.type === 'ui_widget' && (o.id === target || o.name === target));
        if (w) w.visible = true;
        state.pendingUiCommands?.push({ op: 'open', target });
      },
      close: (target) => {
        const w = state.scene.objects.find((o) => o.type === 'ui_widget' && (o.id === target || o.name === target));
        if (w) w.visible = false;
        state.pendingUiCommands?.push({ op: 'close', target });
      },
      toggle: (target) => {
        const w = state.scene.objects.find((o) => o.type === 'ui_widget' && (o.id === target || o.name === target));
        if (w) w.visible = !w.visible;
        state.pendingUiCommands?.push({ op: 'toggle', target });
      },
      showToast: (text, durationSec = 2.5) => {
        if (!state.dynamicToasts) state.dynamicToasts = [];
        const clean = String(text ?? '').trim();
        if (!clean) return;
        state.dynamicToasts.push({ id: createId('toast'), text: clean, remaining: Math.max(0.4, durationSec) });
        if (state.dynamicToasts.length > 5) state.dynamicToasts.shift();
      },
      createWidget: (id, html, opts) => {
        if (!state.dynamicWidgets) state.dynamicWidgets = [];
        const idx = state.dynamicWidgets.findIndex((w) => w.id === id);
        const entry = { id, html: String(html ?? ''), x: opts?.x ?? 24, y: opts?.y ?? 24, css: opts?.css, visible: true };
        if (idx >= 0) state.dynamicWidgets[idx] = entry;
        else state.dynamicWidgets.push(entry);
      },
      updateWidget: (id, patch) => {
        const w = state.dynamicWidgets?.find((item) => item.id === id);
        if (!w) return;
        if (patch.html !== undefined) w.html = patch.html;
        if (patch.text !== undefined) w.html = patch.text;
        if (patch.visible !== undefined) w.visible = Boolean(patch.visible);
      },
      removeWidget: (id) => {
        if (!state.dynamicWidgets) return;
        const idx = state.dynamicWidgets.findIndex((item) => item.id === id);
        if (idx >= 0) state.dynamicWidgets.splice(idx, 1);
      },
      clearWidgets: () => {
        if (state.dynamicWidgets) state.dynamicWidgets.length = 0;
      },
    },
    spawn: {
      clone: (nameOrId, x = 640, y = 360) => {
        const tpl = state.scene.objects.find((o) => o.id === nameOrId || o.name === nameOrId);
        if (tpl) {
          const sp = cloneTemplateObject(state, objectMap, tpl, x, y);
          return build2DObjectHandle(sp, state, objectMap, {}, input);
        }
        return build2DScriptApi(state, objectMap, dt, input).spawnPrefab(nameOrId, x, y);
      },
      primitive: (shape, opts = {}) => {
        const id = createId('prim2d');
        const size = Math.max(16, Number(opts.sx ?? 1) * 48);
        const hSize = Math.max(16, Number(opts.sy ?? 1) * 48);
        const obj: GameObjectData = {
          id,
          name: opts.name || `Forma_${state.scene.objects.length + 1}`,
          type: shape === 'sphere' ? 'circle' : 'rectangle',
          parentId: null,
          visible: true,
          locked: false,
          opacity: 1,
          layer: 'World',
          tags: ['spawned'],
          transform: {
            x: Number(opts.x ?? 640),
            y: Number(opts.y ?? 360),
            rotation: 0,
            scaleX: 1,
            scaleY: 1,
            width: size,
            height: hSize,
            anchorX: 0.5,
            anchorY: 0.5,
          },
          rectangle: shape !== 'sphere' ? { fillColor: opts.color || '#38bdf8', strokeColor: '#ffffff', strokeWidth: 0, cornerRadius: 4 } : undefined,
          circle: shape === 'sphere' ? { fillColor: opts.color || '#38bdf8', strokeColor: '#ffffff', strokeWidth: 0, radius: size * 0.5 } : undefined,
          components: opts.physics === false ? [] : [{ id: createId('cmp'), type: opts.dynamic ? 'rigidbody_box' : 'solid', enabled: true, config: {} }],
        };
        state.scene.objects.push(obj);
        objectMap.set(id, obj);
        state.bodies.set(id, createBodyForObject(obj));
        return build2DObjectHandle(obj, state, objectMap, {}, input);
      },
    },
    world: {
      raycast: (ox, oy, _oz, dx, dy, _dz, maxDist = 800) => {
        const dLen = Math.hypot(dx, dy) || 1;
        const ndx = dx / dLen;
        const ndy = dy / dLen;
        const steps = 32;
        for (let s = 1; s <= steps; s++) {
          const dist = (maxDist * s) / steps;
          const px = ox + ndx * dist;
          const py = oy + ndy * dist;
          for (const cand of state.scene.objects) {
            if (!cand.visible) continue;
            const cols = getWorldColliders(cand, objectMap);
            if (cols.some((c) => px >= c.left && px <= c.right && py >= c.top && py <= c.bottom)) {
              return { hit: true, objectId: cand.id, objectName: cand.name, distance: dist, x: px, y: py, z: 0 };
            }
          }
        }
        return { hit: false, distance: maxDist, x: ox + ndx * maxDist, y: oy + ndy * maxDist, z: 0 };
      },
      getTerrainHeight: () => 0,
    },
    lights: {
      setSun: (opts) => {
        if (!state.scene.lighting) return;
        if (opts.intensity !== undefined) state.scene.lighting.ambientIntensity = opts.intensity;
        if (opts.color !== undefined) state.scene.lighting.ambientColor = opts.color;
      },
      setLight: (nameOrId, opts) => {
        const lObj = state.scene.objects.find((o) => o.id === nameOrId || o.name === nameOrId);
        if (!lObj || !lObj.light2d) return;
        if (opts.intensity !== undefined) lObj.light2d.intensity = opts.intensity;
        if (opts.color !== undefined) lObj.light2d.color = opts.color;
        if (opts.distance !== undefined) lObj.light2d.radius = opts.distance;
        if (opts.visible !== undefined) lObj.visible = Boolean(opts.visible);
      },
    },
    input: {
      isHeld: (k) => (input ? isKeyPressed(k, input) : false),
      justPressed: (k) => (input ? isKeyPressed(k, input) && !isKeyPressed(k, state.prevInput) : false),
      getAxis: () => {
        if (!input) return { x: 0, y: 0 };
        const kx = (input.right ? 1 : 0) - (input.left ? 1 : 0);
        const ky = (input.down ? 1 : 0) - (input.up ? 1 : 0);
        const ax = Math.abs(input.axisX ?? 0) > 0.05 ? Number(input.axisX) : kx;
        const ay = Math.abs(input.axisY ?? 0) > 0.05 ? Number(input.axisY) : ky;
        return { x: ax, y: ay };
      },
    },
  };
}

function build2DSceneHandle(
  state: SimulationState,
  objectMap: Map<string, GameObjectData>,
  params: Record<string, unknown>,
  input?: InputState
): NexusObjectHandle {
  if (!state.scriptObjectData) state.scriptObjectData = new Map();
  const key = `__scene__:${state.scene.id}`;
  let data = state.scriptObjectData.get(key);
  if (!data) {
    data = {};
    state.scriptObjectData.set(key, data);
  }
  return {
    get id() { return state.scene.id; },
    get name() { return state.scene.name; },
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
      if (!state.compiledScripts) return undefined;
      for (const sid of state.scene.scriptIds ?? []) {
        const entry = state.compiledScripts.get(sid);
        const fn = entry?.hooks[methodName];
        if (typeof fn === 'function') {
          return (fn as (...a: unknown[]) => unknown)(
            build2DSceneHandle(state, objectMap, { ...(entry?.hooks.params ?? {}) }, input),
            ...args,
            build2DScriptApi(state, objectMap, 0, input)
          );
        }
      }
      return undefined;
    },
    destroy: () => {},
  };
}

function build2DObjectHandle(
  obj: GameObjectData,
  state: SimulationState,
  objectMap: Map<string, GameObjectData>,
  params: Record<string, unknown>,
  input?: InputState
): NexusObjectHandle {
  const body = state.bodies.get(obj.id);
  if (!state.scriptObjectData) state.scriptObjectData = new Map();
  let data = state.scriptObjectData.get(obj.id);
  if (!data) {
    data = {};
    state.scriptObjectData.set(obj.id, data);
  }
  return {
    get id() { return obj.id; },
    get name() { return obj.name; },
    get type() { return obj.type; },
    get tags() { return obj.tags ?? []; },
    get x() { return obj.transform.x; },
    set x(v: number) { if (Number.isFinite(v)) obj.transform.x = v; },
    get y() { return obj.transform.y; },
    set y(v: number) { if (Number.isFinite(v)) obj.transform.y = v; },
    get z() { return 0; },
    set z(_v: number) {},
    get rx() { return 0; },
    set rx(_v: number) {},
    get ry() { return 0; },
    set ry(_v: number) {},
    get rz() { return obj.transform.rotation; },
    set rz(v: number) { if (Number.isFinite(v)) obj.transform.rotation = v; },
    get rotation() { return obj.transform.rotation; },
    set rotation(v: number) { if (Number.isFinite(v)) obj.transform.rotation = v; },
    get vx() { return body?.vx ?? 0; },
    set vx(v: number) {
      if (body && Number.isFinite(v)) {
        body.vx = v;
        (body as BodyPhysicsState & { scriptVelocityDriven?: boolean }).scriptVelocityDriven = true;
      }
    },
    get vy() { return body?.vy ?? 0; },
    set vy(v: number) {
      if (body && Number.isFinite(v)) {
        body.vy = v;
        (body as BodyPhysicsState & { scriptVelocityDriven?: boolean }).scriptVelocityDriven = true;
      }
    },
    get vz() { return 0; },
    set vz(_v: number) {},
    get scaleX() { return obj.transform.scaleX; },
    set scaleX(v: number) { if (Number.isFinite(v)) obj.transform.scaleX = v; },
    get scaleY() { return obj.transform.scaleY; },
    set scaleY(v: number) { if (Number.isFinite(v)) obj.transform.scaleY = v; },
    get scaleZ() { return 1; },
    set scaleZ(_v: number) {},
    get opacity() { return obj.opacity; },
    set opacity(v: number) { if (Number.isFinite(v)) obj.opacity = v; },
    get visible() { return obj.visible; },
    set visible(v: boolean) { obj.visible = Boolean(v); },
    get isGrounded() { return Boolean(body?.grounded); },
    get speed() { return body ? Math.hypot(body.vx, body.vy) : 0; },
    data,
    params,
    hasTag(tag) {
      return Array.isArray(obj.tags) && obj.tags.includes(tag);
    },
    addTag(tag) {
      if (!Array.isArray(obj.tags)) obj.tags = [];
      if (tag && !obj.tags.includes(tag)) obj.tags.push(tag);
    },
    removeTag(tag) {
      if (Array.isArray(obj.tags)) obj.tags = obj.tags.filter((t) => t !== tag);
    },
    moveTowards(
      targetOrX: { x: number; y: number; z?: number } | number,
      speedOrY: number,
      dtOrMaxStep: number,
      maybeDt?: number
    ) {
      let tx = obj.transform.x;
      let ty = obj.transform.y;
      let maxStep = 0;
      if (typeof targetOrX === 'object' && targetOrX !== null) {
        tx = Number(targetOrX.x ?? obj.transform.x);
        ty = Number(targetOrX.y ?? obj.transform.y);
        maxStep = Number(speedOrY || 0) * Number(dtOrMaxStep || 0);
      } else {
        tx = Number(targetOrX);
        ty = Number(speedOrY);
        maxStep = maybeDt !== undefined ? Number(dtOrMaxStep || 0) * Number(maybeDt || 0) : Number(dtOrMaxStep || 0);
      }
      if (!Number.isFinite(tx) || !Number.isFinite(ty) || !Number.isFinite(maxStep) || maxStep <= 0) return;
      const dx = tx - obj.transform.x;
      const dy = ty - obj.transform.y;
      const d = Math.hypot(dx, dy);
      if (d > 0.001) {
        const s = Math.min(d, maxStep);
        obj.transform.x += (dx / d) * s;
        obj.transform.y += (dy / d) * s;
      }
    },
    applyImpulse(ix, iy) {
      if (body) {
        body.vx += Number(ix || 0);
        body.vy += Number(iy || 0);
        (body as BodyPhysicsState & { scriptVelocityDriven?: boolean }).scriptVelocityDriven = true;
      }
    },
    setVelocity(vx, vy) {
      if (body) {
        body.vx = Number(vx || 0);
        body.vy = Number(vy || 0);
        (body as BodyPhysicsState & { scriptVelocityDriven?: boolean }).scriptVelocityDriven = true;
      }
    },
    playAnim(clipName) {
      if (obj.sprite?.animation) {
        obj.sprite.animation.activeClip = clipName;
        obj.sprite.animation.playing = true;
      }
    },
    setAnimState(stateName) {
      const states = obj.animStateMachine?.states ?? [];
      const matched = states.find((s) => s.name === stateName || s.id === stateName);
      const resolvedName = matched?.name ?? stateName;
      obj.stateMachine = {
        currentState: resolvedName,
        states: states.map((s) => s.name),
      };
      if (obj.sprite) {
        if (!obj.sprite.animation) {
          obj.sprite.animation = {
            enabled: true,
            cols: matched?.cols ?? 4,
            rows: matched?.rows ?? 1,
            frameCount: matched?.frameCount ?? 4,
            fps: 8,
            loop: true,
            playing: true,
          };
        }
        const anim = obj.sprite.animation;
        anim.enabled = true;
        anim.playing = true;
        anim.activeClip = matched?.clipName ?? stateName;
        if (matched) {
          anim.fsmActiveState = {
            stateName: matched.name,
            assetId: matched.assetId ?? obj.sprite.assetId,
            cols: matched.cols ?? anim.cols ?? 4,
            rows: matched.rows ?? anim.rows ?? 1,
            startFrame: matched.startFrame ?? 0,
            frameCount: matched.frameCount ?? anim.frameCount ?? 4,
            fps: Math.max(1, (anim.fps || 8) * Math.max(0.1, matched.timeScale || 1)),
            loop: matched.loopMode !== 'LoopOnce',
          };
        }
      }
    },
    playState(stateName) {
      this.setAnimState(stateName);
    },
    call(methodName, ...args) {
      if (!state.compiledScripts) return undefined;
      for (const b of obj.scriptBindings ?? []) {
        if (!b.enabled) continue;
        const entry = state.compiledScripts.get(b.scriptId);
        const fn = entry?.hooks[methodName];
        if (typeof fn === 'function') {
          const typedFn = fn as (...a: unknown[]) => unknown;
          const h = build2DObjectHandle(obj, state, objectMap, { ...(entry?.hooks.params ?? {}), ...(b.params ?? {}) }, input);
          const apiObj = build2DScriptApi(state, objectMap, 0, input);
          if (args.length === 0 && typedFn.length >= 3) {
            return typedFn(h, undefined, apiObj);
          }
          return typedFn(h, ...args, apiObj);
        }
      }
      return undefined;
    },
    destroy() {
      obj.visible = false;
    },
  };
}

export function stepSimulationFixed(
  state: SimulationState,
  rawDt: number,
  input: InputState
): SimulationState {
  const clamped = Math.min(Math.max(rawDt, 0), 0.1);
  state.accumulator += clamped;
  let substeps = 0;
  while (state.accumulator >= FIXED_DT && substeps < 5) {
    stepSimulation(state, FIXED_DT, input);
    state.accumulator -= FIXED_DT;
    substeps += 1;
  }
  return state;
}

function matchesCollisionTarget(
  obj: GameObjectData,
  mech: GameMechanic
): boolean {
  if (!obj.visible) return false;
  if (mech.trigger.target && obj.id === mech.trigger.target) return true;
  if (mech.trigger.tag && obj.tags?.includes(mech.trigger.tag)) return true;
  if (mech.trigger.layer && obj.layer === mech.trigger.layer) return true;
  return false;
}

export function stepSimulation(
  state: SimulationState,
  dtRaw: number,
  input: InputState
): SimulationState {
  const dt = Math.min(Math.max(dtRaw, 0), 0.05);
  state.elapsed += dt;

  if (state.dynamicToasts && state.dynamicToasts.length > 0) {
    for (let i = state.dynamicToasts.length - 1; i >= 0; i--) {
      state.dynamicToasts[i].remaining -= dt;
      if (state.dynamicToasts[i].remaining <= 0) state.dynamicToasts.splice(i, 1);
    }
  }
  if (state.shakeTimeRemaining > 0) {
    state.shakeTimeRemaining = Math.max(0, state.shakeTimeRemaining - dt);
  }
  if (state.screenFlash) {
    state.screenFlash.age += dt;
    if (state.screenFlash.age >= state.screenFlash.duration) {
      state.screenFlash = null;
    }
  }
  for (const [id, fl] of state.flashTimers.entries()) {
    fl.remaining -= dt;
    if (fl.remaining <= 0) {
      state.flashTimers.delete(id);
    }
  }
  state.particles = state.particles
    .map((pt) => ({ ...pt, age: pt.age + dt }))
    .filter((pt) => pt.age < pt.duration);

  const objects = state.scene.objects;
  const objectMap = new Map(objects.map((o) => [o.id, o]));
  const damageZones: Array<{ left: number; right: number; top: number; bottom: number; dps: number }> = [];
  const solids = collectSolidBoxes(objects, objectMap, damageZones);
  state.tileDamageZones = damageZones;

  // Actualizar temporizadores de espera (Wait)
  if (state.pendingWaits.length > 0) {
    const stillWaiting: PendingWaitAction[] = [];
    for (const w of state.pendingWaits) {
      w.remainingSec -= dt;
      if (w.remainingSec <= 0) {
        const waitCtx =
          w.ownerId || w.otherId
            ? {
                owner: w.ownerId ? objectMap.get(w.ownerId) : undefined,
                other: w.otherId ? objectMap.get(w.otherId) : undefined,
              }
            : undefined;
        executeActionList(w.actions, w.mechId, state, objectMap, waitCtx);
      } else {
        stillWaiting.push(w);
      }
    }
    state.pendingWaits = stillWaiting;
  }

  // Detectar botones UI pulsados
  const clickedSet = new Set(state.clickedObjectIds);
  state.clickedObjectIds = [];
  for (const cid of clickedSet) {
    const btn = objectMap.get(cid);
    if (btn && btn.visible && btn.type === 'ui_button' && btn.uiButton) {
      if (btn.uiButton.clickSoundAssetId) {
        state.soundQueue.push({
          kind: 'asset',
          assetId: btn.uiButton.clickSoundAssetId,
          channel: 'ui',
          volume: btn.uiButton.clickSoundVolume ?? 1,
        });
      } else if (btn.uiButton.clickSoundPreset !== 'none') {
        state.soundQueue.push({
          kind: 'synth',
          preset: (btn.uiButton.clickSoundPreset as PendingSoundEvent['preset']) || 'coin',
          channel: 'ui',
          volume: btn.uiButton.clickSoundVolume ?? 1,
        });
      }
      const act = btn.uiButton.onClickAction;
      if (act === 'load_scene' && btn.uiButton.targetSceneId) {
        state.pendingSceneCommand = {
          kind: 'load',
          sceneId: btn.uiButton.targetSceneId,
          transition: btn.uiButton.transition ?? 'fadeBlack',
        };
      } else if (act === 'overlay_scene' && btn.uiButton.targetSceneId) {
        state.pendingSceneCommand = {
          kind: 'overlay',
          sceneId: btn.uiButton.targetSceneId,
          transition: btn.uiButton.transition ?? 'none',
        };
      } else if (act === 'pop_scene') {
        state.pendingSceneCommand = { kind: 'pop' };
      } else if (act === 'restart_scene') {
        state.pendingSceneCommand = {
          kind: 'restart',
          transition: btn.uiButton.transition ?? 'fadeBlack',
        };
      } else if (act === 'next_level') {
        state.pendingSceneCommand = {
          kind: 'nextLevel',
          sceneId: state.scene.nextSceneId ?? undefined,
          transition: btn.uiButton.transition ?? 'fadeBlack',
        };
      } else if (act === 'emit_event' && btn.uiButton.eventName) {
        state.emittedEvents.push(btn.uiButton.eventName);
      }
    }
  }

  // Localizar jugadores (cualquier controlador jugable)
  const players: GameObjectData[] = [];
  for (const obj of objects) {
    if (!obj.visible) continue;
    const isPlayer = obj.components.some(
      (c) =>
        c.enabled &&
        (c.type === 'player_platformer' ||
          c.type === 'player_topdown' ||
          c.type === 'movement.platformer_pro' ||
          c.type === 'movement.topdown_8dir' ||
          c.type === 'movement.vehicle_drift')
    );
    if (isPlayer) players.push(obj);
  }

  const zeroHealthObjectIds = new Set<string>();
  const wasKeyFn = (code: string) => isKeyPressed(code, state.prevInput);

  let gridNav2dCache: GridNav2D | null = null;
  let solidObjectsCache: GameObjectData[] | null = null;
  const ensureNav2d = () => {
    if (!gridNav2dCache) {
      gridNav2dCache = buildGridNav2D(state.scene, Math.max(1280, state.stage.width), Math.max(720, state.stage.height), 32);
    }
    if (!solidObjectsCache) {
      solidObjectsCache = objects.filter(
        (o) => o.visible && o.components.some((c) => c.enabled && c.type === 'solid')
      );
    }
    return { nav: gridNav2dCache, solidObjs: solidObjectsCache };
  };

  // 1. Tweens + Comportamientos autónomos + Proyectiles
  for (const obj of objects) {
    if (!obj.visible) continue;
    applyObjectTweens(obj, dt, state.tweenStates);

    const body = state.bodies.get(obj.id);
    if (!body) continue;

    if (body.invulnerableTimer > 0) {
      body.invulnerableTimer = Math.max(0, body.invulnerableTimer - dt);
    }

    for (const comp of obj.components) {
      if (!comp.enabled) continue;

      if (comp.type === 'spin') {
        const degPerSec = Number(comp.config.degPerSec ?? 90);
        obj.transform.rotation = (obj.transform.rotation + degPerSec * dt) % 360;
      } else if (comp.type === 'patrol') {
        const axis = comp.config.axis === 'y' ? 'y' : 'x';
        const distance = Number(comp.config.distance ?? 120);
        const speed = Number(comp.config.speed ?? 90);
        const omega = distance > 0 ? speed / distance : 0;
        body.patrolPhase += omega * dt;
        const offset = Math.sin(body.patrolPhase) * distance;
        const prevX = obj.transform.x;
        if (axis === 'x') {
          obj.transform.x = body.originX + offset;
          body.vx = dt > 0 ? (obj.transform.x - prevX) / dt : 0;
        } else {
          const prevY = obj.transform.y;
          obj.transform.y = body.originY + offset;
          body.vy = dt > 0 ? (obj.transform.y - prevY) / dt : 0;
        }
      } else if (comp.type === 'chase_player' && players.length > 0) {
        const baseSpeed = Number(comp.config.speed ?? 130);
        const detectRadius = Number(comp.config.detectRadius ?? 420);
        const stopDistance = Number(comp.config.stopDistance ?? 36);
        const target = players[0];
        const targetBody = state.bodies.get(target.id);
        const fleeRatio = Number(comp.config.fleeHealthRatio ?? obj.aiAgent?.fleeHealthRatio ?? 0.25);
        const insistRatio = Number(comp.config.insistDamageRatio ?? obj.aiAgent?.insistDamageRatio ?? 0.45);
        const myHpRatio = body.maxHealth > 0 ? body.health / body.maxHealth : 1;
        const targetHpRatio = targetBody && targetBody.maxHealth > 0 ? targetBody.health / targetBody.maxHealth : 1;
        const isFleeing = myHpRatio <= fleeRatio;
        const isInsisting = !isFleeing && targetHpRatio <= insistRatio;

        const dx = target.transform.x - obj.transform.x;
        const dy = target.transform.y - obj.transform.y;
        const dist = Math.hypot(dx, dy);

        const visionFov = Number(comp.config.visionFovDeg ?? obj.aiAgent?.visionFovDeg ?? 140);
        const facingX = obj.sprite?.flipX ? -1 : 1;
        const cosHalfFov = Math.cos(((Math.min(360, visionFov) * 0.5) * Math.PI) / 180);
        const dot = dist > 0.001 ? (dx / dist) * facingX : 1;
        const inCone = visionFov >= 359 || dot >= cosHalfFov || dist <= 96;
        const { nav, solidObjs } = ensureNav2d();
        const requireLos = comp.config.requireLineOfSight === true;
        const hasLos =
          !requireLos ||
          hasLineOfSight2D(
            { x: obj.transform.x, y: obj.transform.y },
            { x: target.transform.x, y: target.transform.y },
            solidObjs
          );

        if ((isFleeing || (inCone && hasLos)) && dist <= detectRadius && (isFleeing || dist > stopDistance) && dist > 0.001) {
          let goalX = isFleeing ? obj.transform.x - dx : target.transform.x;
          let goalY = isFleeing ? obj.transform.y - dy : target.transform.y;
          if (!isFleeing && !hasLineOfSight2D({ x: obj.transform.x, y: obj.transform.y }, { x: target.transform.x, y: target.transform.y }, solidObjs)) {
            const path = findPath2D(nav, { x: obj.transform.x, y: obj.transform.y }, { x: target.transform.x, y: target.transform.y });
            if (path.length > 0) {
              goalX = path[0].x;
              goalY = path[0].y;
            }
          }
          const gx = goalX - obj.transform.x;
          const gy = goalY - obj.transform.y;
          const gLen = Math.hypot(gx, gy) || 1;
          const spd = isFleeing ? baseSpeed * 1.12 : isInsisting ? baseSpeed * 1.25 : baseSpeed;
          body.vx = (gx / gLen) * spd;
          body.vy = (gy / gLen) * spd;
          obj.transform.x += body.vx * dt;
          resolveAxisHorizontal(obj, body, solids, objectMap);
          obj.transform.y += body.vy * dt;
          resolveAxisVertical(obj, body, solids, objectMap);
          if (obj.sprite) obj.sprite.flipX = body.vx < 0;
        } else {
          body.vx = 0;
          body.vy = 0;
        }
      } else if (comp.type === 'projectile') {
        obj.transform.x += body.vx * dt;
        obj.transform.y += body.vy * dt;
        if (comp.config.destroyOnSolid) {
          const pCols = getWorldColliders(obj, objectMap);
          if (
            solids.some((sb) =>
              pCols.some((pc) => pc.left < sb.right && pc.right > sb.left && pc.top < sb.bottom && pc.bottom > sb.top)
            )
          ) {
            obj.visible = false;
          }
        }
        // Colisión de proyectil con objetos con salud o destructibles
        if (obj.visible) {
          const ownerId = String(comp.config.ownerId ?? '');
          const dmg = Number(comp.config.damage ?? 25);
          const pCols = getWorldColliders(obj, objectMap);
          for (const target of objects) {
            if (!target.visible || target.id === obj.id || target.id === ownerId) continue;
            const isEnemyProj = obj.layer === 'Enemy';
            const isTargetPlayer = players.some((p) => p.id === target.id);
            if (isEnemyProj && !isTargetPlayer) continue;
            if (!isEnemyProj && isTargetPlayer) continue;
            const canTakeDmg = target.components.some(
              (c) =>
                c.enabled &&
                (c.type === 'health' || c.type === 'combat.health_system' || c.type === 'arcade.destructible')
            );
            if (!canTakeDmg) continue;
            const tCols = getWorldColliders(target, objectMap);
            if (
              pCols.some((pc) =>
                tCols.some((tc) => pc.left < tc.right && pc.right > tc.left && pc.top < tc.bottom && pc.bottom > tc.top)
              )
            ) {
              applyDamageToObject(state, target, dmg, 0.12);
              obj.visible = false;
              const burstColor = String(
                target.components.find((c) => c.type === 'arcade.destructible')?.config.burstColor ?? '#f97316'
              );
              state.particles.push({
                x: obj.transform.x,
                y: obj.transform.y,
                color: burstColor,
                count: 8,
                age: 0,
                duration: 0.25,
              });
              break;
            }
          }
        }
        if (body.lifetimeRemaining !== undefined) {
          body.lifetimeRemaining -= dt;
          if (body.lifetimeRemaining <= 0) {
            obj.visible = false;
          }
        }
      } else {
        const sceneCtx = state.scene.sceneContext ?? 'gameplay';
        const regEntry = getBehaviorEntry(comp.type);
        const allowedCtxs = comp.contexts ?? regEntry?.contexts;
        const isMenuOnlyScene = sceneCtx === 'menu' || sceneCtx === 'pause';
        const contextAllows =
          !allowedCtxs || allowedCtxs.length === 0
            ? !isMenuOnlyScene || comp.type.startsWith('ui.') || comp.type.startsWith('audio.') || comp.type.startsWith('portal.') || comp.type.startsWith('persistence.')
            : allowedCtxs.includes(sceneCtx) ||
              (sceneCtx === 'gameplay' && allowedCtxs.includes('open_world')) ||
              (sceneCtx === 'open_world' && allowedCtxs.includes('gameplay'));

        if (contextAllows) {
          stepExtendedObjectBehavior({
            obj,
            comp,
            state,
            objectMap,
            players,
            input,
            hasKey: isKeyPressed,
            wasKey: wasKeyFn,
            clickedIds: clickedSet,
            solids,
            resolveHorizontal: (o) => resolveAxisHorizontal(o, state.bodies.get(o.id)!, solids, objectMap),
            resolveVertical: (o) => resolveAxisVertical(o, state.bodies.get(o.id)!, solids, objectMap),
            dt,
            stage: state.stage,
          });
        }
      }
    }

    // Física genérica para objetos dinámicos sin controlador de jugador
    const isControlledPlayer = obj.components.some(
      (c) =>
        c.enabled &&
        (c.type === 'player_platformer' ||
          c.type === 'player_topdown' ||
          c.type === 'movement.platformer_pro' ||
          c.type === 'movement.topdown_8dir' ||
          c.type === 'movement.vehicle_drift')
    );
    if (!isControlledPlayer && obj.rigidbody?.bodyType === 'dynamic') {
      const rb = obj.rigidbody;
      body.vy += 1200 * (rb.gravityScale ?? 1) * dt;
      body.vx += body.ax * dt;
      body.vy += body.ay * dt;
      body.ax = 0;
      body.ay = 0;
      if (rb.linearDamping > 0) {
        const damp = Math.max(0, 1 - rb.linearDamping * dt);
        body.vx *= damp;
      }
      obj.transform.x += body.vx * dt;
      resolveAxisHorizontal(obj, body, solids, objectMap);
      obj.transform.y += body.vy * dt;
      resolveAxisVertical(obj, body, solids, objectMap);
    } else if (
      !isControlledPlayer &&
      (body as BodyPhysicsState & { scriptVelocityDriven?: boolean }).scriptVelocityDriven
    ) {
      obj.transform.x += body.vx * dt;
      obj.transform.y += body.vy * dt;
    }
  }

  // 2. Actualizar jugadores (Platformer estándar, Platformer Pro, Top-Down estándar)
  const jumpJustPressed =
    (input.jump && !state.prevInput.jump) || (input.up && !state.prevInput.up);
  const jumpReleased =
    (!input.jump && state.prevInput.jump) || (!input.up && state.prevInput.up);

  for (const obj of players) {
    const body = state.bodies.get(obj.id);
    if (!body) continue;

    const platPro = obj.components.find((c) => c.enabled && c.type === 'movement.platformer_pro');
    const plat = obj.components.find((c) => c.enabled && c.type === 'player_platformer');
    const topdown = obj.components.find((c) => c.enabled && c.type === 'player_topdown');

    if (platPro) {
      const cfg = platPro.config;
      const maxSpeed = Number(cfg.maxSpeed ?? 260);
      const accel = Number(cfg.acceleration ?? 1900);
      const decel = Number(cfg.deceleration ?? 2400);
      const jumpForce = Number(cfg.jumpForce ?? 520);
      const gravity = Number(cfg.gravity ?? 1320);
      const maxJumps = Math.max(1, Number(cfg.maxJumps ?? 2));
      const coyoteMax = Number(cfg.coyoteTime ?? 0.12);
      const keyMove =
        (isKeyPressed('ArrowRight', input) || isKeyPressed('KeyD', input) || input.right ? 1 : 0) -
        (isKeyPressed('ArrowLeft', input) || isKeyPressed('KeyA', input) || input.left ? 1 : 0);
      const moveInput =
        keyMove !== 0 ? keyMove : Math.abs(input.axisX ?? 0) > 0.05 ? Number(input.axisX) : 0;

      const dashKey = String(cfg.dashKey ?? 'ShiftLeft');
      const dashActKey = `ppro_dash:${obj.id}`;
      const dashCdKey = `ppro_cd:${obj.id}`;
      const dashAct = Math.max(0, (state.runtimeTimers.get(dashActKey) ?? 0) - dt);
      const dashCd = Math.max(0, (state.runtimeTimers.get(dashCdKey) ?? 0) - dt);
      state.runtimeTimers.set(dashActKey, dashAct);
      state.runtimeTimers.set(dashCdKey, dashCd);

      if (
        cfg.dashEnabled !== false &&
        isKeyPressed(dashKey, input) &&
        !wasKeyFn(dashKey) &&
        dashCd <= 0 &&
        dashAct <= 0
      ) {
        const dirX = moveInput !== 0 ? moveInput : obj.sprite?.flipX ? -1 : 1;
        const dirY = (input.down ? 1 : 0) - (input.up ? 1 : 0);
        const len = Math.hypot(dirX, dirY) || 1;
        const dashSpeed = Number(cfg.dashSpeed ?? 640);
        body.vx = (dirX / len) * dashSpeed;
        body.vy = (dirY / len) * dashSpeed * 0.65;
        state.runtimeTimers.set(dashActKey, Number(cfg.dashDuration ?? 0.16));
        state.runtimeTimers.set(dashCdKey, Number(cfg.dashCooldown ?? 0.5));
        state.soundQueue.push({ kind: 'synth', preset: 'step', channel: 'sfx', pitch: 1.6 });
      }

      if (body.grounded) {
        body.coyoteTimer = coyoteMax;
        body.jumpsUsed = 0;
      } else {
        body.coyoteTimer = Math.max(0, body.coyoteTimer - dt);
      }

      if (jumpJustPressed) {
        body.jumpBufferTimer = 0.12;
      } else {
        body.jumpBufferTimer = Math.max(0, body.jumpBufferTimer - dt);
      }

      if (dashAct <= 0) {
        body.vx = moveTowards(
          body.vx + body.ax * dt,
          moveInput * maxSpeed,
          (moveInput !== 0 ? accel : decel) * dt
        );
        body.ax = 0;
      }

      if (moveInput < 0 && obj.sprite) obj.sprite.flipX = true;
      if (moveInput > 0 && obj.sprite) obj.sprite.flipX = false;

      obj.transform.x += body.vx * dt;
      const hitWall = resolveAxisHorizontal(obj, body, solids, objectMap);

      // Wall-slide & Wall-jump
      const wallSliding = Boolean(
        cfg.wallSlideEnabled !== false && !body.grounded && hitWall && body.vy > 0
      );
      if (wallSliding && jumpJustPressed) {
        const wallKickX = Number(cfg.wallJumpForceX ?? 320);
        const wallKickY = Number(cfg.wallJumpForceY ?? 490);
        body.vx = (moveInput > 0 ? -1 : 1) * wallKickX;
        body.vy = -wallKickY;
        body.jumpBufferTimer = 0;
      } else {
        const canGroundJump = body.coyoteTimer > 0 && body.jumpsUsed === 0;
        const canAirJump = !canGroundJump && body.jumpsUsed < maxJumps && jumpJustPressed;
        if (body.jumpBufferTimer > 0 && (canGroundJump || canAirJump)) {
          body.vy = -jumpForce;
          body.grounded = false;
          body.coyoteTimer = 0;
          body.jumpBufferTimer = 0;
          body.jumpsUsed += 1;
          const jumpAssetId = String(cfg.jumpSoundAssetId ?? '');
          if (jumpAssetId) {
            state.soundQueue.push({ kind: 'asset', assetId: jumpAssetId, channel: 'sfx' });
          }
        }
      }

      if (jumpReleased && body.vy < 0) {
        body.vy *= 0.5;
      }

      if (dashAct <= 0) {
        const maxFall = wallSliding ? Number(cfg.wallSlideSpeed ?? 95) : 960;
        body.vy = Math.min(maxFall, body.vy + (gravity + body.ay) * dt);
        body.ay = 0;
      }

      obj.transform.y += body.vy * dt;
      resolveAxisVertical(obj, body, solids, objectMap);
    } else if (plat) {
      const params = resolvePlatformerConfig(plat.config);
      const keyMove = (input.right ? 1 : 0) - (input.left ? 1 : 0);
      const moveInput =
        keyMove !== 0 ? keyMove : Math.abs(input.axisX ?? 0) > 0.05 ? Number(input.axisX) : 0;

      if (body.grounded) {
        body.coyoteTimer = params.coyoteTime;
        body.jumpsUsed = 0;
      } else {
        body.coyoteTimer = Math.max(0, body.coyoteTimer - dt);
      }

      if (jumpJustPressed) {
        body.jumpBufferTimer = params.jumpBuffer;
      } else {
        body.jumpBufferTimer = Math.max(0, body.jumpBufferTimer - dt);
      }

      const targetVx = moveInput * params.maxSpeed;
      const accelRate =
        moveInput !== 0
          ? params.acceleration * (body.grounded ? 1 : params.airControl)
          : params.deceleration *
            (body.grounded ? params.groundFriction : params.airControl * 0.7);
      body.vx = moveTowards(body.vx + body.ax * dt, targetVx, accelRate * dt);
      body.ax = 0;

      if (moveInput < 0 && obj.sprite) obj.sprite.flipX = true;
      if (moveInput > 0 && obj.sprite) obj.sprite.flipX = false;

      const canGroundJump = body.coyoteTimer > 0 && body.jumpsUsed === 0;
      const canAirJump = !canGroundJump && body.jumpsUsed < params.maxJumps && jumpJustPressed;
      if (body.jumpBufferTimer > 0 && (canGroundJump || canAirJump)) {
        body.vy = -params.jumpForce;
        body.grounded = false;
        body.coyoteTimer = 0;
        body.jumpBufferTimer = 0;
        body.jumpsUsed += 1;
        const jumpAssetId = String(plat.config.jumpSoundAssetId ?? '');
        if (jumpAssetId) {
          state.soundQueue.push({ kind: 'asset', assetId: jumpAssetId, channel: 'sfx' });
        }
      }

      if (jumpReleased && body.vy < 0) {
        body.vy *= params.variableJumpCut;
      }

      const grav = body.vy > 0 ? params.gravity * params.fallGravityMultiplier : params.gravity;
      body.vy = Math.min(params.maxFallSpeed, body.vy + (grav + body.ay) * dt);
      body.ay = 0;

      obj.transform.x += body.vx * dt;
      const hitWall = resolveAxisHorizontal(obj, body, solids, objectMap);

      // Complemento opcional movement.wall_slide
      const wallSlideComp = obj.components.find((c) => c.enabled && c.type === 'movement.wall_slide');
      if (wallSlideComp && !body.grounded && hitWall && body.vy > 0) {
        body.vy = Math.min(body.vy, Number(wallSlideComp.config.slideMaxFall ?? 90));
        if (jumpJustPressed) {
          body.vx = (moveInput > 0 ? -1 : 1) * Number(wallSlideComp.config.kickX ?? 300);
          body.vy = -Number(wallSlideComp.config.kickY ?? 480);
        }
      }

      obj.transform.y += body.vy * dt;
      resolveAxisVertical(obj, body, solids, objectMap);
    } else if (topdown) {
      const params = resolveTopDownConfig(topdown.config);
      const keyMx = (input.right ? 1 : 0) - (input.left ? 1 : 0);
      const keyMy = (input.down ? 1 : 0) - (input.up ? 1 : 0);
      let mx = keyMx !== 0 ? keyMx : Math.abs(input.axisX ?? 0) > 0.05 ? Number(input.axisX) : 0;
      let my = keyMy !== 0 ? keyMy : Math.abs(input.axisY ?? 0) > 0.05 ? Number(input.axisY) : 0;
      const mag = Math.hypot(mx, my);
      if (mag > 1) {
        mx /= mag;
        my /= mag;
      }
      const rateX = mx !== 0 ? params.acceleration : params.deceleration;
      const rateY = my !== 0 ? params.acceleration : params.deceleration;
      body.vx = moveTowards(body.vx + body.ax * dt, mx * params.maxSpeed, rateX * dt);
      body.vy = moveTowards(body.vy + body.ay * dt, my * params.maxSpeed, rateY * dt);
      body.ax = 0;
      body.ay = 0;

      if (mx < 0 && obj.sprite) obj.sprite.flipX = true;
      if (mx > 0 && obj.sprite) obj.sprite.flipX = false;

      obj.transform.x += body.vx * dt;
      resolveAxisHorizontal(obj, body, solids, objectMap);

      obj.transform.y += body.vy * dt;
      resolveAxisVertical(obj, body, solids, objectMap);
    }
  }

  // 3. Evaluar Máquina de Estados de Animación 2D y/o vincular reproducción al movimiento
  for (const obj of objects) {
    if (!obj.visible || obj.type !== 'sprite' || !obj.sprite) continue;
    const body = state.bodies.get(obj.id);
    if (!body) continue;

    const fsm = obj.animStateMachine;
    if (fsm && fsm.states.length > 0) {
      const curState =
        obj.sprite.animation?.fsmActiveState?.stateName ??
        obj.stateMachine?.currentState ??
        '';
      const animTimerKey = `fsm_t:${obj.id}`;
      const animElapsed = state.runtimeTimers.get(animTimerKey) ?? 0;
      const curNode = fsm.states.find((s) => s.name === curState || s.id === curState);
      const baseFps = obj.sprite.animation?.fps || 8;
      const curFps = Math.max(1, baseFps * Math.max(0.1, curNode?.timeScale ?? 1));
      const curFrames = Math.max(1, curNode?.frameCount ?? obj.sprite.animation?.frameCount ?? 4);
      const clipDuration = curFrames / curFps;
      const animProgress = curNode ? Math.min(1, animElapsed / Math.max(0.05, clipDuration)) : 0;
      const animFinished = Boolean(
        curNode && curNode.loopMode === 'LoopOnce' && animElapsed >= clipDuration
      );

      const justPressed2d = new Set<string>();
      if (input.justPressedKeys) {
        for (const k of input.justPressedKeys) justPressed2d.add(k);
      }
      if (input.pressedKeys) {
        const prevSet2d =
          state.prevInput.pressedKeys instanceof Set
            ? state.prevInput.pressedKeys
            : new Set(state.prevInput.pressedKeys ?? []);
        for (const k of input.pressedKeys) {
          if (!prevSet2d.has(k)) justPressed2d.add(k);
        }
      }

      const res = stepAnimationFSM(fsm, curState, {
        speed: Math.hypot(body.vx, body.vy),
        vy: -body.vy,
        isGrounded: body.grounded,
        animFinished,
        animProgress,
        heldKeys: input.pressedKeys,
        justPressedKeys: justPressed2d,
        variables: state.variables,
      });
      if (res) {
        if (res.changed || !obj.sprite.animation?.fsmActiveState) {
          state.runtimeTimers.set(animTimerKey, 0);
          if (!obj.sprite.animation) {
            obj.sprite.animation = {
              enabled: true,
              cols: res.node.cols ?? 4,
              rows: res.node.rows ?? 1,
              frameCount: res.node.frameCount ?? 4,
              fps: 8,
              loop: true,
              playing: true,
            };
          }
          const anim = obj.sprite.animation;
          anim.enabled = true;
          anim.playing = true;
          anim.activeClip = res.clipName;
          anim.fsmActiveState = {
            stateName: res.stateName,
            assetId: res.node.assetId ?? obj.sprite.assetId,
            cols: res.node.cols ?? anim.cols,
            rows: res.node.rows ?? anim.rows,
            startFrame: res.node.startFrame ?? 0,
            frameCount: res.node.frameCount ?? anim.frameCount,
            fps: Math.max(1, (anim.fps || 8) * Math.max(0.1, res.timeScale)),
            loop: res.loopMode !== 'LoopOnce',
          };
          obj.stateMachine = {
            currentState: res.stateName,
            states: fsm.states.map((s) => s.name),
          };
        } else {
          const nextEl = animElapsed + dt;
          state.runtimeTimers.set(animTimerKey, nextEl);
          // Disparar Animation Frame Events 2D
          const evList = [
            ...(res.node.frameEvents ?? []),
            ...(obj.sprite.frameEvents ?? []),
          ];
          if (evList.length > 0) {
            const prevFrame = Math.floor(animElapsed * curFps) % curFrames;
            const curFrame = Math.floor(nextEl * curFps) % curFrames;
            if (curFrame !== prevFrame || animElapsed === 0) {
              for (const fe of evList) {
                if (fe.frameIndex === curFrame) {
                  if (fe.eventName) state.emittedEvents.push(fe.eventName);
                  if (fe.soundAssetId) {
                    state.soundQueue.push({
                      kind: 'asset',
                      assetId: fe.soundAssetId,
                      channel: 'sfx',
                      spatialX: obj.transform.x,
                      spatialY: obj.transform.y,
                    });
                  }
                }
              }
            }
          }
        }
        continue;
      }
    }

    const anim = obj.sprite.animation;
    if (!anim?.enabled || !anim.linkToMovement) continue;

    const hasPlatformer = obj.components.some(
      (c) => c.enabled && (c.type === 'player_platformer' || c.type === 'movement.platformer_pro')
    );
    const movingHoriz = Math.abs(body.vx) > 8;
    const movingAny = movingHoriz || Math.abs(body.vy) > 8;

    let desiredClip = 'idle';
    if (hasPlatformer && !body.grounded && Math.abs(body.vy) > 25) {
      desiredClip = body.vy < 0 ? 'jump' : 'fall';
    } else if (hasPlatformer ? movingHoriz : movingAny) {
      desiredClip = 'walk';
    }

    if (anim.clips && anim.clips.length > 0) {
      const hasDesired = anim.clips.some((c) => c.name === desiredClip);
      anim.activeClip = hasDesired
        ? desiredClip
        : movingAny && anim.clips.some((c) => c.name === 'walk')
          ? 'walk'
          : anim.clips[0].name;
      anim.playing = true;
    } else {
      anim.activeClip = desiredClip;
      anim.playing = movingHoriz || (!hasPlatformer && movingAny);
    }
  }

  // 4. Comprobar sensores integrados (checkpoint, goal_portal) y salud en cero
  for (const obj of objects) {
    const body = state.bodies.get(obj.id);
    if (body && body.health <= 0 && getHealthComponent(obj)) {
      zeroHealthObjectIds.add(obj.id);
    }
  }
  if (players.length > 0) {
    const playerCols = players.map((p) => ({ obj: p, cols: getWorldColliders(p, objectMap) }));
    for (const obj of objects) {
      if (!obj.visible) continue;
      const cp = obj.components.find((c) => c.enabled && c.type === 'checkpoint');
      const goal = obj.components.find((c) => c.enabled && c.type === 'goal_portal');
      if (!cp && !goal) continue;
      const objCols = getWorldColliders(obj, objectMap);
      const hit = playerCols.some(({ cols }) =>
        cols.some((pc) =>
          objCols.some(
            (oc) => pc.left < oc.right && pc.right > oc.left && pc.top < oc.bottom && pc.bottom > oc.top
          )
        )
      );
      if (hit) {
        if (cp) {
          state.checkpoint = { x: obj.transform.x, y: obj.transform.y };
          if (cp.config.healOnTouch) {
            for (const { obj: p } of playerCols) {
              const pb = state.bodies.get(p.id);
              if (pb) pb.health = pb.maxHealth;
            }
          }
        }
        if (goal && !state.pendingSceneCommand) {
          const targetId = String(goal.config.targetSceneId ?? state.scene.nextSceneId ?? '');
          state.pendingSceneCommand = targetId
            ? {
                kind: 'load',
                sceneId: targetId,
                transition: (goal.config.transition as SceneTransitionType) ?? 'fadeBlack',
              }
            : {
                kind: 'nextLevel',
                transition: (goal.config.transition as SceneTransitionType) ?? 'fadeBlack',
              };
        }
      }
    }
    if (damageZones.length > 0) {
      for (const { obj: p, cols } of playerCols) {
        const dzHit = damageZones.find((dz) =>
          cols.some((pc) => pc.left < dz.right && pc.right > dz.left && pc.top < dz.bottom && pc.bottom > dz.top)
        );
        if (dzHit) {
          applyDamageToObject(state, p, Math.max(1, dzHit.dps * 0.25), 0.35);
        }
      }
    }
  }

  // 5. Evaluar reglas estructuradas (GameMechanic[])
  const mechanics = [...(state.scene.mechanics ?? [])]
    .filter((m) => m.enabled)
    .sort((a, b) => (b.priority ?? 0) - (a.priority ?? 0));

  const collisionHandledIds = new Set<string>();
  for (const m of mechanics) {
    if (
      (m.trigger.event === 'collision.enter' || m.trigger.event === 'trigger.enter') &&
      m.trigger.target
    ) {
      collisionHandledIds.add(m.trigger.target);
    }
  }

  const nextActiveCollisions = new Set<string>();
  const nextActiveTriggers = new Set<string>();
  const emittedThisFrame = [...state.emittedEvents];
  state.emittedEvents = [];
  const portalEventsThisFrame = [...state.portalEventsQueue];
  state.portalEventsQueue = [];
  const countdownZeroThisFrame = [...state.countdownZeroQueue];
  state.countdownZeroQueue = [];

  for (const mech of mechanics) {
    let triggered = false;
    const ev = mech.trigger.event;
    const collisionPairs: ActionTargetContext[] = [];

    if (ev === 'scene.start' && !state.sceneStarted) {
      triggered = true;
    } else if (ev === 'scene.paused' && state.paused) {
      triggered = true;
    } else if (ev === 'tick') {
      triggered = true;
    } else if (ev === 'ui.click') {
      if (mech.trigger.target && clickedSet.has(mech.trigger.target)) {
        triggered = true;
      }
    } else if (ev === 'mouse.clickGlobal' && input.pointerJustPressed) {
      triggered = true;
    } else if (ev === 'mouse.hold' && input.pointerDown) {
      triggered = true;
    } else if (ev === 'mouse.release' && input.pointerJustReleased) {
      triggered = true;
    } else if (ev === 'touch.swipe' && input.swipeDir) {
      const expected = mech.trigger.swipeDir ?? 'any';
      if (expected === 'any' || expected === input.swipeDir) {
        triggered = true;
      }
    } else if (ev === 'portal.adClosed' && portalEventsThisFrame.includes('adClosed')) {
      triggered = true;
    } else if (ev === 'portal.rewarded' && portalEventsThisFrame.includes('rewarded')) {
      triggered = true;
    } else if (ev === 'countdown.zero' && countdownZeroThisFrame.length > 0) {
      if (!mech.trigger.variable || countdownZeroThisFrame.includes(mech.trigger.variable)) {
        triggered = true;
      }
    } else if (ev === 'custom.event') {
      if (mech.trigger.eventName && emittedThisFrame.includes(mech.trigger.eventName)) {
        triggered = true;
      }
    } else if (ev === 'variable.changed') {
      const vn = mech.trigger.variable;
      if (vn && state.variables.get(vn) !== state.prevVariables.get(vn)) {
        triggered = true;
      }
    } else if (ev === 'health.zero') {
      if (mech.trigger.target && zeroHealthObjectIds.has(mech.trigger.target)) {
        triggered = true;
      }
    } else if (ev === 'input.pressed' || ev === 'input.held' || ev === 'input.released') {
      const key = mech.trigger.key ?? 'Space';
      const isDown = isKeyPressed(key, input);
      const wasDown = isKeyPressed(key, state.prevInput);
      if (ev === 'input.pressed' && isDown && !wasDown) triggered = true;
      else if (ev === 'input.held' && isDown) triggered = true;
      else if (ev === 'input.released' && !isDown && wasDown) triggered = true;
    } else if (ev === 'timer.elapsed') {
      const interval = Math.max(0.05, Number(mech.trigger.intervalSec ?? 1));
      const acc = (state.timerAccumulators.get(mech.id) ?? 0) + dt;
      if (acc >= interval) {
        state.timerAccumulators.set(mech.id, acc - interval);
        triggered = true;
      } else {
        state.timerAccumulators.set(mech.id, acc);
      }
    } else if (
      ev === 'collision.enter' ||
      ev === 'collision.stay' ||
      ev === 'collision.exit' ||
      ev === 'trigger.enter' ||
      ev === 'trigger.exit'
    ) {
      const targetObjs = objects.filter((o) => matchesCollisionTarget(o, mech));
      const sources = mech.trigger.sourceObjectId
        ? [objectMap.get(mech.trigger.sourceObjectId)].filter(
            (x): x is GameObjectData => Boolean(x && x.visible)
          )
        : players;

      if (targetObjs.length > 0 && sources.length > 0) {
        for (const targetObj of targetObjs) {
          const targetCols = getWorldColliders(targetObj, objectMap);
          for (const src of sources) {
            if (src.id === targetObj.id) continue;
            const srcCols = getWorldColliders(src, objectMap);
            const overlapsNow = srcCols.some((sc) =>
              targetCols.some(
                (tc) =>
                  canLayersCollide(sc.layer, tc.layer, sc.mask, tc.mask) &&
                  sc.left < tc.right &&
                  sc.right > tc.left &&
                  sc.top < tc.bottom &&
                  sc.bottom > tc.top
              )
            );
            const pairKey = `${mech.id}:${src.id}:${targetObj.id}`;
            const isTrigEv = ev === 'trigger.enter' || ev === 'trigger.exit';
            const prevSet = isTrigEv ? state.activeTriggers : state.activeCollisions;
            const nextSet = isTrigEv ? nextActiveTriggers : nextActiveCollisions;

            if (overlapsNow) {
              nextSet.add(pairKey);
              if ((ev === 'collision.enter' || ev === 'trigger.enter') && !prevSet.has(pairKey)) {
                triggered = true;
                collisionPairs.push({ owner: src, other: targetObj });
              } else if (ev === 'collision.stay') {
                triggered = true;
                collisionPairs.push({ owner: src, other: targetObj });
              }
            } else if ((ev === 'collision.exit' || ev === 'trigger.exit') && prevSet.has(pairKey)) {
              triggered = true;
              collisionPairs.push({ owner: src, other: targetObj });
            }
          }
        }
      }
    }

    if (triggered && evaluateConditions(mech, state, objectMap, input)) {
      if (collisionPairs.length > 0) {
        for (const pair of collisionPairs) {
          executeActionList(mech.actions, mech.id, state, objectMap, pair);
        }
      } else {
        executeActionList(mech.actions, mech.id, state, objectMap);
      }
    }
  }

  // 5b. Ejecutar Scripts JS de Escena y Objetos + parpadeo de luces 2D
  for (const obj of objects) {
    if (!obj.visible || obj.type !== 'light_2d' || !obj.light2d) continue;
    const flick = obj.components.find((c) => c.enabled && c.type === 'lighting.flicker');
    if (flick) {
      const spd = Number(flick.config.speed ?? 8);
      const amt = Number(flick.config.amount ?? 0.25);
      const base = (obj.light2d as unknown as { __baseIntensity?: number }).__baseIntensity ?? obj.light2d.intensity;
      (obj.light2d as unknown as { __baseIntensity?: number }).__baseIntensity = base;
      obj.light2d.intensity = Math.max(0.1, base * (1 + Math.sin(state.elapsed * spd) * amt));
    }
  }

  // Actualizar tweens creados por scripts (nexus.tween)
  if (state.scriptTweens && state.scriptTweens.length > 0) {
    const activeTweens = [];
    for (const tw of state.scriptTweens) {
      tw.elapsed += dt;
      const t = Math.min(1, tw.elapsed / Math.max(0.01, tw.duration));
      const ease = 1 - Math.pow(1 - t, 2);
      const target = objectMap.get(tw.targetId);
      if (target) {
        for (const [k, toVal] of Object.entries(tw.to)) {
          const fromVal = tw.from[k] ?? toVal;
          const v = fromVal + (toVal - fromVal) * ease;
          if (k === 'x') target.transform.x = v;
          else if (k === 'y') target.transform.y = v;
          else if (k === 'rotation' || k === 'rz') target.transform.rotation = v;
          else if (k === 'scaleX') target.transform.scaleX = v;
          else if (k === 'scaleY') target.transform.scaleY = v;
          else if (k === 'opacity') target.opacity = Math.max(0, Math.min(1, v));
        }
      }
      if (t < 1) activeTweens.push(tw);
    }
    state.scriptTweens = activeTweens;
  }

  if (state.compiledScripts && state.compiledScripts.size > 0) {
    const api = build2DScriptApi(state, objectMap, dt, input);
    if (!state.startedScriptBindings) state.startedScriptBindings = new Set();
    if (!state.scriptActivePairs) state.scriptActivePairs = new Set();

    // 5b-1. onStart para scripts de escena (funciona incluso en escenas vacías)
    for (const sid of state.scene.scriptIds ?? []) {
      const e = state.compiledScripts.get(sid);
      if (!e || e.error) continue;
      const startKey = `scene:${state.scene.id}:${sid}`;
      if (!state.startedScriptBindings.has(startKey)) {
        state.startedScriptBindings.add(startKey);
        if (typeof e.hooks.onStart === 'function') {
          try {
            e.hooks.onStart(build2DSceneHandle(state, objectMap, { ...(e.hooks.params ?? {}) }, input), api);
          } catch (err) {
            log2DScriptError(state, `${startKey}:onStart`, e.name, err);
          }
        }
      }
    }

    // 5b-2. onStart para cada binding en objetos (incluidos prefabs recién generados)
    for (const obj of [...objects]) {
      if (!obj.visible) continue;
      for (const b of obj.scriptBindings ?? []) {
        if (!b.enabled) continue;
        const e = state.compiledScripts.get(b.scriptId);
        if (!e || e.error) continue;
        const startKey = `obj:${obj.id}:${b.id}`;
        if (!state.startedScriptBindings.has(startKey)) {
          state.startedScriptBindings.add(startKey);
          if (typeof e.hooks.onStart === 'function') {
            try {
              e.hooks.onStart(
                build2DObjectHandle(obj, state, objectMap, { ...(e.hooks.params ?? {}), ...(b.params ?? {}) }, input),
                api
              );
            } catch (err) {
              log2DScriptError(state, `${startKey}:onStart`, e.name, err);
            }
          }
        }
      }
    }

    // 5b-3. Colisiones 2D onCollisionEnter simétricas para objetos con scriptBindings
    const nextScriptPairs = new Set<string>();
    const scriptColliderObjects = objects.filter(
      (o) => o.visible && o.type !== 'ui_widget'
    );
    const hasCollisionHooks = scriptColliderObjects.some((o) =>
      (o.scriptBindings ?? []).some((b) => {
        if (!b.enabled) return false;
        const e = state.compiledScripts?.get(b.scriptId);
        return typeof e?.hooks.onCollisionEnter === 'function';
      })
    );
    if (hasCollisionHooks) {
      const boxCache = new Map<string, WorldCollider[]>();
      const getBoxes = (o: GameObjectData) => {
        let cols = boxCache.get(o.id);
        if (!cols) {
          cols = getWorldColliders(o, objectMap);
          boxCache.set(o.id, cols);
        }
        return cols;
      };
      for (let i = 0; i < scriptColliderObjects.length; i++) {
        const a = scriptColliderObjects[i];
        const aHas = (a.scriptBindings ?? []).some(
          (b) => b.enabled && typeof state.compiledScripts?.get(b.scriptId)?.hooks.onCollisionEnter === 'function'
        );
        const aCols = getBoxes(a);
        if (aCols.length === 0) continue;
        for (let j = i + 1; j < scriptColliderObjects.length; j++) {
          const bObj = scriptColliderObjects[j];
          const bHas = (bObj.scriptBindings ?? []).some(
            (b) => b.enabled && typeof state.compiledScripts?.get(b.scriptId)?.hooks.onCollisionEnter === 'function'
          );
          if (!aHas && !bHas) continue;
          const bCols = getBoxes(bObj);
          if (bCols.length === 0) continue;
          const overlaps = aCols.some((ac) =>
            bCols.some(
              (bc) =>
                canLayersCollide(ac.layer, bc.layer, ac.mask, bc.mask) &&
                ac.left < bc.right &&
                ac.right > bc.left &&
                ac.top < bc.bottom &&
                ac.bottom > bc.top
            )
          );
          if (!overlaps) continue;
          const pairKey = a.id < bObj.id ? `${a.id}|${bObj.id}` : `${bObj.id}|${a.id}`;
          nextScriptPairs.add(pairKey);
          if (!state.scriptActivePairs.has(pairKey)) {
            for (const bind of a.scriptBindings ?? []) {
              if (!bind.enabled) continue;
              const ent = state.compiledScripts.get(bind.scriptId);
              if (typeof ent?.hooks.onCollisionEnter === 'function') {
                try {
                  ent.hooks.onCollisionEnter(
                    build2DObjectHandle(a, state, objectMap, { ...(ent.hooks.params ?? {}), ...(bind.params ?? {}) }, input),
                    build2DObjectHandle(bObj, state, objectMap, {}, input),
                    api
                  );
                } catch (err) {
                  log2DScriptError(state, `${a.id}:${bind.scriptId}:onCollisionEnter`, ent.name, err);
                }
              }
            }
            for (const bind of bObj.scriptBindings ?? []) {
              if (!bind.enabled) continue;
              const ent = state.compiledScripts.get(bind.scriptId);
              if (typeof ent?.hooks.onCollisionEnter === 'function') {
                try {
                  ent.hooks.onCollisionEnter(
                    build2DObjectHandle(bObj, state, objectMap, { ...(ent.hooks.params ?? {}), ...(bind.params ?? {}) }, input),
                    build2DObjectHandle(a, state, objectMap, {}, input),
                    api
                  );
                } catch (err) {
                  log2DScriptError(state, `${bObj.id}:${bind.scriptId}:onCollisionEnter`, ent.name, err);
                }
              }
            }
          }
        }
      }
    }
    state.scriptActivePairs = nextScriptPairs;

    // 5b-4. onUpdate de escena
    for (const sid of state.scene.scriptIds ?? []) {
      const e = state.compiledScripts.get(sid);
      if (e && !e.error && typeof e.hooks.onUpdate === 'function') {
        try {
          e.hooks.onUpdate(
            build2DSceneHandle(state, objectMap, { ...(e.hooks.params ?? {}) }, input),
            dt,
            api
          );
        } catch (err) {
          log2DScriptError(state, `scene:${sid}:onUpdate`, e.name, err);
        }
      }
    }

    // 5b-5. onUpdate y onClick por objeto
    for (const obj of [...objects]) {
      if (!obj.visible) continue;
      for (const b of obj.scriptBindings ?? []) {
        if (!b.enabled) continue;
        const e = state.compiledScripts.get(b.scriptId);
        if (!e || e.error) continue;
        if (typeof e.hooks.onUpdate === 'function') {
          try {
            e.hooks.onUpdate(
              build2DObjectHandle(obj, state, objectMap, { ...(e.hooks.params ?? {}), ...(b.params ?? {}) }, input),
              dt,
              api
            );
          } catch (err) {
            log2DScriptError(state, `${obj.id}:${b.scriptId}:onUpdate`, e.name, err);
          }
        }
        if (clickedSet.has(obj.id) && typeof e.hooks.onClick === 'function') {
          try {
            e.hooks.onClick(
              build2DObjectHandle(obj, state, objectMap, { ...(e.hooks.params ?? {}), ...(b.params ?? {}) }, input),
              api
            );
          } catch (err) {
            log2DScriptError(state, `${obj.id}:${b.scriptId}:onClick`, e.name, err);
          }
        }
      }
    }
  }

  state.sceneStarted = true;
  state.activeCollisions = nextActiveCollisions;
  state.activeTriggers = nextActiveTriggers;
  state.prevInput = {
    ...input,
    pressedKeys: input.pressedKeys
      ? Array.from(input.pressedKeys)
      : [],
  };
  state.prevVariables = new Map(state.variables);

  // 6. Coleccionables simples y magnetizados
  if (players.length > 0) {
    const playerCols = players.map((p) => getWorldColliders(p, objectMap));
    for (const obj of objects) {
      if (!obj.visible || collisionHandledIds.has(obj.id)) continue;
      const col = obj.components.find(
        (c) =>
          c.enabled &&
          (c.type === 'collectible' || c.type === 'arcade.collectible_magnet_target')
      );
      if (!col) continue;
      const objCols = getWorldColliders(obj, objectMap);
      const touched = playerCols.some((pCols) =>
        pCols.some((pc) =>
          objCols.some(
            (oc) =>
              pc.left < oc.right && pc.right > oc.left && pc.top < oc.bottom && pc.bottom > oc.top
          )
        )
      );
      if (touched) {
        obj.visible = false;
        const basePts = Number(col.config.points ?? 10);
        const mult = Number(state.variables.get('multiplicador') ?? 1) || 1;
        const pts = Math.round(basePts * mult);
        const prevScore = Number(state.variables.get('puntos') ?? state.score) || 0;
        const nextScore = prevScore + pts;
        state.score = nextScore;
        state.variables.set('puntos', nextScore);
        persistVariableIfNeeded(state, 'puntos', nextScore);
        const colSoundId = String(col.config.soundAssetId ?? '');
        const colSoundVol = Number(col.config.soundVolume ?? 1);
        if (colSoundId) {
          state.soundQueue.push({ kind: 'asset', assetId: colSoundId, channel: 'sfx', volume: colSoundVol });
        } else {
          state.soundQueue.push({ kind: 'synth', preset: 'coin', channel: 'sfx', volume: colSoundVol });
        }
        state.particles.push({
          x: obj.transform.x,
          y: obj.transform.y,
          color: '#34d399',
          count: 10,
          age: 0,
          duration: 0.4,
        });
      }
    }
  }

  // 7. Partículas continuas de emisores
  stepEmitterParticles(state, dt);

  // 8. Cámara de seguimiento suave (Camera2D o componente juice.camera_follow / override por cable)
  const camCfg = state.scene.cameraConfig;
  const followObj =
    (state.cameraFollowOverrideId ? objectMap.get(state.cameraFollowOverrideId) : null) ??
    (camCfg?.followObjectId
      ? objectMap.get(camCfg.followObjectId)
      : objects.find((o) => o.visible && o.components.some((c) => c.enabled && c.type === 'juice.camera_follow')));

  if (followObj) {
    const followComp = followObj.components.find(
      (c) => c.enabled && c.type === 'juice.camera_follow'
    );
    const desiredX = followObj.transform.x - state.stage.width * 0.5;
    const desiredY = followObj.transform.y - state.stage.height * 0.5;
    const dzW = (camCfg?.deadzoneW ?? 0) * 0.5;
    const dzH = (camCfg?.deadzoneH ?? 0) * 0.5;
    let targetCamX = state.cameraPos.x;
    let targetCamY = state.cameraPos.y;
    if (Math.abs(desiredX - targetCamX) > dzW) {
      targetCamX = desiredX - Math.sign(desiredX - targetCamX) * dzW;
    }
    if (Math.abs(desiredY - targetCamY) > dzH) {
      targetCamY = desiredY - Math.sign(desiredY - targetCamY) * dzH;
    }
    const lerp = Math.max(
      0.02,
      Math.min(1, Number(followComp?.config.lerp ?? camCfg?.lerp ?? 0.14))
    );
    const prevCamX = state.cameraPos.x;
    const prevCamY = state.cameraPos.y;
    state.cameraPos.x += (targetCamX - state.cameraPos.x) * lerp;
    state.cameraPos.y += (targetCamY - state.cameraPos.y) * lerp;
    const clampBounds = followComp ? Boolean(followComp.config.clampToBounds) : Boolean(camCfg?.clampToBounds);
    if (clampBounds) {
      const maxW = Math.max(state.stage.width, camCfg?.worldWidth ?? state.stage.width);
      const maxH = Math.max(state.stage.height, camCfg?.worldHeight ?? state.stage.height);
      state.cameraPos.x = Math.max(0, Math.min(maxW - state.stage.width, state.cameraPos.x));
      state.cameraPos.y = Math.max(0, Math.min(maxH - state.stage.height, state.cameraPos.y));
    }

    // Aplicar efecto Parallax a capas de fondo
    const dCamX = state.cameraPos.x - prevCamX;
    const dCamY = state.cameraPos.y - prevCamY;
    if (dCamX !== 0 || dCamY !== 0) {
      for (const obj of objects) {
        const px = obj.components.find((c) => c.enabled && c.type === 'juice.parallax_layer');
        if (px) {
          obj.transform.x += dCamX * (1 - Number(px.config.factorX ?? 0.4));
          obj.transform.y += dCamY * (1 - Number(px.config.factorY ?? 0.15));
        }
      }
    }
  }

  return state;
}
