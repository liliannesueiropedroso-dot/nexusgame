import React, { useEffect, useState } from 'react';
import { X } from 'lucide-react';
import {
  RESOLUTION_PRESETS,
  type NexusProject,
  type ProjectSettings,
  type ResolutionPresetId,
  type StageOrientation,
} from '../../project/models/project';
import { clamp } from '../../utils/format';

interface ProjectSettingsModalProps {
  open: boolean;
  project: NexusProject;
  onClose: () => void;
  onSave: (name: string, settings: ProjectSettings) => void;
}

export const ProjectSettingsModal: React.FC<ProjectSettingsModalProps> = ({
  open,
  project,
  onClose,
  onSave,
}) => {
  const [name, setName] = useState(project.name);
  const [width, setWidth] = useState(project.settings.width);
  const [height, setHeight] = useState(project.settings.height);
  const [orientation, setOrientation] = useState<StageOrientation>(
    project.settings.orientation
  );
  const [backgroundColor, setBackgroundColor] = useState(project.settings.backgroundColor);
  const [presetId, setPresetId] = useState<ResolutionPresetId>('custom');

  useEffect(() => {
    if (!open) return;
    setName(project.name);
    setWidth(project.settings.width);
    setHeight(project.settings.height);
    setOrientation(project.settings.orientation);
    setBackgroundColor(project.settings.backgroundColor);
    const matched = RESOLUTION_PRESETS.find(
      (p) =>
        p.id !== 'custom' &&
        p.width === project.settings.width &&
        p.height === project.settings.height
    );
    setPresetId(matched ? matched.id : 'custom');
  }, [open, project]);

  if (!open) return null;

  const handlePresetChange = (id: ResolutionPresetId) => {
    setPresetId(id);
    const preset = RESOLUTION_PRESETS.find((p) => p.id === id);
    if (preset && id !== 'custom') {
      setWidth(preset.width);
      setHeight(preset.height);
      setOrientation(preset.orientation);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const safeName = name.trim() || project.name;
    const safeW = clamp(Math.round(Number(width) || 1280), 64, 8192);
    const safeH = clamp(Math.round(Number(height) || 720), 64, 8192);
    onSave(safeName, {
      width: safeW,
      height: safeH,
      orientation: safeW >= safeH ? 'horizontal' : 'vertical',
      backgroundColor,
    });
    onClose();
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="proj-settings-title"
    >
      <form
        onSubmit={handleSubmit}
        className="w-full max-w-md rounded-lg border border-[#32323c] bg-[#1b1b1f] shadow-2xl"
      >
        <div className="flex items-center justify-between border-b border-[#303038] px-5 py-3.5">
          <h2 id="proj-settings-title" className="text-sm font-semibold text-zinc-100">
            Configuración del proyecto
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Cerrar configuración"
            className="rounded p-1 text-zinc-400 hover:bg-[#2c2c33] hover:text-zinc-100"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="space-y-4 px-5 py-4 text-xs">
          <div>
            <label htmlFor="ps-name" className="mb-1.5 block font-medium text-zinc-300">
              Nombre del proyecto
            </label>
            <input
              id="ps-name"
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full rounded border border-[#383844] bg-[#232328] px-3 py-2 text-xs text-zinc-100 focus:border-blue-500 focus:outline-none"
            />
          </div>

          <div>
            <label htmlFor="ps-preset" className="mb-1.5 block font-medium text-zinc-300">
              Resolución predefinida
            </label>
            <select
              id="ps-preset"
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

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label htmlFor="ps-width" className="mb-1.5 block font-medium text-zinc-300">
                Ancho del escenario
              </label>
              <input
                id="ps-width"
                type="number"
                min={64}
                max={8192}
                value={width}
                onChange={(e) => {
                  setPresetId('custom');
                  const val = Number(e.target.value);
                  setWidth(val);
                  setOrientation(val >= height ? 'horizontal' : 'vertical');
                }}
                className="w-full rounded border border-[#383844] bg-[#232328] px-3 py-2 font-mono text-xs tabular-nums text-zinc-100 focus:border-blue-500 focus:outline-none"
              />
            </div>
            <div>
              <label htmlFor="ps-height" className="mb-1.5 block font-medium text-zinc-300">
                Alto del escenario
              </label>
              <input
                id="ps-height"
                type="number"
                min={64}
                max={8192}
                value={height}
                onChange={(e) => {
                  setPresetId('custom');
                  const val = Number(e.target.value);
                  setHeight(val);
                  setOrientation(width >= val ? 'horizontal' : 'vertical');
                }}
                className="w-full rounded border border-[#383844] bg-[#232328] px-3 py-2 font-mono text-xs tabular-nums text-zinc-100 focus:border-blue-500 focus:outline-none"
              />
            </div>
          </div>

          <div>
            <span className="mb-1.5 block font-medium text-zinc-300">Orientación</span>
            <div className="grid grid-cols-2 gap-1 rounded border border-[#383844] bg-[#232328] p-0.5">
              <button
                type="button"
                onClick={() => {
                  setOrientation('horizontal');
                  if (width < height) {
                    setWidth(height);
                    setHeight(width);
                  }
                }}
                className={`rounded py-1.5 text-xs font-medium ${
                  orientation === 'horizontal'
                    ? 'bg-blue-600 text-white'
                    : 'text-zinc-400 hover:text-zinc-100'
                }`}
              >
                Horizontal
              </button>
              <button
                type="button"
                onClick={() => {
                  setOrientation('vertical');
                  if (width > height) {
                    setWidth(height);
                    setHeight(width);
                  }
                }}
                className={`rounded py-1.5 text-xs font-medium ${
                  orientation === 'vertical'
                    ? 'bg-blue-600 text-white'
                    : 'text-zinc-400 hover:text-zinc-100'
                }`}
              >
                Vertical
              </button>
            </div>
          </div>

          <div>
            <label htmlFor="ps-bg" className="mb-1.5 block font-medium text-zinc-300">
              Color de fondo predeterminado
            </label>
            <div className="flex items-center gap-2">
              <input
                id="ps-bg"
                type="color"
                value={backgroundColor}
                onChange={(e) => setBackgroundColor(e.target.value)}
                className="h-8 w-10 cursor-pointer rounded border border-[#383844] bg-[#232328] p-0.5"
              />
              <input
                type="text"
                aria-label="Hexadecimal de fondo"
                value={backgroundColor}
                onChange={(e) => setBackgroundColor(e.target.value)}
                className="w-28 rounded border border-[#383844] bg-[#232328] px-2.5 py-1.5 font-mono text-xs text-zinc-100 focus:border-blue-500 focus:outline-none"
              />
            </div>
          </div>
        </div>

        <div className="flex items-center justify-end gap-2 border-t border-[#303038] px-5 py-3.5">
          <button
            type="button"
            onClick={onClose}
            className="rounded border border-[#3a3a45] bg-[#232328] px-4 py-1.5 text-xs font-medium text-zinc-200 hover:bg-[#2c2c33]"
          >
            Cancelar
          </button>
          <button
            type="submit"
            className="rounded bg-blue-600 px-4 py-1.5 text-xs font-medium text-white hover:bg-blue-500"
          >
            Aplicar cambios
          </button>
        </div>
      </form>
    </div>
  );
};
