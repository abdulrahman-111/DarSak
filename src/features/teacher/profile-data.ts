import 'server-only';
import { teacherViewer } from './data';
import type { Locale } from '@/features/student/domain';
import type { ProfileFormValues } from './profile-domain';

export type ProfileCatalogueNode = { id: string; parent_id: string | null; kind: string; name_ar: string; name_en: string };
export type ProfileCatalogueSubject = { id: string; name_ar: string; name_en: string };
export type ProfileCatalogueOffering = { id: string; node_id: string; subject_id: string };

export async function teacherProfile(locale: Locale) {
  const me = await teacherViewer(locale);
  const ar = locale === 'ar';
  const [profile, teacher, contacts, specializations, nodes, subjects, offerings] = await Promise.all([
    me.db.from('profiles').select('id,full_name').eq('id', me.id).maybeSingle(),
    me.db.from('teacher_profiles').select('id,headline,bio').eq('id', me.id).maybeSingle(),
    me.db.from('teacher_contacts').select('phone_number,whatsapp_number,contact_email,visibility').eq('teacher_id', me.id).maybeSingle(),
    me.db.from('teacher_specializations').select('offering_id').eq('teacher_id', me.id),
    me.db.from('education_nodes').select('id,parent_id,kind,name_ar,name_en').order('name_en'),
    me.db.from('subjects').select('id,name_ar,name_en').order('name_en'),
    me.db.from('offerings').select('id,node_id,subject_id'),
  ]);
  const failed = [profile, teacher, contacts, specializations, nodes, subjects, offerings].find(result => result.error);
  if (failed?.error) {
    return { me, values: null, contacts: null, selectedOfferingIds: [], nodes: [], subjects: [], offerings: [], error: ar ? 'تعذر تحميل بيانات الملف الشخصي. حاول مرة أخرى.' : 'Could not load profile data. Please try again.' };
  }
  if (!profile.data || !teacher.data) {
    return { me, values: null, contacts: null, selectedOfferingIds: [], nodes: [], subjects: [], offerings: [], error: ar ? 'ملف المعلم غير موجود.' : 'Teacher profile was not found.' };
  }
  const contact = contacts.data;
  const values: ProfileFormValues = {
    full_name: profile.data.full_name,
    headline: teacher.data.headline ?? '',
    bio: teacher.data.bio ?? '',
    offering_ids: (specializations.data ?? []).map(row => row.offering_id),
    phone_number: contact?.phone_number ?? '',
    whatsapp_number: contact?.whatsapp_number ?? '',
    contact_email: contact?.contact_email ?? '',
    visibility: contact?.visibility === 'public' ? 'public' : 'enrolled',
  };
  return {
    me,
    values,
    contacts: contact,
    selectedOfferingIds: values.offering_ids,
    nodes: (nodes.data ?? []) as ProfileCatalogueNode[],
    subjects: (subjects.data ?? []) as ProfileCatalogueSubject[],
    offerings: (offerings.data ?? []) as ProfileCatalogueOffering[],
    error: null,
  };
}
