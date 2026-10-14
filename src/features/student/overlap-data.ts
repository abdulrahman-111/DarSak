import 'server-only';
import { student } from './data';
import type { Locale } from './domain';
import { idSchema } from './domain';
import { normalizeScheduleOverlap } from './overlap-domain';

export async function studentScheduleOverlap(locale: Locale, groupId: string) {
  const me = await student(locale);
  if (!idSchema.safeParse(groupId).success) return { overlap: null, error: true };
  const result = await me.db.rpc('student_group_schedule_overlap', { p_group_id: groupId });
  const overlap = normalizeScheduleOverlap(result.data);
  if (result.error || !overlap) return { overlap: null, error: true };
  return { overlap, error: false };
}
