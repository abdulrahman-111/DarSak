import 'server-only';
import { idSchema, type Locale } from '@/features/student/domain';
import {
  teacherCatalogueChoices,
  type TeacherCatalogueNode,
  type TeacherCatalogueOffering,
  type TeacherCatalogueSubject,
} from './catalogue-data';
import { catalogueDisplayName } from './catalogue-domain';
import { teacherIdentity, type teacherViewer } from './data';
import {
  setupCatalogueChoices,
  type SetupCatalogueChoice,
  type SetupCatalogueNode,
  type SetupCatalogueOffering,
  type SetupCatalogueSubject,
} from './setup-domain';
import { scheduleProposalSlots } from './shortcuts-domain';

export type GroupDetailsFormValues = {
  name: string;
  description: string;
  subject_id: string;
  category_id: string;
  capacity: number;
  location: string;
  updated_at: string | null;
};

export type GroupScheduleSlot = {
  id: string;
  group_id: string;
  weekday: number;
  start_time: string;
  end_time: string;
  timezone: string;
};

export type GroupScheduleProposal = {
  sourceId: string;
  sourceName: string;
  slots: Array<Pick<GroupScheduleSlot, 'weekday' | 'start_time' | 'end_time'>>;
};

export type SetupCatalogue = {
  subjects: SetupCatalogueSubject[];
  nodes: SetupCatalogueNode[];
  offerings: SetupCatalogueOffering[];
  retained: SetupCatalogueChoice | null;
  choices: SetupCatalogueChoice[];
};

const errorCopy = (locale: Locale) =>
  locale === 'ar'
    ? 'تعذر تحميل إعدادات المجموعة أو عناصر دليلها المحفوظة. حاول مرة أخرى.'
    : 'Could not load group setup or its saved catalogue items. Please try again.';

