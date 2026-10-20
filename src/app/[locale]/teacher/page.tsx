import Image from 'next/image';
import Link from 'next/link';
import { ArrowRight, ArrowUpRight, CalendarDays, Clock3, UsersRound } from 'lucide-react';
import { ensureLocale } from '@/i18n/config';
import { EnrollmentDecisionButtons } from '@/components/platform/actions';
import { EmptyState, Status, cairoDate } from '@/components/platform/ui';
import { teacherOverview } from '@/features/teacher/data';
import { requireViewer } from '@/components/platform/access';
import { readTeacherAccessStatus } from '@/features/teacher-access/data';

function groupName(group: unknown): string | null {
  const candidate = Array.isArray(group) ? group[0] : group;
  if (!candidate || typeof candidate !== 'object' || !('name' in candidate)) return null;
  return typeof candidate.name === 'string' && candidate.name.trim() ? candidate.name : null;
}

function lessonTimeRange(startsAt: string, endsAt: string, locale: string) {
  const language = locale === 'ar' ? 'ar-EG' : 'en-GB';
  const format = new Intl.DateTimeFormat(language, {
    hour: 'numeric',
    minute: '2-digit',
    timeZone: 'Africa/Cairo',
  });
  return `${format.format(new Date(startsAt))} – ${format.format(new Date(endsAt))}`;
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
  const access = await readTeacherAccessStatus(me.db);
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
        <section className="rounded-3xl border border-line bg-white p-5 shadow-sm">
          <p role="alert" className="text-sm text-red-800">
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
        <section className="rounded-3xl border border-line bg-white p-5 shadow-sm">
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

  const data = await teacherOverview(locale);
  const now = new Date();
  const firstName = data.me.profile.full_name.trim().split(/\s+/)[0] || data.me.profile.full_name;
  const todayLessons = [...data.todayLessons].sort(
    (a, b) => Date.parse(a.starts_at) - Date.parse(b.starts_at),
  );
  const nextLesson = data.nextLesson;
  const happeningNow = Boolean(nextLesson && Date.parse(nextLesson.starts_at) <= now.getTime());
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
        live: 'الحصة جارية الآن',
        openWorkspace: 'افتح مساحة الحصة',
        noNext: 'لا توجد حصة مجدولة قادمة.',
        todayHeading: 'جدول اليوم',
        noToday: 'لا توجد حصص اليوم.',
        openLesson: 'افتح الحصة',
        attendance: 'الحضور',
        materials: 'المواد',
        requestsHeading: 'طلبات تنتظر الرد',
        viewAll: 'عرض الكل',
        noRequests: 'لا توجد طلبات تنتظر المراجعة.',
        setupHeading: 'خطوات الإعداد',
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
        calendar: 'Lesson calendar',
        next: 'Your next lesson',
        live: 'Happening now',
        openWorkspace: 'Open lesson workspace',
        noNext: 'No upcoming lesson is scheduled.',
        todayHeading: 'Today’s agenda',
        noToday: 'No lessons are scheduled for today.',
        openLesson: 'Open lesson',
        attendance: 'Attendance',
        materials: 'Materials',
        requestsHeading: 'Pending requests',
        viewAll: 'View all',
        noRequests: 'No enrollment requests are waiting for your review.',
        setupHeading: 'Setup checklist',
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
  const setupTasks = data.setupTasks;

  return (
    <div className="screen-enter">
      <header className="mb-6 flex min-w-0 flex-wrap items-end justify-between gap-4">
        <div className="min-w-0">
          <p className="mb-2 text-xs font-bold uppercase tracking-wider text-muted">{dateLabel}</p>
          <h1 className="break-words text-2xl font-bold tracking-tight text-teal sm:text-3xl">
            {copy.greeting}, {firstName}
          </h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-muted">{copy.intro}</p>
        </div>
      </header>

      <div className="mb-6 grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Link
          href={`/${locale}/teacher/groups/new`}
          className="inline-flex min-h-12 items-center justify-center gap-2 rounded-xl bg-teal px-4 py-3 text-sm font-bold text-white transition-colors hover:bg-teal/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange"
        >
          <UsersRound size={18} aria-hidden="true" />
          {copy.create}
        </Link>
        <Link
          href={`/${locale}/teacher/lessons?new=1`}
          className="inline-flex min-h-12 items-center justify-center gap-2 rounded-xl border border-teal/15 bg-white px-4 py-3 text-sm font-bold text-teal transition-colors hover:border-teal/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange"
        >
          <CalendarDays size={18} aria-hidden="true" />
          {copy.addLesson}
        </Link>
      </div>

      {data.error ? (
        <section className="rounded-3xl border border-line bg-white p-5 shadow-sm">
          <p role="alert" className="text-sm text-red-800">
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
                  {happeningNow ? copy.live : copy.next}
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
                    {groupName(nextLesson.group) ??
                      groupById.get(nextLesson.group_id) ??
                      (ar ? 'مجموعتك' : 'Your group')}
                  </p>
                  <h2 className="mt-2 break-words text-2xl font-bold sm:text-3xl">
                    {nextLesson.title}
                  </h2>
                  <p className="mt-3 flex items-start gap-2 text-sm leading-6 text-white/85">
                    <CalendarDays size={18} className="mt-0.5 shrink-0" aria-hidden="true" />
                    {cairoDate(nextLesson.starts_at, locale)}
                  </p>
                  <p className="mt-1 flex items-center gap-2 text-sm text-white/80">
                    <Clock3 size={17} aria-hidden="true" />
                    {lessonTimeRange(nextLesson.starts_at, nextLesson.ends_at, locale)}
                  </p>
                  <Link
                    href={`/${locale}/teacher/lessons/${nextLesson.id}`}
                    className="mt-5 inline-flex min-h-12 items-center gap-2 rounded-xl bg-white px-5 text-sm font-bold text-teal transition-colors hover:bg-cream"
                  >
                    {copy.openWorkspace}
                    <ArrowRight size={17} aria-hidden="true" className="rtl:rotate-180" />
                  </Link>
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

          <div className="mb-6 grid grid-cols-2 gap-3 xl:grid-cols-4">
            {[
              {
                label: copy.groups,
                value: data.counts.groups,
                href: `/${locale}/teacher/groups`,
                icon: UsersRound,
              },
              {
                label: copy.requests,
                value: data.counts.pendingRequests,
                href: `/${locale}/teacher/requests`,
                icon: ArrowUpRight,
              },
              {
                label: copy.today,
                value: data.counts.todayLessons,
                href: `/${locale}/teacher/lessons`,
                icon: CalendarDays,
              },
              {
                label: copy.calendar,
                value: data.counts.upcomingLessons,
                href: `/${locale}/teacher/lessons`,
                icon: Clock3,
              },
            ].map(({ label, value, href, icon: Icon }) => (
              <Link
                key={label}
                href={href}
                className="student-card flex min-h-24 items-center gap-3 rounded-2xl border border-line bg-white p-4 shadow-sm"
              >
                <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-teal/5 text-teal">
                  <Icon size={19} aria-hidden="true" />
                </span>
                <span className="min-w-0">
                  <span className="block text-xs leading-5 text-muted">{label}</span>
                  <strong className="mt-1 block text-2xl font-bold leading-none text-teal">
                    {value}
                  </strong>
                </span>
              </Link>
            ))}
          </div>

          <div className="grid gap-5 xl:grid-cols-2">
            <section className="min-w-0 rounded-2xl border border-line bg-white p-5 shadow-sm">
              <div className="mb-4 flex items-center justify-between gap-3">
                <h2 className="text-lg font-bold text-teal">{copy.todayHeading}</h2>
                <Link
                  href={`/${locale}/teacher/lessons`}
                  aria-label={ar ? 'افتح تقويم الحصص' : 'Open lesson calendar'}
                  className="grid size-11 shrink-0 place-items-center rounded-xl text-teal hover:bg-cream"
                >
                  <ArrowUpRight size={18} aria-hidden="true" />
                </Link>
              </div>
              {todayLessons.length ? (
                <ul className="divide-y divide-line">
                  {todayLessons.map(lesson => (
                    <li key={lesson.id} className="py-3">
                      <div className="flex min-w-0 items-start gap-3">
                        <span className="mt-1 grid size-10 shrink-0 place-items-center rounded-xl bg-teal/5 text-teal">
                          <Clock3 size={17} aria-hidden="true" />
                        </span>
                        <div className="min-w-0 flex-1">
                          <Link
                            href={`/${locale}/teacher/lessons/${lesson.id}`}
                            className="block min-h-11 break-words py-1 text-sm font-bold text-teal hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange"
                          >
                            {lesson.title}
                          </Link>
                          <p className="text-xs leading-5 text-muted">
                            {lessonTimeRange(lesson.starts_at, lesson.ends_at, locale)}
                            {(groupName(lesson.group) ?? groupById.get(lesson.group_id))
                              ? ` · ${groupName(lesson.group) ?? groupById.get(lesson.group_id)}`
                              : ''}
                          </p>
                          <div className="mt-1 flex flex-wrap gap-x-4">
                            <Link
                              href={`/${locale}/teacher/lessons/${lesson.id}`}
                              className="inline-flex min-h-11 items-center text-xs font-semibold text-teal underline underline-offset-4"
                            >
                              {copy.openLesson}
                            </Link>
                            <Link
                              href={`/${locale}/teacher/lessons/${lesson.id}#attendance`}
                              className="inline-flex min-h-11 items-center text-xs font-semibold text-muted underline underline-offset-4"
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
                  ))}
                </ul>
              ) : (
                <EmptyState>{copy.noToday}</EmptyState>
              )}
            </section>

            <section className="min-w-0 rounded-2xl border border-line bg-white p-5 shadow-sm">
              <div className="mb-4 flex items-center justify-between gap-3">
                <h2 className="text-lg font-bold text-teal">{copy.requestsHeading}</h2>
                <Link
                  href={`/${locale}/teacher/requests`}
                  className="inline-flex min-h-11 items-center gap-1 text-sm font-semibold text-muted hover:text-teal"
                >
                  {copy.viewAll}
                  <ArrowUpRight size={15} aria-hidden="true" />
                </Link>
              </div>
              {data.pendingRequests.length ? (
                <div className="grid gap-3">
                  {data.pendingRequests.slice(0, 3).map(request => (
                    <div key={request.enrollment_id} className="rounded-2xl border border-line p-4">
                      <div className="flex min-w-0 items-start justify-between gap-3">
                        <div className="min-w-0">
                          <strong className="break-words text-sm text-teal">
                            {request.full_name}
                          </strong>
                          <p className="mt-1 break-words text-sm text-muted">
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

            <section className="min-w-0 rounded-2xl border border-line bg-white p-5 shadow-sm">
              <div className="mb-4 flex items-center justify-between gap-3">
                <h2 className="text-lg font-bold text-teal">{copy.setupHeading}</h2>
                <Link
                  href={`/${locale}/account/profile`}
                  aria-label={ar ? 'تعديل الملف الشخصي' : 'Edit profile'}
                  className="grid size-11 shrink-0 place-items-center rounded-xl text-teal hover:bg-cream"
                >
                  <ArrowUpRight size={18} aria-hidden="true" />
                </Link>
              </div>
              {setupTasks.length ? (
                <ul className="grid gap-1">
                  {setupTasks.slice(0, 5).map(task => (
                    <li key={task.id}>
                      <Link
                        href={`/${locale}${task.href}`}
                        className="flex min-h-12 items-center gap-3 rounded-xl px-2 py-2 text-sm text-teal hover:bg-cream focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange"
                      >
                        <span
                          aria-hidden="true"
                          className="size-2 shrink-0 rounded-full bg-orange"
                        />
                        <span className="min-w-0 flex-1">
                          <span className="block font-semibold">{copy.task[task.id]}</span>
                          {task.groupName && (
                            <span className="mt-0.5 block truncate text-xs text-muted">
                              {task.groupName}
                            </span>
                          )}
                        </span>
                        <ArrowUpRight
                          size={16}
                          className="shrink-0 text-muted"
                          aria-hidden="true"
                        />
                      </Link>
                    </li>
                  ))}
                </ul>
              ) : (
                <EmptyState>{copy.noTasks}</EmptyState>
              )}
            </section>
          </div>
        </>
      )}
    </div>
  );
}
