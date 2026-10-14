import { NextRequest } from 'next/server';
import { getRequestViewer } from '@/features/platform/request-viewer';
import { formatCalendarIcs, MAX_CALENDAR_EVENTS, safeCalendarFilename, validateCalendarRange } from '@/features/calendar/domain';

const privateHeaders = { 'Cache-Control': 'private, no-store', 'Vary': 'Cookie' };

function response(body: BodyInit | null, status: number, headers: Record<string, string> = {}) {
  return new Response(body, { status, headers: { ...privateHeaders, ...headers } });
}

function error(status: number, code: string) {
  return response(JSON.stringify({ error: code }), status, { 'Content-Type': 'application/json; charset=utf-8' });
}

export async function GET(request: NextRequest) {
  try {
    const query = request.nextUrl.searchParams;
    const range = validateCalendarRange(query.get('from'), query.get('until'));
    const locale = query.get('locale');
    if (!range.valid || (locale !== 'en' && locale !== 'ar')) return error(400, 'invalid_range');

    const { db, user, profile } = await getRequestViewer();
    if (!user) return error(401, 'unauthenticated');
    if (!profile || profile.status !== 'active' || !['student', 'teacher'].includes(profile.role)) return error(403, 'unavailable');

    const { data, error: rpcError } = await db.rpc('calendar_lesson_export', { p_from: range.from, p_until: range.until });
    if (rpcError) return rpcError.code === '42501'
      ? error(403, rpcError.message === 'teacher teaching access expired' ? 'teaching_access_expired' : 'unavailable')
      : rpcError.code === '54000'
      ? error(400, 'too_many_lessons')
      : rpcError.code === '22023'
        ? error(400, 'invalid_range')
        : error(500, 'internal');
    if (!data || typeof data !== 'object') return error(500, 'internal');
    const result = data as { rows?: unknown; total?: unknown };
    if (!Array.isArray(result.rows) || !Number.isSafeInteger(result.total) || (result.total as number) < 0) return error(500, 'internal');
    if ((result.total as number) > MAX_CALENDAR_EVENTS || result.rows.length > MAX_CALENDAR_EVENTS) return error(400, 'too_many_lessons');
    if (result.total !== result.rows.length) return error(500, 'internal');

    const ics = formatCalendarIcs(result.rows as Parameters<typeof formatCalendarIcs>[0], new Date());
    return response(ics, 200, {
      'Content-Type': 'text/calendar; charset=utf-8',
      'Content-Disposition': `attachment; filename="${safeCalendarFilename(range.from, range.until)}"`,
    });
  } catch {
    return error(500, 'internal');
  }
}
