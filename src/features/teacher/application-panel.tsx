import Link from 'next/link';
import { Panel } from '@/components/platform/ui';
import type { Locale } from '@/features/student/domain';
import type { TeacherApplicationReadResponse } from './application-domain';
import { applicationMissingLabel } from './application-data';
import { TeacherApplicationForm } from './application-form';
import { TeacherRulesPanel } from './teacher-rules-panel';

export function TeacherApplicationPanel({
  locale,
  data,
}: {
  locale: Locale;
  data: TeacherApplicationReadResponse & { error: string | null; cvUrl: string | null };
}) {
  const ar = locale === 'ar';
  if (data.error === 'unavailable' || !data.application)
    return (
      <Panel>
        <p role="alert" className="text-sm text-red-800">
          {ar
            ? 'تعذر تحميل طلب المعلم. حدّث الصفحة وحاول مرة أخرى.'
            : 'Could not load your application. Refresh and try again.'}
        </p>
      </Panel>
    );
  const app = data.application;
  const editable =
    app.status === 'draft' || app.status === 'changes_requested' || app.status === 'declined';
  if (app.status === 'submitted')
    return (
      <div className="grid gap-5">
        <Panel>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-lg font-black text-teal">
              {ar ? 'طلبك قيد المراجعة' : 'Your application is under review'}
            </h2>
            <span className="rounded-full bg-orange/10 px-3 py-1 text-sm font-bold text-teal">
              {ar ? 'قيد المراجعة' : 'Submitted'}
            </span>
          </div>
          <p className="mt-3 text-sm leading-6 text-muted">
            {ar
              ? 'تم إرسال طلبك ومعلوماته المحفوظة للمراجعة. ستجد نتيجة الإدارة هنا.'
              : 'Your application and saved details have been sent for review. Administrator feedback will appear here.'}
          </p>
          {app.cv_path && <CvLink locale={locale} url={data.cvUrl} />}{' '}
          {app.cv_url && (
            <a
              className="mt-3 inline-block break-all text-teal underline"
              href={app.cv_url}
              target="_blank"
              rel="noreferrer"
            >
              {ar ? 'فتح رابط السيرة الذاتية' : 'Open CV link'}
            </a>
          )}
        </Panel>
        <TeacherRulesPanel locale={locale} />
      </div>
    );
  if (app.status === 'approved')
    return (
      <div className="grid gap-5">
        <Panel>
          <h2 className="text-lg font-black text-teal">
            {ar ? 'تم اعتماد طلبك' : 'Your application is approved'}
          </h2>
          <p className="mt-2 text-sm leading-6 text-muted">
            {app.legacy_approved
              ? ar
                ? 'يظل اعتمادك الحالي وصلاحية التدريس ساريين. يمكنك مواصلة تحديث ملفك العام؛ لا يلزم تقديم طلب أو سيرة ذاتية جديدة.'
                : 'Your existing approval and teaching access remain active. You can continue updating your public profile; no new application or CV is required.'
              : ar
                ? 'يمكنك متابعة التدريس. تفاصيل طلبك محفوظة للمراجعة.'
                : 'You can continue teaching. Your application details are retained for review.'}
          </p>
          {app.legacy_approved && (
            <p className="mt-3 rounded-xl bg-teal/10 p-3 text-sm text-ink">
              {ar
                ? 'تحديث تفاصيل الملف العام اختياري.'
                : 'Updating public profile details is optional.'}{' '}
              <Link className="font-bold text-teal underline" href={`/${locale}/account/profile`}>
                {ar ? 'متابعة الملف الشخصي' : 'Continue to your public profile'}
              </Link>
            </p>
          )}
          {app.cv_path && <CvLink locale={locale} url={data.cvUrl} />}{' '}
          {app.cv_url && (
            <a
              className="mt-3 inline-block break-all text-teal underline"
              href={app.cv_url}
              target="_blank"
              rel="noreferrer"
            >
              {ar ? 'فتح رابط السيرة الذاتية' : 'Open CV link'}
            </a>
          )}
        </Panel>
        <TeacherRulesPanel locale={locale} />
      </div>
    );
  return (
    <div className="grid gap-5">
      {app.status === 'changes_requested' && (
        <Panel>
          <h2 className="text-lg font-black text-teal">
            {ar ? 'تحديثات مطلوبة' : 'Changes requested'}
          </h2>
          <p className="mt-2 text-sm leading-6 text-muted">
            {ar
              ? 'راجع ملاحظات الإدارة أدناه، حدّث الملف والطلب، ثم أرسله من جديد.'
              : 'Review the administrator’s feedback below, update your profile and application, then submit again.'}
          </p>
          {app.feedback && (
            <div className="mt-3 rounded-xl bg-orange/10 p-4">
              <h3 className="font-bold text-ink">
                {ar ? 'ملاحظات الإدارة' : 'Administrator feedback'}
              </h3>
              <p className="mt-1 whitespace-pre-wrap text-sm leading-6">{app.feedback}</p>
            </div>
          )}
        </Panel>
      )}
      {app.status === 'declined' && (
        <Panel>
          <h2 className="text-lg font-black text-teal">
            {ar ? 'لم تتم الموافقة على الطلب' : 'Your application was declined'}
          </h2>
          {app.feedback && (
            <p className="mt-2 whitespace-pre-wrap text-sm leading-6">{app.feedback}</p>
          )}
          <p className="mt-2 text-sm text-muted">
            {ar
              ? 'يمكنك تعديل الملف والطلب هنا ثم إعادة الإرسال بعد استيفاء القائمة.'
              : 'You can update your profile and application here, then resubmit when the checklist is complete.'}
          </p>
        </Panel>
      )}
      <Panel>
        <div className="mb-4">
          <h2 className="text-xl font-black text-teal">
            {app.status === 'draft'
              ? ar
                ? 'طلب اعتماد المعلم'
                : 'Teacher application'
              : ar
                ? 'تعديل طلب المعلم'
                : 'Update your teacher application'}
          </h2>
          <p className="mt-1 text-sm leading-6 text-muted">
            {ar
              ? 'يمكن حفظ مسودة غير مكتملة. لا يمكن الإرسال للمراجعة حتى تكتمل كل العناصر المطلوبة.'
              : 'You can save an incomplete draft. Submission stays locked until every required item is complete.'}
          </p>
        </div>
        {!!data.missing.length && (
          <div className="mb-5 rounded-xl bg-orange/10 p-4">
            <h3 className="font-bold text-ink">
              {ar ? 'أكمل هذه العناصر قبل الإرسال' : 'Complete these items before submission'}
            </h3>
            <ul className="mt-2 list-disc space-y-1 ps-5 text-sm">
              {data.missing.map(item => (
                <li key={item}>{applicationMissingLabel(locale, item)}</li>
              ))}
            </ul>
          </div>
        )}
        {!data.missing.length && (
          <p className="mb-5 rounded-xl bg-teal/10 p-3 text-sm font-semibold text-teal">
            {ar
              ? 'اكتملت قائمة المتطلبات. يمكنك الإرسال للمراجعة.'
              : 'The required checklist is complete. You can submit for review.'}
          </p>
        )}
        <TeacherApplicationForm
          locale={locale}
          application={app}
          canSubmit={data.missing.every(item =>
            ['teaching_years', 'admin_phone', 'attestation'].includes(item),
          )}
        />
      </Panel>
    </div>
  );
}

function CvLink({ locale, url }: { locale: Locale; url: string | null }) {
  const ar = locale === 'ar';
  return (
    <div className="mt-3">
      {url ? (
        <a href={url} className="font-bold text-teal underline">
          {ar
            ? 'تنزيل السيرة الذاتية (رابط صالح لمدة دقيقة)'
            : 'Download CV (link valid for one minute)'}
        </a>
      ) : (
        <p role="alert" className="text-sm text-red-800">
          {ar ? 'تعذر إنشاء رابط تنزيل آمن.' : 'Could not create a secure download link.'}
        </p>
      )}
    </div>
  );
}
