import Link from 'next/link';
import { ensureLocale } from '@/i18n/config';
import { requireTeachingAccess } from '@/components/platform/access';
import { EmptyState, Panel, ScreenTitle, Status } from '@/components/platform/ui';
import { GroupManagementControls } from '@/features/teacher/management-forms';
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
  const me = await requireTeachingAccess(locale);
  const fetchGroups = (page: number) =>
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
  const { result: groups, page } = await readCountedPage(
    normalizeStudentPage(query.page),
    STUDENT_PAGE_SIZE,
    fetchGroups,
  );
  const count = groups.count ?? 0,
    pageCount = studentPageCount(count);
  const failed = !!groups.error || groups.count == null;
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
            className="inline-flex min-h-11 items-center rounded-xl bg-teal px-5 font-bold text-white transition-colors hover:bg-teal/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange focus-visible:ring-offset-2"
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
      ) : (
        <div className="grid gap-4">
          {groups.data?.length ? (
            groups.data.map(group => {
              const relation = (
                Array.isArray(group.offering) ? group.offering[0] : group.offering
              ) as {
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
              const href =
                group.status === 'draft'
                  ? `/${locale}/teacher/groups/${group.id}/setup?step=details`
                  : `/${locale}/teacher/groups/${group.id}`;
              return (
                <article
                  key={group.id}
                  className="student-card rounded-2xl border border-line bg-white p-5 shadow-sm"
                >
                  <Link
                    href={href}
                    className="block rounded-xl hover:outline-none focus-visible:ring-2 focus-visible:ring-orange"
                  >
                    <div className="flex items-start justify-between gap-4">
                      <div className="min-w-0">
                        {subject &&
                          catalogueDisplayName(
                            { name_ar: subject.name_ar ?? '', name_en: subject.name_en ?? '' },
                            locale,
                          ) && (
                            <p className="text-sm font-bold text-orange">
                              {catalogueDisplayName(
                                { name_ar: subject.name_ar ?? '', name_en: subject.name_en ?? '' },
                                locale,
                              )}
                            </p>
                          )}
                        <h2 className="mt-1 break-words text-xl font-bold text-teal [overflow-wrap:anywhere]">
                          {group.name}
                        </h2>
                      </div>
                      <Status value={group.status} locale={locale} />
                    </div>
                    {group.description && (
                      <p className="mt-3 line-clamp-2 text-sm text-muted">{group.description}</p>
                    )}
                    <p className="mt-4 text-sm text-muted">
                      {group.location ? `${group.location} · ` : ''}
                      {ar ? 'السعة' : 'Capacity'} {group.capacity}
                    </p>
                    <p className="mt-4 text-sm font-bold text-teal">
                      {group.status === 'draft'
                        ? ar
                          ? 'استئناف الإعداد ←'
                          : 'Resume setup →'
                        : group.status === 'archived'
                          ? ar
                            ? 'عرض السجل ←'
                            : 'View history →'
                          : ar
                            ? 'إدارة المجموعة ←'
                            : 'Manage group →'}
                    </p>
                  </Link>
                  <div className="mt-4 border-t border-line pt-4">
                    <GroupManagementControls
                      locale={locale}
                      groupId={group.id}
                      status={group.status}
                    />
                  </div>
                </article>
              );
            })
          ) : (
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
          )}
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
