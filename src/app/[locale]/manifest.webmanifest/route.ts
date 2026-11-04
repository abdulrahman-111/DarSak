import { localizedManifest, PWA_LOCALES } from '@/features/pwa/manifest';

export const dynamic = 'force-static';

export function generateStaticParams() {
  return PWA_LOCALES.map(locale => ({ locale }));
}

export async function GET(_request: Request, { params }: { params: Promise<{ locale: string }> }) {
  return Response.json(localizedManifest((await params).locale), {
    headers: { 'Content-Type': 'application/manifest+json; charset=utf-8' },
  });
}
