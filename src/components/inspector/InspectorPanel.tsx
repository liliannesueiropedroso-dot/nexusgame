import React, { useState } from 'react';
import {
  ChevronDown,
  ChevronRight,
  Eraser,
  Paintbrush,
  Plus,
  RotateCcw,
  Trash2,
} from 'lucide-react';
import { SYNTH_PRESETS } from '../../engine/audio/audioEngine';
import {
  BEHAVIOR_CATEGORIES,
  getBehaviorEntry,
  searchBehaviors,
  type BehaviorCategory,
} from '../../engine/components/behaviorRegistry';
import {
  BEHAVIOR_DEFINITIONS,
  getBehaviorLabel,
  type BehaviorType,
} from '../../engine/components/behaviorTypes';
import { KeyCaptureField } from '../common/KeyCaptureField';
import {
  COLLISION_LAYERS,
  OBJECT_TYPE_LABELS,
  SCENE_KIND_LABELS,
  type Collider2D,
  type CollisionLayer,
  type GameObjectData,
  type SceneData,
  type SceneKind,
  type SceneTransitionType,
  type SpriteAnimationConfig,
  type SpriteFitMode,
  type TextureSamplingMode,
} from '../../engine/core/types';
import {
  PLATFORMER_PROFILES,
  resolvePlatformerConfig,
  resolveTopDownConfig,
  type MovementProfileId,
} from '../../engine/physics/characterController2d';
import { createDefaultColliderForObject } from '../../engine/physics/collision2d';
import type { ProjectAssetMeta } from '../../project/models/project';
import { clamp, roundTo } from '../../utils/format';
import { createId } from '../../utils/id';

interface InspectorPanelProps {
  scene: SceneData;
  scenes?: SceneData[];
  selectedObjects: GameObjectData[];
  assets: ProjectAssetMeta[];
  onUpdateObject: (id: string, updater: (obj: GameObjectData) => GameObjectData) => void;
  onUpdateScene: (updater: (scene: SceneData) => SceneData) => void;
  onActivateTileBrush?: () => void;
}

interface SectionProps {
  title: string;
  defaultOpen?: boolean;
  children: React.ReactNode;
}

const InspectorSection: React.FC<SectionProps> = ({
  title,
  defaultOpen = true,
  children,
}) => {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <section className="border-b border-[#2b2b33]">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="flex w-full items-center gap-1.5 bg-[#1e1e23] px-3 py-2 text-left text-[11px] font-semibold text-zinc-200 hover:bg-[#24242b]"
      >
        {open ? (
          <ChevronDown className="h-3.5 w-3.5 text-zinc-400" />
        ) : (
          <ChevronRight className="h-3.5 w-3.5 text-zinc-400" />
        )}
        <span>{title}</span>
      </button>
      {open && <div className="space-y-2.5 px-3 py-3">{children}</div>}
    </section>
  );
};

interface NumberInputRowProps {
  id: string;
  label: string;
  badge?: string;
  badgeColor?: string;
  value: number;
  step?: number;
  min?: number;
  max?: number;
  onChange: (val: number) => void;
}

const NumberField: React.FC<NumberInputRowProps> = ({
  id,
  label,
  badge,
  badgeColor,
  value,
  step = 1,
  min,
  max,
  onChange,
}) => {
  const displayValue = Number.isFinite(value) ? roundTo(value, 2) : 0;

  return (
    <div className="flex items-center overflow-hidden rounded border border-[#32323c] bg-[#141416] focus-within:border-blue-500">
      {badge ? (
        <label
          htmlFor={id}
          className={`flex w-6 shrink-0 items-center justify-center py-1 text-[10px] font-bold text-white select-none ${
            badgeColor ?? 'bg-[#2a2a32]'
          }`}
          title={label}
        >
          {badge}
        </label>
      ) : (
        <label
          htmlFor={id}
          className="px-2 py-1 text-[11px] text-zinc-400 select-none whitespace-nowrap"
        >
          {label}
        </label>
      )}
      <input
        id={id}
        type="number"
        step={step}
        min={min}
        max={max}
        aria-label={label}
        value={displayValue}
        onChange={(e) => {
          const parsed = Number(e.target.value);
          if (!Number.isNaN(parsed)) {
            let clamped = parsed;
            if (min !== undefined) clamped = Math.max(min, clamped);
            if (max !== undefined) clamped = Math.min(max, clamped);
            onChange(clamped);
          }
        }}
        className="w-full min-w-0 bg-transparent px-2 py-1 font-mono text-xs tabular-nums text-zinc-100 focus:outline-none"
      />
    </div>
  );
};

