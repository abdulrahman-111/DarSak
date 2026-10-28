'use client';

import { useParams } from 'next/navigation';

/**
 * Route-shaped placeholders for the student workspace. Each one reserves the same blocks the
 * real page renders (heading, cards, side column) so content replaces it without shifting.
 */
const bar = 'rounded-lg bg-line/70';
const card = 'rounded-2xl border border-line bg-white p-5 shadow-sm';

function Heading() {
  return (
    <div className="mb-6">
      <div className={`${bar} mb-3 h-3 w-40`} />
      <div className={`${bar} mb-3 h-8 w-64 max-w-full`} />
      <div className={`${bar} h-4 w-96 max-w-full`} />
    </div>
  );
}
function Row() {
  return (
    <div className={`${card} flex items-center gap-4`}>
      <div className={`${bar} size-11 shrink-0`} />
      <div className="min-w-0 flex-1">
        <div className={`${bar} h-4 w-2/3`} />
        <div className={`${bar} mt-2 h-3 w-1/3`} />
      </div>
      <div className={`${bar} h-6 w-20 shrink-0 rounded-full`} />
    </div>
  );
}

export function StudentRouteLoading({
  variant,
}: {
  variant: 'dashboard' | 'list' | 'detail' | 'cards';
}) {
  const params = useParams<{ locale?: string }>();
  const ar = params.locale === 'ar';
  return (
    <div role="status" aria-live="polite" aria-busy="true" className="animate-pulse">
      <span className="sr-only">{ar ? 'جارٍ تحميل الصفحة…' : 'Loading page…'}</span>
      <div aria-hidden="true">
        {variant === 'dashboard' && (
          <>
            <Heading />
            <div className="grid gap-6 xl:grid-cols-[minmax(0,1.7fr)_minmax(260px,1fr)]">
              <div className="grid content-start gap-6">
                <div className="h-72 rounded-3xl bg-teal/10 sm:h-64" />
                <div className="grid gap-4 sm:grid-cols-2">
                  {[0, 1].map(item => (
                    <div key={item} className={`${card} h-36`}>
                      <div className={`${bar} size-11`} />
                      <div className={`${bar} mt-4 h-4 w-3/4`} />
                    </div>
                  ))}
                </div>
              </div>
              <div className="grid content-start gap-5">
                <div className={`${card} h-48`} />
                <div className={`${card} h-56`} />
              </div>
            </div>
          </>
        )}
        {variant === 'list' && (
          <>
            <Heading />
            <div className="grid gap-3">
              {[0, 1, 2].map(item => (
                <Row key={item} />
              ))}
            </div>
          </>
        )}
        {variant === 'cards' && (
          <>
            <Heading />
            <div className="grid gap-4 sm:grid-cols-2">
              {[0, 1, 2, 3].map(item => (
                <div key={item} className={`${card} h-40`}>
                  <div className={`${bar} h-4 w-3/4`} />
                  <div className={`${bar} mt-3 h-3 w-1/2`} />
                  <div className={`${bar} mt-6 h-10 w-32 rounded-xl`} />
                </div>
              ))}
            </div>
          </>
        )}
        {variant === 'detail' && (
          <>
            <div className={`${bar} mb-5 h-5 w-32`} />
            <Heading />
            <div className="mb-6 flex gap-2 border-b border-line pb-1">
              {[0, 1, 2].map(item => (
                <div key={item} className={`${bar} h-11 w-24 rounded-b-none`} />
              ))}
            </div>
            <div className="grid gap-5 xl:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]">
              <div className={`${card} h-48`} />
              <div className={`${card} h-48`} />
            </div>
          </>
        )}
      </div>
    </div>
  );
}
