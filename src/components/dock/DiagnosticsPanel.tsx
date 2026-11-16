import React from 'react';
import { AlertTriangle, CheckCircle2, Info, XCircle } from 'lucide-react';
import type { EngineDiagnostic } from '../../assistant/diagnostics/diagnosticAnalyzer';

interface DiagnosticsPanelProps {
  diagnostics: EngineDiagnostic[];
  onApplyDiagnosticFix: (diag: EngineDiagnostic) => void;
  onSelectObjectById: (id: string) => void;
}

export const DiagnosticsPanel: React.FC<DiagnosticsPanelProps> = ({
  diagnostics,
  onApplyDiagnosticFix,
  onSelectObjectById,
}) => {
  if (diagnostics.length === 0) {
    return (
      <div className="flex h-full items-center justify-center p-4">
        <div className="flex items-center gap-2 rounded border border-emerald-500/30 bg-emerald-500/10 px-4 py-2.5 text-xs text-emerald-300">
          <CheckCircle2 className="h-4 w-4" />
          <span>Diagnóstico limpio: no se detectaron problemas en la escena activa.</span>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full overflow-y-auto p-3 space-y-2">
      {diagnostics.map((d) => (
        <div
          key={d.id}
          className="flex flex-wrap items-center justify-between gap-2 rounded border border-[#2d2d36] bg-[#16161b] px-3 py-2 text-xs"
        >
          <div className="flex min-w-0 flex-1 items-start gap-2">
            {d.severity === 'error' ? (
              <XCircle className="mt-0.5 h-4 w-4 shrink-0 text-red-400" />
            ) : d.severity === 'warning' ? (
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-400" />
            ) : (
              <Info className="mt-0.5 h-4 w-4 shrink-0 text-sky-400" />
            )}
            <div className="min-w-0">
              <div className="font-semibold text-zinc-100">{d.title}</div>
              <div className="text-[11px] text-zinc-400">{d.detail}</div>
            </div>
          </div>

          <div className="flex items-center gap-1.5">
            {d.fix && (
              <button
                type="button"
                onClick={() => onApplyDiagnosticFix(d)}
                className="rounded bg-amber-500 px-2.5 py-1 text-[11px] font-semibold text-zinc-950 hover:bg-amber-400 whitespace-nowrap"
              >
                {d.fix.label}
              </button>
            )}
            {d.objectId && (
              <button
                type="button"
                onClick={() => onSelectObjectById(d.objectId!)}
                className="rounded border border-[#3a3a45] bg-[#212128] px-2.5 py-1 text-[11px] text-zinc-200 hover:bg-[#2c2c35] whitespace-nowrap"
              >
                Ir al objeto
              </button>
            )}
          </div>
        </div>
      ))}
    </div>
  );
};
