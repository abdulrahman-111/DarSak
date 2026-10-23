import 'server-only';
import type { Locale } from '@/features/student/domain';
import { student } from '@/features/student/data';
import { teacherIdentity } from '@/features/teacher/data';
import { idSchema } from '@/features/student/domain';
import {
  assignmentPageCount,
  assignmentPageOffset,
  normalizeAssignmentPage,
  parseStudentAssignmentPage,
  parseTeacherAssignmentPage,
  parseTeacherAssignmentSubmissions,
} from './domain';

const PAGE_SIZE = 20;

async function loadPage<T>(
  fetch: (offset: number) => PromiseLike<{ data: unknown; error: unknown }>,
  parse: (value: unknown) => { rows: T[]; total: number } | null,
  requestedPage: unknown,
) {
  const requested = normalizeAssignmentPage(requestedPage);
  const first = await fetch(assignmentPageOffset(requested));
  if (first.error) return { rows: [] as T[], total: 0, page: 1, pageCount: 1, error: first.error };
  const parsed = parse(first.data);
  if (!parsed)
    return {
      rows: [] as T[],
      total: 0,
      page: 1,
      pageCount: 1,
      error: new Error('Invalid assignment response'),
    };
  const page = Math.min(requested, assignmentPageCount(parsed.total));
  if (page === requested)
    return { ...parsed, page, pageCount: assignmentPageCount(parsed.total), error: null };
  const retry = await fetch(assignmentPageOffset(page));
  if (retry.error)
    return {
      rows: [] as T[],
      total: 0,
      page,
      pageCount: assignmentPageCount(parsed.total),
      error: retry.error,
    };
  const retried = parse(retry.data);
  if (!retried)
    return {
      rows: [] as T[],
      total: 0,
      page,
      pageCount: assignmentPageCount(parsed.total),
      error: new Error('Invalid assignment response'),
    };
  return {
    ...retried,
    page: Math.min(page, assignmentPageCount(retried.total)),
    pageCount: assignmentPageCount(retried.total),
    error: null,
  };
}

export async function getStudentAssignmentPage(
  locale: Locale,
  groupId: string,
  requestedPage: unknown = 1,
) {
  const me = await student(locale);
  if (!idSchema.safeParse(groupId).success)
    return { rows: [], total: 0, page: 1, pageCount: 1, error: new Error('Invalid group id') };
  return loadPage(
    offset =>
      me.db.rpc('student_assignment_page', {
        p_group_id: groupId,
        p_offset: offset,
        p_limit: PAGE_SIZE,
      }),
    parseStudentAssignmentPage,
    requestedPage,
  );
}

export async function getTeacherAssignmentPage(
  locale: Locale,
  groupId: string,
  requestedPage: unknown = 1,
) {
  const me = await teacherIdentity(locale);
  if (!idSchema.safeParse(groupId).success)
    return { rows: [], total: 0, page: 1, pageCount: 1, error: new Error('Invalid group id') };
  return loadPage(
    offset =>
      me.db.rpc('teacher_assignment_page', {
        p_group_id: groupId,
        p_offset: offset,
        p_limit: PAGE_SIZE,
      }),
    parseTeacherAssignmentPage,
    requestedPage,
  );
}

export async function getTeacherAssignmentSubmissions(
  locale: Locale,
  assignmentId: string,
  requestedPage: unknown = 1,
) {
  const me = await teacherIdentity(locale);
  if (!idSchema.safeParse(assignmentId).success)
    return { rows: [], total: 0, page: 1, pageCount: 1, error: new Error('Invalid assignment id') };
  return loadPage(
    offset =>
      me.db.rpc('teacher_assignment_submissions', {
        p_assignment_id: assignmentId,
        p_offset: offset,
        p_limit: PAGE_SIZE,
      }),
    parseTeacherAssignmentSubmissions,
    requestedPage,
  );
}
