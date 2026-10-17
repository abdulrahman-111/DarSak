'use client';

import { useActionState, useState } from 'react';
import Link from 'next/link';
import type { Locale } from '@/features/student/domain';
import type { TeacherApplication } from './application-domain';
import { saveTeacherApplication } from './application-actions';

export function TeacherApplicationForm({ locale, application, canSubmit }: { locale: Locale; application: TeacherApplication; canSubmit: boolean }) {
  const ar = locale === 'ar';
  const [state, action, pending] = useActionState(saveTeacherApplication.bind(null, locale), null);
  const [years, setYears] = useState(application.teaching_years === null ? '' : String(application.teaching_years));
  const [phone, setPhone] = useState(application.admin_phone);
  const [attested, setAttested] = useState(application.attested);
  const [newCvSelected, setNewCvSelected] = useState(false);
  const [links, setLinks] = useState([0, 1, 2].map(index => application.supporting_links[index] ?? ''));
  const input = 'mt-1 min-h-12 w-full rounded-xl border border-line bg-white px-3 py-2 text-base text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange';
  const fieldError = (name: string) => state?.fieldErrors?.[name] ? <p className="mt-1 text-sm text-red-800">{ar ? 'يرجى التحقق من هذه القيمة.' : 'Please check this value.'}</p> : null;
  return <form action={action} encType="multipart/form-data" className="grid gap-5">
    <input type="hidden" name="expected_updated_at" value={state?.updatedAt ?? application.updated_at}/>
    {state?.pendingCvPath && <input type="hidden" name="pending_cv_path" value={state.pendingCvPath}/>}
    <fieldset disabled={pending || ['submitted', 'approved'].includes(application.status)} className="grid gap-5 disabled:opacity-75">
      <div>
        <label htmlFor="teaching-years" className="block font-bold text-ink">{ar ? 'سنوات الخبرة في التدريس' : 'Years of teaching experience'}</label>
        <p className="mt-1 text-sm leading-6 text-muted">{ar ? 'مطلوب للإرسال. اختر 0 إذا لم تكن لديك خبرة تدريس رسمية. أضف خبرة مهنية أو مشروعاً أو عملاً مستقلاً في ملفك العام.' : 'Required for submission. Choose 0 if you have no formal teaching experience. Add relevant professional, project, or independent work to your public profile.'}</p>
        <input id="teaching-years" name="teaching_years" type="number" inputMode="numeric" min="0" max="60" step="1" value={years} onChange={event => setYears(event.currentTarget.value)} className={input} aria-invalid={!!state?.fieldErrors?.teaching_years}/>
        {fieldError('teaching_years')}
      </div>
      <div>
        <label htmlFor="admin-phone" className="block font-bold text-ink">{ar ? 'هاتف تواصل خاص مع الإدارة' : 'Private phone for administrator contact'}</label>
        <p className="mt-1 text-sm text-muted">{ar ? 'مطلوب للإرسال، ولن يظهر هذا الرقم في ملفك العام.' : 'Required for submission. This number is private and will not appear on your public profile.'}</p>
        <input id="admin-phone" name="admin_phone" type="tel" autoComplete="tel" maxLength={30} value={phone} onChange={event => setPhone(event.currentTarget.value)} className={input} aria-invalid={!!state?.fieldErrors?.admin_phone}/>
        {fieldError('admin_phone')}
      </div>
      <div>
        <label htmlFor="cv" className="block font-bold text-ink">{ar ? 'السيرة الذاتية (PDF)' : 'CV (PDF)'}</label>
        <p className="mt-1 text-sm text-muted">{ar ? 'مطلوب للإرسال: ملف PDF حتى 5 ميبيبايت. لا ترفع مستندات إضافية.' : 'Required for submission: a PDF up to 5 MiB. Additional certificate files are not needed.'}</p>
        <input id="cv" name="cv" type="file" accept="application/pdf,.pdf" onChange={event => setNewCvSelected(event.currentTarget.files?.length === 1)} className="mt-2 block w-full text-sm file:me-3 file:min-h-11 file:rounded-xl file:border-0 file:bg-teal file:px-4 file:font-bold file:text-white" aria-invalid={!!state?.fieldErrors?.cv}/>
        {application.cv_path && <p className="mt-2 text-sm">{ar ? 'يوجد ملف محفوظ.' : 'A CV is saved.'}</p>}
        {state?.pendingCvPath && <p role="status" className="mt-2 text-sm text-teal">{ar ? 'تم رفع الملف بأمان. أعد حفظ المسودة دون إعادة رفعه.' : 'The CV was uploaded securely. Retry saving without uploading it again.'}</p>}
        {fieldError('cv')}
      </div>
      <fieldset>
        <legend className="font-bold text-ink">{ar ? 'روابط داعمة (اختياري، حتى 3)' : 'Supporting links (optional, up to 3)'}</legend>
        <p className="mt-1 text-sm text-muted">{ar ? 'أدخل روابط HTTPS فقط، بحد أقصى 500 حرف للرابط.' : 'Use HTTPS links only, up to 500 characters each.'}</p>
        <div className="mt-2 grid gap-3">{[0, 1, 2].map(index => <div key={index}><label className="sr-only" htmlFor={`supporting-link-${index}`}>{ar ? `رابط داعم ${index + 1}` : `Supporting link ${index + 1}`}</label><input id={`supporting-link-${index}`} name={`supporting_link_${index}`} type="text" inputMode="url" maxLength={500} placeholder="https://" value={links[index] ?? ''} onChange={event => { const value = event.currentTarget.value; setLinks(current => current.map((link, position) => position === index ? value : link)); }} className={input}/></div>)}</div>
        {fieldError('supporting_links')}
      </fieldset>
      <div className="rounded-2xl border border-line p-4">
        <h3 className="font-bold text-ink">{ar ? 'اكتمال الملف العام' : 'Public profile checklist'}</h3>
        <p className="mt-1 text-sm text-muted">{ar ? 'أكمل الملف العام والدليل التعليمي من الصفحات الحالية. استخدم محرر الملف نفسه لتفاصيل الخبرة والمؤهلات واللغات والمنهجية.' : 'Complete your existing public profile and catalogue. Use the profile editor for experience, qualifications, languages, and teaching approach.'}</p>
        <div className="mt-3 flex flex-wrap gap-4 text-sm font-bold text-teal underline"><Link href={`/${locale}/account/profile`}>{ar ? 'تعديل الملف العام' : 'Edit public profile'}</Link><Link href={`/${locale}/teacher/catalogue`}>{ar ? 'اختيار المواد والمراحل' : 'Choose subjects and levels'}</Link></div>
      </div>
      <label className="flex items-start gap-3 rounded-xl bg-orange/10 p-3 text-sm leading-6 text-ink"><input name="attested" type="checkbox" checked={attested} onChange={event => setAttested(event.currentTarget.checked)} className="mt-1 size-5 accent-teal"/><span>{ar ? 'أقر بأن المعلومات المقدمة صحيحة وكاملة، وأوافق على مشاركة سيرتي الذاتية والروابط أو المستندات الداعمة المقدمة مع الإدارة لمراجعة طلبي.' : 'I confirm that the information provided is true and complete, and authorize sharing my submitted CV and supporting links or documents with administrators to review my application.'}</span></label>
      {fieldError('attested')}
    </fieldset>
    {state?.error && <p role="alert" className="rounded-xl bg-red-50 p-3 text-sm text-red-800">{state.error}</p>}
    {state?.success && <p role="status" className="rounded-xl bg-teal/10 p-3 text-sm text-teal">{state.success}</p>}
    {(() => { const digits = phone.replace(/\D/g, ''); const appFieldsComplete = years !== '' && Number.isInteger(Number(years)) && Number(years) >= 0 && Number(years) <= 60 && /^[\d\s()+-]{7,30}$/.test(phone) && digits.length >= 7 && attested && (!!application.cv_path || newCvSelected); return <><div className="flex flex-wrap gap-3"><button name="intent" value="draft" formNoValidate disabled={pending || ['submitted', 'approved'].includes(application.status)} className="min-h-12 rounded-xl border border-teal px-5 py-3 font-bold text-teal disabled:opacity-50">{pending ? (ar ? 'جارٍ الحفظ…' : 'Saving…') : (ar ? 'حفظ المسودة' : 'Save draft')}</button><button name="intent" value="submit" disabled={pending || !appFieldsComplete || !canSubmit || ['submitted', 'approved'].includes(application.status)} title={!canSubmit ? (ar ? 'أكمل قائمة الملف العام أولاً' : 'Complete the profile checklist first') : undefined} className="min-h-12 rounded-xl bg-orange px-5 py-3 font-bold text-white disabled:opacity-50">{ar ? 'إرسال للمراجعة' : 'Submit for review'}</button></div>{(!canSubmit || !appFieldsComplete) && <p className="text-sm text-muted">{ar ? 'يتاح الإرسال بعد اكتمال عناصر الطلب والملف العام.' : 'Submission becomes available when application fields and public profile checklist are complete.'}</p>}</>; })()}
  </form>;
}
