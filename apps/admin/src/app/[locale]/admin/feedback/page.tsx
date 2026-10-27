import Link from 'next/link';
import { ensureLocale } from '@/i18n/config';
import { Panel, ScreenTitle } from '@/components/platform/ui';
import { feedbackStatus, type FeedbackRow } from '@/features/feedback/domain';
import { requireAdminActor } from '@admin/lib/access';
import { AdminFeedbackForm } from '@admin/features/admin/feedback-form';

export default async function AdminFeedbackPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ page?: string }>;
}) {
  const [{ locale: raw }, query] = await Promise.all([params, searchParams]);
  const locale = ensureLocale(raw);
  const ar = locale === 'ar';
  const actor = await requireAdminActor(locale);
  const parsed = Number(query.page);
  const page = Number.isSafeInteger(parsed) && parsed > 0 ? parsed : 1;
  const offset = (page - 1) * 20;
  const result = await actor.db.rpc('manage_group_feedback_page', { p_offset: offset });
  const data = result.data as { rows: FeedbackRow[]; total: number } | null;
  return (
    <>
      <ScreenTitle
        eyebrow={ar ? 'جودة التعلم' : 'Learning quality'}
        title={ar ? 'آراء الطلاب' : 'Student feedback'}
        description={
          ar
            ? 'راجع التقييمات وردود المعلمين قبل نشرها. لا تنشر معلومات شخصية.'
            : 'Review student feedback and teacher replies before publication. Do not publish personal information.'
        }
      />
      {result.error || !data ? (
        <Panel>
          <p role="alert">
            {ar ? 'تعذر تحميل الآراء. حدّث الصفحة.' : 'Could not load feedback. Refresh the page.'}
          </p>
        </Panel>
      ) : (
        <>
          <div className="grid gap-4">
            {data.rows.map(row => (
              <Panel key={row.id}>
                {row.group_id ? (
                  <Link
                    className="inline-flex min-h-11 items-center font-bold text-teal underline"
                    href={`/${locale}/admin/groups#group-${row.group_id}`}
                  >
                    {row.group_name}
                  </Link>
                ) : (
                  <p className="font-bold text-teal">{row.group_name}</p>
                )}
                <p className="mt-2 text-sm">
                  {row.rating} / 5 · {feedbackStatus(row.status ?? '', ar)}
                </p>
                <p className="mt-3 whitespace-pre-wrap break-words [overflow-wrap:anywhere]">
                  {row.comment}
                </p>
                {row.reply_public && (
                  <p className="mt-3 whitespace-pre-wrap break-words text-sm">
                    {ar ? 'الرد المنشور: ' : 'Published reply: '}
                    {row.reply_public}
                  </p>
                )}
                {row.reply_pending && (
                  <p className="mt-3 whitespace-pre-wrap break-words text-sm text-orange">
                    {ar ? 'رد بانتظار المراجعة: ' : 'Reply awaiting review: '}
                    {row.reply_pending}
                  </p>
                )}
                <AdminFeedbackForm locale={locale} row={row} />
              </Panel>
            ))}
          </div>
          {!data.rows.length && (
            <Panel>
              <p>{ar ? 'لا توجد آراء في هذه الصفحة.' : 'No feedback on this page.'}</p>
            </Panel>
          )}
          <nav className="mt-5 flex gap-5">
            {page > 1 && (
              <Link
                className="inline-flex min-h-11 items-center underline"
                href={`/${locale}/admin/feedback?page=${page - 1}`}
              >
                {ar ? 'السابق' : 'Previous'}
              </Link>
            )}
            {offset + 20 < data.total && (
              <Link
                className="inline-flex min-h-11 items-center underline"
                href={`/${locale}/admin/feedback?page=${page + 1}`}
              >
                {ar ? 'التالي' : 'Next'}
              </Link>
            )}
          </nav>
        </>
      )}
    </>
  );
}
