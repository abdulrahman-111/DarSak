'use client';

import { useActionState } from 'react';
import { Panel, Status, cairoDate } from '@/components/platform/ui';
import type { Locale } from '@/features/student/domain';
import type { TeacherReviewStatus } from './review-data';
import { reviewStatusCopy } from './review-data';
import { requestTeacherReview } from './review-actions';

export function TeacherReviewPanel({locale,status,error}:{locale:Locale;status:TeacherReviewStatus|null;error:string|null}){
 const ar=locale==='ar';const fallback=ar?'تعذر تحميل حالة مراجعة المعلم. حدّث الصفحة لإعادة المحاولة.':'Could not load teacher review status. Refresh to try again.';
 const [state,action,pending]=useActionState(requestTeacherReview.bind(null,locale),null);
 if(error||!status)return <Panel className="mb-6"><p role="alert" className="text-sm text-red-800">{fallback}</p></Panel>;
 const {copy}=reviewStatusCopy(locale,status);
 const title=status.status==='pending'?copy.pendingTitle:status.status==='approved'?copy.approvedTitle:copy.declinedTitle;
 const body=status.status==='pending'?copy.pendingBody:status.status==='approved'?copy.approvedBody:copy.declinedBody;
 return <Panel className="mb-6"><div className="flex flex-wrap items-center justify-between gap-3"><h2 className="text-lg font-black text-teal">{title}</h2><Status value={status.status} locale={locale}/></div>
  <p className="mt-2 text-sm leading-6 text-muted">{body}</p>
  {status.status==='declined'&&status.decline_reason&&<div className="mt-4 rounded-xl bg-red-50 p-4"><h3 className="text-sm font-bold text-red-900">{copy.reason}</h3><p className="mt-1 whitespace-pre-wrap text-sm text-red-900">{status.decline_reason}</p></div>}
  <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-2"><div><dt className="text-muted">{copy.requested}</dt><dd className="font-semibold">{cairoDate(status.requested_at,locale)}</dd></div><div><dt className="text-muted">{copy.reviewed}</dt><dd className="font-semibold">{status.reviewed_at?cairoDate(status.reviewed_at,locale):'—'}</dd></div></dl>
  {status.status==='declined'&&<form action={action} className="mt-4"><button disabled={pending} className="rounded-xl bg-orange px-5 py-3 font-bold text-white disabled:opacity-50">{pending?copy.working:copy.resubmit}</button></form>}
  {(state?.error||state?.success)&&<p role={state.error?'alert':'status'} className={`mt-3 rounded-xl p-3 text-sm ${state.error?'bg-red-50 text-red-800':'bg-teal/10 text-teal'}`}>{state.error||state.success}</p>}
 </Panel>;
}
