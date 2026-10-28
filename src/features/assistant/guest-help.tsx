import Link from 'next/link';
import type { AssistantLocale } from './domain';

export function GuestHelp({ locale }: { locale: AssistantLocale }): React.JSX.Element {
  const ar = locale === 'ar';
  const links = [
    { href: `/${locale}/help`, label: ar ? 'المساعدة العامة' : 'Public help' },
    { href: `/${locale}/login`, label: ar ? 'تسجيل الدخول' : 'Sign in' },
    { href: `/${locale}/register`, label: ar ? 'إنشاء حساب' : 'Create an account' },
  ];

  return (
    <section className="space-y-4" aria-label={ar ? 'مساعدة سندي' : 'SanDai help'}>
      <p className="text-sm leading-6 text-ink/75">
        {ar
          ? 'يمكنك تصفح المساعدة العامة، أو تسجيل الدخول للوصول إلى الإرشادات المناسبة لحسابك.'
          : 'Browse public help, or sign in to see guidance for your account.'}
      </p>
      <p className="rounded-xl bg-mint/50 px-3 py-2 text-sm leading-6 text-ink/75" role="note">
        {ar
          ? 'للمساعدة بشأن حسابك، سجّل الدخول أولاً ثم أرسل بلاغاً من صفحة الإبلاغ عن مشكلة.'
          : 'For account help, sign in first and send a report from the Report a problem page.'}
      </p>
      <nav aria-label={ar ? 'خيارات المساعدة' : 'Help options'} className="flex flex-wrap gap-2">
        {links.map(link => (
          <Link
            key={link.href}
            href={link.href}
            className="inline-flex min-h-11 items-center rounded-full border border-ink/15 bg-white px-4 py-2 text-sm font-semibold text-ink hover:border-teal hover:text-teal focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal"
          >
            {link.label}
          </Link>
        ))}
      </nav>
    </section>
  );
}
