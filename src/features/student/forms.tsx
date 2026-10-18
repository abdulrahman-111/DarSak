'use client';
import { useActionState, useState } from 'react';
import { enrollmentAction,downloadMaterial } from './actions';
import { leaveStudentClass } from './class-workspace-actions';
import { copy } from './copy';
import type { Locale } from './domain';
export function EnrollmentForm({locale,id,kind,returnToClasses=false}:{locale:Locale;id:string;kind:'request'|'cancel';returnToClasses?:boolean}){
 const t=copy(locale),[state,action,pending]=useActionState(kind==='cancel'&&returnToClasses?leaveStudentClass.bind(null,locale,id):enrollmentAction.bind(null,locale,kind,id),null),[confirming,setConfirming]=useState(false);
 return <form action={action} className="space-y-3">
  {kind==='request'?<button type="submit" disabled={pending} className="rounded-2xl bg-orange px-5 py-3 font-bold text-white disabled:opacity-50">{pending?t.saving:t.request}</button>:!state?.success&&!confirming?<><p className="text-sm text-muted">{t.cancelHint}</p><button type="button" onClick={()=>setConfirming(true)} className="rounded-2xl border border-line px-5 py-3 font-bold text-teal">{t.cancel}</button></>:null}
  {kind==='cancel'&&confirming&&!state?.success&&<div role="group" aria-label={t.confirmCancel} className="rounded-xl border border-line p-3"><p className="text-sm font-semibold">{t.confirmCancel}</p><div className="mt-3 flex flex-wrap gap-2"><button type="submit" disabled={pending} className="rounded-xl bg-red-700 px-4 py-2 font-bold text-white disabled:opacity-50">{pending?t.saving:t.confirmCancelButton}</button><button type="button" disabled={pending} onClick={()=>setConfirming(false)} className="rounded-xl border border-line px-4 py-2 font-bold text-teal disabled:opacity-50">{t.keepEnrollment}</button></div></div>}
  {state?.error&&<p role="alert" className="text-sm text-red-700">{state.error}</p>}{state?.success&&<p role="status" className="text-sm text-teal">{state.success}</p>}
 </form>
}
export function DownloadForm({locale,id}:{locale:Locale;id:string}){const t=copy(locale);const [state,action,pending]=useActionState(downloadMaterial.bind(null,locale,id),null);return <form action={action} className="mt-4 space-y-2"><button disabled={pending} className="rounded-xl bg-teal px-4 py-2 font-bold text-white disabled:opacity-50">{pending?t.saving:t.download}</button>{state?.url&&<div><a href={state.url} target="_blank" rel="noopener noreferrer" className="font-bold text-orange underline">{t.download}</a><p className="text-xs text-muted">{t.downloadHint}</p></div>}{state?.error&&<p role="alert" className="text-sm text-red-700">{state.error}</p>}</form>}
