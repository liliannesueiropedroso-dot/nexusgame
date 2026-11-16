import React from 'react';
import {
  AlertTriangle,
  ChevronDown,
  ChevronUp,
  Database,
  Film,
  Sparkles,
  Volume2,
  Zap,
} from 'lucide-react';
import type { EngineDiagnostic } from '../../assistant/diagnostics/diagnosticAnalyzer';
import type {
  AudioBusSettings,
  GameMechanic,
  GameObjectData,
  ProjectVariable,
  SceneData,
} from '../../engine/core/types';
import type { PrefabDefinition, ProjectAssetMeta } from '../../project/models/project';
import { AudioMixerPanel } from './AudioMixerPanel';
import { DiagnosticsPanel } from './DiagnosticsPanel';
import { MechanicsPanel } from './MechanicsPanel';
import { ParticleStudioPanel } from './ParticleStudioPanel';
import { SceneAnimatorPanel } from './SceneAnimatorPanel';
import { VariablesPanel } from './VariablesPanel';

export type DockTab =
  | 'mechanics'
  | 'variables'
  | 'particles'
  | 'animator'
  | 'audio'
  | 'diagnostics';

interface BottomDockProps {
  open: boolean;
  activeTab: DockTab;
  onToggleOpen: () => void;
  onSelectTab: (tab: DockTab) => void;
  mechanics: GameMechanic[];
  objects: GameObjectData[];
  selectedObjectId?: string | null;
  variables: ProjectVariable[];
  audioBuses?: AudioBusSettings;
  assets: ProjectAssetMeta[];
  assetBlobs: Map<string, Blob>;
  diagnostics: EngineDiagnostic[];
  scenes?: SceneData[];
  prefabs?: PrefabDefinition[];
  onChangeMechanics: (next: GameMechanic[]) => void;
  onChangeVariables: (next: ProjectVariable[]) => void;
  onChangeAudioBuses: (next: AudioBusSettings) => void;
  onUpdateObject?: (id: string, updater: (obj: GameObjectData) => GameObjectData) => void;
  onApplyDiagnosticFix: (diag: EngineDiagnostic) => void;
  onSelectObjectById: (id: string) => void;
}

