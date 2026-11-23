/**
 * Sintetizador de Efectos de Sonido (SFX) Procedural para NEXUS GAME ENGINE.
 * Genera muestras PCM reales en JavaScript sin eval() y exporta archivos .WAV
 * estándar RIFF/WAVE PCM 16-bit mono listos para guardar en Recursos e IndexedDB.
 */

export type SfxSynthPreset = 'explosion' | 'laser' | 'ui_click' | 'jump' | 'coin' | 'custom';

export type SfxWaveform = 'sine' | 'square' | 'sawtooth' | 'triangle' | 'noise';

export interface SfxSynthParams {
  preset: SfxSynthPreset;
  waveform: SfxWaveform;
  frequency: number; // Hz (40..2400)
  frequencyEnd: number; // Hz sweep final (40..2400)
  duration: number; // segundos (0.04..2.5)
  decay: number; // 0.5..8 (curva exponencial de caída)
  fmAmount: number; // 0..400 Hz
  fmRate: number; // 1..90 Hz
  noiseMix: number; // 0..1
  customFormula?: string; // ej. "sin(2*pi*f*t) * exp(-t*5)"
}

export function getSfxPresetDefaults(preset: SfxSynthPreset): SfxSynthParams {
  switch (preset) {
    case 'explosion':
      return {
        preset: 'explosion',
        waveform: 'sawtooth',
        frequency: 140,
        frequencyEnd: 35,
        duration: 0.72,
        decay: 4.5,
        fmAmount: 95,
        fmRate: 28,
        noiseMix: 0.85,
        customFormula: '(sin(2*pi*f*t) * 0.35 + (rand*2 - 1) * 0.85) * exp(-t*4.5)',
      };
    case 'laser':
      return {
        preset: 'laser',
        waveform: 'sawtooth',
        frequency: 1180,
        frequencyEnd: 160,
        duration: 0.28,
        decay: 5.5,
        fmAmount: 45,
        fmRate: 42,
        noiseMix: 0.08,
        customFormula: 'sin(2*pi*(f*(1-t*2.4))*t) * exp(-t*6)',
      };
    case 'ui_click':
      return {
        preset: 'ui_click',
        waveform: 'triangle',
        frequency: 920,
        frequencyEnd: 640,
        duration: 0.08,
        decay: 18,
        fmAmount: 0,
        fmRate: 12,
        noiseMix: 0.05,
        customFormula: 'sin(2*pi*f*t) * exp(-t*28)',
      };
    case 'jump':
      return {
        preset: 'jump',
        waveform: 'square',
        frequency: 240,
        frequencyEnd: 660,
        duration: 0.22,
        decay: 5.0,
        fmAmount: 0,
        fmRate: 10,
        noiseMix: 0,
        customFormula: 'sin(2*pi*(220 + t*1800)*t) * exp(-t*5)',
      };
    case 'coin':
      return {
        preset: 'coin',
        waveform: 'sine',
        frequency: 988,
        frequencyEnd: 1319,
        duration: 0.32,
        decay: 6.5,
        fmAmount: 0,
        fmRate: 10,
        noiseMix: 0,
        customFormula: 'sin(2*pi*(t < 0.09 ? 988 : 1319)*t) * exp(-t*6.5)',
      };
    default:
      return {
        preset: 'custom',
        waveform: 'sine',
        frequency: 440,
        frequencyEnd: 220,
        duration: 0.4,
        decay: 4.0,
        fmAmount: 25,
        fmRate: 16,
        noiseMix: 0.1,
        customFormula: 'sin(2*pi*f*t) * exp(-t*4)',
      };
  }
}

// ============================================================================
// EVALUADOR SEGURO DE FÓRMULAS MATEMÁTICAS (SIN eval() NI new Function())
// Soporta: +, -, *, /, ^, paréntesis, ?, :, <, >, <=, >=, ==,
// variables: t, dur, f, pi, rand, y funciones: sin, cos, abs, exp, fract, floor, min, max, clamp
// ============================================================================

