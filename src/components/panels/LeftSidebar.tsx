import React, { useState } from 'react';
import { FolderTree, Images } from 'lucide-react';
import type { GameObjectData, GameObjectType, SceneData } from '../../engine/core/types';
import type {
  PrefabDefinition,
  ProjectAssetMeta,
  ProjectFolder,
  ProjectMode,
} from '../../project/models/project';
import { AssetsLibraryPanel } from './AssetsLibraryPanel';
import { SceneTreePanel } from './SceneTreePanel';

type LeftTab = 'scene' | 'assets';

interface LeftSidebarProps {
  projectMode?: ProjectMode;
  objects: GameObjectData[];
  selectedIds: string[];
  assets: ProjectAssetMeta[];
  assetBlobs?: Map<string, Blob>;
  scenes: SceneData[];
  folders?: ProjectFolder[];
  prefabs?: PrefabDefinition[];
  onSelectObjects: (ids: string[]) => void;
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
  onImportFiles: (files: File[]) => void;
  onAddSpriteFromAsset: (assetId: string) => void;
  onAssignAssetToSelected?: (assetId: string) => void;
  onDeleteAsset: (assetId: string) => void;
  onPurgeUnusedAssets: (unusedIds: string[]) => void;
  onCreateFolder?: (name: string) => void;
  onDeleteFolder?: (folderId: string) => void;
  onMoveAssetToFolder?: (assetId: string, folderId: string | null) => void;
  onInstantiatePrefab?: (prefabId: string) => void;
  onDeletePrefab?: (prefabId: string) => void;
}

export const LeftSidebar: React.FC<LeftSidebarProps> = (props) => {
  const [activeTab, setActiveTab] = useState<LeftTab>('scene');
  const singleSelectedObj =
    props.selectedIds.length === 1
      ? props.objects.find((o) => o.id === props.selectedIds[0]) ?? null
      : null;

  return (
    <aside className="flex h-full w-72 shrink-0 flex-col border-r border-[#2e2e36] bg-[#1a1a1e]">
      {/* Pestañas Escena / Recursos */}
      <div className="grid grid-cols-2 border-b border-[#2e2e36] bg-[#16161a]" role="tablist">
        <button
          type="button"
          role="tab"
          aria-selected={activeTab === 'scene'}
          onClick={() => setActiveTab('scene')}
          className={`flex items-center justify-center gap-1.5 border-b-2 py-2.5 text-xs font-semibold transition-colors whitespace-nowrap ${
            activeTab === 'scene'
              ? 'border-blue-500 bg-[#1a1a1e] text-zinc-100'
              : 'border-transparent text-zinc-400 hover:text-zinc-200'
          }`}
        >
          <FolderTree className="h-3.5 w-3.5" />
          <span>Escena ({props.objects.length})</span>
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={activeTab === 'assets'}
          onClick={() => setActiveTab('assets')}
          className={`flex items-center justify-center gap-1.5 border-b-2 py-2.5 text-xs font-semibold transition-colors whitespace-nowrap ${
            activeTab === 'assets'
              ? 'border-blue-500 bg-[#1a1a1e] text-zinc-100'
              : 'border-transparent text-zinc-400 hover:text-zinc-200'
          }`}
        >
          <Images className="h-3.5 w-3.5" />
          <span>Recursos ({props.assets.length})</span>
        </button>
      </div>

      <div className="min-h-0 flex-1 overflow-hidden">
        {activeTab === 'scene' ? (
          <SceneTreePanel
            projectMode={props.projectMode}
            objects={props.objects}
            selectedIds={props.selectedIds}
            onSelect={props.onSelectObjects}
            onCreateObject={props.onCreateObject}
            onRenameObject={props.onRenameObject}
            onToggleVisible={props.onToggleVisible}
            onToggleLocked={props.onToggleLocked}
            onDuplicateObject={props.onDuplicateObject}
            onDeleteObject={props.onDeleteObject}
            onMoveOrder={props.onMoveOrder}
            onReparent={props.onReparent}
            onGroupSelected={props.onGroupSelected}
            onUngroupFolder={props.onUngroupFolder}
            onCreatePrefabFromObject={props.onCreatePrefabFromObject}
          />
        ) : (
          <AssetsLibraryPanel
            assets={props.assets}
            scenes={props.scenes}
            assetBlobs={props.assetBlobs}
            folders={props.folders}
            prefabs={props.prefabs}
            selectedObject={singleSelectedObj}
            onImportFiles={props.onImportFiles}
            onAddSpriteFromAsset={props.onAddSpriteFromAsset}
            onAssignAssetToSelected={props.onAssignAssetToSelected}
            onDeleteAsset={props.onDeleteAsset}
            onPurgeUnusedAssets={props.onPurgeUnusedAssets}
            onCreateFolder={props.onCreateFolder}
            onDeleteFolder={props.onDeleteFolder}
            onMoveAssetToFolder={props.onMoveAssetToFolder}
            onInstantiatePrefab={props.onInstantiatePrefab}
            onDeletePrefab={props.onDeletePrefab}
          />
        )}
      </div>
    </aside>
  );
};
