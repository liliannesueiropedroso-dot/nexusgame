import JSZip from 'jszip';
import type { GameObjectData, GameObjectType, SceneData } from '../engine/core/types';
import { createGameObject } from '../engine/objects/factory';
import { applyCommandPlan, planCommandBarInput } from '../engine/commandbar/commandPlan';
import type {
  NexusPluginPackage,
  NexusPluginScope,
  NexusProject,
  PluginPermission,
} from '../project/models/project';
import { createId } from '../utils/id';

export const MAX_PLUGIN_ZIP_BYTES = 2 * 1024 * 1024;
export const MAX_PLUGIN_CODE_BYTES = 512 * 1024;
export const MAX_PLUGIN_ZIP_ENTRIES = 64;

const ALLOWED_PERMISSIONS: ReadonlySet<PluginPermission> = new Set([
  'scene:read',
  'scene:write',
  'ui:toolbar',
  'runtime:update',
  'commands',
]);

export interface PluginEditorToolDef {
  id: string;
  label: string;
  description?: string;
  run: (editor: PluginEditorAPI) => void;
}

export interface PluginCommandDef {
  name: string;
  description?: string;
  run: (editor: PluginEditorAPI, args: string[]) => void;
}

export interface EvaluatedPluginModule {
  pluginId: string;
  name: string;
  editorTools: PluginEditorToolDef[];
  commands: PluginCommandDef[];
  onStart?: (nexus: unknown) => void;
  onUpdate?: (dt: number, nexus: unknown) => void;
  onEvent?: (eventName: string, payload: unknown, nexus: unknown) => void;
  error?: string;
}

export interface PluginEditorAPI {
  projectMode: '2d' | '3d';
  scene: {
    getName(): string;
    getObjects(): GameObjectData[];
    getSelectedIds(): string[];
    selectIds(ids: string[]): void;
    addPrimitive(
      shape: 'box' | 'sphere' | 'cylinder' | 'cone' | 'plane' | 'ramp',
      opts?: {
        name?: string;
        x?: number;
        y?: number;
        z?: number;
        sx?: number;
        sy?: number;
        sz?: number;
        rx?: number;
        ry?: number;
        rz?: number;
        color?: string;
        physics?: boolean;
        dynamic?: boolean;
        parentId?: string | null;
      }
    ): GameObjectData;
    addObject(type: GameObjectType, opts?: Partial<GameObjectData> & { x?: number; y?: number; z?: number }): GameObjectData;
    updateObject(id: string, patch: Partial<GameObjectData>): void;
    removeObject(id: string): void;
  };
  runCommand(commandText: string): { ok: boolean; summary: string; errors: string[] };
  notify(type: 'info' | 'success' | 'error', text: string): void;
}

export interface PluginStarterTemplate {
  id: string;
  label: string;
  description: string;
  scope: NexusPluginScope;
  permissions: PluginPermission[];
  code: string;
}

