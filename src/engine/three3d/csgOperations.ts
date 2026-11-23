/**
 * Operaciones Booleanas CSG reales mediante `three-bvh-csg`.
 * Permite unir (ADDITION) o perforar/sustraer (SUBTRACTION) objetos 3D directamente en el editor,
 * recalculando normales suavizadas y devolviendo geometría serializada lista para el proyecto y exportación HTML5.
 */

import * as THREE from 'three';
import { ADDITION, Brush, Evaluator, SUBTRACTION } from 'three-bvh-csg';
import type { GameObjectData, SerializedCsgGeometry } from '../core/types';
import { buildModularGeometry, serializeBufferGeometry } from './geometryBuilders';

export type CsgBooleanMode = 'union' | 'subtract';

function makeWorldBrush(obj: GameObjectData): Brush {
  const geom = obj.mesh3d ? buildModularGeometry(obj.mesh3d) : new THREE.BoxGeometry(1, 1, 1);
  const nonIndexed = geom.index ? geom.toNonIndexed() : geom.clone();
  if (!nonIndexed.getAttribute('uv')) {
    const count = nonIndexed.getAttribute('position').count;
    nonIndexed.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(count * 2), 2));
  }
  nonIndexed.computeVertexNormals();
  geom.dispose();

  const t = obj.transform3d ?? {
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
  const mat = new THREE.Matrix4().compose(
    new THREE.Vector3(t.x, t.y, t.z),
    new THREE.Quaternion().setFromEuler(
      new THREE.Euler(
        THREE.MathUtils.degToRad(t.rx),
        THREE.MathUtils.degToRad(t.ry),
        THREE.MathUtils.degToRad(t.rz)
      )
    ),
    new THREE.Vector3(Math.max(0.05, t.sx), Math.max(0.05, t.sy), Math.max(0.05, t.sz))
  );
  nonIndexed.applyMatrix4(mat);
  nonIndexed.computeVertexNormals();

  const brush = new Brush(nonIndexed, new THREE.MeshStandardMaterial());
  brush.updateMatrixWorld(true);
  return brush;
}

export interface CsgOperationResult {
  geometryJson: SerializedCsgGeometry;
  center: { x: number; y: number; z: number };
  vertexCount: number;
}

export function performCsgOperation(
  baseObj: GameObjectData,
  toolObjects: GameObjectData[],
  mode: CsgBooleanMode
): CsgOperationResult {
  if (toolObjects.length === 0) {
    throw new Error('Se requieren al menos dos objetos 3D para ejecutar una operación booleana CSG.');
  }
  const evaluator = new Evaluator();
  evaluator.useGroups = false;
  evaluator.attributes = ['position', 'normal', 'uv'];

  let currentBrush = makeWorldBrush(baseObj);
  const op = mode === 'union' ? ADDITION : SUBTRACTION;

  for (const tool of toolObjects) {
    const toolBrush = makeWorldBrush(tool);
    const nextBrush = evaluator.evaluate(currentBrush, toolBrush, op);
    currentBrush.geometry.dispose();
    toolBrush.geometry.dispose();
    currentBrush = nextBrush;
  }

  const outGeom = currentBrush.geometry;
  outGeom.computeBoundingBox();
  const box = outGeom.boundingBox ?? new THREE.Box3();
  const centerVec = new THREE.Vector3();
  box.getCenter(centerVec);

  // Centrar vértices alrededor de (0,0,0) y colocar el objeto resultante en centerVec con escala 1,1,1
  outGeom.translate(-centerVec.x, -centerVec.y, -centerVec.z);
  outGeom.computeVertexNormals();
  outGeom.computeBoundingBox();
  outGeom.computeBoundingSphere();

  const vertexCount = outGeom.getAttribute('position')?.count ?? 0;
  const geometryJson = serializeBufferGeometry(outGeom);
  outGeom.dispose();

  return {
    geometryJson,
    center: { x: centerVec.x, y: centerVec.y, z: centerVec.z },
    vertexCount,
  };
}
