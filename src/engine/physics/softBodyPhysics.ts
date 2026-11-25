import type { SoftBodyConfig, Vehicle4WConfig } from '../core/types';

// ============================================================================
// 1. VERLET SOFT-BODY / CUERDAS / CADENAS / PUENTES / GEL / ARENA GRANULAR
// ============================================================================

export interface VerletNode {
  x: number;
  y: number;
  z: number;
  oldX: number;
  oldY: number;
  oldZ: number;
  pinned: boolean;
}

export interface VerletConstraint {
  a: number;
  b: number;
  restLen: number;
  stiffness: number;
}

export interface SoftBodySimulationState {
  kind: SoftBodyConfig['kind'];
  nodes: VerletNode[];
  constraints: VerletConstraint[];
  radius: number;
  damping: number;
  gravity: number;
  color: string;
}

export function createSoftBodySimulation(
  cfg: SoftBodyConfig,
  originX: number,
  originY: number,
  originZ: number
): SoftBodySimulationState {
  const segs = Math.max(3, Math.min(28, Math.round(cfg.segments || 8)));
  const totalLen = Math.max(1, cfg.length || 6);
  const damping = Math.max(0.85, Math.min(0.999, cfg.damping || 0.97));
  const gravity = cfg.gravity ?? -18;
  const stiffness = Math.max(0.1, Math.min(1, cfg.stiffness || 0.9));
  const nodes: VerletNode[] = [];
  const constraints: VerletConstraint[] = [];

  if (cfg.kind === 'gel') {
    // Malla blanda 2x2x2 o 3x3 con refuerzos cruzados que recuperan la forma
    const half = Math.max(0.35, totalLen * 0.25);
    const coords = [
      [-half, -half, -half], [half, -half, -half], [-half, half, -half], [half, half, -half],
      [-half, -half, half], [half, -half, half], [-half, half, half], [half, half, half],
    ];
    for (let i = 0; i < coords.length; i++) {
      const [cx, cy, cz] = coords[i];
      const wx = originX + cx;
      const wy = originY + cy;
      const wz = originZ + cz;
      nodes.push({ x: wx, y: wy, z: wz, oldX: wx, oldY: wy, oldZ: wz, pinned: false });
    }
    for (let i = 0; i < nodes.length; i++) {
      for (let j = i + 1; j < nodes.length; j++) {
        const d = Math.hypot(
          nodes[j].x - nodes[i].x,
          nodes[j].y - nodes[i].y,
          nodes[j].z - nodes[i].z
        );
        constraints.push({ a: i, b: j, restLen: d, stiffness });
      }
    }
  } else if (cfg.kind === 'sand') {
    const count = Math.max(8, Math.min(48, Math.round(cfg.particleCount || 20)));
    for (let i = 0; i < count; i++) {
      const rx = ((i % 5) - 2) * 0.26;
      const ry = Math.floor(i / 5) * 0.28;
      const rz = (((i * 7) % 5) - 2) * 0.26;
      const wx = originX + rx;
      const wy = originY + ry;
      const wz = originZ + rz;
      nodes.push({ x: wx, y: wy, z: wz, oldX: wx, oldY: wy, oldZ: wz, pinned: false });
    }
  } else {
    // Cuerda, Cadena o Puente colgante
    const step = totalLen / segs;
    const isHorizontal = cfg.kind === 'bridge';
    for (let i = 0; i <= segs; i++) {
      const wx = isHorizontal ? originX - totalLen * 0.5 + i * step : originX;
      const wy = isHorizontal ? originY : originY - i * step;
      const wz = originZ;
      const pinned =
        (i === 0 && cfg.anchorStart !== false) ||
        (i === segs && Boolean(cfg.anchorEnd || cfg.kind === 'bridge'));
      nodes.push({ x: wx, y: wy, z: wz, oldX: wx, oldY: wy, oldZ: wz, pinned });
    }
    for (let i = 0; i < segs; i++) {
      constraints.push({ a: i, b: i + 1, restLen: step, stiffness });
    }
  }

  return {
    kind: cfg.kind,
    nodes,
    constraints,
    radius: Math.max(0.08, cfg.radius ?? (cfg.kind === 'sand' ? 0.14 : 0.18)),
    damping,
    gravity,
    color: cfg.color || (cfg.kind === 'sand' ? '#eab308' : cfg.kind === 'gel' ? '#4ade80' : '#d97706'),
  };
}

