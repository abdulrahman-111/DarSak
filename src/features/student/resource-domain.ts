import { idSchema } from './domain';
import { STUDENT_PAGE_SIZE, normalizeStudentPage, studentPageCount } from './pagination-domain';

export type ResourceKind = 'note' | 'link' | 'file';
export type StudentResource = {
  id: string; title: string; kind: ResourceKind; lesson_id: string; lesson_title: string;
  starts_at: string; group_id: string; group_name: string; url: string | null; content: string | null;
};
export type ResourceGroup = { id: string; name: string };

export function normalizeResourceFilters(input: { group?: unknown; kind?: unknown; q?: unknown; groupQuery?: unknown; page?: unknown } = {}) {
  const kind = input.kind === 'note' || input.kind === 'link' || input.kind === 'file' ? input.kind : '';
  const group = typeof input.group === 'string' && idSchema.safeParse(input.group).success ? input.group : '';
  const q = typeof input.q === 'string' ? input.q.trim().slice(0, 100) : '';
  const groupQuery = typeof input.groupQuery === 'string' ? input.groupQuery.trim().slice(0, 100) : '';
  const page = Math.min(normalizeStudentPage(input.page), 50_000);
  return { group, kind, q, groupQuery, page, offset: (page - 1) * STUDENT_PAGE_SIZE };
}

export function resourcePagination(total: number, requestedPage: number) {
  const pageCount = studentPageCount(total);
  const page = Math.min(requestedPage, pageCount);
  return { page, pageCount, offset: (page - 1) * STUDENT_PAGE_SIZE };
}
