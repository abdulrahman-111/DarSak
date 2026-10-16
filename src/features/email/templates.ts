export type EmailKind = 'teacher_review_requested' | 'teacher_review_approved' | 'teacher_review_declined' | 'enrollment_requested' | 'teacher_renewal' | 'teacher_fee_announcement';
export type EmailMessage = { subject: string; text: string; html: string };
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const safeText = (value: unknown, max: number) => typeof value === 'string' ? value.replace(/[\u0000-\u001f\u007f]/g, ' ').trim().slice(0, max) : '';
const escapeHtml = (value: string) => value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
const link = (origin: string, path: string) => `${origin}${path}`;
const date = (value: unknown) => {
  const raw = safeText(value, 40), time = Date.parse(raw);
  return Number.isFinite(time) ? new Intl.DateTimeFormat('en-GB', { dateStyle: 'medium', timeZone: 'Africa/Cairo' }).format(time) : '';
};

/** Pure, bounded bilingual templates. Payload values are always plain text. */
export function renderEmail(kind: EmailKind, payload: Record<string, unknown>, origin: string): EmailMessage | null {
  let titleEn = '', titleAr = '', detailEn = '', detailAr = '', path = '/teacher/profile';
  if (kind === 'teacher_review_requested' || kind === 'teacher_review_approved' || kind === 'teacher_review_declined') {
    const teacherId = safeText(payload.teacher_id, 36);
    if (!uuid.test(teacherId)) return null;
    const name = safeText(payload.teacher_name, 160);
    if (kind === 'teacher_review_requested') {
      titleEn = 'Teacher review request'; titleAr = 'طلب مراجعة معلم';
      detailEn = name ? `A teacher account (${name}) is awaiting review.` : 'A teacher account is awaiting review.';
      detailAr = name ? `يوجد حساب معلم بانتظار المراجعة (${name}).` : 'يوجد حساب معلم بانتظار المراجعة.';
      path = `/admin/teachers/${teacherId}`;
    } else {
      const approved = kind === 'teacher_review_approved';
      titleEn = approved ? 'Teacher account approved' : 'Teacher account review update';
      titleAr = approved ? 'تم اعتماد حساب المعلم' : 'تحديث مراجعة حساب المعلم';
      detailEn = approved ? 'Your teacher account was approved.' : 'Your teacher account was declined. Sign in to review the decision.';
      detailAr = approved ? 'تم اعتماد حساب المعلم.' : 'تم رفض حساب المعلم. سجّل الدخول لمراجعة القرار.';
    }
  } else if (kind === 'enrollment_requested') {
    const groupId = safeText(payload.group_id, 36), group = safeText(payload.group_name, 160), student = safeText(payload.student_name, 160);
    if (!uuid.test(groupId)) return null;
    titleEn = 'New enrollment request'; titleAr = 'طلب انضمام جديد';
    detailEn = `${student ? `${student} requested` : 'A student requested'} to join ${group ? group : 'your group'}.`;
    detailAr = `${student || 'أحد الطلاب'} طلب الانضمام إلى ${group || 'مجموعتك'}.`;
    path = `/teacher/requests?group_id=${groupId}`;
  } else if (kind === 'teacher_renewal') {
    const starts = date(payload.period_starts_at), expires = date(payload.period_expires_at);
    if (!starts || !expires) return null;
    titleEn = 'Teaching access renewed'; titleAr = 'تم تجديد صلاحية التدريس';
    detailEn = `Your teaching access period runs from ${starts} to ${expires} (Cairo time).`;
    detailAr = `تم تحديث فترة صلاحية التدريس من ${starts} إلى ${expires} بتوقيت القاهرة.`;
    path = '/teacher/access';
  } else if (kind === 'teacher_fee_announcement') {
    const effective = date(payload.effective_at), en = safeText(payload.announcement_en, 1000), ar = safeText(payload.announcement_ar, 1000);
    if (!effective || !en || !ar) return null;
    titleEn = 'Teaching access policy notice'; titleAr = 'إشعار بشأن سياسة صلاحية التدريس';
    detailEn = `${en}\nEffective ${effective} (Cairo time).`;
    detailAr = `${ar}\nيسري اعتباراً من ${effective} بتوقيت القاهرة.`;
    path = '/teacher/access';
  } else return null;
  const urlEn = link(origin, `/en${path}`), urlAr = link(origin, `/ar${path}`);
  const text = `${titleEn}\n${detailEn}\n${urlEn}\n\n${titleAr}\n${detailAr}\n${urlAr}`.slice(0, 5000);
  const html = `<div style="font-family:Arial,sans-serif;line-height:1.7"><h2>${escapeHtml(titleEn)}</h2><p>${escapeHtml(detailEn).replace(/\n/g, '<br>')}</p><p><a href="${escapeHtml(urlEn)}">Open DarSak</a></p><h2 lang="ar" dir="rtl">${escapeHtml(titleAr)}</h2><p lang="ar" dir="rtl">${escapeHtml(detailAr).replace(/\n/g, '<br>')}</p><p dir="rtl"><a href="${escapeHtml(urlAr)}">فتح درسك</a></p></div>`;
  return { subject: `${titleEn} / ${titleAr}`.slice(0, 180), text, html };
}
