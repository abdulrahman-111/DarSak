import { notFound } from 'next/navigation';
import { ensureLocale } from '@/i18n/config';
import { publicGroupSeo } from '@/features/seo/public-entity-data';
import { entityImageSize, entityShareImage } from '@/features/seo/share-image';

export const size = entityImageSize;
export const contentType = 'image/png';
export const alt = 'DarSak learning group';
export const revalidate = 60;

export default async function GroupShareImage({
  params,
}: {
  params: Promise<{ locale: string; id: string }>;
}) {
  const { locale: raw, id } = await params;
  const locale = ensureLocale(raw);
  const result = await publicGroupSeo(locale, id);
  if (result.kind === 'missing') notFound();
  if (result.kind === 'unavailable')
    return new Response(null, { status: 503, headers: { 'Cache-Control': 'no-store' } });
  return entityShareImage(locale, result.data.name, result.data.subject);
}
