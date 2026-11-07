import 'server-only';
import { student, type Lesson, type Slot } from './data';
import { idSchema, type Locale } from './domain';
import { classPage, classLessonView, classView, parseClassDetail } from './class-workspace-domain';
import type { StudentResource } from './resource-domain';
import { studentPageCount } from './pagination-domain';
import { getStudentAssignmentPage } from '@/features/assignments/data';

type PageProjection = {
  group: unknown;
  lessons: Lesson[];
  attendance: { lesson_id: string; status: string }[];
  page: number;
  total: number;
};
type OverviewProjection = {
  group: unknown;
  next: Lesson | null;
  slots: Slot[];
  announcement: { body: string; edited_at: string } | null;
};

function isLesson(value: unknown): value is Lesson {
  if (!value || typeof value !== 'object') return false;
  const lesson = value as Partial<Lesson>;
  return (
    typeof lesson.id === 'string' &&
    typeof lesson.group_id === 'string' &&
    typeof lesson.title === 'string' &&
    typeof lesson.starts_at === 'string' &&
    typeof lesson.ends_at === 'string' &&
    typeof lesson.status === 'string'
  );
}

function isSlot(value: unknown): value is Slot {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const slot = value as Partial<Slot>;
  return (
    typeof slot.id === 'string' &&
    typeof slot.group_id === 'string' &&
    Number.isInteger(slot.weekday) &&
    slot.weekday! >= 0 &&
    slot.weekday! <= 6 &&
    typeof slot.start_time === 'string' &&
    typeof slot.end_time === 'string' &&
    typeof slot.timezone === 'string'
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

export async function studentClassWorkspace(
  locale: Locale,
  id: string,
  query: Record<string, string | undefined> = {},
) {
  const me = await student(locale);
  if (!idSchema.safeParse(id).success) return null;
  const view = classView(query.view),
    requestedPage = classPage(query.page),
    lessonView = classLessonView(query.lessons);
  const now = new Date().toISOString();
  let groupValue: unknown;
  let next: Lesson | undefined;
  let slots: Slot[] = [];
  let announcement: OverviewProjection['announcement'] = null;
  let lessons: Lesson[] = [];
  let attendance: PageProjection['attendance'] = [];
  let page = requestedPage;
  let total = 0;
  let error = false;

  if (view === 'lessons') {
    const response = await me.db.rpc('student_class_lessons_page', {
      p_group_id: id,
      p_history: lessonView === 'history',
      p_page: requestedPage,
      p_now: now,
    });
    if (response.error) throw new Error('Student class could not be loaded');
    const projection: unknown = response.data;
    if (projection === null) return null;
    if (
      !isRecord(projection) ||
      !projection.group ||
      !Array.isArray(projection.lessons) ||
      projection.lessons.length > 20 ||
      !projection.lessons.every(isLesson) ||
      !Array.isArray(projection.attendance) ||
      !projection.attendance.every(
        item => item && typeof item.lesson_id === 'string' && typeof item.status === 'string',
      ) ||
      projection.attendance.length > 20 ||
      !Number.isSafeInteger(projection.page) ||
      (projection.page as number) < 1 ||
      (projection.page as number) > 50000 ||
      !Number.isSafeInteger(projection.total) ||
      (projection.total as number) < 0 ||
      (projection.page as number) !==
        Math.min(
          requestedPage,
          Math.min(50000, Math.max(1, Math.ceil((projection.total as number) / 20))),
        )
    )
      throw new Error('Invalid class result');
    groupValue = projection.group;
    lessons = projection.lessons;
    attendance = projection.attendance;
    page = projection.page as number;
    total = projection.total as number;
  } else if (view === 'overview') {
    const response = await me.db.rpc('student_class_overview', { p_group_id: id, p_now: now });
    if (response.error) throw new Error('Student class could not be loaded');
    const projection: unknown = response.data;
    if (projection === null) return null;
    if (
      !isRecord(projection) ||
      !projection.group ||
      !Array.isArray(projection.slots) ||
      projection.slots.length > 100 ||
      !projection.slots.every(isSlot) ||
      (projection.next !== null && !isLesson(projection.next)) ||
      (projection.announcement !== null &&
        (!isRecord(projection.announcement) ||
          typeof projection.announcement.body !== 'string' ||
          typeof projection.announcement.edited_at !== 'string'))
    )
      throw new Error('Invalid class result');
    groupValue = projection.group;
    next = (projection.next as Lesson | null) ?? undefined;
    slots = projection.slots;
    announcement = projection.announcement as OverviewProjection['announcement'];
  } else {
    const access = await me.db.rpc('student_class_detail', { p_group_id: id });
    if (access.error) throw new Error('Student class could not be loaded');
    if (access.data === null) return null;
    groupValue = access.data;
  }
  const group = parseClassDetail(groupValue);
  if (!group) throw new Error('Invalid class result');

  let resources: StudentResource[] = [];
  let assignments: Awaited<ReturnType<typeof getStudentAssignmentPage>>['rows'] = [];
  if (view === 'materials') {
    const fetch = (requested: number) =>
      me.db.rpc('student_resource_page', {
        p_group_id: id,
        p_kind: null,
        p_query: typeof query.q === 'string' ? query.q.trim().slice(0, 100) : '',
        p_offset: (requested - 1) * 20,
        p_limit: 20,
      });
    let result = await fetch(page);
    const payload = result.data as { rows?: StudentResource[]; total?: number } | null;
    total = payload?.total ?? 0;
    page = Math.min(page, studentPageCount(total));
    if (!result.error && page !== requestedPage) result = await fetch(page);
    resources = (result.data as { rows?: StudentResource[] } | null)?.rows ?? [];
    error = !!result.error || payload?.total == null;
  } else if (view === 'assignments') {
    const result = await getStudentAssignmentPage(locale, id, requestedPage);
    assignments = result.rows;
    page = result.page;
    total = result.total;
    error = !!result.error;
  }
  const [contacts] = await Promise.all([
    (view === 'teacher' || view === 'overview') && group.teacher_available
      ? me.db
          .from('teacher_contacts')
          .select('phone_number,whatsapp_number,contact_email')
          .eq('teacher_id', group.teacher_id)
          .maybeSingle()
      : Promise.resolve(null),
  ]);
  return {
    me,
    group,
    view,
    lessonView,
    lessons,
    resources,
    assignments,
    page,
    total,
    pageCount: studentPageCount(total),
    next,
    slots,
    contacts: contacts?.data ?? null,
    announcement,
    attendance,
    error: error || !!contacts?.error,
  };
}
