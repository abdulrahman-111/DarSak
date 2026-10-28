import 'server-only';
import { redirect } from 'next/navigation';
import { requireViewer, type PlatformViewer } from '@/components/platform/access';
import { readTeacherAccessStatus } from '@/features/teacher-access/data';
import { teachingAccessRedirect } from './teaching-access-gate-domain';

/**
 * Same guarantees as `requireTeachingAccess`, but the page's own reads start at the same time as
 * the teaching-access check instead of after it. Every read is RLS-scoped to the signed-in
 * teacher, so their results are simply discarded when access is denied, and the redirect always
 * wins over a loader failure.
 */
export async function loadWithTeachingAccess<T>(
  locale: string,
  load: (me: PlatformViewer) => Promise<T>,
): Promise<{ me: PlatformViewer; data: T }> {
  const me = await requireViewer(locale, 'teacher');
  const [access, data] = await Promise.allSettled([readTeacherAccessStatus(me.db), load(me)]);
  if (access.status === 'rejected') throw access.reason;
  const target = teachingAccessRedirect(locale, access.value);
  if (target) redirect(target);
  if (data.status === 'rejected') throw data.reason;
  return { me, data: data.value };
}
