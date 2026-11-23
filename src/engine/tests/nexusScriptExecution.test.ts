import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import JSZip from 'jszip';
import {
  compileNexusScript,
  extractScriptParamsSchema,
  validateScriptSyntax,
} from '../scripting/scriptRuntime';
import { createGameObject } from '../objects/factory';
import {
  createSimulationState,
  stepSimulationFixed,
  type InputState,
} from '../runtime/stepGameSimulation';
import { createSimulation3DState } from '../physics3d/physics3d';
import type { SceneData } from '../core/types';
import type { NexusScriptAsset } from '../../project/models/project';
import { buildProjectFromTemplate } from '../../project/templates/projectTemplates';
import { compileProjectToHtml5Zip } from '../../export/html5/html5Compiler';

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

function makeScript(id: string, name: string, code: string): NexusScriptAsset {
  return {
    id,
    name,
    kind: 'script',
    code,
    updatedAt: Date.now(),
  };
}

test('compileNexusScript soporta export default objeto, clase, función, ESM nombrado, función clásica y @param', () => {
  const sObj = makeScript(
    's_obj',
    'ModObj.js',
    `import { algo } from './ficticio';
// @param extra:number=7
export default {
  params: { speed: 150, active: true },
  onStart(self, nexus) { self.data.ok = true; },
  onUpdate(self, dt, nexus) { self.x += self.params.speed * dt; },
  onCollisionEnter(self, otro, nexus) { nexus.vars.add('hits', 1); }
};`
  );
  assert.equal(validateScriptSyntax(sObj.code).valid, true);
  const cObj = compileNexusScript(sObj);
  assert.equal(cObj.error, null);
  assert.equal(typeof cObj.hooks.onStart, 'function');
  assert.equal(typeof cObj.hooks.onUpdate, 'function');
  assert.equal(typeof cObj.hooks.onCollisionEnter, 'function');
  assert.equal(cObj.hooks.params?.speed, 150);
  assert.equal(cObj.hooks.params?.extra, 7);
  const schemaObj = extractScriptParamsSchema(sObj);
  assert.ok(schemaObj.some((p) => p.key === 'speed' && p.defaultValue === 150));
  assert.ok(schemaObj.some((p) => p.key === 'extra' && p.defaultValue === 7));

  const sClass = makeScript(
    's_cls',
    'ModClass.js',
    `export default class BossAI {
  constructor() { this.factor = 2; }
  onUpdate(self, dt) { self.x += 10 * this.factor * dt; }
}`
  );
  const cClass = compileNexusScript(sClass);
  assert.equal(cClass.error, null);
  assert.equal(typeof cClass.hooks.onUpdate, 'function');

  const sNamed = makeScript(
    's_named',
    'ModNamed.js',
    `export const params = { step: 5 };
export const onUpdate = (self, dt) => { self.y += self.params.step; };
export function customFn(self, n) { self.data.v = n; }`
  );
  const cNamed = compileNexusScript(sNamed);
  assert.equal(cNamed.error, null);
  assert.equal(cNamed.hooks.params?.step, 5);
  assert.equal(typeof cNamed.hooks.onUpdate, 'function');
  assert.equal(typeof cNamed.hooks.customFn, 'function');

  const sClassic = makeScript(
    's_classic',
    'ModClassic.js',
    `// @param label:string=Hola
function onStart(self) { self.data.label = self.params.label; }
function onUpdate(self, dt) { self.rotation += 45 * dt; }`
  );
  const cClassic = compileNexusScript(sClassic);
  assert.equal(cClassic.error, null);
  assert.equal(cClassic.hooks.params?.label, 'Hola');
  assert.equal(typeof cClassic.hooks.onStart, 'function');
  assert.equal(typeof cClassic.hooks.onUpdate, 'function');
});

