import type { Metadata } from 'next';
import type { SeoLocale } from './metadata';
import { pageMetadata } from './metadata';
import { seoCopy } from './copy';

const privatePageCopy: Record<SeoLocale, Record<string, { title: string; description: string }>> = {
  en: {
    '/login': seoCopy.en.login,
    '/register': seoCopy.en.register,
    '/check-email': { title: 'Check your email', description: 'Continue setting up your account.' },
    '/choose-role': { title: 'Choose your role', description: 'Choose how to use your account.' },
    '/forgot-password': { title: 'Reset your password', description: 'Request a password reset.' },
    '/reset-password': {
      title: 'Choose a new password',
      description: 'Update your account password.',
    },
    '/account/setup': { title: 'Set up your account', description: 'Complete your account setup.' },
  },
  ar: {
    '/login': seoCopy.ar.login,
    '/register': seoCopy.ar.register,
    '/check-email': { title: 'تحقق من بريدك الإلكتروني', description: 'تابع إعداد حسابك.' },
    '/choose-role': { title: 'اختر دورك', description: 'اختر كيفية استخدام حسابك.' },
    '/forgot-password': {
      title: 'إعادة تعيين كلمة المرور',
      description: 'اطلب إعادة تعيين كلمة المرور.',
    },
    '/reset-password': { title: 'اختر كلمة مرور جديدة', description: 'حدّث كلمة مرور حسابك.' },
    '/account/setup': { title: 'إعداد الحساب', description: 'أكمل إعداد حسابك.' },
  },
};

export function privatePageMetadata(locale: SeoLocale, path: string): Metadata {
  const copy = privatePageCopy[locale][path];
  if (!copy) throw new Error(`Missing private page metadata for ${path}`);
  return pageMetadata({ locale, path, ...copy, noIndex: true });
}
