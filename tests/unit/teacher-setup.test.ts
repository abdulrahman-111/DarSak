import { describe, expect, it } from 'vitest';
import { idSchema } from '@/features/student/domain';
import { groupDetailsSchema, groupScheduleSlotSchema, isRetainedCataloguePair, normalizeSetupStep, setupCatalogueChoices } from '@/features/teacher/setup-domain';

const validDetails = {
  name: 'Algebra group',
  description: 'A weekly algebra class.',
  subject_id: '22222222-2222-4222-8222-222222222222',
  category_id: '33333333-3333-4333-8333-333333333333',
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

  it('accepts the existing Physics and Grade 12 catalogue UUIDs', () => {
    expect(groupDetailsSchema.safeParse({ ...validDetails, subject_id: '00000000-0000-0000-0000-000000000102', category_id: '00000000-0000-0000-0000-000000000021' }).success).toBe(true);
  });

  it('requires separate valid subject and category IDs and valid capacity values', () => {
    expect(groupDetailsSchema.safeParse({ ...validDetails, subject_id: 'english-only' }).success).toBe(false);
    expect(groupDetailsSchema.safeParse({ ...validDetails, category_id: 'english-only' }).success).toBe(false);
    expect(groupDetailsSchema.safeParse({ ...validDetails, capacity: 'ten' }).success).toBe(false);
    expect(idSchema.safeParse('malformed-group-id').success).toBe(false);
  });

  it('retains an archived pair only while both saved component IDs stay unchanged', () => {
    const retained = { subject_id: 'subject-1', category_id: 'category-1' };
    expect(isRetainedCataloguePair(retained, retained)).toBe(true);
    expect(isRetainedCataloguePair({ ...retained, category_id: 'category-2' }, retained)).toBe(false);
    expect(isRetainedCataloguePair({ ...retained, subject_id: 'subject-2' }, retained)).toBe(false);
    expect(isRetainedCataloguePair(retained, null)).toBe(false);
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
      { id: 'level', owner_teacher_id: null, archived_at: null, kind: 'system', parent_id: null, name_ar: 'المرحلة الثانوية', name_en: 'Secondary school' },
      { id: 'grade', owner_teacher_id: null, archived_at: null, kind: 'grade', parent_id: 'level', name_ar: 'الصف العاشر', name_en: 'Grade 10' },
    ];
    const subjects = [{ id: 'math', owner_teacher_id: null, archived_at: null, name_ar: 'الرياضيات', name_en: 'Mathematics' }];
    const offerings = [{ id: 'offering-uuid', owner_teacher_id: null, archived_at: null, node_id: 'grade', subject_id: 'math' }];

    expect(setupCatalogueChoices('en', nodes, subjects, offerings)).toEqual([
      { id: 'offering-uuid', subject_id: 'math', category_id: 'grade', subject: 'Mathematics', context: 'Secondary school › Grade 10', label: 'Mathematics · Secondary school › Grade 10' },
    ]);
    expect(setupCatalogueChoices('ar', nodes, subjects, offerings)[0].label).toBe('الرياضيات · المرحلة الثانوية › الصف العاشر');
  });

  it('falls back to the available language for Arabic-only and English-only catalogue rows', () => {
    const nodes = [
      { id: 'ar', owner_teacher_id: null, archived_at: null, kind: 'grade', parent_id: null, name_ar: 'الصف الأول', name_en: '' },
      { id: 'en', owner_teacher_id: null, archived_at: null, kind: 'grade', parent_id: null, name_ar: '', name_en: 'Grade Two' },
    ];
    const subjects = [
      { id: 'ar-subject', owner_teacher_id: null, archived_at: null, name_ar: 'اللغة العربية', name_en: '' },
      { id: 'en-subject', owner_teacher_id: null, archived_at: null, name_ar: '', name_en: 'Science' },
    ];
    const offerings = [
      { id: 'arabic-only', owner_teacher_id: null, archived_at: null, node_id: 'ar', subject_id: 'ar-subject' },
      { id: 'english-only', owner_teacher_id: null, archived_at: null, node_id: 'en', subject_id: 'en-subject' },
    ];

    for (const locale of ['ar', 'en'] as const) {
      expect(setupCatalogueChoices(locale, nodes, subjects, offerings).map(choice => choice.label)).toEqual(expect.arrayContaining([
        'اللغة العربية · الصف الأول', 'Science · Grade Two',
      ]));
    }
  });
});

describe('teacher weekly schedule slots', () => {
  const slot = {
    group_id: '22222222-2222-4222-8222-222222222222',
    weekday: '0',
    start_time: '18:00',
    end_time: '20:00',
  };

  it('accepts a valid same-day slot and an optional saved slot ID', () => {
    expect(groupScheduleSlotSchema.parse(slot)).toMatchObject({ weekday: 0, start_time: '18:00', end_time: '20:00' });
    expect(groupScheduleSlotSchema.parse({ ...slot, slot_id: '33333333-3333-4333-8333-333333333333' }).slot_id).toBe('33333333-3333-4333-8333-333333333333');
  });

  it('rejects malformed group or slot IDs and weekdays outside Sunday through Saturday', () => {
    expect(groupScheduleSlotSchema.safeParse({ ...slot, group_id: 'bad-id' }).success).toBe(false);
    expect(groupScheduleSlotSchema.safeParse({ ...slot, slot_id: 'bad-id' }).success).toBe(false);
    expect(groupScheduleSlotSchema.safeParse({ ...slot, weekday: '-1' }).success).toBe(false);
    expect(groupScheduleSlotSchema.safeParse({ ...slot, weekday: '7' }).success).toBe(false);
  });

  it('rejects malformed or overnight times and requires the end after the start', () => {
    expect(groupScheduleSlotSchema.safeParse({ ...slot, start_time: '18:00:00' }).success).toBe(false);
    expect(groupScheduleSlotSchema.safeParse({ ...slot, end_time: '20:00:00' }).success).toBe(false);
    expect(groupScheduleSlotSchema.safeParse({ ...slot, end_time: '17:59' }).success).toBe(false);
    expect(groupScheduleSlotSchema.safeParse({ ...slot, end_time: '18:00' }).success).toBe(false);
  });

  it('allows multiple separately saved slots on the same weekday', () => {
    const morning = groupScheduleSlotSchema.parse({ ...slot, start_time: '09:00', end_time: '10:00' });
    const evening = groupScheduleSlotSchema.parse({ ...slot, start_time: '18:00', end_time: '20:00' });
    expect(morning.weekday).toBe(evening.weekday);
    expect(morning.start_time).not.toBe(evening.start_time);
  });
});
