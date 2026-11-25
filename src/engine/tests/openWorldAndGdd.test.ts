import test from 'node:test';
import assert from 'node:assert/strict';
import {
  computeProjectSemanticHash,
  normalizeProjectData,
  serializeProjectToManifest,
} from '../../project/serialization/projectSerializer';
import { validateProjectData } from '../../project/validation/projectValidator';
import { buildProjectFromTemplate } from '../../project/templates/projectTemplates';
import {
  compileNexusScript,
  sanitizeWidgetHtml,
  scanScriptSecurity,
} from '../scripting/scriptRuntime';
import { createDeterministicContext } from '../core/deterministicSim';
import {
  applyWorldSaveStateToScene,
  buildHlodProxiesForChunks,
  buildStreamingProfilerReport,
  createStreamingControllerState,
  createWorldSaveState,
  evaluateMemoryResidency,
  getActivationPolicy,
  isTargetOccluded,
  partitionSceneIntoChunks,
  recordDestroyedEntity,
  recordObjectTransform,
  resolveActivityLevel,
  serializeWorldSaveState,
  stepStreamingController,
} from '../streaming/worldStreaming';
import {
  computeAdaptiveMultiplayerFraming,
  createInitialSmartCameraState,
  evaluateActiveCameraVolumes,
  resolveCameraConfigWithVolume,
  stepSmartCamera3D,
} from '../camera/smartCamera';
import { createSimulation3DState } from '../physics3d/physics3d';
import {
  applyCommandPlan,
  planCommandBarInput,
} from '../commandbar/commandPlan';
import {
  createHistoryState,
  pushHistory,
  undoHistory,
} from '../../history/historyManager';
import type { NexusProject, NexusScriptAsset } from '../../project/models/project';
import type { CameraVolume3D, SmartCameraConfig } from '../core/types';
import { createGameObject } from '../objects/factory';

function makeOpenWorldSample(): NexusProject {
  const project = buildProjectFromTemplate({
    name: 'Test Open World',
    mode: '3d',
    width: 1280,
    height: 720,
    orientation: 'horizontal',
    backgroundColor: '#0f172a',
    template: 'open_world_3d',
  });
  project.seed = 9001;
  project.dialogues = [
    {
      id: 'dlg_1',
      name: 'Explorador',
      startNodeId: 'n1',
      nodes: [
        {
          id: 'n1',
          speaker: 'Guía',
          text: 'Bienvenido al sector.',
          choices: [{ id: 'ch1', text: 'Continuar', nextNodeId: null }],
        },
      ],
    },
  ];
  project.dataTables = [
    {
      id: 'tbl_items',
      name: 'items',
      columns: ['key', 'ataque', 'precio'],
      rows: [{ id: 'r1', key: 'espada', ataque: 15, precio: 50 }],
    },
  ];
  project.i18n = {
    defaultLocale: 'es',
    autoDetectBrowser: true,
    entries: {
      welcome: { es: 'Bienvenido', en: 'Welcome', pt: 'Bem-vindo' },
    },
  };
  project.security = {
    scriptMode: 'safe_sandbox',
    allowUnsafeWidgets: false,
    maxScriptMsPerFrame: 12,
  };
  project.saveSlots = [
    {
      id: 'slot_1',
      name: 'Checkpoint_1',
      savedAt: 1700000000000,
      sceneId: project.activeSceneId,
      variables: { puntos: 120 },
      worldSaveState: {
        destroyedIds: [],
        triggeredIds: ['trig_a'],
        objectTransforms: { player: { x: 1, y: 2, z: 3 } },
      },
    },
  ];
  project.commandHistory = [
    {
      id: 'cmd_1',
      timestamp: 1700000000000,
      mode: 'dsl',
      summary: '1 operación',
      commandText: 'variable puntos = 120',
      affectedCount: 1,
      favorite: true,
    },
  ];
  return project;
}

