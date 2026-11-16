import type { SceneData } from '../../engine/core/types';
import type { AssetFormat, ProjectAssetMeta } from '../../project/models/project';

export const SUPPORTED_IMAGE_EXTENSIONS: AssetFormat[] = ['png', 'jpg', 'jpeg', 'webp', 'svg'];
export const SUPPORTED_AUDIO_EXTENSIONS: AssetFormat[] = ['wav', 'mp3', 'ogg'];

export function detectImageFormat(filename: string, mimeType: string): AssetFormat | null {
  const ext = filename.split('.').pop()?.toLowerCase() ?? '';
  if (ext === 'png' || mimeType === 'image/png') return 'png';
  if (ext === 'jpg' || mimeType === 'image/jpg') return 'jpg';
  if (ext === 'jpeg' || mimeType === 'image/jpeg') return 'jpeg';
  if (ext === 'webp' || mimeType === 'image/webp') return 'webp';
  if (ext === 'svg' || mimeType === 'image/svg+xml') return 'svg';
  return null;
}

export function detectAudioFormat(filename: string, mimeType: string): AssetFormat | null {
  const ext = filename.split('.').pop()?.toLowerCase() ?? '';
  if (ext === 'wav' || mimeType === 'audio/wav' || mimeType === 'audio/wave') return 'wav';
  if (ext === 'mp3' || mimeType === 'audio/mpeg' || mimeType === 'audio/mp3') return 'mp3';
  if (ext === 'ogg' || mimeType === 'audio/ogg') return 'ogg';
  return null;
}

export function findUnusedAssetIds(
  assets: ProjectAssetMeta[],
  scenes: SceneData[]
): string[] {
  const referencedIds = new Set<string>();
  for (const scene of scenes) {
    for (const obj of scene.objects) {
      if (obj.type === 'sprite' && obj.sprite?.assetId) {
        referencedIds.add(obj.sprite.assetId);
      }
      if (obj.type === 'tilemap' && obj.tilemap?.assetId) {
        referencedIds.add(obj.tilemap.assetId);
      }
    }
    for (const mech of scene.mechanics ?? []) {
      for (const act of mech.actions) {
        const assetParam = act.parameters?.assetId ?? act.parameters?.asset;
        if (typeof assetParam === 'string' && assetParam) {
          referencedIds.add(assetParam);
        }
      }
    }
  }
  return assets.filter((a) => !referencedIds.has(a.id)).map((a) => a.id);
}
