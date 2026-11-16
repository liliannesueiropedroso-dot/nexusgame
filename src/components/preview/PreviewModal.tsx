import React, { useEffect, useRef, useState } from 'react';
import {
  Bug,
  Pause,
  Play,
  RotateCcw,
  Scan,
  Square,
  StepForward,
} from 'lucide-react';
import { sharedAudioEngine } from '../../engine/audio/audioEngine';
import { fitCameraToViewport } from '../../engine/camera/camera2d';
import { screenToStage } from '../../engine/core/math';
import type {
  AudioBusSettings,
  CameraState,
  ProjectVariable,
  SceneData,
  StageResolution,
} from '../../engine/core/types';
import { pickInteractiveUiAt } from '../../engine/renderer2d/hitTest';
import { PixiStageRenderer } from '../../engine/renderer2d/PixiStageRenderer';
import { RuntimeSceneManager } from '../../engine/runtime/sceneManager';
import { FIXED_DT, type InputState } from '../../engine/runtime/stepGameSimulation';
import type { PrefabDefinition } from '../../project/models/project';

interface PreviewModalProps {
  open: boolean;
  projectName: string;
  scene: SceneData;
  scenes?: SceneData[];
  initialSceneId?: string;
  prefabs?: PrefabDefinition[];
  stage: StageResolution;
  assetBlobs: Map<string, Blob>;
  variables?: ProjectVariable[];
  audioBuses?: AudioBusSettings;
  onStop: () => void;
}

