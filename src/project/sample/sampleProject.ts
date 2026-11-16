import { DEFAULT_AUDIO_BUSES } from '../../engine/audio/audioEngine';
import { createId } from '../../utils/id';
import { NEXUS_FORMAT_VERSION, type NexusProject, type ProjectAssetMeta } from '../models/project';
import { generateThumbnailFromBlob } from '../../assets/thumbnails/thumbnailGenerator';

interface SampleSpriteSpec {
  id: string;
  name: string;
  filename: string;
  svg: string;
}

const SAMPLE_SPRITES: SampleSpriteSpec[] = [
  {
    id: 'asset_sample_hero',
    name: 'heroe_walk_4f',
    filename: 'heroe_walk_4f.svg',
    // Spritesheet 4x1 (384x96): 4 fotogramas de 96x96 (reposo + ciclo de caminata)
    svg: `<svg xmlns="http://www.w3.org/2000/svg" width="384" height="96" viewBox="0 0 384 96">
      <!-- Frame 0: Reposo -->
      <g transform="translate(0,0)">
        <rect x="24" y="20" width="48" height="48" rx="12" fill="#3b82f6" stroke="#1d4ed8" stroke-width="4"/>
        <rect x="30" y="30" width="36" height="18" rx="6" fill="#0f172a"/>
        <circle cx="41" cy="39" r="3.5" fill="#38bdf8"/>
        <circle cx="55" cy="39" r="3.5" fill="#38bdf8"/>
        <rect x="34" y="68" width="10" height="18" rx="4" fill="#1d4ed8"/>
        <rect x="52" y="68" width="10" height="18" rx="4" fill="#1d4ed8"/>
        <path d="M40 20 L48 8 L56 20 Z" fill="#60a5fa"/>
      </g>
      <!-- Frame 1: Paso izquierdo -->
      <g transform="translate(96,0)">
        <rect x="24" y="17" width="48" height="48" rx="12" fill="#3b82f6" stroke="#1d4ed8" stroke-width="4"/>
        <rect x="31" y="27" width="36" height="18" rx="6" fill="#0f172a"/>
        <circle cx="42" cy="36" r="3.5" fill="#38bdf8"/>
        <circle cx="56" cy="36" r="3.5" fill="#38bdf8"/>
        <rect x="26" y="65" width="12" height="20" rx="4" fill="#2563eb" transform="rotate(18 32 65)"/>
        <rect x="54" y="65" width="12" height="18" rx="4" fill="#1e40af" transform="rotate(-16 60 65)"/>
        <path d="M40 17 L48 5 L56 17 Z" fill="#93c5fd"/>
      </g>
      <!-- Frame 2: Transición -->
      <g transform="translate(192,0)">
        <rect x="24" y="21" width="48" height="48" rx="12" fill="#3b82f6" stroke="#1d4ed8" stroke-width="4"/>
        <rect x="30" y="31" width="36" height="18" rx="6" fill="#0f172a"/>
        <circle cx="41" cy="40" r="3.5" fill="#38bdf8"/>
        <circle cx="55" cy="40" r="3.5" fill="#38bdf8"/>
        <rect x="38" y="68" width="10" height="17" rx="4" fill="#1d4ed8"/>
        <rect x="50" y="68" width="10" height="17" rx="4" fill="#2563eb"/>
        <path d="M40 21 L48 9 L56 21 Z" fill="#60a5fa"/>
      </g>
      <!-- Frame 3: Paso derecho -->
      <g transform="translate(288,0)">
        <rect x="24" y="17" width="48" height="48" rx="12" fill="#3b82f6" stroke="#1d4ed8" stroke-width="4"/>
        <rect x="31" y="27" width="36" height="18" rx="6" fill="#0f172a"/>
        <circle cx="42" cy="36" r="3.5" fill="#38bdf8"/>
        <circle cx="56" cy="36" r="3.5" fill="#38bdf8"/>
        <rect x="32" y="65" width="12" height="18" rx="4" fill="#1e40af" transform="rotate(-16 38 65)"/>
        <rect x="56" y="65" width="12" height="20" rx="4" fill="#2563eb" transform="rotate(18 62 65)"/>
        <path d="M40 17 L48 5 L56 17 Z" fill="#93c5fd"/>
      </g>
    </svg>`,
  },
  {
    id: 'asset_sample_gem_sheet',
    name: 'gema_animada_4f',
    filename: 'gema_animada_4f.svg',
    // Spritesheet 4x1 (256x64): 4 cuadros animados de una gema girando/brillando
    svg: `<svg xmlns="http://www.w3.org/2000/svg" width="256" height="64" viewBox="0 0 256 64">
      <g transform="translate(0,0)">
        <polygon points="32,8 54,26 32,56 10,26" fill="#10b981" stroke="#047857" stroke-width="3"/>
        <polygon points="32,8 42,26 32,56 22,26" fill="#34d399" opacity="0.75"/>
      </g>
      <g transform="translate(64,0)">
        <polygon points="32,6 48,26 32,58 16,26" fill="#34d399" stroke="#047857" stroke-width="3"/>
        <polygon points="32,6 38,26 32,58 26,26" fill="#a7f3d0" opacity="0.8"/>
      </g>
      <g transform="translate(128,0)">
        <polygon points="32,8 38,26 32,56 26,26" fill="#6ee7b7" stroke="#047857" stroke-width="3"/>
      </g>
      <g transform="translate(192,0)">
        <polygon points="32,6 48,26 32,58 16,26" fill="#34d399" stroke="#047857" stroke-width="3"/>
        <polygon points="32,6 38,26 32,58 26,26" fill="#a7f3d0" opacity="0.8"/>
      </g>
    </svg>`,
  },
  {
    id: 'asset_sample_tileset',
    name: 'tileset_plataformas',
    filename: 'tileset_plataformas.svg',
    // Tileset 4x2 (128x64, tiles de 32x32)
    svg: `<svg xmlns="http://www.w3.org/2000/svg" width="128" height="64" viewBox="0 0 128 64">
      <rect x="0" y="0" width="32" height="32" fill="#334155"/>
      <rect x="0" y="0" width="32" height="6" fill="#38bdf8"/>
      <rect x="32" y="0" width="32" height="32" fill="#1e293b" stroke="#475569" stroke-width="2"/>
      <rect x="64" y="0" width="32" height="32" fill="#2563eb"/>
      <rect x="64" y="0" width="32" height="5" fill="#93c5fd"/>
      <rect x="96" y="0" width="32" height="32" fill="#475569"/>
      <circle cx="112" cy="16" r="6" fill="#94a3b8"/>
      <rect x="0" y="32" width="32" height="32" fill="#0f172a" stroke="#334155" stroke-width="2"/>
      <rect x="32" y="32" width="32" height="32" fill="#065f46"/>
      <rect x="32" y="32" width="32" height="6" fill="#34d399"/>
      <rect x="64" y="32" width="32" height="32" fill="#7c2d12"/>
      <rect x="96" y="32" width="32" height="32" fill="#312e81"/>
    </svg>`,
  },
  {
    id: 'asset_sample_crate',
    name: 'bloque_metal',
    filename: 'bloque_metal.svg',
    svg: `<svg xmlns="http://www.w3.org/2000/svg" width="96" height="96" viewBox="0 0 96 96">
      <rect x="4" y="4" width="88" height="88" rx="8" fill="#475569" stroke="#1e293b" stroke-width="5"/>
      <rect x="14" y="14" width="68" height="68" rx="4" fill="#334155" stroke="#64748b" stroke-width="2"/>
      <line x1="16" y1="16" x2="80" y2="80" stroke="#64748b" stroke-width="4"/>
      <line x1="80" y1="16" x2="16" y2="80" stroke="#64748b" stroke-width="4"/>
      <circle cx="14" cy="14" r="3" fill="#cbd5e1"/>
      <circle cx="82" cy="14" r="3" fill="#cbd5e1"/>
      <circle cx="14" cy="82" r="3" fill="#cbd5e1"/>
      <circle cx="82" cy="82" r="3" fill="#cbd5e1"/>
    </svg>`,
  },
  {
    id: 'asset_sample_drone',
    name: 'dron_vigia',
    filename: 'dron_vigia.svg',
    svg: `<svg xmlns="http://www.w3.org/2000/svg" width="80" height="80" viewBox="0 0 80 80">
      <circle cx="40" cy="40" r="26" fill="#e11d48" stroke="#881337" stroke-width="4"/>
      <circle cx="40" cy="40" r="12" fill="#18181b"/>
      <circle cx="40" cy="40" r="6" fill="#fbbf24"/>
      <rect x="6" y="36" width="12" height="8" rx="3" fill="#9f1239"/>
      <rect x="62" y="36" width="12" height="8" rx="3" fill="#9f1239"/>
    </svg>`,
  },
];

