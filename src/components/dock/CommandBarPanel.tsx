import React, { useMemo, useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  Play,
  ShieldAlert,
  Star,
  Terminal,
  Trash2,
} from 'lucide-react';
import {
  applyCommandPlan,
  planCommandBarInput,
  type CommandBarMode,
} from '../../engine/commandbar/commandPlan';
import type {
  CommandBarHistoryEntry,
  NexusProject,
} from '../../project/models/project';

interface CommandBarPanelProps {
  project: NexusProject;
  activeSceneId: string;
  selectedIds: string[];
  onCommitCommandResult: (
    nextProject: NexusProject,
    createdIds: string[],
    summary: string
  ) => void;
  onUpdateCommandHistory: (next: CommandBarHistoryEntry[]) => void;
}

const DSL_PRESETS: Array<{ label: string; cmd: string }> = [
  {
    label: '+ Torre 3D',
    cmd: 'crear cubo nombre=Torre_Vigia x=12 y=3 z=-8 sx=3 sy=6 sz=3 color=#6366f1 tag=edificio\nrenombrar @lastCreated Torre_Norte',
  },
  {
    label: 'Mover @selected',
    cmd: 'mover @selected dx=2 dy=0 dz=-2',
  },
  {
    label: 'Streaming Mundo Abierto',
    cmd: 'streaming activar chunk=64 carga=140 descarga=210 perfil=pc',
  },
  {
    label: 'Eliminar @selected',
    cmd: 'eliminar @selected',
  },
];

const JSON_PRESET = JSON.stringify(
  {
    ops: [
      {
        op: 'create_object',
        type: 'mesh_3d',
        shape3d: 'box',
        name: 'Bloque_Lote',
        x: 6,
        y: 1.5,
        z: -4,
        sx: 2,
        sy: 3,
        sz: 2,
        color: '#22d3ee',
        tags: ['estructura'],
      },
      {
        op: 'set_variable',
        name: 'zona_descubierta',
        value: true,
      },
    ],
  },
  null,
  2
);

