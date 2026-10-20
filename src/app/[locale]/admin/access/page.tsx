import { redirect } from 'next/navigation';
import { ensureLocale } from '@/i18n/config';
import { requireViewer } from '@/components/platform/access';

export default async function AdminTeacherAccess({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale: raw } = await params;
  const locale = ensureLocale(raw);
  await requireViewer(locale, 'admin');
  redirect(`/${locale}/admin/teachers?status=all`);
}
