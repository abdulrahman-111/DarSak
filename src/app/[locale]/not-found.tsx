'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { defaultLocale, isLocale } from '@/i18n/config';

const copy = {
  en: {
    heading: 'Page not found',
    explanation: 'The page you are looking for may have moved or is unavailable.',
    home: 'Home',
  },
  ar: {
    heading: 'الصفحة غير موجودة',
    explanation: 'قد تكون الصفحة التي تبحث عنها قد انتقلت أو لم تعد متاحة.',
    home: 'الرئيسية',
  },
} as const;

export default function NotFound() {
  const params = useParams<{ locale?: string }>();
  const locale = params?.locale && isLocale(params.locale) ? params.locale : defaultLocale;
  const direction = locale === 'ar' ? 'rtl' : 'ltr';
  const text = copy[locale];

  return (
    <section
      dir={direction}
      aria-labelledby="not-found-heading"
      className="mx-auto flex min-h-[60vh] max-w-3xl flex-col items-center justify-center gap-4 px-6 py-16 text-center"
    >
      <h1 id="not-found-heading" className="text-3xl font-bold">
        {text.heading}
      </h1>
      <p className="max-w-xl text-ink-soft">{text.explanation}</p>
      <Link
        href={`/${locale}`}
        className="rounded-xl bg-teal px-5 py-3 font-bold text-white focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-orange focus-visible:ring-offset-2"
      >
        {text.home}
      </Link>
    </section>
  );
}
