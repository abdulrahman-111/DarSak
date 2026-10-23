'use server';

import { revalidatePath } from 'next/cache';
import { getRequestViewer } from '@/features/platform/request-viewer';
import { idSchema, type Locale } from '@/features/student/domain';
import { cairoDateTimeToUtc, localeSchema } from '@/lib/domain';
import { checkTeachingAccess, teachingGuardMessage } from '@/features/teacher-access/guard';
import { assignmentInputSchema, reviewInputSchema, submissionInputSchema } from './domain';

export type AssignmentActionState = {
  error?: string;
  success?: string;
  version?: number;
  assignmentId?: string;
  values?: Record<string, string>;
} | null;

const copy = (locale: Locale, en: string, ar: string) => (locale === 'ar' ? ar : en);

async function actor(locale: Locale, role: 'student' | 'teacher') {
  const { db, user, profile } = await getRequestViewer();
  if (!user || !profile || profile.status !== 'active' || profile.role !== role)
    return {
      error: copy(
        locale,
        `An active ${role} account is required.`,
        role === 'student' ? 'يلزم حساب طالب نشط.' : 'يلزم حساب معلم نشط.',
      ),
    } as const;
  if (role === 'teacher') {
    const [teacher, access] = await Promise.all([
      db.from('teacher_profiles').select('approved').eq('id', user.id).maybeSingle(),
      checkTeachingAccess(db),
    ]);
    if (teacher.error || teacher.data?.approved !== true)
      return {
        error: copy(
          locale,
          'An active approved teacher account is required.',
          'يلزم حساب معلم نشط ومعتمد.',
        ),
      } as const;
    if (!access.allowed) return { error: teachingGuardMessage(locale, access.reason) } as const;
  }
  return { db, user } as const;
}

function invalid(locale: Locale) {
  return copy(
    locale,
    'Check the highlighted fields and try again.',
    'تحقق من الحقول وحاول مرة أخرى.',
  );
}

function savedFormValues(form: FormData, fields: Record<string, number>) {
  return Object.fromEntries(
    Object.entries(fields).map(([name, max]) => {
      const value = form.get(name);
      return [name, typeof value === 'string' ? value.slice(0, max) : ''];
    }),
  );
}

function writeError(locale: Locale, error: { code?: string; message?: string } | null | undefined) {
  const raw = (error?.message ?? '').toLowerCase();
  if (
    error?.code === '40001' ||
    raw.includes('version conflict') ||
    raw.includes('revision conflict')
  )
    return copy(
      locale,
      'This changed in another tab. Refresh and review the latest version before saving.',
      'تغيرت البيانات في نافذة أخرى. حدّث الصفحة وراجع أحدث نسخة قبل الحفظ.',
    );
  if (
    error?.code === '42501' ||
    raw.includes('not authorized') ||
    raw.includes('not eligible') ||
    raw.includes('active accepted')
  )
    return copy(
      locale,
      'You are no longer eligible to make this change.',
      'لم تعد مؤهلاً لإجراء هذا التغيير.',
    );
  return copy(
    locale,
    'Could not save this change. Refresh the page and try again.',
    'تعذر حفظ التغيير. حدّث الصفحة وحاول مرة أخرى.',
  );
}

function revalidateAssignmentViews() {
  for (const lang of ['en', 'ar'] as const) {
    revalidatePath(`/${lang}/student/classes`);
    revalidatePath(`/${lang}/student/classes/[id]`, 'page');
    revalidatePath(`/${lang}/teacher/groups`);
    revalidatePath(`/${lang}/teacher/groups/[id]`, 'page');
    revalidatePath(`/${lang}/teacher/groups/[id]/assignments`, 'page');
    revalidatePath(`/${lang}/teacher/groups/[id]/assignments/[assignmentId]`, 'page');
  }
}

export async function saveGroupAssignmentAction(
  locale: string,
  groupId: string,
  _state: AssignmentActionState,
  form: FormData,
): Promise<AssignmentActionState> {
  if (!localeSchema.safeParse(locale).success) return { error: 'Invalid locale.' };
  const lang = locale as Locale;
  const values = savedFormValues(form, {
    title: 160,
    instructions: 5000,
    resource_url: 2048,
    due_local: 32,
    assignment_id: 36,
    version: 16,
  });
  if (!idSchema.safeParse(groupId).success) return { error: invalid(lang), values };
  const parsed = assignmentInputSchema.safeParse({
    title: form.get('title'),
    instructions: form.get('instructions'),
    resourceUrl: form.get('resource_url') ?? '',
    dueAt: form.get('due_local') ?? '',
    assignmentId: form.get('assignment_id') ?? '',
    expectedVersion: form.get('version') ?? undefined,
  });
  const version = form.get('version');
  const versionNumber = version == null || version === '' ? null : Number(version);
  if (
    !parsed.success ||
    (parsed.data.assignmentId && !idSchema.safeParse(parsed.data.assignmentId).success) ||
    (versionNumber !== null && (!Number.isSafeInteger(versionNumber) || versionNumber < 1)) ||
    (!parsed.data.assignmentId && versionNumber !== null) ||
    (parsed.data.assignmentId && versionNumber === null)
  )
    return { error: invalid(lang), values };
  const me = await actor(lang, 'teacher');
  if ('error' in me) return { error: me.error, values };
  let dueAt: string | null = null;
  try {
    if (parsed.data.dueAt) dueAt = cairoDateTimeToUtc(parsed.data.dueAt);
  } catch {
    return {
      error: copy(
        lang,
        'Choose a valid Cairo deadline.',
        'اختر موعداً نهائياً صالحاً بتوقيت القاهرة.',
      ),
      values,
    };
  }
  const result = await me.db.rpc('save_group_assignment', {
    p_group_id: groupId,
    p_title: parsed.data.title,
    p_instructions: parsed.data.instructions,
    p_resource_url: parsed.data.resourceUrl || null,
    p_due_at: dueAt,
    p_assignment_id: parsed.data.assignmentId || null,
    p_expected_version: versionNumber,
  });
  if (result.error) return { error: writeError(lang, result.error), values };
  if (!idSchema.safeParse(result.data).success)
    return { error: writeError(lang, { message: 'Invalid response' }), values };
  revalidateAssignmentViews();
  return {
    success: copy(lang, 'Assignment saved.', 'تم حفظ الواجب.'),
    assignmentId: result.data,
    version: versionNumber === null ? 1 : versionNumber + 1,
  };
}

