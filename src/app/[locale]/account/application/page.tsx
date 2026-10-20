import { ensureLocale } from '@/i18n/config';
import { requireViewer } from '@/components/platform/access';
import { Panel, ScreenTitle } from '@/components/platform/ui';
import { teacherApplication } from '@/features/teacher/application-data';
import { TeacherApplicationPanel } from '@/features/teacher/application-panel';
import { TeacherReviewPanel } from '@/features/teacher/review-panel';
import { parseTeacherReviewStatus } from '@/features/teacher/review-data';
import { AccountBackLink } from '@/features/account/account-back-link';
import { AccountPageFrame } from '@/features/account/account-page-frame';

export default async function TeacherApplicationPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const [{ locale: raw }, query] = await Promise.all([params, searchParams]);
  const locale = ensureLocale(raw);
  const ar = locale === 'ar';
  const onboardingError = query.onboarding_error === 'load';
  const me = await requireViewer(locale, 'teacher');
  const [data, reviewResult] = await Promise.all([
    teacherApplication(me),
    me.db.rpc('teacher_review_status', { p_teacher_id: me.id }),
  ]);
  const status = reviewResult.error ? null : parseTeacherReviewStatus(reviewResult.data);
  return (
    <AccountPageFrame>
      <>
        <AccountBackLink locale={locale} />
        <ScreenTitle
          eyebrow={ar ? 'اعتماد المعلم' : 'Teacher approval'}
          title={ar ? 'طلب الاعتماد' : 'Application'}
          description={
            ar
              ? 'قدّم معلوماتك للمراجعة الإدارية. يمكنك تجهيز الطلب حتى عند توقف صلاحية التدريس.'
              : 'Share the required information for administrator review. You can prepare your application while teaching access is paused.'
          }
        />
        {onboardingError && (
          <Panel>
            <p role="alert" className="text-sm text-danger">
              {ar
                ? 'تعذر التحقق من خطوات إعداد حسابك. راجع القائمة أدناه وحدّث الصفحة بعد الحفظ.'
                : 'Could not check your account setup steps. Review the checklist below and refresh after saving.'}
            </p>
          </Panel>
        )}
        {data.error === 'download' && (
          <Panel>
            <p role="alert" className="text-sm text-danger">
              {ar
                ? 'تعذر إنشاء رابط تنزيل آمن لملفك.'
                : 'Could not create a secure download link for your CV.'}
            </p>
          </Panel>
        )}
        <TeacherReviewPanel
          locale={locale}
          status={status}
          applicationStatus={data.application?.status ?? null}
          error={reviewResult.error?.message || (!status ? 'unavailable' : null)}
        />
        <TeacherApplicationPanel locale={locale} data={data} />
      </>
    </AccountPageFrame>
  );
}
