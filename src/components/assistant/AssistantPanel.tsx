import React, { useMemo, useState } from 'react';
import {
  AlertTriangle,
  BookOpen,
  CheckCircle2,
  Info,
  Search,
  Sparkles,
  Wrench,
  XCircle,
} from 'lucide-react';
import type { MechanicCatalogEntry } from '../../assistant/catalog/mechanicsCatalog';
import type { EngineDiagnostic } from '../../assistant/diagnostics/diagnosticAnalyzer';
import { getContextualRecommendations } from '../../assistant/recommender/recommendEngine';
import { searchMechanicsCatalog } from '../../assistant/search/spanishSearch';
import {
  BEHAVIOR_CATEGORIES,
  searchBehaviors,
  type BehaviorCategory,
  type BehaviorRegistryEntry,
} from '../../engine/components/behaviorRegistry';
import type { GameObjectData, SceneData } from '../../engine/core/types';
import type { ProjectAssetMeta } from '../../project/models/project';

interface AssistantPanelProps {
  scene: SceneData;
  selectedObject: GameObjectData | null;
  assets: ProjectAssetMeta[];
  diagnostics: EngineDiagnostic[];
  onApplyCatalogEntry: (entry: MechanicCatalogEntry, targetObjectId: string | null) => void;
  onInstallBehavior?: (entry: BehaviorRegistryEntry, targetObjectId: string) => void;
  onApplyDiagnosticFix: (diagnostic: EngineDiagnostic) => void;
  onSelectObjectById: (objectId: string) => void;
}

