import type {
  GameObjectData,
  SplinePathData,
  SplinePoint3D,
  TerrainData,
  WaterConfig,
} from '../core/types';

export interface SampledSplinePoint {
  x: number;
  y: number;
  z: number;
  tx: number;
  ty: number;
  tz: number;
  t: number;
}

function catmullRom(p0: number, p1: number, p2: number, p3: number, t: number): number {
  const t2 = t * t;
  const t3 = t2 * t;
  return (
    0.5 *
    (2 * p1 +
      (-p0 + p2) * t +
      (2 * p0 - 5 * p1 + 4 * p2 - p3) * t2 +
      (-p0 + 3 * p1 - 3 * p2 + p3) * t3)
  );
}

/**
 * Evalúa una posición suave sobre una curva Catmull-Rom 3D para t en [0..1].
 */
export function sampleSpline3D(
  points: SplinePoint3D[],
  closed: boolean,
  tRaw: number
): SampledSplinePoint {
  if (points.length === 0) {
    return { x: 0, y: 0, z: 0, tx: 0, ty: 0, tz: 1, t: 0 };
  }
  if (points.length === 1) {
    const p = points[0];
    return { x: p.x, y: p.y, z: p.z, tx: 0, ty: 0, tz: 1, t: 0 };
  }

  const t = closed ? ((tRaw % 1) + 1) % 1 : Math.max(0, Math.min(1, tRaw));
  const segCount = closed ? points.length : points.length - 1;
  const scaled = t * segCount;
  const idx = Math.min(segCount - 1, Math.floor(scaled));
  const localT = scaled - idx;

  const at = (i: number): SplinePoint3D => {
    if (closed) {
      const m = ((i % points.length) + points.length) % points.length;
      return points[m];
    }
    return points[Math.max(0, Math.min(points.length - 1, i))];
  };

  const p0 = at(idx - 1);
  const p1 = at(idx);
  const p2 = at(idx + 1);
  const p3 = at(idx + 2);

  const x = catmullRom(p0.x, p1.x, p2.x, p3.x, localT);
  const y = catmullRom(p0.y, p1.y, p2.y, p3.y, localT);
  const z = catmullRom(p0.z, p1.z, p2.z, p3.z, localT);

  const eps = 0.015;
  const tNext = closed ? ((t + eps) % 1 + 1) % 1 : Math.min(1, t + eps);
  const tPrev = closed ? ((t - eps) % 1 + 1) % 1 : Math.max(0, t - eps);
  const sNext = tNext * segCount;
  const iN = Math.min(segCount - 1, Math.floor(sNext));
  const fN = sNext - iN;
  const sPrev = tPrev * segCount;
  const iP = Math.min(segCount - 1, Math.floor(sPrev));
  const fP = sPrev - iP;

  const n0 = at(iN - 1);
  const n1 = at(iN);
  const n2 = at(iN + 1);
  const n3 = at(iN + 2);
  const q0 = at(iP - 1);
  const q1 = at(iP);
  const q2 = at(iP + 1);
  const q3 = at(iP + 2);

  let tx = catmullRom(n0.x, n1.x, n2.x, n3.x, fN) - catmullRom(q0.x, q1.x, q2.x, q3.x, fP);
  let ty = catmullRom(n0.y, n1.y, n2.y, n3.y, fN) - catmullRom(q0.y, q1.y, q2.y, q3.y, fP);
  let tz = catmullRom(n0.z, n1.z, n2.z, n3.z, fN) - catmullRom(q0.z, q1.z, q2.z, q3.z, fP);
  const tLen = Math.hypot(tx, ty, tz) || 1;
  tx /= tLen;
  ty /= tLen;
  tz /= tLen;

  return { x, y, z, tx, ty, tz, t };
}

/**
 * Remuestrea una curva Spline 3D a intervalos aproximados de `stepMeters`.
 */
export function resampleSpline3D(
  points: SplinePoint3D[],
  closed = false,
  stepMeters = 0.85
): SampledSplinePoint[] {
  if (points.length < 2) {
    return points.map((p, idx) => ({
      x: p.x,
      y: p.y,
      z: p.z,
      tx: 0,
      ty: 0,
      tz: 1,
      t: idx,
    }));
  }

  let approxLen = 0;
  for (let i = 1; i < points.length; i++) {
    approxLen += Math.hypot(
      points[i].x - points[i - 1].x,
      points[i].y - points[i - 1].y,
      points[i].z - points[i - 1].z
    );
  }
  if (closed && points.length > 2) {
    const a = points[points.length - 1];
    const b = points[0];
    approxLen += Math.hypot(b.x - a.x, b.y - a.y, b.z - a.z);
  }

  const samplesCount = Math.max(12, Math.min(360, Math.ceil(approxLen / Math.max(0.25, stepMeters))));
  const out: SampledSplinePoint[] = [];
  for (let i = 0; i <= samplesCount; i++) {
    out.push(sampleSpline3D(points, closed, i / samplesCount));
  }
  return out;
}

