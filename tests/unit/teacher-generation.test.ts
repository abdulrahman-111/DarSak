import { describe, expect, it } from 'vitest';
import {
  generationRangeSchema,
  isCurrentConflictFreePreview,
  lessonExclusionsSchema,
  canConfirmGeneration,
  summarizeGenerationPreview,
} from '@/features/teacher/generation-domain';

describe('lesson generation preview domain', () => {
  it('accepts strict real calendar dates and leap days', () => {
    expect(
      generationRangeSchema.safeParse({ from: '2024-02-29', until: '2024-02-29' }).success,
    ).toBe(true);
    for (const date of ['2026-02-29', '2026-04-31', '2026-2-03', '2026/02/03', '0000-01-01']) {
      expect(generationRangeSchema.safeParse({ from: date, until: date }).success).toBe(false);
    }
  });

  it('accepts same-day and inclusive 90-day ranges, but rejects reversed and longer ranges', () => {
    expect(
      generationRangeSchema.safeParse({ from: '2026-02-01', until: '2026-02-01' }).success,
    ).toBe(true);
    expect(
      generationRangeSchema.safeParse({ from: '2026-02-01', until: '2026-05-02' }).success,
    ).toBe(true);
    expect(
      generationRangeSchema.safeParse({ from: '2026-02-01', until: '2026-05-03' }).success,
    ).toBe(false);
    expect(
      generationRangeSchema.safeParse({ from: '2026-02-02', until: '2026-02-01' }).success,
    ).toBe(false);
  });

  it('validates saved exclusions as distinct real dates with a 366-date cap', () => {
    expect(lessonExclusionsSchema.safeParse(['2026-01-01', '2026-12-31']).success).toBe(true);
    expect(lessonExclusionsSchema.safeParse(['2026-01-01', '2026-01-01']).success).toBe(false);
    expect(lessonExclusionsSchema.safeParse(['2026-02-30']).success).toBe(false);
    expect(
      lessonExclusionsSchema.safeParse(
        Array.from({ length: 367 }, (_, index) => {
          const day = new Date(Date.UTC(2026, 0, 1 + index)).toISOString().slice(0, 10);
          return day;
        }),
      ).success,
    ).toBe(false);
  });

  it('summarizes the four preview states and blocks generation only for conflicts or no rows', () => {
    const rows = [
      { state: 'ready' as const },
      { state: 'already_generated' as const },
      { state: 'excluded' as const },
      { state: 'conflicting' as const },
    ];
    expect(summarizeGenerationPreview(rows)).toEqual({
      ready: 1,
      already_generated: 1,
      excluded: 1,
      conflicting: 1,
    });
    expect(canConfirmGeneration(rows)).toBe(false);
    expect(canConfirmGeneration(rows.slice(0, 3))).toBe(true);
    expect(canConfirmGeneration([])).toBe(false);
  });

  it('marks only a current, saved, conflict-free preview as valid for publication', () => {
    const range = { from: '2026-01-01', until: '2026-01-31' };
    expect(isCurrentConflictFreePreview([], range, range, false)).toBe(true);
    expect(isCurrentConflictFreePreview([{ state: 'ready' }], range, range, false)).toBe(true);
    expect(isCurrentConflictFreePreview([{ state: 'conflicting' }], range, range, false)).toBe(
      false,
    );
    expect(
      isCurrentConflictFreePreview(
        [{ state: 'ready' }],
        range,
        { ...range, until: '2026-02-01' },
        false,
      ),
    ).toBe(false);
    expect(isCurrentConflictFreePreview([{ state: 'ready' }], range, range, true)).toBe(false);
    expect(isCurrentConflictFreePreview(null, null, range, false)).toBe(false);
  });
});
