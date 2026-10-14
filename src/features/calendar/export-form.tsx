'use client';

import { useState } from 'react';
import { safeCalendarFilename, validateCalendarRange } from './domain';

export function CalendarExportForm({ locale, initialFrom, initialUntil }: { locale: 'en' | 'ar'; initialFrom: string; initialUntil: string }) {
  const ar = locale === 'ar';
  const [from, setFrom] = useState(initialFrom);
  const [until, setUntil] = useState(initialUntil);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');
  const [accessDenied,setAccessDenied]=useState(false);
  const copy = ar ? {
    title: 'تصدير التقويم', from: 'من تاريخ', until: 'إلى تاريخ', submit: 'تنزيل ملف التقويم', loading: 'جارٍ تجهيز التقويم…',
    invalid: 'اختر نطاقاً صحيحاً لا يتجاوز ٩٣ يوماً.', tooMany: 'عدد الحصص كبير. اختر نطاقاً زمنياً أقصر.', failed: 'تعذر تنزيل التقويم. تحقق من اتصالك وحاول مرة أخرى.', access: 'انتهت صلاحية التدريس. انتقل إلى صفحة صلاحية التدريس لطلب التجديد.', success: 'تم تنزيل الحصص المحددة. لن يتحدث الملف تلقائياً عند تغيير الجدول.',
    note: 'يتضمن التصدير الحصص المحددة فقط، ولا يتضمن المواعيد الأسبوعية المتكررة. لن يتحدث الملف تلقائياً عند تغيير الجدول.',
  } : {
    title: 'Export calendar', from: 'From date', until: 'Through date', submit: 'Download calendar file', loading: 'Preparing calendar…',
    invalid: 'Choose a valid date range of no more than 93 days.', tooMany: 'Too many lessons. Choose a shorter date range.', failed: 'Could not download the calendar. Check your connection and try again.', access: 'Teaching access has expired. Visit the teaching access page to request renewal.', success: 'The selected lessons were downloaded. This file will not update automatically when the schedule changes.',
    note: 'The export includes dated lessons only, not weekly recurring times. The file will not update automatically when the schedule changes.',
  };

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage('');
    setAccessDenied(false);
    if (!validateCalendarRange(from, until).valid) { setMessage(copy.invalid); return; }
    setLoading(true);
    try {
      const params = new URLSearchParams({ from, until, locale });
      const result = await fetch(`/api/calendar?${params}`, { credentials: 'same-origin' });
      if (!result.ok) {
        const body = await result.json().catch(() => null) as { error?: unknown } | null;
        setAccessDenied(body?.error==='teaching_access_expired');
        setMessage(body?.error === 'teaching_access_expired' ? copy.access : body?.error === 'too_many_lessons' ? copy.tooMany : body?.error === 'invalid_range' ? copy.invalid : copy.failed);
        return;
      }
      const blob = await result.blob();
      const objectUrl = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = objectUrl;
      link.download = safeCalendarFilename(from, until);
      document.body.append(link);
      link.click();
      link.remove();
      window.setTimeout(() => URL.revokeObjectURL(objectUrl), 1000);
      setMessage(copy.success);
    } catch {
      setMessage(copy.failed);
    } finally {
      setLoading(false);
    }
  }

  return <section className="mb-6 min-w-0 rounded-2xl border border-line bg-white p-5">
    <h2 className="text-lg font-black text-teal">{copy.title}</h2>
    <p className="mt-2 break-words text-sm text-muted">{copy.note}</p>
    <form onSubmit={submit} className="mt-4 grid min-w-0 gap-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto] sm:items-end">
      <label className="min-w-0 text-sm font-bold">{copy.from}<input type="date" required disabled={loading} value={from} onChange={event => setFrom(event.target.value)} className="mt-2 block w-full min-w-0 rounded-xl border border-line bg-cream p-3 disabled:opacity-60" /></label>
      <label className="min-w-0 text-sm font-bold">{copy.until}<input type="date" required disabled={loading} value={until} onChange={event => setUntil(event.target.value)} className="mt-2 block w-full min-w-0 rounded-xl border border-line bg-cream p-3 disabled:opacity-60" /></label>
      <button type="submit" disabled={loading} className="rounded-xl bg-teal px-4 py-3 font-bold text-white disabled:opacity-60">{loading ? copy.loading : copy.submit}</button>
    </form>
    {message && <p role={message === copy.success ? 'status' : 'alert'} className="mt-3 break-words text-sm text-muted">{message}{accessDenied&&<> <a className="font-bold text-teal underline" href={`/${locale}/teacher/access`}>{ar?'فتح صفحة الصلاحية':'Open access page'}</a></>}</p>}
  </section>;
}
