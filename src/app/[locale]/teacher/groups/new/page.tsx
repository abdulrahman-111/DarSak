import Link from 'next/link';
import { ensureLocale } from '@/i18n/config';
import { Panel, ScreenTitle } from '@/components/platform/ui';
import { teacherGroupSetup } from '@/features/teacher/setup-data';
import { GroupDetailsForm } from '@/features/teacher/setup-forms';
import { loadWithTeachingAccess } from '@/features/teacher/teaching-access-gate';
import { GroupSetupSteps } from '@/features/teacher/setup-forms';
import { UnsavedProfileProtection } from '@/features/teacher/unsaved-profile-protection';

export default async function NewTeacherGroupPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale: raw } = await params;
  const locale = ensureLocale(raw);
  const ar = locale === 'ar';
  const { data } = await loadWithTeachingAccess(locale, () => teacherGroupSetup(locale));
  return (
    <UnsavedProfileProtection locale={locale} kind="group">
      <ScreenTitle
        eyebrow={ar ? 'إعداد التدريس' : 'Teaching setup'}
        title={ar ? 'إنشاء مجموعة' : 'Create a group'}
        description={
          ar
            ? 'احفظ تفاصيل مجموعتك كمسودة، ثم أكمل إعداد الجدول قبل النشر.'
            : 'Save your group details as a draft, then continue to its schedule before publishing.'
        }
      />
      <div className="mx-auto max-w-3xl">
        <GroupSetupSteps locale={locale} current="details" />
        <Panel>
          {data.error ? (
            <p role="alert" className="text-sm text-danger">
              {data.error}
            </p>
          ) : (
            <>
              <p className="mb-5 text-sm leading-6 text-muted">
                {ar
                  ? 'أكمل التفاصيل والجدول ثم راجعها قبل نشر المجموعة.'
                  : 'Add group and learning details, set the schedule, then review everything before publishing.'}
              </p>
              <GroupDetailsForm locale={locale} catalogue={data.catalogue} />
            </>
          )}
          <Link
            href={`/${locale}/teacher/groups`}
            className="mt-5 inline-block text-sm font-bold text-teal underline"
          >
            {ar ? 'العودة إلى مجموعاتي' : 'Back to my groups'}
          </Link>
        </Panel>
      </div>
    </UnsavedProfileProtection>
  );
}
