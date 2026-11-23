import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createInitialSmartCameraState,
  raycastSegmentObb3D,
  raycastSegmentTrimesh3D,
  stepSmartCamera3D,
  type CameraWallOccluder3D,
} from '../camera/smartCamera';
import {
  applyAutotile4Bit,
  computeCardinalBitmask,
  floodFillTilemap,
  getTileCollisionKind,
  paintRectTilemap,
} from '../tilemap/autotile2d';
import {
  advanceDialogueChoice,
  createActiveDialogueState,
  evaluateDialogueCondition,
  stepDialogueTypewriter,
} from '../dialogue/dialogueEngine';
import {
  exportTableRowsToCsv,
  parseCsvToTableRows,
  queryDataTable,
  resolveI18nText,
} from '../data/dataTableI18n';
import {
  createHistoryState,
  pushHistory,
  redoHistory,
  undoHistory,
} from '../../history/historyManager';
import {
  createPlayerSessionToken,
  MultiplayerRoomManager,
  verifyPlayerSessionToken,
} from '../multiplayer/roomState';
import { createGameObject } from '../objects/factory';
import { createSimulationState, stepSimulation, type InputState } from '../runtime/stepGameSimulation';
import { createSimulation3DState } from '../physics3d/physics3d';
import { generateNexusRuntimeJs } from '../../export/html5/runtimeTemplate';
import { generateNexus3DRuntimeJs } from '../../export/html5/threeRuntimeTemplate';
import type {
  DataTableDef,
  DialogueGraph,
  GameObjectData,
  I18nConfig,
  SceneData,
  SmartCameraConfig,
  TilemapProperties,
} from '../core/types';
import type { NexusProject } from '../../project/models/project';

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

function makeScene2D(objects: GameObjectData[]): SceneData {
  return {
    id: 'sc_2d',
    name: 'Nivel 2D',
    backgroundColor: '#0f172a',
    gridVisible: true,
    gridSize: 32,
    snapToGrid: true,
    objects,
    mechanics: [],
  };
}

