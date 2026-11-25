import React, { useMemo, useState } from 'react';
import {
  Camera,
  EyeOff,
  HardDrive,
  Layers,
  Plus,
  Save,
  Trash2,
} from 'lucide-react';
import type {
  CameraVolume3D,
  MemoryBudgetProfile,
  OcclusionVolume3D,
  ProjectSaveSlot,
  SceneData,
  SmartCameraConfig,
  WorldStreamingConfig,
} from '../../engine/core/types';
import type { ProjectAssetMeta } from '../../project/models/project';
import {
  buildStreamingProfilerReport,
  createStreamingControllerState,
  DEFAULT_WORLD_STREAMING_CONFIG,
  partitionSceneIntoChunks,
  resolveActivityLevel,
  resolveStreamingConfig,
  stepStreamingController,
} from '../../engine/streaming/worldStreaming';
import { createId } from '../../utils/id';

interface WorldStreamingPanelProps {
  scene?: SceneData;
  assets: ProjectAssetMeta[];
  saveSlots?: ProjectSaveSlot[];
  onUpdateScene?: (updater: (scene: SceneData) => SceneData) => void;
  onChangeSaveSlots?: (slots: ProjectSaveSlot[]) => void;
}

export const WorldStreamingPanel: React.FC<WorldStreamingPanelProps> = ({
  scene,
  assets,
  saveSlots = [],
  onUpdateScene,
  onChangeSaveSlots,
}) => {
  const [simX, setSimX] = useState(0);
  const [simZ, setSimZ] = useState(0);

  const cfg: WorldStreamingConfig = useMemo(
    () => resolveStreamingConfig(scene?.worldStreaming ?? DEFAULT_WORLD_STREAMING_CONFIG),
    [scene?.worldStreaming]
  );

  const streamingSim = useMemo(() => {
    if (!scene) return null;
    const manifest = partitionSceneIntoChunks(scene, cfg);
    const state = createStreamingControllerState(scene, manifest);
    // Avanza unos pasos para simular la cola progresiva con maxLoadsPerFrame
    for (let i = 0; i < 4; i++) {
      stepStreamingController(
        state,
        scene,
        manifest,
        {
          playerPos: { x: simX, y: 1, z: simZ },
          cameraPos: { x: simX, y: 8, z: simZ + 12 },
          cameraForwardXZ: { x: 0, z: -1 },
          velocityXZ: { x: 0, z: 0 },
        },
        cfg
      );
    }
    const report = buildStreamingProfilerReport(scene, assets, manifest, state);
    return { manifest, state, report };
  }, [scene, cfg, simX, simZ, assets]);

  if (!scene || !onUpdateScene) {
    return (
      <div className="flex h-full items-center justify-center text-xs text-zinc-500">
        Abre una escena para configurar Mundo Abierto y Chunk Streaming.
      </div>
    );
  }

  const patchStreaming = (patch: Partial<WorldStreamingConfig>) => {
    onUpdateScene((prev) => ({
      ...prev,
      worldStreaming: {
        ...resolveStreamingConfig(prev.worldStreaming),
        ...patch,
      },
    }));
  };

  const addCameraVolume = () => {
    const camVolumes = scene.cameraVolumes ?? [];
    const nextVol: CameraVolume3D = {
      id: createId('cvol'),
      name: `Zona_Camara_${camVolumes.length + 1}`,
      enabled: true,
      priority: 10 + camVolumes.length,
      zoneType: 'interior',
      bounds: { minX: simX - 10, maxX: simX + 10, minY: -4, maxY: 12, minZ: simZ - 10, maxZ: simZ + 10 },
      mode: 'third_person_orbit',
      fov: 62,
      distance: 6.5,
      shoulderOffsetX: 0.75,
      shoulderOffsetY: 0.35,
      terrainMinClearance: 1.4,
      blendDurationSec: 0.6,
    };
    onUpdateScene((prev) => ({
      ...prev,
      cameraVolumes: [...(prev.cameraVolumes ?? []), nextVol],
    }));
  };

  const updateCameraVolume = (id: string, patch: Partial<CameraVolume3D>) => {
    onUpdateScene((prev) => ({
      ...prev,
      cameraVolumes: (prev.cameraVolumes ?? []).map((v) =>
        v.id === id ? { ...v, ...patch } : v
      ),
    }));
  };

  const removeCameraVolume = (id: string) => {
    onUpdateScene((prev) => ({
      ...prev,
      cameraVolumes: (prev.cameraVolumes ?? []).filter((v) => v.id !== id),
    }));
  };

  const addOcclusionVolume = (kind: 'occluder' | 'sector') => {
    const occs = scene.occlusionVolumes ?? [];
    const nextOcc: OcclusionVolume3D = {
      id: createId('occ'),
      name: `${kind === 'sector' ? 'Sector' : 'Oclusor'}_${occs.length + 1}`,
      enabled: true,
      kind,
      bounds: { minX: simX - 8, maxX: simX + 8, minY: -2, maxY: 14, minZ: simZ - 8, maxZ: simZ + 8 },
      connectedSectorIds: [],
    };
    onUpdateScene((prev) => ({
      ...prev,
      occlusionVolumes: [...(prev.occlusionVolumes ?? []), nextOcc],
    }));
  };

  const removeOcclusionVolume = (id: string) => {
    onUpdateScene((prev) => ({
      ...prev,
      occlusionVolumes: (prev.occlusionVolumes ?? []).filter((v) => v.id !== id),
    }));
  };

  const createSaveSnapshot = () => {
    if (!onChangeSaveSlots) return;
    const slot: ProjectSaveSlot = {
      id: createId('slot'),
      name: `Checkpoint_${saveSlots.length + 1}`,
      savedAt: Date.now(),
      sceneId: scene.id,
      variables: {},
      worldSaveState: {
        destroyedIds: [],
        triggeredIds: [],
        objectTransforms: {
          player_sim_cursor: { x: simX, y: 1.5, z: simZ },
        },
      },
    };
    onChangeSaveSlots([slot, ...saveSlots]);
  };

  const report = streamingSim?.report;
  const chunksList = streamingSim ? Array.from(streamingSim.manifest.chunks.values()) : [];

  return (
    <div className="grid h-full grid-cols-1 gap-2 overflow-y-auto p-2 text-xs text-zinc-200 lg:grid-cols-12">
      {/* Columna 1: Configuración de Streaming */}
      <div className="flex flex-col gap-2 rounded border border-[#2a2a34] bg-[#18181f] p-2 lg:col-span-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1.5 font-semibold text-zinc-100">
            <Layers className="h-3.5 w-3.5 text-emerald-400" />
            <span>Chunk Streaming</span>
          </div>
          <label className="inline-flex cursor-pointer items-center gap-1.5 text-[11px]">
            <input
              type="checkbox"
              checked={Boolean(scene.worldStreaming?.enabled)}
              onChange={(e) => patchStreaming({ enabled: e.target.checked })}
              aria-label="Activar World Streaming"
            />
            <span className={scene.worldStreaming?.enabled ? 'text-emerald-400 font-semibold' : 'text-zinc-400'}>
              {scene.worldStreaming?.enabled ? 'Activo' : 'Inactivo'}
            </span>
          </label>
        </div>

        <div className="grid grid-cols-2 gap-1.5 text-[11px]">
          <label className="flex flex-col gap-0.5">
            <span className="text-zinc-400">Chunk (m)</span>
            <input
              type="number"
              min={16}
              max={256}
              value={cfg.chunkSize}
              onChange={(e) => patchStreaming({ chunkSize: Number(e.target.value) || 64 })}
              className="rounded border border-[#32323e] bg-[#111116] px-1.5 py-0.5 font-mono"
            />
          </label>
          <label className="flex flex-col gap-0.5">
            <span className="text-zinc-400">Carga / Frame</span>
            <input
              type="number"
              min={1}
              max={16}
              value={cfg.maxLoadsPerFrame}
              onChange={(e) => patchStreaming({ maxLoadsPerFrame: Number(e.target.value) || 2 })}
              className="rounded border border-[#32323e] bg-[#111116] px-1.5 py-0.5 font-mono"
            />
          </label>
          <label className="flex flex-col gap-0.5">
            <span className="text-zinc-400">Radio Carga (m)</span>
            <input
              type="number"
              min={24}
              max={600}
              value={cfg.loadRadius}
              onChange={(e) => patchStreaming({ loadRadius: Number(e.target.value) || 140 })}
              className="rounded border border-[#32323e] bg-[#111116] px-1.5 py-0.5 font-mono"
            />
          </label>
          <label className="flex flex-col gap-0.5">
            <span className="text-zinc-400">Descarga (m)</span>
            <input
              type="number"
              min={48}
              max={900}
              value={cfg.unloadRadius}
              onChange={(e) => patchStreaming({ unloadRadius: Number(e.target.value) || 210 })}
              className="rounded border border-[#32323e] bg-[#111116] px-1.5 py-0.5 font-mono"
            />
          </label>
        </div>

        <div className="flex flex-wrap items-center gap-3 text-[11px]">
          <label className="inline-flex cursor-pointer items-center gap-1">
            <input
              type="checkbox"
              checked={cfg.enableHlod}
              onChange={(e) => patchStreaming({ enableHlod: e.target.checked })}
            />
            <span>HLOD Proxies</span>
          </label>
          <label className="inline-flex cursor-pointer items-center gap-1">
            <input
              type="checkbox"
              checked={cfg.enableOcclusionCulling}
              onChange={(e) => patchStreaming({ enableOcclusionCulling: e.target.checked })}
            />
            <span>Oclusión</span>
          </label>
        </div>

        <label className="flex flex-col gap-0.5 text-[11px]">
          <span className="text-zinc-400">Perfil de Presupuesto (Memoria)</span>
          <select
            value={cfg.budgetProfile}
            onChange={(e) => patchStreaming({ budgetProfile: e.target.value as MemoryBudgetProfile })}
            className="rounded border border-[#32323e] bg-[#111116] px-2 py-1 text-zinc-100"
          >
            <option value="pc">PC / Escritorio</option>
            <option value="mobile">Móvil / Web Ligera</option>
            <option value="custom">Personalizado</option>
          </select>
        </label>
      </div>

      {/* Columna 2: Mapa Top-Down de Chunks y Presupuesto */}
      <div className="flex flex-col gap-2 rounded border border-[#2a2a34] bg-[#18181f] p-2 lg:col-span-5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className="font-semibold text-zinc-100">
            Mapa de Chunks ({chunksList.length} celdas)
          </span>
          <span className="font-mono text-[10px] text-zinc-400">
            Cursor Sim: X={simX}m, Z={simZ}m
          </span>
        </div>

        <div className="grid grid-cols-2 gap-2 text-[10px]">
          <label className="flex items-center gap-1.5">
            <span className="text-zinc-400">Sim X</span>
            <input
              type="range"
              min={-250}
              max={250}
              value={simX}
              onChange={(e) => setSimX(Number(e.target.value))}
              className="flex-1"
            />
          </label>
          <label className="flex items-center gap-1.5">
            <span className="text-zinc-400">Sim Z</span>
            <input
              type="range"
              min={-250}
              max={250}
              value={simZ}
              onChange={(e) => setSimZ(Number(e.target.value))}
              className="flex-1"
            />
          </label>
        </div>

        <div className="grid max-h-24 grid-cols-4 gap-1 overflow-y-auto sm:grid-cols-6">
          {chunksList.slice(0, 24).map((ch) => {
            const dist = Math.hypot(ch.bounds.centerX - simX, ch.bounds.centerZ - simZ);
            const lvl = resolveActivityLevel(dist, cfg);
            const badgeColor =
              lvl === 'near'
                ? 'border-emerald-500/50 bg-emerald-500/15 text-emerald-300'
                : lvl === 'medium'
                  ? 'border-sky-500/50 bg-sky-500/15 text-sky-300'
                  : lvl === 'far'
                    ? 'border-amber-500/50 bg-amber-500/15 text-amber-300'
                    : 'border-zinc-700 bg-zinc-900 text-zinc-500';
            return (
              <button
                key={ch.key}
                type="button"
                onClick={() => {
                  setSimX(Math.round(ch.bounds.centerX));
                  setSimZ(Math.round(ch.bounds.centerZ));
                }}
                className={`rounded border px-1.5 py-1 text-left font-mono text-[10px] ${badgeColor}`}
                title={`Chunk (${ch.cx},${ch.cz}): ${ch.objectIds.length} objetos, ${ch.lightIds.length} luces`}
              >
                <div className="font-semibold">{ch.key}</div>
                <div className="text-[9px] opacity-80">
                  {ch.objectIds.length}obj · {lvl === 'near' ? 'N1' : lvl === 'medium' ? 'N2' : lvl === 'far' ? 'HLOD' : 'Off'}
                </div>
              </button>
            );
          })}
        </div>

        {report && (
          <div className="space-y-1 border-t border-[#292934] pt-1.5 text-[10px]">
            <div className="flex flex-wrap items-center justify-between gap-2 text-zinc-300">
              <span>
                Cargados: <strong>{report.loadedChunks}</strong>/{report.totalManifestChunks} · HLOD:{' '}
                <strong>{report.hlodProxyCount}</strong> · Ocultos: <strong>{report.culledByOcclusion}</strong>
              </span>
              <span className="font-mono text-zinc-400">
                N1:{report.activeNear} N2:{report.activeMedium} N3:{report.activeFar} Off:{report.unloadedCount}
              </span>
            </div>
            <div className="grid grid-cols-3 gap-1.5 font-mono text-[10px]">
              <div className="rounded bg-[#111116] px-1.5 py-0.5">
                Tex: {report.residency.usage.texturesMB}/{report.residency.limits.texturesMB}MB
              </div>
              <div className="rounded bg-[#111116] px-1.5 py-0.5">
                Ent: {report.residency.usage.activeEntitiesMax}/{report.residency.limits.activeEntitiesMax}
              </div>
              <div className="rounded bg-[#111116] px-1.5 py-0.5">
                Fís: {report.residency.usage.physicsBodiesMax}/{report.residency.limits.physicsBodiesMax}
              </div>
            </div>
            {report.memoryWarnings.length > 0 && (
              <div className="text-[10px] text-amber-300">
                {report.memoryWarnings[0]}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Columna 3: Volúmenes de Cámara, Oclusión y Save Slots */}
      <div className="flex flex-col gap-2 rounded border border-[#2a2a34] bg-[#18181f] p-2 lg:col-span-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1.5 font-semibold text-zinc-100">
            <Camera className="h-3.5 w-3.5 text-sky-400" />
            <span>Volúmenes Cámara ({(scene.cameraVolumes ?? []).length})</span>
          </div>
          <button
            type="button"
            onClick={addCameraVolume}
            className="inline-flex items-center gap-1 rounded bg-sky-600/80 px-2 py-0.5 text-[10px] font-semibold text-white hover:bg-sky-500"
          >
            <Plus className="h-3 w-3" />
            <span>Zona</span>
          </button>
        </div>

        <div className="max-h-20 space-y-1 overflow-y-auto">
          {(scene.cameraVolumes ?? []).map((v) => (
            <div
              key={v.id}
              className="flex items-center justify-between gap-1 rounded border border-[#2d2d39] bg-[#121217] px-2 py-1 text-[10px]"
            >
              <div className="flex min-w-0 flex-1 items-center gap-1.5">
                <input
                  type="text"
                  value={v.name}
                  aria-label={`Nombre volumen ${v.name}`}
                  onChange={(e) => updateCameraVolume(v.id, { name: e.target.value })}
                  className="w-24 rounded bg-[#1b1b24] px-1 py-0.5 text-zinc-100"
                />
                <select
                  value={v.mode ?? 'third_person_orbit'}
                  aria-label={`Modo cámara ${v.name}`}
                  onChange={(e) =>
                    updateCameraVolume(v.id, {
                      mode: e.target.value as SmartCameraConfig['mode'],
                    })
                  }
                  className="rounded bg-[#1b1b24] px-1 py-0.5 text-[10px] text-zinc-300"
                >
                  <option value="third_person_orbit">Órbita 3ª</option>
                  <option value="smooth_follow">Seguimiento</option>
                  <option value="top_down">Cenital</option>
                  <option value="first_person">1ª Persona</option>
                </select>
                <span className="font-mono text-zinc-500">P{v.priority}</span>
              </div>
              <button
                type="button"
                aria-label={`Eliminar volumen ${v.name}`}
                onClick={() => removeCameraVolume(v.id)}
                className="p-0.5 text-zinc-500 hover:text-red-400"
              >
                <Trash2 className="h-3 w-3" />
              </button>
            </div>
          ))}
        </div>

        <div className="flex items-center justify-between border-t border-[#292934] pt-1.5">
          <div className="flex items-center gap-1.5 font-semibold text-zinc-100">
            <EyeOff className="h-3.5 w-3.5 text-amber-400" />
            <span>Oclusores/Sectores ({(scene.occlusionVolumes ?? []).length})</span>
          </div>
          <div className="flex gap-1">
            <button
              type="button"
              onClick={() => addOcclusionVolume('occluder')}
              className="rounded border border-[#363644] bg-[#20202a] px-1.5 py-0.5 text-[10px] hover:text-white"
            >
              + Oclusor
            </button>
            <button
              type="button"
              onClick={() => addOcclusionVolume('sector')}
              className="rounded border border-[#363644] bg-[#20202a] px-1.5 py-0.5 text-[10px] hover:text-white"
            >
              + Sector
            </button>
          </div>
        </div>

        {(scene.occlusionVolumes ?? []).length > 0 && (
          <div className="flex flex-wrap gap-1">
            {(scene.occlusionVolumes ?? []).map((occ) => (
              <span
                key={occ.id}
                className="inline-flex items-center gap-1 rounded border border-[#323240] bg-[#121217] px-1.5 py-0.5 text-[10px]"
              >
                <span>{occ.name}</span>
                <button
                  type="button"
                  aria-label={`Eliminar ${occ.name}`}
                  onClick={() => removeOcclusionVolume(occ.id)}
                  className="text-zinc-500 hover:text-red-400"
                >
                  ×
                </button>
              </span>
            ))}
          </div>
        )}

        <div className="flex items-center justify-between border-t border-[#292934] pt-1.5">
          <div className="flex items-center gap-1.5 font-semibold text-zinc-100">
            <HardDrive className="h-3.5 w-3.5 text-violet-400" />
            <span>Ranuras SaveState ({saveSlots.length})</span>
          </div>
          {onChangeSaveSlots && (
            <button
              type="button"
              onClick={createSaveSnapshot}
              className="inline-flex items-center gap-1 rounded border border-[#363644] bg-[#20202a] px-1.5 py-0.5 text-[10px] hover:text-white"
            >
              <Save className="h-3 w-3" />
              <span>Guardar punto</span>
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
