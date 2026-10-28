'use server';

import { revalidatePath } from 'next/cache';
import { invalidatePublicDiscovery } from '@/features/platform/discovery-cache';
import { createClient } from '@/lib/supabase/server';
import type { Locale } from '@/features/student/domain';
import { profileEntryHasContent, richProfileSchema } from './profile-details-domain';

export type RichProfileActionState = {
  error?: string;
  success?: string;
  fieldErrors?: Record<string, string>;
  version?: number;
} | null;

const message = (locale: Locale, en: string, ar: string) => (locale === 'ar' ? ar : en);

function fieldErrors(error: { issues: Array<{ path: PropertyKey[] }> }): Record<string, string> {
  const result: Record<string, string> = {};
  for (const issue of error.issues) {
    const path = issue.path.map(String).join('.') || 'form';
    result[path] ??= 'invalid';
  }
  return result;
}

function expectedVersion(value: FormDataEntryValue | null): number | null {
  if (typeof value !== 'string' || !/^\d+$/.test(value)) return null;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed >= 0 ? parsed : null;
}

function revalidateTeacherProfile(teacherId: string) {
  for (const locale of ['en', 'ar'] as const) {
    revalidatePath(`/${locale}/account/profile`);
    revalidatePath(`/${locale}/teacher`);
    revalidatePath(`/${locale}/teachers`);
    revalidatePath(`/${locale}/teachers/${teacherId}`);
  }
  revalidatePath('/[locale]/teachers/[id]', 'page');
  invalidatePublicDiscovery();
}

export async function saveTeacherProfileDetails(
  locale: Locale,
  state: RichProfileActionState,
  form: FormData,
): Promise<RichProfileActionState> {
  const retainVersion = (result: Exclude<RichProfileActionState, null>) =>
    state?.version === undefined ? result : { ...result, version: state.version };
  let rawDetails: unknown;
  const serializedDetails = form.get('details');
  if (typeof serializedDetails !== 'string') {
    return retainVersion({
      error: message(
        locale,
        'Please review the profile details and try again.',
        'راجع تفاصيل الملف الشخصي وحاول مرة أخرى.',
      ),
      fieldErrors: { form: 'invalid' },
    });
  }
  try {
    rawDetails = JSON.parse(serializedDetails);
  } catch {
    return retainVersion({
      error: message(
        locale,
        'Please review the profile details and try again.',
        'راجع تفاصيل الملف الشخصي وحاول مرة أخرى.',
      ),
      fieldErrors: { form: 'invalid' },
    });
  }

  const parsed = richProfileSchema.safeParse(rawDetails);
  if (!parsed.success) {
    return retainVersion({
      error: message(
        locale,
        'Please check the highlighted profile details.',
        'يرجى مراجعة تفاصيل الملف الشخصي المحددة.',
      ),
      fieldErrors: fieldErrors(parsed.error),
    });
  }
  const version = expectedVersion(form.get('expected_version'));
  if (version === null) {
    return retainVersion({
      error: message(
        locale,
        'Reload your profile before saving these changes.',
        'أعد تحميل ملفك الشخصي قبل حفظ هذه التغييرات.',
      ),
    });
  }

  const db = await createClient();
  const {
    data: { user },
    error: authError,
  } = await db.auth.getUser();
  if (authError || !user) {
    return retainVersion({
      error: message(
        locale,
        'Sign in as an active teacher to save profile details.',
        'سجل الدخول بحساب معلم نشط لحفظ تفاصيل الملف الشخصي.',
      ),
    });
  }
  const { data: profile, error: profileError } = await db
    .from('profiles')
    .select('role,status')
    .eq('id', user.id)
    .maybeSingle();
  if (profileError || profile?.role !== 'teacher' || profile.status !== 'active') {
    return retainVersion({
      error: message(
        locale,
        'An active teacher account is required to save profile details.',
        'يلزم حساب معلم نشط لحفظ تفاصيل الملف الشخصي.',
      ),
    });
  }

  const { data: savedVersion, error } = await db.rpc('save_teacher_profile_details', {
    p_details: {
      ...parsed.data,
      qualifications: parsed.data.qualifications.filter(profileEntryHasContent),
      experience: parsed.data.experience.filter(profileEntryHasContent),
    },
    p_expected_version: version,
  });
  if (error) {
    if (error.code === '40001' || /version conflict/i.test(error.message)) {
      return retainVersion({
        error: message(
          locale,
          'Your profile changed while you were editing. Reload it, review the latest version, and retry.',
          'تغير ملفك الشخصي أثناء التعديل. أعد تحميل أحدث نسخة وراجعها ثم حاول مرة أخرى.',
        ),
      });
    }
    return retainVersion({
      error: message(
        locale,
        'Your profile details could not be saved. Your changes are still in the form; please try again.',
        'تعذر حفظ تفاصيل الملف الشخصي. ستبقى تغييراتك في النموذج؛ حاول مرة أخرى.',
      ),
    });
  }

  const nextVersion =
    typeof savedVersion === 'string' && /^\d+$/.test(savedVersion)
      ? Number(savedVersion)
      : savedVersion;
  if (
    typeof nextVersion !== 'number' ||
    !Number.isSafeInteger(nextVersion) ||
    nextVersion <= version
  ) {
    return retainVersion({
      error: message(
        locale,
        'The save result could not be confirmed. Reload your profile before retrying.',
        'تعذر التحقق من نتيجة الحفظ. أعد تحميل ملفك الشخصي قبل المحاولة مجدداً.',
      ),
    });
  }
  revalidateTeacherProfile(user.id);
  return {
    success: message(locale, 'Profile details saved.', 'تم حفظ تفاصيل الملف الشخصي.'),
    version: nextVersion,
  };
}
