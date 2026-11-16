export type BehaviorCategory =
  | 'Movimiento y Física'
  | 'Plataformas Pro'
  | 'Combate e IA'
  | 'Arcade y Economía'
  | 'Juice y Partículas'
  | 'Sonido y Música'
  | 'Cámara y Escena';

export type BehaviorFieldType =
  | 'number'
  | 'boolean'
  | 'string'
  | 'select'
  | 'color'
  | 'keyCode'
  | 'audioAsset';

export interface BehaviorSchemaField {
  key: string;
  label: string;
  type: BehaviorFieldType;
  min?: number;
  max?: number;
  step?: number;
  options?: Array<{ value: string; label: string }>;
  defaultValue: number | boolean | string;
  hint?: string;
}

export interface BehaviorRegistryEntry {
  type: string;
  label: string;
  category: BehaviorCategory;
  description: string;
  keywords: string[];
  requires?: string[];
  schema: BehaviorSchemaField[];
  defaultConfig: Record<string, unknown>;
}

export const BEHAVIOR_CATEGORIES: BehaviorCategory[] = [
  'Movimiento y Física',
  'Plataformas Pro',
  'Combate e IA',
  'Arcade y Economía',
  'Juice y Partículas',
  'Sonido y Música',
  'Cámara y Escena',
];

function buildEntry(
  entry: Omit<BehaviorRegistryEntry, 'defaultConfig'> & {
    defaultConfig?: Record<string, unknown>;
  }
): BehaviorRegistryEntry {
  const defaults: Record<string, unknown> = {};
  for (const field of entry.schema) {
    defaults[field.key] = field.defaultValue;
  }
  return {
    ...entry,
    defaultConfig: { ...defaults, ...(entry.defaultConfig ?? {}) },
  };
}

