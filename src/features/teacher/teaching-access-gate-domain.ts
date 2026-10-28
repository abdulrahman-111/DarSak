import type { AccessRead } from '@/features/teacher-access/data';

/** Where a teacher without usable teaching access must go, or null when the page may render. */
export function teachingAccessRedirect(
  locale: string,
  access: Pick<AccessRead, 'status' | 'error'>,
): string | null {
  if (access.error) return `/${locale}/account/teaching-access?error=unavailable`;
  if (!access.status?.has_access) return `/${locale}/account/teaching-access`;
  return null;
}
