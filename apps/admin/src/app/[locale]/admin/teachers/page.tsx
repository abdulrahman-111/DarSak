import Link from 'next/link';
import { ensureLocale } from '@/i18n/config';
import { requireViewer } from '@admin/lib/access';
import { EmptyState, Panel, ScreenTitle, Status, cairoDate } from '@/components/platform/ui';
import { adminTeacherReviews } from '@admin/features/admin/review-data';
import { teacherReviewListSchema } from '@admin/features/admin/domain';

const PAGE_SIZE = 30;
export default async function AdminTeacherReviews({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ q?: string; status?: string; page?: string }>;
}) {
  const [{ locale: raw }, { q = '', status: rawStatus = 'pending', page = '1' }] =
    await Promise.all([params, searchParams]);
  const locale = ensureLocale(raw),
    ar = locale === 'ar',
    me = await requireViewer(locale, 'admin');
  const parsed = teacherReviewListSchema.safeParse({
    query: q,
    status: rawStatus,
    offset: (Number(page) - 1) * PAGE_SIZE,
    limit: PAGE_SIZE,
  });
  const filters = parsed.success
    ? parsed.data
    : { query: '', status: 'pending' as const, offset: 0, limit: PAGE_SIZE };
  const result = await adminTeacherReviews(me.db, filters);
  const currentPage = Math.floor(filters.offset / PAGE_SIZE) + 1,
    lastPage = Math.max(1, Math.ceil(result.total / PAGE_SIZE));
  const text = ar
    ? {
        eyebrow: 'مراجعة المعلمين',
        title: 'طلبات المعلمين',
        description: 'راجع الطلبات الحالية مع الحفاظ على حالة الحساب منفصلة عن قرار المراجعة.',
        search: 'البحث بالاسم',
        status: 'حالة المراجعة',
        pending: 'بانتظار المراجعة',
        approved: 'معتمد',
        declined: 'مرفوض',
        all: 'الكل',
        filter: 'تصفية',
        requested: 'تاريخ الطلب',
        account: 'الحساب',
        review: 'فتح الطلب',
        page: 'صفحة',
        of: 'من',
        previous: 'السابق',
        next: 'التالي',
        empty: 'لا توجد طلبات بهذه المرشحات.',
        error: 'تعذر تحميل الطلبات. حاول إعادة تحميل الصفحة.',
      }
    : {
        eyebrow: 'Teacher review',
        title: 'Teacher requests',
        description:
          'Review teacher requests while keeping account status separate from the review decision.',
        search: 'Search by name',
        status: 'Review status',
        pending: 'Pending',
        approved: 'Approved',
        declined: 'Declined',
        all: 'All',
        filter: 'Filter',
        requested: 'Requested',
        account: 'Account',
        review: 'Open request',
        page: 'Page',
        of: 'of',
        previous: 'Previous',
        next: 'Next',
        empty: 'No requests match these filters.',
        error: 'Could not load teacher requests. Refresh and try again.',
      };
  const listHref = (pageNumber: number) => {
    const p = new URLSearchParams();
    if (filters.query) p.set('q', filters.query);
    p.set('status', filters.status);
    if (pageNumber > 1) p.set('page', String(pageNumber));
    return `/${locale}/admin/teachers?${p}`;
  };
  const href = (next: number) => listHref(next);
  const reviewHref = (teacherId: string) => {
    const p = new URLSearchParams();
    if (filters.query) p.set('q', filters.query);
    p.set('status', filters.status);
    if (currentPage > 1) p.set('page', String(currentPage));
    return `/${locale}/admin/teachers/${encodeURIComponent(teacherId)}?${p}`;
  };
  return (
    <>
      <ScreenTitle eyebrow={text.eyebrow} title={text.title} description={text.description} />
      <Panel className="mb-5">
        <form method="get" className="grid gap-3 sm:grid-cols-[minmax(12rem,1fr)_12rem_auto]">
          <label className="grid gap-1 text-sm font-semibold">
            {text.search}
            <input
              name="q"
              maxLength={120}
              defaultValue={filters.query}
              className="rounded-xl border border-line bg-cream p-3"
            />
          </label>
          <label className="grid gap-1 text-sm font-semibold">
            {text.status}
            <select
              name="status"
              defaultValue={filters.status}
              className="rounded-xl border border-line bg-cream p-3"
            >
              <option value="pending">{text.pending}</option>
              <option value="approved">{text.approved}</option>
              <option value="declined">{text.declined}</option>
              <option value="all">{text.all}</option>
            </select>
          </label>
          <button className="self-end rounded-xl bg-teal px-5 py-3 font-bold text-white">
            {text.filter}
          </button>
        </form>
      </Panel>
      {result.error ? (
        <Panel>
          <p role="alert" className="text-danger">
            {text.error}
          </p>
        </Panel>
      ) : result.rows.length ? (
        <>
          <div className="grid gap-4 lg:grid-cols-2">
            {result.rows.map(row => (
              <Panel key={row.teacher_id}>
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <Link
                      href={reviewHref(row.teacher_id)}
                      className="text-lg font-black text-teal underline decoration-transparent hover:decoration-current"
                    >
                      {row.full_name}
                    </Link>
                    <p className="mt-1 text-sm text-muted">{row.headline || '—'}</p>
                  </div>
                  <Status value={row.status} locale={locale} />
                </div>
                <dl className="mt-4 grid grid-cols-2 gap-3 text-sm">
                  <div>
                    <dt className="text-muted">{text.requested}</dt>
                    <dd className="font-semibold">{cairoDate(row.requested_at, locale)}</dd>
                  </div>
                  <div>
                    <dt className="text-muted">{text.account}</dt>
                    <dd>
                      <Status value={row.account_status} locale={locale} />
                    </dd>
                  </div>
                </dl>
                <Link
                  href={reviewHref(row.teacher_id)}
                  className="mt-4 inline-flex rounded-xl border border-line px-4 py-2 font-bold text-teal"
                >
                  {text.review}
                </Link>
              </Panel>
            ))}
          </div>
          <nav className="mt-6 flex items-center justify-between">
            <span className="text-sm text-muted">
              {text.page} {currentPage} {text.of} {lastPage} · {result.total}
            </span>
            <span className="flex gap-3">
              {currentPage > 1 && (
                <Link
                  href={href(currentPage - 1)}
                  className="rounded-xl border border-line px-4 py-2 font-bold"
                >
                  {text.previous}
                </Link>
              )}
              {currentPage < lastPage && (
                <Link
                  href={href(currentPage + 1)}
                  className="rounded-xl border border-line px-4 py-2 font-bold"
                >
                  {text.next}
                </Link>
              )}
            </span>
          </nav>
        </>
      ) : (
        <EmptyState>{text.empty}</EmptyState>
      )}
    </>
  );
}
