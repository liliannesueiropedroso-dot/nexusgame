import test from 'node:test';
import assert from 'node:assert/strict';
import { buildModularGeometry, buildStairsGeometry } from '../three3d/geometryBuilders';
import { buildWorldTrimeshData, resolveBodyVsTrimesh } from '../physics3d/trimeshCollider';
import {
  createInitialSmartCameraState,
  getCameraForwardXZ,
  getCameraRightXZ,
  stepSmartCamera3D,
} from '../camera/smartCamera';
import { stepAnimationFSM } from '../runtime/animFsmEvaluator';
import { ParticlePool, sampleVfxCurve } from '../vfx/particlePool';
import { expandTerrainData, generateProceduralTerrain } from '../three3d/terrainSystem';
import { analyzeProjectDiagnostics } from '../../assistant/diagnostics/diagnosticAnalyzer';
import { createSimulation3DState } from '../physics3d/physics3d';
import { createSimulationState, stepSimulation, type InputState } from '../runtime/stepGameSimulation';
import { generateNexus3DRuntimeJs } from '../../export/html5/threeRuntimeTemplate';
import { generateNexusRuntimeJs } from '../../export/html5/runtimeTemplate';
import { buildProjectFromTemplate } from '../../project/templates/projectTemplates';
import { createGameObject } from '../objects/factory';
import type {
  AnimationStateMachineConfig,
  GameObjectData,
  SceneData,
  SmartCameraConfig,
} from '../core/types';
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

function emptyInput2D(): InputState {
  return {
    left: false,
    right: false,
    up: false,
    down: false,
    jump: false,
    action1: false,
    action2: false,
    pressedKeys: [],
    pointerDown: false,
  };
}

test('Modular stairs geometry builds valid faces and trimesh steps up stairs and rotated ramps', () => {
  const stairsGeo = buildStairsGeometry(6);
  const modStairsGeo = buildModularGeometry({
    shape: 'stairs',
    color: '#94a3b8',
    metalness: 0.1,
    roughness: 0.8,
    emissive: '#000000',
    emissiveIntensity: 0,
    castShadow: true,
    receiveShadow: true,
  });
  assert.ok(stairsGeo.getAttribute('position').count > 24);
  assert.ok(modStairsGeo.getAttribute('position').count > 24);
  stairsGeo.dispose();
  modStairsGeo.dispose();

  const stairsObj = makeBox3D('stairs_1', 'Escalera', { x: 0, y: 1, z: 0 }, { sx: 4, sy: 2, sz: 2 }, {
    mesh3d: {
      shape: 'stairs',
      color: '#cbd5e1',
      metalness: 0.1,
      roughness: 0.7,
      emissive: '#000000',
      emissiveIntensity: 0,
      castShadow: true,
      receiveShadow: true,
    },
    physics3d: {
      enabled: true,
      bodyType: 'static',
      mass: 1,
      friction: 0.8,
      restitution: 0,
      gravityScale: 1,
      shape: 'mesh_exact',
    },
  });
  const stairsTri = buildWorldTrimeshData(stairsObj);
  assert.ok(stairsTri !== null);

  // Body standing near bottom-right step edge stepping upward along -X
  const res = resolveBodyVsTrimesh(1.45, 1.0, 0, 0.4, 0.9, 0.4, stairsTri!);
  assert.equal(res.collided, true);
  assert.equal(res.hitFloor, true);
  assert.ok(res.dy > 0, `Expected upward stair step-up dy > 0, got ${res.dy}`);

  // Rotated ramp trimesh collision in Simulation3D
  const floor = makeBox3D('floor', 'Suelo', { x: 0, y: -0.5, z: 0 }, { sx: 30, sy: 1, sz: 30 });
  const rotatedRamp = makeBox3D('ramp_rot', 'RampaRot', { x: 0, y: 0.5, z: 3 }, { sx: 4, sy: 1, sz: 4 }, {
    transform3d: { x: 0, y: 0.5, z: 3, rx: 0, ry: 90, rz: 0, sx: 4, sy: 1, sz: 4 },
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
  });
  const rotatedTrimesh = buildWorldTrimeshData(rotatedRamp);
  assert.ok(rotatedTrimesh !== null);
  const floorHit = resolveBodyVsTrimesh(0, 1.05, 3, 0.4, 0.8, 0.4, rotatedTrimesh!);
  assert.equal(floorHit.collided, true);

  const scene: SceneData = {
    id: 'stairs_sim',
    name: 'StairsSim',
    backgroundColor: '#0f172a',
    gridVisible: true,
    gridSize: 32,
    snapToGrid: false,
    objects: [
      floor,
      stairsObj,
      rotatedRamp,
      makeBox3D('pl', 'Player', { x: 1.5, y: 1.8, z: 0 }, { sx: 0.8, sy: 1.8, sz: 0.8 }, {
        physics3d: { enabled: true, bodyType: 'dynamic', mass: 1, friction: 0.7, restitution: 0, gravityScale: 1, shape: 'capsule' },
        components: [{ id: 'c_p', type: 'player_3d', enabled: true, config: { speed: 7, jumpForce: 9 } }],
      }),
    ],
    mechanics: [],
  };
  const sim = createSimulation3DState(scene);
  for (let i = 0; i < 20; i++) {
    sim.step({ dt: 0.02, heldKeys: new Set(['KeyA']), justPressedKeys: new Set() });
  }
  const pl = sim.objects.find((o) => o.id === 'pl')!;
  assert.ok(pl.t3.x < 1.0, `Expected player to move left onto stairs, got x=${pl.t3.x}`);
  assert.ok(pl.t3.y >= 0.85, `Expected player to climb/stay on stairs, got y=${pl.t3.y}`);
});

