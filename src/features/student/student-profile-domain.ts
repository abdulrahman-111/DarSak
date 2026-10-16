import { z } from 'zod';

export const STUDENT_AGE_RANGES = ['under_13', '13_15', '16_17', '18_24', '25_plus'] as const;
export type StudentAgeRange = (typeof STUDENT_AGE_RANGES)[number];

export type StudentLearningProfile = {
  full_name: string;
  age_range: StudentAgeRange | null;
  education_year: string;
  interests: string[];
  learning_goal: string;
  school_name: string;
  onboarding_required: boolean;
  onboarding_completed_at: string | null;
  updated_at: string;
};

export type StudentLearningProfileInput = {
  full_name: string;
  age_range: StudentAgeRange;
  education_year: string;
  interests: string[];
  learning_goal: string;
  school_name: string;
};

const formSchema = z.object({
  full_name: z.string().trim().min(2).max(100),
  age_range: z.enum(STUDENT_AGE_RANGES),
  education_year: z.string().trim().min(1).max(100),
  interests_text: z.string().max(1_000),
  learning_goal: z.string().trim().min(10).max(1_000),
  school_name: z.string().trim().max(160),
});

export function splitStudentInterests(value: string): string[] {
  const unique = new Map<string, string>();
  for (const raw of value.split(/[\r\n,،]+/u)) {
    const interest = raw.trim();
    if (!interest) continue;
    const key = interest.normalize('NFKC').toLocaleLowerCase();
    if (!unique.has(key)) unique.set(key, interest);
  }
  return [...unique.values()];
}

export function validateStudentLearningProfile(input: unknown):
  | { success: true; data: StudentLearningProfileInput }
  | { success: false; errors: Record<string, string> } {
  const parsed = formSchema.safeParse(input);
  const errors: Record<string, string> = {};
  if (!parsed.success) {
    for (const issue of parsed.error.issues) {
      const field = issue.path[0] === 'interests_text' ? 'interests' : String(issue.path[0] ?? 'form');
      errors[field] = 'invalid';
    }
  }
  const rawInterests = input && typeof input === 'object' && !Array.isArray(input)
    ? (input as Record<string, unknown>).interests_text
    : null;
  const interests = typeof rawInterests === 'string' ? splitStudentInterests(rawInterests) : [];
  if (interests.length < 1 || interests.length > 10 || interests.some(interest => interest.length > 80)) {
    errors.interests = 'invalid';
  }
  if (!parsed.success || Object.keys(errors).length) return { success: false, errors };
  return {
    success: true,
    data: {
      full_name: parsed.data.full_name,
      age_range: parsed.data.age_range,
      education_year: parsed.data.education_year,
      interests,
      learning_goal: parsed.data.learning_goal,
      school_name: parsed.data.school_name,
    },
  };
}

export function parseStudentLearningProfileRow(value: unknown): StudentLearningProfile | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const row = value as Record<string, unknown>;
  if (typeof row.full_name !== 'string' || row.full_name.length > 100
    || (row.age_range !== null && !STUDENT_AGE_RANGES.includes(row.age_range as StudentAgeRange))
    || typeof row.education_year !== 'string' || typeof row.learning_goal !== 'string' || typeof row.school_name !== 'string'
    || !Array.isArray(row.interests) || !row.interests.every(item => typeof item === 'string')
    || typeof row.onboarding_required !== 'boolean'
    || (row.onboarding_completed_at !== null && typeof row.onboarding_completed_at !== 'string')
    || typeof row.updated_at !== 'string' || !Number.isFinite(Date.parse(row.updated_at))) return null;
  return {
    full_name: row.full_name,
    age_range: row.age_range as StudentAgeRange | null,
    education_year: row.education_year,
    interests: row.interests as string[],
    learning_goal: row.learning_goal,
    school_name: row.school_name,
    onboarding_required: row.onboarding_required,
    onboarding_completed_at: row.onboarding_completed_at as string | null,
    updated_at: row.updated_at,
  };
}
