export interface KeyCodeGroup {
  group: string;
  codes: Array<{ code: string; label: string }>;
}

export const KEY_CODE_GROUPS: KeyCodeGroup[] = [
  {
    group: 'Movimiento y Acción',
    codes: [
      { code: 'Space', label: 'Espacio (Space)' },
      { code: 'ArrowUp', label: 'Flecha Arriba' },
      { code: 'ArrowDown', label: 'Flecha Abajo' },
      { code: 'ArrowLeft', label: 'Flecha Izquierda' },
      { code: 'ArrowRight', label: 'Flecha Derecha' },
      { code: 'Enter', label: 'Enter' },
      { code: 'Escape', label: 'Escape' },
      { code: 'Tab', label: 'Tabulador (Tab)' },
      { code: 'Backspace', label: 'Retroceso (Backspace)' },
    ],
  },
  {
    group: 'Modificadores y Navegación',
    codes: [
      { code: 'ShiftLeft', label: 'Shift Izquierdo' },
      { code: 'ShiftRight', label: 'Shift Derecho' },
      { code: 'ControlLeft', label: 'Ctrl Izquierdo' },
      { code: 'ControlRight', label: 'Ctrl Derecho' },
      { code: 'AltLeft', label: 'Alt Izquierdo' },
      { code: 'AltRight', label: 'Alt Derecho' },
      { code: 'Delete', label: 'Suprimir (Delete)' },
      { code: 'Insert', label: 'Insertar (Insert)' },
      { code: 'Home', label: 'Inicio (Home)' },
      { code: 'End', label: 'Fin (End)' },
      { code: 'PageUp', label: 'Re Pág (PageUp)' },
      { code: 'PageDown', label: 'Av Pág (PageDown)' },
    ],
  },
  {
    group: 'Letras (A - Z)',
    codes: Array.from({ length: 26 }, (_, i) => {
      const letter = String.fromCharCode(65 + i);
      return { code: `Key${letter}`, label: `Tecla ${letter} (Key${letter})` };
    }),
  },
  {
    group: 'Números (0 - 9)',
    codes: Array.from({ length: 10 }, (_, i) => ({
      code: `Digit${i}`,
      label: `Número ${i} (Digit${i})`,
    })),
  },
  {
    group: 'Teclado Numérico (Numpad)',
    codes: [
      ...Array.from({ length: 10 }, (_, i) => ({
        code: `Numpad${i}`,
        label: `Num ${i} (Numpad${i})`,
      })),
      { code: 'NumpadEnter', label: 'Num Enter' },
      { code: 'NumpadAdd', label: 'Num +' },
      { code: 'NumpadSubtract', label: 'Num -' },
    ],
  },
  {
    group: 'Teclas de Función (F1 - F12)',
    codes: Array.from({ length: 12 }, (_, i) => ({
      code: `F${i + 1}`,
      label: `F${i + 1}`,
    })),
  },
];

export const ALL_KEY_CODES: Array<{ code: string; label: string }> = KEY_CODE_GROUPS.flatMap(
  (g) => g.codes
);

const KEY_LABEL_MAP = new Map<string, string>(ALL_KEY_CODES.map((k) => [k.code, k.label]));

export function formatKeyCodeLabel(code: string): string {
  if (!code) return 'Sin asignar';
  return KEY_LABEL_MAP.get(code) ?? code;
}

export function isStandardKeyCode(code: string): boolean {
  return KEY_LABEL_MAP.has(code) || /^[A-Za-z0-9_]+$/.test(code);
}
