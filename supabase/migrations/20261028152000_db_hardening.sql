-- DB hardening for issues #94 (recurring slot overlaps) and #103 (advisor findings).
--
-- #94: save_schedule_slot (latest definition: 20261014131808) already takes
-- pg_advisory_xact_lock(hashtextextended('teacher-calendar:'||teacher_id::text,0)) before its
-- overlap check, and it is the only function that inserts or updates group_schedule_slots, so
-- no function change is needed. What was missing is a database-level guarantee for writers that
-- bypass the RPC, so an exclusion constraint now rejects overlapping slots within one group.
--
-- #103: indexes for unindexed foreign keys, and one permissive SELECT policy per role on the
-- tables the advisor flagged. The unused indexes are intentionally left alone.
begin;

create extension if not exists btree_gist with schema extensions;

-- 1. Defensive cleanup. Production has no overlapping slots, but the constraint cannot be added if
--    any exist. Overlapping slots in the same group are merged into the oldest one (covering the
--    union of the times), and lessons are re-pointed to it where that does not collide with
--    lessons_generated_once; the remaining lessons keep their dates (slot_id is set to null by the
--    ON DELETE SET NULL foreign key). The weekly-schedule notification triggers are paused so a
--    cleanup does not message students.
do $$
declare
  v_keep uuid;
  v_drop uuid;
  v_paused boolean := false;
begin
  loop
    select a.id, b.id into v_keep, v_drop
    from public.group_schedule_slots a
    join public.group_schedule_slots b
      on b.group_id = a.group_id and b.weekday = a.weekday
     and a.start_time < b.end_time and a.end_time > b.start_time
     and (a.created_at, a.id) < (b.created_at, b.id)
    order by a.group_id, a.weekday, a.created_at, a.id, b.created_at, b.id
    limit 1;
    exit when v_keep is null;

    if not v_paused then
      alter table public.group_schedule_slots disable trigger user_notifications_slot_insert;
      alter table public.group_schedule_slots disable trigger user_notifications_slot_update;
      alter table public.group_schedule_slots disable trigger user_notifications_slot_delete;
      v_paused := true;
    end if;

    update public.group_schedule_slots k
    set start_time = least(k.start_time, d.start_time), end_time = greatest(k.end_time, d.end_time)
    from public.group_schedule_slots d
    where k.id = v_keep and d.id = v_drop;

    update public.lessons l
    set slot_id = v_keep
    where l.slot_id = v_drop
      and not exists (
        select 1 from public.lessons o
        where o.group_id = l.group_id and o.slot_id = v_keep and o.local_date is not distinct from l.local_date
          and l.local_date is not null
      );

    delete from public.group_schedule_slots where id = v_drop;
  end loop;

  if v_paused then
    alter table public.group_schedule_slots enable trigger user_notifications_slot_insert;
    alter table public.group_schedule_slots enable trigger user_notifications_slot_update;
    alter table public.group_schedule_slots enable trigger user_notifications_slot_delete;
  end if;
end $$;

-- start_time < end_time is already a table check and both columns are plain time values, so no slot
-- crosses midnight. Ranges are half-open, so back-to-back slots (10:00-11:00, 11:00-12:00) are fine.
alter table public.group_schedule_slots
  add constraint group_schedule_slots_no_overlap
  exclude using gist (
    group_id with =,
    weekday with =,
    tsrange(('2000-01-01'::date + start_time), ('2000-01-01'::date + end_time)) with &&
  );

