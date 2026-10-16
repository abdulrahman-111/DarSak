'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { createClient } from '@/lib/supabase/server';
import { parseTeacherApplicationReadResponse } from '@/features/teacher/application-domain';

export type ApplicationActionState = { error?: string; success?: string; url?: string } | null;

const copy = (locale: string) => locale === 'ar'
  ? {
      denied: 'يلزم حساب مسؤول نشط.', invalid: 'تحقق من سبب طلب التعديل ثم حاول مجددًا.',
      failed: 'تعذر حفظ طلب التعديل. حدّث الصفحة وحاول مرة أخرى.', stale: 'تغير الطلب. حدّث الصفحة لمراجعة أحدث حالة.',
      requested: 'تم طلب تحديث الطلب.', download: 'تعذر تجهيز تنزيل السيرة الذاتية. حدّث الصفحة وحاول مرة أخرى.',
    }
  : {
      denied: 'An active administrator account is required.', invalid: 'Check the requested changes and try again.',
      failed: 'The change request could not be saved. Refresh and try again.', stale: 'The application changed. Refresh to review its current status.',
      requested: 'Changes requested from the teacher.', download: 'The CV download could not be prepared. Refresh and try again.',
    };

async function activeAdmin(db: Awaited<ReturnType<typeof createClient>>) {
  const { data: { user } } = await db.auth.getUser();
  if (!user) return false;
  const { data: actor, error } = await db.from('profiles').select('role,status').eq('id', user.id).maybeSingle();
  return !error && actor?.role === 'admin' && actor.status === 'active';
}

export async function requestTeacherApplicationChanges(
  locale: string,
  _previous: ApplicationActionState,
  form: FormData,
): Promise<ApplicationActionState> {
  const language = locale === 'ar' ? 'ar' : 'en';
  const t = copy(language);
  const parsed = z.object({
    teacher_id: z.string().uuid(),
    expected_request_id: z.string().uuid(),
    reason: z.string().trim().min(1).max(1000),
  }).safeParse({
    teacher_id: String(form.get('teacher_id') || ''),
    expected_request_id: String(form.get('expected_request_id') || ''),
    reason: String(form.get('reason') || ''),
  });
  if (!parsed.success) return { error: t.invalid };

  const db = await createClient();
  if (!(await activeAdmin(db))) return { error: t.denied };
  const { error } = await db.rpc('request_teacher_application_changes', {
    p_teacher_id: parsed.data.teacher_id,
    p_expected_request_id: parsed.data.expected_request_id,
    p_reason: parsed.data.reason,
  });
  if (error) {
    const message = error.message.toLowerCase();
    const staleCode = error.code === 'PT409' || error.code === '40001';
    return { error: staleCode || message.includes('stale') || message.includes('serialization') || message.includes('40001') || message.includes('not pending') ? t.stale : t.failed };
  }
  for (const current of ['en', 'ar']) revalidatePath(`/${current}/admin/teachers/${parsed.data.teacher_id}`);
  return { success: t.requested };
}

export async function createTeacherApplicationCvLink(
  locale: string,
  _previous: ApplicationActionState,
  form: FormData,
): Promise<ApplicationActionState> {
  const language = locale === 'ar' ? 'ar' : 'en';
  const t = copy(language);
  const teacherId = z.string().uuid().safeParse(String(form.get('teacher_id') || ''));
  if (!teacherId.success) return { error: t.download };

  const db = await createClient();
  if (!(await activeAdmin(db))) return { error: t.denied };
  const { data, error } = await db.rpc('read_teacher_application', { p_teacher_id: teacherId.data });
  if (error) return { error: t.download };
  const response = parseTeacherApplicationReadResponse(data);
  const application = response.application;
  const path = application?.snapshot?.cv_path;
  if (application?.status !== 'submitted' || typeof path !== 'string'
      || !path.startsWith(`${teacherId.data}/`) || !path.toLowerCase().endsWith('.pdf')) {
    return { error: t.download };
  }
  const { data: signed, error: signingError } = await db.storage.from('teacher-applications').createSignedUrl(path, 60, { download: true });
  if (signingError || !signed?.signedUrl) return { error: t.download };
  return { url: signed.signedUrl };
}
