import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import JSZip from 'jszip';
import { extractAlphaSubRectsFromRgba } from '../physics/smartAlphaCollider';
import { buildWorldTrimeshData, resolveBodyVsTrimesh } from '../physics3d/trimeshCollider';
import { computeJoystickVector } from '../input/virtualJoystick';
import { stepAnimationFSM } from '../runtime/animFsmEvaluator';
import { buildNavMeshFromScene, findNavMeshPath } from '../ai3d/navmesh';
import {
  applyTerrainSculptBrush,
  generateProceduralTerrain,
  groundHeightAt,
  sampleTerrainHeightAt,
} from '../three3d/terrainSystem';
import {
  createSoftBodySimulation,
  createVehicle4WState,
  stepSoftBodySimulation,
  stepVehicle4W,
} from '../physics/softBodyPhysics';
import {
  compileSafeWaveFormula,
  encodeFloat32ToWavBlob,
  getSfxPresetDefaults,
  synthesizeSfxSamples,
} from '../audio/sfxSynthesizer';
import { buildProjectFromTemplate } from '../../project/templates/projectTemplates';
import { compileProjectToHtml5Zip } from '../../export/html5/html5Compiler';
import { createGameObject } from '../objects/factory';
import type { AnimationStateMachineConfig, GameObjectData, SceneData } from '../core/types';

test('extractAlphaSubRectsFromRgba splits multiple opaque islands and ignores transparent margins', () => {
  // 20x20 RGBA image: transparent background with two separate opaque islands (top-left & bottom-right)
  const width = 20;
  const height = 20;
  const rgba = new Uint8ClampedArray(width * height * 4);
  const paintBlock = (x0: number, y0: number, x1: number, y1: number) => {
    for (let y = y0; y < y1; y++) {
      for (let x = x0; x < x1; x++) {
        const idx = (y * width + x) * 4;
        rgba[idx] = 255;
        rgba[idx + 1] = 120;
        rgba[idx + 2] = 40;
        rgba[idx + 3] = 255;
      }
    }
  };
  paintBlock(2, 2, 6, 6);
  paintBlock(14, 14, 18, 18);

  const rects = extractAlphaSubRectsFromRgba(rgba, width, height, {
    alphaThreshold: 24,
    gridSize: 10,
  });

  assert.equal(rects.length, 2);
  // None of the rects should cover the empty center (x=0.5, y=0.5)
  const coversCenter = rects.some(
    (r) => 0.5 > r.x && 0.5 < r.x + r.w && 0.5 > r.y && 0.5 < r.y + r.h
  );
  assert.equal(coversCenter, false);
});

test('buildWorldTrimeshData + resolveBodyVsTrimesh allows passing under an arch tunnel and blocks pillars', () => {
  const archBase = createGameObject('mesh_3d', [], {
    name: 'TunelArco',
    shape3d: 'arch',
    x3d: 0,
    y3d: 2,
    z3d: 0,
  });
  const archObj: GameObjectData = {
    ...archBase,
    id: 'arch_1',
    transform3d: { x: 0, y: 2, z: 0, rx: 0, ry: 0, rz: 0, sx: 6, sy: 4, sz: 4 },
    physics3d: {
      enabled: true,
      bodyType: 'static',
      mass: 1,
      friction: 0.8,
      restitution: 0,
      gravityScale: 1,
      shape: 'mesh_exact',
    },
  };

  const trimesh = buildWorldTrimeshData(archObj);
  assert.ok(trimesh !== null);
  assert.ok(trimesh.triangles.length >= 90);

  // Walking right through the center opening of the arch (x=0, y=1.0, z=0) should NOT collide
  const centerWalk = resolveBodyVsTrimesh(0, 1.0, 0, 0.4, 0.9, 0.4, trimesh);
  assert.equal(centerWalk.collided, false);

  // Walking against the left inner pillar surface (x=-1.68) from the tunnel opening -> MUST collide as wall and push right
  const pillarHit = resolveBodyVsTrimesh(-1.45, 1.2, 0, 0.45, 0.9, 0.45, trimesh);
  assert.equal(pillarHit.collided, true);
  assert.equal(pillarHit.hitWall, true);
  assert.ok(pillarHit.dx > 0.1);
});

