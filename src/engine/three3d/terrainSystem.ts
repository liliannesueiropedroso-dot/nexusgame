import * as THREE from 'three';
import type {
  GameObjectData,
  SceneData,
  SceneLightingConfig,
  TerrainData,
  WaterConfig,
  WindFoliageConfig,
  WindFoliageInstance,
} from '../core/types';

// ============================================================================
// 1. RUIDO DETERMINISTA & TERRENO PROCEDURAL 3D
// ============================================================================

function hash2D(ix: number, iz: number, seed: number): number {
  let n = Math.imul(ix, 374761393) + Math.imul(iz, 668265263) + Math.imul(seed | 0, 1442695041);
  n = (n ^ (n >>> 13)) | 0;
  n = Math.imul(n, 1274126177);
  n = n ^ (n >>> 16);
  return ((n >>> 0) % 100000) / 100000;
}

function smoothstep(t: number): number {
  return t * t * (3 - 2 * t);
}

function valueNoise2D(x: number, z: number, seed: number): number {
  const ix = Math.floor(x);
  const iz = Math.floor(z);
  const fx = smoothstep(x - ix);
  const fz = smoothstep(z - iz);
  const a = hash2D(ix, iz, seed);
  const b = hash2D(ix + 1, iz, seed);
  const c = hash2D(ix, iz + 1, seed);
  const d = hash2D(ix + 1, iz + 1, seed);
  const ab = a + (b - a) * fx;
  const cd = c + (d - c) * fx;
  return (ab + (cd - ab) * fz) * 2 - 1;
}

export function fbm2D(
  x: number,
  z: number,
  seed: number,
  octaves = 4,
  frequency = 0.08
): number {
  let sum = 0;
  let amp = 1;
  let freq = frequency;
  let norm = 0;
  const safeOct = Math.max(1, Math.min(8, Math.round(octaves)));
  for (let o = 0; o < safeOct; o++) {
    sum += valueNoise2D(x * freq, z * freq, seed + o * 101) * amp;
    norm += amp;
    amp *= 0.5;
    freq *= 2.02;
  }
  return norm > 0 ? sum / norm : 0;
}

export interface TerrainGenerationParams {
  width?: number;
  depth?: number;
  segments?: number;
  seed?: number;
  amplitude?: number;
  frequency?: number;
  octaves?: number;
}

export function generateProceduralTerrain(params: TerrainGenerationParams = {}): TerrainData {
  const width = Math.max(8, params.width ?? 48);
  const depth = Math.max(8, params.depth ?? 48);
  const segments = Math.max(8, Math.min(96, Math.round(params.segments ?? 40)));
  const seed = Math.round(params.seed ?? 1337);
  const amplitude = Math.max(0, params.amplitude ?? 4.5);
  const frequency = Math.max(0.005, params.frequency ?? 0.085);
  const octaves = Math.max(1, Math.min(6, Math.round(params.octaves ?? 4)));

  const vertsPerSide = segments + 1;
  const heights = new Array<number>(vertsPerSide * vertsPerSide);
  const splatWeights = new Array<number>(vertsPerSide * vertsPerSide * 4);

  for (let rz = 0; rz < vertsPerSide; rz++) {
    const vz = (rz / segments - 0.5) * depth;
    for (let cx = 0; cx < vertsPerSide; cx++) {
      const vx = (cx / segments - 0.5) * width;
      const idx = rz * vertsPerSide + cx;
      // Suave cuenco en el centro jugable y elevaciones hacia los bordes / colinas
      const n = fbm2D(vx, vz, seed, octaves, frequency);
      const ridge = 1 - Math.abs(n);
      const h = (n * 0.65 + (ridge - 0.5) * 0.35) * amplitude;
      heights[idx] = Number(h.toFixed(4));

      // Pesos iniciales de textura según altura: [hierba, tierra, roca, arena]
      const si = idx * 4;
      if (h < -amplitude * 0.25) {
        splatWeights[si] = 0.1;
        splatWeights[si + 1] = 0.25;
        splatWeights[si + 2] = 0.05;
        splatWeights[si + 3] = 0.6; // arena
      } else if (h > amplitude * 0.38) {
        splatWeights[si] = 0.15;
        splatWeights[si + 1] = 0.2;
        splatWeights[si + 2] = 0.65; // roca
        splatWeights[si + 3] = 0;
      } else {
        splatWeights[si] = 0.78; // hierba
        splatWeights[si + 1] = 0.22;
        splatWeights[si + 2] = 0;
        splatWeights[si + 3] = 0;
      }
    }
  }

  return {
    width,
    depth,
    segments,
    seed,
    amplitude,
    frequency,
    octaves,
    heights,
    splatWeights,
  };
}

