import { redirect } from 'next/navigation';

export default async function LegacyClassDetail({ params }: { params: Promise<{ locale: 'ar' | 'en'; id: string }> }) {
  const { locale, id } = await params;
  redirect(`/${locale}/groups/${id}`);
}
