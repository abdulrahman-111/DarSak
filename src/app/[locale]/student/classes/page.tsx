import Link from 'next/link';
import { ensureLocale } from '@/i18n/config';
import { learning } from '@/features/student/data';
import { EnrollmentForm } from '@/features/student/forms';
import { EmptyState, Panel, QuickAction, ScreenTitle, Status } from '@/components/platform/ui';

export default async function StudentClasses({ params }: { params: Promise<{ locale: string }> }) {
  const { locale: raw } = await params;
  const locale = ensureLocale(raw);
  const ar = locale === 'ar';
  const data = await learning(locale);
  const copy = ar
    ? { eyebrow: 'رحلتك التعليمية', title: 'مجموعاتي وطلباتي', intro: 'تابع حالة طلباتك ووصولك إلى الحصص والموارد.', error: 'تعذر تحميل المجموعات والطلبات. حدّث الصفحة وحاول مرة أخرى.', retry: 'إعادة المحاولة', discover: 'اكتشف المجموعات', materials: 'الحصص والمواد', empty: 'لم تطلب الانضمام إلى مجموعة بعد.', view: 'عرض المجموعة', cancelHelp: 'يمكنك إلغاء الطلب المعلّق أو التسجيل المقبول بعد التأكيد.' }
    : { eyebrow: 'Your learning', title: 'My classes and requests', intro: 'Track enrollment decisions and access to lessons and resources.', error: 'Could not load your classes and requests. Refresh and try again.', retry: 'Try again', discover: 'Find a class', materials: 'Lessons and materials', empty: 'You have not requested a class yet.', view: 'View class', cancelHelp: 'You can cancel a pending request or accepted enrollment after confirming.' };

  return <>
    <ScreenTitle eyebrow={copy.eyebrow} title={copy.title} description={copy.intro}/>
    <div className="mb-6 grid grid-cols-2 gap-3 sm:max-w-xl"><QuickAction href={`/${locale}/teachers`}>{copy.discover}</QuickAction><QuickAction href={`/${locale}/student/materials`}>{copy.materials}</QuickAction></div>
    {data.error ? <Panel><p role="alert" className="text-sm text-red-800">{copy.error}</p><a href={`/${locale}/student/classes?retry=1`} className="mt-3 inline-flex font-bold text-orange underline">{copy.retry}</a></Panel> : data.enrollments.length ? <div className="grid gap-4">
      {data.enrollments.map(enrollment => <Panel key={enrollment.id}>
        <div className="flex flex-wrap items-start justify-between gap-4"><div><h2 className="text-xl font-black text-teal">{enrollment.group?.name || '—'}</h2><p className="mt-2 text-sm text-muted">{enrollment.group?.location || '—'}</p></div><Status value={enrollment.status} locale={locale}/></div>
        <div className="mt-4 flex flex-wrap items-center gap-3">{enrollment.group?.status === 'published' && <Link href={`/${locale}/groups/${enrollment.group_id}`} className="font-bold text-orange underline">{copy.view}</Link>}{enrollment.status === 'accepted' && <Link href={`/${locale}/student/materials`} className="font-bold text-teal underline">{copy.materials}</Link>}</div>
        {['pending', 'accepted'].includes(enrollment.status) && <div className="mt-5 border-t border-line pt-4"><p className="mb-3 text-sm text-muted">{copy.cancelHelp}</p><EnrollmentForm locale={locale} id={enrollment.id} kind="cancel"/></div>}
      </Panel>)}
    </div> : <Panel><EmptyState>{copy.empty}</EmptyState><Link href={`/${locale}/teachers`} className="mt-4 inline-flex rounded-xl bg-teal px-4 py-3 font-bold text-white">{copy.discover}</Link></Panel>}
  </>;
}
