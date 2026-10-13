import 'server-only';
import { createClient } from '@/lib/supabase/server';
import { teacherViewer } from './data';
import type { Locale } from '@/features/student/domain';
import type { ProfileFormValues } from './profile-domain';
import { publicGroups } from '@/features/platform/data';
import { normalizeDiscoveryFilters } from '@/features/platform/discovery-domain';
import { readTeacherCover } from './profile-cover-data';
import { safePublicTeacherProfileDetails, teacherProfileDetails } from './profile-details-data';
import { buildTeacherVisitorView } from '@/components/public/teacher-profile';
import { teacherCatalogueChoices, type TeacherCatalogueNode, type TeacherCatalogueOffering, type TeacherCatalogueSubject } from './catalogue-data';
import { catalogueDisplayName } from './catalogue-domain';

export type ProfileCatalogueNode = TeacherCatalogueNode;
export type ProfileCatalogueSubject = TeacherCatalogueSubject;
export type ProfileCatalogueOffering = TeacherCatalogueOffering;
type PublicTeacherRow = { id: string; full_name: string; headline: string | null; avatar_path: string | null };

async function publicNodeAncestors(db: Awaited<ReturnType<typeof createClient>>, nodeIds: string[]) {
  const rows = new Map<string, ProfileCatalogueNode>();
  let frontier = [...new Set(nodeIds)];
  while (frontier.length) {
    const next = new Set<string>();
    for (let offset = 0; offset < frontier.length; offset += 100) {
      const batch = frontier.slice(offset, offset + 100);
      const result = await db.from('education_nodes').select('id,parent_id,kind,name_ar,name_en').in('id', batch);
      if (result.error) return { rows: [] as ProfileCatalogueNode[], error: result.error };
      for (const node of (result.data ?? []) as ProfileCatalogueNode[]) {
        if (rows.has(node.id)) continue;
        rows.set(node.id, node);
        if (node.parent_id && !rows.has(node.parent_id)) next.add(node.parent_id);
      }
    }
    frontier = [...next].filter(id => !rows.has(id));
  }
  return { rows: [...rows.values()], error: null };
}

