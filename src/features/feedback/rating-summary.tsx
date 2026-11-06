export function RatingSummary({
  average,
  count,
  locale,
}: {
  average?: number | null;
  count?: number | null;
  locale: string;
}) {
  if (
    !Number.isFinite(average) ||
    (average as number) < 1 ||
    (average as number) > 5 ||
    !Number.isSafeInteger(count) ||
    (count as number) < 3
  )
    return null;
  const ar = locale === 'ar';
  const numberLocale = ar ? 'ar-EG' : 'en-GB';
  const score = new Intl.NumberFormat(numberLocale, {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  }).format(average as number);
  const reviews = new Intl.NumberFormat(numberLocale).format(count as number);
  const label = ar
    ? `تقييم المعلم: ${score} من ٥، ${reviews} تقييمات`
    : `Teacher rating: ${score} out of 5, ${reviews} reviews`;
  return (
    <span
      className="inline-flex max-w-full flex-wrap items-center gap-1.5 rounded-full bg-orange/10 px-3 py-1 text-sm font-bold text-ink-soft"
      aria-label={label}
    >
      <span aria-hidden="true" className="text-orange">
        ★
      </span>
      <span>{ar ? 'تقييم المعلم' : 'Teacher rating'}</span>
      <span aria-hidden="true">·</span>
      <span>{score} / 5</span>
      <span>
        ({reviews} {ar ? 'تقييمات' : 'reviews'})
      </span>
    </span>
  );
}
