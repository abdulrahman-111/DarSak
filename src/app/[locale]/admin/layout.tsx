import Link from 'next/link';
import { redirect } from 'next/navigation';
import { currentUser } from '@/features/platform/data';
import { isConfigured } from '@/lib/supabase/server';
import { ensureLocale } from '@/i18n/config';
import { words } from '@/features/admin/labels';
export default async function AdminLayout({children,params}:{children:React.ReactNode;params:Promise<{locale:string}>}){
 const {locale:raw}=await params;const locale=ensureLocale(raw),t=words(locale);
 if(!isConfigured())return <div className="container py-12"><p className="rounded-2xl border border-orange/30 bg-orange/10 p-6">{t.noSetup}</p></div>;
 const me=await currentUser();if(!me)redirect(`/${locale}/login`);if(me.profile?.role!=='admin'||me.profile.status!=='active')redirect(`/${locale}/dashboard`);
 return <div className="container py-10"><nav aria-label={t.admin} className="mb-8 flex flex-wrap gap-2">{(['overview','users','education','groups','reports','settings'] as const).map(s=><Link key={s} href={`/${locale}/admin${s==='overview'?'':`/${s}`}`} className="rounded-full border border-line bg-white px-4 py-2 text-sm font-bold text-teal hover:bg-teal hover:text-white">{t[s]}</Link>)}</nav>{children}</div>;
}
