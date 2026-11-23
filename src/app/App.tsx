import React, { useCallback, useEffect, useState } from 'react';
import { ToastBanner, type ToastMessage } from '../components/common/ToastBanner';
import { EditorWorkspace } from '../components/editor/EditorWorkspace';
import { ExportModal } from '../components/export/ExportModal';
import type { NewProjectFormValues } from '../components/project-manager/NewProjectModal';
import { ProjectManager } from '../components/project-manager/ProjectManager';
import { compileProjectToHtml5Zip } from '../export/html5/html5Compiler';
import type { Html5CompileOptions } from '../export/html5/portalSdks';
import { exportProjectToZip, triggerBlobDownload } from '../export/zipExporter';
import { importProjectFromZip } from '../export/zipImporter';
import type {
  NexusProject,
  NexusProjectSummary,
} from '../project/models/project';
import { createSampleProject } from '../project/sample/sampleProject';
import { buildProjectFromTemplate } from '../project/templates/projectTemplates';
import { nexusStorage } from '../storage/indexeddb/nexusDb';
import { createId } from '../utils/id';

export function App() {
  const [projects, setProjects] = useState<NexusProjectSummary[]>([]);
  const [loadingList, setLoadingList] = useState(true);
  const [activeProject, setActiveProject] = useState<NexusProject | null>(null);
  const [activeBlobs, setActiveBlobs] = useState<Map<string, Blob>>(new Map());
  const [exportTarget, setExportTarget] = useState<{
    project: NexusProject;
    blobs: Map<string, Blob>;
  } | null>(null);
  const [isCompilingHtml5, setIsCompilingHtml5] = useState(false);
  const [toasts, setToasts] = useState<ToastMessage[]>([]);

  const notify = useCallback((type: 'info' | 'success' | 'error', text: string) => {
    const id = createId('toast');
    setToasts((prev) => [...prev, { id, type, text }]);
    window.setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 5000);
  }, []);

  const dismissToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const refreshProjectsList = useCallback(async () => {
    const list = await nexusStorage.listProjects();
    setProjects(list);
    return list;
  }, []);

  const openProjectById = useCallback(
    async (projectId: string) => {
      try {
        const proj = await nexusStorage.getProject(projectId);
        if (!proj) {
          notify('error', 'El proyecto solicitado no existe en el almacenamiento local.');
          return;
        }
        const blobs = await nexusStorage.getProjectAssetsMap(projectId);
        setActiveBlobs(blobs);
        setActiveProject(proj);
        try {
          window.localStorage.setItem('nexus_last_open_project_id', projectId);
        } catch {}
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Error al abrir el proyecto.';
        notify('error', msg);
      }
    },
    [notify]
  );

  // Carga inicial desde IndexedDB y creación automática del proyecto de ejemplo la primera vez
  useEffect(() => {
    let cancelled = false;

    const bootstrap = async () => {
      try {
        let list = await nexusStorage.listProjects();
        if (list.length === 0) {
          const sample = await createSampleProject();
          await nexusStorage.saveImportedProject(sample.project, sample.assetBlobs);
          list = await nexusStorage.listProjects();
        }
        if (cancelled) return;
        setProjects(list);
        setLoadingList(false);

        const params = new URLSearchParams(window.location.search);
        let rememberedId: string | null = null;
        try {
          rememberedId = window.localStorage.getItem('nexus_last_open_project_id');
        } catch {}
        if (rememberedId && list.some((p) => p.id === rememberedId)) {
          await openProjectById(rememberedId);
        } else if (params.get('autostart') === '1' && list.length > 0) {
          await openProjectById(list[0].id);
        }
      } catch (err) {
        if (cancelled) return;
        setLoadingList(false);
        const msg =
          err instanceof Error
            ? err.message
            : 'No se pudo inicializar el almacenamiento local.';
        notify('error', msg);
      }
    };

    void bootstrap();
    return () => {
      cancelled = true;
    };
  }, [notify, openProjectById]);

  const handleCreateProject = async (values: NewProjectFormValues) => {
    try {
      const newProject = buildProjectFromTemplate(values);
      const saved = await nexusStorage.saveProject(newProject);
      await refreshProjectsList();
      setActiveBlobs(new Map());
      setActiveProject(saved);
      try {
        window.localStorage.setItem('nexus_last_open_project_id', saved.id);
      } catch {}
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Error al crear el proyecto.';
      notify('error', msg);
    }
  };

  const handleDuplicateProject = async (projectId: string) => {
    try {
      const copy = await nexusStorage.duplicateProject(projectId);
      if (!copy) return;
      await refreshProjectsList();
      notify('success', `Proyecto duplicado como "${copy.name}".`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Error al duplicar.';
      notify('error', msg);
    }
  };

  const handleRenameProject = async (projectId: string, newName: string) => {
    try {
      await nexusStorage.renameProject(projectId, newName);
      await refreshProjectsList();
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Error al renombrar.';
      notify('error', msg);
    }
  };

  const handleDeleteProject = async (projectId: string) => {
    try {
      await nexusStorage.deleteProject(projectId);
      await refreshProjectsList();
      notify('info', 'Proyecto eliminado del almacenamiento local.');
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Error al eliminar el proyecto.';
      notify('error', msg);
    }
  };

  const handleOpenExportModal = async (projectId: string) => {
    try {
      const proj = await nexusStorage.getProject(projectId);
      if (!proj) {
        notify('error', 'No se encontró el proyecto para exportar.');
        return;
      }
      const blobs = await nexusStorage.getProjectAssetsMap(projectId);
      setExportTarget({ project: proj, blobs });
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Error al preparar exportación.';
      notify('error', msg);
    }
  };

  const handleCompileHtml5FromManager = async (options: Html5CompileOptions) => {
    if (!exportTarget) return;
    setIsCompilingHtml5(true);
    try {
      const compiled = await compileProjectToHtml5Zip(
        exportTarget.project,
        exportTarget.blobs,
        options
      );
      triggerBlobDownload(compiled.blob, compiled.filename);
      notify(
        'success',
        `Juego HTML5 compilado y descargado (${compiled.filename}) con ${compiled.filesIncluded.length} archivos.`
      );
      setExportTarget(null);
    } catch (err) {
      const msg =
        err instanceof Error ? err.message : 'Error al compilar el paquete HTML5.';
      notify('error', msg);
    } finally {
      setIsCompilingHtml5(false);
    }
  };

  const handleExportEditableFromManager = async () => {
    if (!exportTarget) return;
    try {
      const { blob, filename } = await exportProjectToZip(
        exportTarget.project,
        exportTarget.blobs
      );
      triggerBlobDownload(blob, filename);
      notify('success', `Proyecto editable exportado como "${filename}".`);
      setExportTarget(null);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Error al exportar ZIP.';
      notify('error', msg);
    }
  };

  const handleImportProjectZip = async (file: File) => {
    try {
      const existingIds = new Set(projects.map((p) => p.id));
      const { project, assetBlobs } = await importProjectFromZip(file, existingIds);
      await nexusStorage.saveImportedProject(project, assetBlobs);
      await refreshProjectsList();
      notify('success', `Proyecto "${project.name}" importado correctamente.`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Archivo ZIP inválido o dañado.';
      notify('error', msg);
    }
  };

  const handleRestoreSampleProject = async () => {
    try {
      const sample = await createSampleProject();
      await nexusStorage.saveImportedProject(sample.project, sample.assetBlobs);
      await refreshProjectsList();
      notify('success', 'Proyecto de ejemplo creado.');
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Error al crear proyecto de ejemplo.';
      notify('error', msg);
    }
  };

  return (
    <div className="h-screen w-screen overflow-hidden">
      {activeProject ? (
        <EditorWorkspace
          key={activeProject.id}
          initialProject={activeProject}
          initialAssetBlobs={activeBlobs}
          onBackToProjects={async () => {
            try {
              window.localStorage.removeItem('nexus_last_open_project_id');
            } catch {}
            setActiveProject(null);
            setActiveBlobs(new Map());
            await refreshProjectsList();
          }}
          onNotify={notify}
        />
      ) : (
        <ProjectManager
          projects={projects}
          loading={loadingList}
          onOpenProject={(id) => void openProjectById(id)}
          onCreateProject={(values) => void handleCreateProject(values)}
          onDuplicateProject={(id) => void handleDuplicateProject(id)}
          onRenameProject={(id, name) => void handleRenameProject(id, name)}
          onDeleteProject={(id) => void handleDeleteProject(id)}
          onExportProjectZip={(id) => void handleOpenExportModal(id)}
          onImportProjectZip={(file) => void handleImportProjectZip(file)}
          onRestoreSampleProject={() => void handleRestoreSampleProject()}
        />
      )}

      <ExportModal
        open={Boolean(exportTarget)}
        projectName={exportTarget?.project.name ?? ''}
        compiling={isCompilingHtml5}
        onClose={() => setExportTarget(null)}
        onCompileHtml5={(options) => void handleCompileHtml5FromManager(options)}
        onExportEditableZip={() => void handleExportEditableFromManager()}
      />

      <ToastBanner messages={toasts} onDismiss={dismissToast} />
    </div>
  );
}

export default App;
