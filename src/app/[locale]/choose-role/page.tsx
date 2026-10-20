import { redirect } from 'next/navigation';
import { createClient, getVerifiedUser } from '@/lib/supabase/server';
import { authCopy } from '@/components/auth/copy';
import { chooseGoogleRoleAction } from '@/features/auth/actions';

export default async function ChooseGoogleRolePage({
  params,
}: {
  params: Promise<{ locale: 'ar' | 'en' }>;
}) {
  const { locale } = await params;
  const copy = authCopy[locale];
  const user = await getVerifiedUser();
  if (!user?.identities?.some(identity => identity.provider === 'google'))
    redirect(`/${locale}/login`);
  const db = await createClient();
  const { data: profile, error } = await db
    .from('profiles')
    .select('role,status')
    .eq('id', user.id)
    .maybeSingle();
  if (error) redirect(`/${locale}/login?error=setup`);
  if (profile)
    redirect(
      `/${locale}/${profile.role === 'admin' || profile.role === 'teacher' ? profile.role : 'student'}`,
    );

  return (
    <div className="container grid min-h-[calc(100vh-9rem)] place-items-center py-10">
      <section className="w-full max-w-xl rounded-[1.4rem] border border-line bg-surface p-6 sm:p-9">
        <p className="text-xs font-bold uppercase tracking-[.14em] text-orange">
          {copy.createEyebrow}
        </p>
        <h1 className="mt-3 text-3xl font-black text-teal">{copy.chooseGoogleRoleTitle}</h1>
        <p className="mt-4 leading-7 text-ink-soft">{copy.chooseGoogleRoleBody}</p>
        <form action={chooseGoogleRoleAction.bind(null, locale)} className="mt-8 grid gap-3">
          <button
            className="min-h-12 rounded-xl bg-teal px-5 py-3 text-start font-bold text-white"
            type="submit"
            name="google_role"
            value="student"
          >
            {copy.studentTitle}
          </button>
          <button
            className="min-h-12 rounded-xl bg-orange px-5 py-3 text-start font-bold text-white hover:bg-orange-deep"
            type="submit"
            name="google_role"
            value="teacher"
          >
            {copy.teacherTitle}
          </button>
        </form>
      </section>
    </div>
  );
}
