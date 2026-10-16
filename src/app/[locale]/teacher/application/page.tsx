import { ensureLocale } from '@/i18n/config';
import { requireViewer } from '@/components/platform/access';
import { Panel, ScreenTitle } from '@/components/platform/ui';
import { teacherApplication } from '@/features/teacher/application-data';
import { TeacherApplicationPanel } from '@/features/teacher/application-panel';

export default async function TeacherApplicationPage({ params, searchParams }: { params: Promise<{ locale: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const [{ locale: raw }, query] = await Promise.all([params, searchParams]);
  const locale = ensureLocale(raw);
  const ar = locale === 'ar';
  const onboardingError = query.onboarding_error === 'load';
  const me = await requireViewer(locale, 'teacher');
  const data = await teacherApplication(me);
  return <>
    <ScreenTitle eyebrow={ar ? 'اعتماد المعلم' : 'Teacher approval'} title={ar ? 'طلب الاعتماد' : 'Application'} description={ar ? 'قدّم معلوماتك للمراجعة الإدارية. يمكنك تجهيز الطلب حتى عند توقف صلاحية التدريس.' : 'Share the required information for administrator review. You can prepare your application while teaching access is paused.'}/>
    {onboardingError && <Panel><p role="alert" className="text-sm text-red-800">{ar ? 'تعذر التحقق من خطوات إعداد حسابك. راجع القائمة أدناه وحدّث الصفحة بعد الحفظ.' : 'Could not check your account setup steps. Review the checklist below and refresh after saving.'}</p></Panel>}
    {data.error === 'download' && <Panel><p role="alert" className="text-sm text-red-800">{ar ? 'تعذر إنشاء رابط تنزيل آمن لملفك.' : 'Could not create a secure download link for your CV.'}</p></Panel>}
    <TeacherApplicationPanel locale={locale} data={data}/>
  </>;
}
