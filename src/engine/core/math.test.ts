import test from 'node:test';
import assert from 'node:assert/strict';
import {
  getWorldTransform,
  screenToStage,
  snapValue,
  stageDeltaToParentLocal,
  stageToScreen,
} from './math';
import type { GameObjectData } from './types';
import { buildObjectMap } from './sceneGraph';

test('screenToStage and stageToScreen are exact inverses across zoom and pan', () => {
  const camera = { x: 145, y: -32, zoom: 1.5 };
  const stagePt = { x: 640, y: 360 };
  const screenPt = stageToScreen(stagePt.x, stagePt.y, camera);
  const roundTrip = screenToStage(screenPt.x, screenPt.y, camera);

  assert.ok(Math.abs(roundTrip.x - stagePt.x) < 1e-9);
  assert.ok(Math.abs(roundTrip.y - stagePt.y) < 1e-9);
});

test('snapValue rounds to grid when enabled and preserves value when disabled', () => {
  assert.equal(snapValue(49, 32, true), 64);
  assert.equal(snapValue(47, 32, true), 32);
  assert.equal(snapValue(49, 32, false), 49);
});

test('getWorldTransform accumulates parent container position, rotation, and scale', () => {
  const parent: GameObjectData = {
    id: 'parent',
    name: 'Parent',
    type: 'container',
    parentId: null,
    visible: true,
    locked: false,
    opacity: 1,
    transform: {
      x: 100,
      y: 200,
      rotation: 90,
      scaleX: 2,
      scaleY: 2,
      width: 100,
      height: 100,
      anchorX: 0.5,
      anchorY: 0.5,
    },
    components: [],
  };

  const child: GameObjectData = {
    id: 'child',
    name: 'Child',
    type: 'rectangle',
    parentId: 'parent',
    visible: true,
    locked: false,
    opacity: 1,
    transform: {
      x: 10,
      y: 0,
      rotation: 0,
      scaleX: 1,
      scaleY: 1,
      width: 40,
      height: 40,
      anchorX: 0.5,
      anchorY: 0.5,
    },
    components: [],
  };

  const map = buildObjectMap([parent, child]);
  const world = getWorldTransform(child, map);
  // Local (10, 0) scaled by 2 = (20, 0), rotated 90 deg -> (0, 20), plus (100, 200) -> (100, 220)
  assert.ok(Math.abs(world.x - 100) < 1e-6);
  assert.ok(Math.abs(world.y - 220) < 1e-6);
  assert.equal(world.rotation, 90);
  assert.equal(world.scaleX, 2);

  const localDelta = stageDeltaToParentLocal(0, 20, 'parent', map);
  assert.ok(Math.abs(localDelta.x - 10) < 1e-6);
  assert.ok(Math.abs(localDelta.y - 0) < 1e-6);
});
