'use client';

import { useActionState, useEffect, useRef, useState } from 'react';
import { buildTeacherVisitorView, TeacherProfile } from '@/components/public/teacher-profile';
import type { Locale } from '@/features/student/domain';
import type { Group } from '@/lib/supabase/types';
import { emptyRichProfile, profileEntryHasContent, profileSectionIds, visiblePublicTeacherProfile, type LocalizedText, type ProfileEntry, type ProfileSectionId, type RichProfileInput, type PublicTeacherVisitorContacts } from './profile-details-domain';
import { saveTeacherProfileDetails, type RichProfileActionState } from './profile-details-actions';
import { useUnsavedProfileSection } from './unsaved-profile-protection';

const copy = {
  en: {
    heading: 'Profile details', intro: 'Add the information visitors can see. Each section is optional.', save: 'Save profile details', saving: 'Saving…', preview: 'Preview as a visitor', hidePreview: 'Close visitor preview', previewLabel: 'Visitor preview · showing only information visitors can see',
    about: 'About', qualifications: 'Qualifications', experience: 'Experience', approach: 'Teaching approach', goals: 'Learning goals',
    ar: 'Arabic', en: 'English', city: 'City', languages: 'Teaching languages', languagePlaceholder: 'Add a language', addLanguage: 'Add language', remove: 'Remove',
    teachingMode: 'Teaching mode', unset: 'Choose later', online: 'Online', in_person: 'In person', both: 'Online and in person', layout: 'Profile layout', classic: 'Classic', compact: 'Compact', palette: 'Color palette', teal: 'Teal', indigo: 'Indigo', olive: 'Olive',
    appearance: 'Appearance', sections: 'Sections', sectionOrder: 'Section order', hidden: 'Hide this section from visitors', moveUp: 'Move up', moveDown: 'Move down',
    title: 'Title', organization: 'Organization', description: 'Description', startYear: 'Start year', endYear: 'End year', current: 'Current', addQualification: 'Add qualification', addExperience: 'Add experience',
    optionalProgress: 'Optional sections with content', charRemaining: 'characters left', formError: 'Review the fields marked below. Your entries are still here.', payloadError: 'Some profile details exceed the supported limits. Shorten long text or remove entries, then try again.', fieldError: 'Review this value and its character or year limits.', languageError: 'Add a language label or remove this row.', yearError: 'Use a year from 1900 through next year, and keep the end year after the start year. Leave the end year blank when current.', privateContactHint: 'Active students can see these contact details only after you accept their enrollment in one of your groups.', reloadError: 'This profile changed while you were editing. Reload the page, review the latest details, and retry your changes.', detailsUnavailable: 'Profile details could not be loaded safely. Reload the page before editing.',
  },
  ar: {
    heading: 'تفاصيل الملف الشخصي', intro: 'أضف المعلومات التي يمكن للزوار رؤيتها. كل الأقسام اختيارية.', save: 'حفظ تفاصيل الملف', saving: 'جارٍ الحفظ…', preview: 'معاينة الملف كزائر', hidePreview: 'إغلاق معاينة الزائر', previewLabel: 'معاينة كما يراها الزائر · تظهر المعلومات المتاحة للزوار فقط',
    about: 'نبذة', qualifications: 'المؤهلات', experience: 'الخبرة', approach: 'أسلوب التدريس', goals: 'أهداف التعلم',
    ar: 'العربية', en: 'الإنجليزية', city: 'المدينة', languages: 'لغات التدريس', languagePlaceholder: 'أضف لغة', addLanguage: 'إضافة لغة', remove: 'إزالة',
    teachingMode: 'طريقة التدريس', unset: 'أضفها لاحقاً', online: 'عن بُعد', in_person: 'حضوري', both: 'عن بُعد وحضوري', layout: 'تخطيط الملف', classic: 'كلاسيكي', compact: 'مختصر', palette: 'الألوان', teal: 'فيروزي', indigo: 'نيلي', olive: 'زيتوني',
    appearance: 'المظهر', sections: 'الأقسام', sectionOrder: 'ترتيب الأقسام', hidden: 'إخفاء هذا القسم عن الزوار', moveUp: 'تحريك لأعلى', moveDown: 'تحريك لأسفل',
    title: 'العنوان', organization: 'المؤسسة', description: 'الوصف', startYear: 'سنة البداية', endYear: 'سنة النهاية', current: 'مستمر حالياً', addQualification: 'إضافة مؤهل', addExperience: 'إضافة خبرة',
    optionalProgress: 'الأقسام الاختيارية التي تحتوي على محتوى', charRemaining: 'حرف متبقٍ', formError: 'راجع الحقول المحددة أدناه. ما أدخلته ما زال محفوظاً في النموذج.', payloadError: 'بعض تفاصيل الملف تتجاوز الحدود المسموحة. اختصر النص أو أزل بعض العناصر ثم حاول مجدداً.', fieldError: 'راجع هذا الحقل وحدود الأحرف أو السنوات.', languageError: 'أدخل اسم اللغة أو أزل هذا الصف.', yearError: 'استخدم سنة من 1900 حتى العام المقبل، واجعل سنة النهاية بعد البداية. اترك النهاية فارغة إذا كانت الخبرة مستمرة.', privateContactHint: 'تظهر بيانات التواصل للطلاب النشطين بعد قبول تسجيلهم في إحدى مجموعاتك فقط.', reloadError: 'تغير الملف أثناء التعديل. أعد تحميل الصفحة وراجع أحدث التفاصيل ثم حاول مجدداً.', detailsUnavailable: 'تعذر تحميل تفاصيل الملف بأمان. أعد تحميل الصفحة قبل التعديل.',
  },
} as const;

