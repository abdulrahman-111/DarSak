import { redirect } from 'next/navigation';
import { ensureLocale } from '@/i18n/config';
import { requireViewer, roleHome } from '@/components/platform/access';

export default async function Dashboard({ params }: { params: Promise<{ locale: string }> }) {
  const { locale: raw } = await params;
  const locale = ensureLocale(raw);
  const me = await requireViewer(locale);
  redirect(roleHome(locale, me.role));
}
