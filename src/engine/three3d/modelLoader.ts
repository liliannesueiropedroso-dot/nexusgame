import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { FBXLoader } from 'three/examples/jsm/loaders/FBXLoader.js';
import type { AssetFormat } from '../../project/models/project';

export interface Model3DStatsSummary {
  triangles: number;
  vertices: number;
  meshes: number;
  bones: number;
  materials: number;
}

export interface LoadedModel3DResult {
  root: THREE.Group;
  animations: THREE.AnimationClip[];
  format: 'glb' | 'gltf' | 'fbx';
  clipNames: string[];
  boneNames: string[];
  stats: Model3DStatsSummary;
}

/**
 * Detecta si un Blob corresponde a GLB, GLTF o FBX leyendo sus primeros bytes si no hay nombre.
 */
export async function detectModel3DFormatFromBlob(
  blob: Blob,
  hintFormatOrFilename?: AssetFormat | string | null
): Promise<'glb' | 'gltf' | 'fbx'> {
  if (hintFormatOrFilename) {
    const low = String(hintFormatOrFilename).toLowerCase();
    if (low === 'fbx' || low.endsWith('.fbx')) return 'fbx';
    if (low === 'gltf' || low.endsWith('.gltf')) return 'gltf';
    if (low === 'glb' || low.endsWith('.glb')) return 'glb';
  }
  try {
    const headBuf = await blob.slice(0, 32).arrayBuffer();
    const bytes = new Uint8Array(headBuf);
    // GLB: magic "glTF" (0x67 0x6C 0x54 0x46)
    if (bytes[0] === 0x67 && bytes[1] === 0x6c && bytes[2] === 0x54 && bytes[3] === 0x46) {
      return 'glb';
    }
    const headText = new TextDecoder().decode(bytes);
    if (headText.includes('Kaydara FBX') || headText.includes('; FBX')) {
      return 'fbx';
    }
    if (headText.trimStart().startsWith('{')) {
      return 'gltf';
    }
  } catch {
    // Fallback por defecto
  }
  return 'glb';
}

export function computeModel3DStats(root: THREE.Object3D): Model3DStatsSummary {
  let triangles = 0;
  let vertices = 0;
  let meshes = 0;
  let bones = 0;
  const matSet = new Set<THREE.Material>();

  root.traverse((obj) => {
    if ((obj as THREE.Bone).isBone) {
      bones++;
    }
    if ((obj as THREE.Mesh).isMesh) {
      meshes++;
      const mesh = obj as THREE.Mesh;
      const g = mesh.geometry;
      if (g) {
        const pos = g.getAttribute('position');
        if (pos) vertices += pos.count;
        if (g.index) triangles += Math.floor(g.index.count / 3);
        else if (pos) triangles += Math.floor(pos.count / 3);
      }
      const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
      for (const m of mats) if (m) matSet.add(m);
    }
  });

  return {
    triangles,
    vertices,
    meshes,
    bones,
    materials: matSet.size,
  };
}

/**
 * Normaliza la escala y el pivote del modelo cargado dentro de un contenedor neutro `Group`
 * para que sus pies (box.min.y) apoyen exactamente en `-targetSize * 0.5` (-0.5 por defecto),
 * coincidiendo con la base inferior del colisionador 3D sin hundirse ni flotar,
 * y evitando que modelos FBX en centímetros (p. ej. Mixamo ~180u) salgan gigantes o desplazados.
 */
