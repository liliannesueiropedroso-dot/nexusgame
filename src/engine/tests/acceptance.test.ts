import test from 'node:test';
import assert from 'node:assert/strict';
import JSZip from 'jszip';
import { computeSpriteRenderLayout } from '../sprites/spriteFit';
import {
  canLayersCollide,
  createDefaultColliderForObject,
  getWorldColliders,
  objectsOverlap,
} from '../physics/collision2d';
import { createGameObject } from '../objects/factory';
import type { SceneData } from '../core/types';
import {
  createSimulationState,
  stepSimulationFixed,
  type InputState,
} from '../runtime/stepGameSimulation';
import { RuntimeSceneManager } from '../runtime/sceneManager';
import { buildProjectFromTemplate } from '../../project/templates/projectTemplates';
import { compileProjectToHtml5Zip } from '../../export/html5/html5Compiler';
import { BEHAVIOR_REGISTRY } from '../components/behaviorRegistry';
import { ALL_KEY_CODES, KEY_CODE_GROUPS, formatKeyCodeLabel } from '../input/keyCodes';
import { applyObjectTweens, evaluateEasing } from '../runtime/behaviorRuntime';
import { detectAudioFormat, findUnusedAssetIds } from '../../assets/library/assetUtils';

function makeInput(overrides: Partial<InputState> = {}): InputState {
  return {
    left: false,
    right: false,
    up: false,
    down: false,
    jump: false,
    ...overrides,
  };
}

test('computeSpriteRenderLayout respeta contain, original, cover, stretch, crop y tile sin recortar ni deformar en contain', () => {
  // Imagen panorámica 400x200 en un sprite de 100x100
  const contain = computeSpriteRenderLayout({
    boxWidth: 100,
    boxHeight: 100,
    anchorX: 0.5,
    anchorY: 0.5,
    textureWidth: 400,
    textureHeight: 200,
    fitMode: 'contain',
  });
  assert.equal(contain.drawWidth, 100);
  assert.equal(contain.drawHeight, 50);
  assert.equal(contain.needsClipMask, false);
  assert.equal(contain.sourceCrop, null);

  const original = computeSpriteRenderLayout({
    boxWidth: 100,
    boxHeight: 100,
    anchorX: 0.5,
    anchorY: 0.5,
    textureWidth: 400,
    textureHeight: 200,
    fitMode: 'original',
  });
  assert.equal(original.drawWidth, 400);
  assert.equal(original.drawHeight, 200);
  assert.equal(original.needsClipMask, false);

  const cover = computeSpriteRenderLayout({
    boxWidth: 100,
    boxHeight: 100,
    anchorX: 0.5,
    anchorY: 0.5,
    textureWidth: 400,
    textureHeight: 200,
    fitMode: 'cover',
  });
  assert.equal(cover.drawWidth, 200);
  assert.equal(cover.drawHeight, 100);
  assert.equal(cover.needsClipMask, true);

  const crop = computeSpriteRenderLayout({
    boxWidth: 100,
    boxHeight: 100,
    anchorX: 0.5,
    anchorY: 0.5,
    textureWidth: 400,
    textureHeight: 200,
    fitMode: 'crop',
    cropRect: { x: 50, y: 20, width: 100, height: 100 },
  });
  assert.deepEqual(crop.sourceCrop, { x: 50, y: 20, width: 100, height: 100 });
  assert.equal(crop.drawWidth, 100);
  assert.equal(crop.drawHeight, 100);

  const tile = computeSpriteRenderLayout({
    boxWidth: 256,
    boxHeight: 64,
    anchorX: 0.5,
    anchorY: 0.5,
    textureWidth: 32,
    textureHeight: 32,
    fitMode: 'tile',
  });
  assert.equal(tile.tiled, true);
  assert.equal(tile.drawWidth, 256);
});

test('CharacterController2D con paso fijo (1/60) es independiente de los FPS y frena con suavidad sin velocidad descontrolada', () => {
  const buildScene = (): SceneData => {
    const player = createGameObject('rectangle', [], {
      name: 'Jugador',
      x: 100,
      y: 260,
      width: 48,
      height: 48,
    });
    player.components.push({
      id: 'plat',
      type: 'player_platformer',
      enabled: true,
      config: { profile: 'preciso', maxSpeed: 220, acceleration: 1500, deceleration: 2100 },
    });
    const floor = createGameObject('rectangle', [player], {
      name: 'Suelo',
      x: 640,
      y: 340,
      width: 1200,
      height: 60,
    });
    floor.components.push({ id: 'sol', type: 'solid', enabled: true, config: {} });
    return {
      id: 's_fps',
      name: 'FPS Test',
      backgroundColor: '#000',
      gridVisible: false,
      gridSize: 32,
      snapToGrid: false,
      objects: [player, floor],
    };
  };

  // Simular 1.0 segundo a 30 FPS vs 120 FPS
  const sim30 = createSimulationState(buildScene());
  for (let i = 0; i < 30; i++) {
    stepSimulationFixed(sim30, 1 / 30, makeInput({ right: true }));
  }

  const sim120 = createSimulationState(buildScene());
  for (let i = 0; i < 120; i++) {
    stepSimulationFixed(sim120, 1 / 120, makeInput({ right: true }));
  }

  const x30 = sim30.scene.objects[0].transform.x;
  const x120 = sim120.scene.objects[0].transform.x;
  const vx120 = sim120.bodies.get(sim120.scene.objects[0].id)!.vx;

  assert.ok(Math.abs(x30 - x120) < 1, `Desplazamiento debe ser idéntico entre 30fps (${x30}) y 120fps (${x120})`);
  assert.ok(vx120 <= 220.01 && vx120 >= 219, `La velocidad máxima debe permanecer controlada en 220 px/s, obtenido: ${vx120}`);

  // Soltar tecla: debe desacelerar hasta 0 en pocos frames
  for (let i = 0; i < 20; i++) {
    stepSimulationFixed(sim120, 1 / 60, makeInput({ right: false }));
  }
  const stoppedVx = sim120.bodies.get(sim120.scene.objects[0].id)!.vx;
  assert.equal(stoppedVx, 0);
});

