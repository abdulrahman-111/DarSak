'use client';

import { useEffect, useRef, useState } from 'react';
import {
  buildPreviewDraft,
  groupDraftInputSchema,
  groupDraftSchema,
  type AssistantLocale,
  type GroupDraft,
  type GroupDraftInput,
} from './domain';
import { emitSandakStatus, SANDAK_RETRY_EVENT } from '@/components/sandak/events';

type Props = {
  locale: AssistantLocale;
  disabled?: boolean;
  onApply: (draft: GroupDraft) => void;
};

const initialInput = (locale: AssistantLocale): GroupDraftInput => ({
  locale,
  topic: '',
  level: 'beginner',
  format: 'online',
  guidance: '',
});

export function GroupDraftPanel({ locale, disabled = false, onApply }: Props) {
  const ar = locale === 'ar';
  const [input, setInput] = useState(() => initialInput(locale));
  const [inputErrors, setInputErrors] = useState<Partial<Record<keyof GroupDraftInput, string>>>(
    {},
  );
  const [preview, setPreview] = useState<GroupDraft | null>(null);
  const [previewMessage, setPreviewMessage] = useState('');
  const [previewError, setPreviewError] = useState('');
  const [previewSource, setPreviewSource] = useState<'local' | 'sanad'>('local');
  const [aiMode, setAiMode] = useState(false);
  const [available, setAvailable] = useState<boolean | null>(null);
  const [loading, setLoading] = useState(false);
  const [aiError, setAiError] = useState('');
  const requestRef = useRef<AbortController | null>(null);
  const aliveRef = useRef(true);
  useEffect(() => {
    aliveRef.current = true;
    return () => {
      aliveRef.current = false;
      requestRef.current?.abort();
    };
  }, []);
  const validPreview = preview ? groupDraftSchema.safeParse(preview) : null;
  const outputErrors: Partial<Record<keyof GroupDraft, string>> = {};

  if (validPreview && !validPreview.success) {
    for (const issue of validPreview.error.issues) {
      const field = issue.path[0];
      if (
        preview &&
        (field === 'name' ||
          field === 'description' ||
          field === 'outcomes' ||
          field === 'prerequisites')
      ) {
        const key = field as keyof GroupDraft;
        outputErrors[key] ??=
          key === 'name'
            ? ar
              ? 'يجب أن يتراوح الاسم بين حرفين و120 حرفًا.'
              : 'Name must be between 2 and 120 characters.'
            : key === 'prerequisites'
              ? ar
                ? 'يجب ألا تتجاوز المتطلبات 1,500 حرف.'
                : 'Prerequisites must be 1,500 characters or fewer.'
              : ar
                ? 'يجب ألا يتجاوز هذا الحقل 2,000 حرف.'
                : 'This field must be 2,000 characters or fewer.';
      }
    }
  }

  const t = ar
    ? {
        title: 'مسودة قالب محلية',
        intro: 'أنشئ مسودة نصية لمجموعة وراجعها وعدّلها قبل الاستخدام.',
        disclosure:
          'خيار القالب المحلي يستخدم نصًا مُعدًا مسبقًا، ولا يستخدم الذكاء الاصطناعي. لن تُحفظ أي تغييرات حتى تحفظ نموذج المجموعة.',
        topic: 'موضوع المجموعة',
        topicExample: 'مثال: الكسور أو أساسيات البرمجة',
        level: 'المستوى',
        beginner: 'مبتدئ',
        intermediate: 'متوسط',
        advanced: 'متقدم',
        format: 'صيغة المجموعة المقترحة',
        online: 'عن بُعد',
        in_person: 'حضوري',
        hybrid: 'هجين',
        guidance: 'ملاحظات اختيارية للقالب',
        guidanceHint: 'لا تضف بيانات شخصية أو معلومات عن الطلاب.',
        create: 'إنشاء معاينة القالب',
        name: 'اسم المجموعة',
        description: 'الوصف',
        outcomes: 'ما الذي سيتعلمه الطلاب؟',
        prerequisites: 'ما المعرفة المطلوبة للانضمام؟',
        apply: 'تطبيق هذه الحقول الأربعة',
        replace:
          'سيؤدي التطبيق إلى استبدال قيم الاسم والوصف ومخرجات التعلم والمتطلبات الحالية. راجع المقترحات قبل استخدامها.',
        topicError: 'أدخل موضوعًا من حرفين إلى 120 حرفًا.',
        guidanceError: 'يجب ألا تتجاوز الملاحظات 500 حرف.',
        invalidPreview: 'صحح الحقول المميزة قبل التطبيق.',
        createError: 'تعذر إنشاء المعاينة. راجع المدخلات وحاول مرة أخرى.',
        created: 'تم إنشاء معاينة محلية. راجع الحقول الأربعة وعدّلها قبل التطبيق.',
        aiCreated:
          'أنشأ سندك هذه المسودة بالذكاء الاصطناعي. راجع الحقول الأربعة وعدّلها قبل التطبيق.',
        localPreviewTitle: 'راجع وعدّل المعاينة المحلية',
        aiPreviewTitle: 'راجع وعدّل مسودة سندك',
        applied: 'تم تطبيق النص على الحقول الأربعة. احفظ نموذج المجموعة عند الاستعداد.',
        count: (value: string, max: number) => `${value.length} / ${max}`,
        ai: 'إنشاء بمساعدة سندك',
        localOption: 'استخدام قالب محلي',
        notice:
          'تُرسل مدخلاتك إلى خدمة Gemini من Google لكتابة المسودة. من فضلك لا تضف معلومات شخصية أو خاصة عن الطلاب.',
        generate: 'إنشاء مسودة باستخدام سندك',
        unavailable: 'المساعدة المباشرة غير متاحة الآن. يمكنك استخدام القالب المحلي.',
        aiError: 'تعذر إنشاء المسودة. حاول مرة أخرى.',
        cancel: 'إلغاء الطلب',
      }
    : {
        title: 'Local group template',
        intro: 'Create a text draft for a group, then review and edit it before use.',
        disclosure:
          'The local template option uses authored text, not AI. Nothing is saved until you save the group form.',
        topic: 'Group topic',
        topicExample: 'For example: fractions or programming basics',
        level: 'Level',
        beginner: 'Beginner',
        intermediate: 'Intermediate',
        advanced: 'Advanced',
        format: 'Suggested group format',
        online: 'Online',
        in_person: 'In person',
        hybrid: 'Hybrid',
        guidance: 'Optional template guidance',
        guidanceHint: 'Do not include personal or student information.',
        create: 'Create template preview',
        name: 'Group name',
        description: 'Description',
        outcomes: 'What will students learn?',
        prerequisites: 'What should students know before joining?',
        apply: 'Apply these four fields',
        replace:
          'Applying will replace the current name, description, learning outcomes, and prerequisites. Review each suggestion before use.',
        topicError: 'Enter a topic from 2 to 120 characters.',
        guidanceError: 'Guidance must be 500 characters or fewer.',
        invalidPreview: 'Fix the highlighted fields before applying.',
        createError: 'The preview could not be created. Review the inputs and try again.',
        created: 'Local preview created. Review and edit all four fields before applying.',
        aiCreated:
          'SanDak generated this AI draft. Review and edit all four fields before applying.',
        localPreviewTitle: 'Review and edit the local preview',
        aiPreviewTitle: 'Review and edit SanDak’s AI draft',
        applied: 'Text applied to the four fields. Save the group form when ready.',
        count: (value: string, max: number) => `${value.length} / ${max}`,
        ai: 'Generate with SanDak',
        localOption: 'Use local template',
        notice:
          'Your inputs are sent to Google’s Gemini service to write the draft. Please do not include personal or private information about students.',
        generate: 'Generate draft with SanDak',
        unavailable: 'Live help is unavailable right now. You can use the local template.',
        aiError: 'The draft could not be generated. Please try again.',
        cancel: 'Cancel request',
      };

  async function openAi() {
    setAiMode(true);
    setAiError('');
    setAvailable(null);
    const controller = new AbortController();
    requestRef.current?.abort();
    requestRef.current = controller;
    try {
      const response = await fetch('/api/assistant', { signal: controller.signal });
      const result = response.ok ? await response.json() : null;
      if (aliveRef.current && !controller.signal.aborted) setAvailable(result?.available === true);
    } catch {
      if (aliveRef.current && !controller.signal.aborted) setAvailable(false);
    } finally {
      if (requestRef.current === controller) requestRef.current = null;
    }
  }

  async function generateWithSanad() {
    const result = groupDraftInputSchema.safeParse(input);
    if (!result.success) {
      const errors: typeof inputErrors = {};
      for (const issue of result.error.issues) {
        if (issue.path[0] === 'topic') errors.topic = t.topicError;
        if (issue.path[0] === 'guidance') errors.guidance = t.guidanceError;
      }
      setInputErrors(errors);
      return;
    }
    if (!available || loading) return;
    setLoading(true);
    setAiError('');
    emitSandakStatus('pending', 'draft');
    const controller = new AbortController();
    requestRef.current = controller;
    try {
      const response = await fetch('/api/assistant', {
        method: 'POST',
        signal: controller.signal,
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ mode: 'group_draft', ...result.data }),
      });
      const payload = await response.json();
      if (!response.ok || payload?.ok !== true || payload.mode !== 'group_draft')
        throw new Error('request_failed');
      const draft = groupDraftSchema.safeParse(payload.draft);
      if (!draft.success) throw new Error('invalid_draft');
      if (aliveRef.current && !controller.signal.aborted) {
        setPreview(draft.data);
        setPreviewSource('sanad');
        setPreviewMessage(t.aiCreated);
        setPreviewError('');
        // The draft now waits for the teacher to review and apply it.
        emitSandakStatus('needs_input', 'draft');
      }
    } catch {
      if (aliveRef.current && !controller.signal.aborted) {
        setAiError(t.aiError);
        emitSandakStatus('error', 'draft');
      } else if (aliveRef.current) emitSandakStatus('idle', 'draft');
    } finally {
      if (aliveRef.current) setLoading(false);
      if (requestRef.current === controller) requestRef.current = null;
    }
  }

  const retryRef = useRef<() => void>(() => {});
  useEffect(() => {
    retryRef.current = () => {
      if (aiError) void generateWithSanad();
    };
  });
  useEffect(() => {
    const retry = () => retryRef.current();
    window.addEventListener(SANDAK_RETRY_EVENT, retry);
    return () => window.removeEventListener(SANDAK_RETRY_EVENT, retry);
  }, []);
  const createPreview = () => {
    const result = groupDraftInputSchema.safeParse(input);
    if (!result.success) {
      const nextErrors: typeof inputErrors = {};
      for (const issue of result.error.issues) {
        const field = issue.path[0];
        if (field === 'topic') nextErrors.topic = t.topicError;
        if (field === 'guidance') nextErrors.guidance = t.guidanceError;
      }
      setInputErrors(nextErrors);
      setPreviewMessage('');
      setPreviewError('');
      return;
    }

    setInputErrors({});
    try {
      setPreview(buildPreviewDraft(result.data));
      setPreviewSource('local');
      setPreviewError('');
      setPreviewMessage(t.created);
    } catch {
      setPreviewError(t.createError);
      setPreviewMessage('');
    }
  };

  const changePreview = (field: keyof GroupDraft, value: string) => {
    setPreview(current => (current ? { ...current, [field]: value } : current));
    setPreviewMessage('');
  };

  const apply = () => {
    const result = groupDraftSchema.safeParse(preview);
    if (!result.success) {
      setPreviewMessage(t.invalidPreview);
      return;
    }
    onApply(result.data);
    setPreviewMessage(t.applied);
    emitSandakStatus('success', 'draft');
  };

  const inputClass = 'min-h-11 w-full min-w-0 rounded-xl border border-line bg-white p-3 text-sm';
  const outputField = (field: keyof GroupDraft, label: string, max: number, rows: number) => {
    const value = preview?.[field] ?? '';
    const error = outputErrors[field];
    const id = `group-template-${field}`;
    return (
      <label key={field} htmlFor={id} className="grid min-w-0 gap-2 text-sm font-bold">
        {label}
        <textarea
          id={id}
          dir="auto"
          value={value}
          onChange={event => changePreview(field, event.target.value)}
          maxLength={max}
          rows={rows}
          disabled={disabled || loading}
          aria-invalid={!!error}
          aria-describedby={error ? `${id}-error` : undefined}
          className={inputClass}
        />
        <span className="font-normal text-muted">{t.count(value, max)}</span>
        {error && (
          <span id={`${id}-error`} className="font-normal text-danger">
            {error}
          </span>
        )}
      </label>
    );
  };

  return (
    <section
      aria-labelledby="group-template-heading"
      className="grid min-w-0 gap-4 rounded-2xl border border-line bg-cream/70 p-4 sm:p-5"
      onChange={event => event.stopPropagation()}
    >
      <div className="grid gap-1">
        <h2 id="group-template-heading" className="text-lg font-black text-teal">
          {t.title}
        </h2>
        <p className="text-sm leading-6 text-muted">{t.intro}</p>
      </div>
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={openAi}
          disabled={disabled || loading}
          className="min-h-11 rounded-xl bg-teal px-4 py-2 font-bold text-white disabled:opacity-50"
        >
          {t.ai}
        </button>
        {aiMode && (
          <button
            type="button"
            onClick={() => {
              requestRef.current?.abort();
              setAiMode(false);
            }}
            className="min-h-11 rounded-xl border border-teal px-4 py-2 font-bold text-teal"
          >
            {t.localOption}
          </button>
        )}
      </div>
      {aiMode && (
        <div className="grid gap-3 rounded-xl border border-teal/20 bg-white p-4">
          {available !== true ? (
            <p role="status" className="text-sm leading-6 text-muted">
              {t.unavailable}
            </p>
          ) : (
            <>
              <p className="text-sm leading-6 text-ink/80" role="note">
                {t.notice}
              </p>
              <button
                type="button"
                onClick={generateWithSanad}
                disabled={disabled || loading}
                className="min-h-11 justify-self-start rounded-xl bg-teal px-4 py-2 font-bold text-white disabled:opacity-50"
              >
                {t.generate}
              </button>
              {loading && (
                <button
                  type="button"
                  onClick={() => requestRef.current?.abort()}
                  className="min-h-11 justify-self-start rounded-xl border px-4 py-2"
                >
                  {t.cancel}
                </button>
              )}
              {aiError && (
                <p role="alert" className="text-sm text-danger">
                  {aiError}
                </p>
              )}
            </>
          )}
        </div>
      )}
      <p className="rounded-xl border border-teal/20 bg-teal/5 p-3 text-sm font-bold leading-6 text-teal">
        {t.disclosure}
      </p>
      <div className="grid min-w-0 gap-4 sm:grid-cols-2">
        <label htmlFor="group-template-topic" className="grid min-w-0 gap-2 text-sm font-bold">
          {t.topic} <span className="font-normal text-muted">2–120</span>
          <input
            id="group-template-topic"
            type="text"
            dir="auto"
            value={input.topic}
            onChange={event => {
              setInput(current => ({ ...current, topic: event.target.value }));
              setInputErrors(current => ({ ...current, topic: undefined }));
            }}
            onKeyDown={event => {
              if (event.key === 'Enter') {
                event.preventDefault();
                createPreview();
              }
            }}
            maxLength={120}
            placeholder={t.topicExample}
            aria-invalid={!!inputErrors.topic}
            aria-describedby={inputErrors.topic ? 'group-template-topic-error' : undefined}
            disabled={disabled || loading}
            className={inputClass}
          />
          <span className="font-normal text-muted">{t.count(input.topic, 120)}</span>
          {inputErrors.topic && (
            <span id="group-template-topic-error" className="font-normal text-danger">
              {inputErrors.topic}
            </span>
          )}
        </label>
        <label htmlFor="group-template-level" className="grid min-w-0 gap-2 text-sm font-bold">
          {t.level}
          <select
            id="group-template-level"
            value={input.level}
            onChange={event =>
              setInput(current => ({
                ...current,
                level: event.target.value as GroupDraftInput['level'],
              }))
            }
            disabled={disabled || loading}
            className={inputClass}
          >
            <option value="beginner">{t.beginner}</option>
            <option value="intermediate">{t.intermediate}</option>
            <option value="advanced">{t.advanced}</option>
          </select>
        </label>
        <label htmlFor="group-template-format" className="grid min-w-0 gap-2 text-sm font-bold">
          {t.format}
          <select
            id="group-template-format"
            value={input.format}
            onChange={event =>
              setInput(current => ({
                ...current,
                format: event.target.value as GroupDraftInput['format'],
              }))
            }
            disabled={disabled || loading}
            className={inputClass}
          >
            <option value="online">{t.online}</option>
            <option value="in_person">{t.in_person}</option>
            <option value="hybrid">{t.hybrid}</option>
          </select>
        </label>
        <label htmlFor="group-template-guidance" className="grid min-w-0 gap-2 text-sm font-bold">
          {t.guidance} <span className="font-normal text-muted">0–500</span>
          <textarea
            id="group-template-guidance"
            dir="auto"
            value={input.guidance}
            onChange={event => {
              setInput(current => ({ ...current, guidance: event.target.value }));
              setInputErrors(current => ({ ...current, guidance: undefined }));
            }}
            maxLength={500}
            rows={2}
            aria-invalid={!!inputErrors.guidance}
            aria-describedby={inputErrors.guidance ? 'group-template-guidance-error' : undefined}
            disabled={disabled || loading}
            className={inputClass}
          />
          <span className="font-normal text-muted">{t.guidanceHint}</span>
          <span className="font-normal text-muted">{t.count(input.guidance, 500)}</span>
          {inputErrors.guidance && (
            <span id="group-template-guidance-error" className="font-normal text-danger">
              {inputErrors.guidance}
            </span>
          )}
        </label>
      </div>
      <button
        type="button"
        onClick={createPreview}
        disabled={disabled || loading}
        className="min-h-11 justify-self-start rounded-xl border border-teal px-4 py-2 font-bold text-teal disabled:cursor-not-allowed disabled:opacity-50"
      >
        {t.create}
      </button>
      {previewError && (
        <p role="alert" className="text-sm text-danger">
          {previewError}
        </p>
      )}
      {preview && (
        <div className="grid min-w-0 gap-4 border-t border-line pt-4">
          <div className="grid gap-1">
            <h3 className="font-black text-teal">
              {previewSource === 'sanad' ? t.aiPreviewTitle : t.localPreviewTitle}
            </h3>
            <p className="text-sm text-muted">
              {ar ? 'هذه مقترحات تحتاج إلى مراجعتك.' : 'These suggestions need your review.'}
            </p>
          </div>
          <div className="grid min-w-0 gap-4 sm:grid-cols-2">
            {outputField('name', t.name, 120, 2)}
            {outputField('description', t.description, 2000, 4)}
            {outputField('outcomes', t.outcomes, 2000, 3)}
            {outputField('prerequisites', t.prerequisites, 1500, 3)}
          </div>
          <p className="rounded-xl bg-amber-50 p-3 text-sm leading-6 text-amber-950">{t.replace}</p>
          {previewMessage && (
            <p role="status" aria-live="polite" className="text-sm text-teal">
              {previewMessage}
            </p>
          )}
          <button
            type="button"
            onClick={apply}
            disabled={disabled || loading || !validPreview?.success}
            className="min-h-11 justify-self-start rounded-xl bg-teal px-4 py-2 font-bold text-white disabled:cursor-not-allowed disabled:opacity-50"
          >
            {t.apply}
          </button>
        </div>
      )}
    </section>
  );
}