export const BottomDock: React.FC<BottomDockProps> = ({
  open,
  activeTab,
  onToggleOpen,
  onSelectTab,
  mechanics,
  objects,
  selectedObjectId,
  variables,
  audioBuses,
  assets,
  assetBlobs,
  diagnostics,
  scenes = [],
  prefabs = [],
  onChangeMechanics,
  onChangeVariables,
  onChangeAudioBuses,
  onUpdateObject,
  onApplyDiagnosticFix,
  onSelectObjectById,
}) => {
  const handleTabClick = (tab: DockTab) => {
    if (!open) {
      onToggleOpen();
      onSelectTab(tab);
    } else if (activeTab === tab) {
      onToggleOpen();
    } else {
      onSelectTab(tab);
    }
  };

  return (
    <section
      aria-label="Panel de mecánicas, variables, partículas, animador, audio y diagnóstico"
      className="shrink-0 border-t border-[#2e2e36] bg-[#16161a]"
    >
      {/* Barra de pestañas del dock */}
      <div className="flex h-8 items-center justify-between px-2">
        <div className="flex items-center gap-1 overflow-x-auto" role="tablist">
          <button
            type="button"
            role="tab"
            aria-selected={open && activeTab === 'mechanics'}
            onClick={() => handleTabClick('mechanics')}
            className={`inline-flex items-center gap-1.5 rounded px-2.5 py-1 text-[11px] font-semibold transition-colors whitespace-nowrap ${
              open && activeTab === 'mechanics'
                ? 'bg-[#25252d] text-blue-400'
                : 'text-zinc-400 hover:bg-[#202026] hover:text-zinc-200'
            }`}
          >
            <Zap className="h-3.5 w-3.5" />
            <span>Mecánicas ({mechanics.length})</span>
          </button>

          <button
            type="button"
            role="tab"
            aria-selected={open && activeTab === 'variables'}
            onClick={() => handleTabClick('variables')}
            className={`inline-flex items-center gap-1.5 rounded px-2.5 py-1 text-[11px] font-semibold transition-colors whitespace-nowrap ${
              open && activeTab === 'variables'
                ? 'bg-[#25252d] text-emerald-400'
                : 'text-zinc-400 hover:bg-[#202026] hover:text-zinc-200'
            }`}
          >
            <Database className="h-3.5 w-3.5" />
            <span>Variables ({variables.length})</span>
          </button>

          <button
            type="button"
            role="tab"
            aria-selected={open && activeTab === 'particles'}
            onClick={() => handleTabClick('particles')}
            className={`inline-flex items-center gap-1.5 rounded px-2.5 py-1 text-[11px] font-semibold transition-colors whitespace-nowrap ${
              open && activeTab === 'particles'
                ? 'bg-[#25252d] text-orange-400'
                : 'text-zinc-400 hover:bg-[#202026] hover:text-zinc-200'
            }`}
          >
            <Sparkles className="h-3.5 w-3.5" />
            <span>Partículas</span>
          </button>

          <button
            type="button"
            role="tab"
            aria-selected={open && activeTab === 'animator'}
            onClick={() => handleTabClick('animator')}
            className={`inline-flex items-center gap-1.5 rounded px-2.5 py-1 text-[11px] font-semibold transition-colors whitespace-nowrap ${
              open && activeTab === 'animator'
                ? 'bg-[#25252d] text-violet-400'
                : 'text-zinc-400 hover:bg-[#202026] hover:text-zinc-200'
            }`}
          >
            <Film className="h-3.5 w-3.5" />
            <span>Animador</span>
          </button>

          <button
            type="button"
            role="tab"
            aria-selected={open && activeTab === 'audio'}
            onClick={() => handleTabClick('audio')}
            className={`inline-flex items-center gap-1.5 rounded px-2.5 py-1 text-[11px] font-semibold transition-colors whitespace-nowrap ${
              open && activeTab === 'audio'
                ? 'bg-[#25252d] text-sky-400'
                : 'text-zinc-400 hover:bg-[#202026] hover:text-zinc-200'
            }`}
          >
            <Volume2 className="h-3.5 w-3.5" />
            <span>Audio</span>
          </button>

          <button
            type="button"
            role="tab"
            aria-selected={open && activeTab === 'diagnostics'}
            onClick={() => handleTabClick('diagnostics')}
            className={`inline-flex items-center gap-1.5 rounded px-2.5 py-1 text-[11px] font-semibold transition-colors whitespace-nowrap ${
              open && activeTab === 'diagnostics'
                ? 'bg-[#25252d] text-amber-400'
                : diagnostics.length > 0
                ? 'text-amber-300 hover:bg-[#202026]'
                : 'text-zinc-400 hover:bg-[#202026] hover:text-zinc-200'
            }`}
          >
            <AlertTriangle className="h-3.5 w-3.5" />
            <span>Diagnóstico ({diagnostics.length})</span>
          </button>
        </div>

        <button
          type="button"
          onClick={onToggleOpen}
          aria-label={open ? 'Contraer panel inferior' : 'Expandir panel inferior'}
          className="inline-flex items-center gap-1 rounded px-2 py-0.5 text-[11px] text-zinc-400 hover:bg-[#222229] hover:text-zinc-200"
        >
          {open ? (
            <>
              <ChevronDown className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">Ocultar</span>
            </>
          ) : (
            <>
              <ChevronUp className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">Abrir</span>
            </>
          )}
        </button>
      </div>

      {/* Contenido desplegable */}
      {open && (
        <div className="h-64 border-t border-[#292931] bg-[#141418]">
          {activeTab === 'mechanics' && (
            <MechanicsPanel
              mechanics={mechanics}
              objects={objects}
              variables={variables}
              assets={assets}
              scenes={scenes}
              prefabs={prefabs}
              onChangeMechanics={onChangeMechanics}
            />
          )}
          {activeTab === 'variables' && (
            <VariablesPanel
              variables={variables}
              onChangeVariables={onChangeVariables}
            />
          )}
          {activeTab === 'particles' && (
            <ParticleStudioPanel
              objects={objects}
              selectedObjectId={selectedObjectId}
              onUpdateObject={onUpdateObject}
              onSelectObjectById={onSelectObjectById}
            />
          )}
          {activeTab === 'animator' && (
            <SceneAnimatorPanel
              objects={objects}
              selectedObjectId={selectedObjectId}
              onUpdateObject={onUpdateObject}
              onSelectObjectById={onSelectObjectById}
            />
          )}
          {activeTab === 'audio' && (
            <AudioMixerPanel
              audioBuses={audioBuses}
              assets={assets}
              assetBlobs={assetBlobs}
              onChangeAudioBuses={onChangeAudioBuses}
            />
          )}
          {activeTab === 'diagnostics' && (
            <DiagnosticsPanel
              diagnostics={diagnostics}
              onApplyDiagnosticFix={onApplyDiagnosticFix}
              onSelectObjectById={onSelectObjectById}
            />
          )}
        </div>
      )}
    </section>
  );
};
