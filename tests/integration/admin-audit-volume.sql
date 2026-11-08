-- Disposable local CI volume fixture only. Staging callers must wrap this file
-- in BEGIN/ROLLBACK. Never run against a hosted database.
with generated as (
  select gen_random_uuid() as id, n,
         clock_timestamp() - (n % 30) * interval '1 day' as created_at
  from generate_series(1, 5000) as n
)
insert into auth.users(
  instance_id,id,aud,role,email,encrypted_password,email_confirmed_at,
  raw_app_meta_data,raw_user_meta_data,created_at,updated_at,
  confirmation_token,recovery_token,email_change_token_new,email_change,
  email_change_token_current,reauthentication_token
)
select '00000000-0000-0000-0000-000000000000', id, 'authenticated','authenticated',
       'a149-volume-'||n||'@e2e.invalid', crypt(gen_random_uuid()::text,gen_salt('bf')),
       now(), '{"provider":"email","providers":["email"]}'::jsonb,
       '{"full_name":"Audit volume fixture","requested_role":"student"}'::jsonb,
       created_at, created_at, '', '', '', '', '', ''
from generated;

update public.profiles p
set created_at = u.created_at
from auth.users u
where u.id=p.id and u.email like 'a149-volume-%@e2e.invalid';

insert into dars_private.audit_log(at,actor_id,actor_role,action,target_type,target_id,metadata)
select clock_timestamp() - (n % 30) * interval '1 day', null, 'system',
       'report_resolved','report',gen_random_uuid(),'{"status":"resolved"}'::jsonb
from generate_series(1, 20000) as n;