export function normalizeModelRoot3D(
  loadedRoot: THREE.Object3D,
  targetSize = 1.0
): THREE.Group {
  const wrapper = new THREE.Group();
  loadedRoot.updateMatrixWorld(true);
  loadedRoot.traverse((obj) => {
    const sm = obj as THREE.SkinnedMesh;
    if (sm.isSkinnedMesh && sm.skeleton) {
      sm.skeleton.update();
    }
  });

  const box = new THREE.Box3().setFromObject(loadedRoot);
  if (box.isEmpty()) {
    loadedRoot.traverse((obj) => {
      if ((obj as THREE.Bone).isBone) {
        const wp = new THREE.Vector3();
        obj.getWorldPosition(wp);
        box.expandByPoint(wp);
      }
    });
  }

  let halfExtents = { x: targetSize * 0.5, y: targetSize * 0.5, z: targetSize * 0.5 };
  if (!box.isEmpty()) {
    const size = new THREE.Vector3();
    const center = new THREE.Vector3();
    box.getSize(size);
    box.getCenter(center);
    const maxDim = Math.max(0.001, size.x, size.y, size.z);
    const scale = targetSize / maxDim;
    loadedRoot.scale.multiplyScalar(scale);
    // Centrar en X/Z y apoyar la planta mínima exactamente en `-targetSize * 0.5`
    const bottomOffsetY = -targetSize * 0.5 - box.min.y * scale;
    loadedRoot.position.set(
      loadedRoot.position.x - center.x * scale,
      loadedRoot.position.y + bottomOffsetY,
      loadedRoot.position.z - center.z * scale
    );
    halfExtents = {
      x: Math.max(0.1, (size.x * scale) * 0.5),
      y: Math.max(0.1, (size.y * scale) * 0.5),
      z: Math.max(0.1, (size.z * scale) * 0.5),
    };
  }

  wrapper.add(loadedRoot);
  wrapper.updateMatrixWorld(true);
  wrapper.userData.normalizedBounds = { targetSize, halfExtents };
  return wrapper;
}

function normalizeBoneKey(name: string): string {
  return name
    .replace(/^mixamorig\d*[:_]?/i, '')
    .replace(/^armature[|/:._-]?/i, '')
    .replace(/^character\d*[|/:._-]?/i, '')
    .replace(/^bip\d*\s*/i, '')
    .replace(/^[^|/:]+[|/:]/, '')
    .replace(/[^a-z0-9]/gi, '')
    .toLowerCase()
    .trim();
}

function isHipOrRootBoneKey(nk: string): boolean {
  return (
    nk === 'hips' ||
    nk === 'pelvis' ||
    nk === 'root' ||
    nk === 'rootmotion' ||
    nk === 'armature' ||
    nk === 'bip01'
  );
}

/**
 * Reasigna los nombres de huesos de un AnimationClip externo (.fbx / .glb)
 * para coincidir con el esqueleto destino, elimina pistas `.scale` que deforman
 * o escalan mal esqueletos normalizados, y neutraliza el root-motion XZ / escala Y de cadera Mixamo.
 */
