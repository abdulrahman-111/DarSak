import { describe, expect, it } from 'vitest';
import { readAllPages } from '@/lib/supabase/paged-query';

describe('readAllPages', () => {
  it('reads every row beyond the API page cap with contiguous stable offsets', async () => {
    const rows = Array.from({ length: 2051 }, (_, id) => ({ id }));
    const ranges: Array<[number, number]> = [];
    const result = await readAllPages(async (from, to) => {
      ranges.push([from, to]);
      return { data: rows.slice(from, to + 1), error: null };
    });

    expect(result.error).toBeNull();
    expect(result.data).toHaveLength(2051);
    expect(result.data.at(-1)?.id).toBe(2050);
    expect(ranges).toEqual([[0, 999], [1000, 1999], [2000, 2999]]);
  });

  it('returns an error instead of treating a failed page as a complete catalogue', async () => {
    const result = await readAllPages(async () => ({ data: null, error: new Error('page failed') }));
    expect(result.data).toEqual([]);
    expect(result.error).toBeInstanceOf(Error);
  });
});
