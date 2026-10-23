import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  getRequestViewer: vi.fn(),
  checkTeachingAccess: vi.fn(),
  revalidatePath: vi.fn(),
}));
vi.mock('@/features/platform/request-viewer', () => ({ getRequestViewer: mocks.getRequestViewer }));
vi.mock('@/features/teacher-access/guard', () => ({
  checkTeachingAccess: mocks.checkTeachingAccess,
  teachingGuardMessage: (locale: string) =>
    locale === 'ar' ? 'انتهت الصلاحية.' : 'Teaching access expired.',
}));
vi.mock('next/cache', () => ({ revalidatePath: mocks.revalidatePath }));

import {
  reviewAssignmentSubmissionAction,
  saveGroupAssignmentAction,
  submitAssignmentLinkAction,
} from '@/features/assignments/actions';

const id = 'a2c4888a-7630-4e7b-aabc-66310e5a5bc9';
const validForm = (values: Record<string, string>) => {
  const form = new FormData();
  for (const [key, value] of Object.entries(values)) form.set(key, value);
  return form;
};

describe('assignment actions', () => {
  beforeEach(() => vi.resetAllMocks());

  it('requires the matching active role before sending writes', async () => {
    const rpc = vi.fn();
    mocks.getRequestViewer.mockResolvedValue({
      db: { rpc },
      user: { id },
      profile: { id, role: 'student', status: 'active' },
    });
    const result = await saveGroupAssignmentAction(
      'en',
      id,
      null,
      validForm({ title: 'Task', instructions: 'Read', assignment_id: '' }),
    );
    expect(result?.error).toBeTruthy();
    expect(rpc).not.toHaveBeenCalled();
  });

  it('preserves a title when the assignment has neither instructions nor a resource link', async () => {
    const rpc = vi.fn();
    mocks.getRequestViewer.mockResolvedValue({
      db: { rpc },
      user: { id },
      profile: { id, role: 'teacher', status: 'active' },
    });
    const result = await saveGroupAssignmentAction(
      'en',
      id,
      null,
      validForm({
        title: 'My draft title',
        instructions: '',
        resource_url: '',
        due_local: '',
        assignment_id: '',
      }),
    );
    expect(result?.error).toBeTruthy();
    expect(result?.values).toMatchObject({ title: 'My draft title', instructions: '' });
    expect(rpc).not.toHaveBeenCalled();
  });

  it('validates submitted links before calling the RPC and preserves no caller identity fields', async () => {
    const rpc = vi.fn();
    mocks.getRequestViewer.mockResolvedValue({
      db: { rpc },
      user: { id },
      profile: { id, role: 'student', status: 'active' },
    });
    const result = await submitAssignmentLinkAction(
      'en',
      id,
      null,
      validForm({ url: 'https://user:secret@example.org/work', student_note: '', revision: '' }),
    );
    expect(result?.error).toBeTruthy();
    expect(result?.values).toMatchObject({
      url: 'https://user:secret@example.org/work',
      student_note: '',
    });
    expect(rpc).not.toHaveBeenCalled();
  });

  it('saves a teacher assignment with the expected RPC args and invalidates EN and AR views', async () => {
    const rpc = vi.fn().mockResolvedValue({ data: id, error: null });
    const db = {
      rpc,
      from: () => ({
        select: () => ({
          eq: () => ({ maybeSingle: async () => ({ data: { approved: true }, error: null }) }),
        }),
      }),
    };
    mocks.getRequestViewer.mockResolvedValue({
      db,
      user: { id },
      profile: { id, role: 'teacher', status: 'active' },
    });
    mocks.checkTeachingAccess.mockResolvedValue({ allowed: true });
    const result = await saveGroupAssignmentAction(
      'en',
      id,
      null,
      validForm({
        title: 'Task',
        instructions: 'Read this',
        resource_url: '',
        due_local: '',
        assignment_id: '',
      }),
    );
    expect(result).toMatchObject({ assignmentId: id, version: 1, success: 'Assignment saved.' });
    expect(rpc).toHaveBeenCalledWith('save_group_assignment', {
      p_group_id: id,
      p_title: 'Task',
      p_instructions: 'Read this',
      p_resource_url: null,
      p_due_at: null,
      p_assignment_id: null,
      p_expected_version: null,
    });
    expect(mocks.revalidatePath).toHaveBeenCalledWith('/en/student/classes/[id]', 'page');
    expect(mocks.revalidatePath).toHaveBeenCalledWith(
      '/ar/teacher/groups/[id]/assignments',
      'page',
    );
    expect(mocks.revalidatePath).toHaveBeenCalledWith(
      '/ar/teacher/groups/[id]/assignments/[assignmentId]',
      'page',
    );
  });

  it('maps stale RPC versions to a localized conflict response', async () => {
    const rpc = vi
      .fn()
      .mockResolvedValue({ data: null, error: { code: '40001', message: 'version conflict' } });
    const db = {
      rpc,
      from: () => ({
        select: () => ({
          eq: () => ({ maybeSingle: async () => ({ data: { approved: true }, error: null }) }),
        }),
      }),
    };
    mocks.getRequestViewer.mockResolvedValue({
      db,
      user: { id },
      profile: { id, role: 'teacher', status: 'active' },
    });
    mocks.checkTeachingAccess.mockResolvedValue({ allowed: true });
    const result = await saveGroupAssignmentAction(
      'ar',
      id,
      null,
      validForm({
        title: 'Task',
        instructions: 'Read this',
        resource_url: '',
        due_local: '',
        assignment_id: id,
        version: '3',
      }),
    );
    expect(result?.error).toContain('تغيرت البيانات');
    expect(result?.values).toMatchObject({
      title: 'Task',
      instructions: 'Read this',
      version: '3',
    });
    expect(mocks.revalidatePath).not.toHaveBeenCalled();
  });

  it('preserves a student note draft after a stale resubmission conflict', async () => {
    const rpc = vi
      .fn()
      .mockResolvedValue({ data: null, error: { code: '40001', message: 'revision conflict' } });
    mocks.getRequestViewer.mockResolvedValue({
      db: { rpc },
      user: { id },
      profile: { id, role: 'student', status: 'active' },
    });
    const result = await submitAssignmentLinkAction(
      'en',
      id,
      null,
      validForm({
        url: 'https://example.org/new-work',
        student_note: 'Please review this section',
        revision: '2',
      }),
    );
    expect(result?.error).toContain('another tab');
    expect(result?.values).toMatchObject({
      url: 'https://example.org/new-work',
      student_note: 'Please review this section',
    });
  });

  it('preserves a teacher feedback draft after a stale review conflict', async () => {
    const rpc = vi
      .fn()
      .mockResolvedValue({ data: null, error: { code: '40001', message: 'revision conflict' } });
    const db = {
      rpc,
      from: () => ({
        select: () => ({
          eq: () => ({ maybeSingle: async () => ({ data: { approved: true }, error: null }) }),
        }),
      }),
    };
    mocks.getRequestViewer.mockResolvedValue({
      db,
      user: { id },
      profile: { id, role: 'teacher', status: 'active' },
    });
    mocks.checkTeachingAccess.mockResolvedValue({ allowed: true });
    const result = await reviewAssignmentSubmissionAction(
      'en',
      id,
      null,
      validForm({ teacher_feedback: 'Try explaining your second step.', revision: '4' }),
    );
    expect(result?.error).toContain('another tab');
    expect(result?.values).toMatchObject({
      teacher_feedback: 'Try explaining your second step.',
      revision: '4',
    });
  });
});
