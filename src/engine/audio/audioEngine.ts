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
 * Motor de audio profesional de NEXUS basado en Web Audio API.
 * Enruta cada canal (music, sfx, ui) a través de nodos GainNode persistentes
 * hacia masterGain para que el volumen y silencio respondan en tiempo real.
 */
export class NexusAudioEngine {
  private ctx: AudioContext | null = null;
  private masterGain: GainNode | null = null;
  private busGains: Record<AudioChannel, GainNode | null> = {
    music: null,
    sfx: null,
    ui: null,
  };
  private buses: AudioBusSettings = structuredClone(DEFAULT_AUDIO_BUSES);
  private decodedCache = new Map<string, AudioBuffer>();
  private blobRefCache = new Map<string, Blob>();

  private activeMusicSource: AudioBufferSourceNode | null = null;
  private activeMusicGain: GainNode | null = null;
  private activeMusicAssetId: string | null = null;
  private musicRequestToken = 0;

  private activeSources = new Set<AudioBufferSourceNode>();
  private listeners = new Set<() => void>();

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  private notify(): void {
    for (const fn of this.listeners) {
      try {
        fn();
      } catch {
        // Ignorar errores en listeners de UI
      }
    }
  }

  setBusSettings(settings?: AudioBusSettings): void {
    this.buses = settings
      ? {
          master: settings.master ?? DEFAULT_AUDIO_BUSES.master,
          music: settings.music ?? DEFAULT_AUDIO_BUSES.music,
          sfx: settings.sfx ?? DEFAULT_AUDIO_BUSES.sfx,
          ui: settings.ui ?? DEFAULT_AUDIO_BUSES.ui,
          muted: {
            master: Boolean(settings.muted?.master),
            music: Boolean(settings.muted?.music),
            sfx: Boolean(settings.muted?.sfx),
            ui: Boolean(settings.muted?.ui),
          },
        }
      : structuredClone(DEFAULT_AUDIO_BUSES);
    this.syncGainNodes();
  }

  getBusSettings(): AudioBusSettings {
    return structuredClone(this.buses);
  }

  getEffectiveGain(channel: AudioChannel): number {
    if (this.buses.muted.master || this.buses.muted[channel]) return 0;
    return Math.max(0, Math.min(1, this.buses.master * this.buses[channel]));
  }

  private syncGainNodes(): void {
    if (!this.ctx || !this.masterGain) return;
    const now = this.ctx.currentTime;
    const masterVal = this.buses.muted.master ? 0 : Math.max(0, Math.min(1.5, this.buses.master));
    this.masterGain.gain.setTargetAtTime(masterVal, now, 0.015);
    (['music', 'sfx', 'ui'] as AudioChannel[]).forEach((ch) => {
      const node = this.busGains[ch];
      if (!node) return;
      const chVal = this.buses.muted[ch] ? 0 : Math.max(0, Math.min(1.5, this.buses[ch]));
      node.gain.setTargetAtTime(chVal, now, 0.015);
    });
  }