type Token =
  | { type: 'num'; value: number }
  | { type: 'ident'; value: string }
  | { type: 'op'; value: string }
  | { type: 'lparen' }
  | { type: 'rparen' }
  | { type: 'comma' }
  | { type: 'qmark' }
  | { type: 'colon' };

function tokenizeFormula(expr: string): Token[] {
  const tokens: Token[] = [];
  let i = 0;
  while (i < expr.length) {
    const ch = expr[i];
    if (ch === ' ' || ch === '\t' || ch === '\n') {
      i++;
      continue;
    }
    if ((ch >= '0' && ch <= '9') || (ch === '.' && expr[i + 1] >= '0' && expr[i + 1] <= '9')) {
      let numStr = '';
      while (i < expr.length && ((expr[i] >= '0' && expr[i] <= '9') || expr[i] === '.')) {
        numStr += expr[i++];
      }
      tokens.push({ type: 'num', value: parseFloat(numStr) || 0 });
      continue;
    }
    if ((ch >= 'a' && ch <= 'z') || (ch >= 'A' && ch <= 'Z') || ch === '_') {
      let id = '';
      while (
        i < expr.length &&
        ((expr[i] >= 'a' && expr[i] <= 'z') ||
          (expr[i] >= 'A' && expr[i] <= 'Z') ||
          (expr[i] >= '0' && expr[i] <= '9') ||
          expr[i] === '_')
      ) {
        id += expr[i++];
      }
      tokens.push({ type: 'ident', value: id.toLowerCase() });
      continue;
    }
    const two = expr.slice(i, i + 2);
    if (two === '<=' || two === '>=' || two === '==' || two === '!=') {
      tokens.push({ type: 'op', value: two });
      i += 2;
      continue;
    }
    if ('+-*/^<>'.includes(ch)) {
      tokens.push({ type: 'op', value: ch });
      i++;
      continue;
    }
    if (ch === '(') { tokens.push({ type: 'lparen' }); i++; continue; }
    if (ch === ')') { tokens.push({ type: 'rparen' }); i++; continue; }
    if (ch === ',') { tokens.push({ type: 'comma' }); i++; continue; }
    if (ch === '?') { tokens.push({ type: 'qmark' }); i++; continue; }
    if (ch === ':') { tokens.push({ type: 'colon' }); i++; continue; }
    i++;
  }
  return tokens;
}

