import React from 'react';
import type { CameraState } from '../../engine/core/types';

interface StageRulersProps {
  camera: CameraState;
  viewportWidth: number;
  viewportHeight: number;
}

function chooseTickStep(zoom: number): number {
  const targetPixelSpacing = 80;
  const rawStep = targetPixelSpacing / Math.max(zoom, 0.1);
  const candidates = [16, 32, 64, 100, 128, 256, 512, 1024];
  for (const c of candidates) {
    if (c >= rawStep) return c;
  }
  return 1024;
}

export const StageRulers: React.FC<StageRulersProps> = ({
  camera,
  viewportWidth,
  viewportHeight,
}) => {
  if (viewportWidth <= 40 || viewportHeight <= 40) return null;

  const step = chooseTickStep(camera.zoom);
  const startStageX = Math.floor((-camera.x / camera.zoom) / step) * step;
  const endStageX = Math.ceil(((viewportWidth - camera.x) / camera.zoom) / step) * step;

  const startStageY = Math.floor((-camera.y / camera.zoom) / step) * step;
  const endStageY = Math.ceil(((viewportHeight - camera.y) / camera.zoom) / step) * step;

  const xTicks: Array<{ val: number; pos: number }> = [];
  for (let val = startStageX; val <= endStageX; val += step) {
    const pos = val * camera.zoom + camera.x;
    if (pos >= 18 && pos <= viewportWidth - 8) {
      xTicks.push({ val, pos });
    }
  }

  const yTicks: Array<{ val: number; pos: number }> = [];
  for (let val = startStageY; val <= endStageY; val += step) {
    const pos = val * camera.zoom + camera.y;
    if (pos >= 18 && pos <= viewportHeight - 8) {
      yTicks.push({ val, pos });
    }
  }

  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden select-none">
      {/* Esquina superior izquierda */}
      <div className="absolute left-0 top-0 z-10 h-5 w-5 border-b border-r border-[#2c2c34] bg-[#18181c]" />

      {/* Regla superior X */}
      <div className="absolute left-5 right-0 top-0 h-5 border-b border-[#2c2c34] bg-[#18181c]/90">
        {xTicks.map((t) => (
          <div
            key={t.val}
            className="absolute top-0 bottom-0 border-l border-[#383844]"
            style={{ left: `${t.pos - 20}px` }}
          >
            <span className="ml-1 font-mono text-[9px] tabular-nums text-zinc-500">
              {t.val}
            </span>
          </div>
        ))}
      </div>

      {/* Regla izquierda Y */}
      <div className="absolute bottom-0 left-0 top-5 w-5 border-r border-[#2c2c34] bg-[#18181c]/90">
        {yTicks.map((t) => (
          <div
            key={t.val}
            className="absolute left-0 right-0 border-t border-[#383844]"
            style={{ top: `${t.pos - 20}px` }}
          >
            <span className="block pl-0.5 pt-0.5 font-mono text-[8px] leading-none tabular-nums text-zinc-500">
              {t.val}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
};
