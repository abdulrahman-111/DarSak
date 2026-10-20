import Link from 'next/link';
import { guidanceContent, type GuidancePage } from './content';
export function GuidancePageView({ kind, locale }: { kind: GuidancePage; locale: string }) {
  const c = guidanceContent(kind, locale),
    ar = locale === 'ar';
  const links: Array<[string, string]> = [
    ['help', ar ? 'المساعدة' : 'Help'],
    ['privacy', ar ? 'الخصوصية' : 'Privacy'],
    ['terms', ar ? 'إرشادات الاستخدام' : 'Terms'],
  ];
  if (kind === 'help')
    links.push(
      ['forgot-password', ar ? 'استعادة كلمة المرور' : 'Password recovery'],
      ['reports', ar ? 'الإبلاغ عن مشكلة (يتطلب الدخول)' : 'Report a problem (sign-in required)'],
    );
  return (
    <article className="container max-w-3xl py-10 md:py-16">
      <h1 className="text-3xl font-black text-teal md:text-4xl">{c.title}</h1>
      <p className="mt-4 text-lg text-muted">{c.intro}</p>
      <nav aria-label={ar ? 'روابط المساعدة' : 'Help links'} className="mt-6 flex flex-wrap gap-3">
        {links.map(([href, label]) => (
          <Link
            key={href}
            href={`/${locale}/${href}`}
            className="inline-flex min-h-11 items-center rounded-xl border border-line px-4 py-2 font-bold text-teal underline"
          >
            {label}
          </Link>
        ))}
      </nav>
      <div className="mt-8 grid gap-6">
        {c.sections.map(([title, body]) => (
          <section key={title} className="rounded-2xl border border-line bg-white p-5">
            <h2 className="text-xl font-bold text-teal">{title}</h2>
            <p className="mt-3 leading-8 text-muted">{body}</p>
          </section>
        ))}
      </div>
    </article>
  );
}
