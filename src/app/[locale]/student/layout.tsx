import { Suspense } from 'react';
import type { Metadata } from 'next';
import { ensureLocale } from '@/i18n/config';
import { requireViewer } from '@/components/platform/access';
import { PlatformShell } from '@/components/platform/shell';
import { WorkspaceLoading } from '@/components/platform/workspace-loading';

export const metadata: Metadata = { robots: { index: false, follow: false } };

async function StudentShell({
  locale,
  children,
}: {
  locale: ReturnType<typeof ensureLocale>;
  children: React.ReactNode;
}) {
  const me = await requireViewer(locale, 'student');
  return (
    <PlatformShell locale={locale} role="student" name={me.fullName}>
      {children}
    </PlatformShell>
  );
}

export default async function StudentLayout({
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
        <PlatformShell locale={locale} role="student" name="">
          <WorkspaceLoading />
        </PlatformShell>
      }
    >
      <StudentShell locale={locale}>{children}</StudentShell>
    </Suspense>
  );
}
