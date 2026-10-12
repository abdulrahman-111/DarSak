import { beforeEach, describe, expect, it, vi } from 'vitest';

const { createClientMock } = vi.hoisted(() => ({ createClientMock: vi.fn() }));
vi.mock('@/lib/supabase/server', () => ({ createClient: createClientMock }));

import { catalogue } from '@/features/platform/data';
import { catalogueDisplayName } from '@/features/teacher/catalogue-domain';

describe('public discovery catalogue', () => {
  beforeEach(() => createClientMock.mockReset());

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
});
