import { beforeEach, describe, expect, it, vi } from 'vitest';

const { createClientMock, revalidatePathMock } = vi.hoisted(() => ({ createClientMock: vi.fn(), revalidatePathMock: vi.fn() }));
vi.mock('@/lib/supabase/server', () => ({ createClient: createClientMock }));
vi.mock('next/cache', () => ({ revalidatePath: revalidatePathMock }));

import { decideEnrollment, requestEnrollment, saveLesson, saveSlot } from '@/features/platform/actions';

const groupId = '44444444-4444-4444-8444-444444444444';
const lessonId = '55555555-5555-4555-8555-555555555555';
function setup(error: { code?: string; message: string } | null) {
  const rpc = vi.fn(async () => ({ data: null, error }));
  createClientMock.mockResolvedValue({ rpc });
  return rpc;
}
function form(entries: Record<string, string>) {
  const data = new FormData();
  for (const [key, value] of Object.entries(entries)) data.set(key, value);
  return data;
}

describe('localized platform action feedback', () => {
  beforeEach(() => { createClientMock.mockReset(); revalidatePathMock.mockReset(); });

  it('localizes schedule validation and safe conflict messages', async () => {
    const invalid = await saveSlot('ar', null, form({ groupId, weekday: '9', startTime: '18:00', endTime: '19:00' }));
    expect(invalid?.error).toMatch(/تحقق من اليوم/);
    setup({ code: '23P01', message: 'conflicting schedule data' });
    const conflict = await saveSlot('en', null, form({ groupId, weekday: '1', startTime: '18:00', endTime: '19:00' }));
    expect(conflict?.error).toMatch(/conflicts with another weekly time/i);
    expect(conflict?.error).not.toContain('conflicting schedule data');
  });

  it('maps published-group, full-group, and authorization errors to safe localized feedback', async () => {
    setup({ message: 'published group not found' });
    expect((await requestEnrollment('en', groupId, null))?.error).toMatch(/no longer accepting/i);
    setup({ message: 'group is full' });
    expect((await decideEnrollment('ar', lessonId, 'accepted'))?.error).toMatch(/ممتلئة/);
    setup({ code: '42501', message: 'not authorized: internal policy details' });
    const result = await requestEnrollment('ar', groupId, null);
    expect(result?.error).toMatch(/ليست لديك صلاحية/);
    expect(result?.error).not.toContain('internal policy details');
  });

  it('returns localized lesson validation and hides unknown RPC diagnostics', async () => {
    const invalid = await saveLesson('ar', null, form({ groupId, title: 'x', startsAt: 'bad', endsAt: 'bad', notes: '' }));
    expect(invalid?.error).toMatch(/تحقق من عنوان الحصة/);
    setup({ message: 'private database trace / table names' });
    const result = await saveLesson('en', null, form({ groupId, lessonId, title: 'Lesson', startsAt: '2026-10-01T10:00:00Z', endsAt: '2026-10-01T11:00:00Z', notes: '' }));
    expect(result?.error).toMatch(/could not save this change/i);
    expect(result?.error).not.toContain('private database trace');
  });
});
