import React, { useEffect, useState } from 'react';
import {
  ChevronDown,
  ChevronRight,
  Code2,
  Compass,
  Droplets,
  Eraser,
  Film,
  Gauge,
  Link2,
  Mountain,
  Paintbrush,
  Plus,
  RotateCcw,
  Sparkles,
  Sprout,
  Sun,
  Trash2,
  Wifi,
} from 'lucide-react';
import { buildNavMeshFromScene } from '../../engine/ai3d/navmesh';
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
import { NumericInput } from '../common/NumericInput';
import { ImagePointsModal } from '../editor/ImagePointsModal';
import { AnimationStateMachineModal } from '../three3d/AnimationStateMachineModal';
import { extractModelBoneNames } from '../../engine/three3d/modelLoader';
import {
  COLLISION_LAYERS,
  OBJECT_TYPE_LABELS,
  SCENE_CONTEXT_LABELS,
  SCENE_KIND_LABELS,
  type ArchetypeId,
  type Collider2D,
  type CollisionLayer,
  type GameObjectData,
  type Mesh3DShape,
  type NavMeshObjectRole,
  type ObjectOptimizationConfig,
  type ObjectScriptBinding,
  type Physics3DProperties,
  type SceneContextType,
  type SceneData,
  type SceneKind,
  type SceneLightingConfig,
  type ScenePerformanceProfile,
  type SceneTransitionType,
  type SmartCameraMode,
  type SoftBodyConfig,
  type SpriteAnimationConfig,
  type SpriteFitMode,
  type TextureSamplingMode,
  type TileBrushMode,
  type TileCollisionKind,
  type Vehicle4WConfig,
  type VehicleKind3D,
} from '../../engine/core/types';
import {
  generatePbrAssetBlobsFromImage,
  PBR_MATERIAL_PRESETS,
} from '../../engine/three3d/pbrGenerator';
import {
  ARCHETYPE_RECIPES,
  applyArchetypeToScene,
} from '../../engine/wiring/archetypes';
import { createGameObject } from '../../engine/objects/factory';
import {
  PLATFORMER_PROFILES,
  resolvePlatformerConfig,
  resolveTopDownConfig,
  type MovementProfileId,
} from '../../engine/physics/characterController2d';
import { createDefaultColliderForObject } from '../../engine/physics/collision2d';
import { reparentObject } from '../../engine/core/sceneGraph';
import { computeSmartColliderRectsFromBlob } from '../../engine/physics/smartAlphaCollider';
import {
  extractScriptParamsSchema,
  validateScriptSyntax,
} from '../../engine/scripting/scriptRuntime';
import {
  expandTerrainData,
  generateProceduralTerrain,
} from '../../engine/three3d/terrainSystem';
import type {
  NexusScriptAsset,
  ProjectAssetMeta,
  ProjectMode,
} from '../../project/models/project';
import { clamp, roundTo } from '../../utils/format';
import { createId } from '../../utils/id';

