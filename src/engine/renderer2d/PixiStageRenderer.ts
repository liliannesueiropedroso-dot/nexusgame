import {
  Application,
  Container,
  Graphics,
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
import { computeSpriteRenderLayout } from '../sprites/spriteFit';
import { computeGizmoHandles } from './hitTest';

export type RendererMode = 'editor' | 'preview';

interface CachedTextureEntry {
  texture: Texture;
  objectUrl: string;
  blobRef: Blob;
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
  private stageBorderGraphics = new Graphics();
  private overlayGraphics = new Graphics();
  private debugOverlayGraphics = new Graphics();
  private transitionGraphics = new Graphics();

  // Caché de texturas por assetId
  private textureCache = new Map<string, CachedTextureEntry>();
  private loadingAssets = new Set<string>();
  private frameTextures: Texture[] = [];

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
    this.worldContainer.addChild(this.stageBorderGraphics);
    this.worldContainer.addChild(this.overlayGraphics);
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
    this.frameTextures.push(sub);
    return sub;
  }

  private cropSubTexture(baseTexture: Texture, x: number, y: number, w: number, h: number): Texture {
    const sub = new Texture({
      source: baseTexture.source,
      frame: new Rectangle(x, y, Math.max(1, w), Math.max(1, h)),
    });
    this.frameTextures.push(sub);
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
    this.debugOverlayGraphics.position.set(-this.cameraFollowOffset.x, -this.cameraFollowOffset.y);

    this.drawStageBackdrop();
    this.drawGrid();
    this.rebuildSceneDisplayObjects();
    this.drawStageBorder();
    this.drawSelectionAndGizmos();
    if (
      this.mode === 'preview' &&
      (this.currentParticles.length > 0 || this.currentEmitterParticles.length > 0)
    ) {
      this.drawParticles();
    }
    this.drawDebugColliders();
    this.drawTransitionOverlay();

    this.app.render();
  }

  private drawDebugColliders(): void {
    const g = this.debugOverlayGraphics;
    g.clear();
    if (!this.showDebugColliders || !this.currentScene) return;

    const invZoom = 1 / Math.max(this.currentCamera.zoom, 0.25);

    for (const obj of this.currentScene.objects) {
      if (!obj.visible) continue;
      if (obj.type === 'tilemap' && obj.tilemap) {
        const hasSolid = obj.components.some((c) => c.enabled && c.type === 'solid');
        if (!hasSolid) continue;
        const tm = obj.tilemap;
        const tw = tm.tileWidth * obj.transform.scaleX;
        const th = tm.tileHeight * obj.transform.scaleY;
        const ox = obj.transform.x - tm.cols * tw * obj.transform.anchorX;
        const oy = obj.transform.y - tm.rows * th * obj.transform.anchorY;
        for (const key of Object.keys(tm.cells)) {
          const [cs, rs] = key.split(',');
          const l = ox + Number(cs) * tw;
          const t = oy + Number(rs) * th;
          g.rect(l, t, tw, th);
          g.stroke({ width: 1.2 * invZoom, color: 0x22c55e, alpha: 0.7 });
        }
        continue;
      }

      const cols = getWorldColliders(obj);
      for (const col of cols) {
        const color =
          col.layer === 'UI' ? 0xa855f7 : col.isSensor ? 0xf59e0b : 0x22c55e;
        if (col.kind === 'circle') {
          g.circle(col.cx, col.cy, col.radius);
        } else {
          g.rect(col.left, col.top, col.right - col.left, col.bottom - col.top);
        }
        g.fill({ color, alpha: 0.12 });
        g.stroke({ width: 1.5 * invZoom, color, alpha: 0.9 });
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
      const alpha = Math.max(0, pt.alpha * (1 - t));
      const radius = Math.max(1, pt.sizeStart + (pt.sizeEnd - pt.sizeStart) * t);
      const color = parseHexColor(t < 0.5 ? pt.colorStart : pt.colorEnd, 0xf97316);
      const px = pt.x - this.cameraFollowOffset.x;
      const py = pt.y - this.cameraFollowOffset.y;
      g.circle(px, py, radius);
      g.fill({ color, alpha });
    }
  }

  private drawStageBackdrop(): void {
    const g = this.stageBackdrop;
    g.clear();
    const { width, height } = this.currentStage;
    const bgHex = parseHexColor(this.currentBgColor, 0x131b2e);
    g.rect(0, 0, width, height);
    g.fill({ color: bgHex, alpha: 1 });
  }

  private drawGrid(): void {
    const g = this.gridGraphics;
    g.clear();
    if (this.mode === 'preview' || !this.currentScene?.gridVisible) return;

    const { width, height } = this.currentStage;
    const step = Math.max(8, this.currentScene.gridSize || 32);

    for (let gx = step; gx < width; gx += step) {
      const isMajor = gx % (step * 4) === 0;
      g.moveTo(gx, 0);
      g.lineTo(gx, height);
      g.stroke({
        width: (isMajor ? 1.2 : 0.8) / Math.max(this.currentCamera.zoom, 0.25),
        color: 0xffffff,
        alpha: isMajor ? 0.1 : 0.045,
      });
    }

    for (let gy = step; gy < height; gy += step) {
      const isMajor = gy % (step * 4) === 0;
      g.moveTo(0, gy);
      g.lineTo(width, gy);
      g.stroke({
        width: (isMajor ? 1.2 : 0.8) / Math.max(this.currentCamera.zoom, 0.25),
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

  private rebuildSceneDisplayObjects(): void {
    const removed = this.sceneRoot.removeChildren();
    for (const child of removed) {
      child.destroy({ children: true, texture: false, textureSource: false });
    }
    this.clearFrameTextures();

    if (!this.currentScene) return;
    const objects = this.currentScene.objects;
    const displayMap = new Map<string, Container>();

    for (const obj of objects) {
      const node = this.createDisplayObject(obj);
      node.position.set(obj.transform.x, obj.transform.y);
      node.rotation = degToRad(obj.transform.rotation);
      const squash = this.mode === 'preview' ? this.currentVisualSquash?.get(obj.id) : undefined;
      node.scale.set(
        obj.transform.scaleX * (squash?.sx ?? 1) * (obj.sprite?.flipX ? -1 : 1),
        obj.transform.scaleY * (squash?.sy ?? 1) * (obj.sprite?.flipY ? -1 : 1)
      );
      node.alpha = Math.max(0, Math.min(1, obj.opacity));
      node.visible = obj.visible;

      if (this.mode === 'preview') {
        const flash = this.currentFlashTimers?.get(obj.id);
        if (flash) {
          const flG = new Graphics();
          const { width, height, anchorX, anchorY } = obj.transform;
          flG.rect(-width * anchorX, -height * anchorY, width, height);
          flG.fill({ color: parseHexColor(flash.color, 0xffffff), alpha: 0.65 });
          node.addChild(flG);
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
          const topY = -obj.transform.height * obj.transform.anchorY - offY;
          const ratio = Math.max(0, Math.min(1, body.health / body.maxHealth));
          const hpG = new Graphics();
          hpG.roundRect(-barW * 0.5, topY - 6, barW, 6, 2);
          hpG.fill({ color: 0x0f172a, alpha: 0.85 });
          if (ratio > 0) {
            hpG.roundRect(-barW * 0.5 + 1, topY - 5, Math.max(2, (barW - 2) * ratio), 4, 1);
            hpG.fill({ color: parseHexColor(String(hpBarComp.config.fillColor ?? '#22c55e'), 0x22c55e), alpha: 1 });
          }
          node.addChild(hpG);
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
        const entry = obj.sprite?.assetId
          ? this.textureCache.get(obj.sprite.assetId)
          : undefined;
        if (entry) {
          entry.texture.source.scaleMode =
            obj.sprite?.sampling === 'nearest' ? 'nearest' : 'linear';

          let activeTexture = entry.texture;
          const anim = obj.sprite?.animation;
          if (anim?.enabled) {
            const cols = Math.max(1, anim.cols);
            const rows = Math.max(1, anim.rows);
            const activeClipObj =
              anim.clips && anim.clips.length > 0
                ? anim.clips.find((c) => c.name === anim.activeClip) ?? anim.clips[0]
                : undefined;

            const startFrame = activeClipObj ? Math.max(0, activeClipObj.startFrame) : 0;
            const total = activeClipObj
              ? Math.max(1, Math.min(activeClipObj.frameCount, cols * rows - startFrame))
              : Math.max(1, Math.min(anim.frameCount, cols * rows));
            const fps = activeClipObj ? activeClipObj.fps : anim.fps;
            const loop = activeClipObj ? activeClipObj.loop : anim.loop;

            let localIdx = 0;
            if (anim.playing && this.animationElapsed > 0) {
              const rawFrame = Math.floor(this.animationElapsed * Math.max(1, fps));
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

    for (const entry of this.textureCache.values()) {
      entry.texture.destroy(true);
      URL.revokeObjectURL(entry.objectUrl);
    }
    this.textureCache.clear();
    this.loadingAssets.clear();

    if (this.app) {
      this.app.destroy({ removeView: true }, { children: true, texture: false, textureSource: false });
      this.app = null;
    }
  }
}
