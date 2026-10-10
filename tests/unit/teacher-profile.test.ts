import { describe, expect, it } from 'vitest';
import { teacherProfileSchema } from '@/features/teacher/profile-domain';

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
    expect(teacherProfileSchema.safeParse({ ...validProfile, contact_email: 'not-an-email' }).success).toBe(false);
    expect(teacherProfileSchema.safeParse({ ...validProfile, contact_email: `${'a'.repeat(245)}@example.org` }).success).toBe(false);
  });

  it('uses enrolled visibility by default and rejects unknown visibility values', () => {
    const { visibility: _visibility, ...withoutVisibility } = validProfile;
    expect(teacherProfileSchema.parse(withoutVisibility).visibility).toBe('enrolled');
    expect(teacherProfileSchema.safeParse({ ...validProfile, visibility: 'everyone' }).success).toBe(false);
  });

  it('enforces name, headline, and bio bounds', () => {
    expect(teacherProfileSchema.safeParse({ ...validProfile, full_name: 'A' }).success).toBe(false);
    expect(teacherProfileSchema.safeParse({ ...validProfile, full_name: 'a'.repeat(101) }).success).toBe(false);
    expect(teacherProfileSchema.safeParse({ ...validProfile, headline: 'a'.repeat(161) }).success).toBe(false);
    expect(teacherProfileSchema.safeParse({ ...validProfile, bio: 'a'.repeat(5001) }).success).toBe(false);
  });

  it('rejects duplicate and malformed specialization IDs', () => {
    const id = '22222222-2222-4222-8222-222222222222';
    expect(teacherProfileSchema.safeParse({ ...validProfile, offering_ids: [id, id] }).success).toBe(false);
    expect(teacherProfileSchema.safeParse({ ...validProfile, offering_ids: ['not-a-uuid'] }).success).toBe(false);
  });
});