/**
 * Expande un terreno existente preservando el relieve ya esculpido y los pesos splat
 * en la zona central original, rellenando las áreas nuevas con terreno procedural suave.
 */
export function expandTerrainData(
  td: TerrainData,
  newWidth: number,
  newDepth: number,
  newSegments?: number
): TerrainData {
  const width = Math.max(8, Math.round(newWidth));
  const depth = Math.max(8, Math.round(newDepth));
  const segments = Math.max(8, Math.min(128, Math.round(newSegments ?? Math.max(td.segments, 48))));
  const vertsPerSide = segments + 1;
  const heights = new Array<number>(vertsPerSide * vertsPerSide);
  const splatWeights = new Array<number>(vertsPerSide * vertsPerSide * 4);

  const oldSeg = Math.max(1, td.segments);
  const oldStride = oldSeg + 1;
  const oldHalfW = td.width * 0.5;
  const oldHalfD = td.depth * 0.5;

  for (let rz = 0; rz < vertsPerSide; rz++) {
    const vz = (rz / segments - 0.5) * depth;
    for (let cx = 0; cx < vertsPerSide; cx++) {
      const vx = (cx / segments - 0.5) * width;
      const idx = rz * vertsPerSide + cx;
      const si = idx * 4;

      if (Math.abs(vx) <= oldHalfW && Math.abs(vz) <= oldHalfD) {
        const u = Math.max(0, Math.min(1, (vx + oldHalfW) / td.width));
        const v = Math.max(0, Math.min(1, (vz + oldHalfD) / td.depth));
        const gx = u * oldSeg;
        const gz = v * oldSeg;
        const x0 = Math.min(oldSeg - 1, Math.floor(gx));
        const z0 = Math.min(oldSeg - 1, Math.floor(gz));
        const fx = gx - x0;
        const fz = gz - z0;

        const h00 = td.heights[z0 * oldStride + x0] ?? 0;
        const h10 = td.heights[z0 * oldStride + x0 + 1] ?? 0;
        const h01 = td.heights[(z0 + 1) * oldStride + x0] ?? 0;
        const h11 = td.heights[(z0 + 1) * oldStride + x0 + 1] ?? 0;
        const hx0 = h00 + (h10 - h00) * fx;
        const hx1 = h01 + (h11 - h01) * fx;
        heights[idx] = Number((hx0 + (hx1 - hx0) * fz).toFixed(4));

        const nearIdx = Math.round(gz) * oldStride + Math.round(gx);
        const osi = nearIdx * 4;
        splatWeights[si] = td.splatWeights[osi] ?? 0.78;
        splatWeights[si + 1] = td.splatWeights[osi + 1] ?? 0.22;
        splatWeights[si + 2] = td.splatWeights[osi + 2] ?? 0;
        splatWeights[si + 3] = td.splatWeights[osi + 3] ?? 0;
      } else {
        const n = fbm2D(vx, vz, td.seed, td.octaves, td.frequency);
        const ridge = 1 - Math.abs(n);
        const h = (n * 0.65 + (ridge - 0.5) * 0.35) * td.amplitude;
        heights[idx] = Number(h.toFixed(4));
        splatWeights[si] = 0.78;
        splatWeights[si + 1] = 0.22;
        splatWeights[si + 2] = 0;
        splatWeights[si + 3] = 0;
      }
    }
  }

  return {
    ...td,
    width,
    depth,
    segments,
    heights,
    splatWeights,
  };
}

export function sampleTerrainHeightAt(
  obj: GameObjectData,
  worldX: number,
  worldZ: number
): number | null {
  const td = obj.mesh3d?.terrainData;
  if (!td || obj.mesh3d?.shape !== 'terrain') return null;
  const t = obj.transform3d ?? { x: 0, y: 0, z: 0, rx: 0, ry: 0, rz: 0, sx: 1, sy: 1, sz: 1 };
  const sx = Math.max(0.05, Math.abs(t.sx || 1));
  const sy = Math.max(0.05, Math.abs(t.sy || 1));
  const sz = Math.max(0.05, Math.abs(t.sz || 1));

  const lx = (worldX - t.x) / sx;
  const lz = (worldZ - t.z) / sz;
  const halfW = td.width * 0.5;
  const halfD = td.depth * 0.5;
  if (lx < -halfW || lx > halfW || lz < -halfD || lz > halfD) return null;

  const u = Math.max(0, Math.min(1, (lx + halfW) / td.width));
  const v = Math.max(0, Math.min(1, (lz + halfD) / td.depth));
  const seg = Math.max(1, td.segments);
  const gx = u * seg;
  const gz = v * seg;
  const x0 = Math.min(seg - 1, Math.floor(gx));
  const z0 = Math.min(seg - 1, Math.floor(gz));
  const fx = gx - x0;
  const fz = gz - z0;
  const stride = seg + 1;

  const h00 = td.heights[z0 * stride + x0] ?? 0;
  const h10 = td.heights[z0 * stride + x0 + 1] ?? 0;
  const h01 = td.heights[(z0 + 1) * stride + x0] ?? 0;
  const h11 = td.heights[(z0 + 1) * stride + x0 + 1] ?? 0;
  const hx0 = h00 + (h10 - h00) * fx;
  const hx1 = h01 + (h11 - h01) * fx;
  return t.y + (hx0 + (hx1 - hx0) * fz) * sy;
}