interface InspectorPanelProps {
  scene: SceneData;
  scenes?: SceneData[];
  selectedObjects: GameObjectData[];
  assets: ProjectAssetMeta[];
  assetBlobs?: Map<string, Blob>;
  scripts?: NexusScriptAsset[];
  projectMode?: ProjectMode;
  onUpdateObject: (id: string, updater: (obj: GameObjectData) => GameObjectData) => void;
  onUpdateScene: (updater: (scene: SceneData) => SceneData) => void;
  onActivateTileBrush?: () => void;
  onImportFiles?: (files: File[]) => Promise<ProjectAssetMeta[] | void>;
  onCreateAsset?: (meta: ProjectAssetMeta, blob: Blob) => Promise<void> | void;
  onOpenVehicleWizard?: () => void;
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
  useEffect(() => {
    setOpen(defaultOpen);
  }, [title, defaultOpen]);
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
      <NumericInput
        id={id}
        step={step}
        min={min}
        max={max}
        precision={2}
        aria-label={label}
        value={displayValue}
        onChange={onChange}
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
  assetBlobs,
  scripts = [],
  projectMode = '2d',
  onUpdateObject,
  onUpdateScene,
  onActivateTileBrush,
  onImportFiles,
  onCreateAsset,
  onOpenVehicleWizard,
}) => {
  const [behaviorToAdd, setBehaviorToAdd] = useState<BehaviorType>('player_platformer');
  const [behaviorCategory, setBehaviorCategory] = useState<BehaviorCategory | 'Todas'>('Todas');
  const [behaviorQuery, setBehaviorQuery] = useState('');
  const [scriptToAdd, setScriptToAdd] = useState<string>('');
  const [sceneScriptToAdd, setSceneScriptToAdd] = useState<string>('');
  const [animModalOpen, setAnimModalOpen] = useState(false);
  const [spriteAnimModalOpen, setSpriteAnimModalOpen] = useState(false);
  const [imagePointsModalOpen, setImagePointsModalOpen] = useState(false);
  const [parentBoneNames, setParentBoneNames] = useState<string[]>([]);
  const [selectedArchetype, setSelectedArchetype] = useState<ArchetypeId>('collectible');
  const [archetypeNotice, setArchetypeNotice] = useState<string | null>(null);
  const [generatingPbrMaps, setGeneratingPbrMaps] = useState(false);
  const [pbrNotice, setPbrNotice] = useState<string | null>(null);
  const [waterObjToAdd, setWaterObjToAdd] = useState<string>('');

  const singleObj = selectedObjects.length === 1 ? selectedObjects[0] : null;
  const parentObjForBones = singleObj?.parentId
    ? scene.objects.find((o) => o.id === singleObj.parentId) ?? null
    : null;
  const parentModelAssetId = parentObjForBones?.mesh3d?.glbAssetId ?? null;

  useEffect(() => {
    let active = true;
    if (projectMode !== '3d' || !parentModelAssetId || !assetBlobs) {
      setParentBoneNames([]);
      return;
    }
    const blob = assetBlobs.get(parentModelAssetId);
    if (!blob) {
      setParentBoneNames([]);
      return;
    }
    const meta = assets.find((a) => a.id === parentModelAssetId);
    void extractModelBoneNames(blob, meta?.format || meta?.filename).then((names) => {
      if (active) setParentBoneNames(names);
    });
    return () => {
      active = false;
    };
  }, [projectMode, parentModelAssetId, assetBlobs, assets]);

  const stopEditableKeyLeak = (e: React.KeyboardEvent<HTMLElement>) => {
    const target = e.target as HTMLElement | null;
    if (!target) return;
    if (
      target.tagName === 'INPUT' ||
      target.tagName === 'TEXTAREA' ||
      target.tagName === 'SELECT' ||
      target.isContentEditable
    ) {
      e.stopPropagation();
    }
  };
  const imageAssets = assets.filter((a) => (a.kind ?? 'image') === 'image');
  const model3dAssets = assets.filter((a) => a.kind === 'model3d');
  const codeScripts = scripts.filter((s) => s.kind === 'script');
  const resolvedSceneScriptId = codeScripts.some((c) => c.id === sceneScriptToAdd)
    ? sceneScriptToAdd
    : codeScripts[0]?.id ?? '';
  const resolvedObjScriptId = codeScripts.some((c) => c.id === scriptToAdd)
    ? scriptToAdd
    : codeScripts[0]?.id ?? '';
  const filteredBehaviors = searchBehaviors(behaviorQuery, behaviorCategory);
  const selectedBehaviorEntry =
    filteredBehaviors.find((b) => b.type === behaviorToAdd) ??
    filteredBehaviors[0] ??
    null;

  if (selectedObjects.length === 0) {
    const camCfg = scene.cameraConfig ?? {};
    return (
      <div
        className="flex h-full flex-col bg-[#1a1a1e] overflow-y-auto"
        onKeyDown={stopEditableKeyLeak}
      >
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

          <div className="space-y-1 pt-1">
            <label htmlFor="scene-perf-profile" className="block text-[11px] text-zinc-400">
              Perfil de rendimiento (60 FPS)
            </label>
            <select
              id="scene-perf-profile"
              value={scene.performanceProfile ?? 'balanced_60'}
              onChange={(e) =>
                onUpdateScene((s) => ({
                  ...s,
                  performanceProfile: e.target.value as ScenePerformanceProfile,
                }))
              }
              className="w-full rounded border border-[#32323c] bg-[#141416] px-2 py-1.5 text-xs text-zinc-100 focus:border-emerald-500 focus:outline-none"
            >
              <option value="balanced_60">Equilibrado 60 FPS (Recomendado)</option>
              <option value="ultra_fast">Ultra Rápido (Móvil / Gama baja)</option>
              <option value="high_quality">Alta Calidad (DPR 2x / Sombras HD)</option>
            </select>
          </div>
        </InspectorSection>

        {projectMode !== '3d' && (
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
                <div className="space-y-1.5">
                  <div className="grid grid-cols-2 gap-1.5">
                    <NumberField
                      id="cam-world-w"
                      label="Mundo W"
                      value={camCfg.worldWidth ?? 2560}
                      min={128}
                      max={40000}
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
                      max={40000}
                      onChange={(worldHeight) =>
                        onUpdateScene((s) => ({
                          ...s,
                          cameraConfig: { ...s.cameraConfig, worldHeight },
                        }))
                      }
                    />
                  </div>
                  <button
                    type="button"
                    onClick={() =>
                      onUpdateScene((s) => ({
                        ...s,
                        cameraConfig: {
                          ...s.cameraConfig,
                          worldWidth: Math.min(40000, Math.round((s.cameraConfig?.worldWidth ?? 2560) * 1.5)),
                          worldHeight: Math.min(40000, Math.round((s.cameraConfig?.worldHeight ?? 1440) * 1.5)),
                        },
                      }))
                    }
                    className="w-full rounded border border-emerald-500/40 bg-emerald-600/15 px-2 py-1 text-[11px] font-medium text-emerald-200 hover:bg-emerald-600/25"
                  >
                    +50% Tamaño del Mundo 2D
                  </button>
                </div>
              )}
            </>
          )}
        </InspectorSection>
        )}

        <InspectorSection title="Contexto de Escena y Multijugador" defaultOpen={false}>
          {(() => {
            const mp = scene.multiplayer ?? {
              enabled: false,
              roomId: 'sala_global',
              maxPlayers: 16,
              syncRateHz: 12,
              autoShard: true,
              serverUrl: '',
            };
            const patchMp = (patch: Partial<NonNullable<SceneData['multiplayer']>>) =>
              onUpdateScene((s) => ({
                ...s,
                multiplayer: {
                  enabled: s.multiplayer?.enabled ?? false,
                  roomId: s.multiplayer?.roomId ?? 'sala_global',
                  maxPlayers: s.multiplayer?.maxPlayers ?? 16,
                  syncRateHz: s.multiplayer?.syncRateHz ?? 12,
                  autoShard: s.multiplayer?.autoShard ?? true,
                  serverUrl: s.multiplayer?.serverUrl ?? '',
                  ...patch,
                },
              }));

            return (
              <div className="space-y-2.5">
                <div className="space-y-1">
                  <label htmlFor="scene-context-type" className="block text-[11px] text-zinc-400">
                    Contexto de ejecución aislado
                  </label>
                  <select
                    id="scene-context-type"
                    value={scene.sceneContext ?? 'gameplay'}
                    onChange={(e) =>
                      onUpdateScene((s) => ({
                        ...s,
                        sceneContext: e.target.value as SceneContextType,
                      }))
                    }
                    className="w-full rounded border border-[#32323c] bg-[#141416] px-2 py-1.5 text-xs text-zinc-100 focus:border-blue-500 focus:outline-none"
                  >
                    {(Object.keys(SCENE_CONTEXT_LABELS) as SceneContextType[]).map((ctxKey) => (
                      <option key={ctxKey} value={ctxKey}>
                        {SCENE_CONTEXT_LABELS[ctxKey]}
                      </option>
                    ))}
                  </select>
                  <p className="text-[10px] text-zinc-500 leading-snug">
                    Aísla controles de menú, pausa o inventario para que no activen físicas ni muevan al jugador.
                  </p>
                </div>

                <div className="rounded border border-sky-500/30 bg-sky-950/20 p-2 space-y-2">
                  <label className="flex items-center gap-2 text-xs font-medium text-sky-200 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={Boolean(mp.enabled)}
                      onChange={(e) => patchMp({ enabled: e.target.checked })}
                      className="rounded border-zinc-600 bg-[#141416] accent-sky-500"
                    />
                    <Wifi className="h-3.5 w-3.5 text-sky-400" />
                    <span>Multijugador en Tiempo Real (WebSocket)</span>
                  </label>

                  {mp.enabled && (
                    <div className="space-y-1.5 pt-1">
                      <div className="space-y-0.5">
                        <label htmlFor="mp-room-id" className="block text-[10px] text-zinc-400">
                          ID de sala / instancia
                        </label>
                        <input
                          id="mp-room-id"
                          type="text"
                          value={mp.roomId}
                          onChange={(e) => patchMp({ roomId: e.target.value })}
                          className="w-full rounded border border-[#32323c] bg-[#141416] px-2 py-1 text-xs font-mono text-zinc-100"
                        />
                      </div>
                      <div className="grid grid-cols-2 gap-1.5">
                        <NumberField
                          id="mp-max-players"
                          label="Máx. jugadores"
                          value={mp.maxPlayers ?? 16}
                          min={2}
                          max={32}
                          onChange={(maxPlayers) => patchMp({ maxPlayers })}
                        />
                        <NumberField
                          id="mp-sync-hz"
                          label="Sync Hz"
                          value={mp.syncRateHz ?? 12}
                          min={2}
                          max={30}
                          onChange={(syncRateHz) => patchMp({ syncRateHz })}
                        />
                      </div>
                      <label className="flex items-center gap-2 text-[11px] text-zinc-300 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={mp.autoShard !== false}
                          onChange={(e) => patchMp({ autoShard: e.target.checked })}
                          className="accent-sky-500"
                        />
                        <span>Auto-sharding si la sala se llena</span>
                      </label>
                      <div className="space-y-0.5">
                        <label htmlFor="mp-server-url" className="block text-[10px] text-zinc-400">
                          Servidor WS personalizado (vacío = mismo origen)
                        </label>
                        <input
                          id="mp-server-url"
                          type="text"
                          placeholder="wss://mi-servidor.com/ws/multiplayer"
                          value={mp.serverUrl ?? ''}
                          onChange={(e) => patchMp({ serverUrl: e.target.value })}
                          className="w-full rounded border border-[#32323c] bg-[#141416] px-2 py-1 text-[11px] font-mono text-zinc-100 placeholder:text-zinc-600"
                        />
                      </div>
                    </div>
                  )}
                </div>
              </div>
            );
          })()}
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

        <InspectorSection title="Iluminación Inteligente y Rebote" defaultOpen={projectMode === '3d'}>
          {(() => {
            const lighting: SceneLightingConfig = scene.lighting ?? {
              ambientColor: '#b7c7e8',
              ambientIntensity: 0.48,
              smartBounce: true,
              bounceIntensity: 0.65,
              skyColor: '#8cb8ff',
              groundColor: '#2d2722',
              sunColor: '#fff5dd',
              sunIntensity: 1.45,
              fogEnabled: projectMode === '3d',
              fogColor: scene.backgroundColor || '#131622',
              fogNear: 20,
              fogFar: 90,
            };
            const patchLighting = (patch: Partial<SceneLightingConfig>) => {
              onUpdateScene((s) => ({
                ...s,
                lighting: {
                  ...lighting,
                  ...patch,
                },
              }));
            };
            return (
              <div className="space-y-2">
                <div className="grid grid-cols-3 gap-1.5">
                  <div>
                    <span className="mb-1 flex items-center gap-1 text-[10px] text-zinc-400">
                      <Sun className="h-3 w-3 text-amber-300" /> Sol
                    </span>
                    <input
                      type="color"
                      aria-label="Color de luz solar"
                      value={lighting.sunColor}
                      onChange={(e) => patchLighting({ sunColor: e.target.value })}
                      className="h-7 w-full cursor-pointer rounded border border-[#32323c] bg-[#141416] p-0.5"
                    />
                  </div>
                  <div>
                    <span className="mb-1 block text-[10px] text-zinc-400">Cielo (Rebote)</span>
                    <input
                      type="color"
                      aria-label="Color cielo rebote"
                      value={lighting.skyColor}
                      onChange={(e) => patchLighting({ skyColor: e.target.value })}
                      className="h-7 w-full cursor-pointer rounded border border-[#32323c] bg-[#141416] p-0.5"
                    />
                  </div>
                  <div>
                    <span className="mb-1 block text-[10px] text-zinc-400">Suelo (Rebote)</span>
                    <input
                      type="color"
                      aria-label="Color suelo rebote"
                      value={lighting.groundColor}
                      onChange={(e) => patchLighting({ groundColor: e.target.value })}
                      className="h-7 w-full cursor-pointer rounded border border-[#32323c] bg-[#141416] p-0.5"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-1.5">
                  <NumberField
                    id="scene-light-sun-int"
                    label="Int. Sol"
                    value={lighting.sunIntensity}
                    min={0}
                    max={5}
                    step={0.1}
                    onChange={(sunIntensity) => patchLighting({ sunIntensity })}
                  />
                  <NumberField
                    id="scene-light-amb-int"
                    label="Int. Amb."
                    value={lighting.ambientIntensity}
                    min={0}
                    max={3}
                    step={0.05}
                    onChange={(ambientIntensity) => patchLighting({ ambientIntensity })}
                  />
                </div>

                <label className="flex items-center gap-2 text-xs text-zinc-200 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={lighting.smartBounce}
                    onChange={(e) => patchLighting({ smartBounce: e.target.checked })}
                    className="accent-amber-500"
                  />
                  <span>Rebote de luz inteligente (GI aproximada)</span>
                </label>

                {lighting.smartBounce && (
                  <NumberField
                    id="scene-light-bounce-int"
                    label="Intensidad de rebote"
                    value={lighting.bounceIntensity}
                    min={0}
                    max={2}
                    step={0.05}
                    onChange={(bounceIntensity) => patchLighting({ bounceIntensity })}
                  />
                )}

                <label className="flex items-center gap-2 text-xs text-zinc-300 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={lighting.fogEnabled}
                    onChange={(e) => patchLighting({ fogEnabled: e.target.checked })}
                    className="accent-sky-500"
                  />
                  <span>Niebla atmosférica (Fog 3D)</span>
                </label>

                {lighting.fogEnabled && (
                  <div className="grid grid-cols-3 gap-1.5 items-center">
                    <input
                      type="color"
                      aria-label="Color de niebla"
                      value={lighting.fogColor}
                      onChange={(e) => patchLighting({ fogColor: e.target.value })}
                      className="h-7 w-full cursor-pointer rounded border border-[#32323c] bg-[#141416] p-0.5"
                    />
                    <NumberField
                      id="scene-fog-near"
                      label="Cerca"
                      value={lighting.fogNear}
                      min={1}
                      max={200}
                      onChange={(fogNear) => patchLighting({ fogNear })}
                    />
                    <NumberField
                      id="scene-fog-far"
                      label="Lejos"
                      value={lighting.fogFar}
                      min={5}
                      max={400}
                      onChange={(fogFar) => patchLighting({ fogFar })}
                    />
                  </div>
                )}

                {projectMode === '3d' && (
                  <div className="space-y-2 border-t border-[#2a2a33] pt-2">
                    <label className="flex items-center gap-2 text-xs text-sky-300 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={Boolean(lighting.dayNightEnabled)}
                        onChange={(e) =>
                          patchLighting({
                            dayNightEnabled: e.target.checked,
                            timeOfDay: lighting.timeOfDay ?? 12.5,
                            cloudsEnabled: lighting.cloudsEnabled ?? true,
                          })
                        }
                        className="accent-sky-500"
                      />
                      <span>Domo de Cielo y Ciclo Día/Noche 3D</span>
                    </label>
                    {lighting.dayNightEnabled && (
                      <div className="space-y-1.5">
                        <div className="flex items-center gap-2 text-[11px]">
                          <span className="text-zinc-400">Hora</span>
                          <input
                            type="range"
                            min={0}
                            max={24}
                            step={0.25}
                            aria-label="Hora del día"
                            value={lighting.timeOfDay ?? 12.5}
                            onChange={(e) => patchLighting({ timeOfDay: Number(e.target.value) })}
                            className="flex-1 accent-amber-400"
                          />
                          <span className="w-11 text-right font-mono text-amber-200">
                            {Math.floor(lighting.timeOfDay ?? 12.5)
                              .toString()
                              .padStart(2, '0')}
                            :
                            {Math.round(((lighting.timeOfDay ?? 12.5) % 1) * 60)
                              .toString()
                              .padStart(2, '0')}
                          </span>
                        </div>
                        <div className="grid grid-cols-2 gap-1.5 items-center">
                          <NumberField
                            id="scene-day-speed"
                            label="Vel. ciclo"
                            value={lighting.dayCycleSpeed ?? 0}
                            min={0}
                            max={6}
                            step={0.1}
                            onChange={(dayCycleSpeed) => patchLighting({ dayCycleSpeed })}
                          />
                          <label className="flex items-center gap-1.5 text-[11px] text-zinc-300 cursor-pointer">
                            <input
                              type="checkbox"
                              checked={lighting.cloudsEnabled !== false}
                              onChange={(e) => patchLighting({ cloudsEnabled: e.target.checked })}
                              className="accent-sky-500"
                            />
                            <span>Nubes 3D</span>
                          </label>
                        </div>
                      </div>
                    )}

                    <div className="space-y-1 pt-1">
                      <label htmlFor="scene-skydome-asset" className="block text-[10px] text-zinc-400">
                        SkyDome 360° Equirectangular (HDRI / Imagen)
                      </label>
                      <select
                        id="scene-skydome-asset"
                        value={lighting.skyDomeAssetId ?? ''}
                        onChange={(e) => patchLighting({ skyDomeAssetId: e.target.value || null })}
                        className="w-full rounded border border-[#32323c] bg-[#141416] px-2 py-1 text-xs text-zinc-100"
                      >
                        <option value="">(Usar color o cielo procedural)</option>
                        {imageAssets.map((a) => (
                          <option key={a.id} value={a.id}>
                            🌐 {a.name} ({a.width}×{a.height})
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>
                )}
              </div>
            );
          })()}
        </InspectorSection>

        {projectMode === '3d' && (
          <InspectorSection title="Mundo 3D, Naturaleza y NavMesh IA" defaultOpen>
            <div className="grid grid-cols-1 gap-1.5">
              <button
                type="button"
                onClick={() =>
                  onUpdateScene((s) => ({
                    ...s,
                    objects: [
                      ...s.objects,
                      createGameObject('mesh_3d', s.objects, {
                        name: 'Terreno_Procedural',
                        shape3d: 'terrain',
                        x3d: 0,
                        y3d: 0,
                        z3d: 0,
                      }),
                    ],
                  }))
                }
                className="inline-flex items-center justify-center gap-1.5 rounded border border-emerald-500/40 bg-emerald-600/15 px-2.5 py-1.5 text-xs font-medium text-emerald-200 hover:bg-emerald-600/25"
              >
                <Mountain className="h-3.5 w-3.5" />
                <span>+ Terreno Procedural (Esculpible)</span>
              </button>
              <div className="grid grid-cols-2 gap-1.5">
                <button
                  type="button"
                  onClick={() =>
                    onUpdateScene((s) => ({
                      ...s,
                      objects: [
                        ...s.objects,
                        createGameObject('mesh_3d', s.objects, {
                          name: 'Agua_Lago',
                          shape3d: 'water',
                          x3d: 0,
                          y3d: -0.25,
                          z3d: 0,
                        }),
                      ],
                    }))
                  }
                  className="inline-flex items-center justify-center gap-1 rounded border border-cyan-500/40 bg-cyan-600/15 px-2 py-1 text-[11px] font-medium text-cyan-200 hover:bg-cyan-600/25"
                >
                  <Droplets className="h-3.5 w-3.5" />
                  <span>+ Agua / Río</span>
                </button>
                <button
                  type="button"
                  onClick={() =>
                    onUpdateScene((s) => ({
                      ...s,
                      objects: [
                        ...s.objects,
                        createGameObject('mesh_3d', s.objects, {
                          name: 'Hierba_Viento',
                          shape3d: 'grass_field',
                          x3d: 0,
                          y3d: 0,
                          z3d: 0,
                        }),
                      ],
                    }))
                  }
                  className="inline-flex items-center justify-center gap-1 rounded border border-lime-500/40 bg-lime-600/15 px-2 py-1 text-[11px] font-medium text-lime-200 hover:bg-lime-600/25"
                >
                  <Sprout className="h-3.5 w-3.5" />
                  <span>+ Hierba Viento</span>
                </button>
              </div>
            </div>

            <div className="space-y-1.5 rounded border border-[#2f2f38] bg-[#151519] p-2">
              <div className="flex items-center justify-between text-[11px]">
                <span className="font-semibold text-cyan-300">Mapa IA (NavMesh)</span>
                <span className="font-mono text-[10px] text-zinc-400">
                  {scene.navMesh
                    ? `${scene.navMesh.cols}×${scene.navMesh.rows} celdas`
                    : 'Sin hornear'}
                </span>
              </div>
              {scene.navMesh &&
                scene.objects.some((o) => o.type === 'mesh_3d' && o.aiAgent?.enabled) &&
                scene.navMesh.walkable.every((w) => w === 0) && (
                  <p className="rounded border border-amber-500/40 bg-amber-500/10 px-2 py-1 text-[10px] text-amber-200">
                    El NavMesh actual no tiene celdas transitables. Marca el suelo como "Terreno transitable" y pulsa Actualizar.
                  </p>
                )}
              <button
                type="button"
                onClick={() => {
                  const nav = buildNavMeshFromScene(scene, { cellSize: 1.2, maxSlopeDeg: 45 });
                  onUpdateScene((s) => ({ ...s, navMesh: nav }));
                }}
                className="inline-flex w-full items-center justify-center gap-1.5 rounded bg-cyan-600 px-2.5 py-1.5 text-xs font-semibold text-white hover:bg-cyan-500"
              >
                <Compass className="h-3.5 w-3.5" />
                <span>{scene.navMesh ? 'Actualizar Mapa IA (NavMesh)' : 'Crear Mapa IA (NavMesh)'}</span>
              </button>
            </div>
          </InspectorSection>
        )}

        <InspectorSection
          title={`Scripts JS de Escena (${scene.scriptIds?.length ?? 0})`}
          defaultOpen={(scene.scriptIds?.length ?? 0) > 0 || codeScripts.length > 0}
        >
          <div className="flex items-center gap-1.5">
            <select
              aria-label="Script para escena"
              value={resolvedSceneScriptId}
              onChange={(e) => setSceneScriptToAdd(e.target.value)}
              className="min-w-0 flex-1 rounded border border-[#32323c] bg-[#141416] px-2 py-1 text-xs text-zinc-100"
            >
              {codeScripts.length === 0 ? (
                <option value="">Crea scripts en Código e Interfaces...</option>
              ) : (
                codeScripts.map((sc) => (
                  <option key={sc.id} value={sc.id}>
                    {sc.name}
                  </option>
                ))
              )}
            </select>
            <button
              type="button"
              disabled={codeScripts.length === 0}
              onClick={() => {
                const chosen = resolvedSceneScriptId;
                if (!chosen) return;
                onUpdateScene((s) => {
                  const prevIds = s.scriptIds ?? [];
                  if (prevIds.includes(chosen)) return s;
                  return { ...s, scriptIds: [...prevIds, chosen] };
                });
              }}
              className="inline-flex shrink-0 items-center gap-1 rounded bg-sky-600 px-2.5 py-1 text-xs font-medium text-white hover:bg-sky-500 disabled:opacity-40"
            >
              <Plus className="h-3.5 w-3.5" />
              <span>Adjuntar</span>
            </button>
          </div>
          {(scene.scriptIds ?? []).length > 0 && (
            <div className="space-y-1">
              {(scene.scriptIds ?? []).map((sid) => {
                const sc = codeScripts.find((c) => c.id === sid);
                const syn = sc ? validateScriptSyntax(sc.code) : { valid: false, error: 'Script no encontrado' };
                return (
                  <div
                    key={sid}
                    className="flex items-center justify-between gap-1.5 rounded border border-[#2f2f38] bg-[#151519] px-2 py-1 text-xs"
                  >
                    <div className="min-w-0 flex items-center gap-1.5">
                      <span className="truncate font-mono text-sky-300">
                        {sc?.name ?? sid}
                      </span>
                      {!syn.valid && (
                        <span
                          title={syn.error}
                          className="rounded bg-red-500/20 px-1 py-0.5 text-[9px] font-semibold text-red-300 shrink-0"
                        >
                          Error
                        </span>
                      )}
                    </div>
                    <button
                      type="button"
                      onClick={() =>
                        onUpdateScene((s) => ({
                          ...s,
                          scriptIds: (s.scriptIds ?? []).filter((id) => id !== sid),
                        }))
                      }
                      className="rounded p-0.5 text-zinc-500 hover:text-red-400"
                      aria-label="Quitar script de escena"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </InspectorSection>

        <div className="px-3 py-4 text-[11px] text-zinc-500 leading-relaxed">
          Selecciona un objeto en el escenario o en el árbol de escena para inspeccionar y modificar sus propiedades, colisionadores, scripts JS y comportamientos.
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
    <div
      key={obj.id}
      className="flex h-full flex-col bg-[#1a1a1e] overflow-y-auto"
      onKeyDown={stopEditableKeyLeak}
    >
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
          <label htmlFor="insp-parent" className="text-[11px] text-zinc-400">
            Padre
          </label>
          <select
            id="insp-parent"
            value={obj.parentId ?? ''}
            onChange={(e) => {
              const nextParentId = e.target.value || null;
              onUpdateScene((s) => ({
                ...s,
                objects: reparentObject(s.objects, obj.id, nextParentId, {
                  preserveWorldTransform: true,
                  allowAnyParent: true,
                }),
              }));
            }}
            className="w-full rounded border border-[#32323c] bg-[#141416] px-2 py-1 text-xs text-zinc-100 focus:border-blue-500 focus:outline-none"
          >
            <option value="">Ninguno (Raíz de escena)</option>
            {scene.objects
              .filter((o) => o.id !== obj.id)
              .map((o) => (
                <option key={o.id} value={o.id}>
                  {o.name} ({OBJECT_TYPE_LABELS[o.type]})
                </option>
              ))}
          </select>
        </div>

        {obj.parentId && (
          <div className="flex justify-end">
            <button
              type="button"
              onClick={() =>
                onUpdateObject(obj.id, (prev) => ({
                  ...prev,
                  transform: { ...prev.transform, x: 0, y: 0 },
                  ...(prev.transform3d
                    ? { transform3d: { ...prev.transform3d, x: 0, y: 0, z: 0 } }
                    : {}),
                }))
              }
              title="Alinear el objeto hijo justo en el centro del padre (0,0,0 local)"
              className="rounded border border-sky-500/40 bg-sky-500/15 px-2 py-0.5 text-[10px] font-medium text-sky-200 hover:bg-sky-500/25"
            >
              Centrar en el padre (0,0,0)
            </button>
          </div>
        )}

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
            <NumericInput
              aria-label="Opacidad numérica"
              min={0}
              max={1}
              step={0.05}
              precision={2}
              value={roundTo(obj.opacity, 2)}
              onChange={(v) => {
                onUpdateObject(obj.id, (prev) => ({
                  ...prev,
                  opacity: clamp(v, 0, 1),
                }));
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
                  <option value="nine_slice">9-Slice (Panel escalable)</option>
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

            {fitMode === 'nine_slice' && (() => {
              const ns = obj.sprite!.nineSlice ?? { left: 16, top: 16, right: 16, bottom: 16 };
              const patchNs = (patch: Partial<typeof ns>) =>
                onUpdateObject(obj.id, (prev) => ({
                  ...prev,
                  sprite: {
                    ...prev.sprite!,
                    nineSlice: { ...ns, ...patch },
                  },
                }));
              return (
                <div className="space-y-1 rounded border border-[#2d2d37] bg-[#15151a] p-2">
                  <div className="text-[10px] font-semibold uppercase tracking-wide text-sky-300">
                    Márgenes 9-Slice (px sin deformar bordes)
                  </div>
                  <div className="grid grid-cols-2 gap-1.5">
                    <NumberField id="insp-ns-l" label="Izq" value={ns.left} min={1} max={512} onChange={(left) => patchNs({ left })} />
                    <NumberField id="insp-ns-r" label="Der" value={ns.right} min={1} max={512} onChange={(right) => patchNs({ right })} />
                    <NumberField id="insp-ns-t" label="Sup" value={ns.top} min={1} max={512} onChange={(top) => patchNs({ top })} />
                    <NumberField id="insp-ns-b" label="Inf" value={ns.bottom} min={1} max={512} onChange={(bottom) => patchNs({ bottom })} />
                  </div>
                </div>
              );
            })()}

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

            <div className="border-t border-[#2a2a33] pt-2">
              <button
                type="button"
                onClick={() => setImagePointsModalOpen(true)}
                className="flex w-full items-center justify-center gap-1.5 rounded border border-cyan-500/40 bg-cyan-500/10 px-2.5 py-1.5 text-xs font-medium text-cyan-200 hover:bg-cyan-500/20"
              >
                <span>🎯 Puntos de Imagen Visual ({obj.sprite.imagePoints?.length ?? 0})</span>
              </button>
              <ImagePointsModal
                open={imagePointsModalOpen}
                objectName={obj.name}
                imageUrl={currentAsset?.thumbnailDataUrl ?? null}
                imageWidth={currentAsset?.width ?? obj.transform.width}
                imageHeight={currentAsset?.height ?? obj.transform.height}
                points={obj.sprite.imagePoints ?? []}
                onClose={() => setImagePointsModalOpen(false)}
                onSave={(imagePoints) =>
                  onUpdateObject(obj.id, (prev) => ({
                    ...prev,
                    sprite: { ...prev.sprite!, imagePoints },
                  }))
                }
              />
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

            <button
              type="button"
              onClick={() => setSpriteAnimModalOpen(true)}
              className="flex w-full items-center justify-center gap-1.5 rounded border border-purple-500/40 bg-purple-600/15 px-2.5 py-1.5 text-xs font-medium text-purple-200 hover:bg-purple-600/25"
            >
              <Film className="h-3.5 w-3.5" />
              <span>Máquina de Estados 2D ({obj.animStateMachine?.states.length ?? 0} estados)</span>
            </button>

            <AnimationStateMachineModal
              open={spriteAnimModalOpen}
              mode="2d"
              objectName={obj.name}
              clipNames={['idle', 'walk', 'run', 'jump', 'fall', 'attack']}
              assets={assets}
              assetBlobs={assetBlobs}
              config={
                obj.animStateMachine ?? {
                  initialStateId: 'st_idle2d',
                  states: [
                    {
                      id: 'st_idle2d',
                      name: 'Idle',
                      clipName: 'idle',
                      timeScale: 1,
                      loopMode: 'LoopRepeat',
                      x: 60,
                      y: 135,
                      assetId: obj.sprite?.assetId ?? null,
                      cols: anim.cols,
                      rows: anim.rows,
                      startFrame: 0,
                      frameCount: Math.max(1, Math.min(4, anim.frameCount)),
                    },
                    {
                      id: 'st_walk2d',
                      name: 'Walk',
                      clipName: 'walk',
                      timeScale: 1,
                      loopMode: 'LoopRepeat',
                      x: 370,
                      y: 135,
                      assetId: obj.sprite?.assetId ?? null,
                      cols: anim.cols,
                      rows: anim.rows,
                      startFrame: 0,
                      frameCount: anim.frameCount,
                    },
                  ],
                  transitions: [
                    {
                      id: createId('tr2d'),
                      fromStateId: 'st_idle2d',
                      toStateId: 'st_walk2d',
                      conditionExpr: 'speed > 0.1',
                      blendDuration: 0.05,
                    },
                    {
                      id: createId('tr2d'),
                      fromStateId: 'st_walk2d',
                      toStateId: 'st_idle2d',
                      conditionExpr: 'speed <= 0.1',
                      blendDuration: 0.05,
                    },
                  ],
                }
              }
              onClose={() => setSpriteAnimModalOpen(false)}
              onSave={(nextCfg) => {
                onUpdateObject(obj.id, (prev) => ({
                  ...prev,
                  animStateMachine: nextCfg,
                }));
                setSpriteAnimModalOpen(false);
              }}
            />
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

      {obj.type === 'ui_widget' && obj.uiWidget && (() => {
        const w = obj.uiWidget;
        const patchWidget = (patch: Partial<NonNullable<GameObjectData['uiWidget']>>) =>
          onUpdateObject(obj.id, (prev) => ({
            ...prev,
            uiWidget: { ...prev.uiWidget!, ...patch },
          }));
        return (
          <InspectorSection title="Interfaz HTML / CSS / JS (Widget)">
            <div className="grid grid-cols-2 gap-1.5 text-xs text-zinc-300">
              <label className="flex items-center gap-1.5 cursor-pointer">
                <input
                  type="checkbox"
                  checked={w.interactive}
                  onChange={(e) => patchWidget({ interactive: e.target.checked })}
                  className="accent-sky-500"
                />
                <span>Interactiva</span>
              </label>
              <label className="flex items-center gap-1.5 cursor-pointer">
                <input
                  type="checkbox"
                  checked={w.visibleAtStart}
                  onChange={(e) => patchWidget({ visibleAtStart: e.target.checked })}
                  className="accent-emerald-500"
                />
                <span>Visible al iniciar</span>
              </label>
              <label className="flex items-center gap-1.5 cursor-pointer col-span-2">
                <input
                  type="checkbox"
                  checked={Boolean(w.fixedToScreen)}
                  onChange={(e) => patchWidget({ fixedToScreen: e.target.checked })}
                  className="accent-blue-500"
                />
                <span>Fija en pantalla (HUD)</span>
              </label>
            </div>

            <NumberField
              id="insp-uiw-z"
              label="Z-Index"
              value={w.zIndex ?? 20}
              min={0}
              max={500}
              onChange={(zIndex) => patchWidget({ zIndex })}
            />

            <div className="space-y-1">
              <label className="block text-[10px] text-zinc-400">HTML de la Interfaz</label>
              <textarea
                rows={4}
                aria-label="HTML del widget"
                value={w.html}
                onChange={(e) => patchWidget({ html: e.target.value })}
                className="w-full rounded border border-[#32323c] bg-[#141416] p-1.5 font-mono text-[11px] text-zinc-100 focus:border-sky-500 focus:outline-none"
              />
            </div>

            <div className="space-y-1">
              <label className="block text-[10px] text-zinc-400">CSS Aislado</label>
              <textarea
                rows={3}
                aria-label="CSS del widget"
                value={w.css}
                onChange={(e) => patchWidget({ css: e.target.value })}
                className="w-full rounded border border-[#32323c] bg-[#141416] p-1.5 font-mono text-[11px] text-sky-200 focus:border-sky-500 focus:outline-none"
              />
            </div>

            <div className="space-y-1">
              <label className="block text-[10px] text-zinc-400">JS del Widget (mountWidget)</label>
              <textarea
                rows={3}
                aria-label="JS del widget"
                value={w.js}
                onChange={(e) => patchWidget({ js: e.target.value })}
                className="w-full rounded border border-[#32323c] bg-[#141416] p-1.5 font-mono text-[11px] text-emerald-200 focus:border-sky-500 focus:outline-none"
              />
            </div>
          </InspectorSection>
        );
      })()}

      {obj.type === 'light_2d' && obj.light2d && (() => {
        const l2 = obj.light2d;
        const patchL2 = (patch: Partial<NonNullable<GameObjectData['light2d']>>) =>
          onUpdateObject(obj.id, (prev) => ({
            ...prev,
            light2d: { ...prev.light2d!, ...patch },
          }));
        return (
          <InspectorSection title="Luz 2D Dinámica">
            <div className="grid grid-cols-2 gap-1.5 items-center">
              <select
                aria-label="Tipo de luz 2D"
                value={l2.kind}
                onChange={(e) => patchL2({ kind: e.target.value as 'point' | 'spot' })}
                className="rounded border border-[#32323c] bg-[#141416] px-2 py-1 text-xs text-zinc-100"
              >
                <option value="point">Puntual (Radial)</option>
                <option value="spot">Foco (Cono)</option>
              </select>
              <input
                type="color"
                aria-label="Color luz 2D"
                value={l2.color}
                onChange={(e) => patchL2({ color: e.target.value })}
                className="h-7 w-full cursor-pointer rounded border border-[#32323c] bg-[#141416] p-0.5"
              />
            </div>
            <div className="grid grid-cols-2 gap-1.5">
              <NumberField
                id="insp-l2-int"
                label="Intensidad"
                value={l2.intensity}
                min={0}
                max={1000}
                step={0.1}
                onChange={(intensity) => patchL2({ intensity })}
              />
              <NumberField
                id="insp-l2-rad"
                label="Radio"
                value={l2.radius}
                min={10}
                max={5000}
                onChange={(radius) => patchL2({ radius })}
              />
              <NumberField
                id="insp-l2-soft"
                label="Suavidad"
                value={l2.softness}
                min={0}
                max={1}
                step={0.05}
                onChange={(softness) => patchL2({ softness })}
              />
              {l2.kind === 'spot' && (
                <>
                  <NumberField
                    id="insp-l2-ang"
                    label="Ángulo °"
                    value={l2.angleDeg}
                    min={5}
                    max={175}
                    onChange={(angleDeg) => patchL2({ angleDeg })}
                  />
                  <NumberField
                    id="insp-l2-dir"
                    label="Dirección °"
                    value={l2.directionDeg}
                    min={-360}
                    max={360}
                    onChange={(directionDeg) => patchL2({ directionDeg })}
                  />
                </>
              )}
            </div>
            <label className="mt-1.5 flex items-center gap-1.5 text-[11px] text-zinc-200 cursor-pointer">
              <input
                type="checkbox"
                checked={Boolean(l2.castShadows)}
                onChange={(e) => patchL2({ castShadows: e.target.checked })}
                className="accent-amber-500"
              />
              Proyectar sombras reales (castShadows)
            </label>
          </InspectorSection>
        );
      })()}

      {(obj.type === 'mesh_3d' ||
        obj.type === 'light_3d' ||
        obj.type === 'camera_3d' ||
        (obj.type === 'container' && Boolean(obj.transform3d))) && (() => {
        const t3 = obj.transform3d ?? { x: 0, y: 0.5, z: 0, rx: 0, ry: 0, rz: 0, sx: 1, sy: 1, sz: 1 };
        const patchT3 = (patch: Partial<NonNullable<GameObjectData['transform3d']>>) =>
          onUpdateObject(obj.id, (prev) => ({
            ...prev,
            transform3d: { ...t3, ...patch },
          }));
        return (
          <InspectorSection title="Transformación 3D (X / Y / Z)">
            <div className="space-y-1.5">
              <div className="text-[10px] text-zinc-400">Posición 3D</div>
              <div className="grid grid-cols-3 gap-1">
                <NumberField id="t3-px" label="X" badge="X" badgeColor="bg-red-700/80" value={t3.x} step={0.25} onChange={(x) => patchT3({ x })} />
                <NumberField id="t3-py" label="Y" badge="Y" badgeColor="bg-emerald-700/80" value={t3.y} step={0.25} onChange={(y) => patchT3({ y })} />
                <NumberField id="t3-pz" label="Z" badge="Z" badgeColor="bg-blue-700/80" value={t3.z} step={0.25} onChange={(z) => patchT3({ z })} />
              </div>
              <div className="text-[10px] text-zinc-400">Rotación (°)</div>
              <div className="grid grid-cols-3 gap-1">
                <NumberField id="t3-rx" label="RX" badge="X" value={t3.rx} step={5} onChange={(rx) => patchT3({ rx })} />
                <NumberField id="t3-ry" label="RY" badge="Y" value={t3.ry} step={5} onChange={(ry) => patchT3({ ry })} />
                <NumberField id="t3-rz" label="RZ" badge="Z" value={t3.rz} step={5} onChange={(rz) => patchT3({ rz })} />
              </div>
              <div className="text-[10px] text-zinc-400">Escala 3D</div>
              <div className="grid grid-cols-3 gap-1">
                <NumberField id="t3-sx" label="SX" badge="X" value={t3.sx} step={0.1} min={0.05} onChange={(sx) => patchT3({ sx })} />
                <NumberField id="t3-sy" label="SY" badge="Y" value={t3.sy} step={0.1} min={0.05} onChange={(sy) => patchT3({ sy })} />
                <NumberField id="t3-sz" label="SZ" badge="Z" value={t3.sz} step={0.1} min={0.05} onChange={(sz) => patchT3({ sz })} />
              </div>

              {obj.parentId && (() => {
                const bs = obj.boneSocket ?? {
                  parentObjectId: obj.parentId,
                  boneName: '',
                  offsetX: 0,
                  offsetY: 0,
                  offsetZ: 0,
                  rotX: 0,
                  rotY: 0,
                  rotZ: 0,
                };
                const patchBs = (p: Partial<typeof bs>) =>
                  onUpdateObject(obj.id, (prev) => ({
                    ...prev,
                    boneSocket: { ...bs, parentObjectId: obj.parentId!, ...p },
                  }));
                return (
                  <div className="mt-2 space-y-1.5 rounded border border-violet-500/35 bg-violet-500/5 p-2">
                    <div className="flex items-center justify-between text-[10px] font-semibold text-violet-300">
                      <span>🦴 Anclaje a Hueso del Padre (Bone Socket)</span>
                      {bs.boneName && (
                        <button
                          type="button"
                          onClick={() =>
                            onUpdateObject(obj.id, (prev) => ({ ...prev, boneSocket: undefined }))
                          }
                          className="text-[9.5px] text-zinc-400 hover:text-red-300"
                        >
                          Desvincular
                        </button>
                      )}
                    </div>
                    {parentBoneNames.length > 0 ? (
                      <select
                        aria-label="Hueso del modelo padre"
                        value={bs.boneName}
                        onChange={(e) => patchBs({ boneName: e.target.value })}
                        className="w-full rounded border border-[#32323c] bg-[#141416] px-2 py-1 text-xs text-zinc-100"
                      >
                        <option value="">(Seguir centro del padre sin hueso)</option>
                        {parentBoneNames.map((bn) => (
                          <option key={bn} value={bn}>
                            🦴 {bn}
                          </option>
                        ))}
                      </select>
                    ) : (
                      <input
                        type="text"
                        aria-label="Nombre del hueso del padre"
                        placeholder="Ej. mixamorigRightHand, RightHand..."
                        value={bs.boneName}
                        onChange={(e) => patchBs({ boneName: e.target.value })}
                        className="w-full rounded border border-[#32323c] bg-[#141416] px-2 py-1 font-mono text-[11px] text-zinc-100"
                      />
                    )}
                    {bs.boneName && (
                      <>
                        <div className="grid grid-cols-3 gap-1">
                          <NumberField id="bs-ox" label="OX" value={bs.offsetX} step={0.05} onChange={(offsetX) => patchBs({ offsetX })} />
                          <NumberField id="bs-oy" label="OY" value={bs.offsetY} step={0.05} onChange={(offsetY) => patchBs({ offsetY })} />
                          <NumberField id="bs-oz" label="OZ" value={bs.offsetZ} step={0.05} onChange={(offsetZ) => patchBs({ offsetZ })} />
                        </div>
                        <div className="grid grid-cols-3 gap-1">
                          <NumberField id="bs-rx" label="RX" value={bs.rotX ?? 0} step={5} onChange={(rotX) => patchBs({ rotX })} />
                          <NumberField id="bs-ry" label="RY" value={bs.rotY ?? 0} step={5} onChange={(rotY) => patchBs({ rotY })} />
                          <NumberField id="bs-rz" label="RZ" value={bs.rotZ ?? 0} step={5} onChange={(rotZ) => patchBs({ rotZ })} />
                        </div>
                      </>
                    )}
                  </div>
                );
              })()}
            </div>
          </InspectorSection>
        );
      })()}

      {obj.type === 'mesh_3d' && obj.mesh3d && (() => {
        const m3 = obj.mesh3d;
        const patchM3 = (patch: Partial<NonNullable<GameObjectData['mesh3d']>>) =>
          onUpdateObject(obj.id, (prev) => ({
            ...prev,
            mesh3d: { ...prev.mesh3d!, ...patch },
          }));
        const phy3 = obj.physics3d ?? {
          enabled: false,
          bodyType: 'static' as const,
          shape: 'box' as const,
          mass: 1,
          gravityScale: 1,
          restitution: 0.1,
          friction: 0.6,
        };
        const patchPhy3 = (patch: Partial<NonNullable<GameObjectData['physics3d']>>) =>
          onUpdateObject(obj.id, (prev) => ({
            ...prev,
            physics3d: { ...phy3, ...patch },
          }));
        const ai = obj.aiAgent ?? {
          enabled: false,
          speed: 3.8,
          acceleration: 12,
          avoidanceRadius: 1.2,
          stoppingDistance: 1.2,
          mode: 'chase' as const,
          targetObjectId: null,
          targetX: 0,
          targetY: 0,
          targetZ: 0,
        };
        const patchAi = (patch: Partial<NonNullable<GameObjectData['aiAgent']>>) =>
          onUpdateObject(obj.id, (prev) => ({
            ...prev,
            aiAgent: { ...ai, ...patch },
          }));
        const defaultAnimConfig = obj.animStateMachine ?? {
          initialStateId: 'st_idle',
          states: [
            { id: 'st_idle', name: 'Idle', clipName: m3.clipNames?.[0] ?? 'Idle', timeScale: 1, loopMode: 'LoopRepeat' as const, x: 60, y: 135 },
            { id: 'st_run', name: 'Run', clipName: m3.clipNames?.[1] ?? 'Run', timeScale: 1, loopMode: 'LoopRepeat' as const, x: 370, y: 135 },
          ],
          transitions: [
            { id: createId('tr'), fromStateId: 'st_idle', toStateId: 'st_run', conditionExpr: 'speed > 0.1', blendDuration: 0.25 },
            { id: createId('tr'), fromStateId: 'st_run', toStateId: 'st_idle', conditionExpr: 'speed <= 0.1', blendDuration: 0.25 },
          ],
        };

        return (
          <>
            <InspectorSection title="Malla y Material PBR 3D">
              <div className="grid grid-cols-2 gap-1.5">
                <button
                  type="button"
                  onClick={() =>
                    onUpdateObject(obj.id, (prev) => {
                      const tags = Array.from(new Set([...(prev.tags ?? []), 'Player']));
                      const hasCtrl = prev.components.some(
                        (c) => c.type === 'player_3d' || c.type === 'player_platformer'
                      );
                      return {
                        ...prev,
                        tags,
                        physics3d: {
                          enabled: true,
                          bodyType: 'dynamic',
                          shape: 'capsule',
                          mass: prev.physics3d?.mass ?? 1,
                          gravityScale: prev.physics3d?.gravityScale ?? 1,
                          restitution: 0.05,
                          friction: 0.6,
                        },
                        components: hasCtrl
                          ? prev.components
                          : [
                              ...prev.components,
                              {
                                id: createId('comp'),
                                type: 'player_3d',
                                enabled: true,
                                config: { speed: 6.5, sprintSpeed: 10, jumpForce: 9.5, gravity: 24 },
                              },
                            ],
                      };
                    })
                  }
                  className="rounded border border-emerald-500/45 bg-emerald-600/20 px-2 py-1 text-[11px] font-semibold text-emerald-200 hover:bg-emerald-600/35"
                >
                  Como Jugador
                </button>
                <button
                  type="button"
                  onClick={() =>
                    onUpdateObject(obj.id, (prev) => ({
                      ...prev,
                      tags: Array.from(new Set([...(prev.tags ?? []), 'Enemy'])),
                      physics3d: {
                        enabled: true,
                        bodyType: 'dynamic',
                        shape: 'capsule',
                        mass: prev.physics3d?.mass ?? 1,
                        gravityScale: prev.physics3d?.gravityScale ?? 1,
                        restitution: 0.05,
                        friction: 0.6,
                      },
                      aiAgent: {
                        ...(prev.aiAgent ?? {
                          acceleration: 12,
                          avoidanceRadius: 1.2,
                          stoppingDistance: 1.2,
                          targetObjectId: null,
                          targetX: 0,
                          targetY: 0,
                          targetZ: 0,
                        }),
                        enabled: true,
                        mode: 'chase',
                        speed: prev.aiAgent?.speed ?? 4.2,
                      },
                    }))
                  }
                  className="rounded border border-rose-500/45 bg-rose-600/20 px-2 py-1 text-[11px] font-semibold text-rose-200 hover:bg-rose-600/35"
                >
                  Como Enemigo IA
                </button>
              </div>

              <div className="grid grid-cols-2 gap-1.5 items-center">
                <select
                  aria-label="Forma 3D"
                  value={m3.shape}
                  disabled={m3.shape === 'csg'}
                  onChange={(e) => {
                    const nextShape = e.target.value as Mesh3DShape;
                    const patch: Partial<NonNullable<GameObjectData['mesh3d']>> = { shape: nextShape };
                    if (nextShape === 'terrain' && !m3.terrainData) {
                      patch.terrainData = generateProceduralTerrain({ width: 48, depth: 48, segments: 40 });
                    } else if (nextShape === 'water' && !m3.waterConfig) {
                      patch.waterConfig = {
                        width: 24,
                        depth: 24,
                        flowX: 0.6,
                        flowZ: 0.2,
                        waveAmplitude: 0.14,
                        waveSpeed: 1.8,
                        shallowColor: '#38bdf8',
                        deepColor: '#0c4a6e',
                        foamIntensity: 0.85,
                      };
                    } else if (nextShape === 'grass_field' && !m3.foliageConfig) {
                      patch.foliageConfig = {
                        kind: 'grass',
                        colorBase: '#15803d',
                        colorTip: '#4ade80',
                        windStrength: 0.38,
                        windSpeed: 2.4,
                        interactionRadius: 1.8,
                        instances: [],
                      };
                    }
                    patchM3(patch);
                  }}
                  className="rounded border border-[#32323c] bg-[#141416] px-2 py-1 text-xs text-zinc-100"
                >
                  <option value="box">Caja modular</option>
                  <option value="ramp">Rampa</option>
                  <option value="stairs">Escalera</option>
                  <option value="cylinder">Cilindro</option>
                  <option value="arch">Arco</option>
                  <option value="plane">Plano / Suelo</option>
                  <option value="sphere">Esfera</option>
                  <option value="terrain">Terreno Procedural</option>
                  <option value="water">Agua / Río Reactivo</option>
                  <option value="grass_field">Hierba / Arbustos Viento</option>
                  <option value="glb">Modelo 3D (.glb / .gltf / .fbx)</option>
                  {m3.shape === 'csg' && <option value="csg">CSG Compuesta</option>}
                </select>
                <input
                  type="color"
                  aria-label="Color base PBR"
                  value={m3.color}
                  onChange={(e) => patchM3({ color: e.target.value })}
                  className="h-7 w-full cursor-pointer rounded border border-[#32323c] bg-[#141416] p-0.5"
                />
              </div>

              {m3.shape === 'terrain' && (() => {
                const td = m3.terrainData ?? generateProceduralTerrain();
                const regen = (patch: Partial<typeof td>) => {
                  const nextParams = { ...td, ...patch };
                  patchM3({
                    terrainData: {
                      ...generateProceduralTerrain({
                        width: nextParams.width,
                        depth: nextParams.depth,
                        segments: nextParams.segments,
                        seed: nextParams.seed,
                        amplitude: nextParams.amplitude,
                        frequency: nextParams.frequency,
                        octaves: nextParams.octaves,
                      }),
                      infiniteHorizon: td.infiniteHorizon,
                      horizonColor: td.horizonColor,
                    },
                  });
                };
                return (
                  <div className="space-y-1.5 rounded border border-emerald-500/30 bg-emerald-500/5 p-2">
                    <div className="flex items-center justify-between text-[10px] font-semibold uppercase tracking-wide text-emerald-300">
                      <span>Terreno Procedural</span>
                      <span className="font-mono text-zinc-300">{td.width}×{td.depth}m</span>
                    </div>
                    <div className="grid grid-cols-2 gap-1.5">
                      <NumberField id="ter-seed" label="Semilla" value={td.seed} step={1} onChange={(seed) => regen({ seed })} />
                      <NumberField id="ter-amp" label="Altura" value={td.amplitude} min={0} max={25} step={0.5} onChange={(amplitude) => regen({ amplitude })} />
                      <NumberField id="ter-freq" label="Frec." value={td.frequency} min={0.01} max={0.4} step={0.01} onChange={(frequency) => regen({ frequency })} />
                      <NumberField id="ter-oct" label="Octavas" value={td.octaves} min={1} max={6} step={1} onChange={(octaves) => regen({ octaves })} />
                    </div>
                    <div className="space-y-1 border-t border-emerald-500/20 pt-1.5">
                      <span className="block text-[10px] text-emerald-200/90">
                        Expandir Mundo (conserva relieve esculpido)
                      </span>
                      <div className="grid grid-cols-4 gap-1">
                        {[64, 96, 128, 160].map((sz) => (
                          <button
                            key={sz}
                            type="button"
                            onClick={() =>
                              patchM3({
                                terrainData: expandTerrainData(
                                  td,
                                  sz,
                                  sz,
                                  Math.min(96, Math.round(sz * 0.75))
                                ),
                              })
                            }
                            className="rounded border border-emerald-500/35 bg-[#141b17] py-1 font-mono text-[10px] text-emerald-200 hover:bg-emerald-600/25"
                          >
                            {sz}m
                          </button>
                        ))}
                      </div>
                      <label className="flex items-center gap-2 pt-0.5 text-[11px] text-zinc-200 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={Boolean(td.infiniteHorizon)}
                          onChange={(e) =>
                            patchM3({
                              terrainData: { ...td, infiniteHorizon: e.target.checked },
                            })
                          }
                          className="accent-emerald-500"
                        />
                        <span>Horizonte infinito (plano lejano)</span>
                      </label>
                    </div>
                    <button
                      type="button"
                      onClick={() => regen({ seed: td.seed + 1 })}
                      className="w-full rounded bg-emerald-600/80 px-2 py-1 text-[11px] font-semibold text-white hover:bg-emerald-500"
                    >
                      Nueva semilla aleatoria
                    </button>
                  </div>
                );
              })()}

              {m3.shape === 'water' && (() => {
                const wc = m3.waterConfig ?? {
                  width: 24,
                  depth: 24,
                  flowX: 0.6,
                  flowZ: 0.2,
                  waveAmplitude: 0.14,
                  waveSpeed: 1.8,
                  shallowColor: '#38bdf8',
                  deepColor: '#0c4a6e',
                  foamIntensity: 0.85,
                };
                const patchWater = (p: Partial<typeof wc>) => patchM3({ waterConfig: { ...wc, ...p } });
                return (
                  <div className="space-y-1.5 rounded border border-cyan-500/30 bg-cyan-500/5 p-2">
                    <div className="text-[10px] font-semibold uppercase tracking-wide text-cyan-300">
                      Agua / Corriente / Espuma
                    </div>
                    <div className="grid grid-cols-2 gap-1.5">
                      <NumberField id="wat-w" label="Ancho" value={wc.width} min={4} max={200} onChange={(width) => patchWater({ width })} />
                      <NumberField id="wat-d" label="Fondo" value={wc.depth} min={4} max={200} onChange={(depth) => patchWater({ depth })} />
                      <NumberField id="wat-fx" label="Flujo X" value={wc.flowX} min={-5} max={5} step={0.1} onChange={(flowX) => patchWater({ flowX })} />
                      <NumberField id="wat-fz" label="Flujo Z" value={wc.flowZ} min={-5} max={5} step={0.1} onChange={(flowZ) => patchWater({ flowZ })} />
                      <NumberField id="wat-amp" label="Olas" value={wc.waveAmplitude} min={0} max={1.5} step={0.02} onChange={(waveAmplitude) => patchWater({ waveAmplitude })} />
                      <NumberField id="wat-foam" label="Espuma" value={wc.foamIntensity} min={0} max={2} step={0.05} onChange={(foamIntensity) => patchWater({ foamIntensity })} />
                      <NumberField id="wat-drag" label="Arrastre" value={wc.buoyancyDrag ?? 1.2} min={0.1} max={5} step={0.1} onChange={(buoyancyDrag) => patchWater({ buoyancyDrag })} />
                      <div className="grid grid-cols-2 gap-1">
                        <input type="color" aria-label="Color agua superficial" value={wc.shallowColor} onChange={(e) => patchWater({ shallowColor: e.target.value })} className="h-7 w-full rounded border border-[#32323c] bg-[#141416] p-0.5" />
                        <input type="color" aria-label="Color agua profunda" value={wc.deepColor} onChange={(e) => patchWater({ deepColor: e.target.value })} className="h-7 w-full rounded border border-[#32323c] bg-[#141416] p-0.5" />
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-1.5 text-[11px] text-zinc-200 pt-1">
                      <label className="flex items-center gap-1.5 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={wc.enableWakeTrail !== false}
                          onChange={(e) => patchWater({ enableWakeTrail: e.target.checked })}
                          className="accent-cyan-500"
                        />
                        <span>Estela y Ondas</span>
                      </label>
                      <label className="flex items-center gap-1.5 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={Boolean(wc.planarReflections)}
                          onChange={(e) => patchWater({ planarReflections: e.target.checked })}
                          className="accent-cyan-500"
                        />
                        <span>Reflejos WebGL</span>
                      </label>
                    </div>
                    <div className="space-y-1 border-t border-cyan-500/20 pt-1.5">
                      <div className="text-[10px] font-medium text-cyan-200">
                        Objetos que generan ondas y estelas
                      </div>
                      <div className="flex gap-1">
                        <select
                          aria-label="Objeto que interactúa con el agua"
                          value={waterObjToAdd}
                          onChange={(e) => setWaterObjToAdd(e.target.value)}
                          className="min-w-0 flex-1 rounded border border-[#32323c] bg-[#141416] px-1.5 py-1 text-[11px] text-zinc-100"
                        >
                          <option value="">Seleccionar barco / jugador...</option>
                          {scene.objects
                            .filter((cand) => cand.id !== obj.id && (cand.type === 'mesh_3d' || Boolean(cand.vehicle?.enabled)) && cand.mesh3d?.shape !== 'water' && cand.mesh3d?.shape !== 'terrain')
                            .map((cand) => (
                              <option key={cand.id} value={cand.id}>{cand.name}</option>
                            ))}
                        </select>
                        <button
                          type="button"
                          onClick={() => {
                            const nextId = waterObjToAdd || scene.objects.find((cand) => cand.id !== obj.id && (cand.type === 'mesh_3d' || Boolean(cand.vehicle?.enabled)) && cand.mesh3d?.shape !== 'water' && cand.mesh3d?.shape !== 'terrain')?.id;
                            if (!nextId) return;
                            const prevList = wc.interactingEntities ?? [];
                            if (!prevList.includes(nextId)) {
                              patchWater({ interactingEntities: [...prevList, nextId] });
                            }
                            setWaterObjToAdd('');
                          }}
                          className="rounded bg-cyan-600/80 px-2 py-1 text-[10px] font-semibold text-white hover:bg-cyan-500"
                        >
                          + Añadir Objeto
                        </button>
                      </div>
                      {(wc.interactingEntities?.length ?? 0) > 0 && (
                        <div className="flex flex-wrap gap-1 pt-0.5">
                          {wc.interactingEntities!.map((eid) => {
                            const match = scene.objects.find((o) => o.id === eid);
                            return (
                              <span
                                key={eid}
                                className="inline-flex items-center gap-1 rounded border border-cyan-500/35 bg-cyan-950/40 px-1.5 py-0.5 text-[10px] text-cyan-200"
                              >
                                <span>{match?.name ?? eid}</span>
                                <button
                                  type="button"
                                  aria-label={`Quitar ${match?.name ?? eid}`}
                                  onClick={() =>
                                    patchWater({
                                      interactingEntities: (wc.interactingEntities ?? []).filter((x) => x !== eid),
                                    })
                                  }
                                  className="text-cyan-400 hover:text-red-400"
                                >
                                  ×
                                </button>
                              </span>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  </div>
                );
              })()}

              {m3.shape === 'grass_field' && (() => {
                const fc = m3.foliageConfig ?? {
                  kind: 'grass' as const,
                  colorBase: '#15803d',
                  colorTip: '#4ade80',
                  windStrength: 0.38,
                  windSpeed: 2.4,
                  interactionRadius: 1.8,
                  instances: [],
                };
                const patchFol = (p: Partial<typeof fc>) => patchM3({ foliageConfig: { ...fc, ...p } });
                return (
                  <div className="space-y-1.5 rounded border border-lime-500/30 bg-lime-500/5 p-2">
                    <div className="flex items-center justify-between text-[10px] font-semibold uppercase tracking-wide text-lime-300">
                      <span>Vegetación con Viento</span>
                      <span className="font-mono">{fc.instances.length} brotes</span>
                    </div>
                    <select
                      aria-label="Tipo de vegetación"
                      value={fc.kind}
                      onChange={(e) => patchFol({ kind: e.target.value as 'grass' | 'bush' | 'flower' })}
                      className="w-full rounded border border-[#32323c] bg-[#141416] px-2 py-1 text-xs text-zinc-100"
                    >
                      <option value="grass">Hierba alta</option>
                      <option value="bush">Arbustos</option>
                      <option value="flower">Flores / Plantas</option>
                    </select>
                    <div className="grid grid-cols-2 gap-1.5">
                      <NumberField id="fol-ws" label="Viento" value={fc.windStrength} min={0} max={2} step={0.05} onChange={(windStrength) => patchFol({ windStrength })} />
                      <NumberField id="fol-ir" label="Radio emp." value={fc.interactionRadius} min={0} max={6} step={0.1} onChange={(interactionRadius) => patchFol({ interactionRadius })} />
                      <input type="color" aria-label="Color base vegetación" value={fc.colorBase} onChange={(e) => patchFol({ colorBase: e.target.value })} className="h-7 w-full rounded border border-[#32323c] bg-[#141416] p-0.5" />
                      <input type="color" aria-label="Color punta vegetación" value={fc.colorTip} onChange={(e) => patchFol({ colorTip: e.target.value })} className="h-7 w-full rounded border border-[#32323c] bg-[#141416] p-0.5" />
                    </div>
                    <select
                      aria-label="Modelo 3D para Scatter InstancedMesh"
                      value={fc.modelAssetId ?? ''}
                      onChange={(e) => patchFol({ modelAssetId: e.target.value || null })}
                      className="w-full rounded border border-[#32323c] bg-[#141416] px-2 py-1 text-[11px] text-zinc-100"
                    >
                      <option value="">(Briznas/Arbustos procedurales con viento)</option>
                      {model3dAssets.map((a) => (
                        <option key={a.id} value={a.id}>
                          🌲 {a.name} ({a.format.toUpperCase()})
                        </option>
                      ))}
                    </select>
                    <label className="flex items-center gap-1.5 text-[11px] text-zinc-300 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={fc.alignToNormal !== false}
                        onChange={(e) => patchFol({ alignToNormal: e.target.checked })}
                        className="accent-lime-500"
                      />
                      <span>Alinear inclinación a la normal del terreno</span>
                    </label>
                  </div>
                );
              })()}

              {/* PBR Studio + Presets + Auto-Generador Sobel */}
              <div className="space-y-2 rounded border border-[#2c3140] bg-[#161820] p-2">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-sky-300">
                    PBR Studio (5 Ranuras + Barniz)
                  </span>
                </div>

                {/* Presets de Material PBR en 1 clic */}
                <div className="grid grid-cols-3 gap-1">
                  {PBR_MATERIAL_PRESETS.map((preset) => (
                    <button
                      key={preset.id}
                      type="button"
                      title={preset.description}
                      onClick={() => patchM3(preset.patch)}
                      className={`rounded border px-1.5 py-1 text-[10px] font-medium truncate transition-colors ${
                        m3.materialPreset === preset.id
                          ? 'border-sky-400 bg-sky-500/20 text-sky-100'
                          : 'border-[#2f3344] bg-[#1d202b] text-zinc-300 hover:border-sky-500/50'
                      }`}
                    >
                      {preset.label}
                    </button>
                  ))}
                </div>

                <div className="grid grid-cols-2 gap-1.5">
                  <NumberField
                    id="m3-metal"
                    label="Metálico"
                    value={m3.metalness}
                    min={0}
                    max={1}
                    step={0.05}
                    onChange={(metalness) => patchM3({ metalness })}
                  />
                  <NumberField
                    id="m3-rough"
                    label="Rugosidad"
                    value={m3.roughness}
                    min={0}
                    max={1}
                    step={0.05}
                    onChange={(roughness) => patchM3({ roughness })}
                  />
                  <NumberField
                    id="m3-cc"
                    label="Clearcoat"
                    value={m3.clearcoat ?? 0}
                    min={0}
                    max={1}
                    step={0.05}
                    onChange={(clearcoat) => patchM3({ clearcoat })}
                  />
                  <NumberField
                    id="m3-trans"
                    label="Cristal"
                    value={m3.transmission ?? 0}
                    min={0}
                    max={1}
                    step={0.05}
                    onChange={(transmission) => patchM3({ transmission })}
                  />
                  <NumberField
                    id="m3-emi-int"
                    label="Int. Emisiva"
                    value={m3.emissiveIntensity ?? 0}
                    min={0}
                    max={5}
                    step={0.1}
                    onChange={(emissiveIntensity) => patchM3({ emissiveIntensity })}
                  />
                  <input
                    type="color"
                    aria-label="Color emisivo"
                    value={m3.emissive ?? '#000000'}
                    onChange={(e) => patchM3({ emissive: e.target.value })}
                    className="h-7 w-full cursor-pointer rounded border border-[#32323c] bg-[#141416] p-0.5"
                  />
                </div>

                <div className="space-y-1">
                  <label className="block text-[10px] text-zinc-400">
                    Modelo 3D (.glb / .gltf / .fbx) — sustituye apariencia en el mismo lugar
                  </label>
                  <select
                    aria-label="Modelo 3D GLB o FBX"
                    value={m3.glbAssetId ?? ''}
                    onChange={(e) => {
                      const glbId = e.target.value || null;
                      patchM3({
                        glbAssetId: glbId,
                        shape: glbId ? 'glb' : (m3.shape === 'glb' ? 'box' : m3.shape),
                        clipNames: undefined,
                      });
                    }}
                    className="w-full rounded border border-[#32323c] bg-[#141416] px-2 py-1 text-xs text-zinc-100"
                  >
                    <option value="">(Usar forma modular estándar)</option>
                    {model3dAssets.map((a) => (
                      <option key={a.id} value={a.id}>{a.name} ({a.format.toUpperCase()})</option>
                    ))}
                  </select>
                </div>

                {/* 5 ranuras de mapas PBR */}
                <div className="grid grid-cols-2 gap-1.5">
                  <select
                    aria-label="Textura Albedo 3D"
                    value={m3.textureAssetId ?? ''}
                    onChange={(e) => patchM3({ textureAssetId: e.target.value || null })}
                    className="rounded border border-[#32323c] bg-[#141416] px-1.5 py-1 text-[11px] text-zinc-100"
                  >
                    <option value="">1. Albedo (Color)</option>
                    {imageAssets.map((a) => (
                      <option key={a.id} value={a.id}>{a.name}</option>
                    ))}
                  </select>
                  <select
                    aria-label="Mapa normal 3D"
                    value={m3.normalAssetId ?? ''}
                    onChange={(e) => patchM3({ normalAssetId: e.target.value || null })}
                    className="rounded border border-[#32323c] bg-[#141416] px-1.5 py-1 text-[11px] text-zinc-100"
                  >
                    <option value="">2. Normal Map</option>
                    {imageAssets.map((a) => (
                      <option key={a.id} value={a.id}>{a.name}</option>
                    ))}
                  </select>
                  <select
                    aria-label="Mapa de Rugosidad 3D"
                    value={m3.roughnessAssetId ?? ''}
                    onChange={(e) => patchM3({ roughnessAssetId: e.target.value || null })}
                    className="rounded border border-[#32323c] bg-[#141416] px-1.5 py-1 text-[11px] text-zinc-100"
                  >
                    <option value="">3. Roughness Map</option>
                    {imageAssets.map((a) => (
                      <option key={a.id} value={a.id}>{a.name}</option>
                    ))}
                  </select>
                  <select
                    aria-label="Mapa Metálico 3D"
                    value={m3.metalnessAssetId ?? ''}
                    onChange={(e) => patchM3({ metalnessAssetId: e.target.value || null })}
                    className="rounded border border-[#32323c] bg-[#141416] px-1.5 py-1 text-[11px] text-zinc-100"
                  >
                    <option value="">4. Metalness Map</option>
                    {imageAssets.map((a) => (
                      <option key={a.id} value={a.id}>{a.name}</option>
                    ))}
                  </select>
                  <select
                    aria-label="Mapa AO 3D"
                    value={m3.aoAssetId ?? ''}
                    onChange={(e) => patchM3({ aoAssetId: e.target.value || null })}
                    className="rounded border border-[#32323c] bg-[#141416] px-1.5 py-1 text-[11px] text-zinc-100"
                  >
                    <option value="">5. Oclusión (AO)</option>
                    {imageAssets.map((a) => (
                      <option key={a.id} value={a.id}>{a.name}</option>
                    ))}
                  </select>
                  <select
                    aria-label="Mapa Emisivo 3D"
                    value={m3.emissiveAssetId ?? ''}
                    onChange={(e) => patchM3({ emissiveAssetId: e.target.value || null })}
                    className="rounded border border-[#32323c] bg-[#141416] px-1.5 py-1 text-[11px] text-zinc-100"
                  >
                    <option value="">Emissive Map</option>
                    {imageAssets.map((a) => (
                      <option key={a.id} value={a.id}>{a.name}</option>
                    ))}
                  </select>
                </div>

                {/* Botón Auto-Generar Relieve y Brillo (Sobel) */}
                {onCreateAsset && (
                  <button
                    type="button"
                    disabled={generatingPbrMaps}
                    onClick={async () => {
                      const albedoId = m3.textureAssetId;
                      if (!albedoId) {
                        setPbrNotice('Asigna primero una textura en "1. Albedo (Color)" para generar su relieve.');
                        return;
                      }
                      const blob = assetBlobs?.get(albedoId);
                      const srcMeta = imageAssets.find((a) => a.id === albedoId);
                      if (!blob) {
                        setPbrNotice('No se encontró la imagen en memoria.');
                        return;
                      }
                      try {
                        setGeneratingPbrMaps(true);
                        setPbrNotice(null);
                        const res = await generatePbrAssetBlobsFromImage(blob, srcMeta?.name || obj.name);
                        const normalId = createId('asset');
                        const roughId = createId('asset');
                        const toDataUrl = (b: Blob) =>
                          new Promise<string>((resolve) => {
                            const fr = new FileReader();
                            fr.onload = () => resolve(String(fr.result || ''));
                            fr.onerror = () => resolve('');
                            fr.readAsDataURL(b);
                          });
                        const [normalThumb, roughThumb] = await Promise.all([
                          toDataUrl(res.normalBlob),
                          toDataUrl(res.roughnessBlob),
                        ]);
                        await onCreateAsset(
                          {
                            id: normalId,
                            name: `${srcMeta?.name || obj.name} Normal`,
                            filename: res.normalFilename,
                            kind: 'image',
                            format: 'png',
                            thumbnailDataUrl: normalThumb,
                            mimeType: 'image/png',
                            size: res.normalBlob.size,
                            width: res.width,
                            height: res.height,
                            createdAt: Date.now(),
                            tags: ['pbr', 'normal'],
                          },
                          res.normalBlob
                        );
                        await onCreateAsset(
                          {
                            id: roughId,
                            name: `${srcMeta?.name || obj.name} Roughness`,
                            filename: res.roughnessFilename,
                            kind: 'image',
                            format: 'png',
                            thumbnailDataUrl: roughThumb,
                            mimeType: 'image/png',
                            size: res.roughnessBlob.size,
                            width: res.width,
                            height: res.height,
                            createdAt: Date.now(),
                            tags: ['pbr', 'roughness'],
                          },
                          res.roughnessBlob
                        );
                        patchM3({ normalAssetId: normalId, roughnessAssetId: roughId });
                        setPbrNotice('Normal Map y Roughness Map generados con Sobel y asignados.');
                      } catch (err) {
                        setPbrNotice(err instanceof Error ? err.message : 'Error al generar mapas PBR.');
                      } finally {
                        setGeneratingPbrMaps(false);
                      }
                    }}
                    className="flex w-full items-center justify-center gap-1.5 rounded border border-amber-500/40 bg-amber-500/15 px-2.5 py-1.5 text-[11px] font-semibold text-amber-200 hover:bg-amber-500/25 disabled:opacity-50"
                  >
                    <Sparkles className="h-3.5 w-3.5 text-amber-400" />
                    <span>{generatingPbrMaps ? 'Generando mapas Sobel...' : 'Auto-Generar Relieve y Brillo (Sobel)'}</span>
                  </button>
                )}
                {pbrNotice && (
                  <p className="text-[10px] text-emerald-300 leading-snug">{pbrNotice}</p>
                )}
              </div>

              <div className="grid grid-cols-2 gap-1.5 text-xs text-zinc-300">
                <label className="flex items-center gap-1.5 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={m3.castShadow}
                    onChange={(e) => patchM3({ castShadow: e.target.checked })}
                    className="accent-blue-500"
                  />
                  <span>Proyecta sombra</span>
                </label>
                <label className="flex items-center gap-1.5 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={m3.receiveShadow}
                    onChange={(e) => patchM3({ receiveShadow: e.target.checked })}
                    className="accent-blue-500"
                  />
                  <span>Recibe sombras</span>
                </label>
              </div>

              <button
                type="button"
                onClick={() => setAnimModalOpen(true)}
                className="flex w-full items-center justify-center gap-1.5 rounded border border-purple-500/40 bg-purple-600/15 px-2.5 py-1.5 text-xs font-medium text-purple-200 hover:bg-purple-600/25"
              >
                <Film className="h-3.5 w-3.5" />
                <span>Máquina de Animaciones 3D ({obj.animStateMachine?.states.length ?? 0} estados)</span>
              </button>

              {(obj.animStateMachine?.states.length ?? 0) > 0 && (
                <div className="flex flex-wrap gap-1">
                  {obj.animStateMachine!.states.map((st) => {
                    const f = st.assetId ? assets.find((a) => a.id === st.assetId) : null;
                    return (
                      <span
                        key={st.id}
                        className="inline-flex items-center gap-1 rounded border border-purple-500/30 bg-[#1a1826] px-1.5 py-0.5 text-[10px] text-purple-200"
                      >
                        <strong>{st.name}</strong>
                        <span className="font-mono text-[9px] text-emerald-300">
                          {f ? `✓ ${f.filename || f.name}` : st.clipName}
                        </span>
                      </span>
                    );
                  })}
                </div>
              )}

              <AnimationStateMachineModal
                open={animModalOpen}
                mode="3d"
                objectName={obj.name}
                clipNames={m3.clipNames && m3.clipNames.length > 0 ? m3.clipNames : ['Idle', 'Walk', 'Run', 'Jump']}
                assets={assets}
                assetBlobs={assetBlobs}
                onImportClipAsset={
                  onImportFiles
                    ? async (files) => {
                        const created = await onImportFiles(files);
                        return created && created[0] ? created[0].id : null;
                      }
                    : undefined
                }
                config={defaultAnimConfig}
                onClose={() => setAnimModalOpen(false)}
                onSave={(nextCfg) => {
                  onUpdateObject(obj.id, (prev) => ({
                    ...prev,
                    animStateMachine: nextCfg,
                  }));
                  setAnimModalOpen(false);
                }}
              />
            </InspectorSection>

            <InspectorSection
              title="Física 3D"
              defaultOpen={phy3.enabled || (phy3.cameraCollision ?? 'auto') !== 'auto'}
            >
              <label className="flex items-center gap-2 text-xs text-zinc-200 cursor-pointer">
                <input
                  type="checkbox"
                  checked={phy3.enabled}
                  onChange={(e) => patchPhy3({ enabled: e.target.checked })}
                  className="accent-emerald-500"
                />
                <span>Activar cuerpo físico 3D</span>
              </label>

              <div className="space-y-1 rounded border border-[#2a2a33] bg-[#141418] px-2 py-1.5">
                <label
                  htmlFor="phy3-cam-col"
                  className="flex items-center justify-between text-[11px] font-medium text-sky-300"
                >
                  <span>Colisión con cámara</span>
                  <span className="text-[10px] text-zinc-400">
                    {(phy3.cameraCollision ?? 'auto') === 'always'
                      ? 'Bloquea siempre'
                      : (phy3.cameraCollision ?? 'auto') === 'never'
                        ? 'Ignorada'
                        : 'Automática'}
                  </span>
                </label>
                <select
                  id="phy3-cam-col"
                  aria-label="Colisión con cámara"
                  value={phy3.cameraCollision ?? 'auto'}
                  onChange={(e) =>
                    patchPhy3({
                      cameraCollision: e.target.value as 'auto' | 'always' | 'never',
                    })
                  }
                  className="w-full rounded border border-[#32323c] bg-[#141416] px-2 py-1 text-xs text-zinc-100"
                >
                  <option value="auto">Automática (solo muros altos)</option>
                  <option value="always">Siempre bloquear cámara (Muro / Pared)</option>
                  <option value="never">Ignorar cámara (Atravesable)</option>
                </select>
              </div>

              {phy3.enabled && (() => {
                const t3Phy = obj.transform3d ?? { x: 0, y: 0.5, z: 0, rx: 0, ry: 0, rz: 0, sx: 1, sy: 1, sz: 1 };
                const he = phy3.halfExtents ?? {
                  x: Math.max(0.1, Math.abs(t3Phy.sx) * 0.5),
                  y: Math.max(0.1, Math.abs(t3Phy.sy) * 0.5),
                  z: Math.max(0.1, Math.abs(t3Phy.sz) * 0.5),
                };
                const off = phy3.offset ?? { x: 0, y: 0, z: 0 };
                return (
                <div className="space-y-1.5">
                  <button
                    type="button"
                    onClick={() => patchPhy3({ shape: 'mesh_exact', enabled: true })}
                    className={`w-full rounded border px-2 py-1 text-[11px] font-medium transition-colors ${
                      phy3.shape === 'mesh_exact'
                        ? 'border-cyan-400 bg-cyan-500/20 text-cyan-200'
                        : 'border-cyan-500/40 bg-cyan-500/10 text-cyan-300 hover:bg-cyan-500/20'
                    }`}
                  >
                    {phy3.shape === 'mesh_exact'
                      ? '✓ Colisión Inteligente 3D (Malla Exacta activa)'
                      : '⚡ Colisión Inteligente 3D (Ajustar a Malla)'}
                  </button>
                  <div className="grid grid-cols-2 gap-1.5">
                    <select
                      aria-label="Tipo cuerpo 3D"
                      value={phy3.bodyType}
                      onChange={(e) => patchPhy3({ bodyType: e.target.value as 'static' | 'dynamic' | 'kinematic' })}
                      className="rounded border border-[#32323c] bg-[#141416] px-2 py-1 text-xs text-zinc-100"
                    >
                      <option value="static">Estático (Suelo/Muro)</option>
                      <option value="dynamic">Dinámico (Gravedad)</option>
                      <option value="kinematic">Cinemático</option>
                    </select>
                    <select
                      aria-label="Forma colisionador 3D"
                      value={phy3.shape}
                      onChange={(e) =>
                        patchPhy3({ shape: e.target.value as Physics3DProperties['shape'] })
                      }
                      className="rounded border border-[#32323c] bg-[#141416] px-2 py-1 text-xs text-zinc-100"
                    >
                      <option value="box">Caja (OBB / AABB)</option>
                      <option value="sphere">Esfera</option>
                      <option value="capsule">Cápsula (Jugador)</option>
                      <option value="mesh_exact">Colisión Inteligente (Malla)</option>
                    </select>
                  </div>
                  <div className="grid grid-cols-2 gap-1.5">
                    <NumberField id="phy3-mass" label="Masa" value={phy3.mass} min={0.1} max={10000} step={0.5} onChange={(mass) => patchPhy3({ mass })} />
                    <NumberField id="phy3-grav" label="Gravedad ×" value={phy3.gravityScale} min={0} max={20} step={0.1} onChange={(gravityScale) => patchPhy3({ gravityScale })} />
                    <NumberField id="phy3-rest" label="Rebote" value={phy3.restitution} min={0} max={1} step={0.05} onChange={(restitution) => patchPhy3({ restitution })} />
                    <NumberField id="phy3-fric" label="Fricción" value={phy3.friction} min={0} max={1} step={0.05} onChange={(friction) => patchPhy3({ friction })} />
                  </div>
                  {phy3.shape !== 'mesh_exact' && (
                    <div className="space-y-1.5 rounded border border-[#2a2a33] bg-[#141418] p-2">
                      <div className="flex items-center justify-between text-[10px] text-emerald-300">
                        <span className="font-semibold uppercase tracking-wide">Zona de colisión manual</span>
                        <button
                          type="button"
                          onClick={() =>
                            patchPhy3({
                              offset: { x: 0, y: 0, z: 0 },
                              halfExtents: {
                                x: Number(Math.max(0.2, Math.abs(t3Phy.sx) * 0.5).toFixed(2)),
                                y: Number(Math.max(0.1, Math.abs(t3Phy.sy) * 0.5).toFixed(2)),
                                z: Number(Math.max(0.2, Math.abs(t3Phy.sz) * 0.5).toFixed(2)),
                              },
                              radius: Number(Math.max(0.2, Math.max(Math.abs(t3Phy.sx), Math.abs(t3Phy.sz)) * 0.5).toFixed(2)),
                            })
                          }
                          className="rounded border border-emerald-500/30 px-1.5 py-0.5 text-[10px] text-emerald-200 hover:bg-emerald-500/15"
                        >
                          Auto-ajustar
                        </button>
                      </div>
                      <div className="text-[10px] text-zinc-400">Desfase (Offset X / Y / Z)</div>
                      <div className="grid grid-cols-3 gap-1">
                        <NumberField id="phy3-ox" label="OX" value={off.x} step={0.1} onChange={(x) => patchPhy3({ offset: { ...off, x } })} />
                        <NumberField id="phy3-oy" label="OY" value={off.y} step={0.1} onChange={(y) => patchPhy3({ offset: { ...off, y } })} />
                        <NumberField id="phy3-oz" label="OZ" value={off.z} step={0.1} onChange={(z) => patchPhy3({ offset: { ...off, z } })} />
                      </div>
                      {phy3.shape === 'sphere' ? (
                        <NumberField
                          id="phy3-rad"
                          label="Radio esfera"
                          value={phy3.radius ?? Math.max(he.x, he.y, he.z)}
                          min={0.1}
                          step={0.1}
                          onChange={(radius) => patchPhy3({ radius })}
                        />
                      ) : (
                        <>
                          <div className="text-[10px] text-zinc-400">Semiejes (Tamaño ÷ 2)</div>
                          <div className="grid grid-cols-3 gap-1">
                            <NumberField id="phy3-hx" label="HX" value={he.x} min={0.05} step={0.1} onChange={(x) => patchPhy3({ halfExtents: { ...he, x } })} />
                            <NumberField id="phy3-hy" label="HY" value={he.y} min={0.05} step={0.1} onChange={(y) => patchPhy3({ halfExtents: { ...he, y } })} />
                            <NumberField id="phy3-hz" label="HZ" value={he.z} min={0.05} step={0.1} onChange={(z) => patchPhy3({ halfExtents: { ...he, z } })} />
                          </div>
                        </>
                      )}
                      <p className="text-[10px] text-zinc-500">
                        Tip: Activa <strong>Colisiones</strong> y <strong>Editar Zona</strong> en el visor 3D para mover/escalar esta zona visualmente.
                      </p>
                    </div>
                  )}
                </div>
                );
              })()}
            </InspectorSection>

            <InspectorSection title="Agente IA (NavMesh A*)" defaultOpen={ai.enabled}>
              <label className="flex items-center gap-2 text-xs text-zinc-200 cursor-pointer">
                <input
                  type="checkbox"
                  checked={ai.enabled}
                  onChange={(e) => patchAi({ enabled: e.target.checked })}
                  className="accent-purple-500"
                />
                <span>Navegación espacial NavMesh IA</span>
              </label>

              {ai.enabled && (
                <div className="space-y-1.5">
                  <div className="grid grid-cols-2 gap-1.5">
                    <select
                      aria-label="Modo de agente IA"
                      value={ai.mode}
                      onChange={(e) => patchAi({ mode: e.target.value as 'idle' | 'chase' | 'moveTo' })}
                      className="rounded border border-[#32323c] bg-[#141416] px-2 py-1 text-xs text-zinc-100"
                    >
                      <option value="idle">Quieto</option>
                      <option value="chase">Perseguir objetivo</option>
                      <option value="moveTo">Ir a coordenada (X,Z)</option>
                    </select>
                    <select
                      aria-label="Objetivo del agente IA"
                      value={ai.targetObjectId ?? ''}
                      onChange={(e) => patchAi({ targetObjectId: e.target.value || null })}
                      className="rounded border border-[#32323c] bg-[#141416] px-2 py-1 text-xs text-zinc-100"
                    >
                      <option value="">(Jugador / Objetivo)</option>
                      {scene.objects.filter((o) => o.id !== obj.id).map((o) => (
                        <option key={o.id} value={o.id}>{o.name}</option>
                      ))}
                    </select>
                  </div>
                  <div className="grid grid-cols-2 gap-1.5">
                    <NumberField id="ai-spd" label="Vel." value={ai.speed} min={0.1} max={200} step={0.5} onChange={(speed) => patchAi({ speed })} />
                    <NumberField id="ai-stop" label="Dist. parada" value={ai.stoppingDistance} min={0.1} max={100} step={0.2} onChange={(stoppingDistance) => patchAi({ stoppingDistance })} />
                    <NumberField id="ai-avoid" label="Evasión" value={ai.avoidanceRadius} min={0.1} max={50} step={0.2} onChange={(avoidanceRadius) => patchAi({ avoidanceRadius })} />
                    <NumberField
                      id="ai-max-chase"
                      label="Alcance máx (0=∞)"
                      value={ai.maxChaseDistance ?? 0}
                      min={0}
                      max={5000}
                      step={1}
                      onChange={(v) => patchAi({ maxChaseDistance: v <= 0 ? undefined : v })}
                    />
                  </div>
                  <div className="space-y-1.5 rounded border border-purple-500/25 bg-[#14141a] p-2">
                    <div className="text-[10px] font-semibold uppercase tracking-wide text-purple-300">
                      Cono de Visión y Táctica IA
                    </div>
                    <div className="grid grid-cols-2 gap-1.5">
                      <NumberField
                        id="ai-fov"
                        label="Cono visión °"
                        value={ai.visionFovDeg ?? 110}
                        min={15}
                        max={360}
                        step={5}
                        onChange={(visionFovDeg) => patchAi({ visionFovDeg })}
                      />
                      <NumberField
                        id="ai-vrange"
                        label="Rango vista (m)"
                        value={ai.visionRange ?? 24}
                        min={1}
                        max={500}
                        step={1}
                        onChange={(visionRange) => patchAi({ visionRange })}
                      />
                      <NumberField
                        id="ai-jump-h"
                        label="Salto ventana (m)"
                        value={ai.maxJumpHeight ?? 1.45}
                        min={0}
                        max={10}
                        step={0.1}
                        onChange={(maxJumpHeight) => patchAi({ maxJumpHeight })}
                      />
                      <NumberField
                        id="ai-flee"
                        label="Huir si HP ≤"
                        value={ai.fleeHealthRatio ?? 0.25}
                        min={0}
                        max={1}
                        step={0.05}
                        onChange={(fleeHealthRatio) => patchAi({ fleeHealthRatio })}
                      />
                      <NumberField
                        id="ai-insist"
                        label="Insistir jug. ≤"
                        value={ai.insistDamageRatio ?? 0.35}
                        min={0}
                        max={1}
                        step={0.05}
                        onChange={(insistDamageRatio) => patchAi({ insistDamageRatio })}
                      />
                    </div>
                    <div className="space-y-1 text-[11px] text-zinc-300">
                      <label className="flex items-center gap-1.5 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={ai.requireLineOfSight !== false}
                          onChange={(e) => patchAi({ requireLineOfSight: e.target.checked })}
                          className="accent-purple-500"
                        />
                        <span>Detectar por línea de visión (sin atravesar muros)</span>
                      </label>
                      <label className="flex items-center gap-1.5 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={ai.canJumpObstacles !== false}
                          onChange={(e) => patchAi({ canJumpObstacles: e.target.checked })}
                          className="accent-purple-500"
                        />
                        <span>Saltar ventanas / rodear muros altos</span>
                      </label>
                      <label className="flex items-center gap-1.5 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={ai.showVisionCone !== false}
                          onChange={(e) => patchAi({ showVisionCone: e.target.checked })}
                          className="accent-amber-500"
                        />
                        <span>Mostrar cono de visión en editor</span>
                      </label>
                    </div>
                  </div>
                </div>
              )}

              <div className="space-y-1 border-t border-[#2a2a33] pt-2">
                <label htmlFor="insp-navrole" className="block text-[10px] text-zinc-400">
                  Rol en Mapa IA (NavMesh)
                </label>
                <div className="flex items-center gap-1.5">
                  <select
                    id="insp-navrole"
                    value={obj.navRole ?? 'auto'}
                    onChange={(e) =>
                      onUpdateObject(obj.id, (prev) => ({
                        ...prev,
                        navRole: e.target.value as NavMeshObjectRole,
                      }))
                    }
                    className="min-w-0 flex-1 rounded border border-[#32323c] bg-[#141416] px-2 py-1 text-xs text-zinc-100"
                  >
                    <option value="auto">Automático (por tamaño)</option>
                    <option value="terrain">Terreno transitable</option>
                    <option value="obstacle">Obstáculo bloqueante</option>
                    <option value="ignore">Ignorar (solo visual)</option>
                  </select>
                  <button
                    type="button"
                    onClick={() => {
                      const nav = buildNavMeshFromScene(scene, { cellSize: 1.2, maxSlopeDeg: 45 });
                      onUpdateScene((s) => ({ ...s, navMesh: nav }));
                    }}
                    title="Recalcular NavMesh con los roles actuales"
                    className="rounded bg-cyan-600/80 px-2 py-1 text-[11px] font-semibold text-white hover:bg-cyan-500"
                  >
                    Hornear
                  </button>
                </div>
              </div>
            </InspectorSection>

            <InspectorSection title="Soft-Body (Cuerdas / Gel / Arena)" defaultOpen={Boolean(obj.softBody?.enabled)}>
              {(() => {
                const sb: SoftBodyConfig = obj.softBody ?? {
                  enabled: false,
                  kind: 'rope',
                  segments: 8,
                  length: 5,
                  stiffness: 0.9,
                  damping: 0.97,
                  gravity: -18,
                  anchorStart: true,
                  anchorEnd: false,
                  particleCount: 18,
                  radius: 0.18,
                  color: '#d97706',
                };
                const patchSb = (p: Partial<SoftBodyConfig>) =>
                  onUpdateObject(obj.id, (prev) => ({ ...prev, softBody: { ...sb, ...p } }));
                return (
                  <div className="space-y-1.5">
                    <label className="flex items-center gap-2 text-xs text-zinc-200 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={sb.enabled}
                        onChange={(e) => patchSb({ enabled: e.target.checked })}
                        className="accent-amber-500"
                      />
                      <span>Activar simulación blanda Verlet</span>
                    </label>
                    {sb.enabled && (
                      <>
                        <div className="grid grid-cols-2 gap-1.5 items-center">
                          <select
                            aria-label="Tipo soft-body"
                            value={sb.kind}
                            onChange={(e) => patchSb({ kind: e.target.value as SoftBodyConfig['kind'] })}
                            className="rounded border border-[#32323c] bg-[#141416] px-2 py-1 text-xs text-zinc-100"
                          >
                            <option value="rope">Cuerda</option>
                            <option value="chain">Cadena</option>
                            <option value="bridge">Puente colgante</option>
                            <option value="gel">Gel elástico</option>
                            <option value="sand">Arena granular</option>
                          </select>
                          <input
                            type="color"
                            aria-label="Color soft-body"
                            value={sb.color ?? '#d97706'}
                            onChange={(e) => patchSb({ color: e.target.value })}
                            className="h-7 w-full rounded border border-[#32323c] bg-[#141416] p-0.5"
                          />
                        </div>
                        <div className="grid grid-cols-2 gap-1.5">
                          <NumberField id="sb-segs" label="Segmentos" value={sb.segments} min={3} max={24} onChange={(segments) => patchSb({ segments })} />
                          <NumberField id="sb-len" label="Longitud" value={sb.length} min={1} max={30} step={0.5} onChange={(length) => patchSb({ length })} />
                          <NumberField id="sb-stiff" label="Rigidez" value={sb.stiffness} min={0.1} max={1} step={0.05} onChange={(stiffness) => patchSb({ stiffness })} />
                          <NumberField id="sb-grav" label="Gravedad" value={sb.gravity} min={-40} max={10} step={1} onChange={(gravity) => patchSb({ gravity })} />
                        </div>
                        <div className="grid grid-cols-2 gap-1.5 text-xs text-zinc-300">
                          <label className="flex items-center gap-1.5 cursor-pointer">
                            <input type="checkbox" checked={sb.anchorStart} onChange={(e) => patchSb({ anchorStart: e.target.checked })} className="accent-amber-500" />
                            <span>Anclar inicio</span>
                          </label>
                          <label className="flex items-center gap-1.5 cursor-pointer">
                            <input type="checkbox" checked={sb.anchorEnd} onChange={(e) => patchSb({ anchorEnd: e.target.checked })} className="accent-amber-500" />
                            <span>Anclar fin</span>
                          </label>
                        </div>
                      </>
                    )}
                  </div>
                );
              })()}
            </InspectorSection>
          </>
        );
      })()}

      {(obj.type === 'mesh_3d' || obj.type === 'container') && (() => {
        const phy3 = obj.physics3d ?? {
          enabled: false,
          bodyType: 'static' as const,
          shape: 'box' as const,
          mass: 1,
          gravityScale: 1,
          restitution: 0.1,
          friction: 0.6,
        };
        return (
          <>
            <InspectorSection title="Vehículo 3D Pro (Auto / Bote / Avión / Nave)" defaultOpen={Boolean(obj.vehicle?.enabled)}>
              {(() => {
                const veh: Vehicle4WConfig = obj.vehicle ?? {
                  enabled: false,
                  vehicleKind: 'car',
                  maxTorque: 26,
                  maxSpeed: 22,
                  maxSteerDeg: 32,
                  suspensionRestLen: 0.65,
                  suspensionStiffness: 36,
                  suspensionDamping: 4.8,
                  wheelRadius: 0.42,
                  wheelBase: 2.6,
                  trackWidth: 1.7,
                  driveType: 'awd',
                  gripFactor: 0.86,
                  physicsLodDistance: 140,
                };
                const patchVeh = (p: Partial<Vehicle4WConfig>) =>
                  onUpdateObject(obj.id, (prev) => ({
                    ...prev,
                    vehicle: { ...veh, ...p },
                    physics3d:
                      p.enabled === true
                        ? {
                            ...(prev.physics3d ?? phy3),
                            enabled: true,
                            bodyType: 'dynamic',
                            gravityScale: (p.vehicleKind ?? veh.vehicleKind) === 'spaceship' ? 0 : (prev.physics3d?.gravityScale ?? 1),
                          }
                        : prev.physics3d,
                  }));
                const kind = veh.vehicleKind ?? 'car';
                return (
                  <div className="space-y-2">
                    <div className="flex items-center justify-between gap-2">
                      <label className="flex items-center gap-2 text-xs text-zinc-200 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={veh.enabled}
                          onChange={(e) => patchVeh({ enabled: e.target.checked })}
                          className="accent-sky-500"
                        />
                        <span>Activar Vehículo Pro (WASD)</span>
                      </label>
                      {onOpenVehicleWizard && (
                        <button
                          type="button"
                          onClick={onOpenVehicleWizard}
                          className="rounded border border-emerald-500/40 bg-emerald-500/15 px-2 py-0.5 text-[10px] font-semibold text-emerald-300 hover:bg-emerald-500/25"
                        >
                          Asistente
                        </button>
                      )}
                    </div>
                    {veh.enabled && (
                      <>
                        <select
                          aria-label="Modo de vehículo 3D"
                          value={kind}
                          onChange={(e) => {
                            const nextK = e.target.value as VehicleKind3D;
                            patchVeh({
                              vehicleKind: nextK,
                              mountStyle: nextK === 'moto' || nextK === 'horse' ? 'saddle' : veh.mountStyle,
                            });
                          }}
                          className="w-full rounded border border-[#32323c] bg-[#141416] px-2 py-1 text-xs text-zinc-100"
                        >
                          <option value="car">Auto 4 Ruedas + Suspensión</option>
                          <option value="moto">Moto / Bici (2 Ruedas + Montura)</option>
                          <option value="horse">Caballo / Montura (Galope + Salto)</option>
                          <option value="boat">Bote / Barco (Flotación en Olas)</option>
                          <option value="plane">Avión (Aerodinámica 6DOF)</option>
                          <option value="helicopter">Helicóptero (Rotor Y + Auto-Hover)</option>
                          <option value="spaceship">Nave Espacial (6DOF + Gravedad Local)</option>
                        </select>

                        <div className="grid grid-cols-2 gap-1.5">
                          <NumberField id="veh-spd" label="Velocidad Máx" value={veh.maxSpeed} min={4} max={120} onChange={(maxSpeed) => patchVeh({ maxSpeed })} />
                          <NumberField id="veh-trq" label="Aceleración" value={veh.maxTorque} min={4} max={100} onChange={(maxTorque) => patchVeh({ maxTorque })} />
                          <NumberField id="veh-susp" label="Amortiguadores" value={veh.suspensionStiffness} min={10} max={120} onChange={(suspensionStiffness) => patchVeh({ suspensionStiffness })} />
                          <NumberField id="veh-grip" label="Derrape (Grip)" value={veh.gripFactor ?? 0.86} min={0.1} max={1} step={0.05} onChange={(gripFactor) => patchVeh({ gripFactor })} />
                          <NumberField id="veh-str" label="Giro °" value={veh.maxSteerDeg} min={10} max={60} onChange={(maxSteerDeg) => patchVeh({ maxSteerDeg })} />
                          <NumberField id="veh-lod" label="LOD Físicas (m)" value={veh.physicsLodDistance ?? 140} min={20} max={600} step={10} onChange={(physicsLodDistance) => patchVeh({ physicsLodDistance })} />
                        </div>

                        {(kind === 'car' || kind === 'moto') && (
                          <div className="space-y-1.5 rounded border border-cyan-500/30 bg-cyan-500/5 p-2">
                            <div className="text-[10px] font-semibold text-cyan-300">
                              Dimensiones de Ruedas y Suspensión (Malla en escena)
                            </div>
                            <div className="grid grid-cols-2 gap-1.5">
                              <NumberField
                                id="veh-wrad"
                                label="Radio Rueda (m)"
                                value={veh.wheelRadius ?? 0.42}
                                min={0.18}
                                max={2.5}
                                step={0.04}
                                onChange={(wheelRadius) => patchVeh({ wheelRadius })}
                              />
                              <NumberField
                                id="veh-wwid"
                                label="Ancho Rueda (m)"
                                value={veh.wheelWidth ?? (kind === 'moto' ? 0.22 : 0.3)}
                                min={0.12}
                                max={1.5}
                                step={0.02}
                                onChange={(wheelWidth) => patchVeh({ wheelWidth })}
                              />
                              <NumberField
                                id="veh-rest"
                                label="Suspensión (m)"
                                value={veh.suspensionRestLen ?? 0.65}
                                min={0.2}
                                max={2.0}
                                step={0.05}
                                onChange={(suspensionRestLen) => patchVeh({ suspensionRestLen })}
                              />
                              <NumberField
                                id="veh-wbase"
                                label="Dist. Ejes (m)"
                                value={veh.wheelBase ?? 2.5}
                                min={1.0}
                                max={8.0}
                                step={0.1}
                                onChange={(wheelBase) => patchVeh({ wheelBase })}
                              />
                              {kind === 'car' && (
                                <NumberField
                                  id="veh-track"
                                  label="Ancho Eje (m)"
                                  value={veh.trackWidth ?? 1.92}
                                  min={0.8}
                                  max={5.0}
                                  step={0.08}
                                  onChange={(trackWidth) => patchVeh({ trackWidth })}
                                />
                              )}
                            </div>
                            {veh.parts && (veh.parts.wheelFL || veh.parts.wheelFR || veh.parts.wheelRL || veh.parts.wheelRR) && (
                              <button
                                type="button"
                                onClick={() => {
                                  const wRad = Math.max(0.18, veh.wheelRadius ?? 0.42);
                                  const wWid = Math.max(0.12, veh.wheelWidth ?? (kind === 'moto' ? 0.22 : 0.3));
                                  const rest = Math.max(0.2, veh.suspensionRestLen ?? 0.65);
                                  const hw = kind === 'moto' ? 0 : Math.max(0.8, veh.trackWidth ?? 1.92) * 0.5;
                                  const hl = Math.max(1.0, veh.wheelBase ?? 2.5) * 0.5;
                                  const wy = -(rest * 0.85);
                                  const defW = kind === 'moto' ? 0.22 : 0.3;
                                  const wheelSlots: Record<string, { x: number; z: number }> = {
                                    ...(veh.parts?.wheelFL ? { [veh.parts.wheelFL]: { x: -hw, z: hl } } : {}),
                                    ...(veh.parts?.wheelFR ? { [veh.parts.wheelFR]: { x: hw, z: hl } } : {}),
                                    ...(veh.parts?.wheelRL ? { [veh.parts.wheelRL]: { x: -hw, z: -hl } } : {}),
                                    ...(veh.parts?.wheelRR ? { [veh.parts.wheelRR]: { x: hw, z: -hl } } : {}),
                                  };
                                  onUpdateScene((prevScene) => ({
                                    ...prevScene,
                                    objects: prevScene.objects.map((cand) => {
                                      const slotPos = wheelSlots[cand.id];
                                      if (!slotPos || !cand.transform3d) return cand;
                                      const isGlb = cand.mesh3d?.shape === 'glb' && Boolean(cand.mesh3d.glbAssetId);
                                      return {
                                        ...cand,
                                        transform3d: {
                                          ...cand.transform3d,
                                          x: slotPos.x,
                                          y: wy,
                                          z: slotPos.z,
                                          sx: isGlb ? Math.max(0.14, (wRad * 2) * (wWid / defW)) : wRad * 2,
                                          sy: isGlb ? wRad * 2 : wWid,
                                          sz: wRad * 2,
                                        },
                                      };
                                    }),
                                  }));
                                }}
                                className="w-full rounded border border-cyan-500/40 bg-cyan-500/15 px-2 py-1 text-[10px] font-semibold text-cyan-200 hover:bg-cyan-500/25"
                              >
                                Ajustar ruedas hijas a este tamaño
                              </button>
                            )}
                          </div>
                        )}

                        {kind === 'boat' && (
                          <div className="grid grid-cols-2 gap-1.5">
                            <select
                              aria-label="Tamaño del barco"
                              value={veh.boatSize ?? 'speedboat'}
                              onChange={(e) => patchVeh({ boatSize: e.target.value as 'speedboat' | 'medium' | 'ship' })}
                              className="rounded border border-[#32323c] bg-[#141416] px-1.5 py-1 text-[11px] text-zinc-100"
                            >
                              <option value="speedboat">Lancha (4 pontones)</option>
                              <option value="medium">Mediano (6 pontones)</option>
                              <option value="ship">Barco Grande (12 pontones)</option>
                            </select>
                            <select
                              aria-label="Agua para flotar"
                              value={veh.waterObjectId ?? ''}
                              onChange={(e) => patchVeh({ waterObjectId: e.target.value || null })}
                              className="rounded border border-[#32323c] bg-[#141416] px-1.5 py-1 text-[11px] text-zinc-100"
                            >
                              <option value="">Agua automática</option>
                              {scene.objects.filter((o) => o.type === 'mesh_3d' && o.mesh3d?.shape === 'water').map((w) => (
                                <option key={w.id} value={w.id}>{w.name}</option>
                              ))}
                            </select>
                          </div>
                        )}

                        {kind === 'plane' && (
                          <div className="grid grid-cols-2 gap-1.5">
                            <select
                              aria-label="Estilo de avión"
                              value={veh.planeStyle ?? 'fighter'}
                              onChange={(e) => patchVeh({ planeStyle: e.target.value as 'fighter' | 'airliner' })}
                              className="rounded border border-[#32323c] bg-[#141416] px-1.5 py-1 text-[11px] text-zinc-100"
                            >
                              <option value="fighter">Caza Acrobático</option>
                              <option value="airliner">Pasajeros (Estable)</option>
                            </select>
                            <NumberField id="veh-lift" label="Sustentación" value={veh.liftFactor ?? 1.0} min={0.2} max={3} step={0.1} onChange={(liftFactor) => patchVeh({ liftFactor })} />
                          </div>
                        )}

                        {kind === 'spaceship' && (
                          <div className="space-y-1.5 rounded border border-purple-500/30 bg-purple-500/5 p-2">
                            <label className="flex items-center gap-1.5 text-[11px] text-purple-200 cursor-pointer">
                              <input
                                type="checkbox"
                                checked={Boolean(veh.localGravityBox?.enabled)}
                                onChange={(e) =>
                                  patchVeh({
                                    localGravityBox: {
                                      enabled: e.target.checked,
                                      sx: veh.localGravityBox?.sx ?? 5,
                                      sy: veh.localGravityBox?.sy ?? 2.2,
                                      sz: veh.localGravityBox?.sz ?? 10,
                                    },
                                  })
                                }
                                className="accent-purple-500"
                              />
                              <span>Gravedad Local Interior</span>
                            </label>
                            {veh.localGravityBox?.enabled && (
                              <div className="grid grid-cols-3 gap-1">
                                <NumberField id="lgb-x" label="Ancho" value={veh.localGravityBox.sx} min={1} max={40} onChange={(sx) => patchVeh({ localGravityBox: { ...veh.localGravityBox!, sx } })} />
                                <NumberField id="lgb-y" label="Alto" value={veh.localGravityBox.sy} min={1} max={20} onChange={(sy) => patchVeh({ localGravityBox: { ...veh.localGravityBox!, sy } })} />
                                <NumberField id="lgb-z" label="Largo" value={veh.localGravityBox.sz} min={1} max={60} onChange={(sz) => patchVeh({ localGravityBox: { ...veh.localGravityBox!, sz } })} />
                              </div>
                            )}
                          </div>
                        )}

                        <div className="space-y-1.5 rounded border border-[#2f323d] bg-[#141418] p-2">
                          <div className="grid grid-cols-2 gap-1.5 items-center">
                            <span className="text-[10px] font-medium text-zinc-300">Montura al subir (E)</span>
                            <select
                              aria-label="Estilo de montura del vehículo"
                              value={veh.mountStyle ?? (kind === 'moto' || kind === 'horse' ? 'saddle' : 'inside')}
                              onChange={(e) => patchVeh({ mountStyle: e.target.value as 'inside' | 'saddle' })}
                              className="rounded border border-[#32323c] bg-[#141416] px-1.5 py-1 text-[11px] text-zinc-100"
                            >
                              <option value="inside">Dentro / Cabina (ocultar)</option>
                              <option value="saddle">Encima / Silla (visible)</option>
                            </select>
                          </div>
                          {(veh.mountStyle === 'saddle' || (!veh.mountStyle && (kind === 'moto' || kind === 'horse'))) && (
                            <div className="grid grid-cols-3 gap-1">
                              <NumberField
                                id="veh-seat-x"
                                label="Asiento X"
                                value={veh.seatOffset?.x ?? 0}
                                min={-4}
                                max={4}
                                step={0.1}
                                onChange={(x) => patchVeh({ seatOffset: { x, y: veh.seatOffset?.y ?? (kind === 'horse' ? 0.92 : 0.78), z: veh.seatOffset?.z ?? -0.1 } })}
                              />
                              <NumberField
                                id="veh-seat-y"
                                label="Asiento Y"
                                value={veh.seatOffset?.y ?? (kind === 'horse' ? 0.92 : 0.78)}
                                min={-2}
                                max={5}
                                step={0.1}
                                onChange={(y) => patchVeh({ seatOffset: { x: veh.seatOffset?.x ?? 0, y, z: veh.seatOffset?.z ?? -0.1 } })}
                              />
                              <NumberField
                                id="veh-seat-z"
                                label="Asiento Z"
                                value={veh.seatOffset?.z ?? (kind === 'horse' ? -0.06 : -0.14)}
                                min={-5}
                                max={5}
                                step={0.1}
                                onChange={(z) => patchVeh({ seatOffset: { x: veh.seatOffset?.x ?? 0, y: veh.seatOffset?.y ?? (kind === 'horse' ? 0.92 : 0.78), z } })}
                              />
                            </div>
                          )}
                          <label className="flex items-center gap-1.5 text-[10px] text-zinc-300 cursor-pointer">
                            <input
                              type="checkbox"
                              checked={veh.allowQuickEnterExit !== false}
                              onChange={(e) => patchVeh({ allowQuickEnterExit: e.target.checked })}
                              className="accent-emerald-500"
                            />
                            <span>Subir / Bajar automático con Tecla E</span>
                          </label>
                        </div>

                        {(scene.splines3d?.length ?? 0) > 0 && (
                          <div>
                            <label className="block text-[10px] text-zinc-400 mb-0.5">
                              Ruta de Patrulla Automática (Spline 3D)
                            </label>
                            <select
                              aria-label="Ruta Spline de patrulla"
                              value={veh.patrolSplineId ?? ''}
                              onChange={(e) => patchVeh({ patrolSplineId: e.target.value || null })}
                              className="w-full rounded border border-[#32323c] bg-[#141416] px-2 py-1 text-[11px] text-zinc-100"
                            >
                              <option value="">Control manual (Sin piloto automático)</option>
                              {scene.splines3d!.map((sp) => (
                                <option key={sp.id} value={sp.id}>{sp.name} ({sp.points.length} pts)</option>
                              ))}
                            </select>
                          </div>
                        )}
                      </>
                    )}
                  </div>
                );
              })()}
            </InspectorSection>

            {(scene.splines3d?.length ?? 0) > 0 && (
              <InspectorSection title="Seguir Ruta Spline 3D" defaultOpen={Boolean(obj.followSplineId)}>
                <div className="grid grid-cols-2 gap-1.5">
                  <select
                    aria-label="Spline 3D a seguir"
                    value={obj.followSplineId ?? ''}
                    onChange={(e) =>
                      onUpdateObject(obj.id, (prev) => ({
                        ...prev,
                        followSplineId: e.target.value || null,
                      }))
                    }
                    className="rounded border border-[#32323c] bg-[#141416] px-1.5 py-1 text-[11px] text-zinc-100"
                  >
                    <option value="">Ninguna ruta</option>
                    {scene.splines3d!.map((sp) => (
                      <option key={sp.id} value={sp.id}>{sp.name}</option>
                    ))}
                  </select>
                  <NumberField
                    id="m3-spl-spd"
                    label="Velocidad"
                    value={obj.followSplineSpeed ?? 6}
                    min={0.5}
                    max={60}
                    step={0.5}
                    onChange={(followSplineSpeed) =>
                      onUpdateObject(obj.id, (prev) => ({ ...prev, followSplineSpeed }))
                    }
                  />
                </div>
              </InspectorSection>
            )}
          </>
        );
      })()}

      {obj.type === 'light_3d' && obj.light3d && (() => {
        const l3 = obj.light3d;
        const patchL3 = (patch: Partial<NonNullable<GameObjectData['light3d']>>) =>
          onUpdateObject(obj.id, (prev) => ({
            ...prev,
            light3d: { ...prev.light3d!, ...patch },
          }));
        return (
          <InspectorSection title="Luz 3D">
            <div className="grid grid-cols-2 gap-1.5 items-center">
              <select
                aria-label="Tipo luz 3D"
                value={l3.lightType}
                onChange={(e) => patchL3({ lightType: e.target.value as 'point' | 'spot' | 'directional' })}
                className="rounded border border-[#32323c] bg-[#141416] px-2 py-1 text-xs text-zinc-100"
              >
                <option value="point">Puntual (Point)</option>
                <option value="spot">Foco (Spot)</option>
                <option value="directional">Direccional</option>
              </select>
              <input
                type="color"
                aria-label="Color luz 3D"
                value={l3.color}
                onChange={(e) => patchL3({ color: e.target.value })}
                className="h-7 w-full cursor-pointer rounded border border-[#32323c] bg-[#141416] p-0.5"
              />
            </div>
            <div className="grid grid-cols-2 gap-1.5">
              <NumberField id="l3-int" label="Intensidad" value={l3.intensity} min={0} max={1000} step={0.25} onChange={(intensity) => patchL3({ intensity })} />
              <NumberField id="l3-dist" label="Alcance" value={l3.distance} min={1} max={5000} onChange={(distance) => patchL3({ distance })} />
              <NumberField id="l3-decay" label="Atenuación" value={l3.decay} min={0} max={3} step={0.1} onChange={(decay) => patchL3({ decay })} />
              {l3.lightType === 'spot' && (
                <NumberField id="l3-ang" label="Ángulo °" value={l3.angleDeg} min={5} max={85} onChange={(angleDeg) => patchL3({ angleDeg })} />
              )}
            </div>
            <label className="flex items-center gap-2 text-xs text-zinc-300 cursor-pointer">
              <input
                type="checkbox"
                checked={l3.castShadow}
                onChange={(e) => patchL3({ castShadow: e.target.checked })}
                className="accent-blue-500"
              />
              <span>Proyectar sombras reales</span>
            </label>
            {(l3.lightType === 'spot' || l3.lightType === 'directional') && (
              <p className="rounded border border-amber-500/25 bg-amber-500/10 px-2 py-1.5 text-[10px] text-amber-200/90 leading-relaxed">
                Usa el gizmo <strong>Rotar (E)</strong> en el visor 3D o los valores <strong>Rotación RX / RY / RZ</strong> para apuntar la dirección del haz de luz.
              </p>
            )}
          </InspectorSection>
        );
      })()}

      {obj.type === 'camera_3d' && obj.camera3d && (() => {
        const c3 = obj.camera3d;
        const patchC3 = (patch: Partial<NonNullable<GameObjectData['camera3d']>>) =>
          onUpdateObject(obj.id, (prev) => ({
            ...prev,
            camera3d: { ...prev.camera3d!, ...patch },
          }));
        return (
          <InspectorSection title="Cámara Inteligente 3D">
            <label className="flex items-center gap-2 text-xs text-emerald-300 cursor-pointer">
              <input
                type="checkbox"
                checked={c3.isMainCamera}
                onChange={(e) => patchC3({ isMainCamera: e.target.checked })}
                className="accent-emerald-500"
              />
              <span>Cámara principal al iniciar</span>
            </label>

            <select
              aria-label="Modo de cámara inteligente"
              value={c3.mode}
              onChange={(e) => patchC3({ mode: e.target.value as SmartCameraMode })}
              className="w-full rounded border border-[#32323c] bg-[#141416] px-2 py-1 text-xs text-zinc-100"
            >
              <option value="smooth_follow">Seguimiento suave + Look-ahead</option>
              <option value="third_person_orbit">Órbita 3ª persona (Anti-muros)</option>
              <option value="first_person">Primera Persona (FPS)</option>
              <option value="top_down">Cenital / Isométrica (Top-Down)</option>
              <option value="deadzone">Zona muerta (Deadzone)</option>
              <option value="fixed">Cámara fija</option>
            </select>

            <select
              aria-label="Objetivo de cámara"
              value={c3.targetObjectId ?? ''}
              onChange={(e) => patchC3({ targetObjectId: e.target.value || null })}
              className="w-full rounded border border-[#32323c] bg-[#141416] px-2 py-1 text-xs text-zinc-100"
            >
              <option value="">Seguir al Jugador automáticamente</option>
              {scene.objects.filter((o) => o.id !== obj.id).map((o) => (
                <option key={o.id} value={o.id}>{o.name}</option>
              ))}
            </select>

            <div className="grid grid-cols-2 gap-1.5">
              <NumberField id="c3-damp" label="Suavizado" value={c3.dampingFactor} min={0.02} max={1} step={0.02} onChange={(dampingFactor) => patchC3({ dampingFactor })} />
              <NumberField id="c3-look" label="Anticipación" value={c3.lookAhead} min={0} max={8} step={0.2} onChange={(lookAhead) => patchC3({ lookAhead })} />
              <NumberField id="c3-dist" label="Distancia" value={c3.distance} min={1} max={60} step={0.5} onChange={(distance) => patchC3({ distance })} />
              <NumberField id="c3-fov" label="FOV °" value={c3.fov} min={25} max={110} onChange={(fov) => patchC3({ fov })} />
              <NumberField id="c3-oy" label="Altura Y" value={c3.offsetY} min={0} max={35} step={0.5} onChange={(offsetY) => patchC3({ offsetY })} />
              <NumberField id="c3-oz" label="Prof. Z" value={c3.offsetZ} min={1} max={45} step={0.5} onChange={(offsetZ) => patchC3({ offsetZ })} />
              <NumberField id="c3-shx" label="Hombro X" value={c3.shoulderOffsetX ?? 0} min={-4} max={4} step={0.1} onChange={(shoulderOffsetX) => patchC3({ shoulderOffsetX })} />
              <NumberField id="c3-shy" label="Hombro Y" value={c3.shoulderOffsetY ?? 0} min={-2} max={4} step={0.1} onChange={(shoulderOffsetY) => patchC3({ shoulderOffsetY })} />
              <NumberField id="c3-fkick" label="Sprint FOV +" value={c3.fovKick ?? 0} min={0} max={25} step={1} onChange={(fovKick) => patchC3({ fovKick })} />
            </div>

            <div className="grid grid-cols-2 gap-1.5 text-xs text-zinc-300">
              <label className="flex items-center gap-1.5 cursor-pointer" title="Evita que la cámara traspase paredes y edificios">
                <input
                  type="checkbox"
                  checked={c3.collideWithWalls}
                  onChange={(e) => patchC3({ collideWithWalls: e.target.checked })}
                  className="accent-sky-500"
                />
                <span>Evitar muros (Anti-traspaso)</span>
              </label>
              <label className="flex items-center gap-1.5 cursor-pointer">
                <input
                  type="checkbox"
                  checked={c3.useBounds}
                  onChange={(e) => patchC3({ useBounds: e.target.checked })}
                  className="accent-sky-500"
                />
                <span>Límites de zona</span>
              </label>
              <label className="col-span-2 flex items-center gap-1.5 cursor-pointer">
                <input
                  type="checkbox"
                  checked={Boolean(c3.invertY)}
                  onChange={(e) => patchC3({ invertY: e.target.checked })}
                  className="accent-sky-500"
                />
                <span>Invertir eje Y del ratón (estilo clásico)</span>
              </label>
            </div>

            {(scene.splines3d?.length ?? 0) > 0 && (
              <div className="grid grid-cols-2 gap-1.5 pt-1 border-t border-[#2c2c36]">
                <select
                  aria-label="Riel Spline 3D de cámara"
                  value={obj.followSplineId ?? ''}
                  onChange={(e) =>
                    onUpdateObject(obj.id, (prev) => ({
                      ...prev,
                      followSplineId: e.target.value || null,
                    }))
                  }
                  className="rounded border border-[#32323c] bg-[#141416] px-1.5 py-1 text-[11px] text-zinc-100"
                >
                  <option value="">Sin riel Spline</option>
                  {scene.splines3d!.map((sp) => (
                    <option key={sp.id} value={sp.id}>{sp.name}</option>
                  ))}
                </select>
                <NumberField
                  id="cam-spl-spd"
                  label="Vel. Riel"
                  value={obj.followSplineSpeed ?? 5}
                  min={0.5}
                  max={50}
                  step={0.5}
                  onChange={(followSplineSpeed) =>
                    onUpdateObject(obj.id, (prev) => ({ ...prev, followSplineSpeed }))
                  }
                />
              </div>
            )}
          </InspectorSection>
        );
      })()}

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
              <div className="text-[11px] text-zinc-400">Herramienta de Pincel</div>
              <div className="grid grid-cols-4 gap-1">
                {(
                  [
                    ['single', 'Único'],
                    ['rect', 'Rectángulo'],
                    ['bucket', 'Cubo'],
                    ['autotile', 'Autotile'],
                  ] as Array<[TileBrushMode, string]>
                ).map(([mId, mLabel]) => {
                  const activeMode = (tm.brushMode ?? (tm.autotileEnabled ? 'autotile' : 'single')) === mId;
                  return (
                    <button
                      key={mId}
                      type="button"
                      onClick={() =>
                        patchTilemap({
                          brushMode: mId,
                          autotileEnabled: mId === 'autotile' ? true : tm.autotileEnabled,
                        })
                      }
                      className={`rounded border px-1.5 py-1 text-[10px] font-semibold ${
                        activeMode
                          ? 'border-blue-400 bg-blue-600/30 text-blue-200'
                          : 'border-[#32323c] bg-[#18181f] text-zinc-300 hover:bg-[#24242d]'
                      }`}
                    >
                      {mLabel}
                    </button>
                  );
                })}
              </div>

              <div className="grid grid-cols-2 gap-1.5 items-center">
                <label className="flex items-center gap-1.5 text-[11px] text-zinc-300 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={Boolean(tm.autotileEnabled)}
                    onChange={(e) =>
                      patchTilemap({
                        autotileEnabled: e.target.checked,
                        brushMode: e.target.checked ? 'autotile' : 'single',
                      })
                    }
                    className="accent-blue-500"
                  />
                  <span>Autotile 4-bit</span>
                </label>
                <NumberField
                  id="insp-tm-atbase"
                  label="Base"
                  value={tm.autotileBaseTile ?? 0}
                  min={0}
                  max={64}
                  onChange={(autotileBaseTile) =>
                    patchTilemap({ autotileBaseTile: Math.max(0, Math.round(autotileBaseTile)) })
                  }
                />
              </div>
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
                  const tMeta = tm.tileTypes?.[String(idx)];
                  const colKind = tMeta?.collision ?? 'solid';

                  return (
                    <button
                      key={idx}
                      type="button"
                      onClick={() => patchTilemap({ selectedTileIndex: idx })}
                      title={`Seleccionar tile #${idx + 1} (${colKind})`}
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
                      {colKind !== 'solid' && (
                        <span
                          className={`absolute top-0.5 left-0.5 rounded px-1 text-[8px] font-bold ${
                            colKind === 'one_way'
                              ? 'bg-cyan-600/90 text-white'
                              : colKind === 'damage'
                                ? 'bg-red-600/90 text-white'
                                : 'bg-zinc-700/90 text-zinc-200'
                          }`}
                        >
                          {colKind === 'one_way' ? '1W' : colKind === 'damage' ? 'DMG' : 'DEC'}
                        </span>
                      )}
                      <span className="absolute right-0.5 bottom-0.5 rounded bg-black/70 px-1 font-mono text-[9px] text-zinc-200">
                        {idx + 1}
                      </span>
                    </button>
                  );
                })}
              </div>

              {/* Tipo de colisión para el tile seleccionado */}
              {(() => {
                const curIdxKey = String(tm.selectedTileIndex ?? 0);
                const curMeta = tm.tileTypes?.[curIdxKey] ?? { collision: 'solid' as TileCollisionKind, damagePerSec: 20 };
                return (
                  <div className="space-y-1.5 rounded border border-[#2c2c34] bg-[#16161c] p-2">
                    <div className="flex items-center justify-between text-[10.5px] text-zinc-300">
                      <span>Colisión del Tile #{(tm.selectedTileIndex ?? 0) + 1}</span>
                    </div>
                    <select
                      aria-label="Tipo de colisión del tile seleccionado"
                      value={curMeta.collision}
                      onChange={(e) =>
                        patchTilemap({
                          tileTypes: {
                            ...(tm.tileTypes ?? {}),
                            [curIdxKey]: {
                              ...curMeta,
                              collision: e.target.value as TileCollisionKind,
                            },
                          },
                        })
                      }
                      className="w-full rounded border border-[#32323c] bg-[#101014] px-2 py-1 text-xs text-zinc-100"
                    >
                      <option value="solid">Sólido (Bloquea en 4 direcciones)</option>
                      <option value="none">Decorado (Sin colisión)</option>
                      <option value="one_way">Plataforma 1 sentido (One-Way)</option>
                      <option value="damage">Daño / Lava (Resta HP al jugador)</option>
                    </select>
                    {curMeta.collision === 'damage' && (
                      <NumberField
                        id="insp-tm-dps"
                        label="Daño/s"
                        value={curMeta.damagePerSec ?? 20}
                        min={1}
                        max={500}
                        onChange={(damagePerSec) =>
                          patchTilemap({
                            tileTypes: {
                              ...(tm.tileTypes ?? {}),
                              [curIdxKey]: { ...curMeta, damagePerSec },
                            },
                          })
                        }
                      />
                    )}
                  </div>
                );
              })()}
            </div>
          </InspectorSection>
        );
      })()}

      {/* Colisionadores (Hitbox) y Cuerpo Rígido */}
      <InspectorSection
        title={`Colisionadores 2D (${obj.colliders?.length ?? 0})`}
        defaultOpen={(obj.colliders?.length ?? 0) > 0}
      >
        <div className="grid grid-cols-2 gap-1.5">
          <button
            type="button"
            onClick={() => {
              const newCol = createDefaultColliderForObject(obj, false);
              onUpdateObject(obj.id, (prev) => ({
                ...prev,
                colliders: [...(prev.colliders ?? []), newCol],
              }));
            }}
            className="rounded border border-[#32323c] bg-[#222228] px-2 py-1 text-[11px] font-medium text-zinc-200 hover:bg-[#2c2c34]"
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
            className="rounded border border-amber-500/40 bg-amber-500/10 px-2 py-1 text-[11px] font-medium text-amber-300 hover:bg-amber-500/20"
          >
            + Sensor / Trigger
          </button>
        </div>

        {obj.type === 'sprite' && (
          <button
            type="button"
            onClick={async () => {
              const newCol = createDefaultColliderForObject(obj, false);
              newCol.shape = 'smart_alpha';
              newCol.alphaThreshold = 32;
              const blob = obj.sprite?.assetId ? assetBlobs?.get(obj.sprite.assetId) : undefined;
              if (blob) {
                try {
                  newCol.smartRects = await computeSmartColliderRectsFromBlob(blob, {
                    alphaThreshold: 32,
                    cropRect: obj.sprite?.cropRect,
                    animCols: obj.sprite?.animation?.cols,
                    animRows: obj.sprite?.animation?.rows,
                  });
                } catch {
                  // Fallback to normalized single rect on decode error
                }
              }
              onUpdateObject(obj.id, (prev) => ({
                ...prev,
                colliders: [...(prev.colliders ?? []), newCol],
              }));
            }}
            className="w-full rounded border border-cyan-500/40 bg-cyan-500/10 px-2 py-1 text-[11px] font-medium text-cyan-300 hover:bg-cyan-500/20"
          >
            + Silueta PNG Inteligente (Sin transparencia)
          </button>
        )}

        {(obj.colliders ?? []).length === 0 ? (
          <p className="text-[11px] text-zinc-500 leading-relaxed">
            Usa collider automático ajustado al tamaño visual. Añade un collider manual, usa <strong>Silueta PNG Inteligente</strong> o activa <strong>Colisiones</strong> en el lienzo para arrastrar los tiradores de zona.
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

              const recomputeSmartRects = async (threshold = col.alphaThreshold ?? 32) => {
                const blob = obj.sprite?.assetId ? assetBlobs?.get(obj.sprite.assetId) : undefined;
                if (!blob) return;
                try {
                  const rects = await computeSmartColliderRectsFromBlob(blob, {
                    alphaThreshold: threshold,
                    cropRect: obj.sprite?.cropRect,
                    animCols: obj.sprite?.animation?.cols,
                    animRows: obj.sprite?.animation?.rows,
                  });
                  updateCol({ smartRects: rects, alphaThreshold: threshold });
                } catch {
                  // Ignore decode failure gracefully
                }
              };

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
                      onChange={async (e) => {
                        const nextShape = e.target.value as Collider2D['shape'];
                        if (nextShape === 'smart_alpha') {
                          const blob = obj.sprite?.assetId
                            ? assetBlobs?.get(obj.sprite.assetId)
                            : undefined;
                          let smartRects = col.smartRects;
                          if (blob && (!smartRects || smartRects.length === 0)) {
                            try {
                              smartRects = await computeSmartColliderRectsFromBlob(blob, {
                                alphaThreshold: col.alphaThreshold ?? 32,
                                cropRect: obj.sprite?.cropRect,
                                animCols: obj.sprite?.animation?.cols,
                                animRows: obj.sprite?.animation?.rows,
                              });
                            } catch {
                              // Keep existing rects
                            }
                          }
                          updateCol({
                            shape: nextShape,
                            alphaThreshold: col.alphaThreshold ?? 32,
                            smartRects,
                          });
                        } else {
                          updateCol({ shape: nextShape });
                        }
                      }}
                      className="rounded border border-[#32323c] bg-[#141416] px-1.5 py-1 text-[11px] text-zinc-100"
                    >
                      <option value="box">Caja (Box)</option>
                      <option value="circle">Círculo</option>
                      <option value="capsule">Cápsula</option>
                      <option value="smart_alpha">Silueta PNG Inteligente</option>
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

                  {col.shape === 'smart_alpha' && (
                    <div className="space-y-1.5 rounded border border-cyan-500/25 bg-cyan-500/5 p-1.5">
                      <div className="flex items-center justify-between text-[10px] text-cyan-200">
                        <span>Subcajas ajustadas a opacidad</span>
                        <span className="font-mono font-semibold">
                          {col.smartRects?.length ?? 0} piezas
                        </span>
                      </div>
                      <NumberField
                        id={`col-alpha-${col.id}`}
                        label="Umbral alfa"
                        value={col.alphaThreshold ?? 32}
                        min={1}
                        max={254}
                        step={5}
                        onChange={(val) => {
                          const alphaThreshold = Math.round(clamp(val, 1, 254));
                          updateCol({ alphaThreshold });
                          void recomputeSmartRects(alphaThreshold);
                        }}
                      />
                      <button
                        type="button"
                        disabled={!obj.sprite?.assetId}
                        onClick={() => void recomputeSmartRects(col.alphaThreshold ?? 32)}
                        className="w-full rounded border border-cyan-500/40 bg-cyan-600/20 px-2 py-1 text-[10px] font-medium text-cyan-200 hover:bg-cyan-600/30 disabled:opacity-40"
                      >
                        Recalcular silueta PNG
                      </button>
                    </div>
                  )}

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

      {/* Arquetipos Inteligentes y Auto-Cableado */}
      <InspectorSection title="Arquetipo Inteligente / Auto-Cableado" defaultOpen={Boolean(obj.archetype)}>
        <div className="space-y-2">
          <div className="flex items-center justify-between text-[11px]">
            <span className="text-zinc-400">Rol / Arquetipo actual</span>
            <span className="rounded bg-indigo-500/20 px-1.5 py-0.5 font-mono text-[10px] text-indigo-300">
              {obj.archetype ? `${obj.archetype} (${obj.role ?? 'generic'})` : obj.role ?? 'manual'}
            </span>
          </div>

          <div className="flex items-center gap-1.5">
            <select
              aria-label="Seleccionar arquetipo inteligente"
              value={selectedArchetype}
              onChange={(e) => setSelectedArchetype(e.target.value as ArchetypeId)}
              className="min-w-0 flex-1 rounded border border-[#32323c] bg-[#141416] px-2 py-1 text-xs text-zinc-100 focus:border-indigo-500 focus:outline-none"
            >
              {ARCHETYPE_RECIPES.map((rec) => (
                <option key={rec.id} value={rec.id}>
                  {rec.label}
                </option>
              ))}
            </select>
            <button
              type="button"
              onClick={() => {
                onUpdateScene((s) => {
                  const res = applyArchetypeToScene(s, obj.id, selectedArchetype, projectMode);
                  setArchetypeNotice(
                    `+${res.addedBehaviors.length} comportamientos · ${res.createdLinks.length} cables nuevos`
                  );
                  return {
                    ...s,
                    objects: res.objects,
                    wiringLinks: res.wiringLinks,
                  };
                });
              }}
              className="inline-flex shrink-0 items-center gap-1 rounded bg-indigo-600 px-2.5 py-1 text-xs font-medium text-white hover:bg-indigo-500 whitespace-nowrap"
            >
              <Link2 className="h-3.5 w-3.5" />
              <span>Aplicar Arquetipo</span>
            </button>
          </div>

          {(() => {
            const rec = ARCHETYPE_RECIPES.find((r) => r.id === selectedArchetype);
            return rec ? (
              <p className="text-[10px] leading-snug text-zinc-400">{rec.description}</p>
            ) : null;
          })()}

          {archetypeNotice && (
            <div className="rounded border border-emerald-500/40 bg-emerald-950/30 px-2 py-1 text-[10px] text-emerald-300">
              {archetypeNotice}
            </div>
          )}
        </div>
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
                const bType = selectedBehaviorEntry.type;
                onUpdateObject(obj.id, (prev) => {
                  const needsDynamic3d =
                    prev.type === 'mesh_3d' &&
                    !prev.parentId &&
                    (bType === 'player_3d' ||
                      bType === 'player_platformer' ||
                      bType === 'player_topdown' ||
                      bType === 'movement.platformer_pro' ||
                      bType === 'movement.topdown_8dir' ||
                      bType === 'chase_player' ||
                      bType === 'ai.enemy_chaser');
                  return {
                    ...prev,
                    ...(needsDynamic3d
                      ? {
                          physics3d: {
                            enabled: true,
                            bodyType: 'dynamic' as const,
                            shape:
                              bType === 'player_3d'
                                ? ('capsule' as const)
                                : prev.physics3d?.shape ?? ('box' as const),
                            mass: prev.physics3d?.mass ?? 1,
                            gravityScale: prev.physics3d?.gravityScale ?? 1,
                            restitution: prev.physics3d?.restitution ?? 0.1,
                            friction: prev.physics3d?.friction ?? 0.6,
                          },
                        }
                      : {}),
                    components: [
                      ...prev.components,
                      {
                        id: createId('comp'),
                        type: bType,
                        enabled: true,
                        config: { ...selectedBehaviorEntry.defaultConfig },
                      },
                    ],
                  };
                });
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

                  {(() => {
                    const compContexts = comp.contexts ?? registryEntry?.contexts ?? ['gameplay'];
                    const compInputs = comp.inputs ?? registryEntry?.inputs ?? [];
                    const compOutputs = comp.outputs ?? registryEntry?.outputs ?? [];
                    const sourceLabel = comp.source ?? 'manual';
                    const sceneLinks = scene.wiringLinks ?? [];
                    const compOutLinks = sceneLinks.filter(
                      (l) => l.sourceObjectId === obj.id && l.sourceBehavior === comp.type
                    );
                    const compInLinks = sceneLinks.filter(
                      (l) => l.targetObjectId === obj.id && l.targetBehavior === comp.type
                    );
                    return (
                      <div className="space-y-1 border-b border-[#25252d] pb-1.5 text-[10px]">
                        <div className="flex flex-wrap items-center gap-1">
                          <span className="rounded bg-[#22222b] px-1.5 py-0.5 font-mono text-zinc-300">
                            Origen: {sourceLabel}
                          </span>
                          {compContexts.map((ctx) => (
                            <span
                              key={ctx}
                              className="rounded bg-emerald-500/15 px-1.5 py-0.5 text-emerald-300"
                            >
                              {ctx}
                            </span>
                          ))}
                        </div>
                        {(compInputs.length > 0 || compOutputs.length > 0) && (
                          <div className="flex flex-wrap gap-2 text-[9.5px] text-zinc-400">
                            {compInputs.length > 0 && (
                              <span>Entradas: {compInputs.join(', ')}</span>
                            )}
                            {compOutputs.length > 0 && (
                              <span>Salidas: {compOutputs.join(', ')}</span>
                            )}
                          </div>
                        )}
                        {(compOutLinks.length > 0 || compInLinks.length > 0) && (
                          <div className="space-y-0.5 pt-0.5">
                            {compOutLinks.map((lnk) => {
                              const tgtObj = scene.objects.find((o) => o.id === lnk.targetObjectId);
                              return (
                                <div
                                  key={lnk.id}
                                  className="flex items-center justify-between gap-1 rounded bg-indigo-950/40 px-1.5 py-0.5 text-[9.5px] text-indigo-200"
                                >
                                  <span className="truncate">
                                    → {lnk.signal} ➔ {tgtObj?.name ?? lnk.targetObjectId}.{lnk.targetBehavior}.{lnk.action}
                                  </span>
                                  <button
                                    type="button"
                                    onClick={() =>
                                      onUpdateScene((s) => ({
                                        ...s,
                                        wiringLinks: (s.wiringLinks ?? []).filter((w) => w.id !== lnk.id),
                                      }))
                                    }
                                    title="Desconectar cable"
                                    className="text-zinc-400 hover:text-red-400 px-1 font-bold"
                                  >
                                    ×
                                  </button>
                                </div>
                              );
                            })}
                            {compInLinks.map((lnk) => {
                              const srcObj = scene.objects.find((o) => o.id === lnk.sourceObjectId);
                              return (
                                <div
                                  key={lnk.id}
                                  className="flex items-center justify-between gap-1 rounded bg-sky-950/40 px-1.5 py-0.5 text-[9.5px] text-sky-200"
                                >
                                  <span className="truncate">
                                    ← {srcObj?.name ?? lnk.sourceObjectId}.{lnk.sourceBehavior}.{lnk.signal} ➔ {lnk.action}
                                  </span>
                                  <button
                                    type="button"
                                    onClick={() =>
                                      onUpdateScene((s) => ({
                                        ...s,
                                        wiringLinks: (s.wiringLinks ?? []).filter((w) => w.id !== lnk.id),
                                      }))
                                    }
                                    title="Desconectar cable"
                                    className="text-zinc-400 hover:text-red-400 px-1 font-bold"
                                  >
                                    ×
                                  </button>
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    );
                  })()}

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

      {/* Optimización Masiva (Frustum Culling, LOD y Distance Fade) */}
      {(obj.type === 'sprite' ||
        obj.type === 'tilemap' ||
        obj.type === 'mesh_3d' ||
        obj.type === 'rectangle' ||
        obj.type === 'circle') && (() => {
        const opt: ObjectOptimizationConfig = obj.optimization ?? {
          preset: 'custom',
          frustumCulling: true,
          lodEnabled: false,
          lodDistance: 32,
          fadeEnabled: false,
          fadeStart: projectMode === '3d' ? 25 : 420,
          fadeEnd: projectMode === '3d' ? 55 : 720,
        };
        const patchOpt = (patch: Partial<ObjectOptimizationConfig>) =>
          onUpdateObject(obj.id, (prev) => ({
            ...prev,
            optimization: { ...opt, ...patch },
          }));

        return (
          <InspectorSection title="Optimización Masiva (Frustum / LOD / Fade)" defaultOpen={false}>
            <div className="flex items-center gap-1">
              <Gauge className="h-3.5 w-3.5 text-emerald-400 shrink-0" />
              <select
                aria-label="Perfil de optimización"
                value={opt.preset ?? 'custom'}
                onChange={(e) => {
                  const preset = e.target.value as 'mobile' | 'pc' | 'custom';
                  if (preset === 'mobile') {
                    patchOpt({
                      preset,
                      frustumCulling: true,
                      lodEnabled: true,
                      lodDistance: projectMode === '3d' ? 22 : 380,
                      fadeEnabled: true,
                      fadeStart: projectMode === '3d' ? 20 : 380,
                      fadeEnd: projectMode === '3d' ? 42 : 620,
                    });
                  } else if (preset === 'pc') {
                    patchOpt({
                      preset,
                      frustumCulling: true,
                      lodEnabled: false,
                      lodDistance: projectMode === '3d' ? 60 : 900,
                      fadeEnabled: false,
                      fadeStart: projectMode === '3d' ? 50 : 750,
                      fadeEnd: projectMode === '3d' ? 95 : 1100,
                    });
                  } else {
                    patchOpt({ preset });
                  }
                }}
                className="w-full rounded border border-[#32323c] bg-[#141416] px-2 py-1 text-xs text-zinc-100"
              >
                <option value="mobile">Perfil: Móvil (Máximo FPS)</option>
                <option value="pc">Perfil: PC / Escritorio</option>
                <option value="custom">Perfil: Personalizado</option>
              </select>
            </div>

            <label className="flex items-center gap-2 text-xs text-zinc-300 cursor-pointer">
              <input
                type="checkbox"
                checked={opt.frustumCulling !== false}
                onChange={(e) => patchOpt({ preset: 'custom', frustumCulling: e.target.checked })}
                className="accent-emerald-500"
              />
              <span>Frustum Culling (ocultar fuera de cámara)</span>
            </label>

            {projectMode === '3d' && (
              <>
                <label className="flex items-center gap-2 text-xs text-zinc-300 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={Boolean(opt.lodEnabled)}
                    onChange={(e) => patchOpt({ preset: 'custom', lodEnabled: e.target.checked })}
                    className="accent-emerald-500"
                  />
                  <span>Activar LOD por distancia</span>
                </label>
                {opt.lodEnabled && (
                  <div className="space-y-1.5">
                    <NumberField
                      id={`opt-lod-${obj.id}`}
                      label="Dist. LOD (m)"
                      value={opt.lodDistance ?? 32}
                      min={2}
                      max={1000}
                      onChange={(lodDistance) => patchOpt({ preset: 'custom', lodDistance })}
                    />
                    <div>
                      <label htmlFor={`opt-lod-asset-${obj.id}`} className="mb-0.5 block text-[10px] text-zinc-400">
                        Malla LOD lejana (opcional)
                      </label>
                      <select
                        id={`opt-lod-asset-${obj.id}`}
                        value={opt.lodAssetId ?? ''}
                        onChange={(e) => patchOpt({ preset: 'custom', lodAssetId: e.target.value || null })}
                        className="w-full rounded border border-[#32323c] bg-[#141416] px-2 py-1 text-[11px] text-zinc-100"
                      >
                        <option value="">(Caja simple automática)</option>
                        {model3dAssets.map((a) => (
                          <option key={a.id} value={a.id}>
                            {a.name} ({a.format.toUpperCase()})
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>
                )}
              </>
            )}

            <label className="flex items-center gap-2 text-xs text-zinc-300 cursor-pointer">
              <input
                type="checkbox"
                checked={Boolean(opt.fadeEnabled)}
                onChange={(e) => patchOpt({ preset: 'custom', fadeEnabled: e.target.checked })}
                className="accent-sky-500"
              />
              <span>Desvanecimiento por distancia (Distance Fade)</span>
            </label>

            {opt.fadeEnabled && (
              <div className="grid grid-cols-2 gap-1.5">
                <NumberField
                  id={`opt-fs-${obj.id}`}
                  label="Inicio fade"
                  value={opt.fadeStart ?? (projectMode === '3d' ? 25 : 420)}
                  min={1}
                  max={2000}
                  onChange={(fadeStart) => patchOpt({ preset: 'custom', fadeStart })}
                />
                <NumberField
                  id={`opt-fe-${obj.id}`}
                  label="Fin (Ocultar)"
                  value={opt.fadeEnd ?? (projectMode === '3d' ? 55 : 720)}
                  min={2}
                  max={2500}
                  onChange={(fadeEnd) => patchOpt({ preset: 'custom', fadeEnd })}
                />
              </div>
            )}
          </InspectorSection>
        );
      })()}

      {/* Scripts JS del Objeto con parámetros @param editables */}
      <InspectorSection
        title={`Scripts JS del Objeto (${obj.scriptBindings?.length ?? 0})`}
        defaultOpen={(obj.scriptBindings?.length ?? 0) > 0}
      >
        <div className="flex items-center gap-1.5">
          <select
            aria-label="Seleccionar script JS para el objeto"
            value={resolvedObjScriptId}
            onChange={(e) => setScriptToAdd(e.target.value)}
            className="min-w-0 flex-1 rounded border border-[#32323c] bg-[#141416] px-2 py-1 text-xs text-zinc-100"
          >
            {codeScripts.length === 0 ? (
              <option value="">Crea un script en Código e Interfaces...</option>
            ) : (
              codeScripts.map((sc) => (
                <option key={sc.id} value={sc.id}>
                  {sc.name}
                </option>
              ))
            )}
          </select>
          <button
            type="button"
            disabled={codeScripts.length === 0}
            onClick={() => {
              const targetId = resolvedObjScriptId;
              if (!targetId) return;
              const scriptAsset = codeScripts.find((c) => c.id === targetId);
              const schema = scriptAsset ? extractScriptParamsSchema(scriptAsset) : [];
              const defaultParams: Record<string, unknown> = {};
              for (const field of schema) defaultParams[field.key] = field.defaultValue;
              const binding: ObjectScriptBinding = {
                id: createId('sb'),
                scriptId: targetId,
                enabled: true,
                params: defaultParams,
              };
              onUpdateObject(obj.id, (prev) => ({
                ...prev,
                scriptBindings: [...(prev.scriptBindings ?? []), binding],
              }));
            }}
            className="inline-flex shrink-0 items-center gap-1 rounded bg-sky-600 px-2.5 py-1 text-xs font-medium text-white hover:bg-sky-500 disabled:opacity-40 whitespace-nowrap"
          >
            <Code2 className="h-3.5 w-3.5" />
            <span>Adjuntar</span>
          </button>
        </div>

        {(obj.scriptBindings ?? []).length === 0 ? (
          <p className="text-[11px] text-zinc-500 leading-relaxed">
            Adjunta scripts JS personalizados (<code>onStart</code>, <code>onUpdate</code>, <code>onCollisionEnter</code>) con parámetros configurables aquí.
          </p>
        ) : (
          <div className="space-y-2">
            {(obj.scriptBindings ?? []).map((binding) => {
              const sc = codeScripts.find((c) => c.id === binding.scriptId);
              const syn = sc ? validateScriptSyntax(sc.code) : { valid: false, error: 'Script no encontrado' };
              const schema = sc ? extractScriptParamsSchema(sc) : [];
              const patchBinding = (patch: Partial<ObjectScriptBinding>) =>
                onUpdateObject(obj.id, (prev) => ({
                  ...prev,
                  scriptBindings: (prev.scriptBindings ?? []).map((b) =>
                    b.id === binding.id ? { ...b, ...patch } : b
                  ),
                }));

              return (
                <div
                  key={binding.id}
                  className="rounded border border-[#2f2f38] bg-[#151519] p-2 space-y-2"
                >
                  <div className="flex items-center justify-between gap-2">
                    <label className="flex min-w-0 items-center gap-1.5 text-xs font-medium text-sky-300 cursor-pointer truncate">
                      <input
                        type="checkbox"
                        checked={binding.enabled}
                        onChange={(e) => patchBinding({ enabled: e.target.checked })}
                        className="accent-sky-500"
                      />
                      <span className="truncate font-mono">{sc?.name ?? binding.scriptId}</span>
                      {!syn.valid && (
                        <span
                          title={syn.error}
                          className="rounded bg-red-500/20 px-1 py-0.5 text-[9px] font-semibold text-red-300 shrink-0"
                        >
                          Error
                        </span>
                      )}
                    </label>
                    <button
                      type="button"
                      onClick={() =>
                        onUpdateObject(obj.id, (prev) => ({
                          ...prev,
                          scriptBindings: (prev.scriptBindings ?? []).filter(
                            (b) => b.id !== binding.id
                          ),
                        }))
                      }
                      aria-label="Quitar script del objeto"
                      className="rounded p-1 text-zinc-500 hover:bg-[#2a2a33] hover:text-red-400"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>

                  {schema.length > 0 && (
                    <div className="space-y-1.5">
                      {schema.map((param) => {
                        const val = binding.params?.[param.key] ?? param.defaultValue;
                        if (param.type === 'boolean') {
                          return (
                            <label
                              key={param.key}
                              className="flex items-center gap-2 text-xs text-zinc-300 cursor-pointer"
                            >
                              <input
                                type="checkbox"
                                checked={Boolean(val)}
                                onChange={(e) =>
                                  patchBinding({
                                    params: { ...(binding.params ?? {}), [param.key]: e.target.checked },
                                  })
                                }
                                className="accent-emerald-500"
                              />
                              <span>{param.key}</span>
                            </label>
                          );
                        }
                        if (param.type === 'number') {
                          return (
                            <NumberField
                              key={param.key}
                              id={`sb-${binding.id}-${param.key}`}
                              label={param.key}
                              value={Number(val ?? 0)}
                              step={0.1}
                              onChange={(num) =>
                                patchBinding({
                                  params: { ...(binding.params ?? {}), [param.key]: num },
                                })
                              }
                            />
                          );
                        }
                        return (
                          <div key={param.key} className="space-y-0.5">
                            <label className="block text-[10px] text-zinc-400">{param.key}</label>
                            <input
                              type="text"
                              value={String(val ?? '')}
                              onChange={(e) =>
                                patchBinding({
                                  params: { ...(binding.params ?? {}), [param.key]: e.target.value },
                                })
                              }
                              className="w-full rounded border border-[#32323c] bg-[#141416] px-2 py-1 text-xs text-zinc-100"
                            />
                          </div>
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
