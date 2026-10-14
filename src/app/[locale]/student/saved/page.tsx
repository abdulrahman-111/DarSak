import Link from 'next/link';
import { ensureLocale } from '@/i18n/config';
import { EmptyState, Panel, ScreenTitle } from '@/components/platform/ui';
import { StudentPagination } from '@/features/student/pagination';
import { savedGroups } from '@/features/student/saved-data';
import { SavedGroupForm } from '@/features/student/saved-form';

export default async function SavedGroupsPage({ params, searchParams }: { params: Promise<{ locale: string }>; searchParams?: Promise<{ page?: string }> }) {
  const { locale: raw } = await params;
  const locale = ensureLocale(raw);
  const ar = locale === 'ar';
  const search = await searchParams;
  const data = await savedGroups(locale, search?.page);
  const copy = ar
    ? { eyebrow: 'خطتك التعليمية', title: 'المجموعات المحفوظة', intro: 'احتفظ بالمجموعات التي تريد مراجعتها لاحقًا.', error: 'تعذّر تحميل قائمتك. حدّث الصفحة وحاول مرة أخرى.', unavailable: 'هذه المجموعة غير متاحة حاليًا.', empty: 'لم تحفظ أي مجموعة بعد.', discover: 'اكتشف المجموعات', view: 'عرض المجموعة', page: 'صفحة', previous: 'السابق', next: 'التالي' }
    : { eyebrow: 'Your learning plan', title: 'Saved groups', intro: 'Keep groups you want to review later in one place.', error: 'Could not load your list. Refresh and try again.', unavailable: 'This group is currently unavailable.', empty: 'You have not saved a group yet.', discover: 'Find groups', view: 'View group', page: 'Page', previous: 'Previous', next: 'Next' };
  return <>
    <ScreenTitle eyebrow={copy.eyebrow} title={copy.title} description={copy.intro}/>
    {data.error ? <Panel><p role="alert" className="text-sm text-red-800">{copy.error}</p></Panel> : data.rows.length ? <div className="grid gap-4">
      {data.rows.map(item => <Panel key={item.id}>
        {item.available && item.group_name ? <><h2 className="text-xl font-black text-teal">{item.group_name}</h2><div className="mt-4 flex flex-wrap items-center gap-4"><Link href={`/${locale}/groups/${item.group_id}`} className="font-bold text-orange underline">{copy.view}</Link><SavedGroupForm locale={locale} groupId={item.group_id} saved/></div></> : <><p role="status" className="font-semibold text-muted">{copy.unavailable}</p><div className="mt-3"><SavedGroupForm locale={locale} groupId={item.group_id} saved/></div></>}
      </Panel>)}
    </div> : <Panel><EmptyState>{copy.empty}</EmptyState><Link href={`/${locale}/teachers`} className="mt-4 inline-flex rounded-xl bg-teal px-4 py-3 font-bold text-white">{copy.discover}</Link></Panel>}
    {!data.error && <StudentPagination locale={locale} href={`/${locale}/student/saved`} page={data.page} pageCount={data.pageCount} labels={{ page: copy.page, previous: copy.previous, next: copy.next }}/>}
  </>;
}