const sectionTitles: Record<Locale, Record<ProfileSectionId, string>> = {
  en: { about: 'About', qualifications: 'Qualifications', experience: 'Experience', approach: 'Teaching approach', goals: 'Learning goals' },
  ar: { about: 'نبذة', qualifications: 'المؤهلات', experience: 'الخبرة', approach: 'أسلوب التدريس', goals: 'أهداف التعلم' },
};

type Props = {
  locale: Locale;
  details: RichProfileInput | null;
  version: number | null;
  error: string | null;
  teacher: { id: string; full_name: string; headline: string | null };
  avatarUrl: string | null;
  coverUrl: string | null;
  specializations: Array<{ id: string; subject: string; context: string }>;
  groups: Group[];
  contactVisibility: 'public' | 'enrolled';
  previewContacts: PublicTeacherVisitorContacts | null;
};

function move<T>(items: T[], index: number, offset: number) {
  const next = [...items];
  const target = index + offset;
  if (target < 0 || target >= next.length) return next;
  [next[index], next[target]] = [next[target], next[index]];
  return next;
}

function localizedField(
  value: LocalizedText,
  update: (next: LocalizedText) => void,
  label: string,
  maxLength: number,
  rows: number,
  fieldKey: string,
  pathPrefix: string,
  locale: Locale,
  fieldErrors: Record<string, string> | undefined,
) {
  const messages = copy[locale];
  const errorMessage = (path: string) => fieldErrors?.[path]
    ? path.endsWith('.start_year') || path.endsWith('.end_year') ? messages.yearError : messages.fieldError
    : undefined;
  return <div className="grid gap-3 sm:grid-cols-2">
    {(['ar', 'en'] as const).map(language => {
      const id = `${fieldKey.replace(/[^a-z0-9]/gi, '-').toLowerCase()}-${language}`;
      const errorId = `${id}-error`;
      const path = `${pathPrefix}.${language}`;
      const invalid = !!fieldErrors?.[path];
      const left = maxLength - value[language].length;
      return <div key={language} className="min-w-0">
        <label htmlFor={id} className="block text-sm font-bold">{language === 'ar' ? `${messages.ar} · ${label}` : `${messages.en} · ${label}`}</label>
        {rows === 1
          ? <input id={id} value={value[language]} onChange={event => update({ ...value, [language]: event.target.value })} maxLength={maxLength} dir={language === 'ar' ? 'rtl' : 'ltr'} aria-invalid={invalid} aria-describedby={invalid ? errorId : undefined} className="mt-1 block w-full min-w-0 rounded-xl border border-line bg-cream p-3" />
          : <textarea id={id} value={value[language]} onChange={event => update({ ...value, [language]: event.target.value })} maxLength={maxLength} rows={rows} dir={language === 'ar' ? 'rtl' : 'ltr'} aria-invalid={invalid} aria-describedby={invalid ? errorId : undefined} className="mt-1 block w-full min-w-0 rounded-xl border border-line bg-cream p-3" />}
        <p className="mt-1 text-end text-xs text-muted" aria-live="polite">{left} {language === 'ar' ? 'حرف متبقٍ' : 'characters left'}</p>
        {invalid && <p id={errorId} className="mt-1 text-sm text-red-700">{errorMessage(path)}</p>}
      </div>;
    })}
  </div>;
}

