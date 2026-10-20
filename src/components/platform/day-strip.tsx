'use client';

import Link from 'next/link';
import { useEffect, useRef } from 'react';

export type DayStripItem = {
  href: string;
  date: string;
  label: string;
  dateLabel: string;
  selected?: boolean;
  current?: boolean;
  detail?: React.ReactNode;
};

export function DayStrip({
  label,
  locale,
  items,
  selectedStyle = 'bg-teal text-white',
  selectedLabel,
  currentLabel,
}: {
  label: string;
  locale: string;
  items: DayStripItem[];
  selectedStyle?: string;
  selectedLabel: string;
  currentLabel: string;
}) {
  const rail = useRef<HTMLDivElement>(null);
  const initialDate =
    items.find(item => item.selected)?.date ?? items.find(item => item.current)?.date ?? null;
  useEffect(() => {
    const container = rail.current;
    const target = initialDate
      ? container?.querySelector<HTMLElement>(`[data-initial-day="${initialDate}"]`)
      : null;
    if (!container || !target || container.scrollWidth <= container.clientWidth) return;
    const containerBounds = container.getBoundingClientRect();
    const targetBounds = target.getBoundingClientRect();
    const horizontalDelta =
      targetBounds.left +
      targetBounds.width / 2 -
      (containerBounds.left + containerBounds.width / 2);
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    container.scrollBy({ left: horizontalDelta, behavior: reduced ? 'instant' : 'smooth' });
  }, [initialDate]);

  return (
    <nav aria-label={label} className="min-w-0 max-w-full">
      <div
        ref={rail}
        dir={locale === 'ar' ? 'rtl' : 'ltr'}
        className="max-w-full snap-x snap-mandatory overflow-x-auto overscroll-x-contain scroll-smooth pb-1 focus-visible:outline-none"
      >
        <div className="grid min-w-[34rem] grid-cols-7 gap-2 sm:min-w-0">
          {items.map(item => (
            <Link
              key={item.date}
              href={item.href}
              dir={locale === 'ar' ? 'rtl' : 'ltr'}
              aria-label={`${item.label}, ${item.dateLabel}${item.selected ? `, ${selectedLabel}` : item.current ? `, ${currentLabel}` : ''}`}
              aria-current={item.selected ? 'date' : undefined}
              data-initial-day={item.selected || item.current ? item.date : undefined}
              className={`relative flex min-h-16 min-w-0 snap-start flex-col items-start justify-center gap-0.5 rounded-xl border p-2 text-start focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange sm:p-3 ${item.selected ? `border-teal ${selectedStyle}` : item.current ? 'border-orange bg-orange/5 text-teal' : 'border-line bg-white text-teal hover:border-orange/60'}`}
            >
              <strong className="block max-w-full truncate text-xs font-bold sm:text-sm">
                {item.label}
              </strong>
              <span className="block max-w-full truncate text-[11px] opacity-80 sm:text-xs">
                {item.dateLabel}
              </span>
              {item.current && !item.selected && (
                <span
                  aria-hidden="true"
                  className="absolute end-2 top-2 size-1.5 rounded-full bg-orange"
                />
              )}
              {item.detail && (
                <span className="block max-w-full truncate text-[10px] font-medium opacity-80 sm:text-xs">
                  {item.detail}
                </span>
              )}
            </Link>
          ))}
        </div>
      </div>
    </nav>
  );
}
