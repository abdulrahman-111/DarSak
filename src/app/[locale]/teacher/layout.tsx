import { Suspense } from 'react';
import type { Metadata } from 'next';
import { ensureLocale } from '@/i18n/config';
import { requireViewer } from '@/components/platform/access';
import { PlatformShell } from '@/components/platform/shell';
import { WorkspaceLoading } from '@/components/platform/workspace-loading';
import { TeacherSubscriptionNotice } from '@/features/teacher-access/subscription-notice';
export const maxDuration = 40;

export const metadata: Metadata = { robots: { index: false, follow: false } };

/**
 * The layout itself never waits on the network: it streams the workspace frame (sidebar and a
 * page-shaped placeholder) at once and resolves the signed-in teacher inside a Suspense boundary.
 * The unread badge is no longer read here; the header bell publishes it to the nav from the
 * viewer snapshot, which removes one database round trip from every teacher navigation.
 */
async function TeacherShell({
  locale,
  children,
}: {
  locale: ReturnType<typeof ensureLocale>;
  children: React.ReactNode;
}) {
  const me = await requireViewer(locale, 'teacher');
  return (
    <PlatformShell locale={locale} role="teacher" name={me.fullName}>
      <TeacherSubscriptionNotice locale={locale} signedInTeacher compact />
      {children}
    </PlatformShell>
  );
}

export default async function TeacherLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale: raw } = await params;
  const locale = ensureLocale(raw);
  return (
    <Suspense
      fallback={
        <PlatformShell locale={locale} role="teacher" name="">
          <WorkspaceLoading />
        </PlatformShell>
      }
    >
      <TeacherShell locale={locale}>{children}</TeacherShell>
    </Suspense>
  );
}
