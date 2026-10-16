import { ensureLocale } from '@/i18n/config';
import { Panel, ScreenTitle } from '@/components/platform/ui';
import { teacherProfile } from '@/features/teacher/profile-data';
import { TeacherAvatarEditor, TeacherProfileForm } from '@/features/teacher/profile-forms';
import { TeacherCoverEditor } from '@/features/teacher/profile-cover-editor';
import { TeacherProfileDetailsForm } from '@/features/teacher/profile-details-form';
import { publicVisitorContacts } from '@/features/teacher/profile-details-domain';
import { UnsavedProfileProtection } from '@/features/teacher/unsaved-profile-protection';
import Link from 'next/link';

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
    {data.error || !data.values ? <Panel><p role="alert" className="text-sm text-red-800">{data.error ?? (ar ? 'تعذر تحميل الملف الشخصي.' : 'Could not load your profile.')}</p></Panel> : <Panel><UnsavedProfileProtection locale={locale}>
      <TeacherAvatarEditor locale={locale} avatarUrl={data.avatarUrl} hasAvatar={data.hasAvatar} fullName={data.values.full_name}/>
      <TeacherCoverEditor locale={locale} coverUrl={data.coverUrl} hasCover={!!data.coverUrl}/>
      {!data.me.teacher?.approved && <div className="mb-5 rounded-xl bg-orange/10 p-3 text-sm leading-6 text-ink"><p>{ar ? 'يمكنك تعديل ملفك الشخصي أثناء انتظار الاعتماد. أكمل عناصر قائمة الطلب من صفحة التقديم؛ تفاصيل الخبرة والمؤهلات واللغات والمنهجية موجودة في هذا المحرر.' : 'You can edit your profile while approval is pending. Complete the application checklist from the application page; experience, qualifications, languages, and approach are edited here.'}</p><Link href={`/${locale}/teacher/application`} className="mt-2 inline-flex font-bold text-teal underline">{ar ? 'فتح طلب الاعتماد' : 'Open teacher application'}</Link></div>}
      <TeacherProfileForm locale={locale} values={data.values} nodes={data.nodes} subjects={data.subjects} offerings={data.offerings} retainedOfferingIds={data.retainedOfferingIds}/>
      <TeacherProfileDetailsForm locale={locale} details={data.details.details} version={data.details.version} error={data.details.error} teacher={{ id: data.me.id, full_name: data.values.full_name, headline: data.values.headline || null }} avatarUrl={data.avatarUrl} coverUrl={data.coverUrl} specializations={data.previewSpecializations} groups={data.previewGroups} contactVisibility={data.values.visibility} previewContacts={publicVisitorContacts(data.values.visibility, data.contacts)}/>
    </UnsavedProfileProtection></Panel>}
  </>;
}
