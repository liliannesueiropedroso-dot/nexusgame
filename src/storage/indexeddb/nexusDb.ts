import { createId } from '../../utils/id';
import type { NexusProject, NexusProjectSummary } from '../../project/models/project';
import { summarizeProject } from '../../project/models/project';

const DB_NAME = 'nexus_game_engine_db';
const DB_VERSION = 1;
const STORE_PROJECTS = 'projects';
const STORE_ASSETS = 'assets';

export interface StoredAssetBlob {
  key: string; // `${projectId}:${assetId}`
  projectId: string;
  assetId: string;
  blob: Blob;
  mimeType: string;
  updatedAt: number;
}

function makeAssetKey(projectId: string, assetId: string): string {
  return `${projectId}:${assetId}`;
}

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new Error('IndexedDB no está disponible en este navegador.'));
      return;
    }

    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_PROJECTS)) {
        const projectStore = db.createObjectStore(STORE_PROJECTS, { keyPath: 'id' });
        projectStore.createIndex('updatedAt', 'updatedAt', { unique: false });
      }
      if (!db.objectStoreNames.contains(STORE_ASSETS)) {
        const assetStore = db.createObjectStore(STORE_ASSETS, { keyPath: 'key' });
        assetStore.createIndex('projectId', 'projectId', { unique: false });
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () =>
      reject(request.error ?? new Error('No se pudo abrir la base de datos local IndexedDB.'));
  });
}

function txPromise<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('Error en operación de IndexedDB.'));
  });
}

function waitTransaction(tx: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error ?? new Error('Error en transacción de IndexedDB.'));
    tx.onabort = () => reject(tx.error ?? new Error('Transacción cancelada en IndexedDB.'));
  });
}

export class NexusIndexedDBStorage {
  async listProjects(): Promise<NexusProjectSummary[]> {
    const db = await openDatabase();
    try {
      const tx = db.transaction(STORE_PROJECTS, 'readonly');
      const store = tx.objectStore(STORE_PROJECTS);
      const all = await txPromise<NexusProject[]>(store.getAll());
      return all
        .map(summarizeProject)
        .sort((a, b) => b.updatedAt - a.updatedAt);
    } finally {
      db.close();
    }
  }

  async getProject(projectId: string): Promise<NexusProject | null> {
    const db = await openDatabase();
    try {
      const tx = db.transaction(STORE_PROJECTS, 'readonly');
      const store = tx.objectStore(STORE_PROJECTS);
      const result = await txPromise<NexusProject | undefined>(store.get(projectId));
      return result ?? null;
    } finally {
      db.close();
    }
  }

  async saveProject(project: NexusProject): Promise<NexusProject> {
    const updated: NexusProject = {
      ...project,
      updatedAt: Date.now(),
    };
    const db = await openDatabase();
    try {
      const tx = db.transaction(STORE_PROJECTS, 'readwrite');
      tx.objectStore(STORE_PROJECTS).put(updated);
      await waitTransaction(tx);
      return updated;
    } finally {
      db.close();
    }
  }

  async saveAssetBlob(
    projectId: string,
    assetId: string,
    blob: Blob,
    mimeType: string
  ): Promise<void> {
    const db = await openDatabase();
    try {
      const tx = db.transaction(STORE_ASSETS, 'readwrite');
      const record: StoredAssetBlob = {
        key: makeAssetKey(projectId, assetId),
        projectId,
        assetId,
        blob,
        mimeType,
        updatedAt: Date.now(),
      };
      tx.objectStore(STORE_ASSETS).put(record);
      await waitTransaction(tx);
    } finally {
      db.close();
    }
  }

  async getAssetBlob(projectId: string, assetId: string): Promise<Blob | null> {
    const db = await openDatabase();
    try {
      const tx = db.transaction(STORE_ASSETS, 'readonly');
      const record = await txPromise<StoredAssetBlob | undefined>(
        tx.objectStore(STORE_ASSETS).get(makeAssetKey(projectId, assetId))
      );
      return record?.blob ?? null;
    } finally {
      db.close();
    }
  }

