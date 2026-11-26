import type {
  ActionType,
  GameMechanic,
  GameObjectData,
  GameObjectType,
  MechanicTriggerEvent,
  MemoryBudgetProfile,
  Mesh3DShape,
  ProjectVariable,
  SceneData,
  SceneLightingConfig,
  SmartCameraMode,
} from '../core/types';
import { createGameObject } from '../objects/factory';
import { getBehaviorEntry } from '../components/behaviorRegistry';
import {
  extractScriptParamsSchema,
  scanScriptSecurity,
} from '../scripting/scriptRuntime';
import type {
  CommandBarHistoryEntry,
  NexusProject,
  NexusScriptAsset,
} from '../../project/models/project';
import { createId } from '../../utils/id';

export type CommandBarMode = 'dsl' | 'json';

export type CommandOp =
  | {
      op: 'create_object';
      objectType: GameObjectType;
      name?: string;
      x?: number;
      y?: number;
      z?: number;
      sx?: number;
      sy?: number;
      sz?: number;
      shape3d?: Mesh3DShape;
      color?: string;
      tags?: string[];
    }
  | {
      op: 'update_transform';
      targetRef: string;
      x?: number;
      y?: number;
      z?: number;
      dx?: number;
      dy?: number;
      dz?: number;
      rx?: number;
      ry?: number;
      rz?: number;
      sx?: number;
      sy?: number;
      sz?: number;
      rotation?: number;
    }
  | {
      op: 'add_component';
      targetRef: string;
      componentType: string;
      config?: Record<string, unknown>;
    }
  | {
      op: 'rename_object';
      targetRef: string;
      newName: string;
    }
  | {
      op: 'tag_object';
      targetRef: string;
      addTags?: string[];
      removeTags?: string[];
    }
  | {
      op: 'remove_object';
      targetRef: string;
    }
  | {
      op: 'duplicate_object';
      targetRef: string;
      newName?: string;
      x?: number;
      y?: number;
      z?: number;
      dx?: number;
      dy?: number;
      dz?: number;
    }
  | {
      op: 'set_variable';
      name: string;
      value: number | boolean | string;
    }
  | {
      op: 'configure_streaming';
      enabled?: boolean;
      chunkSize?: number;
      loadRadius?: number;
      unloadRadius?: number;
      farProxyRadius?: number;
      budgetProfile?: MemoryBudgetProfile;
    }
  | {
      op: 'add_mechanic';
      name: string;
      triggerEvent: MechanicTriggerEvent;
      sourceRef?: string;
      tag?: string;
      key?: string;
      intervalSec?: number;
      variable?: string;
      eventName?: string;
      actionType: ActionType;
      actionParams?: Record<string, unknown>;
    }
  | {
      op: 'create_script';
      name: string;
      code: string;
      targetRef?: string;
      securityMode?: 'safe_sandbox' | 'trusted_js';
    }
  | {
      op: 'set_lighting';
      sunIntensity?: number;
      ambientIntensity?: number;
      fogEnabled?: boolean;
      fogNear?: number;
      fogFar?: number;
      timeOfDay?: number;
      dayCycleSpeed?: number;
      dayNightEnabled?: boolean;
      sunColor?: string;
      ambientColor?: string;
    }
  | {
      op: 'configure_camera';
      targetRef?: string;
      mode?: SmartCameraMode;
      distance?: number;
      fov?: number;
      collideWithWalls?: boolean;
      allowShoulderSwap?: boolean;
    };

export interface CommandDiffEntry {
  kind: 'add' | 'modify' | 'delete';
  scope: 'object' | 'variable' | 'scene' | 'mechanic' | 'script';
  targetId: string;
  targetLabel: string;
  before?: string;
  after?: string;
}

export interface CommandPlan {
  valid: boolean;
  mode: CommandBarMode;
  commandText: string;
  summary: string;
  errors: string[];
  warnings: string[];
  requiresDestructiveConfirm: boolean;
  diffs: CommandDiffEntry[];
  operations: CommandOp[];
}

export interface AppliedCommandResult {
  nextProject: NexusProject;
  createdIds: string[];
  affectedIds: string[];
  historyEntry: CommandBarHistoryEntry;
}

const VALID_OBJECT_TYPES = new Set<GameObjectType>([
  'sprite',
  'rectangle',
  'circle',
  'text',
  'container',
  'tilemap',
  'ui_button',
  'ui_panel',
  'ui_progress_bar',
  'ui_leaderboard',
  'ui_widget',
  'light_2d',
  'mesh_3d',
  'light_3d',
  'camera_3d',
]);

const VALID_3D_SHAPES = new Set<Mesh3DShape>([
  'box',
  'sphere',
  'cylinder',
  'plane',
  'ramp',
  'stairs',
  'arch',
  'terrain',
  'water',
  'grass_field',
  'glb',
  'csg',
]);

const VALID_TRIGGER_EVENTS = new Set<MechanicTriggerEvent>([
  'scene.start',
  'scene.paused',
  'tick',
  'collision.enter',
  'collision.stay',
  'collision.exit',
  'trigger.enter',
  'trigger.exit',
  'input.pressed',
  'input.held',
  'input.released',
  'ui.click',
  'mouse.clickGlobal',
  'mouse.hold',
  'mouse.release',
  'touch.swipe',
  'timer.elapsed',
  'countdown.zero',
  'variable.changed',
  'health.zero',
  'portal.adClosed',
  'portal.rewarded',
  'custom.event',
]);

const TRIGGER_EVENT_ALIASES: Record<string, MechanicTriggerEvent> = {
  inicio: 'scene.start',
  start: 'scene.start',
  frame: 'tick',
  update: 'tick',
  cada_frame: 'tick',
  colision: 'collision.enter',
  collision: 'collision.enter',
  tocar: 'trigger.enter',
  trigger: 'trigger.enter',
  tecla: 'input.pressed',
  key: 'input.pressed',
  tecla_mantenida: 'input.held',
  click: 'ui.click',
  temporizador: 'timer.elapsed',
  timer: 'timer.elapsed',
  evento: 'custom.event',
};

const VALID_ACTION_TYPES = new Set<ActionType>([
  'variable.add',
  'variable.set',
  'audio.play',
  'audio.beep',
  'audio.setVolume',
  'audio.stopAll',
  'music.play',
  'music.stop',
  'object.destroy',
  'object.show',
  'object.hide',
  'object.move',
  'object.teleport',
  'object.spawn',
  'object.setProperty',
  'object.rotateToward',
  'object.flash',
  'component.toggle',
  'physics.impulse',
  'physics.force',
  'physics.setVelocity',
  'health.damage',
  'health.heal',
  'animation.play',
  'tween.play',
  'state.set',
  'scene.load',
  'scene.overlay',
  'scene.pop',
  'scene.restart',
  'scene.nextLevel',
  'scene.pause',
  'checkpoint.save',
  'prefab.spawn',
  'camera.shake',
  'particles.burst',
  'particles.emit',
  'storage.save',
  'storage.load',
  'leaderboard.submit',
  'event.emit',
  'script.call',
  'ui.openInterface',
  'ui.closeInterface',
  'ui.toggleInterface',
  'camera.switch',
  'anim3d.setState',
  'vfx.emit',
  'ai.chase',
  'ai.moveTo',
  'ai.stop',
  'dialogue.start',
  'i18n.setLocale',
  'vehicle.enterExit',
  'wait',
]);

const ACTION_TYPE_ALIASES: Record<string, ActionType> = {
  sumar_variable: 'variable.add',
  add_variable: 'variable.add',
  fijar_variable: 'variable.set',
  set_variable: 'variable.set',
  sonido: 'audio.play',
  beep: 'audio.beep',
  destruir: 'object.destroy',
  ocultar: 'object.hide',
  mostrar: 'object.show',
  teletransportar: 'object.teleport',
  impulso: 'physics.impulse',
  velocidad: 'physics.setVelocity',
  dañar: 'health.damage',
  curar: 'health.heal',
  particulas: 'particles.burst',
  vibrar: 'camera.shake',
  escena: 'scene.load',
  reiniciar: 'scene.restart',
  evento: 'event.emit',
  vehiculo: 'vehicle.enterExit',
};

const VALID_CAMERA_MODES = new Set<SmartCameraMode>([
  'fixed',
  'smooth_follow',
  'third_person_orbit',
  'first_person',
  'top_down',
  'deadzone',
]);

const TYPE_ALIASES: Record<string, GameObjectType> = {
  cubo: 'mesh_3d',
  caja: 'mesh_3d',
  box: 'mesh_3d',
  esfera: 'mesh_3d',
  sphere: 'mesh_3d',
  cilindro: 'mesh_3d',
  cylinder: 'mesh_3d',
  terreno: 'mesh_3d',
  terrain: 'mesh_3d',
  agua: 'mesh_3d',
  water: 'mesh_3d',
  rampa: 'mesh_3d',
  ramp: 'mesh_3d',
  arco: 'mesh_3d',
  arch: 'mesh_3d',
  escaleras: 'mesh_3d',
  stairs: 'mesh_3d',
  mesh: 'mesh_3d',
  mesh3d: 'mesh_3d',
  luz3d: 'light_3d',
  luz_3d: 'light_3d',
  light3d: 'light_3d',
  camara: 'camera_3d',
  camara3d: 'camera_3d',
  camera: 'camera_3d',
  rectangulo: 'rectangle',
  rect: 'rectangle',
  circulo: 'circle',
  texto: 'text',
  boton: 'ui_button',
  panel: 'ui_panel',
  widget: 'ui_widget',
  luz2d: 'light_2d',
};

const SHAPE_ALIASES: Record<string, Mesh3DShape> = {
  cubo: 'box',
  caja: 'box',
  box: 'box',
  esfera: 'sphere',
  sphere: 'sphere',
  cilindro: 'cylinder',
  cylinder: 'cylinder',
  plano: 'plane',
  plane: 'plane',
  rampa: 'ramp',
  ramp: 'ramp',
  escaleras: 'stairs',
  stairs: 'stairs',
  arco: 'arch',
  arch: 'arch',
  terreno: 'terrain',
  terrain: 'terrain',
  agua: 'water',
  water: 'water',
  pasto: 'grass_field',
  hierba: 'grass_field',
  grass_field: 'grass_field',
};

