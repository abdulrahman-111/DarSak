import Link from 'next/link';
import { ensureLocale } from '@/i18n/config';
import { requireViewer } from '@/components/platform/access';
import { EmptyState, Panel, ScreenTitle, Status } from '@/components/platform/ui';
import { GroupManagementControls } from '@/features/teacher/management-forms';

export default async function TeacherGroups({ params, searchParams }: { params: Promise<{ locale: string }>; searchParams: Promise<{ deleted?: string }> }) {
  const [{ locale: raw }, query] = await Promise.all([params, searchParams]);
  const locale = ensureLocale(raw);
  const ar = locale === 'ar';
  const me = await requireViewer(locale, 'teacher');
  const groups = await me.db.from('groups')
    .select('id,name,description,status,capacity,location,offering:offerings(subject:subjects(name_ar,name_en))')
    .eq('teacher_id', me.id)
    .order('created_at', { ascending: false });

  return <>
    <ScreenTitle
      eyebrow={ar ? 'إدارة التدريس' : 'Teaching setup'}
      title={ar ? 'مجموعاتي' : 'My groups'}
      description={ar ? 'أنشئ المجموعات كمسودات، ثم استأنف إعداد جدولها قبل النشر.' : 'Create groups as drafts, then resume setup to add their schedules before publishing.'}
      action={<Link href={`/${locale}/teacher/groups/new`} className="rounded-xl bg-teal px-5 py-3 font-bold text-white">{ar ? 'إنشاء مجموعة' : 'Create group'}</Link>}
    />
    {query.deleted === '1' && <Panel className="mb-4"><p role="status" className="text-sm font-semibold text-teal">{ar ? 'تم حذف المجموعة غير المستخدمة.' : 'Unused group deleted.'}</p></Panel>}
    {groups.error ? <Panel><p role="alert" className="text-sm text-red-800">{ar ? 'تعذر تحميل مجموعاتك. حدّث الصفحة وحاول مرة أخرى.' : 'Could not load your groups. Refresh and try again.'}</p></Panel> :
      <div className="grid gap-4">
        {groups.data?.length ? groups.data.map((group: any) => {
          const href = group.status === 'draft'
            ? `/${locale}/teacher/groups/${group.id}/setup?step=details`
            : `/${locale}/teacher/groups/${group.id}`;
          return <article key={group.id} className="rounded-[1.5rem] border border-line bg-white p-5">
            <Link href={href} className="block rounded-xl hover:outline-none focus-visible:ring-2 focus-visible:ring-orange">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-sm font-bold text-orange">{group.offering?.subject?.[ar ? 'name_ar' : 'name_en'] || '—'}</p>
                  <h2 className="mt-1 text-xl font-black text-teal">{group.name}</h2>
                </div>
                <Status value={group.status} locale={locale} />
              </div>
              <p className="mt-3 line-clamp-2 text-sm text-muted">{group.description || '—'}</p>
              <p className="mt-4 text-sm text-muted">{group.location || '—'} · {ar ? 'السعة' : 'Capacity'} {group.capacity}</p>
              <p className="mt-4 text-sm font-bold text-teal">{group.status === 'draft'
                ? ar ? 'استئناف الإعداد ←' : 'Resume setup →'
                : group.status === 'archived' ? ar ? 'عرض السجل ←' : 'View history →' : ar ? 'إدارة المجموعة ←' : 'Manage group →'}</p>
            </Link>
            <div className="mt-4 border-t border-line pt-4">
              <GroupManagementControls locale={locale} groupId={group.id} status={group.status} />
            </div>
          </article>;
        }) : <EmptyState>{ar ? 'لم تنشئ أي مجموعة بعد.' : 'You have not created any groups yet.'}</EmptyState>}
      </div>}
  </>;
}
