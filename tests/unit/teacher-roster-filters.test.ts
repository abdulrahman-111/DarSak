import { describe, expect, it } from 'vitest';
import { normalizeRosterFilters } from '@/features/teacher/roster-filters';

describe('teacher roster filters', () => {
  it('normalizes repeated query parameters, trims and bounds literal text, and validates group ids', () => {
    const id = '7e100000-0000-4000-8000-000000000001';
    expect(normalizeRosterFilters(['  Maha  ', 'ignored'], [id])).toEqual({ query: 'Maha', groupId: id });
    expect(normalizeRosterFilters(' x '.repeat(50), 'bad-id').query).toHaveLength(120);
    expect(normalizeRosterFilters(12, id)).toEqual({ query: '', groupId: id });
  });
});
