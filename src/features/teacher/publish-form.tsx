'use client';

import Link from 'next/link';
import { useActionState, useCallback, useState } from 'react';
import type { Locale } from '@/features/student/domain';
import { GenerationPreviewForm } from './generation-form';
import { publishGroup, type TeacherPublishActionState } from './publish-actions';
import { publishRangeSchema, publishReviewKey } from './publish-domain';

type GroupSummary = {
  id: string;
  name: string;
  description: string;
  offering_id: string;
  capacity: number;
  location: string;
  status: string;
};
type CatalogueChoice = { id: string; subject: string; context: string; label: string };
type SlotSummary = { id: string; weekday: number; start_time: string; end_time: string };

const weekdays = {
  en: ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'],
  ar: ['الأحد', 'الاثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت'],
};

const copy = (locale: Locale) =>
  locale === 'ar'
    ? {
        details: 'التفاصيل',
        editDetails: 'تعديل التفاصيل',
        schedule: 'المواعيد الأسبوعية',
        editSchedule: 'تعديل المواعيد',
        subject: 'المادة والسياق',
        capacity: 'السعة',
        location: 'المكان',
        noLocation: 'لم يحدد',
        noDescription: 'لا يوجد وصف إضافي.',
        noSlots: 'أضف موعداً أسبوعياً واحداً على الأقل قبل النشر.',
        exclusions: 'الأيام المستثناة المحفوظة',
        noExclusions: 'لا توجد أيام مستثناة.',
        excludedCount: (count: number) => `${count} تاريخاً`,
        generateChoice: 'إنشاء حصص ضمن نطاق زمني عند النشر',
        rangeHint: 'ستظهر المعاينة هنا. لا تُنشأ الحصص حتى تضغط زر النشر.',
        from: 'من',
        until: 'إلى',
        rangeError: 'أدخل تاريخين صحيحين ضمن نطاق لا يتجاوز 90 يوماً.',
        publish: 'نشر المجموعة',
        publishing: 'جارٍ النشر…',
        approval: 'يمكنك مراجعة المسودة الآن، لكن يجب اعتماد حسابك قبل النشر.',
        waiting: 'طلب مراجعة حسابك بانتظار القرار. ستتمكن من النشر بعد اعتماده.',
        declined:
          'رُفض طلب مراجعة حسابك. راجع لوحة حالة المراجعة أعلى الصفحة، ثم أرسل طلب مراجعة جديدًا بعد التحديث.',
        reviewIntro: 'راجع التفاصيل والجدول والأيام المستثناة. يمكنك العودة إلى أي خطوة لتعديلها.',
      }
    : {
        details: 'Group details',
        editDetails: 'Edit details',
        schedule: 'Weekly schedule',
        editSchedule: 'Edit schedule',
        subject: 'Subject and context',
        capacity: 'Capacity',
        location: 'Location',
        noLocation: 'Not set',
        noDescription: 'No additional description.',
        noSlots: 'Add at least one weekly time before publishing.',
        exclusions: 'Saved excluded days',
        noExclusions: 'No excluded days saved.',
        excludedCount: (count: number) => `${count} dates`,
        generateChoice: 'Generate lessons for a date range when publishing',
        rangeHint: 'The preview appears here. Lessons are not created until you publish.',
        from: 'From',
        until: 'Until',
        rangeError: 'Enter both valid dates within a range of 90 days or less.',
        publish: 'Publish group',
        publishing: 'Publishing…',
        approval:
          'You can review this draft now, but your account must be approved before publishing.',
        waiting: 'Your teacher review is pending. You can publish after it is approved.',
        declined:
          'Your teacher review was declined. Read the review panel above, then request another review after making updates.',
        reviewIntro:
          'Review the details, schedule, and excluded days. Return to any step to make changes.',
      };

