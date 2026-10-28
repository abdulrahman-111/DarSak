'use server';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { getAdminActor } from '@admin/lib/access';
import { words } from './labels';
import {
  nodeSchema,
  subjectSchema,
  offeringSchema,
  userSchema,
  teacherReviewDecisionSchema,
  validHierarchy,
  canManageUser,
  safeSetting,
  type Node,
} from './domain';
export type AdminState = {
  error?: string;
  success?: string;
  eventId?: string;
  fieldError?: string;
} | null;

const reviewCopy = (locale: string) =>
  locale === 'ar'
    ? {
        denied: 'يلزم حساب مسؤول نشط مع التحقق بخطوتين. سجّل الدخول مرة أخرى.',
        invalid: 'راجع القرار وسبب الرفض ثم حاول مجددًا.',
        stale: 'تغيرت حالة الطلب منذ فتحه. حدّث الصفحة لمراجعة أحدث حالة.',
        failed: 'تعذر حفظ القرار. حدّث الصفحة وحاول مرة أخرى.',
        approved: 'تم اعتماد طلب المعلم.',
        declined: 'تم رفض الطلب وحفظ السبب.',
        reason: 'أدخل سببًا للرفض لا يتجاوز ١٠٠٠ حرف.',
      }
    : {
        denied:
          'An active administrator account with two-step verification is required. Sign in again.',
        invalid: 'Check the decision and decline reason, then try again.',
        stale: 'This request changed after you opened it. Refresh to review the current status.',
        failed: 'The decision could not be saved. Refresh and try again.',
        approved: 'Teacher request approved.',
        declined: 'Request declined with the reason saved.',
        reason: 'Enter a decline reason of up to 1,000 characters.',
      };

