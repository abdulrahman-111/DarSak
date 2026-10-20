'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { setupCopy } from './copy';
import { saveSetupStage, completeSetup, restartSetup } from './actions';
import { addTeacherSpecialization } from '@/features/teacher/profile-actions';
import {
  catalogueDisplayName,
  isTeacherCatalogueCategory,
  type CatalogueChoiceNode,
  type CatalogueChoiceSubject,
} from '@/features/teacher/catalogue-domain';
import { saveTeacherCatalogueSubject } from '@/features/teacher/catalogue-actions';
import { addOfferingChoice } from './offering-choice';
import type { SetupDraft } from './domain';
import type { Locale } from '@/i18n/config';
import {
  richProfileSchema,
  type RichProfileInput,
} from '@/features/teacher/profile-details-domain';
import { hasTeacherApplicationBackground } from '@/features/teacher/application-domain';
import {
  splitStudentInterests,
  validateStudentLearningProfile,
} from '@/features/student/student-profile-domain';
import { TeacherRulesPanel } from '@/features/teacher/teacher-rules-panel';

type Offering = { id: string; label: string };
type Props = {
  locale: Locale;
  draft: SetupDraft | null;
  role: 'teacher' | 'student';
  offerings: Offering[];
  subjects: CatalogueChoiceSubject[];
  nodes: CatalogueChoiceNode[];
  returnTo: string;
  loadError: boolean;
};
type Entry = {
  id: string;
  title: { ar: string; en: string };
  organization: { ar: string; en: string };
  description: { ar: string; en: string };
  start_year: number | null;
  end_year: number | null;
  current: boolean;
};
type SetupValues = {
  about?: {
    full_name?: string;
    headline?: string;
    age_range?: string | null;
    school_name?: string;
  };
  details?: Partial<RichProfileInput>;
  background?: { teaching_years?: number | null };
  offerings?: { offering_ids?: string[] };
  verification?: {
    admin_phone?: string;
    cv_url?: string | null;
    cv_path?: string | null;
    supporting_links?: string[];
    attested?: boolean;
  };
  learning?: { education_year?: string; interests?: string[]; learning_goal?: string };
};
const emptyEntry = (): Entry => ({
  id: crypto.randomUUID(),
  title: { ar: '', en: '' },
  organization: { ar: '', en: '' },
  description: { ar: '', en: '' },
  start_year: null,
  end_year: null,
  current: false,
});
const inputClass =
  'mt-1 min-h-12 w-full rounded-xl border border-line bg-white px-3 py-2 text-base text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange';

