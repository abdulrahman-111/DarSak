import { beforeEach, describe, expect, it, vi } from 'vitest';

const { createPublicClientMock, queries } = vi.hoisted(() => ({
  createPublicClientMock: vi.fn(),
  queries: [] as Array<{ name: string; args?: unknown; projection?: string; id?: string }>,
}));
vi.mock('@/lib/supabase/public', () => ({ createPublicClient: createPublicClientMock }));
vi.mock('server-only', () => ({}));

import { publicGroupSeo, publicTeacherSeo } from '@/features/seo/public-entity-data';
const VALID_ID = '5c8f4f26-6d16-4f1f-9c10-df678e321abc';

function query(name: string, result: { data: unknown; error: unknown }) {
  const record: (typeof queries)[number] = { name };
  queries.push(record);
  const builder = {
    select: (projection: string) => {
      record.projection = projection;
      return builder;
    },
    eq: (_column: string, id: string) => {
      record.id = id;
      return builder;
    },
    maybeSingle: async () => result,
    then: (resolve: (value: unknown) => unknown) => Promise.resolve(result).then(resolve),
  };
  return builder;
}

beforeEach(() => {
  queries.length = 0;
  createPublicClientMock.mockReset();
});

describe('public entity SEO loaders', () => {
  it('rejects invalid UUIDs without constructing a client or querying', async () => {
    expect(await publicTeacherSeo('en', 'not-a-uuid')).toEqual({ kind: 'missing' });
    expect(await publicGroupSeo('en', 'not-a-uuid')).toEqual({ kind: 'missing' });
    expect(createPublicClientMock).not.toHaveBeenCalled();
    expect(queries).toEqual([]);
  });

  it('uses a cookie-less public client and narrow explicit teacher projections', async () => {
    const rpc = vi.fn((name: string, args?: unknown) =>
      name === 'public_teachers'
        ? query(name, {
            data: { id: VALID_ID, full_name: 'Amina', headline: 'Math teacher' },
            error: null,
          })
        : query(name, {
            data: [{ subject_name_en: 'Algebra', subject_name_ar: 'الجبر' }],
            error: null,
          }),
    );
    createPublicClientMock.mockReturnValue({ rpc });
    expect(await publicTeacherSeo('en', VALID_ID)).toEqual({
      kind: 'found',
      data: { id: VALID_ID, name: 'Amina', headline: 'Math teacher', subjects: ['Algebra'] },
    });
    expect(rpc.mock.calls.map(call => call[0])).toEqual([
      'public_teachers',
      'public_teacher_specialization_labels',
    ]);
    expect(queries.map(item => item.projection)).toEqual([
      'id,full_name,headline',
      'subject_name_en,subject_name_ar',
    ]);
  });

  it('normalizes uppercase teacher UUIDs before querying and returning the found ID', async () => {
    const uppercaseId = VALID_ID.toUpperCase();
    const rpc = vi.fn((name: string) =>
      name === 'public_teachers'
        ? query(name, {
            data: { id: VALID_ID, full_name: 'Amina', headline: null },
            error: null,
          })
        : query(name, { data: [], error: null }),
    );
    createPublicClientMock.mockReturnValue({ rpc });

    expect(await publicTeacherSeo('en', uppercaseId)).toMatchObject({
      kind: 'found',
      data: { id: VALID_ID },
    });
    expect(queries[0].id).toBe(VALID_ID);
    expect(rpc).toHaveBeenNthCalledWith(2, 'public_teacher_specialization_labels', {
      p_teacher_id: VALID_ID,
    });
  });

  it('prefers the requested teacher subject label locale and rejects malformed rows', async () => {
    const rpc = vi.fn((name: string) =>
      name === 'public_teachers'
        ? query(name, {
            data: { id: VALID_ID, full_name: 'Amina', headline: null },
            error: null,
          })
        : query(name, {
            data: [{ subject_name_en: 'Algebra', subject_name_ar: 'الجبر' }],
            error: null,
          }),
    );
    createPublicClientMock.mockReturnValue({ rpc });
    expect(await publicTeacherSeo('ar', VALID_ID)).toMatchObject({
      kind: 'found',
      data: { headline: null, subjects: ['الجبر'] },
    });

    createPublicClientMock.mockReturnValue({
      rpc: vi.fn((name: string) =>
        name === 'public_teachers'
          ? query(name, { data: { id: VALID_ID, full_name: 12, headline: null }, error: null })
          : query(name, { data: [], error: null }),
      ),
    });
    expect(await publicTeacherSeo('en', VALID_ID)).toEqual({ kind: 'unavailable' });
  });

  it('uses only the public published group detail projection', async () => {
    const rpc = vi.fn(() =>
      query('public_group_detail', {
        data: {
          id: VALID_ID,
          name: 'Algebra class',
          description: 'Public description',
          teacher_id: VALID_ID,
          teacher_name: 'Amina',
          subject_name_en: 'Algebra',
          subject_name_ar: null,
          status: 'published',
        },
        error: null,
      }),
    );
    createPublicClientMock.mockReturnValue({ rpc });
    expect(await publicGroupSeo('en', VALID_ID)).toMatchObject({
      kind: 'found',
      data: { subject: 'Algebra', teacher: { id: VALID_ID, name: 'Amina' } },
    });
    expect(queries[0]).toMatchObject({
      name: 'public_group_detail',
      projection:
        'id,name,description,teacher_id,teacher_name,subject_name_en,subject_name_ar,status',
    });
  });

  it('normalizes uppercase group UUIDs before querying and returning the found ID', async () => {
    const uppercaseId = VALID_ID.toUpperCase();
    const rpc = vi.fn((_name: string, args?: unknown) => {
      expect(args).toEqual({ p_group_id: VALID_ID });
      return query('public_group_detail', {
        data: {
          id: VALID_ID,
          name: 'Algebra class',
          description: null,
          teacher_id: VALID_ID,
          teacher_name: 'Amina',
          subject_name_en: 'Algebra',
          subject_name_ar: null,
          status: 'published',
        },
        error: null,
      });
    });
    createPublicClientMock.mockReturnValue({ rpc });

    expect(await publicGroupSeo('en', uppercaseId)).toMatchObject({
      kind: 'found',
      data: { id: VALID_ID, teacher: { id: VALID_ID } },
    });
    expect(rpc).toHaveBeenCalledWith('public_group_detail', { p_group_id: VALID_ID });
  });

  it('uses localized group subjects and rejects malformed optional and teacher fields', async () => {
    const rpc = vi.fn(() =>
      query('public_group_detail', {
        data: {
          id: VALID_ID,
          name: 'Algebra class',
          description: null,
          teacher_id: VALID_ID,
          teacher_name: 'Amina',
          subject_name_en: 'Algebra',
          subject_name_ar: 'الجبر',
          status: 'published',
        },
        error: null,
      }),
    );
    createPublicClientMock.mockReturnValue({ rpc });
    expect(await publicGroupSeo('ar', VALID_ID)).toMatchObject({
      kind: 'found',
      data: { description: null, subject: 'الجبر' },
    });

    createPublicClientMock.mockReturnValue({
      rpc: vi.fn(() =>
        query('public_group_detail', {
          data: {
            id: VALID_ID,
            name: 'Algebra class',
            description: 5,
            teacher_id: 'invalid',
            teacher_name: 'Amina',
            subject_name_en: 'Algebra',
            subject_name_ar: null,
            status: 'published',
          },
          error: null,
        }),
      ),
    });
    expect(await publicGroupSeo('en', VALID_ID)).toEqual({ kind: 'unavailable' });
  });

  it('distinguishes missing rows from backend failures without session fallback', async () => {
    createPublicClientMock.mockReturnValue({
      rpc: vi.fn(() => query('public_teachers', { data: null, error: null })),
    });
    expect(await publicTeacherSeo('en', VALID_ID)).toEqual({ kind: 'missing' });
    createPublicClientMock.mockReturnValue({
      rpc: vi.fn(() => query('public_group_detail', { data: null, error: new Error('offline') })),
    });
    expect(await publicGroupSeo('en', VALID_ID)).toEqual({ kind: 'unavailable' });
  });
});
