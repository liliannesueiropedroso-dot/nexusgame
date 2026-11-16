export type PortalTargetId = 'web' | 'poki' | 'crazygames' | 'playgama' | 'custom';

export interface PortalTargetSpec {
  id: PortalTargetId;
  name: string;
  shortLabel: string;
  description: string;
  sdkScriptUrl: string | null;
  injectedFiles: string[];
  lifecycleNotes: string;
}

export const PORTAL_TARGETS: PortalTargetSpec[] = [
  {
    id: 'web',
    name: 'Web Estándar / itch.io',
    shortLabel: 'Web / itch.io',
    description:
      'Juego HTML5 autónomo sin dependencias externas. Ideal para itch.io, Vercel, Netlify o servidor propio.',
    sdkScriptUrl: null,
    injectedFiles: ['index.html', 'css/style.css', 'js/pixi.min.js', 'js/nexus-runtime.js', 'js/portal-sdk.js', 'data/game.json', 'assets/*'],
    lifecycleNotes: 'Sin SDK externo. Persistencia de variables y ranking local con localStorage.',
  },
  {
    id: 'poki',
    name: 'Poki (PokiSDK v2)',
    shortLabel: 'Poki',
    description:
      'Inyecta el SDK oficial de Poki y conecta automáticamente init(), gameLoadingFinished(), gameplayStart(), gameplayStop() y anuncios.',
    sdkScriptUrl: 'https://game-cdn.poki.com/scripts/v2/poki-sdk.js',
    injectedFiles: ['index.html (con poki-sdk.js)', 'js/portal-sdk.js', 'js/pixi.min.js', 'js/nexus-runtime.js', 'data/game.json', 'assets/*'],
    lifecycleNotes: 'Conecta PokiSDK.init(), commercialBreak(), rewardedBreak() y respaldo localStorage con tolerancia a bloqueadores.',
  },
  {
    id: 'crazygames',
    name: 'CrazyGames (SDK v3)',
    shortLabel: 'CrazyGames',
    description:
      'Inyecta el SDK oficial v3 de CrazyGames e inicializa loadingStart(), loadingStop(), gameplayStart(), SDK.data y anuncios.',
    sdkScriptUrl: 'https://sdk.crazygames.com/crazygames-sdk-v3.js',
    injectedFiles: ['index.html (con crazygames-sdk-v3.js)', 'js/portal-sdk.js', 'js/pixi.min.js', 'js/nexus-runtime.js', 'data/game.json', 'assets/*'],
    lifecycleNotes: 'Conecta CrazyGames.SDK.init(), SDK.ad y sincronización de guardado en nube vía SDK.data.',
  },
  {
    id: 'playgama',
    name: 'Playgama (Bridge SDK)',
    shortLabel: 'Playgama',
    description:
      'Inyecta Playgama Bridge como primer script en <head>, genera playgama-bridge-config.json y conecta bridge.storage, leaderboards y anuncios.',
    sdkScriptUrl: 'https://bridge.playgama.com/playgama-bridge.js',
    injectedFiles: ['index.html (con playgama-bridge.js)', 'playgama-bridge-config.json', 'js/portal-sdk.js', 'js/pixi.min.js', 'js/nexus-runtime.js', 'data/game.json', 'assets/*'],
    lifecycleNotes: 'Incluye playgama-bridge-config.json y conecta bridge.storage, bridge.advertisement y bridge.leaderboards.',
  },
  {
    id: 'custom',
    name: 'Portal personalizado',
    shortLabel: 'Personalizado',
    description:
      'Permite inyectar la URL del script SDK de otro portal HTML5 y exponer eventos estándar, guardado y ranking en window.NexusPortal.',
    sdkScriptUrl: null,
    injectedFiles: ['index.html', 'js/portal-sdk.js', 'js/pixi.min.js', 'js/nexus-runtime.js', 'data/game.json', 'assets/*'],
    lifecycleNotes: 'Inyecta tu script SDK en <head> si indicas una URL y expone hooks en window.NexusPortal.',
  },
];

export interface Html5CompileOptions {
  portal: PortalTargetId;
  customSdkUrl?: string;
  scaleMode: 'letterbox' | 'cover';
  touchControls: boolean;
  showFullscreenButton: boolean;
}
