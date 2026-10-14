export const SAVED_GROUP_PAGE_SIZE = 20;

export function savedGroupOffset(input: unknown, total: number): number {
  const parsed = typeof input === 'string' || typeof input === 'number' ? Number(input) : 1;
  const pageCount = Math.max(1, Math.ceil(Math.max(0, total) / SAVED_GROUP_PAGE_SIZE));
  const page = Number.isSafeInteger(parsed) && parsed > 0 ? Math.min(parsed, pageCount) : 1;
  return (page - 1) * SAVED_GROUP_PAGE_SIZE;
}