export async function teacherProfile(locale: Locale) {
  const me = await teacherViewer(locale);
  const ar = locale === 'ar';
  const [contacts, specializations, choices] = await Promise.all([
    me.db.from('teacher_contacts').select('phone_number,whatsapp_number,contact_email,visibility').eq('teacher_id', me.id).maybeSingle(),
    me.db.from('teacher_specializations').select('offering_id').eq('teacher_id', me.id),
    teacherCatalogueChoices(me.db, me.id),
  ]);
  const failed = contacts.error || specializations.error || me.teacherError;
  const selectedIds = (specializations.data ?? []).map(row => row.offering_id);
  const savedOfferingsResult = selectedIds.length
    ? await me.db.from('offerings').select('id,owner_teacher_id,archived_at,node_id,subject_id').in('id', selectedIds)
    : { data: [], error: null };
  const savedOfferings = (savedOfferingsResult.data ?? []) as ProfileCatalogueOffering[];
  const savedSubjectIds = [...new Set(savedOfferings.map(row => row.subject_id))];
  const savedNodeIds = [...new Set(savedOfferings.map(row => row.node_id))];
  const [savedSubjectsResult, savedNodesResult] = await Promise.all([
    savedSubjectIds.length
      ? me.db.from('subjects').select('id,owner_teacher_id,archived_at,name_ar,name_en').in('id', savedSubjectIds)
      : Promise.resolve({ data: [], error: null }),
    savedNodeIds.length
      ? me.db.from('education_nodes').select('id,owner_teacher_id,archived_at,parent_id,kind,name_ar,name_en').in('id', savedNodeIds)
      : Promise.resolve({ data: [], error: null }),
  ]);
  const failedSaved = savedOfferingsResult.error || savedSubjectsResult.error || savedNodesResult.error;
  const savedSubjects = (savedSubjectsResult.data ?? []) as ProfileCatalogueSubject[];
  const savedNodes = (savedNodesResult.data ?? []) as ProfileCatalogueNode[];
  const isOwnOrShared = (owner: string | null) => owner === null || owner === me.id;
  const retainedOfferings = savedOfferings.filter(offering => {
    const subject = savedSubjects.find(row => row.id === offering.subject_id);
    const node = savedNodes.find(row => row.id === offering.node_id);
    return isOwnOrShared(offering.owner_teacher_id) && !!subject && !!node
      && isOwnOrShared(subject.owner_teacher_id) && isOwnOrShared(node.owner_teacher_id);
  });
  const choiceSubjects = choices.subjects as ProfileCatalogueSubject[];
  const choiceNodes = choices.nodes as ProfileCatalogueNode[];
  const subjectRows = [...choiceSubjects];
  const nodeRows = [...choiceNodes];
  for (const offering of retainedOfferings) {
    const subject = savedSubjects.find(row => row.id === offering.subject_id);
    const node = savedNodes.find(row => row.id === offering.node_id);
    if (subject && !subjectRows.some(row => row.id === subject.id)) subjectRows.push(subject);
    if (node && !nodeRows.some(row => row.id === node.id)) nodeRows.push(node);
  }
  const offeringRows = [...retainedOfferings];
  const retainedOfferingIds = retainedOfferings.filter(offering => {
    const subject = savedSubjects.find(row => row.id === offering.subject_id);
    const node = savedNodes.find(row => row.id === offering.node_id);
    return offering.archived_at !== null || subject?.archived_at !== null || node?.archived_at !== null;
  }).map(row => row.id);
  if (failed || choices.error.error || failedSaved) {
    return { me, values: null, contacts: null, selectedOfferingIds: [], nodes: [], subjects: [], offerings: [], avatarUrl: null, coverUrl: null, hasAvatar: false, details: { details: null, version: null, error: ar ? 'تعذر تحميل تفاصيل الملف الشخصي.' : 'Could not load profile details.' }, error: ar ? 'تعذر تحميل بيانات الملف الشخصي. حاول مرة أخرى.' : 'Could not load profile data. Please try again.' };
  }
  if (!me.profile || !me.teacher) {
    return { me, values: null, contacts: null, selectedOfferingIds: [], nodes: [], subjects: [], offerings: [], avatarUrl: null, coverUrl: null, hasAvatar: false, details: { details: null, version: null, error: ar ? 'تعذر تحميل تفاصيل الملف الشخصي.' : 'Could not load profile details.' }, error: ar ? 'ملف المعلم غير موجود.' : 'Teacher profile was not found.' };
  }
  const contact = contacts.data;
  const values: ProfileFormValues = {
    full_name: me.profile.full_name,
    headline: me.teacher.headline ?? '',
    offering_ids: retainedOfferings.map(row => row.id),
    phone_number: contact?.phone_number ?? '',
    whatsapp_number: contact?.whatsapp_number ?? '',
    contact_email: contact?.contact_email ?? '',
    visibility: contact?.visibility === 'public' ? 'public' : 'enrolled',
  };
  const [avatar, cover, details, groupsResult] = await Promise.all([
    me.teacher.avatar_path ? me.db.storage.from('teacher-avatars').createSignedUrl(me.teacher.avatar_path, 300) : null,
    me.teacher.cover_path ? me.db.storage.from('teacher-avatars').createSignedUrl(me.teacher.cover_path, 300) : null,
    teacherProfileDetails(locale, me),
    publicGroups(normalizeDiscoveryFilters({ teacher_id: me.id })),
  ]);
  const previewSpecializations = values.offering_ids.flatMap(offeringId => {
    const offering = offeringRows.find(row => row.id === offeringId);
    const subject = offering && subjectRows.find(row => row.id === offering.subject_id);
    if (!offering || !subject) return [];
    const labels: string[] = [];
    const seen = new Set<string>();
    let node = nodeRows.find(row => row.id === offering.node_id);
    while (node && !seen.has(node.id)) {
      seen.add(node.id);
      const label = catalogueDisplayName(node, locale);
      if (label) labels.unshift(label);
      node = node.parent_id ? nodeRows.find(row => row.id === node?.parent_id) : undefined;
    }
    const subjectLabel = catalogueDisplayName(subject, locale);
    return subjectLabel && labels.length ? [{ id: offering.id, subject: subjectLabel, context: labels.join(' › ') }] : [];
  });
  return {
    me,
    values,
    contacts: contact,
    selectedOfferingIds: values.offering_ids,
    nodes: nodeRows,
    subjects: subjectRows,
    offerings: offeringRows,
    retainedOfferingIds,
    avatarUrl: avatar?.error ? null : avatar?.data?.signedUrl ?? null,
    coverUrl: cover?.error ? null : cover?.data?.signedUrl ?? null,
    hasAvatar: !!me.teacher.avatar_path,
    details,
    previewSpecializations,
    previewGroups: groupsResult.error ? [] : groupsResult.data,
    error: null,
  };
}

