'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { canAssignPlan, parsePlanAssignmentInput, parseTeacherPlanStatus } from './domain';

export type PlanActionState = { error?: string; success?: string } | null;
const copy = (locale: string) =>
  locale === 'ar'
    ? {
        denied: 'يلزم حساب مسؤول نشط.',
        invalid: 'بيانات التعيين غير صالحة. حدّث الصفحة وحاول مرة أخرى.',
        disabled: 'تعيين الخطط متوقف حتى تفعيل السياسة وبدء سريانها.',
        stale: 'تغيرت حالة الخطة. حدّث الصفحة وحاول مرة أخرى.',
        switch: 'لا يمكن تغيير الخطة النشطة قبل انتهاء فترتها الحالية.',
        failed: 'تعذر حفظ تعيين الخطة. تحقق من سجل التحويل البنكي ثم حاول مرة أخرى.',
        success: 'تم حفظ تعيين الخطة.',
      }
    : {
        denied: 'An active administrator account is required.',
        invalid: 'Assignment details are invalid. Refresh and try again.',
        disabled: 'Plan assignment is unavailable until policy is enabled and effective.',
        stale: 'The plan status changed. Refresh and try again.',
        switch: 'An active plan cannot be changed before its current period expires.',
        failed: 'The plan assignment could not be saved. Check the bank ledger and try again.',
        success: 'Plan assignment saved.',
      };

export async function assignTeacherPlan(
  locale: string,
  teacherId: string,
  _previous: PlanActionState,
  form: FormData,
): Promise<PlanActionState> {
  const language = locale === 'ar' ? 'ar' : 'en';
  const t = copy(language);
  if (
    !['en', 'ar'].includes(locale) ||
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(teacherId)
  )
    return { error: t.invalid };
  const input = parsePlanAssignmentInput({
    plan: form.get('plan_code'),
    version: form.get('expected_version'),
    reference: form.get('transaction_reference'),
    bankChecked: form.get('bank_ledger_verified'),
  });
  if (!input) return { error: t.invalid };
  const db = await createClient();
  const {
    data: { user },
  } = await db.auth.getUser();
  if (!user) return { error: t.denied };
  const { data: actor, error: actorError } = await db
    .from('profiles')
    .select('role,status')
    .eq('id', user.id)
    .maybeSingle();
  if (actorError || actor?.role !== 'admin' || actor.status !== 'active')
    return { error: t.denied };
  const { data: statusData, error: statusError } = await db.rpc('admin_teacher_plan_status', {
    p_teacher_id: teacherId,
  });
  const status = statusError ? null : parseTeacherPlanStatus(statusData);
  if (!status) return { error: t.failed };
  if (!canAssignPlan(status)) return { error: t.disabled };
  const { error } = await db.rpc('admin_assign_teacher_plan', {
    p_teacher_id: teacherId,
    p_plan_code: input.plan,
    p_expected_version: input.version,
    p_transaction_reference: input.reference,
  });
  if (error) {
    if (error.message.includes('cannot change plans before the current plan expires'))
      return { error: t.switch };
    return { error: error.code === 'PT409' || error.code === '40001' ? t.stale : t.failed };
  }
  for (const current of ['en', 'ar']) revalidatePath(`/${current}/admin/teachers/${teacherId}`);
  return { success: t.success };
}
