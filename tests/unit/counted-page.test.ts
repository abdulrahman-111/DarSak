import { describe, expect, it, vi } from 'vitest';
import { readCountedPage } from '@/lib/supabase/counted-page';

type PageResult = { data: number[] | null; count: number | null; error: unknown };

describe('readCountedPage', () => {
  it('reads a valid page once', async () => {
    const fetchPage = vi.fn(async (page: number): Promise<PageResult> => ({ data: [page], count: 120, error: null }));

    const result = await readCountedPage(2, 50, fetchPage);

    expect(result).toEqual({ result: { data: [2], count: 120, error: null }, page: 2 });
    expect(fetchPage.mock.calls).toEqual([[2]]);
  });

  it('recovers PostgREST 416, clamps to the last page, and reads that page', async () => {
    const rangeError = {
      message: 'Requested range not satisfiable',
      details: 'The result contains 120 rows',
      hint: 'The maximum rows are 50',
      code: 'PGRST103',
    };
    const fetchPage = vi.fn(async (page: number): Promise<PageResult> => {
      if (page === 99) return { data: null, count: null, error: rangeError };
      return { data: [page], count: 120, error: null };
    });

    const result = await readCountedPage(99, 50, fetchPage);

    expect(result).toEqual({ result: { data: [3], count: 120, error: null }, page: 3 });
    expect(fetchPage.mock.calls).toEqual([[99], [1], [3]]);
  });

  it('reuses the recovered first page when the exact count is zero', async () => {
    const rangeError = { code: 'PGRST103' };
    const fetchPage = vi.fn(async (page: number): Promise<PageResult> => page === 999
      ? { data: null, count: null, error: rangeError }
      : { data: [], count: 0, error: null });

    const result = await readCountedPage(999, 50, fetchPage);

    expect(result).toEqual({ result: { data: [], count: 0, error: null }, page: 1 });
    expect(fetchPage.mock.calls).toEqual([[999], [1]]);
  });

  it('keeps the original range error when recovery cannot establish an exact count', async () => {
    const rangeError = { code: 'PGRST103' };
    const fetchPage = vi.fn(async (page: number): Promise<PageResult> => page === 8
      ? { data: null, count: null, error: rangeError }
      : { data: [], count: null, error: null });

    const result = await readCountedPage(8, 20, fetchPage);

    expect(result).toEqual({ result: { data: null, count: null, error: rangeError }, page: 8 });
    expect(fetchPage.mock.calls).toEqual([[8], [1]]);
  });

  it('does not retry non-range errors', async () => {
    const error = { code: '42501' };
    const fetchPage = vi.fn(async (): Promise<PageResult> => ({ data: null, count: null, error }));

    const result = await readCountedPage(8, 20, fetchPage);

    expect(result).toEqual({ result: { data: null, count: null, error }, page: 8 });
    expect(fetchPage).toHaveBeenCalledTimes(1);
  });

  it('clamps a successful exact-count response without a range error', async () => {
    const fetchPage = vi.fn(async (page: number): Promise<PageResult> => ({ data: [page], count: 21, error: null }));

    const result = await readCountedPage(9, 20, fetchPage);

    expect(result).toEqual({ result: { data: [2], count: 21, error: null }, page: 2 });
    expect(fetchPage.mock.calls).toEqual([[9], [2]]);
  });
});
