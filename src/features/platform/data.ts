import { cache } from 'react';
import { unstable_cache } from 'next/cache';
import type { PostgrestError } from '@supabase/supabase-js';
import { createClient } from '@/lib/supabase/server';
import { createPublicClient, type PublicClient } from '@/lib/supabase/public';
import { getRequestViewer } from './request-viewer';
import { PUBLIC_DISCOVERY_REVALIDATE_SECONDS, PUBLIC_DISCOVERY_TAG } from './discovery-cache';
import type { DiscoverGroupRow, Group, Teacher, Slot, Lesson } from '@/lib/supabase/types';
import {
  discoveryRpcArgs,
  normalizeDiscoveryFilters,
  type DiscoveryFilters,
} from './discovery-domain';
/**
 * Shares one result of a visitor-independent public read across requests. A failed
 * or unusable read throws inside the cache so it is never stored, and the caller
 * then repeats the read per request with the visitor's own client (the previous
 * behaviour). Never route per-user data through this.
 */
async function sharedPublicRead<R>(
  cached: () => Promise<R>,
  perRequest: () => Promise<R>,
): Promise<R> {
  try {
    return await cached();
  } catch {
    return perRequest();
  }
}
function cachePublic<A extends unknown[], R extends { error: unknown }>(
  keyPart: string,
  read: (db: PublicClient, ...args: A) => PromiseLike<R>,
  usable: (result: R) => boolean = () => true,
) {
  return unstable_cache(
    async (...args: A) => {
      const db = createPublicClient();
      if (!db) throw new Error('Supabase is not configured');
      const result = await read(db, ...args);
      if (result.error || !usable(result)) throw new Error('uncacheable public read');
      return result;
    },
    ['public-discovery', keyPart],
    { revalidate: PUBLIC_DISCOVERY_REVALIDATE_SECONDS, tags: [PUBLIC_DISCOVERY_TAG] },
  );
}
const isDefaultDiscovery = (filters: DiscoveryFilters) =>
  JSON.stringify(filters) === JSON.stringify(normalizeDiscoveryFilters({}));
export async function currentUser() {
  const viewer = await getRequestViewer();
  if (!viewer.user) return null;
  return { user: viewer.user, profile: viewer.profile };
}
const readPublicTeachers = async (db: Pick<PublicClient, 'rpc'>) => {
  const { data, error } = await db.rpc('public_teachers');
  return { data: (data || []) as Teacher[], error };
};
const cachedPublicTeachers = cachePublic('teachers', readPublicTeachers);
export async function publicTeachers() {
  return sharedPublicRead(cachedPublicTeachers, async () =>
    readPublicTeachers(await createClient()),
  );
}
export type PublicTeacherChoice = Pick<Teacher, 'id' | 'full_name'>;
const readTeacherChoices = async (
  db: Pick<PublicClient, 'rpc'>,
  search: string | null,
  selectedTeacherId: string | null,
) => {
  const { data, error } = await db.rpc('public_teacher_choices', {
    p_search: search,
    p_selected: selectedTeacherId,
  });
  return { data: (data ?? []) as PublicTeacherChoice[], error };
};
const readTeacherSample = async (db: Pick<PublicClient, 'rpc'>, limit: number) => {
  const { data, error } = await db
    .rpc('public_teacher_choices', { p_search: null, p_selected: null })
    .limit(limit);
  return { data: (data ?? []) as PublicTeacherChoice[], error };
};
const cachedTeacherChoices = cachePublic('teacher-choices', readTeacherChoices);
const cachedTeacherSample = cachePublic('teacher-sample', readTeacherSample);
export async function publicTeacherChoices(search: string, selectedTeacherId: string | null) {
  const term = search.trim().slice(0, 80) || null;
  // Only the unfiltered list is shared: free-text searches would create unbounded cache keys.
  if (term === null && selectedTeacherId === null)
    return sharedPublicRead(
      () => cachedTeacherChoices(null, null),
      async () => readTeacherChoices(await createClient(), null, null),
    );
  return readTeacherChoices(await createClient(), term, selectedTeacherId);
}
export async function publicTeacherSample(limit = 3) {
  return sharedPublicRead(
    () => cachedTeacherSample(limit),
    async () => readTeacherSample(await createClient(), limit),
  );
}
export function mapDiscoverGroup(group: DiscoverGroupRow): Group {
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
const readPublicGroups = async (
  db: Pick<PublicClient, 'rpc'>,
  filters: DiscoveryFilters,
  limit: number,
): Promise<{ data: Group[]; error: PostgrestError | null }> => {
  const { data, error } = await db.rpc('discover_groups', {
    ...discoveryRpcArgs(filters),
    p_limit: limit,
  });
  const groups = ((data ?? []) as DiscoverGroupRow[]).map(mapDiscoverGroup);
  return { data: groups, error };
};
const cachedPublicGroups = cachePublic('groups', readPublicGroups);
export async function publicGroups(
  filters: DiscoveryFilters = normalizeDiscoveryFilters({}),
  limit = discoveryRpcArgs(filters).p_limit,
): Promise<{ data: Group[]; error: PostgrestError | null }> {
  // Only the unfiltered first page is shared; filtered listings (search text, ids) stay per request.
  if (isDefaultDiscovery(filters))
    return sharedPublicRead(
      () => cachedPublicGroups(filters, limit),
      async () => readPublicGroups(await createClient(), filters, limit),
    );
  return readPublicGroups(await createClient(), filters, limit);
}
// Memoized per request so the page and its generateMetadata share one fetch.
export const publicGroupDetail = cache(
  async (groupId: string): Promise<{ data: Group | null; error: PostgrestError | null }> => {
    const db = await createClient();
    const { data, error } = await db.rpc('public_group_detail', { p_group_id: groupId });
    const row = ((data ?? []) as DiscoverGroupRow[])[0] ?? null;
    return { data: row ? mapDiscoverGroup(row) : null, error };
  },
);
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
const isCatalogueProjection = (data: unknown) =>
  !!data &&
  typeof data === 'object' &&
  Array.isArray((data as { nodes?: unknown }).nodes) &&
  Array.isArray((data as { subjects?: unknown }).subjects);
const readCatalogue = async (db: Pick<PublicClient, 'rpc'>) => {
  const { data, error } = await db.rpc('public_discovery_catalogue');
  return { data: data as unknown, error };
};
const cachedCatalogue = cachePublic('catalogue', readCatalogue, result =>
  isCatalogueProjection(result.data),
);
export async function catalogue() {
  const { data, error } = await sharedPublicRead(cachedCatalogue, async () =>
    readCatalogue(await createClient()),
  );
  const projection =
    data && typeof data === 'object' ? (data as { nodes?: unknown; subjects?: unknown }) : null;
  const nodes = Array.isArray(projection?.nodes) ? projection.nodes : [];
  const subjects = Array.isArray(projection?.subjects) ? projection.subjects : [];
  const invalidProjection = !isCatalogueProjection(data);
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
  // Reuse the request's verified viewer (deduplicated with the page's own check)
  // instead of another auth.getUser() round trip; RLS still scopes every read.
  const viewer = await getRequestViewer();
  const { db } = viewer;
  if (role === 'teacher') {
    if (!viewer.user) return { data: [], error: null };
    return db
      .from('groups')
      .select('*, offering:offerings(id,subject:subjects(name_ar,name_en))')
      .eq('teacher_id', viewer.user.id)
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
