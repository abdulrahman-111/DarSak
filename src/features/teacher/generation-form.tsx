'use client';

import Link from 'next/link';
import { useEffect, useMemo, useRef, useState, useTransition } from 'react';
import type { Locale } from '@/features/student/domain';
import { canConfirmGeneration, generationRangeSchema, isCurrentConflictFreePreview, summarizeGenerationPreview, type GenerationPreviewRow } from './generation-domain';
import { confirmLessonGeneration, previewLessons, saveLessonExclusions } from './generation-actions';

type Props = {
  locale: Locale;
  groupId: string;
  savedExclusions: string[];
  mode?: 'generate' | 'preview';
  initialRange?: { from: string; until: string };
  onRangeChange?: (range: { from: string; until: string }) => void;
  onPreviewValidityChange?: (state: { valid: boolean; range: { from: string; until: string } }) => void;
};

const copy = (locale: Locale) => locale === 'ar' ? {
  range: 'نطاق التواريخ', from: 'من', until: 'إلى', preview: 'معاينة الحصص', previewing: 'جارٍ تحميل المعاينة…',
  exclusions: 'أيام مستثناة', exclusionHint: 'احفظ الأيام المستثناة قبل تحديث المعاينة.', addDate: 'أضف تاريخاً', add: 'إضافة', saveExclusions: 'حفظ الأيام المستثناة', saving: 'جارٍ الحفظ…',
  rangeError: 'أدخل تاريخين صحيحين ضمن نطاق لا يتجاوز 90 يوماً.', maxDates: 'يمكن حفظ حتى 366 تاريخاً مميزاً.', duplicate: 'هذا التاريخ موجود بالفعل.',
  ready: 'جاهزة', already_generated: 'تم إنشاؤها', excluded: 'مستثناة', conflicting: 'متعارضة',
  confirm: 'إنشاء الحصص الجاهزة', generating: 'جارٍ الإنشاء…', noRows: 'لا توجد مواعيد أسبوعية ضمن النطاق المحدد.', blocked: 'حل التعارضات قبل إنشاء الحصص.',
  group: 'المجموعة', openConflict: 'فتح الحصة المتعارضة', saveSuccess: 'تم حفظ الأيام المستثناة.', generated: 'تم إنشاء {count} حصة.',
  previewError: 'تعذر تحميل المعاينة. تحقق من النطاق والجدول وحاول مرة أخرى.', generationError: 'تعذر إنشاء الحصص. حدّث المعاينة وراجع أي تعارضات.',
  exclusionError: 'تعذر حفظ الأيام المستثناة. ستبقى تغييراتك هنا؛ حاول مرة أخرى.',
  emptyDate: 'اختر تاريخاً صحيحاً.',
} : {
  range: 'Date range', from: 'From', until: 'Until', preview: 'Preview lessons', previewing: 'Loading preview…',
  exclusions: 'Excluded days', exclusionHint: 'Save excluded days before refreshing the preview.', addDate: 'Add a date', add: 'Add', saveExclusions: 'Save excluded days', saving: 'Saving…',
  rangeError: 'Enter valid dates within a range of 90 days or less.', maxDates: 'You can save up to 366 distinct dates.', duplicate: 'That date is already listed.',
  ready: 'Ready', already_generated: 'Already generated', excluded: 'Excluded', conflicting: 'Conflicting',
  confirm: 'Generate ready lessons', generating: 'Generating…', noRows: 'There are no weekly times in this date range.', blocked: 'Resolve conflicts before generating lessons.',
  group: 'Group', openConflict: 'Open conflicting lesson', saveSuccess: 'Excluded days saved.', generated: 'Created {count} lessons.',
  previewError: 'Could not load the preview. Check the date range and schedule, then try again.', generationError: 'Generation could not be completed. Refresh the preview and review any conflicts.',
  exclusionError: 'Could not save excluded days. Your changes are still available here; try again.',
  emptyDate: 'Choose a valid date.',
};

