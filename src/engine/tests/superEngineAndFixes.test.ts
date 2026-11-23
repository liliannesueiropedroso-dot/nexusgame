import test from 'node:test';
import assert from 'node:assert/strict';
import {
  parseHexRgb2D,
  computeLightFalloffAlpha,
  compute2DShadowPolygons,
} from '../renderer2d/lighting2dMath';
import { stepAnimationFSM } from '../runtime/animFsmEvaluator';
import { EngineBlackboard, EventBus } from '../wiring/eventBus';
import { PersistenceStore } from '../wiring/persistenceStore';
import { applyArchetypeToScene, getObjectInspectorWiringView } from '../wiring/archetypes';
import { EngineWiringSystem } from '../wiring/wiringEngine';
import { MultiplayerRoomManager, sanitizeNetId } from '../multiplayer/roomState';
import { SUPER_BEHAVIOR_SPECS } from '../components/superBehaviorDefinitions';
import { getBehaviorEntry, BEHAVIOR_REGISTRY } from '../components/behaviorRegistry';
import { createSimulationState, stepSimulation, type InputState } from '../runtime/stepGameSimulation';
import { createSimulation3DState } from '../physics3d/physics3d';
import { generateNexusRuntimeJs } from '../../export/html5/runtimeTemplate';
import { generateNexus3DRuntimeJs } from '../../export/html5/threeRuntimeTemplate';
import { createGameObject } from '../objects/factory';
import type { AnimationStateMachineConfig, GameObjectData, SceneData } from '../core/types';

function emptyInput2D(overrides: Partial<InputState> = {}): InputState {
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
    ...overrides,
  };
}

function makeMesh3D(
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
      friction: 0.7,
      restitution: 0,
      gravityScale: 1,
      shape: 'box',
    },
    ...overrides,
  };
}

test('lighting2dMath: hex parsing, smooth radial falloff, and 2D shadow polygon projection', () => {
  assert.deepEqual(parseHexRgb2D('#ff8800'), { r: 255, g: 136, b: 0 });
  assert.deepEqual(parseHexRgb2D('#f80'), { r: 255, g: 136, b: 0 });
  assert.deepEqual(parseHexRgb2D('invalid'), { r: 253, g: 230, b: 138 });

  const aCenter = computeLightFalloffAlpha(0, 1.2, 0.7);
  const aMid = computeLightFalloffAlpha(0.5, 1.2, 0.7);
  const aEdge = computeLightFalloffAlpha(1.0, 1.2, 0.7);
  assert.ok(aCenter > aMid && aMid > aEdge);
  assert.equal(aEdge, 0);
  assert.equal(computeLightFalloffAlpha(0.2, 0, 0.7), 0);

  const quads = compute2DShadowPolygons({ x: 100, y: 100 }, 300, [
    { x: 200, y: 100, width: 40, height: 40, rotationDeg: 0, anchorX: 0.5, anchorY: 0.5 },
    { x: 900, y: 100, width: 40, height: 40, rotationDeg: 0, anchorX: 0.5, anchorY: 0.5 },
  ]);
  assert.ok(quads.length >= 1, 'Occluder within light radius must cast shadow quads');
  assert.ok(quads.every((q) => q.points.length === 8 && q.points.every(Number.isFinite)));
  // Shadow projects along +X (away from light at x=100 toward x=200)
  assert.ok(quads[0].direction.x > 0.9);
});

