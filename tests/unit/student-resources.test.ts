import { describe, expect, it } from 'vitest';
import { normalizeResourceFilters, resourcePagination } from '@/features/student/resource-domain';

describe('student resource filters', () => {
  it('accepts only supported kinds and UUID group filters and bounds the search', () => {
    const groupId = '7e100000-0000-4000-8000-000000000001';
    expect(
      normalizeResourceFilters({
        group: groupId,
        kind: 'file',
        q: ` ${'x'.repeat(110)} `,
        page: '2',
      }),
    ).toMatchObject({
      group: groupId,
      kind: 'file',
      q: 'x'.repeat(100),
      page: 2,
      offset: 20,
    });
    expect(
      normalizeResourceFilters({
        group: '------------------------------------',
        kind: 'storage_path',
        page: '-2',
      }),
    ).toMatchObject({ group: '', kind: '', page: 1, offset: 0 });
    expect(normalizeResourceFilters({ page: Number.MAX_SAFE_INTEGER })).toMatchObject({
      page: 50_000,
      offset: 999_980,
    });
  });

  it('clamps a stale page to the final available page', () => {
    expect(resourcePagination(41, 8)).toEqual({ page: 3, pageCount: 3, offset: 40 });
    expect(resourcePagination(0, 1)).toEqual({ page: 1, pageCount: 1, offset: 0 });
  });
});