test('computeJoystickVector applies radial deadzone and clamps unit magnitude', () => {
  const insideDz = computeJoystickVector(5, 4, 60, 0.16);
  assert.equal(insideDz.magnitude, 0);
  assert.equal(insideDz.x, 0);
  assert.equal(insideDz.y, 0);

  const farDiagonal = computeJoystickVector(140, 140, 60, 0.15);
  assert.ok(farDiagonal.magnitude <= 1);
  assert.ok(farDiagonal.magnitude > 0.99);
  assert.ok(Math.hypot(farDiagonal.x, farDiagonal.y) <= 1.0002);
  assert.equal(farDiagonal.right, true);
  assert.equal(farDiagonal.down, true);
});

test('stepAnimationFSM evaluates combined &&, ||, keyHeld:* and !keyHeld:* conditions cleanly', () => {
  const fsm: AnimationStateMachineConfig = {
    initialStateId: 'st_idle',
    states: [
      { id: 'st_idle', name: 'Idle', clipName: 'idle', timeScale: 1, loopMode: 'LoopRepeat', x: 50, y: 50 },
      { id: 'st_sprint', name: 'Sprint', clipName: 'run', timeScale: 1.4, loopMode: 'LoopRepeat', x: 250, y: 50 },
      { id: 'st_jump', name: 'Jump', clipName: 'jump', timeScale: 1, loopMode: 'LoopOnce', x: 450, y: 50 },
    ],
    transitions: [
      {
        id: 'tr_1',
        fromStateId: 'st_idle',
        toStateId: 'st_sprint',
        conditionExpr: 'speed > 0.5 && keyHeld:ShiftLeft || var:turbo == true',
        blendDuration: 0.2,
      },
      {
        id: 'tr_2',
        fromStateId: 'st_sprint',
        toStateId: 'st_idle',
        conditionExpr: '!keyHeld:ShiftLeft && speed <= 0.5',
        blendDuration: 0.2,
      },
      {
        id: 'tr_3',
        fromStateId: '*',
        toStateId: 'st_jump',
        conditionExpr: 'isGrounded == false && vy > 0',
        blendDuration: 0.1,
      },
    ],
  };

  // No shift & speed=0 -> remains Idle
  const r0 = stepAnimationFSM(fsm, 'Idle', {
    speed: 0,
    vy: 0,
    isGrounded: true,
    heldKeys: new Set(),
  });
  assert.equal(r0?.stateName, 'Idle');
  assert.equal(r0?.changed, false);

  // Speed > 0.5 + ShiftLeft -> transitions to Sprint
  const r1 = stepAnimationFSM(fsm, 'Idle', {
    speed: 3,
    vy: 0,
    isGrounded: true,
    heldKeys: new Set(['ShiftLeft']),
  });
  assert.equal(r1?.stateName, 'Sprint');
  assert.equal(r1?.changed, true);

  // Release ShiftLeft & stop -> returns to Idle
  const r2 = stepAnimationFSM(fsm, 'Sprint', {
    speed: 0.1,
    vy: 0,
    isGrounded: true,
    heldKeys: new Set(),
  });
  assert.equal(r2?.stateName, 'Idle');
  assert.equal(r2?.changed, true);

  // Mid-air rising from wildcard '*' -> Jump
  const r3 = stepAnimationFSM(fsm, 'Sprint', {
    speed: 3,
    vy: 4.5,
    isGrounded: false,
    heldKeys: new Set(['ShiftLeft']),
  });
  assert.equal(r3?.stateName, 'Jump');
  assert.equal(r3?.changed, true);
});

