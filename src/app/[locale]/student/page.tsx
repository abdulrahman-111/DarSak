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
    ? { intro: 'تابع مجموعاتك وحصصك القادمة وموارد التعلم.', classes: 'مجموعاتي وطلباتي', active: 'مجموعات مسجّل بها', pending: 'طلبات قيد المراجعة', upcoming: 'حصص قادمة', timetable: 'التالي في جدولك', noLessons: 'لا توجد حصص قادمة بعد.', error: 'تعذر تحميل بيانات التعلم. حدّث الصفحة وحاول مرة أخرى.', retry: 'إعادة المحاولة', find: 'ابحث عن مجموعة', materials: 'موادي التعليمية', schedule: 'الجدول الدراسي', requests: 'حالة الطلبات', saved: 'المجموعات المحفوظة', profile: 'ملف التعلم', complete: 'أضف أهداف التعلم واهتماماتك هنا، واستخدم اهتماماتك للبحث عن معلمين.', interests: 'اهتماماتك', editProfile: 'تعديل ملف التعلم', editInterests: (interest: string) => `ابحث عن معلمين في ${interest}`, more: 'روابط إضافية' }
    : { intro: 'Keep track of your classes, next lessons, and learning resources.', classes: 'My classes & requests', active: 'Enrolled classes', pending: 'Pending requests', upcoming: 'Upcoming lessons', timetable: 'Next on your timetable', noLessons: 'No upcoming lessons yet.', error: 'Could not load your learning data. Refresh and try again.', retry: 'Try again', find: 'Find a class', materials: 'My materials', schedule: 'Weekly timetable', requests: 'Enrollment status', saved: 'Saved groups', profile: 'Learning profile', complete: 'Add your learning goals and interests here, then use your interests to search for teachers.', interests: 'Your interests', editProfile: 'Edit learning profile', editInterests: (interest: string) => `Find teachers for ${interest}`, more: 'More links' };
  const learningProfile = data.learningProfile;
  const isIncomplete = learningProfile && !learningProfile.onboarding_completed_at && (
    !learningProfile.age_range || !learningProfile.education_year.trim() || !learningProfile.interests.length || !learningProfile.learning_goal.trim()
  );
  return <>
    <ScreenTitle eyebrow={ar ? 'مساحة الطالب' : 'Student workspace'} title={`${ar ? 'أهلاً' : 'Hello'}, ${me.fullName}`} description={copy.intro}/>
    <div className="mb-6 grid grid-cols-1 gap-3 sm:grid-cols-3">
      <QuickAction href={`/${locale}/teachers`}>{copy.find}</QuickAction>
      <QuickAction href={`/${locale}/student/classes`}>{copy.classes}</QuickAction>
      <QuickAction href={`/${locale}/timetable`}>{copy.schedule}</QuickAction>
    </div>
    {data.error ? <Panel><p role="alert" className="text-sm text-red-800">{copy.error}</p><a href={`/${locale}/student?retry=1`} className="mt-3 inline-flex font-bold text-orange underline">{copy.retry}</a></Panel> : <>
      <div className="grid gap-4 sm:grid-cols-3">
        <Link href={`/${locale}/student/classes`}><Metric label={copy.active} value={data.acceptedCount}/></Link>
        <Link href={`/${locale}/student/classes`}><Metric label={copy.pending} value={data.pendingCount}/></Link>
        <Link href={`/${locale}/timetable`}><Metric label={copy.upcoming} value={data.upcomingCount}/></Link>
      </div>
      <Panel className="mt-6"><div className="mb-4 flex flex-wrap items-baseline justify-between gap-3"><h2 className="text-xl font-black text-teal">{copy.timetable}</h2><Link className="font-bold text-orange underline" href={`/${locale}/timetable`}>{copy.schedule}</Link></div>{preview.length ? <div className="grid gap-3">{preview.map(lesson => <RowLink key={lesson.id} href={`/${locale}/student/lessons/${lesson.id}`} title={lesson.title} meta={[Array.isArray(lesson.group) ? lesson.group[0]?.name : lesson.group?.name, cairoDate(lesson.starts_at, locale)].filter(Boolean).join(' · ')} trailing={<Status value={lesson.status} locale={locale}/>}/>)}</div> : <EmptyState>{copy.noLessons}</EmptyState>}</Panel>
      {isIncomplete ? <Panel className="mt-6"><h2 className="text-xl font-black text-teal">{copy.profile}</h2><p className="mt-2 text-sm leading-6 text-muted">{copy.complete}</p><Link className="mt-4 inline-flex rounded-xl bg-orange px-4 py-2.5 font-bold text-white" href={`/${locale}/account`}>{ar ? 'فتح الحساب' : 'Open Account'}</Link></Panel> : learningProfile?.interests.length ? <Panel className="mt-6"><h2 className="mb-3 text-xl font-black text-teal">{copy.interests}</h2><ul className="flex flex-wrap gap-2">{learningProfile.interests.slice(0, 3).map(interest => <li key={interest}><Link className="inline-flex min-h-10 items-center rounded-full border border-[#d8ccb8] px-4 text-sm font-bold text-teal hover:bg-[#e0eeec]" href={`/${locale}/teachers?query=${encodeURIComponent(interest)}`}>{copy.editInterests(interest)}</Link></li>)}</ul></Panel> : null}
    </>}
    <nav aria-label={copy.more} className="mt-6">
      <h2 className="mb-3 text-sm font-bold text-muted">{copy.more}</h2>
      <div className="grid grid-cols-2 gap-3">
        <QuickAction href={`/${locale}/student/materials`}>{copy.materials}</QuickAction>
        <QuickAction href={`/${locale}/student/saved`}>{copy.saved}</QuickAction>
      </div>
    </nav>
  </>;
}
