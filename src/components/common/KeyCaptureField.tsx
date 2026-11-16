import React, { useEffect, useState } from 'react';
import { Keyboard } from 'lucide-react';
import {
  ALL_KEY_CODES,
  KEY_CODE_GROUPS,
  formatKeyCodeLabel,
} from '../../engine/input/keyCodes';

interface KeyCaptureFieldProps {
  value: string;
  onChange: (code: string) => void;
  ariaLabel?: string;
  className?: string;
}

export const KeyCaptureField: React.FC<KeyCaptureFieldProps> = ({
  value,
  onChange,
  ariaLabel = 'Seleccionar tecla',
  className = '',
}) => {
  const [capturing, setCapturing] = useState(false);

  useEffect(() => {
    if (!capturing) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      e.preventDefault();
      e.stopPropagation();
      const captured = e.code && e.code !== 'Unidentified' ? e.code : e.key;
      if (captured) {
        onChange(captured);
      }
      setCapturing(false);
    };

    window.addEventListener('keydown', handleKeyDown, true);
    return () => window.removeEventListener('keydown', handleKeyDown, true);
  }, [capturing, onChange]);

  const currentValue = value || 'Space';
  const hasKnownCode = ALL_KEY_CODES.some((k) => k.code === currentValue);

  return (
    <div className={`flex items-center gap-1 ${className}`}>
      <select
        aria-label={ariaLabel}
        value={currentValue}
        onChange={(e) => onChange(e.target.value)}
        className="min-w-0 flex-1 rounded border border-[#32323c] bg-[#141416] px-1.5 py-1 text-[11px] text-zinc-100 focus:border-blue-500 focus:outline-none"
      >
        {!hasKnownCode && (
          <option value={currentValue}>{formatKeyCodeLabel(currentValue)}</option>
        )}
        {KEY_CODE_GROUPS.map((group) => (
          <optgroup key={group.group} label={group.group}>
            {group.codes.map((k) => (
              <option key={k.code} value={k.code}>
                {k.label}
              </option>
            ))}
          </optgroup>
        ))}
      </select>
      <button
        type="button"
        onClick={() => setCapturing((prev) => !prev)}
        aria-label={capturing ? 'Cancelar captura de tecla' : 'Capturar tecla'}
        title={
          capturing
            ? 'Pulsa cualquier tecla o haz clic para cancelar'
            : 'Pulsa y presiona una tecla del teclado para asignarla'
        }
        className={`inline-flex shrink-0 items-center gap-1 rounded border px-2 py-1 text-[10px] font-semibold transition-colors whitespace-nowrap ${
          capturing
            ? 'border-amber-400 bg-amber-500/20 text-amber-200 animate-pulse'
            : 'border-[#32323c] bg-[#202028] text-zinc-200 hover:border-blue-500/60 hover:bg-[#282834]'
        }`}
      >
        <Keyboard className="h-3 w-3" />
        <span>{capturing ? 'Pulsa tecla...' : 'Capturar'}</span>
      </button>
    </div>
  );
};
