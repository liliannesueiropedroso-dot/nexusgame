import React, { useState } from 'react';
import { ArrowDown, ArrowUp, Link2, Plus, Power, Trash2, Zap } from 'lucide-react';
import { SYNTH_PRESETS } from '../../engine/audio/audioEngine';
import { getBehaviorEntry } from '../../engine/components/behaviorRegistry';
import { BEHAVIOR_DEFINITIONS, getBehaviorLabel } from '../../engine/components/behaviorTypes';
import {
  COLLISION_LAYERS,
  type ActionDefinition,
  type ActionType,
  type ArchetypeId,
  type CollisionLayer,
  type ConditionCombinator,
  type ConditionDefinition,
  type ConditionType,
  type GameMechanic,
  type GameObjectData,
  type MechanicTriggerEvent,
  type ProjectVariable,
  type SceneData,
  type WiringLink,
} from '../../engine/core/types';
import { ARCHETYPE_RECIPES, applyArchetypeToScene } from '../../engine/wiring/archetypes';
import type {
  NexusScriptAsset,
  PrefabDefinition,
  ProjectAssetMeta,
} from '../../project/models/project';
import { createId } from '../../utils/id';
import { KeyCaptureField } from '../common/KeyCaptureField';
import { NumericInput } from '../common/NumericInput';

interface MechanicsPanelProps {
  mechanics: GameMechanic[];
  objects: GameObjectData[];
  variables: ProjectVariable[];
  assets: ProjectAssetMeta[];
  scenes?: SceneData[];
  activeScene?: SceneData;
  selectedObjectId?: string | null;
  prefabs?: PrefabDefinition[];
  scripts?: NexusScriptAsset[];
  onChangeMechanics: (next: GameMechanic[]) => void;
  onUpdateScene?: (updater: (scene: SceneData) => SceneData) => void;
  onUpdateObject?: (id: string, updater: (obj: GameObjectData) => GameObjectData) => void;
  onSelectObjectById?: (id: string) => void;
  onOpenVehicleWizard?: () => void;
}

const TRIGGER_LABELS: Record<MechanicTriggerEvent, string> = {
  'scene.start': 'Al iniciar escena (scene.start)',
  'scene.paused': 'Al pausar escena (scene.paused)',
  tick: 'En cada fotograma (tick)',
  'collision.enter': 'Al iniciar colisión (collision.enter)',
  'collision.stay': 'Mientras colisiona (collision.stay)',
  'collision.exit': 'Al salir de colisión (collision.exit)',
  'trigger.enter': 'Al entrar en sensor (trigger.enter)',
  'trigger.exit': 'Al salir de sensor (trigger.exit)',
  'input.pressed': 'Al pulsar tecla (input.pressed)',
  'input.held': 'Mientras se mantiene tecla (input.held)',
  'input.released': 'Al soltar tecla (input.released)',
  'ui.click': 'Al hacer clic en botón/objeto (ui.click)',
  'mouse.clickGlobal': 'Al hacer clic en pantalla (mouse.clickGlobal)',
  'mouse.hold': 'Mientras se mantiene pulsado ratón/toque (mouse.hold)',
  'mouse.release': 'Al soltar ratón/toque (mouse.release)',
  'touch.swipe': 'Al deslizar dedo / swipe (touch.swipe)',
  'timer.elapsed': 'Cada intervalo de tiempo (timer.elapsed)',
  'countdown.zero': 'Al llegar variable a 0 (countdown.zero)',
  'variable.changed': 'Cuando cambia una variable (variable.changed)',
  'health.zero': 'Cuando la salud llega a 0 (health.zero)',
  'portal.adClosed': 'Portal SDK: Anuncio cerrado (portal.adClosed)',
  'portal.rewarded': 'Portal SDK: Anuncio recompensado (portal.rewarded)',
  'custom.event': 'Al recibir evento personalizado (custom.event)',
};

const ACTION_LABELS: Record<ActionType, string> = {
  'variable.add': 'Sumar a variable',
  'variable.set': 'Asignar variable',
  'audio.beep': 'Reproducir sonido sintetizado',
  'audio.play': 'Reproducir archivo de audio (PC)',
  'music.play': 'Reproducir música de fondo (music.play)',
  'music.stop': 'Detener música de fondo (music.stop)',
  'audio.stopAll': 'Silenciar todos los sonidos (audio.stopAll)',
  'audio.setVolume': 'Ajustar volumen de canal (audio.setVolume)',
  'object.destroy': 'Ocultar / destruir objeto',
  'object.show': 'Mostrar objeto',
  'object.hide': 'Ocultar objeto',
  'object.move': 'Desplazar objeto (dx, dy)',
  'object.teleport': 'Teletransportar objeto (x, y)',
  'object.spawn': 'Clonar / generar objeto (object.spawn)',
  'object.setProperty': 'Modificar propiedad (object.setProperty)',
  'object.rotateToward': 'Rotar mirando a otro objeto',
  'object.flash': 'Destello de color en objeto/pantalla',
  'component.toggle': 'Activar / desactivar comportamiento',
  'physics.impulse': 'Aplicar impulso físico',
  'physics.force': 'Aplicar fuerza continua',
  'physics.setVelocity': 'Fijar velocidad (vx, vy)',
  'health.damage': 'Aplicar daño de salud',
  'health.heal': 'Curar salud',
  'animation.play': 'Cambiar clip de animación',
  'tween.play': 'Reproducir pista Tween (tween.play)',
  'state.set': 'Cambiar estado del objeto',
  'scene.load': 'Cargar otra escena / nivel',
  'scene.overlay': 'Abrir escena superpuesta (Pausa/HUD)',
  'scene.pop': 'Cerrar escena superpuesta actual',
  'scene.restart': 'Reiniciar escena actual',
  'scene.nextLevel': 'Pasar al siguiente nivel',
  'scene.pause': 'Pausar / reanudar juego (scene.pause)',
  'checkpoint.save': 'Guardar checkpoint',
  'prefab.spawn': 'Generar instancia de Prefab',
  'camera.shake': 'Sacudir cámara',
  'particles.burst': 'Emitir ráfaga de partículas',
  'particles.emit': 'Emitir partículas por preset',
  'storage.save': 'Guardar variable persistente',
  'storage.load': 'Cargar variable persistente',
  'leaderboard.submit': 'Enviar puntuación al Ranking',
  'event.emit': 'Emitir evento personalizado',
  'script.call': 'Ejecutar función de Script JS (script.call)',
  'ui.openInterface': 'Abrir Interfaz HTML/CSS/JS',
  'ui.closeInterface': 'Cerrar Interfaz HTML/CSS/JS',
  'ui.toggleInterface': 'Alternar Interfaz HTML/CSS/JS',
  'camera.switch': 'Cambiar Cámara Inteligente 3D',
  'anim3d.setState': 'Cambiar estado Animación 3D',
  'vfx.emit': 'Emitir ráfaga VFX 3D/GPU',
  'ai.chase': 'IA 3D: Perseguir objetivo',
  'ai.moveTo': 'IA 3D: Mover a coordenada',
  'ai.stop': 'IA 3D: Detener agente',
  'dialogue.start': 'Iniciar diálogo ramificado (dialogue.start)',
  'i18n.setLocale': 'Cambiar idioma activo (i18n.setLocale)',
  'vehicle.enterExit': 'Entrar / Salir de Vehículo (Tecla E)',
  wait: 'Esperar N segundos (Wait)',
};

const CONDITION_LABELS: Record<ConditionType, string> = {
  'variable.compare': 'Comparar variable',
  'variable.objectCompare': 'Comparar dos variables',
  boolean: 'Variable booleana verdadera',
  'object.visible': 'Objeto está visible',
  'object.grounded': 'Objeto toca el suelo',
  'object.exists': 'Objeto existe activo',
  'object.property': 'Propiedad de objeto (x, y, rot, escala...)',
  'object.hasTag': 'Objeto tiene etiqueta (tag)',
  'object.animating': 'Objeto está animando sprite',
  'object.flipped': 'Sprite volteado horizontalmente',
  'health.compare': 'Comparar salud de objeto',
  'state.is': 'Estado de objeto es igual a...',
  'input.held': 'Tecla mantenida pulsada',
  'distance.less': 'Distancia entre objetos menor que...',
  'distance.greater': 'Distancia entre objetos mayor que...',
  'random.chance': 'Probabilidad aleatoria (% 0-100)',
};