test('1. Serialización canónica sin pérdidas y hash semántico estable', () => {
  const proj = makeOpenWorldSample();
  const norm = normalizeProjectData(proj);
  const manifest = serializeProjectToManifest(norm);

  assert.equal(manifest.project.seed, 9001);
  assert.equal(manifest.project.dialogues?.length, 1);
  assert.equal(manifest.project.dataTables?.[0]?.name, 'items');
  assert.equal(manifest.project.i18n?.entries.welcome?.en, 'Welcome');
  assert.equal(manifest.project.security?.scriptMode, 'safe_sandbox');
  assert.equal(manifest.project.saveSlots?.[0]?.variables.puntos, 120);
  assert.equal(manifest.project.commandHistory?.[0]?.favorite, true);
  assert.equal(manifest.project.scenes[0]?.worldStreaming?.enabled, true);
  assert.equal(manifest.project.scenes[0]?.cameraVolumes?.length, 1);
  assert.equal(manifest.project.scenes[0]?.occlusionVolumes?.length, 1);

  const hashA = computeProjectSemanticHash(proj);
  const cloneLater: NexusProject = {
    ...structuredClone(proj),
    updatedAt: proj.updatedAt + 99999,
    createdAt: proj.createdAt + 12345,
  };
  const hashB = computeProjectSemanticHash(cloneLater);
  assert.equal(hashA, hashB, 'El hash semántico debe ignorar timestamps volátiles');

  const mutated = structuredClone(proj);
  mutated.seed = 42;
  assert.notEqual(hashA, computeProjectSemanticHash(mutated));
});

test('2. Validador de 2 niveles detecta IDs duplicados, ciclos, NaN y masa <= 0 con JsonPath', () => {
  const proj = makeOpenWorldSample();
  const scene = proj.scenes[0];

  // Duplicar ID de script, variable y diálogo
  proj.scripts = [
    { id: 'dup_sc', name: 'S1', kind: 'script', code: '', updatedAt: 1 },
    { id: 'dup_sc', name: 'S2', kind: 'script', code: '', updatedAt: 2 },
  ];
  proj.variables?.push({ ...proj.variables[0] });
  proj.dialogues?.push({ ...proj.dialogues[0] });

  // Duplicar ID de objeto, ciclo de jerarquía, NaN en transform3d y masa <= 0
  const oA = createGameObject('mesh_3d', scene.objects, { name: 'CicloA' });
  const oB = createGameObject('mesh_3d', scene.objects, { name: 'CicloB' });
  oA.parentId = oB.id;
  oB.parentId = oA.id;
  oA.transform3d = { x: Number.NaN, y: 1, z: 0, rx: 0, ry: 0, rz: 0, sx: 1, sy: 1, sz: 1 };
  oB.physics3d = {
    enabled: true,
    bodyType: 'dynamic',
    shape: 'box',
    mass: 0,
    gravityScale: 1,
    restitution: 0,
    friction: 0.5,
  };
  const dupObj = structuredClone(oA);
  dupObj.name = 'Duplicado';
  scene.objects.push(oA, oB, dupObj);

  const res = validateProjectData(proj);
  assert.equal(res.valid, false);
  const paths = res.issues.map((i) => i.path);
  assert.ok(paths.some((p) => p.includes('$.scripts[1].id')));
  assert.ok(paths.some((p) => p.includes('$.variables[')));
  assert.ok(paths.some((p) => p.includes('$.dialogues[1].id')));
  assert.ok(paths.some((p) => p.includes('parentId')));
  assert.ok(paths.some((p) => p.includes('transform3d')));
  assert.ok(paths.some((p) => p.includes('physics3d.mass')));
});

