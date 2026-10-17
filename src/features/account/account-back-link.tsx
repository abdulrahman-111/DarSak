import Link from 'next/link';

export function AccountBackLink({ locale }: { locale: string }) {
  const ar = locale === 'ar';
  return <Link href={`/${locale}/account`} className="mb-5 inline-flex min-h-10 items-center rounded-xl border border-line bg-white px-4 text-sm font-bold text-teal underline-offset-4 hover:underline">{ar ? 'العودة إلى الحساب' : 'Back to Account'}</Link>;
}
