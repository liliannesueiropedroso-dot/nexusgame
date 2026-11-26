import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Bug,
  Eye,
  Gamepad2,
  Globe,
  Pause,
  Play,
  RotateCcw,
  Save,
  Scan,
  Square,
  StepForward,
  Wifi,
} from 'lucide-react';
import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { Reflector } from 'three/examples/jsm/objects/Reflector.js';
import { loadModel3DFromBlob, retargetClipForRoot } from '../../engine/three3d/modelLoader';
import {
  buildWaterTrailRibbonBuffers,
  createRippleRingPool,
  createWaterTrailState,
  sampleWaterWaveHeightAt,
  spawnRippleInPool,
  stepRippleRingPool,
  updateWaterTrailPoints,
  type WaterTrailState,
} from '../../engine/three3d/waterEffects';
import { sharedAudioEngine } from '../../engine/audio/audioEngine';
import { fitCameraToViewport } from '../../engine/camera/camera2d';
import { screenToStage } from '../../engine/core/math';
import type {
  AudioBusSettings,
  CameraState,
  DataTableDef,
  DialogueGraph,
  GameObjectData,
  I18nConfig,
  I18nLocale,
  ProjectVariable,
  SceneData,
  StageResolution,
  TouchControlsConfig,
} from '../../engine/core/types';
import { pollPrimaryGamepad } from '../../engine/input/virtualJoystick';
import { MultiplayerClient } from '../../engine/multiplayer/multiplayerClient';
import { createSimulation3DState } from '../../engine/physics3d/physics3d';
import {
  buildWorldTrimeshData,
  extractWorldTrimeshFromObject3D,
} from '../../engine/physics3d/trimeshCollider';
import { pickInteractiveUiAt } from '../../engine/renderer2d/hitTest';
import { PixiStageRenderer } from '../../engine/renderer2d/PixiStageRenderer';
import { RuntimeSceneManager } from '../../engine/runtime/sceneManager';
import { FIXED_DT, type InputState } from '../../engine/runtime/stepGameSimulation';
import { type WidgetBridgeCallbacks } from '../../engine/scripting/scriptRuntime';
import { buildModularGeometry } from '../../engine/three3d/geometryBuilders';
import {
  computeDayNightLighting,
  createSkyDomeMesh,
  createWaterSurfaceMesh,
  createWindFoliageInstancedMesh,
  groundHeightAt,
} from '../../engine/three3d/terrainSystem';
import {
  detectSoftwareWebGL,
  ResourceDisposer,
} from '../../engine/three3d/resourceDisposer';
import {
  buildHlodProxyVisual,
  type BuiltHlodVisual,
} from '../../engine/three3d/hlodBuilder';
import {
  AssetStreamingManager,
  getBudgetLimitsForProfile,
  resolveStreamingConfig,
} from '../../engine/streaming/worldStreaming';
import {
  advanceDialogueChoice,
  createActiveDialogueState,
  stepDialogueTypewriter,
  type ActiveDialogueState,
} from '../../engine/dialogue/dialogueEngine';
import {
  detectBrowserLocale,
  resolveI18nText,
} from '../../engine/data/dataTableI18n';
import type {
  NexusPluginPackage,
  NexusScriptAsset,
  PrefabDefinition,
  ProjectMode,
} from '../../project/models/project';
import { UIWidgetOverlayLayer } from '../widgets/UIWidgetOverlayLayer';
import { VirtualTouchOverlay } from './VirtualTouchOverlay';

interface PreviewModalProps {
  open: boolean;
  projectName: string;
  projectMode?: ProjectMode;
  scene: SceneData;
  scenes?: SceneData[];
  initialSceneId?: string;
  prefabs?: PrefabDefinition[];
  scripts?: NexusScriptAsset[];
  plugins?: NexusPluginPackage[];
  stage: StageResolution;
  assetBlobs: Map<string, Blob>;
  variables?: ProjectVariable[];
  audioBuses?: AudioBusSettings;
  touchControls?: TouchControlsConfig;
  dialogues?: DialogueGraph[];
  dataTables?: DataTableDef[];
  i18n?: I18nConfig;
  onStop: () => void;
}

const EMPTY_PREFABS: PrefabDefinition[] = [];
const EMPTY_SCRIPTS: NexusScriptAsset[] = [];
const EMPTY_PLUGINS: NexusPluginPackage[] = [];
const EMPTY_VARS: ProjectVariable[] = [];

function createGroundGridTexture(baseHex: string): THREE.CanvasTexture | null {
  if (typeof document === 'undefined') return null;
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 256;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;
  ctx.fillStyle = baseHex || '#334155';
  ctx.fillRect(0, 0, 256, 256);
  ctx.fillStyle = 'rgba(255,255,255,0.04)';
  ctx.fillRect(0, 0, 128, 128);
  ctx.fillRect(128, 128, 128, 128);
  ctx.strokeStyle = 'rgba(148,163,184,0.22)';
  ctx.lineWidth = 2;
  ctx.strokeRect(1, 1, 254, 254);
  ctx.strokeStyle = 'rgba(148,163,184,0.12)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(128, 0);
  ctx.lineTo(128, 256);
  ctx.moveTo(0, 128);
  ctx.lineTo(256, 128);
  ctx.stroke();
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(14, 14);
  tex.anisotropy = 4;
  return tex;
}

const EMPTY_DIALOGUES: DialogueGraph[] = [];
const EMPTY_TABLES: DataTableDef[] = [];

