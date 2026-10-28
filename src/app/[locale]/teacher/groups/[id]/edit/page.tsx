import { UnsavedProfileProtection } from '@/features/teacher/unsaved-profile-protection';
import { groupLearningDetails } from '@/features/teacher/group-learning-data';
import { GroupLearningView } from '@/features/teacher/group-learning-view';
import { notFound } from 'next/navigation';
import { ensureLocale } from '@/i18n/config';
import { idSchema } from '@/features/student/domain';
import { loadWithTeachingAccess } from '@/features/teacher/teaching-access-gate';
import { Panel, ScreenTitle } from '@/components/platform/ui';
import { teacherGroupSetup } from '@/features/teacher/setup-data';
import { GroupDetailsForm } from '@/features/teacher/setup-forms';

export default async function EditPublishedGroupPage({
  params,
}: {
  params: Promise<{ locale: string; id: string }>;
}) {
  const { locale: raw, id } = await params;
  const locale = ensureLocale(raw);
  if (!idSchema.safeParse(id).success) notFound();
  const {
    data: [data, learningResult],
  } = await loadWithTeachingAccess(locale, me =>
    Promise.all([teacherGroupSetup(locale, id), groupLearningDetails(me.db, id)]),
  );
  if (data.notFound) notFound();
  const ar = locale === 'ar';
  if (data.error || !data.group || !data.values) {
    return (
      <>
        <ScreenTitle
          eyebrow={ar ? 'تفاصيل المجموعة' : 'Group details'}
          title={ar ? 'تعديل المجموعة المنشورة' : 'Edit published group'}
        />
        <Panel>
          <p role="alert" className="text-sm text-danger">
            {data.error ?? (ar ? 'تعذر تحميل المجموعة.' : 'Could not load this group.')}
          </p>
        </Panel>
      </>
    );
  }
  if (data.group.status !== 'published') notFound();

  const learning = learningResult;
  return (
    <UnsavedProfileProtection locale={locale} kind="group">
      <ScreenTitle
        eyebrow={ar ? 'مجموعة منشورة' : 'Published group'}
        title={ar ? 'تعديل تفاصيل المجموعة' : 'Edit group details'}
        description={
          ar
            ? 'تُحفظ تغييرات التفاصيل مع بقاء المجموعة المنشورة والطلاب والحصص والجدول كما هي.'
            : 'Save detail changes while keeping the group published with its students, lessons, and schedule.'
        }
      />
      <div className="mx-auto max-w-3xl">
        <Panel>
          {learning.error ? (
            <p role="alert">
              {ar
                ? 'تعذر تحميل تفاصيل التعلم بأمان. حدّث الصفحة قبل التعديل.'
                : 'Learning details could not be loaded safely. Refresh before editing.'}
            </p>
          ) : (
            <GroupDetailsForm
              locale={locale}
              values={data.values}
              groupId={id}
              catalogue={data.catalogue}
              editPublished
              learningDetails={learning.data}
            />
          )}
        </Panel>
      </div>
    </UnsavedProfileProtection>
  );
}
