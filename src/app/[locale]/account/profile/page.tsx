import { ensureLocale } from '@/i18n/config';
import { Panel, ScreenTitle } from '@/components/platform/ui';
import { teacherProfile } from '@/features/teacher/profile-data';
import { TeacherAvatarEditor, TeacherProfileForm } from '@/features/teacher/profile-forms';
import { TeacherCoverEditor } from '@/features/teacher/profile-cover-editor';
import { TeacherProfileDetailsForm } from '@/features/teacher/profile-details-form';
import { publicVisitorContacts } from '@/features/teacher/profile-details-domain';
import { UnsavedProfileProtection } from '@/features/teacher/unsaved-profile-protection';
import { requireViewer } from '@/components/platform/access';
import { AccountBackLink } from '@/features/account/account-back-link';
import { AccountPageFrame } from '@/features/account/account-page-frame';
import Link from 'next/link';

export default async function TeacherProfilePage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const [{ locale: raw }, query] = await Promise.all([params, searchParams]);
  const locale = ensureLocale(raw);
  await requireViewer(locale, 'teacher');
  const ar = locale === 'ar';
  const onboarding = query.onboarding === '1';
  const onboardingError = query.onboarding_error === 'load';
  const data = await teacherProfile(locale);
  return (
    <AccountPageFrame>
      <>
        <AccountBackLink locale={locale} />
        <ScreenTitle
          eyebrow={ar ? 'إعدادات المعلم' : 'Teacher settings'}
          title={ar ? 'الملف الشخصي' : 'Profile'}
          description={
            ar
              ? 'عرّف الطلاب بخبرتك. تظهر بيانات التواصل للطلاب النشطين بعد قبول تسجيلهم في إحدى مجموعاتك فقط.'
              : 'Introduce students to your experience. Your contact details appear only to active students after you accept their enrollment in one of your groups.'
          }
        />
        {onboarding && (
          <Panel className="mb-5">
            <p className="text-xs font-bold uppercase tracking-wide text-orange">
              {ar ? 'إعداد حساب المعلم' : 'Teacher account setup'}
            </p>
            <ol className="mt-2 grid gap-2 text-sm leading-6 text-ink sm:grid-cols-2">
              <li>
                <strong>{ar ? 'الخطوة ١: الملف العام.' : 'Step 1: Public profile.'}</strong>{' '}
                {ar
                  ? 'أضف الصورة والعنوان والنبذة والمواد واللغات والخبرة والمؤهلات والمنهجية.'
                  : 'Add your photo, headline, bio, subjects, languages, experience, qualifications, and approach.'}
              </li>
              <li>
                <strong>{ar ? 'الخطوة ٢: طلب الاعتماد.' : 'Step 2: Teacher application.'}</strong>{' '}
                {ar
                  ? 'بعد حفظ الملف، أضف رقم التواصل الإداري والسنوات والسيرة الذاتية والإقرار.'
                  : 'After saving your profile, add the administrator phone, teaching years, CV, and attestation.'}{' '}
                <Link
                  className="font-bold text-teal underline"
                  href={`/${locale}/account/application`}
                >
                  {ar ? 'فتح الطلب' : 'Open application'}
                </Link>
              </li>
            </ol>
          </Panel>
        )}
        {onboardingError && (
          <Panel className="mb-5">
            <p role="alert" className="text-sm text-danger">
              {ar
                ? 'تعذر التحقق من خطوات إعداد الحساب. أكمل بيانات الملف ثم حدّث الصفحة أو افتح طلب الاعتماد.'
                : 'Could not check your account setup steps. Complete your profile, then refresh or open the application page.'}
            </p>
          </Panel>
        )}
        {data.error || !data.values ? (
          <Panel>
            <p role="alert" className="text-sm text-danger">
              {data.error ?? (ar ? 'تعذر تحميل الملف الشخصي.' : 'Could not load your profile.')}
            </p>
          </Panel>
        ) : (
          <Panel>
            <UnsavedProfileProtection locale={locale}>
              <TeacherAvatarEditor
                locale={locale}
                avatarUrl={data.avatarUrl}
                hasAvatar={data.hasAvatar}
                fullName={data.values.full_name}
              />
              <TeacherCoverEditor
                locale={locale}
                coverUrl={data.coverUrl}
                hasCover={!!data.coverUrl}
              />
              {!data.me.teacher?.approved && (
                <div className="mb-5 rounded-xl bg-orange/10 p-3 text-sm leading-6 text-ink">
                  <p>
                    {ar
                      ? 'يمكنك تعديل ملفك الشخصي أثناء انتظار الاعتماد. أكمل عناصر قائمة الطلب من صفحة التقديم؛ تفاصيل الخبرة والمؤهلات واللغات والمنهجية موجودة في هذا المحرر.'
                      : 'You can edit your profile while approval is pending. Complete the application checklist from the application page; experience, qualifications, languages, and approach are edited here.'}
                  </p>
                  <Link
                    href={`/${locale}/account/application`}
                    className="mt-2 inline-flex font-bold text-teal underline"
                  >
                    {ar ? 'فتح طلب الاعتماد' : 'Open teacher application'}
                  </Link>
                </div>
              )}
              <TeacherProfileForm
                locale={locale}
                values={data.values}
                nodes={data.nodes}
                subjects={data.subjects}
                offerings={data.offerings}
                retainedOfferingIds={data.retainedOfferingIds}
              />
              <TeacherProfileDetailsForm
                locale={locale}
                details={data.details.details}
                version={data.details.version}
                error={data.details.error}
                teacher={{
                  id: data.me.id,
                  full_name: data.values.full_name,
                  headline: data.values.headline || null,
                }}
                avatarUrl={data.avatarUrl}
                coverUrl={data.coverUrl}
                specializations={data.previewSpecializations}
                groups={data.previewGroups}
                contactVisibility={data.values.visibility}
                previewContacts={publicVisitorContacts(data.values.visibility, data.contacts)}
              />
            </UnsavedProfileProtection>
          </Panel>
        )}
      </>
    </AccountPageFrame>
  );
}
