export const LESSON_REMINDER_PREFERENCES = ['off', '1h', '24h', 'both'] as const;
export type LessonReminderPreference = (typeof LESSON_REMINDER_PREFERENCES)[number];
/** Safe default: one reminder the day before. Stored only once a user changes it. */
export const DEFAULT_LESSON_REMINDER_PREFERENCE: LessonReminderPreference = '24h';

export function parseLessonReminderPreference(value: unknown): LessonReminderPreference | null {
  return typeof value === 'string' &&
    (LESSON_REMINDER_PREFERENCES as readonly string[]).includes(value)
    ? (value as LessonReminderPreference)
    : null;
}

/** Which reminder offsets a preference selects. */
export function reminderOffsets(preference: LessonReminderPreference): ('24h' | '1h')[] {
  if (preference === 'both') return ['24h', '1h'];
  if (preference === 'off') return [];
  return [preference];
}

export function lessonReminderOptionLabel(preference: LessonReminderPreference, locale: string) {
  const ar = locale === 'ar';
  const labels: Record<LessonReminderPreference, [string, string]> = {
    off: ['لا تذكيرات', 'No reminders'],
    '1h': ['قبل ساعة', '1 hour before'],
    '24h': ['قبل يوم', '24 hours before'],
    both: ['قبل يوم وقبل ساعة', '24 hours and 1 hour before'],
  };
  return labels[preference][ar ? 0 : 1];
}
