import type { SceneContextType } from '../core/types';

export type SuperBehaviorCategory =
  | 'Multijugador y Red'
  | 'Persistencia y Mundo'
  | 'Portales Web'
  | 'Herramientas y Vehículos'
  | 'Supervivencia y Mundo Abierto'
  | 'RPG y Misiones'
  | 'UI y Menús';

export interface SuperBehaviorField {
  key: string;
  label: string;
  type: 'number' | 'boolean' | 'string' | 'select' | 'color' | 'keyCode' | 'audioAsset';
  min?: number;
  max?: number;
  step?: number;
  options?: Array<{ value: string; label: string }>;
  defaultValue: number | boolean | string;
}

export interface SuperBehaviorSpec {
  type: string;
  label: string;
  category: SuperBehaviorCategory;
  description: string;
  keywords: string[];
  contexts: SceneContextType[];
  inputs: string[];
  outputs: string[];
  schema: SuperBehaviorField[];
  defaultConfig: Record<string, unknown>;
}

function defSuper(
  entry: Omit<SuperBehaviorSpec, 'defaultConfig'> & { defaultConfig?: Record<string, unknown> }
): SuperBehaviorSpec {
  const defaults: Record<string, unknown> = {};
  for (const f of entry.schema) defaults[f.key] = f.defaultValue;
  return {
    ...entry,
    defaultConfig: { ...defaults, ...(entry.defaultConfig ?? {}) },
  };
}

export const SUPER_BEHAVIOR_CATEGORIES: SuperBehaviorCategory[] = [
  'Multijugador y Red',
  'Persistencia y Mundo',
  'Portales Web',
  'Herramientas y Vehículos',
  'Supervivencia y Mundo Abierto',
  'RPG y Misiones',
  'UI y Menús',
];

