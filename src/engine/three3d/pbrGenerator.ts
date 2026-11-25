import type { Mesh3DProperties, PbrMaterialPresetId } from '../core/types';

export interface PbrGeneratedPixelBuffers {
  width: number;
  height: number;
  normalRgba: Uint8ClampedArray;
  roughnessRgba: Uint8ClampedArray;
}

export interface PbrSobelOptions {
  /** Intensidad de relieve del filtro Sobel (por defecto 2.4) */
  strength?: number;
  /** Invertir luminosidad al generar rugosidad (útil para superficies húmedas/brillantes) */
  invertRoughness?: boolean;
  /** Rugosidad base media [0..1] */
  baseRoughness?: number;
}

export interface PbrMaterialPresetSpec {
  id: PbrMaterialPresetId;
  label: string;
  description: string;
  patch: Partial<Mesh3DProperties>;
}

export const PBR_MATERIAL_PRESETS: PbrMaterialPresetSpec[] = [
  {
    id: 'car_paint',
    label: 'Pintura de Auto',
    description: 'Laca automotriz metálica con barniz Clearcoat brillante',
    patch: {
      materialPreset: 'car_paint',
      color: '#dc2626',
      metalness: 0.72,
      roughness: 0.24,
      clearcoat: 1.0,
      clearcoatRoughness: 0.08,
      transmission: 0,
      emissive: '#000000',
      emissiveIntensity: 0,
    },
  },
  {
    id: 'crystal_water',
    label: 'Agua Cristalina',
    description: 'Superficie dieléctrica especular con reflejos frescos',
    patch: {
      materialPreset: 'crystal_water',
      color: '#38bdf8',
      metalness: 0.05,
      roughness: 0.06,
      clearcoat: 0.9,
      clearcoatRoughness: 0.04,
      transmission: 0.65,
      emissive: '#082f49',
      emissiveIntensity: 0.15,
    },
  },
  {
    id: 'worn_metal',
    label: 'Metal Desgastado',
    description: 'Acero cepillado con pátina mate y reflejos anchos',
    patch: {
      materialPreset: 'worn_metal',
      color: '#64748b',
      metalness: 0.88,
      roughness: 0.44,
      clearcoat: 0.1,
      clearcoatRoughness: 0.4,
      transmission: 0,
      emissive: '#000000',
      emissiveIntensity: 0,
    },
  },
  {
    id: 'rock',
    label: 'Roca Natural',
    description: 'Superficie mineral mate sin metalicidad',
    patch: {
      materialPreset: 'rock',
      color: '#78716c',
      metalness: 0.02,
      roughness: 0.92,
      clearcoat: 0,
      clearcoatRoughness: 0.5,
      transmission: 0,
      emissive: '#000000',
      emissiveIntensity: 0,
    },
  },
  {
    id: 'glass',
    label: 'Cristal / Vidrio',
    description: 'Refracción limpia con especular nítido y clearcoat',
    patch: {
      materialPreset: 'glass',
      color: '#e0f2fe',
      metalness: 0.0,
      roughness: 0.05,
      clearcoat: 1.0,
      clearcoatRoughness: 0.03,
      transmission: 0.88,
      emissive: '#000000',
      emissiveIntensity: 0,
    },
  },
  {
    id: 'neon',
    label: 'Neón Emisivo',
    description: 'Cian eléctrico autoiluminado ideal para sci-fi y propulsores',
    patch: {
      materialPreset: 'neon',
      color: '#22d3ee',
      metalness: 0.15,
      roughness: 0.2,
      clearcoat: 0.6,
      clearcoatRoughness: 0.1,
      transmission: 0,
      emissive: '#06b6d4',
      emissiveIntensity: 2.2,
    },
  },
];

/**
 * Genera mapas reales de Normal (filtro Sobel 3x3 en espacio tangente) y Rugosidad
 * a partir de un buffer RGBA de textura Albedo en milisegundos sin dependencias externas.
 */
