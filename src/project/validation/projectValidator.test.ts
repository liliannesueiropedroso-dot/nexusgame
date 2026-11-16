import test from 'node:test';
import assert from 'node:assert/strict';
import { validateExportManifest } from './projectValidator';
import { serializeProjectToManifest } from '../serialization/projectSerializer';
import type { NexusProject } from '../models/project';

test('serializeProjectToManifest produces a valid manifest accepted by validateExportManifest', () => {
  const project: NexusProject = {
    id: 'proj_123',
    formatVersion: '1.0.0',
    name: 'Proyecto Test',
    createdAt: 1000,
    updatedAt: 2000,
    settings: {
      width: 1280,
      height: 720,
      orientation: 'horizontal',
      backgroundColor: '#1e293b',
    },
    activeSceneId: 'scene_1',
    scenes: [
      {
        id: 'scene_1',
        name: 'Escena Principal',
        backgroundColor: '#1e293b',
        gridVisible: true,
        gridSize: 32,
        snapToGrid: false,
        objects: [],
      },
    ],
    assets: [],
  };

  const manifest = serializeProjectToManifest(project);
  const check = validateExportManifest(manifest);
  assert.equal(check.valid, true);
  assert.deepEqual(check.errors, []);
});

test('validateExportManifest rejects corrupted or incompatible manifests', () => {
  const bad = validateExportManifest({ format: 'wrong', formatVersion: '2.0.0' });
  assert.equal(bad.valid, false);
  assert.ok(bad.errors.length >= 2);
});
