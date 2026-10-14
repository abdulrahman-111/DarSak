import 'server-only';
import { student, viewer } from './data';
import type { Locale } from './domain';
import { SAVED_GROUP_PAGE_SIZE, savedGroupOffset } from './saved-domain';

export type SavedGroup = { id: string; group_id: string; saved_at: string; available: boolean; group_name: string | null; next_lesson_at: string | null };

export async function savedGroups(locale: Locale, pageInput: unknown = 1) {
  const me = await student(locale);
  const count = await me.db.from('student_saved_groups').select('id', { count: 'exact', head: true }).eq('student_id', me.id);
  const total = count.count ?? 0;
  const offset = savedGroupOffset(pageInput, total);
  const page = Math.floor(offset / SAVED_GROUP_PAGE_SIZE) + 1;
  const result = await me.db.rpc('student_saved_group_page', { p_offset: offset, p_limit: SAVED_GROUP_PAGE_SIZE });
  return { rows: (result.data ?? []) as SavedGroup[], total, page, pageCount: Math.max(1, Math.ceil(total / SAVED_GROUP_PAGE_SIZE)), error: !!(count.error || count.count == null || result.error) };
}

export async function savedGroupStatus(groupId: string) {
  const me = await viewer();
  if (!me || me.role !== 'student' || me.status !== 'active') return false;
  const { data, error } = await me.db.from('student_saved_groups').select('id').eq('student_id', me.id).eq('group_id', groupId).maybeSingle();
  return !error && !!data;
}
