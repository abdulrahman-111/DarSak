import { describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { cairoDateTimeToUtc } from '@/lib/domain';
import type { Assignment } from '@/features/assignments/domain';

vi.mock('@/features/assignments/actions', () => ({
  archiveGroupAssignmentAction: async () => null,
  reviewAssignmentSubmissionAction: async () => null,
  saveGroupAssignmentAction: async () => null,
  submitAssignmentLinkAction: async () => null,
}));

import { cairoDateTimeLocal } from '@/features/assignments/forms';
import { StudentAssignments, TeacherAssignmentList } from '@/features/assignments/views';

const ownAssignment: Assignment = {
  id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  group_id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
  title: 'Read chapter three',
  instructions: 'Answer the first five questions.',
  resource_url: 'https://example.com/class-resource',
  due_at: '2026-10-22T12:34:00.000Z',
  status: 'published',
  version: 1,
  created_at: '2026-10-20T10:00:00.000Z',
  submission: {
    id: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
    url: 'https://drive.google.com/file/d/student-work',
    student_note: 'I included my working.',
    first_submitted_at: '2026-10-22T10:00:00.000Z',
    last_submitted_at: '2026-10-22T11:00:00.000Z',
    revision: 2,
    is_late: false,
    teacher_feedback: 'Please label your diagram.',
    feedback_at: '2026-10-22T11:30:00.000Z',
  },
};

describe('assignment UI', () => {
  it('keeps saved Cairo deadlines unchanged when editing', () => {
    const local = cairoDateTimeLocal(ownAssignment.due_at);
    expect(local).toBe('2026-10-22T15:34');
    expect(cairoDateTimeToUtc(local)).toBe(ownAssignment.due_at);
  });

  it('renders only the student’s own link and private feedback with safe external links', () => {
    const html = renderToStaticMarkup(
      <StudentAssignments locale="en" assignments={[ownAssignment]} groupStatus="published" />,
    );
    expect(html).toContain('Read chapter three');
    expect(html).toContain('I included my working.');
    expect(html).toContain('Please label your diagram.');
    expect(html).toContain('name="url"');
    expect(html).toContain('target="_blank" rel="noopener noreferrer"');
    expect(html).toContain('name="student_note"');
    expect(html).not.toContain('student_id');
  });

  it('keeps create and inline edit controls associated with unique labels', () => {
    const html = renderToStaticMarkup(
      <>
        <TeacherAssignmentList
          locale="en"
          groupId={ownAssignment.group_id}
          assignments={[ownAssignment]}
          groupArchived={false}
          canWrite
          page={1}
          editId={ownAssignment.id}
        />
        <form>
          <label htmlFor={`assignment-title-${ownAssignment.group_id}-new`}>New title</label>
          <input id={`assignment-title-${ownAssignment.group_id}-new`} />
        </form>
      </>,
    );
    const ids = [...html.matchAll(/\bid="([^"]+)"/g)].map(match => match[1]);
    expect(new Set(ids).size).toBe(ids.length);
    expect(html).toContain('Save changes');
  });
});
