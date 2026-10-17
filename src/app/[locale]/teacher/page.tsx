import Link from 'next/link';
import { ensureLocale } from '@/i18n/config';
import { EnrollmentDecisionButtons } from '@/components/platform/actions';
import { EmptyState, Metric, Panel, QuickAction, RowLink, ScreenTitle, Status, cairoDate } from '@/components/platform/ui';
import { teacherOverview } from '@/features/teacher/data';
import { requireViewer } from '@/components/platform/access';
import { readTeacherAccessStatus } from '@/features/teacher-access/data';

export default async function TeacherDashboard({ params }: { params: Promise<{ locale: string }> }) {
  const { locale: raw } = await params;
  const locale = ensureLocale(raw);
  const ar = locale === 'ar';
  const me=await requireViewer(locale,'teacher');
  const access=await readTeacherAccessStatus(me.db);
  if(access.error||!access.status)return <><ScreenTitle eyebrow={ar?'مساحة المعلم':'Teacher workspace'} title={ar?'صلاحية التدريس':'Teaching access'} /><Panel><p role="alert" className="text-sm text-red-800">{ar?'تعذر تحميل لوحة التدريس. حدّث الصفحة أو راجع إعدادات الوصول من حسابك.':'Could not load teaching access. Refresh or review access settings in your account.'}</p><Link href={`/${locale}/account/teaching-access`} className="mt-3 inline-flex font-bold text-teal underline">{ar?'إعدادات الوصول':'Access settings'}</Link></Panel></>;
  if(!access.status.has_access)return <><ScreenTitle eyebrow={ar?'مساحة المعلم':'Teacher workspace'} title={ar?'صلاحية التدريس':'Teaching access'} description={ar?'يمكنك متابعة حسابك ومراجعة الطلبات والإشعارات أثناء توقف صلاحية التدريس.':'You can use your account and review your application and notifications while teaching access is paused.'}/><Panel><h2 className="font-black text-teal">{ar?'مراجعة إعدادات الحساب':'Review your account settings'}</h2><p className="mt-2 text-sm text-muted">{ar?'راجع حالة طلبك وتفاصيل خطتك في حسابك.':'Review your application status and plan details in your account.'}</p><Link href={`/${locale}/account`} className="mt-3 inline-flex font-bold text-teal underline">{ar?'فتح الحساب':'Open Account'}</Link></Panel></>;
  const data = await teacherOverview(locale);
  const copy = ar ? {
    welcome: 'مرحباً', intro: 'مجموعاتك وطلبات الطلاب وحصص اليوم والخطوات التالية في مكان واحد.',
    create: 'إنشاء مجموعة', addLesson: 'إضافة حصة', groups: 'المجموعات', requests: 'طلبات تنتظر الرد', today: 'حصص اليوم', upcoming: 'حصص قادمة',
    groupsLink: 'إدارة المجموعات', lessonsLink: 'الحصص والمواد', catalogueLink: 'المواد والفئات', studentsLink: 'إدارة الطلاب',
    todayHeading: 'حصص اليوم', upcomingHeading: 'الحصص القادمة', requestsHeading: 'طلبات الانضمام', setupHeading: 'خطوات الإعداد',
    noToday: 'لا توجد حصص اليوم.', noUpcoming: 'لا توجد حصص قادمة.', noRequests: 'لا توجد طلبات تنتظر المراجعة.', noTasks: 'لا توجد خطوات إعداد معلقة حالياً.',
    profile: 'أكمل ملفك العام', approval: 'طلب التدريس بانتظار مراجعة الإدارة', draft: 'استأنف إعداد المسودة', schedule: 'أضف جدولاً أسبوعياً', lessons: 'أضف أول حصة قادمة',
    failed: 'تعذر تحميل لوحة المعلم. حدّث الصفحة وحاول مرة أخرى.',
  } : {
    welcome: 'Welcome', intro: 'Your groups, student requests, today’s lessons, and next steps in one place.',
    create: 'Create group', addLesson: 'Add lesson', groups: 'Groups', requests: 'Pending requests', today: 'Today’s lessons', upcoming: 'Upcoming lessons',
    groupsLink: 'Manage groups', lessonsLink: 'Lessons & materials', catalogueLink: 'Subjects & categories', studentsLink: 'Manage students',
    todayHeading: 'Today', upcomingHeading: 'Upcoming lessons', requestsHeading: 'Enrollment requests', setupHeading: 'Setup tasks',
    noToday: 'No lessons are scheduled for today.', noUpcoming: 'No upcoming lessons.', noRequests: 'No enrollment requests are waiting for your review.', noTasks: 'There are no setup steps to complete right now.',
    profile: 'Complete your public profile', approval: 'Your teaching application is awaiting review', draft: 'Resume group setup', schedule: 'Add a weekly schedule', lessons: 'Add your first upcoming lesson',
    failed: 'Could not load your teacher dashboard. Refresh and try again.',
  };
  const taskLabels = { profile: copy.profile, approval: copy.approval, draft: copy.draft, schedule: copy.schedule, lessons: copy.lessons };
  const approvalTask = data.setupTasks.find(task => task.id === 'approval');
  const accountTasks = data.setupTasks.filter(task => task.id === 'profile');
  const workspaceTasks = data.setupTasks.filter(task => task.id !== 'profile' && task.id !== 'approval');

  return <>
    <ScreenTitle
      eyebrow={ar ? 'مساحة المعلم' : 'Teacher workspace'}
      title={`${copy.welcome}, ${data.me.profile.full_name}`}
      description={copy.intro}
    />
    {approvalTask && <Panel className="mb-6"><RowLink href={`/${locale}${approvalTask.href}`} title={taskLabels.approval} meta={ar ? 'تابع حالة الطلب من حسابك.' : 'Check your application status in your account.'} /></Panel>}
    <div className="mb-6 grid grid-cols-2 gap-3">
      <QuickAction href={`/${locale}/teacher/groups/new`}>{copy.create}</QuickAction>
      <QuickAction href={`/${locale}/teacher/lessons?new=1`}>{copy.addLesson}</QuickAction>
    </div>
    {data.error ? <Panel><p role="alert" className="text-sm text-red-800">{copy.failed}</p><a href={`/${locale}/teacher?retry=1`} className="mt-3 inline-flex font-bold text-orange underline">{ar ? 'إعادة المحاولة' : 'Try again'}</a></Panel> : <>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Metric label={copy.groups} value={data.counts.groups} />
        <Metric label={copy.requests} value={data.counts.pendingRequests} />
        <Metric label={copy.today} value={data.counts.todayLessons} />
        <Metric label={copy.upcoming} value={data.counts.upcomingLessons} />
      </div>

      <div className="mt-6 grid grid-cols-1 gap-6 xl:grid-cols-2">
        <Panel>
          <h2 className="mb-4 text-xl font-black text-teal">{copy.todayHeading}</h2>
          {data.todayLessons.length ? <div className="grid gap-3">{data.todayLessons.map(lesson => <RowLink key={lesson.id} href={`/${locale}/teacher/lessons/${lesson.id}`} title={lesson.title} meta={cairoDate(lesson.starts_at, locale)} trailing={<Status value={lesson.status} locale={locale} />} />)}</div> : <EmptyState>{copy.noToday}</EmptyState>}
        </Panel>
        <Panel>
          <div className="mb-4 flex items-baseline justify-between gap-3"><h2 className="text-xl font-black text-teal">{copy.requestsHeading}</h2><Link href={`/${locale}/teacher/requests`} className="text-sm font-bold text-teal underline">{ar ? 'عرض الكل' : 'View all'}</Link></div>
          {data.pendingRequests.length ? <div className="grid gap-3">{data.pendingRequests.slice(0, 5).map(request => <div key={request.enrollment_id} className="rounded-2xl border border-line p-4"><div className="flex items-start justify-between gap-3"><div><strong className="text-teal">{request.full_name}</strong><p className="mt-1 text-sm text-muted">{request.group_name}</p></div><Status value={request.status} locale={locale} /></div><EnrollmentDecisionButtons locale={locale} id={request.enrollment_id} status={request.status} /></div>)}</div> : <EmptyState>{copy.noRequests}</EmptyState>}
        </Panel>
        <Panel>
          <h2 className="mb-4 text-xl font-black text-teal">{copy.upcomingHeading}</h2>
          {data.upcomingLessons.length ? <div className="grid gap-3">{data.upcomingLessons.map(lesson => <RowLink key={lesson.id} href={`/${locale}/teacher/lessons/${lesson.id}`} title={lesson.title} meta={cairoDate(lesson.starts_at, locale)} trailing={<Status value={lesson.status} locale={locale} />} />)}</div> : <EmptyState>{copy.noUpcoming}</EmptyState>}
        </Panel>
        <Panel>
          <h2 className="mb-4 text-xl font-black text-teal">{copy.setupHeading}</h2>
          {accountTasks.length > 0 && <div className="mb-3 grid gap-2">{accountTasks.map(task => <RowLink key={task.id} href={`/${locale}${task.href}`} title={taskLabels[task.id]} />)}</div>}
          {workspaceTasks.length ? <div className="grid gap-2">{workspaceTasks.map(task => <RowLink key={task.id} href={`/${locale}${task.href}`} title={taskLabels[task.id]} meta={task.groupName} />)}</div> : accountTasks.length === 0 && <EmptyState>{copy.noTasks}</EmptyState>}
        </Panel>
      </div>
    </>}
    <nav aria-label={ar ? 'روابط التدريس' : 'Teaching shortcuts'} className="mt-6">
      <h2 className="mb-3 text-sm font-bold text-muted">{ar ? 'روابط أخرى' : 'More teaching links'}</h2>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-5">
        <QuickAction href={`/${locale}/teacher/groups`}>{copy.groupsLink}</QuickAction>
        <QuickAction href={`/${locale}/teacher/lessons`}>{copy.lessonsLink}</QuickAction>
        <QuickAction href={`/${locale}/teacher/catalogue`}>{copy.catalogueLink}</QuickAction>
        <QuickAction href={`/${locale}/teacher/students`}>{copy.studentsLink}</QuickAction>
      </div>
    </nav>
  </>;
}
