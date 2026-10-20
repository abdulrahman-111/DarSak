'use client';

import type { Locale } from '@/features/student/domain';
import { TEACHER_RULES_TEXT } from './teacher-rules';
import { BadgeCheck, ChevronDown, Handshake, LockKeyhole } from 'lucide-react';

const themeIcons = [BadgeCheck, LockKeyhole, Handshake];

type Props = {
  locale: Locale;
  accepted?: boolean;
  onAcceptedChange?: (accepted: boolean) => void;
  showAcceptance?: boolean;
  disabled?: boolean;
  error?: boolean;
};

/** Shared, complete teacher policy with an optional separate acceptance control. */
export function TeacherRulesPanel({
  locale,
  accepted = false,
  onAcceptedChange,
  showAcceptance = false,
  disabled = false,
  error = false,
}: Props) {
  const ar = locale === 'ar';
  const text = TEACHER_RULES_TEXT[ar ? 'ar' : 'en'];

  return (
    <section
      dir={ar ? 'rtl' : 'ltr'}
      aria-labelledby="teacher-rules-title"
      className="grid min-w-0 gap-3 rounded-2xl border border-teal/20 bg-teal/5 p-3 text-sm leading-6 text-ink sm:p-4"
    >
      <div>
        <h2 id="teacher-rules-title" className="font-black text-teal">
          {text.title}
        </h2>
        <p className="mt-1 break-words text-muted [overflow-wrap:anywhere]">{text.intro}</p>
      </div>
      <ul className="grid min-w-0 gap-2 sm:grid-cols-3">
        {text.themes.map((theme, index) => {
          const Icon = themeIcons[index];
          return (
            <li
              key={theme}
              className="flex min-w-0 items-start gap-2 rounded-xl border border-teal/10 bg-white p-3 text-sm font-semibold leading-5 text-teal"
            >
              <Icon size={18} aria-hidden="true" className="mt-0.5 shrink-0" />
              <span className="min-w-0 break-words [overflow-wrap:anywhere]">{theme}</span>
            </li>
          );
        })}
      </ul>
      <details className="group min-w-0 rounded-xl border border-teal/15 bg-white px-3">
        <summary className="flex min-h-11 list-none cursor-pointer items-center justify-between gap-3 font-bold text-teal focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange [&::-webkit-details-marker]:hidden">
          <span>{text.fullRules}</span>
          <ChevronDown
            size={18}
            aria-hidden="true"
            className="shrink-0 transition-transform motion-reduce:transition-none group-open:rotate-180"
          />
        </summary>
        <ul className="list-disc space-y-2 pb-3 ps-5">
          {text.rules.map(rule => (
            <li key={rule} className="break-words [overflow-wrap:anywhere]">
              {rule}
            </li>
          ))}
        </ul>
      </details>
      {showAcceptance && (
        <div>
          <label className="flex items-start gap-3 rounded-xl bg-white p-3">
            <input
              name="teacher_rules"
              type="checkbox"
              value="on"
              checked={accepted}
              disabled={disabled}
              onChange={event => onAcceptedChange?.(event.currentTarget.checked)}
              className="mt-1 size-5 flex-none accent-teal"
            />
            <span>{text.acceptance}</span>
          </label>
          {error && (
            <p role="alert" className="mt-2 text-sm font-bold text-red-800">
              {text.required}
            </p>
          )}
        </div>
      )}
    </section>
  );
}