test('Procedural Terrain generation, height sampling, sculpt brush, and NavMesh terrain role work together', () => {
  const td = generateProceduralTerrain({ width: 24, depth: 24, segments: 24, seed: 42, amplitude: 3 });
  assert.equal(td.heights.length, 25 * 25);
  assert.equal(td.splatWeights.length, 25 * 25 * 4);

  const terrainBase = createGameObject('mesh_3d', [], {
    name: 'TerrenoPrincipal',
    shape3d: 'terrain',
    x3d: 0,
    y3d: 0,
    z3d: 0,
  });
  const terrainObj: GameObjectData = {
    ...terrainBase,
    id: 'terrain_1',
    navRole: 'terrain',
    mesh3d: {
      ...terrainBase.mesh3d!,
      shape: 'terrain',
      terrainData: td,
    },
  };

  const beforeCenter = sampleTerrainHeightAt(terrainObj, 0, 0);
  assert.ok(beforeCenter !== null);

  const sculptedTd = applyTerrainSculptBrush(terrainObj, 0, 0, 'raise', 4, 1.5);
  assert.ok(sculptedTd !== null);
  terrainObj.mesh3d!.terrainData = sculptedTd;

  const afterCenter = sampleTerrainHeightAt(terrainObj, 0, 0);
  assert.ok(afterCenter !== null && afterCenter > beforeCenter! + 0.5);

  const scene: SceneData = {
    id: 'sc_terrain',
    name: 'TerrenoScene',
    backgroundColor: '#0f172a',
    gridVisible: true,
    gridSize: 32,
    snapToGrid: false,
    objects: [
      terrainObj,
      {
        ...createGameObject('mesh_3d', [], { name: 'Roca', shape3d: 'box', x3d: 0, y3d: 1, z3d: 0 }),
        id: 'rock_obs',
        navRole: 'obstacle',
        transform3d: { x: 0, y: 1, z: 0, rx: 0, ry: 0, rz: 0, sx: 2, sy: 4, sz: 6 },
      },
    ],
    mechanics: [],
  };

  const groundAtOrigin = groundHeightAt(scene, 0, 0);
  assert.ok(Math.abs(groundAtOrigin - afterCenter!) < 0.05);

  const nav = buildNavMeshFromScene(scene, { cellSize: 1.0, maxSlopeDeg: 55, agentRadius: 0.4 });
  assert.ok(nav.walkable.some((w) => w === 1));
  const path = findNavMeshPath(nav, { x: -5, z: 0 }, { x: 5, z: 0 });
  assert.ok(path.length >= 3);
  assert.ok(path.some((pt) => Math.abs(pt.z) > 2));
});

test('Soft-body Verlet rope & sand + Vehicle 4W suspension physics simulate deterministically', () => {
  const rope = createSoftBodySimulation(
    {
      enabled: true,
      kind: 'rope',
      segments: 6,
      length: 4,
      stiffness: 0.9,
      damping: 0.97,
      gravity: -18,
      anchorStart: true,
      anchorEnd: false,
    },
    0,
    5,
    0
  );
  const startTopY = rope.nodes[0].y;
  const initTipY = rope.nodes[rope.nodes.length - 1].y;
  for (let i = 0; i < 30; i++) {
    stepSoftBodySimulation(rope, 0.02, () => 0);
  }
  // Pinned node stays fixed; unpinned tip sags under gravity
  assert.equal(rope.nodes[0].y, startTopY);
  assert.ok(rope.nodes[rope.nodes.length - 1].y < initTipY);

  const sand = createSoftBodySimulation(
    {
      enabled: true,
      kind: 'sand',
      segments: 8,
      length: 3,
      stiffness: 0.8,
      damping: 0.95,
      gravity: -18,
      anchorStart: false,
      anchorEnd: false,
      particleCount: 12,
      radius: 0.14,
    },
    0,
    2,
    0
  );
  for (let i = 0; i < 60; i++) {
    stepSoftBodySimulation(sand, 0.02, () => 0);
  }
  assert.ok(sand.nodes.every((n) => n.y >= 0.139));

  const vehicleCfg = {
    enabled: true,
    maxTorque: 30,
    maxSpeed: 24,
    maxSteerDeg: 34,
    suspensionRestLen: 0.65,
    suspensionStiffness: 36,
    suspensionDamping: 4.8,
    wheelRadius: 0.42,
    wheelBase: 2.6,
    trackWidth: 1.7,
    driveType: 'awd' as const,
  };
  const veh = createVehicle4WState(0, 1.0, 0, 0, vehicleCfg);
  for (let i = 0; i < 40; i++) {
    stepVehicle4W(veh, vehicleCfg, 1, 0.6, 0.02, () => 0);
  }
  assert.ok(veh.speedForward > 4);
  assert.ok(Math.abs(veh.yawRad) > 0.05);
  assert.ok(veh.wheels.some((w) => w.grounded));
});

