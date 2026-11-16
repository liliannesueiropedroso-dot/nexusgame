import React, { useEffect, useState } from 'react';
import { Film, Plus, Trash2 } from 'lucide-react';
import type {
  GameObjectData,
  TweenEasing,
  TweenKeyframeTrack,
  TweenProperty,
} from '../../engine/core/types';
import { evaluateEasing } from '../../engine/runtime/behaviorRuntime';
import { createId } from '../../utils/id';

interface SceneAnimatorPanelProps {
  objects: GameObjectData[];
  selectedObjectId?: string | null;
  onUpdateObject?: (id: string, updater: (obj: GameObjectData) => GameObjectData) => void;
  onSelectObjectById: (id: string) => void;
}

const PROPERTY_OPTIONS: Array<{ value: TweenProperty; label: string }> = [
  { value: 'y', label: 'Posición Y' },
  { value: 'x', label: 'Posición X' },
  { value: 'rotation', label: 'Rotación (°)' },
  { value: 'scaleX', label: 'Escala X' },
  { value: 'scaleY', label: 'Escala Y' },
  { value: 'opacity', label: 'Opacidad (0..1)' },
];

const EASING_OPTIONS: Array<{ value: TweenEasing; label: string }> = [
  { value: 'linear', label: 'Lineal' },
  { value: 'easeIn', label: 'Acelerar (Ease In)' },
  { value: 'easeOut', label: 'Frenar (Ease Out)' },
  { value: 'easeInOut', label: 'Suave (Ease In-Out)' },
  { value: 'bounce', label: 'Rebote (Bounce)' },
];