/**
 * Devuelve la altura real del suelo en cualquier punto (x, z) de la escena:
 * combina Terreno Procedural + planos/cubos/rampas estáticas para que los
 * pinceles de Scatter o Valla Magnética jamás dejen objetos flotando.
 */
export function groundHeightAt(scene: SceneData, worldX: number, worldZ: number): number {
  let bestY: number | null = null;
  for (const obj of scene.objects) {
    if (!obj.visible || obj.type !== 'mesh_3d') continue;
    if (obj.mesh3d?.shape === 'terrain') {
      const th = sampleTerrainHeightAt(obj, worldX, worldZ);
      if (th !== null && (bestY === null || th > bestY)) {
        bestY = th;
      }
      continue;
    }
    if (obj.mesh3d?.shape === 'water' || obj.mesh3d?.shape === 'grass_field') continue;
    if (obj.navRole === 'obstacle' || obj.navRole === 'ignore') continue;
    if (obj.physics3d?.bodyType === 'dynamic') continue;
    const t = obj.transform3d;
    if (!t) continue;
    const hx = Math.max(0.1, Math.abs(t.sx) * 0.5);
    const hz = Math.max(0.1, Math.abs(t.sz) * 0.5);
    if (Math.abs(worldX - t.x) <= hx && Math.abs(worldZ - t.z) <= hz) {
      const topY = t.y + Math.abs(t.sy) * 0.5;
      if (bestY === null || topY > bestY) {
        bestY = topY;
      }
    }
  }
  return bestY ?? 0;
}

export type TerrainBrushMode = 'raise' | 'lower' | 'flatten' | 'smooth' | 'paint';

export function applyTerrainSculptBrush(
  obj: GameObjectData,
  worldX: number,
  worldZ: number,
  mode: TerrainBrushMode,
  radius: number,
  strength: number,
  paintChannel: 0 | 1 | 2 | 3 = 0,
  flattenTarget?: number
): TerrainData | null {
  const td = obj.mesh3d?.terrainData;
  if (!td) return null;
  const t = obj.transform3d ?? { x: 0, y: 0, z: 0, rx: 0, ry: 0, rz: 0, sx: 1, sy: 1, sz: 1 };
  const sx = Math.max(0.05, Math.abs(t.sx || 1));
  const sz = Math.max(0.05, Math.abs(t.sz || 1));
  const lxCenter = (worldX - t.x) / sx;
  const lzCenter = (worldZ - t.z) / sz;

  const seg = Math.max(1, td.segments);
  const stride = seg + 1;
  const nextHeights = [...td.heights];
  const nextSplat = [...td.splatWeights];
  const safeRad = Math.max(0.6, radius);

  const centerLocalH = sampleTerrainHeightAt(obj, worldX, worldZ);
  const targetH = flattenTarget ?? (centerLocalH !== null ? (centerLocalH - t.y) / (t.sy || 1) : 0);

  for (let rz = 0; rz < stride; rz++) {
    const vz = (rz / seg - 0.5) * td.depth;
    for (let cx = 0; cx < stride; cx++) {
      const vx = (cx / seg - 0.5) * td.width;
      const dist = Math.hypot(vx - lxCenter, vz - lzCenter);
      if (dist > safeRad) continue;
      const falloff = Math.pow(1 - dist / safeRad, 1.6) * strength;
      const idx = rz * stride + cx;

      if (mode === 'raise') {
        nextHeights[idx] += falloff;
      } else if (mode === 'lower') {
        nextHeights[idx] -= falloff;
      } else if (mode === 'flatten') {
        nextHeights[idx] += (targetH - nextHeights[idx]) * Math.min(1, falloff * 0.45);
      } else if (mode === 'smooth') {
        let sum = nextHeights[idx];
        let cnt = 1;
        if (cx > 0) { sum += td.heights[idx - 1]; cnt++; }
        if (cx < seg) { sum += td.heights[idx + 1]; cnt++; }
        if (rz > 0) { sum += td.heights[idx - stride]; cnt++; }
        if (rz < seg) { sum += td.heights[idx + stride]; cnt++; }
        const avg = sum / cnt;
        nextHeights[idx] += (avg - nextHeights[idx]) * Math.min(1, falloff * 0.6);
      } else if (mode === 'paint') {
        const si = idx * 4;
        const w = Math.min(1, falloff * 0.65);
        for (let ch = 0; ch < 4; ch++) {
          if (ch === paintChannel) {
            nextSplat[si + ch] = Math.min(1, (nextSplat[si + ch] ?? 0) + w);
          } else {
            nextSplat[si + ch] = Math.max(0, (nextSplat[si + ch] ?? 0) * (1 - w));
          }
        }
        const total =
          (nextSplat[si] ?? 0) +
          (nextSplat[si + 1] ?? 0) +
          (nextSplat[si + 2] ?? 0) +
          (nextSplat[si + 3] ?? 0);
        if (total > 0.0001) {
          nextSplat[si] /= total;
          nextSplat[si + 1] /= total;
          nextSplat[si + 2] /= total;
          nextSplat[si + 3] /= total;
        }
      }
    }
  }

  return {
    ...td,
    heights: nextHeights,
    splatWeights: nextSplat,
  };
}

