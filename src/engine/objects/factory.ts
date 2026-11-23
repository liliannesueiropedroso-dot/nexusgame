import { createId } from '../../utils/id';
import { generateProceduralTerrain } from '../three3d/terrainSystem';
import type {
  GameObjectData,
  GameObjectType,
  Mesh3DShape,
  SpriteFitMode,
} from '../core/types';

export interface CreateObjectOptions {
  name?: string;
  x?: number;
  y?: number;
  width?: number;
  height?: number;
  parentId?: string | null;
  assetId?: string | null;
  fitMode?: SpriteFitMode;
  shape3d?: Mesh3DShape;
  glbAssetId?: string | null;
  x3d?: number;
  y3d?: number;
  z3d?: number;
  color?: string;
  scriptId?: string | null;
  html?: string;
  css?: string;
  js?: string;
}

function generateDefaultName(type: GameObjectType, existing: GameObjectData[]): string {
  const baseMap: Record<GameObjectType, string> = {
    sprite: 'Sprite',
    rectangle: 'Rectangulo',
    circle: 'Circulo',
    text: 'Texto',
    container: 'Contenedor',
    tilemap: 'Tilemap',
    ui_button: 'Boton',
    ui_panel: 'PanelUI',
    ui_progress_bar: 'BarraProgreso',
    ui_leaderboard: 'RankingUI',
    ui_widget: 'InterfazUI',
    light_2d: 'Luz2D',
    mesh_3d: 'Objeto3D',
    light_3d: 'Luz3D',
    camera_3d: 'Camara3D',
  };
  const base = baseMap[type];
  let index = 1;
  const names = new Set(existing.map((o) => o.name));
  while (names.has(`${base}_${index}`)) {
    index += 1;
  }
  return `${base}_${index}`;
}

