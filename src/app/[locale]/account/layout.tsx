import { ensureLocale } from '@/i18n/config';
import { OptionalWorkspaceLayout } from '@/components/platform/optional-workspace-layout';

export default async function AccountLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale: raw } = await params;
  return <OptionalWorkspaceLayout locale={ensureLocale(raw)}>{children}</OptionalWorkspaceLayout>;
}