function tokenizeDslLine(line: string): string[] {
  const tokens: string[] = [];
  let cur = '';
  let quote: '"' | "'" | null = null;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (quote) {
      if (ch === '\\' && i + 1 < line.length) {
        const next = line[i + 1];
        if (next === 'n') {
          cur += '\n';
          i += 1;
          continue;
        }
        if (next === quote || next === '\\') {
          cur += next;
          i += 1;
          continue;
        }
      }
      if (ch === quote) {
        quote = null;
      } else {
        cur += ch;
      }
      continue;
    }
    if (ch === '"' || ch === "'") {
      quote = ch;
      continue;
    }
    if (/\s/.test(ch)) {
      if (cur.length > 0) {
        tokens.push(cur);
        cur = '';
      }
      continue;
    }
    cur += ch;
  }
  if (cur.length > 0) tokens.push(cur);
  return tokens;
}

/**
 * Divide texto DSL en sentencias lógicas sin romper `;` que estén dentro de comillas
 * (necesario para snippets JS dentro de `script codigo="..."`).
 */
function splitDslStatements(rawText: string): string[] {
  const statements: string[] = [];
  let cur = '';
  let quote: '"' | "'" | null = null;
  for (let i = 0; i < rawText.length; i++) {
    const ch = rawText[i];
    if (quote) {
      cur += ch;
      if (ch === '\\' && i + 1 < rawText.length) {
        cur += rawText[i + 1];
        i += 1;
        continue;
      }
      if (ch === quote) quote = null;
      continue;
    }
    if (ch === '"' || ch === "'") {
      quote = ch;
      cur += ch;
      continue;
    }
    if (ch === '\n' || ch === '\r' || ch === ';') {
      const trimmed = cur.trim();
      if (trimmed.length > 0 && !trimmed.startsWith('//') && !trimmed.startsWith('#comment')) {
        statements.push(trimmed);
      }
      cur = '';
      continue;
    }
    cur += ch;
  }
  const tail = cur.trim();
  if (tail.length > 0 && !tail.startsWith('//') && !tail.startsWith('#comment')) {
    statements.push(tail);
  }
  return statements;
}

function parseScalar(raw: string): number | boolean | string {
  const t = raw.trim();
  if (t === 'true' || t === 'si' || t === 'sí') return true;
  if (t === 'false' || t === 'no') return false;
  if (/^-?\d+(\.\d+)?$/.test(t)) return Number(t);
  return t;
}

function parseBoolOpt(v: string | undefined): boolean | undefined {
  if (v === undefined) return undefined;
  const s = v.trim().toLowerCase();
  if (s === 'true' || s === 'si' || s === 'sí' || s === '1' || s === 'on') return true;
  if (s === 'false' || s === 'no' || s === '0' || s === 'off') return false;
  return undefined;
}

function parseKvArgs(tokens: string[]): { kv: Record<string, string>; positional: string[] } {
  const kv: Record<string, string> = {};
  const positional: string[] = [];
  for (const tok of tokens) {
    const eqIdx = tok.indexOf('=');
    if (eqIdx > 0) {
      const k = tok.slice(0, eqIdx).trim().toLowerCase();
      const v = tok.slice(eqIdx + 1).trim();
      kv[k] = v;
    } else {
      positional.push(tok);
    }
  }
  return { kv, positional };
}

function parseNum(v: string | undefined): number | undefined {
  if (v === undefined) return undefined;
  const n = Number(v);
  return Number.isFinite(n) ? n : undefined;
}

function normalizeTriggerEvent(raw: string): MechanicTriggerEvent | null {
  const low = raw.trim().toLowerCase();
  if (VALID_TRIGGER_EVENTS.has(raw.trim() as MechanicTriggerEvent)) {
    return raw.trim() as MechanicTriggerEvent;
  }
  for (const ev of VALID_TRIGGER_EVENTS) {
    if (ev.toLowerCase() === low) return ev;
  }
  return TRIGGER_EVENT_ALIASES[low] ?? null;
}

function normalizeActionType(raw: string): ActionType | null {
  const low = raw.trim().toLowerCase();
  if (VALID_ACTION_TYPES.has(raw.trim() as ActionType)) {
    return raw.trim() as ActionType;
  }
  for (const act of VALID_ACTION_TYPES) {
    if (act.toLowerCase() === low) return act;
  }
  return ACTION_TYPE_ALIASES[low] ?? null;
}

function normalizeActionParams(
  actionType: ActionType,
  rawParams: Record<string, unknown>
): Record<string, unknown> {
  const out: Record<string, unknown> = { ...rawParams };
  if (out.var !== undefined && out.variable === undefined) {
    out.variable = out.var;
    delete out.var;
  }
  if (out.objetivo !== undefined && out.target === undefined) {
    out.target = out.objetivo;
    delete out.objetivo;
  }
  if (actionType === 'variable.add') {
    const val = out.amount ?? out.cantidad ?? out.delta ?? out.valor ?? out.value;
    if (val !== undefined) out.amount = val;
    delete out.cantidad;
    delete out.delta;
    delete out.valor;
  } else if (actionType === 'variable.set') {
    const val = out.value ?? out.valor ?? out.amount ?? out.cantidad;
    if (val !== undefined) out.value = val;
    delete out.valor;
    delete out.cantidad;
  }
  return out;
}

const MECHANIC_RESERVED_KV = new Set([
  'nombre',
  'name',
  'evento',
  'event',
  'trigger',
  'fuente',
  'source',
  'origen',
  'tag',
  'tecla',
  'key',
  'intervalo',
  'interval',
  'intervalsec',
  'trigvar',
  'evento_nombre',
  'eventname',
  'accion',
  'action',
]);