test('Collider2D soporta formas, desplazamientos, sensores y filtrado de capas (Player vs Ground vs UI)', () => {
  const player = createGameObject('sprite', [], { name: 'Hero', x: 100, y: 100, width: 64, height: 64 });
  player.layer = 'Player';
  player.colliders = [
    {
      ...createDefaultColliderForObject(player),
      offsetX: 10,
      width: 32,
      height: 32,
      layer: 'Player',
      mask: ['Ground', 'Sensor'],
    },
  ];

  const triggerZone = createGameObject('rectangle', [player], { name: 'Meta', x: 120, y: 100, width: 30, height: 30 });
  triggerZone.layer = 'Sensor';
  triggerZone.colliders = [
    {
      ...createDefaultColliderForObject(triggerZone),
      isSensor: true,
      layer: 'Sensor',
    },
  ];

  const uiBtn = createGameObject('ui_button', [player, triggerZone], { name: 'Btn', x: 110, y: 100, width: 120, height: 48 });

  assert.equal(canLayersCollide('Player', 'Sensor', ['Ground', 'Sensor']), true);
  assert.equal(canLayersCollide('Player', 'UI'), false);
  assert.equal(objectsOverlap(player, triggerZone), true);
  assert.equal(objectsOverlap(player, uiBtn), false);

  const worldCols = getWorldColliders(player);
  assert.equal(worldCols.length, 1);
  assert.equal(worldCols[0].cx, 110);
});

test('RuntimeSceneManager soporta loadScene, pushOverlay, popOverlay, nextLevel y conserva variables globales', () => {
  const proj = buildProjectFromTemplate({
    name: 'Multi Test',
    width: 1280,
    height: 720,
    orientation: 'horizontal',
    backgroundColor: '#131b2e',
    template: 'platformer_multiscene',
  });

  // Añadir Nivel_02 para probar progresión multi-nivel con nextLevel()
  const level2Scene: SceneData = {
    id: 'scene_lvl2',
    name: 'Nivel_02',
    kind: 'level',
    backgroundColor: '#131b2e',
    gridVisible: true,
    gridSize: 32,
    snapToGrid: false,
    objects: [],
    mechanics: [],
  };
  proj.scenes.push(level2Scene);

  const mgr = new RuntimeSceneManager({
    scenes: proj.scenes,
    initialSceneId: proj.initialSceneId,
    variables: proj.variables,
    prefabs: proj.prefabs,
    stage: { width: 1280, height: 720 },
  });

  assert.equal(mgr.baseState.scene.name, 'Menu_Principal');

  // Pulsar botón "JUGAR" del menú -> carga Nivel_01
  const playBtn = mgr.baseState.scene.objects.find((o) => o.type === 'ui_button');
  assert.ok(playBtn, 'Menu_Principal debe tener un botón JUGAR');
  mgr.dispatchClick(playBtn.id);
  mgr.step(1 / 60, makeInput());
  assert.equal(mgr.baseState.scene.name, 'Nivel_01');

  // Sumar puntos y abrir overlay de Pausa
  mgr.activeTopState.variables.set('puntos', 150);
  const pauseScene = proj.scenes.find((s) => s.name === 'Pausa');
  assert.ok(pauseScene);
  mgr.pushOverlay(pauseScene.id);
  assert.equal(mgr.overlays.length, 1);
  assert.equal(mgr.activeTopState.scene.name, 'Pausa');
  assert.equal(mgr.activeTopState.variables.get('puntos'), 150);

  // Cerrar overlay y avanzar al siguiente nivel conservando puntos
  mgr.popOverlay();
  assert.equal(mgr.overlays.length, 0);
  assert.equal(mgr.baseState.scene.name, 'Nivel_01');

  const moved = mgr.nextLevel();
  assert.equal(moved, true);
  assert.equal(mgr.baseState.scene.name, 'Nivel_02');
  assert.equal(mgr.baseState.variables.get('puntos'), 150);
});

