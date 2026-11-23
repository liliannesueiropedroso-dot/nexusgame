import React, { useRef, useState } from 'react';
import { Download, Globe, Plus, Table2, Trash2, Upload } from 'lucide-react';
import type { DataTableDef, I18nConfig, I18nLocale } from '../../engine/core/types';
import {
  exportTableRowsToCsv,
  parseCsvToTableRows,
} from '../../engine/data/dataTableI18n';
import { createId } from '../../utils/id';

interface DataI18nPanelProps {
  dataTables: DataTableDef[];
  i18n: I18nConfig;
  onChangeDataTables: (next: DataTableDef[]) => void;
  onChangeI18n: (next: I18nConfig) => void;
}

export const DataI18nPanel: React.FC<DataI18nPanelProps> = ({
  dataTables,
  i18n,
  onChangeDataTables,
  onChangeI18n,
}) => {
  const [subTab, setSubTab] = useState<'tables' | 'i18n'>('tables');
  const [selectedTableId, setSelectedTableId] = useState<string>(dataTables[0]?.id ?? '');
  const [newColName, setNewColName] = useState('');
  const [newI18nKey, setNewI18nKey] = useState('');
  const csvInputRef = useRef<HTMLInputElement | null>(null);

  const activeTable =
    dataTables.find((t) => t.id === selectedTableId) ?? dataTables[0] ?? null;

  const updateActiveTable = (updater: (t: DataTableDef) => DataTableDef) => {
    if (!activeTable) return;
    onChangeDataTables(dataTables.map((t) => (t.id === activeTable.id ? updater(t) : t)));
  };

  const handleAddTable = () => {
    const tbl: DataTableDef = {
      id: createId('tbl'),
      name: dataTables.length === 0 ? 'items' : `tabla_${dataTables.length + 1}`,
      columns: ['id', 'name', 'price', 'damage'],
      rows: [
        { id: 'pocion', name: 'Poción Curativa', price: 25, damage: 0 },
        { id: 'espada', name: 'Espada Hierro', price: 120, damage: 18 },
      ],
    };
    onChangeDataTables([...dataTables, tbl]);
    setSelectedTableId(tbl.id);
  };

  const handleExportCsv = () => {
    if (!activeTable) return;
    const csv = exportTableRowsToCsv(activeTable);
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${activeTable.name || 'tabla'}.csv`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  const handleImportCsvFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !activeTable) return;
    const text = await file.text();
    const parsed = parseCsvToTableRows(text);
    updateActiveTable((t) => ({
      ...t,
      columns: parsed.columns,
      rows: parsed.rows,
    }));
    e.target.value = '';
  };

  const entries = Object.entries(i18n.entries ?? {});

  return (
    <div className="flex h-full flex-col text-xs text-zinc-200">
      {/* Sub-barra Tablas vs Idiomas */}
      <div className="flex items-center justify-between border-b border-[#262630] bg-[#16161b] px-3 py-1">
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => setSubTab('tables')}
            className={`inline-flex items-center gap-1.5 rounded px-2.5 py-1 text-[11px] font-semibold ${
              subTab === 'tables'
                ? 'bg-amber-500/20 text-amber-300'
                : 'text-zinc-400 hover:text-zinc-200'
            }`}
          >
            <Table2 className="h-3.5 w-3.5" />
            <span>Tablas de Datos ({dataTables.length})</span>
          </button>
          <button
            type="button"
            onClick={() => setSubTab('i18n')}
            className={`inline-flex items-center gap-1.5 rounded px-2.5 py-1 text-[11px] font-semibold ${
              subTab === 'i18n'
                ? 'bg-emerald-500/20 text-emerald-300'
                : 'text-zinc-400 hover:text-zinc-200'
            }`}
          >
            <Globe className="h-3.5 w-3.5" />
            <span>Idiomas i18n ({entries.length} claves)</span>
          </button>
        </div>

        <div className="hidden md:block font-mono text-[10px] text-zinc-500">
          {subTab === 'tables'
            ? 'HTML: data-nexus-repeat="items" · JS: nexus.data.get("items", "espada")'
            : 'Texto: @t(clave) · HTML: data-nexus-i18n="clave" · JS: nexus.i18n.t("clave")'}
        </div>
      </div>

      {subTab === 'tables' ? (
        <div className="flex min-h-0 flex-1">
          <div className="flex w-48 shrink-0 flex-col border-r border-[#2a2a33] bg-[#15151a] p-1.5 space-y-1">
            <button
              type="button"
              onClick={handleAddTable}
              className="inline-flex w-full items-center justify-center gap-1 rounded bg-amber-600 px-2 py-1 text-[11px] font-semibold text-white hover:bg-amber-500"
            >
              <Plus className="h-3 w-3" />
              <span>Nueva Tabla</span>
            </button>

            <div className="flex-1 space-y-1 overflow-y-auto">
              {dataTables.map((t) => (
                <div
                  key={t.id}
                  onClick={() => setSelectedTableId(t.id)}
                  className={`flex cursor-pointer items-center justify-between rounded border px-2 py-1 ${
                    activeTable?.id === t.id
                      ? 'border-amber-500/60 bg-amber-500/15 text-white'
                      : 'border-[#272730] bg-[#1c1c23] text-zinc-300 hover:bg-[#24242d]'
                  }`}
                >
                  <div className="min-w-0">
                    <div className="truncate font-semibold">{t.name}</div>
                    <div className="font-mono text-[9.5px] text-zinc-400">
                      {t.rows.length} filas · {t.columns.length} cols
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      const next = dataTables.filter((x) => x.id !== t.id);
                      onChangeDataTables(next);
                      setSelectedTableId(next[0]?.id ?? '');
                    }}
                    className="p-0.5 text-zinc-500 hover:text-red-400"
                  >
                    <Trash2 className="h-3 w-3" />
                  </button>
                </div>
              ))}
            </div>
          </div>

          {activeTable ? (
            <div className="flex min-w-0 flex-1 flex-col p-2 space-y-2">
              <div className="flex flex-wrap items-center gap-1.5">
                <input
                  type="text"
                  aria-label="Nombre de tabla"
                  value={activeTable.name}
                  onChange={(e) =>
                    updateActiveTable((t) => ({ ...t, name: e.target.value }))
                  }
                  className="w-36 rounded border border-[#32323c] bg-[#101014] px-2 py-1 font-semibold text-white"
                />
                <input
                  type="text"
                  placeholder="Nueva columna..."
                  value={newColName}
                  onChange={(e) => setNewColName(e.target.value)}
                  className="w-28 rounded border border-[#32323c] bg-[#101014] px-2 py-1 text-zinc-200"
                />
                <button
                  type="button"
                  onClick={() => {
                    const col = newColName.trim();
                    if (!col || activeTable.columns.includes(col)) return;
                    updateActiveTable((t) => ({
                      ...t,
                      columns: [...t.columns, col],
                    }));
                    setNewColName('');
                  }}
                  className="rounded border border-[#343440] bg-[#22222b] px-2 py-1 text-[11px] hover:bg-[#2c2c38]"
                >
                  + Columna
                </button>
                <button
                  type="button"
                  onClick={() =>
                    updateActiveTable((t) => {
                      const row: Record<string, string | number | boolean> = {};
                      t.columns.forEach((c, i) => {
                        row[c] = i === 0 ? `row_${t.rows.length + 1}` : '';
                      });
                      return { ...t, rows: [...t.rows, row] };
                    })
                  }
                  className="rounded bg-emerald-600 px-2 py-1 text-[11px] font-semibold text-white hover:bg-emerald-500"
                >
                  + Fila
                </button>
                <button
                  type="button"
                  onClick={() => csvInputRef.current?.click()}
                  className="inline-flex items-center gap-1 rounded border border-[#343440] bg-[#1e1e26] px-2 py-1 text-[11px] hover:bg-[#2a2a35]"
                >
                  <Upload className="h-3 w-3" />
                  <span>Importar CSV</span>
                </button>
                <button
                  type="button"
                  onClick={handleExportCsv}
                  className="inline-flex items-center gap-1 rounded border border-[#343440] bg-[#1e1e26] px-2 py-1 text-[11px] hover:bg-[#2a2a35]"
                >
                  <Download className="h-3 w-3" />
                  <span>Exportar CSV</span>
                </button>
                <input
                  ref={csvInputRef}
                  type="file"
                  accept=".csv,text/csv"
                  onChange={(e) => void handleImportCsvFile(e)}
                  className="hidden"
                />
              </div>

              <div className="min-h-0 flex-1 overflow-auto rounded border border-[#2a2a33] bg-[#101014]">
                <table className="w-full border-collapse text-left text-[11px]">
                  <thead className="sticky top-0 bg-[#1a1a22] text-zinc-300">
                    <tr>
                      {activeTable.columns.map((col) => (
                        <th key={col} className="border-b border-[#2c2c36] px-2 py-1 font-mono">
                          {col}
                        </th>
                      ))}
                      <th className="w-8 border-b border-[#2c2c36]" />
                    </tr>
                  </thead>
                  <tbody>
                    {activeTable.rows.map((row, rIdx) => (
                      <tr key={rIdx} className="border-b border-[#1f1f27]">
                        {activeTable.columns.map((col) => (
                          <td key={col} className="px-1.5 py-1">
                            <input
                              type="text"
                              value={row[col] === undefined ? '' : String(row[col])}
                              onChange={(e) => {
                                const raw = e.target.value;
                                const typed =
                                  raw === 'true'
                                    ? true
                                    : raw === 'false'
                                      ? false
                                      : raw !== '' && !Number.isNaN(Number(raw))
                                        ? Number(raw)
                                        : raw;
                                updateActiveTable((t) => ({
                                  ...t,
                                  rows: t.rows.map((r, i) =>
                                    i === rIdx ? { ...r, [col]: typed } : r
                                  ),
                                }));
                              }}
                              className="w-full rounded border border-transparent bg-[#16161d] px-1.5 py-0.5 font-mono text-zinc-100 focus:border-amber-500 focus:outline-none"
                            />
                          </td>
                        ))}
                        <td className="px-1 text-center">
                          <button
                            type="button"
                            onClick={() =>
                              updateActiveTable((t) => ({
                                ...t,
                                rows: t.rows.filter((_, i) => i !== rIdx),
                              }))
                            }
                            className="p-0.5 text-zinc-500 hover:text-red-400"
                          >
                            <Trash2 className="h-3 w-3" />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ) : (
            <div className="flex flex-1 items-center justify-center text-zinc-500">
              Crea una tabla de datos para ítems, tiendas, armas o estadísticas.
            </div>
          )}
        </div>
      ) : (
        <div className="flex min-h-0 flex-1 flex-col p-2.5 space-y-2">
          <div className="flex flex-wrap items-center gap-3">
            <label className="flex items-center gap-1.5">
              <span className="text-zinc-400">Idioma base:</span>
              <select
                aria-label="Idioma base i18n"
                value={i18n.defaultLocale}
                onChange={(e) =>
                  onChangeI18n({
                    ...i18n,
                    defaultLocale: e.target.value as I18nLocale,
                  })
                }
                className="rounded border border-[#32323c] bg-[#101014] px-2 py-1 text-xs text-white"
              >
                <option value="es">Español (es)</option>
                <option value="en">English (en)</option>
                <option value="pt">Português (pt)</option>
              </select>
            </label>

            <label className="flex items-center gap-1.5 cursor-pointer">
              <input
                type="checkbox"
                checked={i18n.autoDetectBrowser !== false}
                onChange={(e) =>
                  onChangeI18n({ ...i18n, autoDetectBrowser: e.target.checked })
                }
                className="accent-emerald-500"
              />
              <span>Autodetectar idioma del navegador</span>
            </label>

            <div className="ml-auto flex items-center gap-1.5">
              <input
                type="text"
                placeholder="Clave (ej. play_btn)"
                value={newI18nKey}
                onChange={(e) => setNewI18nKey(e.target.value)}
                className="w-40 rounded border border-[#32323c] bg-[#101014] px-2 py-1 font-mono text-xs text-white"
              />
              <button
                type="button"
                onClick={() => {
                  const key = newI18nKey.trim();
                  if (!key) return;
                  onChangeI18n({
                    ...i18n,
                    entries: {
                      ...i18n.entries,
                      [key]: i18n.entries[key] ?? { es: key, en: key, pt: key },
                    },
                  });
                  setNewI18nKey('');
                }}
                className="inline-flex items-center gap-1 rounded bg-emerald-600 px-2.5 py-1 text-[11px] font-semibold text-white hover:bg-emerald-500"
              >
                <Plus className="h-3 w-3" />
                <span>Añadir clave</span>
              </button>
            </div>
          </div>

          <div className="min-h-0 flex-1 overflow-auto rounded border border-[#2a2a33] bg-[#101014]">
            <table className="w-full border-collapse text-left text-[11px]">
              <thead className="sticky top-0 bg-[#1a1a22] text-zinc-300">
                <tr>
                  <th className="w-40 border-b border-[#2c2c36] px-2 py-1 font-mono">Clave</th>
                  <th className="border-b border-[#2c2c36] px-2 py-1">Español (es)</th>
                  <th className="border-b border-[#2c2c36] px-2 py-1">English (en)</th>
                  <th className="border-b border-[#2c2c36] px-2 py-1">Português (pt)</th>
                  <th className="w-8 border-b border-[#2c2c36]" />
                </tr>
              </thead>
              <tbody>
                {entries.map(([key, map]) => (
                  <tr key={key} className="border-b border-[#1f1f27]">
                    <td className="px-2 py-1 font-mono text-emerald-300">{key}</td>
                    {(['es', 'en', 'pt'] as I18nLocale[]).map((loc) => (
                      <td key={loc} className="px-1.5 py-1">
                        <input
                          type="text"
                          value={map[loc] ?? ''}
                          onChange={(e) =>
                            onChangeI18n({
                              ...i18n,
                              entries: {
                                ...i18n.entries,
                                [key]: { ...map, [loc]: e.target.value },
                              },
                            })
                          }
                          className="w-full rounded border border-transparent bg-[#16161d] px-1.5 py-0.5 text-zinc-100 focus:border-emerald-500 focus:outline-none"
                        />
                      </td>
                    ))}
                    <td className="px-1 text-center">
                      <button
                        type="button"
                        onClick={() => {
                          const next = { ...i18n.entries };
                          delete next[key];
                          onChangeI18n({ ...i18n, entries: next });
                        }}
                        className="p-0.5 text-zinc-500 hover:text-red-400"
                      >
                        <Trash2 className="h-3 w-3" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
};
