export type StudentScheduleOverlap = { weekly_overlap: boolean; dated_overlap: boolean };

export function isScheduleOverlap(value: unknown): value is StudentScheduleOverlap {
  if (!value || typeof value !== 'object') return false;
  const result = value as Record<string, unknown>;
  return typeof result.weekly_overlap === 'boolean' && typeof result.dated_overlap === 'boolean';
}

export function normalizeScheduleOverlap(value: unknown): StudentScheduleOverlap | null {
  const row = Array.isArray(value) ? (value.length === 1 ? value[0] : null) : value;
  return isScheduleOverlap(row) ? row : null;
}

export function scheduleOverlapCopy(locale: 'ar' | 'en') {
  if (locale === 'ar')
    return {
      loadError: 'تعذر التحقق من تعارض المواعيد الآن. يمكنك متابعة طلب الانضمام.',
      weekly: 'قد يتعارض الموعد الأسبوعي مع مجموعة أخرى مسجل بها.',
      dated: 'قد يتعارض موعد درس قادم مع جدول مجموعة أخرى مسجل بها.',
      both: 'قد تتعارض المواعيد الأسبوعية ومواعيد الدروس القادمة مع مجموعة أخرى مسجل بها.',
    };
  return {
    loadError: 'We could not check schedule conflicts right now. You can still request to join.',
    weekly: 'This weekly time may overlap with another group you have joined.',
    dated: 'An upcoming lesson may overlap with the schedule of another group you have joined.',
    both: 'The weekly time and an upcoming lesson may overlap with another group you have joined.',
  };
}

export function overlapMessage(locale: 'ar' | 'en', overlap: StudentScheduleOverlap) {
  const copy = scheduleOverlapCopy(locale);
  if (overlap.weekly_overlap && overlap.dated_overlap) return copy.both;
  if (overlap.weekly_overlap) return copy.weekly;
  if (overlap.dated_overlap) return copy.dated;
  return null;
}