export const PreviewModal: React.FC<PreviewModalProps> = ({
  open,
  projectName,
  scene,
  scenes,
  initialSceneId,
  prefabs = [],
  stage,
  assetBlobs,
  variables = [],
  audioBuses,
  onStop,
}) => {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const managerRef = useRef<RuntimeSceneManager | null>(null);
  const rendererRef = useRef<PixiStageRenderer | null>(null);
  const camRef = useRef<CameraState>({ x: 0, y: 0, zoom: 1 });
  const inputRef = useRef<InputState>({
    left: false,
    right: false,
    up: false,
    down: false,
    jump: false,
  });

  const [paused, setPaused] = useState(false);
  const [showDebugColliders, setShowDebugColliders] = useState(false);
  const [showDebugger, setShowDebugger] = useState(false);
  const [hoverUi, setHoverUi] = useState(false);

  const [hudState, setHudState] = useState({
    score: 0,
    fps: 60,
    activeSceneName: scene.name,
    overlayNames: [] as string[],
    objectCount: scene.objects.length,
    varsList: [] as Array<[string, string]>,
  });

  const pausedRef = useRef(paused);
  pausedRef.current = paused;
  const showCollidersRef = useRef(showDebugColliders);
  showCollidersRef.current = showDebugColliders;

  const sceneList = scenes && scenes.length > 0 ? scenes : [scene];
  const startId = initialSceneId || scene.id;

  const flushSounds = (sounds: ReturnType<RuntimeSceneManager['step']>) => {
    for (const snd of sounds) {
      if (snd.kind === 'setVolume' && snd.setChannel && snd.volume !== undefined) {
        sharedAudioEngine.setChannelVolume(snd.setChannel, snd.volume);
      } else if (snd.kind === 'synth' && snd.preset) {
        sharedAudioEngine.playSynthPreset(snd.preset, snd.channel, {
          volume: snd.volume,
          pitch: snd.pitch,
        });
      } else if (snd.kind === 'asset' && snd.assetId) {
        const blob = assetBlobs.get(snd.assetId);
        if (blob) {
          void sharedAudioEngine.playAssetBlob(snd.assetId, blob, {
            channel: snd.channel,
            volume: snd.volume,
            pitch: snd.pitch,
          });
        }
      }
    }
  };

  const renderSnapshot = (manager: RuntimeSceneManager) => {
    const renderer = rendererRef.current;
    if (!renderer) return;
    const sim = manager.activeTopState;
    const shakeOffset =
      sim.shakeTimeRemaining > 0
        ? {
            x: (Math.random() * 2 - 1) * sim.shakeIntensity,
            y: (Math.random() * 2 - 1) * sim.shakeIntensity,
          }
        : { x: 0, y: 0 };

    renderer.renderImmediate({
      scene: sim.scene,
      stage,
      backgroundColor: sim.scene.backgroundColor,
      camera: camRef.current,
      assetBlobs,
      animationElapsed: sim.elapsed,
      particles: sim.particles,
      emitterParticles: sim.emitterParticles,
      screenFlash: sim.screenFlash,
      leaderboard: sim.leaderboard,
      flashTimers: sim.flashTimers,
      visualSquash: sim.visualSquash,
      cameraOffset: shakeOffset,
      cameraFollowOffset: sim.cameraPos,
      showDebugColliders: showCollidersRef.current,
      debugBodies: sim.bodies,
      variables: sim.variables,
      hoveredObjectId: sim.hoveredObjectId,
      transitionEffect: manager.transition,
    });
  };

  useEffect(() => {
    if (!open) return;
    sharedAudioEngine.setBusSettings(audioBuses);
    setPaused(false);
    setHoverUi(false);

    const pressedSet = new Set<string>();
    const input: InputState = {
      left: false,
      right: false,
      up: false,
      down: false,
      jump: false,
      action1: false,
      action2: false,
      pressedKeys: pressedSet,
      pointerDown: false,
      pointerJustPressed: false,
      pointerJustReleased: false,
      swipeDir: null,
    };
    inputRef.current = input;

    const clearAllInputs = () => {
      pressedSet.clear();
      input.left = false;
      input.right = false;
      input.up = false;
      input.down = false;
      input.jump = false;
      input.action1 = false;
      input.action2 = false;
      input.pointerDown = false;
      input.pointerJustPressed = false;
      input.pointerJustReleased = false;
      input.swipeDir = null;
    };

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onStop();
        return;
      }
      pressedSet.add(e.code);
      if (e.code === 'ArrowLeft' || e.code === 'KeyA') input.left = true;
      if (e.code === 'ArrowRight' || e.code === 'KeyD') input.right = true;
      if (e.code === 'ArrowUp' || e.code === 'KeyW') input.up = true;
      if (e.code === 'ArrowDown' || e.code === 'KeyS') input.down = true;
      if (e.code === 'KeyZ' || e.code === 'KeyJ') input.action1 = true;
      if (e.code === 'KeyX' || e.code === 'KeyK') input.action2 = true;
      if (e.code === 'Space' || e.code === 'ArrowUp' || e.code === 'ArrowDown') {
        e.preventDefault();
      }
      if (e.code === 'Space') {
        input.jump = true;
      }
    };

    const onKeyUp = (e: KeyboardEvent) => {
      pressedSet.delete(e.code);
      if (e.code === 'ArrowLeft' || e.code === 'KeyA') {
        input.left = pressedSet.has('ArrowLeft') || pressedSet.has('KeyA');
      }
      if (e.code === 'ArrowRight' || e.code === 'KeyD') {
        input.right = pressedSet.has('ArrowRight') || pressedSet.has('KeyD');
      }
      if (e.code === 'ArrowUp' || e.code === 'KeyW') {
        input.up = pressedSet.has('ArrowUp') || pressedSet.has('KeyW');
      }
      if (e.code === 'ArrowDown' || e.code === 'KeyS') {
        input.down = pressedSet.has('ArrowDown') || pressedSet.has('KeyS');
      }
      if (e.code === 'KeyZ' || e.code === 'KeyJ') {
        input.action1 = pressedSet.has('KeyZ') || pressedSet.has('KeyJ');
      }
      if (e.code === 'KeyX' || e.code === 'KeyK') {
        input.action2 = pressedSet.has('KeyX') || pressedSet.has('KeyK');
      }
      if (e.code === 'Space') input.jump = false;
    };

    const onVisibility = () => {
      if (document.hidden) clearAllInputs();
    };

    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    window.addEventListener('blur', clearAllInputs);
    document.addEventListener('visibilitychange', onVisibility);

    const host = hostRef.current;
    if (!host) {
      return () => {
        window.removeEventListener('keydown', onKeyDown);
        window.removeEventListener('keyup', onKeyUp);
        window.removeEventListener('blur', clearAllInputs);
        document.removeEventListener('visibilitychange', onVisibility);
      };
    }

    let mounted = true;
    let rafId = 0;
    const renderer = new PixiStageRenderer(host, 'preview');
    rendererRef.current = renderer;

    const storagePrefix = `nexus_persist_${projectName.replace(/[^a-zA-Z0-9_-]/g, '_')}_`;
    const storageAdapter = {
      get: (k: string) => {
        try {
          return window.localStorage.getItem(storagePrefix + k);
        } catch {
          return null;
        }
      },
      set: (k: string, v: string) => {
        try {
          window.localStorage.setItem(storagePrefix + k, v);
        } catch {
          // Ignorar errores de cuota
        }
      },
    };

    const manager = new RuntimeSceneManager({
      scenes: sceneList,
      initialSceneId: startId,
      variables,
      prefabs,
      stage,
      storageAdapter,
    });
    managerRef.current = manager;

    const updateCam = () => {
      const rect = host.getBoundingClientRect();
      camRef.current = fitCameraToViewport(rect.width, rect.height, stage, 24);
    };
    updateCam();

    const ro = new ResizeObserver((entries) => {
      for (const entry of entries) {
        renderer.resize(entry.contentRect.width, entry.contentRect.height);
        updateCam();
      }
    });
    ro.observe(host);

    renderer.init().then(() => {
      if (!mounted) return;
      updateCam();
      let lastTime = performance.now();
      let hudTimer = 0;
      let frameAcc = 0;
      let fpsVal = 60;

      const loop = (now: number) => {
        if (!mounted) return;
        const dt = Math.min(0.1, Math.max(0, (now - lastTime) / 1000));
        lastTime = now;

        if (!pausedRef.current) {
          const sounds = manager.step(dt, input);
          input.pointerJustPressed = false;
          input.pointerJustReleased = false;
          input.swipeDir = null;
          flushSounds(sounds);
          if (manager.activeTopState.pendingPauseToggle) {
            manager.activeTopState.pendingPauseToggle = false;
            setPaused((p) => !p);
          }
        }

        renderSnapshot(manager);

        frameAcc += 1;
        hudTimer += dt;
        if (hudTimer >= 0.15) {
          if (hudTimer > 0) fpsVal = Math.round(frameAcc / hudTimer);
          frameAcc = 0;
          hudTimer = 0;

          const active = manager.activeTopState;
          const pts = Number(active.variables.get('puntos') ?? 0);
          const varsList = Array.from(active.variables.entries()).map(
            ([k, v]) => [k, String(v)] as [string, string]
          );
          setHudState({
            score: Math.max(active.score, Number.isFinite(pts) ? pts : 0),
            fps: fpsVal,
            activeSceneName: manager.baseState.scene.name,
            overlayNames: manager.overlays.map((o) => o.scene.name),
            objectCount: active.scene.objects.length,
            varsList,
          });
        }

        rafId = requestAnimationFrame(loop);
      };

      rafId = requestAnimationFrame(loop);
    });

    return () => {
      mounted = false;
      cancelAnimationFrame(rafId);
      ro.disconnect();
      renderer.destroy();
      rendererRef.current = null;
      managerRef.current = null;
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      window.removeEventListener('blur', clearAllInputs);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [open, startId, stage, assetBlobs, audioBuses, projectName, onStop]);

  const toStageCoords = (clientX: number, clientY: number) => {
    const host = hostRef.current;
    const manager = managerRef.current;
    if (!host || !manager) return null;
    const rect = host.getBoundingClientRect();
    const localX = clientX - rect.left;
    const localY = clientY - rect.top;
    const stagePt = screenToStage(localX, localY, camRef.current);
    const active = manager.activeTopState;
    return {
      x: stagePt.x + active.cameraPos.x,
      y: stagePt.y + active.cameraPos.y,
    };
  };

  const handleCanvasPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const pt = toStageCoords(e.clientX, e.clientY);
    const manager = managerRef.current;
    if (!pt || !manager) return;
    inputRef.current.pointerX = pt.x;
    inputRef.current.pointerY = pt.y;
    const hit = pickInteractiveUiAt(pt.x, pt.y, manager.activeTopState.scene.objects);
    manager.setHoveredObject(hit?.id ?? null);
    setHoverUi(Boolean(hit));
  };

  const pointerStartRef = useRef<{ x: number; y: number } | null>(null);

  const handleCanvasPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.button !== 0) return;
    const pt = toStageCoords(e.clientX, e.clientY);
    const manager = managerRef.current;
    if (!pt || !manager) return;
    inputRef.current.pointerX = pt.x;
    inputRef.current.pointerY = pt.y;
    inputRef.current.pointerDown = true;
    inputRef.current.pointerJustPressed = true;
    pointerStartRef.current = { x: e.clientX, y: e.clientY };
    const hit = pickInteractiveUiAt(pt.x, pt.y, manager.activeTopState.scene.objects);
    if (hit) {
      manager.dispatchClick(hit.id);
    }
  };

  const handleCanvasPointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    inputRef.current.pointerDown = false;
    inputRef.current.pointerJustReleased = true;
    if (pointerStartRef.current) {
      const dx = e.clientX - pointerStartRef.current.x;
      const dy = e.clientY - pointerStartRef.current.y;
      if (Math.hypot(dx, dy) >= 36) {
        if (Math.abs(dx) > Math.abs(dy)) {
          inputRef.current.swipeDir = dx > 0 ? 'right' : 'left';
        } else {
          inputRef.current.swipeDir = dy > 0 ? 'down' : 'up';
        }
      }
      pointerStartRef.current = null;
    }
  };

  const handleStepFrame = () => {
    const manager = managerRef.current;
    if (!manager) return;
    setPaused(true);
    const sounds = manager.step(FIXED_DT, inputRef.current);
    flushSounds(sounds);
    renderSnapshot(manager);
  };

  const handleRestartScene = () => {
    const manager = managerRef.current;
    if (!manager) return;
    manager.restartCurrentScene('none');
    renderSnapshot(manager);
  };

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex flex-col bg-[#0b0b0e]"
      role="dialog"
      aria-modal="true"
      aria-label="Vista previa del escenario"
    >
      <header className="flex h-11 shrink-0 items-center justify-between gap-2 border-b border-[#2a2a32] bg-[#16161a] px-3">
        <div className="flex min-w-0 items-center gap-2 text-xs">
          <span className="truncate font-semibold text-zinc-100">
            {projectName}
          </span>
          <span className="text-zinc-500" aria-hidden="true">·</span>
          <span className="truncate text-zinc-300">
            {hudState.activeSceneName}
            {hudState.overlayNames.length > 0
              ? ` (+ ${hudState.overlayNames.join(', ')})`
              : ''}
          </span>
          <span className="hidden md:inline font-mono text-[11px] tabular-nums text-zinc-500">
            {hudState.fps} FPS
          </span>
        </div>

        <div className="flex items-center gap-1.5 shrink-0">
          <div className="rounded border border-emerald-500/40 bg-emerald-500/10 px-2 py-1 font-mono text-xs font-semibold tabular-nums text-emerald-300">
            Puntos: {hudState.score}
          </div>

          <button
            type="button"
            onClick={() => setPaused((p) => !p)}
            title={paused ? 'Reanudar simulación' : 'Pausar simulación'}
            className="inline-flex items-center gap-1 rounded border border-[#343440] bg-[#222229] px-2.5 py-1 text-xs font-medium text-zinc-200 hover:bg-[#2d2d37]"
          >
            {paused ? <Play className="h-3.5 w-3.5 text-emerald-400" /> : <Pause className="h-3.5 w-3.5 text-amber-400" />}
            <span className="hidden sm:inline">{paused ? 'Reanudar' : 'Pausar'}</span>
          </button>

          <button
            type="button"
            onClick={handleStepFrame}
            title="Avanzar 1 fotograma fijo (1/60s)"
            className="inline-flex items-center gap-1 rounded border border-[#343440] bg-[#222229] px-2 py-1 text-xs font-medium text-zinc-200 hover:bg-[#2d2d37]"
          >
            <StepForward className="h-3.5 w-3.5" />
            <span className="hidden lg:inline">+1f</span>
          </button>

          <button
            type="button"
            onClick={handleRestartScene}
            title="Reiniciar escena actual"
            className="inline-flex items-center gap-1 rounded border border-[#343440] bg-[#222229] px-2 py-1 text-xs font-medium text-zinc-200 hover:bg-[#2d2d37]"
          >
            <RotateCcw className="h-3.5 w-3.5" />
          </button>

          <button
            type="button"
            onClick={() => setShowDebugColliders((v) => !v)}
            aria-pressed={showDebugColliders}
            title="Ver hitboxes y sensores en vivo"
            className={`inline-flex items-center gap-1 rounded border px-2 py-1 text-xs font-medium ${
              showDebugColliders
                ? 'border-emerald-500/50 bg-emerald-500/20 text-emerald-300'
                : 'border-[#343440] bg-[#222229] text-zinc-300 hover:bg-[#2d2d37]'
            }`}
          >
            <Scan className="h-3.5 w-3.5" />
            <span className="hidden md:inline">Colisiones</span>
          </button>

          <button
            type="button"
            onClick={() => setShowDebugger((v) => !v)}
            aria-pressed={showDebugger}
            title="Abrir inspector de variables y estado en vivo"
            className={`inline-flex items-center gap-1 rounded border px-2 py-1 text-xs font-medium ${
              showDebugger
                ? 'border-sky-500/50 bg-sky-500/20 text-sky-300'
                : 'border-[#343440] bg-[#222229] text-zinc-300 hover:bg-[#2d2d37]'
            }`}
          >
            <Bug className="h-3.5 w-3.5" />
            <span className="hidden md:inline">Debug</span>
          </button>

          <button
            type="button"
            onClick={onStop}
            className="inline-flex items-center gap-1.5 rounded bg-red-600 px-3 py-1 text-xs font-semibold text-white hover:bg-red-500 whitespace-nowrap"
          >
            <Square className="h-3.5 w-3.5 fill-current" />
            <span>Detener (Esc)</span>
          </button>
        </div>
      </header>

      <div className="flex min-h-0 flex-1 overflow-hidden">
        <div
          ref={hostRef}
          data-testid="nexus-preview-canvas-host"
          onPointerMove={handleCanvasPointerMove}
          onPointerDown={handleCanvasPointerDown}
          onPointerUp={handleCanvasPointerUp}
          className={`flex-1 overflow-hidden ${hoverUi ? 'cursor-pointer' : 'cursor-default'}`}
        />

        {showDebugger && (
          <aside className="w-64 shrink-0 border-l border-[#2a2a32] bg-[#141419] p-3 text-xs overflow-y-auto space-y-3">
            <div>
              <div className="text-[10px] font-bold uppercase tracking-wider text-sky-400">
                Estado de ejecución
              </div>
              <div className="mt-1 space-y-1 font-mono text-[11px] text-zinc-300">
                <div>FPS: {hudState.fps}</div>
                <div>Escena: {hudState.activeSceneName}</div>
                <div>Overlays: {hudState.overlayNames.length}</div>
                <div>Objetos: {hudState.objectCount}</div>
              </div>
            </div>

            <div>
              <div className="text-[10px] font-bold uppercase tracking-wider text-emerald-400">
                Variables en vivo
              </div>
              {hudState.varsList.length === 0 ? (
                <p className="mt-1 text-[11px] text-zinc-500">Sin variables activas.</p>
              ) : (
                <div className="mt-1 space-y-1">
                  {hudState.varsList.map(([k, v]) => (
                    <div
                      key={k}
                      className="flex items-center justify-between rounded border border-[#282832] bg-[#1a1a21] px-2 py-1 font-mono text-[11px]"
                    >
                      <span className="truncate text-zinc-400">{k}</span>
                      <span className="text-zinc-100">{v}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </aside>
        )}
      </div>
    </div>
  );
};
