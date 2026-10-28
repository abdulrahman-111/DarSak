'use client';

import { useParams } from 'next/navigation';

export type TeacherSkeletonVariant = 'dashboard' | 'list' | 'cards' | 'calendar' | 'detail';

const bar = 'rounded-lg bg-line/70';

function Title() {
  return (
    <div className="mb-6 min-w-0 space-y-3">
      <div className={`${bar} h-3 w-32`} />
      <div className={`${bar} h-8 w-56 max-w-full sm:h-9`} />
      <div className={`${bar} h-4 w-80 max-w-full`} />
    </div>
  );
}

function Card({ lines = 2 }: { lines?: number }) {
  return (
    <div className="rounded-2xl border border-line bg-white p-5 shadow-sm">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0 flex-1 space-y-2">
          <div className={`${bar} h-3 w-24`} />
          <div className={`${bar} h-5 w-2/3`} />
        </div>
        <div className={`${bar} h-7 w-20 rounded-full`} />
      </div>
      {Array.from({ length: lines }, (_, index) => (
        <div key={index} className={`${bar} mt-3 h-3 ${index % 2 ? 'w-1/2' : 'w-5/6'}`} />
      ))}
      <div className={`${bar} mt-4 h-11 w-full sm:w-40`} />
    </div>
  );
}

/**
 * Page-shaped placeholders for the teacher workspace. Each variant reserves roughly the height
 * of the real screen so content streaming in does not shift the layout, and announces a polite
 * loading status once. `animate-pulse` is neutralised by the global reduced-motion rule.
 */
export function TeacherSkeleton({ variant }: { variant: TeacherSkeletonVariant }) {
  const params = useParams<{ locale?: string }>();
  const ar = params.locale === 'ar';
  return (
    <div role="status" aria-live="polite" aria-busy="true" className="animate-pulse">
      <span className="sr-only">{ar ? 'جارٍ تحميل الصفحة…' : 'Loading page…'}</span>
      <div aria-hidden="true">
        {variant === 'dashboard' && (
          <>
            <Title />
            <div className="mb-6 h-56 rounded-3xl bg-teal/10" />
            <div className="grid gap-5 xl:grid-cols-2">
              <Card lines={3} />
              <Card lines={3} />
            </div>
          </>
        )}
        {variant === 'list' && (
          <>
            <Title />
            <div className={`${bar} mb-4 h-24 w-full rounded-2xl`} />
            <div className="grid gap-3">
              {[0, 1, 2, 3].map(item => (
                <div key={item} className="rounded-2xl border border-line bg-white p-4">
                  <div className={`${bar} h-4 w-1/2`} />
                  <div className={`${bar} mt-2 h-3 w-1/3`} />
                </div>
              ))}
            </div>
          </>
        )}
        {variant === 'cards' && (
          <>
            <Title />
            <div className="grid gap-4 md:grid-cols-2">
              {[0, 1, 2, 3].map(item => (
                <Card key={item} lines={1} />
              ))}
            </div>
          </>
        )}
        {variant === 'calendar' && (
          <>
            <Title />
            <div className="mb-4 grid grid-cols-7 gap-2">
              {Array.from({ length: 7 }, (_, item) => (
                <div key={item} className={`${bar} h-14 rounded-xl`} />
              ))}
            </div>
            <div className="grid gap-3">
              {[0, 1, 2].map(item => (
                <div key={item} className="rounded-2xl border border-line bg-white p-4">
                  <div className={`${bar} h-4 w-2/5`} />
                  <div className={`${bar} mt-2 h-3 w-1/3`} />
                </div>
              ))}
            </div>
          </>
        )}
        {variant === 'detail' && (
          <>
            <Title />
            <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_320px]">
              <div className="space-y-5">
                <Card lines={3} />
                <Card lines={2} />
              </div>
              <Card lines={4} />
            </div>
          </>
        )}
      </div>
    </div>
  );
}
