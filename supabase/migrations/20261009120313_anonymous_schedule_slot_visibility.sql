begin;

-- Existing owner/member schedule policies need authenticated-only helper
-- access. Keep their checks intact and expose the public projection separately.
alter policy slots_read on public.group_schedule_slots to authenticated;
alter policy slots_write on public.group_schedule_slots to authenticated;

create policy slots_public_read on public.group_schedule_slots
for select to anon
using(exists(
  select 1
  from public.public_groups() pg
  where pg.id=public.group_schedule_slots.group_id
));

commit;
