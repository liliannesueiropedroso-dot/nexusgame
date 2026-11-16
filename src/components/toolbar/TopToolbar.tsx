import React from 'react';
import {
  ChevronLeft,
  Download,
  Hand,
  Maximize2,
  MousePointer2,
  Move,
  Paintbrush,
  Play,
  Redo2,
  RotateCw,
  Save,
  Scale,
  Settings,
  Square,
  Undo2,
} from 'lucide-react';
import type { EditorTool } from '../../engine/core/types';

interface TopToolbarProps {
  projectName: string;
  activeTool: EditorTool;
  canUndo: boolean;
  canRedo: boolean;
  isPreviewOpen: boolean;
  isDirty: boolean;
  onBackToProjects: () => void;
  onSelectTool: (tool: EditorTool) => void;
  onUndo: () => void;
  onRedo: () => void;
  onSave: () => void;
  onStartPreview: () => void;
  onStopPreview: () => void;
  onOpenSettings: () => void;
  onExportZip: () => void;
  onFitToStage: () => void;
}

const TOOL_BUTTONS: Array<{
  id: EditorTool;
  label: string;
  shortcut: string;
  icon: React.FC<{ className?: string }>;
}> = [
  { id: 'select', label: 'Seleccionar', shortcut: 'V', icon: MousePointer2 },
  { id: 'move', label: 'Mover', shortcut: 'W', icon: Move },
  { id: 'scale', label: 'Escalar', shortcut: 'S', icon: Scale },
  { id: 'rotate', label: 'Rotar', shortcut: 'E', icon: RotateCw },
  { id: 'pan', label: 'Navegar', shortcut: 'H', icon: Hand },
  { id: 'tilebrush', label: 'Pincel Tiles', shortcut: 'B', icon: Paintbrush },
];