export function generatePbrMapsFromRgba(
  rgba: Uint8ClampedArray,
  width: number,
  height: number,
  options?: PbrSobelOptions
): PbrGeneratedPixelBuffers {
  const w = Math.max(1, Math.floor(width));
  const h = Math.max(1, Math.floor(height));
  const strength = Math.max(0.1, options?.strength ?? 2.4);
  const baseRough = Math.max(0.05, Math.min(0.95, options?.baseRoughness ?? 0.55));
  const invertRough = Boolean(options?.invertRoughness);

  const lum = new Float32Array(w * h);
  for (let i = 0; i < w * h; i++) {
    const o = i * 4;
    const r = rgba[o] ?? 128;
    const g = rgba[o + 1] ?? 128;
    const b = rgba[o + 2] ?? 128;
    lum[i] = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  }

  const sampleLum = (x: number, y: number): number => {
    const cx = Math.max(0, Math.min(w - 1, x));
    const cy = Math.max(0, Math.min(h - 1, y));
    return lum[cy * w + cx];
  };

  const normalRgba = new Uint8ClampedArray(w * h * 4);
  const roughnessRgba = new Uint8ClampedArray(w * h * 4);

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const tl = sampleLum(x - 1, y - 1);
      const tc = sampleLum(x, y - 1);
      const tr = sampleLum(x + 1, y - 1);
      const ml = sampleLum(x - 1, y);
      const mc = sampleLum(x, y);
      const mr = sampleLum(x + 1, y);
      const bl = sampleLum(x - 1, y + 1);
      const bc = sampleLum(x, y + 1);
      const br = sampleLum(x + 1, y + 1);

      const gx = -tl + tr - 2 * ml + 2 * mr - bl + br;
      const gy = -tl - 2 * tc - tr + bl + 2 * bc + br;

      let nx = -gx * strength;
      let ny = -gy * strength;
      let nz = 1.0;
      const len = Math.hypot(nx, ny, nz) || 1;
      nx /= len;
      ny /= len;
      nz /= len;

      const idx = (y * w + x) * 4;
      normalRgba[idx] = Math.max(0, Math.min(255, Math.round((nx * 0.5 + 0.5) * 255)));
      normalRgba[idx + 1] = Math.max(0, Math.min(255, Math.round((ny * 0.5 + 0.5) * 255)));
      normalRgba[idx + 2] = Math.max(0, Math.min(255, Math.round((nz * 0.5 + 0.5) * 255)));
      normalRgba[idx + 3] = 255;

      // Mapa de rugosidad: grietas oscuras más rugosas, crestas iluminadas algo más lisas + micro-contraste Sobel
      const edgeMag = Math.min(1, Math.hypot(gx, gy) * 1.35);
      const lumaTerm = invertRough ? mc : 1 - mc;
      const roughVal = Math.max(
        0.08,
        Math.min(0.96, baseRough * 0.55 + lumaTerm * 0.35 + edgeMag * 0.2)
      );
      const rByte = Math.round(roughVal * 255);
      roughnessRgba[idx] = rByte;
      roughnessRgba[idx + 1] = rByte;
      roughnessRgba[idx + 2] = rByte;
      roughnessRgba[idx + 3] = 255;
    }
  }

  return { width: w, height: h, normalRgba, roughnessRgba };
}

function canvasToPngBlob(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (b) => (b ? resolve(b) : reject(new Error('No se pudo codificar el mapa PBR en PNG'))),
      'image/png'
    );
  });
}

function loadImageElementFromBlob(blob: Blob): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(blob);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('No se pudo decodificar la imagen Albedo para generar PBR'));
    };
    img.src = url;
  });
}

/**
 * Genera en navegador los PNG reales de Normal Map y Roughness Map a partir de un Blob Albedo.
 */
export async function generatePbrAssetBlobsFromImage(
  albedoBlob: Blob,
  baseName: string,
  options?: PbrSobelOptions
): Promise<{
  normalBlob: Blob;
  roughnessBlob: Blob;
  normalFilename: string;
  roughnessFilename: string;
  width: number;
  height: number;
}> {
  const img = await loadImageElementFromBlob(albedoBlob);
  const maxDim = 512;
  const scale = Math.min(1, maxDim / Math.max(1, img.naturalWidth || img.width, img.naturalHeight || img.height));
  const w = Math.max(8, Math.round((img.naturalWidth || img.width) * scale));
  const h = Math.max(8, Math.round((img.naturalHeight || img.height) * scale));

  const srcCanvas = document.createElement('canvas');
  srcCanvas.width = w;
  srcCanvas.height = h;
  const sCtx = srcCanvas.getContext('2d');
  if (!sCtx) throw new Error('Contexto 2D no disponible para filtro Sobel');
  sCtx.drawImage(img, 0, 0, w, h);
  const srcImg = sCtx.getImageData(0, 0, w, h);

  const maps = generatePbrMapsFromRgba(srcImg.data, w, h, options);

  const nCanvas = document.createElement('canvas');
  nCanvas.width = w;
  nCanvas.height = h;
  const nCtx = nCanvas.getContext('2d')!;
  nCtx.putImageData(new ImageData(new Uint8ClampedArray(maps.normalRgba), w, h), 0, 0);

  const rCanvas = document.createElement('canvas');
  rCanvas.width = w;
  rCanvas.height = h;
  const rCtx = rCanvas.getContext('2d')!;
  rCtx.putImageData(new ImageData(new Uint8ClampedArray(maps.roughnessRgba), w, h), 0, 0);

  const cleanBase = baseName.replace(/\.[^.]+$/, '').replace(/[^a-zA-Z0-9_-]+/g, '_') || 'textura';
  const [normalBlob, roughnessBlob] = await Promise.all([
    canvasToPngBlob(nCanvas),
    canvasToPngBlob(rCanvas),
  ]);

  return {
    normalBlob,
    roughnessBlob,
    normalFilename: `${cleanBase}_normal.png`,
    roughnessFilename: `${cleanBase}_roughness.png`,
    width: w,
    height: h,
  };
}