test('2D runtime ejecuta scripts de escena vacía, objeto (export default + onCollisionEnter simétrico), spawnPrefab, script.call y registra errores', () => {
  const sceneScript = makeScript(
    'sc_scene',
    'SceneController.js',
    `export default {
  onStart(self, nexus) { nexus.vars.set('scene_started', 1); },
  onUpdate(self, dt, nexus) { nexus.vars.add('scene_ticks', 1); },
  ping(self, arg, nexus) { nexus.vars.set('scene_ping', String(arg || 'ok')); }
};`
  );

  // 1) Escena vacía con script de escena
  const emptyScene: SceneData = {
    id: 'empty_sc',
    name: 'Escena Vacía',
    kind: 'level',
    backgroundColor: '#111827',
    gridVisible: true,
    gridSize: 32,
    snapToGrid: false,
    objects: [],
    mechanics: [
      {
        id: 'm_call_scene',
        name: 'Llamar ping escena',
        enabled: true,
        priority: 1,
        trigger: { event: 'scene.start' },
        conditions: [],
        actions: [
          {
            id: 'a1',
            type: 'script.call',
            parameters: { scriptId: 'sc_scene', methodName: 'ping', arg: 'listo' },
          },
        ],
      },
    ],
    scriptIds: ['sc_scene'],
  };
  const emptyState = createSimulationState(emptyScene, [], {
    scripts: [sceneScript],
    stage: { width: 800, height: 600 },
  });
  stepSimulationFixed(emptyState, 1 / 60, makeInput());
  assert.equal(emptyState.variables.get('scene_started'), 1);
  assert.equal(emptyState.variables.get('scene_ticks'), 1);
  assert.equal(emptyState.variables.get('scene_ping'), 'listo');

  // 2) Escena 2D con jugador, moneda con export default y prefab
  const objScript = makeScript(
    'sc_coin',
    'MonedaScript.js',
    `export default {
  params: { vel: 60, valor: 15 },
  onStart(self, nexus) {
    self.data.started = true;
    nexus.vars.add('starts', 1);
  },
  onUpdate(self, dt, nexus) {
    self.x += self.params.vel * dt;
  },
  onCollisionEnter(self, otro, nexus) {
    if (otro.hasTag('Player')) {
      nexus.vars.add('puntos', self.params.valor);
      nexus.particles.burst(self.x, self.y, '#fbbf24', 12);
      nexus.tween(otro, { scaleX: 1.5 }, 0.1);
      nexus.spawnPrefab('pf_bonus', 300, 300);
      self.destroy();
    }
  },
  bonusMethod(self, amount, nexus) {
    nexus.vars.add('puntos', Number(amount || 5));
  }
};`
  );
  const brokenScript = makeScript(
    'sc_err',
    'ConError.js',
    `export default {
  onStart() { throw new Error('fallo controlado'); }
};`
  );

  const player = createGameObject('sprite', [], { name: 'Jugador', x: 100, y: 100, width: 48, height: 48 });
  player.tags = ['Player'];
  player.colliders = [
    {
      id: 'col_p',
      shape: 'box',
      offsetX: 0,
      offsetY: 0,
      width: 48,
      height: 48,
      radius: 24,
      isSensor: false,
      layer: 'Player',
    },
  ];

  const coin = createGameObject('sprite', [player], { name: 'Moneda', x: 110, y: 100, width: 32, height: 32 });
  coin.colliders = [
    {
      id: 'col_c',
      shape: 'box',
      offsetX: 0,
      offsetY: 0,
      width: 32,
      height: 32,
      radius: 16,
      isSensor: true,
      layer: 'Collectible',
    },
  ];
  coin.scriptBindings = [
    { id: 'sb_coin', scriptId: 'sc_coin', enabled: true, params: {} },
    { id: 'sb_err', scriptId: 'sc_err', enabled: true, params: {} },
  ];

  const bonusPrefabObj = createGameObject('sprite', [], { name: 'Bonus', x: 0, y: 0, width: 24, height: 24 });
  bonusPrefabObj.scriptBindings = [
    { id: 'sb_pf', scriptId: 'sc_coin', enabled: true, params: { vel: 120 } },
  ];

  const scene2d: SceneData = {
    id: 'sc_2d',
    name: 'Nivel 1',
    kind: 'level',
    backgroundColor: '#0f172a',
    gridVisible: true,
    gridSize: 32,
    snapToGrid: false,
    objects: [player, coin],
    mechanics: [
      {
        id: 'm_call_obj',
        name: 'Bonus por mecánica',
        enabled: true,
        priority: 1,
        trigger: { event: 'scene.start' },
        conditions: [],
        actions: [
          {
            id: 'ac1',
            type: 'script.call',
            parameters: { scriptId: 'sc_coin', methodName: 'bonusMethod', arg: 5 },
          },
        ],
      },
    ],
    scriptIds: ['sc_scene'],
  };

  const sim = createSimulationState(scene2d, [], {
    stage: { width: 800, height: 600 },
    scripts: [sceneScript, objScript, brokenScript],
    prefabs: [
      {
        id: 'pf_bonus',
        name: 'pf_bonus',
        rootObjectId: bonusPrefabObj.id,
        objects: [bonusPrefabObj],
        createdAt: Date.now(),
      },
    ],
  });

  for (let i = 0; i < 6; i++) {
    stepSimulationFixed(sim, 1 / 60, makeInput());
  }

  // Moneda inició (vel default 60), colisionó con Player (+15) + mechanic script.call (+5) => puntos = 20
  assert.equal(sim.variables.get('puntos'), 20);
  assert.equal(sim.variables.get('starts'), 2); // Moneda + prefab Bonus spawneado
  assert.ok(sim.scene.objects.some((o) => o.name === 'Bonus'));
  assert.ok(sim.particles.length > 0);
  assert.ok((sim.scene.objects.find((o) => o.id === player.id)?.transform.scaleX ?? 1) > 1.01);
  assert.ok(sim.runtimeLogs.some((l) => l.includes('fallo controlado')));
});

