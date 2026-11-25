/**
 * Motor de Scripting JavaScript real y aislado para NEXUS GAME ENGINE.
 * - Compila scripts de usuario (`NexusScriptAsset`) mediante fábricas seguras `new Function(...)` (sin eval).
 * - Extrae automáticamente metadatos de parámetros (`params`) declarados en el script para editarlos en el Inspector.
 * - Expone el puente `nexus` (búsqueda de objetos, variables, audio, cámara, escenas, partículas, eventos, spawn).
 * - Provee la envoltura `self` para manipular tanto objetos 2D como 3D y comunicar scripts entre sí.
 */

import type { GameObjectData } from '../core/types';
import type { NexusScriptAsset } from '../../project/models/project';

export interface ScriptParamSchema {
  key: string;
  name: string;
  type: 'number' | 'boolean' | 'string';
  defaultValue: number | boolean | string;
}

export interface WidgetBridgeCallbacks {
  onSetVariable?: (name: string, value: string | number | boolean) => void;
  onAddVariable?: (name: string, delta: number) => void;
  onGetVariable?: (name: string) => unknown;
  onPlayAudio?: (idOrPreset: string, channel?: 'sfx' | 'music' | 'ui') => void;
  onAudioBusVolume?: (bus: 'master' | 'music' | 'sfx' | 'ui', vol: number) => void;
  onLoadScene?: (sceneNameOrId: string) => void;
  onRestartScene?: () => void;
  onNextLevel?: () => void;
  onPauseToggle?: () => void;
  onEmitEvent?: (eventName: string, payload?: unknown) => void;
  onToggleInterface?: (targetNameOrId: string, open?: boolean) => void;
}

export interface NexusScriptHooks {
  params?: Record<string, number | boolean | string>;
  onStart?: (self: NexusObjectHandle, nexus: NexusScriptAPI) => void;
  onUpdate?: (self: NexusObjectHandle, dt: number, nexus: NexusScriptAPI) => void;
  onCollisionEnter?: (self: NexusObjectHandle, other: NexusObjectHandle, nexus: NexusScriptAPI) => void;
  onClick?: (self: NexusObjectHandle, nexus: NexusScriptAPI) => void;
  onDestroy?: (self: NexusObjectHandle, nexus: NexusScriptAPI) => void;
  [customMethod: string]: unknown;
}

export interface NexusObjectHandle {
  readonly id: string;
  readonly name: string;
  readonly type: string;
  readonly tags: string[];
  x: number;
  y: number;
  z: number;
  rx: number;
  ry: number;
  rz: number;
  rotation: number;
  vx: number;
  vy: number;
  vz: number;
  scaleX: number;
  scaleY: number;
  scaleZ: number;
  opacity: number;
  visible: boolean;
  readonly isGrounded: boolean;
  readonly speed: number;
  data: Record<string, unknown>;
  params: Record<string, unknown>;
  hasTag(tag: string): boolean;
  addTag(tag: string): void;
  removeTag(tag: string): void;
  moveTowards(target: { x: number; y: number; z?: number }, speed: number, dt: number): void;
  moveTowards(x: number, y: number, maxStepOrSpeed: number, dt?: number): void;
  moveTowards(x: number, y: number, z: number, speed: number, dt: number): void;
  applyImpulse(ix: number, iy: number, iz?: number): void;
  setVelocity(vx: number, vy: number, vz?: number): void;
  playAnim(clipName: string): void;
  setAnimState(stateName: string): void;
  playState(stateName: string): void;
  call(methodName: string, ...args: unknown[]): unknown;
  destroy(): void;
}