export const MechanicsPanel: React.FC<MechanicsPanelProps> = ({
  mechanics,
  objects,
  variables,
  assets,
  scenes = [],
  activeScene,
  selectedObjectId,
  prefabs = [],
  scripts = [],
  onChangeMechanics,
  onUpdateScene,
  onUpdateObject,
  onSelectObjectById,
  onOpenVehicleWizard,
}) => {
  const [selectedId, setSelectedId] = useState<string | null>(mechanics[0]?.id ?? null);
  const [viewMode, setViewMode] = useState<'rules' | 'wiring'>('rules');
  const [wireSrcObjId, setWireSrcObjId] = useState<string>('');
  const [wireSrcBeh, setWireSrcBeh] = useState<string>('');
  const [wireSignal, setWireSignal] = useState<string>('onCollected');
  const [wireTgtObjId, setWireTgtObjId] = useState<string>('');
  const [wireTgtBeh, setWireTgtBeh] = useState<string>('');
  const [wireAction, setWireAction] = useState<string>('receiveItem');
  const [archId, setArchId] = useState<ArchetypeId>('collectible');

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

  const audioAssets = assets.filter((a) => a.kind === 'audio');
  const activeMechanic =
    mechanics.find((m) => m.id === selectedId) ?? mechanics[0] ?? null;

  const updateMechanic = (id: string, updater: (m: GameMechanic) => GameMechanic) => {
    onChangeMechanics(mechanics.map((m) => (m.id === id ? updater(m) : m)));
  };

  const handleCreateRule = () => {
    const player = objects.find((o) =>
      o.components.some(
        (c) => c.type === 'player_platformer' || c.type === 'player_topdown'
      )
    );
    const target =
      objects.find((o) => o.id !== player?.id && !o.components.some((c) => c.type === 'solid')) ??
      objects[0];
    const newRule: GameMechanic = {
      id: createId('mech'),
      name: `Nueva regla ${mechanics.length + 1}`,
      enabled: true,
      priority: 10,
      conditionCombinator: 'all',
      ownerObjectId: target?.id ?? null,
      trigger: {
        event: 'collision.enter',
        sourceObjectId: player?.id,
        target: target?.id,
      },
      conditions: target
        ? [
            {
              id: createId('cond'),
              type: 'object.visible',
              target: target.id,
              value: true,
            },
          ]
        : [],
      actions: [
        {
          id: createId('act'),
          type: 'variable.add',
          parameters: { variable: variables[0]?.name ?? 'puntos', amount: 10 },
        },
        {
          id: createId('act'),
          type: 'audio.beep',
          parameters: { preset: 'coin', channel: 'sfx' },
        },
      ],
    };
    onChangeMechanics([...mechanics, newRule]);
    setSelectedId(newRule.id);
  };

  const moveAction = (mech: GameMechanic, idx: number, dir: -1 | 1) => {
    const nextIdx = idx + dir;
    if (nextIdx < 0 || nextIdx >= mech.actions.length) return;
    const copy = [...mech.actions];
    const [item] = copy.splice(idx, 1);
    copy.splice(nextIdx, 0, item);
    updateMechanic(mech.id, (m) => ({ ...m, actions: copy }));
  };

  const renderTriggerInputs = (mech: GameMechanic) => {
    const ev = mech.trigger.event;
    if (
      ev === 'collision.enter' ||
      ev === 'collision.stay' ||
      ev === 'collision.exit' ||
      ev === 'trigger.enter' ||
      ev === 'trigger.exit'
    ) {
      return (
        <div className="space-y-1.5">
          <div>
            <label className="block text-[10px] text-zinc-400 mb-0.5">
              Objeto A (Origen)
            </label>
            <select
              aria-label="Objeto origen de colisión"
              value={mech.trigger.sourceObjectId ?? ''}
              onChange={(e) =>
                updateMechanic(mech.id, (m) => ({
                  ...m,
                  trigger: {
                    ...m.trigger,
                    sourceObjectId: e.target.value || undefined,
                  },
                }))
              }
              className="w-full rounded border border-[#32323c] bg-[#141416] px-2 py-1 text-xs text-zinc-100"
            >
              <option value="">Cualquier jugador</option>
              {objects.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-[10px] text-zinc-400 mb-0.5">
              Objeto B (Objetivo)
            </label>
            <select
              aria-label="Objeto objetivo de colisión"
              value={mech.trigger.target ?? ''}
              onChange={(e) =>
                updateMechanic(mech.id, (m) => ({
                  ...m,
                  trigger: { ...m.trigger, target: e.target.value || undefined },
                }))
              }
              className="w-full rounded border border-[#32323c] bg-[#141416] px-2 py-1 text-xs text-zinc-100"
            >
              <option value="">Por etiqueta o capa...</option>
              {objects.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.name}
                </option>
              ))}
            </select>
          </div>
          <div className="grid grid-cols-2 gap-1.5">
            <input
              type="text"
              placeholder="Etiqueta (ej. Enemy)"
              aria-label="Etiqueta objetivo de colisión"
              value={mech.trigger.tag ?? ''}
              onChange={(e) =>
                updateMechanic(mech.id, (m) => ({
                  ...m,
                  trigger: { ...m.trigger, tag: e.target.value || undefined },
                }))
              }
              className="min-w-0 w-full rounded border border-[#32323c] bg-[#141416] px-2 py-1 text-xs text-zinc-100"
            />
            <select
              aria-label="Capa objetivo de colisión"
              value={mech.trigger.layer ?? ''}
              onChange={(e) =>
                updateMechanic(mech.id, (m) => ({
                  ...m,
                  trigger: {
                    ...m.trigger,
                    layer: (e.target.value || '') as CollisionLayer | '',
                  },
                }))
              }
              className="min-w-0 w-full rounded border border-[#32323c] bg-[#141416] px-1.5 py-1 text-xs text-zinc-100"
            >
              <option value="">Cualquier capa</option>
              {COLLISION_LAYERS.map((l) => (
                <option key={l} value={l}>
                  {l}
                </option>
              ))}
            </select>
          </div>
        </div>
      );
    }

    if (ev === 'input.pressed' || ev === 'input.held' || ev === 'input.released') {
      return (
        <div>
          <label className="block text-[10px] text-zinc-400 mb-0.5">
            Tecla (Event.code universal)
          </label>
          <KeyCaptureField
            ariaLabel="Tecla disparadora"
            value={mech.trigger.key ?? 'Space'}
            onChange={(code) =>
              updateMechanic(mech.id, (m) => ({
                ...m,
                trigger: { ...m.trigger, key: code },
              }))
            }
          />
        </div>
      );
    }

    if (ev === 'touch.swipe') {
      return (
        <div>
          <label className="block text-[10px] text-zinc-400 mb-0.5">
            Dirección de deslizamiento (Swipe)
          </label>
          <select
            aria-label="Dirección de swipe"
            value={mech.trigger.swipeDir ?? 'any'}
            onChange={(e) =>
              updateMechanic(mech.id, (m) => ({
                ...m,
                trigger: {
                  ...m.trigger,
                  swipeDir: e.target.value as GameMechanic['trigger']['swipeDir'],
                },
              }))
            }
            className="w-full rounded border border-[#32323c] bg-[#141416] px-2 py-1 text-xs text-zinc-100"
          >
            <option value="any">Cualquier dirección</option>
            <option value="left">Izquierda</option>
            <option value="right">Derecha</option>
            <option value="up">Arriba</option>
            <option value="down">Abajo</option>
          </select>
        </div>
      );
    }

    if (ev === 'ui.click' || ev === 'health.zero') {
      return (
        <div>
          <label className="block text-[10px] text-zinc-400 mb-0.5">Objeto</label>
          <select
            aria-label="Objeto disparador"
            value={mech.trigger.target ?? ''}
            onChange={(e) =>
              updateMechanic(mech.id, (m) => ({
                ...m,
                trigger: { ...m.trigger, target: e.target.value || undefined },
              }))
            }
            className="w-full rounded border border-[#32323c] bg-[#141416] px-2 py-1 text-xs text-zinc-100"
          >
            <option value="">Seleccionar objeto...</option>
            {objects.map((o) => (
              <option key={o.id} value={o.id}>
                {o.name}
              </option>
            ))}
          </select>
        </div>
      );
    }

    if (ev === 'timer.elapsed') {
      return (
        <div>
          <label className="block text-[10px] text-zinc-400 mb-0.5">
            Intervalo (segundos)
          </label>
          <NumericInput
            ariaLabel="Intervalo en segundos"
            min={0.1}
            step={0.1}
            value={Number(mech.trigger.intervalSec ?? 1)}
            onChange={(intervalSec) =>
              updateMechanic(mech.id, (m) => ({
                ...m,
                trigger: { ...m.trigger, intervalSec },
              }))
            }
            className="w-full rounded border border-[#32323c] bg-[#141416] px-2 py-1 font-mono text-xs text-zinc-100"
          />
        </div>
      );
    }

    if (ev === 'variable.changed' || ev === 'countdown.zero') {
      return (
        <input
          type="text"
          placeholder={
            ev === 'countdown.zero'
              ? 'Variable de cuenta atrás (ej. tiempo)'
              : 'Nombre de variable (ej. puntos)'
          }
          value={mech.trigger.variable ?? ''}
          onChange={(e) =>
            updateMechanic(mech.id, (m) => ({
              ...m,
              trigger: { ...m.trigger, variable: e.target.value },
            }))
          }
          className="w-full rounded border border-[#32323c] bg-[#141416] px-2 py-1 text-xs text-zinc-100"
        />
      );
    }

    if (ev === 'custom.event') {
      return (
        <input
          type="text"
          placeholder="Nombre del evento (ej. puerta_abierta)"
          value={mech.trigger.eventName ?? ''}
          onChange={(e) =>
            updateMechanic(mech.id, (m) => ({
              ...m,
              trigger: { ...m.trigger, eventName: e.target.value },
            }))
          }
          className="w-full rounded border border-[#32323c] bg-[#141416] px-2 py-1 text-xs text-zinc-100"
        />
      );
    }

    return null;
  };

  const sceneWiringLinks = activeScene?.wiringLinks ?? [];

  if (viewMode === 'wiring') {
    const srcObj = objects.find((o) => o.id === (wireSrcObjId || selectedObjectId || objects[0]?.id)) ?? objects[0];
    const tgtObj = objects.find((o) => o.id === (wireTgtObjId || objects[1]?.id || objects[0]?.id)) ?? objects[0];
    const srcComp =
      srcObj?.components.find((c) => c.type === wireSrcBeh) ?? srcObj?.components[0];
    const tgtComp =
      tgtObj?.components.find((c) => c.type === wireTgtBeh) ?? tgtObj?.components[0];
    const srcEntry = srcComp ? getBehaviorEntry(srcComp.type) : undefined;
    const tgtEntry = tgtComp ? getBehaviorEntry(tgtComp.type) : undefined;
    const availableSignals = srcComp?.outputs ?? srcEntry?.outputs ?? ['onTriggered'];
    const availableActions = tgtComp?.inputs ?? tgtEntry?.inputs ?? ['activate'];

    return (
      <div className="flex h-full min-h-0 flex-col bg-[#141418]" onKeyDown={stopEditableKeyLeak}>
        <div className="flex items-center justify-between border-b border-[#2b2b33] bg-[#16161a] px-3 py-1.5">
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={() => setViewMode('rules')}
              className="rounded px-2 py-1 text-[11px] font-medium text-zinc-400 hover:bg-[#23232b] hover:text-zinc-200"
            >
              Reglas ({mechanics.length})
            </button>
            <button
              type="button"
              onClick={() => setViewMode('wiring')}
              className="inline-flex items-center gap-1 rounded bg-indigo-600/25 border border-indigo-500/40 px-2 py-1 text-[11px] font-semibold text-indigo-200"
            >
              <Link2 className="h-3 w-3" />
              <span>Objetos, Arquetipos y Cables ({sceneWiringLinks.length})</span>
            </button>
          </div>
          <span className="text-[10px] text-zinc-500">
            Contexto: {activeScene?.sceneContext ?? 'gameplay'}
          </span>
        </div>

        <div className="grid flex-1 min-h-0 grid-cols-1 lg:grid-cols-2 divide-y lg:divide-y-0 lg:divide-x divide-[#2b2b33]">
          {/* Objetos con comportamientos y origen */}
          <div className="overflow-y-auto p-2.5 space-y-2">
            <div className="text-[11px] font-semibold text-zinc-300">
              Objetos activos y comportamientos ({objects.length})
            </div>
            {objects.map((o) => {
              const isSel = o.id === selectedObjectId;
              return (
                <div
                  key={o.id}
                  className={`rounded border p-2 space-y-1.5 ${
                    isSel ? 'border-indigo-500/60 bg-indigo-950/20' : 'border-[#272730] bg-[#18181d]'
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <button
                      type="button"
                      onClick={() => onSelectObjectById?.(o.id)}
                      className="text-left text-xs font-semibold text-zinc-100 hover:text-indigo-300 truncate"
                    >
                      {o.name}
                    </button>
                    <div className="flex items-center gap-1">
                      <span className="rounded bg-[#22222c] px-1.5 py-0.5 font-mono text-[9.5px] text-indigo-300">
                        {o.archetype ? `${o.archetype}` : o.role ?? 'generic'}
                      </span>
                      {onUpdateScene && (
                        <>
                          <select
                            aria-label={`Arquetipo rápido para ${o.name}`}
                            value={archId}
                            onChange={(e) => setArchId(e.target.value as ArchetypeId)}
                            className="rounded border border-[#32323c] bg-[#121216] px-1 py-0.5 text-[10px] text-zinc-200"
                          >
                            {ARCHETYPE_RECIPES.map((r) => (
                              <option key={r.id} value={r.id}>
                                {r.id}
                              </option>
                            ))}
                          </select>
                          <button
                            type="button"
                            onClick={() =>
                              onUpdateScene((s) => {
                                const res = applyArchetypeToScene(s, o.id, archId, '2d');
                                return { ...s, objects: res.objects, wiringLinks: res.wiringLinks };
                              })
                            }
                            className="rounded bg-indigo-600 px-1.5 py-0.5 text-[10px] font-medium text-white hover:bg-indigo-500"
                          >
                            Aplicar
                          </button>
                        </>
                      )}
                    </div>
                  </div>
                  {o.components.length === 0 ? (
                    <p className="text-[10px] text-zinc-500">Sin comportamientos.</p>
                  ) : (
                    <div className="flex flex-wrap gap-1">
                      {o.components.map((c) => (
                        <button
                          key={c.id}
                          type="button"
                          onClick={() =>
                            onUpdateObject?.(o.id, (prev) => ({
                              ...prev,
                              components: prev.components.map((comp) =>
                                comp.id === c.id ? { ...comp, enabled: !comp.enabled } : comp
                              ),
                            }))
                          }
                          title={`Origen: ${c.source ?? 'manual'} · Contextos: ${(c.contexts ?? getBehaviorEntry(c.type)?.contexts ?? ['gameplay']).join(', ')}`}
                          className={`inline-flex items-center gap-1 rounded border px-1.5 py-0.5 text-[10px] ${
                            c.enabled
                              ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-200'
                              : 'border-zinc-700 bg-zinc-900 text-zinc-500 line-through'
                          }`}
                        >
                          <span>{getBehaviorLabel(c.type)}</span>
                          <span className="font-mono text-[9px] text-zinc-400">
                            [{c.source ?? 'manual'}]
                          </span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* Creador y lista de Cables (WiringLinks) */}
          <div className="overflow-y-auto p-2.5 space-y-2.5">
            <div className="text-[11px] font-semibold text-zinc-300">
              Cables de señales en tiempo real (WiringLinks)
            </div>
            {onUpdateScene && srcObj && tgtObj && (
              <div className="rounded border border-indigo-500/30 bg-[#171722] p-2 space-y-1.5">
                <div className="grid grid-cols-3 gap-1">
                  <select
                    aria-label="Objeto origen"
                    value={srcObj.id}
                    onChange={(e) => {
                      setWireSrcObjId(e.target.value);
                      setWireSrcBeh('');
                    }}
                    className="rounded border border-[#32323c] bg-[#121216] px-1.5 py-1 text-[10px] text-zinc-100"
                  >
                    {objects.map((o) => (
                      <option key={o.id} value={o.id}>
                        De: {o.name}
                      </option>
                    ))}
                  </select>
                  <select
                    aria-label="Comportamiento origen"
                    value={srcComp?.type ?? ''}
                    onChange={(e) => setWireSrcBeh(e.target.value)}
                    className="rounded border border-[#32323c] bg-[#121216] px-1.5 py-1 text-[10px] text-zinc-100"
                  >
                    {srcObj.components.map((c) => (
                      <option key={c.id} value={c.type}>
                        {c.type}
                      </option>
                    ))}
                  </select>
                  <select
                    aria-label="Señal origen"
                    value={availableSignals.includes(wireSignal) ? wireSignal : availableSignals[0]}
                    onChange={(e) => setWireSignal(e.target.value)}
                    className="rounded border border-[#32323c] bg-[#121216] px-1.5 py-1 text-[10px] font-mono text-indigo-300"
                  >
                    {availableSignals.map((sig) => (
                      <option key={sig} value={sig}>
                        {sig}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="grid grid-cols-3 gap-1">
                  <select
                    aria-label="Objeto destino"
                    value={tgtObj.id}
                    onChange={(e) => {
                      setWireTgtObjId(e.target.value);
                      setWireTgtBeh('');
                    }}
                    className="rounded border border-[#32323c] bg-[#121216] px-1.5 py-1 text-[10px] text-zinc-100"
                  >
                    {objects.map((o) => (
                      <option key={o.id} value={o.id}>
                        A: {o.name}
                      </option>
                    ))}
                  </select>
                  <select
                    aria-label="Comportamiento destino"
                    value={tgtComp?.type ?? ''}
                    onChange={(e) => setWireTgtBeh(e.target.value)}
                    className="rounded border border-[#32323c] bg-[#121216] px-1.5 py-1 text-[10px] text-zinc-100"
                  >
                    {tgtObj.components.map((c) => (
                      <option key={c.id} value={c.type}>
                        {c.type}
                      </option>
                    ))}
                  </select>
                  <select
                    aria-label="Acción destino"
                    value={availableActions.includes(wireAction) ? wireAction : availableActions[0]}
                    onChange={(e) => setWireAction(e.target.value)}
                    className="rounded border border-[#32323c] bg-[#121216] px-1.5 py-1 text-[10px] font-mono text-emerald-300"
                  >
                    {availableActions.map((actName) => (
                      <option key={actName} value={actName}>
                        {actName}
                      </option>
                    ))}
                  </select>
                </div>

                <button
                  type="button"
                  disabled={!srcComp || !tgtComp}
                  onClick={() => {
                    if (!srcComp || !tgtComp) return;
                    const resolvedSig = availableSignals.includes(wireSignal)
                      ? wireSignal
                      : availableSignals[0];
                    const resolvedAct = availableActions.includes(wireAction)
                      ? wireAction
                      : availableActions[0];
                    const newLink: WiringLink = {
                      id: createId('wire'),
                      sourceObjectId: srcObj.id,
                      sourceBehavior: srcComp.type,
                      signal: resolvedSig,
                      targetObjectId: tgtObj.id,
                      targetBehavior: tgtComp.type,
                      action: resolvedAct,
                      auto: false,
                    };
                    onUpdateScene((s) => ({
                      ...s,
                      wiringLinks: [...(s.wiringLinks ?? []), newLink],
                    }));
                  }}
                  className="w-full rounded bg-indigo-600 px-2 py-1 text-[11px] font-semibold text-white hover:bg-indigo-500 disabled:opacity-40"
                >
                  + Conectar Cable
                </button>
              </div>
            )}

            <div className="space-y-1">
              {sceneWiringLinks.length === 0 ? (
                <p className="text-[10px] text-zinc-500">
                  No hay cables activos. Aplica un Arquetipo en el Inspector o crea un cable manual arriba.
                </p>
              ) : (
                sceneWiringLinks.map((lnk) => {
                  const sObj = objects.find((o) => o.id === lnk.sourceObjectId);
                  const tObj = objects.find((o) => o.id === lnk.targetObjectId);
                  return (
                    <div
                      key={lnk.id}
                      className="flex items-center justify-between gap-2 rounded border border-[#2b2b36] bg-[#18181f] px-2 py-1 text-[10px]"
                    >
                      <span className="truncate font-mono text-zinc-200">
                        <span className="text-indigo-300">{sObj?.name ?? lnk.sourceObjectId}</span>.
                        {lnk.sourceBehavior}.{lnk.signal} ➔{' '}
                        <span className="text-emerald-300">{tObj?.name ?? lnk.targetObjectId}</span>.
                        {lnk.targetBehavior}.{lnk.action}
                        {lnk.auto ? ' (auto)' : ''}
                      </span>
                      {onUpdateScene && (
                        <button
                          type="button"
                          onClick={() =>
                            onUpdateScene((s) => ({
                              ...s,
                              wiringLinks: (s.wiringLinks ?? []).filter((w) => w.id !== lnk.id),
                            }))
                          }
                          aria-label="Eliminar cable"
                          className="rounded p-0.5 text-zinc-500 hover:text-red-400"
                        >
                          <Trash2 className="h-3 w-3" />
                        </button>
                      )}
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full min-h-0" onKeyDown={stopEditableKeyLeak}>
      {/* Columna izquierda: lista de reglas */}
      <div className="flex w-72 shrink-0 flex-col border-r border-[#2b2b33] bg-[#16161a]">
        <div className="flex items-center justify-between gap-1 border-b border-[#2b2b33] px-2 py-1.5">
          <div className="flex items-center gap-1">
            <span className="rounded bg-blue-600/20 px-1.5 py-0.5 text-[10.5px] font-semibold text-blue-300">
              Reglas ({mechanics.length})
            </span>
            <button
              type="button"
              onClick={() => setViewMode('wiring')}
              className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[10.5px] text-indigo-300 hover:bg-indigo-500/15"
              title="Ver Objetos, Arquetipos y Cables en vivo"
            >
              <Link2 className="h-3 w-3" />
              <span>Cables ({sceneWiringLinks.length})</span>
            </button>
            {onOpenVehicleWizard && (
              <button
                type="button"
                onClick={onOpenVehicleWizard}
                className="inline-flex items-center gap-1 rounded bg-emerald-600/20 px-1.5 py-0.5 text-[10.5px] font-semibold text-emerald-300 hover:bg-emerald-600/30"
                title="Abrir Asistente Visual de Vehículos 3D"
              >
                <span>+ Vehículo</span>
              </button>
            )}
          </div>
          <button
            type="button"
            onClick={handleCreateRule}
            className="inline-flex items-center gap-1 rounded bg-blue-600 px-2 py-1 text-[11px] font-semibold text-white hover:bg-blue-500 whitespace-nowrap"
          >
            <Plus className="h-3 w-3" />
            <span>Nueva</span>
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-1.5 space-y-1">
          {mechanics.length === 0 ? (
            <p className="p-3 text-center text-[11px] text-zinc-500">
              No hay reglas estructuradas. Crea una regla CUANDO / SI / ENTONCES o usa el Asistente.
            </p>
          ) : (
            mechanics.map((m) => {
              const selected = activeMechanic?.id === m.id;
              return (
                <div
                  key={m.id}
                  className={`flex items-center justify-between gap-1 rounded border px-2 py-1.5 text-xs ${
                    selected
                      ? 'border-blue-500/60 bg-blue-500/15 text-zinc-100'
                      : 'border-[#272730] bg-[#1c1c21] text-zinc-300 hover:border-zinc-600'
                  }`}
                >
                  <button
                    type="button"
                    onClick={() => setSelectedId(m.id)}
                    className="min-w-0 flex-1 text-left truncate"
                  >
                    <div className="truncate font-medium">{m.name}</div>
                    <div className="truncate font-mono text-[10px] text-zinc-400">
                      {m.trigger.event} · {m.actions.length} acc.
                    </div>
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      updateMechanic(m.id, (prev) => ({ ...prev, enabled: !prev.enabled }))
                    }
                    title={m.enabled ? 'Desactivar regla' : 'Activar regla'}
                    aria-label={`${m.enabled ? 'Desactivar' : 'Activar'} ${m.name}`}
                    className={`rounded p-1 ${
                      m.enabled ? 'text-emerald-400 hover:bg-emerald-500/10' : 'text-zinc-500 hover:bg-zinc-700/30'
                    }`}
                  >
                    <Power className="h-3.5 w-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      const next = mechanics.filter((x) => x.id !== m.id);
                      onChangeMechanics(next);
                      if (selectedId === m.id) setSelectedId(next[0]?.id ?? null);
                    }}
                    title="Eliminar regla"
                    aria-label={`Eliminar regla ${m.name}`}
                    className="rounded p-1 text-zinc-500 hover:bg-red-500/10 hover:text-red-400"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              );
            })
          )}
        </div>
      </div>

      {/* Columna derecha: editor estructurado CUANDO / SI / ENTONCES */}
      <div className="flex-1 overflow-y-auto p-3">
        {!activeMechanic ? (
          <div className="flex h-full items-center justify-center text-xs text-zinc-500">
            Selecciona o crea una regla para editar su disparador, condiciones y acciones.
          </div>
        ) : (
          <div className="space-y-3">
            <div className="flex flex-wrap items-center gap-2">
              <input
                type="text"
                aria-label="Nombre de la regla"
                value={activeMechanic.name}
                onChange={(e) =>
                  updateMechanic(activeMechanic.id, (m) => ({ ...m, name: e.target.value }))
                }
                className="min-w-52 flex-1 rounded border border-[#32323c] bg-[#141416] px-2.5 py-1 text-xs font-semibold text-zinc-100 focus:border-blue-500 focus:outline-none"
              />
              <label className="flex items-center gap-1.5 text-xs text-zinc-300">
                <span>Prioridad</span>
                <NumericInput
                  ariaLabel="Prioridad de regla"
                  value={activeMechanic.priority}
                  onChange={(priority) =>
                    updateMechanic(activeMechanic.id, (m) => ({
                      ...m,
                      priority,
                    }))
                  }
                  className="w-16 rounded border border-[#32323c] bg-[#141416] px-2 py-1 font-mono text-xs text-zinc-100"
                />
              </label>
            </div>

            <div className="grid grid-cols-1 gap-3 2xl:grid-cols-3">
              {/* CUANDO */}
              <div className="min-w-0 rounded border border-sky-500/30 bg-[#15171e] p-2.5 space-y-2">
                <div className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wide text-sky-400">
                  <Zap className="h-3.5 w-3.5 shrink-0" />
                  <span>1. CUANDO (Disparador)</span>
                </div>

                <select
                  aria-label="Evento disparador"
                  value={activeMechanic.trigger.event}
                  onChange={(e) =>
                    updateMechanic(activeMechanic.id, (m) => ({
                      ...m,
                      trigger: {
                        ...m.trigger,
                        event: e.target.value as MechanicTriggerEvent,
                      },
                    }))
                  }
                  className="w-full min-w-0 rounded border border-[#32323c] bg-[#141416] px-2 py-1 text-xs text-zinc-100"
                >
                  {(Object.keys(TRIGGER_LABELS) as MechanicTriggerEvent[]).map((ev) => (
                    <option key={ev} value={ev}>
                      {TRIGGER_LABELS[ev]}
                    </option>
                  ))}
                </select>

                {renderTriggerInputs(activeMechanic)}
              </div>

              {/* SI SE CUMPLE */}
              <div className="min-w-0 rounded border border-amber-500/30 bg-[#191713] p-2.5 space-y-2">
                <div className="flex flex-wrap items-center justify-between gap-1.5">
                  <span className="text-[11px] font-bold uppercase tracking-wide text-amber-400">
                    2. SI ({activeMechanic.conditions.length})
                  </span>
                  <div className="flex flex-wrap items-center gap-1">
                    <select
                      aria-label="Lógica de condiciones"
                      value={activeMechanic.conditionCombinator ?? 'all'}
                      onChange={(e) =>
                        updateMechanic(activeMechanic.id, (m) => ({
                          ...m,
                          conditionCombinator: e.target.value as ConditionCombinator,
                        }))
                      }
                      className="rounded border border-[#32323c] bg-[#141416] px-1.5 py-0.5 text-[10px] text-amber-200"
                    >
                      <option value="all">Todas (AND)</option>
                      <option value="any">Cualquiera (OR)</option>
                      <option value="none">Ninguna (NOT)</option>
                    </select>
                    <button
                      type="button"
                      onClick={() => {
                        const nextCond: ConditionDefinition = {
                          id: createId('cond'),
                          type: 'object.visible',
                          target: objects[0]?.id,
                          value: true,
                        };
                        updateMechanic(activeMechanic.id, (m) => ({
                          ...m,
                          conditions: [...m.conditions, nextCond],
                        }));
                      }}
                      className="shrink-0 rounded border border-amber-500/40 bg-amber-500/15 px-1.5 py-0.5 text-[10px] font-semibold text-amber-300 hover:bg-amber-500/25"
                    >
                      + Condición
                    </button>
                  </div>
                </div>

                {activeMechanic.conditions.length === 0 ? (
                  <p className="text-[11px] text-zinc-400">
                    Sin condiciones adicionales (se ejecuta siempre que ocurra el disparador).
                  </p>
                ) : (
                  <div className="space-y-1.5">
                    {activeMechanic.conditions.map((cond) => (
                      <div
                        key={cond.id}
                        className="rounded border border-[#312d24] bg-[#141416] p-1.5 space-y-1.5"
                      >
                        <div className="flex items-center gap-1">
                          <select
                            aria-label="Tipo de condición"
                            value={cond.type}
                            onChange={(e) =>
                              updateMechanic(activeMechanic.id, (m) => ({
                                ...m,
                                conditions: m.conditions.map((c) =>
                                  c.id === cond.id
                                    ? { ...c, type: e.target.value as ConditionType }
                                    : c
                                ),
                              }))
                            }
                            className="min-w-0 flex-1 rounded border border-[#32323c] bg-[#1a1a1e] px-1.5 py-1 text-[11px] text-zinc-100"
                          >
                            {(Object.keys(CONDITION_LABELS) as ConditionType[]).map((ct) => (
                              <option key={ct} value={ct}>
                                {CONDITION_LABELS[ct]}
                              </option>
                            ))}
                          </select>
                          <button
                            type="button"
                            aria-label="Eliminar condición"
                            onClick={() =>
                              updateMechanic(activeMechanic.id, (m) => ({
                                ...m,
                                conditions: m.conditions.filter((c) => c.id !== cond.id),
                              }))
                            }
                            className="rounded p-1 text-zinc-500 hover:text-red-400"
                          >
                            <Trash2 className="h-3 w-3" />
                          </button>
                        </div>

                        {(cond.type === 'object.visible' ||
                          cond.type === 'object.grounded' ||
                          cond.type === 'object.exists' ||
                          cond.type === 'object.animating') && (
                          <select
                            aria-label="Objeto de la condición"
                            value={cond.target ?? ''}
                            onChange={(e) =>
                              updateMechanic(activeMechanic.id, (m) => ({
                                ...m,
                                conditions: m.conditions.map((c) =>
                                  c.id === cond.id ? { ...c, target: e.target.value } : c
                                ),
                              }))
                            }
                            className="w-full rounded border border-[#32323c] bg-[#1a1a1e] px-1.5 py-1 text-[11px] text-zinc-100"
                          >
                            {objects.map((o) => (
                              <option key={o.id} value={o.id}>
                                {o.name}
                              </option>
                            ))}
                          </select>
                        )}

                        {cond.type === 'object.flipped' && (
                          <div className="grid grid-cols-2 gap-1">
                            <select
                              value={cond.target ?? ''}
                              onChange={(e) =>
                                updateMechanic(activeMechanic.id, (m) => ({
                                  ...m,
                                  conditions: m.conditions.map((c) =>
                                    c.id === cond.id ? { ...c, target: e.target.value } : c
                                  ),
                                }))
                              }
                              className="rounded border border-[#32323c] bg-[#1a1a1e] px-1 py-0.5 text-[11px] text-zinc-100"
                            >
                              {objects.map((o) => (
                                <option key={o.id} value={o.id}>
                                  {o.name}
                                </option>
                              ))}
                            </select>
                            <select
                              value={cond.value === false ? 'false' : 'true'}
                              onChange={(e) =>
                                updateMechanic(activeMechanic.id, (m) => ({
                                  ...m,
                                  conditions: m.conditions.map((c) =>
                                    c.id === cond.id
                                      ? { ...c, value: e.target.value === 'true' }
                                      : c
                                  ),
                                }))
                              }
                              className="rounded border border-[#32323c] bg-[#1a1a1e] px-1 py-0.5 text-[11px] text-zinc-100"
                            >
                              <option value="true">Mirando izquierda (FlipX)</option>
                              <option value="false">Normal (Derecha)</option>
                            </select>
                          </div>
                        )}

                        {cond.type === 'object.hasTag' && (
                          <div className="grid grid-cols-2 gap-1">
                            <select
                              value={cond.target ?? ''}
                              onChange={(e) =>
                                updateMechanic(activeMechanic.id, (m) => ({
                                  ...m,
                                  conditions: m.conditions.map((c) =>
                                    c.id === cond.id ? { ...c, target: e.target.value } : c
                                  ),
                                }))
                              }
                              className="rounded border border-[#32323c] bg-[#1a1a1e] px-1 py-0.5 text-[11px] text-zinc-100"
                            >
                              {objects.map((o) => (
                                <option key={o.id} value={o.id}>
                                  {o.name}
                                </option>
                              ))}
                            </select>
                            <input
                              type="text"
                              placeholder="Etiqueta (ej. Enemy)"
                              value={cond.tag ?? ''}
                              onChange={(e) =>
                                updateMechanic(activeMechanic.id, (m) => ({
                                  ...m,
                                  conditions: m.conditions.map((c) =>
                                    c.id === cond.id ? { ...c, tag: e.target.value } : c
                                  ),
                                }))
                              }
                              className="rounded border border-[#32323c] bg-[#1a1a1e] px-1.5 py-0.5 text-[11px] text-zinc-100"
                            />
                          </div>
                        )}

                        {cond.type === 'object.property' && (
                          <div className="grid grid-cols-2 gap-1">
                            <select
                              value={cond.target ?? ''}
                              onChange={(e) =>
                                updateMechanic(activeMechanic.id, (m) => ({
                                  ...m,
                                  conditions: m.conditions.map((c) =>
                                    c.id === cond.id ? { ...c, target: e.target.value } : c
                                  ),
                                }))
                              }
                              className="rounded border border-[#32323c] bg-[#1a1a1e] px-1 py-0.5 text-[11px] text-zinc-100"
                            >
                              {objects.map((o) => (
                                <option key={o.id} value={o.id}>
                                  {o.name}
                                </option>
                              ))}
                            </select>
                            <select
                              value={cond.property ?? 'x'}
                              onChange={(e) =>
                                updateMechanic(activeMechanic.id, (m) => ({
                                  ...m,
                                  conditions: m.conditions.map((c) =>
                                    c.id === cond.id ? { ...c, property: e.target.value } : c
                                  ),
                                }))
                              }
                              className="rounded border border-[#32323c] bg-[#1a1a1e] px-1 py-0.5 text-[11px] text-zinc-100"
                            >
                              <option value="x">Posición X</option>
                              <option value="y">Posición Y</option>
                              <option value="rotation">Rotación</option>
                              <option value="scaleX">Escala X</option>
                              <option value="scaleY">Escala Y</option>
                              <option value="opacity">Opacidad</option>
                            </select>
                            <select
                              value={cond.operator ?? '>='}
                              onChange={(e) =>
                                updateMechanic(activeMechanic.id, (m) => ({
                                  ...m,
                                  conditions: m.conditions.map((c) =>
                                    c.id === cond.id
                                      ? {
                                          ...c,
                                          operator: e.target.value as ConditionDefinition['operator'],
                                        }
                                      : c
                                  ),
                                }))
                              }
                              className="rounded border border-[#32323c] bg-[#1a1a1e] px-1 py-0.5 font-mono text-[11px] text-zinc-100"
                            >
                              <option value="==">==</option>
                              <option value="!=">!=</option>
                              <option value=">">&gt;</option>
                              <option value=">=">&gt;=</option>
                              <option value="<">&lt;</option>
                              <option value="<=">&lt;=</option>
                            </select>
                            <NumericInput
                              ariaLabel="Valor de comparación"
                              step={0.1}
                              value={Number(cond.value ?? 0)}
                              onChange={(value) =>
                                updateMechanic(activeMechanic.id, (m) => ({
                                  ...m,
                                  conditions: m.conditions.map((c) =>
                                    c.id === cond.id ? { ...c, value } : c
                                  ),
                                }))
                              }
                              className="rounded border border-[#32323c] bg-[#1a1a1e] px-1.5 py-0.5 font-mono text-[11px] text-zinc-100"
                            />
                          </div>
                        )}

                        {cond.type === 'variable.objectCompare' && (
                          <div className="grid grid-cols-3 gap-1">
                            <input
                              type="text"
                              placeholder="Var A"
                              value={cond.variable ?? ''}
                              onChange={(e) =>
                                updateMechanic(activeMechanic.id, (m) => ({
                                  ...m,
                                  conditions: m.conditions.map((c) =>
                                    c.id === cond.id ? { ...c, variable: e.target.value } : c
                                  ),
                                }))
                              }
                              className="rounded border border-[#32323c] bg-[#1a1a1e] px-1.5 py-0.5 text-[11px] text-zinc-100"
                            />
                            <select
                              value={cond.operator ?? '>='}
                              onChange={(e) =>
                                updateMechanic(activeMechanic.id, (m) => ({
                                  ...m,
                                  conditions: m.conditions.map((c) =>
                                    c.id === cond.id
                                      ? {
                                          ...c,
                                          operator: e.target.value as ConditionDefinition['operator'],
                                        }
                                      : c
                                  ),
                                }))
                              }
                              className="rounded border border-[#32323c] bg-[#1a1a1e] px-1 py-0.5 font-mono text-[11px] text-zinc-100"
                            >
                              <option value="==">==</option>
                              <option value="!=">!=</option>
                              <option value=">">&gt;</option>
                              <option value=">=">&gt;=</option>
                              <option value="<">&lt;</option>
                              <option value="<=">&lt;=</option>
                            </select>
                            <input
                              type="text"
                              placeholder="Var B"
                              value={cond.secondaryVariable ?? ''}
                              onChange={(e) =>
                                updateMechanic(activeMechanic.id, (m) => ({
                                  ...m,
                                  conditions: m.conditions.map((c) =>
                                    c.id === cond.id
                                      ? { ...c, secondaryVariable: e.target.value }
                                      : c
                                  ),
                                }))
                              }
                              className="rounded border border-[#32323c] bg-[#1a1a1e] px-1.5 py-0.5 text-[11px] text-zinc-100"
                            />
                          </div>
                        )}

                        {(cond.type === 'variable.compare' || cond.type === 'health.compare') && (
                          <div className="grid grid-cols-3 gap-1">
                            {cond.type === 'variable.compare' ? (
                              <input
                                type="text"
                                placeholder="variable"
                                value={cond.variable ?? ''}
                                onChange={(e) =>
                                  updateMechanic(activeMechanic.id, (m) => ({
                                    ...m,
                                    conditions: m.conditions.map((c) =>
                                      c.id === cond.id ? { ...c, variable: e.target.value } : c
                                    ),
                                  }))
                                }
                                className="rounded border border-[#32323c] bg-[#1a1a1e] px-1.5 py-0.5 text-[11px] text-zinc-100"
                              />
                            ) : (
                              <select
                                value={cond.target ?? ''}
                                onChange={(e) =>
                                  updateMechanic(activeMechanic.id, (m) => ({
                                    ...m,
                                    conditions: m.conditions.map((c) =>
                                      c.id === cond.id ? { ...c, target: e.target.value } : c
                                    ),
                                  }))
                                }
                                className="rounded border border-[#32323c] bg-[#1a1a1e] px-1 py-0.5 text-[11px] text-zinc-100"
                              >
                                {objects.map((o) => (
                                  <option key={o.id} value={o.id}>
                                    {o.name}
                                  </option>
                                ))}
                              </select>
                            )}
                            <select
                              value={cond.operator ?? '>='}
                              onChange={(e) =>
                                updateMechanic(activeMechanic.id, (m) => ({
                                  ...m,
                                  conditions: m.conditions.map((c) =>
                                    c.id === cond.id
                                      ? {
                                          ...c,
                                          operator: e.target.value as ConditionDefinition['operator'],
                                        }
                                      : c
                                  ),
                                }))
                              }
                              className="rounded border border-[#32323c] bg-[#1a1a1e] px-1 py-0.5 font-mono text-[11px] text-zinc-100"
                            >
                              <option value="==">==</option>
                              <option value="!=">!=</option>
                              <option value=">">&gt;</option>
                              <option value=">=">&gt;=</option>
                              <option value="<">&lt;</option>
                              <option value="<=">&lt;=</option>
                            </select>
                            <input
                              type="text"
                              placeholder="valor"
                              value={String(cond.value ?? 0)}
                              onChange={(e) =>
                                updateMechanic(activeMechanic.id, (m) => ({
                                  ...m,
                                  conditions: m.conditions.map((c) =>
                                    c.id === cond.id ? { ...c, value: e.target.value } : c
                                  ),
                                }))
                              }
                              className="rounded border border-[#32323c] bg-[#1a1a1e] px-1.5 py-0.5 font-mono text-[11px] text-zinc-100"
                            />
                          </div>
                        )}

                        {cond.type === 'boolean' && (
                          <input
                            type="text"
                            placeholder="Nombre de variable booleana"
                            value={cond.variable ?? ''}
                            onChange={(e) =>
                              updateMechanic(activeMechanic.id, (m) => ({
                                ...m,
                                conditions: m.conditions.map((c) =>
                                  c.id === cond.id ? { ...c, variable: e.target.value } : c
                                ),
                              }))
                            }
                            className="w-full rounded border border-[#32323c] bg-[#1a1a1e] px-1.5 py-0.5 text-[11px] text-zinc-100"
                          />
                        )}

                        {cond.type === 'state.is' && (
                          <div className="grid grid-cols-2 gap-1">
                            <select
                              value={cond.target ?? ''}
                              onChange={(e) =>
                                updateMechanic(activeMechanic.id, (m) => ({
                                  ...m,
                                  conditions: m.conditions.map((c) =>
                                    c.id === cond.id ? { ...c, target: e.target.value } : c
                                  ),
                                }))
                              }
                              className="rounded border border-[#32323c] bg-[#1a1a1e] px-1 py-0.5 text-[11px] text-zinc-100"
                            >
                              {objects.map((o) => (
                                <option key={o.id} value={o.id}>
                                  {o.name}
                                </option>
                              ))}
                            </select>
                            <input
                              type="text"
                              placeholder="Estado (ej. atacando)"
                              value={String(cond.value ?? '')}
                              onChange={(e) =>
                                updateMechanic(activeMechanic.id, (m) => ({
                                  ...m,
                                  conditions: m.conditions.map((c) =>
                                    c.id === cond.id ? { ...c, value: e.target.value } : c
                                  ),
                                }))
                              }
                              className="rounded border border-[#32323c] bg-[#1a1a1e] px-1.5 py-0.5 text-[11px] text-zinc-100"
                            />
                          </div>
                        )}

                        {cond.type === 'input.held' && (
                          <KeyCaptureField
                            ariaLabel="Tecla condición"
                            value={cond.key ?? 'Space'}
                            onChange={(code) =>
                              updateMechanic(activeMechanic.id, (m) => ({
                                ...m,
                                conditions: m.conditions.map((c) =>
                                  c.id === cond.id ? { ...c, key: code } : c
                                ),
                              }))
                            }
                          />
                        )}

                        {(cond.type === 'distance.less' || cond.type === 'distance.greater') && (
                          <div className="grid grid-cols-3 gap-1">
                            <select
                              value={cond.target ?? ''}
                              onChange={(e) =>
                                updateMechanic(activeMechanic.id, (m) => ({
                                  ...m,
                                  conditions: m.conditions.map((c) =>
                                    c.id === cond.id ? { ...c, target: e.target.value } : c
                                  ),
                                }))
                              }
                              className="rounded border border-[#32323c] bg-[#1a1a1e] px-1 py-0.5 text-[11px] text-zinc-100"
                            >
                              {objects.map((o) => (
                                <option key={o.id} value={o.id}>
                                  {o.name}
                                </option>
                              ))}
                            </select>
                            <select
                              value={cond.secondaryTarget ?? ''}
                              onChange={(e) =>
                                updateMechanic(activeMechanic.id, (m) => ({
                                  ...m,
                                  conditions: m.conditions.map((c) =>
                                    c.id === cond.id ? { ...c, secondaryTarget: e.target.value } : c
                                  ),
                                }))
                              }
                              className="rounded border border-[#32323c] bg-[#1a1a1e] px-1 py-0.5 text-[11px] text-zinc-100"
                            >
                              {objects.map((o) => (
                                <option key={o.id} value={o.id}>
                                  {o.name}
                                </option>
                              ))}
                            </select>
                            <NumericInput
                              ariaLabel="Distancia"
                              value={Number(cond.value ?? 120)}
                              onChange={(value) =>
                                updateMechanic(activeMechanic.id, (m) => ({
                                  ...m,
                                  conditions: m.conditions.map((c) =>
                                    c.id === cond.id ? { ...c, value } : c
                                  ),
                                }))
                              }
                              className="rounded border border-[#32323c] bg-[#1a1a1e] px-1 py-0.5 font-mono text-[11px] text-zinc-100"
                            />
                          </div>
                        )}

                        {cond.type === 'random.chance' && (
                          <div className="flex items-center gap-1.5">
                            <span className="text-[10px] text-zinc-400">Probabilidad (%):</span>
                            <NumericInput
                              ariaLabel="Probabilidad porcentual"
                              min={0}
                              max={100}
                              value={Number(cond.value ?? 50)}
                              onChange={(value) =>
                                updateMechanic(activeMechanic.id, (m) => ({
                                  ...m,
                                  conditions: m.conditions.map((c) =>
                                    c.id === cond.id ? { ...c, value } : c
                                  ),
                                }))
                              }
                              className="flex-1 rounded border border-[#32323c] bg-[#1a1a1e] px-1.5 py-0.5 font-mono text-[11px] text-zinc-100"
                            />
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* ENTONCES EJECUTAR */}
              <div className="min-w-0 rounded border border-emerald-500/30 bg-[#131917] p-2.5 space-y-2">
                <div className="flex flex-wrap items-center justify-between gap-1.5">
                  <span className="text-[11px] font-bold uppercase tracking-wide text-emerald-400">
                    3. ENTONCES ({activeMechanic.actions.length})
                  </span>
                  <button
                    type="button"
                    onClick={() => {
                      const nextAct: ActionDefinition = {
                        id: createId('act'),
                        type: 'audio.beep',
                        parameters: { preset: 'coin', channel: 'sfx' },
                      };
                      updateMechanic(activeMechanic.id, (m) => ({
                        ...m,
                        actions: [...m.actions, nextAct],
                      }));
                    }}
                    className="rounded border border-emerald-500/40 bg-emerald-500/15 px-1.5 py-0.5 text-[10px] font-semibold text-emerald-300 hover:bg-emerald-500/25"
                  >
                    + Acción
                  </button>
                </div>

                <div className="space-y-1.5">
                  {activeMechanic.actions.map((act, idx) => {
                    const patchParams = (patch: Record<string, unknown>) =>
                      updateMechanic(activeMechanic.id, (m) => ({
                        ...m,
                        actions: m.actions.map((a) =>
                          a.id === act.id
                            ? { ...a, parameters: { ...a.parameters, ...patch } }
                            : a
                        ),
                      }));

                    return (
                      <div
                        key={act.id}
                        className="rounded border border-[#24322b] bg-[#141416] p-1.5 space-y-1.5"
                      >
                        <div className="flex items-center gap-1">
                          <span className="font-mono text-[10px] text-zinc-500">#{idx + 1}</span>
                          <select
                            aria-label="Tipo de acción"
                            value={act.type}
                            onChange={(e) =>
                              updateMechanic(activeMechanic.id, (m) => ({
                                ...m,
                                actions: m.actions.map((a) =>
                                  a.id === act.id
                                    ? { ...a, type: e.target.value as ActionType }
                                    : a
                                ),
                              }))
                            }
                            className="min-w-0 flex-1 rounded border border-[#32323c] bg-[#1a1a1e] px-1.5 py-1 text-[11px] text-zinc-100"
                          >
                            {(Object.keys(ACTION_LABELS) as ActionType[]).map((at) => (
                              <option key={at} value={at}>
                                {ACTION_LABELS[at]}
                              </option>
                            ))}
                          </select>
                          <button
                            type="button"
                            disabled={idx === 0}
                            onClick={() => moveAction(activeMechanic, idx, -1)}
                            aria-label="Subir acción"
                            className="rounded p-0.5 text-zinc-400 hover:text-zinc-100 disabled:opacity-30"
                          >
                            <ArrowUp className="h-3 w-3" />
                          </button>
                          <button
                            type="button"
                            disabled={idx === activeMechanic.actions.length - 1}
                            onClick={() => moveAction(activeMechanic, idx, 1)}
                            aria-label="Bajar acción"
                            className="rounded p-0.5 text-zinc-400 hover:text-zinc-100 disabled:opacity-30"
                          >
                            <ArrowDown className="h-3 w-3" />
                          </button>
                          <button
                            type="button"
                            onClick={() =>
                              updateMechanic(activeMechanic.id, (m) => ({
                                ...m,
                                actions: m.actions.filter((a) => a.id !== act.id),
                              }))
                            }
                            aria-label="Eliminar acción"
                            className="rounded p-0.5 text-zinc-500 hover:text-red-400"
                          >
                            <Trash2 className="h-3 w-3" />
                          </button>
                        </div>

                        {(act.type === 'variable.add' || act.type === 'variable.set') && (
                          <div className="grid grid-cols-2 gap-1">
                            <input
                              type="text"
                              placeholder="puntos"
                              value={String(act.parameters.variable ?? 'puntos')}
                              onChange={(e) => patchParams({ variable: e.target.value })}
                              className="rounded border border-[#32323c] bg-[#1a1a1e] px-1.5 py-0.5 text-[11px] text-zinc-100"
                            />
                            <input
                              type="text"
                              placeholder="10"
                              value={String(
                                act.type === 'variable.add'
                                  ? act.parameters.amount ?? 10
                                  : act.parameters.value ?? 0
                              )}
                              onChange={(e) =>
                                patchParams(
                                  act.type === 'variable.add'
                                    ? { amount: e.target.value }
                                    : { value: e.target.value }
                                )
                              }
                              className="rounded border border-[#32323c] bg-[#1a1a1e] px-1.5 py-0.5 font-mono text-[11px] text-zinc-100"
                            />
                          </div>
                        )}

                        {act.type === 'audio.beep' && (
                          <div className="space-y-1">
                            <select
                              aria-label="Sonido sintetizado"
                              value={String(act.parameters.preset ?? 'coin')}
                              onChange={(e) => patchParams({ preset: e.target.value, channel: 'sfx' })}
                              className="w-full rounded border border-[#32323c] bg-[#1a1a1e] px-1.5 py-1 text-[11px] text-zinc-100"
                            >
                              {SYNTH_PRESETS.map((p) => (
                                <option key={p.id} value={p.id}>
                                  {p.label}
                                </option>
                              ))}
                            </select>
                            <div className="grid grid-cols-3 gap-1">
                              <NumericInput
                                ariaLabel="Volumen"
                                step={0.1}
                                min={0}
                                max={2}
                                title="Volumen (0 - 2)"
                                placeholder="Vol 1"
                                value={Number(act.parameters.volume ?? 1)}
                                onChange={(volume) => patchParams({ volume })}
                                className="rounded border border-[#32323c] bg-[#1a1a1e] px-1.5 py-0.5 font-mono text-[10px] text-zinc-100"
                              />
                              <NumericInput
                                ariaLabel="Pitch"
                                step={0.1}
                                min={0.3}
                                max={3}
                                title="Tono / Pitch (0.5 - 2)"
                                placeholder="Pitch 1"
                                value={Number(act.parameters.pitch ?? 1)}
                                onChange={(pitch) => patchParams({ pitch })}
                                className="rounded border border-[#32323c] bg-[#1a1a1e] px-1.5 py-0.5 font-mono text-[10px] text-zinc-100"
                              />
                              <NumericInput
                                ariaLabel="Variación aleatoria de tono"
                                step={0.05}
                                min={0}
                                max={1}
                                title="Variación aleatoria de tono"
                                placeholder="Var tono"
                                value={Number(act.parameters.randomPitch ?? 0)}
                                onChange={(randomPitch) => patchParams({ randomPitch })}
                                className="rounded border border-[#32323c] bg-[#1a1a1e] px-1.5 py-0.5 font-mono text-[10px] text-zinc-100"
                              />
                            </div>
                          </div>
                        )}

                        {act.type === 'audio.play' && (
                          <div className="space-y-1">
                            <select
                              aria-label="Archivo de audio"
                              value={String(act.parameters.assetId ?? '')}
                              onChange={(e) => patchParams({ assetId: e.target.value })}
                              className="w-full rounded border border-[#32323c] bg-[#1a1a1e] px-1.5 py-1 text-[11px] text-zinc-100"
                            >
                              <option value="">Seleccionar archivo de audio...</option>
                              {audioAssets.map((a) => (
                                <option key={a.id} value={a.id}>
                                  {a.name} ({a.format.toUpperCase()})
                                </option>
                              ))}
                            </select>
                            <div className="grid grid-cols-3 gap-1">
                              <select
                                aria-label="Canal de audio"
                                value={String(act.parameters.channel ?? 'sfx')}
                                onChange={(e) => patchParams({ channel: e.target.value })}
                                className="rounded border border-[#32323c] bg-[#1a1a1e] px-1 py-0.5 text-[10px] text-zinc-100"
                              >
                                <option value="sfx">SFX</option>
                                <option value="music">Música</option>
                                <option value="ui">UI</option>
                              </select>
                              <NumericInput
                                ariaLabel="Volumen"
                                step={0.1}
                                min={0}
                                max={1.5}
                                title="Volumen"
                                placeholder="Volumen"
                                value={Number(act.parameters.volume ?? 1)}
                                onChange={(volume) => patchParams({ volume })}
                                className="rounded border border-[#32323c] bg-[#1a1a1e] px-1.5 py-0.5 font-mono text-[10px] text-zinc-100"
                              />
                              <NumericInput
                                ariaLabel="Pitch"
                                step={0.1}
                                min={0.3}
                                max={2.5}
                                title="Tono / Pitch"
                                placeholder="Pitch"
                                value={Number(act.parameters.pitch ?? 1)}
                                onChange={(pitch) => patchParams({ pitch })}
                                className="rounded border border-[#32323c] bg-[#1a1a1e] px-1.5 py-0.5 font-mono text-[10px] text-zinc-100"
                              />
                            </div>
                            <label className="flex items-center gap-1.5 text-[10px] text-zinc-300 cursor-pointer">
                              <input
                                type="checkbox"
                                checked={Boolean(act.parameters.loop)}
                                onChange={(e) => patchParams({ loop: e.target.checked })}
                                className="accent-sky-500"
                              />
                              <span>Repetir en bucle</span>
                            </label>
                          </div>
                        )}

                        {act.type === 'music.play' && (
                          <div className="space-y-1">
                            <select
                              aria-label="Pista musical a reproducir"
                              value={String(act.parameters.assetId ?? '')}
                              onChange={(e) => patchParams({ assetId: e.target.value })}
                              className="w-full rounded border border-[#32323c] bg-[#1a1a1e] px-1.5 py-1 text-[11px] text-zinc-100"
                            >
                              <option value="">Seleccionar pista musical (PC)...</option>
                              {audioAssets.map((a) => (
                                <option key={a.id} value={a.id}>
                                  🎵 {a.name} ({a.format.toUpperCase()})
                                </option>
                              ))}
                            </select>
                            <div className="flex items-center gap-2 text-[10px] text-zinc-300">
                              <NumericInput
                                ariaLabel="Volumen música"
                                step={0.05}
                                min={0}
                                max={1.5}
                                title="Volumen música"
                                value={Number(act.parameters.volume ?? 0.85)}
                                onChange={(volume) => patchParams({ volume })}
                                className="w-16 rounded border border-[#32323c] bg-[#1a1a1e] px-1.5 py-0.5 font-mono text-[10px] text-zinc-100"
                              />
                              <label className="flex items-center gap-1 cursor-pointer">
                                <input
                                  type="checkbox"
                                  checked={act.parameters.loop !== false}
                                  onChange={(e) => patchParams({ loop: e.target.checked })}
                                  className="accent-sky-500"
                                />
                                <span>Bucle</span>
                              </label>
                              <label className="flex items-center gap-1 cursor-pointer">
                                <input
                                  type="checkbox"
                                  checked={act.parameters.keepIfSame !== false}
                                  onChange={(e) => patchParams({ keepIfSame: e.target.checked })}
                                  className="accent-sky-500"
                                />
                                <span>Continuar si ya suena</span>
                              </label>
                            </div>
                          </div>
                        )}

                        {act.type === 'audio.setVolume' && (
                          <div className="grid grid-cols-2 gap-1">
                            <select
                              value={String(act.parameters.channel ?? 'master')}
                              onChange={(e) => patchParams({ channel: e.target.value })}
                              className="rounded border border-[#32323c] bg-[#1a1a1e] px-1.5 py-0.5 text-[11px] text-zinc-100"
                            >
                              <option value="master">Maestro</option>
                              <option value="music">Música</option>
                              <option value="sfx">Efectos (SFX)</option>
                              <option value="ui">Interfaz (UI)</option>
                            </select>
                            <NumericInput
                              ariaLabel="Volumen canal"
                              min={0}
                              max={1}
                              step={0.05}
                              value={Number(act.parameters.volume ?? 0.8)}
                              onChange={(volume) => patchParams({ volume })}
                              className="rounded border border-[#32323c] bg-[#1a1a1e] px-1.5 py-0.5 font-mono text-[11px] text-zinc-100"
                            />
                          </div>
                        )}

                        {(act.type === 'object.destroy' ||
                          act.type === 'object.show' ||
                          act.type === 'object.hide' ||
                          act.type === 'particles.burst' ||
                          act.type === 'checkpoint.save') && (
                          <select
                            aria-label="Objeto destino de acción"
                            value={String(act.parameters.target ?? '')}
                            onChange={(e) => patchParams({ target: e.target.value })}
                            className="w-full rounded border border-[#32323c] bg-[#1a1a1e] px-1.5 py-1 text-[11px] text-zinc-100"
                          >
                            <option value="">Objeto disparador / actual</option>
                            {objects.map((o) => (
                              <option key={o.id} value={o.id}>
                                {o.name}
                              </option>
                            ))}
                          </select>
                        )}

                        {act.type === 'animation.play' && (
                          <div className="grid grid-cols-2 gap-1">
                            <select
                              aria-label="Objeto a animar"
                              value={String(act.parameters.target ?? '')}
                              onChange={(e) => patchParams({ target: e.target.value })}
                              className="rounded border border-[#32323c] bg-[#1a1a1e] px-1 py-0.5 text-[11px] text-zinc-100"
                            >
                              <option value="">Objeto disparador</option>
                              {objects.map((o) => (
                                <option key={o.id} value={o.id}>
                                  {o.name}
                                </option>
                              ))}
                            </select>
                            <input
                              type="text"
                              placeholder="Clip (idle/walk/jump)"
                              value={String(act.parameters.clip ?? '')}
                              onChange={(e) => patchParams({ clip: e.target.value })}
                              className="rounded border border-[#32323c] bg-[#1a1a1e] px-1.5 py-0.5 text-[11px] text-zinc-100"
                            />
                          </div>
                        )}

                        {act.type === 'tween.play' && (
                          <div className="grid grid-cols-2 gap-1">
                            <select
                              value={String(act.parameters.target ?? '')}
                              onChange={(e) => patchParams({ target: e.target.value })}
                              className="rounded border border-[#32323c] bg-[#1a1a1e] px-1 py-0.5 text-[11px] text-zinc-100"
                            >
                              <option value="">Objeto...</option>
                              {objects.map((o) => (
                                <option key={o.id} value={o.id}>
                                  {o.name}
                                </option>
                              ))}
                            </select>
                            <input
                              type="text"
                              placeholder="Nombre pista (opcional)"
                              value={String(act.parameters.trackName ?? '')}
                              onChange={(e) => patchParams({ trackName: e.target.value })}
                              className="rounded border border-[#32323c] bg-[#1a1a1e] px-1.5 py-0.5 text-[11px] text-zinc-100"
                            />
                          </div>
                        )}

                        {act.type === 'particles.emit' && (
                          <div className="grid grid-cols-3 gap-1">
                            <select
                              value={String(act.parameters.target ?? '')}
                              onChange={(e) => patchParams({ target: e.target.value })}
                              className="rounded border border-[#32323c] bg-[#1a1a1e] px-1 py-0.5 text-[11px] text-zinc-100"
                            >
                              <option value="">Disparador</option>
                              {objects.map((o) => (
                                <option key={o.id} value={o.id}>
                                  {o.name}
                                </option>
                              ))}
                            </select>
                            <select
                              value={String(act.parameters.preset ?? 'explosion')}
                              onChange={(e) => patchParams({ preset: e.target.value })}
                              className="rounded border border-[#32323c] bg-[#1a1a1e] px-1 py-0.5 text-[11px] text-zinc-100"
                            >
                              <option value="explosion">Explosión</option>
                              <option value="fire">Fuego</option>
                              <option value="smoke">Humo</option>
                              <option value="sparks">Chispas</option>
                              <option value="magic">Magia</option>
                              <option value="dust">Polvo</option>
                              <option value="rain">Lluvia</option>
                              <option value="snow">Nieve</option>
                            </select>
                            <NumericInput
                              ariaLabel="Cantidad de partículas"
                              min={1}
                              max={80}
                              title="Cantidad"
                              value={Number(act.parameters.count ?? 20)}
                              onChange={(count) => patchParams({ count })}
                              className="rounded border border-[#32323c] bg-[#1a1a1e] px-1.5 py-0.5 font-mono text-[11px] text-zinc-100"
                            />
                          </div>
                        )}

                        {act.type === 'object.spawn' && (
                          <div className="grid grid-cols-2 gap-1">
                            <select
                              aria-label="Objeto plantilla a clonar"
                              value={String(act.parameters.target ?? '')}
                              onChange={(e) => patchParams({ target: e.target.value })}
                              className="rounded border border-[#32323c] bg-[#1a1a1e] px-1 py-0.5 text-[11px] text-zinc-100"
                            >
                              <option value="">Plantilla...</option>
                              {objects.map((o) => (
                                <option key={o.id} value={o.id}>
                                  {o.name}
                                </option>
                              ))}
                            </select>
                            <select
                              aria-label="En posición de objeto"
                              value={String(act.parameters.atObjectId ?? '')}
                              onChange={(e) => patchParams({ atObjectId: e.target.value })}
                              className="rounded border border-[#32323c] bg-[#1a1a1e] px-1 py-0.5 text-[11px] text-zinc-100"
                            >
                              <option value="">Posición plantilla / X,Y</option>
                              {objects.map((o) => (
                                <option key={o.id} value={o.id}>
                                  En {o.name}
                                </option>
                              ))}
                            </select>
                          </div>
                        )}

                        {act.type === 'object.setProperty' && (
                          <div className="grid grid-cols-3 gap-1">
                            <select
                              value={String(act.parameters.target ?? '')}
                              onChange={(e) => patchParams({ target: e.target.value })}
                              className="rounded border border-[#32323c] bg-[#1a1a1e] px-1 py-0.5 text-[11px] text-zinc-100"
                            >
                              <option value="">Objeto...</option>
                              {objects.map((o) => (
                                <option key={o.id} value={o.id}>
                                  {o.name}
                                </option>
                              ))}
                            </select>
                            <select
                              value={String(act.parameters.property ?? 'opacity')}
                              onChange={(e) => patchParams({ property: e.target.value })}
                              className="rounded border border-[#32323c] bg-[#1a1a1e] px-1 py-0.5 text-[11px] text-zinc-100"
                            >
                              <option value="opacity">Opacidad</option>
                              <option value="rotation">Rotación</option>
                              <option value="scaleX">Escala X</option>
                              <option value="scaleY">Escala Y</option>
                              <option value="x">Pos X</option>
                              <option value="y">Pos Y</option>
                              <option value="flipX">Flip X (true/false)</option>
                              <option value="text">Texto</option>
                            </select>
                            <input
                              type="text"
                              placeholder="Valor"
                              value={String(act.parameters.value ?? '')}
                              onChange={(e) => patchParams({ value: e.target.value })}
                              className="rounded border border-[#32323c] bg-[#1a1a1e] px-1.5 py-0.5 font-mono text-[11px] text-zinc-100"
                            />
                          </div>
                        )}

                        {act.type === 'object.rotateToward' && (
                          <div className="grid grid-cols-2 gap-1">
                            <select
                              value={String(act.parameters.target ?? '')}
                              onChange={(e) => patchParams({ target: e.target.value })}
                              className="rounded border border-[#32323c] bg-[#1a1a1e] px-1 py-0.5 text-[11px] text-zinc-100"
                            >
                              <option value="">Objeto que rota...</option>
                              {objects.map((o) => (
                                <option key={o.id} value={o.id}>
                                  {o.name}
                                </option>
                              ))}
                            </select>
                            <select
                              value={String(act.parameters.lookAtTarget ?? '')}
                              onChange={(e) => patchParams({ lookAtTarget: e.target.value })}
                              className="rounded border border-[#32323c] bg-[#1a1a1e] px-1 py-0.5 text-[11px] text-zinc-100"
                            >
                              <option value="">Mirar hacia...</option>
                              {objects.map((o) => (
                                <option key={o.id} value={o.id}>
                                  {o.name}
                                </option>
                              ))}
                            </select>
                          </div>
                        )}

                        {act.type === 'object.flash' && (
                          <div className="grid grid-cols-3 gap-1">
                            <select
                              value={String(act.parameters.target ?? '')}
                              onChange={(e) => patchParams({ target: e.target.value })}
                              className="rounded border border-[#32323c] bg-[#1a1a1e] px-1 py-0.5 text-[11px] text-zinc-100"
                            >
                              <option value="">Toda la pantalla</option>
                              {objects.map((o) => (
                                <option key={o.id} value={o.id}>
                                  {o.name}
                                </option>
                              ))}
                            </select>
                            <input
                              type="color"
                              value={String(act.parameters.color ?? '#ffffff')}
                              onChange={(e) => patchParams({ color: e.target.value })}
                              className="h-6 w-full cursor-pointer rounded border border-[#32323c] bg-[#141416] p-0.5"
                            />
                            <NumericInput
                              ariaLabel="Duración destello"
                              min={0.05}
                              max={2}
                              step={0.05}
                              value={Number(act.parameters.duration ?? 0.15)}
                              onChange={(duration) => patchParams({ duration })}
                              className="rounded border border-[#32323c] bg-[#1a1a1e] px-1.5 py-0.5 font-mono text-[11px] text-zinc-100"
                            />
                          </div>
                        )}

                        {act.type === 'component.toggle' && (
                          <div className="grid grid-cols-3 gap-1">
                            <select
                              value={String(act.parameters.target ?? '')}
                              onChange={(e) => patchParams({ target: e.target.value })}
                              className="rounded border border-[#32323c] bg-[#1a1a1e] px-1 py-0.5 text-[11px] text-zinc-100"
                            >
                              <option value="">Objeto...</option>
                              {objects.map((o) => (
                                <option key={o.id} value={o.id}>
                                  {o.name}
                                </option>
                              ))}
                            </select>
                            <select
                              value={String(act.parameters.componentType ?? '')}
                              onChange={(e) => patchParams({ componentType: e.target.value })}
                              className="rounded border border-[#32323c] bg-[#1a1a1e] px-1 py-0.5 text-[11px] text-zinc-100"
                            >
                              <option value="">Comportamiento...</option>
                              {BEHAVIOR_DEFINITIONS.map((b) => (
                                <option key={b.type} value={b.type}>
                                  {b.label}
                                </option>
                              ))}
                            </select>
                            <select
                              value={String(act.parameters.enabled ?? 'toggle')}
                              onChange={(e) => {
                                const v = e.target.value;
                                patchParams({
                                  enabled: v === 'true' ? true : v === 'false' ? false : 'toggle',
                                });
                              }}
                              className="rounded border border-[#32323c] bg-[#1a1a1e] px-1 py-0.5 text-[11px] text-zinc-100"
                            >
                              <option value="toggle">Alternar</option>
                              <option value="true">Activar</option>
                              <option value="false">Desactivar</option>
                            </select>
                          </div>
                        )}

                        {(act.type === 'storage.save' || act.type === 'storage.load') && (
                          <input
                            type="text"
                            placeholder="Nombre variable (vacío = todas persistentes)"
                            value={String(act.parameters.variable ?? '')}
                            onChange={(e) => patchParams({ variable: e.target.value })}
                            className="w-full rounded border border-[#32323c] bg-[#1a1a1e] px-1.5 py-0.5 text-[11px] text-zinc-100"
                          />
                        )}

                        {act.type === 'leaderboard.submit' && (
                          <div className="grid grid-cols-2 gap-1">
                            <input
                              type="text"
                              placeholder="Variable puntuación (puntos)"
                              value={String(act.parameters.variable ?? 'puntos')}
                              onChange={(e) => patchParams({ variable: e.target.value })}
                              className="rounded border border-[#32323c] bg-[#1a1a1e] px-1.5 py-0.5 text-[11px] text-zinc-100"
                            />
                            <input
                              type="text"
                              placeholder="Nombre jugador"
                              value={String(act.parameters.playerName ?? 'Jugador')}
                              onChange={(e) => patchParams({ playerName: e.target.value })}
                              className="rounded border border-[#32323c] bg-[#1a1a1e] px-1.5 py-0.5 text-[11px] text-zinc-100"
                            />
                          </div>
                        )}

                        {(act.type === 'object.move' ||
                          act.type === 'object.teleport' ||
                          act.type === 'physics.impulse' ||
                          act.type === 'physics.force' ||
                          act.type === 'physics.setVelocity') && (
                          <div className={act.type === 'physics.impulse' ? 'grid grid-cols-4 gap-1' : 'grid grid-cols-3 gap-1'}>
                            <select
                              aria-label="Objeto destino de física o movimiento"
                              value={String(act.parameters.target ?? '')}
                              onChange={(e) => patchParams({ target: e.target.value })}
                              className="rounded border border-[#32323c] bg-[#1a1a1e] px-1 py-0.5 text-[11px] text-zinc-100"
                            >
                              <option value="">Objeto...</option>
                              <option value="$self">$self (Emisor)</option>
                              <option value="$other">$other (Colisión)</option>
                              {objects.map((o) => (
                                <option key={o.id} value={o.id}>
                                  {o.name}
                                </option>
                              ))}
                            </select>
                            <NumericInput
                              ariaLabel="Valor X o velocidad X"
                              placeholder={act.type === 'physics.impulse' ? 'ix' : 'X / vx'}
                              value={Number(
                                act.parameters.dx ??
                                  act.parameters.x ??
                                  act.parameters.ix ??
                                  act.parameters.vx ??
                                  act.parameters.fx ??
                                  0
                              )}
                              onChange={(v) => {
                                if (act.type === 'object.move') patchParams({ dx: v });
                                else if (act.type === 'object.teleport') patchParams({ x: v });
                                else if (act.type === 'physics.force') patchParams({ fx: v });
                                else if (act.type === 'physics.impulse') patchParams({ ix: v });
                                else patchParams({ vx: v });
                              }}
                              className="rounded border border-[#32323c] bg-[#1a1a1e] px-1.5 py-0.5 font-mono text-[11px] text-zinc-100"
                            />
                            <NumericInput
                              ariaLabel="Valor Y o velocidad Y"
                              placeholder={act.type === 'physics.impulse' ? 'iy' : 'Y / vy'}
                              value={Number(
                                act.parameters.dy ??
                                  act.parameters.y ??
                                  act.parameters.iy ??
                                  act.parameters.vy ??
                                  act.parameters.fy ??
                                  0
                              )}
                              onChange={(v) => {
                                if (act.type === 'object.move') patchParams({ dy: v });
                                else if (act.type === 'object.teleport') patchParams({ y: v });
                                else if (act.type === 'physics.force') patchParams({ fy: v });
                                else if (act.type === 'physics.impulse') patchParams({ iy: v });
                                else patchParams({ vy: v });
                              }}
                              className="rounded border border-[#32323c] bg-[#1a1a1e] px-1.5 py-0.5 font-mono text-[11px] text-zinc-100"
                            />
                            {act.type === 'physics.impulse' && (
                              <NumericInput
                                ariaLabel="Impulso Z (3D)"
                                placeholder="iz"
                                value={Number(act.parameters.iz ?? 0)}
                                onChange={(iz) => patchParams({ iz })}
                                className="rounded border border-[#32323c] bg-[#1a1a1e] px-1.5 py-0.5 font-mono text-[11px] text-zinc-100"
                              />
                            )}
                          </div>
                        )}

                        {(act.type === 'health.damage' || act.type === 'health.heal') && (
                          <div className="grid grid-cols-2 gap-1">
                            <select
                              value={String(act.parameters.target ?? '')}
                              onChange={(e) => patchParams({ target: e.target.value })}
                              className="rounded border border-[#32323c] bg-[#1a1a1e] px-1 py-0.5 text-[11px] text-zinc-100"
                            >
                              <option value="">Objeto...</option>
                              <option value="$self">$self (Emisor)</option>
                              <option value="$other">$other (Colisión)</option>
                              {objects.map((o) => (
                                <option key={o.id} value={o.id}>
                                  {o.name}
                                </option>
                              ))}
                            </select>
                            <NumericInput
                              ariaLabel="Cantidad de salud o daño"
                              min={1}
                              value={Number(act.parameters.amount ?? 10)}
                              onChange={(amount) => patchParams({ amount })}
                              className="rounded border border-[#32323c] bg-[#1a1a1e] px-1.5 py-0.5 font-mono text-[11px] text-zinc-100"
                            />
                          </div>
                        )}

                        {act.type === 'state.set' && (
                          <div className="grid grid-cols-2 gap-1">
                            <select
                              value={String(act.parameters.target ?? '')}
                              onChange={(e) => patchParams({ target: e.target.value })}
                              className="rounded border border-[#32323c] bg-[#1a1a1e] px-1 py-0.5 text-[11px] text-zinc-100"
                            >
                              <option value="">Objeto...</option>
                              <option value="$self">$self (Emisor)</option>
                              <option value="$other">$other (Colisión)</option>
                              {objects.map((o) => (
                                <option key={o.id} value={o.id}>
                                  {o.name}
                                </option>
                              ))}
                            </select>
                            <input
                              type="text"
                              placeholder="nuevo estado"
                              value={String(act.parameters.state ?? 'idle')}
                              onChange={(e) => patchParams({ state: e.target.value })}
                              className="rounded border border-[#32323c] bg-[#1a1a1e] px-1.5 py-0.5 text-[11px] text-zinc-100"
                            />
                          </div>
                        )}

                        {(act.type === 'scene.load' || act.type === 'scene.overlay') && (
                          <select
                            aria-label="Escena destino"
                            value={String(act.parameters.sceneId ?? '')}
                            onChange={(e) => patchParams({ sceneId: e.target.value })}
                            className="w-full rounded border border-[#32323c] bg-[#1a1a1e] px-1.5 py-1 text-[11px] text-zinc-100"
                          >
                            <option value="">Seleccionar escena...</option>
                            {scenes.map((sc) => (
                              <option key={sc.id} value={sc.id}>
                                {sc.name}
                              </option>
                            ))}
                          </select>
                        )}

                        {act.type === 'prefab.spawn' && (
                          <div className="grid grid-cols-2 gap-1">
                            <select
                              aria-label="Prefab a instanciar"
                              value={String(act.parameters.prefabId ?? '')}
                              onChange={(e) => patchParams({ prefabId: e.target.value })}
                              className="rounded border border-[#32323c] bg-[#1a1a1e] px-1 py-0.5 text-[11px] text-zinc-100"
                            >
                              <option value="">Prefab...</option>
                              {prefabs.map((pf) => (
                                <option key={pf.id} value={pf.id}>
                                  {pf.name}
                                </option>
                              ))}
                            </select>
                            <select
                              aria-label="Objeto ancla de spawn"
                              value={String(act.parameters.atObjectId ?? '')}
                              onChange={(e) => patchParams({ atObjectId: e.target.value })}
                              className="rounded border border-[#32323c] bg-[#1a1a1e] px-1 py-0.5 text-[11px] text-zinc-100"
                            >
                              <option value="">Posición fija (640,360)</option>
                              {objects.map((o) => (
                                <option key={o.id} value={o.id}>
                                  En {o.name}
                                </option>
                              ))}
                            </select>
                          </div>
                        )}

                        {act.type === 'camera.shake' && (
                          <div className="grid grid-cols-2 gap-1">
                            <NumericInput
                              ariaLabel="Intensidad de sacudida"
                              min={1}
                              value={Number(act.parameters.intensity ?? 10)}
                              onChange={(intensity) => patchParams({ intensity })}
                              className="rounded border border-[#32323c] bg-[#1a1a1e] px-1.5 py-0.5 font-mono text-[11px] text-zinc-100"
                              title="Intensidad (px)"
                            />
                            <NumericInput
                              ariaLabel="Duración de sacudida"
                              min={0.05}
                              step={0.05}
                              value={Number(act.parameters.duration ?? 0.25)}
                              onChange={(duration) => patchParams({ duration })}
                              className="rounded border border-[#32323c] bg-[#1a1a1e] px-1.5 py-0.5 font-mono text-[11px] text-zinc-100"
                              title="Duración (s)"
                            />
                          </div>
                        )}

                        {act.type === 'event.emit' && (
                          <input
                            type="text"
                            placeholder="Nombre del evento"
                            value={String(act.parameters.eventName ?? '')}
                            onChange={(e) => patchParams({ eventName: e.target.value })}
                            className="w-full rounded border border-[#32323c] bg-[#1a1a1e] px-1.5 py-0.5 text-[11px] text-zinc-100"
                          />
                        )}

                        {act.type === 'script.call' && (
                          <div className="grid grid-cols-2 gap-1">
                            <select
                              aria-label="Objeto destino para script"
                              value={String(act.parameters.target ?? '')}
                              onChange={(e) => patchParams({ target: e.target.value })}
                              className="rounded border border-[#32323c] bg-[#1a1a1e] px-1 py-0.5 text-[11px] text-zinc-100"
                            >
                              <option value="">Cualquier objeto / Escena</option>
                              <option value="$self">$self (Emisor)</option>
                              <option value="$other">$other (Colisión)</option>
                              {objects.map((o) => (
                                <option key={o.id} value={o.id}>{o.name}</option>
                              ))}
                            </select>
                            <select
                              aria-label="Script JS destino"
                              value={String(act.parameters.scriptId ?? '')}
                              onChange={(e) => patchParams({ scriptId: e.target.value })}
                              className="rounded border border-[#32323c] bg-[#1a1a1e] px-1 py-0.5 text-[11px] text-zinc-100"
                            >
                              <option value="">Script por nombre...</option>
                              {scripts.filter((s) => s.kind === 'script').map((sc) => (
                                <option key={sc.id} value={sc.id}>{sc.name}</option>
                              ))}
                            </select>
                            <input
                              type="text"
                              placeholder="función (ej: activate)"
                              value={String(act.parameters.methodName ?? 'activate')}
                              onChange={(e) => patchParams({ methodName: e.target.value })}
                              className="rounded border border-[#32323c] bg-[#1a1a1e] px-1.5 py-0.5 text-[11px] text-zinc-100"
                            />
                            <input
                              type="text"
                              placeholder="arg opcional (ej: 10)"
                              value={act.parameters.arg !== undefined ? String(act.parameters.arg) : ''}
                              onChange={(e) => {
                                const raw = e.target.value;
                                patchParams({
                                  arg: raw === '' ? undefined : !Number.isNaN(Number(raw)) ? Number(raw) : raw,
                                });
                              }}
                              className="rounded border border-[#32323c] bg-[#1a1a1e] px-1.5 py-0.5 text-[11px] text-zinc-100"
                            />
                          </div>
                        )}

                        {(act.type === 'ui.openInterface' ||
                          act.type === 'ui.closeInterface' ||
                          act.type === 'ui.toggleInterface') && (
                          <select
                            aria-label="Interfaz widget destino"
                            value={String(act.parameters.target ?? '')}
                            onChange={(e) => patchParams({ target: e.target.value })}
                            className="w-full rounded border border-[#32323c] bg-[#1a1a1e] px-1.5 py-1 text-[11px] text-zinc-100"
                          >
                            <option value="">Seleccionar interfaz (ui_widget)...</option>
                            {objects.filter((o) => o.type === 'ui_widget').map((o) => (
                              <option key={o.id} value={o.id}>{o.name}</option>
                            ))}
                          </select>
                        )}

                        {act.type === 'camera.switch' && (
                          <div className="grid grid-cols-2 gap-1">
                            <select
                              aria-label="Cámara o punto objetivo destino"
                              value={String(act.parameters.cameraId ?? act.parameters.cameraObjectId ?? '')}
                              onChange={(e) => patchParams({ cameraId: e.target.value })}
                              className="rounded border border-[#32323c] bg-[#1a1a1e] px-1 py-0.5 text-[11px] text-zinc-100"
                            >
                              <option value="">Seleccionar cámara u objeto...</option>
                              {objects
                                .filter((o) => o.type === 'camera_3d' || o.type === 'mesh_3d')
                                .map((o) => (
                                  <option key={o.id} value={o.id}>
                                    {o.type === 'camera_3d' ? `📷 ${o.name}` : o.name}
                                  </option>
                                ))}
                            </select>
                            <NumericInput
                              ariaLabel="Duración transición de cámara"
                              min={0}
                              step={0.1}
                              value={Number(act.parameters.duration ?? act.parameters.blendSec ?? 0.5)}
                              onChange={(duration) => patchParams({ duration })}
                              className="rounded border border-[#32323c] bg-[#1a1a1e] px-1.5 py-0.5 font-mono text-[11px] text-zinc-100"
                              title="Duración transición (s)"
                            />
                          </div>
                        )}

                        {act.type === 'anim3d.setState' && (
                          <div className="grid grid-cols-2 gap-1">
                            <select
                              value={String(act.parameters.target ?? '')}
                              onChange={(e) => patchParams({ target: e.target.value })}
                              className="rounded border border-[#32323c] bg-[#1a1a1e] px-1 py-0.5 text-[11px] text-zinc-100"
                            >
                              <option value="">Objeto 3D...</option>
                              {objects.filter((o) => o.type === 'mesh_3d').map((o) => (
                                <option key={o.id} value={o.id}>{o.name}</option>
                              ))}
                            </select>
                            <input
                              type="text"
                              placeholder="Estado (Idle, Run...)"
                              value={String(act.parameters.stateName ?? 'Idle')}
                              onChange={(e) => patchParams({ stateName: e.target.value })}
                              className="rounded border border-[#32323c] bg-[#1a1a1e] px-1.5 py-0.5 text-[11px] text-zinc-100"
                            />
                          </div>
                        )}

                        {act.type === 'vfx.emit' && (
                          <div className="grid grid-cols-2 gap-1">
                            <select
                              value={String(act.parameters.target ?? '')}
                              onChange={(e) => patchParams({ target: e.target.value })}
                              className="rounded border border-[#32323c] bg-[#1a1a1e] px-1 py-0.5 text-[11px] text-zinc-100"
                            >
                              <option value="">En origen...</option>
                              {objects.map((o) => (
                                <option key={o.id} value={o.id}>{o.name}</option>
                              ))}
                            </select>
                            <NumericInput
                              ariaLabel="Cantidad partículas VFX"
                              min={4}
                              max={200}
                              value={Number(act.parameters.count ?? 24)}
                              onChange={(count) => patchParams({ count })}
                              className="rounded border border-[#32323c] bg-[#1a1a1e] px-1.5 py-0.5 font-mono text-[11px] text-zinc-100"
                              title="Cantidad partículas"
                            />
                          </div>
                        )}

                        {(act.type === 'ai.chase' || act.type === 'ai.moveTo' || act.type === 'ai.stop') && (
                          <div className="grid grid-cols-2 gap-1">
                            <select
                              value={String(act.parameters.target ?? '')}
                              onChange={(e) => patchParams({ target: e.target.value })}
                              className="rounded border border-[#32323c] bg-[#1a1a1e] px-1 py-0.5 text-[11px] text-zinc-100"
                            >
                              <option value="">Agente IA...</option>
                              {objects.filter((o) => o.type === 'mesh_3d').map((o) => (
                                <option key={o.id} value={o.id}>{o.name}</option>
                              ))}
                            </select>
                            {act.type === 'ai.chase' ? (
                              <select
                                value={String(act.parameters.chaseTargetId ?? '')}
                                onChange={(e) => patchParams({ chaseTargetId: e.target.value })}
                                className="rounded border border-[#32323c] bg-[#1a1a1e] px-1 py-0.5 text-[11px] text-zinc-100"
                              >
                                <option value="">Objetivo a perseguir...</option>
                                {objects.map((o) => (
                                  <option key={o.id} value={o.id}>{o.name}</option>
                                ))}
                              </select>
                            ) : act.type === 'ai.moveTo' ? (
                              <div className="grid grid-cols-2 gap-1">
                                <NumericInput
                                  ariaLabel="Destino IA X"
                                  value={Number(act.parameters.x ?? 0)}
                                  onChange={(x) => patchParams({ x })}
                                  className="rounded border border-[#32323c] bg-[#1a1a1e] px-1 py-0.5 font-mono text-[11px] text-zinc-100"
                                  title="X"
                                />
                                <NumericInput
                                  ariaLabel="Destino IA Z"
                                  value={Number(act.parameters.z ?? 0)}
                                  onChange={(z) => patchParams({ z })}
                                  className="rounded border border-[#32323c] bg-[#1a1a1e] px-1 py-0.5 font-mono text-[11px] text-zinc-100"
                                  title="Z"
                                />
                              </div>
                            ) : (
                              <span className="text-[10px] text-zinc-500 self-center">Detiene agente</span>
                            )}
                          </div>
                        )}

                        {act.type === 'dialogue.start' && (
                          <input
                            type="text"
                            placeholder="ID del diálogo (ej: dlg_1)"
                            value={String(act.parameters.dialogueId ?? '')}
                            onChange={(e) => patchParams({ dialogueId: e.target.value })}
                            className="w-full rounded border border-[#32323c] bg-[#1a1a1e] px-1.5 py-0.5 text-[11px] text-zinc-100"
                          />
                        )}

                        {act.type === 'i18n.setLocale' && (
                          <select
                            aria-label="Idioma a activar"
                            value={String(act.parameters.locale ?? 'es')}
                            onChange={(e) => patchParams({ locale: e.target.value })}
                            className="w-full rounded border border-[#32323c] bg-[#1a1a1e] px-1.5 py-0.5 text-[11px] text-zinc-100"
                          >
                            <option value="es">Español (es)</option>
                            <option value="en">English (en)</option>
                            <option value="pt">Português (pt)</option>
                          </select>
                        )}

                        {act.type === 'vehicle.enterExit' && (
                          <div className="grid grid-cols-3 gap-1">
                            <select
                              aria-label="Personaje conductor"
                              value={String(act.parameters.actorId ?? '')}
                              onChange={(e) => patchParams({ actorId: e.target.value })}
                              className="rounded border border-[#32323c] bg-[#1a1a1e] px-1 py-0.5 text-[11px] text-zinc-100"
                            >
                              <option value="">Jugador (auto)</option>
                              {objects.filter((o) => o.type === 'mesh_3d').map((o) => (
                                <option key={o.id} value={o.id}>{o.name}</option>
                              ))}
                            </select>
                            <select
                              aria-label="Vehículo destino"
                              value={String(act.parameters.vehicleId ?? '')}
                              onChange={(e) => patchParams({ vehicleId: e.target.value })}
                              className="rounded border border-[#32323c] bg-[#1a1a1e] px-1 py-0.5 text-[11px] text-zinc-100"
                            >
                              <option value="">Vehículo...</option>
                              {objects.filter((o) => o.vehicle?.enabled || o.type === 'mesh_3d').map((o) => (
                                <option key={o.id} value={o.id}>{o.name}</option>
                              ))}
                            </select>
                            <NumericInput
                              ariaLabel="Distancia al bajar del vehículo"
                              min={0.5}
                              max={12}
                              step={0.2}
                              value={Number(act.parameters.exitOffsetX ?? 2.6)}
                              onChange={(exitOffsetX) => patchParams({ exitOffsetX })}
                              className="rounded border border-[#32323c] bg-[#1a1a1e] px-1.5 py-0.5 font-mono text-[11px] text-zinc-100"
                              title="Offset X al bajar (m)"
                            />
                          </div>
                        )}

                        {act.type === 'wait' && (
                          <NumericInput
                            ariaLabel="Segundos de espera"
                            min={0.05}
                            step={0.05}
                            placeholder="Segundos"
                            value={Number(act.parameters.seconds ?? 0.5)}
                            onChange={(seconds) => patchParams({ seconds })}
                            className="w-full rounded border border-[#32323c] bg-[#1a1a1e] px-1.5 py-0.5 font-mono text-[11px] text-zinc-100"
                          />
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
