import Link from 'next/link';
import { ensureLocale } from '@/i18n/config';
import { studentDashboard } from '@/features/student/data';
import { requireViewer } from '@/components/platform/access';
import { EmptyState, Metric, Panel, QuickAction, RowLink, ScreenTitle, Status, cairoDate } from '@/components/platform/ui';

export default async function StudentDashboard({ params }: { params: Promise<{ locale: string }> }) {
  const { locale: raw } = await params;
  const locale = ensureLocale(raw);
  const ar = locale === 'ar';
  const me = await requireViewer(locale, 'student');
  const data = await studentDashboard(locale);
  const preview = data.lessons;
  const copy = ar
    ? { intro: 'تابع مجموعاتك وحصصك القادمة وموارد التعلم.', classes: 'مجموعاتي', active: 'مجموعات مسجّل بها', pending: 'طلبات قيد المراجعة', upcoming: 'حصص قادمة', timetable: 'التالي في جدولك', noLessons: 'لا توجد حصص قادمة بعد.', error: 'تعذر تحميل بيانات التعلم. حدّث الصفحة وحاول مرة أخرى.', retry: 'إعادة المحاولة', find: 'اكتشف المجموعات', materials: 'موادي التعليمية', schedule: 'الجدول الدراسي', requests: 'حالة الطلبات' }
    : { intro: 'Keep track of your classes, next lessons, and learning resources.', classes: 'My classes', active: 'Enrolled classes', pending: 'Pending requests', upcoming: 'Upcoming lessons', timetable: 'Next on your timetable', noLessons: 'No upcoming lessons yet.', error: 'Could not load your learning data. Refresh and try again.', retry: 'Try again', find: 'Find classes', materials: 'My materials', schedule: 'Weekly timetable', requests: 'Enrollment status' };
  return <>
    <ScreenTitle eyebrow={ar ? 'مساحة الطالب' : 'Student workspace'} title={`${ar ? 'أهلاً' : 'Hello'}, ${me.fullName}`} description={copy.intro}/>
    <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
      <QuickAction href={`/${locale}/student/classes`}>{copy.classes}</QuickAction>
      <QuickAction href={`/${locale}/student/classes`}>{copy.requests}</QuickAction>
      <QuickAction href={`/${locale}/timetable`}>{copy.schedule}</QuickAction>
      <QuickAction href={`/${locale}/student/materials`}>{copy.materials}</QuickAction>
      <QuickAction href={`/${locale}/teachers`}>{copy.find}</QuickAction>
    </div>
    {data.error ? <Panel><p role="alert" className="text-sm text-red-800">{copy.error}</p><a href={`/${locale}/student?retry=1`} className="mt-3 inline-flex font-bold text-orange underline">{copy.retry}</a></Panel> : <>
      <div className="grid gap-4 sm:grid-cols-3">
        <Link href={`/${locale}/student/classes`}><Metric label={copy.active} value={data.acceptedCount}/></Link>
        <Link href={`/${locale}/student/classes`}><Metric label={copy.pending} value={data.pendingCount}/></Link>
        <Link href={`/${locale}/timetable`}><Metric label={copy.upcoming} value={data.upcomingCount}/></Link>
      </div>
      <Panel className="mt-6"><div className="mb-4 flex flex-wrap items-baseline justify-between gap-3"><h2 className="text-xl font-black text-teal">{copy.timetable}</h2><Link className="font-bold text-orange underline" href={`/${locale}/timetable`}>{copy.schedule}</Link></div>{preview.length ? <div className="grid gap-3">{preview.map(lesson => <RowLink key={lesson.id} href={`/${locale}/student/lessons/${lesson.id}`} title={lesson.title} meta={[Array.isArray(lesson.group) ? lesson.group[0]?.name : lesson.group?.name, cairoDate(lesson.starts_at, locale)].filter(Boolean).join(' · ')} trailing={<Status value={lesson.status} locale={locale}/>}/>)}</div> : <EmptyState>{copy.noLessons}</EmptyState>}</Panel>
    </>}
  </>;
}