export async function archiveGroupAssignmentAction(
  locale: string,
  assignmentId: string,
  _state: AssignmentActionState,
  form: FormData,
): Promise<AssignmentActionState> {
  if (!localeSchema.safeParse(locale).success) return { error: 'Invalid locale.' };
  const lang = locale as Locale;
  const values = savedFormValues(form, { version: 16 });
  const version = Number(form.get('version'));
  if (!idSchema.safeParse(assignmentId).success || !Number.isSafeInteger(version) || version < 1)
    return { error: invalid(lang), values };
  const me = await actor(lang, 'teacher');
  if ('error' in me) return { error: me.error, values };
  const result = await me.db.rpc('archive_group_assignment', {
    p_assignment_id: assignmentId,
    p_expected_version: version,
  });
  if (result.error) return { error: writeError(lang, result.error), values };
  revalidateAssignmentViews();
  return {
    success: copy(
      lang,
      'Assignment archived. Existing submissions and feedback were kept.',
      'تمت أرشفة الواجب مع الاحتفاظ بالتسليمات والتعليقات.',
    ),
  };
}

export async function submitAssignmentLinkAction(
  locale: string,
  assignmentId: string,
  _state: AssignmentActionState,
  form: FormData,
): Promise<AssignmentActionState> {
  if (!localeSchema.safeParse(locale).success) return { error: 'Invalid locale.' };
  const lang = locale as Locale;
  const values = savedFormValues(form, { url: 2048, student_note: 2000, revision: 16 });
  if (!idSchema.safeParse(assignmentId).success) return { error: invalid(lang), values };
  const parsed = submissionInputSchema.safeParse({
    url: form.get('url'),
    studentNote: form.get('student_note') ?? '',
    expectedRevision: form.get('revision') ?? undefined,
  });
  const revisionValue = form.get('revision');
  const revision = revisionValue == null || revisionValue === '' ? null : Number(revisionValue);
  if (!parsed.success || (revision !== null && (!Number.isSafeInteger(revision) || revision < 1)))
    return { error: invalid(lang), values };
  const me = await actor(lang, 'student');
  if ('error' in me) return { error: me.error, values };
  const result = await me.db.rpc('submit_assignment_link', {
    p_assignment_id: assignmentId,
    p_url: parsed.data.url,
    p_student_note: parsed.data.studentNote,
    p_expected_revision: revision,
  });
  if (result.error) return { error: writeError(lang, result.error), values };
  revalidateAssignmentViews();
  return {
    success: copy(
      lang,
      'Link submitted. Your teacher can see it.',
      'تم إرسال الرابط. يمكن لمعلمك الاطلاع عليه.',
    ),
  };
}

export async function reviewAssignmentSubmissionAction(
  locale: string,
  submissionId: string,
  _state: AssignmentActionState,
  form: FormData,
): Promise<AssignmentActionState> {
  if (!localeSchema.safeParse(locale).success) return { error: 'Invalid locale.' };
  const lang = locale as Locale;
  const values = savedFormValues(form, { teacher_feedback: 3000, revision: 16 });
  if (!idSchema.safeParse(submissionId).success) return { error: invalid(lang), values };
  const parsed = reviewInputSchema.safeParse({
    feedback: form.get('teacher_feedback') ?? '',
    expectedRevision: form.get('revision'),
  });
  if (!parsed.success) return { error: invalid(lang), values };
  const me = await actor(lang, 'teacher');
  if ('error' in me) return { error: me.error, values };
  const result = await me.db.rpc('review_assignment_submission', {
    p_submission_id: submissionId,
    p_feedback: parsed.data.feedback,
    p_expected_revision: Number(parsed.data.expectedRevision),
  });
  if (result.error) return { error: writeError(lang, result.error), values };
  revalidateAssignmentViews();
  return {
    success: parsed.data.feedback
      ? copy(lang, 'Feedback saved.', 'تم حفظ التعليق.')
      : copy(lang, 'Feedback cleared.', 'تم مسح التعليق.'),
  };
}
