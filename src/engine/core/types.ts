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
  | 'ui_leaderboard';

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
  | 'tile';

export type TextureSamplingMode = 'linear' | 'nearest';

export interface SpriteCropRect {
  x: number;
  y: number;
  width: number;
  height: number;
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

export type ColliderShapeType = 'box' | 'circle' | 'capsule';

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
}

export interface RigidBody2DConfig {
  bodyType: 'dynamic' | 'kinematic' | 'static';
  mass: number;
  gravityScale: number;
  linearDamping: number;
  restitution: number;
  fixedRotation: boolean;
}

export interface EngineComponentData {
  id: string;
  type: string;
  enabled: boolean;
  config: Record<string, unknown>;
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
  tint: string;
  flipX: boolean;
  flipY: boolean;
  fitMode?: SpriteFitMode;
  aspectLocked?: boolean;
  sampling?: TextureSamplingMode;
  cropRect?: SpriteCropRect;
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
  | 'snow';

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
}

export type TweenProperty = 'x' | 'y' | 'scaleX' | 'scaleY' | 'rotation' | 'opacity';
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
  particleEmitter?: ParticleEmitterConfig;
  tweens?: TweenKeyframeTrack[];
  colliders?: Collider2D[];
  rigidbody?: RigidBody2DConfig;
  components: EngineComponentData[];
  tags?: string[];
  /** Estado lógico para máquinas de estado de objeto */
  stateMachine?: {
    currentState: string;
    states: string[];
  };
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
}

export interface SceneData {
  id: string;
  name: string;
  kind?: SceneKind;
  nextSceneId?: string | null;
  backgroundColor: string;
  gridVisible: boolean;
  gridSize: number;
  snapToGrid: boolean;
  cameraConfig?: SceneCameraConfig;
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
};
