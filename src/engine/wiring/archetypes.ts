import type {
  ArchetypeId,
  EngineComponentData,
  GameObjectData,
  SceneContextType,
  SceneData,
  WiringLink,
} from '../core/types';
import type { ProjectMode } from '../../project/models/project';
import { createId } from '../../utils/id';
import { getBehaviorEntry } from '../components/behaviorRegistry';

export interface ArchetypeBehaviorBlueprint {
  type: string;
  config?: Record<string, unknown>;
}

export interface ArchetypeAutoWireRule {
  fromBehavior: string;
  signal: string;
  toRole: string;
  toBehavior: string;
  action: string;
}

export interface ArchetypeRecipe {
  id: ArchetypeId;
  label: string;
  role: string;
  description: string;
  contexts: SceneContextType[];
  behaviors: ArchetypeBehaviorBlueprint[];
  autoWire: ArchetypeAutoWireRule[];
  netReplicated?: boolean;
}

export const ARCHETYPE_RECIPES: ArchetypeRecipe[] = [
  {
    id: 'collectible',
    label: 'Recolectable (Cristal / Moneda / Recurso)',
    role: 'collectible',
    description: 'Flota suavemente, entrega ítem al inventario del jugador con persistencia y reaparece.',
    contexts: ['gameplay', 'open_world'],
    behaviors: [
      { type: 'movement.sine_float', config: { axis: 'y', amplitude: 8, frequency: 1.5 } },
      {
        type: 'world.resource_node',
        config: { itemId: 'crystal', amount: 1, respawnSec: 20, interactRadius: 56, autoPickup: true },
      },
    ],
    autoWire: [
      {
        fromBehavior: 'world.resource_node',
        signal: 'onCollected',
        toRole: 'player',
        toBehavior: 'inventory.backpack',
        action: 'receiveItem',
      },
    ],
  },
  {
    id: 'fishing_rod',
    label: 'Caña de Pescar',
    role: 'tool',
    description: 'Herramienta equipable que pesca peces ponderados y los envía directo al inventario.',
    contexts: ['gameplay', 'open_world'],
    behaviors: [
      { type: 'tool.equippable', config: { slot: 'hand', toolType: 'rod', useKey: 'KeyF' } },
      {
        type: 'tool.fishing_rod',
        config: { castKey: 'KeyF', castRange: 120, biteTimeSec: 1.8, fishPool: 'trucha,salmon,pez_dorado' },
      },
    ],
    autoWire: [
      {
        fromBehavior: 'tool.fishing_rod',
        signal: 'onFishCaught',
        toRole: 'player',
        toBehavior: 'inventory.backpack',
        action: 'receiveItem',
      },
    ],
  },
  {
    id: 'capture_net',
    label: 'Red de Captura en Área',
    role: 'tool',
    description: 'Captura en área múltiples objetivos/recursos cercanos y los añade en lote al inventario.',
    contexts: ['gameplay', 'open_world'],
    behaviors: [
      { type: 'tool.equippable', config: { slot: 'hand', toolType: 'net', useKey: 'KeyG' } },
      { type: 'tool.capture_net', config: { swingKey: 'KeyG', radius: 110, maxTargets: 5, cooldownSec: 1.0 } },
    ],
    autoWire: [
      {
        fromBehavior: 'tool.capture_net',
        signal: 'onBatchCaptured',
        toRole: 'player',
        toBehavior: 'inventory.backpack',
        action: 'receiveBatch',
      },
    ],
  },
  {
    id: 'tool_harvest',
    label: 'Herramienta Recolectora (Pico / Hacha / Hoz)',
    role: 'tool',
    description: 'Extrae menas, árboles o cultivos en alcance y los deposita en el inventario del jugador.',
    contexts: ['gameplay', 'open_world'],
    behaviors: [
      { type: 'tool.equippable', config: { slot: 'hand', toolType: 'pickaxe', useKey: 'KeyE' } },
      { type: 'tool.harvest', config: { swingKey: 'KeyE', range: 85, power: 1, cooldownSec: 0.45 } },
    ],
    autoWire: [
      {
        fromBehavior: 'tool.harvest',
        signal: 'onHarvested',
        toRole: 'player',
        toBehavior: 'inventory.backpack',
        action: 'receiveItem',
      },
    ],
  },
  {
    id: 'boat',
    label: 'Bote / Vehículo Acuático',
    role: 'boat',
    description: 'Flota en el agua, permite subir/conducir y enfoca la cámara automáticamente al abordar.',
    contexts: ['gameplay', 'open_world'],
    behaviors: [
      { type: 'physics.water_buoyancy', config: { waterLevel: 0, buoyancy: 12, currentX: 0 } },
      { type: 'vehicle.watercraft', config: { boardKey: 'KeyE', maxSpeed: 220, turnSpeed: 140, boardRadius: 85 } },
    ],
    autoWire: [
      {
        fromBehavior: 'vehicle.watercraft',
        signal: 'onBoardStateChanged',
        toRole: 'player',
        toBehavior: 'juice.camera_follow',
        action: 'setTarget',
      },
    ],
  },
  {
    id: 'vehicle_land',
    label: 'Vehículo Terrestre / Montura',
    role: 'vehicle',
    description: 'Vehículo con derrape o montura rápida conectada al jugador y cámara.',
    contexts: ['gameplay', 'open_world'],
    behaviors: [
      { type: 'movement.vehicle_drift', config: { accelerateSpeed: 520, maxSpeed: 380, turnSpeed: 200 } },
      { type: 'vehicle.mount', config: { mode: 'mount', followSpeed: 240, followDistance: 72 } },
    ],
    autoWire: [
      {
        fromBehavior: 'vehicle.mount',
        signal: 'onMounted',
        toRole: 'player',
        toBehavior: 'juice.camera_follow',
        action: 'setTarget',
      },
    ],
  },
  {
    id: 'enemy_fsm',
    label: 'Enemigo IA + Salud + Botín',
    role: 'enemy',
    description: 'IA autónoma con patrulla/persecución/ataque, barra de salud y caída de loot al morir.',
    contexts: ['gameplay', 'open_world'],
    behaviors: [
      { type: 'combat.health_system', config: { maxHp: 100, currentHp: 100, showFloatingBar: true } },
      { type: 'ai.fsm_enemy', config: { patrolDistance: 120, detectRadius: 360, attackRange: 64 } },
      { type: 'rpg.loot_drop', config: { itemId: 'gold_coin', minAmount: 1, maxAmount: 3, dropChance: 0.9 } },
    ],
    autoWire: [
      {
        fromBehavior: 'rpg.loot_drop',
        signal: 'onLootDropped',
        toRole: 'player',
        toBehavior: 'inventory.backpack',
        action: 'receiveDrop',
      },
    ],
  },
  {
    id: 'npc_quest',
    label: 'NPC con Misiones y Recompensa',
    role: 'npc',
    description: 'Asigna misiones de recolección y entrega recompensas conectadas al jugador.',
    contexts: ['gameplay', 'open_world'],
    behaviors: [
      {
        type: 'rpg.quest_giver',
        config: { questId: 'quest_crystals', targetItem: 'crystal', requiredAmount: 3, rewardPoints: 100 },
      },
    ],
    autoWire: [
      {
        fromBehavior: 'rpg.quest_giver',
        signal: 'onQuestCompleted',
        toRole: 'player',
        toBehavior: 'persistence.player_save',
        action: 'saveNow',
      },
    ],
  },
  {
    id: 'portal_gate',
    label: 'Portal de Zona / Instancia',
    role: 'portal',
    description: 'Transporta al jugador entre escenas o zonas guardando progreso e inventario.',
    contexts: ['gameplay', 'open_world'],
    behaviors: [
      { type: 'world.zone_portal', config: { targetSceneId: '', spawnTag: 'spawn_default', preserveInventory: true } },
    ],
    autoWire: [
      {
        fromBehavior: 'world.zone_portal',
        signal: 'onEnterZone',
        toRole: 'player',
        toBehavior: 'persistence.player_save',
        action: 'saveNow',
      },
    ],
  },
  {
    id: 'open_world_player',
    label: 'Jugador Mundo Abierto + Mochila + Red',
    role: 'player',
    description: 'Configura al jugador completo con control 2D/3D, mochila persistente, vitales y sincronización de red.',
    contexts: ['gameplay', 'open_world'],
    netReplicated: true,
    behaviors: [
      { type: 'player_platformer', config: {} },
      { type: 'inventory.backpack', config: { maxSlots: 24, persistSave: true } },
      { type: 'survival.vitals', config: { hungerDrainPerMin: 3, thirstDrainPerMin: 4, staminaRegen: 18 } },
      { type: 'persistence.player_save', config: { slotKey: 'nexus_player_save_v1', autoSaveSec: 10, syncServer: true } },
      { type: 'net.entity_sync', config: { authority: 'local', roomId: 'global_1', syncRateHz: 12 } },
      { type: 'net.transform_sync', config: { interpolation: 0.25, threshold: 0.5 } },
      { type: 'juice.camera_follow', config: { lerp: 0.14, clampToBounds: true } },
    ],
    autoWire: [],
  },
  {
    id: 'menu_button',
    label: 'Botón / Elemento de Menú',
    role: 'ui',
    description: 'Control aislado al contexto de Menú/Pausa/Inventario para navegar sin mover el personaje.',
    contexts: ['menu', 'pause', 'inventory', 'ui'],
    behaviors: [
      { type: 'ui.menu_nav', config: { targetSceneId: '', focusOrder: 0 } },
    ],
    autoWire: [],
  },
];

