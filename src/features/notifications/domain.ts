import type { PlatformRole } from '@/components/platform/access';

export type NotificationKind = 'lesson_rescheduled' | 'lesson_cancelled' | 'group_cancelled' | 'weekly_schedule_changed' | 'enrollment_requested' | 'teacher_review_requested' | 'teacher_review_decision';
export type NotificationRow = { id: string; kind: NotificationKind; payload: Record<string, unknown>; created_at: string; read_at: string | null };
export type NotificationsPage = { rows: NotificationRow[]; total: number; unread: number };
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const KINDS = new Set<NotificationKind>(['lesson_rescheduled','lesson_cancelled','group_cancelled','weekly_schedule_changed','enrollment_requested','teacher_review_requested','teacher_review_decision']);

export function parseNotificationsPage(value: unknown): NotificationsPage | null {
  if (!value || typeof value !== 'object') return null;
  const data = value as Record<string, unknown>;
  if (!Array.isArray(data.rows) || data.rows.length>20 || !Number.isSafeInteger(data.total) || (data.total as number)<0 || !Number.isSafeInteger(data.unread) || (data.unread as number)<0) return null;
  const rows: NotificationRow[] = [];
  for (const item of data.rows.slice(0,20)) {
    if (!item || typeof item !== 'object') return null;
    const row = item as Record<string, unknown>;
    if (typeof row.id!=='string' || !UUID.test(row.id) || typeof row.kind!=='string' || !KINDS.has(row.kind as NotificationKind) || !row.payload || typeof row.payload!=='object' || Array.isArray(row.payload) || typeof row.created_at!=='string' || !Number.isFinite(Date.parse(row.created_at)) || !(row.read_at===null || (typeof row.read_at==='string'&&Number.isFinite(Date.parse(row.read_at))))) return null;
    rows.push({ id:row.id,kind:row.kind as NotificationKind,payload:row.payload as Record<string,unknown>,created_at:row.created_at,read_at:row.read_at as string|null });
  }
  return { rows,total:data.total as number,unread:data.unread as number };
}

function id(payload: Record<string, unknown>, key: string) { const value=payload[key]; return typeof value==='string' && UUID.test(value) ? value : null; }
export function notificationHref(role: PlatformRole, kind: string, payload: Record<string, unknown>, locale: string): string | null {
  if (locale!=='en' && locale!=='ar') return null;
  if (role==='student') {
    if (kind==='lesson_rescheduled' || kind==='lesson_cancelled') { const value=id(payload,'lesson_id'); return value?`/${locale}/student/lessons/${value}`:null; }
    if (kind==='group_cancelled') return `/${locale}/student/classes`;
    if (kind==='weekly_schedule_changed') { const value=id(payload,'group_id'); return value?`/${locale}/groups/${value}`:`/${locale}/student/classes`; }
  }
  if (role==='teacher' && kind==='enrollment_requested') { const value=id(payload,'group_id'); return value?`/${locale}/teacher/requests?group_id=${value}`:`/${locale}/teacher/requests`; }
  if (role==='admin' && kind==='teacher_review_requested') { const value=id(payload,'teacher_id'); return value?`/${locale}/admin/teachers/${value}`:`/${locale}/admin/teachers`; }
  if (role==='teacher' && kind==='teacher_review_decision') return `/${locale}/teacher/profile`;
  return null;
}

function text(payload: Record<string,unknown>, key: string, fallback: string) { const value=payload[key]; return typeof value==='string' ? value.slice(0,160) : fallback; }
export function notificationSummary(kind: string, payload: Record<string,unknown>, locale: string): string | null {
  const ar=locale==='ar';
  if (kind==='lesson_rescheduled') {
    const raw=payload.starts_at;
    const when=typeof raw==='string'&&Number.isFinite(Date.parse(raw))?new Intl.DateTimeFormat(ar?'ar-EG':'en-GB',{dateStyle:'medium',timeStyle:'short',timeZone:'Africa/Cairo'}).format(new Date(raw)):'';
    return ar?`تم تغيير موعد حصة ${text(payload,'title','')} إلى ${when}`:`Lesson time changed: ${text(payload,'title','')} is now ${when}`;
  }
  if (kind==='lesson_cancelled') return ar?`أُلغيت حصة ${text(payload,'title','')}`:`Lesson cancelled: ${text(payload,'title','')}`;
  if (kind==='group_cancelled') return ar?`تم إيقاف مجموعة ${text(payload,'group_name','')}`:`Group ended: ${text(payload,'group_name','')}`;
  if (kind==='weekly_schedule_changed') return ar?`تغيّرت المواعيد الأسبوعية لمجموعة ${text(payload,'group_name','')}. الحصص المحددة لم تتغير.`:`Weekly times changed for ${text(payload,'group_name','')}. Existing dated lessons are unchanged.`;
  if (kind==='enrollment_requested') return ar?`${text(payload,'student_name','طالب')} طلب الانضمام إلى ${text(payload,'group_name','مجموعة')}`:`${text(payload,'student_name','A student')} requested to join ${text(payload,'group_name','a group')}`;
  if (kind==='teacher_review_requested') return ar?`${text(payload,'teacher_name','معلم')} طلب مراجعة حسابه`:`${text(payload,'teacher_name','A teacher')} requested account review`;
  if (kind==='teacher_review_decision') return payload.decision==='approved'?(ar?'تمت الموافقة على حسابك':'Your account was approved'):(ar?'تم رفض طلب المراجعة':'Your review request was declined');
  return null;
}
