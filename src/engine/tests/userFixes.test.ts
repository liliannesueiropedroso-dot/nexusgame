import test from 'node:test';
import assert from 'node:assert/strict';
import { createGameObject } from '../objects/factory';
import type { AnimationStateMachineConfig, SceneData, SmartCameraConfig } from '../core/types';
import { stepAnimationFSM } from '../runtime/animFsmEvaluator';
import { createSimulationState, stepSimulation } from '../runtime/stepGameSimulation';
import { createInitialSmartCameraState, stepSmartCamera3D } from '../camera/smartCamera';
import { createSimulation3DState } from '../physics3d/physics3d';
import { buildGridNav2D, findPath2D, hasLineOfSight2D } from '../ai2d/gridPathfinding2d';
import { getSpriteImagePointWorld } from '../core/math';
import { computeColliderHandles, hitTestColliderHandle } from '../renderer2d/hitTest';
import { generateNexusRuntimeJs } from '../../export/html5/runtimeTemplate';
import { generateNexus3DRuntimeJs } from '../../export/html5/threeRuntimeTemplate';

test('stepAnimationFSM soporta salto desde cualquier estado y retorno inteligente a Run o Idle', () => {
  const fsm: AnimationStateMachineConfig = {
    initialStateId: 'idle',
    states: [
      { id: 'idle', name: 'Idle', clipName: 'Idle', timeScale: 1, loopMode: 'LoopRepeat', x: 0, y: 0 },
      { id: 'walk', name: 'Walk', clipName: 'Walk', timeScale: 1, loopMode: 'LoopRepeat', x: 150, y: 0 },
      { id: 'run', name: 'Run', clipName: 'Run', timeScale: 1, loopMode: 'LoopRepeat', x: 300, y: 0 },
      {
        id: 'jump',
        name: 'Jump',
        clipName: 'Jump',
        timeScale: 1,
        loopMode: 'LoopOnce',
        x: 150,
        y: 120,
        triggerKey: 'Space',
        triggerKeyMode: 'pressed',
        fromAnyState: true,
        returnMode: 'smart_locomotion',
        returnOn: 'grounded',
      },
    ],
    transitions: [],
  };

  // Desde Run presiona Space -> salta inmediatamente a Jump
  const jumpFromRun = stepAnimationFSM(fsm, 'Run', {
    speed: 6.2,
    vy: 0,
    isGrounded: true,
    heldKeys: ['ShiftLeft'],
    justPressedKeys: ['Space'],
  });
  assert.ok(jumpFromRun);
  assert.equal(jumpFromRun.changed, true);
  assert.equal(jumpFromRun.stateName, 'Jump');

  // En el aire no auto-retorna aunque vy sea negativo
  const midAir = stepAnimationFSM(fsm, 'Jump', {
    speed: 6.0,
    vy: -2.5,
    isGrounded: false,
    heldKeys: ['ShiftLeft'],
    justPressedKeys: [],
  });
  assert.ok(midAir);
  assert.equal(midAir.changed, false);
  assert.equal(midAir.stateName, 'Jump');

  // Aterriza corriendo -> retorna a Run
  const landRunning = stepAnimationFSM(fsm, 'Jump', {
    speed: 6.0,
    vy: 0,
    isGrounded: true,
    heldKeys: ['ShiftLeft'],
    justPressedKeys: [],
  });
  assert.ok(landRunning);
  assert.equal(landRunning.changed, true);
  assert.equal(landRunning.stateName, 'Run');

  // Desde Idle presiona Space -> Jump -> aterriza quieto -> Idle
  const jumpFromIdle = stepAnimationFSM(fsm, 'Idle', {
    speed: 0,
    vy: 0,
    isGrounded: true,
    heldKeys: [],
    justPressedKeys: ['Space'],
  });
  assert.equal(jumpFromIdle?.stateName, 'Jump');

  const landIdle = stepAnimationFSM(fsm, 'Jump', {
    speed: 0,
    vy: 0,
    isGrounded: true,
    heldKeys: [],
    justPressedKeys: [],
  });
  assert.equal(landIdle?.changed, true);
  assert.equal(landIdle?.stateName, 'Idle');
});

