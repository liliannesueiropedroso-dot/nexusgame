import { createId } from '../../utils/id';
import type { ProjectAssetMeta } from '../../project/models/project';
import { detectAudioFormat, detectImageFormat } from '../library/assetUtils';
import { generateThumbnailFromBlob } from '../thumbnails/thumbnailGenerator';

export interface ImportedAssetResult {
  meta: ProjectAssetMeta;
  blob: Blob;
}

export interface AssetImportBatchResult {
  imported: ImportedAssetResult[];
  errors: string[];
}

const AUDIO_BADGE_THUMBNAIL =
  'data:image/svg+xml;utf8,' +
  encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" width="96" height="96" viewBox="0 0 96 96"><rect width="96" height="96" rx="12" fill="#18181f"/><path d="M36 60V28l28-6v32" stroke="#38bdf8" stroke-width="5" fill="none" stroke-linecap="round" stroke-linejoin="round"/><circle cx="30" cy="62" r="8" fill="#38bdf8"/><circle cx="58" cy="56" r="8" fill="#38bdf8"/></svg>'
  );

export async function importImageFiles(files: File[]): Promise<AssetImportBatchResult> {
  const imported: ImportedAssetResult[] = [];
  const errors: string[] = [];

  for (const file of files) {
    const imgFormat = detectImageFormat(file.name, file.type);
    const audioFormat = imgFormat ? null : detectAudioFormat(file.name, file.type);
    const format = imgFormat ?? audioFormat;

    if (!format) {
      errors.push(
        `"${file.name}": formato no soportado. Permitidos: PNG, JPG, WebP, SVG, WAV, MP3, OGG, M4A, AAC, FLAC y WebM.`
      );
      continue;
    }

    if (file.size === 0) {
      errors.push(`"${file.name}": el archivo está vacío.`);
      continue;
    }

    try {
      if (audioFormat) {
        const mimeType =
          file.type ||
          (audioFormat === 'mp3'
            ? 'audio/mpeg'
            : audioFormat === 'm4a'
              ? 'audio/mp4'
              : `audio/${audioFormat}`);
        const buffer = await file.arrayBuffer();
        const blob = new Blob([buffer], { type: mimeType });
        const baseName = file.name.replace(/\.[^.]+$/, '') || file.name;
        const meta: ProjectAssetMeta = {
          id: createId('asset'),
          name: baseName,
          filename: file.name,
          mimeType,
          format: audioFormat,
          kind: 'audio',
          size: file.size,
          width: 0,
          height: 0,
          thumbnailDataUrl: AUDIO_BADGE_THUMBNAIL,
          createdAt: Date.now(),
        };
        imported.push({ meta, blob });
        continue;
      }

      const mimeType =
        file.type ||
        (format === 'svg'
          ? 'image/svg+xml'
          : format === 'jpg' || format === 'jpeg'
            ? 'image/jpeg'
            : `image/${format}`);

      const buffer = await file.arrayBuffer();
      const blob = new Blob([buffer], { type: mimeType });
      const { thumbnailDataUrl, width, height } = await generateThumbnailFromBlob(blob);

      const baseName = file.name.replace(/\.[^.]+$/, '') || file.name;
      const meta: ProjectAssetMeta = {
        id: createId('asset'),
        name: baseName,
        filename: file.name,
        mimeType,
        format,
        kind: 'image',
        size: file.size,
        width,
        height,
        thumbnailDataUrl,
        createdAt: Date.now(),
      };

      imported.push({ meta, blob });
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Error desconocido al procesar el recurso.';
      errors.push(`"${file.name}": ${msg}`);
    }
  }

  return { imported, errors };
}

export const importAssetFiles = importImageFiles;
