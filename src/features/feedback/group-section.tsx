import Link from 'next/link';
import type { SupabaseClient } from '@supabase/supabase-js';
import { FeedbackForm } from './form';
import {
  feedbackEligibilityMessage,
  feedbackPageHref,
  feedbackStatus,
  type FeedbackEligibilityReason,
  type FeedbackRow,
} from './domain';

type PublicFeedbackPage = { rows: FeedbackRow[]; total: number; average: number | null };
type OwnFeedback = { eligible: boolean; reason?: FeedbackEligibilityReason; own: FeedbackRow | null };

export async function GroupFeedbackSection({
  db,
  locale,
  groupId,
  isStudent,
  offset = 0,
  basePath = `/${locale}/groups/${groupId}`,
}: {
  db: SupabaseClient;
  locale: string;
  groupId: string;
  isStudent: boolean;
  offset?: number;
  basePath?: string;
}) {
  const ar = locale === 'ar';
  const [published, mine] = await Promise.all([
    db.rpc('public_group_feedback', { p_group_id: groupId, p_offset: offset }),
    isStudent ? db.rpc('my_group_feedback', { p_group_id: groupId }) : Promise.resolve({ data: null, error: null }),
  ]);
  const page = published.data as PublicFeedbackPage | null;
  const own = mine.data as OwnFeedback | null;

  return (
    <section className="mt-8 border-t border-line pt-6">
      <h2 className="text-xl font-black text-teal">{ar ? 'آراء الطلاب' : 'Student feedback'}</h2>
      <p className="mt-2 text-sm text-muted">
        {ar
          ? 'تتاح للطالب بعد قبول انضمامه، وتسجيل حضوره أو تأخره في حصة انتهت لمجموعة منشورة يديرها معلم نشط ومعتمد. تُراجع الآراء والردود قبل النشر.'
          : 'Students can leave feedback after acceptance, once present or late attendance is recorded for a completed lesson in a published group managed by an active, approved teacher. Feedback and replies are reviewed before publication.'}
      </p>

      {published.error || !page ? (
        <p role="alert" className="mt-3 text-sm text-red-800">
          {ar ? 'تعذر تحميل الآراء. حدّث الصفحة.' : 'Could not load feedback. Refresh the page.'}
        </p>
      ) : (
        <>
          {page.total > 0 && <p className="mt-3 font-bold">{ar ? 'المتوسط' : 'Average'}: {page.average} / 5 · {page.total} {ar ? 'تقييم' : 'reviews'}</p>}
          {!page.total && <p className="mt-3 text-sm text-muted">{ar ? 'لا توجد آراء منشورة بعد.' : 'No published feedback yet.'}</p>}
          <ul className="mt-4 grid gap-4">
            {page.rows.map(row => (
              <li key={row.id} className="rounded-xl border border-line p-4">
                <h3 className="font-bold text-teal">{ar ? 'طالب' : 'Student'} · {row.rating} / 5</h3>
                <p className="mt-2 whitespace-pre-wrap break-words text-sm [overflow-wrap:anywhere]">{row.comment}</p>
                {row.reply_public && (
                  <div className="mt-3 rounded-lg bg-cream p-3">
                    <h4 className="font-bold">{ar ? 'رد المعلم' : 'Teacher reply'}</h4>
                    <p className="mt-2 whitespace-pre-wrap break-words text-sm [overflow-wrap:anywhere]">{row.reply_public}</p>
                  </div>
                )}
                <p className="mt-3 break-all text-xs text-muted">{ar ? 'مرجع التقييم: ' : 'Feedback reference: '}{row.id}</p>
                <Link href={`/${locale}/reports`} className="mt-2 inline-flex min-h-11 items-center text-sm font-bold text-teal underline">
                  {ar ? 'الإبلاغ عن مشكلة في هذا التقييم (أضف المرجع)' : 'Report this feedback (include the reference)'}
                </Link>
              </li>
            ))}
          </ul>
          {page.total > 10 && (
            <nav className="mt-4 flex gap-5">
              {offset > 0 && (
                <Link className="inline-flex min-h-11 items-center underline" href={feedbackPageHref(basePath, Math.max(0, offset - 10))}>
                  {ar ? 'السابق' : 'Previous'}
                </Link>
              )}
              {offset + 10 < page.total && (
                <Link className="inline-flex min-h-11 items-center underline" href={feedbackPageHref(basePath, offset + 10)}>
                  {ar ? 'التالي' : 'Next'}
                </Link>
              )}
            </nav>
          )}
        </>
      )}

      {mine.error ? (
        <p role="alert" className="mt-4">{ar ? 'تعذر تحميل صلاحية التقييم. حدّث الصفحة.' : 'Could not load your feedback eligibility. Refresh the page.'}</p>
      ) : own ? (
        <div className="mt-6 rounded-xl border border-line p-4">
          <h3 className="font-bold text-teal">{ar ? 'تقييمك' : 'Your feedback'}</h3>
          {own.own && <p className="mt-2 text-sm">{feedbackStatus(own.own.status ?? '', ar)}</p>}
          {own.eligible ? (
            <FeedbackForm locale={locale} kind="save" id={groupId} row={own.own} />
          ) : (
            <p className="mt-2 text-sm text-muted">{feedbackEligibilityMessage(own.reason, ar)}</p>
          )}
          {own.own && own.own.status !== 'withdrawn' && <FeedbackForm locale={locale} kind="withdraw" id={own.own.id} row={own.own} />}
        </div>
      ) : null}
    </section>
  );
}
