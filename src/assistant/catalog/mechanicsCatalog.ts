import type {
  EngineComponentData,
  GameMechanic,
  GameObjectData,
  ProjectVariable,
  SceneData,
} from '../../engine/core/types';
import { createId } from '../../utils/id';

export type MechanicFamily =
  | 'Movimiento'
  | 'Animación'
  | 'Física y Colisiones'
  | 'Interacción'
  | 'IA de Enemigos'
  | 'Audio'
  | 'Cámara'
  | 'Escenas y UI';

export interface CatalogApplyPatch {
  updatedObject?: GameObjectData;
  addedMechanic?: GameMechanic;
  addedVariable?: ProjectVariable;
  summary: string;
}

export interface MechanicCatalogEntry {
  id: string;
  family: MechanicFamily;
  name: string;
  description: string;
  keywords: string[];
  compatibleWith: Array<
    'sprite' | 'rectangle' | 'circle' | 'tilemap' | 'ui_button' | 'ui_panel' | 'ui_progress_bar' | 'ui_leaderboard' | 'any'
  >;
  requiresComponents: string[];
  events: string[];
  actions: string[];
  buildApplyPatch: (
    targetObject: GameObjectData | null,
    scene: SceneData,
    existingVariables: ProjectVariable[]
  ) => CatalogApplyPatch | null;
}

function upsertComponent(
  obj: GameObjectData,
  type: string,
  defaultConfig: Record<string, unknown>
): EngineComponentData[] {
  const existing = obj.components.find((c) => c.type === type);
  if (existing) {
    return obj.components.map((c) =>
      c.id === existing.id ? { ...c, enabled: true } : c
    );
  }
  return [
    ...obj.components,
    {
      id: createId('cmp'),
      type,
      enabled: true,
      config: { ...defaultConfig },
    },
  ];
}

