'use server';

import { revalidatePath } from 'next/cache';
import { scheduleGoogleMeetSync } from '@/features/meet/after-sync';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { checkTeachingAccess, teachingGuardMessage } from '@/features/teacher-access/guard';
import { idSchema, type Locale } from '@/features/student/domain';
import {
  revalidateStudentWorkspace,
  revalidateTeacherWorkspace,
} from '@/features/student/workspace-revalidation';

export type ManagementActionState = { error?: string; success?: string } | null;

const copy = (locale: Locale, en: string, ar: string) => (locale === 'ar' ? ar : en);

async function activeManager(locale: Locale) {
  const db = await createClient();
  const {
    data: { user },
  } = await db.auth.getUser();
  if (!user)
    return {
      error: copy(
        locale,
        'Sign in with an active teacher or administrator account.',
        'سجل الدخول بحساب معلم أو مسؤول نشط.',
      ),
    } as const;
  const { data: actor, error } = await db
    .from('profiles')
    .select('role,status')
    .eq('id', user.id)
    .maybeSingle();
  if (error)
    return {
      error: copy(
        locale,
        'Could not verify your account. Try again.',
        'تعذر التحقق من حسابك. حاول مرة أخرى.',
      ),
    } as const;
  if (actor?.status !== 'active' || !['teacher', 'admin'].includes(actor.role)) {
    return {
      error: copy(
        locale,
        'An active teacher or administrator account is required.',
        'يلزم حساب معلم أو مسؤول نشط.',
      ),
    } as const;
  }
  if (actor.role === 'teacher') {
    const access = await checkTeachingAccess(db);
    if (!access.allowed) return { error: teachingGuardMessage(locale, access.reason) } as const;
  }
  return { db, user, role: actor.role } as const;
}

function managementError(locale: Locale, raw: string | undefined) {
  const error = (raw ?? '').toLowerCase();
  if (error === 'teacher teaching access expired') return teachingGuardMessage(locale, 'expired');
  if (error.includes('enrollment history'))
    return copy(
      locale,
      'This group has enrollment history and cannot be deleted.',
      'للمجموعة سجل طلبات أو عضويات ولا يمكن حذفها.',
    );
  if (error.includes('lesson history'))
    return copy(
      locale,
      'This group has lessons and cannot be deleted.',
      'للمجموعة حصص ولا يمكن حذفها.',
    );
  if (error.includes('published'))
    return copy(
      locale,
      'Cancel the published group before deleting it.',
      'ألغِ المجموعة المنشورة قبل حذفها.',
    );
  if (error.includes('generated') || error.includes('dated lessons'))
    return copy(
      locale,
      'Generated lessons keep their history. Cancel this lesson instead.',
      'تُحفظ الحصص المنشأة من الجدول كسجل. ألغِ الحصة بدلًا من حذفها.',
    );
  if (error.includes('materials'))
    return copy(
      locale,
      'Remove this lesson’s materials before deleting it.',
      'احذف مواد الحصة أولاً قبل حذفها.',
    );
  if (error.includes('stored lesson files'))
    return copy(
      locale,
      'Remove the stored lesson file before deleting this lesson.',
      'احذف ملف الحصة المخزن أولاً قبل حذفها.',
    );
  if (error.includes('future manual') || error.includes('completed'))
    return copy(
      locale,
      'Only future, incomplete manual lessons can be deleted. Cancel or keep this lesson instead.',
      'يمكن حذف الحصص اليدوية القادمة وغير المكتملة فقط. ألغِ هذه الحصة أو احتفظ بها.',
    );
  if (
    error.includes('active group owner') ||
    error.includes('active lesson owner') ||
    error.includes('not authorized')
  )
    return copy(
      locale,
      'You are not allowed to manage this group or lesson.',
      'لا تملك صلاحية إدارة هذه المجموعة أو الحصة.',
    );
  return copy(
    locale,
    'The change could not be saved. Refresh and try again.',
    'تعذر حفظ التغيير. حدّث الصفحة وحاول مرة أخرى.',
  );
}

function refreshManagement(locale: Locale, groupId?: string, lessonId?: string) {
  revalidateStudentWorkspace();
  revalidateTeacherWorkspace();
  for (const current of ['en', 'ar'] as const) {
    revalidatePath(`/${current}/teacher/groups`);
    revalidatePath(`/${current}/teacher`);
    revalidatePath(`/${current}/admin/groups`);
    if (groupId) revalidatePath(`/${current}/teacher/groups/${groupId}`);
    if (lessonId) revalidatePath(`/${current}/teacher/lessons/${lessonId}`);
    revalidatePath(`/${current}/teacher/lessons`);
  }
  revalidatePath(`/${locale}/admin`);
}

export async function cancelTeacherGroup(
  locale: Locale,
  groupId: string,
  _state: ManagementActionState,
  _form: FormData,
): Promise<ManagementActionState> {
  if (!idSchema.safeParse(groupId).success)
    return { error: copy(locale, 'Invalid group.', 'المجموعة غير صالحة.') };
  const me = await activeManager(locale);
  if ('error' in me) return { error: me.error };
  const { data, error } = await me.db.rpc('cancel_teacher_group', { p_group_id: groupId });
  if (error) return { error: managementError(locale, error.message) };
  scheduleGoogleMeetSync(me.db);
  refreshManagement(locale, groupId);
  const count = Number(data) || 0;
  return {
    success: count
      ? copy(
          locale,
          `Group archived. ${count} future lesson${count === 1 ? '' : 's'} cancelled; pending requests rejected.`,
          `تمت أرشفة المجموعة وإلغاء ${count} من الحصص القادمة ورفض الطلبات المعلقة.`,
        )
      : copy(
          locale,
          'Group archived and pending requests rejected. Existing history was kept.',
          'تمت أرشفة المجموعة ورفض الطلبات المعلقة مع الاحتفاظ بالسجل.',
        ),
  };
}

export async function deleteUnusedTeacherGroup(
  locale: Locale,
  groupId: string,
  _state: ManagementActionState,
  _form: FormData,
): Promise<ManagementActionState> {
  if (!idSchema.safeParse(groupId).success)
    return { error: copy(locale, 'Invalid group.', 'المجموعة غير صالحة.') };
  const me = await activeManager(locale);
  if ('error' in me) return { error: me.error };
  const { error } = await me.db.rpc('delete_unused_teacher_group', { p_group_id: groupId });
  if (error) return { error: managementError(locale, error.message) };
  refreshManagement(locale, groupId);
  redirect(
    me.role === 'admin'
      ? `/${locale}/admin/groups?deleted=1`
      : `/${locale}/teacher/groups?deleted=1`,
  );
}

export async function deleteManualTeacherLesson(
  locale: Locale,
  lessonId: string,
  groupId: string,
  _state: ManagementActionState,
  _form: FormData,
): Promise<ManagementActionState> {
  if (!idSchema.safeParse(lessonId).success || !idSchema.safeParse(groupId).success)
    return { error: copy(locale, 'Invalid lesson.', 'الحصة غير صالحة.') };
  const me = await activeManager(locale);
  if ('error' in me) return { error: me.error };
  const { error } = await me.db.rpc('delete_manual_teacher_lesson', { p_lesson_id: lessonId });
  if (error) return { error: managementError(locale, error.message) };
  scheduleGoogleMeetSync(me.db);
  refreshManagement(locale, groupId, lessonId);
  redirect(`/${locale}/teacher/lessons?deleted=1`);
}