export const SceneAnimatorPanel: React.FC<SceneAnimatorPanelProps> = ({
  objects,
  selectedObjectId,
  onUpdateObject,
  onSelectObjectById,
}) => {
  const [targetId, setTargetId] = useState<string>(
    selectedObjectId ?? objects[0]?.id ?? ''
  );
  const [previewPhase, setPreviewPhase] = useState(0);

  useEffect(() => {
    if (selectedObjectId && objects.some((o) => o.id === selectedObjectId)) {
      setTargetId(selectedObjectId);
    } else if (!objects.some((o) => o.id === targetId)) {
      setTargetId(objects[0]?.id ?? '');
    }
  }, [selectedObjectId, objects, targetId]);

  useEffect(() => {
    let rafId = 0;
    const start = performance.now();
    const tick = (now: number) => {
      const elapsed = (now - start) / 1000;
      setPreviewPhase((elapsed * 0.65) % 1);
      rafId = requestAnimationFrame(tick);
    };
    rafId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafId);
  }, []);

  const activeObj = objects.find((o) => o.id === targetId) ?? null;
  const tracks = activeObj?.tweens ?? [];

  const updateTracks = (next: TweenKeyframeTrack[]) => {
    if (!activeObj || !onUpdateObject) return;
    onUpdateObject(activeObj.id, (prev) => ({
      ...prev,
      tweens: next,
    }));
  };

  const handleAddTrack = () => {
    if (!activeObj) return;
    const baseVal = activeObj.transform.y;
    const nextTrack: TweenKeyframeTrack = {
      id: createId('tw'),
      name: `anim_${tracks.length + 1}`,
      property: 'y',
      from: Math.round(baseVal),
      to: Math.round(baseVal - 40),
      duration: 1.0,
      delay: 0,
      easing: 'easeInOut',
      loop: true,
      pingPong: true,
      autoPlay: true,
    };
    updateTracks([...tracks, nextTrack]);
  };

  if (objects.length === 0) {
    return (
      <div className="flex h-full items-center justify-center p-4 text-xs text-zinc-500">
        Añade primero un objeto a la escena para crear pistas de animación por fotogramas clave.
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col overflow-y-auto p-3 space-y-2.5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-violet-300">
            <Film className="h-3.5 w-3.5" />
            <span>Animador de Escena (Tweens)</span>
          </span>
          <select
            aria-label="Objeto a animar"
            value={activeObj?.id ?? ''}
            onChange={(e) => {
              setTargetId(e.target.value);
              onSelectObjectById(e.target.value);
            }}
            className="rounded border border-[#32323c] bg-[#141416] px-2 py-1 text-xs text-zinc-100"
          >
            {objects.map((o) => (
              <option key={o.id} value={o.id}>
                {o.name}
              </option>
            ))}
          </select>
        </div>

        <button
          type="button"
          onClick={handleAddTrack}
          className="inline-flex items-center gap-1 rounded bg-violet-600 px-2.5 py-1 text-xs font-semibold text-white hover:bg-violet-500 whitespace-nowrap"
        >
          <Plus className="h-3.5 w-3.5" />
          <span>Añadir pista Tween</span>
        </button>
      </div>

      {tracks.length === 0 ? (
        <p className="rounded border border-dashed border-[#32323c] p-4 text-center text-xs text-zinc-500">
          Sin pistas de animación en &ldquo;{activeObj?.name}&rdquo;. Crea una pista para animar posición, escala, rotación u opacidad sin escribir código.
        </p>
      ) : (
        <div className="space-y-2">
          {tracks.map((tr) => {
            const patchTrack = (patch: Partial<TweenKeyframeTrack>) =>
              updateTracks(tracks.map((t) => (t.id === tr.id ? { ...t, ...patch } : t)));
            const easedPos = evaluateEasing(tr.easing, previewPhase);

            return (
              <div
                key={tr.id}
                className="rounded border border-[#2f2b3c] bg-[#16151c] p-2 space-y-2"
              >
                <div className="flex flex-wrap items-center gap-1.5">
                  <input
                    type="text"
                    aria-label="Nombre de pista Tween"
                    value={tr.name}
                    onChange={(e) => patchTrack({ name: e.target.value })}
                    className="w-32 rounded border border-[#32323c] bg-[#141416] px-2 py-1 text-xs font-semibold text-zinc-100"
                  />
                  <select
                    aria-label="Propiedad animada"
                    value={tr.property}
                    onChange={(e) =>
                      patchTrack({ property: e.target.value as TweenProperty })
                    }
                    className="rounded border border-[#32323c] bg-[#141416] px-2 py-1 text-xs text-zinc-100"
                  >
                    {PROPERTY_OPTIONS.map((p) => (
                      <option key={p.value} value={p.value}>
                        {p.label}
                      </option>
                    ))}
                  </select>
                  <select
                    aria-label="Curva Easing"
                    value={tr.easing}
                    onChange={(e) =>
                      patchTrack({ easing: e.target.value as TweenEasing })
                    }
                    className="rounded border border-[#32323c] bg-[#141416] px-2 py-1 text-xs text-zinc-100"
                  >
                    {EASING_OPTIONS.map((es) => (
                      <option key={es.value} value={es.value}>
                        {es.label}
                      </option>
                    ))}
                  </select>

                  <div className="flex items-center gap-2 text-[11px] text-zinc-300 ml-auto">
                    <label className="flex items-center gap-1 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={tr.autoPlay}
                        onChange={(e) => patchTrack({ autoPlay: e.target.checked })}
                        className="accent-violet-500"
                      />
                      <span>Auto</span>
                    </label>
                    <label className="flex items-center gap-1 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={tr.loop}
                        onChange={(e) => patchTrack({ loop: e.target.checked })}
                        className="accent-violet-500"
                      />
                      <span>Bucle</span>
                    </label>
                    <label className="flex items-center gap-1 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={tr.pingPong}
                        onChange={(e) => patchTrack({ pingPong: e.target.checked })}
                        className="accent-violet-500"
                      />
                      <span>Ping-Pong</span>
                    </label>
                    <button
                      type="button"
                      onClick={() => updateTracks(tracks.filter((t) => t.id !== tr.id))}
                      aria-label={`Eliminar pista ${tr.name}`}
                      className="rounded p-1 text-zinc-500 hover:bg-red-500/15 hover:text-red-400"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-5 items-end text-[11px]">
                  <label className="flex flex-col gap-0.5 text-zinc-400">
                    <span>Desde</span>
                    <input
                      type="number"
                      step={0.1}
                      value={tr.from}
                      onChange={(e) =>
                        patchTrack({ from: Number(e.target.value) || 0 })
                      }
                      className="rounded border border-[#32323c] bg-[#141416] px-2 py-1 font-mono text-zinc-100"
                    />
                  </label>
                  <label className="flex flex-col gap-0.5 text-zinc-400">
                    <span>Hasta</span>
                    <input
                      type="number"
                      step={0.1}
                      value={tr.to}
                      onChange={(e) =>
                        patchTrack({ to: Number(e.target.value) || 0 })
                      }
                      className="rounded border border-[#32323c] bg-[#141416] px-2 py-1 font-mono text-zinc-100"
                    />
                  </label>
                  <label className="flex flex-col gap-0.5 text-zinc-400">
                    <span>Duración (s)</span>
                    <input
                      type="number"
                      min={0.05}
                      step={0.05}
                      value={tr.duration}
                      onChange={(e) =>
                        patchTrack({
                          duration: Math.max(0.05, Number(e.target.value) || 0.5),
                        })
                      }
                      className="rounded border border-[#32323c] bg-[#141416] px-2 py-1 font-mono text-zinc-100"
                    />
                  </label>
                  <label className="flex flex-col gap-0.5 text-zinc-400">
                    <span>Retardo (s)</span>
                    <input
                      type="number"
                      min={0}
                      step={0.05}
                      value={tr.delay}
                      onChange={(e) =>
                        patchTrack({ delay: Math.max(0, Number(e.target.value) || 0) })
                      }
                      className="rounded border border-[#32323c] bg-[#141416] px-2 py-1 font-mono text-zinc-100"
                    />
                  </label>
                  <div className="flex flex-col gap-1">
                    <span className="text-[10px] text-zinc-400">Curva en vivo</span>
                    <div className="relative h-6 rounded border border-[#32323c] bg-[#111115] px-2 flex items-center">
                      <div className="h-0.5 w-full bg-zinc-700 rounded" />
                      <div
                        className="absolute top-1/2 -translate-y-1/2 h-3 w-3 rounded-full bg-violet-400 shadow"
                        style={{ left: `calc(${easedPos * 85}% + 4px)` }}
                      />
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
