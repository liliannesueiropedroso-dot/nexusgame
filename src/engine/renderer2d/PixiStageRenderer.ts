import {
  Application,
  Container,
  Graphics,
  NineSliceSprite,
  Rectangle,
  Sprite,
  Text,
  TextStyle,
  Texture,
  TilingSprite,
} from 'pixi.js';
import { loadHtmlImage } from '../../assets/thumbnails/thumbnailGenerator';
import { degToRad, getObjectWorldCorners, getWorldTransform } from '../core/math';
import { buildObjectMap } from '../core/sceneGraph';
import type {
  CameraState,
  EditorTool,
  GameObjectData,
  ParticleBurstVisual,
  SceneData,
  StageResolution,
} from '../core/types';
import { getWorldColliders } from '../physics/collision2d';
import type { SceneTransitionEffect } from '../runtime/sceneManager';
import type {
  BodyPhysicsState,
  LeaderboardEntry,
  ScreenFlashEffect,
} from '../runtime/stepGameSimulation';
import type { RuntimeParticle } from '../runtime/behaviorRuntime';
import { sampleVfxCurve } from '../vfx/particlePool';
import { computeSpriteRenderLayout } from '../sprites/spriteFit';
import { computeColliderHandles, computeGizmoHandles } from './hitTest';
import {
  compute2DShadowPolygons,
  computeLightFalloffAlpha,
  parseHexRgb2D,
} from './lighting2dMath';
import { getTileCollisionKind } from '../tilemap/autotile2d';

export type RendererMode = 'editor' | 'preview';

interface CachedTextureEntry {
  texture: Texture;
  objectUrl: string;
  blobRef: Blob;
}

interface CachedSceneNode {
  sig: string;
  container: Container;
  textures: Texture[];
  flashGraphic?: Graphics;
  hpGraphic?: Graphics;
  hpKey?: string;
}