export function getArchetypeRecipe(id: ArchetypeId | string): ArchetypeRecipe | undefined {
  return ARCHETYPE_RECIPES.find((a) => a.id === id);
}

function resolveRole(obj: GameObjectData): string {
  if (obj.role) return obj.role;
  const hasPlayerComp = obj.components.some((c) =>
    ['player_platformer', 'player_topdown', 'player_3d', 'movement.platformer_pro', 'movement.topdown_8dir'].includes(c.type)
  );
  if (hasPlayerComp || (obj.tags ?? []).some((t) => t.toLowerCase() === 'player' || t.toLowerCase() === 'jugador')) {
    return 'player';
  }
  if (obj.type === 'camera_3d') return 'camera';
  return 'generic';
}

export interface ApplyArchetypeResult {
  objects: GameObjectData[];
  wiringLinks: WiringLink[];
  addedBehaviors: string[];
  createdLinks: WiringLink[];
}

/**
 * Aplica un arquetipo a un objeto de escena, inyecta sus comportamientos con metadatos
 * de origen (source: 'archetype:<id>'), inputs/outputs/contextos y auto-cablea enlaces
 * reales con objetos compatibles en la escena (por ejemplo Jugador <-> Inventario / Cámara).
 */
export function applyArchetypeToScene(
  scene: SceneData,
  objectId: string,
  archetypeId: ArchetypeId,
  projectMode: ProjectMode = '2d'
): ApplyArchetypeResult {
  const recipe = getArchetypeRecipe(archetypeId);
  if (!recipe) {
    return {
      objects: scene.objects,
      wiringLinks: scene.wiringLinks ?? [],
      addedBehaviors: [],
      createdLinks: [],
    };
  }

  const addedBehaviors: string[] = [];
  const sourceTag = `archetype:${recipe.id}`;

  let objects = scene.objects.map((obj) => {
    if (obj.id !== objectId) return obj;
    const nextComponents: EngineComponentData[] = [...obj.components];

    for (const bp of recipe.behaviors) {
      let resolvedType = bp.type;
      if (resolvedType === 'player_platformer' && (projectMode === '3d' || obj.type === 'mesh_3d')) {
        resolvedType = 'player_3d';
      }
      const entry = getBehaviorEntry(resolvedType);
      const existingIdx = nextComponents.findIndex((c) => c.type === resolvedType);
      const mergedConfig = {
        ...(entry?.defaultConfig ?? {}),
        ...(bp.config ?? {}),
      };
      if (existingIdx >= 0) {
        nextComponents[existingIdx] = {
          ...nextComponents[existingIdx],
          enabled: true,
          source: nextComponents[existingIdx].source || sourceTag,
          contexts: nextComponents[existingIdx].contexts ?? entry?.contexts ?? recipe.contexts,
          inputs: nextComponents[existingIdx].inputs ?? entry?.inputs ?? [],
          outputs: nextComponents[existingIdx].outputs ?? entry?.outputs ?? [],
          config: { ...mergedConfig, ...nextComponents[existingIdx].config },
        };
      } else {
        nextComponents.push({
          id: createId('cmp'),
          type: resolvedType,
          enabled: true,
          source: sourceTag,
          contexts: entry?.contexts ?? recipe.contexts,
          inputs: entry?.inputs ?? [],
          outputs: entry?.outputs ?? [],
          config: mergedConfig,
        });
        addedBehaviors.push(resolvedType);
      }
    }

    const nextObj: GameObjectData = {
      ...obj,
      role: recipe.role,
      archetype: recipe.id,
      components: nextComponents,
      ...(recipe.netReplicated
        ? {
            net: {
              replicated: true,
              authority: 'local',
              syncTransform: true,
              syncAnim: true,
              ownerId: obj.net?.ownerId ?? null,
            },
          }
        : {}),
      ...(recipe.id === 'open_world_player' && (projectMode === '3d' || obj.type === 'mesh_3d')
        ? {
            physics3d: {
              enabled: true,
              bodyType: 'dynamic',
              shape: obj.physics3d?.shape ?? 'capsule',
              mass: obj.physics3d?.mass ?? 1,
              gravityScale: obj.physics3d?.gravityScale ?? 1,
              restitution: obj.physics3d?.restitution ?? 0,
              friction: obj.physics3d?.friction ?? 0.6,
            },
          }
        : {}),
    };
    return nextObj;
  });

  // Auto-cableado hacia entidades compatibles de la escena (ej. jugador con inventario o cámara)
  const existingLinks = [...(scene.wiringLinks ?? [])];
  const createdLinks: WiringLink[] = [];
  const sourceObj = objects.find((o) => o.id === objectId);

  if (sourceObj) {
    for (const rule of recipe.autoWire) {
      let targets = objects.filter(
        (o) =>
          o.id !== sourceObj.id &&
          resolveRole(o) === rule.toRole &&
          o.components.some((c) => c.type === rule.toBehavior)
      );

      // Si el arquetipo necesita inventory.backpack / persistence / camera_follow en el jugador y aún no existe en él, inyectarlo con origen context/auto-wired
      if (targets.length === 0) {
        const roleCandidates = objects.filter(
          (o) => o.id !== sourceObj.id && resolveRole(o) === rule.toRole
        );
        if (roleCandidates.length > 0) {
          const primaryTarget = roleCandidates[0];
          const tgtEntry = getBehaviorEntry(rule.toBehavior);
          objects = objects.map((o) => {
            if (o.id !== primaryTarget.id) return o;
            const autoComp: EngineComponentData = {
              id: createId('cmp'),
              type: rule.toBehavior,
              enabled: true,
              source: `auto:${recipe.id}`,
              contexts: tgtEntry?.contexts ?? ['gameplay', 'open_world'],
              inputs: tgtEntry?.inputs ?? [rule.action],
              outputs: tgtEntry?.outputs ?? [],
              config: { ...(tgtEntry?.defaultConfig ?? {}) },
            };
            return {
              ...o,
              role: resolveRole(o),
              components: [...o.components, autoComp],
            };
          });
          targets = objects.filter((o) => o.id === primaryTarget.id);
        }
      }

      for (const target of targets) {
        const dup = existingLinks.some(
          (l) =>
            l.sourceObjectId === sourceObj.id &&
            l.sourceBehavior === rule.fromBehavior &&
            l.signal === rule.signal &&
            l.targetObjectId === target.id &&
            l.targetBehavior === rule.toBehavior &&
            l.action === rule.action
        );
        if (!dup) {
          const link: WiringLink = {
            id: createId('wire'),
            sourceObjectId: sourceObj.id,
            sourceBehavior: rule.fromBehavior,
            signal: rule.signal,
            targetObjectId: target.id,
            targetBehavior: rule.toBehavior,
            action: rule.action,
            auto: true,
          };
          existingLinks.push(link);
          createdLinks.push(link);
        }
      }
    }
  }

  return {
    objects,
    wiringLinks: existingLinks,
    addedBehaviors,
    createdLinks,
  };
}

