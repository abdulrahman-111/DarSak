'use client';

import { useEffect, useState } from 'react';
import { ArrowDown } from 'lucide-react';

// On phones the request panel sits below a long page. This bar keeps the next step in reach and
// jumps to that panel (the single place where enrollment actually happens). It hides once the
// panel is visible so the two never compete.
export function GroupRequestBar({
  targetId,
  label,
  detail,
}: {
  targetId: string;
  label: string;
  detail?: string;
}) {
  const [targetVisible, setTargetVisible] = useState(false);

  useEffect(() => {
    const target = document.getElementById(targetId);
    if (!target || typeof IntersectionObserver === 'undefined') return;
    const observer = new IntersectionObserver(([entry]) => setTargetVisible(entry.isIntersecting), {
      threshold: 0.15,
    });
    observer.observe(target);
    return () => observer.disconnect();
  }, [targetId]);

  const jump = () => {
    const target = document.getElementById(targetId);
    if (!target) return;
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    target.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'start' });
    target.querySelector<HTMLElement>('a, button')?.focus({ preventScroll: true });
  };

  return (
    <div
      aria-hidden={targetVisible}
      className={`group-request-bar fixed inset-x-0 z-30 border-t border-line bg-surface/95 px-4 py-3 shadow-[0_-8px_24px_rgba(14,74,75,.08)] backdrop-blur-lg transition-transform duration-200 lg:hidden ${targetVisible ? 'pointer-events-none translate-y-full' : 'translate-y-0'}`}
    >
      <div className="mx-auto flex max-w-xl items-center gap-3">
        {detail && (
          <p className="min-w-0 flex-1 truncate text-sm font-semibold text-teal">{detail}</p>
        )}
        <button
          type="button"
          tabIndex={targetVisible ? -1 : 0}
          onClick={jump}
          className={`inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-orange px-4 text-sm font-bold text-white transition-colors hover:bg-orange-deep focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal focus-visible:ring-offset-2 ${detail ? 'shrink-0' : 'w-full'}`}
        >
          {label}
          <ArrowDown size={16} aria-hidden="true" />
        </button>
      </div>
    </div>
  );
}
