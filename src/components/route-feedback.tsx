'use client';

import { useParams } from 'next/navigation';

type RouteArea = 'discovery' | 'group' | 'groupSetup';

const copy = {
  en: {
    discoveryLoading: 'Loading groups…',
    groupLoading: 'Loading group details…',
    setupLoading: 'Loading group setup…',
    discoveryError: 'We could not load discovery right now.',
    groupError: 'We could not load this group right now.',
    setupError: 'We could not load this group setup right now.',
    retry: 'Try again',
  },
  ar: {
    discoveryLoading: 'جارٍ تحميل المجموعات…',
    groupLoading: 'جارٍ تحميل تفاصيل المجموعة…',
    setupLoading: 'جارٍ تحميل إعداد المجموعة…',
    discoveryError: 'تعذر تحميل صفحة المجموعات الآن.',
    groupError: 'تعذر تحميل هذه المجموعة الآن.',
    setupError: 'تعذر تحميل إعداد هذه المجموعة الآن.',
    retry: 'حاول مرة أخرى',
  },
};

function useRouteCopy() {
  const params = useParams<{ locale?: string }>();
  return copy[params.locale === 'ar' ? 'ar' : 'en'];
}

export function RouteLoading({ area }: { area: RouteArea }) {
  const t = useRouteCopy();
  const text = area === 'discovery' ? t.discoveryLoading : area === 'group' ? t.groupLoading : t.setupLoading;
  return <section className="container py-16" role="status" aria-live="polite" aria-busy="true">
    <div className="mx-auto max-w-3xl animate-pulse rounded-2xl border border-line bg-white p-6 text-sm font-bold text-muted">{text}</div>
  </section>;
}

export function RouteError({ area, retry }: { area: RouteArea; retry: () => void }) {
  const t = useRouteCopy();
  const text = area === 'discovery' ? t.discoveryError : area === 'group' ? t.groupError : t.setupError;
  return <section className="container py-16" role="alert">
    <div className="mx-auto max-w-3xl rounded-2xl border border-red-200 bg-red-50 p-6">
      <p className="text-sm text-red-800">{text}</p>
      <button type="button" onClick={retry} className="mt-4 rounded-xl bg-teal px-4 py-2.5 font-bold text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange">{t.retry}</button>
    </div>
  </section>;
}
