'use client';

import { useParams } from 'next/navigation';

/** Page-shaped placeholder shown inside the workspace shell while a student page loads. */
export function WorkspaceLoading() {
  const params = useParams<{ locale?: string }>();
  const ar = params.locale === 'ar';
  const bar = 'rounded-lg bg-line/70';
  return (
    <div role="status" aria-live="polite" aria-busy="true" className="animate-pulse">
      <span className="sr-only">{ar ? 'جارٍ تحميل الصفحة…' : 'Loading page…'}</span>
      <div aria-hidden="true">
        <div className={`${bar} mb-3 h-3 w-40`} />
        <div className={`${bar} mb-3 h-8 w-64 max-w-full`} />
        <div className={`${bar} mb-6 h-4 w-96 max-w-full`} />
        <div className="mb-6 h-48 rounded-3xl bg-teal/10" />
        <div className="grid gap-4 sm:grid-cols-2">
          {[0, 1].map(item => (
            <div key={item} className="rounded-2xl border border-line bg-white p-5">
              <div className={`${bar} size-11`} />
              <div className={`${bar} mt-4 h-4 w-3/4`} />
              <div className={`${bar} mt-2 h-3 w-1/2`} />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
