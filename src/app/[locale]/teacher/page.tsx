import Image from 'next/image';
import Link from 'next/link';
import {
  ArrowRight,
  ArrowUpRight,
  BellRing,
  CalendarDays,
  CalendarPlus,
  ClipboardCheck,
  ClipboardList,
  Clock3,
  Plus,
  UsersRound,
} from 'lucide-react';
import { ensureLocale } from '@/i18n/config';
import { EnrollmentDecisionButtons } from '@/components/platform/actions';
import { EmptyState, Status } from '@/components/platform/ui';
import {
  lessonCountdown,
  lessonDateTile,
  lessonTimeRange,
} from '@/components/platform/lesson-time';
import { teacherOverview } from '@/features/teacher/data';
import { requireViewer } from '@/components/platform/access';
import { readTeacherAccessStatus } from '@/features/teacher-access/data';
import { pluralize } from '@/lib/plural';

function groupName(group: unknown): string | null {
  const candidate = Array.isArray(group) ? group[0] : group;
  if (!candidate || typeof candidate !== 'object' || !('name' in candidate)) return null;
  return typeof candidate.name === 'string' && candidate.name.trim() ? candidate.name : null;
}

export default async function TeacherDashboard({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale: raw } = await params;
  const locale = ensureLocale(raw);
  const ar = locale === 'ar';
  const me = await requireViewer(locale, 'teacher');
  // The overview starts together with the access check (one round trip instead of two). It is
  // RLS-scoped to this teacher and is dropped unread when teaching access is paused.
  const [accessResult, overviewResult] = await Promise.allSettled([
    readTeacherAccessStatus(me.db),
    teacherOverview(locale),
  ]);
  if (accessResult.status === 'rejected') throw accessResult.reason;
  const access = accessResult.value;
  if (access.error || !access.status)
    return (
      <>
        <header className="mb-6">
          <p className="mb-2 text-xs font-bold uppercase tracking-wider text-muted">
            {ar ? 'مساحة المعلم' : 'Teacher workspace'}
          </p>
          <h1 className="text-2xl font-bold text-teal">
            {ar ? 'صلاحية التدريس' : 'Teaching access'}
          </h1>
        </header>
        <section className="rounded-3xl border border-line bg-white p-5 shadow-xs">
          <p role="alert" className="text-sm text-danger">
            {ar
              ? 'تعذر تحميل لوحة التدريس. حدّث الصفحة أو راجع إعدادات الوصول من حسابك.'
              : 'Could not load teaching access. Refresh or review access settings in your account.'}
          </p>
          <Link
            href={`/${locale}/account/teaching-access`}
            className="mt-3 inline-flex min-h-11 items-center font-bold text-teal underline"
          >
            {ar ? 'إعدادات الوصول' : 'Access settings'}
          </Link>
        </section>
      </>
    );
  if (!access.status.has_access)
    return (
      <>
        <header className="mb-6">
          <p className="mb-2 text-xs font-bold uppercase tracking-wider text-muted">
            {ar ? 'مساحة المعلم' : 'Teacher workspace'}
          </p>
          <h1 className="text-2xl font-bold text-teal">
            {ar ? 'صلاحية التدريس' : 'Teaching access'}
          </h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-muted">
            {ar
              ? 'يمكنك متابعة حسابك ومراجعة الطلبات والإشعارات أثناء توقف صلاحية التدريس.'
              : 'You can use your account and review your application and notifications while teaching access is paused.'}
          </p>
        </header>
        <section className="rounded-3xl border border-line bg-white p-5 shadow-xs">
          <h2 className="font-bold text-teal">
            {ar ? 'مراجعة إعدادات الحساب' : 'Review your account settings'}
          </h2>
          <p className="mt-2 text-sm text-muted">
            {ar
              ? 'راجع حالة طلبك وتفاصيل خطتك في حسابك.'
              : 'Review your application status and plan details in your account.'}
          </p>
          <Link
            href={`/${locale}/account`}
            className="mt-3 inline-flex min-h-11 items-center font-bold text-teal underline"
          >
            {ar ? 'فتح الحساب' : 'Open Account'}
          </Link>
        </section>
      </>
    );

  if (overviewResult.status === 'rejected') throw overviewResult.reason;
  const data = overviewResult.value;
  const now = new Date();
  const firstName = data.me.profile.full_name.trim().split(/\s+/)[0] || data.me.profile.full_name;
  const todayLessons = [...data.todayLessons].sort(
    (a, b) => Date.parse(a.starts_at) - Date.parse(b.starts_at),
  );
  const nextLesson = data.nextLesson;
  const countdown = nextLesson
    ? lessonCountdown(nextLesson.starts_at, nextLesson.ends_at, locale, now)
    : null;
  const happeningNow = countdown?.kind === 'live';
  const todayIds = new Set(todayLessons.map(lesson => lesson.id));
  const laterLessons = data.upcomingLessons
    .filter(lesson => !todayIds.has(lesson.id) && lesson.id !== nextLesson?.id)
    .slice(0, 4);
  const dateLabel = new Intl.DateTimeFormat(ar ? 'ar-EG' : 'en-GB', {
    dateStyle: 'full',
    timeZone: 'Africa/Cairo',
  }).format(now);
  const copy = ar
    ? {
        greeting: 'مرحباً',
        intro: 'نظرة واضحة على مجموعاتك وحصصك وطلبات الطلاب.',
        create: 'إنشاء مجموعة',
        addLesson: 'إضافة حصة',
        groups: 'المجموعات',
        requests: 'طلبات الانضمام',
        today: 'حصص اليوم',
        calendar: 'الحصص القادمة',
        next: 'حصتك القادمة',
        openWorkspace: 'افتح مساحة الحصة',
        openNow: 'افتح الحصة الآن',
        noNext: 'لا توجد حصة مجدولة قادمة.',
        todayHeading: 'جدول اليوم',
        noToday: 'لا توجد حصص اليوم.',
        openLesson: 'افتح الحصة',
        attendance: 'الحضور',
        materials: 'المواد',
        laterHeading: 'لاحقًا في جدولك',
        requestsHeading: 'طلبات تنتظر الرد',
        requestsWaiting: (count: number) =>
          pluralize('ar', count, {
            zero: 'لا توجد طلبات تنتظر ردك',
            one: 'طلب واحد ينتظر ردك',
            two: 'طلبان ينتظران ردك',
            few: '{n} طلبات تنتظر ردك',
            many: '{n} طلبًا ينتظر ردك',
            other: '{n} طلب ينتظر ردك',
          }),
        review: 'راجع الطلبات',
        viewAll: 'عرض الكل',
        noRequests: 'لا توجد طلبات تنتظر المراجعة.',
        setupHeading: 'خطوات الإعداد',
        setupIntro: 'أكمل هذه الخطوات ليجدك الطلاب وينضموا إلى مجموعاتك.',
        noTasks: 'اكتملت خطوات الإعداد الحالية.',
        task: {
          profile: 'أكمل ملفك العام',
          approval: 'طلب التدريس بانتظار مراجعة الإدارة',
          draft: 'استأنف إعداد المجموعة',
          schedule: 'أضف جدولاً أسبوعياً',
          lessons: 'أضف أول حصة قادمة',
        },
        failed: 'تعذر تحميل لوحة المعلم. حدّث الصفحة وحاول مرة أخرى.',
        retry: 'إعادة المحاولة',
      }
    : {
        greeting: 'Welcome',
        intro: 'A clear view of your groups, lessons, and student requests.',
        create: 'Create group',
        addLesson: 'Add lesson',
        groups: 'Groups',
        requests: 'Enrollment requests',
        today: 'Today’s lessons',
        calendar: 'Upcoming lessons',
        next: 'Your next lesson',
        openWorkspace: 'Open lesson workspace',
        openNow: 'Open lesson now',
        noNext: 'No upcoming lesson is scheduled.',
        todayHeading: 'Today’s agenda',
        noToday: 'No lessons are scheduled for today.',
        openLesson: 'Open lesson',
        attendance: 'Attendance',
        materials: 'Materials',
        laterHeading: 'Later on your calendar',
        requestsHeading: 'Pending requests',
        requestsWaiting: (count: number) =>
          count === 1
            ? '1 student is waiting for your reply'
            : `${count} students are waiting for your reply`,
        review: 'Review requests',
        viewAll: 'View all',
        noRequests: 'No enrollment requests are waiting for your review.',
        setupHeading: 'Setup checklist',
        setupIntro: 'Finish these steps so students can find you and join your groups.',
        noTasks: 'Your current setup steps are complete.',
        task: {
          profile: 'Complete your public profile',
          approval: 'Teaching application awaiting review',
          draft: 'Resume group setup',
          schedule: 'Add a weekly schedule',
          lessons: 'Add your first upcoming lesson',
        },
        failed: 'Could not load your teacher dashboard. Refresh and try again.',
        retry: 'Try again',
      };
  const groupById = new Map(data.groups.map(group => [group.id, group.name]));
  const lessonGroup = (lesson: { group: unknown; group_id: string }) =>
    groupName(lesson.group) ?? groupById.get(lesson.group_id) ?? null;
  const setupTasks = data.setupTasks;
  const pendingCount = data.counts.pendingRequests;

  return (
    <div className="screen-enter">
      <header className="mb-6 flex min-w-0 flex-wrap items-end justify-between gap-4">
        <div className="min-w-0">
          <p className="mb-2 text-xs font-bold uppercase tracking-wider text-muted">{dateLabel}</p>
          <h1 className="wrap-break-word text-2xl font-bold tracking-tight text-teal sm:text-3xl">
            {copy.greeting}, {firstName}
          </h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-muted">{copy.intro}</p>
        </div>
        <div className="grid w-full grid-cols-2 gap-2 sm:flex sm:w-auto">
          <Link
            href={`/${locale}/teacher/lessons?new=1`}
            className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-teal/15 bg-white px-4 text-sm font-bold text-teal transition-colors hover:border-teal/40 focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-orange"
          >
            <CalendarPlus size={17} aria-hidden="true" />
            {copy.addLesson}
          </Link>
          <Link
            href={`/${locale}/teacher/groups/new`}
            className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-teal px-4 text-sm font-bold text-white transition-colors hover:bg-teal/90 focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-orange"
          >
            <Plus size={17} aria-hidden="true" />
            {copy.create}
          </Link>
        </div>
      </header>

      {data.error ? (
        <section className="rounded-3xl border border-line bg-white p-5 shadow-xs">
          <p role="alert" className="text-sm text-danger">
            {copy.failed}
          </p>
          <Link
            href={`/${locale}/teacher?retry=1`}
            className="mt-3 inline-flex min-h-11 items-center font-bold text-teal underline"
          >
            {copy.retry}
          </Link>
        </section>
      ) : (
        <>
          {pendingCount > 0 && (
            <Link
              href={`/${locale}/teacher/requests`}
              className="student-card mb-6 flex min-h-14 items-center gap-3 rounded-2xl border border-orange/30 bg-orange/5 px-4 py-3 text-sm focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-orange"
            >
              <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-orange/10 text-orange-deep">
                <BellRing size={17} aria-hidden="true" />
              </span>
              <span className="min-w-0 flex-1 font-semibold text-ink">
                {copy.requestsWaiting(pendingCount)}
              </span>
              <span className="inline-flex shrink-0 items-center gap-1 font-bold text-orange-deep">
                {copy.review}
                <ArrowRight size={15} aria-hidden="true" className="rtl:rotate-180" />
              </span>
            </Link>
          )}

          <section className="student-hero relative mb-6 overflow-hidden rounded-3xl bg-teal p-6 text-white sm:p-7">
            <div
              aria-hidden="true"
              className="pointer-events-none absolute -end-8 -top-12 size-44 rounded-full border-[24px] border-white/5"
            />
            <div className="relative">
              <div className="flex items-start justify-between gap-4">
                <p className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-white/75">
                  <span
                    className={`size-2 rounded-full ${happeningNow ? 'bg-emerald-300' : 'bg-white/70'}`}
                  />
                  {happeningNow && countdown ? countdown.label : copy.next}
                </p>
                <Image
                  src="/brand/darsak/favicon.svg"
                  width={38}
                  height={38}
                  alt="DarSak"
                  className="rounded-xl bg-white/10"
                />
              </div>
              {nextLesson ? (
                <>
                  <p className="mt-5 text-sm text-white/75">
                    {lessonGroup(nextLesson) ?? (ar ? 'مجموعتك' : 'Your group')}
                  </p>
                  <h2 className="mt-2 wrap-break-word text-2xl font-bold sm:text-3xl">
                    {nextLesson.title}
                  </h2>
                  <div className="mt-4 flex flex-wrap items-center gap-x-3 gap-y-2 text-sm leading-6 text-white/85">
                    {countdown && !happeningNow && (
                      <span
                        className={`inline-flex min-h-8 items-center rounded-full px-3 text-xs font-bold ${countdown.kind === 'soon' ? 'bg-white text-teal' : 'bg-white/10 text-white'}`}
                      >
                        {countdown.label}
                      </span>
                    )}
                    <span className="inline-flex items-center gap-2">
                      <CalendarDays size={17} className="shrink-0" aria-hidden="true" />
                      {lessonDateTile(nextLesson.starts_at, locale).label}
                    </span>
                    <span className="inline-flex items-center gap-2">
                      <Clock3 size={17} className="shrink-0" aria-hidden="true" />
                      {lessonTimeRange(nextLesson.starts_at, nextLesson.ends_at, locale)}
                    </span>
                  </div>
                  <div className="mt-5 flex flex-wrap gap-2">
                    <Link
                      href={`/${locale}/teacher/lessons/${nextLesson.id}`}
                      className="inline-flex min-h-12 items-center gap-2 rounded-xl bg-white px-5 text-sm font-bold text-teal transition-colors hover:bg-cream"
                    >
                      {happeningNow ? copy.openNow : copy.openWorkspace}
                      <ArrowRight size={17} aria-hidden="true" className="rtl:rotate-180" />
                    </Link>
                    <Link
                      href={`/${locale}/teacher/lessons/${nextLesson.id}#attendance`}
                      className="inline-flex min-h-12 items-center gap-2 rounded-xl border border-white/25 px-4 text-sm font-bold text-white transition-colors hover:bg-white/10"
                    >
                      <ClipboardCheck size={17} aria-hidden="true" />
                      {copy.attendance}
                    </Link>
                  </div>
                </>
              ) : (
                <>
                  <h2 className="mt-5 text-2xl font-bold">{copy.noNext}</h2>
                  <p className="mt-2 text-sm leading-6 text-white/80">
                    {ar
                      ? 'أنشئ حصة جديدة لتظهر هنا.'
                      : 'Create a lesson to see your next session here.'}
                  </p>
                  <Link
                    href={`/${locale}/teacher/lessons?new=1`}
                    className="mt-5 inline-flex min-h-12 items-center gap-2 rounded-xl bg-white px-5 text-sm font-bold text-teal"
                  >
                    {copy.addLesson}
                    <ArrowRight size={17} aria-hidden="true" className="rtl:rotate-180" />
                  </Link>
                </>
              )}
            </div>
          </section>

          <div className="mb-6 grid gap-5 xl:grid-cols-2">
            <section className="min-w-0 rounded-2xl border border-line bg-white p-5 shadow-xs">
              <div className="mb-4 flex items-center justify-between gap-3">
                <h2 className="text-lg font-bold text-teal">{copy.todayHeading}</h2>
                <Link
                  href={`/${locale}/teacher/lessons`}
                  aria-label={ar ? 'افتح تقويم الحصص' : 'Open lesson calendar'}
                  className="grid size-11 shrink-0 place-items-center rounded-xl text-teal hover:bg-cream"
                >
                  <ArrowUpRight size={18} aria-hidden="true" className="rtl:-scale-x-100" />
                </Link>
              </div>
              {todayLessons.length ? (
                <ul className="divide-y divide-line">
                  {todayLessons.map(lesson => {
                    const state = lessonCountdown(lesson.starts_at, lesson.ends_at, locale, now);
                    const group = lessonGroup(lesson);
                    return (
                      <li key={lesson.id} className="py-3">
                        <div className="flex min-w-0 flex-wrap items-start gap-x-3 gap-y-1 sm:flex-nowrap">
                          <span
                            className={`mt-1 grid w-16 shrink-0 place-items-center rounded-xl px-1 py-2 text-xs font-bold ${state.kind === 'live' ? 'bg-teal text-white' : state.kind === 'ended' ? 'bg-cream text-muted' : 'bg-teal/5 text-teal'}`}
                          >
                            {new Intl.DateTimeFormat(ar ? 'ar-EG' : 'en-GB', {
                              hour: 'numeric',
                              minute: '2-digit',
                              timeZone: 'Africa/Cairo',
                            }).format(new Date(lesson.starts_at))}
                          </span>
                          <div className="min-w-0 flex-1 basis-40">
                            <Link
                              href={`/${locale}/teacher/lessons/${lesson.id}`}
                              className="block min-h-11 wrap-break-word py-1 text-sm font-bold text-teal hover:underline focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-orange"
                            >
                              {lesson.title}
                            </Link>
                            <p className="text-xs leading-5 text-muted">
                              {lessonTimeRange(lesson.starts_at, lesson.ends_at, locale)}
                              {group ? ` · ${group}` : ''}
                              {lesson.status === 'scheduled' && state.kind !== 'ended'
                                ? ` · ${state.label}`
                                : ''}
                            </p>
                            <div className="mt-1 flex flex-wrap gap-x-4">
                              <Link
                                href={`/${locale}/teacher/lessons/${lesson.id}#attendance`}
                                className="inline-flex min-h-11 items-center text-xs font-semibold text-teal underline underline-offset-4"
                              >
                                {copy.attendance}
                              </Link>
                              <Link
                                href={`/${locale}/teacher/lessons/${lesson.id}#materials`}
                                className="inline-flex min-h-11 items-center text-xs font-semibold text-muted underline underline-offset-4"
                              >
                                {copy.materials}
                              </Link>
                            </div>
                          </div>
                          <Status value={lesson.status} locale={locale} />
                        </div>
                      </li>
                    );
                  })}
                </ul>
              ) : (
                <EmptyState
                  action={{ href: `/${locale}/teacher/lessons?new=1`, label: copy.addLesson }}
                >
                  {copy.noToday}
                </EmptyState>
              )}
            </section>

            <section className="min-w-0 rounded-2xl border border-line bg-white p-5 shadow-xs">
              <div className="mb-4 flex items-center justify-between gap-3">
                <h2 className="text-lg font-bold text-teal">{copy.requestsHeading}</h2>
                <Link
                  href={`/${locale}/teacher/requests`}
                  className="inline-flex min-h-11 items-center gap-1 text-sm font-semibold text-muted hover:text-teal"
                >
                  {copy.viewAll}
                  <ArrowUpRight size={15} aria-hidden="true" className="rtl:-scale-x-100" />
                </Link>
              </div>
              {data.pendingRequests.length ? (
                <div className="grid gap-3">
                  {data.pendingRequests.slice(0, 3).map(request => (
                    <div key={request.enrollment_id} className="rounded-2xl border border-line p-4">
                      <div className="flex min-w-0 items-start justify-between gap-3">
                        <div className="min-w-0">
                          <strong className="wrap-break-word text-sm text-teal">
                            {request.full_name}
                          </strong>
                          <p className="mt-1 wrap-break-word text-sm text-muted">
                            {request.group_name}
                          </p>
                        </div>
                        <Status value={request.status} locale={locale} />
                      </div>
                      <EnrollmentDecisionButtons
                        locale={locale}
                        id={request.enrollment_id}
                        status={request.status}
                      />
                    </div>
                  ))}
                </div>
              ) : (
                <EmptyState>{copy.noRequests}</EmptyState>
              )}
            </section>

            {laterLessons.length > 0 && (
              <section className="min-w-0 rounded-2xl border border-line bg-white p-5 shadow-xs xl:col-span-2">
                <div className="mb-4 flex items-center justify-between gap-3">
                  <h2 className="text-lg font-bold text-teal">{copy.laterHeading}</h2>
                  <Link
                    href={`/${locale}/teacher/lessons`}
                    className="inline-flex min-h-11 items-center gap-1 text-sm font-semibold text-muted hover:text-teal"
                  >
                    {copy.viewAll}
                    <ArrowUpRight size={15} aria-hidden="true" className="rtl:-scale-x-100" />
                  </Link>
                </div>
                <ul className="grid min-w-0 gap-3 sm:grid-cols-2 xl:grid-cols-4">
                  {laterLessons.map(lesson => {
                    const tile = lessonDateTile(lesson.starts_at, locale);
                    const group = lessonGroup(lesson);
                    return (
                      <li key={lesson.id} className="min-w-0">
                        <Link
                          href={`/${locale}/teacher/lessons/${lesson.id}`}
                          className="student-card flex h-full min-h-20 min-w-0 items-start gap-3 rounded-xl border border-line p-3 focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-orange"
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
                          <span className="min-w-0 flex-1">
                            <span className="block wrap-break-word text-sm font-bold text-teal [overflow-wrap:anywhere]">
                              {lesson.title}
                            </span>
                            <span className="mt-1 block text-xs leading-5 text-muted">
                              {tile.weekday} ·{' '}
                              {lessonTimeRange(lesson.starts_at, lesson.ends_at, locale)}
                            </span>
                            {group && (
                              <span className="block wrap-break-word text-xs leading-5 text-muted [overflow-wrap:anywhere]">
                                {group}
                              </span>
                            )}
                          </span>
                        </Link>
                      </li>
                    );
                  })}
                </ul>
              </section>
            )}
          </div>
          {setupTasks.length > 0 && (
            <section className="mb-6 min-w-0 rounded-2xl border border-orange/30 bg-white p-5 shadow-xs">
              <div className="mb-3 flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <h2 className="flex items-center gap-2 text-lg font-bold text-teal">
                    {copy.setupHeading}
                    <span className="rounded-full bg-orange/10 px-2 py-0.5 text-xs font-bold text-orange-deep">
                      {setupTasks.length}
                    </span>
                  </h2>
                  <p className="mt-1 text-sm leading-6 text-muted">{copy.setupIntro}</p>
                </div>
              </div>
              <ol className="grid gap-2 md:grid-cols-2">
                {setupTasks.slice(0, 5).map((task, index) => (
                  <li key={task.id}>
                    <Link
                      href={`/${locale}${task.href}`}
                      className="flex min-h-14 items-center gap-3 rounded-xl border border-line px-3 py-2 text-sm text-teal transition-colors hover:border-teal/30 hover:bg-cream focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-orange"
                    >
                      <span
                        aria-hidden="true"
                        className="grid size-7 shrink-0 place-items-center rounded-full bg-orange/10 text-xs font-bold text-orange-deep"
                      >
                        {new Intl.NumberFormat(ar ? 'ar-EG' : 'en-GB').format(index + 1)}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block font-semibold">{copy.task[task.id]}</span>
                        {task.groupName && (
                          <span className="mt-0.5 block truncate text-xs text-muted">
                            {task.groupName}
                          </span>
                        )}
                      </span>
                      <ArrowRight
                        size={16}
                        className="shrink-0 text-muted rtl:rotate-180"
                        aria-hidden="true"
                      />
                    </Link>
                  </li>
                ))}
              </ol>
            </section>
          )}

          <div className="mb-6 grid grid-cols-2 gap-3 xl:grid-cols-4">
            {[
              {
                label: copy.groups,
                value: data.counts.groups,
                href: `/${locale}/teacher/groups`,
                icon: UsersRound,
                attention: false,
              },
              {
                label: copy.requests,
                value: pendingCount,
                href: `/${locale}/teacher/requests`,
                icon: ClipboardList,
                attention: pendingCount > 0,
              },
              {
                label: copy.today,
                value: data.counts.todayLessons,
                href: `/${locale}/teacher/lessons`,
                icon: CalendarDays,
                attention: false,
              },
              {
                label: copy.calendar,
                value: data.counts.upcomingLessons,
                href: `/${locale}/teacher/lessons`,
                icon: Clock3,
                attention: false,
              },
            ].map(({ label, value, href, icon: Icon, attention }) => (
              <Link
                key={label}
                href={href}
                className={`student-card flex min-h-24 items-center gap-3 rounded-2xl border bg-white p-4 shadow-xs focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-orange ${attention ? 'border-orange/40 ring-1 ring-orange/15' : 'border-line'}`}
              >
                <span
                  className={`grid size-10 shrink-0 place-items-center rounded-xl ${attention ? 'bg-orange/10 text-orange' : 'bg-teal/5 text-teal'}`}
                >
                  <Icon size={19} aria-hidden="true" />
                </span>
                <span className="min-w-0">
                  <span className="block text-xs leading-5 text-muted">{label}</span>
                  <strong
                    className={`mt-1 block text-2xl font-bold leading-none ${attention ? 'text-orange' : 'text-teal'}`}
                  >
                    {new Intl.NumberFormat(ar ? 'ar-EG' : 'en-GB').format(value)}
                  </strong>
                </span>
              </Link>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
