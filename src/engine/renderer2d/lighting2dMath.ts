export interface Point2D {
  x: number;
  y: number;
}

export interface OccluderRect2D {
  x: number;
  y: number;
  width: number;
  height: number;
  rotationDeg?: number;
  anchorX?: number;
  anchorY?: number;
}

export interface ShadowQuad2D {
  points: [number, number, number, number, number, number, number, number];
  direction: Point2D;
}

export function parseHexRgb2D(hex: string | undefined): { r: number; g: number; b: number } {
  const clean = (hex ?? '#fde68a').trim().replace(/^#/, '');
  if (/^[0-9a-fA-F]{6}$/.test(clean)) {
    return {
      r: Number.parseInt(clean.slice(0, 2), 16),
      g: Number.parseInt(clean.slice(2, 4), 16),
      b: Number.parseInt(clean.slice(4, 6), 16),
    };
  }
  if (/^[0-9a-fA-F]{3}$/.test(clean)) {
    return {
      r: Number.parseInt(clean[0] + clean[0], 16),
      g: Number.parseInt(clean[1] + clean[1], 16),
      b: Number.parseInt(clean[2] + clean[2], 16),
    };
  }
  return { r: 253, g: 230, b: 138 };
}

/**
 * Curva de atenuación radial suave (0 en el centro -> 1 en el radio exterior).
 * Evita bandas concéntricas discretas garantizando caída continua hasta alfa 0.
 */
export function computeLightFalloffAlpha(
  normalizedDist: number,
  intensity: number,
  softness: number
): number {
  const t = Math.max(0, Math.min(1, normalizedDist));
  const soft = Math.max(0.05, Math.min(1, softness));
  const power = 1.2 + soft * 1.4;
  const falloff = Math.pow(1 - t, power);
  const clampedIntensity = Math.max(0, Math.min(4, intensity));
  return Math.max(0, Math.min(1, falloff * Math.min(1, clampedIntensity * 0.65)));
}

export function getOccluderWorldCorners(occ: OccluderRect2D): [Point2D, Point2D, Point2D, Point2D] {
  const ax = occ.anchorX ?? 0.5;
  const ay = occ.anchorY ?? 0.5;
  const l = -occ.width * ax;
  const r = occ.width * (1 - ax);
  const t = -occ.height * ay;
  const b = occ.height * (1 - ay);
  const rad = ((occ.rotationDeg ?? 0) * Math.PI) / 180;
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);

  const rotate = (lx: number, ly: number): Point2D => ({
    x: occ.x + lx * cos - ly * sin,
    y: occ.y + lx * sin + ly * cos,
  });

  return [rotate(l, t), rotate(r, t), rotate(r, b), rotate(l, b)];
}

/**
 * Calcula volúmenes de sombra 2D proyectados desde la luz hacia las caras traseras
 * de cada obstáculo dentro del radio de luz, siguiendo dir = normalize(objeto - luz).
 */
export function compute2DShadowPolygons(
  lightPos: Point2D,
  radius: number,
  occluders: OccluderRect2D[]
): ShadowQuad2D[] {
  const quads: ShadowQuad2D[] = [];
  const safeRadius = Math.max(16, radius);
  const shadowReach = safeRadius * 1.35;

  for (const occ of occluders) {
    if (occ.width <= 1 || occ.height <= 1) continue;
    const dxCenter = occ.x - lightPos.x;
    const dyCenter = occ.y - lightPos.y;
    const distCenter = Math.hypot(dxCenter, dyCenter);
    const halfDiag = Math.hypot(occ.width, occ.height) * 0.5;
    if (distCenter > safeRadius + halfDiag || distCenter < 1) continue;

    // Evitar proyectar sombra si la fuente de luz está estrictamente dentro del sólido
    const corners = getOccluderWorldCorners(occ);
    const minX = Math.min(corners[0].x, corners[1].x, corners[2].x, corners[3].x);
    const maxX = Math.max(corners[0].x, corners[1].x, corners[2].x, corners[3].x);
    const minY = Math.min(corners[0].y, corners[1].y, corners[2].y, corners[3].y);
    const maxY = Math.max(corners[0].y, corners[1].y, corners[2].y, corners[3].y);
    if (
      lightPos.x > minX + 1 &&
      lightPos.x < maxX - 1 &&
      lightPos.y > minY + 1 &&
      lightPos.y < maxY - 1
    ) {
      continue;
    }

    const dir: Point2D = {
      x: dxCenter / distCenter,
      y: dyCenter / distCenter,
    };

    // Proyectar únicamente aristas orientadas en sentido opuesto a la luz (caras en sombra)
    for (let i = 0; i < 4; i++) {
      const c1 = corners[i];
      const c2 = corners[(i + 1) % 4];
      const ex = c2.x - c1.x;
      const ey = c2.y - c1.y;
      // Normal saliente para polígono en sentido horario (screen space +Y abajo)
      const nx = ey;
      const ny = -ex;
      const midX = (c1.x + c2.x) * 0.5 - lightPos.x;
      const midY = (c1.y + c2.y) * 0.5 - lightPos.y;
      if (nx * midX + ny * midY <= 0) continue;

      const d1 = Math.hypot(c1.x - lightPos.x, c1.y - lightPos.y) || 1;
      const d2 = Math.hypot(c2.x - lightPos.x, c2.y - lightPos.y) || 1;
      const ext1x = lightPos.x + ((c1.x - lightPos.x) / d1) * shadowReach;
      const ext1y = lightPos.y + ((c1.y - lightPos.y) / d1) * shadowReach;
      const ext2x = lightPos.x + ((c2.x - lightPos.x) / d2) * shadowReach;
      const ext2y = lightPos.y + ((c2.y - lightPos.y) / d2) * shadowReach;

      quads.push({
        points: [c1.x, c1.y, c2.x, c2.y, ext2x, ext2y, ext1x, ext1y],
        direction: dir,
      });
    }
  }

  return quads;
}
