import { describe, expect, it } from 'vitest';
import {
  canUseFullDiscovery,
  discoveryFiltersForRole,
  discoveryGroupsForRole,
  shouldShowDiscoveryNavigation,
} from '@/features/platform/discovery-access';

describe('role-specific discovery access', () => {
  it('gives full discovery only to active student role views', () => {
    expect(canUseFullDiscovery('student')).toBe(true);
    expect(canUseFullDiscovery(null)).toBe(false);
    expect(canUseFullDiscovery('teacher')).toBe(false);
  });

  it('ignores guest filter and pagination queries', () => {
    const query = { query: 'algebra', page: '9', teacher_search: 'A teacher' };
    expect(discoveryFiltersForRole(null, query)).toMatchObject({
      query: '',
      page: 1,
      teacherId: null,
    });
    expect(discoveryFiltersForRole('student', query)).toMatchObject({ query: 'algebra', page: 9 });
  });

  it('limits guests to a small fixed sample while students keep a full result page', () => {
    const groups = Array.from({ length: 20 }, (_, index) => index);
    expect(discoveryGroupsForRole(null, groups)).toEqual([0, 1, 2]);
    expect(discoveryGroupsForRole('student', groups)).toHaveLength(12);
  });

  it('hides discovery navigation from teachers and admins only', () => {
    expect(shouldShowDiscoveryNavigation(null)).toBe(true);
    expect(shouldShowDiscoveryNavigation('student')).toBe(true);
    expect(shouldShowDiscoveryNavigation('teacher')).toBe(false);
  });
});
