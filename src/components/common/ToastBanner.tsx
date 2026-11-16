import React from 'react';
import { AlertCircle, CheckCircle2, Info, X } from 'lucide-react';

export interface ToastMessage {
  id: string;
  type: 'info' | 'success' | 'error';
  text: string;
}

interface ToastBannerProps {
  messages: ToastMessage[];
  onDismiss: (id: string) => void;
}

export const ToastBanner: React.FC<ToastBannerProps> = ({ messages, onDismiss }) => {
  if (messages.length === 0) return null;

  return (
    <div className="fixed bottom-10 right-4 z-50 flex max-w-md flex-col gap-2">
      {messages.map((msg) => {
        const borderClass =
          msg.type === 'error'
            ? 'border-red-500/50 bg-[#26181a]'
            : msg.type === 'success'
              ? 'border-emerald-500/50 bg-[#17241e]'
              : 'border-[#3b82f6]/50 bg-[#18202c]';
        return (
          <div
            key={msg.id}
            role={msg.type === 'error' ? 'alert' : 'status'}
            className={`flex items-start gap-2.5 rounded-md border px-3.5 py-2.5 text-xs text-zinc-100 shadow-xl ${borderClass}`}
          >
            {msg.type === 'error' && (
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-red-400" />
            )}
            {msg.type === 'success' && (
              <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-400" />
            )}
            {msg.type === 'info' && (
              <Info className="mt-0.5 h-4 w-4 shrink-0 text-blue-400" />
            )}
            <div className="flex-1 whitespace-pre-line leading-relaxed">{msg.text}</div>
            <button
              type="button"
              onClick={() => onDismiss(msg.id)}
              aria-label="Cerrar notificación"
              className="rounded p-0.5 text-zinc-400 hover:bg-white/10 hover:text-zinc-100"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        );
      })}
    </div>
  );
};
