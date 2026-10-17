import { beforeEach, describe, expect, it, vi } from 'vitest';

const { createClientMock } = vi.hoisted(() => ({ createClientMock: vi.fn() }));
vi.mock('@/lib/supabase/server', () => ({ createClient: createClientMock }));
vi.mock('@/features/platform/request-viewer', () => ({ getRequestViewer: vi.fn() }));

import { catalogue, publicGroups, publicTeacherSample } from '@/features/platform/data';
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

  it('bounds guest group and teacher samples at the RPC boundary', async () => {
    const limit = vi.fn(async () => ({ data: [], error: null }));
    const rpc = vi.fn((name: string, _args?: Record<string, unknown>) => name === 'public_teacher_choices' ? { limit } : Promise.resolve({ data: [], error: null }));
    createClientMock.mockResolvedValue({ rpc });

    await publicGroups(undefined, 3);
    await publicTeacherSample(3);

    expect(rpc).toHaveBeenCalledWith('discover_groups', expect.objectContaining({ p_offset: 0, p_limit: 3, p_query: '' }));
    expect(rpc).toHaveBeenCalledWith('public_teacher_choices', { p_search: null, p_selected: null });
    expect(limit).toHaveBeenCalledWith(3);
  });
});
