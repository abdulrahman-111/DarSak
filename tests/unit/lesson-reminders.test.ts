import { describe, expect, it, vi } from 'vitest';
vi.mock('server-only', () => ({}));
const rpc = vi.hoisted(() => vi.fn());
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => ({ rpc }) }));
import { renderEmail } from '@/features/email/templates';
import { enqueueLessonReminders } from '@/features/email/reminders';
import {
  lessonReminderOptionLabel,
  parseLessonReminderPreference,
  reminderOffsets,
} from '@/features/notifications/reminder-preference';

const lessonId = '5a4c7d3e-1f2a-4b67-8c90-123456789abc';
const base = {
  lesson_id: lessonId,
  group_name: 'Algebra 1',
  title: 'Lesson 4',
  starts_at: '2026-10-30T10:00:00+00:00',
  offset: '24h',
  role: 'student',
};

describe('lesson_reminder email template', () => {
  it('renders a bilingual 24h reminder in Cairo time with a lesson link per role', () => {
    const student = renderEmail('lesson_reminder', base, 'https://dars.example');
    expect(student?.subject).toBe('Lesson reminder: tomorrow / تذكير بحصة غداً');
    expect(student?.text).toContain('30 Oct 2026');
    expect(student?.text).toContain('12:00');
    expect(student?.text).toContain('https://dars.example/en/student/lessons/' + lessonId);
    expect(student?.text).toContain('https://dars.example/ar/student/lessons/' + lessonId);
    const teacher = renderEmail(
      'lesson_reminder',
      { ...base, role: 'teacher', offset: '1h' },
      'https://dars.example',
    );
    expect(teacher?.subject).toContain('Lesson starts in 1 hour');
    expect(teacher?.subject).toContain('تبدأ الحصة بعد ساعة');
    expect(teacher?.text).toContain('/en/teacher/lessons/' + lessonId);
  });
  it('defangs links and escapes HTML in user supplied names', () => {
    const mail = renderEmail(
      'lesson_reminder',
      { ...base, title: '<b>https://evil.example/x</b>', group_name: 'a.b' },
      'https://dars.example',
    );
    expect(mail?.html).not.toContain('<b>');
    expect(mail?.html).toContain('&lt;b&gt;https[://]evil[.]example/x&lt;/b&gt;');
    expect(mail?.text).toContain('a[.]b');
    expect(mail?.text).not.toContain('https://evil.example');
  });
  it('rejects malformed payloads', () => {
    for (const patch of [
      { lesson_id: 'nope' },
      { starts_at: 'garbage' },
      { offset: '2h' },
      { role: 'admin' },
    ])
      expect(
        renderEmail('lesson_reminder', { ...base, ...patch }, 'https://dars.example'),
      ).toBeNull();
  });
});

describe('lesson reminder preference mapping', () => {
  it('accepts only the four known values', () => {
    expect(['off', '1h', '24h', 'both'].map(parseLessonReminderPreference)).toEqual([
      'off',
      '1h',
      '24h',
      'both',
    ]);
    for (const bad of ['', 'weekly', null, undefined, 24, ['24h']])
      expect(parseLessonReminderPreference(bad)).toBeNull();
  });
  it('maps preferences to offsets and labels', () => {
    expect(reminderOffsets('off')).toEqual([]);
    expect(reminderOffsets('1h')).toEqual(['1h']);
    expect(reminderOffsets('24h')).toEqual(['24h']);
    expect(reminderOffsets('both')).toEqual(['24h', '1h']);
    expect(lessonReminderOptionLabel('both', 'en')).toBe('24 hours and 1 hour before');
    expect(lessonReminderOptionLabel('off', 'ar')).toBe('لا تذكيرات');
  });
});

describe('enqueueLessonReminders', () => {
  it('returns the queued count and null on any failure', async () => {
    rpc.mockResolvedValueOnce({ data: 4, error: null });
    expect(await enqueueLessonReminders()).toBe(4);
    expect(rpc).toHaveBeenCalledWith('enqueue_lesson_reminders');
    rpc.mockResolvedValueOnce({ data: null, error: { message: 'x' } });
    expect(await enqueueLessonReminders()).toBeNull();
    rpc.mockRejectedValueOnce(new Error('boom'));
    expect(await enqueueLessonReminders()).toBeNull();
  });
});
