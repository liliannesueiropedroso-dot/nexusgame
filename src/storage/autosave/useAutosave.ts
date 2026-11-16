import { useEffect, useRef } from 'react';
import type { NexusProject } from '../../project/models/project';
import { nexusStorage } from '../indexeddb/nexusDb';

export type SaveStatus = 'saved' | 'saving' | 'dirty' | 'error';

export function useAutosave(
  project: NexusProject | null,
  isDirty: boolean,
  enabled: boolean,
  onStatusChange: (status: SaveStatus, savedAt?: number, errorMsg?: string) => void,
  delayMs = 1200
): void {
  const timerRef = useRef<number | null>(null);
  const savingRef = useRef(false);

  useEffect(() => {
    if (!project || !isDirty || !enabled) return;

    if (timerRef.current !== null) {
      window.clearTimeout(timerRef.current);
    }

    timerRef.current = window.setTimeout(async () => {
      if (savingRef.current) return;
      savingRef.current = true;
      onStatusChange('saving');
      try {
        const saved = await nexusStorage.saveProject(project);
        onStatusChange('saved', saved.updatedAt);
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Error al autoguardar';
        onStatusChange('error', undefined, msg);
      } finally {
        savingRef.current = false;
      }
    }, delayMs);

    return () => {
      if (timerRef.current !== null) {
        window.clearTimeout(timerRef.current);
        timerRef.current = null;
      }
    };
  }, [project, isDirty, enabled, delayMs, onStatusChange]);
}
