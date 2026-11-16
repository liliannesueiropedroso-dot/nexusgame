import type {
  CollisionLayer,
  GameObjectData,
  ParticleEmitterConfig,
  ParticlePresetId,
  StageResolution,
  TweenEasing,
  TweenKeyframeTrack,
} from '../core/types';
import { canLayersCollide, getWorldColliders } from '../physics/collision2d';
import { moveTowards } from '../physics/characterController2d';
import type { InputState, SimulationState } from './stepGameSimulation';

export interface RuntimeParticle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  gravity: number;
  sizeStart: number;
  sizeEnd: number;
  colorStart: string;
  colorEnd: string;
  alpha: number;
  age: number;
  maxAge: number;
}

export function getParticlePresetDefaults(preset: ParticlePresetId): Partial<ParticleEmitterConfig> {
  switch (preset) {
    case 'fire':
      return {
        rate: 30,
        maxParticles: 100,
        speedMin: 40,
        speedMax: 110,
        angleDeg: -90,
        spreadDeg: 36,
        gravity: -40,
        sizeStart: 8,
        sizeEnd: 2,
        lifetime: 0.65,
        colorStart: '#facc15',
        colorEnd: '#ef4444',
        blendAlpha: 0.9,
      };
    case 'smoke':
      return {
        rate: 16,
        maxParticles: 80,
        speedMin: 20,
        speedMax: 55,
        angleDeg: -90,
        spreadDeg: 45,
        gravity: -20,
        sizeStart: 6,
        sizeEnd: 18,
        lifetime: 1.2,
        colorStart: '#94a3b8',
        colorEnd: '#334155',
        blendAlpha: 0.55,
      };
    case 'sparks':
      return {
        rate: 36,
        maxParticles: 120,
        speedMin: 120,
        speedMax: 260,
        angleDeg: -90,
        spreadDeg: 140,
        gravity: 340,
        sizeStart: 4,
        sizeEnd: 1,
        lifetime: 0.5,
        colorStart: '#fef08a',
        colorEnd: '#f97316',
        blendAlpha: 1,
      };
    case 'magic':
      return {
        rate: 24,
        maxParticles: 90,
        speedMin: 25,
        speedMax: 80,
        angleDeg: 0,
        spreadDeg: 360,
        gravity: -15,
        sizeStart: 5,
        sizeEnd: 1,
        lifetime: 0.9,
        colorStart: '#c084fc',
        colorEnd: '#38bdf8',
        blendAlpha: 0.95,
      };
    case 'dust':
      return {
        rate: 14,
        maxParticles: 60,
        speedMin: 15,
        speedMax: 45,
        angleDeg: 180,
        spreadDeg: 60,
        gravity: 25,
        sizeStart: 5,
        sizeEnd: 2,
        lifetime: 0.55,
        colorStart: '#d6d3d1',
        colorEnd: '#78716c',
        blendAlpha: 0.6,
      };
    case 'rain':
      return {
        rate: 45,
        maxParticles: 160,
        speedMin: 260,
        speedMax: 340,
        angleDeg: 95,
        spreadDeg: 8,
        gravity: 160,
        sizeStart: 3,
        sizeEnd: 3,
        lifetime: 1.1,
        colorStart: '#60a5fa',
        colorEnd: '#3b82f6',
        blendAlpha: 0.7,
      };
    case 'snow':
      return {
        rate: 20,
        maxParticles: 120,
        speedMin: 25,
        speedMax: 55,
        angleDeg: 90,
        spreadDeg: 30,
        gravity: 12,
        sizeStart: 4,
        sizeEnd: 3,
        lifetime: 2.4,
        colorStart: '#ffffff',
        colorEnd: '#cbd5e1',
        blendAlpha: 0.85,
      };
    case 'explosion':
      return {
        rate: 60,
        maxParticles: 140,
        speedMin: 90,
        speedMax: 280,
        angleDeg: 0,
        spreadDeg: 360,
        gravity: 120,
        sizeStart: 7,
        sizeEnd: 1,
        lifetime: 0.45,
        colorStart: '#fde047',
        colorEnd: '#dc2626',
        blendAlpha: 1,
      };
    default:
      return {};
  }
}

export function evaluateEasing(easing: TweenEasing, t: number): number {
  const x = Math.max(0, Math.min(1, t));
  switch (easing) {
    case 'linear':
      return x;
    case 'easeIn':
      return x * x * x;
    case 'easeOut':
      return 1 - Math.pow(1 - x, 3);
    case 'easeInOut':
      return x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2;
    case 'bounce': {
      const n1 = 7.5625;
      const d1 = 2.75;
      if (x < 1 / d1) {
        return n1 * x * x;
      } else if (x < 2 / d1) {
        const y = x - 1.5 / d1;
        return n1 * y * y + 0.75;
      } else if (x < 2.5 / d1) {
        const y = x - 2.25 / d1;
        return n1 * y * y + 0.9375;
      } else {
        const y = x - 2.625 / d1;
        return n1 * y * y + 0.984375;
      }
    }
  }
}

export function applyObjectTweens(
  obj: GameObjectData,
  dt: number,
  tweenStates: Map<string, { elapsed: number; playing: boolean }>
): void {
  if (!obj.tweens || obj.tweens.length === 0) return;
  for (const track of obj.tweens) {
    const stateKey = `${obj.id}:${track.id}`;
    let ts = tweenStates.get(stateKey);
    if (!ts) {
      ts = { elapsed: 0, playing: Boolean(track.autoPlay) };
      tweenStates.set(stateKey, ts);
    }
    if (!ts.playing) continue;

    ts.elapsed += dt;
    const delay = Math.max(0, track.delay || 0);
    if (ts.elapsed < delay) continue;

    const dur = Math.max(0.05, track.duration || 0.5);
    const activeTime = ts.elapsed - delay;
    let progress = activeTime / dur;

    if (track.pingPong) {
      const cycle = Math.floor(progress);
      const frac = progress - cycle;
      if (!track.loop && cycle >= 2) {
        progress = 0;
        ts.playing = false;
      } else {
        progress = cycle % 2 === 1 ? 1 - frac : frac;
      }
    } else if (track.loop) {
      progress = progress % 1;
    } else if (progress >= 1) {
      progress = 1;
      ts.playing = false;
    }

    const eased = evaluateEasing(track.easing, progress);
    const value = track.from + (track.to - track.from) * eased;
    applyTweenPropertyValue(obj, track, value);
  }
}

function applyTweenPropertyValue(
  obj: GameObjectData,
  track: TweenKeyframeTrack,
  value: number
): void {
  switch (track.property) {
    case 'x':
      obj.transform.x = value;
      break;
    case 'y':
      obj.transform.y = value;
      break;
    case 'scaleX':
      obj.transform.scaleX = value;
      break;
    case 'scaleY':
      obj.transform.scaleY = value;
      break;
    case 'rotation':
      obj.transform.rotation = value;
      break;
    case 'opacity':
      obj.opacity = Math.max(0, Math.min(1, value));
      break;
  }
}

