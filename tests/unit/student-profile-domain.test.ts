import { describe, expect, it } from 'vitest';
import { parseStudentLearningProfileRow, splitStudentInterests, validateStudentLearningProfile } from '@/features/student/student-profile-domain';

const complete = {
  full_name: '  Noor Learner  ', age_range: '13_15', education_year: 'Grade 8',
  interests_text: 'Mathematics, قراءة\nScience', learning_goal: 'I want to understand science better.', school_name: '',
};

describe('student learning profile domain', () => {
  it('splits English and Arabic commas and line breaks, trims values, and keeps first unique spelling', () => {
    expect(splitStudentInterests('Math, قراءة، science\nmath')).toEqual(['Math', 'قراءة', 'science']);
  });

  it('validates a complete profile while keeping school optional', () => {
    const result = validateStudentLearningProfile(complete);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.full_name).toBe('Noor Learner');
      expect(result.data.interests).toEqual(['Mathematics', 'قراءة', 'Science']);
    }
  });

  it('rejects invalid age ranges, short goals, and oversized interest lists', () => {
    const result = validateStudentLearningProfile({ ...complete, age_range: '12', learning_goal: 'Short', interests_text: 'a,b,c,d,e,f,g,h,i,j,k' });
    expect(result.success).toBe(false);
    if (!result.success) expect(result.errors).toMatchObject({ age_range: 'invalid', learning_goal: 'invalid', interests: 'invalid' });
  });

  it('parses only the owner profile fields needed by the student UI', () => {
    const row = parseStudentLearningProfileRow({ ...complete, full_name: 'Noor Learner', interests: ['Math'], onboarding_required: true, onboarding_completed_at: null, updated_at: '2026-10-16T10:00:00Z' });
    expect(row?.onboarding_required).toBe(true);
    expect(row?.school_name).toBe('');
    expect(parseStudentLearningProfileRow({ ...complete, interests: ['Math'], onboarding_required: 'true', onboarding_completed_at: null, updated_at: 'x' })).toBeNull();
  });
});
