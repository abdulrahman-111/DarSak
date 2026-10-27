'use client';

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
        <p role="alert" className="mt-3 text-sm text-danger">
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