export function createGameObject(
  type: GameObjectType,
  existingObjects: GameObjectData[],
  options: CreateObjectOptions = {}
): GameObjectData {
  const id = createId('obj');
  const name = options.name?.trim() || generateDefaultName(type, existingObjects);
  const x = options.x ?? 640;
  const y = options.y ?? 360;
  const parentId = options.parentId ?? null;

  const base: GameObjectData = {
    id,
    name,
    type,
    parentId,
    visible: true,
    locked: false,
    opacity: 1,
    layer: 'Default',
    transform: {
      x,
      y,
      rotation: 0,
      scaleX: 1,
      scaleY: 1,
      width: options.width ?? 128,
      height: options.height ?? 128,
      anchorX: 0.5,
      anchorY: 0.5,
    },
    components: [],
  };

  switch (type) {
    case 'sprite':
      return {
        ...base,
        sprite: {
          assetId: options.assetId ?? null,
          normalAssetId: null,
          tint: '#ffffff',
          flipX: false,
          flipY: false,
          fitMode: options.fitMode ?? 'contain',
          aspectLocked: true,
          sampling: 'linear',
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
      };
    case 'rectangle':
      return {
        ...base,
        transform: {
          ...base.transform,
          width: options.width ?? 160,
          height: options.height ?? 96,
        },
        rectangle: {
          fillColor: options.color ?? '#3b82f6',
          strokeColor: '#93c5fd',
          strokeWidth: 2,
          cornerRadius: 6,
        },
      };
    case 'circle': {
      const radius = Math.round((options.width ?? 96) / 2);
      return {
        ...base,
        transform: {
          ...base.transform,
          width: radius * 2,
          height: radius * 2,
        },
        circle: {
          fillColor: options.color ?? '#10b981',
          strokeColor: '#6ee7b7',
          strokeWidth: 2,
          radius,
        },
      };
    }
    case 'text':
      return {
        ...base,
        transform: {
          ...base.transform,
          width: options.width ?? 280,
          height: options.height ?? 48,
        },
        text: {
          text: 'Nuevo texto',
          fontSize: 32,
          fontFamily: 'Plus Jakarta Sans',
          color: '#ffffff',
          fontWeight: 'bold',
          align: 'center',
        },
      };
    case 'container':
      return {
        ...base,
        transform: {
          ...base.transform,
          width: options.width ?? 260,
          height: options.height ?? 200,
        },
      };
    case 'tilemap': {
      const tileWidth = 32;
      const tileHeight = 32;
      const cols = 20;
      const rows = 12;
      return {
        ...base,
        layer: 'Ground',
        transform: {
          ...base.transform,
          x: options.x ?? 0,
          y: options.y ?? 0,
          width: cols * tileWidth,
          height: rows * tileHeight,
          anchorX: 0,
          anchorY: 0,
        },
        tilemap: {
          assetId: options.assetId ?? null,
          tileWidth,
          tileHeight,
          cols,
          rows,
          tilesetCols: 4,
          tilesetRows: 2,
          selectedTileIndex: 0,
          cells: {},
        },
      };
    }
    case 'ui_button':
      return {
        ...base,
        layer: 'UI',
        transform: {
          ...base.transform,
          width: options.width ?? 220,
          height: options.height ?? 52,
        },
        uiButton: {
          text: 'JUGAR',
          bgColor: '#2563eb',
          hoverColor: '#3b82f6',
          textColor: '#ffffff',
          borderColor: '#93c5fd',
          borderRadius: 8,
          fontSize: 20,
          onClickAction: 'none',
          transition: 'fadeBlack',
        },
      };
    case 'ui_panel':
      return {
        ...base,
        layer: 'UI',
        transform: {
          ...base.transform,
          width: options.width ?? 420,
          height: options.height ?? 280,
        },
        uiPanel: {
          bgColor: '#18181b',
          borderColor: '#3f3f46',
          borderWidth: 2,
          borderRadius: 12,
        },
      };
    case 'ui_progress_bar':
      return {
        ...base,
        layer: 'UI',
        transform: {
          ...base.transform,
          width: options.width ?? 220,
          height: options.height ?? 24,
        },
        uiProgressBar: {
          variable: 'salud',
          maxValue: 100,
          fillColor: '#10b981',
          bgColor: '#1e293b',
          borderColor: '#475569',
          showLabel: true,
        },
      };
    case 'ui_leaderboard':
      return {
        ...base,
        layer: 'UI',
        transform: {
          ...base.transform,
          width: options.width ?? 320,
          height: options.height ?? 240,
        },
        uiLeaderboard: {
          title: 'MEJORES PUNTUACIONES',
          maxEntries: 5,
          bgColor: '#0f172a',
          borderColor: '#334155',
          textColor: '#f8fafc',
          accentColor: '#f59e0b',
          variable: 'puntos',
        },
      };
    case 'ui_widget':
      return {
        ...base,
        layer: 'UI',
        transform: {
          ...base.transform,
          width: options.width ?? 280,
          height: options.height ?? 160,
        },
        uiWidget: {
          scriptId: options.scriptId ?? null,
          html:
            options.html ??
            `<div class="nx-card">\n  <h3>Panel Interactivo</h3>\n  <p>Puntos: <span data-nexus-var="puntos">0</span></p>\n  <button class="nx-btn" data-nexus-action="event:panel_click">Activar</button>\n</div>`,
          css:
            options.css ??
            `.nx-card { width: 100%; height: 100%; padding: 14px; border-radius: 14px; background: linear-gradient(135deg, rgba(15,23,42,0.92), rgba(30,41,59,0.88)); border: 1px solid rgba(56,189,248,0.45); color: #f8fafc; font-family: system-ui, sans-serif; display: flex; flex-direction: column; justify-content: space-between; box-shadow: 0 12px 28px rgba(0,0,0,0.45); animation: nxPulseBorder 3s ease-in-out infinite; }\n.nx-card h3 { margin: 0; font-size: 14px; font-weight: 700; color: #38bdf8; }\n.nx-card p { margin: 4px 0; font-size: 13px; color: #cbd5e1; }\n.nx-btn { padding: 8px 12px; border: 0; border-radius: 8px; background: #2563eb; color: #fff; font-weight: 700; cursor: pointer; transition: transform .15s; }\n.nx-btn:hover { transform: scale(1.03); background: #3b82f6; }\n@keyframes nxPulseBorder { 0%,100% { border-color: rgba(56,189,248,0.45); } 50% { border-color: rgba(168,85,247,0.8); } }`,
          js: options.js ?? '',
          interactive: true,
          visibleAtStart: true,
          fixedToScreen: true,
          zIndex: 10,
        },
      };
    case 'light_2d':
      return {
        ...base,
        transform: {
          ...base.transform,
          width: options.width ?? 64,
          height: options.height ?? 64,
        },
        light2d: {
          kind: 'point',
          color: options.color ?? '#fde68a',
          intensity: 1.1,
          radius: 320,
          angleDeg: 55,
          directionDeg: 0,
          softness: 0.75,
          castShadows: true,
        },
      };
    case 'mesh_3d': {
      const shape: Mesh3DShape = options.shape3d ?? (options.glbAssetId ? 'glb' : 'box');
      const isPlane = shape === 'plane';
      const isTerrain = shape === 'terrain';
      const isWater = shape === 'water';
      const isGrass = shape === 'grass_field';
      return {
        ...base,
        layer: isPlane || isTerrain ? 'Ground' : isWater ? 'Sensor' : 'Default',
        navRole: isTerrain || isPlane ? 'terrain' : isWater ? 'ignore' : 'auto',
        transform3d: {
          x: options.x3d ?? 0,
          y: options.y3d ?? (isPlane || isTerrain || isGrass ? 0 : isWater ? -0.35 : 1),
          z: options.z3d ?? 0,
          rx: 0,
          ry: 0,
          rz: 0,
          sx: isPlane ? 24 : isTerrain || isWater || isGrass ? 1 : 2,
          sy: isPlane ? 0.4 : isTerrain || isWater || isGrass ? 1 : 2,
          sz: isPlane ? 24 : isTerrain || isWater || isGrass ? 1 : 2,
        },
        mesh3d: {
          shape,
          color:
            options.color ??
            (isPlane
              ? '#1e293b'
              : isTerrain
                ? '#2d7a47'
                : isWater
                  ? '#0284c7'
                  : isGrass
                    ? '#4ade80'
                    : '#38bdf8'),
          metalness: isWater ? 0.35 : 0.15,
          roughness: isWater ? 0.18 : 0.68,
          emissive: '#000000',
          emissiveIntensity: 0,
          castShadow: !isPlane && !isWater && !isTerrain,
          receiveShadow: true,
          textureAssetId: options.assetId ?? null,
          normalAssetId: null,
          glbAssetId: options.glbAssetId ?? null,
          clipNames: [],
          terrainData: isTerrain ? generateProceduralTerrain({ width: 48, depth: 48, segments: 40, amplitude: 4.5 }) : undefined,
          waterConfig: isWater
            ? {
                width: 28,
                depth: 28,
                flowX: 0.7,
                flowZ: 0.25,
                waveAmplitude: 0.14,
                waveSpeed: 1.8,
                shallowColor: '#38bdf8',
                deepColor: '#0c4a6e',
                foamIntensity: 0.85,
              }
            : undefined,
          foliageConfig: isGrass
            ? {
                kind: 'grass',
                colorBase: '#15803d',
                colorTip: '#86efac',
                windStrength: 0.38,
                windSpeed: 2.4,
                interactionRadius: 1.8,
                instances: Array.from({ length: 120 }, (_, i) => {
                  const angle = i * 2.39996;
                  const rad = Math.sqrt((i + 1) / 120) * 11;
                  return {
                    x: Number((Math.cos(angle) * rad).toFixed(2)),
                    y: 0,
                    z: Number((Math.sin(angle) * rad).toFixed(2)),
                    scale: 0.85 + (i % 5) * 0.12,
                    rotY: Number((angle % (Math.PI * 2)).toFixed(2)),
                    variant: i % 3,
                  };
                }),
              }
            : undefined,
        },
        physics3d: {
          enabled: !isGrass,
          bodyType: 'static',
          isTrigger: isWater,
          cameraCollision: isGrass || isWater ? 'never' : 'auto',
          shape:
            shape === 'sphere'
              ? 'sphere'
              : shape === 'arch' || shape === 'csg' || shape === 'stairs' || shape === 'ramp'
                ? 'mesh_exact'
                : 'box',
          mass: 1,
          gravityScale: 1,
          restitution: 0.1,
          friction: 0.6,
        },
      };
    }
    case 'light_3d':
      return {
        ...base,
        transform3d: {
          x: options.x3d ?? 0,
          y: options.y3d ?? 6,
          z: options.z3d ?? 0,
          rx: -45,
          ry: 0,
          rz: 0,
          sx: 1,
          sy: 1,
          sz: 1,
        },
        light3d: {
          lightType: 'point',
          color: options.color ?? '#fde68a',
          intensity: 18,
          distance: 28,
          decay: 1.5,
          angleDeg: 45,
          penumbra: 0.45,
          castShadow: true,
        },
      };
    case 'camera_3d':
      return {
        ...base,
        transform3d: {
          x: options.x3d ?? 0,
          y: options.y3d ?? 6,
          z: options.z3d ?? 12,
          rx: -18,
          ry: 0,
          rz: 0,
          sx: 1,
          sy: 1,
          sz: 1,
        },
        camera3d: {
          isMainCamera: existingObjects.every((o) => o.type !== 'camera_3d'),
          mode: 'smooth_follow',
          targetObjectId: null,
          dampingFactor: 0.12,
          lookAhead: 1.5,
          offsetX: 0,
          offsetY: 5.5,
          offsetZ: 10,
          distance: 11,
          pitchMinDeg: -55,
          pitchMaxDeg: 25,
          fov: 55,
          deadzoneW: 1.5,
          deadzoneH: 1.5,
          collideWithWalls: true,
          useBounds: false,
          boundsMinX: -60,
          boundsMaxX: 60,
          boundsMinY: 1,
          boundsMaxY: 40,
          boundsMinZ: -60,
          boundsMaxZ: 60,
        },
      };
  }
}
