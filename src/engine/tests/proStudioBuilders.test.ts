import test from 'node:test';
import assert from 'node:assert/strict';
import JSZip from 'jszip';
import type { NexusProject } from '../../project/models/project';
import type { SceneData, SplinePathData, Vehicle4WConfig } from '../core/types';
import {
  applyLocalGravityZone,
  createVehicle4WState,
  getBoatPontoonLocalOffsets,
  shouldStepVehiclePhysics,
  stepBoatVehicle,
  stepPlaneVehicle,
  stepSpaceshipVehicle,
  stepVehicle4W,
} from '../physics/softBodyPhysics';
import { buildCompositeVehicleObjects } from '../three3d/vehiclePrefabs';
import { generatePbrMapsFromRgba, PBR_MATERIAL_PRESETS } from '../three3d/pbrGenerator';
import { carveRiverAlongSpline, sampleSpline3D, sculptRoadAlongSpline } from '../three3d/splineTerrain';
import {
  buildWaterTrailRibbonBuffers,
  createRippleRingPool,
  createWaterTrailState,
  evaluateWaterEntityInteractions,
  sampleWaterWaveHeightAt,
  spawnRippleInPool,
  stepRippleRingPool,
  updateWaterTrailPoints,
  type WaterEntityTracker,
} from '../three3d/waterEffects';
import { createSimulation3DState } from '../physics3d/physics3d';
import { generateNexus3DRuntimeJs } from '../../export/html5/threeRuntimeTemplate';
import { compileProjectToHtml5Zip } from '../../export/html5/html5Compiler';

