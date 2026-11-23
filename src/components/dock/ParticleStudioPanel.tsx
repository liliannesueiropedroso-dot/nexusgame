import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Copy, Flame, Layers, Plus, Sparkles, Trash2 } from 'lucide-react';
import type {
  GameObjectData,
  ParticleEmitterConfig,
  ParticleEmitterLayer,
  ParticleEmitterShape,
  ParticlePresetId,
  ParticleRenderShape,
} from '../../engine/core/types';
import { getParticlePresetDefaults } from '../../engine/runtime/behaviorRuntime';
import { sampleVfxCurve } from '../../engine/vfx/particlePool';
import { createId } from '../../utils/id';

import { NumericInput } from '../common/NumericInput';
import type { ProjectAssetMeta } from '../../project/models/project';

interface CurvePt {
  t: number;
  v: number;
}

function toCurvePts(curve?: number[]): CurvePt[] {
  const arr = curve && curve.length >= 2 ? curve : [1, 0.78, 0.55, 0.3, 0.1];
  const n = arr.length - 1;
  return arr.map((v, i) => ({ t: Number((i / n).toFixed(2)), v }));
}

function resampleCurvePts(pts: CurvePt[], samples = 6): number[] {
  const sorted = [...pts].sort((a, b) => a.t - b.t);
  if (sorted.length === 0) return [1, 0.5, 0.1];
  if (sorted.length === 1) return [sorted[0].v, sorted[0].v];
  const out: number[] = [];
  for (let i = 0; i < samples; i++) {
    const t = i / (samples - 1);
    if (t <= sorted[0].t) {
      out.push(Number(sorted[0].v.toFixed(2)));
      continue;
    }
    if (t >= sorted[sorted.length - 1].t) {
      out.push(Number(sorted[sorted.length - 1].v.toFixed(2)));
      continue;
    }
    let val = sorted[0].v;
    for (let j = 0; j < sorted.length - 1; j++) {
      const a = sorted[j];
      const b = sorted[j + 1];
      if (t >= a.t && t <= b.t) {
        const span = Math.max(0.0001, b.t - a.t);
        const f = (t - a.t) / span;
        val = a.v + (b.v - a.v) * f;
        break;
      }
    }
    out.push(Number(val.toFixed(2)));
  }
  return out;
}

interface ParticleStudioPanelProps {
  objects: GameObjectData[];
  selectedObjectId?: string | null;
  assets?: ProjectAssetMeta[];
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
  { id: 'liquid', label: 'Líquido' },
  { id: 'waterfall', label: 'Cascada' },
  { id: 'ripple', label: 'Ondas' },
];

const DEFAULT_CURVE_LINEAR_DOWN: number[] = [1, 0.78, 0.55, 0.3, 0.1];

const CURVE_PRESETS: Record<string, number[]> = {
  Campana: [0.15, 0.85, 1, 0.8, 0.35, 0.05],
  Decaer: [1, 0.78, 0.55, 0.3, 0.05],
  Crecer: [0.2, 0.45, 0.7, 0.9, 1],
  Pulso: [0.25, 1, 0.45, 0.95, 0.1],
};

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
  emitterShape: 'point',
  particleShape: 'circle',
  drag: 0,
  turbulence: 0,
  spritesheetFps: 12,
  layers: [],
};

interface StudioParticle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  gravity: number;
  drag: number;
  turbulence: number;
  sizeStart: number;
  sizeEnd: number;
  colorStart: string;
  colorEnd: string;
  blendAlpha: number;
  additive: boolean;
  shape: ParticleRenderShape;
  sizeCurve?: number[];
  alphaCurve?: number[];
  speedCurve?: number[];
  rotation: number;
  rotationSpeed: number;
  age: number;
  maxAge: number;
}

function buildLayerFromPreset(preset: ParticlePresetId, name: string): ParticleEmitterLayer {
  const defs = getParticlePresetDefaults(preset);
  return {
    id: createId('vfx'),
    name,
    enabled: true,
    preset,
    rate: defs.rate ?? 24,
    maxParticles: defs.maxParticles ?? 90,
    speedMin: defs.speedMin ?? 40,
    speedMax: defs.speedMax ?? 120,
    angleDeg: defs.angleDeg ?? -90,
    spreadDeg: defs.spreadDeg ?? 45,
    gravity: defs.gravity ?? 0,
    sizeStart: defs.sizeStart ?? 6,
    sizeEnd: defs.sizeEnd ?? 1,
    lifetime: defs.lifetime ?? 0.65,
    colorStart: defs.colorStart ?? '#fef08a',
    colorEnd: defs.colorEnd ?? '#f97316',
    blendAlpha: defs.blendAlpha ?? 0.9,
    rotationSpeed: 0,
    textureAssetId: null,
    cols: 1,
    rows: 1,
    additive: preset === 'sparks' || preset === 'fire' || preset === 'magic',
    offsetX: 0,
    offsetY: 0,
  };
}

