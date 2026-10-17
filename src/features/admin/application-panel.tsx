import { Panel, cairoDate } from '@/components/platform/ui';
import type { TeacherApplication, TeacherApplicationMissing } from '@/features/teacher/application-domain';
import { localizedProfileText, richProfileSchema } from '@/features/teacher/profile-details-domain';
import { ApplicationCvDownload, RequestApplicationChangesForm } from './application-forms';

const missingCopy = {
  en: {
    full_name: 'Full name', photo: 'Profile photo', headline: 'Headline', bio: 'Biography',
    specializations: 'At least one subject and level', languages: 'At least one language',
    experience: 'Experience entry', qualifications: 'Qualification entry', approach: 'Teaching approach',
    teaching_years: 'Years of experience', admin_phone: 'Private administrator phone', attestation: 'Attestation',
  },
  ar: {
    full_name: 'الاسم الكامل', photo: 'الصورة الشخصية', headline: 'العنوان التعريفي', bio: 'النبذة',
    specializations: 'مادة ومستوى واحد على الأقل', languages: 'لغة واحدة على الأقل',
    experience: 'بيانات الخبرة', qualifications: 'بيانات المؤهل', approach: 'أسلوب التدريس',
    teaching_years: 'سنوات الخبرة', admin_phone: 'هاتف المسؤول الخاص', attestation: 'الإقرار',
  },
} satisfies Record<string, Record<TeacherApplicationMissing, string>>;

const label = (value: unknown, locale: string) => {
  if (typeof value === 'string') return value;
  if (!value || typeof value !== 'object') return '';
  const localized = value as { ar?: unknown; en?: unknown };
  const preferred = localized[locale === 'ar' ? 'ar' : 'en'];
  const fallback = localized[locale === 'ar' ? 'en' : 'ar'];
  return typeof preferred === 'string' && preferred ? preferred : typeof fallback === 'string' ? fallback : '';
};

export function submittedApplicationReady(application: TeacherApplication | null, missing: TeacherApplicationMissing[]) {
  if (!application) return false;
  const snapshot = application.snapshot;
  if (!snapshot || missing.length !== 0) return false;
  const details = richProfileSchema.safeParse(snapshot.profile_details);
  return typeof snapshot.full_name === 'string'
    && Array.isArray(snapshot.specializations) && snapshot.specializations.length > 0
    && details.success
    && typeof snapshot.teaching_years === 'number'
    && typeof snapshot.admin_phone === 'string'
    && Array.isArray(snapshot.supporting_links)
    && snapshot.attested === true;
}

