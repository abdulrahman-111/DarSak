import 'server-only';
import { student } from './data';
import type { Locale } from './domain';
import { normalizeResourceFilters, resourcePagination, type ResourceGroup, type StudentResource } from './resource-domain';
import { measuredServerRead } from '@/lib/server-read-diagnostics';

export async function studentResources(locale: Locale, input: { group?: unknown; kind?: unknown; q?: unknown; groupQuery?: unknown; page?: unknown } = {}) {
  const me = await student(locale);
  return measuredServerRead('student_resources', locale, async () => {
  const filters = normalizeResourceFilters(input);
  const [pageResult, groupResult] = await Promise.all([
    me.db.rpc('student_resource_page', {
      p_group_id: filters.group || null, p_kind: filters.kind || null, p_query: filters.q,
      p_offset: filters.offset, p_limit: 20,
    }),
    me.db.rpc('student_resource_group_choices', { p_query: filters.groupQuery, p_selected_id: filters.group || null }),
  ]);
  const payload = pageResult.data as { rows?: StudentResource[]; total?: number } | null;
  const validPayload = (value: unknown): value is { rows: StudentResource[]; total: number } => {
    if (!value || typeof value !== 'object') return false;
    const candidate = value as { rows?: unknown; total?: unknown };
    return Array.isArray(candidate.rows) && typeof candidate.total === 'number'
      && Number.isSafeInteger(candidate.total) && candidate.total >= 0;
  };
  if (pageResult.error || !validPayload(payload)) {
    return {
      rows: [], groups: (groupResult.data || []) as ResourceGroup[], filters,
      page: 1, pageCount: 1, total: 0, error: true,
    };
  }
  let total = payload.total;
  let pagination = resourcePagination(total, filters.page);
  let rows = payload.rows;
  let pageError = false;
  // If a requested page is now out of range, reload the last valid page.
  if (!pageResult.error && pagination.page !== filters.page) {
    const correctedPage = pagination.page;
    const corrected = await me.db.rpc('student_resource_page', {
      p_group_id: filters.group || null, p_kind: filters.kind || null, p_query: filters.q,
      p_offset: pagination.offset, p_limit: 20,
    });
    if (corrected.error || !validPayload(corrected.data)) {
      rows = [];
      pageError = true;
    } else {
      rows = corrected.data.rows;
      if (corrected.data.total !== total) {
        total = corrected.data.total;
        pagination = resourcePagination(total, pagination.page);
        if (pagination.page !== correctedPage) {
          const latestPage = pagination.page;
          const latest = await me.db.rpc('student_resource_page', {
            p_group_id: filters.group || null, p_kind: filters.kind || null, p_query: filters.q,
            p_offset: pagination.offset, p_limit: 20,
          });
          if (latest.error || !validPayload(latest.data)) {
            rows = [];
            pageError = true;
          } else {
            rows = latest.data.rows;
            if (latest.data.total !== total) {
              total = latest.data.total;
              pagination = resourcePagination(total, pagination.page);
              if (pagination.page !== latestPage) {
                rows = [];
                pageError = true;
              }
            }
          }
        }
      }
    }
  }
  return {
    rows,
    groups: (groupResult.data || []) as ResourceGroup[],
    filters,
    page: pagination.page,
    pageCount: pagination.pageCount,
    total,
    error: !!(pageError || groupResult.error || payload?.total == null),
  };
  }, result => result.error);
}
