import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import { parseTeacherApplicationReadResponse } from '@/features/teacher/application-domain';

type OnboardingRole = 'student' | 'teacher';
const PUBLIC_PROFILE_FIELDS = new Set([
  'full_name', 'photo', 'headline', 'bio', 'specializations', 'languages',
  'experience', 'qualifications', 'approach',
]);

/** Pick the first useful setup screen after a verified Google sign-in or role completion. */
export async function googleOnboardingDestination(
  db: SupabaseClient,
  userId: string,
  role: OnboardingRole,
  locale: 'ar' | 'en',
  fallback: string,
): Promise<string> {
  if (role === 'student') {
    const { data, error } = await db.from('student_profiles').select('onboarding_completed_at').eq('id', userId).maybeSingle();
    if (error) return `/${locale}/student/profile?onboarding_error=load`;
    return data?.onboarding_completed_at ? fallback : `/${locale}/student/profile`;
  }

  const { data, error } = await db.rpc('read_teacher_application', { p_teacher_id: userId });
  const response = error ? null : parseTeacherApplicationReadResponse(data);
  const application = response?.application ?? null;
  if (!application) return `/${locale}/teacher/application?onboarding_error=load`;
  if (application.legacy_approved || application.status === 'submitted' || application.status === 'approved') return fallback;
  if (response?.missing.some(field => PUBLIC_PROFILE_FIELDS.has(field))) return `/${locale}/teacher/profile?onboarding=1`;
  return `/${locale}/teacher/application`;
}