export async function teacherGroupSetup(
  locale: Locale,
  id?: string | null,
  copyScheduleFrom?: string | null,
) {
  const identity = await teacherIdentity(locale);
  // The teacher row is read in the same batch as the catalogue and group below; the early
  // returns before that batch never expose it.
  let me: Awaited<ReturnType<typeof teacherViewer>> = {
    ...identity,
    teacher: null,
    teacherError: null,
  };
  const ar = locale === 'ar';
  const empty = {
    me,
    group: null,
    values: null,
    catalogue: {
      subjects: [],
      nodes: [],
      offerings: [],
      retained: null,
      choices: [],
    } as SetupCatalogue,
    slots: [] as GroupScheduleSlot[],
    scheduleProposal: null as GroupScheduleProposal | null,
    scheduleProposalError: null as string | null,
    exclusions: [],
    error: null as string | null,
    notFound: false,
  };
  if (id && !idSchema.safeParse(id).success) {
    return { ...empty, error: ar ? 'المجموعة غير موجودة.' : 'Group not found.', notFound: true };
  }
  const proposalId =
    copyScheduleFrom && idSchema.safeParse(copyScheduleFrom).success ? copyScheduleFrom : null;
  const [choices, groupResult, sourceGroupResult, teacherResult, slotsResult, exclusionsResult] =
    await Promise.all([
      teacherCatalogueChoices(me.db, me.id),
      id
        ? me.db
            .from('groups')
            .select(
              'id,teacher_id,name,description,offering_id,capacity,location,status,updated_at',
            )
            .eq('id', id)
            .eq('teacher_id', me.id)
            .maybeSingle()
        : Promise.resolve({ data: null, error: null }),
      proposalId
        ? me.db
            .from('groups')
            .select('id,name')
            .eq('id', proposalId)
            .eq('teacher_id', me.id)
            .maybeSingle()
        : Promise.resolve({ data: null, error: null }),
      me.db
        .from('teacher_profiles')
        .select('headline,bio,approved,avatar_path,cover_path')
        .eq('id', me.id)
        .maybeSingle(),
      id
        ? me.db
            .from('group_schedule_slots')
            .select('id,group_id,weekday,start_time,end_time,timezone')
            .eq('group_id', id)
            .order('weekday')
            .order('start_time')
        : Promise.resolve({ data: null, error: null }),
      id
        ? me.db
            .from('group_lesson_exclusions')
            .select('local_date')
            .eq('group_id', id)
            .order('local_date')
        : Promise.resolve({ data: null, error: null }),
    ]);
  me = { ...me, teacher: teacherResult.data, teacherError: teacherResult.error };
  empty.me = me;

  if (groupResult.error || choices.error.error) return { ...empty, error: errorCopy(locale) };
  if (id && !groupResult.data) {
    return { ...empty, error: ar ? 'المجموعة غير موجودة.' : 'Group not found.', notFound: true };
  }

  const subjects = choices.subjects as TeacherCatalogueSubject[];
  const nodes = choices.nodes as TeacherCatalogueNode[];
  const offerings = choices.offerings as TeacherCatalogueOffering[];
  const catalogue: SetupCatalogue = {
    subjects: subjects as SetupCatalogueSubject[],
    nodes: nodes as SetupCatalogueNode[],
    offerings: offerings as SetupCatalogueOffering[],
    retained: null,
    choices: setupCatalogueChoices(
      locale,
      nodes as SetupCatalogueNode[],
      subjects as SetupCatalogueSubject[],
      offerings as SetupCatalogueOffering[],
    ),
  };
  if (!groupResult.data) return { ...empty, catalogue };

  const group = groupResult.data;
  const [savedOfferingResult, proposalSlotsResult] = await Promise.all([
    me.db
      .from('offerings')
      .select('id,owner_teacher_id,archived_at,node_id,subject_id')
      .eq('id', group.offering_id)
      .maybeSingle(),
    proposalId && sourceGroupResult.data
      ? me.db
          .from('group_schedule_slots')
          .select('weekday,start_time,end_time')
          .eq('group_id', proposalId)
          .order('weekday')
          .order('start_time')
      : Promise.resolve({ data: null, error: null }),
  ]);
  if (savedOfferingResult.error || !savedOfferingResult.data)
    return { ...empty, error: errorCopy(locale) };
  const savedOffering = savedOfferingResult.data as TeacherCatalogueOffering;
  if (savedOffering.owner_teacher_id !== null && savedOffering.owner_teacher_id !== me.id)
    return { ...empty, error: errorCopy(locale) };

  const [savedSubjectResult, savedNodeResult] = await Promise.all([
    me.db
      .from('subjects')
      .select('id,owner_teacher_id,archived_at,name_ar,name_en')
      .eq('id', savedOffering.subject_id)
      .maybeSingle(),
    me.db
      .from('education_nodes')
      .select('id,owner_teacher_id,archived_at,parent_id,kind,name_ar,name_en')
      .eq('id', savedOffering.node_id)
      .maybeSingle(),
  ]);
  if (
    savedSubjectResult.error ||
    savedNodeResult.error ||
    !savedSubjectResult.data ||
    !savedNodeResult.data
  )
    return { ...empty, error: errorCopy(locale) };
  const savedSubject = savedSubjectResult.data as TeacherCatalogueSubject;
  const savedNode = savedNodeResult.data as TeacherCatalogueNode;
  if (
    (savedSubject.owner_teacher_id !== null && savedSubject.owner_teacher_id !== me.id) ||
    (savedNode.owner_teacher_id !== null && savedNode.owner_teacher_id !== me.id)
  ) {
    return { ...empty, error: errorCopy(locale) };
  }

  // Archived saved components are exposed only as the existing group's retained selection.
  const labelNodes = new Map(nodes.map(node => [node.id, node]));
  labelNodes.set(savedNode.id, savedNode);
  const contextLabels: string[] = [];
  const seen = new Set<string>();
  let current: TeacherCatalogueNode | undefined = savedNode;
  while (current && !seen.has(current.id)) {
    seen.add(current.id);
    contextLabels.unshift(catalogueDisplayName(current, locale));
    current = current.parent_id ? labelNodes.get(current.parent_id) : undefined;
  }
  const subjectLabel = catalogueDisplayName(savedSubject, locale);
  const context = contextLabels.filter(Boolean).join(' › ');
  if (!subjectLabel || !context) return { ...empty, error: errorCopy(locale) };
  const retained: SetupCatalogueChoice = {
    id: savedOffering.id,
    subject_id: savedSubject.id,
    category_id: savedNode.id,
    subject: subjectLabel,
    context,
    label: `${subjectLabel} · ${context}`,
  };
  if (!catalogue.subjects.some(row => row.id === savedSubject.id))
    catalogue.subjects.push(savedSubject);
  if (!catalogue.nodes.some(row => row.id === savedNode.id)) catalogue.nodes.push(savedNode);
  catalogue.retained = retained;
  catalogue.choices = setupCatalogueChoices(
    locale,
    catalogue.nodes,
    catalogue.subjects,
    catalogue.offerings,
  );
  if (!catalogue.choices.some(choice => choice.id === retained.id))
    catalogue.choices.push(retained);
  if (slotsResult.error || exclusionsResult.error)
    return { ...empty, catalogue, error: errorCopy(locale) };

  const scheduleProposalError = copyScheduleFrom
    ? !proposalId ||
      sourceGroupResult.error ||
      !sourceGroupResult.data ||
      proposalSlotsResult?.error
      ? ar
        ? 'تعذر تحميل الجدول المقترح من هذه المجموعة.'
        : 'Could not load a schedule proposal from that group.'
      : null
    : null;
  const scheduleProposal =
    proposalId && sourceGroupResult.data && !proposalSlotsResult?.error
      ? {
          sourceId: proposalId,
          sourceName: sourceGroupResult.data.name,
          slots: scheduleProposalSlots(
            (proposalSlotsResult?.data ?? []) as GroupScheduleProposal['slots'],
          ),
        }
      : null;
  const values: GroupDetailsFormValues = {
    name: group.name,
    description: group.description ?? '',
    subject_id: savedSubject.id,
    category_id: savedNode.id,
    capacity: group.capacity,
    location: group.location ?? '',
    updated_at: group.updated_at,
  };
  return {
    me,
    group,
    values,
    catalogue,
    slots: (slotsResult.data ?? []) as GroupScheduleSlot[],
    scheduleProposal,
    scheduleProposalError,
    exclusions: (exclusionsResult.data ?? []).map(row => row.local_date),
    error: null,
    notFound: false,
  };
}