export async function decideTeacherReview(
  locale: string,
  _previous: AdminState,
  form: FormData,
): Promise<AdminState> {
  const l = locale === 'ar' ? 'ar' : 'en',
    t = reviewCopy(l);
  const parsed = teacherReviewDecisionSchema.safeParse({
    teacher_id: String(form.get('teacher_id') || ''),
    expected_request_id: String(form.get('expected_request_id') || ''),
    decision: String(form.get('decision') || ''),
    reason: String(form.get('reason') || ''),
  });
  if (!parsed.success)
    return {
      error: t.invalid,
      fieldError: parsed.error.issues.some(issue => issue.path.includes('reason'))
        ? t.reason
        : undefined,
    };
  const actor = await getAdminActor();
  if (!actor) return { error: t.denied };
  const { db } = actor;
  const { data, error } = await db.rpc('admin_decide_teacher_review', {
    p_teacher_id: parsed.data.teacher_id,
    p_expected_request_id: parsed.data.expected_request_id,
    p_decision: parsed.data.decision,
    p_reason: parsed.data.decision === 'declined' ? parsed.data.reason : null,
  });
  if (error) {
    const raw = error.message.toLowerCase();
    return {
      error:
        raw.includes('stale') ||
        raw.includes('serialization') ||
        raw.includes('40001') ||
        raw.includes('not pending')
          ? t.stale
          : t.failed,
    };
  }
  const eventId = typeof data === 'string' ? data : undefined;
  for (const current of ['en', 'ar']) {
    revalidatePath(`/${current}/admin/teachers`);
    revalidatePath(`/${current}/admin/teachers/${parsed.data.teacher_id}`);
    revalidatePath(`/${current}/admin/users`);
  }
  return { success: parsed.data.decision === 'approved' ? t.approved : t.declined, eventId };
}
export async function adminAction(
  locale: string,
  operation: string,
  _state: AdminState,
  form: FormData,
): Promise<AdminState> {
  const l = locale === 'ar' ? 'ar' : 'en',
    t = words(l);
  const actor = await getAdminActor();
  if (!actor) return { error: t.denied };
  const { db, id: actorId } = actor;
  try {
    const value = (key: string) => String(form.get(key) || '');
    const id = value('id');
    let result: { error: unknown } | undefined;
    if (operation === 'user') {
      const payload = userSchema.parse({ id, status: value('status') });
      const { data: target } = await db.from('profiles').select('id,role').eq('id', id).single();
      if (!target || !canManageUser(actorId, target)) return { error: t.self };
      result = await db.rpc('admin_update_user', {
        p_user_id: payload.id,
        p_status: payload.status,
        p_approved: null,
      });
    } else if (operation === 'node') {
      const payload = nodeSchema.parse({
        ...Object.fromEntries(form),
        id: id || undefined,
        parent_id: value('parent_id') || null,
      });
      const { data: nodes, error } = await db.from('education_nodes').select('*');
      if (error) return { error: t.failed };
      if (!validHierarchy(payload as Node, (nodes || []) as Node[])) return { error: t.blocked };
      result = id
        ? await db.from('education_nodes').update(payload).eq('id', id).select('id').single()
        : await db.from('education_nodes').insert(payload).select('id').single();
    } else if (operation === 'subject') {
      const payload = subjectSchema.parse({ ...Object.fromEntries(form), id: id || undefined });
      result = id
        ? await db.from('subjects').update(payload).eq('id', id).select('id').single()
        : await db.from('subjects').insert(payload).select('id').single();
    } else if (operation === 'offering') {
      const payload = offeringSchema.parse({ ...Object.fromEntries(form), id: id || undefined });
      result = id
        ? await db.from('offerings').update(payload).eq('id', id).select('id').single()
        : await db.from('offerings').insert(payload).select('id').single();
    } else if (operation.startsWith('delete-')) {
      if (value('confirm') !== 'yes') return { error: t.invalid };
      const table = {
        'delete-node': 'education_nodes',
        'delete-subject': 'subjects',
        'delete-offering': 'offerings',
      }[operation];
      if (!table) return { error: t.invalid };
      z.uuid().parse(id);
      result = await db.from(table).delete().eq('id', id).select('id').single();
    } else if (operation === 'group') {
      z.uuid().parse(id);
      const status = z.enum(['draft', 'published', 'archived']).parse(value('status'));
      if (status === 'published') {
        const published = await db.rpc('publish_group', {
          p_group_id: id,
          p_from: null,
          p_until: null,
        });
        if (published.error) {
          const message = published.error.message.toLowerCase();
          return {
            error:
              message.includes('conflict') || message.includes('overlap')
                ? l === 'ar'
                  ? 'تعذر نشر المجموعة بسبب تعارض في الحصص.'
                  : 'The group could not be published because its schedule has lesson conflicts.'
                : t.error,
          };
        }
        result = published;
      } else if (status === 'archived') {
        result = await db.rpc('cancel_teacher_group', { p_group_id: id });
      } else {
        result = await db.rpc('admin_set_group_draft', { p_group_id: id });
      }
    } else if (operation === 'report') {
      z.uuid().parse(id);
      const status = z.enum(['open', 'resolved']).parse(value('status'));
      const admin_note = z.string().trim().max(3000).parse(value('admin_note'));
      const public_response = z.string().trim().max(3000).parse(value('public_response'));
      if (status === 'resolved' && !public_response)
        return {
          error:
            l === 'ar'
              ? 'أدخل ردًا واضحًا للمبلّغ قبل إغلاق البلاغ.'
              : 'Enter a response for the reporter before resolving the report.',
        };
      const updated = await db.rpc('admin_update_problem_report', {
        p_id: id,
        p_expected_updated_at: value('expected_updated_at'),
        p_status: status,
        p_public_response: public_response,
        p_admin_note: admin_note,
      });
      if (updated.error)
        return {
          error:
            updated.error.code === '40001'
              ? l === 'ar'
                ? 'تغير البلاغ. حدّث الصفحة قبل الحفظ.'
                : 'This report changed. Refresh before saving.'
              : t.error,
        };
      result = updated;
      for (const current of ['en', 'ar']) revalidatePath(`/${current}/reports`);
    } else if (operation === 'setting') {
      const key = z
        .string()
        .regex(/^[a-z][a-z0-9_]{1,79}$/)
        .parse(value('key'));
      const parsed = safeSetting(value('value'));
      result = await db
        .from('platform_settings')
        .upsert({ key, value: parsed })
        .select('key')
        .single();
    } else return { error: t.invalid };
    if (result?.error) return { error: t.error };
    revalidatePath(`/${l}/admin`, 'layout');
    revalidatePath(`/${l}/admin/users`);
    return { success: t.saved };
  } catch (error) {
    return {
      error: error instanceof z.ZodError || error instanceof SyntaxError ? t.invalid : t.error,
    };
  }
}