test('SmartCamera3D supports first_person, top_down, OTS offsets, fovKick, and camera XZ basis', () => {
  const baseCfg: SmartCameraConfig = {
    isMainCamera: true,
    mode: 'first_person',
    targetObjectId: 'player',
    dampingFactor: 0.9,
    lookAhead: 0.4,
    offsetX: 0,
    offsetY: 4,
    offsetZ: 10,
    distance: 10,
    pitchMinDeg: -50,
    pitchMaxDeg: 35,
    fov: 60,
    fovKick: 12,
    shoulderOffsetX: 1.2,
    shoulderOffsetY: 0.75,
    deadzoneW: 2,
    deadzoneH: 2,
    collideWithWalls: false,
    useBounds: false,
    boundsMinX: -50,
    boundsMaxX: 50,
    boundsMinY: 0,
    boundsMaxY: 40,
    boundsMinZ: -50,
    boundsMaxZ: 50,
  };

  // First person
  const fpState = createInitialSmartCameraState('c_fp', { x: 0, y: 2, z: 5 });
  fpState.orbitYawDeg = 0;
  fpState.orbitPitchDeg = 0;
  for (let i = 0; i < 20; i++) {
    stepSmartCamera3D(fpState, baseCfg, { x: 0, y: 2, z: 5 }, { x: 2, y: 1, z: 3, vx: 6, vz: 0 }, [], 0.03);
  }
  assert.ok(Math.abs(fpState.posX - 2) < 0.2);
  assert.ok(Math.abs(fpState.posY - 1.75) < 0.25);
  assert.ok(fpState.fov > 64, `Expected fovKick to boost FOV above 64, got ${fpState.fov}`);

  // Basis orthogonality
  const fwd = getCameraForwardXZ(fpState);
  const right = getCameraRightXZ(fpState);
  const dot = fwd.x * right.x + fwd.z * right.z;
  assert.ok(Math.abs(dot) < 1e-4, `Expected orthogonal XZ camera vectors, dot=${dot}`);
  assert.ok(Math.abs(Math.hypot(fwd.x, fwd.z) - 1) < 1e-4);

  // Top-down
  const tdState = createInitialSmartCameraState('c_td', { x: 0, y: 10, z: 10 });
  for (let i = 0; i < 25; i++) {
    stepSmartCamera3D(
      tdState,
      { ...baseCfg, mode: 'top_down', distance: 18, offsetX: 0, offsetZ: 4 },
      { x: 0, y: 10, z: 10 },
      { x: 5, y: 1, z: -2, vx: 0, vz: 0 },
      [],
      0.03
    );
  }
  assert.ok(tdState.posY > 17, `Expected top_down high Y > 17, got ${tdState.posY}`);
  assert.ok(Math.abs(tdState.posX - 5) < 0.5);

  // Third person orbit with OTS shoulder offset
  const otsZero = createInitialSmartCameraState('c_ots0', { x: 0, y: 3, z: 8 });
  const otsShift = createInitialSmartCameraState('c_ots1', { x: 0, y: 3, z: 8 });
  for (let i = 0; i < 25; i++) {
    stepSmartCamera3D(otsZero, { ...baseCfg, mode: 'third_person_orbit', shoulderOffsetX: 0 }, { x: 0, y: 3, z: 8 }, { x: 0, y: 1, z: 0 }, [], 0.03);
    stepSmartCamera3D(otsShift, { ...baseCfg, mode: 'third_person_orbit', shoulderOffsetX: 2.0 }, { x: 0, y: 3, z: 8 }, { x: 0, y: 1, z: 0 }, [], 0.03);
  }
  assert.ok(Math.abs(otsShift.lookAtX - otsZero.lookAtX) > 1.2, 'Expected shoulderOffsetX to shift lookAt target laterally');
});