test('Mecánicas avanzadas: wait, conditionCombinator (any/none) y prefab.spawn funcionan en simulación', () => {
  const enemyTemplate = createGameObject('rectangle', [], { name: 'Slime', x: 0, y: 0, width: 32, height: 32 });
  const scene: SceneData = {
    id: 's_adv',
    name: 'Avanzado',
    backgroundColor: '#000',
    gridVisible: false,
    gridSize: 32,
    snapToGrid: false,
    objects: [],
    mechanics: [
      {
        id: 'm_wait_spawn',
        name: 'Esperar y generar prefab',
        enabled: true,
        priority: 10,
        trigger: { event: 'scene.start' },
        conditionCombinator: 'any',
        conditions: [
          { id: 'c_false', type: 'variable.compare', variable: 'llaves', operator: '==', value: 99 },
          { id: 'c_true', type: 'variable.compare', variable: 'puntos', operator: '==', value: 0 },
        ],
        actions: [
          { id: 'a_wait', type: 'wait', parameters: { seconds: 0.1 } },
          { id: 'a_spawn', type: 'prefab.spawn', parameters: { prefabId: 'pf_slime', x: 300, y: 240 } },
          { id: 'a_var', type: 'variable.add', parameters: { variable: 'puntos', amount: 50 } },
        ],
      },
    ],
  };

  const sim = createSimulationState(scene, [], {
    prefabs: [
      {
        id: 'pf_slime',
        name: 'SlimePrefab',
        rootObjectId: enemyTemplate.id,
        objects: [enemyTemplate],
        createdAt: 1000,
      },
    ],
  });

  // En t = 1/60 aún no ha vencido el wait de 0.1s
  stepSimulationFixed(sim, 1 / 60, makeInput());
  assert.equal(sim.scene.objects.length, 0);
  assert.equal(sim.variables.get('puntos'), 0);

  // Avanzar 0.15s más: debe ejecutarse prefab.spawn y variable.add
  for (let i = 0; i < 10; i++) {
    stepSimulationFixed(sim, 1 / 60, makeInput());
  }
  assert.equal(sim.scene.objects.length, 1);
  assert.equal(sim.scene.objects[0].transform.x, 300);
  assert.equal(sim.variables.get('puntos'), 50);
});

test('Proyecto vacío inicia con exactamente 1 escena y compilación HTML5 incluye initialSceneId y prefabs', async () => {
  const emptyProj = buildProjectFromTemplate({
    name: 'Juego Limpio',
    width: 1280,
    height: 720,
    orientation: 'horizontal',
    backgroundColor: '#131b2e',
    template: 'empty_single',
  });

  assert.equal(emptyProj.scenes.length, 1);
  assert.equal(emptyProj.scenes[0].name, 'Escena_01');
  assert.equal(emptyProj.initialSceneId, emptyProj.scenes[0].id);

  const zipPkg = await compileProjectToHtml5Zip(
    emptyProj,
    new Map(),
    { portal: 'web', scaleMode: 'letterbox', touchControls: false, showFullscreenButton: true },
    '/* pixi */'
  );
  const zip = await JSZip.loadAsync(await zipPkg.blob.arrayBuffer());
  const gameJson = JSON.parse(await zip.file('data/game.json')!.async('string'));
  const runtimeJs = await zip.file('js/nexus-runtime.js')!.async('string');

  assert.equal(gameJson.initialSceneId, emptyProj.initialSceneId);
  assert.ok(Array.isArray(gameJson.prefabs));
  assert.equal(gameJson.scenes.length, 1);
  assert.ok(runtimeJs.includes('computeSpriteLayout'));
  assert.ok(runtimeJs.includes('resolvePlatformerConfig'));
  assert.ok(runtimeJs.includes('pushOverlayById'));
});

test('BEHAVIOR_REGISTRY tiene >= 60 comportamientos únicos con esquemas consistentes y etiquetas en español', () => {
  assert.ok(BEHAVIOR_REGISTRY.length >= 60, `Se esperaban >= 60 comportamientos, encontrados: ${BEHAVIOR_REGISTRY.length}`);
  const seen = new Set<string>();
  for (const entry of BEHAVIOR_REGISTRY) {
    assert.ok(!seen.has(entry.type), `Comportamiento duplicado: ${entry.type}`);
    seen.add(entry.type);
    assert.ok(entry.label.trim().length > 2, `Etiqueta vacía en ${entry.type}`);
    assert.ok(entry.description.trim().length > 5, `Descripción vacía en ${entry.type}`);
    for (const field of entry.schema) {
      assert.ok(
        Object.prototype.hasOwnProperty.call(entry.defaultConfig, field.key),
        `Falta defaultConfig.${field.key} en ${entry.type}`
      );
    }
  }
});

