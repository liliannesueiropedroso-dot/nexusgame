import * as THREE from 'three';
import { createId } from '../../utils/id';
import { degToRad, getWorldTransform } from './math';
import { createGameObject } from '../objects/factory';
import type { GameObjectData, Transform3D } from './types';

export interface SceneTreeNode {
  object: GameObjectData;
  depth: number;
  children: SceneTreeNode[];
}

const _m4 = new THREE.Matrix4();
const _mParentInv = new THREE.Matrix4();
const _mLocal = new THREE.Matrix4();
const _vPos = new THREE.Vector3();
const _qRot = new THREE.Quaternion();
const _eRot = new THREE.Euler();
const _vScale = new THREE.Vector3();

function localMatrix3D(t: Transform3D): THREE.Matrix4 {
  const pos = new THREE.Vector3(t.x, t.y, t.z);
  const euler = new THREE.Euler(
    THREE.MathUtils.degToRad(t.rx),
    THREE.MathUtils.degToRad(t.ry),
    THREE.MathUtils.degToRad(t.rz),
    'XYZ'
  );
  const quat = new THREE.Quaternion().setFromEuler(euler);
  const scale = new THREE.Vector3(t.sx, t.sy, t.sz);
  return new THREE.Matrix4().compose(pos, quat, scale);
}

/**
 * Calcula la matriz y transformación global 3D acumulada de un objeto siguiendo su cadena `parentId`.
 */