export const PLUGIN_STARTER_TEMPLATES: PluginStarterTemplate[] = [
  {
    id: 'procedural_ring_3d',
    label: 'Generador Procedural 3D (Editor + Comando)',
    description: 'Agrega un botón en la barra superior y un comando "> plugin anillo [cantidad] [radio]" para crear anillos de columnas.',
    scope: 'editor',
    permissions: ['scene:read', 'scene:write', 'ui:toolbar', 'commands'],
    code: `// Plugin de Herramienta para Editor y Barra de Comandos
nexusPlugin.register({
  name: 'Generador de Anillo 3D',
  editorTools: [
    {
      id: 'crear_anillo_3d',
      label: 'Anillo 3D',
      description: 'Genera 8 pilares en círculo alrededor del origen',
      run: function (editor) {
        var count = 8;
        var radius = 7;
        for (var i = 0; i < count; i++) {
          var ang = (i / count) * Math.PI * 2;
          editor.scene.addPrimitive('cylinder', {
            name: 'PilarPlugin_' + (i + 1),
            x: Math.cos(ang) * radius,
            y: 1.6,
            z: Math.sin(ang) * radius,
            sx: 0.9,
            sy: 3.2,
            sz: 0.9,
            color: i % 2 === 0 ? '#38bdf8' : '#818cf8',
            physics: true
          });
        }
        editor.notify('success', 'Anillo de 8 pilares creado por plugin.');
      }
    }
  ],
  commands: [
    {
      name: 'anillo',
      description: 'Uso: plugin anillo [cantidad] [radio]',
      run: function (editor, args) {
        var count = Math.max(3, Math.min(32, Number(args[0] || 10)));
        var radius = Math.max(2, Math.min(40, Number(args[1] || 8)));
        for (var i = 0; i < count; i++) {
          var ang = (i / count) * Math.PI * 2;
          editor.scene.addPrimitive('box', {
            name: 'BloqueAnillo_' + (i + 1),
            x: Math.cos(ang) * radius,
            y: 1.0,
            z: Math.sin(ang) * radius,
            sx: 1.2,
            sy: 2.0,
            sz: 1.2,
            color: '#f59e0b',
            physics: true
          });
        }
        editor.notify('success', 'Anillo procedural (' + count + ' piezas, r=' + radius + 'm) creado.');
      }
    }
  ]
});
`,
  },
  {
    id: 'runtime_speed_boost',
    label: 'Sistema en Tiempo Real (Juego 2D/3D)',
    description: 'Ejecuta lógica personalizada en cada frame durante la Vista Previa y el juego exportado HTML5.',
    scope: 'runtime',
    permissions: ['scene:read', 'scene:write', 'runtime:update'],
    code: `// Plugin de Tiempo Real para Vista Previa y HTML5 Exportado
var tiempoAcum = 0;

nexusPlugin.register({
  name: 'Pulso de Energía y HUD',
  onStart: function (nexus) {
    nexus.vars.set('plugin_activo', 'Pulso 1.0');
    if (nexus.ui && nexus.ui.showToast) {
      nexus.ui.showToast('Plugin de Juego activo', 'info', 2.2);
    }
  },
  onUpdate: function (dt, nexus) {
    tiempoAcum += dt;
    var objs = nexus.getAll ? nexus.getAll() : [];
    for (var i = 0; i < objs.length; i++) {
      var o = objs[i];
      if (o.hasTag && o.hasTag('plugin_spin')) {
        o.ry += 90 * dt;
      }
    }
  },
  onEvent: function (eventName, payload, nexus) {
    if (eventName === 'plugin_bonus') {
      nexus.vars.add('puntos', 25);
    }
  }
});
`,
  },
  {
    id: 'batch_grid_layout',
    label: 'Organizador en Cuadrícula (Editor)',
    description: 'Ordena los objetos seleccionados en una cuadrícula limpia automáticamente.',
    scope: 'editor',
    permissions: ['scene:read', 'scene:write', 'ui:toolbar'],
    code: `// Alinea los objetos seleccionados en cuadrícula XZ (3D) o XY (2D)
nexusPlugin.register({
  name: 'Organizador en Cuadrícula',
  editorTools: [
    {
      id: 'alinear_grid',
      label: 'Alinear Grid',
      description: 'Ordena los objetos seleccionados en cuadrícula de 3 columnas',
      run: function (editor) {
        var selIds = editor.scene.getSelectedIds();
        var objs = editor.scene.getObjects().filter(function (o) {
          return selIds.indexOf(o.id) >= 0;
        });
        if (objs.length < 2) {
          editor.notify('info', 'Selecciona al menos 2 objetos para alinear.');
          return;
        }
        var cols = 3;
        var spacing = editor.projectMode === '3d' ? 3.2 : 140;
        for (var i = 0; i < objs.length; i++) {
          var row = Math.floor(i / cols);
          var col = i % cols;
          var obj = objs[i];
          if (editor.projectMode === '3d' && obj.transform3d) {
            editor.scene.updateObject(obj.id, {
              transform3d: Object.assign({}, obj.transform3d, {
                x: col * spacing,
                z: row * spacing
              })
            });
          } else {
            editor.scene.updateObject(obj.id, {
              transform: Object.assign({}, obj.transform, {
                x: 240 + col * spacing,
                y: 180 + row * spacing
              })
            });
          }
        }
        editor.notify('success', objs.length + ' objetos alineados en cuadrícula.');
      }
    }
  ]
});
`,
  },
];

/**
 * Valida que una ruta dentro de un .zip sea segura (sin path traversal ni rutas absolutas).
 */