export function SetupWizard({
  locale,
  draft: initial,
  role,
  offerings,
  subjects,
  nodes,
  returnTo,
  loadError,
}: Props) {
  const ar = locale === 'ar';
  const c = setupCopy(locale);
  const router = useRouter();
  const [draft, setDraft] = useState(initial);
  const [stage, setStage] = useState(initial?.stage ?? 1);
  const [review, setReview] = useState(false);
  const [busy, start] = useTransition();
  const [error, setError] = useState('');
  const [fieldErrors, setFieldErrors] = useState<string[]>([]);
  const [completionError, setCompletionError] = useState('');
  const [teacherRulesAccepted, setTeacherRulesAccepted] = useState(false);
  const [restartAvailable, setRestartAvailable] = useState(false);
  const [subjectId, setSubjectId] = useState('');
  const [nodeId, setNodeId] = useState('');
  const [offeringError, setOfferingError] = useState('');
  const [subjectOptions, setSubjectOptions] = useState(subjects);
  const [newSubjectName, setNewSubjectName] = useState('');
  const [subjectCreateError, setSubjectCreateError] = useState('');
  const [subjectCreateNotice, setSubjectCreateNotice] = useState('');
  const [offeringChoices, setOfferingChoices] = useState(offerings);
  const selectableNodes = nodes.filter(
    row => row.archived_at === null && isTeacherCatalogueCategory(row),
  );
  const [languagesText, setLanguagesText] = useState(
    initial?.role === 'teacher' ? initial.payload.details.languages.join(', ') : '',
  );
  const [interestsText, setInterestsText] = useState(
    initial?.role === 'student' ? initial.payload.learning.interests.join(', ') : '',
  );
  const payload = (draft?.payload ?? {}) as SetupValues;
  const teacher = role === 'teacher';
  const last = teacher ? 4 : 2;
  const effectiveStage = review ? last + 1 : stage;
  const labels = teacher
    ? [c.about, c.background, c.offerings, c.verification, c.review]
    : [c.about, c.learning, c.finish];
  const update = (fn: (current: Record<string, unknown>) => Record<string, unknown>) =>
    setDraft(current =>
      current
        ? ({
            ...current,
            payload: fn(current.payload as unknown as Record<string, unknown>),
          } as SetupDraft)
        : null,
    );
  const setAt = (path: string[], value: unknown) =>
    update(current => {
      const next = structuredClone(current) as Record<string, unknown>;
      let node: Record<string, unknown> = next;
      for (const key of path.slice(0, -1)) {
        const existing = node[key];
        if (!existing || typeof existing !== 'object') node[key] = {};
        node = node[key] as Record<string, unknown>;
      }
      node[path[path.length - 1]] = value;
      return next;
    });
  const getAt = (path: string[]) =>
    path.reduce<unknown>(
      (value, key) =>
        value && typeof value === 'object' ? (value as Record<string, unknown>)[key] : undefined,
      payload,
    );
  const currentStagePayload = (): Record<string, unknown> => {
    if (teacher && stage === 1)
      return {
        full_name: payload.about?.full_name ?? '',
        headline: payload.about?.headline ?? '',
        languages: languagesText
          .split(',')
          .map(x => x.trim())
          .filter(Boolean),
      };
    if (teacher && stage === 2)
      return {
        about: payload.details?.about ?? { ar: '', en: '' },
        approach: payload.details?.approach ?? { ar: '', en: '' },
        qualifications: payload.details?.qualifications ?? [],
        experience: payload.details?.experience ?? [],
        teaching_years: payload.background?.teaching_years ?? null,
      };
    if (teacher && stage === 3) return { offering_ids: payload.offerings?.offering_ids ?? [] };
    if (teacher)
      return {
        admin_phone: payload.verification?.admin_phone ?? '',
        cv_url: payload.verification?.cv_url || null,
        supporting_links: (payload.verification?.supporting_links ?? []).filter(Boolean),
        attested: !!payload.verification?.attested,
      };
    if (stage === 1)
      return {
        full_name: payload.about?.full_name ?? '',
        age_range: payload.about?.age_range ?? null,
        school_name: payload.about?.school_name ?? '',
      };
    return {
      education_year: payload.learning?.education_year ?? '',
      interests: splitStudentInterests(interestsText),
      learning_goal: payload.learning?.learning_goal ?? '',
    };
  };
  const validate = () => {
    const invalid: string[] = [];
    if (teacher && stage === 1) {
      if ((payload.about?.full_name ?? '').trim().length < 2) invalid.push('about-full_name');
      if ((payload.about?.headline ?? '').trim().length < 5) invalid.push('about-headline');
    } else if (teacher && stage === 2) {
      if (
        Math.max(
          (payload.details?.about?.ar ?? '').trim().length,
          (payload.details?.about?.en ?? '').trim().length,
        ) < 80
      )
        invalid.push('details-about-en');
      if (
        !hasTeacherApplicationBackground({
          qualifications: payload.details?.qualifications ?? [],
          experience: payload.details?.experience ?? [],
        })
      )
        invalid.push('experience_or_qualification');
      if (
        !Number.isInteger(payload.background?.teaching_years) ||
        (payload.background?.teaching_years ?? -1) < 0 ||
        (payload.background?.teaching_years ?? 61) > 60
      )
        invalid.push('background-teaching_years');
    } else if (teacher && stage === 3) {
      if (!(payload.offerings?.offering_ids ?? []).length) invalid.push('offering_ids');
    } else if (teacher) {
      const phone = String(payload.verification?.admin_phone ?? '');
      if (!/^[\d\s()+-]{7,30}$/.test(phone) || phone.replace(/\D/g, '').length < 7)
        invalid.push('verification-admin_phone');
      const cvUrl = payload.verification?.cv_url?.trim() ?? '';
      if (cvUrl && (cvUrl.length > 500 || !/^https:\/\/drive\.google\.com\//i.test(cvUrl)))
        invalid.push('verification-cv_url');
      if (!payload.verification?.attested) invalid.push('attested');
      if (
        (payload.verification?.supporting_links ?? []).some(
          link => link && (link.length > 500 || !/^https:\/\//i.test(link)),
        )
      )
        invalid.push('verification-links');
    } else if (stage === 1) {
      if ((payload.about?.full_name ?? '').trim().length < 2) invalid.push('about-full_name');
      if (!payload.about?.age_range) invalid.push('age_range');
    } else {
      const interests = splitStudentInterests(interestsText);
      if (!(payload.learning?.education_year ?? '').trim()) invalid.push('learning-education_year');
      if (
        interests.length < 1 ||
        interests.length > 10 ||
        interests.some((item: string) => !item.trim() || item.length > 80)
      )
        invalid.push('learning-interests');
      if ((payload.learning?.learning_goal ?? '').trim().length < 10)
        invalid.push('learning-learning_goal');
      const studentValidation = validateStudentLearningProfile({
        full_name: payload.about?.full_name ?? '',
        age_range: payload.about?.age_range ?? '',
        school_name: payload.about?.school_name ?? '',
        education_year: payload.learning?.education_year ?? '',
        interests_text: interestsText,
        learning_goal: payload.learning?.learning_goal ?? '',
      });
      if (!studentValidation.success)
        for (const key of Object.keys(studentValidation.errors)) {
          if (key === 'interests') invalid.push('learning-interests');
          else if (key === 'education_year') invalid.push('learning-education_year');
          else if (key === 'learning_goal') invalid.push('learning-learning_goal');
          else if (key === 'age_range') invalid.push('age_range');
          else invalid.push('about-full_name');
        }
    }
    if (teacher && stage === 2) {
      const detailsValidation = richProfileSchema.safeParse(payload.details);
      if (!detailsValidation.success) {
        const issue = detailsValidation.error.issues[0];
        const section = String(issue?.path[0] ?? 'about');
        if (section === 'about') invalid.push('details-about-en');
        else if (section === 'approach') invalid.push('details-approach-en');
        else if (section === 'qualifications' || section === 'experience') {
          const index = typeof issue?.path[1] === 'number' ? issue.path[1] : 0;
          const key = typeof issue?.path[2] === 'string' ? issue.path[2] : 'title';
          const language = issue?.path[3] === 'ar' ? 'ar' : 'en';
          const localized =
            ['title', 'organization', 'description'].includes(key) &&
            (issue?.path[3] === 'ar' || issue?.path[3] === 'en');
          invalid.push(`${section}-${index}-${key}${localized ? `-${language}` : ''}`);
        } else invalid.push('background-teaching_years');
      }
    }
    setFieldErrors(invalid);
    return invalid;
  };
  const navigateSave = (intent: 'next' | 'back' | 'exit') => {
    if (intent === 'next' && !review) {
      const invalid = validate();
      if (invalid.length) {
        setError(c.invalid);
        document.getElementById(invalid[0])?.focus();
        return;
      }
    }
    const stagePayload = review ? {} : currentStagePayload();
    const form = new FormData();
    form.set('stage', String(stage));
    form.set('version', String(draft?.version ?? 0));
    form.set('intent', intent);
    form.set('return_to', returnTo);
    form.set('payload', JSON.stringify(stagePayload));
    setError('');
    start(async () => {
      const result = await saveSetupStage(locale, null, form);
      if (result?.error) {
        if (result.draft) {
          setDraft(result.draft);
          setStage(result.draft.stage);
        }
        setError(
          result.error === 'conflict'
            ? c.conflict
            : result.error === 'invalid'
              ? c.invalid
              : c.saveError,
        );
        setRestartAvailable(result.error === 'conflict');
        return;
      }
      if (result?.draft) {
        setDraft(result.draft);
        setStage(result.draft.stage);
        setRestartAvailable(false);
        if (review) setReview(false);
        else if (intent === 'next' && stage === last) setReview(true);
        setFieldErrors([]);
      }
    });
  };
  const submit = () =>
    start(async () => {
      setCompletionError('');
      if (teacher && !teacherRulesAccepted) {
        setCompletionError('teacher-rules');
        return;
      }
      const result = await completeSetup(
        locale,
        draft?.version ?? 0,
        returnTo,
        teacherRulesAccepted,
      );
      if (result.error) {
        setCompletionError(result.error === 'conflict' ? c.conflict : c.saveError);
        setRestartAvailable(result.error === 'conflict');
        return;
      }
      router.push(teacher ? `/${locale}/account/application` : (result.destination ?? returnTo));
      router.refresh();
    });
  const restart = () => {
    if (!window.confirm(c.restartConfirm)) return;
    start(async () => {
      const result = await restartSetup(locale, draft?.version ?? 0, returnTo);
      if (result.error || !result.draft) {
        setCompletionError(result.error === 'conflict' ? c.conflict : c.saveError);
        setRestartAvailable(result.error === 'conflict');
        return;
      }
      setDraft(result.draft);
      setStage(result.draft.stage);
      setReview(false);
      setError('');
      setCompletionError('');
      setTeacherRulesAccepted(false);
      setFieldErrors([]);
      setRestartAvailable(false);
      if (result.draft.role === 'teacher')
        setLanguagesText(result.draft.payload.details.languages.join(', '));
      else setInterestsText(result.draft.payload.learning.interests.join(', '));
    });
  };
  const addOffering = () =>
    start(async () => {
      setOfferingError('');
      const form = new FormData();
      form.set('subject_id', subjectId);
      form.set('category_id', nodeId);
      const result = await addTeacherSpecialization(locale, null, form);
      if (result?.error || !result?.row) {
        setOfferingError(result?.error || c.offeringAddError);
        return;
      }
      const selected = addOfferingChoice(
        offeringChoices,
        payload.offerings?.offering_ids ?? [],
        result.row,
        subjectOptions,
        nodes,
        locale,
      );
      setOfferingChoices(selected.choices);
      setAt(['offerings', 'offering_ids'], selected.selectedIds);
      router.refresh();
    });
  const createSubject = () =>
    start(async () => {
      setSubjectCreateError('');
      setSubjectCreateNotice('');
      const name = newSubjectName.trim();
      const form = new FormData();
      form.set('name_en', ar ? '' : name);
      form.set('name_ar', ar ? name : '');
      const result = await saveTeacherCatalogueSubject(locale, null, form);
      if (!result || result.error || !result.id || !result.row) {
        setSubjectCreateError(result?.error || c.catalogueCreateError);
        return;
      }
      setSubjectOptions(current =>
        current.some(item => item.id === result.row!.id)
          ? current
          : [...current, result.row as CatalogueChoiceSubject],
      );
      setSubjectId(result.id);
      setNewSubjectName('');
      setSubjectCreateNotice(c.catalogueSaved);
      router.refresh();
    });
  const field = (
    label: string,
    path: string[],
    type = 'text',
    attrs: Record<string, unknown> = {},
    optional = false,
  ) => {
    const id = path.join('-');
    return (
      <label className="block font-bold">
        {label}
        {optional ? '' : ' *'}
        <input
          id={id}
          type={type}
          value={String(getAt(path) ?? '')}
          onChange={e =>
            setAt(
              path,
              type === 'number'
                ? e.currentTarget.value === ''
                  ? null
                  : Number(e.currentTarget.value)
                : e.currentTarget.value,
            )
          }
          className={inputClass}
          {...attrs}
        />
        {fieldErrors.includes(id) && <small className="text-danger">{c.invalid}</small>}
      </label>
    );
  };
  const textarea = (
    label: string,
    path: string[],
    attrs: Record<string, unknown> = {},
    optional = false,
  ) => {
    const id = path.join('-');
    return (
      <label className="block font-bold">
        {label}
        {optional ? '' : ' *'}
        <textarea
          id={id}
          value={String(getAt(path) ?? '')}
          onChange={e => setAt(path, e.currentTarget.value)}
          className={`${inputClass} min-h-28`}
          {...attrs}
        />
        {fieldErrors.includes(id) && <small className="text-danger">{c.invalid}</small>}
      </label>
    );
  };
  const entries = (kind: 'qualifications' | 'experience') => {
    const list: Entry[] = payload.details?.[kind] ?? [];
    return (
      <section id={kind} tabIndex={-1}>
        <h3 className="font-bold">{kind === 'qualifications' ? c.qualifications : c.experience}</h3>
        <p className="mt-1 text-sm text-muted">
          {kind === 'qualifications'
            ? ar
              ? 'أضف المسمى والمؤسسة وسنة الإكمال، أو حدد أنه مستمر حالياً. مثال: بكالوريوس الرياضيات — جامعة القاهرة.'
              : 'Include a title, institution, and completion year, or mark it current. Example: BSc Mathematics — Cairo University.'
            : ar
              ? 'أضف المسمى والمؤسسة والوصف وسنة البداية، ثم سنة النهاية أو حدد أنه مستمر حالياً. مثال: معلمة رياضيات — مدرسة النور، أدرّس الجبر وأتابع تقدم الطلاب.'
              : 'Include a role, organization, description, and start year, then an end year or mark it current. Example: Mathematics teacher — Al Noor School; teach algebra and track learner progress.'}
        </p>
        {list.map((item, i) => (
          <div
            key={item.id}
            className="mt-3 grid gap-3 rounded-xl border border-line p-3 sm:grid-cols-2"
          >
            {(['en', 'ar'] as const).map(lang => (
              <label key={lang} className="block text-sm">
                {c.entryTitle} · {lang.toUpperCase()} (max 120)
                <input
                  id={`${kind}-${i}-title-${lang}`}
                  maxLength={120}
                  className={inputClass}
                  value={item.title[lang]}
                  onChange={e =>
                    setAt(['details', kind, String(i), 'title', lang], e.currentTarget.value)
                  }
                />
              </label>
            ))}
            {(['en', 'ar'] as const).map(lang => (
              <label key={lang} className="block text-sm">
                {c.organization} · {lang.toUpperCase()} (max 120)
                <input
                  id={`${kind}-${i}-organization-${lang}`}
                  maxLength={120}
                  className={inputClass}
                  value={item.organization[lang]}
                  onChange={e =>
                    setAt(['details', kind, String(i), 'organization', lang], e.currentTarget.value)
                  }
                />
              </label>
            ))}
            {(['en', 'ar'] as const).map(lang => (
              <label key={lang} className="block text-sm">
                {c.description} · {lang.toUpperCase()} (max 1,500)
                <textarea
                  id={`${kind}-${i}-description-${lang}`}
                  maxLength={1500}
                  className={inputClass}
                  value={item.description[lang]}
                  onChange={e =>
                    setAt(['details', kind, String(i), 'description', lang], e.currentTarget.value)
                  }
                />
              </label>
            ))}
            {kind === 'experience' && (
              <label className="block text-sm">
                {c.startYear}
                <input
                  id={`${kind}-${i}-start_year`}
                  type="number"
                  min="1900"
                  max={new Date().getFullYear() + 1}
                  className={inputClass}
                  value={item.start_year ?? ''}
                  onChange={e =>
                    setAt(
                      ['details', kind, String(i), 'start_year'],
                      e.currentTarget.value ? Number(e.currentTarget.value) : null,
                    )
                  }
                />
              </label>
            )}
            <label className="block text-sm">
              {c.endYear}
              <input
                id={`${kind}-${i}-end_year`}
                type="number"
                min="1900"
                max={new Date().getFullYear() + 1}
                className={inputClass}
                value={item.end_year ?? ''}
                onChange={e =>
                  setAt(
                    ['details', kind, String(i), 'end_year'],
                    e.currentTarget.value ? Number(e.currentTarget.value) : null,
                  )
                }
                disabled={item.current}
              />
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={item.current}
                onChange={e => {
                  const checked = e.currentTarget.checked;
                  setAt(['details', kind, String(i), 'current'], checked);
                  if (checked) setAt(['details', kind, String(i), 'end_year'], null);
                }}
                className="size-5 accent-teal"
              />
              {c.current}
            </label>
            <button
              type="button"
              onClick={() =>
                setAt(
                  ['details', kind],
                  list.filter((_, index) => index !== i),
                )
              }
              className="text-sm font-bold text-danger underline"
            >
              {c.remove}
            </button>
          </div>
        ))}
        <button
          type="button"
          disabled={list.length >= 10}
          onClick={() => setAt(['details', kind], [...list, emptyEntry()])}
          className="mt-2 min-h-11 rounded-xl border border-teal px-4 font-bold text-teal disabled:opacity-50"
        >
          {c.add}
        </button>
      </section>
    );
  };

  if (loadError || !draft)
    return (
      <p role="alert" className="rounded-xl bg-danger-soft p-4 text-danger">
        {c.loadingError}
      </p>
    );
  return (
    <div dir={ar ? 'rtl' : 'ltr'} className="grid gap-6">
      <header>
        <h1 className="text-3xl font-bold text-ink">{c.title}</h1>
        <p className="mt-2 text-sm text-muted">{c.requiredHint}</p>
        <ol
          aria-label={ar ? 'مراحل الإعداد' : 'Setup progress'}
          className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-5"
        >
          {labels.map((label, index) => (
            <li
              key={label}
              aria-current={effectiveStage === index + 1 ? 'step' : undefined}
              className={`rounded-xl border p-3 text-sm ${effectiveStage === index + 1 ? 'border-teal bg-teal/10 font-bold' : 'border-line text-muted'}`}
            >
              <span className="me-2">{index + 1}.</span>
              {label}
            </li>
          ))}
        </ol>
      </header>
      {!review && (
        <section className="grid gap-5 rounded-2xl border border-line bg-white p-4 sm:p-6">
          <fieldset disabled={busy} className="contents">
            {teacher && stage === 1 && (
              <>
                {field(c.name, ['about', 'full_name'], 'text', { minLength: 2, maxLength: 100 })}
                {field(c.headline, ['about', 'headline'], 'text', { minLength: 5, maxLength: 160 })}
                <p className="-mt-4 text-sm text-muted">
                  {ar
                    ? 'مثال: معلمة رياضيات للمرحلتين المتوسطة والثانوية'
                    : 'Example: Middle and high school mathematics teacher'}
                </p>
                <label className="block font-bold">
                  {c.languages}
                  <input
                    id="languages"
                    maxLength={609}
                    className={inputClass}
                    value={languagesText}
                    onChange={e => setLanguagesText(e.currentTarget.value)}
                    onBlur={() =>
                      setAt(
                        ['details', 'languages'],
                        languagesText
                          .split(',')
                          .map(x => x.trim())
                          .filter(Boolean),
                      )
                    }
                  />
                  {fieldErrors.includes('languages') && (
                    <small className="text-danger">{c.invalid}</small>
                  )}
                </label>
              </>
            )}
            {teacher && stage === 2 && (
              <>
                <p className="text-sm text-muted">{c.bioHint}</p>
                {textarea(c.aboutEn, ['details', 'about', 'en'], { maxLength: 5000 })}
                <p className="-mt-4 text-sm text-muted">
                  Example: I have taught mathematics for eight years, helping learners build
                  confidence through clear explanations and practice.
                </p>
                {textarea(c.aboutAr, ['details', 'about', 'ar'], { maxLength: 5000 })}
                <p className="-mt-4 text-sm text-muted">
                  مثال: أدرّس الرياضيات منذ ثمانية أعوام، وأساعد الطلاب على بناء الثقة من خلال الشرح
                  الواضح والتدريب.
                </p>
                {textarea(c.approachEn, ['details', 'approach', 'en'], { maxLength: 2000 }, true)}
                <p className="-mt-4 text-sm text-muted">
                  Example: I start with a short check-in, explain one idea at a time, then use
                  guided problems and feedback.
                </p>
                {textarea(c.approachAr, ['details', 'approach', 'ar'], { maxLength: 2000 }, true)}
                <p className="-mt-4 text-sm text-muted">
                  مثال: أبدأ بمراجعة قصيرة، ثم أشرح فكرة واحدة في كل مرة وأستخدم مسائل موجهة مع
                  ملاحظات.
                </p>
                {field(c.years, ['background', 'teaching_years'], 'number', { min: 0, max: 60 })}
                <p
                  id="experience_or_qualification"
                  tabIndex={-1}
                  role={fieldErrors.includes('experience_or_qualification') ? 'alert' : undefined}
                  className={`text-sm ${fieldErrors.includes('experience_or_qualification') ? 'text-danger' : 'text-muted'}`}
                >
                  {c.experienceOrQualification}
                </p>
                {entries('qualifications')}
                {entries('experience')}
              </>
            )}
            {teacher && stage === 3 && (
              <fieldset id="offering_ids" tabIndex={-1}>
                <legend className="font-bold">{c.subject} *</legend>
                <p className="mt-1 text-sm text-muted">{c.catalogueHint}</p>
                {offeringChoices.length === 0 ? (
                  <p className="text-sm text-muted">{c.noOfferings}</p>
                ) : (
                  <div className="mt-3 grid gap-2 sm:grid-cols-2">
                    {offeringChoices.map(o => (
                      <label
                        key={o.id}
                        className="flex min-h-12 items-center gap-3 rounded-xl border border-line p-3"
                      >
                        <input
                          type="checkbox"
                          checked={(payload.offerings?.offering_ids ?? []).includes(o.id)}
                          onChange={e =>
                            setAt(
                              ['offerings', 'offering_ids'],
                              e.currentTarget.checked
                                ? [...(payload.offerings?.offering_ids ?? []), o.id]
                                : (payload.offerings?.offering_ids ?? []).filter(
                                    (id: string) => id !== o.id,
                                  ),
                            )
                          }
                          className="size-5 accent-teal"
                        />
                        <span>{o.label}</span>
                      </label>
                    ))}
                  </div>
                )}
                {fieldErrors.includes('offering_ids') && (
                  <p className="text-sm text-danger">{c.invalid}</p>
                )}
                <div className="mt-5 grid gap-3 rounded-xl border border-line p-3 sm:grid-cols-[1fr_1fr_auto]">
                  <label className="text-sm font-bold">
                    {ar ? 'المادة' : 'Subject'}
                    <select
                      className={inputClass}
                      value={subjectId}
                      onChange={event => setSubjectId(event.currentTarget.value)}
                    >
                      <option value="">—</option>
                      {subjectOptions.map(row => (
                        <option key={row.id} value={row.id}>
                          {catalogueDisplayName(row, locale)}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="text-sm font-bold">
                    {ar ? 'المرحلة أو الفئة' : 'Level or category'}
                    <select
                      className={inputClass}
                      value={nodeId}
                      onChange={event => setNodeId(event.currentTarget.value)}
                    >
                      <option value="">—</option>
                      {selectableNodes.map(row => (
                        <option key={row.id} value={row.id}>
                          {catalogueDisplayName(row, locale)}
                        </option>
                      ))}
                    </select>
                  </label>
                  <button
                    type="button"
                    disabled={busy || !subjectId || !nodeId}
                    onClick={addOffering}
                    className="min-h-12 self-end rounded-xl border border-teal px-4 font-bold text-teal disabled:opacity-50"
                  >
                    {ar ? 'إضافة' : 'Add combination'}
                  </button>
                </div>
                <div className="mt-4 grid gap-3 rounded-xl border border-line p-3 sm:grid-cols-[1fr_auto]">
                  <label className="text-sm font-bold">
                    {c.newSubject}
                    <input
                      className={inputClass}
                      maxLength={120}
                      value={newSubjectName}
                      onChange={event => setNewSubjectName(event.currentTarget.value)}
                    />
                    <span className="mt-1 block font-normal text-muted">{c.newSubjectHint}</span>
                  </label>
                  <button
                    type="button"
                    disabled={busy || !newSubjectName.trim()}
                    onClick={createSubject}
                    className="min-h-12 self-end rounded-xl border border-teal px-4 font-bold text-teal disabled:opacity-50"
                  >
                    {c.createSubject}
                  </button>
                </div>
                {subjectCreateError && (
                  <p role="alert" className="text-sm text-danger">
                    {subjectCreateError}
                  </p>
                )}
                {subjectCreateNotice && (
                  <p role="status" className="text-sm text-teal">
                    {subjectCreateNotice}
                  </p>
                )}
                {offeringError && (
                  <p role="alert" className="mt-2 text-sm text-danger">
                    {offeringError}
                  </p>
                )}
              </fieldset>
            )}
            {teacher && stage === 4 && (
              <>
                {field(c.phone, ['verification', 'admin_phone'], 'tel', {
                  maxLength: 30,
                  autoComplete: 'tel',
                })}
                <div>
                  <label htmlFor="verification-cv_url" className="block font-bold">
                    {c.cv}
                  </label>
                  <p className="text-sm text-muted">{c.cvPrivacy}</p>
                  <input
                    id="verification-cv_url"
                    type="url"
                    maxLength={500}
                    placeholder="https://drive.google.com/..."
                    className={inputClass}
                    value={payload.verification?.cv_url ?? ''}
                    onChange={e => setAt(['verification', 'cv_url'], e.currentTarget.value)}
                  />
                  <p className="mt-1 text-sm text-muted">{c.cvHint}</p>
                  {fieldErrors.includes('verification-cv_url') && (
                    <small className="text-danger">{c.invalidCv}</small>
                  )}
                </div>
                <div id="verification-links" tabIndex={-1}>
                  <h3 className="font-bold">{c.links}</h3>
                  {[0, 1, 2].map(i => (
                    <input
                      key={i}
                      aria-label={`${c.links} ${i + 1}`}
                      type="url"
                      placeholder="https://"
                      maxLength={500}
                      className={inputClass}
                      value={(payload.verification?.supporting_links ?? [])[i] ?? ''}
                      onChange={e => {
                        const links = [...(payload.verification?.supporting_links ?? [])];
                        links[i] = e.currentTarget.value;
                        setAt(['verification', 'supporting_links'], links);
                      }}
                    />
                  ))}
                  {fieldErrors.includes('verification-links') && (
                    <p className="text-sm text-danger">{c.invalid}</p>
                  )}
                </div>
                <label className="flex items-start gap-3 rounded-xl bg-orange/10 p-3">
                  <input
                    id="attested"
                    type="checkbox"
                    checked={!!payload.verification?.attested}
                    onChange={e => setAt(['verification', 'attested'], e.currentTarget.checked)}
                    className="mt-1 size-5 accent-teal"
                  />
                  <span>{c.attestation} *</span>
                </label>
                {fieldErrors.includes('attested') && (
                  <p className="text-sm text-danger">{c.invalid}</p>
                )}
              </>
            )}
            {!teacher && stage === 1 && (
              <>
                {field(c.name, ['about', 'full_name'], 'text', { minLength: 2, maxLength: 100 })}
                <label className="block font-bold">
                  {c.age} *
                  <select
                    id="age_range"
                    className={inputClass}
                    value={payload.about?.age_range ?? ''}
                    onChange={e => setAt(['about', 'age_range'], e.currentTarget.value || null)}
                  >
                    <option value="">—</option>
                    {(['under_13', '13_15', '16_17', '18_24', '25_plus'] as const).map(age => (
                      <option value={age} key={age}>
                        {c[`age_${age}`]}
                      </option>
                    ))}
                  </select>
                  {fieldErrors.includes('age_range') && (
                    <small className="text-danger">{c.invalid}</small>
                  )}
                </label>
                {field(c.school, ['about', 'school_name'], 'text', { maxLength: 160 }, true)}
              </>
            )}
            {!teacher && stage === 2 && (
              <>
                {field(c.year, ['learning', 'education_year'], 'text', { maxLength: 100 })}
                <label className="block font-bold">
                  {c.interests} *
                  <input
                    id="learning-interests"
                    className={inputClass}
                    value={interestsText}
                    onChange={e => setInterestsText(e.currentTarget.value)}
                    onBlur={() =>
                      setAt(['learning', 'interests'], splitStudentInterests(interestsText))
                    }
                  />
                  <span className="mt-1 block text-sm font-normal text-muted">
                    {ar ? 'مثال: العلوم، الرسم، كرة القدم' : 'Example: science, drawing, football'}
                  </span>
                  {fieldErrors.includes('learning-interests') && (
                    <small className="text-danger">{c.invalid}</small>
                  )}
                </label>
                {textarea(c.goal, ['learning', 'learning_goal'], {
                  minLength: 10,
                  maxLength: 1000,
                })}
                <p className="-mt-4 text-sm text-muted">
                  {ar
                    ? 'مثال: أريد أن أفهم الكسور وأحل المسائل بثقة.'
                    : 'Example: I want to understand fractions and solve problems with confidence.'}
                </p>
              </>
            )}
          </fieldset>
        </section>
      )}
      {review && (
        <section className="grid gap-3 rounded-2xl border border-line bg-white p-5">
          <h2 className="text-xl font-bold">{labels.at(-1)}</h2>
          <p>{c.reviewHint}</p>
          {teacher ? (
            <dl className="grid gap-2">
              <dt className="font-bold">{c.name}</dt>
              <dd>{payload.about?.full_name}</dd>
              <dt className="font-bold">{c.headline}</dt>
              <dd>{payload.about?.headline}</dd>
              <dt className="font-bold">{c.languages}</dt>
              <dd>{(payload.details?.languages ?? []).join(', ') || '—'}</dd>
              <dt className="font-bold">
                {c.aboutEn} / {c.aboutAr}
              </dt>
              <dd>{payload.details?.about?.en || payload.details?.about?.ar}</dd>
              <dt className="font-bold">
                {c.approachEn} / {c.approachAr}
              </dt>
              <dd>{payload.details?.approach?.en || payload.details?.approach?.ar || '—'}</dd>
              <dt className="font-bold">{c.years}</dt>
              <dd>{payload.background?.teaching_years}</dd>
              <dt className="font-bold">{c.qualifications}</dt>
              <dd>
                {(payload.details?.qualifications ?? [])
                  .map(e => e.title.en || e.title.ar)
                  .filter(Boolean)
                  .join(', ') || '—'}
              </dd>
              <dt className="font-bold">{c.experience}</dt>
              <dd>
                {(payload.details?.experience ?? [])
                  .map(e => e.title.en || e.title.ar)
                  .filter(Boolean)
                  .join(', ') || '—'}
              </dd>
              <dt className="font-bold">{c.subject}</dt>
              <dd>
                {(payload.offerings?.offering_ids ?? [])
                  .map(id => offerings.find(o => o.id === id)?.label)
                  .filter(Boolean)
                  .join(', ')}
              </dd>
              <dt className="font-bold">{c.phone}</dt>
              <dd>{payload.verification?.admin_phone}</dd>
              <dt className="font-bold">{c.links}</dt>
              <dd>
                {(payload.verification?.supporting_links ?? []).filter(Boolean).join(', ') || '—'}
              </dd>
              <dt className="font-bold">{c.cv}</dt>
              <dd>{payload.verification?.cv_url || c.noCv}</dd>
              <dt className="font-bold">{c.attestation}</dt>
              <dd>{payload.verification?.attested ? (ar ? 'تم الإقرار' : 'Confirmed') : '—'}</dd>
            </dl>
          ) : (
            <dl className="grid gap-2">
              <dt className="font-bold">{c.name}</dt>
              <dd>{payload.about?.full_name}</dd>
              <dt className="font-bold">{c.age}</dt>
              <dd>{payload.about?.age_range}</dd>
              <dt className="font-bold">{c.school}</dt>
              <dd>{payload.about?.school_name || '—'}</dd>
              <dt className="font-bold">{c.year}</dt>
              <dd>{payload.learning?.education_year}</dd>
              <dt className="font-bold">{c.interests}</dt>
              <dd>{interestsText}</dd>
              <dt className="font-bold">{c.goal}</dt>
              <dd>{payload.learning?.learning_goal}</dd>
            </dl>
          )}
          {teacher && (
            <TeacherRulesPanel
              locale={locale}
              accepted={teacherRulesAccepted}
              onAcceptedChange={value => {
                setTeacherRulesAccepted(value);
                if (value) setCompletionError('');
              }}
              showAcceptance
              error={completionError === 'teacher-rules'}
            />
          )}
        </section>
      )}
      {(error || (completionError && completionError !== 'teacher-rules')) && (
        <p role="alert" className="rounded-xl bg-danger-soft p-3 text-danger">
          {error || completionError}
        </p>
      )}
      {restartAvailable && (
        <button
          type="button"
          disabled={busy}
          onClick={restart}
          className="min-h-12 justify-self-start rounded-xl border border-line px-5 font-bold text-ink disabled:opacity-50"
        >
          {c.restart}
        </button>
      )}
      <nav className="flex flex-wrap gap-3" aria-label={ar ? 'التنقل' : 'Wizard controls'}>
        {(stage > 1 || review) && (
          <button
            type="button"
            disabled={busy}
            onClick={() => {
              if (review) {
                setReview(false);
                return;
              }
              navigateSave('back');
            }}
            className="min-h-12 rounded-xl border border-teal px-5 font-bold text-teal disabled:opacity-50"
          >
            {c.back}
          </button>
        )}
        {!review && (
          <button
            type="button"
            disabled={busy}
            onClick={() => navigateSave('next')}
            className="min-h-12 rounded-xl bg-teal px-5 font-bold text-white disabled:opacity-50"
          >
            {busy ? c.saving : c.next}
          </button>
        )}
        {review && (
          <button
            type="button"
            disabled={busy}
            onClick={submit}
            className="min-h-12 rounded-xl bg-orange px-5 font-bold text-white disabled:opacity-50 hover:bg-orange-deep"
          >
            {busy ? c.saving : teacher ? c.submit : c.finishSetup}
          </button>
        )}
        <button
          type="button"
          disabled={busy}
          onClick={() => navigateSave('exit')}
          className="min-h-12 rounded-xl border border-line px-5 font-bold text-ink disabled:opacity-50"
        >
          {busy ? c.saving : c.exit}
        </button>
      </nav>
    </div>
  );
}
