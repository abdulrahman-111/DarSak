import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { notFound } from 'next/navigation';
import { ensureLocale } from '@/i18n/config';
import { teacherIdentity } from '@/features/teacher/data';
import { checkTeachingAccess } from '@/features/teacher-access/guard';
import { Panel, ScreenTitle } from '@/components/platform/ui';
import { getTeacherAssignmentPage } from '@/features/assignments/data';
import { AssignmentForm, TeacherAssignmentList } from '@/features/assignments/views';
import { StudentPagination } from '@/features/student/pagination';

export default async function TeacherAssignmentsPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string; id: string }>;
  searchParams: Promise<{ page?: string; edit?: string }>;
}) {
  const [{ locale: raw, id }, query] = await Promise.all([params, searchParams]);
  const locale = ensureLocale(raw);
  const ar = locale === 'ar';
  const me = await teacherIdentity(locale);
  const [group, data, teachingAccess] = await Promise.all([
    me.db
      .from('groups')
      .select('id,name,status')
      .eq('id', id)
      .eq('teacher_id', me.id)
      .maybeSingle(),
    getTeacherAssignmentPage(locale, id, query.page),
    checkTeachingAccess(me.db),
  ]);
  if (!group.data) notFound();
  const archived = group.data.status === 'archived';
  const groupUnavailable = group.data.status !== 'published';
  const canWrite = !groupUnavailable && teachingAccess.allowed;
  return (
    <div className="screen-enter mx-auto w-full max-w-6xl min-w-0 px-4 py-6 sm:px-6">
      <Link
        href={`/${locale}/teacher/groups/${id}`}
        className="mb-4 inline-flex min-h-11 items-center font-bold text-teal underline"
      >
        <ArrowLeft size={16} className="rtl:rotate-180" aria-hidden="true" />
        {ar ? 'تفاصيل المجموعة' : 'Group details'}
      </Link>
      <ScreenTitle
        eyebrow={ar ? 'إدارة المجموعة' : 'Group management'}
        title={ar ? 'الواجبات' : 'Assignments'}
        description={group.data.name}
      />
      {groupUnavailable && (
        <Panel className="mb-5">
          <p className="text-sm leading-6 text-muted">
            {archived
              ? ar
                ? 'المجموعة مؤرشفة. يمكنك مراجعة الواجبات والتسليمات المحفوظة فقط.'
                : 'This class is archived. Assignments and saved submissions are available for review only.'
              : ar
                ? 'المجموعة غير منشورة؛ الواجبات للقراءة فقط.'
                : 'This class is not published; assignments are read only.'}
          </p>
        </Panel>
      )}
      {!teachingAccess.allowed && !groupUnavailable && (
        <Panel className="mb-5">
          <p className="text-sm leading-6 text-muted">
            {ar
              ? 'انتهت صلاحية التدريس. يمكنك مراجعة الواجبات والتسليمات المحفوظة، لكن لا يمكنك إجراء تغييرات.'
              : 'Teaching access has expired. You can review assignments and saved submissions, but cannot make changes.'}
          </p>
        </Panel>
      )}
      {canWrite && (
        <Panel className="mb-6 min-w-0">
          <h2 className="mb-4 text-lg font-bold text-teal">
            {ar ? 'نشر واجب' : 'Publish assignment'}
          </h2>
          <AssignmentForm key={`${id}:${data.total}`} locale={locale} groupId={id} />
        </Panel>
      )}
      <section className="grid min-w-0 gap-4">
        <h2 className="text-lg font-bold text-teal">
          {ar ? 'الواجبات المنشورة والمؤرشفة' : 'Published and archived assignments'}
        </h2>
        {data.error ? (
          <p
            role="alert"
            className="rounded-xl border border-danger/20 bg-white p-4 text-sm text-danger"
          >
            {ar
              ? 'تعذر تحميل الواجبات. حدّث الصفحة للمحاولة مجددًا.'
              : 'Assignments could not be loaded. Refresh to try again.'}
          </p>
        ) : (
          <TeacherAssignmentList
            locale={locale}
            groupId={id}
            assignments={data.rows}
            groupArchived={groupUnavailable}
            canWrite={canWrite}
            editId={query.edit}
            page={data.page}
          />
        )}
        <StudentPagination
          locale={locale}
          href={`/${locale}/teacher/groups/${id}/assignments`}
          page={data.page}
          pageCount={data.pageCount}
          labels={
            ar
              ? { previous: 'السابق', next: 'التالي', page: 'صفحة' }
              : { previous: 'Previous', next: 'Next', page: 'Page' }
          }
        />
      </section>
    </div>
  );
}