export const InspectorPanel: React.FC<InspectorPanelProps> = ({
  scene,
  scenes = [],
  selectedObjects,
  assets,
  onUpdateObject,
  onUpdateScene,
  onActivateTileBrush,
}) => {
  const [behaviorToAdd, setBehaviorToAdd] = useState<BehaviorType>('player_platformer');
  const [behaviorCategory, setBehaviorCategory] = useState<BehaviorCategory | 'Todas'>('Todas');
  const [behaviorQuery, setBehaviorQuery] = useState('');
  const imageAssets = assets.filter((a) => (a.kind ?? 'image') === 'image');
  const filteredBehaviors = searchBehaviors(behaviorQuery, behaviorCategory);
  const selectedBehaviorEntry =
    filteredBehaviors.find((b) => b.type === behaviorToAdd) ??
    filteredBehaviors[0] ??
    null;

  if (selectedObjects.length === 0) {
    const camCfg = scene.cameraConfig ?? {};
    return (
      <div className="flex h-full flex-col bg-[#1a1a1e] overflow-y-auto">
        <div className="border-b border-[#2e2e36] bg-[#16161a] px-3 py-2.5 text-xs font-semibold text-zinc-200">
          Inspector · Escena
        </div>

        <InspectorSection title="Propiedades de escena">
          <div className="space-y-1">
            <label htmlFor="scene-name" className="block text-[11px] text-zinc-400">
              Nombre de la escena
            </label>
            <input
              id="scene-name"
              type="text"
              value={scene.name}
              onChange={(e) =>
                onUpdateScene((s) => ({ ...s, name: e.target.value }))
              }
              className="w-full rounded border border-[#32323c] bg-[#141416] px-2.5 py-1.5 text-xs text-zinc-100 focus:border-blue-500 focus:outline-none"
            />
          </div>

          <div className="space-y-1">
            <label htmlFor="scene-kind" className="block text-[11px] text-zinc-400">
              Rol / Tipo de escena
            </label>
            <select
              id="scene-kind"
              value={scene.kind ?? 'level'}
              onChange={(e) =>
                onUpdateScene((s) => ({ ...s, kind: e.target.value as SceneKind }))
              }
              className="w-full rounded border border-[#32323c] bg-[#141416] px-2 py-1.5 text-xs text-zinc-100 focus:border-blue-500 focus:outline-none"
            >
              {(Object.keys(SCENE_KIND_LABELS) as SceneKind[]).map((k) => (
                <option key={k} value={k}>
                  {SCENE_KIND_LABELS[k]}
                </option>
              ))}
            </select>
          </div>

          {scenes.length > 1 && (
            <div className="space-y-1">
              <label htmlFor="scene-next" className="block text-[11px] text-zinc-400">
                Siguiente escena / nivel (nextLevel)
              </label>
              <select
                id="scene-next"
                value={scene.nextSceneId ?? ''}
                onChange={(e) =>
                  onUpdateScene((s) => ({
                    ...s,
                    nextSceneId: e.target.value || null,
                  }))
                }
                className="w-full rounded border border-[#32323c] bg-[#141416] px-2 py-1.5 text-xs text-zinc-100 focus:border-blue-500 focus:outline-none"
              >
                <option value="">Automático (siguiente en orden)</option>
                {scenes
                  .filter((sc) => sc.id !== scene.id)
                  .map((sc) => (
                    <option key={sc.id} value={sc.id}>
                      {sc.name}
                    </option>
                  ))}
              </select>
            </div>
          )}

          <div className="space-y-1">
            <label htmlFor="scene-bg" className="block text-[11px] text-zinc-400">
              Color de fondo
            </label>
            <div className="flex items-center gap-2">
              <input
                id="scene-bg"
                type="color"
                value={scene.backgroundColor}
                onChange={(e) =>
                  onUpdateScene((s) => ({ ...s, backgroundColor: e.target.value }))
                }
                className="h-7 w-9 cursor-pointer rounded border border-[#32323c] bg-[#141416] p-0.5"
              />
              <input
                type="text"
                aria-label="Color hexadecimal de escena"
                value={scene.backgroundColor}
                onChange={(e) =>
                  onUpdateScene((s) => ({ ...s, backgroundColor: e.target.value }))
                }
                className="flex-1 rounded border border-[#32323c] bg-[#141416] px-2.5 py-1 font-mono text-xs text-zinc-100 focus:border-blue-500 focus:outline-none"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2 pt-1">
            <label className="flex items-center gap-2 text-xs text-zinc-300 cursor-pointer">
              <input
                type="checkbox"
                checked={scene.gridVisible}
                onChange={(e) =>
                  onUpdateScene((s) => ({ ...s, gridVisible: e.target.checked }))
                }
                className="rounded border-zinc-600 bg-[#141416] accent-blue-500"
              />
              <span>Mostrar cuadrícula</span>
            </label>

            <label className="flex items-center gap-2 text-xs text-zinc-300 cursor-pointer">
              <input
                type="checkbox"
                checked={scene.snapToGrid}
                onChange={(e) =>
                  onUpdateScene((s) => ({ ...s, snapToGrid: e.target.checked }))
                }
                className="rounded border-zinc-600 bg-[#141416] accent-blue-500"
              />
              <span>Ajustar a rejilla</span>
            </label>
          </div>

          <NumberField
            id="scene-grid-size"
            label="Tamaño rejilla (px)"
            value={scene.gridSize}
            min={8}
            max={256}
            step={8}
            onChange={(val) =>
              onUpdateScene((s) => ({ ...s, gridSize: Math.max(8, Math.round(val)) }))
            }
          />
        </InspectorSection>

        <InspectorSection title="Cámara 2D (Seguimiento)" defaultOpen={false}>
          <div className="space-y-1">
            <label htmlFor="cam-follow" className="block text-[11px] text-zinc-400">
              Seguir objeto en ejecución
            </label>
            <select
              id="cam-follow"
              value={camCfg.followObjectId ?? ''}
              onChange={(e) =>
                onUpdateScene((s) => ({
                  ...s,
                  cameraConfig: {
                    ...s.cameraConfig,
                    followObjectId: e.target.value || null,
                  },
                }))
              }
              className="w-full rounded border border-[#32323c] bg-[#141416] px-2 py-1.5 text-xs text-zinc-100 focus:border-blue-500 focus:outline-none"
            >
              <option value="">Cámara fija en escenario</option>
              {scene.objects.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.name}
                </option>
              ))}
            </select>
          </div>

          {camCfg.followObjectId && (
            <>
              <div className="grid grid-cols-2 gap-1.5">
                <NumberField
                  id="cam-lerp"
                  label="Suavizado"
                  value={camCfg.lerp ?? 0.14}
                  min={0.02}
                  max={1}
                  step={0.02}
                  onChange={(lerp) =>
                    onUpdateScene((s) => ({
                      ...s,
                      cameraConfig: { ...s.cameraConfig, lerp },
                    }))
                  }
                />
                <NumberField
                  id="cam-dz-w"
                  label="Zona muerta X"
                  value={camCfg.deadzoneW ?? 60}
                  min={0}
                  max={600}
                  onChange={(deadzoneW) =>
                    onUpdateScene((s) => ({
                      ...s,
                      cameraConfig: { ...s.cameraConfig, deadzoneW },
                    }))
                  }
                />
              </div>

              <label className="flex items-center gap-2 text-xs text-zinc-300 cursor-pointer">
                <input
                  type="checkbox"
                  checked={Boolean(camCfg.clampToBounds)}
                  onChange={(e) =>
                    onUpdateScene((s) => ({
                      ...s,
                      cameraConfig: { ...s.cameraConfig, clampToBounds: e.target.checked },
                    }))
                  }
                  className="rounded border-zinc-600 bg-[#141416] accent-blue-500"
                />
                <span>Limitar cámara a bordes del mundo</span>
              </label>

              {camCfg.clampToBounds && (
                <div className="grid grid-cols-2 gap-1.5">
                  <NumberField
                    id="cam-world-w"
                    label="Mundo W"
                    value={camCfg.worldWidth ?? 2560}
                    min={128}
                    max={20000}
                    onChange={(worldWidth) =>
                      onUpdateScene((s) => ({
                        ...s,
                        cameraConfig: { ...s.cameraConfig, worldWidth },
                      }))
                    }
                  />
                  <NumberField
                    id="cam-world-h"
                    label="Mundo H"
                    value={camCfg.worldHeight ?? 1440}
                    min={128}
                    max={20000}
                    onChange={(worldHeight) =>
                      onUpdateScene((s) => ({
                        ...s,
                        cameraConfig: { ...s.cameraConfig, worldHeight },
                      }))
                    }
                  />
                </div>
              )}
            </>
          )}
        </InspectorSection>

        <InspectorSection title="Música de fondo de la escena" defaultOpen={true}>
          {(() => {
            const audioList = assets.filter((a) => a.kind === 'audio');
            const bgm = scene.backgroundMusic ?? {
              assetId: null,
              volume: 0.8,
              loop: true,
              autoPlay: true,
              keepPlayingIfSameTrack: true,
            };
            const patchBgm = (patch: Partial<NonNullable<SceneData['backgroundMusic']>>) => {
              onUpdateScene((s) => ({
                ...s,
                backgroundMusic: {
                  assetId: s.backgroundMusic?.assetId ?? null,
                  volume: s.backgroundMusic?.volume ?? 0.8,
                  loop: s.backgroundMusic?.loop ?? true,
                  autoPlay: s.backgroundMusic?.autoPlay ?? true,
                  keepPlayingIfSameTrack: s.backgroundMusic?.keepPlayingIfSameTrack ?? true,
                  ...patch,
                },
              }));
            };
            return (
              <div className="space-y-2">
                <div className="space-y-1">
                  <label htmlFor="scene-bgm-asset" className="block text-[11px] text-zinc-400">
                    Pista musical (importada desde PC)
                  </label>
                  <select
                    id="scene-bgm-asset"
                    value={bgm.assetId ?? ''}
                    onChange={(e) => patchBgm({ assetId: e.target.value || null })}
                    className="w-full rounded border border-[#32323c] bg-[#141416] px-2 py-1.5 text-xs text-zinc-100 focus:border-sky-500 focus:outline-none"
                  >
                    <option value="">Sin música de fondo</option>
                    {audioList.map((a) => (
                      <option key={a.id} value={a.id}>
                        🎵 {a.name} ({a.format.toUpperCase()})
                      </option>
                    ))}
                  </select>
                  {audioList.length === 0 && (
                    <p className="text-[10px] text-zinc-500">
                      Importa un MP3, WAV o OGG usando "+ Audio" en Recursos o en la pestaña Audio inferior.
                    </p>
                  )}
                </div>

                <NumberField
                  id="scene-bgm-vol"
                  label="Volumen"
                  value={bgm.volume ?? 0.8}
                  min={0}
                  max={1.5}
                  step={0.05}
                  onChange={(volume) => patchBgm({ volume })}
                />

                <div className="space-y-1 text-xs text-zinc-300">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={bgm.loop !== false}
                      onChange={(e) => patchBgm({ loop: e.target.checked })}
                      className="accent-sky-500"
                    />
                    <span>Repetir en bucle</span>
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={bgm.autoPlay !== false}
                      onChange={(e) => patchBgm({ autoPlay: e.target.checked })}
                      className="accent-sky-500"
                    />
                    <span>Iniciar al cargar escena</span>
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer text-[11px] text-zinc-400">
                    <input
                      type="checkbox"
                      checked={bgm.keepPlayingIfSameTrack !== false}
                      onChange={(e) => patchBgm({ keepPlayingIfSameTrack: e.target.checked })}
                      className="accent-sky-500"
                    />
                    <span>No reiniciar si otra escena usa la misma pista</span>
                  </label>
                </div>
              </div>
            );
          })()}
        </InspectorSection>

        <div className="px-3 py-4 text-[11px] text-zinc-500 leading-relaxed">
          Selecciona un objeto en el escenario o en el árbol de escena para inspeccionar y modificar sus propiedades, colisionadores y comportamientos.
        </div>
      </div>
    );
  }

  if (selectedObjects.length > 1) {
    return (
      <div className="flex h-full flex-col bg-[#1a1a1e]">
        <div className="border-b border-[#2e2e36] bg-[#16161a] px-3 py-2.5 text-xs font-semibold text-zinc-200">
          Inspector · Selección múltiple
        </div>
        <div className="p-4 text-xs text-zinc-300">
          <p className="font-medium text-zinc-100">
            {selectedObjects.length} objetos seleccionados
          </p>
          <p className="mt-1.5 text-zinc-400 leading-relaxed">
            Puedes moverlos juntos en el lienzo, duplicarlos (Ctrl+D) o eliminarlos (Suprimir). Selecciona un único objeto para editar sus campos individuales.
          </p>
        </div>
      </div>
    );
  }

  const obj = selectedObjects[0];
  const updateTransform = (patch: Partial<GameObjectData['transform']>) => {
    onUpdateObject(obj.id, (prev) => ({
      ...prev,
      transform: {
        ...prev.transform,
        ...patch,
      },
    }));
  };

  const handleResetTransform = () => {
    updateTransform({
      x: Math.round(obj.transform.x),
      y: Math.round(obj.transform.y),
      rotation: 0,
      scaleX: 1,
      scaleY: 1,
    });
  };

  return (
    <div className="flex h-full flex-col bg-[#1a1a1e] overflow-y-auto">
      <div className="border-b border-[#2e2e36] bg-[#16161a] px-3 py-2.5 text-xs font-semibold text-zinc-200">
        Inspector
      </div>

      {/* Propiedades generales */}
      <InspectorSection title="Propiedades generales">
        <div className="grid grid-cols-[72px_1fr] items-center gap-2">
          <label htmlFor="insp-name" className="text-[11px] text-zinc-400">
            Nombre
          </label>
          <input
            id="insp-name"
            type="text"
            value={obj.name}
            onChange={(e) =>
              onUpdateObject(obj.id, (prev) => ({ ...prev, name: e.target.value }))
            }
            className="w-full rounded border border-[#32323c] bg-[#141416] px-2 py-1 text-xs text-zinc-100 focus:border-blue-500 focus:outline-none"
          />
        </div>

        <div className="grid grid-cols-[72px_1fr] items-center gap-2">
          <span className="text-[11px] text-zinc-400">Tipo</span>
          <div className="rounded border border-[#2a2a33] bg-[#16161a] px-2 py-1 text-xs text-zinc-300">
            {OBJECT_TYPE_LABELS[obj.type]}
          </div>
        </div>

        <div className="grid grid-cols-[72px_1fr] items-center gap-2">
          <label htmlFor="insp-layer" className="text-[11px] text-zinc-400">
            Capa
          </label>
          <select
            id="insp-layer"
            value={obj.layer ?? 'Default'}
            onChange={(e) =>
              onUpdateObject(obj.id, (prev) => ({
                ...prev,
                layer: e.target.value as CollisionLayer,
              }))
            }
            className="w-full rounded border border-[#32323c] bg-[#141416] px-2 py-1 text-xs text-zinc-100 focus:border-blue-500 focus:outline-none"
          >
            {COLLISION_LAYERS.map((layer) => (
              <option key={layer} value={layer}>
                {layer}
              </option>
            ))}
          </select>
        </div>

        <div className="grid grid-cols-[72px_1fr] items-center gap-2">
          <label htmlFor="insp-tags" className="text-[11px] text-zinc-400">
            Etiquetas
          </label>
          <input
            id="insp-tags"
            type="text"
            placeholder="Enemy, Moneda, Peligro..."
            value={(obj.tags ?? []).join(', ')}
            onChange={(e) => {
              const tags = e.target.value
                .split(',')
                .map((t) => t.trim())
                .filter(Boolean);
              onUpdateObject(obj.id, (prev) => ({ ...prev, tags }));
            }}
            className="w-full rounded border border-[#32323c] bg-[#141416] px-2 py-1 text-xs text-zinc-100 focus:border-blue-500 focus:outline-none"
          />
        </div>

        <div className="grid grid-cols-2 gap-2 pt-0.5">
          <label className="flex items-center gap-2 text-xs text-zinc-300 cursor-pointer">
            <input
              type="checkbox"
              checked={obj.visible}
              onChange={(e) =>
                onUpdateObject(obj.id, (prev) => ({ ...prev, visible: e.target.checked }))
              }
              className="rounded border-zinc-600 bg-[#141416] accent-blue-500"
            />
            <span>Visible</span>
          </label>
          <label className="flex items-center gap-2 text-xs text-zinc-300 cursor-pointer">
            <input
              type="checkbox"
              checked={obj.locked}
              onChange={(e) =>
                onUpdateObject(obj.id, (prev) => ({ ...prev, locked: e.target.checked }))
              }
              className="rounded border-zinc-600 bg-[#141416] accent-amber-500"
            />
            <span>Bloqueado</span>
          </label>
        </div>

        <div className="space-y-1">
          <div className="flex items-center justify-between text-[11px]">
            <label htmlFor="insp-opacity" className="text-zinc-400">
              Opacidad
            </label>
            <span className="font-mono tabular-nums text-zinc-200">
              {Math.round(obj.opacity * 100)}%
            </span>
          </div>
          <div className="flex items-center gap-2">
            <input
              id="insp-opacity"
              type="range"
              min={0}
              max={1}
              step={0.01}
              value={obj.opacity}
              onChange={(e) =>
                onUpdateObject(obj.id, (prev) => ({
                  ...prev,
                  opacity: clamp(Number(e.target.value), 0, 1),
                }))
              }
              className="flex-1 accent-blue-500"
            />
            <input
              type="number"
              aria-label="Opacidad numérica"
              min={0}
              max={1}
              step={0.05}
              value={roundTo(obj.opacity, 2)}
              onChange={(e) => {
                const v = Number(e.target.value);
                if (!Number.isNaN(v)) {
                  onUpdateObject(obj.id, (prev) => ({
                    ...prev,
                    opacity: clamp(v, 0, 1),
                  }));
                }
              }}
              className="w-14 rounded border border-[#32323c] bg-[#141416] px-1.5 py-0.5 text-right font-mono text-xs tabular-nums text-zinc-100 focus:border-blue-500 focus:outline-none"
            />
          </div>
        </div>
      </InspectorSection>

      {/* Transformaciones */}
      <InspectorSection title="Transformaciones">
        <div className="space-y-1">
          <div className="text-[11px] text-zinc-400">Posición</div>
          <div className="grid grid-cols-2 gap-1.5">
            <NumberField
              id="insp-pos-x"
              label="Posición X"
              badge="X"
              badgeColor="bg-red-700/80"
              value={obj.transform.x}
              onChange={(x) => updateTransform({ x })}
            />
            <NumberField
              id="insp-pos-y"
              label="Posición Y"
              badge="Y"
              badgeColor="bg-emerald-700/80"
              value={obj.transform.y}
              onChange={(y) => updateTransform({ y })}
            />
          </div>
        </div>

        <div className="space-y-1">
          <div className="text-[11px] text-zinc-400">Rotación (°)</div>
          <NumberField
            id="insp-rotation"
            label="Rotación"
            badge="°"
            badgeColor="bg-sky-700/80"
            value={obj.transform.rotation}
            step={1}
            onChange={(rotation) => updateTransform({ rotation })}
          />
        </div>

        <div className="space-y-1">
          <div className="text-[11px] text-zinc-400">Escala</div>
          <div className="grid grid-cols-2 gap-1.5">
            <NumberField
              id="insp-scale-x"
              label="Escala X"
              badge="X"
              badgeColor="bg-red-700/80"
              value={obj.transform.scaleX}
              step={0.1}
              onChange={(scaleX) => updateTransform({ scaleX })}
            />
            <NumberField
              id="insp-scale-y"
              label="Escala Y"
              badge="Y"
              badgeColor="bg-emerald-700/80"
              value={obj.transform.scaleY}
              step={0.1}
              onChange={(scaleY) => updateTransform({ scaleY })}
            />
          </div>
        </div>

        <div className="space-y-1">
          <div className="text-[11px] text-zinc-400">Dimensiones base</div>
          <div className="grid grid-cols-2 gap-1.5">
            <NumberField
              id="insp-width"
              label="Ancho"
              badge="W"
              value={obj.transform.width}
              min={1}
              onChange={(width) => updateTransform({ width: Math.max(1, width) })}
            />
            <NumberField
              id="insp-height"
              label="Alto"
              badge="H"
              value={obj.transform.height}
              min={1}
              onChange={(height) => updateTransform({ height: Math.max(1, height) })}
            />
          </div>
        </div>

        <button
          type="button"
          onClick={handleResetTransform}
          className="mt-1 inline-flex w-full items-center justify-center gap-1.5 rounded border border-[#32323c] bg-[#222228] px-3 py-1.5 text-xs font-medium text-zinc-200 hover:bg-[#2c2c34]"
        >
          <RotateCcw className="h-3.5 w-3.5" />
          Restablecer transformaciones
        </button>
      </InspectorSection>

      {/* Propiedades específicas de Sprite + Ajuste de imagen (sin recorte inesperado) */}
      {obj.type === 'sprite' && obj.sprite && (() => {
        const currentAsset = obj.sprite.assetId
          ? assets.find((a) => a.id === obj.sprite!.assetId)
          : undefined;
        const fitMode = obj.sprite.fitMode ?? 'contain';
        const sampling = obj.sprite.sampling ?? 'linear';
        const aspectLocked = obj.sprite.aspectLocked ?? true;

        return (
          <InspectorSection title="Sprite e Imagen">
            <div className="space-y-1">
              <label htmlFor="insp-sprite-asset" className="block text-[11px] text-zinc-400">
                Recurso de imagen
              </label>
              <select
                id="insp-sprite-asset"
                value={obj.sprite.assetId ?? ''}
                onChange={(e) => {
                  const nextId = e.target.value || null;
                  const matched = assets.find((a) => a.id === nextId);
                  onUpdateObject(obj.id, (prev) => {
                    const prevW = prev.transform.width;
                    const prevH = prev.transform.height;
                    let nextTransform = prev.transform;
                    if (matched) {
                      const hadDefaultSize = !prev.sprite?.assetId && prevW === 128 && prevH === 128;
                      if (hadDefaultSize) {
                        nextTransform = {
                          ...prev.transform,
                          width: matched.width,
                          height: matched.height,
                        };
                      } else if (prev.sprite?.aspectLocked !== false) {
                        // Preservar escala visual sin recortar ni deformar
                        const ratio = matched.height / Math.max(1, matched.width);
                        nextTransform = {
                          ...prev.transform,
                          height: Math.max(8, Math.round(prevW * ratio)),
                        };
                      }
                    }
                    return {
                      ...prev,
                      transform: nextTransform,
                      sprite: {
                        ...prev.sprite!,
                        assetId: nextId,
                        fitMode: prev.sprite?.fitMode ?? 'contain',
                      },
                    };
                  });
                }}
                className="w-full rounded border border-[#32323c] bg-[#141416] px-2 py-1.5 text-xs text-zinc-100 focus:border-blue-500 focus:outline-none"
              >
                <option value="">Sin recurso asignado</option>
                {imageAssets.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name} ({a.width}×{a.height})
                  </option>
                ))}
              </select>
            </div>

            <div className="grid grid-cols-2 gap-1.5">
              <div className="space-y-1">
                <label htmlFor="insp-sprite-fit" className="block text-[11px] text-zinc-400">
                  Modo de ajuste
                </label>
                <select
                  id="insp-sprite-fit"
                  value={fitMode}
                  onChange={(e) =>
                    onUpdateObject(obj.id, (prev) => ({
                      ...prev,
                      sprite: {
                        ...prev.sprite!,
                        fitMode: e.target.value as SpriteFitMode,
                      },
                    }))
                  }
                  className="w-full rounded border border-[#32323c] bg-[#141416] px-2 py-1 text-xs text-zinc-100 focus:border-blue-500 focus:outline-none"
                >
                  <option value="contain">Contener (sin corte)</option>
                  <option value="original">Tamaño original</option>
                  <option value="cover">Cubrir (Cover)</option>
                  <option value="stretch">Estirar (Stretch)</option>
                  <option value="crop">Recortar región</option>
                  <option value="tile">Repetir (Mosaico)</option>
                </select>
              </div>

              <div className="space-y-1">
                <label htmlFor="insp-sprite-sampling" className="block text-[11px] text-zinc-400">
                  Filtrado textura
                </label>
                <select
                  id="insp-sprite-sampling"
                  value={sampling}
                  onChange={(e) =>
                    onUpdateObject(obj.id, (prev) => ({
                      ...prev,
                      sprite: {
                        ...prev.sprite!,
                        sampling: e.target.value as TextureSamplingMode,
                      },
                    }))
                  }
                  className="w-full rounded border border-[#32323c] bg-[#141416] px-2 py-1 text-xs text-zinc-100 focus:border-blue-500 focus:outline-none"
                >
                  <option value="linear">Suave (Linear)</option>
                  <option value="nearest">Pixel Art (Nearest)</option>
                </select>
              </div>
            </div>

            {fitMode === 'crop' && (
              <div className="grid grid-cols-2 gap-1.5 rounded border border-[#2d2d37] bg-[#15151a] p-2">
                <NumberField
                  id="insp-crop-x"
                  label="X"
                  value={obj.sprite.cropRect?.x ?? 0}
                  min={0}
                  onChange={(x) =>
                    onUpdateObject(obj.id, (prev) => ({
                      ...prev,
                      sprite: {
                        ...prev.sprite!,
                        cropRect: {
                          x,
                          y: prev.sprite!.cropRect?.y ?? 0,
                          width: prev.sprite!.cropRect?.width ?? 64,
                          height: prev.sprite!.cropRect?.height ?? 64,
                        },
                      },
                    }))
                  }
                />
                <NumberField
                  id="insp-crop-y"
                  label="Y"
                  value={obj.sprite.cropRect?.y ?? 0}
                  min={0}
                  onChange={(y) =>
                    onUpdateObject(obj.id, (prev) => ({
                      ...prev,
                      sprite: {
                        ...prev.sprite!,
                        cropRect: {
                          x: prev.sprite!.cropRect?.x ?? 0,
                          y,
                          width: prev.sprite!.cropRect?.width ?? 64,
                          height: prev.sprite!.cropRect?.height ?? 64,
                        },
                      },
                    }))
                  }
                />
                <NumberField
                  id="insp-crop-w"
                  label="W"
                  value={obj.sprite.cropRect?.width ?? 64}
                  min={1}
                  onChange={(width) =>
                    onUpdateObject(obj.id, (prev) => ({
                      ...prev,
                      sprite: {
                        ...prev.sprite!,
                        cropRect: {
                          x: prev.sprite!.cropRect?.x ?? 0,
                          y: prev.sprite!.cropRect?.y ?? 0,
                          width,
                          height: prev.sprite!.cropRect?.height ?? 64,
                        },
                      },
                    }))
                  }
                />
                <NumberField
                  id="insp-crop-h"
                  label="H"
                  value={obj.sprite.cropRect?.height ?? 64}
                  min={1}
                  onChange={(height) =>
                    onUpdateObject(obj.id, (prev) => ({
                      ...prev,
                      sprite: {
                        ...prev.sprite!,
                        cropRect: {
                          x: prev.sprite!.cropRect?.x ?? 0,
                          y: prev.sprite!.cropRect?.y ?? 0,
                          width: prev.sprite!.cropRect?.width ?? 64,
                          height,
                        },
                      },
                    }))
                  }
                />
              </div>
            )}

            <label className="flex items-center gap-2 text-xs text-zinc-300 cursor-pointer">
              <input
                type="checkbox"
                checked={aspectLocked}
                onChange={(e) =>
                  onUpdateObject(obj.id, (prev) => ({
                    ...prev,
                    sprite: { ...prev.sprite!, aspectLocked: e.target.checked },
                  }))
                }
                className="rounded border-zinc-600 bg-[#141416] accent-blue-500"
              />
              <span>Mantener relación de aspecto al cambiar imagen</span>
            </label>

            {currentAsset && (
              <button
                type="button"
                onClick={() =>
                  updateTransform({
                    width: currentAsset.width,
                    height: currentAsset.height,
                  })
                }
                className="w-full rounded border border-[#32323c] bg-[#222228] px-2.5 py-1 text-[11px] font-medium text-zinc-200 hover:bg-[#2c2c34]"
              >
                Restaurar tamaño original ({currentAsset.width}×{currentAsset.height})
              </button>
            )}

            <div className="space-y-1">
              <label htmlFor="insp-sprite-tint" className="block text-[11px] text-zinc-400">
                Tinte de color
              </label>
              <div className="flex items-center gap-2">
                <input
                  id="insp-sprite-tint"
                  type="color"
                  value={obj.sprite.tint}
                  onChange={(e) =>
                    onUpdateObject(obj.id, (prev) => ({
                      ...prev,
                      sprite: { ...prev.sprite!, tint: e.target.value },
                    }))
                  }
                  className="h-7 w-9 cursor-pointer rounded border border-[#32323c] bg-[#141416] p-0.5"
                />
                <input
                  type="text"
                  aria-label="Tinte hexadecimal"
                  value={obj.sprite.tint}
                  onChange={(e) =>
                    onUpdateObject(obj.id, (prev) => ({
                      ...prev,
                      sprite: { ...prev.sprite!, tint: e.target.value },
                    }))
                  }
                  className="flex-1 rounded border border-[#32323c] bg-[#141416] px-2 py-1 font-mono text-xs text-zinc-100 focus:border-blue-500 focus:outline-none"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2 pt-1">
              <label className="flex items-center gap-2 text-xs text-zinc-300 cursor-pointer">
                <input
                  type="checkbox"
                  checked={obj.sprite.flipX}
                  onChange={(e) =>
                    onUpdateObject(obj.id, (prev) => ({
                      ...prev,
                      sprite: { ...prev.sprite!, flipX: e.target.checked },
                    }))
                  }
                  className="rounded border-zinc-600 bg-[#141416] accent-blue-500"
                />
                <span>Voltear X</span>
              </label>
              <label className="flex items-center gap-2 text-xs text-zinc-300 cursor-pointer">
                <input
                  type="checkbox"
                  checked={obj.sprite.flipY}
                  onChange={(e) =>
                    onUpdateObject(obj.id, (prev) => ({
                      ...prev,
                      sprite: { ...prev.sprite!, flipY: e.target.checked },
                    }))
                  }
                  className="rounded border-zinc-600 bg-[#141416] accent-blue-500"
                />
                <span>Voltear Y</span>
              </label>
            </div>
          </InspectorSection>
        );
      })()}

      {obj.type === 'sprite' && obj.sprite && (() => {
        const anim: SpriteAnimationConfig = obj.sprite.animation ?? {
          enabled: false,
          cols: 1,
          rows: 1,
          frameCount: 1,
          fps: 8,
          loop: true,
          playing: true,
        };
        const spriteAsset = obj.sprite.assetId
          ? assets.find((a) => a.id === obj.sprite!.assetId)
          : undefined;
        const patchAnim = (patch: Partial<SpriteAnimationConfig>) => {
          onUpdateObject(obj.id, (prev) => ({
            ...prev,
            sprite: {
              ...prev.sprite!,
              animation: {
                ...(prev.sprite!.animation ?? anim),
                ...patch,
              },
            },
          }));
        };
        return (
          <InspectorSection title="Animación (Spritesheet)" defaultOpen={anim.enabled}>
            <label className="flex items-center gap-2 text-xs text-zinc-200 cursor-pointer">
              <input
                type="checkbox"
                checked={anim.enabled}
                onChange={(e) => patchAnim({ enabled: e.target.checked })}
                className="rounded border-zinc-600 bg-[#141416] accent-blue-500"
              />
              <span>Activar animación por cuadrícula</span>
            </label>

            {anim.enabled && (
              <>
                <div className="grid grid-cols-2 gap-1.5">
                  <NumberField
                    id="insp-anim-cols"
                    label="Cols"
                    value={anim.cols}
                    min={1}
                    max={64}
                    onChange={(cols) => {
                      const safeCols = Math.max(1, Math.round(cols));
                      patchAnim({
                        cols: safeCols,
                        frameCount: Math.max(1, safeCols * anim.rows),
                      });
                    }}
                  />
                  <NumberField
                    id="insp-anim-rows"
                    label="Filas"
                    value={anim.rows}
                    min={1}
                    max={64}
                    onChange={(rows) => {
                      const safeRows = Math.max(1, Math.round(rows));
                      patchAnim({
                        rows: safeRows,
                        frameCount: Math.max(1, anim.cols * safeRows),
                      });
                    }}
                  />
                  <NumberField
                    id="insp-anim-frames"
                    label="Frames"
                    value={anim.frameCount}
                    min={1}
                    max={Math.max(1, anim.cols * anim.rows)}
                    onChange={(frameCount) =>
                      patchAnim({ frameCount: Math.max(1, Math.round(frameCount)) })
                    }
                  />
                  <NumberField
                    id="insp-anim-fps"
                    label="FPS"
                    value={anim.fps}
                    min={1}
                    max={60}
                    onChange={(fps) => patchAnim({ fps: Math.max(1, Math.round(fps)) })}
                  />
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <label className="flex items-center gap-2 text-xs text-zinc-300 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={anim.loop}
                      onChange={(e) => patchAnim({ loop: e.target.checked })}
                      className="rounded border-zinc-600 bg-[#141416] accent-blue-500"
                    />
                    <span>Bucle</span>
                  </label>
                  <label className="flex items-center gap-2 text-xs text-zinc-300 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={anim.playing}
                      onChange={(e) => patchAnim({ playing: e.target.checked })}
                      className="rounded border-zinc-600 bg-[#141416] accent-blue-500"
                    />
                    <span>Reproducir</span>
                  </label>
                </div>

                <label className="flex items-center gap-2 rounded border border-[#2d2d37] bg-[#141418] px-2 py-1.5 text-xs text-zinc-200 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={Boolean(anim.linkToMovement)}
                    onChange={(e) => patchAnim({ linkToMovement: e.target.checked })}
                    className="rounded border-zinc-600 bg-[#141416] accent-emerald-500"
                  />
                  <span>Vincular reproducción al movimiento (idle / walk)</span>
                </label>

                {spriteAsset && (
                  <button
                    type="button"
                    onClick={() => {
                      const fw = Math.max(8, Math.round(spriteAsset.width / Math.max(1, anim.cols)));
                      const fh = Math.max(8, Math.round(spriteAsset.height / Math.max(1, anim.rows)));
                      updateTransform({ width: fw, height: fh });
                    }}
                    className="w-full rounded border border-[#32323c] bg-[#222228] px-2.5 py-1 text-[11px] font-medium text-zinc-200 hover:bg-[#2c2c34]"
                  >
                    Ajustar tamaño al fotograma ({Math.round(spriteAsset.width / Math.max(1, anim.cols))}×
                    {Math.round(spriteAsset.height / Math.max(1, anim.rows))})
                  </button>
                )}
              </>
            )}
          </InspectorSection>
        );
      })()}

      {obj.type === 'rectangle' && obj.rectangle && (
        <InspectorSection title="Rectángulo">
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label htmlFor="insp-rect-fill" className="mb-1 block text-[11px] text-zinc-400">
                Relleno
              </label>
              <input
                id="insp-rect-fill"
                type="color"
                value={obj.rectangle.fillColor}
                onChange={(e) =>
                  onUpdateObject(obj.id, (prev) => ({
                    ...prev,
                    rectangle: { ...prev.rectangle!, fillColor: e.target.value },
                  }))
                }
                className="h-7 w-full cursor-pointer rounded border border-[#32323c] bg-[#141416] p-0.5"
              />
            </div>
            <div>
              <label htmlFor="insp-rect-stroke" className="mb-1 block text-[11px] text-zinc-400">
                Borde
              </label>
              <input
                id="insp-rect-stroke"
                type="color"
                value={obj.rectangle.strokeColor}
                onChange={(e) =>
                  onUpdateObject(obj.id, (prev) => ({
                    ...prev,
                    rectangle: { ...prev.rectangle!, strokeColor: e.target.value },
                  }))
                }
                className="h-7 w-full cursor-pointer rounded border border-[#32323c] bg-[#141416] p-0.5"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <NumberField
              id="insp-rect-sw"
              label="Grosor"
              value={obj.rectangle.strokeWidth}
              min={0}
              max={32}
              onChange={(strokeWidth) =>
                onUpdateObject(obj.id, (prev) => ({
                  ...prev,
                  rectangle: { ...prev.rectangle!, strokeWidth },
                }))
              }
            />
            <NumberField
              id="insp-rect-rad"
              label="Radio"
              value={obj.rectangle.cornerRadius}
              min={0}
              max={200}
              onChange={(cornerRadius) =>
                onUpdateObject(obj.id, (prev) => ({
                  ...prev,
                  rectangle: { ...prev.rectangle!, cornerRadius },
                }))
              }
            />
          </div>
        </InspectorSection>
      )}

      {obj.type === 'circle' && obj.circle && (
        <InspectorSection title="Círculo">
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label htmlFor="insp-circ-fill" className="mb-1 block text-[11px] text-zinc-400">
                Relleno
              </label>
              <input
                id="insp-circ-fill"
                type="color"
                value={obj.circle.fillColor}
                onChange={(e) =>
                  onUpdateObject(obj.id, (prev) => ({
                    ...prev,
                    circle: { ...prev.circle!, fillColor: e.target.value },
                  }))
                }
                className="h-7 w-full cursor-pointer rounded border border-[#32323c] bg-[#141416] p-0.5"
              />
            </div>
            <div>
              <label htmlFor="insp-circ-stroke" className="mb-1 block text-[11px] text-zinc-400">
                Borde
              </label>
              <input
                id="insp-circ-stroke"
                type="color"
                value={obj.circle.strokeColor}
                onChange={(e) =>
                  onUpdateObject(obj.id, (prev) => ({
                    ...prev,
                    circle: { ...prev.circle!, strokeColor: e.target.value },
                  }))
                }
                className="h-7 w-full cursor-pointer rounded border border-[#32323c] bg-[#141416] p-0.5"
              />
            </div>
          </div>

          <NumberField
            id="insp-circ-sw"
            label="Grosor de borde"
            value={obj.circle.strokeWidth}
            min={0}
            max={32}
            onChange={(strokeWidth) =>
              onUpdateObject(obj.id, (prev) => ({
                ...prev,
                circle: { ...prev.circle!, strokeWidth },
              }))
            }
          />
        </InspectorSection>
      )}

      {obj.type === 'text' && obj.text && (
        <InspectorSection title="Texto y Enlace de Variable">
          <div className="space-y-1">
            <label htmlFor="insp-text-content" className="block text-[11px] text-zinc-400">
              Contenido (usa {'{puntos}'} o {'{value}'})
            </label>
            <textarea
              id="insp-text-content"
              rows={2}
              value={obj.text.text}
              onChange={(e) =>
                onUpdateObject(obj.id, (prev) => ({
                  ...prev,
                  text: { ...prev.text!, text: e.target.value },
                }))
              }
              className="w-full rounded border border-[#32323c] bg-[#141416] px-2 py-1.5 text-xs text-zinc-100 focus:border-blue-500 focus:outline-none"
            />
          </div>

          <div className="space-y-1">
            <label htmlFor="insp-text-bind" className="block text-[11px] text-zinc-400">
              Variable enlazada (opcional)
            </label>
            <input
              id="insp-text-bind"
              type="text"
              placeholder="Ej. puntos, salud, tiempo"
              value={obj.text.bindVariable ?? ''}
              onChange={(e) =>
                onUpdateObject(obj.id, (prev) => ({
                  ...prev,
                  text: { ...prev.text!, bindVariable: e.target.value || undefined },
                }))
              }
              className="w-full rounded border border-[#32323c] bg-[#141416] px-2 py-1 font-mono text-xs text-zinc-100 focus:border-blue-500 focus:outline-none"
            />
          </div>

          <div className="grid grid-cols-2 gap-2">
            <NumberField
              id="insp-text-size"
              label="Tamaño"
              value={obj.text.fontSize}
              min={8}
              max={256}
              onChange={(fontSize) =>
                onUpdateObject(obj.id, (prev) => ({
                  ...prev,
                  text: { ...prev.text!, fontSize },
                }))
              }
            />
            <div>
              <label htmlFor="insp-text-color" className="sr-only">
                Color del texto
              </label>
              <input
                id="insp-text-color"
                type="color"
                value={obj.text.color}
                onChange={(e) =>
                  onUpdateObject(obj.id, (prev) => ({
                    ...prev,
                    text: { ...prev.text!, color: e.target.value },
                  }))
                }
                className="h-7 w-full cursor-pointer rounded border border-[#32323c] bg-[#141416] p-0.5"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <select
              aria-label="Peso de fuente"
              value={obj.text.fontWeight}
              onChange={(e) =>
                onUpdateObject(obj.id, (prev) => ({
                  ...prev,
                  text: {
                    ...prev.text!,
                    fontWeight: e.target.value as 'normal' | 'bold',
                  },
                }))
              }
              className="rounded border border-[#32323c] bg-[#141416] px-2 py-1 text-xs text-zinc-100 focus:border-blue-500 focus:outline-none"
            >
              <option value="normal">Normal</option>
              <option value="bold">Negrita</option>
            </select>

            <select
              aria-label="Alineación del texto"
              value={obj.text.align}
              onChange={(e) =>
                onUpdateObject(obj.id, (prev) => ({
                  ...prev,
                  text: {
                    ...prev.text!,
                    align: e.target.value as 'left' | 'center' | 'right',
                  },
                }))
              }
              className="rounded border border-[#32323c] bg-[#141416] px-2 py-1 text-xs text-zinc-100 focus:border-blue-500 focus:outline-none"
            >
              <option value="left">Izquierda</option>
              <option value="center">Centro</option>
              <option value="right">Derecha</option>
            </select>
          </div>
        </InspectorSection>
      )}

      {obj.type === 'ui_button' && obj.uiButton && (
        <InspectorSection title="Botón UI Interactivo">
          <div className="space-y-1">
            <label htmlFor="insp-btn-text" className="block text-[11px] text-zinc-400">
              Texto del botón
            </label>
            <input
              id="insp-btn-text"
              type="text"
              value={obj.uiButton.text}
              onChange={(e) =>
                onUpdateObject(obj.id, (prev) => ({
                  ...prev,
                  uiButton: { ...prev.uiButton!, text: e.target.value },
                }))
              }
              className="w-full rounded border border-[#32323c] bg-[#141416] px-2 py-1 text-xs text-zinc-100 focus:border-blue-500 focus:outline-none"
            />
          </div>

          <div className="grid grid-cols-3 gap-1.5">
            <div>
              <span className="block text-[10px] text-zinc-400 mb-0.5">Fondo</span>
              <input
                type="color"
                aria-label="Color fondo botón"
                value={obj.uiButton.bgColor}
                onChange={(e) =>
                  onUpdateObject(obj.id, (prev) => ({
                    ...prev,
                    uiButton: { ...prev.uiButton!, bgColor: e.target.value },
                  }))
                }
                className="h-7 w-full cursor-pointer rounded border border-[#32323c] bg-[#141416] p-0.5"
              />
            </div>
            <div>
              <span className="block text-[10px] text-zinc-400 mb-0.5">Hover</span>
              <input
                type="color"
                aria-label="Color hover botón"
                value={obj.uiButton.hoverColor}
                onChange={(e) =>
                  onUpdateObject(obj.id, (prev) => ({
                    ...prev,
                    uiButton: { ...prev.uiButton!, hoverColor: e.target.value },
                  }))
                }
                className="h-7 w-full cursor-pointer rounded border border-[#32323c] bg-[#141416] p-0.5"
              />
            </div>
            <div>
              <span className="block text-[10px] text-zinc-400 mb-0.5">Texto</span>
              <input
                type="color"
                aria-label="Color texto botón"
                value={obj.uiButton.textColor}
                onChange={(e) =>
                  onUpdateObject(obj.id, (prev) => ({
                    ...prev,
                    uiButton: { ...prev.uiButton!, textColor: e.target.value },
                  }))
                }
                className="h-7 w-full cursor-pointer rounded border border-[#32323c] bg-[#141416] p-0.5"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-1.5">
            <NumberField
              id="insp-btn-fs"
              label="Fuente"
              value={obj.uiButton.fontSize}
              min={8}
              max={96}
              onChange={(fontSize) =>
                onUpdateObject(obj.id, (prev) => ({
                  ...prev,
                  uiButton: { ...prev.uiButton!, fontSize },
                }))
              }
            />
            <NumberField
              id="insp-btn-rad"
              label="Radio"
              value={obj.uiButton.borderRadius}
              min={0}
              max={64}
              onChange={(borderRadius) =>
                onUpdateObject(obj.id, (prev) => ({
                  ...prev,
                  uiButton: { ...prev.uiButton!, borderRadius },
                }))
              }
            />
          </div>

          <div className="space-y-1">
            <label htmlFor="insp-btn-action" className="block text-[11px] text-zinc-400">
              Acción rápida al hacer clic
            </label>
            <select
              id="insp-btn-action"
              value={obj.uiButton.onClickAction ?? 'none'}
              onChange={(e) =>
                onUpdateObject(obj.id, (prev) => ({
                  ...prev,
                  uiButton: {
                    ...prev.uiButton!,
                    onClickAction: e.target.value as NonNullable<
                      GameObjectData['uiButton']
                    >['onClickAction'],
                  },
                }))
              }
              className="w-full rounded border border-[#32323c] bg-[#141416] px-2 py-1 text-xs text-zinc-100 focus:border-blue-500 focus:outline-none"
            >
              <option value="none">Usar regla de Mecánicas (ui.click)</option>
              <option value="load_scene">Ir a escena / nivel</option>
              <option value="overlay_scene">Abrir panel superpuesto (Overlay)</option>
              <option value="pop_scene">Cerrar panel actual (Volver)</option>
              <option value="restart_scene">Reiniciar escena actual</option>
              <option value="next_level">Siguiente nivel</option>
              <option value="emit_event">Emitir evento personalizado</option>
            </select>
          </div>

          {(obj.uiButton.onClickAction === 'load_scene' ||
            obj.uiButton.onClickAction === 'overlay_scene') && (
            <div className="space-y-1.5">
              <select
                aria-label="Escena destino del botón"
                value={obj.uiButton.targetSceneId ?? ''}
                onChange={(e) =>
                  onUpdateObject(obj.id, (prev) => ({
                    ...prev,
                    uiButton: { ...prev.uiButton!, targetSceneId: e.target.value },
                  }))
                }
                className="w-full rounded border border-[#32323c] bg-[#141416] px-2 py-1 text-xs text-zinc-100"
              >
                <option value="">Seleccionar escena destino...</option>
                {scenes.map((sc) => (
                  <option key={sc.id} value={sc.id}>
                    {sc.name}
                  </option>
                ))}
              </select>
              <select
                aria-label="Transición"
                value={obj.uiButton.transition ?? 'fadeBlack'}
                onChange={(e) =>
                  onUpdateObject(obj.id, (prev) => ({
                    ...prev,
                    uiButton: {
                      ...prev.uiButton!,
                      transition: e.target.value as SceneTransitionType,
                    },
                  }))
                }
                className="w-full rounded border border-[#32323c] bg-[#141416] px-2 py-1 text-xs text-zinc-100"
              >
                <option value="fadeBlack">Fundido negro</option>
                <option value="fadeWhite">Fundido blanco</option>
                <option value="none">Instantánea</option>
              </select>
            </div>
          )}

          {obj.uiButton.onClickAction === 'emit_event' && (
            <input
              type="text"
              placeholder="Nombre del evento (ej. abrir_tienda)"
              value={obj.uiButton.eventName ?? ''}
              onChange={(e) =>
                onUpdateObject(obj.id, (prev) => ({
                  ...prev,
                  uiButton: { ...prev.uiButton!, eventName: e.target.value },
                }))
              }
              className="w-full rounded border border-[#32323c] bg-[#141416] px-2 py-1 text-xs text-zinc-100"
            />
          )}

          <div className="space-y-1.5 border-t border-[#2a2a33] pt-2">
            <label htmlFor="insp-btn-snd-asset" className="block text-[11px] text-zinc-400">
              Sonido al pulsar (PC o integrado)
            </label>
            <select
              id="insp-btn-snd-asset"
              value={obj.uiButton.clickSoundAssetId ?? ''}
              onChange={(e) =>
                onUpdateObject(obj.id, (prev) => ({
                  ...prev,
                  uiButton: {
                    ...prev.uiButton!,
                    clickSoundAssetId: e.target.value || null,
                  },
                }))
              }
              className="w-full rounded border border-[#32323c] bg-[#141416] px-2 py-1 text-xs text-zinc-100 focus:border-sky-500 focus:outline-none"
            >
              <option value="">Usar efecto integrado por defecto</option>
              {assets
                .filter((a) => a.kind === 'audio')
                .map((a) => (
                  <option key={a.id} value={a.id}>
                    🔊 {a.name} ({a.format.toUpperCase()})
                  </option>
                ))}
            </select>
            {!obj.uiButton.clickSoundAssetId && (
              <select
                aria-label="Efecto integrado al pulsar"
                value={obj.uiButton.clickSoundPreset ?? 'coin'}
                onChange={(e) =>
                  onUpdateObject(obj.id, (prev) => ({
                    ...prev,
                    uiButton: {
                      ...prev.uiButton!,
                      clickSoundPreset: e.target.value,
                    },
                  }))
                }
                className="w-full rounded border border-[#32323c] bg-[#141416] px-2 py-1 text-xs text-zinc-100"
              >
                <option value="none">Silencio (sin sonido)</option>
                {SYNTH_PRESETS.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.label}
                  </option>
                ))}
              </select>
            )}
          </div>
        </InspectorSection>
      )}

      {obj.type === 'ui_panel' && obj.uiPanel && (
        <InspectorSection title="Panel UI">
          <div className="grid grid-cols-2 gap-2">
            <div>
              <span className="mb-1 block text-[11px] text-zinc-400">Fondo</span>
              <input
                type="color"
                aria-label="Fondo panel"
                value={obj.uiPanel.bgColor}
                onChange={(e) =>
                  onUpdateObject(obj.id, (prev) => ({
                    ...prev,
                    uiPanel: { ...prev.uiPanel!, bgColor: e.target.value },
                  }))
                }
                className="h-7 w-full cursor-pointer rounded border border-[#32323c] bg-[#141416] p-0.5"
              />
            </div>
            <div>
              <span className="mb-1 block text-[11px] text-zinc-400">Borde</span>
              <input
                type="color"
                aria-label="Borde panel"
                value={obj.uiPanel.borderColor}
                onChange={(e) =>
                  onUpdateObject(obj.id, (prev) => ({
                    ...prev,
                    uiPanel: { ...prev.uiPanel!, borderColor: e.target.value },
                  }))
                }
                className="h-7 w-full cursor-pointer rounded border border-[#32323c] bg-[#141416] p-0.5"
              />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-1.5">
            <NumberField
              id="insp-panel-bw"
              label="Grosor"
              value={obj.uiPanel.borderWidth}
              min={0}
              max={24}
              onChange={(borderWidth) =>
                onUpdateObject(obj.id, (prev) => ({
                  ...prev,
                  uiPanel: { ...prev.uiPanel!, borderWidth },
                }))
              }
            />
            <NumberField
              id="insp-panel-rad"
              label="Radio"
              value={obj.uiPanel.borderRadius}
              min={0}
              max={64}
              onChange={(borderRadius) =>
                onUpdateObject(obj.id, (prev) => ({
                  ...prev,
                  uiPanel: { ...prev.uiPanel!, borderRadius },
                }))
              }
            />
          </div>
        </InspectorSection>
      )}

      {obj.type === 'ui_progress_bar' && obj.uiProgressBar && (
        <InspectorSection title="Barra de Progreso / Vida">
          <div className="grid grid-cols-2 gap-1.5">
            <div className="space-y-1">
              <label htmlFor="insp-bar-var" className="block text-[11px] text-zinc-400">
                Variable
              </label>
              <input
                id="insp-bar-var"
                type="text"
                value={obj.uiProgressBar.variable}
                onChange={(e) =>
                  onUpdateObject(obj.id, (prev) => ({
                    ...prev,
                    uiProgressBar: { ...prev.uiProgressBar!, variable: e.target.value },
                  }))
                }
                className="w-full rounded border border-[#32323c] bg-[#141416] px-2 py-1 font-mono text-xs text-zinc-100"
              />
            </div>
            <div className="space-y-1">
              <span className="block text-[11px] text-zinc-400">Máximo</span>
              <NumberField
                id="insp-bar-max"
                label="Máx"
                value={obj.uiProgressBar.maxValue}
                min={1}
                onChange={(maxValue) =>
                  onUpdateObject(obj.id, (prev) => ({
                    ...prev,
                    uiProgressBar: { ...prev.uiProgressBar!, maxValue },
                  }))
                }
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div>
              <span className="mb-1 block text-[11px] text-zinc-400">Relleno</span>
              <input
                type="color"
                aria-label="Color relleno barra"
                value={obj.uiProgressBar.fillColor}
                onChange={(e) =>
                  onUpdateObject(obj.id, (prev) => ({
                    ...prev,
                    uiProgressBar: { ...prev.uiProgressBar!, fillColor: e.target.value },
                  }))
                }
                className="h-7 w-full cursor-pointer rounded border border-[#32323c] bg-[#141416] p-0.5"
              />
            </div>
            <div>
              <span className="mb-1 block text-[11px] text-zinc-400">Fondo</span>
              <input
                type="color"
                aria-label="Color fondo barra"
                value={obj.uiProgressBar.bgColor}
                onChange={(e) =>
                  onUpdateObject(obj.id, (prev) => ({
                    ...prev,
                    uiProgressBar: { ...prev.uiProgressBar!, bgColor: e.target.value },
                  }))
                }
                className="h-7 w-full cursor-pointer rounded border border-[#32323c] bg-[#141416] p-0.5"
              />
            </div>
          </div>

          <label className="flex items-center gap-2 text-xs text-zinc-300 cursor-pointer">
            <input
              type="checkbox"
              checked={obj.uiProgressBar.showLabel}
              onChange={(e) =>
                onUpdateObject(obj.id, (prev) => ({
                  ...prev,
                  uiProgressBar: { ...prev.uiProgressBar!, showLabel: e.target.checked },
                }))
              }
              className="rounded border-zinc-600 bg-[#141416] accent-blue-500"
            />
            <span>Mostrar etiqueta numérica</span>
          </label>
        </InspectorSection>
      )}

      {obj.type === 'ui_leaderboard' && obj.uiLeaderboard && (
        <InspectorSection title="Tabla de Clasificación (Ranking UI)">
          <div className="space-y-1">
            <label htmlFor="insp-lb-title" className="block text-[11px] text-zinc-400">
              Título del Ranking
            </label>
            <input
              id="insp-lb-title"
              type="text"
              value={obj.uiLeaderboard.title}
              onChange={(e) =>
                onUpdateObject(obj.id, (prev) => ({
                  ...prev,
                  uiLeaderboard: { ...prev.uiLeaderboard!, title: e.target.value },
                }))
              }
              className="w-full rounded border border-[#32323c] bg-[#141416] px-2 py-1 text-xs text-zinc-100"
            />
          </div>

          <div className="grid grid-cols-2 gap-1.5">
            <NumberField
              id="insp-lb-max"
              label="Máx filas"
              value={obj.uiLeaderboard.maxEntries}
              min={1}
              max={15}
              onChange={(maxEntries) =>
                onUpdateObject(obj.id, (prev) => ({
                  ...prev,
                  uiLeaderboard: { ...prev.uiLeaderboard!, maxEntries },
                }))
              }
            />
            <div className="space-y-0.5">
              <input
                type="text"
                aria-label="Variable Ranking"
                placeholder="puntos"
                value={obj.uiLeaderboard.variable ?? 'puntos'}
                onChange={(e) =>
                  onUpdateObject(obj.id, (prev) => ({
                    ...prev,
                    uiLeaderboard: { ...prev.uiLeaderboard!, variable: e.target.value },
                  }))
                }
                className="w-full rounded border border-[#32323c] bg-[#141416] px-2 py-1 font-mono text-xs text-zinc-100"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div>
              <span className="mb-1 block text-[11px] text-zinc-400">Fondo</span>
              <input
                type="color"
                aria-label="Color fondo ranking"
                value={obj.uiLeaderboard.bgColor}
                onChange={(e) =>
                  onUpdateObject(obj.id, (prev) => ({
                    ...prev,
                    uiLeaderboard: { ...prev.uiLeaderboard!, bgColor: e.target.value },
                  }))
                }
                className="h-7 w-full cursor-pointer rounded border border-[#32323c] bg-[#141416] p-0.5"
              />
            </div>
            <div>
              <span className="mb-1 block text-[11px] text-zinc-400">Borde</span>
              <input
                type="color"
                aria-label="Color borde ranking"
                value={obj.uiLeaderboard.borderColor}
                onChange={(e) =>
                  onUpdateObject(obj.id, (prev) => ({
                    ...prev,
                    uiLeaderboard: { ...prev.uiLeaderboard!, borderColor: e.target.value },
                  }))
                }
                className="h-7 w-full cursor-pointer rounded border border-[#32323c] bg-[#141416] p-0.5"
              />
            </div>
            <div>
              <span className="mb-1 block text-[11px] text-zinc-400">Texto</span>
              <input
                type="color"
                aria-label="Color texto ranking"
                value={obj.uiLeaderboard.textColor}
                onChange={(e) =>
                  onUpdateObject(obj.id, (prev) => ({
                    ...prev,
                    uiLeaderboard: { ...prev.uiLeaderboard!, textColor: e.target.value },
                  }))
                }
                className="h-7 w-full cursor-pointer rounded border border-[#32323c] bg-[#141416] p-0.5"
              />
            </div>
            <div>
              <span className="mb-1 block text-[11px] text-zinc-400">Acento</span>
              <input
                type="color"
                aria-label="Color acento ranking"
                value={obj.uiLeaderboard.accentColor}
                onChange={(e) =>
                  onUpdateObject(obj.id, (prev) => ({
                    ...prev,
                    uiLeaderboard: { ...prev.uiLeaderboard!, accentColor: e.target.value },
                  }))
                }
                className="h-7 w-full cursor-pointer rounded border border-[#32323c] bg-[#141416] p-0.5"
              />
            </div>
          </div>
        </InspectorSection>
      )}

      {obj.type === 'tilemap' && obj.tilemap && (() => {
        const tm = obj.tilemap;
        const tilesetAsset = tm.assetId
          ? assets.find((a) => a.id === tm.assetId)
          : undefined;
        const tsCols = Math.max(1, tm.tilesetCols);
        const tsRows = Math.max(1, tm.tilesetRows);
        const totalTiles = Math.min(32, tsCols * tsRows);
        const fallbackPalette = ['#3b82f6', '#10b981', '#f59e0b', '#64748b', '#ec4899', '#8b5cf6'];

        const patchTilemap = (patch: Partial<NonNullable<GameObjectData['tilemap']>>) => {
          onUpdateObject(obj.id, (prev) => {
            const currentTm = prev.tilemap!;
            const nextTm = { ...currentTm, ...patch };
            return {
              ...prev,
              transform: {
                ...prev.transform,
                width: Math.max(1, nextTm.cols * nextTm.tileWidth),
                height: Math.max(1, nextTm.rows * nextTm.tileHeight),
              },
              tilemap: nextTm,
            };
          });
        };

        return (
          <InspectorSection title="Mapa de Tiles y Paleta">
            <div className="flex gap-1.5">
              {onActivateTileBrush && (
                <button
                  type="button"
                  onClick={onActivateTileBrush}
                  className="inline-flex flex-1 items-center justify-center gap-1.5 rounded bg-blue-600 px-2.5 py-1.5 text-[11px] font-semibold text-white hover:bg-blue-500 whitespace-nowrap"
                >
                  <Paintbrush className="h-3.5 w-3.5" />
                  <span>Pintar tiles (B)</span>
                </button>
              )}
              <button
                type="button"
                onClick={() => patchTilemap({ cells: {} })}
                title="Eliminar todas las celdas pintadas"
                className="inline-flex items-center justify-center gap-1 rounded border border-[#32323c] bg-[#222228] px-2.5 py-1.5 text-[11px] font-medium text-zinc-300 hover:bg-[#2c2c34]"
              >
                <Eraser className="h-3.5 w-3.5" />
                <span>Vaciar</span>
              </button>
            </div>

            <div className="space-y-1">
              <label htmlFor="insp-tm-asset" className="block text-[11px] text-zinc-400">
                Recurso Tileset
              </label>
              <select
                id="insp-tm-asset"
                value={tm.assetId ?? ''}
                onChange={(e) => patchTilemap({ assetId: e.target.value || null })}
                className="w-full rounded border border-[#32323c] bg-[#141416] px-2 py-1.5 text-xs text-zinc-100 focus:border-blue-500 focus:outline-none"
              >
                <option value="">Colores base (sin imagen)</option>
                {imageAssets.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name} ({a.width}×{a.height})
                  </option>
                ))}
              </select>
            </div>

            <div className="grid grid-cols-2 gap-1.5">
              <NumberField
                id="insp-tm-tw"
                label="Ancho tile"
                value={tm.tileWidth}
                min={8}
                max={256}
                onChange={(tileWidth) =>
                  patchTilemap({ tileWidth: Math.max(8, Math.round(tileWidth)) })
                }
              />
              <NumberField
                id="insp-tm-th"
                label="Alto tile"
                value={tm.tileHeight}
                min={8}
                max={256}
                onChange={(tileHeight) =>
                  patchTilemap({ tileHeight: Math.max(8, Math.round(tileHeight)) })
                }
              />
              <NumberField
                id="insp-tm-cols"
                label="Cols mapa"
                value={tm.cols}
                min={1}
                max={150}
                onChange={(cols) => patchTilemap({ cols: Math.max(1, Math.round(cols)) })}
              />
              <NumberField
                id="insp-tm-rows"
                label="Filas mapa"
                value={tm.rows}
                min={1}
                max={150}
                onChange={(rows) => patchTilemap({ rows: Math.max(1, Math.round(rows)) })}
              />
              <NumberField
                id="insp-tm-tscols"
                label="Cols hoja"
                value={tm.tilesetCols}
                min={1}
                max={32}
                onChange={(tilesetCols) =>
                  patchTilemap({ tilesetCols: Math.max(1, Math.round(tilesetCols)) })
                }
              />
              <NumberField
                id="insp-tm-tsrows"
                label="Filas hoja"
                value={tm.tilesetRows}
                min={1}
                max={32}
                onChange={(tilesetRows) =>
                  patchTilemap({ tilesetRows: Math.max(1, Math.round(tilesetRows)) })
                }
              />
            </div>

            <div className="space-y-1.5">
              <div className="flex items-center justify-between text-[11px] text-zinc-400">
                <span>Paleta de tiles</span>
                <span className="font-mono text-zinc-300">
                  #{tm.selectedTileIndex + 1} · {Object.keys(tm.cells).length} celdas
                </span>
              </div>
              <div
                className="grid gap-1 rounded border border-[#2c2c34] bg-[#141416] p-1.5"
                style={{ gridTemplateColumns: `repeat(${Math.min(6, tsCols)}, minmax(0, 1fr))` }}
              >
                {Array.from({ length: totalTiles }, (_, idx) => {
                  const active = tm.selectedTileIndex === idx;
                  const c = idx % tsCols;
                  const r = Math.floor(idx / tsCols);
                  const posX = tsCols > 1 ? (c / (tsCols - 1)) * 100 : 0;
                  const posY = tsRows > 1 ? (r / (tsRows - 1)) * 100 : 0;
                  const fallbackColor = fallbackPalette[idx % fallbackPalette.length];

                  return (
                    <button
                      key={idx}
                      type="button"
                      onClick={() => patchTilemap({ selectedTileIndex: idx })}
                      title={`Seleccionar tile #${idx + 1}`}
                      aria-label={`Tile ${idx + 1}`}
                      aria-pressed={active}
                      className={`relative aspect-square overflow-hidden rounded border transition-all ${
                        active
                          ? 'border-blue-400 ring-2 ring-blue-500/60'
                          : 'border-[#30303a] hover:border-zinc-500'
                      }`}
                      style={
                        tilesetAsset?.thumbnailDataUrl
                          ? {
                              backgroundImage: `url("${tilesetAsset.thumbnailDataUrl}")`,
                              backgroundSize: `${tsCols * 100}% ${tsRows * 100}%`,
                              backgroundPosition: `${posX}% ${posY}%`,
                              backgroundRepeat: 'no-repeat',
                            }
                          : { backgroundColor: fallbackColor }
                      }
                    >
                      <span className="absolute right-0.5 bottom-0.5 rounded bg-black/70 px-1 font-mono text-[9px] text-zinc-200">
                        {idx + 1}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          </InspectorSection>
        );
      })()}

      {/* Colisionadores (Hitbox) y Cuerpo Rígido */}
      <InspectorSection
        title={`Colisionadores 2D (${obj.colliders?.length ?? 0})`}
        defaultOpen={(obj.colliders?.length ?? 0) > 0}
      >
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={() => {
              const newCol = createDefaultColliderForObject(obj, false);
              onUpdateObject(obj.id, (prev) => ({
                ...prev,
                colliders: [...(prev.colliders ?? []), newCol],
              }));
            }}
            className="flex-1 rounded border border-[#32323c] bg-[#222228] px-2 py-1 text-[11px] font-medium text-zinc-200 hover:bg-[#2c2c34]"
          >
            + Collider sólido
          </button>
          <button
            type="button"
            onClick={() => {
              const newCol = createDefaultColliderForObject(obj, true);
              onUpdateObject(obj.id, (prev) => ({
                ...prev,
                colliders: [...(prev.colliders ?? []), newCol],
              }));
            }}
            className="flex-1 rounded border border-amber-500/40 bg-amber-500/10 px-2 py-1 text-[11px] font-medium text-amber-300 hover:bg-amber-500/20"
          >
            + Sensor / Trigger
          </button>
        </div>

        {(obj.colliders ?? []).length === 0 ? (
          <p className="text-[11px] text-zinc-500 leading-relaxed">
            Usa collider automático ajustado al tamaño visual. Añade un collider manual para definir hitbox precisa o sensores.
          </p>
        ) : (
          <div className="space-y-2">
            {(obj.colliders ?? []).map((col, idx) => {
              const updateCol = (patch: Partial<Collider2D>) =>
                onUpdateObject(obj.id, (prev) => ({
                  ...prev,
                  colliders: (prev.colliders ?? []).map((c) =>
                    c.id === col.id ? { ...c, ...patch } : c
                  ),
                }));

              return (
                <div
                  key={col.id}
                  className="rounded border border-[#2f2f38] bg-[#151519] p-2 space-y-1.5"
                >
                  <div className="flex items-center justify-between gap-1">
                    <span className="text-[11px] font-semibold text-zinc-200">
                      Collider #{idx + 1} · {col.isSensor ? 'Sensor' : 'Físico'}
                    </span>
                    <button
                      type="button"
                      onClick={() =>
                        onUpdateObject(obj.id, (prev) => ({
                          ...prev,
                          colliders: (prev.colliders ?? []).filter((c) => c.id !== col.id),
                        }))
                      }
                      aria-label="Eliminar collider"
                      className="rounded p-0.5 text-zinc-500 hover:text-red-400"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>

                  <div className="grid grid-cols-2 gap-1.5">
                    <select
                      aria-label="Forma de collider"
                      value={col.shape}
                      onChange={(e) =>
                        updateCol({ shape: e.target.value as Collider2D['shape'] })
                      }
                      className="rounded border border-[#32323c] bg-[#141416] px-1.5 py-1 text-[11px] text-zinc-100"
                    >
                      <option value="box">Caja (Box)</option>
                      <option value="circle">Círculo</option>
                    </select>
                    <label className="flex items-center gap-1.5 rounded border border-[#2c2c34] bg-[#141416] px-2 py-1 text-[11px] text-zinc-300 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={col.isSensor}
                        onChange={(e) => updateCol({ isSensor: e.target.checked })}
                        className="accent-amber-500"
                      />
                      <span>Es Sensor</span>
                    </label>
                  </div>

                  <div className="grid grid-cols-2 gap-1.5">
                    <NumberField
                      id={`col-ox-${col.id}`}
                      label="Off X"
                      value={col.offsetX}
                      onChange={(offsetX) => updateCol({ offsetX })}
                    />
                    <NumberField
                      id={`col-oy-${col.id}`}
                      label="Off Y"
                      value={col.offsetY}
                      onChange={(offsetY) => updateCol({ offsetY })}
                    />
                    {col.shape === 'circle' ? (
                      <div className="col-span-2">
                        <NumberField
                          id={`col-rad-${col.id}`}
                          label="Radio"
                          value={col.radius}
                          min={2}
                          onChange={(radius) => updateCol({ radius })}
                        />
                      </div>
                    ) : (
                      <>
                        <NumberField
                          id={`col-w-${col.id}`}
                          label="Ancho"
                          value={col.width}
                          min={2}
                          onChange={(width) => updateCol({ width })}
                        />
                        <NumberField
                          id={`col-h-${col.id}`}
                          label="Alto"
                          value={col.height}
                          min={2}
                          onChange={(height) => updateCol({ height })}
                        />
                      </>
                    )}
                  </div>

                  <button
                    type="button"
                    onClick={() =>
                      updateCol({
                        offsetX: (0.5 - obj.transform.anchorX) * obj.transform.width,
                        offsetY: (0.5 - obj.transform.anchorY) * obj.transform.height,
                        width: Math.max(8, Math.round(obj.transform.width)),
                        height: Math.max(8, Math.round(obj.transform.height)),
                        radius: Math.max(
                          4,
                          Math.round(Math.min(obj.transform.width, obj.transform.height) * 0.5)
                        ),
                      })
                    }
                    className="w-full rounded border border-[#32323c] bg-[#202027] px-2 py-0.5 text-[10px] text-zinc-300 hover:bg-[#2a2a33]"
                  >
                    Sincronizar con tamaño visual
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </InspectorSection>

      {/* Comportamientos jugables */}
      <InspectorSection title={`Comportamientos jugables (${BEHAVIOR_DEFINITIONS.length})`}>
        <div className="space-y-1.5">
          <div className="grid grid-cols-2 gap-1.5">
            <select
              aria-label="Filtrar categoría de comportamiento"
              value={behaviorCategory}
              onChange={(e) =>
                setBehaviorCategory(e.target.value as BehaviorCategory | 'Todas')
              }
              className="rounded border border-[#32323c] bg-[#141416] px-1.5 py-1 text-[11px] text-zinc-200 focus:border-blue-500 focus:outline-none"
            >
              <option value="Todas">Todas las categorías</option>
              {BEHAVIOR_CATEGORIES.map((cat) => (
                <option key={cat} value={cat}>
                  {cat}
                </option>
              ))}
            </select>
            <input
              type="text"
              aria-label="Buscar comportamiento"
              placeholder="Buscar (ej. dash, torreta...)"
              value={behaviorQuery}
              onChange={(e) => setBehaviorQuery(e.target.value)}
              className="rounded border border-[#32323c] bg-[#141416] px-2 py-1 text-[11px] text-zinc-100 placeholder:text-zinc-500 focus:border-blue-500 focus:outline-none"
            />
          </div>

          <div className="flex items-center gap-1.5">
            <select
              aria-label="Seleccionar comportamiento"
              value={selectedBehaviorEntry?.type ?? ''}
              onChange={(e) => setBehaviorToAdd(e.target.value as BehaviorType)}
              className="min-w-0 flex-1 rounded border border-[#32323c] bg-[#141416] px-2 py-1 text-xs text-zinc-100 focus:border-blue-500 focus:outline-none"
            >
              {filteredBehaviors.length === 0 ? (
                <option value="">Sin coincidencias</option>
              ) : (
                filteredBehaviors.map((b) => (
                  <option key={b.type} value={b.type}>
                    {b.label}
                  </option>
                ))
              )}
            </select>
            <button
              type="button"
              disabled={!selectedBehaviorEntry}
              onClick={() => {
                if (!selectedBehaviorEntry) return;
                onUpdateObject(obj.id, (prev) => ({
                  ...prev,
                  components: [
                    ...prev.components,
                    {
                      id: createId('comp'),
                      type: selectedBehaviorEntry.type,
                      enabled: true,
                      config: { ...selectedBehaviorEntry.defaultConfig },
                    },
                  ],
                }));
              }}
              className="inline-flex shrink-0 items-center gap-1 rounded bg-blue-600 px-2.5 py-1 text-xs font-medium text-white hover:bg-blue-500 disabled:opacity-40 whitespace-nowrap"
            >
              <Plus className="h-3.5 w-3.5" />
              <span>Añadir</span>
            </button>
          </div>

          {selectedBehaviorEntry && (
            <p className="text-[10px] leading-snug text-zinc-400">
              {selectedBehaviorEntry.description}
            </p>
          )}
        </div>

        {obj.components.length === 0 ? (
          <p className="text-[11px] text-zinc-500 leading-relaxed">
            Sin comportamientos. Añade uno para que este objeto sea jugable en Vista previa y al exportar HTML5.
          </p>
        ) : (
          <div className="space-y-2">
            {obj.components.map((comp) => {
              const patchCompConfig = (patch: Record<string, unknown>) => {
                onUpdateObject(obj.id, (prev) => ({
                  ...prev,
                  components: prev.components.map((c) =>
                    c.id === comp.id
                      ? { ...c, config: { ...c.config, ...patch } }
                      : c
                  ),
                }));
              };
              const updateCompConfig = (key: string, value: unknown) =>
                patchCompConfig({ [key]: value });
              const registryEntry = getBehaviorEntry(comp.type);

              return (
                <div
                  key={comp.id}
                  className="rounded border border-[#2f2f38] bg-[#151519] p-2 space-y-2"
                >
                  <div className="flex items-center justify-between gap-2">
                    <label className="flex items-center gap-1.5 text-xs font-medium text-zinc-100 cursor-pointer truncate">
                      <input
                        type="checkbox"
                        checked={comp.enabled}
                        onChange={(e) =>
                          onUpdateObject(obj.id, (prev) => ({
                            ...prev,
                            components: prev.components.map((c) =>
                              c.id === comp.id ? { ...c, enabled: e.target.checked } : c
                            ),
                          }))
                        }
                        className="rounded border-zinc-600 bg-[#141416] accent-emerald-500"
                      />
                      <span className="truncate">{getBehaviorLabel(comp.type)}</span>
                    </label>

                    <button
                      type="button"
                      onClick={() =>
                        onUpdateObject(obj.id, (prev) => ({
                          ...prev,
                          components: prev.components.filter((c) => c.id !== comp.id),
                        }))
                      }
                      title="Quitar comportamiento"
                      aria-label={`Quitar ${getBehaviorLabel(comp.type)}`}
                      className="rounded p-1 text-zinc-500 hover:bg-[#2a2a33] hover:text-red-400"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>

                  {comp.type === 'player_platformer' && (() => {
                    const cfg = resolvePlatformerConfig(comp.config);
                    return (
                      <div className="space-y-1.5">
                        <select
                          aria-label="Perfil de movimiento"
                          value={cfg.profile}
                          onChange={(e) => {
                            const nextProf = e.target.value as MovementProfileId;
                            if (nextProf !== 'personalizado' && PLATFORMER_PROFILES[nextProf]) {
                              patchCompConfig({
                                profile: nextProf,
                                ...PLATFORMER_PROFILES[nextProf],
                              });
                            } else {
                              updateCompConfig('profile', 'personalizado');
                            }
                          }}
                          className="w-full rounded border border-[#32323c] bg-[#141416] px-2 py-1 text-xs text-zinc-100"
                        >
                          <option value="preciso">Perfil: Preciso (Controlado)</option>
                          <option value="suave">Perfil: Suave</option>
                          <option value="arcade">Perfil: Arcade (Doble salto)</option>
                          <option value="realista">Perfil: Realista (Inercia)</option>
                          <option value="personalizado">Perfil: Personalizado</option>
                        </select>
                        <div className="grid grid-cols-2 gap-1.5">
                          <NumberField
                            id={`comp-maxspd-${comp.id}`}
                            label="Vel. máx"
                            value={cfg.maxSpeed}
                            min={20}
                            max={1500}
                            onChange={(v) =>
                              patchCompConfig({ profile: 'personalizado', maxSpeed: v, speed: v })
                            }
                          />
                          <NumberField
                            id={`comp-jump-${comp.id}`}
                            label="Salto"
                            value={cfg.jumpForce}
                            min={50}
                            max={2000}
                            onChange={(v) =>
                              patchCompConfig({ profile: 'personalizado', jumpForce: v })
                            }
                          />
                          <NumberField
                            id={`comp-accel-${comp.id}`}
                            label="Acel."
                            value={cfg.acceleration}
                            min={50}
                            max={10000}
                            onChange={(v) =>
                              patchCompConfig({ profile: 'personalizado', acceleration: v })
                            }
                          />
                          <NumberField
                            id={`comp-decel-${comp.id}`}
                            label="Frenado"
                            value={cfg.deceleration}
                            min={50}
                            max={10000}
                            onChange={(v) =>
                              patchCompConfig({ profile: 'personalizado', deceleration: v })
                            }
                          />
                          <NumberField
                            id={`comp-grav-${comp.id}`}
                            label="Gravedad"
                            value={cfg.gravity}
                            min={0}
                            max={5000}
                            onChange={(v) =>
                              patchCompConfig({ profile: 'personalizado', gravity: v })
                            }
                          />
                          <NumberField
                            id={`comp-air-${comp.id}`}
                            label="Ctrl aire"
                            value={cfg.airControl}
                            min={0}
                            max={1}
                            step={0.05}
                            onChange={(v) =>
                              patchCompConfig({ profile: 'personalizado', airControl: v })
                            }
                          />
                          <NumberField
                            id={`comp-coyote-${comp.id}`}
                            label="Coyote (s)"
                            value={cfg.coyoteTime}
                            min={0}
                            max={0.5}
                            step={0.02}
                            onChange={(v) =>
                              patchCompConfig({ profile: 'personalizado', coyoteTime: v })
                            }
                          />
                          <NumberField
                            id={`comp-jumps-${comp.id}`}
                            label="Saltos"
                            value={cfg.maxJumps}
                            min={1}
                            max={5}
                            onChange={(v) =>
                              patchCompConfig({ profile: 'personalizado', maxJumps: v })
                            }
                          />
                        </div>
                      </div>
                    );
                  })()}

                  {comp.type === 'player_topdown' && (() => {
                    const cfg = resolveTopDownConfig(comp.config);
                    return (
                      <div className="grid grid-cols-2 gap-1.5">
                        <div className="col-span-2">
                          <NumberField
                            id={`comp-tdspeed-${comp.id}`}
                            label="Vel. máxima"
                            value={cfg.maxSpeed}
                            min={20}
                            max={1500}
                            onChange={(v) => patchCompConfig({ maxSpeed: v, speed: v })}
                          />
                        </div>
                        <NumberField
                          id={`comp-tdaccel-${comp.id}`}
                          label="Acel."
                          value={cfg.acceleration}
                          min={50}
                          max={10000}
                          onChange={(v) => updateCompConfig('acceleration', v)}
                        />
                        <NumberField
                          id={`comp-tddecel-${comp.id}`}
                          label="Frenado"
                          value={cfg.deceleration}
                          min={50}
                          max={10000}
                          onChange={(v) => updateCompConfig('deceleration', v)}
                        />
                      </div>
                    );
                  })()}

                  {comp.type === 'goal_portal' && (
                    <div className="space-y-1.5">
                      <select
                        aria-label="Escena destino de meta"
                        value={String(comp.config.targetSceneId ?? '')}
                        onChange={(e) => updateCompConfig('targetSceneId', e.target.value)}
                        className="w-full rounded border border-[#32323c] bg-[#141416] px-2 py-1 text-xs text-zinc-100"
                      >
                        <option value="">Siguiente nivel automático</option>
                        {scenes.map((sc) => (
                          <option key={sc.id} value={sc.id}>
                            Ir a: {sc.name}
                          </option>
                        ))}
                      </select>
                    </div>
                  )}

                  {/* Renderizador dinámico basado en esquema para los 65 comportamientos */}
                  {comp.type !== 'player_platformer' &&
                    comp.type !== 'player_topdown' &&
                    registryEntry &&
                    registryEntry.schema.length > 0 && (
                      <div className="space-y-1.5">
                        {registryEntry.schema.map((field) => {
                          if (comp.type === 'goal_portal' && field.key === 'targetSceneId') {
                            return null;
                          }
                          const rawVal = comp.config[field.key] ?? field.defaultValue;

                          if (field.type === 'boolean') {
                            return (
                              <label
                                key={field.key}
                                className="flex items-center gap-2 text-xs text-zinc-300 cursor-pointer"
                              >
                                <input
                                  type="checkbox"
                                  checked={Boolean(rawVal)}
                                  onChange={(e) =>
                                    updateCompConfig(field.key, e.target.checked)
                                  }
                                  className="accent-emerald-500"
                                />
                                <span>{field.label}</span>
                              </label>
                            );
                          }

                          if (field.type === 'select') {
                            return (
                              <div key={field.key} className="space-y-0.5">
                                <label className="block text-[10px] text-zinc-400">
                                  {field.label}
                                </label>
                                <select
                                  aria-label={field.label}
                                  value={String(rawVal)}
                                  onChange={(e) =>
                                    updateCompConfig(field.key, e.target.value)
                                  }
                                  className="w-full rounded border border-[#32323c] bg-[#141416] px-2 py-1 text-xs text-zinc-100 focus:border-blue-500 focus:outline-none"
                                >
                                  {(field.options ?? []).map((opt) => (
                                    <option key={opt.value} value={opt.value}>
                                      {opt.label}
                                    </option>
                                  ))}
                                </select>
                              </div>
                            );
                          }

                          if (field.type === 'color') {
                            return (
                              <div
                                key={field.key}
                                className="flex items-center justify-between gap-2"
                              >
                                <span className="text-[11px] text-zinc-400">
                                  {field.label}
                                </span>
                                <input
                                  type="color"
                                  aria-label={field.label}
                                  value={String(rawVal || '#ffffff')}
                                  onChange={(e) =>
                                    updateCompConfig(field.key, e.target.value)
                                  }
                                  className="h-7 w-16 cursor-pointer rounded border border-[#32323c] bg-[#141416] p-0.5"
                                />
                              </div>
                            );
                          }

                          if (field.type === 'keyCode') {
                            return (
                              <div key={field.key} className="space-y-0.5">
                                <span className="block text-[10px] text-zinc-400">
                                  {field.label}
                                </span>
                                <KeyCaptureField
                                  ariaLabel={field.label}
                                  value={String(rawVal || 'Space')}
                                  onChange={(code) => updateCompConfig(field.key, code)}
                                />
                              </div>
                            );
                          }

                          if (field.type === 'audioAsset') {
                            const audioList = assets.filter((a) => a.kind === 'audio');
                            return (
                              <div key={field.key} className="space-y-0.5">
                                <label className="block text-[10px] text-zinc-400">
                                  {field.label}
                                </label>
                                <select
                                  aria-label={field.label}
                                  value={String(rawVal ?? '')}
                                  onChange={(e) =>
                                    updateCompConfig(field.key, e.target.value)
                                  }
                                  className="w-full rounded border border-[#32323c] bg-[#141416] px-2 py-1 text-xs text-zinc-100 focus:border-sky-500 focus:outline-none"
                                >
                                  <option value="">Ninguno / usar respaldo</option>
                                  {audioList.map((a) => (
                                    <option key={a.id} value={a.id}>
                                      🔊 {a.name} ({a.format.toUpperCase()})
                                    </option>
                                  ))}
                                </select>
                              </div>
                            );
                          }

                          if (field.type === 'string') {
                            return (
                              <div key={field.key} className="space-y-0.5">
                                <label className="block text-[10px] text-zinc-400">
                                  {field.label}
                                </label>
                                <input
                                  type="text"
                                  aria-label={field.label}
                                  value={String(rawVal ?? '')}
                                  onChange={(e) =>
                                    updateCompConfig(field.key, e.target.value)
                                  }
                                  className="w-full rounded border border-[#32323c] bg-[#141416] px-2 py-1 text-xs text-zinc-100 focus:border-blue-500 focus:outline-none"
                                />
                              </div>
                            );
                          }

                          // 'number'
                          return (
                            <NumberField
                              key={field.key}
                              id={`comp-${comp.id}-${field.key}`}
                              label={field.label}
                              value={Number(rawVal ?? 0)}
                              min={field.min}
                              max={field.max}
                              step={field.step ?? 1}
                              onChange={(val) => updateCompConfig(field.key, val)}
                            />
                          );
                        })}
                      </div>
                    )}
                </div>
              );
            })}
          </div>
        )}
      </InspectorSection>
    </div>
  );
};
