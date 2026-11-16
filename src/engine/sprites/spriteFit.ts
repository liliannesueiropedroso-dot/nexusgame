import type { SpriteCropRect, SpriteFitMode } from '../core/types';

export interface SpriteRenderLayout {
  /** Posición local del sprite relativa al origen del GameObject */
  offsetX: number;
  offsetY: number;
  /** Tamaño visual al que debe dibujarse el textureFrame */
  drawWidth: number;
  drawHeight: number;
  /** Región de recorte sobre la textura fuente (en píxeles de textura) */
  sourceCrop: SpriteCropRect | null;
  /** Indica si debe aplicarse máscara rectangular de marco (width x height) */
  needsClipMask: boolean;
  /** Marco visual del objeto (para gizmos/máscaras) */
  frameLeft: number;
  frameTop: number;
  frameWidth: number;
  frameHeight: number;
  /** Modo de mosaico si fitMode === 'tile' */
  tiled: boolean;
}

/**
 * Calcula la geometría exacta de renderizado de un Sprite según su modo de ajuste (fitMode).
 * Garantiza que en modos 'original' y 'contain' ninguna imagen se recorte ni deforme accidentalmente.
 */
export function computeSpriteRenderLayout(params: {
  boxWidth: number;
  boxHeight: number;
  anchorX: number;
  anchorY: number;
  textureWidth: number;
  textureHeight: number;
  fitMode?: SpriteFitMode;
  cropRect?: SpriteCropRect;
}): SpriteRenderLayout {
  const boxW = Math.max(1, params.boxWidth);
  const boxH = Math.max(1, params.boxHeight);
  const texW = Math.max(1, params.textureWidth);
  const texH = Math.max(1, params.textureHeight);
  const mode: SpriteFitMode = params.fitMode ?? 'contain';

  const frameLeft = -boxW * params.anchorX;
  const frameTop = -boxH * params.anchorY;
  const centerX = frameLeft + boxW * 0.5;
  const centerY = frameTop + boxH * 0.5;

  if (mode === 'original') {
    return {
      offsetX: (0.5 - params.anchorX) * (boxW - texW) * 0,
      offsetY: (0.5 - params.anchorY) * (boxH - texH) * 0,
      drawWidth: texW,
      drawHeight: texH,
      sourceCrop: null,
      needsClipMask: false,
      frameLeft: -texW * params.anchorX,
      frameTop: -texH * params.anchorY,
      frameWidth: texW,
      frameHeight: texH,
      tiled: false,
    };
  }

  if (mode === 'contain') {
    const scale = Math.min(boxW / texW, boxH / texH);
    const drawW = Math.max(1, texW * scale);
    const drawH = Math.max(1, texH * scale);
    return {
      offsetX: centerX - (0.5 - params.anchorX) * drawW,
      offsetY: centerY - (0.5 - params.anchorY) * drawH,
      drawWidth: drawW,
      drawHeight: drawH,
      sourceCrop: null,
      needsClipMask: false,
      frameLeft,
      frameTop,
      frameWidth: boxW,
      frameHeight: boxH,
      tiled: false,
    };
  }

  if (mode === 'cover') {
    const scale = Math.max(boxW / texW, boxH / texH);
    const drawW = Math.max(1, texW * scale);
    const drawH = Math.max(1, texH * scale);
    return {
      offsetX: centerX - (0.5 - params.anchorX) * drawW,
      offsetY: centerY - (0.5 - params.anchorY) * drawH,
      drawWidth: drawW,
      drawHeight: drawH,
      sourceCrop: null,
      needsClipMask: true,
      frameLeft,
      frameTop,
      frameWidth: boxW,
      frameHeight: boxH,
      tiled: false,
    };
  }

  if (mode === 'crop' && params.cropRect) {
    const cx = Math.max(0, Math.min(texW - 1, Math.floor(params.cropRect.x)));
    const cy = Math.max(0, Math.min(texH - 1, Math.floor(params.cropRect.y)));
    const cw = Math.max(1, Math.min(texW - cx, Math.floor(params.cropRect.width)));
    const ch = Math.max(1, Math.min(texH - cy, Math.floor(params.cropRect.height)));
    const scale = Math.min(boxW / cw, boxH / ch);
    const drawW = Math.max(1, cw * scale);
    const drawH = Math.max(1, ch * scale);
    return {
      offsetX: centerX - (0.5 - params.anchorX) * drawW,
      offsetY: centerY - (0.5 - params.anchorY) * drawH,
      drawWidth: drawW,
      drawHeight: drawH,
      sourceCrop: { x: cx, y: cy, width: cw, height: ch },
      needsClipMask: false,
      frameLeft,
      frameTop,
      frameWidth: boxW,
      frameHeight: boxH,
      tiled: false,
    };
  }

  if (mode === 'tile') {
    return {
      offsetX: 0,
      offsetY: 0,
      drawWidth: boxW,
      drawHeight: boxH,
      sourceCrop: null,
      needsClipMask: false,
      frameLeft,
      frameTop,
      frameWidth: boxW,
      frameHeight: boxH,
      tiled: true,
    };
  }

  // 'stretch'
  return {
    offsetX: 0,
    offsetY: 0,
    drawWidth: boxW,
    drawHeight: boxH,
    sourceCrop: null,
    needsClipMask: false,
    frameLeft,
    frameTop,
    frameWidth: boxW,
    frameHeight: boxH,
    tiled: false,
  };
}