function parseHexColor(hex: string | undefined, fallback = 0xffffff): number {
  if (!hex) return fallback;
  const clean = hex.trim().replace(/^#/, '');
  const parsed = Number.parseInt(clean, 16);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function interpolateVariables(
  rawText: string,
  variables: Map<string, number | boolean | string> | undefined,
  bindVariable?: string
): string {
  if (!variables) return rawText;
  if (bindVariable && variables.has(bindVariable)) {
    const val = variables.get(bindVariable);
    if (rawText.includes('{value}')) {
      return rawText.replace(/\{value\}/g, String(val));
    }
    if (!rawText.includes('{')) {
      return rawText ? `${rawText}: ${val}` : String(val);
    }
  }
  return rawText.replace(/\{([a-zA-Z0-9_]+)\}/g, (full, key) => {
    return variables.has(key) ? String(variables.get(key)) : full;
  });
}

export class PixiStageRenderer {
  private app: Application | null = null;
  private hostElement: HTMLElement;
  private mode: RendererMode;
  private destroyed = false;
  private initialized = false;
  private renderQueued = false;

  // Capas principales en PixiJS
  private worldContainer = new Container();
  private stageBackdrop = new Graphics();
  private gridGraphics = new Graphics();
  private sceneRoot = new Container();
  private lightingLayer = new Graphics();
  private lightingGlowContainer = new Container();
  private stageBorderGraphics = new Graphics();
  private overlayGraphics = new Graphics();
  private particleSpriteContainer = new Container();
  private debugOverlayGraphics = new Graphics();
  private transitionGraphics = new Graphics();
  private lightCanvas: HTMLCanvasElement | null = null;
  private lightScratchCanvas: HTMLCanvasElement | null = null;
  private lightTexture: Texture | null = null;
  private lightSprite: Sprite | null = null;

  // Caché de texturas por assetId y nodos persistentes de escena (cero recreación 60 FPS)
  private textureCache = new Map<string, CachedTextureEntry>();
  private loadingAssets = new Set<string>();
  private frameTextures: Texture[] = [];
  private activeNodeTexturesBucket: Texture[] | null = null;
  private nodeCache = new Map<string, CachedSceneNode>();
  private cellsRefIds = new WeakMap<object, number>();
  private nextCellsRefId = 1;
  private lastBackdropSig = '';
  private lastGridSig = '';
  private lastLightingSig = '';
  private fsmClipStartElapsed = new Map<string, { stateKey: string; startElapsed: number }>();

  // Estado actual sincronizado desde el motor
  private currentScene: SceneData | null = null;
  private currentStage: StageResolution = { width: 1280, height: 720 };
  private currentBgColor = '#131b2e';
  private currentCamera: CameraState = { x: 0, y: 0, zoom: 1 };
  private currentSelectedIds: string[] = [];
  private currentTool: EditorTool = 'select';
  private currentBlobs = new Map<string, Blob>();
  private animationElapsed = 0;
  private currentParticles: ParticleBurstVisual[] = [];
  private currentEmitterParticles: RuntimeParticle[] = [];
  private currentScreenFlash: ScreenFlashEffect | null = null;
  private currentLeaderboard: LeaderboardEntry[] = [];
  private currentFlashTimers: Map<string, { color: string; remaining: number }> | undefined;
  private currentVisualSquash: Map<string, { sx: number; sy: number }> | undefined;
  private cameraShakeOffset = { x: 0, y: 0 };
  private cameraFollowOffset = { x: 0, y: 0 };
  private showDebugColliders = false;
  private debugBodies: Map<string, BodyPhysicsState> | undefined;
  private runtimeVariables: Map<string, number | boolean | string> | undefined;
  private hoveredObjectId: string | null = null;
  private transitionEffect: SceneTransitionEffect | null = null;

  constructor(hostElement: HTMLElement, mode: RendererMode = 'editor') {
    this.hostElement = hostElement;
    this.mode = mode;
  }

  async init(): Promise<void> {
    const rect = this.hostElement.getBoundingClientRect();
    const initWidth = Math.max(100, Math.floor(rect.width || 800));
    const initHeight = Math.max(100, Math.floor(rect.height || 600));

    const app = new Application();
    await app.init({
      width: initWidth,
      height: initHeight,
      backgroundColor: this.mode === 'preview' ? 0x0b0b0e : 0x141416,
      antialias: true,
      autoStart: false,
      resolution: Math.min(window.devicePixelRatio || 1, 2),
      autoDensity: true,
      preference: ['webgl', 'canvas'],
    });

    if (this.destroyed) {
      app.destroy(true, { children: true });
      return;
    }

    this.app = app;
    app.canvas.style.display = 'block';
    app.canvas.style.width = '100%';
    app.canvas.style.height = '100%';
    this.hostElement.appendChild(app.canvas);

    this.worldContainer.addChild(this.stageBackdrop);
    this.worldContainer.addChild(this.gridGraphics);
    this.worldContainer.addChild(this.sceneRoot);
    this.worldContainer.addChild(this.lightingLayer);
    this.worldContainer.addChild(this.lightingGlowContainer);
    this.worldContainer.addChild(this.stageBorderGraphics);
    this.worldContainer.addChild(this.overlayGraphics);
    this.worldContainer.addChild(this.particleSpriteContainer);
    this.worldContainer.addChild(this.debugOverlayGraphics);
    this.worldContainer.addChild(this.transitionGraphics);
    app.stage.addChild(this.worldContainer);

    this.initialized = true;
    this.syncAndRender();
  }

  getCanvas(): HTMLCanvasElement | null {
    return this.app?.canvas ?? null;
  }

  resize(width: number, height: number): void {
    if (!this.app || !this.initialized || this.destroyed) return;
    const safeW = Math.max(64, Math.floor(width));
    const safeH = Math.max(64, Math.floor(height));
    this.app.renderer.resize(safeW, safeH);
    this.requestRender();
  }

  updateState(params: {
    scene: SceneData;
    stage: StageResolution;
    backgroundColor: string;
    camera: CameraState;
    selectedIds: string[];
    tool: EditorTool;
    assetBlobs: Map<string, Blob>;
    animationElapsed?: number;
    showDebugColliders?: boolean;
  }): void {
    this.currentScene = params.scene;
    this.currentStage = params.stage;
    this.currentBgColor = params.backgroundColor;
    this.currentCamera = params.camera;
    this.currentSelectedIds = params.selectedIds;
    this.currentTool = params.tool;
    this.currentBlobs = params.assetBlobs;
    this.showDebugColliders = Boolean(params.showDebugColliders);
    if (params.animationElapsed !== undefined) {
      this.animationElapsed = params.animationElapsed;
    }

    if (this.app && this.initialized) {
      const profile = params.scene.performanceProfile ?? 'balanced_60';
      const maxDpr = profile === 'ultra_fast' ? 1 : profile === 'high_quality' ? 2 : 1.5;
      const targetRes = Math.min(window.devicePixelRatio || 1, maxDpr);
      if (Math.abs(this.app.renderer.resolution - targetRes) > 0.05) {
        this.app.renderer.resolution = targetRes;
      }
    }

    this.syncTextures(params.assetBlobs);
    this.requestRender();
  }

  /** Renderizado inmediato síncrono útil para bucles de 60Hz en Vista previa */
  renderImmediate(params: {
    scene: SceneData;
    stage: StageResolution;
    backgroundColor: string;
    camera: CameraState;
    assetBlobs: Map<string, Blob>;
    animationElapsed: number;
    particles?: ParticleBurstVisual[];
    emitterParticles?: RuntimeParticle[];
    screenFlash?: ScreenFlashEffect | null;
    leaderboard?: LeaderboardEntry[];
    flashTimers?: Map<string, { color: string; remaining: number }>;
    visualSquash?: Map<string, { sx: number; sy: number }>;
    cameraOffset?: { x: number; y: number };
    cameraFollowOffset?: { x: number; y: number };
    showDebugColliders?: boolean;
    debugBodies?: Map<string, BodyPhysicsState>;
    variables?: Map<string, number | boolean | string>;
    hoveredObjectId?: string | null;
    transitionEffect?: SceneTransitionEffect | null;
  }): void {
    this.currentScene = params.scene;
    this.currentStage = params.stage;
    this.currentBgColor = params.backgroundColor;
    this.currentCamera = params.camera;
    this.currentSelectedIds = [];
    this.currentBlobs = params.assetBlobs;
    this.animationElapsed = params.animationElapsed;
    this.currentParticles = params.particles ?? [];
    this.currentEmitterParticles = params.emitterParticles ?? [];
    this.currentScreenFlash = params.screenFlash ?? null;
    this.currentLeaderboard = params.leaderboard ?? [];
    this.currentFlashTimers = params.flashTimers;
    this.currentVisualSquash = params.visualSquash;
    this.cameraShakeOffset = params.cameraOffset ?? { x: 0, y: 0 };
    this.cameraFollowOffset = params.cameraFollowOffset ?? { x: 0, y: 0 };
    this.showDebugColliders = Boolean(params.showDebugColliders);
    this.debugBodies = params.debugBodies;
    this.runtimeVariables = params.variables;
    this.hoveredObjectId = params.hoveredObjectId ?? null;
    this.transitionEffect = params.transitionEffect ?? null;

    this.syncTextures(params.assetBlobs);
    if (this.initialized && !this.destroyed) {
      this.syncAndRender();
    }
  }

  private syncTextures(blobs: Map<string, Blob>): void {
    for (const [assetId, entry] of this.textureCache.entries()) {
      const incoming = blobs.get(assetId);
      if (!incoming || incoming !== entry.blobRef) {
        entry.texture.destroy(true);
        URL.revokeObjectURL(entry.objectUrl);
        this.textureCache.delete(assetId);
      }
    }

    for (const [assetId, blob] of blobs.entries()) {
      if (this.textureCache.has(assetId) || this.loadingAssets.has(assetId)) {
        continue;
      }
      this.loadingAssets.add(assetId);
      const objectUrl = URL.createObjectURL(blob);
      loadHtmlImage(objectUrl)
        .then((img) => {
          if (this.destroyed || this.currentBlobs.get(assetId) !== blob) {
            URL.revokeObjectURL(objectUrl);
            return;
          }
          const texture = Texture.from(img, true);
          this.textureCache.set(assetId, {
            texture,
            objectUrl,
            blobRef: blob,
          });
          this.requestRender();
        })
        .catch(() => {
          URL.revokeObjectURL(objectUrl);
        })
        .finally(() => {
          this.loadingAssets.delete(assetId);
        });
    }
  }

  requestRender(): void {
    if (!this.initialized || this.destroyed || this.renderQueued) return;
    this.renderQueued = true;
    requestAnimationFrame(() => {
      this.renderQueued = false;
      if (!this.destroyed && this.initialized) {
        this.syncAndRender();
      }
    });
  }

  private clearFrameTextures(): void {
    for (const t of this.frameTextures) {
      t.destroy(false);
    }
    this.frameTextures = [];
  }

  private sliceSubTexture(
    baseTexture: Texture,
    col: number,
    row: number,
    cols: number,
    rows: number
  ): Texture {
    const safeCols = Math.max(1, cols);
    const safeRows = Math.max(1, rows);
    const texW = baseTexture.width;
    const texH = baseTexture.height;
    const fw = Math.max(1, Math.floor(texW / safeCols));
    const fh = Math.max(1, Math.floor(texH / safeRows));
    const sx = Math.min(Math.max(0, col * fw), Math.max(0, texW - 1));
    const sy = Math.min(Math.max(0, row * fh), Math.max(0, texH - 1));
    const sw = Math.min(fw, texW - sx);
    const sh = Math.min(fh, texH - sy);
    const sub = new Texture({
      source: baseTexture.source,
      frame: new Rectangle(sx, sy, Math.max(1, sw), Math.max(1, sh)),
    });
    if (this.activeNodeTexturesBucket) {
      this.activeNodeTexturesBucket.push(sub);
    } else {
      this.frameTextures.push(sub);
    }
    return sub;
  }

  private cropSubTexture(baseTexture: Texture, x: number, y: number, w: number, h: number): Texture {
    const sub = new Texture({
      source: baseTexture.source,
      frame: new Rectangle(x, y, Math.max(1, w), Math.max(1, h)),
    });
    if (this.activeNodeTexturesBucket) {
      this.activeNodeTexturesBucket.push(sub);
    } else {
      this.frameTextures.push(sub);
    }
    return sub;
  }

  private syncAndRender(): void {
    if (!this.app || !this.currentScene) return;

    const { x, y, zoom } = this.currentCamera;
    this.worldContainer.position.set(
      x + this.cameraShakeOffset.x,
      y + this.cameraShakeOffset.y
    );
    this.worldContainer.scale.set(zoom, zoom);

    this.sceneRoot.position.set(-this.cameraFollowOffset.x, -this.cameraFollowOffset.y);
    this.lightingLayer.position.set(-this.cameraFollowOffset.x, -this.cameraFollowOffset.y);
    this.lightingGlowContainer.position.set(-this.cameraFollowOffset.x, -this.cameraFollowOffset.y);
    this.debugOverlayGraphics.position.set(-this.cameraFollowOffset.x, -this.cameraFollowOffset.y);

    this.drawStageBackdrop();
    this.drawGrid();
    this.rebuildSceneDisplayObjects();
    this.drawLighting2D();
    this.drawStageBorder();
    this.drawSelectionAndGizmos();
    if (this.mode === 'preview') {
      if (this.currentParticles.length > 0 || this.currentEmitterParticles.length > 0) {
        this.drawParticles();
      } else if (this.particleSpriteContainer.children.length > 0) {
        const oldSprites = this.particleSpriteContainer.removeChildren();
        for (const ch of oldSprites) {
          ch.destroy({ children: true, texture: false, textureSource: false });
        }
      }
    }
    this.drawDebugColliders();
    this.drawTransitionOverlay();

    this.app.render();
  }

  private ensureLightBuffers(bufW: number, bufH: number): {
    mainCtx: CanvasRenderingContext2D;
    scratchCtx: CanvasRenderingContext2D;
    sprite: Sprite;
    texture: Texture;
  } | null {
    if (typeof document === 'undefined') return null;
    if (!this.lightCanvas) {
      this.lightCanvas = document.createElement('canvas');
      this.lightScratchCanvas = document.createElement('canvas');
    }
    const needResize =
      this.lightCanvas.width !== bufW || this.lightCanvas.height !== bufH;
    if (needResize) {
      this.lightCanvas.width = bufW;
      this.lightCanvas.height = bufH;
      if (this.lightScratchCanvas) {
        this.lightScratchCanvas.width = bufW;
        this.lightScratchCanvas.height = bufH;
      }
      if (this.lightTexture) {
        this.lightTexture.destroy(true);
        this.lightTexture = null;
      }
    }
    if (!this.lightTexture) {
      this.lightTexture = Texture.from(this.lightCanvas);
    }
    if (!this.lightSprite) {
      this.lightSprite = new Sprite(this.lightTexture);
      this.lightSprite.blendMode = 'add';
      this.lightingGlowContainer.addChild(this.lightSprite);
    } else if (this.lightSprite.texture !== this.lightTexture) {
      this.lightSprite.texture = this.lightTexture;
    }
    const mainCtx = this.lightCanvas.getContext('2d');
    const scratchCtx = this.lightScratchCanvas?.getContext('2d') ?? null;
    if (!mainCtx || !scratchCtx) return null;
    return {
      mainCtx,
      scratchCtx,
      sprite: this.lightSprite,
      texture: this.lightTexture,
    };
  }

  private drawLighting2D(): void {
    const g = this.lightingLayer;
    if (!this.currentScene) {
      if (this.lastLightingSig !== 'none') {
        g.clear();
        if (this.lightSprite) this.lightSprite.visible = false;
        this.lastLightingSig = 'none';
      }
      return;
    }

    const lights = this.currentScene.objects.filter(
      (o) => o.visible && o.type === 'light_2d' && o.light2d
    );
    const lightingCfg = this.currentScene.lighting;
    const hasCustomLighting =
      lights.length > 0 ||
      Boolean(lightingCfg && (lightingCfg.ambientIntensity < 0.98 || lightingCfg.smartBounce));

    if (!hasCustomLighting) {
      if (this.lastLightingSig !== 'none') {
        g.clear();
        if (this.lightSprite) this.lightSprite.visible = false;
        this.lastLightingSig = 'none';
      }
      return;
    }

    const viewW = Math.max(64, Math.min(2048, Math.round(this.currentStage.width)));
    const viewH = Math.max(64, Math.min(2048, Math.round(this.currentStage.height)));
    const viewX = Math.round(this.cameraFollowOffset.x * 10) / 10;
    const viewY = Math.round(this.cameraFollowOffset.y * 10) / 10;
    const ambientIntensity = lightingCfg?.ambientIntensity ?? (lights.length > 0 ? 0.45 : 1);
    const ambientColor = lightingCfg?.ambientColor ?? '#090d1a';
    const smartBounce = lightingCfg?.smartBounce ? 1 : 0;
    const bounceIntensity = lightingCfg?.bounceIntensity ?? 0.3;

    let anyShadowCasting = false;
    let lightsSig = '';
    for (const lo of lights) {
      const l = lo.light2d!;
      if (l.castShadows) anyShadowCasting = true;
      lightsSig += `|${lo.id}:${Math.round(lo.transform.x)},${Math.round(lo.transform.y)},${Math.round(lo.transform.rotation)},${l.radius},${l.intensity},${l.softness},${l.color},${l.kind},${l.angleDeg},${l.directionDeg},${l.castShadows ? 1 : 0}`;
    }

    const occObjects = anyShadowCasting
      ? this.currentScene.objects.filter(
          (o) =>
            o.visible &&
            o.type !== 'light_2d' &&
            o.components.some((c) => c.enabled && c.type === 'solid')
        )
      : [];

    let occSig = '';
    for (const occ of occObjects) {
      occSig += `|${occ.id}:${Math.round(occ.transform.x)},${Math.round(occ.transform.y)},${occ.transform.width},${occ.transform.height},${Math.round(occ.transform.rotation)}`;
    }

    const sig = `${this.mode}|${viewW}x${viewH}@${viewX},${viewY}|${ambientIntensity}|${ambientColor}|${smartBounce}|${bounceIntensity}${lightsSig}${occSig}`;
    if (sig === this.lastLightingSig) {
      return;
    }
    this.lastLightingSig = sig;

    g.clear();
    if (this.lightSprite) {
      this.lightSprite.visible = false;
    }

    const darkness = Math.max(0, Math.min(0.88, 1 - ambientIntensity));

    if (darkness > 0.02) {
      g.rect(viewX, viewY, viewW, viewH);
      g.fill({
        color: parseHexColor(ambientColor, 0x090d1a),
        alpha: this.mode === 'preview' ? darkness : darkness * 0.5,
      });
    }

    if (lights.length === 0) return;

    const buffers = this.ensureLightBuffers(viewW, viewH);
    if (!buffers) return;

    const { mainCtx, scratchCtx, sprite, texture } = buffers;
    mainCtx.clearRect(0, 0, viewW, viewH);

    // Recopilar sólidos proyectores de sombra 2D
    const occluders = occObjects.map((occ) => ({
      x: occ.transform.x,
      y: occ.transform.y,
      width: occ.transform.width * Math.abs(occ.transform.scaleX),
      height: occ.transform.height * Math.abs(occ.transform.scaleY),
      rotationDeg: occ.transform.rotation,
      anchorX: occ.transform.anchorX,
      anchorY: occ.transform.anchorY,
    }));

    const stops = [0, 0.14, 0.28, 0.45, 0.62, 0.78, 0.9, 1];

    for (const lightObj of lights) {
      const l = lightObj.light2d!;
      const lx = lightObj.transform.x;
      const ly = lightObj.transform.y;
      const radius = Math.max(16, Number(l.radius) || 280);
      const intensity = Math.max(0, Number(l.intensity) ?? 1);
      if (intensity <= 0.005) continue;

      const softness = Math.max(0.05, Math.min(1, Number(l.softness) ?? 0.65));
      const { r, g: cg, b } = parseHexRgb2D(l.color);
      const localX = lx - viewX;
      const localY = ly - viewY;

      scratchCtx.save();
      scratchCtx.globalCompositeOperation = 'source-over';
      scratchCtx.clearRect(0, 0, viewW, viewH);

      const grad = scratchCtx.createRadialGradient(localX, localY, 0, localX, localY, radius);
      for (const s of stops) {
        const a = computeLightFalloffAlpha(s, intensity, softness);
        grad.addColorStop(s, `rgba(${r}, ${cg}, ${b}, ${a.toFixed(4)})`);
      }

      scratchCtx.fillStyle = grad;
      if (l.kind === 'spot') {
        const halfRad = degToRad(Math.max(5, Math.min(170, l.angleDeg || 55)) * 0.5);
        const dirRad = degToRad((l.directionDeg || 0) + lightObj.transform.rotation);
        scratchCtx.beginPath();
        scratchCtx.moveTo(localX, localY);
        scratchCtx.arc(localX, localY, radius, dirRad - halfRad, dirRad + halfRad);
        scratchCtx.closePath();
        scratchCtx.fill();
      } else {
        scratchCtx.beginPath();
        scratchCtx.arc(localX, localY, radius, 0, Math.PI * 2);
        scratchCtx.fill();
      }

      // Smart Bounce sutil continuo sin anillos discretos
      if (lightingCfg?.smartBounce && (lightingCfg.bounceIntensity ?? 0.3) > 0.05) {
        const bounceR = radius * 1.28;
        const bounceAlpha = Math.min(0.16, 0.09 * (lightingCfg.bounceIntensity ?? 0.3) * intensity);
        const bGrad = scratchCtx.createRadialGradient(localX, localY, 0, localX, localY, bounceR);
        bGrad.addColorStop(0, `rgba(${r}, ${cg}, ${b}, ${bounceAlpha.toFixed(4)})`);
        bGrad.addColorStop(1, `rgba(${r}, ${cg}, ${b}, 0)`);
        scratchCtx.fillStyle = bGrad;
        scratchCtx.beginPath();
        scratchCtx.arc(localX, localY, bounceR, 0, Math.PI * 2);
        scratchCtx.fill();
      }

      // Recorte real de sombras direccionales 2D por oclusión (castShadows)
      if (l.castShadows && occluders.length > 0) {
        const shadowQuads = compute2DShadowPolygons({ x: lx, y: ly }, radius, occluders);
        if (shadowQuads.length > 0) {
          scratchCtx.globalCompositeOperation = 'destination-out';
          scratchCtx.fillStyle = 'rgba(0, 0, 0, 0.92)';
          for (const sq of shadowQuads) {
            const p = sq.points;
            scratchCtx.beginPath();
            scratchCtx.moveTo(p[0] - viewX, p[1] - viewY);
            scratchCtx.lineTo(p[2] - viewX, p[3] - viewY);
            scratchCtx.lineTo(p[4] - viewX, p[5] - viewY);
            scratchCtx.lineTo(p[6] - viewX, p[7] - viewY);
            scratchCtx.closePath();
            scratchCtx.fill();
          }
        }
      }
      scratchCtx.restore();

      mainCtx.save();
      mainCtx.globalCompositeOperation = 'lighter';
      mainCtx.drawImage(this.lightScratchCanvas!, 0, 0);
      mainCtx.restore();
    }

    texture.source.update();
    sprite.position.set(viewX, viewY);
    sprite.width = viewW;
    sprite.height = viewH;
    sprite.visible = true;
  }

  private drawDebugColliders(): void {
    const g = this.debugOverlayGraphics;
    g.clear();
    if (!this.showDebugColliders || !this.currentScene) return;

    const invZoom = 1 / Math.max(this.currentCamera.zoom, 0.25);
    const objectMap = new Map(this.currentScene.objects.map((o) => [o.id, o]));

    for (const obj of this.currentScene.objects) {
      if (!obj.visible) continue;
      if (obj.type === 'tilemap' && obj.tilemap) {
        const hasSolid = obj.components.some((c) => c.enabled && c.type === 'solid');
        if (!hasSolid) continue;
        const tm = obj.tilemap;
        const wt = obj.parentId ? getWorldTransform(obj, objectMap) : obj.transform;
        const tw = tm.tileWidth * wt.scaleX;
        const th = tm.tileHeight * wt.scaleY;
        const ox = wt.x - tm.cols * tw * obj.transform.anchorX;
        const oy = wt.y - tm.rows * th * obj.transform.anchorY;
        for (const [key, tileIdx] of Object.entries(tm.cells)) {
          const { kind } = getTileCollisionKind(tm, tileIdx);
          if (kind === 'none') continue;
          const [cs, rs] = key.split(',');
          const l = ox + Number(cs) * tw;
          const t = oy + Number(rs) * th;
          if (kind === 'one_way') {
            g.rect(l, t, tw, Math.max(4, th * 0.25));
            g.fill({ color: 0x06b6d4, alpha: 0.25 });
            g.moveTo(l, t);
            g.lineTo(l + tw, t);
            g.stroke({ width: 2.2 * invZoom, color: 0x22d3ee, alpha: 0.95 });
          } else if (kind === 'damage') {
            g.rect(l, t, tw, th);
            g.fill({ color: 0xef4444, alpha: 0.18 });
            g.stroke({ width: 1.4 * invZoom, color: 0xf97316, alpha: 0.9 });
          } else {
            g.rect(l, t, tw, th);
            g.stroke({ width: 1.2 * invZoom, color: 0x22c55e, alpha: 0.7 });
          }
        }
        continue;
      }

      const cols = getWorldColliders(obj, objectMap);
      for (const col of cols) {
        const color = col.isSmartPart
          ? 0x06b6d4
          : col.layer === 'UI'
            ? 0xa855f7
            : col.isSensor
              ? 0xf59e0b
              : 0x22c55e;
        if (col.kind === 'circle') {
          g.circle(col.cx, col.cy, col.radius);
        } else {
          g.rect(col.left, col.top, col.right - col.left, col.bottom - col.top);
        }
        g.fill({ color, alpha: col.isSmartPart ? 0.16 : 0.12 });
        g.stroke({ width: 1.5 * invZoom, color, alpha: 0.92 });
      }

      // Cono de visión IA 2D (cuando el objeto es perseguidor o tiene aiAgent)
      const isSelected = this.currentSelectedIds.includes(obj.id);
      const aiComp = obj.components.find(
        (c) => c.enabled && (c.type === 'chase_player' || c.type === 'ai.enemy_chaser')
      );
      if (obj.aiAgent?.enabled || aiComp) {
        const wt = obj.parentId ? getWorldTransform(obj, objectMap) : obj.transform;
        const showCone = isSelected || obj.aiAgent?.showVisionCone !== false;
        if (showCone) {
          const fovDeg = Number(
            obj.aiAgent?.visionFovDeg ??
              aiComp?.config?.visionFovDeg ??
              120
          );
          const range = Math.max(
            24,
            Number(
              obj.aiAgent?.visionRange ??
                aiComp?.config?.visionRange ??
                aiComp?.config?.detectRadius ??
                280
            )
          );
          const halfRad = degToRad(Math.max(10, Math.min(360, fovDeg)) * 0.5);
          const faceRad = degToRad(wt.rotation);
          if (fovDeg >= 355) {
            g.circle(wt.x, wt.y, range);
            g.fill({ color: 0xf59e0b, alpha: isSelected ? 0.08 : 0.04 });
            g.stroke({ width: 1.2 * invZoom, color: 0xf59e0b, alpha: isSelected ? 0.85 : 0.45 });
          } else {
            g.moveTo(wt.x, wt.y);
            g.arc(wt.x, wt.y, range, faceRad - halfRad, faceRad + halfRad);
            g.lineTo(wt.x, wt.y);
            g.fill({ color: 0xf59e0b, alpha: isSelected ? 0.11 : 0.05 });
            g.stroke({ width: 1.3 * invZoom, color: 0xf59e0b, alpha: isSelected ? 0.9 : 0.5 });
          }
        }
      }

      if (this.debugBodies) {
        const body = this.debugBodies.get(obj.id);
        if (body && (Math.abs(body.vx) > 2 || Math.abs(body.vy) > 2)) {
          g.moveTo(obj.transform.x, obj.transform.y);
          g.lineTo(obj.transform.x + body.vx * 0.2, obj.transform.y + body.vy * 0.2);
          g.stroke({ width: 2 * invZoom, color: 0x38bdf8, alpha: 0.9 });
        }
      }
    }

    // Tiradores editables del colisionador para el objeto 2D seleccionado en modo editor
    if (this.mode === 'editor' && this.currentSelectedIds.length === 1) {
      const selObj = objectMap.get(this.currentSelectedIds[0]);
      if (selObj && selObj.visible && !selObj.locked && selObj.type !== 'tilemap') {
        const colHandles = computeColliderHandles(selObj, objectMap);
        const hs = 5.5 * invZoom;
        for (const h of colHandles) {
          const isCenter = h.type === 'col-move';
          const fillCol = isCenter ? 0xf59e0b : 0x34d399;
          if (isCenter) {
            g.circle(h.stageX, h.stageY, hs);
          } else {
            g.rect(h.stageX - hs * 0.85, h.stageY - hs * 0.85, hs * 1.7, hs * 1.7);
          }
          g.fill({ color: fillCol, alpha: 0.95 });
          g.stroke({ width: 1.4 * invZoom, color: 0x09090b });
        }
      }
    }
  }

  private drawTransitionOverlay(): void {
    const g = this.transitionGraphics;
    g.clear();
    if (this.mode !== 'preview') return;
    const { width, height } = this.currentStage;
    if (this.currentScreenFlash) {
      const prog = Math.min(1, this.currentScreenFlash.age / Math.max(0.05, this.currentScreenFlash.duration));
      const flashAlpha = this.currentScreenFlash.alpha * (1 - prog);
      if (flashAlpha > 0.01) {
        g.rect(0, 0, width, height);
        g.fill({ color: parseHexColor(this.currentScreenFlash.color, 0xffffff), alpha: flashAlpha });
      }
    }
    if (!this.transitionEffect) return;
    const alpha = Math.max(0, Math.min(1, 1 - this.transitionEffect.progress));
    if (alpha <= 0.01) return;
    const color = this.transitionEffect.type === 'fadeWhite' ? 0xffffff : 0x050508;
    g.rect(0, 0, width, height);
    g.fill({ color, alpha });
  }

  private drawParticles(): void {
    const g = this.overlayGraphics;
    g.clear();
    const oldSprites = this.particleSpriteContainer.removeChildren();
    for (const ch of oldSprites) {
      ch.destroy({ children: true, texture: false, textureSource: false });
    }
    this.particleSpriteContainer.position.set(-this.cameraFollowOffset.x, -this.cameraFollowOffset.y);

    for (const burst of this.currentParticles) {
      const t = Math.min(1, burst.age / Math.max(0.05, burst.duration));
      const alpha = Math.max(0, 1 - t);
      const color = parseHexColor(burst.color, 0x34d399);
      for (let i = 0; i < burst.count; i++) {
        const angle = (Math.PI * 2 * i) / burst.count + (i % 2) * 0.25;
        const speed = 55 + (i % 3) * 35;
        const px = burst.x + Math.cos(angle) * speed * burst.age - this.cameraFollowOffset.x;
        const py = burst.y + Math.sin(angle) * speed * burst.age - 18 * burst.age - this.cameraFollowOffset.y;
        const radius = Math.max(1.5, 4.5 * (1 - t * 0.7));
        g.circle(px, py, radius);
        g.fill({ color, alpha });
      }
    }
    for (const pt of this.currentEmitterParticles) {
      const t = Math.min(1, pt.age / Math.max(0.05, pt.maxAge));
      const a0 = pt.alphaStart ?? pt.alpha;
      const a1 = pt.alphaEnd ?? 0;
      const alpha = Math.max(0, Math.min(1, sampleVfxCurve(pt.alphaCurve, t, a0, a1)));
      const radius = Math.max(1, sampleVfxCurve(pt.sizeCurve, t, pt.sizeStart, pt.sizeEnd));
      const color = parseHexColor(t < 0.5 ? pt.colorStart : pt.colorEnd, 0xf97316);
      const texEntry = pt.textureAssetId ? this.textureCache.get(pt.textureAssetId) : undefined;
      if (texEntry) {
        const cols = Math.max(1, pt.cols ?? 1);
        const rows = Math.max(1, pt.rows ?? 1);
        const total = cols * rows;
        let tex = texEntry.texture;
        if (total > 1) {
          const fps = Math.max(1, pt.spritesheetFps ?? 12);
          const idx = Math.floor(pt.age * fps) % total;
          tex = this.sliceSubTexture(tex, idx % cols, Math.floor(idx / cols), cols, rows);
        }
        const spr = new Sprite(tex);
        spr.anchor.set(0.5, 0.5);
        spr.position.set(pt.x, pt.y);
        spr.width = Math.max(2, radius * 2.5);
        spr.height = Math.max(2, radius * 2.5);
        spr.rotation = degToRad(pt.rotationDeg ?? 0);
        spr.tint = color;
        spr.alpha = alpha;
        if (pt.additive) {
          spr.blendMode = 'add';
        }
        this.particleSpriteContainer.addChild(spr);
      } else {
        const px = pt.x - this.cameraFollowOffset.x;
        const py = pt.y - this.cameraFollowOffset.y;
        const shape = pt.particleShape || 'circle';
        if (shape === 'ring') {
          g.circle(px, py, radius);
          g.stroke({ width: Math.max(1.5, radius * 0.22), color, alpha });
        } else if (shape === 'liquid') {
          g.ellipse(px, py, radius * 0.72, radius * 1.35);
          g.fill({ color, alpha });
        } else if (shape === 'spark') {
          const len = radius * 2.2;
          const ang = Math.atan2(pt.vy, pt.vx);
          g.moveTo(px - Math.cos(ang) * len * 0.5, py - Math.sin(ang) * len * 0.5);
          g.lineTo(px + Math.cos(ang) * len * 0.5, py + Math.sin(ang) * len * 0.5);
          g.stroke({ width: Math.max(1.5, radius * 0.55), color, alpha });
        } else if (shape === 'smoke') {
          g.circle(px, py, radius * 1.35);
          g.fill({ color, alpha: alpha * 0.55 });
        } else {
          g.circle(px, py, radius);
          g.fill({ color, alpha });
        }
      }
    }
  }

  private drawStageBackdrop(): void {
    const { width, height } = this.currentStage;
    const sig = `${width}x${height}|${this.currentBgColor}`;
    if (sig === this.lastBackdropSig) return;
    this.lastBackdropSig = sig;
    const g = this.stageBackdrop;
    g.clear();
    const bgHex = parseHexColor(this.currentBgColor, 0x131b2e);
    g.rect(0, 0, width, height);
    g.fill({ color: bgHex, alpha: 1 });
  }

  private drawGrid(): void {
    const g = this.gridGraphics;
    if (this.mode === 'preview' || !this.currentScene?.gridVisible) {
      if (this.lastGridSig !== 'none') {
        g.clear();
        this.lastGridSig = 'none';
      }
      return;
    }

    const { width, height } = this.currentStage;
    const step = Math.max(8, this.currentScene.gridSize || 32);
    const zoomBucket = Math.round(Math.max(this.currentCamera.zoom, 0.25) * 20) / 20;
    const sig = `${width}x${height}|${step}|${zoomBucket}`;
    if (sig === this.lastGridSig) return;
    this.lastGridSig = sig;

    g.clear();
    for (let gx = step; gx < width; gx += step) {
      const isMajor = gx % (step * 4) === 0;
      g.moveTo(gx, 0);
      g.lineTo(gx, height);
      g.stroke({
        width: (isMajor ? 1.2 : 0.8) / zoomBucket,
        color: 0xffffff,
        alpha: isMajor ? 0.1 : 0.045,
      });
    }

    for (let gy = step; gy < height; gy += step) {
      const isMajor = gy % (step * 4) === 0;
      g.moveTo(0, gy);
      g.lineTo(width, gy);
      g.stroke({
        width: (isMajor ? 1.2 : 0.8) / zoomBucket,
        color: 0xffffff,
        alpha: isMajor ? 0.1 : 0.045,
      });
    }
  }

  private drawStageBorder(): void {
    const g = this.stageBorderGraphics;
    g.clear();
    const { width, height } = this.currentStage;
    const invZoom = 1 / Math.max(this.currentCamera.zoom, 0.2);

    if (this.mode === 'preview') {
      g.rect(0, 0, width, height);
      g.stroke({ width: 1 * invZoom, color: 0x33333d, alpha: 0.7 });
      return;
    }

    g.rect(0, 0, width, height);
    g.stroke({ width: 1.5 * invZoom, color: 0x525260, alpha: 0.9 });
  }

  private getCellsRefId(cells: Record<string, number>): number {
    let id = this.cellsRefIds.get(cells);
    if (!id) {
      id = this.nextCellsRefId++;
      this.cellsRefIds.set(cells, id);
    }
    return id;
  }

  private computeObjectVisualSig(obj: GameObjectData): string {
    const { width, height, anchorX, anchorY } = obj.transform;
    const base = `${this.mode}|${obj.type}|${width}|${height}|${anchorX}|${anchorY}`;

    switch (obj.type) {
      case 'sprite': {
        const anim = obj.sprite?.animation;
        const fsmSt = anim?.fsmActiveState;
        const resolvedAssetId = fsmSt?.assetId || obj.sprite?.assetId || '';
        const entry = resolvedAssetId ? this.textureCache.get(resolvedAssetId) : undefined;
        let frameIdx = -1;
        if (entry && (anim?.enabled || fsmSt)) {
          const cols = Math.max(1, fsmSt?.cols ?? anim?.cols ?? 1);
          const rows = Math.max(1, fsmSt?.rows ?? anim?.rows ?? 1);
          const activeClipObj =
            !fsmSt && anim?.clips && anim.clips.length > 0
              ? anim.clips.find((c) => c.name === anim.activeClip) ?? anim.clips[0]
              : undefined;
          const startFrame = fsmSt
            ? Math.max(0, fsmSt.startFrame ?? 0)
            : activeClipObj
              ? Math.max(0, activeClipObj.startFrame)
              : 0;
          const total = fsmSt
            ? Math.max(1, Math.min(fsmSt.frameCount ?? 1, cols * rows - startFrame))
            : activeClipObj
              ? Math.max(1, Math.min(activeClipObj.frameCount, cols * rows - startFrame))
              : Math.max(1, Math.min(anim?.frameCount ?? 1, cols * rows));
          const fps = fsmSt?.fps ?? (activeClipObj ? activeClipObj.fps : anim?.fps ?? 8);
          const loop = fsmSt?.loop ?? (activeClipObj ? activeClipObj.loop : anim?.loop ?? true);
          let localIdx = 0;
          let effectiveElapsed = this.animationElapsed;
          if (fsmSt) {
            const stateKey = `${fsmSt.stateName}:${startFrame}:${fsmSt.assetId ?? ''}`;
            const tracked = this.fsmClipStartElapsed.get(obj.id);
            if (!tracked || tracked.stateKey !== stateKey || this.animationElapsed < tracked.startElapsed) {
              effectiveElapsed = 0;
            } else {
              effectiveElapsed = Math.max(0, this.animationElapsed - tracked.startElapsed);
            }
          }
          if ((fsmSt || anim?.playing) && effectiveElapsed > 0) {
            const rawFrame = Math.floor(effectiveElapsed * Math.max(1, fps));
            localIdx = loop ? rawFrame % total : Math.min(rawFrame, total - 1);
          }
          frameIdx = Math.min(cols * rows - 1, startFrame + localIdx);
        }
        const cr = obj.sprite?.cropRect;
        const ns = obj.sprite?.nineSlice;
        return `${base}|${resolvedAssetId}|${entry ? entry.objectUrl : 'no'}|${obj.sprite?.sampling ?? 'linear'}|${obj.sprite?.fitMode ?? 'contain'}|${obj.sprite?.tint ?? '#ffffff'}|${fsmSt?.stateName ?? ''}:${anim?.activeClip ?? ''}:${anim?.playing ? 1 : 0}|${frameIdx}|${cr ? `${cr.x},${cr.y},${cr.width},${cr.height}` : ''}|${ns ? `${ns.left},${ns.top},${ns.right},${ns.bottom}` : ''}`;
      }
      case 'rectangle': {
        const r = obj.rectangle;
        return `${base}|${r?.fillColor}|${r?.strokeColor}|${r?.strokeWidth}|${r?.cornerRadius}`;
      }
      case 'circle': {
        const c = obj.circle;
        return `${base}|${c?.fillColor}|${c?.strokeColor}|${c?.strokeWidth}`;
      }
      case 'text': {
        const t = obj.text;
        const renderedText =
          this.mode === 'preview'
            ? interpolateVariables(t?.text ?? 'Texto', this.runtimeVariables, t?.bindVariable)
            : t?.text ?? 'Texto';
        return `${base}|${renderedText}|${t?.fontFamily}|${t?.fontSize}|${t?.fontWeight}|${t?.color}|${t?.align}`;
      }
      case 'ui_panel': {
        const p = obj.uiPanel;
        return `${base}|${p?.bgColor}|${p?.borderColor}|${p?.borderWidth}|${p?.borderRadius}`;
      }
      case 'ui_button': {
        const b = obj.uiButton;
        const isHover = this.mode === 'preview' && this.hoveredObjectId === obj.id;
        return `${base}|${isHover ? 1 : 0}|${b?.text}|${b?.bgColor}|${b?.hoverColor}|${b?.borderColor}|${b?.textColor}|${b?.fontSize}|${b?.borderRadius}`;
      }
      case 'ui_progress_bar': {
        const bar = obj.uiProgressBar;
        const maxVal = Math.max(1, bar?.maxValue ?? 100);
        const rawVal =
          this.mode === 'preview' && this.runtimeVariables && bar?.variable
            ? Number(this.runtimeVariables.get(bar.variable) ?? maxVal)
            : maxVal * 0.75;
        return `${base}|${bar?.bgColor}|${bar?.fillColor}|${bar?.borderColor}|${bar?.showLabel}|${maxVal}|${rawVal}`;
      }
      case 'ui_leaderboard': {
        const lb = obj.uiLeaderboard;
        const lbSig =
          this.mode === 'preview'
            ? this.currentLeaderboard.slice(0, lb?.maxEntries ?? 5).map((e) => `${e.name}:${e.score}`).join(',')
            : 'ed';
        return `${base}|${lb?.title}|${lb?.bgColor}|${lb?.borderColor}|${lb?.accentColor}|${lb?.textColor}|${lb?.maxEntries}|${lbSig}`;
      }
      case 'tilemap': {
        const tm = obj.tilemap;
        if (!tm) return base;
        const entry = tm.assetId ? this.textureCache.get(tm.assetId) : undefined;
        const isSelected = this.mode === 'editor' && this.currentSelectedIds.includes(obj.id) ? 1 : 0;
        const cellCount = Object.keys(tm.cells).length;
        const refId = this.getCellsRefId(tm.cells);
        return `${base}|${tm.cols}x${tm.rows}|${tm.tileWidth}x${tm.tileHeight}|${tm.assetId ?? ''}|${entry ? entry.objectUrl : 'no'}|${tm.tilesetCols}|${tm.tilesetRows}|${refId}:${cellCount}|${isSelected}`;
      }
      case 'light_2d': {
        const l = obj.light2d;
        const isSelected = this.mode === 'editor' && this.currentSelectedIds.includes(obj.id) ? 1 : 0;
        return `${base}|${isSelected}|${l?.color}|${l?.radius}|${l?.kind}|${l?.angleDeg}|${l?.directionDeg}`;
      }
      default:
        return base;
    }
  }

  private disposeCachedNode(entry: CachedSceneNode): void {
    if (entry.container.parent) {
      entry.container.parent.removeChild(entry.container);
    }
    entry.container.destroy({ children: true, texture: false, textureSource: false });
    for (const tex of entry.textures) {
      tex.destroy(false);
    }
  }

  private rebuildSceneDisplayObjects(): void {
    this.clearFrameTextures();

    if (!this.currentScene) {
      for (const entry of this.nodeCache.values()) {
        this.disposeCachedNode(entry);
      }
      this.nodeCache.clear();
      return;
    }

    const objects = this.currentScene.objects;
    const liveIds = new Set<string>();
    for (const o of objects) liveIds.add(o.id);

    for (const [id, entry] of this.nodeCache.entries()) {
      if (!liveIds.has(id)) {
        this.disposeCachedNode(entry);
        this.nodeCache.delete(id);
      }
    }

    const displayMap = new Map<string, Container>();

    for (const obj of objects) {
      const sig = this.computeObjectVisualSig(obj);
      let cached = this.nodeCache.get(obj.id);
      if (!cached || cached.sig !== sig) {
        if (cached) {
          this.disposeCachedNode(cached);
        }
        const textures: Texture[] = [];
        this.activeNodeTexturesBucket = textures;
        const container = this.createDisplayObject(obj);
        this.activeNodeTexturesBucket = null;
        cached = { sig, container, textures };
        this.nodeCache.set(obj.id, cached);
      }

      const node = cached.container;
      node.position.set(obj.transform.x, obj.transform.y);
      node.rotation = degToRad(obj.transform.rotation);
      const squash = this.mode === 'preview' ? this.currentVisualSquash?.get(obj.id) : undefined;
      node.scale.set(
        obj.transform.scaleX * (squash?.sx ?? 1) * (obj.sprite?.flipX ? -1 : 1),
        obj.transform.scaleY * (squash?.sy ?? 1) * (obj.sprite?.flipY ? -1 : 1)
      );
      node.alpha = Math.max(0, Math.min(1, obj.opacity));
      node.visible = obj.visible;

      if (this.mode === 'preview' && obj.visible && obj.optimization) {
        const opt = obj.optimization;
        const viewLeft = this.cameraFollowOffset.x;
        const viewTop = this.cameraFollowOffset.y;
        const viewW = this.currentStage.width;
        const viewH = this.currentStage.height;
        const pad =
          Math.max(
            Math.abs(obj.transform.width * obj.transform.scaleX),
            Math.abs(obj.transform.height * obj.transform.scaleY)
          ) + 80;
        if (
          opt.frustumCulling &&
          !obj.parentId &&
          (obj.transform.x < viewLeft - pad ||
            obj.transform.x > viewLeft + viewW + pad ||
            obj.transform.y < viewTop - pad ||
            obj.transform.y > viewTop + viewH + pad)
        ) {
          node.visible = false;
        }
        if (node.visible && opt.fadeEnabled) {
          const cx = viewLeft + viewW * 0.5;
          const cy = viewTop + viewH * 0.5;
          const dist = Math.hypot(obj.transform.x - cx, obj.transform.y - cy);
          const fStart = Math.max(10, opt.fadeStart ?? 380);
          const fEnd = Math.max(fStart + 20, opt.fadeEnd ?? 620);
          if (dist >= fEnd) {
            node.visible = false;
          } else if (dist > fStart) {
            const fadeFrac = 1 - (dist - fStart) / (fEnd - fStart);
            node.alpha *= Math.max(0, Math.min(1, fadeFrac));
          }
        }
      }

      if (this.mode === 'preview') {
        const flash = this.currentFlashTimers?.get(obj.id);
        if (flash) {
          if (!cached.flashGraphic) {
            cached.flashGraphic = new Graphics();
            const { width, height, anchorX, anchorY } = obj.transform;
            cached.flashGraphic.rect(-width * anchorX, -height * anchorY, width, height);
            cached.flashGraphic.fill({ color: parseHexColor(flash.color, 0xffffff), alpha: 0.65 });
            node.addChild(cached.flashGraphic);
          }
          cached.flashGraphic.visible = true;
        } else if (cached.flashGraphic) {
          cached.flashGraphic.visible = false;
        }

        const hpBarComp = obj.components.find(
          (c) =>
            c.enabled &&
            ((c.type === 'combat.health_system' && c.config.showFloatingBar !== false) ||
              c.type === 'juice.floating_hp_bar')
        );
        const body = this.debugBodies?.get(obj.id);
        if (hpBarComp && body && body.maxHealth > 0) {
          const barW = Number(hpBarComp.config.width ?? 48);
          const offY = Number(hpBarComp.config.offsetY ?? 12);
          const fillHex = String(hpBarComp.config.fillColor ?? '#22c55e');
          const ratio = Math.max(0, Math.min(1, body.health / body.maxHealth));
          const hpKey = `${barW}|${offY}|${fillHex}|${ratio.toFixed(3)}`;
          if (!cached.hpGraphic) {
            cached.hpGraphic = new Graphics();
            node.addChild(cached.hpGraphic);
          }
          if (cached.hpKey !== hpKey) {
            cached.hpKey = hpKey;
            const topY = -obj.transform.height * obj.transform.anchorY - offY;
            cached.hpGraphic.clear();
            cached.hpGraphic.roundRect(-barW * 0.5, topY - 6, barW, 6, 2);
            cached.hpGraphic.fill({ color: 0x0f172a, alpha: 0.85 });
            if (ratio > 0) {
              cached.hpGraphic.roundRect(-barW * 0.5 + 1, topY - 5, Math.max(2, (barW - 2) * ratio), 4, 1);
              cached.hpGraphic.fill({ color: parseHexColor(fillHex, 0x22c55e), alpha: 1 });
            }
          }
          cached.hpGraphic.visible = true;
        } else if (cached.hpGraphic) {
          cached.hpGraphic.visible = false;
        }
      }

      displayMap.set(obj.id, node);
    }

    for (const obj of objects) {
      const node = displayMap.get(obj.id);
      if (!node) continue;
      if (obj.parentId && displayMap.has(obj.parentId) && obj.parentId !== obj.id) {
        displayMap.get(obj.parentId)!.addChild(node);
      } else {
        this.sceneRoot.addChild(node);
      }
    }
  }

  private createDisplayObject(obj: GameObjectData): Container {
    const { width, height, anchorX, anchorY } = obj.transform;

    switch (obj.type) {
      case 'sprite': {
        const anim = obj.sprite?.animation;
        const fsmSt = anim?.fsmActiveState;
        const resolvedAssetId = fsmSt?.assetId || obj.sprite?.assetId;
        const entry = resolvedAssetId
          ? this.textureCache.get(resolvedAssetId)
          : undefined;
        if (entry && entry.texture.width > 0 && entry.texture.height > 0) {
          entry.texture.source.scaleMode =
            obj.sprite?.sampling === 'nearest' ? 'nearest' : 'linear';

          let activeTexture = entry.texture;
          if (anim?.enabled || fsmSt) {
            const cols = Math.max(1, fsmSt?.cols ?? anim?.cols ?? 1);
            const rows = Math.max(1, fsmSt?.rows ?? anim?.rows ?? 1);
            const activeClipObj =
              !fsmSt && anim?.clips && anim.clips.length > 0
                ? anim.clips.find((c) => c.name === anim.activeClip) ?? anim.clips[0]
                : undefined;

            const startFrame = fsmSt
              ? Math.max(0, fsmSt.startFrame ?? 0)
              : activeClipObj
                ? Math.max(0, activeClipObj.startFrame)
                : 0;
            const total = fsmSt
              ? Math.max(1, Math.min(fsmSt.frameCount ?? 1, cols * rows - startFrame))
              : activeClipObj
                ? Math.max(1, Math.min(activeClipObj.frameCount, cols * rows - startFrame))
                : Math.max(1, Math.min(anim?.frameCount ?? 1, cols * rows));
            const fps = fsmSt?.fps ?? (activeClipObj ? activeClipObj.fps : anim?.fps ?? 8);
            const loop = fsmSt?.loop ?? (activeClipObj ? activeClipObj.loop : anim?.loop ?? true);

            let localIdx = 0;
            let effectiveElapsed = this.animationElapsed;
            if (fsmSt) {
              const stateKey = `${fsmSt.stateName}:${startFrame}:${fsmSt.assetId ?? ''}`;
              const tracked = this.fsmClipStartElapsed.get(obj.id);
              if (!tracked || tracked.stateKey !== stateKey || this.animationElapsed < tracked.startElapsed) {
                this.fsmClipStartElapsed.set(obj.id, {
                  stateKey,
                  startElapsed: this.animationElapsed,
                });
                effectiveElapsed = 0;
              } else {
                effectiveElapsed = Math.max(0, this.animationElapsed - tracked.startElapsed);
              }
            }
            if ((fsmSt || anim?.playing) && effectiveElapsed > 0) {
              const rawFrame = Math.floor(effectiveElapsed * Math.max(1, fps));
              localIdx = loop ? rawFrame % total : Math.min(rawFrame, total - 1);
            }
            const frameIdx = Math.min(cols * rows - 1, startFrame + localIdx);
            const col = frameIdx % cols;
            const row = Math.floor(frameIdx / cols);
            activeTexture = this.sliceSubTexture(entry.texture, col, row, cols, rows);
          }

          const layout = computeSpriteRenderLayout({
            boxWidth: width,
            boxHeight: height,
            anchorX,
            anchorY,
            textureWidth: activeTexture.width,
            textureHeight: activeTexture.height,
            fitMode: obj.sprite?.fitMode ?? 'contain',
            cropRect: obj.sprite?.cropRect,
          });

          if (layout.sourceCrop) {
            activeTexture = this.cropSubTexture(
              activeTexture,
              layout.sourceCrop.x,
              layout.sourceCrop.y,
              layout.sourceCrop.width,
              layout.sourceCrop.height
            );
          }

          if (obj.sprite?.fitMode === 'nine_slice') {
            const ns = obj.sprite.nineSlice ?? { left: 16, top: 16, right: 16, bottom: 16 };
            const maxX = Math.max(2, Math.floor(activeTexture.width * 0.45));
            const maxY = Math.max(2, Math.floor(activeTexture.height * 0.45));
            const nine = new NineSliceSprite({
              texture: activeTexture,
              leftWidth: Math.min(maxX, Math.max(1, ns.left)),
              topHeight: Math.min(maxY, Math.max(1, ns.top)),
              rightWidth: Math.min(maxX, Math.max(1, ns.right)),
              bottomHeight: Math.min(maxY, Math.max(1, ns.bottom)),
              width: Math.max(4, width),
              height: Math.max(4, height),
            });
            nine.position.set(-width * anchorX, -height * anchorY);
            nine.tint = parseHexColor(obj.sprite?.tint, 0xffffff);
            return nine;
          }

          if (layout.tiled) {
            const tileSpr = new TilingSprite({
              texture: activeTexture,
              width: layout.drawWidth,
              height: layout.drawHeight,
            });
            tileSpr.anchor.set(anchorX, anchorY);
            tileSpr.tint = parseHexColor(obj.sprite?.tint, 0xffffff);
            return tileSpr;
          }

          const wrapper = new Container();
          const sprite = new Sprite(activeTexture);
          sprite.anchor.set(anchorX, anchorY);
          sprite.position.set(layout.offsetX, layout.offsetY);
          sprite.width = Math.max(1, layout.drawWidth);
          sprite.height = Math.max(1, layout.drawHeight);
          sprite.tint = parseHexColor(obj.sprite?.tint, 0xffffff);
          wrapper.addChild(sprite);

          if (layout.needsClipMask) {
            const mask = new Graphics();
            mask.rect(layout.frameLeft, layout.frameTop, layout.frameWidth, layout.frameHeight);
            mask.fill({ color: 0xffffff, alpha: 1 });
            wrapper.addChild(mask);
            sprite.mask = mask;
          }
          return wrapper;
        }
        const placeholder = new Graphics();
        const left = -width * anchorX;
        const top = -height * anchorY;
        placeholder.rect(left, top, width, height);
        placeholder.fill({ color: 0x27272a, alpha: 0.9 });
        placeholder.stroke({ width: 1.5, color: 0x52525b });
        placeholder.moveTo(left, top);
        placeholder.lineTo(left + width, top + height);
        placeholder.moveTo(left + width, top);
        placeholder.lineTo(left, top + height);
        placeholder.stroke({ width: 1, color: 0x52525b, alpha: 0.7 });
        return placeholder;
      }

      case 'rectangle': {
        const g = new Graphics();
        const r = obj.rectangle;
        const left = -width * anchorX;
        const top = -height * anchorY;
        const radius = Math.min(r?.cornerRadius ?? 0, width / 2, height / 2);
        if (radius > 0) {
          g.roundRect(left, top, width, height, radius);
        } else {
          g.rect(left, top, width, height);
        }
        g.fill({ color: parseHexColor(r?.fillColor, 0x3b82f6), alpha: 1 });
        if ((r?.strokeWidth ?? 0) > 0) {
          g.stroke({
            width: r!.strokeWidth,
            color: parseHexColor(r?.strokeColor, 0x93c5fd),
          });
        }
        return g;
      }

      case 'circle': {
        const g = new Graphics();
        const c = obj.circle;
        const rx = width / 2;
        const ry = height / 2;
        const cx = (0.5 - anchorX) * width;
        const cy = (0.5 - anchorY) * height;
        g.ellipse(cx, cy, Math.max(1, rx), Math.max(1, ry));
        g.fill({ color: parseHexColor(c?.fillColor, 0x10b981), alpha: 1 });
        if ((c?.strokeWidth ?? 0) > 0) {
          g.stroke({
            width: c!.strokeWidth,
            color: parseHexColor(c?.strokeColor, 0x6ee7b7),
          });
        }
        return g;
      }

      case 'text': {
        const t = obj.text;
        const renderedText =
          this.mode === 'preview'
            ? interpolateVariables(t?.text ?? 'Texto', this.runtimeVariables, t?.bindVariable)
            : t?.text ?? 'Texto';
        const style = new TextStyle({
          fontFamily: t?.fontFamily || 'Plus Jakarta Sans, sans-serif',
          fontSize: Math.max(8, t?.fontSize ?? 28),
          fontWeight: t?.fontWeight === 'bold' ? '700' : '400',
          fill: parseHexColor(t?.color, 0xffffff),
          align: t?.align ?? 'center',
        });
        const pixiText = new Text({
          text: renderedText,
          style,
        });
        pixiText.anchor.set(anchorX, anchorY);
        return pixiText;
      }

      case 'ui_panel': {
        const g = new Graphics();
        const p = obj.uiPanel;
        const left = -width * anchorX;
        const top = -height * anchorY;
        const radius = Math.min(p?.borderRadius ?? 10, width / 2, height / 2);
        if (radius > 0) {
          g.roundRect(left, top, width, height, radius);
        } else {
          g.rect(left, top, width, height);
        }
        g.fill({ color: parseHexColor(p?.bgColor, 0x18181f), alpha: 0.94 });
        if ((p?.borderWidth ?? 2) > 0) {
          g.stroke({
            width: p?.borderWidth ?? 2,
            color: parseHexColor(p?.borderColor, 0x3b82f6),
          });
        }
        return g;
      }

      case 'ui_button': {
        const container = new Container();
        const b = obj.uiButton;
        const isHover = this.mode === 'preview' && this.hoveredObjectId === obj.id;
        const left = -width * anchorX;
        const top = -height * anchorY;
        const radius = Math.min(b?.borderRadius ?? 8, width / 2, height / 2);
        const bg = new Graphics();
        if (radius > 0) {
          bg.roundRect(left, top, width, height, radius);
        } else {
          bg.rect(left, top, width, height);
        }
        bg.fill({
          color: parseHexColor(isHover ? b?.hoverColor : b?.bgColor, isHover ? 0x3b82f6 : 0x2563eb),
          alpha: 1,
        });
        bg.stroke({
          width: 2,
          color: parseHexColor(b?.borderColor, 0x60a5fa),
        });
        container.addChild(bg);

        const label = new Text({
          text: b?.text ?? 'Botón',
          style: new TextStyle({
            fontFamily: 'Plus Jakarta Sans, sans-serif',
            fontSize: Math.max(10, b?.fontSize ?? 18),
            fontWeight: '700',
            fill: parseHexColor(b?.textColor, 0xffffff),
            align: 'center',
          }),
        });
        label.anchor.set(0.5, 0.5);
        label.position.set(left + width * 0.5, top + height * 0.5);
        container.addChild(label);
        return container;
      }

      case 'ui_progress_bar': {
        const container = new Container();
        const bar = obj.uiProgressBar;
        const left = -width * anchorX;
        const top = -height * anchorY;
        const maxVal = Math.max(1, bar?.maxValue ?? 100);
        const rawVal =
          this.mode === 'preview' && this.runtimeVariables && bar?.variable
            ? Number(this.runtimeVariables.get(bar.variable) ?? maxVal)
            : maxVal * 0.75;
        const ratio = Math.max(0, Math.min(1, (Number.isFinite(rawVal) ? rawVal : 0) / maxVal));

        const g = new Graphics();
        g.roundRect(left, top, width, height, Math.min(6, height / 2));
        g.fill({ color: parseHexColor(bar?.bgColor, 0x1e293b), alpha: 1 });
        if (ratio > 0) {
          g.roundRect(
            left + 2,
            top + 2,
            Math.max(4, (width - 4) * ratio),
            Math.max(4, height - 4),
            Math.min(4, height / 2)
          );
          g.fill({ color: parseHexColor(bar?.fillColor, 0x10b981), alpha: 1 });
        }
        g.roundRect(left, top, width, height, Math.min(6, height / 2));
        g.stroke({ width: 1.5, color: parseHexColor(bar?.borderColor, 0x475569) });
        container.addChild(g);

        if (bar?.showLabel !== false) {
          const label = new Text({
            text: `${Math.round(rawVal)} / ${maxVal}`,
            style: new TextStyle({
              fontFamily: 'Plus Jakarta Sans, sans-serif',
              fontSize: Math.max(10, Math.min(16, Math.round(height * 0.55))),
              fontWeight: '700',
              fill: 0xf8fafc,
            }),
          });
          label.anchor.set(0.5, 0.5);
          label.position.set(left + width * 0.5, top + height * 0.5);
          container.addChild(label);
        }
        return container;
      }

      case 'ui_leaderboard': {
        const container = new Container();
        const lb = obj.uiLeaderboard;
        const left = -width * anchorX;
        const top = -height * anchorY;
        const maxRows = Math.max(1, Math.min(10, lb?.maxEntries ?? 5));
        const g = new Graphics();
        g.roundRect(left, top, width, height, 10);
        g.fill({ color: parseHexColor(lb?.bgColor, 0x0f172a), alpha: 0.94 });
        g.stroke({ width: 2, color: parseHexColor(lb?.borderColor, 0x334155) });
        // Banda de cabecera
        g.roundRect(left + 4, top + 4, Math.max(10, width - 8), 32, 6);
        g.fill({ color: parseHexColor(lb?.accentColor, 0xf59e0b), alpha: 0.16 });
        container.addChild(g);

        const titleTxt = new Text({
          text: lb?.title || 'MEJORES PUNTUACIONES',
          style: new TextStyle({
            fontFamily: 'Plus Jakarta Sans, sans-serif',
            fontSize: 13,
            fontWeight: '700',
            fill: parseHexColor(lb?.accentColor, 0xf59e0b),
          }),
        });
        titleTxt.anchor.set(0.5, 0.5);
        titleTxt.position.set(left + width * 0.5, top + 20);
        container.addChild(titleTxt);

        const rows =
          this.mode === 'preview' && this.currentLeaderboard.length > 0
            ? this.currentLeaderboard.slice(0, maxRows)
            : this.mode === 'editor'
              ? [
                  { name: 'Jugador 1', score: 1250, date: 0 },
                  { name: 'Jugador 2', score: 940, date: 0 },
                  { name: 'Jugador 3', score: 620, date: 0 },
                ].slice(0, maxRows)
              : [];

        if (rows.length === 0) {
          const emptyTxt = new Text({
            text: 'Sin récords aún',
            style: new TextStyle({
              fontFamily: 'Plus Jakarta Sans, sans-serif',
              fontSize: 12,
              fill: 0x94a3b8,
            }),
          });
          emptyTxt.anchor.set(0.5, 0.5);
          emptyTxt.position.set(left + width * 0.5, top + height * 0.55);
          container.addChild(emptyTxt);
        } else {
          const rowStep = Math.max(22, (height - 46) / maxRows);
          rows.forEach((entry, idx) => {
            const ry = top + 46 + idx * rowStep;
            const rowText = new Text({
              text: `#${idx + 1}  ${entry.name}`,
              style: new TextStyle({
                fontFamily: 'Plus Jakarta Sans, sans-serif',
                fontSize: 12,
                fontWeight: idx === 0 ? '700' : '400',
                fill: parseHexColor(lb?.textColor, 0xf8fafc),
              }),
            });
            rowText.position.set(left + 14, ry);
            container.addChild(rowText);

            const scoreText = new Text({
              text: `${entry.score}`,
              style: new TextStyle({
                fontFamily: 'JetBrains Mono, monospace',
                fontSize: 12,
                fontWeight: '700',
                fill: parseHexColor(lb?.accentColor, 0xf59e0b),
              }),
            });
            scoreText.anchor.set(1, 0);
            scoreText.position.set(left + width - 14, ry);
            container.addChild(scoreText);
          });
        }
        return container;
      }

      case 'tilemap': {
        const container = new Container();
        const tm = obj.tilemap;
        if (!tm) return container;

        const mapW = tm.cols * tm.tileWidth;
        const mapH = tm.rows * tm.tileHeight;
        const ox = -mapW * anchorX;
        const oy = -mapH * anchorY;

        const entry = tm.assetId ? this.textureCache.get(tm.assetId) : undefined;
        const tsCols = Math.max(1, tm.tilesetCols || 1);
        const tsRows = Math.max(1, tm.tilesetRows || 1);

        const tileTexMap = new Map<number, Texture>();
        if (entry) {
          for (const tileIdx of Object.values(tm.cells)) {
            if (!tileTexMap.has(tileIdx)) {
              const col = tileIdx % tsCols;
              const row = Math.floor(tileIdx / tsCols) % tsRows;
              tileTexMap.set(
                tileIdx,
                this.sliceSubTexture(entry.texture, col, row, tsCols, tsRows)
              );
            }
          }
        }

        const fallbackColors = [0x3b82f6, 0x10b981, 0xf59e0b, 0x64748b, 0xec4899, 0x8b5cf6];
        const cellGraphics = new Graphics();

        for (const [key, tileIdx] of Object.entries(tm.cells)) {
          const [cs, rs] = key.split(',');
          const c = Number(cs);
          const r = Number(rs);
          if (c < 0 || r < 0 || c >= tm.cols || r >= tm.rows) continue;
          const px = ox + c * tm.tileWidth;
          const py = oy + r * tm.tileHeight;

          const tex = tileTexMap.get(tileIdx);
          if (tex) {
            const tileSprite = new Sprite(tex);
            tileSprite.position.set(px, py);
            tileSprite.width = tm.tileWidth;
            tileSprite.height = tm.tileHeight;
            container.addChild(tileSprite);
          } else {
            const color = fallbackColors[Math.abs(tileIdx) % fallbackColors.length];
            cellGraphics.rect(px, py, tm.tileWidth, tm.tileHeight);
            cellGraphics.fill({ color, alpha: 0.85 });
            cellGraphics.stroke({ width: 1, color: 0x0f172a, alpha: 0.45 });
          }
        }
        container.addChild(cellGraphics);

        if (this.mode === 'editor') {
          const grid = new Graphics();
          const isSelected = this.currentSelectedIds.includes(obj.id);
          const alpha = isSelected ? 0.25 : 0.1;
          for (let c = 0; c <= tm.cols; c++) {
            const lx = ox + c * tm.tileWidth;
            grid.moveTo(lx, oy);
            grid.lineTo(lx, oy + mapH);
          }
          for (let r = 0; r <= tm.rows; r++) {
            const ly = oy + r * tm.tileHeight;
            grid.moveTo(ox, ly);
            grid.lineTo(ox + mapW, ly);
          }
          grid.stroke({ width: 1, color: isSelected ? 0x60a5fa : 0x94a3b8, alpha });
          container.addChild(grid);
        }

        return container;
      }

      case 'container': {
        const container = new Container();
        if (this.mode === 'editor') {
          const outline = new Graphics();
          const left = -width * anchorX;
          const top = -height * anchorY;
          outline.rect(left, top, width, height);
          outline.stroke({ width: 1, color: 0x64748b, alpha: 0.35 });
          container.addChild(outline);
        }
        return container;
      }

      case 'ui_widget': {
        const container = new Container();
        if (this.mode === 'editor') {
          const g = new Graphics();
          const left = -width * anchorX;
          const top = -height * anchorY;
          g.roundRect(left, top, width, height, 10);
          g.fill({ color: 0x0f172a, alpha: 0.18 });
          g.stroke({ width: 1.5, color: 0x38bdf8, alpha: 0.65 });
          container.addChild(g);
        }
        return container;
      }

      case 'light_2d': {
        const container = new Container();
        if (this.mode === 'editor') {
          const g = new Graphics();
          const color = parseHexColor(obj.light2d?.color, 0xfde68a);
          const isSelected = this.currentSelectedIds.includes(obj.id);
          g.circle(0, 0, 14);
          g.fill({ color, alpha: 0.9 });
          g.stroke({ width: 2, color: 0x0f172a });
          if (isSelected) {
            const rad = obj.light2d?.radius ?? 260;
            if (obj.light2d?.kind === 'spot') {
              const halfRad = degToRad(Math.max(5, Math.min(170, obj.light2d.angleDeg || 55)) * 0.5);
              const dirRad = degToRad(obj.light2d.directionDeg || 0);
              g.moveTo(0, 0);
              g.lineTo(Math.cos(dirRad - halfRad) * rad, Math.sin(dirRad - halfRad) * rad);
              g.arc(0, 0, rad, dirRad - halfRad, dirRad + halfRad);
              g.lineTo(0, 0);
              g.stroke({ width: 1.4, color, alpha: 0.65 });
            } else {
              g.circle(0, 0, rad);
              g.stroke({ width: 1.2, color, alpha: 0.45 });
            }
          }
          container.addChild(g);
        }
        return container;
      }

      case 'mesh_3d':
      case 'light_3d':
      case 'camera_3d': {
        return new Container();
      }
    }
  }

  private drawSelectionAndGizmos(): void {
    const g = this.overlayGraphics;
    g.clear();
    if (this.mode === 'preview' || !this.currentScene || this.currentSelectedIds.length === 0) {
      return;
    }

    const objectMap = buildObjectMap(this.currentScene.objects);
    const invZoom = 1 / Math.max(this.currentCamera.zoom, 0.15);

    for (const id of this.currentSelectedIds) {
      const obj = objectMap.get(id);
      if (!obj || !obj.visible) continue;
      const corners = getObjectWorldCorners(obj, objectMap);
      g.moveTo(corners[0].x, corners[0].y);
      g.lineTo(corners[1].x, corners[1].y);
      g.lineTo(corners[2].x, corners[2].y);
      g.lineTo(corners[3].x, corners[3].y);
      g.closePath();
      g.stroke({
        width: 1.75 * invZoom,
        color: obj.locked ? 0xf59e0b : 0x3b82f6,
        alpha: 0.95,
      });
    }

    if (this.currentSelectedIds.length === 1 && this.currentTool !== 'tilebrush') {
      const primary = objectMap.get(this.currentSelectedIds[0]);
      if (!primary || !primary.visible || primary.locked) return;

      const world = getWorldTransform(primary, objectMap);
      const handles = computeGizmoHandles(
        primary,
        objectMap,
        this.currentTool,
        this.currentCamera.zoom
      );

      if (this.currentTool === 'move') {
        const axisLen = 58 * invZoom;
        const arrowHead = 8 * invZoom;

        g.moveTo(world.x, world.y);
        g.lineTo(world.x + axisLen, world.y);
        g.stroke({ width: 2.5 * invZoom, color: 0xef4444 });
        g.poly([
          world.x + axisLen + arrowHead,
          world.y,
          world.x + axisLen - arrowHead * 0.5,
          world.y - arrowHead * 0.65,
          world.x + axisLen - arrowHead * 0.5,
          world.y + arrowHead * 0.65,
        ]);
        g.fill({ color: 0xef4444 });

        g.moveTo(world.x, world.y);
        g.lineTo(world.x, world.y + axisLen);
        g.stroke({ width: 2.5 * invZoom, color: 0x22c55e });
        g.poly([
          world.x,
          world.y + axisLen + arrowHead,
          world.x - arrowHead * 0.65,
          world.y + axisLen - arrowHead * 0.5,
          world.x + arrowHead * 0.65,
          world.y + axisLen - arrowHead * 0.5,
        ]);
        g.fill({ color: 0x22c55e });

        const boxSize = 9 * invZoom;
        g.rect(world.x - boxSize / 2, world.y - boxSize / 2, boxSize, boxSize);
        g.fill({ color: 0xfef08a });
        g.stroke({ width: 1.5 * invZoom, color: 0x18181b });
      }

      if (this.currentTool === 'rotate') {
        g.circle(world.x, world.y, 44 * invZoom);
        g.stroke({ width: 1.5 * invZoom, color: 0x38bdf8, alpha: 0.7 });
      }

      const corners = getObjectWorldCorners(primary, objectMap);
      const topCenter = {
        x: (corners[0].x + corners[1].x) / 2,
        y: (corners[0].y + corners[1].y) / 2,
      };

      for (const handle of handles) {
        if (handle.type === 'rotate') {
          g.moveTo(topCenter.x, topCenter.y);
          g.lineTo(handle.stageX, handle.stageY);
          g.stroke({ width: 1.5 * invZoom, color: 0x38bdf8 });

          g.circle(handle.stageX, handle.stageY, 5.5 * invZoom);
          g.fill({ color: 0x38bdf8 });
          g.stroke({ width: 1.5 * invZoom, color: 0x0f172a });
        } else if (handle.type.startsWith('scale-')) {
          const hs = 7.5 * invZoom;
          g.rect(handle.stageX - hs / 2, handle.stageY - hs / 2, hs, hs);
          g.fill({ color: 0xffffff });
          g.stroke({ width: 1.5 * invZoom, color: 0x3b82f6 });
        }
      }
    }
  }

  destroy(): void {
    this.destroyed = true;
    this.initialized = false;
    this.clearFrameTextures();
    for (const entry of this.nodeCache.values()) {
      this.disposeCachedNode(entry);
    }
    this.nodeCache.clear();

    if (this.lightTexture) {
      this.lightTexture.destroy(true);
      this.lightTexture = null;
    }
    this.lightSprite = null;
    this.lightCanvas = null;
    this.lightScratchCanvas = null;

    for (const entry of this.textureCache.values()) {
      entry.texture.destroy(true);
      URL.revokeObjectURL(entry.objectUrl);
    }
    this.textureCache.clear();
    this.loadingAssets.clear();
    this.fsmClipStartElapsed.clear();

    if (this.app) {
      this.app.destroy({ removeView: true }, { children: true, texture: false, textureSource: false });
      this.app = null;
    }
  }
}
