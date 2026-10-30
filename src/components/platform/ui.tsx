import Link from 'next/link';

// One heading scale for every workspace (student, teacher, admin) so screens feel like one product.
export function ScreenTitle({
  eyebrow,
  title,
  description,
  action,
}: {
  eyebrow?: string;
  title: string;
  description?: string;
  action?: React.ReactNode;
}) {
  return (
    <header className="mb-6 flex min-w-0 flex-wrap items-end justify-between gap-3 md:gap-4">
      <div className="min-w-0">
        {eyebrow && (
          <p className="mb-2 text-xs font-bold uppercase tracking-wider text-muted">{eyebrow}</p>
        )}
        <h1 className="wrap-break-word text-2xl font-bold tracking-tight text-teal [overflow-wrap:anywhere] sm:text-3xl">
          {title}
        </h1>
        {description && (
          <p className="mt-2 max-w-2xl wrap-break-word text-sm leading-6 text-muted [overflow-wrap:anywhere]">
            {description}
          </p>
        )}
      </div>
      {action}
    </header>
  );
}
export function Panel({
  children,
  className = '',
  id,
}: {
  children: React.ReactNode;
  className?: string;
  id?: string;
}) {
  return (
    <section
      id={id}
      className={`min-w-0 rounded-2xl border border-line bg-white p-5 shadow-xs ${className}`}
    >
      {children}
    </section>
  );
}

type MetricTone = 'default' | 'attention';
export function Metric({
  label,
  value,
  hint,
  href,
  tone = 'default',
}: {
  label: string;
  value: number | string;
  hint?: string;
  href?: string;
  tone?: MetricTone;
}) {
  const attention = tone === 'attention' && Number(value) > 0;
  const body = (
    <>
      <p className="text-sm leading-5 text-muted">{label}</p>
      <p
        className={`mt-2 text-3xl font-bold leading-none ${attention ? 'text-orange' : 'text-teal'}`}
      >
        {value}
      </p>
      {hint && <p className="mt-2 text-xs text-orange">{hint}</p>}
    </>
  );
  const frame = `block min-w-0 rounded-2xl border bg-white p-5 shadow-xs ${attention ? 'border-orange/40 ring-1 ring-orange/15' : 'border-line'}`;
  if (!href) return <section className={frame}>{body}</section>;
  return (
    <Link
      href={href}
      className={`${frame} student-card focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-orange`}
    >
      {body}
    </Link>
  );
}
export function UnavailableMetric({
  label,
  message,
  href,
  retry,
}: {
  label: string;
  message: string;
  href: string;
  retry: string;
}) {
  return (
    <Panel>
      <p className="text-sm text-muted">{label}</p>
      <p role="alert" className="mt-2 text-sm text-danger">
        {message}
      </p>
      <a
        href={href}
        className="mt-3 inline-flex min-h-11 items-center font-bold text-orange underline focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-orange"
      >
        {retry}
      </a>
    </Panel>
  );
}
export function QuickAction({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Link
      href={href}
      className="flex min-h-11 min-w-0 items-center justify-center wrap-break-word rounded-xl border border-line bg-white px-4 py-3 text-center text-sm font-bold text-teal transition-colors hover:border-orange/60 hover:text-orange focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-orange"
    >
      {children}
    </Link>
  );
}

// Empty states should explain what will appear and, where possible, offer the next step.
export function EmptyState({
  children,
  title,
  action,
}: {
  children: React.ReactNode;
  title?: string;
  action?: { href: string; label: string };
}) {
  return (
    <div className="rounded-2xl border border-dashed border-line-strong bg-surface px-5 py-8 text-center">
      {title && <p className="font-bold text-teal">{title}</p>}
      <div className={`mx-auto max-w-md text-sm leading-6 text-muted ${title ? 'mt-1' : ''}`}>
        {children}
      </div>
      {action && (
        <Link
          href={action.href}
          className="mt-4 inline-flex min-h-11 items-center justify-center rounded-xl bg-teal px-4 text-sm font-bold text-white transition-colors hover:bg-teal/90 focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-orange focus-visible:ring-offset-2"
        >
          {action.label}
        </Link>
      )}
    </div>
  );
}

