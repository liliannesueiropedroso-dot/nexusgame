/**
 * Sistema de Partículas con Object Pooling pre-asignado (cero asignación de memoria por fotograma).
 * Soporta texturas PNG transparentes, spritesheets (cols/rows), curvas de color/escala/opacidad,
 * velocidad de rotación y emisión tanto 2D como 3D.
 */

import type { ParticleEmitterConfig } from '../core/types';

export function sampleVfxCurve(
  curve: number[] | undefined,
  t: number,
  fallbackStart: number,
  fallbackEnd: number
): number {
  const clamped = Math.max(0, Math.min(1, t));
  if (curve && curve.length >= 2) {
    const scaled = clamped * (curve.length - 1);
    const i0 = Math.min(curve.length - 2, Math.floor(scaled));
    const f = scaled - i0;
    const v0 = curve[i0] ?? 1;
    const v1 = curve[i0 + 1] ?? v0;
    const mult = v0 + (v1 - v0) * f;
    return fallbackStart * mult;
  }
  return fallbackStart + (fallbackEnd - fallbackStart) * clamped;
}

export interface PooledParticle {
  active: boolean;
  emitterId: string;
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  age: number;
  lifetime: number;
  sizeStart: number;
  sizeEnd: number;
  size: number;
  colorStart: string;
  colorEnd: string;
  alphaStart: number;
  alphaEnd: number;
  alpha: number;
  rotationDeg: number;
  rotationSpeed: number;
  textureAssetId: string | null;
  cols: number;
  rows: number;
  spritesheetFps: number;
  additive: boolean;
  drag: number;
  turbulence: number;
  particleShape: string;
  sizeCurve?: number[];
  alphaCurve?: number[];
  speedCurve?: number[];
}

export class ParticlePool {
  readonly capacity: number;
  readonly items: PooledParticle[];
  private cursor = 0;

  constructor(capacity = 800) {
    this.capacity = Math.max(32, capacity);
    this.items = Array.from({ length: this.capacity }, () => ({
      active: false,
      emitterId: '',
      x: 0,
      y: 0,
      z: 0,
      vx: 0,
      vy: 0,
      vz: 0,
      age: 0,
      lifetime: 1,
      sizeStart: 10,
      sizeEnd: 2,
      size: 10,
      colorStart: '#fbbf24',
      colorEnd: '#ef4444',
      alphaStart: 1,
      alphaEnd: 0,
      alpha: 1,
      rotationDeg: 0,
      rotationSpeed: 0,
      textureAssetId: null,
      cols: 1,
      rows: 1,
      spritesheetFps: 12,
      additive: false,
      drag: 0,
      turbulence: 0,
      particleShape: 'circle',
    }));
  }

  private allocateSlot(): PooledParticle {
    for (let i = 0; i < this.capacity; i++) {
      const idx = (this.cursor + i) % this.capacity;
      if (!this.items[idx].active) {
        this.cursor = (idx + 1) % this.capacity;
        return this.items[idx];
      }
    }
    const slot = this.items[this.cursor];
    this.cursor = (this.cursor + 1) % this.capacity;
    return slot;
  }

