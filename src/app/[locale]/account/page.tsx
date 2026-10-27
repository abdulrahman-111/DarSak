import Link from 'next/link';
import { requireViewer } from '@/components/platform/access';
import { Panel, ScreenTitle } from '@/components/platform/ui';
import { ensureLocale } from '@/i18n/config';

export default async function AccountPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale: raw } = await params;
  const locale = ensureLocale(raw);
  const viewer = await requireViewer(locale);
  const ar = locale === 'ar';
  const links =
    viewer.role === 'teacher'
      ? [
          {
            href: 'profile',
            title: ar ? 'الملف الشخصي' : 'Profile',
            body: ar
              ? 'حدّث ملفك العام وبيانات التواصل.'
              : 'Update your public profile and contact details.',
          },
          {
            href: 'application',
            title: ar ? 'طلب المعلم' : 'Teacher application',
            body: ar
              ? 'راجع حالة الطلب ومعلومات المراجعة.'
              : 'Review your application and its status.',
          },
          {
            href: 'teaching-access',
            title: ar ? 'صلاحية التدريس' : 'Teaching access',
            body: ar ? 'راجع الصلاحية وطلبات التجديد.' : 'Review access and renewal requests.',
          },
          {
            href: 'setup',
            title: ar ? 'إعداد الحساب' : 'Account setup',
            body: ar
              ? 'تابع إعداد ملف المعلم أو أكمله.'
              : 'Continue or complete your teacher setup.',
          },
        ]
      : viewer.role === 'student'
        ? [
            {
              href: 'learning-profile',
              title: ar ? 'ملف التعلم' : 'Learning profile',
              body: ar
                ? 'حدّث اهتماماتك وأهداف التعلم.'
                : 'Update your interests and learning goals.',
            },
            {
              href: 'setup',
              title: ar ? 'إعداد الحساب' : 'Account setup',
              body: ar
                ? 'تابع إعداد ملف التعلم أو أكمله.'
                : 'Continue or complete your learning profile setup.',
            },
          ]
        : [];
  const common = [
    {
      href: 'security',
      title: ar ? 'الأمان' : 'Security',
      body: ar
        ? 'تغيير كلمة المرور وإعدادات الأمان.'
        : 'Change your password and review security settings.',
    },
    {
      href: 'delete',
      title: ar ? 'حذف الحساب' : 'Delete account',
      body: ar ? 'راجع خيارات حذف الحساب وآثاره.' : 'Review account deletion and its effects.',
    },
  ];

  return (
    <div>
      <ScreenTitle
        eyebrow={ar ? 'حسابك' : 'Your account'}
        title={ar ? 'إعدادات الحساب' : 'Account settings'}
        description={
          ar
            ? 'إدارة بياناتك الشخصية وإعدادات حسابك.'
            : 'Manage your personal details and account settings.'
        }
      />
      <div className="grid gap-4 sm:grid-cols-2">
        {[...links, ...common].map(item => (
          <Panel key={item.href} className="flex min-h-36 flex-col">
            <h2 className="text-lg font-black text-teal">{item.title}</h2>
            <p className="mt-2 flex-1 text-sm leading-6 text-muted">{item.body}</p>
            <Link
              className="mt-4 inline-flex font-bold text-teal underline"
              href={
                item.href.startsWith('/')
                  ? `/${locale}${item.href}`
                  : `/${locale}/account/${item.href}`
              }
            >
              {ar ? 'فتح' : 'Open'}
            </Link>
          </Panel>
        ))}
      </div>
    </div>
  );
}