export function PublishReviewForm({
  locale,
  group,
  catalogue,
  slots,
  exclusions,
  approved,
  reviewStatus = null,
  copyScheduleFrom,
}: {
  locale: Locale;
  group: GroupSummary;
  catalogue: CatalogueChoice[];
  slots: SlotSummary[];
  exclusions: string[];
  approved: boolean;
  reviewStatus?: 'pending' | 'approved' | 'declined' | null;
  copyScheduleFrom?: string;
}) {
  const t = copy(locale);
  const ar = locale === 'ar';
  const [preview, setPreview] = useState<{
    valid: boolean;
    range: { from: string; until: string };
  } | null>(null);
  const submitPublish = useCallback(
    async (previous: TeacherPublishActionState, form: FormData) => {
      const result = await publishGroup(locale, group.id, previous, form);
      if (result?.error) setPreview(null);
      return result;
    },
    [group.id, locale, setPreview],
  );
  const [state, action, pending] = useActionState<TeacherPublishActionState, FormData>(
    submitPublish,
    null,
  );
  const [withRange, setWithRange] = useState(false);
  const [range, setRange] = useState({ from: '', until: '' });
  const rangeIsValid = !withRange || publishRangeSchema.safeParse(range).success;
  const previewIsCurrent =
    preview?.valid === true &&
    preview.range.from === range.from &&
    preview.range.until === range.until;
  const handleRangeChange = useCallback(
    (nextRange: { from: string; until: string }) => {
      setRange(nextRange);
      setPreview(null);
    },
    [setPreview, setRange],
  );
  const subject = catalogue.find(item => item.id === group.offering_id);
  const fromError = state?.fieldErrors?.from;
  const untilError = state?.fieldErrors?.until;
  const setupHref = (step: 'schedule' | 'details') => {
    const query = new URLSearchParams({ step });
    if (copyScheduleFrom) query.set('copyScheduleFrom', copyScheduleFrom);
    return `/${locale}/teacher/groups/${group.id}/setup?${query.toString()}`;
  };
  const scheduleHref = setupHref('schedule');
  const detailsHref = setupHref('details');
  const previewKey = publishReviewKey(group, slots, exclusions);

  return (
    <div className="space-y-6">
      <p className="text-sm leading-6 text-muted">{t.reviewIntro}</p>
      {!approved && (
        <p role="status" className="rounded-xl bg-orange/10 p-4 text-sm text-ink">
          {reviewStatus === 'declined'
            ? t.declined
            : reviewStatus === 'pending'
              ? t.waiting
              : t.approval}
        </p>
      )}

      <section
        aria-labelledby="publish-details-heading"
        className="rounded-2xl border border-line bg-cream/50 p-4"
      >
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 id="publish-details-heading" className="text-lg font-black text-teal">
            {t.details}
          </h2>
          <Link href={detailsHref} className="font-bold text-orange underline underline-offset-2">
            {t.editDetails}
          </Link>
        </div>
        <h3 className="mt-4 text-xl font-bold text-ink">{group.name}</h3>
        <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-muted">
          {group.description || t.noDescription}
        </p>
        <dl className="mt-4 grid gap-3 sm:grid-cols-3">
          <div>
            <dt className="text-xs font-bold text-muted">{t.subject}</dt>
            <dd className="mt-1 font-semibold">{subject?.label ?? '—'}</dd>
          </div>
          <div>
            <dt className="text-xs font-bold text-muted">{t.capacity}</dt>
            <dd className="mt-1 font-semibold">{group.capacity}</dd>
          </div>
          <div>
            <dt className="text-xs font-bold text-muted">{t.location}</dt>
            <dd className="mt-1 font-semibold">{group.location || t.noLocation}</dd>
          </div>
        </dl>
      </section>

      <section
        aria-labelledby="publish-schedule-heading"
        className="rounded-2xl border border-line bg-cream/50 p-4"
      >
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 id="publish-schedule-heading" className="text-lg font-black text-teal">
            {t.schedule}
          </h2>
          <Link href={scheduleHref} className="font-bold text-orange underline underline-offset-2">
            {t.editSchedule}
          </Link>
        </div>
        {slots.length ? (
          <ul className="mt-3 grid gap-3 sm:grid-cols-2">
            {slots.map(slot => (
              <li key={slot.id} className="rounded-xl border border-line bg-white p-3">
                <strong>{weekdays[locale][slot.weekday] ?? slot.weekday}</strong>
                <p className="mt-1 text-sm text-muted" dir="ltr">
                  {slot.start_time.slice(0, 5)}–{slot.end_time.slice(0, 5)} ·{' '}
                  {ar ? 'توقيت القاهرة' : 'Cairo time'}
                </p>
              </li>
            ))}
          </ul>
        ) : (
          <p role="alert" className="mt-3 text-sm text-red-700">
            {t.noSlots}
          </p>
        )}
        <div className="mt-5 border-t border-line pt-4">
          <h3 className="font-bold text-teal">{t.exclusions}</h3>
          {exclusions.length ? (
            <>
              <p className="mt-1 text-sm text-muted">{t.excludedCount(exclusions.length)}</p>
              <ul className="mt-2 flex flex-wrap gap-2">
                {exclusions.map(date => (
                  <li key={date} className="rounded-lg bg-white px-3 py-1.5 text-sm" dir="ltr">
                    {date}
                  </li>
                ))}
              </ul>
            </>
          ) : (
            <p className="mt-1 text-sm text-muted">{t.noExclusions}</p>
          )}
        </div>
      </section>

      <section className="rounded-2xl border border-line p-4">
        <label className="flex cursor-pointer items-start gap-3 font-bold text-teal">
          <input
            type="checkbox"
            checked={withRange}
            onChange={event => {
              setWithRange(event.target.checked);
              setPreview(null);
              if (!event.target.checked) setRange({ from: '', until: '' });
            }}
            className="mt-1 size-4 accent-teal"
          />
          <span>{t.generateChoice}</span>
        </label>
        {withRange && (
          <div className="mt-4">
            <p className="mb-3 text-sm text-muted">{t.rangeHint}</p>
            <GenerationPreviewForm
              key={previewKey}
              locale={locale}
              groupId={group.id}
              savedExclusions={exclusions}
              mode="preview"
              initialRange={range}
              onRangeChange={handleRangeChange}
              onPreviewValidityChange={setPreview}
            />
            {(fromError || untilError || (range.from && range.until && !rangeIsValid)) && (
              <p role="alert" className="mt-3 text-sm text-red-700">
                {t.rangeError}
              </p>
            )}
          </div>
        )}
      </section>

      <form action={action} onReset={event => event.preventDefault()} className="space-y-3">
        <input type="hidden" name="from" value={withRange ? range.from : ''} />
        <input type="hidden" name="until" value={withRange ? range.until : ''} />
        {(fromError || untilError) && (
          <p role="alert" className="text-sm text-red-700">
            {t.rangeError}
          </p>
        )}
        {state?.error && (
          <p role="alert" className="rounded-xl bg-red-50 p-3 text-sm text-red-800">
            {state.error}
          </p>
        )}
        <button
          type="submit"
          disabled={
            pending ||
            !approved ||
            slots.length === 0 ||
            !rangeIsValid ||
            (withRange && !previewIsCurrent)
          }
          className="w-full rounded-xl bg-orange px-5 py-3 font-bold text-white disabled:cursor-not-allowed disabled:opacity-50 sm:w-auto hover:bg-orange-deep"
        >
          {pending ? t.publishing : t.publish}
        </button>
      </form>
    </div>
  );
}
