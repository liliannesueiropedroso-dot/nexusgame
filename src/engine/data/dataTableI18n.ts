import type { DataTableDef, I18nConfig, I18nLocale } from '../core/types';

function coerceCell(raw: string): string | number | boolean {
  const trimmed = raw.trim();
  if (trimmed === 'true') return true;
  if (trimmed === 'false') return false;
  if (trimmed !== '' && !Number.isNaN(Number(trimmed))) return Number(trimmed);
  return trimmed;
}

function splitCsvLine(line: string): string[] {
  const out: string[] = [];
  let cur = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        cur += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (ch === ',' && !inQuotes) {
      out.push(cur);
      cur = '';
    } else {
      cur += ch;
    }
  }
  out.push(cur);
  return out;
}

export function parseCsvToTableRows(csvText: string): {
  columns: string[];
  rows: Array<Record<string, string | number | boolean>>;
} {
  const lines = csvText
    .replace(/\r\n/g, '\n')
    .split('\n')
    .map((l) => l.trimEnd())
    .filter((l) => l.length > 0);
  if (lines.length === 0) {
    return { columns: ['id', 'name'], rows: [] };
  }
  const columns = splitCsvLine(lines[0]).map((c, idx) => c.trim() || `col_${idx}`);
  const rows: Array<Record<string, string | number | boolean>> = [];
  for (let i = 1; i < lines.length; i++) {
    const vals = splitCsvLine(lines[i]);
    const row: Record<string, string | number | boolean> = {};
    columns.forEach((col, cIdx) => {
      row[col] = coerceCell(vals[cIdx] ?? '');
    });
    rows.push(row);
  }
  return { columns, rows };
}

export function exportTableRowsToCsv(table: DataTableDef): string {
  const cols = table.columns.length > 0 ? table.columns : ['id', 'name'];
  const esc = (v: unknown) => {
    const s = String(v ?? '');
    return s.includes(',') || s.includes('"') || s.includes('\n')
      ? `"${s.replace(/"/g, '""')}"`
      : s;
  };
  const header = cols.map(esc).join(',');
  const body = (table.rows ?? []).map((row) => cols.map((c) => esc(row[c])).join(','));
  return [header, ...body].join('\n');
}

export function queryDataTable(
  tables: DataTableDef[] | undefined,
  tableNameOrId: string,
  rowKeyOrIndex?: string | number
): unknown {
  if (!tables || tables.length === 0) return null;
  const table = tables.find(
    (t) => t.id === tableNameOrId || t.name.toLowerCase() === String(tableNameOrId).toLowerCase()
  );
  if (!table) return null;
  if (rowKeyOrIndex === undefined || rowKeyOrIndex === null || rowKeyOrIndex === '') {
    return table.rows;
  }
  if (typeof rowKeyOrIndex === 'number') {
    return table.rows[rowKeyOrIndex] ?? null;
  }
  const match = table.rows.find(
    (r) => String(r.id ?? '') === rowKeyOrIndex || String(r.name ?? '') === rowKeyOrIndex
  );
  if (match) return match;
  const asNum = Number(rowKeyOrIndex);
  if (!Number.isNaN(asNum)) {
    return table.rows[asNum] ?? null;
  }
  return null;
}

export function detectBrowserLocale(fallback: I18nLocale = 'es'): I18nLocale {
  if (typeof navigator === 'undefined') return fallback;
  const lang = String(navigator.language || (navigator.languages && navigator.languages[0]) || '')
    .toLowerCase()
    .slice(0, 2);
  if (lang === 'en' || lang === 'es' || lang === 'pt') return lang;
  return fallback;
}

export function resolveI18nText(
  i18n: I18nConfig | undefined,
  key: string,
  locale?: I18nLocale
): string {
  if (!i18n) return key;
  const loc = locale ?? i18n.defaultLocale ?? 'es';
  const entry = i18n.entries?.[key];
  if (!entry) return key;
  return (
    entry[loc] ??
    entry[i18n.defaultLocale ?? 'es'] ??
    entry.es ??
    entry.en ??
    entry.pt ??
    key
  );
}