test('stepAnimationFSM: falling condition, terminal Death (*) priority, and no self-looping restart', () => {
  const fsm: AnimationStateMachineConfig = {
    initialStateId: 'st_idle',
    states: [
      { id: 'st_idle', name: 'Idle', clipName: 'idle', timeScale: 1, loopMode: 'LoopRepeat', x: 0, y: 0 },
      { id: 'st_jump', name: 'Jump', clipName: 'jump', timeScale: 1, loopMode: 'LoopOnce', x: 160, y: 0 },
      { id: 'st_fall', name: 'Fall', clipName: 'fall', timeScale: 1, loopMode: 'LoopRepeat', x: 320, y: 0 },
      { id: 'st_death', name: 'Death', clipName: 'death', timeScale: 1, loopMode: 'LoopOnce', x: 480, y: 0 },
    ],
    transitions: [
      { id: 't_j', fromStateId: 'st_idle', toStateId: 'st_jump', conditionExpr: 'isGrounded == false && vy > 0', blendDuration: 0.1 },
      { id: 't_f', fromStateId: '*', toStateId: 'st_fall', conditionExpr: 'falling', blendDuration: 0.15 },
      { id: 't_land', fromStateId: 'st_fall', toStateId: 'st_idle', conditionExpr: 'isGrounded == true', blendDuration: 0.12 },
      { id: 't_die', fromStateId: '*', toStateId: 'st_death', conditionExpr: 'var:salud <= 0', blendDuration: 0.1 },
    ],
  };

  // Rising airborne triggers Jump, NOT Fall
  const jumpRes = stepAnimationFSM(fsm, 'Idle', {
    speed: 1,
    vy: 6,
    isGrounded: false,
    variables: new Map([['salud', 100]]),
  });
  assert.equal(jumpRes?.changed, true);
  assert.equal(jumpRes?.stateName, 'Jump');

  // Falling airborne triggers Fall via wildcard 'falling'
  const fallRes = stepAnimationFSM(fsm, 'Jump', {
    speed: 1,
    vy: -3,
    isGrounded: false,
    variables: new Map([['salud', 100]]),
  });
  assert.equal(fallRes?.changed, true);
  assert.equal(fallRes?.stateName, 'Fall');

  // Staying in Fall must NOT restart/change on consecutive frames
  const fallHold = stepAnimationFSM(fsm, 'Fall', {
    speed: 1,
    vy: -5,
    isGrounded: false,
    variables: new Map([['salud', 100]]),
  });
  assert.equal(fallHold?.changed, false);
  assert.equal(fallHold?.stateName, 'Fall');

  // Terminal wildcard Death ('var:salud <= 0') overrides Jump/Fall/Idle
  const deathRes = stepAnimationFSM(fsm, 'Fall', {
    speed: 0,
    vy: -4,
    isGrounded: false,
    variables: new Map([['salud', 0]]),
  });
  assert.equal(deathRes?.changed, true);
  assert.equal(deathRes?.stateName, 'Death');

  // Staying in Death never self-loops via '*'
  const deathHold = stepAnimationFSM(fsm, 'Death', {
    speed: 0,
    vy: 0,
    isGrounded: true,
    variables: new Map([['salud', 0]]),
  });
  assert.equal(deathHold?.changed, false);
  assert.equal(deathHold?.stateName, 'Death');
});

test('EventBus, EngineBlackboard, and PersistenceStore idempotency & cooldowns', () => {
  const bus = new EventBus();
  const bb = new EngineBlackboard();
  let received = 0;
  const off = bus.on<{ v: number }>('ping', (p) => {
    received += p.v;
  });
  bus.emit('ping', { v: 3 });
  off();
  bus.emit('ping', { v: 5 });
  assert.equal(received, 3);

  bb.set('zone', 'bosque');
  assert.equal(bb.get('zone'), 'bosque');

  const store = new PersistenceStore('test_save_slot');
  const firstAdd = store.addItem('crystal', 2, 'tx_100');
  const dupAdd = store.addItem('crystal', 2, 'tx_100');
  assert.equal(firstAdd.accepted, true);
  assert.equal(dupAdd.accepted, false);
  assert.equal(dupAdd.reason, 'duplicate_action');
  assert.equal(store.state.inventory.crystal, 2);

  const claim1 = store.claimWorldNode('node_A', 15, 'p1', 'tx_node_1', 1000);
  const claimCooldown = store.claimWorldNode('node_A', 15, 'p2', 'tx_node_2', 5000);
  const claimRespawned = store.claimWorldNode('node_A', 15, 'p2', 'tx_node_3', 20000);
  assert.equal(claim1.accepted, true);
  assert.equal(claimCooldown.accepted, false);
  assert.equal(claimCooldown.reason, 'cooldown_active');
  assert.equal(claimRespawned.accepted, true);
});

