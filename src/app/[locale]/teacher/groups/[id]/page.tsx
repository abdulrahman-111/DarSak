import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ensureLocale } from '@/i18n/config';
import type { PlatformViewer } from '@/components/platform/access';
import { loadWithTeachingAccess } from '@/features/teacher/teaching-access-gate';
import { LessonForm } from '@/components/platform/forms';
import {
  EmptyState,
  Panel,
  RowLink,
  ScreenTitle,
  Status,
  cairoDate,
  weekday,
} from '@/components/platform/ui';
import { GenerationPreviewForm } from '@/features/teacher/generation-form';
import { DuplicateGroupForm } from '@/features/teacher/shortcuts-forms';
import { EnrollmentDecisionButtons } from '@/components/platform/actions';
import { GroupManagementControls } from '@/features/teacher/management-forms';
import {
  normalizeStudentPage,
  STUDENT_PAGE_SIZE,
  studentPageCount,
} from '@/features/student/pagination-domain';
import { StudentPagination } from '@/features/student/pagination';
import { GroupScheduleTable } from '@/features/teacher/group-schedule-table';
import { summarizeSchedule } from '@/features/groups/schedule-summary';
import { AnnouncementForm } from '@/features/groups/announcement-form';
import { groupAnnouncement } from '@/features/groups/announcement-data';
import { readCountedPage } from '@/lib/supabase/counted-page';