export async function publicTeacherDetail(locale: Locale, teacherId: string) {
  const db = await createClient();
  const [teacherResult, contactsResult, specializationResult] = await Promise.all([
    db.rpc('public_teachers').eq('id', teacherId).maybeSingle(),
    db.from('teacher_contacts').select('phone_number,whatsapp_number,contact_email,visibility').eq('teacher_id', teacherId).maybeSingle(),
    db.rpc('public_teacher_specializations', { p_teacher_id: teacherId }),
  ]);
  const ar = locale === 'ar';
  if (teacherResult.error || contactsResult.error || specializationResult.error) {
    return { teacher: null, visitor: null, avatarUrl: null, error: ar ? 'تعذر تحميل ملف المعلم. حاول مرة أخرى.' : 'Could not load this teacher profile. Please try again.' };
  }
  const teacher = teacherResult.data as unknown as PublicTeacherRow | null;
  if (!teacher) return { teacher: null, visitor: null, avatarUrl: null, error: null };

  const offeringIds = ((specializationResult.data ?? []) as Array<{ offering_id: string }>).map(row => row.offering_id);
  const [offerings, detailsResult, coverResult, groupsResult] = await Promise.all([
    offeringIds.length ? db.from('offerings').select('id,node_id,subject_id').in('id', offeringIds) : Promise.resolve({ data: [], error: null }),
    db.rpc('public_teacher_profile_details', { p_teacher_id: teacherId }),
    db.rpc('public_teacher_cover_path', { p_teacher_id: teacherId }),
    publicGroups(normalizeDiscoveryFilters({ teacher_id: teacherId })),
  ]);
  if (offerings.error || detailsResult.error || coverResult.error || groupsResult.error) {
    return { teacher: null, visitor: null, avatarUrl: null, error: ar ? 'تعذر تحميل ملف المعلم. حاول مرة أخرى.' : 'Could not load this teacher profile. Please try again.' };
  }

  const offeringRows = (offerings.data ?? []) as ProfileCatalogueOffering[];
  const subjectIds = [...new Set(offeringRows.map(row => row.subject_id))];
  const nodeIds = [...new Set(offeringRows.map(row => row.node_id))];
  const [subjects, nodes] = await Promise.all([
    subjectIds.length ? db.from('subjects').select('id,name_ar,name_en').in('id', subjectIds) : Promise.resolve({ data: [], error: null }),
    publicNodeAncestors(db, nodeIds),
  ]);
  if (subjects.error || nodes.error) {
    return { teacher: null, visitor: null, avatarUrl: null, error: ar ? 'تعذر تحميل ملف المعلم. حاول مرة أخرى.' : 'Could not load this teacher profile. Please try again.' };
  }

  const localized = (row: { name_ar: string; name_en: string }) => catalogueDisplayName(row, locale);
  const nodeRows = nodes.rows;
  const subjectRows = (subjects.data ?? []) as ProfileCatalogueSubject[];
  const specializations = offeringRows.flatMap(offering => {
    const subject = subjectRows.find(row => row.id === offering.subject_id);
    if (!subject) return [];
    const labels: string[] = [];
    const seen = new Set<string>();
    let node = nodeRows.find(row => row.id === offering.node_id);
    while (node && !seen.has(node.id)) {
      seen.add(node.id);
      labels.unshift(localized(node));
      node = node.parent_id ? nodeRows.find(row => row.id === node?.parent_id) : undefined;
    }
    return [{ id: offering.id, subject: localized(subject), context: labels.join(' › ') }];
  });
  const [avatar, coverUrl] = await Promise.all([
    teacher.avatar_path
    ? await db.storage.from('teacher-avatars').createSignedUrl(teacher.avatar_path, 300)
    : null,
    readTeacherCover(db, coverResult.data ?? null),
  ]);
  const visitor = buildTeacherVisitorView({
    teacher: { id: teacher.id, full_name: teacher.full_name, headline: teacher.headline },
    details: safePublicTeacherProfileDetails(detailsResult.data),
    contactVisibility: contactsResult.data?.visibility ?? null,
    contacts: contactsResult.data,
    contactPolicy: 'viewer-authorized',
    specializations,
    groups: groupsResult.data,
    avatarUrl: avatar?.error ? null : avatar?.data?.signedUrl ?? null,
    coverUrl,
  });
  return {
    teacher: visitor.teacher,
    visitor,
    avatarUrl: visitor.avatarUrl,
    error: null,
  };
}
