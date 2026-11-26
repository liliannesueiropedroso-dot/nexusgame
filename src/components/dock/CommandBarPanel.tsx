import React, { useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  Check,
  CheckCircle2,
  ClipboardPaste,
  Copy,
  Eraser,
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

export interface CommandBarDraftSignal {
  text: string;
  nonce: number;
}

interface CommandBarPanelProps {
  project: NexusProject;
  activeSceneId: string;
  selectedIds: string[];
  externalCommandDraft?: CommandBarDraftSignal | null;
  onCommitCommandResult: (
    nextProject: NexusProject,
    createdIds: string[],
    summary: string
  ) => void;
  onUpdateCommandHistory: (next: CommandBarHistoryEntry[]) => void;
}

type RecipeCategory = 'gameplay' | 'scripts' | 'mundo' | 'camara' | 'streaming';

interface StudioRecipe {
  id: string;
  category: RecipeCategory;
  title: string;
  desc: string;
  cmd: string;
}

const RECIPE_CATEGORY_LABELS: Array<{ id: RecipeCategory; label: string }> = [
  { id: 'gameplay', label: 'Gameplay' },
  { id: 'scripts', label: 'Scripts JS' },
  { id: 'mundo', label: 'Mundo 3D' },
  { id: 'camara', label: 'Luz y Cámara' },
  { id: 'streaming', label: 'Streaming' },
];

const STUDIO_RECIPES: StudioRecipe[] = [
  {
    id: 'coin_score',
    category: 'gameplay',
    title: 'Moneda + Puntos',
    desc: 'Crea esfera coleccionable, variable puntos y mecánica de suma.',
    cmd: [
      'variable puntos = 0',
      'crear esfera nombre=Moneda x=4 y=1.5 z=-4 color=#facc15 tag=moneda',
      'mecanica nombre="Recoger Moneda" evento=trigger.enter tag=moneda accion=variable.add variable=puntos amount=10',
    ].join('\n'),
  },
  {
    id: 'boost_jump',
    category: 'gameplay',
    title: 'Impulso con Tecla E',
    desc: 'Aplica impulso vertical al objeto seleccionado al pulsar E.',
    cmd: 'mecanica nombre="Salto Turbo" evento=input.pressed tecla=KeyE accion=physics.impulse target=@selected iy=11',
  },
  {
    id: 'enemy_patrol',
    category: 'gameplay',
    title: 'Centinela NavMesh',
    desc: 'Crea enemigo 3D con componente navMeshAgent listo para perseguir.',
    cmd: [
      'crear cubo nombre=Centinela x=10 y=1.5 z=-10 sx=1.2 sy=2.2 sz=1.2 color=#ef4444 tag=enemigo',
      'agregar componente @lastCreated navMeshAgent speed=4.5',
    ].join('\n'),
  },
  {
    id: 'portal_tp',
    category: 'gameplay',
    title: 'Portal Teletransporte',
    desc: 'Crea cilindro portal y regla de teletransporte al tocarlo.',
    cmd: [
      'crear cilindro nombre=Portal_Norte x=0 y=1.5 z=-18 sx=2 sy=3 sz=2 color=#a855f7 tag=portal',
      'mecanica nombre="Teletransporte" evento=trigger.enter tag=portal accion=object.teleport target=@selected x=0 y=3 z=10',
    ].join('\n'),
  },
  {
    id: 'script_float',
    category: 'scripts',
    title: 'Cristal Flotante JS',
    desc: 'Crea objeto 3D y script seguro onUpdate que rota y levita.',
    cmd: [
      'crear cubo nombre=Cristal_Energia x=0 y=2.5 z=-6 color=#22d3ee tag=recurso',
      'script nombre=Cristal_Flotante objeto=@lastCreated codigo="export function onUpdate(self, dt, nexus){ self.ry += 90 * dt; self.y = 2.5 + Math.sin(nexus.time * 3) * 0.45; }"',
    ].join('\n'),
  },
  {
    id: 'script_regen',
    category: 'scripts',
    title: 'Regenerar Energía (Escena)',
    desc: 'Script global de escena que regenera la variable energia.',
    cmd: [
      'variable energia = 100',
      'script nombre=Regenerar_Energia objeto=__scene__ codigo="export function onUpdate(self, dt, nexus){ const e = Number(nexus.vars.get(\'energia\') || 0); if (e < 100) nexus.vars.set(\'energia\', Math.min(100, e + dt * 5)); }"',
    ].join('\n'),
  },
  {
    id: 'tower_3d',
    category: 'mundo',
    title: 'Torre de Vigilancia',
    desc: 'Crea bloque arquitectónico y lo renombra con @lastCreated.',
    cmd: [
      'crear cubo nombre=Torre_Vigia x=12 y=3 z=-8 sx=3 sy=6 sz=3 color=#6366f1 tag=edificio',
      'renombrar @lastCreated Torre_Norte',
    ].join('\n'),
  },
  {
    id: 'duplicate_row',
    category: 'mundo',
    title: 'Duplicar @selected (+4m)',
    desc: 'Clona el objeto seleccionado desplazado 4 metros en X.',
    cmd: 'duplicar @selected dx=4 dz=0',
  },
  {
    id: 'sunset_light',
    category: 'camara',
    title: 'Atardecer + Niebla',
    desc: 'Ajusta hora solar 18.2h y niebla atmosférica en la escena.',
    cmd: 'iluminacion hora=18.2 sol=1.25 ambiente=0.55 niebla=true niebla_cerca=45 niebla_lejos=190',
  },
  {
    id: 'day_cycle',
    category: 'camara',
    title: 'Ciclo Día/Noche',
    desc: 'Activa el avance automático del sol en el cielo 3D.',
    cmd: 'iluminacion ciclo=true hora=9 velocidad_dia=0.5',
  },
  {
    id: 'cam_orbit',
    category: 'camara',
    title: 'Cámara Órbita Pro',
    desc: 'Activa tercera persona con colisión contra muros y hombro.',
    cmd: 'camara modo=third_person_orbit distancia=9 fov=62 colision=true hombro=true',
  },
  {
    id: 'streaming_pc',
    category: 'streaming',
    title: 'Streaming PC + HLOD',
    desc: 'Configura chunks 48m, radio de carga 120m y proxies HLOD.',
    cmd: 'streaming activar chunk=48 carga=120 descarga=180 hlod=280 perfil=pc',
  },
  {
    id: 'streaming_mobile',
    category: 'streaming',
    title: 'Streaming Móvil Ligero',
    desc: 'Reduce radios y presupuesto de VRAM/entidades para móvil.',
    cmd: 'streaming activar chunk=48 carga=85 descarga=130 hlod=210 perfil=mobile',
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
  externalCommandDraft,
  onCommitCommandResult,
  onUpdateCommandHistory,
}) => {
  const [mode, setMode] = useState<CommandBarMode>('dsl');
  const [inputText, setInputText] = useState<string>(STUDIO_RECIPES[6].cmd);
  const [activeCategory, setActiveCategory] = useState<RecipeCategory>('gameplay');
  const [destructiveConfirmed, setDestructiveConfirmed] = useState(false);
  const [lastAppliedMsg, setLastAppliedMsg] = useState<string>('');
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  useEffect(() => {
    if (!externalCommandDraft) return;
    const text = externalCommandDraft.text;
    setInputText(text);
    setDestructiveConfirmed(false);
    const trimmed = text.trim();
    if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
      setMode('json');
    } else if (trimmed.length > 0) {
      setMode('dsl');
    }
  }, [externalCommandDraft]);

  const plan = useMemo(
    () => planCommandBarInput(project, activeSceneId, selectedIds, inputText, mode),
    [project, activeSceneId, selectedIds, inputText, mode]
  );

  const history = project.commandHistory ?? [];
  const visibleRecipes = useMemo(
    () => STUDIO_RECIPES.filter((r) => r.category === activeCategory),
    [activeCategory]
  );

  const copyToClipboard = async (text: string, key: string) => {
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(text);
      }
      setCopiedKey(key);
      setTimeout(() => {
        setCopiedKey((prev) => (prev === key ? null : prev));
      }, 1600);
    } catch {
      setLastAppliedMsg('El navegador bloqueó el portapapeles; selecciona y copia con Ctrl+C.');
    }
  };

  const pasteFromClipboard = async () => {
    try {
      if (!navigator.clipboard?.readText) {
        setLastAppliedMsg('Portapapeles no disponible; pega directamente con Ctrl+V.');
        return;
      }
      const text = await navigator.clipboard.readText();
      if (text) {
        setInputText(text);
        setDestructiveConfirmed(false);
        const trimmed = text.trim();
        if (trimmed.startsWith('{') || trimmed.startsWith('[')) setMode('json');
        else setMode('dsl');
      }
    } catch {
      setLastAppliedMsg('Permiso de lectura denegado; pega dentro del editor con Ctrl+V.');
    }
  };

  const handleModeSwitch = (nextMode: CommandBarMode) => {
    setMode(nextMode);
    setDestructiveConfirmed(false);
    if (nextMode === 'json' && !inputText.trim().startsWith('{') && !inputText.trim().startsWith('[')) {
      setInputText(JSON_PRESET);
    } else if (nextMode === 'dsl' && (inputText.trim().startsWith('{') || inputText.trim().startsWith('['))) {
      setInputText(STUDIO_RECIPES[6].cmd);
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
      {/* Columna izquierda: Entrada DSL o JSON + Recetas copiables estilo Roblox Studio */}
      <div className="flex flex-col gap-1.5 lg:col-span-5">
        <div className="flex flex-wrap items-center justify-between gap-1.5">
          <div className="flex items-center gap-1.5 font-semibold text-zinc-100">
            <Terminal className="h-3.5 w-3.5 text-cyan-400" />
            <span>Barra de Comandos 2.0</span>
          </div>
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => void copyToClipboard(inputText, 'editor')}
              title="Copiar código del editor"
              className="inline-flex items-center gap-1 rounded border border-[#32323e] bg-[#1e1e26] px-1.5 py-0.5 text-[10px] text-zinc-300 hover:border-cyan-500/60 hover:text-white"
            >
              {copiedKey === 'editor' ? (
                <>
                  <Check className="h-3 w-3 text-emerald-400" />
                  <span className="text-emerald-300">¡Copiado!</span>
                </>
              ) : (
                <>
                  <Copy className="h-3 w-3" />
                  <span>Copiar</span>
                </>
              )}
            </button>
            <button
              type="button"
              onClick={() => void pasteFromClipboard()}
              title="Pegar desde el portapapeles"
              className="inline-flex items-center gap-1 rounded border border-[#32323e] bg-[#1e1e26] px-1.5 py-0.5 text-[10px] text-zinc-300 hover:border-cyan-500/60 hover:text-white"
            >
              <ClipboardPaste className="h-3 w-3" />
              <span>Pegar</span>
            </button>
            <button
              type="button"
              onClick={() => {
                setInputText('');
                setDestructiveConfirmed(false);
              }}
              title="Limpiar editor de comandos"
              className="inline-flex items-center gap-1 rounded border border-[#32323e] bg-[#1e1e26] px-1.5 py-0.5 text-[10px] text-zinc-400 hover:border-red-500/50 hover:text-red-300"
            >
              <Eraser className="h-3 w-3" />
              <span>Limpiar</span>
            </button>
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
                DSL
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
                JSON
              </button>
            </div>
          </div>
        </div>

        {/* Selector de categorías de Recetas Estilo Roblox Studio */}
        <div className="rounded border border-[#292933] bg-[#17171d] p-1.5">
          <div className="mb-1 flex flex-wrap items-center justify-between gap-1">
            <span className="text-[10px] font-semibold text-zinc-300">
              Recetas Estilo Roblox Studio
            </span>
            <div className="flex flex-wrap gap-0.5">
              {RECIPE_CATEGORY_LABELS.map((cat) => (
                <button
                  key={cat.id}
                  type="button"
                  onClick={() => setActiveCategory(cat.id)}
                  className={`rounded px-1.5 py-0.5 text-[10px] font-medium transition-colors ${
                    activeCategory === cat.id
                      ? 'bg-cyan-600/80 text-white'
                      : 'bg-[#202028] text-zinc-400 hover:text-zinc-100'
                  }`}
                >
                  {cat.label}
                </button>
              ))}
            </div>
          </div>
          <div className="flex gap-1.5 overflow-x-auto pb-0.5">
            {visibleRecipes.map((r) => (
              <div
                key={r.id}
                className="flex min-w-[165px] max-w-[205px] shrink-0 flex-col justify-between gap-1 rounded border border-[#2c2c38] bg-[#111116] p-1.5"
              >
                <div>
                  <div className="truncate text-[10px] font-semibold text-zinc-100">{r.title}</div>
                  <div className="line-clamp-2 text-[9px] leading-tight text-zinc-400">{r.desc}</div>
                </div>
                <div className="flex items-center gap-1 pt-0.5">
                  <button
                    type="button"
                    onClick={() => {
                      setMode('dsl');
                      setInputText(r.cmd);
                      setDestructiveConfirmed(false);
                    }}
                    className="flex-1 rounded bg-cyan-700/80 px-1.5 py-0.5 text-[10px] font-semibold text-white hover:bg-cyan-600"
                  >
                    Cargar
                  </button>
                  <button
                    type="button"
                    onClick={() => void copyToClipboard(r.cmd, r.id)}
                    aria-label={`Copiar código de ${r.title}`}
                    className="inline-flex items-center gap-0.5 rounded border border-[#32323e] bg-[#1c1c24] px-1.5 py-0.5 text-[10px] text-zinc-300 hover:border-cyan-500/60 hover:text-white"
                  >
                    {copiedKey === r.id ? (
                      <>
                        <Check className="h-2.5 w-2.5 text-emerald-400" />
                        <span className="text-emerald-300">Copiado</span>
                      </>
                    ) : (
                      <>
                        <Copy className="h-2.5 w-2.5" />
                        <span>Copiar código</span>
                      </>
                    )}
                  </button>
                </div>
              </div>
            ))}
          </div>
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
          onKeyDown={(e) => {
            if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
              e.preventDefault();
              handleExecute();
            }
          }}
          rows={4}
          spellCheck={false}
          placeholder={
            mode === 'dsl'
              ? 'Ej: crear cubo nombre=Muro x=0 y=2 z=5 sx=6 sy=4 sz=1 (Ctrl+Enter ejecuta)'
              : '{ "ops": [ ... ] }'
          }
          className="min-h-[82px] flex-1 resize-none rounded border border-[#2f2f3b] bg-[#101014] p-2 font-mono text-[11px] leading-relaxed text-zinc-100 focus:border-cyan-500 focus:outline-none"
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
              Ctrl+Enter ejecuta · Refs: @selected · @lastCreated · #tag
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
                      aria-label={`Copiar comando del historial ${h.summary}`}
                      onClick={() => void copyToClipboard(h.commandText, h.id)}
                      className="rounded p-1 text-zinc-500 hover:text-cyan-300"
                    >
                      {copiedKey === h.id ? (
                        <Check className="h-3 w-3 text-emerald-400" />
                      ) : (
                        <Copy className="h-3 w-3" />
                      )}
                    </button>
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
