import { ensureLocale } from '@/i18n/config';
import { GuidancePageView } from '@/features/help/page';
export default async function Page({params}:{params:Promise<{locale:string}>}){
 const {locale}=await params;return <GuidancePageView kind="terms" locale={ensureLocale(locale)}/>;
}
