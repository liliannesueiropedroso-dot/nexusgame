export type MovementProfileId =
  | 'preciso'
  | 'suave'
  | 'arcade'
  | 'realista'
  | 'personalizado';

export interface PlatformerControllerParams {
  profile: MovementProfileId;
  maxSpeed: number;
  acceleration: number;
  deceleration: number;
  groundFriction: number;
  airControl: number; // 0..1
  gravity: number;
  fallGravityMultiplier: number;
  maxFallSpeed: number;
  jumpForce: number;
  variableJumpCut: number; // 0.1..1
  coyoteTime: number; // seg
  jumpBuffer: number; // seg
  maxJumps: number;
}

export interface TopDownControllerParams {
  profile: MovementProfileId;
  maxSpeed: number;
  acceleration: number;
  deceleration: number;
}

export const PLATFORMER_PROFILES: Record<
  Exclude<MovementProfileId, 'personalizado'>,
  Omit<PlatformerControllerParams, 'profile'>
> = {
  preciso: {
    maxSpeed: 220,
    acceleration: 1500,
    deceleration: 2100,
    groundFriction: 1.0,
    airControl: 0.72,
    gravity: 1280,
    fallGravityMultiplier: 1.45,
    maxFallSpeed: 760,
    jumpForce: 500,
    variableJumpCut: 0.5,
    coyoteTime: 0.1,
    jumpBuffer: 0.12,
    maxJumps: 1,
  },
  suave: {
    maxSpeed: 205,
    acceleration: 900,
    deceleration: 1100,
    groundFriction: 0.85,
    airControl: 0.6,
    gravity: 1150,
    fallGravityMultiplier: 1.3,
    maxFallSpeed: 700,
    jumpForce: 480,
    variableJumpCut: 0.55,
    coyoteTime: 0.12,
    jumpBuffer: 0.14,
    maxJumps: 1,
  },
  arcade: {
    maxSpeed: 250,
    acceleration: 2400,
    deceleration: 2600,
    groundFriction: 1.0,
    airControl: 0.85,
    gravity: 1450,
    fallGravityMultiplier: 1.6,
    maxFallSpeed: 840,
    jumpForce: 540,
    variableJumpCut: 0.45,
    coyoteTime: 0.1,
    jumpBuffer: 0.12,
    maxJumps: 2,
  },
  realista: {
    maxSpeed: 190,
    acceleration: 680,
    deceleration: 820,
    groundFriction: 0.75,
    airControl: 0.35,
    gravity: 1380,
    fallGravityMultiplier: 1.25,
    maxFallSpeed: 880,
    jumpForce: 460,
    variableJumpCut: 0.65,
    coyoteTime: 0.08,
    jumpBuffer: 0.1,
    maxJumps: 1,
  },
};

export function resolvePlatformerConfig(
  config: Record<string, unknown>
): PlatformerControllerParams {
  const profile = (config.profile as MovementProfileId) || 'preciso';
  const base =
    profile !== 'personalizado' && PLATFORMER_PROFILES[profile]
      ? PLATFORMER_PROFILES[profile]
      : PLATFORMER_PROFILES.preciso;

  const num = (k: string, fallback: number, min = 0, max = 10000): number => {
    const raw = config[k];
    if (raw === undefined || raw === null || raw === '') return fallback;
    const v = Number(raw);
    return Number.isFinite(v) ? Math.max(min, Math.min(max, v)) : fallback;
  };

  // Compatibilidad con campo anterior `speed` cuando aún no se definió `maxSpeed`
  const maxSpeed =
    config.maxSpeed !== undefined
      ? num('maxSpeed', base.maxSpeed, 10, 2500)
      : config.speed !== undefined
        ? Math.min(num('speed', base.maxSpeed, 10, 2500), 2500)
        : base.maxSpeed;

  return {
    profile,
    maxSpeed,
    acceleration: num('acceleration', base.acceleration, 10, 20000),
    deceleration: num('deceleration', base.deceleration, 10, 20000),
    groundFriction: num('groundFriction', base.groundFriction, 0.05, 5),
    airControl: num('airControl', base.airControl, 0, 1),
    gravity: num('gravity', base.gravity, 0, 8000),
    fallGravityMultiplier: num('fallGravityMultiplier', base.fallGravityMultiplier, 0.5, 5),
    maxFallSpeed: num('maxFallSpeed', base.maxFallSpeed, 50, 4000),
    jumpForce: num('jumpForce', base.jumpForce, 20, 3000),
    variableJumpCut: num('variableJumpCut', base.variableJumpCut, 0.1, 1),
    coyoteTime: num('coyoteTime', base.coyoteTime, 0, 0.5),
    jumpBuffer: num('jumpBuffer', base.jumpBuffer, 0, 0.5),
    maxJumps: Math.max(1, Math.round(num('maxJumps', base.maxJumps, 1, 5))),
  };
}

export function resolveTopDownConfig(
  config: Record<string, unknown>
): TopDownControllerParams {
  const profile = (config.profile as MovementProfileId) || 'preciso';
  const num = (k: string, fallback: number, min = 0, max = 10000): number => {
    const raw = config[k];
    if (raw === undefined || raw === null || raw === '') return fallback;
    const v = Number(raw);
    return Number.isFinite(v) ? Math.max(min, Math.min(max, v)) : fallback;
  };
  const maxSpeed =
    config.maxSpeed !== undefined
      ? num('maxSpeed', 210, 10, 2500)
      : num('speed', 210, 10, 2500);
  return {
    profile,
    maxSpeed,
    acceleration: num('acceleration', 1400, 10, 20000),
    deceleration: num('deceleration', 1800, 10, 20000),
  };
}

export function moveTowards(current: number, target: number, maxDelta: number): number {
  if (Math.abs(target - current) <= maxDelta) return target;
  return current + Math.sign(target - current) * maxDelta;
}
