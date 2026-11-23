import React, { useState } from 'react';
import { MessageSquare, Plus, Trash2 } from 'lucide-react';
import type {
  DialogueChoice,
  DialogueGraph,
  DialogueNode,
  ProjectVariable,
} from '../../engine/core/types';
import type { ProjectAssetMeta } from '../../project/models/project';
import { createId } from '../../utils/id';

interface DialogueEditorPanelProps {
  dialogues: DialogueGraph[];
  assets: ProjectAssetMeta[];
  variables: ProjectVariable[];
  onChangeDialogues: (next: DialogueGraph[]) => void;
}

export const DialogueEditorPanel: React.FC<DialogueEditorPanelProps> = ({
  dialogues,
  assets,
  variables,
  onChangeDialogues,
}) => {
  const [selectedGraphId, setSelectedGraphId] = useState<string>(
    dialogues[0]?.id ?? ''
  );
  const [selectedNodeId, setSelectedNodeId] = useState<string>(
    dialogues[0]?.nodes[0]?.id ?? ''
  );

  const imageAssets = assets.filter((a) => a.kind === 'image' || a.mimeType?.startsWith('image/'));
  const activeGraph =
    dialogues.find((g) => g.id === selectedGraphId) ?? dialogues[0] ?? null;
  const activeNode =
    activeGraph?.nodes.find((n) => n.id === selectedNodeId) ??
    activeGraph?.nodes[0] ??
    null;

  const updateGraph = (graphId: string, updater: (g: DialogueGraph) => DialogueGraph) => {
    onChangeDialogues(dialogues.map((g) => (g.id === graphId ? updater(g) : g)));
  };

  const handleAddGraph = () => {
    const startId = createId('dn');
    const secondId = createId('dn');
    const nextGraph: DialogueGraph = {
      id: createId('dlg'),
      name: `dialogo_${dialogues.length + 1}`,
      startNodeId: startId,
      nodes: [
        {
          id: startId,
          speaker: 'Mercader',
          portraitAssetId: null,
          text: '¡Saludos, viajero! ¿Buscas provisiones?',
          typewriterSpeed: 45,
          nextNodeId: null,
          choices: [
            {
              id: createId('dc'),
              text: 'Sí, dame una poción (+10 Oro)',
              nextNodeId: secondId,
              conditionExpr: '',
              actionVar: variables[0]?.name ?? 'oro',
              actionOp: 'add',
              actionValue: -10,
              actionEvent: 'compra_pocion',
            },
            {
              id: createId('dc'),
              text: 'Ahora no, gracias.',
              nextNodeId: null,
            },
          ],
        },
        {
          id: secondId,
          speaker: 'Mercader',
          portraitAssetId: null,
          text: '¡Buena suerte en tu aventura!',
          typewriterSpeed: 45,
          nextNodeId: null,
          choices: [],
        },
      ],
    };
    onChangeDialogues([...dialogues, nextGraph]);
    setSelectedGraphId(nextGraph.id);
    setSelectedNodeId(startId);
  };

  const handleDeleteGraph = (id: string) => {
    const next = dialogues.filter((g) => g.id !== id);
    onChangeDialogues(next);
    setSelectedGraphId(next[0]?.id ?? '');
    setSelectedNodeId(next[0]?.nodes[0]?.id ?? '');
  };

  const handleAddNode = () => {
    if (!activeGraph) return;
    const nodeId = createId('dn');
    const newNode: DialogueNode = {
      id: nodeId,
      speaker: 'Personaje',
      portraitAssetId: null,
      text: 'Escribe aquí el texto del diálogo...',
      typewriterSpeed: 45,
      nextNodeId: null,
      choices: [],
    };
    updateGraph(activeGraph.id, (g) => ({
      ...g,
      nodes: [...g.nodes, newNode],
    }));
    setSelectedNodeId(nodeId);
  };

  const updateActiveNode = (patch: Partial<DialogueNode>) => {
    if (!activeGraph || !activeNode) return;
    updateGraph(activeGraph.id, (g) => ({
      ...g,
      nodes: g.nodes.map((n) => (n.id === activeNode.id ? { ...n, ...patch } : n)),
    }));
  };

  const addChoice = () => {
    if (!activeNode) return;
    const newChoice: DialogueChoice = {
      id: createId('dc'),
      text: 'Nueva respuesta',
      nextNodeId: null,
      conditionExpr: '',
      actionVar: '',
      actionOp: 'set',
      actionValue: '',
      actionEvent: '',
    };
    updateActiveNode({ choices: [...(activeNode.choices ?? []), newChoice] });
  };

  return (
    <div className="flex h-full text-xs text-zinc-200">
      {/* Columna 1: Lista de conversaciones */}
      <div className="flex w-52 shrink-0 flex-col border-r border-[#2a2a33] bg-[#16161b]">
        <div className="flex items-center justify-between border-b border-[#262630] px-2.5 py-1.5">
          <span className="flex items-center gap-1.5 font-semibold text-pink-300">
            <MessageSquare className="h-3.5 w-3.5" />
            <span>Diálogos ({dialogues.length})</span>
          </span>
          <button
            type="button"
            onClick={handleAddGraph}
            className="inline-flex items-center gap-0.5 rounded bg-pink-600 px-2 py-0.5 text-[10px] font-semibold text-white hover:bg-pink-500"
          >
            <Plus className="h-3 w-3" />
            <span>Nuevo</span>
          </button>
        </div>

        <div className="flex-1 space-y-1 overflow-y-auto p-1.5">
          {dialogues.length === 0 ? (
            <div className="p-2 text-center text-[11px] text-zinc-500">
              Crea un árbol de diálogo ramificado y llámalo desde JS con{' '}
              <code className="font-mono text-pink-300">nexus.dialogue.start(id)</code>.
            </div>
          ) : (
            dialogues.map((g) => (
              <div
                key={g.id}
                onClick={() => {
                  setSelectedGraphId(g.id);
                  setSelectedNodeId(g.nodes[0]?.id ?? '');
                }}
                className={`flex cursor-pointer items-center justify-between rounded border px-2 py-1.5 ${
                  activeGraph?.id === g.id
                    ? 'border-pink-500/60 bg-pink-500/15 text-white'
                    : 'border-[#272730] bg-[#1c1c23] text-zinc-300 hover:bg-[#23232c]'
                }`}
              >
                <div className="min-w-0">
                  <div className="truncate font-semibold">{g.name}</div>
                  <div className="font-mono text-[9.5px] text-zinc-400">
                    {g.nodes.length} nodos · id: {g.id}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    handleDeleteGraph(g.id);
                  }}
                  title="Eliminar diálogo"
                  className="p-1 text-zinc-500 hover:text-red-400"
                >
                  <Trash2 className="h-3 w-3" />
                </button>
              </div>
            ))
          )}
        </div>
      </div>

      {/* Columna 2: Nodos del diálogo seleccionado */}
      {activeGraph ? (
        <>
          <div className="flex w-60 shrink-0 flex-col border-r border-[#2a2a33] bg-[#141418]">
            <div className="space-y-1.5 border-b border-[#262630] p-2">
              <div className="flex items-center gap-1">
                <input
                  type="text"
                  aria-label="Nombre del diálogo"
                  value={activeGraph.name}
                  onChange={(e) =>
                    updateGraph(activeGraph.id, (g) => ({ ...g, name: e.target.value }))
                  }
                  className="min-w-0 flex-1 rounded border border-[#32323c] bg-[#101014] px-2 py-1 text-xs font-semibold text-white"
                />
                <button
                  type="button"
                  onClick={handleAddNode}
                  className="inline-flex items-center gap-0.5 rounded bg-emerald-600 px-2 py-1 text-[10px] font-semibold text-white hover:bg-emerald-500"
                >
                  <Plus className="h-3 w-3" />
                  <span>Nodo</span>
                </button>
              </div>
              <div className="flex items-center gap-1.5 text-[10px] text-zinc-400">
                <span>Inicio:</span>
                <select
                  aria-label="Nodo inicial del diálogo"
                  value={activeGraph.startNodeId}
                  onChange={(e) =>
                    updateGraph(activeGraph.id, (g) => ({ ...g, startNodeId: e.target.value }))
                  }
                  className="min-w-0 flex-1 rounded border border-[#32323c] bg-[#101014] px-1.5 py-0.5 text-[10px] text-zinc-200"
                >
                  {activeGraph.nodes.map((n, idx) => (
                    <option key={n.id} value={n.id}>
                      #{idx + 1} {n.speaker}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="flex-1 space-y-1 overflow-y-auto p-1.5">
              {activeGraph.nodes.map((n, idx) => {
                const isSel = activeNode?.id === n.id;
                const isStart = activeGraph.startNodeId === n.id;
                return (
                  <div
                    key={n.id}
                    onClick={() => setSelectedNodeId(n.id)}
                    className={`cursor-pointer rounded border p-1.5 ${
                      isSel
                        ? 'border-cyan-500/70 bg-cyan-500/10'
                        : 'border-[#272730] bg-[#1a1a21] hover:bg-[#22222b]'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-1">
                      <span className="truncate font-semibold text-zinc-100">
                        {isStart ? '★ ' : ''}#{idx + 1} {n.speaker}
                      </span>
                      {activeGraph.nodes.length > 1 && (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            const remaining = activeGraph.nodes.filter((x) => x.id !== n.id);
                            updateGraph(activeGraph.id, (g) => ({
                              ...g,
                              startNodeId:
                                g.startNodeId === n.id ? remaining[0]?.id ?? '' : g.startNodeId,
                              nodes: remaining,
                            }));
                            if (selectedNodeId === n.id) {
                              setSelectedNodeId(remaining[0]?.id ?? '');
                            }
                          }}
                          className="p-0.5 text-zinc-500 hover:text-red-400"
                        >
                          <Trash2 className="h-3 w-3" />
                        </button>
                      )}
                    </div>
                    <p className="mt-0.5 line-clamp-2 text-[10px] text-zinc-400">
                      {n.text}
                    </p>
                    <div className="mt-1 text-[9.5px] font-mono text-pink-300">
                      {n.choices.length > 0
                        ? `${n.choices.length} opciones`
                        : n.nextNodeId
                          ? '→ Continúa'
                          : '■ Fin'}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Columna 3: Editor del nodo activo */}
          {activeNode && (
            <div className="flex-1 overflow-y-auto p-3 space-y-2.5">
              <div className="grid grid-cols-3 gap-2">
                <div>
                  <label className="mb-0.5 block text-[10px] text-zinc-400">Hablante</label>
                  <input
                    type="text"
                    aria-label="Hablante del nodo"
                    value={activeNode.speaker}
                    onChange={(e) => updateActiveNode({ speaker: e.target.value })}
                    className="w-full rounded border border-[#32323c] bg-[#101014] px-2 py-1 text-xs text-white"
                  />
                </div>
                <div>
                  <label className="mb-0.5 block text-[10px] text-zinc-400">Retrato (Imagen)</label>
                  <select
                    aria-label="Retrato del nodo"
                    value={activeNode.portraitAssetId ?? ''}
                    onChange={(e) =>
                      updateActiveNode({ portraitAssetId: e.target.value || null })
                    }
                    className="w-full rounded border border-[#32323c] bg-[#101014] px-1.5 py-1 text-xs text-zinc-100"
                  >
                    <option value="">Sin retrato</option>
                    {imageAssets.map((a) => (
                      <option key={a.id} value={a.id}>
                        {a.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="mb-0.5 block text-[10px] text-zinc-400">Vel. máquina (c/s)</label>
                  <input
                    type="number"
                    min={5}
                    max={200}
                    aria-label="Velocidad typewriter"
                    value={activeNode.typewriterSpeed ?? 45}
                    onChange={(e) =>
                      updateActiveNode({
                        typewriterSpeed: Math.max(5, Number(e.target.value) || 45),
                      })
                    }
                    className="w-full rounded border border-[#32323c] bg-[#101014] px-2 py-1 font-mono text-xs text-white"
                  />
                </div>
              </div>

              <div className="grid grid-cols-[1fr_190px] gap-2">
                <div>
                  <label className="mb-0.5 block text-[10px] text-zinc-400">
                    Texto (soporta <code className="text-cyan-300">{'{{variable}}'}</code> y{' '}
                    <code className="text-cyan-300">@t(clave)</code>)
                  </label>
                  <textarea
                    rows={2}
                    aria-label="Texto del diálogo"
                    value={activeNode.text}
                    onChange={(e) => updateActiveNode({ text: e.target.value })}
                    className="w-full rounded border border-[#32323c] bg-[#101014] p-1.5 text-xs text-zinc-100"
                  />
                </div>
                <div>
                  <label className="mb-0.5 block text-[10px] text-zinc-400">
                    Si no hay opciones, ir a:
                  </label>
                  <select
                    aria-label="Siguiente nodo automático"
                    value={activeNode.nextNodeId ?? ''}
                    onChange={(e) =>
                      updateActiveNode({ nextNodeId: e.target.value || null })
                    }
                    className="w-full rounded border border-[#32323c] bg-[#101014] px-1.5 py-1 text-xs text-zinc-100"
                  >
                    <option value="">(Finalizar diálogo)</option>
                    {activeGraph.nodes
                      .filter((x) => x.id !== activeNode.id)
                      .map((x, idx) => (
                        <option key={x.id} value={x.id}>
                          #{idx + 1} {x.speaker}: {x.text.slice(0, 20)}
                        </option>
                      ))}
                  </select>
                </div>
              </div>

              {/* Opciones de respuesta ramificadas */}
              <div className="space-y-1.5 border-t border-[#262630] pt-2">
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-semibold text-zinc-300">
                    Botones de Respuesta ({activeNode.choices.length})
                  </span>
                  <button
                    type="button"
                    onClick={addChoice}
                    className="inline-flex items-center gap-1 rounded border border-pink-500/40 bg-pink-500/15 px-2 py-0.5 text-[10px] font-semibold text-pink-200 hover:bg-pink-500/25"
                  >
                    <Plus className="h-3 w-3" />
                    <span>+ Opción</span>
                  </button>
                </div>

                {activeNode.choices.map((ch, idx) => (
                  <div
                    key={ch.id}
                    className="space-y-1.5 rounded border border-[#2c2c37] bg-[#181820] p-2"
                  >
                    <div className="grid grid-cols-[1fr_160px_auto] gap-1.5 items-center">
                      <input
                        type="text"
                        placeholder={`Opción #${idx + 1}`}
                        value={ch.text}
                        onChange={(e) =>
                          updateActiveNode({
                            choices: activeNode.choices.map((c) =>
                              c.id === ch.id ? { ...c, text: e.target.value } : c
                            ),
                          })
                        }
                        className="rounded border border-[#32323c] bg-[#101014] px-2 py-1 text-xs text-white"
                      />
                      <select
                        value={ch.nextNodeId ?? ''}
                        onChange={(e) =>
                          updateActiveNode({
                            choices: activeNode.choices.map((c) =>
                              c.id === ch.id
                                ? { ...c, nextNodeId: e.target.value || null }
                                : c
                            ),
                          })
                        }
                        className="rounded border border-[#32323c] bg-[#101014] px-1.5 py-1 text-[11px] text-zinc-100"
                      >
                        <option value="">(Cerrar diálogo)</option>
                        {activeGraph.nodes.map((x, nIdx) => (
                          <option key={x.id} value={x.id}>
                            → #{nIdx + 1} {x.speaker}
                          </option>
                        ))}
                      </select>
                      <button
                        type="button"
                        onClick={() =>
                          updateActiveNode({
                            choices: activeNode.choices.filter((c) => c.id !== ch.id),
                          })
                        }
                        className="p-1 text-zinc-500 hover:text-red-400"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>

                    <div className="grid grid-cols-4 gap-1.5 text-[10px]">
                      <input
                        type="text"
                        placeholder="Condición (ej. oro >= 10)"
                        value={ch.conditionExpr ?? ''}
                        onChange={(e) =>
                          updateActiveNode({
                            choices: activeNode.choices.map((c) =>
                              c.id === ch.id ? { ...c, conditionExpr: e.target.value } : c
                            ),
                          })
                        }
                        className="rounded border border-[#32323c] bg-[#101014] px-1.5 py-0.5 font-mono text-zinc-200"
                      />
                      <div className="flex gap-1">
                        <input
                          type="text"
                          placeholder="Variable acción"
                          value={ch.actionVar ?? ''}
                          onChange={(e) =>
                            updateActiveNode({
                              choices: activeNode.choices.map((c) =>
                                c.id === ch.id ? { ...c, actionVar: e.target.value } : c
                              ),
                            })
                          }
                          className="min-w-0 flex-1 rounded border border-[#32323c] bg-[#101014] px-1.5 py-0.5 font-mono text-zinc-200"
                        />
                        <select
                          value={ch.actionOp ?? 'set'}
                          onChange={(e) =>
                            updateActiveNode({
                              choices: activeNode.choices.map((c) =>
                                c.id === ch.id
                                  ? { ...c, actionOp: e.target.value as 'set' | 'add' }
                                  : c
                              ),
                            })
                          }
                          className="rounded border border-[#32323c] bg-[#101014] px-1 py-0.5 text-zinc-200"
                        >
                          <option value="set">=</option>
                          <option value="add">+=</option>
                        </select>
                      </div>
                      <input
                        type="text"
                        placeholder="Valor acción"
                        value={ch.actionValue === undefined ? '' : String(ch.actionValue)}
                        onChange={(e) => {
                          const raw = e.target.value;
                          const val =
                            raw === ''
                              ? ''
                              : raw === 'true'
                                ? true
                                : raw === 'false'
                                  ? false
                                  : !Number.isNaN(Number(raw))
                                    ? Number(raw)
                                    : raw;
                          updateActiveNode({
                            choices: activeNode.choices.map((c) =>
                              c.id === ch.id ? { ...c, actionValue: val } : c
                            ),
                          });
                        }}
                        className="rounded border border-[#32323c] bg-[#101014] px-1.5 py-0.5 font-mono text-zinc-200"
                      />
                      <input
                        type="text"
                        placeholder="Evento emitido"
                        value={ch.actionEvent ?? ''}
                        onChange={(e) =>
                          updateActiveNode({
                            choices: activeNode.choices.map((c) =>
                              c.id === ch.id ? { ...c, actionEvent: e.target.value } : c
                            ),
                          })
                        }
                        className="rounded border border-[#32323c] bg-[#101014] px-1.5 py-0.5 font-mono text-zinc-200"
                      />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      ) : (
        <div className="flex flex-1 items-center justify-center text-xs text-zinc-500">
          Selecciona o crea un diálogo para editar nodos, retratos y respuestas.
        </div>
      )}
    </div>
  );
};
