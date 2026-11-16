import type { SceneData } from '../../engine/core/types';
import type { AssetFormat, ProjectAssetMeta } from '../../project/models/project';

export const SUPPORTED_IMAGE_EXTENSIONS: AssetFormat[] = ['png', 'jpg', 'jpeg', 'webp', 'svg'];
export const SUPPORTED_AUDIO_EXTENSIONS: AssetFormat[] = [
  'wav',
  'mp3',
  'ogg',
  'm4a',
  'aac',
  'flac',
  'webm',
];

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
  if (ext === 'wav' || mimeType === 'audio/wav' || mimeType === 'audio/wave' || mimeType === 'audio/x-wav') return 'wav';
  if (ext === 'mp3' || mimeType === 'audio/mpeg' || mimeType === 'audio/mp3') return 'mp3';
  if (ext === 'ogg' || ext === 'oga' || mimeType === 'audio/ogg') return 'ogg';
  if (ext === 'm4a' || mimeType === 'audio/mp4' || mimeType === 'audio/x-m4a') return 'm4a';
  if (ext === 'aac' || mimeType === 'audio/aac') return 'aac';
  if (ext === 'flac' || mimeType === 'audio/flac') return 'flac';
  if (ext === 'webm' || mimeType === 'audio/webm') return 'webm';
  return null;
}

export function findUnusedAssetIds(
  assets: ProjectAssetMeta[],
  scenes: SceneData[]
): string[] {
  const referencedIds = new Set<string>();
  const audioConfigKeys = [
    'audioAssetId',
    'soundAssetId',
    'jumpSoundAssetId',
    'hitSoundAssetId',
    'fireSoundAssetId',
  ];

  for (const scene of scenes) {
    if (scene.backgroundMusic?.assetId) {
      referencedIds.add(scene.backgroundMusic.assetId);
    }
    for (const obj of scene.objects) {
      if (obj.type === 'sprite' && obj.sprite?.assetId) {
        referencedIds.add(obj.sprite.assetId);
      }
      if (obj.type === 'tilemap' && obj.tilemap?.assetId) {
        referencedIds.add(obj.tilemap.assetId);
      }
      if (obj.type === 'ui_button' && obj.uiButton?.clickSoundAssetId) {
        referencedIds.add(obj.uiButton.clickSoundAssetId);
      }
      for (const comp of obj.components ?? []) {
        const cfg = comp.config ?? {};
        for (const k of audioConfigKeys) {
          const val = cfg[k];
          if (typeof val === 'string' && val) {
            referencedIds.add(val);
          }
        }
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
