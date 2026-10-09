import { ensureLocale } from '@/i18n/config';
import { Panel, ScreenTitle } from '@/components/platform/ui';
import { teacherProfile } from '@/features/teacher/profile-data';
import { TeacherAvatarEditor, TeacherProfileForm } from '@/features/teacher/profile-forms';

export default async function TeacherProfilePage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale: raw } = await params;
  const locale = ensureLocale(raw);
  const ar = locale === 'ar';
  const data = await teacherProfile(locale);
  return <>
    <ScreenTitle
      eyebrow={ar ? 'إعدادات المعلم' : 'Teacher settings'}
      title={ar ? 'الملف الشخصي' : 'Profile'}
      description={ar ? 'عرّف الطلاب بخبرتك واختر بيانات التواصل التي تريد مشاركتها.' : 'Introduce students to your experience and choose which contact details to share.'}
    />
    {data.error || !data.values ? <Panel><p role="alert" className="text-sm text-red-800">{data.error ?? (ar ? 'تعذر تحميل الملف الشخصي.' : 'Could not load your profile.')}</p></Panel> : <Panel>
      <TeacherAvatarEditor locale={locale} avatarUrl={data.avatarUrl} hasAvatar={data.hasAvatar} fullName={data.values.full_name}/>
      {!data.me.teacher?.approved && <p className="mb-5 rounded-xl bg-orange/10 p-3 text-sm text-ink">{ar ? 'يمكنك تعديل ملفك الشخصي أثناء انتظار اعتماد الحساب.' : 'You can edit your profile while your account is awaiting approval.'}</p>}
      <TeacherProfileForm locale={locale} values={data.values} nodes={data.nodes} subjects={data.subjects} offerings={data.offerings}/>
    </Panel>}
  </>;
}
