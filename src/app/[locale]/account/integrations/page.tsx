import { notFound } from 'next/navigation';
import { requireViewer } from '@/components/platform/access';
import { Panel, ScreenTitle } from '@/components/platform/ui';
import { ensureLocale } from '@/i18n/config';
import { getGoogleMeetStatus } from '@/features/meet/data';
import { getGoogleMeetConfig, isGoogleMeetPilotEnabled } from '@/features/meet/config';
import { GoogleMeetAccountView } from '@/features/meet/views';

const resultCodes = new Set([
  'connected',
  'cancelled',
  'permission_denied',
  'reconnect_required',
  'invalid_flow',
  'connection_failed',
  'disabled',
]);

export default async function AccountIntegrationsPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const [{ locale: raw }, query] = await Promise.all([params, searchParams]);
  const locale = ensureLocale(raw);
  const ar = locale === 'ar';
  const viewer = await requireViewer(locale);
  if (viewer.role !== 'teacher') notFound();

  const enabled = isGoogleMeetPilotEnabled();
  const oauthEnabled = getGoogleMeetConfig() !== null;
  const status = enabled ? (await getGoogleMeetStatus()).data : null;
  const rawResult = Array.isArray(query.google_meet) ? query.google_meet[0] : query.google_meet;
  const resultCode = rawResult && resultCodes.has(rawResult) ? rawResult : undefined;

  return (
    <div>
      <ScreenTitle
        eyebrow={ar ? 'حسابك' : 'Your account'}
        title={ar ? 'التكاملات' : 'Integrations'}
        description={
          ar
            ? 'إدارة اتصال Google Meet وروابط اجتماعات الحصص.'
            : 'Manage Google Meet connection and lesson meeting links.'
        }
      />
      <GoogleMeetAccountView
        locale={locale}
        enabled={enabled}
        oauthEnabled={oauthEnabled}
        status={status}
        resultCode={resultCode}
      />
      {enabled && !oauthEnabled && (
        <Panel className="mt-6">
          <h2 className="font-black text-teal">
            {ar ? 'روابط الاجتماعات اليدوية' : 'Manual meeting links'}
          </h2>
          <p className="mt-2 text-sm leading-6 text-muted">
            {ar
              ? 'افتح صفحة الحصة لإضافة رابط HTTPS أو مسحه. لا يظهر رابط للطلاب المقبولين إلا عندما يسمح سجل الحصة بذلك.'
              : 'Open a lesson page to add or clear an HTTPS link. Accepted students only see a link when the lesson record allows it.'}
          </p>
        </Panel>
      )}
    </div>
  );
}
