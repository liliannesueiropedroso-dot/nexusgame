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

export interface Vehicle4WRuntimeState {
  x: number;
  y: number;
  z: number;
  yawRad: number;
  pitchRad: number;
  rollRad: number;
  vx: number;
  vy: number;
  vz: number;
  speedForward: number;
  steerAngleRad: number;
  wheels: [WheelContactState, WheelContactState, WheelContactState, WheelContactState];
}

export function createVehicle4WState(
  x: number,
  y: number,
  z: number,
  yawDeg: number,
  cfg: Vehicle4WConfig
): Vehicle4WRuntimeState {
  const hw = (cfg.trackWidth || 1.7) * 0.5;
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
  return {
    x,
    y,
    z,
    yawRad: (yawDeg * Math.PI) / 180,
    pitchRad: 0,
    rollRad: 0,
    vx: 0,
    vy: 0,
    vz: 0,
    speedForward: 0,
    steerAngleRad: 0,
    wheels: [mkWheel(-hw, hl), mkWheel(hw, hl), mkWheel(-hw, -hl), mkWheel(hw, -hl)],
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
  const maxSteer = ((cfg.maxSteerDeg || 32) * Math.PI) / 180;
  const targetSteer = Math.max(-1, Math.min(1, steerInput)) * maxSteer;
  st.steerAngleRad += (targetSteer - st.steerAngleRad) * Math.min(1, safeDt * 10);

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

  // Aceleración longitudinal y giro Ackermann cuando hay tracción en ruedas
  const traction = groundedCount / 4;
  const accel = (cfg.maxTorque || 26) * Math.max(-1, Math.min(1, throttleInput)) * traction;
  if (Math.abs(throttleInput) > 0.02) {
    st.speedForward += accel * safeDt;
  } else {
    st.speedForward *= Math.max(0, 1 - 2.4 * safeDt);
  }
  const maxSpd = Math.max(4, cfg.maxSpeed || 22);
  st.speedForward = Math.max(-maxSpd * 0.55, Math.min(maxSpd, st.speedForward));

  if (traction > 0 && Math.abs(st.speedForward) > 0.15) {
    const turnRate =
      (st.speedForward / Math.max(1.2, cfg.wheelBase || 2.6)) * Math.tan(st.steerAngleRad);
    st.yawRad -= turnRate * safeDt;
  }

  const fwdX = Math.sin(st.yawRad);
  const fwdZ = Math.cos(st.yawRad);
  st.vx = fwdX * st.speedForward;
  st.vz = fwdZ * st.speedForward;
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

  // Pitch (cabeceo) y Roll (inclinación lateral) reales según compresión de cada rueda
  const frontAvg = (st.wheels[0].worldY + st.wheels[1].worldY) * 0.5;
  const rearAvg = (st.wheels[2].worldY + st.wheels[3].worldY) * 0.5;
  const leftAvg = (st.wheels[0].worldY + st.wheels[2].worldY) * 0.5;
  const rightAvg = (st.wheels[1].worldY + st.wheels[3].worldY) * 0.5;

  const targetPitch = Math.atan2(rearAvg - frontAvg, Math.max(1, cfg.wheelBase || 2.6)) - throttleInput * 0.04;
  const targetRoll = Math.atan2(leftAvg - rightAvg, Math.max(1, cfg.trackWidth || 1.7)) + steerInput * (st.speedForward / maxSpd) * 0.12;
  st.pitchRad += (targetPitch - st.pitchRad) * Math.min(1, safeDt * 10);
  st.rollRad += (targetRoll - st.rollRad) * Math.min(1, safeDt * 10);
}