test('Super Behavior Registry, Archetype auto-wiring, and EngineWiringSystem signal dispatch + context isolation', () => {
  assert.equal(SUPER_BEHAVIOR_SPECS.length, 34);
  for (const spec of SUPER_BEHAVIOR_SPECS) {
    const found = getBehaviorEntry(spec.type);
    assert.ok(found, `Missing ${spec.type} in BEHAVIOR_REGISTRY`);
    assert.ok(BEHAVIOR_REGISTRY.some((b) => b.type === spec.type));
    assert.ok(found?.contexts?.length);
  }

  const player = createGameObject('sprite', [], { name: 'Hero', x: 100, y: 100 });
  player.id = 'obj_player';
  player.role = 'player';
  player.components = [{ id: 'c_p', type: 'player_platformer', enabled: true, config: {} }];

  const crystal = createGameObject('sprite', [], { name: 'Cristal', x: 110, y: 100 });
  crystal.id = 'obj_crystal';

  const boat = createGameObject('sprite', [], { name: 'Bote', x: 250, y: 100 });
  boat.id = 'obj_boat';

  const baseScene: SceneData = {
    id: 'sc_wire',
    name: 'WireScene',
    sceneContext: 'open_world',
    backgroundColor: '#0f172a',
    gridVisible: true,
    gridSize: 32,
    snapToGrid: false,
    objects: [player, crystal, boat],
    mechanics: [],
  };

  const res1 = applyArchetypeToScene(baseScene, 'obj_crystal', 'collectible', '2d');
  assert.ok(res1.createdLinks.some((l) => l.signal === 'onCollected' && l.targetObjectId === 'obj_player' && l.targetBehavior === 'inventory.backpack'));

  const res2 = applyArchetypeToScene(
    { ...baseScene, objects: res1.objects, wiringLinks: res1.wiringLinks },
    'obj_boat',
    'boat',
    '2d'
  );
  assert.ok(res2.createdLinks.some((l) => l.signal === 'onBoardStateChanged' && l.targetObjectId === 'obj_player' && l.targetBehavior === 'juice.camera_follow'));

  const playerView = getObjectInspectorWiringView({ ...baseScene, objects: res2.objects, wiringLinks: res2.wiringLinks }, 'obj_player');
  assert.ok(playerView?.behaviors.some((b) => b.type === 'inventory.backpack' && b.source.startsWith('auto:')));
  assert.ok(playerView?.behaviors.some((b) => b.type === 'juice.camera_follow' && b.incomingLinks.length === 1));

  // Runtime EngineWiringSystem signal dispatch & context isolation
  const sys = new EngineWiringSystem();
  sys.setSceneContext('gameplay');
  sys.createEntity({ id: 'p', role: 'player' });
  sys.addBehavior('p', 'inventory.backpack');
  sys.addBehavior('p', 'juice.camera_follow');
  sys.createEntity({ id: 'c', role: 'collectible' });
  sys.applyArchetype('c', 'collectible');

  let menuTickCount = 0;
  sys.registerBehavior({
    id: 'ui.menu_nav',
    contexts: ['menu'],
    onUpdate: () => {
      menuTickCount += 1;
    },
  });
  sys.createEntity({ id: 'btn', role: 'ui' });
  sys.addBehavior('btn', 'ui.menu_nav');

  sys.update(0.016);
  assert.equal(menuTickCount, 0, 'Menu behavior must NOT update while sceneContext is gameplay');

  sys.setSceneContext('menu');
  sys.update(0.016);
  assert.equal(menuTickCount, 1, 'Menu behavior must update once sceneContext switches to menu');

  const sent = sys.emitBehaviorSignal('c', 'world.resource_node', 'onCollected', {
    itemId: 'crystal',
    amount: 3,
    actionId: 'col_1',
  });
  assert.equal(sent, 1);
  assert.equal(sys.persistence.state.inventory.crystal, 3);
});

test('MultiplayerRoomManager: join, auto-sharding, state_update, anti-dup claimWorldNode, and sanitizeNetId', () => {
  assert.equal(sanitizeNetId('../../etc/passwd', 'fallback'), '______etc_passwd');
  assert.equal(sanitizeNetId('valid_room-1', 'fallback'), 'valid_room-1');

  const mgr = new MultiplayerRoomManager();
  const j1 = mgr.joinRoom({ roomId: 'islas', playerId: 'p1', name: 'Ana', maxPlayers: 2, autoShard: true });
  const j2 = mgr.joinRoom({ roomId: 'islas', playerId: 'p2', name: 'Luis', maxPlayers: 2, autoShard: true });
  const j3 = mgr.joinRoom({ roomId: 'islas', playerId: 'p3', name: 'Mia', maxPlayers: 2, autoShard: true });

  assert.equal(j1.ok, true);
  assert.equal(j1.roomId, 'islas');
  assert.equal(j2.roomId, 'islas');
  assert.equal(j3.ok, true);
  assert.equal(j3.roomId, 'islas_s2', '3rd player must overflow into shard 2 when maxPlayers=2');

  const updated = mgr.updatePlayerState('islas', 'p1', { x: 120, y: 45, animState: 'Walk' }, 5000);
  assert.equal(updated?.x, 120);
  assert.equal(updated?.animState, 'Walk');

  const c1 = mgr.claimWorldNode({ roomId: 'islas', playerId: 'p1', nodeId: 'ore_1', actionId: 'a1', respawnSec: 10, now: 1000 });
  const cDup = mgr.claimWorldNode({ roomId: 'islas', playerId: 'p2', nodeId: 'ore_1', actionId: 'a2', respawnSec: 10, now: 2000 });
  const cSameAction = mgr.claimWorldNode({ roomId: 'islas', playerId: 'p1', nodeId: 'ore_2', actionId: 'a1', respawnSec: 10, now: 3000 });
  assert.equal(c1.ok, true);
  assert.equal(cDup.ok, false);
  assert.equal(cSameAction.duplicate, true);

  assert.equal(mgr.leaveRoom('islas', 'p1'), true);
  assert.equal(mgr.getRoomSnapshot('islas')?.players.length, 1);
});

