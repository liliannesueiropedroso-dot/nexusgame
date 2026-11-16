import React, { useState } from 'react';
import { ArrowDown, ArrowUp, Plus, Power, Trash2, Zap } from 'lucide-react';
import { SYNTH_PRESETS } from '../../engine/audio/audioEngine';
import { BEHAVIOR_DEFINITIONS } from '../../engine/components/behaviorTypes';
import {
  COLLISION_LAYERS,
  type ActionDefinition,
  type ActionType,
  type CollisionLayer,
  type ConditionCombinator,
  type ConditionDefinition,
  type ConditionType,
  type GameMechanic,
  type GameObjectData,
  type MechanicTriggerEvent,
  type ProjectVariable,
  type SceneData,
} from '../../engine/core/types';
import type { PrefabDefinition, ProjectAssetMeta } from '../../project/models/project';
import { createId } from '../../utils/id';
import { KeyCaptureField } from '../common/KeyCaptureField';

interface MechanicsPanelProps {
  mechanics: GameMechanic[];
  objects: GameObjectData[];
  variables: ProjectVariable[];
  assets: ProjectAssetMeta[];
  scenes?: SceneData[];
  prefabs?: PrefabDefinition[];
  onChangeMechanics: (next: GameMechanic[]) => void;
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
  prefabs = [],
  onChangeMechanics,
}) => {
  const [selectedId, setSelectedId] = useState<string | null>(mechanics[0]?.id ?? null);

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
          <input
            type="number"
            min={0.1}
            step={0.1}
            value={Number(mech.trigger.intervalSec ?? 1)}
            onChange={(e) =>
              updateMechanic(mech.id, (m) => ({
                ...m,
                trigger: {
                  ...m.trigger,
                  intervalSec: Math.max(0.1, Number(e.target.value) || 1),
                },
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

  return (
    <div className="flex h-full min-h-0">
      {/* Columna izquierda: lista de reglas */}
      <div className="flex w-64 shrink-0 flex-col border-r border-[#2b2b33] bg-[#16161a]">
        <div className="flex items-center justify-between border-b border-[#2b2b33] px-2.5 py-2">
          <span className="text-[11px] font-semibold text-zinc-300">
            Reglas ({mechanics.length})
          </span>
          <button
            type="button"
            onClick={handleCreateRule}
            className="inline-flex items-center gap-1 rounded bg-blue-600 px-2 py-1 text-[11px] font-semibold text-white hover:bg-blue-500 whitespace-nowrap"
          >
            <Plus className="h-3 w-3" />
            <span>Nueva regla</span>
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
                <input
                  type="number"
                  value={activeMechanic.priority}
                  onChange={(e) =>
                    updateMechanic(activeMechanic.id, (m) => ({
                      ...m,
                      priority: Number(e.target.value) || 0,
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
                            <input
                              type="number"
                              value={Number(cond.value ?? 0)}
                              onChange={(e) =>
                                updateMechanic(activeMechanic.id, (m) => ({
                                  ...m,
                                  conditions: m.conditions.map((c) =>
                                    c.id === cond.id
                                      ? { ...c, value: Number(e.target.value) || 0 }
                                      : c
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
                            <input
                              type="number"
                              value={Number(cond.value ?? 120)}
                              onChange={(e) =>
                                updateMechanic(activeMechanic.id, (m) => ({
                                  ...m,
                                  conditions: m.conditions.map((c) =>
                                    c.id === cond.id ? { ...c, value: Number(e.target.value) } : c
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
                            <input
                              type="number"
                              min={0}
                              max={100}
                              value={Number(cond.value ?? 50)}
                              onChange={(e) =>
                                updateMechanic(activeMechanic.id, (m) => ({
                                  ...m,
                                  conditions: m.conditions.map((c) =>
                                    c.id === cond.id
                                      ? {
                                          ...c,
                                          value: Math.max(0, Math.min(100, Number(e.target.value) || 0)),
                                        }
                                      : c
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
                              <input
                                type="number"
                                step={0.1}
                                min={0.1}
                                max={2}
                                title="Volumen (0.1 - 2)"
                                placeholder="Vol 1"
                                value={Number(act.parameters.volume ?? 1)}
                                onChange={(e) => patchParams({ volume: Number(e.target.value) || 1 })}
                                className="rounded border border-[#32323c] bg-[#1a1a1e] px-1.5 py-0.5 font-mono text-[10px] text-zinc-100"
                              />
                              <input
                                type="number"
                                step={0.1}
                                min={0.3}
                                max={3}
                                title="Tono / Pitch (0.5 - 2)"
                                placeholder="Pitch 1"
                                value={Number(act.parameters.pitch ?? 1)}
                                onChange={(e) => patchParams({ pitch: Number(e.target.value) || 1 })}
                                className="rounded border border-[#32323c] bg-[#1a1a1e] px-1.5 py-0.5 font-mono text-[10px] text-zinc-100"
                              />
                              <input
                                type="number"
                                step={0.05}
                                min={0}
                                max={1}
                                title="Variación aleatoria de tono"
                                placeholder="Var tono"
                                value={Number(act.parameters.randomPitch ?? 0)}
                                onChange={(e) => patchParams({ randomPitch: Number(e.target.value) || 0 })}
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
                              <input
                                type="number"
                                step={0.1}
                                min={0}
                                max={1.5}
                                title="Volumen"
                                placeholder="Volumen"
                                value={Number(act.parameters.volume ?? 1)}
                                onChange={(e) => patchParams({ volume: Number(e.target.value) || 1 })}
                                className="rounded border border-[#32323c] bg-[#1a1a1e] px-1.5 py-0.5 font-mono text-[10px] text-zinc-100"
                              />
                              <input
                                type="number"
                                step={0.1}
                                min={0.3}
                                max={2.5}
                                title="Tono / Pitch"
                                placeholder="Pitch"
                                value={Number(act.parameters.pitch ?? 1)}
                                onChange={(e) => patchParams({ pitch: Number(e.target.value) || 1 })}
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
                              <input
                                type="number"
                                step={0.05}
                                min={0}
                                max={1.5}
                                title="Volumen música"
                                value={Number(act.parameters.volume ?? 0.85)}
                                onChange={(e) =>
                                  patchParams({ volume: Math.max(0, Math.min(1.5, Number(e.target.value) || 0.85)) })
                                }
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
                            <input
                              type="number"
                              min={0}
                              max={1}
                              step={0.05}
                              value={Number(act.parameters.volume ?? 0.8)}
                              onChange={(e) =>
                                patchParams({
                                  volume: Math.max(0, Math.min(1, Number(e.target.value) || 0)),
                                })
                              }
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
                            <input
                              type="number"
                              min={1}
                              max={80}
                              title="Cantidad"
                              value={Number(act.parameters.count ?? 20)}
                              onChange={(e) =>
                                patchParams({ count: Math.max(1, Number(e.target.value) || 20) })
                              }
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
                            <input
                              type="number"
                              min={0.05}
                              max={2}
                              step={0.05}
                              value={Number(act.parameters.duration ?? 0.15)}
                              onChange={(e) =>
                                patchParams({ duration: Number(e.target.value) || 0.15 })
                              }
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
                            <input
                              type="number"
                              placeholder="X / vx"
                              value={Number(
                                act.parameters.dx ?? act.parameters.x ?? act.parameters.vx ?? act.parameters.fx ?? 0
                              )}
                              onChange={(e) => {
                                const v = Number(e.target.value);
                                if (act.type === 'object.move') patchParams({ dx: v });
                                else if (act.type === 'object.teleport') patchParams({ x: v });
                                else if (act.type === 'physics.force') patchParams({ fx: v });
                                else patchParams({ vx: v });
                              }}
                              className="rounded border border-[#32323c] bg-[#1a1a1e] px-1.5 py-0.5 font-mono text-[11px] text-zinc-100"
                            />
                            <input
                              type="number"
                              placeholder="Y / vy"
                              value={Number(
                                act.parameters.dy ?? act.parameters.y ?? act.parameters.vy ?? act.parameters.fy ?? 0
                              )}
                              onChange={(e) => {
                                const v = Number(e.target.value);
                                if (act.type === 'object.move') patchParams({ dy: v });
                                else if (act.type === 'object.teleport') patchParams({ y: v });
                                else if (act.type === 'physics.force') patchParams({ fy: v });
                                else patchParams({ vy: v });
                              }}
                              className="rounded border border-[#32323c] bg-[#1a1a1e] px-1.5 py-0.5 font-mono text-[11px] text-zinc-100"
                            />
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
                              {objects.map((o) => (
                                <option key={o.id} value={o.id}>
                                  {o.name}
                                </option>
                              ))}
                            </select>
                            <input
                              type="number"
                              min={1}
                              value={Number(act.parameters.amount ?? 10)}
                              onChange={(e) => patchParams({ amount: Number(e.target.value) || 10 })}
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
                            <input
                              type="number"
                              min={1}
                              max={60}
                              value={Number(act.parameters.intensity ?? 10)}
                              onChange={(e) =>
                                patchParams({ intensity: Number(e.target.value) || 10 })
                              }
                              className="rounded border border-[#32323c] bg-[#1a1a1e] px-1.5 py-0.5 font-mono text-[11px] text-zinc-100"
                              title="Intensidad (px)"
                            />
                            <input
                              type="number"
                              min={0.05}
                              step={0.05}
                              value={Number(act.parameters.duration ?? 0.25)}
                              onChange={(e) =>
                                patchParams({ duration: Number(e.target.value) || 0.25 })
                              }
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

                        {act.type === 'wait' && (
                          <input
                            type="number"
                            min={0.05}
                            step={0.05}
                            placeholder="Segundos"
                            value={Number(act.parameters.seconds ?? 0.5)}
                            onChange={(e) =>
                              patchParams({ seconds: Math.max(0.05, Number(e.target.value) || 0.5) })
                            }
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
