import React, { useState } from 'react';
import { Archive, Check, Code2, Download, Globe, X } from 'lucide-react';
import {
  PORTAL_TARGETS,
  type Html5CompileOptions,
  type PortalTargetId,
} from '../../export/html5/portalSdks';

interface ExportModalProps {
  open: boolean;
  projectName: string;
  compiling: boolean;
  onClose: () => void;
  onCompileHtml5: (options: Html5CompileOptions) => void;
  onExportEditableZip: () => void;
}

type ExportTab = 'html5' | 'editable';

export const ExportModal: React.FC<ExportModalProps> = ({
  open,
  projectName,
  compiling,
  onClose,
  onCompileHtml5,
  onExportEditableZip,
}) => {
  const [tab, setTab] = useState<ExportTab>('html5');
  const [portal, setPortal] = useState<PortalTargetId>('web');
  const [customSdkUrl, setCustomSdkUrl] = useState('');
  const [scaleMode, setScaleMode] = useState<'letterbox' | 'cover'>('letterbox');
  const [touchControls, setTouchControls] = useState(true);
  const [showFullscreenButton, setShowFullscreenButton] = useState(true);

  if (!open) return null;

  const selectedSpec =
    PORTAL_TARGETS.find((p) => p.id === portal) ?? PORTAL_TARGETS[0];

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="export-modal-title"
    >
      <div className="flex w-full max-w-2xl flex-col overflow-hidden rounded-lg border border-[#32323c] bg-[#1b1b1f] shadow-2xl">
        {/* Cabecera */}
        <div className="flex items-center justify-between border-b border-[#303038] px-5 py-3.5">
          <div>
            <h2 id="export-modal-title" className="text-sm font-semibold text-zinc-100">
              Exportar · {projectName}
            </h2>
            <p className="mt-0.5 text-[11px] text-zinc-400">
              Compila el juego HTML5 listo para publicar o guarda una copia editable del proyecto.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Cerrar exportación"
            className="rounded p-1 text-zinc-400 hover:bg-[#2c2c33] hover:text-zinc-100"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Selector de tipo de exportación */}
        <div className="grid grid-cols-2 border-b border-[#2e2e36] bg-[#16161a]" role="tablist">
          <button
            type="button"
            role="tab"
            aria-selected={tab === 'html5'}
            onClick={() => setTab('html5')}
            className={`flex items-center justify-center gap-2 border-b-2 py-2.5 text-xs font-semibold transition-colors ${
              tab === 'html5'
                ? 'border-blue-500 bg-[#1b1b1f] text-zinc-100'
                : 'border-transparent text-zinc-400 hover:text-zinc-200'
            }`}
          >
            <Globe className="h-3.5 w-3.5 text-emerald-400" />
            <span>Compilar juego HTML5 (.zip)</span>
          </button>

          <button
            type="button"
            role="tab"
            aria-selected={tab === 'editable'}
            onClick={() => setTab('editable')}
            className={`flex items-center justify-center gap-2 border-b-2 py-2.5 text-xs font-semibold transition-colors ${
              tab === 'editable'
                ? 'border-blue-500 bg-[#1b1b1f] text-zinc-100'
                : 'border-transparent text-zinc-400 hover:text-zinc-200'
            }`}
          >
            <Archive className="h-3.5 w-3.5 text-blue-400" />
            <span>Proyecto editable (.nexus.zip)</span>
          </button>
        </div>

        {tab === 'html5' ? (
          <div className="max-h-[72vh] space-y-4 overflow-y-auto px-5 py-4 text-xs">
            {/* Selección de plataforma */}
            <div>
              <div className="mb-2 font-semibold text-zinc-200">
                Plataforma destino (Inyección automática de SDK)
              </div>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                {PORTAL_TARGETS.map((target) => {
                  const active = portal === target.id;
                  return (
                    <button
                      key={target.id}
                      type="button"
                      onClick={() => setPortal(target.id)}
                      className={`flex items-center justify-between rounded border px-3 py-2 text-left transition-colors ${
                        active
                          ? 'border-blue-500 bg-blue-600/20 text-white'
                          : 'border-[#32323c] bg-[#222228] text-zinc-300 hover:bg-[#2a2a32]'
                      }`}
                    >
                      <span className="font-medium truncate">{target.shortLabel}</span>
                      {active && <Check className="h-3.5 w-3.5 shrink-0 text-blue-400" />}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Detalles del SDK real inyectado */}
            <div className="rounded border border-[#2f2f38] bg-[#141417] p-3 space-y-2">
              <div className="flex items-center gap-2 font-semibold text-zinc-200">
                <Code2 className="h-3.5 w-3.5 text-blue-400" />
                <span>{selectedSpec.name}</span>
              </div>
              <p className="text-zinc-400 leading-relaxed">{selectedSpec.description}</p>
              {selectedSpec.sdkScriptUrl && (
                <div className="rounded bg-[#1c1c22] px-2.5 py-1.5 font-mono text-[11px] text-emerald-400 break-all">
                  &lt;script src=&quot;{selectedSpec.sdkScriptUrl}&quot;&gt;&lt;/script&gt;
                </div>
              )}
              {portal === 'custom' && (
                <div className="pt-1">
                  <label htmlFor="custom-sdk-url" className="mb-1 block text-[11px] text-zinc-300">
                    URL del script SDK externo (opcional)
                  </label>
                  <input
                    id="custom-sdk-url"
                    type="url"
                    value={customSdkUrl}
                    onChange={(e) => setCustomSdkUrl(e.target.value)}
                    placeholder="https://cdn.miportal.com/sdk.js"
                    className="w-full rounded border border-[#383844] bg-[#222228] px-2.5 py-1.5 font-mono text-xs text-zinc-100 focus:border-blue-500 focus:outline-none"
                  />
                </div>
              )}
              <div className="text-[11px] text-zinc-400">
                <span className="font-medium text-zinc-300">Archivos empaquetados:</span>{' '}
                <span className="font-mono">{selectedSpec.injectedFiles.join(' · ')}</span>
              </div>
            </div>

            {/* Opciones de compilación */}
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div>
                <label htmlFor="html5-scale-mode" className="mb-1.5 block font-medium text-zinc-300">
                  Escalado en pantalla
                </label>
                <select
                  id="html5-scale-mode"
                  value={scaleMode}
                  onChange={(e) => setScaleMode(e.target.value as 'letterbox' | 'cover')}
                  className="w-full rounded border border-[#383844] bg-[#232328] px-2.5 py-2 text-xs text-zinc-100 focus:border-blue-500 focus:outline-none"
                >
                  <option value="letterbox">Ajustar manteniendo proporción (Letterbox)</option>
                  <option value="cover">Cubrir pantalla completa</option>
                </select>
              </div>

              <div className="flex flex-col justify-end gap-2 pb-1">
                <label className="flex items-center gap-2 text-xs text-zinc-300 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={touchControls}
                    onChange={(e) => setTouchControls(e.target.checked)}
                    className="rounded border-zinc-600 bg-[#141416] accent-blue-500"
                  />
                  <span>Incluir controles táctiles en pantalla</span>
                </label>

                <label className="flex items-center gap-2 text-xs text-zinc-300 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={showFullscreenButton}
                    onChange={(e) => setShowFullscreenButton(e.target.checked)}
                    className="rounded border-zinc-600 bg-[#141416] accent-blue-500"
                  />
                  <span>Mostrar botón de pantalla completa</span>
                </label>
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 border-t border-[#303038] pt-3">
              <button
                type="button"
                onClick={onClose}
                className="rounded border border-[#3a3a45] bg-[#232328] px-4 py-1.5 text-xs font-medium text-zinc-200 hover:bg-[#2c2c33]"
              >
                Cancelar
              </button>
              <button
                type="button"
                disabled={compiling}
                onClick={() =>
                  onCompileHtml5({
                    portal,
                    customSdkUrl: portal === 'custom' ? customSdkUrl : undefined,
                    scaleMode,
                    touchControls,
                    showFullscreenButton,
                  })
                }
                className="inline-flex items-center gap-1.5 rounded bg-emerald-600 px-4 py-1.5 text-xs font-semibold text-white hover:bg-emerald-500 disabled:opacity-50"
              >
                <Download className="h-3.5 w-3.5" />
                {compiling ? 'Compilando...' : 'Compilar y descargar HTML5 (.zip)'}
              </button>
            </div>
          </div>
        ) : (
          <div className="space-y-4 px-5 py-5 text-xs">
            <div className="rounded border border-[#2f2f38] bg-[#141417] p-4 space-y-2">
              <h3 className="font-semibold text-zinc-100">
                Paquete fuente editable (.nexus.zip)
              </h3>
              <p className="text-zinc-400 leading-relaxed">
                Guarda una copia portátil con <span className="font-mono text-zinc-300">project.json</span> (v1.0.0) y todos los archivos originales de imágenes y spritesheets en la carpeta <span className="font-mono text-zinc-300">assets/</span>. Puedes reimportar este archivo en cualquier momento desde el Administrador de proyectos.
              </p>
            </div>

            <div className="flex items-center justify-end gap-2 border-t border-[#303038] pt-3">
              <button
                type="button"
                onClick={onClose}
                className="rounded border border-[#3a3a45] bg-[#232328] px-4 py-1.5 text-xs font-medium text-zinc-200 hover:bg-[#2c2c33]"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={() => {
                  onExportEditableZip();
                  onClose();
                }}
                className="inline-flex items-center gap-1.5 rounded bg-blue-600 px-4 py-1.5 text-xs font-semibold text-white hover:bg-blue-500"
              >
                <Archive className="h-3.5 w-3.5" />
                Descargar proyecto (.nexus.zip)
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
