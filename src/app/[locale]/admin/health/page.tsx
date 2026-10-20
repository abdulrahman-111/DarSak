import Link from 'next/link';
import { ensureLocale } from '@/i18n/config';
import { requireViewer } from '@/components/platform/access';
import { Panel, ScreenTitle } from '@/components/platform/ui';
type Health = {
  operations: { operation: string; total: number; failed: number; slow: number }[];
  inactive_setups: { role: string; stage: number; count: number }[];
  email_failures: number;
  open_reports: number;
};
export default async function Page({ params }: { params: Promise<{ locale: string }> }) {
  const { locale: raw } = await params,
    locale = ensureLocale(raw),
    ar = locale === 'ar',
    me = await requireViewer(locale, 'admin');
  const r = await me.db.rpc('admin_launch_health'),
    data = r.data as Health | null;
  if (r.error || !data)
    return (
      <Panel>
        <p role="alert">
          {ar
            ? 'تعذر تحميل حالة التشغيل. حدّث الصفحة.'
            : 'Could not load operational health. Refresh the page.'}
        </p>
      </Panel>
    );
  const names: Record<string, string> = ar
    ? {
        google_setup: 'إكمال حساب Google',
        signup: 'إنشاء الحساب بالبريد',
        verify_email: 'التحقق من البريد',
        enrollment: 'طلبات الانضمام',
        setup_save: 'حفظ الإعداد',
        setup_complete: 'إكمال الإعداد',
      }
    : {
        google_setup: 'Google account setup',
        signup: 'Email signup operations',
        verify_email: 'Email verification',
        enrollment: 'Enrollment requests',
        setup_save: 'Setup saves',
        setup_complete: 'Setup completion',
      };
  return (
    <>
      <ScreenTitle
        eyebrow={ar ? 'إدارة المنصة' : 'Platform administration'}
        title={ar ? 'حالة التشغيل' : 'Operational health'}
        description={
          ar
            ? 'مؤشرات تساعدك على اكتشاف التعثر ومتابعة إطلاق المنصة.'
            : 'Indicators to help spot problems and follow the launch.'
        }
      />
      <div className="grid gap-5">
        <Panel>
          <h2 className="text-xl font-bold text-teal">
            {ar ? 'بحاجة للمتابعة' : 'Needs attention'}
          </h2>
          <div className="mt-4 flex flex-wrap gap-5">
            <Link
              className="inline-flex min-h-11 items-center font-bold underline"
              href={`/${locale}/admin/reports`}
            >
              {ar ? 'بلاغات مفتوحة' : 'Open reports'}: {data.open_reports}
            </Link>
            <Link
              className="inline-flex min-h-11 items-center font-bold underline"
              href={`/${locale}/admin/email`}
            >
              {ar ? 'رسائل تعذر إرسالها' : 'Failed email deliveries'}: {data.email_failures}
            </Link>
          </div>
        </Panel>
        <Panel>
          <h2 className="text-xl font-bold text-teal">
            {ar ? 'عمليات آخر ٧ أيام (UTC)' : 'Operations in the last 7 UTC days'}
          </h2>
          <p className="mt-2 text-sm text-muted">
            {ar
              ? 'البطء هنا يعني أن عملية على الخادم استغرقت ثانيتين أو أكثر، وليس زمن تحميل الصفحة الكامل. تظهر العدادات بعد أول عملية مسجلة. أخطاء التحقق أو التعارض لا تعني دائمًا عطلًا.'
              : 'Slow means a server operation took at least two seconds, not the full browser page load. Counters appear after the first recorded operation. Validation and conflict errors do not always mean an outage.'}
          </p>
          {data.operations.length ? (
            <ul className="mt-4 grid gap-3">
              {data.operations.map(o => (
                <li key={o.operation} className="rounded-xl border border-line p-4">
                  <h3 className="font-bold text-teal">{names[o.operation] ?? o.operation}</h3>
                  <p className="mt-2 text-sm">
                    {ar ? 'إجمالي' : 'Total'}: {o.total} · {ar ? 'غير ناجحة' : 'Unsuccessful'}:{' '}
                    {o.failed} · {ar ? 'بطيئة' : 'Slow'}: {o.slow}
                  </p>
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-4 text-muted">
              {ar ? 'لم تُسجل عمليات بعد.' : 'No operations recorded yet.'}
            </p>
          )}
        </Panel>
        <Panel>
          <h2 className="text-xl font-bold text-teal">
            {ar
              ? 'إعدادات غير مكتملة دون تحديث منذ ٢٤ ساعة'
              : 'Incomplete setup drafts inactive for 24 hours'}
          </h2>
          <p className="mt-2 text-sm text-muted">
            {ar
              ? 'قد يكون المستخدم اختار الحفظ والعودة لاحقًا؛ لا تعني هذه الأعداد أنه ترك المنصة. لا تشمل الخطوات التي لم تُحفظ.'
              : 'Users may have chosen to save and return later; these counts do not prove abandonment. Unsaved steps are not counted.'}
          </p>
          <ul className="mt-4 grid gap-2">
            {data.inactive_setups.map(s => (
              <li key={`${s.role}-${s.stage}`}>
                {s.role === 'teacher' ? (ar ? 'معلم' : 'Teacher') : ar ? 'طالب' : 'Student'} ·{' '}
                {ar ? 'خطوة' : 'Stage'} {s.stage}: {s.count}
              </li>
            ))}
          </ul>
          {!data.inactive_setups.length && (
            <p className="mt-3 text-muted">
              {ar ? 'لا توجد مسودات غير نشطة.' : 'No inactive drafts.'}
            </p>
          )}
        </Panel>
        <p className="text-sm text-muted">
          {ar
            ? 'هذه متابعة داخلية. لا تُرسل تنبيهات خارجية تلقائية. راجع سجلات الاستضافة لتفاصيل الأعطال. لا تشمل العدادات أخطاء مزود Google قبل الرجوع إلى المنصة.'
            : 'This is in-app monitoring. Automatic external alerts are not configured. Use hosting logs to investigate operational failures. Google provider failures before the callback are outside these counters.'}
        </p>
      </div>
    </>
  );
}
