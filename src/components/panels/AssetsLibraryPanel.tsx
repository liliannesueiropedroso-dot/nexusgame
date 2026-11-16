import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Folder,
  FolderPlus,
  ImagePlus,
  Music,
  Package,
  Play,
  Plus,
  Search,
  Square,
  Trash2,
  UploadCloud,
} from 'lucide-react';
import { findUnusedAssetIds } from '../../assets/library/assetUtils';
import { sharedAudioEngine } from '../../engine/audio/audioEngine';
import type { SceneData } from '../../engine/core/types';
import type {
  PrefabDefinition,
  ProjectAssetMeta,
  ProjectFolder,
} from '../../project/models/project';

interface AssetsLibraryPanelProps {
  assets: ProjectAssetMeta[];
  scenes: SceneData[];
  assetBlobs?: Map<string, Blob>;
  folders?: ProjectFolder[];
  prefabs?: PrefabDefinition[];
  onImportFiles: (files: File[]) => void;
  onAddSpriteFromAsset: (assetId: string) => void;
  onDeleteAsset: (assetId: string) => void;
  onPurgeUnusedAssets: (unusedIds: string[]) => void;
  onCreateFolder?: (name: string) => void;
  onDeleteFolder?: (folderId: string) => void;
  onMoveAssetToFolder?: (assetId: string, folderId: string | null) => void;
  onInstantiatePrefab?: (prefabId: string) => void;
  onDeletePrefab?: (prefabId: string) => void;
}

