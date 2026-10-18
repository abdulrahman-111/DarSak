import { reportSchema } from '@/lib/domain';

/** Strip URL credentials, query strings, and fragments before storing a report path. */
export function normalizeReportPagePath(input: string): string {
  const value = input.trim();
  if (!value) return '';
  if (/[\\\u0000-\u001f\u007f]/.test(value)) return '';
  let path = value;
  if (/^https?:\/\//i.test(value)) {
    try { path = new URL(value).pathname; } catch { return ''; }
  } else {
    // Only accept relative paths; pasted schemes and protocol-relative URLs are not paths.
    if (/^[a-z][a-z\d+.-]*:/i.test(value) || value.startsWith('//')) return '';
    path = value.split(/[?#]/, 1)[0] || '';
  }
  if (!path) return '';
  if (!path.startsWith('/')) path = `/${path}`;
  return path.length <= 500 ? path : '';
}

export const reportInputSchema = reportSchema;

export type ReportHistoryRow = { id: string; subject: string; description: string; status: 'open'|'resolved'; page_path: string; created_at: string; updated_at: string; public_response?: string; reviewed_at?: string|null };
export type AdminReportRow = ReportHistoryRow & { admin_note: string|null; reporter_id: string; reporter_name: string; reporter_role: string };

export function parseAdminReportPage(value: unknown): { rows: AdminReportRow[]; total: number } | null {
  if (!value || typeof value !== 'object') return null;
  const page = value as { rows?: unknown; total?: unknown };
  if (!Array.isArray(page.rows) || !Number.isInteger(page.total) || Number(page.total) < 0) return null;
  const rows: AdminReportRow[] = [];
  for (const candidate of page.rows) {
    if (!candidate || typeof candidate !== 'object') return null;
    const r = candidate as Record<string, unknown>;
    if (typeof r.id !== 'string' || typeof r.subject !== 'string' || typeof r.description !== 'string' || !['open','resolved'].includes(String(r.status)) || typeof r.page_path !== 'string' || typeof r.created_at !== 'string' || typeof r.updated_at !== 'string' || typeof r.reporter_id !== 'string' || typeof r.reporter_name !== 'string' || typeof r.reporter_role !== 'string' || !(typeof r.admin_note === 'string' || r.admin_note === null)) return null;
    rows.push(r as unknown as AdminReportRow);
  }
  return { rows, total: Number(page.total) };
}

export function reportProgress(status: string,reviewedAt: string|null|undefined,locale:string):string {
 return locale==='ar'?(status==='resolved'?'تم الحل':reviewedAt?'قيد المراجعة':'تم الاستلام'):(status==='resolved'?'Resolved':reviewedAt?'Under review':'Received');
}
