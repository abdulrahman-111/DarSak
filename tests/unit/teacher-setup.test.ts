import { describe, expect, it } from 'vitest';
import { idSchema } from '@/features/student/domain';
import { groupDetailsSchema, normalizeSetupStep, setupCatalogueChoices } from '@/features/teacher/setup-domain';

const validDetails = {
  name: 'Algebra group',
  description: 'A weekly algebra class.',
  offering_id: '22222222-2222-4222-8222-222222222222',
  capacity: '10',
  location: '',
};

describe('teacher group setup details', () => {
  it('accepts valid details and defaults capacity to 10', () => {
    const { capacity, ...withoutCapacity } = validDetails;
    expect(groupDetailsSchema.parse(withoutCapacity).capacity).toBe(10);
    expect(groupDetailsSchema.parse(validDetails).capacity).toBe(10);
  });

  it('trims details and enforces the approved text and capacity bounds', () => {
    expect(groupDetailsSchema.parse({ ...validDetails, name: ' Algebra group ', description: '  Details  ', location: '  Room 1  ' })).toMatchObject({ name: 'Algebra group', description: 'Details', location: 'Room 1' });
    expect(groupDetailsSchema.safeParse({ ...validDetails, name: 'A' }).success).toBe(false);
    expect(groupDetailsSchema.safeParse({ ...validDetails, name: 'a'.repeat(121) }).success).toBe(false);
    expect(groupDetailsSchema.safeParse({ ...validDetails, description: 'a'.repeat(2001) }).success).toBe(false);
    expect(groupDetailsSchema.safeParse({ ...validDetails, location: 'a'.repeat(201) }).success).toBe(false);
    expect(groupDetailsSchema.safeParse({ ...validDetails, capacity: '0' }).success).toBe(false);
    expect(groupDetailsSchema.safeParse({ ...validDetails, capacity: '501' }).success).toBe(false);
  });

  it('rejects malformed offering IDs and capacity values', () => {
    expect(groupDetailsSchema.safeParse({ ...validDetails, offering_id: 'english-only' }).success).toBe(false);
    expect(groupDetailsSchema.safeParse({ ...validDetails, capacity: 'ten' }).success).toBe(false);
    expect(idSchema.safeParse('malformed-group-id').success).toBe(false);
  });

  it('normalizes unsupported setup steps to details', () => {
    expect(normalizeSetupStep('details')).toBe('details');
    expect(normalizeSetupStep('schedule')).toBe('schedule');
    expect(normalizeSetupStep('review')).toBe('review');
    expect(normalizeSetupStep('unknown')).toBe('details');
    expect(normalizeSetupStep(undefined)).toBe('details');
  });

  it('uses localized subject and education context labels for offerings', () => {
    const nodes = [
      { id: 'level', parent_id: null, name_ar: 'المرحلة الثانوية', name_en: 'Secondary school' },
      { id: 'grade', parent_id: 'level', name_ar: 'الصف العاشر', name_en: 'Grade 10' },
    ];
    const subjects = [{ id: 'math', name_ar: 'الرياضيات', name_en: 'Mathematics' }];
    const offerings = [{ id: 'offering-uuid', node_id: 'grade', subject_id: 'math' }];

    expect(setupCatalogueChoices('en', nodes, subjects, offerings)).toEqual([
      { id: 'offering-uuid', subject: 'Mathematics', context: 'Secondary school › Grade 10', label: 'Mathematics · Secondary school › Grade 10' },
    ]);
    expect(setupCatalogueChoices('ar', nodes, subjects, offerings)[0].label).toBe('الرياضيات · المرحلة الثانوية › الصف العاشر');
  });
});
