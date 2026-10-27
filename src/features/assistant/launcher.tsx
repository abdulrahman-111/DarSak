import 'server-only';

import { getRequestViewer } from '@/features/platform/request-viewer';
import { readTeacherAccessStatus } from '@/features/teacher-access/data';
import { isConfigured } from '@/lib/supabase/server';
import type { AssistantAccess, AssistantLocale } from './domain';
import { HelpDrawer } from './help-drawer';

async function getAssistantIdentity(): Promise<{
  access: AssistantAccess | null;
  key: string;
}> {
  if (!isConfigured()) return { access: null, key: 'guest' };

  const { db, user, profile } = await getRequestViewer();
  if (!user || !profile || profile.status !== 'active') return { access: null, key: 'guest' };

  if (profile.role === 'teacher') {
    try {
      const teachingAccess = await readTeacherAccessStatus(db);
      const canTeach = !teachingAccess.error && !!teachingAccess.status?.has_access;
      return {
        access: { role: profile.role, canTeach },
        key: `${user.id}:${profile.role}:${canTeach}`,
      };
    } catch {
      return {
        access: { role: profile.role, canTeach: false },
        key: `${user.id}:${profile.role}:false`,
      };
    }
  }

  if (profile.role === 'student' || profile.role === 'admin') {
    return {
      access: { role: profile.role, canTeach: false },
      key: `${user.id}:${profile.role}:false`,
    };
  }

  return { access: null, key: `${user.id}:guest` };
}

export async function SanadLauncher({
  locale,
}: {
  locale: AssistantLocale;
}): Promise<React.JSX.Element> {
  const { access, key } = await getAssistantIdentity();
  return <HelpDrawer key={key} locale={locale} access={access} />;
}
