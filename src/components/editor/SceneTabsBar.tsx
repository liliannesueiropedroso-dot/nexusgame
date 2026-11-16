import React, { useState } from 'react';
import { Copy, Plus, Star, Trash2, X } from 'lucide-react';
import { SCENE_KIND_LABELS, type SceneData, type SceneKind } from '../../engine/core/types';

interface SceneTabsBarProps {
  scenes: SceneData[];
  activeSceneId: string;
  initialSceneId?: string;
  onSelectScene: (sceneId: string) => void;
  onCreateScene: (name: string, kind: SceneKind) => void;
  onDuplicateScene: (sceneId: string) => void;
  onDeleteScene: (sceneId: string) => void;
  onSetInitialScene: (sceneId: string) => void;
}

export const SceneTabsBar: React.FC<SceneTabsBarProps> = ({
  scenes,
  activeSceneId,
  initialSceneId,
  onSelectScene,
  onCreateScene,
  onDuplicateScene,
  onDeleteScene,
  onSetInitialScene,
}) => {
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState('');
  const [newKind, setNewKind] = useState<SceneKind>('level');

  const resolvedInitialId = initialSceneId || scenes[0]?.id;
  const activeScene = scenes.find((s) => s.id === activeSceneId) ?? scenes[0];

  const handleOpenCreate = () => {
    setNewName(`Escena_${String(scenes.length + 1).padStart(2, '0')}`);
    setNewKind('level');
    setCreating(true);
  };

  const handleSubmitCreate = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = newName.trim();
    if (!trimmed) return;
    onCreateScene(trimmed, newKind);
    setCreating(false);
  };

  return (
    <div className="relative flex h-8 shrink-0 items-center justify-between border-b border-[#2c2c34] bg-[#16161a] px-2 gap-2">
      <div className="flex min-w-0 flex-1 items-center gap-1 overflow-x-auto" role="tablist" aria-label="Escenas del proyecto">
        {scenes.map((scene) => {
          const isActive = scene.id === activeSceneId;
          const isInitial = scene.id === resolvedInitialId;
          return (
            <div
              key={scene.id}
              className={`group flex items-center gap-1 rounded-t border px-2.5 py-1 text-[11px] transition-colors shrink-0 ${
                isActive
                  ? 'border-[#3a3a46] border-b-[#141416] bg-[#1f1f26] text-zinc-100 font-semibold'
                  : 'border-transparent text-zinc-400 hover:bg-[#1d1d23] hover:text-zinc-200'
              }`}
            >
              <button
                type="button"
                role="tab"
                aria-selected={isActive}
                onClick={() => onSelectScene(scene.id)}
                className="flex items-center gap-1.5 text-left"
              >
                {isInitial && (
                  <Star
                    className="h-3 w-3 text-amber-400 fill-amber-400 shrink-0"
                    aria-label="Escena inicial"
                  />
                )}
                <span className="max-w-32 truncate">{scene.name}</span>
                <span className="text-[10px] font-normal text-zinc-500">
                  · {SCENE_KIND_LABELS[scene.kind ?? 'level'].split(' ')[0]}
                </span>
              </button>

              {scenes.length > 1 && (
                <button
                  type="button"
                  onClick={() => onDeleteScene(scene.id)}
                  title={`Eliminar escena ${scene.name}`}
                  aria-label={`Eliminar escena ${scene.name}`}
                  className="ml-0.5 rounded p-0.5 text-zinc-500 opacity-0 group-hover:opacity-100 hover:bg-red-500/20 hover:text-red-400"
                >
                  <Trash2 className="h-3 w-3" />
                </button>
              )}
            </div>
          );
        })}

        <button
          type="button"
          onClick={handleOpenCreate}
          title="Añadir nueva escena o panel"
          className="inline-flex items-center gap-1 rounded border border-[#30303a] bg-[#202026] px-2 py-0.5 text-[11px] font-medium text-zinc-300 hover:bg-[#2a2a33] hover:text-white shrink-0"
        >
          <Plus className="h-3 w-3 text-blue-400" />
          <span>Nueva escena</span>
        </button>
      </div>

      {activeScene && (
        <div className="flex shrink-0 items-center gap-1">
          {activeScene.id !== resolvedInitialId && (
            <button
              type="button"
              onClick={() => onSetInitialScene(activeScene.id)}
              title="Establecer escena actual como pantalla inicial del juego"
              className="inline-flex items-center gap-1 rounded border border-[#30303a] bg-[#1e1e24] px-2 py-0.5 text-[10px] text-amber-300 hover:bg-[#282831]"
            >
              <Star className="h-3 w-3" />
              <span className="hidden md:inline">Hacer inicial</span>
            </button>
          )}
          <button
            type="button"
            onClick={() => onDuplicateScene(activeScene.id)}
            title="Duplicar escena actual"
            aria-label="Duplicar escena actual"
            className="inline-flex items-center gap-1 rounded border border-[#30303a] bg-[#1e1e24] px-2 py-0.5 text-[10px] text-zinc-300 hover:bg-[#282831]"
          >
            <Copy className="h-3 w-3" />
            <span className="hidden md:inline">Duplicar</span>
          </button>
        </div>
      )}

      {creating && (
        <form
          onSubmit={handleSubmitCreate}
          className="absolute top-8 left-2 z-30 flex flex-wrap items-center gap-2 rounded-md border border-[#3a3a46] bg-[#1b1b21] p-2.5 shadow-xl text-xs"
        >
          <input
            type="text"
            aria-label="Nombre de la nueva escena"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder="Ej. Menu_Principal, Nivel_02, Pausa"
            autoFocus
            className="w-44 rounded border border-[#343440] bg-[#131317] px-2 py-1 text-xs text-zinc-100 focus:border-blue-500 focus:outline-none"
          />
          <select
            aria-label="Tipo de escena"
            value={newKind}
            onChange={(e) => setNewKind(e.target.value as SceneKind)}
            className="rounded border border-[#343440] bg-[#131317] px-2 py-1 text-xs text-zinc-100 focus:border-blue-500 focus:outline-none"
          >
            {(Object.keys(SCENE_KIND_LABELS) as SceneKind[]).map((k) => (
              <option key={k} value={k}>
                {SCENE_KIND_LABELS[k]}
              </option>
            ))}
          </select>
          <button
            type="submit"
            className="rounded bg-blue-600 px-2.5 py-1 text-xs font-semibold text-white hover:bg-blue-500"
          >
            Crear
          </button>
          <button
            type="button"
            onClick={() => setCreating(false)}
            aria-label="Cancelar creación de escena"
            className="rounded p-1 text-zinc-400 hover:bg-[#2a2a33] hover:text-white"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </form>
      )}
    </div>
  );
};
