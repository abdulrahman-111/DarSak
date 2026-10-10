'use client';

import { useActionState, useState } from 'react';
import { removeTeacherAvatar, saveTeacherProfile, uploadTeacherAvatar, type TeacherProfileActionState } from './profile-actions';
import { TeacherAvatarImage } from './profile-avatar-image';
import type { Locale } from '@/features/student/domain';
import type { ProfileFormValues } from './profile-domain';
import type { ProfileCatalogueNode, ProfileCatalogueOffering, ProfileCatalogueSubject } from './profile-data';

const copy = (locale: Locale) => locale === 'ar' ? {
  save: 'حفظ الملف الشخصي', saving: 'جارٍ الحفظ…', fullName: 'الاسم الكامل', headline: 'العنوان المهني', bio: 'نبذة عنك',
  specializations: 'المواد والتخصصات', chooseSubjects: 'اختر المواد والسياقات التي تدرّسها.', emptyCatalogue: 'لا توجد تخصصات متاحة بعد. يمكنك حفظ بقية بياناتك الآن.',
  phone: 'رقم الهاتف', whatsapp: 'رقم واتساب', email: 'بريد التواصل', e164: 'اكتب الرقم بالصيغة الدولية، مثل +201234567890.',
  visibility: 'من يمكنه رؤية بيانات التواصل؟', enrolled: 'طلاب المجموعات المقبولون فقط', public: 'عام بعد اعتماد الحساب', visibilityHint: 'لا يؤثر هذا الاختيار في بريد تسجيل الدخول.',
  required: 'أدخل اسماً من حرفين على الأقل.', nameBounds: 'يجب ألا يتجاوز الاسم 100 حرف.', headlineBounds: 'يجب ألا يتجاوز العنوان 160 حرفاً.', bioBounds: 'يجب ألا تتجاوز النبذة 5000 حرف.',
  phoneError: 'أدخل رقماً دولياً صحيحاً بصيغة E.164 أو اتركه فارغاً.', emailError: 'أدخل بريداً صحيحاً لا يتجاوز 254 حرفاً أو اتركه فارغاً.',
  selectionError: 'تحقق من اختيار التخصصات.',
} : {
  save: 'Save profile', saving: 'Saving…', fullName: 'Full name', headline: 'Professional headline', bio: 'About you',
  specializations: 'Subjects and specializations', chooseSubjects: 'Choose the subjects and academic contexts you teach.', emptyCatalogue: 'No specializations are available yet. You can save the rest of your profile.',
  phone: 'Phone number', whatsapp: 'WhatsApp number', email: 'Contact email', e164: 'Use an international number, such as +201234567890.',
  visibility: 'Who can see your contact details?', enrolled: 'Accepted students in my groups', public: 'Public after account approval', visibilityHint: 'This does not change your sign-in email.',
  required: 'Enter a name with at least 2 characters.', nameBounds: 'Name must be no longer than 100 characters.', headlineBounds: 'Headline must be no longer than 160 characters.', bioBounds: 'Bio must be no longer than 5,000 characters.',
  phoneError: 'Enter a valid international E.164 number or leave this blank.', emailError: 'Enter a valid email up to 254 characters or leave this blank.',
  selectionError: 'Check your specialization selection.',
};

type Props = {
  locale: Locale;
  values: ProfileFormValues;
  nodes: ProfileCatalogueNode[];
  subjects: ProfileCatalogueSubject[];
  offerings: ProfileCatalogueOffering[];
};

