import type { NexusProject } from '../project/models/project';
import type { GameObjectData, NavMeshData, SceneData } from '../engine/core/types';

export interface HistoryState<T = NexusProject> {
  past: T[];
  present: T;
  future: T[];
}

const DEFAULT_MAX_HISTORY = 80;

/**
 * Clonación rápida con structural sharing para proyectos 3D pesados:
 * evita duplicar en memoria los buffers pesados (terrainData.heights/splatWeights,
 * csgGeometryJson, navMesh.walkable/heights) cuando no han sido reemplazados.
 */
function cloneGameObjectLight(obj: GameObjectData): GameObjectData {
  const copy = { ...obj };
  if (obj.transform) copy.transform = { ...obj.transform };
  if (obj.transform3d) copy.transform3d = { ...obj.transform3d };
  if (obj.mesh3d) {
    const m = obj.mesh3d;
    copy.mesh3d = {
      ...m,
      // Mantener referencias compartidas a buffers pesados inmutables al editar transformaciones
      terrainData: m.terrainData ? { ...m.terrainData } : undefined,
      csgGeometryJson: m.csgGeometryJson,
      waterConfig: m.waterConfig
        ? {
            ...m.waterConfig,
            interactingEntities: m.waterConfig.interactingEntities
              ? [...m.waterConfig.interactingEntities]
              : undefined,
          }
        : undefined,
      foliageConfig: m.foliageConfig
        ? { ...m.foliageConfig, instances: m.foliageConfig.instances }
        : undefined,
    };
  }
  if (obj.vehicle) {
    copy.vehicle = {
      ...obj.vehicle,
      localGravityBox: obj.vehicle.localGravityBox ? { ...obj.vehicle.localGravityBox } : undefined,
      parts: obj.vehicle.parts ? { ...obj.vehicle.parts } : undefined,
    };
  }
  if (obj.physics3d) {
    copy.physics3d = {
      ...obj.physics3d,
      halfExtents: obj.physics3d.halfExtents ? { ...obj.physics3d.halfExtents } : undefined,
      offset: obj.physics3d.offset ? { ...obj.physics3d.offset } : undefined,
    };
  }
  if (obj.tilemap) {
    copy.tilemap = {
      ...obj.tilemap,
      cells: { ...obj.tilemap.cells },
      tileTypes: obj.tilemap.tileTypes ? { ...obj.tilemap.tileTypes } : undefined,
    };
  }
  if (obj.sprite) {
    copy.sprite = {
      ...obj.sprite,
      imagePoints: obj.sprite.imagePoints ? [...obj.sprite.imagePoints] : undefined,
      frameEvents: obj.sprite.frameEvents ? [...obj.sprite.frameEvents] : undefined,
    };
  }
  if (obj.components) {
    copy.components = obj.components.map((c) => ({ ...c, config: { ...c.config } }));
  }
  if (obj.scriptBindings) {
    copy.scriptBindings = obj.scriptBindings.map((b) => ({
      ...b,
      params: b.params ? { ...b.params } : undefined,
    }));
  }
  return copy;
}

function cloneSceneLight(scene: SceneData): SceneData {
  const navMesh: NavMeshData | null | undefined = scene.navMesh
    ? { ...scene.navMesh }
    : scene.navMesh;
  return {
    ...scene,
    navMesh,
    splines3d: scene.splines3d
      ? scene.splines3d.map((sp) => ({ ...sp, points: sp.points.map((p) => ({ ...p })) }))
      : undefined,
    lighting: scene.lighting ? { ...scene.lighting } : undefined,
    cameraConfig: scene.cameraConfig ? { ...scene.cameraConfig } : undefined,
    backgroundMusic: scene.backgroundMusic ? { ...scene.backgroundMusic } : undefined,
    objects: scene.objects.map(cloneGameObjectLight),
    mechanics: scene.mechanics ? structuredClone(scene.mechanics) : undefined,
  };
}

export function cloneProjectLight(project: NexusProject): NexusProject {
  return {
    ...project,
    settings: {
      ...project.settings,
      touchControls: project.settings.touchControls
        ? { ...project.settings.touchControls }
        : undefined,
    },
    scenes: project.scenes.map(cloneSceneLight),
    assets: project.assets ? [...project.assets] : [],
    scripts: project.scripts ? project.scripts.map((s) => ({ ...s })) : undefined,
    folders: project.folders ? project.folders.map((f) => ({ ...f })) : undefined,
    prefabs: project.prefabs ? [...project.prefabs] : undefined,
    variables: project.variables ? project.variables.map((v) => ({ ...v })) : undefined,
    audioBuses: project.audioBuses ? { ...project.audioBuses, muted: { ...project.audioBuses.muted } } : undefined,
    dialogues: project.dialogues ? structuredClone(project.dialogues) : undefined,
    dataTables: project.dataTables ? structuredClone(project.dataTables) : undefined,
    i18n: project.i18n ? structuredClone(project.i18n) : undefined,
  };
}

function cloneHistoryEntry<T>(item: T): T {
  if (
    item &&
    typeof item === 'object' &&
    Array.isArray((item as unknown as NexusProject).scenes)
  ) {
    return cloneProjectLight(item as unknown as NexusProject) as unknown as T;
  }
  return structuredClone(item);
}

export function createHistoryState<T = NexusProject>(initial: T): HistoryState<T> {
  return {
    past: [],
    present: cloneHistoryEntry(initial),
    future: [],
  };
}

export function canUndo<T = NexusProject>(history: HistoryState<T>): boolean {
  return history.past.length > 0;
}

export function canRedo<T = NexusProject>(history: HistoryState<T>): boolean {
  return history.future.length > 0;
}

export function pushHistory<T = NexusProject>(
  history: HistoryState<T>,
  next: T,
  maxEntries = DEFAULT_MAX_HISTORY
): HistoryState<T> {
  const is3d =
    history.present &&
    typeof history.present === 'object' &&
    (history.present as unknown as NexusProject).mode === '3d';
  const cap = is3d ? Math.min(maxEntries, 40) : maxEntries;
  const past = [...history.past, history.present].slice(-cap);
  return {
    past,
    present: cloneHistoryEntry(next),
    future: [],
  };
}

export function replacePresentWithoutHistory<T = NexusProject>(
  history: HistoryState<T>,
  next: T
): HistoryState<T> {
  return {
    ...history,
    present: cloneHistoryEntry(next),
  };
}

export function undoHistory<T = NexusProject>(
  history: HistoryState<T>
): HistoryState<T> {
  if (history.past.length === 0) return history;
  const previous = history.past[history.past.length - 1];
  const nextPast = history.past.slice(0, -1);
  return {
    past: nextPast,
    present: cloneHistoryEntry(previous),
    future: [history.present, ...history.future].slice(0, DEFAULT_MAX_HISTORY),
  };
}

export function redoHistory<T = NexusProject>(
  history: HistoryState<T>
): HistoryState<T> {
  if (history.future.length === 0) return history;
  const next = history.future[0];
  const nextFuture = history.future.slice(1);
  return {
    past: [...history.past, history.present].slice(-DEFAULT_MAX_HISTORY),
    present: cloneHistoryEntry(next),
    future: nextFuture,
  };
}