test('2D & 3D Simulation execute Super Library behaviors, cameraFollowOverride, and FSM stability', () => {
  // 2D Simulation test: collectible auto-wired to backpack + watercraft cameraFollowOverrideId
  const player2d: GameObjectData = {
    ...createGameObject('sprite', [], { name: 'Hero2D', x: 100, y: 100 }),
    id: 'p2d',
    role: 'player',
    components: [
      { id: 'c_plat', type: 'player_platformer', enabled: true, config: { speed: 200 } },
      { id: 'c_bp', type: 'inventory.backpack', enabled: true, config: {} },
      { id: 'c_cam', type: 'juice.camera_follow', enabled: true, config: {} },
    ],
    animStateMachine: {
      initialStateId: 'st_idle',
      states: [
        { id: 'st_idle', name: 'Idle', clipName: 'idle_clip', timeScale: 1, loopMode: 'LoopRepeat', x: 0, y: 0 },
        { id: 'st_walk', name: 'Walk', clipName: 'walk_clip', timeScale: 1, loopMode: 'LoopRepeat', x: 180, y: 0 },
      ],
      transitions: [
        { id: 'tw1', fromStateId: 'st_idle', toStateId: 'st_walk', conditionExpr: 'speed > 0.1', blendDuration: 0.1 },
      ],
    },
  };
  const node2d: GameObjectData = {
    ...createGameObject('sprite', [], { name: 'Gem', x: 112, y: 100 }),
    id: 'gem2d',
    components: [
      { id: 'c_node', type: 'world.resource_node', enabled: true, config: { itemId: 'ruby', amount: 2, interactRadius: 80, respawnSec: 30 } },
    ],
  };
  const boat2d: GameObjectData = {
    ...createGameObject('sprite', [], { name: 'Bote2D', x: 118, y: 100 }),
    id: 'boat2d',
    components: [
      { id: 'c_boat', type: 'vehicle.watercraft', enabled: true, config: { boardKey: 'KeyE', boardRadius: 100, maxSpeed: 200 } },
    ],
  };

  const scene2d: SceneData = {
    id: 's2d_super',
    name: 'Super2D',
    sceneContext: 'open_world',
    backgroundColor: '#0f172a',
    gridVisible: true,
    gridSize: 32,
    snapToGrid: false,
    objects: [player2d, node2d, boat2d],
    wiringLinks: [
      {
        id: 'w_gem',
        sourceObjectId: 'gem2d',
        sourceBehavior: 'world.resource_node',
        signal: 'onCollected',
        targetObjectId: 'p2d',
        targetBehavior: 'inventory.backpack',
        action: 'receiveItem',
        auto: false,
      },
      {
        id: 'w_boat',
        sourceObjectId: 'boat2d',
        sourceBehavior: 'vehicle.watercraft',
        signal: 'onBoardStateChanged',
        targetObjectId: 'p2d',
        targetBehavior: 'juice.camera_follow',
        action: 'setTarget',
        auto: false,
      },
    ],
    mechanics: [],
  };

  const sim2d = createSimulationState(scene2d);
  stepSimulation(sim2d, 0.016, emptyInput2D({ pressedKeys: ['KeyE'] }));
  assert.equal(sim2d.wiringSys?.persistence.state.inventory.ruby, 2);
  assert.equal(sim2d.cameraFollowOverrideId, 'boat2d');

  // 3D Simulation test: LoopOnce clip-less FSM finishes via animElapsed fallback + resource pickup
  const floor3d = makeMesh3D('floor3d', 'Floor', { x: 0, y: -0.5, z: 0 }, { sx: 30, sy: 1, sz: 30 });
  const player3d = makeMesh3D('p3d', 'Player3D', { x: 0, y: 1, z: 0 }, { sx: 1, sy: 2, sz: 1 }, {
    role: 'player',
    physics3d: { enabled: true, bodyType: 'dynamic', mass: 1, friction: 0.7, restitution: 0, gravityScale: 1, shape: 'capsule' },
    components: [
      { id: 'cp3', type: 'player_3d', enabled: true, config: { speed: 6, jumpForce: 8 } },
      { id: 'cbp3', type: 'inventory.backpack', enabled: true, config: {} },
      { id: 'cvit3', type: 'survival.vitals', enabled: true, config: { hungerDrainPerMin: 60 } },
    ],
    animStateMachine: {
      initialStateId: 'st_once',
      states: [
        { id: 'st_once', name: 'Intro', clipName: '', timeScale: 2, loopMode: 'LoopOnce', x: 0, y: 0 },
        { id: 'st_idle', name: 'Idle', clipName: '', timeScale: 1, loopMode: 'LoopRepeat', x: 180, y: 0 },
      ],
      transitions: [
        { id: 'tr_done', fromStateId: 'st_once', toStateId: 'st_idle', conditionExpr: 'animFinished', blendDuration: 0.1 },
      ],
    },
  });
  const gem3d = makeMesh3D('gem3d', 'Gem3D', { x: 0.4, y: 1, z: 0 }, { sx: 1, sy: 1, sz: 1 }, {
    physics3d: { enabled: false, bodyType: 'static', mass: 1, friction: 0.5, restitution: 0, gravityScale: 1, shape: 'box' },
    components: [
      { id: 'cg3', type: 'world.resource_node', enabled: true, config: { itemId: 'sapphire', amount: 1, interactRadius: 4 } },
    ],
  });
  const scene3d: SceneData = {
    id: 's3d_super',
    name: 'Super3D',
    sceneContext: 'open_world',
    backgroundColor: '#0f172a',
    gridVisible: true,
    gridSize: 32,
    snapToGrid: false,
    objects: [floor3d, player3d, gem3d],
    wiringLinks: [
      {
        id: 'w3d_gem',
        sourceObjectId: 'gem3d',
        sourceBehavior: 'world.resource_node',
        signal: 'onCollected',
        targetObjectId: 'p3d',
        targetBehavior: 'inventory.backpack',
        action: 'receiveItem',
        auto: false,
      },
    ],
    mechanics: [],
  };

  const sim3d = createSimulation3DState(scene3d);
  for (let i = 0; i < 20; i++) {
    sim3d.step({ dt: 0.04, heldKeys: new Set(), justPressedKeys: new Set() });
  }
  const p3dState = sim3d.objects.find((o) => o.id === 'p3d')!;
  assert.equal(p3dState.currentAnimState, 'Idle', 'Clip-less LoopOnce FSM state must advance on animElapsed fallback');
  assert.equal(sim3d.wiringSys?.persistence.state.inventory.sapphire, 1);
  assert.ok((sim3d.variables.get('hambre') as number) < 100);
});

test('HTML5 2D & 3D exports compile cleanly and include smooth lighting, FSM falling priority, and Super Behaviors', () => {
  const opts = { portal: 'web' as const, scaleMode: 'letterbox' as const, touchControls: true, showFullscreenButton: true };
  const js2d = generateNexusRuntimeJs(opts);
  const js3d = generateNexus3DRuntimeJs(opts);

  assert.equal(js2d.match(/https?:\/\//g), null);
  assert.equal(js3d.match(/https?:\/\//g), null);
  assert.doesNotThrow(() => new Function(js2d));
  assert.doesNotThrow(() => new Function(js3d));

  assert.ok(js2d.includes('renderLighting2DExport'));
  assert.ok(js2d.includes('createRadialGradient'));
  assert.ok(js2d.includes('stepAnimFsm2d'));
  assert.ok(js2d.includes('world.resource_node'));
  assert.ok(js2d.includes('vehicle.watercraft'));
  assert.ok(js3d.includes('stepAnimFsm3d'));
  assert.ok(js3d.includes('world.resource_node'));
  assert.ok(js3d.includes('survival.vitals'));
});
