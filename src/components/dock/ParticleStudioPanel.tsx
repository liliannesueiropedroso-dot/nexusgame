import React, { useEffect, useRef, useState } from 'react';
import { Flame, Sparkles } from 'lucide-react';
import type {
  GameObjectData,
  ParticleEmitterConfig,
  ParticlePresetId,
} from '../../engine/core/types';
import { getParticlePresetDefaults } from '../../engine/runtime/behaviorRuntime';

interface ParticleStudioPanelProps {
  objects: GameObjectData[];
  selectedObjectId?: string | null;
  onUpdateObject?: (id: string, updater: (obj: GameObjectData) => GameObjectData) => void;
  onSelectObjectById: (id: string) => void;
}

const PRESET_LIST: Array<{ id: ParticlePresetId; label: string }> = [
  { id: 'explosion', label: 'Explosión' },
  { id: 'fire', label: 'Fuego' },
  { id: 'smoke', label: 'Humo' },
  { id: 'sparks', label: 'Chispas' },
  { id: 'magic', label: 'Magia' },
  { id: 'dust', label: 'Polvo' },
  { id: 'rain', label: 'Lluvia' },
  { id: 'snow', label: 'Nieve' },
];

const DEFAULT_EMITTER: ParticleEmitterConfig = {
  enabled: false,
  preset: 'fire',
  rate: 28,
  maxParticles: 100,
  speedMin: 40,
  speedMax: 110,
  angleDeg: -90,
  spreadDeg: 36,
  gravity: -40,
  sizeStart: 8,
  sizeEnd: 2,
  lifetime: 0.65,
  colorStart: '#facc15',
  colorEnd: '#ef4444',
  blendAlpha: 0.9,
};

interface StudioParticle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  age: number;
  maxAge: number;
}

