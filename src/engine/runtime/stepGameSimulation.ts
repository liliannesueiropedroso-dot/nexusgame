import type { PrefabDefinition } from '../../project/models/project';
import { createId } from '../../utils/id';
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
  ParticleBurstVisual,
  ProjectVariable,
  SceneData,
  SceneTransitionType,
  StageResolution,
} from '../core/types';
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

export const FIXED_DT = 1 / 60;

export interface InputState {
  left: boolean;
  right: boolean;
  up: boolean;
  down: boolean;
  jump: boolean;
  action1?: boolean;
  action2?: boolean;
  pointerX?: number;
  pointerY?: number;
  pressedKeys?: Set<string> | string[];
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
  kind: 'asset' | 'synth' | 'setVolume';
  assetId?: string;
  preset?: 'coin' | 'jump' | 'hit' | 'powerup' | 'step' | 'win';
  channel: 'music' | 'sfx' | 'ui';
  volume?: number;
  pitch?: number;
  setChannel?: 'master' | 'music' | 'sfx' | 'ui';
}

export interface PendingWaitAction {
  remainingSec: number;
  actions: ActionDefinition[];
  mechId: string;
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
}

interface SolidBox {
  left: number;
  right: number;
  top: number;
  bottom: number;
  layer: WorldCollider['layer'];
  mask?: WorldCollider['mask'];
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

function collectSolidBoxes(objects: GameObjectData[]): SolidBox[] {
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
      for (const key of Object.keys(tm.cells)) {
        const [cs, rs] = key.split(',');
        const col = Number(cs);
        const row = Number(rs);
        if (!Number.isFinite(col) || !Number.isFinite(row)) continue;
        const left = originX + col * tw;
        const top = originY + row * th;
        boxes.push({
          left,
          right: left + tw,
          top,
          bottom: top + th,
          layer: obj.layer ?? 'Ground',
        });
      }
    } else {
      const cols = getWorldColliders(obj);
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

function getMoverSolidColliders(obj: GameObjectData): WorldCollider[] {
  return getWorldColliders(obj).filter((c) => !c.isSensor);
}

function boxOverlaps(
  a: { left: number; right: number; top: number; bottom: number },
  b: SolidBox
): boolean {
  return a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top;
}

function resolveAxisHorizontal(
  obj: GameObjectData,
  body: BodyPhysicsState,
  solids: SolidBox[]
): boolean {
  let collided = false;
  const cols = getMoverSolidColliders(obj);
  for (const col of cols) {
    for (const solid of solids) {
      if (!canLayersCollide(col.layer, solid.layer, col.mask, solid.mask)) continue;
      if (boxOverlaps(col, solid)) {
        collided = true;
        if (body.vx > 0) {
          obj.transform.x -= col.right - solid.left;
        } else if (body.vx < 0) {
          obj.transform.x += solid.right - col.left;
        }
        body.vx = 0;
        resolveAxisHorizontalRecursive(obj, body, solids, 2);
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
  depth: number
): void {
  if (depth <= 0) return;
  const cols = getMoverSolidColliders(obj);
  for (const col of cols) {
    for (const solid of solids) {
      if (!canLayersCollide(col.layer, solid.layer, col.mask, solid.mask)) continue;
      if (boxOverlaps(col, solid)) {
        if (col.cx < (solid.left + solid.right) * 0.5) {
          obj.transform.x -= col.right - solid.left;
        } else {
          obj.transform.x += solid.right - col.left;
        }
        body.vx = 0;
        return;
      }
    }
  }
}

function resolveAxisVertical(obj: GameObjectData, body: BodyPhysicsState, solids: SolidBox[]): void {
  body.grounded = false;
  const cols = getMoverSolidColliders(obj);
  for (const col of cols) {
    for (const solid of solids) {
      if (!canLayersCollide(col.layer, solid.layer, col.mask, solid.mask)) continue;
      if (boxOverlaps(col, solid)) {
        if (body.vy > 0) {
          obj.transform.y -= col.bottom - solid.top;
          body.vy = 0;
          body.grounded = true;
        } else if (body.vy < 0) {
          obj.transform.y += solid.bottom - col.top;
          body.vy = 0;
        }
      }
    }
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

  const leaderboard = options?.leaderboard ?? loadLeaderboard(options?.storageAdapter);

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
    runtimeLogs: [],
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

function executeActionList(
  actions: ActionDefinition[],
  mechId: string,
  state: SimulationState,
  objectMap: Map<string, GameObjectData>
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
          state.soundQueue.push({
            kind: 'asset',
            assetId,
            channel: (p.channel as 'music' | 'sfx' | 'ui') ?? 'sfx',
            volume: baseVol,
            pitch: Math.max(0.25, Math.min(3, pitch)),
          });
        }
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
        const target = p.target ? objectMap.get(String(p.target)) : undefined;
        if (target) target.visible = false;
        break;
      }
      case 'object.show': {
        const target = p.target ? objectMap.get(String(p.target)) : undefined;
        if (target) target.visible = true;
        break;
      }
      case 'object.move': {
        const target = p.target ? objectMap.get(String(p.target)) : undefined;
        if (target) {
          target.transform.x += Number(p.dx ?? 0);
          target.transform.y += Number(p.dy ?? 0);
        }
        break;
      }
      case 'object.teleport': {
        const target = p.target ? objectMap.get(String(p.target)) : undefined;
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
        const tpl = p.target ? objectMap.get(String(p.target)) : undefined;
        if (tpl) {
          const anchor = p.atObjectId ? objectMap.get(String(p.atObjectId)) : undefined;
          const sx = anchor ? anchor.transform.x + Number(p.offsetX ?? 0) : Number(p.x ?? tpl.transform.x);
          const sy = anchor ? anchor.transform.y + Number(p.offsetY ?? 0) : Number(p.y ?? tpl.transform.y);
          cloneTemplateObject(state, objectMap, tpl, sx, sy);
        }
        break;
      }
      case 'object.setProperty': {
        const target = p.target ? objectMap.get(String(p.target)) : undefined;
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
        const target = p.target ? objectMap.get(String(p.target)) : undefined;
        const lookAt = p.lookAtTarget ? objectMap.get(String(p.lookAtTarget)) : undefined;
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
        const target = p.target ? objectMap.get(String(p.target)) : undefined;
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
        const target = p.target ? objectMap.get(String(p.target)) : undefined;
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
        const target = p.target ? objectMap.get(String(p.target)) : undefined;
        const body = target ? state.bodies.get(target.id) : undefined;
        if (body) {
          body.vx += Number(p.ix ?? 0);
          body.vy += Number(p.iy ?? 0);
        }
        break;
      }
      case 'physics.force': {
        const target = p.target ? objectMap.get(String(p.target)) : undefined;
        const body = target ? state.bodies.get(target.id) : undefined;
        if (body) {
          body.ax += Number(p.fx ?? 0);
          body.ay += Number(p.fy ?? 0);
        }
        break;
      }
      case 'physics.setVelocity': {
        const target = p.target ? objectMap.get(String(p.target)) : undefined;
        const body = target ? state.bodies.get(target.id) : undefined;
        if (body) {
          if (p.vx !== undefined && p.vx !== '') body.vx = Number(p.vx);
          if (p.vy !== undefined && p.vy !== '') body.vy = Number(p.vy);
        }
        break;
      }
      case 'health.damage': {
        const target = p.target ? objectMap.get(String(p.target)) : undefined;
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
        const target = p.target ? objectMap.get(String(p.target)) : undefined;
        const body = target ? state.bodies.get(target.id) : undefined;
        if (body) {
          const heal = Math.max(0, Number(p.amount ?? 20));
          body.health = Math.min(body.maxHealth, body.health + heal);
          state.variables.set('salud', body.health);
        }
        break;
      }
      case 'animation.play': {
        const target = p.target ? objectMap.get(String(p.target)) : undefined;
        if (target?.sprite?.animation) {
          target.sprite.animation.enabled = true;
          target.sprite.animation.playing = true;
          if (p.clip) target.sprite.animation.activeClip = String(p.clip);
        }
        break;
      }
      case 'tween.play': {
        const target = p.target ? objectMap.get(String(p.target)) : undefined;
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
        const target = p.target ? objectMap.get(String(p.target)) : undefined;
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
        const target = p.target ? objectMap.get(String(p.target)) : undefined;
        if (target) {
          state.checkpoint = { x: target.transform.x, y: target.transform.y };
        }
        break;
      }
      case 'prefab.spawn': {
        const pf = p.prefabId ? state.prefabMap.get(String(p.prefabId)) : undefined;
        if (pf) {
          const anchor = p.atObjectId ? objectMap.get(String(p.atObjectId)) : undefined;
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
        const target = p.target ? objectMap.get(String(p.target)) : undefined;
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
        const target = p.target ? objectMap.get(String(p.target)) : undefined;
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
    }
  }
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
  const solids = collectSolidBoxes(objects);

  // Actualizar temporizadores de espera (Wait)
  if (state.pendingWaits.length > 0) {
    const stillWaiting: PendingWaitAction[] = [];
    for (const w of state.pendingWaits) {
      w.remainingSec -= dt;
      if (w.remainingSec <= 0) {
        executeActionList(w.actions, w.mechId, state, objectMap);
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
      state.soundQueue.push({ kind: 'synth', preset: 'coin', channel: 'ui' });
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
        const speed = Number(comp.config.speed ?? 130);
        const detectRadius = Number(comp.config.detectRadius ?? 420);
        const stopDistance = Number(comp.config.stopDistance ?? 36);
        const target = players[0];
        const dx = target.transform.x - obj.transform.x;
        const dy = target.transform.y - obj.transform.y;
        const dist = Math.hypot(dx, dy);
        if (dist <= detectRadius && dist > stopDistance && dist > 0.001) {
          obj.transform.x += (dx / dist) * speed * dt;
          obj.transform.y += (dy / dist) * speed * dt;
          body.vx = (dx / dist) * speed;
          body.vy = (dy / dist) * speed;
          if (obj.sprite) obj.sprite.flipX = dx < 0;
        } else {
          body.vx = 0;
          body.vy = 0;
        }
      } else if (comp.type === 'projectile') {
        obj.transform.x += body.vx * dt;
        obj.transform.y += body.vy * dt;
        if (comp.config.destroyOnSolid) {
          const pCols = getWorldColliders(obj);
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
          const pCols = getWorldColliders(obj);
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
            const tCols = getWorldColliders(target);
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
        stepExtendedObjectBehavior({
          obj,
          comp,
          state,
          objectMap,
          players,
          input,
          hasKey: isKeyPressed,
          wasKey: wasKeyFn,
          solids,
          resolveHorizontal: (o) => resolveAxisHorizontal(o, state.bodies.get(o.id)!, solids),
          resolveVertical: (o) => resolveAxisVertical(o, state.bodies.get(o.id)!, solids),
          dt,
          stage: state.stage,
        });
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
      resolveAxisHorizontal(obj, body, solids);
      obj.transform.y += body.vy * dt;
      resolveAxisVertical(obj, body, solids);
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
      const moveInput =
        (isKeyPressed('ArrowRight', input) || isKeyPressed('KeyD', input) || input.right ? 1 : 0) -
        (isKeyPressed('ArrowLeft', input) || isKeyPressed('KeyA', input) || input.left ? 1 : 0);

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
      const hitWall = resolveAxisHorizontal(obj, body, solids);

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
      resolveAxisVertical(obj, body, solids);
    } else if (plat) {
      const params = resolvePlatformerConfig(plat.config);
      const moveInput = (input.right ? 1 : 0) - (input.left ? 1 : 0);

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
      }

      if (jumpReleased && body.vy < 0) {
        body.vy *= params.variableJumpCut;
      }

      const grav = body.vy > 0 ? params.gravity * params.fallGravityMultiplier : params.gravity;
      body.vy = Math.min(params.maxFallSpeed, body.vy + (grav + body.ay) * dt);
      body.ay = 0;

      obj.transform.x += body.vx * dt;
      const hitWall = resolveAxisHorizontal(obj, body, solids);

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
      resolveAxisVertical(obj, body, solids);
    } else if (topdown) {
      const params = resolveTopDownConfig(topdown.config);
      let mx = (input.right ? 1 : 0) - (input.left ? 1 : 0);
      let my = (input.down ? 1 : 0) - (input.up ? 1 : 0);
      if (mx !== 0 && my !== 0) {
        const inv = 1 / Math.SQRT2;
        mx *= inv;
        my *= inv;
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
      resolveAxisHorizontal(obj, body, solids);

      obj.transform.y += body.vy * dt;
      resolveAxisVertical(obj, body, solids);
    }
  }

  // 3. Vincular animaciones automáticamente al movimiento
  for (const obj of objects) {
    if (!obj.visible || obj.type !== 'sprite' || !obj.sprite?.animation?.enabled) continue;
    const anim = obj.sprite.animation;
    if (!anim.linkToMovement) continue;
    const body = state.bodies.get(obj.id);
    if (!body) continue;

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
    const playerCols = players.map((p) => ({ obj: p, cols: getWorldColliders(p) }));
    for (const obj of objects) {
      if (!obj.visible) continue;
      const cp = obj.components.find((c) => c.enabled && c.type === 'checkpoint');
      const goal = obj.components.find((c) => c.enabled && c.type === 'goal_portal');
      if (!cp && !goal) continue;
      const objCols = getWorldColliders(obj);
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
          const targetCols = getWorldColliders(targetObj);
          for (const src of sources) {
            if (src.id === targetObj.id) continue;
            const srcCols = getWorldColliders(src);
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
              } else if (ev === 'collision.stay') {
                triggered = true;
              }
            } else if ((ev === 'collision.exit' || ev === 'trigger.exit') && prevSet.has(pairKey)) {
              triggered = true;
            }
          }
        }
      }
    }

    if (triggered && evaluateConditions(mech, state, objectMap, input)) {
      executeActionList(mech.actions, mech.id, state, objectMap);
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
    const playerCols = players.map((p) => getWorldColliders(p));
    for (const obj of objects) {
      if (!obj.visible || collisionHandledIds.has(obj.id)) continue;
      const col = obj.components.find(
        (c) =>
          c.enabled &&
          (c.type === 'collectible' || c.type === 'arcade.collectible_magnet_target')
      );
      if (!col) continue;
      const objCols = getWorldColliders(obj);
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
        state.soundQueue.push({ kind: 'synth', preset: 'coin', channel: 'sfx' });
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

  // 8. Cámara de seguimiento suave (Camera2D o componente juice.camera_follow)
  const camCfg = state.scene.cameraConfig;
  const followObj = camCfg?.followObjectId
    ? objectMap.get(camCfg.followObjectId)
    : objects.find((o) => o.visible && o.components.some((c) => c.enabled && c.type === 'juice.camera_follow'));

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
