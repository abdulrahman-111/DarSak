import Link from 'next/link';
import { notFound } from 'next/navigation';
import {
  BookOpen,
  CalendarDays,
  ChevronRight,
  FolderOpen,
  GraduationCap,
  UserRound,
  Activity,
  ClipboardList,
} from 'lucide-react';
import { ensureLocale } from '@/i18n/config';
import { studentClassWorkspace } from '@/features/student/class-workspace-data';
import { CLASS_VIEWS, classHref } from '@/features/student/class-workspace-domain';
import {
  ClassMark,
  StudentEmpty,
  StudentHeading,
  studentCard,
} from '@/features/student/workspace-ui';
import { Status, cairoDate, weekday } from '@/components/platform/ui';
import { StudentPagination } from '@/features/student/pagination';
import { DownloadForm, EnrollmentForm } from '@/features/student/forms';
import { safeLink } from '@/features/student/domain';
import { feeLabel } from '@/features/teacher/group-learning-domain';
import { AnnouncementView } from '@/features/groups/announcement-view';
import { GroupFeedbackSection } from '@/features/feedback/group-section';
import { StudentTeacherContactCard } from '@/features/student/teacher-contact-card';
import { StudentAssignments } from '@/features/assignments/views';

export default async function StudentClassPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string; id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const [{ locale: raw, id }, rawQuery] = await Promise.all([params, searchParams]);
  const query = Object.fromEntries(
    Object.entries(rawQuery).map(([key, value]) => [key, Array.isArray(value) ? value[0] : value]),
  );
  const locale = ensureLocale(raw),
    ar = locale === 'ar';
  const data = await studentClassWorkspace(locale, id, query);
  if (!data) notFound();
  const { group, view } = data,
    base = `/${locale}/student/classes/${id}`;
  const titles = ar
    ? {
        overview: 'نظرة عامة',
        lessons: 'الحصص',
        materials: 'المواد',
        assignments: 'الواجبات',
        teacher: 'المعلم والتواصل',
        progress: 'الحضور والتقييم',
      }
    : {
        overview: 'Overview',
        lessons: 'Lessons',
        materials: 'Materials',
        assignments: 'Assignments',
        teacher: 'Teacher & contact',
        progress: 'Attendance & feedback',
      };
  const icons = {
    overview: GraduationCap,
    lessons: CalendarDays,
    materials: FolderOpen,
    assignments: ClipboardList,
    teacher: UserRound,
    progress: Activity,
  };
  const labels = ar
    ? { previous: 'السابق', next: 'التالي', page: 'صفحة' }
    : { previous: 'Previous', next: 'Next', page: 'Page' };
  const subject = ar
    ? group.subject.name_ar || group.subject.name_en
    : group.subject.name_en || group.subject.name_ar;
  const category = ar
    ? group.category.name_ar || group.category.name_en
    : group.category.name_en || group.category.name_ar;
  const welcome = query.welcome === '1';
  const attendanceNames = ar
    ? { present: 'حاضر', late: 'متأخر', absent: 'غائب', excused: 'معذور' }
    : { present: 'Present', late: 'Late', absent: 'Absent', excused: 'Excused' };
  const feedbackOffset =
    Math.floor(Math.min(500000, Math.max(0, Number(query.feedback) || 0)) / 10) * 10;
  return (
    <div className="screen-enter">
      <Link
        href={`/${locale}/student/classes`}
        className="mb-5 inline-flex min-h-11 items-center gap-2 text-sm font-semibold text-muted hover:text-teal"
      >
        <BookOpen size={16} />
        {ar ? 'مجموعاتي' : 'My classes'}
      </Link>
      <StudentHeading
        eyebrow={[subject, category].filter(Boolean).join(' · ')}
        title={group.name}
        description={group.teacher_name}
        action={<ClassMark name={group.name} size={52} />}
      />
      {group.status === 'archived' && (
        <p className="mb-5 rounded-xl border border-orange/20 bg-orange/5 p-4 text-sm text-ink">
          {ar
            ? 'هذه المجموعة مؤرشفة. يمكنك مراجعة حصصك وموادك وسجل حضورك.'
            : 'This class is archived. Your lesson history, materials and attendance remain available.'}
        </p>
      )}
      <nav
        aria-label={ar ? 'أقسام المجموعة' : 'Class sections'}
        className="mb-6 flex max-w-full gap-1 overflow-x-auto border-b border-line pb-1"
      >
        {CLASS_VIEWS.map(key => {
          const Icon = icons[key];
          return (
            <Link
              key={key}
              href={classHref(locale, id, key)}
              aria-current={view === key ? 'page' : undefined}
              className={`inline-flex min-h-12 shrink-0 items-center gap-2 rounded-t-xl px-4 text-sm font-bold transition-colors ${view === key ? 'border-b-2 border-teal bg-teal/5 text-teal' : 'text-muted hover:bg-white hover:text-teal'}`}
            >
              <Icon size={17} aria-hidden="true" />
              {titles[key]}
            </Link>
          );
        })}
      </nav>
      {data.error ? (
        <section className={studentCard}>
          <p role="alert" className="text-sm text-danger">
            {ar
              ? 'تعذر تحميل هذا القسم بالكامل. حدّث الصفحة للمحاولة مجددًا.'
              : 'This section could not be fully loaded. Refresh to try again.'}
          </p>
          <Link
            href={classHref(locale, id, view)}
            className="mt-3 inline-flex min-h-11 items-center font-bold text-teal underline"
          >
            {ar ? 'إعادة المحاولة' : 'Try again'}
          </Link>
        </section>
      ) : (
        <>
          {view === 'overview' && group.teacher_available && (
            <div className="mb-5 max-w-2xl">
              <StudentTeacherContactCard
                locale={locale}
                groupName={group.name}
                teacherName={group.teacher_name}
                teacherHeadline={group.teacher_headline}
                teacherAvailable={group.teacher_available}
                contacts={data.contacts}
              />
            </div>
          )}
          {view === 'overview' && (
            <div className="grid gap-5 xl:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]">
              <div className="grid content-start gap-5">
                {data.next ? (
                  <section className={`${studentCard} border-teal/20`}>
                    <p className="mb-3 text-xs font-bold uppercase tracking-wider text-muted">
                      {ar ? 'حصتك القادمة' : 'Your next lesson'}
                    </p>
                    <h2 className="text-xl font-bold text-teal">{data.next.title}</h2>
                    <p className="mt-2 text-sm text-muted">
                      {cairoDate(data.next.starts_at, locale)}
                    </p>
                    <Link
                      href={`/${locale}/student/lessons/${data.next.id}`}
                      className="mt-5 inline-flex min-h-11 items-center gap-2 rounded-xl bg-teal px-4 text-sm font-bold text-white"
                    >
                      {ar ? 'الاستعداد للحصة' : 'Prepare for lesson'}
                      <ChevronRight size={16} className="rtl:rotate-180" />
                    </Link>
                  </section>
                ) : (
                  <StudentEmpty
                    title={ar ? 'لا توجد حصة قادمة بعد' : 'No upcoming lesson yet'}
                    description={
                      ar
                        ? 'ستجد المواعيد هنا بمجرد أن يضيفها المعلم. حصصك السابقة محفوظة في قسم الحصص.'
                        : 'New lesson dates will appear here when your teacher adds them. Past lessons are in the Lessons section.'
                    }
                    href={classHref(locale, id, 'lessons')}
                    label={ar ? 'عرض الحصص' : 'View lessons'}
                    icon="next-session-time"
                  />
                )}
                <AnnouncementView locale={locale} announcement={data.announcement} />
                <section className={studentCard}>
                  <h2 className="font-bold text-teal">{ar ? 'عن مجموعتك' : 'About your class'}</h2>
                  <p className="mt-3 whitespace-pre-wrap break-words text-sm leading-7 text-muted">
                    {group.description ||
                      (ar
                        ? 'لم يضف المعلم وصفًا بعد.'
                        : 'Your teacher has not added a description yet.')}
                  </p>
                  {group.learning?.outcomes && (
                    <>
                      <h3 className="mt-5 font-bold text-teal">
                        {ar ? 'ما ستتعلمه' : 'What you will learn'}
                      </h3>
                      <p className="mt-2 whitespace-pre-wrap break-words text-sm leading-7 text-muted">
                        {group.learning.outcomes}
                      </p>
                    </>
                  )}
                  {group.learning?.prerequisites && (
                    <>
                      <h3 className="mt-5 font-bold text-teal">
                        {ar ? 'الاستعداد للتعلم' : 'Getting ready'}
                      </h3>
                      <p className="mt-2 whitespace-pre-wrap break-words text-sm leading-7 text-muted">
                        {group.learning.prerequisites}
                      </p>
                    </>
                  )}
                </section>
              </div>
              <div className="grid content-start gap-5">
                <section className={studentCard}>
                  <h2 className="flex items-center gap-2 font-bold text-teal">
                    <CalendarDays size={18} />
                    {ar ? 'المواعيد الأسبوعية' : 'Weekly class times'}
                  </h2>
                  <p className="mt-2 text-xs leading-5 text-muted">
                    {ar
                      ? 'بتوقيت القاهرة. راجع الحصص للتواريخ الفعلية والتغييرات.'
                      : 'Cairo time. Check Lessons for actual dates and changes.'}
                  </p>
                  {data.slots.length ? (
                    <ul className="mt-4 divide-y divide-line">
                      {data.slots.map(slot => (
                        <li
                          key={slot.id}
                          className="flex flex-wrap justify-between gap-2 py-3 text-sm"
                        >
                          <span>{weekday(slot.weekday, locale)}</span>
                          <span dir="ltr" className="font-semibold">
                            {slot.start_time.slice(0, 5)} – {slot.end_time.slice(0, 5)}
                          </span>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="mt-4 text-sm text-muted">
                      {ar ? 'لم يُحدد جدول أسبوعي بعد.' : 'No weekly times have been set yet.'}
                    </p>
                  )}
                </section>
                <section className={studentCard}>
                  <h2 className="font-bold text-teal">
                    {ar ? 'تفاصيل التعلم' : 'Learning details'}
                  </h2>
                  <dl className="mt-4 grid gap-4 text-sm">
                    <div>
                      <dt className="text-muted">{ar ? 'طريقة التعلم' : 'Format'}</dt>
                      <dd className="mt-1 font-semibold">
                        {group.learning?.delivery_mode
                          ? (ar
                              ? { online: 'عن بُعد', in_person: 'حضوري', hybrid: 'حضوري وعن بُعد' }
                              : { online: 'Online', in_person: 'In person', hybrid: 'Hybrid' })[
                              group.learning.delivery_mode
                            ]
                          : ar
                            ? 'اسأل المعلم'
                            : 'Ask your teacher'}
                      </dd>
                    </div>
                    {group.location && (
                      <div>
                        <dt className="text-muted">{ar ? 'المكان' : 'Location'}</dt>
                        <dd className="mt-1 break-words">{group.location}</dd>
                      </div>
                    )}
                    <div>
                      <dt className="text-muted">{ar ? 'رسوم المجموعة' : 'Class fee'}</dt>
                      <dd className="mt-1">
                        {group.learning?.fee_egp !== null && group.learning?.fee_egp !== undefined
                          ? feeLabel(locale, group.learning)
                          : ar
                            ? 'اسأل معلمك عن رسوم المجموعة.'
                            : 'Ask your teacher about class fees.'}
                      </dd>
                    </div>
                    {group.learning?.fee_includes && (
                      <div>
                        <dt className="text-muted">{ar ? 'ما تتضمنه المجموعة' : 'Included'}</dt>
                        <dd className="mt-1 whitespace-pre-wrap break-words">
                          {group.learning.fee_includes}
                        </dd>
                      </div>
                    )}
                  </dl>
                </section>
              </div>
            </div>
          )}
          {view === 'lessons' && (
            <section>
              <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
                <h2 className="text-lg font-bold text-teal">{ar ? 'حصصك' : 'Your lessons'}</h2>
                <nav
                  aria-label={ar ? 'فترة الحصص' : 'Lesson period'}
                  className="flex rounded-xl border border-line bg-white p-1"
                >
                  {(['upcoming', 'history'] as const).map(key => (
                    <Link
                      key={key}
                      aria-current={data.lessonView === key ? 'page' : undefined}
                      href={`${base}?view=lessons&lessons=${key}`}
                      className={`inline-flex min-h-11 items-center rounded-lg px-4 text-sm font-semibold ${data.lessonView === key ? 'bg-teal text-white' : 'text-muted'}`}
                    >
                      {key === 'upcoming'
                        ? ar
                          ? 'القادمة'
                          : 'Upcoming'
                        : ar
                          ? 'السابقة'
                          : 'History'}
                    </Link>
                  ))}
                </nav>
              </div>
              {data.lessons.length ? (
                <div className="grid gap-3">
                  {data.lessons.map(lesson => {
                    const attendance = data.attendance.find(a => a.lesson_id === lesson.id);
                    return (
                      <Link
                        key={lesson.id}
                        href={`/${locale}/student/lessons/${lesson.id}`}
                        className={`${studentCard} flex items-center gap-4 transition-colors hover:border-teal/40`}
                      >
                        <span className="hidden rounded-xl bg-teal/5 p-3 text-teal sm:block">
                          <CalendarDays size={21} />
                        </span>
                        <div className="min-w-0 flex-1">
                          <h3 className="break-words font-bold text-teal">{lesson.title}</h3>
                          <p className="mt-1 text-sm text-muted">
                            {cairoDate(lesson.starts_at, locale)}
                          </p>
                          {attendance && (
                            <p className="mt-2 text-xs text-muted">
                              {ar ? 'الحضور: ' : 'Attendance: '}
                              {attendanceNames[attendance.status as keyof typeof attendanceNames]}
                            </p>
                          )}
                        </div>
                        <Status value={lesson.status} locale={locale} />
                        <ChevronRight size={16} className="shrink-0 text-muted rtl:rotate-180" />
                      </Link>
                    );
                  })}
                </div>
              ) : (
                <StudentEmpty
                  title={ar ? 'لا توجد حصص في هذا القسم' : 'No lessons in this section'}
                  description={
                    data.lessonView === 'upcoming'
                      ? ar
                        ? 'ستظهر المواعيد الجديدة هنا. يمكنك مراجعة الحصص السابقة من «السابقة».'
                        : 'New dates will appear here. Use History to revisit earlier lessons.'
                      : ar
                        ? 'ستجد الحصص السابقة ومواردها هنا بعد انتهاء موعدها.'
                        : 'Past lessons and their resources will appear here after their scheduled time.'
                  }
                />
              )}
              <StudentPagination
                locale={locale}
                href={base}
                page={data.page}
                pageCount={data.pageCount}
                labels={labels}
                preserve={{ view: 'lessons', lessons: data.lessonView }}
              />
            </section>
          )}
          {view === 'materials' && (
            <section>
              <div className="mb-5 flex flex-wrap justify-between gap-3">
                <h2 className="text-lg font-bold text-teal">
                  {ar ? 'مواد المجموعة' : 'Class materials'}
                </h2>
                <form className="flex max-w-full gap-2">
                  <input type="hidden" name="view" value="materials" />
                  <input
                    name="q"
                    defaultValue={query.q ?? ''}
                    aria-label={ar ? 'ابحث في المواد' : 'Search class materials'}
                    placeholder={ar ? 'ابحث في المواد' : 'Search materials'}
                    maxLength={100}
                    className="min-w-0 rounded-xl border border-line bg-white px-3 py-2 text-sm"
                  />
                  <button className="min-h-11 rounded-xl bg-teal px-4 text-sm font-bold text-white">
                    {ar ? 'بحث' : 'Search'}
                  </button>
                </form>
              </div>
              {data.resources.length ? (
                <div className="grid gap-4 sm:grid-cols-2">
                  {data.resources.map(r => (
                    <article key={r.id} className={studentCard}>
                      <FolderOpen size={22} className="mb-3 text-teal" />
                      <h3 className="break-words font-bold text-teal">{r.title}</h3>
                      <Link
                        href={`/${locale}/student/lessons/${r.lesson_id}`}
                        className="mt-2 inline-flex min-h-11 items-center text-xs text-muted underline"
                      >
                        {r.lesson_title}
                      </Link>
                      {r.kind === 'note' && (
                        <p className="mt-3 whitespace-pre-wrap break-words text-sm leading-6">
                          {r.content}
                        </p>
                      )}
                      {r.kind === 'link' && safeLink(r.url) && (
                        <a
                          href={safeLink(r.url)!}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="mt-3 flex min-h-11 items-center font-bold text-teal underline"
                        >
                          {ar ? 'فتح المورد' : 'Open resource'}
                        </a>
                      )}
                      {r.kind === 'file' && <DownloadForm locale={locale} id={r.id} />}
                    </article>
                  ))}
                </div>
              ) : (
                <StudentEmpty
                  title={
                    query.q
                      ? ar
                        ? 'لا توجد نتائج'
                        : 'No matching materials'
                      : ar
                        ? 'المواد ستظهر هنا'
                        : 'Your materials will appear here'
                  }
                  description={
                    query.q
                      ? ar
                        ? 'جرب كلمة أخرى أو امسح البحث.'
                        : 'Try another word or clear the search.'
                      : ar
                        ? 'سيشارك معلمك روابط التعلم هنا، مرتبطة بالحصة المناسبة.'
                        : 'Your teacher will share learning links here, organized by lesson.'
                  }
                />
              )}
              <StudentPagination
                locale={locale}
                href={base}
                page={data.page}
                pageCount={data.pageCount}
                labels={labels}
                preserve={{ view: 'materials', q: query.q }}
              />
            </section>
          )}
          {view === 'assignments' && (
            <section className="grid min-w-0 gap-4">
              <div>
                <h2 className="text-lg font-bold text-teal">
                  {ar ? 'واجبات مجموعتك' : 'Class assignments'}
                </h2>
                <p className="mt-1 text-sm leading-6 text-muted">
                  {ar
                    ? 'تظهر الواجبات النشطة لجميع الطلاب المقبولين. لا يرى رابطك وملاحظتك وتعليقات المعلم الخاصة إلا أنت ومعلمك.'
                    : 'Active assignments are available to all accepted students. Only you and your teacher can see your submitted link, note, and private feedback.'}
                </p>
              </div>
              <StudentAssignments
                locale={locale}
                assignments={data.assignments}
                groupStatus={group.status}
              />
              <StudentPagination
                locale={locale}
                href={base}
                page={data.page}
                pageCount={data.pageCount}
                labels={labels}
                preserve={{ view: 'assignments' }}
              />
            </section>
          )}
          {view === 'teacher' &&
            (group.teacher_available ? (
              <div className="max-w-2xl">
                <StudentTeacherContactCard
                  locale={locale}
                  groupName={group.name}
                  teacherName={group.teacher_name}
                  teacherHeadline={group.teacher_headline}
                  teacherAvailable={group.teacher_available}
                  contacts={data.contacts}
                  welcome={welcome}
                />
              </div>
            ) : (
              <section className={`${studentCard} max-w-2xl`}>
                <div className="flex items-center gap-4">
                  <ClassMark name={group.teacher_name} size={56} />
                  <div className="min-w-0">
                    <h2 className="break-words text-xl font-bold text-teal">
                      {group.teacher_name}
                    </h2>
                    <p className="mt-1 text-sm text-muted">{group.teacher_headline}</p>
                  </div>
                </div>
                <p className="mt-5 rounded-xl bg-cream p-4 text-sm leading-6 text-muted">
                  {ar
                    ? 'التواصل المباشر غير متاح حاليًا. يمكنك الاستمرار في مراجعة سجل تعلمك.'
                    : 'Direct contact is currently unavailable. You can continue reviewing your learning history.'}
                </p>
              </section>
            ))}
          {view === 'progress' && (
            <section>
              <h2 className="mb-4 text-lg font-bold text-teal">
                {ar ? 'سجل حضورك' : 'Your attendance record'}
              </h2>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                {(Object.keys(attendanceNames) as (keyof typeof attendanceNames)[]).map(key => (
                  <div key={key} className={studentCard}>
                    <p className="text-sm text-muted">{attendanceNames[key]}</p>
                    <p className="mt-2 text-2xl font-bold text-teal">{group.attendance[key]}</p>
                  </div>
                ))}
              </div>
              <p className="mt-3 text-sm leading-6 text-muted">
                {ar
                  ? 'يسجل المعلم الحضور بعد بدء الحصة. الحصص التي لم يسجل حضورها لا تُحسب غيابًا.'
                  : 'Your teacher records attendance after lessons start. Lessons without a record are not counted as absences.'}
              </p>
              <div id="feedback">
                <GroupFeedbackSection
                  db={data.me.db}
                  locale={locale}
                  groupId={id}
                  isStudent
                  offset={feedbackOffset}
                  basePath={`${base}?view=progress`}
                />
              </div>
            </section>
          )}
        </>
      )}
      <details className="mt-8 border-t border-line pt-4">
        <summary className="inline-flex min-h-11 cursor-pointer items-center text-sm font-semibold text-muted">
          {ar ? 'إدارة التسجيل' : 'Manage enrollment'}
        </summary>
        <div className="mt-3 max-w-xl rounded-xl border border-line bg-white p-4">
          <EnrollmentForm locale={locale} id={group.enrollment_id} kind="cancel" returnToClasses />
        </div>
      </details>
    </div>
  );
}