export const ParticleStudioPanel: React.FC<ParticleStudioPanelProps> = ({
  objects,
  selectedObjectId,
  assets = [],
  onUpdateObject,
  onSelectObjectById,
}) => {
  const [targetId, setTargetId] = useState<string>(
    selectedObjectId ?? objects[0]?.id ?? ''
  );
  const [activeLayerId, setActiveLayerId] = useState<'base' | string>('base');
  const [activeCurveKind, setActiveCurveKind] = useState<'sizeCurve' | 'alphaCurve' | 'speedCurve'>('sizeCurve');
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    if (selectedObjectId && objects.some((o) => o.id === selectedObjectId)) {
      setTargetId(selectedObjectId);
    } else if (!objects.some((o) => o.id === targetId)) {
      setTargetId(objects[0]?.id ?? '');
    }
  }, [selectedObjectId, objects, targetId]);

  const activeObj = objects.find((o) => o.id === targetId) ?? null;
  const emitter: ParticleEmitterConfig = useMemo(
    () =>
      activeObj?.particleEmitter
        ? { ...DEFAULT_EMITTER, ...activeObj.particleEmitter }
        : DEFAULT_EMITTER,
    [activeObj?.particleEmitter]
  );

  const extraLayers = emitter.layers ?? [];

  useEffect(() => {
    if (activeLayerId !== 'base' && !extraLayers.some((l) => l.id === activeLayerId)) {
      setActiveLayerId('base');
    }
  }, [activeLayerId, extraLayers]);

  const selectedExtraLayer =
    activeLayerId === 'base'
      ? null
      : extraLayers.find((l) => l.id === activeLayerId) ?? null;

  const activeConfig = selectedExtraLayer ?? emitter;

  const emitterRef = useRef(emitter);
  emitterRef.current = emitter;

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

  const updateActiveTarget = (patch: Partial<ParticleEmitterLayer>) => {
    if (!selectedExtraLayer) {
      updateEmitter(patch);
      return;
    }
    const nextLayers = extraLayers.map((layer) =>
      layer.id === selectedExtraLayer.id ? { ...layer, ...patch } : layer
    );
    updateEmitter({ layers: nextLayers });
  };

  const applyPreset = (preset: ParticlePresetId) => {
    const defs = getParticlePresetDefaults(preset);
    if (!selectedExtraLayer) {
      updateEmitter({
        ...defs,
        preset,
        enabled: true,
      });
    } else {
      updateActiveTarget({
        ...defs,
        preset,
        enabled: true,
      });
    }
  };

  const handleAddLayer = () => {
    if (!activeObj || !onUpdateObject) return;
    const defaultPreset: ParticlePresetId =
      emitter.preset === 'fire' ? 'sparks' : emitter.preset === 'explosion' ? 'smoke' : 'magic';
    const nextLayer = buildLayerFromPreset(
      defaultPreset,
      `Capa ${extraLayers.length + 2}`
    );
    updateEmitter({
      enabled: true,
      layers: [...extraLayers, nextLayer],
    });
    setActiveLayerId(nextLayer.id);
  };

  const handleDuplicateLayer = () => {
    if (!activeObj || !onUpdateObject) return;
    const src = selectedExtraLayer;
    const cloned: ParticleEmitterLayer = src
      ? {
          ...src,
          id: createId('vfx'),
          name: `${src.name} copia`,
        }
      : {
          id: createId('vfx'),
          name: `Capa ${extraLayers.length + 2}`,
          enabled: true,
          preset: emitter.preset,
          rate: emitter.rate,
          maxParticles: emitter.maxParticles,
          speedMin: emitter.speedMin,
          speedMax: emitter.speedMax,
          angleDeg: emitter.angleDeg,
          spreadDeg: emitter.spreadDeg,
          gravity: emitter.gravity,
          sizeStart: emitter.sizeStart,
          sizeEnd: emitter.sizeEnd,
          lifetime: emitter.lifetime,
          colorStart: emitter.colorStart,
          colorEnd: emitter.colorEnd,
          blendAlpha: emitter.blendAlpha,
          rotationSpeed: emitter.rotationSpeed ?? 0,
          textureAssetId: emitter.textureAssetId ?? null,
          cols: emitter.cols ?? 1,
          rows: emitter.rows ?? 1,
          additive: emitter.additive ?? false,
          offsetX: 0,
          offsetY: 0,
        };
    updateEmitter({
      enabled: true,
      layers: [...extraLayers, cloned],
    });
    setActiveLayerId(cloned.id);
  };

  const handleDeleteLayer = (layerId: string) => {
    const nextLayers = extraLayers.filter((l) => l.id !== layerId);
    updateEmitter({ layers: nextLayers });
    if (activeLayerId === layerId) {
      setActiveLayerId(nextLayers[0]?.id ?? 'base');
    }
  };

  // Vista previa animada en tiempo real (capa base + todas las capas activas simultáneas)
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const particles: StudioParticle[] = [];
    const accumulators = new Map<string, number>();
    let lastTime = performance.now();
    let rafId = 0;

    const spawnFromSource = (
      key: string,
      src: ParticleEmitterConfig | ParticleEmitterLayer,
      ox: number,
      oy: number,
      dt: number
    ) => {
      const rate = Math.max(1, src.rate);
      const acc = (accumulators.get(key) ?? 0) + dt * rate;
      const toSpawn = Math.min(12, Math.floor(acc));
      accumulators.set(key, acc - toSpawn);

      const angleBase = (src.angleDeg * Math.PI) / 180;
      const spreadRad = (src.spreadDeg * Math.PI) / 180;
      const sMin = Math.min(src.speedMin, src.speedMax);
      const sMax = Math.max(src.speedMin, src.speedMax);
      const cap = Math.max(40, (emitterRef.current.maxParticles || 100) * 2);

      for (let i = 0; i < toSpawn; i++) {
        if (particles.length >= cap) break;
        const ang = angleBase + (Math.random() - 0.5) * spreadRad;
        const spd = sMin + Math.random() * (sMax - sMin);
        const eshape = src.emitterShape ?? 'point';
        let sxOff = 0;
        let syOff = 0;
        if (eshape === 'ring') {
          const ra = Math.random() * Math.PI * 2;
          sxOff = Math.cos(ra) * 18;
          syOff = Math.sin(ra) * 18;
        } else if (eshape === 'sphere' || eshape === 'box') {
          sxOff = (Math.random() - 0.5) * 32;
          syOff = (Math.random() - 0.5) * 24;
        }
        particles.push({
          x: canvas.width / 2 + ox * 0.55 + sxOff,
          y: canvas.height * 0.65 + oy * 0.55 + syOff,
          vx: Math.cos(ang) * spd * 0.65,
          vy: Math.sin(ang) * spd * 0.65,
          gravity: src.gravity,
          drag: src.drag ?? 0,
          turbulence: src.turbulence ?? 0,
          sizeStart: src.sizeStart,
          sizeEnd: src.sizeEnd,
          colorStart: src.colorStart,
          colorEnd: src.colorEnd,
          blendAlpha: src.blendAlpha,
          additive: Boolean(src.additive),
          shape: src.particleShape ?? 'circle',
          sizeCurve: src.sizeCurve,
          alphaCurve: src.alphaCurve,
          speedCurve: src.speedCurve,
          rotation: ang,
          rotationSpeed: src.rotationSpeed ?? 0,
          age: 0,
          maxAge: Math.max(0.1, src.lifetime),
        });
      }
    };

    const loop = (now: number) => {
      const dt = Math.min(0.05, Math.max(0.001, (now - lastTime) / 1000));
      lastTime = now;

      const cur = emitterRef.current;
      spawnFromSource('base', cur, 0, 0, dt);
      for (const layer of cur.layers ?? []) {
        if (!layer.enabled) continue;
        spawnFromSource(layer.id, layer, layer.offsetX ?? 0, layer.offsetY ?? 0, dt);
      }

      ctx.globalCompositeOperation = 'source-over';
      ctx.globalAlpha = 1;
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
        const t = p.age / p.maxAge;
        const damp = Math.max(0, 1 - p.drag * dt);
        p.vx *= damp;
        p.vy = p.vy * damp + p.gravity * 0.65 * dt;
        if (p.turbulence > 0) {
          p.vx += (Math.sin(p.age * 11 + i) * p.turbulence) * dt;
        }
        const spdMul = p.speedCurve?.length ? sampleVfxCurve(p.speedCurve, t, 1, 1) : 1;
        p.x += p.vx * spdMul * dt;
        p.y += p.vy * spdMul * dt;
        p.rotation += p.rotationSpeed * dt;

        const size = Math.max(1, sampleVfxCurve(p.sizeCurve, t, p.sizeStart, p.sizeEnd));
        const alphaMul = sampleVfxCurve(p.alphaCurve, t, 1, 0);

        ctx.globalCompositeOperation = p.additive ? 'lighter' : 'source-over';
        ctx.globalAlpha = Math.max(0, Math.min(1, p.blendAlpha * alphaMul));
        ctx.fillStyle = t < 0.5 ? p.colorStart : p.colorEnd;
        ctx.strokeStyle = ctx.fillStyle;

        if (p.shape === 'ring') {
          ctx.lineWidth = Math.max(1.5, size * 0.22);
          ctx.beginPath();
          ctx.arc(p.x, p.y, size, 0, Math.PI * 2);
          ctx.stroke();
        } else if (p.shape === 'spark') {
          ctx.save();
          ctx.translate(p.x, p.y);
          ctx.rotate(Math.atan2(p.vy, p.vx));
          ctx.fillRect(-size * 1.4, -Math.max(1, size * 0.25), size * 2.8, Math.max(2, size * 0.5));
          ctx.restore();
        } else if (p.shape === 'liquid') {
          ctx.save();
          ctx.translate(p.x, p.y);
          ctx.scale(1.15, 0.85);
          ctx.beginPath();
          ctx.arc(0, 0, size, 0, Math.PI * 2);
          ctx.fill();
          ctx.restore();
        } else {
          ctx.beginPath();
          ctx.arc(p.x, p.y, size, 0, Math.PI * 2);
          ctx.fill();
        }
      }
      ctx.globalCompositeOperation = 'source-over';
      ctx.globalAlpha = 1;

      rafId = requestAnimationFrame(loop);
    };

    rafId = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(rafId);
  }, []);

  if (objects.length === 0) {
    return (
      <div className="flex h-full items-center justify-center p-4 text-xs text-zinc-500">
        Añade primero un objeto a la escena para asociarle un emisor de partículas.
      </div>
    );
  }

  return (
    <div className="flex h-full min-h-0 gap-3 overflow-y-auto p-3">
      {/* Barra lateral de capas multicapa */}
      <div className="flex w-44 shrink-0 flex-col gap-1.5 rounded border border-[#2c2c34] bg-[#16161b] p-2">
        <div className="flex items-center justify-between gap-1">
          <span className="inline-flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wide text-orange-300">
            <Layers className="h-3 w-3" />
            Capas ({1 + extraLayers.length})
          </span>
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={handleDuplicateLayer}
              title="Duplicar capa actual"
              aria-label="Duplicar capa de partículas"
              className="rounded border border-[#32323c] bg-[#202028] p-1 text-zinc-300 hover:bg-[#2a2a35]"
            >
              <Copy className="h-2.5 w-2.5" />
            </button>
            <button
              type="button"
              onClick={handleAddLayer}
              title="Añadir nueva capa simultánea"
              aria-label="Añadir capa de partículas"
              className="inline-flex items-center gap-0.5 rounded bg-orange-600 px-1.5 py-0.5 text-[10px] font-semibold text-white hover:bg-orange-500"
            >
              <Plus className="h-2.5 w-2.5" />
              Capa
            </button>
          </div>
        </div>

        <div className="flex flex-1 flex-col gap-1 overflow-y-auto">
          <button
            type="button"
            onClick={() => setActiveLayerId('base')}
            className={`flex items-center justify-between rounded border px-2 py-1 text-left text-[11px] transition-colors ${
              activeLayerId === 'base'
                ? 'border-orange-500/70 bg-orange-500/15 text-orange-200'
                : 'border-[#2b2b34] bg-[#1b1b22] text-zinc-300 hover:bg-[#22222b]'
            }`}
          >
            <span className="truncate font-medium">1. Capa Base</span>
            <span className="text-[9px] text-zinc-400">{emitter.preset}</span>
          </button>

          {extraLayers.map((layer, idx) => (
            <div
              key={layer.id}
              className={`flex items-center gap-1 rounded border px-1.5 py-1 text-[11px] ${
                activeLayerId === layer.id
                  ? 'border-orange-500/70 bg-orange-500/15 text-orange-200'
                  : 'border-[#2b2b34] bg-[#1b1b22] text-zinc-300'
              }`}
            >
              <input
                type="checkbox"
                aria-label={`Activar ${layer.name}`}
                checked={layer.enabled}
                onChange={(e) => {
                  const next = extraLayers.map((l) =>
                    l.id === layer.id ? { ...l, enabled: e.target.checked } : l
                  );
                  updateEmitter({ layers: next });
                }}
                className="accent-orange-500 shrink-0"
              />
              <button
                type="button"
                onClick={() => setActiveLayerId(layer.id)}
                className="min-w-0 flex-1 truncate text-left"
              >
                {idx + 2}. {layer.name}
              </button>
              <button
                type="button"
                aria-label={`Eliminar ${layer.name}`}
                onClick={() => handleDeleteLayer(layer.id)}
                className="rounded p-0.5 text-zinc-500 hover:bg-red-500/20 hover:text-red-300"
              >
                <Trash2 className="h-3 w-3" />
              </button>
            </div>
          ))}
        </div>
      </div>

      {/* Configuración y presets */}
      <div className="flex-1 space-y-2 min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-1.5 text-xs font-semibold text-orange-300">
            <Sparkles className="h-3.5 w-3.5" />
            <span>Estudio VFX Multicapa</span>
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

          {selectedExtraLayer && (
            <input
              type="text"
              aria-label="Nombre de la capa de partículas"
              value={selectedExtraLayer.name}
              onChange={(e) => updateActiveTarget({ name: e.target.value })}
              className="w-32 rounded border border-[#32323c] bg-[#141416] px-2 py-1 text-xs text-zinc-100"
            />
          )}
        </div>

        {/* Presets */}
        <div className="flex flex-wrap items-center gap-1">
          {PRESET_LIST.map((p) => (
            <button
              key={p.id}
              type="button"
              onClick={() => applyPreset(p.id)}
              className={`inline-flex items-center gap-1 rounded border px-2 py-1 text-[11px] font-medium transition-colors ${
                activeConfig.preset === p.id && emitter.enabled
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
            <NumericInput
              ariaLabel="Tasa de partículas por segundo"
              min={1}
              max={150}
              value={activeConfig.rate}
              onChange={(rate) => updateActiveTarget({ rate })}
              className="rounded border border-[#32323c] bg-[#141416] px-2 py-1 font-mono text-zinc-100"
            />
          </label>
          <label className="flex flex-col gap-0.5 text-zinc-400">
            <span>Vel. mín</span>
            <NumericInput
              ariaLabel="Velocidad mínima"
              value={activeConfig.speedMin}
              onChange={(speedMin) => updateActiveTarget({ speedMin })}
              className="rounded border border-[#32323c] bg-[#141416] px-2 py-1 font-mono text-zinc-100"
            />
          </label>
          <label className="flex flex-col gap-0.5 text-zinc-400">
            <span>Vel. máx</span>
            <NumericInput
              ariaLabel="Velocidad máxima"
              value={activeConfig.speedMax}
              onChange={(speedMax) => updateActiveTarget({ speedMax })}
              className="rounded border border-[#32323c] bg-[#141416] px-2 py-1 font-mono text-zinc-100"
            />
          </label>
          <label className="flex flex-col gap-0.5 text-zinc-400">
            <span>Ángulo (°)</span>
            <NumericInput
              ariaLabel="Ángulo de emisión"
              value={activeConfig.angleDeg}
              onChange={(angleDeg) => updateActiveTarget({ angleDeg })}
              className="rounded border border-[#32323c] bg-[#141416] px-2 py-1 font-mono text-zinc-100"
            />
          </label>
          <label className="flex flex-col gap-0.5 text-zinc-400">
            <span>Apertura (°)</span>
            <NumericInput
              ariaLabel="Apertura de emisión"
              min={0}
              max={360}
              value={activeConfig.spreadDeg}
              onChange={(spreadDeg) => updateActiveTarget({ spreadDeg })}
              className="rounded border border-[#32323c] bg-[#141416] px-2 py-1 font-mono text-zinc-100"
            />
          </label>
          <label className="flex flex-col gap-0.5 text-zinc-400">
            <span>Gravedad</span>
            <NumericInput
              ariaLabel="Gravedad de partículas"
              value={activeConfig.gravity}
              onChange={(gravity) => updateActiveTarget({ gravity })}
              className="rounded border border-[#32323c] bg-[#141416] px-2 py-1 font-mono text-zinc-100"
            />
          </label>
          <label className="flex flex-col gap-0.5 text-zinc-400">
            <span>Tam. inicio</span>
            <NumericInput
              ariaLabel="Tamaño inicial"
              min={1}
              max={48}
              value={activeConfig.sizeStart}
              onChange={(sizeStart) => updateActiveTarget({ sizeStart })}
              className="rounded border border-[#32323c] bg-[#141416] px-2 py-1 font-mono text-zinc-100"
            />
          </label>
          <label className="flex flex-col gap-0.5 text-zinc-400">
            <span>Tam. fin</span>
            <NumericInput
              ariaLabel="Tamaño final"
              min={0}
              max={48}
              value={activeConfig.sizeEnd}
              onChange={(sizeEnd) => updateActiveTarget({ sizeEnd })}
              className="rounded border border-[#32323c] bg-[#141416] px-2 py-1 font-mono text-zinc-100"
            />
          </label>
          <label className="flex flex-col gap-0.5 text-zinc-400">
            <span>Vida (s)</span>
            <NumericInput
              ariaLabel="Duración de vida"
              min={0.1}
              max={6}
              step={0.05}
              value={activeConfig.lifetime}
              onChange={(lifetime) => updateActiveTarget({ lifetime })}
              className="rounded border border-[#32323c] bg-[#141416] px-2 py-1 font-mono text-zinc-100"
            />
          </label>
          <label className="flex flex-col gap-0.5 text-zinc-400">
            <span>Opacidad</span>
            <NumericInput
              ariaLabel="Opacidad inicial"
              min={0}
              max={1}
              step={0.05}
              value={activeConfig.blendAlpha}
              onChange={(blendAlpha) => updateActiveTarget({ blendAlpha })}
              className="rounded border border-[#32323c] bg-[#141416] px-2 py-1 font-mono text-zinc-100"
            />
          </label>
          <label className="flex flex-col gap-0.5 text-zinc-400">
            <span>Color inicio</span>
            <input
              type="color"
              aria-label="Color inicio partículas"
              value={activeConfig.colorStart}
              onChange={(e) => updateActiveTarget({ colorStart: e.target.value })}
              className="h-7 w-full cursor-pointer rounded border border-[#32323c] bg-[#141416] p-0.5"
            />
          </label>
          <label className="flex flex-col gap-0.5 text-zinc-400">
            <span>Color fin</span>
            <input
              type="color"
              aria-label="Color fin partículas"
              value={activeConfig.colorEnd}
              onChange={(e) => updateActiveTarget({ colorEnd: e.target.value })}
              className="h-7 w-full cursor-pointer rounded border border-[#32323c] bg-[#141416] p-0.5"
            />
          </label>
          <label className="flex flex-col gap-0.5 text-zinc-400">
            <span>Rotación (°/s)</span>
            <NumericInput
              ariaLabel="Rotación grados por segundo"
              value={activeConfig.rotationSpeed ?? 0}
              onChange={(rotationSpeed) => updateActiveTarget({ rotationSpeed })}
              className="rounded border border-[#32323c] bg-[#141416] px-2 py-1 font-mono text-zinc-100"
            />
          </label>
          <label className="col-span-2 flex flex-col gap-0.5 text-zinc-400">
            <span>Textura PNG / Spritesheet</span>
            <select
              aria-label="Textura de partícula"
              value={activeConfig.textureAssetId ?? ''}
              onChange={(e) => updateActiveTarget({ textureAssetId: e.target.value || null })}
              className="rounded border border-[#32323c] bg-[#141416] px-2 py-1 text-zinc-100"
            >
              <option value="">Círculo GPU vectorial</option>
              {assets
                .filter((a) => (a.kind ?? 'image') === 'image')
                .map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name}.{a.format}
                  </option>
                ))}
            </select>
          </label>
          <label className="flex flex-col gap-0.5 text-zinc-400">
            <span>Cols / Filas</span>
            <div className="flex gap-1">
              <NumericInput
                ariaLabel="Columnas de textura"
                min={1}
                max={16}
                value={activeConfig.cols ?? 1}
                onChange={(cols) => updateActiveTarget({ cols: Math.max(1, Math.round(cols)) })}
                className="w-1/2 rounded border border-[#32323c] bg-[#141416] px-1.5 py-1 font-mono text-zinc-100"
              />
              <NumericInput
                ariaLabel="Filas de textura"
                min={1}
                max={16}
                value={activeConfig.rows ?? 1}
                onChange={(rows) => updateActiveTarget({ rows: Math.max(1, Math.round(rows)) })}
                className="w-1/2 rounded border border-[#32323c] bg-[#141416] px-1.5 py-1 font-mono text-zinc-100"
              />
            </div>
          </label>
          {selectedExtraLayer && (
            <label className="flex flex-col gap-0.5 text-zinc-400">
              <span>Desfase X / Y</span>
              <div className="flex gap-1">
                <NumericInput
                  ariaLabel="Desfase horizontal de capa"
                  value={selectedExtraLayer.offsetX ?? 0}
                  onChange={(offsetX) => updateActiveTarget({ offsetX })}
                  className="w-1/2 rounded border border-[#32323c] bg-[#141416] px-1.5 py-1 font-mono text-zinc-100"
                />
                <NumericInput
                  ariaLabel="Desfase vertical de capa"
                  value={selectedExtraLayer.offsetY ?? 0}
                  onChange={(offsetY) => updateActiveTarget({ offsetY })}
                  className="w-1/2 rounded border border-[#32323c] bg-[#141416] px-1.5 py-1 font-mono text-zinc-100"
                />
              </div>
            </label>
          )}
          <label className="flex items-center gap-1.5 pt-4 text-zinc-300 cursor-pointer">
            <input
              type="checkbox"
              checked={Boolean(activeConfig.additive)}
              onChange={(e) => updateActiveTarget({ additive: e.target.checked })}
              className="accent-orange-500"
            />
            <span>Brillo Aditivo</span>
          </label>
          <label className="flex flex-col gap-0.5 text-zinc-400">
            <span>Forma Emisor</span>
            <select
              aria-label="Forma de emisor"
              value={activeConfig.emitterShape ?? 'point'}
              onChange={(e) =>
                updateActiveTarget({ emitterShape: e.target.value as ParticleEmitterShape })
              }
              className="rounded border border-[#32323c] bg-[#141416] px-1.5 py-1 text-zinc-100"
            >
              <option value="point">Punto</option>
              <option value="sphere">Esfera</option>
              <option value="ring">Anillo</option>
              <option value="cone">Cono</option>
              <option value="box">Caja</option>
            </select>
          </label>
          <label className="flex flex-col gap-0.5 text-zinc-400">
            <span>Forma Partícula</span>
            <select
              aria-label="Forma de partícula"
              value={activeConfig.particleShape ?? 'circle'}
              onChange={(e) =>
                updateActiveTarget({ particleShape: e.target.value as ParticleRenderShape })
              }
              className="rounded border border-[#32323c] bg-[#141416] px-1.5 py-1 text-zinc-100"
            >
              <option value="circle">Círculo</option>
              <option value="liquid">Líquido / Gota</option>
              <option value="spark">Chispa</option>
              <option value="smoke">Humo suave</option>
              <option value="ring">Onda / Anillo</option>
            </select>
          </label>
          <label className="flex flex-col gap-0.5 text-zinc-400">
            <span>Fricción (Drag)</span>
            <NumericInput
              ariaLabel="Fricción o drag"
              min={0}
              max={10}
              step={0.1}
              value={activeConfig.drag ?? 0}
              onChange={(drag) => updateActiveTarget({ drag })}
              className="rounded border border-[#32323c] bg-[#141416] px-2 py-1 font-mono text-zinc-100"
            />
          </label>
          <label className="flex flex-col gap-0.5 text-zinc-400">
            <span>Turbulencia</span>
            <NumericInput
              ariaLabel="Turbulencia"
              min={0}
              max={400}
              value={activeConfig.turbulence ?? 0}
              onChange={(turbulence) => updateActiveTarget({ turbulence })}
              className="rounded border border-[#32323c] bg-[#141416] px-2 py-1 font-mono text-zinc-100"
            />
          </label>
          <label className="flex flex-col gap-0.5 text-zinc-400">
            <span>FPS Sprite</span>
            <NumericInput
              ariaLabel="FPS spritesheet de partícula"
              min={1}
              max={60}
              value={activeConfig.spritesheetFps ?? 12}
              onChange={(spritesheetFps) =>
                updateActiveTarget({ spritesheetFps: Math.max(1, Math.round(spritesheetFps)) })
              }
              className="rounded border border-[#32323c] bg-[#141416] px-2 py-1 font-mono text-zinc-100"
            />
          </label>
        </div>

        {/* Curvas de Vida interactivas SVG */}
        {(() => {
          const curCurveArr = activeConfig[activeCurveKind]?.length
            ? activeConfig[activeCurveKind]!
            : DEFAULT_CURVE_LINEAR_DOWN;
          const curCurve: CurvePt[] = toCurvePts(curCurveArr);
          const ptsAttr = curCurve
            .map((pt) => `${Math.round(pt.t * 220)},${Math.round((1 - Math.max(0, Math.min(1, pt.v))) * 48 + 4)}`)
            .join(' ');
          return (
            <div className="flex flex-wrap items-center gap-3 rounded border border-[#292933] bg-[#141419] px-2.5 py-1.5 text-[10px]">
              <div className="flex flex-col gap-1">
                <span className="font-semibold uppercase tracking-wide text-orange-300">
                  Curvas de Vida (clic en gráfica)
                </span>
                <div className="flex gap-1">
                  {(
                    [
                      ['sizeCurve', 'Tamaño'],
                      ['alphaCurve', 'Opacidad'],
                      ['speedCurve', 'Velocidad'],
                    ] as const
                  ).map(([k, lbl]) => (
                    <button
                      key={k}
                      type="button"
                      onClick={() => setActiveCurveKind(k)}
                      className={`rounded px-1.5 py-0.5 font-semibold ${
                        activeCurveKind === k
                          ? 'bg-orange-600 text-white'
                          : 'bg-[#1e1e26] text-zinc-400 hover:text-zinc-200'
                      }`}
                    >
                      {lbl}
                    </button>
                  ))}
                </div>
                <div className="flex gap-1">
                  {Object.entries(CURVE_PRESETS).map(([pName, pts]) => (
                    <button
                      key={pName}
                      type="button"
                      onClick={() => updateActiveTarget({ [activeCurveKind]: pts })}
                      className="rounded border border-[#2f2f3b] bg-[#1a1a22] px-1.5 py-0.5 text-[9px] text-zinc-300 hover:border-orange-400"
                    >
                      {pName}
                    </button>
                  ))}
                </div>
              </div>

              <svg
                width={220}
                height={56}
                aria-label="Editor SVG de curva de vida VFX"
                onClick={(e) => {
                  const rect = e.currentTarget.getBoundingClientRect();
                  const clickT = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
                  const clickV = Math.max(0, Math.min(1.5, 1 - (e.clientY - rect.top - 4) / 48));
                  const nextPts = [
                    ...curCurve.filter((p) => Math.abs(p.t - clickT) > 0.09),
                    { t: Number(clickT.toFixed(2)), v: Number(clickV.toFixed(2)) },
                  ]
                    .sort((a, b) => a.t - b.t)
                    .slice(0, 6);
                  updateActiveTarget({ [activeCurveKind]: resampleCurvePts(nextPts, 6) });
                }}
                className="cursor-crosshair rounded border border-[#2f2f3c] bg-[#0e0f14]"
              >
                <polyline
                  fill="none"
                  stroke="#fb923c"
                  strokeWidth={2}
                  points={ptsAttr}
                />
                {curCurve.map((pt, i) => (
                  <circle
                    key={i}
                    cx={pt.t * 220}
                    cy={(1 - Math.max(0, Math.min(1, pt.v))) * 48 + 4}
                    r={3.5}
                    fill="#fed7aa"
                    stroke="#ea580c"
                  />
                ))}
              </svg>
            </div>
          );
        })()}
      </div>

      {/* Vista previa en vivo */}
      <div className="hidden sm:flex w-52 shrink-0 flex-col items-center justify-center rounded border border-[#2c2c34] bg-[#0d0e12] p-1.5">
        <canvas
          ref={canvasRef}
          width={200}
          height={170}
          className="rounded"
        />
        <span className="mt-1 text-[10px] text-zinc-500">
          Vista previa ({1 + extraLayers.filter((l) => l.enabled).length} capas)
        </span>
      </div>
    </div>
  );
};