export function GenerationPreviewForm({ locale, groupId, savedExclusions, mode = 'generate', initialRange = { from: '', until: '' }, onRangeChange, onPreviewValidityChange }: Props) {
  const t = copy(locale);
  const { from: initialFrom, until: initialUntil } = initialRange;
  const [from, setFrom] = useState(initialRange.from);
  const [until, setUntil] = useState(initialRange.until);
  const [savedDates, setSavedDates] = useState(() => [...savedExclusions].sort());
  const [editDates, setEditDates] = useState(() => [...savedExclusions].sort());
  const [newDate, setNewDate] = useState('');
  const [rows, setRows] = useState<GenerationPreviewRow[] | null>(null);
  const [previewRange, setPreviewRange] = useState<{ from: string; until: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const previewRevision = useRef(0);
  const validityCallback = useRef(onPreviewValidityChange);
  const latestRange = useRef(initialRange);
  useEffect(() => { validityCallback.current = onPreviewValidityChange; }, [onPreviewValidityChange]);
  useEffect(() => {
    validityCallback.current?.({ valid: false, range: { from: initialFrom, until: initialUntil } });
  }, [initialFrom, initialUntil]);
  useEffect(() => () => {
    previewRevision.current += 1;
    validityCallback.current?.({ valid: false, range: latestRange.current });
  }, []);
  const rangeValid = generationRangeSchema.safeParse({ from, until }).success;
  const dirtyExclusions = editDates.join('|') !== savedDates.join('|');
  const summary = useMemo(() => summarizeGenerationPreview(rows ?? []), [rows]);
  const currentPreviewIsValid = isCurrentConflictFreePreview(rows, previewRange, { from, until }, dirtyExclusions);
  const canGenerate = mode === 'generate' && currentPreviewIsValid && rows !== null && canConfirmGeneration(rows);
  const previewTime = (instant: string | null, fallback: string) => instant
    ? new Intl.DateTimeFormat(locale === 'ar' ? 'ar-EG' : 'en-GB', { timeZone: 'Africa/Cairo', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(new Date(instant))
    : fallback.slice(0, 5);

  const invalidate = (nextFrom = from, nextUntil = until) => {
    previewRevision.current += 1;
    latestRange.current = { from: nextFrom, until: nextUntil };
    setRows(null);
    setPreviewRange(null);
    setError(null);
    setNotice(null);
    validityCallback.current?.({ valid: false, range: { from: nextFrom, until: nextUntil } });
    onRangeChange?.({ from: nextFrom, until: nextUntil });
  };

  const setRangeFrom = (value: string) => { setFrom(value); invalidate(value, until); };
  const setRangeUntil = (value: string) => { setUntil(value); invalidate(from, value); };

  const loadPreview = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!rangeValid) { setError(t.rangeError); return; }
    if (dirtyExclusions) { setError(t.exclusionHint); return; }
    setError(null);
    setNotice(null);
    setRows(null);
    setPreviewRange(null);
    const requestedRange = { from, until };
    latestRange.current = requestedRange;
    const requestRevision = ++previewRevision.current;
    validityCallback.current?.({ valid: false, range: requestedRange });
    startTransition(async () => {
      const result = await previewLessons(locale, groupId, from, until);
      if (previewRevision.current !== requestRevision) return;
      if (result.error) { setRows(null); setPreviewRange(null); setError(result.error); return; }
      const previewRows = result.rows ?? [];
      setRows(previewRows);
      setPreviewRange(requestedRange);
      validityCallback.current?.({ valid: isCurrentConflictFreePreview(previewRows, requestedRange, requestedRange, dirtyExclusions), range: requestedRange });
    });
  };

  const addExclusion = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);
    setNotice(null);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(newDate) || !Number.isFinite(Date.parse(`${newDate}T00:00:00.000Z`)) || new Date(`${newDate}T00:00:00.000Z`).toISOString().slice(0, 10) !== newDate) {
      setError(t.emptyDate);
      return;
    }
    if (editDates.includes(newDate)) { setError(t.duplicate); return; }
    if (editDates.length >= 366) { setError(t.maxDates); return; }
    setEditDates(current => [...current, newDate].sort());
    setNewDate('');
    invalidate();
  };

  const saveExclusions = () => {
    setError(null);
    setNotice(null);
    setRows(null);
    setPreviewRange(null);
    previewRevision.current += 1;
    validityCallback.current?.({ valid: false, range: { from, until } });
    startTransition(async () => {
      const result = await saveLessonExclusions(locale, groupId, editDates);
      if (result.error) { setError(result.error); return; }
      setSavedDates([...editDates].sort());
      setNotice(result.success ?? t.saveSuccess);
    });
  };

  const generate = () => {
    if (!canGenerate) return;
    setError(null);
    setNotice(null);
    startTransition(async () => {
      const result = await confirmLessonGeneration(locale, groupId, from, until);
      setRows(null);
      setPreviewRange(null);
      previewRevision.current += 1;
      validityCallback.current?.({ valid: false, range: { from, until } });
      if (result.error) { setError(result.error); return; }
      setNotice(t.generated.replace('{count}', String(result.generated ?? 0)));
    });
  };

  return <div className="grid gap-6">
    <section aria-labelledby="generation-range-heading">
      <h3 id="generation-range-heading" className="text-lg font-black text-teal">{t.range}</h3>
      <form onSubmit={loadPreview} onReset={event => event.preventDefault()} className="mt-3 grid gap-3 sm:grid-cols-2">
        <label className="text-sm font-bold">{t.from}<input type="date" value={from} disabled={isPending} onChange={event => setRangeFrom(event.target.value)} className="mt-2 block w-full rounded-xl border border-line bg-cream p-3 disabled:opacity-60" /></label>
        <label className="text-sm font-bold">{t.until}<input type="date" value={until} disabled={isPending} onChange={event => setRangeUntil(event.target.value)} className="mt-2 block w-full rounded-xl border border-line bg-cream p-3 disabled:opacity-60" /></label>
        <button type="submit" disabled={isPending || !rangeValid || dirtyExclusions} className="rounded-xl bg-teal px-4 py-3 font-bold text-white disabled:cursor-wait disabled:opacity-50 sm:col-span-2">{isPending ? t.previewing : t.preview}</button>
      </form>
      {!rangeValid && from && until && <p className="mt-2 text-sm text-red-700">{t.rangeError}</p>}
    </section>

    <section aria-labelledby="generation-exclusions-heading" className="border-t border-line pt-5">
      <h3 id="generation-exclusions-heading" className="text-lg font-black text-teal">{t.exclusions}</h3>
      <form onSubmit={addExclusion} onReset={event => event.preventDefault()} className="mt-3 flex flex-col gap-3 sm:flex-row sm:items-end">
        <label className="min-w-0 flex-1 text-sm font-bold">{t.addDate}<input type="date" value={newDate} disabled={isPending} onChange={event => setNewDate(event.target.value)} className="mt-2 block w-full rounded-xl border border-line bg-cream p-3 disabled:opacity-60" /></label>
        <button type="submit" disabled={isPending || !newDate || editDates.length >= 366} className="rounded-xl border border-line px-4 py-3 font-bold text-teal disabled:opacity-50">{t.add}</button>
      </form>
      {editDates.length ? <ul className="mt-3 grid gap-2 sm:grid-cols-2">{editDates.map(date => <li key={date} className="flex items-center justify-between gap-3 rounded-xl bg-cream px-4 py-3"><time dateTime={date} dir="ltr">{date}</time><button type="button" disabled={isPending} onClick={() => { setEditDates(current => current.filter(value => value !== date)); invalidate(); }} className="text-sm font-bold text-red-700 underline">{locale === 'ar' ? 'إزالة' : 'Remove'}</button></li>)}</ul> : <p className="mt-3 text-sm text-muted">{locale === 'ar' ? 'لا توجد أيام مستثناة.' : 'No excluded days saved.'}</p>}
      <button type="button" disabled={isPending || !dirtyExclusions} onClick={saveExclusions} className="mt-3 rounded-xl border border-line px-4 py-3 font-bold text-teal disabled:opacity-50">{isPending ? t.saving : t.saveExclusions}</button>
      {dirtyExclusions && <p className="mt-2 text-xs text-muted">{t.exclusionHint}</p>}
    </section>

      {rows !== null && <section aria-labelledby="generation-preview-heading" className="border-t border-line pt-5">
      <div className="flex flex-wrap items-baseline justify-between gap-3"><h3 id="generation-preview-heading" className="text-lg font-black text-teal">{t.preview}</h3><div className="flex flex-wrap gap-2 text-xs">{(['ready', 'already_generated', 'excluded', 'conflicting'] as const).map(state => <span key={state} className="rounded-full bg-cream px-3 py-1">{t[state]} · {summary[state]}</span>)}</div></div>
      {rows.length ? <div className="mt-4 grid gap-3">{rows.map((row, index) => <article key={`${row.slot_id}:${row.local_date}:${index}`} className={`rounded-xl border p-4 ${row.state === 'conflicting' ? 'border-red-200 bg-red-50' : 'border-line bg-white'}`}>
        <div className="flex flex-wrap items-center justify-between gap-3"><div><strong dir="ltr">{row.local_date}</strong><p className="mt-1 text-sm text-muted" dir="ltr">{previewTime(row.starts_at, row.start_time)} – {previewTime(row.ends_at, row.end_time)}</p></div><span className="rounded-full bg-cream px-3 py-1 text-xs font-bold">{t[row.state]}</span></div>
        {row.state === 'conflicting' && <div className="mt-3 flex flex-wrap items-center justify-between gap-3 text-sm"><span>{row.conflict_title || t.group}</span>{row.conflict_lesson_id && <Link href={`/${locale}/teacher/lessons/${row.conflict_lesson_id}`} className="font-bold text-teal underline">{t.openConflict}</Link>}</div>}
      </article>)}</div> : <p className="mt-4 text-sm text-muted">{t.noRows}</p>}
      {summary.conflicting > 0 && <p role="alert" className="mt-4 text-sm text-red-700">{t.blocked}</p>}
      {mode === 'generate' && <button type="button" onClick={generate} disabled={isPending || !canGenerate} className="mt-4 rounded-xl bg-orange px-4 py-3 font-bold text-white disabled:cursor-not-allowed disabled:opacity-50">{isPending ? t.generating : t.confirm}</button>}
    </section>}

    {error && <p role="alert" className="rounded-xl bg-red-50 p-3 text-sm text-red-800">{error}</p>}
    {notice && <p role="status" className="rounded-xl bg-teal/10 p-3 text-sm font-bold text-teal">{notice}</p>}
  </div>;
}