test('stepGameSimulation resuelve $self/$other en colisiones, parpadeo light_2d y preserva fitMode nine_slice', () => {
  const player = createGameObject('sprite', [], {
    name: 'Hero',
    x: 100,
    y: 100,
    width: 40,
    height: 40,
    fitMode: 'nine_slice',
  });
  player.components.push({ id: 'p1', type: 'player_topdown', enabled: true, config: { speed: 200 } });

  const gem = createGameObject('circle', [player], {
    name: 'Gem',
    x: 110,
    y: 100,
    width: 30,
    height: 30,
  });
  gem.tags = ['gem'];

  const torch = createGameObject('light_2d', [player, gem], {
    name: 'Torch',
    x: 200,
    y: 200,
  });
  torch.light2d = {
    kind: 'point',
    color: '#ffaa44',
    intensity: 3.5,
    radius: 260,
    angleDeg: 360,
    directionDeg: 0,
    softness: 0.7,
    castShadows: false,
  };
  torch.components.push({
    id: 'lf1',
    type: 'lighting.flicker',
    enabled: true,
    config: { speed: 12, amount: 0.4 },
  });

  const scene: SceneData = {
    id: 'sc_2d',
    name: 'Nivel 1',
    backgroundColor: '#111',
    gridVisible: false,
    gridSize: 32,
    snapToGrid: false,
    objects: [player, gem, torch],
    mechanics: [
      {
        id: 'm1',
        name: 'Recoger gema con $other',
        enabled: true,
        priority: 1,
        trigger: {
          event: 'collision.enter',
          sourceObjectId: player.id,
          tag: 'gem',
        },
        conditions: [],
        actions: [
          { id: 'a1', type: 'object.hide', parameters: { target: '$other' } },
        ],
      },
    ],
  };

  assert.equal(player.sprite?.fitMode, 'nine_slice');
  const sim = createSimulationState(scene);
  const intensities: number[] = [];
  for (let i = 0; i < 8; i++) {
    stepSimulation(sim, 1 / 60, { left: false, right: false, up: false, down: false, jump: false });
    const tObj = sim.scene.objects.find((o) => o.id === torch.id)!;
    intensities.push(tObj.light2d!.intensity);
  }

  const simHero = sim.scene.objects.find((o) => o.id === player.id)!;
  const simGem = sim.scene.objects.find((o) => o.id === gem.id)!;
  assert.equal(simHero.visible, true);
  assert.equal(simGem.visible, false);
  assert.equal(simHero.sprite?.fitMode, 'nine_slice');
  assert.ok(Math.max(...intensities) - Math.min(...intensities) > 0.05);
});

test('stepSmartCamera3D ignora props bajos, evita atravesar muros altos e ignora interiores', () => {
  const camCfg: SmartCameraConfig = {
    isMainCamera: true,
    mode: 'smooth_follow',
    dampingFactor: 0.5,
    lookAhead: 0,
    offsetX: 0,
    offsetY: 3,
    offsetZ: 10,
    distance: 10,
    pitchMinDeg: -45,
    pitchMaxDeg: 45,
    fov: 60,
    deadzoneW: 2,
    deadzoneH: 2,
    collideWithWalls: true,
    useBounds: false,
    boundsMinX: -100,
    boundsMaxX: 100,
    boundsMinY: -10,
    boundsMaxY: 100,
    boundsMinZ: -100,
    boundsMaxZ: 100,
  };

  const target = { x: 0, y: 1, z: 0, vx: 0, vy: 0, vz: 0 };

  // 1) Prop pequeño (<1.35m) en el trayecto -> no debe rebotar ni acortar la cámara
  const stateSmall = createInitialSmartCameraState('cam1', { x: 0, y: 4.8, z: 10 });
  const smallProp = [{ minX: -2, maxX: 2, minY: 0, maxY: 1.0, minZ: 4, maxZ: 5 }];
  for (let i = 0; i < 6; i++) {
    stepSmartCamera3D(stateSmall, camCfg, { x: 0, y: 4.8, z: 10 }, target, smallProp, 1 / 60);
  }
  assert.equal(stateSmall.smoothWallT, 1);

  // 2) Muro alto bloqueando la vista -> acerca cámara por delante del muro
  const stateWall = createInitialSmartCameraState('cam1', { x: 0, y: 4.8, z: 10 });
  const tallWall = [{ minX: -5, maxX: 5, minY: 0, maxY: 7, minZ: 4, maxZ: 5 }];
  for (let i = 0; i < 12; i++) {
    stepSmartCamera3D(stateWall, camCfg, { x: 0, y: 4.8, z: 10 }, target, tallWall, 1 / 60);
  }
  assert.ok((stateWall.smoothWallT ?? 1) < 0.7);
  assert.ok(stateWall.posZ < 6.5);

  // 3) Objetivo dentro de un gran bounding box (habitación interior) -> ignorado para no pegarse al jugador
  const stateInside = createInitialSmartCameraState('cam1', { x: 0, y: 4.8, z: 10 });
  const roomBox = [{ minX: -20, maxX: 20, minY: -2, maxY: 12, minZ: -20, maxZ: 20 }];
  for (let i = 0; i < 6; i++) {
    stepSmartCamera3D(stateInside, camCfg, { x: 0, y: 4.8, z: 10 }, target, roomBox, 1 / 60);
  }
  assert.equal(stateInside.smoothWallT, 1);
});