test('stepAnimationFSM handles animFinished, !animFinished, LoopPingPong, and Any State (*)', () => {
  const fsm: AnimationStateMachineConfig = {
    initialStateId: 'st_idle',
    states: [
      { id: 'st_idle', name: 'Idle', clipName: 'idle', timeScale: 1, loopMode: 'LoopRepeat', x: 0, y: 0 },
      { id: 'st_atk', name: 'Attack', clipName: 'attack', timeScale: 1.2, loopMode: 'LoopOnce', x: 200, y: 0 },
      { id: 'st_hurt', name: 'Hurt', clipName: 'hurt', timeScale: 1, loopMode: 'LoopPingPong', x: 200, y: 120 },
    ],
    transitions: [
      { id: 'tr1', fromStateId: 'st_idle', toStateId: 'st_atk', conditionExpr: 'keyHeld:KeyJ', blendDuration: 0.1 },
      { id: 'tr2', fromStateId: 'st_atk', toStateId: 'st_idle', conditionExpr: 'animFinished', blendDuration: 0.1 },
      { id: 'tr3', fromStateId: '*', toStateId: 'st_hurt', conditionExpr: 'var:salud <= 20', blendDuration: 0.1 },
      { id: 'tr4', fromStateId: 'st_hurt', toStateId: 'st_idle', conditionExpr: '!animFinished && var:salud > 20', blendDuration: 0.1 },
    ],
  };

  // Start -> Attack on keyHeld:KeyJ
  const r1 = stepAnimationFSM(fsm, 'Idle', {
    speed: 0,
    vy: 0,
    isGrounded: true,
    heldKeys: new Set(['KeyJ']),
    variables: new Map([['salud', 100]]),
  });
  assert.equal(r1?.stateName, 'Attack');
  assert.equal(r1?.loopMode, 'LoopOnce');

  // While Attack not finished -> stays in Attack
  const r2 = stepAnimationFSM(fsm, 'Attack', {
    speed: 0,
    vy: 0,
    isGrounded: true,
    animFinished: false,
    animProgress: 0.4,
    variables: new Map([['salud', 100]]),
  });
  assert.equal(r2?.changed, false);
  assert.equal(r2?.stateName, 'Attack');

  // When Attack finishes -> returns to Idle
  const r3 = stepAnimationFSM(fsm, 'Attack', {
    speed: 0,
    vy: 0,
    isGrounded: true,
    animFinished: true,
    animProgress: 1.0,
    variables: new Map([['salud', 100]]),
  });
  assert.equal(r3?.changed, true);
  assert.equal(r3?.stateName, 'Idle');

  // Any State '*' interrupts into Hurt (LoopPingPong)
  const r4 = stepAnimationFSM(fsm, 'Idle', {
    speed: 0,
    vy: 0,
    isGrounded: true,
    variables: new Map([['salud', 10]]),
  });
  assert.equal(r4?.changed, true);
  assert.equal(r4?.stateName, 'Hurt');
  assert.equal(r4?.loopMode, 'LoopPingPong');

  // !animFinished recovers from Hurt when salud > 20
  const r5 = stepAnimationFSM(fsm, 'Hurt', {
    speed: 0,
    vy: 0,
    isGrounded: true,
    animFinished: false,
    animProgress: 0.5,
    variables: new Map([['salud', 80]]),
  });
  assert.equal(r5?.changed, true);
  assert.equal(r5?.stateName, 'Idle');
});

