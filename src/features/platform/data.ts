import type { PostgrestError } from '@supabase/supabase-js';
import { createClient } from '@/lib/supabase/server';
import { getRequestViewer } from './request-viewer';
import type { DiscoverGroupRow, Group, Teacher, Slot, Lesson } from '@/lib/supabase/types';
import {
  discoveryRpcArgs,
  normalizeDiscoveryFilters,
  type DiscoveryFilters,
} from './discovery-domain';
export async function currentUser() {
  const viewer = await getRequestViewer();
  if (!viewer.user) return null;
  return { user: viewer.user, profile: viewer.profile };
}
export async function publicTeachers() {
  const db = await createClient();
  const { data, error } = await db.rpc('public_teachers');
  return { data: (data || []) as Teacher[], error };
}
export type PublicTeacherChoice = Pick<Teacher, 'id' | 'full_name'>;
export async function publicTeacherChoices(search: string, selectedTeacherId: string | null) {
  const db = await createClient();
  const { data, error } = await db.rpc('public_teacher_choices', {
    p_search: search.trim().slice(0, 80) || null,
    p_selected: selectedTeacherId,
  });
  return { data: (data ?? []) as PublicTeacherChoice[], error };
}
export async function publicTeacherSample(limit = 3) {
  const db = await createClient();
  const { data, error } = await db
    .rpc('public_teacher_choices', { p_search: null, p_selected: null })
    .limit(limit);
  return { data: (data ?? []) as PublicTeacherChoice[], error };
}
function mapDiscoverGroup(group: DiscoverGroupRow): Group {
  return {
    id: group.id,
    teacher_id: group.teacher_id,
    offering_id: group.offering_id,
    name: group.name,
    description: group.description,
    capacity: group.capacity,
    status: group.status,
    location: group.location,
    created_at: group.created_at,
    accepted_count: group.accepted_count,
    available_seats: group.available_seats,
    weekdays: group.weekdays,
    next_lesson_at: group.next_lesson_at,
    teacher: { id: group.teacher_id, full_name: group.teacher_name },
    offering: {
      id: group.offering_id,
      subject: { name_ar: group.subject_name_ar, name_en: group.subject_name_en },
      node: { name_ar: group.node_name_ar, name_en: group.node_name_en },
    },
  };
}
export async function publicGroups(
  filters: DiscoveryFilters = normalizeDiscoveryFilters({}),
  limit = discoveryRpcArgs(filters).p_limit,
): Promise<{ data: Group[]; error: PostgrestError | null }> {
  const db = await createClient();
  const { data, error } = await db.rpc('discover_groups', {
    ...discoveryRpcArgs(filters),
    p_limit: limit,
  });
  const groups = ((data ?? []) as DiscoverGroupRow[]).map(mapDiscoverGroup);
  return { data: groups, error };
}
export async function publicGroupDetail(
  groupId: string,
): Promise<{ data: Group | null; error: PostgrestError | null }> {
  const db = await createClient();
  const { data, error } = await db.rpc('public_group_detail', { p_group_id: groupId });
  const row = ((data ?? []) as DiscoverGroupRow[])[0] ?? null;
  return { data: row ? mapDiscoverGroup(row) : null, error };
}
export async function groupById(id: string) {
  const db = await createClient();
  return db
    .from('groups')
    .select('*, offering:offerings(id,subject:subjects(name_ar,name_en))')
    .eq('id', id)
    .single();
}
export async function teacherById(id: string) {
  const db = await createClient();
  return db.rpc('public_teachers').eq('id', id).single();
}
export async function catalogue() {
  const db = await createClient();
  const { data, error } = await db.rpc('public_discovery_catalogue');
  const projection =
    data && typeof data === 'object' ? (data as { nodes?: unknown; subjects?: unknown }) : null;
  const nodes = Array.isArray(projection?.nodes) ? projection.nodes : [];
  const subjects = Array.isArray(projection?.subjects) ? projection.subjects : [];
  const invalidProjection =
    !projection || !Array.isArray(projection.nodes) || !Array.isArray(projection.subjects);
  return {
    nodes,
    subjects,
    offerings: [],
    error:
      error ||
      (invalidProjection ? { message: 'Public discovery catalogue was unavailable.' } : null),
  };
}
export async function myGroups(role: string) {
  const db = await createClient();
  if (role === 'teacher') {
    const {
      data: { user },
    } = await db.auth.getUser();
    if (!user) return { data: [], error: null };
    return db
      .from('groups')
      .select('*, offering:offerings(id,subject:subjects(name_ar,name_en))')
      .eq('teacher_id', user.id)
      .order('created_at', { ascending: false });
  }
  return db
    .from('enrollments')
    .select('status, group:groups(*, offering:offerings(id,subject:subjects(name_ar,name_en)))')
    .in('status', ['pending', 'accepted'])
    .order('updated_at', { ascending: false });
}
export async function myLessons(role: string) {
  const db = await createClient();
  return role === 'teacher'
    ? db.from('lessons').select('*').order('starts_at')
    : db.from('lessons').select('*, groups!inner(*)').order('starts_at');
}
export async function notifications() {
  const me = await currentUser();
  if (!me) return { data: [], error: null };
  const db = await createClient();
  return db
    .from('notifications')
    .select('*')
    .eq('user_id', me.user.id)
    .order('created_at', { ascending: false });
}
