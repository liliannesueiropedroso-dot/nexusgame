/**
 * Tipos fundamentales del núcleo de NEXUS GAME ENGINE.
 * Separados de la capa de renderizado (PixiJS) y de la capa de UI (React)
 * para permitir múltiples géneros 2D, física, colisiones, UI, escenas y compilación HTML5.
 */

export type GameObjectType =
  | 'sprite'
  | 'rectangle'
  | 'circle'
  | 'text'
  | 'container'
  | 'tilemap'
  | 'ui_button'
  | 'ui_panel'
  | 'ui_progress_bar'
  | 'ui_leaderboard'
  | 'ui_widget'
  | 'light_2d'
  | 'mesh_3d'
  | 'light_3d'
  | 'camera_3d';

export type EditorTool = 'select' | 'move' | 'scale' | 'rotate' | 'pan' | 'tilebrush';

export interface Vector2 {
  x: number;
  y: number;
}

export interface Transform2D {
  x: number;
  y: number;
  rotation: number; // Grados sexagesimales
  scaleX: number;
  scaleY: number;
  width: number;  // Ancho base antes de escala
  height: number; // Alto base antes de escala
  anchorX: number; // 0..1 (0.5 por defecto)
  anchorY: number; // 0..1 (0.5 por defecto)
}

export type SpriteFitMode =
  | 'original'
  | 'contain'
  | 'cover'
  | 'stretch'
  | 'crop'
  | 'tile'
  | 'nine_slice';

export type TextureSamplingMode = 'linear' | 'nearest';

