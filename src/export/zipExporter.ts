import JSZip from 'jszip';
import { sanitizeFilename } from '../utils/id';
import type { NexusProject } from '../project/models/project';
import {
  buildAssetArchivePath,
  serializeProjectToManifest,
} from '../project/serialization/projectSerializer';

export async function exportProjectToZip(
  project: NexusProject,
  assetBlobs: Map<string, Blob>
): Promise<{ blob: Blob; filename: string }> {
  const zip = new JSZip();
  const manifest = serializeProjectToManifest(project);

  zip.file('project.json', JSON.stringify(manifest, null, 2));

  const assetsFolder = zip.folder('assets');
  if (assetsFolder) {
    for (const asset of project.assets) {
      const blob = assetBlobs.get(asset.id);
      if (!blob) {
        throw new Error(
          `No se encontró el archivo binario local del recurso "${asset.filename}" (${asset.id}).`
        );
      }
      const archivePath = buildAssetArchivePath(asset.id, asset.filename);
      const relativeName = archivePath.replace(/^assets\//, '');
      assetsFolder.file(relativeName, blob);
    }
  }

  const zipBlob = await zip.generateAsync({
    type: 'blob',
    compression: 'DEFLATE',
    compressionOptions: { level: 6 },
  });

  const safeName = sanitizeFilename(project.name.trim() || 'proyecto_nexus').toLowerCase();
  return {
    blob: zipBlob,
    filename: `${safeName}.nexus.zip`,
  };
}

export function triggerBlobDownload(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  setTimeout(() => URL.revokeObjectURL(url), 1500);
}
