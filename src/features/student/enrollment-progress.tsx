import type { Locale } from './domain';

export function EnrollmentProgress({
  locale,
  current,
}: {
  locale: Locale;
  current: 'requested' | 'accepted';
}) {
  const ar = locale === 'ar';
  const activeIndex = current === 'requested' ? 0 : 1;
  const labels = ar
    ? ['تم إرسال الطلب', 'تم القبول', 'تواصل مع المعلم']
    : ['Request sent', 'Accepted', 'Contact teacher'];
  const states = ar
    ? [current === 'accepted' ? 'مكتمل' : 'الخطوة الحالية', 'الخطوة الحالية', 'الخطوة التالية']
    : [current === 'accepted' ? 'Complete' : 'Current step', 'Current step', 'Up next'];
  if (current === 'requested') states[1] = ar ? 'الخطوة التالية' : 'Up next';
  return (
    <ol
      aria-label={ar ? 'خطوات الانضمام' : 'Enrollment steps'}
      className="mt-5 grid grid-cols-3 gap-2"
    >
      {labels.map((label, index) => (
        <li
          key={label}
          aria-current={index === activeIndex ? 'step' : undefined}
          className={`min-w-0 rounded-xl px-3 py-2 text-xs ${index === activeIndex ? 'bg-teal/10 font-bold text-teal' : 'bg-cream text-muted'}`}
        >
          <span className="block text-[10px] uppercase tracking-wide opacity-75">
            {states[index]}
          </span>
          <span className="mt-1 block wrap-break-word">{label}</span>
        </li>
      ))}
    </ol>
  );
}