test('Multi-mode vehicles: Car grip, Moto lean, Boat pontoons (4/6/12), Plane lift, Spaceship 6DOF + Local Gravity + LOD', () => {
  const carCfg: Vehicle4WConfig = {
    enabled: true,
    vehicleKind: 'car',
    wheelRadius: 0.42,
    suspensionRestLen: 0.65,
    suspensionStiffness: 38,
    suspensionDamping: 5,
    maxTorque: 13,
    maxSpeed: 16,
    maxSteerDeg: 28,
    wheelBase: 2.5,
    trackWidth: 1.92,
    driveType: 'awd',
    gripFactor: 0.85,
  };
  const car = createVehicle4WState(0, 1.5, 0, 0, carCfg);
  for (let i = 0; i < 30; i++) stepVehicle4W(car, carCfg, 1, 0.4, 0.016, () => 0);
  assert.ok(car.z > 0.2, 'Auto acelera hacia adelante');
  assert.ok(car.speedForward > 2 && car.speedForward < 9, 'Aceleración progresiva realista sin disparo instantáneo');
  assert.ok(car.yawRad < -0.01, 'Girar a la derecha (+steer) disminuye yawRad hacia -X (derecha)');
  assert.ok(car.wheels[0].steerAngleRad > 0 && -car.wheels[0].steerAngleRad < 0, 'Signo visual -steerAngleRad apunta hacia la derecha');
  assert.ok(car.rollRad < 0, 'Auto inclina suavemente su carrocería hacia afuera en curva a la derecha');

  // Dirección sensible a velocidad: a máxima velocidad el ángulo máximo de giro es menor que a baja velocidad
  const lowSpdCar = createVehicle4WState(0, 1.0, 0, 0, carCfg);
  lowSpdCar.speedForward = 2;
  for (let i = 0; i < 40; i++) stepVehicle4W(lowSpdCar, carCfg, 0.1, 1, 0.016, () => 0);
  const highSpdCar = createVehicle4WState(0, 1.0, 0, 0, carCfg);
  highSpdCar.speedForward = 16;
  for (let i = 0; i < 40; i++) stepVehicle4W(highSpdCar, carCfg, 1, 1, 0.016, () => 0);
  assert.ok(
    Math.abs(highSpdCar.steerAngleRad) < Math.abs(lowSpdCar.steerAngleRad) * 0.65,
    'Dirección sensible a la velocidad reduce ángulo de giro a alta velocidad'
  );

  // Frenado antes de reversa
  const brakingCar = createVehicle4WState(0, 1.0, 0, 0, carCfg);
  brakingCar.speedForward = 10;
  for (let i = 0; i < 15; i++) stepVehicle4W(brakingCar, carCfg, -1, 0, 0.016, () => 0);
  assert.ok(brakingCar.speedForward >= 0 && brakingCar.speedForward < 6, 'Frena progresivamente hacia 0 antes de entrar en reversa');

  const motoCfg: Vehicle4WConfig = { ...carCfg, vehicleKind: 'moto', maxTorque: 15, maxSpeed: 19 };
  const moto = createVehicle4WState(0, 1.5, 0, 0, motoCfg);
  for (let i = 0; i < 30; i++) stepVehicle4W(moto, motoCfg, 1, 0.8, 0.016, () => 0);
  assert.ok(moto.rollRad > 0.02, 'Moto se inclina hacia adentro de la curva');

  assert.equal(getBoatPontoonLocalOffsets('speedboat', 2.2, 4.4).length, 4);
  assert.equal(getBoatPontoonLocalOffsets('medium', 2.8, 6.2).length, 6);
  assert.equal(getBoatPontoonLocalOffsets('ship', 4.8, 12.0).length, 12);

  const boatCfg: Vehicle4WConfig = {
    ...carCfg,
    vehicleKind: 'boat',
    boatSize: 'ship',
    trackWidth: 4.8,
    wheelBase: 12.0,
  };
  const boat = createVehicle4WState(0, 0.5, 0, 0, boatCfg);
  assert.equal(boat.pontoons.length, 12);
  for (let i = 0; i < 30; i++) stepBoatVehicle(boat, boatCfg, 1, 0.3, 0.016, (wx) => Math.sin(wx * 0.5) * 0.2);
  assert.ok(boat.pontoons.some((p) => p.submerged > 0), 'Bote detecta agua en sus pontones');
  assert.ok(boat.propellerSpinRad > 0.5, 'Hélice de bote gira');

  const fighterCfg: Vehicle4WConfig = { ...carCfg, vehicleKind: 'plane', planeStyle: 'fighter', maxSpeed: 55 };
  const fighter = createVehicle4WState(0, 8, 0, 0, fighterCfg);
  for (let i = 0; i < 20; i++) stepPlaneVehicle(fighter, fighterCfg, 1, 0.6, 0.8, 0.2, 0.016, () => 0);

  const airlinerCfg: Vehicle4WConfig = { ...carCfg, vehicleKind: 'plane', planeStyle: 'airliner', maxSpeed: 38 };
  const airliner = createVehicle4WState(0, 8, 0, 0, airlinerCfg);
  for (let i = 0; i < 20; i++) stepPlaneVehicle(airliner, airlinerCfg, 1, 0.6, 0.8, 0.2, 0.016, () => 0);
  assert.ok(Math.abs(fighter.rollRad) > Math.abs(airliner.rollRad), 'Caza alabea más rápido que avión comercial');

  const shipCfg: Vehicle4WConfig = {
    ...carCfg,
    vehicleKind: 'spaceship',
    maxTorque: 30,
    maxSpeed: 40,
    localGravityBox: { enabled: true, sx: 10, sy: 5, sz: 14 },
  };
  const ship = createVehicle4WState(0, 20, 0, 0, shipCfg);
  stepSpaceshipVehicle(ship, shipCfg, 1, 0.5, 0.8, 0.2, 0, 0, 0.03);
  const deckActor = { x: ship.prevX, y: ship.prevY - 1.5, z: ship.prevZ };
  const lg = applyLocalGravityZone(ship, shipCfg.localGravityBox, deckActor, 0.9);
  assert.equal(lg.inside, true);
  assert.ok(lg.nextZ > deckActor.z, 'Zona de gravedad local traslada al pasajero con la nave');

  assert.equal(shouldStepVehiclePhysics(ship, { x: 0, y: 0, z: 0 }, 80), true);
  assert.equal(shouldStepVehiclePhysics(ship, { x: 500, y: 0, z: 500 }, 80), false);
});