export async function createSampleProject(): Promise<{
  project: NexusProject;
  assetBlobs: Map<string, Blob>;
}> {
  const now = Date.now();
  const projectId = createId('proj');
  const sceneId = createId('scene');
  const heroId = createId('obj');
  const gemId = createId('obj');
  const assets: ProjectAssetMeta[] = [];
  const assetBlobs = new Map<string, Blob>();

  for (const spec of SAMPLE_SPRITES) {
    const blob = new Blob([spec.svg], { type: 'image/svg+xml' });
    let thumbnailDataUrl = '';
    let width = 96;
    let height = 96;
    try {
      const generated = await generateThumbnailFromBlob(blob);
      thumbnailDataUrl = generated.thumbnailDataUrl;
      width = generated.width;
      height = generated.height;
    } catch {
      thumbnailDataUrl = `data:image/svg+xml;utf8,${encodeURIComponent(spec.svg)}`;
    }

    assets.push({
      id: spec.id,
      name: spec.name,
      filename: spec.filename,
      mimeType: 'image/svg+xml',
      format: 'svg',
      kind: 'image',
      size: blob.size,
      width,
      height,
      thumbnailDataUrl,
      createdAt: now,
    });
    assetBlobs.set(spec.id, blob);
  }

  const uiContainerId = createId('obj');

  const project: NexusProject = {
    id: projectId,
    formatVersion: NEXUS_FORMAT_VERSION,
    name: 'Plataforma Nexus (Ejemplo)',
    createdAt: now,
    updatedAt: now,
    settings: {
      width: 1280,
      height: 720,
      orientation: 'horizontal',
      backgroundColor: '#131b2e',
    },
    variables: [
      {
        id: createId('var'),
        name: 'puntos',
        scope: 'global',
        type: 'number',
        initialValue: 0,
      },
    ],
    audioBuses: structuredClone(DEFAULT_AUDIO_BUSES),
    activeSceneId: sceneId,
    scenes: [
      {
        id: sceneId,
        name: 'Nivel_01',
        backgroundColor: '#131b2e',
        gridVisible: true,
        gridSize: 32,
        snapToGrid: false,
        mechanics: [
          {
            id: createId('mech'),
            name: 'Recoger Gema_Animada',
            enabled: true,
            priority: 10,
            ownerObjectId: gemId,
            trigger: {
              event: 'collision.enter',
              sourceObjectId: heroId,
              target: gemId,
            },
            conditions: [
              {
                id: createId('cond'),
                type: 'object.visible',
                target: gemId,
                value: true,
              },
            ],
            actions: [
              {
                id: createId('act'),
                type: 'variable.add',
                parameters: { variable: 'puntos', amount: 50 },
              },
              {
                id: createId('act'),
                type: 'audio.beep',
                parameters: { preset: 'coin', channel: 'sfx' },
              },
              {
                id: createId('act'),
                type: 'particles.burst',
                parameters: { target: gemId, color: '#34d399', count: 14 },
              },
              {
                id: createId('act'),
                type: 'object.destroy',
                parameters: { target: gemId },
              },
            ],
          },
          {
            id: createId('mech'),
            name: 'Sonido de salto del héroe',
            enabled: true,
            priority: 5,
            ownerObjectId: heroId,
            trigger: {
              event: 'input.pressed',
              key: 'Space',
            },
            conditions: [
              {
                id: createId('cond'),
                type: 'object.grounded',
                target: heroId,
                value: true,
              },
            ],
            actions: [
              {
                id: createId('act'),
                type: 'audio.beep',
                parameters: { preset: 'jump', channel: 'sfx' },
              },
            ],
          },
        ],
        objects: [
          {
            id: createId('obj'),
            name: 'Mapa_Plataformas',
            type: 'tilemap',
            parentId: null,
            visible: true,
            locked: false,
            opacity: 1,
            transform: {
              x: 0,
              y: 0,
              rotation: 0,
              scaleX: 1,
              scaleY: 1,
              width: 1280,
              height: 704,
              anchorX: 0,
              anchorY: 0,
            },
            tilemap: {
              assetId: 'asset_sample_tileset',
              tileWidth: 32,
              tileHeight: 32,
              cols: 40,
              rows: 22,
              tilesetCols: 4,
              tilesetRows: 2,
              selectedTileIndex: 0,
              cells: {
                '10,16': 2,
                '11,16': 2,
                '12,16': 2,
                '13,16': 2,
                '29,12': 5,
                '30,12': 5,
                '31,12': 5,
                '32,12': 5,
              },
            },
            components: [{ id: createId('cmp'), type: 'solid', enabled: true, config: {} }],
          },
          {
            id: createId('obj'),
            name: 'Suelo_Principal',
            type: 'rectangle',
            parentId: null,
            visible: true,
            locked: false,
            opacity: 1,
            transform: {
              x: 640,
              y: 656,
              rotation: 0,
              scaleX: 1,
              scaleY: 1,
              width: 1184,
              height: 64,
              anchorX: 0.5,
              anchorY: 0.5,
            },
            rectangle: {
              fillColor: '#1e293b',
              strokeColor: '#334155',
              strokeWidth: 2,
              cornerRadius: 8,
            },
            components: [{ id: createId('cmp'), type: 'solid', enabled: true, config: {} }],
          },
          {
            id: createId('obj'),
            name: 'Plataforma_Elevada',
            type: 'rectangle',
            parentId: null,
            visible: true,
            locked: false,
            opacity: 1,
            transform: {
              x: 780,
              y: 448,
              rotation: 0,
              scaleX: 1,
              scaleY: 1,
              width: 280,
              height: 36,
              anchorX: 0.5,
              anchorY: 0.5,
            },
            rectangle: {
              fillColor: '#2563eb',
              strokeColor: '#60a5fa',
              strokeWidth: 2,
              cornerRadius: 6,
            },
            components: [{ id: createId('cmp'), type: 'solid', enabled: true, config: {} }],
          },
          {
            id: heroId,
            name: 'Heroe',
            type: 'sprite',
            parentId: null,
            visible: true,
            locked: false,
            opacity: 1,
            transform: {
              x: 200,
              y: 560,
              rotation: 0,
              scaleX: 1,
              scaleY: 1,
              width: 84,
              height: 84,
              anchorX: 0.5,
              anchorY: 0.5,
            },
            sprite: {
              assetId: 'asset_sample_hero',
              tint: '#ffffff',
              flipX: false,
              flipY: false,
              animation: {
                enabled: true,
                cols: 4,
                rows: 1,
                frameCount: 4,
                fps: 8,
                loop: true,
                playing: true,
                linkToMovement: true,
                activeClip: 'idle',
                clips: [
                  {
                    id: createId('clip'),
                    name: 'idle',
                    startFrame: 0,
                    frameCount: 1,
                    fps: 4,
                    loop: true,
                  },
                  {
                    id: createId('clip'),
                    name: 'walk',
                    startFrame: 0,
                    frameCount: 4,
                    fps: 8,
                    loop: true,
                  },
                ],
              },
            },
            components: [
              {
                id: createId('cmp'),
                type: 'player_platformer',
                enabled: true,
                config: { speed: 290, jumpForce: 580, gravity: 1350 },
              },
            ],
          },
          {
            id: createId('obj'),
            name: 'Bloque_01',
            type: 'sprite',
            parentId: null,
            visible: true,
            locked: false,
            opacity: 1,
            transform: {
              x: 520,
              y: 580,
              rotation: 0,
              scaleX: 0.9,
              scaleY: 0.9,
              width: 96,
              height: 96,
              anchorX: 0.5,
              anchorY: 0.5,
            },
            sprite: {
              assetId: 'asset_sample_crate',
              tint: '#ffffff',
              flipX: false,
              flipY: false,
            },
            components: [{ id: createId('cmp'), type: 'solid', enabled: true, config: {} }],
          },
          {
            id: gemId,
            name: 'Gema_Animada',
            type: 'sprite',
            parentId: null,
            visible: true,
            locked: false,
            opacity: 1,
            transform: {
              x: 780,
              y: 384,
              rotation: 0,
              scaleX: 1,
              scaleY: 1,
              width: 64,
              height: 64,
              anchorX: 0.5,
              anchorY: 0.5,
            },
            sprite: {
              assetId: 'asset_sample_gem_sheet',
              tint: '#ffffff',
              flipX: false,
              flipY: false,
              animation: {
                enabled: true,
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
                id: createId('cmp'),
                type: 'collectible',
                enabled: true,
                config: { points: 50 },
              },
            ],
          },
          {
            id: createId('obj'),
            name: 'Dron_Patrulla',
            type: 'sprite',
            parentId: null,
            visible: true,
            locked: false,
            opacity: 1,
            transform: {
              x: 960,
              y: 256,
              rotation: 0,
              scaleX: 1,
              scaleY: 1,
              width: 72,
              height: 72,
              anchorX: 0.5,
              anchorY: 0.5,
            },
            sprite: {
              assetId: 'asset_sample_drone',
              tint: '#ffffff',
              flipX: false,
              flipY: false,
            },
            components: [
              {
                id: createId('cmp'),
                type: 'patrol',
                enabled: true,
                config: { axis: 'x', distance: 150, speed: 120 },
              },
            ],
          },
          {
            id: uiContainerId,
            name: 'Interfaz_HUD',
            type: 'container',
            parentId: null,
            visible: true,
            locked: false,
            opacity: 1,
            transform: {
              x: 0,
              y: 0,
              rotation: 0,
              scaleX: 1,
              scaleY: 1,
              width: 340,
              height: 64,
              anchorX: 0,
              anchorY: 0,
            },
            components: [],
          },
          {
            id: createId('obj'),
            name: 'Titulo_Nivel',
            type: 'text',
            parentId: uiContainerId,
            visible: true,
            locked: false,
            opacity: 1,
            transform: {
              x: 200,
              y: 48,
              rotation: 0,
              scaleX: 1,
              scaleY: 1,
              width: 340,
              height: 44,
              anchorX: 0.5,
              anchorY: 0.5,
            },
            text: {
              text: 'NIVEL 01 · SECTOR NEXUS',
              fontSize: 22,
              fontFamily: 'Plus Jakarta Sans',
              color: '#e2e8f0',
              fontWeight: 'bold',
              align: 'left',
            },
            components: [],
          },
        ],
      },
    ],
    assets,
  };

  return { project, assetBlobs };
}
