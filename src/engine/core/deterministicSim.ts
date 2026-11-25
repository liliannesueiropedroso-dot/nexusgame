/**
 * Contexto de simulación determinista para NEXUS GAME ENGINE.
 * Provee:
 * - Generador pseudoaleatorio reproducible con seed (Mulberry32)
 * - Canales separados para aleatoriedad de gameplay vs aleatoriedad visual
 * - Reloj lógico por tick y generador determinista de IDs de sesión
 * - Hash FNV-1a estable para comparación de snapshots y round-trip
 */

export interface SeededRng {
  readonly seed: number;
  next(): number;
  range(min: number, max: number): number;
  int(minInclusive: number, maxInclusive: number): number;
  pick<T>(items: readonly T[]): T | undefined;
}

export function createSeededRng(seed = 1337): SeededRng {
  let state = (Math.floor(Number(seed) || 1337) >>> 0) || 1;
  const next = (): number => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  return {
    get seed() {
      return state;
    },
    next,
    range(min: number, max: number): number {
      return min + (max - min) * next();
    },
    int(minInclusive: number, maxInclusive: number): number {
      const lo = Math.ceil(minInclusive);
      const hi = Math.floor(maxInclusive);
      if (hi <= lo) return lo;
      return lo + Math.floor(next() * (hi - lo + 1));
    },
    pick<T>(items: readonly T[]): T | undefined {
      if (!items.length) return undefined;
      return items[Math.floor(next() * items.length)];
    },
  };
}

export interface DeterministicSimContext {
  readonly baseSeed: number;
  readonly fixedDt: number;
  tick: number;
  logicalTime: number;
  sessionCounter: number;
  gameplayRng: SeededRng;
  visualRng: SeededRng;
  nextId(prefix?: string): string;
  advance(dt?: number): void;
}

export function createDeterministicContext(
  baseSeed = 202601,
  fixedDt = 1 / 60
): DeterministicSimContext {
  const gameplayRng = createSeededRng(baseSeed);
  const visualRng = createSeededRng((baseSeed ^ 0x9e3779b9) >>> 0);
  const ctx: DeterministicSimContext = {
    baseSeed,
    fixedDt,
    tick: 0,
    logicalTime: 0,
    sessionCounter: 0,
    gameplayRng,
    visualRng,
    nextId(prefix = 'sim') {
      ctx.sessionCounter += 1;
      return `${prefix}_${ctx.baseSeed}_${ctx.sessionCounter}`;
    },
    advance(dt = fixedDt) {
      ctx.tick += 1;
      ctx.logicalTime += dt;
    },
  };
  return ctx;
}

export function hashStringFnv1a(input: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16).padStart(8, '0');
}
