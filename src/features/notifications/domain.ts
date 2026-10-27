export type NotificationKind =
  | 'lesson_rescheduled'
  | 'lesson_cancelled'
  | 'group_cancelled'
  | 'weekly_schedule_changed'
  | 'enrollment_requested'
  | 'teacher_review_decision'
  | 'teacher_fee_announcement'
  | 'enrollment_accepted'
  | 'waitlist_promoted'
  | 'booking_updated';
export type NotificationRow = {
  id: string;
  kind: NotificationKind;
  payload: Record<string, unknown>;
  created_at: string;
  read_at: string | null;
};
export type NotificationsPage = { rows: NotificationRow[]; total: number; unread: number };
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const KINDS = new Set<NotificationKind>([
  'lesson_rescheduled',
  'lesson_cancelled',
  'group_cancelled',
  'weekly_schedule_changed',
  'enrollment_requested',
  'teacher_review_decision',
  'teacher_fee_announcement',
  'enrollment_accepted',
  'waitlist_promoted',
  'booking_updated',
]);

export function parseNotificationsPage(value: unknown): NotificationsPage | null {
  if (!value || typeof value !== 'object') return null;
  const data = value as Record<string, unknown>;
  if (
    !Array.isArray(data.rows) ||
    data.rows.length > 20 ||
    !Number.isSafeInteger(data.total) ||
    (data.total as number) < 0 ||
    !Number.isSafeInteger(data.unread) ||
    (data.unread as number) < 0
  )
    return null;
  const rows: NotificationRow[] = [];
  for (const item of data.rows.slice(0, 20)) {
    if (!item || typeof item !== 'object') return null;
    const row = item as Record<string, unknown>;
    if (
      typeof row.id !== 'string' ||
      !UUID.test(row.id) ||
      typeof row.kind !== 'string' ||
      !KINDS.has(row.kind as NotificationKind) ||
      !row.payload ||
      typeof row.payload !== 'object' ||
      Array.isArray(row.payload) ||
      typeof row.created_at !== 'string' ||
      !Number.isFinite(Date.parse(row.created_at)) ||
      !(
        row.read_at === null ||
        (typeof row.read_at === 'string' && Number.isFinite(Date.parse(row.read_at)))
      )
    )
      return null;
    rows.push({
      id: row.id,
      kind: row.kind as NotificationKind,
      payload: row.payload as Record<string, unknown>,
      created_at: row.created_at,
      read_at: row.read_at as string | null,
    });
  }
  return { rows, total: data.total as number, unread: data.unread as number };
}

function id(payload: Record<string, unknown>, key: string) {
  const value = payload[key];
  return typeof value === 'string' && UUID.test(value) ? value : null;
}
export function notificationHref(
  role: 'student' | 'teacher',
  kind: string,
  payload: Record<string, unknown>,
  locale: string,
): string | null {
  if (locale !== 'en' && locale !== 'ar') return null;
  if (role === 'student') {
    if (kind === 'booking_updated') return `/${locale}/student/bookings`;
    if (kind === 'waitlist_promoted') return `/${locale}/student/classes`;
    if (kind === 'enrollment_accepted') {
      const value = id(payload, 'group_id');
      return value
        ? `/${locale}/student/classes/${value}?view=teacher&welcome=1#teacher-contact`
        : null;
    }
    if (kind === 'lesson_rescheduled' || kind === 'lesson_cancelled') {
      const value = id(payload, 'lesson_id');
      return value ? `/${locale}/student/lessons/${value}` : null;
    }
    if (kind === 'group_cancelled') return `/${locale}/student/classes`;
    if (kind === 'weekly_schedule_changed') {
      const value = id(payload, 'group_id');
      return value ? `/${locale}/groups/${value}` : `/${locale}/student/classes`;
    }
  }
  if (role === 'teacher' && kind === 'enrollment_requested') {
    const value = id(payload, 'group_id');
    return value ? `/${locale}/teacher/requests?group_id=${value}` : `/${locale}/teacher/requests`;
  }
  if (role === 'teacher' && kind === 'booking_updated') return `/${locale}/teacher/bookings`;
  if (role === 'teacher' && kind === 'teacher_review_decision')
    return `/${locale}/account/application`;
  if (role === 'teacher' && kind === 'teacher_fee_announcement')
    return `/${locale}/account/teaching-access`;
  return null;
}

