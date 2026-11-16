import React from 'react';
import { OBJECT_TYPE_LABELS, type GameObjectData } from '../../engine/core/types';
import type { SaveStatus } from '../../storage/autosave/useAutosave';
import { formatTimeEs } from '../../utils/format';

interface BottomStatusBarProps {
  sceneName: string;
  stageWidth: number;
  stageHeight: number;
  zoom: number;
  objectCount: number;
  saveStatus: SaveStatus;
  lastSavedAt: number | null;
  selectedObjects: GameObjectData[];
  pointerCoords: { x: number; y: number } | null;
}

export const BottomStatusBar: React.FC<BottomStatusBarProps> = ({
  sceneName,
  stageWidth,
  stageHeight,
  zoom,
  objectCount,
  saveStatus,
  lastSavedAt,
  selectedObjects,
  pointerCoords,
}) => {
  const selectionText =
    selectedObjects.length === 0
      ? 'Sin selección'
      : selectedObjects.length === 1
        ? `${selectedObjects[0].name} (${OBJECT_TYPE_LABELS[selectedObjects[0].type]})`
        : `${selectedObjects.length} objetos seleccionados`;

  const saveLabel =
    saveStatus === 'saving'
      ? 'Guardando en IndexedDB...'
      : saveStatus === 'dirty'
        ? 'Cambios pendientes'
        : saveStatus === 'error'
          ? 'Error al guardar'
          : lastSavedAt
            ? `Guardado (${formatTimeEs(lastSavedAt)})`
            : 'Guardado localmente';

  const saveColor =
    saveStatus === 'error'
      ? 'text-red-400'
      : saveStatus === 'dirty' || saveStatus === 'saving'
        ? 'text-amber-400'
        : 'text-emerald-400';

  return (
    <footer className="flex h-7 w-full shrink-0 items-center justify-between border-t border-[#2e2e36] bg-[#18181c] px-3 text-[11px] text-zinc-400 select-none">
      <div className="flex items-center gap-3 min-w-0">
        <span className="font-medium text-zinc-200 truncate">Escena: {sceneName}</span>
        <span className="text-zinc-600" aria-hidden="true">·</span>
        <span className="font-mono tabular-nums">
          {stageWidth} × {stageHeight}
        </span>
        <span className="text-zinc-600" aria-hidden="true">·</span>
        <span className="font-mono tabular-nums">
          Zoom: {Math.round(zoom * 100)}%
        </span>
        <span className="text-zinc-600" aria-hidden="true">·</span>
        <span className="tabular-nums">
          {objectCount} {objectCount === 1 ? 'objeto' : 'objetos'}
        </span>
        {pointerCoords && (
          <>
            <span className="text-zinc-600 hidden md:inline" aria-hidden="true">·</span>
            <span className="hidden md:inline font-mono tabular-nums text-zinc-400">
              Cursor: {Math.round(pointerCoords.x)}, {Math.round(pointerCoords.y)}
            </span>
          </>
        )}
      </div>

      <div className="flex items-center gap-3 shrink-0">
        <span className="truncate max-w-[240px] text-zinc-300">{selectionText}</span>
        <span className="text-zinc-600" aria-hidden="true">·</span>
        <span className={`font-medium ${saveColor}`}>{saveLabel}</span>
      </div>
    </footer>
  );
};
