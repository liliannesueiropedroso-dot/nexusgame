import type { SmartColliderRect, SpriteCropRect } from '../core/types';

export interface ExtractAlphaRectsOptions {
  alphaThreshold?: number;
  gridSize?: number;
  cellStartX?: number;
  cellStartY?: number;
  cellWidth?: number;
  cellHeight?: number;
}

/**
 * Extrae sub-rectángulos normalizados (0..1) que ajustan la silueta opaca de una imagen PNG RGBA.
 * Evita que el jugador colisione con márgenes o huecos transparentes del sprite.
 */
export function extractAlphaSubRectsFromRgba(
  rgba: Uint8ClampedArray | Uint8Array,
  imageWidth: number,
  imageHeight: number,
  opts: ExtractAlphaRectsOptions = {}
): SmartColliderRect[] {
  if (imageWidth <= 0 || imageHeight <= 0 || rgba.length < imageWidth * imageHeight * 4) {
    return [{ x: 0, y: 0, w: 1, h: 1 }];
  }

  const threshold = Math.max(1, Math.min(254, Math.round(opts.alphaThreshold ?? 24)));
  const startX = Math.max(0, Math.floor(opts.cellStartX ?? 0));
  const startY = Math.max(0, Math.floor(opts.cellStartY ?? 0));
  const regionW = Math.max(1, Math.min(imageWidth - startX, Math.floor(opts.cellWidth ?? imageWidth)));
  const regionH = Math.max(1, Math.min(imageHeight - startY, Math.floor(opts.cellHeight ?? imageHeight)));

  const requestedGrid = Math.max(4, Math.min(32, Math.round(opts.gridSize ?? 20)));
  const cols = Math.max(1, Math.min(regionW, requestedGrid));
  const rows = Math.max(1, Math.min(regionH, requestedGrid));

  // Muestrear qué celdas de la cuadrícula tienen al menos un píxel suficientemente opaco
  const solidGrid: boolean[][] = [];
  let anySolid = false;

  for (let r = 0; r < rows; r++) {
    const rowArr: boolean[] = [];
    const py0 = startY + Math.floor((r * regionH) / rows);
    const py1 = Math.max(py0 + 1, startY + Math.floor(((r + 1) * regionH) / rows));
    for (let c = 0; c < cols; c++) {
      const px0 = startX + Math.floor((c * regionW) / cols);
      const px1 = Math.max(px0 + 1, startX + Math.floor(((c + 1) * regionW) / cols));
      let solid = false;
      for (let y = py0; y < py1 && !solid; y++) {
        const rowOffset = y * imageWidth;
        for (let x = px0; x < px1; x++) {
          const alpha = rgba[(rowOffset + x) * 4 + 3];
          if (alpha >= threshold) {
            solid = true;
            anySolid = true;
            break;
          }
        }
      }
      rowArr.push(solid);
    }
    solidGrid.push(rowArr);
  }

  if (!anySolid) {
    return [{ x: 0, y: 0, w: 1, h: 1 }];
  }

  // Fusión greedy por filas -> tramos horizontales -> fusión vertical de tramos con mismos límites
  interface GridRect {
    c0: number;
    c1: number;
    r0: number;
    r1: number;
  }

  let activeRects: GridRect[] = [];
  const completedRects: GridRect[] = [];

  for (let r = 0; r < rows; r++) {
    const runs: Array<{ c0: number; c1: number }> = [];
    let c = 0;
    while (c < cols) {
      if (!solidGrid[r][c]) {
        c++;
        continue;
      }
      const c0 = c;
      while (c < cols && solidGrid[r][c]) c++;
      runs.push({ c0, c1: c });
    }

    const nextActive: GridRect[] = [];
    const matchedRunIndices = new Set<number>();

    for (const active of activeRects) {
      const matchIdx = runs.findIndex(
        (run, idx) => !matchedRunIndices.has(idx) && run.c0 === active.c0 && run.c1 === active.c1
      );
      if (matchIdx >= 0) {
        matchedRunIndices.add(matchIdx);
        nextActive.push({ ...active, r1: r + 1 });
      } else {
        completedRects.push(active);
      }
    }

    for (let i = 0; i < runs.length; i++) {
      if (!matchedRunIndices.has(i)) {
        nextActive.push({ c0: runs[i].c0, c1: runs[i].c1, r0: r, r1: r + 1 });
      }
    }

    activeRects = nextActive;
  }

  completedRects.push(...activeRects);

  return completedRects.map((rect) => ({
    x: Number((rect.c0 / cols).toFixed(4)),
    y: Number((rect.r0 / rows).toFixed(4)),
    w: Number(((rect.c1 - rect.c0) / cols).toFixed(4)),
    h: Number(((rect.r1 - rect.r0) / rows).toFixed(4)),
  }));
}

