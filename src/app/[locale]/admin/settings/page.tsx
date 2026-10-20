import { ensureLocale } from '@/i18n/config';
import { requireViewer } from '@/components/platform/access';
import { AdminForm } from '@/features/admin/forms';
import { EmptyState, Panel, ScreenTitle } from '@/components/platform/ui';

export default async function AdminSettings({ params }: { params: Promise<{ locale: string }> }) {
  const { locale: raw } = await params;
  const locale = ensureLocale(raw),
    ar = locale === 'ar';
  const me = await requireViewer(locale, 'admin');
  const settings = await me.db.from('platform_settings').select('key,value').order('key');
  return (
    <>
      <ScreenTitle
        eyebrow={ar ? 'إعدادات داخلية' : 'Internal configuration'}
        title={ar ? 'إعدادات المنصة' : 'Platform settings'}
        description={
          ar
            ? 'إعدادات داخلية لخيارات المنصة. لا تغيّر هذه الإعدادات صلاحيات الحسابات.'
            : 'For internal platform options. These settings do not change account permissions.'
        }
      />
      <div className="grid items-start gap-6 xl:grid-cols-[360px_1fr]">
        <Panel>
          <h2 className="mb-4 font-black text-teal">{ar ? 'إضافة إعداد' : 'Add setting'}</h2>
          <AdminForm
            locale={locale}
            operation="setting"
            fields={[
              { name: 'key', label: ar ? 'المفتاح' : 'Key', required: true },
              {
                name: 'value',
                label: ar ? 'قيمة JSON' : 'JSON value',
                type: 'textarea',
                required: true,
              },
            ]}
          />
        </Panel>
        <div className="grid gap-4">
          {settings.error ? (
            <Panel>
              <p role="alert" className="text-sm text-red-800">
                {ar
                  ? 'تعذر تحميل الإعدادات. حدّث الصفحة وحاول مرة أخرى.'
                  : 'Could not load settings. Refresh and try again.'}
              </p>
              <a
                href={`/${locale}/admin/settings?retry=1`}
                className="mt-3 inline-flex font-bold text-orange underline"
              >
                {ar ? 'إعادة المحاولة' : 'Try again'}
              </a>
            </Panel>
          ) : settings.data?.length ? (
            settings.data.map(setting => (
              <Panel key={setting.key}>
                <AdminForm
                  locale={locale}
                  operation="setting"
                  fields={[
                    {
                      name: 'key',
                      label: ar ? 'المفتاح' : 'Key',
                      value: setting.key,
                      required: true,
                    },
                    {
                      name: 'value',
                      label: ar ? 'قيمة JSON' : 'JSON value',
                      value: JSON.stringify(setting.value, null, 2),
                      type: 'textarea',
                      required: true,
                    },
                  ]}
                />
              </Panel>
            ))
          ) : (
            <EmptyState>{ar ? 'لا توجد إعدادات.' : 'No settings found.'}</EmptyState>
          )}
        </div>
      </div>
    </>
  );
}
