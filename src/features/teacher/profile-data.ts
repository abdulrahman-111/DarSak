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

export type ProfileCatalogueNode = { id: string; parent_id: string | null; kind: string; name_ar: string; name_en: string };
export type ProfileCatalogueSubject = { id: string; name_ar: string; name_en: string };
export type ProfileCatalogueOffering = { id: string; node_id: string; subject_id: string };
type PublicTeacherRow = { id: string; full_name: string; headline: string | null; avatar_path: string | null };

export async function teacherProfile(locale: Locale) {
  const me = await teacherViewer(locale);
  const ar = locale === 'ar';
  const [profile, teacher, contacts, specializations, nodes, subjects, offerings] = await Promise.all([
    me.db.from('profiles').select('id,full_name').eq('id', me.id).maybeSingle(),
    me.db.from('teacher_profiles').select('id,headline,avatar_path,cover_path').eq('id', me.id).maybeSingle(),
    me.db.from('teacher_contacts').select('phone_number,whatsapp_number,contact_email,visibility').eq('teacher_id', me.id).maybeSingle(),
    me.db.from('teacher_specializations').select('offering_id').eq('teacher_id', me.id),
    me.db.from('education_nodes').select('id,parent_id,kind,name_ar,name_en').order('name_en'),
    me.db.from('subjects').select('id,name_ar,name_en').order('name_en'),
    me.db.from('offerings').select('id,node_id,subject_id'),
  ]);
  const failed = [profile, teacher, contacts, specializations, nodes, subjects, offerings].find(result => result.error);
  if (failed?.error) {
    return { me, values: null, contacts: null, selectedOfferingIds: [], nodes: [], subjects: [], offerings: [], avatarUrl: null, coverUrl: null, hasAvatar: false, details: { details: null, version: null, error: ar ? 'تعذر تحميل تفاصيل الملف الشخصي.' : 'Could not load profile details.' }, error: ar ? 'تعذر تحميل بيانات الملف الشخصي. حاول مرة أخرى.' : 'Could not load profile data. Please try again.' };
  }
  if (!profile.data || !teacher.data) {
    return { me, values: null, contacts: null, selectedOfferingIds: [], nodes: [], subjects: [], offerings: [], avatarUrl: null, coverUrl: null, hasAvatar: false, details: { details: null, version: null, error: ar ? 'تعذر تحميل تفاصيل الملف الشخصي.' : 'Could not load profile details.' }, error: ar ? 'ملف المعلم غير موجود.' : 'Teacher profile was not found.' };
  }
  const contact = contacts.data;
  const values: ProfileFormValues = {
    full_name: profile.data.full_name,
    headline: teacher.data.headline ?? '',
    offering_ids: (specializations.data ?? []).map(row => row.offering_id),
    phone_number: contact?.phone_number ?? '',
    whatsapp_number: contact?.whatsapp_number ?? '',
    contact_email: contact?.contact_email ?? '',
    visibility: contact?.visibility === 'public' ? 'public' : 'enrolled',
  };
  const [avatar, cover, details, groupsResult] = await Promise.all([
    teacher.data.avatar_path ? me.db.storage.from('teacher-avatars').createSignedUrl(teacher.data.avatar_path, 300) : null,
    teacher.data.cover_path ? me.db.storage.from('teacher-avatars').createSignedUrl(teacher.data.cover_path, 300) : null,
    teacherProfileDetails(locale),
    publicGroups(normalizeDiscoveryFilters({ teacher_id: me.id })),
  ]);
  const nodeRows = (nodes.data ?? []) as ProfileCatalogueNode[];
  const subjectRows = (subjects.data ?? []) as ProfileCatalogueSubject[];
  const offeringRows = (offerings.data ?? []) as ProfileCatalogueOffering[];
  const previewSpecializations = values.offering_ids.flatMap(offeringId => {
    const offering = offeringRows.find(row => row.id === offeringId);
    const subject = offering && subjectRows.find(row => row.id === offering.subject_id);
    if (!offering || !subject) return [];
    const labels: string[] = [];
    const seen = new Set<string>();
    let node = nodeRows.find(row => row.id === offering.node_id);
    while (node && !seen.has(node.id)) {
      seen.add(node.id);
      labels.unshift(ar ? node.name_ar : node.name_en);
      node = node.parent_id ? nodeRows.find(row => row.id === node?.parent_id) : undefined;
    }
    return [{ id: offering.id, subject: ar ? subject.name_ar : subject.name_en, context: labels.join(' › ') }];
  });
  return {
    me,
    values,
    contacts: contact,
    selectedOfferingIds: values.offering_ids,
    nodes: (nodes.data ?? []) as ProfileCatalogueNode[],
    subjects: (subjects.data ?? []) as ProfileCatalogueSubject[],
    offerings: (offerings.data ?? []) as ProfileCatalogueOffering[],
    avatarUrl: avatar?.error ? null : avatar?.data?.signedUrl ?? null,
    coverUrl: cover?.error ? null : cover?.data?.signedUrl ?? null,
    hasAvatar: !!teacher.data.avatar_path,
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
  const [offerings, nodes, subjects, detailsResult, coverResult, groupsResult] = await Promise.all([
    offeringIds.length ? db.from('offerings').select('id,node_id,subject_id').in('id', offeringIds) : Promise.resolve({ data: [], error: null }),
    db.from('education_nodes').select('id,parent_id,kind,name_ar,name_en').order('name_en'),
    db.from('subjects').select('id,name_ar,name_en').order('name_en'),
    db.rpc('public_teacher_profile_details', { p_teacher_id: teacherId }),
    db.rpc('public_teacher_cover_path', { p_teacher_id: teacherId }),
    publicGroups(normalizeDiscoveryFilters({ teacher_id: teacherId })),
  ]);
  if (offerings.error || nodes.error || subjects.error || detailsResult.error || coverResult.error || groupsResult.error) {
    return { teacher: null, visitor: null, avatarUrl: null, error: ar ? 'تعذر تحميل ملف المعلم. حاول مرة أخرى.' : 'Could not load this teacher profile. Please try again.' };
  }

  const localized = (row: { name_ar: string; name_en: string }) => ar ? row.name_ar : row.name_en;
  const nodeRows = (nodes.data ?? []) as ProfileCatalogueNode[];
  const subjectRows = (subjects.data ?? []) as ProfileCatalogueSubject[];
  const offeringRows = (offerings.data ?? []) as ProfileCatalogueOffering[];
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
