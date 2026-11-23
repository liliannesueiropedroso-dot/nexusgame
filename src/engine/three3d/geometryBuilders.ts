/**
 * Constructores de geometrías 3D modulares (Caja, Rampa, Cilindro, Arco, Plano, Esfera)
 * y deserializador de mallas CSG guardadas como JSON.
 */

import * as THREE from 'three';
import type { Mesh3DProperties, SerializedCsgGeometry } from '../core/types';
import { buildTerrainGeometry } from './terrainSystem';

export function buildRampGeometry(): THREE.BufferGeometry {
  const shape = new THREE.Shape();
  shape.moveTo(-0.5, -0.5);
  shape.lineTo(0.5, -0.5);
  shape.lineTo(-0.5, 0.5);
  shape.closePath();

  const extrude = new THREE.ExtrudeGeometry(shape, {
    depth: 1,
    bevelEnabled: false,
    steps: 1,
  });
  extrude.translate(0, 0, -0.5);
  extrude.computeVertexNormals();
  return extrude;
}

export function buildStairsGeometry(steps = 6): THREE.BufferGeometry {
  const n = Math.max(3, Math.min(12, Math.round(steps)));
  const shape = new THREE.Shape();
  shape.moveTo(-0.5, -0.5);
  shape.lineTo(0.5, -0.5);
  const stepW = 1 / n;
  const stepH = 1 / n;
  // Escalonado ascendente de derecha (+0.5, -0.5) hacia arriba-izquierda (-0.5, +0.5)
  // o de izquierda (-0.5, -0.5) a derecha (+0.5, +0.5): subiendo de -X hacia +X o +X hacia -X.
  // Igual que buildRampGeometry (sube hacia -X o +X): en buildRamp (-0.5,+0.5) es la cima, (+0.5,-0.5) la base.
  // Construyamos escalones subiendo de +0.5 (base baja) hacia -0.5 (cima alta) para coincidir con Rampa.
  for (let i = 0; i < n; i++) {
    const xRight = 0.5 - i * stepW;
    const yTop = -0.5 + (i + 1) * stepH;
    shape.lineTo(xRight, yTop);
    shape.lineTo(xRight - stepW, yTop);
  }
  shape.closePath();

  const extrude = new THREE.ExtrudeGeometry(shape, {
    depth: 1,
    bevelEnabled: false,
    steps: 1,
  });
  extrude.translate(0, 0, -0.5);
  extrude.computeVertexNormals();
  return extrude;
}

export function buildArchGeometry(): THREE.BufferGeometry {
  const outer = new THREE.Shape();
  outer.moveTo(-0.5, -0.5);
  outer.lineTo(0.5, -0.5);
  outer.lineTo(0.5, 0.5);
  outer.lineTo(-0.5, 0.5);
  outer.closePath();

  const hole = new THREE.Path();
  hole.moveTo(-0.28, -0.5);
  hole.lineTo(0.28, -0.5);
  hole.lineTo(0.28, 0.05);
  hole.absarc(0, 0.05, 0.28, 0, Math.PI, false);
  hole.lineTo(-0.28, -0.5);
  outer.holes.push(hole);

  const extrude = new THREE.ExtrudeGeometry(outer, {
    depth: 1,
    bevelEnabled: false,
    curveSegments: 16,
  });
  extrude.translate(0, 0, -0.5);
  extrude.computeVertexNormals();
  return extrude;
}

export function serializeBufferGeometry(geometry: THREE.BufferGeometry): SerializedCsgGeometry {
  const posAttr = geometry.getAttribute('position');
  const normAttr = geometry.getAttribute('normal');
  const uvAttr = geometry.getAttribute('uv');
  const idx = geometry.getIndex();

  const positions = posAttr ? Array.from(posAttr.array as Float32Array) : [];
  const normals = normAttr ? Array.from(normAttr.array as Float32Array) : [];
  const uvs = uvAttr ? Array.from(uvAttr.array as Float32Array) : undefined;
  const indices = idx ? Array.from(idx.array as Iterable<number>) : undefined;

  return { positions, normals, uvs, indices };
}

export function deserializeBufferGeometry(data: SerializedCsgGeometry): THREE.BufferGeometry {
  const geom = new THREE.BufferGeometry();
  geom.setAttribute('position', new THREE.Float32BufferAttribute(data.positions, 3));
  if (data.normals && data.normals.length === data.positions.length) {
    geom.setAttribute('normal', new THREE.Float32BufferAttribute(data.normals, 3));
  }
  if (data.uvs && data.uvs.length > 0) {
    geom.setAttribute('uv', new THREE.Float32BufferAttribute(data.uvs, 2));
  }
  if (data.indices && data.indices.length > 0) {
    geom.setIndex(data.indices);
  }
  if (!data.normals || data.normals.length !== data.positions.length) {
    geom.computeVertexNormals();
  }
  geom.computeBoundingBox();
  geom.computeBoundingSphere();
  return geom;
}

export function buildModularGeometry(mesh3d: Mesh3DProperties): THREE.BufferGeometry {
  if (mesh3d.shape === 'csg' && mesh3d.csgGeometryJson) {
    return deserializeBufferGeometry(mesh3d.csgGeometryJson);
  }
  if (mesh3d.shape === 'terrain' && mesh3d.terrainData) {
    return buildTerrainGeometry(mesh3d.terrainData);
  }
  switch (mesh3d.shape) {
    case 'box':
    case 'plane':
      return new THREE.BoxGeometry(1, 1, 1);
    case 'sphere':
      return new THREE.SphereGeometry(0.5, 24, 18);
    case 'cylinder':
      return new THREE.CylinderGeometry(0.5, 0.5, 1, 24);
    case 'ramp':
      return buildRampGeometry();
    case 'stairs':
      return buildStairsGeometry(6);
    case 'arch':
      return buildArchGeometry();
    default:
      return new THREE.BoxGeometry(1, 1, 1);
  }
}
