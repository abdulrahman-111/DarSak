begin;

-- A signed-in visitor should receive the same public weekly schedule projection
-- as an anonymous visitor. The policy delegates eligibility to public_groups(),
-- which excludes drafts, archived groups, and unavailable/unapproved teachers.
alter policy slots_public_read on public.group_schedule_slots
  to anon, authenticated;

commit;