-- 2. Foreign-key indexes (#103).
create index if not exists student_saved_groups_group_id_idx on public.student_saved_groups(group_id);
create index if not exists waitlist_entries_enrollment_id_idx on public.waitlist_entries(enrollment_id);
create index if not exists assignment_submissions_feedback_by_idx on public.assignment_submissions(feedback_by);
create index if not exists lesson_attendance_recorded_by_idx on public.lesson_attendance(recorded_by);
create index if not exists booking_slots_proposed_by_idx on public.booking_slots(proposed_by);
create index if not exists teacher_applications_reviewed_by_idx on public.teacher_applications(reviewed_by);
create index if not exists group_feedback_student_id_idx on dars_private.group_feedback(student_id);
create index if not exists internal_teacher_review_decisions_teacher_id_idx on dars_private.internal_teacher_review_decisions(teacher_id);
create index if not exists teacher_access_fee_policy_updated_by_idx on dars_private.teacher_access_fee_policy(updated_by);
-- Composite FK teacher_access_grant_request_fk (request_id, teacher_id) -> teacher_access_requests(id, teacher_id).
create index if not exists teacher_access_grants_request_fk_idx on dars_private.teacher_access_grants(request_id, teacher_id);
create index if not exists teacher_access_requests_decided_by_idx on dars_private.teacher_access_requests(decided_by);
create index if not exists teacher_access_state_current_grant_id_idx on dars_private.teacher_access_state(current_grant_id);
create index if not exists teacher_quota_policy_updated_by_idx on dars_private.teacher_quota_policy(updated_by);

-- 3. Split FOR ALL write policies (#103). Each is replaced by INSERT, UPDATE and DELETE policies
--    carrying the same roles and predicates as the policy currently in the catalogue (read from
--    pg_policy, so later ALTER POLICY changes are preserved exactly). A FOR ALL policy's USING
--    clause also made rows visible to SELECT; for every table below the read policy already admits
--    every row the write policy admitted (owner or admin), so reads are unchanged.
--    auth.uid() is wrapped as (select auth.uid()) where it was not already.
create or replace function pg_temp.dars_wrap_uid(p_expr text) returns text
language sql immutable as $$
  select replace(
    replace(
      regexp_replace(p_expr, '\(\s*SELECT\s+auth\.uid\(\)\s+AS\s+uid\s*\)', '@@UID@@', 'gi'),
      'auth.uid()', '(select auth.uid())'),
    '@@UID@@', '(select auth.uid())')
$$;

do $$
declare
  r record;
  v_pol record;
  v_roles text;
  v_using text;
  v_check text;
  v_target text;
begin
  for r in
    select * from (values
      ('public.groups', 'groups_write'),
      ('public.group_schedule_slots', 'slots_write'),
      ('public.lesson_materials', 'material_write'),
      ('public.teacher_contacts', 'teacher_contacts_manage'),
      ('public.education_nodes', 'education_nodes_admin_write'),
      ('public.subjects', 'subjects_admin_write'),
      ('public.offerings', 'offerings_admin_write')
    ) as t(tbl, pol)
  loop
    select p.oid, p.polcmd, p.polroles, p.polqual, p.polwithcheck, p.polrelid
      into v_pol
    from pg_policy p
    where p.polrelid = r.tbl::regclass and p.polname = r.pol;
    if not found then
      raise exception 'expected policy % on % not found', r.pol, r.tbl;
    end if;
    if v_pol.polcmd <> '*' then
      raise exception 'policy % on % is not FOR ALL', r.pol, r.tbl;
    end if;

    select string_agg(case when o = 0 then 'public' else quote_ident(rl.rolname) end, ', ')
      into v_roles
    from unnest(v_pol.polroles) as o
    left join pg_roles rl on rl.oid = o;

    v_using := pg_temp.dars_wrap_uid(pg_get_expr(v_pol.polqual, v_pol.polrelid));
    v_check := pg_temp.dars_wrap_uid(coalesce(pg_get_expr(v_pol.polwithcheck, v_pol.polrelid),
                                              pg_get_expr(v_pol.polqual, v_pol.polrelid)));

    execute format('create policy %I on %s for insert to %s with check (%s)',
      r.pol || '_insert', r.tbl, v_roles, v_check);
    execute format('create policy %I on %s for update to %s using (%s) with check (%s)',
      r.pol || '_update', r.tbl, v_roles, v_using, v_check);
    execute format('create policy %I on %s for delete to %s using (%s)',
      r.pol || '_delete', r.tbl, v_roles, v_using);
    execute format('drop policy %I on %s', r.pol, r.tbl);
  end loop;
end $$;

-- 4. group_schedule_slots: authenticated matched both slots_read and slots_public_read. Fold the
--    public-schedule predicate into slots_read (OR of both) and leave slots_public_read for anon only.
do $$
declare
  v_read text;
  v_public text;
begin
  select pg_get_expr(polqual, polrelid) into strict v_read
  from pg_policy where polrelid = 'public.group_schedule_slots'::regclass and polname = 'slots_read';
  select pg_get_expr(polqual, polrelid) into strict v_public
  from pg_policy where polrelid = 'public.group_schedule_slots'::regclass and polname = 'slots_public_read';

  execute format('alter policy slots_read on public.group_schedule_slots using ((%s) or (%s))',
    pg_temp.dars_wrap_uid(v_read), pg_temp.dars_wrap_uid(v_public));
  alter policy slots_public_read on public.group_schedule_slots to anon;
end $$;

-- Sanity: nothing flagged by the advisor may remain FOR ALL.
do $$
begin
  if exists (
    select 1 from pg_policy
    where polcmd = '*' and polrelid in (
      'public.groups'::regclass, 'public.group_schedule_slots'::regclass, 'public.lesson_materials'::regclass,
      'public.teacher_contacts'::regclass, 'public.education_nodes'::regclass, 'public.subjects'::regclass,
      'public.offerings'::regclass)
  ) then
    raise exception 'a FOR ALL policy remains on a split table';
  end if;
end $$;

commit;
