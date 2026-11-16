import type { AudioBusSettings } from '../core/types';

export type SynthPresetId = 'coin' | 'jump' | 'hit' | 'powerup' | 'step' | 'win';
export type AudioChannel = 'music' | 'sfx' | 'ui';

export const DEFAULT_AUDIO_BUSES: AudioBusSettings = {
  master: 0.85,
  music: 0.7,
  sfx: 0.9,
  ui: 0.8,
  muted: {
    master: false,
    music: false,
    sfx: false,
    ui: false,
  },
};

export const SYNTH_PRESETS: Array<{ id: SynthPresetId; label: string }> = [
  { id: 'coin', label: 'Moneda / Coleccionable' },
  { id: 'jump', label: 'Salto' },
  { id: 'hit', label: 'Impacto / Daño' },
  { id: 'powerup', label: 'Power-Up / Mejora' },
  { id: 'step', label: 'Paso suave' },
  { id: 'win', label: 'Victoria / Nivel completado' },
];

/**
 * Motor de audio de NEXUS basado exclusivamente en Web Audio API.
 * Funciona 100 % sin conexión: reproduce archivos WAV/MP3/OGG locales
 * y efectos sintetizados integrados con control por canales (Master, Music, SFX, UI).
 */
export class NexusAudioEngine {
  private ctx: AudioContext | null = null;
  private buses: AudioBusSettings = structuredClone(DEFAULT_AUDIO_BUSES);
  private decodedCache = new Map<string, AudioBuffer>();
  private blobRefCache = new Map<string, Blob>();

  setBusSettings(settings?: AudioBusSettings): void {
    this.buses = settings ? structuredClone(settings) : structuredClone(DEFAULT_AUDIO_BUSES);
  }

  getEffectiveGain(channel: AudioChannel): number {
    if (this.buses.muted.master || this.buses.muted[channel]) return 0;
    return Math.max(0, Math.min(1, this.buses.master * this.buses[channel]));
  }

  private ensureContext(): AudioContext | null {
    if (typeof window === 'undefined') return null;
    const AudioCtx =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioCtx) return null;
    if (!this.ctx) {
      this.ctx = new AudioCtx();
    }
    if (this.ctx.state === 'suspended') {
      void this.ctx.resume().catch(() => {});
    }
    return this.ctx;
  }

  async playAssetBlob(
    assetId: string,
    blob: Blob,
    options: { channel?: AudioChannel; volume?: number; pitch?: number; loop?: boolean } = {}
  ): Promise<void> {
    const ctx = this.ensureContext();
    if (!ctx) return;

    const channel = options.channel ?? 'sfx';
    const gainVal = this.getEffectiveGain(channel) * (options.volume ?? 1);
    if (gainVal <= 0.001) return;

    try {
      let buffer = this.decodedCache.get(assetId);
      if (!buffer || this.blobRefCache.get(assetId) !== blob) {
        const ab = await blob.arrayBuffer();
        buffer = await ctx.decodeAudioData(ab.slice(0));
        this.decodedCache.set(assetId, buffer);
        this.blobRefCache.set(assetId, blob);
      }
      const source = ctx.createBufferSource();
      source.buffer = buffer;
      source.loop = Boolean(options.loop);
      source.playbackRate.value = Math.max(0.25, Math.min(3, options.pitch ?? 1));

      const gain = ctx.createGain();
      gain.gain.value = gainVal;
      source.connect(gain);
      gain.connect(ctx.destination);
      source.start(0);
    } catch {
      // Fallo silencioso en entornos sin códec de audio (p. ej. headless sin hardware)
    }
  }

  setChannelVolume(channel: 'master' | AudioChannel, volume: number): void {
    this.buses[channel] = Math.max(0, Math.min(1, volume));
  }

  playSynthPreset(
    preset: SynthPresetId,
    channel: AudioChannel = 'sfx',
    options: { volume?: number; pitch?: number } = {}
  ): void {
    const ctx = this.ensureContext();
    if (!ctx) return;
    const gainVal = this.getEffectiveGain(channel) * Math.max(0, Math.min(2, options.volume ?? 1));
    if (gainVal <= 0.001) return;

    const pitchMul = Math.max(0.25, Math.min(3, options.pitch ?? 1));
    const now = ctx.currentTime;

    const playTone = (
      type: OscillatorType,
      fStart: number,
      fEnd: number,
      startOffset: number,
      dur: number,
      vol = 0.25
    ) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = type;
      osc.frequency.setValueAtTime(fStart * pitchMul, now + startOffset);
      osc.frequency.exponentialRampToValueAtTime(Math.max(20, fEnd * pitchMul), now + startOffset + dur);
      gain.gain.setValueAtTime(vol * gainVal, now + startOffset);
      gain.gain.exponentialRampToValueAtTime(0.001, now + startOffset + dur);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now + startOffset);
      osc.stop(now + startOffset + dur + 0.01);
    };

    switch (preset) {
      case 'coin':
        playTone('square', 987.77, 987.77, 0, 0.07, 0.2);
        playTone('square', 1318.51, 1318.51, 0.07, 0.16, 0.2);
        break;
      case 'jump':
        playTone('square', 220, 560, 0, 0.16, 0.18);
        break;
      case 'hit':
        playTone('sawtooth', 170, 55, 0, 0.18, 0.25);
        break;
      case 'powerup':
        playTone('triangle', 440, 554, 0, 0.08, 0.22);
        playTone('triangle', 554, 659, 0.08, 0.08, 0.22);
        playTone('triangle', 659, 880, 0.16, 0.14, 0.24);
        break;
      case 'step':
        playTone('triangle', 120, 75, 0, 0.045, 0.12);
        break;
      case 'win':
        playTone('triangle', 523.25, 523.25, 0, 0.1, 0.22);
        playTone('triangle', 659.25, 659.25, 0.1, 0.1, 0.22);
        playTone('triangle', 783.99, 783.99, 0.2, 0.1, 0.22);
        playTone('triangle', 1046.5, 1046.5, 0.3, 0.26, 0.25);
        break;
    }
  }

  dispose(): void {
    this.decodedCache.clear();
    this.blobRefCache.clear();
    if (this.ctx) {
      void this.ctx.close().catch(() => {});
      this.ctx = null;
    }
  }
}

export const sharedAudioEngine = new NexusAudioEngine();
