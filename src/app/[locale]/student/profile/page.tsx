import { ensureLocale } from '@/i18n/config';
import { requireViewer } from '@/components/platform/access';
import { EmptyState, Panel, ScreenTitle } from '@/components/platform/ui';
import { studentLearningProfile } from '@/features/student/data';
import { StudentProfileForm } from '@/features/student/student-profile-form';

export default async function StudentProfilePage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale: raw } = await params;
  const locale = ensureLocale(raw);
  const ar = locale === 'ar';
  const me = await requireViewer(locale, 'student');
  const { profile } = await studentLearningProfile({ db: me.db, id: me.id, fullName: me.fullName });
  const copy = ar ? {
    title: 'أكمل ملف التعلم', eyebrow: 'خطوة إعداد الطالب', description: 'يساعدنا ملفك على عرض اهتماماتك ومساعدتك في البحث عن المعلمين. يمكنك تعديل هذه المعلومات لاحقًا. تبقى الفئة العمرية واسم المدرسة خاصتين بك وبالمسؤولين المخولين، ولا تظهران للمعلمين.',
    error: 'تعذر تحميل ملف التعلم. حدّث الصفحة وحاول مرة أخرى.'
  } : {
    title: 'Complete your learning profile', eyebrow: 'Student setup', description: 'Your profile shows your interests and helps you search for teachers. You can edit these details later. Your age range and school name are private to you and authorized administrators; teachers cannot see them.',
    error: 'We could not load your learning profile. Refresh the page and try again.'
  };
  return <>
    <ScreenTitle eyebrow={copy.eyebrow} title={copy.title} description={copy.description}/>
    <Panel className="mx-auto max-w-2xl">
      {profile ? <StudentProfileForm locale={locale} updatedAt={profile.updated_at} initial={{
        full_name: profile.full_name,
        age_range: profile.age_range ?? '',
        education_year: profile.education_year,
        interests_text: profile.interests.join(', '),
        learning_goal: profile.learning_goal,
        school_name: profile.school_name,
      }}/> : <EmptyState>{copy.error}</EmptyState>}
    </Panel>
  </>;
}