test('SFX Synthesizer evaluates safe math formulas without eval() and produces valid 44-byte WAV headers', async () => {
  const safeFn = compileSafeWaveFormula('sin(2*pi*f*t) * exp(-t*5)');
  assert.ok(safeFn !== null);
  const sampleVal = safeFn(0.01, 440, 0.4, 0.5);
  assert.ok(Number.isFinite(sampleVal) && Math.abs(sampleVal) <= 1);

  // Unknown identifiers resolve safely without throwing or executing arbitrary JS
  const unknownFn = compileSafeWaveFormula('process.exit(1)');
  assert.ok(unknownFn !== null);
  assert.equal(unknownFn(0.1, 440, 0.4, 0.5), 0);

  const params = getSfxPresetDefaults('laser');
  const samples = synthesizeSfxSamples(params, 22050);
  assert.ok(samples.length > 100);
  assert.ok(samples.some((s) => Math.abs(s) > 0.01));

  const wavBlob = encodeFloat32ToWavBlob(samples, 22050);
  const buf = await wavBlob.arrayBuffer();
  const view = new DataView(buf);
  const readFourCC = (offset: number) =>
    String.fromCharCode(
      view.getUint8(offset),
      view.getUint8(offset + 1),
      view.getUint8(offset + 2),
      view.getUint8(offset + 3)
    );
  assert.equal(readFourCC(0), 'RIFF');
  assert.equal(readFourCC(8), 'WAVE');
  assert.equal(readFourCC(12), 'fmt ');
  assert.equal(view.getUint16(20, true), 1); // PCM
  assert.equal(view.getUint32(24, true), 22050);
  assert.equal(readFourCC(36), 'data');
  assert.equal(view.getUint32(40, true), samples.length * 2);
});

test('Project templates build playable scenes with mechanics and compile syntactically valid 2D/3D HTML5 exports', async () => {
  const arena = buildProjectFromTemplate({
    name: 'ArenaPrueba',
    mode: '3d',
    width: 1280,
    height: 720,
    orientation: 'horizontal',
    backgroundColor: '#0f172a',
    template: 'arena_3d',
  });
  assert.ok(arena.scenes[0].objects.length >= 6);
  assert.ok((arena.scenes[0].mechanics ?? []).length >= 1);

  const plat3d = buildProjectFromTemplate({
    name: 'Plat3DPrueba',
    mode: '3d',
    width: 1280,
    height: 720,
    orientation: 'horizontal',
    backgroundColor: '#0f172a',
    template: 'platformer_3d',
  });
  assert.ok((plat3d.scenes[0].mechanics ?? []).length >= 1);

  const plat2d = buildProjectFromTemplate({
    name: 'Plat2DPrueba',
    mode: '2d',
    width: 1280,
    height: 720,
    orientation: 'horizontal',
    backgroundColor: '#0f172a',
    template: 'platformer_multiscene',
  });
  assert.ok(plat2d.scenes.length >= 2);
  assert.ok(plat2d.scenes.some((s) => (s.mechanics ?? []).length >= 1));

  // Verify generated 2D runtime JS parses with zero SyntaxError
  const pkg2d = await compileProjectToHtml5Zip(
    plat2d,
    new Map(),
    { portal: 'poki', scaleMode: 'letterbox', touchControls: true, showFullscreenButton: true },
    '/* pixi */',
    null
  );
  const zip2d = await JSZip.loadAsync(await pkg2d.blob.arrayBuffer());
  const js2d = await zip2d.file('js/nexus-runtime.js')!.async('string');
  assert.doesNotThrow(() => new vm.Script(js2d));
  const html2d = await zip2d.file('index.html')!.async('string');
  assert.ok(html2d.includes('nx-joystick-zone'));
  assert.ok(html2d.includes('poki-sdk.js'));

  // Verify generated 3D runtime JS parses with zero SyntaxError
  const pkg3d = await compileProjectToHtml5Zip(
    arena,
    new Map(),
    { portal: 'crazygames', scaleMode: 'letterbox', touchControls: true, showFullscreenButton: true },
    null,
    '/* three */'
  );
  const zip3d = await JSZip.loadAsync(await pkg3d.blob.arrayBuffer());
  const js3d = await zip3d.file('js/nexus-3d-runtime.js')!.async('string');
  assert.doesNotThrow(() => new vm.Script(js3d));
  const html3d = await zip3d.file('index.html')!.async('string');
  assert.ok(html3d.includes('nx-joystick-zone'));
  assert.ok(html3d.includes('crazygames-sdk-v3.js'));
});