function parseDslToOps(
  rawText: string,
  sceneObjects: GameObjectData[]
): { ops: CommandOp[]; errors: string[] } {
  const lines = splitDslStatements(rawText);

  const ops: CommandOp[] = [];
  const errors: string[] = [];

  if (lines.length === 0) {
    errors.push('Escribe un comando DSL o cambia a modo JSON declarativo.');
    return { ops, errors };
  }

  for (let li = 0; li < lines.length; li++) {
    const tokens = tokenizeDslLine(lines[li]);
    if (tokens.length === 0) continue;
    const verb = tokens[0].toLowerCase();
    const lineTag = lines.length > 1 ? `Línea ${li + 1}: ` : '';

    if (verb === 'crear' || verb === 'create') {
      const { kv, positional } = parseKvArgs(tokens.slice(1));
      const rawType = (positional[0] ?? kv.tipo ?? kv.type ?? '').toLowerCase();
      if (!rawType) {
        errors.push(`${lineTag}Indica el tipo de objeto a crear (ej. crear cubo, crear sprite, crear light_3d).`);
        continue;
      }
      let objectType: GameObjectType | null = null;
      let shape3d: Mesh3DShape | undefined;
      if (VALID_OBJECT_TYPES.has(rawType as GameObjectType)) {
        objectType = rawType as GameObjectType;
      } else if (TYPE_ALIASES[rawType]) {
        objectType = TYPE_ALIASES[rawType];
        if (objectType === 'mesh_3d' && SHAPE_ALIASES[rawType]) {
          shape3d = SHAPE_ALIASES[rawType];
        }
      }
      if (!objectType) {
        errors.push(`${lineTag}Tipo de objeto desconocido "${rawType}".`);
        continue;
      }
      const rawShape = (kv.forma ?? kv.shape ?? '').toLowerCase();
      if (rawShape) {
        const mappedShape = SHAPE_ALIASES[rawShape] ?? (VALID_3D_SHAPES.has(rawShape as Mesh3DShape) ? (rawShape as Mesh3DShape) : undefined);
        if (!mappedShape) {
          errors.push(`${lineTag}Forma 3D no soportada "${rawShape}".`);
          continue;
        }
        shape3d = mappedShape;
      }
      const name = kv.nombre ?? kv.name ?? positional[1];
      const tags = kv.tag ? kv.tag.split(',').map((s) => s.trim()).filter(Boolean) : undefined;
      ops.push({
        op: 'create_object',
        objectType,
        name,
        x: parseNum(kv.x),
        y: parseNum(kv.y),
        z: parseNum(kv.z),
        sx: parseNum(kv.sx),
        sy: parseNum(kv.sy),
        sz: parseNum(kv.sz),
        shape3d,
        color: kv.color,
        tags,
      });
    } else if (verb === 'mover' || verb === 'move') {
      const { kv, positional } = parseKvArgs(tokens.slice(1));
      const targetRef = positional[0];
      if (!targetRef) {
        errors.push(`${lineTag}Indica el objeto a mover (ej. mover Jugador_3D x=10 y=2 z=-5).`);
        continue;
      }
      const op: CommandOp = {
        op: 'update_transform',
        targetRef,
        x: parseNum(kv.x),
        y: parseNum(kv.y),
        z: parseNum(kv.z),
        dx: parseNum(kv.dx),
        dy: parseNum(kv.dy),
        dz: parseNum(kv.dz),
      };
      if (
        op.x === undefined &&
        op.y === undefined &&
        op.z === undefined &&
        op.dx === undefined &&
        op.dy === undefined &&
        op.dz === undefined
      ) {
        errors.push(`${lineTag}Debes especificar al menos x=, y=, z=, dx=, dy= o dz=.`);
        continue;
      }
      ops.push(op);
    } else if (verb === 'escalar' || verb === 'scale') {
      const { kv, positional } = parseKvArgs(tokens.slice(1));
      const targetRef = positional[0];
      if (!targetRef) {
        errors.push(`${lineTag}Indica el objeto a escalar (ej. escalar Muro sx=8 sy=4 sz=1).`);
        continue;
      }
      const uniform = parseNum(kv.s ?? kv.escala ?? kv.scale);
      const sx = parseNum(kv.sx) ?? uniform;
      const sy = parseNum(kv.sy) ?? uniform;
      const sz = parseNum(kv.sz) ?? uniform;
      if (sx === undefined && sy === undefined && sz === undefined) {
        errors.push(`${lineTag}Indica sx=, sy=, sz= o s= para escalar.`);
        continue;
      }
      ops.push({ op: 'update_transform', targetRef, sx, sy, sz });
    } else if (verb === 'rotar' || verb === 'rotate') {
      const { kv, positional } = parseKvArgs(tokens.slice(1));
      const targetRef = positional[0];
      if (!targetRef) {
        errors.push(`${lineTag}Indica el objeto a rotar (ej. rotar Camara ry=45).`);
        continue;
      }
      const rx = parseNum(kv.rx);
      const ry = parseNum(kv.ry);
      const rz = parseNum(kv.rz);
      const rotation = parseNum(kv.rot ?? kv.rotation ?? kv.angulo);
      if (rx === undefined && ry === undefined && rz === undefined && rotation === undefined) {
        errors.push(`${lineTag}Indica rx=, ry=, rz= o rot=.`);
        continue;
      }
      ops.push({ op: 'update_transform', targetRef, rx, ry, rz, rotation });
    } else if (verb === 'agregar' || verb === 'añadir' || verb === 'add') {
      const sub = (tokens[1] ?? '').toLowerCase();
      const startIdx = sub === 'componente' || sub === 'component' ? 2 : 1;
      const { kv, positional } = parseKvArgs(tokens.slice(startIdx));
      const targetRef = positional[0];
      const componentType = positional[1];
      if (!targetRef || !componentType) {
        errors.push(`${lineTag}Formato: agregar componente <objeto> <tipo> [clave=valor]`);
        continue;
      }
      const cfg: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(kv)) cfg[k] = parseScalar(v);
      ops.push({ op: 'add_component', targetRef, componentType, config: cfg });
    } else if (verb === 'renombrar' || verb === 'rename') {
      const targetRef = tokens[1];
      const newName = tokens[2];
      if (!targetRef || !newName) {
        errors.push(`${lineTag}Formato: renombrar <objeto> <nuevoNombre>`);
        continue;
      }
      ops.push({ op: 'rename_object', targetRef, newName });
    } else if (verb === 'duplicar' || verb === 'duplicate') {
      const { kv, positional } = parseKvArgs(tokens.slice(1));
      const targetRef = positional[0] ?? kv.objetivo ?? kv.target;
      if (!targetRef) {
        errors.push(`${lineTag}Formato: duplicar <objeto> [nombre=Copia] [dx=2 dy=0 dz=0]`);
        continue;
      }
      ops.push({
        op: 'duplicate_object',
        targetRef,
        newName: kv.nombre ?? kv.name ?? positional[1],
        x: parseNum(kv.x),
        y: parseNum(kv.y),
        z: parseNum(kv.z),
        dx: parseNum(kv.dx),
        dy: parseNum(kv.dy),
        dz: parseNum(kv.dz),
      });
    } else if (verb === 'etiquetar' || verb === 'tag') {
      const targetRef = tokens[1];
      const tagArgs = tokens.slice(2);
      if (!targetRef || tagArgs.length === 0) {
        errors.push(`${lineTag}Formato: etiquetar <objeto> +etiqueta | -etiqueta`);
        continue;
      }
      const addTags: string[] = [];
      const removeTags: string[] = [];
      for (const ta of tagArgs) {
        if (ta.startsWith('-')) removeTags.push(ta.slice(1));
        else if (ta.startsWith('+')) addTags.push(ta.slice(1));
        else addTags.push(ta);
      }
      ops.push({ op: 'tag_object', targetRef, addTags, removeTags });
    } else if (verb === 'variable' || verb === 'var') {
      const joined = tokens.slice(1).join(' ');
      const m = joined.match(/^([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.+)$/);
      if (!m) {
        errors.push(`${lineTag}Formato: variable <nombre> = <valor>`);
        continue;
      }
      ops.push({ op: 'set_variable', name: m[1], value: parseScalar(m[2]) });
    } else if (verb === 'eliminar' || verb === 'borrar' || verb === 'remove' || verb === 'delete') {
      const targetRef = tokens[1];
      if (!targetRef) {
        errors.push(`${lineTag}Indica el objeto a eliminar (ej. eliminar Caja_1).`);
        continue;
      }
      ops.push({ op: 'remove_object', targetRef });
    } else if (verb === 'streaming') {
      const sub = (tokens[1] ?? '').toLowerCase();
      const { kv } = parseKvArgs(tokens.slice(sub === 'activar' || sub === 'desactivar' || sub === 'enable' || sub === 'disable' ? 2 : 1));
      const enabled =
        sub === 'activar' || sub === 'enable'
          ? true
          : sub === 'desactivar' || sub === 'disable'
            ? false
            : kv.enabled !== undefined
              ? kv.enabled === 'true'
              : undefined;
      const profileRaw = (kv.perfil ?? kv.profile ?? '').toLowerCase();
      const budgetProfile =
        profileRaw === 'mobile' || profileRaw === 'movil' || profileRaw === 'móvil'
          ? 'mobile'
          : profileRaw === 'pc' || profileRaw === 'custom'
            ? (profileRaw as MemoryBudgetProfile)
            : undefined;
      ops.push({
        op: 'configure_streaming',
        enabled,
        chunkSize: parseNum(kv.chunk ?? kv.chunksize),
        loadRadius: parseNum(kv.carga ?? kv.loadradius),
        unloadRadius: parseNum(kv.descarga ?? kv.unloadradius),
        farProxyRadius: parseNum(kv.hlod ?? kv.farproxyradius),
        budgetProfile,
      });
    } else if (verb === 'mecanica' || verb === 'mecánica' || verb === 'mechanic') {
      const { kv, positional } = parseKvArgs(tokens.slice(1));
      const rawTrigger = kv.evento ?? kv.event ?? kv.trigger ?? positional[0];
      const rawAction = kv.accion ?? kv.acción ?? kv.action ?? positional[1];
      if (!rawTrigger || !rawAction) {
        errors.push(
          `${lineTag}Formato: mecanica nombre="Saltar" evento=input.pressed tecla=Space accion=physics.impulse target=@selected iy=10`
        );
        continue;
      }
      const triggerEvent = normalizeTriggerEvent(rawTrigger);
      if (!triggerEvent) {
        errors.push(`${lineTag}Evento de mecánica desconocido "${rawTrigger}".`);
        continue;
      }
      const actionType = normalizeActionType(rawAction);
      if (!actionType) {
        errors.push(`${lineTag}Acción de mecánica desconocida "${rawAction}".`);
        continue;
      }
      const rawParams: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(kv)) {
        if (MECHANIC_RESERVED_KV.has(k)) continue;
        rawParams[k] = parseScalar(v);
      }
      const name = kv.nombre ?? kv.name ?? `${triggerEvent} → ${actionType}`;
      ops.push({
        op: 'add_mechanic',
        name,
        triggerEvent,
        sourceRef: kv.fuente ?? kv.source ?? kv.origen,
        tag: kv.tag,
        key: kv.tecla ?? kv.key,
        intervalSec: parseNum(kv.intervalo ?? kv.interval ?? kv.intervalsec),
        variable: kv.trigvar,
        eventName: kv.evento_nombre ?? kv.eventname,
        actionType,
        actionParams: normalizeActionParams(actionType, rawParams),
      });
    } else if (verb === 'script') {
      const { kv, positional } = parseKvArgs(tokens.slice(1));
      const name = kv.nombre ?? kv.name ?? positional[0] ?? 'Script_Comando';
      const code = kv.codigo ?? kv.código ?? kv.code ?? positional[1] ?? '';
      if (!code.trim()) {
        errors.push(
          `${lineTag}Formato: script nombre=Rotar objeto=@lastCreated codigo="export function onUpdate(self, dt){ self.ry += 60 * dt; }"`
        );
        continue;
      }
      const modeRaw = (kv.modo ?? kv.mode ?? kv.securitymode ?? '').toLowerCase();
      const securityMode =
        modeRaw === 'trusted' || modeRaw === 'trusted_js'
          ? 'trusted_js'
          : modeRaw === 'safe' || modeRaw === 'safe_sandbox'
            ? 'safe_sandbox'
            : undefined;
      ops.push({
        op: 'create_script',
        name,
        code,
        targetRef: kv.objeto ?? kv.object ?? kv.target ?? kv.objetivo,
        securityMode,
      });
    } else if (verb === 'iluminacion' || verb === 'iluminación' || verb === 'lighting') {
      const { kv } = parseKvArgs(tokens.slice(1));
      const sunIntensity = parseNum(kv.sol ?? kv.sun ?? kv.sunintensity);
      const ambientIntensity = parseNum(kv.ambiente ?? kv.ambient ?? kv.ambientintensity);
      const fogEnabled = parseBoolOpt(kv.niebla ?? kv.fog ?? kv.fogenabled);
      const fogNear = parseNum(kv.niebla_cerca ?? kv.fognear);
      const fogFar = parseNum(kv.niebla_lejos ?? kv.fogfar);
      const timeOfDay = parseNum(kv.hora ?? kv.timeofday ?? kv.time);
      const dayCycleSpeed = parseNum(kv.velocidad_dia ?? kv.daycyclespeed ?? kv.speed);
      const dayNightEnabled = parseBoolOpt(kv.ciclo ?? kv.daynight ?? kv.daynightenabled);
      const sunColor = kv.color_sol ?? kv.suncolor;
      const ambientColor = kv.color_ambiente ?? kv.ambientcolor;
      if (
        sunIntensity === undefined &&
        ambientIntensity === undefined &&
        fogEnabled === undefined &&
        fogNear === undefined &&
        fogFar === undefined &&
        timeOfDay === undefined &&
        dayCycleSpeed === undefined &&
        dayNightEnabled === undefined &&
        sunColor === undefined &&
        ambientColor === undefined
      ) {
        errors.push(
          `${lineTag}Indica al menos un parámetro de iluminación (sol=, ambiente=, hora=, ciclo=, niebla=).`
        );
        continue;
      }
      ops.push({
        op: 'set_lighting',
        sunIntensity,
        ambientIntensity,
        fogEnabled,
        fogNear,
        fogFar,
        timeOfDay,
        dayCycleSpeed,
        dayNightEnabled,
        sunColor,
        ambientColor,
      });
    } else if (verb === 'camara' || verb === 'cámara' || verb === 'camera_config') {
      const { kv, positional } = parseKvArgs(tokens.slice(1));
      const rawMode = (kv.modo ?? kv.mode ?? '').toLowerCase();
      let mode: SmartCameraMode | undefined;
      if (rawMode) {
        if (!VALID_CAMERA_MODES.has(rawMode as SmartCameraMode)) {
          errors.push(
            `${lineTag}Modo de cámara desconocido "${rawMode}". Usa: fixed, smooth_follow, third_person_orbit, first_person, top_down o deadzone.`
          );
          continue;
        }
        mode = rawMode as SmartCameraMode;
      }
      const distance = parseNum(kv.distancia ?? kv.distance);
      const fov = parseNum(kv.fov);
      const collideWithWalls = parseBoolOpt(kv.colision ?? kv.colisionar ?? kv.collidewithwalls);
      const allowShoulderSwap = parseBoolOpt(kv.hombro ?? kv.shoulderswap ?? kv.allowshoulderswap);
      const targetRef = kv.objeto ?? kv.objetivo ?? kv.target ?? positional[0];
      if (
        mode === undefined &&
        distance === undefined &&
        fov === undefined &&
        collideWithWalls === undefined &&
        allowShoulderSwap === undefined
      ) {
        errors.push(
          `${lineTag}Indica modo=, distancia=, fov=, colision= o hombro= para configurar la cámara.`
        );
        continue;
      }
      ops.push({
        op: 'configure_camera',
        targetRef,
        mode,
        distance,
        fov,
        collideWithWalls,
        allowShoulderSwap,
      });
    } else if (sceneObjects.length >= 0) {
      errors.push(
        `${lineTag}Verbo "${tokens[0]}" no reconocido. Usa: crear, mover, escalar, rotar, duplicar, agregar componente, renombrar, etiquetar, variable, mecanica, script, iluminacion, camara, eliminar o streaming.`
      );
    }
  }

  return { ops, errors };
}