export function buildTerrainGeometry(td: TerrainData): THREE.BufferGeometry {
  const seg = Math.max(1, td.segments);
  const stride = seg + 1;
  const geom = new THREE.PlaneGeometry(td.width, td.depth, seg, seg);
  geom.rotateX(-Math.PI / 2);

  const pos = geom.attributes.position;
  const colors = new Float32Array(pos.count * 3);

  // Paleta splat: [hierba #2d7a47, tierra #6b4c35, roca #64748b, arena #d6b87c]
  const cGrass = new THREE.Color('#2d7a47');
  const cDirt = new THREE.Color('#6b4c35');
  const cRock = new THREE.Color('#64748b');
  const cSand = new THREE.Color('#d6b87c');

  for (let i = 0; i < pos.count && i < stride * stride; i++) {
    const h = td.heights[i] ?? 0;
    pos.setY(i, h);

    const si = i * 4;
    const wg = td.splatWeights[si] ?? 1;
    const wd = td.splatWeights[si + 1] ?? 0;
    const wr = td.splatWeights[si + 2] ?? 0;
    const ws = td.splatWeights[si + 3] ?? 0;
    const sum = Math.max(0.0001, wg + wd + wr + ws);

    colors[i * 3] = (cGrass.r * wg + cDirt.r * wd + cRock.r * wr + cSand.r * ws) / sum;
    colors[i * 3 + 1] = (cGrass.g * wg + cDirt.g * wd + cRock.g * wr + cSand.g * ws) / sum;
    colors[i * 3 + 2] = (cGrass.b * wg + cDirt.b * wd + cRock.b * wr + cSand.b * ws) / sum;
  }

  geom.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  geom.computeVertexNormals();
  geom.computeBoundingBox();
  geom.computeBoundingSphere();
  return geom;
}

// ============================================================================
// 2. PINCEL MAGNÉTICO DE VALLAS / MUROS & SCATTER DE VEGETACIÓN
// ============================================================================

