import { describe, expect, it } from 'vitest';
import {
  groupSchema,
  signupSchema,
  slotSchema,
  lessonSchema,
  slotsOverlap,
  validateWebLink,
  safeFile,
} from '@/lib/domain';
describe('domain guards', () => {
  it('accepts real same-day slot times', () => {
    expect(slotSchema.safeParse({ weekday: 0, startTime: '09:00', endTime: '10:30' }).success).toBe(
      true,
    );
  });
  it.each([
    ['24:00', '25:00'],
    ['9:00', '10:00'],
    ['09:60', '10:00'],
    ['20:00', '09:00'],
    ['10:00', '10:00'],
  ])('rejects invalid slot %s–%s', (startTime, endTime) => {
    expect(slotSchema.safeParse({ weekday: 0, startTime, endTime }).success).toBe(false);
  });
  it('compares lesson instants instead of timezone text', () => {
    const lesson = { groupId: '00000000-0000-4000-8000-000000000001', title: 'Math', notes: '' };
    expect(
      lessonSchema.safeParse({
        ...lesson,
        startsAt: '2026-01-01T10:00:00+02:00',
        endsAt: '2026-01-01T09:00:00Z',
      }).success,
    ).toBe(true);
    expect(
      lessonSchema.safeParse({
        ...lesson,
        startsAt: '2026-01-01T10:00:00Z',
        endsAt: '2026-01-01T11:00:00+02:00',
      }).success,
    ).toBe(false);
  });
  it.each([0, -1, NaN, Infinity, 1.5])('rejects invalid file size %s', size =>
    expect(safeFile({ type: 'application/pdf', size })).toBe(false),
  );
  it('rejects credential-bearing URLs', () =>
    expect(validateWebLink('https://user:password@example.com')).toBe(false));
  it('rejects unsafe links', () => {
    expect(validateWebLink('javascript:alert(1)')).toBe(false);
    expect(validateWebLink('https://example.com')).toBe(true);
  });
  it('detects same-day overlap', () => {
    expect(
      slotsOverlap(
        { weekday: 0, start: '18:00', end: '20:00' },
        { weekday: 0, start: '19:00', end: '21:00' },
      ),
    ).toBe(true);
    expect(
      slotsOverlap(
        { weekday: 1, start: '18:00', end: '20:00' },
        { weekday: 0, start: '19:00', end: '21:00' },
      ),
    ).toBe(false);
  });
  it('limits upload type and size', () => {
    expect(safeFile({ type: 'application/pdf', size: 100 })).toBe(true);
    expect(safeFile({ type: 'text/html', size: 100 })).toBe(false);
    expect(safeFile({ type: 'image/png', size: 11 * 1024 * 1024 })).toBe(false);
  });
  it('validates signup and group boundaries', () => {
    expect(
      signupSchema.safeParse({ fullName: 'A', email: 'bad', password: 'x', role: 'admin' }).success,
    ).toBe(false);
    expect(groupSchema.shape.capacity.safeParse(0).success).toBe(false);
  });
});