function parseJsonToOps(rawText: string): { ops: CommandOp[]; errors: string[] } {
  const errors: string[] = [];
  let parsed: unknown;
  try {
    parsed = JSON.parse(rawText);
  } catch (err) {
    errors.push(`JSON inválido: ${err instanceof Error ? err.message : String(err)}`);
    return { ops: [], errors };
  }

  const rawList: unknown[] = Array.isArray(parsed)
    ? parsed
    : parsed && typeof parsed === 'object' && Array.isArray((parsed as { ops?: unknown[] }).ops)
      ? (parsed as { ops: unknown[] }).ops
      : [];

  if (rawList.length === 0) {
    errors.push('El JSON debe contener un array o un objeto `{ "ops": [...] }` con al menos una operación.');
    return { ops: [], errors };
  }

  const ops: CommandOp[] = [];
  for (let i = 0; i < rawList.length; i++) {
    const item = rawList[i] as Record<string, unknown> | null;
    if (!item || typeof item !== 'object') {
      errors.push(`Operación #${i + 1}: debe ser un objeto JSON.`);
      continue;
    }
    const kind = String(item.op ?? '').trim();
    if (kind === 'create_object') {
      const objectType = String(item.type ?? item.objectType ?? 'mesh_3d') as GameObjectType;
      if (!VALID_OBJECT_TYPES.has(objectType)) {
        errors.push(`Operación #${i + 1}: tipo de objeto inválido "${objectType}".`);
        continue;
      }
      ops.push({
        op: 'create_object',
        objectType,
        name: typeof item.name === 'string' ? item.name : undefined,
        x: typeof item.x === 'number' ? item.x : undefined,
        y: typeof item.y === 'number' ? item.y : undefined,
        z: typeof item.z === 'number' ? item.z : undefined,
        sx: typeof item.sx === 'number' ? item.sx : undefined,
        sy: typeof item.sy === 'number' ? item.sy : undefined,
        sz: typeof item.sz === 'number' ? item.sz : undefined,
        shape3d: typeof item.shape3d === 'string' ? (item.shape3d as Mesh3DShape) : undefined,
        color: typeof item.color === 'string' ? item.color : undefined,
        tags: Array.isArray(item.tags) ? item.tags.map(String) : undefined,
      });
    } else if (kind === 'update_transform') {
      const targetRef = String(item.target ?? item.targetRef ?? '').trim();
      if (!targetRef) {
        errors.push(`Operación #${i + 1} (update_transform): falta "target".`);
        continue;
      }
      ops.push({
        op: 'update_transform',
        targetRef,
        x: typeof item.x === 'number' ? item.x : undefined,
        y: typeof item.y === 'number' ? item.y : undefined,
        z: typeof item.z === 'number' ? item.z : undefined,
        dx: typeof item.dx === 'number' ? item.dx : undefined,
        dy: typeof item.dy === 'number' ? item.dy : undefined,
        dz: typeof item.dz === 'number' ? item.dz : undefined,
        rx: typeof item.rx === 'number' ? item.rx : undefined,
        ry: typeof item.ry === 'number' ? item.ry : undefined,
        rz: typeof item.rz === 'number' ? item.rz : undefined,
        sx: typeof item.sx === 'number' ? item.sx : undefined,
        sy: typeof item.sy === 'number' ? item.sy : undefined,
        sz: typeof item.sz === 'number' ? item.sz : undefined,
        rotation: typeof item.rotation === 'number' ? item.rotation : undefined,
      });
    } else if (kind === 'add_component') {
      const targetRef = String(item.target ?? item.targetRef ?? '').trim();
      const componentType = String(item.componentType ?? item.type ?? '').trim();
      if (!targetRef || !componentType) {
        errors.push(`Operación #${i + 1} (add_component): requiere "target" y "componentType".`);
        continue;
      }
      ops.push({
        op: 'add_component',
        targetRef,
        componentType,
        config:
          item.config && typeof item.config === 'object'
            ? (item.config as Record<string, unknown>)
            : undefined,
      });
    } else if (kind === 'rename_object') {
      const targetRef = String(item.target ?? item.targetRef ?? '').trim();
      const newName = String(item.newName ?? item.name ?? '').trim();
      if (!targetRef || !newName) {
        errors.push(`Operación #${i + 1} (rename_object): requiere "target" y "newName".`);
        continue;
      }
      ops.push({ op: 'rename_object', targetRef, newName });
    } else if (kind === 'duplicate_object') {
      const targetRef = String(item.target ?? item.targetRef ?? '').trim();
      if (!targetRef) {
        errors.push(`Operación #${i + 1} (duplicate_object): requiere "target".`);
        continue;
      }
      ops.push({
        op: 'duplicate_object',
        targetRef,
        newName: typeof item.newName === 'string' ? item.newName : undefined,
        x: typeof item.x === 'number' ? item.x : undefined,
        y: typeof item.y === 'number' ? item.y : undefined,
        z: typeof item.z === 'number' ? item.z : undefined,
        dx: typeof item.dx === 'number' ? item.dx : undefined,
        dy: typeof item.dy === 'number' ? item.dy : undefined,
        dz: typeof item.dz === 'number' ? item.dz : undefined,
      });
    } else if (kind === 'tag_object') {
      const targetRef = String(item.target ?? item.targetRef ?? '').trim();
      if (!targetRef) {
        errors.push(`Operación #${i + 1} (tag_object): requiere "target".`);
        continue;
      }
      ops.push({
        op: 'tag_object',
        targetRef,
        addTags: Array.isArray(item.addTags) ? item.addTags.map(String) : undefined,
        removeTags: Array.isArray(item.removeTags) ? item.removeTags.map(String) : undefined,
      });
    } else if (kind === 'remove_object') {
      const targetRef = String(item.target ?? item.targetRef ?? '').trim();
      if (!targetRef) {
        errors.push(`Operación #${i + 1} (remove_object): requiere "target".`);
        continue;
      }
      ops.push({ op: 'remove_object', targetRef });
    } else if (kind === 'set_variable') {
      const name = String(item.name ?? '').trim();
      if (!name || item.value === undefined) {
        errors.push(`Operación #${i + 1} (set_variable): requiere "name" y "value".`);
        continue;
      }
      const val =
        typeof item.value === 'number' || typeof item.value === 'boolean' || typeof item.value === 'string'
          ? item.value
          : String(item.value);
      ops.push({ op: 'set_variable', name, value: val });
    } else if (kind === 'configure_streaming') {
      ops.push({
        op: 'configure_streaming',
        enabled: typeof item.enabled === 'boolean' ? item.enabled : undefined,
        chunkSize: typeof item.chunkSize === 'number' ? item.chunkSize : undefined,
        loadRadius: typeof item.loadRadius === 'number' ? item.loadRadius : undefined,
        unloadRadius: typeof item.unloadRadius === 'number' ? item.unloadRadius : undefined,
        farProxyRadius: typeof item.farProxyRadius === 'number' ? item.farProxyRadius : undefined,
        budgetProfile:
          item.budgetProfile === 'pc' || item.budgetProfile === 'mobile' || item.budgetProfile === 'custom'
            ? item.budgetProfile
            : undefined,
      });
    } else if (kind === 'add_mechanic') {
      const rawTrigger = String(item.triggerEvent ?? item.event ?? '').trim();
      const rawAction = String(item.actionType ?? item.action ?? '').trim();
      const triggerEvent = normalizeTriggerEvent(rawTrigger);
      const actionType = normalizeActionType(rawAction);
      if (!triggerEvent || !actionType) {
        errors.push(
          `Operación #${i + 1} (add_mechanic): requiere "triggerEvent" y "actionType" válidos.`
        );
        continue;
      }
      const rawParams =
        item.actionParams && typeof item.actionParams === 'object'
          ? (item.actionParams as Record<string, unknown>)
          : {};
      ops.push({
        op: 'add_mechanic',
        name: typeof item.name === 'string' && item.name.trim() ? item.name.trim() : `${triggerEvent} → ${actionType}`,
        triggerEvent,
        sourceRef: typeof item.sourceRef === 'string' ? item.sourceRef : undefined,
        tag: typeof item.tag === 'string' ? item.tag : undefined,
        key: typeof item.key === 'string' ? item.key : undefined,
        intervalSec: typeof item.intervalSec === 'number' ? item.intervalSec : undefined,
        variable: typeof item.variable === 'string' ? item.variable : undefined,
        eventName: typeof item.eventName === 'string' ? item.eventName : undefined,
        actionType,
        actionParams: normalizeActionParams(actionType, rawParams),
      });
    } else if (kind === 'create_script') {
      const name = String(item.name ?? 'Script_Comando').trim();
      const code = String(item.code ?? '');
      if (!code.trim()) {
        errors.push(`Operación #${i + 1} (create_script): requiere "code" no vacío.`);
        continue;
      }
      const secMode =
        item.securityMode === 'trusted_js' || item.securityMode === 'safe_sandbox'
          ? item.securityMode
          : undefined;
      ops.push({
        op: 'create_script',
        name,
        code,
        targetRef:
          typeof item.targetRef === 'string'
            ? item.targetRef
            : typeof item.target === 'string'
              ? item.target
              : undefined,
        securityMode: secMode,
      });
    } else if (kind === 'set_lighting') {
      ops.push({
        op: 'set_lighting',
        sunIntensity: typeof item.sunIntensity === 'number' ? item.sunIntensity : undefined,
        ambientIntensity: typeof item.ambientIntensity === 'number' ? item.ambientIntensity : undefined,
        fogEnabled: typeof item.fogEnabled === 'boolean' ? item.fogEnabled : undefined,
        fogNear: typeof item.fogNear === 'number' ? item.fogNear : undefined,
        fogFar: typeof item.fogFar === 'number' ? item.fogFar : undefined,
        timeOfDay: typeof item.timeOfDay === 'number' ? item.timeOfDay : undefined,
        dayCycleSpeed: typeof item.dayCycleSpeed === 'number' ? item.dayCycleSpeed : undefined,
        dayNightEnabled: typeof item.dayNightEnabled === 'boolean' ? item.dayNightEnabled : undefined,
        sunColor: typeof item.sunColor === 'string' ? item.sunColor : undefined,
        ambientColor: typeof item.ambientColor === 'string' ? item.ambientColor : undefined,
      });
    } else if (kind === 'configure_camera') {
      const rawMode = typeof item.mode === 'string' ? item.mode : undefined;
      if (rawMode && !VALID_CAMERA_MODES.has(rawMode as SmartCameraMode)) {
        errors.push(`Operación #${i + 1} (configure_camera): modo "${rawMode}" inválido.`);
        continue;
      }
      ops.push({
        op: 'configure_camera',
        targetRef:
          typeof item.targetRef === 'string'
            ? item.targetRef
            : typeof item.target === 'string'
              ? item.target
              : undefined,
        mode: rawMode as SmartCameraMode | undefined,
        distance: typeof item.distance === 'number' ? item.distance : undefined,
        fov: typeof item.fov === 'number' ? item.fov : undefined,
        collideWithWalls: typeof item.collideWithWalls === 'boolean' ? item.collideWithWalls : undefined,
        allowShoulderSwap: typeof item.allowShoulderSwap === 'boolean' ? item.allowShoulderSwap : undefined,
      });
    } else {
      errors.push(`Operación #${i + 1}: op "${kind}" no soportada.`);
    }
  }

  return { ops, errors };
}

