import 'server-only';

import type { Locale } from '@/features/student/domain';
import { createClient } from '@/lib/supabase/server';
import { richProfileSchema, publicTeacherProfileDetailsSchema, type RichProfileInput } from './profile-details-domain';

function message(locale: Locale, en: string, ar: string) {
  return locale === 'ar' ? ar : en;
}

function parseVersion(value: unknown): number | null {
  const version = typeof value === 'string' && /^\d+$/.test(value) ? Number(value) : value;
  return typeof version === 'number' && Number.isSafeInteger(version) && version >= 0 ? version : null;
}

export type TeacherProfileDetailsResult = {
  details: RichProfileInput | null;
  version: number | null;
  error: string | null;
};

/** Read the canonical profile row for the current active teacher. A failed read is never replaced with empty content. */
export async function teacherProfileDetails(locale: Locale): Promise<TeacherProfileDetailsResult> {
  const db = await createClient();
  const { data: { user }, error: authError } = await db.auth.getUser();
  if (authError || !user) {
    return { details: null, version: null, error: message(locale, 'Sign in as an active teacher to load profile details.', 'سجل الدخول بحساب معلم نشط لعرض تفاصيل الملف الشخصي.') };
  }

  const { data: profile, error: profileError } = await db.from('profiles').select('role,status').eq('id', user.id).maybeSingle();
  if (profileError || profile?.role !== 'teacher' || profile.status !== 'active') {
    return { details: null, version: null, error: message(locale, 'Could not verify your active teacher account.', 'تعذر التحقق من حساب المعلم النشط.') };
  }

  const { data, error } = await db.from('teacher_profile_details').select('details,version').eq('teacher_id', user.id).maybeSingle();
  if (error) {
    return { details: null, version: null, error: message(locale, 'Could not load profile details. Please try again.', 'تعذر تحميل تفاصيل الملف الشخصي. حاول مرة أخرى.') };
  }
  if (!data) {
    return { details: null, version: null, error: message(locale, 'Profile details are not available. Please try again.', 'تفاصيل الملف الشخصي غير متاحة. حاول مرة أخرى.') };
  }

  const parsed = richProfileSchema.safeParse(data.details);
  const version = parseVersion(data.version);
  if (!parsed.success || version === null) {
    return { details: null, version: null, error: message(locale, 'Profile details could not be read safely. Please contact support.', 'تعذر قراءة تفاصيل الملف الشخصي بأمان. تواصل مع الدعم.') };
  }
  return { details: parsed.data, version, error: null };
}

export function safePublicTeacherProfileDetails(value: unknown) {
  const result = publicTeacherProfileDetailsSchema.safeParse(value);
  return result.success ? result.data : null;
}