export function computeMagneticFenceSnap(
  scene: SceneData,
  cursorX: number,
  cursorZ: number,
  segmentLength = 2.4,
  snapRadius = 2.6
): { x: number; y: number; z: number; ry: number; snappedToId?: string } {
  let bestDist = snapRadius;
  let snapped: { x: number; z: number; ry: number; id: string } | null = null;

  for (const obj of scene.objects) {
    if (obj.type !== 'mesh_3d' || !obj.transform3d) continue;
    const isWallOrFence =
      obj.tags?.includes('valla') ||
      obj.tags?.includes('muro') ||
      /valla|muro|fence|wall/i.test(obj.name);
    if (!isWallOrFence) continue;
    const t = obj.transform3d;
    const rad = (t.ry * Math.PI) / 180;
    const halfLen = Math.max(0.5, Math.abs(t.sx) * 0.5);
    // Probar ambos extremos de la valla existente
    for (const sign of [-1, 1]) {
      const endX = t.x + Math.cos(rad) * halfLen * sign;
      const endZ = t.z - Math.sin(rad) * halfLen * sign;
      const dist = Math.hypot(cursorX - endX, cursorZ - endZ);
      if (dist < bestDist) {
        bestDist = dist;
        const dirAngle = Math.atan2(-(cursorZ - endZ), cursorX - endX);
        // Alinear a incrementos de 45° o seguir el ángulo exacto
        const snappedRad = Math.round(dirAngle / (Math.PI / 4)) * (Math.PI / 4);
        const centerX = endX + Math.cos(snappedRad) * (segmentLength * 0.5);
        const centerZ = endZ - Math.sin(snappedRad) * (segmentLength * 0.5);
        snapped = {
          x: Number(centerX.toFixed(3)),
          z: Number(centerZ.toFixed(3)),
          ry: Number(((snappedRad * 180) / Math.PI).toFixed(1)),
          id: obj.id,
        };
      }
    }
  }

  const px = snapped ? snapped.x : cursorX;
  const pz = snapped ? snapped.z : cursorZ;
  const groundY = groundHeightAt(scene, px, pz);
  return {
    x: Number(px.toFixed(3)),
    y: Number((groundY + 0.55).toFixed(3)),
    z: Number(pz.toFixed(3)),
    ry: snapped ? snapped.ry : 0,
    snappedToId: snapped?.id,
  };
}

export function scatterFoliageInstances(
  scene: SceneData,
  existing: WindFoliageInstance[],
  centerX: number,
  centerZ: number,
  radius: number,
  count: number,
  minScale = 0.75,
  maxScale = 1.35
): WindFoliageInstance[] {
  const next = [...existing];
  for (let i = 0; i < count; i++) {
    const a = Math.random() * Math.PI * 2;
    const r = Math.sqrt(Math.random()) * Math.max(0.4, radius);
    const wx = centerX + Math.cos(a) * r;
    const wz = centerZ + Math.sin(a) * r;
    const wy = groundHeightAt(scene, wx, wz);
    next.push({
      x: Number(wx.toFixed(3)),
      y: Number(wy.toFixed(3)),
      z: Number(wz.toFixed(3)),
      scale: Number((minScale + Math.random() * (maxScale - minScale)).toFixed(3)),
      rotY: Number((Math.random() * Math.PI * 2).toFixed(3)),
      variant: i % 3,
    });
  }
  return next.slice(0, 2500);
}

// ============================================================================
// 3. DOMO DE CIELO 3D & CICLO DÍA / NOCHE REAL
// ============================================================================

export interface DayNightResolvedState {
  zenithColor: string;
  horizonColor: string;
  sunColor: string;
  sunIntensity: number;
  ambientColor: string;
  ambientIntensity: number;
  fogColor: string;
  sunPosition: [number, number, number];
  isNight: boolean;
}

export function computeDayNightLighting(
  lighting: SceneLightingConfig | undefined,
  overrideTime?: number
): DayNightResolvedState {
  const hour = ((overrideTime ?? lighting?.timeOfDay ?? 12.5) % 24 + 24) % 24;
  // Ángulo solar: 6h = amanecer (0 rad), 12h = cenit (PI/2), 18h = ocaso (PI)
  const sunAngle = ((hour - 6) / 24) * Math.PI * 2;
  const elevation = Math.sin(sunAngle); // -1..+1
  const dist = 36;
  const sunX = Math.cos(sunAngle) * dist;
  const sunY = Math.max(-12, elevation * dist);
  const sunZ = 14;

  const dayWeight = Math.max(0, Math.min(1, (elevation + 0.15) / 0.75));
  const duskWeight = Math.max(0, 1 - Math.abs(elevation) * 3.5);

  const nightZenith = new THREE.Color('#070b19');
  const dayZenith = new THREE.Color('#1d4ed8');
  const duskZenith = new THREE.Color('#4c1d95');

  const nightHorizon = new THREE.Color('#111827');
  const dayHorizon = new THREE.Color('#93c5fd');
  const duskHorizon = new THREE.Color('#fb923c');

  const zenith = nightZenith.clone().lerp(dayZenith, dayWeight).lerp(duskZenith, duskWeight * 0.55);
  const horizon = nightHorizon.clone().lerp(dayHorizon, dayWeight).lerp(duskHorizon, duskWeight * 0.75);

  const sunCol = new THREE.Color('#fef08a').lerp(new THREE.Color('#f97316'), duskWeight * 0.8);
  const ambCol = new THREE.Color('#1e293b').lerp(new THREE.Color(lighting?.ambientColor ?? '#c7d8f8'), dayWeight);

  return {
    zenithColor: '#' + zenith.getHexString(),
    horizonColor: '#' + horizon.getHexString(),
    sunColor: '#' + sunCol.getHexString(),
    sunIntensity: Number((0.12 + dayWeight * (lighting?.sunIntensity ?? 1.45)).toFixed(3)),
    ambientColor: '#' + ambCol.getHexString(),
    ambientIntensity: Number((0.22 + dayWeight * (lighting?.ambientIntensity ?? 0.5)).toFixed(3)),
    fogColor: '#' + horizon.clone().lerp(zenith, 0.25).getHexString(),
    sunPosition: [sunX, sunY, sunZ],
    isNight: elevation < -0.05,
  };
}