test('3. Sandbox seguro de scripts, watchdog anti-errores y sanitización HTML de widgets', () => {
  const dangerousCode = `
    export function onUpdate(self, api) {
      window.location.href = 'https://evil.example';
      fetch('https://evil.example');
      localStorage.setItem('x', '1');
    }
  `;
  const scan = scanScriptSecurity(dangerousCode);
  assert.equal(scan.safe, false);
  assert.ok(scan.blockedIdentifiers.includes('window'));
  assert.ok(scan.blockedIdentifiers.includes('fetch'));
  assert.ok(scan.blockedIdentifiers.includes('localStorage'));

  const blockedScript: NexusScriptAsset = {
    id: 'sc_bad',
    name: 'BadScript',
    kind: 'script',
    code: dangerousCode,
    securityMode: 'safe_sandbox',
    updatedAt: 1,
  };
  const compiledBlocked = compileNexusScript(blockedScript);
  assert.ok(compiledBlocked.error);
  assert.ok((compiledBlocked.securityViolations ?? []).length >= 3);

  const trustedCompiled = compileNexusScript({ ...blockedScript, securityMode: 'trusted_js' });
  assert.equal(trustedCompiled.error, null);

  // Watchdog tras 3 errores consecutivos
  const flakyScript: NexusScriptAsset = {
    id: 'sc_err',
    name: 'FlakyScript',
    kind: 'script',
    code: `export function onUpdate() { throw new Error('boom'); }`,
    securityMode: 'safe_sandbox',
    updatedAt: 1,
  };
  const compiledFlaky = compileNexusScript(flakyScript);
  assert.ok(compiledFlaky.hooks.onUpdate);
  for (let i = 0; i < 3; i++) {
    assert.throws(() => compiledFlaky.hooks.onUpdate!({} as never, 1 / 60, {} as never), /boom/);
  }
  assert.equal(compiledFlaky.watchdogDisabled, true);
  assert.ok(compiledFlaky.watchdogReason);
  // Al 4º intento no vuelve a lanzar porque quedó desactivado por el watchdog
  assert.doesNotThrow(() => compiledFlaky.hooks.onUpdate!({} as never, 1 / 60, {} as never));

  // Sanitización HTML preservando data-nexus-*
  const dirtyHtml = `<div class="hud" onclick="alert(1)"><script>alert(2)</script><button data-nexus-action="var:puntos+=10">Sumar</button><a href="javascript:evil()">Link</a></div>`;
  const cleanHtml = sanitizeWidgetHtml(dirtyHtml);
  assert.equal(cleanHtml.includes('<script'), false);
  assert.equal(/onclick=/i.test(cleanHtml), false);
  assert.equal(/javascript:/i.test(cleanHtml), false);
  assert.ok(cleanHtml.includes('data-nexus-action="var:puntos+=10"'));
});

test('4. RNG determinista con semilla reproduce exactamente la misma secuencia', () => {
  const ctxA = createDeterministicContext(77777);
  const ctxB = createDeterministicContext(77777);
  const seqA = Array.from({ length: 8 }, () => ctxA.gameplayRng.int(1, 1000));
  const seqB = Array.from({ length: 8 }, () => ctxB.gameplayRng.int(1, 1000));
  assert.deepEqual(seqA, seqB);
  assert.equal(ctxA.nextId('ent'), ctxB.nextId('ent'));

  const ctxDiff = createDeterministicContext(88888);
  const seqDiff = Array.from({ length: 8 }, () => ctxDiff.gameplayRng.int(1, 1000));
  assert.notDeepEqual(seqA, seqDiff);
});