export function stepSoftBodySimulation(
  sim: SoftBodySimulationState,
  dt: number,
  sampleFloorY: (x: number, z: number) => number,
  actorPush?: { x: number; y: number; z: number; radius: number }
): void {
  const safeDt = Math.min(0.033, Math.max(0.001, dt));
  const dt2 = safeDt * safeDt;

  // 1. Integración de Verlet
  for (const n of sim.nodes) {
    if (n.pinned) continue;
    const vx = (n.x - n.oldX) * sim.damping;
    const vy = (n.y - n.oldY) * sim.damping;
    const vz = (n.z - n.oldZ) * sim.damping;
    n.oldX = n.x;
    n.oldY = n.y;
    n.oldZ = n.z;
    n.x += vx;
    n.y += vy + sim.gravity * dt2;
    n.z += vz;
  }

  // 2. Restricciones de distancia (5 iteraciones para estabilidad en cadenas/puentes/gel)
  const iterations = sim.kind === 'sand' ? 2 : 5;
  for (let it = 0; it < iterations; it++) {
    for (const c of sim.constraints) {
      const a = sim.nodes[c.a];
      const b = sim.nodes[c.b];
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const dz = b.z - a.z;
      const dist = Math.hypot(dx, dy, dz) || 0.0001;
      const diff = ((dist - c.restLen) / dist) * c.stiffness;
      if (!a.pinned && !b.pinned) {
        a.x += dx * diff * 0.5;
        a.y += dy * diff * 0.5;
        a.z += dz * diff * 0.5;
        b.x -= dx * diff * 0.5;
        b.y -= dy * diff * 0.5;
        b.z -= dz * diff * 0.5;
      } else if (!a.pinned) {
        a.x += dx * diff;
        a.y += dy * diff;
        a.z += dz * diff;
      } else if (!b.pinned) {
        b.x -= dx * diff;
        b.y -= dy * diff;
        b.z -= dz * diff;
      }
    }

    // Colisión grano-grano en modo arena granular
    if (sim.kind === 'sand') {
      const minSep = sim.radius * 2.05;
      for (let i = 0; i < sim.nodes.length; i++) {
        for (let j = i + 1; j < sim.nodes.length; j++) {
          const a = sim.nodes[i];
          const b = sim.nodes[j];
          const dx = b.x - a.x;
          const dy = b.y - a.y;
          const dz = b.z - a.z;
          const dist = Math.hypot(dx, dy, dz) || 0.0001;
          if (dist < minSep) {
            const push = (minSep - dist) * 0.5;
            const nx = dx / dist;
            const ny = dy / dist;
            const nz = dz / dist;
            a.x -= nx * push;
            a.y -= ny * push;
            a.z -= nz * push;
            b.x += nx * push;
            b.y += ny * push;
            b.z += nz * push;
          }
        }
      }
    }

    // Suelo e interacción con jugador/entidad dinámica
    for (const n of sim.nodes) {
      if (n.pinned) continue;
      const floorY = sampleFloorY(n.x, n.z) + sim.radius;
      if (n.y < floorY) {
        n.y = floorY;
        n.oldX += (n.x - n.oldX) * 0.2;
        n.oldZ += (n.z - n.oldZ) * 0.2;
      }
      if (actorPush) {
        const dx = n.x - actorPush.x;
        const dy = n.y - actorPush.y;
        const dz = n.z - actorPush.z;
        const minR = sim.radius + actorPush.radius;
        const dist = Math.hypot(dx, dy, dz) || 0.0001;
        if (dist < minR) {
          const push = minR - dist;
          n.x += (dx / dist) * push;
          n.y += (dy / dist) * push;
          n.z += (dz / dist) * push;
        }
      }
    }
  }
}

// ============================================================================
// 2. FÍSICA DE VEHÍCULO 4 RUEDAS CON SUSPENSIÓN RESORTE-AMORTIGUADOR
// ============================================================================

export interface WheelContactState {
  offsetX: number;
  offsetZ: number;
  compression: number; // 0..1
  grounded: boolean;
  steerAngleRad: number;
  spinRad: number;
  worldX: number;
  worldY: number;
  worldZ: number;
}

export interface BoatPontoonState {
  offsetX: number;
  offsetZ: number;
  worldX: number;
  worldY: number;
  worldZ: number;
  waterY: number;
  submerged: number;
}

export interface Vehicle4WRuntimeState {
  x: number;
  y: number;
  z: number;
  prevX: number;
  prevY: number;
  prevZ: number;
  yawRad: number;
  pitchRad: number;
  rollRad: number;
  vx: number;
  vy: number;
  vz: number;
  speedForward: number;
  steerAngleRad: number;
  propellerSpinRad: number;
  lastActiveTime: number;
  lodCulled: boolean;
  wheels: [WheelContactState, WheelContactState, WheelContactState, WheelContactState];
  pontoons: BoatPontoonState[];
}

