import Link from 'next/link';
import { ensureLocale } from '@/i18n/config';
import { EmptyState, Metric, Panel, RowLink, ScreenTitle, Status, cairoDate } from '@/components/platform/ui';
import { teacherOverview } from '@/features/teacher/data';

export default async function TeacherDashboard({ params }: { params: Promise<{ locale: string }> }) {
  const { locale: raw } = await params; const locale = ensureLocale(raw); const ar = locale === 'ar'; const data = await teacherOverview(locale);
  return <><ScreenTitle eyebrow={ar?'مساحة المعلم':'Teacher workspace'} title={`${ar?'مرحباً':'Welcome'}, ${data.me.profile.full_name}`} description={ar?'مجموعاتك وطلبات الطلاب والحصص القادمة في مكان واحد.':'Your groups, student requests, and upcoming lessons in one place.'} action={<Link href={`/${locale}/teacher/groups`} className="rounded-xl bg-orange px-4 py-3 font-bold text-white">{ar?'مجموعة جديدة':'New group'}</Link>}/><div className="grid gap-4 sm:grid-cols-3"><Metric label={ar?'المجموعات':'Groups'} value={data.groups.length}/><Metric label={ar?'طلبات تنتظر الرد':'Pending requests'} value={data.requests.length}/><Metric label={ar?'الحصص القادمة':'Upcoming lessons'} value={data.lessons.length}/></div><Panel className="mt-6"><h2 className="mb-4 text-xl font-black text-teal">{ar?'الحصص القادمة':'Next lessons'}</h2>{data.lessons.length?<div className="grid gap-3">{data.lessons.map(lesson=><RowLink key={lesson.id} href={`/${locale}/teacher/lessons/${lesson.id}`} title={lesson.title} meta={cairoDate(lesson.starts_at,locale)} trailing={<Status value={lesson.status} locale={locale}/>} />)}</div>:<EmptyState>{ar?'لا توجد حصص قادمة.':'No upcoming lessons.'}</EmptyState>}</Panel></>;
}
