import { describe, expect, it } from 'vitest';
import {
  discoveryRpcArgs,
  discoverySearchParams,
  normalizeDiscoveryFilters,
  preserveTeacherSearch,
} from '@/features/platform/discovery-domain';

const subjectId = 'A70EA958-E2D5-4C9C-90D1-4E001D9AF93C';
const nodeId = '83b0d1b4-2aac-4e6a-98b9-289b42bca388';

describe('public discovery filter normalization', () => {
  it('normalizes UUIDs, weekday, seats, trimmed query, and one-based page', () => {
    expect(
      normalizeDiscoveryFilters({
        subject_id: subjectId,
        node_id: nodeId,
        teacher_id: ['not-used', subjectId],
        weekday: '6',
        has_seats: 'true',
        query: '  Algebra  ',
        page: '3',
      }),
    ).toEqual({
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
    expect(
      normalizeDiscoveryFilters(
        new URLSearchParams({
          subject_id: 'not-a-uuid',
          node_id: 'also-invalid',
          teacher_id: '00000000-0000-4000-8000-000000000000',
          weekday: '7',
          has_seats: 'yes',
          query: '   ',
          page: '-2',
        }),
      ),
    ).toEqual({
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
    const filters = normalizeDiscoveryFilters({
      query: ` ${'a'.repeat(200)} `,
      page: '99999999999999999999',
      has_seats: 'on',
    });
    expect(filters.query).toHaveLength(120);
    expect(filters.page).toBe(1);
    expect(discoverySearchParams({ ...filters, page: 4 }).toString()).toBe(
      `has_seats=true&query=${'a'.repeat(120)}&page=4`,
    );
  });

  it('accepts first query values and ignores malformed duplicates', () => {
    expect(normalizeDiscoveryFilters({ weekday: ['0', '4'], page: ['2', '3'] })).toMatchObject({
      weekday: 0,
      page: 2,
    });
  });

  it('preserves canonical seeded catalogue UUIDs through normalization, URL serialization, and RPC args', () => {
    const subjectId = '00000000-0000-0000-0000-000000000102';
    const nodeId = '00000000-0000-0000-0000-000000000021';
    const teacherId = '00000000-0000-0000-0000-000000000103';
    const filters = normalizeDiscoveryFilters(
      new URLSearchParams({ subject_id: subjectId, node_id: nodeId, teacher_id: teacherId }),
    );
    expect(filters).toMatchObject({ subjectId, nodeId, teacherId });
    expect(discoverySearchParams(filters).toString()).toBe(
      `subject_id=${subjectId}&node_id=${nodeId}&teacher_id=${teacherId}`,
    );
    expect(discoveryRpcArgs(filters)).toMatchObject({
      p_subject_id: subjectId,
      p_node_id: nodeId,
      p_teacher_id: teacherId,
    });
  });

  it('continues to reject invalid hexadecimal UUIDs and short UUID strings', () => {
    expect(
      normalizeDiscoveryFilters({
        subject_id: '00000000-0000-0000-0000-00000000010g',
        node_id: '00000000-0000-0000-0000-00000000021',
        teacher_id: 'not-a-uuid',
      }),
    ).toMatchObject({ subjectId: null, nodeId: null, teacherId: null });
  });

  it('requests one extra row while keeping stable twelve-row page offsets', () => {
    const filters = normalizeDiscoveryFilters({ page: '4', has_seats: 'true' });
    expect(discoveryRpcArgs(filters)).toMatchObject({
      p_offset: 36,
      p_limit: 13,
      p_has_seats: true,
    });
  });

  it('preserves a trimmed and bounded teacher name search during locale switching', () => {
    const params = preserveTeacherSearch(
      new URLSearchParams('teacher_search=%20Ada%20Lovelace%20&query=algebra'),
    );
    expect(params.toString()).toBe('teacher_search=Ada+Lovelace');
    expect(
      preserveTeacherSearch(new URLSearchParams(`teacher_search=${'x'.repeat(200)}`)).get(
        'teacher_search',
      ),
    ).toHaveLength(80);
  });
});

describe('isGuid', () => {
  it('matches zod guid() acceptance without importing zod into the client bundle', async () => {
    const { isGuid } = await import('@/features/platform/discovery-domain');
    const { z } = await import('zod');
    const samples = [
      '00000000-0000-4000-8000-000000000000',
      'DE100000-0000-4000-8000-000000000001',
      'de100000-0000-4000-8000-00000000000',
      'de100000-0000-4000-8000-0000000000011',
      'de100000x0000-4000-8000-000000000001',
      'gggggggg-0000-4000-8000-000000000001',
      ' 00000000-0000-4000-8000-000000000000',
      '00000000-0000-4000-8000-000000000000\n',
      '',
      'not-a-uuid',
    ];
    for (const sample of samples) expect(isGuid(sample)).toBe(z.guid().safeParse(sample).success);
  });
});