export function getBoatPontoonLocalOffsets(
  boatSize: 'speedboat' | 'medium' | 'ship' = 'speedboat',
  width = 2.4,
  length = 5.2
): Array<{ ox: number; oz: number }> {
  const hw = Math.max(0.7, width * 0.45);
  const hl = Math.max(1.2, length * 0.45);
  if (boatSize === 'ship') {
    // 12 pontones distribuidos en 3 columnas x 4 filas para barcos grandes con inercia
    const out: Array<{ ox: number; oz: number }> = [];
    const cols = [-hw, 0, hw];
    const rows = [-hl, -hl * 0.35, hl * 0.35, hl];
    for (const rz of rows) {
      for (const cx of cols) out.push({ ox: cx, oz: rz });
    }
    return out;
  }
  if (boatSize === 'medium') {
    // 6 pontones (proa, centro y popa en ambos costados)
    return [
      { ox: -hw, oz: hl },
      { ox: hw, oz: hl },
      { ox: -hw, oz: 0 },
      { ox: hw, oz: 0 },
      { ox: -hw, oz: -hl },
      { ox: hw, oz: -hl },
    ];
  }
  // 4 pontones en las esquinas para lancha rápida ágil sobre las olas
  return [
    { ox: -hw, oz: hl },
    { ox: hw, oz: hl },
    { ox: -hw, oz: -hl },
    { ox: hw, oz: -hl },
  ];
}

export function shouldStepVehiclePhysics(
  st: { x: number; y: number; z: number; lodCulled?: boolean },
  cameraPos: { x: number; y: number; z: number } | null | undefined,
  lodDistance?: number
): boolean {
  const maxDist = lodDistance ?? 120;
  if (!cameraPos || !Number.isFinite(maxDist) || maxDist <= 0) {
    st.lodCulled = false;
    return true;
  }
  const d = Math.hypot(st.x - cameraPos.x, st.y - cameraPos.y, st.z - cameraPos.z);
  const active = d <= maxDist;
  st.lodCulled = !active;
  return active;
}

export function createVehicle4WState(
  x: number,
  y: number,
  z: number,
  yawDeg: number,
  cfg: Vehicle4WConfig
): Vehicle4WRuntimeState {
  const isMoto = cfg.vehicleKind === 'moto';
  const hw = isMoto ? 0 : (cfg.trackWidth || 1.7) * 0.5;
  const hl = (cfg.wheelBase || 2.6) * 0.5;
  const mkWheel = (ox: number, oz: number): WheelContactState => ({
    offsetX: ox,
    offsetZ: oz,
    compression: 0,
    grounded: false,
    steerAngleRad: 0,
    spinRad: 0,
    worldX: x + ox,
    worldY: y,
    worldZ: z + oz,
  });
  const boatOffsets = getBoatPontoonLocalOffsets(
    cfg.boatSize ?? 'speedboat',
    cfg.trackWidth || 2.4,
    cfg.wheelBase || 5.2
  );
  return {
    x,
    y,
    z,
    prevX: x,
    prevY: y,
    prevZ: z,
    yawRad: (yawDeg * Math.PI) / 180,
    pitchRad: 0,
    rollRad: 0,
    vx: 0,
    vy: 0,
    vz: 0,
    speedForward: 0,
    steerAngleRad: 0,
    propellerSpinRad: 0,
    lastActiveTime: 0,
    lodCulled: false,
    wheels: [mkWheel(-hw, hl), mkWheel(hw, hl), mkWheel(-hw, -hl), mkWheel(hw, -hl)],
    pontoons: boatOffsets.map((p) => ({
      offsetX: p.ox,
      offsetZ: p.oz,
      worldX: x + p.ox,
      worldY: y,
      worldZ: z + p.oz,
      waterY: y,
      submerged: 0,
    })),
  };
}