/**
 * "Aplanar y Pintar Carretera": aplana suavemente el terreno a lo largo de la curva
 * y pinta textura de carretera/tierra en el mapa splat del terreno.
 */
export function sculptRoadAlongSpline(
  terrainObj: GameObjectData,
  spline: SplinePathData,
  options?: { halfWidth?: number; shoulderWidth?: number; roadChannel?: 0 | 1 | 2 | 3 }
): TerrainData | null {
  const td = terrainObj.mesh3d?.terrainData;
  if (!td || spline.points.length < 2) return null;

  const t = terrainObj.transform3d ?? { x: 0, y: 0, z: 0, rx: 0, ry: 0, rz: 0, sx: 1, sy: 1, sz: 1 };
  const sx = Math.max(0.1, Math.abs(t.sx || 1));
  const sy = Math.max(0.1, Math.abs(t.sy || 1));
  const sz = Math.max(0.1, Math.abs(t.sz || 1));

  const halfWidth = Math.max(0.8, options?.halfWidth ?? (spline.width || 4.4) * 0.5);
  const shoulder = Math.max(1.0, options?.shoulderWidth ?? halfWidth * 0.85);
  const roadChannel = options?.roadChannel ?? 1; // 1 = tierra/carretera, 2 = roca/asfalto

  const samples = resampleSpline3D(spline.points, spline.closed, 0.7);
  const seg = td.segments;
  const stride = seg + 1;
  const nextHeights = [...td.heights];
  const nextSplat = [...td.splatWeights];

  for (let gz = 0; gz < stride; gz++) {
    const lz = (gz / seg - 0.5) * td.depth;
    const wz = t.z + lz * sz;
    for (let gx = 0; gx < stride; gx++) {
      const lx = (gx / seg - 0.5) * td.width;
      const wx = t.x + lx * sx;

      let bestDist = Infinity;
      let nearestY = 0;
      for (let i = 0; i < samples.length; i++) {
        const sp = samples[i];
        const d = Math.hypot(wx - sp.x, wz - sp.z);
        if (d < bestDist) {
          bestDist = d;
          nearestY = sp.y;
        }
      }

      if (bestDist <= halfWidth + shoulder) {
        const idx = gz * stride + gx;
        const targetLocalH = (nearestY - t.y) / sy;
        const blend =
          bestDist <= halfWidth
            ? 1
            : 0.5 + 0.5 * Math.cos(((bestDist - halfWidth) / shoulder) * Math.PI);
        nextHeights[idx] = nextHeights[idx] * (1 - blend) + targetLocalH * blend;

        const si = idx * 4;
        const paintW = bestDist <= halfWidth ? 0.92 : blend * 0.72;
        for (let c = 0; c < 4; c++) {
          const goal = c === roadChannel ? 1 : 0;
          nextSplat[si + c] = (nextSplat[si + c] ?? (c === 0 ? 1 : 0)) * (1 - paintW) + goal * paintW;
        }
        const sum = nextSplat[si] + nextSplat[si + 1] + nextSplat[si + 2] + nextSplat[si + 3] || 1;
        nextSplat[si] /= sum;
        nextSplat[si + 1] /= sum;
        nextSplat[si + 2] /= sum;
        nextSplat[si + 3] /= sum;
      }
    }
  }

  return {
    ...td,
    heights: nextHeights,
    splatWeights: nextSplat,
  };
}

/**
 * "Excavar y Llenar de Agua": excava el cauce del río sobre el terreno
 * y devuelve la configuración de agua dimensionada para cubrir el recorrido.
 */