export function TeacherProfileDetailsForm({ locale, details, version, error, teacher, avatarUrl, coverUrl, specializations, groups, contactVisibility, previewContacts }: Props) {
  const ar = locale === 'ar';
  const t = copy[locale];
  const [hasInitialSnapshot] = useState(details !== null && version !== null);
  const [snapshotVersion] = useState(version);
  const [value, setValue] = useState<RichProfileInput>(() => details ?? emptyRichProfile());
  const [state, action, pending] = useActionState<RichProfileActionState, FormData>(saveTeacherProfileDetails.bind(null, locale), null);
  const comparable = (profile: RichProfileInput) => ({
    ...profile,
    qualifications: profile.qualifications.filter(profileEntryHasContent),
    experience: profile.experience.filter(profileEntryHasContent),
  });
  const [baseline, setBaseline] = useState(() => JSON.stringify(comparable(details ?? emptyRichProfile())));
  const submittedSnapshot = useRef<string | null>(null);
  const handledSuccess = useRef<RichProfileActionState>(null);
  const dirty = JSON.stringify(comparable(value)) !== baseline;
  useUnsavedProfileSection('details', dirty);
  useEffect(() => {
    if (state?.success && state !== handledSuccess.current) {
      handledSuccess.current = state;
      if (submittedSnapshot.current) setBaseline(submittedSnapshot.current);
    }
  }, [state]);
  const [showPreview, setShowPreview] = useState(false);
  const [languageIds, setLanguageIds] = useState(() => (details?.languages ?? []).map((_, index) => `language-${index}`));
  const nextLanguageId = useRef(languageIds.length);

  const errorFor = (path: string) => state?.fieldErrors?.[path];
  const fieldErrorMessage = (path: string) => {
    if (!errorFor(path)) return undefined;
    if (path.startsWith('languages.')) return t.languageError;
    if (path.endsWith('.start_year') || path.endsWith('.end_year')) return t.yearError;
    return t.fieldError;
  };
  const errorDescription = (path: string, id: string, fallback: string = t.fieldError) => errorFor(path)
    ? <p id={id} className="mt-1 text-sm text-red-700">{fieldErrorMessage(path) ?? fallback}</p>
    : null;
  const submittedValue: RichProfileInput = {
    ...value,
    qualifications: value.qualifications.filter(profileEntryHasContent),
    experience: value.experience.filter(profileEntryHasContent),
  };

  const updateText = (field: 'about' | 'approach' | 'goals' | 'city', next: LocalizedText) => setValue(current => ({ ...current, [field]: next }));
  const updateEntries = (field: 'qualifications' | 'experience', update: (entries: ProfileEntry[]) => ProfileEntry[]) => setValue(current => ({ ...current, [field]: update(current[field]) }));
  const entries = (field: 'qualifications' | 'experience') => value[field];
  const sectionCompletion = profileSectionIds.filter(id => {
    const section = value[id];
    return Array.isArray(section) ? section.some(profileEntryHasContent) : Boolean(section.en.trim() || section.ar.trim());
  }).length;
  const preview = buildTeacherVisitorView({
    teacher,
    details: visiblePublicTeacherProfile(submittedValue),
    contactVisibility,
    contacts: previewContacts,
    specializations,
    groups,
    avatarUrl,
    coverUrl,
  });

  const entryCard = (kind: 'qualifications' | 'experience', entry: ProfileEntry, index: number) => <fieldset key={entry.id} className="min-w-0 space-y-4 rounded-2xl border border-line p-4">
    <legend className="px-2 font-bold">{t[kind]} {index + 1}</legend>
    {localizedField(entry.title, next => updateEntries(kind, list => list.map(item => item.id === entry.id ? { ...item, title: next } : item)), t.title, 120, 1, `${kind}-${entry.id}-title`, `${kind}.${index}.title`, locale, state?.fieldErrors)}
    {localizedField(entry.organization, next => updateEntries(kind, list => list.map(item => item.id === entry.id ? { ...item, organization: next } : item)), t.organization, 120, 1, `${kind}-${entry.id}-organization`, `${kind}.${index}.organization`, locale, state?.fieldErrors)}
    {localizedField(entry.description, next => updateEntries(kind, list => list.map(item => item.id === entry.id ? { ...item, description: next } : item)), t.description, 1_500, 3, `${kind}-${entry.id}-description`, `${kind}.${index}.description`, locale, state?.fieldErrors)}
    <div className="grid gap-3 sm:grid-cols-2">
      {(['start_year', 'end_year'] as const).map(year => <div key={year}>
        <label htmlFor={`${kind}-${entry.id}-${year}`} className="block text-sm font-bold">{year === 'start_year' ? t.startYear : t.endYear}</label>
        <input id={`${kind}-${entry.id}-${year}`} type="number" min={1900} max={new Date().getFullYear() + 1} value={entry[year] ?? ''} disabled={year === 'end_year' && entry.current} aria-invalid={!!errorFor(`${kind}.${index}.${year}`)} aria-describedby={errorFor(`${kind}.${index}.${year}`) ? `${kind}-${entry.id}-${year}-error` : undefined} onChange={event => updateEntries(kind, list => list.map(item => item.id === entry.id ? { ...item, [year]: event.target.value ? Number(event.target.value) : null } : item))} className="mt-1 block w-full rounded-xl border border-line bg-cream p-3 disabled:opacity-50" />
        {errorDescription(`${kind}.${index}.${year}`, `${kind}-${entry.id}-${year}-error`)}
      </div>)}
    </div>
    <label className="flex items-center gap-2 text-sm font-medium"><input type="checkbox" checked={entry.current} onChange={event => updateEntries(kind, list => list.map(item => item.id === entry.id ? { ...item, current: event.target.checked, end_year: event.target.checked ? null : item.end_year } : item))} className="size-4 accent-teal" />{t.current}</label>
    <button type="button" onClick={() => updateEntries(kind, list => list.filter(item => item.id !== entry.id))} className="rounded-lg border border-line px-3 py-2 text-sm font-bold">{t.remove}</button>
  </fieldset>;

  if (error || !hasInitialSnapshot || snapshotVersion === null) return <section className="rounded-xl border border-orange/30 bg-orange/5 p-4" aria-labelledby="profile-details-heading">
    <h2 id="profile-details-heading" className="text-lg font-black text-teal">{t.heading}</h2><p role="alert" className="mt-2 text-sm">{error ?? t.detailsUnavailable}</p>
  </section>;

  return <section className="mt-8 border-t border-line pt-6" aria-labelledby="profile-details-heading" dir={ar ? 'rtl' : 'ltr'}>
    <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
      <div><h2 id="profile-details-heading" className="text-2xl font-black text-teal">{t.heading}</h2><p className="mt-1 text-sm text-muted">{t.intro}</p><p className="mt-1 text-xs text-muted">{t.optionalProgress}: {sectionCompletion}/{profileSectionIds.length}</p></div>
      <button type="button" onClick={() => setShowPreview(current => !current)} aria-expanded={showPreview} aria-controls="teacher-owner-preview" className="rounded-xl border border-teal px-4 py-2.5 text-sm font-bold text-teal">{showPreview ? t.hidePreview : t.preview}</button>
    </div>

    {showPreview && <aside id="teacher-owner-preview" className="mt-5 rounded-2xl border-2 border-dashed border-orange p-3 sm:p-5" aria-label={t.previewLabel}>
      <p className="mb-4 rounded-lg bg-orange/10 p-3 text-sm font-bold">{t.previewLabel}</p>
      {contactVisibility === 'enrolled' && <p className="mb-4 rounded-lg border border-line p-3 text-sm text-muted">{t.privateContactHint}</p>}
      <TeacherProfile view={preview} locale={locale} backLabel={ar ? 'العودة إلى اكتشف' : 'Back to discover'} />
    </aside>}

    <form action={action} onSubmit={() => { submittedSnapshot.current = JSON.stringify(comparable(value)); }} className="mt-6 space-y-7">
      {/* Keep editor array indices intact until schema validation returns field paths. The save action removes blank rows before persistence. */}
      <input type="hidden" name="details" value={JSON.stringify(value)} />
      <input type="hidden" name="expected_version" value={state?.version ?? snapshotVersion} />

      <section className="space-y-5" aria-labelledby="profile-about-heading">
        <h3 id="profile-about-heading" className="text-lg font-black text-teal">{t.about}</h3>
        {localizedField(value.about, next => updateText('about', next), t.about, 5_000, 6, 'about', 'about', locale, state?.fieldErrors)}
      </section>

      {(['qualifications', 'experience'] as const).map(kind => <section key={kind} className="space-y-4 border-t border-line pt-5" aria-labelledby={`profile-${kind}-heading`}>
        <div className="flex flex-wrap items-center justify-between gap-3"><h3 id={`profile-${kind}-heading`} className="text-lg font-black text-teal">{t[kind]}</h3><button type="button" disabled={entries(kind).length >= 10} onClick={() => updateEntries(kind, list => [...list, { id: crypto.randomUUID(), title: { ar: '', en: '' }, organization: { ar: '', en: '' }, description: { ar: '', en: '' }, start_year: null, end_year: null, current: false }])} className="rounded-lg border border-line px-3 py-2 text-sm font-bold disabled:opacity-50">{kind === 'qualifications' ? t.addQualification : t.addExperience}</button></div>
        {errorFor(kind) && <p id={`profile-${kind}-error`} className="text-sm text-red-700">{t.fieldError}</p>}
        {entries(kind).map((entry, index) => entryCard(kind, entry, index))}
      </section>)}

      {(['approach', 'goals'] as const).map(section => <section key={section} className="space-y-4 border-t border-line pt-5" aria-labelledby={`profile-${section}-heading`}>
        <h3 id={`profile-${section}-heading`} className="text-lg font-black text-teal">{t[section]}</h3>
        {localizedField(value[section], next => updateText(section, next), t[section], 2_000, 4, section, section, locale, state?.fieldErrors)}
      </section>)}

      <section className="space-y-5 border-t border-line pt-5" aria-labelledby="profile-context-heading">
        <h3 id="profile-context-heading" className="text-lg font-black text-teal">{t.city}</h3>
        {localizedField(value.city, next => updateText('city', next), t.city, 120, 1, 'city', 'city', locale, state?.fieldErrors)}
        <fieldset aria-invalid={!!errorFor('languages')} aria-describedby={errorFor('languages') ? 'profile-languages-error' : undefined}><legend className="text-sm font-bold">{t.languages}</legend>
          <div className="mt-2 space-y-2">{value.languages.map((language, index) => {
            const id = `profile-language-${languageIds[index]}`;
            const path = `languages.${index}`;
            const invalid = !!errorFor(path);
            return <div key={languageIds[index]} className="flex min-w-0 flex-wrap gap-2"><div className="min-w-0 flex-1"><label htmlFor={id} className="sr-only">{t.languages} {index + 1}</label><input id={id} value={language} maxLength={60} aria-invalid={invalid} aria-describedby={invalid ? `${id}-error` : undefined} onChange={event => setValue(current => ({ ...current, languages: current.languages.map((item, itemIndex) => itemIndex === index ? event.target.value : item) }))} className="min-w-0 w-full rounded-xl border border-line bg-cream p-3" />{errorDescription(path, `${id}-error`, t.languageError)}</div><button type="button" onClick={() => { setValue(current => ({ ...current, languages: current.languages.filter((_, itemIndex) => itemIndex !== index) })); setLanguageIds(current => current.filter((_, itemIndex) => itemIndex !== index)); }} className="rounded-lg border border-line px-3 font-bold">{t.remove}</button></div>;
          })}</div>
          {errorFor('languages') && errorDescription('languages', 'profile-languages-error', t.languageError)}
          <button type="button" disabled={value.languages.length >= 10} onClick={() => { setValue(current => ({ ...current, languages: [...current.languages, ''] })); setLanguageIds(current => [...current, `language-${nextLanguageId.current++}`]); }} className="mt-3 rounded-lg border border-line px-3 py-2 text-sm font-bold disabled:opacity-50">{t.addLanguage}</button>
        </fieldset>
        <div><label htmlFor="profile-teaching-mode" className="block text-sm font-bold">{t.teachingMode}</label><select id="profile-teaching-mode" value={value.teaching_mode ?? ''} onChange={event => setValue(current => ({ ...current, teaching_mode: event.target.value ? event.target.value as RichProfileInput['teaching_mode'] : null }))} className="mt-1 block w-full rounded-xl border border-line bg-cream p-3"><option value="">{t.unset}</option><option value="online">{t.online}</option><option value="in_person">{t.in_person}</option><option value="both">{t.both}</option></select></div>
      </section>

      <section className="space-y-5 border-t border-line pt-5" aria-labelledby="profile-layout-heading">
        <h3 id="profile-layout-heading" className="text-lg font-black text-teal">{t.appearance}</h3>
        <div className="grid gap-4 sm:grid-cols-2"><div><label htmlFor="profile-layout" className="block text-sm font-bold">{t.layout}</label><select id="profile-layout" value={value.layout} onChange={event => setValue(current => ({ ...current, layout: event.target.value as RichProfileInput['layout'] }))} className="mt-1 block w-full rounded-xl border border-line bg-cream p-3"><option value="classic">{t.classic}</option><option value="compact">{t.compact}</option></select></div><div><label htmlFor="profile-palette" className="block text-sm font-bold">{t.palette}</label><select id="profile-palette" value={value.palette} onChange={event => setValue(current => ({ ...current, palette: event.target.value as RichProfileInput['palette'] }))} className="mt-1 block w-full rounded-xl border border-line bg-cream p-3"><option value="teal">{t.teal}</option><option value="indigo">{t.indigo}</option><option value="olive">{t.olive}</option></select></div></div>
      </section>

      <section className="space-y-4 border-t border-line pt-5" aria-labelledby="profile-sections-heading">
        <h3 id="profile-sections-heading" className="text-lg font-black text-teal">{t.sections}</h3><p className="text-sm text-muted">{t.sectionOrder}</p>
        {errorFor('section_order') && <p id="profile-section-order-error" className="text-sm text-red-700">{t.fieldError}</p>}
        {value.section_order.map((id, index) => <div key={id} className="flex min-w-0 flex-wrap items-center gap-3 rounded-xl border border-line p-3"><span className="min-w-0 flex-1 font-bold">{index + 1}. {sectionTitles[locale][id]}</span><label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={value.hidden_sections.includes(id)} onChange={event => setValue(current => ({ ...current, hidden_sections: event.target.checked ? [...current.hidden_sections, id] : current.hidden_sections.filter(item => item !== id) }))} className="size-4 accent-teal" />{t.hidden}</label><button type="button" disabled={index === 0} onClick={() => setValue(current => ({ ...current, section_order: move(current.section_order, index, -1) }))} aria-label={`${t.moveUp}: ${sectionTitles[locale][id]}`} className="rounded-lg border border-line px-3 py-2 text-sm font-bold disabled:opacity-40">↑</button><button type="button" disabled={index === value.section_order.length - 1} onClick={() => setValue(current => ({ ...current, section_order: move(current.section_order, index, 1) }))} aria-label={`${t.moveDown}: ${sectionTitles[locale][id]}`} className="rounded-lg border border-line px-3 py-2 text-sm font-bold disabled:opacity-40">↓</button></div>)}
      </section>

      {state?.error && <p role="alert" className="rounded-xl bg-red-50 p-3 text-sm text-red-800">{state.error.includes('changed while') || state.error.includes('تغير ملفك') ? t.reloadError : state.fieldErrors ? Object.keys(state.fieldErrors).some(path => path !== 'form') ? t.formError : t.payloadError : state.error}</p>}
      {state?.success && <p role="status" className="rounded-xl bg-teal/10 p-3 text-sm font-bold text-teal">{state.success}</p>}
      <button type="submit" disabled={pending} className="w-full rounded-xl bg-teal px-5 py-3 font-bold text-white disabled:cursor-wait disabled:opacity-50 sm:w-auto">{pending ? t.saving : t.save}</button>
    </form>
  </section>;
}
