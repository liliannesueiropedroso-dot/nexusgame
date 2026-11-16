import React from 'react';
import { Play, Volume2, VolumeX } from 'lucide-react';
import {
  DEFAULT_AUDIO_BUSES,
  SYNTH_PRESETS,
  sharedAudioEngine,
} from '../../engine/audio/audioEngine';
import type { AudioBusSettings } from '../../engine/core/types';
import type { ProjectAssetMeta } from '../../project/models/project';

interface AudioMixerPanelProps {
  audioBuses?: AudioBusSettings;
  assets: ProjectAssetMeta[];
  assetBlobs: Map<string, Blob>;
  onChangeAudioBuses: (next: AudioBusSettings) => void;
}

export const AudioMixerPanel: React.FC<AudioMixerPanelProps> = ({
  audioBuses,
  assets,
  assetBlobs,
  onChangeAudioBuses,
}) => {
  const buses = audioBuses ?? DEFAULT_AUDIO_BUSES;
  const audioAssets = assets.filter((a) => a.kind === 'audio');

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

  const channels: Array<{ key: 'master' | 'music' | 'sfx' | 'ui'; label: string }> = [
    { key: 'master', label: 'Master' },
    { key: 'music', label: 'Música' },
    { key: 'sfx', label: 'Efectos (SFX)' },
    { key: 'ui', label: 'Interfaz (UI)' },
  ];

  return (
    <div className="grid h-full grid-cols-1 gap-3 overflow-y-auto p-3 lg:grid-cols-2">
      {/* Mezclador por canales */}
      <div className="rounded border border-[#2c2c34] bg-[#16161a] p-2.5 space-y-2">
        <div className="text-[11px] font-semibold uppercase tracking-wide text-zinc-400">
          Canales Web Audio API (100 % local)
        </div>
        <div className="space-y-2">
          {channels.map(({ key, label }) => {
            const muted = buses.muted[key];
            return (
              <div key={key} className="flex items-center gap-2.5 text-xs">
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

      {/* Banco de sonidos sintetizados y archivos locales */}
      <div className="rounded border border-[#2c2c34] bg-[#16161a] p-2.5 space-y-2.5">
        <div className="text-[11px] font-semibold uppercase tracking-wide text-zinc-400">
          Probar efectos integrados y archivos WAV/MP3/OGG
        </div>

        <div className="flex flex-wrap gap-1.5">
          {SYNTH_PRESETS.map((preset) => (
            <button
              key={preset.id}
              type="button"
              onClick={() => {
                sharedAudioEngine.setBusSettings(buses);
                sharedAudioEngine.playSynthPreset(preset.id, 'sfx');
              }}
              className="inline-flex items-center gap-1 rounded border border-[#33333e] bg-[#212128] px-2 py-1 text-[11px] text-zinc-200 hover:border-blue-500/60 hover:bg-[#2a2a33] whitespace-nowrap"
            >
              <Play className="h-3 w-3 text-emerald-400" />
              <span>{preset.label}</span>
            </button>
          ))}
        </div>

        <div className="border-t border-[#272730] pt-2">
          <div className="mb-1 text-[11px] text-zinc-400">
            Archivos de audio importados ({audioAssets.length})
          </div>
          {audioAssets.length === 0 ? (
            <p className="text-[11px] text-zinc-500">
              Importa archivos .wav, .mp3 o .ogg desde la pestaña Recursos para usarlos en tus reglas.
            </p>
          ) : (
            <div className="flex flex-wrap gap-1.5">
              {audioAssets.map((a) => (
                <button
                  key={a.id}
                  type="button"
                  onClick={() => {
                    const blob = assetBlobs.get(a.id);
                    if (blob) {
                      sharedAudioEngine.setBusSettings(buses);
                      void sharedAudioEngine.playAssetBlob(a.id, blob, { channel: 'sfx' });
                    }
                  }}
                  className="inline-flex items-center gap-1 rounded border border-[#34343f] bg-[#1c1c22] px-2 py-1 text-[11px] text-zinc-200 hover:border-sky-500"
                >
                  <Play className="h-3 w-3 text-sky-400" />
                  <span>{a.name}</span>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
