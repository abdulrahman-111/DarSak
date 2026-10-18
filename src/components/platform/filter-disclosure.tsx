import { SlidersHorizontal } from 'lucide-react';

export function FilterDisclosure({ label, activeCount, activeLabel, children }: { label: string; activeCount: number; activeLabel: string; children: React.ReactNode }) {
  return <details className="rounded-xl border border-line bg-white p-3 md:border-0 md:bg-transparent md:p-0">
    <summary className="flex min-h-11 cursor-pointer list-none items-center gap-2 rounded-xl font-bold text-teal focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange [&::-webkit-details-marker]:hidden">
      <SlidersHorizontal aria-hidden="true" size={18}/>
      <span>{label}</span>
      {activeCount > 0 && <span className="rounded-full bg-teal/10 px-2 py-1 text-xs font-bold text-teal" aria-label={`${activeCount} ${activeLabel}`}>{activeCount} {activeLabel}</span>}
      <span aria-hidden="true" className="ms-auto text-sm">⌄</span>
    </summary>
    <div className="pt-3 md:pt-2">{children}</div>
  </details>;
}
