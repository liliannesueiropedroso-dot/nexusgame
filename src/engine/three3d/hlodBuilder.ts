import * as THREE from 'three';
import type { HlodChunkProxy, HlodProxyPart } from '../streaming/worldStreaming';
import type { ResourceDisposer } from './resourceDisposer';

export interface BuiltHlodVisual {
  group: THREE.Group;
  billboardMesh: THREE.Mesh | null;
  dispose: () => void;
}

function appendColoredBoxToArrays(
  part: HlodProxyPart,
  positions: number[],
  normals: number[],
  colors: number[]
): void {
  const box = new THREE.BoxGeometry(part.width, part.height, part.depth);
  const nonIdx = box.toNonIndexed();
  box.dispose();

  const posAttr = nonIdx.getAttribute('position');
  const normAttr = nonIdx.getAttribute('normal');
  const col = new THREE.Color(part.color || '#64748b');

  for (let i = 0; i < posAttr.count; i++) {
    const lx = posAttr.getX(i) + part.offsetX;
    const ly = posAttr.getY(i) + part.offsetY;
    const lz = posAttr.getZ(i) + part.offsetZ;
    positions.push(lx, ly, lz);
    normals.push(normAttr.getX(i), normAttr.getY(i), normAttr.getZ(i));
    // Oscurecer ligeramente la base de edificios/árboles para dar lectura de volumen HLOD
    const shade = posAttr.getY(i) > 0 ? 1.0 : 0.72;
    colors.push(col.r * shade, col.g * shade, col.b * shade);
  }

  nonIdx.dispose();
}

function buildSilhouetteImpostorTexture(proxy: HlodChunkProxy): THREE.CanvasTexture | null {
  if (typeof document === 'undefined') return null;
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 128;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;

  ctx.clearRect(0, 0, canvas.width, canvas.height);

  const halfSpan = Math.max(2, proxy.width * 0.5, proxy.depth * 0.5);
  const maxH = Math.max(2, proxy.height);

  for (const part of proxy.parts) {
    const u = (part.offsetX / (halfSpan * 2) + 0.5) * canvas.width;
    const wPx = Math.max(8, (part.width / (halfSpan * 2)) * canvas.width);
    const hPx = Math.max(12, (part.height / maxH) * (canvas.height * 0.84));
    const baseY = canvas.height - 6 - ((part.offsetY - part.height * 0.5 + maxH * 0.5) / maxH) * (canvas.height * 0.25);
    const topY = Math.max(4, baseY - hPx);

    if (part.kind === 'foliage') {
      // Silueta de copa + tronco para impostor 2D de vegetación
      ctx.fillStyle = '#4b3621';
      const trunkW = Math.max(3, wPx * 0.18);
      ctx.fillRect(u - trunkW * 0.5, topY + hPx * 0.55, trunkW, Math.max(4, hPx * 0.45));
      ctx.fillStyle = part.color || '#22c55e';
      ctx.beginPath();
      ctx.ellipse(u, topY + hPx * 0.36, wPx * 0.48, hPx * 0.38, 0, 0, Math.PI * 2);
      ctx.fill();
    } else {
      ctx.fillStyle = part.color || '#64748b';
      ctx.fillRect(u - wPx * 0.5, topY, wPx, Math.max(8, baseY - topY));
      ctx.fillStyle = 'rgba(255,255,255,0.14)';
      ctx.fillRect(u - wPx * 0.5, topY, wPx, 3);
    }
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.needsUpdate = true;
  return tex;
}

/**
 * Construye una malla proxy HLOD real (geometría combinada en 1 draw-call + billboard impostor 2D
 * cuando el chunk contiene vegetación o silueta mixta) y devuelve función limpia de liberación GPU.
 */
export function buildHlodProxyVisual(
  proxy: HlodChunkProxy,
  disposer?: ResourceDisposer
): BuiltHlodVisual {
  const group = new THREE.Group();
  group.position.set(proxy.centerX, proxy.centerY, proxy.centerZ);
  group.name = `HLOD_${proxy.chunkKey}`;
  group.userData.hlodChunkKey = proxy.chunkKey;

  const ownedGeos: THREE.BufferGeometry[] = [];
  const ownedMats: THREE.Material[] = [];
  const ownedTexs: THREE.Texture[] = [];

  const solidParts =
    proxy.impostorKind === 'billboard'
      ? proxy.parts.filter((p) => p.kind !== 'foliage')
      : proxy.parts;

  const partsForMesh =
    solidParts.length > 0
      ? solidParts
      : proxy.impostorKind !== 'billboard'
        ? [
            {
              offsetX: 0,
              offsetY: 0,
              offsetZ: 0,
              width: proxy.width,
              height: proxy.height,
              depth: proxy.depth,
              color: proxy.color,
              kind: 'building' as const,
            },
          ]
        : [];

  if (partsForMesh.length > 0) {
    const positions: number[] = [];
    const normals: number[] = [];
    const colors: number[] = [];
    for (const part of partsForMesh) {
      appendColoredBoxToArrays(part, positions, normals, colors);
    }
    const mergedGeo = new THREE.BufferGeometry();
    mergedGeo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    mergedGeo.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
    mergedGeo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
    mergedGeo.computeBoundingBox();
    mergedGeo.computeBoundingSphere();

    const mergedMat = new THREE.MeshStandardMaterial({
      vertexColors: true,
      roughness: 0.86,
      metalness: 0.06,
    });
    const mergedMesh = new THREE.Mesh(mergedGeo, mergedMat);
    mergedMesh.castShadow = false;
    mergedMesh.receiveShadow = true;
    mergedMesh.name = `HLOD_Merged_${proxy.chunkKey}`;
    group.add(mergedMesh);
    ownedGeos.push(mergedGeo);
    ownedMats.push(mergedMat);
    disposer?.trackGeometry(mergedGeo);
    disposer?.trackMaterial(mergedMat);
  }

  let billboardMesh: THREE.Mesh | null = null;
  if (proxy.impostorKind === 'billboard' || proxy.impostorKind === 'hybrid') {
    const tex = buildSilhouetteImpostorTexture(proxy);
    if (tex) {
      const cardW = Math.max(3, Math.max(proxy.width, proxy.depth) * 0.92);
      const cardH = Math.max(2.5, proxy.height * 1.05);
      const cardGeo = new THREE.PlaneGeometry(cardW, cardH);
      const cardMat = new THREE.MeshBasicMaterial({
        map: tex,
        transparent: true,
        alphaTest: 0.2,
        side: THREE.DoubleSide,
        depthWrite: true,
      });
      billboardMesh = new THREE.Mesh(cardGeo, cardMat);
      billboardMesh.name = `HLOD_Billboard_${proxy.chunkKey}`;
      billboardMesh.userData.isHlodBillboard = true;
      group.add(billboardMesh);
      ownedGeos.push(cardGeo);
      ownedMats.push(cardMat);
      ownedTexs.push(tex);
      disposer?.trackGeometry(cardGeo);
      disposer?.trackMaterial(cardMat);
      disposer?.trackTexture(tex);
    }
  }

  return {
    group,
    billboardMesh,
    dispose: () => {
      for (const tex of ownedTexs) tex.dispose();
      for (const mat of ownedMats) mat.dispose();
      for (const geo of ownedGeos) geo.dispose();
    },
  };
}
