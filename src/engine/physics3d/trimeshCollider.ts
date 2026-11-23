import * as THREE from 'three';
import type { GameObjectData } from '../core/types';
import { buildModularGeometry, deserializeBufferGeometry } from '../three3d/geometryBuilders';

export interface WorldTrimeshData {
  /** Triángulos en espacio mundo: [ax, ay, az, bx, by, bz, cx, cy, cz, ...] */
  triangles: Float32Array;
  minX: number;
  minY: number;
  minZ: number;
  maxX: number;
  maxY: number;
  maxZ: number;
}

const _mat4 = new THREE.Matrix4();
const _quat = new THREE.Quaternion();
const _euler = new THREE.Euler();
const _pos = new THREE.Vector3();
const _scale = new THREE.Vector3();
const _vA = new THREE.Vector3();
const _vB = new THREE.Vector3();
const _vC = new THREE.Vector3();

function appendGeometryTriangles(
  geometry: THREE.BufferGeometry,
  worldMatrix: THREE.Matrix4,
  outVerts: number[],
  bounds: { minX: number; minY: number; minZ: number; maxX: number; maxY: number; maxZ: number }
): void {
  const posAttr = geometry.getAttribute('position');
  if (!posAttr) return;

  const index = geometry.getIndex();
  const pushVertex = (v: THREE.Vector3) => {
    outVerts.push(v.x, v.y, v.z);
    if (v.x < bounds.minX) bounds.minX = v.x;
    if (v.y < bounds.minY) bounds.minY = v.y;
    if (v.z < bounds.minZ) bounds.minZ = v.z;
    if (v.x > bounds.maxX) bounds.maxX = v.x;
    if (v.y > bounds.maxY) bounds.maxY = v.y;
    if (v.z > bounds.maxZ) bounds.maxZ = v.z;
  };

  if (index) {
    const arr = index.array;
    for (let i = 0; i + 2 < arr.length; i += 3) {
      _vA.fromBufferAttribute(posAttr, arr[i]).applyMatrix4(worldMatrix);
      _vB.fromBufferAttribute(posAttr, arr[i + 1]).applyMatrix4(worldMatrix);
      _vC.fromBufferAttribute(posAttr, arr[i + 2]).applyMatrix4(worldMatrix);
      pushVertex(_vA);
      pushVertex(_vB);
      pushVertex(_vC);
    }
  } else {
    for (let i = 0; i + 2 < posAttr.count; i += 3) {
      _vA.fromBufferAttribute(posAttr, i).applyMatrix4(worldMatrix);
      _vB.fromBufferAttribute(posAttr, i + 1).applyMatrix4(worldMatrix);
      _vC.fromBufferAttribute(posAttr, i + 2).applyMatrix4(worldMatrix);
      pushVertex(_vA);
      pushVertex(_vB);
      pushVertex(_vC);
    }
  }
}

/**
 * Construye una malla de triángulos en espacio mundo para colisionadores 3D inteligentes (`mesh_exact`),
 * permitiendo atravesar túneles, arcos y huecos reales en geometría CSG/GLB/modular.
 */
export function buildWorldTrimeshData(obj: GameObjectData): WorldTrimeshData | null {
  if (obj.type !== 'mesh_3d' || !obj.transform3d || !obj.mesh3d) return null;
  const t3 = obj.transform3d;

  let geom: THREE.BufferGeometry;
  let shouldDispose = false;
  if (obj.mesh3d.shape === 'csg' && obj.mesh3d.csgGeometryJson) {
    geom = deserializeBufferGeometry(obj.mesh3d.csgGeometryJson);
    shouldDispose = true;
  } else {
    geom = buildModularGeometry(obj.mesh3d);
    shouldDispose = true;
  }

  _pos.set(t3.x, t3.y, t3.z);
  _euler.set(
    THREE.MathUtils.degToRad(t3.rx),
    THREE.MathUtils.degToRad(t3.ry),
    THREE.MathUtils.degToRad(t3.rz),
    'XYZ'
  );
  _quat.setFromEuler(_euler);
  _scale.set(
    Math.max(0.05, Math.abs(t3.sx)),
    Math.max(0.05, Math.abs(t3.sy)),
    Math.max(0.05, Math.abs(t3.sz))
  );
  _mat4.compose(_pos, _quat, _scale);

  const verts: number[] = [];
  const bounds = {
    minX: Infinity,
    minY: Infinity,
    minZ: Infinity,
    maxX: -Infinity,
    maxY: -Infinity,
    maxZ: -Infinity,
  };

  appendGeometryTriangles(geom, _mat4, verts, bounds);
  if (shouldDispose) geom.dispose();
  if (verts.length < 9) return null;

  return {
    triangles: new Float32Array(verts),
    ...bounds,
  };
}

