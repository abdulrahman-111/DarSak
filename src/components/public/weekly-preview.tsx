import Image from 'next/image';
import { publicCopy, type PublicLocale } from './copy';

const blocks = [
  // Rows are hour slots starting at 4 pm, so the grid has no empty leading rows.
  { column: '1', row: '1 / span 2', kind: 'chemistry', tone: 'bg-success-soft text-success' },
  { column: '1', row: '4 / span 2', kind: 'maths', tone: 'bg-mint text-teal' },
  { column: '2', row: '3 / span 2', kind: 'physics', tone: 'bg-[#dde5f4] text-[#1e3c78]' },
  { column: '3', row: '1 / span 2', kind: 'chemistry', tone: 'bg-success-soft text-success' },
  { column: '4', row: '4 / span 2', kind: 'maths', tone: 'bg-mint text-teal' },
] as const;

export function WeeklyPreview({ locale }: { locale: PublicLocale }) {
  const c = publicCopy[locale];
  const ar = locale === 'ar';
  const days = ar ? ['السبت', 'الأحد', 'الاثنين', 'الثلاثاء', 'الأربعاء'] : ['SAT', 'SUN', 'MON', 'TUE', 'WED'];
  const subjects = ar
    ? { chemistry: 'كيمياء ٤:٠٠ م', maths: 'رياضيات ٦:٠٠ م', physics: 'فيزياء ٥:٠٠ م' }
    : { chemistry: 'Chemistry 4:00 pm', maths: 'Maths 6:00 pm', physics: 'Physics 5:00 pm' };

  return (
    <div className="landing-preview relative pb-10" aria-label={c.thisWeek}>
      <div className="rounded-[1.4rem] border border-line bg-surface p-4 shadow-[0_30px_60px_-40px_rgba(14,74,75,.5)] sm:p-6">
        <div className="mb-4 flex items-baseline justify-between gap-3">
          <div>
            <p className="text-xs font-bold uppercase tracking-wide text-orange">{c.sampleTimetable}</p>
            <p className="mt-1 text-lg font-bold text-teal">{c.thisWeek}</p>
            <p className="mt-1 text-xs text-muted">{c.sampleNote}</p>
          </div>
          <p className="text-xs text-muted">{c.cairo}</p>
        </div>
        <div className="mb-2 grid grid-cols-5 gap-1.5 text-[10px] font-bold text-muted sm:text-xs">
          {days.map(day => <span key={day}>{day}</span>)}
        </div>
        <div className="grid grid-cols-5 grid-rows-[repeat(6,2rem)] gap-1.5 bg-[repeating-linear-gradient(to_bottom,transparent_0_37px,#efe6d6_37px_38px)] sm:grid-rows-[repeat(6,2.125rem)]">
          {blocks.map((block, index) => (
            <div
              key={`${block.kind}-${index}`}
              className={`overflow-hidden rounded-lg p-1.5 text-[10px] font-bold leading-tight sm:p-2 sm:text-xs ${block.tone}`}
              style={{ gridColumn: block.column, gridRow: block.row }}
            >
              {subjects[block.kind]}
            </div>
          ))}
          <div className="col-start-5 row-start-2 row-end-5 min-w-0 overflow-hidden rounded-lg border-2 border-dashed border-orange bg-orange/5 p-1.5 text-[10px] font-bold leading-tight text-[#83390c] sm:p-2 sm:text-xs">
            <span className="block">{ar ? 'موعد معدّل' : 'Moved'}</span><span className="mt-0.5 hidden font-semibold sm:block">{ar ? 'أدب' : 'Literature'}</span>
          </div>
        </div>
      </div>
      <div className="landing-feedback absolute bottom-0 start-2 flex max-w-[19rem] items-center gap-3 rounded-2xl bg-teal px-4 py-3 text-cream shadow-[0_20px_40px_-20px_rgba(14,74,75,.8)] sm:-start-3">
        <span className="grid size-8 flex-none place-items-center rounded-full bg-[#8fd1b5] text-teal"><Image aria-hidden="true" src="/brand/darsak/accepted-request-toast.svg" alt="" width={24} height={24}/></span>
        <div className="text-sm leading-snug"><strong>{c.accepted}</strong><p className="text-[#cfe3de]">{c.acceptedDetail}</p></div>
      </div>
    </div>
  );
}