export function createSkyDomeMesh(
  zenithHex: string,
  horizonHex: string,
  cloudsEnabled = true
): { mesh: THREE.Mesh; uniforms: { uZenith: { value: THREE.Color }; uHorizon: { value: THREE.Color }; uTime: { value: number }; uClouds: { value: number } } } {
  const uniforms = {
    uZenith: { value: new THREE.Color(zenithHex) },
    uHorizon: { value: new THREE.Color(horizonHex) },
    uTime: { value: 0 },
    uClouds: { value: cloudsEnabled ? 1.0 : 0.0 },
  };

  const mat = new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthWrite: false,
    uniforms,
    vertexShader: `
      varying vec3 vWorldPos;
      void main() {
        vec4 wp = modelMatrix * vec4(position, 1.0);
        vWorldPos = wp.xyz;
        gl_Position = projectionMatrix * viewMatrix * wp;
      }
    `,
    fragmentShader: `
      uniform vec3 uZenith;
      uniform vec3 uHorizon;
      uniform float uTime;
      uniform float uClouds;
      varying vec3 vWorldPos;

      float hash(vec2 p) {
        return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
      }
      float noise(vec2 p) {
        vec2 i = floor(p);
        vec2 f = fract(p);
        vec2 u = f * f * (3.0 - 2.0 * f);
        return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), u.x),
                   mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x), u.y);
      }

      void main() {
        vec3 dir = normalize(vWorldPos);
        float h = clamp(dir.y, 0.0, 1.0);
        vec3 sky = mix(uHorizon, uZenith, pow(h, 0.58));
        if (uClouds > 0.5 && dir.y > 0.04) {
          vec2 uv = dir.xz / (dir.y + 0.18) * 1.6 + vec2(uTime * 0.03, uTime * 0.012);
          float c = noise(uv) * 0.6 + noise(uv * 2.3) * 0.4;
          float mask = smoothstep(0.54, 0.82, c) * smoothstep(0.04, 0.25, dir.y);
          sky = mix(sky, vec3(0.96, 0.98, 1.0), mask * 0.45);
        }
        gl_FragColor = vec4(sky, 1.0);
      }
    `,
  });

  const geo = new THREE.SphereGeometry(180, 28, 18);
  const mesh = new THREE.Mesh(geo, mat);
  mesh.frustumCulled = false;
  mesh.renderOrder = -10;
  return { mesh, uniforms };
}

// ============================================================================
// 4. AGUA / RÍO / OCÉANO INTERACTIVO CON ESPUMA Y ONDAS
// ============================================================================

