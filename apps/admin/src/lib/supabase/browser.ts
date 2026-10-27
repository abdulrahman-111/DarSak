'use client';

import { createBrowserClient } from '@supabase/ssr';
import { adminCookieName, getPublicSupabaseConfig } from '@admin/lib/supabase/config';

export function createClient() {
  const config = getPublicSupabaseConfig();
  if (!config) throw new Error('Admin Supabase is not configured for the approved staging project.');
  const { url, key, projectRef, secure } = config;
  return createBrowserClient(url, key, {
    cookieOptions: { name: adminCookieName(projectRef), path: '/', sameSite: 'lax', secure },
  });
}
