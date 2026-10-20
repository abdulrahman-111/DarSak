import { DISCOVERY_PAGE_SIZE, normalizeDiscoveryFilters } from './discovery-domain';

export const GUEST_DISCOVERY_SAMPLE_SIZE = 3;

export type DiscoveryRole = 'student' | 'teacher' | 'admin' | null;

export function canUseFullDiscovery(role: DiscoveryRole) {
  return role === 'student';
}

export function shouldShowDiscoveryNavigation(role: DiscoveryRole) {
  return role !== 'teacher' && role !== 'admin';
}

export function discoveryFiltersForRole(
  role: DiscoveryRole,
  query: Record<string, string | string[] | undefined>,
) {
  return canUseFullDiscovery(role)
    ? normalizeDiscoveryFilters(query)
    : normalizeDiscoveryFilters({});
}

export function discoveryGroupsForRole<T>(role: DiscoveryRole, groups: T[]) {
  return canUseFullDiscovery(role)
    ? groups.slice(0, DISCOVERY_PAGE_SIZE)
    : groups.slice(0, GUEST_DISCOVERY_SAMPLE_SIZE);
}
