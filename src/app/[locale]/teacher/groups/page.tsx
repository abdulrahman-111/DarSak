import Link from 'next/link';
import { ensureLocale } from '@/i18n/config';
import { loadWithTeachingAccess } from '@/features/teacher/teaching-access-gate';
import type { PlatformViewer } from '@/components/platform/access';
import { EmptyState, Panel, ScreenTitle } from '@/components/platform/ui';
import { TeacherGroupsResponsiveList } from '@/features/teacher/groups-responsive-list';
import {
  normalizeStudentPage,
  STUDENT_PAGE_SIZE,
  studentPageCount,
} from '@/features/student/pagination-domain';
import { StudentPagination } from '@/features/student/pagination';
import { catalogueDisplayName } from '@/features/teacher/catalogue-domain';
import { readCountedPage } from '@/lib/supabase/counted-page';

export default async function TeacherGroups({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ deleted?: string; page?: string }>;
}) {
  const [{ locale: raw }, query] = await Promise.all([params, searchParams]);
  const locale = ensureLocale(raw);
  const ar = locale === 'ar';
  const fetchGroups = (page: number, me: PlatformViewer) =>
    me.db
      .from('groups')
      .select(
        'id,name,description,status,capacity,location,offering:offerings(subject:subjects(name_ar,name_en))',
        { count: 'exact' },
      )
      .eq('teacher_id', me.id)
      .order('created_at', { ascending: false })
      .order('id', { ascending: false })
      .range((page - 1) * STUDENT_PAGE_SIZE, page * STUDENT_PAGE_SIZE - 1);
  const {
    data: { result: groups, page },
  } = await loadWithTeachingAccess(locale, me =>
    readCountedPage(normalizeStudentPage(query.page), STUDENT_PAGE_SIZE, page =>
      fetchGroups(page, me),
    ),
  );
  const count = groups.count ?? 0,
    pageCount = studentPageCount(count);
  const failed = !!groups.error || groups.count == null;
  const groupItems = (groups.data ?? []).map(group => {
    const relation = (Array.isArray(group.offering) ? group.offering[0] : group.offering) as {
      subject?:
        | { name_ar: string | null; name_en: string | null }
        | { name_ar: string | null; name_en: string | null }[]
        | null;
    } | null;
    const subject = relation
      ? Array.isArray(relation.subject)
        ? relation.subject[0]
        : relation.subject
      : null;
    const subjectName = subject
      ? catalogueDisplayName(
          { name_ar: subject.name_ar ?? '', name_en: subject.name_en ?? '' },
          locale,
        )
      : '';
    return { ...group, subject: subjectName || null };
  });
  const pageLabels = ar
    ? { previous: 'السابق', next: 'التالي', page: 'صفحة' }
    : { previous: 'Previous', next: 'Next', page: 'Page' };

  return (
    <>
      <ScreenTitle
        eyebrow={ar ? 'إدارة التدريس' : 'Teaching setup'}
        title={ar ? 'مجموعاتي' : 'My groups'}
        description={
          ar
            ? 'أنشئ المجموعات كمسودات، ثم استأنف إعداد جدولها قبل النشر.'
            : 'Create groups as drafts, then resume setup to add their schedules before publishing.'
        }
        action={
          <Link
            href={`/${locale}/teacher/groups/new`}
            className="inline-flex min-h-11 items-center rounded-xl bg-teal px-5 font-bold text-white transition-colors hover:bg-teal/90 focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-orange focus-visible:ring-offset-2"
          >
            {ar ? 'إنشاء مجموعة' : 'Create group'}
          </Link>
        }
      />
      {query.deleted === '1' && (
        <Panel className="mb-4">
          <p role="status" className="text-sm font-semibold text-teal">
            {ar ? 'تم حذف المجموعة غير المستخدمة.' : 'Unused group deleted.'}
          </p>
        </Panel>
      )}
      {failed ? (
        <Panel>
          <p role="alert" className="text-sm text-danger">
            {ar
              ? 'تعذر تحميل مجموعاتك. حدّث الصفحة وحاول مرة أخرى.'
              : 'Could not load your groups. Refresh and try again.'}
          </p>
          <a
            href={`/${locale}/teacher/groups?retry=1`}
            className="mt-3 inline-flex font-bold text-orange underline"
          >
            {ar ? 'إعادة المحاولة' : 'Try again'}
          </a>
        </Panel>
      ) : groupItems.length ? (
        <TeacherGroupsResponsiveList groups={groupItems} locale={locale} />
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          <div className="lg:col-span-2">
            <EmptyState
              title={ar ? 'لا توجد مجموعات بعد' : 'No groups yet'}
              action={{
                href: `/${locale}/teacher/groups/new`,
                label: ar ? 'أنشئ أول مجموعة' : 'Create your first group',
              }}
            >
              {ar
                ? 'المجموعة هي ما يراه الطلاب ويطلبون الانضمام إليه. ابدأ بمسودة، وأضف جدولها، ثم انشرها.'
                : 'A group is what students discover and ask to join. Start a draft, add its schedule, then publish it.'}
            </EmptyState>
          </div>
        </div>
      )}
      {!failed && (
        <StudentPagination
          locale={locale}
          href={`/${locale}/teacher/groups`}
          page={page}
          pageCount={pageCount}
          labels={pageLabels}
        />
      )}
    </>
  );
}
