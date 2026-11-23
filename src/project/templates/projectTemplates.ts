import { DEFAULT_AUDIO_BUSES } from '../../engine/audio/audioEngine';
import { buildNavMeshFromScene } from '../../engine/ai3d/navmesh';
import type { SceneData } from '../../engine/core/types';
import { createGameObject } from '../../engine/objects/factory';
import { createId } from '../../utils/id';
import {
  NEXUS_FORMAT_VERSION,
  type NexusProject,
  type ProjectMode,
  type ProjectTemplateId,
  type StageOrientation,
} from '../models/project';

export interface CreateProjectInput {
  name: string;
  mode?: ProjectMode;
  width: number;
  height: number;
  orientation: StageOrientation;
  backgroundColor: string;
  template: ProjectTemplateId;
}

export function buildProjectFromTemplate(input: CreateProjectInput): NexusProject {
  const now = Date.now();
  const mode: ProjectMode =
    input.mode ??
    (input.template === 'arena_3d' || input.template === 'platformer_3d' ? '3d' : '2d');

  const baseProject: NexusProject = {
    id: createId('proj'),
    formatVersion: NEXUS_FORMAT_VERSION,
    mode,
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
    scripts: [],
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
      {
        id: createId('var'),
        name: 'salud',
        scope: 'global',
        type: 'number',
        initialValue: 100,
      },
    ],
    audioBuses: structuredClone(DEFAULT_AUDIO_BUSES),
  };

  if (mode === '3d') {
    const sceneId = createId('scene');

    if (input.template === 'arena_3d') {
      const floor = createGameObject('mesh_3d', [], {
        name: 'Suelo_Arena',
        shape3d: 'plane',
        x3d: 0,
        y3d: -0.2,
        z3d: 0,
        color: '#334155',
      });
      floor.transform3d = { x: 0, y: -0.2, z: 0, rx: 0, ry: 0, rz: 0, sx: 28, sy: 0.4, sz: 28 };

      const ramp = createGameObject('mesh_3d', [floor], {
        name: 'Rampa_Central',
        shape3d: 'ramp',
        x3d: -4,
        y3d: 1.1,
        z3d: 0,
        color: '#475569',
      });
      ramp.transform3d = { x: -4, y: 1.1, z: 0, rx: 0, ry: 0, rz: 0, sx: 4.5, sy: 2.2, sz: 4 };

      const platform = createGameObject('mesh_3d', [floor, ramp], {
        name: 'Plataforma_Alta',
        shape3d: 'box',
        color: '#334155',
      });
      platform.transform3d = { x: -7.5, y: 1.1, z: 0, rx: 0, ry: 0, rz: 0, sx: 3.5, sy: 2.2, sz: 5 };

      const arch = createGameObject('mesh_3d', [floor, ramp, platform], {
        name: 'Arco_Entrada',
        shape3d: 'arch',
        color: '#6366f1',
      });
      arch.transform3d = { x: 4, y: 2, z: -5, rx: 0, ry: 0, rz: 0, sx: 5, sy: 4, sz: 1.4 };

      const wallA = createGameObject('mesh_3d', [floor, ramp, platform, arch], {
        name: 'Pilar_Obsidiana',
        shape3d: 'cylinder',
        color: '#64748b',
      });
      wallA.transform3d = { x: 5, y: 1.8, z: 4, rx: 0, ry: 0, rz: 0, sx: 2, sy: 3.6, sz: 2 };

      const player = createGameObject('mesh_3d', [floor, ramp, platform, arch, wallA], {
        name: 'Jugador_3D',
        shape3d: 'box',
        color: '#38bdf8',
      });
      player.layer = 'Player';
      player.transform3d = { x: 0, y: 1.2, z: 6, rx: 0, ry: 0, rz: 0, sx: 1.1, sy: 1.6, sz: 1.1 };
      player.physics3d = {
        enabled: true,
        bodyType: 'dynamic',
        shape: 'box',
        mass: 1,
        gravityScale: 1,
        restitution: 0.05,
        friction: 0.7,
      };
      player.components.push({
        id: createId('cmp'),
        type: 'player_3d',
        enabled: true,
        config: { speed: 7, jumpForce: 9 },
      });

      const enemy = createGameObject('mesh_3d', [floor, ramp, platform, arch, wallA, player], {
        name: 'Centinela_IA',
        shape3d: 'box',
        color: '#ef4444',
      });
      enemy.layer = 'Enemy';
      enemy.transform3d = { x: 7, y: 1.2, z: -6, rx: 0, ry: 0, rz: 0, sx: 1.2, sy: 1.8, sz: 1.2 };
      enemy.physics3d = {
        enabled: true,
        bodyType: 'dynamic',
        shape: 'box',
        mass: 1,
        gravityScale: 1,
        restitution: 0,
        friction: 0.7,
      };
      enemy.aiAgent = {
        enabled: true,
        speed: 3.6,
        acceleration: 10,
        avoidanceRadius: 1.2,
        stoppingDistance: 1.6,
        mode: 'chase',
        targetObjectId: player.id,
      };

      const mainCam = createGameObject('camera_3d', [floor, player], {
        name: 'Camara_Principal',
        x3d: 0,
        y3d: 6.5,
        z3d: 14,
      });
      if (mainCam.camera3d) {
        mainCam.camera3d.isMainCamera = true;
        mainCam.camera3d.mode = 'smooth_follow';
        mainCam.camera3d.targetObjectId = player.id;
        mainCam.camera3d.offsetX = 0;
        mainCam.camera3d.offsetY = 6.5;
        mainCam.camera3d.offsetZ = 11;
      }

      const topCam = createGameObject('camera_3d', [floor, player, mainCam], {
        name: 'Camara_Tactica',
        x3d: 0,
        y3d: 19,
        z3d: 6,
      });
      if (topCam.camera3d) {
        topCam.camera3d.isMainCamera = false;
        topCam.camera3d.mode = 'fixed';
        topCam.camera3d.targetObjectId = player.id;
      }

      const torch = createGameObject('light_3d', [floor, player], {
        name: 'Luz_Antorcha',
        x3d: 4,
        y3d: 4.5,
        z3d: -3.5,
        color: '#fb923c',
      });
      torch.components.push({
        id: createId('cmp'),
        type: 'lighting.flicker',
        enabled: true,
        config: { speed: 7, amount: 0.25 },
      });

      const hud = createGameObject('ui_widget', [floor, player, mainCam], {
        name: 'HUD_Arena_3D',
        x: 165,
        y: 164,
        width: 280,
        height: 120,
        html: `<div class="nx-hud">\n  <div class="nx-row"><strong>ARENA 3D</strong> <span data-nexus-var="salud">100</span> HP</div>\n  <div class="nx-actions">\n    <button data-nexus-action="var:puntos+=25">+25 Puntos</button>\n    <button data-nexus-action="audio:mute:music">Silenciar Música</button>\n  </div>\n</div>`,
        css: `.nx-hud{width:100%;height:100%;padding:12px;border-radius:12px;background:rgba(15,23,42,0.88);border:1px solid rgba(56,189,248,0.45);color:#f8fafc;font-family:system-ui,sans-serif;display:flex;flex-direction:column;justify-content:space-between}\n.nx-row{display:flex;justify-content:space-between;font-size:13px}\n.nx-actions{display:flex;gap:6px}\n.nx-actions button{flex:1;padding:6px 8px;border:0;border-radius:6px;background:#2563eb;color:#fff;font-size:11px;font-weight:700;cursor:pointer}`,
      });

      const orb = createGameObject('mesh_3d', [floor, player, enemy], {
        name: 'Orbe_Energia',
        shape3d: 'sphere',
        color: '#facc15',
      });
      orb.layer = 'Collectible';
      orb.transform3d = { x: -4, y: 2.8, z: 0, rx: 0, ry: 0, rz: 0, sx: 0.9, sy: 0.9, sz: 0.9 };
      if (orb.mesh3d) {
        orb.mesh3d.emissive = '#f59e0b';
        orb.mesh3d.emissiveIntensity = 0.6;
      }
      if (orb.physics3d) orb.physics3d.isTrigger = true;
      orb.components.push({
        id: createId('cmp'),
        type: 'spin',
        enabled: true,
        config: { degPerSec: 120 },
      });

      const scene: SceneData = {
        id: sceneId,
        name: 'Arena_3D',
        kind: 'level',
        backgroundColor: input.backgroundColor,
        gridVisible: true,
        gridSize: 1,
        snapToGrid: true,
        activeCameraId: mainCam.id,
        lighting: {
          ambientColor: '#94a3b8',
          ambientIntensity: 0.65,
          smartBounce: true,
          bounceIntensity: 0.45,
          skyColor: '#bae6fd',
          groundColor: '#1e293b',
          sunColor: '#fff7ed',
          sunIntensity: 1.45,
          fogEnabled: true,
          fogColor: input.backgroundColor,
          fogNear: 24,
          fogFar: 80,
          dayNightEnabled: true,
          timeOfDay: 13.5,
          dayCycleSpeed: 0,
          cloudsEnabled: true,
        },
        objects: [
          floor,
          ramp,
          platform,
          arch,
          wallA,
          player,
          enemy,
          orb,
          mainCam,
          topCam,
          torch,
          hud,
        ],
        mechanics: [
          {
            id: createId('mech'),
            name: 'Recoger Orbe de Energía (+25 Puntos)',
            enabled: true,
            priority: 10,
            trigger: {
              event: 'collision.enter',
              sourceObjectId: player.id,
              target: orb.id,
            },
            conditions: [],
            actions: [
              { id: createId('act'), type: 'variable.add', parameters: { variable: 'puntos', amount: 25 } },
              { id: createId('act'), type: 'audio.play', parameters: { preset: 'coin', volume: 0.85 } },
              { id: createId('act'), type: 'vfx.emit', parameters: { target: orb.id, count: 24, color: '#facc15' } },
              { id: createId('act'), type: 'object.hide', parameters: { target: orb.id } },
            ],
          },
          {
            id: createId('mech'),
            name: 'Contacto con Centinela (-20 Salud)',
            enabled: true,
            priority: 9,
            trigger: {
              event: 'collision.enter',
              sourceObjectId: player.id,
              target: enemy.id,
            },
            conditions: [],
            actions: [
              { id: createId('act'), type: 'variable.add', parameters: { variable: 'salud', amount: -20 } },
              { id: createId('act'), type: 'audio.play', parameters: { preset: 'hit', volume: 0.9 } },
              { id: createId('act'), type: 'camera.shake', parameters: { intensity: 0.45, duration: 0.25 } },
              { id: createId('act'), type: 'physics.impulse', parameters: { target: player.id, ix: 0, iy: 6, iz: 4 } },
            ],
          },
          {
            id: createId('mech'),
            name: 'Salto Turbo con Shift',
            enabled: true,
            priority: 5,
            trigger: {
              event: 'input.pressed',
              key: 'ShiftLeft',
            },
            conditions: [],
            actions: [
              { id: createId('act'), type: 'physics.impulse', parameters: { target: player.id, ix: 0, iy: 8, iz: 0 } },
              { id: createId('act'), type: 'vfx.emit', parameters: { target: player.id, count: 14, color: '#38bdf8' } },
            ],
          },
        ],
      };
      scene.navMesh = buildNavMeshFromScene(scene);

      baseProject.scenes = [scene];
      baseProject.initialSceneId = sceneId;
      baseProject.activeSceneId = sceneId;
      return baseProject;
    }

    if (input.template === 'platformer_3d') {
      const floor = createGameObject('mesh_3d', [], {
        name: 'Base_Inicio',
        shape3d: 'plane',
        color: '#334155',
      });
      floor.transform3d = { x: 0, y: -0.2, z: 0, rx: 0, ry: 0, rz: 0, sx: 14, sy: 0.4, sz: 12 };

      const step1 = createGameObject('mesh_3d', [floor], {
        name: 'Plataforma_1',
        shape3d: 'box',
        color: '#0ea5e9',
      });
      step1.transform3d = { x: 6, y: 1.3, z: -2, rx: 0, ry: 0, rz: 0, sx: 4.5, sy: 0.6, sz: 4.5 };

      const step2 = createGameObject('mesh_3d', [floor, step1], {
        name: 'Plataforma_2',
        shape3d: 'box',
        color: '#8b5cf6',
      });
      step2.transform3d = { x: 12, y: 2.8, z: -2, rx: 0, ry: 0, rz: 0, sx: 4.5, sy: 0.6, sz: 4.5 };

      const player = createGameObject('mesh_3d', [floor, step1, step2], {
        name: 'Jugador_3D',
        shape3d: 'box',
        color: '#38bdf8',
      });
      player.layer = 'Player';
      player.transform3d = { x: 0, y: 1.2, z: 0, rx: 0, ry: 0, rz: 0, sx: 1.1, sy: 1.6, sz: 1.1 };
      player.physics3d = {
        enabled: true,
        bodyType: 'dynamic',
        shape: 'box',
        mass: 1,
        gravityScale: 1,
        restitution: 0.05,
        friction: 0.7,
      };
      player.components.push({
        id: createId('cmp'),
        type: 'player_3d',
        enabled: true,
        config: { speed: 7.5, jumpForce: 9.5 },
      });

      const cam = createGameObject('camera_3d', [floor, player], {
        name: 'Camara_Plataformas',
        x3d: 0,
        y3d: 7,
        z3d: 12,
      });
      if (cam.camera3d) {
        cam.camera3d.isMainCamera = true;
        cam.camera3d.targetObjectId = player.id;
      }

      const goalCrystal = createGameObject('mesh_3d', [floor, step1, step2, player], {
        name: 'Meta_Cristal',
        shape3d: 'sphere',
        color: '#22c55e',
      });
      goalCrystal.layer = 'Collectible';
      goalCrystal.transform3d = { x: 12, y: 4.1, z: -2, rx: 0, ry: 0, rz: 0, sx: 1, sy: 1, sz: 1 };
      if (goalCrystal.physics3d) goalCrystal.physics3d.isTrigger = true;
      goalCrystal.components.push({
        id: createId('cmp'),
        type: 'spin',
        enabled: true,
        config: { degPerSec: 110 },
      });

      const scene: SceneData = {
        id: sceneId,
        name: 'Nivel_3D_01',
        kind: 'level',
        backgroundColor: input.backgroundColor,
        gridVisible: true,
        gridSize: 1,
        snapToGrid: true,
        activeCameraId: cam.id,
        lighting: {
          ambientColor: '#94a3b8',
          ambientIntensity: 0.7,
          smartBounce: true,
          bounceIntensity: 0.4,
          skyColor: '#bae6fd',
          groundColor: '#1e293b',
          sunColor: '#ffffff',
          sunIntensity: 1.4,
          fogEnabled: false,
          fogColor: input.backgroundColor,
          fogNear: 25,
          fogFar: 90,
          dayNightEnabled: true,
          timeOfDay: 12,
          cloudsEnabled: true,
        },
        objects: [floor, step1, step2, player, goalCrystal, cam],
        mechanics: [
          {
            id: createId('mech'),
            name: 'Recoger Cristal Meta (+100 Puntos)',
            enabled: true,
            priority: 10,
            trigger: {
              event: 'collision.enter',
              sourceObjectId: player.id,
              target: goalCrystal.id,
            },
            conditions: [],
            actions: [
              { id: createId('act'), type: 'variable.add', parameters: { variable: 'puntos', amount: 100 } },
              { id: createId('act'), type: 'audio.play', parameters: { preset: 'powerup', volume: 0.9 } },
              { id: createId('act'), type: 'vfx.emit', parameters: { target: goalCrystal.id, count: 28, color: '#4ade80' } },
              { id: createId('act'), type: 'object.hide', parameters: { target: goalCrystal.id } },
            ],
          },
        ],
      };
      baseProject.scenes = [scene];
      baseProject.initialSceneId = sceneId;
      baseProject.activeSceneId = sceneId;
      return baseProject;
    }

    // Escena 3D base limpia (suelo + luz + cámara)
    const floor = createGameObject('mesh_3d', [], {
      name: 'Suelo_Base',
      shape3d: 'plane',
      color: '#1e293b',
    });
    floor.transform3d = { x: 0, y: -0.2, z: 0, rx: 0, ry: 0, rz: 0, sx: 20, sy: 0.4, sz: 20 };

    const cam = createGameObject('camera_3d', [floor], {
      name: 'Camara_Principal',
      x3d: 0,
      y3d: 6,
      z3d: 12,
    });

    const scene: SceneData = {
      id: sceneId,
      name: 'Escena_3D_01',
      kind: 'level',
      backgroundColor: input.backgroundColor,
      gridVisible: true,
      gridSize: 1,
      snapToGrid: true,
      activeCameraId: cam.id,
      lighting: {
        ambientColor: '#94a3b8',
        ambientIntensity: 0.7,
        smartBounce: true,
        bounceIntensity: 0.35,
        skyColor: '#bae6fd',
        groundColor: '#1e293b',
        sunColor: '#ffffff',
        sunIntensity: 1.35,
        fogEnabled: false,
        fogColor: input.backgroundColor,
        fogNear: 25,
        fogFar: 85,
      },
      objects: [floor, cam],
      mechanics: [],
    };
    baseProject.scenes = [scene];
    baseProject.initialSceneId = sceneId;
    baseProject.activeSceneId = sceneId;
    return baseProject;
  }

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
      mechanics: [
        {
          id: createId('mech'),
          name: 'Recoger Moneda (+25 Puntos)',
          enabled: true,
          priority: 10,
          trigger: {
            event: 'collision.enter',
            sourceObjectId: player.id,
            target: coin.id,
          },
          conditions: [],
          actions: [
            { id: createId('act'), type: 'variable.add', parameters: { variable: 'puntos', amount: 25 } },
            { id: createId('act'), type: 'audio.beep', parameters: { preset: 'coin', volume: 0.85 } },
            { id: createId('act'), type: 'particles.burst', parameters: { target: coin.id, color: '#fbbf24', count: 16 } },
            { id: createId('act'), type: 'object.destroy', parameters: { target: coin.id } },
          ],
        },
        {
          id: createId('mech'),
          name: 'Abrir Pausa con Escape',
          enabled: true,
          priority: 5,
          trigger: {
            event: 'input.pressed',
            key: 'Escape',
          },
          conditions: [],
          actions: [
            { id: createId('act'), type: 'scene.overlay', parameters: { sceneId: pauseId } },
          ],
        },
      ],
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
      mechanics: [
        {
          id: createId('mech'),
          name: 'Recoger Orbe de Energía (+50 Puntos)',
          enabled: true,
          priority: 10,
          trigger: {
            event: 'collision.enter',
            sourceObjectId: hero.id,
            target: gem.id,
          },
          conditions: [],
          actions: [
            { id: createId('act'), type: 'variable.add', parameters: { variable: 'puntos', amount: 50 } },
            { id: createId('act'), type: 'audio.beep', parameters: { preset: 'powerup', volume: 0.9 } },
            { id: createId('act'), type: 'particles.burst', parameters: { target: gem.id, color: '#10b981', count: 20 } },
            { id: createId('act'), type: 'object.destroy', parameters: { target: gem.id } },
          ],
        },
      ],
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