export function getWorldTransform3D(
  obj: GameObjectData,
  objectMap: Map<string, GameObjectData>
): Transform3D {
  const chain: GameObjectData[] = [];
  let current: GameObjectData | undefined = obj;
  const visited = new Set<string>();
  while (current && !visited.has(current.id)) {
    visited.add(current.id);
    chain.unshift(current);
    current = current.parentId ? objectMap.get(current.parentId) : undefined;
  }

  _m4.identity();
  for (const node of chain) {
    const t3 = node.transform3d ?? {
      x: 0,
      y: 0,
      z: 0,
      rx: 0,
      ry: 0,
      rz: 0,
      sx: 1,
      sy: 1,
      sz: 1,
    };
    _m4.multiply(localMatrix3D(t3));
  }

  _m4.decompose(_vPos, _qRot, _vScale);
  _eRot.setFromQuaternion(_qRot, 'XYZ');
  return {
    x: Math.round(_vPos.x * 1000) / 1000,
    y: Math.round(_vPos.y * 1000) / 1000,
    z: Math.round(_vPos.z * 1000) / 1000,
    rx: Math.round(THREE.MathUtils.radToDeg(_eRot.x) * 100) / 100,
    ry: Math.round(THREE.MathUtils.radToDeg(_eRot.y) * 100) / 100,
    rz: Math.round(THREE.MathUtils.radToDeg(_eRot.z) * 100) / 100,
    sx: Math.round(_vScale.x * 1000) / 1000,
    sy: Math.round(_vScale.y * 1000) / 1000,
    sz: Math.round(_vScale.z * 1000) / 1000,
  };
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
      if (cloned.transform3d) {
        cloned.transform3d.x = Math.round((cloned.transform3d.x + 1) * 100) / 100;
      }
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

export interface ReparentOptions {
  /** Por defecto true: conserva la posición, rotación y escala global exacta en la escena (2D y 3D). */
  preserveWorldTransform?: boolean;
  /** Por defecto true: permite emparentar bajo cualquier objeto no cíclico (panel, malla 3D, contenedor, etc.). */
  allowAnyParent?: boolean;
}

/**
 * Cambia el padre de un objeto validando ciclos jerárquicos y recalculando
 * sus coordenadas locales para que NO salte ni cambie de posición en la escena.
 */
export function reparentObject(
  objects: GameObjectData[],
  objectId: string,
  newParentId: string | null,
  options?: ReparentOptions
): GameObjectData[] {
  const preserveWorld = options?.preserveWorldTransform ?? true;
  const allowAnyParent = options?.allowAnyParent ?? true;
  if (objectId === newParentId) return objects;

  const map = buildObjectMap(objects);
  const child = map.get(objectId);
  if (!child) return objects;
  if (child.parentId === newParentId) return objects;

  let newParent: GameObjectData | undefined;
  if (newParentId !== null) {
    newParent = map.get(newParentId);
    if (!newParent) return objects;
    if (!allowAnyParent && newParent.type !== 'container') return objects;
    if (isDescendantOf(objects, newParentId, objectId)) return objects;
  }

  if (!preserveWorld) {
    return updateObjectById(objects, objectId, (obj) => ({
      ...obj,
      parentId: newParentId,
    }));
  }

  // 1) Preservar transformación mundial 2D
  const world2d = getWorldTransform(child, map);
  let nextTransform2d = { ...child.transform };
  if (newParent) {
    const parentWorld2d = getWorldTransform(newParent, map);
    const dx = world2d.x - parentWorld2d.x;
    const dy = world2d.y - parentWorld2d.y;
    const rad = -degToRad(parentWorld2d.rotation);
    const cos = Math.cos(rad);
    const sin = Math.sin(rad);
    const rx = dx * cos - dy * sin;
    const ry = dx * sin + dy * cos;
    const psx = Math.abs(parentWorld2d.scaleX) < 0.0001 ? 1 : parentWorld2d.scaleX;
    const psy = Math.abs(parentWorld2d.scaleY) < 0.0001 ? 1 : parentWorld2d.scaleY;
    nextTransform2d = {
      ...child.transform,
      x: Math.round((rx / psx) * 100) / 100,
      y: Math.round((ry / psy) * 100) / 100,
      rotation: Math.round((world2d.rotation - parentWorld2d.rotation) * 100) / 100,
      scaleX: Math.round((world2d.scaleX / psx) * 10000) / 10000,
      scaleY: Math.round((world2d.scaleY / psy) * 10000) / 10000,
    };
  } else {
    nextTransform2d = {
      ...child.transform,
      x: Math.round(world2d.x * 100) / 100,
      y: Math.round(world2d.y * 100) / 100,
      rotation: Math.round(world2d.rotation * 100) / 100,
      scaleX: Math.round(world2d.scaleX * 10000) / 10000,
      scaleY: Math.round(world2d.scaleY * 10000) / 10000,
    };
  }

  // 2) Preservar transformación mundial 3D (si existe transform3d o si está en escena 3D)
  let nextTransform3d = child.transform3d ? { ...child.transform3d } : undefined;
  if (child.transform3d) {
    const childWorld3d = getWorldTransform3D(child, map);
    const childWorldMat = localMatrix3D(childWorld3d);
    if (newParent) {
      const parentWorld3d = getWorldTransform3D(newParent, map);
      const parentWorldMat = localMatrix3D(parentWorld3d);
      _mParentInv.copy(parentWorldMat).invert();
      _mLocal.multiplyMatrices(_mParentInv, childWorldMat);
      _mLocal.decompose(_vPos, _qRot, _vScale);
      _eRot.setFromQuaternion(_qRot, 'XYZ');
      nextTransform3d = {
        x: Math.round(_vPos.x * 1000) / 1000,
        y: Math.round(_vPos.y * 1000) / 1000,
        z: Math.round(_vPos.z * 1000) / 1000,
        rx: Math.round(THREE.MathUtils.radToDeg(_eRot.x) * 100) / 100,
        ry: Math.round(THREE.MathUtils.radToDeg(_eRot.y) * 100) / 100,
        rz: Math.round(THREE.MathUtils.radToDeg(_eRot.z) * 100) / 100,
        sx: Math.round(_vScale.x * 1000) / 1000,
        sy: Math.round(_vScale.y * 1000) / 1000,
        sz: Math.round(_vScale.z * 1000) / 1000,
      };
    } else {
      nextTransform3d = childWorld3d;
    }
  }

  return updateObjectById(objects, objectId, (obj) => ({
    ...obj,
    parentId: newParentId,
    transform: nextTransform2d,
    ...(nextTransform3d ? { transform3d: nextTransform3d } : {}),
  }));
}

/**
 * Agrupa los objetos seleccionados dentro de una nueva carpeta (`container`)
 * manteniendo la posición mundial exacta de cada objeto sin mover nada en pantalla.
 */
export function groupObjectsInFolder(
  objects: GameObjectData[],
  selectedIds: string[],
  folderName = 'Grupo'
): { objects: GameObjectData[]; folderId: string | null } {
  if (selectedIds.length === 0) return { objects, folderId: null };
  const selectedSet = new Set(selectedIds);
  const topIds = selectedIds.filter((id) => {
    const obj = objects.find((o) => o.id === id);
    if (!obj) return false;
    let p = obj.parentId;
    while (p) {
      if (selectedSet.has(p)) return false;
      p = objects.find((o) => o.id === p)?.parentId ?? null;
    }
    return true;
  });
  if (topIds.length === 0) return { objects, folderId: null };

  const map = buildObjectMap(objects);
  let sumX = 0;
  let sumY = 0;
  let sumX3 = 0;
  let sumY3 = 0;
  let sumZ3 = 0;
  let count3 = 0;
  for (const id of topIds) {
    const o = map.get(id);
    if (!o) continue;
    const w2 = getWorldTransform(o, map);
    sumX += w2.x;
    sumY += w2.y;
    if (o.transform3d) {
      const w3 = getWorldTransform3D(o, map);
      sumX3 += w3.x;
      sumY3 += w3.y;
      sumZ3 += w3.z;
      count3++;
    }
  }

  const firstObj = map.get(topIds[0]);
  const sharedParentId = topIds.every((id) => map.get(id)?.parentId === firstObj?.parentId)
    ? (firstObj?.parentId ?? null)
    : null;

  const cx = Math.round((sumX / topIds.length) * 100) / 100;
  const cy = Math.round((sumY / topIds.length) * 100) / 100;
  const folder = createGameObject('container', objects, {
    name: folderName,
    x: cx,
    y: cy,
    parentId: null,
  });
  if (count3 > 0) {
    folder.transform3d = {
      x: Math.round((sumX3 / count3) * 1000) / 1000,
      y: Math.round((sumY3 / count3) * 1000) / 1000,
      z: Math.round((sumZ3 / count3) * 1000) / 1000,
      rx: 0,
      ry: 0,
      rz: 0,
      sx: 1,
      sy: 1,
      sz: 1,
    };
  }

  let next = [...objects, folder];
  if (sharedParentId) {
    next = reparentObject(next, folder.id, sharedParentId, { preserveWorldTransform: true });
  }
  for (const id of topIds) {
    next = reparentObject(next, id, folder.id, { preserveWorldTransform: true });
  }
  return { objects: next, folderId: folder.id };
}

/**
 * Saca todos los hijos directos de una carpeta conservando su posición exacta y elimina la carpeta.
 */
export function ungroupFolder(objects: GameObjectData[], folderId: string): GameObjectData[] {
  const folder = objects.find((o) => o.id === folderId);
  if (!folder) return objects;
  const childIds = objects.filter((o) => o.parentId === folderId).map((o) => o.id);
  let next = objects;
  for (const cid of childIds) {
    next = reparentObject(next, cid, folder.parentId, { preserveWorldTransform: true });
  }
  return next.filter((o) => o.id !== folderId);
}