  async getProjectAssetsMap(projectId: string): Promise<Map<string, Blob>> {
    const db = await openDatabase();
    try {
      const tx = db.transaction(STORE_ASSETS, 'readonly');
      const index = tx.objectStore(STORE_ASSETS).index('projectId');
      const records = await txPromise<StoredAssetBlob[]>(index.getAll(projectId));
      const map = new Map<string, Blob>();
      for (const rec of records) {
        map.set(rec.assetId, rec.blob);
      }
      return map;
    } finally {
      db.close();
    }
  }

  async deleteAssetBlob(projectId: string, assetId: string): Promise<void> {
    const db = await openDatabase();
    try {
      const tx = db.transaction(STORE_ASSETS, 'readwrite');
      tx.objectStore(STORE_ASSETS).delete(makeAssetKey(projectId, assetId));
      await waitTransaction(tx);
    } finally {
      db.close();
    }
  }

  async deleteProject(projectId: string): Promise<void> {
    const db = await openDatabase();
    try {
      const tx = db.transaction([STORE_PROJECTS, STORE_ASSETS], 'readwrite');
      tx.objectStore(STORE_PROJECTS).delete(projectId);

      const assetStore = tx.objectStore(STORE_ASSETS);
      const index = assetStore.index('projectId');
      const records = await txPromise<StoredAssetBlob[]>(index.getAll(projectId));
      for (const rec of records) {
        assetStore.delete(rec.key);
      }

      await waitTransaction(tx);
    } finally {
      db.close();
    }
  }

  async renameProject(projectId: string, newName: string): Promise<NexusProject | null> {
    const project = await this.getProject(projectId);
    if (!project) return null;
    const trimmed = newName.trim();
    if (!trimmed) return project;
    return this.saveProject({
      ...project,
      name: trimmed,
    });
  }

  async duplicateProject(projectId: string): Promise<NexusProject | null> {
    const original = await this.getProject(projectId);
    if (!original) return null;
    const originalAssets = await this.getProjectAssetsMap(projectId);

    const now = Date.now();
    const newId = createId('proj');
    const copy: NexusProject = {
      ...structuredClone(original),
      id: newId,
      name: `${original.name} (copia)`,
      createdAt: now,
      updatedAt: now,
    };

    const db = await openDatabase();
    try {
      const tx = db.transaction([STORE_PROJECTS, STORE_ASSETS], 'readwrite');
      tx.objectStore(STORE_PROJECTS).put(copy);
      const assetStore = tx.objectStore(STORE_ASSETS);
      for (const [assetId, blob] of originalAssets.entries()) {
        const record: StoredAssetBlob = {
          key: makeAssetKey(newId, assetId),
          projectId: newId,
          assetId,
          blob,
          mimeType: blob.type || 'application/octet-stream',
          updatedAt: now,
        };
        assetStore.put(record);
      }
      await waitTransaction(tx);
      return copy;
    } finally {
      db.close();
    }
  }

  async saveImportedProject(
    project: NexusProject,
    assetBlobs: Map<string, Blob>
  ): Promise<NexusProject> {
    const now = Date.now();
    const toSave: NexusProject = {
      ...project,
      updatedAt: now,
    };
    const db = await openDatabase();
    try {
      const tx = db.transaction([STORE_PROJECTS, STORE_ASSETS], 'readwrite');
      tx.objectStore(STORE_PROJECTS).put(toSave);
      const assetStore = tx.objectStore(STORE_ASSETS);
      for (const [assetId, blob] of assetBlobs.entries()) {
        const record: StoredAssetBlob = {
          key: makeAssetKey(toSave.id, assetId),
          projectId: toSave.id,
          assetId,
          blob,
          mimeType: blob.type || 'application/octet-stream',
          updatedAt: now,
        };
        assetStore.put(record);
      }
      await waitTransaction(tx);
      return toSave;
    } finally {
      db.close();
    }
  }
}

export const nexusStorage = new NexusIndexedDBStorage();