  private ensureContext(): AudioContext | null {
    if (typeof window === 'undefined') return null;
    const AudioCtx =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioCtx) return null;
    if (!this.ctx) {
      this.ctx = new AudioCtx();
      this.masterGain = this.ctx.createGain();
      this.masterGain.connect(this.ctx.destination);
      (['music', 'sfx', 'ui'] as AudioChannel[]).forEach((ch) => {
        const g = this.ctx!.createGain();
        g.connect(this.masterGain!);
        this.busGains[ch] = g;
      });
      this.syncGainNodes();
    }
    if (this.ctx.state === 'suspended') {
      void this.ctx.resume().catch(() => {});
    }
    return this.ctx;
  }

  unlock(): void {
    const ctx = this.ensureContext();
    if (ctx && ctx.state === 'suspended') {
      void ctx.resume().catch(() => {});
    }
  }

  private async decodeBlob(assetId: string, blob: Blob): Promise<AudioBuffer | null> {
    const ctx = this.ensureContext();
    if (!ctx) return null;
    let buffer = this.decodedCache.get(assetId);
    if (!buffer || this.blobRefCache.get(assetId) !== blob) {
      const ab = await blob.arrayBuffer();
      buffer = await ctx.decodeAudioData(ab.slice(0));
      this.decodedCache.set(assetId, buffer);
      this.blobRefCache.set(assetId, blob);
    }
    return buffer;
  }

  async playAssetBlob(
    assetId: string,
    blob: Blob,
    options: { channel?: AudioChannel; volume?: number; pitch?: number; loop?: boolean } = {}
  ): Promise<void> {
    const channel = options.channel ?? 'sfx';
    if (channel === 'music') {
      await this.playMusicAsset(assetId, blob, {
        volume: options.volume,
        loop: options.loop ?? true,
        pitch: options.pitch,
      });
      return;
    }

    const ctx = this.ensureContext();
    if (!ctx) return;

    const busNode = this.busGains[channel] ?? ctx.destination;
    const clipVol = Math.max(0, Math.min(2, options.volume ?? 1));
    if (clipVol <= 0.001) return;

    try {
      const buffer = await this.decodeBlob(assetId, blob);
      if (!buffer) return;
      const source = ctx.createBufferSource();
      source.buffer = buffer;
      source.loop = Boolean(options.loop);
      source.playbackRate.value = Math.max(0.25, Math.min(3, options.pitch ?? 1));

      const gain = ctx.createGain();
      gain.gain.value = clipVol;
      source.connect(gain);
      gain.connect(busNode);
      this.activeSources.add(source);
      source.onended = () => {
        this.activeSources.delete(source);
      };
      source.start(0);
    } catch {
      // Fallo silencioso en entornos sin códec de audio (p. ej. headless sin hardware)
    }
  }

  async playMusicAsset(
    assetId: string,
    blob: Blob,
    options: {
      volume?: number;
      loop?: boolean;
      pitch?: number;
      keepIfSame?: boolean;
    } = {}
  ): Promise<void> {
    if (
      options.keepIfSame &&
      this.activeMusicSource &&
      this.activeMusicAssetId === assetId
    ) {
      if (this.activeMusicGain && this.ctx && typeof options.volume === 'number') {
        this.activeMusicGain.gain.setTargetAtTime(
          Math.max(0, Math.min(2, options.volume)),
          this.ctx.currentTime,
          0.03
        );
      }
      return;
    }

    const token = ++this.musicRequestToken;
    this.stopMusicInternal(false);

    const ctx = this.ensureContext();
    if (!ctx) return;

    try {
      const buffer = await this.decodeBlob(assetId, blob);
      if (!buffer || token !== this.musicRequestToken) return;

      const source = ctx.createBufferSource();
      source.buffer = buffer;
      source.loop = options.loop ?? true;
      source.playbackRate.value = Math.max(0.25, Math.min(3, options.pitch ?? 1));

      const clipGain = ctx.createGain();
      clipGain.gain.value = Math.max(0, Math.min(2, options.volume ?? 1));
      const busNode = this.busGains.music ?? ctx.destination;

      source.connect(clipGain);
      clipGain.connect(busNode);

      this.activeMusicSource = source;
      this.activeMusicGain = clipGain;
      this.activeMusicAssetId = assetId;
      this.notify();

      source.onended = () => {
        if (this.activeMusicSource === source) {
          this.activeMusicSource = null;
          this.activeMusicGain = null;
          this.activeMusicAssetId = null;
          this.notify();
        }
      };

      source.start(0);
    } catch {
      if (token === this.musicRequestToken) {
        this.activeMusicAssetId = null;
        this.notify();
      }
    }
  }

  private stopMusicInternal(notifyListeners: boolean): void {
    if (this.activeMusicSource) {
      try {
        this.activeMusicSource.onended = null;
        this.activeMusicSource.stop();
        this.activeMusicSource.disconnect();
      } catch {
        // Ignorar si ya estaba detenido
      }
      this.activeMusicSource = null;
    }
    if (this.activeMusicGain) {
      try {
        this.activeMusicGain.disconnect();
      } catch {
        // Ignorar
      }
      this.activeMusicGain = null;
    }
    const hadMusic = this.activeMusicAssetId !== null;
    this.activeMusicAssetId = null;
    if (notifyListeners && hadMusic) {
      this.notify();
    }
  }

  stopMusic(): void {
    this.musicRequestToken++;
    this.stopMusicInternal(true);
  }

  stopAll(): void {
    this.musicRequestToken++;
    this.stopMusicInternal(true);
    for (const src of this.activeSources) {
      try {
        src.onended = null;
        src.stop();
        src.disconnect();
      } catch {
        // Ignorar
      }
    }
    this.activeSources.clear();
  }

  isPlayingMusic(assetId?: string): boolean {
    if (!this.activeMusicSource || !this.activeMusicAssetId) return false;
    return assetId ? this.activeMusicAssetId === assetId : true;
  }

  getCurrentMusicAssetId(): string | null {
    return this.activeMusicAssetId;
  }

  setChannelVolume(channel: 'master' | AudioChannel, volume: number): void {
    this.buses[channel] = Math.max(0, Math.min(1, volume));
    this.syncGainNodes();
  }

  playSynthPreset(
    preset: SynthPresetId,
    channel: AudioChannel = 'sfx',
    options: { volume?: number; pitch?: number } = {}
  ): void {
    const ctx = this.ensureContext();
    if (!ctx) return;
    if (this.getEffectiveGain(channel) <= 0.001) return;
    const clipVol = Math.max(0, Math.min(2, options.volume ?? 1));
    if (clipVol <= 0.001) return;

    const busNode = this.busGains[channel] ?? ctx.destination;
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
      osc.frequency.exponentialRampToValueAtTime(
        Math.max(20, fEnd * pitchMul),
        now + startOffset + dur
      );
      gain.gain.setValueAtTime(vol * clipVol, now + startOffset);
      gain.gain.exponentialRampToValueAtTime(0.001, now + startOffset + dur);
      osc.connect(gain);
      gain.connect(busNode);
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
    this.stopAll();
    this.decodedCache.clear();
    this.blobRefCache.clear();
    if (this.ctx) {
      void this.ctx.close().catch(() => {});
      this.ctx = null;
      this.masterGain = null;
      this.busGains = { music: null, sfx: null, ui: null };
    }
  }
}

export const sharedAudioEngine = new NexusAudioEngine();
