import React, { useEffect, useRef, useState } from 'react';

export interface NumericInputProps {
  id?: string;
  value: number;
  onChange: (value: number) => void;
  min?: number;
  max?: number;
  step?: number;
  precision?: number;
  ariaLabel?: string;
  'aria-label'?: string;
  title?: string;
  placeholder?: string;
  className?: string;
  disabled?: boolean;
}

function roundValue(val: number, precision: number): number {
  const factor = Math.pow(10, precision);
  const rounded = Math.round(val * factor) / factor;
  return Object.is(rounded, -0) ? 0 : rounded;
}

function clampNumeric(val: number, min?: number, max?: number): number {
  let next = val;
  if (min !== undefined && next < min) next = min;
  if (max !== undefined && next > max) next = max;
  return next;
}

function formatNumeric(val: number, precision: number): string {
  if (!Number.isFinite(val)) return '0';
  return String(roundValue(val, precision));
}

function parseNumericDraft(raw: string): number | null {
  const normalized = raw.trim().replace(',', '.');
  if (
    normalized === '' ||
    normalized === '-' ||
    normalized === '+' ||
    normalized === '.' ||
    normalized === '-.' ||
    normalized === '+.'
  ) {
    return null;
  }
  const num = Number(normalized);
  return Number.isFinite(num) ? num : null;
}

/**
 * Campo numérico controlado seguro:
 * - Permite borrar completamente, escribir "0", "-" y decimales parciales ("0.", "-.") sin bloquear el cursor.
 * - Aplica clamp y normalización al confirmar (Enter / blur) y flechas Arriba/Abajo.
 */
export const NumericInput: React.FC<NumericInputProps> = ({
  id,
  value,
  onChange,
  min,
  max,
  step = 1,
  precision = 3,
  ariaLabel,
  'aria-label': ariaLabelAttr,
  title,
  placeholder,
  className = '',
  disabled = false,
}) => {
  const safePropValue = Number.isFinite(value) ? value : 0;
  const [focused, setFocused] = useState(false);
  const [draft, setDraft] = useState(() => formatNumeric(safePropValue, precision));
  const lastCommittedRef = useRef<number>(safePropValue);

  useEffect(() => {
    lastCommittedRef.current = safePropValue;
    if (!focused) {
      setDraft(formatNumeric(safePropValue, precision));
    }
  }, [safePropValue, precision, focused]);

  const commitDraft = (rawText: string) => {
    const parsed = parseNumericDraft(rawText);
    const fallback = clampNumeric(lastCommittedRef.current, min, max);
    const base = parsed !== null ? parsed : rawText.trim() === '' ? clampNumeric(0, min, max) : fallback;
    const finalVal = roundValue(clampNumeric(base, min, max), precision);
    lastCommittedRef.current = finalVal;
    setDraft(formatNumeric(finalVal, precision));
    if (finalVal !== safePropValue || parsed !== null) {
      onChange(finalVal);
    }
  };

  return (
    <input
      id={id}
      type="text"
      inputMode="decimal"
      role="spinbutton"
      aria-label={ariaLabelAttr ?? ariaLabel}
      aria-valuemin={min}
      aria-valuemax={max}
      aria-valuenow={safePropValue}
      title={title}
      placeholder={placeholder}
      disabled={disabled}
      value={draft}
      onFocus={(e) => {
        setFocused(true);
        e.currentTarget.select();
      }}
      onChange={(e) => {
        const nextRaw = e.target.value;
        // Permitir dígitos, signo negativo/positivo, punto o coma decimal
        if (!/^[+-]?\d*[.,]?\d*$/.test(nextRaw.trim())) {
          return;
        }
        setDraft(nextRaw);
        const parsed = parseNumericDraft(nextRaw);
        if (parsed !== null) {
          // Solo emitir inmediatamente si no viola el mínimo mientras el usuario escribe cifras mayores
          if (min !== undefined && parsed < min) {
            return;
          }
          const clamped = roundValue(clampNumeric(parsed, min, max), precision);
          lastCommittedRef.current = clamped;
          onChange(clamped);
        }
      }}
      onBlur={() => {
        setFocused(false);
        commitDraft(draft);
      }}
      onKeyDown={(e) => {
        e.stopPropagation();
        if (e.key === 'Enter') {
          e.preventDefault();
          commitDraft(draft);
          e.currentTarget.blur();
          return;
        }
        if (e.key === 'Escape') {
          e.preventDefault();
          setDraft(formatNumeric(safePropValue, precision));
          e.currentTarget.blur();
          return;
        }
        if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
          e.preventDefault();
          const currentParsed = parseNumericDraft(draft);
          const base = currentParsed !== null ? currentParsed : safePropValue;
          const mult = e.shiftKey ? 10 : 1;
          const delta = (e.key === 'ArrowUp' ? step : -step) * mult;
          const next = roundValue(clampNumeric(base + delta, min, max), precision);
          lastCommittedRef.current = next;
          setDraft(formatNumeric(next, precision));
          onChange(next);
        }
      }}
      className={className}
    />
  );
};
