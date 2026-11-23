import React, { useEffect, useState } from 'react';
import { Film, Plus, Trash2 } from 'lucide-react';
import type {
  GameObjectData,
  TweenEasing,
  TweenKeyframeTrack,
  TweenProperty,
} from '../../engine/core/types';
import { evaluateEasing } from '../../engine/runtime/behaviorRuntime';
import { NumericInput } from '../common/NumericInput';
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
  { value: 'z', label: 'Posición Z (3D)' },
  { value: 'rotation', label: 'Rotación 2D (°)' },
  { value: 'rx', label: 'Rotación X 3D (°)' },
  { value: 'ry', label: 'Rotación Y 3D (°)' },
  { value: 'rz', label: 'Rotación Z 3D (°)' },
  { value: 'scaleX', label: 'Escala X' },
  { value: 'scaleY', label: 'Escala Y' },
  { value: 'scaleZ', label: 'Escala Z (3D)' },
  { value: 'opacity', label: 'Opacidad (0..1)' },
  { value: 'fov', label: 'FOV Cámara (°)' },
];

function readObjectTweenProp(obj: GameObjectData, prop: TweenProperty): number {
  const t3 = obj.transform3d;
  if (prop === 'x') return Number((t3 ? t3.x : obj.transform.x).toFixed(2));
  if (prop === 'y') return Number((t3 ? t3.y : obj.transform.y).toFixed(2));
  if (prop === 'z') return Number((t3 ? t3.z : 0).toFixed(2));
  if (prop === 'rotation') return Number(obj.transform.rotation.toFixed(2));
  if (prop === 'rx') return Number((t3 ? t3.rx : 0).toFixed(2));
  if (prop === 'ry') return Number((t3 ? t3.ry : 0).toFixed(2));
  if (prop === 'rz') return Number((t3 ? t3.rz : 0).toFixed(2));
  if (prop === 'scaleX') return Number((t3 ? t3.sx : obj.transform.scaleX).toFixed(2));
  if (prop === 'scaleY') return Number((t3 ? t3.sy : obj.transform.scaleY).toFixed(2));
  if (prop === 'scaleZ') return Number((t3 ? t3.sz : 1).toFixed(2));
  if (prop === 'opacity') return Number(obj.opacity.toFixed(2));
  if (prop === 'fov') return Number((obj.camera3d?.fov ?? 60).toFixed(1));
  return 0;
}

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

  const [scrubOverride, setScrubOverride] = useState<number | null>(null);

  const handleAddTrack = (preset?: 'camera_fov') => {
    if (!activeObj) return;
    if (preset === 'camera_fov') {
      const fovNow = readObjectTweenProp(activeObj, 'fov');
      const nextTrack: TweenKeyframeTrack = {
        id: createId('tw'),
        name: `cam_zoom_${tracks.length + 1}`,
        property: 'fov',
        from: fovNow,
        to: Math.max(32, fovNow - 18),
        duration: 1.5,
        delay: 0,
        easing: 'easeInOut',
        loop: false,
        pingPong: false,
        autoPlay: true,
      };
      updateTracks([...tracks, nextTrack]);
      return;
    }
    const prop: TweenProperty = activeObj.transform3d ? 'ry' : 'y';
    const baseVal = readObjectTweenProp(activeObj, prop);
    const nextTrack: TweenKeyframeTrack = {
      id: createId('tw'),
      name: `anim_${tracks.length + 1}`,
      property: prop,
      from: Math.round(baseVal),
      to: prop === 'ry' ? Math.round(baseVal + 360) : Math.round(baseVal - 40),
      duration: prop === 'ry' ? 2.4 : 1.0,
      delay: 0,
      easing: 'easeInOut',
      loop: true,
      pingPong: prop !== 'ry',
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
            <span>Animador de Escena y Cinemáticas (Tweens)</span>
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

        <div className="flex flex-wrap items-center gap-2">
          <label className="flex items-center gap-1.5 text-[10px] text-zinc-300">
            <span>Scrubber:</span>
            <input
              type="range"
              aria-label="Scrubber de línea de tiempo"
              min={0}
              max={100}
              value={Math.round((scrubOverride ?? previewPhase) * 100)}
              onChange={(e) => setScrubOverride(Number(e.target.value) / 100)}
              className="w-24 accent-violet-500 cursor-pointer"
            />
            {scrubOverride !== null && (
              <button
                type="button"
                onClick={() => setScrubOverride(null)}
                className="rounded border border-[#32323c] px-1.5 py-0.5 text-[9px] text-violet-300 hover:bg-[#23232d]"
              >
                Auto
              </button>
            )}
          </label>
          <button
            type="button"
            onClick={() => handleAddTrack('camera_fov')}
            className="inline-flex items-center gap-1 rounded border border-violet-500/40 bg-violet-600/20 px-2 py-1 text-[11px] font-semibold text-violet-200 hover:bg-violet-600/35 whitespace-nowrap"
          >
            <Plus className="h-3 w-3" />
            <span>+ Zoom FOV</span>
          </button>
          <button
            type="button"
            onClick={() => handleAddTrack()}
            className="inline-flex items-center gap-1 rounded bg-violet-600 px-2.5 py-1 text-xs font-semibold text-white hover:bg-violet-500 whitespace-nowrap"
          >
            <Plus className="h-3.5 w-3.5" />
            <span>Añadir pista Tween</span>
          </button>
        </div>
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
            const phase = scrubOverride ?? previewPhase;
            const easedPos = evaluateEasing(tr.easing, phase);
            const liveValue = (tr.from + (tr.to - tr.from) * easedPos).toFixed(2);

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
                    <div className="flex items-center justify-between">
                      <span>Desde</span>
                      {activeObj && (
                        <button
                          type="button"
                          onClick={() =>
                            patchTrack({ from: readObjectTweenProp(activeObj, tr.property) })
                          }
                          className="text-[9px] text-violet-300 hover:text-white"
                          title="Capturar valor actual del objeto"
                        >
                          = actual
                        </button>
                      )}
                    </div>
                    <NumericInput
                      ariaLabel="Valor inicial tween"
                      step={0.1}
                      value={tr.from}
                      onChange={(from) => patchTrack({ from })}
                      className="rounded border border-[#32323c] bg-[#141416] px-2 py-1 font-mono text-zinc-100"
                    />
                  </label>
                  <label className="flex flex-col gap-0.5 text-zinc-400">
                    <div className="flex items-center justify-between">
                      <span>Hasta</span>
                      {activeObj && (
                        <button
                          type="button"
                          onClick={() =>
                            patchTrack({ to: readObjectTweenProp(activeObj, tr.property) })
                          }
                          className="text-[9px] text-violet-300 hover:text-white"
                          title="Capturar valor actual del objeto"
                        >
                          = actual
                        </button>
                      )}
                    </div>
                    <NumericInput
                      ariaLabel="Valor final tween"
                      step={0.1}
                      value={tr.to}
                      onChange={(to) => patchTrack({ to })}
                      className="rounded border border-[#32323c] bg-[#141416] px-2 py-1 font-mono text-zinc-100"
                    />
                  </label>
                  <label className="flex flex-col gap-0.5 text-zinc-400">
                    <span>Duración (s)</span>
                    <NumericInput
                      ariaLabel="Duración tween"
                      min={0.05}
                      step={0.05}
                      value={tr.duration}
                      onChange={(duration) => patchTrack({ duration })}
                      className="rounded border border-[#32323c] bg-[#141416] px-2 py-1 font-mono text-zinc-100"
                    />
                  </label>
                  <label className="flex flex-col gap-0.5 text-zinc-400">
                    <span>Retardo (s)</span>
                    <NumericInput
                      ariaLabel="Retardo tween"
                      min={0}
                      step={0.05}
                      value={tr.delay}
                      onChange={(delay) => patchTrack({ delay })}
                      className="rounded border border-[#32323c] bg-[#141416] px-2 py-1 font-mono text-zinc-100"
                    />
                  </label>
                  <div className="flex flex-col gap-1">
                    <div className="flex items-center justify-between text-[10px] text-zinc-400">
                      <span>Valor vivo</span>
                      <span className="font-mono text-violet-300">{liveValue}</span>
                    </div>
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