export function stepVehicle4W(
  st: Vehicle4WRuntimeState,
  cfg: Vehicle4WConfig,
  throttleInput: number, // -1..1
  steerInput: number, // -1..1
  dt: number,
  sampleGroundY: (x: number, z: number) => number
): void {
  const safeDt = Math.min(0.033, Math.max(0.001, dt));
  st.prevX = st.x;
  st.prevY = st.y;
  st.prevZ = st.z;

  const isMoto = cfg.vehicleKind === 'moto';
  const maxSpd = Math.max(4, cfg.maxSpeed || (isMoto ? 19 : 16));
  const speedAbs = Math.abs(st.speedForward);
  const speedNorm = Math.min(1, speedAbs / maxSpd);

  // Dirección sensible a la velocidad: giro amplio a baja velocidad y estable en alta velocidad
  const maxSteer = ((cfg.maxSteerDeg || (isMoto ? 32 : 28)) * Math.PI) / 180;
  const speedSteerScale = 1 / (1 + speedAbs * 0.11);
  const targetSteer = Math.max(-1, Math.min(1, steerInput)) * maxSteer * speedSteerScale;
  const steerSpeed = Math.abs(steerInput) < 0.02 ? 8.8 : 5.4;
  st.steerAngleRad += (targetSteer - st.steerAngleRad) * Math.min(1, safeDt * steerSpeed);

  const cosY = Math.cos(st.yawRad);
  const sinY = Math.sin(st.yawRad);
  const wheelR = Math.max(0.18, cfg.wheelRadius || 0.42);
  const restLen = Math.max(0.15, cfg.suspensionRestLen || 0.65);

  let groundedCount = 0;
  let totalSpringForce = 0;

  for (let i = 0; i < 4; i++) {
    const w = st.wheels[i];
    const wx = st.x + w.offsetX * cosY + w.offsetZ * sinY;
    const wz = st.z - w.offsetX * sinY + w.offsetZ * cosY;
    const gY = sampleGroundY(wx, wz);
    const hubY = st.y - restLen * 0.4;
    const groundDist = hubY - (gY + wheelR);

    if (groundDist <= restLen) {
      const comp = Math.max(0, Math.min(1, 1 - groundDist / restLen));
      const springForce =
        comp * (cfg.suspensionStiffness || 36) - st.vy * (cfg.suspensionDamping || 4.8);
      totalSpringForce += Math.max(0, springForce);
      w.compression = comp;
      w.grounded = true;
      w.worldY = gY + wheelR;
      groundedCount++;
    } else {
      w.compression = 0;
      w.grounded = false;
      w.worldY = hubY - restLen * 0.5;
    }
    w.worldX = wx;
    w.worldZ = wz;
    w.steerAngleRad = i < 2 ? st.steerAngleRad : 0;
    w.spinRad += (st.speedForward / wheelR) * safeDt;
  }

  const traction = groundedCount / 4;
  const clampedThr = Math.max(-1, Math.min(1, throttleInput));
  const baseTorque = cfg.maxTorque || (isMoto ? 15 : 13);
  const isBraking =
    (st.speedForward > 0.6 && clampedThr < -0.05) ||
    (st.speedForward < -0.6 && clampedThr > 0.05);

  if (isBraking && traction > 0) {
    // Frenado firme y progresivo hasta detenerse antes de engranar reversa
    const brakeDecel = Math.max(18, baseTorque * 1.75) * Math.abs(clampedThr) * traction;
    const nextSpd = st.speedForward + Math.sign(clampedThr) * brakeDecel * safeDt;
    st.speedForward = Math.sign(nextSpd) !== Math.sign(st.speedForward) ? 0 : nextSpd;
  } else if (clampedThr > 0.02) {
    // Empuje inicial ágil con caída progresiva hacia velocidad punta
    const torqueCurve = 1.15 - 0.72 * Math.pow(speedNorm, 1.3);
    st.speedForward += baseTorque * clampedThr * torqueCurve * traction * safeDt;
  } else if (clampedThr < -0.02) {
    // Reversa suave y controlada
    st.speedForward += baseTorque * 0.65 * clampedThr * traction * safeDt;
  } else if (traction > 0) {
    // Inercia natural de rodamiento + resistencia aerodinámica suave al soltar acelerador
    const aeroDrag = 0.035 * st.speedForward * speedAbs;
    const rollDrag = 1.65 * Math.sign(st.speedForward);
    const nextSpd = st.speedForward - (rollDrag + aeroDrag) * safeDt;
    st.speedForward = Math.abs(nextSpd) < 0.08 ? 0 : nextSpd;
  }

  st.speedForward = Math.max(-maxSpd * 0.42, Math.min(maxSpd, st.speedForward));

  if (traction > 0 && speedAbs > 0.12) {
    const lowSpeedRamp = Math.min(1, speedAbs / 1.2);
    const rawTurnRate =
      (st.speedForward / Math.max(1.4, cfg.wheelBase || 2.5)) *
      Math.tan(st.steerAngleRad) *
      lowSpeedRamp;
    const turnRate = Math.max(-1.05, Math.min(1.05, rawTurnRate));
    st.yawRad -= turnRate * safeDt;
  }

  // Dirección forward + control de agarre lateral / micro-derrape (gripFactor)
  const fwdX = Math.sin(st.yawRad);
  const fwdZ = Math.cos(st.yawRad);
  const rightX = Math.cos(st.yawRad);
  const rightZ = -Math.sin(st.yawRad);

  const grip = Math.max(0.08, Math.min(1, cfg.gripFactor ?? 0.85));
  const curLateral = st.vx * rightX + st.vz * rightZ;
  const dampedLateral = curLateral * Math.max(0, 1 - grip * 9.5 * safeDt);
  st.vx = fwdX * st.speedForward + rightX * dampedLateral;
  st.vz = fwdZ * st.speedForward + rightZ * dampedLateral;
  st.x += st.vx * safeDt;
  st.z += st.vz * safeDt;

  // Gravedad vertical + empuje de suspensión
  st.vy += (totalSpringForce * 0.25 - 18) * safeDt;
  st.y += st.vy * safeDt;

  const avgGround =
    (st.wheels[0].worldY + st.wheels[1].worldY + st.wheels[2].worldY + st.wheels[3].worldY) * 0.25;
  const minChassisY = avgGround + restLen * 0.45;
  if (st.y < minChassisY) {
    st.y = minChassisY;
    if (st.vy < 0) st.vy = 0;
  }

  const frontAvg = (st.wheels[0].worldY + st.wheels[1].worldY) * 0.5;
  const rearAvg = (st.wheels[2].worldY + st.wheels[3].worldY) * 0.5;
  const leftAvg = (st.wheels[0].worldY + st.wheels[2].worldY) * 0.5;
  const rightAvg = (st.wheels[1].worldY + st.wheels[3].worldY) * 0.5;

  const accelPitch = isBraking ? 0.055 : -clampedThr * 0.032;
  const targetPitch =
    Math.atan2(rearAvg - frontAvg, Math.max(1, cfg.wheelBase || 2.5)) + accelPitch;
  // Moto inclina hacia adentro de la curva (+); Auto balancea suavemente hacia afuera (-)
  const leanFactor = isMoto ? 0.42 : -0.075;
  const targetRoll =
    Math.atan2(leftAvg - rightAvg, Math.max(0.6, cfg.trackWidth || 1.7)) +
    steerInput * (st.speedForward / maxSpd) * leanFactor;
  st.pitchRad += (targetPitch - st.pitchRad) * Math.min(1, safeDt * 10);
  st.rollRad += (targetRoll - st.rollRad) * Math.min(1, safeDt * 10);
}