export function createWaterSurfaceMesh(
  cfg: WaterConfig,
  obstaclePositions: THREE.Vector3[] = []
): {
  mesh: THREE.Mesh;
  uniforms: {
    uTime: { value: number };
    uFlow: { value: THREE.Vector2 };
    uAmp: { value: number };
    uSpeed: { value: number };
    uShallow: { value: THREE.Color };
    uDeep: { value: THREE.Color };
    uFoam: { value: number };
    uPlayerPos: { value: THREE.Vector3 };
    uSplashTime: { value: number };
    uObstacles: { value: THREE.Vector3[] };
    uObstacleCount: { value: number };
  };
} {
  const paddedObs: THREE.Vector3[] = [];
  for (let i = 0; i < 8; i++) {
    paddedObs.push(obstaclePositions[i] ? obstaclePositions[i].clone() : new THREE.Vector3(9999, -999, 9999));
  }

  const uniforms = {
    uTime: { value: 0 },
    uFlow: { value: new THREE.Vector2(cfg.flowX ?? 0.6, cfg.flowZ ?? 0.2) },
    uAmp: { value: cfg.waveAmplitude ?? 0.14 },
    uSpeed: { value: cfg.waveSpeed ?? 1.8 },
    uShallow: { value: new THREE.Color(cfg.shallowColor || '#38bdf8') },
    uDeep: { value: new THREE.Color(cfg.deepColor || '#0c4a6e') },
    uFoam: { value: cfg.foamIntensity ?? 0.8 },
    uPlayerPos: { value: new THREE.Vector3(9999, -999, 9999) },
    uSplashTime: { value: -10 },
    uObstacles: { value: paddedObs },
    uObstacleCount: { value: Math.min(8, obstaclePositions.length) },
  };

  const geo = new THREE.PlaneGeometry(Math.max(4, cfg.width || 24), Math.max(4, cfg.depth || 24), 48, 48);
  geo.rotateX(-Math.PI / 2);

  const mat = new THREE.ShaderMaterial({
    transparent: true,
    uniforms,
    vertexShader: `
      uniform float uTime;
      uniform vec2 uFlow;
      uniform float uAmp;
      uniform float uSpeed;
      uniform vec3 uPlayerPos;
      uniform float uSplashTime;
      varying vec3 vWorldPos;
      varying float vWaveH;

      void main() {
        vec3 p = position;
        vec4 wp = modelMatrix * vec4(p, 1.0);
        float t = uTime * uSpeed;
        float w1 = sin(wp.x * 0.75 + t + uFlow.x * t * 0.8) * cos(wp.z * 0.65 + uFlow.y * t * 0.8);
        float w2 = sin((wp.x + wp.z) * 1.4 - t * 1.3) * 0.4;
        float dPlayer = distance(wp.xz, uPlayerPos.xz);
        float splashAge = uTime - uSplashTime;
        float ripple = 0.0;
        if (splashAge > 0.0 && splashAge < 1.8 && dPlayer < 6.0) {
          ripple = sin(dPlayer * 5.0 - splashAge * 10.0) * exp(-splashAge * 1.8) * exp(-dPlayer * 0.45) * 0.25;
        }
        float h = (w1 + w2) * uAmp + ripple;
        p.y += h;
        wp = modelMatrix * vec4(p, 1.0);
        vWorldPos = wp.xyz;
        vWaveH = h;
        gl_Position = projectionMatrix * viewMatrix * wp;
      }
    `,
    fragmentShader: `
      uniform float uTime;
      uniform vec2 uFlow;
      uniform vec3 uShallow;
      uniform vec3 uDeep;
      uniform float uFoam;
      uniform vec3 uPlayerPos;
      uniform float uSplashTime;
      uniform vec3 uObstacles[8];
      uniform int uObstacleCount;
      varying vec3 vWorldPos;
      varying float vWaveH;

      void main() {
        vec2 uv = vWorldPos.xz * 0.35 - uFlow * (uTime * 0.28);
        float shimmer = sin(uv.x * 4.5 + uTime * 1.7) * cos(uv.y * 4.5 - uTime * 1.4);
        float crest = smoothstep(0.04, 0.22, vWaveH + shimmer * 0.05);
        vec3 base = mix(uDeep, uShallow, 0.42 + crest * 0.45);

        // Espuma alrededor de rocas / obstáculos en el agua
        float foam = crest * 0.35 * uFoam;
        for (int i = 0; i < 8; i++) {
          if (i >= uObstacleCount) break;
          float d = distance(vWorldPos.xz, uObstacles[i].xz);
          float ring = 1.0 - smoothstep(0.55, 1.85, d);
          float ringWave = 0.5 + 0.5 * sin(d * 8.0 - uTime * 4.2);
          foam += ring * ringWave * 0.75 * uFoam;
        }

        // Onda expansiva donde entra el jugador
        float dp = distance(vWorldPos.xz, uPlayerPos.xz);
        if (dp < 3.6) {
          float age = max(0.0, uTime - uSplashTime);
          float pulse = (1.0 - smoothstep(0.0, 3.2, dp)) * (0.45 + 0.55 * sin(dp * 6.0 - uTime * 7.0));
          foam += pulse * (age < 1.5 ? 0.9 : 0.35) * uFoam;
        }

        vec3 finalCol = mix(base, vec3(0.92, 0.98, 1.0), clamp(foam, 0.0, 0.85));
        gl_FragColor = vec4(finalCol, 0.80);
      }
    `,
  });

  const mesh = new THREE.Mesh(geo, mat);
  return { mesh, uniforms };
}

// ============================================================================
// 5. HIERBA / ARBUSTOS CON VIENTO E INTERACCIÓN DEL JUGADOR (InstancedMesh)
// ============================================================================

