'use client';

import { useActionState, useId } from 'react';
import { googleSignInAction } from '@/features/auth/actions';
import { authCopy, type AuthLocale } from './copy';

export const googleEnabled = process.env.NEXT_PUBLIC_AUTH_GOOGLE_ENABLED === 'true';

/** "Continue with Google" form; renders nothing unless NEXT_PUBLIC_AUTH_GOOGLE_ENABLED is 'true'. */
export function GoogleButton({ locale, next, signupRole }: { locale: AuthLocale; next?: string | null; signupRole?: 'student' | 'teacher' | null }) {
  const copy = authCopy[locale];
  const [state, formAction, pending] = useActionState(googleSignInAction.bind(null, locale), null);
  const errorId = useId();
  if (!googleEnabled) return null;

  return (
    <form action={formAction} className="space-y-3" aria-describedby={state?.error ? errorId : undefined}>
      {next && <input type="hidden" name="next" value={next}/>}
      {signupRole && <input type="hidden" name="google_role" value={signupRole}/>}
      <button
        className="flex h-[52px] w-full items-center justify-center gap-3 rounded-[.9rem] border border-[#d8ccb8] bg-white px-5 text-base font-bold text-ink transition hover:bg-[#f6f0e4] disabled:cursor-wait disabled:opacity-60"
        disabled={pending}
        type="submit"
      >
        <svg aria-hidden="true" viewBox="0 0 48 48" className="size-5 flex-none">
          <path fill="#EA4335" d="M24 9.5c3.5 0 6.6 1.2 9.1 3.6l6.8-6.8C35.8 2.4 30.3 0 24 0 14.6 0 6.5 5.4 2.6 13.2l7.9 6.1C12.4 13.6 17.7 9.5 24 9.5z"/>
          <path fill="#4285F4" d="M46.5 24.5c0-1.6-.1-3.1-.4-4.5H24v9h12.7c-.6 3-2.3 5.5-4.8 7.2l7.5 5.8c4.4-4.1 7.1-10.1 7.1-17.5z"/>
          <path fill="#FBBC05" d="M10.5 28.7a14.5 14.5 0 0 1 0-9.4l-7.9-6.1a24 24 0 0 0 0 21.6l7.9-6.1z"/>
          <path fill="#34A853" d="M24 48c6.5 0 11.9-2.1 15.9-5.8l-7.5-5.8c-2.1 1.4-4.8 2.3-8.4 2.3-6.3 0-11.6-4.1-13.5-9.8l-7.9 6.1C6.5 42.6 14.6 48 24 48z"/>
        </svg>
        {copy.googleContinue}
      </button>
      {state?.error && <p id={errorId} role="alert" className="rounded-xl bg-[#f3e1db] p-3 text-sm text-[#6e2414]">{state.error}</p>}
    </form>
  );
}
