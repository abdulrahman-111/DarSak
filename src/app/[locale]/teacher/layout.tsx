import { ensureLocale } from '@/i18n/config';
import { requireViewer } from '@/components/platform/access';
import { PlatformShell } from '@/components/platform/shell';

export default async function TeacherLayout({ children, params }: { children: React.ReactNode; params: Promise<{ locale: string }> }) {
  const { locale: raw } = await params; const locale = ensureLocale(raw); const me = await requireViewer(locale, 'teacher');
  return <PlatformShell locale={locale} role="teacher" name={me.fullName}>{children}</PlatformShell>;
}