export const PreviewModal: React.FC<PreviewModalProps> = ({
  open,
  projectName,
  projectMode = '2d',
  scene,
  scenes,
  initialSceneId,
  prefabs = EMPTY_PREFABS,
  scripts = EMPTY_SCRIPTS,
  plugins = EMPTY_PLUGINS,
  stage,
  assetBlobs,
  variables = EMPTY_VARS,
  audioBuses,
  touchControls,
  dialogues = EMPTY_DIALOGUES,
  dataTables = EMPTY_TABLES,
  i18n,
  onStop,
}) => {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const fpsBadgeRef = useRef<HTMLSpanElement | null>(null);
  const fpsDebuggerRef = useRef<HTMLDivElement | null>(null);
  const managerRef = useRef<RuntimeSceneManager | null>(null);
  const rendererRef = useRef<PixiStageRenderer | null>(null);
  const sim3dRef = useRef<ReturnType<typeof createSimulation3DState> | null>(null);
  const switch3dSceneRef = useRef<((sceneIdOrName: string) => void) | null>(null);
  const restart3dSceneRef = useRef<(() => void) | null>(null);

  const camRef = useRef<CameraState>({ x: 0, y: 0, zoom: 1 });
  const inputRef = useRef<InputState>({
    left: false,
    right: false,
    up: false,
    down: false,
    jump: false,
  });
  const touchAxisRef = useRef({ x: 0, y: 0 });
  const touchBtnsRef = useRef({
    jump: false,
    prevJump: false,
    action: false,
    prevAction: false,
    dash: false,
    prevDash: false,
  });

  const [paused, setPaused] = useState(false);
  const [vehicleHudPrompt, setVehicleHudPrompt] = useState<string | null>(null);
  const [showDebugColliders, setShowDebugColliders] = useState(false);
  const [showTouchOverlay, setShowTouchOverlay] = useState(() => Boolean(touchControls?.enabledByDefault));
  const [showDebugger, setShowDebugger] = useState(false);
  const [showLiveInspector, setShowLiveInspector] = useState(false);
  const [inspectedObjId, setInspectedObjId] = useState<string | null>(null);
  const [liveObjectSnapshots, setLiveObjectSnapshots] = useState<
    Array<{
      id: string;
      name: string;
      type: string;
      visible: boolean;
      x: number;
      y: number;
      z?: number;
      vx: number;
      vy: number;
      vz?: number;
      grounded?: boolean;
      animState?: string;
      hp?: number;
      maxHp?: number;
      tags: string[];
    }>
  >([]);
  const [activeLocale, setActiveLocale] = useState<I18nLocale>(() =>
    i18n?.autoDetectBrowser ? detectBrowserLocale(i18n.defaultLocale) : (i18n?.defaultLocale ?? 'es')
  );
  const [activeDialogue, setActiveDialogue] = useState<ActiveDialogueState | null>(null);
  const [portraitUrl, setPortraitUrl] = useState<string | null>(null);
  const activeDialogueRef = useRef<ActiveDialogueState | null>(null);
  activeDialogueRef.current = activeDialogue;
  const activeLocaleRef = useRef<I18nLocale>(activeLocale);
  activeLocaleRef.current = activeLocale;
  const showDebuggerRef = useRef(showDebugger);
  showDebuggerRef.current = showDebugger;
  const showLiveInspectorRef = useRef(showLiveInspector);
  showLiveInspectorRef.current = showLiveInspector;
  const [hoverUi, setHoverUi] = useState(false);
  const [hostSize, setHostSize] = useState({ w: stage.width, h: stage.height });
  const [liveBuses, setLiveBuses] = useState<AudioBusSettings>(() =>
    audioBuses
      ? structuredClone(audioBuses)
      : {
          master: 1,
          music: 0.8,
          sfx: 1,
          ui: 1,
          muted: { master: false, music: false, sfx: false, ui: false },
        }
  );
  const [hiddenWidgetIds, setHiddenWidgetIds] = useState<Set<string>>(() => new Set());
  const [liveObjects, setLiveObjects] = useState<GameObjectData[]>(() => scene.objects);
  const [liveVarsMap, setLiveVarsMap] = useState<Map<string, unknown>>(() => new Map());
  const [liveCamera, setLiveCamera] = useState<CameraState>({ x: 0, y: 0, zoom: 1 });
  const [scriptOverlayUi, setScriptOverlayUi] = useState<{
    toasts: Array<{ id: string; text: string; kind?: 'info' | 'warn' | 'error'; remaining?: number }>;
    widgets: Array<{
      id: string;
      html?: string;
      text?: string;
      x: number;
      y: number;
      width?: number;
      height?: number;
      css?: string;
      visible?: boolean;
      style?: Record<string, string>;
    }>;
  }>({ toasts: [], widgets: [] });

  const [hudState, setHudState] = useState({
    score: 0,
    fps: 60,
    activeSceneName: scene.name,
    overlayNames: [] as string[],
    objectCount: scene.objects.length,
    varsList: [] as Array<[string, string]>,
    runtimeLogs: [] as string[],
  });
  const [streamingHud, setStreamingHud] = useState<{
    enabled: boolean;
    loadedChunks: number;
    hlodActive: number;
    residentAssets: number;
    residentMB: number;
    unloadedAssets: number;
  }>({
    enabled: false,
    loadedChunks: 0,
    hlodActive: 0,
    residentAssets: 0,
    residentMB: 0,
    unloadedAssets: 0,
  });
  const [mpStatus, setMpStatus] = useState<{ connected: boolean; roomId: string; playerCount: number }>({
    connected: false,
    roomId: '',
    playerCount: 0,
  });
  const mpClientRef = useRef<MultiplayerClient | null>(null);

  const pausedRef = useRef(paused);
  pausedRef.current = paused;
  const showCollidersRef = useRef(showDebugColliders);
  showCollidersRef.current = showDebugColliders;
  const onStopRef = useRef(onStop);
  onStopRef.current = onStop;

  useEffect(() => {
    if (open) {
      setShowTouchOverlay(Boolean(touchControls?.enabledByDefault));
      setActiveDialogue(null);
      setActiveLocale(i18n?.autoDetectBrowser ? detectBrowserLocale(i18n.defaultLocale) : (i18n?.defaultLocale ?? 'es'));
    }
  }, [open, touchControls?.enabledByDefault, i18n]);

  useEffect(() => {
    const assetId = activeDialogue?.portraitAssetId;
    if (!assetId) {
      setPortraitUrl(null);
      return;
    }
    const blob = assetBlobs.get(assetId);
    if (!blob) {
      setPortraitUrl(null);
      return;
    }
    const url = URL.createObjectURL(blob);
    setPortraitUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [activeDialogue?.portraitAssetId, assetBlobs]);

  const translateKey = (key: string) => resolveI18nText(i18n, key, activeLocaleRef.current);

  const openDialogueById = (dialogueId: string) => {
    const graph = dialogues.find((d) => d.id === dialogueId || d.name === dialogueId);
    if (!graph) return;
    const rawVars: Record<string, unknown> = {};
    const targetMap =
      projectMode === '3d' ? sim3dRef.current?.variables : managerRef.current?.activeTopState.variables;
    if (targetMap) {
      for (const [k, v] of targetMap.entries()) rawVars[k] = v;
    }
    const st = createActiveDialogueState(graph, graph.startNodeId, rawVars, translateKey);
    if (st) setActiveDialogue(st);
  };

  useEffect(() => {
    if (!activeDialogue || activeDialogue.finishedTyping) return;
    let lastT = performance.now();
    const id = window.setInterval(() => {
      const now = performance.now();
      const dSec = (now - lastT) / 1000;
      lastT = now;
      setActiveDialogue((prev) => (prev ? stepDialogueTypewriter(prev, dSec) : null));
    }, 32);
    return () => clearInterval(id);
  }, [activeDialogue?.graphId, activeDialogue?.nodeId, activeDialogue?.finishedTyping]);

  const handleAdvanceDialogue = (choiceIndex: number | null) => {
    const cur = activeDialogueRef.current;
    if (!cur) return;
    const graph = dialogues.find((d) => d.id === cur.graphId);
    if (!graph) {
      setActiveDialogue(null);
      return;
    }
    const rawVars: Record<string, unknown> = {};
    const targetMap =
      projectMode === '3d' ? sim3dRef.current?.variables : managerRef.current?.activeTopState.variables;
    if (targetMap) {
      for (const [k, v] of targetMap.entries()) rawVars[k] = v;
    }
    const nextSt = advanceDialogueChoice(
      graph,
      cur,
      choiceIndex,
      rawVars,
      (evName) => {
        if (projectMode === '3d') sim3dRef.current?.emitEvent(evName);
        else managerRef.current?.activeTopState.emittedEvents.push(evName);
      },
      translateKey
    );
    if (targetMap) {
      for (const [k, v] of Object.entries(rawVars)) {
        if (typeof v === 'number' || typeof v === 'boolean' || typeof v === 'string') {
          targetMap.set(k, v);
        }
      }
      setLiveVarsMap(new Map(targetMap));
    }
    setActiveDialogue(nextSt);
  };

  const sceneList = useMemo(
    () => (scenes && scenes.length > 0 ? scenes : [scene]),
    [scenes, scene]
  );
  const startId = initialSceneId || scene.id;

  const runtimePropsRef = useRef({
    projectName,
    startId,
    sceneList,
    prefabs,
    scripts,
    plugins,
    stage,
    assetBlobs,
    variables,
    audioBuses,
    dialogues,
    dataTables,
    i18n,
  });
  runtimePropsRef.current = {
    projectName,
    startId,
    sceneList,
    prefabs,
    scripts,
    plugins,
    stage,
    assetBlobs,
    variables,
    audioBuses,
    dialogues,
    dataTables,
    i18n,
  };

  const applyUiCommand = (
    op: 'open' | 'close' | 'toggle',
    target: string,
    objs: GameObjectData[]
  ) => {
    const matched = objs.find(
      (o) => o.type === 'ui_widget' && (o.id === target || o.name === target)
    );
    const key = matched?.id ?? target;
    setHiddenWidgetIds((prev) => {
      const next = new Set(prev);
      if (op === 'open') next.delete(key);
      else if (op === 'close') next.add(key);
      else {
        if (next.has(key)) next.delete(key);
        else next.add(key);
      }
      return next;
    });
  };

  const widgetBridge: WidgetBridgeCallbacks = useMemo(
    () => ({
      onSetVariable: (name, value) => {
        if (projectMode === '3d' && sim3dRef.current) {
          sim3dRef.current.variables.set(name, value);
          setLiveVarsMap(new Map(sim3dRef.current.variables));
        } else if (managerRef.current) {
          managerRef.current.activeTopState.variables.set(name, value);
          setLiveVarsMap(new Map(managerRef.current.activeTopState.variables));
        }
      },
      onAddVariable: (name, delta) => {
        const targetVars =
          projectMode === '3d'
            ? sim3dRef.current?.variables
            : managerRef.current?.activeTopState.variables;
        if (!targetVars) return;
        const curr = Number(targetVars.get(name) ?? 0);
        targetVars.set(name, curr + delta);
        setLiveVarsMap(new Map(targetVars));
      },
      onGetVariable: (name) => {
        const targetVars =
          projectMode === '3d'
            ? sim3dRef.current?.variables
            : managerRef.current?.activeTopState.variables;
        return targetVars?.get(name);
      },
      onPlayAudio: (assetIdOrPreset, channel = 'ui') => {
        const blob = assetBlobs.get(assetIdOrPreset);
        if (blob) {
          void sharedAudioEngine.playAssetBlob(assetIdOrPreset, blob, {
            channel,
            volume: 0.85,
          });
        } else {
          sharedAudioEngine.playSynthPreset(
            (assetIdOrPreset as 'coin' | 'jump' | 'hit' | 'powerup' | 'step' | 'win') || 'coin',
            channel,
            { volume: 0.85 }
          );
        }
      },
      onAudioBusVolume: (bus, volume) => {
        sharedAudioEngine.setChannelVolume(bus, volume);
        setLiveBuses((prev) => ({ ...prev, [bus]: volume }));
      },
      onLoadScene: (sceneIdOrName) => {
        if (projectMode === '3d') {
          switch3dSceneRef.current?.(sceneIdOrName);
        } else if (managerRef.current) {
          const found = sceneList.find(
            (s) => s.id === sceneIdOrName || s.name === sceneIdOrName
          );
          if (found) managerRef.current.loadScene(found.id, 'fadeBlack');
        }
      },
      onNextLevel: () => {
        if (projectMode === '3d') {
          restart3dSceneRef.current?.();
        } else {
          managerRef.current?.nextLevel('fadeBlack');
        }
      },
      onRestartScene: () => {
        if (projectMode === '3d') {
          restart3dSceneRef.current?.();
        } else {
          managerRef.current?.restartCurrentScene('none');
        }
      },
      onPauseToggle: () => setPaused((p) => !p),
      onEmitEvent: (eventName) => {
        if (projectMode === '3d') {
          sim3dRef.current?.emitEvent(eventName);
        } else if (managerRef.current) {
          managerRef.current.activeTopState.emittedEvents.push(eventName);
        }
      },
      onToggleInterface: (target, open) => {
        const objs =
          projectMode === '3d'
            ? (sim3dRef.current?.objects.map((o) => o.source) ?? [])
            : (managerRef.current?.activeTopState.scene.objects ?? []);
        const op = open === true ? 'open' : open === false ? 'close' : 'toggle';
        applyUiCommand(op, target, objs);
      },
    }),
    [projectMode, assetBlobs, sceneList]
  );

  const flushSounds = (
    sounds: ReturnType<RuntimeSceneManager['step']>,
    listenerPos?: { x: number; y: number }
  ) => {
    for (const snd of sounds) {
      if (snd.kind === 'setVolume' && snd.setChannel && snd.volume !== undefined) {
        sharedAudioEngine.setChannelVolume(snd.setChannel, snd.volume);
      } else if (snd.kind === 'musicStop') {
        sharedAudioEngine.stopMusic();
      } else if (snd.kind === 'stopAll') {
        sharedAudioEngine.stopAll();
      } else if (snd.kind === 'musicPlay' && snd.assetId) {
        const blob = assetBlobs.get(snd.assetId);
        if (blob) {
          void sharedAudioEngine.playMusicAsset(snd.assetId, blob, {
            volume: snd.volume,
            loop: snd.loop ?? true,
            pitch: snd.pitch,
            keepIfSame: snd.keepIfSame ?? true,
            crossfadeSec: 1.5,
          });
        }
      } else if (snd.kind === 'synth' && snd.preset) {
        sharedAudioEngine.playSynthPreset(snd.preset, snd.channel, {
          volume: snd.volume,
          pitch: snd.pitch,
        });
      } else if (snd.kind === 'asset' && snd.assetId) {
        const blob = assetBlobs.get(snd.assetId);
        if (blob) {
          const spatial =
            snd.spatialX !== undefined && listenerPos
              ? {
                  mode: '2d' as const,
                  x: snd.spatialX,
                  y: snd.spatialY ?? listenerPos.y,
                  listenerX: listenerPos.x,
                  listenerY: listenerPos.y,
                  maxDistance: Math.max(stage.width, 720),
                }
              : undefined;
          void sharedAudioEngine.playAssetBlob(snd.assetId, blob, {
            channel: snd.channel,
            volume: snd.volume,
            pitch: snd.pitch,
            loop: snd.loop,
            spatial,
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

    const mpRemotes = mpClientRef.current?.getRemotePlayers(sim.scene.id) ?? [];
    const sceneForRender: SceneData =
      mpRemotes.length === 0
        ? sim.scene
        : {
            ...sim.scene,
            objects: [
              ...sim.scene.objects,
              ...mpRemotes.map(
                (rp): GameObjectData => ({
                  id: `__net_remote_${rp.playerId}`,
                  name: rp.name,
                  type: 'rectangle',
                  parentId: null,
                  visible: true,
                  locked: false,
                  opacity: 1,
                  layer: 'Default',
                  tags: ['net_remote'],
                  transform: {
                    x: rp.x,
                    y: rp.y,
                    rotation: rp.rotY || 0,
                    scaleX: 1,
                    scaleY: 1,
                    width: 34,
                    height: 46,
                    anchorX: 0.5,
                    anchorY: 0.5,
                  },
                  rectangle: {
                    fillColor: '#38bdf8',
                    strokeColor: '#f8fafc',
                    strokeWidth: 2,
                    cornerRadius: 8,
                  },
                  colliders: [],
                  components: [],
                })
              ),
            ],
          };

    renderer.renderImmediate({
      scene: sceneForRender,
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

  // ==================== BUCLE DE PREVIEW 2D (PixiJS + Widgets + Scripts) ====================
  useEffect(() => {
    if (!open || projectMode !== '2d') return;
    const snap = runtimePropsRef.current;
    sharedAudioEngine.setBusSettings(snap.audioBuses);
    sharedAudioEngine.unlock();
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
      sharedAudioEngine.unlock();
      if (e.key === 'Escape') {
        onStopRef.current();
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
      if (e.code === 'Space') input.jump = true;
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

    const storagePrefix = `nexus_persist_${snap.projectName.replace(/[^a-zA-Z0-9_-]/g, '_')}_`;
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
        } catch {}
      },
    };

    const manager = new RuntimeSceneManager({
      scenes: snap.sceneList,
      initialSceneId: snap.startId,
      variables: snap.variables,
      prefabs: snap.prefabs,
      scripts: snap.scripts,
      plugins: snap.plugins,
      stage: snap.stage,
      storageAdapter,
    });
    managerRef.current = manager;

    // Conectar multijugador WebSocket si la escena o algún objeto tiene replicación
    const mpConf2d = manager.activeTopState.scene.multiplayer;
    const hasNetComp2d = manager.activeTopState.scene.objects.some(
      (o) => o.net?.replicated || o.components.some((c) => c.enabled && c.type.startsWith('net.'))
    );
    const localPlayerId2d = `p2d_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
    let mpClient2d: MultiplayerClient | null = null;
    if (mpConf2d?.enabled || hasNetComp2d) {
      mpClient2d = new MultiplayerClient((st) => setMpStatus(st));
      mpClientRef.current = mpClient2d;
      mpClient2d.connect({
        roomId: mpConf2d?.roomId || 'sala_global',
        playerId: localPlayerId2d,
        playerName: `Jugador_${localPlayerId2d.slice(-4)}`,
        mode: '2d',
        sceneId: manager.activeTopState.scene.id,
        maxPlayers: mpConf2d?.maxPlayers ?? 16,
        syncRateHz: mpConf2d?.syncRateHz ?? 12,
        url: mpConf2d?.serverUrl || undefined,
        bus: manager.activeTopState.wiringSys?.bus,
      });
    } else {
      mpClientRef.current = null;
      setMpStatus({ connected: false, roomId: '', playerCount: 0 });
    }

    // Inicializar visibilidad inicial de widgets
    const initHidden = new Set<string>();
    for (const o of manager.activeTopState.scene.objects) {
      if (o.type === 'ui_widget' && o.uiWidget && o.uiWidget.visibleAtStart === false) {
        initHidden.add(o.id);
      }
    }
    setHiddenWidgetIds(initHidden);
    setLiveObjects(manager.activeTopState.scene.objects);
    setLiveVarsMap(new Map(manager.activeTopState.variables));

    const updateCam = () => {
      const rect = host.getBoundingClientRect();
      setHostSize({ w: Math.max(1, rect.width), h: Math.max(1, rect.height) });
      camRef.current = fitCameraToViewport(rect.width, rect.height, runtimePropsRef.current.stage, 24);
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
      let last2dSceneId = manager.activeTopState.scene.id;
      let lastHudSig = '';
      let lastVarsSig = '';
      let lastUiOvSig = '';

      const loop = (now: number) => {
        if (!mounted) return;
        const dt = Math.min(0.1, Math.max(0, (now - lastTime) / 1000));
        lastTime = now;

        const cur2dSceneId = manager.activeTopState.scene.id;
        if (cur2dSceneId !== last2dSceneId) {
          last2dSceneId = cur2dSceneId;
          const nextHidden = new Set<string>();
          for (const o of manager.activeTopState.scene.objects) {
            if (o.type === 'ui_widget' && o.uiWidget && o.uiWidget.visibleAtStart === false) {
              nextHidden.add(o.id);
            }
          }
          setHiddenWidgetIds(nextHidden);
          setLiveObjects([...manager.activeTopState.scene.objects]);
        }

        if (!pausedRef.current && !activeDialogueRef.current) {
          // Fusionar teclado + joystick virtual multitáctil + Gamepad real
          const pad = pollPrimaryGamepad(touchControls?.deadzone ?? 0.18);
          const tx = Math.abs(touchAxisRef.current.x) > 0.05 ? touchAxisRef.current.x : pad.axisX;
          const ty = Math.abs(touchAxisRef.current.y) > 0.05 ? touchAxisRef.current.y : pad.axisY;
          const kLeft = pressedSet.has('ArrowLeft') || pressedSet.has('KeyA');
          const kRight = pressedSet.has('ArrowRight') || pressedSet.has('KeyD');
          const kUp = pressedSet.has('ArrowUp') || pressedSet.has('KeyW');
          const kDown = pressedSet.has('ArrowDown') || pressedSet.has('KeyS');
          const kJump = pressedSet.has('Space');
          const kAct1 = pressedSet.has('KeyZ') || pressedSet.has('KeyJ') || pressedSet.has('KeyE');
          const kAct2 = pressedSet.has('KeyX') || pressedSet.has('KeyK') || pressedSet.has('ShiftLeft');

          input.axisX = tx;
          input.axisY = ty;
          input.left = kLeft || tx < -0.22;
          input.right = kRight || tx > 0.22;
          input.up = kUp || ty < -0.22;
          input.down = kDown || ty > 0.22;
          input.jump = kJump || touchBtnsRef.current.jump || pad.jump;
          input.action1 = kAct1 || touchBtnsRef.current.action || pad.action;
          input.action2 = kAct2 || touchBtnsRef.current.dash || pad.dash;

          if (touchBtnsRef.current.dash || pad.dash) pressedSet.add('ShiftLeft');
          else if (!kAct2) pressedSet.delete('ShiftLeft');

          const sounds = manager.step(dt, input);
          input.pointerJustPressed = false;
          input.pointerJustReleased = false;
          input.swipeDir = null;
          const camP = manager.activeTopState.cameraPos;
          flushSounds(sounds, {
            x: camP.x + snap.stage.width * 0.5,
            y: camP.y + snap.stage.height * 0.5,
          });

          if (manager.activeTopState.pendingDialogueId) {
            const dId = manager.activeTopState.pendingDialogueId;
            manager.activeTopState.pendingDialogueId = null;
            openDialogueById(dId);
          }
          if (manager.activeTopState.pendingLocale) {
            const loc = manager.activeTopState.pendingLocale;
            manager.activeTopState.pendingLocale = null;
            setActiveLocale(loc);
          }

          const cmds = manager.activeTopState.pendingUiCommands;
          if (cmds && cmds.length > 0) {
            const drained = cmds.splice(0, cmds.length);
            for (const c of drained) {
              applyUiCommand(c.op, c.target, manager.activeTopState.scene.objects);
            }
          }

          if (manager.activeTopState.pendingPauseToggle) {
            manager.activeTopState.pendingPauseToggle = false;
            setPaused((p) => !p);
          }

          if (mpClient2d && mpClient2d.isConnected()) {
            const actor2d = manager.activeTopState.scene.objects.find((o) =>
              o.components.some(
                (c) =>
                  c.enabled &&
                  (c.type === 'player_platformer' ||
                    c.type === 'player_topdown' ||
                    c.type === 'movement.platformer_pro' ||
                    c.type === 'movement.topdown_8dir' ||
                    c.type === 'net.entity_sync')
              )
            );
            if (actor2d) {
              const b2d = manager.activeTopState.bodies.get(actor2d.id);
              const rawFsm = actor2d.sprite?.animation?.fsmActiveState;
              const animState =
                typeof rawFsm === 'string'
                  ? rawFsm
                  : rawFsm?.stateName ?? 'Idle';
              mpClient2d.sendLocalTransform({
                x: actor2d.transform.x,
                y: actor2d.transform.y,
                rotY: actor2d.transform.rotation,
                vx: b2d?.vx ?? 0,
                vy: b2d?.vy ?? 0,
                animState,
                sceneId: manager.activeTopState.scene.id,
              });
            }
          }
        }

        renderSnapshot(manager);

        frameAcc += 1;
        hudTimer += dt;
        if (hudTimer >= 0.16) {
          if (hudTimer > 0) fpsVal = Math.round(frameAcc / hudTimer);
          frameAcc = 0;
          hudTimer = 0;

          if (fpsBadgeRef.current) fpsBadgeRef.current.textContent = `${fpsVal} FPS`;
          if (fpsDebuggerRef.current) fpsDebuggerRef.current.textContent = `FPS: ${fpsVal}`;

          const active = manager.activeTopState;
          const pts = Number(active.variables.get('puntos') ?? 0);
          const score = Math.max(active.score, Number.isFinite(pts) ? pts : 0);

          let varsSig = '';
          for (const [k, v] of active.variables.entries()) varsSig += `${k}=${v};`;
          if (varsSig !== lastVarsSig) {
            lastVarsSig = varsSig;
            setLiveVarsMap(new Map(active.variables));
          }

          const toasts = active.dynamicToasts ?? [];
          const widgets = active.dynamicWidgets ?? [];
          const uiOvSig = `${toasts.map((t) => `${t.id}:${t.text}`).join('|')}#${widgets.map((w) => `${w.id}:${w.visible}:${w.x},${w.y}:${(w as { text?: string }).text ?? ''}`).join('|')}`;
          if (uiOvSig !== lastUiOvSig) {
            lastUiOvSig = uiOvSig;
            setScriptOverlayUi({ toasts: [...toasts], widgets: [...widgets] });
          }

          if (showLiveInspectorRef.current) {
            setLiveObjectSnapshots(
              active.scene.objects.map((o) => {
                const b = active.bodies.get(o.id);
                const fsm = o.sprite?.animation?.fsmActiveState;
                return {
                  id: o.id,
                  name: o.name,
                  type: o.type,
                  visible: o.visible,
                  x: Math.round(o.transform.x * 10) / 10,
                  y: Math.round(o.transform.y * 10) / 10,
                  vx: Math.round((b?.vx ?? 0) * 10) / 10,
                  vy: Math.round((b?.vy ?? 0) * 10) / 10,
                  grounded: b?.grounded,
                  animState: typeof fsm === 'string' ? fsm : fsm?.stateName ?? o.sprite?.animation?.activeClip ?? '',
                  hp: b?.health,
                  maxHp: b?.maxHealth,
                  tags: o.tags ?? [],
                };
              })
            );
          }

          const hudSig = `${score}|${manager.baseState.scene.name}|${manager.overlays.length}|${active.scene.objects.length}|${active.runtimeLogs.length}|${showDebuggerRef.current ? varsSig : ''}`;
          if (hudSig !== lastHudSig) {
            lastHudSig = hudSig;
            setHudState({
              score,
              fps: fpsVal,
              activeSceneName: manager.baseState.scene.name,
              overlayNames: manager.overlays.map((o) => o.scene.name),
              objectCount: active.scene.objects.length,
              varsList: showDebuggerRef.current
                ? Array.from(active.variables.entries()).map(([k, v]) => [k, String(v)] as [string, string])
                : [],
              runtimeLogs: [...active.runtimeLogs],
            });
          }
        }

        rafId = requestAnimationFrame(loop);
      };

      rafId = requestAnimationFrame(loop);
    });

    return () => {
      mounted = false;
      cancelAnimationFrame(rafId);
      ro.disconnect();
      mpClient2d?.disconnect();
      mpClientRef.current = null;
      renderer.destroy();
      rendererRef.current = null;
      managerRef.current = null;
      sharedAudioEngine.stopAll();
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      window.removeEventListener('blur', clearAllInputs);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [open, projectMode]);

  // ==================== BUCLE DE PREVIEW 3D (Three.js + Física 3D + IA + Particles + Widgets) ====================
  useEffect(() => {
    if (!open || projectMode !== '3d') return;
    const snap = runtimePropsRef.current;
    sharedAudioEngine.setBusSettings(snap.audioBuses);
    sharedAudioEngine.unlock();
    setPaused(false);

    const host = hostRef.current;
    if (!host) return;

    const heldKeys = new Set<string>();
    const kbHeldKeys = new Set<string>();
    const justPressedKeys = new Set<string>();
    let dragOrbitActive = false;
    let lastPointerX = 0;
    let lastPointerY = 0;
    let orbitYawDelta = 0;
    let orbitPitchDelta = 0;

    const onKeyDown = (e: KeyboardEvent) => {
      sharedAudioEngine.unlock();
      if (e.key === 'Escape') {
        onStopRef.current();
        return;
      }
      if (!heldKeys.has(e.code)) {
        justPressedKeys.add(e.code);
      }
      heldKeys.add(e.code);
      kbHeldKeys.add(e.code);
      if (e.code === 'Space' || e.code === 'ArrowUp' || e.code === 'ArrowDown') {
        e.preventDefault();
      }
    };
    const onKeyUp = (e: KeyboardEvent) => {
      heldKeys.delete(e.code);
      kbHeldKeys.delete(e.code);
    };
    const onBlur = () => {
      heldKeys.clear();
      kbHeldKeys.clear();
      justPressedKeys.clear();
    };

    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    window.addEventListener('blur', onBlur);

    const rect0 = host.getBoundingClientRect();
    const width0 = Math.max(320, rect0.width || stage.width);
    const height0 = Math.max(240, rect0.height || stage.height);
    setHostSize({ w: width0, h: height0 });

    const disposer = new ResourceDisposer();
    const probeCanvas = document.createElement('canvas');
    const probeGl =
      probeCanvas.getContext('webgl2') || probeCanvas.getContext('webgl');
    let isSoftwareProbe = false;
    try {
      const dbg = probeGl?.getExtension('WEBGL_debug_renderer_info');
      if (probeGl && dbg) {
        const rStr = String(probeGl.getParameter(dbg.UNMASKED_RENDERER_WEBGL) ?? '').toLowerCase();
        isSoftwareProbe =
          rStr.includes('swiftshader') || rStr.includes('llvmpipe') || rStr.includes('software');
      }
    } catch {
      isSoftwareProbe = false;
    }
    const initPerf =
      (sceneList.find((s) => s.id === startId) ?? sceneList[0])?.performanceProfile ??
      'balanced_60';
    const webgl = new THREE.WebGLRenderer({
      antialias: !isSoftwareProbe && initPerf !== 'ultra_fast',
      powerPreference: 'high-performance',
    });
    const software = detectSoftwareWebGL(webgl) || isSoftwareProbe;
    webgl.setPixelRatio(software ? 1 : Math.min(window.devicePixelRatio || 1, 1.5));
    webgl.setSize(width0, height0);
    webgl.outputColorSpace = THREE.SRGBColorSpace;
    webgl.toneMapping = THREE.ACESFilmicToneMapping;
    webgl.toneMappingExposure = 1.05;
    webgl.shadowMap.enabled = !software;
    webgl.shadowMap.type = THREE.PCFSoftShadowMap;
    host.appendChild(webgl.domElement);

    const threeScene = new THREE.Scene();
    const pmrem = new THREE.PMREMGenerator(webgl);
    const roomEnv = new RoomEnvironment();
    const envTarget = pmrem.fromScene(roomEnv, 0.04);
    threeScene.environment = envTarget.texture;
    roomEnv.dispose();
    pmrem.dispose();

    const camera = new THREE.PerspectiveCamera(55, width0 / height0, 0.1, 450);
    const textureLoader = new THREE.TextureLoader();

    const initVars = new Map<string, number | boolean | string>();
    for (const v of variables) initVars.set(v.name, v.initialValue);

    let currentScene3d =
      sceneList.find((s) => s.id === startId) ?? sceneList[0];

    const meshBindings = new Map<string, THREE.Object3D>();
    const lightBindings = new Map<string, THREE.Group>();
    const loadedRoots = new Map<string, THREE.Object3D>();
    const lodBindings = new Map<string, { high: THREE.Object3D; low: THREE.Object3D; dist: number; usingLow: boolean }>();
    const pendingBoneSockets: Array<{ childId: string; parentId: string; obj: GameObjectData }> = [];
    const lastFadeOpacity = new Map<string, number>();
    const collidersGroup3d = new THREE.Group();
    const mixerMap = new Map<
      string,
      {
        mixer: THREE.AnimationMixer;
        actions: Map<string, THREE.AnimationAction>;
        activeActionKey: string | null;
        activeAction: THREE.AnimationAction | null;
      }
    >();
    const worldGroup = new THREE.Group();
    threeScene.add(worldGroup);
    threeScene.add(collidersGroup3d);

    // Scratch matemáticos reutilizados cada fotograma (cero GC allocations en 60 FPS)
    const scratchColor = new THREE.Color();
    const scratchEuler = new THREE.Euler(0, 0, 0, 'XYZ');
    const scratchVec = new THREE.Vector3();
    const scratchUp = new THREE.Vector3(0, 1, 0);
    const scratchQuat = new THREE.Quaternion();
    const scratchRotQuat = new THREE.Quaternion();
    const scratchScale = new THREE.Vector3();
    const scratchMat = new THREE.Matrix4();

    // GPU Particle buffer (hasta 400 partículas)
    const MAX_GPU_PARTICLES = 400;
    const pPositions = new Float32Array(MAX_GPU_PARTICLES * 3);
    const pColors = new Float32Array(MAX_GPU_PARTICLES * 3);
    const pGeo = new THREE.BufferGeometry();
    pGeo.setAttribute('position', new THREE.BufferAttribute(pPositions, 3));
    pGeo.setAttribute('color', new THREE.BufferAttribute(pColors, 3));
    pGeo.setDrawRange(0, 0);
    const pMat = new THREE.PointsMaterial({
      size: 0.35,
      vertexColors: true,
      transparent: true,
      opacity: 0.9,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    const particlePoints = new THREE.Points(pGeo, pMat);
    particlePoints.frustumCulled = false;
    threeScene.add(particlePoints);
    disposer.trackGeometry(pGeo);
    disposer.trackMaterial(pMat);

    // Pool de Sprites 3D texturizados (para partículas con imagen PNG desde Recursos)
    const MAX_TEX_PARTICLES = 64;
    const texCache = new Map<string, THREE.Texture>();
    const getParticleTexture = (assetId: string): THREE.Texture | null => {
      if (texCache.has(assetId)) return texCache.get(assetId)!;
      const blob = assetBlobs.get(assetId);
      if (!blob) return null;
      const url = URL.createObjectURL(blob);
      const tex = textureLoader.load(url, () => URL.revokeObjectURL(url));
      tex.colorSpace = THREE.SRGBColorSpace;
      texCache.set(assetId, tex);
      disposer.trackTexture(tex);
      return tex;
    };
    const texParticleSprites: THREE.Sprite[] = [];
    for (let i = 0; i < MAX_TEX_PARTICLES; i++) {
      const spMat = disposer.trackMaterial(
        new THREE.SpriteMaterial({
          color: '#ffffff',
          transparent: true,
          depthWrite: false,
          opacity: 0.9,
        })
      );
      const sp = new THREE.Sprite(spMat);
      sp.visible = false;
      sp.frustumCulled = false;
      threeScene.add(sp);
      texParticleSprites.push(sp);
    }

    let sim3d!: ReturnType<typeof createSimulation3DState>;
    let activeSkyRef: {
      uniforms: { uZenith: { value: THREE.Color }; uHorizon: { value: THREE.Color }; uTime: { value: number }; uClouds: { value: number } };
      sun: THREE.DirectionalLight;
      hemi: THREE.HemisphereLight | null;
      ambient: THREE.AmbientLight;
      lighting: NonNullable<SceneData['lighting']>;
    } | null = null;
    const activeWaterUniforms: Array<{
      uTime: { value: number };
      uPlayerPos: { value: THREE.Vector3 };
      uSplashTime: { value: number };
    }> = [];
    const activeFoliageUniforms: Array<{
      uTime: { value: number };
      uPlayerPos: { value: THREE.Vector3 };
    }> = [];
    const softBodyVisuals = new Map<
      string,
      { nodes: THREE.Mesh[]; lines?: THREE.LineSegments }
    >();
    const vehicleWheelVisuals = new Map<string, THREE.Mesh[]>();
    const hlodProxyVisuals = new Map<string, BuiltHlodVisual>();
    const assetStreamer = new AssetStreamingManager({ unloadGraceFrames: 18 });
    type StreamTexSlot = 'map' | 'normalMap' | 'roughnessMap' | 'metalnessMap' | 'emissiveMap' | 'aoMap';
    const streamedTexTargets = new Map<
      string,
      Array<{
        mat: THREE.MeshStandardMaterial | THREE.MeshPhysicalMaterial;
        slot: StreamTexSlot;
        isColor: boolean;
      }>
    >();
    const streamedGlbTargets = new Map<
      string,
      Array<{
        obj: GameObjectData;
        objState: ReturnType<typeof createSimulation3DState>['objects'][number];
        holder: THREE.Group;
        addPreviewColWireframe: (targetObj: GameObjectData, loadedGroup?: THREE.Object3D) => void;
      }>
    >();
    const cachedWaterObjs: Array<ReturnType<typeof createSimulation3DState>['objects'][number]> = [];
    let lastAssetSyncChunkGen = -1;
    let lastStreamingHudSig = '';
    let sceneTargetMaxDpr = 1.5;
    let activeAdaptiveDpr = 1.5;
    let adaptiveQualityEnabled = false;
    let lowFpsStreak = 0;
    let highFpsStreak = 0;
    const assetStreamerHooks = {
      getAssetInfo: (assetId: string) => {
        const blob = assetBlobs.get(assetId);
        const isModel = streamedGlbTargets.has(assetId);
        return {
          kind: isModel ? ('model3d' as const) : ('texture' as const),
          bytes: blob?.size ?? (isModel ? 650_000 : 262_144),
        };
      },
      onLoadAsset: async (assetId: string) => {
        const blob = assetBlobs.get(assetId);
        if (!blob) return;
        const cleanups: Array<() => void> = [];

        const texTargets = streamedTexTargets.get(assetId);
        if (texTargets && texTargets.length > 0) {
          const url = URL.createObjectURL(blob);
          try {
            const loadedTex = await new Promise<THREE.Texture>((resolve, reject) => {
              textureLoader.load(
                url,
                (t) => resolve(t),
                undefined,
                (err) => reject(err)
              );
            });
            URL.revokeObjectURL(url);
            if (texTargets.some((tg) => tg.isColor)) {
              loadedTex.colorSpace = THREE.SRGBColorSpace;
            }
            for (const tg of texTargets) {
              tg.mat[tg.slot] = loadedTex;
              if (tg.slot === 'aoMap') tg.mat.aoMapIntensity = 0.9;
              tg.mat.needsUpdate = true;
            }
            cleanups.push(() => {
              for (const tg of texTargets) {
                if (tg.mat[tg.slot] === loadedTex) {
                  tg.mat[tg.slot] = null;
                  tg.mat.needsUpdate = true;
                }
              }
              loadedTex.dispose();
            });
          } catch {
            URL.revokeObjectURL(url);
          }
        }

        const glbTargets = streamedGlbTargets.get(assetId);
        if (glbTargets && glbTargets.length > 0) {
          for (const gt of glbTargets) {
            const hyd = gt.holder.userData.hydrateGlb as
              | ((b: Blob) => Promise<(() => void) | void>)
              | undefined;
            if (hyd) {
              const fn = await hyd(blob);
              if (typeof fn === 'function') cleanups.push(fn);
            }
          }
        }

        return () => {
          for (const c of cleanups) c();
        };
      },
    };
    const disposeObject3DTree = (root: THREE.Object3D) => {
      root.traverse((node) => {
        const m = node as THREE.Mesh;
        if (m.geometry) m.geometry.dispose();
        if (m.material) {
          const mats = Array.isArray(m.material) ? m.material : [m.material];
          for (const mat of mats) {
            const rec = mat as unknown as Record<string, unknown>;
            for (const k of ['map', 'normalMap', 'roughnessMap', 'metalnessMap', 'emissiveMap', 'alphaMap', 'aoMap']) {
              const t = rec[k];
              if (t && typeof (t as THREE.Texture).dispose === 'function') {
                (t as THREE.Texture).dispose();
              }
            }
            mat.dispose();
          }
        }
      });
    };

    // Pool de anillos de ondas en agua (zero-GC) + estelas Ribbon Trail
    const ripplePool = createRippleRingPool(24);
    const rippleMeshes: THREE.Mesh[] = [];
    const rippleGeo = disposer.trackGeometry(new THREE.RingGeometry(0.45, 0.72, 24));
    rippleGeo.rotateX(-Math.PI / 2);
    for (let i = 0; i < ripplePool.length; i++) {
      const rMat = disposer.trackMaterial(
        new THREE.MeshBasicMaterial({
          color: '#e0f2fe',
          transparent: true,
          opacity: 0,
          depthWrite: false,
          side: THREE.DoubleSide,
        })
      );
      const rm = new THREE.Mesh(rippleGeo, rMat);
      rm.visible = false;
      rm.frustumCulled = false;
      threeScene.add(rm);
      rippleMeshes.push(rm);
    }

    const wakeTrails = new Map<
      string,
      {
        state: WaterTrailState;
        posArr: Float32Array;
        alphaArr: Float32Array;
        mesh: THREE.Mesh;
      }
    >();
    const MAX_WAKE_VERTS = 26 * 6;
    const ensureWakeTrailMesh = (key: string) => {
      const existing = wakeTrails.get(key);
      if (existing) return existing;
      const posArr = new Float32Array(MAX_WAKE_VERTS * 3);
      const alphaArr = new Float32Array(MAX_WAKE_VERTS);
      const geom = disposer.trackGeometry(new THREE.BufferGeometry());
      geom.setAttribute('position', new THREE.BufferAttribute(posArr, 3));
      geom.setAttribute('color', new THREE.BufferAttribute(new Float32Array(MAX_WAKE_VERTS * 3).fill(1), 3));
      geom.setDrawRange(0, 0);
      const mat = disposer.trackMaterial(
        new THREE.MeshBasicMaterial({
          color: '#e0f2fe',
          transparent: true,
          opacity: 0.42,
          depthWrite: false,
          side: THREE.DoubleSide,
        })
      );
      const mesh = new THREE.Mesh(geom, mat);
      mesh.frustumCulled = false;
      worldGroup.add(mesh);
      const entry = {
        state: createWaterTrailState(26, 2.2),
        posArr,
        alphaArr,
        mesh,
      };
      wakeTrails.set(key, entry);
      return entry;
    };

    let syncedSpawnVersion = 0;
    let sceneSunLight: THREE.DirectionalLight | null = null;
    const applyLoopModeToAction = (
      act: THREE.AnimationAction,
      loopMode: 'LoopRepeat' | 'LoopOnce' | 'LoopPingPong' | undefined
    ) => {
      if (loopMode === 'LoopOnce') {
        act.setLoop(THREE.LoopOnce, 1);
        act.clampWhenFinished = true;
      } else if (loopMode === 'LoopPingPong') {
        act.setLoop(THREE.LoopPingPong, Infinity);
        act.clampWhenFinished = false;
      } else {
        act.setLoop(THREE.LoopRepeat, Infinity);
        act.clampWhenFinished = false;
      }
    };

    const buildThreeWorldForScene = (targetScene: SceneData) => {
      const perfProfile = targetScene.performanceProfile ?? 'balanced_60';
      const maxDpr = perfProfile === 'ultra_fast' ? 1 : perfProfile === 'high_quality' ? 2 : 1.5;
      sceneTargetMaxDpr = software ? 1 : Math.min(window.devicePixelRatio || 1, maxDpr);
      activeAdaptiveDpr = sceneTargetMaxDpr;
      adaptiveQualityEnabled =
        perfProfile === 'balanced_60' ||
        targetScene.objects.some((o) =>
          o.components.some((c) => c.enabled && c.type === 'portal.adaptive_quality')
        );
      lowFpsStreak = 0;
      highFpsStreak = 0;
      lastAssetSyncChunkGen = -1;
      lastStreamingHudSig = '';
      webgl.setPixelRatio(sceneTargetMaxDpr);

      // Limpiar mundo anterior sin destruir renderer
      while (worldGroup.children.length > 0) {
        const ch = worldGroup.children[0];
        worldGroup.remove(ch);
      }
      while (collidersGroup3d.children.length > 0) {
        collidersGroup3d.remove(collidersGroup3d.children[0]);
      }
      meshBindings.clear();
      lightBindings.clear();
      loadedRoots.clear();
      lodBindings.clear();
      pendingBoneSockets.length = 0;
      lastFadeOpacity.clear();
      mixerMap.clear();
      activeWaterUniforms.length = 0;
      activeFoliageUniforms.length = 0;
      softBodyVisuals.clear();
      vehicleWheelVisuals.clear();
      for (const hv of hlodProxyVisuals.values()) {
        worldGroup.remove(hv.group);
        hv.dispose();
      }
      hlodProxyVisuals.clear();
      assetStreamer.disposeAll();
      streamedTexTargets.clear();
      streamedGlbTargets.clear();
      wakeTrails.clear();
      for (const rm of rippleMeshes) rm.visible = false;
      for (const r of ripplePool) r.active = false;
      activeSkyRef = null;
      syncedSpawnVersion = 0;

      threeScene.background = new THREE.Color(targetScene.backgroundColor || '#131622');
      threeScene.environment = envTarget.texture;
      const lighting = targetScene.lighting ?? {
        ambientColor: '#b7c7e8',
        ambientIntensity: 0.48,
        smartBounce: true,
        bounceIntensity: 0.65,
        skyColor: '#8cb8ff',
        groundColor: '#2d2722',
        sunColor: '#fff5dd',
        sunIntensity: 1.45,
        fogEnabled: true,
        fogColor: targetScene.backgroundColor || '#131622',
        fogNear: 22,
        fogFar: 95,
      };
      if (lighting.skyDomeAssetId) {
        const skyBlob = assetBlobs.get(lighting.skyDomeAssetId);
        if (skyBlob) {
          const url = URL.createObjectURL(skyBlob);
          textureLoader.load(url, (skyTex) => {
            skyTex.mapping = THREE.EquirectangularReflectionMapping;
            skyTex.colorSpace = THREE.SRGBColorSpace;
            threeScene.background = skyTex;
            threeScene.environment = skyTex;
            disposer.trackTexture(skyTex);
            URL.revokeObjectURL(url);
          });
        }
      }
      const dnInit = lighting.dayNightEnabled ? computeDayNightLighting(lighting) : null;
      threeScene.fog = lighting.fogEnabled
        ? new THREE.Fog(dnInit ? dnInit.fogColor : lighting.fogColor, lighting.fogNear, lighting.fogFar)
        : null;

      const ambient = new THREE.AmbientLight(
        dnInit ? dnInit.ambientColor : lighting.ambientColor,
        dnInit ? dnInit.ambientIntensity : lighting.ambientIntensity
      );
      worldGroup.add(ambient);

      let hemi: THREE.HemisphereLight | null = null;
      if (lighting.smartBounce || lighting.dayNightEnabled) {
        hemi = new THREE.HemisphereLight(
          dnInit ? dnInit.zenithColor : lighting.skyColor,
          lighting.groundColor,
          lighting.bounceIntensity
        );
        hemi.position.set(0, 30, 0);
        worldGroup.add(hemi);
      }

      const sun = new THREE.DirectionalLight(
        dnInit ? dnInit.sunColor : lighting.sunColor,
        dnInit ? dnInit.sunIntensity : lighting.sunIntensity
      );
      sceneSunLight = sun;
      if (dnInit) {
        sun.position.set(...dnInit.sunPosition);
      } else {
        sun.position.set(16, 28, 14);
      }
      if (!software) {
        sun.castShadow = true;
        sun.shadow.mapSize.set(1024, 1024);
        sun.shadow.camera.near = 1;
        sun.shadow.camera.far = 110;
        sun.shadow.camera.left = -28;
        sun.shadow.camera.right = 28;
        sun.shadow.camera.top = 28;
        sun.shadow.camera.bottom = -28;
      }
      worldGroup.add(sun);

      // Horizonte infinito opcional cuando un terreno tiene infiniteHorizon activado
      const infTerrain = targetScene.objects.find(
        (o) => o.type === 'mesh_3d' && o.mesh3d?.shape === 'terrain' && o.mesh3d.terrainData?.infiniteHorizon
      );
      if (infTerrain) {
        const hGeo = disposer.trackGeometry(new THREE.PlaneGeometry(900, 900));
        hGeo.rotateX(-Math.PI / 2);
        const hMat = disposer.trackMaterial(
          new THREE.MeshStandardMaterial({
            color: infTerrain.mesh3d?.terrainData?.horizonColor || '#334155',
            roughness: 0.95,
            metalness: 0.02,
          })
        );
        const hPlane = new THREE.Mesh(hGeo, hMat);
        hPlane.position.y = -0.18;
        hPlane.receiveShadow = !software;
        worldGroup.add(hPlane);
      }

      if (lighting.dayNightEnabled && dnInit) {
        const skyRes = createSkyDomeMesh(
          dnInit.zenithColor,
          dnInit.horizonColor,
          lighting.cloudsEnabled !== false
        );
        disposer.trackGeometry(skyRes.mesh.geometry);
        disposer.trackMaterial(skyRes.mesh.material);
        worldGroup.add(skyRes.mesh);
        activeSkyRef = {
          uniforms: skyRes.uniforms,
          sun,
          hemi,
          ambient,
          lighting,
        };
      }

      const obstaclePositions: THREE.Vector3[] = [];
      for (const o of targetScene.objects) {
        if (
          o.visible &&
          o.type === 'mesh_3d' &&
          o.mesh3d?.shape !== 'water' &&
          o.mesh3d?.shape !== 'terrain' &&
          o.mesh3d?.shape !== 'grass_field' &&
          o.mesh3d?.shape !== 'plane' &&
          o.transform3d
        ) {
          obstaclePositions.push(new THREE.Vector3(o.transform3d.x, o.transform3d.y, o.transform3d.z));
        }
      }

      // Música de fondo de la escena 3D (con crossfade suave si cambia de pista)
      const bgm = targetScene.backgroundMusic;
      if (bgm?.assetId && bgm.autoPlay !== false) {
        const blob = assetBlobs.get(bgm.assetId);
        if (blob) {
          void sharedAudioEngine.playMusicAsset(bgm.assetId, blob, {
            volume: bgm.volume ?? 0.8,
            loop: bgm.loop !== false,
            keepIfSame: bgm.keepPlayingIfSameTrack !== false,
            crossfadeSec: 1.5,
          });
        }
      } else {
        sharedAudioEngine.stopMusic();
      }

      sim3d = createSimulation3DState(
        targetScene,
        scripts,
        initVars,
        {
          playSfx: (idOrPreset, vol = 0.8, spatialPos) => {
            const blob = assetBlobs.get(idOrPreset);
            const cs = sim3dRef.current?.cameraState;
            const spatial =
              spatialPos && cs
                ? {
                    mode: '3d' as const,
                    x: spatialPos.x,
                    y: spatialPos.y,
                    z: spatialPos.z,
                    listenerX: cs.posX,
                    listenerY: cs.posY,
                    listenerZ: cs.posZ,
                    maxDistance: 45,
                  }
                : undefined;
            if (blob) {
              void sharedAudioEngine.playAssetBlob(idOrPreset, blob, {
                channel: 'sfx',
                volume: vol,
                spatial,
              });
            } else {
              sharedAudioEngine.playSynthPreset(
                (idOrPreset as 'coin' | 'jump' | 'hit' | 'powerup' | 'step' | 'win') || 'coin',
                'sfx',
                { volume: vol }
              );
            }
          },
          playMusic: (assetId, vol = 0.8) => {
            const blob = assetBlobs.get(assetId);
            if (blob) {
              void sharedAudioEngine.playMusicAsset(assetId, blob, {
                volume: vol,
                loop: true,
                crossfadeSec: 1.5,
              });
            }
          },
          stopMusic: () => sharedAudioEngine.stopMusic(),
          setBusVolume: (bus, v) => sharedAudioEngine.setChannelVolume(bus, v),
          setBusMuted: (bus, m) => sharedAudioEngine.setChannelMuted(bus, m),
        },
        {
          loadScene: (idOrName) => switch3dSceneRef.current?.(idOrName),
          nextLevel: () => {
            const next = currentScene3d.nextSceneId
              ? sceneList.find((s) => s.id === currentScene3d.nextSceneId)
              : sceneList[(sceneList.findIndex((s) => s.id === currentScene3d.id) + 1) % sceneList.length];
            if (next) switch3dSceneRef.current?.(next.id);
          },
          restartScene: () => restart3dSceneRef.current?.(),
          uiControl: (op, target) => applyUiCommand(op, target, targetScene.objects),
          startDialogue: (dialogueId) => openDialogueById(dialogueId),
          setLocale: (loc) => setActiveLocale(loc),
        },
        runtimePropsRef.current.plugins
      );
      sim3dRef.current = sim3d;
      cachedWaterObjs.length = 0;
      for (const stObj of sim3d.objects) {
        if (stObj.source.type === 'mesh_3d' && stObj.source.mesh3d?.shape === 'water' && stObj.source.mesh3d.waterConfig) {
          cachedWaterObjs.push(stObj);
        }
      }

      const initH = new Set<string>();
      for (const o of targetScene.objects) {
        if (o.type === 'ui_widget' && o.uiWidget && o.uiWidget.visibleAtStart === false) {
          initH.add(o.id);
        }
      }
      setHiddenWidgetIds(initH);
      setLiveObjects([...targetScene.objects]);
      setLiveVarsMap(new Map(sim3d.variables));

      const nodeMap3d = new Map<string, THREE.Object3D>();
      // Construir mallas, contenedores y luces 3D
      for (const objState of sim3d.objects) {
        const obj = objState.source;
        if (obj.type === 'container' || obj.type === 'camera_3d') {
          const grp = new THREE.Group();
          grp.userData.objectId = obj.id;
          nodeMap3d.set(obj.id, grp);
          meshBindings.set(obj.id, grp);
        } else if (obj.type === 'mesh_3d') {
          const m3 = obj.mesh3d ?? {
            shape: 'box',
            color: '#3b82f6',
            metalness: 0.2,
            roughness: 0.65,
            castShadow: true,
            receiveShadow: true,
          };

          if (m3.shape === 'water') {
            const wCfg = m3.waterConfig ?? {
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
            const waterRes = createWaterSurfaceMesh(wCfg, obstaclePositions);
            waterRes.mesh.userData.objectId = obj.id;
            disposer.trackGeometry(waterRes.mesh.geometry);
            disposer.trackMaterial(waterRes.mesh.material);
            activeWaterUniforms.push(waterRes.uniforms);
            if (wCfg.planarReflections && !software) {
              const waterGrp = new THREE.Group();
              waterGrp.userData.objectId = obj.id;
              const reflGeo = disposer.trackGeometry(new THREE.PlaneGeometry(wCfg.width || 24, wCfg.depth || 24));
              const refl = new Reflector(reflGeo, {
                clipBias: 0.003,
                textureWidth: 256,
                textureHeight: 256,
                color: 0x557799,
              });
              refl.rotation.x = -Math.PI / 2;
              refl.position.y = -0.05;
              waterGrp.add(refl);
              waterGrp.add(waterRes.mesh);
              nodeMap3d.set(obj.id, waterGrp);
              meshBindings.set(obj.id, waterGrp);
            } else {
              nodeMap3d.set(obj.id, waterRes.mesh);
              meshBindings.set(obj.id, waterRes.mesh);
            }
          } else if (m3.shape === 'grass_field') {
            const fCfg = m3.foliageConfig ?? {
              kind: 'grass',
              instances: [],
              windStrength: 0.38,
              windSpeed: 2.4,
              interactionRadius: 1.8,
              colorBase: '#15803d',
              colorTip: '#4ade80',
            };
            const modelBlob = fCfg.modelAssetId ? assetBlobs.get(fCfg.modelAssetId) : undefined;
            if (modelBlob && fCfg.instances.length > 0) {
              const scatterGroup = new THREE.Group();
              scatterGroup.userData.objectId = obj.id;
              void loadModel3DFromBlob(modelBlob, undefined, { normalizeSize: 1.0 })
                .then((loaded) => {
                  let srcGeo: THREE.BufferGeometry | null = null;
                  let srcMat: THREE.Material | null = null;
                  loaded.root.traverse((ch) => {
                    if (!srcGeo && (ch as THREE.Mesh).isMesh) {
                      const cm = ch as THREE.Mesh;
                      srcGeo = cm.geometry;
                      srcMat = Array.isArray(cm.material) ? cm.material[0] : cm.material;
                    }
                  });
                  if (!srcGeo || !srcMat) return;
                  const instMesh = new THREE.InstancedMesh(srcGeo, srcMat, fCfg.instances.length);
                  instMesh.castShadow = !software;
                  instMesh.receiveShadow = !software;
                  instMesh.userData.objectId = obj.id;
                  disposer.trackGeometry(srcGeo);
                  disposer.trackMaterial(srcMat);
                  for (let idx = 0; idx < fCfg.instances.length; idx++) {
                    const inst = fCfg.instances[idx];
                    if (fCfg.alignToNormal) {
                      const hL = groundHeightAt(targetScene, inst.x - 0.35, inst.z);
                      const hR = groundHeightAt(targetScene, inst.x + 0.35, inst.z);
                      const hD = groundHeightAt(targetScene, inst.x, inst.z - 0.35);
                      const hU = groundHeightAt(targetScene, inst.x, inst.z + 0.35);
                      scratchVec.set(hL - hR, 0.7, hD - hU).normalize();
                      scratchQuat.setFromUnitVectors(scratchUp, scratchVec);
                    } else {
                      scratchQuat.identity();
                    }
                    scratchRotQuat.setFromAxisAngle(scratchUp, inst.rotY ?? 0);
                    scratchQuat.multiply(scratchRotQuat);
                    const sc = Math.max(0.1, inst.scale ?? 1);
                    scratchScale.set(sc, sc, sc);
                    scratchVec.set(inst.x, inst.y, inst.z);
                    scratchMat.compose(scratchVec, scratchQuat, scratchScale);
                    instMesh.setMatrixAt(idx, scratchMat);
                  }
                  instMesh.instanceMatrix.needsUpdate = true;
                  scatterGroup.add(instMesh);
                })
                .catch(() => {});
              nodeMap3d.set(obj.id, scatterGroup);
              meshBindings.set(obj.id, scatterGroup);
            } else {
              const grassRes = createWindFoliageInstancedMesh(fCfg);
              grassRes.mesh.userData.objectId = obj.id;
              disposer.trackGeometry(grassRes.mesh.geometry);
              disposer.trackMaterial(grassRes.mesh.material);
              activeFoliageUniforms.push(grassRes.uniforms);
              nodeMap3d.set(obj.id, grassRes.mesh);
              meshBindings.set(obj.id, grassRes.mesh);
            }
          } else if (m3.shape === 'glb' && m3.glbAssetId) {
            const glbHolder = new THREE.Group();
            glbHolder.userData.objectId = obj.id;
            const addPreviewColWireframe = (targetObj: GameObjectData, loadedGroup?: THREE.Object3D) => {
              if (targetObj.physics3d?.enabled === false) return;
              const shape = targetObj.physics3d?.shape ?? 'box';
              if (shape === 'mesh_exact' && loadedGroup) {
                loadedGroup.position.set(objState.t3.x, objState.t3.y, objState.t3.z);
                loadedGroup.rotation.set(
                  THREE.MathUtils.degToRad(objState.t3.rx),
                  THREE.MathUtils.degToRad(objState.t3.ry),
                  THREE.MathUtils.degToRad(objState.t3.rz)
                );
                loadedGroup.scale.set(objState.t3.sx, objState.t3.sy, objState.t3.sz);
                const tri = extractWorldTrimeshFromObject3D(loadedGroup);
                if (tri && tri.triangles.length >= 9) {
                  for (let i = collidersGroup3d.children.length - 1; i >= 0; i--) {
                    if (collidersGroup3d.children[i].userData.colObjectId === targetObj.id) {
                      collidersGroup3d.remove(collidersGroup3d.children[i]);
                    }
                  }
                  const wGeo = disposer.trackGeometry(new THREE.BufferGeometry());
                  wGeo.setAttribute('position', new THREE.BufferAttribute(tri.triangles, 3));
                  const wMat = disposer.trackMaterial(
                    new THREE.MeshBasicMaterial({ color: '#06b6d4', wireframe: true, transparent: true, opacity: 0.72 })
                  );
                  const wMesh = new THREE.Mesh(wGeo, wMat);
                  wMesh.userData.colObjectId = targetObj.id;
                  wMesh.userData.isWorldBake = true;
                  collidersGroup3d.add(wMesh);
                }
                return;
              }
              const he =
                shape === 'sphere' && typeof targetObj.physics3d?.radius === 'number' && targetObj.physics3d.radius > 0
                  ? { x: targetObj.physics3d.radius, y: targetObj.physics3d.radius, z: targetObj.physics3d.radius }
                  : targetObj.physics3d?.halfExtents ?? {
                      x: Math.max(0.2, Math.abs(objState.t3.sx) * 0.5),
                      y: Math.max(0.1, Math.abs(objState.t3.sy) * 0.5),
                      z: Math.max(0.2, Math.abs(objState.t3.sz) * 0.5),
                    };
              const cGeo = disposer.trackGeometry(
                shape === 'sphere'
                  ? new THREE.SphereGeometry(Math.max(he.x, he.y, he.z), 12, 8)
                  : new THREE.BoxGeometry(he.x * 2, he.y * 2, he.z * 2)
              );
              const cEdges = disposer.trackGeometry(new THREE.EdgesGeometry(cGeo));
              const cMat = disposer.trackMaterial(
                new THREE.LineBasicMaterial({ color: targetObj.physics3d?.isTrigger ? '#f59e0b' : '#22c55e' })
              );
              const wire = new THREE.LineSegments(cEdges, cMat);
              wire.userData.colObjectId = targetObj.id;
              wire.userData.colOffset = targetObj.physics3d?.offset ?? { x: 0, y: 0, z: 0 };
              collidersGroup3d.add(wire);
            };
            addPreviewColWireframe(obj);
            const hydrateGlbForHolder = (
              targetObj: GameObjectData,
              targetState: typeof objState,
              holder: THREE.Group,
              blob: Blob
            ): Promise<(() => void) | void> => {
              let cancelled = false;
              let mountedRoot: THREE.Object3D | null = null;
              let mountedLodRoot: THREE.Object3D | null = null;
              return loadModel3DFromBlob(blob, undefined, { normalizeSize: 1.0 })
                .then((loaded) => {
                  if (cancelled) {
                    disposeObject3DTree(loaded.root);
                    return;
                  }
                  loaded.root.traverse((child) => {
                    if ((child as THREE.Mesh).isMesh) {
                      const cm = child as THREE.Mesh;
                      cm.castShadow = m3.castShadow && !software;
                      cm.receiveShadow = m3.receiveShadow && !software;
                      cm.frustumCulled = targetObj.optimization?.frustumCulling ?? true;
                      cm.userData.objectId = targetObj.id;
                    }
                  });
                  if (loaded.stats.meshes === 0 && loaded.stats.bones > 0) {
                    const skel = new THREE.SkeletonHelper(loaded.root);
                    holder.add(skel);
                  }
                  holder.add(loaded.root);
                  mountedRoot = loaded.root;
                  loadedRoots.set(targetObj.id, loaded.root);
                  if (targetObj.optimization?.lodEnabled && targetObj.optimization.lodAssetId) {
                    const lodBlob = assetBlobs.get(targetObj.optimization.lodAssetId);
                    if (lodBlob) {
                      void loadModel3DFromBlob(lodBlob, undefined, { normalizeSize: 1.0 })
                        .then((lodRes) => {
                          if (cancelled) {
                            disposeObject3DTree(lodRes.root);
                            return;
                          }
                          lodRes.root.visible = false;
                          lodRes.root.traverse((ch) => {
                            if ((ch as THREE.Mesh).isMesh) ch.userData.objectId = targetObj.id;
                          });
                          holder.add(lodRes.root);
                          mountedLodRoot = lodRes.root;
                          lodBindings.set(targetObj.id, {
                            high: loaded.root,
                            low: lodRes.root,
                            dist: Math.max(5, targetObj.optimization?.lodDistance ?? 35),
                            usingLow: false,
                          });
                        })
                        .catch(() => {});
                    }
                  }
                  const needsExactOrCamTri =
                    targetObj.physics3d?.shape === 'mesh_exact' ||
                    m3.shape === 'arch' ||
                    ((targetObj.physics3d?.bodyType ?? 'static') !== 'dynamic' &&
                      targetObj.physics3d?.cameraCollision !== 'never');
                  if (needsExactOrCamTri) {
                    holder.position.set(targetState.t3.x, targetState.t3.y, targetState.t3.z);
                    holder.rotation.set(
                      THREE.MathUtils.degToRad(targetState.t3.rx),
                      THREE.MathUtils.degToRad(targetState.t3.ry),
                      THREE.MathUtils.degToRad(targetState.t3.rz)
                    );
                    holder.scale.set(targetState.t3.sx, targetState.t3.sy, targetState.t3.sz);
                    sim3d.registerObjectTrimesh(targetObj.id, extractWorldTrimeshFromObject3D(holder));
                    if (targetObj.physics3d?.shape === 'mesh_exact' || m3.shape === 'arch') {
                      addPreviewColWireframe(targetObj, holder);
                    }
                  }

                  const stateAssetIds = Array.from(
                    new Set(
                      (targetObj.animStateMachine?.states ?? [])
                        .map((st) => st.assetId)
                        .filter((id): id is string => Boolean(id && id !== m3.glbAssetId))
                    )
                  );
                  const hasFsmStatesWithAssets = stateAssetIds.length > 0;
                  if ((loaded.animations && loaded.animations.length > 0) || hasFsmStatesWithAssets) {
                    const mixer = new THREE.AnimationMixer(loaded.root);
                    const actionMap = new Map<string, THREE.AnimationAction>();
                    for (const clip of loaded.animations) {
                      const act = mixer.clipAction(clip);
                      actionMap.set(clip.name, act);
                      if (m3.glbAssetId) {
                        actionMap.set(`${m3.glbAssetId}:${clip.name}`, act);
                        if (!actionMap.has(`__asset_first__:${m3.glbAssetId}`)) {
                          actionMap.set(`__asset_first__:${m3.glbAssetId}`, act);
                        }
                      }
                    }

                    const resolveAction = (assetId?: string | null, clipName?: string | null): THREE.AnimationAction | undefined => {
                      if (assetId && clipName && actionMap.has(`${assetId}:${clipName}`)) {
                        return actionMap.get(`${assetId}:${clipName}`);
                      }
                      if (clipName && actionMap.has(clipName)) {
                        return actionMap.get(clipName);
                      }
                      if (assetId && actionMap.has(`__asset_first__:${assetId}`)) {
                        return actionMap.get(`__asset_first__:${assetId}`);
                      }
                      if (clipName) {
                        const low = clipName.toLowerCase();
                        for (const [k, act] of actionMap.entries()) {
                          if (!k.startsWith('__asset_first__:') && k.toLowerCase() === low) return act;
                        }
                      }
                      return undefined;
                    };

                    const initKey = `${targetState.activeAnimAssetId ?? ''}:${targetState.activeClip || loaded.animations[0]?.name || ''}`;
                    const initAct =
                      resolveAction(targetState.activeAnimAssetId, targetState.activeClip) ??
                      (loaded.animations[0] ? actionMap.get(loaded.animations[0].name) : undefined);
                    if (initAct) {
                      applyLoopModeToAction(initAct, targetState.animLoopMode);
                      initAct.timeScale = targetState.animTimeScale ?? 1;
                      initAct.reset().play();
                    }

                    const mixerEntry = {
                      mixer,
                      actions: actionMap,
                      activeActionKey: initAct ? initKey : null,
                      activeAction: initAct ?? null,
                    };
                    mixerMap.set(targetObj.id, mixerEntry);

                    for (const extraId of stateAssetIds) {
                      const extraBlob = assetBlobs.get(extraId);
                      if (!extraBlob) continue;
                      void loadModel3DFromBlob(extraBlob, undefined, { normalizeSize: false })
                        .then((extraLoaded) => {
                          if (cancelled) return;
                          for (const rawClip of extraLoaded.animations) {
                            const clip = retargetClipForRoot(rawClip, loaded.root);
                            const act = mixer.clipAction(clip);
                            if (!actionMap.has(clip.name)) {
                              actionMap.set(clip.name, act);
                            }
                            actionMap.set(`${extraId}:${clip.name}`, act);
                            if (!actionMap.has(`__asset_first__:${extraId}`)) {
                              actionMap.set(`__asset_first__:${extraId}`, act);
                            }
                          }
                          if (targetState.activeAnimAssetId === extraId) {
                            mixerEntry.activeActionKey = null;
                          }
                        })
                        .catch(() => {});
                    }
                  }
                  return () => {
                    cancelled = true;
                    const mx = mixerMap.get(targetObj.id);
                    if (mx) {
                      mx.mixer.stopAllAction();
                      mixerMap.delete(targetObj.id);
                    }
                    lodBindings.delete(targetObj.id);
                    loadedRoots.delete(targetObj.id);
                    if (mountedRoot) {
                      holder.remove(mountedRoot);
                      disposeObject3DTree(mountedRoot);
                      mountedRoot = null;
                    }
                    if (mountedLodRoot) {
                      holder.remove(mountedLodRoot);
                      disposeObject3DTree(mountedLodRoot);
                      mountedLodRoot = null;
                    }
                    while (holder.children.length > 0) {
                      const rem = holder.children[0];
                      holder.remove(rem);
                      disposeObject3DTree(rem);
                    }
                  };
                })
                .catch(() => {});
            };

            if (targetScene.worldStreaming?.enabled) {
              const list = streamedGlbTargets.get(m3.glbAssetId) ?? [];
              list.push({ obj, objState, holder: glbHolder, addPreviewColWireframe });
              streamedGlbTargets.set(m3.glbAssetId, list);
              glbHolder.userData.hydrateGlb = (b: Blob) =>
                hydrateGlbForHolder(obj, objState, glbHolder, b);
            } else {
              const blob = assetBlobs.get(m3.glbAssetId);
              if (blob) {
                void hydrateGlbForHolder(obj, objState, glbHolder, blob);
              }
            }
            nodeMap3d.set(obj.id, glbHolder);
            meshBindings.set(obj.id, glbHolder);
          } else {
            const isTerrain = m3.shape === 'terrain';
            const geom = buildModularGeometry(m3);
            const cc = m3.clearcoat ?? 0;
            const trans = software ? 0 : (m3.transmission ?? 0);
            const usePhysical = cc > 0 || trans > 0;
            const matParams = {
              color: new THREE.Color(
                isTerrain || (m3.shape === 'plane' && !m3.textureAssetId)
                  ? '#ffffff'
                  : m3.color || '#3b82f6'
              ),
              vertexColors: isTerrain,
              metalness: isTerrain ? 0.04 : m3.metalness ?? 0.2,
              roughness: isTerrain ? 0.88 : m3.roughness ?? 0.65,
              emissive: m3.emissive ? new THREE.Color(m3.emissive) : new THREE.Color(0x000000),
              emissiveIntensity: m3.emissiveIntensity ?? 0,
              envMapIntensity: 1.15,
              transparent: obj.opacity < 1 || trans > 0,
              opacity: obj.opacity,
            };
            const mat: THREE.MeshStandardMaterial | THREE.MeshPhysicalMaterial = usePhysical
              ? new THREE.MeshPhysicalMaterial({
                  ...matParams,
                  clearcoat: cc,
                  clearcoatRoughness: m3.clearcoatRoughness ?? 0.12,
                  transmission: trans,
                  ior: 1.48,
                })
              : new THREE.MeshStandardMaterial(matParams);

            const registerOrBindTex = (
              assetId: string | null | undefined,
              slot: StreamTexSlot,
              isColor: boolean,
              assign: (tex: THREE.Texture) => void
            ) => {
              if (!assetId) return;
              if (targetScene.worldStreaming?.enabled) {
                const list = streamedTexTargets.get(assetId) ?? [];
                list.push({ mat, slot, isColor });
                streamedTexTargets.set(assetId, list);
                return;
              }
              const blob = assetBlobs.get(assetId);
              if (!blob) return;
              const url = URL.createObjectURL(blob);
              textureLoader.load(url, (tex) => {
                if (isColor) tex.colorSpace = THREE.SRGBColorSpace;
                assign(tex);
                mat.needsUpdate = true;
                disposer.trackTexture(tex);
                URL.revokeObjectURL(url);
              });
            };

            if (m3.textureAssetId) {
              registerOrBindTex(m3.textureAssetId, 'map', true, (tex) => { mat.map = tex; });
            } else if (m3.shape === 'plane') {
              const gridTex = createGroundGridTexture(m3.color || '#334155');
              if (gridTex) {
                mat.map = gridTex;
                mat.needsUpdate = true;
                disposer.trackTexture(gridTex);
              }
            }
            registerOrBindTex(m3.normalAssetId, 'normalMap', false, (tex) => { mat.normalMap = tex; });
            registerOrBindTex(m3.roughnessAssetId, 'roughnessMap', false, (tex) => { mat.roughnessMap = tex; });
            registerOrBindTex(m3.metalnessAssetId, 'metalnessMap', false, (tex) => { mat.metalnessMap = tex; });
            registerOrBindTex(m3.emissiveAssetId, 'emissiveMap', true, (tex) => { mat.emissiveMap = tex; });
            if (m3.aoAssetId) {
              if (geom.attributes.uv && !geom.attributes.uv2) {
                geom.setAttribute('uv2', geom.attributes.uv);
              }
              registerOrBindTex(m3.aoAssetId, 'aoMap', false, (tex) => {
                mat.aoMap = tex;
                mat.aoMapIntensity = 0.9;
              });
            }
            const mesh = new THREE.Mesh(geom, mat);
            mesh.castShadow = m3.castShadow && !software;
            mesh.receiveShadow = m3.receiveShadow && !software;
            mesh.frustumCulled = obj.optimization?.frustumCulling ?? true;
            mesh.userData.objectId = obj.id;
            disposer.trackGeometry(geom);
            disposer.trackMaterial(mat);
            nodeMap3d.set(obj.id, mesh);
            meshBindings.set(obj.id, mesh);

            // Wireframe de colisión 3D en Preview
            if (obj.physics3d?.enabled !== false && !isTerrain) {
              const shape = obj.physics3d?.shape ?? 'box';
              if (shape === 'mesh_exact' || m3.shape === 'arch') {
                const tri = buildWorldTrimeshData(obj);
                if (tri && tri.triangles.length >= 9) {
                  const wGeo = disposer.trackGeometry(new THREE.BufferGeometry());
                  wGeo.setAttribute('position', new THREE.BufferAttribute(tri.triangles, 3));
                  const wMat = disposer.trackMaterial(
                    new THREE.MeshBasicMaterial({ color: '#06b6d4', wireframe: true, transparent: true, opacity: 0.72 })
                  );
                  const wMesh = new THREE.Mesh(wGeo, wMat);
                  wMesh.userData.colObjectId = obj.id;
                  wMesh.userData.isWorldBake = true;
                  collidersGroup3d.add(wMesh);
                }
              } else {
                const he =
                  shape === 'sphere' && typeof obj.physics3d?.radius === 'number' && obj.physics3d.radius > 0
                    ? { x: obj.physics3d.radius, y: obj.physics3d.radius, z: obj.physics3d.radius }
                    : obj.physics3d?.halfExtents ?? {
                        x: Math.max(0.2, Math.abs(objState.t3.sx) * 0.5),
                        y: Math.max(0.1, Math.abs(objState.t3.sy) * 0.5),
                        z: Math.max(0.2, Math.abs(objState.t3.sz) * 0.5),
                      };
                const cGeo = disposer.trackGeometry(
                  shape === 'sphere'
                    ? new THREE.SphereGeometry(Math.max(he.x, he.y, he.z), 12, 8)
                    : new THREE.BoxGeometry(he.x * 2, he.y * 2, he.z * 2)
                );
                const cEdges = disposer.trackGeometry(new THREE.EdgesGeometry(cGeo));
                const cMat = disposer.trackMaterial(
                  new THREE.LineBasicMaterial({ color: obj.physics3d?.isTrigger ? '#f59e0b' : '#22c55e' })
                );
                const wire = new THREE.LineSegments(cEdges, cMat);
                wire.userData.colObjectId = obj.id;
                wire.userData.colOffset = obj.physics3d?.offset ?? { x: 0, y: 0, z: 0 };
                wire.position.set(objState.t3.x, objState.t3.y, objState.t3.z);
                collidersGroup3d.add(wire);
              }
            }
          }
        } else if (obj.type === 'light_3d' && obj.light3d) {
          const l3 = obj.light3d;
          const holder = new THREE.Group();
          holder.position.set(objState.t3.x, objState.t3.y, objState.t3.z);
          holder.rotation.set(
            THREE.MathUtils.degToRad(objState.t3.rx),
            THREE.MathUtils.degToRad(objState.t3.ry),
            THREE.MathUtils.degToRad(objState.t3.rz)
          );
          if (l3.lightType === 'spot') {
            const spot = new THREE.SpotLight(
              l3.color,
              l3.intensity,
              l3.distance,
              THREE.MathUtils.degToRad(l3.angleDeg),
              l3.penumbra,
              l3.decay
            );
            if (!software && l3.castShadow) spot.castShadow = true;
            spot.target.position.set(0, -1, 0);
            holder.add(spot);
            holder.add(spot.target);
          } else if (l3.lightType === 'directional') {
            const dir = new THREE.DirectionalLight(l3.color, l3.intensity);
            if (!software && l3.castShadow) dir.castShadow = true;
            dir.target.position.set(0, -1, 0);
            holder.add(dir);
            holder.add(dir.target);
          } else {
            const pt = new THREE.PointLight(l3.color, l3.intensity, l3.distance, l3.decay);
            if (!software && l3.castShadow) pt.castShadow = true;
            holder.add(pt);
          }
          nodeMap3d.set(obj.id, holder);
          lightBindings.set(obj.id, holder);
        }
      }

      // Mallas visuales para cuerpos blandos (Verlet Soft-Body) y ruedas de Vehículo 4W
      for (const [sbId, sbSim] of sim3d.softBodySims.entries()) {
        const nGeo = disposer.trackGeometry(new THREE.SphereGeometry(sbSim.radius, 8, 6));
        const nMat = disposer.trackMaterial(
          new THREE.MeshStandardMaterial({ color: sbSim.color, roughness: 0.5 })
        );
        const nodeMeshes: THREE.Mesh[] = [];
        for (const n of sbSim.nodes) {
          const nm = new THREE.Mesh(nGeo, nMat);
          nm.position.set(n.x, n.y, n.z);
          worldGroup.add(nm);
          nodeMeshes.push(nm);
        }
        let lineSegs: THREE.LineSegments | undefined;
        if (sbSim.constraints.length > 0) {
          const posArr = new Float32Array(sbSim.constraints.length * 6);
          const lGeo = disposer.trackGeometry(new THREE.BufferGeometry());
          lGeo.setAttribute('position', new THREE.BufferAttribute(posArr, 3));
          const lMat = disposer.trackMaterial(new THREE.LineBasicMaterial({ color: sbSim.color }));
          lineSegs = new THREE.LineSegments(lGeo, lMat);
          lineSegs.frustumCulled = false;
          worldGroup.add(lineSegs);
        }
        softBodyVisuals.set(sbId, { nodes: nodeMeshes, lines: lineSegs });
      }

      for (const [vehId] of sim3d.vehicleSims.entries()) {
        const srcObj = targetScene.objects.find((o) => o.id === vehId);
        const vCfg = srcObj?.vehicle;
        const kind = vCfg?.vehicleKind ?? 'car';
        const parts = vCfg?.parts;
        if (parts) {
          for (const partId of [
            parts.wheelFL,
            parts.wheelFR,
            parts.wheelRL,
            parts.wheelRR,
            parts.propellerId,
            parts.tailRotorId,
          ]) {
            if (!partId) continue;
            const partNode = nodeMap3d.get(partId);
            if (partNode) partNode.userData.vehicleAnimatedPart = true;
          }
        }
        // Solo crear ruedas procedurales de respaldo si es auto/moto sin hijos de rueda asignados
        if ((kind === 'car' || kind === 'moto') && !parts?.wheelFL) {
          const wRadius = Math.max(0.18, vCfg?.wheelRadius ?? 0.42);
          const wWidth = Math.max(0.12, vCfg?.wheelWidth ?? (kind === 'moto' ? 0.22 : 0.3));
          const wGeo = disposer.trackGeometry(new THREE.CylinderGeometry(wRadius, wRadius, wWidth, 12));
          wGeo.rotateZ(Math.PI / 2);
          const wMat = disposer.trackMaterial(
            new THREE.MeshStandardMaterial({ color: '#18181b', roughness: 0.85, metalness: 0.15 })
          );
          const wheelCount = kind === 'moto' ? 2 : 4;
          const wheels: THREE.Mesh[] = [];
          for (let i = 0; i < wheelCount; i++) {
            const wm = new THREE.Mesh(wGeo, wMat);
            worldGroup.add(wm);
            wheels.push(wm);
          }
          vehicleWheelVisuals.set(vehId, wheels);
        }
      }

      // Vincular jerarquía 3D padre-hijo real en el grafo Three.js + registrar boneSockets
      for (const objState of sim3d.objects) {
        const node = nodeMap3d.get(objState.id);
        if (!node) continue;
        const pid = objState.source.parentId;
        if (pid && pid !== objState.id && nodeMap3d.has(pid)) {
          nodeMap3d.get(pid)!.add(node);
          if (objState.source.boneSocket?.boneName) {
            pendingBoneSockets.push({
              childId: objState.id,
              parentId: pid,
              obj: objState.source,
            });
          }
        } else {
          worldGroup.add(node);
        }
      }
    };

    switch3dSceneRef.current = (idOrName: string) => {
      const next = sceneList.find((s) => s.id === idOrName || s.name === idOrName);
      if (next) {
        currentScene3d = next;
        buildThreeWorldForScene(next);
      }
    };
    restart3dSceneRef.current = () => {
      buildThreeWorldForScene(currentScene3d);
    };

    buildThreeWorldForScene(currentScene3d);

    const raycaster = new THREE.Raycaster();
    const ndc = new THREE.Vector2();

    const onPointerDown = (e: PointerEvent) => {
      sharedAudioEngine.unlock();
      if (e.button === 0) {
        dragOrbitActive = true;
        lastPointerX = e.clientX;
        lastPointerY = e.clientY;

        const r = webgl.domElement.getBoundingClientRect();
        ndc.x = ((e.clientX - r.left) / r.width) * 2 - 1;
        ndc.y = -((e.clientY - r.top) / r.height) * 2 + 1;
        raycaster.setFromCamera(ndc, camera);
        const hits = raycaster.intersectObjects(Array.from(meshBindings.values()), true);
        if (hits.length > 0 && sim3dRef.current) {
          let curr: THREE.Object3D | null = hits[0].object;
          while (curr && !curr.userData.objectId) curr = curr.parent;
          if (curr?.userData.objectId) {
            const clickedId = String(curr.userData.objectId);
            sim3dRef.current.triggerObjectClick(clickedId);
            if (showLiveInspectorRef.current) {
              setInspectedObjId(clickedId);
            }
          }
        }
      }
    };
    const onPointerMove = (e: PointerEvent) => {
      if (!dragOrbitActive) return;
      const dx = e.clientX - lastPointerX;
      const dy = e.clientY - lastPointerY;
      lastPointerX = e.clientX;
      lastPointerY = e.clientY;
      const sim = sim3dRef.current;
      const camObj = sim
        ? sim.objects.find((o) => o.id === sim.cameraState.activeCameraId) ??
          sim.objects.find((o) => o.type === 'camera_3d')
        : undefined;
      const invertY = Boolean(
        camObj?.source.camera3d?.invertY ?? currentScene3d.cameraConfig?.smartCamera?.invertY ?? false
      );
      orbitYawDelta -= dx * 0.35;
      // Arrastrar ratón arriba (dy < 0) sube la mirada (pitch +) salvo que invertY sea true
      orbitPitchDelta += (invertY ? dy : -dy) * 0.25;
    };
    const onPointerUp = () => {
      dragOrbitActive = false;
    };
    const onWheel = (e: WheelEvent) => {
      const sim = sim3dRef.current;
      if (!sim) return;
      e.preventDefault();
      const camObj =
        sim.objects.find((o) => o.id === sim.cameraState.activeCameraId) ??
        sim.objects.find((o) => o.type === 'camera_3d');
      if (camObj?.source.camera3d) {
        camObj.source.camera3d.distance = Math.max(
          1.5,
          Math.min(65, (camObj.source.camera3d.distance || 10) + e.deltaY * 0.01)
        );
      } else if (currentScene3d.cameraConfig?.smartCamera) {
        currentScene3d.cameraConfig.smartCamera.distance = Math.max(
          1.5,
          Math.min(65, (currentScene3d.cameraConfig.smartCamera.distance || 10) + e.deltaY * 0.01)
        );
      } else {
        sim.cameraState.fov = Math.max(25, Math.min(95, (sim.cameraState.fov || 55) + e.deltaY * 0.03));
      }
    };

    webgl.domElement.addEventListener('pointerdown', onPointerDown);
    webgl.domElement.addEventListener('wheel', onWheel, { passive: false });
    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerup', onPointerUp);

    const ro = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const w = Math.max(100, entry.contentRect.width);
        const h = Math.max(100, entry.contentRect.height);
        setHostSize({ w, h });
        camera.aspect = w / h;
        camera.updateProjectionMatrix();
        webgl.setSize(w, h);
      }
    });
    ro.observe(host);

    let mounted = true;
    let rafId = 0;
    let softTimeoutId = 0;
    let last3dHudSig = '';
    let last3dVarsSig = '';
    let last3dUiOvSig = '';
    let lastTime = performance.now();
    let hudTimer = 0;
    let frameAcc = 0;
    let fpsVal = 60;
    const wAxisX = new THREE.Vector3(1, 0, 0);
    const wAxisY = new THREE.Vector3(0, 1, 0);
    const wSteerQ = new THREE.Quaternion();
    const wSpinQ = new THREE.Quaternion();
    const wBaseQ = new THREE.Quaternion();
    const wBaseEuler = new THREE.Euler();

    // Cliente multijugador 3D y avatares remotos
    const mpConf3d = currentScene3d.multiplayer;
    const hasNetComp3d = currentScene3d.objects.some(
      (o) => o.net?.replicated || o.components.some((c) => c.enabled && c.type.startsWith('net.'))
    );
    const localPlayerId3d = `p3d_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
    let mpClient3d: MultiplayerClient | null = null;
    const remoteAvatars3d = new Map<string, THREE.Group>();
    if (mpConf3d?.enabled || hasNetComp3d) {
      mpClient3d = new MultiplayerClient((st) => setMpStatus(st));
      mpClientRef.current = mpClient3d;
      mpClient3d.connect({
        roomId: mpConf3d?.roomId || 'sala_global',
        playerId: localPlayerId3d,
        playerName: `Jugador_${localPlayerId3d.slice(-4)}`,
        mode: '3d',
        sceneId: currentScene3d.id,
        maxPlayers: mpConf3d?.maxPlayers ?? 16,
        syncRateHz: mpConf3d?.syncRateHz ?? 12,
        url: mpConf3d?.serverUrl || undefined,
        bus: sim3d?.wiringSys?.bus,
      });
    } else {
      mpClientRef.current = null;
      setMpStatus({ connected: false, roomId: '', playerCount: 0 });
    }

    let sim3dAccumulator = 0;
    const FIXED_3D_DT = 1 / 60;

    const loop = (now: number) => {
      if (!mounted) return;
      const dt = Math.min(0.1, Math.max(0.001, (now - lastTime) / 1000));
      lastTime = now;

      if (!pausedRef.current && !activeDialogueRef.current && sim3d) {
        const pad = pollPrimaryGamepad(touchControls?.deadzone ?? 0.18);
        const mx = Math.abs(touchAxisRef.current.x) > 0.05 ? touchAxisRef.current.x : pad.axisX;
        const my = Math.abs(touchAxisRef.current.y) > 0.05 ? touchAxisRef.current.y : pad.axisY;
        const jumpPressedNow = touchBtnsRef.current.jump || pad.jump;
        if (jumpPressedNow && !touchBtnsRef.current.prevJump) {
          justPressedKeys.add('Space');
        }
        touchBtnsRef.current.prevJump = jumpPressedNow;
        if (jumpPressedNow) heldKeys.add('Space');
        else if (!kbHeldKeys.has('Space')) heldKeys.delete('Space');

        const actionNow = touchBtnsRef.current.action || pad.action;
        if (actionNow && !touchBtnsRef.current.prevAction) justPressedKeys.add('KeyE');
        touchBtnsRef.current.prevAction = actionNow;
        const dashNow = touchBtnsRef.current.dash || pad.dash;
        if (dashNow && !touchBtnsRef.current.prevDash) justPressedKeys.add('ShiftLeft');
        touchBtnsRef.current.prevDash = dashNow;

        sim3dAccumulator = Math.min(0.1, sim3dAccumulator + dt);
        let subSteps = 0;
        while (sim3dAccumulator >= FIXED_3D_DT && subSteps < 4) {
          sim3d.step({
            dt: FIXED_3D_DT,
            heldKeys,
            justPressedKeys,
            moveAxisX: mx,
            moveAxisY: my,
            orbitDeltaYawDeg: orbitYawDelta,
            orbitDeltaPitchDeg: orbitPitchDelta,
          });
          justPressedKeys.clear();
          orbitYawDelta = 0;
          orbitPitchDelta = 0;
          sim3dAccumulator -= FIXED_3D_DT;
          subSteps++;
        }
        if (subSteps === 0 && (orbitYawDelta !== 0 || orbitPitchDelta !== 0)) {
          sim3d.cameraState.orbitYawDeg += orbitYawDelta;
          sim3d.cameraState.orbitPitchDeg += orbitPitchDelta;
          orbitYawDelta = 0;
          orbitPitchDelta = 0;
        }

        collidersGroup3d.visible = showCollidersRef.current;

        const simElapsed = sim3d.getElapsedTime();
        const playerActor = sim3d.objects.find((o) =>
          o.source.components.some(
            (c) =>
              c.enabled &&
              (c.type === 'player_3d' ||
                c.type === 'player_platformer' ||
                c.type === 'player_topdown' ||
                c.type === 'movement.platformer_pro' ||
                c.type === 'movement.topdown_8dir')
          )
        );
        const splashInfo = sim3d.getLastWaterSplash();

        if (activeSkyRef) {
          activeSkyRef.uniforms.uTime.value = simElapsed;
          const speed = activeSkyRef.lighting.dayCycleSpeed ?? 0;
          if (speed > 0) {
            const curHour = (activeSkyRef.lighting.timeOfDay ?? 12.5) + simElapsed * speed;
            const dn = computeDayNightLighting(activeSkyRef.lighting, curHour);
            activeSkyRef.uniforms.uZenith.value.set(dn.zenithColor);
            activeSkyRef.uniforms.uHorizon.value.set(dn.horizonColor);
            activeSkyRef.sun.color.set(dn.sunColor);
            activeSkyRef.sun.intensity = dn.sunIntensity;
            activeSkyRef.sun.position.set(...dn.sunPosition);
            activeSkyRef.ambient.color.set(dn.ambientColor);
            activeSkyRef.ambient.intensity = dn.ambientIntensity;
            if (activeSkyRef.hemi) activeSkyRef.hemi.color.set(dn.zenithColor);
            if (threeScene.fog instanceof THREE.Fog) {
              threeScene.fog.color.set(dn.fogColor);
            }
          }
        }

        for (const wu of activeWaterUniforms) {
          wu.uTime.value = simElapsed;
          if (splashInfo) {
            wu.uPlayerPos.value.set(splashInfo.x, splashInfo.y, splashInfo.z);
            wu.uSplashTime.value = splashInfo.time;
          } else if (playerActor) {
            wu.uPlayerPos.value.set(playerActor.t3.x, playerActor.t3.y, playerActor.t3.z);
          }
        }

        for (const fu of activeFoliageUniforms) {
          fu.uTime.value = simElapsed;
          if (playerActor) {
            fu.uPlayerPos.value.set(playerActor.t3.x, playerActor.t3.y, playerActor.t3.z);
          }
        }

        // Sincronizar Cuerpos Blandos (Verlet)
        for (const [sbId, sbSim] of sim3d.softBodySims.entries()) {
          const vis = softBodyVisuals.get(sbId);
          if (!vis) continue;
          for (let i = 0; i < sbSim.nodes.length && i < vis.nodes.length; i++) {
            const n = sbSim.nodes[i];
            vis.nodes[i].position.set(n.x, n.y, n.z);
          }
          if (vis.lines && sbSim.constraints.length > 0) {
            const posAttr = vis.lines.geometry.getAttribute('position') as THREE.BufferAttribute;
            const arr = posAttr.array as Float32Array;
            for (let c = 0; c < sbSim.constraints.length; c++) {
              const con = sbSim.constraints[c];
              const a = sbSim.nodes[con.a];
              const b = sbSim.nodes[con.b];
              const base = c * 6;
              arr[base] = a.x;
              arr[base + 1] = a.y;
              arr[base + 2] = a.z;
              arr[base + 3] = b.x;
              arr[base + 4] = b.y;
              arr[base + 5] = b.z;
            }
            posAttr.needsUpdate = true;
          }
        }

        // Ondas circulares (Pooled RingGeometry) + Estelas Ribbon Trail detrás de barcos y entidades en el agua
        const waterEvents = sim3d.consumeWaterInteractionEvents();
        for (const ev of waterEvents) {
          spawnRippleInPool(ripplePool, ev.x, ev.y, ev.z, ev.kind === 'splash' ? 1.4 : 1.25);
        }
        stepRippleRingPool(ripplePool, dt);
        for (let i = 0; i < ripplePool.length; i++) {
          const rp = ripplePool[i];
          const rm = rippleMeshes[i];
          rm.visible = rp.active;
          if (rp.active) {
            rm.position.set(rp.x, rp.y, rp.z);
            rm.scale.set(rp.scale, 1, rp.scale);
            (rm.material as THREE.MeshBasicMaterial).opacity = rp.opacity;
          }
        }

        for (const wObj of cachedWaterObjs) {
          if (!wObj.visible) continue;
          const wCfg = wObj.source.mesh3d!.waterConfig!;
          if (wCfg.enableWakeTrail === false) continue;
          const targetIds = new Set<string>(wCfg.interactingEntities ?? []);
          if (targetIds.size === 0 && playerActor) targetIds.add(playerActor.id);
          for (const [vid, vs] of sim3d.vehicleSims.entries()) {
            const vSource = sim3d.objects.find((o) => o.id === vid);
            if (vSource?.source.vehicle?.vehicleKind === 'boat') targetIds.add(vid);
            void vs;
          }
          for (const eid of targetIds) {
            const ent = sim3d.objects.find((o) => o.id === eid && o.visible);
            if (!ent) continue;
            const waveY = sampleWaterWaveHeightAt(
              { id: wObj.id, x: wObj.t3.x, y: wObj.t3.y, z: wObj.t3.z, config: wCfg },
              ent.t3.x,
              ent.t3.z,
              simElapsed
            );
            if (waveY === null) continue;
            const spd = Math.hypot(ent.vx, ent.vz);
            const yaw = THREE.MathUtils.degToRad(ent.t3.ry);
            const trailEntry = ensureWakeTrailMesh(`${wObj.id}:${eid}`);
            updateWaterTrailPoints(
              trailEntry.state,
              ent.t3.x,
              waveY,
              ent.t3.z,
              Math.sin(yaw),
              Math.cos(yaw),
              spd,
              Math.max(0.45, (ent.source.physics3d?.halfExtents?.x ?? Math.abs(ent.t3.sx) * 0.5) * 0.85),
              dt
            );
            const vCount = buildWaterTrailRibbonBuffers(trailEntry.state, trailEntry.posArr, trailEntry.alphaArr);
            const posAttr = trailEntry.mesh.geometry.getAttribute('position') as THREE.BufferAttribute;
            posAttr.needsUpdate = true;
            trailEntry.mesh.geometry.setDrawRange(0, vCount);
            trailEntry.mesh.visible = vCount >= 3;
          }
        }

        // Sincronizar ruedas procedurales, ruedas hijas compuestas y hélices de Vehículos 3D
        for (const [vehId, vState] of sim3d.vehicleSims.entries()) {
          const vObj = sim3d.objects.find((o) => o.id === vehId);
          const parts = vObj?.source.vehicle?.parts;
          const wMeshes = vehicleWheelVisuals.get(vehId);
          if (wMeshes) {
            const isMoto = (vObj?.source.vehicle?.vehicleKind ?? 'car') === 'moto';
            const idxMap = isMoto ? [0, 2] : [0, 1, 2, 3];
            for (let i = 0; i < wMeshes.length; i++) {
              const w = vState.wheels[idxMap[i] ?? i];
              const wm = wMeshes[i];
              wm.position.set(w.worldX, w.worldY, w.worldZ);
              wm.rotation.set(w.spinRad, vState.yawRad - w.steerAngleRad, vState.rollRad, 'YZX');
            }
          }
          if (parts) {
            const partIds = [parts.wheelFL, parts.wheelFR, parts.wheelRL, parts.wheelRR];
            const restLen = Math.max(0.2, vObj?.source.vehicle?.suspensionRestLen ?? 0.65);
            const cosP = Math.cos(vState.pitchRad);
            const sinP = Math.sin(vState.pitchRad);
            const cosR = Math.cos(vState.rollRad);
            const sinR = Math.sin(vState.rollRad);
            const cosTilt = Math.max(0.35, cosR * cosP);
            const minLocalY = -(restLen * 1.45 + 0.35);
            const maxLocalY = restLen * 0.45 + 0.35;
            partIds.forEach((pid, idx) => {
              if (!pid) return;
              const pNode = meshBindings.get(pid);
              const pState = sim3d.objects.find((o) => o.id === pid);
              const w = vState.wheels[idx];
              if (pNode && pState && w) {
                const targetLocalY =
                  (w.worldY - vState.y - pState.t3.x * sinR * cosP + pState.t3.z * sinP) / cosTilt;
                const clampedLocalY = Math.max(minLocalY, Math.min(maxLocalY, targetLocalY));
                pNode.position.set(pState.t3.x, clampedLocalY, pState.t3.z);
                wBaseEuler.set(
                  THREE.MathUtils.degToRad(pState.t3.rx),
                  THREE.MathUtils.degToRad(pState.t3.ry),
                  THREE.MathUtils.degToRad(pState.t3.rz),
                  'XYZ'
                );
                wBaseQ.setFromEuler(wBaseEuler);
                wSpinQ.setFromAxisAngle(wAxisX, w.spinRad);
                wSteerQ.setFromAxisAngle(wAxisY, -w.steerAngleRad);
                pNode.quaternion.copy(wSteerQ).multiply(wSpinQ).multiply(wBaseQ);
              }
            });
            if (parts.propellerId) {
              const propNode = meshBindings.get(parts.propellerId);
              const propState = sim3d.objects.find((o) => o.id === parts.propellerId);
              if (propNode && propState) {
                if (vObj?.source.vehicle?.vehicleKind === 'helicopter') {
                  propNode.rotation.set(
                    THREE.MathUtils.degToRad(propState.t3.rx),
                    vState.propellerSpinRad,
                    THREE.MathUtils.degToRad(propState.t3.rz),
                    'YXZ'
                  );
                } else {
                  propNode.rotation.set(
                    THREE.MathUtils.degToRad(propState.t3.rx),
                    THREE.MathUtils.degToRad(propState.t3.ry),
                    vState.propellerSpinRad,
                    'XYZ'
                  );
                }
              }
            }
            if (parts.tailRotorId) {
              const tailNode = meshBindings.get(parts.tailRotorId);
              const tailState = sim3d.objects.find((o) => o.id === parts.tailRotorId);
              if (tailNode && tailState) {
                tailNode.rotation.set(
                  vState.propellerSpinRad * 2.1,
                  THREE.MathUtils.degToRad(tailState.t3.ry),
                  THREE.MathUtils.degToRad(tailState.t3.rz),
                  'XYZ'
                );
              }
            }
          }
        }

        // Aplicar override dinámico de sol desde nexus.lights.setSun(...)
        const sunOv = sim3d.getSunOverride();
        if (sunOv && sceneSunLight) {
          if (sunOv.color) sceneSunLight.color.set(sunOv.color);
          if (typeof sunOv.intensity === 'number') sceneSunLight.intensity = sunOv.intensity;
        }

        // Sincronizar objetos creados o destruidos en runtime (spawn.primitive / spawn.clone / destroy)
        const curSpawnVer = sim3d.getSpawnVersion();
        if (curSpawnVer !== syncedSpawnVersion) {
          syncedSpawnVersion = curSpawnVer;
          const liveIds = new Set(sim3d.objects.map((o) => o.id));
          for (const [bid, boundMesh] of meshBindings.entries()) {
            if (!liveIds.has(bid)) {
              worldGroup.remove(boundMesh);
              meshBindings.delete(bid);
            }
          }
          for (const st of sim3d.objects) {
            if (!meshBindings.has(st.id) && st.source.type === 'mesh_3d') {
              const sm3 = st.source.mesh3d ?? {
                shape: 'box' as const,
                color: '#38bdf8',
                metalness: 0.2,
                roughness: 0.65,
                castShadow: true,
                receiveShadow: true,
              };
              const sGeom = disposer.trackGeometry(buildModularGeometry(sm3));
              const sMat = disposer.trackMaterial(
                new THREE.MeshStandardMaterial({
                  color: new THREE.Color(sm3.color || '#38bdf8'),
                  metalness: sm3.metalness ?? 0.2,
                  roughness: sm3.roughness ?? 0.65,
                })
              );
              const sMesh = new THREE.Mesh(sGeom, sMat);
              sMesh.castShadow = !software;
              sMesh.receiveShadow = !software;
              sMesh.userData.objectId = st.id;
              sMesh.position.set(st.t3.x, st.t3.y, st.t3.z);
              sMesh.scale.set(st.t3.sx, st.t3.sy, st.t3.sz);
              worldGroup.add(sMesh);
              meshBindings.set(st.id, sMesh);
            }
          }
        }

        const camPos = sim3d.cameraState;

        // Resolver boneSockets pendientes en cuanto termine de cargar el modelo padre
        if (pendingBoneSockets.length > 0) {
          for (let i = pendingBoneSockets.length - 1; i >= 0; i--) {
            const bs = pendingBoneSockets[i];
            const parentRoot = loadedRoots.get(bs.parentId);
            const childNode = meshBindings.get(bs.childId);
            const targetBoneName = bs.obj.boneSocket?.boneName;
            if (parentRoot && childNode && targetBoneName) {
              const foundBone = parentRoot.getObjectByName(targetBoneName);
              if (foundBone) {
                foundBone.add(childNode);
                const sock = bs.obj.boneSocket!;
                childNode.userData.boneAttached = true;
                childNode.position.set(sock.offsetX ?? 0, sock.offsetY ?? 0, sock.offsetZ ?? 0);
                childNode.rotation.set(
                  THREE.MathUtils.degToRad(sock.rotX ?? 0),
                  THREE.MathUtils.degToRad(sock.rotY ?? 0),
                  THREE.MathUtils.degToRad(sock.rotZ ?? 0)
                );
              }
              pendingBoneSockets.splice(i, 1);
            }
          }
        }

        // Sincronizar mallas 3D, WorldStreaming (Streaming Real de Assets + HLOD Combinado/Impostors + Oclusión), optimización y mixers
        const stState = sim3d.getStreamingState();
        const stManifest = sim3d.getChunkManifest();
        const streamingOn = Boolean(currentScene3d.worldStreaming?.enabled && stState);
        if (streamingOn && stState && stManifest) {
          const chunkGen = stState.totalLoads + stState.totalUnloads;
          if (chunkGen !== lastAssetSyncChunkGen || assetStreamer.hasPendingWork()) {
            lastAssetSyncChunkGen = chunkGen;
            const sCfg = resolveStreamingConfig(currentScene3d.worldStreaming);
            const limits = getBudgetLimitsForProfile(sCfg.budgetProfile, sCfg.customBudgets);
            assetStreamer.syncChunks(
              currentScene3d,
              stManifest,
              stState,
              assetStreamerHooks,
              {
                maxAssetLoadsPerFrame: Math.max(2, sCfg.maxLoadsPerFrame * 2),
                budgetLimits: limits,
              }
            );
          }
        }

        if (streamingOn && stState && currentScene3d.worldStreaming?.enableHlod !== false) {
          const farLimit = currentScene3d.worldStreaming?.farProxyRadius ?? 340;
          for (const [cKey, proxy] of stState.hlodProxies.entries()) {
            const loadedChunk = stState.loaded.get(cKey);
            const distToProxy = Math.hypot(proxy.centerX - camPos.posX, proxy.centerZ - camPos.posZ);
            const shouldShow = !loadedChunk && distToProxy <= farLimit;
            let pVis = hlodProxyVisuals.get(cKey);
            if (!shouldShow && distToProxy > farLimit * 1.15 && pVis) {
              worldGroup.remove(pVis.group);
              pVis.dispose();
              hlodProxyVisuals.delete(cKey);
              continue;
            }
            if (shouldShow && !pVis) {
              pVis = buildHlodProxyVisual(proxy);
              worldGroup.add(pVis.group);
              hlodProxyVisuals.set(cKey, pVis);
            }
            if (pVis) {
              pVis.group.visible = shouldShow;
              if (shouldShow && pVis.billboardMesh) {
                pVis.billboardMesh.rotation.y = Math.atan2(
                  camPos.posX - proxy.centerX,
                  camPos.posZ - proxy.centerZ
                );
              }
            }
          }
        } else if (hlodProxyVisuals.size > 0) {
          for (const pVis of hlodProxyVisuals.values()) pVis.group.visible = false;
        }

        for (const objState of sim3d.objects) {
          const mesh = meshBindings.get(objState.id);
          let objShown = objState.visible;
          if (mesh) {
            let showObj = objState.visible;
            if (showObj && streamingOn && stState) {
              const act = stState.objectActivity.get(objState.id) ?? 'near';
              if (act === 'unloaded' || (act === 'far' && currentScene3d.worldStreaming?.enableHlod !== false)) {
                showObj = false;
              } else if (stState.culledObjectIds.has(objState.id)) {
                showObj = false;
              }
            }
            const opt = objState.source.optimization;
            const lodEntry = lodBindings.get(objState.id);
            if (showObj && opt) {
              const dx = objState.t3.x - camPos.posX;
              const dy = objState.t3.y - camPos.posY;
              const dz = objState.t3.z - camPos.posZ;
              const dist = Math.hypot(dx, dy, dz);
              const cullD = opt.cullDistance || (opt.lodEnabled && opt.lodDistance ? opt.lodDistance * 2.2 : 0);
              if (cullD > 0 && dist > cullD) {
                showObj = false;
              } else {
                if (lodEntry) {
                  const wantLow = dist >= lodEntry.dist;
                  if (wantLow !== lodEntry.usingLow) {
                    lodEntry.usingLow = wantLow;
                    lodEntry.high.visible = !wantLow;
                    lodEntry.low.visible = wantLow;
                  }
                }
                if (opt.fadeEnabled) {
                  const start = opt.fadeStart ?? 25;
                  const end = Math.max(start + 1, opt.fadeEnd ?? 55);
                  if (dist >= end) {
                    showObj = false;
                  } else {
                    const alpha = dist <= start ? 1 : Math.max(0.05, 1 - (dist - start) / (end - start));
                    const prevA = lastFadeOpacity.get(objState.id) ?? -1;
                    if (Math.abs(alpha - prevA) > 0.02) {
                      lastFadeOpacity.set(objState.id, alpha);
                      mesh.traverse((ch) => {
                        const mat = (ch as THREE.Mesh).material as THREE.MeshStandardMaterial | undefined;
                        if (mat && typeof mat.opacity === 'number') {
                          mat.transparent = alpha < 0.99;
                          mat.opacity = alpha;
                        }
                      });
                    }
                  }
                }
              }
            }
            mesh.visible = showObj;
            objShown = showObj;
            if (showObj) {
              if (mesh.userData.vehicleAnimatedPart) {
                mesh.scale.set(objState.t3.sx, objState.t3.sy, objState.t3.sz);
              } else if (!mesh.userData.boneAttached) {
                mesh.position.set(objState.t3.x, objState.t3.y, objState.t3.z);
                const useYxzOrder =
                  Boolean(objState.source.vehicle?.enabled) ||
                  sim3d.getMountedActorId?.() === objState.id;
                mesh.rotation.set(
                  THREE.MathUtils.degToRad(objState.t3.rx),
                  THREE.MathUtils.degToRad(objState.t3.ry),
                  THREE.MathUtils.degToRad(objState.t3.rz),
                  useYxzOrder ? 'YXZ' : 'XYZ'
                );
                mesh.scale.set(objState.t3.sx, objState.t3.sy, objState.t3.sz);
              } else {
                const sock = objState.source.boneSocket;
                if (sock) {
                  mesh.position.set(sock.offsetX ?? 0, sock.offsetY ?? 0, sock.offsetZ ?? 0);
                  mesh.rotation.set(
                    THREE.MathUtils.degToRad(sock.rotX ?? 0),
                    THREE.MathUtils.degToRad(sock.rotY ?? 0),
                    THREE.MathUtils.degToRad(sock.rotZ ?? 0)
                  );
                }
                mesh.scale.set(objState.t3.sx, objState.t3.sy, objState.t3.sz);
              }
            }
          }
          if (collidersGroup3d.visible) {
            for (const cNode of collidersGroup3d.children) {
              if (cNode.userData.colObjectId === objState.id) {
                cNode.visible = objState.visible;
                if (cNode.userData.isWorldBake) continue;
                const off = (cNode.userData.colOffset as { x: number; y: number; z: number } | undefined) ?? { x: 0, y: 0, z: 0 };
                scratchEuler.set(
                  THREE.MathUtils.degToRad(objState.t3.rx),
                  THREE.MathUtils.degToRad(objState.t3.ry),
                  THREE.MathUtils.degToRad(objState.t3.rz),
                  objState.source.vehicle?.enabled || sim3d.getMountedActorId?.() === objState.id ? 'YXZ' : 'XYZ'
                );
                scratchVec.set(off.x, off.y, off.z).applyEuler(scratchEuler);
                cNode.position.set(
                  objState.t3.x + scratchVec.x,
                  objState.t3.y + scratchVec.y,
                  objState.t3.z + scratchVec.z
                );
                cNode.rotation.copy(scratchEuler);
                cNode.scale.set(1, 1, 1);
              }
            }
          }
          const lightObj = lightBindings.get(objState.id);
          if (lightObj) {
            lightObj.visible = objState.visible;
            lightObj.position.set(objState.t3.x, objState.t3.y, objState.t3.z);
            lightObj.rotation.set(
              THREE.MathUtils.degToRad(objState.t3.rx),
              THREE.MathUtils.degToRad(objState.t3.ry),
              THREE.MathUtils.degToRad(objState.t3.rz)
            );
            const l3Cfg = objState.source.light3d;
            if (l3Cfg) {
              for (const ch of lightObj.children) {
                if ((ch as THREE.Light).isLight) {
                  const lt = ch as THREE.Light;
                  lt.intensity = l3Cfg.intensity;
                  lt.color.set(l3Cfg.color || '#ffffff');
                }
              }
            }
          }
          const mixerInfo = objShown ? mixerMap.get(objState.id) : undefined;
          if (mixerInfo) {
            const desiredKey = `${objState.activeAnimAssetId ?? ''}:${objState.activeClip}`;
            if ((objState.activeClip || objState.activeAnimAssetId) && desiredKey !== mixerInfo.activeActionKey) {
              let nextAct: THREE.AnimationAction | undefined;
              if (objState.activeAnimAssetId && objState.activeClip) {
                nextAct = mixerInfo.actions.get(desiredKey);
              }
              if (!nextAct && objState.activeClip) {
                nextAct = mixerInfo.actions.get(objState.activeClip);
              }
              if (!nextAct && objState.activeAnimAssetId) {
                nextAct = mixerInfo.actions.get(`__asset_first__:${objState.activeAnimAssetId}`);
              }
              if (!nextAct && objState.activeClip) {
                const low = objState.activeClip.toLowerCase();
                for (const [k, act] of mixerInfo.actions.entries()) {
                  if (!k.startsWith('__asset_first__:') && k.toLowerCase() === low) {
                    nextAct = act;
                    break;
                  }
                }
              }
              if (nextAct) {
                const prevAct = mixerInfo.activeAction;
                applyLoopModeToAction(nextAct, objState.animLoopMode);
                nextAct.timeScale = objState.animTimeScale ?? 1;
                nextAct.reset().play();
                if (prevAct && prevAct !== nextAct) {
                  prevAct.crossFadeTo(nextAct, Math.max(0.05, objState.blendDuration || 0.25), true);
                }
                mixerInfo.activeActionKey = desiredKey;
                mixerInfo.activeAction = nextAct;
              }
            }
            mixerInfo.mixer.update(dt);
            if (mixerInfo.activeAction) {
              const dur = mixerInfo.activeAction.getClip()?.duration ?? 0;
              if (dur > 0) {
                objState.animProgress = Math.min(1, mixerInfo.activeAction.time / dur);
                objState.animFinished =
                  objState.animLoopMode === 'LoopOnce'
                    ? mixerInfo.activeAction.time >= dur - 0.02
                    : false;
              }
            }
          }
        }

        // Sincronizar Partículas GPU 3D + Sprites texturizados
        const pool = sim3d.particlePool.items;
        let activeCount = 0;
        let texActiveCount = 0;
        for (let i = 0; i < pool.length; i++) {
          const pt = pool[i];
          if (!pt.active) continue;
          const lifeFrac = 1 - Math.min(1, pt.age / Math.max(0.01, pt.lifetime));
          if (pt.textureAssetId && texActiveCount < MAX_TEX_PARTICLES) {
            const sp = texParticleSprites[texActiveCount++];
            const tex = getParticleTexture(pt.textureAssetId);
            const mat = sp.material as THREE.SpriteMaterial;
            if (tex && mat.map !== tex) {
              mat.map = tex;
              mat.needsUpdate = true;
            }
            mat.color.set(pt.colorStart || '#ffffff');
            mat.opacity = Math.max(0, Math.min(1, pt.alpha * lifeFrac));
            mat.blending = pt.additive ? THREE.AdditiveBlending : THREE.NormalBlending;
            mat.rotation = THREE.MathUtils.degToRad(pt.rotationDeg || 0);
            sp.position.set(pt.x, pt.y, pt.z);
            const s = Math.max(0.08, pt.size * 0.12);
            sp.scale.set(s, s, s);
            sp.visible = true;
          } else if (activeCount < MAX_GPU_PARTICLES) {
            const base = activeCount * 3;
            pPositions[base] = pt.x;
            pPositions[base + 1] = pt.y;
            pPositions[base + 2] = pt.z;
            scratchColor.set(pt.colorStart || '#fbbf24');
            pColors[base] = scratchColor.r * lifeFrac;
            pColors[base + 1] = scratchColor.g * lifeFrac;
            pColors[base + 2] = scratchColor.b * lifeFrac;
            activeCount++;
          }
        }
        for (let i = texActiveCount; i < MAX_TEX_PARTICLES; i++) {
          texParticleSprites[i].visible = false;
        }
        pGeo.attributes.position.needsUpdate = true;
        pGeo.attributes.color.needsUpdate = true;
        pGeo.setDrawRange(0, activeCount);

        // Actualizar SmartCamera3D & audio listener 3D
        const cs = sim3d.cameraState;
        if (Math.abs(camera.fov - cs.fov) > 0.1) {
          camera.fov = cs.fov;
          camera.updateProjectionMatrix();
        }
        camera.position.set(cs.posX, cs.posY, cs.posZ);
        camera.lookAt(cs.lookAtX, cs.lookAtY, cs.lookAtZ);
        sharedAudioEngine.updateListener3D(cs.posX, cs.posY, cs.posZ);

        // Sincronizar multijugador 3D y avatares remotos
        if (mpClient3d && mpClient3d.isConnected()) {
          if (playerActor) {
            mpClient3d.sendLocalTransform({
              x: playerActor.t3.x,
              y: playerActor.t3.y,
              z: playerActor.t3.z,
              rotY: playerActor.t3.ry,
              vx: playerActor.vx,
              vy: playerActor.vy,
              vz: playerActor.vz,
              animState: playerActor.currentAnimState,
              sceneId: currentScene3d.id,
            });
          }
          const remotes3d = mpClient3d.getRemotePlayers(currentScene3d.id);
          const activeRemoteIds = new Set(remotes3d.map((r) => r.playerId));
          for (const [rid, grp] of remoteAvatars3d.entries()) {
            if (!activeRemoteIds.has(rid)) {
              worldGroup.remove(grp);
              remoteAvatars3d.delete(rid);
            }
          }
          for (const rp of remotes3d) {
            let grp = remoteAvatars3d.get(rp.playerId);
            if (!grp) {
              grp = new THREE.Group();
              const bodyGeo = disposer.trackGeometry(new THREE.CapsuleGeometry(0.35, 0.9, 6, 12));
              const bodyMat = disposer.trackMaterial(
                new THREE.MeshStandardMaterial({ color: '#38bdf8', roughness: 0.4, metalness: 0.15 })
              );
              const capMesh = new THREE.Mesh(bodyGeo, bodyMat);
              capMesh.position.y = 0.85;
              capMesh.castShadow = !software;
              grp.add(capMesh);
              worldGroup.add(grp);
              remoteAvatars3d.set(rp.playerId, grp);
            }
            grp.position.set(rp.x, rp.y, rp.z);
            grp.rotation.y = THREE.MathUtils.degToRad(rp.rotY || 0);
          }
        }
      }

      webgl.render(threeScene, camera);

      frameAcc += 1;
      hudTimer += dt;
      if (hudTimer >= 0.16 && sim3d) {
        if (hudTimer > 0) fpsVal = Math.round(frameAcc / hudTimer);
        frameAcc = 0;
        hudTimer = 0;

        if (fpsBadgeRef.current) fpsBadgeRef.current.textContent = `${fpsVal} FPS`;
        if (fpsDebuggerRef.current) fpsDebuggerRef.current.textContent = `FPS: ${fpsVal}`;

        const pts = Number(sim3d.variables.get('puntos') ?? 0);
        const score = Number.isFinite(pts) ? pts : 0;

        let varsSig = '';
        for (const [k, v] of sim3d.variables.entries()) varsSig += `${k}=${v};`;
        if (varsSig !== last3dVarsSig) {
          last3dVarsSig = varsSig;
          setLiveVarsMap(new Map(sim3d.variables));
        }

        const uiOv = sim3d.getUiOverlayState();
        const uiOvSig = `${uiOv.toasts.map((t) => `${t.id}:${t.text}`).join('|')}#${uiOv.widgets.map((w) => `${w.id}:${w.visible}:${w.x},${w.y}:${(w as { text?: string }).text ?? ''}`).join('|')}`;
        if (uiOvSig !== last3dUiOvSig) {
          last3dUiOvSig = uiOvSig;
          setScriptOverlayUi({ toasts: [...uiOv.toasts], widgets: [...uiOv.widgets] });
        }

        if (!software && adaptiveQualityEnabled) {
          if (fpsVal < 48) {
            lowFpsStreak += 1;
            highFpsStreak = 0;
            if (lowFpsStreak >= 4 && activeAdaptiveDpr > 1) {
              lowFpsStreak = 0;
              activeAdaptiveDpr = Math.max(1, Number((activeAdaptiveDpr - 0.25).toFixed(2)));
              webgl.setPixelRatio(activeAdaptiveDpr);
            }
          } else if (fpsVal >= 58) {
            highFpsStreak += 1;
            lowFpsStreak = 0;
            if (highFpsStreak >= 12 && activeAdaptiveDpr < sceneTargetMaxDpr) {
              highFpsStreak = 0;
              activeAdaptiveDpr = Math.min(sceneTargetMaxDpr, Number((activeAdaptiveDpr + 0.25).toFixed(2)));
              webgl.setPixelRatio(activeAdaptiveDpr);
            }
          } else {
            lowFpsStreak = 0;
            highFpsStreak = 0;
          }
        }

        if (currentScene3d.worldStreaming?.enabled) {
          const stNow = sim3d.getStreamingState();
          const aStats = assetStreamer.getStats();
          let hlodAct = 0;
          for (const hv of hlodProxyVisuals.values()) {
            if (hv.group.visible) hlodAct += 1;
          }
          const loadedChunks = stNow?.loaded.size ?? 0;
          const sSig = `1|${loadedChunks}|${hlodAct}|${aStats.residentCount}|${aStats.residentMB}|${aStats.totalUnloads}`;
          if (sSig !== lastStreamingHudSig) {
            lastStreamingHudSig = sSig;
            setStreamingHud({
              enabled: true,
              loadedChunks,
              hlodActive: hlodAct,
              residentAssets: aStats.residentCount,
              residentMB: aStats.residentMB,
              unloadedAssets: aStats.totalUnloads,
            });
          }
        } else if (lastStreamingHudSig !== '0') {
          lastStreamingHudSig = '0';
          setStreamingHud((prev) => (prev.enabled ? { ...prev, enabled: false } : prev));
        }

        if (showLiveInspectorRef.current) {
          setLiveObjectSnapshots(
            sim3d.objects.map((o) => ({
              id: o.id,
              name: o.name,
              type: o.type,
              visible: o.visible,
              x: Math.round(o.t3.x * 100) / 100,
              y: Math.round(o.t3.y * 100) / 100,
              z: Math.round(o.t3.z * 100) / 100,
              vx: Math.round(o.vx * 100) / 100,
              vy: Math.round(o.vy * 100) / 100,
              vz: Math.round(o.vz * 100) / 100,
              grounded: o.isGrounded,
              animState: o.currentAnimState || o.activeClip || '',
              hp: Math.round(o.hp * 10) / 10,
              maxHp: o.maxHp,
              tags: o.tags ?? [],
            }))
          );
        }

        const mountedVId = sim3d.getMountedVehicleId?.() ?? null;
        let nextPrompt: string | null = null;
        if (mountedVId) {
          const mv = sim3d.objects.find((o) => o.id === mountedVId);
          const vKindP = mv?.source.vehicle?.vehicleKind ?? 'car';
          const vLabel = mv?.name ?? 'Vehículo';
          if (vKindP === 'helicopter') {
            nextPrompt = `[E] Bajar de ${vLabel} · Espacio/Shift Altura · W/S Inclinar · A/D/Q Virar`;
          } else if (vKindP === 'horse') {
            nextPrompt = `[E] Desmontar de ${vLabel} · W/S Galopar · A/D Girar · Espacio Saltar`;
          } else if (vKindP === 'plane') {
            nextPrompt = `[E] Bajar de ${vLabel} · W/S Empuje · A/D Alabeo · Q Virar`;
          } else if (vKindP === 'spaceship') {
            nextPrompt = `[E] Bajar de ${vLabel} · WASD Mover · Espacio/Shift Altura`;
          } else if (vKindP === 'boat') {
            nextPrompt = `[E] Bajar de ${vLabel} · WASD Navegar`;
          } else {
            nextPrompt = `[E] Bajar de ${vLabel} · W/S Acelerar · A/D Girar`;
          }
        } else {
          const pAct = sim3d.objects.find(
            (o) =>
              o.visible &&
              o.source.components.some(
                (c) =>
                  c.enabled &&
                  (c.type === 'player_3d' ||
                    c.type === 'player_platformer' ||
                    c.type === 'player_topdown' ||
                    c.type === 'movement.platformer_pro' ||
                    c.type === 'movement.topdown_8dir')
              )
          );
          if (pAct) {
            let bestVeh: typeof pAct | null = null;
            let bestD = Infinity;
            for (const cand of sim3d.objects) {
              if (
                !cand.visible ||
                cand.id === pAct.id ||
                !cand.source.vehicle?.enabled ||
                cand.source.vehicle.allowQuickEnterExit === false
              ) {
                continue;
              }
              const xz = Math.hypot(pAct.t3.x - cand.t3.x, pAct.t3.z - cand.t3.z);
              if (xz <= 12 && xz < bestD) {
                bestD = xz;
                bestVeh = cand;
              }
            }
            if (bestVeh) {
              const vk = bestVeh.source.vehicle?.vehicleKind;
              const verb = vk === 'horse' || vk === 'moto' ? 'Montar' : 'Subir a';
              nextPrompt = `[E] ${verb} ${bestVeh.name}`;
            }
          }
        }
        setVehicleHudPrompt((prev) => (prev === nextPrompt ? prev : nextPrompt));

        const hudSig = `${score}|${currentScene3d.name}|${sim3d.objects.length}|${sim3d.logs.length}|${showDebuggerRef.current ? varsSig : ''}`;
        if (hudSig !== last3dHudSig) {
          last3dHudSig = hudSig;
          setHudState({
            score,
            fps: fpsVal,
            activeSceneName: currentScene3d.name,
            overlayNames: [],
            objectCount: sim3d.objects.length,
            varsList: showDebuggerRef.current
              ? Array.from(sim3d.variables.entries()).map(([k, v]) => [k, String(v)] as [string, string])
              : [],
            runtimeLogs: [...sim3d.logs],
          });
        }
      }

      if (software) {
        softTimeoutId = window.setTimeout(() => {
          if (mounted) rafId = requestAnimationFrame(loop);
        }, 42);
      } else {
        rafId = requestAnimationFrame(loop);
      }
    };

    rafId = requestAnimationFrame(loop);

    return () => {
      mounted = false;
      clearTimeout(softTimeoutId);
      cancelAnimationFrame(rafId);
      ro.disconnect();
      mpClient3d?.disconnect();
      mpClientRef.current = null;
      remoteAvatars3d.clear();
      webgl.domElement.removeEventListener('pointerdown', onPointerDown);
      webgl.domElement.removeEventListener('wheel', onWheel);
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerup', onPointerUp);
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      window.removeEventListener('blur', onBlur);
      sharedAudioEngine.stopAll();
      disposer.disposeAll();
      envTarget.dispose();
      webgl.dispose();
      if (webgl.domElement.parentElement === host) {
        host.removeChild(webgl.domElement);
      }
      sim3dRef.current = null;
      switch3dSceneRef.current = null;
      restart3dSceneRef.current = null;
      setVehicleHudPrompt(null);
    };
  }, [open, projectMode]);

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
    if (projectMode !== '2d') return;
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
    sharedAudioEngine.unlock();
    if (projectMode !== '2d') return;
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
    } else if (showLiveInspectorRef.current) {
      const objs = manager.activeTopState.scene.objects;
      for (let i = objs.length - 1; i >= 0; i--) {
        const o = objs[i];
        if (!o.visible) continue;
        const left = o.transform.x - o.transform.width * o.transform.anchorX;
        const top = o.transform.y - o.transform.height * o.transform.anchorY;
        if (pt.x >= left && pt.x <= left + o.transform.width && pt.y >= top && pt.y <= top + o.transform.height) {
          setInspectedObjId(o.id);
          break;
        }
      }
    }
  };

  const handleCanvasPointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    if (projectMode !== '2d') return;
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
    if (projectMode === '3d') {
      if (!sim3dRef.current) return;
      setPaused(true);
      sim3dRef.current.step({
        dt: FIXED_DT,
        heldKeys: new Set(),
        justPressedKeys: new Set(),
      });
      return;
    }
    const manager = managerRef.current;
    if (!manager) return;
    setPaused(true);
    const sounds = manager.step(FIXED_DT, inputRef.current);
    flushSounds(sounds);
    renderSnapshot(manager);
  };

  const handleRestartScene = () => {
    if (projectMode === '3d') {
      restart3dSceneRef.current?.();
      return;
    }
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
      data-nexus-preview-mode={projectMode}
    >
      <header className="flex h-11 shrink-0 items-center justify-between gap-2 border-b border-[#2a2a32] bg-[#16161a] px-3">
        <div className="flex min-w-0 items-center gap-2 text-xs">
          <span className="truncate font-semibold text-zinc-100">
            {projectName}
          </span>
          <span className="rounded bg-blue-600/20 px-1.5 py-0.5 text-[10px] font-bold uppercase text-blue-300">
            {projectMode === '3d' ? '3D' : '2D'}
          </span>
          <span className="text-zinc-500" aria-hidden="true">·</span>
          <span className="truncate text-zinc-300">
            {hudState.activeSceneName}
            {hudState.overlayNames.length > 0
              ? ` (+ ${hudState.overlayNames.join(', ')})`
              : ''}
          </span>
          <span
            ref={fpsBadgeRef}
            className="hidden md:inline font-mono text-[11px] tabular-nums text-zinc-500"
          >
            {hudState.fps} FPS
          </span>
          {streamingHud.enabled && (
            <span
              className="hidden lg:inline rounded border border-emerald-500/35 bg-emerald-500/10 px-1.5 py-0.5 font-mono text-[10px] text-emerald-300"
              title="Streaming de Chunks, Proxies HLOD y Residencia VRAM"
            >
              Chunks: {streamingHud.loadedChunks} · HLOD: {streamingHud.hlodActive} · Assets: {streamingHud.residentAssets} ({streamingHud.residentMB}MB · ↓{streamingHud.unloadedAssets})
            </span>
          )}
        </div>

        <div className="flex items-center gap-1.5 shrink-0">
          {i18n && Object.keys(i18n.entries ?? {}).length > 0 && (
            <button
              type="button"
              onClick={() => {
                const order: I18nLocale[] = ['es', 'en', 'pt'];
                setActiveLocale(order[(order.indexOf(activeLocale) + 1) % order.length]);
              }}
              title="Cambiar idioma en vivo (i18n)"
              className="inline-flex items-center gap-1 rounded border border-[#343440] bg-[#222229] px-2 py-1 text-[11px] font-bold uppercase text-cyan-300 hover:bg-[#2d2d37]"
            >
              <Globe className="h-3 w-3" />
              <span>{activeLocale.toUpperCase()}</span>
            </button>
          )}
          {mpStatus.roomId && (
            <div
              className={`inline-flex items-center gap-1 rounded border px-2 py-1 text-[11px] font-mono ${
                mpStatus.connected
                  ? 'border-sky-500/40 bg-sky-500/15 text-sky-300'
                  : 'border-amber-500/40 bg-amber-500/15 text-amber-300'
              }`}
              title={`Sala Multijugador: ${mpStatus.roomId}`}
            >
              <Wifi className="h-3 w-3" />
              <span>
                {mpStatus.connected ? `${mpStatus.roomId} (${mpStatus.playerCount})` : 'Conectando...'}
              </span>
            </div>
          )}
          <button
            type="button"
            onClick={() => {
              const pStore =
                projectMode === '3d'
                  ? sim3dRef.current?.wiringSys?.persistence
                  : managerRef.current?.activeTopState.wiringSys?.persistence;
              pStore?.saveLocal();
              void pStore?.syncToServer('local_player');
            }}
            title="Guardar progreso del jugador"
            className="inline-flex items-center gap-1 rounded border border-[#343440] bg-[#222229] px-2 py-1 text-xs font-medium text-zinc-200 hover:bg-[#2d2d37]"
          >
            <Save className="h-3.5 w-3.5 text-emerald-400" />
            <span className="hidden lg:inline">Guardar</span>
          </button>
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
            title="Ver colisionadores y sensores en vivo (2D y 3D)"
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
            onClick={() => setShowTouchOverlay((v) => !v)}
            aria-pressed={showTouchOverlay}
            title="Activar o probar joystick virtual 360° y controles táctiles móviles"
            className={`inline-flex items-center gap-1 rounded border px-2 py-1 text-xs font-medium ${
              showTouchOverlay
                ? 'border-violet-500/50 bg-violet-500/20 text-violet-300'
                : 'border-[#343440] bg-[#222229] text-zinc-300 hover:bg-[#2d2d37]'
            }`}
          >
            <Gamepad2 className="h-3.5 w-3.5" />
            <span className="hidden md:inline">Táctil</span>
          </button>

          <button
            type="button"
            onClick={() => setShowLiveInspector((v) => !v)}
            aria-pressed={showLiveInspector}
            title="Inspector visual de objetos en vivo (posición, física, animación)"
            className={`inline-flex items-center gap-1 rounded border px-2 py-1 text-xs font-medium ${
              showLiveInspector
                ? 'border-cyan-500/50 bg-cyan-500/20 text-cyan-300'
                : 'border-[#343440] bg-[#222229] text-zinc-300 hover:bg-[#2d2d37]'
            }`}
          >
            <Eye className="h-3.5 w-3.5" />
            <span className="hidden lg:inline">Objetos</span>
          </button>

          <button
            type="button"
            onClick={() => setShowDebugger((v) => !v)}
            aria-pressed={showDebugger}
            title="Abrir inspector de variables, logs y errores JS en vivo"
            className={`inline-flex items-center gap-1 rounded border px-2 py-1 text-xs font-medium ${
              showDebugger
                ? 'border-sky-500/50 bg-sky-500/20 text-sky-300'
                : hudState.runtimeLogs.some((l) => /error/i.test(l))
                ? 'border-red-500/50 bg-red-500/15 text-red-300'
                : 'border-[#343440] bg-[#222229] text-zinc-300 hover:bg-[#2d2d37]'
            }`}
          >
            <Bug className="h-3.5 w-3.5" />
            <span className="hidden md:inline">
              Debug{hudState.runtimeLogs.length > 0 ? ` (${hudState.runtimeLogs.length})` : ''}
            </span>
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
        <div className="relative flex-1 overflow-hidden">
          <div
            ref={hostRef}
            data-testid="nexus-preview-canvas-host"
            onPointerMove={handleCanvasPointerMove}
            onPointerDown={handleCanvasPointerDown}
            onPointerUp={handleCanvasPointerUp}
            className={`h-full w-full overflow-hidden ${hoverUi ? 'cursor-pointer' : 'cursor-default'}`}
          />

          <UIWidgetOverlayLayer
            mode="preview"
            projectMode={projectMode}
            objects={liveObjects}
            stage={stage}
            camera={liveCamera}
            viewportWidth={hostSize.w}
            viewportHeight={hostSize.h}
            variables={liveVarsMap}
            audioBuses={liveBuses}
            hiddenWidgetIds={hiddenWidgetIds}
            dataTables={dataTables}
            i18n={i18n}
            locale={activeLocale}
            onWidgetBridge={widgetBridge}
          />

          {/* Toasts y widgets creados por script (nexus.ui.showToast / createWidget) */}
          {scriptOverlayUi.toasts.length > 0 && (
            <div className="pointer-events-none absolute top-3 left-1/2 z-30 flex -translate-x-1/2 flex-col items-center gap-1.5">
              {scriptOverlayUi.toasts.map((t) => (
                <div
                  key={t.id}
                  className={`rounded-lg border px-3 py-1.5 text-xs font-semibold shadow-lg backdrop-blur ${
                    t.kind === 'error'
                      ? 'border-red-500/60 bg-red-950/90 text-red-100'
                      : t.kind === 'warn'
                        ? 'border-amber-500/60 bg-amber-950/90 text-amber-100'
                        : 'border-sky-500/50 bg-[#121826]/90 text-sky-100'
                  }`}
                >
                  {t.text}
                </div>
              ))}
            </div>
          )}

          {scriptOverlayUi.widgets
            .filter((w) => w.visible !== false)
            .map((w) => {
              const displayText =
                w.text ?? (w.html ? w.html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim() : '');
              return (
                <div
                  key={w.id}
                  style={{
                    left: `${w.x}px`,
                    top: `${w.y}px`,
                    width: w.width ? `${w.width}px` : undefined,
                    height: w.height ? `${w.height}px` : undefined,
                    ...(w.style ?? {}),
                  }}
                  className="pointer-events-none absolute z-20 rounded border border-white/15 bg-[#121622]/85 px-2.5 py-1.5 text-xs font-medium text-white shadow"
                >
                  {displayText}
                </div>
              );
            })}

          <VirtualTouchOverlay
            visible={showTouchOverlay}
            config={touchControls}
            onAxisChange={(x, y) => {
              touchAxisRef.current = { x, y };
            }}
            onButtonChange={(btn, pressed) => {
              if (btn === 'jump') touchBtnsRef.current.jump = pressed;
              if (btn === 'action') touchBtnsRef.current.action = pressed;
              if (btn === 'dash') touchBtnsRef.current.dash = pressed;
            }}
          />

          {projectMode === '3d' && vehicleHudPrompt && !activeDialogue && (
            <div
              data-testid="nexus-vehicle-hud-prompt"
              className="pointer-events-none absolute bottom-4 left-1/2 z-30 -translate-x-1/2 rounded-lg border border-white/15 bg-[#0e121b]/85 px-3.5 py-1.5 text-xs font-medium text-zinc-100 shadow-lg backdrop-blur"
            >
              {vehicleHudPrompt}
            </div>
          )}

          {/* Overlay de Diálogos Ramificados en Preview */}
          {activeDialogue && (
            <div
              className="absolute inset-x-4 bottom-4 z-40 mx-auto max-w-2xl rounded-xl border border-sky-500/40 bg-[#0d111a]/95 p-4 text-zinc-100 shadow-2xl backdrop-blur"
              onClick={() => {
                if (!activeDialogue.finishedTyping || activeDialogue.choices.length === 0) {
                  handleAdvanceDialogue(null);
                }
              }}
            >
              <div className="flex items-start gap-3">
                {portraitUrl && (
                  <img
                    src={portraitUrl}
                    alt={activeDialogue.speaker}
                    className="h-16 w-16 shrink-0 rounded-lg border border-white/15 object-cover bg-zinc-900"
                  />
                )}
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs font-bold uppercase tracking-wider text-sky-400">
                      {activeDialogue.speaker || 'Personaje'}
                    </span>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        setActiveDialogue(null);
                      }}
                      className="text-[11px] text-zinc-400 hover:text-white"
                    >
                      Cerrar
                    </button>
                  </div>
                  <p className="mt-1.5 min-h-[42px] text-sm leading-relaxed text-zinc-100">
                    {activeDialogue.fullText.slice(0, Math.floor(activeDialogue.revealedChars))}
                  </p>
                  {activeDialogue.finishedTyping && activeDialogue.choices.length > 0 ? (
                    <div className="mt-3 flex flex-wrap gap-2">
                      {activeDialogue.choices.map((ch, idx) => (
                        <button
                          key={ch.id || idx}
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleAdvanceDialogue(idx);
                          }}
                          className="rounded-lg border border-sky-500/50 bg-sky-600/20 px-3 py-1.5 text-xs font-semibold text-sky-100 hover:bg-sky-500/35"
                        >
                          {ch.text}
                        </button>
                      ))}
                    </div>
                  ) : (
                    <div className="mt-2 text-right text-[10px] text-zinc-400">
                      {activeDialogue.finishedTyping ? 'Clic para continuar...' : 'Clic para completar...'}
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>

        {showLiveInspector && (
          <aside className="w-64 shrink-0 border-l border-[#2a2a32] bg-[#141419] p-3 text-xs overflow-y-auto space-y-2.5">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-bold uppercase tracking-wider text-cyan-400">
                Inspector Vivo ({liveObjectSnapshots.length})
              </span>
              <span className="text-[10px] text-zinc-500">Clic en escena</span>
            </div>
            <div className="max-h-44 overflow-y-auto space-y-1">
              {liveObjectSnapshots.map((o) => (
                <button
                  key={o.id}
                  type="button"
                  onClick={() => setInspectedObjId(o.id)}
                  className={`flex w-full items-center justify-between rounded border px-2 py-1 text-left text-[11px] ${
                    inspectedObjId === o.id
                      ? 'border-cyan-500/60 bg-cyan-500/15 text-cyan-200'
                      : 'border-[#282832] bg-[#1a1a21] text-zinc-300 hover:bg-[#23232d]'
                  }`}
                >
                  <span className="truncate font-medium">{o.name}</span>
                  <span className="ml-1 shrink-0 font-mono text-[10px] text-zinc-500">{o.type}</span>
                </button>
              ))}
            </div>
            {(() => {
              const sel = liveObjectSnapshots.find((o) => o.id === inspectedObjId) ?? liveObjectSnapshots[0];
              if (!sel) return null;
              return (
                <div className="rounded border border-cyan-500/30 bg-[#181820] p-2.5 font-mono text-[11px] space-y-1 text-zinc-200">
                  <div className="font-sans text-xs font-bold text-cyan-300">{sel.name}</div>
                  <div>Visible: {sel.visible ? 'Sí' : 'No'}</div>
                  <div>
                    Pos: ({sel.x}, {sel.y}
                    {sel.z !== undefined ? `, ${sel.z}` : ''})
                  </div>
                  <div>
                    Vel: ({sel.vx}, {sel.vy}
                    {sel.vz !== undefined ? `, ${sel.vz}` : ''})
                  </div>
                  {sel.grounded !== undefined && <div>En suelo: {sel.grounded ? 'Sí' : 'No'}</div>}
                  {sel.animState && <div>Animación: {sel.animState}</div>}
                  {typeof sel.hp === 'number' && typeof sel.maxHp === 'number' && sel.maxHp > 0 && (
                    <div>
                      HP: {sel.hp} / {sel.maxHp}
                    </div>
                  )}
                  {sel.tags.length > 0 && <div>Tags: {sel.tags.join(', ')}</div>}
                </div>
              );
            })()}
          </aside>
        )}

        {showDebugger && (
          <aside className="w-64 shrink-0 border-l border-[#2a2a32] bg-[#141419] p-3 text-xs overflow-y-auto space-y-3">
            <div>
              <div className="text-[10px] font-bold uppercase tracking-wider text-sky-400">
                Estado de ejecución ({projectMode.toUpperCase()})
              </div>
              <div className="mt-1 space-y-1 font-mono text-[11px] text-zinc-300">
                <div ref={fpsDebuggerRef}>FPS: {hudState.fps}</div>
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
            <div>
              <div className="text-[10px] font-bold uppercase tracking-wider text-amber-400">
                Consola / Errores JS ({hudState.runtimeLogs.length})
              </div>
              {hudState.runtimeLogs.length === 0 ? (
                <p className="mt-1 text-[11px] text-zinc-500">Sin mensajes o errores de script.</p>
              ) : (
                <div className="mt-1 max-h-48 overflow-y-auto space-y-1">
                  {hudState.runtimeLogs.slice(-20).map((entry, idx) => (
                    <div
                      key={`${idx}-${entry.slice(0, 12)}`}
                      className={`rounded border px-2 py-1 font-mono text-[10px] break-words ${
                        /error/i.test(entry)
                          ? 'border-red-500/40 bg-red-500/10 text-red-300'
                          : 'border-[#282832] bg-[#1a1a21] text-zinc-300'
                      }`}
                    >
                      {entry}
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