/**
 * Extrae triángulos en espacio mundo desde un THREE.Object3D (útil para modelos .GLB complejos cargados).
 */
export function extractWorldTrimeshFromObject3D(root: THREE.Object3D): WorldTrimeshData | null {
  root.updateMatrixWorld(true);
  const verts: number[] = [];
  const bounds = {
    minX: Infinity,
    minY: Infinity,
    minZ: Infinity,
    maxX: -Infinity,
    maxY: -Infinity,
    maxZ: -Infinity,
  };
  root.traverse((child) => {
    const mesh = child as THREE.Mesh;
    if (mesh.isMesh && mesh.geometry) {
      appendGeometryTriangles(mesh.geometry, mesh.matrixWorld, verts, bounds);
    }
  });
  if (verts.length < 9) return null;
  return {
    triangles: new Float32Array(verts),
    ...bounds,
  };
}

/**
 * Punto más cercano sobre un triángulo ABC respecto al punto P (algoritmo de Christer Ericson).
 */
export function closestPointOnTriangle(
  px: number,
  py: number,
  pz: number,
  ax: number,
  ay: number,
  az: number,
  bx: number,
  by: number,
  bz: number,
  cx: number,
  cy: number,
  cz: number,
  out: { x: number; y: number; z: number }
): void {
  const abx = bx - ax;
  const aby = by - ay;
  const abz = bz - az;
  const acx = cx - ax;
  const acy = cy - ay;
  const acz = cz - az;
  const apx = px - ax;
  const apy = py - ay;
  const apz = pz - az;

  const d1 = abx * apx + aby * apy + abz * apz;
  const d2 = acx * apx + acy * apy + acz * apz;
  if (d1 <= 0 && d2 <= 0) {
    out.x = ax;
    out.y = ay;
    out.z = az;
    return;
  }

  const bpx = px - bx;
  const bpy = py - by;
  const bpz = pz - bz;
  const d3 = abx * bpx + aby * bpy + abz * bpz;
  const d4 = acx * bpx + acy * bpy + acz * bpz;
  if (d3 >= 0 && d4 <= d3) {
    out.x = bx;
    out.y = by;
    out.z = bz;
    return;
  }

  const vc = d1 * d4 - d3 * d2;
  if (vc <= 0 && d1 >= 0 && d3 <= 0) {
    const v = d1 / (d1 - d3 || 1e-8);
    out.x = ax + v * abx;
    out.y = ay + v * aby;
    out.z = az + v * abz;
    return;
  }

  const cpx = px - cx;
  const cpy = py - cy;
  const cpz = pz - cz;
  const d5 = abx * cpx + aby * cpy + abz * cpz;
  const d6 = acx * cpx + acy * cpy + acz * cpz;
  if (d6 >= 0 && d5 <= d6) {
    out.x = cx;
    out.y = cy;
    out.z = cz;
    return;
  }

  const vb = d5 * d2 - d1 * d6;
  if (vb <= 0 && d2 >= 0 && d6 <= 0) {
    const w = d2 / (d2 - d6 || 1e-8);
    out.x = ax + w * acx;
    out.y = ay + w * acy;
    out.z = az + w * acz;
    return;
  }

  const va = d3 * d6 - d5 * d4;
  if (va <= 0 && d4 - d3 >= 0 && d5 - d6 >= 0) {
    const bcx = cx - bx;
    const bcy = cy - by;
    const bcz = cz - bz;
    const w = (d4 - d3) / ((d4 - d3) + (d5 - d6) || 1e-8);
    out.x = bx + w * bcx;
    out.y = by + w * bcy;
    out.z = bz + w * bcz;
    return;
  }

  const denom = 1 / (va + vb + vc || 1e-8);
  const v = vb * denom;
  const w = vc * denom;
  out.x = ax + abx * v + acx * w;
  out.y = ay + aby * v + acy * w;
  out.z = az + abz * v + acz * w;
}

