import { ensureLocale } from '@/i18n/config';
import { requireViewer } from '@/components/platform/access';
import { EmptyState, Panel, ScreenTitle, Status } from '@/components/platform/ui';
import { GroupManagementControls } from '@/features/teacher/management-forms';

export default async function AdminGroups({ params }: { params: Promise<{ locale: string }> }) {
  const { locale: raw } = await params;
  const locale = ensureLocale(raw);
  const ar = locale === 'ar';
  const me = await requireViewer(locale, 'admin');
  const groups = await me.db.from('groups').select('id,name,status,capacity,location,teacher_id')
    .order('created_at', { ascending: false }).limit(100);
  const teacherIds = [...new Set((groups.data || []).map(row => row.teacher_id))];
  const namesResult = teacherIds.length
    ? await me.db.from('profiles').select('id,full_name').in('id', teacherIds)
    : null;
  const teacherMap = new Map((namesResult?.data || []).map(row => [row.id, row.full_name]));
  const failed = groups.error || namesResult?.error;

  return <>
    <ScreenTitle
      eyebrow={ar ? 'الإشراف' : 'Oversight'}
      title={ar ? 'المجموعات' : 'Groups'}
      description={ar
        ? 'راجع المجموعات وأرشفها مع الاحتفاظ بسجل الطلاب والحصص.'
        : 'Review groups and archive them while keeping student and lesson history.'}
    />
    {failed ? <Panel><p role="alert" className="text-sm text-red-800">{ar ? 'تعذر تحميل المجموعات. حدّث الصفحة وحاول مرة أخرى.' : 'Could not load groups. Refresh and try again.'}</p></Panel>
      : groups.data?.length ? <div className="grid gap-4 lg:grid-cols-2">{groups.data.map(group => <Panel key={group.id}>
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="font-black text-teal">{group.name}</h2>
            <p className="mt-1 text-sm text-muted">{teacherMap.get(group.teacher_id) || '—'} · {group.location || '—'} · {ar ? 'السعة' : 'Capacity'} {group.capacity}</p>
          </div>
          <Status value={group.status} locale={locale} />
        </div>
        <div className="mt-5 border-t border-line pt-5">
          <GroupManagementControls locale={locale} groupId={group.id} status={group.status} />
        </div>
      </Panel>)}</div> : <EmptyState>{ar ? 'لا توجد مجموعات.' : 'No groups found.'}</EmptyState>}
  </>;
}
