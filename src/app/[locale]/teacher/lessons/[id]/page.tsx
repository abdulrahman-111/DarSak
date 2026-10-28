import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ensureLocale } from '@/i18n/config';
import { loadWithTeachingAccess } from '@/features/teacher/teaching-access-gate';
import { LessonForm } from '@/components/platform/forms';
import { TeacherMaterialForms } from '@/components/platform/actions';
import { EmptyState, Panel, ScreenTitle, Status, cairoDate } from '@/components/platform/ui';
import {
  CopyLessonForm,
  DeleteLessonMaterialButton,
  LessonShortcutStatusControls,
} from '@/features/teacher/shortcuts-forms';
import { DeleteManualTeacherLessonForm } from '@/features/teacher/management-forms';
import { AttendanceRoster } from '@/features/teacher/attendance-forms';
import {
  attendancePageCount as getAttendancePageCount,
  attendancePageHref,
  clampAttendancePage,
  normalizeAttendancePage,
  teacherAttendancePage,
} from '@/features/teacher/attendance-data';

export default async function TeacherLesson({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string; id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const [{ locale: raw, id }, query] = await Promise.all([params, searchParams]);
  const locale = ensureLocale(raw);
  const ar = locale === 'ar';
  const requestedPage = normalizeAttendancePage(
    Array.isArray(query.attendance_page) ? query.attendance_page[0] : query.attendance_page,
  );
  // One parallel batch: access check, the lesson itself and everything keyed by the lesson id.
  // Materials, attendance and the teacher's own groups are RLS-scoped, so reading them
  // before ownership of the lesson is confirmed exposes nothing; they are dropped on notFound().
  const {
    me,
    data: [lessonResult, materials, groups, approval, requestedAttendance],
  } = await loadWithTeachingAccess(locale, me =>
    Promise.all([
      me.db
        .from('lessons')
        .select(
          'id,group_id,title,starts_at,ends_at,status,notes,slot_id,local_date,group:groups!inner(id,name,teacher_id,status)',
        )
        .eq('id', id)
        .eq('group.teacher_id', me.id)
        .maybeSingle(),
      me.db
        .from('lesson_materials')
        .select('id,title,kind,url,content,file_size,mime_type')
        .eq('lesson_id', id)
        .order('created_at'),
      me.db
        .from('groups')
        .select('id,name')
        .eq('teacher_id', me.id)
        .neq('status', 'archived')
        .order('name')
        .order('id'),
      me.db.from('teacher_profiles').select('approved').eq('id', me.id).maybeSingle(),
      teacherAttendancePage(me.db, id, (requestedPage - 1) * 20),
    ]),
  );
  if (!lessonResult.data) notFound();
  const lesson = lessonResult.data;
  const group = Array.isArray(lesson.group) ? lesson.group[0] : lesson.group;
  if (!group) notFound();
  const archived = group.status === 'archived';
  const attendancePageCount = requestedAttendance
    ? getAttendancePageCount(requestedAttendance.total)
    : 1;
  const currentPage = requestedAttendance
    ? clampAttendancePage(requestedPage, requestedAttendance.total)
    : 1;
  const attendance =
    currentPage === requestedPage
      ? requestedAttendance
      : await teacherAttendancePage(me.db, id, (currentPage - 1) * 20);
  const future = lesson.starts_at > new Date().toISOString();
  const attendanceReadOnly =
    archived || lesson.status === 'cancelled' || future || approval.data?.approved !== true;
  const canOfferDelete =
    lesson.slot_id === null &&
    lesson.starts_at > new Date().toISOString() &&
    lesson.status !== 'completed' &&
    !materials.error &&
    !materials.data?.length;

  const copy = ar
    ? {
        workspace: 'مساحة الحصة',
        edit: 'تعديل التفاصيل',
        status: 'حالة الحصة',
        resources: 'مواد الحصة',
        note: 'ملاحظة',
        link: 'رابط',
        file: 'ملف',
        privateHint: 'الملفات خاصة بطلاب المجموعة المقبولين.',
        copyLesson: 'نسخ الحصة إلى مجموعة أخرى',
        copyHint: 'سيتم نسخ العنوان والملاحظات فقط. لن يتم نسخ الملفات أو المواد الخاصة.',
        materialsError: 'تعذر تحميل المواد.',
        back: 'العودة إلى المجموعة',
        archived:
          'المجموعة مؤرشفة. يمكنك مراجعة هذه الحصة وموادها، لكن لا يمكن إضافة أو تعديل محتوى جديد.',
        generatedHint: 'الحصة مرتبطة بموعد متكرر أو بتاريخ محفوظ؛ ألغها بدلًا من حذف سجلها.',
        materialDeleteHint:
          'احذف مواد الحصة أولاً. ستمنع الملفات المخزنة حذف الحصة حتى بعد إزالة بيانات المادة.',
        attendance: 'سجل الحضور',
        notApproved: 'يمكنك مراجعة السجل، لكن يلزم اعتماد المعلم لتعديل الحضور.',
        readonly: 'الحضور للقراءة فقط للحصص المستقبلية أو الملغاة والمجموعات المؤرشفة.',
        attendanceError: 'تعذر تحميل سجل الحضور.',
        previous: 'السابق',
        next: 'التالي',
        deleteUnavailable:
          'لا يمكن حذف الحصص المكتملة أو الماضية. يمكنك إلغاء الحصة القادمة أو الاحتفاظ بالسجل.',
      }
    : {
        workspace: 'Lesson workspace',
        edit: 'Edit details',
        status: 'Lesson status',
        resources: 'Lesson materials',
        note: 'Note',
        link: 'Link',
        file: 'File',
        privateHint: 'Resources are private to accepted students.',
        copyLesson: 'Copy lesson to a group',
        copyHint:
          'Only the title and notes will be copied. Private files and materials stay with this lesson.',
        materialsError: 'Could not load lesson materials.',
        back: 'Back to group',
        archived:
          'The group is archived. You can review this lesson and its materials, but cannot add or change new content.',
        generatedHint:
          'This lesson has a recurring or saved date identity. Cancel it instead of deleting its history.',
        materialDeleteHint:
          'Remove lesson materials first. Stored files must also be removed before the lesson can be deleted.',
        attendance: 'Attendance',
        notApproved:
          'You can review attendance history, but teacher approval is required to edit it.',
        readonly: 'Attendance is read only for future or cancelled lessons and archived groups.',
        attendanceError: 'Could not load attendance history.',
        previous: 'Previous',
        next: 'Next',
        deleteUnavailable:
          'Past or completed lessons cannot be deleted. Cancel a future lesson or keep its history.',
      };

  return (
    <>
      <Link
        href={`/${locale}/teacher/groups/${lesson.group_id}`}
        className="mb-4 inline-flex font-bold text-teal underline"
      >
        ← {copy.back}
      </Link>
      {archived && (
        <Panel className="mb-6">
          <p className="text-sm font-semibold text-muted">{copy.archived}</p>
        </Panel>
      )}
      <ScreenTitle
        eyebrow={copy.workspace}
        title={lesson.title}
        description={cairoDate(lesson.starts_at, locale)}
        action={<Status value={lesson.status} locale={locale} />}
      />
      <div className="grid gap-6 xl:grid-cols-[.8fr_1.2fr]">
        <div className="grid content-start gap-6">
          <Panel>
            <h2 className="mb-4 text-xl font-black text-teal">{copy.edit}</h2>
            {!archived && <LessonForm locale={locale} groupId={lesson.group_id} lesson={lesson} />}
            {!archived && (
              <div className="mt-6 border-t border-line pt-5">
                <h3 className="mb-3 font-black text-teal">{copy.status}</h3>
                <LessonShortcutStatusControls
                  locale={locale}
                  lessonId={id}
                  status={lesson.status}
                />
              </div>
            )}
            {!archived && canOfferDelete && (
              <div className="mt-6 border-t border-line pt-5">
                <DeleteManualTeacherLessonForm
                  locale={locale}
                  lessonId={id}
                  groupId={lesson.group_id}
                />
              </div>
            )}
            {!archived && !canOfferDelete && (
              <p className="mt-4 border-t border-line pt-4 text-sm text-muted">
                {lesson.slot_id !== null
                  ? copy.generatedHint
                  : materials.data?.length
                    ? copy.materialDeleteHint
                    : copy.deleteUnavailable}
              </p>
            )}
          </Panel>
          {!archived && (
            <Panel>
              <h2 className="text-xl font-black text-teal">{copy.copyLesson}</h2>
              <p className="mt-2 text-sm text-muted">{copy.copyHint}</p>
              {groups.error ? (
                <p role="alert" className="mt-4 text-sm text-danger">
                  {ar ? 'تعذر تحميل مجموعاتك.' : 'Could not load your groups.'}
                </p>
              ) : (
                <div className="mt-4">
                  <CopyLessonForm locale={locale} sourceLessonId={id} groups={groups.data ?? []} />
                </div>
              )}
            </Panel>
          )}
        </div>
        <Panel id="materials" className="scroll-mt-24">
          <div className="flex items-baseline justify-between gap-3">
            <h2 className="text-xl font-black text-teal">{copy.resources}</h2>
            <span className="text-sm text-muted">{(materials.data ?? []).length}</span>
          </div>
          <p className="mt-2 text-sm text-muted">{copy.privateHint}</p>
          {materials.error ? (
            <p role="alert" className="mt-4 text-sm text-danger">
              {copy.materialsError}
            </p>
          ) : (
            <div className="mt-5 grid gap-3">
              {materials.data?.length ? (
                materials.data.map(material => (
                  <div key={material.id} className="min-w-0 rounded-2xl border border-line p-4">
                    <div className="flex items-center justify-between gap-3">
                      <div className="min-w-0">
                        <strong className="break-words text-teal [overflow-wrap:anywhere]">
                          {material.title}
                        </strong>
                        <span className="ms-2 rounded-lg bg-cream px-2 py-1 text-xs font-bold">
                          {material.kind === 'note'
                            ? copy.note
                            : material.kind === 'link'
                              ? copy.link
                              : copy.file}
                        </span>
                      </div>
                      <DeleteLessonMaterialButton
                        locale={locale}
                        lessonId={id}
                        materialId={material.id}
                      />
                    </div>
                    {material.kind === 'note' && (
                      <p className="mt-2 whitespace-pre-wrap break-words text-sm text-muted [overflow-wrap:anywhere]">
                        {material.content}
                      </p>
                    )}
                    {material.kind === 'link' && (
                      <p className="mt-2 break-all text-sm text-orange" dir="ltr">
                        {material.url}
                      </p>
                    )}
                    {material.kind === 'file' && (
                      <p className="mt-2 text-sm text-muted">
                        {material.mime_type} ·{' '}
                        {material.file_size ? `${Math.ceil(material.file_size / 1024)} KB` : '—'}
                      </p>
                    )}
                  </div>
                ))
              ) : (
                <EmptyState>{ar ? 'لا توجد مواد بعد.' : 'No materials yet.'}</EmptyState>
              )}
            </div>
          )}
          {!archived && (
            <div className="mt-6 border-t border-line pt-5">
              <TeacherMaterialForms locale={locale} lessonId={id} />
            </div>
          )}
        </Panel>
        <Panel id="attendance" className="scroll-mt-24 xl:col-span-2">
          <div className="mb-4 flex items-baseline justify-between gap-3">
            <div>
              <h2 className="text-xl font-black text-teal">{copy.attendance}</h2>
              <p className="mt-1 text-sm text-muted">{attendance ? `${attendance.total}` : ''}</p>
            </div>
            <span className="text-sm text-muted">
              {attendance ? `${currentPage} / ${attendancePageCount}` : ''}
            </span>
          </div>
          {attendanceReadOnly && (
            <p className="mb-4 text-sm text-muted">
              {approval.data?.approved !== true ? copy.notApproved : copy.readonly}
            </p>
          )}
          {!attendance ? (
            <p role="alert" className="text-sm text-danger">
              {copy.attendanceError}
            </p>
          ) : (
            <>
              <AttendanceRoster
                locale={locale}
                lessonId={id}
                rows={attendance.rows}
                readOnly={attendanceReadOnly}
              />
              {attendancePageCount > 1 && (
                <nav aria-label={copy.attendance} className="mt-5 flex justify-between gap-3">
                  {currentPage > 1 ? (
                    <Link
                      className="font-bold text-orange underline"
                      href={attendancePageHref(locale, id, currentPage - 1, query)}
                    >
                      ← {copy.previous}
                    </Link>
                  ) : (
                    <span />
                  )}
                  {currentPage < attendancePageCount ? (
                    <Link
                      className="font-bold text-orange underline"
                      href={attendancePageHref(locale, id, currentPage + 1, query)}
                    >
                      {copy.next} →
                    </Link>
                  ) : (
                    <span />
                  )}
                </nav>
              )}
            </>
          )}
        </Panel>
      </div>
    </>
  );
}