export function carveRiverAlongSpline(
  terrainObj: GameObjectData,
  spline: SplinePathData,
  options?: { halfWidth?: number; depth?: number }
): {
  terrainData: TerrainData;
  waterConfig: WaterConfig;
  waterTransform: { x: number; y: number; z: number };
} | null {
  const td = terrainObj.mesh3d?.terrainData;
  if (!td || spline.points.length < 2) return null;

  const t = terrainObj.transform3d ?? { x: 0, y: 0, z: 0, rx: 0, ry: 0, rz: 0, sx: 1, sy: 1, sz: 1 };
  const sx = Math.max(0.1, Math.abs(t.sx || 1));
  const sy = Math.max(0.1, Math.abs(t.sy || 1));
  const sz = Math.max(0.1, Math.abs(t.sz || 1));

  const halfWidth = Math.max(1.2, options?.halfWidth ?? (spline.width || 4.8) * 0.55);
  const bankWidth = Math.max(1.4, halfWidth * 0.8);
  const carveDepth = Math.max(0.6, options?.depth ?? 2.2);

  const samples = resampleSpline3D(spline.points, spline.closed, 0.7);
  let minX = Infinity;
  let maxX = -Infinity;
  let minZ = Infinity;
  let maxZ = -Infinity;
  let avgY = 0;

  for (const sp of samples) {
    if (sp.x < minX) minX = sp.x;
    if (sp.x > maxX) maxX = sp.x;
    if (sp.z < minZ) minZ = sp.z;
    if (sp.z > maxZ) maxZ = sp.z;
    avgY += sp.y;
  }
  avgY /= samples.length;

  const seg = td.segments;
  const stride = seg + 1;
  const nextHeights = [...td.heights];
  const nextSplat = [...td.splatWeights];

  for (let gz = 0; gz < stride; gz++) {
    const lz = (gz / seg - 0.5) * td.depth;
    const wz = t.z + lz * sz;
    for (let gx = 0; gx < stride; gx++) {
      const lx = (gx / seg - 0.5) * td.width;
      const wx = t.x + lx * sx;

      let bestDist = Infinity;
      let nearestY = avgY;
      for (let i = 0; i < samples.length; i++) {
        const sp = samples[i];
        const d = Math.hypot(wx - sp.x, wz - sp.z);
        if (d < bestDist) {
          bestDist = d;
          nearestY = sp.y;
        }
      }

      const outer = halfWidth + bankWidth;
      if (bestDist <= outer) {
        const idx = gz * stride + gx;
        const frac = Math.min(1, bestDist / outer);
        const bowl = Math.cos(frac * Math.PI * 0.5);
        const floorLocal = (nearestY - carveDepth - t.y) / sy;
        const curH = nextHeights[idx];
        nextHeights[idx] = Math.min(curH, curH * (1 - bowl) + floorLocal * bowl);

        // Pintar arena (3) en el lecho y roca/arena en las orillas
        const si = idx * 4;
        const sandW = bestDist <= halfWidth ? 0.92 : bowl * 0.75;
        nextSplat[si] = (nextSplat[si] ?? 1) * (1 - sandW);
        nextSplat[si + 1] = (nextSplat[si + 1] ?? 0) * (1 - sandW * 0.5);
        nextSplat[si + 2] = (nextSplat[si + 2] ?? 0) * (1 - sandW * 0.5);
        nextSplat[si + 3] = Math.min(1, (nextSplat[si + 3] ?? 0) + sandW);
        const sum = nextSplat[si] + nextSplat[si + 1] + nextSplat[si + 2] + nextSplat[si + 3] || 1;
        nextSplat[si] /= sum;
        nextSplat[si + 1] /= sum;
        nextSplat[si + 2] /= sum;
        nextSplat[si + 3] /= sum;
      }
    }
  }

  const endSample = samples[samples.length - 1];
  const startSample = samples[0];
  const flowDx = endSample.x - startSample.x;
  const flowDz = endSample.z - startSample.z;
  const flowLen = Math.hypot(flowDx, flowDz) || 1;

  return {
    terrainData: {
      ...td,
      heights: nextHeights,
      splatWeights: nextSplat,
    },
    waterConfig: {
      width: Math.max(6, maxX - minX + halfWidth * 2.4),
      depth: Math.max(6, maxZ - minZ + halfWidth * 2.4),
      flowX: Number(((flowDx / flowLen) * 1.1).toFixed(2)),
      flowZ: Number(((flowDz / flowLen) * 1.1).toFixed(2)),
      waveAmplitude: 0.11,
      waveSpeed: 1.9,
      shallowColor: '#38bdf8',
      deepColor: '#0369a1',
      foamIntensity: 0.95,
      enableWakeTrail: true,
      planarReflections: false,
      buoyancyDrag: 1.2,
    },
    waterTransform: {
      x: (minX + maxX) * 0.5,
      y: avgY - carveDepth * 0.35,
      z: (minZ + maxZ) * 0.5,
    },
  };
}