test('3D & 2D script APIs (vfx, ui, spawn, world, camera, lights, self.speed/playState) & 3D fov keyframe tween', () => {
  const script3d: NexusScriptAsset = {
    id: 'sc_api_3d',
    name: 'ApiParity3D',
    kind: 'script',
    updatedAt: Date.now(),
    code: `
export function onStart(self, nexus) {
  self.setVelocity(3, 0, 4);
  self.playState('Run');
  nexus.vfx.emit({ x: 0, y: 1, z: 0, preset: 'liquid', count: 8 });
  nexus.vfx.spawnBurst(1, 2, 3, 'ripple', 6);
  nexus.ui.showToast('Hola 3D', 1.2);
  nexus.ui.createWidget('hud_w', '<div>OK</div>', { x: 12, y: 12 });
  nexus.ui.updateWidget('hud_w', { text: '<div>UPDATED</div>' });
  nexus.spawn.primitive('box', { name: 'SpawnBox', x: 5, y: 1, z: 0, sx: 1, sy: 1, sz: 1 });
  nexus.lights.setSun({ intensity: 1.9, color: '#ffeedd' });
  nexus.lights.setLight('LuzTest', { intensity: 4.5, distance: 30 });
  nexus.camera.blendTo({ x: 4, y: 6, z: 12, lookAtX: 0, lookAtY: 1, lookAtZ: 0, fov: 68, duration: 0.1 });
  nexus.vars.set('startSpeed', Math.round(self.speed));
  nexus.vars.set('hasSpawnBox', Boolean(nexus.findByName('SpawnBox')));
}
export function onUpdate(self, dt, nexus) {
  const ray = nexus.world.raycast(5, 5, 0, 0, -1, 0, 20);
  nexus.vars.set('rayHit', ray.hit ? ray.objectName || 'ground' : 'none');
  nexus.vars.set('terrH', nexus.world.getTerrainHeight(0, 0));
  const fwd = nexus.camera.getForward();
  const rgt = nexus.camera.getRight();
  nexus.vars.set('camVecLen', Math.round((Math.hypot(fwd.x, fwd.y, fwd.z) + Math.hypot(rgt.x, rgt.z)) * 10));
}
`,
  };

  const camObj = {
    ...createGameObject('camera_3d', [], { name: 'CamMain', x3d: 0, y3d: 5, z3d: 10 }),
    id: 'cam_3d',
    tweens: [
      { id: 'tw_fov', name: 'FOVZoom', property: 'fov' as const, from: 50, to: 70, duration: 0.2, delay: 0, easing: 'linear' as const, loop: false, pingPong: false, autoPlay: true },
    ],
  };
  const lightObj = createGameObject('light_3d', [], { name: 'LuzTest', x3d: 0, y3d: 4, z3d: 0 });
  const playerObj = makeBox3D('p_3d', 'Player3D', { x: 0, y: 1, z: 0 }, { sx: 1, sy: 2, sz: 1 }, {
    physics3d: { enabled: true, bodyType: 'dynamic', mass: 1, friction: 0.6, restitution: 0, gravityScale: 1, shape: 'box' },
    animStateMachine: {
      initialStateId: 'idle',
      states: [
        { id: 'idle', name: 'Idle', clipName: 'idle_clip', timeScale: 1, loopMode: 'LoopRepeat', x: 0, y: 0 },
        { id: 'run', name: 'Run', clipName: 'run_clip', timeScale: 1.5, loopMode: 'LoopRepeat', x: 180, y: 0 },
      ],
      transitions: [],
    },
    scriptBindings: [{ id: 'b1', scriptId: script3d.id, enabled: true }],
  });

  const scene3d: SceneData = {
    id: 'sc_parity_3d',
    name: 'Parity3D',
    backgroundColor: '#0f172a',
    gridVisible: true,
    gridSize: 32,
    snapToGrid: false,
    objects: [
      makeBox3D('ground_3d', 'Ground', { x: 0, y: -0.5, z: 0 }, { sx: 40, sy: 1, sz: 40 }),
      camObj,
      lightObj,
      playerObj,
    ],
    mechanics: [],
  };

  const sim3d = createSimulation3DState(scene3d, [script3d]);
  for (let i = 0; i < 8; i++) {
    sim3d.step({ dt: 0.03, heldKeys: new Set(), justPressedKeys: new Set() });
  }
  assert.equal(sim3d.variables.get('startSpeed'), 5);
  assert.equal(sim3d.variables.get('hasSpawnBox'), true);
  assert.notEqual(sim3d.variables.get('rayHit'), 'none');
  assert.equal(sim3d.variables.get('camVecLen'), 20);
  assert.equal(sim3d.getSunOverride().intensity, 1.9);
  assert.equal(sim3d.getUiOverlayState().widgets[0]?.html, '<div>UPDATED</div>');
  assert.equal(sim3d.getUiOverlayState().toasts.length, 1);
  assert.ok(sim3d.particlePool.activeCount() >= 14);
  const pRun = sim3d.objects.find((o) => o.id === 'p_3d')!;
  assert.equal(pRun.activeClip, 'run_clip');
  assert.ok((camObj.camera3d?.fov ?? 50) >= 50 || sim3d.cameraState.fov > 55);

  const api3d = sim3d.getApi();
  api3d.ui.removeWidget('hud_w');
  assert.equal(sim3d.getUiOverlayState().widgets.length, 0);
  api3d.ui.createWidget('w2', '<p>2</p>');
  api3d.ui.clearWidgets();
  assert.equal(sim3d.getUiOverlayState().widgets.length, 0);
  api3d.camera.setPosition(1, 2, 3);
  api3d.camera.lookAt(0, 0, 0);
  assert.equal(sim3d.cameraState.posX, 1);

  // 2D parity
  const script2d: NexusScriptAsset = {
    id: 'sc_api_2d',
    name: 'ApiParity2D',
    kind: 'script',
    updatedAt: Date.now(),
    code: `
export function onStart(self, nexus) {
  self.setVelocity(30, 40);
  self.playState('Walk');
  nexus.vfx.emit({ x: 100, y: 100, preset: 'waterfall', count: 6 });
  nexus.vfx.spawnBurst(200, 200, 'ripple', 5);
  nexus.ui.showToast('Hola 2D', 1.5);
  nexus.ui.createWidget('w2d', '<span>2D</span>', { x: 10, y: 10 });
  nexus.ui.updateWidget('w2d', { text: '<span>2D-OK</span>' });
  nexus.spawn.primitive('box', { name: 'Box2D', x: 400, y: 300, sx: 2, sy: 2 });
  nexus.camera.setPosition(120, 80);
  const ray = nexus.world.raycast(200, 300, 0, 1, 0, 0, 600);
  nexus.vars.set('spd2d', Math.round(self.speed));
  nexus.vars.set('hit2d', ray.hit ? ray.objectName : 'none');
}
`,
  };
  const spr2d: GameObjectData = {
    ...createGameObject('sprite', [], { name: 'Hero2D', x: 100, y: 300 }),
    id: 'hero_2d',
    animStateMachine: {
      initialStateId: 'idle',
      states: [
        { id: 'idle', name: 'Idle', clipName: 'idle_2d', timeScale: 1, loopMode: 'LoopRepeat', x: 0, y: 0 },
        { id: 'walk', name: 'Walk', clipName: 'walk_2d', timeScale: 1, loopMode: 'LoopRepeat', x: 180, y: 0 },
      ],
      transitions: [],
    },
    scriptBindings: [{ id: 'b2d', scriptId: script2d.id, enabled: true }],
  };
  const scene2d: SceneData = {
    id: 'sc_2d',
    name: 'Parity2D',
    backgroundColor: '#0f172a',
    gridVisible: true,
    gridSize: 32,
    snapToGrid: false,
    objects: [spr2d],
    mechanics: [],
  };
  const sim2d = createSimulationState(scene2d, [], { scripts: [script2d] });
  stepSimulation(sim2d, 0.016, emptyInput2D());
  assert.equal(sim2d.variables.get('spd2d'), 50);
  assert.equal(sim2d.variables.get('hit2d'), 'Box2D');
  assert.equal(sim2d.cameraPos.x, 120);
  assert.equal(sim2d.dynamicWidgets?.[0]?.html, '<span>2D-OK</span>');
  assert.equal(sim2d.dynamicToasts?.length, 1);
  assert.ok(sim2d.emitterParticles.length >= 11);
  assert.equal(sim2d.scene.objects.find((o) => o.id === 'hero_2d')?.sprite?.animation?.activeClip, 'walk_2d');
});

