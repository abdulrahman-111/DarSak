import { describe, expect, it } from 'vitest';
import { materialSchema, storageObjectPath, lessonStatusSchema } from '@/features/teacher/domain';

describe('teacher workspace domain', () => {
  it('allows HTTPS links and rejects credential-bearing or script links', () => {
    expect(materialSchema.safeParse({ kind: 'link', title: 'Practice', url: 'https://example.com/a' }).success).toBe(true);
    expect(materialSchema.safeParse({ kind: 'link', title: 'Unsafe', url: 'javascript:alert(1)' }).success).toBe(false);
    expect(materialSchema.safeParse({ kind: 'link', title: 'Unsafe', url: 'https://user:pass@example.com' }).success).toBe(false);
  });

  it('requires content for notes and permits supported lesson states', () => {
    expect(materialSchema.safeParse({ kind: 'note', title: 'Summary', content: 'Read chapter three.' }).success).toBe(true);
    expect(materialSchema.safeParse({ kind: 'note', title: 'Empty', content: '   ' }).success).toBe(false);
    expect(lessonStatusSchema.safeParse('completed').success).toBe(true);
    expect(lessonStatusSchema.safeParse('deleted').success).toBe(false);
  });

  it('creates an owner/lesson-scoped object path with a safe extension', () => {
    const path = storageObjectPath(
      '00000000-0000-4000-8000-000000000001',
      '00000000-0000-4000-8000-000000000002',
      'worksheet.final.PDF',
      '00000000-0000-4000-8000-000000000003',
    );
    expect(path).toBe('00000000-0000-4000-8000-000000000001/00000000-0000-4000-8000-000000000002/00000000-0000-4000-8000-000000000003.pdf');
  });
});
