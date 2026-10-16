'use client';

import { useActionState, useState } from 'react';
import { createTeacherApplicationCvLink, requestTeacherApplicationChanges, type ApplicationActionState } from './application-actions';

function CvDownload({ locale, teacherId }: { locale: string; teacherId: string }) {
  const ar = locale === 'ar';
  const [state, action, pending] = useActionState<ApplicationActionState, FormData>(createTeacherApplicationCvLink.bind(null, locale), null);
  return <form action={action} className="grid justify-items-start gap-2">
    <input type="hidden" name="teacher_id" value={teacherId}/>
    <button disabled={pending} className="min-h-11 touch-manipulation rounded-xl border border-teal px-4 py-2 font-bold text-teal disabled:opacity-50">
      {pending ? (ar ? 'جارٍ تجهيز التنزيل…' : 'Preparing download…') : (ar ? 'تنزيل السيرة الذاتية الخاصة' : 'Download private CV')}
    </button>
    {state?.url && <a className="min-h-11 rounded-xl bg-teal px-4 py-2 font-bold text-white" href={state.url} target="_blank" rel="noreferrer">{ar ? 'فتح ملف PDF' : 'Open PDF'}</a>}
    {state?.error && <p role="alert" className="text-sm text-red-800">{state.error}</p>}
  </form>;
}

export function RequestApplicationChangesForm({ locale, teacherId, requestId }: { locale: string; teacherId: string; requestId: string }) {
  const ar = locale === 'ar';
  const [reason, setReason] = useState('');
  const [state, action, pending] = useActionState<ApplicationActionState, FormData>(requestTeacherApplicationChanges.bind(null, locale), null);
  return <form action={action} className="grid gap-3">
    <input type="hidden" name="teacher_id" value={teacherId}/>
    <input type="hidden" name="expected_request_id" value={requestId}/>
    <label className="grid gap-2 text-sm font-semibold">
      {ar ? 'التعديلات المطلوبة' : 'Changes requested'}
      <textarea name="reason" value={reason} onChange={event => setReason(event.target.value)} maxLength={1000} required rows={4} className="w-full rounded-xl border border-line bg-cream p-3"/>
    </label>
    <p className="text-sm text-muted">{ar ? 'اكتب ما يحتاج المعلم إلى تحديثه قبل إعادة الإرسال.' : 'Explain what the teacher should update before resubmitting.'}</p>
    {state?.error && <p role="alert" className="rounded-xl bg-red-50 p-3 text-sm text-red-800">{state.error}</p>}
    {state?.success && <p role="status" className="rounded-xl bg-teal/10 p-3 text-sm text-teal">{state.success} {ar ? 'حدّث الصفحة لمراجعة الحالة.' : 'Refresh the page to review the status.'}</p>}
    <button disabled={pending || reason.trim().length === 0} className="min-h-11 touch-manipulation rounded-xl border border-teal px-4 py-2 font-bold text-teal disabled:opacity-50">{pending ? (ar ? 'جارٍ الحفظ…' : 'Saving…') : (ar ? 'طلب التعديلات' : 'Request changes')}</button>
  </form>;
}

export function ApplicationCvDownload(props: { locale: string; teacherId: string }) {
  return <CvDownload {...props}/>;
}
