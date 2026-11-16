import { DEFAULT_AUDIO_BUSES } from '../../engine/audio/audioEngine';
import type { SceneData } from '../../engine/core/types';
import { createGameObject } from '../../engine/objects/factory';
import { createId } from '../../utils/id';
import {
  NEXUS_FORMAT_VERSION,
  type NexusProject,
  type ProjectTemplateId,
  type StageOrientation,
} from '../models/project';

export interface CreateProjectInput {
  name: string;
  width: number;
  height: number;
  orientation: StageOrientation;
  backgroundColor: string;
  template: ProjectTemplateId;
}

export function buildProjectFromTemplate(input: CreateProjectInput): NexusProject {
  const now = Date.now();
  const baseProject: NexusProject = {
    id: createId('proj'),
    formatVersion: NEXUS_FORMAT_VERSION,
    name: input.name,
    createdAt: now,
    updatedAt: now,
    settings: {
      width: input.width,
      height: input.height,
      orientation: input.orientation,
      backgroundColor: input.backgroundColor,
    },
    activeSceneId: '',
    initialSceneId: '',
    scenes: [],
    assets: [],
    folders: [],
    prefabs: [],
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
  };

  if (input.template === 'platformer_multiscene') {
    const menuId = createId('scene');
    const level1Id = createId('scene');
    const pauseId = createId('scene');

    const title = createGameObject('text', [], {
      name: 'Titulo_Juego',
      x: Math.round(input.width / 2),
      y: Math.round(input.height * 0.34),
      width: 520,
      height: 60,
    });
    title.text = {
      text: input.name.toUpperCase(),
      fontSize: 42,
      fontFamily: 'Plus Jakarta Sans',
      color: '#f8fafc',
      fontWeight: 'bold',
      align: 'center',
    };

    const playBtn = createGameObject('ui_button', [title], {
      name: 'Boton_Jugar',
      x: Math.round(input.width / 2),
      y: Math.round(input.height * 0.56),
      width: 220,
      height: 54,
    });
    playBtn.uiButton = {
      text: 'JUGAR',
      bgColor: '#2563eb',
      hoverColor: '#3b82f6',
      textColor: '#ffffff',
      borderColor: '#93c5fd',
      borderRadius: 10,
      fontSize: 20,
      onClickAction: 'load_scene',
      targetSceneId: level1Id,
      transition: 'fadeBlack',
    };

    const menuScene: SceneData = {
      id: menuId,
      name: 'Menu_Principal',
      kind: 'main_menu',
      nextSceneId: level1Id,
      backgroundColor: input.backgroundColor,
      gridVisible: true,
      gridSize: 32,
      snapToGrid: false,
      objects: [title, playBtn],
      mechanics: [],
    };

    const floor = createGameObject('rectangle', [], {
      name: 'Suelo',
      x: Math.round(input.width / 2),
      y: input.height - 48,
      width: input.width - 80,
      height: 56,
    });
    floor.rectangle = {
      fillColor: '#1e293b',
      strokeColor: '#475569',
      strokeWidth: 2,
      cornerRadius: 6,
    };
    floor.layer = 'Ground';
    floor.components.push({ id: createId('cmp'), type: 'solid', enabled: true, config: {} });

    const player = createGameObject('rectangle', [floor], {
      name: 'Jugador',
      x: 160,
      y: input.height - 140,
      width: 48,
      height: 56,
    });
    player.rectangle = {
      fillColor: '#3b82f6',
      strokeColor: '#93c5fd',
      strokeWidth: 2,
      cornerRadius: 8,
    };
    player.layer = 'Player';
    player.components.push({
      id: createId('cmp'),
      type: 'player_platformer',
      enabled: true,
      config: { profile: 'preciso', maxSpeed: 220, acceleration: 1500, deceleration: 2100, jumpForce: 500, gravity: 1280 },
    });

    const coin = createGameObject('circle', [floor, player], {
      name: 'Moneda_01',
      x: Math.round(input.width * 0.5),
      y: input.height - 110,
      width: 32,
      height: 32,
    });
    coin.circle = { fillColor: '#fbbf24', strokeColor: '#f59e0b', strokeWidth: 2, radius: 16 };
    coin.layer = 'Collectible';
    coin.components.push({
      id: createId('cmp'),
      type: 'collectible',
      enabled: true,
      config: { points: 25 },
    });

    const pauseBtn = createGameObject('ui_button', [floor, player, coin], {
      name: 'Boton_Pausa',
      x: input.width - 90,
      y: 42,
      width: 110,
      height: 36,
    });
    pauseBtn.uiButton = {
      text: 'PAUSA',
      bgColor: '#1e293b',
      hoverColor: '#334155',
      textColor: '#e2e8f0',
      borderColor: '#475569',
      borderRadius: 6,
      fontSize: 13,
      onClickAction: 'overlay_scene',
      targetSceneId: pauseId,
      transition: 'none',
    };

    const level1Scene: SceneData = {
      id: level1Id,
      name: 'Nivel_01',
      kind: 'level',
      backgroundColor: input.backgroundColor,
      gridVisible: true,
      gridSize: 32,
      snapToGrid: false,
      cameraConfig: { followObjectId: player.id, lerp: 0.14, clampToBounds: true, worldWidth: input.width, worldHeight: input.height },
      objects: [floor, player, coin, pauseBtn],
      mechanics: [],
    };

    const pausePanel = createGameObject('ui_panel', [], {
      name: 'Panel_Pausa',
      x: Math.round(input.width / 2),
      y: Math.round(input.height / 2),
      width: 340,
      height: 220,
    });
    const resumeBtn = createGameObject('ui_button', [pausePanel], {
      name: 'Boton_Reanudar',
      x: Math.round(input.width / 2),
      y: Math.round(input.height / 2) + 24,
      width: 180,
      height: 44,
    });
    resumeBtn.uiButton = {
      text: 'CONTINUAR',
      bgColor: '#10b981',
      hoverColor: '#34d399',
      textColor: '#052e16',
      borderColor: '#6ee7b7',
      borderRadius: 8,
      fontSize: 16,
      onClickAction: 'pop_scene',
    };

    const pauseScene: SceneData = {
      id: pauseId,
      name: 'Pausa',
      kind: 'pause',
      backgroundColor: '#09090d',
      gridVisible: false,
      gridSize: 32,
      snapToGrid: false,
      objects: [pausePanel, resumeBtn],
      mechanics: [],
    };

    baseProject.scenes = [menuScene, level1Scene, pauseScene];
    baseProject.initialSceneId = menuId;
    baseProject.activeSceneId = menuId;
    return baseProject;
  }

  if (input.template === 'topdown_adventure') {
    const sceneId = createId('scene');
    const hero = createGameObject('circle', [], {
      name: 'Explorador',
      x: Math.round(input.width / 2),
      y: Math.round(input.height / 2),
      width: 48,
      height: 48,
    });
    hero.circle = { fillColor: '#38bdf8', strokeColor: '#0284c7', strokeWidth: 3, radius: 24 };
    hero.layer = 'Player';
    hero.components.push({
      id: createId('cmp'),
      type: 'player_topdown',
      enabled: true,
      config: { profile: 'preciso', maxSpeed: 210, acceleration: 1400, deceleration: 1800 },
    });

    const gem = createGameObject('circle', [hero], {
      name: 'Orbe_Energia',
      x: Math.round(input.width * 0.72),
      y: Math.round(input.height * 0.45),
      width: 30,
      height: 30,
    });
    gem.circle = { fillColor: '#10b981', strokeColor: '#6ee7b7', strokeWidth: 2, radius: 15 };
    gem.components.push({
      id: createId('cmp'),
      type: 'collectible',
      enabled: true,
      config: { points: 50 },
    });

    const scene: SceneData = {
      id: sceneId,
      name: 'Escena_01',
      kind: 'level',
      backgroundColor: input.backgroundColor,
      gridVisible: true,
      gridSize: 32,
      snapToGrid: false,
      cameraConfig: { followObjectId: hero.id, lerp: 0.14 },
      objects: [hero, gem],
      mechanics: [],
    };

    baseProject.scenes = [scene];
    baseProject.initialSceneId = sceneId;
    baseProject.activeSceneId = sceneId;
    return baseProject;
  }

  // Plantilla por defecto: estrictamente 1 única escena inicial vacía (Escena_01)
  const sceneId = createId('scene');
  baseProject.scenes = [
    {
      id: sceneId,
      name: 'Escena_01',
      kind: 'level',
      backgroundColor: input.backgroundColor,
      gridVisible: true,
      gridSize: 32,
      snapToGrid: false,
      objects: [],
      mechanics: [],
    },
  ];
  baseProject.initialSceneId = sceneId;
  baseProject.activeSceneId = sceneId;
  return baseProject;
}
