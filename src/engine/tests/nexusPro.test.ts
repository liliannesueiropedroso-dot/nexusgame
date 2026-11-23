import test from 'node:test';
import assert from 'node:assert/strict';
import JSZip from 'jszip';
import { performCsgOperation } from '../three3d/csgOperations';
import { deserializeBufferGeometry } from '../three3d/geometryBuilders';
import { createSimulation3DState } from '../physics3d/physics3d';
import {
  beginSmartCameraSwitch,
  createInitialSmartCameraState,
  stepSmartCamera3D,
} from '../camera/smartCamera';
import { buildNavMeshFromScene, findNavMeshPath } from '../ai3d/navmesh';
import { ParticlePool } from '../vfx/particlePool';
import {
  compileNexusScript,
  executeDeclarativeWidgetAction,
  extractScriptParamsSchema,
} from '../scripting/scriptRuntime';
import { compileProjectToHtml5Zip } from '../../export/html5/html5Compiler';
import { buildProjectFromTemplate } from '../../project/templates/projectTemplates';
import { createGameObject } from '../objects/factory';
import type { GameObjectData, SceneData } from '../core/types';
import type { NexusScriptAsset } from '../../project/models/project';

function makeBox3D(
  id: string,
  name: string,
  pos: { x: number; y: number; z: number },
  scale: { sx: number; sy: number; sz: number },
  overrides: Partial<GameObjectData> = {}
): GameObjectData {
  const base = createGameObject('mesh_3d', [], {
    name,
    shape3d: 'box',
    x3d: pos.x,
    y3d: pos.y,
    z3d: pos.z,
    color: '#6366f1',
  });
  return {
    ...base,
    id,
    transform3d: {
      x: pos.x,
      y: pos.y,
      z: pos.z,
      rx: 0,
      ry: 0,
      rz: 0,
      sx: scale.sx,
      sy: scale.sy,
      sz: scale.sz,
    },
    physics3d: {
      enabled: true,
      bodyType: 'static',
      mass: 1,
      friction: 0.8,
      restitution: 0,
      gravityScale: 1,
      shape: 'box',
    },
    ...overrides,
  };
}

test('CSG union & subtract produce valid serializable BufferGeometry', () => {
  const base = makeBox3D('b1', 'Base', { x: 0, y: 1, z: 0 }, { sx: 4, sy: 2, sz: 4 });
  const cutter = makeBox3D('b2', 'Cutter', { x: 0.8, y: 1, z: 0 }, { sx: 2, sy: 3, sz: 2 });

  const unionRes = performCsgOperation(base, [cutter], 'union');
  assert.ok(unionRes.vertexCount > 0);
  const unionGeom = deserializeBufferGeometry(unionRes.geometryJson);
  assert.equal(unionGeom.getAttribute('position').count, unionRes.vertexCount);
  unionGeom.dispose();

  const subRes = performCsgOperation(base, [cutter], 'subtract');
  assert.ok(subRes.vertexCount > 0);
  const subGeom = deserializeBufferGeometry(subRes.geometryJson);
  assert.ok(subGeom.boundingBox !== null);
  subGeom.dispose();
});

test('Physics3D settles player on box floor, walks up ramp, and jumps', () => {
  const floor = makeBox3D(
    'floor',
    'Suelo',
    { x: 0, y: -0.5, z: 0 },
    { sx: 30, sy: 1, sz: 30 },
    { layer: 'Ground' }
  );
  const ramp = makeBox3D(
    'ramp',
    'Rampa',
    { x: 4, y: 0.5, z: 0 },
    { sx: 4, sy: 1, sz: 4 },
    {
      mesh3d: {
        shape: 'ramp',
        color: '#f59e0b',
        metalness: 0.1,
        roughness: 0.7,
        emissive: '#000000',
        emissiveIntensity: 0,
        castShadow: true,
        receiveShadow: true,
      },
    }
  );
  const player = makeBox3D(
    'player',
    'Jugador3D',
    { x: 0, y: 3, z: 0 },
    { sx: 1, sy: 2, sz: 1 },
    {
      physics3d: {
        enabled: true,
        bodyType: 'dynamic',
        mass: 1,
        friction: 0.8,
        restitution: 0,
        gravityScale: 1,
        shape: 'box',
      },
      components: [
        {
          id: 'p3d',
          type: 'player_3d',
          enabled: true,
          config: { speed: 7, jumpForce: 9 },
        },
      ],
    }
  );

  const scene: SceneData = {
    id: 's3d',
    name: 'Test3D',
    backgroundColor: '#0f172a',
    gridVisible: true,
    gridSize: 32,
    snapToGrid: false,
    objects: [floor, ramp, player],
    mechanics: [],
  };

  const sim = createSimulation3DState(scene);
  const pState = sim.objects.find((o) => o.id === 'player')!;

  // Fall onto floor
  for (let i = 0; i < 40; i++) {
    sim.step({ dt: 0.03, heldKeys: new Set(), justPressedKeys: new Set() });
  }
  assert.equal(pState.isGrounded, true);
  assert.ok(Math.abs(pState.t3.y - 1) < 0.08);

  // Jump
  sim.step({
    dt: 0.016,
    heldKeys: new Set(['Space']),
    justPressedKeys: new Set(['Space']),
  });
  assert.ok(pState.vy > 5);
  assert.equal(pState.isGrounded, false);

  // Settle on ramp high edge (x=2.5 is near ramp left side where top = 1.0 - small frac)
  pState.t3.x = 3.0;
  pState.t3.y = 3.0;
  pState.vy = 0;
  for (let i = 0; i < 35; i++) {
    sim.step({ dt: 0.03, heldKeys: new Set(), justPressedKeys: new Set() });
  }
  assert.equal(pState.isGrounded, true);
  assert.ok(pState.t3.y > 1.3);
});

