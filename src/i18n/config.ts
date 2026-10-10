import { notFound } from 'next/navigation';
export const locales=['ar','en'] as const; export type Locale=typeof locales[number]; export const defaultLocale='ar';
export function isLocale(value:string):value is Locale{return (locales as readonly string[]).includes(value)}
export function getDirection(locale:Locale){return locale==='ar'?'rtl':'ltr'}
export async function getDictionary(locale:Locale){ const validLocale=ensureLocale(locale); return (await import(`../../messages/${validLocale}.json`)).default; }
export function ensureLocale(locale:string){if(!isLocale(locale)) notFound(); return locale;}
