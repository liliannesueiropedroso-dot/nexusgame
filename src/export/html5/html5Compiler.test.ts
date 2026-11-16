import test from 'node:test';
import assert from 'node:assert/strict';
import JSZip from 'jszip';
import type { NexusProject } from '../../project/models/project';
import { compileProjectToHtml5Zip } from './html5Compiler';

function makeTestProject(): { project: NexusProject; blobs: Map<string, Blob> } {
  const project: NexusProject = {
    id: 'proj_html5',
    formatVersion: '1.0.0',
    name: 'Galaxia Demo',
    createdAt: 1000,
    updatedAt: 2000,
    settings: {
      width: 1280,
      height: 720,
      orientation: 'horizontal',
      backgroundColor: '#0f172a',
    },
    activeSceneId: 'scene_1',
    scenes: [
      {
        id: 'scene_1',
        name: 'Nivel_1',
        backgroundColor: '#0f172a',
        gridVisible: true,
        gridSize: 32,
        snapToGrid: false,
        objects: [],
      },
    ],
    assets: [
      {
        id: 'asset_1',
        name: 'ship',
        filename: 'ship.svg',
        mimeType: 'image/svg+xml',
        format: 'svg',
        size: 32,
        width: 64,
        height: 64,
        thumbnailDataUrl: 'data:image/png;base64,AAAA',
        createdAt: 1000,
      },
    ],
  };

  const blobs = new Map<string, Blob>([
    ['asset_1', new Blob(['<svg></svg>'], { type: 'image/svg+xml' })],
  ]);

  return { project, blobs };
}

test('compileProjectToHtml5Zip injects real Playgama Bridge SDK and config JSON', async () => {
  const { project, blobs } = makeTestProject();
  const result = await compileProjectToHtml5Zip(
    project,
    blobs,
    {
      portal: 'playgama',
      scaleMode: 'letterbox',
      touchControls: true,
      showFullscreenButton: true,
    },
    '/* pixi mock */'
  );

  const zip = await JSZip.loadAsync(await result.blob.arrayBuffer());
  const indexHtml = await zip.file('index.html')!.async('string');
  const configJson = await zip.file('playgama-bridge-config.json')!.async('string');
  const portalSdkJs = await zip.file('js/portal-sdk.js')!.async('string');

  assert.ok(indexHtml.includes('https://bridge.playgama.com/playgama-bridge.js'));
  assert.ok(zip.file('js/pixi.min.js'));
  assert.ok(zip.file('js/nexus-runtime.js'));
  assert.ok(zip.file('data/game.json'));
  assert.ok(zip.file('assets/asset_1_ship.svg'));
  assert.equal(JSON.parse(configJson).sdk, 'playgama-bridge');
  assert.ok(portalSdkJs.includes('window.bridge.initialize()'));
});

test('compileProjectToHtml5Zip injects real Poki and CrazyGames v3 SDK scripts', async () => {
  const { project, blobs } = makeTestProject();

  const pokiRes = await compileProjectToHtml5Zip(
    project,
    blobs,
    { portal: 'poki', scaleMode: 'letterbox', touchControls: false, showFullscreenButton: true },
    '/* pixi */'
  );
  const pokiZip = await JSZip.loadAsync(await pokiRes.blob.arrayBuffer());
  const pokiHtml = await pokiZip.file('index.html')!.async('string');
  assert.ok(pokiHtml.includes('https://game-cdn.poki.com/scripts/v2/poki-sdk.js'));
  assert.equal(pokiZip.file('playgama-bridge-config.json'), null);

  const cgRes = await compileProjectToHtml5Zip(
    project,
    blobs,
    { portal: 'crazygames', scaleMode: 'cover', touchControls: false, showFullscreenButton: false },
    '/* pixi */'
  );
  const cgZip = await JSZip.loadAsync(await cgRes.blob.arrayBuffer());
  const cgHtml = await cgZip.file('index.html')!.async('string');
  assert.ok(cgHtml.includes('https://sdk.crazygames.com/crazygames-sdk-v3.js'));
});
