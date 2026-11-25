import React, { useMemo, useState } from 'react';
import {
  ArrowDown,
  ArrowUp,
  Box,
  Camera,
  Car,
  ChevronDown,
  ChevronRight,
  Circle,
  Code2,
  Copy,
  Edit2,
  Eye,
  EyeOff,
  Folder,
  Grid,
  Image as ImageIcon,
  LayoutTemplate,
  Lightbulb,
  Lock,
  MousePointerClick,
  PackagePlus,
  Square,
  Trash2,
  Trophy,
  Type,
  Unlock,
  Activity,
} from 'lucide-react';
import { buildSceneTree, type SceneTreeNode } from '../../engine/core/sceneGraph';
import type { GameObjectData, GameObjectType } from '../../engine/core/types';
import type { ProjectMode } from '../../project/models/project';

interface SceneTreePanelProps {
  projectMode?: ProjectMode;
  objects: GameObjectData[];
  selectedIds: string[];
  onSelect: (ids: string[]) => void;
  onCreateObject: (type: GameObjectType) => void;
  onRenameObject: (id: string, name: string) => void;
  onToggleVisible: (id: string) => void;
  onToggleLocked: (id: string) => void;
  onDuplicateObject: (id: string) => void;
  onDeleteObject: (id: string) => void;
  onMoveOrder: (id: string, direction: 'up' | 'down') => void;
  onReparent: (id: string, newParentId: string | null) => void;
  onGroupSelected?: (ids: string[]) => void;
  onUngroupFolder?: (folderId: string) => void;
  onCreatePrefabFromObject?: (id: string) => void;
  onOpenVehicleWizard?: () => void;
}

const TYPE_ICONS: Record<GameObjectType, React.FC<{ className?: string }>> = {
  sprite: ImageIcon,
  rectangle: Square,
  circle: Circle,
  text: Type,
  container: Folder,
  tilemap: Grid,
  ui_button: MousePointerClick,
  ui_panel: LayoutTemplate,
  ui_progress_bar: Activity,
  ui_leaderboard: Trophy,
  ui_widget: Code2,
  light_2d: Lightbulb,
  mesh_3d: Box,
  light_3d: Lightbulb,
  camera_3d: Camera,
};