test('Catálogo universal de KeyboardEvent.code y triggers input.pressed/held/released en simulación', () => {
  const codes = new Set(ALL_KEY_CODES.map((k) => k.code));
  assert.ok(KEY_CODE_GROUPS.length >= 5);
  assert.ok(codes.has('KeyQ'));
  assert.ok(codes.has('Digit5'));
  assert.ok(codes.has('ShiftLeft'));
  assert.ok(codes.has('F2'));
  assert.ok(codes.has('ArrowRight'));
  assert.ok(formatKeyCodeLabel('KeyQ').includes('Q'));

  const scene: SceneData = {
    id: 's_keys',
    name: 'Keys',
    backgroundColor: '#000',
    gridVisible: false,
    gridSize: 32,
    snapToGrid: false,
    objects: [],
    mechanics: [
      {
        id: 'm_press',
        name: 'Al pulsar Q',
        enabled: true,
        priority: 1,
        trigger: { event: 'input.pressed', key: 'KeyQ' },
        conditions: [],
        actions: [{ id: 'a1', type: 'variable.add', parameters: { variable: 'pulsos', amount: 1 } }],
      },
      {
        id: 'm_held',
        name: 'Mientras F2',
        enabled: true,
        priority: 1,
        trigger: { event: 'input.held', key: 'F2' },
        conditions: [{ id: 'c1', type: 'input.held', key: 'F2' }],
        actions: [{ id: 'a2', type: 'variable.add', parameters: { variable: 'mantener', amount: 1 } }],
      },
      {
        id: 'm_rel',
        name: 'Al soltar Q',
        enabled: true,
        priority: 1,
        trigger: { event: 'input.released', key: 'KeyQ' },
        conditions: [],
        actions: [{ id: 'a3', type: 'variable.add', parameters: { variable: 'sueltas', amount: 1 } }],
      },
    ],
  };

  const sim = createSimulationState(scene, [
    { id: 'v1', name: 'pulsos', type: 'number', initialValue: 0, scope: 'global' },
    { id: 'v2', name: 'mantener', type: 'number', initialValue: 0, scope: 'global' },
    { id: 'v3', name: 'sueltas', type: 'number', initialValue: 0, scope: 'global' },
  ]);

  // Frame 1: pulsar KeyQ y F2
  stepSimulationFixed(sim, 1 / 60, makeInput({ pressedKeys: new Set(['KeyQ', 'F2']) }));
  assert.equal(sim.variables.get('pulsos'), 1);
  assert.equal(sim.variables.get('mantener'), 1);
  assert.equal(sim.variables.get('sueltas'), 0);

  // Frame 2: mantener KeyQ y F2 (input.pressed no debe volver a dispararse)
  stepSimulationFixed(sim, 1 / 60, makeInput({ pressedKeys: new Set(['KeyQ', 'F2']) }));
  assert.equal(sim.variables.get('pulsos'), 1);
  assert.equal(sim.variables.get('mantener'), 2);

  // Frame 3: soltar KeyQ
  stepSimulationFixed(sim, 1 / 60, makeInput({ pressedKeys: new Set() }));
  assert.equal(sim.variables.get('sueltas'), 1);
});

test('Plataformas Pro (doble salto + air dash) y Vehículo Drift funcionan en simulación', () => {
  const player = createGameObject('rectangle', [], { name: 'HeroPro', x: 200, y: 200, width: 36, height: 48 });
  player.components.push({
    id: 'pp',
    type: 'movement.platformer_pro',
    enabled: true,
    config: {
      maxSpeed: 260,
      acceleration: 2000,
      deceleration: 2400,
      jumpForce: 500,
      gravity: 1200,
      maxJumps: 2,
      dashEnabled: true,
      dashKey: 'ShiftLeft',
      dashSpeed: 640,
      dashDuration: 0.16,
      dashCooldown: 0.4,
      wallSlideEnabled: true,
      wallSlideSpeed: 90,
      wallJumpForceX: 300,
      wallJumpForceY: 480,
      coyoteTime: 0.12,
    },
  });
  const floor = createGameObject('rectangle', [player], { name: 'Suelo', x: 300, y: 300, width: 800, height: 40 });
  floor.components.push({ id: 'sol', type: 'solid', enabled: true, config: {} });

  const sim = createSimulationState({
    id: 's_pro',
    name: 'Pro',
    backgroundColor: '#000',
    gridVisible: false,
    gridSize: 32,
    snapToGrid: false,
    objects: [player, floor],
  });

  // Caer al suelo
  for (let i = 0; i < 30; i++) stepSimulationFixed(sim, 1 / 60, makeInput());
  assert.equal(sim.bodies.get(player.id)!.grounded, true);

  // Primer salto
  stepSimulationFixed(sim, 1 / 60, makeInput({ jump: true }));
  assert.ok(sim.bodies.get(player.id)!.vy < -300);

  // Soltar y volver a pulsar salto en el aire -> doble salto
  stepSimulationFixed(sim, 1 / 60, makeInput({ jump: false }));
  stepSimulationFixed(sim, 1 / 60, makeInput({ jump: false }));
  stepSimulationFixed(sim, 1 / 60, makeInput({ jump: true }));
  assert.equal(sim.bodies.get(player.id)!.jumpsUsed, 2);

  // Air dash hacia la derecha con ShiftLeft
  stepSimulationFixed(
    sim,
    1 / 60,
    makeInput({ right: true, pressedKeys: new Set(['ShiftLeft', 'ArrowRight']) })
  );
  assert.ok(sim.bodies.get(player.id)!.vx >= 600, `Se esperaba dash >= 600, obtenido ${sim.bodies.get(player.id)!.vx}`);

  // Vehículo con derrape
  const car = createGameObject('rectangle', [], { name: 'Auto', x: 100, y: 100, width: 48, height: 28 });
  car.components.push({
    id: 'vc',
    type: 'movement.vehicle_drift',
    enabled: true,
    config: { accelerateSpeed: 500, maxSpeed: 360, turnSpeed: 180, driftFactor: 0.2, drag: 1.0 },
  });
  const carSim = createSimulationState({
    id: 's_car',
    name: 'Car',
    backgroundColor: '#000',
    gridVisible: false,
    gridSize: 32,
    snapToGrid: false,
    objects: [car],
  });
  for (let i = 0; i < 20; i++) {
    stepSimulationFixed(carSim, 1 / 60, makeInput({ pressedKeys: new Set(['ArrowUp', 'ArrowRight']) }));
  }
  const simCar = carSim.scene.objects[0];
  assert.ok(simCar.transform.x > 100);
  assert.ok(simCar.transform.rotation > 0);
});

