import { describe, expect, it } from 'vitest';
import { publishRangeSchema, publishReviewKey } from '@/features/teacher/publish-domain';

describe('publish range validation', () => {
  it('publishes without requesting lesson generation when both dates are blank', () => {
    expect(publishRangeSchema.parse({ from: '', until: '' })).toEqual({ from: null, until: null });
  });

  it('accepts a valid inclusive range through the 90-day boundary', () => {
    expect(publishRangeSchema.parse({ from: '2026-01-01', until: '2026-04-01' })).toEqual({
      from: '2026-01-01', until: '2026-04-01',
    });
  });

  it('rejects a partially supplied range', () => {
    expect(publishRangeSchema.safeParse({ from: '2026-01-01', until: '' }).success).toBe(false);
    expect(publishRangeSchema.safeParse({ from: '', until: '2026-01-01' }).success).toBe(false);
  });

  it('rejects invalid dates, reversed dates, and ranges longer than 90 days', () => {
    expect(publishRangeSchema.safeParse({ from: '2026-02-30', until: '2026-03-01' }).success).toBe(false);
    expect(publishRangeSchema.safeParse({ from: '2026-04-01', until: '2026-01-01' }).success).toBe(false);
    expect(publishRangeSchema.safeParse({ from: '2026-01-01', until: '2026-04-02' }).success).toBe(false);
  });
});

describe('publish review refresh key', () => {
  const group = { id: 'group-id', name: 'Algebra', description: '', offering_id: 'offering-id', capacity: 12, location: '', status: 'draft' };
  const slot = { id: 'slot-id', weekday: 2, start_time: '10:00:00', end_time: '11:00:00' };

  it('is deterministic across slot and exclusion ordering', () => {
    expect(publishReviewKey(group, [slot], ['2026-02-02', '2026-01-01']))
      .toBe(publishReviewKey(group, [slot], ['2026-01-01', '2026-02-02']));
  });

  it('changes when the group, schedule, or saved exclusions change', () => {
    const baseline = publishReviewKey(group, [slot], ['2026-01-01']);
    expect(publishReviewKey({ ...group, name: 'Geometry' }, [slot], ['2026-01-01'])).not.toBe(baseline);
    expect(publishReviewKey(group, [{ ...slot, weekday: 3 }], ['2026-01-01'])).not.toBe(baseline);
    expect(publishReviewKey(group, [slot], ['2026-01-02'])).not.toBe(baseline);
  });
});
