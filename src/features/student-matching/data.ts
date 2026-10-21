import 'server-only';
import type { Locale } from '@/features/student/domain';
import { student } from '@/features/student/data';
import { mapDiscoverGroup } from '@/features/platform/data';
import {
  normalizeRecommendationsPage,
  parseMatchingPreferences,
  parseRecommendationsPage,
  RECOMMENDATION_PAGE_SIZE,
  recommendationPageCount,
  type MatchingPreferences,
  type RecommendationsPage,
} from './domain';

export async function studentRecommendations(locale: Locale, pageInput: unknown) {
  const me = await student(locale);
  const requestedPage = normalizeRecommendationsPage(pageInput);
  const readPage = (page: number) =>
    me.db.rpc('student_group_recommendations', {
      p_offset: (page - 1) * RECOMMENDATION_PAGE_SIZE,
      p_limit: RECOMMENDATION_PAGE_SIZE,
    });
  const initial = await readPage(requestedPage);
  let page = initial.error ? null : parseRecommendationsPage(initial.data);
  if (!page)
    return {
      page: requestedPage,
      pageCount: 1,
      data: null as RecommendationsPage | null,
      groups: [],
      error: true,
    };
  let currentPage = Math.min(requestedPage, recommendationPageCount(page.total));
  if (currentPage !== requestedPage) {
    const retry = await readPage(currentPage);
    page = retry.error ? null : parseRecommendationsPage(retry.data);
  }
  return {
    page: currentPage,
    pageCount: recommendationPageCount(page?.total ?? 0),
    data: page,
    groups:
      page?.rows.map(row => ({
        group: mapDiscoverGroup(row.group),
        reasonCodes: row.reasonCodes,
      })) ?? [],
    error: !page,
  };
}

export async function studentMatchingPreferences(locale: Locale): Promise<{
  preferences: MatchingPreferences | null;
  error: boolean;
}> {
  const me = await student(locale);
  const result = await me.db
    .from('student_profiles')
    .select('preferred_weekdays,updated_at')
    .eq('id', me.id)
    .maybeSingle();
  const preferences = result.error ? null : parseMatchingPreferences(result.data);
  return { preferences, error: !preferences };
}
