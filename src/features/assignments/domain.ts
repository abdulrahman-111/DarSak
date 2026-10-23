import { z } from 'zod';
import { validateWebLink } from '@/lib/domain';

const uuid = z.string().uuid();
const timestamp = z.string().refine(value => Number.isFinite(Date.parse(value)));
const nullableTimestamp = timestamp.nullable();

export const assignmentInputSchema = z
  .object({
    title: z.string().trim().min(1).max(160),
    instructions: z.string().trim().max(5000),
    resourceUrl: z
      .string()
      .trim()
      .max(2048)
      .refine(value => value === '' || validateWebLink(value)),
    dueAt: z.string().trim().max(32),
    assignmentId: z.union([uuid, z.literal('')]),
    expectedVersion: z.string().optional(),
  })
  .refine(value => value.instructions.length > 0 || value.resourceUrl.length > 0, {
    message: 'instructions_or_resource_required',
  });

export const submissionInputSchema = z.object({
  url: z.string().trim().min(1).max(2048).refine(validateWebLink),
  studentNote: z.string().trim().max(2000),
  expectedRevision: z.string().optional(),
});

export const reviewInputSchema = z.object({
  feedback: z.string().trim().max(3000),
  expectedRevision: z.string().refine(value => {
    const revision = Number(value);
    return /^\d+$/.test(value) && Number.isSafeInteger(revision) && revision >= 1;
  }),
});

export type AssignmentSubmission = {
  id: string;
  url: string;
  student_note: string;
  first_submitted_at: string;
  last_submitted_at: string;
  revision: number;
  is_late: boolean;
  teacher_feedback: string | null;
  feedback_at: string | null;
};

export type Assignment = {
  id: string;
  group_id: string;
  title: string;
  instructions: string;
  resource_url: string | null;
  due_at: string | null;
  status: 'published' | 'archived';
  version: number;
  created_at: string;
  submission?: AssignmentSubmission | null;
  submitted_count?: number;
  accepted_student_count?: number;
};

export type TeacherAssignmentSubmission = {
  id: string;
  student_id: string;
  student_name: string;
  enrollment_status: string;
  url: string;
  student_note: string;
  first_submitted_at: string;
  last_submitted_at: string;
  revision: number;
  is_late: boolean;
  teacher_feedback: string | null;
  feedback_at: string | null;
};

const submissionSchema: z.ZodType<AssignmentSubmission> = z.object({
  id: uuid,
  url: z.string().max(2048).refine(validateWebLink),
  student_note: z.string().max(2000),
  first_submitted_at: timestamp,
  last_submitted_at: timestamp,
  revision: z.number().int().safe().min(1),
  is_late: z.boolean(),
  teacher_feedback: z.string().max(3000).nullable(),
  feedback_at: nullableTimestamp,
});

const assignmentCoreSchema = z.object({
  id: uuid,
  group_id: uuid,
  title: z.string().min(1).max(160),
  instructions: z.string().max(5000),
  resource_url: z.string().max(2048).refine(validateWebLink).nullable(),
  due_at: nullableTimestamp,
  status: z.enum(['published', 'archived']),
  version: z.number().int().safe().min(1),
  created_at: timestamp,
});

const studentAssignmentSchema = assignmentCoreSchema
  .extend({
    submission: submissionSchema.nullable(),
  })
  .refine(value => value.instructions.trim().length > 0 || value.resource_url !== null);

const teacherAssignmentSchema = assignmentCoreSchema
  .extend({
    submitted_count: z.number().int().safe().min(0),
    accepted_student_count: z.number().int().safe().min(0),
  })
  .refine(value => value.instructions.trim().length > 0 || value.resource_url !== null);

const teacherSubmissionSchema: z.ZodType<TeacherAssignmentSubmission> = z.object({
  id: uuid,
  student_id: uuid,
  student_name: z.string().min(1).max(200),
  enrollment_status: z.string().min(1).max(32),
  url: z.string().max(2048).refine(validateWebLink),
  student_note: z.string().max(2000),
  first_submitted_at: timestamp,
  last_submitted_at: timestamp,
  revision: z.number().int().safe().min(1),
  is_late: z.boolean(),
  teacher_feedback: z.string().max(3000).nullable(),
  feedback_at: nullableTimestamp,
});

const pageSchema = <T extends z.ZodType>(row: T) =>
  z.object({
    rows: z.array(row).max(20),
    total: z.number().int().safe().min(0),
  });

export function parseStudentAssignmentPage(value: unknown) {
  const result = pageSchema(studentAssignmentSchema).safeParse(value);
  return result.success ? result.data : null;
}

export function parseTeacherAssignmentPage(value: unknown) {
  const result = pageSchema(teacherAssignmentSchema).safeParse(value);
  return result.success ? result.data : null;
}

export function parseTeacherAssignmentSubmissions(value: unknown) {
  const result = pageSchema(teacherSubmissionSchema).safeParse(value);
  return result.success ? result.data : null;
}

export function normalizeAssignmentPage(value: unknown) {
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed >= 1 ? Math.min(parsed, 50_001) : 1;
}

export function assignmentPageOffset(page: number) {
  return Math.min(Math.max(0, (page - 1) * 20), 1_000_000);
}

export function assignmentPageCount(total: number) {
  return Math.max(1, Math.ceil(total / 20));
}
