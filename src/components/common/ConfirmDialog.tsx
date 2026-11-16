import React from 'react';
import { AlertTriangle, X } from 'lucide-react';

interface ConfirmDialogProps {
  open: boolean;
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  danger?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

export const ConfirmDialog: React.FC<ConfirmDialogProps> = ({
  open,
  title,
  message,
  confirmLabel = 'Confirmar',
  cancelLabel = 'Cancelar',
  danger = false,
  onConfirm,
  onCancel,
}) => {
  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="confirm-dialog-title"
    >
      <div className="w-full max-w-md rounded-lg border border-[#32323c] bg-[#1b1b1f] shadow-2xl">
        <div className="flex items-center justify-between border-b border-[#303038] px-4 py-3">
          <div className="flex items-center gap-2">
            {danger && <AlertTriangle className="h-4 w-4 text-red-400" />}
            <h2 id="confirm-dialog-title" className="text-sm font-semibold text-zinc-100">
              {title}
            </h2>
          </div>
          <button
            type="button"
            onClick={onCancel}
            aria-label="Cerrar diálogo"
            className="rounded p-1 text-zinc-400 hover:bg-[#2c2c33] hover:text-zinc-100"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="px-4 py-4 text-sm text-zinc-300 leading-relaxed whitespace-pre-line">
          {message}
        </div>
        <div className="flex items-center justify-end gap-2 border-t border-[#303038] px-4 py-3">
          <button
            type="button"
            onClick={onCancel}
            className="rounded border border-[#3a3a45] bg-[#232328] px-3.5 py-1.5 text-xs font-medium text-zinc-200 hover:bg-[#2c2c33] whitespace-nowrap shrink-0"
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            onClick={onConfirm}
            className={`rounded px-3.5 py-1.5 text-xs font-medium text-white whitespace-nowrap shrink-0 ${
              danger
                ? 'bg-red-600 hover:bg-red-500'
                : 'bg-blue-600 hover:bg-blue-500'
            }`}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
};
