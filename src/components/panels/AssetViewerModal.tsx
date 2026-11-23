import React, { useEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { Box, CheckCircle2, Image as ImageIcon, Music, Pause, Play, Plus, RefreshCw, X } from 'lucide-react';
import type { GameObjectData } from '../../engine/core/types';
import { loadModel3DFromBlob } from '../../engine/three3d/modelLoader';
import { detectSoftwareWebGL } from '../../engine/three3d/resourceDisposer';
import type { ProjectAssetMeta } from '../../project/models/project';

interface AssetViewerModalProps {
  asset: ProjectAssetMeta | null;
  blob: Blob | null;
  selectedObject?: GameObjectData | null;
  onClose: () => void;
  onInsertToScene: (assetId: string) => void;
  onAssignToSelected?: (assetId: string) => void;
}

interface Model3DStats {
  triangles: number;
  vertices: number;
  meshes: number;
  bones: number;
  materials: number;
  clipNames: string[];
}

export function evaluatePolyBudget(
  triangles: number,
  targetPlatform: 'mobile' | 'pc'
): { tier: 'green' | 'orange' | 'red'; label: string; pct: number; advice: string } {
  const greenMax = targetPlatform === 'mobile' ? 8000 : 35000;
  const orangeMax = targetPlatform === 'mobile' ? 25000 : 100000;
  const ceiling = targetPlatform === 'mobile' ? 35000 : 140000;
  const pct = Math.min(100, Math.max(4, Math.round((triangles / ceiling) * 100)));

  if (triangles <= greenMax) {
    return {
      tier: 'green',
      label: 'Óptimo',
      pct,
      advice: `Excelente rendimiento para ${targetPlatform === 'mobile' ? 'Móvil' : 'PC'} (<= ${greenMax.toLocaleString()} polígonos).`,
    };
  }
  if (triangles <= orangeMax) {
    return {
      tier: 'orange',
      label: 'Regular',
      pct,
      advice: `Carga media para ${targetPlatform === 'mobile' ? 'Móvil' : 'PC'}. Recomendado activar LOD a distancia.`,
    };
  }
  return {
    tier: 'red',
    label: 'Pesado (No recomendado)',
    pct,
    advice: `Supera los ${orangeMax.toLocaleString()} polígonos. Activa LOD + Fade Distance o reduce la malla.`,
  };
}

export const AssetViewerModal: React.FC<AssetViewerModalProps> = ({
  asset,
  blob,
  selectedObject,
  onClose,
  onInsertToScene,
  onAssignToSelected,
}) => {
  const [platformTarget, setPlatformTarget] = useState<'mobile' | 'pc'>('mobile');
  const [stats, setStats] = useState<Model3DStats | null>(null);
  const [activeClip, setActiveClip] = useState<string>('');
  const [isPlayingAnim, setIsPlayingAnim] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const stageHostRef = useRef<HTMLDivElement | null>(null);
  const activeClipRef = useRef(activeClip);
  const isPlayingRef = useRef(isPlayingAnim);
  activeClipRef.current = activeClip;
  isPlayingRef.current = isPlayingAnim;

  const objectUrl = useMemo(() => {
    if (!asset || !blob) return null;
    return URL.createObjectURL(blob);
  }, [asset, blob]);

  useEffect(() => {
    return () => {
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [objectUrl]);

  // Visor interactivo 3D para .glb/.gltf (incluye esqueletos sin malla)
  useEffect(() => {
    if (!asset || asset.kind !== 'model3d' || !objectUrl) return;
    const host = stageHostRef.current;
    if (!host) return;

    setStats(null);
    setLoadError(null);

    const w = Math.max(320, host.clientWidth || 560);
    const h = Math.max(260, host.clientHeight || 360);
    const renderer = new THREE.WebGLRenderer({
      antialias: true,
      alpha: false,
      powerPreference: 'high-performance',
    });
    const software = detectSoftwareWebGL(renderer);
    renderer.setPixelRatio(software ? 1 : Math.min(window.devicePixelRatio || 1, 2));
    renderer.setSize(w, h);
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.05;
    host.innerHTML = '';
    host.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    scene.background = new THREE.Color('#0f1117');

    const pmrem = new THREE.PMREMGenerator(renderer);
    const roomEnv = new RoomEnvironment();
    const envTex = pmrem.fromScene(roomEnv, 0.04).texture;
    scene.environment = envTex;

    const camera = new THREE.PerspectiveCamera(45, w / h, 0.05, 500);
    camera.position.set(2.8, 2.1, 3.6);

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.target.set(0, 0.7, 0);

    const grid = new THREE.GridHelper(10, 10, 0x334155, 0x1e293b);
    scene.add(grid);
    const hemi = new THREE.HemisphereLight(0xf8fafc, 0x1e293b, 0.85);
    scene.add(hemi);
    const dir = new THREE.DirectionalLight(0xffffff, 1.4);
    dir.position.set(4, 7, 5);
    scene.add(dir);

    let mixer: THREE.AnimationMixer | null = null;
    const actions = new Map<string, THREE.AnimationAction>();
    let currentPlayingName = '';
    let cancelled = false;

    void (async () => {
      if (!blob) return;
      try {
        const loaded = await loadModel3DFromBlob(blob, asset.format || asset.filename, {
          normalizeSize: 2.2,
        });
        if (cancelled) return;
        const root = loaded.root;
        scene.add(root);

        if (loaded.stats.bones > 0 && loaded.stats.meshes === 0) {
          const skelHelper = new THREE.SkeletonHelper(root);
          scene.add(skelHelper);
        }

        const box = new THREE.Box3().setFromObject(root);
        if (!box.isEmpty()) {
          const size = new THREE.Vector3();
          const center = new THREE.Vector3();
          box.getSize(size);
          box.getCenter(center);
          root.position.y += size.y * 0.5 - center.y;
          controls.target.set(0, Math.max(0.4, size.y * 0.45), 0);
          camera.position.set(2.4, Math.max(1.2, size.y * 0.8), 3.1);
          controls.update();
        }

        if (loaded.animations.length > 0) {
          mixer = new THREE.AnimationMixer(root);
          loaded.animations.forEach((clip, idx) => {
            const cname = clip.name || `Clip_${idx + 1}`;
            actions.set(cname, mixer!.clipAction(clip));
          });
          currentPlayingName = loaded.clipNames[0];
          setActiveClip(currentPlayingName);
          actions.get(currentPlayingName)?.play();
        } else {
          setActiveClip('');
        }

        setStats({
          ...loaded.stats,
          clipNames: loaded.clipNames,
        });
      } catch (err) {
        if (!cancelled) {
          setLoadError(err instanceof Error ? err.message : 'No se pudo cargar el modelo 3D.');
        }
      }
    })();

    const ro = new ResizeObserver((entries) => {
      for (const e of entries) {
        const nw = Math.max(240, e.contentRect.width);
        const nh = Math.max(200, e.contentRect.height);
        camera.aspect = nw / nh;
        camera.updateProjectionMatrix();
        renderer.setSize(nw, nh);
      }
    });
    ro.observe(host);

    let mounted = true;
    let rafId = 0;
    let prev = performance.now();
    const tick = (now: number) => {
      if (!mounted) return;
      const dt = Math.min(0.05, Math.max(0.001, (now - prev) / 1000));
      prev = now;

      if (mixer) {
        if (activeClipRef.current && activeClipRef.current !== currentPlayingName) {
          const prevAct = actions.get(currentPlayingName);
          const nextAct = actions.get(activeClipRef.current);
          if (nextAct) {
            prevAct?.stop();
            nextAct.reset().play();
            currentPlayingName = activeClipRef.current;
          }
        }
        if (isPlayingRef.current) {
          mixer.update(dt);
        }
      }

      controls.update();
      renderer.render(scene, camera);
      rafId = requestAnimationFrame(tick);
    };
    rafId = requestAnimationFrame(tick);

    return () => {
      cancelled = true;
      mounted = false;
      cancelAnimationFrame(rafId);
      ro.disconnect();
      controls.dispose();
      roomEnv.dispose();
      envTex.dispose();
      pmrem.dispose();
      renderer.dispose();
      if (host.contains(renderer.domElement)) host.removeChild(renderer.domElement);
    };
  }, [asset, blob, objectUrl]);

  if (!asset) return null;

  const is3D = asset.kind === 'model3d';
  const isAudio = asset.kind === 'audio';
  const isImage = !is3D && !isAudio;
  const polyEval = stats ? evaluatePolyBudget(stats.triangles, platformTarget) : null;

  const canAssignToSelected =
    Boolean(selectedObject && onAssignToSelected) &&
    ((is3D &&
      (selectedObject?.type === 'mesh_3d' ||
        selectedObject?.type === 'container' ||
        selectedObject?.type === 'sprite')) ||
      (isImage && (selectedObject?.type === 'sprite' || selectedObject?.type === 'mesh_3d')));

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4"
      role="dialog"
      aria-modal="true"
      aria-label={`Visor de recurso: ${asset.name}`}
      onClick={onClose}
    >
      <div
        className="flex w-full max-w-3xl flex-col overflow-hidden rounded-xl border border-[#32323c] bg-[#16161b] text-zinc-100 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="flex items-center justify-between border-b border-[#2b2b34] bg-[#1d1d24] px-4 py-3">
          <div className="flex items-center gap-2 min-w-0">
            {is3D ? (
              <Box className="h-4 w-4 shrink-0 text-sky-400" />
            ) : isAudio ? (
              <Music className="h-4 w-4 shrink-0 text-emerald-400" />
            ) : (
              <ImageIcon className="h-4 w-4 shrink-0 text-blue-400" />
            )}
            <div className="min-w-0">
              <h2 className="truncate text-sm font-bold">{asset.name}</h2>
              <p className="truncate text-[11px] text-zinc-400 font-mono">
                {asset.filename} · {asset.format.toUpperCase()} · {Math.max(1, Math.round(asset.size / 1024))} KB
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            aria-label="Cerrar visor"
            className="rounded p-1.5 text-zinc-400 hover:bg-[#2a2a33] hover:text-white"
          >
            <X className="h-4 w-4" />
          </button>
        </header>

        <div className="p-4 space-y-3">
          {isImage && (
            <div className="flex flex-col items-center justify-center rounded-lg border border-[#2d2d37] bg-[#101015] p-6">
              {objectUrl || asset.thumbnailDataUrl ? (
                <img
                  src={objectUrl ?? asset.thumbnailDataUrl}
                  alt={asset.name}
                  className="max-h-72 max-w-full object-contain rounded border border-[#2a2a33]"
                />
              ) : (
                <div className="py-12 text-xs text-zinc-500">Sin datos de imagen disponibles.</div>
              )}
              <div className="mt-3 flex items-center gap-4 text-xs font-mono text-zinc-300">
                <span>Resolución: {asset.width} × {asset.height} px</span>
                <span>Formato: {asset.format.toUpperCase()}</span>
              </div>
            </div>
          )}

          {isAudio && (
            <div className="flex flex-col items-center justify-center gap-4 rounded-lg border border-[#2d2d37] bg-[#101015] p-8">
              <div className="flex h-16 w-16 items-center justify-center rounded-full border border-emerald-500/40 bg-emerald-500/15">
                <Music className="h-8 w-8 text-emerald-400" />
              </div>
              <div className="text-center">
                <div className="text-sm font-semibold text-zinc-100">{asset.name}</div>
                <div className="mt-0.5 text-xs text-zinc-400">
                  Recurso de audio local listo para usar en disparos, colisiones o música de escena
                </div>
              </div>
              {objectUrl ? (
                <audio controls src={objectUrl} className="w-full max-w-md" />
              ) : (
                <div className="text-xs text-red-400">No se encontró el archivo de audio en IndexedDB.</div>
              )}
            </div>
          )}

          {is3D && (
            <div className="space-y-3">
              <div
                ref={stageHostRef}
                className="relative h-72 w-full overflow-hidden rounded-lg border border-[#2d2d37] bg-[#0f1117]"
              />
              {loadError && (
                <div className="rounded border border-red-500/40 bg-red-500/10 px-3 py-2 text-xs text-red-300">
                  {loadError}
                </div>
              )}

              {stats && polyEval && (
                <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                  <div className="rounded-lg border border-[#2c2c36] bg-[#1b1b22] p-3 space-y-2">
                    <div className="flex items-center justify-between text-xs font-semibold text-zinc-200">
                      <span>Métricas del Modelo 3D</span>
                      <span className="text-[10px] font-mono text-zinc-400">
                        {stats.bones > 0 && stats.meshes === 0 ? 'Solo Esqueleto' : `${stats.meshes} malla(s)`}
                      </span>
                    </div>
                    <div className="grid grid-cols-3 gap-2 text-center font-mono">
                      <div className="rounded bg-[#131318] p-1.5">
                        <div className="text-[10px] text-zinc-400">Polígonos</div>
                        <div className="text-xs font-bold text-sky-300">{stats.triangles.toLocaleString()}</div>
                      </div>
                      <div className="rounded bg-[#131318] p-1.5">
                        <div className="text-[10px] text-zinc-400">Vértices</div>
                        <div className="text-xs font-bold text-indigo-300">{stats.vertices.toLocaleString()}</div>
                      </div>
                      <div className="rounded bg-[#131318] p-1.5">
                        <div className="text-[10px] text-zinc-400">Huesos</div>
                        <div className="text-xs font-bold text-amber-300">{stats.bones}</div>
                      </div>
                    </div>

                    {stats.clipNames.length > 0 && (
                      <div className="flex items-center gap-1.5 pt-1">
                        <select
                          aria-label="Animación del modelo"
                          value={activeClip}
                          onChange={(e) => setActiveClip(e.target.value)}
                          className="min-w-0 flex-1 rounded border border-[#32323c] bg-[#131318] px-2 py-1 text-xs text-zinc-100"
                        >
                          {stats.clipNames.map((c) => (
                            <option key={c} value={c}>
                              Animación: {c}
                            </option>
                          ))}
                        </select>
                        <button
                          type="button"
                          onClick={() => setIsPlayingAnim((v) => !v)}
                          className="inline-flex items-center gap-1 rounded border border-[#32323c] bg-[#24242c] px-2 py-1 text-xs text-zinc-200 hover:text-white"
                        >
                          {isPlayingAnim ? <Pause className="h-3.5 w-3.5" /> : <Play className="h-3.5 w-3.5" />}
                          <span>{isPlayingAnim ? 'Pausar' : 'Reproducir'}</span>
                        </button>
                      </div>
                    )}
                  </div>

                  {/* Barra de optimización 3 colores Móvil / PC */}
                  <div className="rounded-lg border border-[#2c2c36] bg-[#1b1b22] p-3 space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-semibold text-zinc-200">
                        Semáforo de Optimización
                      </span>
                      <div className="inline-flex rounded border border-[#32323c] bg-[#131318] p-0.5 text-[10px]">
                        <button
                          type="button"
                          onClick={() => setPlatformTarget('mobile')}
                          className={`rounded px-2 py-0.5 font-semibold ${
                            platformTarget === 'mobile' ? 'bg-blue-600 text-white' : 'text-zinc-400 hover:text-white'
                          }`}
                        >
                          Móvil
                        </button>
                        <button
                          type="button"
                          onClick={() => setPlatformTarget('pc')}
                          className={`rounded px-2 py-0.5 font-semibold ${
                            platformTarget === 'pc' ? 'bg-blue-600 text-white' : 'text-zinc-400 hover:text-white'
                          }`}
                        >
                          PC
                        </button>
                      </div>
                    </div>

                    <div className="space-y-1">
                      <div className="flex items-center justify-between text-[11px]">
                        <span
                          className={`font-bold ${
                            polyEval.tier === 'green'
                              ? 'text-emerald-400'
                              : polyEval.tier === 'orange'
                                ? 'text-amber-400'
                                : 'text-red-400'
                          }`}
                        >
                          Estado: {polyEval.label}
                        </span>
                        <span className="font-mono text-zinc-400">{polyEval.pct}% presupuesto</span>
                      </div>
                      <div className="relative h-3 w-full overflow-hidden rounded-full bg-[#111116] border border-[#2a2a34]">
                        <div className="absolute inset-0 flex opacity-25">
                          <div className="h-full w-1/3 bg-emerald-500" />
                          <div className="h-full w-1/3 bg-amber-500" />
                          <div className="h-full w-1/3 bg-red-500" />
                        </div>
                        <div
                          style={{ width: `${polyEval.pct}%` }}
                          className={`relative h-full transition-all ${
                            polyEval.tier === 'green'
                              ? 'bg-emerald-500'
                              : polyEval.tier === 'orange'
                                ? 'bg-amber-500'
                                : 'bg-red-500'
                          }`}
                        />
                      </div>
                      <p className="text-[11px] text-zinc-400 leading-relaxed">{polyEval.advice}</p>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        <footer className="flex items-center justify-between gap-2 border-t border-[#2b2b34] bg-[#1d1d24] px-4 py-2.5">
          <div className="text-[11px] text-zinc-400">
            {is3D
              ? 'Arrastra para rotar el modelo · Rueda del ratón para hacer zoom'
              : 'Doble clic en cualquier recurso abre este visor detallado'}
          </div>
          <div className="flex items-center gap-2">
            {canAssignToSelected && (
              <button
                type="button"
                onClick={() => {
                  onAssignToSelected?.(asset.id);
                  onClose();
                }}
                className="inline-flex items-center gap-1.5 rounded border border-emerald-500/50 bg-emerald-600/20 px-3 py-1.5 text-xs font-semibold text-emerald-200 hover:bg-emerald-600/35"
              >
                <RefreshCw className="h-3.5 w-3.5" />
                <span>Asignar a «{selectedObject?.name}» (misma posición)</span>
              </button>
            )}
            {!isAudio && (
              <button
                type="button"
                onClick={() => {
                  onInsertToScene(asset.id);
                  onClose();
                }}
                className="inline-flex items-center gap-1.5 rounded bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-blue-500"
              >
                <Plus className="h-3.5 w-3.5" />
                <span>Insertar nuevo en escena</span>
              </button>
            )}
            <button
              type="button"
              onClick={onClose}
              className="inline-flex items-center gap-1 rounded border border-[#343440] px-3 py-1.5 text-xs text-zinc-300 hover:bg-[#2a2a34]"
            >
              <CheckCircle2 className="h-3.5 w-3.5" />
              <span>Listo</span>
            </button>
          </div>
        </footer>
      </div>
    </div>
  );
};
