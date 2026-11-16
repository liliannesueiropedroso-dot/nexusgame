import test from 'node:test';
import assert from 'node:assert/strict';
import { createGameObject } from '../objects/factory';
import type { SceneData } from '../core/types';
import { createSimulationState, stepSimulation } from './stepGameSimulation';

test('player_platformer lands on solid ground and collects collectible', () => {
  const player = createGameObject('rectangle', [], {
    name: 'Heroe',
    x: 100,
    y: 100,
    width: 40,
    height: 40,
  });
  player.components.push({
    id: 'c1',
    type: 'player_platformer',
    enabled: true,
    config: { speed: 200, jumpForce: 500, gravity: 1000 },
  });

  const floor = createGameObject('rectangle', [player], {
    name: 'Suelo',
    x: 150,
    y: 200,
    width: 300,
    height: 40,
  });
  floor.components.push({ id: 'c2', type: 'solid', enabled: true, config: {} });

  const coin = createGameObject('circle', [player, floor], {
    name: 'Moneda',
    x: 150,
    y: 160,
    width: 24,
    height: 24,
  });
  coin.components.push({
    id: 'c3',
    type: 'collectible',
    enabled: true,
    config: { points: 25 },
  });

  const scene: SceneData = {
    id: 's1',
    name: 'Test',
    backgroundColor: '#000',
    gridVisible: false,
    gridSize: 32,
    snapToGrid: false,
    objects: [player, floor, coin],
  };

  const sim = createSimulationState(scene);
  const idle = { left: false, right: false, up: false, down: false, jump: false };

  // Caer sobre la plataforma
  for (let i = 0; i < 30; i++) {
    stepSimulation(sim, 1 / 60, idle);
  }
  const simPlayer = sim.scene.objects.find((o) => o.id === player.id)!;
  const body = sim.bodies.get(player.id)!;
  assert.equal(body.grounded, true);
  assert.ok(Math.abs(simPlayer.transform.y - 160) < 0.01);

  // Mover hacia la derecha para recoger la moneda
  const moveRight = { left: false, right: true, up: false, down: false, jump: false };
  for (let i = 0; i < 20; i++) {
    stepSimulation(sim, 1 / 60, moveRight);
  }
  const simCoin = sim.scene.objects.find((o) => o.id === coin.id)!;
  assert.equal(simCoin.visible, false);
  assert.equal(sim.score, 25);
});

test('spin and patrol behaviors animate transform coordinates', () => {
  const spinner = createGameObject('rectangle', [], { x: 200, y: 200 });
  spinner.components.push({
    id: 's1',
    type: 'spin',
    enabled: true,
    config: { degPerSec: 180 },
  });

  const scene: SceneData = {
    id: 's1',
    name: 'Spin',
    backgroundColor: '#000',
    gridVisible: false,
    gridSize: 32,
    snapToGrid: false,
    objects: [spinner],
  };

  const sim = createSimulationState(scene);
  for (let i = 0; i < 30; i++) {
    stepSimulation(sim, 1 / 60, {
      left: false,
      right: false,
      up: false,
      down: false,
      jump: false,
    });
  }
  const rot = sim.scene.objects[0].transform.rotation;
  assert.ok(Math.abs(rot - 90) < 1);
});
