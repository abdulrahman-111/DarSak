import Image from 'next/image';
import Link from 'next/link';
import { ArrowUpRight, CalendarDays, Clock3, FolderOpen, ArrowRight } from 'lucide-react';
import { ensureLocale } from '@/i18n/config';
import { studentDashboard } from '@/features/student/data';
import { requireViewer } from '@/components/platform/access';
import {
  ClassMark,
  StudentEmpty,
  StudentHeading,
  studentCard,
} from '@/features/student/workspace-ui';
import { normalizeTimetableWeek, timetableDayDates } from '@/features/student/timetable-domain';
import {
  lessonCountdown,
  lessonDateTile,
  lessonTimeRange,
} from '@/components/platform/lesson-time';
import { pluralize } from '@/lib/plural';
export default async function StudentDashboard({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale: raw } = await params,
    locale = ensureLocale(raw),
    ar = locale === 'ar',
    me = await requireViewer(locale, 'student'),
    data = await studentDashboard(locale);
  const now = new Date(),
    week = normalizeTimetableWeek(null, now),
    days = timetableDayDates(week.weekStart),
    next = data.lessons[0],
    live = next && new Date(next.starts_at) <= now && new Date(next.ends_at) > now;
  const nextGroup = next
    ? Array.isArray(next.group)
      ? next.group[0]?.name
      : next.group?.name
    : null;
  const firstName = me.fullName.trim().split(/\s+/)[0] || me.fullName;
  const countdown = next ? lessonCountdown(next.starts_at, next.ends_at, locale, now) : null;
  const lessonDays = new Set(data.occupiedDays);
  const lessonGroup = (lesson: (typeof data.lessons)[number]) =>
    Array.isArray(lesson.group) ? lesson.group[0]?.name : lesson.group?.name;
  return (
    <div className="student-workspace screen-enter">
      <StudentHeading
        eyebrow={new Intl.DateTimeFormat(ar ? 'ar-EG' : 'en-GB', {
          dateStyle: 'full',
          timeZone: 'Africa/Cairo',
        }).format(now)}
        title={ar ? `أهلاً، ${firstName}` : `Welcome back, ${firstName}`}
        description={
          ar
            ? 'مساحة واضحة لمتابعة تعلمك، خطوة بخطوة.'
            : 'A little clarity for your learning day. Everything you need, easy to find.'
        }
      />
      {data.error ? (
        <section className={studentCard}>
          <p role="alert" className="text-sm text-danger">
            {ar
              ? 'تعذر تحميل مساحة التعلم. حدّث الصفحة للمحاولة مجددًا.'
              : 'Could not load your learning space. Refresh to try again.'}
          </p>
        </section>
      ) : (
        <>
          <div className="grid gap-6 xl:grid-cols-[minmax(0,1.7fr)_minmax(260px,1fr)]">
            <div className="grid content-start gap-6">
              <section className="student-hero relative overflow-hidden rounded-3xl bg-teal p-4 text-white sm:p-7">
                <div
                  aria-hidden="true"
                  className="pointer-events-none absolute -end-8 -top-12 size-44 rounded-full border-[24px] border-white/5"
                />
                <div className="relative min-w-0">
                  <div className="flex min-w-0 items-start justify-between gap-3">
                    <p className="flex min-w-0 items-center gap-2 wrap-break-word text-xs font-bold uppercase tracking-wider text-white/75 [overflow-wrap:anywhere]">
                      <span
                        className={`size-2 shrink-0 rounded-full ${live ? 'bg-emerald-300' : 'bg-white/70'}`}
                      />
                      {live
                        ? ar
                          ? 'الحصة جارية الآن'
                          : 'Happening now'
                        : ar
                          ? 'خطوتك التالية'
                          : 'Your next step'}
                    </p>
                    <Image
                      src="/brand/darsak/favicon.svg"
                      width={38}
                      height={38}
                      alt=""
                      className="shrink-0 rounded-xl bg-white/10"
                    />
                  </div>
                  {next ? (
                    <>
                      <p className="mt-4 wrap-break-word text-sm text-white/70 [overflow-wrap:anywhere]">
                        {nextGroup}
                      </p>
                      <h2 className="mt-2 wrap-break-word text-2xl font-bold [overflow-wrap:anywhere] sm:text-3xl">
                        {next.title}
                      </h2>
                      <div className="mt-4 flex min-w-0 flex-wrap items-center gap-x-3 gap-y-2 text-sm leading-6 text-white/85">
                        {countdown && (
                          <span
                            className={`inline-flex min-h-8 items-center rounded-full px-3 text-xs font-bold ${live || countdown.kind === 'soon' ? 'bg-white text-teal' : 'bg-white/10 text-white'}`}
                          >
                            {countdown.label}
                          </span>
                        )}
                        <span className="inline-flex min-w-0 items-center gap-2 wrap-break-word [overflow-wrap:anywhere]">
                          <CalendarDays size={17} aria-hidden="true" className="shrink-0" />
                          {lessonDateTile(next.starts_at, locale).label} ·{' '}
                          {lessonTimeRange(next.starts_at, next.ends_at, locale)}
                        </span>
                      </div>
                      <Link
                        href={`/${locale}/student/lessons/${next.id}`}
                        className="mt-5 inline-flex min-h-12 max-w-full items-center gap-3 rounded-xl bg-white px-4 text-sm font-bold text-teal transition-colors hover:bg-cream sm:px-5"
                      >
                        {live
                          ? ar
                            ? 'افتح الحصة الآن'
                            : 'Open lesson now'
                          : ar
                            ? 'افتح الحصة واستعد'
                            : 'Open lesson & get ready'}
                        <ArrowRight size={17} className="shrink-0 rtl:rotate-180" />
                      </Link>
                    </>
                  ) : (
                    <>
                      <h2 className="mt-4 max-w-lg wrap-break-word text-2xl font-bold leading-snug [overflow-wrap:anywhere] sm:mt-5 sm:text-3xl">
                        {data.acceptedCount
                          ? ar
                            ? 'جاهز للحصة القادمة؟'
                            : 'Ready for what’s next?'
                          : ar
                            ? 'رحلة تعلم جديدة تبدأ هنا'
                            : 'Your next learning chapter starts here'}
                      </h2>
                      <p className="mt-3 max-w-lg wrap-break-word text-sm leading-7 text-white/80 [overflow-wrap:anywhere]">
                        {data.acceptedCount
                          ? ar
                            ? 'لا توجد حصة قادمة الآن. افتح مجموعتك لمراجعة المواد أو متابعة إعلانات المعلم.'
                            : 'No lesson is scheduled yet. Open a class to revisit materials and check your teacher’s updates.'
                          : ar
                            ? 'اكتشف معلمًا ومجموعة يناسبان أهدافك. بعد قبول انضمامك، ستجد حصصك وموادك هنا.'
                            : 'Find a teacher and group that fit your goals. Once you’re accepted, your lessons and resources will be right here.'}
                      </p>
                      <Link
                        href={`/${locale}/${data.acceptedCount ? 'student/classes' : 'teachers'}`}
                        className="mt-5 inline-flex min-h-12 max-w-full items-center gap-3 rounded-xl bg-white px-4 text-sm font-bold text-teal sm:px-5"
                      >
                        {data.acceptedCount
                          ? ar
                            ? 'افتح مجموعاتي'
                            : 'Open my classes'
                          : ar
                            ? 'اكتشف فرص التعلم'
                            : 'Explore learning groups'}
                        <ArrowRight size={17} className="shrink-0 rtl:rotate-180" />
                      </Link>
                    </>
                  )}
                  <div className="mt-6 flex flex-wrap gap-x-5 gap-y-2 border-t border-white/15 pt-4 text-xs text-white/80">
                    <span>
                      {pluralize(
                        locale,
                        data.acceptedCount,
                        ar
                          ? {
                              zero: 'لا توجد مجموعات مسجل بها',
                              one: 'مجموعة واحدة مسجل بها',
                              two: 'مجموعتان مسجل بهما',
                              few: '{n} مجموعات مسجل بها',
                              other: '{n} مجموعة مسجل بها',
                            }
                          : { one: '{n} enrolled class', other: '{n} enrolled classes' },
                      )}
                    </span>
                    {data.pendingCount > 0 && (
                      <Link
                        href={`/${locale}/student/classes`}
                        className="inline-flex min-h-11 items-center gap-1.5 underline underline-offset-4"
                      >
                        <Clock3 size={13} aria-hidden="true" />
                        {pluralize(
                          locale,
                          data.pendingCount,
                          ar
                            ? {
                                one: 'طلب واحد قيد المراجعة',
                                two: 'طلبان قيد المراجعة',
                                few: '{n} طلبات قيد المراجعة',
                                other: '{n} طلبًا قيد المراجعة',
                              }
                            : {
                                one: '{n} request awaiting review',
                                other: '{n} requests awaiting review',
                              },
                        )}
                      </Link>
                    )}
                  </div>
                </div>
              </section>
              <section className="min-w-0">
                <div className="mb-4 flex min-w-0 flex-wrap items-center justify-between gap-2">
                  <h2 className="min-w-0 wrap-break-word text-lg font-bold text-teal [overflow-wrap:anywhere]">
                    {ar ? 'مجموعاتي' : 'My classes'}
                  </h2>
                  <div className="flex shrink-0 flex-wrap items-center gap-3">
                    <Link
                      href={`/${locale}/student/recommendations`}
                      className="inline-flex min-h-11 items-center gap-1 text-sm font-semibold text-muted hover:text-teal"
                    >
                      {ar ? 'اقتراحات المجموعات' : 'Group suggestions'}
                      <ArrowUpRight size={15} aria-hidden="true" className="rtl:-scale-x-100" />
                    </Link>
                    {data.acceptedCount > 0 && (
                      <Link
                        href={`/${locale}/student/classes`}
                        className="inline-flex min-h-11 shrink-0 items-center gap-1 text-sm font-semibold text-muted hover:text-teal"
                      >
                        {ar ? 'عرض الكل' : 'View all'}
                        <ArrowUpRight size={15} aria-hidden="true" className="rtl:-scale-x-100" />
                      </Link>
                    )}
                  </div>
                </div>
                {data.classes.length ? (
                  <div className="grid min-w-0 gap-4 sm:grid-cols-2">
                    {data.classes.map(item => (
                      <Link
                        key={item.id}
                        href={`/${locale}/student/classes/${item.group_id}`}
                        className={`${studentCard} student-card group`}
                      >
                        <div className="flex items-start justify-between gap-3">
                          <ClassMark name={item.group?.name ?? 'D'} />
                          <ArrowUpRight
                            size={17}
                            aria-hidden="true"
                            className="text-muted transition-transform motion-safe:group-hover:-translate-y-0.5 rtl:-scale-x-100"
                          />
                        </div>
                        <h3 className="mt-4 wrap-break-word font-bold text-teal [overflow-wrap:anywhere]">
                          {item.group?.name || (ar ? 'مجموعتك التعليمية' : 'Your learning class')}
                        </h3>
                        <p className="mt-2 wrap-break-word text-xs text-muted [overflow-wrap:anywhere]">
                          {item.group?.status === 'archived'
                            ? ar
                              ? 'سجل التعلم والمواد'
                              : 'Learning history & resources'
                            : ar
                              ? 'الحصص · المواد · المعلم'
                              : 'Lessons · Materials · Teacher'}
                        </p>
                      </Link>
                    ))}
                  </div>
                ) : (
                  <StudentEmpty
                    title={ar ? 'لا توجد مجموعات بعد' : 'No classes yet'}
                    description={
                      data.pendingCount
                        ? ar
                          ? 'ستظهر مجموعاتك هنا بعد قبول الطلبات.'
                          : 'Your classes will appear here once your requests are accepted.'
                        : ar
                          ? 'ستظهر مجموعتك الأولى هنا بمجرد قبول انضمامك.'
                          : 'Your first class will appear here once your enrollment is accepted.'
                    }
                    href={`/${locale}/${data.pendingCount ? 'student/classes' : 'teachers'}`}
                    label={
                      data.pendingCount
                        ? ar
                          ? 'تابع طلباتي'
                          : 'Track my requests'
                        : ar
                          ? 'اكتشف المجموعات'
                          : 'Find a group'
                    }
                    icon="find-a-group"
                  />
                )}
              </section>
            </div>
            <div className="grid content-start gap-5">
              <section className={studentCard}>
                <div className="flex items-center justify-between gap-2">
                  <h2 className="flex items-center gap-2 font-bold text-teal">
                    <CalendarDays size={18} />
                    {ar ? 'أسبوعك الدراسي' : 'Your learning week'}
                  </h2>
                  <Link
                    href={`/${locale}/timetable`}
                    aria-label={ar ? 'افتح الجدول الدراسي' : 'Open timetable'}
                    className="grid size-11 place-items-center rounded-xl text-teal hover:bg-cream"
                  >
                    <ArrowUpRight size={18} aria-hidden="true" className="rtl:-scale-x-100" />
                  </Link>
                </div>
                <nav
                  aria-label={ar ? 'أيام هذا الأسبوع' : 'Days this week'}
                  className="mt-4 grid grid-cols-7 gap-0 sm:gap-1"
                >
                  {days.map(day => (
                    <Link
                      key={day.date}
                      href={`/${locale}/timetable?week=${week.weekStart}&day=${day.date}`}
                      aria-current={day.date === week.today ? 'date' : undefined}
                      aria-label={
                        new Intl.DateTimeFormat(ar ? 'ar-EG' : 'en-GB', {
                          dateStyle: 'full',
                          timeZone: 'UTC',
                        }).format(new Date(`${day.date}T12:00:00Z`)) +
                        (lessonDays.has(day.date) ? (ar ? '، يوجد حصة' : ', has a lesson') : '')
                      }
                      className={`relative flex min-h-16 min-w-0 flex-col items-center justify-center gap-1 rounded-xl text-[11px] transition-colors focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-orange sm:text-xs ${day.date === week.today ? 'bg-teal text-white' : 'text-muted hover:bg-cream'}`}
                    >
                      {lessonDays.has(day.date) && (
                        <span
                          aria-hidden="true"
                          className={`absolute bottom-1.5 size-1.5 rounded-full ${day.date === week.today ? 'bg-white' : 'bg-orange'}`}
                        />
                      )}
                      <span aria-hidden="true" className="max-w-full truncate px-0.5 font-semibold">
                        {new Intl.DateTimeFormat(ar ? 'ar-EG' : 'en-GB', {
                          weekday: 'short',
                          timeZone: 'UTC',
                        }).format(new Date(`${day.date}T12:00:00Z`))}
                      </span>
                      <strong>
                        {new Intl.NumberFormat(ar ? 'ar-EG' : 'en-GB').format(
                          Number(day.date.slice(-2)),
                        )}
                      </strong>
                    </Link>
                  ))}
                </nav>
                {data.calendarError && (
                  <p role="status" className="mt-3 text-xs leading-5 text-danger">
                    {ar
                      ? 'تعذر تحميل أيام الحصص لهذا الأسبوع.'
                      : 'Could not load lesson days for this week.'}
                  </p>
                )}
                <p className="mt-3 text-xs leading-5 text-muted">
                  {lessonDays.size > 0 &&
                    (ar ? 'النقطة تعني وجود حصة. ' : 'A dot marks a lesson day. ')}
                  {ar
                    ? 'اختر يومًا لعرض مواعيده بتوقيت القاهرة.'
                    : 'Choose a day to see its lessons in Cairo time.'}
                </p>
              </section>
              <section className={studentCard}>
                <h2 className="mb-4 font-bold text-teal">{ar ? 'قريبًا في جدولك' : 'Coming up'}</h2>
                {data.lessons.length > 1 ? (
                  <ul className="divide-y divide-line">
                    {data.lessons.slice(1, 4).map(lesson => {
                      const tile = lessonDateTile(lesson.starts_at, locale);
                      const group = lessonGroup(lesson);
                      return (
                        <li key={lesson.id}>
                          <Link
                            href={`/${locale}/student/lessons/${lesson.id}`}
                            className="group flex min-h-20 items-center gap-3 rounded-lg py-3"
                          >
                            <span className="grid w-12 shrink-0 place-items-center rounded-xl bg-teal/5 py-1.5 text-teal">
                              <span className="sr-only">{tile.fullLabel}</span>
                              <span aria-hidden="true">
                                <strong className="text-lg leading-none">{tile.day}</strong>
                                <span className="mt-1 block text-[11px] font-semibold text-muted">
                                  {tile.month}
                                </span>
                              </span>
                            </span>
                            <div className="min-w-0 flex-1">
                              <h3 className="wrap-break-word text-sm font-bold text-teal group-hover:underline">
                                {lesson.title}
                              </h3>
                              <p className="mt-1 text-xs leading-5 text-muted">
                                {tile.weekday} ·{' '}
                                {lessonTimeRange(lesson.starts_at, lesson.ends_at, locale)}
                              </p>
                              {group && (
                                <p className="truncate text-xs leading-5 text-muted">{group}</p>
                              )}
                            </div>
                          </Link>
                        </li>
                      );
                    })}
                  </ul>
                ) : (
                  <div>
                    <p className="text-sm leading-6 text-muted">
                      {ar ? 'لا توجد حصص أخرى مجدولة بعد.' : 'No other lessons are scheduled yet.'}
                    </p>
                    <Link
                      href={`/${locale}/timetable`}
                      className="mt-1 inline-flex min-h-11 items-center gap-1 text-sm font-semibold text-teal underline underline-offset-4"
                    >
                      {ar ? 'افتح الجدول الدراسي' : 'Open timetable'}
                    </Link>
                  </div>
                )}
              </section>
              <Link
                href={`/${locale}/student/materials`}
                className={`${studentCard} student-card flex items-center gap-4`}
              >
                <Image src="/brand/darsak/prepare-for-class.svg" width={44} height={44} alt="" />
                <span className="min-w-0 flex-1">
                  <strong className="block text-sm text-teal">
                    {ar ? 'مكتبة التعلم' : 'Your learning library'}
                  </strong>
                  <span className="mt-1 block text-xs leading-5 text-muted">
                    {ar
                      ? 'اعثر على الروابط والموارد التي شاركها معلموك.'
                      : 'Find the links and resources your teachers shared.'}
                  </span>
                </span>
                <FolderOpen size={18} className="text-muted" />
              </Link>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
