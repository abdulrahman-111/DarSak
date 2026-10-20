import type { createClient } from '@/lib/supabase/server';
import { parseTeacherAccessStatus } from './domain';
export type TeachingGuard =
  { allowed: true } | { allowed: false; reason: 'expired' | 'unavailable' };
export async function checkTeachingAccess(
  db: Awaited<ReturnType<typeof createClient>>,
): Promise<TeachingGuard> {
  const result = await db.rpc('teacher_access_status');
  const status = result.error ? null : parseTeacherAccessStatus(result.data);
  if (!status) return { allowed: false, reason: 'unavailable' };
  return status.has_access ? { allowed: true } : { allowed: false, reason: 'expired' };
}
export function teachingGuardMessage(locale: string, reason: 'expired' | 'unavailable') {
  return locale === 'ar'
    ? reason === 'expired'
      ? 'انتهت صلاحية التدريس. جدّد الوصول من صفحة صلاحية التدريس.'
      : 'تعذر التحقق من صلاحية التدريس. حاول مرة أخرى.'
    : reason === 'expired'
      ? 'Teaching access has expired. Renew access from the teaching access page.'
      : 'Could not verify teaching access. Please try again.';
}
export function teachingMutationMessage(
  locale: string,
  error: { code?: string; message?: string },
  fallback: string,
) {
  if (error.code === '42501' && error.message === 'teacher teaching access expired')
    return teachingGuardMessage(locale, 'expired');
  return fallback;
}
