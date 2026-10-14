import Link from 'next/link';

export function StudentPagination({ locale, href, page, pageCount, labels, pageParam = 'page', preserve = {} }: {
  locale: string;
  href: string;
  page: number;
  pageCount: number;
  labels: { previous: string; next: string; page: string };
  pageParam?: string;
  preserve?: Record<string, string | number | undefined>;
}) {
  if (pageCount <= 1) return null;
  const pageHref = (targetPage: number) => {
    const params = new URLSearchParams();
    for (const [key, value] of Object.entries(preserve)) if (value !== undefined) params.set(key, String(value));
    params.set(pageParam, String(targetPage));
    return `${href}${href.includes('?') ? '&' : '?'}${params.toString()}`;
  };
  return <nav aria-label={locale === 'ar' ? 'صفحات النتائج' : 'Result pages'} className="mt-6 flex flex-wrap items-center justify-between gap-3">
    {page > 1 ? <Link rel="prev" className="rounded-xl border-2 border-teal px-4 py-2 font-bold text-teal" href={pageHref(page - 1)}>{labels.previous}</Link> : <span/>}
    <span className="text-sm text-muted" aria-current="page">{labels.page} {page} / {pageCount}</span>
    {page < pageCount ? <Link rel="next" className="rounded-xl border-2 border-teal px-4 py-2 font-bold text-teal" href={pageHref(page + 1)}>{labels.next}</Link> : <span/>}
  </nav>;
}