export const TopToolbar: React.FC<TopToolbarProps> = ({
  projectName,
  activeTool,
  canUndo,
  canRedo,
  isPreviewOpen,
  isDirty,
  onBackToProjects,
  onSelectTool,
  onUndo,
  onRedo,
  onSave,
  onStartPreview,
  onStopPreview,
  onOpenSettings,
  onExportZip,
  onFitToStage,
}) => {
  return (
    <header className="flex h-11 w-full shrink-0 items-center justify-between border-b border-[#2e2e36] bg-[#1a1a1e] px-3 select-none">
      {/* Izquierda: Logo NEXUS, volver, nombre del proyecto, guardar, deshacer/rehacer */}
      <div className="flex items-center gap-2 min-w-0">
        <button
          type="button"
          onClick={onBackToProjects}
          title="Volver al administrador de proyectos"
          aria-label="Volver a proyectos"
          className="inline-flex items-center gap-1 rounded px-2 py-1 text-xs font-medium text-zinc-300 hover:bg-[#292930] hover:text-white whitespace-nowrap shrink-0"
        >
          <ChevronLeft className="h-3.5 w-3.5" />
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <path
              d="M12 2L21 7V17L12 22L3 17V7L12 2Z"
              stroke="#60a5fa"
              strokeWidth="2.2"
              strokeLinejoin="round"
            />
          </svg>
          <span className="font-bold tracking-tight text-zinc-100">NEXUS</span>
        </button>

        <span className="h-4 w-px bg-[#303038]" aria-hidden="true" />

        <button
          type="button"
          onClick={onOpenSettings}
          title="Configuración del proyecto"
          className="truncate max-w-[200px] rounded px-2 py-1 text-xs font-semibold text-zinc-200 hover:bg-[#292930] hover:text-white"
        >
          {projectName}
        </button>

        <span className="h-4 w-px bg-[#303038]" aria-hidden="true" />

        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={onSave}
            title="Guardar proyecto (Ctrl+S)"
            aria-label="Guardar proyecto"
            className={`inline-flex items-center gap-1.5 rounded px-2.5 py-1 text-xs font-medium transition-colors whitespace-nowrap shrink-0 ${
              isDirty
                ? 'bg-blue-600/20 text-blue-300 hover:bg-blue-600/30 border border-blue-500/40'
                : 'text-zinc-300 hover:bg-[#292930] hover:text-white'
            }`}
          >
            <Save className="h-3.5 w-3.5" />
            <span>Guardar</span>
          </button>

          <button
            type="button"
            onClick={onUndo}
            disabled={!canUndo}
            title="Deshacer (Ctrl+Z)"
            aria-label="Deshacer"
            className="rounded p-1.5 text-zinc-300 hover:bg-[#292930] hover:text-white disabled:opacity-35 disabled:pointer-events-none"
          >
            <Undo2 className="h-3.5 w-3.5" />
          </button>

          <button
            type="button"
            onClick={onRedo}
            disabled={!canRedo}
            title="Rehacer (Ctrl+Y)"
            aria-label="Rehacer"
            className="rounded p-1.5 text-zinc-300 hover:bg-[#292930] hover:text-white disabled:opacity-35 disabled:pointer-events-none"
          >
            <Redo2 className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      {/* Centro: Herramientas de escena + Ajustar vista */}
      <div className="flex items-center gap-1 rounded-md border border-[#2f2f38] bg-[#141417] p-0.5">
        {TOOL_BUTTONS.map((tool) => {
          const Icon = tool.icon;
          const active = activeTool === tool.id;
          return (
            <button
              key={tool.id}
              type="button"
              onClick={() => onSelectTool(tool.id)}
              title={`${tool.label} (${tool.shortcut})`}
              aria-label={`${tool.label} (${tool.shortcut})`}
              aria-pressed={active}
              className={`inline-flex items-center gap-1.5 rounded px-2.5 py-1 text-xs font-medium transition-colors whitespace-nowrap shrink-0 ${
                active
                  ? 'bg-blue-600 text-white'
                  : 'text-zinc-400 hover:bg-[#25252c] hover:text-zinc-100'
              }`}
            >
              <Icon className="h-3.5 w-3.5" />
              <span className="hidden xl:inline">{tool.label}</span>
            </button>
          );
        })}

        <span className="mx-0.5 h-4 w-px bg-[#2f2f38]" aria-hidden="true" />

        <button
          type="button"
          onClick={onFitToStage}
          title="Ajustar vista al escenario"
          aria-label="Ajustar vista al escenario"
          className="inline-flex items-center gap-1 rounded px-2 py-1 text-xs font-medium text-zinc-400 hover:bg-[#25252c] hover:text-zinc-100 whitespace-nowrap shrink-0"
        >
          <Maximize2 className="h-3.5 w-3.5" />
          <span className="hidden xl:inline">Ajustar</span>
        </button>
      </div>

      {/* Derecha: Vista previa / Detener, Configuración, Exportar */}
      <div className="flex items-center gap-1.5 shrink-0">
        {!isPreviewOpen ? (
          <button
            type="button"
            onClick={onStartPreview}
            title="Ejecutar vista previa del escenario"
            className="inline-flex items-center gap-1.5 rounded bg-emerald-600 px-3 py-1 text-xs font-semibold text-white hover:bg-emerald-500 whitespace-nowrap shrink-0"
          >
            <Play className="h-3.5 w-3.5 fill-current" />
            Vista previa
          </button>
        ) : (
          <button
            type="button"
            onClick={onStopPreview}
            title="Detener ejecución"
            className="inline-flex items-center gap-1.5 rounded bg-red-600 px-3 py-1 text-xs font-semibold text-white hover:bg-red-500 whitespace-nowrap shrink-0"
          >
            <Square className="h-3.5 w-3.5 fill-current" />
            Detener
          </button>
        )}

        <button
          type="button"
          onClick={onOpenSettings}
          title="Configuración del proyecto"
          aria-label="Configuración del proyecto"
          className="inline-flex items-center gap-1 rounded border border-[#32323c] bg-[#222227] px-2.5 py-1 text-xs font-medium text-zinc-200 hover:bg-[#2b2b32] whitespace-nowrap shrink-0"
        >
          <Settings className="h-3.5 w-3.5" />
          <span className="hidden lg:inline">Configuración</span>
        </button>

        <button
          type="button"
          onClick={onExportZip}
          title="Exportar proyecto como archivo ZIP"
          aria-label="Exportar proyecto"
          className="inline-flex items-center gap-1 rounded border border-[#32323c] bg-[#222227] px-2.5 py-1 text-xs font-medium text-zinc-200 hover:bg-[#2b2b32] whitespace-nowrap shrink-0"
        >
          <Download className="h-3.5 w-3.5" />
          <span className="hidden lg:inline">Exportar</span>
        </button>
      </div>
    </header>
  );
};