export function retargetClipForRoot(
  clip: THREE.AnimationClip,
  targetRoot: THREE.Object3D
): THREE.AnimationClip {
  const exactNames = new Set<string>();
  const normalizedMap = new Map<string, string>();
  const nodeByName = new Map<string, THREE.Object3D>();

  targetRoot.traverse((node) => {
    if (node.name) {
      exactNames.add(node.name);
      nodeByName.set(node.name, node);
      const nk = normalizeBoneKey(node.name);
      if (nk && !normalizedMap.has(nk)) {
        normalizedMap.set(nk, node.name);
      }
    }
  });

  if (exactNames.size === 0) return clip;

  let changed = false;
  const nextTracks: THREE.KeyframeTrack[] = [];

  for (const track of clip.tracks) {
    const dotIdx = track.name.indexOf('.');
    if (dotIdx <= 0) {
      nextTracks.push(track);
      continue;
    }
    const targetNode = track.name.slice(0, dotIdx);
    const propPath = track.name.slice(dotIdx);

    // Eliminar pistas .scale sobre huesos para evitar saltos de escala 100x (cm <-> m) o colapso
    if (propPath === '.scale') {
      const nk = normalizeBoneKey(targetNode);
      const destName = exactNames.has(targetNode) ? targetNode : normalizedMap.get(nk);
      const destObj = destName ? nodeByName.get(destName) : undefined;
      if (!destObj || (destObj as THREE.Bone).isBone || isHipOrRootBoneKey(nk)) {
        changed = true;
        continue;
      }
    }

    const resolvedName = exactNames.has(targetNode)
      ? targetNode
      : normalizedMap.get(normalizeBoneKey(targetNode));

    if (!resolvedName) {
      nextTracks.push(track);
      continue;
    }

    const nk = normalizeBoneKey(resolvedName);
    const isPos = propPath === '.position';
    const isHipPos = isPos && isHipOrRootBoneKey(nk);

    if (resolvedName === targetNode && !isHipPos) {
      nextTracks.push(track);
      continue;
    }

    const cloned = track.clone();
    cloned.name = `${resolvedName}${propPath}`;

    // Neutralizar desplazamiento XZ (root-motion) y reescalar Y respecto a la cadera en reposo
    if (isHipPos && cloned.values && cloned.values.length >= 3) {
      const destObj = nodeByName.get(resolvedName);
      const restX = destObj ? destObj.position.x : 0;
      const restY = destObj ? destObj.position.y : cloned.values[1];
      const restZ = destObj ? destObj.position.z : 0;
      const srcBaseY = Math.abs(cloned.values[1]) > 1e-4 ? cloned.values[1] : 1;
      const ratioY = Math.abs(restY) > 1e-4 ? restY / srcBaseY : 1;

      const nextVals = new Float32Array(cloned.values.length);
      for (let i = 0; i + 2 < cloned.values.length; i += 3) {
        nextVals[i] = restX;
        nextVals[i + 1] = cloned.values[i + 1] * ratioY;
        nextVals[i + 2] = restZ;
      }
      cloned.values = nextVals;
    }

    changed = true;
    nextTracks.push(cloned);
  }

  if (!changed) return clip;
  return new THREE.AnimationClip(clip.name, clip.duration, nextTracks, clip.blendMode);
}

/**
 * Carga un modelo o archivo de animación 3D (.glb, .gltf, .fbx) desde un Blob en memoria.
 */
export async function loadModel3DFromBlob(
  blob: Blob,
  hintFormatOrFilename?: AssetFormat | string | null,
  options?: { normalizeSize?: number | false }
): Promise<LoadedModel3DResult> {
  const fmt = await detectModel3DFormatFromBlob(blob, hintFormatOrFilename);
  const url = URL.createObjectURL(blob);

  try {
    let rawRoot: THREE.Group;
    let animations: THREE.AnimationClip[];

    if (fmt === 'fbx') {
      const fbxLoader = new FBXLoader();
      rawRoot = await fbxLoader.loadAsync(url);
      animations = Array.isArray(rawRoot.animations) ? [...rawRoot.animations] : [];
    } else {
      const gltfLoader = new GLTFLoader();
      const gltf = await gltfLoader.loadAsync(url);
      rawRoot = gltf.scene ?? new THREE.Group();
      animations = Array.isArray(gltf.animations) ? [...gltf.animations] : [];
    }

    const stats = computeModel3DStats(rawRoot);
    const boneSet = new Set<string>();
    rawRoot.traverse((node) => {
      if ((node as THREE.Bone).isBone && node.name) {
        boneSet.add(node.name);
      }
    });
    const boneNames = Array.from(boneSet);
    const targetSize = options?.normalizeSize === false ? undefined : (options?.normalizeSize ?? 1.0);
    const root = targetSize !== undefined ? normalizeModelRoot3D(rawRoot, targetSize) : rawRoot;
    const clipNames = animations.map((c, idx) => c.name || `Clip_${idx + 1}`);

    return {
      root,
      animations,
      format: fmt,
      clipNames,
      boneNames,
      stats,
    };
  } finally {
    URL.revokeObjectURL(url);
  }
}

const boneNamesCache = new WeakMap<Blob, Promise<string[]>>();

export function extractModelBoneNames(
  blob: Blob,
  hintFormatOrFilename?: AssetFormat | string | null
): Promise<string[]> {
  const existing = boneNamesCache.get(blob);
  if (existing) return existing;
  const p = loadModel3DFromBlob(blob, hintFormatOrFilename, { normalizeSize: false })
    .then((res) => res.boneNames)
    .catch(() => []);
  boneNamesCache.set(blob, p);
  return p;
}