function text(payload: Record<string, unknown>, key: string, fallback: string) {
  const value = payload[key];
  return typeof value === 'string' ? value.slice(0, 160) : fallback;
}
export function notificationSummary(
  kind: string,
  payload: Record<string, unknown>,
  locale: string,
): string | null {
  const ar = locale === 'ar';
  if (kind === 'lesson_rescheduled') {
    const raw = payload.starts_at;
    const when =
      typeof raw === 'string' && Number.isFinite(Date.parse(raw))
        ? new Intl.DateTimeFormat(ar ? 'ar-EG' : 'en-GB', {
            dateStyle: 'medium',
            timeStyle: 'short',
            timeZone: 'Africa/Cairo',
          }).format(new Date(raw))
        : '';
    return ar
      ? `تم تغيير موعد حصة ${text(payload, 'title', '')} إلى ${when}`
      : `Lesson time changed: ${text(payload, 'title', '')} is now ${when}`;
  }
  if (kind === 'lesson_cancelled')
    return ar
      ? `أُلغيت حصة ${text(payload, 'title', '')}`
      : `Lesson cancelled: ${text(payload, 'title', '')}`;
  if (kind === 'group_cancelled')
    return ar
      ? `تم إيقاف مجموعة ${text(payload, 'group_name', '')}`
      : `Group ended: ${text(payload, 'group_name', '')}`;
  if (kind === 'weekly_schedule_changed')
    return ar
      ? `تغيّرت المواعيد الأسبوعية لمجموعة ${text(payload, 'group_name', '')}. الحصص المحددة لم تتغير.`
      : `Weekly times changed for ${text(payload, 'group_name', '')}. Existing dated lessons are unchanged.`;
  if (kind === 'enrollment_requested')
    return ar
      ? `${text(payload, 'student_name', 'طالب')} طلب الانضمام إلى ${text(payload, 'group_name', 'مجموعة')}`
      : `${text(payload, 'student_name', 'A student')} requested to join ${text(payload, 'group_name', 'a group')}`;
  if (kind === 'enrollment_accepted')
    return ar
      ? `تم قبولك! افتح ${text(payload, 'group_name', 'مجموعتك')} للتواصل مع معلمك والاستعداد لأول حصة.`
      : `You're accepted! Open ${text(payload, 'group_name', 'your group')} to contact your teacher and prepare for your first lesson.`;
  if (kind === 'waitlist_promoted')
    return ar
      ? `أصبح إدخالك في قائمة الانتظار طلب انضمام إلى ${text(payload, 'group_name', 'المجموعة')} بانتظار المراجعة. لم يتأكد المقعد بعد.`
      : `Your waitlist entry for ${text(payload, 'group_name', 'the group')} is now an enrollment request awaiting review. A place is not confirmed.`;
  if (kind === 'teacher_review_requested')
    return ar
      ? `${text(payload, 'teacher_name', 'معلم')} طلب مراجعة حسابه`
      : `${text(payload, 'teacher_name', 'A teacher')} requested account review`;
  if (kind === 'teacher_review_decision')
    return payload.decision === 'approved'
      ? ar
        ? 'تمت الموافقة على حسابك'
        : 'Your account was approved'
      : ar
        ? 'تم رفض طلب المراجعة'
        : 'Your review request was declined';
  if (kind === 'teacher_fee_announcement') {
    const announcement = payload[ar ? 'announcement_ar' : 'announcement_en'];
    const raw = payload.effective_at;
    const when =
      typeof raw === 'string' && Number.isFinite(Date.parse(raw))
        ? new Intl.DateTimeFormat(ar ? 'ar-EG' : 'en-GB', {
            dateStyle: 'medium',
            timeStyle: 'short',
            timeZone: 'Africa/Cairo',
          }).format(new Date(raw))
        : '';
    if (typeof announcement !== 'string' || !announcement.trim() || announcement.length > 1000)
      return ar ? 'تحديث جديد عن صلاحية التدريس.' : 'A new teaching access update.';
    return `${announcement.slice(0, 1000)}${when ? (ar ? ` يبدأ في ${when} بتوقيت القاهرة.` : ` Effective ${when} Africa/Cairo.`) : ''}`;
  }
  if (kind === 'booking_updated') {
    const status = payload.status;
    const group = text(payload, 'group_name', ar ? 'المجموعة' : 'the group');
    const whenRaw = payload.starts_at;
    const when =
      typeof whenRaw === 'string' && Number.isFinite(Date.parse(whenRaw))
        ? new Intl.DateTimeFormat(ar ? 'ar-EG' : 'en-GB', {
            dateStyle: 'medium',
            timeStyle: 'short',
            timeZone: 'Africa/Cairo',
          }).format(new Date(whenRaw))
        : '';
    const actor = text(payload, ar ? 'student_name' : 'student_name', ar ? 'طالب' : 'A student');
    if (status === 'pending')
      return ar
        ? `${actor} طلب حجز موعد فردي في ${group}${when ? ` يوم ${when}` : ''}.`
        : `${actor} requested a one-off booking for ${group}${when ? ` on ${when}` : ''}.`;
    const labels: Record<string, [string, string]> = {
      accepted: ['تم قبول طلب الموعد الفردي', 'Your one-off booking was accepted'],
      declined: ['تم رفض طلب الموعد الفردي', 'Your one-off booking was declined'],
      withdrawn: ['أُلغي طلب الموعد الفردي', 'The one-off booking request was withdrawn'],
      cancelled: ['أُلغي الموعد الفردي', 'The one-off booking was cancelled'],
    };
    const label = typeof status === 'string' ? labels[status] : undefined;
    return label
      ? ar
        ? `${label[0]}: ${group}${when ? ` — ${when}` : ''}`
        : `${label[1]}: ${group}${when ? ` — ${when}` : ''}`
      : ar
        ? `تحديث على موعد فردي في ${group}.`
        : `There is an update to a one-off booking for ${group}.`;
  }
  return null;
}
