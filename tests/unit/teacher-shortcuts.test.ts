import { describe, expect, it } from 'vitest';
import { copyLessonSchema, duplicateGroupSchema, duplicateSetupPath, scheduleProposalSlots, shortcutMutationMessage } from '@/features/teacher/shortcuts-domain';

const groupId = '22222222-2222-4222-8222-222222222222';
const lessonId = '33333333-3333-4333-8333-333333333333';

describe('teacher shortcut validation', () => {
  it('accepts a valid duplicate source UUID and rejects malformed IDs', () => {
    expect(duplicateGroupSchema.parse({ source_group_id: groupId }).source_group_id).toBe(groupId);
    expect(duplicateGroupSchema.safeParse({ source_group_id: 'group-1' }).success).toBe(false);
  });

  it('validates copied lesson ownership references and a positive offset-aware time range', () => {
    expect(copyLessonSchema.safeParse({
      source_lesson_id: lessonId,
      target_group_id: groupId,
      starts_at: '2027-06-06T18:00:00.000Z',
      ends_at: '2027-06-06T19:00:00.000Z',
    }).success).toBe(true);
    expect(copyLessonSchema.safeParse({
      source_lesson_id: 'bad',
      target_group_id: groupId,
      starts_at: '2027-06-06T18:00',
      ends_at: '2027-06-06T19:00',
    }).success).toBe(false);
    expect(copyLessonSchema.safeParse({
      source_lesson_id: lessonId,
      target_group_id: groupId,
      starts_at: '2027-06-06T19:00:00.000Z',
      ends_at: '2027-06-06T19:00:00.000Z',
    }).success).toBe(false);
  });

  it('keeps duplicate schedule proposals attached to the source group in the setup URL', () => {
    expect(duplicateSetupPath('en', groupId, lessonId)).toBe(`/en/teacher/groups/${lessonId}/setup?copyScheduleFrom=${groupId}`);
    expect(duplicateSetupPath('ar', groupId, lessonId)).toBe(`/ar/teacher/groups/${lessonId}/setup?copyScheduleFrom=${groupId}`);
  });

  it('projects only editable schedule values into the unsaved proposal', () => {
    const sourceSlot = { id: lessonId, weekday: 2, start_time: '09:00:00', end_time: '10:00:00', group_id: groupId };
    expect(scheduleProposalSlots([sourceSlot])).toEqual([
      { weekday: 2, start_time: '09:00:00', end_time: '10:00:00' },
    ]);
  });

  it('localizes conflict and authorization errors without exposing database details', () => {
    expect(shortcutMutationMessage('en', 'teacher schedule overlaps another group')).toContain('conflicts');
    expect(shortcutMutationMessage('ar', 'not authorized')).not.toContain('not authorized');
    expect(shortcutMutationMessage('en', 'database connection refused')).not.toContain('database connection refused');
  });
});