export function TeacherAvatarEditor({ locale, avatarUrl, hasAvatar, fullName }: { locale: Locale; avatarUrl: string | null; hasAvatar: boolean; fullName: string }) {
  const ar = locale === 'ar';
  const [uploadState, uploadAction, uploadPending] = useActionState<TeacherProfileActionState, FormData>(uploadTeacherAvatar.bind(null, locale), null);
  const [removeState, removeAction, removePending] = useActionState<TeacherProfileActionState, FormData>(removeTeacherAvatar.bind(null, locale), null);
  const uploadCopy = ar ? 'رفع صورة' : 'Upload photo';
  const savingCopy = ar ? 'جارٍ الرفع…' : 'Uploading…';
  return <section aria-labelledby="teacher-avatar-heading" className="mb-6 flex flex-col gap-5 border-b border-line pb-6 sm:flex-row sm:items-center">
    <TeacherAvatarImage src={avatarUrl} name={fullName}/>
    <div className="min-w-0 flex-1">
      <h2 id="teacher-avatar-heading" className="text-lg font-black text-teal">{ar ? 'الصورة الشخصية' : 'Profile photo'}</h2>
      <p className="mt-1 text-sm text-muted">{ar ? 'JPG أو PNG أو WebP، بحد أقصى ٢ ميجابايت.' : 'JPG, PNG, or WebP, up to 2 MB.'}</p>
      <form action={uploadAction} className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-end">
        <label className="min-w-0 flex-1 text-sm font-bold">
          <span className="sr-only">{ar ? 'اختر صورة الملف الشخصي' : 'Choose a profile photo'}</span>
          <input name="avatar" type="file" accept="image/jpeg,image/png,image/webp" required aria-label={ar ? 'اختر صورة الملف الشخصي' : 'Choose a profile photo'} className="block w-full min-w-0 text-sm file:me-3 file:rounded-lg file:border-0 file:bg-cream file:px-3 file:py-2 file:font-bold file:text-teal"/>
        </label>
        <button type="submit" disabled={uploadPending || removePending} className="shrink-0 rounded-xl bg-teal px-4 py-2.5 text-sm font-bold text-white disabled:opacity-50">{uploadPending ? savingCopy : uploadCopy}</button>
      </form>
      {uploadState?.error && <p role="alert" className="mt-3 text-sm text-red-700">{uploadState.error}</p>}
      {uploadState?.success && <p role="status" className="mt-3 text-sm font-bold text-teal">{uploadState.success}</p>}
      {hasAvatar && <form action={removeAction} className="mt-3">
        <button type="submit" disabled={removePending || uploadPending} className="rounded-lg border border-line px-3 py-2 text-sm font-bold text-muted disabled:opacity-50">{removePending ? (ar ? 'جارٍ الحذف…' : 'Removing…') : (ar ? 'إزالة الصورة' : 'Remove photo')}</button>
      </form>}
      {removeState?.error && <p role="alert" className="mt-2 text-sm text-red-700">{removeState.error}</p>}
      {removeState?.success && <p role="status" className="mt-2 text-sm font-bold text-teal">{removeState.success}</p>}
    </div>
  </section>;
}

