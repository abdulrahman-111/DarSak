import 'server-only';
import { student } from './data';
import type { Locale } from './domain';
import { normalizeResourceFilters, resourcePagination, type ResourceGroup, type StudentResource } from './resource-domain';

export async function studentResources(locale: Locale, input: { group?: unknown; kind?: unknown; q?: unknown; groupQuery?: unknown; page?: unknown } = {}) {
  const me = await student(locale);
  const filters = normalizeResourceFilters(input);
  const [pageResult, groupResult] = await Promise.all([
    me.db.rpc('student_resource_page', {
      p_group_id: filters.group || null, p_kind: filters.kind || null, p_query: filters.q,
      p_offset: filters.offset, p_limit: 20,
    }),
    me.db.rpc('student_resource_group_choices', { p_query: filters.groupQuery, p_selected_id: filters.group || null }),
  ]);
  const payload = pageResult.data as { rows?: StudentResource[]; total?: number } | null;
  const total = Number(payload?.total ?? 0);
  const pagination = resourcePagination(total, filters.page);
  let rows = Array.isArray(payload?.rows) ? payload.rows : [];
  let pageError = !!pageResult.error;
  // If a requested page is now out of range, reload the last valid page.
  if (!pageResult.error && pagination.page !== filters.page) {
    const corrected = await me.db.rpc('student_resource_page', {
      p_group_id: filters.group || null, p_kind: filters.kind || null, p_query: filters.q,
      p_offset: pagination.offset, p_limit: 20,
    });
    const correctedPayload = corrected.data as { rows?: StudentResource[] } | null;
    rows = Array.isArray(correctedPayload?.rows) ? correctedPayload.rows : [];
    pageError = !!corrected.error;
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
}