// Status tones: success = done/positive, danger = refused/stopped, attention = waiting on someone, info = planned, neutral = inactive.
const statusTones = {
  success: 'bg-success-soft text-success',
  danger: 'bg-danger-soft text-danger',
  attention: 'bg-orange/10 text-[#9a4212]',
  info: 'bg-mint text-teal',
  neutral: 'bg-[#eee7da] text-ink-soft',
} as const;
const statusDots = {
  success: 'bg-success',
  danger: 'bg-danger',
  attention: 'bg-orange',
  info: 'bg-teal',
  neutral: 'bg-muted',
} as const;
export function statusTone(value: string): keyof typeof statusTones {
  if (['accepted', 'approved', 'published', 'completed', 'active', 'resolved'].includes(value))
    return 'success';
  if (['rejected', 'declined', 'removed', 'suspended'].includes(value)) return 'danger';
  if (['pending', 'requested', 'open', 'operator_sync'].includes(value)) return 'attention';
  if (value === 'scheduled') return 'info';
  return 'neutral';
}
export function Status({ value, locale }: { value: string; locale: string }) {
  const ar = locale === 'ar';
  const labels: Record<string, [string, string]> = {
    pending: ['Awaiting review', 'بانتظار المراجعة'],
    approved: ['Approved', 'معتمد'],
    declined: ['Declined', 'مرفوض'],
    requested: ['Request sent', 'تم إرسال الطلب'],
    operator_sync: ['Administrator update', 'تحديث إداري'],
    accepted: ['Accepted', 'مقبول'],
    rejected: ['Declined', 'مرفوض'],
    cancelled: ['Cancelled', 'ملغى'],
    removed: ['Removed', 'تمت الإزالة'],
    published: ['Published', 'منشورة'],
    draft: ['Draft', 'مسودة'],
    archived: ['Archived', 'مؤرشفة'],
    scheduled: ['Scheduled', 'مجدولة'],
    completed: ['Completed', 'مكتملة'],
    open: ['Open', 'مفتوح'],
    resolved: ['Resolved', 'تم الحل'],
    active: ['Active', 'نشط'],
    suspended: ['Suspended', 'موقوف'],
  };
  const tone = statusTone(value);
  return (
    <span
      className={`inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-1 text-xs font-bold ${statusTones[tone]}`}
    >
      <span aria-hidden="true" className={`size-1.5 rounded-full ${statusDots[tone]}`} />
      {labels[value]?.[ar ? 1 : 0] || value}
    </span>
  );
}
export function RowLink({
  href,
  title,
  meta,
  trailing,
}: {
  href: string;
  title: string;
  meta?: string;
  trailing?: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      className="flex min-h-11 min-w-0 items-center gap-4 rounded-2xl border border-line bg-white p-4 transition-colors hover:border-orange/50 focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-orange"
    >
      <span className="min-w-0 flex-1">
        <strong className="block wrap-break-word text-teal [overflow-wrap:anywhere]">
          {title}
        </strong>
        {meta && (
          <span className="mt-1 block wrap-break-word text-sm text-muted [overflow-wrap:anywhere]">
            {meta}
          </span>
        )}
      </span>
      {trailing}
    </Link>
  );
}
export function cairoDate(value: string, locale: string) {
  return new Intl.DateTimeFormat(locale === 'ar' ? 'ar-EG' : 'en-GB', {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: 'Africa/Cairo',
  }).format(new Date(value));
}
export const weekday = (day: number, locale: string) =>
  new Intl.DateTimeFormat(locale === 'ar' ? 'ar-EG' : 'en-GB', {
    weekday: 'long',
    timeZone: 'Africa/Cairo',
  }).format(new Date(Date.UTC(2026, 0, 4 + day)));
