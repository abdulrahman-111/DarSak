'use server';
import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { reportInputSchema, normalizeReportPagePath } from './domain';

type State = { error?: string; reference?: string } | null;
const msg = (locale: string, en: string, ar: string) => locale === 'ar' ? ar : en;

export async function submitProblemReport(locale: string, _previous: State, form: FormData): Promise<State> {
  const language = locale === 'ar' ? 'ar' : 'en';
  const parsed = reportInputSchema.safeParse({
    subject: form.get('subject'), description: form.get('description'),
    page_path: normalizeReportPagePath(String(form.get('page_path') || '')),
  });
  if (!parsed.success) {
    const field = parsed.error.issues[0]?.path[0];
    return { error: field === 'subject'
      ? msg(language, 'Subject must be 2–160 characters.', 'يجب أن يكون العنوان بين حرفين و١٦٠ حرفًا.')
      : field === 'description'
        ? msg(language, 'Description must be 10–5,000 characters.', 'يجب أن يكون الوصف بين ١٠ و٥٠٠٠ حرف.')
        : msg(language, 'Affected page must be 500 characters or fewer.', 'يجب ألا يتجاوز مسار الصفحة ٥٠٠ حرف.') };
  }
  const db = await createClient();
  const { data: { user } } = await db.auth.getUser();
  if (!user) return { error: msg(language, 'Sign in to submit a report.', 'سجّل الدخول لإرسال بلاغ.') };
  const { data: profile } = await db.from('profiles').select('status').eq('id', user.id).maybeSingle();
  if (profile?.status !== 'active') return { error: msg(language, 'An active account is required to submit a report.', 'يلزم حساب نشط لإرسال بلاغ.') };
  const { data, error } = await db.rpc('submit_problem_report', {
    p_subject: parsed.data.subject, p_description: parsed.data.description, p_page_path: parsed.data.page_path,
  });
  if (error) {
    const raw = error.message.toLowerCase();
    if (raw.includes('rate limit') || raw.includes('too many') || error.code === 'PT429')
      return { error: msg(language, 'You have reached the report limit. Please wait before submitting another report.', 'لقد بلغت الحد المسموح للبلاغات. انتظر قليلًا قبل إرسال بلاغ آخر.') };
    if (error.code === '42501' || raw.includes('active account') || raw.includes('not authorized'))
      return { error: msg(language, 'An active account is required to submit a report.', 'يلزم حساب نشط لإرسال بلاغ.') };
    return { error: msg(language, 'We could not submit your report. Please try again.', 'تعذر إرسال البلاغ. حاول مرة أخرى.') };
  }
  const reference = typeof data === 'string' ? data : '';
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(reference))
    return { error: msg(language, 'We could not confirm your report was saved. Refresh your reports and try again.', 'تعذر تأكيد حفظ البلاغ. حدّث صفحة البلاغات وحاول مرة أخرى.') };
  revalidatePath(`/${language}/reports`);
  return { reference };
}