test('5. Mundo Abierto D.3/D.4: chunks, streaming progresivo, niveles N1..N4, HLOD, oclusión y SaveState', () => {
  const proj = makeOpenWorldSample();
  const scene = proj.scenes[0];
  const cfg = scene.worldStreaming!;

  const manifest = partitionSceneIntoChunks(scene, cfg);
  assert.ok(manifest.chunks.size >= 3, 'Debe particionar la escena en múltiples chunks');

  const hlods = buildHlodProxiesForChunks(scene, manifest);
  assert.ok(hlods.size >= 2, 'Debe generar proxies HLOD para grupos de edificios distantes');

  assert.equal(resolveActivityLevel(10, cfg), 'near');
  assert.equal(resolveActivityLevel(cfg.loadRadius - 5, cfg), 'medium');
  assert.equal(resolveActivityLevel(cfg.unloadRadius + 10, cfg), 'far');
  assert.equal(resolveActivityLevel(cfg.farProxyRadius + 40, cfg), 'unloaded');

  assert.equal(getActivationPolicy('near').scripts, 'every_frame');
  assert.equal(getActivationPolicy('medium').scriptStride, 3);
  assert.equal(getActivationPolicy('far').physics, 'sleeping');
  assert.equal(getActivationPolicy('unloaded').render, 'none');

  const ctrl = createStreamingControllerState(scene, manifest);
  const saveState = createWorldSaveState();
  for (let i = 0; i < 4; i++) {
    stepStreamingController(
      ctrl,
      scene,
      manifest,
      {
        playerPos: { x: 0, y: 1, z: 8 },
        cameraPos: { x: 0, y: 6, z: 16 },
        cameraForwardXZ: { x: 0, z: -1 },
        velocityXZ: { x: 0, z: -4 },
      },
      cfg,
      saveState
    );
  }
  const report = buildStreamingProfilerReport(scene, proj.assets, manifest, ctrl);
  assert.ok(report.loadedChunks >= 1);
  assert.ok(report.activeNear >= 1);
  assert.ok(report.hlodProxyCount >= 2);

  // Oclusión por volumen oclusor entre cámara y objetivo
  const occluded = isTargetOccluded(
    { x: 28, y: 2, z: -10 },
    { x: 28, y: 2, z: -40 },
    { x: 1, y: 1, z: 1 },
    scene.occlusionVolumes ?? []
  );
  assert.equal(occluded, true);

  // WorldSaveState persiste destruidos y posiciones al aplicar
  const westTower = scene.objects.find((o) => o.name === 'Ciudadela_Oeste')!;
  recordDestroyedEntity(saveState, westTower.id);
  recordObjectTransform(saveState, 'Explorador_3D_id', 15, 2, -9);
  const serializedSave = serializeWorldSaveState(saveState);
  assert.ok(serializedSave.destroyedIds.includes(westTower.id));
  const restoredScene = applyWorldSaveStateToScene(scene, saveState);
  assert.equal(restoredScene.objects.find((o) => o.id === westTower.id)?.visible, false);

  // Memoria por perfil móvil vs PC
  const mobileRes = evaluateMemoryResidency(
    { ...scene, worldStreaming: { ...cfg, budgetProfile: 'mobile' } },
    proj.assets,
    ctrl
  );
  assert.equal(mobileRes.profile, 'mobile');

  // Verificar que createSimulation3DState realmente suspende scripts/IA de entidades lejanas y ejecuta cercanas
  let nearTicks = 0;
  let farTicks = 0;
  const nearObj = scene.objects.find((o) => o.name === 'Explorador_3D')!;
  const farObj = scene.objects.find((o) => o.name === 'Fuerte_Este')!;
  nearObj.scriptBindings = [{ id: 'sb_near', scriptId: 'sc_near', enabled: true, params: {} }];
  farObj.scriptBindings = [{ id: 'sb_far', scriptId: 'sc_far', enabled: true, params: {} }];
  const testScripts: NexusScriptAsset[] = [
    {
      id: 'sc_near',
      name: 'NearCounter',
      kind: 'script',
      code: 'export function onUpdate(self, dt, nexus) { nexus.vars.set("nearTicks", Number(nexus.vars.get("nearTicks") || 0) + 1); }',
      updatedAt: 1,
    },
    {
      id: 'sc_far',
      name: 'FarCounter',
      kind: 'script',
      code: 'export function onUpdate(self, dt, nexus) { nexus.vars.set("farTicks", Number(nexus.vars.get("farTicks") || 0) + 1); }',
      updatedAt: 1,
    },
  ];
  const sim3d = createSimulation3DState(scene, testScripts);
  for (let i = 0; i < 6; i++) {
    sim3d.step({
      dt: 1 / 60,
      heldKeys: new Set(),
      justPressedKeys: new Set(),
    });
  }
  nearTicks = Number(sim3d.variables.get('nearTicks') ?? 0);
  farTicks = Number(sim3d.variables.get('farTicks') ?? 0);
  assert.ok(nearTicks >= 5, 'Entidad cercana (N1) debe ejecutar su script cada frame');
  assert.equal(farTicks, 0, 'Entidad descargada/lejana (N3/N4) no debe ejecutar scripts');
});

