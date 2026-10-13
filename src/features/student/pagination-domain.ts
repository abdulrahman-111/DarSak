export const STUDENT_PAGE_SIZE = 20;

export function normalizeStudentPage(value: unknown): number {
  const parsed = typeof value === 'string' || typeof value === 'number' ? Number(value) : 1;
  const maximum = Math.floor(Number.MAX_SAFE_INTEGER / STUDENT_PAGE_SIZE);
  return Number.isSafeInteger(parsed) && parsed > 0 ? Math.min(parsed, maximum) : 1;
}

export function studentPageCount(total: number): number {
  return Math.max(1, Math.ceil(total / STUDENT_PAGE_SIZE));
}