export function emitParticlesFromConfig(
  state: SimulationState,
  x: number,
  y: number,
  cfg: ParticleEmitterConfig,
  count: number
): void {
  if (state.emitterParticles.length >= 420) return;
  const angleBase = (cfg.angleDeg * Math.PI) / 180;
  const spreadRad = (cfg.spreadDeg * Math.PI) / 180;
  const speedMin = Math.min(cfg.speedMin, cfg.speedMax);
  const speedMax = Math.max(cfg.speedMin, cfg.speedMax);

  for (let i = 0; i < count; i++) {
    if (state.emitterParticles.length >= Math.max(40, cfg.maxParticles + 180)) break;
    const angle = angleBase + (Math.random() - 0.5) * spreadRad;
    const speed = speedMin + Math.random() * (speedMax - speedMin);
    state.emitterParticles.push({
      x,
      y,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      gravity: cfg.gravity,
      sizeStart: cfg.sizeStart,
      sizeEnd: cfg.sizeEnd,
      colorStart: cfg.colorStart,
      colorEnd: cfg.colorEnd,
      alpha: cfg.blendAlpha,
      age: 0,
      maxAge: Math.max(0.08, cfg.lifetime * (0.85 + Math.random() * 0.3)),
    });
  }
}

export function stepEmitterParticles(state: SimulationState, dt: number): void {
  for (const obj of state.scene.objects) {
    if (!obj.visible) continue;
    const emitters: ParticleEmitterConfig[] = [];
    if (obj.particleEmitter?.enabled) {
      emitters.push(obj.particleEmitter);
    }
    for (const comp of obj.components) {
      if (comp.enabled && comp.type === 'juice.particle_emitter') {
        const preset = String(comp.config.preset ?? 'fire') as ParticlePresetId;
        const base = getParticlePresetDefaults(preset);
        emitters.push({
          enabled: true,
          preset,
          rate: Number(comp.config.rate ?? base.rate ?? 20),
          maxParticles: 100,
          speedMin: Number(comp.config.speed ?? base.speedMin ?? 50) * 0.7,
          speedMax: Number(comp.config.speed ?? base.speedMax ?? 100) * 1.2,
          angleDeg: base.angleDeg ?? -90,
          spreadDeg: base.spreadDeg ?? 45,
          gravity: base.gravity ?? 0,
          sizeStart: Number(comp.config.size ?? base.sizeStart ?? 5),
          sizeEnd: base.sizeEnd ?? 1,
          lifetime: Number(comp.config.lifetime ?? base.lifetime ?? 0.7),
          colorStart: String(comp.config.color ?? base.colorStart ?? '#f97316'),
          colorEnd: base.colorEnd ?? String(comp.config.color ?? '#ef4444'),
          blendAlpha: base.blendAlpha ?? 0.85,
        });
      }
    }

    for (let idx = 0; idx < emitters.length; idx++) {
      const em = emitters[idx];
      const key = `em:${obj.id}:${idx}`;
      const acc = (state.runtimeTimers.get(key) ?? 0) + dt * Math.max(0.5, em.rate);
      const count = Math.floor(acc);
      state.runtimeTimers.set(key, acc - count);
      if (count > 0) {
        emitParticlesFromConfig(state, obj.transform.x, obj.transform.y, em, Math.min(12, count));
      }
    }
  }

  if (state.emitterParticles.length > 0) {
    const alive: RuntimeParticle[] = [];
    for (const pt of state.emitterParticles) {
      pt.age += dt;
      if (pt.age >= pt.maxAge) continue;
      pt.vy += pt.gravity * dt;
      pt.x += pt.vx * dt;
      pt.y += pt.vy * dt;
      alive.push(pt);
    }
    state.emitterParticles = alive;
  }
}

export function spawnRuntimeProjectile(
  state: SimulationState,
  objectMap: Map<string, GameObjectData>,
  owner: GameObjectData,
  vx: number,
  vy: number,
  damage: number,
  color: string,
  layer: 'Projectile' | 'Enemy',
  homingTag?: string
): void {
  const id = `proj_${Math.random().toString(36).slice(2, 9)}`;
  const proj: GameObjectData = {
    id,
    name: `Proyectil_${state.scene.objects.length + 1}`,
    type: 'circle',
    parentId: null,
    visible: true,
    locked: false,
    opacity: 1,
    layer,
    tags: layer === 'Enemy' ? ['EnemyProjectile'] : ['PlayerProjectile'],
    transform: {
      x: owner.transform.x + (vx >= 0 ? 18 : -18),
      y: owner.transform.y,
      rotation: (Math.atan2(vy, vx) * 180) / Math.PI,
      scaleX: 1,
      scaleY: 1,
      width: 14,
      height: 14,
      anchorX: 0.5,
      anchorY: 0.5,
    },
    circle: {
      fillColor: color,
      strokeColor: '#ffffff',
      strokeWidth: 1.5,
      radius: 7,
    },
    components: [
      {
        id: `${id}_p`,
        type: 'projectile',
        enabled: true,
        config: { vx, vy, damage, lifetimeSec: 2.5, destroyOnSolid: true, ownerId: owner.id },
      },
      ...(homingTag
        ? [
            {
              id: `${id}_h`,
              type: 'combat.homing_missile',
              enabled: true,
              config: {
                speed: Math.hypot(vx, vy) || 320,
                turnRate: 6,
                targetTag: homingTag,
                damage,
              },
            },
          ]
        : []),
    ],
  };
  state.scene.objects.push(proj);
  objectMap.set(proj.id, proj);
  state.bodies.set(proj.id, {
    vx,
    vy,
    ax: 0,
    ay: 0,
    grounded: false,
    coyoteTimer: 0,
    jumpBufferTimer: 0,
    jumpsUsed: 0,
    originX: proj.transform.x,
    originY: proj.transform.y,
    patrolPhase: 0,
    waypointIndex: 0,
    health: 1,
    maxHealth: 1,
    invulnerableTimer: 0,
    lifetimeRemaining: 2.5,
  });
}

export function cloneTemplateObject(
  state: SimulationState,
  objectMap: Map<string, GameObjectData>,
  template: GameObjectData,
  x: number,
  y: number
): GameObjectData {
  const clone = structuredClone(template);
  clone.id = `clone_${Math.random().toString(36).slice(2, 9)}`;
  clone.name = `${template.name}_${state.scene.objects.length + 1}`;
  clone.visible = true;
  clone.transform.x = x;
  clone.transform.y = y;
  state.scene.objects.push(clone);
  objectMap.set(clone.id, clone);
  const healthComp = clone.components.find((c) => c.enabled && (c.type === 'health' || c.type === 'combat.health_system'));
  const maxHp = Number(healthComp?.config.maxHp ?? 100);
  state.bodies.set(clone.id, {
    vx: 0,
    vy: 0,
    ax: 0,
    ay: 0,
    grounded: false,
    coyoteTimer: 0,
    jumpBufferTimer: 0,
    jumpsUsed: 0,
    originX: x,
    originY: y,
    patrolPhase: 0,
    waypointIndex: 0,
    health: maxHp,
    maxHealth: maxHp,
    invulnerableTimer: 0,
  });
  return clone;
}