function resolveTargetsStrict(
  ref: string,
  objects: GameObjectData[],
  selectedIds: string[],
  lastCreatedId: string | null
): { targets: GameObjectData[]; error?: string } {
  if (ref === '@selected' || ref === '@seleccionado') {
    const sel = objects.filter((o) => selectedIds.includes(o.id));
    if (sel.length === 0) {
      return { targets: [], error: 'No hay ningún objeto seleccionado para "@selected".' };
    }
    return { targets: sel };
  }
  if (ref === '@lastCreated' || ref === '@ultimo') {
    if (!lastCreatedId) {
      return { targets: [], error: 'No hay ningún objeto creado previamente en este plan para "@lastCreated".' };
    }
    const found = objects.find((o) => o.id === lastCreatedId);
    return found ? { targets: [found] } : { targets: [], error: 'El objeto "@lastCreated" ya no existe.' };
  }
  if (ref.startsWith('#')) {
    const tag = ref.slice(1).trim();
    const tagged = objects.filter((o) => (o.tags ?? []).includes(tag));
    if (tagged.length === 0) {
      return { targets: [], error: `Ningún objeto tiene la etiqueta "#${tag}".` };
    }
    return { targets: tagged };
  }
  const byId = objects.filter((o) => o.id === ref);
  if (byId.length === 1) return { targets: byId };

  const exactName = objects.filter((o) => o.name === ref);
  if (exactName.length === 1) return { targets: exactName };
  if (exactName.length > 1) {
    return {
      targets: [],
      error: `Referencia ambigua "${ref}": coincide con ${exactName.length} objetos (${exactName
        .map((o) => o.id)
        .join(', ')}). Usa el ID o renómbralos de forma única.`,
    };
  }

  const lower = ref.toLowerCase();
  const ciName = objects.filter((o) => o.name.toLowerCase() === lower);
  if (ciName.length === 1) return { targets: ciName };
  if (ciName.length > 1) {
    return {
      targets: [],
      error: `Referencia ambigua "${ref}": coincide con ${ciName.length} objetos (${ciName
        .map((o) => `${o.name}[${o.id}]`)
        .join(', ')}).`,
    };
  }

  return { targets: [], error: `No se encontró ningún objeto con ID o nombre "${ref}".` };
}

function resolveCameraTargets(
  targetRef: string | undefined,
  scene: SceneData,
  objects: GameObjectData[],
  selectedIds: string[],
  lastCreatedId: string | null
): { targets: GameObjectData[]; error?: string } {
  if (targetRef) {
    const res = resolveTargetsStrict(targetRef, objects, selectedIds, lastCreatedId);
    if (res.error) return res;
    const cams = res.targets.filter((o) => o.type === 'camera_3d' || Boolean(o.camera3d));
    if (cams.length === 0) {
      return { targets: [], error: `El objeto "${targetRef}" no es una cámara 3D.` };
    }
    return { targets: cams };
  }
  const activeCam =
    (scene.activeCameraId && objects.find((o) => o.id === scene.activeCameraId)) ||
    objects.find((o) => o.type === 'camera_3d' && o.camera3d?.isMainCamera) ||
    objects.find((o) => o.type === 'camera_3d');
  if (activeCam) return { targets: [activeCam] };
  if (scene.cameraConfig?.smartCamera) return { targets: [] };
  return { targets: [], error: 'No hay ninguna cámara 3D en la escena actual para configurar.' };
}

function makeUniqueObjectName(baseName: string, objects: GameObjectData[]): string {
  const existing = new Set(objects.map((o) => o.name.toLowerCase()));
  if (!existing.has(baseName.toLowerCase())) return baseName;
  let idx = 2;
  while (existing.has(`${baseName}_${idx}`.toLowerCase())) idx += 1;
  return `${baseName}_${idx}`;
}

function formatObjCoord(o: GameObjectData): string {
  if (o.transform3d) {
    return `(${o.transform3d.x.toFixed(1)}, ${o.transform3d.y.toFixed(1)}, ${o.transform3d.z.toFixed(1)}) S(${o.transform3d.sx.toFixed(1)}, ${o.transform3d.sy.toFixed(1)}, ${o.transform3d.sz.toFixed(1)})`;
  }
  return `(${Math.round(o.transform.x)}, ${Math.round(o.transform.y)}) R=${Math.round(o.transform.rotation)}° S(${o.transform.scaleX.toFixed(2)}, ${o.transform.scaleY.toFixed(2)})`;
}

function defaultSceneLighting(prev?: SceneLightingConfig): SceneLightingConfig {
  return {
    ambientColor: prev?.ambientColor ?? '#94a3b8',
    ambientIntensity: prev?.ambientIntensity ?? 0.7,
    smartBounce: prev?.smartBounce ?? true,
    bounceIntensity: prev?.bounceIntensity ?? 0.35,
    skyColor: prev?.skyColor ?? '#7dd3fc',
    groundColor: prev?.groundColor ?? '#1e293b',
    sunColor: prev?.sunColor ?? '#ffffff',
    sunIntensity: prev?.sunIntensity ?? 1.4,
    fogEnabled: prev?.fogEnabled ?? false,
    fogColor: prev?.fogColor ?? '#93c5fd',
    fogNear: prev?.fogNear ?? 35,
    fogFar: prev?.fogFar ?? 160,
    dayNightEnabled: prev?.dayNightEnabled ?? false,
    timeOfDay: prev?.timeOfDay ?? 13,
    dayCycleSpeed: prev?.dayCycleSpeed ?? 0,
    skyDomeAssetId: prev?.skyDomeAssetId ?? null,
    cloudsEnabled: prev?.cloudsEnabled ?? true,
    cloudDensity: prev?.cloudDensity,
  };
}