test('6. Cámara Open-World D.5: CameraVolume3D prioridad + blend, KeyV shoulder swap, terrainMinClearance y multiplayer framing', () => {
  const volumes: CameraVolume3D[] = [
    {
      id: 'vol_low',
      name: 'Exterior',
      enabled: true,
      priority: 5,
      zoneType: 'exterior',
      mode: 'third_person_orbit',
      blendDurationSec: 0.4,
      bounds: { minX: -50, maxX: 50, minY: -5, maxY: 20, minZ: -50, maxZ: 50 },
      distance: 10,
    },
    {
      id: 'vol_high',
      name: 'Interior',
      enabled: true,
      priority: 20,
      zoneType: 'interior',
      mode: 'smooth_follow',
      blendDurationSec: 0.5,
      bounds: { minX: 10, maxX: 40, minY: -5, maxY: 15, minZ: -40, maxZ: -10 },
      distance: 4.5,
      fov: 54,
    },
  ];

  const picked = evaluateActiveCameraVolumes(volumes, { x: 25, y: 2, z: -25 }, false);
  assert.equal(picked?.id, 'vol_high');

  const camState = createInitialSmartCameraState('cam_1', { x: 0, y: 5, z: 12 });
  const baseCfg: SmartCameraConfig = {
    isMainCamera: true,
    mode: 'third_person_orbit',
    dampingFactor: 0.2,
    lookAhead: 1,
    offsetX: 0,
    offsetY: 4,
    offsetZ: 8,
    shoulderOffsetX: 0.8,
    shoulderOffsetY: 0.4,
    shoulderSide: 1,
    allowShoulderSwap: true,
    terrainMinClearance: 2.0,
    distance: 8,
    pitchMinDeg: -35,
    pitchMaxDeg: 45,
    fov: 62,
    deadzoneW: 100,
    deadzoneH: 80,
    collideWithWalls: true,
    useBounds: false,
    boundsMinX: -100,
    boundsMaxX: 100,
    boundsMinY: -10,
    boundsMaxY: 80,
    boundsMinZ: -100,
    boundsMaxZ: 100,
  };

  const resolved = resolveCameraConfigWithVolume(camState, baseCfg, picked);
  assert.equal(resolved.mode, 'smooth_follow');
  assert.equal(resolved.distance, 4.5);
  assert.ok(camState.transitionDuration >= 0.49);

  // Guard de altura sobre terreno (terrainMinClearance = 2.0 sobre piso en y=10 => posY >= 12)
  const clearanceState = createInitialSmartCameraState('cam_clr', { x: 0, y: 0, z: 8 });
  clearanceState.orbitPitchDeg = 35; // mirando hacia arriba para bajar cámara cerca del suelo
  for (let i = 0; i < 15; i++) {
    stepSmartCamera3D(
      clearanceState,
      baseCfg,
      { x: 0, y: 1, z: 8 },
      { x: 0, y: 11, z: 0 },
      [],
      1 / 60,
      () => 10
    );
  }
  assert.ok(clearanceState.posY >= 12 - 0.05, 'La cámara no debe hundirse debajo de terrainMinClearance');

  // KeyV shoulder swap en sim3d
  const proj = makeOpenWorldSample();
  const sim3d = createSimulation3DState(proj.scenes[0], []);
  const sideBefore = sim3d.cameraState.shoulderSide ?? 1;
  sim3d.step({
    dt: 1 / 60,
    heldKeys: new Set(),
    justPressedKeys: new Set(['KeyV']),
  });
  assert.equal(sim3d.cameraState.shoulderSide, -sideBefore);

  // Encuadre adaptativo multijugador local
  const framing = computeAdaptiveMultiplayerFraming(
    [
      { x: -10, y: 1, z: 0 },
      { x: 10, y: 1, z: 0 },
    ],
    8,
    40
  );
  assert.ok(framing);
  assert.equal(framing.center.x, 0);
  assert.ok(framing.recommendedDistance > 16);
});

