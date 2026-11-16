import { clamp } from '../../utils/format';
import type { CameraState, StageResolution } from '../core/types';

export const MIN_ZOOM = 0.1;
export const MAX_ZOOM = 5.0;

/**
 * Calcula el estado de cámara necesario para centrar y ajustar el escenario
 * dentro del área visible del viewport.
 */
export function fitCameraToViewport(
  viewportWidth: number,
  viewportHeight: number,
  stage: StageResolution,
  padding = 56
): CameraState {
  if (viewportWidth <= 0 || viewportHeight <= 0 || stage.width <= 0 || stage.height <= 0) {
    return { x: 40, y: 40, zoom: 0.75 };
  }

  const availW = Math.max(80, viewportWidth - padding * 2);
  const availH = Math.max(80, viewportHeight - padding * 2);
  const zoom = clamp(Math.min(availW / stage.width, availH / stage.height), MIN_ZOOM, 2.0);

  const x = Math.round((viewportWidth - stage.width * zoom) / 2);
  const y = Math.round((viewportHeight - stage.height * zoom) / 2);

  return { x, y, zoom };
}

/**
 * Calcula el nuevo estado de cámara al hacer zoom alrededor de un punto del viewport.
 */
export function zoomCameraAtPoint(
  camera: CameraState,
  nextZoomRaw: number,
  pivotScreenX: number,
  pivotScreenY: number
): CameraState {
  const nextZoom = clamp(nextZoomRaw, MIN_ZOOM, MAX_ZOOM);
  const worldX = (pivotScreenX - camera.x) / camera.zoom;
  const worldY = (pivotScreenY - camera.y) / camera.zoom;

  return {
    zoom: nextZoom,
    x: pivotScreenX - worldX * nextZoom,
    y: pivotScreenY - worldY * nextZoom,
  };
}
