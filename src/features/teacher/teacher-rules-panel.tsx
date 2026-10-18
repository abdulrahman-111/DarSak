'use client';

import type { Locale } from '@/features/student/domain';
import { TEACHER_RULES_TEXT } from './teacher-rules';

type Props = {
  locale: Locale;
  accepted?: boolean;
  onAcceptedChange?: (accepted: boolean) => void;
  showAcceptance?: boolean;
  disabled?: boolean;
  error?: boolean;
};

/** Shared, complete teacher policy with an optional separate acceptance control. */
export function TeacherRulesPanel({ locale, accepted = false, onAcceptedChange, showAcceptance = false, disabled = false, error = false }: Props) {
  const ar = locale === 'ar';
  const text = TEACHER_RULES_TEXT[ar ? 'ar' : 'en'];

  return <section dir={ar ? 'rtl' : 'ltr'} aria-labelledby="teacher-rules-title" className="grid gap-3 rounded-2xl border border-teal/20 bg-teal/5 p-4 text-sm leading-6 text-ink">
    <div>
      <h2 id="teacher-rules-title" className="font-black text-teal">{text.title}</h2>
      <p className="mt-1 text-muted">{text.intro}</p>
    </div>
    <ul className="list-disc space-y-2 ps-5">
      {text.rules.map(rule => <li key={rule}>{rule}</li>)}
    </ul>
    {showAcceptance && <div>
      <label className="flex items-start gap-3 rounded-xl bg-white p-3">
        <input name="teacher_rules" type="checkbox" value="on" checked={accepted} disabled={disabled} onChange={event => onAcceptedChange?.(event.currentTarget.checked)} className="mt-1 size-5 flex-none accent-teal" />
        <span>{text.acceptance}</span>
      </label>
      {error && <p role="alert" className="mt-2 text-sm font-bold text-red-800">{text.required}</p>}
    </div>}
  </section>;
}