export function applyDamageToObject(
  state: SimulationState,
  target: GameObjectData,
  damage: number,
  invulnSec = 0.35
): boolean {
  const body = state.bodies.get(target.id);
  if (!body || body.invulnerableTimer > 0) return false;
  // Escudo activo bloquea daño
  if (target.components.some((c) => c.enabled && c.type === 'combat.shield_block' && c.config._active)) {
    return false;
  }
  body.health = Math.max(0, body.health - Math.max(0, damage));
  body.invulnerableTimer = invulnSec;
  if (target.components.some((c) => c.enabled && (c.type === 'player_platformer' || c.type === 'player_topdown' || c.type === 'movement.platformer_pro' || c.type === 'movement.topdown_8dir' || c.type === 'movement.vehicle_drift'))) {
    state.variables.set('salud', body.health);
  }
  if (target.components.some((c) => c.enabled && c.type === 'juice.hit_flash')) {
    state.flashTimers.set(target.id, { color: '#ffffff', remaining: 0.14 });
  }
  const shakeComp = target.components.find((c) => c.enabled && c.type === 'juice.screen_shake');
  if (shakeComp) {
    state.shakeIntensity = Math.max(state.shakeIntensity, Number(shakeComp.config.intensity ?? 8));
    state.shakeTimeRemaining = Math.max(state.shakeTimeRemaining, Number(shakeComp.config.duration ?? 0.25));
  }
  if (body.health <= 0) {
    const drop = target.components.find((c) => c.enabled && c.type === 'economy.currency_drop');
    if (drop) {
      const vn = String(drop.config.variable ?? 'puntos');
      const amt = Number(drop.config.amount ?? 25);
      const cur = Number(state.variables.get(vn) ?? 0) || 0;
      state.variables.set(vn, cur + amt);
      if (vn === 'puntos') state.score = cur + amt;
    }
    const hpSys = target.components.find((c) => c.enabled && c.type === 'combat.health_system');
    if (!hpSys || hpSys.config.destroyOnZero !== false) {
      target.visible = false;
    }
  }
  return true;
}

