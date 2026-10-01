# Supabase contract v1

All IDs uuid default gen_random_uuid unless indicated. All rows have created_at timestamptz default now(). Schema public. RLS for every table. Active means profiles.status='active'. User roles student/teacher/admin, status active/suspended; teachers additionally teacher_profiles.approved. Public exposure must use safe teacher fields only.

Tables:
- profiles: id references auth.users, full_name text, role text, status text, preferred_language ar/en default ar. Private, users read own; group owners may read enrolled students' names via safe RPC/view (never full private profiles). Admin controls role/status.
- teacher_profiles: id references profiles, bio text, headline text, avatar_path text nullable, approved boolean default false. Public approved active teachers only. Owner edit bio/headline, not approved.
- student_profiles: id references profiles, offering_id uuid nullable references offerings.
- education_nodes: id, parent_id nullable self reference, kind text in system/level/grade/university/faculty/department/year, name_ar, name_en, slug unique. Hierarchy for academic catalogue.
- subjects: id, name_ar, name_en, slug unique.
- offerings: id, node_id references education_nodes, subject_id references subjects, unique pair. School grade, university year or general university node defines context.
- teacher_specializations: teacher_id, offering_id, composite PK.
- groups: id, teacher_id profiles, offering_id, name text, description text default '', capacity integer 1..500, status draft/published/archived, location text default '', created_at.
- group_schedule_slots: id, group_id, weekday integer 0..6 (Sunday=0), start_time time, end_time time, timezone text default Africa/Cairo. Same-day only. Teacher overlap prevention required.
- enrollments: id, group_id, student_id, status pending/accepted/rejected/cancelled/removed, unique(group_id,student_id), updated_at.
- lessons: id, group_id, slot_id nullable group_schedule_slots, title text, starts_at timestamptz, ends_at timestamptz, status scheduled/cancelled/completed, notes text default ''. Actual occurrences; accepted membership required to read. Owner manages. Prevent teacher overlaps including across groups.
- lesson_materials: id, lesson_id, kind file/link/note, title, storage_path nullable, url nullable, content nullable, file_size bigint nullable, mime_type nullable, uploaded_by profiles.
- notifications: id, user_id profiles, kind text, title_ar text, title_en text, href text nullable (app-relative), read_at nullable.
- reports: id, reporter_id profiles, subject text, description text, status open/resolved, admin_note text default ''. Own create/read; admin handles.
- platform_settings: key text PK, value jsonb. Admin only except explicit public safe settings if needed.

RPCs (server actions call with authenticated supabase client):
- request_enrollment(p_group_id uuid) returns uuid. Student only; published group; allow new or rejected/cancelled/removed retry -> pending; accepted/pending unchanged or error.
- decide_enrollment(p_enrollment_id uuid,p_status text) returns void. Owner/admin only pending->accepted/rejected; accepted->removed; capacity atomic, notifications created.
- cancel_enrollment(p_enrollment_id uuid) returns void. Student owns pending/accepted -> cancelled.
- save_schedule_slot(p_group_id uuid,p_weekday int,p_start_time time,p_end_time time,p_slot_id uuid default null) returns uuid. Transaction lock teacher, conflict validation. Edits cannot silently corrupt existing dated lessons.
- create_lesson(p_group_id uuid,p_title text,p_starts_at timestamptz,p_ends_at timestamptz,p_notes text default '',p_lesson_id uuid default null) returns uuid. Validates owner/admin and conflicts, updates when ID supplied.
- set_lesson_status(p_lesson_id uuid,p_status text) returns void. Owner/admin only; accepts scheduled, cancelled, or completed and locks the lesson before changing status.
- generate_lessons(p_group_id uuid,p_from date,p_until date) returns integer. At most 90 days, Cairo conversion, idempotent (group/slot/local date uniqueness), rollback on conflicts. User explicitly triggers.
- admin_update_user(p_user_id uuid,p_status text,p_approved boolean default null) returns void. Admin only, updates status and teacher approval; no public role granting.
- group_students(p_group_id uuid) returns table(enrollment_id uuid,student_id uuid,full_name text,status text). Owner/admin only.
- public_teachers() returns table(id uuid,full_name text,headline text,bio text,avatar_path text). Approved active only.
- public_groups() returns published group fields plus approved active teacher name, bilingual subject/context names, accepted_count, and available_seats. Safe for anonymous discovery; it never returns private profiles or roster identities.

Auth trigger creates profile from full_name and requested_role metadata, only student/teacher permitted, never admin. Never authorize via editable metadata. Teacher remains unapproved until operator/admin review. `bootstrap-admin` operator script uses service key only outside application runtime. User cannot alter profile.role/status or teacher.approved through direct UPDATE.

Storage bucket `lesson-materials`, private, 10 MB cap PDF/JPEG/PNG/WebP. Object path `${teacherId}/${lessonId}/${randomUuid}.${extension}`. Metadata insert must match path ownership and lesson owner. Accepted students may read only when corresponding lesson_materials row exists. Teacher owner/admin manage; suspended denied. Profile picture upload can be deferred to a safe configured avatar URL/path field, but do not expose arbitrary storage.

Security hardening: accepted membership requires an active student profile on every protected read, including Storage. Recurring schedule writes go through `save_schedule_slot`; direct authenticated slot writes are revoked. Slot and lesson update IDs must already belong to the supplied group, and a lesson's recurring slot must belong to that same group. Initial file upload is authorized from the opaque teacher/lesson object path before metadata exists; later reads, replacement, and deletion require the metadata relation. File cleanup after metadata failure remains an application responsibility. Link and note metadata has no storage path. Catalogue and platform-setting mutations require an active administrator through RLS.

Public queries: education_nodes,subjects,offerings; groups published + approved active teacher. Teacher full name via public_teachers RPC, not profiles. Owner can read draft groups. Accepted students can read their group's content even if unpublished (archived remains historical read).

Application routes locale-prefixed: /[locale], /teachers, /teachers/[id], /classes, /classes/[id], /login, /register, /dashboard, /profile, /timetable, /notifications, /reports, /teacher/groups, /teacher/groups/[id], /teacher/requests, /teacher/students, /teacher/lessons, /student/classes, /student/materials, /admin, /admin/users, /admin/education, /admin/groups, /admin/reports, /admin/settings.
