import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Music,
  Play,
  Save,
  Sliders,
  Square,
  Upload,
  Volume2,
  VolumeX,
  Waves,
} from 'lucide-react';
import {
  DEFAULT_AUDIO_BUSES,
  SYNTH_PRESETS,
  sharedAudioEngine,
} from '../../engine/audio/audioEngine';
import {
  compileSafeWaveFormula,
  encodeFloat32ToWavBlob,
  getSfxPresetDefaults,
  previewSfxWithWebAudio,
  synthesizeSfxSamples,
  type SfxSynthParams,
  type SfxSynthPreset,
  type SfxWaveform,
} from '../../engine/audio/sfxSynthesizer';
import type {
  AudioBusSettings,
  SceneBackgroundMusicConfig,
  SceneData,
} from '../../engine/core/types';
import type { ProjectAssetMeta } from '../../project/models/project';
import { createId, sanitizeFilename } from '../../utils/id';
import { NumericInput } from '../common/NumericInput';

interface AudioMixerPanelProps {
  audioBuses?: AudioBusSettings;
  assets: ProjectAssetMeta[];
  assetBlobs: Map<string, Blob>;
  activeScene?: SceneData;
  onChangeAudioBuses: (next: AudioBusSettings) => void;
  onUpdateScene?: (updater: (scene: SceneData) => SceneData) => void;
  onImportFiles?: (files: File[]) => void;
  onCreateAsset?: (meta: ProjectAssetMeta, blob: Blob) => Promise<void> | void;
}

const SFX_SYNTH_PRESETS: Array<{ id: SfxSynthPreset; label: string }> = [
  { id: 'explosion', label: 'Explosión' },
  { id: 'laser', label: 'Láser' },
  { id: 'ui_click', label: 'Clic UI' },
  { id: 'jump', label: 'Salto' },
  { id: 'coin', label: 'Moneda' },
  { id: 'custom', label: 'Personalizado' },
];

