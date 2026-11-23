import React, { useState } from 'react';
import { Box, Layers, X } from 'lucide-react';
import {
  RESOLUTION_PRESETS,
  type ProjectMode,
  type ProjectTemplateId,
  type ResolutionPresetId,
  type StageOrientation,
} from '../../project/models/project';
import { clamp } from '../../utils/format';
import { NumericInput } from '../common/NumericInput';

export interface NewProjectFormValues {
  name: string;
  mode: ProjectMode;
  width: number;
  height: number;
  orientation: StageOrientation;
  backgroundColor: string;
  template: ProjectTemplateId;
}

interface NewProjectModalProps {
  open: boolean;
  onClose: () => void;
  onCreate: (values: NewProjectFormValues) => void;
}

const COLOR_PRESETS = ['#131b2e', '#0f172a', '#18181b', '#1e293b', '#0b191e', '#f8fafc'];

export const NewProjectModal: React.FC<NewProjectModalProps> = ({
  open,
  onClose,
  onCreate,
}) => {
  const [name, setName] = useState('Mi Proyecto 2D');
  const [mode, setMode] = useState<ProjectMode>('2d');
  const [template, setTemplate] = useState<ProjectTemplateId>('empty_single');
  const [presetId, setPresetId] = useState<ResolutionPresetId>('1280x720');
  const [orientation, setOrientation] = useState<StageOrientation>('horizontal');
  const [width, setWidth] = useState(1280);
  const [height, setHeight] = useState(720);
  const [backgroundColor, setBackgroundColor] = useState('#131b2e');
  const [error, setError] = useState('');

  if (!open) return null;

  const handleModeChange = (nextMode: ProjectMode) => {
    setMode(nextMode);
    if (nextMode === '3d') {
      if (name === 'Mi Proyecto 2D') setName('Mi Proyecto 3D');
      if (template === 'platformer_multiscene' || template === 'topdown_adventure') {
        setTemplate('arena_3d');
      } else if (template === 'empty_single') {
        setTemplate('arena_3d');
      }
    } else {
      if (name === 'Mi Proyecto 3D') setName('Mi Proyecto 2D');
      if (template === 'arena_3d' || template === 'platformer_3d') {
        setTemplate('empty_single');
      }
    }
  };

  const handlePresetChange = (nextPresetId: ResolutionPresetId) => {
    setPresetId(nextPresetId);
    const preset = RESOLUTION_PRESETS.find((p) => p.id === nextPresetId);
    if (preset && nextPresetId !== 'custom') {
      setWidth(preset.width);
      setHeight(preset.height);
      setOrientation(preset.orientation);
    }
  };

  const handleOrientationChange = (nextOrientation: StageOrientation) => {
    setOrientation(nextOrientation);
    if (nextOrientation === 'horizontal' && width < height) {
      setWidth(height);
      setHeight(width);
      if (presetId === '720x1280') setPresetId('1280x720');
      else if (presetId === '1080x1920') setPresetId('1920x1080');
    } else if (nextOrientation === 'vertical' && width > height) {
      setWidth(height);
      setHeight(width);
      if (presetId === '1280x720') setPresetId('720x1280');
      else if (presetId === '1920x1080') setPresetId('1080x1920');
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) {
      setError('El nombre del proyecto no puede estar vacío.');
      return;
    }
    const safeW = clamp(Math.round(Number(width) || 1280), 64, 8192);
    const safeH = clamp(Math.round(Number(height) || 720), 64, 8192);
    setError('');
    onCreate({
      name: trimmed,
      mode,
      width: safeW,
      height: safeH,
      orientation: safeW >= safeH ? 'horizontal' : 'vertical',
      backgroundColor,
      template,
    });
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="new-project-title"
    >
      <form
        onSubmit={handleSubmit}
        className="w-full max-w-lg rounded-lg border border-[#32323c] bg-[#1b1b1f] shadow-2xl"
      >
        <div className="flex items-center justify-between border-b border-[#303038] px-5 py-3.5">
          <h2 id="new-project-title" className="text-sm font-semibold text-zinc-100">
            Nuevo proyecto NEXUS ({mode.toUpperCase()})
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Cerrar ventana"
            className="rounded p-1 text-zinc-400 hover:bg-[#2c2c33] hover:text-zinc-100"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="space-y-4 px-5 py-4 text-xs">
          <div>
            <span className="mb-1.5 block font-medium text-zinc-300">
              Motor de renderizado
            </span>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => handleModeChange('2d')}
                className={`flex items-center gap-2.5 rounded border p-2.5 text-left transition-colors ${
                  mode === '2d'
                    ? 'border-blue-500 bg-blue-600/15 text-zinc-100'
                    : 'border-[#383844] bg-[#232328] text-zinc-400 hover:text-zinc-200'
                }`}
              >
                <Layers className="h-4 w-4 shrink-0 text-blue-400" />
                <div>
                  <div className="font-semibold text-[11px]">Modo 2D (PixiJS)</div>
                  <div className="text-[10px] opacity-80">Sprites, Tilemaps, Luz 2D y UI</div>
                </div>
              </button>
              <button
                type="button"
                onClick={() => handleModeChange('3d')}
                className={`flex items-center gap-2.5 rounded border p-2.5 text-left transition-colors ${
                  mode === '3d'
                    ? 'border-purple-500 bg-purple-600/15 text-zinc-100'
                    : 'border-[#383844] bg-[#232328] text-zinc-400 hover:text-zinc-200'
                }`}
              >
                <Box className="h-4 w-4 shrink-0 text-purple-400" />
                <div>
                  <div className="font-semibold text-[11px]">Modo 3D (Three.js WebGL)</div>
                  <div className="text-[10px] opacity-80">CSG, GLB, NavMesh IA y Cámaras</div>
                </div>
              </button>
            </div>
          </div>

          <div>
            <label htmlFor="np-name" className="mb-1.5 block font-medium text-zinc-300">
              Nombre del proyecto
            </label>
            <input
              id="np-name"
              type="text"
              value={name}
              onChange={(e) => {
                setName(e.target.value);
                if (error) setError('');
              }}
              placeholder="Ej. Aventura Espacial"
              className="w-full rounded border border-[#383844] bg-[#232328] px-3 py-2 text-xs text-zinc-100 focus:border-blue-500 focus:outline-none"
              autoFocus
            />
            {error && <p className="mt-1 text-xs text-red-400">{error}</p>}
          </div>

          <div>
            <span className="mb-1.5 block font-medium text-zinc-300">
              Plantilla inicial
            </span>
            {mode === '3d' ? (
              <div className="grid grid-cols-3 gap-2">
                <button
                  type="button"
                  onClick={() => setTemplate('arena_3d')}
                  className={`rounded border p-2 text-left transition-colors ${
                    template === 'arena_3d'
                      ? 'border-purple-500 bg-purple-600/15 text-zinc-100'
                      : 'border-[#383844] bg-[#232328] text-zinc-400 hover:text-zinc-200'
                  }`}
                >
                  <div className="font-semibold text-[11px]">Arena 3D + IA</div>
                  <div className="mt-0.5 text-[10px] opacity-80">Jugador + NavMesh + HUD</div>
                </button>
                <button
                  type="button"
                  onClick={() => setTemplate('platformer_3d')}
                  className={`rounded border p-2 text-left transition-colors ${
                    template === 'platformer_3d'
                      ? 'border-purple-500 bg-purple-600/15 text-zinc-100'
                      : 'border-[#383844] bg-[#232328] text-zinc-400 hover:text-zinc-200'
                  }`}
                >
                  <div className="font-semibold text-[11px]">Plataformas 3D</div>
                  <div className="mt-0.5 text-[10px] opacity-80">Saltos + Cámara 3D</div>
                </button>
                <button
                  type="button"
                  onClick={() => setTemplate('empty_single')}
                  className={`rounded border p-2 text-left transition-colors ${
                    template === 'empty_single'
                      ? 'border-purple-500 bg-purple-600/15 text-zinc-100'
                      : 'border-[#383844] bg-[#232328] text-zinc-400 hover:text-zinc-200'
                  }`}
                >
                  <div className="font-semibold text-[11px]">Escena 3D base</div>
                  <div className="mt-0.5 text-[10px] opacity-80">Suelo + Cámara libre</div>
                </button>
              </div>
            ) : (
              <div className="grid grid-cols-3 gap-2">
                <button
                  type="button"
                  onClick={() => setTemplate('empty_single')}
                  className={`rounded border p-2 text-left transition-colors ${
                    template === 'empty_single'
                      ? 'border-blue-500 bg-blue-600/15 text-zinc-100'
                      : 'border-[#383844] bg-[#232328] text-zinc-400 hover:text-zinc-200'
                  }`}
                >
                  <div className="font-semibold text-[11px]">Escena vacía</div>
                  <div className="mt-0.5 text-[10px] opacity-80">1 escena inicial</div>
                </button>
                <button
                  type="button"
                  onClick={() => setTemplate('platformer_multiscene')}
                  className={`rounded border p-2 text-left transition-colors ${
                    template === 'platformer_multiscene'
                      ? 'border-blue-500 bg-blue-600/15 text-zinc-100'
                      : 'border-[#383844] bg-[#232328] text-zinc-400 hover:text-zinc-200'
                  }`}
                >
                  <div className="font-semibold text-[11px]">Plataforma</div>
                  <div className="mt-0.5 text-[10px] opacity-80">Menú + Nivel + Pausa</div>
                </button>
                <button
                  type="button"
                  onClick={() => setTemplate('topdown_adventure')}
                  className={`rounded border p-2 text-left transition-colors ${
                    template === 'topdown_adventure'
                      ? 'border-blue-500 bg-blue-600/15 text-zinc-100'
                      : 'border-[#383844] bg-[#232328] text-zinc-400 hover:text-zinc-200'
                  }`}
                >
                  <div className="font-semibold text-[11px]">Top-Down</div>
                  <div className="mt-0.5 text-[10px] opacity-80">Explorador + Cámara</div>
                </button>
              </div>
            )}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label htmlFor="np-preset" className="mb-1.5 block font-medium text-zinc-300">
                Resolución del escenario
              </label>
              <select
                id="np-preset"
                value={presetId}
                onChange={(e) => handlePresetChange(e.target.value as ResolutionPresetId)}
                className="w-full rounded border border-[#383844] bg-[#232328] px-2.5 py-2 text-xs text-zinc-100 focus:border-blue-500 focus:outline-none"
              >
                {RESOLUTION_PRESETS.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.label}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <span className="mb-1.5 block font-medium text-zinc-300">Orientación</span>
              <div className="grid grid-cols-2 gap-1 rounded border border-[#383844] bg-[#232328] p-0.5">
                <button
                  type="button"
                  onClick={() => handleOrientationChange('horizontal')}
                  className={`rounded py-1.5 text-xs font-medium transition-colors ${
                    orientation === 'horizontal'
                      ? 'bg-blue-600 text-white'
                      : 'text-zinc-400 hover:text-zinc-100'
                  }`}
                >
                  Horizontal
                </button>
                <button
                  type="button"
                  onClick={() => handleOrientationChange('vertical')}
                  className={`rounded py-1.5 text-xs font-medium transition-colors ${
                    orientation === 'vertical'
                      ? 'bg-blue-600 text-white'
                      : 'text-zinc-400 hover:text-zinc-100'
                  }`}
                >
                  Vertical
                </button>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label htmlFor="np-width" className="mb-1.5 block font-medium text-zinc-300">
                Ancho (px)
              </label>
              <NumericInput
                id="np-width"
                min={64}
                max={8192}
                precision={0}
                value={width}
                onChange={(val) => {
                  setPresetId('custom');
                  setWidth(val);
                  setOrientation(val >= height ? 'horizontal' : 'vertical');
                }}
                className="w-full rounded border border-[#383844] bg-[#232328] px-3 py-2 font-mono text-xs tabular-nums text-zinc-100 focus:border-blue-500 focus:outline-none"
              />
            </div>
            <div>
              <label htmlFor="np-height" className="mb-1.5 block font-medium text-zinc-300">
                Alto (px)
              </label>
              <NumericInput
                id="np-height"
                min={64}
                max={8192}
                precision={0}
                value={height}
                onChange={(val) => {
                  setPresetId('custom');
                  setHeight(val);
                  setOrientation(width >= val ? 'horizontal' : 'vertical');
                }}
                className="w-full rounded border border-[#383844] bg-[#232328] px-3 py-2 font-mono text-xs tabular-nums text-zinc-100 focus:border-blue-500 focus:outline-none"
              />
            </div>
          </div>

          <div>
            <label htmlFor="np-bg" className="mb-1.5 block font-medium text-zinc-300">
              Fondo inicial del escenario
            </label>
            <div className="flex items-center gap-2">
              <input
                id="np-bg"
                type="color"
                value={backgroundColor}
                onChange={(e) => setBackgroundColor(e.target.value)}
                className="h-8 w-10 cursor-pointer rounded border border-[#383844] bg-[#232328] p-0.5"
              />
              <input
                type="text"
                aria-label="Código hexadecimal de fondo"
                value={backgroundColor}
                onChange={(e) => setBackgroundColor(e.target.value)}
                className="w-28 rounded border border-[#383844] bg-[#232328] px-2.5 py-1.5 font-mono text-xs text-zinc-100 focus:border-blue-500 focus:outline-none"
              />
              <div className="flex items-center gap-1.5">
                {COLOR_PRESETS.map((c) => (
                  <button
                    key={c}
                    type="button"
                    aria-label={`Color de fondo ${c}`}
                    onClick={() => setBackgroundColor(c)}
                    className={`h-6 w-6 rounded border ${
                      backgroundColor.toLowerCase() === c.toLowerCase()
                        ? 'border-blue-400 ring-1 ring-blue-400'
                        : 'border-[#40404c]'
                    }`}
                    style={{ backgroundColor: c }}
                  />
                ))}
              </div>
            </div>
          </div>
        </div>

        <div className="flex items-center justify-end gap-2 border-t border-[#303038] px-5 py-3.5">
          <button
            type="button"
            onClick={onClose}
            className="rounded border border-[#3a3a45] bg-[#232328] px-4 py-1.5 text-xs font-medium text-zinc-200 hover:bg-[#2c2c33] whitespace-nowrap shrink-0"
          >
            Cancelar
          </button>
          <button
            type="submit"
            className="rounded bg-blue-600 px-4 py-1.5 text-xs font-medium text-white hover:bg-blue-500 whitespace-nowrap shrink-0"
          >
            Crear proyecto
          </button>
        </div>
      </form>
    </div>
  );
};
