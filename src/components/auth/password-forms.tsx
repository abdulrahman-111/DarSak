'use client';

import { useActionState, useEffect, useId, useState } from 'react';
import { Eye, EyeOff } from 'lucide-react';
import { changePasswordAction, forgotPasswordAction, resendConfirmationAction, resetPasswordAction, verifySignupCodeAction } from '@/features/auth/actions';
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
  const [cooldown, setCooldown] = useState(0);
  useEffect(() => {
    if (!state?.notice || action !== resendConfirmationAction) return;
    const timer = window.setTimeout(() => setCooldown(60), 0);
    return () => window.clearTimeout(timer);
  }, [state, action]);
  useEffect(() => {
    if (cooldown <= 0) return;
    const timer = window.setTimeout(() => setCooldown(value => Math.max(0, value - 1)), 1000);
    return () => window.clearTimeout(timer);
  }, [cooldown]);
  return (
    <form action={formAction} className="space-y-5" aria-describedby={state ? feedbackId : undefined}>
      {defaultEmail
        ? <input type="hidden" name="email" value={state?.email ?? defaultEmail}/>
        : <label className="block text-sm font-bold text-ink">{emailLabel}<input className={inputClass} name="email" type="email" dir="ltr" required maxLength={254} autoComplete="email" inputMode="email" defaultValue={state?.email}/></label>}
      <Turnstile locale={locale} resetSignal={state}/>
      <Feedback state={state} id={feedbackId}/>
      <button className={submitClass} disabled={pending || cooldown > 0} type="submit">{pending ? pendingLabel : cooldown > 0 ? `${submit} (${cooldown})` : submit}</button>
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

export function VerifySignupCodeForm({ locale, emailLabel, email }: { locale: AuthLocale; emailLabel: string; email?: string }) {
  const copy = authCopy[locale];
  const [state, formAction, pending] = useActionState(verifySignupCodeAction.bind(null, locale), null);
  const feedbackId = useId();
  return <form action={formAction} className="space-y-5" aria-describedby={state ? feedbackId : undefined}>
    {email ? <input type="hidden" name="email" value={email}/> : <label className="block text-sm font-bold text-ink">{emailLabel}<input className={inputClass} name="email" type="email" dir="ltr" required maxLength={254} autoComplete="email" inputMode="email" defaultValue={state?.email}/></label>}
    <label className="block text-sm font-bold text-ink">{copy.codeLabel}<input className={inputClass} name="token" type="text" dir="ltr" required minLength={6} maxLength={10} pattern="[0-9]{6,10}" inputMode="numeric" autoComplete="one-time-code"/></label>
    <Feedback state={state} id={feedbackId}/>
    <button className={submitClass} disabled={pending} type="submit">{pending ? copy.verifyingCode : copy.verifyCode}</button>
  </form>;
}

export function ResetPasswordForm({ locale, requireCurrentPassword = false }: { locale: AuthLocale; requireCurrentPassword?: boolean }) {
  const copy = authCopy[locale];
  const action = requireCurrentPassword ? changePasswordAction : resetPasswordAction;
  const [state, formAction, pending] = useActionState(action.bind(null, locale), null);
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
      {requireCurrentPassword && field('currentPassword', copy.currentPassword, 'current-password')}
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