test('3D runtime ejecuta scripts de escena, objeto, colisión simétrica, script.call y registra errores', () => {
  const scScene3d = makeScript(
    'sc3_scene',
    'Escena3D.js',
    `export default {
  onStart(self, nexus) { nexus.vars.set('init3d', 'ok'); },
  onUpdate(self, dt, nexus) { nexus.vars.add('ticks3d', 1); }
};`
  );
  const scObj3d = makeScript(
    'sc3_obj',
    'CuboMagico.js',
    `export default {
  params: { spin: 90, scoreOnHit: 25 },
  onStart(self, nexus) { nexus.vars.set('cubo_start', true); },
  onUpdate(self, dt) { self.ry += self.params.spin * dt; },
  onCollisionEnter(self, otro, nexus) {
    if (otro.hasTag('Player')) {
      nexus.vars.add('puntos', self.params.scoreOnHit);
      self.destroy();
    }
  },
  boost(self, mult, nexus) { nexus.vars.add('boost', Number(mult || 2)); }
};`
  );
  const scErr3d = makeScript(
    'sc3_err',
    'Error3D.js',
    `export default { onStart() { throw new Error('error3d test'); } };`
  );

  const player3d = createGameObject('mesh_3d', [], {
    name: 'Jugador3D',
    shape3d: 'box',
    x3d: 0,
    y3d: 1,
    z3d: 0,
  });
  player3d.tags = ['Player'];
  player3d.physics3d = {
    enabled: true,
    bodyType: 'dynamic',
    mass: 1,
    friction: 0.5,
    restitution: 0,
    gravityScale: 0,
    shape: 'box',
  };

  const gem3d = createGameObject('mesh_3d', [player3d], {
    name: 'Gema3D',
    shape3d: 'box',
    x3d: 2.5,
    y3d: 1,
    z3d: 0,
  });
  gem3d.scriptBindings = [
    { id: 'b3d', scriptId: 'sc3_obj', enabled: true, params: {} },
    { id: 'b3d_err', scriptId: 'sc3_err', enabled: true, params: {} },
  ];

  const scene3d: SceneData = {
    id: 'sc3_lvl1',
    name: 'Mundo 3D',
    kind: 'level',
    backgroundColor: '#131622',
    gridVisible: true,
    gridSize: 32,
    snapToGrid: false,
    objects: [player3d, gem3d],
    mechanics: [
      {
        id: 'm3_call',
        name: 'Boost 3D',
        enabled: true,
        priority: 1,
        trigger: { event: 'scene.start' },
        conditions: [],
        actions: [
          {
            id: 'a3',
            type: 'script.call',
            parameters: { scriptId: 'sc3_obj', methodName: 'boost', arg: 4 },
          },
        ],
      },
    ],
    scriptIds: ['sc3_scene'],
  };

  const sim3d = createSimulation3DState(
    scene3d,
    [scScene3d, scObj3d, scErr3d],
    new Map<string, number | boolean | string>([['puntos', 0]])
  );

  // Paso 1: ejecuta onStart, script.call y onUpdate (aún sin colisionar)
  sim3d.step({ dt: 1 / 60, heldKeys: new Set(), justPressedKeys: new Set() });
  const gemRuntime = sim3d.objects.find((o) => o.id === gem3d.id);
  assert.ok(gemRuntime && gemRuntime.t3.ry > 0);
  assert.equal(gemRuntime?.visible, true);

  // Paso 2: acercamos la gema para disparar onCollisionEnter simétrico + self.destroy()
  gemRuntime.t3.x = 0.2;
  sim3d.step({ dt: 1 / 60, heldKeys: new Set(), justPressedKeys: new Set() });

  assert.equal(sim3d.variables.get('init3d'), 'ok');
  assert.equal(sim3d.variables.get('ticks3d'), 2);
  assert.equal(sim3d.variables.get('cubo_start'), true);
  assert.equal(sim3d.variables.get('puntos'), 25);
  assert.equal(sim3d.variables.get('boost'), 4);
  assert.equal(gemRuntime?.visible, false);
  assert.ok(sim3d.logs.some((l) => l.includes('error3d test')));
});

