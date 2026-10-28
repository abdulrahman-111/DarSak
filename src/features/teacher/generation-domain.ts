import { z } from 'zod';

function isCalendarDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split('-').map(Number);
  if (year < 1 || month < 1 || month > 12 || day < 1 || day > 31) return false;
  const candidate = new Date(0);
  candidate.setUTCFullYear(year, month - 1, day);
  candidate.setUTCHours(0, 0, 0, 0);
  return candidate.toISOString().slice(0, 10) === value;
}

export const calendarDateSchema = z.string().refine(isCalendarDate, 'date');

export const generationRangeSchema = z
  .object({
    from: calendarDateSchema,
    until: calendarDateSchema,
  })
  .superRefine(({ from, until }, context) => {
    const first = Date.parse(`${from}T00:00:00.000Z`);
    const last = Date.parse(`${until}T00:00:00.000Z`);
    const dayDifference = (last - first) / 86_400_000;
    if (dayDifference < 0)
      context.addIssue({ code: 'custom', path: ['until'], message: 'reversed' });
    else if (dayDifference > 90)
      context.addIssue({ code: 'custom', path: ['until'], message: 'range' });
  });

export type GenerationRange = z.infer<typeof generationRangeSchema>;

export const lessonExclusionsSchema = z
  .array(calendarDateSchema)
  .max(366, 'max')
  .refine(dates => new Set(dates).size === dates.length, 'distinct');

export type GenerationPreviewState = 'ready' | 'already_generated' | 'excluded' | 'conflicting';

export type GenerationPreviewRow = {
  slot_id: string;
  local_date: string;
  start_time: string;
  end_time: string;
  starts_at: string | null;
  ends_at: string | null;
  state: GenerationPreviewState;
  conflict_lesson_id: string | null;
  conflict_group_id: string | null;
  conflict_title: string | null;
};

export type GenerationPreviewSummary = Record<GenerationPreviewState, number>;

export function summarizeGenerationPreview(
  rows: Array<{ state: GenerationPreviewState }>,
): GenerationPreviewSummary {
  return rows.reduce<GenerationPreviewSummary>(
    (summary, row) => {
      summary[row.state] += 1;
      return summary;
    },
    { ready: 0, already_generated: 0, excluded: 0, conflicting: 0 },
  );
}

export function groupPreviewRowsByMonth<T extends { local_date: string }>(rows: T[]) {
  const sorted = [...rows].sort((a, b) => a.local_date.localeCompare(b.local_date));
  const months: Array<{ month: string; rows: T[] }> = [];
  for (const row of sorted) {
    const month = row.local_date.slice(0, 7);
    const last = months[months.length - 1];
    if (last?.month === month) last.rows.push(row);
    else months.push({ month, rows: [row] });
  }
  return months;
}

/** Headline numbers for the preview: lessons that would exist, skipped dates, and clashes. */
export function previewTotals(rows: Array<{ state: GenerationPreviewState }>) {
  const summary = summarizeGenerationPreview(rows);
  return {
    lessons: rows.length - summary.excluded,
    excluded: summary.excluded,
    conflicts: summary.conflicting,
  };
}

export function canConfirmGeneration(rows: Array<{ state: GenerationPreviewState }>): boolean {
  return rows.length > 0 && rows.every(row => row.state !== 'conflicting');
}

export function isCurrentConflictFreePreview(
  rows: Array<{ state: GenerationPreviewState }> | null,
  previewRange: { from: string; until: string } | null,
  currentRange: { from: string; until: string },
  dirtyExclusions: boolean,
): boolean {
  return (
    rows !== null &&
    previewRange !== null &&
    !dirtyExclusions &&
    previewRange.from === currentRange.from &&
    previewRange.until === currentRange.until &&
    rows.every(row => row.state !== 'conflicting')
  );
}
