import { beforeEach, describe, expect, it, vi } from 'vitest';

const { rpc, createClient } = vi.hoisted(() => ({ rpc: vi.fn(), createClient: vi.fn() }));
vi.mock('@/lib/supabase/server', () => ({ createClient: () => createClient() }));
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));

import { saveTeacherApplication } from '@/features/teacher/application-actions';

const teacherId = '10000000-0000-4000-8000-000000000001';
const timestamp = '2026-10-16T12:00:00.000Z';
function application(updatedAt = timestamp) {
  return { teacher_id: teacherId, status: 'draft', teaching_years: null, admin_phone: '', cv_path: null, cv_url: null, supporting_links: [], attested: false, snapshot: null, feedback: null, submitted_at: null, reviewed_at: null, reviewed_by: null, updated_at: updatedAt, legacy_approved: false };
}
function form(intent = 'draft') {
  const data = new FormData();
  data.set('intent', intent);
  data.set('teaching_years', '');
  data.set('admin_phone', '');
  data.set('supporting_link_0', '');
  data.set('supporting_link_1', '');
  data.set('supporting_link_2', '');
  data.set('expected_updated_at', timestamp);
  return data;
}

beforeEach(() => {
  vi.clearAllMocks();
  rpc.mockImplementation(async (name: string) => name === 'read_teacher_application'
    ? { data: { application: application(), missing: ['teaching_years', 'admin_phone', 'attestation'] }, error: null }
    : { data: { application: application('2026-10-16T12:01:00.000Z'), missing: [] }, error: null });
  createClient.mockResolvedValue({
    auth: { getUser: async () => ({ data: { user: { id: teacherId } }, error: null }) },
    from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { role: 'teacher', status: 'active' }, error: null }) }) }) }),
    rpc,
    storage: { from: () => ({}) },
  });
});

describe('saveTeacherApplication', () => {
  it('allows a truly incomplete draft and passes null years and phone through to the save RPC', async () => {
    const result = await saveTeacherApplication('en', null, form());
    expect(result?.success).toBe('Draft saved.');
    expect(rpc).toHaveBeenCalledWith('save_teacher_application', expect.objectContaining({ p_teaching_years: null, p_admin_phone: '', p_expected_updated_at: timestamp }));
    expect(rpc).not.toHaveBeenCalledWith('submit_teacher_application', expect.anything());
  });

  it('retains years, private phone, links, and attestation when local validation fails', async () => {
    const data = form();
    data.set('teaching_years', '61');
    data.set('admin_phone', 'bad phone');
    data.set('supporting_link_0', 'https://example.org/portfolio');
    data.set('attested', 'on');
    const result = await saveTeacherApplication('en', null, data);
    expect(result?.fieldErrors).toEqual({ teaching_years: 'invalid', admin_phone: 'invalid' });
    expect(result?.values?.teachingYears).toBe('61');
    expect(result?.values?.adminPhone).toBe('bad phone');
    expect(result?.values?.links).toEqual(['https://example.org/portfolio', '', '']);
    expect(result?.values?.attested).toBe(true);
    expect(rpc).not.toHaveBeenCalled();
  });

  it('rejects non-HTTPS supporting links before accessing application state', async () => {
    const data = form();
    data.set('supporting_link_0', 'http://example.org');
    const result = await saveTeacherApplication('en', null, data);
    expect(result?.fieldErrors).toEqual({ supporting_links: 'invalid' });
    expect(rpc).not.toHaveBeenCalled();
  });

  it('accepts submission without a CV link and never uploads files', async () => {
    const data = form();
    data.set('teaching_years', '2'); data.set('admin_phone', '1234567'); data.set('attested', 'on'); data.set('intent', 'submit');
    const result = await saveTeacherApplication('en', null, data);
    expect(result?.success).toBe('Your application was submitted for review.');
    expect(rpc).toHaveBeenCalledWith('save_teacher_application', expect.objectContaining({ p_cv_url: null }));
  });

  it('maps a stale compare-and-set save to a clear message and never submits', async () => {
    rpc.mockImplementation(async (name: string) => name === 'read_teacher_application'
      ? { data: { application: { ...application(), teaching_years: 2, admin_phone: '1234567', cv_path: `${teacherId}/existing.pdf`, attested: true }, missing: [] }, error: null }
      : { data: null, error: { code: 'PT409', message: 'internal version mismatch' } });
    const data = form('submit');
    data.set('teaching_years', '2');
    data.set('admin_phone', '1234567');
    data.set('attested', 'on');
    const result = await saveTeacherApplication('en', null, data);
    expect(result?.error).toContain('changed while you were saving');
    expect(result?.error).not.toContain('internal');
    expect(rpc).not.toHaveBeenCalledWith('submit_teacher_application', expect.anything());
  });

  it('rejects non-Drive CV links and accepts a valid Drive link', async () => {
    const invalid = form(); invalid.set('cv_url', 'https://drive.google.com.evil.test/file/d/abc');
    expect((await saveTeacherApplication('en', null, invalid))?.fieldErrors).toEqual({ cv_url: 'invalid' });
    const valid = form(); valid.set('cv_url', 'https://drive.google.com/file/d/abc/view');
    const result = await saveTeacherApplication('en', null, valid);
    expect(result?.success).toBe('Draft saved.');
    expect(rpc).toHaveBeenCalledWith('save_teacher_application', expect.objectContaining({ p_cv_url: 'https://drive.google.com/file/d/abc/view' }));
  });

  it('preserves legacy CV metadata when saving without a new link', async () => {
    let saveCalls = 0;
    rpc.mockImplementation(async (name: string, args?: Record<string, unknown>) => {
      if (name === 'read_teacher_application') return { data: { application: application(), missing: [] }, error: null };
      saveCalls += 1;
      if (saveCalls === 1) return { data: null, error: { code: 'XX000', message: 'internal write issue' } };
      return { data: { application: { ...application('2026-10-16T12:01:00.000Z'), cv_path: args?.p_cv_path as string }, missing: [] }, error: null };
    });
    const legacy = `${teacherId}/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa.pdf`;
    rpc.mockImplementation(async (name: string, args?: Record<string, unknown>) => name === 'read_teacher_application'
      ? { data: { application: { ...application(), cv_path: legacy }, missing: [] }, error: null }
      : { data: { application: { ...application('2026-10-16T12:01:00.000Z'), cv_path: args?.p_cv_path as string, cv_url: null }, missing: [] }, error: null });
    const saved = await saveTeacherApplication('en', null, form());
    expect(saved?.success).toBe('Draft saved.');
    expect(rpc).toHaveBeenCalledWith('save_teacher_application', expect.objectContaining({ p_cv_path: legacy, p_cv_url: null }));
  });
});
