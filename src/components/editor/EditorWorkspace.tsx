import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { SlidersHorizontal, Sparkles } from 'lucide-react';
import { importImageFiles } from '../../assets/importer/assetImporter';
import type { MechanicCatalogEntry } from '../../assistant/catalog/mechanicsCatalog';
import {
  analyzeProjectDiagnostics,
  type EngineDiagnostic,
} from '../../assistant/diagnostics/diagnosticAnalyzer';
import {
  duplicateObjectsByIds,
  groupObjectsInFolder,
  moveSiblingOrder,
  removeObjectsByIds,
  reparentObject,
  ungroupFolder,
  updateObjectById,
} from '../../engine/core/sceneGraph';
import type {
  AudioBusSettings,
  CameraState,
  DataTableDef,
  DialogueGraph,
  EditorTool,
  GameMechanic,
  GameObjectData,
  GameObjectType,
  I18nConfig,
  ProjectSaveSlot,
  ProjectVariable,
  SceneData,
  SceneKind,
} from '../../engine/core/types';
import { createGameObject } from '../../engine/objects/factory';
import { extractScriptParamsSchema } from '../../engine/scripting/scriptRuntime';
import { compileProjectToHtml5Zip } from '../../export/html5/html5Compiler';
import type { Html5CompileOptions } from '../../export/html5/portalSdks';
import { exportProjectToZip, triggerBlobDownload } from '../../export/zipExporter';
import {
  canRedo,
  canUndo,
  createHistoryState,
  pushHistory,
  redoHistory,
  undoHistory,
  type HistoryState,
} from '../../history/historyManager';
import type {
  CommandBarHistoryEntry,
  NexusProject,
  NexusScriptAsset,
  PrefabDefinition,
  ProjectAssetMeta,
  ProjectFolder,
  ProjectSettings,
} from '../../project/models/project';
import { useAutosave, type SaveStatus } from '../../storage/autosave/useAutosave';
import { nexusStorage } from '../../storage/indexeddb/nexusDb';
import { createId } from '../../utils/id';
import { AssistantPanel } from '../assistant/AssistantPanel';
import { HelpModal } from '../common/HelpModal';
import { BottomDock, type DockTab } from '../dock/BottomDock';
import { ExportModal } from '../export/ExportModal';
import { InspectorPanel } from '../inspector/InspectorPanel';
import { LeftSidebar } from '../panels/LeftSidebar';
import { PreviewModal } from '../preview/PreviewModal';
import { ThreeStageViewport } from '../three3d/ThreeStageViewport';
import { VehicleBuilderModal } from '../three3d/VehicleBuilderModal';
import { ProjectSettingsModal } from '../toolbar/ProjectSettingsModal';
import { TopToolbar } from '../toolbar/TopToolbar';
import { BottomStatusBar } from './BottomStatusBar';
import { CanvasViewport } from './CanvasViewport';
import { SceneTabsBar } from './SceneTabsBar';

interface EditorWorkspaceProps {
  initialProject: NexusProject;
  initialAssetBlobs: Map<string, Blob>;
  onBackToProjects: () => void;
  onNotify: (type: 'info' | 'success' | 'error', text: string) => void;
}

type RightTab = 'inspector' | 'assistant';

function isEditableTarget(target: EventTarget | null): boolean {
  const active =
    typeof document !== 'undefined' ? (document.activeElement as HTMLElement | null) : null;
  const candidates = [target as HTMLElement | null, active];
  for (const el of candidates) {
    if (!el || typeof el.tagName !== 'string') continue;
    if (
      el.tagName === 'INPUT' ||
      el.tagName === 'TEXTAREA' ||
      el.tagName === 'SELECT' ||
      el.isContentEditable ||
      Boolean(el.closest?.('input, textarea, select, [contenteditable="true"], [role="dialog"]'))
    ) {
      return true;
    }
  }
  return false;
}

