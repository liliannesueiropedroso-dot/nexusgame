import test from 'node:test';
import assert from 'node:assert/strict';
import { searchMechanicsCatalog } from './search/spanishSearch';
import { analyzeProjectDiagnostics } from './diagnostics/diagnosticAnalyzer';
import { getContextualRecommendations } from './recommender/recommendEngine';
import {
  compareValues,
  evaluateNumericExpression,
} from '../engine/runtime/expressionEvaluator';
import {
  createSimulationState,
  stepSimulation,
  type InputState,
} from '../engine/runtime/stepGameSimulation';
import type { NexusProject } from '../project/models/project';
import type { SceneData } from '../engine/core/types';

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

test('buscador local en español encuentra mecánicas por sinónimos sin IA', () => {
  const chaseMatches = searchMechanicsCatalog('quiero que mi enemigo siga al jugador');
  assert.ok(chaseMatches.length > 0);
  assert.equal(chaseMatches[0].entry.id, 'ai.chase_player');

  const animMatches = searchMechanicsCatalog('vincular animacion de caminar');
  assert.ok(animMatches.some((m) => m.entry.id === 'animation.link_walk'));
});

test('evaluador seguro de expresiones calcula aritmética y rechaza inyecciones', () => {
  const vars = new Map<string, number | boolean | string>([
    ['puntos', 100],
    ['combo', 3],
  ]);

  assert.equal(evaluateNumericExpression('puntos + combo * 10', vars), 130);
  assert.equal(evaluateNumericExpression('(10 + 5) / 3', vars), 5);
  // Rechaza caracteres/código arbitrario sin lanzar eval
  assert.throws(() => evaluateNumericExpression('10; alert(1)', vars), /no permitido/);
  assert.equal(evaluateNumericExpression('process.exit(1)', vars), 0);

  assert.equal(compareValues(130, '>=', 100), true);
  assert.equal(compareValues(50, '>', 100), false);
});

test('prueba central NEXUS: diagnóstico detecta falta de animación, auto-corrige y runtime mueve/anima al personaje', () => {
  const scene: SceneData = {
    id: 'scene_test',
    name: 'Escena_Prueba',
    backgroundColor: '#131b2e',
    gridVisible: true,
    gridSize: 32,
    snapToGrid: false,
    mechanics: [],
    objects: [
      {
        id: 'ground_1',
        name: 'Suelo',
        type: 'rectangle',
        parentId: null,
        visible: true,
        locked: false,
        opacity: 1,
        transform: {
          x: 640,
          y: 600,
          rotation: 0,
          scaleX: 1,
          scaleY: 1,
          width: 1200,
          height: 64,
          anchorX: 0.5,
          anchorY: 0.5,
        },
        rectangle: {
          fillColor: '#1e293b',
          strokeColor: '#334155',
          strokeWidth: 2,
          cornerRadius: 0,
        },
        components: [{ id: 'c_solid', type: 'solid', enabled: true, config: {} }],
      },
      {
        id: 'hero_1',
        name: 'Heroe',
        type: 'sprite',
        parentId: null,
        visible: true,
        locked: false,
        opacity: 1,
        transform: {
          x: 200,
          y: 520,
          rotation: 0,
          scaleX: 1,
          scaleY: 1,
          width: 64,
          height: 64,
          anchorX: 0.5,
          anchorY: 0.5,
        },
        sprite: {
          assetId: 'asset_hero',
          tint: '#ffffff',
          flipX: false,
          flipY: false,
          animation: {
            enabled: false,
            cols: 4,
            rows: 1,
            frameCount: 4,
            fps: 8,
            loop: true,
            playing: true,
          },
        },
        components: [
          {
            id: 'c_plat',
            type: 'player_platformer',
            enabled: true,
            config: { speed: 280, jumpForce: 540, gravity: 1350 },
          },
        ],
      },
    ],
  };

  const project: NexusProject = {
    id: 'proj_test',
    formatVersion: '1.0.0',
    name: 'Test Core',
    createdAt: 1,
    updatedAt: 1,
    settings: {
      width: 1280,
      height: 720,
      orientation: 'horizontal',
      backgroundColor: '#131b2e',
    },
    activeSceneId: 'scene_test',
    scenes: [scene],
    assets: [
      {
        id: 'asset_hero',
        name: 'hero_sheet',
        filename: 'hero_sheet.png',
        mimeType: 'image/png',
        format: 'png',
        kind: 'image',
        size: 1200,
        width: 256,
        height: 64,
        thumbnailDataUrl: '',
        createdAt: 1,
      },
    ],
    variables: [],
  };

  // 1. El asistente detecta movimiento sin animación vinculada
  const diagsBefore = analyzeProjectDiagnostics(project, scene, project.assets);
  const animDiag = diagsBefore.find((d) => d.code === 'MOVEMENT_WITHOUT_ANIMATION');
  assert.ok(animDiag, 'Debe detectar MOVEMENT_WITHOUT_ANIMATION');
  assert.ok(animDiag.fix, 'Debe ofrecer corrección automática en 1 clic');

  // También sugiere vincular la animación en el recomendador contextual
  const recs = getContextualRecommendations(scene.objects[1], scene, project.assets);
  assert.ok(recs.some((r) => r.catalogEntry.id === 'animation.link_walk'));

  // 2. Aplicar corrección de 1 clic
  const fixedProject = animDiag.fix.apply(project);
  const fixedScene = fixedProject.scenes[0];
  const diagsAfter = analyzeProjectDiagnostics(
    fixedProject,
    fixedScene,
    fixedProject.assets
  );
  assert.equal(
    diagsAfter.some(
      (d) => d.code === 'MOVEMENT_WITHOUT_ANIMATION' || d.code === 'ANIMATION_NOT_LINKED'
    ),
    false
  );

  // 3. Ejecutar simulación real: mover a la derecha acelera suavemente al héroe y activa clip 'walk'
  const sim = createSimulationState(fixedScene, fixedProject.variables);
  const startX = sim.scene.objects[1].transform.x;
  for (let i = 0; i < 15; i++) {
    stepSimulation(sim, 1 / 60, makeInput({ right: true }));
  }
  const heroSim = sim.scene.objects[1];
  assert.ok(heroSim.transform.x > startX + 20, 'El héroe debe desplazarse a la derecha');
  assert.equal(heroSim.sprite?.animation?.activeClip, 'walk');

  // Al soltar la entrada horizontal, desacelera suavemente y vuelve a 'idle'
  for (let i = 0; i < 15; i++) {
    stepSimulation(sim, 1 / 60, makeInput({ right: false }));
  }
  assert.equal(sim.scene.objects[1].sprite?.animation?.activeClip, 'idle');
});

