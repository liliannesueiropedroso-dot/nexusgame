/**
 * Runtime 3D completo e independiente para paquetes HTML5 exportados (Three.js + CSS/HTML Widgets + Scripts JS).
 * Usa `window.THREE` y `window.NEXUS_THREE_EXT` cargados desde `js/three.min.js`.
 */

import type { Html5CompileOptions } from './portalSdks';

export function generateNexus3DRuntimeJs(options: Html5CompileOptions): string {
  return `(async function () {
  var SCALE_MODE = ${JSON.stringify(options.scaleMode)};
  var TOUCH_OPT = ${JSON.stringify(Boolean(options.touchControls))};
  var DEG2RAD = Math.PI / 180;
  var FIXED_DT = 1 / 60;
  var THREE = window.THREE;
  var EXT = window.NEXUS_THREE_EXT || {};
  if (!THREE) {
    console.error('[NEXUS 3D] No se encontró Three.js en window.THREE');
    return;
  }

  function cloneData(obj) {
    return JSON.parse(JSON.stringify(obj));
  }

  function detectSoftwareWebGL() {
    try {
      var c = document.createElement('canvas');
      var gl = c.getContext('webgl2') || c.getContext('webgl');
      if (!gl) return true;
      var dbg = gl.getExtension('WEBGL_debug_renderer_info');
      var r = dbg ? String(gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL) || '') : '';
      return /SwiftShader|llvmpipe|Software/i.test(r);
    } catch (_) {
      return false;
    }
  }

  function scopeWidgetCss(rawCss, scopeAttr) {
    if (!rawCss || !rawCss.trim()) return '';
    var prefix = '[data-nx-widget="' + scopeAttr + '"]';
    return rawCss.replace(/(^|\\})\\s*([^{}@]+)\\{/g, function (_, brace, sel) {
      var trimmed = sel.trim();
      if (!trimmed) return brace + ' {';
      if (/^(from|to|\\d+%)$/.test(trimmed)) return brace + '\\n' + trimmed + ' {';
      var parts = trimmed.split(',').map(function (s) {
        var p = s.trim();
        if (!p) return '';
        if (p === ':host' || p === ':root' || p === 'body') return prefix;
        if (p.indexOf(prefix) >= 0) return p;
        return prefix + ' ' + p;
      }).filter(Boolean).join(', ');
      return brace + '\\n' + parts + ' {';
    });
  }

  function computeJoystickVector(dx, dy, maxRadius, deadzone) {
    var rad = Math.max(8, maxRadius || 42);
    var dz = Math.max(0, Math.min(0.6, deadzone !== undefined ? deadzone : 0.16));
    var dist = Math.hypot(dx, dy);
    if (dist <= 0.0001) return { x: 0, y: 0, magnitude: 0 };
    var rawMag = Math.min(1, dist / rad);
    if (rawMag <= dz) return { x: 0, y: 0, magnitude: 0 };
    var rescaled = Math.min(1, (rawMag - dz) / Math.max(0.05, 1 - dz));
    return { x: (dx / dist) * rescaled, y: (dy / dist) * rescaled, magnitude: rescaled };
  }

  // ---- Geometrías Modulares y Terreno Procedural 3D ----
  function buildRampGeometry() {
    var s = new THREE.Shape();
    s.moveTo(-0.5, -0.5);
    s.lineTo(0.5, -0.5);
    s.lineTo(-0.5, 0.5);
    s.closePath();
    var g = new THREE.ExtrudeGeometry(s, { depth: 1, bevelEnabled: false, steps: 1 });
    g.translate(0, 0, -0.5);
    g.computeVertexNormals();
    return g;
  }

  function buildStairsGeometry(steps) {
    var n = Math.max(3, Math.min(12, Math.round(steps || 6)));
    var s = new THREE.Shape();
    s.moveTo(0.5, -0.5);
    s.lineTo(-0.5, -0.5);
    s.lineTo(-0.5, 0.5);
    var stepW = 1 / n;
    var stepH = 1 / n;
    for (var i = 0; i < n; i++) {
      var xR = -0.5 + (i + 1) * stepW;
      var yTop = 0.5 - i * stepH;
      var yBot = 0.5 - (i + 1) * stepH;
      s.lineTo(xR, yTop);
      if (i < n - 1) s.lineTo(xR, yBot);
    }
    s.lineTo(0.5, -0.5);
    s.closePath();
    var g = new THREE.ExtrudeGeometry(s, { depth: 1, bevelEnabled: false, steps: 1 });
    g.translate(0, 0, -0.5);
    g.computeVertexNormals();
    return g;
  }

  function buildArchGeometry() {
    var outer = new THREE.Shape();
    outer.moveTo(-0.5, -0.5); outer.lineTo(0.5, -0.5); outer.lineTo(0.5, 0.5); outer.lineTo(-0.5, 0.5); outer.closePath();
    var hole = new THREE.Path();
    hole.moveTo(-0.28, -0.5); hole.lineTo(0.28, -0.5); hole.lineTo(0.28, 0.05);
    hole.absarc(0, 0.05, 0.28, 0, Math.PI, false); hole.lineTo(-0.28, -0.5);
    outer.holes.push(hole);
    var g = new THREE.ExtrudeGeometry(outer, { depth: 1, bevelEnabled: false, curveSegments: 16 });
    g.translate(0, 0, -0.5);
    g.computeVertexNormals();
    return g;
  }

  function deserializeCsgGeometry(d) {
    var geom = new THREE.BufferGeometry();
    geom.setAttribute('position', new THREE.Float32BufferAttribute(d.positions || [], 3));
    if (d.normals && d.normals.length === (d.positions || []).length) {
      geom.setAttribute('normal', new THREE.Float32BufferAttribute(d.normals, 3));
    }
    if (d.uvs && d.uvs.length > 0) {
      geom.setAttribute('uv', new THREE.Float32BufferAttribute(d.uvs, 2));
    }
    if (d.indices && d.indices.length > 0) geom.setIndex(d.indices);
    if (!d.normals || d.normals.length !== (d.positions || []).length) geom.computeVertexNormals();
    geom.computeBoundingBox();
    geom.computeBoundingSphere();
    return geom;
  }

  function buildTerrainGeometry(td) {
    var seg = Math.max(1, td.segments || 32);
    var stride = seg + 1;
    var geom = new THREE.PlaneGeometry(td.width || 48, td.depth || 48, seg, seg);
    geom.rotateX(-Math.PI / 2);
    var pos = geom.attributes.position;
    var colors = new Float32Array(pos.count * 3);
    var cGrass = new THREE.Color('#2d7a47');
    var cDirt = new THREE.Color('#6b4c35');
    var cRock = new THREE.Color('#64748b');
    var cSand = new THREE.Color('#d6b87c');
    var heights = td.heights || [];
    var splat = td.splatWeights || [];
    for (var i = 0; i < pos.count && i < stride * stride; i++) {
      pos.setY(i, heights[i] !== undefined ? heights[i] : 0);
      var si = i * 4;
      var wg = splat[si] !== undefined ? splat[si] : 1;
      var wd = splat[si + 1] !== undefined ? splat[si + 1] : 0;
      var wr = splat[si + 2] !== undefined ? splat[si + 2] : 0;
      var ws = splat[si + 3] !== undefined ? splat[si + 3] : 0;
      var sum = Math.max(0.0001, wg + wd + wr + ws);
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

  function buildModularGeometry(m3) {
    if (m3.shape === 'csg' && m3.csgGeometryJson) return deserializeCsgGeometry(m3.csgGeometryJson);
    if (m3.shape === 'terrain' && m3.terrainData) return buildTerrainGeometry(m3.terrainData);
    if (m3.shape === 'sphere') return new THREE.SphereGeometry(0.5, 24, 18);
    if (m3.shape === 'cylinder') return new THREE.CylinderGeometry(0.5, 0.5, 1, 24);
    if (m3.shape === 'plane') return new THREE.BoxGeometry(1, 0.08, 1);
    if (m3.shape === 'ramp') return buildRampGeometry();
    if (m3.shape === 'stairs') return buildStairsGeometry(6);
    if (m3.shape === 'arch') return buildArchGeometry();
    return new THREE.BoxGeometry(1, 1, 1);
  }

  function sampleTerrainHeightAt(obj, worldX, worldZ) {
    var m3 = obj.source ? obj.source.mesh3d : obj.mesh3d;
    var td = m3 && m3.terrainData;
    if (!td || m3.shape !== 'terrain') return null;
    var t = obj.t3 || obj.transform3d || { x: 0, y: 0, z: 0, sx: 1, sy: 1, sz: 1 };
    var sx = Math.max(0.05, Math.abs(t.sx || 1));
    var sy = Math.max(0.05, Math.abs(t.sy || 1));
    var sz = Math.max(0.05, Math.abs(t.sz || 1));
    var lx = (worldX - t.x) / sx;
    var lz = (worldZ - t.z) / sz;
    var halfW = td.width * 0.5;
    var halfD = td.depth * 0.5;
    if (lx < -halfW || lx > halfW || lz < -halfD || lz > halfD) return null;
    var u = Math.max(0, Math.min(1, (lx + halfW) / td.width));
    var v = Math.max(0, Math.min(1, (lz + halfD) / td.depth));
    var seg = Math.max(1, td.segments);
    var gx = u * seg;
    var gz = v * seg;
    var x0 = Math.min(seg - 1, Math.floor(gx));
    var z0 = Math.min(seg - 1, Math.floor(gz));
    var fx = gx - x0;
    var fz = gz - z0;
    var stride = seg + 1;
    var hs = td.heights || [];
    var h00 = hs[z0 * stride + x0] || 0;
    var h10 = hs[z0 * stride + x0 + 1] || 0;
    var h01 = hs[(z0 + 1) * stride + x0] || 0;
    var h11 = hs[(z0 + 1) * stride + x0 + 1] || 0;
    var hx0 = h00 + (h10 - h00) * fx;
    var hx1 = h01 + (h11 - h01) * fx;
    return t.y + (hx0 + (hx1 - hx0) * fz) * sy;
  }

  function groundHeightAt(simObjs, worldX, worldZ) {
    var bestY = null;
    for (var i = 0; i < simObjs.length; i++) {
      var o = simObjs[i];
      if (!o.visible || o.type !== 'mesh_3d') continue;
      var m3 = o.source && o.source.mesh3d;
      if (m3 && m3.shape === 'terrain') {
        var th = sampleTerrainHeightAt(o, worldX, worldZ);
        if (th !== null && (bestY === null || th > bestY)) bestY = th;
        continue;
      }
      if (m3 && (m3.shape === 'water' || m3.shape === 'grass_field')) continue;
      if (o.source.navRole === 'obstacle' || o.source.navRole === 'ignore') continue;
      if (o.source.physics3d && o.source.physics3d.bodyType === 'dynamic') continue;
      var t = o.t3;
      var hx = Math.max(0.1, Math.abs(t.sx) * 0.5);
      var hz = Math.max(0.1, Math.abs(t.sz) * 0.5);
      if (Math.abs(worldX - t.x) <= hx && Math.abs(worldZ - t.z) <= hz) {
        var topY = t.y + Math.abs(t.sy) * 0.5;
        if (bestY === null || topY > bestY) bestY = topY;
      }
    }
    return bestY !== null ? bestY : 0;
  }

  // ---- Ciclo Día/Noche & Domo de Cielo, Agua Reactiva, Hierba con Viento ----
  function computeDayNightLighting(lighting, overrideTime) {
    var rawH = overrideTime !== undefined ? overrideTime : (lighting && lighting.timeOfDay !== undefined ? lighting.timeOfDay : 12.5);
    var hour = ((rawH % 24) + 24) % 24;
    var sunAngle = ((hour - 6) / 24) * Math.PI * 2;
    var elevation = Math.sin(sunAngle);
    var dist = 36;
    var sunX = Math.cos(sunAngle) * dist;
    var sunY = Math.max(-12, elevation * dist);
    var sunZ = 14;
    var dayWeight = Math.max(0, Math.min(1, (elevation + 0.15) / 0.75));
    var duskWeight = Math.max(0, 1 - Math.abs(elevation) * 3.5);

    var zenith = new THREE.Color('#070b19').lerp(new THREE.Color('#1d4ed8'), dayWeight).lerp(new THREE.Color('#4c1d95'), duskWeight * 0.55);
    var horizon = new THREE.Color('#111827').lerp(new THREE.Color('#93c5fd'), dayWeight).lerp(new THREE.Color('#fb923c'), duskWeight * 0.75);
    var sunCol = new THREE.Color('#fef08a').lerp(new THREE.Color('#f97316'), duskWeight * 0.8);
    var ambCol = new THREE.Color('#1e293b').lerp(new THREE.Color((lighting && lighting.ambientColor) || '#c7d8f8'), dayWeight);

    return {
      zenithColor: '#' + zenith.getHexString(),
      horizonColor: '#' + horizon.getHexString(),
      sunColor: '#' + sunCol.getHexString(),
      sunIntensity: 0.12 + dayWeight * ((lighting && lighting.sunIntensity) !== undefined ? lighting.sunIntensity : 1.45),
      ambientColor: '#' + ambCol.getHexString(),
      ambientIntensity: 0.22 + dayWeight * ((lighting && lighting.ambientIntensity) !== undefined ? lighting.ambientIntensity : 0.5),
      fogColor: '#' + horizon.clone().lerp(zenith, 0.25).getHexString(),
      sunPosition: [sunX, sunY, sunZ]
    };
  }

  function createSkyDomeMesh(zenithHex, horizonHex, cloudsEnabled) {
    var uniforms = {
      uZenith: { value: new THREE.Color(zenithHex) },
      uHorizon: { value: new THREE.Color(horizonHex) },
      uTime: { value: 0 },
      uClouds: { value: cloudsEnabled ? 1.0 : 0.0 }
    };
    var mat = new THREE.ShaderMaterial({
      side: THREE.BackSide,
      depthWrite: false,
      uniforms: uniforms,
      vertexShader: 'varying vec3 vWorldPos; void main() { vec4 wp = modelMatrix * vec4(position, 1.0); vWorldPos = wp.xyz; gl_Position = projectionMatrix * viewMatrix * wp; }',
      fragmentShader: [
        'uniform vec3 uZenith; uniform vec3 uHorizon; uniform float uTime; uniform float uClouds; varying vec3 vWorldPos;',
        'float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123); }',
        'float noise(vec2 p) { vec2 i = floor(p); vec2 f = fract(p); vec2 u = f * f * (3.0 - 2.0 * f); return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), u.x), mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x), u.y); }',
        'void main() {',
        '  vec3 dir = normalize(vWorldPos);',
        '  float h = clamp(dir.y, 0.0, 1.0);',
        '  vec3 sky = mix(uHorizon, uZenith, pow(h, 0.58));',
        '  if (uClouds > 0.5 && dir.y > 0.04) {',
        '    vec2 uv = dir.xz / (dir.y + 0.18) * 1.6 + vec2(uTime * 0.03, uTime * 0.012);',
        '    float c = noise(uv) * 0.6 + noise(uv * 2.3) * 0.4;',
        '    float mask = smoothstep(0.54, 0.82, c) * smoothstep(0.04, 0.25, dir.y);',
        '    sky = mix(sky, vec3(0.96, 0.98, 1.0), mask * 0.45);',
        '  }',
        '  gl_FragColor = vec4(sky, 1.0);',
        '}'
      ].join('\\n')
    });
    var mesh = new THREE.Mesh(new THREE.SphereGeometry(180, 24, 14), mat);
    mesh.frustumCulled = false;
    mesh.renderOrder = -10;
    return { mesh: mesh, uniforms: uniforms };
  }

  function createWaterSurfaceMesh(cfg, obstaclePositions) {
    var padded = [];
    for (var i = 0; i < 8; i++) {
      padded.push(obstaclePositions[i] ? obstaclePositions[i].clone() : new THREE.Vector3(9999, -999, 9999));
    }
    var uniforms = {
      uTime: { value: 0 },
      uFlow: { value: new THREE.Vector2(cfg.flowX !== undefined ? cfg.flowX : 0.6, cfg.flowZ !== undefined ? cfg.flowZ : 0.2) },
      uAmp: { value: cfg.waveAmplitude !== undefined ? cfg.waveAmplitude : 0.14 },
      uSpeed: { value: cfg.waveSpeed !== undefined ? cfg.waveSpeed : 1.8 },
      uShallow: { value: new THREE.Color(cfg.shallowColor || '#38bdf8') },
      uDeep: { value: new THREE.Color(cfg.deepColor || '#0c4a6e') },
      uFoam: { value: cfg.foamIntensity !== undefined ? cfg.foamIntensity : 0.8 },
      uPlayerPos: { value: new THREE.Vector3(9999, -999, 9999) },
      uSplashTime: { value: -10 },
      uObstacles: { value: padded },
      uObstacleCount: { value: Math.min(8, obstaclePositions.length) }
    };
    var geo = new THREE.PlaneGeometry(Math.max(4, cfg.width || 24), Math.max(4, cfg.depth || 24), 40, 40);
    geo.rotateX(-Math.PI / 2);
    var mat = new THREE.ShaderMaterial({
      transparent: true,
      uniforms: uniforms,
      vertexShader: [
        'uniform float uTime; uniform vec2 uFlow; uniform float uAmp; uniform float uSpeed; uniform vec3 uPlayerPos; uniform float uSplashTime;',
        'varying vec3 vWorldPos; varying float vWaveH;',
        'void main() {',
        '  vec3 p = position; vec4 wp = modelMatrix * vec4(p, 1.0);',
        '  float t = uTime * uSpeed;',
        '  float w1 = sin(wp.x * 0.75 + t + uFlow.x * t * 0.8) * cos(wp.z * 0.65 + uFlow.y * t * 0.8);',
        '  float w2 = sin((wp.x + wp.z) * 1.4 - t * 1.3) * 0.4;',
        '  float dP = distance(wp.xz, uPlayerPos.xz); float age = uTime - uSplashTime; float ripple = 0.0;',
        '  if (age > 0.0 && age < 1.8 && dP < 6.0) ripple = sin(dP * 5.0 - age * 10.0) * exp(-age * 1.8) * exp(-dP * 0.45) * 0.25;',
        '  float h = (w1 + w2) * uAmp + ripple; p.y += h;',
        '  wp = modelMatrix * vec4(p, 1.0); vWorldPos = wp.xyz; vWaveH = h;',
        '  gl_Position = projectionMatrix * viewMatrix * wp;',
        '}'
      ].join('\\n'),
      fragmentShader: [
        'uniform float uTime; uniform vec2 uFlow; uniform vec3 uShallow; uniform vec3 uDeep; uniform float uFoam;',
        'uniform vec3 uPlayerPos; uniform float uSplashTime; uniform vec3 uObstacles[8]; uniform int uObstacleCount;',
        'varying vec3 vWorldPos; varying float vWaveH;',
        'void main() {',
        '  vec2 uv = vWorldPos.xz * 0.35 - uFlow * (uTime * 0.28);',
        '  float shimmer = sin(uv.x * 4.5 + uTime * 1.7) * cos(uv.y * 4.5 - uTime * 1.4);',
        '  float crest = smoothstep(0.04, 0.22, vWaveH + shimmer * 0.05);',
        '  vec3 base = mix(uDeep, uShallow, 0.42 + crest * 0.45);',
        '  float foam = crest * 0.35 * uFoam;',
        '  for (int i = 0; i < 8; i++) {',
        '    if (i >= uObstacleCount) break;',
        '    float d = distance(vWorldPos.xz, uObstacles[i].xz);',
        '    float ring = 1.0 - smoothstep(0.55, 1.85, d);',
        '    foam += ring * (0.5 + 0.5 * sin(d * 8.0 - uTime * 4.2)) * 0.75 * uFoam;',
        '  }',
        '  float dp = distance(vWorldPos.xz, uPlayerPos.xz);',
        '  if (dp < 3.6) {',
        '    float age = max(0.0, uTime - uSplashTime);',
        '    float pulse = (1.0 - smoothstep(0.0, 3.2, dp)) * (0.45 + 0.55 * sin(dp * 6.0 - uTime * 7.0));',
        '    foam += pulse * (age < 1.5 ? 0.9 : 0.35) * uFoam;',
        '  }',
        '  vec3 finalCol = mix(base, vec3(0.92, 0.98, 1.0), clamp(foam, 0.0, 0.85));',
        '  gl_FragColor = vec4(finalCol, 0.80);',
        '}'
      ].join('\\n')
    });
    return { mesh: new THREE.Mesh(geo, mat), uniforms: uniforms };
  }

  function createWindFoliageInstancedMesh(cfg) {
    var instances = cfg.instances || [];
    var count = Math.max(1, instances.length);
    var uniforms = {
      uTime: { value: 0 },
      uWindStrength: { value: cfg.windStrength !== undefined ? cfg.windStrength : 0.38 },
      uWindSpeed: { value: cfg.windSpeed !== undefined ? cfg.windSpeed : 2.4 },
      uPlayerPos: { value: new THREE.Vector3(9999, -999, 9999) },
      uInteractionRadius: { value: cfg.interactionRadius !== undefined ? cfg.interactionRadius : 1.8 }
    };
    var geom;
    if (cfg.kind === 'bush') { geom = new THREE.DodecahedronGeometry(0.45, 0); geom.translate(0, 0.35, 0); }
    else if (cfg.kind === 'flower') { geom = new THREE.ConeGeometry(0.18, 0.65, 5); geom.translate(0, 0.32, 0); }
    else { geom = new THREE.ConeGeometry(0.14, 0.85, 4); geom.translate(0, 0.425, 0); }

    var mat = new THREE.MeshStandardMaterial({ color: new THREE.Color(cfg.colorTip || '#4ade80'), roughness: 0.78, metalness: 0.05 });
    mat.onBeforeCompile = function (shader) {
      shader.uniforms.uTime = uniforms.uTime;
      shader.uniforms.uWindStrength = uniforms.uWindStrength;
      shader.uniforms.uWindSpeed = uniforms.uWindSpeed;
      shader.uniforms.uPlayerPos = uniforms.uPlayerPos;
      shader.uniforms.uInteractionRadius = uniforms.uInteractionRadius;
      shader.vertexShader = 'uniform float uTime; uniform float uWindStrength; uniform float uWindSpeed; uniform vec3 uPlayerPos; uniform float uInteractionRadius;\\n' +
        shader.vertexShader.replace('#include <begin_vertex>', [
          '#include <begin_vertex>',
          'float hMask = clamp(position.y * 1.15, 0.0, 1.0);',
          'vec4 instOrigin = vec4(0.0, 0.0, 0.0, 1.0);',
          '#ifdef USE_INSTANCING',
          '  instOrigin = instanceMatrix * instOrigin;',
          '#endif',
          'vec4 worldOrigin = modelMatrix * instOrigin;',
          'float sway = sin(uTime * uWindSpeed + worldOrigin.x * 0.85 + worldOrigin.z * 0.65) * uWindStrength * hMask;',
          'transformed.x += sway; transformed.z += sway * 0.45;',
          'vec2 away = worldOrigin.xz - uPlayerPos.xz;',
          'float distP = length(away);',
          'if (distP < uInteractionRadius && distP > 0.001) {',
          '  float push = (1.0 - distP / uInteractionRadius) * 0.72 * hMask;',
          '  vec2 dirP = away / distP;',
          '  transformed.x += dirP.x * push; transformed.z += dirP.y * push; transformed.y -= push * 0.35;',
          '}'
        ].join('\\n'));
    };

    var inst = new THREE.InstancedMesh(geom, mat, count);
    var dummy = new THREE.Object3D();
    var baseCol = new THREE.Color(cfg.colorBase || '#15803d');
    var tipCol = new THREE.Color(cfg.colorTip || '#4ade80');
    if (instances.length === 0) {
      dummy.position.set(0, -999, 0); dummy.scale.set(0.001, 0.001, 0.001); dummy.updateMatrix();
      inst.setMatrixAt(0, dummy.matrix);
    } else {
      for (var i = 0; i < instances.length; i++) {
        var it = instances[i];
        dummy.position.set(it.x, it.y, it.z);
        dummy.rotation.set(0, it.rotY || 0, 0);
        dummy.scale.setScalar(Math.max(0.25, it.scale || 1));
        dummy.updateMatrix();
        inst.setMatrixAt(i, dummy.matrix);
        inst.setColorAt(i, baseCol.clone().lerp(tipCol, 0.4 + ((i % 5) / 4) * 0.6));
      }
    }
    inst.instanceMatrix.needsUpdate = true;
    if (inst.instanceColor) inst.instanceColor.needsUpdate = true;
    inst.computeBoundingSphere();
    return { mesh: inst, uniforms: uniforms };
  }

  // ---- Trimesh Exacto (Arches, Túneles, CSG, GLB) ----
  function extractTrimeshFromGeom(geom, mat4) {
    var posAttr = geom.getAttribute('position');
    if (!posAttr) return null;
    var index = geom.getIndex();
    var verts = [];
    var b = { minX: Infinity, minY: Infinity, minZ: Infinity, maxX: -Infinity, maxY: -Infinity, maxZ: -Infinity };
    var vA = new THREE.Vector3(), vB = new THREE.Vector3(), vC = new THREE.Vector3();
    function pushV(v) {
      verts.push(v.x, v.y, v.z);
      if (v.x < b.minX) b.minX = v.x; if (v.y < b.minY) b.minY = v.y; if (v.z < b.minZ) b.minZ = v.z;
      if (v.x > b.maxX) b.maxX = v.x; if (v.y > b.maxY) b.maxY = v.y; if (v.z > b.maxZ) b.maxZ = v.z;
    }
    if (index) {
      var arr = index.array;
      for (var i = 0; i + 2 < arr.length; i += 3) {
        vA.fromBufferAttribute(posAttr, arr[i]).applyMatrix4(mat4);
        vB.fromBufferAttribute(posAttr, arr[i + 1]).applyMatrix4(mat4);
        vC.fromBufferAttribute(posAttr, arr[i + 2]).applyMatrix4(mat4);
        pushV(vA); pushV(vB); pushV(vC);
      }
    } else {
      for (var j = 0; j + 2 < posAttr.count; j += 3) {
        vA.fromBufferAttribute(posAttr, j).applyMatrix4(mat4);
        vB.fromBufferAttribute(posAttr, j + 1).applyMatrix4(mat4);
        vC.fromBufferAttribute(posAttr, j + 2).applyMatrix4(mat4);
        pushV(vA); pushV(vB); pushV(vC);
      }
    }
    if (verts.length < 9) return null;
    return { triangles: new Float32Array(verts), minX: b.minX, minY: b.minY, minZ: b.minZ, maxX: b.maxX, maxY: b.maxY, maxZ: b.maxZ };
  }

  function buildWorldTrimeshForObject(obj) {
    var m3 = obj.source.mesh3d;
    if (!m3) return null;
    var geom = buildModularGeometry(m3);
    var t3 = obj.t3;
    var m4 = new THREE.Matrix4().compose(
      new THREE.Vector3(t3.x, t3.y, t3.z),
      new THREE.Quaternion().setFromEuler(new THREE.Euler(t3.rx * DEG2RAD, t3.ry * DEG2RAD, t3.rz * DEG2RAD, 'XYZ')),
      new THREE.Vector3(Math.max(0.05, Math.abs(t3.sx)), Math.max(0.05, Math.abs(t3.sy)), Math.max(0.05, Math.abs(t3.sz)))
    );
    var res = extractTrimeshFromGeom(geom, m4);
    geom.dispose();
    return res;
  }

  function extractTrimeshFromObject3D(root) {
    root.updateMatrixWorld(true);
    var verts = [];
    var b = { minX: Infinity, minY: Infinity, minZ: Infinity, maxX: -Infinity, maxY: -Infinity, maxZ: -Infinity };
    root.traverse(function (ch) {
      if (ch.isMesh && ch.geometry) {
        var sub = extractTrimeshFromGeom(ch.geometry, ch.matrixWorld);
        if (sub) {
          for (var i = 0; i < sub.triangles.length; i++) verts.push(sub.triangles[i]);
          if (sub.minX < b.minX) b.minX = sub.minX; if (sub.minY < b.minY) b.minY = sub.minY; if (sub.minZ < b.minZ) b.minZ = sub.minZ;
          if (sub.maxX > b.maxX) b.maxX = sub.maxX; if (sub.maxY > b.maxY) b.maxY = sub.maxY; if (sub.maxZ > b.maxZ) b.maxZ = sub.maxZ;
        }
      }
    });
    if (verts.length < 9) return null;
    return { triangles: new Float32Array(verts), minX: b.minX, minY: b.minY, minZ: b.minZ, maxX: b.maxX, maxY: b.maxY, maxZ: b.maxZ };
  }

  var _triClosest = { x: 0, y: 0, z: 0 };
  function closestPointOnTri(px, py, pz, ax, ay, az, bx, by, bz, cx, cy, cz, out) {
    var abx = bx - ax, aby = by - ay, abz = bz - az;
    var acx = cx - ax, acy = cy - ay, acz = cz - az;
    var apx = px - ax, apy = py - ay, apz = pz - az;
    var d1 = abx * apx + aby * apy + abz * apz, d2 = acx * apx + acy * apy + acz * apz;
    if (d1 <= 0 && d2 <= 0) { out.x = ax; out.y = ay; out.z = az; return; }
    var bpx = px - bx, bpy = py - by, bpz = pz - bz;
    var d3 = abx * bpx + aby * bpy + abz * bpz, d4 = acx * bpx + acy * bpy + acz * bpz;
    if (d3 >= 0 && d4 <= d3) { out.x = bx; out.y = by; out.z = bz; return; }
    var vc = d1 * d4 - d3 * d2;
    if (vc <= 0 && d1 >= 0 && d3 <= 0) { var v = d1 / (d1 - d3 || 1e-8); out.x = ax + v * abx; out.y = ay + v * aby; out.z = az + v * abz; return; }
    var cpx = px - cx, cpy = py - cy, cpz = pz - cz;
    var d5 = abx * cpx + aby * cpy + abz * cpz, d6 = acx * cpx + acy * cpy + acz * cpz;
    if (d6 >= 0 && d5 <= d6) { out.x = cx; out.y = cy; out.z = cz; return; }
    var vb = d5 * d2 - d1 * d6;
    if (vb <= 0 && d2 >= 0 && d6 <= 0) { var w = d2 / (d2 - d6 || 1e-8); out.x = ax + w * acx; out.y = ay + w * acy; out.z = az + w * acz; return; }
    var va = d3 * d6 - d5 * d4;
    if (va <= 0 && d4 - d3 >= 0 && d5 - d6 >= 0) {
      var w2 = (d4 - d3) / ((d4 - d3) + (d5 - d6) || 1e-8);
      out.x = bx + w2 * (cx - bx); out.y = by + w2 * (cy - by); out.z = bz + w2 * (cz - bz); return;
    }
    var denom = 1 / (va + vb + vc || 1e-8), v3 = vb * denom, w3 = vc * denom;
    out.x = ax + abx * v3 + acx * w3; out.y = ay + aby * v3 + acy * w3; out.z = az + abz * v3 + acz * w3;
  }

  function resolveBodyVsTrimesh(cx, cy, cz, hx, hy, hz, tm) {
    var r = Math.max(0.12, Math.min(hx, hz));
    if (cx + hx < tm.minX || cx - hx > tm.maxX || cy + hy < tm.minY || cy - hy > tm.maxY || cz + hz < tm.minZ || cz - hz > tm.maxZ) {
      return { dx: 0, dy: 0, dz: 0, wallNx: 0, wallNz: 0, collided: false, hitFloor: false, hitCeiling: false, hitWall: false };
    }
    var capOff = Math.max(0, hy - r);
    var offs = capOff > 0.05 ? [-capOff, 0, capOff] : [0];
    var tris = tm.triangles, rSq = r * r;
    var curX = cx, curY = cy, curZ = cz;
    var maxStepUp = Math.min(0.45, hy * 0.75);
    var steppedUp = false;
    var collided = false, hitFloor = false, hitCeiling = false, hitWall = false;
    var accWNx = 0, accWNz = 0;
    for (var pass = 0; pass < 3; pass++) {
      for (var sIdx = 0; sIdx < offs.length; sIdx++) {
        var sy = curY + offs[sIdx];
        var isBottomSphere = sIdx === 0;
        for (var i = 0; i < tris.length; i += 9) {
          var ax = tris[i], ay = tris[i + 1], az = tris[i + 2];
          var bx = tris[i + 3], by = tris[i + 4], bz = tris[i + 5];
          var tx = tris[i + 6], ty = tris[i + 7], tz = tris[i + 8];
          var minTx = ax < bx ? (ax < tx ? ax : tx) : bx < tx ? bx : tx;
          var maxTx = ax > bx ? (ax > tx ? ax : tx) : bx > tx ? bx : tx;
          if (curX + r < minTx || curX - r > maxTx) continue;
          var minTy = ay < by ? (ay < ty ? ay : ty) : by < ty ? by : ty;
          var maxTy = ay > by ? (ay > ty ? ay : ty) : by > ty ? by : ty;
          if (sy + r < minTy || sy - r > maxTy) continue;
          var minTz = az < bz ? (az < tz ? az : tz) : bz < tz ? bz : tz;
          var maxTz = az > bz ? (az > tz ? az : tz) : bz > tz ? bz : tz;
          if (curZ + r < minTz || curZ - r > maxTz) continue;
          closestPointOnTri(curX, sy, curZ, ax, ay, az, bx, by, bz, tx, ty, tz, _triClosest);
          var vx = curX - _triClosest.x, vy = sy - _triClosest.y, vz = curZ - _triClosest.z;
          var distSq = vx * vx + vy * vy + vz * vz;
          if (distSq < rSq) {
            var dist = Math.sqrt(distSq), nx = 0, ny = 1, nz = 0;
            if (dist > 1e-5) { nx = vx / dist; ny = vy / dist; nz = vz / dist; }
            else {
              var e1x = bx - ax, e1y = by - ay, e1z = bz - az;
              var e2x = tx - ax, e2y = ty - ay, e2z = tz - az;
              var crx = e1y * e2z - e1z * e2y, cry = e1z * e2x - e1x * e2z, crz = e1x * e2y - e1y * e2x;
              var cl = Math.hypot(crx, cry, crz);
              if (cl > 1e-6) { nx = crx / cl; ny = cry / cl; nz = crz / cl; }
            }
            var bottomY = curY - hy;
            var stepH = Math.min(maxTy, _triClosest.y) - bottomY;
            if (isBottomSphere && ny < 0.45 && ny > -0.2 && stepH > 0.01 && stepH <= maxStepUp && !steppedUp) {
              curY += stepH + 0.015;
              collided = true;
              hitFloor = true;
              steppedUp = true;
              continue;
            }
            var pen = r - dist;
            curX += nx * pen; curY += ny * pen; curZ += nz * pen;
            collided = true;
            if (ny > 0.55) hitFloor = true;
            else if (ny < -0.55) hitCeiling = true;
            else { hitWall = true; accWNx += nx * pen; accWNz += nz * pen; }
          }
        }
      }
    }
    var wLen = Math.hypot(accWNx, accWNz);
    return { dx: curX - cx, dy: curY - cy, dz: curZ - cz, wallNx: wLen > 1e-5 ? accWNx / wLen : 0, wallNz: wLen > 1e-5 ? accWNz / wLen : 0, collided: collided, hitFloor: hitFloor, hitCeiling: hitCeiling, hitWall: hitWall };
  }

  function resolveBodyVsOBB3D(cx, cy, cz, hx, hy, hz, bcx, bcy, bcz, bhx, bhy, bhz, rxD, ryD, rzD) {
    var r = Math.max(0.12, Math.min(hx, hz));
    var maxD = Math.hypot(bhx, bhy, bhz) + Math.hypot(hx, hy, hz) + 0.05;
    if ((cx - bcx) * (cx - bcx) + (cy - bcy) * (cy - bcy) + (cz - bcz) * (cz - bcz) > maxD * maxD) {
      return { dx: 0, dy: 0, dz: 0, wallNx: 0, wallNz: 0, collided: false, hitFloor: false, hitCeiling: false, hitWall: false };
    }
    var rx = (rxD || 0) * DEG2RAD, ry = (ryD || 0) * DEG2RAD, rz = (rzD || 0) * DEG2RAD;
    var cX = Math.cos(rx), sX = Math.sin(rx), cY = Math.cos(ry), sY = Math.sin(ry), cZ = Math.cos(rz), sZ = Math.sin(rz);
    var m00 = cY * cZ, m01 = -cY * sZ, m02 = sY;
    var m10 = cX * sZ + sX * sY * cZ, m11 = cX * cZ - sX * sY * sZ, m12 = -sX * cY;
    var m20 = sX * sZ - cX * sY * cZ, m21 = sX * cZ + cX * sY * sZ, m22 = cX * cY;
    var capOff = Math.max(0, hy - r), offs = capOff > 0.05 ? [-capOff, 0, capOff] : [0], rSq = r * r;
    var curX = cx, curY = cy, curZ = cz, collided = false, hitFloor = false, hitCeiling = false, hitWall = false, accWNx = 0, accWNz = 0;
    for (var pass = 0; pass < 2; pass++) {
      for (var sIdx = 0; sIdx < offs.length; sIdx++) {
        var wx = curX - bcx, wy = curY + offs[sIdx] - bcy, wz = curZ - bcz;
        var lx = m00 * wx + m10 * wy + m20 * wz, ly = m01 * wx + m11 * wy + m21 * wz, lz = m02 * wx + m12 * wy + m22 * wz;
        var clX = Math.max(-bhx, Math.min(bhx, lx)), clY = Math.max(-bhy, Math.min(bhy, ly)), clZ = Math.max(-bhz, Math.min(bhz, lz));
        var dlx = lx - clX, dly = ly - clY, dlz = lz - clZ, dSq = dlx * dlx + dly * dly + dlz * dlz;
        if (dSq >= rSq) continue;
        var lnx = 0, lny = 0, lnz = 0, pen = 0;
        if (dSq > 1e-8) {
          var d = Math.sqrt(dSq); lnx = dlx / d; lny = dly / d; lnz = dlz / d; pen = r - d;
        } else {
          var mf = bhx - lx; lnx = 1;
          if (bhx + lx < mf) { mf = bhx + lx; lnx = -1; lny = 0; lnz = 0; }
          if (bhy - ly < mf) { mf = bhy - ly; lnx = 0; lny = 1; lnz = 0; }
          if (bhy + ly < mf) { mf = bhy + ly; lnx = 0; lny = -1; lnz = 0; }
          if (bhz - lz < mf) { mf = bhz - lz; lnx = 0; lny = 0; lnz = 1; }
          if (bhz + lz < mf) { mf = bhz + lz; lnx = 0; lny = 0; lnz = -1; }
          pen = mf + r;
        }
        var wnx = m00 * lnx + m01 * lny + m02 * lnz, wny = m10 * lnx + m11 * lny + m12 * lnz, wnz = m20 * lnx + m21 * lny + m22 * lnz;
        curX += wnx * pen; curY += wny * pen; curZ += wnz * pen; collided = true;
        if (wny > 0.55) hitFloor = true; else if (wny < -0.55) hitCeiling = true; else { hitWall = true; accWNx += wnx * pen; accWNz += wnz * pen; }
      }
    }
    var wLen = Math.hypot(accWNx, accWNz);
    return { dx: curX - cx, dy: curY - cy, dz: curZ - cz, wallNx: wLen > 1e-5 ? accWNx / wLen : 0, wallNz: wLen > 1e-5 ? accWNz / wLen : 0, collided: collided, hitFloor: hitFloor, hitCeiling: hitCeiling, hitWall: hitWall };
  }

  function getColliderOffset3D(t3, off) {
    if (!off || (!off.x && !off.y && !off.z)) return { x: 0, y: 0, z: 0 };
    var rx = (t3.rx || 0) * DEG2RAD, ry = (t3.ry || 0) * DEG2RAD, rz = (t3.rz || 0) * DEG2RAD;
    if (!rx && !ry && !rz) return { x: off.x || 0, y: off.y || 0, z: off.z || 0 };
    var cX = Math.cos(rx), sX = Math.sin(rx), cY = Math.cos(ry), sY = Math.sin(ry), cZ = Math.cos(rz), sZ = Math.sin(rz);
    var ox = off.x || 0, oy = off.y || 0, oz = off.z || 0;
    return {
      x: cY * cZ * ox - cY * sZ * oy + sY * oz,
      y: (cX * sZ + sX * sY * cZ) * ox + (cX * cZ - sX * sY * sZ) * oy - sX * cY * oz,
      z: (sX * sZ - cX * sY * cZ) * ox + (sX * cZ + cX * sY * sZ) * oy + cX * cY * oz
    };
  }

  // ---- Verlet Soft-Body & Vehículo 4 Ruedas ----
  function createSoftBodySimulation(cfg, ox, oy, oz) {
    var segs = Math.max(3, Math.min(28, Math.round(cfg.segments || 8)));
    var totalLen = Math.max(1, cfg.length || 6);
    var damping = Math.max(0.85, Math.min(0.999, cfg.damping || 0.97));
    var gravity = cfg.gravity !== undefined ? cfg.gravity : -18;
    var stiffness = Math.max(0.1, Math.min(1, cfg.stiffness || 0.9));
    var nodes = [], constraints = [];
    if (cfg.kind === 'gel') {
      var half = Math.max(0.35, totalLen * 0.25);
      var coords = [[-half,-half,-half],[half,-half,-half],[-half,half,-half],[half,half,-half],[-half,-half,half],[half,-half,half],[-half,half,half],[half,half,half]];
      for (var i = 0; i < coords.length; i++) {
        var wx = ox + coords[i][0], wy = oy + coords[i][1], wz = oz + coords[i][2];
        nodes.push({ x: wx, y: wy, z: wz, oldX: wx, oldY: wy, oldZ: wz, pinned: false });
      }
      for (var i2 = 0; i2 < nodes.length; i2++) {
        for (var j2 = i2 + 1; j2 < nodes.length; j2++) {
          constraints.push({ a: i2, b: j2, restLen: Math.hypot(nodes[j2].x - nodes[i2].x, nodes[j2].y - nodes[i2].y, nodes[j2].z - nodes[i2].z), stiffness: stiffness });
        }
      }
    } else if (cfg.kind === 'sand') {
      var count = Math.max(8, Math.min(48, Math.round(cfg.particleCount || 20)));
      for (var s = 0; s < count; s++) {
        var sx = ox + ((s % 5) - 2) * 0.26, sy = oy + Math.floor(s / 5) * 0.28, sz = oz + (((s * 7) % 5) - 2) * 0.26;
        nodes.push({ x: sx, y: sy, z: sz, oldX: sx, oldY: sy, oldZ: sz, pinned: false });
      }
    } else {
      var step = totalLen / segs, isH = cfg.kind === 'bridge';
      for (var k = 0; k <= segs; k++) {
        var kx = isH ? ox - totalLen * 0.5 + k * step : ox;
        var ky = isH ? oy : oy - k * step;
        var pin = (k === 0 && cfg.anchorStart !== false) || (k === segs && Boolean(cfg.anchorEnd || cfg.kind === 'bridge'));
        nodes.push({ x: kx, y: ky, z: oz, oldX: kx, oldY: ky, oldZ: oz, pinned: pin });
      }
      for (var c = 0; c < segs; c++) constraints.push({ a: c, b: c + 1, restLen: step, stiffness: stiffness });
    }
    return { kind: cfg.kind, nodes: nodes, constraints: constraints, radius: Math.max(0.08, cfg.radius || (cfg.kind === 'sand' ? 0.14 : 0.18)), damping: damping, gravity: gravity, color: cfg.color || (cfg.kind === 'sand' ? '#eab308' : cfg.kind === 'gel' ? '#4ade80' : '#d97706') };
  }

  function stepSoftBody(sim, dt, sampleFloorY, actorPush) {
    var sdt = Math.min(0.033, Math.max(0.001, dt)), dt2 = sdt * sdt;
    for (var i = 0; i < sim.nodes.length; i++) {
      var n = sim.nodes[i];
      if (n.pinned) continue;
      var vx = (n.x - n.oldX) * sim.damping, vy = (n.y - n.oldY) * sim.damping, vz = (n.z - n.oldZ) * sim.damping;
      n.oldX = n.x; n.oldY = n.y; n.oldZ = n.z;
      n.x += vx; n.y += vy + sim.gravity * dt2; n.z += vz;
    }
    var iters = sim.kind === 'sand' ? 2 : 5;
    for (var it = 0; it < iters; it++) {
      for (var ci = 0; ci < sim.constraints.length; ci++) {
        var c = sim.constraints[ci], a = sim.nodes[c.a], b = sim.nodes[c.b];
        var dx = b.x - a.x, dy = b.y - a.y, dz = b.z - a.z;
        var dist = Math.hypot(dx, dy, dz) || 0.0001;
        var diff = ((dist - c.restLen) / dist) * c.stiffness;
        if (!a.pinned && !b.pinned) { a.x += dx * diff * 0.5; a.y += dy * diff * 0.5; a.z += dz * diff * 0.5; b.x -= dx * diff * 0.5; b.y -= dy * diff * 0.5; b.z -= dz * diff * 0.5; }
        else if (!a.pinned) { a.x += dx * diff; a.y += dy * diff; a.z += dz * diff; }
        else if (!b.pinned) { b.x -= dx * diff; b.y -= dy * diff; b.z -= dz * diff; }
      }
      if (sim.kind === 'sand') {
        var minSep = sim.radius * 2.05;
        for (var si = 0; si < sim.nodes.length; si++) {
          for (var sj = si + 1; sj < sim.nodes.length; sj++) {
            var sa = sim.nodes[si], sb = sim.nodes[sj];
            var sdx = sb.x - sa.x, sdy = sb.y - sa.y, sdz = sb.z - sa.z;
            var sdist = Math.hypot(sdx, sdy, sdz) || 0.0001;
            if (sdist < minSep) {
              var spush = (minSep - sdist) * 0.5;
              sa.x -= (sdx / sdist) * spush; sa.y -= (sdy / sdist) * spush; sa.z -= (sdz / sdist) * spush;
              sb.x += (sdx / sdist) * spush; sb.y += (sdy / sdist) * spush; sb.z += (sdz / sdist) * spush;
            }
          }
        }
      }
      for (var ni = 0; ni < sim.nodes.length; ni++) {
        var nd = sim.nodes[ni];
        if (nd.pinned) continue;
        var fy = sampleFloorY(nd.x, nd.z) + sim.radius;
        if (nd.y < fy) { nd.y = fy; nd.oldX += (nd.x - nd.oldX) * 0.2; nd.oldZ += (nd.z - nd.oldZ) * 0.2; }
        if (actorPush) {
          var pdx = nd.x - actorPush.x, pdy = nd.y - actorPush.y, pdz = nd.z - actorPush.z;
          var minR = sim.radius + actorPush.radius, pdist = Math.hypot(pdx, pdy, pdz) || 0.0001;
          if (pdist < minR) { var pp = minR - pdist; nd.x += (pdx / pdist) * pp; nd.y += (pdy / pdist) * pp; nd.z += (pdz / pdist) * pp; }
        }
      }
    }
  }

  function sampleSpline3D(points, closed, tRaw) {
    if (!points || points.length === 0) return { x: 0, y: 0, z: 0, tx: 0, ty: 0, tz: 1 };
    if (points.length === 1) return { x: points[0].x, y: points[0].y, z: points[0].z, tx: 0, ty: 0, tz: 1 };
    var t = closed ? ((tRaw % 1) + 1) % 1 : Math.max(0, Math.min(1, tRaw));
    var n = points.length, segCount = closed ? n : n - 1;
    var scaled = t * segCount;
    var idx = Math.min(segCount - 1, Math.floor(scaled));
    var u = scaled - idx;
    function ptAt(k) {
      if (closed) return points[((k % n) + n) % n];
      return points[Math.max(0, Math.min(n - 1, k))];
    }
    var p0 = ptAt(idx - 1), p1 = ptAt(idx), p2 = ptAt(idx + 1), p3 = ptAt(idx + 2);
    var u2 = u * u, u3 = u2 * u;
    function cm(a, b, c, d) {
      return 0.5 * ((2 * b) + (-a + c) * u + (2 * a - 5 * b + 4 * c - d) * u2 + (-a + 3 * b - 3 * c + d) * u3);
    }
    function cmTan(a, b, c, d) {
      return 0.5 * ((-a + c) + 2 * (2 * a - 5 * b + 4 * c - d) * u + 3 * (-a + 3 * b - 3 * c + d) * u2);
    }
    var tx = cmTan(p0.x, p1.x, p2.x, p3.x), ty = cmTan(p0.y, p1.y, p2.y, p3.y), tz = cmTan(p0.z, p1.z, p2.z, p3.z);
    var tl = Math.hypot(tx, ty, tz) || 1;
    return { x: cm(p0.x, p1.x, p2.x, p3.x), y: cm(p0.y, p1.y, p2.y, p3.y), z: cm(p0.z, p1.z, p2.z, p3.z), tx: tx / tl, ty: ty / tl, tz: tz / tl };
  }

  function sampleWaterWaveHeightAt(wx0, wy0, wz0, cfg, wx, wz, timeSec) {
    var hw = Math.max(2, (cfg.width || 24) * 0.5), hd = Math.max(2, (cfg.depth || 24) * 0.5);
    if (Math.abs(wx - wx0) > hw || Math.abs(wz - wz0) > hd) return null;
    var spd = cfg.waveSpeed !== undefined ? cfg.waveSpeed : 1.8;
    var amp = cfg.waveAmplitude !== undefined ? cfg.waveAmplitude : 0.14;
    var fx = cfg.flowX !== undefined ? cfg.flowX : 0.6, fz = cfg.flowZ !== undefined ? cfg.flowZ : 0.2;
    var t = timeSec * spd;
    var w1 = Math.sin(wx * 0.75 + t + fx * t * 0.8) * Math.cos(wz * 0.65 + fz * t * 0.8);
    var w2 = Math.sin((wx + wz) * 1.4 - t * 1.3) * 0.4;
    return wy0 + (w1 + w2) * amp;
  }

  function getBoatPontoonLocalOffsets(cfg) {
    var preset = cfg.boatSize || 'speedboat';
    var hw = Math.max(0.7, (cfg.trackWidth || (preset === 'ship' ? 4.8 : preset === 'medium' ? 2.4 : 2.1)) * 0.45);
    var hl = Math.max(1.2, (cfg.wheelBase || (preset === 'ship' ? 12 : preset === 'medium' ? 5.2 : 4.4)) * 0.45);
    if (preset === 'ship') {
      return [[-hw,-hl],[0,-hl],[hw,-hl],[-hw,-hl*0.35],[0,-hl*0.35],[hw,-hl*0.35],[-hw,hl*0.35],[0,hl*0.35],[hw,hl*0.35],[-hw,hl],[0,hl],[hw,hl]];
    }
    if (preset === 'medium') {
      return [[-hw,hl],[hw,hl],[-hw,0],[hw,0],[-hw,-hl],[hw,-hl]];
    }
    return [[-hw,hl],[hw,hl],[-hw,-hl],[hw,-hl]];
  }

  function shouldStepVehiclePhysics(vx, vy, vz, camX, camY, camZ, cfg) {
    var lod = cfg && cfg.physicsLodDistance !== undefined ? cfg.physicsLodDistance : 120;
    if (!lod || lod <= 0) return true;
    return Math.hypot(vx - camX, vy - camY, vz - camZ) <= lod;
  }

  function createVehicle4WState(x, y, z, yawDeg, cfg) {
    var isMoto = cfg.vehicleKind === 'moto';
    var hw = isMoto ? 0 : (cfg.trackWidth || 1.7) * 0.5, hl = (cfg.wheelBase || 2.6) * 0.5;
    function mk(ox, oz) { return { offsetX: ox, offsetZ: oz, compression: 0, grounded: false, steerAngleRad: 0, spinRad: 0, worldX: x + ox, worldY: y, worldZ: z + oz }; }
    var pts = getBoatPontoonLocalOffsets(cfg).map(function (p) { return { offsetX: p[0], offsetZ: p[1], submerged: 0, waterY: y }; });
    return { x: x, y: y, z: z, prevX: x, prevY: y, prevZ: z, yawRad: (yawDeg || 0) * DEG2RAD, pitchRad: 0, rollRad: 0, vx: 0, vy: 0, vz: 0, speedForward: 0, steerAngleRad: 0, propellerSpinRad: 0, wheels: [mk(-hw, hl), mk(hw, hl), mk(-hw, -hl), mk(hw, -hl)], pontoons: pts };
  }

  function stepVehicle4W(st, cfg, thr, str, dt, sampleGroundY) {
    var sdt = Math.min(0.033, Math.max(0.001, dt));
    st.prevX = st.x; st.prevY = st.y; st.prevZ = st.z;
    var isMoto = cfg.vehicleKind === 'moto';
    var maxSpd = Math.max(4, cfg.maxSpeed || (isMoto ? 19 : 16));
    var speedAbs = Math.abs(st.speedForward), speedNorm = Math.min(1, speedAbs / maxSpd);
    var maxSteer = (cfg.maxSteerDeg || (isMoto ? 32 : 28)) * DEG2RAD;
    var speedSteerScale = 1 / (1 + speedAbs * 0.11);
    var targetSteer = Math.max(-1, Math.min(1, str)) * maxSteer * speedSteerScale;
    var steerSpeed = Math.abs(str) < 0.02 ? 8.8 : 5.4;
    st.steerAngleRad += (targetSteer - st.steerAngleRad) * Math.min(1, sdt * steerSpeed);
    var cosY = Math.cos(st.yawRad), sinY = Math.sin(st.yawRad);
    var cosP = Math.cos(st.pitchRad), sinP = Math.sin(st.pitchRad), sinR = Math.sin(st.rollRad);
    var wheelR = Math.max(0.18, cfg.wheelRadius || 0.42), restLen = Math.max(0.15, cfg.suspensionRestLen || 0.65);
    var groundedCount = 0, totalSpring = 0;
    for (var i = 0; i < 4; i++) {
      var w = st.wheels[i];
      var wx = st.x + w.offsetX * cosY + w.offsetZ * sinY;
      var wz = st.z - w.offsetX * sinY + w.offsetZ * cosY;
      var gY = sampleGroundY(wx, wz);
      var cornerAttachY = st.y + w.offsetX * sinR * cosP - w.offsetZ * sinP;
      var hubY = cornerAttachY - restLen * 0.35, gDist = hubY - (gY + wheelR);
      if (gDist <= restLen) {
        var comp = Math.max(0, Math.min(1, 1 - gDist / restLen));
        totalSpring += Math.max(0, comp * (cfg.suspensionStiffness || 36) - st.vy * (cfg.suspensionDamping || 4.8));
        w.compression = comp; w.grounded = true; w.worldY = gY + wheelR; groundedCount++;
      } else {
        w.compression = 0; w.grounded = false; w.worldY = Math.max(gY + wheelR, hubY - restLen * 0.5);
      }
      w.worldX = wx; w.worldZ = wz; w.steerAngleRad = i < 2 ? st.steerAngleRad : 0; w.spinRad += (st.speedForward / wheelR) * sdt;
    }
    var traction = groundedCount / 4;
    var clampedThr = Math.max(-1, Math.min(1, thr));
    var baseTorque = cfg.maxTorque || (isMoto ? 15 : 13);
    var isBraking = (st.speedForward > 0.6 && clampedThr < -0.05) || (st.speedForward < -0.6 && clampedThr > 0.05);
    if (isBraking && traction > 0) {
      var brakeDecel = Math.max(18, baseTorque * 1.75) * Math.abs(clampedThr) * traction;
      var nextSpd = st.speedForward + (clampedThr > 0 ? 1 : -1) * brakeDecel * sdt;
      st.speedForward = (nextSpd > 0) !== (st.speedForward > 0) ? 0 : nextSpd;
    } else if (clampedThr > 0.02) {
      var torqueCurve = 1.15 - 0.72 * Math.pow(speedNorm, 1.3);
      st.speedForward += baseTorque * clampedThr * torqueCurve * traction * sdt;
    } else if (clampedThr < -0.02) {
      st.speedForward += baseTorque * 0.65 * clampedThr * traction * sdt;
    } else if (traction > 0 && speedAbs > 0.01) {
      var aeroDrag = 0.035 * st.speedForward * speedAbs;
      var rollDrag = 1.65 * (st.speedForward > 0 ? 1 : -1);
      var coastSpd = st.speedForward - (rollDrag + aeroDrag) * sdt;
      st.speedForward = Math.abs(coastSpd) < 0.08 ? 0 : coastSpd;
    }
    st.speedForward = Math.max(-maxSpd * 0.42, Math.min(maxSpd, st.speedForward));
    if (traction > 0 && speedAbs > 0.12) {
      var lowSpdRamp = Math.min(1, speedAbs / 1.2);
      var rawTurnRate = (st.speedForward / Math.max(1.4, cfg.wheelBase || 2.5)) * Math.tan(st.steerAngleRad) * lowSpdRamp;
      var clampedTurnRate = Math.max(-1.05, Math.min(1.05, rawTurnRate));
      st.yawRad -= clampedTurnRate * sdt;
    }
    var fwdX = Math.sin(st.yawRad), fwdZ = Math.cos(st.yawRad), rightX = Math.cos(st.yawRad), rightZ = -Math.sin(st.yawRad);
    var grip = Math.max(0.08, Math.min(1, cfg.gripFactor !== undefined ? cfg.gripFactor : 0.85));
    var curLat = st.vx * rightX + st.vz * rightZ;
    var dampLat = curLat * Math.max(0, 1 - grip * 9.5 * sdt);
    st.vx = fwdX * st.speedForward + rightX * dampLat;
    st.vz = fwdZ * st.speedForward + rightZ * dampLat;
    st.x += st.vx * sdt; st.z += st.vz * sdt;
    st.vy += (totalSpring * 0.25 - 18) * sdt; st.y += st.vy * sdt;
    var avgG = (st.wheels[0].worldY + st.wheels[1].worldY + st.wheels[2].worldY + st.wheels[3].worldY) * 0.25;
    var centerGY = sampleGroundY(st.x, st.z);
    var minVehY = Math.max(avgG + restLen * 0.42, centerGY + wheelR * 0.65);
    if (st.y < minVehY) { st.y = minVehY; if (st.vy < 0) st.vy = 0; }
    var fAvg = (st.wheels[0].worldY + st.wheels[1].worldY) * 0.5, rAvg = (st.wheels[2].worldY + st.wheels[3].worldY) * 0.5;
    var lAvg = (st.wheels[0].worldY + st.wheels[2].worldY) * 0.5, riAvg = (st.wheels[1].worldY + st.wheels[3].worldY) * 0.5;
    var leanFactor = isMoto ? 0.42 : -0.075;
    var accelPitch = isBraking ? 0.055 : -clampedThr * 0.032;
    st.pitchRad += (Math.atan2(rAvg - fAvg, Math.max(1, cfg.wheelBase || 2.5)) + accelPitch - st.pitchRad) * Math.min(1, sdt * 12);
    st.rollRad += (Math.atan2(riAvg - lAvg, Math.max(0.6, cfg.trackWidth || 1.7)) + str * (st.speedForward / maxSpd) * leanFactor - st.rollRad) * Math.min(1, sdt * 12);
  }

  function stepBoatVehicle(st, cfg, thr, str, dt, sampleWaterY) {
    var sdt = Math.min(0.033, Math.max(0.001, dt));
    st.prevX = st.x; st.prevY = st.y; st.prevZ = st.z;
    var bSize = cfg.boatSize || 'speedboat';
    var inDamp = bSize === 'ship' ? 0.35 : bSize === 'medium' ? 0.65 : 1.0;
    var cosY = Math.cos(st.yawRad), sinY = Math.sin(st.yawRad);
    var totalBuoy = 0, subCount = 0, pitchSum = 0, rollSum = 0;
    var pts = st.pontoons || [];
    for (var i = 0; i < pts.length; i++) {
      var pt = pts[i];
      var wx = st.x + pt.offsetX * cosY + pt.offsetZ * sinY;
      var wz = st.z - pt.offsetX * sinY + pt.offsetZ * cosY;
      var wY = sampleWaterY(wx, wz);
      var sub = Math.max(0, Math.min(2.0, wY - (st.y - 0.35)));
      pt.submerged = sub; pt.waterY = wY;
      if (sub > 0) { subCount++; totalBuoy += sub * 24; }
      pitchSum += wY * (pt.offsetZ >= 0 ? 1 : -1);
      rollSum += wY * (pt.offsetX > 0 ? 1 : pt.offsetX < 0 ? -1 : 0);
    }
    var inWater = subCount > 0 ? subCount / Math.max(1, pts.length) : 0;
    var drag = Math.max(0.2, Math.min(6, cfg.buoyancyDrag !== undefined ? cfg.buoyancyDrag : 1.45));
    if (Math.abs(thr) > 0.02) st.speedForward += (cfg.maxTorque || 20) * inDamp * Math.max(-0.5, Math.min(1, thr)) * (0.35 + 0.65 * inWater) * sdt;
    else st.speedForward *= Math.max(0, 1 - drag * sdt);
    var maxSpd = Math.max(4, cfg.maxSpeed || (bSize === 'ship' ? 14 : 24));
    st.speedForward = Math.max(-maxSpd * 0.4, Math.min(maxSpd, st.speedForward));
    st.yawRad -= str * (bSize === 'ship' ? 0.55 : bSize === 'medium' ? 0.9 : 1.35) * (0.45 + 0.55 * (Math.abs(st.speedForward) / maxSpd)) * sdt;
    st.vx = Math.sin(st.yawRad) * st.speedForward; st.vz = Math.cos(st.yawRad) * st.speedForward;
    st.x += st.vx * sdt; st.z += st.vz * sdt;
    st.vy += (totalBuoy / Math.max(1, pts.length) - 12 - st.vy * (cfg.suspensionDamping || 4.2)) * sdt;
    st.y += st.vy * sdt;
    st.propellerSpinRad += (6 + Math.abs(st.speedForward) * 2.2) * sdt;
    st.pitchRad += (Math.max(-0.35, Math.min(0.35, -pitchSum * 0.06 * inDamp - thr * 0.06 * inDamp)) - st.pitchRad) * Math.min(1, sdt * (6 * inDamp + 1.5));
    st.rollRad += (Math.max(-0.4, Math.min(0.4, rollSum * 0.06 * inDamp + str * 0.14 * inDamp)) - st.rollRad) * Math.min(1, sdt * (6 * inDamp + 1.5));
  }

  function stepPlaneVehicle(st, cfg, thr, pitchIn, rollIn, yawIn, dt, sampleGroundY) {
    var sdt = Math.min(0.033, Math.max(0.001, dt));
    st.prevX = st.x; st.prevY = st.y; st.prevZ = st.z;
    var isFighter = (cfg.planeStyle || 'fighter') === 'fighter';
    var pitchRate = isFighter ? 1.85 : 0.72, rollRate = isFighter ? 2.8 : 0.95, yawRate = isFighter ? 1.25 : 0.55;
    st.pitchRad = Math.max(-1.2, Math.min(1.2, st.pitchRad + pitchIn * pitchRate * sdt));
    if (!isFighter && Math.abs(pitchIn) < 0.05) st.pitchRad *= Math.max(0, 1 - 1.6 * sdt);
    st.rollRad += rollIn * rollRate * sdt;
    if (!isFighter) {
      var maxAirR = (32 * Math.PI) / 180;
      st.rollRad = Math.max(-maxAirR, Math.min(maxAirR, st.rollRad));
      if (Math.abs(rollIn) < 0.05) st.rollRad *= Math.max(0, 1 - 2.4 * sdt);
    }
    st.yawRad -= (yawIn * yawRate + Math.sin(st.rollRad) * (isFighter ? 1.35 : 0.65)) * sdt;
    var maxSpd = Math.max(12, cfg.maxSpeed || (isFighter ? 56 : 38));
    var thrustAcc = (cfg.maxTorque || (isFighter ? 28 : 16)) * Math.max(-0.25, Math.min(1, thr));
    if (Math.abs(thr) > 0.02) st.speedForward += thrustAcc * sdt; else st.speedForward *= Math.max(0, 1 - 0.18 * sdt);
    st.speedForward = Math.max(0, Math.min(maxSpd, st.speedForward));
    st.propellerSpinRad += (10 + st.speedForward * 1.8) * sdt;
    var cosP = Math.cos(st.pitchRad), sinP = Math.sin(st.pitchRad);
    st.vx = Math.sin(st.yawRad) * cosP * st.speedForward;
    st.vz = Math.cos(st.yawRad) * cosP * st.speedForward;
    var liftRatio = Math.min(1.35, (st.speedForward / Math.max(8, maxSpd * 0.38)) * (cfg.liftFactor || 1.0));
    var verticalLift = (liftRatio - 1.0) * 9.5 + sinP * st.speedForward;
    st.vy += (verticalLift - st.vy * 1.4) * Math.min(1, sdt * 4);
    st.x += st.vx * sdt; st.y += st.vy * sdt; st.z += st.vz * sdt;
    var gearClr = cfg.hasLandingGear !== false ? 1.0 : 0.55;
    var gY = sampleGroundY(st.x, st.z) + gearClr;
    if (st.y < gY) { st.y = gY; if (st.vy < 0) st.vy = 0; if (st.pitchRad < 0) st.pitchRad *= 0.7; st.rollRad *= 0.8; st.speedForward *= Math.max(0, 1 - 0.35 * sdt); }
  }

  function stepSpaceshipVehicle(st, cfg, thr, strafeIn, ascendIn, yawIn, pitchIn, rollIn, dt) {
    var sdt = Math.min(0.033, Math.max(0.001, dt));
    st.prevX = st.x; st.prevY = st.y; st.prevZ = st.z;
    st.yawRad -= yawIn * 1.15 * sdt;
    st.pitchRad = Math.max(-1.45, Math.min(1.45, st.pitchRad + pitchIn * 1.0 * sdt));
    st.rollRad += rollIn * 1.4 * sdt;
    var acc = Math.max(8, cfg.maxTorque || 22);
    var fx = Math.sin(st.yawRad), fz = Math.cos(st.yawRad), rx = Math.cos(st.yawRad), rz = -Math.sin(st.yawRad);
    st.vx += (fx * thr + rx * strafeIn) * acc * sdt;
    st.vz += (fz * thr + rz * strafeIn) * acc * sdt;
    st.vy += ascendIn * acc * sdt;
    var damp = Math.max(0, 1 - 1.35 * sdt);
    if (Math.abs(thr) < 0.02 && Math.abs(strafeIn) < 0.02) { st.vx *= damp; st.vz *= damp; }
    if (Math.abs(ascendIn) < 0.02) st.vy *= damp;
    var maxSpd = Math.max(6, cfg.maxSpeed || 36);
    var spMag = Math.hypot(st.vx, st.vy, st.vz);
    if (spMag > maxSpd) { var s = maxSpd / spMag; st.vx *= s; st.vy *= s; st.vz *= s; }
    st.speedForward = st.vx * fx + st.vz * fz;
    st.x += st.vx * sdt; st.y += st.vy * sdt; st.z += st.vz * sdt;
    st.propellerSpinRad += (6 + spMag * 0.8) * sdt;
  }

  function applyLocalGravityZone(vState, box, actorT3, actorHalfY) {
    if (!box || !box.enabled) return { inside: false, nextX: actorT3.x, nextY: actorT3.y, nextZ: actorT3.z };
    var dxV = vState.x - vState.prevX, dyV = vState.y - vState.prevY, dzV = vState.z - vState.prevZ;
    var yaw = vState.yawRad, cosY = Math.cos(-yaw), sinY = Math.sin(-yaw);
    var rx = actorT3.x - vState.prevX, ry = actorT3.y - vState.prevY, rz = actorT3.z - vState.prevZ;
    var lx = rx * cosY + rz * sinY, lz = -rx * sinY + rz * cosY;
    var hx = Math.max(1, (box.sx || 12) * 0.5), hy = Math.max(1, (box.sy || 6) * 0.5), hz = Math.max(1, (box.sz || 18) * 0.5);
    if (Math.abs(lx) > hx || Math.abs(ry) > hy || Math.abs(lz) > hz) return { inside: false, nextX: actorT3.x, nextY: actorT3.y, nextZ: actorT3.z };
    var nextX = actorT3.x + dxV, nextZ = actorT3.z + dzV;
    var floorY = vState.y - hy + 0.15 + actorHalfY;
    var nextY = Math.max(floorY, actorT3.y + dyV);
    return { inside: true, nextX: nextX, nextY: nextY, nextZ: nextZ };
  }

  function normalizeModelRoot3D(loadedRoot, targetSize) {
    var wrapper = new THREE.Group();
    loadedRoot.updateMatrixWorld(true);
    loadedRoot.traverse(function (obj) {
      if (obj.isSkinnedMesh && obj.skeleton) {
        try { obj.skeleton.calculateInverses(); obj.skeleton.update(); } catch (_) {}
      }
    });
    var box = new THREE.Box3().setFromObject(loadedRoot);
    if (box.isEmpty()) {
      loadedRoot.traverse(function (obj) {
        if (obj.isBone) {
          var wp = new THREE.Vector3();
          obj.getWorldPosition(wp);
          box.expandByPoint(wp);
        }
      });
    }
    if (!box.isEmpty()) {
      var size = new THREE.Vector3(), center = new THREE.Vector3();
      box.getSize(size); box.getCenter(center);
      var maxDim = Math.max(0.001, size.x, size.y, size.z);
      var tSz = targetSize || 1.0;
      var scale = tSz / maxDim;
      loadedRoot.scale.multiplyScalar(scale);
      var bottomOffsetY = -tSz * 0.5 - box.min.y * scale;
      loadedRoot.position.set(
        loadedRoot.position.x - center.x * scale,
        loadedRoot.position.y + bottomOffsetY,
        loadedRoot.position.z - center.z * scale
      );
    }
    wrapper.add(loadedRoot);
    return wrapper;
  }

  function normalizeBoneKey3D(name) {
    return String(name || '')
      .replace(/^mixamorig\\d*[:_]?/i, '')
      .replace(/^armature[|/:._-]?/i, '')
      .replace(/^character[\\d_:.-]*/i, '')
      .replace(/^bip\\d*[_\\s-]*/i, '')
      .replace(/^[^|/:]+[|/:]/, '')
      .replace(/[^a-z0-9]/gi, '')
      .toLowerCase()
      .trim();
  }

  function isHipOrRootBoneKey3D(nk) {
    return nk === 'hips' || nk === 'pelvis' || nk === 'root' || nk === 'rootnode';
  }

  function retargetClipForRoot3D(clip, targetRoot) {
    if (!clip || !targetRoot) return clip;
    var exactNames = new Set();
    var normalizedMap = new Map();
    var boneRestPosMap = new Map();
    targetRoot.traverse(function (node) {
      if (node.name) {
        exactNames.add(node.name);
        boneRestPosMap.set(node.name, node.position.clone());
        var nk = normalizeBoneKey3D(node.name);
        if (nk && !normalizedMap.has(nk)) normalizedMap.set(nk, node.name);
      }
    });
    if (exactNames.size === 0) return clip;
    var remappedAny = false;
    var nextTracks = [];
    var rawTracks = clip.tracks || [];
    for (var ti = 0; ti < rawTracks.length; ti++) {
      var track = rawTracks[ti];
      var dotIdx = track.name.indexOf('.');
      if (dotIdx <= 0) { nextTracks.push(track); continue; }
      var targetNode = track.name.slice(0, dotIdx);
      var propPath = track.name.slice(dotIdx);
      var nk = normalizeBoneKey3D(targetNode);
      var isRootOrBone = exactNames.has(targetNode) || normalizedMap.has(nk) || isHipOrRootBoneKey3D(nk);
      if (propPath === '.scale' && isRootOrBone) {
        remappedAny = true;
        continue;
      }
      var finalNodeName = exactNames.has(targetNode) ? targetNode : (normalizedMap.get(nk) || targetNode);
      var needsRename = finalNodeName !== targetNode;
      if (propPath === '.position' && isHipOrRootBoneKey3D(nk)) {
        var clonedPos = track.clone();
        if (needsRename) clonedPos.name = finalNodeName + propPath;
        var restP = boneRestPosMap.get(finalNodeName);
        var restX = restP ? restP.x : 0;
        var restY = restP ? restP.y : 0.9;
        var restZ = restP ? restP.z : 0;
        var vals = clonedPos.values;
        var srcBaseY = vals.length >= 2 && Math.abs(vals[1]) > 0.001 ? Math.abs(vals[1]) : 1;
        var scaleYRatio = restY > 0.001 ? restY / srcBaseY : 1;
        for (var vi = 0; vi + 2 < vals.length; vi += 3) {
          vals[vi] = restX;
          vals[vi + 1] = vals[vi + 1] * scaleYRatio;
          vals[vi + 2] = restZ;
        }
        remappedAny = true;
        nextTracks.push(clonedPos);
        continue;
      }
      if (needsRename) {
        var cloned = track.clone();
        cloned.name = finalNodeName + propPath;
        remappedAny = true;
        nextTracks.push(cloned);
      } else {
        nextTracks.push(track);
      }
    }
    if (!remappedAny) return clip;
    return new THREE.AnimationClip(clip.name, clip.duration, nextTracks, clip.blendMode);
  }

  // ---- Animación FSM Unificada 3D (sin eval) ----
  function evalAnimAtomic(raw, ctx) {
    var cond = String(raw || '').trim();
    if (!cond || cond === 'manual') return false;
    var low = cond.toLowerCase();
    if (low === 'falling' || low === 'isfalling') return !ctx.isGrounded && Number(ctx.vy || 0) <= 0;
    if (low === '!falling' || low === '!isfalling') return ctx.isGrounded || Number(ctx.vy || 0) > 0;
    if (cond === 'animFinished' || cond === 'animFinished == true') {
      return Boolean(ctx.animFinished || (ctx.animProgress !== undefined && ctx.animProgress >= 0.99));
    }
    if (cond === '!animFinished' || cond === 'animFinished == false') {
      return !(ctx.animFinished || (ctx.animProgress !== undefined && ctx.animProgress >= 0.99));
    }
    if (cond === '!isGrounded') return !ctx.isGrounded;
    if (cond === 'isGrounded') return Boolean(ctx.isGrounded);
    if (cond.indexOf('!keyPressed:') === 0) { var kp1 = cond.slice(12).trim(); return kp1 ? !(ctx.justPressedKeys && ctx.justPressedKeys.has(kp1)) : false; }
    if (cond.indexOf('keyPressed:') === 0) { var kp2 = cond.slice(11).trim(); return kp2 ? Boolean(ctx.justPressedKeys && ctx.justPressedKeys.has(kp2)) : false; }
    if (cond.indexOf('!keyHeld:') === 0) { var k1 = cond.slice(9).trim(); return k1 ? !ctx.heldKeys.has(k1) : false; }
    if (cond.indexOf('keyHeld:') === 0) { var k2 = cond.slice(8).trim(); return k2 ? ctx.heldKeys.has(k2) : false; }
    var ms = cond.match(/^speed\\s*(>=|<=|>|<|==|!=)\\s*(-?\\d+(?:\\.\\d+)?)$/);
    if (ms) {
      var v1 = Number(ms[2]);
      if (ms[1] === '>=') return ctx.speed >= v1; if (ms[1] === '<=') return ctx.speed <= v1;
      if (ms[1] === '>') return ctx.speed > v1; if (ms[1] === '<') return ctx.speed < v1;
      if (ms[1] === '!=') return ctx.speed !== v1; return ctx.speed === v1;
    }
    var mvy = cond.match(/^vy\\s*(>=|<=|>|<|==|!=)\\s*(-?\\d+(?:\\.\\d+)?)$/);
    if (mvy) {
      var v2 = Number(mvy[2]);
      if (mvy[1] === '>=') return ctx.vy >= v2; if (mvy[1] === '<=') return ctx.vy <= v2;
      if (mvy[1] === '>') return ctx.vy > v2; if (mvy[1] === '<') return ctx.vy < v2;
      if (mvy[1] === '!=') return ctx.vy !== v2; return ctx.vy === v2;
    }
    var mg = cond.match(/^isGrounded\\s*(==|!=)\\s*(true|false)$/);
    if (mg) return mg[1] === '!=' ? String(ctx.isGrounded) !== mg[2] : String(ctx.isGrounded) === mg[2];
    if (cond.indexOf('var:') === 0) {
      var mv = cond.slice(4).match(/^([a-zA-Z0-9_]+)\\s*(>=|<=|>|<|==|!=)\\s*(.+)$/);
      if (mv) {
        var lv = ctx.variables && ctx.variables.has(mv[1]) ? ctx.variables.get(mv[1]) : 0;
        var rv = mv[3].trim(), ln = Number(lv), rn = Number(rv);
        if (!isNaN(ln) && !isNaN(rn)) {
          if (mv[2] === '>=') return ln >= rn; if (mv[2] === '<=') return ln <= rn;
          if (mv[2] === '>') return ln > rn; if (mv[2] === '<') return ln < rn;
          if (mv[2] === '!=') return ln !== rn; return ln === rn;
        }
        return mv[2] === '!=' ? String(lv) !== rv : String(lv) === rv;
      }
    }
    return false;
  }

  function evalAnimExpr3d(expr, ctx) {
    var trimmed = String(expr || '').trim();
    if (!trimmed || trimmed === 'manual') return false;
    return trimmed.split('||').some(function (grp) {
      var parts = grp.split('&&');
      return parts.length > 0 && parts.every(function (p) { return evalAnimAtomic(p, ctx); });
    });
  }

  function isTerminalNode3d(node) {
    var lbl = ((node.name || '') + ' ' + (node.clipName || '')).toLowerCase();
    var c = String(node.conditionExpr || '').toLowerCase();
    return c.indexOf('var:') >= 0 || c.indexOf('death') >= 0 || lbl.indexOf('death') >= 0 || lbl.indexOf('morir') >= 0 || lbl.indexOf('dead') >= 0;
  }

  function isLocomotionNode3d(node, initialId) {
    if (node.id === initialId) return true;
    var lbl = ((node.name || '') + ' ' + (node.clipName || '')).toLowerCase();
    return /(idle|reposo|quiet|stand|walk|camin|andar|run|corr|sprint|move|mover)/.test(lbl);
  }

  function nodeTriggerMatches3d(node, ctx) {
    var key = String(node.triggerKey || '').trim();
    var cond = String(node.conditionExpr || '').trim();
    var hasCond = cond.length > 0 && cond !== 'manual';
    if (!key && !hasCond) return false;
    if (key) {
      var mode = node.triggerKeyMode || 'pressed';
      var okKey = mode === 'held' ? Boolean(ctx.heldKeys && ctx.heldKeys.has(key)) : Boolean(ctx.justPressedKeys && ctx.justPressedKeys.has(key));
      if (!okKey) return false;
    }
    if (hasCond && !evalAnimExpr3d(cond, ctx)) return false;
    return true;
  }

  function resolveSmartLocomotion3d(fsm, curNode, ctx) {
    var others = (fsm.states || []).filter(function (s) { return s.id !== curNode.id; });
    if (others.length === 0) return null;
    function byPat(re) {
      return others.find(function (s) { return re.test(((s.name || '') + ' ' + (s.clipName || '')).toLowerCase()); });
    }
    var idleN = byPat(/\\b(idle|reposo|quieto|quieta|stand|espera)\\b/) || others.find(function (s) { return s.id === fsm.initialStateId; }) || others[0];
    var walkN = byPat(/\\b(walk|caminar|camina|andar|anda|trotar|move|mover)\\b/);
    var runN = byPat(/\\b(run|correr|corre|sprint|dash_move)\\b/);
    var runMatched = false;
    if (runN) {
      if (runN.triggerKey) {
        var rm = runN.triggerKeyMode || 'held';
        runMatched = rm === 'held' ? Boolean(ctx.heldKeys && ctx.heldKeys.has(runN.triggerKey)) : Boolean(ctx.justPressedKeys && ctx.justPressedKeys.has(runN.triggerKey));
      }
      if (!runMatched && runN.conditionExpr && runN.conditionExpr !== 'manual') runMatched = evalAnimExpr3d(runN.conditionExpr, ctx);
      if (!runMatched) {
        runMatched = (fsm.transitions || []).some(function (t) {
          return t.toStateId === runN.id && t.conditionExpr && t.conditionExpr !== 'manual' && evalAnimExpr3d(t.conditionExpr, ctx);
        });
      }
    }
    var sprintHeld = Boolean(ctx.heldKeys && (ctx.heldKeys.has('ShiftLeft') || ctx.heldKeys.has('ShiftRight')));
    if (!(ctx.speed > 0.1)) return idleN || null;
    if (runN && (runMatched || sprintHeld || ctx.speed > 5.5 || !walkN)) return runN;
    if (walkN) return walkN;
    return runN || idleN || null;
  }

  function shouldAutoReturn3d(node, ctx) {
    var mode = node.returnMode || 'none';
    if (mode === 'none') return false;
    var trigKey = String(node.triggerKey || '').trim();
    if (trigKey && (node.triggerKeyMode || 'pressed') !== 'held' && ctx.justPressedKeys && ctx.justPressedKeys.has(trigKey)) return false;
    var on = node.returnOn || 'auto';
    if (on === 'auto') {
      if (trigKey && node.triggerKeyMode === 'held') on = 'keyReleased';
      else if (/jump|salt|fall|caer|aire|air/.test(((node.name || '') + ' ' + (node.clipName || '')).toLowerCase())) on = 'grounded';
      else if (node.loopMode === 'LoopOnce' || trigKey) on = 'animFinished';
      else return false;
    }
    if (on === 'grounded') return Boolean(ctx.isGrounded && Number(ctx.vy || 0) <= 0.15);
    if (on === 'animFinished') return Boolean(ctx.animFinished || (ctx.animProgress !== undefined && ctx.animProgress >= 0.99));
    if (on === 'keyReleased') return trigKey ? !(ctx.heldKeys && ctx.heldKeys.has(trigKey)) : false;
    return false;
  }

  function stepAnimFsm3d(fsm, curState, ctx) {
    if (!fsm || !fsm.states || fsm.states.length === 0) return null;
    var cur = fsm.states.find(function (s) { return s.name === curState || s.id === curState; });
    if (!cur) {
      cur = fsm.states.find(function (s) { return s.id === fsm.initialStateId; }) || fsm.states[0];
      return { changed: true, stateName: cur.name, clipName: cur.clipName, assetId: cur.assetId || null, timeScale: cur.timeScale || 1, loopMode: cur.loopMode || 'LoopRepeat', blendDuration: 0.15, node: cur };
    }
    function mkRes(nxt, blend) {
      return { changed: true, stateName: nxt.name, clipName: nxt.clipName, assetId: nxt.assetId || null, timeScale: nxt.timeScale || 1, loopMode: nxt.loopMode || 'LoopRepeat', blendDuration: Math.max(0.05, blend || 0.18), node: nxt };
    }
    var trs = fsm.transitions || [];
    var curTerm = isTerminalNode3d(cur);
    function checkList(list) {
      for (var i = 0; i < list.length; i++) {
        var tr = list[i];
        if (!evalAnimExpr3d(tr.conditionExpr, ctx)) continue;
        var nxt = fsm.states.find(function (s) { return s.id === tr.toStateId; });
        if (nxt && nxt.id !== cur.id) return mkRes(nxt, tr.blendDuration || 0.22);
      }
      return null;
    }
    var wTerm = trs.filter(function (t) { return t.fromStateId === '*' && (String(t.conditionExpr || '').indexOf('var:') >= 0 || String(t.conditionExpr || '').indexOf('<= 0') >= 0); });
    var r1 = checkList(wTerm);
    if (r1) return r1;
    for (var ti = 0; ti < fsm.states.length; ti++) {
      var stT = fsm.states[ti];
      if (stT.id !== cur.id && stT.fromAnyState && isTerminalNode3d(stT) && nodeTriggerMatches3d(stT, ctx)) return mkRes(stT, 0.15);
    }
    if (!curTerm) {
      for (var ai = 0; ai < fsm.states.length; ai++) {
        var stA = fsm.states[ai];
        if (stA.id !== cur.id && stA.fromAnyState && !isTerminalNode3d(stA) && nodeTriggerMatches3d(stA, ctx)) return mkRes(stA, 0.12);
      }
    }
    var direct = trs.filter(function (t) { return t.fromStateId === cur.id; });
    var r2 = checkList(direct);
    if (r2) return r2;
    if (!curTerm && isLocomotionNode3d(cur, fsm.initialStateId)) {
      for (var li = 0; li < fsm.states.length; li++) {
        var stL = fsm.states[li];
        if (stL.id !== cur.id && !stL.fromAnyState && nodeTriggerMatches3d(stL, ctx)) return mkRes(stL, 0.12);
      }
    }
    var wGen = trs.filter(function (t) { return t.fromStateId === '*' && wTerm.indexOf(t) < 0; });
    var r3 = checkList(wGen);
    if (r3) return r3;
    if (shouldAutoReturn3d(cur, ctx)) {
      var ret = null;
      if (cur.returnMode === 'state' && cur.returnStateId) ret = fsm.states.find(function (s) { return s.id === cur.returnStateId; }) || null;
      else if (cur.returnMode === 'idle') ret = fsm.states.find(function (s) { return /\\b(idle|reposo|quieto|quieta|stand)\\b/i.test((s.name || '') + ' ' + (s.clipName || '')); }) || fsm.states.find(function (s) { return s.id === fsm.initialStateId; }) || fsm.states[0];
      else if (cur.returnMode === 'smart_locomotion') ret = resolveSmartLocomotion3d(fsm, cur, ctx);
      if (ret && ret.id !== cur.id) return mkRes(ret, 0.15);
    }
    return { changed: false, stateName: cur.name, clipName: cur.clipName, assetId: cur.assetId || null, timeScale: cur.timeScale || 1, loopMode: cur.loopMode || 'LoopRepeat', blendDuration: 0.25, node: cur };
  }

  // ---- NavMesh A* ----
  function findAStarPath(navMesh, startX, startZ, goalX, goalZ) {
    if (!navMesh || !navMesh.cols || !navMesh.rows) return [{ x: goalX, y: 0, z: goalZ }];
    var cs = navMesh.cellSize || 1.2, cols = navMesh.cols, rows = navMesh.rows;
    function toCell(wx, wz) {
      return { c: Math.max(0, Math.min(cols - 1, Math.floor((wx - navMesh.originX) / cs))), r: Math.max(0, Math.min(rows - 1, Math.floor((wz - navMesh.originZ) / cs))) };
    }
    var sc = toCell(startX, startZ), gc = toCell(goalX, goalZ);
    var startIdx = sc.r * cols + sc.c, goalIdx = gc.r * cols + gc.c;
    if (startIdx === goalIdx) return [{ x: goalX, y: navMesh.heights[goalIdx] || 0, z: goalZ }];
    var open = [startIdx], cameFrom = new Int32Array(cols * rows).fill(-1);
    var gScore = new Float32Array(cols * rows).fill(1e9), fScore = new Float32Array(cols * rows).fill(1e9), closed = new Uint8Array(cols * rows);
    gScore[startIdx] = 0; fScore[startIdx] = Math.hypot(gc.c - sc.c, gc.r - sc.r);
    var dirs = [[1,0,1],[-1,0,1],[0,1,1],[0,-1,1],[1,1,1.414],[-1,1,1.414],[1,-1,1.414],[-1,-1,1.414]], guard = 0;
    while (open.length > 0 && guard++ < 4000) {
      var bestPos = 0;
      for (var i = 1; i < open.length; i++) if (fScore[open[i]] < fScore[open[bestPos]]) bestPos = i;
      var curr = open.splice(bestPos, 1)[0];
      if (curr === goalIdx) {
        var pts = [], trace = curr;
        while (trace !== -1 && trace !== startIdx) {
          var tr = Math.floor(trace / cols), tc = trace % cols;
          pts.unshift({ x: navMesh.originX + (tc + 0.5) * cs, y: navMesh.heights[trace] || 0, z: navMesh.originZ + (tr + 0.5) * cs });
          trace = cameFrom[trace];
        }
        pts.push({ x: goalX, y: navMesh.heights[goalIdx] || 0, z: goalZ });
        return pts;
      }
      closed[curr] = 1;
      var cr = Math.floor(curr / cols), cc = curr % cols;
      for (var d = 0; d < dirs.length; d++) {
        var nc = cc + dirs[d][0], nr = cr + dirs[d][1];
        if (nc < 0 || nc >= cols || nr < 0 || nr >= rows) continue;
        var ni = nr * cols + nc;
        if (closed[ni] || (navMesh.walkable[ni] === 0 && ni !== goalIdx)) continue;
        var tg = gScore[curr] + dirs[d][2];
        if (tg < gScore[ni]) {
          cameFrom[ni] = curr; gScore[ni] = tg; fScore[ni] = tg + Math.hypot(gc.c - nc, gc.r - nr);
          if (open.indexOf(ni) < 0) open.push(ni);
        }
      }
    }
    return [{ x: goalX, y: 0, z: goalZ }];
  }

  function compileUserScript3D(scriptAsset) {
    if (!scriptAsset || scriptAsset.kind !== 'script') return null;
    var raw = String(scriptAsset.code || '');
    var commentParams = {};
    var pmRe = /\\/\\/\\s*@param\\s+([a-zA-Z0-9_]+)\\s*:\\s*(number|boolean|string)\\s*=\\s*([^\\r\\n]+)/g;
    var pm;
    while ((pm = pmRe.exec(raw)) !== null) {
      var pk = pm[1], pt = pm[2], pv = pm[3].trim();
      commentParams[pk] = pt === 'number' ? (Number(pv) || 0) : pt === 'boolean' ? pv === 'true' : pv.replace(/^['"]|['"]$/g, '');
    }
    var cleaned = raw
      .replace(/^\\s*import\\s+[\\s\\S]*?\\s+from\\s+['"][^'"]+['"];?\\s*$/gm, '')
      .replace(/^\\s*import\\s+['"][^'"]+['"];?\\s*$/gm, '')
      .replace(/^\\s*export\\s*\\{[^}]*\\};?\\s*$/gm, '')
      .replace(/^\\s*export\\s+default\\s+/gm, 'var __nexusDefaultExport = ')
      .replace(/^\\s*export\\s+(async\\s+)?function\\s+([a-zA-Z_$][a-zA-Z0-9_$]*)/gm, function (_m, ak, fnN) { return (ak ? 'async ' : '') + 'function ' + fnN; })
      .replace(/^\\s*export\\s+class\\s+/gm, 'class ')
      .replace(/^\\s*export\\s+(const|let|var)\\s+/gm, '$1 ');
    var fnNames = new Set(['onStart', 'onUpdate', 'onCollisionEnter', 'onClick', 'onDestroy']);
    var fnRe = /(?:export\\s+)?(?:async\\s+)?function\\s+([a-zA-Z_$][a-zA-Z0-9_$]*)\\s*\\(/g;
    var mFn;
    while ((mFn = fnRe.exec(raw)) !== null) fnNames.add(mFn[1]);
    var vrRe = /(?:^|\\n)\\s*(?:export\\s+)?(?:const|let|var)\\s+([a-zA-Z_$][a-zA-Z0-9_$]*)\\s*=/g;
    while ((mFn = vrRe.exec(raw)) !== null) {
      if (mFn[1] !== 'params' && mFn[1] !== '__nexusDefaultExport') fnNames.add(mFn[1]);
    }
    var autoExpose = Array.from(fnNames).map(function (n) {
      return 'try { if (typeof ' + n + ' === "function" && typeof result[' + JSON.stringify(n) + '] !== "function") result[' + JSON.stringify(n) + '] = ' + n + '; } catch (_) {}';
    }).join('\\n');
    var wrapped = '"use strict";\\nvar exports = {};\\nvar module = { exports: exports };\\nvar __nexusDefaultExport = undefined;\\n' + cleaned +
      '\\nvar result = {};' +
      '\\nif (typeof __nexusDefaultExport === "object" && __nexusDefaultExport !== null) { Object.assign(result, __nexusDefaultExport); }' +
      '\\nelse if (typeof __nexusDefaultExport === "function") {' +
      '\\n  var _pr = __nexusDefaultExport.prototype;' +
      '\\n  if (_pr && (typeof _pr.onStart === "function" || typeof _pr.onUpdate === "function" || typeof _pr.onCollisionEnter === "function")) {' +
      '\\n    try { var _ins = new __nexusDefaultExport(); if (_ins && typeof _ins === "object") { Object.assign(result, _ins); Object.getOwnPropertyNames(_pr).forEach(function (_k) { if (_k !== "constructor" && typeof _pr[_k] === "function" && !result[_k]) result[_k] = _pr[_k].bind(_ins); }); } } catch (_) {}' +
      '\\n  } else { result.onUpdate = __nexusDefaultExport; }' +
      '\\n}' +
      '\\nif (module.exports && typeof module.exports === "object" && Object.keys(module.exports).length > 0) Object.assign(result, module.exports);' +
      '\\ntry { if (typeof params === "object" && params !== null && !result.params) result.params = params; } catch (_) {}' +
      '\\n' + autoExpose + '\\nreturn result;';
    try {
      var hooks = new Function(wrapped)() || {};
      if (Object.keys(commentParams).length > 0) {
        hooks.params = Object.assign({}, commentParams, hooks.params && typeof hooks.params === 'object' ? hooks.params : {});
      }
      return { id: scriptAsset.id, name: scriptAsset.name, hooks: hooks };
    } catch (err) {
      console.warn('[NEXUS Script Error]', scriptAsset.name, err);
      return { id: scriptAsset.id, name: scriptAsset.name, hooks: Object.keys(commentParams).length > 0 ? { params: commentParams } : {}, error: err instanceof Error ? err.message : String(err) };
    }
  }

  async function boot() {
    if (window.NexusPortal) await window.NexusPortal.init();
    var res = await fetch('data/game.json');
    var gameData = await res.json();
    var stageWrap = document.getElementById('nx-stage-wrap');
    var hudScoreBox = document.getElementById('nx-score-box');
    var scoreSpan = document.getElementById('nx-score');
    var pauseBtn = document.getElementById('nx-pause-btn');
    var resumeBtn = document.getElementById('nx-resume-btn');
    var pauseOverlay = document.getElementById('nx-pause-overlay');
    var fsBtn = document.getElementById('nx-fs-btn');

    var audioBuses = Object.assign({ master: 1, music: 0.8, sfx: 1, ui: 1, muted: { master: false, music: false, sfx: false, ui: false } }, gameData.audioBuses || {});
    var audioCtx = null;
    var assetMap = new Map();
    (gameData.assets || []).forEach(function (a) { assetMap.set(a.id, a); });
    var audioBuffers = new Map();
    var currentMusic = null;

    function getAudioCtx() {
      if (!audioCtx) {
        var Ctx = window.AudioContext || window.webkitAudioContext;
        if (Ctx) audioCtx = new Ctx();
      }
      if (audioCtx && audioCtx.state === 'suspended') audioCtx.resume().catch(function () {});
      return audioCtx;
    }

    function channelGain(ch) {
      if (audioBuses.muted && (audioBuses.muted.master || audioBuses.muted[ch])) return 0;
      return Math.max(0, (audioBuses.master || 1) * (audioBuses[ch] !== undefined ? audioBuses[ch] : 1));
    }

    async function loadAudioBuffer(assetId) {
      if (audioBuffers.has(assetId)) return audioBuffers.get(assetId);
      var meta = assetMap.get(assetId);
      var ctx = getAudioCtx();
      if (!meta || !ctx) return null;
      var r = await fetch(meta.path);
      var ab = await r.arrayBuffer();
      var decoded = await ctx.decodeAudioData(ab);
      audioBuffers.set(assetId, decoded);
      return decoded;
    }

    function updateAudioListener3D(x, y, z) {
      var ctx = audioCtx;
      if (!ctx || !ctx.listener) return;
      try {
        if (ctx.listener.positionX) {
          ctx.listener.positionX.value = x;
          ctx.listener.positionY.value = y;
          ctx.listener.positionZ.value = z;
        } else if (ctx.listener.setPosition) {
          ctx.listener.setPosition(x, y, z);
        }
      } catch (_) {}
    }

    async function playSfx(assetIdOrPreset, vol, spatialOpts) {
      var ctx = getAudioCtx();
      if (!ctx) return;
      var gainVal = (vol !== undefined ? vol : 0.8) * channelGain('sfx');
      if (gainVal <= 0.001) return;
      var outNode = ctx.destination;
      if (spatialOpts && typeof spatialOpts.x === 'number' && typeof ctx.createPanner === 'function') {
        try {
          var pan = ctx.createPanner();
          pan.panningModel = 'HRTF';
          pan.distanceModel = 'inverse';
          pan.refDistance = 3;
          pan.maxDistance = 42;
          pan.rolloffFactor = 1.1;
          if (pan.positionX) {
            pan.positionX.value = spatialOpts.x;
            pan.positionY.value = spatialOpts.y || 0;
            pan.positionZ.value = spatialOpts.z || 0;
          } else if (pan.setPosition) {
            pan.setPosition(spatialOpts.x, spatialOpts.y || 0, spatialOpts.z || 0);
          }
          pan.connect(ctx.destination);
          outNode = pan;
        } catch (_) { outNode = ctx.destination; }
      }
      if (assetMap.has(assetIdOrPreset)) {
        var buf = await loadAudioBuffer(assetIdOrPreset);
        if (!buf) return;
        var src = ctx.createBufferSource();
        src.buffer = buf;
        var g = ctx.createGain();
        g.gain.value = gainVal;
        src.connect(g); g.connect(outNode);
        src.start(0);
      } else {
        var osc = ctx.createOscillator(), g2 = ctx.createGain();
        osc.type = assetIdOrPreset === 'hit' ? 'sawtooth' : 'triangle';
        osc.frequency.setValueAtTime(assetIdOrPreset === 'jump' ? 320 : assetIdOrPreset === 'coin' ? 880 : 520, ctx.currentTime);
        osc.frequency.exponentialRampToValueAtTime(assetIdOrPreset === 'jump' ? 580 : 1240, ctx.currentTime + 0.12);
        g2.gain.setValueAtTime(Math.min(0.4, gainVal * 0.3), ctx.currentTime);
        g2.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.16);
        osc.connect(g2); g2.connect(outNode);
        osc.start(); osc.stop(ctx.currentTime + 0.17);
      }
    }

    function stopMusic(fadeSec) {
      if (!currentMusic) return;
      var old = currentMusic;
      currentMusic = null;
      var dur = fadeSec !== undefined ? fadeSec : 0.4;
      if (dur > 0.05 && audioCtx && old.gain && old.gain.gain) {
        try {
          var t0 = audioCtx.currentTime;
          old.gain.gain.cancelScheduledValues(t0);
          old.gain.gain.setValueAtTime(Math.max(0.0001, old.gain.gain.value), t0);
          old.gain.gain.linearRampToValueAtTime(0.0001, t0 + dur);
          setTimeout(function () { try { old.source.stop(); } catch (_) {} }, Math.round(dur * 1000) + 60);
          return;
        } catch (_) {}
      }
      if (old.source) { try { old.source.stop(); } catch (_) {} }
    }

    async function playMusic(assetId, vol, loop) {
      if (currentMusic && currentMusic.assetId === assetId) return;
      stopMusic(1.5);
      var ctx = getAudioCtx();
      var buf = await loadAudioBuffer(assetId);
      if (!ctx || !buf) return;
      var src = ctx.createBufferSource();
      src.buffer = buf; src.loop = loop !== false;
      var g = ctx.createGain();
      var targetVol = Math.max(0.0001, (vol !== undefined ? vol : 0.8) * channelGain('music'));
      var t0 = ctx.currentTime;
      g.gain.setValueAtTime(0.0001, t0);
      g.gain.linearRampToValueAtTime(targetVol, t0 + 1.5);
      src.connect(g); g.connect(ctx.destination);
      src.start(0);
      currentMusic = { assetId: assetId, source: src, gain: g, vol: vol !== undefined ? vol : 0.8 };
    }

    function getMaxDpr3D(sc) {
      var perf = (sc && (sc.performanceProfile || (sc.renderQuality && sc.renderQuality.performanceMode))) || 'balanced_60';
      if (perf === 'ultra_fast') return 1;
      if (perf === 'high_quality') return 2;
      return 1.5;
    }

    var software = detectSoftwareWebGL();
    var initMaxDpr3D = getMaxDpr3D(scenes[0]);
    var currentActiveDpr3D = software ? 1 : Math.min(window.devicePixelRatio || 1, initMaxDpr3D);
    var webgl = new THREE.WebGLRenderer({ antialias: !software && initMaxDpr3D > 1, powerPreference: 'high-performance' });
    webgl.setPixelRatio(currentActiveDpr3D);
    webgl.outputColorSpace = THREE.SRGBColorSpace;
    webgl.toneMapping = THREE.ACESFilmicToneMapping;
    webgl.shadowMap.enabled = !software;
    webgl.shadowMap.type = THREE.PCFSoftShadowMap;
    stageWrap.appendChild(webgl.domElement);

    var threeScene = new THREE.Scene();
    if (EXT.RoomEnvironment) {
      var pmrem = new THREE.PMREMGenerator(webgl);
      var re = new EXT.RoomEnvironment();
      threeScene.environment = pmrem.fromScene(re, 0.04).texture;
      re.dispose(); pmrem.dispose();
    }
    var camera = new THREE.PerspectiveCamera(55, 16 / 9, 0.1, 450);

    function resizeRenderer() {
      var w = stageWrap.clientWidth || window.innerWidth;
      var h = stageWrap.clientHeight || window.innerHeight;
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      webgl.setSize(w, h);
    }
    resizeRenderer();
    window.addEventListener('resize', resizeRenderer);

    var compiledScripts = new Map();
    (gameData.scripts || []).forEach(function (sc) {
      var c = compileUserScript3D(sc);
      if (c) compiledScripts.set(sc.id, c);
    });
    var prefabMap3D = new Map();
    (gameData.prefabs || []).forEach(function (pf) { prefabMap3D.set(pf.id, pf); });

    var variables = new Map();
    (gameData.variables || []).forEach(function (v) { variables.set(v.name, v.initialValue); });
    if (!variables.has('puntos')) variables.set('puntos', 0);
    if (!variables.has('salud')) variables.set('salud', 100);

    var paused = false;
    function setPaused(p) {
      paused = Boolean(p);
      if (pauseOverlay) pauseOverlay.classList.toggle('hidden', !paused);
    }
    if (pauseBtn) pauseBtn.addEventListener('click', function () { setPaused(!paused); });
    if (resumeBtn) resumeBtn.addEventListener('click', function () { setPaused(false); });
    if (fsBtn) fsBtn.addEventListener('click', function () {
      if (!document.fullscreenElement) document.documentElement.requestFullscreen().catch(function () {});
      else document.exitFullscreen().catch(function () {});
    });

    var uiOverlay = document.createElement('div');
    uiOverlay.id = 'nx-ui-widgets-layer';
    uiOverlay.style.cssText = 'position:absolute;inset:0;pointer-events:none;z-index:15;overflow:hidden;';
    var hpBarsHost3D = document.createElement('div');
    hpBarsHost3D.style.cssText = 'position:absolute;inset:0;pointer-events:none;z-index:18;';
    var widgetsHost = document.createElement('div');
    widgetsHost.style.cssText = 'position:absolute;inset:0;pointer-events:none;';
    var dynWidgetsHost = document.createElement('div');
    dynWidgetsHost.style.cssText = 'position:absolute;inset:0;pointer-events:none;z-index:35;';
    var toastHost = document.createElement('div');
    toastHost.style.cssText = 'position:absolute;top:16px;left:50%;transform:translateX(-50%);display:flex;flex-direction:column;gap:8px;align-items:center;pointer-events:none;z-index:45;';
    var dialogueHost3D = document.createElement('div');
    dialogueHost3D.style.cssText = 'position:absolute;left:50%;bottom:24px;transform:translateX(-50%);width:min(680px,92%);pointer-events:auto;z-index:55;display:none;';
    uiOverlay.appendChild(hpBarsHost3D);
    uiOverlay.appendChild(widgetsHost);
    uiOverlay.appendChild(dynWidgetsHost);
    uiOverlay.appendChild(toastHost);
    uiOverlay.appendChild(dialogueHost3D);
    document.getElementById('nx-root').appendChild(uiOverlay);

    var i18nCfg3D = gameData.i18n || { defaultLocale: 'es', autoDetectBrowser: true, entries: {} };
    var activeLocale3D = i18nCfg3D.defaultLocale || 'es';
    if (i18nCfg3D.autoDetectBrowser && typeof navigator !== 'undefined') {
      var navLang3D = String(navigator.language || '').toLowerCase().slice(0, 2);
      if (navLang3D === 'es' || navLang3D === 'en' || navLang3D === 'pt') activeLocale3D = navLang3D;
    }
    var dataTables3D = gameData.dataTables || [];
    var dialogues3D = gameData.dialogues || [];
    var activeDialogue3D = null;

    function t3D(key) {
      var ent = i18nCfg3D && i18nCfg3D.entries ? i18nCfg3D.entries[key] : null;
      if (!ent) return key;
      return ent[activeLocale3D] || ent[i18nCfg3D.defaultLocale || 'es'] || ent.es || ent.en || ent.pt || key;
    }
    function queryDataTable3D(tableRef, rowKey) {
      var tbl = dataTables3D.find(function (tb) { return tb.id === tableRef || String(tb.name || '').toLowerCase() === String(tableRef || '').toLowerCase(); });
      if (!tbl) return null;
      if (rowKey === undefined || rowKey === null || rowKey === '') return tbl.rows || [];
      if (typeof rowKey === 'number') return (tbl.rows && tbl.rows[rowKey]) || null;
      var m = (tbl.rows || []).find(function (r) { return String(r.id || '') === String(rowKey) || String(r.name || '') === String(rowKey); });
      if (m) return m;
      var num = Number(rowKey);
      return !isNaN(num) && tbl.rows ? (tbl.rows[num] || null) : null;
    }
    function evalDialogueCond3D(expr) {
      var raw = String(expr || '').trim();
      if (!raw) return true;
      var m = raw.match(/^([a-zA-Z0-9_.-]+)\\s*(==|!=|>=|<=|>|<)\\s*(.+)$/);
      if (!m) return Boolean(variables.get(raw));
      var lhs = variables.get(m[1]);
      var rhs = m[3].trim();
      if ((rhs[0] === '"' && rhs[rhs.length - 1] === '"') || (rhs[0] === "'" && rhs[rhs.length - 1] === "'")) rhs = rhs.slice(1, -1);
      else if (rhs === 'true') rhs = true;
      else if (rhs === 'false') rhs = false;
      else if (!isNaN(Number(rhs))) rhs = Number(rhs);
      var ln = Number(lhs), rn = Number(rhs);
      var bothN = typeof lhs === 'number' || (typeof rhs === 'number' && !isNaN(ln) && String(lhs || '') !== '');
      if (m[2] === '==') return bothN ? ln === rn : String(lhs || '') === String(rhs || '');
      if (m[2] === '!=') return bothN ? ln !== rn : String(lhs || '') !== String(rhs || '');
      if (m[2] === '>') return ln > rn;
      if (m[2] === '>=') return ln >= rn;
      if (m[2] === '<') return ln < rn;
      if (m[2] === '<=') return ln <= rn;
      return true;
    }
    function interpDialogueStr3D(txt) {
      var out = String(txt || '').replace(/@t\\(([^)]+)\\)/g, function (_m, k) { return t3D(String(k).trim()); });
      return out.replace(/\\{\\{([a-zA-Z0-9_.-]+)\\}\\}/g, function (_m, k) {
        var v = variables.get(k);
        return v === undefined || v === null ? '' : String(v);
      });
    }
    function renderDialogueOverlay3D() {
      if (!activeDialogue3D || !activeSim) {
        dialogueHost3D.style.display = 'none';
        dialogueHost3D.innerHTML = '';
        return;
      }
      dialogueHost3D.style.display = 'block';
      var st = activeDialogue3D;
      var pMeta = st.portraitAssetId ? assetMap.get(st.portraitAssetId) : null;
      var portraitUrl = pMeta ? pMeta.path : null;
      var shown = st.fullText.slice(0, Math.floor(st.revealedChars));
      dialogueHost3D.innerHTML = '';
      var box = document.createElement('div');
      box.style.cssText = 'background:rgba(15,23,42,0.96);border:2px solid rgba(56,189,248,0.55);border-radius:14px;padding:14px 16px;box-shadow:0 12px 32px rgba(0,0,0,0.6);display:flex;gap:14px;align-items:flex-start;font-family:sans-serif;color:#f8fafc;';
      if (portraitUrl) {
        var img = document.createElement('img');
        img.src = portraitUrl;
        img.style.cssText = 'width:68px;height:68px;border-radius:10px;object-fit:cover;border:1px solid rgba(148,163,184,0.4);flex-shrink:0;';
        box.appendChild(img);
      }
      var col = document.createElement('div');
      col.style.cssText = 'flex:1;min-width:0;';
      var spk = document.createElement('div');
      spk.style.cssText = 'font-size:12px;font-weight:700;color:#38bdf8;margin-bottom:4px;text-transform:uppercase;letter-spacing:0.05em;';
      spk.textContent = st.speaker || 'NPC';
      var body = document.createElement('div');
      body.style.cssText = 'font-size:14px;line-height:1.45;min-height:40px;color:#e2e8f0;';
      body.textContent = shown;
      col.appendChild(spk);
      col.appendChild(body);
      var btns = document.createElement('div');
      btns.style.cssText = 'display:flex;flex-wrap:wrap;gap:8px;margin-top:10px;justify-content:flex-end;';
      if (!st.finishedTyping) {
        var skipB = document.createElement('button');
        skipB.textContent = 'Continuar';
        skipB.style.cssText = 'background:#334155;color:#f8fafc;border:1px solid #475569;border-radius:8px;padding:6px 12px;font-size:12px;cursor:pointer;';
        skipB.onclick = function () { advanceDialogue3D(null); };
        btns.appendChild(skipB);
      } else if (st.choices && st.choices.length > 0) {
        st.choices.forEach(function (ch, idx) {
          var cb = document.createElement('button');
          cb.textContent = ch.text;
          cb.style.cssText = 'background:#0284c7;color:#ffffff;border:none;border-radius:8px;padding:6px 12px;font-size:12px;font-weight:600;cursor:pointer;';
          cb.onclick = function () { advanceDialogue3D(idx); };
          btns.appendChild(cb);
        });
      } else {
        var nextB = document.createElement('button');
        nextB.textContent = st.nextNodeId ? 'Siguiente' : 'Cerrar';
        nextB.style.cssText = 'background:#0284c7;color:#ffffff;border:none;border-radius:8px;padding:6px 12px;font-size:12px;font-weight:600;cursor:pointer;';
        nextB.onclick = function () { advanceDialogue3D(null); };
        btns.appendChild(nextB);
      }
      col.appendChild(btns);
      box.appendChild(col);
      dialogueHost3D.appendChild(box);
    }
    function openDialogueNode3D(graph, nodeId) {
      if (!graph || !graph.nodes || graph.nodes.length === 0 || !activeSim) { activeDialogue3D = null; renderDialogueOverlay3D(); return; }
      var node = graph.nodes.find(function (n) { return n.id === nodeId; }) || graph.nodes.find(function (n) { return n.id === graph.startNodeId; }) || graph.nodes[0];
      if (!node) { activeDialogue3D = null; renderDialogueOverlay3D(); return; }
      var ft = interpDialogueStr3D(node.text);
      var visChoices = (node.choices || []).filter(function (c) { return evalDialogueCond3D(c.conditionExpr); }).map(function (c) {
        return Object.assign({}, c, { text: interpDialogueStr3D(c.text) });
      });
      activeDialogue3D = {
        graphId: graph.id, nodeId: node.id, speaker: interpDialogueStr3D(node.speaker),
        portraitAssetId: node.portraitAssetId || null, fullText: ft,
        revealedChars: ft.length <= 1 ? ft.length : 1, typewriterSpeed: Math.max(5, Math.min(200, node.typewriterSpeed || 45)),
        finishedTyping: ft.length <= 1, choices: visChoices, nextNodeId: node.nextNodeId || null
      };
      renderDialogueOverlay3D();
    }
    function startDialogue3D(idOrName) {
      var g = dialogues3D.find(function (d) { return d.id === idOrName || d.name === idOrName; });
      if (g) openDialogueNode3D(g, g.startNodeId);
    }
    function advanceDialogue3D(choiceIdx) {
      if (!activeDialogue3D || !activeSim) return;
      if (!activeDialogue3D.finishedTyping) {
        activeDialogue3D.revealedChars = activeDialogue3D.fullText.length;
        activeDialogue3D.finishedTyping = true;
        renderDialogueOverlay3D();
        return;
      }
      var g = dialogues3D.find(function (d) { return d.id === activeDialogue3D.graphId; });
      var nextId = activeDialogue3D.nextNodeId;
      if (choiceIdx !== null && choiceIdx >= 0 && activeDialogue3D.choices[choiceIdx]) {
        var ch = activeDialogue3D.choices[choiceIdx];
        if (ch.actionVar) {
          if (ch.actionOp === 'add') variables.set(ch.actionVar, Number(variables.get(ch.actionVar) || 0) + Number(ch.actionValue || 0));
          else variables.set(ch.actionVar, ch.actionValue !== undefined ? ch.actionValue : true);
        }
        if (ch.actionEvent) activeSim.queuedEvents.push(ch.actionEvent);
        nextId = ch.nextNodeId || null;
      } else if (activeDialogue3D.choices && activeDialogue3D.choices.length > 0) {
        return;
      }
      if (!g || !nextId) { activeDialogue3D = null; renderDialogueOverlay3D(); return; }
      openDialogueNode3D(g, nextId);
    }

    var scenes = gameData.scenes || [];
    var currentScene = scenes.find(function (s) { return s.id === (gameData.initialSceneId || gameData.activeSceneId); }) || scenes[0];
    var worldGroup = new THREE.Group();
    threeScene.add(worldGroup);

    var activeSim = null;
    var nodeMap3d = new Map();
    var meshBindings = new Map();
    var loadedRoots3D = new Map();
    var lodBindings3D = new Map();
    var pendingBoneSockets3D = [];
    var lastFadeOpacity3D = new Map();
    var lightBindings = new Map();
    var mixerMap = new Map();
    var waterBindings = new Map();
    var ripplePool3D = [];
    var wakeTrails3D = new Map();
    var foliageBindings = new Map();
    var softBodyMeshes = new Map();
    var vehicleWheelMeshes = new Map();
    var trimeshCache = new Map();
    var particles3D = [];
    var particleGroup = new THREE.Group();
    var particleSharedGeo = new THREE.SphereGeometry(0.18, 6, 5);
    var particleTexCache = new Map();
    var sim3dAccumulator = 0;
    var skyRef = null;
    var sunLightRef = null;
    var ambientLightRef = null;
    var gltfLoader = EXT.GLTFLoader ? new EXT.GLTFLoader() : null;
    var fbxLoader = EXT.FBXLoader ? new EXT.FBXLoader() : null;
    var texLoader = new THREE.TextureLoader();

    // ---- Real Chunk Asset Streaming + HLOD Combinado/Billboard ----
    var streamedTexTargets3D = new Map();
    var streamedGlbTargets3D = new Map();
    var hlodProxyVisuals3D = new Map();
    var activeStreamState3D = null;

    function disposeObject3DTree3D(root) {
      if (!root) return;
      root.traverse(function (node) {
        if (node.geometry && typeof node.geometry.dispose === 'function') node.geometry.dispose();
        if (node.material) {
          var mats = Array.isArray(node.material) ? node.material : [node.material];
          for (var i = 0; i < mats.length; i++) {
            var mat = mats[i];
            if (!mat) continue;
            var keys = ['map', 'normalMap', 'roughnessMap', 'metalnessMap', 'emissiveMap', 'alphaMap', 'aoMap'];
            for (var ki = 0; ki < keys.length; ki++) {
              var tx = mat[keys[ki]];
              if (tx && typeof tx.dispose === 'function') tx.dispose();
            }
            if (typeof mat.dispose === 'function') mat.dispose();
          }
        }
      });
    }

    function resolveStreamingCfg3D(ws) {
      var chunkSize = Math.max(16, Number((ws && ws.chunkSize) || 64));
      var loadRadius = Math.max(chunkSize, Number((ws && ws.loadRadius) || 140));
      var unloadRadius = Math.max(loadRadius + 24, Number((ws && ws.unloadRadius) || 210));
      var farProxyRadius = Math.max(unloadRadius + 40, Number((ws && ws.farProxyRadius) || 340));
      var maxLoadsPerFrame = Math.max(1, Math.min(8, Number((ws && ws.maxLoadsPerFrame) || 2)));
      var profile = (ws && ws.budgetProfile) || 'pc';
      var baseLimits = profile === 'mobile'
        ? { texturesMB: 128, modelsMB: 96 }
        : { texturesMB: 512, modelsMB: 384 };
      if (profile === 'custom' && ws && ws.customBudgets) {
        if (ws.customBudgets.texturesMB !== undefined) baseLimits.texturesMB = ws.customBudgets.texturesMB;
        if (ws.customBudgets.modelsMB !== undefined) baseLimits.modelsMB = ws.customBudgets.modelsMB;
      }
      return {
        enabled: Boolean(ws && ws.enabled),
        chunkSize: chunkSize,
        loadRadius: loadRadius,
        unloadRadius: unloadRadius,
        farProxyRadius: farProxyRadius,
        maxLoadsPerFrame: maxLoadsPerFrame,
        frustumPreloadWeight: Math.max(1, Number((ws && ws.frustumPreloadWeight) || 1.35)),
        velocityPreloadSec: Math.max(0, Number((ws && ws.velocityPreloadSec) || 1.6)),
        enableHlod: !ws || ws.enableHlod !== false,
        enableOcclusionCulling: !ws || ws.enableOcclusionCulling !== false,
        budgetLimits: baseLimits
      };
    }

    function collectObjectAssetIds3D(src) {
      var ids = [];
      if (!src || !src.mesh3d) return ids;
      var m = src.mesh3d;
      if (m.glbAssetId) ids.push(m.glbAssetId);
      if (m.textureAssetId) ids.push(m.textureAssetId);
      if (m.normalAssetId) ids.push(m.normalAssetId);
      if (m.roughnessAssetId) ids.push(m.roughnessAssetId);
      if (m.metalnessAssetId) ids.push(m.metalnessAssetId);
      if (m.emissiveAssetId) ids.push(m.emissiveAssetId);
      if (m.aoAssetId) ids.push(m.aoAssetId);
      if (src.optimization && src.optimization.lodAssetId) ids.push(src.optimization.lodAssetId);
      if (m.foliageConfig && m.foliageConfig.modelAssetId) ids.push(m.foliageConfig.modelAssetId);
      return Array.from(new Set(ids));
    }

    function buildStreamingContext3D(sceneObj) {
      var cfg = resolveStreamingCfg3D(sceneObj.worldStreaming);
      var chunks = new Map();
      var objToChunk = new Map();
      (sceneObj.objects || []).forEach(function (o) {
        if (!o.transform3d) return;
        var m3 = o.mesh3d;
        if (m3 && (m3.shape === 'plane' || m3.shape === 'terrain')) return;
        var cx = Math.floor((o.transform3d.x || 0) / cfg.chunkSize);
        var cz = Math.floor((o.transform3d.z || 0) / cfg.chunkSize);
        var key = cx + ',' + cz;
        var ch = chunks.get(key);
        if (!ch) {
          ch = {
            key: key,
            cx: cx,
            cz: cz,
            centerX: (cx + 0.5) * cfg.chunkSize,
            centerZ: (cz + 0.5) * cfg.chunkSize,
            objectIds: [],
            assetIds: []
          };
          chunks.set(key, ch);
        }
        ch.objectIds.push(o.id);
        objToChunk.set(o.id, key);
        collectObjectAssetIds3D(o).forEach(function (aid) {
          if (ch.assetIds.indexOf(aid) < 0) ch.assetIds.push(aid);
        });
      });

      var objById = new Map((sceneObj.objects || []).map(function (o) { return [o.id, o]; }));
      var hlodProxies = new Map();
      chunks.forEach(function (ch) {
        var members = ch.objectIds.map(function (id) { return objById.get(id); }).filter(function (o) {
          return Boolean(o && o.visible && o.type === 'mesh_3d' && o.mesh3d && o.mesh3d.shape !== 'plane' && o.mesh3d.shape !== 'terrain' && o.mesh3d.shape !== 'water');
        });
        if (members.length < 2) return;
        var minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity, minZ = Infinity, maxZ = -Infinity;
        var rawParts = [], foliageParts = 0, structureParts = 0;
        members.forEach(function (m) {
          var t = m.transform3d || { x: 0, y: 0, z: 0, sx: 1, sy: 1, sz: 1 };
          var w = Math.max(0.8, Math.abs(t.sx)), h = Math.max(0.8, Math.abs(t.sy)), d = Math.max(0.8, Math.abs(t.sz));
          minX = Math.min(minX, t.x - w * 0.5); maxX = Math.max(maxX, t.x + w * 0.5);
          minY = Math.min(minY, t.y - h * 0.5); maxY = Math.max(maxY, t.y + h * 0.5);
          minZ = Math.min(minZ, t.z - d * 0.5); maxZ = Math.max(maxZ, t.z + d * 0.5);
          var isFol = Boolean((m.mesh3d && m.mesh3d.foliageConfig) || (m.mesh3d && m.mesh3d.shape === 'grass_field') || /arbol|árbol|tree|pino|bosque|bush|arbusto/i.test(m.name || ''));
          var pk = isFol ? 'foliage' : (h >= 2.6 || w >= 2.6 || d >= 2.6 ? 'building' : 'structure');
          if (pk === 'foliage') foliageParts++; else structureParts++;
          var pCol = (m.mesh3d && m.mesh3d.foliageConfig && (m.mesh3d.foliageConfig.colorTip || m.mesh3d.foliageConfig.colorBase)) || (m.mesh3d && m.mesh3d.color) || '#64748b';
          if (m.mesh3d && m.mesh3d.foliageConfig && m.mesh3d.foliageConfig.instances && m.mesh3d.foliageConfig.instances.length > 0) {
            var insts = m.mesh3d.foliageConfig.instances;
            var step = Math.max(1, Math.floor(insts.length / 6));
            for (var ii = 0; ii < insts.length && rawParts.length < 32; ii += step) {
              var it = insts[ii], sc = Math.max(0.6, it.scale || 1);
              rawParts.push({ cx: it.x, cy: it.y + sc * 0.8, cz: it.z, w: sc * 1.6, h: sc * 1.9, d: sc * 1.6, color: pCol, kind: 'foliage', vol: sc * sc * sc * 4.5 });
            }
          } else {
            rawParts.push({ cx: t.x, cy: t.y, cz: t.z, w: w, h: h, d: d, color: pCol, kind: pk, vol: w * h * d });
          }
        });
        var cX = (minX + maxX) * 0.5, cY = (minY + maxY) * 0.5, cZ = (minZ + maxZ) * 0.5;
        rawParts.sort(function (a, b) { return b.vol - a.vol; });
        var selParts = rawParts.slice(0, 20).map(function (p) {
          return { offsetX: p.cx - cX, offsetY: p.cy - cY, offsetZ: p.cz - cZ, width: p.w, height: p.h, depth: p.d, color: p.color, kind: p.kind };
        });
        var impKind = foliageParts > 0 && structureParts === 0 ? 'billboard' : (foliageParts > 0 ? 'hybrid' : 'merged_cluster');
        hlodProxies.set(ch.key, {
          chunkKey: ch.key, centerX: cX, centerY: cY, centerZ: cZ,
          width: Math.max(1, maxX - minX), height: Math.max(1, maxY - minY), depth: Math.max(1, maxZ - minZ),
          color: (members[0].mesh3d && members[0].mesh3d.color) || '#64748b',
          impostorKind: impKind, parts: selParts
        });
      });

      return {
        cfg: cfg,
        chunks: chunks,
        objToChunk: objToChunk,
        loadedChunks: new Set(),
        chunkGen: 1,
        lastSyncChunkGen: -1,
        hasPendingAssetWork: false,
        occVols: (sc.occlusionVolumes || []).filter(function (v) { return v && v.enabled; }),
        lastPlayerX: NaN,
        lastPlayerZ: NaN,
        lastCamX: NaN,
        lastCamZ: NaN,
        evalCounter: 0,
        hlodProxies: hlodProxies,
        objectActivity: new Map(),
        culledObjectIds: new Set(),
        assetEntries: new Map(),
        frameIndex: 0
      };
    }

    function buildHlodProxyVisual3D(proxy) {
      var group = new THREE.Group();
      group.position.set(proxy.centerX, proxy.centerY, proxy.centerZ);
      var ownedGeos = [], ownedMats = [], ownedTexs = [];
      var solidParts = proxy.impostorKind === 'billboard'
        ? proxy.parts.filter(function (p) { return p.kind !== 'foliage'; })
        : proxy.parts;
      if (solidParts.length === 0 && proxy.impostorKind !== 'billboard') {
        solidParts = [{ offsetX: 0, offsetY: 0, offsetZ: 0, width: proxy.width, height: proxy.height, depth: proxy.depth, color: proxy.color, kind: 'building' }];
      }
      if (solidParts.length > 0) {
        var posArr = [], normArr = [], colArr = [];
        solidParts.forEach(function (part) {
          var b = new THREE.BoxGeometry(part.width, part.height, part.depth);
          var ni = b.toNonIndexed();
          b.dispose();
          var pa = ni.getAttribute('position'), na = ni.getAttribute('normal');
          var col = new THREE.Color(part.color || '#64748b');
          for (var vi = 0; vi < pa.count; vi++) {
            posArr.push(pa.getX(vi) + part.offsetX, pa.getY(vi) + part.offsetY, pa.getZ(vi) + part.offsetZ);
            normArr.push(na.getX(vi), na.getY(vi), na.getZ(vi));
            var sh = pa.getY(vi) > 0 ? 1.0 : 0.72;
            colArr.push(col.r * sh, col.g * sh, col.b * sh);
          }
          ni.dispose();
        });
        var mg = new THREE.BufferGeometry();
        mg.setAttribute('position', new THREE.Float32BufferAttribute(posArr, 3));
        mg.setAttribute('normal', new THREE.Float32BufferAttribute(normArr, 3));
        mg.setAttribute('color', new THREE.Float32BufferAttribute(colArr, 3));
        mg.computeBoundingBox(); mg.computeBoundingSphere();
        var mm = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.86, metalness: 0.06 });
        var mMesh = new THREE.Mesh(mg, mm);
        mMesh.receiveShadow = true;
        group.add(mMesh);
        ownedGeos.push(mg); ownedMats.push(mm);
      }
      var billboardMesh = null;
      if ((proxy.impostorKind === 'billboard' || proxy.impostorKind === 'hybrid') && typeof document !== 'undefined') {
        var can = document.createElement('canvas'); can.width = 256; can.height = 128;
        var ctx = can.getContext('2d');
        if (ctx) {
          var halfSpan = Math.max(2, proxy.width * 0.5, proxy.depth * 0.5);
          var maxH = Math.max(2, proxy.height);
          proxy.parts.forEach(function (p) {
            var u = (p.offsetX / (halfSpan * 2) + 0.5) * can.width;
            var wPx = Math.max(8, (p.width / (halfSpan * 2)) * can.width);
            var hPx = Math.max(12, (p.height / maxH) * (can.height * 0.84));
            var baseY = can.height - 6 - ((p.offsetY - p.height * 0.5 + maxH * 0.5) / maxH) * (can.height * 0.25);
            var topY = Math.max(4, baseY - hPx);
            if (p.kind === 'foliage') {
              ctx.fillStyle = '#4b3621';
              var tw = Math.max(3, wPx * 0.18);
              ctx.fillRect(u - tw * 0.5, topY + hPx * 0.55, tw, Math.max(4, hPx * 0.45));
              ctx.fillStyle = p.color || '#22c55e';
              ctx.beginPath(); ctx.ellipse(u, topY + hPx * 0.36, wPx * 0.48, hPx * 0.38, 0, 0, Math.PI * 2); ctx.fill();
            } else {
              ctx.fillStyle = p.color || '#64748b';
              ctx.fillRect(u - wPx * 0.5, topY, wPx, Math.max(8, baseY - topY));
            }
          });
          var bTex = new THREE.CanvasTexture(can); bTex.colorSpace = THREE.SRGBColorSpace;
          var bGeo = new THREE.PlaneGeometry(Math.max(3, Math.max(proxy.width, proxy.depth) * 0.92), Math.max(2.5, proxy.height * 1.05));
          var bMat = new THREE.MeshBasicMaterial({ map: bTex, transparent: true, alphaTest: 0.2, side: THREE.DoubleSide });
          billboardMesh = new THREE.Mesh(bGeo, bMat);
          group.add(billboardMesh);
          ownedGeos.push(bGeo); ownedMats.push(bMat); ownedTexs.push(bTex);
        }
      }
      return {
        group: group,
        billboardMesh: billboardMesh,
        dispose: function () {
          ownedTexs.forEach(function (t) { t.dispose(); });
          ownedMats.forEach(function (m) { m.dispose(); });
          ownedGeos.forEach(function (g) { g.dispose(); });
        }
      };
    }

    function disposeStreamEntry3D(ent) {
      if (!ent) return;
      if (ent.cleanups && ent.cleanups.length > 0) {
        ent.cleanups.forEach(function (fn) { try { fn(); } catch (_) {} });
        ent.cleanups = [];
      }
      ent.state = 'unloaded';
    }

    function clearAllStreamingResources3D() {
      hlodProxyVisuals3D.forEach(function (vis) {
        worldGroup.remove(vis.group);
        vis.dispose();
      });
      hlodProxyVisuals3D.clear();
      if (activeStreamState3D && activeStreamState3D.assetEntries) {
        activeStreamState3D.assetEntries.forEach(function (ent) { disposeStreamEntry3D(ent); });
        activeStreamState3D.assetEntries.clear();
      }
      streamedTexTargets3D.clear();
      streamedGlbTargets3D.clear();
      activeStreamState3D = null;
    }

    function syncAssetStreaming3D(stCtx) {
      if (!stCtx) return;
      if (stCtx.lastSyncChunkGen === stCtx.chunkGen && !stCtx.hasPendingAssetWork) return;
      var neededCounts = new Map();
      stCtx.loadedChunks.forEach(function (cKey) {
        var ch = stCtx.chunks.get(cKey);
        if (!ch) return;
        ch.assetIds.forEach(function (aid) {
          neededCounts.set(aid, (neededCounts.get(aid) || 0) + 1);
        });
      });

      var loadsStarted = 0;
      var maxLoads = Math.max(2, stCtx.cfg.maxLoadsPerFrame * 2);
      neededCounts.forEach(function (cnt, aid) {
        var ent = stCtx.assetEntries.get(aid);
        if (!ent) {
          var meta = assetMap.get(aid);
          var isModel = streamedGlbTargets3D.has(aid) || (meta && (meta.kind === 'model3d' || meta.format === 'glb' || meta.format === 'gltf' || meta.format === 'fbx'));
          ent = {
            assetId: aid,
            kind: isModel ? 'model3d' : 'texture',
            bytes: (meta && meta.size) || (isModel ? 650000 : 262144),
            state: 'unloaded',
            refCount: cnt,
            lastUsedFrame: stCtx.frameIndex,
            zeroSinceFrame: 0,
            cleanups: []
          };
          stCtx.assetEntries.set(aid, ent);
        } else {
          ent.refCount = cnt;
          ent.lastUsedFrame = stCtx.frameIndex;
          ent.zeroSinceFrame = 0;
        }
        if (ent.state === 'unloaded' && loadsStarted < maxLoads) {
          loadsStarted++;
          ent.state = 'loading';
          (function (entry) {
            var metaA = assetMap.get(entry.assetId);
            if (!metaA) { entry.state = 'missing'; return; }
            var pendingTasks = [];
            var texTargets = streamedTexTargets3D.get(entry.assetId) || [];
            if (texTargets.length > 0) {
              pendingTasks.push(new Promise(function (resolve) {
                texLoader.load(metaA.path, function (t) {
                  if (entry.refCount <= 0 || !activeStreamState3D || activeStreamState3D !== stCtx) {
                    t.dispose();
                    resolve();
                    return;
                  }
                  if (texTargets.some(function (tg) { return tg.isColor; })) t.colorSpace = THREE.SRGBColorSpace;
                  texTargets.forEach(function (tg) {
                    tg.mat[tg.slot] = t;
                    if (tg.slot === 'aoMap') tg.mat.aoMapIntensity = 0.9;
                    tg.mat.needsUpdate = true;
                  });
                  entry.cleanups.push(function () {
                    texTargets.forEach(function (tg) {
                      if (tg.mat[tg.slot] === t) { tg.mat[tg.slot] = null; tg.mat.needsUpdate = true; }
                    });
                    t.dispose();
                  });
                  resolve();
                }, undefined, function () { resolve(); });
              }));
            }
            var glbTargets = streamedGlbTargets3D.get(entry.assetId) || [];
            if (glbTargets.length > 0) {
              glbTargets.forEach(function (gt) {
                pendingTasks.push(new Promise(function (resolve) {
                  gt.hydrate(function (cleanupFn) {
                    if (entry.refCount <= 0 || !activeStreamState3D || activeStreamState3D !== stCtx) {
                      if (typeof cleanupFn === 'function') cleanupFn();
                    } else if (typeof cleanupFn === 'function') {
                      entry.cleanups.push(cleanupFn);
                    }
                    resolve();
                  });
                }));
              });
            }
            Promise.all(pendingTasks).then(function () {
              if (entry.refCount <= 0 || !activeStreamState3D || activeStreamState3D !== stCtx) {
                disposeStreamEntry3D(entry);
              } else {
                entry.state = 'loaded';
              }
            }).catch(function () { disposeStreamEntry3D(entry); });
          })(ent);
        }
      });

      var texBytes = 0, modBytes = 0, hasZeroRefLoaded = false, pendingWork = false;
      stCtx.assetEntries.forEach(function (ent) {
        if (!neededCounts.has(ent.assetId)) {
          ent.refCount = 0;
          if (ent.zeroSinceFrame === 0) ent.zeroSinceFrame = stCtx.frameIndex;
          if (ent.state === 'loaded' && (stCtx.frameIndex - ent.zeroSinceFrame) >= 18) {
            disposeStreamEntry3D(ent);
          }
        }
        if (ent.state === 'loaded') {
          if (ent.kind === 'model3d') modBytes += ent.bytes;
          else texBytes += ent.bytes;
          if (ent.refCount === 0) hasZeroRefLoaded = true;
        }
        if (ent.state === 'loading' || (ent.state === 'loaded' && ent.refCount === 0) || (ent.state === 'unloaded' && ent.refCount > 0)) {
          pendingWork = true;
        }
      });

      var maxTexBytes = stCtx.cfg.budgetLimits.texturesMB * 1024 * 1024;
      var maxModBytes = stCtx.cfg.budgetLimits.modelsMB * 1024 * 1024;
      if (hasZeroRefLoaded && (texBytes > maxTexBytes || modBytes > maxModBytes)) {
        var candidates = [];
        stCtx.assetEntries.forEach(function (ent) {
          if (ent.state === 'loaded' && ent.refCount === 0) candidates.push(ent);
        });
        candidates.sort(function (a, b) { return a.lastUsedFrame - b.lastUsedFrame; });
        for (var ci = 0; ci < candidates.length && (texBytes > maxTexBytes || modBytes > maxModBytes); ci++) {
          var ev = candidates[ci];
          disposeStreamEntry3D(ev);
          if (ev.kind === 'model3d') modBytes = Math.max(0, modBytes - ev.bytes);
          else texBytes = Math.max(0, texBytes - ev.bytes);
        }
      }
      stCtx.lastSyncChunkGen = stCtx.chunkGen;
      stCtx.hasPendingAssetWork = pendingWork;
    }

    function stepStreamingContext3D(stCtx, objs, playerPos, camPos, fwdXZ) {
      if (!stCtx || !stCtx.cfg.enabled) return;
      stCtx.frameIndex++;
      stCtx.evalCounter++;
      var cfg = stCtx.cfg;
      var movedDist = Number.isFinite(stCtx.lastPlayerX) ? Math.hypot(playerPos.x - stCtx.lastPlayerX, playerPos.z - stCtx.lastPlayerZ) : Infinity;
      var camMovedDist = Number.isFinite(stCtx.lastCamX) ? Math.hypot(camPos.posX - stCtx.lastCamX, camPos.posZ - stCtx.lastCamZ) : Infinity;
      if (stCtx.frameIndex > 1 && movedDist < 0.75 && camMovedDist < 0.75 && (stCtx.evalCounter % 4 !== 0)) {
        if (stCtx.hasPendingAssetWork || stCtx.lastSyncChunkGen !== stCtx.chunkGen) syncAssetStreaming3D(stCtx);
        if (cfg.enableHlod && hlodProxyVisuals3D.size > 0) {
          hlodProxyVisuals3D.forEach(function (vis, cKey) {
            if (vis.group.visible && vis.billboardMesh) {
              var prx = stCtx.hlodProxies.get(cKey);
              if (prx) vis.billboardMesh.rotation.y = Math.atan2(camPos.posX - prx.centerX, camPos.posZ - prx.centerZ);
            }
          });
        }
        return;
      }
      stCtx.lastPlayerX = playerPos.x; stCtx.lastPlayerZ = playerPos.z;
      stCtx.lastCamX = camPos.posX; stCtx.lastCamZ = camPos.posZ;

      var fx = fwdXZ.x || 0, fz = fwdXZ.z || -1;
      var fl = Math.hypot(fx, fz) || 1;
      fx /= fl; fz /= fl;
      var queue = [];
      stCtx.chunks.forEach(function (ch) {
        var dx = ch.centerX - playerPos.x, dz = ch.centerZ - playerPos.z;
        var dist = Math.hypot(dx, dz);
        if (dist <= cfg.loadRadius && !stCtx.loadedChunks.has(ch.key)) {
          var inv = dist > 0.001 ? 1 / dist : 1;
          var dot = (dx * inv) * fx + (dz * inv) * fz;
          var score = dist / (dot > 0.35 ? cfg.frustumPreloadWeight : 1);
          queue.push({ key: ch.key, score: score });
        } else if (dist > cfg.unloadRadius && stCtx.loadedChunks.has(ch.key)) {
          stCtx.loadedChunks.delete(ch.key);
          stCtx.chunkGen++;
        }
      });
      if (queue.length > 1) queue.sort(function (a, b) { return a.score - b.score; });
      for (var qi = 0; qi < queue.length && qi < cfg.maxLoadsPerFrame; qi++) {
        stCtx.loadedChunks.add(queue[qi].key);
        stCtx.chunkGen++;
      }

      syncAssetStreaming3D(stCtx);

      stCtx.objectActivity.clear();
      objs.forEach(function (o) {
        var cKey = stCtx.objToChunk.get(o.id);
        var d = Math.hypot((o.t3.x || 0) - playerPos.x, (o.t3.z || 0) - playerPos.z);
        if (!cKey) {
          stCtx.objectActivity.set(o.id, 'near');
        } else if (stCtx.loadedChunks.has(cKey)) {
          stCtx.objectActivity.set(o.id, d <= cfg.loadRadius * 0.55 ? 'near' : 'medium');
        } else {
          stCtx.objectActivity.set(o.id, d <= cfg.farProxyRadius ? 'far' : 'unloaded');
        }
      });

      // Occlusion Culling por occlusionVolumes
      stCtx.culledObjectIds.clear();
      var occVols = stCtx.occVols || [];
      if (cfg.enableOcclusionCulling && occVols.length > 0) {
        objs.forEach(function (o) {
          if (!o.visible || o.type !== 'mesh_3d') return;
          var act = stCtx.objectActivity.get(o.id) || 'near';
          if (act === 'far' || act === 'unloaded') return;
          var m3o = o.source && o.source.mesh3d;
          if (m3o && (m3o.shape === 'terrain' || m3o.shape === 'plane' || m3o.shape === 'water')) return;
          var odx = o.t3.x - camPos.posX, ody = o.t3.y - camPos.posY, odz = o.t3.z - camPos.posZ;
          var oDist = Math.hypot(odx, ody, odz);
          if (oDist < 4) return;
          for (var vi = 0; vi < occVols.length; vi++) {
            var b = occVols[vi].bounds;
            if (!b || occVols[vi].kind !== 'occluder') continue;
            if (camPos.posX >= b.minX && camPos.posX <= b.maxX && camPos.posY >= b.minY && camPos.posY <= b.maxY && camPos.posZ >= b.minZ && camPos.posZ <= b.maxZ) continue;
            var hit = raycastSegmentAabb3DDetailed(camPos.posX, camPos.posY, camPos.posZ, odx, ody, odz, b.minX, b.maxX, b.minY, b.maxY, b.minZ, b.maxZ);
            if (hit && !hit.inside && hit.t > 0.02 && hit.t < 0.96) {
              stCtx.culledObjectIds.add(o.id);
              break;
            }
          }
        });
      }

      // Renderizar y orientar proxies HLOD reales (combinados + billboard)
      if (cfg.enableHlod) {
        stCtx.hlodProxies.forEach(function (proxy, cKey) {
          var isLoaded = stCtx.loadedChunks.has(cKey);
          var dCam = Math.hypot(proxy.centerX - camPos.posX, proxy.centerZ - camPos.posZ);
          var shouldShow = !isLoaded && dCam <= cfg.farProxyRadius;
          var vis = hlodProxyVisuals3D.get(cKey);
          if (!shouldShow && dCam > cfg.farProxyRadius * 1.15 && vis) {
            worldGroup.remove(vis.group);
            vis.dispose();
            hlodProxyVisuals3D.delete(cKey);
            return;
          }
          if (shouldShow && !vis) {
            vis = buildHlodProxyVisual3D(proxy);
            worldGroup.add(vis.group);
            hlodProxyVisuals3D.set(cKey, vis);
          }
          if (vis) {
            vis.group.visible = shouldShow;
            if (shouldShow && vis.billboardMesh) {
              vis.billboardMesh.rotation.y = Math.atan2(camPos.posX - proxy.centerX, camPos.posZ - proxy.centerZ);
            }
          }
        });
      }
    }

    function loadModel3DAsset(assetId, normSize, onLoaded) {
      var meta = assetMap.get(assetId);
      if (!meta) return;
      var pathStr = String(meta.path || meta.name || '').toLowerCase();
      var isFbx = meta.format === 'fbx' || /\\.fbx$/.test(pathStr);
      if (isFbx && fbxLoader) {
        fbxLoader.load(meta.path, function (fbxRoot) {
          var rawAnims = Array.isArray(fbxRoot.animations) ? fbxRoot.animations.slice() : [];
          var root = normSize !== false ? normalizeModelRoot3D(fbxRoot, normSize || 1.0) : fbxRoot;
          onLoaded({ root: root, animations: rawAnims });
        }, undefined, function (err) { console.warn('[NEXUS 3D FBX]', assetId, err); });
      } else if (gltfLoader) {
        gltfLoader.load(meta.path, function (gltf) {
          var rawAnims = Array.isArray(gltf.animations) ? gltf.animations.slice() : [];
          var sceneObj = gltf.scene || new THREE.Group();
          var root = normSize !== false ? normalizeModelRoot3D(sceneObj, normSize || 1.0) : sceneObj;
          onLoaded({ root: root, animations: rawAnims });
        }, undefined, function (err) { console.warn('[NEXUS 3D GLTF]', assetId, err); });
      }
    }

    function getWorldT3(o, objs) {
      var base = { x: o.t3.x, y: o.t3.y, z: o.t3.z, rx: o.t3.rx || 0, ry: o.t3.ry || 0, rz: o.t3.rz || 0, sx: o.t3.sx || 1, sy: o.t3.sy || 1, sz: o.t3.sz || 1 };
      var pid = o.source && o.source.parentId;
      var guard = 0;
      while (pid && guard < 8) {
        var par = objs.find(function (x) { return x.id === pid; });
        if (!par) break;
        var pRad = (par.t3.ry || 0) * DEG2RAD;
        var cos = Math.cos(pRad), sin = Math.sin(pRad);
        var lx = base.x * (par.t3.sx || 1), lz = base.z * (par.t3.sz || 1);
        base.x = (par.t3.x || 0) + lx * cos + lz * sin;
        base.y = (par.t3.y || 0) + base.y * (par.t3.sy || 1);
        base.z = (par.t3.z || 0) - lx * sin + lz * cos;
        base.ry += par.t3.ry || 0;
        base.sx *= par.t3.sx || 1;
        base.sy *= par.t3.sy || 1;
        base.sz *= par.t3.sz || 1;
        pid = par.source && par.source.parentId;
        guard++;
      }
      return base;
    }

    function resolvePlayer3d(objs) {
      return objs.find(function (o) {
        return o.visible && (o.source.components || []).some(function (c) {
          return c.enabled && (c.type === 'player_3d' || c.type === 'player_platformer' || c.type === 'player_topdown' || c.type === 'movement.platformer_pro' || c.type === 'movement.topdown_8dir');
        });
      }) || objs.find(function (o) {
        return o.visible && ((o.tags || []).some(function (t) { var l = String(t).toLowerCase(); return l === 'player' || l === 'jugador'; }) || String(o.name || '').toLowerCase() === 'player' || String(o.name || '').toLowerCase() === 'jugador');
      }) || null;
    }

    function applyRepeatsAndI18n3D(container) {
      if (!container) return;
      container.querySelectorAll('[data-nexus-i18n]').forEach(function (el) {
        if (el.__nxLastLocale === activeLocale3D) return;
        el.__nxLastLocale = activeLocale3D;
        var k = el.getAttribute('data-nexus-i18n');
        if (k) el.textContent = t3D(k);
      });
      container.querySelectorAll('[data-nexus-repeat]').forEach(function (el) {
        var tRef = el.getAttribute('data-nexus-repeat');
        var rows = queryDataTable3D(tRef);
        if (!Array.isArray(rows)) return;
        if (!el.__nxTplHtml) {
          var rowEl = el.querySelector('[data-nexus-row]') || el.firstElementChild;
          el.__nxTplHtml = rowEl ? rowEl.outerHTML : '<div>{{name}}</div>';
        }
        var sig = activeLocale3D + ':' + JSON.stringify(rows);
        if (el.__nxLastSig === sig) return;
        el.__nxLastSig = sig;
        el.innerHTML = rows.map(function (r) {
          return el.__nxTplHtml.replace(/@t\\(([^)]+)\\)/g, function (_m, k) { return t3D(String(k).trim()); })
            .replace(/\\{\\{([a-zA-Z0-9_.-]+)\\}\\}/g, function (_m, c) { return r[c] !== undefined && r[c] !== null ? String(r[c]) : ''; });
        }).join('');
      });
    }

    var lastWidgetRefreshAt = 0;
    var lastWidgetRefreshSig = '';
    function refreshWidgetsDom(force) {
      if (!activeSim) return;
      var nowW = typeof performance !== 'undefined' ? performance.now() : Date.now();
      var dynArrCheck = activeSim.dynamicWidgets || [];
      var varSig = activeLocale3D + '|' + dynArrCheck.length + '|';
      activeSim.variables.forEach(function (vv, vk) { varSig += vk + '=' + vv + ';'; });
      if (!force && varSig === lastWidgetRefreshSig && (nowW - lastWidgetRefreshAt) < 250) return;
      lastWidgetRefreshSig = varSig;
      lastWidgetRefreshAt = nowW;
      applyRepeatsAndI18n3D(widgetsHost);
      applyRepeatsAndI18n3D(dynWidgetsHost);
      widgetsHost.querySelectorAll('[data-nexus-var], [data-nexus-progress]').forEach(function (el) {
        var vn = el.getAttribute('data-nexus-var');
        if (vn && activeSim.variables.has(vn)) el.textContent = String(activeSim.variables.get(vn));
        var prog = el.getAttribute('data-nexus-progress');
        if (prog) {
          var parts = prog.split('/');
          var val = Number(activeSim.variables.get(parts[0]) || 0);
          var max = Math.max(1, Number(parts[1] || 100));
          el.style.width = Math.max(0, Math.min(100, (val / max) * 100)) + '%';
        }
      });
      if (hudScoreBox && scoreSpan) {
        var pts = Number(activeSim.variables.get('puntos') || 0);
        hudScoreBox.classList.toggle('hidden', pts === 0);
        scoreSpan.textContent = String(pts);
      }
      var dynArr = activeSim.dynamicWidgets || [];
      var dynKey = dynArr.map(function (w) { return w.id + '|' + w.visible + '|' + w.x + '|' + w.y + '|' + w.html; }).join(';;');
      if (dynWidgetsHost.__lastKey !== dynKey) {
        dynWidgetsHost.__lastKey = dynKey;
        dynWidgetsHost.innerHTML = '';
        var dynCss = '';
        dynArr.forEach(function (dw) {
          if (!dw.visible) return;
          if (dw.css) dynCss += scopeWidgetCss(dw.css, dw.id) + '\\n';
          var dEl = document.createElement('div');
          dEl.setAttribute('data-nx-widget', dw.id);
          dEl.style.cssText = 'position:absolute;left:' + (dw.x || 24) + 'px;top:' + (dw.y || 24) + 'px;pointer-events:auto;z-index:35;';
          dEl.innerHTML = String(dw.html || '').replace(/@t\\(([^)]+)\\)/g, function (_m, k) { return t3D(String(k).trim()); });
          dynWidgetsHost.appendChild(dEl);
        });
        var dynStyle = document.getElementById('nx-dyn-widgets-style');
        if (dynCss) {
          if (!dynStyle) {
            dynStyle = document.createElement('style');
            dynStyle.id = 'nx-dyn-widgets-style';
            document.head.appendChild(dynStyle);
          }
          dynStyle.textContent = dynCss;
        } else if (dynStyle) {
          dynStyle.textContent = '';
        }
      }
      var toasts = activeSim.activeToasts || [];
      var tKey = toasts.map(function (t) { return t.id + ':' + t.text; }).join('|');
      if (toastHost.__lastKey !== tKey) {
        toastHost.__lastKey = tKey;
        toastHost.innerHTML = '';
        toasts.forEach(function (t) {
          var badge = document.createElement('div');
          badge.style.cssText = 'background:rgba(15,23,42,0.92);color:#f8fafc;border:1px solid rgba(56,189,248,0.45);border-radius:10px;padding:7px 14px;font:600 13px/1.3 sans-serif;box-shadow:0 6px 20px rgba(0,0,0,0.45);';
          badge.textContent = t.text;
          toastHost.appendChild(badge);
        });
      }
    }

    function setWidgetDisplay3D(target, op) {
      var el = widgetsHost.querySelector('[data-nx-widget="' + target + '"]') || dynWidgetsHost.querySelector('[data-nx-widget="' + target + '"]');
      if (!el && currentScene) {
        var f = (currentScene.objects || []).find(function (o) { return o.type === 'ui_widget' && o.name === target; });
        if (f) el = widgetsHost.querySelector('[data-nx-widget="' + f.id + '"]');
      }
      if (!el) return;
      if (op === 'open') el.style.display = 'block';
      else if (op === 'close') el.style.display = 'none';
      else el.style.display = el.style.display === 'none' ? 'block' : 'none';
    }

    function mountSceneWidgets(sceneObj) {
      widgetsHost.innerHTML = '';
      var styleOld = document.getElementById('nx-widgets-style');
      if (styleOld) styleOld.remove();
      var styleEl = document.createElement('style');
      styleEl.id = 'nx-widgets-style';
      var cssAcc = '';

      (sceneObj.objects || []).forEach(function (o) {
        if (o.type !== 'ui_widget' || !o.uiWidget) return;
        var w = o.uiWidget;
        cssAcc += scopeWidgetCss(w.css || '', o.id) + '\\n';
        var wrap = document.createElement('div');
        wrap.setAttribute('data-nx-widget', o.id);
        wrap.style.cssText = 'position:absolute;left:' + o.transform.x + 'px;top:' + o.transform.y + 'px;width:' + o.transform.width + 'px;height:' + o.transform.height + 'px;pointer-events:' + (w.interactive !== false ? 'auto' : 'none') + ';z-index:' + (w.zIndex || 25) + ';display:' + (o.visible && w.visibleAtStart !== false ? 'block' : 'none') + ';';
        wrap.innerHTML = String(w.html || '').replace(/@t\\(([^)]+)\\)/g, function (_m, k) { return t3D(String(k).trim()); });
        wrap.addEventListener('click', function (ev) {
          var tgt = ev.target && ev.target.closest ? ev.target.closest('[data-nexus-action]') : null;
          if (!tgt) return;
          var act = tgt.getAttribute('data-nexus-action') || '';
          var prm = tgt.getAttribute('data-nexus-param') || '';
          var val = tgt.getAttribute('data-nexus-value') || '';
          if (act === 'pause.toggle') setPaused(!paused);
          else if (act === 'ui.closeSelf') wrap.style.display = 'none';
          else if (act === 'scene.restart') loadScene3D(currentScene.id);
          else if (act === 'scene.load') loadScene3D(prm);
          else if (act === 'audio.play') playSfx(prm || 'coin', Number(val || 0.8));
          else if (act === 'var.add' && activeSim) activeSim.variables.set(prm, Number(activeSim.variables.get(prm) || 0) + Number(val || 1));
          else if (act === 'var.set' && activeSim) activeSim.variables.set(prm, isNaN(Number(val)) ? val : Number(val));
          else if (act === 'event.emit' && activeSim) activeSim.queuedEvents.push(prm);
          else if (act === 'dialogue.start') startDialogue3D(prm);
          refreshWidgetsDom();
        });
        wrap.querySelectorAll('input[data-nexus-audio-bus]').forEach(function (inp) {
          var bus = inp.getAttribute('data-nexus-audio-bus');
          if (audioBuses[bus] !== undefined) inp.value = String(audioBuses[bus]);
          inp.addEventListener('input', function () {
            audioBuses[bus] = Number(inp.value);
            if (currentMusic && bus === 'music') currentMusic.gain.gain.value = currentMusic.vol * channelGain('music');
          });
        });
        widgetsHost.appendChild(wrap);
      });
      styleEl.textContent = cssAcc;
      document.head.appendChild(styleEl);
    }

    function evalEasing3D(easing, t) {
      var x = Math.max(0, Math.min(1, t));
      if (easing === 'easeIn') return x * x * x;
      if (easing === 'easeOut') return 1 - Math.pow(1 - x, 3);
      if (easing === 'easeInOut') return x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2;
      if (easing === 'bounce') {
        var n1 = 7.5625, d1 = 2.75;
        if (x < 1 / d1) return n1 * x * x;
        if (x < 2 / d1) { var y1 = x - 1.5 / d1; return n1 * y1 * y1 + 0.75; }
        if (x < 2.5 / d1) { var y2 = x - 2.25 / d1; return n1 * y2 * y2 + 0.9375; }
        var y3 = x - 2.625 / d1;
        return n1 * y3 * y3 + 0.984375;
      }
      return x;
    }

    function getParticleDefaults3D(preset) {
      var map = {
        fire: { rate: 30, maxParticles: 100, speedMin: 40, speedMax: 110, angleDeg: -90, spreadDeg: 36, gravity: -40, sizeStart: 0.38, sizeEnd: 0.08, lifetime: 0.65, colorStart: '#facc15', colorEnd: '#ef4444', alphaStart: 0.9, alphaEnd: 0 },
        smoke: { rate: 16, maxParticles: 80, speedMin: 20, speedMax: 55, angleDeg: -90, spreadDeg: 45, gravity: -20, sizeStart: 0.34, sizeEnd: 0.72, lifetime: 1.2, colorStart: '#94a3b8', colorEnd: '#334155', alphaStart: 0.55, alphaEnd: 0 },
        sparks: { rate: 36, maxParticles: 120, speedMin: 120, speedMax: 260, angleDeg: -90, spreadDeg: 140, gravity: 340, sizeStart: 0.24, sizeEnd: 0.04, lifetime: 0.5, colorStart: '#fef08a', colorEnd: '#f97316', alphaStart: 1, alphaEnd: 0 },
        magic: { rate: 24, maxParticles: 90, speedMin: 25, speedMax: 80, angleDeg: 0, spreadDeg: 360, gravity: -15, sizeStart: 0.3, sizeEnd: 0.05, lifetime: 0.9, colorStart: '#c084fc', colorEnd: '#38bdf8', alphaStart: 0.95, alphaEnd: 0 },
        explosion: { rate: 60, maxParticles: 140, speedMin: 90, speedMax: 280, angleDeg: 0, spreadDeg: 360, gravity: 120, sizeStart: 0.44, sizeEnd: 0.06, lifetime: 0.45, colorStart: '#fde047', colorEnd: '#dc2626', alphaStart: 1, alphaEnd: 0 },
        liquid: { rate: 38, maxParticles: 160, speedMin: 55, speedMax: 160, angleDeg: -90, spreadDeg: 140, gravity: 480, sizeStart: 0.32, sizeEnd: 0.08, lifetime: 0.72, colorStart: '#38bdf8', colorEnd: '#0284c7', alphaStart: 0.9, alphaEnd: 0.1, particleShape: 'liquid' },
        waterfall: { rate: 55, maxParticles: 200, speedMin: 70, speedMax: 150, angleDeg: 90, spreadDeg: 28, gravity: 520, sizeStart: 0.36, sizeEnd: 0.14, lifetime: 0.88, colorStart: '#bae6fd', colorEnd: '#0ea5e9', alphaStart: 0.85, alphaEnd: 0.05, emitterShape: 'box', particleShape: 'liquid' },
        ripple: { rate: 12, maxParticles: 48, speedMin: 4, speedMax: 14, angleDeg: 0, spreadDeg: 360, gravity: 0, sizeStart: 0.25, sizeEnd: 1.25, lifetime: 0.78, colorStart: '#e0f2fe', colorEnd: '#38bdf8', alphaStart: 0.75, alphaEnd: 0, particleShape: 'ring' }
      };
      return map[preset] || map.sparks;
    }

    function sampleVfxCurve3D(curve, t, fallbackStart, fallbackEnd) {
      var clamped = Math.max(0, Math.min(1, t));
      if (curve && curve.length >= 2) {
        var scaled = clamped * (curve.length - 1);
        var i0 = Math.min(curve.length - 2, Math.floor(scaled));
        var f = scaled - i0;
        var v0 = curve[i0] !== undefined ? curve[i0] : 1;
        var v1 = curve[i0 + 1] !== undefined ? curve[i0 + 1] : v0;
        return fallbackStart * (v0 + (v1 - v0) * f);
      }
      return fallbackStart + (fallbackEnd - fallbackStart) * clamped;
    }

    function burstParticles3D(x, y, z, count, cfg) {
      var col = (cfg && cfg.colorStart) || '#fbbf24';
      var colEnd = (cfg && cfg.colorEnd) || col;
      var sMin = (cfg && cfg.speedMin !== undefined ? cfg.speedMin : 30) * 0.04;
      var sMax = (cfg && cfg.speedMax !== undefined ? cfg.speedMax : 90) * 0.04;
      var sz = Math.max(0.08, (cfg && cfg.sizeStart) || 0.4);
      var szEnd = cfg && cfg.sizeEnd !== undefined ? Math.max(0.02, cfg.sizeEnd) : 0.06;
      var life = Math.max(0.15, (cfg && cfg.lifetime) || 0.65);
      var eShape = (cfg && cfg.emitterShape) || 'point';
      var eRad = Math.max(0, (cfg && cfg.emitterRadius) !== undefined ? cfg.emitterRadius : 0.45);
      var pShape = (cfg && cfg.particleShape) || (cfg && (cfg.preset === 'liquid' || cfg.preset === 'waterfall') ? 'liquid' : cfg && cfg.preset === 'ripple' ? 'ring' : 'circle');
      var aStart = cfg && cfg.alphaStart !== undefined ? cfg.alphaStart : (cfg && cfg.blendAlpha !== undefined ? cfg.blendAlpha : 0.9);
      var aEnd = cfg && cfg.alphaEnd !== undefined ? cfg.alphaEnd : 0;
      var texAssetId = cfg && (cfg.assetId || cfg.textureAssetId);
      var customTex = null;
      if (texAssetId && assetMap.has(texAssetId)) {
        customTex = particleTexCache.get(texAssetId) || null;
        if (!customTex) {
          customTex = texLoader.load(assetMap.get(texAssetId).path);
          customTex.colorSpace = THREE.SRGBColorSpace;
          particleTexCache.set(texAssetId, customTex);
        }
      }
      for (var i = 0; i < count && particles3D.length < 220; i++) {
        var a = Math.random() * Math.PI * 2;
        var sp = sMin + Math.random() * Math.max(0.2, sMax - sMin);
        var ox = 0, oy = 0, oz = 0;
        if (eShape === 'ring') { var ra = Math.random() * Math.PI * 2; ox = Math.cos(ra) * eRad; oz = Math.sin(ra) * eRad; }
        else if (eShape === 'sphere') { var sa = Math.random() * Math.PI * 2, sr = Math.sqrt(Math.random()) * eRad; ox = Math.cos(sa) * sr; oy = (Math.random() - 0.5) * sr; oz = Math.sin(sa) * sr; }
        else if (eShape === 'box') { ox = (Math.random() - 0.5) * eRad * 2; oy = (Math.random() - 0.5) * eRad * 2; oz = (Math.random() - 0.5) * eRad * 2; }
        var pm;
        if (customTex) {
          var spMat = new THREE.SpriteMaterial({
            map: customTex,
            color: col,
            transparent: true,
            opacity: aStart,
            depthWrite: false,
            blending: cfg && cfg.additive ? THREE.AdditiveBlending : THREE.NormalBlending
          });
          pm = new THREE.Sprite(spMat);
        } else {
          var pMat = new THREE.MeshBasicMaterial({ color: col, transparent: true, opacity: aStart });
          pm = new THREE.Mesh(particleSharedGeo, pMat);
        }
        pm.position.set(x + ox, y + oy, z + oz);
        pm.scale.set(sz, pShape === 'liquid' ? sz * 1.45 : pShape === 'ring' ? sz * 0.25 : sz, sz);
        particleGroup.add(pm);
        particles3D.push({
          mesh: pm, vx: Math.cos(a) * sp, vy: 1.5 + Math.random() * sp, vz: Math.sin(a) * sp,
          age: 0, maxAge: life, sizeStart: sz, sizeEnd: szEnd, colorStart: col, colorEnd: colEnd,
          alphaStart: aStart, alphaEnd: aEnd, drag: Math.max(0, (cfg && cfg.drag) || 0),
          turbulence: Math.max(0, (cfg && cfg.turbulence) || 0), particleShape: pShape,
          sizeCurve: cfg && cfg.sizeCurve, alphaCurve: cfg && cfg.alphaCurve, speedCurve: cfg && cfg.speedCurve
        });
      }
    }

    function loadScene3D(idOrName) {
      var target = scenes.find(function (s) { return s.id === idOrName || s.name === idOrName; }) || scenes[0];
      if (!target) return;
      currentScene = cloneData(target);
      clearAllStreamingResources3D();
      currentActiveDpr3D = software ? 1 : Math.min(window.devicePixelRatio || 1, getMaxDpr3D(currentScene));
      webgl.setPixelRatio(currentActiveDpr3D);
      resizeRenderer();
      while (worldGroup.children.length > 0) worldGroup.remove(worldGroup.children[0]);
      while (particleGroup.children.length > 0) particleGroup.remove(particleGroup.children[0]);
      if (currentScene.worldStreaming && currentScene.worldStreaming.enabled) {
        activeStreamState3D = buildStreamingContext3D(currentScene);
      }
      nodeMap3d.clear();
      meshBindings.clear();
      loadedRoots3D.clear();
      lodBindings3D.clear();
      pendingBoneSockets3D = [];
      lastFadeOpacity3D.clear();
      hpBarsHost3D.innerHTML = '';
      activeDialogue3D = null;
      renderDialogueOverlay3D();
      lightBindings.clear();
      mixerMap.clear();
      waterBindings.clear();
      wakeTrails3D.clear();
      ripplePool3D = [];
      for (var riP = 0; riP < 24; riP++) {
        var rGeo = new THREE.RingGeometry(0.42, 0.54, 24);
        rGeo.rotateX(-Math.PI / 2);
        var rMat = new THREE.MeshBasicMaterial({ color: '#e0f2fe', transparent: true, opacity: 0, depthWrite: false, side: THREE.DoubleSide });
        var rMesh = new THREE.Mesh(rGeo, rMat);
        rMesh.visible = false;
        worldGroup.add(rMesh);
        ripplePool3D.push({ active: false, x: 0, y: 0, z: 0, age: 0, maxAge: 1.15, scale: 0.1, maxScale: 3.0, opacity: 0.85, mesh: rMesh });
      }
      foliageBindings.clear();
      softBodyMeshes.clear();
      vehicleWheelMeshes.clear();
      trimeshCache.clear();
      particles3D = [];

      var lt = currentScene.lighting || { ambientColor: '#b7c7e8', ambientIntensity: 0.48, smartBounce: true, bounceIntensity: 0.65, skyColor: '#8cb8ff', groundColor: '#2d2722', sunColor: '#fff5dd', sunIntensity: 1.45, fogEnabled: true, fogColor: currentScene.backgroundColor || '#131622', fogNear: 20, fogFar: 90 };
      var dnInit = lt.dayNightEnabled ? computeDayNightLighting(lt, lt.timeOfDay) : null;
      var skyState = dnInit || { zenithColor: lt.skyColor || '#1d4ed8', horizonColor: currentScene.backgroundColor || '#8cb8ff', sunColor: lt.sunColor || '#fff5dd', sunIntensity: lt.sunIntensity !== undefined ? lt.sunIntensity : 1.45, ambientColor: lt.ambientColor || '#b7c7e8', ambientIntensity: lt.ambientIntensity !== undefined ? lt.ambientIntensity : 0.48, fogColor: lt.fogColor || currentScene.backgroundColor || '#131622', sunPosition: [16, 28, 14] };

      threeScene.background = new THREE.Color(skyState.horizonColor);
      threeScene.fog = lt.fogEnabled ? new THREE.Fog(skyState.fogColor, lt.fogNear || 20, lt.fogFar || 90) : null;
      if (lt.skyDomeAssetId && assetMap.has(lt.skyDomeAssetId)) {
        texLoader.load(assetMap.get(lt.skyDomeAssetId).path, function (skyTex) {
          skyTex.mapping = THREE.EquirectangularReflectionMapping;
          skyTex.colorSpace = THREE.SRGBColorSpace;
          threeScene.background = skyTex;
          threeScene.environment = skyTex;
          if (skyRef && skyRef.mesh) skyRef.mesh.visible = false;
        });
      }
      skyRef = createSkyDomeMesh(skyState.zenithColor, skyState.horizonColor, lt.cloudsEnabled !== false);
      worldGroup.add(skyRef.mesh);

      ambientLightRef = new THREE.AmbientLight(skyState.ambientColor, skyState.ambientIntensity);
      worldGroup.add(ambientLightRef);
      if (lt.smartBounce !== false) worldGroup.add(new THREE.HemisphereLight(lt.skyColor || '#8cb8ff', lt.groundColor || '#2d2722', lt.bounceIntensity || 0.65));
      sunLightRef = new THREE.DirectionalLight(skyState.sunColor, skyState.sunIntensity);
      sunLightRef.position.set(skyState.sunPosition[0], skyState.sunPosition[1], skyState.sunPosition[2]);
      if (!software) { sunLightRef.castShadow = true; sunLightRef.shadow.mapSize.set(1024, 1024); }
      worldGroup.add(sunLightRef);
      worldGroup.add(particleGroup);

      var hasInfHorizon = (currentScene.objects || []).some(function (o) {
        return o.visible && o.type === 'mesh_3d' && o.mesh3d && o.mesh3d.shape === 'terrain' && o.mesh3d.terrainData && o.mesh3d.terrainData.infiniteHorizon;
      });
      if (hasInfHorizon) {
        var infGeo = new THREE.PlaneGeometry(900, 900);
        infGeo.rotateX(-Math.PI / 2);
        var infMesh = new THREE.Mesh(infGeo, new THREE.MeshStandardMaterial({ color: '#1b4332', roughness: 0.94, metalness: 0.02 }));
        infMesh.position.y = -0.18;
        infMesh.receiveShadow = !software;
        worldGroup.add(infMesh);
      }

      if (currentScene.backgroundMusic && currentScene.backgroundMusic.assetId && currentScene.backgroundMusic.autoPlay !== false) {
        playMusic(currentScene.backgroundMusic.assetId, currentScene.backgroundMusic.volume, currentScene.backgroundMusic.loop);
      }

      var obstaclePts = [];
      (currentScene.objects || []).forEach(function (src) {
        if (src.visible && src.type === 'mesh_3d' && src.mesh3d && src.mesh3d.shape !== 'terrain' && src.mesh3d.shape !== 'water' && src.mesh3d.shape !== 'plane' && src.mesh3d.shape !== 'grass_field' && (!src.physics3d || src.physics3d.bodyType === 'static')) {
          var t = src.transform3d || { x: 0, y: 0, z: 0 };
          obstaclePts.push(new THREE.Vector3(t.x, t.y, t.z));
        }
      });

      var softBodySims = new Map();
      var vehicleSims = new Map();

      function attachNode3D(src, node) {
        nodeMap3d.set(src.id, node);
        var pid = src.parentId;
        if (pid && pid !== src.id && nodeMap3d.has(pid)) nodeMap3d.get(pid).add(node);
        else worldGroup.add(node);
      }

      if (activeSim && activeSim.mpSocket) {
        try { activeSim.mpSocket.close(); } catch (_) {}
        activeSim.mpSocket = null;
      }

      function mountObject3DInstance(src, obsPts, sbSims, vehSims) {
        var t3 = src.transform3d ? cloneData(src.transform3d) : { x: 0, y: 1, z: 0, rx: 0, ry: 0, rz: 0, sx: 1, sy: 1, sz: 1 };
        var hpComp = (src.components || []).find(function (c) { return c.enabled && (c.type === 'health' || c.type === 'combat.health_system'); });
        var initMaxHp = hpComp && hpComp.config && hpComp.config.maxHp !== undefined ? Math.max(1, Number(hpComp.config.maxHp)) : 100;
        var st = { id: src.id, name: src.name, type: src.type, visible: src.visible, layer: src.layer || 'Default', tags: Array.isArray(src.tags) ? src.tags.slice() : [], t3: t3, originT3: cloneData(t3), vx: 0, vy: 0, vz: 0, isGrounded: false, coyoteTimer: 0, jumpBufferTimer: 0, jumpsUsed: 0, dashTimer: 0, dashCooldownTimer: 0, patrolPhase: 0, waypointIndex: 0, waypointForward: true, invulnTimer: 0, hp: initMaxHp, maxHp: initMaxHp, _prevHp: undefined, alertTimer: 0, lastKnownTarget: null, currentAnimState: '', activeClip: '', activeAnimAssetId: null, animTimeScale: 1, animLoopMode: 'LoopRepeat', animProgress: 0, animFinished: false, blendDuration: 0.25, navPath: [], navTimer: 0, source: src };
        if (src.boneSocket && src.boneSocket.boneName && src.parentId) {
          pendingBoneSockets3D.push({ childId: src.id, parentId: src.parentId, obj: src });
        }

        if (src.type === 'container' || src.type === 'camera_3d') {
          var cGrp = new THREE.Group();
          attachNode3D(src, cGrp);
          meshBindings.set(src.id, cGrp);
        } else if (src.type === 'mesh_3d') {
          var m3 = src.mesh3d || { shape: 'box', color: '#3b82f6', metalness: 0.2, roughness: 0.65, castShadow: true, receiveShadow: true };
          if (m3.shape === 'water' && m3.waterConfig) {
            var wb = createWaterSurfaceMesh(m3.waterConfig, obsPts);
            wb.mesh.position.set(t3.x, t3.y, t3.z);
            attachNode3D(src, wb.mesh);
            meshBindings.set(src.id, wb.mesh);
            waterBindings.set(src.id, wb);
          } else if (m3.shape === 'grass_field' && m3.foliageConfig) {
            var fCfg = m3.foliageConfig;
            var folHolder = new THREE.Group();
            var fb = createWindFoliageInstancedMesh(fCfg);
            folHolder.add(fb.mesh);
            attachNode3D(src, folHolder);
            meshBindings.set(src.id, folHolder);
            foliageBindings.set(src.id, fb);
            if (fCfg.modelAssetId && assetMap.has(fCfg.modelAssetId) && fCfg.instances && fCfg.instances.length > 0) {
              loadModel3DAsset(fCfg.modelAssetId, 1.0, function (loadedF) {
                var protoMesh = null;
                loadedF.root.traverse(function (ch) { if (!protoMesh && ch.isMesh) protoMesh = ch; });
                if (!protoMesh) return;
                var instMesh = new THREE.InstancedMesh(protoMesh.geometry, protoMesh.material, fCfg.instances.length);
                instMesh.castShadow = m3.castShadow !== false && !software;
                instMesh.receiveShadow = m3.receiveShadow !== false && !software;
                var dummyMat = new THREE.Matrix4(), qTilt = new THREE.Quaternion(), qSpin = new THREE.Quaternion(), qTot = new THREE.Quaternion();
                var upV = new THREE.Vector3(0, 1, 0), normV = new THREE.Vector3(0, 1, 0), posV = new THREE.Vector3(), scV = new THREE.Vector3();
                var refObjs = activeSim ? activeSim.objects : [];
                fCfg.instances.forEach(function (it, idx) {
                  posV.set(it.x, it.y, it.z);
                  qSpin.setFromAxisAngle(upV, it.rotY || 0);
                  if (fCfg.alignToNormal !== false && refObjs.length > 0) {
                    var hL = groundHeightAt(refObjs, it.x - 0.35, it.z), hR = groundHeightAt(refObjs, it.x + 0.35, it.z);
                    var hD = groundHeightAt(refObjs, it.x, it.z - 0.35), hU = groundHeightAt(refObjs, it.x, it.z + 0.35);
                    normV.set(hL - hR, 0.7, hD - hU).normalize();
                    qTilt.setFromUnitVectors(upV, normV);
                    qTot.multiplyQuaternions(qTilt, qSpin);
                  } else { qTot.copy(qSpin); }
                  var scVal = Math.max(0.2, it.scale || 1);
                  scV.set(scVal, scVal, scVal);
                  dummyMat.compose(posV, qTot, scV);
                  instMesh.setMatrixAt(idx, dummyMat);
                });
                instMesh.instanceMatrix.needsUpdate = true;
                folHolder.remove(fb.mesh);
                folHolder.add(instMesh);
              });
            }
          } else if (m3.shape === 'glb' && m3.glbAssetId && assetMap.has(m3.glbAssetId)) {
            var grp = new THREE.Group();
            function hydrateGlbInstance3D(onDone) {
              var cancelledGlb = false;
              var mountedRootRef = null;
              var mountedLodRef = null;
              loadModel3DAsset(m3.glbAssetId, 1.0, function (loaded) {
                if (cancelledGlb) { disposeObject3DTree3D(loaded.root); if (onDone) onDone(function () {}); return; }
                mountedRootRef = loaded.root;
                var meshCnt = 0, boneCnt = 0;
                loaded.root.traverse(function (ch) {
                  if (ch.isBone) boneCnt++;
                  if (ch.isMesh) {
                    meshCnt++;
                    ch.castShadow = m3.castShadow !== false && !software;
                    ch.receiveShadow = m3.receiveShadow !== false && !software;
                    ch.frustumCulled = src.optimization && src.optimization.frustumCulling !== undefined ? src.optimization.frustumCulling : true;
                  }
                });
                if (meshCnt === 0 && boneCnt > 0) grp.add(new THREE.SkeletonHelper(loaded.root));
                grp.add(loaded.root);
                loadedRoots3D.set(src.id, loaded.root);
                if (src.optimization && src.optimization.lodEnabled && src.optimization.lodAssetId && assetMap.has(src.optimization.lodAssetId)) {
                  loadModel3DAsset(src.optimization.lodAssetId, 1.0, function (lodRes) {
                    if (cancelledGlb) { disposeObject3DTree3D(lodRes.root); return; }
                    mountedLodRef = lodRes.root;
                    lodRes.root.visible = false;
                    grp.add(lodRes.root);
                    lodBindings3D.set(src.id, { high: loaded.root, low: lodRes.root, dist: Math.max(5, src.optimization.lodDistance || 35), usingLow: false });
                  });
                }
                var p3Src = src.physics3d;
                var needsTriCam = (p3Src && p3Src.shape === 'mesh_exact') || m3.shape === 'arch' || ((!p3Src || p3Src.bodyType !== 'dynamic') && (!p3Src || p3Src.cameraCollision !== 'never'));
                if (needsTriCam) {
                  grp.position.set(t3.x, t3.y, t3.z);
                  grp.rotation.set(t3.rx * DEG2RAD, t3.ry * DEG2RAD, t3.rz * DEG2RAD);
                  grp.scale.set(t3.sx, t3.sy, t3.sz);
                  trimeshCache.set(src.id, extractTrimeshFromObject3D(grp));
                }
                var extraIds = Array.from(new Set((src.animStateMachine && src.animStateMachine.states ? src.animStateMachine.states : []).map(function (s) { return s.assetId; }).filter(function (id) { return id && id !== m3.glbAssetId && assetMap.has(id); })));
                if ((loaded.animations && loaded.animations.length > 0) || extraIds.length > 0) {
                  var mixer = new THREE.AnimationMixer(loaded.root);
                  var am = new Map();
                  loaded.animations.forEach(function (cl) {
                    var act = mixer.clipAction(cl);
                    am.set(cl.name, act);
                    am.set(m3.glbAssetId + ':' + cl.name, act);
                    if (!am.has('__asset_first__:' + m3.glbAssetId)) am.set('__asset_first__:' + m3.glbAssetId, act);
                  });
                  var initKey = (st.activeAnimAssetId || '') + ':' + (st.activeClip || (loaded.animations[0] ? loaded.animations[0].name : ''));
                  var initAct = (st.activeAnimAssetId && st.activeClip && am.get(initKey)) || (st.activeClip && am.get(st.activeClip)) || (st.activeAnimAssetId && am.get('__asset_first__:' + st.activeAnimAssetId)) || (loaded.animations[0] ? am.get(loaded.animations[0].name) : null);
                  if (initAct) {
                    var loopKind = st.animLoopMode === 'LoopOnce' ? THREE.LoopOnce : st.animLoopMode === 'LoopPingPong' ? THREE.LoopPingPong : THREE.LoopRepeat;
                    initAct.setLoop(loopKind, st.animLoopMode === 'LoopOnce' ? 1 : Infinity);
                    initAct.clampWhenFinished = st.animLoopMode === 'LoopOnce';
                    initAct.timeScale = st.animTimeScale || 1;
                    initAct.reset().play();
                  }
                  var mixerEntry = { mixer: mixer, actions: am, activeKey: initAct ? initKey : null, activeAction: initAct || null };
                  mixerMap.set(src.id, mixerEntry);
                  extraIds.forEach(function (eid) {
                    loadModel3DAsset(eid, false, function (eg) {
                      if (cancelledGlb) return;
                      (eg.animations || []).forEach(function (rawEcl) {
                        var ecl = retargetClipForRoot3D(rawEcl, loaded.root);
                        var eAct = mixer.clipAction(ecl);
                        if (!am.has(ecl.name)) am.set(ecl.name, eAct);
                        am.set(eid + ':' + ecl.name, eAct);
                        if (!am.has('__asset_first__:' + eid)) am.set('__asset_first__:' + eid, eAct);
                      });
                      if (st.activeAnimAssetId === eid) mixerEntry.activeKey = null;
                    });
                  });
                }
                if (onDone) {
                  onDone(function () {
                    cancelledGlb = true;
                    var mxOld = mixerMap.get(src.id);
                    if (mxOld) { mxOld.mixer.stopAllAction(); mixerMap.delete(src.id); }
                    lodBindings3D.delete(src.id);
                    loadedRoots3D.delete(src.id);
                    if (mountedRootRef) { grp.remove(mountedRootRef); disposeObject3DTree3D(mountedRootRef); mountedRootRef = null; }
                    if (mountedLodRef) { grp.remove(mountedLodRef); disposeObject3DTree3D(mountedLodRef); mountedLodRef = null; }
                    while (grp.children.length > 0) { var chG = grp.children[0]; grp.remove(chG); disposeObject3DTree3D(chG); }
                  });
                }
              });
            }
            if (currentScene.worldStreaming && currentScene.worldStreaming.enabled) {
              var gList = streamedGlbTargets3D.get(m3.glbAssetId) || [];
              gList.push({ hydrate: hydrateGlbInstance3D });
              streamedGlbTargets3D.set(m3.glbAssetId, gList);
            } else {
              hydrateGlbInstance3D(null);
            }
            attachNode3D(src, grp);
            meshBindings.set(src.id, grp);
          } else {
            var isTerrain = m3.shape === 'terrain';
            var pbrGeo = buildModularGeometry(m3);
            var ccVal = m3.clearcoat !== undefined ? m3.clearcoat : 0;
            var transVal = software ? 0 : (m3.transmission !== undefined ? m3.transmission : 0);
            var matOpts = {
              color: isTerrain || (m3.shape === 'plane' && !m3.textureAssetId) ? '#ffffff' : (m3.color || '#3b82f6'),
              vertexColors: isTerrain,
              metalness: isTerrain ? 0.04 : (m3.metalness !== undefined ? m3.metalness : 0.2),
              roughness: isTerrain ? 0.88 : (m3.roughness !== undefined ? m3.roughness : 0.65),
              emissive: m3.emissive ? new THREE.Color(m3.emissive) : new THREE.Color(0x000000),
              emissiveIntensity: m3.emissiveIntensity !== undefined ? m3.emissiveIntensity : 0,
              envMapIntensity: 1.15,
              transparent: (src.opacity !== undefined && src.opacity < 1) || transVal > 0,
              opacity: src.opacity !== undefined ? src.opacity : 1
            };
            var mat = (ccVal > 0 || transVal > 0) && THREE.MeshPhysicalMaterial
              ? new THREE.MeshPhysicalMaterial(Object.assign({}, matOpts, { clearcoat: ccVal, clearcoatRoughness: m3.clearcoatRoughness !== undefined ? m3.clearcoatRoughness : 0.12, transmission: transVal, ior: 1.48 }))
              : new THREE.MeshStandardMaterial(matOpts);
            function bindOrStreamTex3D(assetId, slot, isColor) {
              if (!assetId || !assetMap.has(assetId)) return;
              if (currentScene.worldStreaming && currentScene.worldStreaming.enabled) {
                var tList = streamedTexTargets3D.get(assetId) || [];
                tList.push({ mat: mat, slot: slot, isColor: isColor });
                streamedTexTargets3D.set(assetId, tList);
                return;
              }
              texLoader.load(assetMap.get(assetId).path, function (t) {
                if (isColor) t.colorSpace = THREE.SRGBColorSpace;
                mat[slot] = t;
                if (slot === 'aoMap') mat.aoMapIntensity = 0.9;
                mat.needsUpdate = true;
              });
            }
            if (m3.textureAssetId && assetMap.has(m3.textureAssetId)) {
              bindOrStreamTex3D(m3.textureAssetId, 'map', true);
            } else if (m3.shape === 'plane') {
              var gCan = document.createElement('canvas'); gCan.width = 256; gCan.height = 256;
              var gCtx = gCan.getContext('2d');
              if (gCtx) {
                gCtx.fillStyle = m3.color || '#334155'; gCtx.fillRect(0, 0, 256, 256);
                gCtx.fillStyle = 'rgba(255,255,255,0.04)'; gCtx.fillRect(0, 0, 128, 128); gCtx.fillRect(128, 128, 128, 128);
                gCtx.strokeStyle = 'rgba(148,163,184,0.22)'; gCtx.lineWidth = 2; gCtx.strokeRect(1, 1, 254, 254);
                var gTex = new THREE.CanvasTexture(gCan); gTex.colorSpace = THREE.SRGBColorSpace;
                gTex.wrapS = THREE.RepeatWrapping; gTex.wrapT = THREE.RepeatWrapping; gTex.repeat.set(14, 14);
                mat.map = gTex; mat.needsUpdate = true;
              }
            }
            bindOrStreamTex3D(m3.normalAssetId, 'normalMap', false);
            bindOrStreamTex3D(m3.roughnessAssetId, 'roughnessMap', false);
            bindOrStreamTex3D(m3.metalnessAssetId, 'metalnessMap', false);
            bindOrStreamTex3D(m3.emissiveAssetId, 'emissiveMap', true);
            if (m3.aoAssetId && assetMap.has(m3.aoAssetId)) {
              if (pbrGeo.attributes && pbrGeo.attributes.uv && !pbrGeo.attributes.uv2) pbrGeo.setAttribute('uv2', pbrGeo.attributes.uv);
              bindOrStreamTex3D(m3.aoAssetId, 'aoMap', false);
            }
            var mesh = new THREE.Mesh(pbrGeo, mat);
            mesh.castShadow = m3.castShadow !== false && !software;
            mesh.receiveShadow = m3.receiveShadow !== false && !software;
            mesh.frustumCulled = src.optimization && src.optimization.frustumCulling !== undefined ? src.optimization.frustumCulling : true;
            attachNode3D(src, mesh);
            meshBindings.set(src.id, mesh);
          }

          if (src.softBody && src.softBody.enabled) {
            var sbSim = createSoftBodySimulation(src.softBody, t3.x, t3.y, t3.z);
            sbSims.set(src.id, sbSim);
            var sbGroup = new THREE.Group();
            var nodeGeo = new THREE.SphereGeometry(sbSim.radius, 8, 6);
            var nodeMat = new THREE.MeshStandardMaterial({ color: sbSim.color, roughness: 0.65 });
            var nMeshes = sbSim.nodes.map(function (nd) {
              var nm = new THREE.Mesh(nodeGeo, nodeMat);
              nm.position.set(nd.x, nd.y, nd.z);
              sbGroup.add(nm);
              return nm;
            });
            worldGroup.add(sbGroup);
            softBodyMeshes.set(src.id, nMeshes);
          }
        } else if (src.type === 'light_3d' && src.light3d) {
          var l3 = src.light3d;
          var holder = new THREE.Group();
          holder.position.set(t3.x, t3.y, t3.z);
          holder.rotation.set(t3.rx * DEG2RAD, t3.ry * DEG2RAD, t3.rz * DEG2RAD);
          var lo;
          if (l3.lightType === 'spot') {
            lo = new THREE.SpotLight(l3.color, l3.intensity, l3.distance || 35, l3.angleDeg ? l3.angleDeg * DEG2RAD : Math.PI / 5, l3.penumbra || 0.35, l3.decay || 1.5);
            lo.target.position.set(0, -1, 0);
            holder.add(lo); holder.add(lo.target);
          } else if (l3.lightType === 'directional') {
            lo = new THREE.DirectionalLight(l3.color, l3.intensity);
            lo.target.position.set(0, -1, 0);
            holder.add(lo); holder.add(lo.target);
          } else {
            lo = new THREE.PointLight(l3.color, l3.intensity, l3.distance || 25, l3.decay || 1.5);
            holder.add(lo);
          }
          attachNode3D(src, holder);
          meshBindings.set(src.id, holder);
          lightBindings.set(src.id, lo);
        }
        if (src.vehicle && src.vehicle.enabled) {
          var vSim = createVehicle4WState(t3.x, t3.y, t3.z, t3.ry || 0, src.vehicle);
          vehSims.set(src.id, vSim);
          var vKindInit = src.vehicle.vehicleKind || 'car';
          var vPartsInit = src.vehicle.parts;
          if ((vKindInit === 'car' || vKindInit === 'moto') && (!vPartsInit || !vPartsInit.wheelFL)) {
            var wRad = Math.max(0.18, src.vehicle.wheelRadius || 0.42);
            var wWid = Math.max(0.12, src.vehicle.wheelWidth || (vKindInit === 'moto' ? 0.22 : 0.3));
            var wGeo = new THREE.CylinderGeometry(wRad, wRad, wWid, 12);
            wGeo.rotateZ(Math.PI / 2);
            var wMat = new THREE.MeshStandardMaterial({ color: '#18181b', roughness: 0.75 });
            var wSlice = vKindInit === 'moto' ? [vSim.wheels[0], vSim.wheels[2]] : vSim.wheels;
            var wMeshes = wSlice.map(function (wh) {
              var wm = new THREE.Mesh(wGeo, wMat);
              wm.position.set(wh.worldX, wh.worldY, wh.worldZ);
              worldGroup.add(wm);
              return wm;
            });
            vehicleWheelMeshes.set(src.id, wMeshes);
          }
        }
        return st;
      }

      var simObjs = (currentScene.objects || []).map(function (src) {
        return mountObject3DInstance(src, obstaclePts, softBodySims, vehicleSims);
      });
      // Asegurar jerarquía padre-hijo aunque el padre haya aparecido después del hijo en scene.objects
      simObjs.forEach(function (so) {
        var node = nodeMap3d.get(so.id);
        if (!node) return;
        var pid = so.source.parentId;
        if (pid && pid !== so.id && nodeMap3d.has(pid)) {
          nodeMap3d.get(pid).add(node);
        } else if (node.parent !== worldGroup) {
          worldGroup.add(node);
        }
      });

      // Marcar partes animadas de vehículos compuestos (ruedas/hélices hijas)
      simObjs.forEach(function (so) {
        var pts = so.source && so.source.vehicle && so.source.vehicle.parts;
        if (!pts) return;
        [pts.wheelFL, pts.wheelFR, pts.wheelRL, pts.wheelRR, pts.propellerId].forEach(function (pid) {
          if (!pid) return;
          var pn = nodeMap3d.get(pid);
          if (pn) pn.userData.vehicleAnimatedPart = true;
        });
      });

      activeSim = {
        scene: currentScene,
        objects: simObjs,
        mountObject: mountObject3DInstance,
        attachNode3D: attachNode3D,
        variables: variables,
        queuedEvents: [],
        softBodySims: softBodySims,
        vehicleSims: vehicleSims,
        inWaterObjects: new Set(),
        waterTrackers: new Map(),
        splineProgress: new Map(),
        mountedActorId: null,
        mountedVehicleId: null,
        cameraFollowOverride3D: null,
        prevCollisions: new Set(),
        startedScriptBindings: new Set(),
        scriptObjectData: new Map(),
        scriptTweens: [],
        tweenStates3D: new Map(),
        dynamicWidgets: [],
        activeToasts: [],
        sunOverride: {},
        spawnCounter: 0,
        loggedScriptErrors: new Set(),
        mechanicTimers: new Map(),
        pendingWaits: [],
        elapsedTime: 0,
        started: false,
        dayClock: lt.timeOfDay !== undefined ? lt.timeOfDay : 12.5,
        shakeTimer: 0,
        shakeIntensity: 0,
        overrideCameraId: null,
        cameraManualLock: false,
        cameraBlend: null,
        cameraState: {
          activeCameraId: currentScene.cameraConfig && currentScene.cameraConfig.smartCamera && currentScene.cameraConfig.smartCamera.activeCameraId ? currentScene.cameraConfig.smartCamera.activeCameraId : null,
          posX: 0, posY: 7, posZ: 13,
          lookAtX: 0, lookAtY: 1, lookAtZ: 0,
          fov: (currentScene.cameraConfig && currentScene.cameraConfig.smartCamera && currentScene.cameraConfig.smartCamera.fov) || 55,
          orbitYawDeg: 0, orbitPitchDeg: -18,
          smoothWallT: 1,
          transitionFrom: null, transitionElapsed: 0, transitionDuration: 0
        },
        camPos: new THREE.Vector3(0, 7, 13),
        camLook: new THREE.Vector3(0, 1, 0),
        mpSocket: null,
        mpRemotes: new Map(),
        mpRoomId: (currentScene.multiplayer && currentScene.multiplayer.roomId) || 'sala_global',
        mpPlayerId: 'p3d_' + Math.random().toString(36).slice(2, 9),
        mpLastSend: 0
      };
      if (currentScene.multiplayer && currentScene.multiplayer.enabled && typeof WebSocket !== 'undefined' && typeof location !== 'undefined') {
        try {
          var mp3 = currentScene.multiplayer;
          var wsUrl3 = mp3.serverUrl || ((location.protocol === 'https:' ? 'wss:' : 'ws:') + '//' + location.host + '/ws/multiplayer');
          var ws3 = new WebSocket(wsUrl3);
          activeSim.mpSocket = ws3;
          ws3.addEventListener('open', function () {
            try {
              ws3.send(JSON.stringify({ type: 'join', roomId: activeSim.mpRoomId, playerId: activeSim.mpPlayerId, name: activeSim.mpPlayerId, mode: '3d', sceneId: currentScene.id, maxPlayers: mp3.maxPlayers || 16 }));
            } catch (_) {}
          });
          ws3.addEventListener('message', function (ev) {
            try {
              var msg = JSON.parse(String(ev.data));
              if (msg.type === 'room_snapshot' && msg.snapshot) {
                activeSim.mpRoomId = msg.snapshot.roomId || activeSim.mpRoomId;
                activeSim.mpRemotes.clear();
                (msg.snapshot.players || []).forEach(function (pl) { if (pl && pl.playerId !== activeSim.mpPlayerId) activeSim.mpRemotes.set(pl.playerId, pl); });
              } else if ((msg.type === 'player_joined' || msg.type === 'player_state') && msg.player) {
                if (msg.player.playerId !== activeSim.mpPlayerId) activeSim.mpRemotes.set(msg.player.playerId, msg.player);
              } else if (msg.type === 'player_left' && msg.playerId) {
                activeSim.mpRemotes.delete(String(msg.playerId));
              }
            } catch (_) {}
          });
        } catch (_) {}
      }
      sim3dAccumulator = 0;
      activeSim.hasAdaptiveQuality = (currentScene.objects || []).some(function (o) {
        return o.visible && (o.components || []).some(function (c) { return c.enabled && c.type === 'portal.adaptive_quality'; });
      });
      mountSceneWidgets(currentScene);
      refreshWidgetsDom(true);
    }

    function logScriptError3D(errKey, scriptName, err) {
      if (!activeSim || activeSim.loggedScriptErrors.has(errKey)) return;
      activeSim.loggedScriptErrors.add(errKey);
      console.warn('[NEXUS 3D Script]', scriptName, err);
    }

    function makeScriptHandle3D(so, params) {
      var data = activeSim && activeSim.scriptObjectData.get(so.id);
      if (!data && activeSim) { data = {}; activeSim.scriptObjectData.set(so.id, data); }
      return {
        get id() { return so.id; },
        get name() { return so.name; },
        get type() { return so.type; },
        get tags() { return so.tags || []; },
        get x() { return so.t3.x; },
        set x(v) { if (Number.isFinite(v)) so.t3.x = v; },
        get y() { return so.t3.y; },
        set y(v) { if (Number.isFinite(v)) so.t3.y = v; },
        get z() { return so.t3.z; },
        set z(v) { if (Number.isFinite(v)) so.t3.z = v; },
        get rx() { return so.t3.rx; },
        set rx(v) { if (Number.isFinite(v)) so.t3.rx = v; },
        get ry() { return so.t3.ry; },
        set ry(v) { if (Number.isFinite(v)) so.t3.ry = v; },
        get rz() { return so.t3.rz; },
        set rz(v) { if (Number.isFinite(v)) so.t3.rz = v; },
        get rotation() { return so.t3.ry; },
        set rotation(v) { if (Number.isFinite(v)) so.t3.ry = v; },
        get vx() { return so.vx; },
        set vx(v) { if (Number.isFinite(v)) so.vx = v; },
        get vy() { return so.vy; },
        set vy(v) { if (Number.isFinite(v)) so.vy = v; },
        get vz() { return so.vz; },
        set vz(v) { if (Number.isFinite(v)) so.vz = v; },
        get scaleX() { return so.t3.sx; },
        set scaleX(v) { if (Number.isFinite(v)) so.t3.sx = v; },
        get scaleY() { return so.t3.sy; },
        set scaleY(v) { if (Number.isFinite(v)) so.t3.sy = v; },
        get scaleZ() { return so.t3.sz; },
        set scaleZ(v) { if (Number.isFinite(v)) so.t3.sz = v; },
        get opacity() { return so.source.opacity !== undefined ? so.source.opacity : 1; },
        set opacity(v) { if (Number.isFinite(v)) so.source.opacity = v; },
        get visible() { return so.visible; },
        set visible(v) { so.visible = Boolean(v); },
        get isGrounded() { return so.isGrounded; },
        get speed() { return Math.hypot(so.vx, so.vz); },
        data: data || {},
        params: params || {},
        hasTag: function (tag) { return Array.isArray(so.tags) && so.tags.indexOf(tag) >= 0; },
        addTag: function (tag) { if (!Array.isArray(so.tags)) so.tags = []; if (tag && so.tags.indexOf(tag) < 0) so.tags.push(tag); },
        removeTag: function (tag) { if (Array.isArray(so.tags)) so.tags = so.tags.filter(function (t) { return t !== tag; }); },
        moveTowards: function (targetOrX, speedOrY, dtOrZ, maxStepOrDt, maybeDt) {
          var tx = so.t3.x, ty = so.t3.y, tz = so.t3.z, maxStep = 0;
          if (typeof targetOrX === 'object' && targetOrX !== null) {
            tx = Number(targetOrX.x !== undefined ? targetOrX.x : so.t3.x);
            ty = Number(targetOrX.y !== undefined ? targetOrX.y : so.t3.y);
            tz = Number(targetOrX.z !== undefined ? targetOrX.z : so.t3.z);
            maxStep = Number(speedOrY || 0) * Number(dtOrZ || 0);
          } else if (maybeDt !== undefined) {
            tx = Number(targetOrX); ty = Number(speedOrY); tz = Number(dtOrZ);
            maxStep = Number(maxStepOrDt || 0) * Number(maybeDt || 0);
          } else {
            tx = Number(targetOrX); ty = Number(speedOrY);
            maxStep = maxStepOrDt !== undefined ? Number(dtOrZ || 0) * Number(maxStepOrDt || 0) : Number(dtOrZ || 0);
          }
          if (!Number.isFinite(tx) || !Number.isFinite(ty) || !Number.isFinite(tz) || maxStep <= 0) return;
          var dx = tx - so.t3.x, dy = ty - so.t3.y, dz = tz - so.t3.z, d = Math.hypot(dx, dy, dz);
          if (d > 0.001) { var s = Math.min(d, maxStep); so.t3.x += (dx / d) * s; so.t3.y += (dy / d) * s; so.t3.z += (dz / d) * s; }
        },
        applyImpulse: function (ix, iy, iz) { so.vx += Number(ix || 0); so.vy += Number(iy || 0); so.vz += Number(iz || 0); },
        setVelocity: function (vx, vy, vz) { so.vx = Number(vx || 0); so.vy = Number(vy || 0); if (vz !== undefined) so.vz = Number(vz || 0); },
        playAnim: function (clipName) { so.activeClip = clipName; so.animProgress = 0; so.animFinished = false; },
        setAnimState: function (stateName) {
          so.currentAnimState = stateName;
          so.animProgress = 0;
          so.animFinished = false;
          var stNode = so.source.animStateMachine && so.source.animStateMachine.states ? so.source.animStateMachine.states.find(function (s) { return s.name === stateName || s.id === stateName; }) : null;
          if (stNode) {
            so.activeClip = stNode.clipName;
            so.activeAnimAssetId = stNode.assetId || null;
            so.animTimeScale = stNode.timeScale || 1;
            so.animLoopMode = stNode.loopMode || 'LoopRepeat';
          }
        },
        playState: function (stateName) {
          this.setAnimState(stateName);
        },
        call: function (methodName) {
          var extraArgs = Array.prototype.slice.call(arguments, 1);
          var list = so.source.scriptBindings || [];
          for (var i = 0; i < list.length; i++) {
            var b = list[i]; if (!b.enabled) continue;
            var e = compiledScripts.get(b.scriptId);
            if (e && e.hooks && typeof e.hooks[methodName] === 'function') {
              var mPrm = Object.assign({}, e.hooks.params || {}, b.params || {});
              return e.hooks[methodName].apply(e.hooks, [makeScriptHandle3D(so, mPrm)].concat(extraArgs).concat([makeScriptApi3D(0)]));
            }
          }
          return undefined;
        },
        destroy: function () { so.visible = false; }
      };
    }

    function makeSceneScriptHandle3D(sid, params) {
      var key = '__scene__:' + (currentScene ? currentScene.id : 'sc') + ':' + sid;
      var data = activeSim && activeSim.scriptObjectData.get(key);
      if (!data && activeSim) { data = {}; activeSim.scriptObjectData.set(key, data); }
      return {
        id: currentScene ? currentScene.id : '', name: currentScene ? currentScene.name : 'Escena',
        type: 'scene', tags: ['scene'],
        x: 0, y: 0, z: 0, rx: 0, ry: 0, rz: 0, rotation: 0, vx: 0, vy: 0, vz: 0,
        scaleX: 1, scaleY: 1, scaleZ: 1, opacity: 1, visible: true, isGrounded: false, speed: 0,
        data: data || {}, params: params || {},
        hasTag: function (t) { return t === 'scene'; }, addTag: function () {}, removeTag: function () {},
        moveTowards: function () {}, applyImpulse: function () {}, setVelocity: function () {},
        playAnim: function () {}, setAnimState: function () {}, playState: function () {},
        call: function (methodName) {
          var extraArgs = Array.prototype.slice.call(arguments, 1);
          var e = compiledScripts.get(sid);
          if (e && e.hooks && typeof e.hooks[methodName] === 'function') {
            return e.hooks[methodName].apply(e.hooks, [makeSceneScriptHandle3D(sid, Object.assign({}, e.hooks.params || {}))].concat(extraArgs).concat([makeScriptApi3D(0)]));
          }
          return undefined;
        },
        destroy: function () {}
      };
    }

    function getCameraForwardXZ3D(cs) {
      var dx = cs.lookAtX - cs.posX, dz = cs.lookAtZ - cs.posZ;
      var len = Math.hypot(dx, dz);
      if (len > 0.05) return { x: dx / len, z: dz / len };
      var yawRad = (cs.orbitYawDeg || 0) * DEG2RAD;
      return { x: -Math.sin(yawRad), z: -Math.cos(yawRad) };
    }

    function getCameraRightXZ3D(cs) {
      var fwd = getCameraForwardXZ3D(cs);
      return { x: -fwd.z, z: fwd.x };
    }

    function lerpAngleDeg3D(a, b, t) {
      var d = (((b - a) % 360) + 540) % 360 - 180;
      return a + d * t;
    }

    function raycastSegmentAabb3DDetailed(ox, oy, oz, dx, dy, dz, minX, maxX, minY, maxY, minZ, maxZ) {
      var rawTMin = -Infinity, rawTMax = Infinity;
      var axes = [[ox, dx, minX, maxX], [oy, dy, minY, maxY], [oz, dz, minZ, maxZ]];
      for (var i = 0; i < 3; i++) {
        var o = axes[i][0], d = axes[i][1], bmin = axes[i][2], bmax = axes[i][3];
        if (Math.abs(d) < 1e-7) {
          if (o < bmin || o > bmax) return null;
        } else {
          var t1 = (bmin - o) / d, t2 = (bmax - o) / d;
          if (t1 > t2) { var tmp = t1; t1 = t2; t2 = tmp; }
          if (t1 > rawTMin) rawTMin = t1;
          if (t2 < rawTMax) rawTMax = t2;
          if (rawTMin > rawTMax) return null;
        }
      }
      if (rawTMax < 0 || rawTMin > 1) return null;
      return rawTMin < 0 ? { t: 0, inside: true } : { t: rawTMin, inside: false };
    }

    function raycastSegmentAabb3D(ox, oy, oz, dx, dy, dz, box) {
      var h = raycastSegmentAabb3DDetailed(ox, oy, oz, dx, dy, dz, box.minX, box.maxX, box.minY, box.maxY, box.minZ, box.maxZ);
      return h ? h.t : null;
    }

    function getWorldT3AndHe(o, objs) {
      var w = getWorldT3(o, objs);
      var p3 = o.source.physics3d;
      return {
        w: w,
        hx: (p3 && p3.halfExtents && p3.halfExtents.x) || Math.max(0.2, Math.abs(w.sx) * 0.5),
        hy: (p3 && p3.halfExtents && p3.halfExtents.y) || Math.max(0.15, Math.abs(w.sy) * 0.5),
        hz: (p3 && p3.halfExtents && p3.halfExtents.z) || Math.max(0.2, Math.abs(w.sz) * 0.5)
      };
    }

    function makeScriptApi3D(dt) {
      return {
        dt: dt !== undefined ? dt : FIXED_DT,
        time: activeSim ? activeSim.elapsedTime : 0,
        findByName: function (name) {
          var f = activeSim && activeSim.objects.find(function (o) { return o.visible && o.name === name; });
          return f ? makeScriptHandle3D(f, {}) : null;
        },
        findById: function (id) {
          var f = activeSim && activeSim.objects.find(function (o) { return o.visible && o.id === id; });
          return f ? makeScriptHandle3D(f, {}) : null;
        },
        findByTag: function (tag) {
          return activeSim ? activeSim.objects.filter(function (o) { return o.visible && o.tags.indexOf(tag) >= 0; }).map(function (o) { return makeScriptHandle3D(o, {}); }) : [];
        },
        getAll: function () {
          return activeSim ? activeSim.objects.filter(function (o) { return o.visible; }).map(function (o) { return makeScriptHandle3D(o, {}); }) : [];
        },
        spawnPrefab: function (nameOrId, x, y, z) {
          if (!activeSim) return null;
          var sx = x !== undefined ? Number(x) : 0, sy = y !== undefined ? Number(y) : 1, sz = z !== undefined ? Number(z) : 0;
          var pfFound = null;
          prefabMap3D.forEach(function (pf) { if (!pfFound && (pf.id === nameOrId || pf.name === nameOrId)) pfFound = pf; });
          if (pfFound && pfFound.objects && pfFound.objects.length > 0) {
            var rootOrig = pfFound.objects.find(function (o) { return o.id === pfFound.rootObjectId; }) || pfFound.objects[0];
            var bt = (rootOrig && rootOrig.transform3d) || { x: 0, y: 0, z: 0 };
            var firstSt = null;
            pfFound.objects.forEach(function (orig, idx) {
              var copy = cloneData(orig);
              copy.id = 'inst3_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6) + '_' + idx;
              copy.parentId = null; copy.visible = true;
              var ot = copy.transform3d || { x: 0, y: 0, z: 0, rx: 0, ry: 0, rz: 0, sx: 1, sy: 1, sz: 1 };
              ot.x = sx + (ot.x - bt.x); ot.y = sy + (ot.y - bt.y); ot.z = sz + (ot.z - bt.z);
              copy.transform3d = ot;
              var st = activeSim.mountObject(copy, [], activeSim.softBodySims, activeSim.vehicleSims);
              activeSim.objects.push(st);
              if (!firstSt) firstSt = st;
            });
            return firstSt ? makeScriptHandle3D(firstSt, {}) : null;
          }
          var tplObj = activeSim.objects.find(function (o) { return o.id === nameOrId || o.name === nameOrId; });
          if (tplObj) {
            var copy2 = cloneData(tplObj.source);
            copy2.id = 'inst3_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6);
            copy2.visible = true;
            var ot2 = copy2.transform3d || { x: 0, y: 1, z: 0, rx: 0, ry: 0, rz: 0, sx: 1, sy: 1, sz: 1 };
            ot2.x = sx; ot2.y = sy; ot2.z = sz; copy2.transform3d = ot2;
            var st2 = activeSim.mountObject(copy2, [], activeSim.softBodySims, activeSim.vehicleSims);
            activeSim.objects.push(st2);
            return makeScriptHandle3D(st2, {});
          }
          return null;
        },
        destroyById: function (id) {
          var f = activeSim && activeSim.objects.find(function (o) { return o.id === id; });
          if (f) f.visible = false;
        },
        emitEvent: function (n) { if (activeSim && n) activeSim.queuedEvents.push(n); },
        log: function (m) { console.log('[NEXUS 3D Script]', m); },
        vars: {
          get: function (n) { return variables.get(n); },
          set: function (n, v) { variables.set(n, v); refreshWidgetsDom(); },
          add: function (n, d) {
            var nv = Number(variables.get(n) || 0) + Number(d || 0);
            variables.set(n, nv);
            refreshWidgetsDom();
            return nv;
          }
        },
        audio: {
          play: function (id, v, spatial) { playSfx(id, v, spatial); },
          playSfx: function (id, v, spatial) { playSfx(id, v, spatial); },
          playMusic: function (id, v) { playMusic(id, v !== undefined ? v : 0.8, true); },
          stopMusic: function () { stopMusic(); },
          setBusVolume: function (bus, v) {
            audioBuses[bus] = Math.max(0, Math.min(1, Number(v || 0.8)));
            if (currentMusic && bus === 'music') currentMusic.gain.gain.value = currentMusic.vol * channelGain('music');
          },
          setBusMuted: function (bus, muted) {
            audioBuses.muted = audioBuses.muted || {};
            audioBuses.muted[bus] = Boolean(muted);
            if (currentMusic) currentMusic.gain.gain.value = currentMusic.vol * channelGain('music');
          }
        },
        dialogue: {
          start: function (idOrName) { startDialogue3D(String(idOrName || '')); },
          isOpen: function () { return Boolean(activeDialogue3D); },
          close: function () { activeDialogue3D = null; renderDialogueOverlay3D(); }
        },
        data: {
          getTable: function (ref) { var r = queryDataTable3D(ref); return Array.isArray(r) ? r : []; },
          getRow: function (ref, rk) { return queryDataTable3D(ref, rk); }
        },
        i18n: {
          t: function (k) { return t3D(String(k || '')); },
          getLocale: function () { return activeLocale3D; },
          setLocale: function (l) { if (l === 'es' || l === 'en' || l === 'pt') { activeLocale3D = l; refreshWidgetsDom(); } }
        },
        particles: {
          burst: function (x, y, zOrPreset, countOrPreset, maybeCount) {
            var z = typeof zOrPreset === 'number' ? zOrPreset : 0;
            var rawSt = typeof zOrPreset === 'string' ? zOrPreset : (typeof countOrPreset === 'string' ? countOrPreset : 'sparks');
            var defs = getParticleDefaults3D(rawSt.indexOf('#') === 0 ? 'sparks' : rawSt);
            var cnt = typeof countOrPreset === 'number' ? countOrPreset : (typeof maybeCount === 'number' ? maybeCount : 16);
            burstParticles3D(Number(x || 0), Number(y || 0), Number(z || 0), Math.max(4, Math.min(40, Number(cnt) || 16)), Object.assign({}, defs, { colorStart: rawSt.indexOf('#') === 0 ? rawSt : defs.colorStart }));
          }
        },
        vfx: {
          emit: function (opts) {
            if (!opts) return;
            var tgt = null;
            if (typeof opts.target === 'string' && activeSim) tgt = activeSim.objects.find(function (o) { return o.id === opts.target || o.name === opts.target; });
            else if (opts.target && opts.target.id && activeSim) tgt = activeSim.objects.find(function (o) { return o.id === opts.target.id; });
            var x = opts.x !== undefined ? Number(opts.x) : (tgt ? tgt.t3.x : 0);
            var y = opts.y !== undefined ? Number(opts.y) : (tgt ? tgt.t3.y : 1);
            var z = opts.z !== undefined ? Number(opts.z) : (tgt ? tgt.t3.z : 0);
            var presetId = opts.preset || 'sparks';
            var defs = getParticleDefaults3D(presetId);
            burstParticles3D(x, y, z, Math.max(4, Math.min(60, Number(opts.count !== undefined ? opts.count : 20))), Object.assign({}, defs, { preset: presetId, colorStart: opts.color || defs.colorStart }));
          },
          spawnBurst: function (x, y, zOrPreset, presetOrColor, count) {
            var z = typeof zOrPreset === 'number' ? zOrPreset : 0;
            var rawSt = typeof zOrPreset === 'string' ? zOrPreset : (presetOrColor || 'sparks');
            var isHex = rawSt.indexOf('#') === 0;
            var presetId = !isHex ? rawSt : 'sparks';
            var defs = getParticleDefaults3D(presetId);
            burstParticles3D(Number(x || 0), Number(y || 0), Number(z || 0), Math.max(4, Math.min(60, Number(count !== undefined ? count : 20))), Object.assign({}, defs, { preset: presetId, colorStart: isHex ? rawSt : defs.colorStart }));
          }
        },
        tween: function (target, props, durationSec) {
          if (!activeSim || !props) return;
          var tid = typeof target === 'string' ? target : (target && target.id);
          var twO = activeSim.objects.find(function (o) { return o.id === tid || o.name === tid; });
          if (!twO) return;
          var from = {}, to = {};
          Object.keys(props).forEach(function (k) {
            var v = props[k];
            if (typeof v !== 'number' || !isFinite(v)) return;
            to[k] = v;
            if (k === 'x' || k === 'y' || k === 'z' || k === 'rx' || k === 'ry' || k === 'rz') from[k] = twO.t3[k];
            else if (k === 'rotation') from[k] = twO.t3.ry;
            else if (k === 'scaleX') from[k] = twO.t3.sx;
            else if (k === 'scaleY') from[k] = twO.t3.sy;
            else if (k === 'scaleZ') from[k] = twO.t3.sz;
            else if (k === 'opacity') from[k] = twO.source.opacity !== undefined ? twO.source.opacity : 1;
            else if (k === 'fov') from[k] = (twO.source.camera3d && twO.source.camera3d.fov) || (activeSim.cameraState && activeSim.cameraState.fov) || 55;
          });
          activeSim.scriptTweens.push({ targetId: twO.id, elapsed: 0, duration: Math.max(0.02, durationSec || 0.35), from: from, to: to });
        },
        camera: {
          shake: function (i, d) { if (activeSim) { activeSim.shakeIntensity = Math.max(activeSim.shakeIntensity, i || 0.35); activeSim.shakeTimer = Math.max(activeSim.shakeTimer, d || 0.25); } },
          switchCamera: function (ref, durationSec) {
            if (!activeSim) return;
            var f = activeSim.objects.find(function (o) { return o.id === ref || o.name === ref; });
            if (f && f.type === 'camera_3d') {
              activeSim.cameraManualLock = false;
              activeSim.cameraBlend = null;
              activeSim.overrideCameraId = f.id;
              var cs = activeSim.cameraState;
              if (cs.activeCameraId !== f.id) {
                var dur = Math.max(0, durationSec !== undefined ? Number(durationSec) : 0.65);
                if (dur > 0.01) {
                  cs.transitionFrom = { posX: cs.posX, posY: cs.posY, posZ: cs.posZ, lookAtX: cs.lookAtX, lookAtY: cs.lookAtY, lookAtZ: cs.lookAtZ, fov: cs.fov };
                  cs.transitionElapsed = 0; cs.transitionDuration = dur;
                } else { cs.transitionFrom = null; cs.transitionDuration = 0; }
                cs.activeCameraId = f.id;
              }
            }
          },
          getForward: function () {
            if (!activeSim) return { x: 0, y: 0, z: -1 };
            var cs = activeSim.cameraState;
            var dx = cs.lookAtX - cs.posX, dy = cs.lookAtY - cs.posY, dz = cs.lookAtZ - cs.posZ;
            var len = Math.hypot(dx, dy, dz) || 1;
            return { x: dx / len, y: dy / len, z: dz / len };
          },
          getRight: function () {
            if (!activeSim) return { x: 1, y: 0, z: 0 };
            var r = getCameraRightXZ3D(activeSim.cameraState);
            return { x: r.x, y: 0, z: r.z };
          },
          setPosition: function (x, y, z) {
            if (!activeSim) return;
            activeSim.cameraManualLock = true;
            activeSim.cameraBlend = null;
            if (Number.isFinite(x)) activeSim.cameraState.posX = x;
            if (Number.isFinite(y)) activeSim.cameraState.posY = y;
            if (Number.isFinite(z)) activeSim.cameraState.posZ = z;
          },
          lookAt: function (x, y, z) {
            if (!activeSim) return;
            activeSim.cameraManualLock = true;
            activeSim.cameraBlend = null;
            if (Number.isFinite(x)) activeSim.cameraState.lookAtX = x;
            if (Number.isFinite(y)) activeSim.cameraState.lookAtY = y;
            if (Number.isFinite(z)) activeSim.cameraState.lookAtZ = z;
          },
          blendTo: function (opts) {
            if (!activeSim || !opts) return;
            var cs = activeSim.cameraState;
            activeSim.cameraBlend = {
              active: true, elapsed: 0, duration: Math.max(0.05, Number(opts.duration !== undefined ? opts.duration : 0.65)),
              from: { px: cs.posX, py: cs.posY, pz: cs.posZ, lx: cs.lookAtX, ly: cs.lookAtY, lz: cs.lookAtZ, fov: cs.fov },
              to: {
                px: opts.x !== undefined ? opts.x : cs.posX,
                py: opts.y !== undefined ? opts.y : cs.posY,
                pz: opts.z !== undefined ? opts.z : cs.posZ,
                lx: opts.lookAtX !== undefined ? opts.lookAtX : cs.lookAtX,
                ly: opts.lookAtY !== undefined ? opts.lookAtY : cs.lookAtY,
                lz: opts.lookAtZ !== undefined ? opts.lookAtZ : cs.lookAtZ,
                fov: opts.fov !== undefined ? opts.fov : cs.fov
              }
            };
          }
        },
        scene: {
          load: function (ref) { loadScene3D(String(ref)); },
          restart: function () { if (currentScene) loadScene3D(currentScene.id); },
          nextLevel: function () { var idx = scenes.findIndex(function (s) { return currentScene && s.id === currentScene.id; }); if (scenes[idx + 1]) loadScene3D(scenes[idx + 1].id); }
        },
        ui: {
          open: function (t) { setWidgetDisplay3D(String(t), 'open'); },
          close: function (t) { setWidgetDisplay3D(String(t), 'close'); },
          toggle: function (t) { setWidgetDisplay3D(String(t), 'toggle'); },
          showToast: function (text, durationSec) {
            if (!activeSim) return;
            var clean = String(text || '').trim();
            if (!clean) return;
            activeSim.activeToasts.push({ id: 'toast_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6), text: clean, remaining: Math.max(0.4, Number(durationSec !== undefined ? durationSec : 2.5)) });
            if (activeSim.activeToasts.length > 5) activeSim.activeToasts.shift();
            refreshWidgetsDom();
          },
          createWidget: function (id, html, opts) {
            if (!activeSim) return;
            var cid = String(id || '').trim();
            if (!cid) return;
            var idx = activeSim.dynamicWidgets.findIndex(function (w) { return w.id === cid; });
            var ent = { id: cid, html: String(html || ''), x: opts && opts.x !== undefined ? opts.x : 24, y: opts && opts.y !== undefined ? opts.y : 24, css: opts && opts.css, visible: true };
            if (idx >= 0) activeSim.dynamicWidgets[idx] = ent;
            else activeSim.dynamicWidgets.push(ent);
            refreshWidgetsDom();
          },
          updateWidget: function (id, patch) {
            if (!activeSim || !patch) return;
            var w = activeSim.dynamicWidgets.find(function (item) { return item.id === id; });
            if (!w) return;
            if (patch.html !== undefined) w.html = patch.html;
            if (patch.text !== undefined) w.html = patch.text;
            if (patch.visible !== undefined) w.visible = Boolean(patch.visible);
            refreshWidgetsDom();
          },
          removeWidget: function (id) {
            if (!activeSim) return;
            var idx = activeSim.dynamicWidgets.findIndex(function (item) { return item.id === id; });
            if (idx >= 0) { activeSim.dynamicWidgets.splice(idx, 1); refreshWidgetsDom(); }
          },
          clearWidgets: function () {
            if (!activeSim) return;
            activeSim.dynamicWidgets.length = 0;
            refreshWidgetsDom();
          }
        },
        spawn: {
          clone: function (nameOrId, x, y, z) { return makeScriptApi3D(dt).spawnPrefab(nameOrId, x, y, z); },
          primitive: function (shape, opts) {
            if (!activeSim) return null;
            var o = opts || {};
            activeSim.spawnCounter = (activeSim.spawnCounter || 0) + 1;
            var sid = 'spawn_prim_' + Date.now() + '_' + activeSim.spawnCounter;
            var t3 = { x: Number(o.x !== undefined ? o.x : 0), y: Number(o.y !== undefined ? o.y : 1), z: Number(o.z !== undefined ? o.z : 0), rx: 0, ry: 0, rz: 0, sx: Number(o.sx !== undefined ? o.sx : 1), sy: Number(o.sy !== undefined ? o.sy : 1), sz: Number(o.sz !== undefined ? o.sz : 1) };
            var src = {
              id: sid, name: o.name || ('Prim_' + activeSim.spawnCounter), type: 'mesh_3d', parentId: null, visible: true, locked: false, opacity: 1, layer: 'World', tags: ['spawned'],
              transform: { x: 0, y: 0, rotation: 0, scaleX: 1, scaleY: 1, width: 64, height: 64, anchorX: 0.5, anchorY: 0.5 },
              transform3d: t3,
              mesh3d: { shape: shape || 'box', color: o.color || '#38bdf8', roughness: 0.55, metalness: 0.15, castShadow: true, receiveShadow: true },
              physics3d: o.physics === false
                ? { enabled: false, bodyType: 'static', shape: 'box', mass: 1, restitution: 0.1, friction: 0.7, isTrigger: false, gravityScale: 1 }
                : { enabled: true, bodyType: o.dynamic ? 'dynamic' : 'static', shape: shape === 'stairs' ? 'mesh_exact' : shape === 'sphere' ? 'sphere' : 'box', mass: 1, restitution: 0.1, friction: 0.7, isTrigger: false, gravityScale: 1 },
              components: []
            };
            var simSt = activeSim.mountObject(src, [], activeSim.softBodySims, activeSim.vehicleSims);
            activeSim.objects.push(simSt);
            return makeScriptHandle3D(simSt, {});
          }
        },
        world: {
          raycast: function (ox, oy, oz, dx, dy, dz, maxDist) {
            if (!activeSim) return { hit: false, distance: maxDist || 100, x: ox, y: oy, z: oz };
            var md = maxDist !== undefined ? Number(maxDist) : 100;
            var dLen = Math.hypot(dx, dy, dz) || 1;
            var ndx = dx / dLen, ndy = dy / dLen, ndz = dz / dLen;
            var bestT = md, bestObj = null;
            for (var i = 0; i < activeSim.objects.length; i++) {
              var cand = activeSim.objects[i];
              if (!cand.visible || cand.type !== 'mesh_3d') continue;
              if (cand.source.mesh3d && (cand.source.mesh3d.shape === 'terrain' || cand.source.mesh3d.shape === 'grass_field')) continue;
              var wh = getWorldT3AndHe(cand, activeSim.objects);
              var hitT = raycastSegmentAabb3D(ox, oy, oz, ndx * md, ndy * md, ndz * md, {
                minX: wh.w.x - wh.hx, maxX: wh.w.x + wh.hx,
                minY: wh.w.y - wh.hy, maxY: wh.w.y + wh.hy,
                minZ: wh.w.z - wh.hz, maxZ: wh.w.z + wh.hz
              });
              if (hitT !== null) {
                var distHit = hitT * md;
                if (distHit >= 0 && distHit < bestT) { bestT = distHit; bestObj = cand; }
              }
            }
            var steps = 40, stepLen = Math.min(bestT, md) / steps;
            if (stepLen > 0.01) {
              for (var s = 1; s <= steps; s++) {
                var sd = s * stepLen, px = ox + ndx * sd, py = oy + ndy * sd, pz = oz + ndz * sd;
                var gy = groundHeightAt(activeSim.objects, px, pz);
                if (py <= gy) return { hit: true, objectId: 'terrain', objectName: 'Terreno', distance: sd, x: px, y: gy, z: pz };
              }
            }
            if (bestObj) return { hit: true, objectId: bestObj.id, objectName: bestObj.name, distance: bestT, x: ox + ndx * bestT, y: oy + ndy * bestT, z: oz + ndz * bestT };
            return { hit: false, distance: md, x: ox + ndx * md, y: oy + ndy * md, z: oz + ndz * md };
          },
          getTerrainHeight: function (x, z) {
            return activeSim ? groundHeightAt(activeSim.objects, Number(x || 0), Number(z || 0)) : 0;
          }
        },
        lights: {
          setSun: function (opts) {
            if (!activeSim || !opts) return;
            if (opts.intensity !== undefined) activeSim.sunOverride.intensity = Number(opts.intensity);
            if (opts.color !== undefined) activeSim.sunOverride.color = String(opts.color);
            if (opts.timeOfDay !== undefined) activeSim.sunOverride.timeOfDay = Number(opts.timeOfDay);
          },
          setLight: function (nameOrId, opts) {
            if (!activeSim || !opts) return;
            var lObj = activeSim.objects.find(function (o) { return o.id === nameOrId || o.name === nameOrId; });
            if (!lObj || !lObj.source.light3d) return;
            if (opts.intensity !== undefined) lObj.source.light3d.intensity = Number(opts.intensity);
            if (opts.color !== undefined) lObj.source.light3d.color = String(opts.color);
            if (opts.distance !== undefined) lObj.source.light3d.distance = Number(opts.distance);
            if (opts.visible !== undefined) lObj.visible = Boolean(opts.visible);
            var threeLight = lightBindings.get(lObj.id);
            if (threeLight) {
              if (opts.intensity !== undefined) threeLight.intensity = Number(opts.intensity);
              if (opts.color !== undefined) threeLight.color.set(String(opts.color));
              if (opts.distance !== undefined && threeLight.distance !== undefined) threeLight.distance = Number(opts.distance);
              if (opts.visible !== undefined) threeLight.visible = Boolean(opts.visible);
            }
          }
        },
        input: {
          isHeld: function (k) { return heldKeys.has(k); },
          justPressed: function (k) { return justPressed.has(k); },
          getAxis: function () {
            var kx = (heldKeys.has('KeyD') || heldKeys.has('ArrowRight') ? 1 : 0) - (heldKeys.has('KeyA') || heldKeys.has('ArrowLeft') ? 1 : 0);
            var ky = (heldKeys.has('KeyS') || heldKeys.has('ArrowDown') ? 1 : 0) - (heldKeys.has('KeyW') || heldKeys.has('ArrowUp') ? 1 : 0);
            return { x: Math.abs(touchAxis.x) > 0.05 ? touchAxis.x : kx, y: Math.abs(touchAxis.y) > 0.05 ? touchAxis.y : ky };
          }
        },
        multiplayer: {
          isConnected: function () { return Boolean(activeSim && activeSim.mpSocket && activeSim.mpSocket.readyState === 1); },
          getRemotePlayers: function () { return activeSim && activeSim.mpRemotes ? Array.from(activeSim.mpRemotes.values()) : []; },
          broadcast: function (evName, payload) {
            if (activeSim && activeSim.mpSocket && activeSim.mpSocket.readyState === 1) {
              try { activeSim.mpSocket.send(JSON.stringify({ type: 'custom_event', roomId: activeSim.mpRoomId || 'sala_global', playerId: activeSim.mpPlayerId, event: String(evName || ''), data: payload || {} })); } catch (_) {}
            }
          }
        }
      };
    }

    // ---- Entrada Universal: Teclado, Joystick Analógico 360° Táctil, Gamepad ----
    var heldKeys = new Set();
    var justPressed = new Set();
    var touchCfg = gameData.settings && gameData.settings.touchControls ? gameData.settings.touchControls : {};
    var touchOverlayEl = document.getElementById('nx-touch-controls');
    if (touchOverlayEl && (touchCfg.enabledByDefault || TOUCH_OPT)) {
      touchOverlayEl.classList.remove('hidden');
      touchOverlayEl.style.opacity = String(Math.max(0.25, Math.min(1, touchCfg.opacity || 0.85)));
    }
    var touchAxis = { x: 0, y: 0 };
    var touchBtns = { jump: false, action: false, dash: false };
    var prevTouchJump = false;

    var joyZone = document.getElementById('nx-joystick-zone');
    var joyRing = document.getElementById('nx-joystick-ring');
    var joyKnob = document.getElementById('nx-joystick-knob');
    var joyPid = null, joyOrig = { x: 0, y: 0 };
    var joySize = Math.max(84, Math.min(180, touchCfg.joystickSize || 112));
    var joyMaxTravel = Math.round(joySize * 0.38);
    if (joyZone && joyRing && joyKnob) {
      joyRing.style.width = joySize + 'px'; joyRing.style.height = joySize + 'px';
      joyKnob.style.width = Math.round(joySize * 0.44) + 'px'; joyKnob.style.height = Math.round(joySize * 0.44) + 'px';
      joyZone.addEventListener('pointerdown', function (e) {
        if (joyPid !== null) return;
        e.stopPropagation();
        try { joyZone.setPointerCapture(e.pointerId); } catch (_) {}
        joyPid = e.pointerId;
        var rr = joyRing.getBoundingClientRect();
        joyOrig = { x: rr.left + rr.width * 0.5, y: rr.top + rr.height * 0.5 };
        var dx0 = e.clientX - joyOrig.x, dy0 = e.clientY - joyOrig.y, d0 = Math.hypot(dx0, dy0), c0 = Math.min(joyMaxTravel, d0);
        joyKnob.style.transform = 'translate3d(' + (d0 > 0.01 ? (dx0 / d0) * c0 : 0).toFixed(1) + 'px,' + (d0 > 0.01 ? (dy0 / d0) * c0 : 0).toFixed(1) + 'px,0)';
        var v0 = computeJoystickVector(dx0, dy0, joyMaxTravel, touchCfg.deadzone);
        touchAxis.x = v0.x; touchAxis.y = v0.y;
      });
      joyZone.addEventListener('pointermove', function (e) {
        if (joyPid !== e.pointerId) return;
        e.stopPropagation();
        var dx1 = e.clientX - joyOrig.x, dy1 = e.clientY - joyOrig.y, d1 = Math.hypot(dx1, dy1), c1 = Math.min(joyMaxTravel, d1);
        joyKnob.style.transform = 'translate3d(' + (d1 > 0.01 ? (dx1 / d1) * c1 : 0).toFixed(1) + 'px,' + (d1 > 0.01 ? (dy1 / d1) * c1 : 0).toFixed(1) + 'px,0)';
        var v1 = computeJoystickVector(dx1, dy1, joyMaxTravel, touchCfg.deadzone);
        touchAxis.x = v1.x; touchAxis.y = v1.y;
      });
      function resetJoy3d(e) {
        if (joyPid !== e.pointerId) return;
        joyPid = null;
        joyKnob.style.transform = 'translate3d(0px,0px,0)';
        touchAxis.x = 0; touchAxis.y = 0;
      }
      joyZone.addEventListener('pointerup', resetJoy3d);
      joyZone.addEventListener('pointercancel', resetJoy3d);
    }
    document.querySelectorAll('[data-btn]').forEach(function (btn) {
      var bn = btn.getAttribute('data-btn');
      btn.addEventListener('pointerdown', function (e) { e.stopPropagation(); touchBtns[bn] = true; });
      function upB(e) { e.stopPropagation(); touchBtns[bn] = false; }
      btn.addEventListener('pointerup', upB);
      btn.addEventListener('pointercancel', upB);
      btn.addEventListener('pointerleave', upB);
    });

    window.addEventListener('keydown', function (e) {
      if (!heldKeys.has(e.code)) justPressed.add(e.code);
      heldKeys.add(e.code);
    });
    window.addEventListener('keyup', function (e) { heldKeys.delete(e.code); });
    window.addEventListener('blur', function () { heldKeys.clear(); touchAxis.x = 0; touchAxis.y = 0; touchBtns.jump = false; });

    var orbitDrag = { active: false, lastX: 0, lastY: 0 };
    webgl.domElement.addEventListener('pointerdown', function (e) {
      if (e.button === 0 || e.button === 2) { orbitDrag.active = true; orbitDrag.lastX = e.clientX; orbitDrag.lastY = e.clientY; }
    });
    window.addEventListener('pointermove', function (e) {
      if (!orbitDrag.active || !activeSim || !activeSim.cameraState) return;
      var dx = e.clientX - orbitDrag.lastX, dy = e.clientY - orbitDrag.lastY;
      orbitDrag.lastX = e.clientX; orbitDrag.lastY = e.clientY;
      var camO = activeSim.objects.find(function (o) { return o.id === activeSim.cameraState.activeCameraId; }) || activeSim.objects.find(function (o) { return o.type === 'camera_3d'; });
      var invY = Boolean((camO && camO.source.camera3d && camO.source.camera3d.invertY) || (currentScene && currentScene.cameraConfig && currentScene.cameraConfig.smartCamera && currentScene.cameraConfig.smartCamera.invertY));
      activeSim.cameraState.orbitYawDeg -= dx * 0.35;
      activeSim.cameraState.orbitPitchDeg = Math.max(-75, Math.min(75, activeSim.cameraState.orbitPitchDeg + (invY ? dy : -dy) * 0.28));
    });
    window.addEventListener('pointerup', function () { orbitDrag.active = false; });
    webgl.domElement.addEventListener('wheel', function (e) {
      if (!currentScene) return;
      var sc = currentScene.cameraConfig && currentScene.cameraConfig.smartCamera;
      if (sc && sc.mode === 'third_person_orbit') {
        sc.distance = Math.max(2.5, Math.min(35, (sc.distance || 10) + e.deltaY * 0.01));
      }
    }, { passive: true });

    function cmpVal3D(a, op, b) {
      var an = Number(a), bn = Number(b);
      if (op === '>') return an > bn;
      if (op === '>=') return an >= bn;
      if (op === '<') return an < bn;
      if (op === '<=') return an <= bn;
      if (op === '!=') return String(a) !== String(b);
      return !isNaN(an) && !isNaN(bn) ? an === bn : String(a) === String(b);
    }

    function resolveTarget3D(ref, owner, other) {
      if (!ref) return owner;
      var s = String(ref).trim();
      if (s === '$other' || s === 'other') return other;
      if (s === '$self' || s === 'self') return owner;
      return (activeSim && activeSim.objects.find(function (o) { return o.id === s || o.name === s; })) || owner;
    }

    function evalCondition3D(c, owner, other) {
      if (c.type === 'boolean') {
        var bVal = c.variable ? Boolean(variables.get(c.variable)) : false;
        return bVal === (c.value === undefined ? true : Boolean(c.value));
      }
      if (c.type === 'variable.compare') {
        var lhs = c.variable ? (variables.get(c.variable) !== undefined ? variables.get(c.variable) : 0) : 0;
        var rhs = c.secondaryVariable ? variables.get(c.secondaryVariable) : (c.value !== undefined ? c.value : 0);
        return cmpVal3D(lhs, c.operator || '==', rhs);
      }
      if (c.type === 'variable.objectCompare') {
        var vl = c.variable ? (variables.get(c.variable) !== undefined ? variables.get(c.variable) : 0) : 0;
        var vr = c.secondaryVariable ? (variables.get(c.secondaryVariable) !== undefined ? variables.get(c.secondaryVariable) : 0) : 0;
        return cmpVal3D(vl, c.operator || '==', vr);
      }
      if (c.type === 'input.held') return Boolean(c.key && heldKeys.has(c.key));
      if (c.type === 'object.visible') {
        var tv = resolveTarget3D(c.target, owner, other);
        return Boolean(tv && tv.visible === (c.value === undefined ? true : Boolean(c.value)));
      }
      if (c.type === 'object.exists') return Boolean(resolveTarget3D(c.target, owner, other));
      if (c.type === 'object.grounded') {
        var tg = resolveTarget3D(c.target, owner, other);
        return Boolean(tg && tg.isGrounded === (c.value === undefined ? true : Boolean(c.value)));
      }
      if (c.type === 'object.hasTag') {
        var ht = resolveTarget3D(c.target, owner, other);
        var tagStr = String(c.tag || c.value || '').trim();
        return Boolean(ht && tagStr && ht.tags && ht.tags.indexOf(tagStr) >= 0);
      }
      if (c.type === 'health.compare') {
        var ho = resolveTarget3D(c.target, owner, other);
        return ho ? cmpVal3D(ho.hp !== undefined ? ho.hp : 100, c.operator || '<=', Number(c.value || 0)) : false;
      }
      if (c.type === 'state.is') {
        var so = resolveTarget3D(c.target, owner, other);
        return Boolean(so && so.currentAnimState === String(c.value || ''));
      }
      if (c.type === 'distance.less' || c.type === 'distance.greater') {
        var da = resolveTarget3D(c.target, owner, other);
        var db = resolveTarget3D(c.secondaryTarget, owner, other);
        if (!da || !db || !da.visible || !db.visible) return false;
        var dist3 = Math.hypot(da.t3.x - db.t3.x, da.t3.y - db.t3.y, da.t3.z - db.t3.z);
        return c.type === 'distance.less' ? dist3 <= Number(c.value || 5) : dist3 > Number(c.value || 10);
      }
      if (c.type === 'random.chance') return Math.random() * 100 < Math.max(0, Math.min(100, Number(c.value !== undefined ? c.value : 50)));
      return true;
    }

    function executeAction3D(act, owner, other) {
      var p = act.parameters || {};
      var tgt = resolveTarget3D(p.target, owner, other);
      if (act.type === 'variable.set' && typeof p.variable === 'string') variables.set(p.variable, isNaN(Number(p.value)) ? p.value : Number(p.value));
      else if (act.type === 'variable.add' && typeof p.variable === 'string') variables.set(p.variable, Number(variables.get(p.variable) || 0) + Number(p.amount || 1));
      else if (act.type === 'audio.play') playSfx(String(p.assetId || p.preset || 'coin'), Number(p.volume !== undefined ? p.volume : 1));
      else if (act.type === 'music.play' && p.assetId) playMusic(p.assetId, Number(p.volume !== undefined ? p.volume : 0.8), p.loop !== false);
      else if (act.type === 'music.stop' || act.type === 'audio.stopAll') stopMusic();
      else if (act.type === 'audio.setVolume') {
        var ch3 = String(p.channel || 'master');
        audioBuses[ch3] = Math.max(0, Math.min(1, Number(p.volume !== undefined ? p.volume : 0.8)));
        if (currentMusic) currentMusic.gain.gain.value = currentMusic.vol * channelGain('music');
      }
      else if ((act.type === 'object.destroy' || act.type === 'object.hide') && tgt) tgt.visible = false;
      else if (act.type === 'object.show' && tgt) tgt.visible = true;
      else if (act.type === 'object.move' && tgt) { tgt.t3.x += Number(p.dx || 0); tgt.t3.y += Number(p.dy || 0); tgt.t3.z += Number(p.dz || 0); trimeshCache.delete(tgt.id); }
      else if (act.type === 'object.teleport' && tgt) { tgt.t3.x = Number(p.x !== undefined ? p.x : tgt.t3.x); tgt.t3.y = Number(p.y !== undefined ? p.y : tgt.t3.y); tgt.t3.z = Number(p.z !== undefined ? p.z : tgt.t3.z); trimeshCache.delete(tgt.id); }
      else if (act.type === 'physics.impulse' && tgt) { tgt.vx += Number(p.ix || 0); tgt.vy += Number(p.iy !== undefined ? p.iy : 7); tgt.vz += Number(p.iz || 0); }
      else if (act.type === 'health.damage' && tgt) {
        var dmg3 = Math.max(0, Number(p.amount || 10));
        if (tgt.invulnTimer <= 0) {
          tgt.hp = Math.max(0, (tgt.hp !== undefined ? tgt.hp : 100) - dmg3);
          tgt.invulnTimer = Number(p.invulnerability !== undefined ? p.invulnerability : 0.35);
          var priP = resolvePlayer3d(activeSim ? activeSim.objects : []);
          if (priP && priP.id === tgt.id) { variables.set('salud', Math.round(tgt.hp)); activeSim.queuedEvents.push('player_hit'); }
        }
      }
      else if (act.type === 'health.heal' && tgt) {
        var heal3 = Math.max(0, Number(p.amount || 20));
        tgt.hp = Math.min(tgt.maxHp || 100, (tgt.hp !== undefined ? tgt.hp : 100) + heal3);
        var priH = resolvePlayer3d(activeSim ? activeSim.objects : []);
        if (priH && priH.id === tgt.id) variables.set('salud', Math.round(tgt.hp));
      }
      else if ((act.type === 'anim3d.setState' || act.type === 'state.set') && tgt) {
        var stName = String(p.state || p.stateName || 'idle');
        tgt.currentAnimState = stName;
        tgt.animProgress = 0;
        tgt.animFinished = false;
        var fsmNode = tgt.source.animStateMachine && tgt.source.animStateMachine.states ? tgt.source.animStateMachine.states.find(function (s) { return s.name === stName || s.id === stName; }) : null;
        if (fsmNode) {
          tgt.activeClip = fsmNode.clipName;
          tgt.activeAnimAssetId = fsmNode.assetId || null;
          tgt.animTimeScale = fsmNode.timeScale || 1;
          tgt.animLoopMode = fsmNode.loopMode || 'LoopRepeat';
        }
      }
      else if (act.type === 'ai.chase' && tgt) {
        tgt.source.aiAgent = Object.assign({ enabled: true, mode: 'chase', speed: 3.8, stoppingDistance: 1.2 }, tgt.source.aiAgent || {}, { enabled: true, mode: 'chase', targetObjectId: p.targetObjectId ? String(p.targetObjectId) : (tgt.source.aiAgent && tgt.source.aiAgent.targetObjectId) });
      }
      else if (act.type === 'ai.moveTo' && tgt) {
        tgt.source.aiAgent = Object.assign({ enabled: true, mode: 'moveTo', speed: 3.8, stoppingDistance: 1.0 }, tgt.source.aiAgent || {}, { enabled: true, mode: 'moveTo', targetX: Number(p.x !== undefined ? p.x : tgt.t3.x), targetZ: Number(p.z !== undefined ? p.z : tgt.t3.z) });
        tgt.navPath = [];
      }
      else if (act.type === 'ai.stop' && tgt) {
        if (tgt.source.aiAgent) tgt.source.aiAgent.mode = 'idle';
        tgt.vx = 0; tgt.vz = 0;
      }
      else if (act.type === 'camera.switch' && activeSim) {
        var cRef = String(p.target || p.cameraId || '');
        var camTarget = activeSim.objects.find(function (o) { return (o.id === cRef || o.name === cRef) && o.type === 'camera_3d'; });
        if (camTarget) {
          activeSim.cameraManualLock = false;
          activeSim.cameraBlend = null;
          activeSim.overrideCameraId = camTarget.id;
          var cs3 = activeSim.cameraState;
          var cDur = Math.max(0, Number(p.duration !== undefined ? p.duration : 0.65));
          if (cDur > 0.01) {
            cs3.transitionFrom = { posX: cs3.posX, posY: cs3.posY, posZ: cs3.posZ, lookAtX: cs3.lookAtX, lookAtY: cs3.lookAtY, lookAtZ: cs3.lookAtZ, fov: cs3.fov };
            cs3.transitionElapsed = 0; cs3.transitionDuration = cDur;
          } else { cs3.transitionFrom = null; cs3.transitionDuration = 0; }
          cs3.activeCameraId = camTarget.id;
        }
      }
      else if (act.type === 'vehicle.enterExit' && activeSim) {
        var objsV = activeSim.objects || [];
        var actorV = (p.actorId ? objsV.find(function (o) { return o.id === p.actorId || o.name === p.actorId; }) : null) || resolvePlayer3d(objsV);
        var vehV = (p.vehicleId ? objsV.find(function (o) { return o.id === p.vehicleId || o.name === p.vehicleId; }) : null) || objsV.find(function (o) { return o.source.vehicle && o.source.vehicle.enabled; });
        if (actorV && vehV && actorV.id !== vehV.id) {
          if (activeSim.mountedVehicleId === vehV.id) {
            var vYaw = (vehV.t3.ry || 0) * DEG2RAD;
            var sideOff = Number(p.exitOffsetX !== undefined ? p.exitOffsetX : 2.6);
            actorV.t3.x = vehV.t3.x + Math.cos(vYaw) * sideOff;
            actorV.t3.y = vehV.t3.y + 0.9;
            actorV.t3.z = vehV.t3.z - Math.sin(vYaw) * sideOff;
            actorV.vx = 0; actorV.vy = 0; actorV.vz = 0;
            actorV.visible = true;
            activeSim.mountedVehicleId = null;
            activeSim.mountedActorId = null;
            activeSim.cameraFollowOverride3D = null;
            activeSim.cameraManualLock = false;
          } else if (!activeSim.mountedVehicleId) {
            var vDist = Math.hypot(actorV.t3.x - vehV.t3.x, actorV.t3.z - vehV.t3.z);
            var maxD = Number(p.maxDistance !== undefined ? p.maxDistance : 12);
            if (vDist <= maxD) {
              activeSim.mountedVehicleId = vehV.id;
              activeSim.mountedActorId = actorV.id;
              actorV.visible = false;
              actorV.vx = 0; actorV.vy = 0; actorV.vz = 0;
              actorV.t3.x = vehV.t3.x; actorV.t3.y = vehV.t3.y; actorV.t3.z = vehV.t3.z;
              activeSim.cameraFollowOverride3D = (vehV.source.vehicle && vehV.source.vehicle.parts && vehV.source.vehicle.parts.cameraId) || vehV.id;
              activeSim.cameraManualLock = false;
            }
          }
        }
      }
      else if (act.type === 'camera.shake') { activeSim.shakeIntensity = Math.max(activeSim.shakeIntensity, Number(p.intensity || 0.35)); activeSim.shakeTimer = Math.max(activeSim.shakeTimer, Number(p.duration || 0.25)); }
      else if (act.type === 'vfx.emit' || act.type === 'particles.burst' || act.type === 'particles.emit') {
        var vDefs = getParticleDefaults3D(String(p.preset || 'sparks'));
        burstParticles3D(Number(p.x !== undefined ? p.x : (tgt ? tgt.t3.x : 0)), Number(p.y !== undefined ? p.y : (tgt ? tgt.t3.y : 1)), Number(p.z !== undefined ? p.z : (tgt ? tgt.t3.z : 0)), Number(p.count || 18), Object.assign({}, vDefs, { colorStart: String(p.color || vDefs.colorStart) }));
      }
      else if (act.type === 'leaderboard.submit' && window.NexusPortal && window.NexusPortal.submitScore) {
        var lbVar = String(p.variable || 'puntos');
        window.NexusPortal.submitScore('default', Number(variables.get(lbVar) || 0), String(p.playerName || 'Jugador'));
      }
      else if (act.type === 'ui.openInterface') setWidgetDisplay3D(String(p.target || ''), 'open');
      else if (act.type === 'ui.closeInterface') setWidgetDisplay3D(String(p.target || ''), 'close');
      else if (act.type === 'ui.toggleInterface') setWidgetDisplay3D(String(p.target || ''), 'toggle');
      else if (act.type === 'dialogue.start' && p.dialogueId) startDialogue3D(String(p.dialogueId));
      else if (act.type === 'scene.load' && p.sceneId) loadScene3D(String(p.sceneId));
      else if (act.type === 'scene.nextLevel') { var idx = scenes.findIndex(function (s) { return s.id === currentScene.id; }); if (scenes[idx + 1]) loadScene3D(scenes[idx + 1].id); }
      else if (act.type === 'scene.restart') loadScene3D(currentScene.id);
      else if (act.type === 'event.emit' && typeof p.eventName === 'string') activeSim.queuedEvents.push(p.eventName);
      else if (act.type === 'script.call' && typeof p.methodName === 'string') {
        var mName = String(p.methodName).trim();
        var hasArg = p.arg !== undefined && p.arg !== '';
        var cTgt = activeSim.objects.find(function (o) { return o.id === p.target || o.name === p.target; }) || tgt;
        if (p.target && cTgt) {
          (cTgt.source.scriptBindings || []).forEach(function (b) {
            if (!b.enabled) return;
            if (p.scriptId && b.scriptId !== p.scriptId) return;
            var e = compiledScripts.get(b.scriptId);
            if (e && e.hooks && typeof e.hooks[mName] === 'function') {
              var mFn3 = e.hooks[mName];
              var mPrm = Object.assign({}, e.hooks.params || {}, b.params || {});
              var h3 = makeScriptHandle3D(cTgt, mPrm);
              var api3 = makeScriptApi3D(FIXED_DT);
              var cArgs = hasArg ? [h3, p.arg, api3] : (mFn3.length >= 3 ? [h3, undefined, api3] : [h3, api3]);
              try { mFn3.apply(e.hooks, cArgs); } catch (err) { logScriptError3D('call:' + b.id + ':' + mName, e.name, err); }
            }
          });
        } else if (p.scriptId) {
          var sid = String(p.scriptId), calledAny = false;
          activeSim.objects.forEach(function (so) {
            if (!so.visible) return;
            (so.source.scriptBindings || []).forEach(function (b) {
              if (!b.enabled || b.scriptId !== sid) return;
              var e = compiledScripts.get(sid);
              if (e && e.hooks && typeof e.hooks[mName] === 'function') {
                calledAny = true;
                var mFnO = e.hooks[mName];
                var mPrm = Object.assign({}, e.hooks.params || {}, b.params || {});
                var ho = makeScriptHandle3D(so, mPrm);
                var apiO = makeScriptApi3D(FIXED_DT);
                var oArgs = hasArg ? [ho, p.arg, apiO] : (mFnO.length >= 3 ? [ho, undefined, apiO] : [ho, apiO]);
                try { mFnO.apply(e.hooks, oArgs); } catch (err) { logScriptError3D('call:' + b.id + ':' + mName, e.name, err); }
              }
            });
          });
          if (!calledAny && (currentScene.scriptIds || []).indexOf(sid) >= 0) {
            var se = compiledScripts.get(sid);
            if (se && se.hooks && typeof se.hooks[mName] === 'function') {
              var sFn = se.hooks[mName];
              var sh3 = makeSceneScriptHandle3D(sid, Object.assign({}, se.hooks.params || {}));
              var apiS = makeScriptApi3D(FIXED_DT);
              var sArgs = hasArg ? [sh3, p.arg, apiS] : (sFn.length >= 3 ? [sh3, undefined, apiS] : [sh3, apiS]);
              try { sFn.apply(se.hooks, sArgs); } catch (err) { logScriptError3D('callSc:' + sid + ':' + mName, se.name, err); }
            }
          }
        }
      }
    }

    function executeActionList3D(actions, mechId, owner, other) {
      for (var i = 0; i < actions.length; i++) {
        var act = actions[i];
        var p = act.parameters || {};
        if (act.type === 'wait') {
          var rem = actions.slice(i + 1);
          if (rem.length > 0 && activeSim) {
            activeSim.pendingWaits.push({
              remainingSec: Math.max(0.01, Number(p.seconds || p.duration || 0.5)),
              actions: rem,
              mechId: mechId,
              ownerId: owner ? owner.id : null,
              otherId: other ? other.id : null
            });
          }
          break;
        }
        executeAction3D(act, owner, other);
      }
    }

    function runMechanics3D(event, owner, other, extra) {
      var mechs = (currentScene.mechanics || []).filter(function (m) { return m.enabled; }).sort(function (a, b) { return (b.priority || 0) - (a.priority || 0); });
      for (var i = 0; i < mechs.length; i++) {
        var m = mechs[i];
        if (!m.trigger || m.trigger.event !== event) continue;
        if (m.trigger.sourceObjectId && owner && m.trigger.sourceObjectId !== owner.id) continue;
        if (m.trigger.target && other) {
          var tgt = m.trigger.target;
          if (!(other.id === tgt || other.name === tgt || (other.tags && other.tags.indexOf(tgt) >= 0) || other.layer === tgt)) continue;
        } else if (m.trigger.target && event.indexOf('collision.') === 0) continue;
        if (m.trigger.key && extra && extra.key && m.trigger.key !== extra.key) continue;
        if (m.trigger.eventName && extra && extra.eventName && m.trigger.eventName !== extra.eventName) continue;
        var conds = m.conditions || [];
        var comb = m.conditionCombinator || 'all';
        var ok = conds.length === 0 ? true : comb === 'any' ? conds.some(function (c) { return evalCondition3D(c, owner, other); }) : comb === 'none' ? conds.every(function (c) { return !evalCondition3D(c, owner, other); }) : conds.every(function (c) { return evalCondition3D(c, owner, other); });
        if (!ok) continue;
        executeActionList3D(m.actions || [], m.id, owner, other);
      }
    }

    loadScene3D(currentScene.id);
    if (window.NexusPortal) { window.NexusPortal.loadingFinished(); window.NexusPortal.gameplayStart(); }

    var lastT = performance.now();
    var adaptiveFrames3D = 0, adaptiveElapsed3D = 0, lowFpsStreak3D = 0, highFpsStreak3D = 0;
    function frame(now) {
      if (software) {
        setTimeout(function () { requestAnimationFrame(frame); }, 42);
      } else {
        requestAnimationFrame(frame);
      }
      var dt = Math.min(0.05, Math.max(0.001, (now - lastT) / 1000));
      lastT = now;
      if (!software && activeSim && !paused) {
        adaptiveFrames3D++;
        adaptiveElapsed3D += dt;
        if (adaptiveElapsed3D >= 0.5) {
          var curFps3D = adaptiveFrames3D / adaptiveElapsed3D;
          adaptiveFrames3D = 0;
          adaptiveElapsed3D = 0;
          var perfMode3D = (currentScene && (currentScene.performanceProfile || (currentScene.renderQuality && currentScene.renderQuality.performanceMode))) || 'balanced_60';
          if (perfMode3D === 'balanced_60' || perfMode3D === 'balanced_60fps' || activeSim.hasAdaptiveQuality) {
            var maxSceneDpr = Math.min(window.devicePixelRatio || 1, getMaxDpr3D(currentScene));
            if (curFps3D < 48) {
              highFpsStreak3D = 0;
              lowFpsStreak3D++;
              if (lowFpsStreak3D >= 4 && currentActiveDpr3D > 1.0) {
                currentActiveDpr3D = Math.max(1.0, Number((currentActiveDpr3D - 0.25).toFixed(2)));
                webgl.setPixelRatio(currentActiveDpr3D);
                resizeRenderer();
                lowFpsStreak3D = 0;
              }
            } else if (curFps3D >= 58) {
              lowFpsStreak3D = 0;
              highFpsStreak3D++;
              if (highFpsStreak3D >= 12 && currentActiveDpr3D < maxSceneDpr) {
                currentActiveDpr3D = Math.min(maxSceneDpr, Number((currentActiveDpr3D + 0.25).toFixed(2)));
                webgl.setPixelRatio(currentActiveDpr3D);
                resizeRenderer();
                highFpsStreak3D = 0;
              }
            } else {
              lowFpsStreak3D = Math.max(0, lowFpsStreak3D - 1);
              highFpsStreak3D = Math.max(0, highFpsStreak3D - 1);
            }
          }
        }
      }
      if (!paused && activeSim) {
        activeSim.elapsedTime += dt;
        if (activeDialogue3D && !activeDialogue3D.finishedTyping) {
          activeDialogue3D.revealedChars = Math.min(activeDialogue3D.fullText.length, activeDialogue3D.revealedChars + activeDialogue3D.typewriterSpeed * dt);
          if (activeDialogue3D.revealedChars >= activeDialogue3D.fullText.length) activeDialogue3D.finishedTyping = true;
          renderDialogueOverlay3D();
        }
        for (var tiT = (activeSim.activeToasts || []).length - 1; tiT >= 0; tiT--) {
          activeSim.activeToasts[tiT].remaining -= dt;
          if (activeSim.activeToasts[tiT].remaining <= 0) activeSim.activeToasts.splice(tiT, 1);
        }
        var objs = activeSim.objects;
        var apiInit = makeScriptApi3D(dt);
        (currentScene.scriptIds || []).forEach(function (sid) {
          var sKey = 'scene:' + currentScene.id + ':' + sid;
          if (!activeSim.startedScriptBindings.has(sKey)) {
            activeSim.startedScriptBindings.add(sKey);
            var se = compiledScripts.get(sid);
            if (se && se.hooks && typeof se.hooks.onStart === 'function') {
              try { se.hooks.onStart(makeSceneScriptHandle3D(sid, Object.assign({}, se.hooks.params || {})), apiInit); } catch (err) { logScriptError3D('onStart:' + sKey, se.name, err); }
            }
          }
        });
        objs.forEach(function (so) {
          (so.source.scriptBindings || []).forEach(function (b) {
            if (!b.enabled) return;
            var bKey = 'obj:' + so.id + ':' + b.id;
            if (!activeSim.startedScriptBindings.has(bKey)) {
              activeSim.startedScriptBindings.add(bKey);
              var sc = compiledScripts.get(b.scriptId);
              if (sc && sc.hooks && typeof sc.hooks.onStart === 'function') {
                var mPrm = Object.assign({}, sc.hooks.params || {}, b.params || {});
                try { sc.hooks.onStart(makeScriptHandle3D(so, mPrm), apiInit); } catch (err) { logScriptError3D('onStart:' + bKey, sc.name, err); }
              }
            }
          });
        });
        if (!activeSim.started) { activeSim.started = true; runMechanics3D('scene.start'); }
        objs.forEach(function (kfO) {
          if (!kfO.visible || !kfO.source.tweens || kfO.source.tweens.length === 0) return;
          kfO.source.tweens.forEach(function (tr) {
            var sk = kfO.id + ':' + tr.id;
            var ts = activeSim.tweenStates3D.get(sk);
            if (!ts) { ts = { elapsed: 0, playing: Boolean(tr.autoPlay) }; activeSim.tweenStates3D.set(sk, ts); }
            if (!ts.playing) return;
            ts.elapsed += dt;
            var delay = Math.max(0, tr.delay || 0);
            if (ts.elapsed < delay) return;
            var dur = Math.max(0.05, tr.duration || 0.5);
            var prog = (ts.elapsed - delay) / dur;
            if (tr.pingPong) {
              var cyc = Math.floor(prog), frac = prog - cyc;
              if (!tr.loop && cyc >= 2) { prog = 0; ts.playing = false; }
              else prog = cyc % 2 === 1 ? 1 - frac : frac;
            } else if (tr.loop) {
              prog = prog % 1;
            } else if (prog >= 1) {
              prog = 1; ts.playing = false;
            }
            var val = tr.from + (tr.to - tr.from) * evalEasing3D(tr.easing, prog);
            if (tr.property === 'x' || tr.property === 'y' || tr.property === 'z' || tr.property === 'rx' || tr.property === 'ry' || tr.property === 'rz') kfO.t3[tr.property] = val;
            else if (tr.property === 'rotation') kfO.t3.ry = val;
            else if (tr.property === 'scaleX') kfO.t3.sx = val;
            else if (tr.property === 'scaleY') kfO.t3.sy = val;
            else if (tr.property === 'scaleZ') kfO.t3.sz = val;
            else if (tr.property === 'opacity') kfO.source.opacity = Math.max(0, Math.min(1, val));
            else if (tr.property === 'fov' && kfO.source.camera3d) kfO.source.camera3d.fov = Math.max(20, Math.min(120, val));
            trimeshCache.delete(kfO.id);
          });
        });
        for (var ti = activeSim.scriptTweens.length - 1; ti >= 0; ti--) {
          var tw = activeSim.scriptTweens[ti];
          tw.elapsed += dt;
          var tp = Math.min(1, tw.elapsed / Math.max(0.01, tw.duration));
          var te = 1 - Math.pow(1 - tp, 2);
          var twObj = objs.find(function (x) { return x.id === tw.targetId; });
          if (twObj) {
            Object.keys(tw.to).forEach(function (k) {
              var fv = tw.from[k] !== undefined ? tw.from[k] : 0;
              var val = fv + (tw.to[k] - fv) * te;
              if (k === 'x' || k === 'y' || k === 'z' || k === 'rx' || k === 'ry' || k === 'rz') twObj.t3[k] = val;
              else if (k === 'rotation') twObj.t3.ry = val;
              else if (k === 'scaleX') twObj.t3.sx = val;
              else if (k === 'scaleY') twObj.t3.sy = val;
              else if (k === 'scaleZ') twObj.t3.sz = val;
              else if (k === 'opacity') twObj.source.opacity = val;
              else if (k === 'fov') {
                if (twObj.source.camera3d) twObj.source.camera3d.fov = Math.max(20, Math.min(120, val));
                else activeSim.cameraState.fov = Math.max(20, Math.min(120, val));
              }
            });
            trimeshCache.delete(twObj.id);
          }
          if (tp >= 1) activeSim.scriptTweens.splice(ti, 1);
        }

        var gp = null;
        if (typeof navigator !== 'undefined' && typeof navigator.getGamepads === 'function') {
          var pads = navigator.getGamepads();
          for (var gi = 0; pads && gi < pads.length; gi++) { if (pads[gi] && pads[gi].connected) { gp = pads[gi]; break; } }
        }
        var gpX = gp ? (Math.abs(gp.axes[0] || 0) > 0.18 ? gp.axes[0] : 0) : 0;
        var gpY = gp ? (Math.abs(gp.axes[1] || 0) > 0.18 ? gp.axes[1] : 0) : 0;
        var moveAxisX = Math.abs(touchAxis.x) > 0.05 ? touchAxis.x : gpX;
        var moveAxisY = Math.abs(touchAxis.y) > 0.05 ? touchAxis.y : gpY;
        var jumpPressed = justPressed.has('Space') || (touchBtns.jump && !prevTouchJump) || Boolean(gp && gp.buttons[0] && gp.buttons[0].pressed && !prevTouchJump);
        prevTouchJump = touchBtns.jump || Boolean(gp && gp.buttons[0] && gp.buttons[0].pressed);

        var ltCur = currentScene.lighting || {};
        var sunOv = activeSim.sunOverride || {};
        if (ltCur.dayNightEnabled || sunOv.timeOfDay !== undefined) {
          if (sunOv.timeOfDay !== undefined) activeSim.dayClock = sunOv.timeOfDay;
          else activeSim.dayClock = (activeSim.dayClock + dt * (ltCur.dayCycleSpeed !== undefined ? ltCur.dayCycleSpeed : 0.25)) % 24;
          var dn = computeDayNightLighting(ltCur, activeSim.dayClock);
          if (skyRef) { skyRef.uniforms.uZenith.value.set(dn.zenithColor); skyRef.uniforms.uHorizon.value.set(dn.horizonColor); }
          if (sunLightRef) { sunLightRef.position.set(dn.sunPosition[0], dn.sunPosition[1], dn.sunPosition[2]); sunLightRef.color.set(sunOv.color || dn.sunColor); sunLightRef.intensity = sunOv.intensity !== undefined ? sunOv.intensity : dn.sunIntensity; }
          if (ambientLightRef) { ambientLightRef.color.set(dn.ambientColor); ambientLightRef.intensity = dn.ambientIntensity; }
          if (threeScene.fog) threeScene.fog.color.set(dn.fogColor);
          if (threeScene.background && threeScene.background.isColor) threeScene.background.set(dn.horizonColor);
          else threeScene.background = new THREE.Color(dn.horizonColor);
        } else if (sunLightRef && (sunOv.intensity !== undefined || sunOv.color !== undefined)) {
          if (sunOv.intensity !== undefined) sunLightRef.intensity = sunOv.intensity;
          if (sunOv.color !== undefined) sunLightRef.color.set(sunOv.color);
        }
        if (skyRef) skyRef.uniforms.uTime.value = activeSim.elapsedTime;

        var objIdSet = new Set(objs.map(function (x) { return x.id; }));
        function hasParentInScene3d(x) { return Boolean(x.source.parentId && x.source.parentId !== x.id && objIdSet.has(x.source.parentId)); }
        function hasDynamicBehavior3d(x) {
          var hasC = (x.source.components || []).some(function (c) {
            return c.enabled && (c.type === 'player_3d' || c.type === 'player_platformer' || c.type === 'player_topdown' || c.type === 'movement.platformer_pro' || c.type === 'movement.topdown_8dir' || c.type === 'chase_player' || c.type === 'ai.enemy_chaser');
          });
          return hasC || Boolean(x.source.aiAgent && x.source.aiAgent.enabled && x.source.aiAgent.mode !== 'idle');
        }
        var primaryPlayer3d = resolvePlayer3d(objs);
        if (activeStreamState3D) {
          var sAnchor = primaryPlayer3d ? primaryPlayer3d.t3 : { x: activeSim.cameraState.lookAtX, y: activeSim.cameraState.lookAtY, z: activeSim.cameraState.lookAtZ };
          stepStreamingContext3D(activeStreamState3D, objs, sAnchor, activeSim.cameraState, getCameraForwardXZ3D(activeSim.cameraState));
        }

        var dynamicBodies = objs.filter(function (o) {
          if (!o.visible || hasParentInScene3d(o)) return false;
          if (activeStreamState3D) {
            var actB = activeStreamState3D.objectActivity.get(o.id) || 'near';
            if (actB === 'far' || actB === 'unloaded') return false;
          }
          if (activeSim.mountedActorId === o.id && activeSim.mountedVehicleId) return false;
          if (o.type !== 'mesh_3d' && o.type !== 'container') return false;
          if (o.type === 'mesh_3d' && o.source.mesh3d && (o.source.mesh3d.shape === 'terrain' || o.source.mesh3d.shape === 'water' || o.source.mesh3d.shape === 'grass_field')) return false;
          if (o.source.vehicle && o.source.vehicle.enabled) return true;
          if (o.source.physics3d && o.source.physics3d.enabled && o.source.physics3d.bodyType === 'dynamic') return true;
          if (o.source.physics3d && o.source.physics3d.bodyType === 'kinematic') return false;
          return hasDynamicBehavior3d(o);
        });
        var dynamicIdSet = new Set(dynamicBodies.map(function (b) { return b.id; }));
        var objMapById3d = new Map(objs.map(function (x) { return [x.id, x]; }));
        function isDescendantOfDynamic3d(x) {
          var pid = x.source && x.source.parentId;
          var guard = 0;
          var seen = new Set([x.id]);
          while (pid && !seen.has(pid) && guard < 12) {
            if (dynamicIdSet.has(pid)) return true;
            seen.add(pid);
            var pObj = objMapById3d.get(pid);
            pid = pObj && pObj.source ? pObj.source.parentId : null;
            guard++;
          }
          return false;
        }
        var staticSolids = objs.filter(function (o) {
          if (activeStreamState3D && activeStreamState3D.objectActivity.get(o.id) === 'unloaded') return false;
          return o.visible && !dynamicIdSet.has(o.id) && !isDescendantOfDynamic3d(o) && !(activeSim.mountedActorId === o.id && activeSim.mountedVehicleId) && o.type === 'mesh_3d' && (!o.source.mesh3d || o.source.mesh3d.shape !== 'grass_field') && (!o.source.physics3d || o.source.physics3d.enabled !== false) && (!o.source.physics3d || o.source.physics3d.bodyType !== 'dynamic');
        });

        var aiObsBoxes3D = staticSolids.filter(function (s) {
          var shp = s.source.mesh3d && s.source.mesh3d.shape;
          return shp !== 'plane' && shp !== 'terrain' && shp !== 'water' && (!s.source.physics3d || !s.source.physics3d.isTrigger);
        }).map(function (s) {
          var wh = getWorldT3AndHe(s, objs);
          return { id: s.id, minX: wh.w.x - wh.hx, maxX: wh.w.x + wh.hx, minY: wh.w.y - wh.hy, maxY: wh.w.y + wh.hy, minZ: wh.w.z - wh.hz, maxZ: wh.w.z + wh.hz };
        });

        function hasAiLos3D(ax, ay, az, bx, by, bz, igSet) {
          var dxL = bx - ax, dyL = by - ay, dzL = bz - az;
          var distL = Math.hypot(dxL, dyL, dzL);
          var stepsL = Math.max(2, Math.ceil(distL / 0.6));
          for (var si = 1; si < stepsL; si++) {
            var tL = si / stepsL;
            var pxL = ax + dxL * tL, pyL = ay + dyL * tL, pzL = az + dzL * tL;
            for (var bi = 0; bi < aiObsBoxes3D.length; bi++) {
              var boxL = aiObsBoxes3D[bi];
              if (igSet.has(boxL.id)) continue;
              if (pxL >= boxL.minX && pxL <= boxL.maxX && pyL >= boxL.minY && pyL <= boxL.maxY && pzL >= boxL.minZ && pzL <= boxL.maxZ) return false;
            }
          }
          return true;
        }

        function probeAiCol3D(px, pz, footY, bodyH, radius, igId) {
          var highestMaxY = -Infinity, tallBlock = false, sillMaxY = -Infinity;
          for (var i = 0; i < aiObsBoxes3D.length; i++) {
            var bx = aiObsBoxes3D[i];
            if (bx.id === igId) continue;
            if (px + radius < bx.minX || px - radius > bx.maxX) continue;
            if (pz + radius < bx.minZ || pz - radius > bx.maxZ) continue;
            if (bx.maxY <= footY + 0.18 || bx.minY >= footY + bodyH) continue;
            highestMaxY = Math.max(highestMaxY, bx.maxY);
            if (bx.minY <= footY + 0.9 && bx.maxY - footY > 0.25) sillMaxY = Math.max(sillMaxY, bx.maxY);
          }
          if (highestMaxY <= footY + 0.22) return { blocked: false, canVault: false, tallWallBlocking: false };
          var clrNeed = Math.max(0.95, bodyH * 0.72);
          var sTop = sillMaxY > -Infinity ? sillMaxY : highestMaxY;
          var ceilOk = true;
          for (var j = 0; j < aiObsBoxes3D.length; j++) {
            var bx2 = aiObsBoxes3D[j];
            if (bx2.id === igId) continue;
            if (px + radius < bx2.minX || px - radius > bx2.maxX) continue;
            if (pz + radius < bx2.minZ || pz - radius > bx2.maxZ) continue;
            if (bx2.maxY > sTop + 0.05 && bx2.minY < sTop + clrNeed) { ceilOk = false; tallBlock = true; break; }
          }
          var canV = sillMaxY > -Infinity && ceilOk;
          return { blocked: true, canVault: canV, vaultHeight: canV ? sTop - footY : Infinity, tallWallBlocking: tallBlock || !canV };
        }

        function steerSmartEnemyRt3D(o, tgtO, opts, stepDt) {
          var myW = getWorldT3(o, objs), tgW = getWorldT3(tgtO, objs);
          var myH = getWorldT3AndHe(o, objs);
          var footY = myW.y - myH.hy;
          var bodyH = Math.max(1.2, myH.hy * 2);
          var bodyRad = Math.max(0.32, Math.min(0.8, Math.max(myH.hx, myH.hz) * 0.85));
          var dxE = tgW.x - myW.x, dzE = tgW.z - myW.z, distE = Math.hypot(dxE, dzE);
          var hpR = (o.maxHp || 100) > 0 ? o.hp / (o.maxHp || 100) : 1;
          var tHpR = (tgtO.maxHp || 100) > 0 ? tgtO.hp / (tgtO.maxHp || 100) : 1;
          var isFlee = hpR <= opts.fleeHealthRatio;
          var isIns = !isFlee && tHpR <= opts.insistDamageRatio;
          var range = Math.max(opts.detectRadius, opts.visionRange);
          var fwdR = (o.t3.ry || 0) * DEG2RAD;
          var fwdX = Math.sin(fwdR), fwdZ = Math.cos(fwdR);
          var invD = distE > 0.001 ? 1 / distE : 1;
          var dot = (dxE * invD) * fwdX + (dzE * invD) * fwdZ;
          var cosHalf = Math.cos(((Math.min(360, opts.visionFovDeg) * 0.5) * DEG2RAD));
          var inCone = opts.visionFovDeg >= 359 || dot >= cosHalf || distE <= 3.2;
          var ig = new Set([o.id, tgtO.id]);
          var clrLos = !opts.requireLineOfSight || hasAiLos3D(myW.x, myW.y + 0.5, myW.z, tgW.x, tgW.y + 0.5, tgW.z, ig);
          var sees = distE <= range && inCone && clrLos;
          if (sees) { o.alertTimer = 4.5; o.lastKnownTarget = { x: tgW.x, y: tgW.y, z: tgW.z }; }
          var alerted = sees || (o.alertTimer || 0) > 0 || isFlee;
          if (!alerted || distE > range * 1.35) {
            o.vx *= Math.max(0, 1 - 10 * stepDt); o.vz *= Math.max(0, 1 - 10 * stepDt);
            return { active: false, fleeing: false, distToTarget: distE };
          }
          var effStop = isIns ? Math.max(0.45, opts.stopDist * 0.7) : opts.stopDist;
          var effSpd = isFlee ? opts.baseSpeed * 1.14 : isIns ? opts.baseSpeed * 1.28 : opts.baseSpeed;
          if (!isFlee && sees && distE <= effStop) {
            o.vx *= Math.max(0, 1 - 12 * stepDt); o.vz *= Math.max(0, 1 - 12 * stepDt);
            return { active: true, fleeing: false, distToTarget: distE };
          }
          var gx = isFlee ? myW.x - dxE : (sees || !o.lastKnownTarget ? tgW.x : o.lastKnownTarget.x);
          var gz = isFlee ? myW.z - dzE : (sees || !o.lastKnownTarget ? tgW.z : o.lastKnownTarget.z);
          if (!isFlee && currentScene.navMesh && !clrLos) {
            o.navTimer -= stepDt;
            if (o.navTimer <= 0 || !o.navPath.length) {
              o.navTimer = 0.3;
              o.navPath = findAStarPath(currentScene.navMesh, myW.x, myW.z, gx, gz);
            }
            while (o.navPath.length > 1 && Math.hypot(o.navPath[0].x - myW.x, o.navPath[0].z - myW.z) < 0.85) o.navPath.shift();
            if (o.navPath.length > 0) { gx = o.navPath[0].x; gz = o.navPath[0].z; }
          }
          var gdx = gx - myW.x, gdz = gz - myW.z, gd = Math.hypot(gdx, gdz) || 1;
          var mdx = gdx / gd, mdz = gdz / gd;
          var pN = probeAiCol3D(myW.x + mdx * 1.25, myW.z + mdz * 1.25, footY, bodyH, bodyRad, o.id);
          var pM = probeAiCol3D(myW.x + mdx * 2.25, myW.z + mdz * 2.25, footY, bodyH, bodyRad, o.id);
          var cVN = pN.canVault && pN.vaultHeight <= opts.maxJumpHeight;
          var cVM = pM.canVault && pM.vaultHeight <= opts.maxJumpHeight;
          if ((cVN || cVM) && !pN.tallWallBlocking && !pM.tallWallBlocking) {
            if (opts.canJumpObstacles && o.isGrounded) { o.vy = Math.max(o.vy, Math.min(11.5, 6.2 + opts.maxJumpHeight * 1.9)); o.isGrounded = false; }
          } else if (pN.blocked || pM.blocked) {
            var baseAng = Math.atan2(mdx, mdz);
            var offs = [-32, 32, -62, 62, -90, 90, -120, 120, -150, 150];
            var bScr = -Infinity, bxD = mdx, bzD = mdz;
            for (var oi = 0; oi < offs.length; oi++) {
              var ang = baseAng + offs[oi] * DEG2RAD, cxA = Math.sin(ang), czA = Math.cos(ang);
              var pr1 = probeAiCol3D(myW.x + cxA * 1.35, myW.z + czA * 1.35, footY, bodyH, bodyRad, o.id);
              var pr2 = probeAiCol3D(myW.x + cxA * 2.7, myW.z + czA * 2.7, footY, bodyH, bodyRad, o.id);
              var pr3 = probeAiCol3D(myW.x + cxA * 4.2, myW.z + czA * 4.2, footY, bodyH, bodyRad, o.id);
              if (!pr1.tallWallBlocking && !pr2.tallWallBlocking) {
                var vOk = opts.canJumpObstacles && ((pr1.canVault && pr1.vaultHeight <= opts.maxJumpHeight) || (pr2.canVault && pr2.vaultHeight <= opts.maxJumpHeight));
                var scr = Math.cos(offs[oi] * DEG2RAD) * 2.2 + (!pr3.tallWallBlocking ? 1.5 : 0.4) + (vOk && !pr1.blocked ? 0.8 : 0);
                if (scr > bScr) { bScr = scr; bxD = cxA; bzD = czA; }
              }
            }
            if (bScr > -Infinity) {
              mdx = bxD; mdz = bzD;
              var cPr = probeAiCol3D(myW.x + mdx * 1.35, myW.z + mdz * 1.35, footY, bodyH, bodyRad, o.id);
              if (opts.canJumpObstacles && o.isGrounded && cPr.canVault && cPr.vaultHeight <= opts.maxJumpHeight) {
                o.vy = Math.max(o.vy, Math.min(11.5, 6.2 + opts.maxJumpHeight * 1.9)); o.isGrounded = false;
              }
            }
          }
          o.vx = mdx * effSpd; o.vz = mdz * effSpd;
          o.t3.ry = lerpAngleDeg3D(o.t3.ry, Math.atan2(o.vx, o.vz) / DEG2RAD, Math.min(1, 10 * stepDt));
          return { active: true, fleeing: isFlee, distToTarget: distE };
        }

        sim3dAccumulator += dt;
        var fixedStepCount = 0;
        while (sim3dAccumulator >= FIXED_DT && fixedStepCount < 4) {
          sim3dAccumulator -= FIXED_DT;
          fixedStepCount++;
          var stepDt = FIXED_DT;
          var jpStep = fixedStepCount === 1 ? justPressed : new Set();
          var jumpPressedStep = jpStep.has('Space') || (touchBtns.jump && !prevTouchJump) || Boolean(gp && gp.buttons[0] && gp.buttons[0].pressed && !prevTouchJump);
          if (fixedStepCount === 1) prevTouchJump = touchBtns.jump || Boolean(gp && gp.buttons[0] && gp.buttons[0].pressed);

          if (activeSim.pendingWaits && activeSim.pendingWaits.length > 0) {
            var nextWaits = [];
            for (var wi = 0; wi < activeSim.pendingWaits.length; wi++) {
              var pw = activeSim.pendingWaits[wi];
              pw.remainingSec -= stepDt;
              if (pw.remainingSec <= 0) {
                var wOwn = pw.ownerId ? objs.find(function (x) { return x.id === pw.ownerId; }) : undefined;
                var wOth = pw.otherId ? objs.find(function (x) { return x.id === pw.otherId; }) : undefined;
                executeActionList3D(pw.actions || [], pw.mechId, wOwn, wOth);
              } else { nextWaits.push(pw); }
            }
            activeSim.pendingWaits = nextWaits;
          }

          objs.forEach(function (o) {
            if (!o.visible) return;
            if (o._prevHp !== undefined && o.hp < o._prevHp) o.alertTimer = Math.max(o.alertTimer || 0, 5.0);
            o._prevHp = o.hp;
            if (o.alertTimer > 0) o.alertTimer = Math.max(0, o.alertTimer - stepDt);
            if (o.invulnTimer > 0) o.invulnTimer = Math.max(0, o.invulnTimer - stepDt);
            if (o.dashTimer > 0) o.dashTimer = Math.max(0, o.dashTimer - stepDt);
            if (o.dashCooldownTimer > 0) o.dashCooldownTimer = Math.max(0, o.dashCooldownTimer - stepDt);
            if (o.type === 'light_3d' && o.source.light3d) {
              var flick = (o.source.components || []).find(function (c) { return c.enabled && c.type === 'lighting.flicker'; });
              if (flick) {
                var fSpd = Number(flick.config.speed !== undefined ? flick.config.speed : 8);
                var fAmt = Number(flick.config.amount !== undefined ? flick.config.amount : 0.25);
                if (o.source.light3d.__baseIntensity === undefined) o.source.light3d.__baseIntensity = o.source.light3d.intensity;
                var nextInt = Math.max(0.05, o.source.light3d.__baseIntensity * (1 + Math.sin(activeSim.elapsedTime * fSpd) * fAmt));
                o.source.light3d.intensity = nextInt;
                var lBind = lightBindings.get(o.id);
                if (lBind) lBind.intensity = nextInt;
              }
            }
            (o.source.components || []).forEach(function (c) {
              if (!c.enabled) return;
              if (c.type === 'player_3d' || c.type === 'player_platformer' || c.type === 'player_topdown' || c.type === 'movement.platformer_pro' || c.type === 'movement.topdown_8dir') {
                if (activeSim.mountedActorId === o.id && activeSim.mountedVehicleId) return;
                var rSpd = Number(c.config.speed !== undefined ? c.config.speed : (c.config.maxSpeed !== undefined ? c.config.maxSpeed : 7));
                var baseSpd = rSpd > 35 ? rSpd / 35 : rSpd;
                var spKey = String(c.config.sprintKey || 'ShiftLeft');
                var spMult = c.type === 'movement.topdown_8dir' && heldKeys.has(spKey) ? Number(c.config.sprintMultiplier || 1.6) : 1;
                var spd = baseSpd * spMult;
                var rJmp = Number(c.config.jumpForce !== undefined ? c.config.jumpForce : 10.5);
                var jmp = rJmp > 40 ? rJmp / 55 : rJmp;
                var maxJmps = Math.max(1, Math.round(Number(c.config.maxJumps || 1)));
                var mx = (heldKeys.has('KeyD') || heldKeys.has('ArrowRight') ? 1 : 0) - (heldKeys.has('KeyA') || heldKeys.has('ArrowLeft') ? 1 : 0);
                var mz = (heldKeys.has('KeyS') || heldKeys.has('ArrowDown') ? 1 : 0) - (heldKeys.has('KeyW') || heldKeys.has('ArrowUp') ? 1 : 0);
                if (mx === 0 && mz === 0 && (Math.abs(moveAxisX) > 0.05 || Math.abs(moveAxisY) > 0.05)) { mx = moveAxisX; mz = moveAxisY; }
                if (c.type === 'movement.platformer_pro' && c.config.dashEnabled && jpStep.has(String(c.config.dashKey || 'ShiftLeft')) && o.dashCooldownTimer <= 0) {
                  o.dashTimer = Number(c.config.dashDuration || 0.16);
                  o.dashCooldownTimer = Number(c.config.dashCooldown || 0.5);
                }
                var l = Math.hypot(mx, mz);
                if (o.dashTimer > 0) {
                  var rDash = Number(c.config.dashSpeed || 640);
                  var dSpd = rDash > 35 ? rDash / 35 : rDash;
                  var yRad = (o.t3.ry || 0) * DEG2RAD;
                  o.vx = Math.sin(yRad) * dSpd; o.vz = Math.cos(yRad) * dSpd;
                } else if (l > 0.02) {
                  var fwd = getCameraForwardXZ3D(activeSim.cameraState);
                  var right = getCameraRightXZ3D(activeSim.cameraState);
                  var mag = Math.min(1, l);
                  var nmx = mx / l, nmz = mz / l;
                  var wx = nmx * right.x - nmz * fwd.x;
                  var wz = nmx * right.z - nmz * fwd.z;
                  o.vx = wx * spd * mag; o.vz = wz * spd * mag;
                  if (c.config.rotateToMovement !== false) o.t3.ry = lerpAngleDeg3D(o.t3.ry, Math.atan2(wx, wz) / DEG2RAD, Math.min(1, 14 * stepDt));
                } else { o.vx *= Math.max(0, 1 - 12 * stepDt); o.vz *= Math.max(0, 1 - 12 * stepDt); }
                if (o.isGrounded) { o.coyoteTimer = 0.12; o.jumpsUsed = 0; } else o.coyoteTimer = Math.max(0, o.coyoteTimer - stepDt);
                if (jumpPressedStep) o.jumpBufferTimer = 0.14; else o.jumpBufferTimer = Math.max(0, o.jumpBufferTimer - stepDt);
                if (o.jumpBufferTimer > 0 && (o.coyoteTimer > 0 || (maxJmps > 1 && o.jumpsUsed < maxJmps))) {
                  o.vy = jmp; o.isGrounded = false; o.coyoteTimer = 0; o.jumpBufferTimer = 0; o.jumpsUsed++; playSfx(String(c.config.jumpSoundAssetId || '') || 'jump', 0.8);
                }
              } else if (c.type === 'chase_player' || c.type === 'ai.enemy_chaser') {
                var chTgt = (c.config.targetObjectId ? objs.find(function (x) { return x.id === c.config.targetObjectId || x.name === c.config.targetObjectId; }) : null) || (primaryPlayer3d && primaryPlayer3d.id !== o.id ? primaryPlayer3d : null);
                if (chTgt && chTgt.visible) {
                  var rawCS = Number(c.config.speed !== undefined ? c.config.speed : 3.8);
                  var chSpd = rawCS > 25 ? rawCS / 35 : rawCS;
                  var rawCR = Number(c.config.detectRadius !== undefined ? c.config.detectRadius : 28);
                  var chRad = rawCR > 60 ? rawCR / 16 : rawCR;
                  var rawSt = Number(c.config.stopDistance !== undefined ? c.config.stopDistance : 1.1);
                  var chStop = rawSt > 10 ? rawSt / 25 : rawSt;
                  var aiC = o.source.aiAgent || {};
                  var rawConeRt = Number(c.config.visionFovDeg !== undefined ? c.config.visionFovDeg : (aiC.visionFovDeg !== undefined ? aiC.visionFovDeg : 360));
                  var useConeRt = c.config.requireVisionCone === true || (Boolean(aiC.enabled) && rawConeRt < 359);
                  var aiRes = steerSmartEnemyRt3D(o, chTgt, {
                    baseSpeed: chSpd,
                    detectRadius: chRad,
                    stopDist: chStop,
                    visionFovDeg: useConeRt ? Math.min(359, Math.max(10, Number(c.config.visionFovDeg !== undefined ? c.config.visionFovDeg : (aiC.visionFovDeg !== undefined ? aiC.visionFovDeg : 130)))) : 360,
                    visionRange: Number(c.config.visionRange !== undefined ? c.config.visionRange : (aiC.visionRange !== undefined ? aiC.visionRange : chRad)),
                    requireLineOfSight: c.config.requireLineOfSight === true || (Boolean(aiC.enabled) && aiC.requireLineOfSight !== false),
                    canJumpObstacles: c.config.canJumpObstacles !== false && aiC.canJumpObstacles !== false,
                    maxJumpHeight: Number(c.config.maxJumpHeight !== undefined ? c.config.maxJumpHeight : (aiC.maxJumpHeight !== undefined ? aiC.maxJumpHeight : 2.1)),
                    fleeHealthRatio: Number(c.config.fleeHealthRatio !== undefined ? c.config.fleeHealthRatio : (aiC.fleeHealthRatio !== undefined ? aiC.fleeHealthRatio : 0.28)),
                    insistDamageRatio: Number(c.config.insistDamageRatio !== undefined ? c.config.insistDamageRatio : (aiC.insistDamageRatio !== undefined ? aiC.insistDamageRatio : 0.45))
                  }, stepDt);
                  if (c.type === 'ai.enemy_chaser' && !aiRes.fleeing && aiRes.distToTarget <= chStop + 0.65) {
                    var cDmg = Number(c.config.contactDamage !== undefined ? c.config.contactDamage : 15);
                    if (cDmg > 0 && chTgt.invulnTimer <= 0) {
                      chTgt.invulnTimer = 0.85; chTgt.hp = Math.max(0, chTgt.hp - cDmg);
                      variables.set('salud', Math.max(0, Number(variables.get('salud') !== undefined ? variables.get('salud') : 100) - cDmg));
                      playSfx('hit', 0.75);
                      activeSim.queuedEvents.push('player_hit');
                    }
                  }
                }
              } else if (c.type === 'patrol') {
                var rPD = Number(c.config.distance !== undefined ? c.config.distance : 4);
                var patD = rPD > 25 ? rPD / 25 : rPD;
                var rPS = Number(c.config.speed !== undefined ? c.config.speed : 2.8);
                var patS = rPS > 25 ? rPS / 35 : rPS;
                var pAxis = String(c.config.axis || 'x').toLowerCase();
                o.patrolPhase += (patD > 0.05 ? patS / patD : 1) * stepDt;
                var pSign = Math.cos(o.patrolPhase), pOff = Math.sin(o.patrolPhase) * patD;
                if (pAxis === 'y' || pAxis === 'z') {
                  var dZ = o.originT3.z + pOff; o.vz = (dZ - o.t3.z) / Math.max(0.001, stepDt); o.t3.z = dZ; o.vx = 0; o.t3.ry = pSign >= 0 ? 0 : 180;
                } else {
                  var dX = o.originT3.x + pOff; o.vx = (dX - o.t3.x) / Math.max(0.001, stepDt); o.t3.x = dX; o.vz = 0; o.t3.ry = pSign >= 0 ? 90 : -90;
                }
              } else if (c.type === 'movement.path_waypoints') {
                var rawWps = String(c.config.waypoints || '0,0; 6,0; 6,6; 0,6').split(';').map(function (pt) {
                  var sp = pt.trim().split(',').map(Number);
                  if (!Number.isFinite(sp[0]) || !Number.isFinite(sp[1])) return null;
                  return { x: Math.abs(sp[0]) > 40 ? sp[0] / 25 : sp[0], z: Math.abs(sp[1]) > 40 ? sp[1] / 25 : sp[1] };
                }).filter(Boolean);
                if (rawWps.length > 0) {
                  var wIdx = Math.max(0, Math.min(rawWps.length - 1, o.waypointIndex));
                  var wpT = rawWps[wIdx];
                  var rWS = Number(c.config.speed !== undefined ? c.config.speed : 3.5);
                  var wpSpd = rWS > 25 ? rWS / 35 : rWS;
                  var wdx = wpT.x - o.t3.x, wdz = wpT.z - o.t3.z, wdist = Math.hypot(wdx, wdz);
                  if (wdist <= Math.max(0.15, wpSpd * stepDt * 1.5)) {
                    if (c.config.pingPong) {
                      if (o.waypointForward) { if (wIdx + 1 >= rawWps.length) { o.waypointForward = false; o.waypointIndex = Math.max(0, wIdx - 1); } else o.waypointIndex = wIdx + 1; }
                      else { if (wIdx - 1 < 0) { o.waypointForward = true; o.waypointIndex = Math.min(rawWps.length - 1, wIdx + 1); } else o.waypointIndex = wIdx - 1; }
                    } else o.waypointIndex = (wIdx + 1) % rawWps.length;
                  } else {
                    o.vx = (wdx / wdist) * wpSpd; o.vz = (wdz / wdist) * wpSpd;
                    o.t3.x += o.vx * stepDt; o.t3.z += o.vz * stepDt;
                    if (c.config.rotateToPath !== false) o.t3.ry = Math.atan2(o.vx, o.vz) / DEG2RAD;
                  }
                }
              } else if (c.type === 'spin') {
                o.t3.ry += Number(c.config.degPerSec || 90) * stepDt;
              } else if (c.type === 'movement.sine_float') {
                var rAmp = Number(c.config.amplitude !== undefined ? c.config.amplitude : 0.35);
                var sAmp = rAmp > 5 ? rAmp / 40 : rAmp;
                var sFreq = Number(c.config.frequency !== undefined ? c.config.frequency : 1.2);
                var sOff = Math.sin(activeSim.elapsedTime * sFreq * Math.PI * 2) * sAmp;
                if (String(c.config.axis || 'y') === 'x') o.t3.x = o.originT3.x + sOff;
                else o.t3.y = o.originT3.y + sOff;
              } else if (c.type === 'movement.constant_velocity') {
                var rvx = Number(c.config.vx || 0), rvy = Number(c.config.vy || 0);
                o.vx = Math.abs(rvx) > 30 ? rvx / 35 : rvx; o.vz = Math.abs(rvy) > 30 ? rvy / 35 : rvy;
                if (!(o.source.physics3d && o.source.physics3d.enabled && o.source.physics3d.bodyType === 'dynamic')) {
                  o.t3.x += o.vx * stepDt; o.t3.z += o.vz * stepDt;
                }
              } else if (c.type === 'world.resource_node' && o.visible && primaryPlayer3d && primaryPlayer3d.id !== o.id) {
                var rR = Number(c.config.interactRadius || 2.2) > 12 ? Number(c.config.interactRadius) / 25 : Number(c.config.interactRadius || 2.2);
                if (Math.hypot(primaryPlayer3d.t3.x - o.t3.x, primaryPlayer3d.t3.z - o.t3.z) <= rR) {
                  var iId = String(c.config.itemId || 'crystal');
                  variables.set('inv_' + iId, (Number(variables.get('inv_' + iId) || 0) || 0) + Math.max(1, Number(c.config.amount || 1)));
                  variables.set('puntos', (Number(variables.get('puntos') || 0) || 0) + 10);
                  o.visible = false;
                  playSfx('coin', 0.85, o.t3);
                }
              } else if (c.type === 'tool.fishing_rod') {
                var castK = String(c.config.castKey || 'KeyF');
                var rodK = 'rod3d:' + c.id;
                var rRem = activeSim.mechanicTimers.get(rodK) || 0;
                if (rRem > 0) {
                  var nRem = Math.max(0, rRem - stepDt);
                  activeSim.mechanicTimers.set(rodK, nRem);
                  if (nRem <= 0) {
                    var pool = String(c.config.fishPool || 'trucha,salmon,pez_dorado').split(',').map(function (s) { return s.trim(); }).filter(Boolean);
                    var fish = pool[Math.floor(Math.random() * Math.max(1, pool.length))] || 'trucha';
                    variables.set('inv_' + fish, Number(variables.get('inv_' + fish) || 0) + 1);
                    activeSim.activeToasts.push({ id: 'fish_' + Date.now(), text: '¡Pescaste: ' + fish + '!', remaining: 2.2 });
                    playSfx('coin', 0.85, o.t3);
                  }
                } else if (jpStep.has(castK)) {
                  activeSim.mechanicTimers.set(rodK, Math.max(0.4, Number(c.config.biteTimeSec !== undefined ? c.config.biteTimeSec : 1.8)));
                  activeSim.activeToasts.push({ id: 'cast_' + Date.now(), text: 'Lanzando caña...', remaining: 1.5 });
                }
              } else if (c.type === 'tool.capture_net') {
                var swK = String(c.config.swingKey || 'KeyG');
                var netK = 'net3d:' + c.id;
                var nCd = Math.max(0, (activeSim.mechanicTimers.get(netK) || 0) - stepDt);
                activeSim.mechanicTimers.set(netK, nCd);
                if (nCd <= 0 && jpStep.has(swK)) {
                  activeSim.mechanicTimers.set(netK, Math.max(0.25, Number(c.config.cooldownSec !== undefined ? c.config.cooldownSec : 1.0)));
                  var rNet = Number(c.config.radius || 4.5);
                  var radNet = rNet > 15 ? rNet / 25 : rNet;
                  var maxT = Math.max(1, Math.round(Number(c.config.maxTargets || 5)));
                  var capCnt = 0;
                  for (var ni = 0; ni < objs.length && capCnt < maxT; ni++) {
                    var candN = objs[ni];
                    if (!candN.visible || candN.id === o.id) continue;
                    var nodeC = (candN.source.components || []).find(function (cc) { return cc.enabled && cc.type === 'world.resource_node'; });
                    if (nodeC && Math.hypot(candN.t3.x - o.t3.x, candN.t3.z - o.t3.z) <= radNet) {
                      var nItem = String(nodeC.config.itemId || 'crystal');
                      variables.set('inv_' + nItem, Number(variables.get('inv_' + nItem) || 0) + Math.max(1, Number(nodeC.config.amount || 1)));
                      candN.visible = false;
                      capCnt++;
                    }
                  }
                  if (capCnt > 0) activeSim.activeToasts.push({ id: 'net_' + Date.now(), text: 'Red capturó ' + capCnt + ' objetos', remaining: 2 });
                }
              } else if (c.type === 'tool.harvest') {
                var hK = String(c.config.swingKey || 'KeyE');
                var harvK = 'harv3d:' + c.id;
                var hCd = Math.max(0, (activeSim.mechanicTimers.get(harvK) || 0) - stepDt);
                activeSim.mechanicTimers.set(harvK, hCd);
                if (hCd <= 0 && jpStep.has(hK)) {
                  activeSim.mechanicTimers.set(harvK, Math.max(0.2, Number(c.config.cooldownSec !== undefined ? c.config.cooldownSec : 0.45)));
                  var rH = Number(c.config.range || 3.5);
                  var radH = rH > 12 ? rH / 25 : rH;
                  for (var hi = 0; hi < objs.length; hi++) {
                    var candH = objs[hi];
                    if (!candH.visible || candH.id === o.id) continue;
                    var isHarv = (candH.source.components || []).some(function (cc) { return cc.enabled && (cc.type === 'world.resource_node' || cc.type === 'world.crop_farm'); });
                    if (isHarv && Math.hypot(candH.t3.x - o.t3.x, candH.t3.z - o.t3.z) <= radH) {
                      var hComp = (candH.source.components || []).find(function (cc) { return cc.config && cc.config.itemId; });
                      var hItem = String((hComp && hComp.config.itemId) || 'recurso');
                      variables.set('inv_' + hItem, Number(variables.get('inv_' + hItem) || 0) + 1);
                      candH.visible = false;
                      playSfx('hit', 0.65, o.t3);
                      break;
                    }
                  }
                }
              } else if (c.type === 'physics.water_buoyancy') {
                var wL = Number(c.config.waterLevel || 0);
                if (o.t3.y <= wL) { o.vy += (wL - o.t3.y) * Number(c.config.buoyancy || 14) * stepDt; o.vy *= Math.max(0, 1 - 4 * stepDt); o.t3.y += o.vy * stepDt; }
              } else if (c.type === 'vehicle.watercraft' || c.type === 'vehicle.mount') {
                var brdK = String(c.config.boardKey || 'KeyE');
                var brdStK = 'boarded3d:' + o.id;
                var isBrd = (activeSim.mechanicTimers.get(brdStK) || 0) === 1;
                if (primaryPlayer3d && primaryPlayer3d.id !== o.id) {
                  var dB = Math.hypot(primaryPlayer3d.t3.x - o.t3.x, primaryPlayer3d.t3.z - o.t3.z);
                  if (jpStep.has(brdK) && (isBrd || dB <= 3.5)) {
                    isBrd = !isBrd;
                    activeSim.mechanicTimers.set(brdStK, isBrd ? 1 : 0);
                  }
                  if (isBrd) {
                    var vSpd = Math.min(18, Math.max(3, Number(c.config.maxSpeed || 9)));
                    var vmx = (heldKeys.has('KeyD') || heldKeys.has('ArrowRight') ? 1 : 0) - (heldKeys.has('KeyA') || heldKeys.has('ArrowLeft') ? 1 : 0);
                    var vmz = (heldKeys.has('KeyS') || heldKeys.has('ArrowDown') ? 1 : 0) - (heldKeys.has('KeyW') || heldKeys.has('ArrowUp') ? 1 : 0);
                    var vLen = Math.hypot(vmx, vmz);
                    if (vLen > 0) {
                      o.vx = (vmx / vLen) * vSpd; o.vz = (vmz / vLen) * vSpd;
                      o.t3.x += o.vx * stepDt; o.t3.z += o.vz * stepDt;
                      o.t3.ry = Math.atan2(o.vx, o.vz) / DEG2RAD;
                    }
                    primaryPlayer3d.t3.x = o.t3.x; primaryPlayer3d.t3.y = o.t3.y + 0.6; primaryPlayer3d.t3.z = o.t3.z;
                  }
                }
              } else if (c.type === 'survival.vitals') {
                var hgn = Math.max(0, Number(variables.get('hambre') !== undefined ? variables.get('hambre') : 100) - (Number(c.config.hungerDrainPerMin || 3) / 60) * stepDt);
                var ths = Math.max(0, Number(variables.get('sed') !== undefined ? variables.get('sed') : 100) - (Number(c.config.thirstDrainPerMin || 4) / 60) * stepDt);
                variables.set('hambre', hgn); variables.set('sed', ths);
                if (hgn <= 0 || ths <= 0) { o.hp = Math.max(0, o.hp - 2 * stepDt); variables.set('salud', Math.round(o.hp)); }
              } else if (c.type === 'world.day_night_weather') {
                var cycS = Math.max(10, Number(c.config.cycleSeconds || 120));
                var todW = Number((((activeSim.elapsedTime % cycS) / cycS) * 24).toFixed(2));
                activeSim.sunOverride.timeOfDay = todW;
                variables.set('hora_dia', todW);
              } else if (c.type === 'world.crop_farm') {
                var crpK = 'crop3d:' + o.id;
                var crpSec = Math.max(1, Number(c.config.growthTimeSec || 12));
                var crpCur = Math.min(crpSec, (activeSim.mechanicTimers.get(crpK) || 0) + stepDt);
                activeSim.mechanicTimers.set(crpK, crpCur);
                var cFrac = crpCur / crpSec;
                o.t3.sy = Math.max(0.25, 0.4 + 0.6 * cFrac);
                if (cFrac >= 1 && primaryPlayer3d && jpStep.has('KeyE') && Math.hypot(primaryPlayer3d.t3.x - o.t3.x, primaryPlayer3d.t3.z - o.t3.z) <= 3.2) {
                  var crpItem = String(c.config.harvestItem || 'trigo');
                  variables.set('inv_' + crpItem, Number(variables.get('inv_' + crpItem) || 0) + 1);
                  activeSim.mechanicTimers.set(crpK, 0);
                  playSfx('coin', 0.75, o.t3);
                }
              } else if (c.type === 'world.fire_status') {
                var rFr = Number(c.config.radius || 2.2);
                var radFr = rFr > 12 ? rFr / 25 : rFr;
                var dpsF = Math.max(0, Number(c.config.damagePerSec || 8));
                for (var fi = 0; fi < objs.length; fi++) {
                  var candF = objs[fi];
                  if (!candF.visible || candF.id === o.id) continue;
                  if (Math.hypot(candF.t3.x - o.t3.x, candF.t3.z - o.t3.z) <= radFr) {
                    candF.hp = Math.max(0, candF.hp - dpsF * stepDt);
                    if (primaryPlayer3d && candF.id === primaryPlayer3d.id) variables.set('salud', Math.round(candF.hp));
                  }
                }
              } else if (c.type === 'rpg.loot_drop' && o.hp <= 0 && !c._dropped) {
                c._dropped = true;
                var li = String(c.config.itemId || 'gold_coin');
                variables.set('inv_' + li, (Number(variables.get('inv_' + li) || 0) || 0) + Math.max(1, Math.round(Number(c.config.minAmount || 1))));
              } else if (c.type === 'rpg.quest_giver') {
                var qK = 'quest3d:' + c.id;
                if (!activeSim.mechanicTimers.has(qK) && primaryPlayer3d && Math.hypot(primaryPlayer3d.t3.x - o.t3.x, primaryPlayer3d.t3.z - o.t3.z) <= 3.5) {
                  var tIt = String(c.config.targetItem || 'crystal');
                  var reqA = Math.max(1, Math.round(Number(c.config.requiredAmount || 3)));
                  if (Number(variables.get('inv_' + tIt) || 0) >= reqA) {
                    activeSim.mechanicTimers.set(qK, 1);
                    var rwd = Number(c.config.rewardPoints || 100);
                    variables.set('puntos', Number(variables.get('puntos') || 0) + rwd);
                    activeSim.activeToasts.push({ id: qK, text: 'Misión completada (+' + rwd + ' pts)', remaining: 3 });
                    playSfx('win', 0.9, o.t3);
                  }
                }
              } else if (c.type === 'rpg.shop_vendor') {
                var bKey = String(c.config.buyKey || 'KeyE');
                if (jpStep.has(bKey) && primaryPlayer3d && Math.hypot(primaryPlayer3d.t3.x - o.t3.x, primaryPlayer3d.t3.z - o.t3.z) <= 3.5) {
                  var price = Math.max(1, Number(c.config.price || 25));
                  var sItem = String(c.config.itemId || 'potion');
                  var curP = Number(variables.get('puntos') || 0);
                  if (curP >= price) {
                    variables.set('puntos', curP - price);
                    variables.set('inv_' + sItem, Number(variables.get('inv_' + sItem) || 0) + 1);
                    playSfx('coin', 0.85, o.t3);
                  }
                }
              } else if (c.type === 'ai.stealth_sensor') {
                var rStl = Number(c.config.visionRange || 9);
                var radStl = rStl > 30 ? rStl / 25 : rStl;
                var stlK = 'stealth3d:' + c.id;
                var remStl = Math.max(0, (activeSim.mechanicTimers.get(stlK) || 0) - stepDt);
                if (primaryPlayer3d && Math.hypot(primaryPlayer3d.t3.x - o.t3.x, primaryPlayer3d.t3.z - o.t3.z) <= radStl && remStl <= 0) {
                  activeSim.mechanicTimers.set(stlK, 1.5);
                  activeSim.queuedEvents.push('player_spotted');
                } else {
                  activeSim.mechanicTimers.set(stlK, remStl);
                }
              } else if (c.type === 'ui.menu_nav') {
                var tScId = String(c.config.targetSceneId || '');
                if (jpStep.has('Enter') && tScId) loadScene3D(tScId);
              } else if (c.type === 'persistence.player_save') {
                var psK = 'psave3d:' + c.id;
                var iv = Math.max(3, Number(c.config.autoSaveSec || 15));
                var ac = (activeSim.mechanicTimers.get(psK) || 0) + stepDt;
                if (ac >= iv) {
                  activeSim.mechanicTimers.set(psK, 0);
                  try {
                    var saveObj = {};
                    variables.forEach(function (v, k) { saveObj[k] = v; });
                    localStorage.setItem('nexus_save_' + (gameData.name || 'game'), JSON.stringify(saveObj));
                  } catch (_) {}
                } else { activeSim.mechanicTimers.set(psK, ac); }
              } else if (c.type === 'combat.projectile_spawner') {
                var fKey = String(c.config.fireKey || 'KeyF');
                var pCdK = 'proj3d_cd:' + c.id;
                var pCd = Math.max(0, (activeSim.mechanicTimers.get(pCdK) || 0) - stepDt);
                activeSim.mechanicTimers.set(pCdK, pCd);
                var wantsF = c.config.autoFire ? true : (heldKeys.has(fKey) || jpStep.has(fKey));
                if (wantsF && pCd <= 0) {
                  activeSim.mechanicTimers.set(pCdK, Math.max(0.1, Number(c.config.cooldownSec !== undefined ? c.config.cooldownSec : 0.35)));
                  var yRad = (o.t3.ry || 0) * DEG2RAD;
                  var dX = Math.sin(yRad), dZ = Math.cos(yRad);
                  var rSp = Number(c.config.speed || 18);
                  var sp3 = rSp > 40 ? rSp / 25 : rSp;
                  var pHnd = makeScriptApi3D(stepDt).spawn.primitive('sphere', {
                    name: 'Proj_' + o.name, x: o.t3.x + dX * 1.1, y: o.t3.y + 0.7, z: o.t3.z + dZ * 1.1,
                    sx: 0.35, sy: 0.35, sz: 0.35, color: String(c.config.color || '#facc15'), physics: false
                  });
                  var rawPrj = pHnd && objs.find(function (x) { return x.id === pHnd.id; });
                  if (rawPrj) {
                    rawPrj.vx = dX * sp3; rawPrj.vz = dZ * sp3; rawPrj.layer = 'Projectile';
                    rawPrj.source.components.push({
                      id: 'prj3_' + Date.now() + '_' + activeSim.spawnCounter,
                      type: 'projectile_3d', enabled: true,
                      config: { ownerId: o.id, damage: Math.max(1, Number(c.config.damage || 25)), lifetimeSec: Number(c.config.lifetimeSec || 2.2), isEnemy: o.layer === 'Enemy' }
                    });
                  }
                  playSfx(String(c.config.soundAssetId || 'powerup'), 0.7, o.t3);
                }
              } else if (c.type === 'combat.melee_attack') {
                var mKey = String(c.config.attackKey || 'KeyJ');
                var mCdK = 'melee3d_cd:' + c.id;
                var mCd = Math.max(0, (activeSim.mechanicTimers.get(mCdK) || 0) - stepDt);
                activeSim.mechanicTimers.set(mCdK, mCd);
                if ((jpStep.has(mKey) || jpStep.has('KeyE')) && mCd <= 0) {
                  activeSim.mechanicTimers.set(mCdK, Math.max(0.15, Number(c.config.cooldownSec !== undefined ? c.config.cooldownSec : 0.45)));
                  var rReach = Number(c.config.range || 3.0);
                  var reach = rReach > 15 ? rReach / 25 : rReach;
                  var mDmg = Math.max(1, Number(c.config.damage || 30));
                  var knk = Number(c.config.knockback || 6);
                  var yM = (o.t3.ry || 0) * DEG2RAD;
                  var hxM = o.t3.x + Math.sin(yM) * (reach * 0.5), hzM = o.t3.z + Math.cos(yM) * (reach * 0.5);
                  for (var mi = 0; mi < objs.length; mi++) {
                    var cM = objs[mi];
                    if (!cM.visible || cM.id === o.id) continue;
                    var isEn = cM.layer === 'Enemy' || (cM.tags || []).some(function (t) { var lw = String(t).toLowerCase(); return lw === 'enemy' || lw === 'enemigo'; }) || (cM.source.components || []).some(function (cc) { return cc.enabled && (cc.type === 'health' || cc.type === 'combat.health_system'); });
                    if (isEn && Math.hypot(cM.t3.x - hxM, cM.t3.z - hzM) <= reach) {
                      cM.hp = Math.max(0, cM.hp - mDmg);
                      var kdx = cM.t3.x - o.t3.x, kdz = cM.t3.z - o.t3.z, kl = Math.hypot(kdx, kdz) || 1;
                      cM.vx += (kdx / kl) * knk; cM.vz += (kdz / kl) * knk; cM.vy = Math.max(cM.vy, 3.2);
                      burstParticles3D(cM.t3.x, cM.t3.y + 0.6, cM.t3.z, 10, getParticleDefaults3D('sparks'));
                      if (cM.hp <= 0) cM.visible = false;
                    }
                  }
                  playSfx('hit', 0.85, o.t3);
                }
              } else if (c.type === 'combat.homing_missile') {
                var tTag = String(c.config.targetTag || 'Enemy');
                var hSpd = Number(c.config.speed || 12), tRt = Number(c.config.turnSpeed || 5.5);
                var nearH = objs.filter(function (x) { return x.visible && x.id !== o.id && (x.layer === tTag || (x.tags || []).indexOf(tTag) >= 0); })
                  .sort(function (a, b) { return Math.hypot(a.t3.x - o.t3.x, a.t3.z - o.t3.z) - Math.hypot(b.t3.x - o.t3.x, b.t3.z - o.t3.z); })[0];
                if (nearH) {
                  var hdx = nearH.t3.x - o.t3.x, hdy = nearH.t3.y + 0.5 - o.t3.y, hdz = nearH.t3.z - o.t3.z, hdl = Math.hypot(hdx, hdy, hdz) || 1;
                  o.vx += ((hdx / hdl) * hSpd - o.vx) * Math.min(1, tRt * stepDt);
                  o.vy += ((hdy / hdl) * hSpd - o.vy) * Math.min(1, tRt * stepDt);
                  o.vz += ((hdz / hdl) * hSpd - o.vz) * Math.min(1, tRt * stepDt);
                  o.t3.x += o.vx * stepDt; o.t3.y += o.vy * stepDt; o.t3.z += o.vz * stepDt;
                  o.t3.ry = Math.atan2(o.vx, o.vz) / DEG2RAD;
                  if (hdl <= 0.9) {
                    nearH.hp = Math.max(0, nearH.hp - Number(c.config.damage || 35));
                    if (nearH.hp <= 0) nearH.visible = false;
                    o.visible = false;
                  }
                }
              } else if (c.type === 'ai.turret_shooter') {
                var rTr = Number(c.config.range || 18);
                var rngT = rTr > 40 ? rTr / 20 : rTr;
                if (primaryPlayer3d && primaryPlayer3d.visible && primaryPlayer3d.id !== o.id) {
                  var tdx = primaryPlayer3d.t3.x - o.t3.x, tdz = primaryPlayer3d.t3.z - o.t3.z, tdL = Math.hypot(tdx, tdz);
                  if (tdL <= rngT) {
                    o.t3.ry = lerpAngleDeg3D(o.t3.ry, Math.atan2(tdx, tdz) / DEG2RAD, Math.min(1, 8 * stepDt));
                    var tCdK = 'turret3d_cd:' + c.id;
                    var tCd = Math.max(0, (activeSim.mechanicTimers.get(tCdK) || 0) - stepDt);
                    if (tCd <= 0) {
                      activeSim.mechanicTimers.set(tCdK, Math.max(0.3, Number(c.config.fireIntervalSec || 1.4)));
                      var dlT = tdL || 1, spT = Number(c.config.projectileSpeed || 14);
                      var tHnd = makeScriptApi3D(stepDt).spawn.primitive('sphere', {
                        name: 'TurretShot_' + o.name, x: o.t3.x + (tdx / dlT) * 1.1, y: o.t3.y + 0.8, z: o.t3.z + (tdz / dlT) * 1.1,
                        sx: 0.35, sy: 0.35, sz: 0.35, color: '#f87171', physics: false
                      });
                      var rTP = tHnd && objs.find(function (x) { return x.id === tHnd.id; });
                      if (rTP) {
                        rTP.vx = (tdx / dlT) * spT; rTP.vz = (tdz / dlT) * spT; rTP.layer = 'Projectile';
                        rTP.source.components.push({
                          id: 'tprj3_' + Date.now() + '_' + activeSim.spawnCounter,
                          type: 'projectile_3d', enabled: true,
                          config: { ownerId: o.id, damage: Number(c.config.damage || 15), lifetimeSec: 2.5, isEnemy: true }
                        });
                      }
                    } else { activeSim.mechanicTimers.set(tCdK, tCd); }
                  }
                }
              } else if (c.type === 'projectile_3d') {
                var lf = Number(c.config.lifetimeSec !== undefined ? c.config.lifetimeSec : 2.0) - stepDt;
                c.config.lifetimeSec = lf;
                o.t3.x += o.vx * stepDt; o.t3.y += o.vy * stepDt; o.t3.z += o.vz * stepDt;
                if (lf <= 0) { o.visible = false; }
                else {
                  var ownId = String(c.config.ownerId || ''), isEnP = Boolean(c.config.isEnemy), pDmg = Number(c.config.damage || 20);
                  for (var pi3 = 0; pi3 < objs.length; pi3++) {
                    var cP = objs[pi3];
                    if (!cP.visible || cP.id === o.id || cP.id === ownId || cP.type !== 'mesh_3d') continue;
                    var isPlC = Boolean(primaryPlayer3d && cP.id === primaryPlayer3d.id);
                    if (isEnP && !isPlC) continue;
                    if (!isEnP && isPlC) continue;
                    var hitOk = isPlC || cP.layer === 'Enemy' || (cP.tags || []).some(function (t) { var lw = String(t).toLowerCase(); return lw === 'enemy' || lw === 'enemigo'; }) || (cP.source.components || []).some(function (cc) { return cc.enabled && (cc.type === 'health' || cc.type === 'combat.health_system'); });
                    if (!hitOk) continue;
                    if (Math.hypot(cP.t3.x - o.t3.x, cP.t3.y - o.t3.y, cP.t3.z - o.t3.z) <= 1.05) {
                      cP.hp = Math.max(0, cP.hp - pDmg);
                      if (isPlC) variables.set('salud', Math.round(cP.hp));
                      else if (cP.hp <= 0) cP.visible = false;
                      o.visible = false;
                      playSfx('hit', 0.75, o.t3);
                      break;
                    }
                  }
                }
              }
            });
            if (o.source.aiAgent && o.source.aiAgent.enabled && o.source.aiAgent.mode !== 'idle') {
              var ai = o.source.aiAgent;
              var tgt = (ai.targetObjectId ? objs.find(function (x) { return x.id === ai.targetObjectId; }) : null) || primaryPlayer3d;
              if (ai.mode === 'chase' && tgt && tgt.visible) {
                steerSmartEnemyRt3D(o, tgt, {
                  baseSpeed: ai.speed || 3.8,
                  detectRadius: ai.maxChaseDistance || ai.visionRange || 32,
                  stopDist: ai.stoppingDistance || 1.2,
                  visionFovDeg: ai.visionFovDeg !== undefined ? ai.visionFovDeg : 130,
                  visionRange: ai.visionRange !== undefined ? ai.visionRange : (ai.maxChaseDistance || 28),
                  requireLineOfSight: ai.requireLineOfSight !== false,
                  canJumpObstacles: ai.canJumpObstacles !== false,
                  maxJumpHeight: ai.maxJumpHeight !== undefined ? ai.maxJumpHeight : 2.1,
                  fleeHealthRatio: ai.fleeHealthRatio !== undefined ? ai.fleeHealthRatio : 0.28,
                  insistDamageRatio: ai.insistDamageRatio !== undefined ? ai.insistDamageRatio : 0.45
                }, stepDt);
              } else {
                var gx = ai.targetX || o.t3.x;
                var gz = ai.targetZ || o.t3.z;
                if (Math.hypot(gx - o.t3.x, gz - o.t3.z) > (ai.stoppingDistance || 1.2)) {
                  o.navTimer -= stepDt;
                  if (o.navTimer <= 0 || !o.navPath.length) {
                    o.navTimer = 0.35;
                    o.navPath = findAStarPath(currentScene.navMesh, o.t3.x, o.t3.z, gx, gz);
                  }
                  var wp = o.navPath[0] || { x: gx, z: gz };
                  var dx = wp.x - o.t3.x, dz = wp.z - o.t3.z, dl = Math.hypot(dx, dz) || 1;
                  o.vx = (dx / dl) * (ai.speed || 3.8); o.vz = (dz / dl) * (ai.speed || 3.8);
                  o.t3.ry = Math.atan2(o.vx, o.vz) / DEG2RAD;
                  if (dl < 0.7 && o.navPath.length > 1) o.navPath.shift();
                } else { o.vx *= 0.8; o.vz *= 0.8; }
              }
            }
          });

          var curCollisions = new Set();
          dynamicBodies.forEach(function (b) {
            var vCfg = b.source.vehicle, vState = activeSim.vehicleSims.get(b.id);
            if (vCfg && vCfg.enabled && vState) {
              if (!shouldStepVehiclePhysics(vState.x, vState.y, vState.z, camera.position.x, camera.position.y, camera.position.z, vCfg)) return;
              var pControls = !primaryPlayer3d || activeSim.mountedVehicleId === b.id || b.id === primaryPlayer3d.id;
              var thr = 0, str = 0, pitchIn = 0, ascendIn = 0, yawIn = 0;
              if (pControls) {
                thr = (heldKeys.has('KeyW') || heldKeys.has('ArrowUp') ? 1 : 0) - (heldKeys.has('KeyS') || heldKeys.has('ArrowDown') ? 1 : 0);
                str = (heldKeys.has('KeyD') || heldKeys.has('ArrowRight') ? 1 : 0) - (heldKeys.has('KeyA') || heldKeys.has('ArrowLeft') ? 1 : 0);
                if (heldKeys.has('Space')) ascendIn += 1;
                if (heldKeys.has('ShiftLeft') || heldKeys.has('ControlLeft')) ascendIn -= 1;
                if (heldKeys.has('KeyQ')) yawIn -= 1;
                if (heldKeys.has('KeyE') && !activeSim.mountedVehicleId) yawIn += 1;
                if (heldKeys.has('ArrowUp')) pitchIn -= 1;
                if (heldKeys.has('ArrowDown')) pitchIn += 1;
                if (thr === 0 && Math.abs(moveAxisY) > 0.05) thr = -moveAxisY;
                if (str === 0 && Math.abs(moveAxisX) > 0.05) str = moveAxisX;
              }
              var vKind = vCfg.vehicleKind || 'car';
              var pSplineId = vCfg.patrolSplineId || b.source.followSplineId;
              var pSpline = pSplineId && currentScene.splines3d ? currentScene.splines3d.find(function (sp) { return sp.id === pSplineId; }) : null;
              if (pSpline && pSpline.points && pSpline.points.length >= 2 && !activeSim.mountedVehicleId) {
                var cT = activeSim.splineProgress.get(b.id) || 0;
                var nT = pSpline.closed ? (cT + Math.max(0.02, (vCfg.maxSpeed || 14) * 0.008) * stepDt) % 1 : Math.min(1, cT + Math.max(0.02, (vCfg.maxSpeed || 14) * 0.008) * stepDt);
                activeSim.splineProgress.set(b.id, nT);
                var spPt = sampleSpline3D(pSpline.points, pSpline.closed, nT);
                vState.prevX = vState.x; vState.prevY = vState.y; vState.prevZ = vState.z;
                vState.vx = (spPt.x - vState.x) / Math.max(0.001, stepDt);
                vState.vy = (spPt.y - vState.y) / Math.max(0.001, stepDt);
                vState.vz = (spPt.z - vState.z) / Math.max(0.001, stepDt);
                vState.x = spPt.x; vState.y = spPt.y; vState.z = spPt.z;
                vState.yawRad = Math.atan2(spPt.tx, spPt.tz);
                vState.speedForward = Math.hypot(vState.vx, vState.vz);
                vState.propellerSpinRad += 14 * stepDt;
              } else if (vKind === 'boat') {
                var lnkW = vCfg.waterObjectId ? objs.find(function (w) { return w.id === vCfg.waterObjectId && w.source.mesh3d && w.source.mesh3d.waterConfig; }) : objs.find(function (w) { return w.source.mesh3d && w.source.mesh3d.shape === 'water' && w.source.mesh3d.waterConfig; });
                stepBoatVehicle(vState, vCfg, thr, str, stepDt, function (wx, wz) {
                  if (!lnkW || !lnkW.source.mesh3d || !lnkW.source.mesh3d.waterConfig) return groundHeightAt(objs, wx, wz);
                  var wh = sampleWaterWaveHeightAt(lnkW.t3.x, lnkW.t3.y, lnkW.t3.z, lnkW.source.mesh3d.waterConfig, wx, wz, activeSim.elapsedTime);
                  return wh !== null ? wh : groundHeightAt(objs, wx, wz);
                });
              } else if (vKind === 'plane') {
                var pPitch = pitchIn !== 0 ? pitchIn : (heldKeys.has('Space') ? 0.85 : (heldKeys.has('ShiftLeft') ? -0.85 : 0));
                stepPlaneVehicle(vState, vCfg, thr, pPitch, -str, yawIn, stepDt, function (wx, wz) { return groundHeightAt(objs, wx, wz); });
              } else if (vKind === 'spaceship') {
                stepSpaceshipVehicle(vState, vCfg, thr, str, ascendIn, yawIn, pitchIn, 0, stepDt);
              } else {
                var sampleDriveGroundY = function (wx, wz) {
                  var bestY = null;
                  for (var si = 0; si < staticSolids.length; si++) {
                    var sol = staticSolids[si];
                    var sm3 = sol.source.mesh3d;
                    if (sm3 && (sm3.shape === 'water' || sm3.shape === 'grass_field')) continue;
                    if (sol.source.physics3d && sol.source.physics3d.isTrigger) continue;
                    if (sm3 && sm3.shape === 'terrain' && sm3.terrainData) {
                      var th = sampleTerrainHeightAt(sol, wx, wz);
                      if (th !== null && (bestY === null || th > bestY)) bestY = th;
                      continue;
                    }
                    if (sol.source.navRole === 'ignore') continue;
                    var solWH = getWorldT3AndHe(sol, objs);
                    var solW = solWH.w;
                    var ryRad = (solW.ry || 0) * DEG2RAD;
                    var cosR = Math.cos(ryRad), sinR = Math.sin(ryRad);
                    var dxW = wx - solW.x, dzW = wz - solW.z;
                    var lx = dxW * cosR - dzW * sinR;
                    var lz = dxW * sinR + dzW * cosR;
                    if (Math.abs(lx) > solWH.hx || Math.abs(lz) > solWH.hz) continue;
                    if (sm3 && sm3.shape === 'ramp') {
                      var frac = Math.max(0, Math.min(1, (lx + solWH.hx) / Math.max(0.01, solWH.hx * 2)));
                      var rampY = solW.y + solWH.hy - frac * (solWH.hy * 2);
                      if (rampY <= vState.y + 1.15 && (bestY === null || rampY > bestY)) bestY = rampY;
                      continue;
                    }
                    var topY = solW.y + solWH.hy;
                    if (topY <= vState.y + 0.72 && (bestY === null || topY > bestY)) bestY = topY;
                  }
                  return bestY !== null ? bestY : 0;
                };
                stepVehicle4W(vState, vCfg, thr, str, stepDt, sampleDriveGroundY);
                var vehWH = getWorldT3AndHe(b, objs);
                var colRx = Math.min(vehWH.hx, vehWH.hz) * 0.85;
                var colHy = Math.max(0.35, vehWH.hy * 0.75);
                for (var svi = 0; svi < staticSolids.length; svi++) {
                  var sSol = staticSolids[svi];
                  var sM3 = sSol.source.mesh3d;
                  if (!sM3 || sM3.shape === 'terrain' || sM3.shape === 'water' || sM3.shape === 'ramp' || sM3.shape === 'plane' || (sSol.source.physics3d && sSol.source.physics3d.isTrigger)) continue;
                  var sWH = getWorldT3AndHe(sSol, objs);
                  if (sWH.w.y + sWH.hy <= vState.y - vehWH.hy + 0.35) continue;
                  var oResV = resolveBodyVsOBB3D(vState.x, vState.y, vState.z, colRx, colHy, colRx, sWH.w.x, sWH.w.y, sWH.w.z, sWH.hx, sWH.hy, sWH.hz, sWH.w.rx || 0, sWH.w.ry || 0, sWH.w.rz || 0);
                  if (oResV && oResV.collided && oResV.hitWall) {
                    vState.x += oResV.dx; vState.z += oResV.dz;
                    var vnV = vState.vx * oResV.wallNx + vState.vz * oResV.wallNz;
                    if (vnV < 0) {
                      vState.vx -= vnV * oResV.wallNx * 1.15;
                      vState.vz -= vnV * oResV.wallNz * 1.15;
                      vState.speedForward = vState.vx * Math.sin(vState.yawRad) + vState.vz * Math.cos(vState.yawRad);
                    }
                  }
                }
              }
              b.t3.x = vState.x; b.t3.y = vState.y; b.t3.z = vState.z;
              b.t3.ry = vState.yawRad / DEG2RAD; b.t3.rx = vState.pitchRad / DEG2RAD; b.t3.rz = vState.rollRad / DEG2RAD;
              b.vx = vState.vx; b.vy = vState.vy; b.vz = vState.vz;
              b.isGrounded = vKind === 'boat' ? vState.pontoons.some(function (pt) { return pt.submerged > 0; }) : vState.wheels.some(function (w) { return w.grounded; });
              if (vKind === 'spaceship' && vCfg.localGravityBox && vCfg.localGravityBox.enabled && primaryPlayer3d && activeSim.mountedActorId !== primaryPlayer3d.id) {
                var lg = applyLocalGravityZone(vState, vCfg.localGravityBox, primaryPlayer3d.t3, Math.max(0.4, Math.abs(primaryPlayer3d.t3.sy) * 0.5));
                if (lg.inside) { primaryPlayer3d.t3.x = lg.nextX; primaryPlayer3d.t3.y = lg.nextY; primaryPlayer3d.t3.z = lg.nextZ; if (primaryPlayer3d.vy < 0) primaryPlayer3d.vy = 0; primaryPlayer3d.isGrounded = true; }
              }
              var wMs = vehicleWheelMeshes.get(b.id);
              if (wMs) {
                var wSliceStep = vKind === 'moto' ? [0, 2] : [0, 1, 2, 3];
                wMs.forEach(function (wm, wi) {
                  var wh = vState.wheels[wSliceStep[wi] !== undefined ? wSliceStep[wi] : wi];
                  wm.position.set(wh.worldX, wh.worldY, wh.worldZ);
                  wm.rotation.set(wh.spinRad, vState.yawRad - wh.steerAngleRad, vState.rollRad, 'YZX');
                });
              }
              if (vCfg.parts) {
                var restL = Math.max(0.2, vCfg.suspensionRestLen || 0.65);
                var cosP = Math.cos(vState.pitchRad), sinP = Math.sin(vState.pitchRad);
                var cosR = Math.cos(vState.rollRad), sinR = Math.sin(vState.rollRad);
                var cosTilt = Math.max(0.35, cosR * cosP);
                var minLY = -(restL * 1.45 + 0.35), maxLY = restL * 0.45 + 0.35;
                [vCfg.parts.wheelFL, vCfg.parts.wheelFR, vCfg.parts.wheelRL, vCfg.parts.wheelRR].forEach(function (pid, wIdx) {
                  if (!pid) return;
                  var pn = meshBindings.get(pid), ps = objs.find(function (x) { return x.id === pid; }), wh = vState.wheels[wIdx];
                  if (pn && ps && wh) {
                    var targetLY = (wh.worldY - vState.y - ps.t3.x * sinR * cosP + ps.t3.z * sinP) / cosTilt;
                    var clampedLY = Math.max(minLY, Math.min(maxLY, targetLY));
                    pn.position.set(ps.t3.x, clampedLY, ps.t3.z);
                    var bq = new THREE.Quaternion().setFromEuler(new THREE.Euler((ps.t3.rx || 0) * DEG2RAD, (ps.t3.ry || 0) * DEG2RAD, (ps.t3.rz || 0) * DEG2RAD, 'XYZ'));
                    var rq = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), wh.spinRad);
                    var sq = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), -wh.steerAngleRad);
                    pn.quaternion.copy(sq).multiply(rq).multiply(bq);
                  }
                });
                if (vCfg.parts.propellerId) {
                  var prN = meshBindings.get(vCfg.parts.propellerId), prS = objs.find(function (x) { return x.id === vCfg.parts.propellerId; });
                  if (prN && prS) prN.rotation.set((prS.t3.rx || 0) * DEG2RAD, (prS.t3.ry || 0) * DEG2RAD, vState.propellerSpinRad, 'XYZ');
                }
              }
              return;
            }

            var bP3d = b.source.physics3d || {};
            b.vy += -20 * (bP3d.gravityScale !== undefined ? bP3d.gravityScale : 1) * stepDt;
            b.isGrounded = false;
            var ax = (bP3d.shape === 'sphere' && bP3d.radius) ? bP3d.radius : (bP3d.halfExtents && bP3d.halfExtents.x) || Math.max(0.2, Math.abs(b.t3.sx) * 0.5);
            var ay = (bP3d.shape === 'sphere' && bP3d.radius) ? bP3d.radius : (bP3d.halfExtents && bP3d.halfExtents.y) || Math.max(0.2, Math.abs(b.t3.sy) * 0.5);
            var az = (bP3d.shape === 'sphere' && bP3d.radius) ? bP3d.radius : (bP3d.halfExtents && bP3d.halfExtents.z) || Math.max(0.2, Math.abs(b.t3.sz) * 0.5);
            var bodyOff = getColliderOffset3D(b.t3, bP3d.offset);
            var subSteps = Math.min(4, Math.max(1, Math.ceil(Math.hypot(b.vx * stepDt, b.vz * stepDt) / Math.max(0.15, Math.min(ax, az) * 0.55))));
            var subDt = stepDt / subSteps;

            for (var sub = 0; sub < subSteps; sub++) {
              b.t3.x += b.vx * subDt; b.t3.y += b.vy * subDt; b.t3.z += b.vz * subDt;
              staticSolids.forEach(function (s) {
                var sm3 = s.source.mesh3d;
                var sw = getWorldT3(s, objs);
                var bCx = b.t3.x + bodyOff.x, bCy = b.t3.y + bodyOff.y, bCz = b.t3.z + bodyOff.z;
                if (sm3 && sm3.shape === 'terrain' && sm3.terrainData) {
                  var surfY = sampleTerrainHeightAt(s, bCx, bCz);
                  if (surfY !== null && bCy - ay <= surfY) {
                    b.t3.y = surfY + ay - bodyOff.y; if (b.vy < 0) b.vy = 0; b.isGrounded = true;
                    curCollisions.add([b.id, s.id].sort().join('|'));
                  }
                  return;
                }
                if (sm3 && sm3.shape === 'water' && sm3.waterConfig) {
                  if (sub > 0) return;
                  var wc = sm3.waterConfig, hw = Math.max(2, wc.width * 0.5), hd = Math.max(2, wc.depth * 0.5);
                  if (Math.abs(bCx - sw.x) <= hw && Math.abs(bCz - sw.z) <= hd && bCy - ay <= sw.y + 0.35) {
                    b.vx += (wc.flowX || 0) * 1.8 * stepDt; b.vz += (wc.flowZ || 0) * 1.8 * stepDt;
                    b.vy += 12 * stepDt; b.vy *= Math.max(0, 1 - 2.5 * stepDt);
                    var wb = waterBindings.get(s.id);
                    if (wb) { wb.uniforms.uPlayerPos.value.set(bCx, sw.y, bCz); }
                    if (!activeSim.inWaterObjects.has(b.id)) {
                      activeSim.inWaterObjects.add(b.id);
                      if (wb) wb.uniforms.uSplashTime.value = activeSim.elapsedTime;
                      burstParticles3D(bCx, sw.y + 0.25, bCz, 12, { colorStart: '#e0f2fe', speedMin: 30, speedMax: 80, sizeStart: 0.28, lifetime: 0.5 });
                    }
                  } else { activeSim.inWaterObjects.delete(b.id); }
                  return;
                }
                var sP3d = s.source.physics3d || {};
                var isTri = sP3d.shape === 'mesh_exact' || (sm3 && (sm3.shape === 'arch' || sm3.shape === 'stairs' || (sm3.shape === 'ramp' && Math.abs((sw.ry || 0) % 360) > 1)));
                if (isTri) {
                  var tri = trimeshCache.get(s.id);
                  if (tri === undefined) { tri = buildWorldTrimeshForObject(s); trimeshCache.set(s.id, tri); }
                  if (tri) {
                    var tres = resolveBodyVsTrimesh(bCx, bCy, bCz, ax, ay, az, tri);
                    if (tres.collided) {
                      b.t3.x += tres.dx; b.t3.y += tres.dy; b.t3.z += tres.dz;
                      if (tres.hitFloor) { if (b.vy < 0) b.vy = 0; b.isGrounded = true; }
                      if (tres.hitCeiling && b.vy > 0) b.vy = 0;
                      if (tres.hitWall && (tres.wallNx || tres.wallNz)) {
                        var vnT = b.vx * tres.wallNx + b.vz * tres.wallNz;
                        if (vnT < 0) { b.vx -= vnT * tres.wallNx; b.vz -= vnT * tres.wallNz; }
                      }
                      curCollisions.add([b.id, s.id].sort().join('|'));
                    }
                    return;
                  }
                }
                var bx = (sP3d.shape === 'sphere' && sP3d.radius) ? sP3d.radius : (sP3d.halfExtents && sP3d.halfExtents.x) || Math.max(0.2, Math.abs(sw.sx) * 0.5);
                var by = (sP3d.shape === 'sphere' && sP3d.radius) ? sP3d.radius : (sP3d.halfExtents && sP3d.halfExtents.y) || Math.max(0.1, Math.abs(sw.sy) * 0.5);
                var bz = (sP3d.shape === 'sphere' && sP3d.radius) ? sP3d.radius : (sP3d.halfExtents && sP3d.halfExtents.z) || Math.max(0.2, Math.abs(sw.sz) * 0.5);
                var solOff = getColliderOffset3D(sw, sP3d.offset);
                var sCx = sw.x + solOff.x, sCy = sw.y + solOff.y, sCz = sw.z + solOff.z;
                if (sm3 && sm3.shape === 'ramp') {
                  if (bCx + ax > sCx - bx && bCx - ax < sCx + bx && bCz + az > sCz - bz && bCz - az < sCz + bz) {
                    var frac = Math.max(0, Math.min(1, (bCx - (sCx - bx)) / Math.max(0.01, bx * 2)));
                    var rTop = sCy + by - frac * (by * 2);
                    if (bCy - ay <= rTop + 0.15 && bCy >= sCy - by) { b.t3.y = rTop + ay - bodyOff.y; if (b.vy < 0) b.vy = 0; b.isGrounded = true; curCollisions.add([b.id, s.id].sort().join('|')); }
                  }
                  return;
                }
                var ores = resolveBodyVsOBB3D(bCx, bCy, bCz, ax, ay, az, sCx, sCy, sCz, bx, by, bz, sw.rx || 0, sw.ry || 0, sw.rz || 0);
                if (ores.collided) {
                  b.t3.x += ores.dx; b.t3.y += ores.dy; b.t3.z += ores.dz;
                  if (ores.hitFloor) { if (b.vy < 0) b.vy = 0; b.isGrounded = true; }
                  if (ores.hitCeiling && b.vy > 0) b.vy = 0;
                  if (ores.hitWall && (ores.wallNx || ores.wallNz)) {
                    var vnO = b.vx * ores.wallNx + b.vz * ores.wallNz;
                    if (vnO < 0) { b.vx -= vnO * ores.wallNx; b.vz -= vnO * ores.wallNz; }
                  }
                  curCollisions.add([b.id, s.id].sort().join('|'));
                }
              });
            }
            if (b.t3.y < -35) { b.t3.y = 4; b.vy = 0; }
          });

          for (var oi = 0; oi < objs.length; oi++) {
            var oa = objs[oi];
            if (!oa.visible || (oa.type !== 'mesh_3d' && oa.type !== 'container')) continue;
            var oaScriptCollision = (oa.source.scriptBindings || []).some(function (b) {
              if (!b.enabled) return false;
              var sc = compiledScripts.get(b.scriptId);
              return Boolean(sc && sc.hooks && typeof sc.hooks.onCollisionEnter === 'function');
            });
            if (!oaScriptCollision && (!oa.source.physics3d || !oa.source.physics3d.isTrigger)) continue;
            var wA = getWorldT3(oa, objs);
            var hax = (oa.source.physics3d && oa.source.physics3d.halfExtents && oa.source.physics3d.halfExtents.x) || Math.max(0.2, Math.abs(wA.sx) * 0.5);
            var hay = (oa.source.physics3d && oa.source.physics3d.halfExtents && oa.source.physics3d.halfExtents.y) || Math.max(0.2, Math.abs(wA.sy) * 0.5);
            var haz = (oa.source.physics3d && oa.source.physics3d.halfExtents && oa.source.physics3d.halfExtents.z) || Math.max(0.2, Math.abs(wA.sz) * 0.5);
            for (var oj = 0; oj < objs.length; oj++) {
              if (oi === oj) continue;
              var ob = objs[oj];
              if (!ob.visible || (ob.type !== 'mesh_3d' && ob.type !== 'container') || (ob.source.mesh3d && ob.source.mesh3d.shape === 'plane')) continue;
              var wB = getWorldT3(ob, objs);
              var hbx = (ob.source.physics3d && ob.source.physics3d.halfExtents && ob.source.physics3d.halfExtents.x) || Math.max(0.2, Math.abs(wB.sx) * 0.5);
              var hby = (ob.source.physics3d && ob.source.physics3d.halfExtents && ob.source.physics3d.halfExtents.y) || Math.max(0.2, Math.abs(wB.sy) * 0.5);
              var hbz = (ob.source.physics3d && ob.source.physics3d.halfExtents && ob.source.physics3d.halfExtents.z) || Math.max(0.2, Math.abs(wB.sz) * 0.5);
              if (Math.abs(wA.x - wB.x) < hax + hbx && Math.abs(wA.y - wB.y) < hay + hby && Math.abs(wA.z - wB.z) < haz + hbz) {
                curCollisions.add([oa.id, ob.id].sort().join('|'));
              }
            }
          }

          curCollisions.forEach(function (pair) {
            if (!activeSim.prevCollisions.has(pair)) {
              var ps = pair.split('|'), oA = objs.find(function (o) { return o.id === ps[0]; }), oB = objs.find(function (o) { return o.id === ps[1]; });
              if (oA && oB) {
                runMechanics3D('collision.enter', oA, oB);
                runMechanics3D('collision.enter', oB, oA);
                var colApi = makeScriptApi3D(stepDt);
                (oA.source.scriptBindings || []).forEach(function (b) {
                  if (!b.enabled) return;
                  var sc = compiledScripts.get(b.scriptId);
                  if (sc && sc.hooks && typeof sc.hooks.onCollisionEnter === 'function') {
                    var mPrm = Object.assign({}, sc.hooks.params || {}, b.params || {});
                    try { sc.hooks.onCollisionEnter(makeScriptHandle3D(oA, mPrm), makeScriptHandle3D(oB, {}), colApi); } catch (err) { logScriptError3D('onCol:' + b.id, sc.name, err); }
                  }
                });
                (oB.source.scriptBindings || []).forEach(function (b) {
                  if (!b.enabled) return;
                  var sc = compiledScripts.get(b.scriptId);
                  if (sc && sc.hooks && typeof sc.hooks.onCollisionEnter === 'function') {
                    var mPrm = Object.assign({}, sc.hooks.params || {}, b.params || {});
                    try { sc.hooks.onCollisionEnter(makeScriptHandle3D(oB, mPrm), makeScriptHandle3D(oA, {}), colApi); } catch (err) { logScriptError3D('onCol:' + b.id, sc.name, err); }
                  }
                });
              }
            }
          });
          activeSim.prevCollisions = curCollisions;

          runMechanics3D('tick');
          jpStep.forEach(function (k) { runMechanics3D('input.pressed', undefined, undefined, { key: k }); });
          while (activeSim.queuedEvents.length > 0) { runMechanics3D('custom.event', undefined, undefined, { eventName: activeSim.queuedEvents.shift() }); }

          var stepScriptApi = makeScriptApi3D(stepDt);
          (currentScene.scriptIds || []).forEach(function (sid) {
            var se = compiledScripts.get(sid);
            if (se && se.hooks && typeof se.hooks.onUpdate === 'function') {
              try { se.hooks.onUpdate(makeSceneScriptHandle3D(sid, Object.assign({}, se.hooks.params || {})), stepDt, stepScriptApi); } catch (err) { logScriptError3D('onUpdSc:' + sid, se.name, err); }
            }
          });
          objs.forEach(function (o) {
            if (!o.visible) return;
            if (activeStreamState3D) {
              var actSc = activeStreamState3D.objectActivity.get(o.id) || 'near';
              if (actSc === 'far' || actSc === 'unloaded') return;
              if (actSc === 'medium' && (activeStreamState3D.frameIndex % 3) !== 0) return;
            }
            (o.source.scriptBindings || []).forEach(function (b) {
              if (!b.enabled) return;
              var sc = compiledScripts.get(b.scriptId);
              if (sc && sc.hooks && typeof sc.hooks.onUpdate === 'function') {
                var mPrm = Object.assign({}, sc.hooks.params || {}, b.params || {});
                try { sc.hooks.onUpdate(makeScriptHandle3D(o, mPrm), stepDt, stepScriptApi); } catch (err) { logScriptError3D('onUpd:' + b.id, sc.name, err); }
              }
            });
          });
        }
        justPressed.clear();

        var player = primaryPlayer3d || objs[0];
        var playerWorld = player ? getWorldT3(player, objs) : null;
        if (playerWorld) {
          waterBindings.forEach(function (wb) { wb.uniforms.uTime.value = activeSim.elapsedTime; wb.uniforms.uPlayerPos.value.set(playerWorld.x, playerWorld.y, playerWorld.z); });
          foliageBindings.forEach(function (fb) { fb.uniforms.uTime.value = activeSim.elapsedTime; fb.uniforms.uPlayerPos.value.set(playerWorld.x, playerWorld.y, playerWorld.z); });
          if (activeSim.mpSocket && activeSim.mpSocket.readyState === 1 && now - (activeSim.mpLastSend || 0) >= 80) {
            activeSim.mpLastSend = now;
            try {
              activeSim.mpSocket.send(JSON.stringify({
                type: 'state_update',
                roomId: activeSim.mpRoomId || 'sala_global',
                playerId: activeSim.mpPlayerId,
                x: playerWorld.x, y: playerWorld.y, z: playerWorld.z,
                rotY: player.t3.ry || 0, vx: player.vx || 0, vy: player.vy || 0, vz: player.vz || 0,
                animState: player.currentAnimState || 'Idle',
                sceneId: currentScene.id
              }));
            } catch (_) {}
          }
        }

        var actorPush = playerWorld ? { x: playerWorld.x, y: playerWorld.y, z: playerWorld.z, radius: 0.75 } : null;
        activeSim.softBodySims.forEach(function (sbSim, id) {
          stepSoftBody(sbSim, dt, function (wx, wz) { return groundHeightAt(objs, wx, wz); }, actorPush);
          var nms = softBodyMeshes.get(id);
          if (nms) nms.forEach(function (nm, ni) { var nd = sbSim.nodes[ni]; if (nd) nm.position.set(nd.x, nd.y, nd.z); });
        });

        // Seguir Spline 3D en objetos no-vehículo + Ondas Pooled + Estelas Ribbon detrás de botes y entidades
        objs.forEach(function (so) {
          if (so.visible && so.source.followSplineId && !(so.source.vehicle && so.source.vehicle.enabled) && currentScene.splines3d) {
            var sp3 = currentScene.splines3d.find(function (sp) { return sp.id === so.source.followSplineId; });
            if (sp3 && sp3.points && sp3.points.length >= 2) {
              var ct = activeSim.splineProgress.get(so.id) || 0;
              var nt = sp3.closed ? (ct + Math.max(0.02, (so.source.followSplineSpeed || 6) * 0.015) * dt) % 1 : Math.min(1, ct + Math.max(0.02, (so.source.followSplineSpeed || 6) * 0.015) * dt);
              activeSim.splineProgress.set(so.id, nt);
              var spt = sampleSpline3D(sp3.points, sp3.closed, nt);
              so.t3.x = spt.x; so.t3.y = spt.y; so.t3.z = spt.z;
              so.t3.ry = Math.atan2(spt.tx, spt.tz) / DEG2RAD;
            }
          }
          if (so.visible && so.source.mesh3d && so.source.mesh3d.shape === 'water' && so.source.mesh3d.waterConfig) {
            var wc3 = so.source.mesh3d.waterConfig;
            var allowSet = wc3.interactingEntities && wc3.interactingEntities.length > 0 ? new Set(wc3.interactingEntities) : null;
            var entTargets = [];
            objs.forEach(function (ent) {
              if (!ent.visible || ent.id === so.id || (ent.type !== 'mesh_3d' && !(ent.source.vehicle && ent.source.vehicle.enabled))) return;
              if (allowSet && !allowSet.has(ent.id)) return;
              var spdE = Math.hypot(ent.vx || 0, ent.vz || 0);
              if (!allowSet && spdE < 0.05 && !(ent.source.vehicle && ent.source.vehicle.vehicleKind === 'boat')) return;
              var wyE = sampleWaterWaveHeightAt(so.t3.x, so.t3.y, so.t3.z, wc3, ent.t3.x, ent.t3.z, activeSim.elapsedTime);
              var trkKey = so.id + ':' + ent.id;
              var prevTrk = activeSim.waterTrackers.get(trkKey) || { inside: false, rippleCooldown: 0 };
              var hyE = (ent.source.physics3d && ent.source.physics3d.halfExtents && ent.source.physics3d.halfExtents.y) || Math.max(0.2, Math.abs(ent.t3.sy || 1) * 0.5);
              var isInW = wyE !== null && ent.t3.y - hyE <= wyE + 0.35;
              prevTrk.rippleCooldown = Math.max(0, prevTrk.rippleCooldown - dt);
              function triggerRipple3D(rx, ry, rz, maxSc) {
                var sl = ripplePool3D.find(function (r) { return !r.active; }) || ripplePool3D[0];
                if (sl) { sl.active = true; sl.x = rx; sl.y = ry + 0.04; sl.z = rz; sl.age = 0; sl.maxAge = 1.15; sl.scale = 0.1; sl.maxScale = maxSc; sl.opacity = 0.85; }
              }
              if (isInW && !prevTrk.inside && wyE !== null) {
                triggerRipple3D(ent.t3.x, wyE, ent.t3.z, 3.2);
                burstParticles3D(ent.t3.x, wyE + 0.25, ent.t3.z, 10, { colorStart: '#e0f2fe', speedMin: 28, speedMax: 72, sizeStart: 0.26, lifetime: 0.55 });
                prevTrk.rippleCooldown = 0.25;
              } else if (isInW && spdE > 0.1 && prevTrk.rippleCooldown <= 0 && wyE !== null) {
                triggerRipple3D(ent.t3.x, wyE, ent.t3.z, 2.7);
                prevTrk.rippleCooldown = 0.25;
              }
              prevTrk.inside = isInW;
              activeSim.waterTrackers.set(trkKey, prevTrk);
              if (wc3.enableWakeTrail !== false && wyE !== null) {
                var wYaw = (ent.t3.ry || 0) * DEG2RAD;
                var trailObj = wakeTrails3D.get(trkKey);
                if (!trailObj) {
                  var MAX_TP = 32;
                  var tPos = new Float32Array(MAX_TP * 2 * 3);
                  var tGeo = new THREE.BufferGeometry();
                  tGeo.setAttribute('position', new THREE.BufferAttribute(tPos, 3));
                  var tMat = new THREE.MeshBasicMaterial({ color: '#e0f2fe', transparent: true, opacity: 0.48, depthWrite: false, side: THREE.DoubleSide });
                  var tMesh = new THREE.Mesh(tGeo, tMat);
                  tMesh.frustumCulled = false;
                  tMesh.visible = false;
                  worldGroup.add(tMesh);
                  trailObj = { points: [], timer: 0, mesh: tMesh, posArr: tPos, maxPts: MAX_TP };
                  wakeTrails3D.set(trkKey, trailObj);
                }
                trailObj.timer += dt;
                if (spdE > 0.15 && (trailObj.points.length === 0 || trailObj.timer >= 0.06)) {
                  trailObj.timer = 0;
                  var hwTr = Math.max(0.45, ((ent.source.physics3d && ent.source.physics3d.halfExtents && ent.source.physics3d.halfExtents.x) || Math.abs(ent.t3.sx || 1) * 0.5) * 0.85);
                  trailObj.points.unshift({ x: ent.t3.x, y: wyE + 0.05, z: ent.t3.z, nx: Math.cos(wYaw) * hwTr, nz: -Math.sin(wYaw) * hwTr, age: 0 });
                  if (trailObj.points.length > trailObj.maxPts) trailObj.points.pop();
                }
                for (var piT = trailObj.points.length - 1; piT >= 0; piT--) {
                  trailObj.points[piT].age += dt;
                  if (trailObj.points[piT].age > 1.8) trailObj.points.splice(piT, 1);
                }
                if (trailObj.points.length >= 2) {
                  var arrT = trailObj.posArr, cntT = trailObj.points.length;
                  for (var kT = 0; kT < cntT; kT++) {
                    var tp = trailObj.points[kT], wMul = 1 + (tp.age / 1.8) * 1.4;
                    var i6 = kT * 6;
                    arrT[i6] = tp.x - tp.nx * wMul; arrT[i6 + 1] = tp.y; arrT[i6 + 2] = tp.z - tp.nz * wMul;
                    arrT[i6 + 3] = tp.x + tp.nx * wMul; arrT[i6 + 4] = tp.y; arrT[i6 + 5] = tp.z + tp.nz * wMul;
                  }
                  trailObj.mesh.geometry.attributes.position.needsUpdate = true;
                  var triIndices = [];
                  for (var qT = 0; qT < cntT - 1; qT++) {
                    var a0 = qT * 2, b0 = a0 + 1, c0 = a0 + 2, d0 = a0 + 3;
                    triIndices.push(a0, c0, b0, b0, c0, d0);
                  }
                  trailObj.mesh.geometry.setIndex(triIndices);
                  trailObj.mesh.visible = true;
                } else {
                  trailObj.mesh.visible = false;
                }
              }
            });
          }
        });
        for (var rStep = 0; rStep < ripplePool3D.length; rStep++) {
          var rpS = ripplePool3D[rStep];
          if (!rpS.active) { rpS.mesh.visible = false; continue; }
          rpS.age += dt;
          if (rpS.age >= rpS.maxAge) { rpS.active = false; rpS.mesh.visible = false; continue; }
          var rf = rpS.age / rpS.maxAge;
          rpS.scale = 0.1 + (rpS.maxScale - 0.1) * rf;
          rpS.opacity = 0.85 * (1 - rf);
          rpS.mesh.visible = true;
          rpS.mesh.position.set(rpS.x, rpS.y, rpS.z);
          rpS.mesh.scale.set(rpS.scale, 1, rpS.scale);
          rpS.mesh.material.opacity = rpS.opacity;
        }

        objs.forEach(function (o) {
          if (!o.visible) return;
          if (o.source.animStateMachine && o.source.animStateMachine.states && o.source.animStateMachine.states.length > 0) {
            var motionRef = o;
            if (Math.hypot(o.vx, o.vz) < 0.01 && o.source.parentId) {
              var pCurId = o.source.parentId, hop = 0;
              while (pCurId && hop < 8) {
                var pObj = objs.find(function (x) { return x.id === pCurId; });
                if (!pObj) break;
                if (Math.hypot(pObj.vx, pObj.vz) > 0.01 || Math.abs(pObj.vy) > 0.01 || pObj.isGrounded) { motionRef = pObj; break; }
                pCurId = pObj.source.parentId; hop++;
              }
            }
            var mmTrack = mixerMap.get(o.id);
            if (mmTrack && mmTrack.activeAction) {
              var clipObj = mmTrack.activeAction.getClip ? mmTrack.activeAction.getClip() : null;
              var clipDur = clipObj && clipObj.duration ? clipObj.duration : 0;
              if (clipDur > 0.01) {
                o.animProgress = Math.max(0, Math.min(1, mmTrack.activeAction.time / clipDur));
                if (o.animLoopMode === 'LoopOnce' && mmTrack.activeAction.time >= clipDur * 0.98) o.animFinished = true;
              }
            }
            var fsmRes = stepAnimFsm3d(o.source.animStateMachine, o.currentAnimState, { speed: Math.hypot(motionRef.vx, motionRef.vz), vy: motionRef.vy, isGrounded: motionRef.isGrounded, animFinished: Boolean(o.animFinished), animProgress: o.animProgress || 0, heldKeys: heldKeys, justPressedKeys: justPressed, variables: variables });
            if (fsmRes && fsmRes.changed) {
              o.currentAnimState = fsmRes.stateName;
              o.activeClip = fsmRes.clipName;
              o.activeAnimAssetId = fsmRes.assetId || null;
              o.animTimeScale = fsmRes.timeScale || 1;
              o.animLoopMode = fsmRes.loopMode || 'LoopRepeat';
              o.blendDuration = fsmRes.blendDuration;
              o.animProgress = 0;
              o.animFinished = false;
            } else if (fsmRes && fsmRes.node && fsmRes.node.frameEvents && fsmRes.node.frameEvents.length > 0) {
              var totalF3 = Math.max(1, fsmRes.node.frameCount || 12);
              var curF3 = Math.floor((o.animProgress || 0) * totalF3) % totalF3;
              var feK3 = 'fe3d:' + o.id + ':' + fsmRes.node.id;
              var prevF3 = Math.floor(activeSim.mechanicTimers.has(feK3) ? activeSim.mechanicTimers.get(feK3) : -1);
              if (curF3 !== prevF3) {
                activeSim.mechanicTimers.set(feK3, curF3);
                var owFe = getWorldT3(o, objs);
                fsmRes.node.frameEvents.forEach(function (fe) {
                  if (fe.frameIndex === curF3) {
                    if (fe.eventName) activeSim.queuedEvents.push(fe.eventName);
                    if (fe.soundAssetId) playSfx(fe.soundAssetId, 0.9, owFe);
                  }
                });
              }
            }
          }
          var em = o.source.particleEmitter;
          if (em && em.enabled) {
            var layers = em.layers && em.layers.length > 0 ? em.layers.filter(function (l) { return l.enabled !== false; }) : [em];
            layers.forEach(function (ly, lIdx) {
              var tk = 'em3:' + o.id + ':' + lIdx;
              var acc = (activeSim.mechanicTimers.get(tk) || 0) + dt * Math.max(0.5, ly.rate || 15);
              var cnt = Math.floor(acc); activeSim.mechanicTimers.set(tk, acc - cnt);
              var ow = getWorldT3(o, objs);
              if (cnt > 0) burstParticles3D(ow.x + (ly.offsetX || 0) * 0.02, ow.y + (ly.offsetY || 0) * -0.02, ow.z, Math.min(4, cnt), Object.assign({}, em, ly));
            });
          }
        });

        for (var pi = particles3D.length - 1; pi >= 0; pi--) {
          var pt = particles3D[pi];
          pt.age += dt;
          if (pt.age >= pt.maxAge) { particleGroup.remove(pt.mesh); particles3D.splice(pi, 1); continue; }
          var pRatio = Math.min(1, pt.age / Math.max(0.05, pt.maxAge));
          pt.vy -= 9.8 * dt;
          if (pt.drag > 0) {
            var dmp = Math.max(0, 1 - pt.drag * dt);
            pt.vx *= dmp; pt.vy *= dmp; pt.vz *= dmp;
          }
          if (pt.turbulence > 0) {
            var trb = pt.turbulence * 0.05;
            pt.vx += Math.sin(pt.age * 7.3 + pi) * trb * dt;
            pt.vz += Math.cos(pt.age * 6.1 + pi * 2) * trb * dt;
          }
          var spdMul = pt.speedCurve && pt.speedCurve.length >= 2 ? sampleVfxCurve3D(pt.speedCurve, pRatio, 1, 1) : 1;
          pt.mesh.position.x += pt.vx * spdMul * dt;
          pt.mesh.position.y += pt.vy * spdMul * dt;
          pt.mesh.position.z += pt.vz * spdMul * dt;
          var curSz = Math.max(0.02, sampleVfxCurve3D(pt.sizeCurve, pRatio, pt.sizeStart || 0.3, pt.sizeEnd || 0.06));
          pt.mesh.scale.set(curSz, pt.particleShape === 'liquid' ? curSz * 1.45 : pt.particleShape === 'ring' ? curSz * 0.25 : curSz, curSz);
          if (pt.mesh.material) {
            pt.mesh.material.opacity = Math.max(0, Math.min(1, sampleVfxCurve3D(pt.alphaCurve, pRatio, pt.alphaStart !== undefined ? pt.alphaStart : 0.9, pt.alphaEnd !== undefined ? pt.alphaEnd : 0)));
            if (pt.colorStart && pt.colorEnd && pt.colorStart !== pt.colorEnd) {
              pt.mesh.material.color.set(pRatio < 0.5 ? pt.colorStart : pt.colorEnd);
            }
          }
        }

        if (pendingBoneSockets3D.length > 0) {
          for (var bsi = pendingBoneSockets3D.length - 1; bsi >= 0; bsi--) {
            var bs = pendingBoneSockets3D[bsi];
            var pRoot = loadedRoots3D.get(bs.parentId);
            var cNode = meshBindings.get(bs.childId);
            var bName = bs.obj.boneSocket && bs.obj.boneSocket.boneName;
            if (pRoot && cNode && bName) {
              var foundBone = pRoot.getObjectByName(bName);
              if (foundBone) {
                foundBone.add(cNode);
                var sck = bs.obj.boneSocket;
                cNode.userData.boneAttached = true;
                cNode.position.set(sck.offsetX || 0, sck.offsetY || 0, sck.offsetZ || 0);
                cNode.rotation.set((sck.rotX || 0) * DEG2RAD, (sck.rotY || 0) * DEG2RAD, (sck.rotZ || 0) * DEG2RAD);
              }
              pendingBoneSockets3D.splice(bsi, 1);
            }
          }
        }

        objs.forEach(function (o) {
          var mesh = meshBindings.get(o.id);
          var vis = o.visible;
          if (mesh) {
            if (vis && activeStreamState3D) {
              var actV = activeStreamState3D.objectActivity.get(o.id) || 'near';
              if (actV === 'unloaded' || (actV === 'far' && activeStreamState3D.cfg.enableHlod)) vis = false;
              else if (activeStreamState3D.culledObjectIds.has(o.id)) vis = false;
            }
            var opt = o.source.optimization;
            var lodEnt = lodBindings3D.get(o.id);
            if (vis && opt) {
              var cDist = Math.hypot(o.t3.x - camera.position.x, o.t3.y - camera.position.y, o.t3.z - camera.position.z);
              var cullD = opt.cullDistance || (opt.lodEnabled && opt.lodDistance ? opt.lodDistance * 2.2 : 0);
              if (cullD && cDist > cullD) vis = false;
              else {
                if (lodEnt) {
                  var wantLow = cDist >= lodEnt.dist;
                  if (wantLow !== lodEnt.usingLow) {
                    lodEnt.usingLow = wantLow;
                    lodEnt.high.visible = !wantLow;
                    lodEnt.low.visible = wantLow;
                  }
                }
                if (vis && opt.fadeEnabled && !waterBindings.has(o.id)) {
                  var fs = Math.max(4, opt.fadeStart || 42), fe = Math.max(fs + 4, opt.fadeEnd || 68);
                  if (cDist >= fe) vis = false;
                  else {
                    var alphaF = cDist <= fs ? 1 : Math.max(0.05, 1 - (cDist - fs) / (fe - fs));
                    var prevA = lastFadeOpacity3D.has(o.id) ? lastFadeOpacity3D.get(o.id) : -1;
                    if (Math.abs(alphaF - prevA) > 0.02) {
                      lastFadeOpacity3D.set(o.id, alphaF);
                      mesh.traverse(function (ch) {
                        if (ch.material && !Array.isArray(ch.material) && typeof ch.material.opacity === 'number') {
                          ch.material.transparent = alphaF < 0.99;
                          ch.material.opacity = alphaF;
                        }
                      });
                    }
                  }
                }
              }
            }
            mesh.visible = vis;
            if (vis && !foliageBindings.has(o.id)) {
              if (mesh.userData.vehicleAnimatedPart) {
                mesh.scale.set(o.t3.sx, o.t3.sy, o.t3.sz);
              } else if (!mesh.userData.boneAttached) {
                mesh.position.set(o.t3.x, o.t3.y, o.t3.z);
                mesh.rotation.set(o.t3.rx * DEG2RAD, o.t3.ry * DEG2RAD, o.t3.rz * DEG2RAD, (o.source.vehicle && o.source.vehicle.enabled) ? 'YXZ' : 'XYZ');
              } else if (o.source.boneSocket) {
                var sk = o.source.boneSocket;
                mesh.position.set(sk.offsetX || 0, sk.offsetY || 0, sk.offsetZ || 0);
                mesh.rotation.set((sk.rotX || 0) * DEG2RAD, (sk.rotY || 0) * DEG2RAD, (sk.rotZ || 0) * DEG2RAD);
              }
              if (!waterBindings.has(o.id) && !mesh.userData.vehicleAnimatedPart) mesh.scale.set(o.t3.sx, o.t3.sy, o.t3.sz);
            }
          }
          var mm = mixerMap.get(o.id);
          if (mm && vis) {
            var desiredKey = (o.activeAnimAssetId || '') + ':' + (o.activeClip || '');
            if ((o.activeClip || o.activeAnimAssetId) && desiredKey !== mm.activeKey) {
              var nxtAct = (o.activeAnimAssetId && o.activeClip && mm.actions.get(desiredKey)) || (o.activeClip && mm.actions.get(o.activeClip)) || (o.activeAnimAssetId && mm.actions.get('__asset_first__:' + o.activeAnimAssetId));
              if (!nxtAct && o.activeClip) {
                var lc = String(o.activeClip).toLowerCase();
                mm.actions.forEach(function (actVal, actKey) {
                  if (!nxtAct && actKey.indexOf('__asset_first__:') !== 0 && actKey.toLowerCase() === lc) nxtAct = actVal;
                });
              }
              if (nxtAct) {
                var oldAct = null;
                if (mm.activeKey) {
                  var sepIdx = mm.activeKey.indexOf(':');
                  var pAst = sepIdx >= 0 ? mm.activeKey.slice(0, sepIdx) : '';
                  var pClp = sepIdx >= 0 ? mm.activeKey.slice(sepIdx + 1) : mm.activeKey;
                  oldAct = (pAst && pClp && mm.actions.get(pAst + ':' + pClp)) || (pClp && mm.actions.get(pClp)) || (pAst && mm.actions.get('__asset_first__:' + pAst)) || null;
                }
                var lk = o.animLoopMode === 'LoopOnce' ? THREE.LoopOnce : o.animLoopMode === 'LoopPingPong' ? THREE.LoopPingPong : THREE.LoopRepeat;
                nxtAct.setLoop(lk, o.animLoopMode === 'LoopOnce' ? 1 : Infinity);
                nxtAct.clampWhenFinished = o.animLoopMode === 'LoopOnce';
                nxtAct.timeScale = o.animTimeScale || 1;
                nxtAct.reset().play();
                if (oldAct && oldAct !== nxtAct) oldAct.crossFadeTo(nxtAct, Math.max(0.05, o.blendDuration || 0.25), true);
                mm.activeKey = desiredKey;
                mm.activeAction = nxtAct;
              }
            }
            mm.mixer.update(dt);
          }
        });

        var cs = activeSim.cameraState;
        var activeCamObj = (cs.activeCameraId ? objs.find(function (x) { return x.id === cs.activeCameraId; }) : null) || (activeSim.overrideCameraId ? objs.find(function (x) { return x.id === activeSim.overrideCameraId; }) : null) || objs.find(function (x) { return x.type === 'camera_3d'; }) || null;
        var cCfg = (activeCamObj && activeCamObj.source.camera3d) || (currentScene.cameraConfig && currentScene.cameraConfig.smartCamera) || {
          mode: 'smooth_follow', targetObjectId: primaryPlayer3d ? primaryPlayer3d.id : null,
          dampingFactor: 0.14, lookAhead: 1.4, offsetX: 0, offsetY: 6.5, offsetZ: 11, distance: 11,
          pitchMinDeg: -50, pitchMaxDeg: 25, fov: 55, deadzoneW: 2, deadzoneH: 2, collideWithWalls: true, useBounds: false
        };
        var camTgtObj = (activeSim.cameraFollowOverride3D ? objs.find(function (x) { return x.id === activeSim.cameraFollowOverride3D || x.name === activeSim.cameraFollowOverride3D; }) : null) || (cCfg.targetObjectId ? objs.find(function (x) { return x.id === cCfg.targetObjectId || x.name === cCfg.targetObjectId; }) : null) || primaryPlayer3d;
        var camTgtW = camTgtObj ? getWorldT3(camTgtObj, objs) : null;
        var activeCamVol = null;
        if (currentScene.cameraVolumes && currentScene.cameraVolumes.length > 0 && camTgtW) {
          for (var cvi = 0; cvi < currentScene.cameraVolumes.length; cvi++) {
            var cv = currentScene.cameraVolumes[cvi];
            if (!cv.enabled) continue;
            if (cv.zoneType === 'vehicle' && !activeSim.activeMountedVehicleId) continue;
            var cvb = cv.bounds;
            if (camTgtW.x >= cvb.minX && camTgtW.x <= cvb.maxX && camTgtW.y >= cvb.minY && camTgtW.y <= cvb.maxY && camTgtW.z >= cvb.minZ && camTgtW.z <= cvb.maxZ) {
              if (!activeCamVol || cv.priority > activeCamVol.priority) activeCamVol = cv;
            }
          }
        }
        var nextVolId = activeCamVol ? activeCamVol.id : null;
        if (nextVolId !== (cs.activeVolumeId || null)) {
          cs.transitionFrom = { posX: cs.posX, posY: cs.posY, posZ: cs.posZ, lookAtX: cs.lookAtX, lookAtY: cs.lookAtY, lookAtZ: cs.lookAtZ, fov: cs.fov };
          cs.transitionElapsed = 0;
          cs.transitionDuration = Math.max(0.15, (activeCamVol && activeCamVol.blendDurationSec) || 0.55);
          cs.activeVolumeId = nextVolId;
        }
        if (activeCamVol) {
          cCfg = Object.assign({}, cCfg, {
            mode: activeCamVol.mode || cCfg.mode,
            fov: activeCamVol.fov !== undefined ? activeCamVol.fov : cCfg.fov,
            distance: activeCamVol.distance !== undefined ? activeCamVol.distance : cCfg.distance,
            shoulderOffsetX: activeCamVol.shoulderOffsetX !== undefined ? activeCamVol.shoulderOffsetX : cCfg.shoulderOffsetX,
            shoulderOffsetY: activeCamVol.shoulderOffsetY !== undefined ? activeCamVol.shoulderOffsetY : cCfg.shoulderOffsetY,
            terrainMinClearance: activeCamVol.terrainMinClearance !== undefined ? activeCamVol.terrainMinClearance : cCfg.terrainMinClearance
          });
        }
        if (cs.shoulderSide === undefined) cs.shoulderSide = cCfg.shoulderSide || 1;
        if (justPressed.has('KeyV') && cCfg.allowShoulderSwap !== false) {
          cs.shoulderSide = cs.shoulderSide === 1 ? -1 : 1;
        }
        var camOwnPos = activeCamObj ? getWorldT3(activeCamObj, objs) : { x: 0, y: 7, z: 13 };

        if (activeSim.cameraBlend && activeSim.cameraBlend.active) {
          var cb = activeSim.cameraBlend;
          cb.elapsed += dt;
          var br = Math.min(1, cb.elapsed / cb.duration);
          var bsm = br * br * (3 - 2 * br);
          cs.posX = cb.from.px + (cb.to.px - cb.from.px) * bsm;
          cs.posY = cb.from.py + (cb.to.py - cb.from.py) * bsm;
          cs.posZ = cb.from.pz + (cb.to.pz - cb.from.pz) * bsm;
          cs.lookAtX = cb.from.lx + (cb.to.lx - cb.from.lx) * bsm;
          cs.lookAtY = cb.from.ly + (cb.to.ly - cb.from.ly) * bsm;
          cs.lookAtZ = cb.from.lz + (cb.to.lz - cb.from.lz) * bsm;
          cs.fov = cb.from.fov + (cb.to.fov - cb.from.fov) * bsm;
          if (br >= 1) { cb.active = false; activeSim.cameraManualLock = true; }
        } else if (!activeSim.cameraManualLock) {
          var lAlpha = 1 - Math.pow(1 - Math.max(0.02, Math.min(0.99, cCfg.dampingFactor || 0.12)), dt * 60);
          var dPosX = camOwnPos.x, dPosY = camOwnPos.y, dPosZ = camOwnPos.z;
          var dLookX = camTgtW ? camTgtW.x : 0, dLookY = camTgtW ? camTgtW.y + 0.8 : 1, dLookZ = camTgtW ? camTgtW.z : 0;
          var shX = (cCfg.shoulderOffsetX || 0) * (cs.shoulderSide || 1), shY = cCfg.shoulderOffsetY || 0;
          var hSpd = camTgtObj ? Math.hypot(camTgtObj.vx || 0, camTgtObj.vz || 0) : 0;

          if (cCfg.mode === 'fixed' || !camTgtW) {
            if (!camTgtW) { dLookX = camOwnPos.x; dLookY = Math.max(0, camOwnPos.y - 2); dLookZ = camOwnPos.z - 8; }
          } else if (cCfg.mode === 'first_person') {
            var yR1 = (cs.orbitYawDeg || 0) * DEG2RAD;
            cs.orbitPitchDeg = Math.max(-75, Math.min(75, cs.orbitPitchDeg || 0));
            var pR1 = cs.orbitPitchDeg * DEG2RAD, cosP1 = Math.cos(pR1);
            dPosX = camTgtW.x; dPosY = camTgtW.y + (shY !== 0 ? shY : 0.65); dPosZ = camTgtW.z;
            dLookX = dPosX - Math.sin(yR1) * cosP1 * 8;
            dLookY = dPosY + Math.sin(pR1) * 8;
            dLookZ = dPosZ - Math.cos(yR1) * cosP1 * 8;
          } else if (cCfg.mode === 'top_down') {
            var tdH = Math.max(8, cCfg.distance || 16);
            dLookX = camTgtW.x + (camTgtObj.vx || 0) * (cCfg.lookAhead || 0) * 0.2;
            dLookY = camTgtW.y + 0.4;
            dLookZ = camTgtW.z + (camTgtObj.vz || 0) * (cCfg.lookAhead || 0) * 0.2;
            dPosX = dLookX + (cCfg.offsetX || 0);
            dPosY = camTgtW.y + tdH;
            dPosZ = dLookZ + (Math.abs(cCfg.offsetZ || 0) > 0.5 ? cCfg.offsetZ : 5.5);
          } else if (cCfg.mode === 'third_person_orbit') {
            var yR3 = (cs.orbitYawDeg || 0) * DEG2RAD;
            cs.orbitPitchDeg = Math.max(cCfg.pitchMinDeg !== undefined ? cCfg.pitchMinDeg : -50, Math.min(cCfg.pitchMaxDeg !== undefined ? cCfg.pitchMaxDeg : 25, cs.orbitPitchDeg || -18));
            var pR3 = cs.orbitPitchDeg * DEG2RAD, dist3 = Math.max(2.5, cCfg.distance || 10), horiz3 = Math.cos(pR3) * dist3;
            var rX3 = Math.cos(yR3), rZ3 = -Math.sin(yR3);
            dLookX = camTgtW.x + (camTgtObj.vx || 0) * (cCfg.lookAhead || 0) * 0.15 + rX3 * shX;
            dLookY = camTgtW.y + 1.1 + shY;
            dLookZ = camTgtW.z + (camTgtObj.vz || 0) * (cCfg.lookAhead || 0) * 0.15 + rZ3 * shX;
            dPosX = dLookX + Math.sin(yR3) * horiz3;
            dPosY = dLookY - Math.sin(pR3) * dist3;
            dPosZ = dLookZ + Math.cos(yR3) * horiz3;
          } else if (cCfg.mode === 'deadzone') {
            var dzX = camTgtW.x - cs.lookAtX, dzZ = camTgtW.z - cs.lookAtZ;
            var hwD = Math.max(0.2, (cCfg.deadzoneW || 2) * 0.5), hhD = Math.max(0.2, (cCfg.deadzoneH || 2) * 0.5);
            dLookX = cs.lookAtX + (Math.abs(dzX) > hwD ? dzX - Math.sign(dzX) * hwD : 0) + shX;
            dLookY = camTgtW.y + 0.8 + shY;
            dLookZ = cs.lookAtZ + (Math.abs(dzZ) > hhD ? dzZ - Math.sign(dzZ) * hhD : 0);
            dPosX = dLookX + (cCfg.offsetX || 0); dPosY = dLookY + (cCfg.offsetY || 6.5); dPosZ = dLookZ + (cCfg.offsetZ || 11);
          } else {
            dLookX = camTgtW.x + (camTgtObj.vx || 0) * (cCfg.lookAhead || 0) * 0.25 + shX;
            dLookY = camTgtW.y + 0.8 + shY;
            dLookZ = camTgtW.z + (camTgtObj.vz || 0) * (cCfg.lookAhead || 0) * 0.25;
            dPosX = dLookX + (cCfg.offsetX || 0);
            dPosY = dLookY + (cCfg.offsetY !== undefined ? cCfg.offsetY : 6.5);
            dPosZ = dLookZ + (cCfg.offsetZ !== undefined ? cCfg.offsetZ : 11);
          }

          var safeAnchorX = camTgtW ? camTgtW.x : dLookX;
          var safeAnchorY = camTgtW ? camTgtW.y + 0.95 : dLookY;
          var safeAnchorZ = camTgtW ? camTgtW.z : dLookZ;

          function raycastSegmentObb3DDetailed(ox, oy, oz, dx, dy, dz, bx, inflate) {
            var yaw = bx.yawDeg || 0;
            var inf = inflate || 0;
            if (Math.abs(yaw % 360) < 0.05) {
              return raycastSegmentAabb3DDetailed(ox, oy, oz, dx, dy, dz, bx.minX - inf, bx.maxX + inf, bx.minY - inf, bx.maxY + inf, bx.minZ - inf, bx.maxZ + inf);
            }
            var cx = (bx.minX + bx.maxX) * 0.5, cz = (bx.minZ + bx.maxZ) * 0.5;
            var hx = (bx.maxX - bx.minX) * 0.5 + inf, hz = (bx.maxZ - bx.minZ) * 0.5 + inf;
            var rad = (-yaw) * DEG2RAD, csY = Math.cos(rad), snY = Math.sin(rad);
            var rx0 = ox - cx, rz0 = oz - cz;
            return raycastSegmentAabb3DDetailed(rx0 * csY - rz0 * snY, oy, rx0 * snY + rz0 * csY, dx * csY - dz * snY, dy, dx * snY + dz * csY, -hx, hx, bx.minY - inf, bx.maxY + inf, -hz, hz);
          }

          function raycastSegmentTrimesh3D(ox, oy, oz, dx, dy, dz, bx, tris) {
            var seg = raycastSegmentAabb3DDetailed(ox, oy, oz, dx, dy, dz, bx.minX - 0.1, bx.maxX + 0.1, bx.minY - 0.1, bx.maxY + 0.1, bx.minZ - 0.1, bx.maxZ + 0.1);
            if (!seg) return null;
            var best = null;
            for (var ti = 0; ti + 8 < tris.length; ti += 9) {
              var ax = tris[ti], ay = tris[ti + 1], az = tris[ti + 2];
              var bxv = tris[ti + 3], byv = tris[ti + 4], bzv = tris[ti + 5];
              var cxv = tris[ti + 6], cyv = tris[ti + 7], czv = tris[ti + 8];
              var e1x = bxv - ax, e1y = byv - ay, e1z = bzv - az;
              var e2x = cxv - ax, e2y = cyv - ay, e2z = czv - az;
              var px = dy * e2z - dz * e2y, py = dz * e2x - dx * e2z, pz = dx * e2y - dy * e2x;
              var det = e1x * px + e1y * py + e1z * pz;
              if (det > -1e-7 && det < 1e-7) continue;
              var inv = 1 / det;
              var tx = ox - ax, ty = oy - ay, tz = oz - az;
              var u = (tx * px + ty * py + tz * pz) * inv;
              if (u < -0.001 || u > 1.001) continue;
              var qx = ty * e1z - tz * e1y, qy = tz * e1x - tx * e1z, qz = tx * e1y - ty * e1x;
              var v = (dx * qx + dy * qy + dz * qz) * inv;
              if (v < -0.001 || u + v > 1.001) continue;
              var t = (e2x * qx + e2y * qy + e2z * qz) * inv;
              if (t >= 0.002 && t <= 1 && (best === null || t < best)) best = t;
            }
            return best;
          }

          function findSafeCamFraction3D(ox, oy, oz, dx, dy, dz, occs, useW) {
            var rLen = Math.hypot(dx, dy, dz);
            if (rLen < 0.02) return 1;
            var safeT = 1;
            var hL = Math.hypot(dx, dz) || 1, pX = -dz / hL, pZ = dx / hL;
            var offs = useW ? [[0, 0, 0], [pX * 0.28, 0, pZ * 0.28], [-pX * 0.28, 0, -pZ * 0.28], [0, 0.22, 0], [0, -0.16, 0]] : [[0, 0, 0]];
            for (var i = 0; i < occs.length; i++) {
              var b = occs[i];
              if (b.cameraCollision === 'never') continue;
              if (b.cameraCollision !== 'always' && b.isSmallProp) continue;
              if (b.triangles && b.triangles.length >= 9) {
                var bestTriT = 1;
                for (var wi = 0; wi < offs.length; wi++) {
                  var wf = offs[wi];
                  var ht = raycastSegmentTrimesh3D(ox + wf[0], oy + wf[1], oz + wf[2], dx, dy, dz, b, b.triangles);
                  if (ht !== null && ht < bestTriT) bestTriT = ht;
                }
                if (bestTriT < 1) {
                  var clTri = Math.max(0.06, bestTriT - Math.min(0.32, 0.42 / rLen));
                  if (clTri < safeT) safeT = clTri;
                }
                continue;
              }
              var exH = raycastSegmentObb3DDetailed(ox, oy, oz, dx, dy, dz, b, 0);
              var bw = b.maxX - b.minX, bh = b.maxY - b.minY, bd = b.maxZ - b.minZ;
              if (exH && exH.inside && b.cameraCollision !== 'always' && Math.min(bw, bd) >= 8 && bh >= 5) continue;
              var infH = raycastSegmentObb3DDetailed(ox, oy, oz, dx, dy, dz, b, 0.34);
              if (infH && !infH.inside) {
                if (infH.t < safeT) safeT = Math.max(0.06, infH.t);
              } else if (exH) {
                if (!exH.inside) {
                  var clEx = Math.max(0.05, exH.t - Math.min(0.35, 0.24 / rLen));
                  if (clEx < safeT) safeT = clEx;
                } else if (b.cameraCollision === 'always') {
                  var endIn = raycastSegmentObb3DDetailed(ox + dx, oy + dy, oz + dz, -dx, -dy, -dz, b, 0);
                  if (endIn) safeT = Math.min(safeT, 0.08);
                }
              }
              if (useW) {
                for (var wi2 = 1; wi2 < offs.length; wi2++) {
                  var wf2 = offs[wi2];
                  var wh = raycastSegmentObb3DDetailed(ox + wf2[0], oy + wf2[1], oz + wf2[2], dx, dy, dz, b, 0.14);
                  if (wh && !wh.inside && wh.t < safeT) safeT = Math.max(0.06, wh.t);
                }
              }
            }
            return safeT;
          }

          var camOccluders3D = [];
          if (cCfg.collideWithWalls && camTgtW && cCfg.mode !== 'fixed' && cCfg.mode !== 'first_person') {
            for (var siW = 0; siW < objs.length; siW++) {
              var sW = objs[siW];
              if (!sW.visible || sW.type !== 'mesh_3d' || dynamicIdSet.has(sW.id) || isDescendantOfDynamic3d(sW)) continue;
              var p3W = sW.source.physics3d;
              if (p3W && p3W.isTrigger) continue;
              var camColW = (p3W && p3W.cameraCollision) || 'auto';
              if (camColW === 'never') continue;
              var sShp = sW.source.mesh3d && sW.source.mesh3d.shape;
              if (camColW === 'auto') {
                if (p3W && p3W.enabled === false) continue;
                if (p3W && p3W.bodyType === 'dynamic') continue;
                if (sShp === 'plane' || sShp === 'terrain' || sShp === 'grass_field' || sShp === 'water') continue;
              } else {
                if (sShp === 'grass_field') continue;
              }
              var triW = trimeshCache.get(sW.id);
              if (triW === undefined && ((p3W && p3W.shape === 'mesh_exact') || sShp === 'arch' || sShp === 'stairs' || sShp === 'csg')) {
                triW = buildWorldTrimeshForObject(sW);
                trimeshCache.set(sW.id, triW);
              }
              var useTriW = Boolean(triW && triW.triangles && triW.triangles.length >= 9 && triW.triangles.length <= 72000 && ((p3W && p3W.shape === 'mesh_exact') || sShp === 'arch' || sShp === 'stairs' || sShp === 'csg' || sShp === 'glb'));
              if (triW && triW.triangles && triW.triangles.length >= 9 && (useTriW || sShp === 'glb')) {
                var bwT = triW.maxX - triW.minX, bhT = triW.maxY - triW.minY, bdT = triW.maxZ - triW.minZ;
                var smTri = camColW !== 'always' && (bhT < 1.25 || (bwT < 0.7 && bdT < 0.7 && bhT < 2.0) || Math.max(bwT, bdT) < 0.85);
                camOccluders3D.push({ minX: triW.minX, maxX: triW.maxX, minY: triW.minY, maxY: triW.maxY, minZ: triW.minZ, maxZ: triW.maxZ, yawDeg: 0, isSmallProp: smTri, cameraCollision: camColW, triangles: useTriW ? triW.triangles : null });
                continue;
              }
              var whS = getWorldT3AndHe(sW, objs);
              var bwS = whS.hx * 2, bhS = whS.hy * 2, bdS = whS.hz * 2;
              var smBox = camColW !== 'always' && (bhS < 1.25 || (bwS < 0.7 && bdS < 0.7 && bhS < 2.0) || Math.max(bwS, bdS) < 0.85);
              camOccluders3D.push({ minX: whS.w.x - whS.hx, maxX: whS.w.x + whS.hx, minY: whS.w.y - whS.hy, maxY: whS.w.y + whS.hy, minZ: whS.w.z - whS.hz, maxZ: whS.w.z + whS.hz, yawDeg: whS.w.ry || 0, isSmallProp: smBox, cameraCollision: camColW });
            }
            var ldxC = dLookX - safeAnchorX, ldyC = dLookY - safeAnchorY, ldzC = dLookZ - safeAnchorZ;
            if (Math.hypot(ldxC, ldyC, ldzC) > 0.15) {
              var lookSafeT = findSafeCamFraction3D(safeAnchorX, safeAnchorY, safeAnchorZ, ldxC, ldyC, ldzC, camOccluders3D, false);
              if (lookSafeT < 1) {
                dLookX = safeAnchorX + ldxC * lookSafeT;
                dLookY = safeAnchorY + ldyC * lookSafeT;
                dLookZ = safeAnchorZ + ldzC * lookSafeT;
              }
            }
            var rdx = dPosX - safeAnchorX, rdy = dPosY - safeAnchorY, rdz = dPosZ - safeAnchorZ;
            var targetWallT = findSafeCamFraction3D(safeAnchorX, safeAnchorY, safeAnchorZ, rdx, rdy, rdz, camOccluders3D, true);
            var curWT = cs.smoothWallT !== undefined ? cs.smoothWallT : 1;
            cs.smoothWallT = targetWallT <= curWT ? targetWallT : curWT + (targetWallT - curWT) * Math.min(1, dt * 7.5);
            if (cs.smoothWallT < 0.999) {
              dPosX = safeAnchorX + rdx * cs.smoothWallT; dPosY = safeAnchorY + rdy * cs.smoothWallT; dPosZ = safeAnchorZ + rdz * cs.smoothWallT;
            }
          }

          if (cCfg.useBounds) {
            dPosX = Math.max(cCfg.boundsMinX || -60, Math.min(cCfg.boundsMaxX || 60, dPosX));
            dPosY = Math.max(cCfg.boundsMinY || 1, Math.min(cCfg.boundsMaxY || 40, dPosY));
            dPosZ = Math.max(cCfg.boundsMinZ || -60, Math.min(cCfg.boundsMaxZ || 60, dPosZ));
          }

          var tFov = (cCfg.fov || 55) + Math.max(0, Math.min(22, hSpd * (cCfg.fovKick || 0)));
          var npX = cs.posX + (dPosX - cs.posX) * lAlpha, npY = cs.posY + (dPosY - cs.posY) * lAlpha, npZ = cs.posZ + (dPosZ - cs.posZ) * lAlpha;
          var nlX = cs.lookAtX + (dLookX - cs.lookAtX) * lAlpha, nlY = cs.lookAtY + (dLookY - cs.lookAtY) * lAlpha, nlZ = cs.lookAtZ + (dLookZ - cs.lookAtZ) * lAlpha;
          var nFov = cs.fov + (tFov - cs.fov) * lAlpha;

          if (cs.transitionFrom && cs.transitionDuration > 0) {
            cs.transitionElapsed += dt;
            var tc = Math.max(0, Math.min(1, cs.transitionElapsed / cs.transitionDuration));
            var tsSm = tc * tc * (3 - 2 * tc), tf = cs.transitionFrom;
            cs.posX = tf.posX + (npX - tf.posX) * tsSm; cs.posY = tf.posY + (npY - tf.posY) * tsSm; cs.posZ = tf.posZ + (npZ - tf.posZ) * tsSm;
            cs.lookAtX = tf.lookAtX + (nlX - tf.lookAtX) * tsSm; cs.lookAtY = tf.lookAtY + (nlY - tf.lookAtY) * tsSm; cs.lookAtZ = tf.lookAtZ + (nlZ - tf.lookAtZ) * tsSm;
            cs.fov = tf.fov + (nFov - tf.fov) * tsSm;
            if (tc >= 1) { cs.transitionFrom = null; cs.transitionDuration = 0; }
          } else {
            cs.posX = npX; cs.posY = npY; cs.posZ = npZ; cs.lookAtX = nlX; cs.lookAtY = nlY; cs.lookAtZ = nlZ; cs.fov = nFov;
          }

          // Post-lerp clamp para que la inercia nunca deje la cámara detrás de un muro o bajo el terreno
          if (cCfg.collideWithWalls && camOccluders3D.length > 0) {
            var pdx = cs.posX - safeAnchorX, pdy = cs.posY - safeAnchorY, pdz = cs.posZ - safeAnchorZ;
            var pSafeT = findSafeCamFraction3D(safeAnchorX, safeAnchorY, safeAnchorZ, pdx, pdy, pdz, camOccluders3D, true);
            if (pSafeT < 1) {
              cs.posX = safeAnchorX + pdx * pSafeT;
              cs.posY = safeAnchorY + pdy * pSafeT;
              cs.posZ = safeAnchorZ + pdz * pSafeT;
            }
          }
          if ((cCfg.terrainMinClearance || 0) > 0 && cCfg.mode !== 'fixed' && cCfg.mode !== 'first_person') {
            var gHCam = groundHeightAt(objs, cs.posX, cs.posZ);
            if (gHCam !== null && Number.isFinite(gHCam)) {
              cs.posY = Math.max(cs.posY, gHCam + cCfg.terrainMinClearance);
            }
          }
        }

        if (Math.abs(camera.fov - cs.fov) > 0.05) { camera.fov = cs.fov; camera.updateProjectionMatrix(); }
        camera.position.set(cs.posX, cs.posY, cs.posZ);
        if (activeSim.shakeTimer > 0) {
          activeSim.shakeTimer = Math.max(0, activeSim.shakeTimer - dt);
          camera.position.x += (Math.random() - 0.5) * activeSim.shakeIntensity;
          camera.position.y += (Math.random() - 0.5) * activeSim.shakeIntensity;
        }
        camera.lookAt(cs.lookAtX, cs.lookAtY, cs.lookAtZ);
        updateAudioListener3D(camera.position.x, camera.position.y, camera.position.z);

        // Barras de vida flotantes proyectadas en DOM
        if (hpBarsHost3D) {
          var hpHtml = '';
          var cW = stageWrap.clientWidth || window.innerWidth, cH = stageWrap.clientHeight || window.innerHeight;
          var projV = new THREE.Vector3();
          for (var hiB = 0; hiB < objs.length; hiB++) {
            var ho = objs[hiB];
            if (!ho.visible) continue;
            var hasHpBar = (ho.source.components || []).some(function (cc) {
              return cc.enabled && (cc.type === 'juice.floating_hp_bar' || ((cc.type === 'combat.health_system' || cc.type === 'health') && cc.config && cc.config.showFloatingBar !== false));
            });
            if (!hasHpBar || ho.maxHp <= 0) continue;
            var wH = getWorldT3(ho, objs);
            projV.set(wH.x, wH.y + Math.max(0.9, Math.abs(wH.sy) * 0.75), wH.z).project(camera);
            if (projV.z < -1 || projV.z > 1) continue;
            var sxH = (projV.x * 0.5 + 0.5) * cW, syH = (-projV.y * 0.5 + 0.5) * cH;
            var pct = Math.max(0, Math.min(100, (ho.hp / ho.maxHp) * 100));
            hpHtml += '<div style="position:absolute;left:' + Math.round(sxH - 28) + 'px;top:' + Math.round(syH) + 'px;width:56px;height:6px;background:rgba(15,23,42,0.85);border:1px solid rgba(148,163,184,0.45);border-radius:3px;overflow:hidden;"><div style="width:' + pct.toFixed(1) + '%;height:100%;background:' + (pct > 50 ? '#22c55e' : pct > 25 ? '#eab308' : '#ef4444') + ';"></div></div>';
          }
          if (hpBarsHost3D.__lastHtml !== hpHtml) {
            hpBarsHost3D.__lastHtml = hpHtml;
            hpBarsHost3D.innerHTML = hpHtml;
          }
        }

        refreshWidgetsDom(false);
      }
      webgl.render(threeScene, camera);
    }
    requestAnimationFrame(frame);
  }

  boot().catch(function (err) {
    console.error('[NEXUS 3D Runtime Error]', err);
  });
})();
`;
}