export interface NexusScriptAPI {
  dt: number;
  time: number;
  findByName(name: string): NexusObjectHandle | null;
  findById(id: string): NexusObjectHandle | null;
  findByTag(tag: string): NexusObjectHandle[];
  getAll(): NexusObjectHandle[];
  spawnPrefab(nameOrId: string, x?: number, y?: number, z?: number): NexusObjectHandle | null;
  destroyById(id: string): void;
  emitEvent(eventName: string, payload?: unknown): void;
  log(message: string): void;
  vars: {
    get(name: string): unknown;
    set(name: string, value: number | boolean | string): void;
    add(name: string, delta: number): number;
  };
  audio: {
    play(assetIdOrPreset: string, volume?: number): void;
    playSfx(assetIdOrPreset: string, volume?: number): void;
    playMusic(assetId: string, volume?: number): void;
    stopMusic(): void;
    setBusVolume(bus: 'master' | 'music' | 'sfx' | 'ui', volume: number): void;
    setBusMuted(bus: 'master' | 'music' | 'sfx' | 'ui', muted: boolean): void;
  };
  particles: {
    burst(
      x: number,
      y: number,
      presetOrColorOrZ?: string | number,
      countOrPreset?: number | string,
      count?: number
    ): void;
  };
  vfx: {
    emit(opts: {
      x?: number;
      y?: number;
      z?: number;
      preset?: string;
      color?: string;
      count?: number;
      target?: NexusObjectHandle | string;
    }): void;
    spawnBurst(
      x: number,
      y: number,
      zOrPreset?: number | string,
      presetOrColor?: string,
      count?: number
    ): void;
  };
  tween(
    target: NexusObjectHandle | string,
    props: Partial<
      Record<
        'x' | 'y' | 'z' | 'rx' | 'ry' | 'rz' | 'rotation' | 'scaleX' | 'scaleY' | 'scaleZ' | 'opacity' | 'fov',
        number
      >
    >,
    durationSec?: number
  ): void;
  camera: {
    shake(intensity?: number, duration?: number): void;
    switchCamera(cameraNameOrId: string, durationSec?: number): void;
    getForward(): { x: number; y: number; z: number };
    getRight(): { x: number; y: number; z: number };
    setPosition(x: number, y: number, z: number): void;
    lookAt(x: number, y: number, z: number): void;
    blendTo(opts: {
      x?: number;
      y?: number;
      z?: number;
      lookAtX?: number;
      lookAtY?: number;
      lookAtZ?: number;
      fov?: number;
      duration?: number;
    }): void;
  };
  scene: {
    load(sceneNameOrId: string): void;
    restart(): void;
    nextLevel(): void;
  };
  ui: {
    open(widgetNameOrId: string): void;
    close(widgetNameOrId: string): void;
    toggle(widgetNameOrId: string): void;
    showToast(text: string, durationSec?: number): void;
    createWidget(id: string, html: string, opts?: { x?: number; y?: number; css?: string }): void;
    updateWidget(id: string, patch: { html?: string; text?: string; visible?: boolean }): void;
    removeWidget(id: string): void;
    clearWidgets(): void;
  };
  spawn: {
    clone(nameOrId: string, x?: number, y?: number, z?: number): NexusObjectHandle | null;
    primitive(
      shape: 'box' | 'sphere' | 'cylinder' | 'ramp' | 'stairs',
      opts?: {
        name?: string;
        x?: number;
        y?: number;
        z?: number;
        sx?: number;
        sy?: number;
        sz?: number;
        color?: string;
        physics?: boolean;
        dynamic?: boolean;
      }
    ): NexusObjectHandle | null;
  };
  world: {
    raycast(
      ox: number,
      oy: number,
      oz: number,
      dx: number,
      dy: number,
      dz: number,
      maxDist?: number
    ): {
      hit: boolean;
      objectId?: string;
      objectName?: string;
      distance: number;
      x: number;
      y: number;
      z: number;
    };
    getTerrainHeight(x: number, z: number): number;
  };
  lights: {
    setSun(opts: { intensity?: number; color?: string; timeOfDay?: number }): void;
    setLight(
      nameOrId: string,
      opts: { intensity?: number; color?: string; distance?: number; visible?: boolean }
    ): void;
  };
  input: {
    isHeld(key: string): boolean;
    justPressed(key: string): boolean;
    getAxis(): { x: number; y: number };
  };
}