export const SUPER_BEHAVIOR_SPECS: SuperBehaviorSpec[] = [
  // ================= MULTIJUGADOR Y RED =================
  defSuper({
    type: 'net.entity_sync',
    label: 'Identidad y Autoridad de Red',
    category: 'Multijugador y Red',
    description: 'Replica el objeto en sala multijugador WebSocket con autoridad local, de sala o servidor.',
    keywords: ['multijugador', 'red', 'online', 'sync', 'authority', 'servidor'],
    contexts: ['gameplay', 'open_world'],
    inputs: ['setOwner', 'syncNow'],
    outputs: ['onPlayerJoined', 'onPlayerLeft', 'onNetSynced'],
    schema: [
      {
        key: 'authority',
        label: 'Autoridad',
        type: 'select',
        options: [
          { value: 'local', label: 'Jugador Local (Propietario)' },
          { value: 'server', label: 'Servidor Autoritativo' },
          { value: 'room', label: 'Sala / Host' },
        ],
        defaultValue: 'local',
      },
      { key: 'roomId', label: 'ID de Sala / Shard', type: 'string', defaultValue: 'global_1' },
      { key: 'syncRateHz', label: 'Frecuencia envío (Hz)', type: 'number', min: 2, max: 30, step: 1, defaultValue: 12 },
    ],
  }),
  defSuper({
    type: 'net.transform_sync',
    label: 'Sincronización de Movimiento en Red',
    category: 'Multijugador y Red',
    description: 'Sincroniza posición, rotación y velocidad con interpolación suave entre clientes.',
    keywords: ['posicion', 'movimiento', 'multijugador', 'interpolacion', '2d', '3d'],
    contexts: ['gameplay', 'open_world'],
    inputs: ['applyRemotePose'],
    outputs: ['onPoseSent'],
    schema: [
      { key: 'interpolation', label: 'Suavizado interpolación', type: 'number', min: 0.05, max: 1, step: 0.05, defaultValue: 0.25 },
      { key: 'threshold', label: 'Umbral mínimo envío', type: 'number', min: 0.01, max: 20, step: 0.1, defaultValue: 0.5 },
    ],
  }),
  defSuper({
    type: 'net.anim_sync',
    label: 'Sincronización de Animación y Estados',
    category: 'Multijugador y Red',
    description: 'Replica el estado actual de la máquina de animaciones y acciones hacia otros jugadores.',
    keywords: ['animacion', 'estados', 'fsm', 'red', 'multijugador'],
    contexts: ['gameplay', 'open_world'],
    inputs: ['applyRemoteState'],
    outputs: ['onAnimStateReplicated'],
    schema: [
      { key: 'syncStateMachine', label: 'Replicar FSM de animación', type: 'boolean', defaultValue: true },
    ],
  }),
  defSuper({
    type: 'net.zone_shard',
    label: 'Sala / Zona / Sharding Instanciado',
    category: 'Multijugador y Red',
    description: 'Gestiona canales o instancias de mundo abierto y mueve al jugador de canal sin perder inventario.',
    keywords: ['sala', 'shard', 'canal', 'instancia', 'mazmorra', 'mmo'],
    contexts: ['gameplay', 'open_world', 'menu'],
    inputs: ['switchShard'],
    outputs: ['onShardChanged'],
    schema: [
      { key: 'shardId', label: 'Nombre de Shard / Canal', type: 'string', defaultValue: 'canal_1' },
      { key: 'maxPlayers', label: 'Máx. jugadores por sala', type: 'number', min: 2, max: 64, step: 1, defaultValue: 20 },
    ],
  }),
  defSuper({
    type: 'net.player_trade',
    label: 'Intercambio Seguro entre Jugadores',
    category: 'Multijugador y Red',
    description: 'Permite enviar o intercambiar ítems y monedas con validación anti-duplicado.',
    keywords: ['comercio', 'trade', 'intercambio', 'economia', 'online'],
    contexts: ['gameplay', 'open_world', 'inventory'],
    inputs: ['proposeTrade', 'acceptTrade'],
    outputs: ['onTradeCompleted'],
    schema: [
      { key: 'requireNearby', label: 'Requerir cercanía', type: 'boolean', defaultValue: true },
      { key: 'tradeRadius', label: 'Distancia máx', type: 'number', min: 20, max: 500, step: 10, defaultValue: 120 },
    ],
  }),
  defSuper({
    type: 'net.world_chat_emote',
    label: 'Chat Rápido y Emotes en Mundo',
    category: 'Multijugador y Red',
    description: 'Emite mensajes cortos o emotes visibles sobre el personaje y sincronizados en la sala.',
    keywords: ['chat', 'emote', 'social', 'burbuja', 'multijugador'],
    contexts: ['gameplay', 'open_world'],
    inputs: ['sendEmote'],
    outputs: ['onEmoteReceived'],
    schema: [
      { key: 'emoteKey', label: 'Tecla de Emote', type: 'keyCode', defaultValue: 'KeyT' },
      { key: 'defaultText', label: 'Emote / Saludo', type: 'string', defaultValue: '¡Hola!' },
    ],
  }),

  // ================= PERSISTENCIA Y MUNDO =================
  defSuper({
    type: 'persistence.player_save',
    label: 'Persistencia de Jugador (Inventario y Progreso)',
    category: 'Persistencia y Mundo',
    description: 'Guarda y restaura automáticamente inventario, monedas, stats y misiones en local + servidor.',
    keywords: ['guardar', 'cargar', 'save', 'persistencia', 'inventario', 'monedas'],
    contexts: ['gameplay', 'open_world', 'inventory', 'menu'],
    inputs: ['saveNow', 'loadNow', 'syncCloud'],
    outputs: ['onSaved', 'onLoaded'],
    schema: [
      { key: 'slotKey', label: 'Clave de guardado', type: 'string', defaultValue: 'nexus_player_save_v1' },
      { key: 'autoSaveSec', label: 'Autoguardado (s)', type: 'number', min: 2, max: 120, step: 1, defaultValue: 10 },
      { key: 'syncServer', label: 'Sincronizar con servidor API', type: 'boolean', defaultValue: true },
    ],
  }),
  defSuper({
    type: 'world.resource_node',
    label: 'Nodo de Recurso Persistente (Reaparición)',
    category: 'Persistencia y Mundo',
    description: 'Recurso recolectable (cristal, mena, árbol) con anti-duplicado, enfriamiento y reaparición automática.',
    keywords: ['recurso', 'cristal', 'mina', 'arbol', 'recolectar', 'respawn', 'persistente'],
    contexts: ['gameplay', 'open_world'],
    inputs: ['harvest', 'forceRespawn'],
    outputs: ['onCollected', 'onRespawned'],
    schema: [
      { key: 'itemId', label: 'ID de ítem entregado', type: 'string', defaultValue: 'crystal' },
      { key: 'amount', label: 'Cantidad por extracción', type: 'number', min: 1, max: 100, step: 1, defaultValue: 1 },
      { key: 'respawnSec', label: 'Tiempo reaparición (s)', type: 'number', min: 1, max: 3600, step: 1, defaultValue: 20 },
      { key: 'interactRadius', label: 'Radio de recogida', type: 'number', min: 1, max: 300, step: 2, defaultValue: 56 },
      { key: 'autoPickup', label: 'Recoger al tocar (si no requiere tecla)', type: 'boolean', defaultValue: true },
    ],
  }),
  defSuper({
    type: 'world.zone_portal',
    label: 'Portal de Zona / Mazmorra Persistente',
    category: 'Persistencia y Mundo',
    description: 'Transporta al jugador a otra escena o zona manteniendo inventario, stats y shard de red.',
    keywords: ['zona', 'portal', 'mazmorra', 'cambio escena', 'mundo abierto'],
    contexts: ['gameplay', 'open_world'],
    inputs: ['enterZone'],
    outputs: ['onEnterZone'],
    schema: [
      { key: 'targetSceneId', label: 'ID o Nombre de escena destino', type: 'string', defaultValue: '' },
      { key: 'spawnTag', label: 'Etiqueta punto aparición', type: 'string', defaultValue: 'spawn_default' },
      { key: 'preserveInventory', label: 'Conservar inventario y progreso', type: 'boolean', defaultValue: true },
    ],
  }),
  defSuper({
    type: 'world.chest_storage',
    label: 'Cofre / Almacén Persistente',
    category: 'Persistencia y Mundo',
    description: 'Contenedor que guarda recursos adicionales o entrega recompensa única sin duplicar.',
    keywords: ['cofre', 'almacen', 'baul', 'guardar', 'recompensa'],
    contexts: ['gameplay', 'open_world', 'inventory'],
    inputs: ['openChest', 'depositItem'],
    outputs: ['onChestOpened'],
    schema: [
      { key: 'chestId', label: 'ID único del cofre', type: 'string', defaultValue: 'cofre_01' },
      { key: 'rewardItem', label: 'Ítem contenido', type: 'string', defaultValue: 'gold_coin' },
      { key: 'rewardAmount', label: 'Cantidad', type: 'number', min: 1, max: 500, step: 1, defaultValue: 10 },
      { key: 'oneTimeOnly', label: 'Solo abrir una vez', type: 'boolean', defaultValue: true },
    ],
  }),

  // ================= PORTALES WEB =================
  defSuper({
    type: 'portal.sdk_bridge',
    label: 'Adaptador Portal (Poki / CrazyGames / Playgama)',
    category: 'Portales Web',
    description: 'Conecta el ciclo de vida oficial del portal (gameplayStart/Stop, mute y guardado híbrido).',
    keywords: ['poki', 'crazygames', 'playgama', 'portal', 'sdk', 'web'],
    contexts: ['gameplay', 'open_world', 'menu', 'pause'],
    inputs: ['gameplayStart', 'gameplayStop', 'saveCloud'],
    outputs: ['onPortalReady', 'onPortalPaused'],
    schema: [
      {
        key: 'portal',
        label: 'Plataforma objetivo',
        type: 'select',
        options: [
          { value: 'auto', label: 'Detección automática' },
          { value: 'poki', label: 'Poki SDK' },
          { value: 'crazygames', label: 'CrazyGames SDK' },
          { value: 'playgama', label: 'Playgama Bridge' },
          { value: 'web', label: 'Web Independiente' },
        ],
        defaultValue: 'auto',
      },
      { key: 'autoGameplayStart', label: 'Iniciar gameplayStart al entrar', type: 'boolean', defaultValue: true },
    ],
  }),
  defSuper({
    type: 'portal.rewarded_ad',
    label: 'Anuncio Recompensado (Rewarded Ad)',
    category: 'Portales Web',
    description: 'Pausa el juego y audio, solicita anuncio recompensado en Poki/CrazyGames/Playgama y entrega premio.',
    keywords: ['anuncio', 'recompensa', 'rewarded', 'poki', 'crazygames', 'playgama'],
    contexts: ['gameplay', 'open_world', 'menu', 'inventory'],
    inputs: ['requestRewardedAd'],
    outputs: ['onAdRewardGranted', 'onAdClosed'],
    schema: [
      { key: 'triggerKey', label: 'Tecla prueba / activación', type: 'keyCode', defaultValue: 'KeyR' },
      { key: 'rewardVar', label: 'Variable recompensa', type: 'string', defaultValue: 'monedas' },
      { key: 'rewardAmount', label: 'Cantidad premio', type: 'number', min: 1, max: 10000, step: 10, defaultValue: 50 },
    ],
  }),
  defSuper({
    type: 'portal.adaptive_quality',
    label: 'Rendimiento Adaptativo Automático',
    category: 'Portales Web',
    description: 'Monitoriza FPS reales y ajusta densidad de efectos/sombras para mantener fluidez en móviles.',
    keywords: ['fps', 'rendimiento', 'calidad', 'optimizacion', 'movil'],
    contexts: ['gameplay', 'open_world'],
    inputs: ['forceQuality'],
    outputs: ['onQualityAdjusted'],
    schema: [
      { key: 'targetFps', label: 'FPS objetivo', type: 'number', min: 24, max: 120, step: 5, defaultValue: 50 },
      { key: 'allowLowMode', label: 'Reducir partículas si baja FPS', type: 'boolean', defaultValue: true },
    ],
  }),

  // ================= HERRAMIENTAS Y VEHÍCULOS =================
  defSuper({
    type: 'tool.equippable',
    label: 'Herramienta Equipable (Mano / Hotbar)',
    category: 'Herramientas y Vehículos',
    description: 'Permite equipar y usar esta herramienta junto al jugador con tecla rápida.',
    keywords: ['herramienta', 'equipar', 'mano', 'item', 'hotbar'],
    contexts: ['gameplay', 'open_world'],
    inputs: ['equip', 'unequip', 'usePrimary'],
    outputs: ['onEquipped', 'onUsed'],
    schema: [
      { key: 'slot', label: 'Ranura', type: 'string', defaultValue: 'hand' },
      {
        key: 'toolType',
        label: 'Tipo herramienta',
        type: 'select',
        options: [
          { value: 'rod', label: 'Caña de pescar' },
          { value: 'net', label: 'Red de captura' },
          { value: 'pickaxe', label: 'Pico' },
          { value: 'axe', label: 'Hacha' },
          { value: 'sickle', label: 'Hoz' },
          { value: 'scanner', label: 'Escáner' },
        ],
        defaultValue: 'rod',
      },
      { key: 'useKey', label: 'Tecla de uso', type: 'keyCode', defaultValue: 'KeyF' },
    ],
  }),
  defSuper({
    type: 'tool.fishing_rod',
    label: 'Caña de Pescar Interactiva',
    category: 'Herramientas y Vehículos',
    description: 'Lanza el sedal, espera picada y captura peces ponderados entregándolos al inventario.',
    keywords: ['pesca', 'caña', 'pez', 'agua', 'captura', 'rpg'],
    contexts: ['gameplay', 'open_world'],
    inputs: ['castLine', 'reelIn'],
    outputs: ['onFishCaught', 'onLineCast'],
    schema: [
      { key: 'castKey', label: 'Tecla lanzar / recoger', type: 'keyCode', defaultValue: 'KeyF' },
      { key: 'castRange', label: 'Alcance lance', type: 'number', min: 2, max: 350, step: 2, defaultValue: 120 },
      { key: 'biteTimeSec', label: 'Tiempo de picada (s)', type: 'number', min: 0.3, max: 15, step: 0.2, defaultValue: 1.8 },
      { key: 'fishPool', label: 'Peces (separados por coma)', type: 'string', defaultValue: 'trucha,salmon,pez_dorado' },
    ],
  }),
  defSuper({
    type: 'tool.capture_net',
    label: 'Red de Captura en Área',
    category: 'Herramientas y Vehículos',
    description: 'Captura en un barrido múltiples coleccionables o criaturas en el radio hacia el inventario.',
    keywords: ['red', 'capturar', 'mariposas', 'insectos', 'area', 'recoger'],
    contexts: ['gameplay', 'open_world'],
    inputs: ['swingNet'],
    outputs: ['onBatchCaptured'],
    schema: [
      { key: 'swingKey', label: 'Tecla usar red', type: 'keyCode', defaultValue: 'KeyG' },
      { key: 'radius', label: 'Radio de barrido', type: 'number', min: 1, max: 350, step: 5, defaultValue: 110 },
      { key: 'maxTargets', label: 'Máx. capturas por uso', type: 'number', min: 1, max: 25, step: 1, defaultValue: 5 },
      { key: 'cooldownSec', label: 'Enfriamiento (s)', type: 'number', min: 0.2, max: 10, step: 0.1, defaultValue: 1.0 },
    ],
  }),
  defSuper({
    type: 'tool.harvest',
    label: 'Herramienta de Extracción (Pico / Hacha / Hoz)',
    category: 'Herramientas y Vehículos',
    description: 'Golpea y extrae nodos de recursos cercanos (madera, piedra, cultivos) con poder configurable.',
    keywords: ['pico', 'hacha', 'hoz', 'minar', 'talar', 'recolectar'],
    contexts: ['gameplay', 'open_world'],
    inputs: ['swingTool'],
    outputs: ['onHarvested'],
    schema: [
      { key: 'swingKey', label: 'Tecla extracción', type: 'keyCode', defaultValue: 'KeyE' },
      { key: 'range', label: 'Alcance', type: 'number', min: 1.5, max: 250, step: 2, defaultValue: 85 },
      { key: 'power', label: 'Poder de extracción', type: 'number', min: 1, max: 100, step: 1, defaultValue: 1 },
      { key: 'cooldownSec', label: 'Enfriamiento (s)', type: 'number', min: 0.1, max: 5, step: 0.1, defaultValue: 0.45 },
    ],
  }),
  defSuper({
    type: 'vehicle.watercraft',
    label: 'Bote / Vehículo Acuático (Subir y Conducir)',
    category: 'Herramientas y Vehículos',
    description: 'Permite al jugador subir/bajar con tecla E y navegar sobre agua con cámara enfocada.',
    keywords: ['bote', 'barco', 'lancha', 'agua', 'vehiculo', 'navegar'],
    contexts: ['gameplay', 'open_world'],
    inputs: ['board', 'disembark'],
    outputs: ['onBoardStateChanged'],
    schema: [
      { key: 'boardKey', label: 'Tecla subir / bajar', type: 'keyCode', defaultValue: 'KeyE' },
      { key: 'maxSpeed', label: 'Velocidad máx.', type: 'number', min: 2, max: 600, step: 5, defaultValue: 220 },
      { key: 'turnSpeed', label: 'Velocidad giro', type: 'number', min: 0.5, max: 360, step: 5, defaultValue: 140 },
      { key: 'boardRadius', label: 'Distancia para subir', type: 'number', min: 2, max: 220, step: 4, defaultValue: 85 },
    ],
  }),
  defSuper({
    type: 'physics.water_buoyancy',
    label: 'Flotabilidad y Corrientes de Agua',
    category: 'Herramientas y Vehículos',
    description: 'Mantiene flotando el objeto sobre el nivel del agua con amortiguación y arrastre de corriente.',
    keywords: ['flotar', 'agua', 'arquimedes', 'corriente', 'rio', 'mar'],
    contexts: ['gameplay', 'open_world'],
    inputs: ['setWaterLevel'],
    outputs: ['onWaterEntered'],
    schema: [
      { key: 'waterLevel', label: 'Nivel Y del agua', type: 'number', min: -2000, max: 5000, step: 5, defaultValue: 0 },
      { key: 'buoyancy', label: 'Fuerza flotación', type: 'number', min: 1, max: 100, step: 1, defaultValue: 12 },
      { key: 'currentX', label: 'Corriente X', type: 'number', min: -300, max: 300, step: 5, defaultValue: 0 },
    ],
  }),
  defSuper({
    type: 'vehicle.mount',
    label: 'Montura / Mascota Compañera',
    category: 'Herramientas y Vehículos',
    description: 'Sigue al jugador como mascota o permite montarlo para desplazarse más rápido.',
    keywords: ['montura', 'caballo', 'mascota', 'pet', 'compañero'],
    contexts: ['gameplay', 'open_world'],
    inputs: ['followOwner', 'mountToggle'],
    outputs: ['onMounted', 'onDismounted'],
    schema: [
      {
        key: 'mode',
        label: 'Comportamiento',
        type: 'select',
        options: [
          { value: 'companion', label: 'Compañero / Mascota seguidora' },
          { value: 'mount', label: 'Montura con tecla E' },
        ],
        defaultValue: 'companion',
      },
      { key: 'followSpeed', label: 'Velocidad', type: 'number', min: 2, max: 600, step: 5, defaultValue: 170 },
      { key: 'followDistance', label: 'Distancia al jugador', type: 'number', min: 1.5, max: 300, step: 4, defaultValue: 64 },
    ],
  }),

  // ================= SUPERVIVENCIA Y MUNDO ABIERTO =================
  defSuper({
    type: 'survival.vitals',
    label: 'Supervivencia (Hambre / Sed / Estamina)',
    category: 'Supervivencia y Mundo Abierto',
    description: 'Gestiona barras de estamina, hambre, sed y oxígeno con regeneración y alertas.',
    keywords: ['supervivencia', 'hambre', 'sed', 'estamina', 'oxigeno', 'survival'],
    contexts: ['gameplay', 'open_world'],
    inputs: ['restoreVitals', 'consumeStamina'],
    outputs: ['onVitalsLow'],
    schema: [
      { key: 'hungerDrainPerMin', label: 'Desgaste hambre / min', type: 'number', min: 0, max: 60, step: 1, defaultValue: 4 },
      { key: 'thirstDrainPerMin', label: 'Desgaste sed / min', type: 'number', min: 0, max: 60, step: 1, defaultValue: 6 },
      { key: 'staminaRegen', label: 'Regeneración estamina / s', type: 'number', min: 1, max: 100, step: 1, defaultValue: 15 },
    ],
  }),
  defSuper({
    type: 'world.day_night_weather',
    label: 'Ciclo Día / Noche y Clima Dinámico',
    category: 'Supervivencia y Mundo Abierto',
    description: 'Controla la hora del día (0-24h) y clima (despejado, lluvia, tormenta) en variables globales.',
    keywords: ['dia', 'noche', 'clima', 'lluvia', 'tiempo', 'mundo abierto'],
    contexts: ['gameplay', 'open_world'],
    inputs: ['setWeather', 'setTimeOfDay'],
    outputs: ['onDayPhaseChanged'],
    schema: [
      { key: 'daySpeedHoursPerMin', label: 'Velocidad (horas/min real)', type: 'number', min: 0.1, max: 60, step: 0.5, defaultValue: 2 },
      {
        key: 'weather',
        label: 'Clima inicial',
        type: 'select',
        options: [
          { value: 'clear', label: 'Despejado' },
          { value: 'rain', label: 'Lluvia' },
          { value: 'storm', label: 'Tormenta' },
          { value: 'snow', label: 'Nieve' },
        ],
        defaultValue: 'clear',
      },
    ],
  }),
  defSuper({
    type: 'world.interactive_surface',
    label: 'Superficie Interactiva (Hielo / Barro / Lava)',
    category: 'Supervivencia y Mundo Abierto',
    description: 'Altera fricción, velocidad o daño mientras el jugador pisa esta zona.',
    keywords: ['hielo', 'barro', 'lava', 'arena', 'superficie', 'terreno'],
    contexts: ['gameplay', 'open_world'],
    inputs: [],
    outputs: ['onSurfaceEntered'],
    schema: [
      {
        key: 'surfaceKind',
        label: 'Tipo superficie',
        type: 'select',
        options: [
          { value: 'ice', label: 'Hielo (Deslizante)' },
          { value: 'mud', label: 'Barro (Lento)' },
          { value: 'lava', label: 'Lava (Daño fuego)' },
          { value: 'speed_boost', label: 'Pista Turbo' },
        ],
        defaultValue: 'ice',
      },
      { key: 'speedMultiplier', label: 'Factor velocidad', type: 'number', min: 0.2, max: 3, step: 0.1, defaultValue: 1.45 },
      { key: 'damagePerSec', label: 'Daño / seg (si aplica)', type: 'number', min: 0, max: 100, step: 2, defaultValue: 10 },
    ],
  }),
  defSuper({
    type: 'world.grid_builder',
    label: 'Construcción en Grilla / Colocación',
    category: 'Supervivencia y Mundo Abierto',
    description: 'Permite construir estructuras o bloques alineados a grilla consumiendo recursos del inventario.',
    keywords: ['construccion', 'bloques', 'minecraft', 'grilla', 'colocar'],
    contexts: ['gameplay', 'open_world'],
    inputs: ['placeStructure'],
    outputs: ['onStructurePlaced'],
    schema: [
      { key: 'buildKey', label: 'Tecla construir', type: 'keyCode', defaultValue: 'KeyB' },
      { key: 'gridSize', label: 'Tamaño celda', type: 'number', min: 1, max: 256, step: 4, defaultValue: 32 },
      { key: 'costItemId', label: 'Recurso requerido', type: 'string', defaultValue: 'wood' },
      { key: 'costAmount', label: 'Cantidad recurso', type: 'number', min: 0, max: 100, step: 1, defaultValue: 1 },
    ],
  }),
  defSuper({
    type: 'world.crop_farm',
    label: 'Cultivo y Cosecha Temporal',
    category: 'Supervivencia y Mundo Abierto',
    description: 'Crece por etapas hasta estar listo para cosechar y entregar frutos al inventario.',
    keywords: ['cultivo', 'granja', 'cosecha', 'semilla', 'farming'],
    contexts: ['gameplay', 'open_world'],
    inputs: ['waterCrop', 'harvestCrop'],
    outputs: ['onCropReady', 'onCropHarvested'],
    schema: [
      { key: 'growTimeSec', label: 'Tiempo maduración (s)', type: 'number', min: 2, max: 600, step: 2, defaultValue: 12 },
      { key: 'yieldItemId', label: 'Ítem cosechado', type: 'string', defaultValue: 'wheat' },
      { key: 'yieldAmount', label: 'Cantidad cosecha', type: 'number', min: 1, max: 50, step: 1, defaultValue: 3 },
    ],
  }),
  defSuper({
    type: 'world.fire_status',
    label: 'Estados Elementales (Fuego / Veneno / Escarcha)',
    category: 'Supervivencia y Mundo Abierto',
    description: 'Aplica daño o ralentización elemental por contacto con duración e inmunidad.',
    keywords: ['fuego', 'veneno', 'hielo', 'estado', 'quemadura', 'elemento'],
    contexts: ['gameplay', 'open_world'],
    inputs: ['ignite', 'extinguish'],
    outputs: ['onStatusApplied'],
    schema: [
      {
        key: 'element',
        label: 'Elemento',
        type: 'select',
        options: [
          { value: 'burn', label: 'Fuego (Quemadura)' },
          { value: 'poison', label: 'Veneno' },
          { value: 'freeze', label: 'Escarcha (Lento)' },
        ],
        defaultValue: 'burn',
      },
      { key: 'dps', label: 'Daño por segundo', type: 'number', min: 0, max: 200, step: 2, defaultValue: 8 },
      { key: 'durationSec', label: 'Duración (s)', type: 'number', min: 0.5, max: 30, step: 0.5, defaultValue: 3 },
    ],
  }),

  // ================= RPG Y MISIONES =================
  defSuper({
    type: 'inventory.backpack',
    label: 'Inventario de Mochila (Slots + Peso + Persistencia)',
    category: 'RPG y Misiones',
    description: 'Recibe ítems desde recolectables, caña, red y loot, sincronizándolos con persistencia y UI.',
    keywords: ['inventario', 'mochila', 'items', 'slots', 'recibir'],
    contexts: ['gameplay', 'open_world', 'inventory'],
    inputs: ['receiveItem', 'receiveBatch', 'receiveDrop', 'consumeItem'],
    outputs: ['onInventoryChanged'],
    schema: [
      { key: 'maxSlots', label: 'Máx. ranuras', type: 'number', min: 4, max: 200, step: 2, defaultValue: 24 },
      { key: 'persistSave', label: 'Persistir automáticamente', type: 'boolean', defaultValue: true },
    ],
  }),
  defSuper({
    type: 'rpg.equipment_stats',
    label: 'Equipo y Estadísticas Dinámicas',
    category: 'RPG y Misiones',
    description: 'Calcula ataque, defensa y velocidad bonus según el equipo equipado.',
    keywords: ['equipo', 'armadura', 'espada', 'stats', 'rpg'],
    contexts: ['gameplay', 'open_world', 'inventory'],
    inputs: ['equipItem'],
    outputs: ['onStatsUpdated'],
    schema: [
      { key: 'baseAttack', label: 'Ataque base', type: 'number', min: 1, max: 1000, step: 1, defaultValue: 10 },
      { key: 'baseDefense', label: 'Defensa base', type: 'number', min: 0, max: 1000, step: 1, defaultValue: 5 },
    ],
  }),
  defSuper({
    type: 'rpg.crafting_station',
    label: 'Mesa de Crafteo y Recetas',
    category: 'RPG y Misiones',
    description: 'Combina ingredientes del inventario para fabricar herramientas o consumibles al pulsar E.',
    keywords: ['crafteo', 'fabricar', 'receta', 'mesa', 'rpg'],
    contexts: ['gameplay', 'open_world', 'inventory'],
    inputs: ['craftRecipe'],
    outputs: ['onItemCrafted'],
    schema: [
      { key: 'craftKey', label: 'Tecla fabricar', type: 'keyCode', defaultValue: 'KeyC' },
      { key: 'inputItem', label: 'Ingrediente requerido', type: 'string', defaultValue: 'crystal' },
      { key: 'inputCount', label: 'Cantidad requerida', type: 'number', min: 1, max: 50, step: 1, defaultValue: 2 },
      { key: 'outputItem', label: 'Ítem fabricado', type: 'string', defaultValue: 'gem_amulet' },
    ],
  }),
  defSuper({
    type: 'rpg.loot_drop',
    label: 'Tabla de Botín Ponderada (Loot Drop)',
    category: 'RPG y Misiones',
    description: 'Entrega ítems aleatorios ponderados al inventario del jugador cuando este enemigo cae.',
    keywords: ['loot', 'botin', 'drop', 'enemigo', 'tesoro'],
    contexts: ['gameplay', 'open_world'],
    inputs: ['rollLoot'],
    outputs: ['onLootDropped'],
    schema: [
      { key: 'itemId', label: 'Ítem principal', type: 'string', defaultValue: 'gold_coin' },
      { key: 'minAmount', label: 'Cantidad mín.', type: 'number', min: 1, max: 50, step: 1, defaultValue: 1 },
      { key: 'maxAmount', label: 'Cantidad máx.', type: 'number', min: 1, max: 100, step: 1, defaultValue: 3 },
      { key: 'dropChance', label: 'Probabilidad (0-1)', type: 'number', min: 0.05, max: 1, step: 0.05, defaultValue: 0.85 },
    ],
  }),
  defSuper({
    type: 'rpg.quest_giver',
    label: 'NPC Gestor de Misiones y Logros',
    category: 'RPG y Misiones',
    description: 'Asigna misiones de recolección/derrota al acercarse y entrega recompensas al completar.',
    keywords: ['mision', 'quest', 'npc', 'recompensa', 'logro'],
    contexts: ['gameplay', 'open_world'],
    inputs: ['talkNpc', 'completeQuest'],
    outputs: ['onQuestStarted', 'onQuestCompleted'],
    schema: [
      { key: 'questId', label: 'ID de misión', type: 'string', defaultValue: 'quest_crystals' },
      { key: 'targetItem', label: 'Ítem objetivo', type: 'string', defaultValue: 'crystal' },
      { key: 'requiredAmount', label: 'Cantidad requerida', type: 'number', min: 1, max: 100, step: 1, defaultValue: 3 },
      { key: 'rewardPoints', label: 'Recompensa puntos', type: 'number', min: 10, max: 10000, step: 10, defaultValue: 100 },
    ],
  }),
  defSuper({
    type: 'rpg.shop_vendor',
    label: 'Tienda / Comerciante de Ítems',
    category: 'RPG y Misiones',
    description: 'Vende un ítem a cambio de monedas/puntos cuando el jugador interactúa cerca.',
    keywords: ['tienda', 'vendedor', 'comprar', 'monedas', 'shop'],
    contexts: ['gameplay', 'open_world', 'inventory'],
    inputs: ['buyItem'],
    outputs: ['onPurchased'],
    schema: [
      { key: 'buyKey', label: 'Tecla comprar', type: 'keyCode', defaultValue: 'KeyE' },
      { key: 'itemId', label: 'Ítem en venta', type: 'string', defaultValue: 'potion' },
      { key: 'price', label: 'Precio (puntos/monedas)', type: 'number', min: 1, max: 10000, step: 5, defaultValue: 25 },
    ],
  }),
  defSuper({
    type: 'ai.stealth_sensor',
    label: 'Sigilo, Cono de Visión y Ruido',
    category: 'RPG y Misiones',
    description: 'Detecta al jugador solo si está dentro del cono frontal o hace ruido cerca.',
    keywords: ['sigilo', 'stealth', 'cono', 'vision', 'ruido', 'guardia'],
    contexts: ['gameplay', 'open_world'],
    inputs: ['alertGuard'],
    outputs: ['onPlayerSpotted'],
    schema: [
      { key: 'visionRange', label: 'Alcance visión', type: 'number', min: 20, max: 800, step: 10, defaultValue: 240 },
      { key: 'fovDeg', label: 'Ángulo visión (°)', type: 'number', min: 20, max: 180, step: 5, defaultValue: 75 },
      { key: 'noiseRadius', label: 'Radio detección sonido', type: 'number', min: 10, max: 300, step: 10, defaultValue: 80 },
    ],
  }),

  // ================= UI Y MENÚS =================
  defSuper({
    type: 'ui.menu_nav',
    label: 'Control de Menú Aislado (Sin Conflicto Juego)',
    category: 'UI y Menús',
    description: 'Activa botones y navegación solo en escenas de Menú/Pausa/Inventario, aislando controles de juego.',
    keywords: ['menu', 'navegacion', 'ui', 'boton', 'escena', 'pausa'],
    contexts: ['menu', 'pause', 'inventory', 'ui'],
    inputs: ['activateOption'],
    outputs: ['onMenuSelected'],
    schema: [
      { key: 'targetSceneId', label: 'Escena a cargar al activar', type: 'string', defaultValue: '' },
      { key: 'focusOrder', label: 'Orden de foco', type: 'number', min: 0, max: 50, step: 1, defaultValue: 0 },
    ],
  }),
];