test('Combate, Imán, Wave Spawner, Timer Countdown, Emisor de Partículas y Tweens funcionan en simulación', () => {
  const shooter = createGameObject('rectangle', [], { name: 'Jugador', x: 100, y: 200, width: 32, height: 32 });
  shooter.layer = 'Player';
  shooter.components.push(
    { id: 'c_p', type: 'player_topdown', enabled: true, config: { maxSpeed: 200 } },
    {
      id: 'c_gun',
      type: 'combat.projectile_spawner',
      enabled: true,
      config: { fireKey: 'KeyJ', pattern: 'single', aimMode: 'right', cooldown: 0.1, projectileSpeed: 600, damage: 50, color: '#facc15' },
    },
    { id: 'c_mag', type: 'economy.auto_magnet', enabled: true, config: { radius: 220, pullSpeed: 400 } },
    { id: 'c_em', type: 'juice.particle_emitter', enabled: true, config: { preset: 'fire', rate: 60, speed: 80, color: '#f97316', size: 5, lifetime: 0.5 } }
  );
  shooter.tweens = [
    { id: 'tw1', name: 'FadeIn', property: 'opacity', from: 0.2, to: 1, duration: 0.5, delay: 0, easing: 'easeOut', loop: false, pingPong: false, autoPlay: true },
  ];

  const crate = createGameObject('rectangle', [shooter], { name: 'Caja', x: 170, y: 200, width: 40, height: 40 });
  crate.layer = 'Enemy';
  crate.components.push({ id: 'c_dest', type: 'arcade.destructible', enabled: true, config: { hitsToBreak: 40, burstColor: '#d97706' } });

  const coin = createGameObject('circle', [shooter, crate], { name: 'Moneda', x: 200, y: 200, width: 20, height: 20 });
  coin.components.push({ id: 'c_col', type: 'collectible', enabled: true, config: { points: 10 } });

  const tpl = createGameObject('circle', [shooter, crate, coin], { name: 'MinionTpl', x: -100, y: -100, width: 24, height: 24 });
  tpl.visible = false;

  const spawner = createGameObject('rectangle', [shooter, crate, coin, tpl], { name: 'WaveGen', x: 400, y: 200, width: 24, height: 24 });
  spawner.components.push(
    { id: 'c_ws', type: 'arcade.wave_spawner', enabled: true, config: { templateObjectId: tpl.id, intervalSec: 0.2, maxActive: 5, spreadRadius: 20 } },
    { id: 'c_cd', type: 'arcade.timer_countdown', enabled: true, config: { variable: 'tiempo', startSeconds: 0.2, eventOnZero: 'fin_tiempo' } }
  );

  const sim = createSimulationState(
    {
      id: 's_comb',
      name: 'Combate',
      backgroundColor: '#000',
      gridVisible: false,
      gridSize: 32,
      snapToGrid: false,
      objects: [shooter, crate, coin, tpl, spawner],
      mechanics: [
        {
          id: 'm_zero',
          name: 'Fin countdown',
          enabled: true,
          priority: 1,
          trigger: { event: 'countdown.zero' },
          conditions: [{ id: 'c_prop', type: 'object.property', target: shooter.id, property: 'x', operator: '>=', value: 50 }],
          actions: [{ id: 'a_v', type: 'variable.set', parameters: { variable: 'termino', value: true } }],
        },
      ],
    },
    [
      { id: 'vt', name: 'tiempo', type: 'number', initialValue: 0.2, scope: 'global' },
      { id: 'vd', name: 'termino', type: 'boolean', initialValue: false, scope: 'global' },
    ]
  );

  const startCoinX = sim.scene.objects.find((o) => o.id === coin.id)!.transform.x;

  // Frame 1: disparar proyectil con KeyJ
  stepSimulationFixed(sim, 1 / 60, makeInput({ pressedKeys: new Set(['KeyJ']) }));
  // Avanzar 0.35s
  for (let i = 0; i < 22; i++) {
    stepSimulationFixed(sim, 1 / 60, makeInput());
  }

  const simCrate = sim.scene.objects.find((o) => o.id === crate.id)!;
  const simCoin = sim.scene.objects.find((o) => o.id === coin.id)!;
  const simShooter = sim.scene.objects.find((o) => o.id === shooter.id)!;

  assert.equal(simCrate.visible, false, 'La caja destructible debe romperse al impactar el proyectil');
  assert.ok(simCoin.transform.x < startCoinX, 'El imán debe atraer la moneda hacia el jugador');
  assert.ok(sim.scene.objects.some((o) => o.name.startsWith('MinionTpl_')), 'Wave spawner debe generar clones');
  assert.equal(sim.variables.get('termino'), true, 'countdown.zero debe disparar la mecánica');
  assert.ok(sim.emitterParticles.length > 0, 'Emisor continuo debe generar partículas');
  assert.ok(simShooter.opacity > 0.5, 'Tween autoPlay debe animar opacidad');

  // Probar evaluateEasing & applyObjectTweens directamente
  assert.equal(evaluateEasing('linear', 0.5), 0.5);
  assert.ok(evaluateEasing('bounce', 1) > 0.99);
  const twObj = createGameObject('rectangle', [], { x: 0, y: 0 });
  twObj.tweens = [{ id: 't', name: 'Move', property: 'x', from: 0, to: 100, duration: 1, delay: 0, easing: 'linear', loop: false, pingPong: false, autoPlay: true }];
  const twMap = new Map<string, { elapsed: number; playing: boolean }>();
  applyObjectTweens(twObj, 0.5, twMap);
  assert.ok(Math.abs(twObj.transform.x - 50) < 0.01);
});

