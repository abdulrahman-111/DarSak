import { describe, expect, it } from 'vitest';
import { emptyRichProfile } from '@/features/teacher/profile-details-domain';
import { hasTeacherApplicationBackground, isTeacherApplicationMissing } from '@/features/teacher/application-domain';

const qualification = {
  id: 'q1', title: { en: 'BSc Mathematics', ar: '' }, organization: { en: 'Cairo University', ar: '' },
  description: { en: '', ar: '' }, start_year: null, end_year: 2020, current: false,
};
const experience = {
  id: 'e1', title: { en: 'Independent tutor', ar: '' }, organization: { en: 'Self employed', ar: '' },
  description: { en: 'Tutored learners', ar: '' }, start_year: 2020, end_year: null, current: true,
};

describe('teacher application background requirement', () => {
  it('accepts either a complete qualification or a complete experience entry', () => {
    expect(hasTeacherApplicationBackground({ qualifications: [qualification], experience: [] })).toBe(true);
    expect(hasTeacherApplicationBackground({ qualifications: [], experience: [experience] })).toBe(true);
  });

  it('requires one meaningful entry across both lists', () => {
    expect(hasTeacherApplicationBackground(emptyRichProfile())).toBe(false);
    expect(hasTeacherApplicationBackground({ qualifications: [{ ...qualification, organization: { en: '', ar: '' } }], experience: [] })).toBe(false);
    expect(hasTeacherApplicationBackground({ qualifications: [], experience: [{ ...experience, start_year: null }] })).toBe(false);
  });

  it('recognizes the combined missing requirement from the application RPC', () => {
    expect(isTeacherApplicationMissing('experience_or_qualification')).toBe(true);
    expect(isTeacherApplicationMissing('languages')).toBe(false);
    expect(isTeacherApplicationMissing('approach')).toBe(false);
  });
});
