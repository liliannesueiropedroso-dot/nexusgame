import type { GameObjectData, ProjectVariable, SceneData } from '../../engine/core/types';
import type { NexusProject, ProjectAssetMeta } from '../../project/models/project';
import { createId } from '../../utils/id';

export type DiagnosticSeverity = 'error' | 'warning' | 'info';

export interface DiagnosticFix {
  label: string;
  apply: (project: NexusProject) => NexusProject;
}

export interface EngineDiagnostic {
  id: string;
  severity: DiagnosticSeverity;
  code: string;
  title: string;
  detail: string;
  objectId?: string;
  mechanicId?: string;
  fix?: DiagnosticFix;
}

function updateSceneObjectInProject(
  project: NexusProject,
  sceneId: string,
  objectId: string,
  updater: (obj: GameObjectData) => GameObjectData
): NexusProject {
  return {
    ...project,
    scenes: project.scenes.map((s) =>
      s.id === sceneId
        ? {
            ...s,
            objects: s.objects.map((o) => (o.id === objectId ? updater(o) : o)),
          }
        : s
    ),
  };
}

/**
 * Analizador estático determinista de NEXUS.
 * Detecta errores de configuración, componentes incompatibles, animaciones sin vincular
 * y referencias rotas en mecánicas, ofreciendo correcciones automáticas de 1 clic.
 */