test('Variables persistentes, ui_leaderboard Top-10 y exclusión de capa UI funcionan y se compilan en HTML5', async () => {
  const mem = new Map<string, string>();
  const storageAdapter = {
    get: (k: string) => mem.get(k) ?? null,
    set: (k: string, v: string) => {
      mem.set(k, v);
    },
  };

  const hero = createGameObject('sprite', [], { name: 'Hero', x: 200, y: 200, width: 48, height: 48 });
  const lbObj = createGameObject('ui_leaderboard', [hero], { name: 'RankingTop', x: 200, y: 200, width: 320, height: 280 });
  assert.equal(lbObj.layer, 'UI');
  assert.equal(objectsOverlap(hero, lbObj), false);

  const scene: SceneData = {
    id: 's_lb',
    name: 'Ranking',
    backgroundColor: '#000',
    gridVisible: false,
    gridSize: 32,
    snapToGrid: false,
    objects: [hero, lbObj],
    mechanics: [
      {
        id: 'm_save',
        name: 'Guardar record y ranking',
        enabled: true,
        priority: 1,
        trigger: { event: 'scene.start' },
        conditions: [],
        actions: [
          { id: 'a1', type: 'variable.set', parameters: { variable: 'record', value: 750 } },
          { id: 'a2', type: 'leaderboard.submit', parameters: { variable: 'record', playerName: 'Ana' } },
        ],
      },
    ],
  };

  const sim1 = createSimulationState(
    scene,
    [{ id: 'vr', name: 'record', type: 'number', initialValue: 0, scope: 'global', persistent: true }],
    { storageAdapter }
  );
  stepSimulationFixed(sim1, 1 / 60, makeInput());
  assert.equal(sim1.variables.get('record'), 750);
  assert.equal(sim1.leaderboard.length, 1);
  assert.equal(sim1.leaderboard[0].name, 'Ana');
  assert.equal(sim1.leaderboard[0].score, 750);

  // Nueva sesión con mismo storageAdapter debe recuperar variable persistente y ranking ordenado
  const sim2 = createSimulationState(
    { ...scene, mechanics: [] },
    [{ id: 'vr', name: 'record', type: 'number', initialValue: 0, scope: 'global', persistent: true }],
    { storageAdapter }
  );
  assert.equal(sim2.variables.get('record'), 750);
  assert.equal(sim2.leaderboard[0].score, 750);

  // Verificar compilación HTML5 (Playgama + Poki + CrazyGames)
  const proj = buildProjectFromTemplate({
    name: 'Ranking Pro',
    width: 1280,
    height: 720,
    orientation: 'horizontal',
    backgroundColor: '#131b2e',
    template: 'empty_single',
  });
  proj.variables = proj.variables ?? [];
  proj.variables.push({ id: 'vr', name: 'record', type: 'number', initialValue: 0, scope: 'global', persistent: true });
  proj.scenes[0].objects.push(lbObj);

  const playgamaZipPkg = await compileProjectToHtml5Zip(
    proj,
    new Map(),
    { portal: 'playgama', scaleMode: 'letterbox', touchControls: false, showFullscreenButton: true },
    '/* pixi */'
  );
  const pZip = await JSZip.loadAsync(await playgamaZipPkg.blob.arrayBuffer());
  const pRuntime = await pZip.file('js/nexus-runtime.js')!.async('string');
  const pPortal = await pZip.file('js/portal-sdk.js')!.async('string');
  const pConfig = await pZip.file('playgama-bridge-config.json')!.async('string');

  assert.ok(pRuntime.includes('pressedKeys'));
  assert.ok(pRuntime.includes('ui_leaderboard'));
  assert.ok(pRuntime.includes('stepExtendedComp'));
  assert.ok(pPortal.includes('storageSet'));
  assert.ok(pPortal.includes('submitScore'));
  assert.ok(pConfig.includes('playgama-bridge'));
});

