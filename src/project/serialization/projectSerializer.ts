import { hashStringFnv1a } from '../../engine/core/deterministicSim';
import { sanitizeFilename } from '../../utils/id';
import {
  NEXUS_ENGINE_PHASE,
  NEXUS_FORMAT_VERSION,
  NEXUS_PROJECT_FORMAT,
  type ExportedProjectManifest,
  type NexusProject,
} from '../models/project';

export function buildAssetArchivePath(assetId: string, filename: string): string {
  return `assets/${assetId}_${sanitizeFilename(filename)}`;
}

/**
 * Normaliza y migra un proyecto NEXUS garantizando compatibilidad hacia atrás
 * y valores seguros por defecto para seguridad, escenas y streaming.
 */
export function normalizeProjectData(project: NexusProject): NexusProject {
  const scenes = Array.isArray(project.scenes) ? project.scenes : [];
  const fallbackSceneId = scenes[0]?.id ?? project.activeSceneId ?? 'scene_1';
  const activeSceneId = scenes.some((s) => s.id === project.activeSceneId)
    ? project.activeSceneId
    : fallbackSceneId;
  const initialSceneId =
    project.initialSceneId && scenes.some((s) => s.id === project.initialSceneId)
      ? project.initialSceneId
      : activeSceneId;

  return {
    ...project,
    formatVersion: project.formatVersion || NEXUS_FORMAT_VERSION,
    mode: project.mode ?? '2d',
    activeSceneId,
    initialSceneId,
    assets: Array.isArray(project.assets) ? project.assets : [],
    scenes: scenes.map((s) => ({
      ...s,
      kind: s.kind ?? 'level',
      objects: Array.isArray(s.objects) ? s.objects : [],
      mechanics: Array.isArray(s.mechanics) ? s.mechanics : [],
      cameraVolumes: Array.isArray(s.cameraVolumes) ? s.cameraVolumes : undefined,
      occlusionVolumes: Array.isArray(s.occlusionVolumes) ? s.occlusionVolumes : undefined,
      worldStreaming: s.worldStreaming ? { ...s.worldStreaming } : undefined,
    })),
    scripts: Array.isArray(project.scripts)
      ? project.scripts.map((sc) => ({
          ...sc,
          securityMode: sc.securityMode ?? 'safe_sandbox',
        }))
      : project.scripts,
    security: {
      scriptMode: project.security?.scriptMode ?? 'safe_sandbox',
      allowUnsafeWidgets: project.security?.allowUnsafeWidgets ?? false,
      maxScriptMsPerFrame:
        typeof project.security?.maxScriptMsPerFrame === 'number' &&
        Number.isFinite(project.security.maxScriptMsPerFrame)
          ? Math.max(1, project.security.maxScriptMsPerFrame)
          : 12,
    },
    saveSlots: Array.isArray(project.saveSlots) ? project.saveSlots : undefined,
    commandHistory: Array.isArray(project.commandHistory) ? project.commandHistory : undefined,
  };
}

export function serializeProjectToManifest(project: NexusProject): ExportedProjectManifest {
  const norm = normalizeProjectData(project);
  return {
    format: NEXUS_PROJECT_FORMAT,
    formatVersion: NEXUS_FORMAT_VERSION,
    enginePhase: NEXUS_ENGINE_PHASE,
    exportedAt: new Date().toISOString(),
    project: {
      id: norm.id,
      mode: norm.mode ?? '2d',
      name: norm.name,
      createdAt: norm.createdAt,
      updatedAt: norm.updatedAt,
      settings: structuredClone(norm.settings),
      activeSceneId: norm.activeSceneId,
      initialSceneId: norm.initialSceneId,
      scenes: structuredClone(norm.scenes),
      scripts: norm.scripts ? structuredClone(norm.scripts) : undefined,
      folders: norm.folders ? structuredClone(norm.folders) : undefined,
      prefabs: norm.prefabs ? structuredClone(norm.prefabs) : undefined,
      variables: norm.variables ? structuredClone(norm.variables) : undefined,
      audioBuses: norm.audioBuses ? structuredClone(norm.audioBuses) : undefined,
      dialogues: norm.dialogues ? structuredClone(norm.dialogues) : undefined,
      dataTables: norm.dataTables ? structuredClone(norm.dataTables) : undefined,
      i18n: norm.i18n ? structuredClone(norm.i18n) : undefined,
      security: norm.security ? structuredClone(norm.security) : undefined,
      saveSlots: norm.saveSlots ? structuredClone(norm.saveSlots) : undefined,
      commandHistory: norm.commandHistory ? structuredClone(norm.commandHistory) : undefined,
      seed: norm.seed,
    },
    assets: norm.assets.map((asset) => ({
      ...structuredClone(asset),
      path: buildAssetArchivePath(asset.id, asset.filename),
    })),
  };
}

function stableSortValue(value: unknown, omitKeys: Set<string>): unknown {
  if (value === null || value === undefined) return undefined;
  if (Array.isArray(value)) {
    return value.map((item) => stableSortValue(item, omitKeys));
  }
  if (typeof value === 'object') {
    const out: Record<string, unknown> = {};
    const keys = Object.keys(value as Record<string, unknown>).sort();
    for (const k of keys) {
      if (omitKeys.has(k)) continue;
      const v = stableSortValue((value as Record<string, unknown>)[k], omitKeys);
      if (v !== undefined) {
        out[k] = v;
      }
    }
    return out;
  }
  return value;
}

/**
 * Calcula un hash semántico FNV-1a estable sobre la estructura lógica del proyecto,
 * ignorando timestamps volátiles (updatedAt/createdAt) y rutas temporales de exportación.
 */
export function computeProjectSemanticHash(project: NexusProject): string {
  const norm = normalizeProjectData(project);
  const canonical = stableSortValue(
    {
      ...norm,
      assets: norm.assets.map((a) => ({
        id: a.id,
        name: a.name,
        filename: a.filename,
        mimeType: a.mimeType,
        format: a.format,
        kind: a.kind,
      })),
    },
    new Set(['updatedAt', 'createdAt', 'exportedAt', 'builtAt'])
  );
  return hashStringFnv1a(JSON.stringify(canonical));
}