test('Composite Vehicle Builder generates linked parent-child hierarchy and Tecla E mechanic', () => {
  const carBuild = buildCompositeVehicleObjects(
    {
      name: 'DeportivoX',
      kind: 'car',
      cameraEnabled: true,
      createEnterMechanic: true,
      playerObjectId: 'player_1',
    },
    []
  );
  const carParent = carBuild.objects.find((o) => o.id === carBuild.parentId)!;
  assert.equal(carParent.type, 'container');
  assert.deepEqual(
    { sx: carParent.transform3d?.sx, sy: carParent.transform3d?.sy, sz: carParent.transform3d?.sz },
    { sx: 1, sy: 1, sz: 1 },
    'La raíz del vehículo compuesto debe tener escala uniforme (1,1,1) para no deformar ruedas hijas'
  );
  assert.ok(carParent.physics3d?.halfExtents && carParent.physics3d.halfExtents.z > 1.5);
  assert.ok(carParent.vehicle?.enabled);
  assert.equal(carParent.vehicle?.vehicleKind, 'car');
  assert.ok(carParent.vehicle?.parts?.wheelFL);
  assert.ok(carParent.vehicle?.parts?.wheelFR);
  assert.ok(carParent.vehicle?.parts?.wheelRL);
  assert.ok(carParent.vehicle?.parts?.wheelRR);
  assert.ok(carParent.vehicle?.parts?.cameraId);
  const carChildren = carBuild.objects.filter((o) => o.parentId === carParent.id);
  assert.ok(carChildren.some((c) => c.name.includes('Chasis') && c.physics3d?.enabled === false), 'Incluye malla Chasis hija sin colisión interna');
  assert.ok(carChildren.length >= 6, 'Incluye chasis + 4 ruedas + cámara vinculada');
  assert.equal(carBuild.addedMechanic?.actions[0]?.type, 'vehicle.enterExit');

  const boatBuild = buildCompositeVehicleObjects({ name: 'Lancha', kind: 'boat', boatSize: 'medium', cameraEnabled: true }, []);
  const boatParent = boatBuild.objects.find((o) => o.id === boatBuild.parentId)!;
  assert.equal(boatParent.vehicle?.boatSize, 'medium');
  assert.ok(boatParent.vehicle?.parts?.propellerId);

  const planeBuild = buildCompositeVehicleObjects({ name: 'Jet', kind: 'plane', planeStyle: 'fighter', cameraEnabled: false }, []);
  const planeParent = planeBuild.objects.find((o) => o.id === planeBuild.parentId)!;
  assert.equal(planeParent.vehicle?.vehicleKind, 'plane');
  assert.ok(planeParent.vehicle?.parts?.landingGearId);
  assert.ok(planeParent.vehicle?.parts?.propellerId);
  assert.ok(planeBuild.objects.some((o) => o.parentId === planeParent.id && o.name.includes('Alas')));

  const shipBuild = buildCompositeVehicleObjects(
    { name: 'Crucero', kind: 'spaceship', cameraEnabled: true, localGravityBox: { enabled: true, sx: 14, sy: 6, sz: 22 } },
    []
  );
  const shipParent = shipBuild.objects.find((o) => o.id === shipBuild.parentId)!;
  assert.equal(shipParent.vehicle?.localGravityBox?.enabled, true);
});

test('PBR Sobel generator produces valid tangent-space normal maps and gradient roughness', () => {
  assert.equal(PBR_MATERIAL_PRESETS.length, 6);
  const w = 16, h = 16;
  const rgba = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const idx = (y * w + x) * 4;
      const bright = x >= 8 ? 240 : 20;
      rgba[idx] = bright;
      rgba[idx + 1] = bright;
      rgba[idx + 2] = bright;
      rgba[idx + 3] = 255;
    }
  }
  const out = generatePbrMapsFromRgba(rgba, w, h, { strength: 2.5 });
  assert.equal(out.normalRgba.length, w * h * 4);
  assert.equal(out.roughnessRgba.length, w * h * 4);

  // Centro plano (x=2): normal apunta en +Z (~255 en canal azul)
  const flatIdx = (8 * w + 2) * 4;
  assert.ok(out.normalRgba[flatIdx + 2] > 240, 'Zona plana mantiene normal +Z');
  // Borde vertical x=7..8: gradiente fuerte en canal R (normal X)
  const edgeIdx = (8 * w + 8) * 4;
  assert.notEqual(out.normalRgba[edgeIdx], 128, 'Filtro Sobel detecta escalón en canal R');
});