/**
 * Flotación real por pontones sobre las olas del agua:
 * - Lancha rápida (4 pontones): rebota y escora ágilmente sobre las olas
 * - Bote mediano (6 pontones): estabilidad balanceada
 * - Barco grande (12 pontones): alta inercia, corta las olas suavemente
 */
export function stepBoatVehicle(
  st: Vehicle4WRuntimeState,
  cfg: Vehicle4WConfig,
  throttleInput: number,
  steerInput: number,
  dt: number,
  sampleWaterY: (x: number, z: number) => number | null
): void {
  const safeDt = Math.min(0.033, Math.max(0.001, dt));
  st.prevX = st.x;
  st.prevY = st.y;
  st.prevZ = st.z;

  const boatSize = cfg.boatSize ?? 'speedboat';
  const expectedCount = boatSize === 'ship' ? 12 : boatSize === 'medium' ? 6 : 4;
  if (st.pontoons.length !== expectedCount) {
    const offs = getBoatPontoonLocalOffsets(
      boatSize,
      cfg.trackWidth || (boatSize === 'ship' ? 4.8 : 2.4),
      cfg.wheelBase || (boatSize === 'ship' ? 12 : 5.2)
    );
    st.pontoons = offs.map((p) => ({
      offsetX: p.ox,
      offsetZ: p.oz,
      worldX: st.x + p.ox,
      worldY: st.y,
      worldZ: st.z + p.oz,
      waterY: st.y,
      submerged: 0,
    }));
  }

  const cosY = Math.cos(st.yawRad);
  const sinY = Math.sin(st.yawRad);
  const inertiaDamp = boatSize === 'ship' ? 0.35 : boatSize === 'medium' ? 0.65 : 1.0;

  let submergedSum = 0;
  let waterHits = 0;
  let frontWater = 0;
  let rearWater = 0;
  let leftWater = 0;
  let rightWater = 0;
  let frontCnt = 0;
  let rearCnt = 0;
  let leftCnt = 0;
  let rightCnt = 0;

  for (const p of st.pontoons) {
    const wx = st.x + p.offsetX * cosY + p.offsetZ * sinY;
    const wz = st.z - p.offsetX * sinY + p.offsetZ * cosY;
    const wY = sampleWaterY(wx, wz);
    p.worldX = wx;
    p.worldZ = wz;
    if (wY !== null) {
      waterHits++;
      p.waterY = wY;
      const depth = Math.max(0, Math.min(2.0, wY - (st.y - 0.35)));
      p.submerged = depth;
      submergedSum += depth;
      p.worldY = wY;
      if (p.offsetZ >= 0) {
        frontWater += wY;
        frontCnt++;
      } else {
        rearWater += wY;
        rearCnt++;
      }
      if (p.offsetX < 0) {
        leftWater += wY;
        leftCnt++;
      } else if (p.offsetX > 0) {
        rightWater += wY;
        rightCnt++;
      }
    } else {
      p.submerged = 0;
      p.waterY = st.y - 1;
      p.worldY = st.y;
    }
  }

  const inWater = waterHits > 0;
  const maxSpd = Math.max(4, cfg.maxSpeed || (boatSize === 'ship' ? 14 : 24));
  const accel = (cfg.maxTorque || 20) * inertiaDamp * Math.max(-1, Math.min(1, throttleInput));
  if (inWater && Math.abs(throttleInput) > 0.02) {
    st.speedForward += accel * safeDt;
  } else {
    st.speedForward *= Math.max(0, 1 - (inWater ? 1.45 : 0.4) * safeDt);
  }
  st.speedForward = Math.max(-maxSpd * 0.4, Math.min(maxSpd, st.speedForward));

  if (inWater && Math.abs(steerInput) > 0.02) {
    const turnScale = boatSize === 'ship' ? 0.55 : boatSize === 'medium' ? 0.9 : 1.35;
    st.yawRad -= steerInput * turnScale * (0.45 + 0.55 * (Math.abs(st.speedForward) / maxSpd)) * safeDt;
  }

  const fwdX = Math.sin(st.yawRad);
  const fwdZ = Math.cos(st.yawRad);
  st.vx = fwdX * st.speedForward;
  st.vz = fwdZ * st.speedForward;
  st.x += st.vx * safeDt;
  st.z += st.vz * safeDt;

  const avgSubmerged = waterHits > 0 ? submergedSum / st.pontoons.length : 0;
  const buoyancyLift = avgSubmerged * (cfg.suspensionStiffness || 32);
  const waterDragY = inWater ? st.vy * (cfg.suspensionDamping || 4.2) : 0;
  st.vy += (buoyancyLift - 12 - waterDragY) * safeDt;
  st.y += st.vy * safeDt;

  if (inWater) {
    const avgW =
      st.pontoons.reduce((acc, p) => acc + p.waterY, 0) / Math.max(1, st.pontoons.length);
    if (st.y < avgW - 0.65) {
      st.y = avgW - 0.65;
      if (st.vy < 0) st.vy = 0;
    }
    const fY = frontCnt > 0 ? frontWater / frontCnt : avgW;
    const rY = rearCnt > 0 ? rearWater / rearCnt : avgW;
    const lY = leftCnt > 0 ? leftWater / leftCnt : avgW;
    const riY = rightCnt > 0 ? rightWater / rightCnt : avgW;
    const targetPitch =
      Math.atan2(rY - fY, Math.max(1.5, cfg.wheelBase || 5)) * inertiaDamp - throttleInput * 0.06 * inertiaDamp;
    const targetRoll =
      Math.atan2(lY - riY, Math.max(1.2, cfg.trackWidth || 2.4)) * inertiaDamp +
      steerInput * (st.speedForward / maxSpd) * 0.22 * inertiaDamp;
    st.pitchRad += (targetPitch - st.pitchRad) * Math.min(1, safeDt * (6 * inertiaDamp + 1.5));
    st.rollRad += (targetRoll - st.rollRad) * Math.min(1, safeDt * (6 * inertiaDamp + 1.5));
  }

  st.propellerSpinRad += (6 + Math.abs(st.speedForward) * 2.2) * safeDt;
}