test('7. Barra de Comandos 2.0: DSL + JSON, rechazo estricto de ambigüedad, confirm destructivo y Undo en 1 paso', () => {
  const proj = makeOpenWorldSample();
  const sceneId = proj.activeSceneId;

  // DSL: crear + renombrar @lastCreated + streaming
  const dslText = [
    'crear cubo nombre=Torre_Vigia x=14 y=3 z=-8 sx=2 sy=6 sz=2 color=#22d3ee tag=torre',
    'renombrar @lastCreated Torre_Norte',
    'variable sector_activo = true',
  ].join('\n');

  const plan = planCommandBarInput(proj, sceneId, [], dslText, 'dsl');
  assert.equal(plan.valid, true);
  assert.equal(plan.requiresDestructiveConfirm, false);
  assert.equal(plan.diffs.length, 3);

  let hist = createHistoryState(proj);
  const applied = applyCommandPlan(proj, sceneId, [], plan, false);
  hist = pushHistory(hist, applied.nextProject);
  assert.ok(hist.present.scenes[0].objects.some((o) => o.name === 'Torre_Norte'));
  assert.ok(hist.present.variables?.some((v) => v.name === 'sector_activo' && v.initialValue === true));
  assert.equal(hist.present.commandHistory?.[0]?.commandText, dslText);

  // Deshacer en 1 solo paso restaura el proyecto original completo
  hist = undoHistory(hist);
  assert.equal(hist.present.scenes[0].objects.some((o) => o.name === 'Torre_Norte'), false);
  assert.equal(hist.present.variables?.some((v) => v.name === 'sector_activo'), false);

  // Rechazo estricto de nombres ambiguos
  const withDup = structuredClone(proj);
  const c1 = createGameObject('mesh_3d', withDup.scenes[0].objects, { name: 'CajaDup' });
  const c2 = createGameObject('mesh_3d', withDup.scenes[0].objects, { name: 'CajaDup' });
  withDup.scenes[0].objects.push(c1, c2);
  const ambigPlan = planCommandBarInput(withDup, sceneId, [], 'mover CajaDup dx=5', 'dsl');
  assert.equal(ambigPlan.valid, false);
  assert.ok(ambigPlan.errors.some((e) => /ambigua/i.test(e)));

  // Operación destructiva requiere confirmación explícita
  const jsonDelete = JSON.stringify({ ops: [{ op: 'remove_object', target: 'Todo_Terreno' }] });
  const delPlan = planCommandBarInput(proj, sceneId, [], jsonDelete, 'json');
  assert.equal(delPlan.valid, true);
  assert.equal(delPlan.requiresDestructiveConfirm, true);
  assert.throws(() => applyCommandPlan(proj, sceneId, [], delPlan, false), /confirmación/i);
  const delApplied = applyCommandPlan(proj, sceneId, [], delPlan, true);
  assert.equal(
    delApplied.nextProject.scenes[0].objects.some((o) => o.name === 'Todo_Terreno'),
    false
  );
});