export function createWindFoliageInstancedMesh(
  cfg: WindFoliageConfig
): {
  mesh: THREE.InstancedMesh;
  uniforms: {
    uTime: { value: number };
    uWindStrength: { value: number };
    uWindSpeed: { value: number };
    uPlayerPos: { value: THREE.Vector3 };
    uInteractionRadius: { value: number };
  };
} {
  const count = Math.max(1, cfg.instances.length);
  const uniforms = {
    uTime: { value: 0 },
    uWindStrength: { value: cfg.windStrength ?? 0.38 },
    uWindSpeed: { value: cfg.windSpeed ?? 2.4 },
    uPlayerPos: { value: new THREE.Vector3(9999, -999, 9999) },
    uInteractionRadius: { value: cfg.interactionRadius ?? 1.8 },
  };

  let geom: THREE.BufferGeometry;
  if (cfg.kind === 'bush') {
    geom = new THREE.DodecahedronGeometry(0.45, 0);
    geom.translate(0, 0.35, 0);
  } else if (cfg.kind === 'flower') {
    geom = new THREE.ConeGeometry(0.18, 0.65, 5);
    geom.translate(0, 0.32, 0);
  } else {
    // Brizna de hierba estrecha anclada en la base (y = 0..0.85)
    geom = new THREE.ConeGeometry(0.14, 0.85, 4);
    geom.translate(0, 0.425, 0);
  }

  const mat = new THREE.MeshStandardMaterial({
    color: new THREE.Color(cfg.colorTip || '#4ade80'),
    roughness: 0.78,
    metalness: 0.05,
  });

  mat.onBeforeCompile = (shader) => {
    shader.uniforms.uTime = uniforms.uTime;
    shader.uniforms.uWindStrength = uniforms.uWindStrength;
    shader.uniforms.uWindSpeed = uniforms.uWindSpeed;
    shader.uniforms.uPlayerPos = uniforms.uPlayerPos;
    shader.uniforms.uInteractionRadius = uniforms.uInteractionRadius;

    shader.vertexShader =
      `
      uniform float uTime;
      uniform float uWindStrength;
      uniform float uWindSpeed;
      uniform vec3 uPlayerPos;
      uniform float uInteractionRadius;
      ` +
      shader.vertexShader.replace(
        '#include <begin_vertex>',
        `
        #include <begin_vertex>
        float hMask = clamp(position.y * 1.15, 0.0, 1.0);
        vec4 instOrigin = vec4(0.0, 0.0, 0.0, 1.0);
        #ifdef USE_INSTANCING
          instOrigin = instanceMatrix * instOrigin;
        #endif
        vec4 worldOrigin = modelMatrix * instOrigin;
        float sway = sin(uTime * uWindSpeed + worldOrigin.x * 0.85 + worldOrigin.z * 0.65) * uWindStrength * hMask;
        transformed.x += sway;
        transformed.z += sway * 0.45;
        vec2 away = worldOrigin.xz - uPlayerPos.xz;
        float distP = length(away);
        if (distP < uInteractionRadius && distP > 0.001) {
          float push = (1.0 - distP / uInteractionRadius) * 0.72 * hMask;
          vec2 dirP = away / distP;
          transformed.x += dirP.x * push;
          transformed.z += dirP.y * push;
          transformed.y -= push * 0.35;
        }
        `
      );
  };

  const inst = new THREE.InstancedMesh(geom, mat, count);
  const dummy = new THREE.Object3D();
  const baseCol = new THREE.Color(cfg.colorBase || '#15803d');
  const tipCol = new THREE.Color(cfg.colorTip || '#4ade80');

  if (cfg.instances.length === 0) {
    dummy.position.set(0, -999, 0);
    dummy.scale.set(0.001, 0.001, 0.001);
    dummy.updateMatrix();
    inst.setMatrixAt(0, dummy.matrix);
  } else {
    for (let i = 0; i < cfg.instances.length; i++) {
      const it = cfg.instances[i];
      dummy.position.set(it.x, it.y, it.z);
      dummy.rotation.set(0, it.rotY, 0);
      dummy.scale.setScalar(Math.max(0.25, it.scale));
      dummy.updateMatrix();
      inst.setMatrixAt(i, dummy.matrix);
      inst.setColorAt(i, baseCol.clone().lerp(tipCol, 0.4 + ((i % 5) / 4) * 0.6));
    }
  }
  inst.instanceMatrix.needsUpdate = true;
  if (inst.instanceColor) inst.instanceColor.needsUpdate = true;
  inst.computeBoundingSphere();

  return { mesh: inst, uniforms };
}
