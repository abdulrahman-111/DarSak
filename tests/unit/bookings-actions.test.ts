import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  getRequestViewer: vi.fn(),
  requireTeachingAccess: vi.fn(),
  teacherViewer: vi.fn(),
  revalidatePath: vi.fn(),
}));
vi.mock('@/features/platform/request-viewer', () => ({ getRequestViewer: mocks.getRequestViewer }));
vi.mock('@/components/platform/access', () => ({
  requireTeachingAccess: mocks.requireTeachingAccess,
}));
vi.mock('@/features/teacher/data', () => ({ teacherViewer: mocks.teacherViewer }));
vi.mock('next/cache', () => ({ revalidatePath: mocks.revalidatePath }));

import { cancelBookingSlot, publishBookingSlot, requestBooking } from '@/features/bookings/actions';
const id = 'a2c4888a-7630-4e7b-aabc-66310e5a5bc9';
const goodForm = (fields: Record<string, string>) => {
  const form = new FormData();
  for (const [key, value] of Object.entries(fields)) form.set(key, value);
  return form;
};

describe('booking actions', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it('does not issue a student booking mutation for an unverified or nonstudent actor', async () => {
    const rpc = vi.fn();
    mocks.getRequestViewer.mockResolvedValue({
      db: { rpc },
      user: { id },
      profile: { id, role: 'teacher', status: 'active' },
    });
    const result = await requestBooking('en', id, null, new FormData());
    expect(result?.error).toBeTruthy();
    expect(rpc).not.toHaveBeenCalled();
  });

  it('allows an active approved teacher to cancel a slot after teaching access expires', async () => {
    const rpc = vi.fn();
    mocks.requireTeachingAccess.mockRejectedValue(new Error('redirect'));
    mocks.teacherViewer.mockResolvedValue({
      db: {
        rpc: async (...args: unknown[]) => {
          rpc(...args);
          return { error: null };
        },
      },
      teacher: { approved: true },
      teacherError: null,
    });
    const result = await cancelBookingSlot('en', id, null, new FormData());
    expect(result?.success).toContain('cancelled');
    expect(rpc).toHaveBeenCalledWith('cancel_booking_slot', { p_slot_id: id });
    expect(mocks.requireTeachingAccess).not.toHaveBeenCalled();
  });

  it('does not allow a nonapproved teacher to cancel a slot', async () => {
    const rpc = vi.fn();
    mocks.teacherViewer.mockResolvedValue({
      db: { rpc },
      teacher: { approved: false },
      teacherError: null,
    });
    const result = await cancelBookingSlot('en', id, null, new FormData());
    expect(result?.error).toBeTruthy();
    expect(rpc).not.toHaveBeenCalled();
  });

  it('rejects invalid duration before calling the database', async () => {
    const rpc = vi.fn();
    mocks.requireTeachingAccess.mockResolvedValue({ db: { rpc }, id });
    const result = await publishBookingSlot(
      'en',
      null,
      goodForm({
        group_id: id,
        starts_local: '2026-10-22T10:00',
        ends_local: '2026-10-22T15:00',
      }),
    );
    expect(result?.error).toContain('4 hours');
    expect(rpc).not.toHaveBeenCalled();
  });
});
