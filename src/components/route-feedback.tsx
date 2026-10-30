'use client';

import { startTransition } from 'react';
import { useParams, useRouter } from 'next/navigation';

type RouteArea = 'discovery' | 'group' | 'groupSetup' | 'page';
const copy = {
  en: {
    discoveryLoading: 'Loading groups…',
    groupLoading: 'Loading group details…',
    setupLoading: 'Loading group setup…',
    pageLoading: 'Loading page…',
    discoveryError: 'We could not load discovery right now.',
    groupError: 'We could not load this group right now.',
    setupError: 'We could not load this group setup right now.',
    pageError: 'We could not load this page right now.',
    pageHint: 'Please try again in a moment.',
    retry: 'Try again',
  },
  ar: {
    discoveryLoading: 'جارٍ تحميل المجموعات…',
    groupLoading: 'جارٍ تحميل تفاصيل المجموعة…',
    setupLoading: 'جارٍ تحميل إعداد المجموعة…',
    pageLoading: 'جارٍ تحميل الصفحة…',
    discoveryError: 'تعذر تحميل صفحة المجموعات الآن.',
    groupError: 'تعذر تحميل هذه المجموعة الآن.',
    setupError: 'تعذر تحميل إعداد هذه المجموعة الآن.',
    pageError: 'تعذر تحميل هذه الصفحة الآن.',
    pageHint: 'يرجى المحاولة مرة أخرى بعد قليل.',
    retry: 'حاول مرة أخرى',
  },
};

function useRouteCopy() {
  const params = useParams<{ locale?: string }>();
  return copy[params.locale === 'ar' ? 'ar' : 'en'];
}

export function RouteLoading({ area }: { area: RouteArea }) {
  const t = useRouteCopy();
  const text =
    area === 'discovery'
      ? t.discoveryLoading
      : area === 'group'
        ? t.groupLoading
        : area === 'page'
          ? t.pageLoading
          : t.setupLoading;
  return (
    <section className="container py-16" role="status" aria-live="polite" aria-busy="true">
      <div className="mx-auto max-w-3xl animate-pulse rounded-2xl border border-line bg-white p-6 text-sm font-bold text-muted">
        {text}
      </div>
    </section>
  );
}

export function RouteError({ area, retry }: { area: RouteArea; retry: () => void }) {
  const t = useRouteCopy();
  const router = useRouter();
  const text =
    area === 'discovery'
      ? t.discoveryError
      : area === 'group'
        ? t.groupError
        : area === 'page'
          ? t.pageError
          : t.setupError;
  const retryRoute = () =>
    startTransition(() => {
      router.refresh();
      retry();
    });
  return (
    <section className="container py-16" role="alert">
      <div className="mx-auto max-w-3xl rounded-2xl border border-danger/30 bg-danger-soft p-6">
        {area === 'page' ? (
          <>
            <h1 className="text-xl font-bold leading-snug text-danger">{text}</h1>
            <p className="mt-2 text-sm leading-6 text-danger">{t.pageHint}</p>
          </>
        ) : (
          <p className="text-sm text-danger">{text}</p>
        )}
        <button
          type="button"
          onClick={retryRoute}
          className="mt-4 min-h-11 rounded-xl bg-teal px-4 py-2.5 font-bold text-white transition hover:bg-[#164d47] focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-orange focus-visible:ring-offset-2"
        >
          {t.retry}
        </button>
      </div>
    </section>
  );
}
