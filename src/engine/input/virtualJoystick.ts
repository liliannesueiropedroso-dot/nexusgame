export interface VirtualJoystickVector {
  /** Eje X analógico normalizado (-1 izquierda .. +1 derecha) */
  x: number;
  /** Eje Y analógico normalizado (-1 arriba .. +1 abajo) */
  y: number;
  /** Magnitud total en [0..1] tras aplicar zona muerta */
  magnitude: number;
  /** Ángulo en grados (-180..180, 0 = derecha) */
  angleDeg: number;
  left: boolean;
  right: boolean;
  up: boolean;
  down: boolean;
}

/**
 * Calcula un vector analógico suave con zona muerta radial y clamp circular.
 */
export function computeJoystickVector(
  dx: number,
  dy: number,
  maxRadius: number,
  deadzone = 0.16
): VirtualJoystickVector {
  const radius = Math.max(8, maxRadius);
  const dz = Math.max(0, Math.min(0.6, deadzone));
  const dist = Math.hypot(dx, dy);

  if (dist <= 0.0001) {
    return { x: 0, y: 0, magnitude: 0, angleDeg: 0, left: false, right: false, up: false, down: false };
  }

  const rawMag = Math.min(1, dist / radius);
  if (rawMag <= dz) {
    return { x: 0, y: 0, magnitude: 0, angleDeg: 0, left: false, right: false, up: false, down: false };
  }

  const rescaledMag = Math.min(1, (rawMag - dz) / Math.max(0.05, 1 - dz));
  const nx = (dx / dist) * rescaledMag;
  const ny = (dy / dist) * rescaledMag;

  return {
    x: Number(nx.toFixed(4)),
    y: Number(ny.toFixed(4)),
    magnitude: Number(rescaledMag.toFixed(4)),
    angleDeg: Number(((Math.atan2(dy, dx) * 180) / Math.PI).toFixed(2)),
    left: nx < -0.22,
    right: nx > 0.22,
    up: ny < -0.22,
    down: ny > 0.22,
  };
}

export interface GamepadSnapshot {
  connected: boolean;
  axisX: number;
  axisY: number;
  jump: boolean;
  action: boolean;
  dash: boolean;
}

/**
 * Lee el primer Gamepad conectado mediante `navigator.getGamepads()` si está disponible.
 */
export function pollPrimaryGamepad(deadzone = 0.18): GamepadSnapshot {
  if (typeof navigator === 'undefined' || typeof navigator.getGamepads !== 'function') {
    return { connected: false, axisX: 0, axisY: 0, jump: false, action: false, dash: false };
  }
  const pads = navigator.getGamepads();
  if (!pads) {
    return { connected: false, axisX: 0, axisY: 0, jump: false, action: false, dash: false };
  }
  for (let i = 0; i < pads.length; i++) {
    const pad = pads[i];
    if (!pad || !pad.connected) continue;
    const rawX = pad.axes[0] ?? 0;
    const rawY = pad.axes[1] ?? 0;
    const dpadLeft = pad.buttons[14]?.pressed ? -1 : 0;
    const dpadRight = pad.buttons[15]?.pressed ? 1 : 0;
    const dpadUp = pad.buttons[12]?.pressed ? -1 : 0;
    const dpadDown = pad.buttons[13]?.pressed ? 1 : 0;

    const vec = computeJoystickVector(
      Math.abs(rawX) > deadzone ? rawX : dpadLeft + dpadRight,
      Math.abs(rawY) > deadzone ? rawY : dpadUp + dpadDown,
      1,
      deadzone
    );

    return {
      connected: true,
      axisX: vec.x,
      axisY: vec.y,
      jump: Boolean(pad.buttons[0]?.pressed),
      action: Boolean(pad.buttons[2]?.pressed || pad.buttons[1]?.pressed),
      dash: Boolean(pad.buttons[3]?.pressed || pad.buttons[5]?.pressed || pad.buttons[7]?.pressed),
    };
  }
  return { connected: false, axisX: 0, axisY: 0, jump: false, action: false, dash: false };
}
