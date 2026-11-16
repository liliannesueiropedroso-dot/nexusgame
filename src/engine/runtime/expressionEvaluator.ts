/**
 * Evaluador determinista y seguro de expresiones numéricas y comparaciones.
 * Nunca utiliza `eval()` ni `new Function()` (Regla absoluta 25.7 de NEXUS).
 */

export type VariableMap = Map<string, number | boolean | string>;

type Token =
  | { type: 'num'; value: number }
  | { type: 'ident'; value: string }
  | { type: 'op'; value: string }
  | { type: 'paren'; value: '(' | ')' };

function tokenize(expr: string): Token[] {
  const tokens: Token[] = [];
  let i = 0;
  while (i < expr.length) {
    const ch = expr[i];
    if (/\s/.test(ch)) {
      i += 1;
      continue;
    }
    if (/[0-9.]/.test(ch)) {
      let numStr = '';
      while (i < expr.length && /[0-9.]/.test(expr[i])) {
        numStr += expr[i];
        i += 1;
      }
      const parsed = Number(numStr);
      if (Number.isFinite(parsed)) {
        tokens.push({ type: 'num', value: parsed });
      }
      continue;
    }
    if (/[a-zA-Z_.]/.test(ch)) {
      let ident = '';
      while (i < expr.length && /[a-zA-Z0-9_.]/.test(expr[i])) {
        ident += expr[i];
        i += 1;
      }
      tokens.push({ type: 'ident', value: ident });
      continue;
    }
    if (ch === '(' || ch === ')') {
      tokens.push({ type: 'paren', value: ch });
      i += 1;
      continue;
    }
    if ('+-*/%'.includes(ch)) {
      tokens.push({ type: 'op', value: ch });
      i += 1;
      continue;
    }
    throw new Error(`Carácter no permitido en expresión: "${ch}"`);
  }
  return tokens;
}

export function evaluateNumericExpression(
  expr: string | number,
  variables: VariableMap
): number {
  if (typeof expr === 'number') {
    return Number.isFinite(expr) ? expr : 0;
  }
  const trimmed = expr.trim();
  if (!trimmed) return 0;
  const directNum = Number(trimmed);
  if (Number.isFinite(directNum)) return directNum;

  const tokens = tokenize(trimmed);
  let pos = 0;

  const peek = () => tokens[pos];
  const consume = () => tokens[pos++];

  const parsePrimary = (): number => {
    const tok = peek();
    if (!tok) return 0;
    if (tok.type === 'op' && (tok.value === '-' || tok.value === '+')) {
      consume();
      const val = parsePrimary();
      return tok.value === '-' ? -val : val;
    }
    if (tok.type === 'num') {
      consume();
      return tok.value;
    }
    if (tok.type === 'ident') {
      consume();
      const raw = variables.get(tok.value);
      if (typeof raw === 'number') return raw;
      if (typeof raw === 'boolean') return raw ? 1 : 0;
      const n = Number(raw);
      return Number.isFinite(n) ? n : 0;
    }
    if (tok.type === 'paren' && tok.value === '(') {
      consume();
      const inner = parseAddSub();
      if (peek()?.type === 'paren' && peek()?.value === ')') {
        consume();
      }
      return inner;
    }
    return 0;
  };

  const parseMulDiv = (): number => {
    let left = parsePrimary();
    while (
      peek()?.type === 'op' &&
      (peek()!.value === '*' || peek()!.value === '/' || peek()!.value === '%')
    ) {
      const op = (consume() as { type: 'op'; value: string }).value;
      const right = parsePrimary();
      if (op === '*') left *= right;
      else if (op === '/') left = right === 0 ? 0 : left / right;
      else left = right === 0 ? 0 : left % right;
    }
    return left;
  };

  const parseAddSub = (): number => {
    let left = parseMulDiv();
    while (peek()?.type === 'op' && (peek()!.value === '+' || peek()!.value === '-')) {
      const op = (consume() as { type: 'op'; value: string }).value;
      const right = parseMulDiv();
      left = op === '+' ? left + right : left - right;
    }
    return left;
  };

  const result = parseAddSub();
  return Number.isFinite(result) ? result : 0;
}

export function compareValues(
  left: unknown,
  operator: '==' | '!=' | '>' | '>=' | '<' | '<=',
  right: unknown
): boolean {
  const numL = Number(left);
  const numR = Number(right);
  const bothNumeric =
    left !== '' &&
    right !== '' &&
    typeof left !== 'boolean' &&
    typeof right !== 'boolean' &&
    Number.isFinite(numL) &&
    Number.isFinite(numR);

  switch (operator) {
    case '==':
      return bothNumeric ? numL === numR : String(left) === String(right);
    case '!=':
      return bothNumeric ? numL !== numR : String(left) !== String(right);
    case '>':
      return bothNumeric ? numL > numR : String(left) > String(right);
    case '>=':
      return bothNumeric ? numL >= numR : String(left) >= String(right);
    case '<':
      return bothNumeric ? numL < numR : String(left) < String(right);
    case '<=':
      return bothNumeric ? numL <= numR : String(left) <= String(right);
  }
}
