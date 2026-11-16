import {
  NEXUS_PROJECT_FORMAT,
  type ExportedProjectManifest,
  type NexusProject,
} from '../models/project';

export interface ValidationResult {
  valid: boolean;
  errors: string[];
}

export function validateProjectData(data: unknown): ValidationResult {
  const errors: string[] = [];
  if (!data || typeof data !== 'object') {
    return { valid: false, errors: ['El archivo de proyecto no es un objeto JSON válido.'] };
  }

  const p = data as Partial<NexusProject>;

  if (typeof p.id !== 'string' || !p.id.trim()) {
    errors.push('Falta el identificador único del proyecto ("id").');
  }
  if (typeof p.name !== 'string' || !p.name.trim()) {
    errors.push('Falta el nombre del proyecto ("name").');
  }
  if (!p.settings || typeof p.settings !== 'object') {
    errors.push('Falta la configuración del proyecto ("settings").');
  } else {
    if (typeof p.settings.width !== 'number' || p.settings.width < 64 || p.settings.width > 8192) {
      errors.push('El ancho del escenario debe ser un número entre 64 y 8192.');
    }
    if (typeof p.settings.height !== 'number' || p.settings.height < 64 || p.settings.height > 8192) {
      errors.push('El alto del escenario debe ser un número entre 64 y 8192.');
    }
    if (typeof p.settings.backgroundColor !== 'string') {
      errors.push('Falta el color de fondo del escenario.');
    }
  }

  if (!Array.isArray(p.scenes) || p.scenes.length === 0) {
    errors.push('El proyecto debe incluir al menos una escena.');
  } else {
    for (const scene of p.scenes) {
      if (!scene || typeof scene !== 'object') {
        errors.push('Se encontró una escena dañada o inválida.');
        continue;
      }
      if (typeof scene.id !== 'string' || !scene.id) {
        errors.push('Una escena no tiene identificador válido.');
      }
      if (!Array.isArray(scene.objects)) {
        errors.push(`La escena "${scene.name ?? 'sin nombre'}" no contiene una lista válida de objetos.`);
      }
    }
  }

  if (!Array.isArray(p.assets)) {
    errors.push('La lista de recursos del proyecto no es válida.');
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

export function validateExportManifest(data: unknown): ValidationResult {
  const errors: string[] = [];
  if (!data || typeof data !== 'object') {
    return { valid: false, errors: ['El archivo project.json está vacío o dañado.'] };
  }

  const manifest = data as Partial<ExportedProjectManifest>;

  if (manifest.format !== NEXUS_PROJECT_FORMAT) {
    errors.push(
      `Formato incompatible: se esperaba "${NEXUS_PROJECT_FORMAT}" y se recibió "${String(manifest.format ?? 'desconocido')}".`
    );
  }

  if (typeof manifest.formatVersion !== 'string' || !manifest.formatVersion.startsWith('1.')) {
    errors.push(
      `Versión de formato no soportada: "${String(manifest.formatVersion ?? 'desconocida')}".`
    );
  }

  if (!manifest.project) {
    errors.push('Falta el bloque "project" dentro de project.json.');
  } else {
    const projectCheck = validateProjectData({
      ...manifest.project,
      formatVersion: manifest.formatVersion,
      assets: manifest.assets ?? [],
    });
    if (!projectCheck.valid) {
      errors.push(...projectCheck.errors);
    }
  }

  if (!Array.isArray(manifest.assets)) {
    errors.push('El manifiesto de recursos ("assets") es inválido.');
  } else {
    for (const asset of manifest.assets) {
      if (!asset || typeof asset.id !== 'string' || typeof asset.path !== 'string') {
        errors.push('Un recurso declarado en project.json carece de identificador o ruta.');
      }
    }
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}
