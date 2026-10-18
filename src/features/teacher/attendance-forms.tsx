'use client';

import { useActionState } from 'react';
import type { Locale } from '@/features/student/domain';
import { saveLessonAttendance, type AttendanceActionState } from './attendance-actions';
import type { AttendanceRow, AttendanceStatus } from './attendance-data';

const labels: Record<Locale, Record<AttendanceStatus, string>> = {
  en: { present: 'Present', absent: 'Absent', late: 'Late', excused: 'Excused' },
  ar: { present: 'حاضر', absent: 'غائب', late: 'متأخر', excused: 'معذور' },
};

function AttendanceRowForm({ locale, lessonId, row, readOnly }: { locale: Locale; lessonId: string; row: AttendanceRow; readOnly: boolean }) {
  const ar = locale === 'ar';
  const [state, action, pending] = useActionState(async (_previous: AttendanceActionState, form: FormData) => {
    const selected = String(form.get('status') ?? '');
    return saveLessonAttendance(locale, lessonId, row.student_id, selected || null);
  }, null);
  return <form action={action} className="grid gap-2 rounded-2xl border border-line p-4 sm:grid-cols-[1fr_auto] sm:items-center">
    <div className="min-w-0">
      <p className="font-bold text-teal">{row.full_name}</p>
      <p className="mt-1 text-sm text-muted">{row.status ? labels[locale][row.status] : ar ? 'غير مسجل' : 'Not marked'}</p>
      {row.recorded_at && <p className="mt-1 text-xs text-muted">{new Intl.DateTimeFormat(locale === 'ar' ? 'ar' : 'en', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Africa/Cairo' }).format(new Date(row.recorded_at))}</p>}
    </div>
    <div className="flex flex-wrap items-center gap-2">
      <label className="sr-only" htmlFor={`attendance-${row.student_id}`}>{ar ? `حضور ${row.full_name}` : `Attendance for ${row.full_name}`}</label>
      <select id={`attendance-${row.student_id}`} name="status" defaultValue={row.status ?? ''} disabled={readOnly || pending} className="min-h-11 rounded-xl border border-line bg-white px-3 py-2 text-sm">
        <option value="">{ar ? 'مسح العلامة' : 'Clear mark'}</option>
        {(Object.keys(labels[locale]) as AttendanceStatus[]).map(status => <option key={status} value={status}>{labels[locale][status]}</option>)}
      </select>
      <button disabled={readOnly || pending} className="min-h-11 rounded-xl bg-orange px-4 py-2 text-sm font-bold text-white disabled:opacity-50">{pending ? (ar ? 'جارٍ الحفظ…' : 'Saving…') : (ar ? 'حفظ' : 'Save')}</button>
    </div>
    {state?.error && <p role="alert" className="text-sm text-red-700 sm:col-span-2">{state.error}</p>}
    {state?.success && <p role="status" className="text-sm text-teal sm:col-span-2">{state.success}</p>}
  </form>;
}

export function AttendanceRoster({ locale, lessonId, rows, readOnly }: { locale: Locale; lessonId: string; rows: AttendanceRow[]; readOnly: boolean }) {
  const ar = locale === 'ar';
  return <div className="grid gap-3">{rows.length ? rows.map(row => <AttendanceRowForm key={row.student_id} locale={locale} lessonId={lessonId} row={row} readOnly={readOnly} />) : <p className="text-sm text-muted">{ar ? 'لا يوجد طلاب مقبولون في هذه المجموعة.' : 'There are no accepted students in this group.'}</p>}</div>;
}