export const AssetsLibraryPanel: React.FC<AssetsLibraryPanelProps> = ({
  assets,
  scenes,
  assetBlobs,
  folders = [],
  prefabs = [],
  onImportFiles,
  onAddSpriteFromAsset,
  onDeleteAsset,
  onPurgeUnusedAssets,
  onCreateFolder,
  onDeleteFolder,
  onMoveAssetToFolder,
  onInstantiatePrefab,
  onDeletePrefab,
}) => {
  const [query, setQuery] = useState('');
  const [mediaFilter, setMediaFilter] = useState<'all' | 'image' | 'audio'>('all');
  const [selectedFolderId, setSelectedFolderId] = useState<string>('__all__');
  const [creatingFolder, setCreatingFolder] = useState(false);
  const [newFolderName, setNewFolderName] = useState('');
  const [isDragOver, setIsDragOver] = useState(false);
  const [playingAudioId, setPlayingAudioId] = useState<string | null>(() =>
    sharedAudioEngine.getCurrentMusicAssetId()
  );
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const audioInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    return sharedAudioEngine.subscribe(() => {
      setPlayingAudioId(sharedAudioEngine.getCurrentMusicAssetId());
    });
  }, []);

  const unusedIds = useMemo(() => findUnusedAssetIds(assets, scenes), [assets, scenes]);
  const unusedSet = useMemo(() => new Set(unusedIds), [unusedIds]);

  const filteredAssets = useMemo(() => {
    const q = query.trim().toLowerCase();
    return assets.filter((a) => {
      const isAudio = a.kind === 'audio';
      if (mediaFilter === 'image' && isAudio) return false;
      if (mediaFilter === 'audio' && !isAudio) return false;
      if (selectedFolderId === '__root__' && a.folderId) return false;
      if (
        selectedFolderId !== '__all__' &&
        selectedFolderId !== '__root__' &&
        a.folderId !== selectedFolderId
      ) {
        return false;
      }
      if (!q) return true;
      return (
        a.name.toLowerCase().includes(q) ||
        a.filename.toLowerCase().includes(q) ||
        a.format.toLowerCase().includes(q)
      );
    });
  }, [assets, query, selectedFolderId, mediaFilter]);

  const handleDropFiles = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      onImportFiles(Array.from(e.dataTransfer.files));
    }
  };

  const handleConfirmCreateFolder = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = newFolderName.trim();
    if (trimmed && onCreateFolder) {
      onCreateFolder(trimmed);
    }
    setNewFolderName('');
    setCreatingFolder(false);
  };

  return (
    <div
      className="flex h-full flex-col"
      onDragOver={(e) => {
        if (e.dataTransfer.types.includes('Files')) {
          e.preventDefault();
          setIsDragOver(true);
        }
      }}
      onDragLeave={() => setIsDragOver(false)}
      onDrop={handleDropFiles}
    >
      {/* Buscador e importación */}
      <div className="space-y-2 border-b border-[#2e2e36] bg-[#1e1e23] p-2">
        <div className="relative">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-zinc-500" />
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Buscar recursos..."
            aria-label="Buscar recursos"
            className="w-full rounded border border-[#34343e] bg-[#141416] py-1.5 pl-8 pr-2.5 text-xs text-zinc-100 placeholder:text-zinc-500 focus:border-blue-500 focus:outline-none"
          />
        </div>

        <input
          ref={fileInputRef}
          type="file"
          multiple
          accept=".png,.jpg,.jpeg,.webp,.svg,.wav,.mp3,.ogg,.m4a,.aac,.flac,.webm,image/*,audio/*"
          className="hidden"
          onChange={(e) => {
            const list = e.target.files ? Array.from(e.target.files) : [];
            if (list.length > 0) {
              onImportFiles(list);
              e.target.value = '';
            }
          }}
        />
        <input
          ref={audioInputRef}
          type="file"
          multiple
          accept=".wav,.mp3,.ogg,.m4a,.aac,.flac,.webm,audio/*"
          className="hidden"
          onChange={(e) => {
            const list = e.target.files ? Array.from(e.target.files) : [];
            if (list.length > 0) {
              onImportFiles(list);
              setMediaFilter('audio');
              e.target.value = '';
            }
          }}
        />

        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="inline-flex flex-1 items-center justify-center gap-1 rounded bg-blue-600 px-2 py-1.5 text-[11px] font-medium text-white hover:bg-blue-500 whitespace-nowrap"
          >
            <ImagePlus className="h-3.5 w-3.5" />
            Importar
          </button>

          <button
            type="button"
            onClick={() => audioInputRef.current?.click()}
            title="Importar música o efectos de sonido desde PC"
            className="inline-flex items-center justify-center gap-1 rounded border border-sky-500/40 bg-sky-500/15 px-2 py-1.5 text-[11px] font-medium text-sky-300 hover:bg-sky-500/25 whitespace-nowrap"
          >
            <Music className="h-3.5 w-3.5" />
            <span>+ Audio</span>
          </button>

          {onCreateFolder && (
            <button
              type="button"
              onClick={() => setCreatingFolder((v) => !v)}
              title="Crear carpeta virtual para organizar recursos"
              aria-label="Crear carpeta de recursos"
              className="inline-flex items-center gap-1 rounded border border-[#34343e] bg-[#24242b] px-1.5 py-1.5 text-xs text-zinc-300 hover:bg-[#2d2d36]"
            >
              <FolderPlus className="h-3.5 w-3.5 text-amber-400" />
            </button>
          )}

          <button
            type="button"
            disabled={unusedIds.length === 0}
            onClick={() => onPurgeUnusedAssets(unusedIds)}
            title="Eliminar recursos no utilizados en ninguna escena"
            aria-label="Eliminar recursos no utilizados"
            className="inline-flex items-center gap-1 rounded border border-[#34343e] bg-[#24242b] px-1.5 py-1.5 text-[11px] text-zinc-300 hover:bg-[#2d2d36] disabled:opacity-40 disabled:pointer-events-none whitespace-nowrap"
          >
            <Trash2 className="h-3.5 w-3.5" />
            <span>({unusedIds.length})</span>
          </button>
        </div>

        <div className="grid grid-cols-3 gap-1 rounded bg-[#141416] p-0.5 text-[10px]">
          {(
            [
              { id: 'all', label: `Todos (${assets.length})` },
              {
                id: 'image',
                label: `Img (${assets.filter((a) => a.kind !== 'audio').length})`,
              },
              {
                id: 'audio',
                label: `Audio (${assets.filter((a) => a.kind === 'audio').length})`,
              },
            ] as const
          ).map((f) => (
            <button
              key={f.id}
              type="button"
              onClick={() => setMediaFilter(f.id)}
              className={`rounded py-1 font-medium transition-colors whitespace-nowrap ${
                mediaFilter === f.id
                  ? 'bg-[#2a2a33] text-zinc-100'
                  : 'text-zinc-400 hover:text-zinc-200'
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>

        {creatingFolder && (
          <form onSubmit={handleConfirmCreateFolder} className="flex items-center gap-1">
            <input
              type="text"
              value={newFolderName}
              onChange={(e) => setNewFolderName(e.target.value)}
              placeholder="Nombre de carpeta..."
              autoFocus
              className="min-w-0 flex-1 rounded border border-[#3a3a45] bg-[#141416] px-2 py-1 text-[11px] text-zinc-100 focus:border-blue-500 focus:outline-none"
            />
            <button
              type="submit"
              className="rounded bg-blue-600 px-2 py-1 text-[11px] font-medium text-white hover:bg-blue-500"
            >
              Crear
            </button>
          </form>
        )}

        {/* Carpetas virtuales */}
        {folders.length > 0 && (
          <div className="flex flex-wrap items-center gap-1 pt-0.5">
            <button
              type="button"
              onClick={() => setSelectedFolderId('__all__')}
              className={`rounded px-1.5 py-0.5 text-[10px] ${
                selectedFolderId === '__all__'
                  ? 'bg-blue-600/30 text-blue-300'
                  : 'bg-[#24242b] text-zinc-400 hover:text-zinc-200'
              }`}
            >
              Todos ({assets.length})
            </button>
            <button
              type="button"
              onClick={() => setSelectedFolderId('__root__')}
              className={`rounded px-1.5 py-0.5 text-[10px] ${
                selectedFolderId === '__root__'
                  ? 'bg-blue-600/30 text-blue-300'
                  : 'bg-[#24242b] text-zinc-400 hover:text-zinc-200'
              }`}
            >
              Sin carpeta
            </button>
            {folders.map((folder) => (
              <div
                key={folder.id}
                className={`inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] ${
                  selectedFolderId === folder.id
                    ? 'bg-amber-500/20 text-amber-300'
                    : 'bg-[#24242b] text-zinc-300 hover:text-white'
                }`}
              >
                <button
                  type="button"
                  onClick={() => setSelectedFolderId(folder.id)}
                  className="inline-flex items-center gap-1"
                >
                  <Folder className="h-2.5 w-2.5" />
                  <span className="max-w-20 truncate">{folder.name}</span>
                </button>
                {onDeleteFolder && (
                  <button
                    type="button"
                    onClick={() => {
                      if (selectedFolderId === folder.id) setSelectedFolderId('__all__');
                      onDeleteFolder(folder.id);
                    }}
                    title={`Eliminar carpeta ${folder.name}`}
                    className="text-zinc-500 hover:text-red-400"
                  >
                    ×
                  </button>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Zona de biblioteca / drop */}
      <div
        className={`relative flex-1 overflow-y-auto p-2 transition-colors ${
          isDragOver ? 'bg-blue-500/10 ring-1 ring-inset ring-blue-500' : ''
        }`}
      >
        {isDragOver && (
          <div className="pointer-events-none mb-2 flex items-center justify-center gap-2 rounded border border-dashed border-blue-400 bg-blue-500/10 py-3 text-xs font-medium text-blue-300">
            <UploadCloud className="h-4 w-4" />
            Suelta imágenes o audios aquí para importarlos
          </div>
        )}

        {/* Sección de Prefabs reutilizables */}
        {prefabs.length > 0 && (
          <div className="mb-3 rounded border border-[#30303a] bg-[#1b1b21] p-2">
            <div className="mb-1.5 flex items-center justify-between text-[10px] font-semibold uppercase tracking-wider text-amber-400">
              <span className="inline-flex items-center gap-1">
                <Package className="h-3 w-3" />
                Prefabs ({prefabs.length})
              </span>
            </div>
            <div className="space-y-1">
              {prefabs.map((pf) => (
                <div
                  key={pf.id}
                  className="flex items-center justify-between gap-1 rounded border border-[#2d2d37] bg-[#222229] px-2 py-1 text-[11px]"
                >
                  <span className="min-w-0 flex-1 truncate text-zinc-200" title={pf.name}>
                    {pf.name}
                  </span>
                  <div className="flex items-center gap-1 shrink-0">
                    {onInstantiatePrefab && (
                      <button
                        type="button"
                        onClick={() => onInstantiatePrefab(pf.id)}
                        title="Instanciar Prefab en la escena"
                        className="rounded bg-blue-600 px-1.5 py-0.5 text-[10px] font-medium text-white hover:bg-blue-500"
                      >
                        + Escena
                      </button>
                    )}
                    {onDeletePrefab && (
                      <button
                        type="button"
                        onClick={() => onDeletePrefab(pf.id)}
                        title="Eliminar Prefab"
                        className="rounded p-0.5 text-zinc-500 hover:bg-red-500/20 hover:text-red-400"
                      >
                        <Trash2 className="h-3 w-3" />
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {filteredAssets.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-2 rounded border border-dashed border-[#34343e] px-3 py-8 text-center">
            <UploadCloud className="h-6 w-6 text-zinc-500" />
            <p className="text-xs text-zinc-400">
              {assets.length === 0
                ? 'Arrastra imágenes (PNG, JPG, WebP, SVG) o audios (WAV, MP3, OGG) aquí.'
                : 'No hay recursos que coincidan en esta vista.'}
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-2">
            {filteredAssets.map((asset) => {
              const isUnused = unusedSet.has(asset.id);
              const isAudio = asset.kind === 'audio';
              return (
                <div
                  key={asset.id}
                  draggable={!isAudio}
                  onDragStart={(e) => {
                    if (isAudio) return;
                    e.dataTransfer.setData('application/x-nexus-asset', asset.id);
                    e.dataTransfer.effectAllowed = 'copy';
                  }}
                  onDoubleClick={() => {
                    if (!isAudio) onAddSpriteFromAsset(asset.id);
                    else {
                      const blob = assetBlobs?.get(asset.id);
                      if (blob) void sharedAudioEngine.playAssetBlob(asset.id, blob);
                    }
                  }}
                  title={
                    isAudio
                      ? `${asset.filename} — Audio local (clic en reproducir)`
                      : `${asset.filename} (${asset.width}×${asset.height}) — Arrastra al escenario o doble clic para insertar`
                  }
                  className="group relative flex flex-col overflow-hidden rounded border border-[#303039] bg-[#212127] hover:border-blue-500/60"
                >
                  <div className="relative flex h-20 items-center justify-center bg-[#16161a] p-1.5">
                    {asset.thumbnailDataUrl ? (
                      <img
                        src={asset.thumbnailDataUrl}
                        alt={asset.name}
                        referrerPolicy="no-referrer"
                        className="max-h-full max-w-full object-contain pointer-events-none select-none"
                      />
                    ) : (
                      <span className="text-[10px] text-zinc-500">Sin vista</span>
                    )}

                    <div className="absolute right-1 top-1 flex items-center gap-0.5 opacity-0 transition-opacity group-hover:opacity-100 focus-within:opacity-100">
                      {isAudio ? (
                        playingAudioId === asset.id ? (
                          <button
                            type="button"
                            onClick={() => sharedAudioEngine.stopAll()}
                            title="Detener audio"
                            aria-label={`Detener ${asset.name}`}
                            className="rounded bg-red-600 p-1 text-white shadow hover:bg-red-500"
                          >
                            <Square className="h-3 w-3 fill-current" />
                          </button>
                        ) : (
                          <button
                            type="button"
                            onClick={() => {
                              const blob = assetBlobs?.get(asset.id);
                              if (blob) {
                                sharedAudioEngine.unlock();
                                void sharedAudioEngine.playMusicAsset(asset.id, blob, {
                                  loop: false,
                                  volume: 1,
                                });
                              }
                            }}
                            title="Reproducir audio"
                            aria-label={`Reproducir ${asset.name}`}
                            className="rounded bg-sky-600 p-1 text-white shadow hover:bg-sky-500"
                          >
                            <Play className="h-3 w-3" />
                          </button>
                        )
                      ) : (
                        <button
                          type="button"
                          onClick={() => onAddSpriteFromAsset(asset.id)}
                          title="Insertar en el escenario"
                          aria-label={`Insertar ${asset.name} en el escenario`}
                          className="rounded bg-blue-600 p-1 text-white shadow hover:bg-blue-500"
                        >
                          <Plus className="h-3 w-3" />
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => onDeleteAsset(asset.id)}
                        title="Eliminar recurso"
                        aria-label={`Eliminar recurso ${asset.name}`}
                        className="rounded bg-[#1b1b1f]/90 p-1 text-zinc-300 shadow hover:bg-red-600 hover:text-white"
                      >
                        <Trash2 className="h-3 w-3" />
                      </button>
                    </div>
                  </div>

                  <div className="px-2 py-1.5">
                    <div className="truncate text-[11px] font-medium text-zinc-200">
                      {asset.name}
                    </div>
                    <div className="mt-0.5 flex items-center justify-between text-[10px] text-zinc-400 font-mono tabular-nums">
                      <span>{asset.format.toUpperCase()}</span>
                      <span>
                        {isAudio ? 'AUDIO' : `${asset.width}×${asset.height}`}
                        {isUnused ? ' · libre' : ''}
                      </span>
                    </div>
                    {folders.length > 0 && onMoveAssetToFolder && (
                      <select
                        aria-label={`Carpeta de ${asset.name}`}
                        value={asset.folderId ?? ''}
                        onChange={(e) =>
                          onMoveAssetToFolder(asset.id, e.target.value || null)
                        }
                        className="mt-1 w-full rounded border border-[#30303a] bg-[#16161a] px-1 py-0.5 text-[10px] text-zinc-300 focus:outline-none"
                      >
                        <option value="">Sin carpeta</option>
                        {folders.map((f) => (
                          <option key={f.id} value={f.id}>
                            📁 {f.name}
                          </option>
                        ))}
                      </select>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};
