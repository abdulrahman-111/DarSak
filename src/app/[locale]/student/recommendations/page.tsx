import Link from 'next/link';
import { GroupCard } from '@/components/ui';
import { Panel, ScreenTitle } from '@/components/platform/ui';
import { StudentPagination } from '@/features/student/pagination';
import { studentRecommendations } from '@/features/student-matching/data';
import { matchingReasonLabel } from '@/features/student-matching/domain';
import { ensureLocale, getDictionary } from '@/i18n/config';

export default async function StudentRecommendationsPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ page?: string | string[] }>;
}) {
  const [{ locale: raw }, query] = await Promise.all([params, searchParams]);
  const locale = ensureLocale(raw);
  const ar = locale === 'ar';
  const [result, dictionary] = await Promise.all([
    studentRecommendations(locale, query.page),
    getDictionary(locale),
  ]);
  const copy = ar
    ? {
        title: 'اقتراحات لمجموعات تعليمية',
        intro:
          'استكشف المجموعات بناءً على اهتماماتك وصفك الدراسي وأيامك المفضلة. راجع تفاصيل المجموعة قبل طلب الانضمام.',
        reasonHeading: 'لماذا ظهرت هذه المجموعة؟',
        noSignals: 'أضف اهتماماتك أو هدفًا تعليميًا لعرض اقتراحات مبنية على ملفك.',
        noMatches: 'لا توجد اقتراحات الآن. حدّث اهتماماتك أو استعرض كل المجموعات.',
        profile: 'تعديل ملف التعلم',
        updatePreferences: 'تعديل الملف وأيام التفضيل',
        browse: 'استعراض كل المجموعات',
        error: 'تعذر تحميل الاقتراحات. حدّث الصفحة وحاول مرة أخرى.',
        retry: 'إعادة المحاولة',
        page: 'صفحة',
        previous: 'السابق',
        next: 'التالي',
      }
    : {
        title: 'Suggested learning groups',
        intro:
          'Explore groups based on your interests, school year and preferred days. Review the group details before requesting to join.',
        reasonHeading: 'Why this group appeared',
        noSignals: 'Add interests or a learning goal to see suggestions based on your profile.',
        noMatches: 'No suggestions yet. Try updating your interests or browse all groups.',
        profile: 'Edit learning profile',
        updatePreferences: 'Edit profile and preferred days',
        browse: 'Browse all groups',
        error: 'Could not load suggestions. Refresh and try again.',
        retry: 'Try again',
        page: 'Page',
        previous: 'Previous',
        next: 'Next',
      };
  return (
    <>
      <ScreenTitle
        eyebrow={ar ? 'اكتشف فرص التعلم' : 'Explore learning groups'}
        title={copy.title}
        description={copy.intro}
        action={
          <Link
            href={`/${locale}/account/learning-profile#matching-preferences`}
            className="inline-flex min-h-11 items-center rounded-xl border border-line bg-white px-4 py-3 text-sm font-bold text-teal focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange"
          >
            {copy.updatePreferences}
          </Link>
        }
      />
      {result.error || !result.data ? (
        <Panel>
          <p role="alert" className="text-sm text-danger">
            {copy.error}
          </p>
          <Link
            href={`/${locale}/student/recommendations?page=${result.page}`}
            className="mt-3 inline-flex min-h-11 items-center font-bold text-orange underline"
          >
            {copy.retry}
          </Link>
        </Panel>
      ) : result.groups.length ? (
        <>
          <div className="grid gap-4 md:grid-cols-2">
            {result.groups.map(({ group, reasonCodes }) => (
              <div key={group.id} className="flex min-w-0 flex-col">
                {reasonCodes.length > 0 && (
                  <div className="mb-2" aria-label={copy.reasonHeading}>
                    <ul className="flex flex-wrap gap-2">
                      {reasonCodes.map(code => (
                        <li
                          key={code}
                          className="rounded-full border border-teal/15 bg-mint px-3 py-1 text-xs font-semibold text-teal"
                        >
                          {matchingReasonLabel(code, locale)}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
                <div className="min-h-0 flex-1">
                  <GroupCard group={group} locale={locale} t={dictionary} />
                </div>
              </div>
            ))}
          </div>
          <StudentPagination
            locale={locale}
            href={`/${locale}/student/recommendations`}
            page={result.page}
            pageCount={result.pageCount}
            labels={{ page: copy.page, previous: copy.previous, next: copy.next }}
          />
        </>
      ) : (
        <Panel>
          <h2 className="text-lg font-bold text-teal">
            {result.data.hasProfileSignals ? copy.noMatches : copy.noSignals}
          </h2>
          <div className="mt-4 flex flex-wrap gap-3">
            <Link
              href={`/${locale}/account/learning-profile`}
              className="inline-flex min-h-11 items-center rounded-xl bg-teal px-4 py-2 font-bold text-white"
            >
              {copy.profile}
            </Link>
            <Link
              href={`/${locale}/teachers`}
              className="inline-flex min-h-11 items-center rounded-xl border border-line px-4 py-2 font-bold text-teal"
            >
              {copy.browse}
            </Link>
          </div>
        </Panel>
      )}
    </>
  );
}
