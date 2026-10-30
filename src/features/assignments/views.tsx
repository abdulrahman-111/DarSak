import Link from 'next/link';
import { ArrowUpRight, ClipboardList } from 'lucide-react';
import type { Locale } from '@/features/student/domain';
import type { Assignment, TeacherAssignmentSubmission } from './domain';
import {
  ArchiveAssignmentForm,
  AssignmentForm,
  ReviewAssignmentForm,
  StudentSubmissionForm,
} from './forms';

export { AssignmentForm } from './forms';

export function assignmentDate(value: string | null, locale: Locale) {
  if (!value) return locale === 'ar' ? 'بلا موعد نهائي' : 'No deadline';
  return new Intl.DateTimeFormat(locale === 'ar' ? 'ar-EG' : 'en-GB', {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: 'Africa/Cairo',
  }).format(new Date(value));
}

function ExternalLink({ href, label }: { href: string; label: string }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="inline-flex min-h-11 max-w-full items-center gap-2 break-all font-semibold text-teal underline"
    >
      <span className="break-all">{label}</span>
      <ArrowUpRight size={15} className="shrink-0" aria-hidden="true" />
    </a>
  );
}

export function StudentAssignments({
  locale,
  assignments,
  groupStatus,
}: {
  locale: Locale;
  assignments: Assignment[];
  groupStatus: string;
}) {
  const ar = locale === 'ar';
  return assignments.length ? (
    <div className="grid min-w-0 gap-4">
      {assignments.map(assignment => (
        <article
          key={assignment.id}
          className="grid min-w-0 gap-4 rounded-2xl border border-line bg-white p-4 sm:p-5"
        >
          <div className="flex min-w-0 items-start gap-3">
            <span className="rounded-xl bg-teal/5 p-3 text-teal">
              <ClipboardList size={20} />
            </span>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="wrap-break-word text-lg font-bold text-teal">{assignment.title}</h2>
                {assignment.status === 'archived' && (
                  <span className="rounded-full bg-cream px-3 py-1 text-xs font-bold text-muted">
                    {ar ? 'مؤرشف' : 'Archived'}
                  </span>
                )}
              </div>
              <p className="mt-1 text-sm text-muted">
                {ar ? 'الموعد النهائي: ' : 'Deadline: '}
                {assignmentDate(assignment.due_at, locale)}
              </p>
            </div>
          </div>
          {assignment.instructions && (
            <p className="whitespace-pre-wrap wrap-break-word text-sm leading-6 text-ink">
              {assignment.instructions}
            </p>
          )}
          {assignment.resource_url && (
            <ExternalLink
              href={assignment.resource_url}
              label={ar ? 'فتح مورد الواجب' : 'Open assignment resource'}
            />
          )}
          {assignment.status === 'published' && groupStatus === 'published' && (
            <p className="text-xs leading-5 text-muted">
              {ar
                ? 'يظهر هذا الواجب لجميع الطلاب المقبولين في المجموعة، بمن فيهم من انضموا بعد نشره.'
                : 'This assignment is available to every accepted student in the class, including students who joined after it was published.'}
            </p>
          )}
          {assignment.submission ? (
            <div className="grid min-w-0 gap-3 border-t border-line pt-4">
              <h3 className="font-bold text-teal">{ar ? 'تسليمك' : 'Your submission'}</h3>
              <ExternalLink href={assignment.submission.url} label={assignment.submission.url} />
              {assignment.submission.student_note && (
                <p className="whitespace-pre-wrap wrap-break-word text-sm text-muted">
                  {assignment.submission.student_note}
                </p>
              )}
              <p className="text-sm text-muted">
                {assignment.submission.is_late
                  ? ar
                    ? 'آخر تحديث بعد الموعد النهائي.'
                    : 'Last update was after the deadline.'
                  : ar
                    ? 'آخر تحديث: '
                    : 'Last updated: '}
                {assignmentDate(assignment.submission.last_submitted_at, locale)}
              </p>
              <p className="text-xs leading-5 text-muted">
                {ar
                  ? 'قد يؤثر تعديل الموعد النهائي في تصنيف التأخير.'
                  : 'Changing the deadline can change the late classification.'}
              </p>
              {assignment.submission.teacher_feedback ? (
                <div className="rounded-xl border border-teal/15 bg-teal/5 p-3">
                  <p className="text-xs font-bold uppercase text-teal">
                    {ar ? 'ملاحظات خاصة من المعلم' : 'Private teacher feedback'}
                  </p>
                  <p className="mt-2 whitespace-pre-wrap wrap-break-word text-sm leading-6">
                    {assignment.submission.teacher_feedback}
                  </p>
                </div>
              ) : (
                <p className="text-sm text-muted">
                  {ar
                    ? 'لم يراجع المعلم هذا التسليم بعد.'
                    : 'Your teacher has not reviewed this submission yet.'}
                </p>
              )}
            </div>
          ) : null}
          {assignment.status === 'published' && (
            <StudentSubmissionForm
              key={`${assignment.id}:${assignment.submission?.revision ?? 0}`}
              locale={locale}
              assignment={assignment}
              archivedGroup={groupStatus !== 'published'}
            />
          )}
          {assignment.status === 'archived' && !assignment.submission && (
            <p className="text-sm text-muted">
              {ar
                ? 'تمت أرشفة الواجب قبل تسليمك.'
                : 'This assignment was archived before you submitted.'}
            </p>
          )}
        </article>
      ))}
    </div>
  ) : (
    <div className="rounded-2xl border border-line bg-white p-6 text-center">
      <ClipboardList size={26} className="mx-auto text-teal" />
      <h2 className="mt-3 font-bold text-teal">
        {ar ? 'لا توجد واجبات بعد' : 'No assignments yet'}
      </h2>
      <p className="mt-2 text-sm text-muted">
        {ar
          ? 'ستظهر هنا الواجبات التي ينشرها معلمك.'
          : 'Assignments from your teacher will appear here.'}
      </p>
    </div>
  );
}

