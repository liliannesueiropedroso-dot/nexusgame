import React, { useRef } from 'react';
import type { TouchControlsConfig } from '../../engine/core/types';
import { computeJoystickVector } from '../../engine/input/virtualJoystick';

export interface VirtualTouchOverlayProps {
  visible: boolean;
  config?: TouchControlsConfig;
  onAxisChange: (x: number, y: number) => void;
  onButtonChange: (button: 'jump' | 'action' | 'dash', pressed: boolean) => void;
}

const DEFAULT_CFG: TouchControlsConfig = {
  enabledByDefault: false,
  mode: 'fixed',
  deadzone: 0.16,
  joystickSize: 112,
  showJumpButton: true,
  showActionButton: true,
  showDashButton: true,
  opacity: 0.85,
};

/**
 * Overlay multitáctil 100% real para móvil, tablet y pruebas de escritorio:
 * - Joystick analógico 360° (modo fijo o flotante en zona izquierda).
 * - Botones simultáneos SALTAR, ACCIÓN y DASH mediante `pointerId` independientes.
 * - Mueve el knob directamente por DOM Ref a 60fps sin re-renderizar React ni usar backdrop-filter.
 */
export const VirtualTouchOverlay: React.FC<VirtualTouchOverlayProps> = ({
  visible,
  config,
  onAxisChange,
  onButtonChange,
}) => {
  const cfg = { ...DEFAULT_CFG, ...(config ?? {}) };
  const sizePx = Math.max(84, Math.min(180, cfg.joystickSize || 112));
  const maxTravel = Math.round(sizePx * 0.38);

  const stickRingRef = useRef<HTMLDivElement | null>(null);
  const knobRef = useRef<HTMLDivElement | null>(null);
  const joyStateRef = useRef<{
    pointerId: number | null;
    originX: number;
    originY: number;
    baseLeft: number;
    baseBottom: number;
  }>({
    pointerId: null,
    originX: 0,
    originY: 0,
    baseLeft: 24,
    baseBottom: 24,
  });

  if (!visible) return null;

  const updateKnobVisual = (dx: number, dy: number, active: boolean) => {
    const knob = knobRef.current;
    if (!knob) return;
    knob.style.transform = `translate3d(${dx.toFixed(1)}px, ${dy.toFixed(1)}px, 0) scale(${active ? 1.06 : 1})`;
    knob.style.backgroundColor = active ? 'rgba(56, 189, 248, 0.92)' : 'rgba(148, 163, 184, 0.72)';
  };

  const resetStick = () => {
    joyStateRef.current.pointerId = null;
    updateKnobVisual(0, 0, false);
    if (cfg.mode === 'floating' && stickRingRef.current) {
      stickRingRef.current.style.left = '24px';
      stickRingRef.current.style.bottom = '24px';
      stickRingRef.current.style.top = 'auto';
    }
    onAxisChange(0, 0);
  };

  const handleZonePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (joyStateRef.current.pointerId !== null) return;
    e.stopPropagation();
    e.currentTarget.setPointerCapture(e.pointerId);

    const ring = stickRingRef.current;
    if (!ring) return;

    if (cfg.mode === 'floating') {
      const zoneRect = e.currentTarget.getBoundingClientRect();
      const localX = e.clientX - zoneRect.left - sizePx * 0.5;
      const localY = e.clientY - zoneRect.top - sizePx * 0.5;
      ring.style.left = `${Math.max(8, Math.min(zoneRect.width - sizePx - 8, localX))}px`;
      ring.style.top = `${Math.max(8, Math.min(zoneRect.height - sizePx - 8, localY))}px`;
      ring.style.bottom = 'auto';
      joyStateRef.current = {
        pointerId: e.pointerId,
        originX: e.clientX,
        originY: e.clientY,
        baseLeft: localX,
        baseBottom: 24,
      };
      updateKnobVisual(0, 0, true);
      onAxisChange(0, 0);
      return;
    }

    const r = ring.getBoundingClientRect();
    const cx = r.left + r.width * 0.5;
    const cy = r.top + r.height * 0.5;
    joyStateRef.current = {
      pointerId: e.pointerId,
      originX: cx,
      originY: cy,
      baseLeft: 24,
      baseBottom: 24,
    };

    const rawDx = e.clientX - cx;
    const rawDy = e.clientY - cy;
    const dist = Math.hypot(rawDx, rawDy);
    const clampedDist = Math.min(maxTravel, dist);
    const kDx = dist > 0.01 ? (rawDx / dist) * clampedDist : 0;
    const kDy = dist > 0.01 ? (rawDy / dist) * clampedDist : 0;
    updateKnobVisual(kDx, kDy, true);

    const vec = computeJoystickVector(rawDx, rawDy, maxTravel, cfg.deadzone);
    onAxisChange(vec.x, vec.y);
  };

  const handleZonePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (joyStateRef.current.pointerId !== e.pointerId) return;
    e.stopPropagation();
    const rawDx = e.clientX - joyStateRef.current.originX;
    const rawDy = e.clientY - joyStateRef.current.originY;
    const dist = Math.hypot(rawDx, rawDy);
    const clampedDist = Math.min(maxTravel, dist);
    const kDx = dist > 0.01 ? (rawDx / dist) * clampedDist : 0;
    const kDy = dist > 0.01 ? (rawDy / dist) * clampedDist : 0;
    updateKnobVisual(kDx, kDy, true);

    const vec = computeJoystickVector(rawDx, rawDy, maxTravel, cfg.deadzone);
    onAxisChange(vec.x, vec.y);
  };

  const handleZonePointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    if (joyStateRef.current.pointerId !== e.pointerId) return;
    e.stopPropagation();
    try {
      e.currentTarget.releasePointerCapture(e.pointerId);
    } catch {}
    resetStick();
  };

  const renderActionBtn = (
    id: 'jump' | 'action' | 'dash',
    label: string,
    colorClass: string,
    sizeClass: string
  ) => (
    <button
      key={id}
      type="button"
      data-testid={`nexus-touch-btn-${id}`}
      onPointerDown={(e) => {
        e.stopPropagation();
        e.currentTarget.setPointerCapture(e.pointerId);
        onButtonChange(id, true);
      }}
      onPointerUp={(e) => {
        e.stopPropagation();
        try {
          e.currentTarget.releasePointerCapture(e.pointerId);
        } catch {}
        onButtonChange(id, false);
      }}
      onPointerCancel={() => onButtonChange(id, false)}
      className={`pointer-events-auto flex items-center justify-center rounded-full border-2 font-bold uppercase tracking-wider text-white shadow-lg active:scale-95 select-none touch-none ${colorClass} ${sizeClass}`}
    >
      {label}
    </button>
  );

  return (
    <div
      data-testid="nexus-virtual-touch-overlay"
      className="pointer-events-none absolute inset-0 z-20 select-none overflow-hidden"
      style={{ opacity: Math.max(0.25, Math.min(1, cfg.opacity ?? 0.85)) }}
    >
      {/* Zona táctil izquierda del Joystick analógico 360° */}
      <div
        data-testid="nexus-joystick-zone"
        onPointerDown={handleZonePointerDown}
        onPointerMove={handleZonePointerMove}
        onPointerUp={handleZonePointerUp}
        onPointerCancel={handleZonePointerUp}
        style={
          cfg.mode === 'floating'
            ? undefined
            : { width: sizePx + 48, height: sizePx + 48 }
        }
        className={
          cfg.mode === 'floating'
            ? 'pointer-events-auto absolute bottom-0 left-0 h-[55%] w-[45%] max-w-[360px] touch-none'
            : 'pointer-events-auto absolute bottom-0 left-0 touch-none'
        }
      >
        <div
          ref={stickRingRef}
          data-testid="nexus-joystick-ring"
          style={{ width: sizePx, height: sizePx }}
          className="absolute bottom-6 left-6 flex items-center justify-center rounded-full border-2 border-sky-400/55 bg-[#0f172a]/70 shadow-xl"
        >
          <div className="pointer-events-none absolute inset-3 rounded-full border border-dashed border-sky-300/25" />
          <div
            ref={knobRef}
            data-testid="nexus-joystick-knob"
            style={{
              width: Math.round(sizePx * 0.44),
              height: Math.round(sizePx * 0.44),
              backgroundColor: 'rgba(148, 163, 184, 0.72)',
            }}
            className="pointer-events-none rounded-full border-2 border-white/80 shadow-md transition-colors duration-75"
          />
        </div>
      </div>

      {/* Botonera táctil derecha */}
      <div className="pointer-events-none absolute bottom-6 right-6 flex items-end gap-3">
        {cfg.showDashButton &&
          renderActionBtn(
            'dash',
            'Dash',
            'border-violet-400/75 bg-violet-600/80 hover:bg-violet-500/90',
            'h-12 w-12 text-[10px]'
          )}
        {cfg.showActionButton &&
          renderActionBtn(
            'action',
            'Acción',
            'border-amber-400/75 bg-amber-600/80 hover:bg-amber-500/90',
            'h-14 w-14 text-[10px]'
          )}
        {cfg.showJumpButton &&
          renderActionBtn(
            'jump',
            'Saltar',
            'border-emerald-400/80 bg-emerald-600/85 hover:bg-emerald-500/95',
            'h-16 w-16 text-[11px]'
          )}
      </div>
    </div>
  );
};
