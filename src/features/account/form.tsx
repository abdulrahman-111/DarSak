'use client';
import { useActionState } from 'react';
import { deleteAccount, retryAccountDeletion, startGoogleDeletion } from './actions';
import { Turnstile } from '@/components/auth/turnstile';
const input = 'mt-2 w-full rounded-2xl border border-line bg-cream px-4 py-3 outline-none ring-orange focus:ring-2';
export function AccountDeletionForm({ locale, text, googleReady }: { locale: string; text: Record<string, string>; googleReady: boolean }) {
  const [state, action, pending] = useActionState(deleteAccount.bind(null, locale), null);
  return <div className="mt-8 space-y-6 rounded-3xl border border-red-200 bg-red-50 p-6">
    {state?.state === 'pending' ? <>
      <p role="status" className="rounded-xl bg-white p-3 text-sm text-red-800">{text.pending}</p>
      <AccountDeletionRetry locale={locale} text={text}/>
    </> : <>
      {googleReady && <form action={action} className="space-y-4">
        <p className="font-bold text-red-900">{text.googleReady}</p>
        <label className="flex items-start gap-3 text-sm text-red-950"><input className="mt-1 size-4" type="checkbox" name="acknowledged" required/><span>{text.acknowledge}</span></label>
        <label className="block text-sm font-bold text-red-950">{text.typeDelete}<input className={input} name="confirmation" autoComplete="off" required pattern="DELETE"/></label>
        <button disabled={pending} className="rounded-2xl bg-red-700 px-5 py-3 font-bold text-white disabled:opacity-50">{pending ? text.working : text.delete}</button>
        {state?.error && <p role="alert" className="rounded-xl bg-white p-3 text-sm text-red-800">{state.error}</p>}
      </form>}
      <form action={action} className="space-y-4">
        <label className="block text-sm font-bold text-red-950">{text.password}<input className={input} type="password" name="password" autoComplete="current-password" required/></label>
        <label className="flex items-start gap-3 text-sm text-red-950"><input className="mt-1 size-4" type="checkbox" name="acknowledged" required/><span>{text.acknowledge}</span></label>
        <label className="block text-sm font-bold text-red-950">{text.typeDelete}<input className={input} name="confirmation" autoComplete="off" required pattern="DELETE"/></label>
        <Turnstile locale={locale === 'ar' ? 'ar' : 'en'} resetSignal={state}/>
        <button disabled={pending} className="rounded-2xl bg-red-700 px-5 py-3 font-bold text-white disabled:opacity-50">{pending ? text.working : text.delete}</button>
        {state?.error && <p role="alert" className="rounded-xl bg-white p-3 text-sm text-red-800">{state.error}</p>}
      </form>
      <form action={startGoogleDeletion.bind(null, locale)}><button className="rounded-2xl border border-red-300 bg-white px-5 py-3 font-bold text-red-900">{googleReady ? text.verifyGoogleAgain : text.verifyGoogle}</button></form>
    </>}
  </div>;
}

export function AccountDeletionRetry({ locale, text }: { locale: string; text: Record<string, string> }) {
  const [state, action, pending] = useActionState(async () => retryAccountDeletion(locale), null);
  return <form action={action} className="mt-6"><button disabled={pending} className="rounded-2xl bg-teal px-5 py-3 font-bold text-white disabled:opacity-50">{pending ? text.working : text.retry}</button>{state?.state === 'pending' && <p role="status" className="mt-3 text-sm text-amber-900">{text.pending}</p>}{state?.error && <p role="alert" className="mt-3 text-red-700">{state.error}</p>}</form>;
}