export default async function TeacherGroupDetail({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string; id: string }>;
  searchParams: Promise<{
    page?: string;
    roster_page?: string;
    detailsSaved?: string;
    editSlot?: string;
  }>;
}) {
  const [{ locale: raw, id }, query] = await Promise.all([params, searchParams]);
  const locale = ensureLocale(raw);
  const ar = locale === 'ar';
  const fetchLessons = (page: number, me: PlatformViewer) =>
    me.db
      .from('lessons')
      .select('id,title,starts_at,status,group:groups!inner(teacher_id)', { count: 'exact' })
      .eq('group_id', id)
      .eq('group.teacher_id', me.id)
      .order('starts_at', { ascending: false })
      .order('id', { ascending: false })
      .range((page - 1) * STUDENT_PAGE_SIZE, page * STUDENT_PAGE_SIZE - 1);
  const fetchRoster = (page: number, me: PlatformViewer) =>
    me.db.rpc('group_enrollment_page', {
      p_group_id: id,
      p_offset: (page - 1) * STUDENT_PAGE_SIZE,
      p_limit: STUDENT_PAGE_SIZE,
    });
  const requestedPage = normalizeStudentPage(query.page);
  const maxRosterPage = Math.floor(2_147_483_647 / STUDENT_PAGE_SIZE);
  let rosterPage = Math.min(normalizeStudentPage(query.roster_page), maxRosterPage);
  const {
    me,
    data: [
      group,
      slots,
      initialLessons,
      initialStudents,
      exclusions,
      announcement,
      seats,
      upcoming,
    ],
  } = await loadWithTeachingAccess(locale, me =>
    Promise.all([
      me.db
        .from('groups')
        .select('id,name,description,status,capacity,location')
        .eq('id', id)
        .eq('teacher_id', me.id)
        .maybeSingle(),
      me.db
        .from('group_schedule_slots')
        .select('id,group_id,weekday,start_time,end_time,timezone')
        .eq('group_id', id)
        .order('weekday')
        .order('start_time'),
      readCountedPage(requestedPage, STUDENT_PAGE_SIZE, page => fetchLessons(page, me)),
      fetchRoster(rosterPage, me),
      me.db
        .from('group_lesson_exclusions')
        .select('local_date')
        .eq('group_id', id)
        .order('local_date'),
      groupAnnouncement(me.db, id),
      me.db
        .from('enrollments')
        .select('id', { count: 'exact', head: true })
        .eq('group_id', id)
        .eq('status', 'accepted'),
      me.db
        .from('lessons')
        .select('slot_id,starts_at')
        .eq('group_id', id)
        .eq('status', 'scheduled')
        .not('slot_id', 'is', null)
        .gte('starts_at', new Date().toISOString())
        .order('starts_at')
        .limit(200),
    ]),
  );
  let page = initialLessons.page;
  const lessons = initialLessons.result;
  const lessonCount = lessons.count ?? 0;
  const lessonPageCount = studentPageCount(lessonCount);
  let students = initialStudents;
  const rosterTotal = (students.data as { total?: number } | null)?.total ?? 0;
  const rosterPageCount = studentPageCount(rosterTotal);
  if (!students.error && rosterPage > rosterPageCount) {
    rosterPage = rosterPageCount;
    students = await fetchRoster(rosterPage, me);
  }
  const lessonsFailed = !!lessons.error || lessons.count == null;
  const pageLabels = ar
    ? { previous: 'السابق', next: 'التالي', page: 'صفحة' }
    : { previous: 'Previous', next: 'Next', page: 'Page' };
  const currentGroup = group.data;
  if (!currentGroup) notFound();
  const copy = ar
    ? {
        schedule: 'الجدول الأسبوعي',
        cairo: 'كل الأوقات بتوقيت القاهرة.',
        addTime: 'أضف أول موعد أسبوعي.',
        scheduleEffect:
          'تغييرات الجدول تؤثر في إنشاء الحصص مستقبلاً. الحصص التي أُنشئت بالفعل تبقى كما هي؛ عدّلها أو أعد جدولتها بشكل منفصل.',
        newLesson: 'حصة جديدة',
        lessons: 'الحصص',
        noLessons: 'لا توجد حصص بعد.',
        students: 'الطلاب والطلبات',
        noStudents: 'لا توجد طلبات بعد.',
        generation: 'إنشاء الحصص من الجدول',
        slotError: 'تعذر تحميل المواعيد الأسبوعية.',
        lessonsError: 'تعذر تحميل الحصص.',
        studentsError: 'تعذر تحميل الطلاب والطلبات.',
        exclusionsError: 'تعذر تحميل الأيام المستثناة.',
        back: 'العودة إلى مجموعاتي',
        archived: 'هذه المجموعة مؤرشفة. يمكنك مراجعة سجلها، لكن لن تُضاف مواعيد أو حصص جديدة.',
        archivedNoSchedule: 'لا توجد مواعيد أسبوعية محفوظة.',
        sections: 'أقسام المجموعة',
        overview: 'نظرة عامة',
        scheduleNav: 'الجدول',
        studentsNav: 'الطلاب',
        lessonsNav: 'الحصص',
        announcementsNav: 'الإعلانات',
        assignmentsNav: 'الواجبات',
        assignmentsHint: 'أنشئ الواجبات وراجع تسليمات الطلاب لهذه المجموعة.',
        openAssignments: 'فتح الواجبات',
        noLocation: 'بدون موقع',
        noSchedule: 'لم تُضف مواعيد أسبوعية بعد.',
        statusLabel: 'الحالة',
        seatsLabel: 'المقاعد',
        locationLabel: 'الموقع',
        scheduleLabel: 'الجدول',
        goSchedule: 'إدارة الجدول',
      }
    : {
        schedule: 'Weekly schedule',
        cairo: 'All times use Africa/Cairo.',
        addTime: 'Add the first weekly time.',
        scheduleEffect:
          'Schedule changes affect future lesson generation. Lessons already generated remain as they are; edit or reschedule them separately.',
        newLesson: 'New lesson',
        lessons: 'Lessons',
        noLessons: 'No lessons yet.',
        students: 'Students and requests',
        noStudents: 'No requests yet.',
        generation: 'Generate lessons from schedule',
        slotError: 'Could not load weekly times.',
        lessonsError: 'Could not load lessons.',
        studentsError: 'Could not load students and requests.',
        exclusionsError: 'Could not load excluded days.',
        back: 'Back to my groups',
        archived:
          'This group is archived. You can review its history, but no new times or lessons can be added.',
        archivedNoSchedule: 'No weekly schedule was saved for this group.',
        sections: 'Group sections',
        overview: 'Overview',
        scheduleNav: 'Schedule',
        studentsNav: 'Students',
        lessonsNav: 'Lessons',
        announcementsNav: 'Announcements',
        assignmentsNav: 'Assignments',
        assignmentsHint: 'Create assignments and review student submissions for this group.',
        openAssignments: 'Open assignments',
        noLocation: 'No location set',
        noSchedule: 'No weekly times added yet.',
        statusLabel: 'Status',
        seatsLabel: 'Seats',
        locationLabel: 'Location',
        scheduleLabel: 'Schedule',
        goSchedule: 'Manage schedule',
      };

  const archived = currentGroup.status === 'archived';
  const numberFormat = new Intl.NumberFormat(ar ? 'ar-EG' : 'en-GB', { useGrouping: false });
  const acceptedCount = seats.error ? null : (seats.count ?? 0);
  const freeSeats =
    acceptedCount === null ? null : Math.max(0, currentGroup.capacity - acceptedCount);
  const seatsText =
    freeSeats === null
      ? null
      : ar
        ? `${numberFormat.format(freeSeats)} من ${numberFormat.format(currentGroup.capacity)} مقاعد متاحة`
        : `${freeSeats} of ${currentGroup.capacity} seats free`;
  const nextBySlot = new Map<string, string>();
  for (const lesson of upcoming.data ?? []) {
    if (lesson.slot_id && !nextBySlot.has(lesson.slot_id))
      nextBySlot.set(lesson.slot_id, cairoDate(lesson.starts_at, locale));
  }
  const scheduleRows = (slots.data ?? []).map(slot => ({
    id: slot.id,
    weekday: slot.weekday,
    start_time: slot.start_time,
    end_time: slot.end_time,
    next: nextBySlot.get(slot.id) ?? null,
  }));
  const scheduleSummary = summarizeSchedule(slots.data ?? [], locale);
  const preserve: Record<string, string> = {};
  if (page > 1) preserve.page = String(page);
  if (rosterPage > 1) preserve.roster_page = String(rosterPage);
  const sectionNav = [
    ['overview', copy.overview],
    ['schedule', copy.scheduleNav],
    ['students', copy.studentsNav],
    ['lessons', copy.lessonsNav],
    ['announcements', copy.announcementsNav],
    ['assignments', copy.assignmentsNav],
  ] as const;
  const sectionClass = 'scroll-mt-6 focus:outline-none';
  const actionLink =
    'inline-flex min-h-11 items-center rounded-xl px-4 py-2 font-bold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange';

  return (
    <>
      <Link
        href={`/${locale}/teacher/groups`}
        className="mb-4 inline-flex min-h-11 items-center font-bold text-teal underline"
      >
        ← {copy.back}
      </Link>
      <header className="mb-4 flex min-w-0 flex-wrap items-end justify-between gap-3 md:gap-4">
        <div className="min-w-0">
          <p className="mb-2 text-xs font-bold uppercase tracking-wider text-muted">
            {ar ? 'تفاصيل المجموعة' : 'Group details'}
          </p>
          <h1 className="break-words text-2xl font-bold tracking-tight text-teal [overflow-wrap:anywhere] sm:text-3xl">
            {currentGroup.name}
          </h1>
          <p className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-muted">
            <Status value={currentGroup.status} locale={locale} />
            {seatsText && <span>· {seatsText}</span>}
            {currentGroup.location && <span>· {currentGroup.location}</span>}
          </p>
        </div>
        <div className="grid justify-items-start gap-3 sm:justify-items-end">
          <div className="flex flex-wrap items-center gap-3">
            {currentGroup.status === 'published' && (
              <Link
                href={`/${locale}/teacher/groups/${id}/edit`}
                className={`${actionLink} border border-line text-teal`}
              >
                {ar ? 'تعديل التفاصيل' : 'Edit details'}
              </Link>
            )}
            {!archived && (
              <Link
                href={`/${locale}/teacher/lessons?new=1&groupId=${id}`}
                className={`${actionLink} bg-orange text-white hover:bg-orange-deep`}
              >
                {ar ? 'إضافة حصة' : 'Add lesson'}
              </Link>
            )}
          </div>
          <GroupManagementControls locale={locale} groupId={id} status={currentGroup.status} />
        </div>
      </header>
      <nav
        aria-label={copy.sections}
        className="-mx-4 mb-6 overflow-x-auto border-b border-line px-4 sm:mx-0 sm:px-0"
      >
        <ul className="flex min-w-max gap-1">
          {sectionNav.map(([anchor, label]) => (
            <li key={anchor}>
              <a
                href={`#${anchor}`}
                className="inline-flex min-h-11 items-center whitespace-nowrap rounded-t-xl px-4 font-bold text-teal hover:bg-cream focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange"
              >
                {label}
              </a>
            </li>
          ))}
        </ul>
      </nav>
      {query.detailsSaved === '1' && (
        <Panel className="mb-6">
          <p role="status" className="text-sm font-semibold text-teal">
            {ar ? 'تم حفظ تفاصيل المجموعة.' : 'Group details saved.'}
          </p>
        </Panel>
      )}
      {archived && (
        <Panel className="mb-6">
          <p className="text-sm font-semibold text-muted">{copy.archived}</p>
        </Panel>
      )}

      <div className="grid gap-8">
        <section id="overview" aria-labelledby="overview-heading" className={sectionClass}>
          <Panel>
            <h2 id="overview-heading" className="text-xl font-black text-teal">
              {copy.overview}
            </h2>
            <dl className="mt-4 grid gap-4 text-sm sm:grid-cols-2 xl:grid-cols-4">
              <div>
                <dt className="text-muted">{copy.statusLabel}</dt>
                <dd className="mt-1 font-bold">
                  <Status value={currentGroup.status} locale={locale} />
                </dd>
              </div>
              <div>
                <dt className="text-muted">{copy.seatsLabel}</dt>
                <dd className="mt-1 font-bold">{seatsText ?? '—'}</dd>
              </div>
              <div>
                <dt className="text-muted">{copy.locationLabel}</dt>
                <dd className="mt-1 font-bold">{currentGroup.location || copy.noLocation}</dd>
              </div>
              <div>
                <dt className="text-muted">{copy.scheduleLabel}</dt>
                <dd className="mt-1 font-bold">
                  {scheduleSummary.lines.length ? (
                    <>
                      {scheduleSummary.lines.map(line => (
                        <span key={line} className="block">
                          {line}
                        </span>
                      ))}
                      <span className="block font-normal text-muted">
                        {scheduleSummary.countLabel}
                      </span>
                    </>
                  ) : (
                    copy.noSchedule
                  )}
                  <a
                    href="#schedule"
                    className="mt-1 inline-flex min-h-11 items-center text-teal underline"
                  >
                    {copy.goSchedule}
                  </a>
                </dd>
              </div>
            </dl>
          </Panel>
        </section>

        <section id="schedule" aria-labelledby="schedule-heading" className={sectionClass}>
          <Panel>
            <h2 id="schedule-heading" className="text-xl font-black text-teal">
              {copy.schedule}
            </h2>
            <p className="mt-1 text-sm text-muted">{copy.cairo}</p>
            {!archived && <p className="mt-1 text-sm text-muted">{copy.scheduleEffect}</p>}
            {slots.error ? (
              <p role="alert" className="my-5 text-sm text-danger">
                {copy.slotError}
              </p>
            ) : archived && !scheduleRows.length ? (
              <div className="my-5">
                <EmptyState>{copy.archivedNoSchedule}</EmptyState>
              </div>
            ) : (
              <div className="mt-4">
                <GroupScheduleTable
                  locale={locale}
                  groupId={id}
                  slots={scheduleRows}
                  editSlot={typeof query.editSlot === 'string' ? query.editSlot : null}
                  preserve={preserve}
                  readOnly={archived}
                />
              </div>
            )}
            {!archived && (
              <div className="mt-5 border-t border-line pt-5">
                <DuplicateGroupForm locale={locale} groupId={id} />
              </div>
            )}
          </Panel>
        </section>

        <section id="students" aria-labelledby="students-heading" className={sectionClass}>
          <Panel>
            <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
              <h2 id="students-heading" className="text-xl font-black text-teal">
                {copy.students}
              </h2>
              <div className="flex flex-wrap gap-3 text-sm font-bold">
                <Link
                  className="inline-flex min-h-11 items-center text-teal underline"
                  href={`/${locale}/teacher/requests?group_id=${id}`}
                >
                  {ar ? 'طلبات هذه المجموعة' : 'Requests for this group'}
                </Link>
                <Link
                  className="inline-flex min-h-11 items-center text-teal underline"
                  href={`/${locale}/teacher/students?group_id=${id}`}
                >
                  {ar ? 'طلاب هذه المجموعة' : 'Students in this group'}
                </Link>
              </div>
            </div>
            {students.error ? (
              <p role="alert" className="text-sm text-danger">
                {copy.studentsError}
              </p>
            ) : (
                students.data as {
                  rows?: { enrollment_id: string; full_name: string; status: string }[];
                } | null
              )?.rows?.length ? (
              <div className="grid gap-2">
                {(
                  students.data as {
                    rows: { enrollment_id: string; full_name: string; status: string }[];
                  }
                ).rows.map(student => (
                  <div key={student.enrollment_id} className="rounded-xl border border-line p-3">
                    <div className="flex items-center justify-between gap-3">
                      <strong>{student.full_name}</strong>
                      <Status value={student.status} locale={locale} />
                    </div>
                    {!archived && (
                      <EnrollmentDecisionButtons
                        locale={locale}
                        id={student.enrollment_id}
                        status={student.status}
                      />
                    )}
                  </div>
                ))}
              </div>
            ) : (
              <EmptyState>{copy.noStudents}</EmptyState>
            )}
            {!students.error && (
              <StudentPagination
                locale={locale}
                href={`/${locale}/teacher/groups/${id}`}
                page={rosterPage}
                pageCount={rosterPageCount}
                labels={pageLabels}
                pageParam="roster_page"
                preserve={{ page: page > 1 ? page : undefined }}
              />
            )}
          </Panel>
        </section>

        <section id="lessons" aria-labelledby="lessons-heading" className={sectionClass}>
          <div className="grid gap-6">
            <Panel>
              <h2 id="lessons-heading" className="mb-4 text-xl font-black text-teal">
                {copy.lessons}
              </h2>
              {lessonsFailed ? (
                <>
                  <p role="alert" className="text-sm text-danger">
                    {copy.lessonsError}
                  </p>
                  <a
                    href={`/${locale}/teacher/groups/${id}?retry=1`}
                    className="mt-3 inline-flex font-bold text-orange underline"
                  >
                    {ar ? 'إعادة المحاولة' : 'Try again'}
                  </a>
                </>
              ) : lessons.data?.length ? (
                <div className="grid gap-2">
                  {lessons.data.map(lesson => (
                    <RowLink
                      key={lesson.id}
                      href={`/${locale}/teacher/lessons/${lesson.id}`}
                      title={lesson.title}
                      meta={cairoDate(lesson.starts_at, locale)}
                      trailing={<Status value={lesson.status} locale={locale} />}
                    />
                  ))}
                </div>
              ) : (
                <EmptyState>{copy.noLessons}</EmptyState>
              )}
              <StudentPagination
                locale={locale}
                href={`/${locale}/teacher/groups/${id}`}
                page={page}
                pageCount={lessonPageCount}
                labels={pageLabels}
                pageParam="page"
                preserve={{ roster_page: rosterPage > 1 ? rosterPage : undefined }}
              />
            </Panel>
            {!archived && (
              <div className="grid gap-6 xl:grid-cols-2">
                <Panel>
                  <h3 className="mb-4 text-xl font-black text-teal">{copy.newLesson}</h3>
                  <LessonForm locale={locale} groupId={id} />
                </Panel>
                <Panel>
                  <h3 className="mb-4 text-xl font-black text-teal">{copy.generation}</h3>
                  {exclusions.error ? (
                    <p role="alert" className="text-sm text-danger">
                      {copy.exclusionsError}
                    </p>
                  ) : (
                    <GenerationPreviewForm
                      key={`${id}:${(slots.data ?? []).map(slot => `${slot.id}:${slot.weekday}:${slot.start_time}:${slot.end_time}`).join(',')}:${(exclusions.data ?? []).map(row => row.local_date).join(',')}`}
                      locale={locale}
                      groupId={id}
                      savedExclusions={(exclusions.data ?? []).map(row => row.local_date)}
                    />
                  )}
                </Panel>
              </div>
            )}
          </div>
        </section>

        <section
          id="announcements"
          aria-labelledby="announcements-heading"
          className={sectionClass}
        >
          <Panel>
            <h2 id="announcements-heading" className="text-xl font-black text-teal">
              {ar ? 'إعلان المجموعة' : 'Group announcement'}
            </h2>
            <p className="mt-1 text-sm text-muted">
              {ar
                ? 'انشر رسالة للطلاب المقبولين. يمكنهم قراءتها في صفحات المجموعة والحصص.'
                : 'Post a message for accepted students. They can read it on the group and lesson pages.'}
            </p>
            {archived && (
              <p className="mt-2 text-sm font-semibold text-muted">
                {ar
                  ? 'المجموعة مؤرشفة؛ يمكنك مراجعة الإعلان المحفوظ فقط.'
                  : 'This group is archived; you can review its saved announcement only.'}
              </p>
            )}
            <AnnouncementForm
              locale={locale}
              groupId={id}
              announcement={announcement}
              readOnly={archived}
            />
          </Panel>
        </section>

        <section id="assignments" aria-labelledby="assignments-heading" className={sectionClass}>
          <Panel>
            <h2 id="assignments-heading" className="text-xl font-black text-teal">
              {copy.assignmentsNav}
            </h2>
            <p className="mt-1 text-sm text-muted">{copy.assignmentsHint}</p>
            <Link
              href={`/${locale}/teacher/groups/${id}/assignments`}
              className={`${actionLink} mt-4 border border-line text-teal`}
            >
              {copy.openAssignments}
            </Link>
          </Panel>
        </section>
      </div>
    </>
  );
}
