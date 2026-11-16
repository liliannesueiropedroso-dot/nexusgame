import JSZip from 'jszip';
import { createId } from '../utils/id';
import { generateThumbnailFromBlob } from '../assets/thumbnails/thumbnailGenerator';
import {
  NEXUS_FORMAT_VERSION,
  type ExportedProjectManifest,
  type NexusProject,
  type ProjectAssetMeta,
} from '../project/models/project';
import { validateExportManifest } from '../project/validation/projectValidator';

export interface ImportedZipProjectResult {
  project: NexusProject;
  assetBlobs: Map<string, Blob>;
}

export async function importProjectFromZip(
  file: File,
  existingProjectIds: Set<string> = new Set()
): Promise<ImportedZipProjectResult> {
  let zip: JSZip;
  try {
    const buffer = await file.arrayBuffer();
    zip = await JSZip.loadAsync(buffer);
  } catch {
    throw new Error(
      `El archivo "${file.name}" no es un paquete ZIP válido o está dañado.`
    );
  }

  const projectEntry = zip.file('project.json');
  if (!projectEntry) {
    throw new Error(
      'El archivo ZIP no contiene "project.json" en la raíz. No corresponde a un proyecto de NEXUS.'
    );
  }

  let parsedJson: unknown;
  try {
    const rawText = await projectEntry.async('string');
    parsedJson = JSON.parse(rawText);
  } catch {
    throw new Error('El archivo "project.json" dentro del ZIP contiene JSON inválido o dañado.');
  }

  const validation = validateExportManifest(parsedJson);
  if (!validation.valid) {
    throw new Error(`Proyecto inválido:\n• ${validation.errors.join('\n• ')}`);
  }

  const manifest = parsedJson as ExportedProjectManifest;
  const assetBlobs = new Map<string, Blob>();
  const restoredAssets: ProjectAssetMeta[] = [];

  for (const assetEntryMeta of manifest.assets) {
    const zipAssetFile = zip.file(assetEntryMeta.path);
    if (!zipAssetFile) {
      throw new Error(
        `Archivo dañado o incompleto: falta el recurso "${assetEntryMeta.path}" declarado en project.json.`
      );
    }

    const arrayBuf = await zipAssetFile.async('arraybuffer');
    if (arrayBuf.byteLength === 0) {
      throw new Error(`El recurso "${assetEntryMeta.filename}" dentro del ZIP está vacío.`);
    }

    const blob = new Blob([arrayBuf], {
      type: assetEntryMeta.mimeType || 'application/octet-stream',
    });

    let thumbnailDataUrl = assetEntryMeta.thumbnailDataUrl;
    let width = assetEntryMeta.width;
    let height = assetEntryMeta.height;
    const isAudio =
      assetEntryMeta.kind === 'audio' ||
      assetEntryMeta.mimeType.startsWith('audio/') ||
      ['wav', 'mp3', 'ogg'].includes(assetEntryMeta.format);

    if (!isAudio && (!thumbnailDataUrl || !width || !height)) {
      const thumb = await generateThumbnailFromBlob(blob);
      thumbnailDataUrl = thumb.thumbnailDataUrl;
      width = thumb.width;
      height = thumb.height;
    }

    assetBlobs.set(assetEntryMeta.id, blob);
    restoredAssets.push({
      id: assetEntryMeta.id,
      name: assetEntryMeta.name,
      filename: assetEntryMeta.filename,
      mimeType: assetEntryMeta.mimeType,
      format: assetEntryMeta.format,
      kind: isAudio ? 'audio' : 'image',
      folderId: assetEntryMeta.folderId ?? null,
      tags: assetEntryMeta.tags,
      size: blob.size,
      width,
      height,
      thumbnailDataUrl,
      createdAt: assetEntryMeta.createdAt || Date.now(),
    });
  }

  // Si ya existe un proyecto con el mismo ID en IndexedDB, generamos un nuevo ID para no sobrescribir accidentalmente
  const finalProjectId = existingProjectIds.has(manifest.project.id)
    ? createId('proj')
    : manifest.project.id;

  const project: NexusProject = {
    id: finalProjectId,
    formatVersion: manifest.formatVersion || NEXUS_FORMAT_VERSION,
    name: existingProjectIds.has(manifest.project.id)
      ? `${manifest.project.name} (importado)`
      : manifest.project.name,
    createdAt: manifest.project.createdAt || Date.now(),
    updatedAt: Date.now(),
    settings: structuredClone(manifest.project.settings),
    activeSceneId: manifest.project.activeSceneId || manifest.project.scenes[0].id,
    initialSceneId: manifest.project.initialSceneId || manifest.project.activeSceneId || manifest.project.scenes[0].id,
    scenes: structuredClone(manifest.project.scenes),
    assets: restoredAssets,
    folders: manifest.project.folders ? structuredClone(manifest.project.folders) : undefined,
    prefabs: manifest.project.prefabs ? structuredClone(manifest.project.prefabs) : undefined,
    variables: manifest.project.variables
      ? structuredClone(manifest.project.variables)
      : undefined,
    audioBuses: manifest.project.audioBuses
      ? structuredClone(manifest.project.audioBuses)
      : undefined,
  };

  return { project, assetBlobs };
}