export interface ObjectBehaviorInspectorView {
  objectId: string;
  objectName: string;
  role: string;
  archetype: ArchetypeId | null;
  behaviors: Array<{
    componentId: string;
    type: string;
    label: string;
    source: string;
    enabled: boolean;
    contexts: SceneContextType[];
    inputs: string[];
    outputs: string[];
    config: Record<string, unknown>;
    incomingLinks: WiringLink[];
    outgoingLinks: WiringLink[];
  }>;
}

export function getObjectInspectorWiringView(
  scene: SceneData,
  objectId: string
): ObjectBehaviorInspectorView | null {
  const obj = scene.objects.find((o) => o.id === objectId);
  if (!obj) return null;
  const links = scene.wiringLinks ?? [];
  return {
    objectId: obj.id,
    objectName: obj.name,
    role: resolveRole(obj),
    archetype: obj.archetype ?? null,
    behaviors: obj.components.map((comp) => {
      const entry = getBehaviorEntry(comp.type);
      return {
        componentId: comp.id,
        type: comp.type,
        label: entry?.label ?? comp.type,
        source: comp.source ?? 'manual',
        enabled: comp.enabled,
        contexts: comp.contexts ?? entry?.contexts ?? ['gameplay'],
        inputs: comp.inputs ?? entry?.inputs ?? [],
        outputs: comp.outputs ?? entry?.outputs ?? [],
        config: comp.config,
        incomingLinks: links.filter(
          (l) => l.targetObjectId === obj.id && l.targetBehavior === comp.type
        ),
        outgoingLinks: links.filter(
          (l) => l.sourceObjectId === obj.id && l.sourceBehavior === comp.type
        ),
      };
    }),
  };
}
