import { beforeEach, describe, expect, it, vi } from 'vitest';

const { createClientMock, createPublicClientMock, getRequestViewerMock, cacheStore } = vi.hoisted(
  () => ({
    createClientMock: vi.fn(),
    createPublicClientMock: vi.fn(),
    getRequestViewerMock: vi.fn(),
    cacheStore: new Map<string, unknown>(),
  }),
);
vi.mock('server-only', () => ({}));
vi.mock('@/lib/supabase/server', () => ({ createClient: createClientMock }));
vi.mock('@/lib/supabase/public', () => ({ createPublicClient: createPublicClientMock }));
vi.mock('@/features/platform/request-viewer', () => ({ getRequestViewer: getRequestViewerMock }));
// A faithful stand-in for the Next data cache: keyed by key parts and arguments,
// shared across calls, and never storing a call that throws.
vi.mock('next/cache', () => ({
  updateTag: vi.fn(),
  unstable_cache:
    <A extends unknown[], R>(fn: (...args: A) => Promise<R>, keyParts: string[]) =>
    async (...args: A): Promise<R> => {
      const key = JSON.stringify([keyParts, args]);
      if (cacheStore.has(key)) return cacheStore.get(key) as R;
      const value = await fn(...args);
      cacheStore.set(key, value);
      return value;
    },
}));

import {
  catalogue,
  myGroups,
  publicGroups,
  publicTeacherChoices,
  publicTeacherSample,
} from '@/features/platform/data';
import { normalizeDiscoveryFilters } from '@/features/platform/discovery-domain';
import { catalogueDisplayName } from '@/features/teacher/catalogue-domain';

describe('public discovery catalogue', () => {
  beforeEach(() => {
    createClientMock.mockReset();
    createPublicClientMock.mockReset().mockReturnValue(null);
    getRequestViewerMock.mockReset();
    cacheStore.clear();
  });

  it('uses only the narrow projection and preserves valid empty catalogues', async () => {
    const rpc = vi.fn(async () => ({ data: { subjects: [], nodes: [] }, error: null }));
    const from = vi.fn();
    createClientMock.mockResolvedValue({ rpc, from });

    const result = await catalogue();

    expect(rpc).toHaveBeenCalledWith('public_discovery_catalogue');
    expect(from).not.toHaveBeenCalled();
    expect(result).toMatchObject({ subjects: [], nodes: [], offerings: [], error: null });
  });

  it('keeps projection failures distinct from a valid empty catalogue', async () => {
    const failure = { message: 'projection unavailable' };
    const rpc = vi.fn(async () => ({ data: null, error: failure }));
    createClientMock.mockResolvedValue({ rpc });

    const result = await catalogue();

    expect(result).toMatchObject({ subjects: [], nodes: [], offerings: [], error: failure });
  });

  it('shows one-language labels in either locale', () => {
    expect(catalogueDisplayName({ name_ar: '', name_en: 'Algebra' }, 'ar')).toBe('Algebra');
    expect(catalogueDisplayName({ name_ar: 'الجبر', name_en: '' }, 'en')).toBe('الجبر');
  });

  it('bounds guest group and teacher samples at the RPC boundary', async () => {
    const limit = vi.fn(async () => ({ data: [], error: null }));
    const rpc = vi.fn((name: string, _args?: Record<string, unknown>) =>
      name === 'public_teacher_choices' ? { limit } : Promise.resolve({ data: [], error: null }),
    );
    createClientMock.mockResolvedValue({ rpc });

    await publicGroups(undefined, 3);
    await publicTeacherSample(3);

    expect(rpc).toHaveBeenCalledWith(
      'discover_groups',
      expect.objectContaining({ p_offset: 0, p_limit: 3, p_query: '' }),
    );
    expect(rpc).toHaveBeenCalledWith('public_teacher_choices', {
      p_search: null,
      p_selected: null,
    });
    expect(limit).toHaveBeenCalledWith(3);
  });

  describe('shared public cache', () => {
    it('serves the catalogue from one anonymous read without using the visitor session', async () => {
      const rpc = vi.fn(async () => ({ data: { subjects: [], nodes: [] }, error: null }));
      createPublicClientMock.mockReturnValue({ rpc });

      await catalogue();
      await catalogue();

      expect(rpc).toHaveBeenCalledTimes(1);
      expect(createClientMock).not.toHaveBeenCalled();
    });

    it('never stores a failed or malformed read and retries it with the visitor client', async () => {
      const failure = { message: 'down' };
      createPublicClientMock.mockReturnValue({
        rpc: vi.fn(async () => ({ data: null, error: failure })),
      });
      const own = vi.fn(async () => ({ data: { subjects: [], nodes: [] }, error: null }));
      createClientMock.mockResolvedValue({ rpc: own });

      const result = await catalogue();

      expect(result.error).toBeNull();
      expect(own).toHaveBeenCalledTimes(1);
      expect(cacheStore.size).toBe(0);
    });

    it('shares only the unfiltered group page and teacher list, never searches or filters', async () => {
      const rpc = vi.fn(async (_name: string, _args?: Record<string, unknown>) => ({
        data: [],
        error: null,
      }));
      createPublicClientMock.mockReturnValue({ rpc });
      createClientMock.mockResolvedValue({ rpc });

      await publicGroups(undefined, 3);
      await publicGroups(undefined, 3);
      expect(createClientMock).not.toHaveBeenCalled();
      expect(rpc).toHaveBeenCalledTimes(1);

      await publicGroups(normalizeDiscoveryFilters({ query: 'algebra' }));
      await publicGroups(normalizeDiscoveryFilters({ query: 'algebra' }));
      await publicTeacherChoices('sara', null);
      await publicTeacherChoices('sara', null);
      expect(createClientMock).toHaveBeenCalledTimes(4);

      await publicTeacherChoices('', null);
      await publicTeacherChoices('  ', null);
      expect(createClientMock).toHaveBeenCalledTimes(4);
    });
  });

  describe('myGroups', () => {
    it('reuses the request viewer instead of calling auth.getUser again', async () => {
      const order = vi.fn(async () => ({ data: [], error: null }));
      const eq = vi.fn(() => ({ order }));
      const select = vi.fn(() => ({ eq }));
      const from = vi.fn(() => ({ select }));
      const getUser = vi.fn();
      getRequestViewerMock.mockResolvedValue({
        db: { from, auth: { getUser } },
        user: { id: 't1' },
      });

      await myGroups('teacher');

      expect(getUser).not.toHaveBeenCalled();
      expect(createClientMock).not.toHaveBeenCalled();
      expect(eq).toHaveBeenCalledWith('teacher_id', 't1');
    });

    it('returns nothing for a teacher request without a verified user', async () => {
      const from = vi.fn();
      getRequestViewerMock.mockResolvedValue({ db: { from }, user: null });
      expect(await myGroups('teacher')).toEqual({ data: [], error: null });
      expect(from).not.toHaveBeenCalled();
    });
  });
});
