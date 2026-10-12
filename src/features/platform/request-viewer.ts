import 'server-only';

import { cache } from 'react';
import type { User } from '@supabase/supabase-js';
import { createClient } from '@/lib/supabase/server';
import type { Profile } from '@/lib/supabase/types';

/** Verified identity and fresh own-profile data, deduplicated for one RSC request. */
export const getRequestViewer = cache(async () => {
  const db = await createClient();
  const { data, error } = await db.auth.getUser();
  if (error || !data.user) return { db, user: null as User | null, profile: null as Profile | null };

  const result = await db.from('profiles').select('*').eq('id', data.user.id).maybeSingle();
  return {
    db,
    user: data.user,
    profile: result.error ? null : result.data as Profile | null,
  };
});
