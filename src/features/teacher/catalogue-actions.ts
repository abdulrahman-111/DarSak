'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { createClient } from '@/lib/supabase/server';
import { checkTeachingAccess, teachingGuardMessage } from '@/features/teacher-access/guard';
import { idSchema, type Locale } from '@/features/student/domain';
import { catalogueLabelSchema, teacherCategorySchema } from './catalogue-domain';
import type { TeacherCatalogueCategory, TeacherCatalogueSubject } from './catalogue-data';

export type TeacherCatalogueActionState = {
  error?: string;
  success?: string;
  fieldErrors?: Record<string, string>;
  id?: string;
  row?: TeacherCatalogueSubject | TeacherCatalogueCategory;
} | null;

const message = (locale: Locale, en: string, ar: string) => locale === 'ar' ? ar : en;

function errorsFrom(error: z.ZodError) {
  const fieldErrors: Record<string, string> = {};
  for (const issue of error.issues) fieldErrors[String(issue.path[0] ?? 'form')] ??= 'invalid';
  return fieldErrors;
}
async function activeTeacher() {
  const db = await createClient();
  const { data: { user } } = await db.auth.getUser();
  if (!user) return null;
  const { data: profile, error } = await db.from('profiles').select('role,status').eq('id', user.id).maybeSingle();
  if (error || profile?.role !== 'teacher' || profile.status !== 'active') return null;
  const access=await checkTeachingAccess(db);if(!access.allowed)return {db,id:user.id,guardReason:access.reason};
  return { db, id: user.id, guardReason:null };
}

function parseId(value: FormDataEntryValue | null) {
  if (value === null || value === '') return { id: null as string | null, valid: true };
  if (typeof value !== 'string' || !idSchema.safeParse(value).success) return { id: null, valid: false };
  return { id: value, valid: true };
}

function revalidateCatalogue() {
  for (const currentLocale of ['en', 'ar'] as const) {
    revalidatePath(`/${currentLocale}/teacher/catalogue`);
    revalidatePath(`/${currentLocale}/teacher/groups`);
    revalidatePath(`/${currentLocale}/teacher/groups/new`);
    revalidatePath(`/${currentLocale}/account/profile`);
    revalidatePath(`/${currentLocale}/teacher`);
    revalidatePath(`/${currentLocale}/teachers`);
    revalidatePath(`/${currentLocale}/groups`);
  }
  revalidatePath('/[locale]/teacher/groups/[id]', 'page');
  revalidatePath('/[locale]/teacher/groups/[id]/setup', 'page');
  revalidatePath('/[locale]/teachers/[id]', 'page');
  revalidatePath('/[locale]/groups/[id]', 'page');
}

function saveError(locale: Locale, raw = '') {
  if(raw.toLowerCase()==='teacher teaching access expired')return locale==='ar'?'انتهت صلاحية التدريس. جدّد الوصول من صفحة صلاحية التدريس.':'Teaching access has expired. Renew access from the teaching access page.';
  const lower = raw.toLowerCase();
  if (lower.includes('active teacher')) return message(locale, 'An active teacher account is required.', 'يلزم حساب معلم نشط.');
  if (lower.includes('not found') || lower.includes('not owned') || lower.includes('owned') || lower.includes('changed')) {
    return message(locale, 'This item could not be saved. It may have changed or no longer be available; refresh and try again.', 'تعذر حفظ هذا العنصر. ربما تغير أو لم يعد متاحاً؛ حدّث الصفحة وحاول مرة أخرى.');
  }
  return message(locale, 'Your catalogue could not be saved. Please try again.', 'تعذر حفظ الدليل التعليمي. حاول مرة أخرى.');
}