export function TeacherAssignmentList({
  locale,
  groupId,
  assignments,
  groupArchived,
  canWrite,
  editId,
  page,
}: {
  locale: Locale;
  groupId: string;
  assignments: Assignment[];
  groupArchived: boolean;
  canWrite: boolean;
  editId?: string;
  page: number;
}) {
  const ar = locale === 'ar';
  return assignments.length ? (
    <div className="grid min-w-0 gap-4">
      {assignments.map(assignment => (
        <article
          key={assignment.id}
          className="grid min-w-0 gap-4 rounded-2xl border border-line bg-white p-4 sm:p-5"
        >
          <div className="flex min-w-0 flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <h2 className="wrap-break-word text-lg font-bold text-teal">{assignment.title}</h2>
              <p className="mt-1 text-sm text-muted">
                {ar ? 'الموعد النهائي: ' : 'Deadline: '}
                {assignmentDate(assignment.due_at, locale)}
              </p>
              <p className="mt-1 text-sm text-muted">
                {ar
                  ? `التسليمات: ${assignment.submitted_count ?? 0} · الطلاب المقبولون: ${assignment.accepted_student_count ?? 0}`
                  : `Submissions: ${assignment.submitted_count ?? 0} · Accepted students: ${assignment.accepted_student_count ?? 0}`}
              </p>
            </div>
            <span className="rounded-full bg-cream px-3 py-1 text-xs font-bold text-muted">
              {assignment.status === 'archived'
                ? ar
                  ? 'مؤرشف'
                  : 'Archived'
                : ar
                  ? 'منشور'
                  : 'Published'}
            </span>
          </div>
          {assignment.status === 'published' &&
          editId === assignment.id &&
          !groupArchived &&
          canWrite ? (
            <AssignmentForm
              key={`${assignment.id}:${assignment.version}`}
              locale={locale}
              groupId={groupId}
              assignment={assignment}
            />
          ) : (
            <>
              {assignment.instructions && (
                <p className="whitespace-pre-wrap wrap-break-word text-sm leading-6">
                  {assignment.instructions}
                </p>
              )}
              {assignment.resource_url && (
                <ExternalLink
                  href={assignment.resource_url}
                  label={ar ? 'فتح المورد' : 'Open resource'}
                />
              )}
              <div className="flex flex-wrap gap-2">
                <Link
                  href={`/${locale}/teacher/groups/${groupId}/assignments/${assignment.id}`}
                  className="inline-flex min-h-11 items-center rounded-xl bg-teal px-4 font-bold text-white"
                >
                  {ar ? 'مراجعة التسليمات' : 'Review submissions'}
                </Link>
                {assignment.status === 'published' && !groupArchived && canWrite && (
                  <Link
                    href={`/${locale}/teacher/groups/${groupId}/assignments?page=${page}&edit=${assignment.id}`}
                    className="inline-flex min-h-11 items-center rounded-xl border border-line px-4 font-bold text-teal"
                  >
                    {ar ? 'تعديل' : 'Edit'}
                  </Link>
                )}
              </div>
              {assignment.status === 'published' && !groupArchived && canWrite && (
                <ArchiveAssignmentForm locale={locale} assignment={assignment} />
              )}
            </>
          )}
        </article>
      ))}
    </div>
  ) : (
    <p className="rounded-2xl border border-line bg-white p-6 text-sm text-muted">
      {ar ? 'لم تُنشر واجبات بعد.' : 'No assignments have been published yet.'}
    </p>
  );
}