export interface CompiledScriptEntry {
  scriptId: string;
  name: string;
  hooks: NexusScriptHooks;
  error: string | null;
  securityMode?: 'safe_sandbox' | 'trusted_js';
  securityViolations?: string[];
  watchdogDisabled?: boolean;
  watchdogReason?: string;
}

export const FORBIDDEN_SCRIPT_GLOBALS = [
  'window',
  'document',
  'globalThis',
  'localStorage',
  'sessionStorage',
  'indexedDB',
  'fetch',
  'XMLHttpRequest',
  'WebSocket',
  'eval',
  'Function',
  'importScripts',
  'top',
  'parent',
  'opener',
  'cookie',
] as const;

/**
 * Elimina comentarios y literales de cadena simples para evitar falsos positivos
 * al analizar identificadores globales prohibidos en modo sandbox.
 */
function stripCommentsAndStringsForScan(source: string): string {
  return source.replace(
    /\/\*[\s\S]*?\*\/|\/\/[^\r\n]*|(["'`])(?:\\.|(?!\1)[^\\])*\1/g,
    (_match, quote) => (quote ? '""' : ' ')
  );
}

export function scanScriptSecurity(rawCode: string): {
  safe: boolean;
  blockedIdentifiers: string[];
} {
  const cleaned = stripCommentsAndStringsForScan(rawCode);
  const found = new Set<string>();
  for (const ident of FORBIDDEN_SCRIPT_GLOBALS) {
    const re = new RegExp(`(^|[^a-zA-Z0-9_$.])${ident}([^a-zA-Z0-9_$]|$)`);
    if (re.test(cleaned)) {
      found.add(ident);
    }
  }
  return {
    safe: found.size === 0,
    blockedIdentifiers: Array.from(found),
  };
}

/**
 * Sanitiza HTML de widgets visuales eliminando <script>, <iframe>, atributos on*= y URLs javascript:.
 * Mantiene intactos los atributos declarativos data-nexus-* y clases CSS del diseñador.
 */
export function sanitizeWidgetHtml(rawHtml: string): string {
  if (!rawHtml) return '';
  return rawHtml
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '')
    .replace(/<iframe\b[^>]*>[\s\S]*?<\/iframe>/gi, '')
    .replace(/\son[a-z]+\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/gi, '')
    .replace(/(href|src|action|formaction)\s*=\s*(["'])\s*javascript:[\s\S]*?\2/gi, '$1=$2#$2');
}

const STANDARD_LIFECYCLE_NAMES = [
  'onStart',
  'onUpdate',
  'onCollisionEnter',
  'onClick',
  'onDestroy',
] as const;

export function preprocessScriptSource(rawCode: string): string {
  return rawCode
    // Eliminar sentencias import ESM para evitar SyntaxError dentro de Function()
    .replace(/^\s*import\s+[\s\S]*?\s+from\s+['"][^'"]+['"];?\s*$/gm, '')
    .replace(/^\s*import\s+['"][^'"]+['"];?\s*$/gm, '')
    // Eliminar export { a, b };
    .replace(/^\s*export\s*\{[^}]*\};?\s*$/gm, '')
    // Capturar export default (objeto, función o clase)
    .replace(/^\s*export\s+default\s+/gm, 'var __nexusDefaultExport = ')
    // Exportaciones nombradas
    .replace(
      /^\s*export\s+(async\s+)?function\s+([a-zA-Z_$][a-zA-Z0-9_$]*)/gm,
      (_m, asyncKw, fnName) => `${asyncKw ? 'async ' : ''}function ${fnName}`
    )
    .replace(/^\s*export\s+class\s+/gm, 'class ')
    .replace(/^\s*export\s+(const|let|var)\s+/gm, '$1 ');
}

function collectTopLevelIdentifiers(rawCode: string): string[] {
  const names = new Set<string>(STANDARD_LIFECYCLE_NAMES);
  const fnRe = /(?:export\s+)?(?:async\s+)?function\s+([a-zA-Z_$][a-zA-Z0-9_$]*)\s*\(/g;
  let m: RegExpExecArray | null;
  while ((m = fnRe.exec(rawCode)) !== null) {
    names.add(m[1]);
  }
  const varRe = /(?:^|\n)\s*(?:export\s+)?(?:const|let|var)\s+([a-zA-Z_$][a-zA-Z0-9_$]*)\s*=/g;
  while ((m = varRe.exec(rawCode)) !== null) {
    if (m[1] !== 'params' && m[1] !== '__nexusDefaultExport') {
      names.add(m[1]);
    }
  }
  return Array.from(names);
}

function parseCommentParams(code: string): Record<string, number | boolean | string> {
  const result: Record<string, number | boolean | string> = {};
  const paramCommentRe = /\/\/\s*@param\s+([a-zA-Z0-9_]+)\s*:\s*(number|boolean|string)\s*=\s*([^\r\n]+)/g;
  let m: RegExpExecArray | null;
  while ((m = paramCommentRe.exec(code)) !== null) {
    const key = m[1];
    const type = m[2] as 'number' | 'boolean' | 'string';
    const rawVal = m[3].trim();
    result[key] =
      type === 'number'
        ? Number(rawVal) || 0
        : type === 'boolean'
          ? rawVal === 'true'
          : rawVal.replace(/^['"]|['"]$/g, '');
  }
  return result;
}

function wrapHooksWithWatchdog(
  hooks: NexusScriptHooks,
  entry: CompiledScriptEntry,
  maxMsPerFrame: number
): NexusScriptHooks {
  let consecutiveErrors = 0;
  const wrapped: NexusScriptHooks = { ...hooks };
  const budgetMs = Math.max(4, maxMsPerFrame * 4);

  for (const key of STANDARD_LIFECYCLE_NAMES) {
    const fn = hooks[key];
    if (typeof fn !== 'function') continue;
    wrapped[key] = (...args: unknown[]) => {
      if (entry.watchdogDisabled) return;
      const t0 = typeof performance !== 'undefined' ? performance.now() : Date.now();
      try {
        const res = (fn as (...a: unknown[]) => unknown).apply(hooks, args);
        consecutiveErrors = 0;
        const elapsed =
          (typeof performance !== 'undefined' ? performance.now() : Date.now()) - t0;
        if (elapsed > budgetMs) {
          entry.watchdogDisabled = true;
          entry.watchdogReason = `Script "${entry.name}" detenido por watchdog (${elapsed.toFixed(1)} ms > ${budgetMs} ms).`;
        }
        return res;
      } catch (err) {
        consecutiveErrors += 1;
        if (consecutiveErrors >= 3) {
          entry.watchdogDisabled = true;
          entry.watchdogReason = `Script "${entry.name}" desactivado tras 3 errores consecutivos.`;
        }
        throw err;
      }
    };
  }
  return wrapped;
}

const SANDBOX_SHADOW_PARAMS = [
  'window',
  'document',
  'globalThis',
  'localStorage',
  'sessionStorage',
  'indexedDB',
  'fetch',
  'XMLHttpRequest',
  'WebSocket',
  'Function',
  'importScripts',
] as const;

/**
 * Compila un script JS de NEXUS sin usar eval().
 * En modo `safe_sandbox` (por defecto), bloquea acceso a APIs globales del navegador/DOM
 * y envuelve los hooks con un watchdog anti-bucle infinito y anti-errores repetidos.
 */
export function compileNexusScript(
  script: NexusScriptAsset,
  opts?: { mode?: 'safe_sandbox' | 'trusted_js'; maxMsPerFrame?: number }
): CompiledScriptEntry {
  const rawCode = script.code ?? '';
  const securityMode = opts?.mode ?? script.securityMode ?? 'safe_sandbox';
  const maxMsPerFrame = opts?.maxMsPerFrame ?? 12;
  const commentParams = parseCommentParams(rawCode);

  if (securityMode === 'safe_sandbox') {
    const sec = scanScriptSecurity(rawCode);
    if (!sec.safe) {
      return {
        scriptId: script.id,
        name: script.name,
        hooks: Object.keys(commentParams).length > 0 ? { params: commentParams } : {},
        error: `Bloqueado por Sandbox Seguro: acceso prohibido a ${sec.blockedIdentifiers.join(', ')}. Cambia el modo a "JS Avanzado con Permisos" si realmente lo necesitas.`,
        securityMode,
        securityViolations: sec.blockedIdentifiers,
      };
    }
  }

  const code = preprocessScriptSource(rawCode);
  const fnNames = collectTopLevelIdentifiers(rawCode);
  const autoExpose = fnNames
    .map(
      (n) =>
        `try { if (typeof ${n} === 'function' && typeof result[${JSON.stringify(n)}] !== 'function') result[${JSON.stringify(n)}] = ${n}; } catch (_) {}`
    )
    .join('\n');

  try {
    const wrapped = `
      "use strict";
      var exports = {};
      var module = { exports: exports };
      var __nexusDefaultExport = undefined;
      ${code}
      var result = {};
      if (typeof __nexusDefaultExport === 'object' && __nexusDefaultExport !== null) {
        Object.assign(result, __nexusDefaultExport);
      } else if (typeof __nexusDefaultExport === 'function') {
        var _proto = __nexusDefaultExport.prototype;
        if (_proto && (typeof _proto.onStart === 'function' || typeof _proto.onUpdate === 'function' || typeof _proto.onCollisionEnter === 'function')) {
          try {
            var _inst = new __nexusDefaultExport();
            if (_inst && typeof _inst === 'object') {
              Object.assign(result, _inst);
              for (var _k of Object.getOwnPropertyNames(_proto)) {
                if (_k !== 'constructor' && typeof _proto[_k] === 'function' && !result[_k]) {
                  result[_k] = _proto[_k].bind(_inst);
                }
              }
            }
          } catch (_) {}
        } else {
          result.onUpdate = __nexusDefaultExport;
        }
      }
      if (module.exports && typeof module.exports === 'object' && Object.keys(module.exports).length > 0) {
        Object.assign(result, module.exports);
      }
      try {
        if (typeof params === 'object' && params !== null && !result.params) {
          result.params = params;
        }
      } catch (_) {}
      ${autoExpose}
      return result;
    `;
    const evaluated =
      securityMode === 'safe_sandbox'
        ? new Function(...SANDBOX_SHADOW_PARAMS, wrapped)(
            ...SANDBOX_SHADOW_PARAMS.map(() => undefined)
          )
        : new Function(wrapped)();
    const rawHooks: NexusScriptHooks =
      evaluated && typeof evaluated === 'object' ? (evaluated as NexusScriptHooks) : {};

    if (Object.keys(commentParams).length > 0) {
      rawHooks.params = {
        ...commentParams,
        ...(rawHooks.params && typeof rawHooks.params === 'object' ? rawHooks.params : {}),
      };
    }

    const entry: CompiledScriptEntry = {
      scriptId: script.id,
      name: script.name,
      hooks: rawHooks,
      error: null,
      securityMode,
    };
    entry.hooks = wrapHooksWithWatchdog(rawHooks, entry, maxMsPerFrame);
    return entry;
  } catch (err) {
    return {
      scriptId: script.id,
      name: script.name,
      hooks: Object.keys(commentParams).length > 0 ? { params: commentParams } : {},
      error: err instanceof Error ? err.message : String(err),
      securityMode,
    };
  }
}

export function extractScriptParamsSchema(scriptOrCode: NexusScriptAsset | string): ScriptParamSchema[] {
  const code = typeof scriptOrCode === 'string' ? scriptOrCode : scriptOrCode.code ?? '';
  const map = new Map<string, ScriptParamSchema>();

  const commentDefaults = parseCommentParams(code);
  for (const [key, defaultValue] of Object.entries(commentDefaults)) {
    const type =
      typeof defaultValue === 'number'
        ? 'number'
        : typeof defaultValue === 'boolean'
          ? 'boolean'
          : 'string';
    map.set(key, { key, name: key, type, defaultValue });
  }

  const dummyAsset: NexusScriptAsset =
    typeof scriptOrCode === 'string'
      ? { id: '_parse', name: '_parse', kind: 'script', code, updatedAt: 0 }
      : scriptOrCode;
  const compiled = compileNexusScript(dummyAsset);
  const paramsObj = compiled.hooks.params;
  if (paramsObj && typeof paramsObj === 'object') {
    for (const [key, val] of Object.entries(paramsObj)) {
      if (typeof val === 'number') {
        map.set(key, { key, name: key, type: 'number', defaultValue: val });
      } else if (typeof val === 'boolean') {
        map.set(key, { key, name: key, type: 'boolean', defaultValue: val });
      } else if (typeof val === 'string') {
        map.set(key, { key, name: key, type: 'string', defaultValue: val });
      }
    }
  }
  return Array.from(map.values());
}

export function validateScriptSyntax(code: string): { valid: boolean; error?: string } {
  try {
    const normalized = preprocessScriptSource(code);
    new Function(`"use strict";\nvar exports = {};\nvar module = { exports: exports };\n${normalized}`);
    return { valid: true };
  } catch (err) {
    return {
      valid: false,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

export interface CompiledInterfaceController {
  onMount?: (root: HTMLElement, nexus: unknown) => void;
  onUpdate?: (root: HTMLElement, dt: number, nexus: unknown) => void;
  onAction?: (actionName: string, root: HTMLElement, nexus: unknown) => void;
}

export function compileInterfaceWidgetScript(jsCode: string): {
  fn: ((el: HTMLElement, api: Record<string, unknown>) => (() => void) | void) | null;
  controller: CompiledInterfaceController;
  error: string | null;
} {
  if (!jsCode.trim()) return { fn: null, controller: {}, error: null };
  try {
    const normalized = preprocessScriptSource(jsCode);
    const wrapped = `
      "use strict";
      var exports = {};
      var module = { exports: exports };
      var onMount = undefined;
      var onUpdate = undefined;
      var onAction = undefined;
      ${normalized}
      var res = module.exports && Object.keys(module.exports).length > 0 ? module.exports : {};
      if (typeof onMount === 'function' && !res.onMount) res.onMount = onMount;
      if (typeof onUpdate === 'function' && !res.onUpdate) res.onUpdate = onUpdate;
      if (typeof onAction === 'function' && !res.onAction) res.onAction = onAction;
      if (typeof res.onMount === 'function') return res.onMount(root, api);
      return res;
    `;
    const executor = new Function('root', 'el', 'api', wrapped) as (
      root: HTMLElement,
      el: HTMLElement,
      api: Record<string, unknown>
    ) => unknown;
    const fn = (el: HTMLElement, api: Record<string, unknown>) => {
      const out = executor(el, el, api);
      return typeof out === 'function' ? (out as () => void) : undefined;
    };
    return {
      fn,
      controller: {},
      error: null,
    };
  } catch (err) {
    return {
      fn: null,
      controller: {},
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

function parseScalarValue(raw: string): string | number | boolean {
  const t = raw.trim();
  if (t === 'true') return true;
  if (t === 'false') return false;
  if (/^-?\d+(?:\.\d+)?$/.test(t)) return Number(t);
  return t.replace(/^['"]|['"]$/g, '');
}

/**
 * Procesa acciones declarativas `data-nexus-action` dentro de interfaces HTML/CSS/JS.
 * Soporta tanto llamadas estructuradas desde el DOM del widget (`{ action, param, value, objectId }`)
 * como expresiones de texto (`"var:puntos+=10"`, `"scene:next"`, `"ui:open:PanelTienda"`).
 */
export function executeDeclarativeWidgetAction(
  actionOrExpr:
    | string
    | { action: string; param?: string; value?: string; objectId?: string },
  bridgeOrNexus?: WidgetBridgeCallbacks | NexusScriptAPI,
  widgetObj?: GameObjectData
): void {
  if (!bridgeOrNexus) return;

  // Caso A: llamada estructurada desde UIWidgetOverlayLayer con WidgetBridgeCallbacks
  if (typeof actionOrExpr === 'object') {
    const bridge = bridgeOrNexus as WidgetBridgeCallbacks;
    const { action, param = '', value, objectId } = actionOrExpr;
    const act = action.trim();

    if (act === 'pause.toggle' || act === 'scene.pause') {
      bridge.onPauseToggle?.();
      return;
    }
    if (act === 'ui.closeSelf') {
      if (objectId) bridge.onToggleInterface?.(objectId, false);
      return;
    }
    if (act === 'ui.open') {
      bridge.onToggleInterface?.(param || objectId || '', true);
      return;
    }
    if (act === 'ui.close') {
      bridge.onToggleInterface?.(param || objectId || '', false);
      return;
    }
    if (act === 'ui.toggle') {
      bridge.onToggleInterface?.(param || objectId || '');
      return;
    }
    if (act === 'audio.play' || act === 'audio.beep') {
      bridge.onPlayAudio?.(param || 'click', 'ui');
      return;
    }
    if (act === 'scene.restart') {
      bridge.onRestartScene?.();
      return;
    }
    if (act === 'scene.next' || act === 'scene.nextLevel') {
      bridge.onNextLevel?.();
      return;
    }
    if (act === 'scene.load') {
      bridge.onLoadScene?.(param);
      return;
    }
    if (act === 'event.emit') {
      if (param) bridge.onEmitEvent?.(param, value);
      return;
    }
    if (act === 'var.add' && param) {
      bridge.onAddVariable?.(param, Number(value ?? 1) || 1);
      return;
    }
    if (act === 'var.set' && param) {
      bridge.onSetVariable?.(param, value !== undefined ? parseScalarValue(value) : 0);
      return;
    }
    // También permitir formato "var:puntos+=10" dentro de data-nexus-action
    if (act.includes(':')) {
      const adapter: NexusScriptAPI = {
        dt: 0,
        time: 0,
        findByName: () => null,
        findById: () => null,
        findByTag: () => [],
        getAll: () => [],
        spawnPrefab: () => null,
        destroyById: () => {},
        emitEvent: (ev, p) => bridge.onEmitEvent?.(ev, p),
        log: () => {},
        vars: {
          get: (n) => bridge.onGetVariable?.(n),
          set: (n, v) => bridge.onSetVariable?.(n, v),
          add: (n, d) => {
            bridge.onAddVariable?.(n, d);
            return Number(bridge.onGetVariable?.(n) ?? 0);
          },
        },
        audio: {
          play: (id) => bridge.onPlayAudio?.(id, 'sfx'),
          playSfx: (id) => bridge.onPlayAudio?.(id, 'sfx'),
          playMusic: (id) => bridge.onPlayAudio?.(id, 'music'),
          stopMusic: () => {},
          setBusVolume: (b, v) => bridge.onAudioBusVolume?.(b, v),
          setBusMuted: () => {},
        },
        particles: {
          burst: () => {},
        },
        vfx: {
          emit: () => {},
          spawnBurst: () => {},
        },
        tween: () => {},
        camera: {
          shake: () => {},
          switchCamera: () => {},
          getForward: () => ({ x: 0, y: 0, z: -1 }),
          getRight: () => ({ x: 1, y: 0, z: 0 }),
          setPosition: () => {},
          lookAt: () => {},
          blendTo: () => {},
        },
        scene: {
          load: (s) => bridge.onLoadScene?.(s),
          restart: () => bridge.onRestartScene?.(),
          nextLevel: () => bridge.onNextLevel?.(),
        },
        ui: {
          open: (t) => bridge.onToggleInterface?.(t, true),
          close: (t) => bridge.onToggleInterface?.(t, false),
          toggle: (t) => bridge.onToggleInterface?.(t),
          showToast: () => {},
          createWidget: () => {},
          updateWidget: () => {},
          removeWidget: () => {},
          clearWidgets: () => {},
        },
        spawn: {
          clone: () => null,
          primitive: () => null,
        },
        world: {
          raycast: () => ({ hit: false, distance: 0, x: 0, y: 0, z: 0 }),
          getTerrainHeight: () => 0,
        },
        lights: {
          setSun: () => {},
          setLight: () => {},
        },
        input: { isHeld: () => false, justPressed: () => false, getAxis: () => ({ x: 0, y: 0 }) },
      };
      executeDeclarativeWidgetAction(act, adapter, widgetObj);
    }
    return;
  }

  // Caso B: expresión de texto con NexusScriptAPI
  const nexus = bridgeOrNexus as NexusScriptAPI;
  const expr = actionOrExpr.trim();
  if (!expr) return;
  if (expr.startsWith('event:')) {
    nexus.emitEvent(expr.slice(6).trim(), { widgetId: widgetObj?.id, widgetName: widgetObj?.name });
    return;
  }
  if (expr.startsWith('scene:')) {
    const target = expr.slice(6).trim();
    if (target === 'next') nexus.scene.nextLevel();
    else if (target === 'restart') nexus.scene.restart();
    else nexus.scene.load(target);
    return;
  }
  if (expr.startsWith('ui:')) {
    const parts = expr.split(':');
    const op = parts[1];
    const target = parts.slice(2).join(':').trim() || widgetObj?.id || '';
    if (op === 'open') nexus.ui.open(target);
    else if (op === 'close') nexus.ui.close(target);
    else if (op === 'toggle') nexus.ui.toggle(target);
    return;
  }
  if (expr.startsWith('audio:')) {
    const parts = expr.split(':');
    const op = parts[1];
    const target = parts.slice(2).join(':').trim();
    if (op === 'play') nexus.audio.playSfx(target);
    else if (op === 'music') nexus.audio.playMusic(target);
    else if (op === 'stopMusic') nexus.audio.stopMusic();
    else if (op === 'mute') {
      if (target === 'master' || target === 'music' || target === 'sfx' || target === 'ui') {
        nexus.audio.setBusMuted(target, true);
      }
    } else if (op === 'unmute') {
      if (target === 'master' || target === 'music' || target === 'sfx' || target === 'ui') {
        nexus.audio.setBusMuted(target, false);
      }
    }
    return;
  }
  if (expr.startsWith('var:')) {
    const body = expr.slice(4).trim();
    const addMatch = body.match(/^([a-zA-Z0-9_]+)\s*\+=\s*(-?\d+(?:\.\d+)?)$/);
    if (addMatch) {
      nexus.vars.add(addMatch[1], Number(addMatch[2]));
      return;
    }
    const subMatch = body.match(/^([a-zA-Z0-9_]+)\s*-=\s*(-?\d+(?:\.\d+)?)$/);
    if (subMatch) {
      nexus.vars.add(subMatch[1], -Number(subMatch[2]));
      return;
    }
    const setMatch = body.match(/^([a-zA-Z0-9_]+)\s*=\s*(.+)$/);
    if (setMatch) {
      nexus.vars.set(setMatch[1], parseScalarValue(setMatch[2]));
    }
  }
}
