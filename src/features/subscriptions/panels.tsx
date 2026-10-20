'use client';

import { useActionState } from 'react';
import { assignTeacherPlan, type PlanActionState } from './actions';
import { canAssignPlan, type TeacherPlanStatus } from './domain';
import { TEACHER_PLANS } from './plans';

const when = (value: string | null, locale: string) =>
  value
    ? new Intl.DateTimeFormat(locale === 'ar' ? 'ar-EG' : 'en-GB', {
        dateStyle: 'medium',
        timeStyle: 'short',
        timeZone: 'Africa/Cairo',
      }).format(new Date(value))
    : '—';
const bytes = (value: number, locale: string) =>
  `${(value / (1024 * 1024)).toLocaleString(locale === 'ar' ? 'ar-EG' : 'en-GB', { maximumFractionDigits: 1 })} MiB`;
const planText = (code: string, ar: boolean) =>
  code === 'standard'
    ? ar
      ? 'قياسية'
      : 'Standard'
    : code === 'pro'
      ? ar
        ? 'احترافية'
        : 'Pro'
      : ar
        ? 'مجانية'
        : 'Free';
const limits = (plan: 'standard' | 'pro' | 'free', ar: boolean) => {
  if (plan === 'free') return ar ? 'لا توجد حصص مدفوعة مفعلة حالياً' : 'No paid quotas are active';
  const caps = TEACHER_PLANS[plan];
  return ar
    ? `${caps.activeGroups} مجموعات · ${caps.storedFiles} ملف · ${bytes(caps.storageBytes, 'ar')} إجمالي · ${bytes(caps.maxFileBytes, 'ar')}/ملف`
    : `${caps.activeGroups} groups · ${caps.storedFiles} files · ${bytes(caps.storageBytes, 'en')} total · ${bytes(caps.maxFileBytes, 'en')}/file`;
};

export function TeacherPlanPanel({
  locale,
  status,
  error,
}: {
  locale: string;
  status: TeacherPlanStatus | null;
  error: boolean;
}) {
  const ar = locale === 'ar';
  if (error || !status)
    return (
      <section className="rounded-2xl border border-line bg-white p-5 shadow-sm">
        <h2 className="text-xl font-black text-teal">
          {ar ? 'الخطة والاستخدام' : 'Teaching plan and usage'}
        </h2>
        <p role="alert" className="mt-3 text-sm text-red-800">
          {ar
            ? 'تعذر تحميل حالة الخطة والاستخدام. حدّث الصفحة وحاول مرة أخرى.'
            : 'Could not load plan and usage. Refresh and try again.'}
        </p>
      </section>
    );
  const freePhase = !canAssignPlan(status);
  const activePlan = status.plan_active ? status.plan_code : 'free';
  return (
    <section className="rounded-2xl border border-line bg-white p-5 shadow-sm">
      <h2 className="text-xl font-black text-teal">
        {ar ? 'الخطة والاستخدام' : 'Teaching plan and usage'}
      </h2>
      {freePhase && (
        <p className="mt-2 text-sm text-muted">
          {ar
            ? 'لا تُحصّل رسوم حالياً؛ تبقى الخطط المدفوعة متوقفة حتى تفعيل السياسة وبدء سريانها.'
            : 'No charges are collected now. Paid plans remain off until policy is enabled and takes effect.'}
        </p>
      )}
      <dl className="mt-4 grid gap-4 sm:grid-cols-2">
        <div>
          <dt className="text-sm text-muted">{ar ? 'الخطة الحالية' : 'Current plan'}</dt>
          <dd className="mt-1 font-bold">
            {status.plan_active
              ? planText(activePlan, ar)
              : freePhase
                ? planText('free', ar)
                : ar
                  ? 'لا توجد خطة نشطة'
                  : 'No active plan'}
            {status.plan_active && (
              <span className="text-muted"> · {when(status.expires_at, locale)}</span>
            )}
          </dd>
        </div>
        <div>
          <dt className="text-sm text-muted">{ar ? 'الاستخدام الحالي' : 'Current usage'}</dt>
          <dd className="mt-1 font-bold">
            {ar
              ? `${status.active_groups} مجموعات · ${status.stored_files} ملفات · ${bytes(status.stored_bytes, locale)}`
              : `${status.active_groups} groups · ${status.stored_files} files · ${bytes(status.stored_bytes, locale)}`}
          </dd>
        </div>
        {status.plan_active && (
          <div className="sm:col-span-2">
            <dt className="text-sm text-muted">{ar ? 'حدود الخطة' : 'Plan limits'}</dt>
            <dd className="mt-1 font-semibold">{limits(status.plan_code, ar)}</dd>
          </div>
        )}
      </dl>
      {freePhase && (
        <p className="mt-4 text-sm text-muted">
          {ar
            ? 'المنصة مجانية حتى الفصل الدراسي القادم. سنعلن عن الخطط المدفوعة قبل بدء تطبيقها.'
            : 'The platform is free until next semester. Paid plans will be announced before they begin.'}
        </p>
      )}
    </section>
  );
}

