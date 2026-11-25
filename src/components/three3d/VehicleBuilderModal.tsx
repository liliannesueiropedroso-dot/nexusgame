import React, { useMemo, useState } from 'react';
import {
  Anchor,
  Bike,
  Camera,
  Car,
  CheckCircle2,
  CircleDashed,
  Plane,
  Rocket,
  Sparkles,
  X,
} from 'lucide-react';
import type { GameMechanic, GameObjectData, VehicleKind3D } from '../../engine/core/types';
import { buildCompositeVehicleObjects } from '../../engine/three3d/vehiclePrefabs';
import type { ProjectAssetMeta } from '../../project/models/project';
import { NumericInput } from '../common/NumericInput';

interface VehicleBuilderModalProps {
  open: boolean;
  objects: GameObjectData[];
  assets: ProjectAssetMeta[];
  onClose: () => void;
  onCreateVehicle: (result: {
    objects: GameObjectData[];
    parentId: string;
    addedMechanic?: GameMechanic;
  }) => void;
}

type SlotKey =
  | 'body'
  | 'wheelFL'
  | 'wheelFR'
  | 'wheelRL'
  | 'wheelRR'
  | 'propeller'
  | 'wings'
  | 'landingGear';

interface SlotDef {
  key: SlotKey;
  label: string;
  required: boolean;
  hint: string;
}

const KIND_TABS: Array<{
  kind: VehicleKind3D;
  label: string;
  subtitle: string;
  Icon: React.FC<{ className?: string }>;
}> = [
  { kind: 'car', label: 'Auto 4x4', subtitle: '4 ruedas + suspensión', Icon: Car },
  { kind: 'moto', label: 'Moto', subtitle: '2 ruedas + inclinación', Icon: Bike },
  { kind: 'boat', label: 'Bote / Barco', subtitle: 'Flotación 4-12 pts', Icon: Anchor },
  { kind: 'plane', label: 'Avión', subtitle: 'Aerodinámica 6DOF', Icon: Plane },
  { kind: 'spaceship', label: 'Nave 6DOF', subtitle: 'Gravedad local', Icon: Rocket },
];

