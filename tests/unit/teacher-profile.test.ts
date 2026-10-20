import { describe, expect, it } from 'vitest';
import {
  addUniqueOfferingId,
  teacherProfileSchema,
  teacherSpecializationPairSchema,
} from '@/features/teacher/profile-domain';
import {
  canSelectCatalogueRow,
  catalogueDisplayName,
  isTeacherCatalogueCategory,
} from '@/features/teacher/catalogue-domain';

const validProfile = {
  full_name: 'Mona Ali',
  headline: '',
  bio: '',
  offering_ids: [],
  phone_number: '',
  whatsapp_number: '',
  contact_email: '',
  visibility: 'enrolled',
};

describe('teacher profile validation', () => {
  it('normalizes blank optional contact fields to null', () => {
    const parsed = teacherProfileSchema.parse(validProfile);
    expect(parsed.phone_number).toBeNull();
    expect(parsed.whatsapp_number).toBeNull();
    expect(parsed.contact_email).toBeNull();
  });

  it('accepts international E.164 numbers and a separate contact email', () => {
    const parsed = teacherProfileSchema.safeParse({
      ...validProfile,
      phone_number: '+201234567890',
      whatsapp_number: '+447123456789',
      contact_email: 'teacher@example.org',
    });
    expect(parsed.success).toBe(true);
  });

  it('rejects malformed or too short international phone numbers', () => {
    for (const phone_number of ['01012345678', '+1234567', '+0123456789', '+1234567890123456']) {
      expect(teacherProfileSchema.safeParse({ ...validProfile, phone_number }).success).toBe(false);
    }
  });

  it('rejects malformed and overlong contact email values', () => {
    expect(
      teacherProfileSchema.safeParse({ ...validProfile, contact_email: 'not-an-email' }).success,
    ).toBe(false);
    expect(
      teacherProfileSchema.safeParse({
        ...validProfile,
        contact_email: `${'a'.repeat(245)}@example.org`,
      }).success,
    ).toBe(false);
  });

  it('uses enrolled visibility by default and rejects unknown visibility values', () => {
    const { visibility: _visibility, ...withoutVisibility } = validProfile;
    expect(teacherProfileSchema.parse(withoutVisibility).visibility).toBe('enrolled');
    expect(
      teacherProfileSchema.safeParse({ ...validProfile, visibility: 'everyone' }).success,
    ).toBe(false);
  });

  it('enforces name, headline, and bio bounds', () => {
    expect(teacherProfileSchema.safeParse({ ...validProfile, full_name: 'A' }).success).toBe(false);
    expect(
      teacherProfileSchema.safeParse({ ...validProfile, full_name: 'a'.repeat(101) }).success,
    ).toBe(false);
    expect(
      teacherProfileSchema.safeParse({ ...validProfile, headline: 'a'.repeat(161) }).success,
    ).toBe(false);
    expect(teacherProfileSchema.safeParse({ ...validProfile, bio: 'a'.repeat(5001) }).success).toBe(
      false,
    );
  });

  it('rejects duplicate and malformed specialization IDs', () => {
    const id = '22222222-2222-4222-8222-222222222222';
    expect(
      teacherProfileSchema.safeParse({ ...validProfile, offering_ids: [id, id] }).success,
    ).toBe(false);
    expect(
      teacherProfileSchema.safeParse({ ...validProfile, offering_ids: ['not-a-uuid'] }).success,
    ).toBe(false);
  });

  it('requires valid subject and category IDs for a new specialization pair', () => {
    const id = '22222222-2222-4222-8222-222222222222';
    expect(
      teacherSpecializationPairSchema.safeParse({ subject_id: id, category_id: id }).success,
    ).toBe(true);
    expect(
      teacherSpecializationPairSchema.safeParse({
        subject_id: '00000000-0000-0000-0000-000000000001',
        category_id: '00000000-0000-0000-0000-000000000013',
      }).success,
    ).toBe(true);
    expect(
      teacherSpecializationPairSchema.safeParse({ subject_id: 'bad', category_id: id }).success,
    ).toBe(false);
    expect(
      teacherSpecializationPairSchema.safeParse({ subject_id: id, category_id: null }).success,
    ).toBe(false);
    for (const category_id of [
      '00000000-0000-0000-0000-000000000013/path',
      '00000000-0000-0000-0000-00000000001g',
      '00000000-0000-0000-0000-00000000001',
    ]) {
      expect(
        teacherSpecializationPairSchema.safeParse({ subject_id: id, category_id }).success,
      ).toBe(false);
    }
  });

  it('does not duplicate a specialization returned by pair creation', () => {
    const id = '22222222-2222-4222-8222-222222222222';
    expect(addUniqueOfferingId([id], id)).toEqual([id]);
    expect(addUniqueOfferingId([], id)).toEqual([id]);
  });

  it('uses locale fallback for saved labels and excludes foreign retained rows', () => {
    const label = { name_ar: '', name_en: 'Algebra' };
    expect(catalogueDisplayName(label, 'ar')).toBe('Algebra');
    expect(catalogueDisplayName({ name_ar: 'الجبر', name_en: '' }, 'en')).toBe('الجبر');
    expect(
      canSelectCatalogueRow(
        { id: 'own-archived', owner_teacher_id: 'teacher', archived_at: '2026-01-01' },
        'teacher',
        'own-archived',
      ),
    ).toBe(true);
    expect(
      canSelectCatalogueRow(
        { id: 'foreign', owner_teacher_id: 'another-teacher', archived_at: null },
        'teacher',
        'foreign',
      ),
    ).toBe(false);
  });

  it('offers only system learning levels and teacher categories as profile categories', () => {
    expect(isTeacherCatalogueCategory({ owner_teacher_id: null, kind: 'grade' })).toBe(true);
    expect(isTeacherCatalogueCategory({ owner_teacher_id: 'teacher', kind: 'custom_year' })).toBe(
      true,
    );
    expect(
      isTeacherCatalogueCategory({ owner_teacher_id: 'teacher', kind: 'student_category' }),
    ).toBe(true);
    expect(isTeacherCatalogueCategory({ owner_teacher_id: null, kind: 'faculty' })).toBe(false);
    expect(isTeacherCatalogueCategory({ owner_teacher_id: 'teacher', kind: 'department' })).toBe(
      false,
    );
  });
});
