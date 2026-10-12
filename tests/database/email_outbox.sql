\set ON_ERROR_STOP on
begin;

do $$
begin
  if to_regclass('dars_private.email_outbox') is null then raise exception 'private email outbox is missing'; end if;
  if has_schema_privilege('anon','dars_private','USAGE') or has_schema_privilege('authenticated','dars_private','USAGE') then
    raise exception 'client role can access private outbox schema';
  end if;
  if has_table_privilege('anon','dars_private.email_outbox','SELECT') or has_table_privilege('authenticated','dars_private.email_outbox','SELECT,INSERT,UPDATE,DELETE') then
    raise exception 'client role can read or mutate the email outbox';
  end if;
  if has_function_privilege('anon','dars_private.enqueue_email_event(text,text,uuid,uuid,jsonb)','EXECUTE')
     or has_function_privilege('authenticated','dars_private.enqueue_email_event(text,text,uuid,uuid,jsonb)','EXECUTE') then
    raise exception 'client role can enqueue arbitrary email jobs';
  end if;
end $$;

insert into auth.users(id,aud,role,email,raw_user_meta_data) values
 ('7c000000-0000-4000-8000-000000000001','authenticated','authenticated','canonical-review@test.invalid','{"full_name":"Canonical review","requested_role":"teacher"}'),
 ('7c000000-0000-4000-8000-000000000002','authenticated','authenticated','recipient-student@test.invalid','{"full_name":"Recipient student","requested_role":"student"}');
insert into public.teacher_contacts(teacher_id,contact_email) values ('7c000000-0000-4000-8000-000000000001','editable-contact@test.invalid');

set local role postgres;
do $$
declare v_first uuid; v_second uuid; v_email text; v_payload jsonb;
begin
  v_payload:='{"teacher_name":"Canonical review","review_event_id":"7c100000-0000-4000-8000-000000000001"}'::jsonb;
  v_first:=dars_private.enqueue_email_event('teacher-review-decision:7c100000-0000-4000-8000-000000000001',
    'teacher_review_decided','7c000000-0000-4000-8000-000000000001','7c000000-0000-4000-8000-000000000001',v_payload);
  v_second:=dars_private.enqueue_email_event('teacher-review-decision:7c100000-0000-4000-8000-000000000001',
    'teacher_review_decided','7c000000-0000-4000-8000-000000000001','7c000000-0000-4000-8000-000000000001','{"teacher_name":"Changed","review_event_id":"different"}'::jsonb);
  select recipient_email,payload into v_email,v_payload from dars_private.email_outbox where id=v_first;
  if v_first is distinct from v_second then raise exception 'duplicate event key created another outbox row'; end if;
  if v_email<>'canonical-review@test.invalid' then raise exception 'outbox used contact_email instead of canonical Auth email'; end if;
  if v_payload->>'teacher_name'<>'Canonical review' then raise exception 'duplicate event key overwrote its original payload'; end if;
  if (select count(*) from dars_private.email_outbox)<>1 then raise exception 'unexpected outbox duplicate'; end if;
  begin
    perform dars_private.enqueue_email_event('bad:student','enrollment_requested','7c000000-0000-4000-8000-000000000001','7c000000-0000-4000-8000-000000000002','{}'::jsonb);
    raise exception 'non-teacher recipient accepted';
  exception when raise_exception then
    if sqlerrm='non-teacher recipient accepted' then raise; end if;
  end;
end $$;
reset role;

rollback;
