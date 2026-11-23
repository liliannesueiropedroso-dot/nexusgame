import React, { useEffect, useState } from 'react';
import { Gamepad2, X } from 'lucide-react';
import type { TouchControlsConfig } from '../../engine/core/types';
import {
  RESOLUTION_PRESETS,
  type NexusProject,
  type ProjectSettings,
  type ResolutionPresetId,
  type StageOrientation,
} from '../../project/models/project';
import { clamp } from '../../utils/format';
import { NumericInput } from '../common/NumericInput';

interface ProjectSettingsModalProps {
  open: boolean;
  project: NexusProject;
  onClose: () => void;
  onSave: (name: string, settings: ProjectSettings) => void;
}

const DEFAULT_TOUCH_CONFIG: TouchControlsConfig = {
  enabledByDefault: false,
  mode: 'fixed',
  deadzone: 0.14,
  joystickSize: 120,
  showJumpButton: true,
  showActionButton: true,
  showDashButton: false,
};

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
  const [touchControls, setTouchControls] = useState<TouchControlsConfig>({
    ...DEFAULT_TOUCH_CONFIG,
    ...project.settings.touchControls,
  });

  useEffect(() => {
    if (!open) return;
    setName(project.name);
    setWidth(project.settings.width);
    setHeight(project.settings.height);
    setOrientation(project.settings.orientation);
    setBackgroundColor(project.settings.backgroundColor);
    setTouchControls({
      ...DEFAULT_TOUCH_CONFIG,
      ...project.settings.touchControls,
    });
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
      touchControls,
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

        <div className="max-h-[75vh] space-y-4 overflow-y-auto px-5 py-4 text-xs">
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
              <NumericInput
                id="ps-width"
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
              <label htmlFor="ps-height" className="mb-1.5 block font-medium text-zinc-300">
                Alto del escenario
              </label>
              <NumericInput
                id="ps-height"
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

          <div className="space-y-2.5 rounded-lg border border-[#30303a] bg-[#16161b] p-3">
            <div className="flex items-center gap-2 font-semibold text-zinc-200">
              <Gamepad2 className="h-4 w-4 text-sky-400" />
              <span>Joystick virtual móvil y controles táctiles</span>
            </div>

            <label className="flex items-center gap-2 text-zinc-300 cursor-pointer">
              <input
                type="checkbox"
                checked={touchControls.enabledByDefault}
                onChange={(e) =>
                  setTouchControls((prev) => ({ ...prev, enabledByDefault: e.target.checked }))
                }
                className="accent-sky-500"
              />
              <span>Activar controles táctiles automáticamente al iniciar</span>
            </label>

            <div className="grid grid-cols-3 gap-2">
              <div>
                <label htmlFor="ps-joy-mode" className="mb-1 block text-[11px] text-zinc-400">
                  Modo palanca
                </label>
                <select
                  id="ps-joy-mode"
                  value={touchControls.mode}
                  onChange={(e) =>
                    setTouchControls((prev) => ({
                      ...prev,
                      mode: e.target.value as 'fixed' | 'floating',
                    }))
                  }
                  className="w-full rounded border border-[#383844] bg-[#232328] px-2 py-1.5 text-[11px] text-zinc-100"
                >
                  <option value="fixed">Fijo</option>
                  <option value="floating">Flotante</option>
                </select>
              </div>
              <div>
                <label htmlFor="ps-joy-dz" className="mb-1 block text-[11px] text-zinc-400">
                  Zona muerta
                </label>
                <NumericInput
                  id="ps-joy-dz"
                  min={0}
                  max={0.5}
                  step={0.02}
                  precision={2}
                  value={touchControls.deadzone ?? 0.16}
                  onChange={(deadzone) => setTouchControls((prev) => ({ ...prev, deadzone }))}
                  className="w-full rounded border border-[#383844] bg-[#232328] px-2 py-1.5 font-mono text-[11px] text-zinc-100"
                />
              </div>
              <div>
                <label htmlFor="ps-joy-size" className="mb-1 block text-[11px] text-zinc-400">
                  Tamaño (px)
                </label>
                <NumericInput
                  id="ps-joy-size"
                  min={80}
                  max={180}
                  step={4}
                  precision={0}
                  value={touchControls.joystickSize ?? 112}
                  onChange={(joystickSize) =>
                    setTouchControls((prev) => ({ ...prev, joystickSize }))
                  }
                  className="w-full rounded border border-[#383844] bg-[#232328] px-2 py-1.5 font-mono text-[11px] text-zinc-100"
                />
              </div>
            </div>

            <div className="flex flex-wrap gap-3 text-[11px] text-zinc-300">
              <label className="flex items-center gap-1.5 cursor-pointer">
                <input
                  type="checkbox"
                  checked={touchControls.showJumpButton}
                  onChange={(e) =>
                    setTouchControls((prev) => ({ ...prev, showJumpButton: e.target.checked }))
                  }
                  className="accent-sky-500"
                />
                <span>Botón Saltar</span>
              </label>
              <label className="flex items-center gap-1.5 cursor-pointer">
                <input
                  type="checkbox"
                  checked={touchControls.showActionButton}
                  onChange={(e) =>
                    setTouchControls((prev) => ({ ...prev, showActionButton: e.target.checked }))
                  }
                  className="accent-sky-500"
                />
                <span>Botón Acción</span>
              </label>
              <label className="flex items-center gap-1.5 cursor-pointer">
                <input
                  type="checkbox"
                  checked={touchControls.showDashButton}
                  onChange={(e) =>
                    setTouchControls((prev) => ({ ...prev, showDashButton: e.target.checked }))
                  }
                  className="accent-sky-500"
                />
                <span>Botón Dash</span>
              </label>
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
