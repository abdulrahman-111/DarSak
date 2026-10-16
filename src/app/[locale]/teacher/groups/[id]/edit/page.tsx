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

  return <>
    <ScreenTitle eyebrow={ar ? 'مجموعة منشورة' : 'Published group'} title={ar ? 'تعديل تفاصيل المجموعة' : 'Edit group details'} description={ar ? 'تُحفظ تغييرات التفاصيل مع بقاء المجموعة المنشورة والطلاب والحصص والجدول كما هي.' : 'Save detail changes while keeping the group published with its students, lessons, and schedule.'} />
    <div className="mx-auto max-w-3xl"><Panel><GroupDetailsForm locale={locale} values={data.values} groupId={id} catalogue={data.catalogue} editPublished /></Panel></div>
  </>;
}
