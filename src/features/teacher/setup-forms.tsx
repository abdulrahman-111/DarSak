'use client';

import Link from 'next/link';
import { useActionState, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import type { Locale } from '@/features/student/domain';
import { deleteScheduleSlot, saveGroupDraft, saveScheduleSlot, type GroupDraftActionState, type ScheduleSlotActionState } from './setup-actions';
import type { GroupDetailsFormValues, GroupScheduleProposal, GroupScheduleSlot } from './setup-data';
import type { SetupCatalogueChoice, SetupStep } from './setup-domain';

const copy = (locale: Locale) => locale === 'ar' ? {
  name: 'اسم المجموعة', description: 'الوصف', subject: 'المادة والسياق الدراسي', capacity: 'السعة', location: 'المكان',
  save: 'حفظ التفاصيل', saving: 'جارٍ الحفظ…', emptyCatalogue: 'لا توجد مواد وسياقات دراسية متاحة الآن. حاول مرة أخرى لاحقًا.',
  nameRequired: 'أدخل اسماً من حرفين على الأقل.', nameBounds: 'يجب ألا يتجاوز الاسم 120 حرفاً.', descriptionBounds: 'يجب ألا يتجاوز الوصف 2000 حرف.',
  locationBounds: 'يجب ألا يتجاوز المكان 200 حرف.', capacityError: 'أدخل سعة من 1 إلى 500.', offeringError: 'اختر مادة وسياقاً دراسياً.',
  details: 'التفاصيل', schedule: 'الجدول', review: 'المراجعة', reviewPending: 'راجع إعدادات مجموعتك هنا قبل نشرها.',
} : {
  name: 'Group name', description: 'Description', subject: 'Subject and education context', capacity: 'Capacity', location: 'Location',
  save: 'Save details', saving: 'Saving…', emptyCatalogue: 'No subjects and education contexts are available yet. Please try again later.',
  nameRequired: 'Enter a name with at least 2 characters.', nameBounds: 'Name must be no longer than 120 characters.', descriptionBounds: 'Description must be no longer than 2,000 characters.',
  locationBounds: 'Location must be no longer than 200 characters.', capacityError: 'Enter a capacity from 1 to 500.', offeringError: 'Choose a subject and education context.',
  details: 'Details', schedule: 'Schedule', review: 'Review', reviewPending: 'Review your group setup here before publishing.',
};

type Props = {
  locale: Locale;
  values?: GroupDetailsFormValues | null;
  groupId?: string;
  catalogue: SetupCatalogueChoice[];
  copyScheduleFrom?: string;
};

export function GroupDetailsForm({ locale, values, groupId, catalogue, copyScheduleFrom }: Props) {
  const t = copy(locale);
  const router = useRouter();
  const [formValues, setFormValues] = useState<GroupDetailsFormValues>({
    name: values?.name ?? '',
    description: values?.description ?? '',
    offering_id: values?.offering_id ?? '',
    capacity: values?.capacity ?? 10,
    location: values?.location ?? '',
  });
  const [state, action, pending] = useActionState<GroupDraftActionState, FormData>(saveGroupDraft.bind(null, locale), null);

  useEffect(() => {
    if (state?.id) {
      const source = copyScheduleFrom ? `&copyScheduleFrom=${encodeURIComponent(copyScheduleFrom)}` : '';
      router.push(`/${locale}/teacher/groups/${state.id}/setup?step=schedule${source}`);
    }
  }, [copyScheduleFrom, locale, router, state?.id]);

  const fieldError = (field: string) => state?.fieldErrors?.[field];
  const fieldMessage = (field: string) => {
    if (field === 'name') return formValues.name.trim().length < 2 ? t.nameRequired : t.nameBounds;
    if (field === 'description') return t.descriptionBounds;
    if (field === 'location') return t.locationBounds;
    if (field === 'capacity') return t.capacityError;
    if (field === 'offering_id') return t.offeringError;
    return t.nameRequired;
  };
  const invalid = (field: string) => ({ 'aria-invalid': !!fieldError(field), 'aria-describedby': fieldError(field) ? `group-${field}-error` : undefined });

  return <form action={action} onReset={event => event.preventDefault()} className="grid gap-5">
    {groupId && <input type="hidden" name="group_id" value={groupId} />}
    <div>
      <label htmlFor="group-name" className="block text-sm font-bold">{t.name}</label>
      <input id="group-name" name="name" value={formValues.name} onChange={event => setFormValues(current => ({ ...current, name: event.target.value }))} required minLength={2} maxLength={120} {...invalid('name')} className="mt-2 block w-full rounded-xl border border-line bg-cream p-3" />
      {fieldError('name') && <p id="group-name-error" className="mt-1 text-sm text-red-700">{fieldMessage('name')}</p>}
    </div>
    <div>
      <label htmlFor="group-description" className="block text-sm font-bold">{t.description}</label>
      <textarea id="group-description" name="description" value={formValues.description} onChange={event => setFormValues(current => ({ ...current, description: event.target.value }))} maxLength={2000} rows={4} {...invalid('description')} className="mt-2 block w-full rounded-xl border border-line bg-cream p-3" />
      {fieldError('description') && <p id="group-description-error" className="mt-1 text-sm text-red-700">{fieldMessage('description')}</p>}
    </div>
    <div>
      <label htmlFor="group-offering" className="block text-sm font-bold">{t.subject}</label>
      <select id="group-offering" name="offering_id" value={formValues.offering_id} onChange={event => setFormValues(current => ({ ...current, offering_id: event.target.value }))} required disabled={!catalogue.length} {...invalid('offering_id')} className="mt-2 block w-full rounded-xl border border-line bg-cream p-3">
        <option value="">—</option>
        {catalogue.map(choice => <option key={choice.id} value={choice.id}>{choice.label}</option>)}
      </select>
      {!catalogue.length && <p className="mt-2 text-sm text-muted">{t.emptyCatalogue}</p>}
      {fieldError('offering_id') && <p id="group-offering_id-error" className="mt-1 text-sm text-red-700">{fieldMessage('offering_id')}</p>}
    </div>
    <div className="grid gap-5 sm:grid-cols-2">
      <div>
        <label htmlFor="group-capacity" className="block text-sm font-bold">{t.capacity}</label>
        <input id="group-capacity" name="capacity" type="number" value={formValues.capacity} onChange={event => setFormValues(current => ({ ...current, capacity: Number(event.target.value) }))} min={1} max={500} {...invalid('capacity')} className="mt-2 block w-full rounded-xl border border-line bg-cream p-3" />
        {fieldError('capacity') && <p id="group-capacity-error" className="mt-1 text-sm text-red-700">{fieldMessage('capacity')}</p>}
      </div>
      <div>
        <label htmlFor="group-location" className="block text-sm font-bold">{t.location}</label>
        <input id="group-location" name="location" value={formValues.location} onChange={event => setFormValues(current => ({ ...current, location: event.target.value }))} maxLength={200} {...invalid('location')} className="mt-2 block w-full rounded-xl border border-line bg-cream p-3" />
        {fieldError('location') && <p id="group-location-error" className="mt-1 text-sm text-red-700">{fieldMessage('location')}</p>}
      </div>
    </div>
    {state?.error && <p role="alert" className="rounded-xl bg-red-50 p-3 text-sm text-red-800">{state.error}</p>}
    <button type="submit" disabled={pending || !catalogue.length} aria-live="polite" className="w-full rounded-xl bg-teal px-5 py-3 font-bold text-white disabled:cursor-wait disabled:opacity-50 sm:w-auto">{pending ? t.saving : t.save}</button>
  </form>;
}

export function GroupSetupSteps({ locale, groupId, current, copyScheduleFrom }: { locale: Locale; groupId: string; current: SetupStep; copyScheduleFrom?: string }) {
  const t = copy(locale);
  const steps: SetupStep[] = ['details', 'schedule', 'review'];
  return <nav aria-label={locale === 'ar' ? 'خطوات إعداد المجموعة' : 'Group setup steps'} className="mb-5 flex flex-wrap gap-2">
    {steps.map(step => {
      const source = copyScheduleFrom ? `&copyScheduleFrom=${encodeURIComponent(copyScheduleFrom)}` : '';
      return <Link key={step} aria-current={current === step ? 'step' : undefined} href={`/${locale}/teacher/groups/${groupId}/setup?step=${step}${source}`} className={`rounded-full px-4 py-2 text-sm font-bold ${current === step ? 'bg-teal text-white' : 'border border-line bg-white text-teal'}`}>{t[step]}</Link>;
    })}
  </nav>;
}

const weekdayLabels = (locale: Locale) => locale === 'ar'
  ? ['الأحد', 'الاثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت']
  : ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

const scheduleCopy = (locale: Locale) => locale === 'ar' ? {
  title: 'المواعيد الأسبوعية', timezone: 'كل الأوقات بتوقيت القاهرة.',
  description: 'أضف موعداً أو أكثر. لا يمكن أن يمتد الموعد إلى اليوم التالي.',
  empty: 'لم تتم إضافة مواعيد أسبوعية بعد.', add: 'إضافة موعد أسبوعي', save: 'حفظ الموعد', saving: 'جارٍ الحفظ…',
  remove: 'حذف الموعد', removing: 'جارٍ الحذف…', weekday: 'اليوم', start: 'وقت البداية', end: 'وقت النهاية',
  back: 'العودة إلى التفاصيل', next: 'متابعة إلى المراجعة', conflict: 'اختر وقتاً آخر؛ لا يمكن أن تتداخل المواعيد الأسبوعية.',
  proposal: 'مواعيد مقترحة من', proposalHint: 'هذه المواعيد غير محفوظة. عدّل كل موعد حتى لا يتعارض مع جدولك الحالي، ثم احفظه.',
  proposalError: 'تعذر تحميل الجدول المقترح. يمكنك إضافة المواعيد يدوياً.', proposalEmpty: 'المجموعة المصدر لا تحتوي على مواعيد أسبوعية.', clearProposal: 'إخفاء الاقتراح',
} : {
  title: 'Weekly times', timezone: 'All times use Africa/Cairo.',
  description: 'Add one or more weekly times. A time cannot continue into the next day.',
  empty: 'No weekly times have been added yet.', add: 'Add weekly time', save: 'Save time', saving: 'Saving…',
  remove: 'Remove time', removing: 'Removing…', weekday: 'Weekday', start: 'Start time', end: 'End time',
  back: 'Back to details', next: 'Continue to review', conflict: 'Choose another time; weekly times cannot overlap.',
  proposal: 'Suggested times from', proposalHint: 'These times are not saved. Adjust each one to avoid your current schedule, then save it.',
  proposalError: 'Could not load the schedule proposal. You can add times manually.', proposalEmpty: 'The source group has no weekly times to suggest.', clearProposal: 'Hide suggestion',
};

function SlotFields({ locale, idPrefix, weekday, start, end, onWeekday, onStart, onEnd, invalid }: {
  idPrefix: string;
  locale: Locale; weekday: number; start: string; end: string;
  onWeekday: (value: number) => void; onStart: (value: string) => void; onEnd: (value: string) => void;
  invalid?: Record<string, string>;
}) {
  const t = scheduleCopy(locale);
  return <div className="grid gap-3 sm:grid-cols-3">
    <div>
      <label htmlFor={`slot-${idPrefix}-weekday`} className="block text-sm font-bold">{t.weekday}</label>
      <select id={`slot-${idPrefix}-weekday`} name="weekday" value={weekday} onChange={event => onWeekday(Number(event.target.value))} required aria-invalid={!!invalid?.weekday} className="mt-2 block w-full rounded-xl border border-line bg-cream p-3">
        {weekdayLabels(locale).map((label, value) => <option key={value} value={value}>{label}</option>)}
      </select>
    </div>
    <div>
      <label htmlFor={`slot-${idPrefix}-start`} className="block text-sm font-bold">{t.start}</label>
      <input id={`slot-${idPrefix}-start`} name="start_time" type="time" value={start} onChange={event => onStart(event.target.value)} required aria-invalid={!!invalid?.start_time} className="mt-2 block w-full rounded-xl border border-line bg-cream p-3" />
    </div>
    <div>
      <label htmlFor={`slot-${idPrefix}-end`} className="block text-sm font-bold">{t.end}</label>
      <input id={`slot-${idPrefix}-end`} name="end_time" type="time" value={end} onChange={event => onEnd(event.target.value)} required aria-invalid={!!invalid?.end_time} className="mt-2 block w-full rounded-xl border border-line bg-cream p-3" />
    </div>
  </div>;
}

function ScheduleSlotEditor({ locale, groupId, slot, deleteAction, deletePending }: {
  locale: Locale; groupId: string; slot: GroupScheduleSlot;
  deleteAction: (form: FormData) => void; deletePending: boolean;
}) {
  const t = scheduleCopy(locale);
  const [weekday, setWeekday] = useState(slot.weekday);
  const [start, setStart] = useState(slot.start_time.slice(0, 5));
  const [end, setEnd] = useState(slot.end_time.slice(0, 5));
  const [state, action, pending] = useActionState<ScheduleSlotActionState, FormData>(saveScheduleSlot.bind(null, locale), null);

  return <li className="rounded-2xl border border-line bg-white p-4">
    <h3 className="mb-3 font-bold text-teal">{weekdayLabels(locale)[weekday]}</h3>
    <form action={action} onReset={event => event.preventDefault()} className="grid gap-3">
      <input type="hidden" name="group_id" value={groupId} />
      <input type="hidden" name="slot_id" value={slot.id} />
      <SlotFields idPrefix={slot.id} locale={locale} weekday={weekday} start={start} end={end} onWeekday={setWeekday} onStart={setStart} onEnd={setEnd} invalid={state?.fieldErrors} />
      {state?.error && <p role="alert" className="text-sm text-red-800">{state.error}</p>}
      {state?.success && <p role="status" aria-live="polite" className="text-sm text-teal">{state.success}</p>}
      <button type="submit" disabled={pending || deletePending} className="w-full rounded-xl border border-teal px-4 py-2 font-bold text-teal disabled:cursor-wait disabled:opacity-50 sm:w-auto">{pending ? t.saving : t.save}</button>
    </form>
    <form action={deleteAction} onReset={event => event.preventDefault()} className="mt-3">
      <input type="hidden" name="group_id" value={groupId} />
      <input type="hidden" name="slot_id" value={slot.id} />
      <button type="submit" disabled={pending || deletePending} className="rounded-xl px-3 py-2 text-sm font-bold text-red-700 disabled:cursor-wait disabled:opacity-50">{deletePending ? t.removing : t.remove}</button>
    </form>
  </li>;
}

function AddScheduleSlotForm({ locale, groupId }: { locale: Locale; groupId: string }) {
  const t = scheduleCopy(locale);
  const [weekday, setWeekday] = useState(0);
  const [start, setStart] = useState('18:00');
  const [end, setEnd] = useState('19:00');
  const [state, action, pending] = useActionState<ScheduleSlotActionState, FormData>(saveScheduleSlot.bind(null, locale), null);

  return <form action={action} onReset={event => event.preventDefault()} className="mt-5 grid gap-4 rounded-2xl bg-cream p-4">
    <h3 className="font-bold text-teal">{t.add}</h3>
    <input type="hidden" name="group_id" value={groupId} />
    <SlotFields idPrefix="new" locale={locale} weekday={weekday} start={start} end={end} onWeekday={setWeekday} onStart={setStart} onEnd={setEnd} invalid={state?.fieldErrors} />
    {state?.error && <p role="alert" className="text-sm text-red-800">{state.error}</p>}
    {state?.success && <p role="status" aria-live="polite" className="text-sm text-teal">{state.success}</p>}
    <button type="submit" disabled={pending} aria-live="polite" className="w-full rounded-xl bg-teal px-4 py-3 font-bold text-white disabled:cursor-wait disabled:opacity-50 sm:w-auto">{pending ? t.saving : t.add}</button>
  </form>;
}

function ProposedScheduleSlotForm({ locale, groupId, slot, index }: {
  locale: Locale; groupId: string; slot: Pick<GroupScheduleSlot, 'weekday' | 'start_time' | 'end_time'>; index: number;
}) {
  const t = scheduleCopy(locale);
  const [weekday, setWeekday] = useState(slot.weekday);
  const [start, setStart] = useState(slot.start_time.slice(0, 5));
  const [end, setEnd] = useState(slot.end_time.slice(0, 5));
  const [state, action, pending] = useActionState<ScheduleSlotActionState, FormData>(saveScheduleSlot.bind(null, locale), null);
  const idPrefix = `proposal-${groupId}-${index}`;
  return <li className="rounded-2xl border border-orange/40 bg-orange/5 p-4">
    <h4 className="mb-3 font-bold text-teal">{weekdayLabels(locale)[weekday]}</h4>
    <form action={action} onReset={event => event.preventDefault()} className="grid gap-3">
      <input type="hidden" name="group_id" value={groupId} />
      <SlotFields idPrefix={idPrefix} locale={locale} weekday={weekday} start={start} end={end} onWeekday={setWeekday} onStart={setStart} onEnd={setEnd} invalid={state?.fieldErrors} />
      {state?.error && <p role="alert" className="text-sm text-red-800">{state.error}</p>}
      {state?.success && <p role="status" aria-live="polite" className="text-sm text-teal">{state.success}</p>}
      <button type="submit" disabled={pending} className="w-full rounded-xl bg-teal px-4 py-2 font-bold text-white disabled:cursor-wait disabled:opacity-50 sm:w-auto">{pending ? t.saving : t.save}</button>
    </form>
  </li>;
}

export function WeeklyScheduleStepForm({ locale, groupId, slots, scheduleProposal, scheduleProposalError, copyScheduleFrom }: {
  locale: Locale;
  groupId: string;
  slots: GroupScheduleSlot[];
  scheduleProposal?: GroupScheduleProposal | null;
  scheduleProposalError?: string | null;
  copyScheduleFrom?: string;
}) {
  const t = scheduleCopy(locale);
  const [deleteState, deleteAction, deletePending] = useActionState<ScheduleSlotActionState, FormData>(deleteScheduleSlot.bind(null, locale), null);
  const sourceQuery = copyScheduleFrom ? `&copyScheduleFrom=${encodeURIComponent(copyScheduleFrom)}` : '';
  return <section className="grid gap-4">
    <div>
      <h2 className="text-xl font-black text-teal">{t.title}</h2>
      <p className="mt-1 text-sm text-muted">{t.timezone} {t.description}</p>
    </div>
    {scheduleProposalError && <p role="alert" className="rounded-xl bg-red-50 p-3 text-sm text-red-800">{scheduleProposalError || t.proposalError}</p>}
    {scheduleProposal && <aside aria-label={t.proposal} className="grid gap-3 rounded-2xl border border-orange/30 bg-orange/5 p-4">
      <div>
        <h3 className="font-black text-teal">{t.proposal} “{scheduleProposal.sourceName}”</h3>
        <p className="mt-1 text-sm text-muted">{t.proposalHint}</p>
      </div>
      {scheduleProposal.slots.length
        ? <ul className="grid gap-3">{scheduleProposal.slots.map((slot, index) => <ProposedScheduleSlotForm key={`${slot.weekday}:${slot.start_time}:${index}`} locale={locale} groupId={groupId} slot={slot} index={index} />)}</ul>
        : <p className="text-sm text-muted">{t.proposalEmpty}</p>}
      <Link href={`/${locale}/teacher/groups/${groupId}/setup?step=schedule`} className="justify-self-start text-sm font-bold text-teal underline">{t.clearProposal}</Link>
    </aside>}
    {deleteState?.error && <p role="alert" className="rounded-xl bg-red-50 p-3 text-sm text-red-800">{deleteState.error}</p>}
    {deleteState?.success && <p role="status" aria-live="polite" className="rounded-xl bg-green-50 p-3 text-sm text-green-900">{deleteState.success}</p>}
    {slots.length
      ? <ul className="grid gap-3">{slots.map(slot => <ScheduleSlotEditor key={slot.id} locale={locale} groupId={groupId} slot={slot} deleteAction={deleteAction} deletePending={deletePending} />)}</ul>
      : <p className="rounded-xl bg-cream p-4 text-sm text-muted">{t.empty}</p>}
    <AddScheduleSlotForm locale={locale} groupId={groupId} />
    <div className="flex flex-col gap-3 border-t border-line pt-4 sm:flex-row sm:justify-between">
      <Link href={`/${locale}/teacher/groups/${groupId}/setup?step=details${sourceQuery}`} className="rounded-xl border border-line px-4 py-3 text-center font-bold text-teal">{t.back}</Link>
      <Link href={`/${locale}/teacher/groups/${groupId}/setup?step=review${sourceQuery}`} className="rounded-xl bg-teal px-4 py-3 text-center font-bold text-white">{t.next}</Link>
    </div>
  </section>;
}

export function GroupSetupPlaceholder({ locale }: { locale: Locale }) {
  const t = copy(locale);
  return <p>{t.reviewPending}</p>;
}
