'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import type { Locale } from '@/features/student/domain';
import { isGoogleDriveCvUrl, parseTeacherApplicationReadResponse } from './application-domain';
import { TEACHER_RULES_VERSION } from './teacher-rules';

export type ApplicationActionState = {
  error?: string;
  success?: string;
  updatedAt?: string;
  fieldErrors?: Record<string, string>;
  values?: { teachingYears: string; adminPhone: string; links: string[]; cvUrl: string; attested: boolean; teacherRulesAccepted: boolean };
} | null;

const message = (locale: Locale, en: string, ar: string) => locale === 'ar' ? ar : en;
const valuesFrom = (form: FormData) => ({
  teachingYears: String(form.get('teaching_years') ?? ''),
  adminPhone: String(form.get('admin_phone') ?? ''),
  cvUrl: String(form.get('cv_url') ?? '').trim(),
  links: [0, 1, 2].map(index => String(form.get(`supporting_link_${index}`) ?? '').trim()),
  attested: form.get('attested') === 'on',
  teacherRulesAccepted: form.get('teacher_rules') === 'on',
});
const linksValid = (links: string[]) => {
  const present = links.filter(Boolean);
  return present.length <= 3 && present.every(link => link.length <= 500 && /^https:\/\//i.test(link) && (() => { try { return new URL(link).protocol === 'https:'; } catch { return false; } })());
};
async function identity(locale: Locale) {
  const db = await createClient();
  const { data: { user }, error } = await db.auth.getUser();
  if (error || !user) return { db, id: null, error: message(locale, 'Sign in as an active teacher to continue.', 'سجل الدخول بحساب معلم نشط للمتابعة.') };
  const profile = await db.from('profiles').select('role,status').eq('id', user.id).maybeSingle();
  if (profile.error || profile.data?.role !== 'teacher' || profile.data.status !== 'active') return { db, id: null, error: message(locale, 'An active teacher account is required.', 'يلزم حساب معلم نشط.') };
  return { db, id: user.id, error: null };
}

export async function saveTeacherApplication(locale: Locale, _state: ApplicationActionState, form: FormData): Promise<ApplicationActionState> {
  const values = valuesFrom(form);
  const years = values.teachingYears === '' ? null : Number(values.teachingYears);
  const phoneDigits = values.adminPhone.replace(/\D/g, '');
  const submitting = form.get('intent') === 'submit';
  const fieldErrors: Record<string, string> = {};
  if (years !== null && (!Number.isInteger(years) || years < 0 || years > 60)) fieldErrors.teaching_years = 'invalid';
  if ((submitting && !values.adminPhone.trim()) || (values.adminPhone.trim() && (!/^[\d\s()+-]{7,30}$/.test(values.adminPhone) || phoneDigits.length < 7))) fieldErrors.admin_phone = 'invalid';
  if (submitting && years === null) fieldErrors.teaching_years = 'invalid';
  if (submitting && !values.teacherRulesAccepted) fieldErrors.teacher_rules = 'required';
  if (!linksValid(values.links)) fieldErrors.supporting_links = 'invalid';
  if (values.cvUrl && !isGoogleDriveCvUrl(values.cvUrl)) fieldErrors.cv_url = 'invalid';
  if (Object.keys(fieldErrors).length) return { error: message(locale, 'Please check the highlighted fields.', 'يرجى مراجعة الحقول المحددة.'), fieldErrors, values };

  const { db, id, error: authError } = await identity(locale);
  if (!id) return { error: authError ?? message(locale, 'An active teacher account is required.', 'يلزم حساب معلم نشط.'), values };
  const read = await db.rpc('read_teacher_application', { p_teacher_id: id });
  const current = read.error ? null : parseTeacherApplicationReadResponse(read.data).application;
  if (!current) return { error: message(locale, 'Could not load your application. Refresh and try again.', 'تعذر تحميل طلبك. حدّث الصفحة وحاول مرة أخرى.'), values };
  if (!['draft', 'changes_requested', 'declined'].includes(current.status)) return { error: message(locale, 'This application is locked while it is under review.', 'هذا الطلب مقفل أثناء المراجعة.'), values };
  const expected = form.get('expected_updated_at');
  if (typeof expected !== 'string' || expected !== current.updated_at) return { error: message(locale, 'Your application changed in another tab. Review the latest version, then save again.', 'تغير طلبك في علامة تبويب أخرى. راجع أحدث نسخة ثم أعد الحفظ.'), values, updatedAt: current.updated_at };

  const saved = await db.rpc('save_teacher_application', {
    p_teaching_years: years,
    p_admin_phone: values.adminPhone.trim(),
    p_cv_path: current.cv_path,
    p_cv_url: values.cvUrl || null,
    p_supporting_links: values.links.filter(Boolean),
    p_attested: values.attested,
    p_expected_updated_at: current.updated_at,
  });
  if (saved.error) {
    const stale = saved.error.code === 'PT409';
    return { error: stale ? message(locale, 'Your application changed while you were saving. Refresh, review the latest version, and try again.', 'تغير طلبك أثناء الحفظ. حدّث الصفحة وراجع أحدث نسخة ثم حاول مرة أخرى.') : message(locale, 'Your draft could not be saved. Your entries remain in the form; try again.' , 'تعذر حفظ المسودة. ستبقى بياناتك في النموذج؛ حاول مرة أخرى.'), values };
  }
  const savedResponse = parseTeacherApplicationReadResponse(saved.data);
  if (!savedResponse.application) {
    revalidate(locale, id);
    return { error: message(locale, 'The save result could not be confirmed. Refresh before retrying.', 'تعذر التحقق من نتيجة الحفظ. حدّث الصفحة قبل المحاولة مجدداً.'), values };
  }

  if (submitting) {
    if (!values.attested) return { error: message(locale, 'Confirm the truth statement before submitting. Your draft has been saved.', 'أقر بصحة المعلومات قبل الإرسال. تم حفظ المسودة.'), fieldErrors: { attested: 'required' }, values, updatedAt: savedResponse.application.updated_at };
    const submitted = await db.rpc('submit_teacher_application_with_rules', {
      p_expected_updated_at: savedResponse.application.updated_at,
      p_rules_version: TEACHER_RULES_VERSION,
    });
    if (submitted.error) {
      const stale = submitted.error.code === 'PT409';
      const missing = submitted.error.code === '22023';
      return { error: stale ? message(locale, 'Your application changed while you were submitting. Refresh and try again.', 'تغير طلبك أثناء الإرسال. حدّث الصفحة وحاول مرة أخرى.') : missing ? message(locale, 'Complete every required profile item in the checklist before submitting.', 'أكمل جميع عناصر الملف الشخصي المطلوبة في القائمة قبل الإرسال.') : message(locale, 'Your draft is saved, but could not be submitted. Refresh and try again.', 'تم حفظ المسودة، لكن تعذر إرسالها. حدّث الصفحة وحاول مرة أخرى.'), values, updatedAt: savedResponse.application.updated_at };
    }
    const response = parseTeacherApplicationReadResponse(submitted.data);
    if (!response.application) return { error: message(locale, 'The submission result could not be confirmed. Refresh before retrying.', 'تعذر التحقق من الإرسال. حدّث الصفحة قبل المحاولة مجدداً.'), values };
    revalidate(locale, id);
    return { success: message(locale, 'Your application was submitted for review.', 'تم إرسال طلبك للمراجعة.'), values: { ...values, attested: true, teacherRulesAccepted: true }, updatedAt: response.application.updated_at };
  }
  revalidate(locale, id);
  return { success: message(locale, 'Draft saved.', 'تم حفظ المسودة.'), values, updatedAt: savedResponse.application.updated_at };
}

export async function downloadTeacherApplicationCv(locale: Locale): Promise<{ url?: string; error?: string }> {
  const { db, id, error } = await identity(locale);
  if (!id) return { error: error ?? message(locale, 'An active teacher account is required.', 'يلزم حساب معلم نشط.') };
  const result = await db.rpc('read_teacher_application', { p_teacher_id: id });
  const application = result.error ? null : parseTeacherApplicationReadResponse(result.data).application;
  if (!application?.cv_path || !application.cv_path.startsWith(`${id}/`)) return { error: message(locale, 'CV download is unavailable.', 'تنزيل السيرة الذاتية غير متاح.') };
  const signed = await db.storage.from('teacher-applications').createSignedUrl(application.cv_path, 60, { download: true });
  return signed.error || !signed.data?.signedUrl ? { error: message(locale, 'CV download is unavailable.', 'تنزيل السيرة الذاتية غير متاح.') } : { url: signed.data.signedUrl };
}

function revalidate(locale: Locale, id: string) {
  for (const lang of ['en', 'ar'] as const) {
    revalidatePath(`/${lang}/account/application`);
    revalidatePath(`/${lang}/teacher`);
    revalidatePath(`/${lang}/admin/teachers/${id}`);
  }
}
