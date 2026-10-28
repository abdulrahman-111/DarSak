import { requireViewer } from '@/components/platform/access';
import { EmptyState, Panel, ScreenTitle } from '@/components/platform/ui';
import { ensureLocale } from '@/i18n/config';
import { AccountBackLink } from '@/features/account/account-back-link';
import { AccountPageFrame } from '@/features/account/account-page-frame';
import { ReminderPreferenceForm } from '@/features/notifications/reminder-preference-form';
import { parseLessonReminderPreference } from '@/features/notifications/reminder-preference';

export default async function AccountNotificationsPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale: raw } = await params;
  const locale = ensureLocale(raw);
  const viewer = await requireViewer(locale);
  const ar = locale === 'ar';
  const { data, error } = await viewer.db.rpc('get_lesson_reminder_preference');
  const preference = error ? null : parseLessonReminderPreference(data);
  return (
    <AccountPageFrame>
      <>
        <AccountBackLink locale={locale} />
        <ScreenTitle
          eyebrow={ar ? 'حسابك' : 'Your account'}
          title={ar ? 'الإشعارات' : 'Notifications'}
          description={
            ar
              ? 'اختر متى تصلك تذكيرات الحصص على بريدك الإلكتروني.'
              : 'Choose when lesson reminders reach your email.'
          }
        />
        <Panel className="mx-auto max-w-2xl">
          {preference ? (
            <ReminderPreferenceForm locale={locale} initial={preference} />
          ) : (
            <EmptyState>
              {ar
                ? 'تعذر تحميل التفضيلات. حدّث الصفحة وحاول مرة أخرى.'
                : 'We could not load your preferences. Refresh the page and try again.'}
            </EmptyState>
          )}
        </Panel>
      </>
    </AccountPageFrame>
  );
}
