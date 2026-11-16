import test from 'node:test';
import assert from 'node:assert/strict';
import { createGameObject } from '../objects/factory';
import {
  buildSceneTree,
  duplicateObjectsByIds,
  moveSiblingOrder,
  removeObjectsByIds,
  reparentObject,
} from './sceneGraph';

test('buildSceneTree groups children under container parents', () => {
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

test('reparentObject prevents cycles and non-container parents', () => {
  const containerA = createGameObject('container', [], { name: 'A' });
  const containerB = createGameObject('container', [containerA], {
    name: 'B',
    parentId: containerA.id,
  });
  const rect = createGameObject('rectangle', [containerA, containerB], { name: 'Rect' });

  // Cycle check: A into B should be rejected
  const cycleAttempt = reparentObject([containerA, containerB, rect], containerA.id, containerB.id);
  assert.equal(cycleAttempt.find((o) => o.id === containerA.id)?.parentId, null);

  // Non-container parent check: B into rect should be rejected
  const nonContainerAttempt = reparentObject([containerA, containerB, rect], containerB.id, rect.id);
  assert.equal(nonContainerAttempt.find((o) => o.id === containerB.id)?.parentId, containerA.id);
});

test('moveSiblingOrder swaps siblings cleanly', () => {
  const a = createGameObject('rectangle', [], { name: 'A' });
  const b = createGameObject('rectangle', [a], { name: 'B' });
  const reordered = moveSiblingOrder([a, b], b.id, 'up');
  assert.equal(reordered[0].id, b.id);
  assert.equal(reordered[1].id, a.id);
});
