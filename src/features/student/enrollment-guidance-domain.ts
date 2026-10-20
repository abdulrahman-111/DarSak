import type { Locale } from './domain';

export function whatsappGroupMessageUrl(whatsappUrl: string, groupName: string, locale: Locale) {
  const message =
    locale === 'ar'
      ? `مرحبًا، انضممت إلى مجموعة ${groupName} على درسك. ما الذي ينبغي أن أستعد له لحصتنا الأولى؟`
      : `Hello, I joined ${groupName} on DarSak. What should I prepare for our first lesson?`;
  return `${whatsappUrl}?text=${encodeURIComponent(message)}`;
}
