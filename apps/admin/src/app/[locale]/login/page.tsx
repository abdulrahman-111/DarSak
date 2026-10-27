import { redirect } from 'next/navigation';
import { getAdminActor } from '@admin/lib/access';
import { isLocale } from '@admin/lib/i18n';
import { loginAction } from './actions';

const messages = {
  ar: {
    title: 'بوابة الإدارة',
    intro: 'سجّل الدخول باستخدام حساب إداري نشط.',
    email: 'البريد الإلكتروني',
    password: 'كلمة المرور',
    submit: 'تسجيل الدخول',
    invalid: 'تعذر التحقق من الحساب. تأكد من بيانات الدخول وأن الحساب إداري نشط.',
    only: 'هذا الحساب لا يملك صلاحية دخول بوابة الإدارة.',
    unavailable: 'بوابة الإدارة غير متاحة حالياً. يرجى المحاولة لاحقاً.',
  },
  en: {
    title: 'Administrator portal',
    intro: 'Sign in with an active administrator account.',
    email: 'Email',
    password: 'Password',
    submit: 'Sign in',
    invalid: 'Sign in failed. Check your credentials and active administrator access.',
    only: 'This account cannot access the administrator portal.',
    unavailable: 'The administrator portal is currently unavailable. Please try again later.',
  },
};

export default async function LoginPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ error?: string }>;
}) {
  const { locale: rawLocale } = await params;
  if (!isLocale(rawLocale)) redirect('/ar/login');
  const locale = rawLocale;
  if (await getAdminActor()) redirect(`/${locale}/admin`);
  const { error } = await searchParams;
  const copy = messages[locale];
  const message =
    error === 'admin-only'
      ? copy.only
      : error === 'unavailable'
        ? copy.unavailable
        : error
          ? copy.invalid
          : '';

  return (
    <main className="container flex min-h-screen items-center justify-center py-12">
      <section className="w-full max-w-md rounded-2xl border border-line bg-surface p-7 shadow-xl sm:p-10">
        <p className="text-xs font-bold uppercase tracking-[.15em] text-orange">DarSak</p>
        <h1 className="mt-3 text-3xl font-black text-teal">{copy.title}</h1>
        <p className="mt-3 leading-7 text-muted">{copy.intro}</p>
        {message && (
          <p
            className="mt-5 rounded-xl bg-[#f3e1db] p-3 text-sm leading-6 text-[#6e2414]"
            role="alert"
          >
            {message}
          </p>
        )}
        <form action={loginAction} className="mt-7 grid gap-4">
          <input type="hidden" name="locale" value={locale} />
          <label className="grid gap-2 text-sm font-bold">
            {copy.email}
            <input
              autoComplete="username"
              name="email"
              type="email"
              required
              className="rounded-lg border border-line bg-white px-3 py-3 font-normal"
            />
          </label>
          <label className="grid gap-2 text-sm font-bold">
            {copy.password}
            <input
              autoComplete="current-password"
              name="password"
              type="password"
              required
              className="rounded-lg border border-line bg-white px-3 py-3 font-normal"
            />
          </label>
          <button className="mt-2 rounded-lg bg-teal px-4 py-3 font-bold text-white" type="submit">
            {copy.submit}
          </button>
        </form>
      </section>
    </main>
  );
}
