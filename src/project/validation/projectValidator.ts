import {
  NEXUS_PROJECT_FORMAT,
  type ExportedProjectManifest,
  type NexusProject,
} from '../models/project';

export interface ValidationIssue {
  severity: 'error' | 'warning';
  level: 'structural' | 'semantic';
  path: string;
  message: string;
  sceneId?: string;
  objectId?: string;
}

export interface ValidationResult {
  valid: boolean;
  errors: string[];
  issues: ValidationIssue[];
}

function isFiniteNum(v: unknown): v is number {
  return typeof v === 'number' && Number.isFinite(v);
}

export function validateProjectData(data: unknown): ValidationResult {
  const issues: ValidationIssue[] = [];
  const pushIssue = (issue: ValidationIssue) => issues.push(issue);

  if (!data || typeof data !== 'object') {
    pushIssue({
      severity: 'error',
      level: 'structural',
      path: '$',
      message: 'El archivo de proyecto no es un objeto JSON válido.',
    });
    return { valid: false, errors: issues.map((i) => i.message), issues };
  }

  const p = data as Partial<NexusProject>;

  if (typeof p.id !== 'string' || !p.id.trim()) {
    pushIssue({
      severity: 'error',
      level: 'structural',
      path: '$.id',
      message: 'Falta el identificador único del proyecto ("id").',
    });
  }
  if (typeof p.name !== 'string' || !p.name.trim()) {
    pushIssue({
      severity: 'error',
      level: 'structural',
      path: '$.name',
      message: 'Falta el nombre del proyecto ("name").',
    });
  }
  if (!p.settings || typeof p.settings !== 'object') {
    pushIssue({
      severity: 'error',
      level: 'structural',
      path: '$.settings',
      message: 'Falta la configuración del proyecto ("settings").',
    });
  } else {
    if (typeof p.settings.width !== 'number' || p.settings.width < 64 || p.settings.width > 8192) {
      pushIssue({
        severity: 'error',
        level: 'structural',
        path: '$.settings.width',
        message: 'El ancho del escenario debe ser un número entre 64 y 8192.',
      });
    }
    if (typeof p.settings.height !== 'number' || p.settings.height < 64 || p.settings.height > 8192) {
      pushIssue({
        severity: 'error',
        level: 'structural',
        path: '$.settings.height',
        message: 'El alto del escenario debe ser un número entre 64 y 8192.',
      });
    }
    if (typeof p.settings.backgroundColor !== 'string') {
      pushIssue({
        severity: 'error',
        level: 'structural',
        path: '$.settings.backgroundColor',
        message: 'Falta el color de fondo del escenario.',
      });
    }
  }

  if (!Array.isArray(p.assets)) {
    pushIssue({
      severity: 'error',
      level: 'structural',
      path: '$.assets',
      message: 'La lista de recursos del proyecto no es válida.',
    });
  }

  const assetIds = new Set<string>();
  if (Array.isArray(p.assets)) {
    p.assets.forEach((a, idx) => {
      if (!a || typeof a.id !== 'string' || !a.id) {
        pushIssue({
          severity: 'error',
          level: 'structural',
          path: `$.assets[${idx}].id`,
          message: 'Un recurso no tiene identificador válido.',
        });
      } else if (assetIds.has(a.id)) {
        pushIssue({
          severity: 'error',
          level: 'semantic',
          path: `$.assets[${idx}].id`,
          message: `ID de recurso duplicado: "${a.id}".`,
        });
      } else {
        assetIds.add(a.id);
      }
    });
  }

  const scriptIds = new Set<string>();
  if (Array.isArray(p.scripts)) {
    p.scripts.forEach((sc, idx) => {
      if (!sc || typeof sc.id !== 'string' || !sc.id) {
        pushIssue({
          severity: 'error',
          level: 'structural',
          path: `$.scripts[${idx}].id`,
          message: 'Un script no tiene identificador válido.',
        });
      } else if (scriptIds.has(sc.id)) {
        pushIssue({
          severity: 'error',
          level: 'semantic',
          path: `$.scripts[${idx}].id`,
          message: `ID de script duplicado: "${sc.id}".`,
        });
      } else {
        scriptIds.add(sc.id);
      }
    });
  }

  const prefabIds = new Set<string>();
  if (Array.isArray(p.prefabs)) {
    p.prefabs.forEach((pf, idx) => {
      if (pf?.id) {
        if (prefabIds.has(pf.id)) {
          pushIssue({
            severity: 'error',
            level: 'semantic',
            path: `$.prefabs[${idx}].id`,
            message: `ID de prefab duplicado: "${pf.id}".`,
          });
        }
        prefabIds.add(pf.id);
      }
    });
  }

  const varIds = new Set<string>();
  if (Array.isArray(p.variables)) {
    p.variables.forEach((v, idx) => {
      if (v?.id) {
        if (varIds.has(v.id)) {
          pushIssue({
            severity: 'error',
            level: 'semantic',
            path: `$.variables[${idx}].id`,
            message: `ID de variable duplicado: "${v.id}".`,
          });
        }
        varIds.add(v.id);
      }
    });
  }

  const dialogueIds = new Set<string>();
  if (Array.isArray(p.dialogues)) {
    p.dialogues.forEach((d, idx) => {
      if (d?.id) {
        if (dialogueIds.has(d.id)) {
          pushIssue({
            severity: 'error',
            level: 'semantic',
            path: `$.dialogues[${idx}].id`,
            message: `ID de diálogo duplicado: "${d.id}".`,
          });
        }
        dialogueIds.add(d.id);
      }
    });
  }

  const sceneIds = new Set<string>();
  if (!Array.isArray(p.scenes) || p.scenes.length === 0) {
    pushIssue({
      severity: 'error',
      level: 'structural',
      path: '$.scenes',
      message: 'El proyecto debe incluir al menos una escena.',
    });
  } else {
    p.scenes.forEach((scene, sIdx) => {
      const sPath = `$.scenes[${sIdx}]`;
      if (!scene || typeof scene !== 'object') {
        pushIssue({
          severity: 'error',
          level: 'structural',
          path: sPath,
          message: 'Se encontró una escena dañada o inválida.',
        });
        return;
      }
      if (typeof scene.id !== 'string' || !scene.id) {
        pushIssue({
          severity: 'error',
          level: 'structural',
          path: `${sPath}.id`,
          message: 'Una escena no tiene identificador válido.',
        });
      } else if (sceneIds.has(scene.id)) {
        pushIssue({
          severity: 'error',
          level: 'semantic',
          path: `${sPath}.id`,
          message: `ID de escena duplicado: "${scene.id}".`,
          sceneId: scene.id,
        });
      } else {
        sceneIds.add(scene.id);
      }

      if (!Array.isArray(scene.objects)) {
        pushIssue({
          severity: 'error',
          level: 'structural',
          path: `${sPath}.objects`,
          message: `La escena "${scene.name ?? 'sin nombre'}" no contiene una lista válida de objetos.`,
          sceneId: scene.id,
        });
      }
    });

    // Validación semántica por escena (IDs de objetos, ciclos de jerarquía, transformaciones NaN, referencias rotas)
    if (p.activeSceneId && !sceneIds.has(p.activeSceneId)) {
      pushIssue({
        severity: 'error',
        level: 'semantic',
        path: '$.activeSceneId',
        message: `La escena activa "${p.activeSceneId}" no existe en el proyecto.`,
      });
    }
    if (p.initialSceneId && !sceneIds.has(p.initialSceneId)) {
      pushIssue({
        severity: 'error',
        level: 'semantic',
        path: '$.initialSceneId',
        message: `La escena inicial "${p.initialSceneId}" no existe en el proyecto.`,
      });
    }

    p.scenes.forEach((scene, sIdx) => {
      if (!scene || typeof scene !== 'object' || !Array.isArray(scene.objects)) return;
      const sPath = `$.scenes[${sIdx}]`;

      if (scene.nextSceneId && !sceneIds.has(scene.nextSceneId)) {
        pushIssue({
          severity: 'warning',
          level: 'semantic',
          path: `${sPath}.nextSceneId`,
          message: `nextSceneId "${scene.nextSceneId}" en escena "${scene.name}" no existe.`,
          sceneId: scene.id,
        });
      }

      const objIds = new Set<string>();
      const parentById = new Map<string, string | null>();
      const splineIds = new Set((scene.splines3d ?? []).map((sp) => sp.id));

      scene.objects.forEach((obj, oIdx) => {
        const oPath = `${sPath}.objects[${oIdx}]`;
        if (!obj || typeof obj !== 'object') {
          pushIssue({
            severity: 'error',
            level: 'structural',
            path: oPath,
            message: 'Objeto dañado en escena.',
            sceneId: scene.id,
          });
          return;
        }
        if (typeof obj.id !== 'string' || !obj.id) {
          pushIssue({
            severity: 'error',
            level: 'structural',
            path: `${oPath}.id`,
            message: `El objeto "${obj.name ?? 'sin nombre'}" carece de ID.`,
            sceneId: scene.id,
          });
        } else {
          if (objIds.has(obj.id)) {
            pushIssue({
              severity: 'error',
              level: 'semantic',
              path: `${oPath}.id`,
              message: `ID de objeto duplicado "${obj.id}" en escena "${scene.name}".`,
              sceneId: scene.id,
              objectId: obj.id,
            });
          }
          objIds.add(obj.id);
          parentById.set(obj.id, obj.parentId ?? null);
        }

        // Transformaciones numéricas finitas
        if (obj.transform) {
          if (
            !isFiniteNum(obj.transform.x) ||
            !isFiniteNum(obj.transform.y) ||
            !isFiniteNum(obj.transform.scaleX) ||
            !isFiniteNum(obj.transform.scaleY)
          ) {
            pushIssue({
              severity: 'error',
              level: 'semantic',
              path: `${oPath}.transform`,
              message: `Transformación 2D inválida (NaN o no finita) en "${obj.name}".`,
              sceneId: scene.id,
              objectId: obj.id,
            });
          }
        }
        if (obj.transform3d) {
          const t3 = obj.transform3d;
          if (
            !isFiniteNum(t3.x) ||
            !isFiniteNum(t3.y) ||
            !isFiniteNum(t3.z) ||
            !isFiniteNum(t3.sx) ||
            !isFiniteNum(t3.sy) ||
            !isFiniteNum(t3.sz)
          ) {
            pushIssue({
              severity: 'error',
              level: 'semantic',
              path: `${oPath}.transform3d`,
              message: `Transformación 3D inválida (NaN o no finita) en "${obj.name}".`,
              sceneId: scene.id,
              objectId: obj.id,
            });
          }
        }

        // Física 3D: masa <= 0 en dinámico
        if (
          obj.physics3d?.enabled &&
          obj.physics3d.bodyType === 'dynamic' &&
          (!isFiniteNum(obj.physics3d.mass) || obj.physics3d.mass <= 0)
        ) {
          pushIssue({
            severity: 'error',
            level: 'semantic',
            path: `${oPath}.physics3d.mass`,
            message: `Cuerpo dinámico "${obj.name}" requiere masa > 0.`,
            sceneId: scene.id,
            objectId: obj.id,
          });
        }

        // Referencias a assets / scripts / splines / prefabs / agua
        if (obj.sprite?.assetId && !assetIds.has(obj.sprite.assetId)) {
          pushIssue({
            severity: 'warning',
            level: 'semantic',
            path: `${oPath}.sprite.assetId`,
            message: `Sprite "${obj.name}" referencia un recurso inexistente ("${obj.sprite.assetId}").`,
            sceneId: scene.id,
            objectId: obj.id,
          });
        }
        if (obj.mesh3d?.glbAssetId && !assetIds.has(obj.mesh3d.glbAssetId)) {
          pushIssue({
            severity: 'warning',
            level: 'semantic',
            path: `${oPath}.mesh3d.glbAssetId`,
            message: `Malla 3D "${obj.name}" referencia un modelo inexistente ("${obj.mesh3d.glbAssetId}").`,
            sceneId: scene.id,
            objectId: obj.id,
          });
        }
        if (obj.followSplineId && !splineIds.has(obj.followSplineId)) {
          pushIssue({
            severity: 'warning',
            level: 'semantic',
            path: `${oPath}.followSplineId`,
            message: `Objeto "${obj.name}" referencia spline inexistente ("${obj.followSplineId}").`,
            sceneId: scene.id,
            objectId: obj.id,
          });
        }
        if (obj.prefabId && !prefabIds.has(obj.prefabId)) {
          pushIssue({
            severity: 'warning',
            level: 'semantic',
            path: `${oPath}.prefabId`,
            message: `Objeto "${obj.name}" referencia prefab inexistente ("${obj.prefabId}").`,
            sceneId: scene.id,
            objectId: obj.id,
          });
        }
        for (const [bIdx, b] of (obj.scriptBindings ?? []).entries()) {
          if (b.scriptId && !scriptIds.has(b.scriptId)) {
            pushIssue({
              severity: 'warning',
              level: 'semantic',
              path: `${oPath}.scriptBindings[${bIdx}].scriptId`,
              message: `Objeto "${obj.name}" apunta a script inexistente ("${b.scriptId}").`,
              sceneId: scene.id,
              objectId: obj.id,
            });
          }
        }
      });

      // Verificar parentId inexistente o ciclos en jerarquía padre-hijo
      scene.objects.forEach((obj, oIdx) => {
        if (!obj?.id || !obj.parentId) return;
        const oPath = `${sPath}.objects[${oIdx}].parentId`;
        if (!objIds.has(obj.parentId)) {
          pushIssue({
            severity: 'error',
            level: 'semantic',
            path: oPath,
            message: `Objeto "${obj.name}" tiene parentId "${obj.parentId}" inexistente.`,
            sceneId: scene.id,
            objectId: obj.id,
          });
          return;
        }
        const visited = new Set<string>([obj.id]);
        let cursor: string | null | undefined = obj.parentId;
        while (cursor) {
          if (visited.has(cursor)) {
            pushIssue({
              severity: 'error',
              level: 'semantic',
              path: oPath,
              message: `Ciclo detectado en jerarquía padre-hijo alrededor de "${obj.name}".`,
              sceneId: scene.id,
              objectId: obj.id,
            });
            break;
          }
          visited.add(cursor);
          cursor = parentById.get(cursor) ?? null;
        }
      });
    });
  }

  const errors = issues.filter((i) => i.severity === 'error').map((i) => i.message);
  return {
    valid: errors.length === 0,
    errors,
    issues,
  };
}

