import type { Metadata } from 'next';
import { ensureLocale } from '@/i18n/config';
import { requireViewer } from '@/components/platform/access';
import { PlatformShell } from '@/components/platform/shell';

export const metadata: Metadata = { robots: { index: false, follow: false } };

export default async function StudentLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale: raw } = await params;
  const locale = ensureLocale(raw);
  const me = await requireViewer(locale, 'student');
  return (
    // The unread badge is not read here: the header bell already loads the count and publishes it
    // to the sidebar, so the layout needs no third sequential round trip before it can stream.
    <PlatformShell locale={locale} role="student" name={me.fullName}>
      {children}
    </PlatformShell>
  );
}