const blobSmartRectCache = new WeakMap<Blob, Map<string, SmartColliderRect[]>>();

export async function computeSmartColliderRectsFromBlob(
  blob: Blob,
  opts: {
    alphaThreshold?: number;
    gridSize?: number;
    cropRect?: SpriteCropRect;
    animCols?: number;
    animRows?: number;
  } = {}
): Promise<SmartColliderRect[]> {
  const threshold = Math.max(1, Math.min(254, Math.round(opts.alphaThreshold ?? 24)));
  const gridSize = Math.max(4, Math.min(32, Math.round(opts.gridSize ?? 20)));
  const cacheKey = `${threshold}:${gridSize}:${opts.animCols ?? 1}:${opts.animRows ?? 1}:${
    opts.cropRect
      ? `${opts.cropRect.x},${opts.cropRect.y},${opts.cropRect.width},${opts.cropRect.height}`
      : 'full'
  }`;

  const existingMap = blobSmartRectCache.get(blob);
  const cached = existingMap?.get(cacheKey);
  if (cached) return cached;

  if (typeof document === 'undefined') {
    return [{ x: 0, y: 0, w: 1, h: 1 }];
  }

  let width = 0;
  let height = 0;
  let rgba: Uint8ClampedArray | null = null;

  try {
    const url = URL.createObjectURL(blob);
    try {
      const img = await new Promise<HTMLImageElement>((resolve, reject) => {
        const el = new Image();
        el.onload = () => resolve(el);
        el.onerror = () => reject(new Error('No se pudo cargar imagen para colisionador PNG'));
        el.src = url;
      });
      width = img.naturalWidth || img.width;
      height = img.naturalHeight || img.height;
      const maxDim = 256;
      const scale = Math.min(1, maxDim / Math.max(1, width, height));
      const drawW = Math.max(1, Math.round(width * scale));
      const drawH = Math.max(1, Math.round(height * scale));
      const canvas = document.createElement('canvas');
      canvas.width = drawW;
      canvas.height = drawH;
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.clearRect(0, 0, drawW, drawH);
        ctx.drawImage(img, 0, 0, drawW, drawH);
        const imageData = ctx.getImageData(0, 0, drawW, drawH);
        rgba = imageData.data;

        let cellStartX = 0;
        let cellStartY = 0;
        let cellWidth = drawW;
        let cellHeight = drawH;
        if (opts.cropRect && opts.cropRect.width > 0 && opts.cropRect.height > 0 && width > 0 && height > 0) {
          cellStartX = Math.round(opts.cropRect.x * scale);
          cellStartY = Math.round(opts.cropRect.y * scale);
          cellWidth = Math.max(1, Math.round(opts.cropRect.width * scale));
          cellHeight = Math.max(1, Math.round(opts.cropRect.height * scale));
        } else if ((opts.animCols ?? 1) > 1 || (opts.animRows ?? 1) > 1) {
          cellWidth = Math.max(1, Math.floor(drawW / Math.max(1, opts.animCols ?? 1)));
          cellHeight = Math.max(1, Math.floor(drawH / Math.max(1, opts.animRows ?? 1)));
        }

        const rects = extractAlphaSubRectsFromRgba(rgba, drawW, drawH, {
          alphaThreshold: threshold,
          gridSize,
          cellStartX,
          cellStartY,
          cellWidth,
          cellHeight,
        });
        let map = existingMap;
        if (!map) {
          map = new Map();
          blobSmartRectCache.set(blob, map);
        }
        map.set(cacheKey, rects);
        return rects;
      }
    } finally {
      URL.revokeObjectURL(url);
    }
  } catch {
    // Fallback sólido completo si el navegador falla al leer píxeles
  }

  return [{ x: 0, y: 0, w: 1, h: 1 }];
}
