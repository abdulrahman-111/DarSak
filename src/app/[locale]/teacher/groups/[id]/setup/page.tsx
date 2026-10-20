import { UnsavedProfileProtection } from '@/features/teacher/unsaved-profile-protection';
import { groupLearningDetails } from '@/features/teacher/group-learning-data';
import { GroupLearningView } from '@/features/teacher/group-learning-view';
import { notFound } from 'next/navigation';
import { ensureLocale } from '@/i18n/config';
import { Panel, ScreenTitle, Status } from '@/components/platform/ui';
import { idSchema } from '@/features/student/domain';
import { teacherGroupSetup } from '@/features/teacher/setup-data';
import { GroupDetailsForm, GroupSetupSteps, WeeklyScheduleStepForm } from '@/features/teacher/setup-forms';
import { normalizeSetupStep } from '@/features/teacher/setup-domain';
import { PublishReviewForm } from '@/features/teacher/publish-form';
import { parseTeacherReviewStatus } from '@/features/teacher/review-data';
import { requireTeachingAccess } from '@/components/platform/access';

export default async function TeacherGroupSetupPage({ params, searchParams }: { params: Promise<{ locale: string; id: string }>; searchParams: Promise<{ step?: string | string[]; copyScheduleFrom?: string | string[] }> }) {
  const [{ locale: raw, id }, query] = await Promise.all([params, searchParams]);
  const locale = ensureLocale(raw);
  if (!idSchema.safeParse(id).success) notFound();
  await requireTeachingAccess(locale);
  const requestedSource = Array.isArray(query.copyScheduleFrom) ? query.copyScheduleFrom[0] : query.copyScheduleFrom;
  const data = await teacherGroupSetup(locale, id, requestedSource);
  if (data.notFound) notFound();
  const ar = locale === 'ar';
  const step = normalizeSetupStep(query.step);
  const proposalSourceId = data.scheduleProposal?.sourceId;

  if (data.error || !data.group || !data.values) {
    return <><ScreenTitle eyebrow={ar ? 'إعداد التدريس' : 'Teaching setup'} title={ar ? 'إعداد المجموعة' : 'Group setup'} /><Panel><p role="alert" className="text-sm text-red-800">{data.error ?? (ar ? 'تعذر تحميل المجموعة.' : 'Could not load this group.')}</p></Panel></>;
  }
  if (data.group.status !== 'draft') notFound();
  const [reviewResult, learning] = await Promise.all([
    step === 'review'
      ? data.me.db.rpc('teacher_review_status',{p_teacher_id:data.me.id})
      : Promise.resolve(null),
    step === 'schedule'
      ? Promise.resolve({ data: null, error: false })
      : groupLearningDetails(data.me.db,id),
  ]);
  const reviewStatus=reviewResult&&!reviewResult.error?parseTeacherReviewStatus(reviewResult.data)?.status??null:null;
  return <UnsavedProfileProtection locale={locale} kind="group">
    <ScreenTitle eyebrow={ar ? 'مسودة مجموعة' : 'Group draft'} title={data.group.name} description={ar ? 'يمكنك العودة لإكمال إعداد مجموعتك في أي وقت.' : 'You can return to finish setting up your group at any time.'} action={<Status value={data.group.status} locale={locale} />} />
    <div className="mx-auto max-w-3xl">
      <GroupSetupSteps locale={locale} groupId={id} current={step} copyScheduleFrom={proposalSourceId} />
      <Panel>
        {step === 'details'
          ? learning.error ? <p role="alert">{ar?'تعذر تحميل تفاصيل التعلم بأمان. حدّث الصفحة قبل التعديل.':'Learning details could not be loaded safely. Refresh before editing.'}</p> : <GroupDetailsForm locale={locale} values={data.values} groupId={id} catalogue={data.catalogue} copyScheduleFrom={proposalSourceId} learningDetails={learning.data} />
          : step === 'schedule'
            ? <WeeklyScheduleStepForm locale={locale} groupId={id} slots={data.slots} scheduleProposal={data.scheduleProposal} scheduleProposalError={data.scheduleProposalError} copyScheduleFrom={proposalSourceId} />
            : learning.error ? <p role="alert" className="text-sm text-red-800">{ar?'تعذر تحميل تفاصيل التعلم، لذا لا يمكن متابعة المراجعة بأمان. حدّث الصفحة.':'Learning details could not be loaded, so review cannot continue safely. Refresh the page.'}</p> : <><GroupLearningView locale={locale} details={learning.data}/><PublishReviewForm
              key={data.group.id}
              locale={locale}
              group={data.group}
              catalogue={data.catalogue.choices}
              slots={data.slots}
              exclusions={data.exclusions}
              approved={Boolean(data.me.teacher?.approved)}
              reviewStatus={reviewStatus}
              copyScheduleFrom={proposalSourceId}
            /></>}
      </Panel>
    </div>
  </UnsavedProfileProtection>;
}
