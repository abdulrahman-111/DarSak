import { STUDENT_PAGE_SIZE, studentPageCount } from '@/features/student/pagination-domain';

export const TEACHER_PAGE_SIZE = STUDENT_PAGE_SIZE;

// Postgres RPC integer offsets use signed 32-bit integers. Keep input parsing
// bounded, then clamp it to the actual result count before requesting a page.
const MAX_RPC_OFFSET = 2_147_483_647;
const MAX_TEACHER_PAGE = Math.floor(MAX_RPC_OFFSET / TEACHER_PAGE_SIZE) + 1;

export function normalizeTeacherPage(value: unknown): number {
  const candidate = Array.isArray(value) ? value[0] : value;
  const parsed =
    typeof candidate === 'string' || typeof candidate === 'number' ? Number(candidate) : 1;
  return Number.isSafeInteger(parsed) && parsed > 0 ? Math.min(parsed, MAX_TEACHER_PAGE) : 1;
}

export function clampTeacherPage(page: number, total: number): number {
  return Math.min(page, studentPageCount(total), MAX_TEACHER_PAGE);
}

export function teacherPageCount(total: number): number {
  return clampTeacherPage(Number.MAX_SAFE_INTEGER, total);
}

export function teacherPageOffset(page: number): number {
  return (page - 1) * TEACHER_PAGE_SIZE;
}
