'use client';

import { useActionState, useId, useState } from 'react';
import { Eye, EyeOff, GraduationCap, Presentation, ShieldCheck } from 'lucide-react';
import Link from 'next/link';
import { loginAction, signupAction } from '@/features/auth/actions';
import { authCopy, type AuthLocale } from './copy';
import { GoogleButton, googleEnabled } from './google-button';
import { Turnstile } from './turnstile';
import { TeacherSubscriptionNotice } from '@/features/teacher-access/subscription-notice';
import { TeacherRulesPanel } from '@/features/teacher/teacher-rules-panel';

type Props = {
  locale: AuthLocale;
  mode: 'login' | 'signup';
  labels: Record<string, string>;
  initialRole?: 'student' | 'teacher';
  returnPath?: string | null;
  googleRetryRole?: 'student' | 'teacher' | null;
};

export const inputClass =
  'mt-2 h-12 w-full rounded-xl border border-line-strong bg-white px-4 text-ink outline-hidden transition placeholder:text-muted focus:border-teal focus:ring-2 focus:ring-teal/15';

export function AuthForm({
  locale,
  mode,
  labels,
  initialRole = 'student',
  returnPath,
  googleRetryRole = null,
}: Props) {
  const copy = authCopy[locale];
  const action =
    mode === 'login' ? loginAction.bind(null, locale) : signupAction.bind(null, locale);
  const [state, formAction, pending] = useActionState(action, null);
  const [role, setRole] = useState<'student' | 'teacher'>(initialRole);
  const [passwordVisible, setPasswordVisible] = useState(false);
  const passwordHintId = useId();
  const errorId = useId();

  const showGoogle = googleEnabled;

  return (
    <>
      <form
        action={formAction}
        className="space-y-5"
        aria-describedby={state?.error ? errorId : undefined}
      >
        {mode === 'login' && returnPath && <input type="hidden" name="next" value={returnPath} />}
        {mode === 'signup' && (
          <fieldset className="min-w-0">
            <legend className="mb-3 font-bold text-ink">{copy.joinAs}</legend>
            <div className="grid grid-cols-2 gap-3">
              <RoleCard
                checked={role === 'student'}
                description={copy.studentBody}
                icon={GraduationCap}
                onChange={() => setRole('student')}
                title={copy.studentTitle}
                value="student"
              />
              <RoleCard
                checked={role === 'teacher'}
                description={copy.teacherBody}
                icon={Presentation}
                onChange={() => setRole('teacher')}
                title={copy.teacherTitle}
                value="teacher"
              />
            </div>
            <p
              className="mt-3 rounded-xl bg-cream px-4 py-3 text-sm leading-6 text-ink-soft"
              role="note"
            >
              {role === 'student' ? copy.studentNext : copy.teacherNext}
            </p>
          </fieldset>
        )}

        {mode === 'signup' && role === 'teacher' && <TeacherRulesPanel locale={locale} />}

        {mode === 'signup' && (
          <label className="block text-sm font-bold text-ink">
            {labels.fullName}
            <input
              className={inputClass}
              name="fullName"
              defaultValue={state?.fullName}
              required
              minLength={2}
              maxLength={100}
              autoComplete="name"
            />
          </label>
        )}

        <label className="block text-sm font-bold text-ink">
          {labels.email}
          <input
            className={inputClass}
            name="email"
            type="email"
            dir="ltr"
            defaultValue={state?.email}
            required
            autoComplete="email"
            inputMode="email"
          />
        </label>

        <label className="block text-sm font-bold text-ink">
          {labels.password}
          <span className="mt-2 flex h-12 overflow-hidden rounded-xl border border-line-strong bg-white transition focus-within:border-teal focus-within:ring-2 focus-within:ring-teal/15">
            <input
              className="min-w-0 flex-1 bg-transparent px-4 outline-hidden"
              name="password"
              type={passwordVisible ? 'text' : 'password'}
              dir="ltr"
              required
              minLength={mode === 'signup' ? 8 : 1}
              maxLength={mode === 'signup' ? 72 : 256}
              autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
              aria-describedby={mode === 'signup' ? passwordHintId : undefined}
            />
            <button
              className="grid min-w-12 place-items-center border-s border-line bg-cream px-3 text-teal transition hover:bg-[#efe6d5]"
              type="button"
              onClick={() => setPasswordVisible(value => !value)}
              aria-label={passwordVisible ? copy.hidePassword : copy.showPassword}
              aria-pressed={passwordVisible}
            >
              {passwordVisible ? <EyeOff size={18} /> : <Eye size={18} />}
            </button>
          </span>
          {mode === 'signup' && (
            <span id={passwordHintId} className="mt-2 block text-xs font-normal text-muted">
              {copy.passwordHint}
            </span>
          )}
        </label>

        {mode === 'login' && (
          <p className="-mt-2 text-sm">
            <Link className="font-bold text-teal" href={`/${locale}/forgot-password`}>
              {copy.forgotLink}
            </Link>
          </p>
        )}

        {mode === 'signup' && role === 'teacher' && (
          <>
            <TeacherSubscriptionNotice locale={locale} />
            <div
              className="flex gap-3 rounded-xl bg-[#e0eeec] p-4 text-sm leading-6 text-[#0e3b3c]"
              role="note"
            >
              <ShieldCheck className="mt-0.5 flex-none" size={19} />
              <span>{copy.approval}</span>
            </div>
          </>
        )}

        <Turnstile locale={locale} resetSignal={state} />

        {state?.error && (
          <p
            id={errorId}
            role="alert"
            className="rounded-xl bg-[#f3e1db] p-3 text-sm text-[#6e2414]"
          >
            {state.error}
            {state.resendHref && (
              <>
                {' '}
                <Link className="font-bold underline" href={state.resendHref}>
                  {copy.resend}
                </Link>
              </>
            )}
          </p>
        )}

        <button
          className="h-[52px] w-full rounded-[.9rem] bg-orange px-5 text-base font-bold text-white transition hover:bg-orange-deep disabled:cursor-wait disabled:opacity-60"
          disabled={pending}
          type="submit"
        >
          {pending
            ? mode === 'login'
              ? copy.signingIn
              : copy.creating
            : mode === 'login'
              ? copy.signIn
              : copy.create}
        </button>
      </form>
      {showGoogle && (
        <div className="mt-5 space-y-5">
          <div
            className="flex items-center gap-3 text-xs font-bold uppercase tracking-[.14em] text-muted"
            aria-hidden="true"
          >
            <span className="h-px flex-1 bg-line" />
            {copy.orDivider}
            <span className="h-px flex-1 bg-line" />
          </div>
          <GoogleButton
            locale={locale}
            next={mode === 'login' ? returnPath : null}
            signupRole={mode === 'signup' ? role : googleRetryRole}
          />
        </div>
      )}
    </>
  );
}