test('Spline 3D interpolation, road flattening + splat weight painting, and river carving', () => {
  const spline: SplinePathData = {
    id: 'sp_road',
    name: 'Ruta 1',
    closed: false,
    width: 4,
    kind: 'road',
    points: [
      { x: -10, y: 1.5, z: 0 },
      { x: 0, y: 1.5, z: 0 },
      { x: 10, y: 1.5, z: 0 },
    ],
  };
  const mid = sampleSpline3D(spline.points, false, 0.5);
  assert.ok(Math.abs(mid.x) < 0.05 && Math.abs(mid.y - 1.5) < 0.05);

  const seg = 16;
  const count = (seg + 1) * (seg + 1);
  const heights = new Array(count).fill(4.0);
  const splat = new Array(count * 4).fill(0).map((_, i) => (i % 4 === 0 ? 1 : 0));
  const terrainObj = {
    id: 'ter_1',
    name: 'Terreno',
    type: 'mesh_3d' as const,
    visible: true,
    transform: { x: 0, y: 0, rotation: 0, scaleX: 1, scaleY: 1, width: 100, height: 100 },
    transform3d: { x: 0, y: 0, z: 0, rx: 0, ry: 0, rz: 0, sx: 1, sy: 1, sz: 1 },
    mesh3d: {
      shape: 'terrain' as const,
      color: '#4ade80',
      metalness: 0.04,
      roughness: 0.88,
      castShadow: true,
      receiveShadow: true,
      terrainData: { width: 32, depth: 32, segments: seg, seed: 1, amplitude: 4, heights, splatWeights: splat },
    },
  };

  const roadTer = sculptRoadAlongSpline(terrainObj as any, spline, { roadChannel: 2 });
  assert.ok(roadTer, 'sculptRoadAlongSpline devuelve TerrainData');
  const centerIdx = 8 * (seg + 1) + 8;
  assert.ok(Math.abs(roadTer!.heights[centerIdx] - 1.5) < 0.05, 'Aplana altura a 1.5m en centro de ruta');
  assert.ok(roadTer!.splatWeights[centerIdx * 4 + 2] > 0.7, 'Pinta peso de canal carretera en splat');

  const riverRes = carveRiverAlongSpline(terrainObj as any, { ...spline, id: 'sp_riv', kind: 'river' }, { depth: 2.5 });
  assert.ok(riverRes, 'carveRiverAlongSpline devuelve terreno + agua');
  assert.ok(riverRes!.terrainData.heights[centerIdx] < 0, 'Excava lecho del río por debajo del nivel original');
  assert.ok(riverRes!.waterConfig.width >= 20);
});