test('Exportación HTML5 2D y 3D generan JS válido y sus compiladores embebidos compilan NexusScript export default sin errores', async () => {
  const sampleScript = makeScript(
    'exp_sc1',
    'ExportCheck.js',
    `export default {
  params: { speed: 80 },
  onStart(self, nexus) { nexus.vars.set('ok', 1); },
  onUpdate(self, dt) { self.x += self.params.speed * dt; },
  onCollisionEnter(self, otro, nexus) { if (otro.hasTag('Player')) nexus.audio.play('coin'); }
};`
  );

  // 2D Export check
  const proj2d = buildProjectFromTemplate({
    name: 'Test2DExport',
    mode: '2d',
    width: 1280,
    height: 720,
    orientation: 'horizontal',
    backgroundColor: '#131622',
    template: 'empty_single',
  });
  proj2d.scripts = [sampleScript];
  const pkg2d = await compileProjectToHtml5Zip(
    proj2d,
    new Map(),
    { portal: 'web', scaleMode: 'letterbox', touchControls: false, showFullscreenButton: true },
    '/* pixi stub */'
  );
  const zip2d = await JSZip.loadAsync(pkg2d.blob);
  const rt2d = await zip2d.file('js/nexus-runtime.js')!.async('string');
  assert.doesNotThrow(() => new vm.Script(rt2d));

  const fnStart2d = rt2d.indexOf('function compileUserScript2D');
  const fnEnd2d = rt2d.indexOf('var compiledScripts2D', fnStart2d);
  assert.ok(fnStart2d > 0 && fnEnd2d > fnStart2d);
  const ctx2d = vm.createContext({ resultOut: null as unknown });
  vm.runInContext(
    `${rt2d.slice(fnStart2d, fnEnd2d)}\nresultOut = compileUserScript2D(${JSON.stringify(sampleScript)});`,
    ctx2d
  );
  const compiled2d = ctx2d.resultOut as {
    error?: string;
    hooks: { params?: Record<string, unknown>; onStart?: unknown; onUpdate?: unknown; onCollisionEnter?: unknown };
  };
  assert.equal(compiled2d.error, undefined);
  assert.equal(compiled2d.hooks.params?.speed, 80);
  assert.equal(typeof compiled2d.hooks.onStart, 'function');
  assert.equal(typeof compiled2d.hooks.onUpdate, 'function');
  assert.equal(typeof compiled2d.hooks.onCollisionEnter, 'function');

  // 3D Export check
  const proj3d = buildProjectFromTemplate({
    name: 'Test3DExport',
    mode: '3d',
    width: 1280,
    height: 720,
    orientation: 'horizontal',
    backgroundColor: '#131622',
    template: 'empty_single',
  });
  proj3d.scripts = [sampleScript];
  const pkg3d = await compileProjectToHtml5Zip(
    proj3d,
    new Map(),
    { portal: 'web', scaleMode: 'letterbox', touchControls: false, showFullscreenButton: true },
    null,
    '/* three stub */'
  );
  const zip3d = await JSZip.loadAsync(pkg3d.blob);
  const rt3d = await zip3d.file('js/nexus-3d-runtime.js')!.async('string');
  assert.doesNotThrow(() => new vm.Script(rt3d));

  const fnStart3d = rt3d.indexOf('function compileUserScript3D');
  const fnEnd3d = rt3d.indexOf('async function boot', fnStart3d);
  assert.ok(fnStart3d > 0 && fnEnd3d > fnStart3d);
  const ctx3d = vm.createContext({ resultOut: null as unknown });
  vm.runInContext(
    `${rt3d.slice(fnStart3d, fnEnd3d)}\nresultOut = compileUserScript3D(${JSON.stringify(sampleScript)});`,
    ctx3d
  );
  const compiled3d = ctx3d.resultOut as {
    error?: string;
    hooks: { params?: Record<string, unknown>; onStart?: unknown; onUpdate?: unknown; onCollisionEnter?: unknown };
  };
  assert.equal(compiled3d.error, undefined);
  assert.equal(compiled3d.hooks.params?.speed, 80);
  assert.equal(typeof compiled3d.hooks.onStart, 'function');
  assert.equal(typeof compiled3d.hooks.onUpdate, 'function');
  assert.equal(typeof compiled3d.hooks.onCollisionEnter, 'function');
});