export const AudioMixerPanel: React.FC<AudioMixerPanelProps> = ({
  audioBuses,
  assets,
  assetBlobs,
  activeScene,
  onChangeAudioBuses,
  onUpdateScene,
  onImportFiles,
  onCreateAsset,
}) => {
  const buses = audioBuses ?? DEFAULT_AUDIO_BUSES;
  const audioAssets = assets.filter((a) => a.kind === 'audio');
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const waveCanvasRef = useRef<HTMLCanvasElement | null>(null);

  const [audioView, setAudioView] = useState<'mixer' | 'sfx_synth'>('mixer');
  const [sfxName, setSfxName] = useState('sfx_laser');
  const [sfxParams, setSfxParams] = useState<SfxSynthParams>(() =>
    getSfxPresetDefaults('laser')
  );
  const [isSavingWav, setIsSavingWav] = useState(false);

  const [playingTrackId, setPlayingTrackId] = useState<string | null>(() =>
    sharedAudioEngine.getCurrentMusicAssetId()
  );

  useEffect(() => {
    return sharedAudioEngine.subscribe(() => {
      setPlayingTrackId(sharedAudioEngine.getCurrentMusicAssetId());
    });
  }, []);

  const formulaValid = useMemo(() => {
    if (sfxParams.preset !== 'custom') return true;
    return compileSafeWaveFormula(sfxParams.customFormula ?? '') !== null;
  }, [sfxParams.preset, sfxParams.customFormula]);

  const previewSamples = useMemo(
    () => synthesizeSfxSamples(sfxParams, 16000),
    [sfxParams]
  );

  useEffect(() => {
    if (audioView !== 'sfx_synth') return;
    const canvas = waveCanvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const w = canvas.width;
    const h = canvas.height;
    ctx.fillStyle = '#0d0e13';
    ctx.fillRect(0, 0, w, h);

    ctx.strokeStyle = '#252633';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, h / 2);
    ctx.lineTo(w, h / 2);
    ctx.stroke();

    ctx.strokeStyle = formulaValid ? '#38bdf8' : '#f87171';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    const n = previewSamples.length;
    for (let x = 0; x < w; x++) {
      const idx = Math.min(n - 1, Math.floor((x / w) * n));
      const y = h / 2 - previewSamples[idx] * (h * 0.42);
      if (x === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.stroke();
  }, [audioView, previewSamples, formulaValid]);

  const handleSaveWav = async () => {
    if (!onCreateAsset || isSavingWav) return;
    setIsSavingWav(true);
    try {
      const samples = synthesizeSfxSamples(sfxParams, 44100);
      const blob = encodeFloat32ToWavBlob(samples, 44100);
      const cleanBase = sanitizeFilename(sfxName.trim() || `sfx_${sfxParams.preset}`).replace(
        /\.wav$/i,
        ''
      );
      const meta: ProjectAssetMeta = {
        id: createId('aud'),
        name: cleanBase,
        filename: `${cleanBase}.wav`,
        mimeType: 'audio/wav',
        format: 'wav',
        kind: 'audio',
        folderId: null,
        size: blob.size,
        width: 0,
        height: 0,
        thumbnailDataUrl: '',
        createdAt: Date.now(),
      };
      await onCreateAsset(meta, blob);
    } finally {
      setIsSavingWav(false);
    }
  };

  const updateChannel = (channel: 'master' | 'music' | 'sfx' | 'ui', val: number) => {
    const next: AudioBusSettings = {
      ...buses,
      [channel]: val,
      muted: { ...buses.muted },
    };
    sharedAudioEngine.setBusSettings(next);
    onChangeAudioBuses(next);
  };

  const toggleMute = (channel: 'master' | 'music' | 'sfx' | 'ui') => {
    const next: AudioBusSettings = {
      ...buses,
      muted: {
        ...buses.muted,
        [channel]: !buses.muted[channel],
      },
    };
    sharedAudioEngine.setBusSettings(next);
    onChangeAudioBuses(next);
  };

  const bgm: SceneBackgroundMusicConfig = activeScene?.backgroundMusic ?? {
    assetId: null,
    volume: 0.8,
    loop: true,
    autoPlay: true,
    keepPlayingIfSameTrack: true,
  };

  const updateBgm = (patch: Partial<SceneBackgroundMusicConfig>) => {
    if (!onUpdateScene) return;
    onUpdateScene((scene) => ({
      ...scene,
      backgroundMusic: {
        assetId: scene.backgroundMusic?.assetId ?? null,
        volume: scene.backgroundMusic?.volume ?? 0.8,
        loop: scene.backgroundMusic?.loop ?? true,
        autoPlay: scene.backgroundMusic?.autoPlay ?? true,
        keepPlayingIfSameTrack: scene.backgroundMusic?.keepPlayingIfSameTrack ?? true,
        ...patch,
      },
    }));
  };

  const channels: Array<{ key: 'master' | 'music' | 'sfx' | 'ui'; label: string }> = [
    { key: 'master', label: 'Master' },
    { key: 'music', label: 'Música' },
    { key: 'sfx', label: 'Efectos (SFX)' },
    { key: 'ui', label: 'Interfaz (UI)' },
  ];

  return (
    <div className="flex h-full flex-col overflow-hidden">
      {/* Sub-barra de modos de audio */}
      <div className="flex items-center justify-between border-b border-[#262630] bg-[#16161b] px-3 py-1.5">
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={() => setAudioView('mixer')}
            className={`inline-flex items-center gap-1.5 rounded px-2.5 py-1 text-[11px] font-semibold transition-colors ${
              audioView === 'mixer'
                ? 'bg-sky-600 text-white'
                : 'bg-[#202028] text-zinc-300 hover:bg-[#2a2a34]'
            }`}
          >
            <Sliders className="h-3 w-3" />
            Mezclador y Música
          </button>
          <button
            type="button"
            onClick={() => setAudioView('sfx_synth')}
            className={`inline-flex items-center gap-1.5 rounded px-2.5 py-1 text-[11px] font-semibold transition-colors ${
              audioView === 'sfx_synth'
                ? 'bg-emerald-600 text-white'
                : 'bg-[#202028] text-zinc-300 hover:bg-[#2a2a34]'
            }`}
          >
            <Waves className="h-3 w-3" />
            Sintetizador SFX (.WAV)
          </button>
        </div>
        <span className="hidden sm:inline text-[10px] text-zinc-500">
          {audioView === 'sfx_synth'
            ? 'Genera efectos PCM reales y guárdalos en Recursos sin eval()'
            : `${audioAssets.length} pistas de audio cargadas`}
        </span>
      </div>

      {audioView === 'mixer' ? (
        <div className="grid min-h-0 flex-1 grid-cols-1 gap-2.5 overflow-y-auto p-3 lg:grid-cols-3">
          {/* Columna 1: Mezclador por canales */}
          <div className="rounded border border-[#2c2c34] bg-[#16161a] p-2.5 space-y-2">
            <div className="flex items-center justify-between gap-2">
              <div className="text-[11px] font-semibold uppercase tracking-wide text-zinc-400">
                Mezclador Web Audio (En vivo)
              </div>
              {playingTrackId && (
                <button
                  type="button"
                  onClick={() => sharedAudioEngine.stopAll()}
                  className="inline-flex items-center gap-1 rounded bg-red-600/20 px-1.5 py-0.5 text-[10px] font-semibold text-red-300 hover:bg-red-600/30"
                >
                  <Square className="h-2.5 w-2.5 fill-current" />
                  Detener todo
                </button>
              )}
            </div>
            <div className="space-y-2">
              {channels.map(({ key, label }) => {
                const muted = buses.muted[key];
                return (
                  <div key={key} className="flex items-center gap-2 text-xs">
                    <button
                      type="button"
                      onClick={() => toggleMute(key)}
                      aria-label={`${muted ? 'Activar' : 'Silenciar'} canal ${label}`}
                      className={`rounded p-1 ${
                        muted ? 'bg-red-500/20 text-red-400' : 'bg-[#222229] text-zinc-300'
                      }`}
                    >
                      {muted ? (
                        <VolumeX className="h-3.5 w-3.5" />
                      ) : (
                        <Volume2 className="h-3.5 w-3.5" />
                      )}
                    </button>
                    <span className="w-24 text-zinc-200">{label}</span>
                    <input
                      type="range"
                      min={0}
                      max={1}
                      step={0.05}
                      aria-label={`Volumen ${label}`}
                      value={buses[key]}
                      onChange={(e) => updateChannel(key, Number(e.target.value))}
                      className="flex-1 accent-blue-500"
                    />
                    <span className="w-10 text-right font-mono tabular-nums text-zinc-400">
                      {Math.round(buses[key] * 100)}%
                    </span>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Columna 2: Música de fondo de la escena */}
          <div className="rounded border border-[#2c2c34] bg-[#16161a] p-2.5 space-y-2">
            <div className="flex items-center justify-between gap-2">
              <div className="inline-flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-sky-400">
                <Music className="h-3.5 w-3.5" />
                <span>Música de fondo ({activeScene?.name ?? 'Escena'})</span>
              </div>
              {bgm.assetId && (
                <button
                  type="button"
                  onClick={() => {
                    if (playingTrackId === bgm.assetId) {
                      sharedAudioEngine.stopMusic();
                    } else {
                      const blob = assetBlobs.get(bgm.assetId!);
                      if (blob) {
                        sharedAudioEngine.setBusSettings(buses);
                        sharedAudioEngine.unlock();
                        void sharedAudioEngine.playMusicAsset(bgm.assetId!, blob, {
                          volume: bgm.volume ?? 0.8,
                          loop: bgm.loop !== false,
                        });
                      }
                    }
                  }}
                  className={`inline-flex items-center gap-1 rounded px-2 py-0.5 text-[10px] font-semibold ${
                    playingTrackId === bgm.assetId
                      ? 'bg-red-600 text-white'
                      : 'bg-sky-600 text-white hover:bg-sky-500'
                  }`}
                >
                  {playingTrackId === bgm.assetId ? (
                    <>
                      <Square className="h-2.5 w-2.5 fill-current" /> Detener
                    </>
                  ) : (
                    <>
                      <Play className="h-2.5 w-2.5" /> Probar
                    </>
                  )}
                </button>
              )}
            </div>

            <select
              aria-label="Pista de música de fondo de la escena"
              value={bgm.assetId ?? ''}
              disabled={!onUpdateScene}
              onChange={(e) => updateBgm({ assetId: e.target.value || null })}
              className="w-full rounded border border-[#343440] bg-[#111115] px-2 py-1 text-xs text-zinc-100 focus:border-sky-500 focus:outline-none"
            >
              <option value="">Sin música automática en esta escena</option>
              {audioAssets.map((a) => (
                <option key={a.id} value={a.id}>
                  🎵 {a.name} ({a.format.toUpperCase()})
                </option>
              ))}
            </select>

            <div className="flex items-center gap-2 text-[11px]">
              <span className="text-zinc-400">Vol. pista</span>
              <input
                type="range"
                min={0}
                max={1.5}
                step={0.05}
                aria-label="Volumen de música de la escena"
                value={bgm.volume ?? 0.8}
                disabled={!onUpdateScene}
                onChange={(e) => updateBgm({ volume: Number(e.target.value) })}
                className="flex-1 accent-sky-500"
              />
              <span className="w-10 text-right font-mono text-zinc-300">
                {Math.round((bgm.volume ?? 0.8) * 100)}%
              </span>
            </div>

            <div className="grid grid-cols-2 gap-1.5 text-[11px] text-zinc-300">
              <label className="flex items-center gap-1.5 cursor-pointer">
                <input
                  type="checkbox"
                  checked={bgm.loop !== false}
                  disabled={!onUpdateScene}
                  onChange={(e) => updateBgm({ loop: e.target.checked })}
                  className="accent-sky-500"
                />
                <span>Repetir en bucle</span>
              </label>
              <label className="flex items-center gap-1.5 cursor-pointer">
                <input
                  type="checkbox"
                  checked={bgm.autoPlay !== false}
                  disabled={!onUpdateScene}
                  onChange={(e) => updateBgm({ autoPlay: e.target.checked })}
                  className="accent-sky-500"
                />
                <span>Sonar al iniciar</span>
              </label>
              <label className="col-span-2 flex items-center gap-1.5 cursor-pointer text-zinc-400">
                <input
                  type="checkbox"
                  checked={bgm.keepPlayingIfSameTrack !== false}
                  disabled={!onUpdateScene}
                  onChange={(e) => updateBgm({ keepPlayingIfSameTrack: e.target.checked })}
                  className="accent-sky-500"
                />
                <span>Continuar sin cortes si la siguiente escena usa la misma pista</span>
              </label>
            </div>
          </div>

          {/* Columna 3: Audios importados desde PC y efectos synth */}
          <div className="rounded border border-[#2c2c34] bg-[#16161a] p-2.5 space-y-2">
            <div className="flex items-center justify-between gap-2">
              <div className="text-[11px] font-semibold uppercase tracking-wide text-zinc-400">
                Audios en Proyecto ({audioAssets.length})
              </div>
              {onImportFiles && (
                <>
                  <input
                    ref={fileInputRef}
                    type="file"
                    multiple
                    accept=".wav,.mp3,.ogg,.m4a,.aac,.flac,.webm,audio/*"
                    className="hidden"
                    onChange={(e) => {
                      const list = e.target.files ? Array.from(e.target.files) : [];
                      if (list.length > 0) {
                        onImportFiles(list);
                        e.target.value = '';
                      }
                    }}
                  />
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    className="inline-flex items-center gap-1 rounded bg-sky-600 px-2 py-1 text-[11px] font-semibold text-white hover:bg-sky-500 whitespace-nowrap"
                  >
                    <Upload className="h-3 w-3" />
                    Importar audio (PC)
                  </button>
                </>
              )}
            </div>

            {audioAssets.length === 0 ? (
              <p className="rounded border border-dashed border-[#30303b] bg-[#121216] p-2 text-[11px] text-zinc-400">
                Importa archivos MP3/WAV desde tu PC o crea efectos .WAV en el Sintetizador SFX.
              </p>
            ) : (
              <div className="flex max-h-20 flex-wrap gap-1.5 overflow-y-auto">
                {audioAssets.map((a) => {
                  const isPlaying = playingTrackId === a.id;
                  return (
                    <button
                      key={a.id}
                      type="button"
                      onClick={() => {
                        if (isPlaying) {
                          sharedAudioEngine.stopMusic();
                          return;
                        }
                        const blob = assetBlobs.get(a.id);
                        if (blob) {
                          sharedAudioEngine.setBusSettings(buses);
                          sharedAudioEngine.unlock();
                          void sharedAudioEngine.playMusicAsset(a.id, blob, {
                            loop: false,
                            volume: 1,
                          });
                        }
                      }}
                      className={`inline-flex items-center gap-1 rounded border px-2 py-1 text-[11px] ${
                        isPlaying
                          ? 'border-red-500/60 bg-red-600/20 text-red-200'
                          : 'border-[#34343f] bg-[#1c1c22] text-zinc-200 hover:border-sky-500'
                      }`}
                    >
                      {isPlaying ? (
                        <Square className="h-2.5 w-2.5 fill-current text-red-400" />
                      ) : (
                        <Play className="h-3 w-3 text-sky-400" />
                      )}
                      <span className="max-w-32 truncate">{a.name}</span>
                    </button>
                  );
                })}
              </div>
            )}

            <div className="border-t border-[#272730] pt-1.5">
              <div className="mb-1 text-[10px] uppercase tracking-wide text-zinc-500">
                Efectos rápidos integrados
              </div>
              <div className="flex flex-wrap gap-1">
                {SYNTH_PRESETS.map((preset) => (
                  <button
                    key={preset.id}
                    type="button"
                    onClick={() => {
                      sharedAudioEngine.setBusSettings(buses);
                      sharedAudioEngine.playSynthPreset(preset.id, 'sfx');
                    }}
                    className="inline-flex items-center gap-1 rounded border border-[#33333e] bg-[#212128] px-1.5 py-0.5 text-[10px] text-zinc-300 hover:border-emerald-500/60 whitespace-nowrap"
                  >
                    <Play className="h-2.5 w-2.5 text-emerald-400" />
                    <span>{preset.label}</span>
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>
      ) : (
        /* Vista Sintetizador SFX (.WAV) */
        <div className="flex min-h-0 flex-1 gap-3 overflow-y-auto p-3">
          <div className="flex-1 space-y-2 min-w-0">
            <div className="flex flex-wrap items-center gap-1.5">
              {SFX_SYNTH_PRESETS.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => {
                    setSfxParams(getSfxPresetDefaults(p.id));
                    if (p.id !== 'custom') setSfxName(`sfx_${p.id}`);
                  }}
                  className={`rounded border px-2 py-1 text-[11px] font-medium ${
                    sfxParams.preset === p.id
                      ? 'border-emerald-500/70 bg-emerald-500/20 text-emerald-200'
                      : 'border-[#30303a] bg-[#1b1b22] text-zinc-300 hover:bg-[#25252e]'
                  }`}
                >
                  {p.label}
                </button>
              ))}
            </div>

            <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-4 lg:grid-cols-7 text-[11px]">
              <label className="flex flex-col gap-0.5 text-zinc-400">
                <span>Nombre .wav</span>
                <input
                  type="text"
                  aria-label="Nombre del archivo WAV"
                  value={sfxName}
                  onChange={(e) => setSfxName(e.target.value)}
                  className="rounded border border-[#32323c] bg-[#141416] px-2 py-1 text-zinc-100"
                />
              </label>

              <label className="flex flex-col gap-0.5 text-zinc-400">
                <span>Onda</span>
                <select
                  aria-label="Forma de onda SFX"
                  value={sfxParams.waveform}
                  onChange={(e) =>
                    setSfxParams((prev) => ({
                      ...prev,
                      waveform: e.target.value as SfxWaveform,
                    }))
                  }
                  className="rounded border border-[#32323c] bg-[#141416] px-2 py-1 text-zinc-100"
                >
                  <option value="sine">Senoidal</option>
                  <option value="square">Cuadrada</option>
                  <option value="sawtooth">Sierra</option>
                  <option value="triangle">Triangular</option>
                  <option value="noise">Ruido Blanco</option>
                </select>
              </label>

              <label className="flex flex-col gap-0.5 text-zinc-400">
                <span>Frec. Inicio (Hz)</span>
                <NumericInput
                  ariaLabel="Frecuencia inicial Hz"
                  min={20}
                  max={2400}
                  value={sfxParams.frequency}
                  onChange={(frequency) => setSfxParams((p) => ({ ...p, frequency }))}
                  className="rounded border border-[#32323c] bg-[#141416] px-2 py-1 font-mono text-zinc-100"
                />
              </label>

              <label className="flex flex-col gap-0.5 text-zinc-400">
                <span>Frec. Fin (Hz)</span>
                <NumericInput
                  ariaLabel="Frecuencia final Hz"
                  min={20}
                  max={2400}
                  value={sfxParams.frequencyEnd}
                  onChange={(frequencyEnd) => setSfxParams((p) => ({ ...p, frequencyEnd }))}
                  className="rounded border border-[#32323c] bg-[#141416] px-2 py-1 font-mono text-zinc-100"
                />
              </label>

              <label className="flex flex-col gap-0.5 text-zinc-400">
                <span>Duración (s)</span>
                <NumericInput
                  ariaLabel="Duración SFX en segundos"
                  min={0.04}
                  max={2.5}
                  step={0.04}
                  value={sfxParams.duration}
                  onChange={(duration) => setSfxParams((p) => ({ ...p, duration }))}
                  className="rounded border border-[#32323c] bg-[#141416] px-2 py-1 font-mono text-zinc-100"
                />
              </label>

              <label className="flex flex-col gap-0.5 text-zinc-400">
                <span>Caída / FM</span>
                <div className="flex gap-1">
                  <NumericInput
                    ariaLabel="Curva de caída"
                    min={0.5}
                    max={24}
                    step={0.5}
                    value={sfxParams.decay}
                    onChange={(decay) => setSfxParams((p) => ({ ...p, decay }))}
                    className="w-1/2 rounded border border-[#32323c] bg-[#141416] px-1.5 py-1 font-mono text-zinc-100"
                  />
                  <NumericInput
                    ariaLabel="Modulación FM Hz"
                    min={0}
                    max={400}
                    value={sfxParams.fmAmount}
                    onChange={(fmAmount) => setSfxParams((p) => ({ ...p, fmAmount }))}
                    className="w-1/2 rounded border border-[#32323c] bg-[#141416] px-1.5 py-1 font-mono text-zinc-100"
                  />
                </div>
              </label>

              <label className="flex flex-col gap-0.5 text-zinc-400">
                <span>Ruido (0..1)</span>
                <NumericInput
                  ariaLabel="Mezcla de ruido"
                  min={0}
                  max={1}
                  step={0.05}
                  value={sfxParams.noiseMix}
                  onChange={(noiseMix) => setSfxParams((p) => ({ ...p, noiseMix }))}
                  className="rounded border border-[#32323c] bg-[#141416] px-2 py-1 font-mono text-zinc-100"
                />
              </label>
            </div>

            {sfxParams.preset === 'custom' && (
              <div className="space-y-1">
                <div className="flex items-center justify-between text-[10px]">
                  <span className="text-zinc-400">
                    Fórmula segura (<code>t, f, dur, pi, rand, sin, cos, exp, abs, fract</code>)
                  </span>
                  {!formulaValid && (
                    <span className="text-red-400 font-semibold">Fórmula vacía o inválida</span>
                  )}
                </div>
                <input
                  type="text"
                  aria-label="Fórmula matemática de onda"
                  value={sfxParams.customFormula ?? ''}
                  onChange={(e) =>
                    setSfxParams((p) => ({ ...p, customFormula: e.target.value }))
                  }
                  className="w-full rounded border border-[#32323c] bg-[#111116] px-2.5 py-1 font-mono text-xs text-sky-200"
                />
              </div>
            )}
          </div>

          {/* Osciloscopio + Botones Escuchar y Guardar WAV */}
          <div className="flex w-64 shrink-0 flex-col justify-between rounded border border-[#2c2c34] bg-[#141418] p-2">
            <canvas
              ref={waveCanvasRef}
              width={240}
              height={92}
              className="w-full rounded border border-[#25252e]"
            />
            <div className="mt-2 flex items-center gap-1.5">
              <button
                type="button"
                onClick={() => previewSfxWithWebAudio(sfxParams)}
                disabled={!formulaValid}
                className="inline-flex flex-1 items-center justify-center gap-1 rounded bg-sky-600 px-2.5 py-1.5 text-[11px] font-semibold text-white hover:bg-sky-500 disabled:opacity-50"
              >
                <Play className="h-3 w-3" />
                Escuchar
              </button>
              <button
                type="button"
                onClick={() => void handleSaveWav()}
                disabled={!onCreateAsset || !formulaValid || isSavingWav}
                className="inline-flex flex-1 items-center justify-center gap-1 rounded bg-emerald-600 px-2.5 py-1.5 text-[11px] font-semibold text-white hover:bg-emerald-500 disabled:opacity-50"
              >
                <Save className="h-3 w-3" />
                {isSavingWav ? 'Guardando...' : 'Guardar WAV'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