  spawnOne(
    emitterId: string,
    x: number,
    y: number,
    z: number,
    cfg: ParticleEmitterConfig,
    is3D = false
  ): void {
    const slot = this.allocateSlot();
    const baseAngle = (cfg.angleDeg * Math.PI) / 180;
    const spreadRad = ((cfg.spreadDeg ?? 30) * Math.PI) / 180;
    const theta = baseAngle + (Math.random() - 0.5) * spreadRad;
    const speed =
      (cfg.speedMin ?? 40) +
      Math.random() * Math.max(0, (cfg.speedMax ?? 120) - (cfg.speedMin ?? 40));

    let ox = 0;
    let oy = 0;
    let oz = 0;
    const rad = Math.max(0, cfg.emitterRadius ?? (is3D ? 0.45 : 18));
    if (cfg.emitterShape === 'ring') {
      const a = Math.random() * Math.PI * 2;
      ox = Math.cos(a) * rad;
      if (is3D) oz = Math.sin(a) * rad;
      else oy = Math.sin(a) * rad;
    } else if (cfg.emitterShape === 'sphere') {
      const a = Math.random() * Math.PI * 2;
      const r = Math.sqrt(Math.random()) * rad;
      ox = Math.cos(a) * r;
      oy = (Math.random() - 0.5) * r;
      if (is3D) oz = Math.sin(a) * r;
    } else if (cfg.emitterShape === 'box') {
      ox = (Math.random() - 0.5) * rad * 2;
      oy = (Math.random() - 0.5) * rad * 2;
      if (is3D) oz = (Math.random() - 0.5) * rad * 2;
    }

    if (is3D) {
      const phi = Math.random() * Math.PI * 2;
      const spreadCone = Math.min(Math.PI, spreadRad) * 0.5;
      const elevation = Math.PI * 0.5 - (Math.random() - 0.5) * spreadCone;
      const horiz = Math.cos(elevation) * speed * 0.04;
      slot.vx = Math.cos(phi) * horiz;
      slot.vy = Math.sin(elevation) * speed * 0.04;
      slot.vz = Math.sin(phi) * horiz;
    } else {
      slot.vx = Math.cos(theta) * speed;
      slot.vy = Math.sin(theta) * speed;
      slot.vz = 0;
    }

    slot.active = true;
    slot.emitterId = emitterId;
    slot.x = x + ox;
    slot.y = y + oy;
    slot.z = z + oz;
    slot.age = 0;
    slot.lifetime = Math.max(0.08, cfg.lifetime || 0.8);
    slot.sizeStart = cfg.sizeStart ?? 10;
    slot.sizeEnd = cfg.sizeEnd ?? 2;
    slot.size = slot.sizeStart;
    slot.colorStart = cfg.colorStart || '#fbbf24';
    slot.colorEnd = cfg.colorEnd || '#ef4444';
    slot.alphaStart = cfg.alphaStart ?? cfg.blendAlpha ?? 0.9;
    slot.alphaEnd = cfg.alphaEnd ?? 0;
    slot.alpha = slot.alphaStart;
    slot.rotationDeg = Math.random() * 360;
    slot.rotationSpeed = cfg.rotationSpeed ?? 0;
    slot.textureAssetId = cfg.textureAssetId ?? null;
    slot.cols = Math.max(1, cfg.cols ?? 1);
    slot.rows = Math.max(1, cfg.rows ?? 1);
    slot.spritesheetFps = Math.max(1, cfg.spritesheetFps ?? 12);
    slot.additive = Boolean(cfg.additive);
    slot.drag = Math.max(0, cfg.drag ?? 0);
    slot.turbulence = Math.max(0, cfg.turbulence ?? 0);
    slot.particleShape = cfg.particleShape ?? (cfg.preset === 'liquid' || cfg.preset === 'waterfall' ? 'liquid' : 'circle');
    slot.sizeCurve = cfg.sizeCurve;
    slot.alphaCurve = cfg.alphaCurve;
    slot.speedCurve = cfg.speedCurve;
  }

  burst(
    emitterId: string,
    x: number,
    y: number,
    z: number,
    count: number,
    cfg: ParticleEmitterConfig,
    is3D = false
  ): void {
    const n = Math.min(200, Math.max(1, Math.round(count)));
    for (let i = 0; i < n; i++) {
      this.spawnOne(emitterId, x, y, z, cfg, is3D);
    }
  }

  step(dt: number, gravityY = 0, is3D = false): number {
    let activeCount = 0;
    const gFactor = is3D ? -gravityY * 0.025 : gravityY;
    for (let i = 0; i < this.capacity; i++) {
      const p = this.items[i];
      if (!p.active) continue;
      p.age += dt;
      if (p.age >= p.lifetime) {
        p.active = false;
        continue;
      }
      const t = p.age / p.lifetime;
      p.vy += gFactor * dt;
      if (p.drag > 0) {
        const damp = Math.max(0, 1 - p.drag * dt);
        p.vx *= damp;
        p.vy *= damp;
        p.vz *= damp;
      }
      if (p.turbulence > 0) {
        const turb = p.turbulence * (is3D ? 0.05 : 1);
        p.vx += Math.sin(p.age * 7.3 + i) * turb * dt;
        if (is3D) p.vz += Math.cos(p.age * 6.1 + i * 2) * turb * dt;
      }
      const spdScale = p.speedCurve && p.speedCurve.length >= 2
        ? sampleVfxCurve(p.speedCurve, t, 1, 1)
        : 1;
      p.x += p.vx * spdScale * dt;
      p.y += p.vy * spdScale * dt;
      p.z += p.vz * spdScale * dt;
      p.size = sampleVfxCurve(p.sizeCurve, t, p.sizeStart, p.sizeEnd);
      p.alpha = Math.max(0, Math.min(1, sampleVfxCurve(p.alphaCurve, t, p.alphaStart, p.alphaEnd)));
      p.rotationDeg += p.rotationSpeed * dt;
      activeCount += 1;
    }
    return activeCount;
  }

  activeCount(): number {
    let count = 0;
    for (let i = 0; i < this.capacity; i++) {
      if (this.items[i].active) count += 1;
    }
    return count;
  }

  clear(): void {
    for (let i = 0; i < this.capacity; i++) {
      this.items[i].active = false;
    }
  }
}