export interface SpriteCropRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface NineSliceMargins {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

export interface SpriteImagePoint {
  id: string;
  name: string;
  nx: number;
  ny: number;
}

export interface AnimationFrameEvent {
  id: string;
  clipName: string;
  frameIndex: number;
  eventName: string;
  soundAssetId?: string | null;
  particlePreset?: ParticlePresetId;
}

export interface BoneSocketAttachment3D {
  parentObjectId: string;
  boneName: string;
  offsetX: number;
  offsetY: number;
  offsetZ: number;
  rotX?: number;
  rotY?: number;
  rotZ?: number;
}

export type CollisionLayer =
  | 'Default'
  | 'Player'
  | 'Enemy'
  | 'World'
  | 'Ground'
  | 'Projectile'
  | 'Collectible'
  | 'Sensor'
  | 'UI';

export const COLLISION_LAYERS: CollisionLayer[] = [
  'Default',
  'Player',
  'Enemy',
  'World',
  'Ground',
  'Projectile',
  'Collectible',
  'Sensor',
  'UI',
];

export type ColliderShapeType = 'box' | 'circle' | 'capsule' | 'smart_alpha';

export interface SmartColliderRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface Collider2D {
  id: string;
  shape: ColliderShapeType;
  isSensor: boolean;
  offsetX: number;
  offsetY: number;
  width: number;
  height: number;
  radius: number;
  layer: CollisionLayer;
  mask?: CollisionLayer[];
  smartRects?: SmartColliderRect[];
  alphaThreshold?: number;
}

export interface RigidBody2DConfig {
  bodyType: 'dynamic' | 'kinematic' | 'static';
  mass: number;
  gravityScale: number;
  linearDamping: number;
  restitution: number;
  fixedRotation: boolean;
}

export type SceneContextType =
  | 'gameplay'
  | 'menu'
  | 'open_world'
  | 'inventory'
  | 'pause'
  | 'ui';

export const SCENE_CONTEXT_LABELS: Record<SceneContextType, string> = {
  gameplay: 'Gameplay (Acción / Nivel)',
  open_world: 'Mundo Abierto (Exploración + Red)',
  menu: 'Menú / Portada (Aislado)',
  inventory: 'Inventario / Tienda',
  pause: 'Pausa / Modal',
  ui: 'Interfaz / HUD',
};

export type ArchetypeId =
  | 'collectible'
  | 'fishing_rod'
  | 'capture_net'
  | 'tool_harvest'
  | 'boat'
  | 'vehicle_land'
  | 'enemy_fsm'
  | 'npc_quest'
  | 'portal_gate'
  | 'open_world_player'
  | 'menu_button';

export interface WiringLink {
  id: string;
  sourceObjectId: string;
  sourceBehavior: string;
  signal: string;
  targetObjectId: string;
  targetBehavior: string;
  action: string;
  auto: boolean;
}

export interface NetworkEntityConfig {
  replicated: boolean;
  authority: 'local' | 'server' | 'room';
  syncTransform?: boolean;
  syncAnim?: boolean;
  ownerId?: string | null;
}

export interface SceneMultiplayerConfig {
  enabled: boolean;
  roomId: string;
  maxPlayers: number;
  syncRateHz: number;
  autoShard?: boolean;
  serverUrl?: string;
}

export interface EngineComponentData {
  id: string;
  type: string;
  enabled: boolean;
  config: Record<string, unknown>;
  /** Origen del comportamiento: 'manual' | 'archetype:<id>' | 'context:<id>' */
  source?: string;
  /** Contextos de escena en los que este comportamiento se ejecuta */
  contexts?: SceneContextType[];
  inputs?: string[];
  outputs?: string[];
}

export interface SpriteAnimationClip {
  id: string;
  name: 'idle' | 'walk' | 'jump' | 'fall' | 'attack' | 'custom' | string;
  startFrame: number;
  frameCount: number;
  fps: number;
  loop: boolean;
}

export interface SpriteAnimationConfig {
  enabled: boolean;
  cols: number;
  rows: number;
  frameCount: number;
  fps: number;
  loop: boolean;
  playing: boolean;
  /** Vincula automáticamente los clips o la reproducción al movimiento del objeto */
  linkToMovement?: boolean;
  /** Estado actual de clip ("idle" | "walk" | "jump" | "fall" | nombre) */
  activeClip?: string;
  /** Clips definidos sobre la hoja de sprites */
  clips?: SpriteAnimationClip[];
  /** Estado activo resuelto por la Máquina de Estados visual 2D */
  fsmActiveState?: {
    stateName: string;
    assetId?: string | null;
    cols?: number;
    rows?: number;
    startFrame?: number;
    frameCount?: number;
    fps?: number;
    loop?: boolean;
  };
}

export type MechanicTriggerEvent =
  | 'scene.start'
  | 'scene.paused'
  | 'tick'
  | 'collision.enter'
  | 'collision.stay'
  | 'collision.exit'
  | 'trigger.enter'
  | 'trigger.exit'
  | 'input.pressed'
  | 'input.held'
  | 'input.released'
  | 'ui.click'
  | 'mouse.clickGlobal'
  | 'mouse.hold'
  | 'mouse.release'
  | 'touch.swipe'
  | 'timer.elapsed'
  | 'countdown.zero'
  | 'variable.changed'
  | 'health.zero'
  | 'portal.adClosed'
  | 'portal.rewarded'
  | 'custom.event';

export type ConditionCombinator = 'all' | 'any' | 'none';

export type ConditionType =
  | 'variable.compare'
  | 'variable.objectCompare'
  | 'boolean'
  | 'object.visible'
  | 'object.grounded'
  | 'object.exists'
  | 'object.property'
  | 'object.hasTag'
  | 'object.animating'
  | 'object.flipped'
  | 'health.compare'
  | 'state.is'
  | 'input.held'
  | 'distance.less'
  | 'distance.greater'
  | 'random.chance';

export interface ConditionDefinition {
  id: string;
  type: ConditionType;
  variable?: string;
  secondaryVariable?: string;
  operator?: '==' | '!=' | '>' | '>=' | '<' | '<=';
  value?: unknown;
  target?: string;
  secondaryTarget?: string;
  property?: string;
  tag?: string;
  key?: string;
}

export type ActionType =
  | 'variable.add'
  | 'variable.set'
  | 'audio.play'
  | 'audio.beep'
  | 'audio.setVolume'
  | 'audio.stopAll'
  | 'music.play'
  | 'music.stop'
  | 'object.destroy'
  | 'object.show'
  | 'object.hide'
  | 'object.move'
  | 'object.teleport'
  | 'object.spawn'
  | 'object.setProperty'
  | 'object.rotateToward'
  | 'object.flash'
  | 'component.toggle'
  | 'physics.impulse'
  | 'physics.force'
  | 'physics.setVelocity'
  | 'health.damage'
  | 'health.heal'
  | 'animation.play'
  | 'tween.play'
  | 'state.set'
  | 'scene.load'
  | 'scene.overlay'
  | 'scene.pop'
  | 'scene.restart'
  | 'scene.nextLevel'
  | 'scene.pause'
  | 'checkpoint.save'
  | 'prefab.spawn'
  | 'camera.shake'
  | 'particles.burst'
  | 'particles.emit'
  | 'storage.save'
  | 'storage.load'
  | 'leaderboard.submit'
  | 'event.emit'
  | 'script.call'
  | 'ui.openInterface'
  | 'ui.closeInterface'
  | 'ui.toggleInterface'
  | 'camera.switch'
  | 'anim3d.setState'
  | 'vfx.emit'
  | 'ai.chase'
  | 'ai.moveTo'
  | 'ai.stop'
  | 'dialogue.start'
  | 'i18n.setLocale'
  | 'vehicle.enterExit'
  | 'wait';

export interface ActionDefinition {
  id: string;
  type: ActionType;
  parameters: Record<string, unknown>;
}

export interface GameMechanic {
  id: string;
  name: string;
  enabled: boolean;
  priority: number;
  ownerObjectId?: string | null;
  conditionCombinator?: ConditionCombinator;
  trigger: {
    event: MechanicTriggerEvent;
    sourceObjectId?: string;
    target?: string;
    tag?: string;
    layer?: CollisionLayer | '';
    key?: string;
    swipeDir?: 'any' | 'left' | 'right' | 'up' | 'down';
    intervalSec?: number;
    variable?: string;
    eventName?: string;
  };
  conditions: ConditionDefinition[];
  actions: ActionDefinition[];
}

export interface ProjectVariable {
  id: string;
  name: string;
  scope: 'global' | 'match' | 'scene' | 'object';
  targetObjectId?: string;
  type: 'number' | 'boolean' | 'string';
  initialValue: number | boolean | string;
  persistent?: boolean;
}

export interface AudioBusSettings {
  master: number;
  music: number;
  sfx: number;
  ui: number;
  muted: {
    master: boolean;
    music: boolean;
    sfx: boolean;
    ui: boolean;
  };
}

export interface ParticleBurstVisual {
  x: number;
  y: number;
  color: string;
  count: number;
  age: number;
  duration: number;
}

export interface SpriteProperties {
  assetId: string | null;
  normalAssetId?: string | null;
  tint: string;
  flipX: boolean;
  flipY: boolean;
  fitMode?: SpriteFitMode;
  aspectLocked?: boolean;
  sampling?: TextureSamplingMode;
  cropRect?: SpriteCropRect;
  nineSlice?: NineSliceMargins;
  imagePoints?: SpriteImagePoint[];
  frameEvents?: AnimationFrameEvent[];
  animation?: SpriteAnimationConfig;
}

export interface RectangleProperties {
  fillColor: string;
  strokeColor: string;
  strokeWidth: number;
  cornerRadius: number;
}

export interface CircleProperties {
  fillColor: string;
  strokeColor: string;
  strokeWidth: number;
  radius: number;
}

export interface TextProperties {
  text: string;
  fontSize: number;
  fontFamily: string;
  color: string;
  fontWeight: 'normal' | 'bold';
  align: 'left' | 'center' | 'right';
  bindVariable?: string;
}

export interface UIButtonProperties {
  text: string;
  bgColor: string;
  hoverColor: string;
  textColor: string;
  borderColor: string;
  borderRadius: number;
  fontSize: number;
  /** Acción rápida directa sin necesidad de regla compleja */
  onClickAction?: 'none' | 'load_scene' | 'overlay_scene' | 'pop_scene' | 'restart_scene' | 'next_level' | 'emit_event';
  targetSceneId?: string;
  transition?: SceneTransitionType;
  eventName?: string;
  /** Sonido opcional al hacer clic (archivo de audio o preset sintetizado) */
  clickSoundAssetId?: string | null;
  clickSoundPreset?: string;
  clickSoundVolume?: number;
}

export interface UIPanelProperties {
  bgColor: string;
  borderColor: string;
  borderWidth: number;
  borderRadius: number;
}

export interface UIProgressBarProperties {
  variable: string;
  maxValue: number;
  fillColor: string;
  bgColor: string;
  borderColor: string;
  showLabel: boolean;
}

export interface UILeaderboardProperties {
  title: string;
  maxEntries: number;
  bgColor: string;
  borderColor: string;
  textColor: string;
  accentColor: string;
  variable?: string;
}

export type ParticlePresetId =
  | 'custom'
  | 'explosion'
  | 'fire'
  | 'smoke'
  | 'sparks'
  | 'magic'
  | 'dust'
  | 'rain'
  | 'snow'
  | 'liquid'
  | 'waterfall'
  | 'ripple';

export type ParticleEmitterShape = 'point' | 'sphere' | 'ring' | 'cone' | 'box';
export type ParticleRenderShape = 'circle' | 'spark' | 'smoke' | 'ring' | 'liquid';

export interface ParticleEmitterLayer {
  id: string;
  name: string;
  enabled: boolean;
  preset: ParticlePresetId;
  rate: number;
  maxParticles: number;
  speedMin: number;
  speedMax: number;
  angleDeg: number;
  spreadDeg: number;
  gravity: number;
  sizeStart: number;
  sizeEnd: number;
  lifetime: number;
  colorStart: string;
  colorEnd: string;
  blendAlpha: number;
  alphaStart?: number;
  alphaEnd?: number;
  rotationSpeed?: number;
  textureAssetId?: string | null;
  cols?: number;
  rows?: number;
  spritesheetFps?: number;
  additive?: boolean;
  emitterShape?: ParticleEmitterShape;
  particleShape?: ParticleRenderShape;
  emitterRadius?: number;
  drag?: number;
  turbulence?: number;
  speedCurve?: number[];
  sizeCurve?: number[];
  alphaCurve?: number[];
  offsetX?: number;
  offsetY?: number;
}

export interface ParticleEmitterConfig {
  enabled: boolean;
  preset: ParticlePresetId;
  rate: number; // partículas por segundo
  maxParticles: number;
  speedMin: number;
  speedMax: number;
  angleDeg: number; // -90 = arriba
  spreadDeg: number; // 0..360
  gravity: number;
  sizeStart: number;
  sizeEnd: number;
  lifetime: number; // segundos
  colorStart: string;
  colorEnd: string;
  blendAlpha: number; // 0..1
  alphaStart?: number; // 0..1
  alphaEnd?: number; // 0..1
  rotationSpeed?: number; // deg/s
  textureAssetId?: string | null;
  cols?: number;
  rows?: number;
  spritesheetFps?: number;
  additive?: boolean;
  emitterShape?: ParticleEmitterShape;
  particleShape?: ParticleRenderShape;
  emitterRadius?: number;
  drag?: number;
  turbulence?: number;
  speedCurve?: number[];
  sizeCurve?: number[];
  alphaCurve?: number[];
  /** Capas adicionales simultáneas para efectos compuestos (ej. fuego + chispas + humo) */
  layers?: ParticleEmitterLayer[];
}

export type TweenProperty =
  | 'x'
  | 'y'
  | 'z'
  | 'rx'
  | 'ry'
  | 'rz'
  | 'scaleX'
  | 'scaleY'
  | 'scaleZ'
  | 'rotation'
  | 'opacity'
  | 'fov';
export type TweenEasing = 'linear' | 'easeIn' | 'easeOut' | 'easeInOut' | 'bounce';

export interface TweenKeyframeTrack {
  id: string;
  name: string;
  property: TweenProperty;
  from: number;
  to: number;
  duration: number;
  delay: number;
  easing: TweenEasing;
  loop: boolean;
  pingPong: boolean;
  autoPlay: boolean;
}

export type TileCollisionKind = 'solid' | 'none' | 'one_way' | 'damage';
export type TileBrushMode = 'single' | 'rect' | 'bucket' | 'autotile';

export interface TileMetadataEntry {
  collision: TileCollisionKind;
  damagePerSec?: number;
}

export interface TilemapProperties {
  assetId: string | null;
  tileWidth: number;
  tileHeight: number;
  cols: number;
  rows: number;
  tilesetCols: number;
  tilesetRows: number;
  selectedTileIndex: number;
  /** Mapa disperso "col,row" -> índice de tile en la hoja (0..N-1) */
  cells: Record<string, number>;
  brushMode?: TileBrushMode;
  autotileEnabled?: boolean;
  /** Índice base en el tileset desde el cual comienzan los 16 tiles (máscara 4-bit 0..15) */
  autotileBaseTile?: number;
  /** Mapa opcional máscara 4-bit (0..15) -> índice exacto de tile en la hoja */
  autotileBitmaskMap?: Record<number, number>;
  /** Colisión y efecto por índice de tile ("0", "1", etc.) */
  tileTypes?: Record<string, TileMetadataEntry>;
}

export interface DialogueChoice {
  id: string;
  text: string;
  nextNodeId: string | null;
  conditionExpr?: string;
  actionVar?: string;
  actionOp?: 'set' | 'add';
  actionValue?: string | number | boolean;
  actionEvent?: string;
}

export interface DialogueNode {
  id: string;
  speaker: string;
  portraitAssetId?: string | null;
  text: string;
  typewriterSpeed?: number; // chars per second
  nextNodeId?: string | null;
  choices: DialogueChoice[];
  x?: number;
  y?: number;
}

export interface DialogueGraph {
  id: string;
  name: string;
  startNodeId: string;
  nodes: DialogueNode[];
}

export interface DataTableDef {
  id: string;
  name: string;
  columns: string[];
  rows: Array<Record<string, string | number | boolean>>;
}

export type I18nLocale = 'es' | 'en' | 'pt';

export interface I18nConfig {
  defaultLocale: I18nLocale;
  autoDetectBrowser?: boolean;
  entries: Record<string, Partial<Record<I18nLocale, string>>>;
}

export interface ObjectScriptBinding {
  id: string;
  scriptId: string;
  enabled: boolean;
  params?: Record<string, unknown>;
}

export interface UIWidgetProperties {
  scriptId?: string | null;
  html: string;
  css: string;
  js: string;
  interactive: boolean;
  visibleAtStart: boolean;
  fixedToScreen?: boolean;
  zIndex?: number;
}

export interface Light2DProperties {
  kind: 'point' | 'spot';
  color: string;
  intensity: number;
  radius: number;
  angleDeg: number;
  directionDeg: number;
  softness: number;
  castShadows: boolean;
}

export interface Transform3D {
  x: number;
  y: number;
  z: number;
  rx: number; // grados
  ry: number;
  rz: number;
  sx: number;
  sy: number;
  sz: number;
}

export type Mesh3DShape =
  | 'box'
  | 'ramp'
  | 'stairs'
  | 'cylinder'
  | 'arch'
  | 'plane'
  | 'sphere'
  | 'glb'
  | 'csg'
  | 'terrain'
  | 'water'
  | 'grass_field';

export interface SerializedCsgGeometry {
  positions: number[];
  normals: number[];
  uvs?: number[];
  indices?: number[];
}

export interface TerrainData {
  width: number;
  depth: number;
  segments: number;
  seed: number;
  amplitude: number;
  frequency: number;
  octaves: number;
  /** Matriz (segments+1)*(segments+1) de alturas locales en Y */
  heights: number[];
  /** Pesos RGBA (4 floats por vértice: hierba, tierra, roca, arena) para pintar textura del suelo */
  splatWeights: number[];
  /** Extiende un horizonte visual infinito plano en los bordes del terreno */
  infiniteHorizon?: boolean;
  horizonColor?: string;
}

export interface WaterConfig {
  width: number;
  depth: number;
  flowX: number;
  flowZ: number;
  waveAmplitude: number;
  waveSpeed: number;
  shallowColor: string;
  deepColor: string;
  foamIntensity: number;
  /** IDs de objetos que interactúan dejando estela y salpicaduras al cruzar la superficie */
  interactingEntities?: string[];
  /** Activa cinta de estela en agua detrás de embarcaciones u objetos rápidos */
  enableWakeTrail?: boolean;
  /** Reflejo planar en tiempo real (omitido automáticamente en GPU por software) */
  planarReflections?: boolean;
  /** Amortiguación hidrodinámica */
  buoyancyDrag?: number;
}

export interface WindFoliageInstance {
  x: number;
  y: number;
  z: number;
  scale: number;
  rotY: number;
  variant?: number;
}

export interface WindFoliageConfig {
  kind: 'grass' | 'bush' | 'flower';
  colorBase: string;
  colorTip: string;
  assetId?: string | null;
  /** Modelo 3D (.glb/.fbx) opcional para scatter con InstancedMesh alineado a normal */
  modelAssetId?: string | null;
  alignToNormal?: boolean;
  windStrength: number;
  windSpeed: number;
  interactionRadius: number;
  instances: WindFoliageInstance[];
}

export type PbrMaterialPresetId =
  | 'custom'
  | 'car_paint'
  | 'crystal_water'
  | 'worn_metal'
  | 'rock'
  | 'glass'
  | 'neon';

export interface Mesh3DProperties {
  shape: Mesh3DShape;
  color: string;
  metalness: number;
  roughness: number;
  emissive?: string;
  emissiveIntensity?: number;
  castShadow: boolean;
  receiveShadow: boolean;
  textureAssetId?: string | null;
  normalAssetId?: string | null;
  roughnessAssetId?: string | null;
  metalnessAssetId?: string | null;
  aoAssetId?: string | null;
  emissiveAssetId?: string | null;
  clearcoat?: number;
  clearcoatRoughness?: number;
  transmission?: number;
  materialPreset?: PbrMaterialPresetId;
  glbAssetId?: string | null;
  clipNames?: string[];
  csgGeometryJson?: SerializedCsgGeometry;
  terrainData?: TerrainData;
  waterConfig?: WaterConfig;
  foliageConfig?: WindFoliageConfig;
}

export interface Physics3DProperties {
  enabled: boolean;
  bodyType: 'static' | 'dynamic' | 'kinematic';
  shape: 'box' | 'sphere' | 'capsule' | 'mesh_exact';
  isTrigger?: boolean;
  /** Controla si la cámara inteligente 3D colisiona con este objeto ('auto' = muros altos, 'always' = siempre, 'never' = ignorar). */
  cameraCollision?: 'auto' | 'always' | 'never';
  mass: number;
  gravityScale: number;
  restitution: number;
  friction: number;
  halfExtents?: { x: number; y: number; z: number };
  radius?: number;
  offset?: { x: number; y: number; z: number };
}

export interface TouchControlsConfig {
  enabledByDefault?: boolean;
  mode?: 'fixed' | 'floating';
  joystickSize?: number;
  deadzone?: number;
  opacity?: number;
  showJumpButton?: boolean;
  showActionButton?: boolean;
  showDashButton?: boolean;
}

export interface Light3DProperties {
  lightType: 'point' | 'spot' | 'directional';
  color: string;
  intensity: number;
  distance: number;
  decay: number;
  angleDeg: number;
  penumbra: number;
  castShadow: boolean;
}

export type SmartCameraMode =
  | 'fixed'
  | 'smooth_follow'
  | 'third_person_orbit'
  | 'first_person'
  | 'top_down'
  | 'deadzone';

export interface SmartCameraConfig {
  isMainCamera: boolean;
  mode: SmartCameraMode;
  targetObjectId?: string | null;
  dampingFactor: number;
  lookAhead: number;
  offsetX: number;
  offsetY: number;
  offsetZ: number;
  shoulderOffsetX?: number;
  shoulderOffsetY?: number;
  /** Lado del hombro activo (+1 derecha, -1 izquierda) para shoulder swap */
  shoulderSide?: 1 | -1;
  allowShoulderSwap?: boolean;
  /** Altura mínima de seguridad sobre el terreno */
  terrainMinClearance?: number;
  adaptiveMultiplayer?: boolean;
  fovKick?: number;
  distance: number;
  pitchMinDeg: number;
  pitchMaxDeg: number;
  fov: number;
  deadzoneW: number;
  deadzoneH: number;
  collideWithWalls: boolean;
  invertY?: boolean;
  useBounds: boolean;
  boundsMinX: number;
  boundsMaxX: number;
  boundsMinY: number;
  boundsMaxY: number;
  boundsMinZ: number;
  boundsMaxZ: number;
}

export type WorldActivityLevel = 'near' | 'medium' | 'far' | 'unloaded';
export type MemoryBudgetProfile = 'mobile' | 'pc' | 'custom';

export interface MemoryBudgetLimits {
  texturesMB: number;
  modelsMB: number;
  audioMB: number;
  geometryMB: number;
  particlesMax: number;
  shadowLightsMax: number;
  physicsBodiesMax: number;
  activeEntitiesMax: number;
  scriptsMax: number;
}

export interface WorldStreamingConfig {
  enabled: boolean;
  chunkSize: number;
  loadRadius: number;
  unloadRadius: number;
  farProxyRadius: number;
  maxLoadsPerFrame: number;
  frustumPreloadWeight: number;
  velocityPreloadSec: number;
  enableHlod: boolean;
  enableOcclusionCulling: boolean;
  budgetProfile: MemoryBudgetProfile;
  customBudgets?: Partial<MemoryBudgetLimits>;
}

export interface CameraVolume3D {
  id: string;
  name: string;
  enabled: boolean;
  priority: number;
  zoneType: 'exterior' | 'interior' | 'vehicle' | 'cinematic';
  mode: SmartCameraMode;
  blendDurationSec: number;
  bounds: {
    minX: number;
    maxX: number;
    minY: number;
    maxY: number;
    minZ: number;
    maxZ: number;
  };
  fov?: number;
  distance?: number;
  shoulderOffsetX?: number;
  shoulderOffsetY?: number;
  terrainMinClearance?: number;
  targetObjectId?: string | null;
  lockYawDeg?: number;
  lockPitchDeg?: number;
}

export interface OcclusionVolume3D {
  id: string;
  name: string;
  enabled: boolean;
  kind: 'occluder' | 'sector' | 'portal';
  bounds: {
    minX: number;
    maxX: number;
    minY: number;
    maxY: number;
    minZ: number;
    maxZ: number;
  };
  connectedSectorIds?: string[];
}

export interface ObjectStreamingMeta {
  persistence?: 'persistent' | 'transient';
  chunkCoord?: string;
  hlodGroupId?: string;
}

export interface ProjectSaveSlot {
  id: string;
  name: string;
  savedAt: number;
  sceneId: string;
  variables: Record<string, string | number | boolean>;
  worldSaveState?: {
    destroyedIds: string[];
    triggeredIds: string[];
    objectTransforms: Record<string, { x: number; y: number; z?: number }>;
  };
}

export interface AnimStateNode {
  id: string;
  name: string;
  clipName: string;
  timeScale: number;
  loopMode: 'LoopRepeat' | 'LoopOnce' | 'LoopPingPong';
  x: number;
  y: number;
  /** Recurso opcional por estado (.glb clip adicional 3D o spritesheet 2D) */
  assetId?: string | null;
  cols?: number;
  rows?: number;
  startFrame?: number;
  frameCount?: number;
  /** Captura directa de tecla en la tarjeta de estado (ej. 'Space', 'KeyE') */
  triggerKey?: string;
  triggerKeyMode?: 'pressed' | 'held';
  /** Permite activar este estado desde cualquier otro estado sin conectar flechas */
  fromAnyState?: boolean;
  /** Condición directa opcional en la tarjeta de estado */
  conditionExpr?: string;
  /** Retorno automático al terminar / aterrizar / soltar tecla */
  returnMode?: 'none' | 'smart_locomotion' | 'idle' | 'state';
  returnOn?: 'auto' | 'grounded' | 'animFinished' | 'keyReleased';
  returnStateId?: string;
  /** Eventos sincronizados a fotogramas concretos de este estado */
  frameEvents?: AnimationFrameEvent[];
}

export interface AnimStateTransition {
  id: string;
  fromStateId: string;
  toStateId: string;
  conditionExpr: string; // ej. "speed > 0.1", "isGrounded == false", "manual"
  blendDuration: number; // segundos
}

export interface AnimationStateMachineConfig {
  initialStateId: string;
  states: AnimStateNode[];
  transitions: AnimStateTransition[];
}

export interface NavMeshAgentConfig {
  enabled: boolean;
  speed: number;
  acceleration: number;
  avoidanceRadius: number;
  stoppingDistance: number;
  maxChaseDistance?: number;
  mode: 'idle' | 'chase' | 'moveTo';
  targetObjectId?: string | null;
  targetX?: number;
  targetY?: number;
  targetZ?: number;
  /** Cono de visión configurable y visible en el editor (grados, 360 = omnidireccional) */
  visionFovDeg?: number;
  /** Alcance máximo del cono de visión (metros en 3D / px en 2D) */
  visionRange?: number;
  /** Requiere línea de visión sin muros para detectar al objetivo por vista */
  requireLineOfSight?: boolean;
  /** Salta ventanas y obstáculos bajos sin quedar patinando frente a muros altos */
  canJumpObstacles?: boolean;
  /** Altura máxima saltable de ventana o muro bajo (m) */
  maxJumpHeight?: number;
  /** Umbral de vida propia (0..1) por debajo del cual huye/retrocede tácticamente */
  fleeHealthRatio?: number;
  /** Umbral de vida del jugador (0..1) o daño alto para insistir agresivamente */
  insistDamageRatio?: number;
  /** Mostrar cono de visión en el editor */
  showVisionCone?: boolean;
}

export interface NavMeshData {
  cellSize: number;
  originX: number;
  originZ: number;
  cols: number;
  rows: number;
  walkable: number[]; // 1 transitable, 0 bloqueado
  heights: number[]; // altura Y muestreada
  maxSlopeDeg: number;
  builtAt: number;
}

export interface SceneLightingConfig {
  ambientColor: string;
  ambientIntensity: number;
  smartBounce: boolean;
  bounceIntensity: number;
  skyColor: string;
  groundColor: string;
  sunColor: string;
  sunIntensity: number;
  fogEnabled: boolean;
  fogColor: string;
  fogNear: number;
  fogFar: number;
  /** Cielo 3D con Domo Procedural y Ciclo Día / Noche */
  dayNightEnabled?: boolean;
  timeOfDay?: number; // 0..24 horas (12 = mediodía)
  dayCycleSpeed?: number; // horas de juego por segundo real
  skyDomeAssetId?: string | null;
  cloudsEnabled?: boolean;
  cloudDensity?: number;
}

export type NavMeshObjectRole = 'auto' | 'terrain' | 'obstacle' | 'ignore';

export interface ObjectOptimizationConfig {
  preset?: 'mobile' | 'pc' | 'custom';
  frustumCulling?: boolean;
  lodEnabled?: boolean;
  lodAssetId?: string | null;
  lodDistance?: number;
  cullDistance?: number;
  fadeEnabled?: boolean;
  fadeStart?: number;
  fadeEnd?: number;
}

export interface SoftBodyConfig {
  enabled: boolean;
  kind: 'rope' | 'chain' | 'bridge' | 'gel' | 'sand';
  segments: number;
  length: number;
  stiffness: number;
  damping: number;
  gravity: number;
  anchorStart: boolean;
  anchorEnd: boolean;
  particleCount?: number;
  radius?: number;
  color?: string;
}

export type VehicleKind3D = 'car' | 'moto' | 'boat' | 'plane' | 'helicopter' | 'spaceship' | 'horse';

export interface VehiclePartsBinding {
  wheelFL?: string | null;
  wheelFR?: string | null;
  wheelRL?: string | null;
  wheelRR?: string | null;
  propellerId?: string | null;
  tailRotorId?: string | null;
  cameraId?: string | null;
  landingGearId?: string | null;
}

export interface Vehicle4WConfig {
  enabled: boolean;
  vehicleKind?: VehicleKind3D;
  /** Modo de montura al entrar con Tecla E: 'inside' oculta al jugador dentro; 'saddle' lo mantiene visible sentado encima (motos, bicis, caballos) */
  mountStyle?: 'inside' | 'saddle';
  /** Desplazamiento local del asiento respecto al centro del vehículo para monturas visibles */
  seatOffset?: { x: number; y: number; z: number };
  /** Permite subir/bajar con Tecla E automáticamente sin requerir crear mecánica manual */
  allowQuickEnterExit?: boolean;
  maxTorque: number;
  maxSpeed: number;
  maxSteerDeg: number;
  suspensionRestLen: number;
  suspensionStiffness: number;
  suspensionDamping: number;
  wheelRadius: number;
  wheelWidth?: number;
  wheelBase: number;
  trackWidth: number;
  driveType: 'awd' | 'rwd' | 'fwd';
  /** Agarre lateral (0.1 = derrape pronunciado, 1.0 = agarre máximo) */
  gripFactor?: number;
  /** Tamaño de embarcación: Lancha (4 pontones), Mediano (6), Barco Grande (12) */
  boatSize?: 'speedboat' | 'medium' | 'ship';
  /** Agua vinculada en escena para flotación por olas */
  waterObjectId?: string | null;
  /** Perfil de vuelo para aviones */
  planeStyle?: 'fighter' | 'airliner';
  /** Fuerza de sustentación aerodinámica */
  liftFactor?: number;
  hasLandingGear?: boolean;
  /** Zona de gravedad local para naves espaciales grandes (permite caminar dentro) */
  localGravityBox?: { enabled: boolean; sx: number; sy: number; sz: number };
  /** Distancia LOD a partir de la cual se desactivan cálculos pesados de suspensión/olas */
  physicsLodDistance?: number;
  /** Sub-nodos hijos vinculados mediante parentId */
  parts?: VehiclePartsBinding;
  /** Ruta spline opcional de patrulla automática */
  patrolSplineId?: string | null;
}

export interface GameObjectData {
  id: string;
  name: string;
  type: GameObjectType;
  parentId: string | null;
  visible: boolean;
  locked: boolean;
  opacity: number; // 0..1
  layer?: CollisionLayer;
  prefabId?: string;
  navRole?: NavMeshObjectRole;
  optimization?: ObjectOptimizationConfig;
  streaming?: ObjectStreamingMeta;
  softBody?: SoftBodyConfig;
  vehicle?: Vehicle4WConfig;
  transform: Transform2D;
  sprite?: SpriteProperties;
  rectangle?: RectangleProperties;
  circle?: CircleProperties;
  text?: TextProperties;
  tilemap?: TilemapProperties;
  uiButton?: UIButtonProperties;
  uiPanel?: UIPanelProperties;
  uiProgressBar?: UIProgressBarProperties;
  uiLeaderboard?: UILeaderboardProperties;
  uiWidget?: UIWidgetProperties;
  light2d?: Light2DProperties;
  transform3d?: Transform3D;
  mesh3d?: Mesh3DProperties;
  physics3d?: Physics3DProperties;
  light3d?: Light3DProperties;
  camera3d?: SmartCameraConfig;
  aiAgent?: NavMeshAgentConfig;
  animStateMachine?: AnimationStateMachineConfig;
  particleEmitter?: ParticleEmitterConfig;
  tweens?: TweenKeyframeTrack[];
  colliders?: Collider2D[];
  rigidbody?: RigidBody2DConfig;
  components: EngineComponentData[];
  scriptBindings?: ObjectScriptBinding[];
  boneSocket?: BoneSocketAttachment3D;
  tags?: string[];
  /** Rol o arquetipo inteligente aplicado al objeto */
  role?: string;
  archetype?: ArchetypeId | null;
  net?: NetworkEntityConfig;
  /** Seguimiento automático de una ruta Spline 3D (rieles de cámara, patrulla aérea/naval) */
  followSplineId?: string | null;
  followSplineSpeed?: number;
  /** Estado lógico para máquinas de estado de objeto */
  stateMachine?: {
    currentState: string;
    states: string[];
  };
}

export interface SplinePoint3D {
  x: number;
  y: number;
  z: number;
}

export interface SplinePathData {
  id: string;
  name: string;
  closed: boolean;
  width: number;
  kind: 'road' | 'river' | 'rail' | 'patrol';
  points: SplinePoint3D[];
}

export type SceneKind =
  | 'level'
  | 'main_menu'
  | 'hud'
  | 'pause'
  | 'game_over'
  | 'victory'
  | 'level_select'
  | 'inventory'
  | 'shop'
  | 'dialog'
  | 'cutscene'
  | 'credits'
  | 'loading'
  | 'custom';

export const SCENE_KIND_LABELS: Record<SceneKind, string> = {
  level: 'Nivel jugable',
  main_menu: 'Menú principal',
  hud: 'HUD / Interfaz',
  pause: 'Menú de pausa (Overlay)',
  game_over: 'Game Over',
  victory: 'Victoria',
  level_select: 'Selector de niveles',
  inventory: 'Inventario',
  shop: 'Tienda',
  dialog: 'Diálogo',
  cutscene: 'Cinemática',
  credits: 'Créditos',
  loading: 'Pantalla de carga',
  custom: 'Personalizada',
};

export type SceneTransitionType =
  | 'none'
  | 'fadeBlack'
  | 'fadeWhite'
  | 'slideLeft'
  | 'zoom';

export type SceneLoadMode = 'replace' | 'overlay' | 'additive';

export interface SceneCameraConfig {
  followObjectId?: string | null;
  lerp?: number; // 0.02..1
  deadzoneW?: number;
  deadzoneH?: number;
  clampToBounds?: boolean;
  worldWidth?: number;
  worldHeight?: number;
  zoom?: number;
  smartCamera?: SmartCameraConfig;
}

export interface SceneBackgroundMusicConfig {
  assetId: string | null;
  volume?: number; // 0..1.5
  loop?: boolean;
  autoPlay?: boolean;
  keepPlayingIfSameTrack?: boolean;
}

export type ScenePerformanceProfile = 'balanced_60' | 'ultra_fast' | 'high_quality';

export interface SceneData {
  id: string;
  name: string;
  kind?: SceneKind;
  sceneContext?: SceneContextType;
  nextSceneId?: string | null;
  backgroundColor: string;
  gridVisible: boolean;
  gridSize: number;
  snapToGrid: boolean;
  performanceProfile?: ScenePerformanceProfile;
  cameraConfig?: SceneCameraConfig;
  backgroundMusic?: SceneBackgroundMusicConfig;
  lighting?: SceneLightingConfig;
  multiplayer?: SceneMultiplayerConfig;
  worldStreaming?: WorldStreamingConfig;
  cameraVolumes?: CameraVolume3D[];
  occlusionVolumes?: OcclusionVolume3D[];
  wiringLinks?: WiringLink[];
  scriptIds?: string[];
  navMesh?: NavMeshData | null;
  splines3d?: SplinePathData[];
  activeCameraId?: string | null;
  objects: GameObjectData[];
  mechanics?: GameMechanic[];
}

export interface CameraState {
  x: number;
  y: number;
  zoom: number;
}

export interface StageResolution {
  width: number;
  height: number;
}

export interface PointerStageCoords {
  stageX: number;
  stageY: number;
}

export const OBJECT_TYPE_LABELS: Record<GameObjectType, string> = {
  sprite: 'Sprite',
  rectangle: 'Rectángulo',
  circle: 'Círculo',
  text: 'Texto',
  container: 'Contenedor',
  tilemap: 'Mapa de Tiles',
  ui_button: 'Botón UI',
  ui_panel: 'Panel UI',
  ui_progress_bar: 'Barra de Progreso / Vida',
  ui_leaderboard: 'Tabla Ranking UI',
  ui_widget: 'Interfaz Código (HTML/CSS/JS)',
  light_2d: 'Luz 2D',
  mesh_3d: 'Malla / Objeto 3D',
  light_3d: 'Luz 3D',
  camera_3d: 'Cámara Inteligente',
};
