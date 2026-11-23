import React, { useEffect, useState } from 'react';
import { Crosshair, Plus, Trash2, X } from 'lucide-react';
import type { SpriteImagePoint } from '../../engine/core/types';
import { createId } from '../../utils/id';

interface ImagePointsModalProps {
  open: boolean;
  objectName: string;
  imageUrl: string | null;
  imageWidth: number;
  imageHeight: number;
  points: SpriteImagePoint[];
  onClose: () => void;
  onSave: (points: SpriteImagePoint[]) => void;
}

export const ImagePointsModal: React.FC<ImagePointsModalProps> = ({
  open,
  objectName,
  imageUrl,
  imageWidth,
  imageHeight,
  points,
  onClose,
  onSave,
}) => {
  const [draft, setDraft] = useState<SpriteImagePoint[]>(points);
  const [selectedId, setSelectedId] = useState<string | null>(points[0]?.id ?? null);

  useEffect(() => {
    if (open) {
      setDraft(points.map((p) => ({ ...p })));
      setSelectedId(points[0]?.id ?? null);
    }
  }, [open, points]);

  if (!open) return null;

  const selected = draft.find((p) => p.id === selectedId) ?? null;

  const handleCanvasClick = (e: React.MouseEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return;
    const nx = Math.max(0, Math.min(1, Number(((e.clientX - rect.left) / rect.width).toFixed(3))));
    const ny = Math.max(0, Math.min(1, Number(((e.clientY - rect.top) / rect.height).toFixed(3))));

    if (selected) {
      setDraft((prev) =>
        prev.map((p) => (p.id === selected.id ? { ...p, nx, ny } : p))
      );
      return;
    }

    const newPt: SpriteImagePoint = {
      id: createId('ip'),
      name: `punto_${draft.length + 1}`,
      nx,
      ny,
    };
    setDraft((prev) => [...prev, newPt]);
    setSelectedId(newPt.id);
  };

  const addDefaultPoint = () => {
    const newPt: SpriteImagePoint = {
      id: createId('ip'),
      name: draft.length === 0 ? 'arma' : `punto_${draft.length + 1}`,
      nx: 0.5,
      ny: 0.5,
    };
    setDraft((prev) => [...prev, newPt]);
    setSelectedId(newPt.id);
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4"
      role="dialog"
      aria-modal="true"
      aria-label="Editor visual de puntos de imagen"
    >
      <div className="flex w-full max-w-3xl flex-col overflow-hidden rounded-lg border border-[#343440] bg-[#191920] shadow-2xl">
        <header className="flex items-center justify-between border-b border-[#2c2c36] px-4 py-3">
          <div className="flex items-center gap-2">
            <Crosshair className="h-4 w-4 text-cyan-400" />
            <div>
              <h3 className="text-sm font-semibold text-zinc-100">
                Puntos de Imagen · {objectName}
              </h3>
              <p className="text-[11px] text-zinc-400">
                Haz clic en el sprite para colocar o mover puntos (boca de arma, pies, anclajes). Úsalos con{' '}
                <code className="font-mono text-cyan-300">self.getImagePoint(&quot;arma&quot;)</code>.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Cerrar puntos de imagen"
            className="rounded p-1 text-zinc-400 hover:bg-[#2a2a34] hover:text-white"
          >
            <X className="h-4 w-4" />
          </button>
        </header>

        <div className="grid grid-cols-1 gap-4 p-4 md:grid-cols-[1fr_250px]">
          <div className="flex flex-col items-center justify-center rounded border border-[#2d2d37] bg-[#111115] p-3">
            <div
              onClick={handleCanvasClick}
              title="Haz clic para mover el punto seleccionado o crear uno nuevo"
              className="relative flex cursor-crosshair items-center justify-center overflow-hidden rounded border border-dashed border-[#3b3b4a] bg-[#181820]"
              style={{
                width: Math.min(400, Math.max(200, imageWidth * 2)),
                aspectRatio: `${Math.max(1, imageWidth)} / ${Math.max(1, imageHeight)}`,
                backgroundImage:
                  'linear-gradient(45deg, #1b1b24 25%, transparent 25%), linear-gradient(-45deg, #1b1b24 25%, transparent 25%), linear-gradient(45deg, transparent 75%, #1b1b24 75%), linear-gradient(-45deg, transparent 75%, #1b1b24 75%)',
                backgroundSize: '16px 16px',
                backgroundPosition: '0 0, 0 8px, 8px -8px, -8px 0px',
              }}
            >
              {imageUrl ? (
                <img
                  src={imageUrl}
                  alt={objectName}
                  draggable={false}
                  className="pointer-events-none h-full w-full object-contain select-none"
                />
              ) : (
                <span className="pointer-events-none text-xs text-zinc-500">
                  Sin imagen cargada ({imageWidth}×{imageHeight})
                </span>
              )}

              {draft.map((pt) => {
                const active = pt.id === selectedId;
                return (
                  <button
                    key={pt.id}
                    type="button"
                    onClick={(ev) => {
                      ev.stopPropagation();
                      setSelectedId(pt.id);
                    }}
                    style={{
                      left: `${pt.nx * 100}%`,
                      top: `${pt.ny * 100}%`,
                    }}
                    className={`absolute -translate-x-1/2 -translate-y-1/2 rounded-full border-2 p-1 transition-transform ${
                      active
                        ? 'z-20 scale-125 border-white bg-cyan-500 shadow-[0_0_10px_rgba(34,211,238,0.9)]'
                        : 'z-10 border-amber-300 bg-amber-500/80 hover:scale-110'
                    }`}
                    title={`${pt.name} (${pt.nx}, ${pt.ny})`}
                  >
                    <span className="pointer-events-none absolute -top-5 left-1/2 -translate-x-1/2 rounded bg-black/85 px-1.5 py-0.5 font-mono text-[9px] whitespace-nowrap text-zinc-100">
                      {pt.name}
                    </span>
                  </button>
                );
              })}
            </div>
            <div className="mt-2 text-[10px] text-zinc-400">
              {selected
                ? `Editando "${selected.name}" — haz clic sobre el sprite para reubicar o deselecciona para añadir otro.`
                : 'Haz clic sobre la imagen para añadir un nuevo punto de imagen.'}
            </div>
          </div>

          <div className="flex flex-col gap-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-zinc-200">
                Puntos ({draft.length})
              </span>
              <button
                type="button"
                onClick={addDefaultPoint}
                className="inline-flex items-center gap-1 rounded bg-cyan-600 px-2 py-1 text-[11px] font-semibold text-white hover:bg-cyan-500"
              >
                <Plus className="h-3 w-3" />
                <span>Nuevo</span>
              </button>
            </div>

            {selectedId && (
              <button
                type="button"
                onClick={() => setSelectedId(null)}
                className="rounded border border-[#343440] bg-[#22222a] px-2 py-1 text-[10px] text-zinc-300 hover:bg-[#2c2c38]"
              >
                Deseleccionar (próximo clic crea punto nuevo)
              </button>
            )}

            <div className="max-h-72 flex-1 space-y-1.5 overflow-y-auto pr-1">
              {draft.length === 0 ? (
                <div className="rounded border border-dashed border-[#32323c] p-3 text-center text-[11px] text-zinc-500">
                  Ningún punto definido aún. Haz clic en la imagen o pulsa Nuevo.
                </div>
              ) : (
                draft.map((pt) => {
                  const isSel = pt.id === selectedId;
                  return (
                    <div
                      key={pt.id}
                      onClick={() => setSelectedId(pt.id)}
                      className={`cursor-pointer space-y-1.5 rounded border p-2 text-xs ${
                        isSel
                          ? 'border-cyan-500/70 bg-cyan-500/10'
                          : 'border-[#2d2d37] bg-[#141418]'
                      }`}
                    >
                      <div className="flex items-center gap-1.5">
                        <input
                          type="text"
                          aria-label="Nombre del punto de imagen"
                          value={pt.name}
                          onChange={(e) =>
                            setDraft((prev) =>
                              prev.map((x) =>
                                x.id === pt.id ? { ...x, name: e.target.value } : x
                              )
                            )
                          }
                          className="min-w-0 flex-1 rounded border border-[#32323c] bg-[#101014] px-1.5 py-0.5 font-mono text-[11px] text-zinc-100"
                        />
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            setDraft((prev) => prev.filter((x) => x.id !== pt.id));
                            if (selectedId === pt.id) setSelectedId(null);
                          }}
                          title="Eliminar punto"
                          className="p-0.5 text-zinc-500 hover:text-red-400"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                      <div className="grid grid-cols-2 gap-1.5 font-mono text-[10px] text-zinc-400">
                        <label className="flex items-center gap-1">
                          <span>X:</span>
                          <input
                            type="number"
                            min={0}
                            max={1}
                            step={0.01}
                            value={pt.nx}
                            onChange={(e) =>
                              setDraft((prev) =>
                                prev.map((x) =>
                                  x.id === pt.id
                                    ? { ...x, nx: Math.max(0, Math.min(1, Number(e.target.value) || 0)) }
                                    : x
                                )
                              )
                            }
                            className="w-full rounded border border-[#32323c] bg-[#101014] px-1 py-0.5 text-zinc-200"
                          />
                        </label>
                        <label className="flex items-center gap-1">
                          <span>Y:</span>
                          <input
                            type="number"
                            min={0}
                            max={1}
                            step={0.01}
                            value={pt.ny}
                            onChange={(e) =>
                              setDraft((prev) =>
                                prev.map((x) =>
                                  x.id === pt.id
                                    ? { ...x, ny: Math.max(0, Math.min(1, Number(e.target.value) || 0)) }
                                    : x
                                )
                              )
                            }
                            className="w-full rounded border border-[#32323c] bg-[#101014] px-1 py-0.5 text-zinc-200"
                          />
                        </label>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </div>

        <footer className="flex items-center justify-end gap-2 border-t border-[#2c2c36] bg-[#141418] px-4 py-2.5">
          <button
            type="button"
            onClick={onClose}
            className="rounded border border-[#343440] px-3 py-1 text-xs text-zinc-300 hover:bg-[#262630]"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={() => {
              onSave(draft);
              onClose();
            }}
            className="rounded bg-cyan-600 px-3.5 py-1 text-xs font-semibold text-white hover:bg-cyan-500"
          >
            Guardar puntos
          </button>
        </footer>
      </div>
    </div>
  );
};
