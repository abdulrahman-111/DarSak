begin;

-- Auth administrator deletion must be able to remove the corresponding domain
-- rows. Child group records already cascade through schedules, enrollments,
-- lessons, and materials.
alter table public.groups drop constraint groups_teacher_id_fkey;
alter table public.groups
  add constraint groups_teacher_id_fkey
  foreign key (teacher_id) references public.profiles(id) on delete cascade;

alter table public.enrollments drop constraint enrollments_student_id_fkey;
alter table public.enrollments
  add constraint enrollments_student_id_fkey
  foreign key (student_id) references public.profiles(id) on delete cascade;

alter table public.reports drop constraint reports_reporter_id_fkey;
alter table public.reports
  add constraint reports_reporter_id_fkey
  foreign key (reporter_id) references public.profiles(id) on delete cascade;

alter table public.lesson_materials drop constraint lesson_materials_uploaded_by_fkey;
alter table public.lesson_materials
  add constraint lesson_materials_uploaded_by_fkey
  foreign key (uploaded_by) references public.profiles(id) on delete cascade;

commit;
