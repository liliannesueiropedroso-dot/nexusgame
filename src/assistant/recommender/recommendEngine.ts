import type { GameObjectData, SceneData } from '../../engine/core/types';
import type { ProjectAssetMeta } from '../../project/models/project';
import { MECHANICS_CATALOG, type MechanicCatalogEntry } from '../catalog/mechanicsCatalog';

export interface ContextualRecommendation {
  id: string;
  title: string;
  reason: string;
  priority: number;
  catalogEntry: MechanicCatalogEntry;
  targetObjectId: string | null;
}

/**
 * Motor determinista de recomendaciones contextuales de NEXUS.
 * Analiza el objeto seleccionado, sus componentes, animaciones y los objetos de la escena.
 */
export function getContextualRecommendations(
  selectedObject: GameObjectData | null,
  scene: SceneData,
  _assets: ProjectAssetMeta[]
): ContextualRecommendation[] {
  const recs: ContextualRecommendation[] = [];
  const findCatalog = (id: string) => MECHANICS_CATALOG.find((e) => e.id === id);

  if (selectedObject) {
    const hasMovement = selectedObject.components.some(
      (c) =>
        c.enabled &&
        (c.type === 'player_platformer' ||
          c.type === 'player_topdown' ||
          c.type === 'patrol' ||
          c.type === 'chase_player')
    );
    const hasSolid = selectedObject.components.some((c) => c.enabled && c.type === 'solid');
    const isCollectible = selectedObject.components.some(
      (c) => c.enabled && c.type === 'collectible'
    );

    if (
      selectedObject.type === 'sprite' &&
      !hasMovement &&
      !hasSolid &&
      !isCollectible
    ) {
      const plat = findCatalog('movement.platformer');
      const top = findCatalog('movement.topdown');
      if (plat) {
        recs.push({
          id: `rec-plat-${selectedObject.id}`,
          title: `Añadir movimiento de plataformas a ${selectedObject.name}`,
          reason:
            'El sprite aún no tiene ningún componente de movimiento ni colisión sólida.',
          priority: 100,
          catalogEntry: plat,
          targetObjectId: selectedObject.id,
        });
      }
      if (top) {
        recs.push({
          id: `rec-top-${selectedObject.id}`,
          title: `Añadir movimiento 4 direcciones a ${selectedObject.name}`,
          reason: 'Ideal para juegos cenitales (top-down), RPG o exploración libre.',
          priority: 85,
          catalogEntry: top,
          targetObjectId: selectedObject.id,
        });
      }
    }

    if (
      selectedObject.type === 'sprite' &&
      hasMovement &&
      (!selectedObject.sprite?.animation?.enabled ||
        !selectedObject.sprite?.animation?.linkToMovement)
    ) {
      const animEntry = findCatalog('animation.link_walk');
      if (animEntry) {
        recs.push({
          id: `rec-anim-${selectedObject.id}`,
          title: 'Vincular animación de caminar al movimiento',
          reason: `${selectedObject.name} tiene movimiento activo, pero su animación no está configurada o vinculada a la velocidad.`,
          priority: 95,
          catalogEntry: animEntry,
          targetObjectId: selectedObject.id,
        });
      }
    }

    if (
      selectedObject.components.some((c) => c.enabled && c.type === 'player_platformer') &&
      !(scene.mechanics ?? []).some((m) => m.trigger.event === 'input.pressed')
    ) {
      const jumpAudio = findCatalog('audio.jump_sfx');
      if (jumpAudio) {
        recs.push({
          id: `rec-jump-sfx-${selectedObject.id}`,
          title: 'Añadir efecto sonoro automático al saltar',
          reason: 'Mejora la respuesta jugable activando sonido retro Web Audio al pulsar Espacio.',
          priority: 70,
          catalogEntry: jumpAudio,
          targetObjectId: selectedObject.id,
        });
      }
    }

    if (
      (isCollectible ||
        selectedObject.name.toLowerCase().includes('gema') ||
        selectedObject.name.toLowerCase().includes('moneda')) &&
      !(scene.mechanics ?? []).some(
        (m) =>
          m.trigger.event === 'collision.enter' &&
          m.trigger.target === selectedObject.id
      )
    ) {
      const collectRule = findCatalog('interaction.collect_coin_rule');
      if (collectRule) {
        recs.push({
          id: `rec-collect-${selectedObject.id}`,
          title: `Crear regla de recolección para ${selectedObject.name}`,
          reason:
            'Genera automáticamente la regla CUANDO colisiona -> sumar puntos + sonido + partículas + destruir.',
          priority: 90,
          catalogEntry: collectRule,
          targetObjectId: selectedObject.id,
        });
      }
    }

    if (selectedObject.type === 'tilemap' && !hasSolid) {
      const solidEntry = findCatalog('physics.solid');
      if (solidEntry) {
        recs.push({
          id: `rec-solid-${selectedObject.id}`,
          title: `Hacer sólido el mapa de tiles "${selectedObject.name}"`,
          reason:
            'Permite que el jugador camine y colisione sobre las celdas pintadas del tilemap.',
          priority: 88,
          catalogEntry: solidEntry,
          targetObjectId: selectedObject.id,
        });
      }
    }
  } else {
    // Recomendaciones a nivel de escena si no hay selección
    const hasPlayer = scene.objects.some((o) =>
      o.components.some(
        (c) =>
          c.enabled &&
          (c.type === 'player_platformer' || c.type === 'player_topdown')
      )
    );
    const hasRules = (scene.mechanics ?? []).length > 0;
    if (hasPlayer && !hasRules) {
      const collectRule = findCatalog('interaction.collect_coin_rule');
      if (collectRule) {
        recs.push({
          id: 'rec-scene-collect',
          title: 'Agregar regla estructurada de recolección al nivel',
          reason:
            'Conecta tu jugador con los objetos coleccionables usando reglas CUANDO / SI / ENTONCES.',
          priority: 80,
          catalogEntry: collectRule,
          targetObjectId: null,
        });
      }
    }
  }

  return recs.sort((a, b) => b.priority - a.priority);
}
