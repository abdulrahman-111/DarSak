import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { notFound } from 'next/navigation';
import { ensureLocale } from '@/i18n/config';
import { teacherIdentity } from '@/features/teacher/data';
import { checkTeachingAccess } from '@/features/teacher-access/guard';
import { Panel, ScreenTitle } from '@/components/platform/ui';
import { getTeacherAssignmentSubmissions } from '@/features/assignments/data';
import { assignmentDate, TeacherSubmissionRows } from '@/features/assignments/views';
import { StudentPagination } from '@/features/student/pagination';

export default async function TeacherAssignmentDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string; id: string; assignmentId: string }>;
  searchParams: Promise<{ page?: string }>;
}) {
  const [{ locale: raw, id, assignmentId }, query] = await Promise.all([params, searchParams]);
  const locale = ensureLocale(raw);
  const ar = locale === 'ar';
  const me = await teacherIdentity(locale);
  const [{ data: assignment }, { data: group }, teachingAccess] = await Promise.all([
    me.db
      .from('group_assignments')
      .select('id,group_id,title,instructions,resource_url,due_at,status,version,created_at')
      .eq('id', assignmentId)
      .eq('group_id', id)
      .maybeSingle(),
    me.db
      .from('groups')
      .select('id,name,status')
      .eq('id', id)
      .eq('teacher_id', me.id)
      .maybeSingle(),
    checkTeachingAccess(me.db),
  ]);
  if (!assignment || !group) notFound();
  const data = await getTeacherAssignmentSubmissions(locale, assignmentId, query.page);
  const groupArchived = group.status === 'archived';
  const groupUnavailable = group.status !== 'published';
  const readOnly = assignment.status === 'archived' || groupUnavailable || !teachingAccess.allowed;
  return (
    <div className="screen-enter mx-auto w-full max-w-6xl min-w-0 px-4 py-6 sm:px-6">
      <Link
        href={`/${locale}/teacher/groups/${id}/assignments`}
        className="mb-4 inline-flex min-h-11 items-center font-bold text-teal underline"
      >
        <ArrowLeft size={16} className="rtl:rotate-180" aria-hidden="true" />
        {ar ? 'جميع الواجبات' : 'All assignments'}
      </Link>
      <ScreenTitle
        eyebrow={group.name}
        title={assignment.title}
        description={
          ar
            ? `الموعد النهائي: ${assignmentDate(assignment.due_at, locale)}`
            : `Deadline: ${assignmentDate(assignment.due_at, locale)}`
        }
      />
      {assignment.instructions && (
        <Panel className="mb-5">
          <p className="whitespace-pre-wrap break-words text-sm leading-6">
            {assignment.instructions}
          </p>
        </Panel>
      )}
      {assignment.resource_url && (
        <Panel className="mb-5 min-w-0">
          <a
            href={assignment.resource_url}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex min-h-11 max-w-full break-all font-semibold text-teal underline"
          >
            {ar ? 'فتح مورد الواجب' : 'Open assignment resource'}
          </a>
        </Panel>
      )}
      {readOnly && (
        <Panel className="mb-5">
          <p className="text-sm leading-6 text-muted">
            {assignment.status === 'archived' || groupArchived
              ? ar
                ? 'هذا الواجب أو المجموعة مؤرشف. يمكنك مراجعة السجل فقط.'
                : 'This assignment or class is archived. You can review history only.'
              : !teachingAccess.allowed
                ? ar
                  ? 'انتهت صلاحية التدريس. يمكنك مراجعة السجل فقط.'
                  : 'Teaching access has expired. You can review history only.'
                : ar
                  ? 'المجموعة غير منشورة؛ يمكنك مراجعة السجل فقط.'
                  : 'This class is not published. You can review history only.'}
          </p>
        </Panel>
      )}
      <section className="grid min-w-0 gap-4">
        <h2 className="text-lg font-bold text-teal">{ar ? 'التسليمات' : 'Submissions'}</h2>
        {data.error ? (
          <p
            role="alert"
            className="rounded-xl border border-danger/20 bg-white p-4 text-sm text-danger"
          >
            {ar
              ? 'تعذر تحميل التسليمات. حدّث الصفحة للمحاولة مجددًا.'
              : 'Submissions could not be loaded. Refresh to try again.'}
          </p>
        ) : (
          <TeacherSubmissionRows
            locale={locale}
            submissions={data.rows}
            readOnly={readOnly}
            hasDeadline={assignment.due_at !== null}
          />
        )}
        <StudentPagination
          locale={locale}
          href={`/${locale}/teacher/groups/${id}/assignments/${assignmentId}`}
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