export const CommandBarPanel: React.FC<CommandBarPanelProps> = ({
  project,
  activeSceneId,
  selectedIds,
  onCommitCommandResult,
  onUpdateCommandHistory,
}) => {
  const [mode, setMode] = useState<CommandBarMode>('dsl');
  const [inputText, setInputText] = useState<string>(DSL_PRESETS[0].cmd);
  const [destructiveConfirmed, setDestructiveConfirmed] = useState(false);
  const [lastAppliedMsg, setLastAppliedMsg] = useState<string>('');

  const plan = useMemo(
    () => planCommandBarInput(project, activeSceneId, selectedIds, inputText, mode),
    [project, activeSceneId, selectedIds, inputText, mode]
  );

  const history = project.commandHistory ?? [];

  const handleModeSwitch = (nextMode: CommandBarMode) => {
    setMode(nextMode);
    setDestructiveConfirmed(false);
    if (nextMode === 'json' && !inputText.trim().startsWith('{') && !inputText.trim().startsWith('[')) {
      setInputText(JSON_PRESET);
    } else if (nextMode === 'dsl' && (inputText.trim().startsWith('{') || inputText.trim().startsWith('['))) {
      setInputText(DSL_PRESETS[0].cmd);
    }
  };

  const handleExecute = () => {
    if (!plan.valid) return;
    if (plan.requiresDestructiveConfirm && !destructiveConfirmed) return;
    const res = applyCommandPlan(
      project,
      activeSceneId,
      selectedIds,
      plan,
      destructiveConfirmed
    );
    onCommitCommandResult(res.nextProject, res.createdIds, plan.summary);
    setDestructiveConfirmed(false);
    setLastAppliedMsg(`Aplicado en 1 paso de historial (Deshacer disponible): ${plan.summary}`);
  };

  const toggleFavorite = (id: string) => {
    onUpdateCommandHistory(
      history.map((h) => (h.id === id ? { ...h, favorite: !h.favorite } : h))
    );
  };

  const deleteHistoryItem = (id: string) => {
    onUpdateCommandHistory(history.filter((h) => h.id !== id));
  };

  return (
    <div className="grid h-full grid-cols-1 gap-2 p-2 text-xs text-zinc-200 lg:grid-cols-12 overflow-y-auto">
      {/* Columna izquierda: Entrada DSL o JSON */}
      <div className="flex flex-col gap-1.5 lg:col-span-5">
        <div className="flex flex-wrap items-center justify-between gap-1.5">
          <div className="flex items-center gap-1.5 font-semibold text-zinc-100">
            <Terminal className="h-3.5 w-3.5 text-cyan-400" />
            <span>Barra de Comandos 2.0</span>
          </div>
          <div className="inline-flex rounded border border-[#2f2f3b] bg-[#1b1b22] p-0.5">
            <button
              type="button"
              onClick={() => handleModeSwitch('dsl')}
              className={`rounded px-2 py-0.5 text-[10px] font-semibold transition-colors ${
                mode === 'dsl'
                  ? 'bg-cyan-600 text-white'
                  : 'text-zinc-400 hover:text-zinc-100'
              }`}
            >
              DSL Seguro
            </button>
            <button
              type="button"
              onClick={() => handleModeSwitch('json')}
              className={`rounded px-2 py-0.5 text-[10px] font-semibold transition-colors ${
                mode === 'json'
                  ? 'bg-violet-600 text-white'
                  : 'text-zinc-400 hover:text-zinc-100'
              }`}
            >
              JSON Declarativo
            </button>
          </div>
        </div>

        <div className="flex flex-wrap gap-1">
          {mode === 'dsl' ? (
            DSL_PRESETS.map((p) => (
              <button
                key={p.label}
                type="button"
                onClick={() => {
                  setInputText(p.cmd);
                  setDestructiveConfirmed(false);
                }}
                className="rounded border border-[#32323e] bg-[#1e1e26] px-2 py-0.5 text-[10px] text-zinc-300 hover:border-cyan-500/60 hover:text-white"
              >
                {p.label}
              </button>
            ))
          ) : (
            <button
              type="button"
              onClick={() => {
                setInputText(JSON_PRESET);
                setDestructiveConfirmed(false);
              }}
              className="rounded border border-[#32323e] bg-[#1e1e26] px-2 py-0.5 text-[10px] text-zinc-300 hover:border-violet-500/60 hover:text-white"
            >
              Cargar plantilla JSON
            </button>
          )}
          <span className="ml-auto text-[10px] text-zinc-500">
            Refs: @selected · @lastCreated · #tag
          </span>
        </div>

        <label htmlFor="nexus-command-bar-input" className="sr-only">
          Editor de comandos DSL o JSON
        </label>
        <textarea
          id="nexus-command-bar-input"
          value={inputText}
          onChange={(e) => {
            setInputText(e.target.value);
            setDestructiveConfirmed(false);
          }}
          rows={5}
          spellCheck={false}
          placeholder={
            mode === 'dsl'
              ? 'Ej: crear cubo nombre=Muro x=0 y=2 z=5 sx=6 sy=4 sz=1'
              : '{ "ops": [ ... ] }'
          }
          className="min-h-[112px] flex-1 resize-none rounded border border-[#2f2f3b] bg-[#101014] p-2 font-mono text-[11px] leading-relaxed text-zinc-100 focus:border-cyan-500 focus:outline-none"
        />

        <div className="flex flex-wrap items-center justify-between gap-2">
          {plan.requiresDestructiveConfirm ? (
            <label className="inline-flex cursor-pointer items-center gap-1.5 text-[11px] text-amber-300">
              <input
                type="checkbox"
                checked={destructiveConfirmed}
                onChange={(e) => setDestructiveConfirmed(e.target.checked)}
                className="rounded border-amber-500 bg-[#18181f]"
              />
              <span>Confirmar borrado</span>
            </label>
          ) : (
            <span className="text-[10px] text-zinc-400">
              Commit atómico (Ctrl+Z deshace todo)
            </span>
          )}

          <button
            type="button"
            disabled={!plan.valid || (plan.requiresDestructiveConfirm && !destructiveConfirmed)}
            onClick={handleExecute}
            className="inline-flex items-center gap-1.5 rounded bg-cyan-600 px-3 py-1 text-[11px] font-semibold text-white transition-colors hover:bg-cyan-500 disabled:cursor-not-allowed disabled:bg-zinc-700 disabled:text-zinc-400"
          >
            <Play className="h-3 w-3" />
            <span>Ejecutar Plan</span>
          </button>
        </div>
      </div>

      {/* Columna central: Plan & Diff visual */}
      <div className="flex flex-col gap-1.5 rounded border border-[#292933] bg-[#18181e] p-2 lg:col-span-4">
        <div className="flex items-center justify-between">
          <span className="font-semibold text-zinc-100">Plan y Diferencias (Diff)</span>
          {plan.valid ? (
            <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-emerald-400">
              <CheckCircle2 className="h-3 w-3" />
              Válido ({plan.diffs.length})
            </span>
          ) : (
            <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-red-400">
              <AlertTriangle className="h-3 w-3" />
              {plan.errors.length} error(es)
            </span>
          )}
        </div>

        {lastAppliedMsg && (
          <div className="rounded border border-emerald-500/30 bg-emerald-500/10 px-2 py-1 text-[10px] text-emerald-300">
            {lastAppliedMsg}
          </div>
        )}

        {plan.errors.length > 0 && (
          <ul className="space-y-1">
            {plan.errors.map((err, i) => (
              <li
                key={i}
                className="rounded border border-red-500/35 bg-red-500/10 px-2 py-1 text-[11px] text-red-300"
              >
                {err}
              </li>
            ))}
          </ul>
        )}

        {plan.warnings.length > 0 && (
          <ul className="space-y-1">
            {plan.warnings.map((w, i) => (
              <li
                key={i}
                className="rounded border border-amber-500/30 bg-amber-500/10 px-2 py-1 text-[10px] text-amber-300"
              >
                {w}
              </li>
            ))}
          </ul>
        )}

        {plan.requiresDestructiveConfirm && (
          <div className="flex items-center gap-1.5 rounded border border-amber-500/40 bg-amber-500/10 px-2 py-1 text-[10px] text-amber-200">
            <ShieldAlert className="h-3.5 w-3.5 shrink-0 text-amber-400" />
            <span>Incluye operaciones destructivas. Marca la casilla para aplicar.</span>
          </div>
        )}

        <div className="min-h-0 flex-1 space-y-1 overflow-y-auto pr-1">
          {plan.diffs.length === 0 ? (
            <p className="text-[11px] text-zinc-500">
              No hay cambios pendientes en el plan actual.
            </p>
          ) : (
            plan.diffs.map((d, idx) => (
              <div
                key={`${d.targetId}_${idx}`}
                className="rounded border border-[#2a2a35] bg-[#121217] px-2 py-1 text-[10px]"
              >
                <div className="flex items-center justify-between gap-1">
                  <span className="font-semibold text-zinc-100">{d.targetLabel}</span>
                  <span
                    className={`font-mono text-[9px] uppercase ${
                      d.kind === 'add'
                        ? 'text-emerald-400'
                        : d.kind === 'delete'
                          ? 'text-red-400'
                          : 'text-sky-400'
                    }`}
                  >
                    {d.kind === 'add' ? '+ CREAR' : d.kind === 'delete' ? '- ELIMINAR' : '~ EDITAR'}
                  </span>
                </div>
                {d.before && (
                  <div className="truncate font-mono text-[10px] text-zinc-500">
                    antes: {d.before}
                  </div>
                )}
                {d.after && (
                  <div className="truncate font-mono text-[10px] text-zinc-300">
                    después: {d.after}
                  </div>
                )}
              </div>
            ))
          )}
        </div>
      </div>

      {/* Columna derecha: Historial y Favoritos */}
      <div className="flex flex-col gap-1.5 rounded border border-[#292933] bg-[#18181e] p-2 lg:col-span-3">
        <div className="flex items-center justify-between">
          <span className="font-semibold text-zinc-100">Historial y Favoritos</span>
          <span className="text-[10px] text-zinc-500">{history.length}</span>
        </div>

        <div className="min-h-0 flex-1 space-y-1 overflow-y-auto pr-1">
          {history.length === 0 ? (
            <p className="text-[11px] text-zinc-500">
              Aún no se han ejecutado comandos en este proyecto.
            </p>
          ) : (
            [...history]
              .sort((a, b) => Number(Boolean(b.favorite)) - Number(Boolean(a.favorite)))
              .map((h) => (
                <div
                  key={h.id}
                  className="flex items-start justify-between gap-1 rounded border border-[#2a2a35] bg-[#121217] p-1.5"
                >
                  <button
                    type="button"
                    onClick={() => {
                      setMode(h.mode);
                      setInputText(h.commandText);
                      setDestructiveConfirmed(false);
                    }}
                    className="min-w-0 flex-1 text-left"
                    title="Cargar comando en el editor"
                  >
                    <div className="truncate font-mono text-[10px] text-cyan-300">
                      {h.commandText.split('\n')[0]}
                    </div>
                    <div className="truncate text-[10px] text-zinc-500">{h.summary}</div>
                  </button>
                  <div className="flex shrink-0 items-center gap-0.5">
                    <button
                      type="button"
                      aria-label={h.favorite ? 'Quitar de favoritos' : 'Marcar favorito'}
                      onClick={() => toggleFavorite(h.id)}
                      className={`rounded p-1 ${
                        h.favorite ? 'text-amber-400' : 'text-zinc-500 hover:text-zinc-300'
                      }`}
                    >
                      <Star className="h-3 w-3" />
                    </button>
                    <button
                      type="button"
                      aria-label="Eliminar del historial"
                      onClick={() => deleteHistoryItem(h.id)}
                      className="rounded p-1 text-zinc-500 hover:text-red-400"
                    >
                      <Trash2 className="h-3 w-3" />
                    </button>
                  </div>
                </div>
              ))
          )}
        </div>
      </div>
    </div>
  );
};
