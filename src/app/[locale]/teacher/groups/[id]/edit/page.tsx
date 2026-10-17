import { UnsavedProfileProtection } from '@/features/teacher/unsaved-profile-protection';
import { groupLearningDetails } from '@/features/teacher/group-learning-data';
import { GroupLearningForm } from '@/features/teacher/group-learning-form';
import { notFound } from 'next/navigation';
import { ensureLocale } from '@/i18n/config';
import { idSchema } from '@/features/student/domain';
import { requireTeachingAccess } from '@/components/platform/access';
import { Panel, ScreenTitle } from '@/components/platform/ui';
import { teacherGroupSetup } from '@/features/teacher/setup-data';
import { GroupDetailsForm } from '@/features/teacher/setup-forms';

export default async function EditPublishedGroupPage({ params }: { params: Promise<{ locale: string; id: string }> }) {
  const { locale: raw, id } = await params;
  const locale = ensureLocale(raw);
  if (!idSchema.safeParse(id).success) notFound();
  await requireTeachingAccess(locale);
  const data = await teacherGroupSetup(locale, id);
  if (data.notFound) notFound();
  const ar = locale === 'ar';
  if (data.error || !data.group || !data.values) {
    return <><ScreenTitle eyebrow={ar ? 'تفاصيل المجموعة' : 'Group details'} title={ar ? 'تعديل المجموعة المنشورة' : 'Edit published group'} /><Panel><p role="alert" className="text-sm text-red-800">{data.error ?? (ar ? 'تعذر تحميل المجموعة.' : 'Could not load this group.')}</p></Panel></>;
  }
  if (data.group.status !== 'published') notFound();

  const learning=await groupLearningDetails(data.me.db,id);
  return <UnsavedProfileProtection locale={locale} kind="group">
    <ScreenTitle eyebrow={ar ? 'مجموعة منشورة' : 'Published group'} title={ar ? 'تعديل تفاصيل المجموعة' : 'Edit group details'} description={ar ? 'تُحفظ تغييرات التفاصيل مع بقاء المجموعة المنشورة والطلاب والحصص والجدول كما هي.' : 'Save detail changes while keeping the group published with its students, lessons, and schedule.'} />
    <div className="mx-auto max-w-3xl"><Panel><GroupDetailsForm locale={locale} values={data.values} groupId={id} catalogue={data.catalogue} editPublished /></Panel></div>
    <Panel className="mx-auto mt-5 max-w-3xl">{learning.error?<p role="alert">{ar?'تعذر تحميل تفاصيل التعلم. حدّث الصفحة.':'Could not load learning details. Refresh the page.'}</p>:<><h2 className="text-xl font-black text-teal">{ar?'تفاصيل التعلم':'Learning details'}</h2><GroupLearningForm locale={locale} groupId={id} details={learning.data}/></>}</Panel>
  </UnsavedProfileProtection>;
}
