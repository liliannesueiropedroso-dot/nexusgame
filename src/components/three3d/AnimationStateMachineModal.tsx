import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowLeftRight, Film, GitBranch, Play, Plus, RotateCcw, Trash2, Upload, X, Zap } from 'lucide-react';
import type {
  AnimationFrameEvent,
  AnimationStateMachineConfig,
  AnimStateNode,
  AnimStateTransition,
} from '../../engine/core/types';
import {
  stepAnimationFSM,
  suggestInverseCondition,
} from '../../engine/runtime/animFsmEvaluator';

interface AnimFSMRuntimeState {
  currentStateId: string;
  previousStateId: string | null;
  blendRemaining: number;
  blendTotal: number;
}
import { loadModel3DFromBlob } from '../../engine/three3d/modelLoader';
import type { ProjectAssetMeta } from '../../project/models/project';
import { createId } from '../../utils/id';
import { KeyCaptureField } from '../common/KeyCaptureField';
import { NumericInput } from '../common/NumericInput';

interface AnimationStateMachineModalProps {
  open: boolean;
  mode?: '2d' | '3d';
  objectName: string;
  clipNames: string[];
  assets?: ProjectAssetMeta[];
  assetBlobs?: Map<string, Blob>;
  onImportClipAsset?: (files: File[]) => Promise<string | null>;
  config: AnimationStateMachineConfig;
  onClose: () => void;
  onSave: (next: AnimationStateMachineConfig) => void;
}

const CONDITION_PRESETS = [
  { label: 'Reposo (speed <= 0.1)', value: 'speed <= 0.1' },
  { label: 'Caminando (speed > 0.1)', value: 'speed > 0.1' },
  { label: 'Corriendo con Shift (keyHeld:ShiftLeft)', value: 'keyHeld:ShiftLeft' },
  { label: 'Soltar Shift (!keyHeld:ShiftLeft)', value: '!keyHeld:ShiftLeft' },
  { label: 'Saltando (isGrounded == false && vy > 0)', value: 'isGrounded == false && vy > 0' },
  { label: 'Cayendo (isGrounded == false && vy <= 0)', value: 'isGrounded == false && vy <= 0' },
  { label: 'En el aire (isGrounded == false)', value: 'isGrounded == false' },
  { label: 'En el suelo (isGrounded == true)', value: 'isGrounded == true' },
  { label: 'Al terminar el clip (animFinished)', value: 'animFinished' },
  { label: 'Murió (var:salud <= 0)', value: 'var:salud <= 0' },
  { label: 'Disparo manual (anim.setState)', value: 'manual' },
];

const QUICK_STATE_PRESETS: Array<{
  name: string;
  loopMode: 'LoopRepeat' | 'LoopOnce';
  cond: string;
}> = [
  { name: 'Idle', loopMode: 'LoopRepeat', cond: 'speed <= 0.1' },
  { name: 'Walk', loopMode: 'LoopRepeat', cond: 'speed > 0.1' },
  { name: 'Run', loopMode: 'LoopRepeat', cond: 'speed > 0.1 && keyHeld:ShiftLeft' },
  { name: 'Jump', loopMode: 'LoopOnce', cond: 'isGrounded == false && vy > 0' },
  { name: 'Fall', loopMode: 'LoopRepeat', cond: 'isGrounded == false && vy <= 0' },
  { name: 'Attack', loopMode: 'LoopOnce', cond: 'manual' },
  { name: 'Death', loopMode: 'LoopOnce', cond: 'var:salud <= 0' },
];

async function extractModelClips(
  blob: Blob,
  hint?: string | null
): Promise<string[]> {
  try {
    const loaded = await loadModel3DFromBlob(blob, hint, { normalizeSize: false });
    return loaded.clipNames;
  } catch {
    return [];
  }
}

