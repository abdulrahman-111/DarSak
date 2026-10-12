import { ensureLocale } from '@/i18n/config';
import { requireViewer } from '@/components/platform/access';
import { EmptyState, Panel, ScreenTitle, Status } from '@/components/platform/ui';
import { AdminForm } from '@/features/admin/forms';
import { GroupManagementControls } from '@/features/teacher/management-forms';
import { normalizeStudentPage, STUDENT_PAGE_SIZE, studentPageCount } from '@/features/student/pagination-domain';
import { StudentPagination } from '@/features/student/pagination';

export default async function AdminGroups({ params, searchParams }: { params: Promise<{ locale: string }>; searchParams: Promise<{ deleted?: string; page?: string }> }) {
  const [{ locale: raw }, query] = await Promise.all([params, searchParams]);
  const locale = ensureLocale(raw);
  const ar = locale === 'ar';
  const me = await requireViewer(locale, 'admin');
  const fetchGroups = (page: number) => me.db.from('groups').select('id,name,status,capacity,location,teacher_id', { count: 'exact' })
    .order('created_at', { ascending: false }).order('id', { ascending: false }).range((page - 1) * STUDENT_PAGE_SIZE, page * STUDENT_PAGE_SIZE - 1);
  let page = normalizeStudentPage(query.page);
  let groups = await fetchGroups(page);
  const count = groups.count ?? 0, pageCount = studentPageCount(count);
  if (!groups.error && groups.count != null && page > pageCount) { page = pageCount; groups = await fetchGroups(page); }
  const teacherIds = [...new Set((groups.data || []).map(row => row.teacher_id))];
  const namesResult = teacherIds.length
    ? await me.db.from('profiles').select('id,full_name').in('id', teacherIds)
    : null;
  const teacherMap = new Map((namesResult?.data || []).map(row => [row.id, row.full_name]));
  const failed = groups.error || groups.count == null || namesResult?.error;
  const pageLabels = ar ? { previous: 'السابق', next: 'التالي', page: 'صفحة' } : { previous: 'Previous', next: 'Next', page: 'Page' };

  return <>
    <ScreenTitle
      eyebrow={ar ? 'الإشراف' : 'Oversight'}
      title={ar ? 'المجموعات' : 'Groups'}
      description={ar
        ? 'راجع المجموعات وأرشفها مع الاحتفاظ بسجل الطلاب والحصص.'
        : 'Review groups and archive them while keeping student and lesson history.'}
    />
    {query.deleted === '1' && <Panel className="mb-4"><p role="status" className="text-sm font-semibold text-teal">{ar ? 'تم حذف المجموعة غير المستخدمة.' : 'Unused group deleted.'}</p></Panel>}
    {failed ? <Panel><p role="alert" className="text-sm text-red-800">{ar ? 'تعذر تحميل المجموعات. حدّث الصفحة وحاول مرة أخرى.' : 'Could not load groups. Refresh and try again.'}</p><a href={`/${locale}/admin/groups?retry=1`} className="mt-3 inline-flex font-bold text-orange underline">{ar ? 'إعادة المحاولة' : 'Try again'}</a></Panel>
      : groups.data?.length ? <div className="grid gap-4 lg:grid-cols-2">{groups.data.map(group => <Panel key={group.id}>
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="font-black text-teal">{group.name}</h2>
            <p className="mt-1 text-sm text-muted">{teacherMap.get(group.teacher_id) || '—'} · {group.location || '—'} · {ar ? 'السعة' : 'Capacity'} {group.capacity}</p>
          </div>
          <Status value={group.status} locale={locale} />
        </div>
        <div className="mt-5 border-t border-line pt-5">
          <div className="mb-4">
            <h3 className="mb-2 text-sm font-black text-teal">{ar ? 'النشر والمسودة' : 'Publishing and draft status'}</h3>
            <AdminForm locale={locale} operation="group" id={group.id} fields={[{ name: 'status', label: ar ? 'الحالة' : 'Status', value: group.status === 'published' ? 'published' : 'draft', options: [
              { value: 'draft', label: ar ? 'إعادتها إلى مسودة' : 'Return to draft' },
              { value: 'published', label: ar ? 'نشر المجموعة' : 'Publish group' },
            ] }]} button={ar ? 'حفظ الحالة' : 'Save status'} />
          </div>
          <GroupManagementControls locale={locale} groupId={group.id} status={group.status} />
        </div>
      </Panel>)}</div> : <EmptyState>{ar ? 'لا توجد مجموعات.' : 'No groups found.'}</EmptyState>}
    {!failed && <StudentPagination locale={locale} href={`/${locale}/admin/groups`} page={page} pageCount={pageCount} labels={pageLabels}/>}
  </>;
}