export function validateExportManifest(data: unknown): ValidationResult {
  const issues: ValidationIssue[] = [];
  if (!data || typeof data !== 'object') {
    issues.push({
      severity: 'error',
      level: 'structural',
      path: '$',
      message: 'El archivo project.json está vacío o dañado.',
    });
    return { valid: false, errors: issues.map((i) => i.message), issues };
  }

  const manifest = data as Partial<ExportedProjectManifest>;

  if (manifest.format !== NEXUS_PROJECT_FORMAT) {
    issues.push({
      severity: 'error',
      level: 'structural',
      path: '$.format',
      message: `Formato incompatible: se esperaba "${NEXUS_PROJECT_FORMAT}" y se recibió "${String(manifest.format ?? 'desconocido')}".`,
    });
  }

  if (typeof manifest.formatVersion !== 'string' || !manifest.formatVersion.startsWith('1.')) {
    issues.push({
      severity: 'error',
      level: 'structural',
      path: '$.formatVersion',
      message: `Versión de formato no soportada: "${String(manifest.formatVersion ?? 'desconocida')}".`,
    });
  }

  if (!manifest.project) {
    issues.push({
      severity: 'error',
      level: 'structural',
      path: '$.project',
      message: 'Falta el bloque "project" dentro de project.json.',
    });
  } else {
    const projectCheck = validateProjectData({
      ...manifest.project,
      formatVersion: manifest.formatVersion,
      assets: manifest.assets ?? [],
    });
    issues.push(...projectCheck.issues);
  }

  if (!Array.isArray(manifest.assets)) {
    issues.push({
      severity: 'error',
      level: 'structural',
      path: '$.assets',
      message: 'El manifiesto de recursos ("assets") es inválido.',
    });
  } else {
    manifest.assets.forEach((asset, idx) => {
      if (!asset || typeof asset.id !== 'string' || typeof asset.path !== 'string') {
        issues.push({
          severity: 'error',
          level: 'structural',
          path: `$.assets[${idx}]`,
          message: 'Un recurso declarado en project.json carece de identificador o ruta.',
        });
      }
    });
  }

  const errors = issues.filter((i) => i.severity === 'error').map((i) => i.message);
  return {
    valid: errors.length === 0,
    errors,
    issues,
  };
}