export const SceneTreePanel: React.FC<SceneTreePanelProps> = ({
  projectMode = '2d',
  objects,
  selectedIds,
  onSelect,
  onCreateObject,
  onRenameObject,
  onToggleVisible,
  onToggleLocked,
  onDuplicateObject,
  onDeleteObject,
  onMoveOrder,
  onReparent,
  onGroupSelected,
  onUngroupFolder,
  onCreatePrefabFromObject,
  onOpenVehicleWizard,
}) => {
  const [collapsedIds, setCollapsedIds] = useState<Set<string>>(new Set());
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState('');
  const [draggedId, setDraggedId] = useState<string | null>(null);
  const [dropTargetId, setDropTargetId] = useState<string | 'root' | null>(null);

  const tree = useMemo(() => buildSceneTree(objects), [objects]);
  const selectedSet = useMemo(() => new Set(selectedIds), [selectedIds]);

  const toggleCollapse = (id: string) => {
    setCollapsedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleRowClick = (e: React.MouseEvent, id: string) => {
    if (e.ctrlKey || e.metaKey) {
      if (selectedSet.has(id)) {
        onSelect(selectedIds.filter((s) => s !== id));
      } else {
        onSelect([...selectedIds, id]);
      }
    } else {
      onSelect([id]);
    }
  };

  const startRename = (obj: GameObjectData) => {
    setEditingId(obj.id);
    setEditingName(obj.name);
  };

  const commitRename = () => {
    if (editingId && editingName.trim()) {
      onRenameObject(editingId, editingName.trim());
    }
    setEditingId(null);
    setEditingName('');
  };

  const renderNode = (node: SceneTreeNode): React.ReactNode => {
    const { object, depth, children } = node;
    const isSelected = selectedSet.has(object.id);
    const isCollapsed = collapsedIds.has(object.id);
    const Icon = TYPE_ICONS[object.type] || Box;
    const isEditing = editingId === object.id;
    const isContainer = object.type === 'container';
    const hasChildren = children.length > 0;
    const isDropTarget = dropTargetId === object.id;

    return (
      <div key={object.id}>
        <div
          draggable={!isEditing}
          onDragStart={(e) => {
            setDraggedId(object.id);
            e.dataTransfer.setData('application/x-nexus-object', object.id);
            e.dataTransfer.effectAllowed = 'move';
          }}
          onDragEnd={() => {
            setDraggedId(null);
            setDropTargetId(null);
          }}
          onDragOver={(e) => {
            if (!draggedId || draggedId === object.id) return;
            e.preventDefault();
            e.stopPropagation();
            setDropTargetId(object.id);
          }}
          onDrop={(e) => {
            if (!draggedId || draggedId === object.id) return;
            e.preventDefault();
            e.stopPropagation();
            onReparent(draggedId, object.id);
            setDraggedId(null);
            setDropTargetId(null);
          }}
          className={`group flex items-center justify-between gap-1 border-b border-transparent px-2 py-1 text-xs transition-colors ${
            isDropTarget
              ? 'bg-blue-500/25 border-blue-400'
              : isSelected
                ? 'bg-blue-600/25 text-white'
                : 'text-zinc-300 hover:bg-[#25252c]'
          }`}
          style={{ paddingLeft: `${8 + depth * 14}px` }}
        >
          <div className="flex min-w-0 flex-1 items-center gap-1">
            {isContainer || hasChildren ? (
              <button
                type="button"
                onClick={() => toggleCollapse(object.id)}
                aria-label={isCollapsed ? `Expandir ${object.name}` : `Contraer ${object.name}`}
                className="flex h-4 w-4 shrink-0 items-center justify-center rounded text-zinc-400 hover:text-zinc-100"
              >
                {isCollapsed ? (
                  <ChevronRight className="h-3 w-3" />
                ) : (
                  <ChevronDown className="h-3 w-3" />
                )}
              </button>
            ) : (
              <span className="w-4 shrink-0" aria-hidden="true" />
            )}

            <Icon
              className={`h-3.5 w-3.5 shrink-0 ${
                isContainer
                  ? 'text-amber-400'
                  : object.type === 'sprite'
                    ? 'text-blue-400'
                    : object.type === 'text'
                      ? 'text-emerald-400'
                      : 'text-zinc-400'
              }`}
            />

            {isEditing ? (
              <input
                type="text"
                aria-label={`Nuevo nombre para ${object.name}`}
                value={editingName}
                onChange={(e) => setEditingName(e.target.value)}
                onBlur={commitRename}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') commitRename();
                  if (e.key === 'Escape') {
                    setEditingId(null);
                    setEditingName('');
                  }
                }}
                autoFocus
                className="min-w-0 flex-1 rounded border border-blue-500 bg-[#141416] px-1.5 py-0.5 text-xs text-white focus:outline-none"
              />
            ) : (
              <button
                type="button"
                onClick={(e) => handleRowClick(e, object.id)}
                onDoubleClick={() => startRename(object)}
                className={`min-w-0 flex-1 truncate text-left py-0.5 ${
                  !object.visible ? 'opacity-45 line-through' : ''
                }`}
              >
                {object.name}
              </button>
            )}
          </div>

          <div
            className={`flex shrink-0 items-center gap-0.5 ${
              isSelected || !object.visible || object.locked
                ? 'opacity-100'
                : 'opacity-0 group-hover:opacity-100 focus-within:opacity-100'
            }`}
          >
            <button
              type="button"
              onClick={() => onMoveOrder(object.id, 'up')}
              title="Mover arriba en jerarquía"
              aria-label={`Subir ${object.name}`}
              className="rounded p-0.5 text-zinc-400 hover:bg-[#32323c] hover:text-zinc-100"
            >
              <ArrowUp className="h-3 w-3" />
            </button>
            <button
              type="button"
              onClick={() => onMoveOrder(object.id, 'down')}
              title="Mover abajo en jerarquía"
              aria-label={`Bajar ${object.name}`}
              className="rounded p-0.5 text-zinc-400 hover:bg-[#32323c] hover:text-zinc-100"
            >
              <ArrowDown className="h-3 w-3" />
            </button>
            <button
              type="button"
              onClick={() => startRename(object)}
              title="Renombrar objeto"
              aria-label={`Renombrar ${object.name}`}
              className="rounded p-0.5 text-zinc-400 hover:bg-[#32323c] hover:text-zinc-100"
            >
              <Edit2 className="h-3 w-3" />
            </button>
            <button
              type="button"
              onClick={() => onToggleVisible(object.id)}
              title={object.visible ? 'Ocultar objeto' : 'Mostrar objeto'}
              aria-label={object.visible ? `Ocultar ${object.name}` : `Mostrar ${object.name}`}
              className={`rounded p-0.5 hover:bg-[#32323c] ${
                object.visible ? 'text-zinc-400 hover:text-zinc-100' : 'text-amber-400'
              }`}
            >
              {object.visible ? <Eye className="h-3 w-3" /> : <EyeOff className="h-3 w-3" />}
            </button>
            <button
              type="button"
              onClick={() => onToggleLocked(object.id)}
              title={object.locked ? 'Desbloquear objeto' : 'Bloquear objeto'}
              aria-label={object.locked ? `Desbloquear ${object.name}` : `Bloquear ${object.name}`}
              className={`rounded p-0.5 hover:bg-[#32323c] ${
                object.locked ? 'text-amber-400' : 'text-zinc-400 hover:text-zinc-100'
              }`}
            >
              {object.locked ? <Lock className="h-3 w-3" /> : <Unlock className="h-3 w-3" />}
            </button>
            {onCreatePrefabFromObject && (
              <button
                type="button"
                onClick={() => onCreatePrefabFromObject(object.id)}
                title="Guardar como Prefab reutilizable"
                aria-label={`Guardar ${object.name} como prefab`}
                className="rounded p-0.5 text-zinc-400 hover:bg-[#32323c] hover:text-amber-300"
              >
                <PackagePlus className="h-3 w-3" />
              </button>
            )}
            <button
              type="button"
              onClick={() => onDuplicateObject(object.id)}
              title="Duplicar objeto"
              aria-label={`Duplicar ${object.name}`}
              className="rounded p-0.5 text-zinc-400 hover:bg-[#32323c] hover:text-zinc-100"
            >
              <Copy className="h-3 w-3" />
            </button>
            <button
              type="button"
              onClick={() => onDeleteObject(object.id)}
              title="Eliminar objeto"
              aria-label={`Eliminar ${object.name}`}
              className="rounded p-0.5 text-zinc-400 hover:bg-red-500/20 hover:text-red-400"
            >
              <Trash2 className="h-3 w-3" />
            </button>
          </div>
        </div>

        {!isCollapsed && children.length > 0 && children.map(renderNode)}
      </div>
    );
  };

  return (
    <div className="flex h-full flex-col">
      {/* Barra rápida para añadir objetos */}
      <div className="border-b border-[#2e2e36] bg-[#1e1e23] p-2">
        <div className="mb-1.5 flex items-center justify-between gap-1">
          <span className="text-[11px] font-medium text-zinc-400">
            {projectMode === '3d' ? 'Añadir objeto 3D / UI' : 'Añadir objeto'}
          </span>
          <div className="flex items-center gap-1">
            {selectedIds.length >= 1 && onGroupSelected && (
              <button
                type="button"
                onClick={() => onGroupSelected(selectedIds)}
                title="Agrupar objetos seleccionados en carpeta sin mover su posición"
                className="inline-flex items-center gap-1 rounded border border-amber-500/40 bg-amber-500/15 px-1.5 py-0.5 text-[10px] font-semibold text-amber-300 hover:bg-amber-500/25"
              >
                <Folder className="h-2.5 w-2.5" />
                <span>Agrupar</span>
              </button>
            )}
            {selectedIds.length === 1 &&
              objects.find((o) => o.id === selectedIds[0])?.type === 'container' &&
              onUngroupFolder && (
                <button
                  type="button"
                  onClick={() => onUngroupFolder(selectedIds[0])}
                  title="Desagrupar carpeta manteniendo posición mundial"
                  className="rounded border border-[#383844] bg-[#24242c] px-1.5 py-0.5 text-[10px] text-zinc-300 hover:text-white"
                >
                  Desagrupar
                </button>
              )}
          </div>
        </div>
        {projectMode === '3d' ? (
          <div className="grid grid-cols-2 gap-1">
            <button
              type="button"
              onClick={() => onCreateObject('mesh_3d')}
              className="flex items-center justify-center gap-1 rounded border border-[#32323c] bg-[#24242a] py-1.5 text-[10px] text-zinc-200 hover:border-sky-500/50"
            >
              <Box className="h-3.5 w-3.5 text-sky-400" />
              <span>Malla 3D</span>
            </button>
            <button
              type="button"
              onClick={() => onCreateObject('light_3d')}
              className="flex items-center justify-center gap-1 rounded border border-[#32323c] bg-[#24242a] py-1.5 text-[10px] text-zinc-200 hover:border-amber-500/50"
            >
              <Lightbulb className="h-3.5 w-3.5 text-amber-400" />
              <span>Luz 3D</span>
            </button>
            <button
              type="button"
              onClick={() => onCreateObject('camera_3d')}
              className="flex items-center justify-center gap-1 rounded border border-[#32323c] bg-[#24242a] py-1.5 text-[10px] text-zinc-200 hover:border-cyan-500/50"
            >
              <Camera className="h-3.5 w-3.5 text-cyan-400" />
              <span>Cámara 3D</span>
            </button>
            <button
              type="button"
              onClick={() => onCreateObject('container')}
              className="flex items-center justify-center gap-1 rounded border border-[#32323c] bg-[#24242a] py-1.5 text-[10px] text-zinc-200 hover:border-amber-500/50"
            >
              <Folder className="h-3.5 w-3.5 text-amber-400" />
              <span>Carpeta</span>
            </button>
            <button
              type="button"
              onClick={() => onCreateObject('ui_widget')}
              className="flex items-center justify-center gap-1 rounded border border-[#32323c] bg-[#24242a] py-1.5 text-[10px] text-zinc-200 hover:border-cyan-500/50"
            >
              <Code2 className="h-3.5 w-3.5 text-cyan-400" />
              <span>Interfaz UI</span>
            </button>
            {onOpenVehicleWizard && (
              <button
                type="button"
                onClick={onOpenVehicleWizard}
                className="flex items-center justify-center gap-1 rounded border border-emerald-500/40 bg-emerald-500/15 py-1.5 text-[10px] font-semibold text-emerald-200 hover:bg-emerald-500/25"
              >
                <Car className="h-3.5 w-3.5 text-emerald-400" />
                <span>Agregar Vehículo</span>
              </button>
            )}
          </div>
        ) : (
          <div className="grid grid-cols-3 gap-1">
            <button
              type="button"
              onClick={() => onCreateObject('sprite')}
              title="Añadir Sprite"
              className="flex items-center justify-center gap-1 rounded border border-[#32323c] bg-[#24242a] py-1.5 text-[10px] text-zinc-200 hover:border-blue-500/50 hover:bg-[#2c2c34]"
            >
              <ImageIcon className="h-3.5 w-3.5 text-blue-400" />
              <span>Sprite</span>
            </button>
            <button
              type="button"
              onClick={() => onCreateObject('rectangle')}
              title="Añadir Rectángulo"
              className="flex items-center justify-center gap-1 rounded border border-[#32323c] bg-[#24242a] py-1.5 text-[10px] text-zinc-200 hover:border-blue-500/50 hover:bg-[#2c2c34]"
            >
              <Square className="h-3.5 w-3.5 text-sky-400" />
              <span>Rect</span>
            </button>
            <button
              type="button"
              onClick={() => onCreateObject('circle')}
              title="Añadir Círculo"
              className="flex items-center justify-center gap-1 rounded border border-[#32323c] bg-[#24242a] py-1.5 text-[10px] text-zinc-200 hover:border-blue-500/50 hover:bg-[#2c2c34]"
            >
              <Circle className="h-3.5 w-3.5 text-emerald-400" />
              <span>Círculo</span>
            </button>
            <button
              type="button"
              onClick={() => onCreateObject('text')}
              title="Añadir Texto"
              className="flex items-center justify-center gap-1 rounded border border-[#32323c] bg-[#24242a] py-1.5 text-[10px] text-zinc-200 hover:border-blue-500/50 hover:bg-[#2c2c34]"
            >
              <Type className="h-3.5 w-3.5 text-zinc-200" />
              <span>Texto</span>
            </button>
            <button
              type="button"
              onClick={() => onCreateObject('container')}
              title="Añadir Contenedor vacío"
              className="flex items-center justify-center gap-1 rounded border border-[#32323c] bg-[#24242a] py-1.5 text-[10px] text-zinc-200 hover:border-blue-500/50 hover:bg-[#2c2c34]"
            >
              <Folder className="h-3.5 w-3.5 text-amber-400" />
              <span>Grupo</span>
            </button>
            <button
              type="button"
              onClick={() => onCreateObject('tilemap')}
              title="Añadir Mapa de Tiles"
              className="flex items-center justify-center gap-1 rounded border border-[#32323c] bg-[#24242a] py-1.5 text-[10px] text-zinc-200 hover:border-blue-500/50 hover:bg-[#2c2c34]"
            >
              <Grid className="h-3.5 w-3.5 text-cyan-400" />
              <span>Tiles</span>
            </button>
            <button
              type="button"
              onClick={() => onCreateObject('ui_button')}
              title="Añadir Botón UI interactivo"
              className="flex items-center justify-center gap-1 rounded border border-[#32323c] bg-[#24242a] py-1.5 text-[10px] text-zinc-200 hover:border-blue-500/50 hover:bg-[#2c2c34]"
            >
              <MousePointerClick className="h-3.5 w-3.5 text-indigo-400" />
              <span>Botón UI</span>
            </button>
            <button
              type="button"
              onClick={() => onCreateObject('ui_panel')}
              title="Añadir Panel UI"
              className="flex items-center justify-center gap-1 rounded border border-[#32323c] bg-[#24242a] py-1.5 text-[10px] text-zinc-200 hover:border-blue-500/50 hover:bg-[#2c2c34]"
            >
              <LayoutTemplate className="h-3.5 w-3.5 text-violet-400" />
              <span>Panel UI</span>
            </button>
            <button
              type="button"
              onClick={() => onCreateObject('ui_progress_bar')}
              title="Añadir Barra de Vida / Progreso"
              className="flex items-center justify-center gap-1 rounded border border-[#32323c] bg-[#24242a] py-1.5 text-[10px] text-zinc-200 hover:border-blue-500/50 hover:bg-[#2c2c34]"
            >
              <Activity className="h-3.5 w-3.5 text-emerald-400" />
              <span>Barra UI</span>
            </button>
            <button
              type="button"
              onClick={() => onCreateObject('ui_widget')}
              title="Añadir Interfaz HTML/CSS/JS animada"
              className="flex items-center justify-center gap-1 rounded border border-[#32323c] bg-[#24242a] py-1.5 text-[10px] text-cyan-200 hover:border-cyan-500/50 hover:bg-[#2c2c34]"
            >
              <Code2 className="h-3.5 w-3.5 text-cyan-400" />
              <span>Interfaz</span>
            </button>
            <button
              type="button"
              onClick={() => onCreateObject('light_2d')}
              title="Añadir Luz 2D con sombras dinámicas"
              className="flex items-center justify-center gap-1 rounded border border-[#32323c] bg-[#24242a] py-1.5 text-[10px] text-amber-200 hover:border-amber-500/50 hover:bg-[#2c2c34]"
            >
              <Lightbulb className="h-3.5 w-3.5 text-amber-400" />
              <span>Luz 2D</span>
            </button>
            <button
              type="button"
              onClick={() => onCreateObject('ui_leaderboard')}
              title="Añadir Tabla de Clasificación / Ranking UI"
              className="flex items-center justify-center gap-1 rounded border border-[#32323c] bg-[#24242a] py-1.5 text-[10px] text-zinc-200 hover:border-amber-500/50 hover:bg-[#2c2c34]"
            >
              <Trophy className="h-3.5 w-3.5 text-amber-400" />
              <span>Ranking</span>
            </button>
          </div>
        )}
      </div>

      {/* Árbol de objetos */}
      <div
        className={`flex-1 overflow-y-auto py-1 ${
          dropTargetId === 'root' ? 'bg-blue-500/10' : ''
        }`}
        onDragOver={(e) => {
          if (draggedId) {
            e.preventDefault();
            setDropTargetId('root');
          }
        }}
        onDrop={(e) => {
          if (draggedId) {
            e.preventDefault();
            onReparent(draggedId, null);
            setDraggedId(null);
            setDropTargetId(null);
          }
        }}
      >
        {tree.length === 0 ? (
          <div className="px-4 py-8 text-center text-xs text-zinc-500">
            Escena vacía. Agrega un Sprite, Rectángulo, Círculo, Texto o Contenedor arriba, o arrastra una imagen desde Recursos.
          </div>
        ) : (
          tree.map(renderNode)
        )}
      </div>
    </div>
  );
};
