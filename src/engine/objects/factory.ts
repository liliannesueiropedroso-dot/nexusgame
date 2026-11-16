import { createId } from '../../utils/id';
import type { GameObjectData, GameObjectType, SpriteFitMode } from '../core/types';

export interface CreateObjectOptions {
  name?: string;
  x?: number;
  y?: number;
  width?: number;
  height?: number;
  parentId?: string | null;
  assetId?: string | null;
  fitMode?: SpriteFitMode;
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
          fillColor: '#3b82f6',
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
          fillColor: '#10b981',
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
  }
}