/**
 * Aerodinámica para Aviones ('fighter' ágil 360° vs 'airliner' suave y nivelado automático)
 * con tren de aterrizaje que rueda en pista antes de despegar.
 */
export function stepPlaneVehicle(
  st: Vehicle4WRuntimeState,
  cfg: Vehicle4WConfig,
  throttleInput: number, // W/S o Space/Shift empuje
  pitchInput: number, // arriba/abajo cabeceo
  rollInput: number, // A/D alabeo
  yawInput: number, // Q/E guiñada
  dt: number,
  sampleGroundY: (x: number, z: number) => number
): void {
  const safeDt = Math.min(0.033, Math.max(0.001, dt));
  st.prevX = st.x;
  st.prevY = st.y;
  st.prevZ = st.z;

  const isFighter = (cfg.planeStyle ?? 'fighter') === 'fighter';
  const maxSpd = Math.max(12, cfg.maxSpeed || (isFighter ? 56 : 38));
  const thrust = (cfg.maxTorque || (isFighter ? 28 : 16)) * Math.max(-0.25, Math.min(1, throttleInput));
  if (Math.abs(throttleInput) > 0.02) {
    st.speedForward += thrust * safeDt;
  } else {
    st.speedForward *= Math.max(0, 1 - 0.18 * safeDt);
  }
  st.speedForward = Math.max(0, Math.min(maxSpd, st.speedForward));

  const pitchRate = isFighter ? 1.85 : 0.72;
  const rollRate = isFighter ? 2.8 : 0.95;
  const yawRate = isFighter ? 1.25 : 0.55;

  st.pitchRad += pitchInput * pitchRate * safeDt;
  st.pitchRad = Math.max(-1.2, Math.min(1.2, st.pitchRad));
  if (!isFighter && Math.abs(pitchInput) < 0.05) {
    st.pitchRad *= Math.max(0, 1 - 1.6 * safeDt);
  }

  st.rollRad += rollInput * rollRate * safeDt;
  if (!isFighter) {
    // Avión de pasajeros limita inclinación a ±32° y se autonivela al soltar controles
    const maxAirlinerRoll = (32 * Math.PI) / 180;
    st.rollRad = Math.max(-maxAirlinerRoll, Math.min(maxAirlinerRoll, st.rollRad));
    if (Math.abs(rollInput) < 0.05) {
      st.rollRad *= Math.max(0, 1 - 2.4 * safeDt);
    }
  }

  // Viraje acoplado al alabeo (banked turn) + guiñada directa
  st.yawRad -= (yawInput * yawRate + Math.sin(st.rollRad) * (isFighter ? 1.35 : 0.65)) * safeDt;

  const cosP = Math.cos(st.pitchRad);
  const sinP = Math.sin(st.pitchRad);
  const sinY = Math.sin(st.yawRad);
  const cosY = Math.cos(st.yawRad);

  st.vx = sinY * cosP * st.speedForward;
  st.vz = cosY * cosP * st.speedForward;
  const liftRatio = Math.min(1.35, (st.speedForward / Math.max(8, maxSpd * 0.38)) * (cfg.liftFactor ?? 1.0));
  const verticalLift = (liftRatio - 1.0) * 9.5 + sinP * st.speedForward;
  st.vy += (verticalLift - st.vy * 1.4) * Math.min(1, safeDt * 4);

  st.x += st.vx * safeDt;
  st.y += st.vy * safeDt;
  st.z += st.vz * safeDt;

  // Ruedas / Tren de aterrizaje sobre pista/terreno
  const gY = sampleGroundY(st.x, st.z);
  const gearClearance = cfg.hasLandingGear !== false ? 1.0 : 0.55;
  if (st.y < gY + gearClearance) {
    st.y = gY + gearClearance;
    if (st.vy < 0) st.vy = 0;
    if (st.pitchRad < 0) st.pitchRad *= 0.7;
    st.rollRad *= 0.8;
    // Fricción de rodadura suave
    st.speedForward *= Math.max(0, 1 - 0.35 * safeDt);
  }

  for (let i = 0; i < 4; i++) {
    const w = st.wheels[i];
    w.worldX = st.x + w.offsetX * cosY + w.offsetZ * sinY;
    w.worldZ = st.z - w.offsetX * sinY + w.offsetZ * cosY;
    w.worldY = st.y - gearClearance + (cfg.wheelRadius || 0.35);
    w.grounded = st.y <= gY + gearClearance + 0.15;
    w.spinRad += (st.speedForward / Math.max(0.2, cfg.wheelRadius || 0.35)) * safeDt;
  }

  st.propellerSpinRad += (10 + st.speedForward * 1.8) * safeDt;
}

