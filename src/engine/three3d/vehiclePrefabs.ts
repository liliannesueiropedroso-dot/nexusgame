import type {
  GameMechanic,
  GameObjectData,
  Vehicle4WConfig,
  VehicleKind3D,
} from '../core/types';
import { createGameObject } from '../objects/factory';
import { createId } from '../../utils/id';

export interface VehicleWizardSpec {
  name: string;
  kind: VehicleKind3D;
  bodyAssetId?: string | null;
  wheelFLAssetId?: string | null;
  wheelFRAssetId?: string | null;
  wheelRLAssetId?: string | null;
  wheelRRAssetId?: string | null;
  propellerAssetId?: string | null;
  tailRotorAssetId?: string | null;
  wingsAssetId?: string | null;
  landingGearAssetId?: string | null;
  cameraEnabled: boolean;
  mountStyle?: 'inside' | 'saddle';
  boatSize?: 'speedboat' | 'medium' | 'ship';
  waterObjectId?: string | null;
  planeStyle?: 'fighter' | 'airliner';
  localGravityBox?: { enabled: boolean; sx: number; sy: number; sz: number };
  createEnterMechanic?: boolean;
  playerObjectId?: string | null;
  spawnPos?: { x: number; y: number; z: number };
  /** Si el usuario asignó piezas con primitiva modular en vez de GLB */
  useModularParts?: boolean;
  /** Radio personalizado de las ruedas (m) */
  wheelRadius?: number;
  /** Ancho personalizado de las ruedas (m) */
  wheelWidth?: number;
  /** Largo de reposo de la suspensión (m) */
  suspensionRestLen?: number;
  /** Distancia entre eje delantero y trasero (m) */
  wheelBase?: number;
  /** Distancia entre rueda izquierda y derecha (m) */
  trackWidth?: number;
}

function makeChildMesh(
  name: string,
  parentId: string,
  existing: GameObjectData[],
  opts: {
    shape: 'box' | 'cylinder' | 'sphere' | 'glb';
    assetId?: string | null;
    color: string;
    x: number;
    y: number;
    z: number;
    rx?: number;
    ry?: number;
    rz?: number;
    sx: number;
    sy: number;
    sz: number;
    metalness?: number;
    roughness?: number;
    clearcoat?: number;
    clearcoatRoughness?: number;
    materialPreset?: GameObjectData['mesh3d'] extends infer M ? M extends { materialPreset?: infer P } ? P : never : never;
    emissive?: string;
    emissiveIntensity?: number;
  }
): GameObjectData {
  const child = createGameObject('mesh_3d', existing, { name });
  child.parentId = parentId;
  child.transform3d = {
    x: opts.x,
    y: opts.y,
    z: opts.z,
    rx: opts.rx ?? 0,
    ry: opts.ry ?? 0,
    rz: opts.rz ?? 0,
    sx: opts.sx,
    sy: opts.sy,
    sz: opts.sz,
  };
  child.mesh3d = {
    shape: opts.assetId ? 'glb' : opts.shape,
    glbAssetId: opts.assetId || null,
    color: opts.color,
    metalness: opts.metalness ?? 0.35,
    roughness: opts.roughness ?? 0.5,
    clearcoat: opts.clearcoat,
    clearcoatRoughness: opts.clearcoatRoughness,
    materialPreset: opts.materialPreset,
    emissive: opts.emissive ?? '#000000',
    emissiveIntensity: opts.emissiveIntensity ?? 0,
    castShadow: true,
    receiveShadow: true,
  };
  child.physics3d = {
    enabled: false,
    bodyType: 'kinematic',
    shape: 'box',
    cameraCollision: 'never',
    mass: 1,
    gravityScale: 0,
    restitution: 0,
    friction: 0.4,
  };
  return child;
}

/**
 * Construye una entidad compuesta Padre-Hijo lista para conducir, volar, montar o navegar,
 * vinculando automáticamente ruedas, hélices/rotores, alas, cámara de seguimiento y mecánica Tecla E.
 */
