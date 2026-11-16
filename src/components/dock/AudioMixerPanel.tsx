import React, { useEffect, useRef, useState } from 'react';
import { Music, Play, Square, Upload, Volume2, VolumeX } from 'lucide-react';
import {
  DEFAULT_AUDIO_BUSES,
  SYNTH_PRESETS,
  sharedAudioEngine,
} from '../../engine/audio/audioEngine';
import type {
  AudioBusSettings,
  SceneBackgroundMusicConfig,
  SceneData,
} from '../../engine/core/types';
import type { ProjectAssetMeta } from '../../project/models/project';

interface AudioMixerPanelProps {
  audioBuses?: AudioBusSettings;
  assets: ProjectAssetMeta[];
  assetBlobs: Map<string, Blob>;
  activeScene?: SceneData;
  onChangeAudioBuses: (next: AudioBusSettings) => void;
  onUpdateScene?: (updater: (scene: SceneData) => SceneData) => void;
  onImportFiles?: (files: File[]) => void;
}

export const AudioMixerPanel: React.FC<AudioMixerPanelProps> = ({
  audioBuses,
  assets,
  assetBlobs,
  activeScene,
  onChangeAudioBuses,
  onUpdateScene,
  onImportFiles,
}) => {
  const buses = audioBuses ?? DEFAULT_AUDIO_BUSES;
  const audioAssets = assets.filter((a) => a.kind === 'audio');
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [playingTrackId, setPlayingTrackId] = useState<string | null>(() =>
    sharedAudioEngine.getCurrentMusicAssetId()
  );

  useEffect(() => {
    return sharedAudioEngine.subscribe(() => {
      setPlayingTrackId(sharedAudioEngine.getCurrentMusicAssetId());
    });
  }, []);

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
    <div className="grid h-full grid-cols-1 gap-2.5 overflow-y-auto p-3 lg:grid-cols-3">
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
            Audios desde PC ({audioAssets.length})
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
            Importa archivos MP3, WAV, OGG o M4A desde tu PC para usarlos como música de fondo, disparadores en objetos o reglas.
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
  );
};
