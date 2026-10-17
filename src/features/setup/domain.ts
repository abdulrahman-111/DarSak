import type { RichProfileInput } from '@/features/teacher/profile-details-domain';
import type { StudentAgeRange } from '@/features/student/student-profile-domain';

export type SetupRole = 'teacher' | 'student';

export type TeacherSetupDraftPayload = {
  about: { full_name: string; headline: string };
  details: RichProfileInput;
  background: { teaching_years: number | null };
  offerings: { offering_ids: string[] };
  verification: { admin_phone: string; cv_path: string | null; cv_url: string | null; supporting_links: string[]; attested: boolean };
};

export type StudentSetupDraftPayload = {
  about: { full_name: string; age_range: StudentAgeRange | null; school_name: string };
  learning: { education_year: string; interests: string[]; learning_goal: string };
};

export type TeacherSetupBaseline = {
  profile_full_name: string;
  headline: string;
  offering_ids: string[];
  contacts: { phone_number: string | null; whatsapp_number: string | null; contact_email: string | null; visibility: 'enrolled' | 'public' };
  details_version: number;
  application_updated_at: string;
};

export type StudentSetupBaseline = {
  profile_full_name: string;
  student_updated_at: string;
};

type SetupDraftBase = { stage: number; version: number; return_to: string; updated_at: string };
export type TeacherSetupDraft = SetupDraftBase & { role: 'teacher'; stage: 1 | 2 | 3 | 4; payload: TeacherSetupDraftPayload; baseline: TeacherSetupBaseline };
export type StudentSetupDraft = SetupDraftBase & { role: 'student'; stage: 1 | 2; payload: StudentSetupDraftPayload; baseline: StudentSetupBaseline };
export type SetupDraft = TeacherSetupDraft | StudentSetupDraft;

export type TeacherStagePayload =
  | { full_name?: string; headline?: string; languages?: string[] }
  | { about?: RichProfileInput['about']; approach?: RichProfileInput['approach']; qualifications?: RichProfileInput['qualifications']; experience?: RichProfileInput['experience']; teaching_years?: number | null }
  | { offering_ids?: string[] }
  | { admin_phone?: string; cv_path?: string | null; cv_url?: string | null; supporting_links?: string[]; attested?: boolean };

export type StudentStagePayload =
  | { full_name?: string; age_range?: StudentAgeRange | null; school_name?: string }
  | { education_year?: string; interests?: string[]; learning_goal?: string };

export type TeacherSetupCompletion = { ok: true; destination: string; application: unknown; already_submitted?: boolean };
export type StudentSetupCompletion = { ok: true; destination: string; profile?: unknown; already_completed?: boolean };

function isObject(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

/** Narrow the untyped Supabase RPC result before setup state reaches a client component. */
export function parseSetupDraft(value: unknown): SetupDraft | null {
  if (!isObject(value) || (value.role !== 'teacher' && value.role !== 'student')
    || !Number.isInteger(value.stage) || !Number.isSafeInteger(value.version) || (value.version as number) < 0
    || typeof value.return_to !== 'string' || typeof value.updated_at !== 'string'
    || !isObject(value.payload) || !isObject(value.baseline)) return null;
  if (value.role === 'teacher') {
    if ((value.stage as number) < 1 || (value.stage as number) > 4) return null;
    return value as unknown as TeacherSetupDraft;
  }
  if ((value.stage as number) < 1 || (value.stage as number) > 2) return null;
  return value as unknown as StudentSetupDraft;
}

export function parseSetupCompletion(value: unknown): TeacherSetupCompletion | StudentSetupCompletion | null {
  if (!isObject(value) || value.ok !== true || typeof value.destination !== 'string') return null;
  return value as unknown as TeacherSetupCompletion | StudentSetupCompletion;
}