export function isSafeZipEntryPath(entryPath: string): boolean {
  if (!entryPath || typeof entryPath !== 'string') return false;
  if (entryPath.includes('\0') || entryPath.includes('\\')) return false;
  if (entryPath.startsWith('/')) return false;
  const parts = entryPath.split('/');
  for (const part of parts) {
    if (part === '..' || part === '.') return false;
    if (/[\x00-\x1f]/.test(part)) return false;
  }
  return true;
}

export function validatePluginSyntax(code: string): { valid: boolean; error?: string } {
  const trimmed = code.trim();
  if (!trimmed) {
    return { valid: false, error: 'El código JavaScript del plugin está vacío.' };
  }
  if (trimmed.length > MAX_PLUGIN_CODE_BYTES) {
    return { valid: false, error: `El código excede el límite de ${Math.round(MAX_PLUGIN_CODE_BYTES / 1024)} KB.` };
  }
  try {
    // Compilación sintáctica aislada sin ejecutar el cuerpo todavía
    new Function('nexusPlugin', 'exports', 'module', trimmed);
    return { valid: true };
  } catch (err) {
    return {
      valid: false,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

export function normalizePluginPermissions(input: unknown): PluginPermission[] {
  if (!Array.isArray(input)) {
    return ['scene:read', 'scene:write', 'ui:toolbar', 'runtime:update', 'commands'];
  }
  const clean: PluginPermission[] = [];
  for (const item of input) {
    if (typeof item === 'string' && ALLOWED_PERMISSIONS.has(item as PluginPermission)) {
      if (!clean.includes(item as PluginPermission)) {
        clean.push(item as PluginPermission);
      }
    }
  }
  return clean.length > 0 ? clean : ['scene:read', 'ui:toolbar'];
}

export function evaluatePluginModule(plugin: NexusPluginPackage): EvaluatedPluginModule {
  const result: EvaluatedPluginModule = {
    pluginId: plugin.id,
    name: plugin.name,
    editorTools: [],
    commands: [],
  };
  const syn = validatePluginSyntax(plugin.code);
  if (!syn.valid) {
    result.error = syn.error;
    return result;
  }

  let registered: Record<string, unknown> | null = null;
  const moduleObj: { exports: Record<string, unknown> } = { exports: {} };
  const nexusPluginHost = {
    id: plugin.id,
    name: plugin.name,
    version: plugin.version,
    register: (def: Record<string, unknown>) => {
      if (def && typeof def === 'object') {
        registered = def;
      }
    },
  };

  try {
    const fn = new Function(
      'nexusPlugin',
      'exports',
      'module',
      `"use strict";\n${plugin.code}`
    );
    const returned = fn(nexusPluginHost, moduleObj.exports, moduleObj);
    const resolved =
      registered ??
      (returned && typeof returned === 'object' ? (returned as Record<string, unknown>) : null) ??
      (Object.keys(moduleObj.exports).length > 0 ? moduleObj.exports : null);

    if (!resolved) return result;
    if (typeof resolved.name === 'string' && resolved.name.trim()) {
      result.name = resolved.name.trim().slice(0, 80);
    }
    if (Array.isArray(resolved.editorTools)) {
      for (const tool of resolved.editorTools) {
        if (
          tool &&
          typeof tool === 'object' &&
          typeof (tool as PluginEditorToolDef).run === 'function'
        ) {
          const t = tool as PluginEditorToolDef;
          result.editorTools.push({
            id: String(t.id || t.label || 'tool').slice(0, 60),
            label: String(t.label || t.id || 'Herramienta').slice(0, 48),
            description: typeof t.description === 'string' ? t.description.slice(0, 180) : undefined,
            run: t.run,
          });
        }
      }
    }
    if (Array.isArray(resolved.commands)) {
      for (const cmd of resolved.commands) {
        if (
          cmd &&
          typeof cmd === 'object' &&
          typeof (cmd as PluginCommandDef).name === 'string' &&
          typeof (cmd as PluginCommandDef).run === 'function'
        ) {
          const c = cmd as PluginCommandDef;
          result.commands.push({
            name: c.name.trim().toLowerCase().slice(0, 48),
            description: typeof c.description === 'string' ? c.description.slice(0, 180) : undefined,
            run: c.run,
          });
        }
      }
    }
    if (typeof resolved.onStart === 'function') {
      result.onStart = resolved.onStart as (nexus: unknown) => void;
    }
    if (typeof resolved.onUpdate === 'function') {
      result.onUpdate = resolved.onUpdate as (dt: number, nexus: unknown) => void;
    }
    if (typeof resolved.onEvent === 'function') {
      result.onEvent = resolved.onEvent as (ev: string, payload: unknown, nexus: unknown) => void;
    }
    return result;
  } catch (err) {
    result.error = err instanceof Error ? err.message : String(err);
    return result;
  }
}

export async function importPluginFromZipBlob(
  blob: Blob,
  fallbackName = 'PluginComunidad'
): Promise<NexusPluginPackage> {
  if (blob.size > MAX_PLUGIN_ZIP_BYTES) {
    throw new Error(`El archivo .zip supera el límite permitido de ${Math.round(MAX_PLUGIN_ZIP_BYTES / (1024 * 1024))} MB.`);
  }
  const zip = await JSZip.loadAsync(blob);
  const entryNames = Object.keys(zip.files);
  if (entryNames.length === 0) {
    throw new Error('El paquete .zip está vacío.');
  }
  if (entryNames.length > MAX_PLUGIN_ZIP_ENTRIES) {
    throw new Error(`El paquete .zip contiene demasiados archivos (${entryNames.length} > ${MAX_PLUGIN_ZIP_ENTRIES}).`);
  }
  for (const name of entryNames) {
    if (!isSafeZipEntryPath(name)) {
      throw new Error(`Ruta insegura detectada en el paquete .zip: "${name}".`);
    }
  }

  // Buscar nexus-plugin.json (en raíz o dentro de una carpeta primer nivel)
  const manifestPath =
    entryNames.find((n) => n === 'nexus-plugin.json') ??
    entryNames.find((n) => /(^|\/)nexus-plugin\.json$/i.test(n) && !zip.files[n].dir);

  let rawManifest: Record<string, unknown> = {};
  let baseFolder = '';
  if (manifestPath) {
    const manifestText = await zip.files[manifestPath].async('string');
    if (manifestText.length > 64 * 1024) {
      throw new Error('El archivo nexus-plugin.json es demasiado grande.');
    }
    try {
      const parsed = JSON.parse(manifestText);
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
        throw new Error('nexus-plugin.json debe ser un objeto JSON.');
      }
      rawManifest = parsed as Record<string, unknown>;
    } catch (err) {
      throw new Error(
        `Error leyendo nexus-plugin.json: ${err instanceof Error ? err.message : String(err)}`
      );
    }
    const lastSlash = manifestPath.lastIndexOf('/');
    baseFolder = lastSlash >= 0 ? manifestPath.slice(0, lastSlash + 1) : '';
  }

  const requestedEntry =
    typeof rawManifest.entry === 'string' && rawManifest.entry.trim()
      ? rawManifest.entry.trim().replace(/^\.\//, '')
      : 'index.js';

  if (!isSafeZipEntryPath(requestedEntry) || !/\.(js|mjs)$/i.test(requestedEntry)) {
    throw new Error(`Archivo de entrada inválido en manifest: "${requestedEntry}". Debe ser .js o .mjs.`);
  }

  const candidatePaths = [
    `${baseFolder}${requestedEntry}`,
    requestedEntry,
    ...entryNames.filter((n) => !zip.files[n].dir && /\.(js|mjs)$/i.test(n)),
  ];
  const resolvedEntryPath = candidatePaths.find((p) => Boolean(zip.files[p] && !zip.files[p].dir));
  if (!resolvedEntryPath) {
    throw new Error(`No se encontró ningún archivo JavaScript de entrada (${requestedEntry}) en el .zip.`);
  }

  const code = await zip.files[resolvedEntryPath].async('string');
  const syn = validatePluginSyntax(code);
  if (!syn.valid) {
    throw new Error(`Error de sintaxis en "${resolvedEntryPath}": ${syn.error}`);
  }

  const now = Date.now();
  const scopeRaw = String(rawManifest.scope ?? 'both');
  const scope: NexusPluginScope =
    scopeRaw === 'editor' || scopeRaw === 'runtime' || scopeRaw === 'both' ? scopeRaw : 'both';

  const cleanName =
    typeof rawManifest.name === 'string' && rawManifest.name.trim()
      ? rawManifest.name.trim().slice(0, 64)
      : fallbackName.replace(/\.(zip|js)$/i, '').slice(0, 64) || 'Plugin';

  return {
    id:
      typeof rawManifest.id === 'string' && /^[a-zA-Z0-9_-]{3,48}$/.test(rawManifest.id.trim())
        ? rawManifest.id.trim()
        : createId('plg'),
    name: cleanName,
    version:
      typeof rawManifest.version === 'string' && rawManifest.version.trim()
        ? rawManifest.version.trim().slice(0, 24)
        : '1.0.0',
    author:
      typeof rawManifest.author === 'string' && rawManifest.author.trim()
        ? rawManifest.author.trim().slice(0, 48)
        : 'Comunidad NEXUS',
    description:
      typeof rawManifest.description === 'string'
        ? rawManifest.description.trim().slice(0, 240)
        : 'Plugin JavaScript importado desde paquete .zip.',
    entry: requestedEntry,
    code,
    enabled: true,
    scope,
    permissions: normalizePluginPermissions(rawManifest.permissions),
    source: 'zip',
    installedAt: now,
    updatedAt: now,
  };
}

export async function exportPluginToZipBlob(plugin: NexusPluginPackage): Promise<Blob> {
  const zip = new JSZip();
  const entry = isSafeZipEntryPath(plugin.entry) && /\.(js|mjs)$/i.test(plugin.entry) ? plugin.entry : 'index.js';
  const manifest = {
    id: plugin.id,
    name: plugin.name,
    version: plugin.version,
    author: plugin.author,
    description: plugin.description,
    entry,
    scope: plugin.scope,
    permissions: plugin.permissions,
  };
  zip.file('nexus-plugin.json', JSON.stringify(manifest, null, 2));
  zip.file(entry, plugin.code);
  zip.file(
    'README.md',
    `# ${plugin.name} (v${plugin.version})\n\nAutor: ${plugin.author}\n\n${plugin.description}\n\nImporta este archivo .zip desde "Plugins SDK" en NEXUS Game Engine.\n`
  );
  return zip.generateAsync({
    type: 'blob',
    compression: 'DEFLATE',
    compressionOptions: { level: 6 },
  });
}

export function runEditorPluginAction(
  project: NexusProject,
  activeSceneId: string,
  selectedIds: string[],
  plugin: NexusPluginPackage,
  action: { kind: 'tool'; toolId: string } | { kind: 'command'; commandName: string; args: string[] }
): {
  ok: boolean;
  nextProject: NexusProject;
  nextSelectedIds: string[];
  notifications: Array<{ type: 'info' | 'success' | 'error'; text: string }>;
  error?: string;
} {
  const evaluated = evaluatePluginModule(plugin);
  const notifications: Array<{ type: 'info' | 'success' | 'error'; text: string }> = [];
  if (evaluated.error) {
    return {
      ok: false,
      nextProject: project,
      nextSelectedIds: selectedIds,
      notifications,
      error: evaluated.error,
    };
  }

  let workingProject: NexusProject = structuredClone(project);
  let workingSelected = [...selectedIds];
  const getScene = (): SceneData =>
    workingProject.scenes.find((s) => s.id === activeSceneId) ?? workingProject.scenes[0];

  const canRead = plugin.permissions.includes('scene:read') || plugin.permissions.includes('scene:write');
  const canWrite = plugin.permissions.includes('scene:write');
  const canCmd = plugin.permissions.includes('commands');

  const api: PluginEditorAPI = {
    projectMode: workingProject.mode ?? '2d',
    scene: {
      getName: () => getScene().name,
      getObjects: () => (canRead ? [...getScene().objects] : []),
      getSelectedIds: () => [...workingSelected],
      selectIds: (ids: string[]) => {
        workingSelected = [...ids];
      },
      addPrimitive: (shape, opts = {}) => {
        if (!canWrite) throw new Error('El plugin no tiene permiso scene:write.');
        const sc = getScene();
        const obj = createGameObject('mesh_3d', sc.objects, {
          name: opts.name || `Plugin_${shape}`,
        });
        obj.parentId = opts.parentId ?? null;
        obj.transform3d = {
          x: Number(opts.x ?? 0),
          y: Number(opts.y ?? 1),
          z: Number(opts.z ?? 0),
          rx: Number(opts.rx ?? 0),
          ry: Number(opts.ry ?? 0),
          rz: Number(opts.rz ?? 0),
          sx: Number(opts.sx ?? 1),
          sy: Number(opts.sy ?? 1),
          sz: Number(opts.sz ?? 1),
        };
        obj.mesh3d = {
          shape,
          color: opts.color || '#38bdf8',
          metalness: 0.25,
          roughness: 0.5,
          castShadow: true,
          receiveShadow: true,
        };
        obj.physics3d = {
          enabled: opts.physics !== false,
          bodyType: opts.dynamic ? 'dynamic' : 'static',
          shape: shape === 'sphere' ? 'sphere' : 'box',
          cameraCollision: 'auto',
          mass: 1,
          gravityScale: opts.dynamic ? 1 : 0,
          restitution: 0.1,
          friction: 0.6,
        };
        sc.objects.push(obj);
        workingSelected = [obj.id];
        return obj;
      },
      addObject: (type, opts = {}) => {
        if (!canWrite) throw new Error('El plugin no tiene permiso scene:write.');
        const sc = getScene();
        const obj = createGameObject(type, sc.objects, {
          name: opts.name || `Plugin_${type}`,
          x: opts.x,
          y: opts.y,
        });
        Object.assign(obj, opts);
        if (opts.z !== undefined && obj.transform3d) {
          obj.transform3d.z = Number(opts.z);
        }
        sc.objects.push(obj);
        workingSelected = [obj.id];
        return obj;
      },
      updateObject: (id, patch) => {
        if (!canWrite) throw new Error('El plugin no tiene permiso scene:write.');
        const sc = getScene();
        sc.objects = sc.objects.map((o) => (o.id === id ? { ...o, ...patch } : o));
      },
      removeObject: (id) => {
        if (!canWrite) throw new Error('El plugin no tiene permiso scene:write.');
        const sc = getScene();
        sc.objects = sc.objects.filter((o) => o.id !== id && o.parentId !== id);
        workingSelected = workingSelected.filter((sid) => sid !== id);
      },
    },
    runCommand: (commandText: string) => {
      if (!canCmd) {
        return { ok: false, summary: '', errors: ['El plugin no tiene permiso commands.'] };
      }
      const plan = planCommandBarInput(workingProject, activeSceneId, workingSelected, commandText);
      if (!plan.valid) {
        return { ok: false, summary: '', errors: plan.errors };
      }
      const res = applyCommandPlan(workingProject, activeSceneId, workingSelected, plan, true);
      workingProject = res.nextProject;
      if (res.createdIds.length > 0) workingSelected = res.createdIds;
      return { ok: true, summary: plan.summary, errors: [] };
    },
    notify: (type, text) => {
      notifications.push({ type, text: String(text || '') });
    },
  };

  try {
    if (action.kind === 'tool') {
      const tool = evaluated.editorTools.find((t) => t.id === action.toolId);
      if (!tool) {
        return {
          ok: false,
          nextProject: project,
          nextSelectedIds: selectedIds,
          notifications,
          error: `Herramienta "${action.toolId}" no encontrada en el plugin.`,
        };
      }
      tool.run(api);
    } else {
      const cmd = evaluated.commands.find((c) => c.name === action.commandName.toLowerCase());
      if (!cmd) {
        return {
          ok: false,
          nextProject: project,
          nextSelectedIds: selectedIds,
          notifications,
          error: `Comando "${action.commandName}" no encontrado en el plugin.`,
        };
      }
      cmd.run(api, action.args);
    }
    return {
      ok: true,
      nextProject: workingProject,
      nextSelectedIds: workingSelected,
      notifications,
    };
  } catch (err) {
    return {
      ok: false,
      nextProject: project,
      nextSelectedIds: selectedIds,
      notifications,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

export interface CompiledRuntimePlugin {
  id: string;
  name: string;
  onStart?: (nexus: unknown) => void;
  onUpdate?: (dt: number, nexus: unknown) => void;
  onEvent?: (eventName: string, payload: unknown, nexus: unknown) => void;
}

export function compileRuntimePlugins(plugins: NexusPluginPackage[] = []): CompiledRuntimePlugin[] {
  const out: CompiledRuntimePlugin[] = [];
  for (const p of plugins) {
    if (!p.enabled) continue;
    if (p.scope === 'editor') continue;
    const ev = evaluatePluginModule(p);
    if (ev.error) continue;
    if (ev.onStart || ev.onUpdate || ev.onEvent) {
      out.push({
        id: p.id,
        name: ev.name || p.name,
        onStart: ev.onStart,
        onUpdate: ev.onUpdate,
        onEvent: ev.onEvent,
      });
    }
  }
  return out;
}
