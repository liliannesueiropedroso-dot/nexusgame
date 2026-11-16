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

export function serializeProjectToManifest(project: NexusProject): ExportedProjectManifest {
  return {
    format: NEXUS_PROJECT_FORMAT,
    formatVersion: NEXUS_FORMAT_VERSION,
    enginePhase: NEXUS_ENGINE_PHASE,
    exportedAt: new Date().toISOString(),
    project: {
      id: project.id,
      name: project.name,
      createdAt: project.createdAt,
      updatedAt: project.updatedAt,
      settings: structuredClone(project.settings),
      activeSceneId: project.activeSceneId,
      initialSceneId: project.initialSceneId,
      scenes: structuredClone(project.scenes),
      folders: project.folders ? structuredClone(project.folders) : undefined,
      prefabs: project.prefabs ? structuredClone(project.prefabs) : undefined,
      variables: project.variables ? structuredClone(project.variables) : undefined,
      audioBuses: project.audioBuses ? structuredClone(project.audioBuses) : undefined,
    },
    assets: project.assets.map((asset) => ({
      ...structuredClone(asset),
      path: buildAssetArchivePath(asset.id, asset.filename),
    })),
  };
}
