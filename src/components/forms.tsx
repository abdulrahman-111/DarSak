'use client';
import { useActionState } from 'react';
import { loginAction, signupAction } from '@/features/auth/actions';
import { updateProfile, submitReport, requestEnrollment } from '@/features/platform/actions';
const input =
  'mt-2 w-full rounded-2xl border border-line bg-cream px-4 py-3 outline-hidden ring-orange focus:ring-2';
function Feedback({ state }: { state: any }) {
  return state?.error ? (
    <p role="alert" className="mt-3 rounded-xl bg-danger-soft p-3 text-sm text-danger">
      {state.error}
    </p>
  ) : null;
}
export function AuthForm({
  locale,
  mode,
  t,
}: {
  locale: string;
  mode: 'login' | 'signup';
  t: Record<string, string>;
}) {
  const action =
    mode === 'login' ? loginAction.bind(null, locale) : signupAction.bind(null, locale);
  const [state, formAction, pending] = useActionState(action, null);
  return (
    <form action={formAction} className="space-y-4">
      {mode === 'signup' && (
        <>
          <label>
            {t.fullName}
            <input className={input} name="fullName" required minLength={2} />
          </label>
          <label>
            {t.role}
            <select className={input} name="role" defaultValue="student">
              <option value="student">{t.studentRole}</option>
              <option value="teacher">{t.teacherRole}</option>
            </select>
          </label>
        </>
      )}
      <label>
        {t.email}
        <input className={input} name="email" type="email" required autoComplete="email" />
      </label>
      <label>
        {t.password}
        <input
          className={input}
          name="password"
          type="password"
          required
          minLength={8}
          autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
        />
      </label>
      <button
        disabled={pending}
        className="w-full rounded-2xl bg-teal px-4 py-3 font-bold text-white disabled:opacity-50"
      >
        {pending ? t.loading : mode === 'login' ? t.login : t.register}
      </button>
      <Feedback state={state} />
    </form>
  );
}
export function ProfileForm({
  locale,
  t,
  profile,
}: {
  locale: string;
  t: Record<string, string>;
  profile: any;
}) {
  const [state, action, pending] = useActionState(updateProfile.bind(null, locale), null);
  return (
    <form action={action} className="space-y-4">
      <label>
        {t.fullName}
        <input className={input} name="fullName" defaultValue={profile?.full_name || ''} />
      </label>
      <label>
        Language
        <select
          className={input}
          name="preferredLanguage"
          defaultValue={profile?.preferred_language || locale}
        >
          <option value="ar">العربية</option>
          <option value="en">English</option>
        </select>
      </label>
      <button
        disabled={pending}
        className="rounded-2xl bg-orange px-5 py-3 font-bold text-white hover:bg-orange-deep"
      >
        {t.save}
      </button>
      <Feedback state={state} />
    </form>
  );
}
export function ReportForm({ locale, t }: { locale: string; t: Record<string, string> }) {
  const [state, action, pending] = useActionState(submitReport.bind(null, locale), null);
  return (
    <form action={action} className="space-y-4">
      <label>
        {t.subject}
        <input className={input} name="subject" required />
      </label>
      <label>
        {t.description}
        <textarea className={input} name="description" rows={5} required minLength={10} />
      </label>
      <button disabled={pending} className="rounded-2xl bg-teal px-5 py-3 font-bold text-white">
        {t.submit}
      </button>
      <Feedback state={state} />
    </form>
  );
}
export function JoinButton({
  locale,
  t,
  groupId,
}: {
  locale: string;
  t: Record<string, string>;
  groupId: string;
}) {
  const [state, action, pending] = useActionState(
    requestEnrollment.bind(null, locale, groupId),
    null,
  );
  return (
    <form action={action}>
      <button
        disabled={pending}
        className="rounded-2xl bg-orange px-5 py-3 font-bold text-white hover:bg-orange-deep"
      >
        {pending ? t.loading : t.apply}
      </button>
      {state?.error && <p className="mt-2 text-sm text-danger">{state.error}</p>}
    </form>
  );
}