/**
 * Nave Espacial 6DOF sin gravedad global (empuje en 3 ejes + rotación libre).
 */
export function stepSpaceshipVehicle(
  st: Vehicle4WRuntimeState,
  cfg: Vehicle4WConfig,
  forwardInput: number, // -1..1
  strafeInput: number, // -1..1
  ascendInput: number, // -1..1
  yawInput: number, // -1..1
  pitchInput: number, // -1..1
  rollInput: number, // -1..1
  dt: number
): void {
  const safeDt = Math.min(0.033, Math.max(0.001, dt));
  st.prevX = st.x;
  st.prevY = st.y;
  st.prevZ = st.z;

  st.yawRad -= yawInput * 1.15 * safeDt;
  st.pitchRad = Math.max(-1.45, Math.min(1.45, st.pitchRad + pitchInput * 1.0 * safeDt));
  st.rollRad += rollInput * 1.4 * safeDt;

  const sinY = Math.sin(st.yawRad);
  const cosY = Math.cos(st.yawRad);
  const rightX = cosY;
  const rightZ = -sinY;

  const thrust = cfg.maxTorque || 22;
  const maxSpd = Math.max(6, cfg.maxSpeed || 36);

  st.vx += (sinY * forwardInput + rightX * strafeInput) * thrust * safeDt;
  st.vz += (cosY * forwardInput + rightZ * strafeInput) * thrust * safeDt;
  st.vy += ascendInput * thrust * safeDt;

  // Amortiguación inercial espacial suave (estabilizadores RCS)
  const damp = Math.max(0, 1 - 1.35 * safeDt);
  if (Math.abs(forwardInput) < 0.02 && Math.abs(strafeInput) < 0.02) {
    st.vx *= damp;
    st.vz *= damp;
  }
  if (Math.abs(ascendInput) < 0.02) {
    st.vy *= damp;
  }

  const spd = Math.hypot(st.vx, st.vy, st.vz);
  if (spd > maxSpd) {
    const k = maxSpd / spd;
    st.vx *= k;
    st.vy *= k;
    st.vz *= k;
  }
  st.speedForward = st.vx * sinY + st.vz * cosY;

  st.x += st.vx * safeDt;
  st.y += st.vy * safeDt;
  st.z += st.vz * safeDt;
  st.propellerSpinRad += (6 + spd * 0.8) * safeDt;
}

