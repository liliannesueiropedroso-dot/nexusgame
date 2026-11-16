import test from 'node:test';
import assert from 'node:assert/strict';
import { createGameObject } from '../objects/factory';
import { buildObjectMap } from '../core/sceneGraph';
import {
  computeGizmoHandles,
  hitTestGizmoHandle,
  hitTestObject,
  pickTopObjectAt,
} from './hitTest';

test('hitTestObject detects point inside rotated rectangle and skips locked/hidden objects', () => {
  const rect = createGameObject('rectangle', [], { x: 100, y: 100, width: 100, height: 40 });
  rect.transform.rotation = 90;
  const map = buildObjectMap([rect]);

  // Rotated 90 deg: width 100 along Y, height 40 along X -> point (110, 140) is inside
  assert.equal(hitTestObject(110, 140, rect, map), true);
  assert.equal(hitTestObject(140, 100, rect, map), false);

  const locked = { ...rect, locked: true };
  assert.equal(hitTestObject(100, 100, locked, buildObjectMap([locked])), false);
});

test('pickTopObjectAt selects top-most visible object in Z order', () => {
  const bottom = createGameObject('rectangle', [], { name: 'Bottom', x: 200, y: 200, width: 120, height: 120 });
  const top = createGameObject('rectangle', [bottom], { name: 'Top', x: 210, y: 210, width: 80, height: 80 });

  const picked = pickTopObjectAt(210, 210, [bottom, top]);
  assert.equal(picked?.id, top.id);
});

test('computeGizmoHandles and hitTestGizmoHandle find scale and rotate handles', () => {
  const rect = createGameObject('rectangle', [], { x: 200, y: 200, width: 100, height: 100 });
  const map = buildObjectMap([rect]);
  const handles = computeGizmoHandles(rect, map, 'select', 1);

  assert.equal(handles.length, 9); // 8 scale + 1 rotate
  const se = handles.find((h) => h.type === 'scale-se')!;
  assert.equal(se.stageX, 250);
  assert.equal(se.stageY, 250);

  const hit = hitTestGizmoHandle(253, 248, handles, 1);
  assert.equal(hit?.type, 'scale-se');
});