function AssignmentForm({
  locale,
  teacherId,
  status,
}: {
  locale: string;
  teacherId: string;
  status: TeacherPlanStatus;
}) {
  const ar = locale === 'ar';
  const action = assignTeacherPlan.bind(null, locale, teacherId);
  const [state, formAction, pending] = useActionState<PlanActionState, FormData>(action, null);
  const enabled = canAssignPlan(status);
  return (
    <form action={formAction} className="mt-5 grid gap-3 border-t border-line pt-5">
      <h3 className="font-black text-teal">{ar ? 'تعيين خطة يدوياً' : 'Assign a plan manually'}</h3>
      <input type="hidden" name="expected_version" value={status.updated_version} />
      <label className="grid gap-1 text-sm font-bold">
        {ar ? 'الخطة' : 'Plan'}
        <select
          name="plan_code"
          disabled={!enabled || pending}
          defaultValue="standard"
          className="min-h-11 rounded-xl border border-line bg-white px-3"
        >
          <option value="standard">
            {ar
              ? `قياسية — ${TEACHER_PLANS.standard.monthlyEgp} جنيه شهرياً`
              : `Standard — EGP ${TEACHER_PLANS.standard.monthlyEgp}/month`}
          </option>
          <option value="pro">
            {ar
              ? `احترافية — ${TEACHER_PLANS.pro.monthlyEgp} جنيه شهرياً`
              : `Pro — EGP ${TEACHER_PLANS.pro.monthlyEgp}/month`}
          </option>
        </select>
      </label>
      <label className="grid gap-1 text-sm font-bold">
        {ar ? 'مرجع التحويل البنكي الفريد' : 'Unique bank transfer reference'}
        <input
          name="transaction_reference"
          disabled={!enabled || pending}
          required
          minLength={4}
          maxLength={120}
          className="min-h-11 rounded-xl border border-line px-3"
        />
      </label>
      <label className="flex items-start gap-3 text-sm">
        <input
          type="checkbox"
          name="bank_ledger_verified"
          required
          disabled={!enabled || pending}
          className="mt-1 size-4"
        />
        <span>
          {ar
            ? 'تحققت بنفسي من استلام المبلغ والمرجع في كشف الحساب البنكي. صورة الشاشة أو رسالة واتساب ليست إثباتاً.'
            : 'I personally verified the received amount and reference in the bank ledger. A screenshot or WhatsApp claim is not proof.'}
        </span>
      </label>
      {!enabled && (
        <p className="text-sm text-muted">
          {ar
            ? 'التعيين متوقف حتى تفعيل سياسة الحصص وبدء سريانها.'
            : 'Assignment stays disabled until quota policy is enabled and effective.'}
        </p>
      )}
      {state?.error && (
        <p role="alert" className="text-sm font-semibold text-red-800">
          {state.error}
        </p>
      )}
      {state?.success && (
        <p role="status" className="text-sm font-semibold text-teal">
          {state.success}
        </p>
      )}
      <button
        type="submit"
        disabled={!enabled || pending}
        className="min-h-11 rounded-xl bg-teal px-4 py-2 font-bold text-white disabled:opacity-50"
      >
        {pending ? (ar ? 'جارٍ الحفظ…' : 'Saving…') : ar ? 'حفظ التعيين' : 'Save assignment'}
      </button>
    </form>
  );
}

export function AdminTeacherPlanPanel({
  locale,
  teacherId,
  status,
  error,
}: {
  locale: string;
  teacherId: string;
  status: TeacherPlanStatus | null;
  error: boolean;
}) {
  const ar = locale === 'ar';
  return (
    <section className="rounded-2xl border border-line bg-white p-5 shadow-sm">
      <h2 className="text-xl font-black text-teal">{ar ? 'الخطة والاستخدام' : 'Plan and usage'}</h2>
      {error || !status ? (
        <p role="alert" className="mt-3 text-sm text-red-800">
          {ar
            ? 'تعذر تحميل بيانات الخطة. حدّث الصفحة وحاول مرة أخرى.'
            : 'Could not load plan details. Refresh and try again.'}
        </p>
      ) : (
        <>
          <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-2">
            <div>
              <dt className="text-muted">{ar ? 'الخطة' : 'Plan'}</dt>
              <dd className="mt-1 font-bold">
                {status.plan_active
                  ? planText(status.plan_code, ar)
                  : !canAssignPlan(status)
                    ? planText('free', ar)
                    : ar
                      ? 'لا توجد خطة نشطة'
                      : 'No active plan'}
              </dd>
            </div>
            <div>
              <dt className="text-muted">{ar ? 'الفترة' : 'Period'}</dt>
              <dd className="mt-1 font-bold">
                {status.plan_active
                  ? `${when(status.starts_at, locale)} – ${when(status.expires_at, locale)}`
                  : '—'}
              </dd>
            </div>
            <div>
              <dt className="text-muted">{ar ? 'الاستخدام' : 'Usage'}</dt>
              <dd className="mt-1 font-bold">
                {ar
                  ? `${status.active_groups} مجموعات · ${status.stored_files} ملفات · ${bytes(status.stored_bytes, locale)}`
                  : `${status.active_groups} groups · ${status.stored_files} files · ${bytes(status.stored_bytes, locale)}`}
              </dd>
            </div>
            {status.plan_active && (
              <div>
                <dt className="text-muted">{ar ? 'الحدود' : 'Limits'}</dt>
                <dd className="mt-1 font-bold">{limits(status.plan_code, ar)}</dd>
              </div>
            )}
          </dl>
          <AssignmentForm locale={locale} teacherId={teacherId} status={status} />
        </>
      )}
    </section>
  );
}