export function analyzeProjectDiagnostics(
  project: NexusProject,
  scene: SceneData,
  assets: ProjectAssetMeta[]
): EngineDiagnostic[] {
  const diagnostics: EngineDiagnostic[] = [];
  const assetIds = new Set(assets.map((a) => a.id));
  const objectMap = new Map(scene.objects.map((o) => [o.id, o]));
  const variables: ProjectVariable[] = project.variables ?? [];
  const varNames = new Set(variables.map((v) => v.name));

  let playerCount = 0;
  let hasPlatformerPlayer = false;
  let hasSolidGround = false;

  for (const obj of scene.objects) {
    const hasPlatformer = obj.components.some(
      (c) => c.enabled && c.type === 'player_platformer'
    );
    const hasTopdown = obj.components.some(
      (c) => c.enabled && c.type === 'player_topdown'
    );
    const hasSolid = obj.components.some((c) => c.enabled && c.type === 'solid');

    if (hasPlatformer || hasTopdown) playerCount += 1;
    if (hasPlatformer) hasPlatformerPlayer = true;
    if (hasSolid) hasSolidGround = true;

    // 1. Sprite sin imagen asignada
    if (obj.type === 'sprite' && !obj.sprite?.assetId) {
      diagnostics.push({
        id: `diag-no-asset-${obj.id}`,
        severity: 'warning',
        code: 'SPRITE_NO_ASSET',
        title: `Sprite "${obj.name}" sin imagen asignada`,
        detail:
          'Este sprite mostrará un marcador vacío hasta que le asignes un recurso de imagen en el Inspector.',
        objectId: obj.id,
        fix:
          assets.find((a) => (a.kind ?? 'image') === 'image')
            ? {
                label: 'Asignar primer recurso disponible',
                apply: (proj) => {
                  const firstImg = proj.assets.find((a) => (a.kind ?? 'image') === 'image');
                  if (!firstImg) return proj;
                  return updateSceneObjectInProject(proj, scene.id, obj.id, (o) => ({
                    ...o,
                    sprite: {
                      ...(o.sprite ?? {
                        assetId: firstImg.id,
                        tint: '#ffffff',
                        flipX: false,
                        flipY: false,
                      }),
                      assetId: firstImg.id,
                    },
                  }));
                },
              }
            : undefined,
      });
    } else if (obj.type === 'sprite' && obj.sprite?.assetId && !assetIds.has(obj.sprite.assetId)) {
      diagnostics.push({
        id: `diag-missing-asset-${obj.id}`,
        severity: 'error',
        code: 'ASSET_MISSING',
        title: `Recurso faltante en "${obj.name}"`,
        detail: `El recurso "${obj.sprite.assetId}" ya no existe en la biblioteca del proyecto.`,
        objectId: obj.id,
      });
    }

    // 2. Prueba central de NEXUS: Personaje con movimiento sin animación vinculada
    if (obj.type === 'sprite' && (hasPlatformer || hasTopdown)) {
      const anim = obj.sprite?.animation;
      if (!anim?.enabled) {
        diagnostics.push({
          id: `diag-player-no-anim-${obj.id}`,
          severity: 'warning',
          code: 'MOVEMENT_WITHOUT_ANIMATION',
          title: `Personaje "${obj.name}" con movimiento pero sin animación configurada`,
          detail:
            'Tiene componente de movimiento activo, pero la animación por spritesheet está desactivada.',
          objectId: obj.id,
          fix: {
            label: 'Activar y vincular animación de caminar',
            apply: (proj) =>
              updateSceneObjectInProject(proj, scene.id, obj.id, (o) => ({
                ...o,
                sprite: {
                  ...o.sprite!,
                  animation: {
                    enabled: true,
                    cols: Math.max(2, o.sprite?.animation?.cols ?? 4),
                    rows: Math.max(1, o.sprite?.animation?.rows ?? 1),
                    frameCount: Math.max(2, o.sprite?.animation?.frameCount ?? 4),
                    fps: o.sprite?.animation?.fps ?? 8,
                    loop: true,
                    playing: true,
                    linkToMovement: true,
                    activeClip: 'walk',
                  },
                },
              })),
          },
        });
      } else if (!anim.linkToMovement) {
        diagnostics.push({
          id: `diag-player-unlinked-anim-${obj.id}`,
          severity: 'warning',
          code: 'ANIMATION_NOT_LINKED',
          title: `Animación de "${obj.name}" no vinculada al movimiento`,
          detail:
            'La animación se reproducirá aunque el personaje esté quieto. Vincúlala para alternar automáticamente entre reposo y caminar.',
          objectId: obj.id,
          fix: {
            label: 'Vincular animación al movimiento',
            apply: (proj) =>
              updateSceneObjectInProject(proj, scene.id, obj.id, (o) => ({
                ...o,
                sprite: {
                  ...o.sprite!,
                  animation: {
                    ...o.sprite!.animation!,
                    linkToMovement: true,
                    activeClip: 'walk',
                  },
                },
              })),
          },
        });
      }
    }

    // 3. Validación de frameCount respecto a cols*rows
    if (obj.type === 'sprite' && obj.sprite?.animation?.enabled) {
      const a = obj.sprite.animation;
      const maxFrames = Math.max(1, a.cols * a.rows);
      if (a.frameCount > maxFrames) {
        diagnostics.push({
          id: `diag-anim-bounds-${obj.id}`,
          severity: 'error',
          code: 'ANIM_FRAME_OVERFLOW',
          title: `Exceso de fotogramas en "${obj.name}"`,
          detail: `Se solicitaron ${a.frameCount} fotogramas pero la cuadrícula (${a.cols}×${a.rows}) solo contiene ${maxFrames}.`,
          objectId: obj.id,
          fix: {
            label: `Ajustar fotogramas a ${maxFrames}`,
            apply: (proj) =>
              updateSceneObjectInProject(proj, scene.id, obj.id, (o) => ({
                ...o,
                sprite: {
                  ...o.sprite!,
                  animation: { ...o.sprite!.animation!, frameCount: maxFrames },
                },
              })),
          },
        });
      }
    }

    // 4. Contradicción: mismo objeto con dos controladores de jugador
    if (hasPlatformer && hasTopdown) {
      diagnostics.push({
        id: `diag-conflict-ctrl-${obj.id}`,
        severity: 'error',
        code: 'CONFLICTING_CONTROLLERS',
        title: `Controladores contradictorios en "${obj.name}"`,
        detail:
          'No se debe combinar "Jugador (Plataformas)" y "Jugador (4 Direcciones)" simultáneamente en el mismo objeto.',
        objectId: obj.id,
        fix: {
          label: 'Conservar solo Plataformas',
          apply: (proj) =>
            updateSceneObjectInProject(proj, scene.id, obj.id, (o) => ({
              ...o,
              components: o.components.map((c) =>
                c.type === 'player_topdown' ? { ...c, enabled: false } : c
              ),
            })),
        },
      });
    }
  }

  // 5. Jugador de plataformas sin ningún suelo sólido
  if (hasPlatformerPlayer && !hasSolidGround) {
    const floorCandidate = scene.objects.find(
      (o) =>
        (o.type === 'rectangle' || o.type === 'tilemap') &&
        !o.components.some((c) => c.type.startsWith('player_'))
    );
    diagnostics.push({
      id: 'diag-no-solid-ground',
      severity: 'warning',
      code: 'NO_SOLID_GROUND',
      title: 'Escena de plataformas sin suelo sólido',
      detail:
        'Hay un jugador con gravedad, pero ningún objeto tiene el comportamiento "Sólido / Plataforma"; el personaje caerá fuera de pantalla.',
      objectId: floorCandidate?.id,
      fix: floorCandidate
        ? {
            label: `Marcar "${floorCandidate.name}" como Sólido`,
            apply: (proj) =>
              updateSceneObjectInProject(proj, scene.id, floorCandidate.id, (o) => ({
                ...o,
                components: [
                  ...o.components,
                  { id: createId('cmp'), type: 'solid', enabled: true, config: {} },
                ],
              })),
          }
        : undefined,
    });
  }

  if (playerCount > 1) {
    diagnostics.push({
      id: 'diag-multi-player',
      severity: 'info',
      code: 'MULTIPLE_PLAYERS',
      title: `Hay ${playerCount} objetos marcados como Jugador`,
      detail: 'Todos responderán simultáneamente a las teclas de control durante la ejecución.',
    });
  }

  const sceneIds = new Set(project.scenes.map((s) => s.id));
  const prefabIds = new Set((project.prefabs ?? []).map((p) => p.id));

  // 0. Validar escena inicial del proyecto
  if (project.initialSceneId && !sceneIds.has(project.initialSceneId) && project.scenes.length > 0) {
    diagnostics.push({
      id: 'diag-invalid-initial-scene',
      severity: 'error',
      code: 'INVALID_INITIAL_SCENE',
      title: 'Escena inicial del juego no existe',
      detail: `La escena inicial "${project.initialSceneId}" fue eliminada. El juego arrancará desde la primera escena disponible.`,
      fix: {
        label: `Usar "${project.scenes[0].name}" como inicio`,
        apply: (proj) => ({
          ...proj,
          initialSceneId: proj.scenes[0]?.id,
        }),
      },
    });
  }

  for (const obj of scene.objects) {
    // 3b. Validar cropRect inválido en sprites con recorte
    if (obj.type === 'sprite' && obj.sprite?.fitMode === 'crop') {
      const cr = obj.sprite.cropRect;
      if (!cr || cr.width <= 0 || cr.height <= 0) {
        diagnostics.push({
          id: `diag-invalid-crop-${obj.id}`,
          severity: 'warning',
          code: 'INVALID_CROP_RECT',
          title: `Recorte inválido en sprite "${obj.name}"`,
          detail: 'El modo "Recortar" requiere un ancho y alto de región mayores que 0.',
          objectId: obj.id,
          fix: {
            label: 'Cambiar ajuste a "Contener"',
            apply: (proj) =>
              updateSceneObjectInProject(proj, scene.id, obj.id, (o) => ({
                ...o,
                sprite: o.sprite ? { ...o.sprite, fitMode: 'contain' } : o.sprite,
              })),
          },
        });
      }
    }

    // 3c. Validar escena destino en Botón UI
    if (
      obj.type === 'ui_button' &&
      obj.uiButton &&
      (obj.uiButton.onClickAction === 'load_scene' ||
        obj.uiButton.onClickAction === 'overlay_scene')
    ) {
      const targetSid = obj.uiButton.targetSceneId;
      if (!targetSid || !sceneIds.has(targetSid)) {
        diagnostics.push({
          id: `diag-btn-scene-${obj.id}`,
          severity: 'warning',
          code: 'BUTTON_BROKEN_SCENE',
          title: `Botón "${obj.name}" apunta a una escena inválida`,
          detail: 'Selecciona una escena de destino existente en el Inspector para que el botón funcione al pulsarse.',
          objectId: obj.id,
        });
      }
    }

    // 3d. Validar escena destino explícita en Portal / Meta
    const goalComp = obj.components.find((c) => c.enabled && c.type === 'goal_portal');
    const goalTargetId = String(goalComp?.config.targetSceneId ?? '').trim();
    if (goalComp && goalTargetId && !sceneIds.has(goalTargetId)) {
      diagnostics.push({
        id: `diag-goal-scene-${obj.id}`,
        severity: 'error',
        code: 'GOAL_BROKEN_SCENE',
        title: `Portal "${obj.name}" apunta a una escena inexistente`,
        detail: `La escena destino "${goalTargetId}" ya no existe. Cámbiala o déjala vacía para usar el orden natural de niveles.`,
        objectId: obj.id,
        fix: {
          label: 'Usar siguiente nivel automático',
          apply: (proj) =>
            updateSceneObjectInProject(proj, scene.id, obj.id, (o) => ({
              ...o,
              components: o.components.map((c) =>
                c.type === 'goal_portal'
                  ? { ...c, config: { ...c.config, targetSceneId: '' } }
                  : c
              ),
            })),
        },
      });
    }
  }

  // 6. Validación de reglas estructuradas (GameMechanic[])
  for (const mech of scene.mechanics ?? []) {
    if (!mech.enabled) continue;
    if (
      mech.trigger.event === 'collision.enter' ||
      mech.trigger.event === 'collision.stay' ||
      mech.trigger.event === 'collision.exit' ||
      mech.trigger.event === 'trigger.enter' ||
      mech.trigger.event === 'trigger.exit'
    ) {
      if (mech.trigger.target && !objectMap.has(mech.trigger.target)) {
        diagnostics.push({
          id: `diag-mech-target-${mech.id}`,
          severity: 'error',
          code: 'MECHANIC_BROKEN_TARGET',
          title: `Regla "${mech.name}" apunta a un objeto inexistente`,
          detail: `El objetivo de colisión "${mech.trigger.target}" fue eliminado de la escena.`,
          mechanicId: mech.id,
          fix: {
            label: 'Desactivar regla rota',
            apply: (proj) => ({
              ...proj,
              scenes: proj.scenes.map((s) =>
                s.id === scene.id
                  ? {
                      ...s,
                      mechanics: (s.mechanics ?? []).map((m) =>
                        m.id === mech.id ? { ...m, enabled: false } : m
                      ),
                    }
                  : s
              ),
            }),
          },
        });
      }
    }

    for (const act of mech.actions) {
      if (
        (act.type === 'variable.add' || act.type === 'variable.set') &&
        typeof act.parameters.variable === 'string' &&
        act.parameters.variable.trim() &&
        !varNames.has(act.parameters.variable)
      ) {
        const missingVarName = act.parameters.variable;
        diagnostics.push({
          id: `diag-mech-var-${mech.id}-${act.id}`,
          severity: 'warning',
          code: 'UNDEFINED_VARIABLE',
          title: `Variable "${missingVarName}" no declarada en regla "${mech.name}"`,
          detail:
            'Se inicializará en 0 automáticamente al ejecutar, pero conviene declararla en el panel Variables.',
          mechanicId: mech.id,
          fix: {
            label: `Declarar variable "${missingVarName}"`,
            apply: (proj) => ({
              ...proj,
              variables: [
                ...(proj.variables ?? []),
                {
                  id: createId('var'),
                  name: missingVarName,
                  scope: 'global',
                  type: 'number',
                  initialValue: 0,
                },
              ],
            }),
          },
        });
      }

      if (act.type === 'scene.load' || act.type === 'scene.overlay') {
        const targetSid = String(act.parameters.sceneId ?? '').trim();
        if (!targetSid || !sceneIds.has(targetSid)) {
          diagnostics.push({
            id: `diag-mech-scene-${mech.id}-${act.id}`,
            severity: 'error',
            code: 'MECHANIC_BROKEN_SCENE',
            title: `Regla "${mech.name}" apunta a una escena inexistente`,
            detail: 'La acción de carga de escena no tiene un destino válido.',
            mechanicId: mech.id,
          });
        }
      }

      if (act.type === 'prefab.spawn') {
        const pid = String(act.parameters.prefabId ?? '').trim();
        if (!pid || !prefabIds.has(pid)) {
          diagnostics.push({
            id: `diag-mech-prefab-${mech.id}-${act.id}`,
            severity: 'error',
            code: 'MECHANIC_BROKEN_PREFAB',
            title: `Regla "${mech.name}" usa un Prefab inexistente`,
            detail: 'Asigna un Prefab válido en el panel Mecánicas para poder instanciarlo.',
            mechanicId: mech.id,
          });
        }
      }

      if (act.type === 'audio.play') {
        const audioId = String(act.parameters.assetId ?? '');
        if (!audioId || !assetIds.has(audioId)) {
          diagnostics.push({
            id: `diag-mech-audio-${mech.id}-${act.id}`,
            severity: 'warning',
            code: 'MISSING_AUDIO_ASSET',
            title: `Sonido no asignado en regla "${mech.name}"`,
            detail:
              'La acción "audio.play" no tiene un archivo de audio válido. Puedes asignar un archivo o usar un efecto sintetizado.',
            mechanicId: mech.id,
            fix: {
              label: 'Usar efecto sintetizado "coin"',
              apply: (proj) => ({
                ...proj,
                scenes: proj.scenes.map((s) =>
                  s.id === scene.id
                    ? {
                        ...s,
                        mechanics: (s.mechanics ?? []).map((m) =>
                          m.id === mech.id
                            ? {
                                ...m,
                                actions: m.actions.map((a) =>
                                  a.id === act.id
                                    ? {
                                        ...a,
                                        type: 'audio.beep',
                                        parameters: { preset: 'coin', channel: 'sfx' },
                                      }
                                    : a
                                ),
                              }
                            : m
                        ),
                      }
                    : s
                ),
              }),
            },
          });
        }
      }
    }
  }

  return diagnostics;
}
