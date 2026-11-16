import type {
  AudioBusSettings,
  GameObjectData,
  ProjectVariable,
  SceneData,
} from '../../engine/core/types';

export const NEXUS_PROJECT_FORMAT = 'nexus-project' as const;
export const NEXUS_FORMAT_VERSION = '1.0.0' as const;
export const NEXUS_ENGINE_PHASE = 'phase-2-2d-engine' as const;

export type StageOrientation = 'horizontal' | 'vertical';

export type ProjectTemplateId = 'empty_single' | 'platformer_multiscene' | 'topdown_adventure';

export type ResolutionPresetId =
  | '1280x720'
  | '1920x1080'
  | '720x1280'
  | '1080x1920'
  | 'custom';

export interface ResolutionPreset {
  id: ResolutionPresetId;
  label: string;
  width: number;
  height: number;
  orientation: StageOrientation;
}

export const RESOLUTION_PRESETS: ResolutionPreset[] = [
  { id: '1280x720', label: '1280 × 720 (HD Horizontal)', width: 1280, height: 720, orientation: 'horizontal' },
  { id: '1920x1080', label: '1920 × 1080 (Full HD Horizontal)', width: 1920, height: 1080, orientation: 'horizontal' },
  { id: '720x1280', label: '720 × 1280 (HD Vertical)', width: 720, height: 1280, orientation: 'vertical' },
  { id: '1080x1920', label: '1080 × 1920 (Full HD Vertical)', width: 1080, height: 1920, orientation: 'vertical' },
  { id: 'custom', label: 'Personalizada', width: 1280, height: 720, orientation: 'horizontal' },
];

export type AssetFormat =
  | 'png'
  | 'jpg'
  | 'jpeg'
  | 'webp'
  | 'svg'
  | 'wav'
  | 'mp3'
  | 'ogg'
  | 'm4a'
  | 'aac'
  | 'flac'
  | 'webm';
export type AssetKind = 'image' | 'audio';

export interface ProjectFolder {
  id: string;
  name: string;
  parentId: string | null;
  category?: 'assets' | 'scenes' | 'prefabs' | 'general';
}

export interface PrefabDefinition {
  id: string;
  name: string;
  folderId?: string | null;
  rootObjectId: string;
  objects: GameObjectData[];
  createdAt: number;
}

export interface ProjectAssetMeta {
  id: string;
  name: string;
  filename: string;
  mimeType: string;
  format: AssetFormat;
  kind?: AssetKind;
  folderId?: string | null;
  tags?: string[];
  size: number;
  width: number;
  height: number;
  thumbnailDataUrl: string;
  createdAt: number;
}

export interface ProjectSettings {
  width: number;
  height: number;
  orientation: StageOrientation;
  backgroundColor: string;
}

export interface NexusProject {
  id: string;
  formatVersion: string;
  name: string;
  createdAt: number;
  updatedAt: number;
  settings: ProjectSettings;
  activeSceneId: string;
  initialSceneId?: string;
  scenes: SceneData[];
  assets: ProjectAssetMeta[];
  folders?: ProjectFolder[];
  prefabs?: PrefabDefinition[];
  variables?: ProjectVariable[];
  audioBuses?: AudioBusSettings;
}

export interface NexusProjectSummary {
  id: string;
  name: string;
  updatedAt: number;
  createdAt: number;
  width: number;
  height: number;
  orientation: StageOrientation;
  backgroundColor: string;
  sceneCount: number;
  objectCount: number;
  assetCount: number;
}

/**
 * Documento raíz serializado en `project.json` dentro de paquetes `.zip` exportados.
 */
export interface ExportedProjectManifest {
  format: typeof NEXUS_PROJECT_FORMAT;
  formatVersion: string;
  enginePhase: string;
  exportedAt: string;
  project: {
    id: string;
    name: string;
    createdAt: number;
    updatedAt: number;
    settings: ProjectSettings;
    activeSceneId: string;
    initialSceneId?: string;
    scenes: SceneData[];
    folders?: ProjectFolder[];
    prefabs?: PrefabDefinition[];
    variables?: ProjectVariable[];
    audioBuses?: AudioBusSettings;
  };
  assets: Array<ProjectAssetMeta & { path: string }>;
}

export function summarizeProject(project: NexusProject): NexusProjectSummary {
  const objectCount = project.scenes.reduce((acc, s) => acc + s.objects.length, 0);
  return {
    id: project.id,
    name: project.name,
    updatedAt: project.updatedAt,
    createdAt: project.createdAt,
    width: project.settings.width,
    height: project.settings.height,
    orientation: project.settings.orientation,
    backgroundColor: project.settings.backgroundColor,
    sceneCount: project.scenes.length,
    objectCount,
    assetCount: project.assets.length,
  };
}