/**
 * Zona de Gravedad Local para naves espaciales grandes:
 * si un jugador está dentro del volumen interior, hereda el desplazamiento de la nave
 * y mantiene sus pies firmes en la cubierta interior mientras la nave vuela en 6DOF.
 */
export function applyLocalGravityZone(
  shipState: Vehicle4WRuntimeState,
  localBox: { enabled: boolean; sx: number; sy: number; sz: number } | undefined,
  actorPos: { x: number; y: number; z: number },
  actorHalfY: number
): { inside: boolean; nextX: number; nextY: number; nextZ: number; floorY: number } {
  if (!localBox?.enabled) {
    return { inside: false, nextX: actorPos.x, nextY: actorPos.y, nextZ: actorPos.z, floorY: 0 };
  }
  const dxShip = shipState.x - shipState.prevX;
  const dyShip = shipState.y - shipState.prevY;
  const dzShip = shipState.z - shipState.prevZ;

  // Comprobar en coordenadas locales del casco (orientado por yawRad)
  const cosY = Math.cos(-shipState.yawRad);
  const sinY = Math.sin(-shipState.yawRad);
  const relX = actorPos.x - shipState.prevX;
  const relY = actorPos.y - shipState.prevY;
  const relZ = actorPos.z - shipState.prevZ;

  const lx = relX * cosY + relZ * sinY;
  const lz = -relX * sinY + relZ * cosY;

  const hx = Math.max(1, localBox.sx * 0.5);
  const hy = Math.max(1, localBox.sy * 0.5);
  const hz = Math.max(1, localBox.sz * 0.5);

  const inside = Math.abs(lx) <= hx && Math.abs(relY) <= hy && Math.abs(lz) <= hz;
  if (!inside) {
    return { inside: false, nextX: actorPos.x, nextY: actorPos.y, nextZ: actorPos.z, floorY: 0 };
  }

  const nextX = actorPos.x + dxShip;
  const nextZ = actorPos.z + dzShip;
  const floorY = shipState.y - hy + 0.15 + actorHalfY;
  const nextY = Math.max(floorY, actorPos.y + dyShip);
  return { inside: true, nextX, nextY, nextZ, floorY };
}
