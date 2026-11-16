import { createId } from '../../utils/id';
import type { GameObjectData } from './types';

export interface SceneTreeNode {
  object: GameObjectData;
  depth: number;
  children: SceneTreeNode[];
}

export function buildObjectMap(objects: GameObjectData[]): Map<string, GameObjectData> {
  const map = new Map<string, GameObjectData>();
  for (const obj of objects) {
    map.set(obj.id, obj);
  }
  return map;
}

/**
 * Construye el árbol jerárquico respetando el orden del arreglo de objetos.
 */
export function buildSceneTree(objects: GameObjectData[]): SceneTreeNode[] {
  const map = buildObjectMap(objects);
  const childrenByParent = new Map<string | null, GameObjectData[]>();

  for (const obj of objects) {
    const validParentId = obj.parentId && map.has(obj.parentId) && obj.parentId !== obj.id
      ? obj.parentId
      : null;
    const list = childrenByParent.get(validParentId) ?? [];
    list.push(obj);
    childrenByParent.set(validParentId, list);
  }

  const visited = new Set<string>();
  const buildNodes = (parentId: string | null, depth: number): SceneTreeNode[] => {
    const items = childrenByParent.get(parentId) ?? [];
    const nodes: SceneTreeNode[] = [];
    for (const item of items) {
      if (visited.has(item.id)) continue;
      visited.add(item.id);
      nodes.push({
        object: item,
        depth,
        children: buildNodes(item.id, depth + 1),
      });
    }
    return nodes;
  };

  return buildNodes(null, 0);
}

/**
 * Devuelve todos los IDs descendientes de un objeto (útil para eliminar o evitar ciclos al reparentar).
 */
export function getDescendantIds(objects: GameObjectData[], rootId: string): Set<string> {
  const result = new Set<string>();
  const queue = [rootId];

  while (queue.length > 0) {
    const currentId = queue.shift()!;
    for (const obj of objects) {
      if (obj.parentId === currentId && !result.has(obj.id)) {
        result.add(obj.id);
        queue.push(obj.id);
      }
    }
  }
  return result;
}

export function isDescendantOf(
  objects: GameObjectData[],
  candidateChildId: string,
  potentialAncestorId: string
): boolean {
  if (candidateChildId === potentialAncestorId) return true;
  const descendants = getDescendantIds(objects, potentialAncestorId);
  return descendants.has(candidateChildId);
}

export function updateObjectById(
  objects: GameObjectData[],
  id: string,
  updater: (obj: GameObjectData) => GameObjectData
): GameObjectData[] {
  return objects.map((obj) => (obj.id === id ? updater(obj) : obj));
}

export function removeObjectsByIds(
  objects: GameObjectData[],
  idsToRemove: string[]
): GameObjectData[] {
  const allToDelete = new Set<string>(idsToRemove);
  for (const id of idsToRemove) {
    const desc = getDescendantIds(objects, id);
    desc.forEach((d) => allToDelete.add(d));
  }
  return objects.filter((obj) => !allToDelete.has(obj.id));
}

/**
 * Duplica los objetos seleccionados (incluyendo descendientes si se duplica un contenedor),
 * generando nuevos identificadores únicos y desplazando ligeramente las raíces duplicadas.
 */
export function duplicateObjectsByIds(
  objects: GameObjectData[],
  selectedIds: string[],
  offset = { x: 24, y: 24 }
): { objects: GameObjectData[]; duplicatedIds: string[] } {
  const selectedSet = new Set(selectedIds);
  // Evitar duplicar dos veces si un hijo y su padre están seleccionados
  const topSelected = selectedIds.filter((id) => {
    const obj = objects.find((o) => o.id === id);
    if (!obj) return false;
    let p = obj.parentId;
    while (p) {
      if (selectedSet.has(p)) return false;
      p = objects.find((o) => o.id === p)?.parentId ?? null;
    }
    return true;
  });

  if (topSelected.length === 0) {
    return { objects, duplicatedIds: [] };
  }

  const nextObjects = [...objects];
  const duplicatedRootIds: string[] = [];

  const cloneSubtree = (
    source: GameObjectData,
    newParentId: string | null,
    isRoot: boolean
  ) => {
    const newId = createId('obj');
    const cloned: GameObjectData = structuredClone(source);
    cloned.id = newId;
    cloned.parentId = newParentId;
    cloned.name = isRoot ? `${source.name} (copia)` : source.name;
    if (isRoot) {
      cloned.transform.x = Math.round((cloned.transform.x + offset.x) * 100) / 100;
      cloned.transform.y = Math.round((cloned.transform.y + offset.y) * 100) / 100;
      duplicatedRootIds.push(newId);
    }
    nextObjects.push(cloned);

    const children = objects.filter((o) => o.parentId === source.id);
    for (const child of children) {
      cloneSubtree(child, newId, false);
    }
  };

  for (const rootId of topSelected) {
    const source = objects.find((o) => o.id === rootId);
    if (source) {
      cloneSubtree(source, source.parentId, true);
    }
  }

  return { objects: nextObjects, duplicatedIds: duplicatedRootIds };
}

/**
 * Mueve un objeto arriba o abajo entre sus hermanos del mismo padre (cambia el orden de renderizado Z).
 */
export function moveSiblingOrder(
  objects: GameObjectData[],
  objectId: string,
  direction: 'up' | 'down'
): GameObjectData[] {
  const target = objects.find((o) => o.id === objectId);
  if (!target) return objects;

  const siblingIndices: number[] = [];
  objects.forEach((o, idx) => {
    if (o.parentId === target.parentId) siblingIndices.push(idx);
  });

  const posInSiblings = siblingIndices.findIndex((idx) => objects[idx].id === objectId);
  if (posInSiblings === -1) return objects;

  const swapWithPos = direction === 'up' ? posInSiblings - 1 : posInSiblings + 1;
  if (swapWithPos < 0 || swapWithPos >= siblingIndices.length) return objects;

  const idxA = siblingIndices[posInSiblings];
  const idxB = siblingIndices[swapWithPos];
  const copy = [...objects];
  const temp = copy[idxA];
  copy[idxA] = copy[idxB];
  copy[idxB] = temp;
  return copy;
}

/**
 * Cambia el padre de un objeto validando que no se creen ciclos jerárquicos
 * y que el destino sea un contenedor (o null para raíz).
 */
export function reparentObject(
  objects: GameObjectData[],
  objectId: string,
  newParentId: string | null
): GameObjectData[] {
  if (objectId === newParentId) return objects;
  if (newParentId !== null) {
    const parent = objects.find((o) => o.id === newParentId);
    if (!parent || parent.type !== 'container') return objects;
    if (isDescendantOf(objects, newParentId, objectId)) return objects;
  }
  return updateObjectById(objects, objectId, (obj) => ({
    ...obj,
    parentId: newParentId,
  }));
}
