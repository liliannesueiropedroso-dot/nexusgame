import test from 'node:test';
import assert from 'node:assert/strict';
import { createGameObject } from '../objects/factory';
import { getWorldTransform } from './math';
import {
  buildObjectMap,
  buildSceneTree,
  duplicateObjectsByIds,
  getWorldTransform3D,
  groupObjectsInFolder,
  moveSiblingOrder,
  removeObjectsByIds,
  reparentObject,
} from './sceneGraph';

test('buildSceneTree groups children under container and general parents', () => {
  const container = createGameObject('container', [], { name: 'Grupo' });
  const child = createGameObject('rectangle', [container], {
    name: 'Hijo',
    parentId: container.id,
  });
  const rootRect = createGameObject('rectangle', [container, child], { name: 'Raiz' });

  const tree = buildSceneTree([container, child, rootRect]);
  assert.equal(tree.length, 2);
  assert.equal(tree[0].object.id, container.id);
  assert.equal(tree[0].children.length, 1);
  assert.equal(tree[0].children[0].object.id, child.id);
  assert.equal(tree[0].children[0].depth, 1);
});

test('duplicateObjectsByIds clones subtree with new unique IDs and offset', () => {
  const container = createGameObject('container', [], { name: 'UI', x: 100, y: 100 });
  const child = createGameObject('text', [container], {
    name: 'Titulo',
    parentId: container.id,
    x: 10,
    y: 20,
  });

  const { objects, duplicatedIds } = duplicateObjectsByIds([container, child], [container.id]);
  assert.equal(objects.length, 4);
  assert.equal(duplicatedIds.length, 1);

  const dupContainer = objects.find((o) => o.id === duplicatedIds[0])!;
  assert.equal(dupContainer.name, 'UI (copia)');
  assert.equal(dupContainer.transform.x, 124);

  const dupChild = objects.find((o) => o.parentId === dupContainer.id)!;
  assert.ok(dupChild);
  assert.notEqual(dupChild.id, child.id);
});

test('removeObjectsByIds cascades to descendants', () => {
  const container = createGameObject('container', [], { name: 'Grupo' });
  const child = createGameObject('circle', [container], { parentId: container.id });
  const other = createGameObject('rectangle', [container, child]);

  const remaining = removeObjectsByIds([container, child, other], [container.id]);
  assert.equal(remaining.length, 1);
  assert.equal(remaining[0].id, other.id);
});

test('reparentObject prevents cycles, allows panel/object parents, and preserves world coordinates', () => {
  const containerA = createGameObject('container', [], { name: 'A', x: 100, y: 50 });
  const containerB = createGameObject('container', [containerA], {
    name: 'B',
    parentId: containerA.id,
    x: 20,
    y: 10,
  });
  const panel = createGameObject('ui_panel', [containerA, containerB], {
    name: 'Panel',
    x: 400,
    y: 200,
  });
  const btn = createGameObject('ui_button', [containerA, containerB, panel], {
    name: 'Btn',
    x: 450,
    y: 260,
  });

  // Cycle check: A into B should be rejected
  const cycleAttempt = reparentObject([containerA, containerB, panel, btn], containerA.id, containerB.id);
  assert.equal(cycleAttempt.find((o) => o.id === containerA.id)?.parentId, null);

  // Any-parent check: button reparented under UI panel keeps world position (450, 260)
  const parented = reparentObject([containerA, containerB, panel, btn], btn.id, panel.id);
  const movedBtn = parented.find((o) => o.id === btn.id)!;
  assert.equal(movedBtn.parentId, panel.id);
  assert.equal(movedBtn.transform.x, 50);
  assert.equal(movedBtn.transform.y, 60);

  const world = getWorldTransform(movedBtn, buildObjectMap(parented));
  assert.equal(world.x, 450);
  assert.equal(world.y, 260);
});

test('groupObjectsInFolder groups 2D & 3D objects without changing their world coordinates', () => {
  const m1 = createGameObject('mesh_3d', [], { name: 'Pilar1', x: 100, y: 200, x3d: 10, y3d: 2, z3d: -4 });
  const m2 = createGameObject('mesh_3d', [m1], { name: 'Pilar2', x: 300, y: 400, x3d: 20, y3d: 4, z3d: 6 });

  const { objects, folderId } = groupObjectsInFolder([m1, m2], [m1.id, m2.id], 'Pilares');
  assert.ok(folderId);
  const map = buildObjectMap(objects);
  const g1 = map.get(m1.id)!;
  const g2 = map.get(m2.id)!;
  assert.equal(g1.parentId, folderId);
  assert.equal(g2.parentId, folderId);

  const w2d1 = getWorldTransform(g1, map);
  const w2d2 = getWorldTransform(g2, map);
  assert.equal(Math.round(w2d1.x), 100);
  assert.equal(Math.round(w2d1.y), 200);
  assert.equal(Math.round(w2d2.x), 300);
  assert.equal(Math.round(w2d2.y), 400);

  const w3d1 = getWorldTransform3D(g1, map);
  const w3d2 = getWorldTransform3D(g2, map);
  assert.equal(Math.round(w3d1.x), 10);
  assert.equal(Math.round(w3d1.y), 2);
  assert.equal(Math.round(w3d1.z), -4);
  assert.equal(Math.round(w3d2.x), 20);
  assert.equal(Math.round(w3d2.y), 4);
  assert.equal(Math.round(w3d2.z), 6);
});

test('moveSiblingOrder swaps siblings cleanly', () => {
  const a = createGameObject('rectangle', [], { name: 'A' });
  const b = createGameObject('rectangle', [a], { name: 'B' });
  const reordered = moveSiblingOrder([a, b], b.id, 'up');
  assert.equal(reordered[0].id, b.id);
  assert.equal(reordered[1].id, a.id);
});
