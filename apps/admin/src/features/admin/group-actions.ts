'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { getAdminActor } from '@admin/lib/access';

export type GroupActionState = { error?: string; success?: string } | null;
const copy = (locale: string, en: string, ar: string) => (locale === 'ar' ? ar : en);
const groupIdSchema = z.string().uuid();

async function mutateGroup(locale: string, groupId: string, operation: 'archive' | 'delete') {
  const actor = await getAdminActor();
  if (!actor)
    return {
      error: copy(
        locale,
        'An active administrator account with two-step verification is required. Sign in again.',
        'يلزم حساب مسؤول نشط مع التحقق بخطوتين. سجّل الدخول مرة أخرى.',
      ),
    };
  if (!groupIdSchema.safeParse(groupId).success)
    return {
      error: copy(
        locale,
        'Invalid group. Refresh and try again.',
        'المجموعة غير صالحة. حدّث الصفحة وحاول مرة أخرى.',
      ),
    };
  const { error } = await actor.db.rpc(
    operation === 'archive' ? 'cancel_teacher_group' : 'delete_unused_teacher_group',
    { p_group_id: groupId },
  );
  if (error) {
    const message = error.message.toLowerCase();
    const translated = message.includes('enrollment history')
      ? copy(
          locale,
          'This group has enrollment history and cannot be deleted.',
          'للمجموعة سجل طلبات أو عضويات ولا يمكن حذفها.',
        )
      : message.includes('lesson history')
        ? copy(
            locale,
            'This group has lessons and cannot be deleted.',
            'للمجموعة حصص ولا يمكن حذفها.',
          )
        : message.includes('published')
          ? copy(
              locale,
              'Cancel the published group before deleting it.',
              'ألغِ المجموعة المنشورة قبل حذفها.',
            )
          : copy(
              locale,
              'The change could not be saved. Refresh and try again.',
              'تعذر حفظ التغيير. حدّث الصفحة وحاول مرة أخرى.',
            );
    return { error: translated };
  }
  for (const language of ['en', 'ar']) revalidatePath(`/${language}/admin/groups`);
  revalidatePath(`/${locale}/admin`);
  return {
    success:
      operation === 'archive'
        ? copy(
            locale,
            'Group archived. Future lessons were cancelled and history was kept.',
            'تمت أرشفة المجموعة وإلغاء الحصص القادمة مع الاحتفاظ بالسجل.',
          )
        : copy(locale, 'Unused group deleted.', 'تم حذف المجموعة غير المستخدمة.'),
  };
}

export async function archiveAdminGroup(
  locale: string,
  groupId: string,
  _state: GroupActionState,
  _form: FormData,
): Promise<GroupActionState> {
  return mutateGroup(locale, groupId, 'archive');
}

export async function deleteUnusedAdminGroup(
  locale: string,
  groupId: string,
  _state: GroupActionState,
  _form: FormData,
): Promise<GroupActionState> {
  return mutateGroup(locale, groupId, 'delete');
}
