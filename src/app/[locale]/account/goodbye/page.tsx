import { ensureLocale, getDictionary } from '@/i18n/config';
export default async function GoodbyePage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale: raw } = await params;
  const locale = ensureLocale(raw);
  const c = (await getDictionary(locale)).accountDeletion;
  return (
    <section className="container max-w-2xl py-20 text-center">
      <h1 className="text-3xl font-black">{c.goodbyeTitle}</h1>
      <p className="mt-5 text-muted">{c.goodbye}</p>
    </section>
  );
}
