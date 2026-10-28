import type { MetadataRoute } from 'next';
import { createClient } from '@supabase/supabase-js';
import { getSupabaseConfig } from '@/lib/supabase/config';
import { seoAlternates, type SeoLocale } from '@/features/seo/metadata';

// Hourly refresh. The sitemap reads only the anonymous public RPCs, with a
// cookie-less client so the route can be cached instead of rendered per request.
export const revalidate = 3600;

const locales: SeoLocale[] = ['ar', 'en'];
const staticPaths = ['', '/teachers', '/help', '/privacy', '/terms', '/login', '/register'];
const GROUP_PAGE = 50;
const MAX_GROUP_PAGES = 20;

function entriesFor(path: string, priority: number): MetadataRoute.Sitemap {
  return locales.map(locale => {
    const alternates = seoAlternates(locale, path);
    return {
      url: alternates.canonical,
      alternates: { languages: alternates.languages },
      changeFrequency: 'weekly' as const,
      priority,
    };
  });
}

type PublicRow = { id: string };

async function publicIds(
  config: NonNullable<ReturnType<typeof getSupabaseConfig>>,
): Promise<{ groups: string[]; teachers: string[] }> {
  const db = createClient(config.url, config.key, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    global: {
      fetch: (input, init) =>
        fetch(input, { ...init, signal: init?.signal ?? AbortSignal.timeout(8_000) }),
    },
  });
  const groups: string[] = [];
  for (let page = 0; page < MAX_GROUP_PAGES; page += 1) {
    const { data, error } = await db.rpc('discover_groups', {
      p_subject_id: null,
      p_node_id: null,
      p_teacher_id: null,
      p_weekday: null,
      p_has_seats: false,
      p_query: '',
      p_offset: page * GROUP_PAGE,
      p_limit: GROUP_PAGE,
    });
    if (error) throw error;
    const rows = (data ?? []) as PublicRow[];
    groups.push(...rows.map(row => row.id));
    if (rows.length < GROUP_PAGE) break;
  }
  const { data, error } = await db.rpc('public_teachers');
  if (error) throw error;
  return { groups, teachers: ((data ?? []) as PublicRow[]).map(row => row.id) };
}

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const routes = staticPaths.flatMap(path => entriesFor(path, path === '' ? 1 : 0.6));
  const config = getSupabaseConfig();
  if (!config) return routes;
  try {
    const { groups, teachers } = await publicIds(config);
    return [
      ...routes,
      ...teachers.flatMap(id => entriesFor(`/teachers/${id}`, 0.7)),
      ...groups.flatMap(id => entriesFor(`/groups/${id}`, 0.8)),
    ];
  } catch {
    // A failed lookup must not break the build or the route; serve static URLs.
    return routes;
  }
}
