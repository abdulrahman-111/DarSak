export type EmailKind =
  | 'teacher_review_requested'
  | 'teacher_review_approved'
  | 'teacher_review_declined'
  | 'enrollment_requested'
  | 'teacher_renewal'
  | 'teacher_fee_announcement'
  | 'lesson_reminder';
export type EmailMessage = { subject: string; text: string; html: string };
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const safeText = (value: unknown, max: number) =>
  typeof value === 'string'
    ? value
        .replace(/[\u0000-\u001f\u007f]/g, ' ')
        .trim()
        .slice(0, max)
    : '';
/**
 * Breaks URL- and domain-looking runs in user-supplied text so mail clients do not
 * auto-link them: "://" becomes "[://]" (no longer a scheme) and a dot between two
 * alphanumerics becomes "[.]" (no longer a domain). Applied after safeText, before escapeHtml.
 */
export const defangUserText = (value: string) =>
  value.replace(/:\/\//g, '[://]').replace(/(?<=[A-Za-z0-9])\.(?=[A-Za-z0-9])/g, '[.]');
const escapeHtml = (value: string) =>
  value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
const link = (origin: string, path: string) =>
  path.startsWith('https://') ? path : `${origin}${path}`;
const dateTime = (value: unknown, locale: 'en-GB' | 'ar-EG') => {
  const time = Date.parse(safeText(value, 40));
  return Number.isFinite(time)
    ? new Intl.DateTimeFormat(locale, {
        dateStyle: 'medium',
        timeStyle: 'short',
        timeZone: 'Africa/Cairo',
      }).format(time)
    : '';
};
const date = (value: unknown) => {
  const raw = safeText(value, 40),
    time = Date.parse(raw);
  return Number.isFinite(time)
    ? new Intl.DateTimeFormat('en-GB', { dateStyle: 'medium', timeZone: 'Africa/Cairo' }).format(
        time,
      )
    : '';
};

/** Pure, bounded bilingual templates. Payload values are always plain text. */
export function renderEmail(
  kind: EmailKind,
  payload: Record<string, unknown>,
  origin: string,
): EmailMessage | null {
  let titleEn = '',
    titleAr = '',
    detailEn = '',
    detailAr = '',
    path = '/account/application';
  if (
    kind === 'teacher_review_requested' ||
    kind === 'teacher_review_approved' ||
    kind === 'teacher_review_declined'
  ) {
    const teacherId = safeText(payload.teacher_id, 36);
    if (!uuid.test(teacherId)) return null;
    const name = defangUserText(safeText(payload.teacher_name, 160));
    if (kind === 'teacher_review_requested') {
      titleEn = 'Teacher review request';
      titleAr = 'طلب مراجعة معلم';
      detailEn = name
        ? `A teacher account (${name}) is awaiting review.`
        : 'A teacher account is awaiting review.';
      detailAr = name
        ? `يوجد حساب معلم بانتظار المراجعة (${name}).`
        : 'يوجد حساب معلم بانتظار المراجعة.';
      path = `https://darsak-admin-portal.vercel.app/admin/teachers/${teacherId}`;
    } else {
      const approved = kind === 'teacher_review_approved';
      titleEn = approved ? 'Teacher account approved' : 'Teacher account review update';
      titleAr = approved ? 'تم اعتماد حساب المعلم' : 'تحديث مراجعة حساب المعلم';
      detailEn = approved
        ? 'Your teacher account was approved.'
        : 'Your teacher account was declined. Sign in to review the decision.';
      detailAr = approved
        ? 'تم اعتماد حساب المعلم.'
        : 'تم رفض حساب المعلم. سجّل الدخول لمراجعة القرار.';
    }
  } else if (kind === 'enrollment_requested') {
    const groupId = safeText(payload.group_id, 36),
      group = defangUserText(safeText(payload.group_name, 160)),
      student = defangUserText(safeText(payload.student_name, 160));
    if (!uuid.test(groupId)) return null;
    titleEn = 'New enrollment request';
    titleAr = 'طلب انضمام جديد';
    detailEn = `${student ? `A student ("${student}") requested` : 'A student requested'} to join ${group ? `"${group}"` : 'your group'}.`;
    detailAr = `${student ? `الطالب ("${student}") طلب` : 'أحد الطلاب طلب'} الانضمام إلى ${group ? `"${group}"` : 'مجموعتك'}.`;
    path = `/teacher/requests?group_id=${groupId}`;
  } else if (kind === 'teacher_renewal') {
    const starts = date(payload.period_starts_at),
      expires = date(payload.period_expires_at);
    if (!starts || !expires) return null;
    titleEn = 'Teaching access renewed';
    titleAr = 'تم تجديد صلاحية التدريس';
    detailEn = `Your teaching access period runs from ${starts} to ${expires} (Cairo time).`;
    detailAr = `تم تحديث فترة صلاحية التدريس من ${starts} إلى ${expires} بتوقيت القاهرة.`;
    path = '/account/teaching-access';
  } else if (kind === 'teacher_fee_announcement') {
    const effective = date(payload.effective_at),
      en = safeText(payload.announcement_en, 1000),
      ar = safeText(payload.announcement_ar, 1000);
    if (!effective || !en || !ar) return null;
    titleEn = 'Teaching access policy notice';
    titleAr = 'إشعار بشأن سياسة صلاحية التدريس';
    detailEn = `${en}\nEffective ${effective} (Cairo time).`;
    detailAr = `${ar}\nيسري اعتباراً من ${effective} بتوقيت القاهرة.`;
    path = '/account/teaching-access';
  } else if (kind === 'lesson_reminder') {
    const lessonId = safeText(payload.lesson_id, 36),
      offset = payload.offset,
      role = payload.role,
      group = defangUserText(safeText(payload.group_name, 160)),
      lesson = defangUserText(safeText(payload.title, 160)),
      whenEn = dateTime(payload.starts_at, 'en-GB'),
      whenAr = dateTime(payload.starts_at, 'ar-EG');
    if (!uuid.test(lessonId) || !whenEn || (offset !== '24h' && offset !== '1h')) return null;
    if (role !== 'student' && role !== 'teacher') return null;
    const soonEn = offset === '1h' ? 'in about 1 hour' : 'tomorrow',
      soonAr = offset === '1h' ? 'بعد نحو ساعة' : 'غداً';
    const label = (name: string, fallback: string) => (name ? `"${name}"` : fallback);
    titleEn = offset === '1h' ? 'Lesson starts in 1 hour' : 'Lesson reminder: tomorrow';
    titleAr = offset === '1h' ? 'تبدأ الحصة بعد ساعة' : 'تذكير بحصة غداً';
    detailEn = `${label(lesson, 'Your lesson')}${group ? ` (${label(group, '')})` : ''} starts ${soonEn}, on ${whenEn} (Cairo time).\nCheck DarSak for the latest time before you go.`;
    detailAr = `تبدأ حصة ${label(lesson, 'حصتك')}${group ? ` (${label(group, '')})` : ''} ${soonAr}، يوم ${whenAr} بتوقيت القاهرة.\nراجع درسك للتأكد من آخر موعد قبل الذهاب.`;
    path = `/${role}/lessons/${lessonId}`;
  } else return null;
  const localizedUrl = (locale: 'en' | 'ar') =>
    path.startsWith('https://')
      ? path.replace('/admin/', `/${locale}/admin/`)
      : link(origin, `/${locale}${path}`);
  const urlEn = localizedUrl('en');
  const urlAr = localizedUrl('ar');
  const text = `${titleEn}\n${detailEn}\n${urlEn}\n\n${titleAr}\n${detailAr}\n${urlAr}`.slice(
    0,
    5000,
  );
  const html = `<div style="font-family:Arial,sans-serif;line-height:1.7"><h2>${escapeHtml(titleEn)}</h2><p>${escapeHtml(detailEn).replace(/\n/g, '<br>')}</p><p><a href="${escapeHtml(urlEn)}">Open DarSak</a></p><h2 lang="ar" dir="rtl">${escapeHtml(titleAr)}</h2><p lang="ar" dir="rtl">${escapeHtml(detailAr).replace(/\n/g, '<br>')}</p><p dir="rtl"><a href="${escapeHtml(urlAr)}">فتح درسك</a></p></div>`;
  return { subject: `${titleEn} / ${titleAr}`.slice(0, 180), text, html };
}