export const VehicleBuilderModal: React.FC<VehicleBuilderModalProps> = ({
  open,
  objects,
  assets,
  onClose,
  onCreateVehicle,
}) => {
  const [kind, setKind] = useState<VehicleKind3D>('car');
  const [name, setName] = useState('MiVehiculo');
  const [boatSize, setBoatSize] = useState<'speedboat' | 'medium' | 'ship'>('speedboat');
  const [planeStyle, setPlaneStyle] = useState<'fighter' | 'airliner'>('fighter');
  const [waterObjectId, setWaterObjectId] = useState<string>('');
  const [cameraEnabled, setCameraEnabled] = useState(true);
  const [createEnterMechanic, setCreateEnterMechanic] = useState(true);
  const [playerObjectId, setPlayerObjectId] = useState<string>('');
  const [localGravEnabled, setLocalGravEnabled] = useState(true);
  const [localGravSx, setLocalGravSx] = useState(5.2);
  const [localGravSy, setLocalGravSy] = useState(2.2);
  const [localGravSz, setLocalGravSz] = useState(10.2);

  // null = Primitiva Pro lista; string = assetId GLB/FBX; undefined = pendiente si no está en primitiva
  const [slotAssets, setSlotAssets] = useState<Record<SlotKey, string | 'primitive' | 'pending'>>({
    body: 'primitive',
    wheelFL: 'primitive',
    wheelFR: 'primitive',
    wheelRL: 'primitive',
    wheelRRA: 'primitive',
    wheelRR: 'primitive',
    propeller: 'primitive',
    wings: 'primitive',
    landingGear: 'primitive',
  } as Record<SlotKey, string | 'primitive' | 'pending'>);

  const [activeSlot, setActiveSlot] = useState<SlotKey>('body');

  const modelAssets = useMemo(
    () => assets.filter((a) => a.kind === 'model3d'),
    [assets]
  );

  const waterObjects = useMemo(
    () => objects.filter((o) => o.type === 'mesh_3d' && o.mesh3d?.shape === 'water'),
    [objects]
  );

  const playerCandidates = useMemo(
    () =>
      objects.filter(
        (o) =>
          o.type === 'mesh_3d' &&
          ((o.tags ?? []).includes('player') ||
            (o.components ?? []).some(
              (c) => c.type === 'character_3d' || c.type === 'player_platformer' || c.type === 'player_topdown'
            ))
      ),
    [objects]
  );

  const slotsForKind = useMemo<SlotDef[]>(() => {
    if (kind === 'car') {
      return [
        { key: 'body', label: 'Chasis / Carrocería', required: true, hint: 'Cuerpo principal y centro físico' },
        { key: 'wheelFL', label: 'Rueda Delantera Izq (DI)', required: true, hint: 'Dirección + amortiguador' },
        { key: 'wheelFR', label: 'Rueda Delantera Der (DD)', required: true, hint: 'Dirección + amortiguador' },
        { key: 'wheelRL', label: 'Rueda Trasera Izq (TI)', required: true, hint: 'Tracción trasera' },
        { key: 'wheelRR', label: 'Rueda Trasera Der (TD)', required: true, hint: 'Tracción trasera' },
      ];
    }
    if (kind === 'moto') {
      return [
        { key: 'body', label: 'Cuerpo / Tanque', required: true, hint: 'Chasis con inclinación en curvas' },
        { key: 'wheelFL', label: 'Rueda Delantera', required: true, hint: 'Giro de manillar' },
        { key: 'wheelRL', label: 'Rueda Trasera', required: true, hint: 'Tracción y suspensión' },
      ];
    }
    if (kind === 'boat') {
      return [
        { key: 'body', label: 'Casco Naval', required: true, hint: 'Flotación multi-pontón sobre olas' },
        { key: 'propeller', label: 'Hélice / Motor', required: true, hint: 'Rotación por empuje y estela' },
      ];
    }
    if (kind === 'plane') {
      return [
        { key: 'body', label: 'Fuselaje', required: true, hint: 'Cuerpo aerodinámico principal' },
        { key: 'wings', label: 'Alas', required: true, hint: 'Sustentación y alabeo' },
        { key: 'propeller', label: 'Hélice / Turbina', required: true, hint: 'Empuje hacia adelante' },
        { key: 'landingGear', label: 'Tren de Aterrizaje', required: false, hint: 'Contacto en pista' },
      ];
    }
    return [
      { key: 'body', label: 'Casco de Nave', required: true, hint: 'Estructura 6DOF espacial' },
      { key: 'propeller', label: 'Propulsores Iónicos', required: true, hint: 'Motor emisivo trasero' },
    ];
  }, [kind]);

  if (!open) return null;

  const readyCount = slotsForKind.filter((s) => slotAssets[s.key] !== 'pending').length;
  const requiredAllReady = slotsForKind.every(
    (s) => !s.required || slotAssets[s.key] !== 'pending'
  );

  const handleKindChange = (nextKind: VehicleKind3D) => {
    setKind(nextKind);
    setActiveSlot('body');
    const defaults: Record<VehicleKind3D, string> = {
      car: 'AutoDeportivo',
      moto: 'MotoCross',
      boat: 'LanchaRapida',
      plane: 'AvionCaza',
      spaceship: 'NaveEstelar',
    };
    setName(defaults[nextKind]);
  };

  const handleSetAllPrimitive = () => {
    setSlotAssets({
      body: 'primitive',
      wheelFL: 'primitive',
      wheelFR: 'primitive',
      wheelRL: 'primitive',
      wheelRR: 'primitive',
      propeller: 'primitive',
      wings: 'primitive',
      landingGear: 'primitive',
    });
  };

  const handleCreate = () => {
    const resolveAsset = (k: SlotKey): string | null => {
      const v = slotAssets[k];
      return v && v !== 'primitive' && v !== 'pending' ? v : null;
    };
    const resolvedPlayerId =
      playerObjectId || playerCandidates[0]?.id || null;
    const resolvedWaterId =
      waterObjectId || waterObjects[0]?.id || null;

    const built = buildCompositeVehicleObjects(
      {
        name,
        kind,
        bodyAssetId: resolveAsset('body'),
        wheelFLAssetId: resolveAsset('wheelFL'),
        wheelFRAssetId: resolveAsset('wheelFR'),
        wheelRLAssetId: resolveAsset('wheelRL'),
        wheelRRAssetId: resolveAsset('wheelRR'),
        propellerAssetId: resolveAsset('propeller'),
        wingsAssetId: resolveAsset('wings'),
        landingGearAssetId: resolveAsset('landingGear'),
        cameraEnabled,
        boatSize,
        waterObjectId: resolvedWaterId,
        planeStyle,
        localGravityBox:
          kind === 'spaceship'
            ? {
                enabled: localGravEnabled,
                sx: localGravSx,
                sy: localGravSy,
                sz: localGravSz,
              }
            : undefined,
        createEnterMechanic,
        playerObjectId: resolvedPlayerId,
        useModularParts: true,
      },
      objects
    );

    onCreateVehicle(built);
    onClose();
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="vehicle-wizard-title"
    >
      <div className="flex max-h-[92vh] w-full max-w-4xl flex-col overflow-hidden rounded-xl border border-[#2f313d] bg-[#16171d] text-zinc-100 shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-[#272933] bg-[#1c1d24] px-5 py-3.5">
          <div className="flex items-center gap-2.5">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-500/15 text-emerald-400">
              <Sparkles className="h-4 w-4" />
            </div>
            <div>
              <h2 id="vehicle-wizard-title" className="text-sm font-bold text-white">
                Asistente Visual de Vehículos 3D
              </h2>
              <p className="text-[11px] text-zinc-400">
                Ensambla entidades compuestas Padre-Hijo con físicas, cámara y tecla E en 1 clic
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Cerrar asistente de vehículos"
            className="rounded-lg p-1.5 text-zinc-400 hover:bg-zinc-800 hover:text-white"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Body */}
        <div className="min-h-0 flex-1 overflow-y-auto p-5 space-y-4">
          {/* Selector de tipo de vehículo */}
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
            {KIND_TABS.map(({ kind: k, label, subtitle, Icon }) => {
              const active = kind === k;
              return (
                <button
                  key={k}
                  type="button"
                  onClick={() => handleKindChange(k)}
                  className={`flex flex-col items-start gap-1 rounded-lg border p-2.5 text-left transition-colors ${
                    active
                      ? 'border-emerald-500 bg-emerald-500/10 text-white'
                      : 'border-[#2c2e39] bg-[#1c1d24] text-zinc-300 hover:border-zinc-500'
                  }`}
                >
                  <Icon className={`h-4 w-4 ${active ? 'text-emerald-400' : 'text-zinc-400'}`} />
                  <span className="text-xs font-semibold">{label}</span>
                  <span className="text-[10px] text-zinc-400">{subtitle}</span>
                </button>
              );
            })}
          </div>

          <div className="grid gap-4 lg:grid-cols-12">
            {/* Diagrama interactivo visual */}
            <div className="lg:col-span-7 rounded-xl border border-[#2a2c37] bg-[#121318] p-4 flex flex-col justify-between gap-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-zinc-200">
                  Diagrama de Piezas ({readyCount}/{slotsForKind.length} listas)
                </span>
                <button
                  type="button"
                  onClick={handleSetAllPrimitive}
                  className="rounded border border-emerald-500/40 bg-emerald-500/15 px-2.5 py-1 text-[11px] font-semibold text-emerald-300 hover:bg-emerald-500/25"
                >
                  Usar Primitivas Pro en todo
                </button>
              </div>

              {/* Esquema SVG dinámico según tipo */}
              <div className="relative flex min-h-[210px] items-center justify-center rounded-lg border border-[#22242e] bg-[#0e0f14] p-3">
                <svg viewBox="0 0 360 190" className="h-44 w-full max-w-md" aria-hidden="true">
                  {/* Rejilla sutil */}
                  <line x1="20" y1="95" x2="340" y2="95" stroke="#1f2330" strokeWidth="1" strokeDasharray="4 4" />
                  <line x1="180" y1="15" x2="180" y2="175" stroke="#1f2330" strokeWidth="1" strokeDasharray="4 4" />

                  {/* Silueta según tipo */}
                  {kind === 'car' && (
                    <>
                      <rect x="95" y="42" width="170" height="106" rx="18" fill="#1e293b" stroke="#34d399" strokeWidth="2" />
                      <rect x="65" y="32" width="38" height="22" rx="6" fill="#059669" />
                      <rect x="257" y="32" width="38" height="22" rx="6" fill="#059669" />
                      <rect x="65" y="136" width="38" height="22" rx="6" fill="#059669" />
                      <rect x="257" y="136" width="38" height="22" rx="6" fill="#059669" />
                    </>
                  )}
                  {kind === 'moto' && (
                    <>
                      <rect x="115" y="76" width="130" height="38" rx="14" fill="#1e293b" stroke="#34d399" strokeWidth="2" />
                      <rect x="62" y="81" width="44" height="28" rx="8" fill="#059669" />
                      <rect x="254" y="81" width="44" height="28" rx="8" fill="#059669" />
                    </>
                  )}
                  {kind === 'boat' && (
                    <>
                      <path d="M 65 95 Q 115 45 275 55 L 295 95 L 275 135 Q 115 145 65 95 Z" fill="#1e293b" stroke="#38bdf8" strokeWidth="2" />
                      <circle cx="298" cy="95" r="14" fill="#f59e0b" />
                    </>
                  )}
                  {kind === 'plane' && (
                    <>
                      <polygon points="155,22 205,22 195,168 165,168" fill="#334155" stroke="#38bdf8" strokeWidth="1.5" />
                      <rect x="65" y="76" width="230" height="38" rx="18" fill="#1e293b" stroke="#34d399" strokeWidth="2" />
                      <rect x="295" y="70" width="12" height="50" rx="4" fill="#fbbf24" />
                    </>
                  )}
                  {kind === 'spaceship' && (
                    <>
                      <rect x="75" y="34" width="210" height="122" rx="14" fill="none" stroke="#a855f7" strokeWidth="1.5" strokeDasharray="5 3" />
                      <polygon points="75,95 160,52 275,65 275,125 160,138" fill="#1e293b" stroke="#34d399" strokeWidth="2" />
                      <rect x="275" y="72" width="18" height="46" rx="5" fill="#22d3ee" />
                    </>
                  )}
                  {cameraEnabled && (
                    <circle cx="180" cy="95" r="9" fill="#0ea5e9" stroke="#ffffff" strokeWidth="1.5" />
                  )}
                </svg>
                <div className="pointer-events-none absolute bottom-2 right-2.5 text-[10px] text-zinc-400">
                  {cameraEnabled ? 'Cámara de seguimiento vinculada' : 'Sin ancla de cámara'}
                </div>
              </div>

              {/* Lista de slots interactivos (todos en verde cuando listos) */}
              <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-2">
                {slotsForKind.map((slot) => {
                  const val = slotAssets[slot.key];
                  const isReady = val !== 'pending';
                  const isActive = activeSlot === slot.key;
                  const assetMatch =
                    val !== 'primitive' && val !== 'pending'
                      ? modelAssets.find((a) => a.id === val)?.name
                      : null;

                  return (
                    <button
                      key={slot.key}
                      type="button"
                      onClick={() => setActiveSlot(slot.key)}
                      className={`flex items-center justify-between rounded-lg border px-2.5 py-2 text-left transition-colors ${
                        isActive
                          ? 'border-sky-400 bg-sky-500/10'
                          : isReady
                            ? 'border-emerald-500/50 bg-emerald-500/10'
                            : 'border-amber-500/40 bg-amber-500/5'
                      }`}
                    >
                      <div className="min-w-0 pr-2">
                        <div className="truncate text-[11px] font-semibold text-zinc-100">
                          {slot.label}
                        </div>
                        <div className="truncate text-[10px] text-zinc-400">
                          {assetMatch ? `Modelo: ${assetMatch}` : val === 'primitive' ? 'Primitiva Pro 3D' : 'Pendiente'}
                        </div>
                      </div>
                      {isReady ? (
                        <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-400" />
                      ) : (
                        <CircleDashed className="h-4 w-4 shrink-0 text-amber-400" />
                      )}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Columna derecha: configuración del slot activo y físicas del vehículo */}
            <div className="lg:col-span-5 space-y-3">
              <div className="rounded-xl border border-[#2a2c37] bg-[#1c1d24] p-3.5 space-y-2.5">
                <label className="block text-[11px] font-semibold text-zinc-300" htmlFor="veh-name-input">
                  Nombre del Vehículo
                </label>
                <input
                  id="veh-name-input"
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="w-full rounded border border-[#343644] bg-[#121318] px-2.5 py-1.5 text-xs text-white focus:border-emerald-500 focus:outline-none"
                />

                {/* Sub-opciones por tipo */}
                {kind === 'boat' && (
                  <div className="space-y-2 pt-1">
                    <label className="block text-[11px] font-medium text-zinc-300" htmlFor="veh-boat-size">
                      Tamaño y Pontones de Flotación
                    </label>
                    <select
                      id="veh-boat-size"
                      value={boatSize}
                      onChange={(e) => setBoatSize(e.target.value as 'speedboat' | 'medium' | 'ship')}
                      className="w-full rounded border border-[#343644] bg-[#121318] px-2 py-1.5 text-xs text-zinc-100"
                    >
                      <option value="speedboat">Lancha Rápida (4 pontones)</option>
                      <option value="medium">Bote Mediano (6 pontones)</option>
                      <option value="ship">Barco Grande (12 pontones)</option>
                    </select>

                    <label className="block text-[11px] font-medium text-zinc-300" htmlFor="veh-water-ref">
                      Superficie de Agua vinculada
                    </label>
                    <select
                      id="veh-water-ref"
                      value={waterObjectId}
                      onChange={(e) => setWaterObjectId(e.target.value)}
                      className="w-full rounded border border-[#343644] bg-[#121318] px-2 py-1.5 text-xs text-zinc-100"
                    >
                      <option value="">Automático (cualquier agua cercana)</option>
                      {waterObjects.map((w) => (
                        <option key={w.id} value={w.id}>
                          {w.name}
                        </option>
                      ))}
                    </select>
                  </div>
                )}

                {kind === 'plane' && (
                  <div className="space-y-1.5 pt-1">
                    <label className="block text-[11px] font-medium text-zinc-300" htmlFor="veh-plane-style">
                      Estilo Aerodinámico
                    </label>
                    <select
                      id="veh-plane-style"
                      value={planeStyle}
                      onChange={(e) => setPlaneStyle(e.target.value as 'fighter' | 'airliner')}
                      className="w-full rounded border border-[#343644] bg-[#121318] px-2 py-1.5 text-xs text-zinc-100"
                    >
                      <option value="fighter">Caza Acrobático (ágil)</option>
                      <option value="airliner">Avión de Pasajeros (auto-nivelación)</option>
                    </select>
                  </div>
                )}

                {kind === 'spaceship' && (
                  <div className="space-y-2 rounded-lg border border-purple-500/30 bg-purple-500/5 p-2.5">
                    <label className="flex items-center gap-2 text-[11px] font-semibold text-purple-200">
                      <input
                        type="checkbox"
                        checked={localGravEnabled}
                        onChange={(e) => setLocalGravEnabled(e.target.checked)}
                      />
                      <span>Zona de Gravedad Local (caminar dentro)</span>
                    </label>
                    {localGravEnabled && (
                      <div className="grid grid-cols-3 gap-1.5">
                        <div>
                          <span className="text-[10px] text-zinc-400">Ancho X</span>
                          <NumericInput value={localGravSx} step={0.5} min={1} onChange={setLocalGravSx} />
                        </div>
                        <div>
                          <span className="text-[10px] text-zinc-400">Alto Y</span>
                          <NumericInput value={localGravSy} step={0.5} min={1} onChange={setLocalGravSy} />
                        </div>
                        <div>
                          <span className="text-[10px] text-zinc-400">Largo Z</span>
                          <NumericInput value={localGravSz} step={0.5} min={1} onChange={setLocalGravSz} />
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Editor de pieza seleccionada */}
              <div className="rounded-xl border border-[#2a2c37] bg-[#1c1d24] p-3.5 space-y-2">
                <div className="text-[11px] font-semibold text-sky-300">
                  Pieza activa: {slotsForKind.find((s) => s.key === activeSlot)?.label ?? activeSlot}
                </div>
                <p className="text-[10px] text-zinc-400">
                  {slotsForKind.find((s) => s.key === activeSlot)?.hint}
                </p>
                <label className="block text-[10px] font-medium text-zinc-300" htmlFor="veh-slot-asset">
                  Modelo 3D (.glb / .fbx) o Primitiva
                </label>
                <select
                  id="veh-slot-asset"
                  value={slotAssets[activeSlot]}
                  onChange={(e) =>
                    setSlotAssets((prev) => ({
                      ...prev,
                      [activeSlot]: e.target.value,
                    }))
                  }
                  className="w-full rounded border border-[#343644] bg-[#121318] px-2 py-1.5 text-xs text-zinc-100"
                >
                  <option value="primitive">Usar Primitiva Pro 3D (lista)</option>
                  {modelAssets.map((m) => (
                    <option key={m.id} value={m.id}>
                      Modelo: {m.name}
                    </option>
                  ))}
                </select>
              </div>

              {/* Cámara + Mecánica Tecla E */}
              <div className="rounded-xl border border-[#2a2c37] bg-[#1c1d24] p-3.5 space-y-2">
                <label className="flex items-center gap-2 text-xs text-zinc-200">
                  <input
                    type="checkbox"
                    checked={cameraEnabled}
                    onChange={(e) => setCameraEnabled(e.target.checked)}
                  />
                  <Camera className="h-3.5 w-3.5 text-cyan-400" />
                  <span>Crear nodo CamAnchor de seguimiento</span>
                </label>

                <label className="flex items-center gap-2 text-xs text-zinc-200">
                  <input
                    type="checkbox"
                    checked={createEnterMechanic}
                    onChange={(e) => setCreateEnterMechanic(e.target.checked)}
                  />
                  <span className="font-semibold text-emerald-300">
                    Añadir mecánica "Entrar / Salir con Tecla E"
                  </span>
                </label>

                {createEnterMechanic && (
                  <div>
                    <label className="mb-1 block text-[10px] text-zinc-400" htmlFor="veh-player-select">
                      Personaje que conduce
                    </label>
                    <select
                      id="veh-player-select"
                      value={playerObjectId}
                      onChange={(e) => setPlayerObjectId(e.target.value)}
                      className="w-full rounded border border-[#343644] bg-[#121318] px-2 py-1 text-xs text-zinc-100"
                    >
                      <option value="">Auto-detectar Jugador 3D en escena</option>
                      {playerCandidates.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.name}
                        </option>
                      ))}
                    </select>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between border-t border-[#272933] bg-[#1c1d24] px-5 py-3">
          <div className="text-xs text-emerald-400">
            {requiredAllReady
              ? 'Todas las piezas estructurales listas para ensamblar.'
              : 'Completa las piezas obligatorias para crear el vehículo.'}
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg border border-[#343644] px-3.5 py-1.5 text-xs font-medium text-zinc-300 hover:bg-zinc-800"
            >
              Cancelar
            </button>
            <button
              type="button"
              disabled={!requiredAllReady || !name.trim()}
              onClick={handleCreate}
              className="rounded-lg bg-emerald-600 px-4 py-1.5 text-xs font-semibold text-white hover:bg-emerald-500 disabled:opacity-50"
            >
              Crear Vehículo Compuesto
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