test('IA 3D inteligente: cono de visión, LOS, saltar ventana baja, rodear muro alto, huir e insistir', () => {
  const makeBaseScene = (extraWalls: ReturnType<typeof createGameObject>[] = [], enemyRy = 0) => {
    const floor = createGameObject('mesh_3d', [], {
      name: 'Suelo',
      shape3d: 'box',
      x3d: 0,
      y3d: -0.5,
      z3d: 0,
    });
    floor.transform3d!.sx = 40;
    floor.transform3d!.sy = 1;
    floor.transform3d!.sz = 40;
    floor.physics3d = { enabled: true, bodyType: 'static', shape: 'box', isTrigger: false, mass: 1, gravityScale: 0, friction: 0.6, restitution: 0 };

    const player = createGameObject('mesh_3d', [floor], {
      name: 'Jugador',
      shape3d: 'cylinder',
      x3d: 0,
      y3d: 1,
      z3d: 7,
    });
    player.physics3d = { enabled: true, bodyType: 'dynamic', shape: 'capsule', isTrigger: false, mass: 1, gravityScale: 1, friction: 0.5, restitution: 0 };
    player.components.push(
      { id: 'pl_c', type: 'player_3d', enabled: true, config: { speed: 6 } },
      { id: 'pl_hp', type: 'health', enabled: true, config: { maxHealth: 100, currentHealth: 100 } }
    );

    const enemy = createGameObject('mesh_3d', [floor, player], {
      name: 'Guardia',
      shape3d: 'cylinder',
      x3d: 0,
      y3d: 1,
      z3d: 0,
    });
    enemy.transform3d!.ry = enemyRy;
    enemy.physics3d = { enabled: true, bodyType: 'dynamic', shape: 'capsule', isTrigger: false, mass: 1, gravityScale: 1, friction: 0.5, restitution: 0 };
    enemy.components.push(
      {
        id: 'ai_c',
        type: 'ai.enemy_chaser',
        enabled: true,
        config: {
          speed: 4,
          detectRadius: 20,
          stopDistance: 1.0,
          visionFovDeg: 90,
          visionRange: 20,
          requireLineOfSight: true,
          canJumpObstacles: true,
          maxJumpHeight: 1.8,
          fleeHealthRatio: 0.25,
          insistDamageRatio: 0.45,
        },
      },
      { id: 'ai_hp', type: 'health', enabled: true, config: { maxHealth: 100, currentHealth: 100 } }
    );

    const scene: SceneData = {
      id: 'sc_3d',
      name: 'Arena 3D',
      backgroundColor: '#0f172a',
      gridVisible: false,
      gridSize: 32,
      snapToGrid: false,
      objects: [floor, player, enemy, ...extraWalls],
    };
    return { scene, enemy, player };
  };

  // A) Espaldas al jugador y fuera del cono de 90° -> no persigue
  {
    const { scene, enemy } = makeBaseScene([], 180);
    const sim = createSimulation3DState(scene);
    const simEnemy = sim.objects.find((o) => o.id === enemy.id)!;
    simEnemy.isGrounded = true;
    sim.step({ dt: 1 / 60, heldKeys: new Set(), justPressedKeys: new Set() });
    assert.equal(Math.hypot(simEnemy.vx, simEnemy.vz), 0);
  }

  // B) Mirando al jugador sin obstáculos -> persigue hacia +Z
  {
    const { scene, enemy } = makeBaseScene([], 0);
    const sim = createSimulation3DState(scene);
    const simEnemy = sim.objects.find((o) => o.id === enemy.id)!;
    simEnemy.isGrounded = true;
    sim.step({ dt: 1 / 60, heldKeys: new Set(), justPressedKeys: new Set() });
    assert.ok(simEnemy.vz > 2);
  }

  // C) Muro opaco bloqueando línea de visión (y dentro de ventana lateral): no detecta por LOS
  {
    const wall = createGameObject('mesh_3d', [], { name: 'MuroLOS', shape3d: 'box', x3d: 0, y3d: 2.5, z3d: 3.5 });
    wall.transform3d!.sx = 8;
    wall.transform3d!.sy = 5;
    wall.transform3d!.sz = 0.8;
    wall.physics3d = { enabled: true, bodyType: 'static', shape: 'box', isTrigger: false, mass: 1, gravityScale: 0, friction: 0.5, restitution: 0 };

    const { scene, enemy } = makeBaseScene([wall], 0);
    const sim = createSimulation3DState(scene);
    const simEnemy = sim.objects.find((o) => o.id === enemy.id)!;
    simEnemy.isGrounded = true;
    sim.step({ dt: 1 / 60, heldKeys: new Set(), justPressedKeys: new Set() });
    assert.equal(simEnemy.alertTimer, 0);
    assert.equal(Math.hypot(simEnemy.vx, simEnemy.vz), 0);
  }

  // D) Alféizar de ventana saltable justo enfrente tras detectar al jugador -> salta (vy > 0)
  {
    const sill = createGameObject('mesh_3d', [], { name: 'VentanaBaja', shape3d: 'box', x3d: 0, y3d: 0.45, z3d: 1.35 });
    sill.transform3d!.sx = 4;
    sill.transform3d!.sy = 0.9;
    sill.transform3d!.sz = 0.6;
    sill.physics3d = { enabled: true, bodyType: 'static', shape: 'box', isTrigger: false, mass: 1, gravityScale: 0, friction: 0.5, restitution: 0 };

    const { scene, enemy } = makeBaseScene([sill], 0);
    const sim = createSimulation3DState(scene);
    const simEnemy = sim.objects.find((o) => o.id === enemy.id)!;
    simEnemy.isGrounded = true;
    simEnemy.t3.y = 1.0; // footY = 0.5 (halfExtent y=0.5 para cápsula por defecto? Wait: sx=1,sy=1,sz=1 -> he.y=0.5)
    sim.step({ dt: 1 / 60, heldKeys: new Set(), justPressedKeys: new Set() });
    assert.ok(simEnemy.vy > 3, `Expected enemy to vault window sill, got vy=${simEnemy.vy}`);
  }

  // E) Muro alto adelante cuando enemigo ya está en alerta -> NO salta contra muro alto y rodea lateralmente
  {
    const tallWall = createGameObject('mesh_3d', [], { name: 'MuroAlto', shape3d: 'box', x3d: 0, y3d: 2.5, z3d: 1.5 });
    tallWall.transform3d!.sx = 3;
    tallWall.transform3d!.sy = 5;
    tallWall.transform3d!.sz = 0.6;
    tallWall.physics3d = { enabled: true, bodyType: 'static', shape: 'box', isTrigger: false, mass: 1, gravityScale: 0, friction: 0.5, restitution: 0 };

    const { scene, enemy, player } = makeBaseScene([tallWall], 0);
    const sim = createSimulation3DState(scene);
    const simEnemy = sim.objects.find((o) => o.id === enemy.id)!;
    const simPlayer = sim.objects.find((o) => o.id === player.id)!;
    simEnemy.isGrounded = true;
    simEnemy.alertTimer = 4;
    simEnemy.lastKnownTarget = { x: simPlayer.t3.x, y: simPlayer.t3.y, z: simPlayer.t3.z };
    sim.step({ dt: 1 / 60, heldKeys: new Set(), justPressedKeys: new Set() });
    assert.ok(simEnemy.vy <= 0.1, `Expected enemy NOT to jump into tall wall, got vy=${simEnemy.vy}`);
    assert.ok(Math.abs(simEnemy.vx) > 0.5, `Expected lateral steering around tall wall, got vx=${simEnemy.vx}`);
  }

  // F) Poca vida -> huye (-Z); jugador débil -> insiste más rápido
  {
    const { scene, enemy, player } = makeBaseScene([], 0);
    const sim = createSimulation3DState(scene);
    const simEnemy = sim.objects.find((o) => o.id === enemy.id)!;
    const simPlayer = sim.objects.find((o) => o.id === player.id)!;
    simEnemy.isGrounded = true;
    simEnemy.hp = 15; // <= 25% -> huye
    sim.step({ dt: 1 / 60, heldKeys: new Set(), justPressedKeys: new Set() });
    assert.ok(simEnemy.vz < -2, `Expected fleeing enemy vz < -2, got ${simEnemy.vz}`);

    // Insistir cuando jugador tiene poca vida
    simEnemy.hp = 100;
    simPlayer.hp = 30; // <= 45%
    sim.step({ dt: 1 / 60, heldKeys: new Set(), justPressedKeys: new Set() });
    assert.ok(simEnemy.vz > 4.5, `Expected insisting faster chase > 4.5, got ${simEnemy.vz}`);
  }
});

