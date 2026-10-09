import { describe, expect, it } from 'vitest';
import { discoveryRpcArgs, discoverySearchParams, normalizeDiscoveryFilters } from '@/features/platform/discovery-domain';

const subjectId = 'A70EA958-E2D5-4C9C-90D1-4E001D9AF93C';
const nodeId = '83b0d1b4-2aac-4e6a-98b9-289b42bca388';

describe('public discovery filter normalization', () => {
  it('normalizes UUIDs, weekday, seats, trimmed query, and one-based page', () => {
    expect(normalizeDiscoveryFilters({
      subject_id: subjectId,
      node_id: nodeId,
      teacher_id: ['not-used', subjectId],
      weekday: '6',
      has_seats: 'true',
      query: '  Algebra  ',
      page: '3',
    })).toEqual({
      subjectId: subjectId.toLowerCase(),
      nodeId,
      teacherId: null,
      weekday: 6,
      hasSeats: true,
      query: 'Algebra',
      page: 3,
    });
  });

  it('drops malformed UUID, weekday, and page values to safe defaults', () => {
    expect(normalizeDiscoveryFilters(new URLSearchParams({
      subject_id: 'not-a-uuid',
      node_id: 'also-invalid',
      teacher_id: '00000000-0000-4000-8000-000000000000',
      weekday: '7',
      has_seats: 'yes',
      query: '   ',
      page: '-2',
    }))).toEqual({
      subjectId: null,
      nodeId: null,
      teacherId: '00000000-0000-4000-8000-000000000000',
      weekday: null,
      hasSeats: false,
      query: '',
      page: 1,
    });
  });

  it('bounds the query and page and serializes only supported active filters', () => {
    const filters = normalizeDiscoveryFilters({ query: ` ${'a'.repeat(200)} `, page: '99999999999999999999', has_seats: 'on' });
    expect(filters.query).toHaveLength(120);
    expect(filters.page).toBe(1);
    expect(discoverySearchParams({ ...filters, page: 4 }).toString()).toBe(`has_seats=true&query=${'a'.repeat(120)}&page=4`);
  });

  it('accepts first query values and ignores malformed duplicates', () => {
    expect(normalizeDiscoveryFilters({ weekday: ['0', '4'], page: ['2', '3'] })).toMatchObject({ weekday: 0, page: 2 });
  });

  it('requests one extra row while keeping stable twelve-row page offsets', () => {
    const filters = normalizeDiscoveryFilters({ page: '4', has_seats: 'true' });
    expect(discoveryRpcArgs(filters)).toMatchObject({ p_offset: 36, p_limit: 13, p_has_seats: true });
  });
});
