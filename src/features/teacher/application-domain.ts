export const TEACHER_APPLICATION_STATUSES = [
  "draft",
  "submitted",
  "changes_requested",
  "approved",
  "declined",
] as const;

export type TeacherApplicationStatus = (typeof TEACHER_APPLICATION_STATUSES)[number];

export const TEACHER_APPLICATION_MISSING_CODES = [
  "full_name",
  "headline",
  "bio",
  "specializations",
  "languages",
  "experience",
  "qualifications",
  "approach",
  "teaching_years",
  "admin_phone",
  "attestation",
] as const;

export type TeacherApplicationMissing =
  (typeof TEACHER_APPLICATION_MISSING_CODES)[number];

export type TeacherApplication = {
  teacher_id: string;
  status: TeacherApplicationStatus;
  teaching_years: number | null;
  admin_phone: string;
  cv_path: string | null;
  cv_url?: string | null;
  supporting_links: string[];
  attested: boolean;
  snapshot: Record<string, unknown> | null;
  feedback: string | null;
  submitted_at: string | null;
  reviewed_at: string | null;
  reviewed_by: string | null;
  updated_at: string;
  legacy_approved: boolean;
};

export type TeacherApplicationReadResponse = {
  application: TeacherApplication | null;
  missing: TeacherApplicationMissing[];
};

export function isGoogleDriveCvUrl(value: string): boolean {
  if (!value || value.length > 500 || /[\s\\]/.test(value)) return false;
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && url.hostname.toLowerCase() === 'drive.google.com'
      && !url.username && !url.password && !!url.pathname && !url.port;
  } catch { return false; }
}

export function isTeacherApplicationStatus(
  value: unknown,
): value is TeacherApplicationStatus {
  return (
    typeof value === "string" &&
    (TEACHER_APPLICATION_STATUSES as readonly string[]).includes(value)
  );
}

export function isTeacherApplicationMissing(
  value: unknown,
): value is TeacherApplicationMissing {
  return (
    typeof value === "string" &&
    (TEACHER_APPLICATION_MISSING_CODES as readonly string[]).includes(value)
  );
}

export function parseTeacherApplicationReadResponse(
  value: unknown,
): TeacherApplicationReadResponse {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return { application: null, missing: [] };
  }

  const response = value as Record<string, unknown>;
  const application = response.application;
  const missing = Array.isArray(response.missing)
    ? response.missing.filter(isTeacherApplicationMissing)
    : [];

  if (!application || typeof application !== "object" || Array.isArray(application)) {
    return { application: null, missing };
  }

  const row = application as Record<string, unknown>;
  if (
    typeof row.teacher_id !== "string" ||
    !isTeacherApplicationStatus(row.status) ||
    typeof row.admin_phone !== "string" ||
    !Array.isArray(row.supporting_links) ||
    !row.supporting_links.every((item) => typeof item === "string") ||
    typeof row.attested !== "boolean" ||
    typeof row.updated_at !== "string" ||
    typeof row.legacy_approved !== "boolean"
  ) {
    return { application: null, missing };
  }

  return {
    application: {
      teacher_id: row.teacher_id,
      status: row.status,
      teaching_years:
        typeof row.teaching_years === "number" ? row.teaching_years : null,
      admin_phone: row.admin_phone,
      cv_path: typeof row.cv_path === "string" ? row.cv_path : null,
      cv_url: typeof row.cv_url === "string" ? row.cv_url : null,
      supporting_links: row.supporting_links,
      attested: row.attested,
      snapshot:
        row.snapshot && typeof row.snapshot === "object" && !Array.isArray(row.snapshot)
          ? (row.snapshot as Record<string, unknown>)
          : null,
      feedback: typeof row.feedback === "string" ? row.feedback : null,
      submitted_at: typeof row.submitted_at === "string" ? row.submitted_at : null,
      reviewed_at: typeof row.reviewed_at === "string" ? row.reviewed_at : null,
      reviewed_by: typeof row.reviewed_by === "string" ? row.reviewed_by : null,
      updated_at: row.updated_at,
      legacy_approved: row.legacy_approved,
    },
    missing,
  };
}
