/**
 * Shared Analytics Utilities & Theme Tokens
 * Provides color palette, formatting, CSV export, and risk helpers.
 */

export const CHART_PALETTE = [
  '#7c3aed', // Primary purple
  '#06b6d4', // Cyan
  '#f59e0b', // Amber
  '#10b981', // Emerald
  '#ef4444', // Red
  '#8b5cf6', // Violet
  '#ec4899', // Pink
  '#3b82f6', // Blue
  '#14b8a6', // Teal
];

export function scoreColor(v: number | null | undefined): string {
  if (v == null) return '#9ca3af';
  if (v >= 70) return '#10b981';
  if (v >= 50) return '#f59e0b';
  return '#ef4444';
}

export function riskColor(score: number | null | undefined): string {
  if (score == null) return '#9ca3af';
  if (score >= 70) return '#ef4444'; // Critical
  if (score >= 50) return '#f97316'; // High
  if (score >= 30) return '#f59e0b'; // Watch
  return '#10b981';                 // OK
}

export function riskBandLabel(band: string | undefined): { label: string; color: string; bg: string } {
  switch (band?.toLowerCase()) {
    case 'critical':
      return { label: 'Critical Risk', color: '#ef4444', bg: '#fef2f2' };
    case 'high':
      return { label: 'High Risk', color: '#f97316', bg: '#fff7ed' };
    case 'watch':
      return { label: 'Needs Watch', color: '#d97706', bg: '#fffbeb' };
    case 'ok':
    default:
      return { label: 'On Track', color: '#10b981', bg: '#ecfdf5' };
  }
}

export function bandColor(band: string | undefined): { color: string; bg: string } {
  switch (band?.toLowerCase()) {
    case 'mastered':
      return { color: '#10b981', bg: '#ecfdf5' };
    case 'proficient':
      return { color: '#0284c7', bg: '#f0f9ff' };
    case 'learning':
      return { color: '#f59e0b', bg: '#fffbeb' };
    case 'needs practice':
    case 'needs support':
      return { color: '#ef4444', bg: '#fef2f2' };
    default:
      return { color: '#6b7280', bg: '#f3f4f6' };
  }
}


export function pct(n: number | null | undefined, total?: number): string {
  if (n == null) return '—';
  if (total !== undefined) {
    if (total === 0) return '0%';
    return `${Math.round((n / total) * 100)}%`;
  }
  return `${Math.round(n)}%`;
}

export function fmt(n: number | null | undefined, decimals = 1): string {
  if (n == null) return '—';
  return typeof n === 'number' ? n.toFixed(decimals) : '—';
}

/** Export an array of objects to CSV with Excel formula injection guard and UTF-8 BOM */
export function exportCSV(rows: Record<string, unknown>[], filename: string) {
  if (!rows || !rows.length) return;
  const keys = Object.keys(rows[0]);
  const header = keys.join(',');
  const body = rows
    .map(r =>
      keys
        .map(k => {
          const v = r[k];
          let s = v == null ? '' : String(v);
          // Neutralise Excel formula injection + quote commas/quotes
          if (/^[=+\-@]/.test(s)) s = `'${s}`;
          return s.includes(',') || s.includes('"') || s.includes('\n')
            ? `"${s.replace(/"/g, '""')}"`
            : s;
        })
        .join(',')
    )
    .join('\n');

  // UTF-8 BOM so non-ASCII names survive Excel
  const blob = new Blob(['\ufeff' + header + '\n' + body], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename.endsWith('.csv') ? filename : `${filename}.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