export function compileSafeWaveFormula(
  formula: string
): ((t: number, f: number, dur: number, randVal: number) => number) | null {
  const tokens = tokenizeFormula(formula.trim());
  if (tokens.length === 0) return null;

  return (t: number, f: number, dur: number, randVal: number) => {
    let pos = 0;
    const peek = (): Token | undefined => tokens[pos];
    const next = (): Token | undefined => tokens[pos++];

    function parseTernary(): number {
      const cond = parseComparison();
      const tk = peek();
      if (tk?.type === 'qmark') {
        next();
        const yesVal = parseTernary();
        if (peek()?.type === 'colon') next();
        const noVal = parseTernary();
        return cond ? yesVal : noVal;
      }
      return cond;
    }

    function parseComparison(): number {
      let left = parseAddSub();
      while (peek()?.type === 'op' && ['<', '>', '<=', '>=', '==', '!='].includes((peek() as { type: 'op'; value: string }).value)) {
        const op = (next() as { type: 'op'; value: string }).value;
        const right = parseAddSub();
        if (op === '<') left = left < right ? 1 : 0;
        else if (op === '>') left = left > right ? 1 : 0;
        else if (op === '<=') left = left <= right ? 1 : 0;
        else if (op === '>=') left = left >= right ? 1 : 0;
        else if (op === '==') left = Math.abs(left - right) < 1e-6 ? 1 : 0;
        else left = Math.abs(left - right) >= 1e-6 ? 1 : 0;
      }
      return left;
    }

    function parseAddSub(): number {
      let left = parseMulDiv();
      while (peek()?.type === 'op' && ((peek() as { value: string }).value === '+' || (peek() as { value: string }).value === '-')) {
        const op = (next() as { value: string }).value;
        const right = parseMulDiv();
        left = op === '+' ? left + right : left - right;
      }
      return left;
    }

    function parseMulDiv(): number {
      let left = parsePow();
      while (peek()?.type === 'op' && ((peek() as { value: string }).value === '*' || (peek() as { value: string }).value === '/')) {
        const op = (next() as { value: string }).value;
        const right = parsePow();
        left = op === '*' ? left * right : right !== 0 ? left / right : 0;
      }
      return left;
    }

    function parsePow(): number {
      const base = parseUnary();
      if (peek()?.type === 'op' && (peek() as { value: string }).value === '^') {
        next();
        return Math.pow(base, parsePow());
      }
      return base;
    }

    function parseUnary(): number {
      if (peek()?.type === 'op' && (peek() as { value: string }).value === '-') {
        next();
        return -parseUnary();
      }
      if (peek()?.type === 'op' && (peek() as { value: string }).value === '+') {
        next();
        return parseUnary();
      }
      return parsePrimary();
    }

    function parsePrimary(): number {
      const tk = next();
      if (!tk) return 0;
      if (tk.type === 'num') return tk.value;
      if (tk.type === 'lparen') {
        const v = parseTernary();
        if (peek()?.type === 'rparen') next();
        return v;
      }
      if (tk.type === 'ident') {
        if (peek()?.type === 'lparen') {
          next();
          const args: number[] = [];
          if (peek()?.type !== 'rparen') {
            args.push(parseTernary());
            while (peek()?.type === 'comma') {
              next();
              args.push(parseTernary());
            }
          }
          if (peek()?.type === 'rparen') next();
          const a = args[0] ?? 0;
          const b = args[1] ?? 0;
          const c = args[2] ?? 1;
          switch (tk.value) {
            case 'sin': return Math.sin(a);
            case 'cos': return Math.cos(a);
            case 'abs': return Math.abs(a);
            case 'exp': return Math.exp(Math.max(-30, Math.min(30, a)));
            case 'fract': return a - Math.floor(a);
            case 'floor': return Math.floor(a);
            case 'sqrt': return Math.sqrt(Math.max(0, a));
            case 'min': return Math.min(a, b);
            case 'max': return Math.max(a, b);
            case 'clamp': return Math.max(b, Math.min(c, a));
            default: return a;
          }
        }
        switch (tk.value) {
          case 't': return t;
          case 'f': return f;
          case 'dur': return dur;
          case 'pi': return Math.PI;
          case 'rand': return randVal;
          default: return 0;
        }
      }
      return 0;
    }

    const out = parseTernary();
    return Number.isFinite(out) ? Math.max(-1, Math.min(1, out)) : 0;
  };
}

