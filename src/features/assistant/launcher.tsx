import 'server-only';

import { SandakCompanion } from '@/components/sandak/companion';
import { getRequestViewer } from '@/features/platform/request-viewer';
import { readTeacherAccessStatus } from '@/features/teacher-access/data';
import { getDictionary } from '@/i18n/config';
import { isConfigured } from '@/lib/supabase/server';
import { getSanadConfig } from './config';
import type { AssistantAccess, AssistantLocale } from './domain';

async function getAssistantIdentity(): Promise<{
  access: AssistantAccess | null;
  key: string;
}> {
  if (!isConfigured()) return { access: null, key: 'guest' };

  let viewer: Awaited<ReturnType<typeof getRequestViewer>>;
  try {
    viewer = await getRequestViewer();
  } catch {
    return { access: null, key: 'guest' };
  }
  const { db, user, profile } = viewer;
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

/**
 * Mounts the docked SanDai companion once for every visitor. Live AI is offered
 * only to active students and teachers when the server configuration enables it;
 * everyone else (including anonymous visitors) gets local guided help.
 */
export async function SanadLauncher({
  locale,
}: {
  locale: AssistantLocale;
}): Promise<React.JSX.Element> {
  const [{ access, key }, dictionary] = await Promise.all([
    getAssistantIdentity(),
    getDictionary(locale),
  ]);
  const aiEnabled =
    access !== null &&
    (access.role === 'student' || access.role === 'teacher') &&
    getSanadConfig() !== null;
  return (
    <SandakCompanion
      key={key}
      locale={locale}
      access={access}
      aiEnabled={aiEnabled}
      copy={dictionary.sandak}
    />
  );
}