export function planCommandBarInput(
  project: NexusProject,
  activeSceneId: string,
  selectedIds: string[],
  rawInput: string,
  explicitMode?: CommandBarMode
): CommandPlan {
  const trimmed = rawInput.trim();
  const mode: CommandBarMode =
    explicitMode ?? (trimmed.startsWith('{') || trimmed.startsWith('[') ? 'json' : 'dsl');
  const scene = project.scenes.find((s) => s.id === activeSceneId) ?? project.scenes[0];

  if (!scene) {
    return {
      valid: false,
      mode,
      commandText: rawInput,
      summary: 'No hay escena activa.',
      errors: ['No se encontró una escena activa.'],
      warnings: [],
      requiresDestructiveConfirm: false,
      diffs: [],
      operations: [],
    };
  }

  const parsed =
    mode === 'json' ? parseJsonToOps(trimmed) : parseDslToOps(trimmed, scene.objects);
  const errors = [...parsed.errors];
  const warnings: string[] = [];
  const diffs: CommandDiffEntry[] = [];
  let requiresDestructiveConfirm = false;

  // Simular el plan sobre una copia ligera para generar Diff exacto y detectar ambigüedades antes de aplicar
  let simObjects: GameObjectData[] = structuredClone(scene.objects);
  let simVars: ProjectVariable[] = structuredClone(project.variables ?? []);
  let simStreaming = structuredClone(scene.worldStreaming);
  let simLighting = defaultSceneLighting(scene.lighting);
  let simMechanics: GameMechanic[] = structuredClone(scene.mechanics ?? []);
  let simScripts: NexusScriptAsset[] = structuredClone(project.scripts ?? []);
  let lastCreatedId: string | null = null;

  for (const op of parsed.ops) {
    if (op.op === 'create_object') {
      const created = createGameObject(op.objectType, simObjects, {
        name: op.name,
        x: op.x,
        y: op.y,
        x3d: op.x,
        y3d: op.y,
        z3d: op.z,
        shape3d: op.shape3d,
        color: op.color,
      });
      if (created.transform3d) {
        if (op.sx !== undefined) created.transform3d.sx = op.sx;
        if (op.sy !== undefined) created.transform3d.sy = op.sy;
        if (op.sz !== undefined) created.transform3d.sz = op.sz;
      } else {
        if (op.sx !== undefined) created.transform.scaleX = op.sx;
        if (op.sy !== undefined) created.transform.scaleY = op.sy;
      }
      if (op.tags) created.tags = op.tags;
      simObjects.push(created);
      lastCreatedId = created.id;
      diffs.push({
        kind: 'add',
        scope: 'object',
        targetId: created.id,
        targetLabel: `${created.name} (${created.type})`,
        after: formatObjCoord(created),
      });
    } else if (op.op === 'update_transform') {
      const res = resolveTargetsStrict(op.targetRef, simObjects, selectedIds, lastCreatedId);
      if (res.error) {
        errors.push(res.error);
        continue;
      }
      for (const tgt of res.targets) {
        const before = formatObjCoord(tgt);
        if (tgt.transform3d) {
          if (op.x !== undefined) tgt.transform3d.x = op.x;
          if (op.y !== undefined) tgt.transform3d.y = op.y;
          if (op.z !== undefined) tgt.transform3d.z = op.z;
          if (op.dx !== undefined) tgt.transform3d.x += op.dx;
          if (op.dy !== undefined) tgt.transform3d.y += op.dy;
          if (op.dz !== undefined) tgt.transform3d.z += op.dz;
          if (op.rx !== undefined) tgt.transform3d.rx = op.rx;
          if (op.ry !== undefined) tgt.transform3d.ry = op.ry;
          if (op.rz !== undefined) tgt.transform3d.rz = op.rz;
          if (op.rotation !== undefined) tgt.transform3d.ry = op.rotation;
          if (op.sx !== undefined) tgt.transform3d.sx = Math.max(0.05, op.sx);
          if (op.sy !== undefined) tgt.transform3d.sy = Math.max(0.05, op.sy);
          if (op.sz !== undefined) tgt.transform3d.sz = Math.max(0.05, op.sz);
        } else {
          if (op.x !== undefined) tgt.transform.x = op.x;
          if (op.y !== undefined) tgt.transform.y = op.y;
          if (op.dx !== undefined) tgt.transform.x += op.dx;
          if (op.dy !== undefined) tgt.transform.y += op.dy;
          if (op.rotation !== undefined) tgt.transform.rotation = op.rotation;
          else if (op.rz !== undefined) tgt.transform.rotation = op.rz;
          if (op.sx !== undefined) tgt.transform.scaleX = op.sx;
          if (op.sy !== undefined) tgt.transform.scaleY = op.sy;
        }
        diffs.push({
          kind: 'modify',
          scope: 'object',
          targetId: tgt.id,
          targetLabel: tgt.name,
          before,
          after: formatObjCoord(tgt),
        });
      }
    } else if (op.op === 'add_component') {
      const res = resolveTargetsStrict(op.targetRef, simObjects, selectedIds, lastCreatedId);
      if (res.error) {
        errors.push(res.error);
        continue;
      }
      const catalogEntry = getBehaviorEntry(op.componentType);
      if (!catalogEntry) {
        warnings.push(
          `Componente "${op.componentType}" no figura en el catálogo estándar; se adjuntará igualmente.`
        );
      }
      for (const tgt of res.targets) {
        tgt.components.push({
          id: createId('cmp'),
          type: op.componentType,
          enabled: true,
          config: { ...(catalogEntry?.defaultConfig ?? {}), ...(op.config ?? {}) },
        });
        diffs.push({
          kind: 'modify',
          scope: 'object',
          targetId: tgt.id,
          targetLabel: tgt.name,
          before: `${tgt.components.length - 1} componentes`,
          after: `+ componente ${op.componentType}`,
        });
      }
    } else if (op.op === 'rename_object') {
      const res = resolveTargetsStrict(op.targetRef, simObjects, selectedIds, lastCreatedId);
      if (res.error) {
        errors.push(res.error);
        continue;
      }
      if (res.targets.length > 1) {
        errors.push(`No se puede renombrar múltiples objetos con un mismo comando (${res.targets.length} objetivos).`);
        continue;
      }
      const tgt = res.targets[0];
      const prevName = tgt.name;
      tgt.name = op.newName;
      diffs.push({
        kind: 'modify',
        scope: 'object',
        targetId: tgt.id,
        targetLabel: prevName,
        before: prevName,
        after: op.newName,
      });
    } else if (op.op === 'duplicate_object') {
      const res = resolveTargetsStrict(op.targetRef, simObjects, selectedIds, lastCreatedId);
      if (res.error) {
        errors.push(res.error);
        continue;
      }
      for (let i = 0; i < res.targets.length; i++) {
        const src = res.targets[i];
        const clone = structuredClone(src);
        clone.id = createId('obj');
        clone.name =
          op.newName && res.targets.length === 1
            ? op.newName
            : makeUniqueObjectName(`${src.name}_Copia`, simObjects);
        const hasExplicitPos = op.x !== undefined || op.y !== undefined || op.z !== undefined;
        const hasDelta = op.dx !== undefined || op.dy !== undefined || op.dz !== undefined;
        if (clone.transform3d) {
          if (op.x !== undefined) clone.transform3d.x = op.x;
          if (op.y !== undefined) clone.transform3d.y = op.y;
          if (op.z !== undefined) clone.transform3d.z = op.z;
          clone.transform3d.x += op.dx ?? (hasExplicitPos || hasDelta ? 0 : 2 * (i + 1));
          clone.transform3d.y += op.dy ?? 0;
          clone.transform3d.z += op.dz ?? 0;
        } else {
          if (op.x !== undefined) clone.transform.x = op.x;
          if (op.y !== undefined) clone.transform.y = op.y;
          clone.transform.x += op.dx ?? (hasExplicitPos || hasDelta ? 0 : 32 * (i + 1));
          clone.transform.y += op.dy ?? 0;
        }
        simObjects.push(clone);
        lastCreatedId = clone.id;
        diffs.push({
          kind: 'add',
          scope: 'object',
          targetId: clone.id,
          targetLabel: `${clone.name} (copia de ${src.name})`,
          after: formatObjCoord(clone),
        });
      }
    } else if (op.op === 'tag_object') {
      const res = resolveTargetsStrict(op.targetRef, simObjects, selectedIds, lastCreatedId);
      if (res.error) {
        errors.push(res.error);
        continue;
      }
      for (const tgt of res.targets) {
        const before = (tgt.tags ?? []).join(', ') || '(sin etiquetas)';
        const set = new Set(tgt.tags ?? []);
        for (const t of op.addTags ?? []) set.add(t);
        for (const t of op.removeTags ?? []) set.delete(t);
        tgt.tags = Array.from(set);
        diffs.push({
          kind: 'modify',
          scope: 'object',
          targetId: tgt.id,
          targetLabel: tgt.name,
          before,
          after: tgt.tags.join(', ') || '(sin etiquetas)',
        });
      }
    } else if (op.op === 'remove_object') {
      const res = resolveTargetsStrict(op.targetRef, simObjects, selectedIds, lastCreatedId);
      if (res.error) {
        errors.push(res.error);
        continue;
      }
      requiresDestructiveConfirm = true;
      const removeSet = new Set(res.targets.map((t) => t.id));
      for (const tgt of res.targets) {
        diffs.push({
          kind: 'delete',
          scope: 'object',
          targetId: tgt.id,
          targetLabel: `${tgt.name} (${tgt.type})`,
          before: formatObjCoord(tgt),
          after: 'Eliminado',
        });
      }
      simObjects = simObjects.filter((o) => !removeSet.has(o.id));
    } else if (op.op === 'set_variable') {
      const existing = simVars.find((v) => v.name === op.name);
      if (existing) {
        const prevVal = String(existing.initialValue);
        existing.initialValue = op.value;
        diffs.push({
          kind: 'modify',
          scope: 'variable',
          targetId: existing.id,
          targetLabel: op.name,
          before: prevVal,
          after: String(op.value),
        });
      } else {
        const nextVar: ProjectVariable = {
          id: createId('var'),
          name: op.name,
          scope: 'global',
          type: typeof op.value === 'boolean' ? 'boolean' : typeof op.value === 'number' ? 'number' : 'string',
          initialValue: op.value,
        };
        simVars.push(nextVar);
        diffs.push({
          kind: 'add',
          scope: 'variable',
          targetId: nextVar.id,
          targetLabel: op.name,
          after: String(op.value),
        });
      }
    } else if (op.op === 'configure_streaming') {
      const before = simStreaming?.enabled ? `Activo (${simStreaming.chunkSize}m)` : 'Inactivo';
      simStreaming = {
        enabled: op.enabled ?? simStreaming?.enabled ?? true,
        chunkSize: op.chunkSize ?? simStreaming?.chunkSize ?? 64,
        loadRadius: op.loadRadius ?? simStreaming?.loadRadius ?? 140,
        unloadRadius: op.unloadRadius ?? simStreaming?.unloadRadius ?? 210,
        farProxyRadius: op.farProxyRadius ?? simStreaming?.farProxyRadius ?? 340,
        maxLoadsPerFrame: simStreaming?.maxLoadsPerFrame ?? 2,
        frustumPreloadWeight: simStreaming?.frustumPreloadWeight ?? 1.35,
        velocityPreloadSec: simStreaming?.velocityPreloadSec ?? 1.6,
        enableHlod: simStreaming?.enableHlod ?? true,
        enableOcclusionCulling: simStreaming?.enableOcclusionCulling ?? true,
        budgetProfile: op.budgetProfile ?? simStreaming?.budgetProfile ?? 'pc',
      };
      diffs.push({
        kind: 'modify',
        scope: 'scene',
        targetId: scene.id,
        targetLabel: `Streaming (${scene.name})`,
        before,
        after: `${simStreaming.enabled ? 'Activo' : 'Inactivo'} (${simStreaming.chunkSize}m, ${simStreaming.budgetProfile})`,
      });
    } else if (op.op === 'add_mechanic') {
      let sourceObjectId: string | undefined;
      if (op.sourceRef) {
        const res = resolveTargetsStrict(op.sourceRef, simObjects, selectedIds, lastCreatedId);
        if (res.error) {
          errors.push(res.error);
          continue;
        }
        sourceObjectId = res.targets[0].id;
      }
      const mech: GameMechanic = {
        id: createId('mech'),
        name: op.name,
        enabled: true,
        priority: 10,
        trigger: {
          event: op.triggerEvent,
          ...(sourceObjectId ? { sourceObjectId } : {}),
          ...(op.tag ? { tag: op.tag } : {}),
          ...(op.key ? { key: op.key } : {}),
          ...(op.intervalSec !== undefined ? { intervalSec: op.intervalSec } : {}),
          ...(op.variable ? { variable: op.variable } : {}),
          ...(op.eventName ? { eventName: op.eventName } : {}),
        },
        conditions: [],
        actions: [
          {
            id: createId('act'),
            type: op.actionType,
            parameters: { ...(op.actionParams ?? {}) },
          },
        ],
      };
      simMechanics.push(mech);
      diffs.push({
        kind: 'add',
        scope: 'mechanic',
        targetId: mech.id,
        targetLabel: `Mecánica: ${mech.name}`,
        after: `${mech.trigger.event} → ${op.actionType}`,
      });
    } else if (op.op === 'create_script') {
      if (!op.code.trim()) {
        errors.push(`El script "${op.name}" no puede tener código vacío.`);
        continue;
      }
      const effectiveMode =
        op.securityMode ?? project.security?.scriptMode ?? 'safe_sandbox';
      const scan = scanScriptSecurity(op.code);
      if (effectiveMode === 'safe_sandbox' && !scan.safe) {
        errors.push(
          `Script "${op.name}" bloqueado por sandbox seguro (${scan.blockedIdentifiers.join(', ')}). Usa modo=trusted_js solo si confías en el código.`
        );
        continue;
      }
      if (effectiveMode === 'trusted_js' && !scan.safe) {
        warnings.push(
          `Script "${op.name}" usa modo trusted_js con APIs sensibles: ${scan.blockedIdentifiers.join(', ')}.`
        );
      }

      const rawTarget = op.targetRef?.trim();
      const isSceneTarget =
        !rawTarget || rawTarget === '__scene__' || rawTarget.toLowerCase() === 'escena';
      let boundLabel = 'Escena';
      if (!isSceneTarget && rawTarget) {
        const res = resolveTargetsStrict(rawTarget, simObjects, selectedIds, lastCreatedId);
        if (res.error) {
          errors.push(res.error);
          continue;
        }
        boundLabel = res.targets.map((t) => t.name).join(', ');
      }

      const nextScript: NexusScriptAsset = {
        id: createId('scr'),
        name: op.name,
        kind: 'script',
        code: op.code,
        targetScope: isSceneTarget ? 'scene' : 'object',
        securityMode: effectiveMode,
        updatedAt: Date.now(),
      };
      simScripts.push(nextScript);
      diffs.push({
        kind: 'add',
        scope: 'script',
        targetId: nextScript.id,
        targetLabel: `Script: ${nextScript.name}`,
        after: `Adjunto a ${boundLabel} (${effectiveMode})`,
      });
    } else if (op.op === 'set_lighting') {
      const before = `Sol ${simLighting.sunIntensity.toFixed(2)} · Amb ${simLighting.ambientIntensity.toFixed(2)} · Hora ${(simLighting.timeOfDay ?? 12).toFixed(1)}h`;
      simLighting = {
        ...simLighting,
        ...(op.sunIntensity !== undefined ? { sunIntensity: op.sunIntensity } : {}),
        ...(op.ambientIntensity !== undefined ? { ambientIntensity: op.ambientIntensity } : {}),
        ...(op.fogEnabled !== undefined ? { fogEnabled: op.fogEnabled } : {}),
        ...(op.fogNear !== undefined ? { fogNear: op.fogNear } : {}),
        ...(op.fogFar !== undefined ? { fogFar: op.fogFar } : {}),
        ...(op.timeOfDay !== undefined ? { timeOfDay: op.timeOfDay } : {}),
        ...(op.dayCycleSpeed !== undefined ? { dayCycleSpeed: op.dayCycleSpeed } : {}),
        ...(op.dayNightEnabled !== undefined ? { dayNightEnabled: op.dayNightEnabled } : {}),
        ...(op.sunColor !== undefined ? { sunColor: op.sunColor } : {}),
        ...(op.ambientColor !== undefined ? { ambientColor: op.ambientColor } : {}),
      };
      const after = `Sol ${simLighting.sunIntensity.toFixed(2)} · Amb ${simLighting.ambientIntensity.toFixed(2)} · Hora ${(simLighting.timeOfDay ?? 12).toFixed(1)}h${simLighting.dayNightEnabled ? ' (Ciclo ON)' : ''}`;
      diffs.push({
        kind: 'modify',
        scope: 'scene',
        targetId: scene.id,
        targetLabel: `Iluminación (${scene.name})`,
        before,
        after,
      });
    } else if (op.op === 'configure_camera') {
      const camRes = resolveCameraTargets(
        op.targetRef,
        scene,
        simObjects,
        selectedIds,
        lastCreatedId
      );
      if (camRes.error) {
        errors.push(camRes.error);
        continue;
      }
      if (camRes.targets.length > 0) {
        for (const cam of camRes.targets) {
          const cfg = cam.camera3d;
          const before = cfg
            ? `${cfg.mode} · dist=${cfg.distance} · fov=${cfg.fov} · col=${cfg.collideWithWalls}`
            : 'Sin config';
          if (cfg) {
            if (op.mode !== undefined) cfg.mode = op.mode;
            if (op.distance !== undefined) cfg.distance = op.distance;
            if (op.fov !== undefined) cfg.fov = op.fov;
            if (op.collideWithWalls !== undefined) cfg.collideWithWalls = op.collideWithWalls;
            if (op.allowShoulderSwap !== undefined) cfg.allowShoulderSwap = op.allowShoulderSwap;
          }
          const after = cfg
            ? `${cfg.mode} · dist=${cfg.distance} · fov=${cfg.fov} · col=${cfg.collideWithWalls}`
            : 'Actualizada';
          diffs.push({
            kind: 'modify',
            scope: 'object',
            targetId: cam.id,
            targetLabel: cam.name,
            before,
            after,
          });
        }
      } else if (scene.cameraConfig?.smartCamera) {
        const sc = scene.cameraConfig.smartCamera;
        const before = `${sc.mode} · dist=${sc.distance} · fov=${sc.fov}`;
        const after = `${op.mode ?? sc.mode} · dist=${op.distance ?? sc.distance} · fov=${op.fov ?? sc.fov}`;
        diffs.push({
          kind: 'modify',
          scope: 'scene',
          targetId: scene.id,
          targetLabel: `Cámara Escena (${scene.name})`,
          before,
          after,
        });
      }
    }
  }

  const valid = errors.length === 0 && parsed.ops.length > 0;
  const summary = valid
    ? `${parsed.ops.length} operación(es) · ${diffs.length} cambio(s)${requiresDestructiveConfirm ? ' (requiere confirmación destructiva)' : ''}`
    : errors[0] ?? 'Plan inválido';

  return {
    valid,
    mode,
    commandText: rawInput,
    summary,
    errors,
    warnings,
    requiresDestructiveConfirm,
    diffs,
    operations: parsed.ops,
  };
}