test('Water wave height, wake ribbon trail, pooled ripples, and 0.25s entity interaction cadence', () => {
  const water = {
    id: 'water_1',
    x: 0,
    y: 0,
    z: 0,
    config: {
      width: 40,
      depth: 40,
      flowX: 0.5,
      flowZ: 0,
      waveAmplitude: 0.2,
      waveSpeed: 1.8,
      shallowColor: '#38bdf8',
      deepColor: '#0369a1',
      foamIntensity: 0.8,
      interactingEntities: ['boat_1'],
      enableWakeTrail: true,
    },
  };
  const hInside = sampleWaterWaveHeightAt(water, 2, 3, 1.0);
  const hOutside = sampleWaterWaveHeightAt(water, 50, 0, 1.0);
  assert.ok(hInside !== null && Math.abs(hInside) <= 0.35);
  assert.equal(hOutside, null);

  const trail = createWaterTrailState(12, 2.0);
  updateWaterTrailPoints(trail, 0, 0, 0, 0, 1, 5, 0.8, 0.1);
  updateWaterTrailPoints(trail, 0, 0, 2, 0, 1, 5, 0.8, 0.1);
  const posArr = new Float32Array(12 * 6 * 3);
  const alphaArr = new Float32Array(12 * 6);
  const vCount = buildWaterTrailRibbonBuffers(trail, posArr, alphaArr);
  assert.equal(vCount, 6, 'Cinta Ribbon genera 6 vértices (2 triángulos) entre 2 nodos');

  const pool = createRippleRingPool(6);
  spawnRippleInPool(pool, 1, 0, 2, 1.0);
  assert.equal(pool[0].active, true);
  stepRippleRingPool(pool, 0.5);
  assert.ok(pool[0].scale > 1.4 && pool[0].opacity < 0.5, 'Onda crece de 0.1->3.0 y desvanece');
  stepRippleRingPool(pool, 0.6);
  assert.equal(pool[0].active, false, 'Onda vuelve al pool al expirar');

  const trackers = new Map<string, WaterEntityTracker>();
  const splashEv = evaluateWaterEntityInteractions(
    water,
    [{ id: 'boat_1', x: 0, y: -0.1, z: 0, halfY: 0.5, speed: 3 }, { id: 'ignored_cube', x: 1, y: -0.1, z: 1, halfY: 0.5, speed: 3 }],
    trackers,
    0.1,
    0.016
  );
  assert.equal(splashEv.length, 1);
  assert.equal(splashEv[0].kind, 'splash');
  assert.equal(splashEv[0].entityId, 'boat_1', 'Solo entidades permitidas generan eventos');

  const noRippleYet = evaluateWaterEntityInteractions(
    water,
    [{ id: 'boat_1', x: 0, y: -0.1, z: 0.5, halfY: 0.5, speed: 3 }],
    trackers,
    0.2,
    0.1
  );
  assert.equal(noRippleYet.length, 0);

  const rippleAtQuarterSec = evaluateWaterEntityInteractions(
    water,
    [{ id: 'boat_1', x: 0, y: -0.1, z: 1.5, halfY: 0.5, speed: 3 }],
    trackers,
    0.4,
    0.16
  );
  assert.equal(rippleAtQuarterSec.length, 1);
  assert.equal(rippleAtQuarterSec[0].kind, 'ripple');
});

test('E2E Sim3D: Tecla E mounts player into vehicle, transfers controls, and dismounts on second E', () => {
  const build = buildCompositeVehicleObjects(
    {
      name: 'AutoPrueba',
      kind: 'car',
      cameraEnabled: true,
      createEnterMechanic: true,
      playerObjectId: 'player_e2e',
      spawnPos: { x: 2, y: 1.2, z: 0 },
    },
    []
  );
  const playerObj = {
    id: 'player_e2e',
    name: 'Jugador',
    type: 'mesh_3d' as const,
    visible: true,
    transform: { x: 0, y: 0, rotation: 0, scaleX: 1, scaleY: 1, width: 1, height: 1 },
    transform3d: { x: 2, y: 1.2, z: 0.5, rx: 0, ry: 0, rz: 0, sx: 1, sy: 1.8, sz: 1 },
    mesh3d: { shape: 'capsule' as const, color: '#38bdf8', metalness: 0.1, roughness: 0.6, castShadow: true, receiveShadow: true },
    physics3d: { enabled: true, bodyType: 'dynamic' as const, shape: 'box' as const, mass: 1, gravityScale: 1, restitution: 0, friction: 0.5 },
    components: [{ id: 'c_p', type: 'player_3d', enabled: true, config: { speed: 7 } }],
  };
  const scene: SceneData = {
    id: 'sc_e2e',
    name: 'Test3D',
    backgroundColor: '#0f172a',
    gridVisible: true,
    gridSize: 32,
    snapToGrid: false,
    objects: [playerObj as any, ...build.objects],
    mechanics: build.addedMechanic ? [build.addedMechanic] : [],
  };

  const sim = createSimulation3DState(scene);
  // Presionar KeyE para subir al auto
  sim.step({ dt: 0.016, heldKeys: new Set(['KeyE']), justPressedKeys: new Set(['KeyE']) });
  const pState = sim.objects.find((o) => o.id === 'player_e2e')!;
  const vState = sim.objects.find((o) => o.id === build.parentId)!;
  assert.equal(pState.visible, false, 'Jugador se oculta al montar el vehículo');

  // Acelerar con KeyW durante 20 frames -> vehículo se mueve adelante
  const zBefore = vState.t3.z;
  for (let i = 0; i < 20; i++) {
    sim.step({ dt: 0.016, heldKeys: new Set(['KeyW']), justPressedKeys: new Set() });
  }
  assert.ok(vState.t3.z > zBefore + 0.1, 'Vehículo avanza cuando jugador está montado presionando W');

  // Presionar KeyE de nuevo -> jugador desciende a un lado del vehículo
  sim.step({ dt: 0.016, heldKeys: new Set(['KeyE']), justPressedKeys: new Set(['KeyE']) });
  assert.equal(pState.visible, true, 'Jugador vuelve a ser visible al bajar');
  assert.ok(Math.abs(pState.t3.z - vState.t3.z) < 4, 'Jugador aparece junto al vehículo');
});