test('runtime ejecuta reglas estructuradas CUANDO/SI/ENTONCES e IA chase_player', () => {
  const scene: SceneData = {
    id: 's1',
    name: 'Nivel',
    backgroundColor: '#000000',
    gridVisible: false,
    gridSize: 32,
    snapToGrid: false,
    mechanics: [
      {
        id: 'm_collect',
        name: 'Recoger moneda',
        enabled: true,
        priority: 10,
        trigger: {
          event: 'collision.enter',
          sourceObjectId: 'player',
          target: 'coin',
        },
        conditions: [{ id: 'c1', type: 'object.visible', target: 'coin', value: true }],
        actions: [
          { id: 'a1', type: 'variable.add', parameters: { variable: 'puntos', amount: 25 } },
          { id: 'a2', type: 'audio.beep', parameters: { preset: 'coin', channel: 'sfx' } },
          { id: 'a3', type: 'particles.burst', parameters: { target: 'coin', count: 10 } },
          { id: 'a4', type: 'object.destroy', parameters: { target: 'coin' } },
        ],
      },
    ],
    objects: [
      {
        id: 'player',
        name: 'Jugador',
        type: 'rectangle',
        parentId: null,
        visible: true,
        locked: false,
        opacity: 1,
        transform: {
          x: 100,
          y: 100,
          rotation: 0,
          scaleX: 1,
          scaleY: 1,
          width: 48,
          height: 48,
          anchorX: 0.5,
          anchorY: 0.5,
        },
        components: [
          { id: 'p_td', type: 'player_topdown', enabled: true, config: { speed: 300 } },
        ],
      },
      {
        id: 'coin',
        name: 'Moneda',
        type: 'circle',
        parentId: null,
        visible: true,
        locked: false,
        opacity: 1,
        transform: {
          x: 135,
          y: 100,
          rotation: 0,
          scaleX: 1,
          scaleY: 1,
          width: 32,
          height: 32,
          anchorX: 0.5,
          anchorY: 0.5,
        },
        components: [],
      },
      {
        id: 'enemy',
        name: 'Enemigo',
        type: 'rectangle',
        parentId: null,
        visible: true,
        locked: false,
        opacity: 1,
        transform: {
          x: 300,
          y: 100,
          rotation: 0,
          scaleX: 1,
          scaleY: 1,
          width: 40,
          height: 40,
          anchorX: 0.5,
          anchorY: 0.5,
        },
        components: [
          {
            id: 'ai_1',
            type: 'chase_player',
            enabled: true,
            config: { speed: 120, detectRadius: 400, stopDistance: 20 },
          },
        ],
      },
    ],
  };

  const sim = createSimulationState(scene, [
    { id: 'v1', name: 'puntos', scope: 'global', type: 'number', initialValue: 0 },
  ]);

  const enemyStartX = sim.scene.objects[2].transform.x;
  for (let i = 0; i < 6; i++) {
    stepSimulation(sim, 1 / 60, makeInput({ right: true }));
  }

  assert.equal(sim.variables.get('puntos'), 25);
  assert.equal(sim.scene.objects[1].visible, false, 'La moneda debe ocultarse/destruirse');
  assert.ok(sim.soundQueue.some((s) => s.preset === 'coin'));
  assert.ok(sim.particles.length >= 1, 'Debe emitir ráfaga de partículas');
  assert.ok(
    sim.scene.objects[2].transform.x < enemyStartX,
    'El enemigo chase_player debe acercarse al jugador'
  );
});