export function applyCommandPlan(
  project: NexusProject,
  activeSceneId: string,
  selectedIds: string[],
  plan: CommandPlan,
  confirmDestructive = false
): AppliedCommandResult {
  if (!plan.valid) {
    throw new Error(plan.errors[0] || 'No se puede aplicar un plan con errores.');
  }
  if (plan.requiresDestructiveConfirm && !confirmDestructive) {
    throw new Error('Este plan incluye operaciones destructivas y requiere confirmación explícita.');
  }

  const nextProject: NexusProject = structuredClone(project);
  const sceneIdx = nextProject.scenes.findIndex((s) => s.id === activeSceneId);
  const scene: SceneData =
    sceneIdx >= 0 ? nextProject.scenes[sceneIdx] : nextProject.scenes[0];

  const createdIds: string[] = [];
  const affectedIds = new Set<string>();
  let lastCreatedId: string | null = null;

  for (const op of plan.operations) {
    if (op.op === 'create_object') {
      const created = createGameObject(op.objectType, scene.objects, {
        name: op.name,
        x: op.x,
        y: op.y,
        x3d: op.x,
        y3d: op.y,
        z3d: op.z,
        shape3d: op.shape3d,
        color: op.color,
      });
      if (created.transform3d) {
        if (op.sx !== undefined) created.transform3d.sx = op.sx;
        if (op.sy !== undefined) created.transform3d.sy = op.sy;
        if (op.sz !== undefined) created.transform3d.sz = op.sz;
      } else {
        if (op.sx !== undefined) created.transform.scaleX = op.sx;
        if (op.sy !== undefined) created.transform.scaleY = op.sy;
      }
      if (op.tags) created.tags = op.tags;
      scene.objects.push(created);
      createdIds.push(created.id);
      affectedIds.add(created.id);
      lastCreatedId = created.id;
    } else if (op.op === 'update_transform') {
      const res = resolveTargetsStrict(op.targetRef, scene.objects, selectedIds, lastCreatedId);
      if (res.error) throw new Error(res.error);
      for (const tgt of res.targets) {
        affectedIds.add(tgt.id);
        if (tgt.transform3d) {
          if (op.x !== undefined) tgt.transform3d.x = op.x;
          if (op.y !== undefined) tgt.transform3d.y = op.y;
          if (op.z !== undefined) tgt.transform3d.z = op.z;
          if (op.dx !== undefined) tgt.transform3d.x += op.dx;
          if (op.dy !== undefined) tgt.transform3d.y += op.dy;
          if (op.dz !== undefined) tgt.transform3d.z += op.dz;
          if (op.rx !== undefined) tgt.transform3d.rx = op.rx;
          if (op.ry !== undefined) tgt.transform3d.ry = op.ry;
          if (op.rz !== undefined) tgt.transform3d.rz = op.rz;
          if (op.rotation !== undefined) tgt.transform3d.ry = op.rotation;
          if (op.sx !== undefined) tgt.transform3d.sx = Math.max(0.05, op.sx);
          if (op.sy !== undefined) tgt.transform3d.sy = Math.max(0.05, op.sy);
          if (op.sz !== undefined) tgt.transform3d.sz = Math.max(0.05, op.sz);
        } else {
          if (op.x !== undefined) tgt.transform.x = op.x;
          if (op.y !== undefined) tgt.transform.y = op.y;
          if (op.dx !== undefined) tgt.transform.x += op.dx;
          if (op.dy !== undefined) tgt.transform.y += op.dy;
          if (op.rotation !== undefined) tgt.transform.rotation = op.rotation;
          else if (op.rz !== undefined) tgt.transform.rotation = op.rz;
          if (op.sx !== undefined) tgt.transform.scaleX = op.sx;
          if (op.sy !== undefined) tgt.transform.scaleY = op.sy;
        }
      }
    } else if (op.op === 'add_component') {
      const res = resolveTargetsStrict(op.targetRef, scene.objects, selectedIds, lastCreatedId);
      if (res.error) throw new Error(res.error);
      const catalogEntry = getBehaviorEntry(op.componentType);
      for (const tgt of res.targets) {
        affectedIds.add(tgt.id);
        tgt.components.push({
          id: createId('cmp'),
          type: op.componentType,
          enabled: true,
          config: { ...(catalogEntry?.defaultConfig ?? {}), ...(op.config ?? {}) },
        });
      }
    } else if (op.op === 'rename_object') {
      const res = resolveTargetsStrict(op.targetRef, scene.objects, selectedIds, lastCreatedId);
      if (res.error) throw new Error(res.error);
      res.targets[0].name = op.newName;
      affectedIds.add(res.targets[0].id);
    } else if (op.op === 'duplicate_object') {
      const res = resolveTargetsStrict(op.targetRef, scene.objects, selectedIds, lastCreatedId);
      if (res.error) throw new Error(res.error);
      for (let i = 0; i < res.targets.length; i++) {
        const src = res.targets[i];
        const clone = structuredClone(src);
        clone.id = createId('obj');
        clone.name =
          op.newName && res.targets.length === 1
            ? op.newName
            : makeUniqueObjectName(`${src.name}_Copia`, scene.objects);
        const hasExplicitPos = op.x !== undefined || op.y !== undefined || op.z !== undefined;
        const hasDelta = op.dx !== undefined || op.dy !== undefined || op.dz !== undefined;
        if (clone.transform3d) {
          if (op.x !== undefined) clone.transform3d.x = op.x;
          if (op.y !== undefined) clone.transform3d.y = op.y;
          if (op.z !== undefined) clone.transform3d.z = op.z;
          clone.transform3d.x += op.dx ?? (hasExplicitPos || hasDelta ? 0 : 2 * (i + 1));
          clone.transform3d.y += op.dy ?? 0;
          clone.transform3d.z += op.dz ?? 0;
        } else {
          if (op.x !== undefined) clone.transform.x = op.x;
          if (op.y !== undefined) clone.transform.y = op.y;
          clone.transform.x += op.dx ?? (hasExplicitPos || hasDelta ? 0 : 32 * (i + 1));
          clone.transform.y += op.dy ?? 0;
        }
        scene.objects.push(clone);
        createdIds.push(clone.id);
        affectedIds.add(clone.id);
        lastCreatedId = clone.id;
      }
    } else if (op.op === 'tag_object') {
      const res = resolveTargetsStrict(op.targetRef, scene.objects, selectedIds, lastCreatedId);
      if (res.error) throw new Error(res.error);
      for (const tgt of res.targets) {
        affectedIds.add(tgt.id);
        const set = new Set(tgt.tags ?? []);
        for (const t of op.addTags ?? []) set.add(t);
        for (const t of op.removeTags ?? []) set.delete(t);
        tgt.tags = Array.from(set);
      }
    } else if (op.op === 'remove_object') {
      const res = resolveTargetsStrict(op.targetRef, scene.objects, selectedIds, lastCreatedId);
      if (res.error) throw new Error(res.error);
      const removeSet = new Set(res.targets.map((t) => t.id));
      scene.objects = scene.objects.filter(
        (o) => !removeSet.has(o.id) && !(o.parentId && removeSet.has(o.parentId))
      );
    } else if (op.op === 'set_variable') {
      nextProject.variables = nextProject.variables ?? [];
      const existing = nextProject.variables.find((v) => v.name === op.name);
      if (existing) {
        existing.initialValue = op.value;
        affectedIds.add(existing.id);
      } else {
        const nextVarId = createId('var');
        nextProject.variables.push({
          id: nextVarId,
          name: op.name,
          scope: 'global',
          type: typeof op.value === 'boolean' ? 'boolean' : typeof op.value === 'number' ? 'number' : 'string',
          initialValue: op.value,
        });
        affectedIds.add(nextVarId);
      }
    } else if (op.op === 'configure_streaming') {
      scene.worldStreaming = {
        enabled: op.enabled ?? scene.worldStreaming?.enabled ?? true,
        chunkSize: op.chunkSize ?? scene.worldStreaming?.chunkSize ?? 64,
        loadRadius: op.loadRadius ?? scene.worldStreaming?.loadRadius ?? 140,
        unloadRadius: op.unloadRadius ?? scene.worldStreaming?.unloadRadius ?? 210,
        farProxyRadius: op.farProxyRadius ?? scene.worldStreaming?.farProxyRadius ?? 340,
        maxLoadsPerFrame: scene.worldStreaming?.maxLoadsPerFrame ?? 2,
        frustumPreloadWeight: scene.worldStreaming?.frustumPreloadWeight ?? 1.35,
        velocityPreloadSec: scene.worldStreaming?.velocityPreloadSec ?? 1.6,
        enableHlod: scene.worldStreaming?.enableHlod ?? true,
        enableOcclusionCulling: scene.worldStreaming?.enableOcclusionCulling ?? true,
        budgetProfile: op.budgetProfile ?? scene.worldStreaming?.budgetProfile ?? 'pc',
        customBudgets: scene.worldStreaming?.customBudgets,
      };
      affectedIds.add(scene.id);
    } else if (op.op === 'add_mechanic') {
      let sourceObjectId: string | undefined;
      if (op.sourceRef) {
        const res = resolveTargetsStrict(op.sourceRef, scene.objects, selectedIds, lastCreatedId);
        if (res.error) throw new Error(res.error);
        sourceObjectId = res.targets[0].id;
      }
      const mech: GameMechanic = {
        id: createId('mech'),
        name: op.name,
        enabled: true,
        priority: 10,
        trigger: {
          event: op.triggerEvent,
          ...(sourceObjectId ? { sourceObjectId } : {}),
          ...(op.tag ? { tag: op.tag } : {}),
          ...(op.key ? { key: op.key } : {}),
          ...(op.intervalSec !== undefined ? { intervalSec: op.intervalSec } : {}),
          ...(op.variable ? { variable: op.variable } : {}),
          ...(op.eventName ? { eventName: op.eventName } : {}),
        },
        conditions: [],
        actions: [
          {
            id: createId('act'),
            type: op.actionType,
            parameters: { ...(op.actionParams ?? {}) },
          },
        ],
      };
      scene.mechanics = [...(scene.mechanics ?? []), mech];
      affectedIds.add(mech.id);
    } else if (op.op === 'create_script') {
      const effectiveMode =
        op.securityMode ?? nextProject.security?.scriptMode ?? 'safe_sandbox';
      const scan = scanScriptSecurity(op.code);
      if (effectiveMode === 'safe_sandbox' && !scan.safe) {
        throw new Error(
          `Script "${op.name}" bloqueado por sandbox seguro (${scan.blockedIdentifiers.join(', ')}).`
        );
      }
      const rawTarget = op.targetRef?.trim();
      const isSceneTarget =
        !rawTarget || rawTarget === '__scene__' || rawTarget.toLowerCase() === 'escena';

      const scriptAsset: NexusScriptAsset = {
        id: createId('scr'),
        name: op.name,
        kind: 'script',
        code: op.code,
        targetScope: isSceneTarget ? 'scene' : 'object',
        securityMode: effectiveMode,
        updatedAt: Date.now(),
      };
      nextProject.scripts = [...(nextProject.scripts ?? []), scriptAsset];
      affectedIds.add(scriptAsset.id);

      if (isSceneTarget) {
        scene.scriptIds = [...(scene.scriptIds ?? []), scriptAsset.id];
      } else if (rawTarget) {
        const res = resolveTargetsStrict(rawTarget, scene.objects, selectedIds, lastCreatedId);
        if (res.error) throw new Error(res.error);
        const schema = extractScriptParamsSchema(scriptAsset);
        const defaultParams: Record<string, unknown> = {};
        for (const field of schema) defaultParams[field.key] = field.defaultValue;
        for (const tgt of res.targets) {
          affectedIds.add(tgt.id);
          tgt.scriptBindings = [
            ...(tgt.scriptBindings ?? []),
            {
              id: createId('sb'),
              scriptId: scriptAsset.id,
              enabled: true,
              params: defaultParams,
            },
          ];
        }
      }
    } else if (op.op === 'set_lighting') {
      const base = defaultSceneLighting(scene.lighting);
      scene.lighting = {
        ...base,
        ...(op.sunIntensity !== undefined ? { sunIntensity: op.sunIntensity } : {}),
        ...(op.ambientIntensity !== undefined ? { ambientIntensity: op.ambientIntensity } : {}),
        ...(op.fogEnabled !== undefined ? { fogEnabled: op.fogEnabled } : {}),
        ...(op.fogNear !== undefined ? { fogNear: op.fogNear } : {}),
        ...(op.fogFar !== undefined ? { fogFar: op.fogFar } : {}),
        ...(op.timeOfDay !== undefined ? { timeOfDay: op.timeOfDay } : {}),
        ...(op.dayCycleSpeed !== undefined ? { dayCycleSpeed: op.dayCycleSpeed } : {}),
        ...(op.dayNightEnabled !== undefined ? { dayNightEnabled: op.dayNightEnabled } : {}),
        ...(op.sunColor !== undefined ? { sunColor: op.sunColor } : {}),
        ...(op.ambientColor !== undefined ? { ambientColor: op.ambientColor } : {}),
      };
      affectedIds.add(scene.id);
    } else if (op.op === 'configure_camera') {
      const camRes = resolveCameraTargets(
        op.targetRef,
        scene,
        scene.objects,
        selectedIds,
        lastCreatedId
      );
      if (camRes.error) throw new Error(camRes.error);
      if (camRes.targets.length > 0) {
        for (const cam of camRes.targets) {
          affectedIds.add(cam.id);
          if (cam.camera3d) {
            if (op.mode !== undefined) cam.camera3d.mode = op.mode;
            if (op.distance !== undefined) cam.camera3d.distance = op.distance;
            if (op.fov !== undefined) cam.camera3d.fov = op.fov;
            if (op.collideWithWalls !== undefined) cam.camera3d.collideWithWalls = op.collideWithWalls;
            if (op.allowShoulderSwap !== undefined) cam.camera3d.allowShoulderSwap = op.allowShoulderSwap;
          }
        }
      } else if (scene.cameraConfig?.smartCamera) {
        const sc = scene.cameraConfig.smartCamera;
        if (op.mode !== undefined) sc.mode = op.mode;
        if (op.distance !== undefined) sc.distance = op.distance;
        if (op.fov !== undefined) sc.fov = op.fov;
        if (op.collideWithWalls !== undefined) sc.collideWithWalls = op.collideWithWalls;
        if (op.allowShoulderSwap !== undefined) sc.allowShoulderSwap = op.allowShoulderSwap;
        affectedIds.add(scene.id);
      }
    }
  }

  const historyEntry: CommandBarHistoryEntry = {
    id: createId('cmd'),
    timestamp: Date.now(),
    mode: plan.mode,
    summary: plan.summary,
    commandText: plan.commandText,
    affectedCount: affectedIds.size,
    favorite: false,
  };
  nextProject.commandHistory = [historyEntry, ...(nextProject.commandHistory ?? [])].slice(0, 40);

  return {
    nextProject,
    createdIds,
    affectedIds: Array.from(affectedIds),
    historyEntry,
  };
}