test('SmartCamera3D avoids wall occluders and interpolates smooth camera switch', () => {
  const camState = createInitialSmartCameraState('cam1', { x: 0, y: 5, z: 12 });
  const cfg = {
    isMainCamera: true,
    mode: 'smooth_follow' as const,
    targetObjectId: 'player',
    dampingFactor: 0.5,
    lookAhead: 0,
    offsetX: 0,
    offsetY: 2,
    offsetZ: 12,
    distance: 12,
    pitchMinDeg: -45,
    pitchMaxDeg: 25,
    fov: 55,
    deadzoneW: 2,
    deadzoneH: 2,
    collideWithWalls: true,
    useBounds: false,
    boundsMinX: -50,
    boundsMaxX: 50,
    boundsMinY: 0,
    boundsMaxY: 30,
    boundsMinZ: -50,
    boundsMaxZ: 50,
  };
  const wall = {
    minX: -5,
    maxX: 5,
    minY: 0,
    maxY: 6,
    minZ: 4,
    maxZ: 6,
  };
  for (let i = 0; i < 30; i++) {
    stepSmartCamera3D(camState, cfg, { x: 0, y: 5, z: 12 }, { x: 0, y: 1, z: 0 }, [wall], 0.03);
  }
  // Wall starts at z=4, so camera must stay in front of z=4 instead of drifting behind z=12
  assert.ok(camState.posZ < 4.5, `Expected camState.posZ < 4.5, got ${camState.posZ}`);

  beginSmartCameraSwitch(camState, 'cam2', 0.5);
  assert.equal(camState.activeCameraId, 'cam2');
  assert.ok(camState.transitionFrom !== null);
  for (let i = 0; i < 25; i++) {
    stepSmartCamera3D(camState, { ...cfg, mode: 'fixed' }, { x: 8, y: 9, z: -6 }, null, [], 0.03);
  }
  assert.equal(camState.transitionFrom, null);
  assert.ok(Math.abs(camState.posX - 8) < 1.5);
});

test('NavMesh baking and A* pathfinding route around wall obstacles', () => {
  const floor = makeBox3D(
    'ground',
    'Ground',
    { x: 0, y: -0.5, z: 0 },
    { sx: 24, sy: 1, sz: 24 },
    { layer: 'Ground' }
  );
  const wall = makeBox3D('wall', 'Muro', { x: 0, y: 1.5, z: 0 }, { sx: 2, sy: 3, sz: 10 });
  const scene: SceneData = {
    id: 'nav_scene',
    name: 'NavTest',
    backgroundColor: '#111827',
    gridVisible: true,
    gridSize: 32,
    snapToGrid: false,
    objects: [floor, wall],
    mechanics: [],
  };
  const nav = buildNavMeshFromScene(scene, { cellSize: 1.0, maxSlopeDeg: 45, agentRadius: 0.4 });
  assert.ok(nav.walkable.some((w) => w === 1));
  const path = findNavMeshPath(nav, { x: -6, z: 0 }, { x: 6, z: 0 });
  assert.ok(path.length >= 3);
  // Path must go around the wall (|z| > 3 somewhere in the middle)
  assert.ok(path.some((pt) => Math.abs(pt.z) > 2.5));
});

test('ParticlePool ring-buffer respects capacity, recycles oldest slots, and rotates particles', () => {
  const pool = new ParticlePool(40);
  const cfg = {
    enabled: true,
    preset: 'sparks' as const,
    rate: 10,
    maxParticles: 40,
    speedMin: 10,
    speedMax: 20,
    angleDeg: -90,
    spreadDeg: 60,
    gravity: 0,
    sizeStart: 8,
    sizeEnd: 2,
    lifetime: 2,
    colorStart: '#fbbf24',
    colorEnd: '#ef4444',
    blendAlpha: 1,
    alphaStart: 1,
    alphaEnd: 0,
    rotationSpeed: 180,
  };
  pool.burst('e1', 0, 0, 0, 60, cfg, false);
  assert.equal(pool.activeCount(), 40);
  const beforeRot = pool.items[0].rotationDeg;
  pool.step(0.1, 0, false);
  assert.ok(Math.abs(pool.items[0].rotationDeg - beforeRot - 18) < 0.01);
});