export const AnimationStateMachineModal: React.FC<AnimationStateMachineModalProps> = ({
  open,
  mode = '3d',
  objectName,
  clipNames,
  assets = [],
  assetBlobs,
  onImportClipAsset,
  config,
  onClose,
  onSave,
}) => {
  const [draft, setDraft] = useState<AnimationStateMachineConfig>(config);
  const [selectedStateId, setSelectedStateId] = useState<string>(config.initialStateId);
  const [selectedTransitionId, setSelectedTransitionId] = useState<string | null>(null);
  const [discoveredClips, setDiscoveredClips] = useState<string[]>([]);
  const [importingClip, setImportingClip] = useState(false);
  const [anyNodePos, setAnyNodePos] = useState<{ x: number; y: number }>({ x: 235, y: 58 });
  const [simRunning, setSimRunning] = useState(false);
  const [simState, setSimState] = useState<AnimFSMRuntimeState>({
    currentStateId: config.initialStateId,
    previousStateId: null,
    blendRemaining: 0,
    blendTotal: 0,
  });
  const [simLabel, setSimLabel] = useState('Reposo');
  const fileInputRef = useRef<HTMLInputElement>(null);

  const dragRef = useRef<{
    id: string;
    startX: number;
    startY: number;
    nodeX: number;
    nodeY: number;
  } | null>(null);

  const wasOpenRef = useRef(false);

  useEffect(() => {
    if (!open) {
      wasOpenRef.current = false;
      return;
    }
    if (wasOpenRef.current) return;
    wasOpenRef.current = true;

    const cloned = structuredClone(config);
    if (cloned.states.length === 0) {
      const idle: AnimStateNode = {
        id: createId('st'),
        name: 'Idle',
        clipName: clipNames[0] ?? 'idle',
        timeScale: 1,
        loopMode: 'LoopRepeat',
        x: 60,
        y: 135,
      };
      cloned.states.push(idle);
      cloned.initialStateId = idle.id;
    }
    setDraft(cloned);
    setSelectedStateId(cloned.initialStateId || cloned.states[0]?.id || '');
    setSelectedTransitionId(cloned.transitions[0]?.id ?? null);

    if (mode === '3d' && assetBlobs) {
      const linkedIds = Array.from(
        new Set(cloned.states.map((s) => s.assetId).filter((id): id is string => Boolean(id)))
      );
      for (const aid of linkedIds) {
        const b = assetBlobs.get(aid);
        const meta = assets.find((a) => a.id === aid);
        if (!b) continue;
        void extractModelClips(b, meta?.format ?? meta?.filename).then((clips) => {
          if (clips.length > 0) {
            setDiscoveredClips((prev) => Array.from(new Set([...prev, ...clips])));
          }
        });
      }
    }
  }, [open, config, clipNames, mode, assetBlobs, assets]);

  const allClipOptions = useMemo(() => {
    const set = new Set<string>(clipNames);
    for (const c of discoveredClips) set.add(c);
    for (const s of draft.states) {
      if (s.clipName) set.add(s.clipName);
    }
    return Array.from(set);
  }, [clipNames, discoveredClips, draft.states]);

  const modelAssets = useMemo(
    () => assets.filter((a) => a.kind === 'model3d'),
    [assets]
  );
  const imageAssets = useMemo(
    () => assets.filter((a) => (a.kind ?? 'image') === 'image'),
    [assets]
  );

  const [sheetPreviewUrl, setSheetPreviewUrl] = useState<string | null>(null);
  const selectedStateForSheet =
    draft.states.find((s) => s.id === selectedStateId) ?? draft.states[0] ?? null;
  const activeSheetAssetId =
    selectedStateForSheet?.assetId || imageAssets[0]?.id || null;

  useEffect(() => {
    if (!open || mode !== '2d' || !activeSheetAssetId || !assetBlobs) {
      setSheetPreviewUrl(null);
      return;
    }
    const blob = assetBlobs.get(activeSheetAssetId);
    if (!blob) {
      setSheetPreviewUrl(null);
      return;
    }
    const url = URL.createObjectURL(blob);
    setSheetPreviewUrl(url);
    return () => {
      URL.revokeObjectURL(url);
    };
  }, [open, mode, activeSheetAssetId, assetBlobs]);

  if (!open) return null;

  const selectedState =
    draft.states.find((s) => s.id === selectedStateId) ?? draft.states[0] ?? null;

  const addQuickState = (presetName?: string) => {
    const idx = draft.states.length;
    const presetNames = ['Idle', 'Walk', 'Run', 'Jump', 'Fall', 'Attack'];
    const defaultName = presetName ?? presetNames[idx] ?? `Estado_${idx + 1}`;
    const presetInfo = QUICK_STATE_PRESETS.find((p) => p.name === defaultName);
    const matchingClip =
      allClipOptions.find((c) => c.toLowerCase().includes(defaultName.toLowerCase())) ??
      allClipOptions[idx % Math.max(1, allClipOptions.length)] ??
      defaultName.toLowerCase();

    const lnameQuick = defaultName.toLowerCase();
    const node: AnimStateNode = {
      id: createId('st'),
      name: defaultName,
      clipName: matchingClip,
      timeScale: 1,
      loopMode:
        presetInfo?.loopMode ??
        (defaultName === 'Jump' || defaultName === 'Attack' || defaultName === 'Death'
          ? 'LoopOnce'
          : 'LoopRepeat'),
      x: 60 + (idx % 3) * 260,
      y: 135 + Math.floor(idx / 3) * 155,
      ...(lnameQuick === 'jump'
        ? {
            triggerKey: 'Space',
            triggerKeyMode: 'pressed' as const,
            fromAnyState: true,
            returnMode: 'smart_locomotion' as const,
            returnOn: 'grounded' as const,
          }
        : lnameQuick === 'attack'
          ? {
              fromAnyState: true,
              returnMode: 'smart_locomotion' as const,
              returnOn: 'animFinished' as const,
            }
          : {}),
      ...(mode === '2d'
        ? { cols: 4, rows: 1, startFrame: 0, frameCount: 4 }
        : {}),
    };

    setDraft((prev) => {
      const nextStates = [...prev.states, node];
      const autoTransitions: AnimStateTransition[] = [];
      const defaultBlend = mode === '2d' ? 0.05 : 0.2;
      const idleNode =
        prev.states.find((s) => s.id === prev.initialStateId) ??
        prev.states.find((s) => s.name.toLowerCase().includes('idle')) ??
        prev.states[0];
      const walkNode = prev.states.find((s) => s.name.toLowerCase().includes('walk'));
      const jumpNode = prev.states.find((s) => s.name.toLowerCase().includes('jump'));

      const pushLink = (fromStateId: string, toStateId: string, conditionExpr: string) => {
        if (!fromStateId || !toStateId || fromStateId === toStateId) return;
        const exists = prev.transitions.some(
          (t) =>
            t.fromStateId === fromStateId &&
            t.toStateId === toStateId &&
            t.conditionExpr === conditionExpr
        );
        if (!exists) {
          autoTransitions.push({
            id: createId('tr'),
            fromStateId,
            toStateId,
            conditionExpr,
            blendDuration: defaultBlend,
          });
        }
      };

      const lname = defaultName.toLowerCase();
      if (lname === 'walk' && idleNode) {
        pushLink(idleNode.id, node.id, 'speed > 0.1');
        pushLink(node.id, idleNode.id, 'speed <= 0.1');
      } else if (lname === 'run') {
        if (walkNode) {
          pushLink(walkNode.id, node.id, 'speed > 0.1 && keyHeld:ShiftLeft');
          pushLink(node.id, walkNode.id, '!keyHeld:ShiftLeft');
        } else if (idleNode) {
          pushLink(idleNode.id, node.id, 'speed > 0.1 && keyHeld:ShiftLeft');
          pushLink(node.id, idleNode.id, 'speed <= 0.1');
        }
      } else if (lname === 'jump') {
        pushLink('*', node.id, 'isGrounded == false && vy > 0');
      } else if (lname === 'fall') {
        if (jumpNode) {
          pushLink(jumpNode.id, node.id, 'isGrounded == false && vy <= 0');
        }
        pushLink('*', node.id, 'isGrounded == false && vy <= 0');
      } else if (lname === 'attack' && idleNode) {
        pushLink(idleNode.id, node.id, 'manual');
      } else if (lname === 'death') {
        pushLink('*', node.id, 'var:salud <= 0');
      } else if (idleNode && presetInfo && presetInfo.cond !== 'manual') {
        pushLink(idleNode.id, node.id, presetInfo.cond);
        pushLink(node.id, idleNode.id, suggestInverseCondition(presetInfo.cond));
      }

      return {
        ...prev,
        initialStateId: prev.initialStateId || node.id,
        states: nextStates,
        transitions: [...prev.transitions, ...autoTransitions],
      };
    });
    setSelectedStateId(node.id);
  };

  const addState = () => addQuickState();

  const runSimProbe = (
    label: string,
    probe: {
      speed: number;
      vy: number;
      isGrounded: boolean;
      keysHeld?: string[];
      keysJustPressed?: string[];
      animFinished?: boolean;
      vars?: Record<string, number>;
      forceStateName?: string;
    }
  ) => {
    setSimRunning(true);
    setSimLabel(label);
    setSimState((prev) => {
      const base: AnimFSMRuntimeState = prev.currentStateId
        ? prev
        : {
            currentStateId: draft.initialStateId || draft.states[0]?.id || '',
            previousStateId: null,
            blendRemaining: 0,
            blendTotal: 0,
          };
      if (probe.forceStateName) {
        const target = draft.states.find(
          (s) => s.name.toLowerCase() === probe.forceStateName!.toLowerCase()
        );
        if (target) {
          return {
            currentStateId: target.id,
            previousStateId: base.currentStateId,
            blendRemaining: 0.2,
            blendTotal: 0.2,
          };
        }
      }
      const curNode =
        draft.states.find((s) => s.id === base.currentStateId) ??
        draft.states.find((s) => s.id === draft.initialStateId) ??
        draft.states[0];
      const evalRes = stepAnimationFSM(draft, curNode?.name ?? '', {
        speed: probe.speed,
        vy: probe.vy,
        isGrounded: probe.isGrounded,
        heldKeys: new Set(probe.keysHeld ?? []),
        justPressedKeys: new Set(probe.keysJustPressed ?? []),
        variables: new Map(Object.entries(probe.vars ?? { salud: 100 })),
        animFinished: probe.animFinished,
      });
      if (!evalRes) return base;
      return {
        currentStateId: evalRes.node.id,
        previousStateId: evalRes.changed ? base.currentStateId : base.previousStateId,
        blendRemaining: evalRes.changed ? evalRes.blendDuration : 0,
        blendTotal: evalRes.changed ? evalRes.blendDuration : 0,
      };
    });
  };

  const addTransition = (bidirectional = false) => {
    if (draft.states.length < 2) return;
    const fromId = selectedState?.id ?? draft.states[0].id;
    const toNode = draft.states.find((s) => s.id !== fromId) ?? draft.states[1];
    const condExpr =
      toNode.name.toLowerCase().includes('jump') || toNode.name.toLowerCase().includes('salto')
        ? 'isGrounded == false && vy > 0'
        : toNode.name.toLowerCase().includes('run') || toNode.name.toLowerCase().includes('corr')
          ? 'keyHeld:ShiftLeft'
          : 'speed > 0.1';

    const trForward: AnimStateTransition = {
      id: createId('tr'),
      fromStateId: fromId,
      toStateId: toNode.id,
      conditionExpr: condExpr,
      blendDuration: mode === '2d' ? 0.05 : 0.2,
    };

    const newTransitions = [trForward];
    if (bidirectional) {
      newTransitions.push({
        id: createId('tr'),
        fromStateId: toNode.id,
        toStateId: fromId,
        conditionExpr: suggestInverseCondition(condExpr),
        blendDuration: mode === '2d' ? 0.05 : 0.2,
      });
    }

    setDraft((prev) => ({
      ...prev,
      transitions: [...prev.transitions, ...newTransitions],
    }));
    setSelectedTransitionId(trForward.id);
  };

  const addReturnTransition = (tr: AnimStateTransition) => {
    const exists = draft.transitions.some(
      (t) => t.fromStateId === tr.toStateId && t.toStateId === tr.fromStateId
    );
    if (exists) return;
    const back: AnimStateTransition = {
      id: createId('tr'),
      fromStateId: tr.toStateId,
      toStateId: tr.fromStateId,
      conditionExpr: suggestInverseCondition(tr.conditionExpr),
      blendDuration: tr.blendDuration,
    };
    setDraft((prev) => ({
      ...prev,
      transitions: [...prev.transitions, back],
    }));
    setSelectedTransitionId(back.id);
  };

  const handleUploadStateGlb = async (files: File[]) => {
    if (!files.length || !selectedState) return;
    setImportingClip(true);
    try {
      const clips = await extractModelClips(files[0], files[0].name);
      if (clips.length > 0) {
        setDiscoveredClips((prev) => Array.from(new Set([...prev, ...clips])));
      }
      let newAssetId: string | null = null;
      if (onImportClipAsset) {
        newAssetId = await onImportClipAsset(files);
      }
      setDraft((prev) => ({
        ...prev,
        states: prev.states.map((s) =>
          s.id === selectedState.id
            ? {
                ...s,
                assetId: newAssetId ?? s.assetId,
                clipName: clips[0] ?? s.clipName,
              }
            : s
        ),
      }));
    } finally {
      setImportingClip(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4"
      role="dialog"
      aria-modal="true"
      aria-label={`Estados de Animación ${mode.toUpperCase()}`}
      onKeyDown={(e) => e.stopPropagation()}
    >
      <div className="flex h-[84vh] max-h-[720px] w-full max-w-6xl flex-col overflow-hidden rounded-xl border border-[#32323c] bg-[#16161b] text-zinc-100 shadow-2xl">
        <header className="flex items-center justify-between border-b border-[#2b2b34] bg-[#1d1d24] px-4 py-3">
          <div className="flex items-center gap-2.5">
            <GitBranch className="h-4 w-4 text-violet-400" />
            <div>
              <h2 className="text-sm font-bold">
                Máquina de Estados de Animación {mode.toUpperCase()} · {objectName}
              </h2>
              <p className="text-[11px] text-zinc-400">
                {mode === '2d'
                  ? 'Conecta clips o rangos de spritesheet (Reposo ↔ Caminar ↔ Correr ↔ Saltar) con transiciones automáticas.'
                  : 'Conecta clips del modelo .glb/.fbx (o importa animaciones .glb/.fbx por estado) con flechas bidireccionales y crossfade suave.'}
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            aria-label="Cerrar editor de animación"
            className="rounded p-1.5 text-zinc-400 hover:bg-[#2a2a33] hover:text-white"
          >
            <X className="h-4 w-4" />
          </button>
        </header>

        <div className="flex min-h-0 flex-1 overflow-hidden">
          {/* Grafo visual */}
          <div className="relative flex-1 overflow-hidden bg-[#101015]">
            <div
              className="pointer-events-none absolute inset-0 opacity-20"
              style={{
                backgroundImage:
                  'radial-gradient(#3f3f4e 1px, transparent 1px)',
                backgroundSize: '20px 20px',
              }}
            />

            <div className="absolute left-3 right-3 top-3 z-10 flex flex-wrap items-center justify-between gap-1.5 pointer-events-none">
              <div className="flex flex-wrap items-center gap-1.5 pointer-events-auto">
                <button
                  type="button"
                  onClick={addState}
                  className="inline-flex items-center gap-1 rounded bg-violet-600 px-2.5 py-1 text-xs font-semibold text-white hover:bg-violet-500"
                >
                  <Plus className="h-3.5 w-3.5" />
                  <span>Nuevo Estado</span>
                </button>
                <button
                  type="button"
                  disabled={draft.states.length < 2}
                  onClick={() => addTransition(false)}
                  className="inline-flex items-center gap-1 rounded border border-[#363644] bg-[#22222b] px-2.5 py-1 text-xs font-semibold text-zinc-200 hover:bg-[#2d2d39] disabled:opacity-40"
                >
                  <Plus className="h-3.5 w-3.5" />
                  <span>Transición (→)</span>
                </button>
                <button
                  type="button"
                  disabled={draft.states.length < 2}
                  onClick={() => addTransition(true)}
                  className="inline-flex items-center gap-1 rounded border border-violet-500/40 bg-violet-600/20 px-2.5 py-1 text-xs font-semibold text-violet-200 hover:bg-violet-600/35 disabled:opacity-40"
                >
                  <ArrowLeftRight className="h-3.5 w-3.5" />
                  <span>Ida y vuelta (↔)</span>
                </button>
                <button
                  type="button"
                  disabled={draft.states.length < 1}
                  onClick={() => {
                    const toNode = selectedState ?? draft.states[0];
                    if (!toNode) return;
                    const tr: AnimStateTransition = {
                      id: createId('tr'),
                      fromStateId: '*',
                      toStateId: toNode.id,
                      conditionExpr: 'manual',
                      blendDuration: mode === '2d' ? 0.05 : 0.15,
                    };
                    setDraft((prev) => ({ ...prev, transitions: [...prev.transitions, tr] }));
                    setSelectedTransitionId(tr.id);
                  }}
                  title="Transición global desde Any State hacia el estado seleccionado"
                  className="inline-flex items-center gap-1 rounded border border-amber-500/40 bg-amber-500/15 px-2 py-1 text-xs font-semibold text-amber-200 hover:bg-amber-500/25 disabled:opacity-40"
                >
                  <Zap className="h-3.5 w-3.5" />
                  <span>Desde Any State</span>
                </button>
              </div>

              <div className="flex flex-wrap items-center gap-1 pointer-events-auto">
                <span className="text-[10px] text-zinc-400 mr-0.5">+ Rápido:</span>
                {QUICK_STATE_PRESETS.map((qp) => (
                  <button
                    key={qp.name}
                    type="button"
                    onClick={() => addQuickState(qp.name)}
                    className="rounded border border-[#2f2f3d] bg-[#1a1a24] px-1.5 py-0.5 text-[10px] font-medium text-zinc-300 hover:border-violet-400 hover:text-white"
                  >
                    +{qp.name}
                  </button>
                ))}
              </div>
            </div>

            {/* Líneas y flechas curvas SVG animadas entre nodos */}
            <svg className="absolute inset-0 h-full w-full">
              <defs>
                <marker
                  id="nx-anim-arrow"
                  markerWidth="8"
                  markerHeight="8"
                  refX="7"
                  refY="4"
                  orient="auto"
                >
                  <path d="M0,0 L8,4 L0,8 Z" fill="#a78bfa" />
                </marker>
                <marker
                  id="nx-anim-arrow-sel"
                  markerWidth="8"
                  markerHeight="8"
                  refX="7"
                  refY="4"
                  orient="auto"
                >
                  <path d="M0,0 L8,4 L0,8 Z" fill="#34d399" />
                </marker>
                <marker
                  id="nx-anim-arrow-any"
                  markerWidth="8"
                  markerHeight="8"
                  refX="7"
                  refY="4"
                  orient="auto"
                >
                  <path d="M0,0 L8,4 L0,8 Z" fill="#f59e0b" />
                </marker>
              </defs>

              {/* Flecha Entry -> Estado inicial */}
              {(() => {
                const initNode = draft.states.find((s) => s.id === draft.initialStateId);
                if (!initNode) return null;
                const ex1 = 56;
                const ey1 = 80;
                const ex2 = initNode.x + 12;
                const ey2 = initNode.y + 24;
                return (
                  <path
                    d={`M ${ex1} ${ey1} L ${ex2} ${ey2}`}
                    fill="none"
                    stroke="#10b981"
                    strokeWidth={2}
                    markerEnd="url(#nx-anim-arrow-sel)"
                  />
                );
              })()}

              {draft.transitions.map((tr) => {
                const isAny = tr.fromStateId === '*';
                const from = isAny
                  ? { x: anyNodePos.x, y: anyNodePos.y }
                  : draft.states.find((s) => s.id === tr.fromStateId);
                const to = draft.states.find((s) => s.id === tr.toStateId);
                if (!from || !to) return null;

                const x1 = from.x + (isAny ? 70 : 84);
                const y1 = from.y + (isAny ? 22 : 32);
                const x2 = to.x + 84;
                const y2 = to.y + 32;
                const dx = x2 - x1;
                const dy = y2 - y1;
                const dist = Math.max(1, Math.hypot(dx, dy));
                const nx = -dy / dist;
                const ny = dx / dist;

                const hasReverse =
                  !isAny &&
                  draft.transitions.some(
                    (other) => other.fromStateId === tr.toStateId && other.toStateId === tr.fromStateId
                  );
                const curveOffset = hasReverse ? 46 : isAny ? 22 : 12;
                const cx = (x1 + x2) * 0.5 + nx * curveOffset;
                const cy = (y1 + y2) * 0.5 + ny * curveOffset;

                const pad = 28;
                const tx2 = x2 - (dx / dist) * pad;
                const ty2 = y2 - (dy / dist) * pad;

                const lx = 0.25 * x1 + 0.5 * cx + 0.25 * tx2;
                const ly = 0.25 * y1 + 0.5 * cy + 0.25 * ty2;
                const isSel = selectedTransitionId === tr.id;

                return (
                  <g
                    key={tr.id}
                    className="cursor-pointer"
                    onClick={() => setSelectedTransitionId(tr.id)}
                  >
                    <path
                      d={`M ${x1} ${y1} Q ${cx} ${cy} ${tx2} ${ty2}`}
                      fill="none"
                      stroke={isSel ? '#34d399' : isAny ? '#f59e0b' : '#8b5cf6'}
                      strokeWidth={isSel ? 2.5 : 2}
                      strokeDasharray="7 5"
                      markerEnd={
                        isSel
                          ? 'url(#nx-anim-arrow-sel)'
                          : isAny
                            ? 'url(#nx-anim-arrow-any)'
                            : 'url(#nx-anim-arrow)'
                      }
                    >
                      <animate
                        attributeName="stroke-dashoffset"
                        from="24"
                        to="0"
                        dur="0.85s"
                        repeatCount="indefinite"
                      />
                    </path>
                    <rect
                      x={lx - 54}
                      y={ly - 10}
                      width={108}
                      height={20}
                      rx={4}
                      fill={isSel ? '#0f2920' : isAny ? '#261b0c' : '#181822'}
                      stroke={isSel ? '#34d399' : isAny ? '#d97706' : '#4c1d95'}
                    />
                    <text
                      x={lx}
                      y={ly + 3.5}
                      textAnchor="middle"
                      fontSize="9.5"
                      fill={isSel ? '#a7f3d0' : isAny ? '#fde68a' : '#ddd6fe'}
                      fontFamily="monospace"
                    >
                      {tr.conditionExpr.slice(0, 17)}
                    </text>
                  </g>
                );
              })}
            </svg>

            {/* Nodo virtual Entry */}
            <div
              style={{ left: '16px', top: '64px' }}
              className="pointer-events-none absolute flex items-center gap-1 rounded-full border border-emerald-500/60 bg-emerald-950/80 px-2.5 py-1 text-[10px] font-bold text-emerald-300 shadow"
            >
              <Play className="h-2.5 w-2.5 fill-current" />
              <span>Entry</span>
            </div>

            {/* Nodo virtual Any State arrastrable */}
            <div
              style={{ left: `${anyNodePos.x}px`, top: `${anyNodePos.y}px` }}
              onPointerDown={(e) => {
                (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
                dragRef.current = {
                  id: '__any__',
                  startX: e.clientX,
                  startY: e.clientY,
                  nodeX: anyNodePos.x,
                  nodeY: anyNodePos.y,
                };
              }}
              onPointerMove={(e) => {
                const d = dragRef.current;
                if (!d || d.id !== '__any__') return;
                setAnyNodePos({
                  x: Math.max(90, Math.round(d.nodeX + (e.clientX - d.startX))),
                  y: Math.max(48, Math.round(d.nodeY + (e.clientY - d.startY))),
                });
              }}
              onPointerUp={(e) => {
                if (dragRef.current?.id === '__any__') dragRef.current = null;
                if ((e.currentTarget as HTMLElement).hasPointerCapture(e.pointerId)) {
                  (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
                }
              }}
              className="absolute flex cursor-move select-none items-center gap-1.5 rounded-lg border border-amber-500/60 bg-[#2a1f10] px-3 py-1.5 text-[11px] font-bold text-amber-200 shadow-lg"
            >
              <Zap className="h-3.5 w-3.5 text-amber-400" />
              <span>Any State (Global)</span>
            </div>

            {/* Tarjetas de estado arrastrables */}
            {draft.states.map((st) => {
              const isInit = draft.initialStateId === st.id;
              const isSel = selectedState?.id === st.id;
              const isSimActive = simRunning && simState.currentStateId === st.id;
              const linkedAsset = st.assetId ? assets.find((a) => a.id === st.assetId) : null;
              return (
                <div
                  key={st.id}
                  style={{ left: `${st.x}px`, top: `${st.y}px` }}
                  onPointerDown={(e) => {
                    setSelectedStateId(st.id);
                    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
                    dragRef.current = {
                      id: st.id,
                      startX: e.clientX,
                      startY: e.clientY,
                      nodeX: st.x,
                      nodeY: st.y,
                    };
                  }}
                  onPointerMove={(e) => {
                    const d = dragRef.current;
                    if (!d || d.id !== st.id) return;
                    const nx = Math.max(16, Math.round(d.nodeX + (e.clientX - d.startX)));
                    const ny = Math.max(52, Math.round(d.nodeY + (e.clientY - d.startY)));
                    setDraft((prev) => ({
                      ...prev,
                      states: prev.states.map((n) =>
                        n.id === st.id ? { ...n, x: nx, y: ny } : n
                      ),
                    }));
                  }}
                  onPointerUp={(e) => {
                    if (dragRef.current?.id === st.id) dragRef.current = null;
                    if ((e.currentTarget as HTMLElement).hasPointerCapture(e.pointerId)) {
                      (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
                    }
                  }}
                  className={`absolute w-44 cursor-move select-none rounded-lg border px-2.5 py-2 shadow-lg transition-colors ${
                    isSimActive
                      ? 'border-emerald-400 bg-[#142c24] ring-2 ring-emerald-400/70'
                      : isSel
                        ? 'border-violet-400 bg-[#25203b] ring-1 ring-violet-400/50'
                        : 'border-[#333340] bg-[#1b1b24] hover:border-[#4b4b5c]'
                  }`}
                >
                  <div className="flex items-center justify-between gap-1">
                    <span className="truncate text-xs font-bold text-white">{st.name}</span>
                    <div className="flex items-center gap-1">
                      {isSimActive && (
                        <span className="rounded bg-emerald-400 px-1 py-0.5 text-[8px] font-black text-black">
                          ACTIVO
                        </span>
                      )}
                      {isInit && (
                        <span className="rounded bg-emerald-500/20 px-1.5 py-0.5 text-[9px] font-bold text-emerald-300">
                          INICIO
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="mt-1 flex items-center gap-1 truncate font-mono text-[10px] text-violet-300">
                    <Film className="h-3 w-3 shrink-0 text-violet-400" />
                    <span className="truncate">
                      {mode === '2d'
                        ? `${st.clipName} (${st.startFrame ?? 0}..${(st.startFrame ?? 0) + Math.max(0, (st.frameCount ?? 1) - 1)})`
                        : st.clipName}
                    </span>
                  </div>
                  {linkedAsset && (
                    <div className="mt-1 truncate rounded bg-emerald-500/10 px-1.5 py-0.5 text-[9px] font-mono text-emerald-300">
                      ✓ {linkedAsset.filename || linkedAsset.name}
                    </div>
                  )}
                  {(st.triggerKey || st.fromAnyState || st.returnMode === 'smart_locomotion') && (
                    <div className="mt-1 flex flex-wrap gap-1 text-[8.5px]">
                      {st.fromAnyState && (
                        <span className="rounded bg-amber-500/20 px-1 py-0.5 font-bold text-amber-300">
                          ANY
                        </span>
                      )}
                      {st.triggerKey && (
                        <span className="rounded bg-sky-500/20 px-1 py-0.5 font-mono font-semibold text-sky-200">
                          ⌨ {st.triggerKey}
                        </span>
                      )}
                      {st.returnMode === 'smart_locomotion' && (
                        <span className="rounded bg-emerald-500/20 px-1 py-0.5 font-semibold text-emerald-300">
                          ↩ Auto-Locomoción
                        </span>
                      )}
                    </div>
                  )}
                </div>
              );
            })}

            {/* Barra inferior: Simulador de estados en vivo */}
            <div className="absolute bottom-2.5 left-3 right-3 z-10 flex flex-wrap items-center justify-between gap-2 rounded-lg border border-[#2c2c38] bg-[#14141b]/95 px-2.5 py-1.5 backdrop-blur">
              <div className="flex items-center gap-1.5 text-[10px]">
                <span className="font-bold uppercase tracking-wide text-emerald-300">
                  Simulador en vivo:
                </span>
                <span className="rounded bg-[#1f1f2b] px-1.5 py-0.5 font-mono text-zinc-200">
                  {simRunning
                    ? `${simLabel} → ${draft.states.find((s) => s.id === simState.currentStateId)?.name ?? '?'}`
                    : 'Pulsa un botón para probar'}
                </span>
              </div>
              <div className="flex flex-wrap items-center gap-1">
                <button
                  type="button"
                  onClick={() => runSimProbe('Reposo', { speed: 0, vy: 0, isGrounded: true })}
                  className="rounded border border-[#323240] bg-[#1e1e28] px-1.5 py-0.5 text-[10px] text-zinc-200 hover:border-emerald-400"
                >
                  Reposo
                </button>
                <button
                  type="button"
                  onClick={() => runSimProbe('Caminar', { speed: 4.5, vy: 0, isGrounded: true })}
                  className="rounded border border-[#323240] bg-[#1e1e28] px-1.5 py-0.5 text-[10px] text-zinc-200 hover:border-emerald-400"
                >
                  Caminar
                </button>
                <button
                  type="button"
                  onClick={() =>
                    runSimProbe('Correr', {
                      speed: 8.5,
                      vy: 0,
                      isGrounded: true,
                      keysHeld: ['ShiftLeft'],
                    })
                  }
                  className="rounded border border-[#323240] bg-[#1e1e28] px-1.5 py-0.5 text-[10px] text-zinc-200 hover:border-emerald-400"
                >
                  Correr (Shift)
                </button>
                <button
                  type="button"
                  onClick={() =>
                    runSimProbe('Saltar (Space)', {
                      speed: 2,
                      vy: 7,
                      isGrounded: true,
                      keysJustPressed: ['Space'],
                    })
                  }
                  className="rounded border border-sky-500/40 bg-sky-500/15 px-1.5 py-0.5 text-[10px] text-sky-200 hover:bg-sky-500/25"
                >
                  Saltar (Space)
                </button>
                <button
                  type="button"
                  onClick={() =>
                    runSimProbe('Aterrizar corriendo', {
                      speed: 8.5,
                      vy: 0,
                      isGrounded: true,
                      keysHeld: ['ShiftLeft'],
                    })
                  }
                  className="rounded border border-emerald-500/40 bg-emerald-500/15 px-1.5 py-0.5 text-[10px] text-emerald-200 hover:bg-emerald-500/25"
                >
                  Aterrizar corriendo
                </button>
                <button
                  type="button"
                  onClick={() =>
                    runSimProbe('Aterrizar quieto', {
                      speed: 0,
                      vy: 0,
                      isGrounded: true,
                    })
                  }
                  className="rounded border border-[#323240] bg-[#1e1e28] px-1.5 py-0.5 text-[10px] text-zinc-200 hover:border-emerald-400"
                >
                  Aterrizar quieto
                </button>
                <button
                  type="button"
                  onClick={() => runSimProbe('Caer', { speed: 2, vy: -5, isGrounded: false })}
                  className="rounded border border-[#323240] bg-[#1e1e28] px-1.5 py-0.5 text-[10px] text-zinc-200 hover:border-emerald-400"
                >
                  Caer ↓
                </button>
                <button
                  type="button"
                  onClick={() =>
                    runSimProbe('Atacar', {
                      speed: 0,
                      vy: 0,
                      isGrounded: true,
                      forceStateName: 'Attack',
                    })
                  }
                  className="rounded border border-amber-500/40 bg-amber-500/15 px-1.5 py-0.5 text-[10px] text-amber-200 hover:bg-amber-500/25"
                >
                  Atacar
                </button>
                <button
                  type="button"
                  onClick={() =>
                    runSimProbe('Fin Clip', {
                      speed: 0,
                      vy: 0,
                      isGrounded: true,
                      animFinished: true,
                    })
                  }
                  className="rounded border border-violet-500/40 bg-violet-500/15 px-1.5 py-0.5 text-[10px] text-violet-200 hover:bg-violet-500/25"
                >
                  Al terminar clip
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setSimRunning(false);
                    setSimState({
                      currentStateId: draft.initialStateId || draft.states[0]?.id || '',
                      previousStateId: null,
                      blendRemaining: 0,
                      blendTotal: 0,
                    });
                  }}
                  title="Reiniciar simulador al estado inicial"
                  className="rounded border border-[#323240] bg-[#1e1e28] p-1 text-zinc-400 hover:text-white"
                >
                  <RotateCcw className="h-3 w-3" />
                </button>
              </div>
            </div>
          </div>

          {/* Inspector lateral del estado y sus transiciones */}
          <aside className="w-88 shrink-0 overflow-y-auto border-l border-[#2b2b34] bg-[#18181e] p-3 pb-6 space-y-4">
            {selectedState && (
              <div className="space-y-2.5 rounded border border-[#2d2d37] bg-[#1e1e26] p-2.5">
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-bold uppercase tracking-wide text-violet-300">
                    Estado seleccionado
                  </span>
                  {draft.states.length > 1 && (
                    <button
                      type="button"
                      onClick={() => {
                        const rem = draft.states.filter((s) => s.id !== selectedState.id);
                        setDraft((prev) => ({
                          ...prev,
                          initialStateId:
                            prev.initialStateId === selectedState.id
                              ? rem[0]?.id ?? ''
                              : prev.initialStateId,
                          states: rem,
                          transitions: prev.transitions.filter(
                            (t) =>
                              t.fromStateId !== selectedState.id &&
                              t.toStateId !== selectedState.id
                          ),
                        }));
                        setSelectedStateId(rem[0]?.id ?? '');
                      }}
                      className="rounded p-1 text-zinc-400 hover:text-red-400"
                      title="Eliminar estado"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  )}
                </div>

                <div>
                  <label className="mb-0.5 block text-[10px] text-zinc-400">Nombre del estado</label>
                  <input
                    type="text"
                    aria-label="Nombre del estado"
                    value={selectedState.name}
                    onChange={(e) =>
                      setDraft((prev) => ({
                        ...prev,
                        states: prev.states.map((s) =>
                          s.id === selectedState.id ? { ...s, name: e.target.value } : s
                        ),
                      }))
                    }
                    className="w-full rounded border border-[#32323c] bg-[#121216] px-2 py-1 text-xs text-white"
                  />
                </div>

                {mode === '3d' ? (
                  <>
                    <div>
                      <label className="mb-0.5 block text-[10px] text-zinc-400">
                        Clip de animación (.glb)
                      </label>
                      {allClipOptions.length > 0 ? (
                        <select
                          aria-label="Clip del estado"
                          value={selectedState.clipName}
                          onChange={(e) =>
                            setDraft((prev) => ({
                              ...prev,
                              states: prev.states.map((s) =>
                                s.id === selectedState.id
                                  ? { ...s, clipName: e.target.value }
                                  : s
                              ),
                            }))
                          }
                          className="w-full rounded border border-[#32323c] bg-[#121216] px-2 py-1 text-xs text-white"
                        >
                          {allClipOptions.map((c) => (
                            <option key={c} value={c}>
                              {c}
                            </option>
                          ))}
                        </select>
                      ) : (
                        <input
                          type="text"
                          value={selectedState.clipName}
                          onChange={(e) =>
                            setDraft((prev) => ({
                              ...prev,
                              states: prev.states.map((s) =>
                                s.id === selectedState.id
                                  ? { ...s, clipName: e.target.value }
                                  : s
                              ),
                            }))
                          }
                          className="w-full rounded border border-[#32323c] bg-[#121216] px-2 py-1 text-xs text-white"
                        />
                      )}
                    </div>

                    <div className="space-y-1 rounded border border-[#2c2c38] bg-[#15151c] p-2">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-[10px] font-medium text-zinc-300">
                          GLB / FBX con animación independiente
                        </span>
                        <input
                          ref={fileInputRef}
                          type="file"
                          accept=".glb,.gltf,.fbx"
                          className="hidden"
                          onChange={(e) => {
                            const files = Array.from(e.target.files ?? []);
                            if (files.length > 0) void handleUploadStateGlb(files);
                            e.target.value = '';
                          }}
                        />
                        <button
                          type="button"
                          disabled={importingClip}
                          onClick={() => fileInputRef.current?.click()}
                          className="inline-flex items-center gap-1 rounded border border-violet-500/40 bg-violet-600/20 px-2 py-0.5 text-[10px] font-semibold text-violet-200 hover:bg-violet-600/35 disabled:opacity-50"
                        >
                          <Upload className="h-3 w-3" />
                          <span>{importingClip ? 'Cargando...' : 'Importar GLB/FBX'}</span>
                        </button>
                      </div>
                      <select
                        aria-label="Recurso GLB o FBX de este estado"
                        value={selectedState.assetId ?? ''}
                        onChange={async (e) => {
                          const aid = e.target.value || null;
                          let firstClip: string | undefined;
                          if (aid && assetBlobs?.get(aid)) {
                            const meta = assets.find((a) => a.id === aid);
                            const clips = await extractModelClips(
                              assetBlobs.get(aid)!,
                              meta?.format ?? meta?.filename
                            );
                            if (clips.length > 0) {
                              setDiscoveredClips((prev) => Array.from(new Set([...prev, ...clips])));
                              firstClip = clips[0];
                            }
                          }
                          setDraft((prev) => ({
                            ...prev,
                            states: prev.states.map((s) =>
                              s.id === selectedState.id
                                ? { ...s, assetId: aid, clipName: firstClip ?? s.clipName }
                                : s
                            ),
                          }));
                        }}
                        className="w-full rounded border border-[#32323c] bg-[#121216] px-1.5 py-1 text-[11px] text-zinc-200"
                      >
                        <option value="">(Usar modelo base del objeto)</option>
                        {modelAssets.map((a) => (
                          <option key={a.id} value={a.id}>
                            {a.name}
                          </option>
                        ))}
                      </select>
                    </div>
                  </>
                ) : (
                  /* Controles de Spritesheet 2D por estado */
                  <div className="space-y-2 rounded border border-[#2c2c38] bg-[#15151c] p-2">
                    <div>
                      <label className="mb-0.5 block text-[10px] text-zinc-400">
                        Spritesheet 2D del estado (opcional)
                      </label>
                      <select
                        aria-label="Spritesheet del estado 2D"
                        value={selectedState.assetId ?? ''}
                        onChange={(e) =>
                          setDraft((prev) => ({
                            ...prev,
                            states: prev.states.map((s) =>
                              s.id === selectedState.id
                                ? { ...s, assetId: e.target.value || null }
                                : s
                            ),
                          }))
                        }
                        className="w-full rounded border border-[#32323c] bg-[#121216] px-1.5 py-1 text-[11px] text-zinc-200"
                      >
                        <option value="">(Usar spritesheet actual del sprite)</option>
                        {imageAssets.map((a) => (
                          <option key={a.id} value={a.id}>
                            {a.name}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div className="grid grid-cols-2 gap-1.5">
                      <div>
                        <label className="block text-[10px] text-zinc-400">Cols</label>
                        <NumericInput
                          aria-label="Columnas del estado"
                          min={1}
                          max={64}
                          step={1}
                          value={selectedState.cols ?? 4}
                          onChange={(cols) =>
                            setDraft((prev) => ({
                              ...prev,
                              states: prev.states.map((s) =>
                                s.id === selectedState.id ? { ...s, cols: Math.max(1, Math.round(cols)) } : s
                              ),
                            }))
                          }
                          className="w-full rounded border border-[#32323c] bg-[#121216] px-1.5 py-1 font-mono text-xs text-white"
                        />
                      </div>
                      <div>
                        <label className="block text-[10px] text-zinc-400">Filas</label>
                        <NumericInput
                          aria-label="Filas del estado"
                          min={1}
                          max={64}
                          step={1}
                          value={selectedState.rows ?? 1}
                          onChange={(rows) =>
                            setDraft((prev) => ({
                              ...prev,
                              states: prev.states.map((s) =>
                                s.id === selectedState.id ? { ...s, rows: Math.max(1, Math.round(rows)) } : s
                              ),
                            }))
                          }
                          className="w-full rounded border border-[#32323c] bg-[#121216] px-1.5 py-1 font-mono text-xs text-white"
                        />
                      </div>
                      <div>
                        <label className="block text-[10px] text-zinc-400">Frame inicio</label>
                        <NumericInput
                          aria-label="Frame inicial"
                          min={0}
                          max={512}
                          step={1}
                          value={selectedState.startFrame ?? 0}
                          onChange={(startFrame) =>
                            setDraft((prev) => ({
                              ...prev,
                              states: prev.states.map((s) =>
                                s.id === selectedState.id
                                  ? { ...s, startFrame: Math.max(0, Math.round(startFrame)) }
                                  : s
                              ),
                            }))
                          }
                          className="w-full rounded border border-[#32323c] bg-[#121216] px-1.5 py-1 font-mono text-xs text-white"
                        />
                      </div>
                      <div>
                        <label className="block text-[10px] text-zinc-400">Cant. frames</label>
                        <NumericInput
                          aria-label="Cantidad de frames"
                          min={1}
                          max={512}
                          step={1}
                          value={selectedState.frameCount ?? 4}
                          onChange={(frameCount) =>
                            setDraft((prev) => ({
                              ...prev,
                              states: prev.states.map((s) =>
                                s.id === selectedState.id
                                  ? { ...s, frameCount: Math.max(1, Math.round(frameCount)) }
                                  : s
                              ),
                            }))
                          }
                          className="w-full rounded border border-[#32323c] bg-[#121216] px-1.5 py-1 font-mono text-xs text-white"
                        />
                      </div>
                    </div>

                    {/* Selector visual de fotogramas de spritesheet */}
                    {sheetPreviewUrl && (() => {
                      const cols = Math.max(1, Math.min(16, selectedState.cols ?? 4));
                      const rows = Math.max(1, Math.min(16, selectedState.rows ?? 1));
                      const startF = selectedState.startFrame ?? 0;
                      const countF = Math.max(1, selectedState.frameCount ?? 1);
                      const endF = startF + countF - 1;
                      const totalCells = cols * rows;
                      return (
                        <div className="space-y-1 pt-1">
                          <div className="text-[10px] text-zinc-400">
                            Clic = inicio · Shift+clic = rango ({startF}..{endF})
                          </div>
                          <div className="relative overflow-hidden rounded border border-[#2f2f3d] bg-[#0b0b0f]">
                            <img
                              src={sheetPreviewUrl}
                              alt="Spritesheet"
                              className="block w-full h-24 object-fill opacity-90"
                              style={{ imageRendering: 'pixelated' }}
                            />
                            <div
                              className="absolute inset-0 grid"
                              style={{
                                gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))`,
                                gridTemplateRows: `repeat(${rows}, minmax(0, 1fr))`,
                              }}
                            >
                              {Array.from({ length: totalCells }, (_, idx) => {
                                const inRange = idx >= startF && idx <= endF;
                                return (
                                  <button
                                    key={idx}
                                    type="button"
                                    onClick={(ev) => {
                                      setDraft((prev) => ({
                                        ...prev,
                                        states: prev.states.map((s) => {
                                          if (s.id !== selectedState.id) return s;
                                          if (ev.shiftKey) {
                                            const curStart = s.startFrame ?? 0;
                                            const lo = Math.min(curStart, idx);
                                            const hi = Math.max(curStart, idx);
                                            return { ...s, startFrame: lo, frameCount: hi - lo + 1 };
                                          }
                                          return { ...s, startFrame: idx };
                                        }),
                                      }));
                                    }}
                                    className={`flex items-start justify-start border p-0.5 text-[8px] font-mono ${
                                      inRange
                                        ? 'border-emerald-400 bg-emerald-500/25 text-emerald-100 font-bold'
                                        : 'border-white/15 bg-black/20 text-white/60 hover:bg-violet-500/25'
                                    }`}
                                  >
                                    {idx}
                                  </button>
                                );
                              })}
                            </div>
                          </div>
                        </div>
                      );
                    })()}
                  </div>
                )}

                <div className="grid grid-cols-2 gap-1.5">
                  <div>
                    <label className="block text-[10px] text-zinc-400">
                      {mode === '2d' ? 'Vel. (FPS × escala)' : 'Velocidad'}
                    </label>
                    <NumericInput
                      aria-label="Velocidad de estado"
                      step={0.1}
                      min={0.1}
                      max={10}
                      precision={2}
                      value={selectedState.timeScale}
                      onChange={(val) =>
                        setDraft((prev) => ({
                          ...prev,
                          states: prev.states.map((s) =>
                            s.id === selectedState.id ? { ...s, timeScale: val } : s
                          ),
                        }))
                      }
                      className="w-full rounded border border-[#32323c] bg-[#121216] px-2 py-1 font-mono text-xs text-white"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] text-zinc-400">Bucle</label>
                    <select
                      value={selectedState.loopMode}
                      onChange={(e) =>
                        setDraft((prev) => ({
                          ...prev,
                          states: prev.states.map((s) =>
                            s.id === selectedState.id
                              ? {
                                  ...s,
                                  loopMode: e.target.value as
                                    | 'LoopRepeat'
                                    | 'LoopOnce'
                                    | 'LoopPingPong',
                                }
                              : s
                          ),
                        }))
                      }
                      className="w-full rounded border border-[#32323c] bg-[#121216] px-1.5 py-1 text-xs text-white"
                    >
                      <option value="LoopRepeat">Repetir</option>
                      <option value="LoopOnce">Una vez</option>
                      <option value="LoopPingPong">Ping-Pong</option>
                    </select>
                  </div>
                </div>

                {/* Disparo por tecla / Cualquier estado / Retorno inteligente */}
                <div className="space-y-1.5 rounded border border-sky-500/25 bg-[#14151e] p-2">
                  <div className="text-[10px] font-semibold uppercase tracking-wide text-sky-300">
                    Disparador por tecla y Retorno
                  </div>
                  <div className="grid grid-cols-[1fr_auto] gap-1.5 items-center">
                    <KeyCaptureField
                      ariaLabel="Tecla activadora del estado"
                      value={selectedState.triggerKey ?? ''}
                      onChange={(triggerKey) =>
                        setDraft((prev) => ({
                          ...prev,
                          states: prev.states.map((s) =>
                            s.id === selectedState.id ? { ...s, triggerKey: triggerKey || undefined } : s
                          ),
                        }))
                      }
                    />
                    <select
                      aria-label="Modo de tecla"
                      value={selectedState.triggerKeyMode ?? 'pressed'}
                      onChange={(e) =>
                        setDraft((prev) => ({
                          ...prev,
                          states: prev.states.map((s) =>
                            s.id === selectedState.id
                              ? { ...s, triggerKeyMode: e.target.value as 'pressed' | 'held' }
                              : s
                          ),
                        }))
                      }
                      className="rounded border border-[#32323c] bg-[#121216] px-1.5 py-1 text-[10px] text-white"
                    >
                      <option value="pressed">Al pulsar</option>
                      <option value="held">Manteniendo</option>
                    </select>
                  </div>

                  <label className="flex items-center gap-1.5 text-[11px] text-amber-200 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={Boolean(selectedState.fromAnyState)}
                      onChange={(e) =>
                        setDraft((prev) => ({
                          ...prev,
                          states: prev.states.map((s) =>
                            s.id === selectedState.id ? { ...s, fromAnyState: e.target.checked } : s
                          ),
                        }))
                      }
                      className="accent-amber-500"
                    />
                    <span>Activar desde cualquier estado (Idle/Walk/Run)</span>
                  </label>

                  <div className="grid grid-cols-2 gap-1.5">
                    <div>
                      <label className="block text-[9.5px] text-zinc-400">Al volver</label>
                      <select
                        aria-label="Modo de retorno del estado"
                        value={selectedState.returnMode ?? 'none'}
                        onChange={(e) =>
                          setDraft((prev) => ({
                            ...prev,
                            states: prev.states.map((s) =>
                              s.id === selectedState.id
                                ? {
                                    ...s,
                                    returnMode:
                                      e.target.value === 'none'
                                        ? undefined
                                        : (e.target.value as 'smart_locomotion' | 'idle' | 'state'),
                                    returnOn:
                                      s.returnOn ??
                                      (s.name.toLowerCase().includes('jump') ? 'grounded' : 'animFinished'),
                                  }
                                : s
                            ),
                          }))
                        }
                        className="w-full rounded border border-[#32323c] bg-[#121216] px-1.5 py-1 text-[10px] text-white"
                      >
                        <option value="none">(Usar flechas normales)</option>
                        <option value="smart_locomotion">Locomoción inteligente (Run/Walk/Idle)</option>
                        <option value="idle">Volver siempre a Idle</option>
                        <option value="state">Volver a estado específico</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-[9.5px] text-zinc-400">Cuándo volver</label>
                      <select
                        aria-label="Condición de retorno"
                        value={selectedState.returnOn ?? 'auto'}
                        onChange={(e) =>
                          setDraft((prev) => ({
                            ...prev,
                            states: prev.states.map((s) =>
                              s.id === selectedState.id
                                ? { ...s, returnOn: e.target.value as 'auto' | 'grounded' | 'animFinished' | 'keyReleased' }
                                : s
                            ),
                          }))
                        }
                        className="w-full rounded border border-[#32323c] bg-[#121216] px-1.5 py-1 text-[10px] text-white"
                      >
                        <option value="auto">Automático</option>
                        <option value="grounded">Al caer al suelo</option>
                        <option value="animFinished">Al terminar animación</option>
                        <option value="keyReleased">Al soltar tecla</option>
                      </select>
                    </div>
                  </div>

                  {selectedState.returnMode === 'state' && (
                    <select
                      aria-label="Estado destino de retorno"
                      value={selectedState.returnStateId ?? ''}
                      onChange={(e) =>
                        setDraft((prev) => ({
                          ...prev,
                          states: prev.states.map((s) =>
                            s.id === selectedState.id ? { ...s, returnStateId: e.target.value } : s
                          ),
                        }))
                      }
                      className="w-full rounded border border-[#32323c] bg-[#121216] px-1.5 py-1 text-[10px] text-white"
                    >
                      <option value="">Seleccionar estado destino...</option>
                      {draft.states
                        .filter((s) => s.id !== selectedState.id)
                        .map((s) => (
                          <option key={s.id} value={s.id}>
                            {s.name}
                          </option>
                        ))}
                    </select>
                  )}
                </div>

                {/* Eventos por fotograma (Frame Events) */}
                <div className="space-y-1.5 rounded border border-emerald-500/25 bg-[#121917] p-2">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] font-semibold uppercase tracking-wide text-emerald-300">
                      Eventos por Fotograma ({selectedState.frameEvents?.length ?? 0})
                    </span>
                    <button
                      type="button"
                      onClick={() => {
                        const newFe: AnimationFrameEvent = {
                          id: createId('fe'),
                          clipName: selectedState.clipName || selectedState.name,
                          frameIndex: 0,
                          eventName: 'step',
                          soundAssetId: null,
                        };
                        setDraft((prev) => ({
                          ...prev,
                          states: prev.states.map((s) =>
                            s.id === selectedState.id
                              ? { ...s, frameEvents: [...(s.frameEvents ?? []), newFe] }
                              : s
                          ),
                        }));
                      }}
                      className="inline-flex items-center gap-0.5 rounded bg-emerald-600/80 px-1.5 py-0.5 text-[10px] font-semibold text-white hover:bg-emerald-500"
                    >
                      <Plus className="h-2.5 w-2.5" />
                      <span>Evento</span>
                    </button>
                  </div>
                  {(selectedState.frameEvents ?? []).map((fe) => {
                    const audioOpts = (assets ?? []).filter((a) => a.kind === 'audio' || a.mimeType?.startsWith('audio/'));
                    const patchFe = (p: Partial<AnimationFrameEvent>) =>
                      setDraft((prev) => ({
                        ...prev,
                        states: prev.states.map((s) =>
                          s.id === selectedState.id
                            ? {
                                ...s,
                                frameEvents: (s.frameEvents ?? []).map((item) =>
                                  item.id === fe.id ? { ...item, ...p } : item
                                ),
                              }
                            : s
                        ),
                      }));
                    return (
                      <div key={fe.id} className="grid grid-cols-[54px_1fr_auto] gap-1 items-center text-[10px]">
                        <input
                          type="number"
                          min={0}
                          max={240}
                          aria-label="Fotograma del evento"
                          title="Índice de fotograma"
                          value={fe.frameIndex}
                          onChange={(e) =>
                            patchFe({ frameIndex: Math.max(0, Math.round(Number(e.target.value) || 0)) })
                          }
                          className="rounded border border-[#32323c] bg-[#101014] px-1 py-0.5 font-mono text-white"
                        />
                        <input
                          type="text"
                          aria-label="Nombre del evento de fotograma"
                          placeholder="evento (ej. paso, golpe)"
                          value={fe.eventName}
                          onChange={(e) => patchFe({ eventName: e.target.value })}
                          className="min-w-0 rounded border border-[#32323c] bg-[#101014] px-1.5 py-0.5 font-mono text-emerald-200"
                        />
                        <button
                          type="button"
                          onClick={() =>
                            setDraft((prev) => ({
                              ...prev,
                              states: prev.states.map((s) =>
                                s.id === selectedState.id
                                  ? {
                                      ...s,
                                      frameEvents: (s.frameEvents ?? []).filter((x) => x.id !== fe.id),
                                    }
                                  : s
                              ),
                            }))
                          }
                          className="p-0.5 text-zinc-500 hover:text-red-400"
                          title="Eliminar evento"
                        >
                          <Trash2 className="h-3 w-3" />
                        </button>
                        <select
                          aria-label="Sonido del evento de fotograma"
                          value={fe.soundAssetId ?? ''}
                          onChange={(e) => patchFe({ soundAssetId: e.target.value || null })}
                          className="col-span-3 rounded border border-[#32323c] bg-[#101014] px-1.5 py-0.5 text-[10px] text-zinc-200"
                        >
                          <option value="">(Sin sonido en este fotograma)</option>
                          {audioOpts.map((a) => (
                            <option key={a.id} value={a.id}>
                              🔊 {a.name}
                            </option>
                          ))}
                        </select>
                      </div>
                    );
                  })}
                </div>

                <button
                  type="button"
                  onClick={() =>
                    setDraft((prev) => ({ ...prev, initialStateId: selectedState.id }))
                  }
                  className="w-full rounded border border-emerald-500/40 bg-emerald-500/15 py-1 text-[11px] font-semibold text-emerald-300 hover:bg-emerald-500/25"
                >
                  Marcar como estado inicial
                </button>
              </div>
            )}

            {/* Lista de transiciones */}
            <div className="space-y-2">
              <div className="text-[11px] font-bold uppercase tracking-wide text-zinc-300">
                Transiciones ({draft.transitions.length})
              </div>
              {draft.transitions.map((tr) => {
                const isSel = selectedTransitionId === tr.id;
                const hasBack = draft.transitions.some(
                  (t) => t.fromStateId === tr.toStateId && t.toStateId === tr.fromStateId
                );
                return (
                  <div
                    key={tr.id}
                    onClick={() => setSelectedTransitionId(tr.id)}
                    className={`space-y-1.5 rounded border p-2 text-xs ${
                      isSel
                        ? 'border-emerald-500/60 bg-[#1a2623]'
                        : 'border-[#2d2d37] bg-[#1d1d24]'
                    }`}
                  >
                    <div className="grid grid-cols-[1fr_auto_1fr_auto] items-center gap-1">
                      <select
                        value={tr.fromStateId}
                        onChange={(e) =>
                          setDraft((prev) => ({
                            ...prev,
                            transitions: prev.transitions.map((t) =>
                              t.id === tr.id ? { ...t, fromStateId: e.target.value } : t
                            ),
                          }))
                        }
                        className="min-w-0 rounded border border-[#32323c] bg-[#121216] px-1 py-0.5 text-[11px]"
                      >
                        <option value="*">⚡ Cualquier Estado (Any State)</option>
                        {draft.states.map((s) => (
                          <option key={s.id} value={s.id}>
                            {s.name}
                          </option>
                        ))}
                      </select>
                      <span className="text-zinc-500">→</span>
                      <select
                        value={tr.toStateId}
                        onChange={(e) =>
                          setDraft((prev) => ({
                            ...prev,
                            transitions: prev.transitions.map((t) =>
                              t.id === tr.id ? { ...t, toStateId: e.target.value } : t
                            ),
                          }))
                        }
                        className="min-w-0 rounded border border-[#32323c] bg-[#121216] px-1 py-0.5 text-[11px]"
                      >
                        {draft.states.map((s) => (
                          <option key={s.id} value={s.id}>
                            {s.name}
                          </option>
                        ))}
                      </select>
                      <button
                        type="button"
                        onClick={() =>
                          setDraft((prev) => ({
                            ...prev,
                            transitions: prev.transitions.filter((t) => t.id !== tr.id),
                          }))
                        }
                        className="p-0.5 text-zinc-500 hover:text-red-400"
                        title="Eliminar transición"
                      >
                        <Trash2 className="h-3 w-3" />
                      </button>
                    </div>

                    <select
                      aria-label="Preajuste de condición"
                      value={
                        CONDITION_PRESETS.some((p) => p.value === tr.conditionExpr)
                          ? tr.conditionExpr
                          : '__custom__'
                      }
                      onChange={(e) => {
                        if (e.target.value === '__custom__') return;
                        setDraft((prev) => ({
                          ...prev,
                          transitions: prev.transitions.map((t) =>
                            t.id === tr.id ? { ...t, conditionExpr: e.target.value } : t
                          ),
                        }));
                      }}
                      className="w-full rounded border border-[#32323c] bg-[#121216] px-1.5 py-1 text-[11px]"
                    >
                      {CONDITION_PRESETS.map((p) => (
                        <option key={p.value} value={p.value}>
                          {p.label}
                        </option>
                      ))}
                      {!CONDITION_PRESETS.some((p) => p.value === tr.conditionExpr) && (
                        <option value="__custom__">Expresión personalizada...</option>
                      )}
                    </select>

                    <input
                      type="text"
                      aria-label="Expresión de condición"
                      value={tr.conditionExpr}
                      onChange={(e) =>
                        setDraft((prev) => ({
                          ...prev,
                          transitions: prev.transitions.map((t) =>
                            t.id === tr.id ? { ...t, conditionExpr: e.target.value } : t
                          ),
                        }))
                      }
                      placeholder="Ej. speed > 0.1 && keyHeld:ShiftLeft"
                      className="w-full rounded border border-[#32323c] bg-[#121216] px-1.5 py-0.5 font-mono text-[10px] text-zinc-200"
                    />

                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-1.5">
                        <span className="text-[10px] text-zinc-400">Crossfade (s):</span>
                        <NumericInput
                          aria-label="Duración crossfade"
                          step={0.05}
                          min={0}
                          max={2}
                          precision={2}
                          value={tr.blendDuration}
                          onChange={(val) =>
                            setDraft((prev) => ({
                              ...prev,
                              transitions: prev.transitions.map((t) =>
                                t.id === tr.id ? { ...t, blendDuration: Math.max(0, val) } : t
                              ),
                            }))
                          }
                          className="w-14 rounded border border-[#32323c] bg-[#121216] px-1.5 py-0.5 font-mono text-[11px]"
                        />
                      </div>

                      {!hasBack && tr.fromStateId !== tr.toStateId && (
                        <button
                          type="button"
                          onClick={() => addReturnTransition(tr)}
                          className="inline-flex items-center gap-1 rounded border border-violet-500/35 bg-violet-500/15 px-1.5 py-0.5 text-[10px] text-violet-200 hover:bg-violet-500/30"
                          title="Crear flecha de retorno automática"
                        >
                          <ArrowLeftRight className="h-2.5 w-2.5" />
                          <span>Retorno</span>
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </aside>
        </div>

        <footer className="flex items-center justify-end gap-2 border-t border-[#2b2b34] bg-[#1d1d24] px-4 py-2.5">
          <button
            type="button"
            onClick={onClose}
            className="rounded border border-[#343440] px-3 py-1.5 text-xs text-zinc-300 hover:bg-[#2a2a34]"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={() => {
              onSave(draft);
              onClose();
            }}
            className="rounded bg-violet-600 px-4 py-1.5 text-xs font-semibold text-white hover:bg-violet-500"
          >
            Guardar Máquina de Estados
          </button>
        </footer>
      </div>
    </div>
  );
};