export function buildCompositeVehicleObjects(
  spec: VehicleWizardSpec,
  existingObjects: GameObjectData[]
): {
  objects: GameObjectData[];
  parentId: string;
  addedMechanic?: GameMechanic;
} {
  const pool = [...existingObjects];
  const created: GameObjectData[] = [];
  const isBoat = spec.kind === 'boat';
  const isPlane = spec.kind === 'plane';
  const isHeli = spec.kind === 'helicopter';
  const isShip = spec.kind === 'spaceship';
  const isMoto = spec.kind === 'moto';
  const isHorse = spec.kind === 'horse';
  const customWRad = Math.max(0.18, spec.wheelRadius ?? (isMoto ? 0.36 : isHorse ? 0.45 : 0.42));
  const customWWidth = Math.max(0.12, spec.wheelWidth ?? (isMoto ? 0.22 : 0.3));
  const customRestLen = Math.max(0.2, spec.suspensionRestLen ?? (isHeli ? 0.95 : 0.65));
  const customWheelBase = Math.max(1.0, spec.wheelBase ?? (isMoto ? 1.84 : isHorse ? 2.0 : 2.5));
  const customTrackWidth = isMoto ? 0 : Math.max(0.8, spec.trackWidth ?? (isHorse ? 0.72 : 1.92));
  const defaultLandSpawnY = isHorse ? customWRad + customRestLen : customWRad + customRestLen * 0.85;
  const spawn =
    spec.spawnPos ?? {
      x: 0,
      y: isPlane ? 2.5 : isHeli ? customRestLen + 0.05 : isShip ? 6 : isBoat ? 0.8 : defaultLandSpawnY,
      z: 0,
    };

  // Raíz con escala uniforme (1,1,1) para evitar cizallamiento o deformación en ruedas/hélices hijas
  const parent = createGameObject('container', pool, {
    name: spec.name.trim() || 'Vehiculo3D',
  });
  pool.push(parent);
  const boatScale =
    spec.boatSize === 'ship' ? { sx: 4.8, sy: 1.8, sz: 12.0 } : spec.boatSize === 'medium' ? { sx: 2.8, sy: 1.0, sz: 6.2 } : { sx: 2.1, sy: 0.75, sz: 4.4 };

  const bodyScale = isBoat
    ? boatScale
    : isPlane
      ? { sx: 1.4, sy: 1.0, sz: spec.planeStyle === 'airliner' ? 6.8 : 4.6 }
      : isHeli
        ? { sx: 1.75, sy: 1.25, sz: 4.1 }
        : isShip
          ? { sx: 6.0, sy: 2.4, sz: 12.0 }
          : isMoto
            ? { sx: 0.65, sy: 0.68, sz: 2.1 }
            : isHorse
              ? { sx: 0.72, sy: 0.76, sz: 2.15 }
              : { sx: 1.85, sy: 0.72, sz: 3.8 };

  parent.transform3d = {
    x: spawn.x,
    y: spawn.y,
    z: spawn.z,
    rx: 0,
    ry: 0,
    rz: 0,
    sx: 1,
    sy: 1,
    sz: 1,
  };

  parent.physics3d = {
    enabled: true,
    bodyType: 'dynamic',
    shape: 'box',
    cameraCollision: 'never',
    halfExtents: {
      x: bodyScale.sx * 0.5,
      y: bodyScale.sy * 0.5,
      z: bodyScale.sz * 0.5,
    },
    mass: isShip ? 25 : isBoat && spec.boatSize === 'ship' ? 18 : 4,
    gravityScale: isShip || isHeli ? 0 : 1,
    restitution: 0.05,
    friction: 0.5,
  };

  const chassis = makeChildMesh(`${parent.name}_Chasis`, parent.id, pool, {
    shape: 'box',
    assetId: spec.bodyAssetId,
    color: isBoat
      ? '#f8fafc'
      : isPlane
        ? '#38bdf8'
        : isHeli
          ? '#0f766e'
          : isShip
            ? '#6366f1'
            : isMoto
              ? '#f97316'
              : isHorse
                ? '#7c2d12'
                : '#dc2626',
    x: 0,
    y: 0,
    z: 0,
    sx: bodyScale.sx,
    sy: bodyScale.sy,
    sz: bodyScale.sz,
    metalness: isHorse ? 0.05 : isShip || isPlane || isHeli ? 0.72 : 0.65,
    roughness: isHorse ? 0.78 : isBoat ? 0.25 : 0.22,
    clearcoat: isHorse || isShip ? 0.1 : 0.85,
    clearcoatRoughness: 0.08,
    materialPreset: isHorse ? undefined : isShip ? 'worn_metal' : 'car_paint',
  });
  pool.push(chassis);
  created.push(chassis);

  const parts: NonNullable<Vehicle4WConfig['parts']> = {};

  if (spec.kind === 'car' || spec.kind === 'moto') {
    const hw = isMoto ? 0 : customTrackWidth * 0.5;
    const hl = customWheelBase * 0.5;
    const wy = -(customRestLen * 0.85);
    const wRad = customWRad;
    const wWidth = customWWidth;
    const defWidth = isMoto ? 0.22 : 0.3;
    const wheelScale = (assetId?: string | null) =>
      assetId
        ? {
            sx: Math.max(0.14, (wRad * 2) * (wWidth / defWidth)),
            sy: wRad * 2,
            sz: wRad * 2,
          }
        : {
            sx: wRad * 2,
            sy: wWidth,
            sz: wRad * 2,
          };

    const sFL = wheelScale(spec.wheelFLAssetId);
    const wheelFL = makeChildMesh(
      `${parent.name}_Rueda_DI`,
      parent.id,
      pool,
      {
        shape: 'cylinder',
        assetId: spec.wheelFLAssetId,
        color: '#18181b',
        x: -hw,
        y: wy,
        z: hl,
        rz: spec.wheelFLAssetId ? 0 : 90,
        sx: sFL.sx,
        sy: sFL.sy,
        sz: sFL.sz,
        metalness: 0.2,
        roughness: 0.85,
      }
    );
    pool.push(wheelFL);
    created.push(wheelFL);
    parts.wheelFL = wheelFL.id;

    const sRL = wheelScale(spec.wheelRLAssetId);
    const wheelRL = makeChildMesh(
      `${parent.name}_Rueda_TI`,
      parent.id,
      pool,
      {
        shape: 'cylinder',
        assetId: spec.wheelRLAssetId,
        color: '#18181b',
        x: -hw,
        y: wy,
        z: -hl,
        rz: spec.wheelRLAssetId ? 0 : 90,
        sx: sRL.sx,
        sy: sRL.sy,
        sz: sRL.sz,
        metalness: 0.2,
        roughness: 0.85,
      }
    );
    pool.push(wheelRL);
    created.push(wheelRL);
    parts.wheelRL = wheelRL.id;

    if (!isMoto) {
      const sFR = wheelScale(spec.wheelFRAssetId);
      const wheelFR = makeChildMesh(
        `${parent.name}_Rueda_DD`,
        parent.id,
        pool,
        {
          shape: 'cylinder',
          assetId: spec.wheelFRAssetId,
          color: '#18181b',
          x: hw,
          y: wy,
          z: hl,
          rz: spec.wheelFRAssetId ? 0 : 90,
          sx: sFR.sx,
          sy: sFR.sy,
          sz: sFR.sz,
          metalness: 0.2,
          roughness: 0.85,
        }
      );
      pool.push(wheelFR);
      created.push(wheelFR);
      parts.wheelFR = wheelFR.id;

      const sRR = wheelScale(spec.wheelRRAssetId);
      const wheelRR = makeChildMesh(
        `${parent.name}_Rueda_TD`,
        parent.id,
        pool,
        {
          shape: 'cylinder',
          assetId: spec.wheelRRAssetId,
          color: '#18181b',
          x: hw,
          y: wy,
          z: -hl,
          rz: spec.wheelRRAssetId ? 0 : 90,
          sx: sRR.sx,
          sy: sRR.sy,
          sz: sRR.sz,
          metalness: 0.2,
          roughness: 0.85,
        }
      );
      pool.push(wheelRR);
      created.push(wheelRR);
      parts.wheelRR = wheelRR.id;
    }
  } else if (isBoat) {
    const prop = makeChildMesh(`${parent.name}_Helice`, parent.id, pool, {
      shape: 'cylinder',
      assetId: spec.propellerAssetId,
      color: '#f59e0b',
      x: 0,
      y: -0.35,
      z: -bodyScale.sz * 0.52,
      rx: 90,
      sx: 0.55,
      sy: 0.25,
      sz: 0.55,
      metalness: 0.85,
      roughness: 0.25,
    });
    pool.push(prop);
    created.push(prop);
    parts.propellerId = prop.id;
  } else if (isPlane) {
    const wings = makeChildMesh(`${parent.name}_Alas`, parent.id, pool, {
      shape: 'box',
      assetId: spec.wingsAssetId,
      color: '#e2e8f0',
      x: 0,
      y: 0.05,
      z: 0.15,
      sx: spec.planeStyle === 'airliner' ? 8.2 : 5.4,
      sy: 0.16,
      sz: 1.5,
      metalness: 0.6,
      roughness: 0.3,
    });
    pool.push(wings);
    created.push(wings);

    const prop = makeChildMesh(`${parent.name}_Turbina`, parent.id, pool, {
      shape: 'cylinder',
      assetId: spec.propellerAssetId,
      color: '#fbbf24',
      x: 0,
      y: 0,
      z: bodyScale.sz * 0.54,
      rx: 90,
      sx: 0.9,
      sy: 0.2,
      sz: 0.9,
      metalness: 0.85,
      roughness: 0.2,
    });
    pool.push(prop);
    created.push(prop);
    parts.propellerId = prop.id;

    if (spec.landingGearAssetId || spec.useModularParts !== false) {
      const gear = makeChildMesh(`${parent.name}_TrenAterrizaje`, parent.id, pool, {
        shape: 'cylinder',
        assetId: spec.landingGearAssetId,
        color: '#1e293b',
        x: 0,
        y: -0.7,
        z: 0.8,
        rz: spec.landingGearAssetId ? 0 : 90,
        sx: 0.5,
        sy: 0.9,
        sz: 0.5,
        metalness: 0.4,
        roughness: 0.65,
      });
      pool.push(gear);
      created.push(gear);
      parts.landingGearId = gear.id;
    }
  } else if (isHeli) {
    const canopy = makeChildMesh(`${parent.name}_Cabina`, parent.id, pool, {
      shape: 'sphere',
      color: '#38bdf8',
      x: 0,
      y: 0.12,
      z: bodyScale.sz * 0.35,
      sx: 1.45,
      sy: 1.05,
      sz: 1.55,
      metalness: 0.75,
      roughness: 0.15,
    });
    pool.push(canopy);
    created.push(canopy);

    const tailBoom = makeChildMesh(`${parent.name}_Cola`, parent.id, pool, {
      shape: 'box',
      color: '#0d9488',
      x: 0,
      y: 0.22,
      z: -(bodyScale.sz * 0.5 + 1.45),
      sx: 0.35,
      sy: 0.38,
      sz: 3.1,
      metalness: 0.6,
      roughness: 0.35,
    });
    pool.push(tailBoom);
    created.push(tailBoom);

    const mainRotor = makeChildMesh(`${parent.name}_RotorPrincipal`, parent.id, pool, {
      shape: 'box',
      assetId: spec.propellerAssetId,
      color: '#e2e8f0',
      x: 0,
      y: bodyScale.sy * 0.5 + 0.36,
      z: 0,
      sx: 7.4,
      sy: 0.08,
      sz: 0.36,
      metalness: 0.82,
      roughness: 0.22,
    });
    pool.push(mainRotor);
    created.push(mainRotor);
    parts.propellerId = mainRotor.id;

    const tailRotor = makeChildMesh(`${parent.name}_RotorCola`, parent.id, pool, {
      shape: 'box',
      assetId: spec.tailRotorAssetId,
      color: '#fbbf24',
      x: 0.28,
      y: 0.32,
      z: -(bodyScale.sz * 0.5 + 2.85),
      sx: 0.08,
      sy: 1.25,
      sz: 0.22,
      metalness: 0.82,
      roughness: 0.25,
    });
    pool.push(tailRotor);
    created.push(tailRotor);
    parts.tailRotorId = tailRotor.id;

    if (spec.landingGearAssetId || spec.useModularParts !== false) {
      const skidLeft = makeChildMesh(`${parent.name}_PatinIzq`, parent.id, pool, {
        shape: 'box',
        assetId: spec.landingGearAssetId,
        color: '#334155',
        x: -0.95,
        y: -(customRestLen - 0.12),
        z: 0.1,
        sx: 0.16,
        sy: 0.16,
        sz: 3.3,
        metalness: 0.65,
        roughness: 0.4,
      });
      const skidRight = makeChildMesh(`${parent.name}_PatinDer`, parent.id, pool, {
        shape: 'box',
        color: '#334155',
        x: 0.95,
        y: -(customRestLen - 0.12),
        z: 0.1,
        sx: 0.16,
        sy: 0.16,
        sz: 3.3,
        metalness: 0.65,
        roughness: 0.4,
      });
      pool.push(skidLeft, skidRight);
      created.push(skidLeft, skidRight);
      parts.landingGearId = skidLeft.id;
    }
  } else if (isHorse) {
    const neckHead = makeChildMesh(`${parent.name}_Cabeza`, parent.id, pool, {
      shape: 'box',
      color: '#9a3412',
      x: 0,
      y: 0.56,
      z: 1.08,
      rx: -24,
      sx: 0.42,
      sy: 0.85,
      sz: 0.55,
      metalness: 0.05,
      roughness: 0.8,
    });
    const saddle = makeChildMesh(`${parent.name}_Montura`, parent.id, pool, {
      shape: 'box',
      color: '#451a03',
      x: 0,
      y: 0.42,
      z: -0.05,
      sx: 0.78,
      sy: 0.14,
      sz: 0.72,
      metalness: 0.1,
      roughness: 0.7,
    });
    const tail = makeChildMesh(`${parent.name}_Cola`, parent.id, pool, {
      shape: 'box',
      color: '#1c1917',
      x: 0,
      y: 0.08,
      z: -1.16,
      rx: 28,
      sx: 0.18,
      sy: 0.78,
      sz: 0.18,
      metalness: 0.05,
      roughness: 0.85,
    });
    const legOffsets = [
      { n: 'PataDI', x: -0.24, z: 0.76 },
      { n: 'PataDD', x: 0.24, z: 0.76 },
      { n: 'PataTI', x: -0.24, z: -0.78 },
      { n: 'PataTD', x: 0.24, z: -0.78 },
    ];
    pool.push(neckHead, saddle, tail);
    created.push(neckHead, saddle, tail);
    for (const lo of legOffsets) {
      const leg = makeChildMesh(`${parent.name}_${lo.n}`, parent.id, pool, {
        shape: 'cylinder',
        color: '#5c210e',
        x: lo.x,
        y: -0.68,
        z: lo.z,
        sx: 0.2,
        sy: 0.92,
        sz: 0.2,
        metalness: 0.05,
        roughness: 0.82,
      });
      pool.push(leg);
      created.push(leg);
    }
  } else if (isShip) {
    const thruster = makeChildMesh(`${parent.name}_Propulsores`, parent.id, pool, {
      shape: 'cylinder',
      assetId: spec.propellerAssetId,
      color: '#22d3ee',
      x: 0,
      y: 0,
      z: -bodyScale.sz * 0.53,
      rx: 90,
      sx: 2.0,
      sy: 0.8,
      sz: 2.0,
      emissive: '#06b6d4',
      emissiveIntensity: 2.2,
      metalness: 0.7,
      roughness: 0.2,
    });
    pool.push(thruster);
    created.push(thruster);
    parts.propellerId = thruster.id;
  }

  if (spec.cameraEnabled) {
    const camAnchor = createGameObject('container', pool, {
      name: `${parent.name}_CamAnchor`,
    });
    camAnchor.parentId = parent.id;
    camAnchor.transform3d = {
      x: 0,
      y: isShip ? 2.4 : isPlane || isHeli ? 1.9 : isHorse ? 1.65 : 1.4,
      z: 0,
      rx: 0,
      ry: 0,
      rz: 0,
      sx: 1,
      sy: 1,
      sz: 1,
    };
    pool.push(camAnchor);
    created.push(camAnchor);
    parts.cameraId = camAnchor.id;
  }

  const resolvedMountStyle: 'inside' | 'saddle' =
    spec.mountStyle ?? (isMoto || isHorse ? 'saddle' : 'inside');
  const defaultSeatOffset = isHorse
    ? { x: 0, y: 0.96, z: -0.05 }
    : isMoto
      ? { x: 0, y: 0.78, z: -0.14 }
      : { x: 0, y: 0.55, z: 0 };

  parent.vehicle = {
    enabled: true,
    vehicleKind: spec.kind,
    mountStyle: resolvedMountStyle,
    seatOffset: defaultSeatOffset,
    allowQuickEnterExit: true,
    maxTorque: isShip ? 15 : isHeli ? 18 : isPlane ? (spec.planeStyle === 'airliner' ? 12 : 18) : isBoat ? 12 : isHorse ? 20 : isMoto ? 15 : 13,
    maxSpeed: isShip ? 26 : isHeli ? 28 : isPlane ? (spec.planeStyle === 'airliner' ? 28 : 40) : isBoat ? (spec.boatSize === 'ship' ? 11 : 17) : isHorse ? 17 : isMoto ? 19 : 16,
    maxSteerDeg: isMoto ? 32 : isHorse ? 36 : 28,
    suspensionRestLen: customRestLen,
    suspensionStiffness: 38,
    suspensionDamping: 4.8,
    wheelRadius: customWRad,
    wheelWidth: customWWidth,
    wheelBase: isBoat ? bodyScale.sz * 0.85 : customWheelBase,
    trackWidth: isBoat ? bodyScale.sx * 0.85 : isMoto ? 0.2 : customTrackWidth,
    driveType: 'awd',
    gripFactor: isMoto ? 0.88 : 0.85,
    boatSize: spec.boatSize ?? 'speedboat',
    waterObjectId: spec.waterObjectId ?? null,
    planeStyle: spec.planeStyle ?? 'fighter',
    liftFactor: 1.0,
    hasLandingGear: isPlane || isHeli,
    localGravityBox: isShip
      ? spec.localGravityBox ?? { enabled: true, sx: bodyScale.sx * 0.85, sy: 2.2, sz: bodyScale.sz * 0.85 }
      : undefined,
    physicsLodDistance: 140,
    parts,
  };

  let addedMechanic: GameMechanic | undefined;
  if (spec.createEnterMechanic) {
    addedMechanic = {
      id: createId('mech'),
      name: `Entrar/Salir ${parent.name} (Tecla E)`,
      enabled: true,
      priority: 15,
      conditionCombinator: 'all',
      ownerObjectId: parent.id,
      trigger: {
        event: 'input.pressed',
        key: 'KeyE',
      },
      conditions: [],
      actions: [
        {
          id: createId('act'),
          type: 'vehicle.enterExit',
          parameters: {
            actorId: spec.playerObjectId ?? '',
            vehicleId: parent.id,
            key: 'KeyE',
            exitOffsetX: isShip ? 4.2 : isHeli ? 3.2 : 2.2,
          },
        },
      ],
    };
  }

  return {
    objects: [parent, ...created],
    parentId: parent.id,
    addedMechanic,
  };
}