const _closest = { x: 0, y: 0, z: 0 };

export interface TrimeshResolutionResult {
  dx: number;
  dy: number;
  dz: number;
  wallNx: number;
  wallNz: number;
  collided: boolean;
  hitFloor: boolean;
  hitCeiling: boolean;
  hitWall: boolean;
}

/**
 * Resuelve colisión exacta de cápsula/esfera dinámica contra una malla de triángulos `WorldTrimeshData`.
 * Ideal para túneles, arcos, escaleras y geometría CSG perforada.
 */
export function resolveBodyVsTrimesh(
  centerX: number,
  centerY: number,
  centerZ: number,
  hx: number,
  hy: number,
  hz: number,
  trimesh: WorldTrimeshData
): TrimeshResolutionResult {
  const r = Math.max(0.12, Math.min(hx, hz));
  // Broadphase AABB rápida
  if (
    centerX + hx < trimesh.minX ||
    centerX - hx > trimesh.maxX ||
    centerY + hy < trimesh.minY ||
    centerY - hy > trimesh.maxY ||
    centerZ + hz < trimesh.minZ ||
    centerZ - hz > trimesh.maxZ
  ) {
    return { dx: 0, dy: 0, dz: 0, wallNx: 0, wallNz: 0, collided: false, hitFloor: false, hitCeiling: false, hitWall: false };
  }

  // Representar cuerpo verticalmente mediante 3 esferas (inferior, centro, superior)
  const capOffset = Math.max(0, hy - r);
  const sampleOffsets = capOffset > 0.05 ? [-capOffset, 0, capOffset] : [0];
  const tris = trimesh.triangles;
  const rSq = r * r;

  let curX = centerX;
  let curY = centerY;
  let curZ = centerZ;
  let collided = false;
  let hitFloor = false;
  let hitCeiling = false;
  let hitWall = false;
  let accWallNx = 0;
  let accWallNz = 0;

  const maxStepUp = Math.min(0.45, hy * 0.75);
  let steppedUp = false;

  for (let pass = 0; pass < 3; pass++) {
    for (let sIdx = 0; sIdx < sampleOffsets.length; sIdx++) {
      const sy = curY + sampleOffsets[sIdx];
      const isBottomSphere = sIdx === 0;
      for (let i = 0; i < tris.length; i += 9) {
        const ax = tris[i];
        const ay = tris[i + 1];
        const az = tris[i + 2];
        const bx = tris[i + 3];
        const by = tris[i + 4];
        const bz = tris[i + 5];
        const cx = tris[i + 6];
        const cy = tris[i + 7];
        const cz = tris[i + 8];

        // Descartar rápido por AABB del triángulo
        const minTx = ax < bx ? (ax < cx ? ax : cx) : bx < cx ? bx : cx;
        const maxTx = ax > bx ? (ax > cx ? ax : cx) : bx > cx ? bx : cx;
        if (curX + r < minTx || curX - r > maxTx) continue;
        const minTy = ay < by ? (ay < cy ? ay : cy) : by < cy ? by : cy;
        const maxTy = ay > by ? (ay > cy ? ay : cy) : by > cy ? by : cy;
        if (sy + r < minTy || sy - r > maxTy) continue;
        const minTz = az < bz ? (az < cz ? az : cz) : bz < cz ? bz : cz;
        const maxTz = az > bz ? (az > cz ? az : cz) : bz > cz ? bz : cz;
        if (curZ + r < minTz || curZ - r > maxTz) continue;

        closestPointOnTriangle(curX, sy, curZ, ax, ay, az, bx, by, bz, cx, cy, cz, _closest);
        const vx = curX - _closest.x;
        const vy = sy - _closest.y;
        const vz = curZ - _closest.z;
        const distSq = vx * vx + vy * vy + vz * vz;

        if (distSq < rSq) {
          const dist = Math.sqrt(distSq);
          let nx = 0;
          let ny = 1;
          let nz = 0;
          if (dist > 1e-5) {
            nx = vx / dist;
            ny = vy / dist;
            nz = vz / dist;
          } else {
            const e1x = bx - ax;
            const e1y = by - ay;
            const e1z = bz - az;
            const e2x = cx - ax;
            const e2y = cy - ay;
            const e2z = cz - az;
            const crx = e1y * e2z - e1z * e2y;
            const cry = e1z * e2x - e1x * e2z;
            const crz = e1x * e2y - e1y * e2x;
            const len = Math.hypot(crx, cry, crz);
            if (len > 1e-5) {
              nx = crx / len;
              ny = cry / len;
              nz = crz / len;
            }
          }

          // Subida suave de escalones (stairs): si la esfera inferior choca con un peldaño bajo
          const bottomY = curY - hy;
          const stepH = Math.min(maxTy, _closest.y) - bottomY;
          if (isBottomSphere && ny < 0.45 && ny > -0.2 && stepH > 0.01 && stepH <= maxStepUp && !steppedUp) {
            curY += stepH + 0.015;
            collided = true;
            hitFloor = true;
            steppedUp = true;
            continue;
          }

          const pen = r - dist;
          curX += nx * pen;
          curY += ny * pen;
          curZ += nz * pen;
          collided = true;

          if (ny > 0.55) hitFloor = true;
          else if (ny < -0.55) hitCeiling = true;
          else {
            hitWall = true;
            accWallNx += nx * pen;
            accWallNz += nz * pen;
          }
        }
      }
    }
  }

  const wallLen = Math.hypot(accWallNx, accWallNz);
  return {
    dx: curX - centerX,
    dy: curY - centerY,
    dz: curZ - centerZ,
    wallNx: wallLen > 1e-5 ? accWallNx / wallLen : 0,
    wallNz: wallLen > 1e-5 ? accWallNz / wallLen : 0,
    collided,
    hitFloor,
    hitCeiling,
    hitWall,
  };
}

