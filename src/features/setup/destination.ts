import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Locale } from '@/i18n/config';
import { safeLoginReturnPath } from '@/features/auth/return-path';

export type SetupRole = 'teacher' | 'student' | 'admin';

/** Keep only known local destinations that lead to a daily workspace or an existing group/class. */
export function safeSetupReturnPath(
  locale: Locale,
  role: SetupRole,
  candidate: unknown,
): string | null {
  if (
    typeof candidate !== 'string' ||
    candidate.includes('//') ||
    candidate.includes('\\') ||
    candidate.includes('..')
  )
    return null;
  if (candidate === `/${locale}/${role}`) return candidate;
  return safeLoginReturnPath(locale, candidate);
}

function workspaceFallback(locale: Locale, role: SetupRole): string {
  return `/${locale}/${role}`;
}

function setupPath(locale: Locale, fallback: string, loadError = false): string {
  const params = new URLSearchParams();
  if (loadError) params.set('load', 'error');
  params.set('returnTo', fallback);
  return `/${locale}/account/setup?${params.toString()}`;
}

/**
 * Resolve post-auth routing from canonical server rows. `fallback` must already be a local,
 * role-appropriate workspace destination; it is checked again before being preserved through setup.
 */
export async function resolveSetupDestination(
  db: SupabaseClient,
  userId: string,
  canonicalRole: SetupRole,
  locale: Locale,
  fallback: string,
): Promise<string> {
  const safeFallback =
    safeSetupReturnPath(locale, canonicalRole, fallback) ??
    workspaceFallback(locale, canonicalRole);
  const errorDestination = () => setupPath(locale, safeFallback, true);

  try {
    const profileResult = await db
      .from('profiles')
      .select('role,status')
      .eq('id', userId)
      .maybeSingle();
    if (
      profileResult.error ||
      profileResult.data?.role !== canonicalRole ||
      profileResult.data.status !== 'active'
    ) {
      return errorDestination();
    }

    if (canonicalRole === 'admin') return safeFallback;

    if (canonicalRole === 'teacher') {
      const applicationResult = await db
        .from('teacher_applications')
        .select('status,legacy_approved')
        .eq('teacher_id', userId)
        .maybeSingle();
      const application = applicationResult.data;
      if (
        applicationResult.error ||
        !application ||
        typeof application.status !== 'string' ||
        typeof application.legacy_approved !== 'boolean'
      ) {
        return errorDestination();
      }
      if (application.legacy_approved || application.status === 'approved') return safeFallback;
      if (application.status === 'submitted') return `/${locale}/account/application`;
      if (
        application.status === 'draft' ||
        application.status === 'changes_requested' ||
        application.status === 'declined'
      ) {
        return setupPath(locale, safeFallback);
      }
      return errorDestination();
    }

    const studentResult = await db
      .from('student_profiles')
      .select('onboarding_required,onboarding_completed_at')
      .eq('id', userId)
      .maybeSingle();
    const student = studentResult.data;
    if (
      studentResult.error ||
      !student ||
      typeof student.onboarding_required !== 'boolean' ||
      (student.onboarding_completed_at !== null &&
        typeof student.onboarding_completed_at !== 'string')
    ) {
      return errorDestination();
    }
    return student.onboarding_required && student.onboarding_completed_at === null
      ? setupPath(locale, safeFallback)
      : safeFallback;
  } catch {
    return errorDestination();
  }
}