test('HTML5 3D export runtime parses cleanly with new Function and includes Pro Studio features', async () => {
  const runtimeJs = generateNexus3DRuntimeJs({
    portal: 'web',
    scaleMode: 'letterbox',
    touchControls: true,
    showFullscreenButton: true,
  });
  assert.doesNotThrow(() => new Function(runtimeJs), 'Runtime 3D exportado debe ser JS sintácticamente válido');
  assert.ok(runtimeJs.includes("act.type === 'vehicle.enterExit'"), 'Incluye mecánica vehicle.enterExit');
  assert.ok(runtimeJs.includes('stepBoatVehicle') && runtimeJs.includes('stepPlaneVehicle') && runtimeJs.includes('stepSpaceshipVehicle'), 'Incluye física de Botes, Aviones y Naves 6DOF');
  assert.ok(runtimeJs.includes('sampleSpline3D'), 'Incluye curvas Splines 3D');
  assert.ok(runtimeJs.includes('MeshPhysicalMaterial'), 'Incluye PBR Clearcoat/Transmission');

  const boatBuild = buildCompositeVehicleObjects({ name: 'Lancha', kind: 'boat', cameraEnabled: true, createEnterMechanic: true }, []);
  const project: NexusProject = {
    id: 'proj_3d_pro',
    formatVersion: '1.0.0',
    name: 'Pro Studio 3D',
    createdAt: 1000,
    updatedAt: 2000,
    mode: '3d',
    settings: { width: 1280, height: 720, orientation: 'horizontal', backgroundColor: '#0f172a' },
    activeSceneId: 's3d',
    scenes: [
      {
        id: 's3d',
        name: 'Oceano',
        backgroundColor: '#0f172a',
        gridVisible: true,
        gridSize: 32,
        snapToGrid: false,
        splines3d: [{ id: 'sp1', name: 'Ruta', closed: false, width: 4, kind: 'patrol', points: [{ x: 0, y: 0, z: 0 }, { x: 10, y: 0, z: 10 }] }],
        objects: boatBuild.objects,
        mechanics: boatBuild.addedMechanic ? [boatBuild.addedMechanic] : [],
      },
    ],
    assets: [],
  };
  const zipRes = await compileProjectToHtml5Zip(
    project,
    new Map(),
    { portal: 'web', scaleMode: 'letterbox', touchControls: false, showFullscreenButton: true },
    '',
    '/* three bundle mock */'
  );
  const zip = await JSZip.loadAsync(await zipRes.blob.arrayBuffer());
  const exportedRuntime = await zip.file('js/nexus-3d-runtime.js')!.async('string');
  assert.doesNotThrow(() => new Function(exportedRuntime));
  assert.ok(exportedRuntime.includes('vehicleAnimatedPart'));
});
