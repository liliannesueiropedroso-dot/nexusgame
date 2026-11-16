import React, { useState } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import type { ProjectVariable } from '../../engine/core/types';
import { createId } from '../../utils/id';

interface VariablesPanelProps {
  variables: ProjectVariable[];
  onChangeVariables: (next: ProjectVariable[]) => void;
}

export const VariablesPanel: React.FC<VariablesPanelProps> = ({
  variables,
  onChangeVariables,
}) => {
  const [newName, setNewName] = useState('');
  const [newType, setNewType] = useState<'number' | 'boolean' | 'string'>('number');

  const handleAdd = (e: React.FormEvent) => {
    e.preventDefault();
    const clean = newName.trim().replace(/[^a-zA-Z0-9_]/g, '_');
    if (!clean) return;
    if (variables.some((v) => v.name === clean)) return;

    const initialValue = newType === 'number' ? 0 : newType === 'boolean' ? false : '';
    onChangeVariables([
      ...variables,
      {
        id: createId('var'),
        name: clean,
        scope: 'global',
        type: newType,
        initialValue,
      },
    ]);
    setNewName('');
  };

  return (
    <div className="flex h-full flex-col p-3 space-y-3 overflow-y-auto">
      <form onSubmit={handleAdd} className="flex flex-wrap items-center gap-2">
        <input
          type="text"
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          placeholder="Nombre de variable (ej: vidas, monedas)..."
          aria-label="Nombre de nueva variable"
          className="min-w-48 flex-1 rounded border border-[#32323c] bg-[#141416] px-2.5 py-1.5 text-xs text-zinc-100 placeholder:text-zinc-500 focus:border-blue-500 focus:outline-none"
        />
        <select
          aria-label="Tipo de variable"
          value={newType}
          onChange={(e) => setNewType(e.target.value as 'number' | 'boolean' | 'string')}
          className="rounded border border-[#32323c] bg-[#141416] px-2 py-1.5 text-xs text-zinc-100"
        >
          <option value="number">Número</option>
          <option value="boolean">Booleano</option>
          <option value="string">Texto</option>
        </select>
        <button
          type="submit"
          className="inline-flex items-center gap-1 rounded bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-blue-500 whitespace-nowrap"
        >
          <Plus className="h-3.5 w-3.5" />
          <span>Crear variable</span>
        </button>
      </form>

      {variables.length === 0 ? (
        <p className="rounded border border-dashed border-[#32323c] p-4 text-center text-xs text-zinc-500">
          No hay variables declaradas. Crea una para llevar puntuación, vidas, llaves o estados del nivel.
        </p>
      ) : (
        <div className="overflow-x-auto rounded border border-[#2c2c34]">
          <table className="w-full text-left text-xs">
            <thead className="bg-[#1b1b20] text-[11px] text-zinc-400">
              <tr>
                <th className="px-3 py-1.5 font-medium">Nombre</th>
                <th className="px-3 py-1.5 font-medium">Alcance</th>
                <th className="px-3 py-1.5 font-medium">Tipo</th>
                <th className="px-3 py-1.5 font-medium">Valor inicial</th>
                <th className="px-3 py-1.5 font-medium text-center">Persistente</th>
                <th className="px-2 py-1.5 text-right font-medium">Acción</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#25252d] bg-[#151519]">
              {variables.map((v) => (
                <tr key={v.id}>
                  <td className="px-3 py-1.5 font-mono text-zinc-100">{v.name}</td>
                  <td className="px-3 py-1.5">
                    <select
                      aria-label={`Alcance de ${v.name}`}
                      value={v.scope}
                      onChange={(e) =>
                        onChangeVariables(
                          variables.map((item) =>
                            item.id === v.id
                              ? {
                                  ...item,
                                  scope: e.target.value as ProjectVariable['scope'],
                                }
                              : item
                          )
                        )
                      }
                      className="rounded border border-[#32323c] bg-[#141416] px-1.5 py-0.5 text-xs text-zinc-200"
                    >
                      <option value="global">Global</option>
                      <option value="scene">Escena</option>
                      <option value="object">Objeto</option>
                    </select>
                  </td>
                  <td className="px-3 py-1.5 text-zinc-400">{v.type}</td>
                  <td className="px-3 py-1.5">
                    {v.type === 'boolean' ? (
                      <input
                        type="checkbox"
                        checked={Boolean(v.initialValue)}
                        onChange={(e) =>
                          onChangeVariables(
                            variables.map((item) =>
                              item.id === v.id
                                ? { ...item, initialValue: e.target.checked }
                                : item
                            )
                          )
                        }
                        className="accent-blue-500"
                      />
                    ) : (
                      <input
                        type={v.type === 'number' ? 'number' : 'text'}
                        value={String(v.initialValue)}
                        onChange={(e) =>
                          onChangeVariables(
                            variables.map((item) =>
                              item.id === v.id
                                ? {
                                    ...item,
                                    initialValue:
                                      v.type === 'number'
                                        ? Number(e.target.value) || 0
                                        : e.target.value,
                                  }
                                : item
                            )
                          )
                        }
                        className="w-28 rounded border border-[#32323c] bg-[#141416] px-2 py-0.5 font-mono text-xs text-zinc-100"
                      />
                    )}
                  </td>
                  <td className="px-3 py-1.5 text-center">
                    <input
                      type="checkbox"
                      aria-label={`Variable ${v.name} persistente`}
                      title="Guardar automáticamente el valor entre sesiones (localStorage / SDK portal)"
                      checked={Boolean(v.persistent)}
                      onChange={(e) =>
                        onChangeVariables(
                          variables.map((item) =>
                            item.id === v.id
                              ? { ...item, persistent: e.target.checked }
                              : item
                          )
                        )
                      }
                      className="accent-emerald-500"
                    />
                  </td>
                  <td className="px-2 py-1.5 text-right">
                    <button
                      type="button"
                      onClick={() =>
                        onChangeVariables(variables.filter((item) => item.id !== v.id))
                      }
                      aria-label={`Eliminar variable ${v.name}`}
                      className="rounded p-1 text-zinc-500 hover:bg-red-500/10 hover:text-red-400"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};
