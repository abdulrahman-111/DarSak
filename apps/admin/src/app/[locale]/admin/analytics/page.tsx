import Link from 'next/link';
import { ensureLocale } from '@/i18n/config';
import { requireAdminActor } from '@admin/lib/access';
import { Panel, ScreenTitle } from '@/components/platform/ui';
import {
  parseAnalyticsSummary,
  analyticsGroups,
  type AnalyticsMetric,
} from '@admin/features/audit/domain';

const keys = [
  'registrations_students',
  'registrations_teachers',
  'registrations_admins',
  'email_verification_rate',
  'teacher_app_submitted',
  'teacher_app_approved',
  'teacher_app_approval_rate',
  'teacher_app_median_hours',
  'published_groups',
  'enrollment_pending',
  'enrollment_accepted',
  'enrollment_acceptance_rate',
  'waitlist_size',
  'lessons_scheduled',
  'lessons_completed',
  'lessons_cancelled',
  'attendance_rate',
  'sandak_requests',
  'sandak_quota_hits',
  'sandak_errors',
  'email_outbox_queued',
  'email_outbox_failed',
  'push_delivery',
];

export default async function AnalyticsPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ days?: string | string[] }>;
}) {
  const [{ locale: raw }, query] = await Promise.all([params, searchParams]);
  const locale = ensureLocale(raw),
    ar = locale === 'ar';
  const actor = await requireAdminActor(locale);
  const validWindow = query.days === undefined || query.days === '7' || query.days === '30';
  const days: 7 | 30 = query.days === '30' ? 30 : 7;
  const result = validWindow
    ? await actor.db.rpc('admin_analytics_summary', { p_days: days })
    : { error: true, data: null };
  const summary = result.error ? null : parseAnalyticsSummary(result.data);
  const copy = ar
    ? {
        title: 'التحليلات',
        description:
          'ملخص مؤشرات تشغيلية للفترة المحددة. طلبات اعتماد المعلمين تعتمد أحدث محاولة مقدمة خلال الفترة وحالة الاعتماد الحالية؛ لا يحتفظ النظام بالمحاولات السابقة. إجمالي المجموعات المنشورة وقائمة الانتظار يعرض الحالة الحالية ولا يقتصر على الفترة المختارة. الأعداد تعكس الحالات الحالية أو مجموعات الإرسال كما توضح الحالة، ولا تمثل دائمًا انتقالات تاريخية.',
        last7: 'آخر ٧ أيام',
        last30: 'آخر ٣٠ يومًا',
        asOf: 'حتى',
        sandakNote:
          'طلبات سندك محسوبة من الأيام التقويمية UTC المكتملة للفترة (من بداية اليوم قبل عدد الأيام حتى بداية اليوم الحالي)، وتستبعد اليوم الجزئي الحالي؛ لذلك قد تختلف عن المؤشرات المحسوبة على فترة زمنية متحركة.',
        error: 'تعذر تحميل التحليلات. حدّث الصفحة وحاول مرة أخرى.',
        invalidWindow: 'اختر فترة ٧ أو ٣٠ يومًا.',
        unavailable: 'غير متاح',
        noData: 'لا توجد بيانات كافية لهذه الفترة.',
        notInstrumented: 'هذا المؤشر غير مسجل حاليًا.',
        notEnabled: 'هذه الميزة غير مفعّلة.',
        metric: 'المؤشر',
        valueStatus: 'القيمة أو الحالة',
        reason: 'السبب',
        groups: [
          'الحسابات والتحقق من البريد',
          'طلبات اعتماد المعلمين',
          'المجموعات المنشورة',
          'طلبات الانضمام',
          'قائمة الانتظار',
          'الحصص',
          'الحضور',
          'طلبات سندك (أيام UTC مكتملة)',
          'مرات بلوغ حصة سندك',
          'أخطاء سندك',
          'البريد الصادر',
          'توصيل الإشعارات',
        ],
        labels: [
          'تسجيلات الطلاب',
          'تسجيلات المعلمين',
          'تسجيلات المسؤولين',
          'معدل التحقق من البريد',
          'طلبات المعلمين المقدمة',
          'طلبات المعلمين المعتمدة',
          'معدل اعتماد الطلبات',
          'وسيط ساعات الاعتماد',
          'المجموعات المنشورة',
          'طلبات الانضمام المعلقة',
          'طلبات الانضمام المقبولة',
          'معدل قبول الانضمام',
          'قائمة الانتظار',
          'الحصص المجدولة',
          'الحصص المكتملة',
          'الحصص الملغاة',
          'معدل الحضور المسجل',
          'طلبات سندك',
          'مرات بلوغ حصة سندك',
          'أخطاء سندك',
          'رسائل البريد في قائمة الانتظار',
          'رسائل البريد الفاشلة',
          'توصيل الإشعارات الفورية',
        ],
      }
    : {
        title: 'Analytics',
        description:
          'Operational indicators for the selected window. Teacher application metrics use the latest submitted attempt in the period and its current approval state; earlier attempts are not retained. Published groups and waitlist size are current totals, independent of the selected period. Counts reflect current states or delivery batches where stated, and do not always represent historical transitions.',
        last7: 'Last 7 days',
        last30: 'Last 30 days',
        asOf: 'As of',
        sandakNote:
          'Sandak requests use completed UTC calendar days in the selected window, from midnight N days ago up to today’s midnight. The current partial day is excluded, so this can differ from metrics using a rolling timestamp window.',
        error: 'Could not load analytics. Refresh and try again.',
        invalidWindow: 'Choose a 7 or 30 day window.',
        unavailable: 'Unavailable',
        noData: 'There is not enough data for this window.',
        notInstrumented: 'This metric is not currently instrumented.',
        notEnabled: 'This feature is not enabled.',
        metric: 'Metric',
        valueStatus: 'Value or status',
        reason: 'Reason',
        groups: [
          'Accounts and email verification',
          'Teacher applications',
          'Published groups',
          'Enrollment requests',
          'Waitlist',
          'Lessons',
          'Attendance',
          'Sandak requests (complete UTC days)',
          'Sandak quota hits',
          'Sandak errors',
          'Outbound email',
          'Push delivery',
        ],
        labels: [
          'Student registrations',
          'Teacher registrations',
          'Administrator registrations',
          'Email verification rate',
          'Teacher applications submitted',
          'Teacher applications approved',
          'Application approval rate',
          'Median approval hours',
          'Published groups',
          'Pending enrollment requests',
          'Accepted enrollment requests',
          'Enrollment acceptance rate',
          'Waitlist size',
          'Lessons scheduled',
          'Lessons completed',
          'Lessons cancelled',
          'Recorded attendance rate',
          'Sandak requests',
          'Sandak quota hits',
          'Sandak errors',
          'Queued email',
          'Failed email',
          'Push delivery',
        ],
      };
  const metricMap = new Map<string, AnalyticsMetric>(
    (summary?.metrics ?? []).map(metric => [metric.key, metric]),
  );
  return (
    <>
      <ScreenTitle
        eyebrow={ar ? 'إدارة المنصة' : 'Platform administration'}
        title={copy.title}
        description={copy.description}
        action={
          <Link
            href={`/${locale}/admin/audit`}
            className="inline-flex min-h-11 items-center rounded-xl border border-line bg-white px-4 font-bold text-teal"
          >
            {ar ? 'سجل التدقيق' : 'Audit log'}
          </Link>
        }
      />
      <nav aria-label={ar ? 'الفترة' : 'Time window'} className="mb-5 flex flex-wrap gap-2">
        {(
          [
            [7, copy.last7],
            [30, copy.last30],
          ] as const
        ).map(([value, label]) => (
          <Link
            key={value}
            aria-current={days === value ? 'page' : undefined}
            className={`inline-flex min-h-11 items-center rounded-full border px-4 text-sm font-bold ${days === value ? 'border-teal bg-teal text-white' : 'border-line bg-white text-teal'}`}
            href={`/${locale}/admin/analytics?days=${value}`}
          >
            {label}
          </Link>
        ))}
      </nav>
      {!summary ? (
        <Panel>
          <p role="alert" className="text-danger">
            {validWindow ? copy.error : copy.invalidWindow}
          </p>
        </Panel>
      ) : (
        <>
          <div className="mb-4 grid gap-2 text-sm text-muted">
            <p>
              {copy.asOf} <time dateTime={summary.as_of}>{summary.as_of}</time> UTC
            </p>
            <p>{copy.sandakNote}</p>
          </div>
          <div className="grid min-w-0 gap-4 xl:grid-cols-2">
            {analyticsGroups.map((group, index) => (
              <Panel key={group.join(':')}>
                <h2 className="text-lg font-bold text-teal">{copy.groups[index]}</h2>
                <div className="mt-3 overflow-x-auto">
                  <table className="w-full min-w-[440px] text-start text-sm">
                    <thead>
                      <tr className="border-b border-line text-muted">
                        <th className="p-2 text-start">{copy.metric}</th>
                        <th className="p-2 text-start">{copy.valueStatus}</th>
                        <th className="p-2 text-start">{copy.reason}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {group.map(key => {
                        const metric = metricMap.get(key),
                          label = copy.labels[keys.indexOf(key)] ?? key;
                        const display =
                          metric?.status === 'ready' && typeof metric.value === 'number'
                            ? metric.unit === 'percent'
                              ? `${new Intl.NumberFormat(ar ? 'ar' : 'en', { maximumFractionDigits: 1 }).format(metric.value)}%`
                              : `${new Intl.NumberFormat(ar ? 'ar' : 'en', { maximumFractionDigits: 1 }).format(metric.value)}${metric.unit === 'hours' ? ' h' : ''}`
                            : copy.unavailable;
                        const reason =
                          metric?.reason === 'no_data'
                            ? copy.noData
                            : metric?.reason === 'not_instrumented'
                              ? copy.notInstrumented
                              : metric?.reason === 'not_enabled'
                                ? copy.notEnabled
                                : (metric?.reason ?? '');
                        return (
                          <tr key={key} className="border-b border-line last:border-0">
                            <th scope="row" className="p-2 text-start font-semibold">
                              {label}
                            </th>
                            <td className="p-2 whitespace-nowrap">{display}</td>
                            <td className="max-w-sm p-2 text-muted">
                              {metric?.status === 'unavailable' ? reason : ''}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </Panel>
            ))}
          </div>
        </>
      )}
    </>
  );
}
