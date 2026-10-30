import Link from 'next/link';
import { ensureLocale } from '@/i18n/config';
import { requireViewer } from '@admin/lib/access';
import { EmptyState, Panel, ScreenTitle } from '@/components/platform/ui';
import { Chip, Disclosure, Pager, secondaryButtonClass } from '@admin/components/ui';
import { retryEmailJob } from '@admin/features/email/admin-actions';

type EmailRow = {
  id: string;
  kind: string;
  state: string;
  attempts: number;
  created_at: string;
  sent_at: string | null;
  next_attempt_at: string | null;
  safe_error_code: string | null;
  recipient_label: string;
};
const kinds: Record<string, [string, string]> = {
  teacher_review_requested: ['Teacher review request', 'طلب مراجعة معلم'],
  teacher_review_approved: ['Teacher review approved', 'تم اعتماد المعلم'],
  teacher_review_declined: ['Teacher review declined', 'تم رفض المعلم'],
  enrollment_requested: ['Enrollment request', 'طلب انضمام'],
  teacher_renewal: ['Teaching access renewal', 'تجديد صلاحية التدريس'],
  teacher_fee_announcement: ['Access policy notice', 'إشعار سياسة الصلاحية'],
};
const states: Record<string, [string, string]> = {
  queued: ['Queued', 'بانتظار الإرسال'],
  sending: ['Sending', 'جارٍ الإرسال'],
  sent: ['SMTP accepted', 'قبله خادم البريد'],
  failed: ['Failed', 'فشل'],
  skipped: ['Skipped', 'تم التخطي'],
};
const errors: Record<string, [string, string]> = {
  smtp_transient: ['Temporary SMTP error', 'خطأ مؤقت في البريد'],
  smtp_permanent: ['Permanent SMTP rejection', 'رفض دائم من البريد'],
  connection_timeout: ['Connection timed out', 'انتهت مهلة الاتصال'],
  connection_error: ['Connection error', 'خطأ في الاتصال'],
  invalid_recipient: ['Invalid recipient', 'عنوان مستلم غير صالح'],
  recipient_unavailable: ['Recipient unavailable', 'المستلم غير متاح'],
  max_attempts: ['Retry limit reached', 'تم بلوغ حد المحاولات'],
};
function when(value: string | null, locale: string) {
  return value
    ? new Intl.DateTimeFormat(locale === 'ar' ? 'ar-EG' : 'en-GB', {
        dateStyle: 'medium',
        timeStyle: 'short',
        timeZone: 'Africa/Cairo',
      }).format(new Date(value))
    : '—';
}
function label(map: Record<string, [string, string]>, key: string, ar: boolean) {
  return map[key]?.[ar ? 1 : 0] ?? (ar ? 'غير معروف' : 'Unknown');
}