test('Audio de PC (formatos ampliados), findUnusedAssetIds, música por escena, sound_trigger y paridad HTML5 funcionan end-to-end', async () => {
  // 1. Detección de formatos de audio de PC
  assert.equal(detectAudioFormat('musica.mp3', 'audio/mpeg'), 'mp3');
  assert.equal(detectAudioFormat('efecto.wav', 'audio/wav'), 'wav');
  assert.equal(detectAudioFormat('ambiente.ogg', 'audio/ogg'), 'ogg');
  assert.equal(detectAudioFormat('tema.m4a', 'audio/mp4'), 'm4a');
  assert.equal(detectAudioFormat('voz.aac', 'audio/aac'), 'aac');
  assert.equal(detectAudioFormat('banda.flac', 'audio/flac'), 'flac');
  assert.equal(detectAudioFormat('clip.webm', 'audio/webm'), 'webm');

  // 2. findUnusedAssetIds respeta música de escena, botón UI y disparador de sonido
  const assets = [
    { id: 'bgm_1', name: 'bgm', filename: 'bgm.mp3', kind: 'audio' as const, format: 'mp3' as const, mimeType: 'audio/mpeg', size: 1200, width: 0, height: 0, thumbnailDataUrl: '', folderId: null, createdAt: 1 },
    { id: 'sfx_btn', name: 'click', filename: 'click.wav', kind: 'audio' as const, format: 'wav' as const, mimeType: 'audio/wav', size: 400, width: 0, height: 0, thumbnailDataUrl: '', folderId: null, createdAt: 1 },
    { id: 'sfx_trig', name: 'boom', filename: 'boom.ogg', kind: 'audio' as const, format: 'ogg' as const, mimeType: 'audio/ogg', size: 500, width: 0, height: 0, thumbnailDataUrl: '', folderId: null, createdAt: 1 },
    { id: 'sfx_orphan', name: 'sin_uso', filename: 'sin_uso.mp3', kind: 'audio' as const, format: 'mp3' as const, mimeType: 'audio/mpeg', size: 300, width: 0, height: 0, thumbnailDataUrl: '', folderId: null, createdAt: 1 },
  ];
  const btn = createGameObject('ui_button', [], { name: 'Btn', x: 100, y: 100, width: 120, height: 44 });
  btn.uiButton = { ...btn.uiButton!, clickSoundAssetId: 'sfx_btn' };
  const trigObj = createGameObject('rectangle', [btn], { name: 'Cofre', x: 200, y: 200, width: 40, height: 40 });
  trigObj.components.push({
    id: 'st_1',
    type: 'audio.sound_trigger',
    enabled: true,
    config: { event: 'onTouchPlayer', audioAssetId: 'sfx_trig', channel: 'sfx', volume: 0.9, pitch: 1, cooldown: 0.2 },
  });
  const scene1: SceneData = {
    id: 'sc_1',
    name: 'Nivel 1',
    kind: 'level',
    backgroundColor: '#131b2e',
    gridVisible: false,
    gridSize: 32,
    snapToGrid: false,
    backgroundMusic: { assetId: 'bgm_1', volume: 0.75, loop: true, autoPlay: true, keepPlayingIfSameTrack: true },
    objects: [btn, trigObj],
    mechanics: [],
  };
  const sceneSilent: SceneData = {
    id: 'sc_2',
    name: 'Fin',
    kind: 'level',
    backgroundColor: '#000',
    gridVisible: false,
    gridSize: 32,
    snapToGrid: false,
    objects: [],
    mechanics: [],
  };
  assert.deepEqual(findUnusedAssetIds(assets, [scene1, sceneSilent]), ['sfx_orphan']);

  // 3. RuntimeSceneManager encola musicPlay al arrancar y musicStop al pasar a escena silenciosa
  const mgr = new RuntimeSceneManager({
    scenes: [scene1, sceneSilent],
    initialSceneId: 'sc_1',
    stage: { width: 1280, height: 720 },
  });
  const initSounds = mgr.step(1 / 60, makeInput());
  assert.ok(initSounds.some((s) => s.kind === 'musicPlay' && s.assetId === 'bgm_1'));

  mgr.loadScene('sc_2', 'none');
  const nextSounds = mgr.step(1 / 60, makeInput());
  assert.ok(nextSounds.some((s) => s.kind === 'musicStop'));

  // 4. Disparadores de sonido por evento (onStart, onTouchPlayer, onClick, onKeyPressed, onInterval, onDestroy) y acciones music.play/music.stop/audio.stopAll
  const hero = createGameObject('rectangle', [], { name: 'Hero', x: 200, y: 200, width: 32, height: 32 });
  hero.components.push({ id: 'p', type: 'player_topdown', enabled: true, config: { maxSpeed: 100 } });

  const box = createGameObject('rectangle', [hero], { name: 'CajaSonora', x: 200, y: 200, width: 40, height: 40 });
  box.components.push(
    { id: 't_start', type: 'audio.sound_trigger', enabled: true, config: { event: 'onStart', audioAssetId: 'sfx_start', channel: 'sfx', volume: 1, pitch: 1 } },
    { id: 't_touch', type: 'audio.sound_trigger', enabled: true, config: { event: 'onTouchPlayer', audioAssetId: 'sfx_trig', channel: 'sfx', volume: 0.9, pitch: 1, cooldown: 0.2 } },
    { id: 't_click', type: 'audio.sound_trigger', enabled: true, config: { event: 'onClick', audioAssetId: 'sfx_btn', channel: 'ui', volume: 1, pitch: 1, cooldown: 0.1 } },
    { id: 't_key', type: 'audio.sound_trigger', enabled: true, config: { event: 'onKeyPressed', key: 'KeyF', audioAssetId: 'sfx_key', channel: 'sfx', volume: 1, pitch: 1, cooldown: 0.1 } },
    { id: 't_int', type: 'audio.sound_trigger', enabled: true, config: { event: 'onInterval', audioAssetId: 'sfx_int', channel: 'sfx', volume: 0.8, pitch: 1, cooldown: 0.2 } },
    { id: 't_dest', type: 'audio.sound_trigger', enabled: true, config: { event: 'onDestroy', audioAssetId: 'sfx_boom', channel: 'sfx', volume: 1, pitch: 1 } },
    { id: 'm_zone', type: 'audio.music_zone', enabled: true, config: { audioAssetId: 'bgm_boss', triggerMode: 'onTouchPlayer', volume: 0.85, loop: true, keepIfSame: true } }
  );

  const sim = createSimulationState({
    id: 'sc_audio',
    name: 'Audio Test',
    backgroundColor: '#000',
    gridVisible: false,
    gridSize: 32,
    snapToGrid: false,
    objects: [hero, box],
    mechanics: [
      {
        id: 'm_key_music',
        name: 'Control musica',
        enabled: true,
        priority: 1,
        trigger: { event: 'input.pressed', key: 'KeyM' },
        conditions: [],
        actions: [
          { id: 'a_mp', type: 'music.play', parameters: { assetId: 'bgm_1', volume: 0.7, loop: true } },
          { id: 'a_ms', type: 'music.stop', parameters: {} },
          { id: 'a_sa', type: 'audio.stopAll', parameters: {} },
        ],
      },
      {
        id: 'm_destroy_box',
        name: 'Destruir caja',
        enabled: true,
        priority: 1,
        trigger: { event: 'input.pressed', key: 'KeyK' },
        conditions: [],
        actions: [{ id: 'a_des', type: 'object.destroy', parameters: { target: box.id } }],
      },
    ],
  });

  sim.clickedObjectIds.push(box.id);
  stepSimulationFixed(sim, 1 / 60, makeInput({ pressedKeys: new Set(['KeyF', 'KeyM']) }));
  const q1 = sim.soundQueue.splice(0, sim.soundQueue.length);
  assert.ok(q1.some((s) => s.assetId === 'sfx_start'));
  assert.ok(q1.some((s) => s.assetId === 'sfx_trig'));
  assert.ok(q1.some((s) => s.assetId === 'sfx_btn'));
  assert.ok(q1.some((s) => s.assetId === 'sfx_key'));
  assert.ok(q1.some((s) => s.kind === 'musicPlay' && s.assetId === 'bgm_boss'));
  assert.ok(q1.some((s) => s.kind === 'musicPlay' && s.assetId === 'bgm_1'));
  assert.ok(q1.some((s) => s.kind === 'musicStop'));
  assert.ok(q1.some((s) => s.kind === 'stopAll'));

  // Avanzar ~0.25s para disparar onInterval y luego pulsar KeyK para onDestroy
  for (let i = 0; i < 15; i++) stepSimulationFixed(sim, 1 / 60, makeInput());
  const q2 = sim.soundQueue.splice(0, sim.soundQueue.length);
  assert.ok(q2.some((s) => s.assetId === 'sfx_int'));

  stepSimulationFixed(sim, 1 / 60, makeInput({ pressedKeys: new Set(['KeyK']) }));
  const q3 = sim.soundQueue.splice(0, sim.soundQueue.length);
  assert.ok(q3.some((s) => s.assetId === 'sfx_boom'));

  // 5. Compilación HTML5 incluye audio en assets/ y paridad completa en runtime
  const proj = buildProjectFromTemplate({
    name: 'Audio Parity',
    width: 1280,
    height: 720,
    orientation: 'horizontal',
    backgroundColor: '#131b2e',
    template: 'empty_single',
  });
  proj.assets.push({
    id: 'bgm_1',
    name: 'tema_nivel',
    filename: 'tema_nivel.mp3',
    kind: 'audio',
    format: 'mp3',
    mimeType: 'audio/mpeg',
    size: 8,
    width: 0,
    height: 0,
    thumbnailDataUrl: '',
    folderId: null,
    createdAt: Date.now(),
  });
  proj.scenes[0].backgroundMusic = {
    assetId: 'bgm_1',
    volume: 0.8,
    loop: true,
    autoPlay: true,
    keepPlayingIfSameTrack: true,
  };
  const blobs = new Map<string, Blob>([['bgm_1', new Blob([new Uint8Array([1, 2, 3, 4])], { type: 'audio/mpeg' })]]);
  const pkg = await compileProjectToHtml5Zip(
    proj,
    blobs,
    { portal: 'web', scaleMode: 'letterbox', touchControls: false, showFullscreenButton: true },
    '/* pixi */'
  );
  const zip = await JSZip.loadAsync(await pkg.blob.arrayBuffer());
  const rt = await zip.file('js/nexus-runtime.js')!.async('string');
  const gameJson = JSON.parse(await zip.file('data/game.json')!.async('string'));
  assert.ok(zip.file('assets/bgm_1_tema_nivel.mp3'), 'El archivo de audio importado debe incluirse en assets/ del ZIP');
  assert.equal(gameJson.assets[0].kind, 'audio');
  assert.equal(gameJson.assets[0].path, 'assets/bgm_1_tema_nivel.mp3');
  assert.equal(gameJson.scenes[0].backgroundMusic.assetId, 'bgm_1');
  assert.ok(rt.includes('syncBusGains'));
  assert.ok(rt.includes('playMusicAsset'));
  assert.ok(rt.includes('rawAudioData'));
  assert.ok(rt.includes('audio.sound_trigger'));
  assert.ok(rt.includes('audio.music_zone'));
  assert.ok(rt.includes('queueSceneMusic'));
});