export function stepExtendedObjectBehavior(params: {
  obj: GameObjectData;
  comp: GameObjectData['components'][number];
  state: SimulationState;
  objectMap: Map<string, GameObjectData>;
  players: GameObjectData[];
  input: InputState;
  hasKey: (code: string, inp: InputState) => boolean;
  wasKey: (code: string) => boolean;
  solids: Array<{ left: number; right: number; top: number; bottom: number; layer: CollisionLayer; mask?: CollisionLayer[] }>;
  resolveHorizontal: (o: GameObjectData) => void;
  resolveVertical: (o: GameObjectData) => void;
  dt: number;
  stage: StageResolution;
}): void {
  const {
    obj,
    comp,
    state,
    objectMap,
    players,
    input,
    hasKey,
    wasKey,
    solids,
    resolveHorizontal,
    resolveVertical,
    dt,
    stage,
  } = params;
  const body = state.bodies.get(obj.id);
  if (!body) return;
  const cfg = comp.config;

  switch (comp.type) {
    case 'movement.sine_float': {
      const amp = Number(cfg.amplitude ?? 14);
      const freq = Number(cfg.frequency ?? 1.2);
      const phase = state.elapsed * freq * Math.PI * 2;
      if (cfg.axis === 'x') {
        obj.transform.x = body.originX + Math.sin(phase) * amp;
      } else {
        obj.transform.y = body.originY + Math.sin(phase) * amp;
      }
      break;
    }

    case 'movement.orbit': {
      const radius = Number(cfg.radius ?? 80);
      const angSpeed = (Number(cfg.angularSpeed ?? 140) * Math.PI) / 180;
      body.patrolPhase += angSpeed * dt;
      let cx = body.originX;
      let cy = body.originY;
      const tag = String(cfg.targetTag ?? '').trim();
      if (tag) {
        const centerObj = state.scene.objects.find(
          (o) => o.visible && o.id !== obj.id && (o.tags?.includes(tag) || o.name === tag)
        );
        if (centerObj) {
          cx = centerObj.transform.x;
          cy = centerObj.transform.y;
        }
      }
      obj.transform.x = cx + Math.cos(body.patrolPhase) * radius;
      obj.transform.y = cy + Math.sin(body.patrolPhase) * radius;
      break;
    }

    case 'movement.follow_mouse': {
      if (input.pointerX !== undefined && input.pointerY !== undefined) {
        const speed = Number(cfg.speed ?? 320);
        const stopDist = Number(cfg.stopDistance ?? 6);
        const dx = input.pointerX - obj.transform.x;
        const dy = input.pointerY - obj.transform.y;
        const dist = Math.hypot(dx, dy);
        if (dist > stopDist) {
          if (speed <= 0) {
            obj.transform.x = input.pointerX;
            obj.transform.y = input.pointerY;
          } else {
            const step = Math.min(dist, speed * dt);
            obj.transform.x += (dx / dist) * step;
            obj.transform.y += (dy / dist) * step;
          }
        }
      }
      break;
    }

    case 'movement.look_at_mouse': {
      if (input.pointerX !== undefined && input.pointerY !== undefined) {
        const angle = Math.atan2(input.pointerY - obj.transform.y, input.pointerX - obj.transform.x);
        obj.transform.rotation = (angle * 180) / Math.PI + Number(cfg.offsetDeg ?? 0);
      }
      break;
    }

    case 'movement.constant_velocity': {
      const vx = Number(cfg.vx ?? -120);
      const vy = Number(cfg.vy ?? 0);
      body.vx = vx;
      body.vy = vy;
      obj.transform.x += vx * dt;
      obj.transform.y += vy * dt;
      break;
    }

    case 'movement.screen_wrap': {
      const margin = Number(cfg.margin ?? 24);
      if (obj.transform.x < -margin) obj.transform.x = stage.width + margin;
      else if (obj.transform.x > stage.width + margin) obj.transform.x = -margin;
      if (obj.transform.y < -margin) obj.transform.y = stage.height + margin;
      else if (obj.transform.y > stage.height + margin) obj.transform.y = -margin;
      break;
    }

    case 'movement.keep_in_bounds': {
      const pad = Number(cfg.padding ?? 16);
      const halfW = Math.abs(obj.transform.width * obj.transform.scaleX) * 0.5;
      const halfH = Math.abs(obj.transform.height * obj.transform.scaleY) * 0.5;
      obj.transform.x = Math.max(pad + halfW, Math.min(stage.width - pad - halfW, obj.transform.x));
      obj.transform.y = Math.max(pad + halfH, Math.min(stage.height - pad - halfH, obj.transform.y));
      break;
    }

    case 'movement.path_waypoints': {
      const raw = String(cfg.waypoints ?? '');
      const points = raw
        .split(';')
        .map((pair) => pair.split(',').map((n) => Number(n.trim())))
        .filter((arr) => arr.length >= 2 && Number.isFinite(arr[0]) && Number.isFinite(arr[1]));
      if (points.length >= 2) {
        const speed = Math.max(5, Number(cfg.speed ?? 140));
        const idx = Math.max(0, Math.min(points.length - 1, body.waypointIndex));
        const targetPt = points[idx];
        const dx = targetPt[0] - obj.transform.x;
        const dy = targetPt[1] - obj.transform.y;
        const dist = Math.hypot(dx, dy);
        if (dist <= speed * dt + 2) {
          obj.transform.x = targetPt[0];
          obj.transform.y = targetPt[1];
          const forward = body.waypointForward !== false;
          if (cfg.pingPong) {
            if (forward) {
              if (idx + 1 >= points.length) {
                body.waypointForward = false;
                body.waypointIndex = Math.max(0, idx - 1);
              } else {
                body.waypointIndex = idx + 1;
              }
            } else {
              if (idx - 1 < 0) {
                body.waypointForward = true;
                body.waypointIndex = Math.min(points.length - 1, 1);
              } else {
                body.waypointIndex = idx - 1;
              }
            }
          } else {
            body.waypointIndex = (idx + 1) % points.length;
          }
        } else {
          body.vx = (dx / dist) * speed;
          body.vy = (dy / dist) * speed;
          obj.transform.x += body.vx * dt;
          obj.transform.y += body.vy * dt;
          if (cfg.rotateToPath) {
            obj.transform.rotation = (Math.atan2(dy, dx) * 180) / Math.PI;
          }
        }
      }
      break;
    }

    case 'movement.elastic_bounce': {
      if (!body.customInitialized) {
        body.vx = Number(cfg.vx ?? 240);
        body.vy = Number(cfg.vy ?? 190);
        body.customInitialized = true;
      }
      const rest = Number(cfg.restitution ?? 1.0);
      obj.transform.x += body.vx * dt;
      const colsX = getWorldColliders(obj);
      for (const sc of solids) {
        if (colsX.some((c) => !c.isSensor && canLayersCollide(c.layer, sc.layer ?? 'World', c.mask, sc.mask) && c.left < sc.right && c.right > sc.left && c.top < sc.bottom && c.bottom > sc.top)) {
          obj.transform.x -= body.vx * dt;
          body.vx = -body.vx * rest;
          break;
        }
      }
      obj.transform.y += body.vy * dt;
      const colsY = getWorldColliders(obj);
      for (const sc of solids) {
        if (colsY.some((c) => !c.isSensor && canLayersCollide(c.layer, sc.layer ?? 'World', c.mask, sc.mask) && c.left < sc.right && c.right > sc.left && c.top < sc.bottom && c.bottom > sc.top)) {
          obj.transform.y -= body.vy * dt;
          body.vy = -body.vy * rest;
          break;
        }
      }
      if (cfg.bounceStageEdges !== false) {
        const hw = Math.abs(obj.transform.width * obj.transform.scaleX) * 0.5;
        const hh = Math.abs(obj.transform.height * obj.transform.scaleY) * 0.5;
        if (obj.transform.x - hw < 0) {
          obj.transform.x = hw;
          body.vx = Math.abs(body.vx) * rest;
        } else if (obj.transform.x + hw > stage.width) {
          obj.transform.x = stage.width - hw;
          body.vx = -Math.abs(body.vx) * rest;
        }
        if (obj.transform.y - hh < 0) {
          obj.transform.y = hh;
          body.vy = Math.abs(body.vy) * rest;
        } else if (obj.transform.y + hh > stage.height) {
          obj.transform.y = stage.height - hh;
          body.vy = -Math.abs(body.vy) * rest;
        }
      }
      break;
    }

    case 'movement.vehicle_drift': {
      const accel = Number(cfg.accelerateSpeed ?? 520);
      const maxSpd = Number(cfg.maxSpeed ?? 380);
      const turnSpd = Number(cfg.turnSpeed ?? 200);
      const drift = Math.max(0.02, Math.min(1, Number(cfg.driftFactor ?? 0.18)));
      const drag = Number(cfg.drag ?? 1.4);

      const steer = (hasKey('ArrowRight', input) || hasKey('KeyD', input) ? 1 : 0) - (hasKey('ArrowLeft', input) || hasKey('KeyA', input) ? 1 : 0);
      const throttle = (hasKey('ArrowUp', input) || hasKey('KeyW', input) ? 1 : 0) - (hasKey('ArrowDown', input) || hasKey('KeyS', input) ? 0.6 : 0);

      obj.transform.rotation = (obj.transform.rotation + steer * turnSpd * dt) % 360;
      const rad = (obj.transform.rotation * Math.PI) / 180;
      const fx = Math.cos(rad);
      const fy = Math.sin(rad);

      body.vx += fx * throttle * accel * dt;
      body.vy += fy * throttle * accel * dt;

      // Cancelar velocidad lateral según agarre (driftFactor)
      const rx = -fy;
      const ry = fx;
      const forwardSpeed = body.vx * fx + body.vy * fy;
      const lateralSpeed = body.vx * rx + body.vy * ry;
      const dampedLateral = lateralSpeed * Math.max(0, 1 - drift * 10 * dt);
      body.vx = fx * forwardSpeed + rx * dampedLateral;
      body.vy = fy * forwardSpeed + ry * dampedLateral;

      const damp = Math.max(0, 1 - drag * dt);
      body.vx *= damp;
      body.vy *= damp;

      const speed = Math.hypot(body.vx, body.vy);
      if (speed > maxSpd) {
        body.vx = (body.vx / speed) * maxSpd;
        body.vy = (body.vy / speed) * maxSpd;
      }

      obj.transform.x += body.vx * dt;
      resolveHorizontal(obj);
      obj.transform.y += body.vy * dt;
      resolveVertical(obj);
      break;
    }

    case 'movement.topdown_8dir': {
      const baseSpeed = Number(cfg.maxSpeed ?? 220);
      const sprintKey = String(cfg.sprintKey ?? 'ShiftLeft');
      const sprintMul = hasKey(sprintKey, input) ? Number(cfg.sprintMultiplier ?? 1.6) : 1;
      const maxSpd = baseSpeed * sprintMul;
      const accel = Number(cfg.acceleration ?? 1600);
      const decel = Number(cfg.deceleration ?? 2000);

      let mx = (hasKey('ArrowRight', input) || hasKey('KeyD', input) || input.right ? 1 : 0) - (hasKey('ArrowLeft', input) || hasKey('KeyA', input) || input.left ? 1 : 0);
      let my = (hasKey('ArrowDown', input) || hasKey('KeyS', input) || input.down ? 1 : 0) - (hasKey('ArrowUp', input) || hasKey('KeyW', input) || input.up ? 1 : 0);
      if (mx !== 0 && my !== 0) {
        const inv = 1 / Math.SQRT2;
        mx *= inv;
        my *= inv;
      }
      body.vx = moveTowards(body.vx, mx * maxSpd, (mx !== 0 ? accel : decel) * dt);
      body.vy = moveTowards(body.vy, my * maxSpd, (my !== 0 ? accel : decel) * dt);
      if (cfg.rotateToMovement && (Math.abs(mx) > 0.01 || Math.abs(my) > 0.01)) {
        obj.transform.rotation = (Math.atan2(my, mx) * 180) / Math.PI;
      }
      obj.transform.x += body.vx * dt;
      resolveHorizontal(obj);
      obj.transform.y += body.vy * dt;
      resolveVertical(obj);
      break;
    }

    case 'movement.dash': {
      const key = String(cfg.key ?? 'ShiftLeft');
      const cdKey = `dash_cd:${obj.id}`;
      const activeKey = `dash_act:${obj.id}`;
      const cd = Math.max(0, (state.runtimeTimers.get(cdKey) ?? 0) - dt);
      const active = Math.max(0, (state.runtimeTimers.get(activeKey) ?? 0) - dt);
      state.runtimeTimers.set(cdKey, cd);
      state.runtimeTimers.set(activeKey, active);

      if (hasKey(key, input) && !wasKey(key) && cd <= 0 && active <= 0) {
        const dirX = (input.right ? 1 : 0) - (input.left ? 1 : 0) || (obj.sprite?.flipX ? -1 : 1);
        const dirY = (input.down ? 1 : 0) - (input.up ? 1 : 0);
        const len = Math.hypot(dirX, dirY) || 1;
        const spd = Number(cfg.speed ?? 580);
        body.vx = (dirX / len) * spd;
        body.vy = (dirY / len) * spd;
        state.runtimeTimers.set(activeKey, Number(cfg.duration ?? 0.15));
        state.runtimeTimers.set(cdKey, Number(cfg.cooldown ?? 0.6));
      }
      break;
    }

    case 'movement.double_jump': {
      const jumpKey = String(cfg.jumpKey ?? 'Space');
      const maxExtra = Math.max(1, Number(cfg.extraJumps ?? 1));
      const usedKey = `dj_used:${obj.id}`;
      if (body.grounded) {
        state.runtimeTimers.set(usedKey, 0);
      } else if (hasKey(jumpKey, input) && !wasKey(jumpKey)) {
        const used = state.runtimeTimers.get(usedKey) ?? 0;
        if (used < maxExtra) {
          body.vy = -Number(cfg.jumpForce ?? 460);
          state.runtimeTimers.set(usedKey, used + 1);
        }
      }
      break;
    }

    case 'movement.moving_platform': {
      const axis = cfg.axis === 'y' ? 'y' : 'x';
      const dist = Number(cfg.distance ?? 160);
      const spd = Number(cfg.speed ?? 100);
      const omega = dist > 0 ? spd / dist : 0;
      body.patrolPhase += omega * dt;
      const prevX = obj.transform.x;
      const prevY = obj.transform.y;
      if (axis === 'x') {
        obj.transform.x = body.originX + Math.sin(body.patrolPhase) * dist;
      } else {
        obj.transform.y = body.originY + Math.sin(body.patrolPhase) * dist;
      }
      const dx = obj.transform.x - prevX;
      const dy = obj.transform.y - prevY;
      // Arrastrar jugadores que están apoyados encima
      const pBox = getWorldColliders(obj)[0];
      if (pBox) {
        for (const pl of players) {
          const plBox = getWorldColliders(pl)[0];
          if (!plBox) continue;
          const horiz = plBox.right > pBox.left && plBox.left < pBox.right;
          const onTop = Math.abs(plBox.bottom - pBox.top) <= 10;
          if (horiz && onTop) {
            pl.transform.x += dx;
            pl.transform.y += dy;
          }
        }
      }
      break;
    }

    case 'movement.conveyor': {
      const pushX = Number(cfg.speedX ?? 140);
      const cBox = getWorldColliders(obj)[0];
      if (cBox) {
        for (const pl of players) {
          const plBox = getWorldColliders(pl)[0];
          if (!plBox) continue;
          if (plBox.right > cBox.left && plBox.left < cBox.right && Math.abs(plBox.bottom - cBox.top) <= 10) {
            pl.transform.x += pushX * dt;
          }
        }
      }
      break;
    }

    case 'movement.gravity_zone': {
      const force = Number(cfg.gravityForce ?? -650);
      const zCols = getWorldColliders(obj);
      for (const pl of players) {
        const plCols = getWorldColliders(pl);
        const inside = plCols.some((pc) => zCols.some((zc) => pc.left < zc.right && pc.right > zc.left && pc.top < zc.bottom && pc.bottom > zc.top));
        if (inside) {
          const pb = state.bodies.get(pl.id);
          if (pb) pb.vy += force * dt;
        }
      }
      break;
    }

    case 'ai.enemy_chaser': {
      if (players.length > 0) {
        const spd = Number(cfg.speed ?? 145);
        const rad = Number(cfg.detectRadius ?? 480);
        const dmg = Number(cfg.contactDamage ?? 15);
        const target = players[0];
        const dx = target.transform.x - obj.transform.x;
        const dy = target.transform.y - obj.transform.y;
        const dist = Math.hypot(dx, dy);
        if (dist <= rad && dist > 4) {
          body.vx = (dx / dist) * spd;
          body.vy = (dy / dist) * spd;
          obj.transform.x += body.vx * dt;
          if (cfg.respectSolids !== false) resolveHorizontal(obj);
          obj.transform.y += body.vy * dt;
          if (cfg.respectSolids !== false) resolveVertical(obj);
          if (obj.sprite) obj.sprite.flipX = dx < 0;
        }
        if (dmg > 0 && dist < (obj.transform.width + target.transform.width) * 0.45) {
          applyDamageToObject(state, target, dmg, 0.5);
        }
      }
      break;
    }

    case 'ai.turret_shooter': {
      if (players.length > 0) {
        const range = Number(cfg.range ?? 450);
        const fireRate = Math.max(0.1, Number(cfg.fireRateSec ?? 1.4));
        const pSpd = Number(cfg.projectileSpeed ?? 340);
        const dmg = Number(cfg.damage ?? 15);
        const color = String(cfg.projectileColor ?? '#ef4444');
        const target = players[0];
        const dx = target.transform.x - obj.transform.x;
        const dy = target.transform.y - obj.transform.y;
        const dist = Math.hypot(dx, dy);
        const cdKey = `turret:${obj.id}`;
        const cd = Math.max(0, (state.runtimeTimers.get(cdKey) ?? 0) - dt);
        state.runtimeTimers.set(cdKey, cd);
        if (dist <= range && dist > 1) {
          if (cfg.rotateToTarget !== false) {
            obj.transform.rotation = (Math.atan2(dy, dx) * 180) / Math.PI;
          }
          if (cd <= 0) {
            state.runtimeTimers.set(cdKey, fireRate);
            spawnRuntimeProjectile(
              state,
              objectMap,
              obj,
              (dx / dist) * pSpd,
              (dy / dist) * pSpd,
              dmg,
              color,
              'Enemy'
            );
          }
        }
      }
      break;
    }

    case 'ai.fsm_enemy': {
      const patrolDist = Number(cfg.patrolDistance ?? 120);
      const patrolSpd = Number(cfg.patrolSpeed ?? 85);
      const chaseSpd = Number(cfg.chaseSpeed ?? 175);
      const detectRad = Number(cfg.detectRadius ?? 360);
      const atkRange = Number(cfg.attackRange ?? 64);
      const atkDmg = Number(cfg.attackDamage ?? 20);
      const target = players[0];
      const dist = target ? Math.hypot(target.transform.x - obj.transform.x, target.transform.y - obj.transform.y) : Infinity;

      if (target && dist <= atkRange) {
        obj.stateMachine = { currentState: 'attack', states: ['patrol', 'chase', 'attack'] };
        applyDamageToObject(state, target, atkDmg, 0.6);
      } else if (target && dist <= detectRad) {
        obj.stateMachine = { currentState: 'chase', states: ['patrol', 'chase', 'attack'] };
        const dx = target.transform.x - obj.transform.x;
        const dy = target.transform.y - obj.transform.y;
        obj.transform.x += (dx / dist) * chaseSpd * dt;
        obj.transform.y += (dy / dist) * chaseSpd * dt;
        if (obj.sprite) obj.sprite.flipX = dx < 0;
      } else {
        obj.stateMachine = { currentState: 'patrol', states: ['patrol', 'chase', 'attack'] };
        const omega = patrolDist > 0 ? patrolSpd / patrolDist : 0;
        body.patrolPhase += omega * dt;
        obj.transform.x = body.originX + Math.sin(body.patrolPhase) * patrolDist;
      }
      break;
    }

    case 'ai.flee_player': {
      if (players.length > 0) {
        const spd = Number(cfg.speed ?? 160);
        const rad = Number(cfg.fleeRadius ?? 240);
        const target = players[0];
        const dx = obj.transform.x - target.transform.x;
        const dy = obj.transform.y - target.transform.y;
        const dist = Math.hypot(dx, dy);
        if (dist < rad && dist > 1) {
          obj.transform.x += (dx / dist) * spd * dt;
          obj.transform.y += (dy / dist) * spd * dt;
          if (obj.sprite) obj.sprite.flipX = dx < 0;
        }
      }
      break;
    }

    case 'ai.charger_dash': {
      if (players.length > 0) {
        const rad = Number(cfg.detectRadius ?? 340);
        const spd = Number(cfg.chargeSpeed ?? 440);
        const dur = Number(cfg.chargeDuration ?? 0.45);
        const cooldown = Number(cfg.cooldown ?? 1.6);
        const actKey = `chg_act:${obj.id}`;
        const cdKey = `chg_cd:${obj.id}`;
        const act = Math.max(0, (state.runtimeTimers.get(actKey) ?? 0) - dt);
        const cd = Math.max(0, (state.runtimeTimers.get(cdKey) ?? 0) - dt);
        state.runtimeTimers.set(actKey, act);
        state.runtimeTimers.set(cdKey, cd);

        if (act > 0) {
          obj.transform.x += body.vx * dt;
          obj.transform.y += body.vy * dt;
        } else if (cd <= 0) {
          const target = players[0];
          const dx = target.transform.x - obj.transform.x;
          const dy = target.transform.y - obj.transform.y;
          const dist = Math.hypot(dx, dy);
          if (dist <= rad && dist > 1) {
            body.vx = (dx / dist) * spd;
            body.vy = (dy / dist) * spd;
            state.runtimeTimers.set(actKey, dur);
            state.runtimeTimers.set(cdKey, dur + cooldown);
          }
        }
      }
      break;
    }

    case 'combat.projectile_spawner': {
      const fireKey = String(cfg.fireKey ?? 'KeyJ');
      const cdKey = `fire_cd:${obj.id}`;
      const cd = Math.max(0, (state.runtimeTimers.get(cdKey) ?? 0) - dt);
      state.runtimeTimers.set(cdKey, cd);

      if (hasKey(fireKey, input) && !wasKey(fireKey) && cd <= 0) {
        const cooldown = Math.max(0.05, Number(cfg.cooldown ?? 0.25));
        state.runtimeTimers.set(cdKey, cooldown);

        let baseAngle = 0;
        const aimMode = String(cfg.aimMode ?? 'facing');
        if (aimMode === 'mouse' && input.pointerX !== undefined && input.pointerY !== undefined) {
          baseAngle = Math.atan2(input.pointerY - obj.transform.y, input.pointerX - obj.transform.x);
        } else if (aimMode === 'up') {
          baseAngle = -Math.PI / 2;
        } else if (aimMode === 'right') {
          baseAngle = 0;
        } else {
          baseAngle = obj.sprite?.flipX ? Math.PI : (obj.transform.rotation * Math.PI) / 180;
        }

        const speed = Number(cfg.projectileSpeed ?? 560);
        const dmg = Number(cfg.damage ?? 25);
        const color = String(cfg.color ?? '#facc15');
        const pattern = String(cfg.pattern ?? 'single');

        if (pattern === 'fan') {
          const count = Math.max(2, Math.min(9, Number(cfg.fanCount ?? 3)));
          const spreadRad = ((Number(cfg.spreadDeg ?? 30)) * Math.PI) / 180;
          for (let i = 0; i < count; i++) {
            const frac = count === 1 ? 0 : i / (count - 1) - 0.5;
            const ang = baseAngle + frac * spreadRad;
            spawnRuntimeProjectile(
              state,
              objectMap,
              obj,
              Math.cos(ang) * speed,
              Math.sin(ang) * speed,
              dmg,
              color,
              'Projectile'
            );
          }
        } else if (pattern === 'burst') {
          for (let i = 0; i < 3; i++) {
            const spdMul = 1 + i * 0.14;
            spawnRuntimeProjectile(
              state,
              objectMap,
              obj,
              Math.cos(baseAngle) * speed * spdMul,
              Math.sin(baseAngle) * speed * spdMul,
              dmg,
              color,
              'Projectile'
            );
          }
        } else if (pattern === 'homing') {
          spawnRuntimeProjectile(
            state,
            objectMap,
            obj,
            Math.cos(baseAngle) * speed,
            Math.sin(baseAngle) * speed,
            dmg,
            color,
            'Projectile',
            'Enemy'
          );
        } else {
          spawnRuntimeProjectile(
            state,
            objectMap,
            obj,
            Math.cos(baseAngle) * speed,
            Math.sin(baseAngle) * speed,
            dmg,
            color,
            'Projectile'
          );
        }
        state.soundQueue.push({ kind: 'synth', preset: 'step', channel: 'sfx', pitch: 1.4 });
      }
      break;
    }

    case 'combat.homing_missile': {
      const spd = Number(cfg.speed ?? 320);
      const turnRate = Number(cfg.turnRate ?? 6);
      const targetTag = String(cfg.targetTag ?? 'Enemy');
      const candidates = state.scene.objects.filter(
        (o) =>
          o.visible &&
          o.id !== obj.id &&
          (o.tags?.includes(targetTag) || o.layer === targetTag || o.name.includes(targetTag))
      );
      if (candidates.length > 0) {
        let best = candidates[0];
        let bestD = Infinity;
        for (const c of candidates) {
          const d = Math.hypot(c.transform.x - obj.transform.x, c.transform.y - obj.transform.y);
          if (d < bestD) {
            bestD = d;
            best = c;
          }
        }
        const desiredAngle = Math.atan2(best.transform.y - obj.transform.y, best.transform.x - obj.transform.x);
        const curAngle = Math.atan2(body.vy, body.vx);
        let diff = desiredAngle - curAngle;
        while (diff > Math.PI) diff -= Math.PI * 2;
        while (diff < -Math.PI) diff += Math.PI * 2;
        const nextAngle = curAngle + Math.max(-turnRate * dt, Math.min(turnRate * dt, diff));
        body.vx = Math.cos(nextAngle) * spd;
        body.vy = Math.sin(nextAngle) * spd;
        obj.transform.rotation = (nextAngle * 180) / Math.PI;
      }
      break;
    }

    case 'combat.contact_damage': {
      const dmg = Number(cfg.damage ?? 20);
      const knock = Number(cfg.knockback ?? 240);
      const affectTag = String(cfg.affectTag ?? '').trim();
      const targets = affectTag
        ? state.scene.objects.filter((o) => o.visible && o.id !== obj.id && o.tags?.includes(affectTag))
        : players;
      const myCols = getWorldColliders(obj);
      for (const t of targets) {
        const tCols = getWorldColliders(t);
        if (myCols.some((mc) => tCols.some((tc) => mc.left < tc.right && mc.right > tc.left && mc.top < tc.bottom && mc.bottom > tc.top))) {
          if (applyDamageToObject(state, t, dmg, 0.5) && knock > 0) {
            const tb = state.bodies.get(t.id);
            if (tb) {
              const dx = t.transform.x - obj.transform.x;
              tb.vx = (dx >= 0 ? 1 : -1) * knock;
              tb.vy = -knock * 0.45;
            }
          }
        }
      }
      break;
    }

    case 'combat.melee_attack': {
      const key = String(cfg.attackKey ?? 'KeyK');
      const cdKey = `melee_cd:${obj.id}`;
      const cd = Math.max(0, (state.runtimeTimers.get(cdKey) ?? 0) - dt);
      state.runtimeTimers.set(cdKey, cd);
      if (hasKey(key, input) && !wasKey(key) && cd <= 0) {
        state.runtimeTimers.set(cdKey, Number(cfg.cooldown ?? 0.35));
        const range = Number(cfg.range ?? 76);
        const dmg = Number(cfg.damage ?? 35);
        const facing = obj.sprite?.flipX ? -1 : 1;
        const hitX = obj.transform.x + facing * range * 0.5;
        const hitY = obj.transform.y;
        state.particles.push({ x: hitX, y: hitY, color: '#f8fafc', count: 8, age: 0, duration: 0.2 });
        for (const other of state.scene.objects) {
          if (!other.visible || other.id === obj.id) continue;
          const hasHp = other.components.some((c) => c.enabled && (c.type === 'health' || c.type === 'combat.health_system' || c.type === 'arcade.destructible'));
          if (!hasHp) continue;
          if (Math.hypot(other.transform.x - hitX, other.transform.y - hitY) <= range) {
            applyDamageToObject(state, other, dmg, 0.25);
          }
        }
      }
      break;
    }

    case 'combat.shield_block': {
      const key = String(cfg.shieldKey ?? 'KeyL');
      cfg._active = hasKey(key, input);
      break;
    }

    case 'combat.auto_destroy_offscreen': {
      const m = Number(cfg.margin ?? 160);
      if (
        obj.transform.x < -m ||
        obj.transform.x > stage.width + m ||
        obj.transform.y < -m ||
        obj.transform.y > stage.height + m
      ) {
        obj.visible = false;
      }
      break;
    }

    case 'economy.auto_magnet': {
      const rad = Number(cfg.radius ?? 180);
      const pullSpd = Number(cfg.pullSpeed ?? 340);
      for (const other of state.scene.objects) {
        if (!other.visible || other.id === obj.id) continue;
        const isCollectible = other.components.some(
          (c) => c.enabled && (c.type === 'collectible' || c.type === 'arcade.collectible_magnet_target')
        );
        if (!isCollectible) continue;
        const dx = obj.transform.x - other.transform.x;
        const dy = obj.transform.y - other.transform.y;
        const dist = Math.hypot(dx, dy);
        if (dist <= rad && dist > 1) {
          other.transform.x += (dx / dist) * pullSpd * dt;
          other.transform.y += (dy / dist) * pullSpd * dt;
        }
      }
      break;
    }

    case 'arcade.wave_spawner':
    case 'arcade.spawner_interval': {
      const tplKey = String(cfg.templateObjectId ?? '').trim();
      if (!tplKey) break;
      const interval = Math.max(0.2, Number(cfg.intervalSec ?? 2.5));
      const timerKey = `spawner:${comp.id}`;
      const acc = (state.runtimeTimers.get(timerKey) ?? 0) + dt;
      if (acc >= interval) {
        state.runtimeTimers.set(timerKey, acc - interval);
        const maxActive = comp.type === 'arcade.wave_spawner' ? Number(cfg.maxActive ?? 8) : 99;
        const activeClones = state.scene.objects.filter((o) => o.visible && o.id.startsWith('clone_')).length;
        if (activeClones < maxActive) {
          const tpl = state.scene.objects.find((o) => o.id === tplKey || o.name === tplKey);
          if (tpl) {
            const spread = comp.type === 'arcade.wave_spawner' ? Number(cfg.spreadRadius ?? 120) : 0;
            const ang = Math.random() * Math.PI * 2;
            const rad = Math.random() * spread;
            cloneTemplateObject(
              state,
              objectMap,
              tpl,
              obj.transform.x + Math.cos(ang) * rad,
              obj.transform.y + Math.sin(ang) * rad
            );
          }
        }
      } else {
        state.runtimeTimers.set(timerKey, acc);
      }
      break;
    }

    case 'arcade.timer_countdown': {
      const vn = String(cfg.variable ?? 'tiempo');
      const initKey = `cd_init:${comp.id}`;
      if (!state.runtimeTimers.has(initKey)) {
        state.runtimeTimers.set(initKey, 1);
        const startSec = Number(cfg.startSeconds ?? 60);
        if (!state.variables.has(vn)) state.variables.set(vn, startSec);
      }
      const cur = Number(state.variables.get(vn) ?? 0);
      if (cur > 0) {
        const nextRounded = Math.round(Math.max(0, cur - dt) * 100) / 100;
        state.variables.set(vn, nextRounded);
        if (nextRounded <= 0) {
          state.countdownZeroQueue.push(vn);
          const ev = String(cfg.eventOnZero ?? '').trim();
          if (ev) state.emittedEvents.push(ev);
        }
      }
      break;
    }

    case 'arcade.score_multiplier': {
      const vn = String(cfg.multiplierVar ?? 'multiplicador');
      const val = Number(cfg.value ?? 2);
      if (!state.variables.has(vn)) {
        state.variables.set(vn, val);
      }
      break;
    }

    case 'arcade.combo_timer': {
      const vn = String(cfg.comboVar ?? 'combo');
      const decay = Math.max(0.2, Number(cfg.decaySec ?? 3));
      const cur = Number(state.variables.get(vn) ?? 0);
      const lastKey = `combo_last:${comp.id}`;
      const timerKey = `combo_t:${comp.id}`;
      const prev = state.runtimeTimers.get(lastKey) ?? 0;
      if (cur > prev) {
        state.runtimeTimers.set(timerKey, 0);
      } else if (cur > 0) {
        const t = (state.runtimeTimers.get(timerKey) ?? 0) + dt;
        if (t >= decay) {
          state.variables.set(vn, 0);
          state.runtimeTimers.set(timerKey, 0);
        } else {
          state.runtimeTimers.set(timerKey, t);
        }
      }
      state.runtimeTimers.set(lastKey, Number(state.variables.get(vn) ?? 0));
      break;
    }

    case 'arcade.bounce_pad': {
      const force = Number(cfg.bounceForce ?? 760);
      const pCols = getWorldColliders(obj);
      for (const pl of players) {
        const plCols = getWorldColliders(pl);
        if (pCols.some((pc) => plCols.some((lc) => lc.left < pc.right && lc.right > pc.left && lc.top < pc.bottom && lc.bottom > pc.top))) {
          const pb = state.bodies.get(pl.id);
          if (pb) {
            pb.vy = -force;
            pb.grounded = false;
            state.soundQueue.push({ kind: 'synth', preset: 'jump', channel: 'sfx', pitch: 1.3 });
          }
        }
      }
      break;
    }

    case 'arcade.teleporter': {
      const cdKey = `tp_cd:${comp.id}`;
      const cd = Math.max(0, (state.runtimeTimers.get(cdKey) ?? 0) - dt);
      state.runtimeTimers.set(cdKey, cd);
      if (cd <= 0) {
        const pCols = getWorldColliders(obj);
        for (const pl of players) {
          const plCols = getWorldColliders(pl);
          if (pCols.some((pc) => plCols.some((lc) => lc.left < pc.right && lc.right > pc.left && lc.top < pc.bottom && lc.bottom > pc.top))) {
            pl.transform.x = Number(cfg.destX ?? 200);
            pl.transform.y = Number(cfg.destY ?? 200);
            state.runtimeTimers.set(cdKey, Number(cfg.cooldown ?? 1));
            state.soundQueue.push({ kind: 'synth', preset: 'powerup', channel: 'sfx' });
          }
        }
      }
      break;
    }

    case 'arcade.hazard_spike': {
      const dmg = Number(cfg.damage ?? 25);
      const pCols = getWorldColliders(obj);
      for (const pl of players) {
        const plCols = getWorldColliders(pl);
        if (pCols.some((pc) => plCols.some((lc) => lc.left < pc.right && lc.right > pc.left && lc.top < pc.bottom && lc.bottom > pc.top))) {
          const hit = applyDamageToObject(state, pl, dmg, 0.5);
          if (hit && cfg.respawnAtCheckpoint && state.checkpoint) {
            pl.transform.x = state.checkpoint.x;
            pl.transform.y = state.checkpoint.y;
          }
        }
      }
      break;
    }

    case 'juice.hit_flash': {
      if (body.invulnerableTimer > 0) {
        const rate = Number(cfg.blinkRate ?? 18);
        obj.opacity = Math.sin(state.elapsed * rate * Math.PI) > 0 ? 1 : 0.35;
      } else {
        obj.opacity = 1;
      }
      break;
    }

    case 'juice.pulse_scale': {
      const amt = Number(cfg.amount ?? 0.08);
      const spd = Number(cfg.speed ?? 2);
      const s = 1 + Math.sin(state.elapsed * spd * Math.PI * 2) * amt;
      state.visualSquash.set(obj.id, { sx: s, sy: s });
      break;
    }

    case 'juice.squash_stretch': {
      const intensity = Number(cfg.intensity ?? 0.22);
      const cur = state.visualSquash.get(obj.id) ?? { sx: 1, sy: 1 };
      let targetSx = 1;
      let targetSy = 1;
      if (!body.grounded && Math.abs(body.vy) > 90) {
        targetSx = 1 - intensity * 0.65;
        targetSy = 1 + intensity;
      } else if (body.grounded && !body.wasGrounded) {
        targetSx = 1 + intensity;
        targetSy = 1 - intensity * 0.65;
      }
      body.wasGrounded = body.grounded;
      state.visualSquash.set(obj.id, {
        sx: cur.sx + (targetSx - cur.sx) * Math.min(1, dt * 14),
        sy: cur.sy + (targetSy - cur.sy) * Math.min(1, dt * 14),
      });
      break;
    }

    case 'juice.ghost_trail': {
      const minSpd = Number(cfg.minSpeed ?? 120);
      if (Math.hypot(body.vx, body.vy) >= minSpd) {
        const key = `trail:${obj.id}`;
        const acc = (state.runtimeTimers.get(key) ?? 0) + dt;
        if (acc >= 0.05) {
          state.runtimeTimers.set(key, 0);
          state.emitterParticles.push({
            x: obj.transform.x,
            y: obj.transform.y,
            vx: 0,
            vy: 0,
            gravity: 0,
            sizeStart: Math.max(4, Math.min(14, obj.transform.width * 0.25)),
            sizeEnd: 1,
            colorStart: String(cfg.color ?? '#38bdf8'),
            colorEnd: String(cfg.color ?? '#38bdf8'),
            alpha: 0.45,
            age: 0,
            maxAge: 0.28,
          });
        } else {
          state.runtimeTimers.set(key, acc);
        }
      }
      break;
    }

    case 'juice.fade_after_time': {
      const delay = Number(cfg.delaySec ?? 1);
      const dur = Math.max(0.1, Number(cfg.fadeDuration ?? 0.8));
      const key = `fade:${comp.id}`;
      const t = (state.runtimeTimers.get(key) ?? 0) + dt;
      state.runtimeTimers.set(key, t);
      if (t > delay) {
        const prog = (t - delay) / dur;
        obj.opacity = Math.max(0, 1 - prog);
        if (prog >= 1) obj.visible = false;
      }
      break;
    }

    case 'juice.auto_flip_velocity': {
      const thr = Number(cfg.threshold ?? 5);
      if (obj.sprite) {
        if (body.vx < -thr) obj.sprite.flipX = true;
        else if (body.vx > thr) obj.sprite.flipX = false;
      }
      break;
    }

    case 'juice.sound_on_collision': {
      const cdKey = `snd_col:${comp.id}`;
      const cd = Math.max(0, (state.runtimeTimers.get(cdKey) ?? 0) - dt);
      state.runtimeTimers.set(cdKey, cd);
      if (cd <= 0 && players.length > 0) {
        const myCols = getWorldColliders(obj);
        const hit = players.some((p) => {
          const pc = getWorldColliders(p);
          return myCols.some((mc) => pc.some((c) => mc.left < c.right && mc.right > c.left && mc.top < c.bottom && mc.bottom > c.top));
        });
        if (hit) {
          state.runtimeTimers.set(cdKey, Number(cfg.cooldown ?? 0.35));
          state.soundQueue.push({
            kind: 'synth',
            preset: (cfg.preset as 'hit' | 'coin' | 'jump' | 'powerup' | 'step' | 'win') ?? 'hit',
            channel: 'sfx',
          });
        }
      }
      break;
    }
  }
}
