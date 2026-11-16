import React, { useRef, useState } from 'react';
import {
  Check,
  Copy,
  Download,
  Edit3,
  FolderOpen,
  Plus,
  Sparkles,
  Trash2,
  Upload,
  X,
} from 'lucide-react';
import type { NexusProjectSummary } from '../../project/models/project';
import { formatRelativeDateEs } from '../../utils/format';
import { ConfirmDialog } from '../common/ConfirmDialog';
import { NewProjectModal, type NewProjectFormValues } from './NewProjectModal';

interface ProjectManagerProps {
  projects: NexusProjectSummary[];
  loading: boolean;
  onOpenProject: (projectId: string) => void;
  onCreateProject: (values: NewProjectFormValues) => void;
  onDuplicateProject: (projectId: string) => void;
  onRenameProject: (projectId: string, newName: string) => void;
  onDeleteProject: (projectId: string) => void;
  onExportProjectZip: (projectId: string) => void;
  onImportProjectZip: (file: File) => void;
  onRestoreSampleProject: () => void;
}

export const ProjectManager: React.FC<ProjectManagerProps> = ({
  projects,
  loading,
  onOpenProject,
  onCreateProject,
  onDuplicateProject,
  onRenameProject,
  onDeleteProject,
  onExportProjectZip,
  onImportProjectZip,
  onRestoreSampleProject,
}) => {
  const [newModalOpen, setNewModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState('');
  const [deleteTarget, setDeleteTarget] = useState<NexusProjectSummary | null>(null);
  const zipInputRef = useRef<HTMLInputElement | null>(null);

  const startRename = (proj: NexusProjectSummary) => {
    setEditingId(proj.id);
    setEditingName(proj.name);
  };

  const commitRename = () => {
    if (editingId && editingName.trim()) {
      onRenameProject(editingId, editingName.trim());
    }
    setEditingId(null);
    setEditingName('');
  };

  return (
    <div className="flex h-full w-full flex-col bg-[#141416] text-zinc-100">
      {/* Cabecera del administrador de proyectos */}
      <header className="flex items-center justify-between border-b border-[#2b2b33] bg-[#19191d] px-6 py-3.5">
        <div className="flex items-center gap-3">
          <div className="flex h-8 w-8 items-center justify-center rounded border border-blue-500/40 bg-blue-600/15">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <path
                d="M12 2L21 7V17L12 22L3 17V7L12 2Z"
                stroke="#60a5fa"
                strokeWidth="2"
                strokeLinejoin="round"
              />
              <path d="M12 22V12M12 12L21 7M12 12L3 7" stroke="#3b82f6" strokeWidth="1.5" />
            </svg>
          </div>
          <div className="flex items-baseline gap-2.5">
            <h1 className="text-base font-bold tracking-tight text-zinc-100 whitespace-nowrap">
              NEXUS GAME ENGINE
            </h1>
            <span className="text-xs text-zinc-400 whitespace-nowrap">
              Fase 1 · Editor 2D Local
            </span>
          </div>
        </div>

        <div className="flex items-center gap-2.5">
          <input
            ref={zipInputRef}
            type="file"
            accept=".zip,application/zip"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) {
                onImportProjectZip(file);
                e.target.value = '';
              }
            }}
          />
          <button
            type="button"
            onClick={() => zipInputRef.current?.click()}
            className="inline-flex items-center gap-1.5 rounded border border-[#383844] bg-[#232328] px-3.5 py-2 text-xs font-medium text-zinc-200 hover:bg-[#2c2c33] whitespace-nowrap shrink-0"
          >
            <Upload className="h-3.5 w-3.5" />
            Importar ZIP
          </button>
          <button
            type="button"
            onClick={() => setNewModalOpen(true)}
            className="inline-flex items-center gap-1.5 rounded bg-blue-600 px-4 py-2 text-xs font-semibold text-white hover:bg-blue-500 whitespace-nowrap shrink-0"
          >
            <Plus className="h-3.5 w-3.5" />
            Nuevo proyecto
          </button>
        </div>
      </header>

      {/* Cuerpo principal */}
      <main className="mx-auto flex w-full max-w-6xl flex-1 flex-col overflow-hidden px-6 py-6">
        <div className="mb-4 flex items-center justify-between">
          <div>
            <h2 className="text-sm font-semibold text-zinc-100">Proyectos recientes</h2>
            <p className="mt-0.5 text-xs text-zinc-400">
              Almacenamiento local en IndexedDB con conservación íntegra de escenas y recursos.
            </p>
          </div>
          <button
            type="button"
            onClick={onRestoreSampleProject}
            className="inline-flex items-center gap-1.5 rounded border border-[#32323c] bg-[#1d1d22] px-3 py-1.5 text-xs font-medium text-zinc-300 hover:bg-[#27272e] hover:text-zinc-100 whitespace-nowrap shrink-0"
          >
            <Sparkles className="h-3.5 w-3.5 text-blue-400" />
            Crear proyecto de ejemplo
          </button>
        </div>

        <div className="flex-1 overflow-auto rounded-lg border border-[#2c2c34] bg-[#19191d]">
          {loading ? (
            <div className="flex h-56 items-center justify-center text-xs text-zinc-400">
              Cargando proyectos locales...
            </div>
          ) : projects.length === 0 ? (
            <div className="flex h-64 flex-col items-center justify-center gap-3 px-6 text-center">
              <FolderOpen className="h-8 w-8 text-zinc-500" />
              <div>
                <p className="text-sm font-medium text-zinc-200">
                  No hay proyectos guardados todavía
                </p>
                <p className="mt-1 text-xs text-zinc-400">
                  Crea un proyecto nuevo, importa un archivo .zip o genera el proyecto de ejemplo.
                </p>
              </div>
              <div className="flex items-center gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => setNewModalOpen(true)}
                  className="rounded bg-blue-600 px-3.5 py-2 text-xs font-medium text-white hover:bg-blue-500"
                >
                  Nuevo proyecto
                </button>
                <button
                  type="button"
                  onClick={onRestoreSampleProject}
                  className="rounded border border-[#383844] bg-[#232328] px-3.5 py-2 text-xs font-medium text-zinc-200 hover:bg-[#2c2c33]"
                >
                  Cargar ejemplo
                </button>
              </div>
            </div>
          ) : (
            <table className="w-full border-collapse text-left text-xs">
              <thead>
                <tr className="border-b border-[#2b2b33] bg-[#1e1e23] text-zinc-400">
                  <th className="px-4 py-2.5 font-medium">Nombre del proyecto</th>
                  <th className="px-4 py-2.5 font-medium">Resolución</th>
                  <th className="px-4 py-2.5 font-medium">Contenido</th>
                  <th className="px-4 py-2.5 font-medium">Última modificación</th>
                  <th className="px-4 py-2.5 text-right font-medium">Acciones</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#26262d]">
                {projects.map((proj) => {
                  const isRenaming = editingId === proj.id;
                  return (
                    <tr
                      key={proj.id}
                      className="group transition-colors hover:bg-[#222228]"
                    >
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-3">
                          <span
                            className="h-5 w-7 shrink-0 rounded border border-[#3d3d48]"
                            style={{ backgroundColor: proj.backgroundColor }}
                            aria-hidden="true"
                          />
                          {isRenaming ? (
                            <div className="flex items-center gap-1.5">
                              <input
                                type="text"
                                aria-label={`Renombrar ${proj.name}`}
                                value={editingName}
                                onChange={(e) => setEditingName(e.target.value)}
                                onKeyDown={(e) => {
                                  if (e.key === 'Enter') commitRename();
                                  if (e.key === 'Escape') {
                                    setEditingId(null);
                                    setEditingName('');
                                  }
                                }}
                                autoFocus
                                className="rounded border border-blue-500 bg-[#141416] px-2 py-1 text-xs text-zinc-100 focus:outline-none"
                              />
                              <button
                                type="button"
                                aria-label="Confirmar nuevo nombre"
                                onClick={commitRename}
                                className="rounded p-1 text-emerald-400 hover:bg-emerald-500/15"
                              >
                                <Check className="h-3.5 w-3.5" />
                              </button>
                              <button
                                type="button"
                                aria-label="Cancelar renombrado"
                                onClick={() => setEditingId(null)}
                                className="rounded p-1 text-zinc-400 hover:bg-white/10"
                              >
                                <X className="h-3.5 w-3.5" />
                              </button>
                            </div>
                          ) : (
                            <button
                              type="button"
                              onClick={() => onOpenProject(proj.id)}
                              className="text-left font-semibold text-zinc-100 hover:text-blue-400"
                            >
                              {proj.name}
                            </button>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-3 font-mono tabular-nums text-zinc-300">
                        {proj.width} × {proj.height}{' '}
                        <span className="font-sans text-zinc-500">
                          · {proj.orientation === 'horizontal' ? 'Horizontal' : 'Vertical'}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-zinc-400 tabular-nums">
                        {proj.objectCount} {proj.objectCount === 1 ? 'objeto' : 'objetos'} ·{' '}
                        {proj.assetCount} {proj.assetCount === 1 ? 'recurso' : 'recursos'}
                      </td>
                      <td className="px-4 py-3 font-mono tabular-nums text-zinc-400">
                        {formatRelativeDateEs(proj.updatedAt)}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center justify-end gap-1">
                          <button
                            type="button"
                            onClick={() => onOpenProject(proj.id)}
                            className="inline-flex items-center gap-1 rounded bg-blue-600/90 px-2.5 py-1 text-xs font-medium text-white hover:bg-blue-500 whitespace-nowrap"
                          >
                            <FolderOpen className="h-3 w-3" />
                            Abrir
                          </button>
                          <button
                            type="button"
                            onClick={() => startRename(proj)}
                            title="Renombrar proyecto"
                            aria-label={`Renombrar ${proj.name}`}
                            className="rounded p-1.5 text-zinc-400 hover:bg-[#2e2e37] hover:text-zinc-100"
                          >
                            <Edit3 className="h-3.5 w-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={() => onDuplicateProject(proj.id)}
                            title="Duplicar proyecto"
                            aria-label={`Duplicar ${proj.name}`}
                            className="rounded p-1.5 text-zinc-400 hover:bg-[#2e2e37] hover:text-zinc-100"
                          >
                            <Copy className="h-3.5 w-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={() => onExportProjectZip(proj.id)}
                            title="Exportar proyecto (.zip)"
                            aria-label={`Exportar ${proj.name}`}
                            className="rounded p-1.5 text-zinc-400 hover:bg-[#2e2e37] hover:text-zinc-100"
                          >
                            <Download className="h-3.5 w-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={() => setDeleteTarget(proj)}
                            title="Eliminar proyecto"
                            aria-label={`Eliminar ${proj.name}`}
                            className="rounded p-1.5 text-zinc-400 hover:bg-red-500/15 hover:text-red-400"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      </main>

      <NewProjectModal
        open={newModalOpen}
        onClose={() => setNewModalOpen(false)}
        onCreate={(values) => {
          setNewModalOpen(false);
          onCreateProject(values);
        }}
      />

      <ConfirmDialog
        open={deleteTarget !== null}
        title="Eliminar proyecto"
        message={
          deleteTarget
            ? `¿Seguro que deseas eliminar permanentemente el proyecto "${deleteTarget.name}" y todos sus recursos guardados localmente? Esta acción no se puede deshacer.`
            : ''
        }
        confirmLabel="Eliminar"
        cancelLabel="Cancelar"
        danger
        onConfirm={() => {
          if (deleteTarget) onDeleteProject(deleteTarget.id);
          setDeleteTarget(null);
        }}
        onCancel={() => setDeleteTarget(null)}
      />
    </div>
  );
};