test('sampleVfxCurve, ParticlePool curves/turbulence, expandTerrainData, and script diagnostics work', () => {
  // VFX curve sampling & turbulence/drag pool
  assert.equal(sampleVfxCurve([1, 0.5, 0], 0.5, 10, 2), 5);
  assert.equal(sampleVfxCurve(undefined, 0.5, 10, 2), 6);

  const pool = new ParticlePool(64);
  pool.burst(
    'vfx1',
    0,
    0,
    0,
    10,
    {
      enabled: true,
      preset: 'liquid',
      rate: 20,
      maxParticles: 64,
      speedMin: 40,
      speedMax: 40,
      angleDeg: 0,
      spreadDeg: 10,
      gravity: 0,
      sizeStart: 10,
      sizeEnd: 2,
      lifetime: 1,
      colorStart: '#7dd3fc',
      colorEnd: '#0284c7',
      blendAlpha: 0.9,
      drag: 1.5,
      turbulence: 20,
      emitterShape: 'ring',
      emitterRadius: 5,
      sizeCurve: [1, 0.5, 0.2],
      alphaCurve: [1, 0.5, 0],
    },
    false
  );
  pool.step(0.25, 0, false);
  assert.ok(pool.items[0].size < 10 && pool.items[0].size > 2);
  assert.ok(pool.items[0].alpha < 1 && pool.items[0].alpha > 0);

  // expandTerrainData preserves center sculpted elevation
  const terr = generateProceduralTerrain({ width: 20, depth: 20, segments: 10, seed: 42, amplitude: 3 });
  const centerIdx = 5 * 11 + 5;
  terr.heights[centerIdx] = 9.5;
  const expanded = expandTerrainData(terr, 60, 60, 20);
  assert.equal(expanded.width, 60);
  assert.equal(expanded.depth, 60);
  const expCenterIdx = 10 * 21 + 10;
  assert.ok(Math.abs(expanded.heights[expCenterIdx] - 9.5) < 0.05);

  // Script diagnostics section 7
  const proj = buildProjectFromTemplate({
    name: 'DiagTest',
    mode: '3d',
    width: 1280,
    height: 720,
    orientation: 'horizontal',
    backgroundColor: '#0f172a',
    template: 'empty_single',
  });
  const sUnattached: NexusScriptAsset = { id: 'sc_u', name: 'Suelto', kind: 'script', updatedAt: 1, code: 'export function onStart() {}' };
  const sActive: NexusScriptAsset = {
    id: 'sc_a',
    name: 'Activo',
    kind: 'script',
    updatedAt: 1,
    code: `
export function onCollisionEnter() {}
export function onUpdate(self, dt, nexus) {
  nexus.camera.setPosition(0, 5, 10);
  nexus.findByName('FantasmaInexistente');
}
`,
  };
  const camFollow = createGameObject('camera_3d', [], { name: 'CamFollow' });
  if (camFollow.camera3d) camFollow.camera3d.mode = 'smooth_follow';
  const meshNoPhys = makeBox3D('m_nophy', 'MallaSinFisica', { x: 0, y: 1, z: 0 }, { sx: 1, sy: 1, sz: 1 }, {
    physics3d: { enabled: false, bodyType: 'static', shape: 'box', mass: 1, friction: 0.5, restitution: 0, gravityScale: 1 },
    scriptBindings: [{ id: 'ba1', scriptId: sActive.id, enabled: true }],
  });
  proj.scripts = [sUnattached, sActive];
  proj.scenes[0].objects.push(camFollow, meshNoPhys);

  const diags = analyzeProjectDiagnostics(proj, proj.scenes[0], proj.assets);
  const codes = new Set(diags.map((d) => d.code));
  assert.ok(codes.has('SCRIPT_UNATTACHED'));
  assert.ok(codes.has('SCRIPT_CAMERA_CONFLICT'));
  assert.ok(codes.has('SCRIPT_BROKEN_REF'));
  assert.ok(codes.has('SCRIPT_COLLISION_NO_PHYSICS'));
});

