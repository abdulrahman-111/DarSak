'use client';

import { useActionState, useId, useState } from 'react';
import { Eye, EyeOff } from 'lucide-react';
import { forgotPasswordAction, resendConfirmationAction, resetPasswordAction } from '@/features/auth/actions';
import { inputClass } from './auth-form';
import { authCopy, type AuthLocale } from './copy';
import { Turnstile } from './turnstile';

const submitClass = 'h-[52px] w-full rounded-[.9rem] bg-orange px-5 text-base font-bold text-white transition hover:bg-[#c4561a] disabled:cursor-wait disabled:opacity-60';

function Feedback({ state, id }: { state: { error?: string; notice?: string } | null; id: string }) {
  if (state?.error) return <p id={id} role="alert" className="rounded-xl bg-[#f3e1db] p-3 text-sm text-[#6e2414]">{state.error}</p>;
  if (state?.notice) return <p id={id} role="status" className="rounded-xl bg-[#e0eeec] p-3 text-sm leading-6 text-[#0e3b3c]">{state.notice}</p>;
  return null;
}

function EmailForm({ locale, action, emailLabel, submit, pendingLabel, defaultEmail }: {
  locale: AuthLocale;
  action: typeof forgotPasswordAction;
  emailLabel: string;
  submit: string;
  pendingLabel: string;
  defaultEmail?: string;
}) {
  const [state, formAction, pending] = useActionState(action.bind(null, locale), null);
  const feedbackId = useId();
  return (
    <form action={formAction} className="space-y-5" aria-describedby={state ? feedbackId : undefined}>
      <label className="block text-sm font-bold text-ink">
        {emailLabel}
        <input className={inputClass} name="email" type="email" dir="ltr" required maxLength={254} autoComplete="email" inputMode="email" defaultValue={defaultEmail}/>
      </label>
      <Turnstile locale={locale} resetSignal={state}/>
      <Feedback state={state} id={feedbackId}/>
      <button className={submitClass} disabled={pending} type="submit">{pending ? pendingLabel : submit}</button>
    </form>
  );
}

export function ForgotPasswordForm({ locale, emailLabel }: { locale: AuthLocale; emailLabel: string }) {
  const copy = authCopy[locale];
  return <EmailForm locale={locale} action={forgotPasswordAction} emailLabel={emailLabel} submit={copy.sendLink} pendingLabel={copy.sending}/>;
}

export function ResendConfirmationForm({ locale, emailLabel, email }: { locale: AuthLocale; emailLabel: string; email?: string }) {
  const copy = authCopy[locale];
  return <EmailForm locale={locale} action={resendConfirmationAction} emailLabel={emailLabel} submit={copy.resend} pendingLabel={copy.resending} defaultEmail={email}/>;
}

export function ResetPasswordForm({ locale }: { locale: AuthLocale }) {
  const copy = authCopy[locale];
  const [state, formAction, pending] = useActionState(resetPasswordAction.bind(null, locale), null);
  const [visible, setVisible] = useState(false);
  const hintId = useId();
  const feedbackId = useId();
  const field = (name: string, label: string, autoComplete: string, describedBy?: string) => (
    <label className="block text-sm font-bold text-ink">
      {label}
      <input
        className={inputClass}
        name={name}
        type={visible ? 'text' : 'password'}
        dir="ltr"
        required
        minLength={8}
        maxLength={72}
        autoComplete={autoComplete}
        aria-describedby={describedBy}
      />
    </label>
  );

  return (
    <form action={formAction} className="space-y-5" aria-describedby={state ? feedbackId : undefined}>
      {field('password', copy.newPassword, 'new-password', hintId)}
      <p id={hintId} className="-mt-3 text-xs text-muted">{copy.passwordHint}</p>
      {field('confirmPassword', copy.confirmPassword, 'new-password')}
      <button
        className="flex items-center gap-2 text-sm font-bold text-teal"
        type="button"
        onClick={() => setVisible(value => !value)}
        aria-pressed={visible}
      >
        {visible ? <EyeOff size={18}/> : <Eye size={18}/>}
        {visible ? copy.hidePassword : copy.showPassword}
      </button>
      <Feedback state={state} id={feedbackId}/>
      <button className={submitClass} disabled={pending} type="submit">{pending ? copy.updating : copy.updatePassword}</button>
    </form>
  );
}
