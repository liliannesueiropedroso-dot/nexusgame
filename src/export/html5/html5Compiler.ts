import JSZip from 'jszip';
import type { NexusProject } from '../../project/models/project';
import { buildAssetArchivePath } from '../../project/serialization/projectSerializer';
import { sanitizeFilename } from '../../utils/id';
import { PORTAL_TARGETS, type Html5CompileOptions } from './portalSdks';
import {
  generateGameCss,
  generateIndexHtml,
  generateNexusRuntimeJs,
  generatePlaygamaConfig,
  generatePortalSdkJs,
} from './runtimeTemplate';
import { generateNexus3DRuntimeJs } from './threeRuntimeTemplate';

export interface CompiledHtml5Package {
  blob: Blob;
  filename: string;
  filesIncluded: string[];
}

export async function loadBundledPixiScript(): Promise<string | null> {
  if (typeof fetch === 'undefined') return null;
  try {
    const res = await fetch('/vendor/pixi.min.js');
    if (!res.ok) return null;
    return await res.text();
  } catch {
    return null;
  }
}

export async function loadBundledThreeScript(): Promise<string | null> {
  if (typeof fetch === 'undefined') return null;
  try {
    const res = await fetch('/vendor/three.min.js');
    if (!res.ok) return null;
    return await res.text();
  } catch {
    return null;
  }
}

export async function compileProjectToHtml5Zip(
  project: NexusProject,
  assetBlobs: Map<string, Blob>,
  options: Html5CompileOptions,
  pixiBundleText?: string | null,
  threeBundleText?: string | null
): Promise<CompiledHtml5Package> {
  const zip = new JSZip();
  const filesIncluded: string[] = [];
  const projectMode = project.mode ?? '2d';

  // 1. index.html con inyección real del SDK de la plataforma seleccionada y motor 2D/3D
  zip.file('index.html', generateIndexHtml(project.name, options, projectMode));
  filesIncluded.push('index.html');

  // 2. Estilos CSS
  zip.file('css/style.css', generateGameCss());
  filesIncluded.push('css/style.css');

  // 3. Motor 2D (PixiJS) o Motor 3D (Three.js) empaquetado localmente sin CDN externo
  zip.file('js/portal-sdk.js', generatePortalSdkJs(options));
  filesIncluded.push('js/portal-sdk.js');

  if (projectMode === '3d') {
    const threeCode =
      threeBundleText !== undefined ? threeBundleText : await loadBundledThreeScript();
    if (!threeCode) {
      throw new Error(
        'No se encontró el paquete local de Three.js (/vendor/three.min.js) necesario para compilar el juego 3D autónomo.'
      );
    }
    zip.file('js/three.min.js', threeCode);
    filesIncluded.push('js/three.min.js');

    zip.file('js/nexus-3d-runtime.js', generateNexus3DRuntimeJs(options));
    filesIncluded.push('js/nexus-3d-runtime.js');
  } else {
    const pixiCode =
      pixiBundleText !== undefined ? pixiBundleText : await loadBundledPixiScript();
    if (!pixiCode) {
      throw new Error(
        'No se encontró el paquete local de PixiJS (/vendor/pixi.min.js) necesario para compilar el juego autónomo.'
      );
    }
    zip.file('js/pixi.min.js', pixiCode);
    filesIncluded.push('js/pixi.min.js');

    zip.file('js/nexus-runtime.js', generateNexusRuntimeJs(options));
    filesIncluded.push('js/nexus-runtime.js');
  }

  // 4. Archivo de configuración requerido por Playgama Bridge
  if (options.portal === 'playgama') {
    zip.file('playgama-bridge-config.json', generatePlaygamaConfig(project.name));
    filesIncluded.push('playgama-bridge-config.json');
  }

  // 5. Datos compilados del juego y carpeta de recursos
  const compiledGameData = {
    engine: 'NEXUS GAME ENGINE',
    formatVersion: '1.0.0',
    mode: projectMode,
    portal: options.portal,
    name: project.name,
    settings: structuredClone(project.settings),
    initialSceneId: project.initialSceneId ?? project.activeSceneId,
    activeSceneId: project.activeSceneId,
    scenes: structuredClone(project.scenes),
    scripts: project.scripts ? structuredClone(project.scripts) : [],
    dialogues: project.dialogues ? structuredClone(project.dialogues) : [],
    dataTables: project.dataTables ? structuredClone(project.dataTables) : [],
    i18n: project.i18n ? structuredClone(project.i18n) : undefined,
    prefabs: project.prefabs ? structuredClone(project.prefabs) : [],
    folders: project.folders ? structuredClone(project.folders) : [],
    variables: project.variables ? structuredClone(project.variables) : [],
    audioBuses: project.audioBuses ? structuredClone(project.audioBuses) : undefined,
    assets: project.assets.map((asset) => ({
      id: asset.id,
      name: asset.name,
      filename: asset.filename,
      mimeType: asset.mimeType,
      kind: asset.kind ?? 'image',
      width: asset.width,
      height: asset.height,
      path: buildAssetArchivePath(asset.id, asset.filename),
    })),
  };

  zip.file('data/game.json', JSON.stringify(compiledGameData, null, 2));
  filesIncluded.push('data/game.json');

  const assetsFolder = zip.folder('assets');
  if (assetsFolder) {
    for (const asset of project.assets) {
      const blob = assetBlobs.get(asset.id);
      if (!blob) {
        throw new Error(
          `Falta el archivo binario del recurso "${asset.filename}" (${asset.id}).`
        );
      }
      const archivePath = buildAssetArchivePath(asset.id, asset.filename);
      const rel = archivePath.replace(/^assets\//, '');
      assetsFolder.file(rel, blob);
      filesIncluded.push(archivePath);
    }
  }

  const portalSpec = PORTAL_TARGETS.find((p) => p.id === options.portal);
  const deployReadme = `NEXUS GAME ENGINE — Compilación HTML5
======================================
Proyecto: ${project.name}
Plataforma destino: ${portalSpec?.name ?? options.portal}
Resolución base: ${project.settings.width} x ${project.settings.height}

Archivos generados:
${filesIncluded.map((f) => `- ${f}`).join('\n')}

Notas de integración:
${portalSpec?.lifecycleNotes ?? ''}

Para probar localmente, sirve esta carpeta con cualquier servidor HTTP estático
(por ejemplo: npx serve . o python3 -m http.server 8080).
`;
  zip.file('README_DEPLOY.txt', deployReadme);
  filesIncluded.push('README_DEPLOY.txt');

  const blob = await zip.generateAsync({
    type: 'blob',
    compression: 'DEFLATE',
    compressionOptions: { level: 6 },
  });

  const safeName = sanitizeFilename(project.name.trim() || 'nexus_game').toLowerCase();
  return {
    blob,
    filename: `${safeName}_${options.portal}_html5.zip`,
    filesIncluded,
  };
}
