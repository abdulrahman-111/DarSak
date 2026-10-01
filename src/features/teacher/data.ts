import 'server-only';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import type { Locale } from '@/features/student/domain';

export async function teacherViewer(locale: Locale) {
  const db = await createClient();
  const { data: { user } } = await db.auth.getUser();
  if (!user) redirect(`/${locale}/login`);
  const { data: profile } = await db.from('profiles').select('id,full_name,role,status').eq('id', user.id).single();
  if (!profile || profile.role !== 'teacher' || profile.status !== 'active') redirect(`/${locale}/dashboard`);
  const { data: teacher } = await db.from('teacher_profiles').select('headline,bio,approved').eq('id', user.id).single();
  return { db, id: user.id, profile, teacher };
}

export async function teacherOverview(locale: Locale) {
  const me = await teacherViewer(locale);
  const now = new Date().toISOString();
  const [groups, lessons, requests] = await Promise.all([
    me.db.from('groups').select('id,name,capacity,status,location,offering:offerings(subject:subjects(name_ar,name_en)),enrollments(status)', { count: 'exact' }).eq('teacher_id', me.id).order('created_at', { ascending: false }),
    me.db.from('lessons').select('id,group_id,title,starts_at,ends_at,status,group:groups(name)').gte('ends_at', now).order('starts_at').limit(8),
    me.db.from('enrollments').select('id,group_id,status', { count: 'exact' }).eq('status', 'pending').in('group_id', (await me.db.from('groups').select('id').eq('teacher_id', me.id)).data?.map((row) => row.id) ?? []),
  ]);
  return { me, groups: groups.data ?? [], lessons: lessons.data ?? [], requests: requests.data ?? [], error: groups.error ?? lessons.error ?? requests.error };
}

export async function teacherRequests(locale: Locale) {
  const me = await teacherViewer(locale);
  const { data: groups, error } = await me.db.from('groups').select('id,name,capacity,enrollments(status)').eq('teacher_id', me.id).order('name');
  if (error) return { me, groups: [], requests: [], error };
  const requests: Array<{ enrollment_id: string; student_id: string; full_name: string; status: string; group_id: string; group_name: string }> = [];
  for (const group of groups ?? []) {
    const { data, error: studentsError } = await me.db.rpc('group_students', { p_group_id: group.id });
    if (studentsError) return { me, groups: groups ?? [], requests, error: studentsError };
    for (const row of data ?? []) requests.push({ ...row, group_id: group.id, group_name: group.name });
  }
  return { me, groups: groups ?? [], requests, error: null };
}

export async function teacherLessons(locale: Locale) {
  const me = await teacherViewer(locale);
  const { data, error } = await me.db.from('lessons').select('id,group_id,title,starts_at,ends_at,status,notes,group:groups(name)').order('starts_at', { ascending: false }).limit(100);
  return { me, lessons: data ?? [], error };
}

export async function teacherLesson(locale: Locale, id: string) {
  const me = await teacherViewer(locale);
  const { data: lesson, error } = await me.db.from('lessons').select('id,group_id,title,starts_at,ends_at,status,notes,group:groups(name)').eq('id', id).maybeSingle();
  if (error || !lesson) return null;
  const { data: materials, error: materialError } = await me.db.from('lesson_materials').select('*').eq('lesson_id', id).order('created_at', { ascending: false });
  return { me, lesson, materials: materials ?? [], error: materialError };
}
