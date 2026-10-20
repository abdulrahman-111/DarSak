'use client';
import { useActionState, useState } from 'react';
import { useUnsavedProfileSection } from './unsaved-profile-protection';
import { saveGroupLearning } from './group-learning-actions';
import type { GroupLearningDetails } from './group-learning-domain';
export function GroupLearningForm({
  locale,
  groupId,
  details,
}: {
  locale: string;
  groupId: string;
  details: GroupLearningDetails | null;
}) {
  const ar = locale === 'ar';
  const [state, action, pending] = useActionState(
    saveGroupLearning.bind(null, locale, groupId),
    null,
  );
  const [revision, setRevision] = useState(0);
  useUnsavedProfileSection('group-learning', revision !== (state?.savedRevision ?? 0));
  const fields = [
    {
      name: 'outcomes',
      label: ar ? 'ما الذي سيتعلمه الطلاب؟' : 'What will students learn?',
      max: 2000,
      example: ar
        ? 'مثال: بناء برامج بسيطة وفهم الدوال وحل المشكلات.'
        : 'Example: Build simple programs, understand functions, and solve problems.',
    },
    {
      name: 'prerequisites',
      label: ar ? 'ما المعرفة المطلوبة للانضمام؟' : 'What should students know before joining?',
      max: 1500,
      example: ar
        ? 'مثال: لا يلزم خبرة سابقة، أو أساسيات البرمجة.'
        : 'Example: No prior experience, or basic programming knowledge.',
    },
    {
      name: 'fee_includes',
      label: ar ? 'ما الذي تتضمنه المجموعة؟' : 'What is included?',
      max: 1000,
      example: ar
        ? 'مثال: الحصص، أوراق تدريب ومراجعة الحلول.'
        : 'Example: Lessons, practice sheets, and feedback on exercises.',
    },
  ] as const;
  return (
    <form
      action={action}
      onReset={event => event.preventDefault()}
      onChange={() => setRevision(n => n + 1)}
      className="mt-5 grid gap-4"
    >
      <input type="hidden" name="draft_revision" value={revision} />
      <input
        type="hidden"
        name="expected_updated_at"
        value={state?.version ?? details?.updated_at ?? ''}
      />
      <p className="text-sm text-muted">
        {ar
          ? 'هذه التفاصيل اختيارية وتظهر للطلاب. تُحفظ بشكل منفصل عن اسم المجموعة وجدولها.'
          : 'These optional details help students choose. Save them separately from the group name and schedule.'}
      </p>
      {fields.map(f => (
        <label key={f.name} className="grid gap-2 text-sm font-bold">
          {f.label}
          <textarea
            name={f.name}
            defaultValue={details?.[f.name] ?? ''}
            rows={3}
            maxLength={f.max}
            placeholder={f.example}
            className="w-full rounded-xl border border-line bg-cream p-3"
          />
          <span className="font-normal text-muted">
            {ar ? `بحد أقصى ${f.max} حرف` : `Up to ${f.max.toLocaleString()} characters`}
          </span>
        </label>
      ))}
      <label className="grid gap-2 text-sm font-bold">
        {ar ? 'طريقة التعلم' : 'Learning format'}
        <select
          name="delivery_mode"
          defaultValue={details?.delivery_mode ?? ''}
          className="rounded-xl border border-line bg-cream p-3"
        >
          <option value="">{ar ? 'غير محددة' : 'Not specified'}</option>
          <option value="online">{ar ? 'عن بُعد' : 'Online'}</option>
          <option value="in_person">{ar ? 'حضوري' : 'In person'}</option>
          <option value="hybrid">{ar ? 'حضوري وعن بُعد' : 'Hybrid'}</option>
        </select>
      </label>
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="grid gap-2 text-sm font-bold">
          {ar ? 'رسوم المجموعة بالجنيه المصري (اختياري)' : 'Group fee in EGP (optional)'}
          <input
            type="number"
            name="fee_egp"
            min="0"
            max="100000"
            step="0.01"
            defaultValue={details?.fee_egp ?? ''}
            className="rounded-xl border border-line bg-cream p-3"
          />
        </label>
        <label className="grid gap-2 text-sm font-bold">
          {ar ? 'وحدة الرسوم' : 'Fee unit'}
          <select
            name="fee_basis"
            defaultValue={details?.fee_basis ?? ''}
            className="rounded-xl border border-line bg-cream p-3"
          >
            <option value="">{ar ? 'غير محددة' : 'Not specified'}</option>
            {(['lesson', 'month', 'semester', 'course'] as const).map((x, i) => (
              <option key={x} value={x}>
                {
                  (ar
                    ? ['لكل حصة', 'شهريًا', 'لكل فصل دراسي', 'لكل دورة']
                    : ['Per lesson', 'Per month', 'Per semester', 'Per course'])[i]
                }
              </option>
            ))}
          </select>
        </label>
      </div>
      <button
        disabled={pending}
        className="min-h-11 justify-self-start rounded-xl bg-teal px-5 py-3 font-bold text-white disabled:opacity-50"
      >
        {pending
          ? ar
            ? 'جارٍ الحفظ…'
            : 'Saving…'
          : ar
            ? 'حفظ تفاصيل التعلم'
            : 'Save learning details'}
      </button>
      {state?.error && (
        <p role="alert" className="text-sm text-danger">
          {state.error}
        </p>
      )}
      {state?.success && (
        <p role="status" className="text-sm text-teal">
          {state.success}
        </p>
      )}
    </form>
  );
}