export function synthesizeSfxSamples(
  params: SfxSynthParams,
  sampleRate = 44100
): Float32Array {
  const dur = Math.max(0.04, Math.min(3.0, params.duration || 0.35));
  const len = Math.max(64, Math.round(dur * sampleRate));
  const samples = new Float32Array(len);

  const customFn =
    params.preset === 'custom' && params.customFormula?.trim()
      ? compileSafeWaveFormula(params.customFormula)
      : null;

  // LCG determinista para ruido reproducible sin perder variedad sonora
  let rng = 1234567;
  const nextRand = () => {
    rng = (Math.imul(1664525, rng) + 1013904223) >>> 0;
    return rng / 4294967296;
  };

  let phase = 0;
  const twoPi = Math.PI * 2;
  const f0 = Math.max(20, params.frequency || 440);
  const f1 = Math.max(20, params.frequencyEnd || f0);
  const decay = Math.max(0.5, params.decay || 4);

  for (let i = 0; i < len; i++) {
    const t = i / sampleRate;
    const progress = i / len;
    const randVal = nextRand();

    if (customFn) {
      let val = customFn(t, f0, dur, randVal);
      // Envolvente anti-clic al inicio y final (5ms)
      const fadeIn = Math.min(1, t / 0.004);
      const fadeOut = Math.min(1, (dur - t) / 0.008);
      samples[i] = val * fadeIn * fadeOut * 0.85;
      continue;
    }

    // Frecuencia interpolada + modulación FM
    let instFreq = f0 + (f1 - f0) * progress;
    if (params.preset === 'coin') {
      instFreq = t < dur * 0.28 ? f0 : f1;
    }
    const fm = params.fmAmount > 0 ? Math.sin(twoPi * params.fmRate * t) * params.fmAmount : 0;
    phase += (twoPi * Math.max(20, instFreq + fm)) / sampleRate;

    let osc = 0;
    const pMod = ((phase % twoPi) + twoPi) % twoPi;
    const pNorm = pMod / twoPi;

    switch (params.waveform) {
      case 'square':
        osc = pNorm < 0.5 ? 1 : -1;
        break;
      case 'sawtooth':
        osc = pNorm * 2 - 1;
        break;
      case 'triangle':
        osc = 1 - 4 * Math.abs(Math.round(pNorm - 0.25) - (pNorm - 0.25));
        break;
      case 'noise':
        osc = randVal * 2 - 1;
        break;
      default:
        osc = Math.sin(phase);
    }

    const noise = randVal * 2 - 1;
    const mixed = osc * (1 - params.noiseMix) + noise * params.noiseMix;
    const env = Math.exp(-t * decay) * Math.min(1, t / 0.004) * Math.min(1, (dur - t) / 0.01);
    samples[i] = Math.max(-1, Math.min(1, mixed * env * 0.82));
  }

  return samples;
}

/**
 * Codifica muestras Float32 (-1..1) en un archivo .WAV RIFF/WAVE PCM 16-bit mono válido.
 */
export function encodeFloat32ToWavBlob(samples: Float32Array, sampleRate = 44100): Blob {
  const bytesPerSample = 2;
  const dataByteLen = samples.length * bytesPerSample;
  const buffer = new ArrayBuffer(44 + dataByteLen);
  const view = new DataView(buffer);

  const writeStr = (offset: number, str: string) => {
    for (let i = 0; i < str.length; i++) {
      view.setUint8(offset + i, str.charCodeAt(i));
    }
  };

  // Cabecera RIFF estándar de 44 bytes
  writeStr(0, 'RIFF');
  view.setUint32(4, 36 + dataByteLen, true);
  writeStr(8, 'WAVE');
  writeStr(12, 'fmt ');
  view.setUint32(16, 16, true); // Subchunk1Size (16 = PCM)
  view.setUint16(20, 1, true); // AudioFormat (1 = PCM sin compresión)
  view.setUint16(22, 1, true); // NumChannels (1 = Mono)
  view.setUint32(24, sampleRate, true); // SampleRate
  view.setUint32(28, sampleRate * bytesPerSample, true); // ByteRate
  view.setUint16(32, bytesPerSample, true); // BlockAlign
  view.setUint16(34, 16, true); // BitsPerSample
  writeStr(36, 'data');
  view.setUint32(40, dataByteLen, true);

  let offset = 44;
  for (let i = 0; i < samples.length; i++) {
    const s = Math.max(-1, Math.min(1, samples[i]));
    view.setInt16(offset, s < 0 ? s * 0x8000 : s * 0x7fff, true);
    offset += 2;
  }

  return new Blob([buffer], { type: 'audio/wav' });
}

export function previewSfxWithWebAudio(params: SfxSynthParams): void {
  if (typeof window === 'undefined') return;
  const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!AudioCtx) return;
  const ctx = new AudioCtx();
  const samples = synthesizeSfxSamples(params, ctx.sampleRate);
  const buf = ctx.createBuffer(1, samples.length, ctx.sampleRate);
  buf.getChannelData(0).set(samples);
  const src = ctx.createBufferSource();
  src.buffer = buf;
  const gain = ctx.createGain();
  gain.gain.value = 0.75;
  src.connect(gain);
  gain.connect(ctx.destination);
  src.onended = () => {
    void ctx.close().catch(() => {});
  };
  src.start();
}