/**
 * Resuelve colisión exacta entre una cápsula vertical dinámica y una caja estática OBB rotada (rx, ry, rz grados Euler XYZ).
 * Permite paredes en cualquier ángulo sin atravesar esquinas ni quedarse pegado.
 */
export function resolveBodyVsOBB3D(
  centerX: number,
  centerY: number,
  centerZ: number,
  hx: number,
  hy: number,
  hz: number,
  boxCx: number,
  boxCy: number,
  boxCz: number,
  boxHx: number,
  boxHy: number,
  boxHz: number,
  rxDeg: number,
  ryDeg: number,
  rzDeg: number
): TrimeshResolutionResult {
  const r = Math.max(0.12, Math.min(hx, hz));
  // Broadphase rápida por esfera envolvente del OBB
  const boxBoundR = Math.hypot(boxHx, boxHy, boxHz);
  const bodyBoundR = Math.hypot(hx, hy, hz);
  const dSqBroad =
    (centerX - boxCx) * (centerX - boxCx) +
    (centerY - boxCy) * (centerY - boxCy) +
    (centerZ - boxCz) * (centerZ - boxCz);
  const maxDist = boxBoundR + bodyBoundR + 0.05;
  if (dSqBroad > maxDist * maxDist) {
    return { dx: 0, dy: 0, dz: 0, wallNx: 0, wallNz: 0, collided: false, hitFloor: false, hitCeiling: false, hitWall: false };
  }

  // Construir matriz de rotación Euler XYZ (columnas = ejes locales X, Y, Z en espacio mundo)
  const rx = (rxDeg * Math.PI) / 180;
  const ry = (ryDeg * Math.PI) / 180;
  const rz = (rzDeg * Math.PI) / 180;
  const cx = Math.cos(rx), sx = Math.sin(rx);
  const cy = Math.cos(ry), sy = Math.sin(ry);
  const cz = Math.cos(rz), sz = Math.sin(rz);

  // R = Rx * Ry * Rz
  const m00 = cy * cz;
  const m01 = -cy * sz;
  const m02 = sy;
  const m10 = cx * sz + sx * sy * cz;
  const m11 = cx * cz - sx * sy * sz;
  const m12 = -sx * cy;
  const m20 = sx * sz - cx * sy * cz;
  const m21 = sx * cz + cx * sy * sz;
  const m22 = cx * cy;

  const capOffset = Math.max(0, hy - r);
  const sampleOffsets = capOffset > 0.05 ? [-capOffset, 0, capOffset] : [0];
  const rSq = r * r;

  let curX = centerX;
  let curY = centerY;
  let curZ = centerZ;
  let collided = false;
  let hitFloor = false;
  let hitCeiling = false;
  let hitWall = false;
  let accWallNx = 0;
  let accWallNz = 0;

  for (let pass = 0; pass < 2; pass++) {
    for (let sIdx = 0; sIdx < sampleOffsets.length; sIdx++) {
      const wx = curX - boxCx;
      const wy = curY + sampleOffsets[sIdx] - boxCy;
      const wz = curZ - boxCz;

      // Transformar esfera al espacio local del OBB (R^T * w)
      const lx = m00 * wx + m10 * wy + m20 * wz;
      const ly = m01 * wx + m11 * wy + m21 * wz;
      const lz = m02 * wx + m12 * wy + m22 * wz;

      // Punto más cercano dentro del AABB local
      const clampedX = Math.max(-boxHx, Math.min(boxHx, lx));
      const clampedY = Math.max(-boxHy, Math.min(boxHy, ly));
      const clampedZ = Math.max(-boxHz, Math.min(boxHz, lz));

      const dlx = lx - clampedX;
      const dly = ly - clampedY;
      const dlz = lz - clampedZ;
      const distSq = dlx * dlx + dly * dly + dlz * dlz;

      if (distSq >= rSq) continue;

      let lnx = 0;
      let lny = 0;
      let lnz = 0;
      let pen = 0;

      if (distSq > 1e-8) {
        const dist = Math.sqrt(distSq);
        lnx = dlx / dist;
        lny = dly / dist;
        lnz = dlz / dist;
        pen = r - dist;
      } else {
        // Centro de esfera dentro del OBB: expulsar por la cara local más cercana
        const dxPos = boxHx - lx;
        const dxNeg = boxHx + lx;
        const dyPos = boxHy - ly;
        const dyNeg = boxHy + ly;
        const dzPos = boxHz - lz;
        const dzNeg = boxHz + lz;
        let minFace = dxPos;
        lnx = 1; lny = 0; lnz = 0;
        if (dxNeg < minFace) { minFace = dxNeg; lnx = -1; lny = 0; lnz = 0; }
        if (dyPos < minFace) { minFace = dyPos; lnx = 0; lny = 1; lnz = 0; }
        if (dyNeg < minFace) { minFace = dyNeg; lnx = 0; lny = -1; lnz = 0; }
        if (dzPos < minFace) { minFace = dzPos; lnx = 0; lny = 0; lnz = 1; }
        if (dzNeg < minFace) { minFace = dzNeg; lnx = 0; lny = 0; lnz = -1; }
        pen = minFace + r;
      }

      // Normal local -> mundo (R * ln)
      const wnx = m00 * lnx + m01 * lny + m02 * lnz;
      const wny = m10 * lnx + m11 * lny + m12 * lnz;
      const wnz = m20 * lnx + m21 * lny + m22 * lnz;

      curX += wnx * pen;
      curY += wny * pen;
      curZ += wnz * pen;
      collided = true;

      if (wny > 0.55) hitFloor = true;
      else if (wny < -0.55) hitCeiling = true;
      else {
        hitWall = true;
        accWallNx += wnx * pen;
        accWallNz += wnz * pen;
      }
    }
  }

  const wallLen = Math.hypot(accWallNx, accWallNz);
  return {
    dx: curX - centerX,
    dy: curY - centerY,
    dz: curZ - centerZ,
    wallNx: wallLen > 1e-5 ? accWallNx / wallLen : 0,
    wallNz: wallLen > 1e-5 ? accWallNz / wallLen : 0,
    collided,
    hitFloor,
    hitCeiling,
    hitWall,
  };
}