test('NexusScript compilation, parameter extraction, and declarative widget actions work end-to-end', () => {
  const script: NexusScriptAsset = {
    id: 'sc_1',
    name: 'RotadorPro',
    kind: 'script',
    updatedAt: Date.now(),
    code: `
// @param velocidad:number=120
// @param etiqueta:string=hero
export const params = { velocidad: 140, activo: true, etiqueta: 'hero' };
export function onUpdate(self, dt, nexus) {
  self.ry += (self.params.velocidad ?? 100) * dt;
  nexus.vars.add('ticks', 1);
}
export function saludar(self, bonus, nexus) {
  nexus.vars.add('puntos', Number(bonus) || 5);
  return 'ok';
}
`,
  };
  const schema = extractScriptParamsSchema(script);
  assert.ok(schema.some((s) => s.key === 'velocidad' && s.defaultValue === 140));
  assert.ok(schema.some((s) => s.key === 'activo' && s.type === 'boolean'));
  assert.ok(schema.some((s) => s.key === 'etiqueta' && s.defaultValue === 'hero'));

  const compiled = compileNexusScript(script);
  assert.equal(compiled.error, null);
  assert.equal(typeof compiled.hooks.onUpdate, 'function');
  assert.equal(typeof compiled.hooks.saludar, 'function');

  // Declarative widget action tests
  let score = 0;
  let openedTarget = '';
  let loadedScene = '';
  executeDeclarativeWidgetAction(
    { action: 'var.add', param: 'puntos', value: '25' },
    {
      onAddVariable: (_n, delta) => {
        score += delta;
      },
    }
  );
  executeDeclarativeWidgetAction(
    { action: 'ui.open', param: 'PanelTienda' },
    {
      onToggleInterface: (t) => {
        openedTarget = t;
      },
    }
  );
  executeDeclarativeWidgetAction(
    { action: 'scene.load', param: 'Nivel2' },
    {
      onLoadScene: (s) => {
        loadedScene = s;
      },
    }
  );
  assert.equal(score, 25);
  assert.equal(openedTarget, 'PanelTienda');
  assert.equal(loadedScene, 'Nivel2');
});

test('HTML5 compiler packages both 2D and 3D projects cleanly without external CDN Three/Pixi deps', async () => {
  const proj2d = buildProjectFromTemplate({
    name: 'Juego2DTest',
    mode: '2d',
    width: 1280,
    height: 720,
    orientation: 'horizontal',
    backgroundColor: '#0f172a',
    template: 'empty_single',
  });
  const pkg2d = await compileProjectToHtml5Zip(
    proj2d,
    new Map(),
    {
      portal: 'web',
      scaleMode: 'letterbox',
      touchControls: false,
      showFullscreenButton: true,
    },
    '/* pixi stub */',
    null
  );
  assert.ok(pkg2d.filesIncluded.includes('index.html'));
  assert.ok(pkg2d.filesIncluded.includes('js/pixi.min.js'));
  assert.ok(pkg2d.filesIncluded.includes('js/nexus-runtime.js'));

  const proj3d = buildProjectFromTemplate({
    name: 'Arena3DTest',
    mode: '3d',
    width: 1280,
    height: 720,
    orientation: 'horizontal',
    backgroundColor: '#0f172a',
    template: 'arena_3d',
  });
  const pkg3d = await compileProjectToHtml5Zip(
    proj3d,
    new Map(),
    {
      portal: 'playgama',
      scaleMode: 'letterbox',
      touchControls: true,
      showFullscreenButton: true,
    },
    null,
    '/* three stub */'
  );
  assert.ok(pkg3d.filesIncluded.includes('index.html'));
  assert.ok(pkg3d.filesIncluded.includes('js/three.min.js'));
  assert.ok(pkg3d.filesIncluded.includes('js/nexus-3d-runtime.js'));
  assert.ok(pkg3d.filesIncluded.includes('playgama-bridge-config.json'));

  const zip = await JSZip.loadAsync(await pkg3d.blob.arrayBuffer());
  const indexHtml = await zip.file('index.html')!.async('string');
  assert.ok(indexHtml.includes('js/three.min.js'));
  assert.ok(indexHtml.includes('js/nexus-3d-runtime.js'));
  const gameJsonText = await zip.file('data/game.json')!.async('string');
  const parsed = JSON.parse(gameJsonText);
  assert.equal(parsed.mode, '3d');
  assert.ok(Array.isArray(parsed.scripts));
});