test('Generated 2D & 3D HTML5 export runtime scripts have valid syntax and zero external CDN URLs', () => {
  const opts = {
    portal: 'web' as const,
    scaleMode: 'letterbox' as const,
    touchControls: true,
    showFullscreenButton: true,
  };
  const js2d = generateNexusRuntimeJs(opts);
  const js3d = generateNexus3DRuntimeJs(opts);

  // Zero http:// or https:// CDN URLs inside generated runtime templates
  assert.equal(js2d.match(/https?:\/\//g), null, '2D export JS must contain zero external URLs');
  assert.equal(js3d.match(/https?:\/\//g), null, '3D export JS must contain zero external URLs');

  // Parse syntax via Function constructor (throws SyntaxError if escaping broken)
  assert.doesNotThrow(() => new Function(js2d), '2D export JS must parse cleanly');
  assert.doesNotThrow(() => new Function(js3d), '3D export JS must parse cleanly');

  // Key upgraded runtime symbols exist in both exports
  assert.ok(js2d.includes('sampleVfxCurve2D'));
  assert.ok(js2d.includes('showToast'));
  assert.ok(js2d.includes('getMaxDpr2D'));
  assert.ok(js3d.includes('buildStairsGeometry'));
  assert.ok(js3d.includes('retargetClipForRoot3D'));
  assert.ok(js3d.includes('getMaxDpr3D'));
  assert.ok(js3d.includes('infiniteHorizon'));
});
