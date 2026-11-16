import test from 'node:test';
import assert from 'node:assert/strict';
import {
  canRedo,
  canUndo,
  createHistoryState,
  pushHistory,
  redoHistory,
  undoHistory,
} from './historyManager';

test('undo and redo restore immutable snapshots and clear future on new edit', () => {
  let state = createHistoryState({ count: 0 });
  assert.equal(canUndo(state), false);
  assert.equal(canRedo(state), false);

  state = pushHistory(state, { count: 1 });
  state = pushHistory(state, { count: 2 });
  assert.equal(state.present.count, 2);
  assert.equal(canUndo(state), true);

  state = undoHistory(state);
  assert.equal(state.present.count, 1);
  assert.equal(canRedo(state), true);

  state = undoHistory(state);
  assert.equal(state.present.count, 0);
  assert.equal(canUndo(state), false);

  state = redoHistory(state);
  assert.equal(state.present.count, 1);

  // New push clears future
  state = pushHistory(state, { count: 99 });
  assert.equal(canRedo(state), false);
  assert.equal(state.present.count, 99);
});