export function TeacherApplicationPanel({
  locale, application, missing, requestId,
}: {
  locale: string;
  application: TeacherApplication | null;
  missing: TeacherApplicationMissing[];
  requestId: string | null;
}) {
  const ar = locale === 'ar';
  const words = ar ? {
    title: 'طلب الانضمام إلى التدريس', status: 'حالة الطلب', noApplication: 'لا يوجد طلب انضمام محفوظ.',
    unsubmitted: 'لم يُرسل الطلب بعد. لا يمكن اتخاذ قرار بالموافقة قبل الإرسال.',
    draft: 'مسودة غير مرسلة. لا يمكن اتخاذ قرار بالموافقة قبل الإرسال.',
    changes: 'تم طلب تعديلات. يمكن للمعلم تحديث الطلب وإعادة إرساله.',
    submitted: 'لقطة الإرسال المحفوظة للمراجعة', received: 'تاريخ الإرسال', reviewed: 'تاريخ آخر مراجعة',
    feedback: 'ملاحظات المسؤول', missing: 'متطلبات غير مكتملة', allPresent: 'اكتملت المتطلبات المسجلة.',
    identity: 'الاسم والعنوان', bio: 'النبذة', subjects: 'المواد والمستويات', qualifications: 'المؤهلات',
    experience: 'الخبرة', approach: 'أسلوب التدريس', languages: 'اللغات', years: 'سنوات الخبرة',
    phone: 'هاتف المسؤول الخاص', links: 'روابط داعمة', attested: 'أقر بصحة المعلومات', unavailable: 'تعذر عرض بعض تفاصيل لقطة الإرسال.',
    noCv: 'لا يوجد ملف سيرة ذاتية في الإرسال.',
    legacyApproved: 'حساب معتمد سابقًا؛ لا تغيّر متطلبات الطلب الجديد حالة اعتماده، ولم تكن هناك حاجة إلى لقطة طلب جديدة.',
  } : {
    title: 'Teaching application', status: 'Application status', noApplication: 'No application is recorded.',
    unsubmitted: 'The application has not been submitted. Approval is unavailable until submission.',
    draft: 'Unsubmitted draft. Approval is unavailable until submission.',
    changes: 'Changes were requested. The teacher can update and resubmit the application.',
    submitted: 'Frozen submitted application snapshot', received: 'Submitted', reviewed: 'Last reviewed',
    feedback: 'Administrator feedback', missing: 'Incomplete requirements', allPresent: 'All recorded requirements are complete.',
    identity: 'Name and headline', bio: 'Biography', subjects: 'Subjects and levels', qualifications: 'Qualifications',
    experience: 'Experience', approach: 'Teaching approach', languages: 'Languages', years: 'Years of experience',
    phone: 'Private administrator phone', links: 'Supporting links', attested: 'Applicant attestation', unavailable: 'Some submitted snapshot details could not be displayed.',
    noCv: 'No CV was attached to this submission.',
    legacyApproved: 'Existing approved account; new application requirements do not change its approval. No new application snapshot was required.',
  };
  const statusText: Record<TeacherApplication['status'], string> = ar
    ? { draft: 'مسودة', submitted: 'مرسل للمراجعة', changes_requested: 'مطلوب تعديله', approved: 'تمت الموافقة', declined: 'مرفوض' }
    : { draft: 'Draft', submitted: 'Submitted', changes_requested: 'Changes requested', approved: 'Approved', declined: 'Declined' };

  if (!application) return <Panel><h2 className="text-xl font-black text-teal">{words.title}</h2><p className="mt-3 text-sm text-muted">{words.noApplication}</p></Panel>;

  const snapshot = application.snapshot;
  const detailsResult = richProfileSchema.safeParse(snapshot?.profile_details);
  const ready = submittedApplicationReady(application, missing);
  const specializationRows = Array.isArray(snapshot?.specializations) ? snapshot.specializations : [];
  const years = snapshot?.teaching_years;
  const privatePhone = snapshot?.admin_phone;
  const supportingLinks = Array.isArray(snapshot?.supporting_links) ? snapshot.supporting_links : [];

  return <Panel>
    <div className="flex flex-wrap items-center justify-between gap-3">
      <h2 className="text-xl font-black text-teal">{words.title}</h2>
      <span className="rounded-full bg-cream px-3 py-1 text-sm font-bold" aria-label={`${words.status}: ${statusText[application.status]}`}>{statusText[application.status]}</span>
    </div>
    {application.status === 'draft' && <p className="mt-3 rounded-xl bg-amber-50 p-3 text-sm text-amber-950">{words.draft}</p>}
    {application.status === 'changes_requested' && <p className="mt-3 rounded-xl bg-amber-50 p-3 text-sm text-amber-950">{words.changes}</p>}
    {application.status === 'submitted' && !ready && <p role="alert" className="mt-3 rounded-xl bg-red-50 p-3 text-sm text-red-800">{words.unavailable}</p>}
    <dl className="mt-4 grid gap-4 sm:grid-cols-2">
      <div><dt className="text-sm text-muted">{words.received}</dt><dd className="mt-1 font-semibold">{application.submitted_at ? cairoDate(application.submitted_at, locale) : '—'}</dd></div>
      <div><dt className="text-sm text-muted">{words.reviewed}</dt><dd className="mt-1 font-semibold">{application.reviewed_at ? cairoDate(application.reviewed_at, locale) : '—'}</dd></div>
    </dl>
    {application.feedback && <div className="mt-4 rounded-xl bg-cream p-4"><h3 className="font-bold">{words.feedback}</h3><p className="mt-2 whitespace-pre-wrap text-sm">{application.feedback}</p></div>}
    <div className="mt-5 border-t border-line pt-4">
      <h3 className="font-bold text-teal">{words.missing}</h3>
      {application.legacy_approved && application.status === 'approved' && !snapshot
        ? <p className="mt-2 text-sm text-muted">{words.legacyApproved}</p>
        : missing.length
          ? <ul className="mt-2 grid gap-1 text-sm text-muted">{missing.map(code => <li key={code}>• {missingCopy[ar ? 'ar' : 'en'][code]}</li>)}</ul>
          : <p className="mt-2 text-sm text-muted">{words.allPresent}</p>}
    </div>
    {application.status === 'submitted' && ready && snapshot && detailsResult.success && <section className="mt-5 border-t border-line pt-4" aria-label={words.submitted}>
      <h3 className="text-lg font-black text-teal">{words.submitted}</h3>
      <div className="mt-4 grid gap-4">
        <div><h4 className="font-bold">{words.identity}</h4><p className="mt-1 text-sm">{String(snapshot.full_name)}{typeof snapshot.headline === 'string' ? ` · ${snapshot.headline}` : ''}</p></div>
        <div><h4 className="font-bold">{words.bio}</h4><p className="mt-1 whitespace-pre-wrap text-sm text-muted">{localizedProfileText(detailsResult.data.about, locale) || '—'}</p></div>
        <div><h4 className="font-bold">{words.subjects}</h4><ul className="mt-2 flex flex-wrap gap-2">{specializationRows.map((item, index) => {
          const row = item && typeof item === 'object' ? item as Record<string, unknown> : {};
          const title = label(locale === 'ar' ? row.label_ar : row.label_en, locale) || label(row.label_en, locale) || label(row.label_ar, locale);
          return <li key={typeof row.id === 'string' ? row.id : `${title}-${index}`} className="rounded-lg bg-cream px-3 py-2 text-sm">{title || '—'}</li>;
        })}</ul></div>
        {(['qualifications', 'experience'] as const).map(key => <div key={key}><h4 className="font-bold">{key === 'qualifications' ? words.qualifications : words.experience}</h4><ul className="mt-2 grid gap-2">{detailsResult.data[key].map(entry => <li key={entry.id} className="rounded-xl bg-cream p-3"><strong>{localizedProfileText(entry.title, locale)}</strong>{localizedProfileText(entry.organization, locale) && <span className="text-muted"> · {localizedProfileText(entry.organization, locale)}</span>}<p className="mt-1 whitespace-pre-wrap text-sm text-muted">{localizedProfileText(entry.description, locale)}</p><p className="mt-1 text-xs text-muted">{entry.start_year ?? '—'} – {entry.current ? (ar ? 'حتى الآن' : 'Present') : entry.end_year ?? '—'}</p></li>)}</ul></div>)}
        <div><h4 className="font-bold">{words.approach}</h4><p className="mt-1 whitespace-pre-wrap text-sm text-muted">{localizedProfileText(detailsResult.data.approach, locale) || '—'}</p></div>
        <div><h4 className="font-bold">{words.languages}</h4><p className="mt-1 text-sm text-muted">{detailsResult.data.languages.join(' · ') || '—'}</p></div>
        <div><h4 className="font-bold">{words.years}</h4><p className="mt-1 text-sm">{typeof years === 'number' ? years : '—'}</p></div>
        <div><h4 className="font-bold">{words.phone}</h4><p className="mt-1 text-sm" dir="ltr">{typeof privatePhone === 'string' ? privatePhone : '—'}</p></div>
        <div><h4 className="font-bold">{words.links}</h4>{supportingLinks.length ? <ul className="mt-1 grid gap-1 text-sm">{supportingLinks.map((item, index) => { const href = typeof item === 'string' && /^https:\/\//i.test(item) ? item : null; return <li key={`${item}-${index}`}>{href ? <a href={href} target="_blank" rel="noreferrer" className="break-all text-teal underline">{item}</a> : <span className="break-all">{String(item)}</span>}</li>; })}</ul> : <p className="mt-1 text-sm text-muted">—</p>}</div>
        <div><h4 className="font-bold">{words.attested}</h4><p className="mt-1 text-sm">{snapshot.attested === true ? (ar ? 'نعم' : 'Yes') : (ar ? 'لا' : 'No')}</p></div>
        {typeof snapshot.cv_url === 'string' && <div><h4 className="font-bold">{ar ? 'رابط السيرة الذاتية على Google Drive' : 'Google Drive CV link'}</h4><a href={snapshot.cv_url} target="_blank" rel="noreferrer" className="mt-1 inline-block break-all text-teal underline">{snapshot.cv_url}</a></div>}
        {typeof snapshot.cv_path === 'string' && <ApplicationCvDownload locale={locale} teacherId={application.teacher_id}/>}
        {typeof snapshot.cv_path !== 'string' && typeof snapshot.cv_url !== 'string' && <p className="text-sm text-muted">{words.noCv}</p>}
      </div>
    </section>}
    {application.status === 'submitted' && ready && requestId && <div className="mt-5 border-t border-line pt-4"><RequestApplicationChangesForm locale={locale} teacherId={application.teacher_id} requestId={requestId}/></div>}
  </Panel>;
}
