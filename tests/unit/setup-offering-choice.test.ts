import { describe, expect, it } from 'vitest';
import { addOfferingChoice } from '@/features/setup/offering-choice';

const subject = {
  id: 'subject-id',
  owner_teacher_id: 'teacher-id',
  archived_at: null,
  name_en: 'Mathematics',
  name_ar: 'الرياضيات',
};
const node = {
  id: 'node-id',
  owner_teacher_id: 'teacher-id',
  archived_at: null,
  parent_id: null,
  kind: 'custom_year',
  name_en: 'Secondary',
  name_ar: 'الثانوي',
};

describe('setup offering choices', () => {
  it('adds a newly saved combination and selects it alongside existing draft selections', () => {
    const result = addOfferingChoice(
      [{ id: 'existing-id', label: 'English · Secondary' }],
      ['existing-id'],
      { id: 'new-id', subject_id: subject.id, node_id: node.id },
      [subject],
      [node],
      'en',
    );
    expect(result.choices).toContainEqual({ id: 'new-id', label: 'Mathematics · Secondary' });
    expect(result.selectedIds).toEqual(['existing-id', 'new-id']);
  });

  it('does not duplicate an already present offering or selection', () => {
    const result = addOfferingChoice(
      [{ id: 'new-id', label: 'Mathematics · Secondary' }],
      ['new-id'],
      { id: 'new-id', subject_id: subject.id, node_id: node.id },
      [subject],
      [node],
      'ar',
    );
    expect(result.choices).toHaveLength(1);
    expect(result.selectedIds).toEqual(['new-id']);
  });
});