export async function saveTeacherCatalogueSubject(locale: Locale, _state: TeacherCatalogueActionState, form: FormData): Promise<TeacherCatalogueActionState> {
  const parsed = catalogueLabelSchema.safeParse({ name_ar: form.get('name_ar'), name_en: form.get('name_en') });
  if (!parsed.success) return { error: message(locale, 'Enter a name in Arabic or English, up to 120 characters.', 'أدخل اسماً بالعربية أو الإنجليزية، بحد أقصى ١٢٠ حرفاً.'), fieldErrors: errorsFrom(parsed.error) };
  const parsedId = parseId(form.get('id'));
  if (!parsedId.valid) return { error: saveError(locale) };
  const me = await activeTeacher();
  if (!me) return { error: message(locale, 'An active teacher account is required.', 'يلزم حساب معلم نشط.') };
  if(me.guardReason)return {error:teachingGuardMessage(locale,me.guardReason)};

  const { data: id, error } = await me.db.rpc('save_teacher_subject', {
    p_id: parsedId.id,
    p_name_ar: parsed.data.name_ar,
    p_name_en: parsed.data.name_en,
  });
  if (error || typeof id !== 'string' || !idSchema.safeParse(id).success) return { error: saveError(locale, error?.message) };
  const saved = await me.db.from('subjects').select('id,owner_teacher_id,archived_at,name_ar,name_en').eq('id', id).eq('owner_teacher_id', me.id).maybeSingle();
  if (saved.error || !saved.data) return { error: saveError(locale) };
  revalidateCatalogue();
  return { id, row: saved.data as TeacherCatalogueSubject, success: message(locale, 'Subject saved.', 'تم حفظ المادة.') };
}

export async function saveTeacherCatalogueCategory(locale: Locale, _state: TeacherCatalogueActionState, form: FormData): Promise<TeacherCatalogueActionState> {
  const rawKind = form.get('kind');
  const parsed = teacherCategorySchema.safeParse({ name_ar: form.get('name_ar'), name_en: form.get('name_en'), kind: rawKind });
  if (!parsed.success) return { error: message(locale, 'Enter a name in Arabic or English and choose a category type.', 'أدخل اسماً بالعربية أو الإنجليزية واختر نوع الفئة.'), fieldErrors: errorsFrom(parsed.error) };
  const parsedId = parseId(form.get('id'));
  if (!parsedId.valid) return { error: saveError(locale) };
  const me = await activeTeacher();
  if (!me) return { error: message(locale, 'An active teacher account is required.', 'يلزم حساب معلم نشط.') };
  if(me.guardReason)return {error:teachingGuardMessage(locale,me.guardReason)};

  const { data: id, error } = await me.db.rpc('save_teacher_category', {
    p_id: parsedId.id,
    p_kind: parsed.data.kind,
    p_name_ar: parsed.data.name_ar,
    p_name_en: parsed.data.name_en,
  });
  if (error || typeof id !== 'string' || !idSchema.safeParse(id).success) return { error: saveError(locale, error?.message) };
  const saved = await me.db.from('education_nodes').select('id,owner_teacher_id,archived_at,parent_id,kind,name_ar,name_en').eq('id', id).eq('owner_teacher_id', me.id).eq('kind', parsed.data.kind).maybeSingle();
  if (saved.error || !saved.data) return { error: saveError(locale) };
  revalidateCatalogue();
  return { id, row: saved.data as TeacherCatalogueCategory, success: message(locale, 'Category saved.', 'تم حفظ الفئة.') };
}

export async function setTeacherCatalogueArchived(locale: Locale, _state: TeacherCatalogueActionState, form: FormData): Promise<TeacherCatalogueActionState> {
  const kindValue = form.get('kind');
  const idValue = form.get('id');
  const archivedValue = form.get('archived');
  const kindSchema = z.enum(['subject', 'category']);
  const kind = kindSchema.safeParse(kindValue);
  if (!kind.success || typeof idValue !== 'string' || !idSchema.safeParse(idValue).success || (archivedValue !== 'true' && archivedValue !== 'false')) {
    return { error: saveError(locale) };
  }
  const me = await activeTeacher();
  if (!me) return { error: message(locale, 'An active teacher account is required.', 'يلزم حساب معلم نشط.') };
  if(me.guardReason)return {error:teachingGuardMessage(locale,me.guardReason)};
  const { error } = await me.db.rpc('set_teacher_catalogue_archived', { p_kind: kind.data, p_id: idValue, p_archived: archivedValue === 'true' });
  if (error) return { error: saveError(locale, error.message) };
  revalidateCatalogue();
  return { success: archivedValue === 'true'
    ? message(locale, 'Item archived. Existing groups and history are kept.', 'تمت أرشفة العنصر مع الاحتفاظ بالمجموعات والسجل الحاليين.')
    : message(locale, 'Item restored to future choices.', 'أُعيد العنصر إلى الخيارات المستقبلية.') };
}