export const BEHAVIOR_REGISTRY: BehaviorRegistryEntry[] = [
  // ================= 1. PLATAFORMAS PRO =================
  buildEntry({
    type: 'player_platformer',
    label: 'Jugador (Plataformas 2D)',
    category: 'Plataformas Pro',
    description:
      'Control configurable con aceleración, frenado, control aéreo, salto variable, coyote time y buffer.',
    keywords: ['jugador', 'plataformas', 'salto', 'correr', 'mario', 'personaje'],
    schema: [
      {
        key: 'profile',
        label: 'Perfil de control',
        type: 'select',
        options: [
          { value: 'preciso', label: 'Preciso' },
          { value: 'suave', label: 'Suave' },
          { value: 'arcade', label: 'Arcade' },
          { value: 'realista', label: 'Realista' },
          { value: 'rapido', label: 'Rápido' },
        ],
        defaultValue: 'preciso',
      },
      { key: 'maxSpeed', label: 'Velocidad máx (px/s)', type: 'number', min: 40, max: 1200, step: 10, defaultValue: 220 },
      { key: 'acceleration', label: 'Aceleración', type: 'number', min: 100, max: 6000, step: 50, defaultValue: 1500 },
      { key: 'deceleration', label: 'Desaceleración', type: 'number', min: 100, max: 6000, step: 50, defaultValue: 2100 },
      { key: 'groundFriction', label: 'Fricción suelo', type: 'number', min: 0.1, max: 3, step: 0.05, defaultValue: 1.0 },
      { key: 'airControl', label: 'Control aéreo (0-1)', type: 'number', min: 0, max: 1.5, step: 0.05, defaultValue: 0.72 },
      { key: 'jumpForce', label: 'Fuerza de salto', type: 'number', min: 100, max: 1500, step: 10, defaultValue: 500 },
      { key: 'gravity', label: 'Gravedad', type: 'number', min: 100, max: 4000, step: 20, defaultValue: 1280 },
      { key: 'fallGravityMultiplier', label: 'Mult. caída', type: 'number', min: 0.5, max: 3, step: 0.05, defaultValue: 1.45 },
      { key: 'variableJumpCut', label: 'Corte salto variable', type: 'number', min: 0.1, max: 1, step: 0.05, defaultValue: 0.5 },
      { key: 'coyoteTime', label: 'Coyote Time (s)', type: 'number', min: 0, max: 0.5, step: 0.01, defaultValue: 0.1 },
      { key: 'jumpBuffer', label: 'Jump Buffer (s)', type: 'number', min: 0, max: 0.5, step: 0.01, defaultValue: 0.12 },
      { key: 'maxJumps', label: 'Saltos máximos', type: 'number', min: 1, max: 5, step: 1, defaultValue: 1 },
      { key: 'jumpSoundAssetId', label: 'Sonido de salto (PC)', type: 'audioAsset', defaultValue: '' },
    ],
  }),
  buildEntry({
    type: 'movement.platformer_pro',
    label: 'Plataformas Pro (Doble Salto + Air Dash + Wall-Jump)',
    category: 'Plataformas Pro',
    description:
      'Controlador avanzado estilo Celeste/Hollow Knight con multi-salto, dash aéreo en 8 direcciones, deslizamiento en pared y salto de pared.',
    keywords: ['celeste', 'hollow knight', 'doble salto', 'dash', 'wall jump', 'pared', 'plataformas pro'],
    schema: [
      { key: 'maxSpeed', label: 'Velocidad máx (px/s)', type: 'number', min: 60, max: 1000, step: 10, defaultValue: 260 },
      { key: 'acceleration', label: 'Aceleración', type: 'number', min: 200, max: 6000, step: 50, defaultValue: 1900 },
      { key: 'deceleration', label: 'Desaceleración', type: 'number', min: 200, max: 6000, step: 50, defaultValue: 2400 },
      { key: 'jumpForce', label: 'Fuerza de salto', type: 'number', min: 150, max: 1400, step: 10, defaultValue: 520 },
      { key: 'gravity', label: 'Gravedad', type: 'number', min: 200, max: 3500, step: 20, defaultValue: 1320 },
      { key: 'maxJumps', label: 'Saltos (1=Simple, 2=Doble)', type: 'number', min: 1, max: 5, step: 1, defaultValue: 2 },
      { key: 'dashEnabled', label: 'Activar Air Dash', type: 'boolean', defaultValue: true },
      { key: 'dashKey', label: 'Tecla de Dash', type: 'keyCode', defaultValue: 'ShiftLeft' },
      { key: 'dashSpeed', label: 'Velocidad Dash (px/s)', type: 'number', min: 200, max: 1600, step: 20, defaultValue: 640 },
      { key: 'dashDuration', label: 'Duración Dash (s)', type: 'number', min: 0.05, max: 0.6, step: 0.01, defaultValue: 0.16 },
      { key: 'dashCooldown', label: 'Enfriamiento Dash (s)', type: 'number', min: 0.1, max: 3, step: 0.05, defaultValue: 0.5 },
      { key: 'wallSlideEnabled', label: 'Deslizar en paredes', type: 'boolean', defaultValue: true },
      { key: 'wallSlideSpeed', label: 'Velocidad caída en pared', type: 'number', min: 20, max: 400, step: 10, defaultValue: 95 },
      { key: 'wallJumpForceX', label: 'Impulso X salto pared', type: 'number', min: 100, max: 900, step: 10, defaultValue: 320 },
      { key: 'wallJumpForceY', label: 'Impulso Y salto pared', type: 'number', min: 150, max: 1000, step: 10, defaultValue: 490 },
      { key: 'coyoteTime', label: 'Coyote Time (s)', type: 'number', min: 0, max: 0.4, step: 0.01, defaultValue: 0.12 },
      { key: 'jumpSoundAssetId', label: 'Sonido de salto (PC)', type: 'audioAsset', defaultValue: '' },
    ],
  }),
  buildEntry({
    type: 'movement.dash',
    label: 'Habilidad Dash / Esquive Rápido',
    category: 'Plataformas Pro',
    description: 'Impulso veloz en la dirección de movimiento o mirada al pulsar una tecla.',
    keywords: ['dash', 'esquivar', 'impulso', 'sprint'],
    schema: [
      { key: 'key', label: 'Tecla de activación', type: 'keyCode', defaultValue: 'ShiftLeft' },
      { key: 'speed', label: 'Velocidad Dash (px/s)', type: 'number', min: 150, max: 1600, step: 20, defaultValue: 580 },
      { key: 'duration', label: 'Duración (s)', type: 'number', min: 0.05, max: 0.6, step: 0.01, defaultValue: 0.15 },
      { key: 'cooldown', label: 'Cooldown (s)', type: 'number', min: 0.1, max: 5, step: 0.05, defaultValue: 0.6 },
    ],
  }),
  buildEntry({
    type: 'movement.double_jump',
    label: 'Salto Extra en el Aire',
    category: 'Plataformas Pro',
    description: 'Permite impulsarse de nuevo en el aire al pulsar la tecla de salto.',
    keywords: ['doble salto', 'aire', 'salto extra'],
    schema: [
      { key: 'jumpKey', label: 'Tecla de salto', type: 'keyCode', defaultValue: 'Space' },
      { key: 'extraJumps', label: 'Saltos extra', type: 'number', min: 1, max: 5, step: 1, defaultValue: 1 },
      { key: 'jumpForce', label: 'Fuerza de salto', type: 'number', min: 150, max: 1200, step: 10, defaultValue: 460 },
    ],
  }),
  buildEntry({
    type: 'movement.wall_slide',
    label: 'Deslizamiento y Salto de Pared',
    category: 'Plataformas Pro',
    description: 'Frena la caída cuando el objeto roza un sólido lateral y permite saltar rebotando.',
    keywords: ['pared', 'wall', 'escalar', 'slide'],
    schema: [
      { key: 'slideMaxFall', label: 'Caída máx en pared', type: 'number', min: 20, max: 400, step: 10, defaultValue: 90 },
      { key: 'kickX', label: 'Rebote horizontal', type: 'number', min: 100, max: 800, step: 10, defaultValue: 300 },
      { key: 'kickY', label: 'Rebote vertical', type: 'number', min: 150, max: 900, step: 10, defaultValue: 480 },
    ],
  }),
  buildEntry({
    type: 'movement.moving_platform',
    label: 'Plataforma Móvil (Arrastra Jugador)',
    category: 'Plataformas Pro',
    description: 'Se mueve entre dos puntos y transporta suavemente al jugador cuando está encima.',
    keywords: ['plataforma movil', 'ascensor', 'elevador', 'transporte'],
    schema: [
      {
        key: 'axis',
        label: 'Eje',
        type: 'select',
        options: [
          { value: 'x', label: 'Horizontal (X)' },
          { value: 'y', label: 'Vertical (Y)' },
        ],
        defaultValue: 'x',
      },
      { key: 'distance', label: 'Distancia (px)', type: 'number', min: 20, max: 1000, step: 10, defaultValue: 160 },
      { key: 'speed', label: 'Velocidad (px/s)', type: 'number', min: 20, max: 600, step: 10, defaultValue: 100 },
    ],
  }),
  buildEntry({
    type: 'movement.conveyor',
    label: 'Cinta Transportadora',
    category: 'Plataformas Pro',
    description: 'Empuja horizontalmente a los objetos apoyados encima.',
    keywords: ['cinta', 'conveyor', 'correa', 'empujar'],
    schema: [
      { key: 'speedX', label: 'Empuje X (px/s)', type: 'number', min: -600, max: 600, step: 10, defaultValue: 140 },
    ],
  }),
  buildEntry({
    type: 'movement.gravity_zone',
    label: 'Zona de Gravedad Modificada',
    category: 'Plataformas Pro',
    description: 'Altera la velocidad vertical de los jugadores o cuerpos dentro del área (baja gravedad o levitación).',
    keywords: ['gravedad', 'espacio', 'agua', 'flotar', 'zona'],
    schema: [
      { key: 'gravityForce', label: 'Aceleración Y (negativo sube)', type: 'number', min: -1600, max: 1600, step: 20, defaultValue: -650 },
    ],
  }),

  // ================= 2. MOVIMIENTO Y FÍSICA =================
  buildEntry({
    type: 'player_topdown',
    label: 'Jugador (Top-Down / 8 Ejes)',
    category: 'Movimiento y Física',
    description: 'Movimiento suave en 8 ejes con aceleración/frenado configurable y colisión contra sólidos.',
    keywords: ['topdown', 'rpg', 'zelda', 'arriba', 'jugador', '4 direcciones'],
    schema: [
      {
        key: 'profile',
        label: 'Perfil',
        type: 'select',
        options: [
          { value: 'preciso', label: 'Preciso' },
          { value: 'suave', label: 'Suave' },
          { value: 'arcade', label: 'Arcade' },
          { value: 'rapido', label: 'Rápido' },
        ],
        defaultValue: 'preciso',
      },
      { key: 'maxSpeed', label: 'Velocidad máx (px/s)', type: 'number', min: 40, max: 1000, step: 10, defaultValue: 210 },
      { key: 'acceleration', label: 'Aceleración', type: 'number', min: 100, max: 6000, step: 50, defaultValue: 1400 },
      { key: 'deceleration', label: 'Desaceleración', type: 'number', min: 100, max: 6000, step: 50, defaultValue: 1800 },
    ],
  }),
  buildEntry({
    type: 'movement.topdown_8dir',
    label: 'Controlador Top-Down 8D Pro (Sprint + Rotación)',
    category: 'Movimiento y Física',
    description: 'Control cenital completo con tecla de sprint y rotación automática hacia la dirección de avance.',
    keywords: ['8 direcciones', 'sprint', 'correr', 'top down', 'rotar'],
    schema: [
      { key: 'maxSpeed', label: 'Velocidad base (px/s)', type: 'number', min: 40, max: 1000, step: 10, defaultValue: 220 },
      { key: 'sprintKey', label: 'Tecla Sprint', type: 'keyCode', defaultValue: 'ShiftLeft' },
      { key: 'sprintMultiplier', label: 'Multiplicador Sprint', type: 'number', min: 1, max: 3, step: 0.1, defaultValue: 1.6 },
      { key: 'acceleration', label: 'Aceleración', type: 'number', min: 100, max: 6000, step: 50, defaultValue: 1600 },
      { key: 'deceleration', label: 'Frenado', type: 'number', min: 100, max: 6000, step: 50, defaultValue: 2000 },
      { key: 'rotateToMovement', label: 'Rotar hacia movimiento', type: 'boolean', defaultValue: true },
    ],
  }),
  buildEntry({
    type: 'movement.vehicle_drift',
    label: 'Vehículo / Coche con Derrape',
    category: 'Movimiento y Física',
    description: 'Conducción estilo Arcade Top-Down con acelerador, reversa, giro y deslizamiento lateral.',
    keywords: ['coche', 'auto', 'vehiculo', 'carreras', 'drift', 'derrape', 'nave'],
    schema: [
      { key: 'accelerateSpeed', label: 'Aceleración motor', type: 'number', min: 50, max: 2000, step: 25, defaultValue: 520 },
      { key: 'maxSpeed', label: 'Velocidad máxima', type: 'number', min: 80, max: 1400, step: 20, defaultValue: 380 },
      { key: 'turnSpeed', label: 'Velocidad giro (°/s)', type: 'number', min: 40, max: 540, step: 10, defaultValue: 200 },
      { key: 'driftFactor', label: 'Agarre lateral (0=Hielo, 1=Riel)', type: 'number', min: 0.02, max: 1, step: 0.02, defaultValue: 0.18 },
      { key: 'drag', label: 'Fricción natural', type: 'number', min: 0, max: 5, step: 0.1, defaultValue: 1.4 },
    ],
  }),
  buildEntry({
    type: 'solid',
    label: 'Sólido / Plataforma',
    category: 'Movimiento y Física',
    description: 'Bloquea cuerpos físicos y sirve como suelo, pared o plataforma.',
    keywords: ['suelo', 'pared', 'muro', 'solido', 'bloque', 'colision'],
    schema: [],
  }),
  buildEntry({
    type: 'patrol',
    label: 'Patrulla Automática',
    category: 'Movimiento y Física',
    description: 'Se desplaza de un lado a otro de forma continua.',
    keywords: ['patrulla', 'ida y vuelta', 'oscilar'],
    schema: [
      {
        key: 'axis',
        label: 'Eje',
        type: 'select',
        options: [
          { value: 'x', label: 'Horizontal (X)' },
          { value: 'y', label: 'Vertical (Y)' },
        ],
        defaultValue: 'x',
      },
      { key: 'distance', label: 'Distancia (px)', type: 'number', min: 10, max: 1200, step: 10, defaultValue: 140 },
      { key: 'speed', label: 'Velocidad (px/s)', type: 'number', min: 10, max: 800, step: 10, defaultValue: 110 },
    ],
  }),
  buildEntry({
    type: 'movement.path_waypoints',
    label: 'Ruta por Puntos (Waypoints)',
    category: 'Movimiento y Física',
    description: 'Recorre una lista de coordenadas X,Y (p. ej. "100,100; 400,100; 400,300") en ciclo o ping-pong.',
    keywords: ['ruta', 'camino', 'waypoints', 'trayectoria', 'tower defense'],
    schema: [
      { key: 'waypoints', label: 'Puntos "x,y; x,y"', type: 'string', defaultValue: '200,200; 500,200; 500,450; 200,450' },
      { key: 'speed', label: 'Velocidad (px/s)', type: 'number', min: 10, max: 1000, step: 10, defaultValue: 140 },
      { key: 'pingPong', label: 'Modo Ida y Vuelta', type: 'boolean', defaultValue: false },
      { key: 'rotateToPath', label: 'Rotar hacia destino', type: 'boolean', defaultValue: true },
    ],
  }),
  buildEntry({
    type: 'movement.elastic_bounce',
    label: 'Rebote Elástico en Bordes / Sólidos',
    category: 'Movimiento y Física',
    description: 'Ideal para pelotas, Arkanoid/Pong o enemigos rebotadores.',
    keywords: ['pelota', 'rebote', 'pong', 'arkanoid', 'breakout'],
    schema: [
      { key: 'vx', label: 'Velocidad inicial X', type: 'number', min: -1000, max: 1000, step: 10, defaultValue: 240 },
      { key: 'vy', label: 'Velocidad inicial Y', type: 'number', min: -1000, max: 1000, step: 10, defaultValue: 190 },
      { key: 'restitution', label: 'Elasticidad (0.5 - 1.2)', type: 'number', min: 0.2, max: 1.5, step: 0.05, defaultValue: 1.0 },
      { key: 'bounceStageEdges', label: 'Rebotar en bordes escenario', type: 'boolean', defaultValue: true },
    ],
  }),
  buildEntry({
    type: 'spin',
    label: 'Rotación Continua',
    category: 'Movimiento y Física',
    description: 'Gira constantemente en grados por segundo.',
    keywords: ['girar', 'rotar', 'sierra', 'moneda', 'rueda'],
    schema: [
      { key: 'degPerSec', label: 'Grados por segundo', type: 'number', min: -1080, max: 1080, step: 15, defaultValue: 90 },
    ],
  }),
  buildEntry({
    type: 'movement.sine_float',
    label: 'Levitación / Flotación Senoidal',
    category: 'Movimiento y Física',
    description: 'Movimiento suave flotante ideal para monedas, fantasmas o menús.',
    keywords: ['flotar', 'levitar', 'onda', 'seno', 'suave'],
    schema: [
      {
        key: 'axis',
        label: 'Eje',
        type: 'select',
        options: [
          { value: 'y', label: 'Vertical (Y)' },
          { value: 'x', label: 'Horizontal (X)' },
        ],
        defaultValue: 'y',
      },
      { key: 'amplitude', label: 'Amplitud (px)', type: 'number', min: 2, max: 200, step: 2, defaultValue: 14 },
      { key: 'frequency', label: 'Frecuencia (Hz)', type: 'number', min: 0.1, max: 10, step: 0.1, defaultValue: 1.2 },
    ],
  }),
  buildEntry({
    type: 'movement.orbit',
    label: 'Órbita Circular',
    category: 'Movimiento y Física',
    description: 'Gira en círculo alrededor de su posición inicial o de un objeto objetivo.',
    keywords: ['orbita', 'planeta', 'satelite', 'escudo giratorio'],
    schema: [
      { key: 'targetTag', label: 'Etiqueta centro (vacío=origen)', type: 'string', defaultValue: '' },
      { key: 'radius', label: 'Radio (px)', type: 'number', min: 10, max: 500, step: 5, defaultValue: 80 },
      { key: 'angularSpeed', label: 'Velocidad angular (°/s)', type: 'number', min: -720, max: 720, step: 10, defaultValue: 140 },
    ],
  }),
  buildEntry({
    type: 'movement.follow_mouse',
    label: 'Seguir al Ratón / Puntero',
    category: 'Movimiento y Física',
    description: 'Desplaza el objeto hacia la posición del cursor o dedo.',
    keywords: ['raton', 'mouse', 'cursor', 'puntero', 'seguir'],
    schema: [
      { key: 'speed', label: 'Velocidad (px/s, 0=instantáneo)', type: 'number', min: 0, max: 2000, step: 20, defaultValue: 320 },
      { key: 'stopDistance', label: 'Distancia parada (px)', type: 'number', min: 0, max: 200, step: 2, defaultValue: 6 },
    ],
  }),
  buildEntry({
    type: 'movement.look_at_mouse',
    label: 'Apuntar hacia el Ratón / Puntero',
    category: 'Movimiento y Física',
    description: 'Rota el objeto para mirar continuamente hacia el puntero (ideal para twin-stick shooters).',
    keywords: ['apuntar', 'mirar', 'raton', 'twin stick', 'torreta'],
    schema: [
      { key: 'offsetDeg', label: 'Desfase ángulo (°)', type: 'number', min: -180, max: 180, step: 15, defaultValue: 0 },
    ],
  }),
  buildEntry({
    type: 'movement.constant_velocity',
    label: 'Velocidad Lineal Constante',
    category: 'Movimiento y Física',
    description: 'Mueve el objeto a una velocidad fija en X e Y (ideal para fondos, nubes, asteroides o balas).',
    keywords: ['velocidad', 'constante', 'desplazar', 'scroll', 'asteroide'],
    schema: [
      { key: 'vx', label: 'Velocidad X (px/s)', type: 'number', min: -1200, max: 1200, step: 10, defaultValue: -120 },
      { key: 'vy', label: 'Velocidad Y (px/s)', type: 'number', min: -1200, max: 1200, step: 10, defaultValue: 0 },
    ],
  }),
  buildEntry({
    type: 'movement.screen_wrap',
    label: 'Envolver Pantalla (Screen Wrap)',
    category: 'Movimiento y Física',
    description: 'Si sale por un borde del escenario, reaparece por el borde opuesto (estilo Asteroids/Pac-Man).',
    keywords: ['bordes', 'wrap', 'asteroids', 'pacman', 'teletransporte'],
    schema: [
      { key: 'margin', label: 'Margen exterior (px)', type: 'number', min: 0, max: 120, step: 4, defaultValue: 24 },
    ],
  }),
  buildEntry({
    type: 'movement.keep_in_bounds',
    label: 'Mantener Dentro del Escenario',
    category: 'Movimiento y Física',
    description: 'Impide que el objeto salga fuera de los límites visibles de la escena.',
    keywords: ['limites', 'borde', 'contener', 'clamp'],
    schema: [
      { key: 'padding', label: 'Margen interior (px)', type: 'number', min: 0, max: 100, step: 4, defaultValue: 16 },
    ],
  }),

  // ================= 3. COMBATE E IA =================
  buildEntry({
    type: 'chase_player',
    label: 'Perseguir al Jugador (IA Básica)',
    category: 'Combate e IA',
    description: 'Detecta al jugador dentro de un radio y se aproxima manteniendo distancia.',
    keywords: ['perseguir', 'enemigo', 'ia', 'seguir'],
    schema: [
      { key: 'speed', label: 'Velocidad (px/s)', type: 'number', min: 20, max: 800, step: 10, defaultValue: 130 },
      { key: 'detectRadius', label: 'Radio detección (px)', type: 'number', min: 40, max: 2000, step: 20, defaultValue: 420 },
      { key: 'stopDistance', label: 'Distancia parada (px)', type: 'number', min: 0, max: 300, step: 4, defaultValue: 36 },
    ],
  }),
  buildEntry({
    type: 'ai.enemy_chaser',
    label: 'Enemigo Perseguidor con Daño',
    category: 'Combate e IA',
    description: 'Persigue al jugador dentro del radio de visión y le inflige daño al tocarlo.',
    keywords: ['enemigo', 'zombie', 'perseguir', 'daño'],
    schema: [
      { key: 'speed', label: 'Velocidad (px/s)', type: 'number', min: 20, max: 800, step: 10, defaultValue: 145 },
      { key: 'detectRadius', label: 'Radio detección', type: 'number', min: 50, max: 2000, step: 20, defaultValue: 480 },
      { key: 'contactDamage', label: 'Daño al tocar', type: 'number', min: 0, max: 200, step: 5, defaultValue: 15 },
      { key: 'respectSolids', label: 'Respetar paredes sólidas', type: 'boolean', defaultValue: true },
    ],
  }),
  buildEntry({
    type: 'ai.turret_shooter',
    label: 'Torreta Automática (Apunta y Dispara)',
    category: 'Combate e IA',
    description: 'Detecta al jugador en su rango, rota hacia él y dispara proyectiles enemigos periódicamente.',
    keywords: ['torreta', 'cañon', 'disparar', 'enemigo', 'tower'],
    schema: [
      { key: 'range', label: 'Alcance (px)', type: 'number', min: 80, max: 1600, step: 20, defaultValue: 450 },
      { key: 'fireRateSec', label: 'Cadencia (segundos)', type: 'number', min: 0.15, max: 10, step: 0.05, defaultValue: 1.4 },
      { key: 'projectileSpeed', label: 'Velocidad bala', type: 'number', min: 100, max: 1200, step: 20, defaultValue: 340 },
      { key: 'damage', label: 'Daño de bala', type: 'number', min: 1, max: 200, step: 5, defaultValue: 15 },
      { key: 'projectileColor', label: 'Color proyectil', type: 'color', defaultValue: '#ef4444' },
      { key: 'rotateToTarget', label: 'Rotar hacia objetivo', type: 'boolean', defaultValue: true },
    ],
  }),
  buildEntry({
    type: 'ai.fsm_enemy',
    label: 'Enemigo IA con Estados (Patrulla / Caza / Ataque)',
    category: 'Combate e IA',
    description: 'Máquina de estados autónoma: patrulla en reposo, persigue al ver al jugador y embiste al acercarse.',
    keywords: ['fsm', 'maquina estados', 'jefe', 'boss', 'inteligencia'],
    schema: [
      { key: 'patrolDistance', label: 'Rango patrulla (px)', type: 'number', min: 20, max: 600, step: 10, defaultValue: 120 },
      { key: 'patrolSpeed', label: 'Vel. patrulla', type: 'number', min: 20, max: 400, step: 10, defaultValue: 85 },
      { key: 'chaseSpeed', label: 'Vel. persecución', type: 'number', min: 40, max: 600, step: 10, defaultValue: 175 },
      { key: 'detectRadius', label: 'Radio detección', type: 'number', min: 80, max: 1200, step: 20, defaultValue: 360 },
      { key: 'attackRange', label: 'Rango ataque', type: 'number', min: 20, max: 250, step: 10, defaultValue: 64 },
      { key: 'attackDamage', label: 'Daño ataque', type: 'number', min: 1, max: 200, step: 5, defaultValue: 20 },
    ],
  }),
  buildEntry({
    type: 'ai.flee_player',
    label: 'Huir del Jugador (IA Evasiva)',
    category: 'Combate e IA',
    description: 'Se aleja rápidamente cuando el jugador se acerca (ideal para presas o enemigos a distancia).',
    keywords: ['huir', 'escapar', 'cobarde', 'presa'],
    schema: [
      { key: 'speed', label: 'Velocidad huida', type: 'number', min: 20, max: 800, step: 10, defaultValue: 160 },
      { key: 'fleeRadius', label: 'Radio de alerta', type: 'number', min: 40, max: 800, step: 20, defaultValue: 240 },
    ],
  }),
  buildEntry({
    type: 'ai.charger_dash',
    label: 'Enemigo Embistidor (Charger)',
    category: 'Combate e IA',
    description: 'Carga a gran velocidad en línea recta cuando el jugador entra en su rango y luego descansa.',
    keywords: ['embestir', 'toro', 'carga', 'ataque'],
    schema: [
      { key: 'detectRadius', label: 'Radio detección', type: 'number', min: 80, max: 900, step: 20, defaultValue: 340 },
      { key: 'chargeSpeed', label: 'Velocidad embestida', type: 'number', min: 150, max: 1000, step: 20, defaultValue: 440 },
      { key: 'chargeDuration', label: 'Duración embestida (s)', type: 'number', min: 0.1, max: 1.5, step: 0.05, defaultValue: 0.45 },
      { key: 'cooldown', label: 'Descanso (s)', type: 'number', min: 0.4, max: 5, step: 0.1, defaultValue: 1.6 },
    ],
  }),
  buildEntry({
    type: 'combat.projectile_spawner',
    label: 'Arma / Lanzador de Proyectiles',
    category: 'Combate e IA',
    description: 'Dispara proyectiles reales al pulsar una tecla (Simple, Ráfaga, Abanico Escopeta o Teledirigido).',
    keywords: ['disparar', 'arma', 'bala', 'escopeta', 'rafaga', 'teledirigido', 'shooter'],
    schema: [
      { key: 'fireKey', label: 'Tecla de disparo', type: 'keyCode', defaultValue: 'KeyJ' },
      {
        key: 'pattern',
        label: 'Patrón de disparo',
        type: 'select',
        options: [
          { value: 'single', label: 'Simple (1 bala)' },
          { value: 'burst', label: 'Ráfaga triple' },
          { value: 'fan', label: 'Abanico / Escopeta' },
          { value: 'homing', label: 'Misil Teledirigido' },
        ],
        defaultValue: 'single',
      },
      {
        key: 'aimMode',
        label: 'Dirección de disparo',
        type: 'select',
        options: [
          { value: 'facing', label: 'Hacia donde mira (Flip/Rot)' },
          { value: 'mouse', label: 'Hacia el Ratón / Puntero' },
          { value: 'right', label: 'Siempre Derecha' },
          { value: 'up', label: 'Siempre Arriba' },
        ],
        defaultValue: 'facing',
      },
      { key: 'cooldown', label: 'Cadencia mínima (s)', type: 'number', min: 0.05, max: 3, step: 0.05, defaultValue: 0.25 },
      { key: 'projectileSpeed', label: 'Velocidad proyectil', type: 'number', min: 100, max: 1800, step: 20, defaultValue: 560 },
      { key: 'damage', label: 'Daño', type: 'number', min: 1, max: 500, step: 5, defaultValue: 25 },
      { key: 'fanCount', label: 'Balas en abanico', type: 'number', min: 2, max: 9, step: 1, defaultValue: 3 },
      { key: 'spreadDeg', label: 'Ángulo apertura (°)', type: 'number', min: 5, max: 120, step: 5, defaultValue: 30 },
      { key: 'color', label: 'Color proyectil', type: 'color', defaultValue: '#facc15' },
      { key: 'soundAssetId', label: 'Sonido disparo (PC)', type: 'audioAsset', defaultValue: '' },
    ],
  }),
  buildEntry({
    type: 'health',
    label: 'Salud / Vida (Health)',
    category: 'Combate e IA',
    description: 'Gestiona puntos de vida máximos, actuales e invulnerabilidad temporal.',
    keywords: ['vida', 'hp', 'salud', 'daño'],
    schema: [
      { key: 'maxHp', label: 'Vida máxima', type: 'number', min: 1, max: 10000, step: 10, defaultValue: 100 },
      { key: 'currentHp', label: 'Vida inicial', type: 'number', min: 1, max: 10000, step: 10, defaultValue: 100 },
      { key: 'invulnerableSec', label: 'Invulnerabilidad (s)', type: 'number', min: 0, max: 5, step: 0.05, defaultValue: 0.4 },
    ],
  }),
  buildEntry({
    type: 'combat.health_system',
    label: 'Sistema de Salud Pro (Barra Flotante)',
    category: 'Combate e IA',
    description: 'Salud avanzada con barra de vida flotante automática sobre el personaje y parpadeo al sufrir daño.',
    keywords: ['barra vida', 'salud pro', 'hp bar', 'enemigo vida'],
    schema: [
      { key: 'maxHp', label: 'Vida máxima', type: 'number', min: 1, max: 10000, step: 10, defaultValue: 100 },
      { key: 'currentHp', label: 'Vida inicial', type: 'number', min: 1, max: 10000, step: 10, defaultValue: 100 },
      { key: 'invulnerableSec', label: 'Invulnerabilidad (s)', type: 'number', min: 0, max: 4, step: 0.05, defaultValue: 0.35 },
      { key: 'showFloatingBar', label: 'Mostrar barra flotante', type: 'boolean', defaultValue: true },
      { key: 'destroyOnZero', label: 'Ocultar al llegar a 0', type: 'boolean', defaultValue: true },
    ],
  }),
  buildEntry({
    type: 'projectile',
    label: 'Proyectil (Projectile)',
    category: 'Combate e IA',
    description: 'Avanza a velocidad constante en una dirección con tiempo de vida.',
    keywords: ['bala', 'flecha', 'disparo', 'proyectil'],
    schema: [
      { key: 'vx', label: 'Velocidad X', type: 'number', min: -1600, max: 1600, step: 20, defaultValue: 420 },
      { key: 'vy', label: 'Velocidad Y', type: 'number', min: -1600, max: 1600, step: 20, defaultValue: 0 },
      { key: 'damage', label: 'Daño', type: 'number', min: 1, max: 500, step: 5, defaultValue: 25 },
      { key: 'lifetimeSec', label: 'Tiempo de vida (s)', type: 'number', min: 0.1, max: 20, step: 0.1, defaultValue: 2.5 },
      { key: 'destroyOnSolid', label: 'Destruir contra sólidos', type: 'boolean', defaultValue: true },
    ],
  }),
  buildEntry({
    type: 'combat.homing_missile',
    label: 'Misil Teledirigido',
    category: 'Combate e IA',
    description: 'Gira progresivamente hacia el objetivo más cercano con etiqueta "Enemy" o jugador.',
    keywords: ['misil', 'teledirigido', 'homing', 'rastreador'],
    schema: [
      { key: 'speed', label: 'Velocidad (px/s)', type: 'number', min: 60, max: 1200, step: 20, defaultValue: 320 },
      { key: 'turnRate', label: 'Agilidad de giro', type: 'number', min: 1, max: 20, step: 0.5, defaultValue: 6 },
      { key: 'targetTag', label: 'Etiqueta objetivo', type: 'string', defaultValue: 'Enemy' },
      { key: 'damage', label: 'Daño', type: 'number', min: 1, max: 500, step: 5, defaultValue: 30 },
    ],
  }),
  buildEntry({
    type: 'combat.contact_damage',
    label: 'Daño por Contacto',
    category: 'Combate e IA',
    description: 'Inflige daño a cualquier jugador u objeto con salud que toque este objeto.',
    keywords: ['daño', 'pinchos', 'lava', 'enemigo', 'contacto'],
    schema: [
      { key: 'damage', label: 'Daño', type: 'number', min: 1, max: 500, step: 5, defaultValue: 20 },
      { key: 'knockback', label: 'Empuje (px/s)', type: 'number', min: 0, max: 1000, step: 20, defaultValue: 240 },
      { key: 'affectTag', label: 'Afectar etiqueta (vacío=Jugador)', type: 'string', defaultValue: '' },
    ],
  }),
  buildEntry({
    type: 'combat.knockback',
    label: 'Retroceso / Empuje al Chocar',
    category: 'Combate e IA',
    description: 'Empuja hacia atrás al objeto cuando recibe contacto de enemigos o proyectiles.',
    keywords: ['knockback', 'retroceso', 'empuje'],
    schema: [
      { key: 'force', label: 'Fuerza de retroceso', type: 'number', min: 50, max: 1200, step: 20, defaultValue: 280 },
    ],
  }),
  buildEntry({
    type: 'combat.melee_attack',
    label: 'Ataque Cuerpo a Cuerpo (Espada / Golpe)',
    category: 'Combate e IA',
    description: 'Golpea en un radio frontal al pulsar una tecla y daña a enemigos cercanos.',
    keywords: ['espada', 'melee', 'golpe', 'puño', 'ataque'],
    schema: [
      { key: 'attackKey', label: 'Tecla de ataque', type: 'keyCode', defaultValue: 'KeyK' },
      { key: 'range', label: 'Alcance (px)', type: 'number', min: 24, max: 240, step: 8, defaultValue: 76 },
      { key: 'damage', label: 'Daño', type: 'number', min: 1, max: 500, step: 5, defaultValue: 35 },
      { key: 'cooldown', label: 'Enfriamiento (s)', type: 'number', min: 0.1, max: 3, step: 0.05, defaultValue: 0.35 },
      { key: 'soundAssetId', label: 'Sonido ataque (PC)', type: 'audioAsset', defaultValue: '' },
    ],
  }),
  buildEntry({
    type: 'combat.shield_block',
    label: 'Escudo Protector (Bloqueo con Tecla)',
    category: 'Combate e IA',
    description: 'Otorga invulnerabilidad temporal mientras se mantiene pulsada la tecla de escudo.',
    keywords: ['escudo', 'defender', 'parry', 'bloqueo'],
    schema: [
      { key: 'shieldKey', label: 'Tecla de escudo', type: 'keyCode', defaultValue: 'KeyL' },
    ],
  }),
  buildEntry({
    type: 'combat.auto_destroy_offscreen',
    label: 'Autodestruir Fuera de Escena',
    category: 'Combate e IA',
    description: 'Oculta y limpia balas o enemigos cuando salen lejos del escenario.',
    keywords: ['limpiar', 'fuera', 'offscreen', 'optimizar'],
    schema: [
      { key: 'margin', label: 'Margen extra (px)', type: 'number', min: 0, max: 800, step: 20, defaultValue: 160 },
    ],
  }),

  // ================= 4. ARCADE Y ECONOMÍA =================
  buildEntry({
    type: 'collectible',
    label: 'Coleccionable (+Puntos)',
    category: 'Arcade y Economía',
    description: 'Se recoge al tocar al jugador, reproduce sonido, emite partículas y suma puntos.',
    keywords: ['moneda', 'gema', 'estrella', 'recoger', 'puntos'],
    schema: [
      { key: 'points', label: 'Puntos que suma', type: 'number', min: 1, max: 10000, step: 5, defaultValue: 10 },
      { key: 'soundAssetId', label: 'Sonido al recoger (PC)', type: 'audioAsset', defaultValue: '' },
      { key: 'soundVolume', label: 'Volumen sonido', type: 'number', min: 0, max: 2, step: 0.1, defaultValue: 1 },
    ],
  }),
  buildEntry({
    type: 'economy.auto_magnet',
    label: 'Imán de Coleccionables',
    category: 'Arcade y Economía',
    description: 'Atrae hacia este objeto (normalmente el Jugador) todas las monedas o coleccionables dentro de un radio.',
    keywords: ['iman', 'magnet', 'monedas', 'atraer', 'vampire survivors'],
    schema: [
      { key: 'radius', label: 'Radio de atracción (px)', type: 'number', min: 30, max: 800, step: 10, defaultValue: 180 },
      { key: 'pullSpeed', label: 'Velocidad de atracción', type: 'number', min: 50, max: 1200, step: 20, defaultValue: 340 },
    ],
  }),
  buildEntry({
    type: 'economy.currency_drop',
    label: 'Soltar Recompensa al Morir',
    category: 'Arcade y Economía',
    description: 'Suma puntos o moneda en una variable cuando este objeto es destruido o su vida llega a 0.',
    keywords: ['botin', 'loot', 'recompensa', 'moneda', 'drop'],
    schema: [
      { key: 'variable', label: 'Variable a sumar', type: 'string', defaultValue: 'puntos' },
      { key: 'amount', label: 'Cantidad', type: 'number', min: 1, max: 5000, step: 5, defaultValue: 25 },
    ],
  }),
  buildEntry({
    type: 'arcade.wave_spawner',
    label: 'Generador de Oleadas (Wave Spawner)',
    category: 'Arcade y Economía',
    description: 'Genera periódicamente clones de un objeto plantilla o prefab alrededor de este punto.',
    keywords: ['oleada', 'wave', 'spawner', 'horda', 'generar enemigos'],
    schema: [
      { key: 'templateObjectId', label: 'ID o Nombre Objeto Plantilla', type: 'string', defaultValue: '' },
      { key: 'intervalSec', label: 'Intervalo entre spawns (s)', type: 'number', min: 0.2, max: 30, step: 0.2, defaultValue: 2.5 },
      { key: 'maxActive', label: 'Máx activos simultáneos', type: 'number', min: 1, max: 50, step: 1, defaultValue: 8 },
      { key: 'spreadRadius', label: 'Radio aleatorio (px)', type: 'number', min: 0, max: 600, step: 10, defaultValue: 120 },
    ],
  }),
  buildEntry({
    type: 'arcade.spawner_interval',
    label: 'Generador Periódico Simple',
    category: 'Arcade y Economía',
    description: 'Crea un clon de una plantilla en la posición exacta del generador cada X segundos.',
    keywords: ['generador', 'spawner', 'clonar', 'tuberia'],
    schema: [
      { key: 'templateObjectId', label: 'ID o Nombre Plantilla', type: 'string', defaultValue: '' },
      { key: 'intervalSec', label: 'Cada cuántos segundos', type: 'number', min: 0.2, max: 30, step: 0.2, defaultValue: 3.0 },
    ],
  }),
  buildEntry({
    type: 'arcade.timer_countdown',
    label: 'Temporizador / Cuenta Regresiva',
    category: 'Arcade y Economía',
    description: 'Resta segundos cada frame en una variable (p. ej. "tiempo") y emite un evento al llegar a 0.',
    keywords: ['tiempo', 'reloj', 'cuenta atras', 'cronometro', 'countdown'],
    schema: [
      { key: 'variable', label: 'Variable de tiempo', type: 'string', defaultValue: 'tiempo' },
      { key: 'startSeconds', label: 'Segundos iniciales', type: 'number', min: 1, max: 3600, step: 5, defaultValue: 60 },
      { key: 'eventOnZero', label: 'Evento al llegar a 0', type: 'string', defaultValue: 'tiempo_agotado' },
    ],
  }),
  buildEntry({
    type: 'arcade.score_multiplier',
    label: 'Multiplicador de Puntuación',
    category: 'Arcade y Economía',
    description: 'Mantiene y aplica un factor multiplicador sobre la variable de puntos al recoger bonificaciones.',
    keywords: ['multiplicador', 'x2', 'x3', 'puntuacion'],
    schema: [
      { key: 'multiplierVar', label: 'Variable multiplicador', type: 'string', defaultValue: 'multiplicador' },
      { key: 'value', label: 'Valor multiplicador', type: 'number', min: 1, max: 20, step: 1, defaultValue: 2 },
    ],
  }),
  buildEntry({
    type: 'arcade.combo_timer',
    label: 'Ventana de Combo Temporal',
    category: 'Arcade y Economía',
    description: 'Reinicia la variable "combo" a 0 si pasan X segundos sin incrementarse.',
    keywords: ['combo', 'racha', 'cadena'],
    schema: [
      { key: 'comboVar', label: 'Variable de combo', type: 'string', defaultValue: 'combo' },
      { key: 'decaySec', label: 'Segundos para perder combo', type: 'number', min: 0.5, max: 15, step: 0.5, defaultValue: 3.0 },
    ],
  }),
  buildEntry({
    type: 'arcade.bounce_pad',
    label: 'Trampolín / Muelle de Rebote',
    category: 'Arcade y Economía',
    description: 'Impulsa fuertemente hacia arriba al jugador cuando cae sobre este objeto.',
    keywords: ['trampolin', 'muelle', 'impulso', 'sonic', 'rebote'],
    schema: [
      { key: 'bounceForce', label: 'Fuerza de impulso', type: 'number', min: 200, max: 1800, step: 25, defaultValue: 760 },
    ],
  }),
  buildEntry({
    type: 'arcade.teleporter',
    label: 'Portal Teletransportador',
    category: 'Arcade y Economía',
    description: 'Teletransporta instantáneamente al jugador a las coordenadas destino dentro de la escena.',
    keywords: ['teletransporte', 'portal', 'puerta', 'warp'],
    schema: [
      { key: 'destX', label: 'Destino X', type: 'number', min: -5000, max: 10000, step: 10, defaultValue: 200 },
      { key: 'destY', label: 'Destino Y', type: 'number', min: -5000, max: 10000, step: 10, defaultValue: 200 },
      { key: 'cooldown', label: 'Enfriamiento (s)', type: 'number', min: 0.2, max: 10, step: 0.2, defaultValue: 1.0 },
    ],
  }),
  buildEntry({
    type: 'arcade.destructible',
    label: 'Objeto / Caja Destructible',
    category: 'Arcade y Economía',
    description: 'Recibe impactos de proyectiles o golpes y se rompe emitiendo partículas al quedarse sin resistencia.',
    keywords: ['caja', 'romper', 'destructible', 'barril'],
    schema: [
      { key: 'hitsToBreak', label: 'Resistencia (HP)', type: 'number', min: 1, max: 500, step: 5, defaultValue: 25 },
      { key: 'burstColor', label: 'Color astillas/partículas', type: 'color', defaultValue: '#d97706' },
    ],
  }),
  buildEntry({
    type: 'arcade.hazard_spike',
    label: 'Trampa / Pinchos Letales',
    category: 'Arcade y Economía',
    description: 'Daña al jugador al contacto y opcionalmente lo devuelve al último checkpoint.',
    keywords: ['pinchos', 'trampa', 'lava', 'peligro'],
    schema: [
      { key: 'damage', label: 'Daño', type: 'number', min: 1, max: 500, step: 5, defaultValue: 25 },
      { key: 'respawnAtCheckpoint', label: 'Devolver al Checkpoint', type: 'boolean', defaultValue: false },
    ],
  }),
  buildEntry({
    type: 'arcade.collectible_magnet_target',
    label: 'Atraíble por Imán',
    category: 'Arcade y Economía',
    description: 'Permite que un objeto con "Imán de Coleccionables" atraiga este ítem al acercarse.',
    keywords: ['iman', 'atraer', 'gema', 'moneda'],
    schema: [
      { key: 'points', label: 'Puntos al recoger', type: 'number', min: 0, max: 5000, step: 5, defaultValue: 10 },
    ],
  }),
  buildEntry({
    type: 'goal_portal',
    label: 'Meta / Puerta de Nivel',
    category: 'Cámara y Escena',
    description: 'Al tocarla el jugador cambia a la escena destino o al siguiente nivel.',
    keywords: ['meta', 'bandera', 'puerta', 'nivel', 'victoria', 'siguiente'],
    schema: [
      { key: 'targetSceneId', label: 'ID Escena destino (vacío=siguiente)', type: 'string', defaultValue: '' },
      {
        key: 'transition',
        label: 'Transición',
        type: 'select',
        options: [
          { value: 'fadeBlack', label: 'Fundido a negro' },
          { value: 'fadeWhite', label: 'Fundido a blanco' },
          { value: 'none', label: 'Instantánea' },
        ],
        defaultValue: 'fadeBlack',
      },
    ],
  }),
  buildEntry({
    type: 'checkpoint',
    label: 'Punto de Control (Checkpoint)',
    category: 'Cámara y Escena',
    description: 'Guarda la posición de reaparición del jugador dentro del nivel.',
    keywords: ['checkpoint', 'bandera', 'guardar', 'reaparicion'],
    schema: [
      { key: 'healOnTouch', label: 'Curar al tocar', type: 'boolean', defaultValue: false },
    ],
  }),

  // ================= 5. JUICE, VISUAL Y CÁMARA =================
  buildEntry({
    type: 'juice.camera_follow',
    label: 'Seguir con Cámara 2D',
    category: 'Cámara y Escena',
    description: 'Hace que la cámara de la escena siga suavemente a este objeto sin configuraciones extra.',
    keywords: ['camara', 'seguir', 'scroll', 'enfoque'],
    schema: [
      { key: 'lerp', label: 'Suavizado (0.02 - 1)', type: 'number', min: 0.02, max: 1, step: 0.02, defaultValue: 0.14 },
      { key: 'clampToBounds', label: 'Limitar al escenario', type: 'boolean', defaultValue: true },
    ],
  }),
  buildEntry({
    type: 'juice.screen_shake',
    label: 'Temblor de Cámara al Sufrir Daño',
    category: 'Cámara y Escena',
    description: 'Sacude la cámara brevemente cuando baja la vida de este objeto.',
    keywords: ['temblor', 'shake', 'impacto', 'camara'],
    schema: [
      { key: 'intensity', label: 'Intensidad (px)', type: 'number', min: 1, max: 40, step: 1, defaultValue: 8 },
      { key: 'duration', label: 'Duración (s)', type: 'number', min: 0.05, max: 1.5, step: 0.05, defaultValue: 0.25 },
    ],
  }),
  buildEntry({
    type: 'juice.particle_emitter',
    label: 'Emisor de Partículas Continuo',
    category: 'Juice y Partículas',
    description: 'Emite partículas físicas continuas desde el objeto (fuego, humo, chispas, magia, nieve).',
    keywords: ['particulas', 'fuego', 'humo', 'chispas', 'magia', 'efecto'],
    schema: [
      {
        key: 'preset',
        label: 'Estilo',
        type: 'select',
        options: [
          { value: 'fire', label: 'Fuego' },
          { value: 'smoke', label: 'Humo' },
          { value: 'sparks', label: 'Chispas' },
          { value: 'magic', label: 'Magia' },
          { value: 'dust', label: 'Polvo' },
          { value: 'snow', label: 'Nieve' },
        ],
        defaultValue: 'fire',
      },
      { key: 'rate', label: 'Partículas / seg', type: 'number', min: 1, max: 120, step: 1, defaultValue: 22 },
      { key: 'speed', label: 'Velocidad', type: 'number', min: 5, max: 500, step: 5, defaultValue: 75 },
      { key: 'color', label: 'Color principal', type: 'color', defaultValue: '#f97316' },
      { key: 'size', label: 'Tamaño (px)', type: 'number', min: 1, max: 24, step: 1, defaultValue: 5 },
      { key: 'lifetime', label: 'Vida (s)', type: 'number', min: 0.1, max: 4, step: 0.1, defaultValue: 0.7 },
    ],
  }),
  buildEntry({
    type: 'juice.squash_stretch',
    label: 'Squash & Stretch Dinámico',
    category: 'Juice y Partículas',
    description: 'Deforma elásticamente la escala al saltar y al aterrizar para dar peso y fluidez.',
    keywords: ['squash', 'stretch', 'elastico', 'jugoso', 'juice'],
    schema: [
      { key: 'intensity', label: 'Intensidad (0.1 - 0.5)', type: 'number', min: 0.05, max: 0.6, step: 0.05, defaultValue: 0.22 },
    ],
  }),
  buildEntry({
    type: 'juice.hit_flash',
    label: 'Destello Visual al Recibir Daño',
    category: 'Juice y Partículas',
    description: 'Parpadea con opacidad/color cuando el objeto está en tiempo de invulnerabilidad.',
    keywords: ['flash', 'parpadeo', 'daño', 'invulnerable'],
    schema: [
      { key: 'blinkRate', label: 'Frecuencia parpadeo', type: 'number', min: 4, max: 40, step: 2, defaultValue: 18 },
    ],
  }),
  buildEntry({
    type: 'juice.pulse_scale',
    label: 'Pulso de Escala Rítmico (Latido)',
    category: 'Juice y Partículas',
    description: 'Escala suavemente hacia arriba y abajo (perfecto para botones CTA, corazones o estrellas).',
    keywords: ['pulso', 'latido', 'escala', 'boton', 'brillo'],
    schema: [
      { key: 'amount', label: 'Variación escala', type: 'number', min: 0.01, max: 0.6, step: 0.01, defaultValue: 0.08 },
      { key: 'speed', label: 'Velocidad (Hz)', type: 'number', min: 0.2, max: 10, step: 0.2, defaultValue: 2.0 },
    ],
  }),
  buildEntry({
    type: 'juice.ghost_trail',
    label: 'Estela de Partículas al Moverse',
    category: 'Juice y Partículas',
    description: 'Deja un rastro visual detrás del objeto cuando supera cierta velocidad.',
    keywords: ['estela', 'rastro', 'trail', 'velocidad', 'dash'],
    schema: [
      { key: 'color', label: 'Color de estela', type: 'color', defaultValue: '#38bdf8' },
      { key: 'minSpeed', label: 'Velocidad mínima', type: 'number', min: 10, max: 600, step: 10, defaultValue: 120 },
    ],
  }),
  buildEntry({
    type: 'juice.fade_after_time',
    label: 'Desvanecerse y Ocultarse',
    category: 'Juice y Partículas',
    description: 'Reduce gradualmente la opacidad tras N segundos y oculta el objeto al terminar.',
    keywords: ['desvanecer', 'fade', 'opacidad', 'temporal'],
    schema: [
      { key: 'delaySec', label: 'Esperar (s)', type: 'number', min: 0, max: 30, step: 0.2, defaultValue: 1.0 },
      { key: 'fadeDuration', label: 'Duración fade (s)', type: 'number', min: 0.1, max: 10, step: 0.1, defaultValue: 0.8 },
    ],
  }),
  buildEntry({
    type: 'juice.auto_flip_velocity',
    label: 'Voltear Sprite Según Dirección',
    category: 'Juice y Partículas',
    description: 'Invierte horizontalmente el sprite (flipX) automáticamente según se mueva a izquierda o derecha.',
    keywords: ['voltear', 'flip', 'direccion', 'espejo'],
    schema: [
      { key: 'threshold', label: 'Umbral velocidad', type: 'number', min: 1, max: 100, step: 1, defaultValue: 5 },
    ],
  }),
  buildEntry({
    type: 'juice.floating_hp_bar',
    label: 'Barra de Vida Flotante',
    category: 'Juice y Partículas',
    description: 'Dibuja una barra de vida compacta encima del objeto cuando tiene Salud.',
    keywords: ['barra', 'vida', 'flotante', 'hp', 'enemigo'],
    schema: [
      { key: 'width', label: 'Ancho (px)', type: 'number', min: 20, max: 200, step: 4, defaultValue: 48 },
      { key: 'offsetY', label: 'Separación arriba (px)', type: 'number', min: 4, max: 80, step: 2, defaultValue: 12 },
      { key: 'fillColor', label: 'Color relleno', type: 'color', defaultValue: '#22c55e' },
    ],
  }),
  buildEntry({
    type: 'juice.parallax_layer',
    label: 'Efecto Parallax de Fondo',
    category: 'Cámara y Escena',
    description: 'Desplaza el objeto a una fracción del movimiento de la cámara para crear profundidad.',
    keywords: ['parallax', 'fondo', 'profundidad', 'nubes', 'montañas'],
    schema: [
      { key: 'factorX', label: 'Factor X (0=fijo, 0.5=lento)', type: 'number', min: -1, max: 2, step: 0.05, defaultValue: 0.4 },
      { key: 'factorY', label: 'Factor Y', type: 'number', min: -1, max: 2, step: 0.05, defaultValue: 0.15 },
    ],
  }),
  buildEntry({
    type: 'juice.sound_on_collision',
    label: 'Sonido Automático al Colisionar',
    category: 'Sonido y Música',
    description: 'Reproduce un archivo de audio importado o efecto sintetizado cuando este objeto choca con el jugador.',
    keywords: ['sonido', 'sfx', 'colision', 'audio', 'mp3', 'wav'],
    schema: [
      { key: 'audioAssetId', label: 'Archivo de audio (PC)', type: 'audioAsset', defaultValue: '' },
      {
        key: 'preset',
        label: 'Respaldo sintetizado',
        type: 'select',
        options: [
          { value: 'hit', label: 'Impacto' },
          { value: 'coin', label: 'Moneda' },
          { value: 'jump', label: 'Salto' },
          { value: 'powerup', label: 'Power-Up' },
          { value: 'step', label: 'Paso' },
          { value: 'win', label: 'Victoria' },
        ],
        defaultValue: 'hit',
      },
      { key: 'volume', label: 'Volumen', type: 'number', min: 0, max: 2, step: 0.05, defaultValue: 1 },
      { key: 'pitch', label: 'Tono (Pitch)', type: 'number', min: 0.4, max: 2, step: 0.05, defaultValue: 1 },
      { key: 'cooldown', label: 'Cooldown (s)', type: 'number', min: 0.05, max: 5, step: 0.05, defaultValue: 0.35 },
    ],
  }),
  buildEntry({
    type: 'audio.sound_trigger',
    label: 'Disparador de Sonido por Evento',
    category: 'Sonido y Música',
    description: 'Asocia cualquier audio importado desde PC (WAV/MP3/OGG) a este objeto y dispáralo al iniciar, tocar, hacer clic, pulsar tecla o cada X segundos.',
    keywords: ['audio', 'sonido', 'disparador', 'trigger', 'efecto', 'sfx', 'clic', 'tecla', 'mp3', 'wav'],
    schema: [
      {
        key: 'event',
        label: 'Cuándo reproducir',
        type: 'select',
        options: [
          { value: 'onTouchPlayer', label: 'Al tocar al Jugador' },
          { value: 'onStart', label: 'Al iniciar la escena' },
          { value: 'onClick', label: 'Al hacer clic en el objeto' },
          { value: 'onKeyPressed', label: 'Al pulsar una tecla' },
          { value: 'onInterval', label: 'Cada X segundos (ambiente)' },
          { value: 'onDestroy', label: 'Al ocultarse o quedarse sin vida' },
        ],
        defaultValue: 'onTouchPlayer',
      },
      { key: 'audioAssetId', label: 'Audio importado (PC)', type: 'audioAsset', defaultValue: '' },
      {
        key: 'preset',
        label: 'Si no hay archivo, usar synth',
        type: 'select',
        options: [
          { value: 'coin', label: 'Moneda' },
          { value: 'jump', label: 'Salto' },
          { value: 'hit', label: 'Impacto' },
          { value: 'powerup', label: 'Power-Up' },
          { value: 'step', label: 'Paso' },
          { value: 'win', label: 'Victoria' },
        ],
        defaultValue: 'powerup',
      },
      {
        key: 'channel',
        label: 'Canal de mezcla',
        type: 'select',
        options: [
          { value: 'sfx', label: 'Efectos (SFX)' },
          { value: 'music', label: 'Música' },
          { value: 'ui', label: 'Interfaz (UI)' },
        ],
        defaultValue: 'sfx',
      },
      { key: 'key', label: 'Tecla (si aplica)', type: 'keyCode', defaultValue: 'KeyE' },
      { key: 'volume', label: 'Volumen (0 - 2)', type: 'number', min: 0, max: 2, step: 0.05, defaultValue: 1 },
      { key: 'pitch', label: 'Tono base', type: 'number', min: 0.4, max: 2.5, step: 0.05, defaultValue: 1 },
      { key: 'randomPitch', label: 'Variación tono (+/-)', type: 'number', min: 0, max: 0.5, step: 0.02, defaultValue: 0 },
      { key: 'loop', label: 'Repetir en bucle', type: 'boolean', defaultValue: false },
      { key: 'cooldown', label: 'Enfriamiento / Intervalo (s)', type: 'number', min: 0.05, max: 30, step: 0.05, defaultValue: 0.5 },
    ],
  }),
  buildEntry({
    type: 'audio.music_zone',
    label: 'Zona / Activador de Música',
    category: 'Sonido y Música',
    description: 'Cambia o inicia una pista de música de fondo al iniciar o cuando el jugador entra en esta zona.',
    keywords: ['musica', 'zona', 'ambiente', 'fondo', 'banda sonora', 'ost'],
    schema: [
      {
        key: 'triggerMode',
        label: 'Activación',
        type: 'select',
        options: [
          { value: 'onTouchPlayer', label: 'Cuando el Jugador entra en la zona' },
          { value: 'onStart', label: 'Al empezar la escena' },
        ],
        defaultValue: 'onTouchPlayer',
      },
      { key: 'audioAssetId', label: 'Pista musical (PC)', type: 'audioAsset', defaultValue: '' },
      { key: 'volume', label: 'Volumen pista', type: 'number', min: 0, max: 1.5, step: 0.05, defaultValue: 0.8 },
      { key: 'loop', label: 'Bucle continuo', type: 'boolean', defaultValue: true },
      { key: 'keepIfSame', label: 'No reiniciar si ya suena', type: 'boolean', defaultValue: true },
    ],
  }),
];

const REGISTRY_MAP = new Map<string, BehaviorRegistryEntry>(
  BEHAVIOR_REGISTRY.map((b) => [b.type, b])
);

export function getBehaviorEntry(type: string): BehaviorRegistryEntry | undefined {
  return REGISTRY_MAP.get(type);
}

export function searchBehaviors(query: string, category?: BehaviorCategory | 'Todas'): BehaviorRegistryEntry[] {
  const q = query.trim().toLowerCase();
  return BEHAVIOR_REGISTRY.filter((entry) => {
    if (category && category !== 'Todas' && entry.category !== category) {
      return false;
    }
    if (!q) return true;
    const hay = `${entry.label} ${entry.type} ${entry.description} ${entry.category} ${entry.keywords.join(' ')}`.toLowerCase();
    return hay.includes(q);
  });
}