export function TeacherSubmissionRows({
  locale,
  submissions,
  readOnly,
  hasDeadline,
}: {
  locale: Locale;
  submissions: TeacherAssignmentSubmission[];
  readOnly: boolean;
  hasDeadline: boolean;
}) {
  const ar = locale === 'ar';
  return submissions.length ? (
    <div className="grid min-w-0 gap-4">
      {submissions.map(row => {
        const reviewDisabled = readOnly || row.enrollment_status !== 'accepted';
        return (
          <article
            key={row.id}
            className="grid min-w-0 gap-4 rounded-2xl border border-line bg-white p-4 sm:p-5"
          >
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div className="min-w-0">
                <h2 className="wrap-break-word font-bold text-teal">{row.student_name}</h2>
                <p className="mt-1 text-xs text-muted">
                  {row.enrollment_status === 'accepted'
                    ? ar
                      ? 'مقبول'
                      : 'Accepted'
                    : ar
                      ? 'لم يعد الطالب مقبولًا'
                      : 'Student is no longer accepted'}
                </p>
              </div>
              <p className="text-sm font-semibold text-muted">
                {!hasDeadline
                  ? ar
                    ? 'بلا موعد نهائي · تم التسليم'
                    : 'No deadline · Submitted'
                  : row.is_late
                    ? ar
                      ? 'متأخر'
                      : 'Late'
                    : ar
                      ? 'في الموعد'
                      : 'On time'}
              </p>
            </div>
            <ExternalLink href={row.url} label={row.url} />
            {row.student_note && (
              <p className="whitespace-pre-wrap wrap-break-word rounded-xl bg-cream p-3 text-sm leading-6">
                {row.student_note}
              </p>
            )}
            <p className="text-xs leading-5 text-muted">
              {ar ? 'أول تسليم: ' : 'First submitted: '}
              {assignmentDate(row.first_submitted_at, locale)}
              <br />
              {ar ? 'آخر تحديث: ' : 'Last updated: '}
              {assignmentDate(row.last_submitted_at, locale)}
            </p>
            {reviewDisabled && (
              <p className="text-sm text-muted">
                {ar
                  ? 'المراجعة غير متاحة أثناء القراءة فقط أو لأن العضوية لم تعد مقبولة.'
                  : 'Review is unavailable in read-only history or because the enrollment is no longer accepted.'}
              </p>
            )}
            <ReviewAssignmentForm
              key={`${row.id}:${row.revision}`}
              locale={locale}
              submissionId={row.id}
              revision={row.revision}
              feedback={row.teacher_feedback}
              disabled={reviewDisabled}
            />
          </article>
        );
      })}
    </div>
  ) : (
    <p className="rounded-2xl border border-line bg-white p-6 text-sm text-muted">
      {ar ? 'لا توجد تسليمات بعد.' : 'No submissions yet.'}
    </p>
  );
}
