import { ensureLocale } from '@/i18n/config';
import { requireViewer } from '@/components/platform/access';
import { PlatformShell } from '@/components/platform/shell';

export default async function StudentLayout({ children, params }: { children: React.ReactNode; params: Promise<{ locale: string }> }) {
  const { locale: raw } = await params; const locale = ensureLocale(raw); const me = await requireViewer(locale, 'student');
  return <PlatformShell locale={locale} role="student" name={me.fullName}>{children}</PlatformShell>;
}
