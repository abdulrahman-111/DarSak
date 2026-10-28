import { describe, expect, it } from 'vitest';
import {
  formatSlotGroup,
  groupScheduleSlots,
  lessonsPerWeekLabel,
  summarizeSchedule,
} from '@/features/groups/schedule-summary';

const slot = (weekday: number, start: string, end: string) => ({
  weekday,
  start_time: start,
  end_time: end,
});

describe('groupScheduleSlots', () => {
  it('groups days that share the same time and orders them from the week start', () => {
    const groups = groupScheduleSlots([
      slot(4, '16:00:00', '17:00:00'),
      slot(2, '16:00:00', '17:00:00'),
      slot(6, '10:00', '11:30'),
    ]);
    expect(groups).toEqual([
      { weekdays: [6], start: '10:00', end: '11:30' },
      { weekdays: [2, 4], start: '16:00', end: '17:00' },
    ]);
  });

  it('collapses equal slots and keeps different times for the same day apart', () => {
    const groups = groupScheduleSlots([
      slot(2, '16:00:00', '17:00:00'),
      slot(2, '16:00', '17:00'),
      slot(2, '18:00', '19:00'),
    ]);
    expect(groups).toEqual([
      { weekdays: [2], start: '16:00', end: '17:00' },
      { weekdays: [2], start: '18:00', end: '19:00' },
    ]);
  });

  it('puts Saturday and Sunday before Tuesday by default and honours another week start', () => {
    const slots = [slot(2, '09:00', '10:00'), slot(0, '09:00', '10:00'), slot(6, '09:00', '10:00')];
    expect(groupScheduleSlots(slots)[0].weekdays).toEqual([6, 0, 2]);
    expect(groupScheduleSlots(slots, 0)[0].weekdays).toEqual([0, 2, 6]);
  });

  it('returns nothing for no slots', () => {
    expect(groupScheduleSlots([])).toEqual([]);
  });
});

describe('formatSlotGroup', () => {
  it('formats English short days with a 24-hour range and Cairo suffix', () => {
    expect(formatSlotGroup({ weekdays: [2, 4], start: '16:00', end: '17:00' }, 'en')).toBe(
      'Tue & Thu · 16:00–17:00 (Cairo)',
    );
    expect(formatSlotGroup({ weekdays: [6, 0, 2], start: '09:00', end: '10:30' }, 'en')).toBe(
      'Sat, Sun & Tue · 09:00–10:30 (Cairo)',
    );
    expect(formatSlotGroup({ weekdays: [5], start: '09:00', end: '10:30' }, 'en')).toBe(
      'Fri · 09:00–10:30 (Cairo)',
    );
  });

  it('formats Arabic day names and 12-hour Arabic-digit times', () => {
    expect(formatSlotGroup({ weekdays: [2, 4], start: '16:00', end: '17:00' }, 'ar')).toBe(
      'الثلاثاء والخميس · ٤:٠٠–٥:٠٠ م (القاهرة)',
    );
    expect(formatSlotGroup({ weekdays: [6, 0, 2], start: '11:00', end: '12:30' }, 'ar')).toBe(
      'السبت، الأحد والثلاثاء · ١١:٠٠ ص–١٢:٣٠ م (القاهرة)',
    );
  });
});

describe('summarizeSchedule', () => {
  it('combines grouped lines with a lessons-a-week count', () => {
    const summary = summarizeSchedule(
      [slot(4, '16:00:00', '17:00:00'), slot(2, '16:00:00', '17:00:00'), slot(2, '16:00', '17:00')],
      'en',
    );
    expect(summary.lines).toEqual(['Tue & Thu · 16:00–17:00 (Cairo)']);
    expect(summary.count).toBe(2);
    expect(summary.countLabel).toBe('2 lessons a week');
  });

  it('is empty without slots', () => {
    expect(summarizeSchedule([], 'ar')).toEqual({ lines: [], count: 0, countLabel: '' });
  });
});

describe('lessonsPerWeekLabel', () => {
  it('uses English singular and plural', () => {
    expect(lessonsPerWeekLabel(1, 'en')).toBe('1 lesson a week');
    expect(lessonsPerWeekLabel(3, 'en')).toBe('3 lessons a week');
  });

  it('uses Arabic singular, dual, plural and tens forms', () => {
    expect(lessonsPerWeekLabel(1, 'ar')).toBe('حصة واحدة في الأسبوع');
    expect(lessonsPerWeekLabel(2, 'ar')).toBe('حصتان في الأسبوع');
    expect(lessonsPerWeekLabel(3, 'ar')).toBe('٣ حصص في الأسبوع');
    expect(lessonsPerWeekLabel(11, 'ar')).toBe('١١ حصة في الأسبوع');
  });
});