function RoleCard({
  checked,
  description,
  icon: Icon,
  onChange,
  title,
  value,
}: {
  checked: boolean;
  description: string;
  icon: typeof GraduationCap;
  onChange: () => void;
  title: string;
  value: 'student' | 'teacher';
}) {
  return (
    <label
      className={`relative cursor-pointer rounded-[.9rem] border-2 p-4 transition ${checked ? 'border-teal bg-[#e0eeec]' : 'border-line-strong bg-white hover:border-[#9eb7b4]'}`}
    >
      <input
        className="sr-only"
        type="radio"
        name="role"
        value={value}
        checked={checked}
        onChange={onChange}
      />
      <span className="mb-4 flex items-center justify-between gap-2">
        <span
          className={`grid size-9 place-items-center rounded-xl ${checked ? 'bg-teal text-white' : 'bg-cream text-teal'}`}
        >
          <Icon size={18} />
        </span>
        <span
          className={`size-4 rounded-full border-2 border-teal ${checked ? 'bg-teal shadow-[inset_0_0_0_3px_#e0eeec]' : 'bg-white'}`}
        />
      </span>
      <strong className="block text-start text-base text-teal">{title}</strong>
      <span className="mt-1 block text-start text-xs font-normal leading-5 text-ink-soft">
        {description}
      </span>
    </label>
  );
}
