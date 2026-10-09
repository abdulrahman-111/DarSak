'use client';

import Link from 'next/link';
import { useActionState, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import type { Locale } from '@/features/student/domain';
import { saveGroupDraft, type GroupDraftActionState } from './setup-actions';
import type { GroupDetailsFormValues } from './setup-data';
import type { SetupCatalogueChoice, SetupStep } from './setup-domain';

const copy = (locale: Locale) => locale === 'ar' ? {
  name: 'اسم المجموعة', description: 'الوصف', subject: 'المادة والسياق الدراسي', capacity: 'السعة', location: 'المكان',
  save: 'حفظ التفاصيل', saving: 'جارٍ الحفظ…', emptyCatalogue: 'لا توجد مواد وسياقات دراسية متاحة الآن. حاول مرة أخرى لاحقًا.',
  nameRequired: 'أدخل اسماً من حرفين على الأقل.', nameBounds: 'يجب ألا يتجاوز الاسم 120 حرفاً.', descriptionBounds: 'يجب ألا يتجاوز الوصف 2000 حرف.',
  locationBounds: 'يجب ألا يتجاوز المكان 200 حرف.', capacityError: 'أدخل سعة من 1 إلى 500.', offeringError: 'اختر مادة وسياقاً دراسياً.',
  details: 'التفاصيل', schedule: 'الجدول', review: 'المراجعة', schedulePending: 'أضف المواعيد الأسبوعية لمجموعتك هنا.', reviewPending: 'راجع إعدادات مجموعتك هنا قبل نشرها.',
} : {
  name: 'Group name', description: 'Description', subject: 'Subject and education context', capacity: 'Capacity', location: 'Location',
  save: 'Save details', saving: 'Saving…', emptyCatalogue: 'No subjects and education contexts are available yet. Please try again later.',
  nameRequired: 'Enter a name with at least 2 characters.', nameBounds: 'Name must be no longer than 120 characters.', descriptionBounds: 'Description must be no longer than 2,000 characters.',
  locationBounds: 'Location must be no longer than 200 characters.', capacityError: 'Enter a capacity from 1 to 500.', offeringError: 'Choose a subject and education context.',
  details: 'Details', schedule: 'Schedule', review: 'Review', schedulePending: 'Add your group’s weekly times here.', reviewPending: 'Review your group setup here before publishing.',
};

type Props = {
  locale: Locale;
  values?: GroupDetailsFormValues | null;
  groupId?: string;
  catalogue: SetupCatalogueChoice[];
};

export function GroupDetailsForm({ locale, values, groupId, catalogue }: Props) {
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
    if (state?.id) router.push(`/${locale}/teacher/groups/${state.id}/setup?step=schedule`);
  }, [locale, router, state?.id]);

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

export function GroupSetupSteps({ locale, groupId, current }: { locale: Locale; groupId: string; current: SetupStep }) {
  const t = copy(locale);
  const steps: SetupStep[] = ['details', 'schedule', 'review'];
  return <nav aria-label={locale === 'ar' ? 'خطوات إعداد المجموعة' : 'Group setup steps'} className="mb-5 flex flex-wrap gap-2">
    {steps.map(step => <Link key={step} aria-current={current === step ? 'step' : undefined} href={`/${locale}/teacher/groups/${groupId}/setup?step=${step}`} className={`rounded-full px-4 py-2 text-sm font-bold ${current === step ? 'bg-teal text-white' : 'border border-line bg-white text-teal'}`}>{t[step]}</Link>)}
  </nav>;
}

export function GroupSetupPlaceholder({ locale, step }: { locale: Locale; step: Exclude<SetupStep, 'details'> }) {
  const t = copy(locale);
  return <p>{step === 'schedule' ? t.schedulePending : t.reviewPending}</p>;
}