export const AssistantPanel: React.FC<AssistantPanelProps> = ({
  scene,
  selectedObject,
  assets,
  diagnostics,
  onApplyCatalogEntry,
  onInstallBehavior,
  onApplyDiagnosticFix,
  onSelectObjectById,
}) => {
  const [query, setQuery] = useState('');
  const [behaviorCategory, setBehaviorCategory] = useState<BehaviorCategory | 'Todas'>('Todas');

  const recommendations = useMemo(
    () => getContextualRecommendations(selectedObject, scene, assets),
    [selectedObject, scene, assets]
  );

  const searchResults = useMemo(() => searchMechanicsCatalog(query), [query]);
  const behaviorResults = useMemo(
    () => searchBehaviors(query, behaviorCategory),
    [query, behaviorCategory]
  );

  const isCompatible = (entry: MechanicCatalogEntry): boolean => {
    if (entry.compatibleWith.includes('any')) return true;
    if (!selectedObject) {
      // Las mecánicas globales (reglas/audio/cámara/escenas) se pueden aplicar sin selección
      return (
        entry.id.startsWith('interaction.') ||
        entry.id.startsWith('audio.') ||
        entry.id.startsWith('scene.')
      );
    }
    return entry.compatibleWith.includes(
      selectedObject.type as MechanicCatalogEntry['compatibleWith'][number]
    );
  };

  return (
    <div className="flex h-full flex-col overflow-y-auto bg-[#1a1a1e]">
      {/* Buscador local en español */}
      <div className="border-b border-[#2e2e36] bg-[#1e1e23] p-3 space-y-2">
        <div className="flex items-center justify-between">
          <span className="text-[11px] font-semibold uppercase tracking-wide text-zinc-400">
            Asistente Local de Mecánicas
          </span>
          <span className="font-mono text-[10px] text-emerald-400">100 % OFFLINE</span>
        </div>

        <div className="relative">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-zinc-500" />
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Ej: seguir jugador, caminar, recoger moneda..."
            aria-label="Buscar mecánicas en español"
            className="w-full rounded border border-[#34343e] bg-[#141416] py-1.5 pl-8 pr-2.5 text-xs text-zinc-100 placeholder:text-zinc-500 focus:border-blue-500 focus:outline-none"
          />
        </div>

        <div className="text-[11px] text-zinc-400">
          Contexto:{' '}
          <span className="font-medium text-zinc-200">
            {selectedObject ? selectedObject.name : `Escena "${scene.name}"`}
          </span>
        </div>
      </div>

      {/* Diagnóstico en tiempo real */}
      <section className="border-b border-[#2b2b33] p-3 space-y-2">
        <div className="flex items-center justify-between">
          <h3 className="flex items-center gap-1.5 text-[11px] font-semibold text-zinc-200">
            <Wrench className="h-3.5 w-3.5 text-amber-400" />
            <span>Diagnóstico del proyecto ({diagnostics.length})</span>
          </h3>
        </div>

        {diagnostics.length === 0 ? (
          <div className="flex items-center gap-2 rounded border border-emerald-500/30 bg-emerald-500/10 px-2.5 py-2 text-[11px] text-emerald-300">
            <CheckCircle2 className="h-3.5 w-3.5 shrink-0" />
            <span>Sin conflictos ni configuraciones incompletas en esta escena.</span>
          </div>
        ) : (
          <div className="space-y-1.5">
            {diagnostics.map((diag) => (
              <div
                key={diag.id}
                className={`rounded border p-2 text-xs ${
                  diag.severity === 'error'
                    ? 'border-red-500/40 bg-red-500/10'
                    : diag.severity === 'warning'
                    ? 'border-amber-500/40 bg-amber-500/10'
                    : 'border-sky-500/30 bg-sky-500/10'
                }`}
              >
                <div className="flex items-start gap-1.5">
                  {diag.severity === 'error' ? (
                    <XCircle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-red-400" />
                  ) : diag.severity === 'warning' ? (
                    <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-400" />
                  ) : (
                    <Info className="mt-0.5 h-3.5 w-3.5 shrink-0 text-sky-400" />
                  )}
                  <div className="min-w-0 flex-1 space-y-1">
                    <div className="font-medium text-zinc-100 leading-snug">{diag.title}</div>
                    <p className="text-[11px] text-zinc-300 leading-relaxed">{diag.detail}</p>
                    <div className="flex flex-wrap items-center gap-1.5 pt-0.5">
                      {diag.fix && (
                        <button
                          type="button"
                          onClick={() => onApplyDiagnosticFix(diag)}
                          className="rounded bg-amber-500 px-2 py-1 text-[11px] font-semibold text-zinc-950 hover:bg-amber-400 whitespace-nowrap"
                        >
                          {diag.fix.label}
                        </button>
                      )}
                      {diag.objectId && (
                        <button
                          type="button"
                          onClick={() => onSelectObjectById(diag.objectId!)}
                          className="rounded border border-[#3a3a45] bg-[#1e1e24] px-2 py-1 text-[11px] text-zinc-200 hover:bg-[#2a2a33] whitespace-nowrap"
                        >
                          Seleccionar objeto
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Recomendaciones contextuales */}
      {!query.trim() && recommendations.length > 0 && (
        <section className="border-b border-[#2b2b33] p-3 space-y-2">
          <h3 className="flex items-center gap-1.5 text-[11px] font-semibold text-zinc-200">
            <Sparkles className="h-3.5 w-3.5 text-sky-400" />
            <span>Sugerido para la selección</span>
          </h3>
          <div className="space-y-1.5">
            {recommendations.map((rec) => (
              <div
                key={rec.id}
                className="rounded border border-[#30303b] bg-[#15151a] p-2 space-y-1.5"
              >
                <div className="text-xs font-medium text-zinc-100">{rec.title}</div>
                <p className="text-[11px] text-zinc-400 leading-relaxed">{rec.reason}</p>
                <button
                  type="button"
                  onClick={() => onApplyCatalogEntry(rec.catalogEntry, rec.targetObjectId)}
                  className="rounded bg-blue-600 px-2.5 py-1 text-[11px] font-semibold text-white hover:bg-blue-500 whitespace-nowrap"
                >
                  Aplicar en 1 clic
                </button>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Catálogo de mecánicas */}
      <section className="p-3 space-y-2">
        <h3 className="flex items-center gap-1.5 text-[11px] font-semibold text-zinc-200">
          <BookOpen className="h-3.5 w-3.5 text-zinc-400" />
          <span>
            {query.trim()
              ? `Resultados (${searchResults.length})`
              : `Catálogo de mecánicas (${searchResults.length})`}
          </span>
        </h3>

        {searchResults.length === 0 ? (
          <p className="rounded border border-dashed border-[#32323c] p-3 text-center text-[11px] text-zinc-400">
            No se encontraron mecánicas para &ldquo;{query}&rdquo;. Prueba con &ldquo;seguir&rdquo;,
            &ldquo;saltar&rdquo;, &ldquo;caminar&rdquo;, &ldquo;moneda&rdquo; o &ldquo;sonido&rdquo;.
          </p>
        ) : (
          <div className="space-y-2">
            {searchResults.map(({ entry }) => {
              const compatible = isCompatible(entry);
              return (
                <div
                  key={entry.id}
                  className="rounded border border-[#2f2f38] bg-[#15151a] p-2.5 space-y-1.5"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <div className="text-[10px] font-semibold uppercase tracking-wide text-blue-400">
                        {entry.family}
                      </div>
                      <div className="text-xs font-semibold text-zinc-100">{entry.name}</div>
                    </div>
                  </div>
                  <p className="text-[11px] text-zinc-400 leading-relaxed">{entry.description}</p>
                  <div className="flex items-center justify-between pt-0.5">
                    <span className="font-mono text-[10px] text-zinc-500">
                      {entry.id}
                    </span>
                    <button
                      type="button"
                      disabled={!compatible}
                      onClick={() =>
                        onApplyCatalogEntry(entry, selectedObject?.id ?? null)
                      }
                      title={
                        compatible
                          ? `Aplicar "${entry.name}"`
                          : 'Selecciona primero un objeto compatible en el escenario'
                      }
                      className="rounded bg-blue-600 px-2.5 py-1 text-[11px] font-semibold text-white hover:bg-blue-500 disabled:opacity-40 disabled:pointer-events-none whitespace-nowrap"
                    >
                      Aplicar
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* Biblioteca modular de comportamientos (65) */}
      {onInstallBehavior && (
        <section className="border-t border-[#2b2b33] p-3 space-y-2">
          <div className="flex items-center justify-between gap-2">
            <h3 className="text-[11px] font-semibold text-zinc-200">
              Comportamientos modulares ({behaviorResults.length})
            </h3>
            <select
              aria-label="Filtrar categoría en asistente"
              value={behaviorCategory}
              onChange={(e) =>
                setBehaviorCategory(e.target.value as BehaviorCategory | 'Todas')
              }
              className="rounded border border-[#32323c] bg-[#141416] px-1.5 py-0.5 text-[10px] text-zinc-200"
            >
              <option value="Todas">Todas</option>
              {BEHAVIOR_CATEGORIES.map((cat) => (
                <option key={cat} value={cat}>
                  {cat}
                </option>
              ))}
            </select>
          </div>
          <div className="max-h-64 overflow-y-auto space-y-1.5 pr-0.5">
            {behaviorResults.slice(0, 20).map((b) => (
              <div
                key={b.type}
                className="rounded border border-[#2c2c35] bg-[#15151a] p-2 space-y-1"
              >
                <div className="flex items-center justify-between gap-1">
                  <span className="text-[10px] font-semibold uppercase text-sky-400">
                    {b.category}
                  </span>
                  <button
                    type="button"
                    disabled={!selectedObject}
                    onClick={() => selectedObject && onInstallBehavior(b, selectedObject.id)}
                    title={
                      selectedObject
                        ? `Añadir "${b.label}" a ${selectedObject.name}`
                        : 'Selecciona un objeto en la escena primero'
                    }
                    className="rounded bg-emerald-600 px-2 py-0.5 text-[10px] font-semibold text-white hover:bg-emerald-500 disabled:opacity-40 whitespace-nowrap"
                  >
                    + Instalar
                  </button>
                </div>
                <div className="text-xs font-medium text-zinc-100">{b.label}</div>
                <p className="text-[10px] text-zinc-400 leading-snug">{b.description}</p>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
};