export function TeacherProfileForm({ locale, values, nodes, subjects, offerings }: Props) {
  const t = copy(locale);
  const ar = locale === 'ar';
  const [formValues, setFormValues] = useState(values);
  const [state, action, pending] = useActionState<TeacherProfileActionState, FormData>(saveTeacherProfile.bind(null, locale), null);
  const fieldError = (name: string) => state?.fieldErrors?.[name];
  const errorText = (name: string) => {
    if (!fieldError(name)) return undefined;
    if (name === 'full_name') return formValues.full_name.trim().length < 2 ? t.required : t.nameBounds;
    if (name === 'headline') return t.headlineBounds;
    if (name === 'bio') return t.bioBounds;
    if (name === 'phone_number' || name === 'whatsapp_number') return t.phoneError;
    if (name === 'contact_email') return t.emailError;
    return t.selectionError;
  };
  const getName = (row: { name_ar: string; name_en: string }) => ar ? row.name_ar : row.name_en;
  const ancestors = (nodeId: string) => {
    const labels: string[] = [];
    let node = nodes.find(item => item.id === nodeId);
    const seen = new Set<string>();
    while (node && !seen.has(node.id)) {
      seen.add(node.id);
      labels.unshift(getName(node));
      node = node.parent_id ? nodes.find(item => item.id === node?.parent_id) : undefined;
    }
    return labels.join(' › ');
  };
  const contactInput = (name: 'phone_number' | 'whatsapp_number' | 'contact_email', label: string, hint?: string) => {
    const error = errorText(name);
    const id = `profile-${name}`;
    return <div>
      <label htmlFor={id} className="block text-sm font-bold">{label}</label>
      <input id={id} name={name} type={name === 'contact_email' ? 'email' : 'tel'} value={formValues[name]} onChange={event => setFormValues(current => ({ ...current, [name]: event.target.value }))} dir="ltr" maxLength={name === 'contact_email' ? 254 : 16} autoComplete={name === 'contact_email' ? 'off' : 'tel'} aria-invalid={!!error} aria-describedby={[hint && `${id}-hint`, error && `${id}-error`].filter(Boolean).join(' ') || undefined} className="mt-2 block w-full rounded-xl border border-line bg-cream p-3 text-left" />
      {hint && <p id={`${id}-hint`} className="mt-1 text-xs text-muted">{hint}</p>}
      {error && <p id={`${id}-error`} className="mt-1 text-sm text-red-700">{error}</p>}
    </div>;
  };

  return <form action={action} onReset={event => event.preventDefault()} className="space-y-6">
    <div className="grid gap-5 md:grid-cols-2">
      <div>
        <label htmlFor="profile-full-name" className="block text-sm font-bold">{t.fullName}</label>
        <input id="profile-full-name" name="full_name" value={formValues.full_name} onChange={event => setFormValues(current => ({ ...current, full_name: event.target.value }))} required minLength={2} maxLength={100} autoComplete="name" aria-invalid={!!fieldError('full_name')} aria-describedby={fieldError('full_name') ? 'profile-full-name-error' : undefined} className="mt-2 block w-full rounded-xl border border-line bg-cream p-3" />
        {fieldError('full_name') && <p id="profile-full-name-error" className="mt-1 text-sm text-red-700">{errorText('full_name')}</p>}
      </div>
      <div>
        <label htmlFor="profile-headline" className="block text-sm font-bold">{t.headline}</label>
        <input id="profile-headline" name="headline" value={formValues.headline} onChange={event => setFormValues(current => ({ ...current, headline: event.target.value }))} maxLength={160} aria-invalid={!!fieldError('headline')} aria-describedby={fieldError('headline') ? 'profile-headline-error' : undefined} className="mt-2 block w-full rounded-xl border border-line bg-cream p-3" />
        {fieldError('headline') && <p id="profile-headline-error" className="mt-1 text-sm text-red-700">{errorText('headline')}</p>}
      </div>
    </div>
    <div>
      <label htmlFor="profile-bio" className="block text-sm font-bold">{t.bio}</label>
      <textarea id="profile-bio" name="bio" value={formValues.bio} onChange={event => setFormValues(current => ({ ...current, bio: event.target.value }))} maxLength={5000} rows={6} aria-invalid={!!fieldError('bio')} aria-describedby={fieldError('bio') ? 'profile-bio-error' : undefined} className="mt-2 block w-full rounded-xl border border-line bg-cream p-3" />
      {fieldError('bio') && <p id="profile-bio-error" className="mt-1 text-sm text-red-700">{errorText('bio')}</p>}
    </div>

    <fieldset className="min-w-0" aria-describedby={fieldError('offering_ids') ? 'profile-specialization-error' : undefined}>
      <legend className="text-lg font-black text-teal">{t.specializations}</legend>
      <p className="mt-1 text-sm text-muted">{t.chooseSubjects}</p>
      {offerings.length ? <div className="mt-3 grid gap-3 sm:grid-cols-2">
        {offerings.map(offering => {
          const subject = subjects.find(item => item.id === offering.subject_id);
          const id = `offering-${offering.id}`;
          return <label key={offering.id} htmlFor={id} className="flex min-w-0 cursor-pointer items-start gap-3 rounded-xl border border-line bg-cream/60 p-3">
            <input id={id} name="offering_ids" type="checkbox" value={offering.id} checked={formValues.offering_ids.includes(offering.id)} onChange={event => setFormValues(current => ({ ...current, offering_ids: event.target.checked ? [...current.offering_ids, offering.id] : current.offering_ids.filter(id => id !== offering.id) }))} className="mt-1 size-4 shrink-0 accent-teal" />
            <span className="min-w-0"><span className="block font-bold text-teal">{subject ? getName(subject) : ''}</span><span className="mt-1 block break-words text-sm text-muted">{ancestors(offering.node_id)}</span></span>
          </label>;
        })}
      </div> : <p className="mt-3 rounded-xl border border-dashed border-line p-4 text-sm text-muted">{t.emptyCatalogue}</p>}
      {fieldError('offering_ids') && <p id="profile-specialization-error" className="mt-2 text-sm text-red-700">{errorText('offering_ids')}</p>}
    </fieldset>

    <section aria-labelledby="profile-contact-heading" className="space-y-4 border-t border-line pt-5">
      <h2 id="profile-contact-heading" className="text-lg font-black text-teal">{ar ? 'بيانات التواصل' : 'Contact details'}</h2>
      <div className="grid gap-5 md:grid-cols-2">
        {contactInput('phone_number', t.phone, t.e164)}
        {contactInput('whatsapp_number', t.whatsapp, t.e164)}
        {contactInput('contact_email', t.email)}
      </div>
      <div>
        <label htmlFor="profile-visibility" className="block text-sm font-bold">{t.visibility}</label>
        <select id="profile-visibility" name="visibility" value={formValues.visibility} onChange={event => setFormValues(current => ({ ...current, visibility: event.target.value as ProfileFormValues['visibility'] }))} className="mt-2 block w-full rounded-xl border border-line bg-cream p-3">
          <option value="enrolled">{t.enrolled}</option>
          <option value="public">{t.public}</option>
        </select>
        <p className="mt-1 text-xs text-muted">{t.visibilityHint}</p>
      </div>
    </section>

    {state?.error && <p role="alert" className="rounded-xl bg-red-50 p-3 text-sm text-red-800">{state.error}</p>}
    {state?.success && <p role="status" className="rounded-xl bg-teal/10 p-3 text-sm font-bold text-teal">{state.success}</p>}
    <button type="submit" disabled={pending} aria-live="polite" className="w-full rounded-xl bg-teal px-5 py-3 font-bold text-white disabled:cursor-wait disabled:opacity-50 sm:w-auto">{pending ? t.saving : t.save}</button>
  </form>;
}