test('gridPathfinding2d encuentra ruta A* alrededor de muro y detecta LOS bloqueada', () => {
  const wall = createGameObject('rectangle', [], { name: 'Pared', x: 192, y: 192, width: 48, height: 192 });
  wall.components.push({ id: 'w_sol', type: 'solid', enabled: true, config: {} });

  const scene: SceneData = {
    id: 'sc_nav',
    name: 'Nav2D',
    backgroundColor: '#000',
    gridVisible: false,
    gridSize: 32,
    snapToGrid: false,
    objects: [wall],
  };

  assert.equal(hasLineOfSight2D({ x: 80, y: 192 }, { x: 300, y: 192 }, [wall]), false);
  const nav = buildGridNav2D(scene, 400, 400, 32);
  const path = findPath2D(nav, { x: 80, y: 192 }, { x: 300, y: 192 });
  assert.ok(path.length > 2);
  assert.deepEqual(path[path.length - 1], { x: 300, y: 192 });
});

test('getSpriteImagePointWorld y handles de colisionador 2D calculan posiciones precisas', () => {
  const spr = createGameObject('sprite', [], { name: 'Player', x: 100, y: 100, width: 100, height: 100 });
  spr.sprite!.flipX = true;
  spr.sprite!.imagePoints = [{ id: 'ip1', name: 'arma', nx: 0.9, ny: 0.5 }];

  const map = new Map([[spr.id, spr]]);
  const pt = getSpriteImagePointWorld(spr, 'arma', map);
  // Con flipX=true y nx=0.9 -> nx' = 0.1 -> (0.1 - 0.5) * 100 = -40 -> world x = 60
  assert.ok(Math.abs(pt.x - 60) < 0.001);
  assert.ok(Math.abs(pt.y - 100) < 0.001);

  const handles = computeColliderHandles(spr, map);
  assert.equal(handles.length, 5);
  const east = handles.find((h) => h.type === 'col-e')!;
  const hit = hitTestColliderHandle(east.stageX + 2, east.stageY, handles, 1);
  assert.equal(hit?.type, 'col-e');
});

test('Exportadores HTML5 2D y 3D generan JavaScript sintácticamente válido con paridad', () => {
  const opts = {
    portal: 'web' as const,
    scaleMode: 'letterbox' as const,
    touchControls: true,
    showFullscreenButton: true,
  };

  const js2d = generateNexusRuntimeJs(opts);
  assert.doesNotThrow(() => new Function(js2d));
  assert.ok(js2d.includes('NineSliceSprite'));
  assert.ok(js2d.includes('collisionPairs'));
  assert.ok(js2d.includes('hasAiLos2D'));

  const js3d = generateNexus3DRuntimeJs(opts);
  assert.doesNotThrow(() => new Function(js3d));
  assert.equal(js3d.includes("playAudio('coin'"), false);
  assert.ok(js3d.includes('smoothWallT'));
  assert.ok(js3d.includes('steerSmartEnemyRt3D'));
  assert.ok(js3d.includes('executeActionList3D'));
});