export const ParticleStudioPanel: React.FC<ParticleStudioPanelProps> = ({
  objects,
  selectedObjectId,
  onUpdateObject,
  onSelectObjectById,
}) => {
  const [targetId, setTargetId] = useState<string>(
    selectedObjectId ?? objects[0]?.id ?? ''
  );
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    if (selectedObjectId && objects.some((o) => o.id === selectedObjectId)) {
      setTargetId(selectedObjectId);
    } else if (!objects.some((o) => o.id === targetId)) {
      setTargetId(objects[0]?.id ?? '');
    }
  }, [selectedObjectId, objects, targetId]);

  const activeObj = objects.find((o) => o.id === targetId) ?? null;
  const emitter: ParticleEmitterConfig = activeObj?.particleEmitter
    ? { ...DEFAULT_EMITTER, ...activeObj.particleEmitter }
    : DEFAULT_EMITTER;

  const updateEmitter = (patch: Partial<ParticleEmitterConfig>) => {
    if (!activeObj || !onUpdateObject) return;
    onUpdateObject(activeObj.id, (prev) => ({
      ...prev,
      particleEmitter: {
        ...DEFAULT_EMITTER,
        ...(prev.particleEmitter ?? {}),
        ...patch,
      },
    }));
  };

  const applyPreset = (preset: ParticlePresetId) => {
    const defs = getParticlePresetDefaults(preset);
    updateEmitter({
      ...defs,
      preset,
      enabled: true,
    });
  };

  // Vista previa animada en tiempo real dentro del estudio
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const particles: StudioParticle[] = [];
    let acc = 0;
    let lastTime = performance.now();
    let rafId = 0;

    const loop = (now: number) => {
      const dt = Math.min(0.05, Math.max(0.001, (now - lastTime) / 1000));
      lastTime = now;

      const rate = Math.max(1, emitter.rate);
      acc += dt * rate;
      const toSpawn = Math.min(12, Math.floor(acc));
      acc -= toSpawn;

      const angleBase = (emitter.angleDeg * Math.PI) / 180;
      const spreadRad = (emitter.spreadDeg * Math.PI) / 180;
      const sMin = Math.min(emitter.speedMin, emitter.speedMax);
      const sMax = Math.max(emitter.speedMin, emitter.speedMax);

      for (let i = 0; i < toSpawn; i++) {
        if (particles.length >= Math.max(20, emitter.maxParticles)) break;
        const ang = angleBase + (Math.random() - 0.5) * spreadRad;
        const spd = sMin + Math.random() * (sMax - sMin);
        particles.push({
          x: canvas.width / 2,
          y: canvas.height * 0.65,
          vx: Math.cos(ang) * spd * 0.65,
          vy: Math.sin(ang) * spd * 0.65,
          age: 0,
          maxAge: Math.max(0.1, emitter.lifetime),
        });
      }

      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.fillStyle = '#0d0e12';
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      // Cruz de origen
      ctx.strokeStyle = '#272730';
      ctx.beginPath();
      ctx.moveTo(canvas.width / 2 - 8, canvas.height * 0.65);
      ctx.lineTo(canvas.width / 2 + 8, canvas.height * 0.65);
      ctx.moveTo(canvas.width / 2, canvas.height * 0.65 - 8);
      ctx.lineTo(canvas.width / 2, canvas.height * 0.65 + 8);
      ctx.stroke();

      for (let i = particles.length - 1; i >= 0; i--) {
        const p = particles[i];
        p.age += dt;
        if (p.age >= p.maxAge) {
          particles.splice(i, 1);
          continue;
        }
        p.vy += emitter.gravity * 0.65 * dt;
        p.x += p.vx * dt;
        p.y += p.vy * dt;

        const t = p.age / p.maxAge;
        const size = Math.max(
          1,
          emitter.sizeStart + (emitter.sizeEnd - emitter.sizeStart) * t
        );
        ctx.globalAlpha = Math.max(0, Math.min(1, emitter.blendAlpha * (1 - t)));
        ctx.fillStyle = t < 0.5 ? emitter.colorStart : emitter.colorEnd;
        ctx.beginPath();
        ctx.arc(p.x, p.y, size, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalAlpha = 1;

      rafId = requestAnimationFrame(loop);
    };

    rafId = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(rafId);
  }, [
    emitter.rate,
    emitter.maxParticles,
    emitter.speedMin,
    emitter.speedMax,
    emitter.angleDeg,
    emitter.spreadDeg,
    emitter.gravity,
    emitter.sizeStart,
    emitter.sizeEnd,
    emitter.lifetime,
    emitter.colorStart,
    emitter.colorEnd,
    emitter.blendAlpha,
  ]);

  if (objects.length === 0) {
    return (
      <div className="flex h-full items-center justify-center p-4 text-xs text-zinc-500">
        Añade primero un objeto a la escena para asociarle un emisor de partículas.
      </div>
    );
  }

  return (
    <div className="flex h-full min-h-0 gap-3 overflow-y-auto p-3">
      {/* Configuración y presets */}
      <div className="flex-1 space-y-2.5 min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-1.5 text-xs font-semibold text-orange-300">
            <Sparkles className="h-3.5 w-3.5" />
            <span>Estudio de Partículas</span>
          </div>
          <select
            aria-label="Objeto con emisor de partículas"
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

          <label className="inline-flex items-center gap-1.5 rounded border border-[#32323c] bg-[#1a1a20] px-2.5 py-1 text-xs text-zinc-200 cursor-pointer">
            <input
              type="checkbox"
              checked={emitter.enabled}
              onChange={(e) => updateEmitter({ enabled: e.target.checked })}
              className="accent-orange-500"
            />
            <span>Emisor activo en juego</span>
          </label>
        </div>

        {/* Presets */}
        <div className="flex flex-wrap items-center gap-1">
          {PRESET_LIST.map((p) => (
            <button
              key={p.id}
              type="button"
              onClick={() => applyPreset(p.id)}
              className={`inline-flex items-center gap-1 rounded border px-2 py-1 text-[11px] font-medium transition-colors ${
                emitter.preset === p.id && emitter.enabled
                  ? 'border-orange-500/70 bg-orange-500/20 text-orange-200'
                  : 'border-[#30303a] bg-[#1c1c22] text-zinc-300 hover:bg-[#26262f]'
              }`}
            >
              <Flame className="h-3 w-3 text-orange-400" />
              <span>{p.label}</span>
            </button>
          ))}
        </div>

        {/* Parámetros numéricos y colores */}
        <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-4 lg:grid-cols-6 text-[11px]">
          <label className="flex flex-col gap-0.5 text-zinc-400">
            <span>Tasa (/seg)</span>
            <input
              type="number"
              min={1}
              max={150}
              value={emitter.rate}
              onChange={(e) =>
                updateEmitter({ rate: Math.max(1, Number(e.target.value) || 1) })
              }
              className="rounded border border-[#32323c] bg-[#141416] px-2 py-1 font-mono text-zinc-100"
            />
          </label>
          <label className="flex flex-col gap-0.5 text-zinc-400">
            <span>Vel. mín</span>
            <input
              type="number"
              value={emitter.speedMin}
              onChange={(e) =>
                updateEmitter({ speedMin: Number(e.target.value) || 0 })
              }
              className="rounded border border-[#32323c] bg-[#141416] px-2 py-1 font-mono text-zinc-100"
            />
          </label>
          <label className="flex flex-col gap-0.5 text-zinc-400">
            <span>Vel. máx</span>
            <input
              type="number"
              value={emitter.speedMax}
              onChange={(e) =>
                updateEmitter({ speedMax: Number(e.target.value) || 0 })
              }
              className="rounded border border-[#32323c] bg-[#141416] px-2 py-1 font-mono text-zinc-100"
            />
          </label>
          <label className="flex flex-col gap-0.5 text-zinc-400">
            <span>Ángulo (°)</span>
            <input
              type="number"
              value={emitter.angleDeg}
              onChange={(e) =>
                updateEmitter({ angleDeg: Number(e.target.value) || 0 })
              }
              className="rounded border border-[#32323c] bg-[#141416] px-2 py-1 font-mono text-zinc-100"
            />
          </label>
          <label className="flex flex-col gap-0.5 text-zinc-400">
            <span>Apertura (°)</span>
            <input
              type="number"
              min={0}
              max={360}
              value={emitter.spreadDeg}
              onChange={(e) =>
                updateEmitter({ spreadDeg: Number(e.target.value) || 0 })
              }
              className="rounded border border-[#32323c] bg-[#141416] px-2 py-1 font-mono text-zinc-100"
            />
          </label>
          <label className="flex flex-col gap-0.5 text-zinc-400">
            <span>Gravedad</span>
            <input
              type="number"
              value={emitter.gravity}
              onChange={(e) =>
                updateEmitter({ gravity: Number(e.target.value) || 0 })
              }
              className="rounded border border-[#32323c] bg-[#141416] px-2 py-1 font-mono text-zinc-100"
            />
          </label>
          <label className="flex flex-col gap-0.5 text-zinc-400">
            <span>Tam. inicio</span>
            <input
              type="number"
              min={1}
              max={48}
              value={emitter.sizeStart}
              onChange={(e) =>
                updateEmitter({ sizeStart: Math.max(1, Number(e.target.value) || 4) })
              }
              className="rounded border border-[#32323c] bg-[#141416] px-2 py-1 font-mono text-zinc-100"
            />
          </label>
          <label className="flex flex-col gap-0.5 text-zinc-400">
            <span>Tam. fin</span>
            <input
              type="number"
              min={0}
              max={48}
              value={emitter.sizeEnd}
              onChange={(e) =>
                updateEmitter({ sizeEnd: Math.max(0, Number(e.target.value) || 1) })
              }
              className="rounded border border-[#32323c] bg-[#141416] px-2 py-1 font-mono text-zinc-100"
            />
          </label>
          <label className="flex flex-col gap-0.5 text-zinc-400">
            <span>Vida (s)</span>
            <input
              type="number"
              min={0.1}
              max={6}
              step={0.05}
              value={emitter.lifetime}
              onChange={(e) =>
                updateEmitter({
                  lifetime: Math.max(0.1, Number(e.target.value) || 0.5),
                })
              }
              className="rounded border border-[#32323c] bg-[#141416] px-2 py-1 font-mono text-zinc-100"
            />
          </label>
          <label className="flex flex-col gap-0.5 text-zinc-400">
            <span>Opacidad</span>
            <input
              type="number"
              min={0.1}
              max={1}
              step={0.05}
              value={emitter.blendAlpha}
              onChange={(e) =>
                updateEmitter({
                  blendAlpha: Math.max(0.1, Math.min(1, Number(e.target.value) || 0.8)),
                })
              }
              className="rounded border border-[#32323c] bg-[#141416] px-2 py-1 font-mono text-zinc-100"
            />
          </label>
          <label className="flex flex-col gap-0.5 text-zinc-400">
            <span>Color inicio</span>
            <input
              type="color"
              aria-label="Color inicio partículas"
              value={emitter.colorStart}
              onChange={(e) => updateEmitter({ colorStart: e.target.value })}
              className="h-7 w-full cursor-pointer rounded border border-[#32323c] bg-[#141416] p-0.5"
            />
          </label>
          <label className="flex flex-col gap-0.5 text-zinc-400">
            <span>Color fin</span>
            <input
              type="color"
              aria-label="Color fin partículas"
              value={emitter.colorEnd}
              onChange={(e) => updateEmitter({ colorEnd: e.target.value })}
              className="h-7 w-full cursor-pointer rounded border border-[#32323c] bg-[#141416] p-0.5"
            />
          </label>
        </div>
      </div>

      {/* Vista previa en vivo */}
      <div className="hidden sm:flex w-52 shrink-0 flex-col items-center justify-center rounded border border-[#2c2c34] bg-[#0d0e12] p-1.5">
        <canvas
          ref={canvasRef}
          width={200}
          height={170}
          className="rounded"
        />
        <span className="mt-1 text-[10px] text-zinc-500">Vista previa en tiempo real</span>
      </div>
    </div>
  );
};