export default async function AdminEmailPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const [{ locale: raw }, query] = await Promise.all([params, searchParams]);
  const locale = ensureLocale(raw),
    ar = locale === 'ar',
    me = await requireViewer(locale, 'admin');
  const pageRaw = Array.isArray(query.page) ? query.page[0] : query.page;
  let page = Math.max(1, Math.min(50000, Number.parseInt(pageRaw ?? '1', 10) || 1)),
    offset = (page - 1) * 20;
  let { data, error } = await me.db.rpc('admin_email_page', { p_offset: offset, p_limit: 20 });
  const payload =
    data && typeof data === 'object'
      ? (data as { rows?: unknown; total?: unknown; summary?: unknown })
      : null;
  const total = typeof payload?.total === 'number' ? payload.total : 0;
  const lastPage = Math.max(1, Math.ceil(total / 20));
  if (!error && page > lastPage) {
    page = lastPage;
    offset = (page - 1) * 20;
    ({ data, error } = await me.db.rpc('admin_email_page', { p_offset: offset, p_limit: 20 }));
  }
  const corrected =
    data && typeof data === 'object' ? (data as { rows?: unknown; summary?: unknown }) : null;
  const visibleRows = Array.isArray(corrected?.rows) ? (corrected.rows as EmailRow[]) : [];
  const summary =
    corrected?.summary && typeof corrected.summary === 'object'
      ? (corrected.summary as Record<string, unknown>)
      : {};
  const result = typeof query.result === 'string' ? query.result : '';
  const count = (key: string) => Number(summary[key] ?? 0) || 0;
  const oldest =
    typeof summary.oldest_queued_at === 'string' ? when(summary.oldest_queued_at, locale) : '—';
  return (
    <>
      <ScreenTitle
        eyebrow={ar ? 'التشغيل' : 'Operations'}
        title={ar ? 'حالة البريد' : 'Email delivery'}
        description={
          ar
            ? 'سجل محدود لحالة التسليم وإدارة المحاولات الفاشلة.'
            : 'A limited delivery status log with controls for failed attempts.'
        }
        action={
          <Link href={`/${locale}/admin/email`} className={secondaryButtonClass}>
            {ar ? 'تحديث' : 'Refresh'}
          </Link>
        }
      />
      {result && (
        <Panel className="mb-5">
          <p role="status" className="text-sm font-semibold text-teal">
            {result === 'retried'
              ? ar
                ? 'أعيدت الرسالة إلى قائمة الانتظار. قد يؤدي تكرار المحاولة إلى رسالة مكررة إذا كان الإرسال السابق قد قُبل.'
                : 'The message was queued again. Retrying can create a duplicate if the earlier send was accepted.'
              : ar
                ? 'تعذر تنفيذ الإجراء. حدّث الصفحة وحاول مرة أخرى.'
                : 'The action could not be completed. Refresh and try again.'}
          </p>
        </Panel>
      )}
      <Panel className="mb-5">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h2 className="font-black text-teal">{ar ? 'ملخص قائمة الانتظار' : 'Queue summary'}</h2>
            <ul className="mt-3 flex flex-wrap gap-2">
              <li>
                <Chip tone={count('queued') ? 'warn' : 'neutral'}>
                  {ar ? 'بانتظار الإرسال' : 'Queued'} {count('queued')}
                </Chip>
              </li>
              <li>
                <Chip tone="info">
                  {ar ? 'جارٍ' : 'Sending'} {count('sending')}
                </Chip>
              </li>
              <li>
                <Chip tone="ok">
                  {ar ? 'قُبل' : 'SMTP accepted'} {count('sent')}
                </Chip>
              </li>
              <li>
                <Chip tone={count('failed') ? 'danger' : 'neutral'}>
                  {ar ? 'فشل' : 'Failed'} {count('failed')}
                </Chip>
              </li>
              <li>
                <Chip>
                  {ar ? 'متخطى' : 'Skipped'} {count('skipped')}
                </Chip>
              </li>
            </ul>
            <p className="mt-1 text-xs text-muted">
              {ar ? `أقدم رسالة بانتظار الإرسال: ${oldest}` : `Oldest queued message: ${oldest}`}
            </p>
          </div>
        </div>
        <p className="mt-4 text-xs leading-6 text-muted">
          {ar
            ? 'تعني حالة «قُبل» أن خادم SMTP قبل الرسالة، ولا تؤكد وصولها إلى صندوق الوارد. يتولى عامل الإرسال المنفصل معالجة قائمة الانتظار؛ وقد يستغرق وصول الرسائل بعض الوقت. إعادة المحاولة اليدوية قد ترسل نسخة مكررة إذا كانت نتيجة المحاولة السابقة غير مؤكدة.'
            : '“SMTP accepted” means the SMTP server accepted the message; it does not confirm inbox delivery. A separate delivery worker processes the queue, so messages may take time. A manual retry can send a duplicate when the earlier result was ambiguous.'}
        </p>
      </Panel>
      <Panel className="mb-5">
        <p className="text-sm leading-6 text-muted">
          {ar
            ? 'رسائل تأكيد الحساب وإعادة تعيين كلمة المرور تُرسل عبر إعداد SMTP الخاص بمصادقة Supabase، وهو منفصل عن إعدادات Gmail لإشعارات التطبيق في درسك.'
            : 'Account confirmation and password reset emails use Supabase Auth SMTP settings. Those settings are separate from DarSak application notification Gmail settings.'}
        </p>
      </Panel>
      {error ? (
        <Panel>
          <p role="alert" className="text-sm text-danger">
            {ar
              ? 'تعذر تحميل حالة البريد. حدّث الصفحة وحاول مرة أخرى.'
              : 'Could not load email status. Refresh and try again.'}
          </p>
        </Panel>
      ) : visibleRows.length ? (
        <div className="grid gap-3">
          {visibleRows.map(row => (
            <Disclosure
              key={row.id}
              defaultOpen={row.state === 'failed'}
              title={label(kinds, row.kind, ar)}
              meta={`${row.recipient_label} · ${when(row.created_at, locale)}`}
              chip={
                <Chip
                  tone={
                    row.state === 'failed'
                      ? 'danger'
                      : row.state === 'sent'
                        ? 'ok'
                        : row.state === 'queued' || row.state === 'sending'
                          ? 'warn'
                          : 'neutral'
                  }
                >
                  {label(states, row.state, ar)}
                </Chip>
              }
            >
              <dl className="grid gap-2 text-xs text-muted sm:grid-cols-2">
                <div>
                  <dt>{ar ? 'تاريخ الإنشاء' : 'Created'}</dt>
                  <dd>{when(row.created_at, locale)}</dd>
                </div>
                <div>
                  <dt>{ar ? 'قُبل بواسطة SMTP' : 'SMTP accepted'}</dt>
                  <dd>{when(row.sent_at, locale)}</dd>
                </div>
                <div>
                  <dt>{ar ? 'المحاولات' : 'Attempts'}</dt>
                  <dd>{row.attempts}/5</dd>
                </div>
                <div>
                  <dt>{ar ? 'المحاولة التالية' : 'Next attempt'}</dt>
                  <dd>{when(row.next_attempt_at, locale)}</dd>
                </div>
                {row.safe_error_code && (
                  <div>
                    <dt>{ar ? 'السبب' : 'Reason'}</dt>
                    <dd>{label(errors, row.safe_error_code, ar)}</dd>
                  </div>
                )}
              </dl>
              {row.state === 'failed' && (
                <form action={retryEmailJob.bind(null, locale)} className="mt-4">
                  <input type="hidden" name="id" value={row.id} />
                  <button className="min-h-11 rounded-xl border border-orange px-4 py-2 font-bold text-ink focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-orange">
                    {ar ? 'إعادة المحاولة' : 'Retry failed message'}
                  </button>
                </form>
              )}
            </Disclosure>
          ))}
        </div>
      ) : (
        <EmptyState>
          {ar ? 'لا توجد رسائل في سجل البريد.' : 'There are no email messages in the log.'}
        </EmptyState>
      )}
      <Pager
        ariaLabel={ar ? 'صفحات البريد' : 'Email pages'}
        page={page}
        pageCount={lastPage}
        total={total}
        prevHref={page > 1 ? `/${locale}/admin/email?page=${page - 1}` : null}
        nextHref={page < lastPage ? `/${locale}/admin/email?page=${page + 1}` : null}
        labels={{
          previous: ar ? 'السابق' : 'Previous',
          next: ar ? 'التالي' : 'Next',
          page: ar ? 'صفحة' : 'Page',
        }}
      />
    </>
  );
}
