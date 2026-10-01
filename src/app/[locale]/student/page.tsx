import Link from 'next/link';
import { ensureLocale } from '@/i18n/config';
import { learning } from '@/features/student/data';
import { requireViewer } from '@/components/platform/access';
import { EmptyState, Metric, Panel, RowLink, ScreenTitle, Status, cairoDate } from '@/components/platform/ui';

export default async function StudentDashboard({ params }: { params: Promise<{ locale: string }> }) {
  const { locale: raw }=await params;const locale=ensureLocale(raw);const ar=locale==='ar';const me=await requireViewer(locale,'student');const data=await learning(locale);
  const accepted=data.enrollments.filter(x=>x.status==='accepted');const pending=data.enrollments.filter(x=>x.status==='pending');const next=data.lessons.filter(x=>new Date(x.ends_at)>new Date()).slice(0,5);
  return <><ScreenTitle eyebrow={ar?'مساحة الطالب':'Student workspace'} title={`${ar?'أهلاً':'Hello'}, ${me.fullName}`} description={ar?'تابع مجموعاتك وحصصك القادمة وموارد التعلم.':'Keep track of your classes, next lessons, and learning resources.'} action={<Link href={`/${locale}/teachers`} className="rounded-xl bg-orange px-4 py-3 font-bold text-white">{ar?'اكتشف المجموعات':'Find classes'}</Link>}/><div className="grid gap-4 sm:grid-cols-3"><Metric label={ar?'المجموعات المسجل بها':'Active classes'} value={accepted.length}/><Metric label={ar?'طلبات قيد المراجعة':'Pending requests'} value={pending.length}/><Metric label={ar?'الحصص القادمة':'Upcoming lessons'} value={next.length}/></div><Panel className="mt-6"><h2 className="mb-4 text-xl font-black text-teal">{ar?'التالي في جدولك':'Next on your timetable'}</h2>{next.length?<div className="grid gap-3">{next.map(lesson=><RowLink key={lesson.id} href={`/${locale}/student/lessons/${lesson.id}`} title={lesson.title} meta={cairoDate(lesson.starts_at,locale)} trailing={<Status value={lesson.status} locale={locale}/>}/>)}</div>:<EmptyState>{ar?'لا توجد حصص قادمة بعد.':'No upcoming lessons yet.'}</EmptyState>}</Panel></>;
}