export const EditorWorkspace: React.FC<EditorWorkspaceProps> = ({
  initialProject,
  initialAssetBlobs,
  onBackToProjects,
  onNotify,
}) => {
  const [history, setHistory] = useState<HistoryState<NexusProject>>(() =>
    createHistoryState(initialProject)
  );
  // Estado transitorio durante arrastre fluido en el lienzo sin inundar el historial
  const [transientProject, setTransientProject] = useState<NexusProject | null>(null);
  const [assetBlobs, setAssetBlobs] = useState<Map<string, Blob>>(
    () => new Map(initialAssetBlobs)
  );
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [activeTool, setActiveTool] = useState<EditorTool>('select');
  const [camera, setCamera] = useState<CameraState>({ x: 40, y: 40, zoom: 0.75 });
  const [fitRequestTick, setFitRequestTick] = useState(0);
  const [pointerCoords, setPointerCoords] = useState<{ x: number; y: number } | null>(null);

  const [rightTab, setRightTab] = useState<RightTab>('inspector');
  const [dockOpen, setDockOpen] = useState(false);
  const [dockTab, setDockTab] = useState<DockTab>('mechanics');

  const [isDirty, setIsDirty] = useState(false);
  const [saveStatus, setSaveStatus] = useState<SaveStatus>('saved');
  const [lastSavedAt, setLastSavedAt] = useState<number | null>(initialProject.updatedAt);

  const [isPreviewOpen, setIsPreviewOpen] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isExportOpen, setIsExportOpen] = useState(false);
  const [isHelpOpen, setIsHelpOpen] = useState(false);
  const [isVehicleWizardOpen, setIsVehicleWizardOpen] = useState(false);
  const [isCompilingHtml5, setIsCompilingHtml5] = useState(false);

  const project = transientProject ?? history.present;
  const activeScene = useMemo(
    () =>
      project.scenes.find((s) => s.id === project.activeSceneId) ?? project.scenes[0],
    [project]
  );

  const selectedObjects = useMemo(() => {
    const set = new Set(selectedIds);
    return activeScene.objects.filter((o) => set.has(o.id));
  }, [activeScene.objects, selectedIds]);

  const diagnostics = useMemo(
    () => analyzeProjectDiagnostics(project, activeScene, project.assets),
    [project, activeScene]
  );

  const stage = useMemo(
    () => ({
      width: project.settings.width,
      height: project.settings.height,
    }),
    [project.settings.width, project.settings.height]
  );

  // Ref para evitar closures obsoletas en atajos de teclado
  const actionsRef = useRef({
    project,
    activeScene,
    selectedIds,
    history,
    isPreviewOpen,
    isExportOpen,
  });
  actionsRef.current = {
    project,
    activeScene,
    selectedIds,
    history,
    isPreviewOpen,
    isExportOpen,
  };

  const commitProjectChange = useCallback((nextProject: NexusProject) => {
    setTransientProject(null);
    setHistory((prev) => pushHistory(prev, nextProject));
    setIsDirty(true);
    setSaveStatus('dirty');
  }, []);

  const updateActiveSceneCommitted = useCallback(
    (updater: (scene: SceneData) => SceneData) => {
      const current = actionsRef.current.history.present;
      const nextScenes = current.scenes.map((s) =>
        s.id === current.activeSceneId ? updater(s) : s
      );
      commitProjectChange({
        ...current,
        scenes: nextScenes,
      });
    },
    [commitProjectChange]
  );

  const handleManualSave = useCallback(async () => {
    const current = actionsRef.current.project;
    setSaveStatus('saving');
    try {
      const saved = await nexusStorage.saveProject(current);
      setIsDirty(false);
      setSaveStatus('saved');
      setLastSavedAt(saved.updatedAt);
      onNotify('success', 'Proyecto guardado localmente en IndexedDB.');
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Error desconocido al guardar.';
      setSaveStatus('error');
      onNotify('error', `No se pudo guardar el proyecto: ${msg}`);
    }
  }, [onNotify]);

  const handleAutosaveStatus = useCallback(
    (status: SaveStatus, savedAt?: number, errorMsg?: string) => {
      setSaveStatus(status);
      if (status === 'saved') {
        setIsDirty(false);
        if (savedAt) setLastSavedAt(savedAt);
      } else if (status === 'error' && errorMsg) {
        onNotify('error', `Error en autoguardado: ${errorMsg}`);
      }
    },
    [onNotify]
  );

  useAutosave(
    history.present,
    isDirty,
    !transientProject && !isPreviewOpen,
    handleAutosaveStatus
  );

  const handleUndo = useCallback(() => {
    setTransientProject(null);
    setHistory((prev) => {
      if (!canUndo(prev)) return prev;
      const next = undoHistory(prev);
      const restoredScene =
        next.present.scenes.find((s) => s.id === next.present.activeSceneId) ??
        next.present.scenes[0];
      const validIds = new Set(restoredScene.objects.map((o) => o.id));
      setSelectedIds((sel) => sel.filter((id) => validIds.has(id)));
      setIsDirty(true);
      setSaveStatus('dirty');
      return next;
    });
  }, []);

  const handleRedo = useCallback(() => {
    setTransientProject(null);
    setHistory((prev) => {
      if (!canRedo(prev)) return prev;
      const next = redoHistory(prev);
      const restoredScene =
        next.present.scenes.find((s) => s.id === next.present.activeSceneId) ??
        next.present.scenes[0];
      const validIds = new Set(restoredScene.objects.map((o) => o.id));
      setSelectedIds((sel) => sel.filter((id) => validIds.has(id)));
      setIsDirty(true);
      setSaveStatus('dirty');
      return next;
    });
  }, []);

  const handleCreateObject = useCallback(
    (type: GameObjectType) => {
      const { activeScene: scene, project: proj } = actionsRef.current;
      const firstImg = proj.assets.find((a) => (a.kind ?? 'image') === 'image');
      const firstGlb = proj.assets.find((a) => a.kind === 'model3d');
      const defaultAssetId = type === 'sprite' && firstImg ? firstImg.id : null;
      const assetMeta = defaultAssetId ? firstImg : undefined;

      const created = createGameObject(type, scene.objects, {
        x: Math.round(proj.settings.width / 2),
        y: Math.round(proj.settings.height / 2),
        width: assetMeta?.width,
        height: assetMeta?.height,
        assetId: defaultAssetId,
      });

      if (type === 'mesh_3d' && created.mesh3d && firstGlb && !created.mesh3d.glbAssetId) {
        // Solo asigna GLB si no se eligió una forma modular explícita; el creador estándar crea una caja lista.
      }

      updateActiveSceneCommitted((s) => ({
        ...s,
        objects: [...s.objects, created],
      }));
      setSelectedIds([created.id]);
    },
    [updateActiveSceneCommitted]
  );

  const handleDuplicateSelected = useCallback(
    (explicitId?: string) => {
      const { activeScene: scene, selectedIds: sel } = actionsRef.current;
      const targetIds = explicitId ? [explicitId] : sel;
      if (targetIds.length === 0) return;

      const { objects: nextObjects, duplicatedIds } = duplicateObjectsByIds(
        scene.objects,
        targetIds
      );
      if (duplicatedIds.length === 0) return;

      updateActiveSceneCommitted((s) => ({ ...s, objects: nextObjects }));
      setSelectedIds(duplicatedIds);
    },
    [updateActiveSceneCommitted]
  );

  const handleDeleteSelected = useCallback(
    (explicitId?: string) => {
      const { activeScene: scene, selectedIds: sel } = actionsRef.current;
      const targetIds = explicitId ? [explicitId] : sel;
      if (targetIds.length === 0) return;

      const nextObjects = removeObjectsByIds(scene.objects, targetIds);
      const remainingSet = new Set(nextObjects.map((o) => o.id));
      updateActiveSceneCommitted((s) => ({ ...s, objects: nextObjects }));
      setSelectedIds((prev) => prev.filter((id) => remainingSet.has(id)));
    },
    [updateActiveSceneCommitted]
  );

  const handleSelectAll = useCallback(() => {
    const ids = actionsRef.current.activeScene.objects.map((o) => o.id);
    setSelectedIds(ids);
  }, []);

  // Atajos globales del editor (deshabilitados al escribir en inputs)
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (actionsRef.current.isPreviewOpen || actionsRef.current.isExportOpen) return;
      if (isEditableTarget(e.target)) return;

      const mod = e.ctrlKey || e.metaKey;

      if (mod && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        if (e.shiftKey) handleRedo();
        else handleUndo();
        return;
      }

      if (mod && e.key.toLowerCase() === 'y') {
        e.preventDefault();
        handleRedo();
        return;
      }

      if (mod && e.key.toLowerCase() === 's') {
        e.preventDefault();
        void handleManualSave();
        return;
      }

      if (mod && e.key.toLowerCase() === 'd') {
        e.preventDefault();
        handleDuplicateSelected();
        return;
      }

      if (mod && e.key.toLowerCase() === 'a') {
        e.preventDefault();
        handleSelectAll();
        return;
      }

      if (e.key === 'Delete' || e.key === 'Backspace') {
        if (actionsRef.current.selectedIds.length > 0) {
          e.preventDefault();
          handleDeleteSelected();
        }
        return;
      }

      if (!mod) {
        const lower = e.key.toLowerCase();
        if (lower === 'v') setActiveTool('select');
        else if (lower === 'w') setActiveTool('move');
        else if (lower === 's') setActiveTool('scale');
        else if (lower === 'e') setActiveTool('rotate');
        else if (lower === 'h') setActiveTool('pan');
        else if (lower === 'b') setActiveTool('tilebrush');
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [
    handleUndo,
    handleRedo,
    handleManualSave,
    handleDuplicateSelected,
    handleDeleteSelected,
    handleSelectAll,
  ]);

  // Gestión de recursos (importar imágenes/audio, añadir sprite, eliminar, limpiar)
  const handleImportFiles = useCallback(
    async (files: File[]): Promise<ProjectAssetMeta[]> => {
      const { imported, errors } = await importImageFiles(files);
      if (errors.length > 0) {
        onNotify('error', errors.join('\n'));
      }
      if (imported.length === 0) return [];

      const currentProj = actionsRef.current.history.present;
      try {
        for (const item of imported) {
          await nexusStorage.saveAssetBlob(
            currentProj.id,
            item.meta.id,
            item.blob,
            item.meta.mimeType
          );
        }

        setAssetBlobs((prev) => {
          const next = new Map(prev);
          for (const item of imported) {
            next.set(item.meta.id, item.blob);
          }
          return next;
        });

        const nextProject: NexusProject = {
          ...currentProj,
          assets: [...currentProj.assets, ...imported.map((i) => i.meta)],
        };
        commitProjectChange(nextProject);
        await nexusStorage.saveProject(nextProject);
        setIsDirty(false);
        setSaveStatus('saved');

        onNotify(
          'success',
          `${imported.length} ${imported.length === 1 ? 'recurso importado' : 'recursos importados'} correctamente.`
        );
        return imported.map((i) => i.meta);
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Error al guardar recursos';
        onNotify('error', msg);
        return [];
      }
    },
    [commitProjectChange, onNotify]
  );

  const handleCreateGeneratedAsset = useCallback(
    async (meta: ProjectAssetMeta, blob: Blob) => {
      const currentProj = actionsRef.current.history.present;
      try {
        await nexusStorage.saveAssetBlob(currentProj.id, meta.id, blob, meta.mimeType);
        setAssetBlobs((prev) => {
          const next = new Map(prev);
          next.set(meta.id, blob);
          return next;
        });
        const nextProject: NexusProject = {
          ...currentProj,
          assets: [...currentProj.assets, meta],
        };
        commitProjectChange(nextProject);
        await nexusStorage.saveProject(nextProject);
        setIsDirty(false);
        setSaveStatus('saved');
        const kindLabel = meta.kind === 'audio' ? 'Audio' : meta.kind === 'image' ? 'Textura' : 'Recurso';
        onNotify('success', `${kindLabel} "${meta.filename}" generado y guardado en Recursos.`);
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Error al guardar el archivo generado';
        onNotify('error', msg);
      }
    },
    [commitProjectChange, onNotify]
  );

  const handleAddSpriteAt = useCallback(
    (assetId: string, stageX?: number, stageY?: number) => {
      const currentProj = actionsRef.current.history.present;
      const scene =
        currentProj.scenes.find((s) => s.id === currentProj.activeSceneId) ??
        currentProj.scenes[0];
      const asset = currentProj.assets.find((a) => a.id === assetId);
      if (!asset || asset.kind === 'audio') return;

      if (asset.kind === 'model3d') {
        const modelObj = createGameObject('mesh_3d', scene.objects, {
          name: asset.name,
        });
        modelObj.mesh3d = {
          shape: 'glb',
          color: '#ffffff',
          metalness: 0.1,
          roughness: 0.7,
          castShadow: true,
          receiveShadow: true,
          glbAssetId: asset.id,
        };
        modelObj.transform3d = {
          x: 0,
          y: 0.5,
          z: 0,
          rx: 0,
          ry: 0,
          rz: 0,
          sx: 1,
          sy: 1,
          sz: 1,
        };
        updateActiveSceneCommitted((s) => ({
          ...s,
          objects: [...s.objects, modelObj],
        }));
        setSelectedIds([modelObj.id]);
        return;
      }

      const sprite = createGameObject('sprite', scene.objects, {
        name: asset.name,
        x: stageX ?? Math.round(currentProj.settings.width / 2),
        y: stageY ?? Math.round(currentProj.settings.height / 2),
        width: asset.width,
        height: asset.height,
        assetId: asset.id,
      });

      updateActiveSceneCommitted((s) => ({
        ...s,
        objects: [...s.objects, sprite],
      }));
      setSelectedIds([sprite.id]);
    },
    [updateActiveSceneCommitted]
  );

  const handleAssignAssetToSelected = useCallback(
    (assetId: string) => {
      const currentProj = actionsRef.current.history.present;
      const asset = currentProj.assets.find((a) => a.id === assetId);
      if (!asset || selectedIds.length !== 1) return;
      const targetId = selectedIds[0];

      updateActiveSceneCommitted((s) => ({
        ...s,
        objects: updateObjectById(s.objects, targetId, (prev) => {
          if (asset.kind === 'model3d') {
            if (prev.type === 'mesh_3d') {
              return {
                ...prev,
                mesh3d: {
                  ...(prev.mesh3d ?? {
                    shape: 'glb',
                    color: '#ffffff',
                    metalness: 0.15,
                    roughness: 0.65,
                    castShadow: true,
                    receiveShadow: true,
                  }),
                  shape: 'glb',
                  glbAssetId: asset.id,
                  clipNames: undefined,
                },
              };
            }
            if (prev.type === 'container' || prev.type === 'sprite') {
              const had2dPlayer = prev.components.some(
                (c) => c.enabled && (c.type === 'player_platformer' || c.type === 'player_topdown')
              );
              const has3dPlayer = prev.components.some((c) => c.type === 'player_3d');
              const nextComponents =
                had2dPlayer && !has3dPlayer
                  ? [
                      ...prev.components,
                      {
                        id: createId('cmp'),
                        type: 'player_3d',
                        enabled: true,
                        config: { speed: 6.5, jumpForce: 8.5, jumpSoundAssetId: '' },
                      },
                    ]
                  : prev.components;
              const isMovable =
                nextComponents.some(
                  (c) =>
                    c.enabled &&
                    (c.type === 'player_3d' ||
                      c.type === 'chase_player' ||
                      c.type === 'ai.enemy_chaser')
                ) || Boolean(prev.aiAgent?.enabled);
              return {
                ...prev,
                type: 'mesh_3d',
                transform3d: prev.transform3d ?? {
                  x: 0,
                  y: 0.5,
                  z: 0,
                  rx: 0,
                  ry: 0,
                  rz: 0,
                  sx: 1,
                  sy: 1,
                  sz: 1,
                },
                mesh3d: {
                  shape: 'glb',
                  color: '#ffffff',
                  metalness: 0.15,
                  roughness: 0.65,
                  castShadow: true,
                  receiveShadow: true,
                  glbAssetId: asset.id,
                },
                physics3d: prev.physics3d ?? {
                  enabled: true,
                  bodyType: isMovable && !prev.parentId ? 'dynamic' : 'static',
                  shape: has3dPlayer || had2dPlayer ? 'capsule' : 'box',
                  mass: 1,
                  gravityScale: 1,
                  restitution: 0.1,
                  friction: 0.6,
                },
                components: nextComponents,
              };
            }
          }
          if ((asset.kind ?? 'image') === 'image') {
            if (prev.type === 'sprite' && prev.sprite) {
              return {
                ...prev,
                sprite: { ...prev.sprite, assetId: asset.id },
              };
            }
            if (prev.type === 'mesh_3d' && prev.mesh3d) {
              return {
                ...prev,
                mesh3d: { ...prev.mesh3d, textureAssetId: asset.id },
              };
            }
          }
          return prev;
        }),
      }));
      onNotify(
        'success',
        `Recurso "${asset.name}" asignado manteniendo posición, jerarquía y mecánicas.`
      );
    },
    [selectedIds, updateActiveSceneCommitted, onNotify]
  );

  const handleDeleteAsset = useCallback(
    async (assetId: string) => {
      const currentProj = actionsRef.current.history.present;
      await nexusStorage.deleteAssetBlob(currentProj.id, assetId);
      setAssetBlobs((prev) => {
        const next = new Map(prev);
        next.delete(assetId);
        return next;
      });
      commitProjectChange({
        ...currentProj,
        assets: currentProj.assets.filter((a) => a.id !== assetId),
      });
    },
    [commitProjectChange]
  );

  const handlePurgeUnusedAssets = useCallback(
    async (unusedIds: string[]) => {
      if (unusedIds.length === 0) return;
      const currentProj = actionsRef.current.history.present;
      for (const id of unusedIds) {
        await nexusStorage.deleteAssetBlob(currentProj.id, id);
      }
      const removeSet = new Set(unusedIds);
      setAssetBlobs((prev) => {
        const next = new Map(prev);
        unusedIds.forEach((id) => next.delete(id));
        return next;
      });
      commitProjectChange({
        ...currentProj,
        assets: currentProj.assets.filter((a) => !removeSet.has(a.id)),
      });
      onNotify('info', `Se eliminaron ${unusedIds.length} recursos sin uso.`);
    },
    [commitProjectChange, onNotify]
  );

  const handleApplyCatalogEntry = useCallback(
    (entry: MechanicCatalogEntry, targetObjectId: string | null) => {
      const currentProj = actionsRef.current.history.present;
      const scene =
        currentProj.scenes.find((s) => s.id === currentProj.activeSceneId) ??
        currentProj.scenes[0];
      const targetObj = targetObjectId
        ? scene.objects.find((o) => o.id === targetObjectId) ?? null
        : selectedObjects[0] ?? null;

      const patch = entry.buildApplyPatch(
        targetObj,
        scene,
        currentProj.variables ?? []
      );
      if (!patch) {
        onNotify(
          'info',
          'Selecciona primero un objeto compatible en el escenario para aplicar esta mecánica.'
        );
        return;
      }

      const nextScenes = currentProj.scenes.map((s) => {
        if (s.id !== scene.id) return s;
        return {
          ...s,
          objects: patch.updatedObject
            ? s.objects.map((o) =>
                o.id === patch.updatedObject!.id ? patch.updatedObject! : o
              )
            : s.objects,
          mechanics: patch.addedMechanic
            ? [...(s.mechanics ?? []), patch.addedMechanic]
            : s.mechanics,
        };
      });

      const nextVariables = patch.addedVariable
        ? [...(currentProj.variables ?? []), patch.addedVariable]
        : currentProj.variables;

      commitProjectChange({
        ...currentProj,
        scenes: nextScenes,
        variables: nextVariables,
      });

      if (patch.addedMechanic) {
        setDockOpen(true);
        setDockTab('mechanics');
      }
      onNotify('success', patch.summary);
    },
    [commitProjectChange, onNotify, selectedObjects]
  );

  const handleApplyDiagnosticFix = useCallback(
    (diag: EngineDiagnostic) => {
      if (!diag.fix) return;
      const currentProj = actionsRef.current.history.present;
      const fixedProj = diag.fix.apply(currentProj);
      commitProjectChange(fixedProj);
      onNotify('success', `Corrección aplicada: ${diag.fix.label}`);
    },
    [commitProjectChange, onNotify]
  );

  const handleExportZip = useCallback(async () => {
    try {
      const { blob, filename } = await exportProjectToZip(
        actionsRef.current.project,
        assetBlobs
      );
      triggerBlobDownload(blob, filename);
      onNotify('success', `Proyecto editable exportado como "${filename}".`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'No se pudo exportar el ZIP.';
      onNotify('error', msg);
    }
  }, [assetBlobs, onNotify]);

  const handleCompileHtml5 = useCallback(
    async (options: Html5CompileOptions) => {
      setIsCompilingHtml5(true);
      try {
        const compiled = await compileProjectToHtml5Zip(
          actionsRef.current.project,
          assetBlobs,
          options
        );
        triggerBlobDownload(compiled.blob, compiled.filename);
        onNotify(
          'success',
          `Juego HTML5 compilado y descargado (${compiled.filename}) con ${compiled.filesIncluded.length} archivos.`
        );
        setIsExportOpen(false);
      } catch (err) {
        const msg =
          err instanceof Error ? err.message : 'No se pudo compilar el paquete HTML5.';
        onNotify('error', msg);
      } finally {
        setIsCompilingHtml5(false);
      }
    },
    [assetBlobs, onNotify]
  );

  const handleSaveProjectSettings = useCallback(
    (name: string, settings: ProjectSettings) => {
      const current = actionsRef.current.history.present;
      const nextScenes = current.scenes.map((s) =>
        s.id === current.activeSceneId
          ? { ...s, backgroundColor: settings.backgroundColor }
          : s
      );
      commitProjectChange({
        ...current,
        name,
        settings,
        scenes: nextScenes,
      });
      setFitRequestTick((t) => t + 1);
    },
    [commitProjectChange]
  );

  // Gestión multi-escena (crear, cambiar, duplicar, eliminar, marcar inicial)
  const handleSelectScene = useCallback(
    (sceneId: string) => {
      const current = actionsRef.current.history.present;
      if (current.activeSceneId === sceneId) return;
      commitProjectChange({ ...current, activeSceneId: sceneId });
      setSelectedIds([]);
    },
    [commitProjectChange]
  );

  const handleCreateScene = useCallback(
    (name: string, kind: SceneKind) => {
      const current = actionsRef.current.history.present;
      const newScene: SceneData = {
        id: createId('scene'),
        name,
        kind,
        backgroundColor: current.settings.backgroundColor,
        gridVisible: kind !== 'main_menu' && kind !== 'pause',
        gridSize: 32,
        snapToGrid: false,
        objects: [],
        mechanics: [],
      };
      commitProjectChange({
        ...current,
        activeSceneId: newScene.id,
        scenes: [...current.scenes, newScene],
      });
      setSelectedIds([]);
    },
    [commitProjectChange]
  );

  const handleDuplicateScene = useCallback(
    (sceneId: string) => {
      const current = actionsRef.current.history.present;
      const source = current.scenes.find((s) => s.id === sceneId);
      if (!source) return;
      const copy: SceneData = structuredClone(source);
      copy.id = createId('scene');
      copy.name = `${source.name}_copia`;
      commitProjectChange({
        ...current,
        activeSceneId: copy.id,
        scenes: [...current.scenes, copy],
      });
      setSelectedIds([]);
    },
    [commitProjectChange]
  );

  const handleDeleteScene = useCallback(
    (sceneId: string) => {
      const current = actionsRef.current.history.present;
      if (current.scenes.length <= 1) return;
      const remaining = current.scenes.filter((s) => s.id !== sceneId);
      const nextActive =
        current.activeSceneId === sceneId ? remaining[0].id : current.activeSceneId;
      const nextInitial =
        current.initialSceneId === sceneId ? remaining[0].id : current.initialSceneId;
      commitProjectChange({
        ...current,
        activeSceneId: nextActive,
        initialSceneId: nextInitial,
        scenes: remaining,
      });
      setSelectedIds([]);
    },
    [commitProjectChange]
  );

  const handleSetInitialScene = useCallback(
    (sceneId: string) => {
      const current = actionsRef.current.history.present;
      commitProjectChange({ ...current, initialSceneId: sceneId });
      onNotify('success', 'Escena inicial de arranque actualizada.');
    },
    [commitProjectChange, onNotify]
  );

  const handleRenameScene = useCallback(
    (sceneId: string, nextName: string) => {
      const trimmed = nextName.trim();
      if (!trimmed) return;
      const current = actionsRef.current.history.present;
      const target = current.scenes.find((s) => s.id === sceneId);
      if (!target || target.name === trimmed) return;
      commitProjectChange({
        ...current,
        scenes: current.scenes.map((s) => (s.id === sceneId ? { ...s, name: trimmed } : s)),
      });
    },
    [commitProjectChange]
  );

  // Carpetas virtuales y Prefabs reutilizables
  const handleCreateFolder = useCallback(
    (name: string) => {
      const current = actionsRef.current.history.present;
      const newFolder: ProjectFolder = {
        id: createId('fld'),
        name,
        parentId: null,
        category: 'assets',
      };
      commitProjectChange({
        ...current,
        folders: [...(current.folders ?? []), newFolder],
      });
    },
    [commitProjectChange]
  );

  const handleDeleteFolder = useCallback(
    (folderId: string) => {
      const current = actionsRef.current.history.present;
      commitProjectChange({
        ...current,
        folders: (current.folders ?? []).filter((f) => f.id !== folderId),
        assets: current.assets.map((a) =>
          a.folderId === folderId ? { ...a, folderId: null } : a
        ),
      });
    },
    [commitProjectChange]
  );

  const handleMoveAssetToFolder = useCallback(
    (assetId: string, folderId: string | null) => {
      const current = actionsRef.current.history.present;
      commitProjectChange({
        ...current,
        assets: current.assets.map((a) =>
          a.id === assetId ? { ...a, folderId } : a
        ),
      });
    },
    [commitProjectChange]
  );

  const handleCreatePrefabFromObject = useCallback(
    (objectId: string) => {
      const current = actionsRef.current.history.present;
      const scene =
        current.scenes.find((s) => s.id === current.activeSceneId) ?? current.scenes[0];
      const root = scene.objects.find((o) => o.id === objectId);
      if (!root) return;

      const collectTree = (parentId: string, out: GameObjectData[]) => {
        for (const candidate of scene.objects) {
          if (candidate.parentId === parentId) {
            out.push(structuredClone(candidate));
            collectTree(candidate.id, out);
          }
        }
      };
      const subtree: GameObjectData[] = [structuredClone(root)];
      collectTree(root.id, subtree);

      const pf: PrefabDefinition = {
        id: createId('prefab'),
        name: root.name,
        rootObjectId: root.id,
        objects: subtree,
        createdAt: Date.now(),
      };
      commitProjectChange({
        ...current,
        prefabs: [...(current.prefabs ?? []), pf],
      });
      onNotify('success', `Prefab "${root.name}" guardado en Recursos.`);
    },
    [commitProjectChange, onNotify]
  );

  const handleInstantiatePrefab = useCallback(
    (prefabId: string) => {
      const current = actionsRef.current.history.present;
      const pf = (current.prefabs ?? []).find((p) => p.id === prefabId);
      if (!pf || pf.objects.length === 0) return;

      const idMap = new Map<string, string>();
      for (const o of pf.objects) idMap.set(o.id, createId('obj'));

      const spawned = pf.objects.map((src) => {
        const clone = structuredClone(src);
        clone.id = idMap.get(src.id)!;
        clone.prefabId = pf.id;
        if (clone.parentId && idMap.has(clone.parentId)) {
          clone.parentId = idMap.get(clone.parentId)!;
        } else if (src.id === pf.rootObjectId) {
          clone.parentId = null;
          clone.transform.x = Math.round(current.settings.width / 2);
          clone.transform.y = Math.round(current.settings.height / 2);
        }
        return clone;
      });

      updateActiveSceneCommitted((s) => ({
        ...s,
        objects: [...s.objects, ...spawned],
      }));
      const rootNewId = idMap.get(pf.rootObjectId);
      if (rootNewId) setSelectedIds([rootNewId]);
    },
    [updateActiveSceneCommitted]
  );

  const handleDeletePrefab = useCallback(
    (prefabId: string) => {
      const current = actionsRef.current.history.present;
      commitProjectChange({
        ...current,
        prefabs: (current.prefabs ?? []).filter((p) => p.id !== prefabId),
      });
    },
    [commitProjectChange]
  );

  return (
    <div className="flex h-full w-full flex-col bg-[#141416] text-zinc-100">
      <TopToolbar
        projectName={project.name}
        activeTool={activeTool}
        canUndo={canUndo(history)}
        canRedo={canRedo(history)}
        isPreviewOpen={isPreviewOpen}
        isDirty={isDirty}
        onBackToProjects={async () => {
          if (isDirty) {
            await nexusStorage.saveProject(history.present);
          }
          onBackToProjects();
        }}
        onSelectTool={setActiveTool}
        onUndo={handleUndo}
        onRedo={handleRedo}
        onSave={() => void handleManualSave()}
        onStartPreview={() => setIsPreviewOpen(true)}
        onStopPreview={() => setIsPreviewOpen(false)}
        onOpenSettings={() => setIsSettingsOpen(true)}
        onExportZip={() => setIsExportOpen(true)}
        onFitToStage={() => setFitRequestTick((t) => t + 1)}
        onOpenHelp={() => setIsHelpOpen(true)}
      />

      <div className="flex min-h-0 flex-1 overflow-hidden">
        <LeftSidebar
          projectMode={project.mode ?? '2d'}
          objects={activeScene.objects}
          selectedIds={selectedIds}
          assets={project.assets}
          assetBlobs={assetBlobs}
          scenes={project.scenes}
          folders={project.folders}
          prefabs={project.prefabs}
          onSelectObjects={setSelectedIds}
          onCreateObject={handleCreateObject}
          onRenameObject={(id, name) =>
            updateActiveSceneCommitted((s) => ({
              ...s,
              objects: updateObjectById(s.objects, id, (o) => ({ ...o, name })),
            }))
          }
          onToggleVisible={(id) =>
            updateActiveSceneCommitted((s) => ({
              ...s,
              objects: updateObjectById(s.objects, id, (o) => ({
                ...o,
                visible: !o.visible,
              })),
            }))
          }
          onToggleLocked={(id) =>
            updateActiveSceneCommitted((s) => ({
              ...s,
              objects: updateObjectById(s.objects, id, (o) => ({
                ...o,
                locked: !o.locked,
              })),
            }))
          }
          onDuplicateObject={(id) => handleDuplicateSelected(id)}
          onDeleteObject={(id) => handleDeleteSelected(id)}
          onMoveOrder={(id, dir) =>
            updateActiveSceneCommitted((s) => ({
              ...s,
              objects: moveSiblingOrder(s.objects, id, dir),
            }))
          }
          onReparent={(id, newParentId) =>
            updateActiveSceneCommitted((s) => ({
              ...s,
              objects: reparentObject(s.objects, id, newParentId, {
                preserveWorldTransform: true,
                allowAnyParent: true,
              }),
            }))
          }
          onGroupSelected={(ids) => {
            let newFolderId: string | null = null;
            updateActiveSceneCommitted((s) => {
              const res = groupObjectsInFolder(s.objects, ids, 'Carpeta');
              newFolderId = res.folderId;
              return { ...s, objects: res.objects };
            });
            if (newFolderId) setSelectedIds([newFolderId]);
          }}
          onUngroupFolder={(folderId) =>
            updateActiveSceneCommitted((s) => ({
              ...s,
              objects: ungroupFolder(s.objects, folderId),
            }))
          }
          onCreatePrefabFromObject={handleCreatePrefabFromObject}
          onImportFiles={(files) => void handleImportFiles(files)}
          onAddSpriteFromAsset={(assetId) => handleAddSpriteAt(assetId)}
          onAssignAssetToSelected={handleAssignAssetToSelected}
          onDeleteAsset={(assetId) => void handleDeleteAsset(assetId)}
          onPurgeUnusedAssets={(ids) => void handlePurgeUnusedAssets(ids)}
          onCreateFolder={handleCreateFolder}
          onDeleteFolder={handleDeleteFolder}
          onMoveAssetToFolder={handleMoveAssetToFolder}
          onInstantiatePrefab={handleInstantiatePrefab}
          onDeletePrefab={handleDeletePrefab}
          onOpenVehicleWizard={() => setIsVehicleWizardOpen(true)}
        />

        <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
          <SceneTabsBar
            scenes={project.scenes}
            activeSceneId={activeScene.id}
            initialSceneId={project.initialSceneId}
            onSelectScene={handleSelectScene}
            onCreateScene={handleCreateScene}
            onRenameScene={handleRenameScene}
            onDuplicateScene={handleDuplicateScene}
            onDeleteScene={handleDeleteScene}
            onSetInitialScene={handleSetInitialScene}
          />
          <div className="flex min-h-0 flex-1 overflow-hidden">
            {(project.mode ?? '2d') === '3d' ? (
              <ThreeStageViewport
                scene={activeScene}
                stage={stage}
                selectedIds={selectedIds}
                activeTool={activeTool}
                assetBlobs={assetBlobs}
                fitRequestTick={fitRequestTick}
                onSelectTool={setActiveTool}
                onSelectObjects={setSelectedIds}
                onPreviewObjectsChange={(nextObjects: GameObjectData[]) => {
                  const base = history.present;
                  setTransientProject({
                    ...base,
                    scenes: base.scenes.map((s) =>
                      s.id === base.activeSceneId ? { ...s, objects: nextObjects } : s
                    ),
                  });
                }}
                onCommitObjectsChange={(finalObjects: GameObjectData[]) => {
                  updateActiveSceneCommitted((s) => ({
                    ...s,
                    objects: finalObjects,
                  }));
                }}
                onUpdateScene={updateActiveSceneCommitted}
                onNotify={onNotify}
              />
            ) : (
              <CanvasViewport
                scene={activeScene}
                stage={stage}
                backgroundColor={activeScene.backgroundColor || project.settings.backgroundColor}
                selectedIds={selectedIds}
                activeTool={activeTool}
                camera={camera}
                assetBlobs={assetBlobs}
                fitRequestTick={fitRequestTick}
                onCameraChange={setCamera}
                onSelectObjects={setSelectedIds}
                onPreviewObjectsChange={(nextObjects: GameObjectData[]) => {
                  const base = history.present;
                  setTransientProject({
                    ...base,
                    scenes: base.scenes.map((s) =>
                      s.id === base.activeSceneId ? { ...s, objects: nextObjects } : s
                    ),
                  });
                }}
                onCommitObjectsChange={(finalObjects: GameObjectData[]) => {
                  updateActiveSceneCommitted((s) => ({
                    ...s,
                    objects: finalObjects,
                  }));
                }}
                onUpdateScene={updateActiveSceneCommitted}
                onDropAssetAt={(assetId, sx, sy) => handleAddSpriteAt(assetId, sx, sy)}
                onPointerCoordsChange={setPointerCoords}
              />
            )}
          </div>

          <BottomDock
            open={dockOpen}
            activeTab={dockTab}
            onToggleOpen={() => setDockOpen((o) => !o)}
            onSelectTab={setDockTab}
            mechanics={activeScene.mechanics ?? []}
            objects={activeScene.objects}
            selectedObjectId={selectedObjects[0]?.id ?? null}
            selectedObject={selectedObjects[0] ?? null}
            variables={project.variables ?? []}
            audioBuses={project.audioBuses}
            assets={project.assets}
            assetBlobs={assetBlobs}
            diagnostics={diagnostics}
            scenes={project.scenes}
            prefabs={project.prefabs}
            scripts={project.scripts ?? []}
            dialogues={project.dialogues ?? []}
            dataTables={project.dataTables ?? []}
            i18n={project.i18n ?? { defaultLocale: 'es', autoDetectBrowser: true, entries: {} }}
            activeScene={activeScene}
            onUpdateScene={updateActiveSceneCommitted}
            onImportFiles={(files) => void handleImportFiles(files)}
            onCreateAsset={(meta, blob) => handleCreateGeneratedAsset(meta, blob)}
            onChangeMechanics={(mechanics: GameMechanic[]) =>
              updateActiveSceneCommitted((s) => ({ ...s, mechanics }))
            }
            onChangeVariables={(variables: ProjectVariable[]) =>
              commitProjectChange({ ...history.present, variables })
            }
            onChangeAudioBuses={(audioBuses: AudioBusSettings) =>
              commitProjectChange({ ...history.present, audioBuses })
            }
            onChangeScripts={(scripts: NexusScriptAsset[]) =>
              commitProjectChange({ ...history.present, scripts })
            }
            onChangeDialogues={(dialogues: DialogueGraph[]) =>
              commitProjectChange({ ...history.present, dialogues })
            }
            onChangeDataTables={(dataTables: DataTableDef[]) =>
              commitProjectChange({ ...history.present, dataTables })
            }
            onChangeI18n={(i18n: I18nConfig) =>
              commitProjectChange({ ...history.present, i18n })
            }
            onAttachScriptToScene={(scriptId: string) => {
              updateActiveSceneCommitted((s) => {
                const prev = s.scriptIds ?? [];
                if (prev.includes(scriptId)) return s;
                return { ...s, scriptIds: [...prev, scriptId] };
              });
              onNotify('success', 'Script JS vinculado a la escena actual.');
            }}
            onDetachScriptFromScene={(scriptId: string) => {
              updateActiveSceneCommitted((s) => ({
                ...s,
                scriptIds: (s.scriptIds ?? []).filter((id) => id !== scriptId),
              }));
              onNotify('info', 'Script JS desvinculado de la escena actual.');
            }}
            onAttachScriptToObject={(objectId: string, scriptId: string) => {
              const targetObj = activeScene.objects.find((o) => o.id === objectId);
              const scriptAsset = (project.scripts ?? []).find((sc) => sc.id === scriptId);
              const schema = scriptAsset ? extractScriptParamsSchema(scriptAsset) : [];
              const defaultParams: Record<string, unknown> = {};
              for (const field of schema) defaultParams[field.key] = field.defaultValue;
              updateActiveSceneCommitted((s) => ({
                ...s,
                objects: updateObjectById(s.objects, objectId, (prev) => {
                  const existing = prev.scriptBindings ?? [];
                  if (existing.some((b) => b.scriptId === scriptId)) {
                    return {
                      ...prev,
                      scriptBindings: existing.map((b) =>
                        b.scriptId === scriptId
                          ? { ...b, enabled: true, params: { ...defaultParams, ...(b.params ?? {}) } }
                          : b
                      ),
                    };
                  }
                  return {
                    ...prev,
                    scriptBindings: [
                      ...existing,
                      { id: createId('sb'), scriptId, enabled: true, params: defaultParams },
                    ],
                  };
                }),
              }));
              onNotify('success', `Script JS adjuntado a "${targetObj?.name ?? 'objeto'}".`);
            }}
            onDetachScriptFromObject={(objectId: string, scriptId: string) => {
              const targetObj = activeScene.objects.find((o) => o.id === objectId);
              updateActiveSceneCommitted((s) => ({
                ...s,
                objects: updateObjectById(s.objects, objectId, (prev) => ({
                  ...prev,
                  scriptBindings: (prev.scriptBindings ?? []).filter(
                    (b) => b.scriptId !== scriptId
                  ),
                })),
              }));
              onNotify('info', `Script JS quitado de "${targetObj?.name ?? 'objeto'}".`);
            }}
            onInsertInterfaceIntoScene={(script: NexusScriptAsset) => {
              const existingWidgets = activeScene.objects.filter(
                (o) => o.type === 'ui_widget'
              ).length;
              const defaultX =
                existingWidgets === 0 ? 240 : Math.min(stage.width - 210, 960 - ((existingWidgets - 1) % 3) * 44);
              const defaultY =
                existingWidgets === 0 ? 150 : 190 + ((existingWidgets - 1) % 3) * 44;
              const widget = createGameObject('ui_widget', activeScene.objects, {
                name: script.name.replace(/\.(html|js|ui)$/i, '') || 'InterfazUI',
                x: defaultX,
                y: defaultY,
                width: 360,
                height: 210,
              });
              widget.uiWidget = {
                scriptId: script.id,
                html: script.code,
                css: script.css ?? '',
                js: script.js ?? '',
                interactive: true,
                visibleAtStart: true,
                fixedToScreen: true,
                zIndex: 25 + existingWidgets,
              };
              updateActiveSceneCommitted((s) => ({
                ...s,
                objects: [...s.objects, widget],
              }));
              setSelectedIds([widget.id]);
              onNotify('success', `Interfaz "${widget.name}" insertada en la escena como elemento seleccionable.`);
            }}
            onUpdateObject={(id, updater) =>
              updateActiveSceneCommitted((s) => ({
                ...s,
                objects: updateObjectById(s.objects, id, updater),
              }))
            }
            onApplyDiagnosticFix={handleApplyDiagnosticFix}
            onSelectObjectById={(id) => setSelectedIds([id])}
            onOpenVehicleWizard={() => setIsVehicleWizardOpen(true)}
            project={project}
            selectedIds={selectedIds}
            onCommitCommandResult={(nextProject, createdIds, summary) => {
              commitProjectChange(nextProject);
              if (createdIds.length > 0) setSelectedIds(createdIds);
              onNotify('success', summary);
            }}
            onUpdateCommandHistory={(commandHistory: CommandBarHistoryEntry[]) =>
              commitProjectChange({ ...history.present, commandHistory })
            }
            onChangeSaveSlots={(saveSlots: ProjectSaveSlot[]) =>
              commitProjectChange({ ...history.present, saveSlots })
            }
          />
        </div>

        {/* Panel derecho con pestañas Inspector / Asistente Local */}
        <aside className="flex h-full w-80 shrink-0 flex-col border-l border-[#2e2e36] bg-[#1a1a1e]">
          <div className="grid grid-cols-2 border-b border-[#2e2e36] bg-[#16161a]" role="tablist">
            <button
              type="button"
              role="tab"
              aria-selected={rightTab === 'inspector'}
              onClick={() => setRightTab('inspector')}
              className={`flex items-center justify-center gap-1.5 border-b-2 py-2.5 text-xs font-semibold transition-colors whitespace-nowrap ${
                rightTab === 'inspector'
                  ? 'border-blue-500 bg-[#1a1a1e] text-zinc-100'
                  : 'border-transparent text-zinc-400 hover:text-zinc-200'
              }`}
            >
              <SlidersHorizontal className="h-3.5 w-3.5" />
              <span>Inspector</span>
            </button>

            <button
              type="button"
              role="tab"
              aria-selected={rightTab === 'assistant'}
              onClick={() => setRightTab('assistant')}
              className={`flex items-center justify-center gap-1.5 border-b-2 py-2.5 text-xs font-semibold transition-colors whitespace-nowrap ${
                rightTab === 'assistant'
                  ? 'border-sky-500 bg-[#1a1a1e] text-zinc-100'
                  : 'border-transparent text-zinc-400 hover:text-zinc-200'
              }`}
            >
              <Sparkles className="h-3.5 w-3.5 text-sky-400" />
              <span>
                Asistente{diagnostics.length > 0 ? ` (${diagnostics.length})` : ''}
              </span>
            </button>
          </div>

          <div className="min-h-0 flex-1 overflow-hidden">
            {rightTab === 'inspector' ? (
              <InspectorPanel
                scene={activeScene}
                scenes={project.scenes}
                selectedObjects={selectedObjects}
                assets={project.assets}
                assetBlobs={assetBlobs}
                scripts={project.scripts ?? []}
                projectMode={project.mode ?? '2d'}
                onUpdateObject={(id, updater) =>
                  updateActiveSceneCommitted((s) => ({
                    ...s,
                    objects: updateObjectById(s.objects, id, updater),
                  }))
                }
                onUpdateScene={updateActiveSceneCommitted}
                onActivateTileBrush={() => setActiveTool('tilebrush')}
                onImportFiles={handleImportFiles}
                onCreateAsset={handleCreateGeneratedAsset}
                onOpenVehicleWizard={() => setIsVehicleWizardOpen(true)}
              />
            ) : (
              <AssistantPanel
                scene={activeScene}
                selectedObject={selectedObjects[0] ?? null}
                assets={project.assets}
                diagnostics={diagnostics}
                onApplyCatalogEntry={handleApplyCatalogEntry}
                onInstallBehavior={(entry, targetObjectId) => {
                  updateActiveSceneCommitted((s) => ({
                    ...s,
                    objects: updateObjectById(s.objects, targetObjectId, (prev) => ({
                      ...prev,
                      components: [
                        ...prev.components,
                        {
                          id: createId('comp'),
                          type: entry.type,
                          enabled: true,
                          config: { ...entry.defaultConfig },
                        },
                      ],
                    })),
                  }));
                  onNotify('success', `Comportamiento "${entry.label}" añadido.`);
                }}
                onApplyDiagnosticFix={handleApplyDiagnosticFix}
                onSelectObjectById={(id) => {
                  setSelectedIds([id]);
                  setRightTab('inspector');
                }}
              />
            )}
          </div>
        </aside>
      </div>

      <BottomStatusBar
        sceneName={activeScene.name}
        stageWidth={stage.width}
        stageHeight={stage.height}
        zoom={camera.zoom}
        objectCount={activeScene.objects.length}
        saveStatus={saveStatus}
        lastSavedAt={lastSavedAt}
        selectedObjects={selectedObjects}
        pointerCoords={pointerCoords}
      />

      <ProjectSettingsModal
        open={isSettingsOpen}
        project={project}
        onClose={() => setIsSettingsOpen(false)}
        onSave={handleSaveProjectSettings}
      />

      <PreviewModal
        open={isPreviewOpen}
        projectName={project.name}
        projectMode={project.mode ?? '2d'}
        scene={activeScene}
        scenes={project.scenes}
        initialSceneId={project.initialSceneId ?? activeScene.id}
        prefabs={project.prefabs}
        scripts={project.scripts ?? []}
        dialogues={project.dialogues ?? []}
        dataTables={project.dataTables ?? []}
        i18n={project.i18n}
        stage={stage}
        assetBlobs={assetBlobs}
        variables={project.variables}
        audioBuses={project.audioBuses}
        touchControls={project.settings.touchControls}
        onStop={() => setIsPreviewOpen(false)}
      />

      <ExportModal
        open={isExportOpen}
        projectName={project.name}
        project={project}
        assetBlobs={assetBlobs}
        compiling={isCompilingHtml5}
        defaultTouchControls={project.settings.touchControls?.enabledByDefault ?? true}
        onClose={() => setIsExportOpen(false)}
        onCompileHtml5={(options) => void handleCompileHtml5(options)}
        onExportEditableZip={() => void handleExportZip()}
      />

      <HelpModal open={isHelpOpen} onClose={() => setIsHelpOpen(false)} />

      <VehicleBuilderModal
        open={isVehicleWizardOpen}
        objects={activeScene.objects}
        assets={project.assets}
        onClose={() => setIsVehicleWizardOpen(false)}
        onCreateVehicle={(built) => {
          updateActiveSceneCommitted((s) => ({
            ...s,
            objects: [...s.objects, ...built.objects],
            mechanics: built.addedMechanic
              ? [...(s.mechanics ?? []), built.addedMechanic]
              : s.mechanics,
          }));
          setSelectedIds([built.parentId]);
          onNotify('success', `Vehículo compuesto creado (${built.objects.length} nodos vinculados).`);
        }}
      />
    </div>
  );
};
