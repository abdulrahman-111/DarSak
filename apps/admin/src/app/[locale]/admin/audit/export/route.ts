import { requireAdminActor } from '@admin/lib/access';
import { ensureLocale } from '@/i18n/config';
import {
  parseAuditPage,
  validateAuditFilters,
  utcDateStart,
  utcDateExclusiveEnd,
  type AuditFilters,
  type AuditPage,
  type AuditRow,
} from '@admin/features/audit/domain';

const PAGE_SIZE = 1000;
const MAX_PAGES = 50;

export function csvCell(value: unknown): string {
  let text = value == null ? '' : typeof value === 'string' ? value : JSON.stringify(value);
  if (/^[\s\u0000-\u001f]*[=+\-@]/.test(text)) text = `'${text}`;
  return `"${text.replaceAll('"', '""')}"`;
}

function csvRow(row: AuditRow): string {
  return (
    [
      row.id,
      row.at,
      row.actor_id,
      row.actor_role,
      row.action,
      row.target_type,
      row.target_id,
      row.request_id,
      row.metadata,
    ]
      .map(csvCell)
      .join(',') + '\r\n'
  );
}

function parseFilters(params: URLSearchParams): AuditFilters {
  const single = (key: string) => {
    const values = params.getAll(key);
    return values.length > 1 ? '\u0000invalid' : (values[0] ?? '');
  };
  return {
    actorId: single('actor_id'),
    targetType: single('target_type'),
    targetId: single('target_id'),
    action: single('action'),
    from: single('from'),
    to: single('to'),
  };
}

export async function GET(request: Request, { params }: { params: Promise<{ locale: string }> }) {
  const { locale: raw } = await params;
  const locale = ensureLocale(raw);
  const actor = await requireAdminActor(locale);
  const filters = parseFilters(new URL(request.url).searchParams);
  if (validateAuditFilters(filters)) return new Response('Invalid audit filters', { status: 400 });

  const args = {
    p_actor_id: filters.actorId || null,
    p_target_type: filters.targetType || null,
    p_target_id: filters.targetId || null,
    p_action: filters.action || null,
    p_from: filters.from ? utcDateStart(filters.from) : null,
    p_to: filters.to ? utcDateExclusiveEnd(filters.to) : null,
    p_before_at: null as string | null,
    p_before_id: null as string | null,
    p_snapshot_at: null as string | null,
    p_limit: PAGE_SIZE,
  };
  const firstResult = await actor.db.rpc('admin_audit_page', args);
  const first = firstResult.error ? null : parseAuditPage(firstResult.data);
  if (!first) return new Response('Could not load audit export', { status: 502 });

  let snapshot = first.snapshot_at;
  let cursor = first.next_cursor;
  let pages = 1;
  let emitted = 0;
  let cancelled = false;
  const encoder = new TextEncoder();
  const header = 'id,at,actor_id,actor_role,action,target_type,target_id,request_id,metadata\r\n';
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const firstChunk = header + first.rows.map(csvRow).join('');
      emitted = first.rows.length;
      controller.enqueue(encoder.encode(firstChunk));
    },
    async pull(controller) {
      if (cancelled) return;
      if (emitted >= 50000 || pages >= MAX_PAGES || !cursor) {
        controller.close();
        return;
      }
      try {
        const previous = cursor;
        const result = await actor.db.rpc('admin_audit_page', {
          ...args,
          p_before_at: previous.at,
          p_before_id: previous.id,
          p_snapshot_at: snapshot,
        });
        const next = result.error ? null : parseAuditPage(result.data);
        if (!next) throw new Error('Audit page fetch failed');
        if (
          next.snapshot_at !== snapshot ||
          (next.next_cursor &&
            next.next_cursor.at === previous.at &&
            next.next_cursor.id === previous.id)
        )
          throw new Error('Audit cursor did not progress');
        pages++;
        cursor = next.next_cursor;
        const lines: string[] = [];
        for (const row of next.rows) {
          if (emitted >= 50000) break;
          lines.push(csvRow(row));
          emitted++;
        }
        if (lines.length) controller.enqueue(encoder.encode(lines.join('')));
        if (emitted >= 50000 || pages >= MAX_PAGES || !cursor) controller.close();
      } catch {
        if (!cancelled) controller.error(new Error('Audit export interrupted'));
      }
    },
    cancel() {
      cancelled = true;
    },
  });
  return new Response(stream, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': 'attachment; filename="darsak-audit.csv"',
      'Cache-Control': 'private, no-store',
      'X-Content-Type-Options': 'nosniff',
    },
  });
}
