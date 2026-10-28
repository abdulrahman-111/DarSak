import Link from 'next/link';

/** Admin-only presentation helpers. Presentation only: no data access lives here. */

export const fieldClass =
  'min-h-11 w-full rounded-xl border border-line bg-cream px-3 py-2.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange';
export const primaryButtonClass =
  'inline-flex min-h-11 items-center justify-center rounded-xl bg-teal px-5 py-2.5 font-bold text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange focus-visible:ring-offset-2';
export const secondaryButtonClass =
  'inline-flex min-h-11 items-center justify-center rounded-xl border border-line bg-white px-4 py-2.5 text-sm font-bold text-teal hover:border-orange/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange';

type Tone = 'neutral' | 'ok' | 'warn' | 'danger' | 'info';
const tones: Record<Tone, string> = {
  neutral: 'bg-cream text-ink-soft',
  ok: 'bg-[#dcebe3] text-[#1d5a3a]',
  warn: 'bg-[#f7e6c8] text-[#7a4a0b]',
  danger: 'bg-[#f3e1db] text-[#6e2414]',
  info: 'bg-teal/10 text-teal',
};

/** Small status pill. Always carries text, so colour is never the only signal. */
export function Chip({ tone = 'neutral', children }: { tone?: Tone; children: React.ReactNode }) {
  return (
    <span
      className={`inline-flex shrink-0 items-center rounded-full px-3 py-1 text-xs font-bold ${tones[tone]}`}
    >
      {children}
    </span>
  );
}

/**
 * Collapsible row. The summary stays scannable (title, chip, one line of meta) and the
 * long content opens on demand. Native <details>, so keyboard and RTL work without script.
 */
export function Disclosure({
  title,
  chip,
  meta,
  defaultOpen = false,
  children,
}: {
  title: React.ReactNode;
  chip?: React.ReactNode;
  meta?: React.ReactNode;
  defaultOpen?: boolean;
  children: React.ReactNode;
}) {
  return (
    <details
      open={defaultOpen}
      className="group min-w-0 rounded-2xl border border-line bg-white shadow-sm"
    >
      <summary className="flex min-h-11 cursor-pointer list-none items-start gap-3 rounded-2xl p-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange [&::-webkit-details-marker]:hidden">
        <span aria-hidden="true" className="mt-1 text-teal">
          <span className="inline-block transition-transform group-open:rotate-90 rtl:hidden">
            ▸
          </span>
          <span className="hidden transition-transform group-open:-rotate-90 rtl:inline-block">
            ◂
          </span>
        </span>
        <span className="min-w-0 flex-1">
          <span className="block break-words font-black text-teal [overflow-wrap:anywhere]">
            {title}
          </span>
          {meta && (
            <span className="mt-1 block break-words text-sm text-muted [overflow-wrap:anywhere]">
              {meta}
            </span>
          )}
        </span>
        {chip}
      </summary>
      <div className="border-t border-line p-4">{children}</div>
    </details>
  );
}

/** Filters stay in view while a long list scrolls. */
export function FilterBar({ children, label }: { children: React.ReactNode; label?: string }) {
  return (
    <div
      role="group"
      aria-label={label}
      className="sticky top-0 z-10 -mx-4 mb-5 border-b border-line bg-cream/95 px-4 py-3 backdrop-blur sm:-mx-7 sm:px-7 lg:-mx-9 lg:px-9"
    >
      {children}
    </div>
  );
}

export function PillLink({
  href,
  current,
  children,
}: {
  href: string;
  current: boolean;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      aria-current={current ? 'page' : undefined}
      className={`inline-flex min-h-11 items-center rounded-full border px-4 text-sm font-bold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange ${current ? 'border-teal bg-teal text-white' : 'border-line bg-white text-teal hover:border-teal'}`}
    >
      {children}
    </Link>
  );
}

/** One pagination control for every admin list. Hrefs are built by the page. */
export function Pager({
  page,
  pageCount,
  total,
  prevHref,
  nextHref,
  labels,
  ariaLabel,
}: {
  page: number;
  pageCount: number;
  total?: number;
  prevHref: string | null;
  nextHref: string | null;
  labels: { previous: string; next: string; page: string };
  ariaLabel: string;
}) {
  if (pageCount <= 1) return null;
  return (
    <nav aria-label={ariaLabel} className="mt-6 grid grid-cols-[1fr_auto_1fr] items-center gap-3">
      <span className="justify-self-start">
        {prevHref && (
          <Link rel="prev" href={prevHref} className={secondaryButtonClass}>
            {labels.previous}
          </Link>
        )}
      </span>
      <span className="text-center text-sm text-muted">
        {labels.page} {page} / {pageCount}
        {total !== undefined && ` · ${total}`}
      </span>
      <span className="justify-self-end">
        {nextHref && (
          <Link rel="next" href={nextHref} className={secondaryButtonClass}>
            {labels.next}
          </Link>
        )}
      </span>
    </nav>
  );
}