export const MECHANICS_CATALOG: MechanicCatalogEntry[] = [
  {
    id: 'movement.platformer',
    family: 'Movimiento',
    name: 'Movimiento de Plataformas 2D',
    description:
      'Desplazamiento lateral controlable con aceleración, fricción, coyote time, salto variable y colisión con sólidos.',
    keywords: [
      'plataforma',
      'plataformas',
      'saltar',
      'salto',
      'gravedad',
      'jugador',
      'personaje',
      'correr',
      'caminar',
      'mover',
      'teclado',
      'wasd',
    ],
    compatibleWith: ['sprite', 'rectangle', 'circle'],
    requiresComponents: [],
    events: ['input.pressed', 'object.grounded'],
    actions: ['object.move', 'audio.beep'],
    buildApplyPatch: (target) => {
      if (!target) return null;
      return {
        updatedObject: {
          ...target,
          components: upsertComponent(target, 'player_platformer', {
            profile: 'preciso',
            maxSpeed: 220,
            acceleration: 1500,
            deceleration: 2100,
            jumpForce: 500,
            gravity: 1280,
          }),
        },
        summary: `Movimiento de plataformas aplicado a "${target.name}".`,
      };
    },
  },
  {
    id: 'movement.topdown',
    family: 'Movimiento',
    name: 'Movimiento 4 Direcciones (Top-Down)',
    description:
      'Desplazamiento libre arriba, abajo, izquierda y derecha con aceleración suave, normalización diagonal y colisiones sólidas.',
    keywords: [
      'topdown',
      'top down',
      'cuatro direcciones',
      '4 direcciones',
      'arriba',
      'abajo',
      'rpg',
      'aventura',
      'mover',
      'caminar',
      'jugador',
    ],
    compatibleWith: ['sprite', 'rectangle', 'circle'],
    requiresComponents: [],
    events: ['input.pressed'],
    actions: ['object.move'],
    buildApplyPatch: (target) => {
      if (!target) return null;
      return {
        updatedObject: {
          ...target,
          components: upsertComponent(target, 'player_topdown', {
            profile: 'preciso',
            maxSpeed: 210,
            acceleration: 1400,
            deceleration: 1800,
          }),
        },
        summary: `Movimiento en 4 direcciones aplicado a "${target.name}".`,
      };
    },
  },
  {
    id: 'animation.link_walk',
    family: 'Animación',
    name: 'Vincular animación de caminar al movimiento',
    description:
      'Configura los fotogramas de spritesheet y vincula automáticamente la reproducción (idle/walk/jump) a la velocidad del personaje.',
    keywords: [
      'animacion',
      'animar',
      'caminar',
      'vincular',
      'spritesheet',
      'fotogramas',
      'idle',
      'walk',
      'correr',
    ],
    compatibleWith: ['sprite'],
    requiresComponents: ['player_platformer | player_topdown | patrol | chase_player'],
    events: ['tick'],
    actions: ['animation.play'],
    buildApplyPatch: (target) => {
      if (!target || target.type !== 'sprite' || !target.sprite) return null;
      const prev = target.sprite.animation;
      const cols = Math.max(2, prev?.cols ?? 4);
      const rows = Math.max(1, prev?.rows ?? 1);
      const frameCount = Math.max(2, prev?.frameCount ?? cols * rows);
      return {
        updatedObject: {
          ...target,
          sprite: {
            ...target.sprite,
            animation: {
              enabled: true,
              cols,
              rows,
              frameCount,
              fps: prev?.fps ?? 8,
              loop: true,
              playing: true,
              linkToMovement: true,
              activeClip: 'walk',
              clips: prev?.clips ?? [
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
                  frameCount,
                  fps: prev?.fps ?? 8,
                  loop: true,
                },
              ],
            },
          },
        },
        summary: `Animación de caminar vinculada al movimiento en "${target.name}".`,
      };
    },
  },
  {
    id: 'physics.solid',
    family: 'Física y Colisiones',
    name: 'Sólido / Plataforma de Colisión',
    description:
      'Convierte el objeto o mapa de tiles en una superficie física sólida que bloquea y sostiene al jugador.',
    keywords: ['solido', 'suelo', 'piso', 'pared', 'colision', 'obstaculo', 'plataforma', 'bloque'],
    compatibleWith: ['any'],
    requiresComponents: [],
    events: ['collision.enter'],
    actions: [],
    buildApplyPatch: (target) => {
      if (!target) return null;
      return {
        updatedObject: {
          ...target,
          components: upsertComponent(target, 'solid', {}),
        },
        summary: `"${target.name}" configurado como cuerpo sólido.`,
      };
    },
  },
  {
    id: 'ai.chase_player',
    family: 'IA de Enemigos',
    name: 'Perseguir / Seguir al Jugador',
    description:
      'El personaje detecta automáticamente al jugador dentro de un radio y se aproxima manteniendo una distancia mínima.',
    keywords: [
      'seguir',
      'perseguir',
      'acercarse',
      'buscar',
      'objetivo',
      'enemigo',
      'ia',
      'mascota',
      'acompanante',
      'jugador',
      'rango',
    ],
    compatibleWith: ['sprite', 'rectangle', 'circle'],
    requiresComponents: [],
    events: ['tick'],
    actions: ['object.move'],
    buildApplyPatch: (target) => {
      if (!target) return null;
      return {
        updatedObject: {
          ...target,
          components: upsertComponent(target, 'chase_player', {
            speed: 135,
            detectRadius: 460,
            stopDistance: 36,
          }),
        },
        summary: `IA de seguimiento al jugador aplicada a "${target.name}".`,
      };
    },
  },
  {
    id: 'ai.patrol',
    family: 'IA de Enemigos',
    name: 'Patrulla Automática',
    description:
      'Mueve el objeto continuamente de un extremo a otro en eje horizontal o vertical.',
    keywords: ['patrulla', 'patrullar', 'vigia', 'enemigo', 'dron', 'ida y vuelta', 'oscilar'],
    compatibleWith: ['sprite', 'rectangle', 'circle'],
    requiresComponents: [],
    events: ['tick'],
    actions: ['object.move'],
    buildApplyPatch: (target) => {
      if (!target) return null;
      return {
        updatedObject: {
          ...target,
          components: upsertComponent(target, 'patrol', {
            axis: 'x',
            distance: 150,
            speed: 110,
          }),
        },
        summary: `Patrulla automática aplicada a "${target.name}".`,
      };
    },
  },
  {
    id: 'interaction.collect_coin_rule',
    family: 'Interacción',
    name: 'Regla: Recoger Objeto + Puntos + Sonido + Partículas',
    description:
      'Crea una regla estructurada completa: CUANDO el jugador colisiona con el objeto, suma puntos al marcador, reproduce sonido, lanza partículas y destruye el objeto.',
    keywords: [
      'recoger',
      'moneda',
      'gema',
      'coleccionable',
      'puntos',
      'marcador',
      'score',
      'particulas',
      'sonido',
      'destruir',
      'colision',
    ],
    compatibleWith: ['sprite', 'rectangle', 'circle', 'any'],
    requiresComponents: [],
    events: ['collision.enter'],
    actions: ['variable.add', 'audio.beep', 'particles.burst', 'object.destroy'],
    buildApplyPatch: (target, scene, existingVariables) => {
      const playerObj =
        scene.objects.find((o) =>
          o.components.some(
            (c) =>
              c.enabled &&
              (c.type === 'player_platformer' || c.type === 'player_topdown')
          )
        ) ?? null;

      const collectibleObj =
        target && !target.components.some((c) => c.type.startsWith('player_'))
          ? target
          : scene.objects.find((o) =>
              o.components.some((c) => c.enabled && c.type === 'collectible')
            ) ?? target;

      if (!collectibleObj) return null;

      const hasScoreVar = existingVariables.some((v) => v.name === 'puntos');
      const mechanic: GameMechanic = {
        id: createId('mech'),
        name: `Recoger ${collectibleObj.name}`,
        enabled: true,
        priority: 10,
        ownerObjectId: collectibleObj.id,
        trigger: {
          event: 'collision.enter',
          sourceObjectId: playerObj?.id,
          target: collectibleObj.id,
        },
        conditions: [
          {
            id: createId('cond'),
            type: 'object.visible',
            target: collectibleObj.id,
            value: true,
          },
        ],
        actions: [
          {
            id: createId('act'),
            type: 'variable.add',
            parameters: { variable: 'puntos', amount: 25 },
          },
          {
            id: createId('act'),
            type: 'audio.beep',
            parameters: { preset: 'coin', channel: 'sfx' },
          },
          {
            id: createId('act'),
            type: 'particles.burst',
            parameters: { target: collectibleObj.id, color: '#34d399', count: 14 },
          },
          {
            id: createId('act'),
            type: 'object.destroy',
            parameters: { target: collectibleObj.id },
          },
        ],
      };

      return {
        addedMechanic: mechanic,
        addedVariable: hasScoreVar
          ? undefined
          : {
              id: createId('var'),
              name: 'puntos',
              scope: 'global',
              type: 'number',
              initialValue: 0,
            },
        summary: `Regla de recolección creada para "${collectibleObj.name}".`,
      };
    },
  },
  {
    id: 'audio.jump_sfx',
    family: 'Audio',
    name: 'Sonido al Saltar (Tecla Espacio)',
    description:
      'Crea una regla que reproduce un efecto de sonido retro mediante Web Audio API cuando el jugador pulsa Espacio en el suelo.',
    keywords: ['sonido', 'audio', 'salto', 'saltar', 'espacio', 'efecto', 'sfx', 'tecla'],
    compatibleWith: ['any'],
    requiresComponents: [],
    events: ['input.pressed'],
    actions: ['audio.beep'],
    buildApplyPatch: (target, scene) => {
      const playerObj =
        target?.components.some((c) => c.type === 'player_platformer')
          ? target
          : scene.objects.find((o) =>
              o.components.some((c) => c.enabled && c.type === 'player_platformer')
            );
      const mechanic: GameMechanic = {
        id: createId('mech'),
        name: 'Efecto sonoro de salto',
        enabled: true,
        priority: 5,
        ownerObjectId: playerObj?.id ?? null,
        trigger: {
          event: 'input.pressed',
          key: 'Space',
        },
        conditions: playerObj
          ? [
              {
                id: createId('cond'),
                type: 'object.grounded',
                target: playerObj.id,
                value: true,
              },
            ]
          : [],
        actions: [
          {
            id: createId('act'),
            type: 'audio.beep',
            parameters: { preset: 'jump', channel: 'sfx' },
          },
        ],
      };
      return {
        addedMechanic: mechanic,
        summary: 'Regla de sonido al saltar añadida a la escena.',
      };
    },
  },
  {
    id: 'audio.sound_trigger_touch',
    family: 'Audio',
    name: 'Disparador de Sonido por Evento en Objeto',
    description:
      'Añade un disparador al objeto seleccionado para reproducir un efecto importado de tu PC (o sintetizado) al tocar al jugador, hacer clic o destruirse.',
    keywords: ['sonido', 'audio', 'mp3', 'wav', 'pc', 'disparador', 'trigger', 'efecto', 'evento'],
    compatibleWith: ['sprite', 'rectangle', 'circle', 'ui_button', 'any'],
    requiresComponents: [],
    events: ['collision.enter'],
    actions: ['audio.play'],
    buildApplyPatch: (target) => {
      if (!target) return null;
      return {
        updatedObject: {
          ...target,
          components: upsertComponent(target, 'audio.sound_trigger', {
            event: target.type === 'ui_button' ? 'onClick' : 'onTouchPlayer',
            audioAssetId: '',
            preset: 'powerup',
            channel: target.type === 'ui_button' ? 'ui' : 'sfx',
            volume: 1,
            pitch: 1,
            randomPitch: 0,
            cooldown: 0.4,
            loop: false,
            key: 'KeyE',
          }),
        },
        summary: `Disparador de sonido añadido a "${target.name}". Elige tu archivo en el Inspector.`,
      };
    },
  },
  {
    id: 'audio.music_zone_region',
    family: 'Audio',
    name: 'Zona de Música Dinámica',
    description:
      'Cambia la música de fondo en bucle cuando el jugador entra en el área del objeto seleccionado.',
    keywords: ['musica', 'fondo', 'bgm', 'zona', 'nivel', 'jefe', 'cueva', 'mp3', 'loop'],
    compatibleWith: ['sprite', 'rectangle', 'circle', 'any'],
    requiresComponents: [],
    events: ['trigger.enter'],
    actions: ['music.play'],
    buildApplyPatch: (target) => {
      if (!target) return null;
      return {
        updatedObject: {
          ...target,
          components: upsertComponent(target, 'audio.music_zone', {
            audioAssetId: '',
            triggerMode: 'onTouchPlayer',
            volume: 0.8,
            loop: true,
            keepIfSame: true,
          }),
        },
        summary: `Zona de música añadida a "${target.name}". Selecciona la pista en el Inspector.`,
      };
    },
  },
  {
    id: 'camera.impact_shake',
    family: 'Cámara',
    name: 'Sacudida de Cámara y Destello',
    description:
      'Añade sensación de impacto mediante sacudida de cámara cuando ocurre una colisión.',
    keywords: ['camara', 'sacudida', 'shake', 'temblor', 'impacto', 'golpe', 'efecto'],
    compatibleWith: ['any'],
    requiresComponents: [],
    events: ['collision.enter'],
    actions: ['camera.shake', 'audio.beep'],
    buildApplyPatch: (target, scene) => {
      const playerObj = scene.objects.find((o) =>
        o.components.some(
          (c) =>
            c.enabled &&
            (c.type === 'player_platformer' || c.type === 'player_topdown')
        )
      );
      if (!target) return null;
      return {
        addedMechanic: {
          id: createId('mech'),
          name: `Impacto con ${target.name}`,
          enabled: true,
          priority: 8,
          ownerObjectId: target.id,
          trigger: {
            event: 'collision.enter',
            sourceObjectId: playerObj?.id,
            target: target.id,
          },
          conditions: [],
          actions: [
            {
              id: createId('act'),
              type: 'camera.shake',
              parameters: { intensity: 10, duration: 0.25 },
            },
            {
              id: createId('act'),
              type: 'audio.beep',
              parameters: { preset: 'hit', channel: 'sfx' },
            },
          ],
        },
        summary: `Sacudida de cámara al tocar "${target.name}" añadida.`,
      };
    },
  },
  {
    id: 'scene.goal_portal',
    family: 'Escenas y UI',
    name: 'Portal / Meta de siguiente nivel',
    description:
      'Convierte el objeto en una meta o portal que carga el siguiente nivel automáticamente cuando el jugador entra en contacto.',
    keywords: ['meta', 'portal', 'nivel', 'siguiente', 'puerta', 'escena', 'transicion', 'ganar'],
    compatibleWith: ['sprite', 'rectangle', 'circle'],
    requiresComponents: [],
    events: ['trigger.enter'],
    actions: ['scene.nextLevel', 'scene.load'],
    buildApplyPatch: (target, scene) => {
      if (!target) return null;
      return {
        updatedObject: {
          ...target,
          components: upsertComponent(target, 'goal_portal', {
            targetSceneId: scene.nextSceneId ?? '',
            transition: 'fadeBlack',
          }),
        },
        summary: `"${target.name}" configurado como portal hacia el siguiente nivel.`,
      };
    },
  },
  {
    id: 'scene.ui_button_load',
    family: 'Escenas y UI',
    name: 'Botón UI para cambiar de escena',
    description:
      'Crea una regla CUANDO se hace clic en el botón UI para cargar otra escena o pasar al siguiente nivel.',
    keywords: ['boton', 'menu', 'ui', 'clic', 'escena', 'jugar', 'cargar', 'navegar'],
    compatibleWith: ['ui_button', 'any'],
    requiresComponents: [],
    events: ['ui.click'],
    actions: ['scene.nextLevel'],
    buildApplyPatch: (target, scene) => {
      const btn =
        target?.type === 'ui_button'
          ? target
          : scene.objects.find((o) => o.type === 'ui_button') ?? target;
      if (!btn) return null;
      return {
        addedMechanic: {
          id: createId('mech'),
          name: `Clic en ${btn.name} -> Siguiente nivel`,
          enabled: true,
          priority: 12,
          ownerObjectId: btn.id,
          trigger: {
            event: 'ui.click',
            target: btn.id,
          },
          conditions: [],
          actions: [
            {
              id: createId('act'),
              type: 'audio.beep',
              parameters: { preset: 'coin', channel: 'ui' },
            },
            scene.nextSceneId
              ? {
                  id: createId('act'),
                  type: 'scene.load',
                  parameters: { sceneId: scene.nextSceneId, transition: 'fadeBlack' },
                }
              : {
                  id: createId('act'),
                  type: 'scene.nextLevel',
                  parameters: { transition: 'fadeBlack' },
                },
          ],
        },
        summary: `Regla de cambio de escena creada para el botón "${btn.name}".`,
      };
    },
  },
  {
    id: 'combat.health_system',
    family: 'Física y Colisiones',
    name: 'Sistema de Salud y Daño',
    description:
      'Añade salud máxima y actual al objeto, permitiendo recibir daño, curarse y disparar eventos cuando la salud llega a cero.',
    keywords: ['salud', 'vida', 'hp', 'dano', 'curar', 'combate', 'enemigo', 'jugador'],
    compatibleWith: ['sprite', 'rectangle', 'circle'],
    requiresComponents: [],
    events: ['health.zero'],
    actions: ['health.damage', 'health.heal'],
    buildApplyPatch: (target, _scene, existingVariables) => {
      if (!target) return null;
      const hasSaludVar = existingVariables.some((v) => v.name === 'salud');
      return {
        updatedObject: {
          ...target,
          components: upsertComponent(target, 'health', {
            maxHealth: 100,
            currentHealth: 100,
          }),
        },
        addedVariable: hasSaludVar
          ? undefined
          : {
              id: createId('var'),
              name: 'salud',
              scope: 'global',
              type: 'number',
              initialValue: 100,
            },
        summary: `Sistema de Salud (100 HP) añadido a "${target.name}".`,
      };
    },
  },
  {
    id: 'scene.checkpoint',
    family: 'Escenas y UI',
    name: 'Punto de control (Checkpoint)',
    description:
      'Guarda automáticamente la posición de reaparición del jugador cuando toca este objeto.',
    keywords: ['checkpoint', 'bandera', 'guardar', 'respawn', 'reaparecer', 'punto de control'],
    compatibleWith: ['sprite', 'rectangle', 'circle'],
    requiresComponents: [],
    events: ['trigger.enter'],
    actions: ['checkpoint.save'],
    buildApplyPatch: (target) => {
      if (!target) return null;
      return {
        updatedObject: {
          ...target,
          components: upsertComponent(target, 'checkpoint', {}),
        },
        summary: `"${target.name}" configurado como Checkpoint de reaparición.`,
      };
    },
  },
];