function makeScene3D(objects: GameObjectData[]): SceneData {
  return {
    id: 'sc_3d',
    name: 'Arena 3D',
    backgroundColor: '#0f172a',
    gridVisible: true,
    gridSize: 1,
    snapToGrid: true,
    objects,
    mechanics: [],
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

test('SmartCamera3D: rotated OBB wall collision, 5-whisker clearance, large room skip, and post-lerp clamp', () => {
  const rotatedWall: CameraWallOccluder3D = {
    minX: -1,
    maxX: 1,
    minY: 0,
    maxY: 6,
    minZ: 2,
    maxZ: 6,
    yawDeg: 45,
  };

  // Ray from target (0, 2, 0) out to z=10 passes directly through rotated wall center at (0, 2, 4)
  const hitT = raycastSegmentObb3D(0, 2, 0, 0, 0, 10, rotatedWall);
  assert.ok(hitT !== null && hitT > 0.15 && hitT < 0.65, `Expected OBB hit in [0.15..0.65], got ${hitT}`);

  // A small prop is ignored by stepSmartCamera3D
  const smallProp: CameraWallOccluder3D = {
    minX: -0.3,
    maxX: 0.3,
    minY: 0,
    maxY: 0.8,
    minZ: 3,
    maxZ: 3.6,
    isSmallProp: true,
  };

  // Large interior room (min(bw,bd) >= 8 && bh >= 5) should be skipped if camera ray originates inside it
  const largeRoom: CameraWallOccluder3D = {
    minX: -10,
    maxX: 10,
    minY: 0,
    maxY: 8,
    minZ: -10,
    maxZ: 10,
  };

  const camCfg: SmartCameraConfig = {
    isMainCamera: true,
    mode: 'smooth_follow',
    dampingFactor: 0.9,
    lookAhead: 0,
    offsetX: 0,
    offsetY: 1.5,
    offsetZ: 10,
    distance: 10,
    pitchMinDeg: -45,
    pitchMaxDeg: 35,
    fov: 55,
    deadzoneW: 1,
    deadzoneH: 1,
    collideWithWalls: true,
    useBounds: false,
    boundsMinX: -50,
    boundsMaxX: 50,
    boundsMinY: 0,
    boundsMaxY: 50,
    boundsMinZ: -50,
    boundsMaxZ: 50,
  };

  // Step 1: With large room + small prop only, camera reaches full offsetZ=10 (not pulled inward)
  const camRoomState = createInitialSmartCameraState(null, { x: 0, y: 2.5, z: 10 });
  for (let i = 0; i < 15; i++) {
    stepSmartCamera3D(
      camRoomState,
      camCfg,
      { x: 0, y: 2.5, z: 10 },
      { x: 0, y: 1, z: 0 },
      [largeRoom, smallProp],
      1 / 60
    );
  }
  assert.ok(camRoomState.posZ > 8.5, `Large room interior + small prop should not block camera (posZ=${camRoomState.posZ})`);

  // Step 2: With rotated high wall between target (0,1,0) and desired cam (0,2.3,10), post-lerp clamp keeps camera in front of wall
  const camWallState = createInitialSmartCameraState(null, { x: 0, y: 2.5, z: 10 });
  for (let i = 0; i < 8; i++) {
    stepSmartCamera3D(
      camWallState,
      camCfg,
      { x: 0, y: 2.5, z: 10 },
      { x: 0, y: 1, z: 0 },
      [rotatedWall],
      1 / 60
    );
  }
  assert.ok(camWallState.posZ < 3.5, `Post-lerp clamp must keep camera in front of rotated wall (posZ=${camWallState.posZ})`);
});

test('Tilemaps 2D: 4-bit autotile, rect brush, flood fill bucket, one_way & damage tiles in simulation', () => {
  const tm: TilemapProperties = {
    assetId: null,
    tileWidth: 32,
    tileHeight: 32,
    cols: 10,
    rows: 10,
    tilesetCols: 4,
    tilesetRows: 4,
    selectedTileIndex: 1,
    cells: {},
    autotileBaseTile: 0,
    tileTypes: {
      '2': { collision: 'one_way', damagePerSec: 0 },
      '3': { collision: 'damage', damagePerSec: 50 },
      '4': { collision: 'none', damagePerSec: 0 },
    },
  };

  // Paint rect 2x2 with autotile
  const afterRect = paintRectTilemap(tm, 1, 1, 2, 2, false, true);
  assert.equal(Object.keys(afterRect).length, 4);
  assert.equal(computeCardinalBitmask(afterRect, 1, 1), 2 | 4); // East + South = 6
  assert.equal(computeCardinalBitmask(afterRect, 2, 2), 1 | 8); // North + West = 9

  // Single autotile neighbor recalculation
  const tmWithCells: TilemapProperties = { ...tm, cells: { '0,0': 0 } };
  const afterAuto = applyAutotile4Bit(tmWithCells, 1, 0, false, 0);
  assert.equal(afterAuto['0,0'], 2); // East neighbor bit
  assert.equal(afterAuto['1,0'], 8); // West neighbor bit

  // Flood fill bounded inside enclosed border
  const boxedTm: TilemapProperties = {
    ...tm,
    cols: 5,
    rows: 5,
    selectedTileIndex: 7,
    cells: {
      '0,0': 1, '1,0': 1, '2,0': 1, '3,0': 1, '4,0': 1,
      '0,1': 1, '4,1': 1,
      '0,2': 1, '4,2': 1,
      '0,3': 1, '4,3': 1,
      '0,4': 1, '1,4': 1, '2,4': 1, '3,4': 1, '4,4': 1,
    },
  };
  const filled = floodFillTilemap(boxedTm, 2, 2, false, false);
  assert.equal(filled['2,2'], 7);
  assert.equal(filled['1,1'], 7);
  assert.equal(filled['3,3'], 7);
  assert.equal(filled['0,0'], 1);

  assert.equal(getTileCollisionKind(tm, 2).kind, 'one_way');
  assert.equal(getTileCollisionKind(tm, 3).kind, 'damage');
  assert.equal(getTileCollisionKind(tm, 3).damagePerSec, 50);

  // Simulation check: one_way tile supports player landing from above, and damage tile reduces health
  const tilemapObj = createGameObject('tilemap', [], { name: 'Mapa', x: 0, y: 0 });
  tilemapObj.transform.anchorX = 0;
  tilemapObj.transform.anchorY = 0;
  tilemapObj.tilemap = {
    assetId: null,
    tileWidth: 32,
    tileHeight: 32,
    cols: 10,
    rows: 6,
    tilesetCols: 4,
    tilesetRows: 4,
    selectedTileIndex: 2,
    cells: {
      '1,3': 2, // one_way platform at x:[32..64], y:[96..128]
      '2,3': 2,
      '4,3': 3, // lava/damage tile at x:[128..160], y:[96..128]
    },
    tileTypes: {
      '2': { collision: 'one_way', damagePerSec: 0 },
      '3': { collision: 'damage', damagePerSec: 60 },
    },
  };
  tilemapObj.components.push({ id: 'tm_solid', type: 'solid', enabled: true, config: {} });

  const player = createGameObject('rectangle', [], { name: 'Hero', x: 48, y: 60 });
  player.transform.width = 24;
  player.transform.height = 24;
  player.rectangle = { fillColor: '#38bdf8', strokeColor: '#fff', strokeWidth: 0, cornerRadius: 4 };
  player.colliders = [{ id: 'pcol', shape: 'box', width: 24, height: 24, radius: 12, offsetX: 0, offsetY: 0, isSensor: false, layer: 'Player' }];
  player.components.push(
    { id: 'pc', type: 'player_platformer', enabled: true, config: { speed: 200, jumpForce: 500, gravity: 900 } },
    { id: 'hp', type: 'health', enabled: true, config: { maxHealth: 100, currentHealth: 100 } }
  );

  const sim = createSimulationState(makeScene2D([tilemapObj, player]));
  const simPlayer = sim.scene.objects.find((o) => o.id === player.id)!;
  for (let i = 0; i < 30; i++) {
    stepSimulation(sim, 1 / 60, emptyInput2D());
  }
  const pBody = sim.bodies.get(player.id)!;
  assert.equal(pBody.grounded, true, 'Player falling onto one_way tile must land and become grounded');
  assert.ok(simPlayer.transform.y <= 90 && simPlayer.transform.y >= 80, `Expected player resting on platform y~84, got ${simPlayer.transform.y}`);

  // Move player onto damage tile at x=144, y=104 (damage zone [128..160, 96..128])
  simPlayer.transform.x = 144;
  simPlayer.transform.y = 104;
  pBody.vy = 0;
  pBody.invulnerableTimer = 0;
  for (let i = 0; i < 20; i++) {
    stepSimulation(sim, 1 / 60, emptyInput2D());
  }
  assert.ok(pBody.health < 100, `Damage tile must reduce player health (got ${pBody.health})`);
});

test('Dialogue Engine & DataTables/i18n: branching, typewriter, conditions, CSV roundtrip & queries', () => {
  const i18n: I18nConfig = {
    defaultLocale: 'es',
    entries: {
      greeting: { es: 'Hola {{hero}}', en: 'Hello {{hero}}', pt: 'Olá {{hero}}' },
      choice_vip: { es: 'Entrar como VIP', en: 'Enter as VIP' },
    },
  };
  const translate = (locale: 'es' | 'en' | 'pt') => (key: string) => resolveI18nText(i18n, key, locale);

  const graph: DialogueGraph = {
    id: 'dlg_guard',
    name: 'Guardia',
    startNodeId: 'n1',
    nodes: [
      {
        id: 'n1',
        speaker: 'Guardia',
        text: '@t(greeting), tienes {{gold}} monedas.',
        typewriterSpeed: 100,
        choices: [
          {
            id: 'c_buy',
            text: 'Comprar pase (-50)',
            nextNodeId: 'n2',
            conditionExpr: 'gold >= 50',
            actionVar: 'gold',
            actionOp: 'add',
            actionValue: -50,
            actionEvent: 'pass_bought',
          },
          {
            id: 'c_vip',
            text: '@t(choice_vip)',
            nextNodeId: 'n2',
            conditionExpr: 'vip == true',
          },
          {
            id: 'c_leave',
            text: 'Salir',
            nextNodeId: null,
          },
        ],
      },
      {
        id: 'n2',
        speaker: 'Guardia',
        text: 'Bienvenido!',
        choices: [],
      },
    ],
  };

  assert.equal(evaluateDialogueCondition('gold >= 50', { gold: 60 }), true);
  assert.equal(evaluateDialogueCondition('vip == true', { vip: false }), false);

  const vars: Record<string, unknown> = { hero: 'Kael', gold: 80, vip: false };
  let st = createActiveDialogueState(graph, 'n1', vars, translate('en'));
  assert.ok(st);
  assert.equal(st.fullText, 'Hello Kael, tienes 80 monedas.');
  assert.equal(st.choices.length, 2, 'VIP choice must be filtered out when vip == false');
  assert.equal(st.finishedTyping, false);

  // Step typewriter to completion
  st = stepDialogueTypewriter(st, 1.0);
  assert.equal(st.finishedTyping, true);

  // Select choice 0 (Comprar pase -50)
  const emitted: string[] = [];
  st = advanceDialogueChoice(graph, st, 0, vars, (ev) => emitted.push(ev), translate('en'));
  assert.ok(st);
  assert.equal(st.nodeId, 'n2');
  assert.equal(vars.gold, 30);
  assert.deepEqual(emitted, ['pass_bought']);

  // CSV parse/export + queryDataTable
  const parsed = parseCsvToTableRows('id,name,damage,rare\nsword,Espada Solar,45,true\npotion,Poción Vida,0,false');
  assert.deepEqual(parsed.columns, ['id', 'name', 'damage', 'rare']);
  assert.equal(parsed.rows.length, 2);
  assert.equal(parsed.rows[0].damage, 45);
  assert.equal(parsed.rows[0].rare, true);

  const table: DataTableDef = { id: 'tbl_items', name: 'Items', columns: parsed.columns, rows: parsed.rows };
  const csvOut = exportTableRowsToCsv(table);
  assert.ok(csvOut.includes('sword,Espada Solar,45,true'));
  assert.deepEqual(queryDataTable([table], 'Items', 'potion'), parsed.rows[1]);
});

test('HistoryManager: undo/redo with structural sharing of heavy 3D terrain & CSG buffers', () => {
  const heights = Array.from({ length: 100 }, (_, i) => i * 0.1);
  const splatWeights = Array.from({ length: 400 }, () => 0.25);
  const csgGeom = { positions: [0, 0, 0, 1, 0, 0, 0, 1, 0], normals: [0, 0, 1, 0, 0, 1, 0, 0, 1] };
  const navWalkable = [1, 1, 0, 1];

  const terrainObj = makeMesh3D('terrain_1', 'Terreno', { x: 0, y: 0, z: 0 }, { sx: 1, sy: 1, sz: 1 });
  terrainObj.mesh3d = {
    shape: 'terrain',
    color: '#22c55e',
    metalness: 0,
    roughness: 0.9,
    castShadow: false,
    receiveShadow: true,
    terrainData: {
      width: 40,
      depth: 40,
      segments: 9,
      seed: 1,
      amplitude: 4,
      frequency: 0.05,
      octaves: 3,
      heights,
      splatWeights,
    },
    csgGeometryJson: csgGeom,
  };

  const baseProject: NexusProject = {
    id: 'proj_3d',
    formatVersion: '1.0.0',
    mode: '3d',
    name: 'Test 3D',
    createdAt: 1,
    updatedAt: 1,
    settings: { width: 1280, height: 720, orientation: 'horizontal', backgroundColor: '#000' },
    activeSceneId: 'sc_1',
    scenes: [
      {
        id: 'sc_1',
        name: 'Mundo',
        backgroundColor: '#000',
        gridVisible: true,
        gridSize: 1,
        snapToGrid: true,
        navMesh: { cellSize: 1, originX: -5, originZ: -5, cols: 2, rows: 2, walkable: navWalkable, heights: [0, 0, 0, 0], maxSlopeDeg: 45, builtAt: 1 },
        objects: [terrainObj],
      },
    ],
    assets: [],
  };

  let hist = createHistoryState(baseProject);
  const modified = structuredClone(hist.present);
  // Restore exact heavy buffer references before pushing an unrelated transform change
  modified.scenes[0].objects[0].mesh3d!.terrainData!.heights = heights;
  modified.scenes[0].objects[0].mesh3d!.terrainData!.splatWeights = splatWeights;
  modified.scenes[0].objects[0].mesh3d!.csgGeometryJson = csgGeom;
  modified.scenes[0].navMesh!.walkable = navWalkable;
  modified.scenes[0].objects[0].transform3d!.x = 12;

  hist = pushHistory(hist, modified);
  assert.equal(hist.present.scenes[0].objects[0].transform3d!.x, 12);
  // Heavy buffers must remain structurally shared (same object reference)
  assert.equal(hist.present.scenes[0].objects[0].mesh3d!.terrainData!.heights, heights);
  assert.equal(hist.present.scenes[0].objects[0].mesh3d!.csgGeometryJson, csgGeom);
  assert.equal(hist.present.scenes[0].navMesh!.walkable, navWalkable);

  hist = undoHistory(hist);
  assert.equal(hist.present.scenes[0].objects[0].transform3d!.x, 0);
  assert.equal(hist.present.scenes[0].objects[0].mesh3d!.terrainData!.heights, heights);

  hist = redoHistory(hist);
  assert.equal(hist.present.scenes[0].objects[0].transform3d!.x, 12);
});

test('3D No-Code Combat & Super Library + Exported 2D/3D HTML5 Runtime Syntax Validation', () => {
  const player = makeMesh3D('pl3d', 'Jugador', { x: 0, y: 1, z: 0 }, { sx: 1, sy: 1, sz: 1 });
  player.components.push(
    { id: 'c_p', type: 'player_3d', enabled: true, config: { speed: 6 } },
    { id: 'c_proj', type: 'combat.projectile_spawner', enabled: true, config: { fireKey: 'KeyF', damage: 40, speed: 20 } },
    { id: 'c_melee', type: 'combat.melee_attack', enabled: true, config: { attackKey: 'KeyJ', range: 4, damage: 35 } },
    { id: 'c_rod', type: 'tool.fishing_rod', enabled: true, config: { castKey: 'KeyK', biteTimeSec: 0.4, fishPool: 'salmon' } }
  );

  const enemy = makeMesh3D('en3d', 'Enemigo', { x: 0, y: 1, z: 2 }, { sx: 1, sy: 1, sz: 1 });
  enemy.layer = 'Enemy';
  enemy.components.push({ id: 'c_hp', type: 'combat.health_system', enabled: true, config: { maxHp: 80 } });

  const vendor = makeMesh3D('vnd3d', 'Mercader', { x: 1, y: 1, z: 0 }, { sx: 1, sy: 1, sz: 1 });
  vendor.components.push({ id: 'c_shop', type: 'rpg.shop_vendor', enabled: true, config: { buyKey: 'KeyB', itemId: 'potion', price: 25 } });

  const sim3d = createSimulation3DState(makeScene3D([player, enemy, vendor]), [], new Map([['puntos', 100]]));
  assert.equal(sim3d.objects.find((o) => o.id === 'en3d')?.maxHp, 80);

  // Step 1: Trigger melee attack (KeyJ) and shop vendor purchase (KeyB)
  sim3d.step({
    dt: 1 / 60,
    heldKeys: new Set(['KeyJ', 'KeyB']),
    justPressedKeys: new Set(['KeyJ', 'KeyB']),
  });

  const enemyState = sim3d.objects.find((o) => o.id === 'en3d')!;
  assert.equal(enemyState.hp, 45, 'Melee attack must damage nearby enemy from 80 -> 45');
  assert.equal(sim3d.variables.get('puntos'), 75, 'Shop vendor must deduct 25 pts');
  assert.equal(sim3d.variables.get('inv_potion'), 1, 'Shop vendor must grant inv_potion');

  // Step 2: Trigger projectile spawner (KeyF)
  sim3d.step({
    dt: 1 / 60,
    heldKeys: new Set(['KeyF']),
    justPressedKeys: new Set(['KeyF']),
  });
  assert.ok(sim3d.objects.some((o) => o.name.startsWith('Proj_')), 'Projectile spawner must spawn a 3D projectile');

  // Verify both exported HTML5 JS templates compile cleanly in JS engine
  const opts = { portal: 'web' as const, scaleMode: 'letterbox' as const, touchControls: false, showFullscreenButton: true };
  const rt2d = generateNexusRuntimeJs(opts);
  const rt3d = generateNexus3DRuntimeJs(opts);
  assert.doesNotThrow(() => new Function(rt2d), '2D runtime template must have valid JS syntax');
  assert.doesNotThrow(() => new Function(rt3d), '3D runtime template must have valid JS syntax');
});

test('Security & MultiplayerRoomManager: signed player session tokens, rate limiter, and server-side shop validation', () => {
  const mgr = new MultiplayerRoomManager();

  // Signed token verification + tamper rejection
  const token = createPlayerSessionToken('player_42');
  assert.equal(verifyPlayerSessionToken('player_42', token), true);
  assert.equal(verifyPlayerSessionToken('player_99', token), false);
  assert.equal(verifyPlayerSessionToken('player_42', `${token}tampered`), false);

  // Sliding window rate limiter
  const baseNow = 1_700_000_000_000;
  for (let i = 0; i < 3; i++) {
    assert.equal(mgr.checkRateLimit('ws:p1', 3, 1000, baseNow + i * 10), true);
  }
  assert.equal(mgr.checkRateLimit('ws:p1', 3, 1000, baseNow + 50), false, '4th request inside 1s window must be rejected');
  assert.equal(mgr.checkRateLimit('ws:p1', 3, 1000, baseNow + 1200), true, 'Request after window expires must succeed');

  // Server-side shop transaction validation
  const okTx = mgr.validateShopTransaction({ currentCurrency: 100, unitPrice: 30, quantity: 3 });
  assert.equal(okTx.ok, true);
  assert.equal(okTx.totalCost, 90);
  assert.equal(okTx.remainingCurrency, 10);

  const negQty = mgr.validateShopTransaction({ currentCurrency: 100, unitPrice: 30, quantity: -2 });
  assert.equal(negQty.ok, false);

  const broke = mgr.validateShopTransaction({ currentCurrency: 20, unitPrice: 30, quantity: 1 });
  assert.equal(broke.ok, false);
});

test('Pro Camera Collision: per-object always/never modes, container walls, trimesh interiors, grazing probe radius, and instant orbit clamp', () => {
  // 1) Trimesh raycast inside hollow room hits wall triangle accurately
  const triWall: CameraWallOccluder3D = {
    minX: -12,
    maxX: 12,
    minY: 0,
    maxY: 6,
    minZ: -12,
    maxZ: 12,
    cameraCollision: 'auto',
    // Two triangles forming an interior wall plane at z = 4 (spanning x: -10..10, y: 0..6)
    triangles: new Float32Array([
      -10, 0, 4,  10, 0, 4,  10, 6, 4,
      -10, 0, 4,  10, 6, 4, -10, 6, 4,
    ]),
  };
  const triHit = raycastSegmentTrimesh3D(0, 1.5, 0, 0, 0, 10, triWall, triWall.triangles!);
  assert.ok(triHit !== null && Math.abs(triHit - 0.4) < 0.02, `Trimesh raycast must hit wall at t=0.4 (got ${triHit})`);

  const orbitCfg: SmartCameraConfig = {
    isMainCamera: true,
    mode: 'third_person_orbit',
    dampingFactor: 0.9,
    lookAhead: 0,
    offsetX: 0,
    offsetY: 3,
    offsetZ: 10,
    distance: 10,
    pitchMinDeg: -45,
    pitchMaxDeg: 35,
    fov: 55,
    deadzoneW: 1,
    deadzoneH: 1,
    collideWithWalls: true,
    useBounds: false,
    boundsMinX: -50,
    boundsMaxX: 50,
    boundsMinY: 0,
    boundsMaxY: 50,
    boundsMinZ: -50,
    boundsMaxZ: 50,
  };

  // Player inside large trimesh room looking outward toward +Z=10 -> must pull in front of z=4 wall
  const camTriState = createInitialSmartCameraState(null, { x: 0, y: 3, z: 10 });
  stepSmartCamera3D(camTriState, orbitCfg, { x: 0, y: 3, z: 10 }, { x: 0, y: 1, z: 0 }, [triWall], 1 / 60);
  assert.ok(camTriState.posZ < 4.0, `Camera inside trimesh room must stop before z=4 wall (posZ=${camTriState.posZ})`);

  // 2) Grazing angle + rapid orbit spin in 1 frame: camera must maintain ~0.34m clearance from wall face at z=2.0
  const grazingWall: CameraWallOccluder3D = {
    minX: -10,
    maxX: 10,
    minY: 0,
    maxY: 6,
    minZ: 2.0,
    maxZ: 3.0,
    cameraCollision: 'always',
  };
  const camSpinState = createInitialSmartCameraState(null, { x: -10, y: 2.5, z: 0 });
  camSpinState.orbitYawDeg = 20; // pointing nearly along +Z behind wall at grazing angle
  camSpinState.orbitPitchDeg = -8;
  stepSmartCamera3D(camSpinState, orbitCfg, { x: 0, y: 2.5, z: 10 }, { x: 0, y: 1, z: 0 }, [grazingWall], 1 / 60);
  assert.ok(
    camSpinState.posZ <= 1.75,
    `Rapid orbit spin + grazing angle must keep camera on player side of z=2.0 wall with probe clearance (posZ=${camSpinState.posZ})`
  );

  // 3) Full 3D Simulation integration: parented folder wall, 'always' low/no-physics wall, and 'never' ignored tall wall
  const floor = createGameObject('mesh_3d', [], { name: 'Floor', shape3d: 'plane', x3d: 0, y3d: -0.5, z3d: 0 });
  floor.transform3d!.sx = 40;
  floor.transform3d!.sz = 40;

  const player = createGameObject('mesh_3d', [floor], { name: 'Hero', shape3d: 'box', x3d: 0, y3d: 1, z3d: 0 });
  player.layer = 'Player';
  player.physics3d = { enabled: true, bodyType: 'dynamic', shape: 'capsule', mass: 1, gravityScale: 1, restitution: 0, friction: 0.6 };
  player.components.push({ id: 'p_ctrl', type: 'player_3d', enabled: true, config: { speed: 6, jumpForce: 8 } });

  const folder = createGameObject('container', [floor, player], { name: 'Folder_Muros', x3d: 0, y3d: 0, z3d: 0 });

  // Wall inside folder (previously skipped by !hasParentInScene!)
  const folderWall = createGameObject('mesh_3d', [floor, player, folder], { name: 'Muro_Carpeta', shape3d: 'box', x3d: 0, y3d: 2.5, z3d: 4 });
  folderWall.parentId = folder.id;
  folderWall.transform3d!.sx = 12;
  folderWall.transform3d!.sy = 5;
  folderWall.transform3d!.sz = 0.8;

  // Thin/no-physics pillar (normally ignored by isSmallProp & enabled=false) with cameraCollision: 'always'
  const alwaysThinPillar = createGameObject('mesh_3d', [floor, player], { name: 'Pilar_Siempre', shape3d: 'box', x3d: 0, y3d: 3, z3d: 5 });
  alwaysThinPillar.transform3d!.sx = 0.55;
  alwaysThinPillar.transform3d!.sy = 6.0;
  alwaysThinPillar.transform3d!.sz = 0.55;
  alwaysThinPillar.physics3d = { enabled: false, bodyType: 'static', shape: 'box', cameraCollision: 'always', mass: 1, gravityScale: 1, restitution: 0, friction: 0.6 };

  // Tall wall with cameraCollision: 'never'
  const neverWall = createGameObject('mesh_3d', [floor, player], { name: 'Muro_Ignorado', shape3d: 'box', x3d: 0, y3d: 3, z3d: 4 });
  neverWall.transform3d!.sx = 12;
  neverWall.transform3d!.sy = 6;
  neverWall.transform3d!.sz = 0.8;
  neverWall.physics3d = { enabled: true, bodyType: 'static', shape: 'box', cameraCollision: 'never', mass: 1, gravityScale: 1, restitution: 0, friction: 0.6 };

  const makeCam = (tgtId: string) => {
    const cam = createGameObject('camera_3d', [], { name: 'Cam', x3d: 0, y3d: 4, z3d: 10 });
    cam.camera3d!.mode = 'third_person_orbit';
    cam.camera3d!.targetObjectId = tgtId;
    cam.camera3d!.distance = 10;
    cam.camera3d!.dampingFactor = 0.9;
    cam.camera3d!.collideWithWalls = true;
    return cam;
  };

  // A) Wall in container folder blocks camera
  const simFolder = createSimulation3DState({
    id: 'sc_folder',
    name: 'FolderTest',
    backgroundColor: '#0f172a',
    gridVisible: true,
    gridSize: 1,
    snapToGrid: true,
    objects: [floor, player, folder, folderWall, makeCam(player.id)],
    mechanics: [],
  });
  for (let i = 0; i < 6; i++) simFolder.step({ dt: 1 / 60, heldKeys: new Set(), justPressedKeys: new Set() });
  assert.ok(simFolder.cameraState.posZ < 3.7, `Wall inside container folder must block camera (posZ=${simFolder.cameraState.posZ})`);

  // B) Thin/non-physics pillar with cameraCollision='always' blocks camera
  const simAlways = createSimulation3DState({
    id: 'sc_always',
    name: 'AlwaysTest',
    backgroundColor: '#0f172a',
    gridVisible: true,
    gridSize: 1,
    snapToGrid: true,
    objects: [floor, player, alwaysThinPillar, makeCam(player.id)],
    mechanics: [],
  });
  for (let i = 0; i < 6; i++) simAlways.step({ dt: 1 / 60, heldKeys: new Set(), justPressedKeys: new Set() });
  assert.ok(simAlways.cameraState.posZ < 4.8, `cameraCollision='always' must block camera even on thin non-physics column (posZ=${simAlways.cameraState.posZ})`);

  // C) Tall wall with cameraCollision='never' lets camera pass through
  const simNever = createSimulation3DState({
    id: 'sc_never',
    name: 'NeverTest',
    backgroundColor: '#0f172a',
    gridVisible: true,
    gridSize: 1,
    snapToGrid: true,
    objects: [floor, player, neverWall, makeCam(player.id)],
    mechanics: [],
  });
  for (let i = 0; i < 10; i++) simNever.step({ dt: 1 / 60, heldKeys: new Set(), justPressedKeys: new Set() });
  assert.ok(simNever.cameraState.posZ > 7.5, `cameraCollision='never' must allow camera pass-through (posZ=${simNever.cameraState.posZ})`);
});

