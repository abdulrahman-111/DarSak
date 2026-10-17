import { redirect } from 'next/navigation';
import { cookies } from 'next/headers';
import { ensureLocale, getDictionary } from '@/i18n/config';
import { createClient } from '@/lib/supabase/server';
import { callDeletionEdge, type DeletionStatus } from '@/features/account/edge';
import { AccountDeletionForm, AccountDeletionRetry } from '@/features/account/form';
import { googleReauthHintMatches } from '@/features/account/google-hint';

export const dynamic = 'force-dynamic';
export default async function AccountPage({ params, searchParams }: { params: Promise<{ locale: string }>; searchParams: Promise<{ error?: string }> }) {
  const { locale: raw } = await params; const query = await searchParams; const locale = ensureLocale(raw); const dictionary = await getDictionary(locale);
  const db = await createClient();
  const [{ data: verified, error }, { data: session }] = await Promise.all([db.auth.getUser(), db.auth.getSession()]);
  if (error || !verified.user || !session.session || session.session.user.id !== verified.user.id) redirect(`/${locale}/login`);
  const result = await callDeletionEdge<DeletionStatus>(session.session.access_token, { operation: 'status' });
  const status = result.data;
  const c = dictionary.accountDeletion;
  const { data: profile } = await db.from('profiles').select('role,status').eq('id', verified.user.id).maybeSingle();
  if (status?.state === 'completed') redirect(`/${locale}/account/goodbye`);
  if (status?.state === 'pending') return <section className="container max-w-3xl py-14"><h1 className="text-3xl font-black">{c.title}</h1><p className="mt-5 rounded-2xl bg-amber-50 p-5 text-amber-950" role="status">{c.pending}</p><p className="mt-3 text-sm text-muted">{c.pendingDetails}</p><AccountDeletionRetry locale={locale} text={c}/></section>;
  if (profile?.status === 'suspended') return <section className="container max-w-3xl py-14"><h1 className="text-3xl font-black">{c.title}</h1><p className="mt-5">{c.suspended}</p></section>;
  if (status?.state === 'unavailable' || !status) return <section className="container max-w-3xl py-14"><h1 className="text-3xl font-black">{c.title}</h1><p className="mt-5 text-red-700">{c.unavailable}</p></section>;
  const jar = await cookies(); const intentId = jar.get('dars-delete-intent')?.value; const nonce = jar.get('dars-delete-nonce')?.value; const intentOwner = jar.get('dars-delete-owner')?.value;
  const googleReady = !!nonce && googleReauthHintMatches(jar.get('dars-delete-google-ready')?.value, intentId, intentOwner);
  return <section className="container max-w-3xl py-14">
    <p className="text-sm font-bold uppercase tracking-[.18em] text-orange">{c.eyebrow}</p><h1 className="mt-3 text-3xl font-black">{c.title}</h1>
    <p className="mt-5 text-muted">{c.intro}</p>
    {query.error === 'reauth' && <p role="alert" className="mt-4 text-red-700">{c.googleError}</p>}
    {query.error === 'unavailable' && <p role="alert" className="mt-4 text-red-700">{c.unavailable}</p>}
    {(profile?.role === 'teacher' || (!profile && status.role === 'teacher')) && <p className="mt-4 rounded-2xl border border-orange-200 bg-orange-50 p-5 font-semibold text-orange-950">{c.teacherWarning}</p>}
    <p className="mt-4 rounded-2xl border border-line bg-white p-5 text-sm text-muted">{c.historyWarning}</p>
    <AccountDeletionForm locale={locale} text={c} googleReady={googleReady}/>
  </section>;
}
