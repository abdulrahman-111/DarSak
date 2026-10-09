import 'server-only';
import { idSchema, type Locale } from '@/features/student/domain';
import { teacherViewer } from './data';
import { setupCatalogueChoices, type SetupCatalogueNode, type SetupCatalogueOffering, type SetupCatalogueSubject } from './setup-domain';

export type GroupDetailsFormValues = {
  name: string;
  description: string;
  offering_id: string;
  capacity: number;
  location: string;
};

const errorCopy = (locale: Locale) => locale === 'ar'
  ? 'تعذر تحميل إعدادات المجموعة. حاول مرة أخرى.'
  : 'Could not load group setup. Please try again.';

export async function teacherGroupSetup(locale: Locale, id?: string | null) {
  const me = await teacherViewer(locale);
  const ar = locale === 'ar';
  const empty = {
    me,
    group: null,
    values: null,
    catalogue: [],
    slots: [],
    exclusions: [],
    error: null as string | null,
    notFound: false,
  };
  if (id && !idSchema.safeParse(id).success) {
    return { ...empty, error: ar ? 'المجموعة غير موجودة.' : 'Group not found.', notFound: true };
  }

  const [catalogueNodes, catalogueSubjects, catalogueOfferings, groupResult] = await Promise.all([
    me.db.from('education_nodes').select('id,parent_id,name_ar,name_en').order('name_en'),
    me.db.from('subjects').select('id,name_ar,name_en').order('name_en'),
    me.db.from('offerings').select('id,node_id,subject_id'),
    id
      ? me.db.from('groups').select('id,teacher_id,name,description,offering_id,capacity,location,status').eq('id', id).eq('teacher_id', me.id).maybeSingle()
      : Promise.resolve({ data: null, error: null }),
  ]);

  if (groupResult.error) return { ...empty, error: errorCopy(locale) };
  if (id && !groupResult.data) {
    return { ...empty, error: ar ? 'المجموعة غير موجودة.' : 'Group not found.', notFound: true };
  }

  const catalogueError = catalogueNodes.error || catalogueSubjects.error || catalogueOfferings.error;
  if (catalogueError) return { ...empty, error: errorCopy(locale) };
  const catalogue = setupCatalogueChoices(
    locale,
    (catalogueNodes.data ?? []) as SetupCatalogueNode[],
    (catalogueSubjects.data ?? []) as SetupCatalogueSubject[],
    (catalogueOfferings.data ?? []) as SetupCatalogueOffering[],
  );

  if (!groupResult.data) return { ...empty, catalogue };

  const [slotsResult, exclusionsResult] = await Promise.all([
    me.db.from('group_schedule_slots').select('id,group_id,weekday,start_time,end_time,timezone').eq('group_id', id!).order('weekday').order('start_time'),
    me.db.from('group_lesson_exclusions').select('local_date').eq('group_id', id!).order('local_date'),
  ]);
  if (slotsResult.error || exclusionsResult.error) return { ...empty, catalogue, error: errorCopy(locale) };

  const group = groupResult.data;
  const values: GroupDetailsFormValues = {
    name: group.name,
    description: group.description ?? '',
    offering_id: group.offering_id,
    capacity: group.capacity,
    location: group.location ?? '',
  };
  return {
    me,
    group,
    values,
    catalogue,
    slots: slotsResult.data ?? [],
    exclusions: (exclusionsResult.data ?? []).map(row => row.local_date),
    error: null,
    notFound: false,
  };
}
