import { notFound } from 'next/navigation';
import { ensureLocale } from '@/i18n/config';
import { Panel, ScreenTitle, Status } from '@/components/platform/ui';
import { idSchema } from '@/features/student/domain';
import { teacherGroupSetup } from '@/features/teacher/setup-data';
import { GroupDetailsForm, GroupSetupSteps, WeeklyScheduleStepForm } from '@/features/teacher/setup-forms';
import { normalizeSetupStep } from '@/features/teacher/setup-domain';
import { PublishReviewForm } from '@/features/teacher/publish-form';

export default async function TeacherGroupSetupPage({ params, searchParams }: { params: Promise<{ locale: string; id: string }>; searchParams: Promise<{ step?: string | string[]; copyScheduleFrom?: string | string[] }> }) {
  const [{ locale: raw, id }, query] = await Promise.all([params, searchParams]);
  const locale = ensureLocale(raw);
  if (!idSchema.safeParse(id).success) notFound();
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

  return <>
    <ScreenTitle eyebrow={ar ? 'مسودة مجموعة' : 'Group draft'} title={data.group.name} description={ar ? 'يمكنك العودة لإكمال إعداد مجموعتك في أي وقت.' : 'You can return to finish setting up your group at any time.'} action={<Status value={data.group.status} locale={locale} />} />
    <div className="mx-auto max-w-3xl">
      <GroupSetupSteps locale={locale} groupId={id} current={step} copyScheduleFrom={proposalSourceId} />
      <Panel>
        {step === 'details'
          ? <GroupDetailsForm locale={locale} values={data.values} groupId={id} catalogue={data.catalogue} copyScheduleFrom={proposalSourceId} />
          : step === 'schedule'
            ? <WeeklyScheduleStepForm locale={locale} groupId={id} slots={data.slots} scheduleProposal={data.scheduleProposal} scheduleProposalError={data.scheduleProposalError} copyScheduleFrom={proposalSourceId} />
            : <PublishReviewForm
              key={data.group.id}
              locale={locale}
              group={data.group}
              catalogue={data.catalogue}
              slots={data.slots}
              exclusions={data.exclusions}
              approved={Boolean(data.me.teacher?.approved)}
              copyScheduleFrom={proposalSourceId}
            />}
      </Panel>
    </div>
  </>;
}
