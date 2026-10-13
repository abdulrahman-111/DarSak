\set ON_ERROR_STOP on
begin;

do $$
declare v_proc oid := 'public.public_teacher_specialization_labels(uuid)'::regprocedure;
begin
  if not has_function_privilege('anon',v_proc,'EXECUTE')
     or not has_function_privilege('authenticated',v_proc,'EXECUTE') then
    raise exception 'public specialization label RPC grants missing';
  end if;
  if has_function_privilege('service_role',v_proc,'EXECUTE') then
    raise exception 'specialization label RPC must not be granted to service_role';
  end if;
  if (select prosecdef from pg_proc where oid=v_proc) is not true
     or (select provolatile from pg_proc where oid=v_proc) <> 's'
     or not (select proconfig @> array['search_path=pg_catalog, public'] from pg_proc where oid=v_proc) then
    raise exception 'specialization label RPC must be stable security definer with fixed search_path';
  end if;
  if has_table_privilege('anon','public.teacher_specializations','SELECT') then
    raise exception 'anonymous direct specialization reads were granted';
  end if;
end $$;

insert into auth.users(id,aud,role,email,raw_user_meta_data) values
 ('d8000000-0000-4000-8000-000000000001','authenticated','authenticated','labels-owner@regression.test','{"full_name":"Labels owner","requested_role":"teacher"}'),
 ('d8000000-0000-4000-8000-000000000002','authenticated','authenticated','labels-foreign@regression.test','{"full_name":"Labels foreign","requested_role":"teacher"}'),
 ('d8000000-0000-4000-8000-000000000003','authenticated','authenticated','labels-pending@regression.test','{"full_name":"Labels pending","requested_role":"teacher"}'),
 ('d8000000-0000-4000-8000-000000000004','authenticated','authenticated','labels-suspended@regression.test','{"full_name":"Labels suspended","requested_role":"teacher"}');

set local session_replication_role = replica;
update public.teacher_profiles set approved=true where id in (
 'd8000000-0000-4000-8000-000000000001',
 'd8000000-0000-4000-8000-000000000002',
 'd8000000-0000-4000-8000-000000000004'
);
update public.profiles set status='suspended' where id='d8000000-0000-4000-8000-000000000004';
set local session_replication_role = origin;

insert into public.subjects(id,name_ar,name_en,slug,owner_teacher_id,archived_at) values
 ('d8100000-0000-4000-8000-000000000001','رياضيات','Math','d8100000-0000-4000-8000-000000000001','d8000000-0000-4000-8000-000000000001','2026-01-01'),
 ('d8100000-0000-4000-8000-000000000002','فيزياء','Physics','d8100000-0000-4000-8000-000000000002','d8000000-0000-4000-8000-000000000001',null),
 ('d8100000-0000-4000-8000-000000000003','أحياء','Biology','d8100000-0000-4000-8000-000000000003','d8000000-0000-4000-8000-000000000002',null),
 ('d8100000-0000-4000-8000-000000000004','العلوم',' ','d8100000-0000-4000-8000-000000000004',null,null);

insert into public.education_nodes(id,parent_id,kind,name_ar,name_en,slug,owner_teacher_id,archived_at) values
 ('d8200000-0000-4000-8000-000000000001',null,'student_category','طلاب الجامعة','University Students','d8200000-0000-4000-8000-000000000001','d8000000-0000-4000-8000-000000000001','2026-01-01'),
 ('d8200000-0000-4000-8000-000000000002',null,'custom_year','سنة خاصة','Custom Year','d8200000-0000-4000-8000-000000000002','d8000000-0000-4000-8000-000000000001',null),
 ('d8200000-0000-4000-8000-000000000003',null,'student_category','طلاب المعلم الآخر','Other Teacher Students','d8200000-0000-4000-8000-000000000003','d8000000-0000-4000-8000-000000000002',null),
 ('d8200000-0000-4000-8000-000000000004',null,'system','مصر','Egypt','labels-shared-root',null,null),
 ('d8200000-0000-4000-8000-000000000005','d8200000-0000-4000-8000-000000000004','level',' ','Students','labels-shared-mid',null,null),
 ('d8200000-0000-4000-8000-000000000006','d8200000-0000-4000-8000-000000000005','grade','طلاب',' ','labels-shared-leaf',null,null),
 ('d8200000-0000-4000-8000-000000000007',null,'custom_year','حقل خاص','Foreign private root','d8200000-0000-4000-8000-000000000007','d8000000-0000-4000-8000-000000000002',null),
 ('d8200000-0000-4000-8000-000000000008','d8200000-0000-4000-8000-000000000005','grade','صف مشترك','Shared child','labels-foreign-child',null,null),
 ('d8200000-0000-4000-8000-000000000009',null,'system','مرحلة أ','Cycle A','labels-cycle-a',null,null),
 ('d8200000-0000-4000-8000-000000000010','d8200000-0000-4000-8000-000000000009','level','مرحلة ب','Cycle B','labels-cycle-b',null,null),
 ('d8200000-0000-4000-8000-000000000011','d8200000-0000-4000-8000-000000000005','grade','صف بلا أصل','Missing parent','labels-missing-parent',null,null),
 ('d8200000-0000-4000-8000-000000000012','d8200000-0000-4000-8000-000000000010','grade','صف دائري','Cycle leaf','labels-cycle-leaf',null,null);

insert into public.offerings(id,node_id,subject_id,owner_teacher_id,archived_at) values
 ('d8300000-0000-4000-8000-000000000001','d8200000-0000-4000-8000-000000000001','d8100000-0000-4000-8000-000000000001','d8000000-0000-4000-8000-000000000001','2026-01-01'),
 ('d8300000-0000-4000-8000-000000000002','d8200000-0000-4000-8000-000000000002','d8100000-0000-4000-8000-000000000002','d8000000-0000-4000-8000-000000000001',null),
 ('d8300000-0000-4000-8000-000000000003','d8200000-0000-4000-8000-000000000003','d8100000-0000-4000-8000-000000000003','d8000000-0000-4000-8000-000000000002',null),
 ('d8300000-0000-4000-8000-000000000004','d8200000-0000-4000-8000-000000000006','d8100000-0000-4000-8000-000000000004',null,null),
 ('d8300000-0000-4000-8000-000000000005','d8200000-0000-4000-8000-000000000008','d8100000-0000-4000-8000-000000000004',null,null),
 ('d8300000-0000-4000-8000-000000000006','d8200000-0000-4000-8000-000000000012','d8100000-0000-4000-8000-000000000004',null,null),
 ('d8300000-0000-4000-8000-000000000007','d8200000-0000-4000-8000-000000000011','d8100000-0000-4000-8000-000000000004',null,null);

set local session_replication_role = replica;
update public.education_nodes set parent_id='d8200000-0000-4000-8000-000000000010' where id='d8200000-0000-4000-8000-000000000009';
update public.education_nodes set parent_id='d8200000-0000-4000-8000-000000000007' where id='d8200000-0000-4000-8000-000000000008';
update public.education_nodes set parent_id='d8200000-0000-4000-8000-000000000099' where id='d8200000-0000-4000-8000-000000000011';
insert into public.teacher_specializations(teacher_id,offering_id) values
 ('d8000000-0000-4000-8000-000000000001','d8300000-0000-4000-8000-000000000001'),
 ('d8000000-0000-4000-8000-000000000001','d8300000-0000-4000-8000-000000000004'),
 ('d8000000-0000-4000-8000-000000000001','d8300000-0000-4000-8000-000000000005'),
 ('d8000000-0000-4000-8000-000000000001','d8300000-0000-4000-8000-000000000006'),
 ('d8000000-0000-4000-8000-000000000001','d8300000-0000-4000-8000-000000000007'),
 ('d8000000-0000-4000-8000-000000000001','d8300000-0000-4000-8000-000000000003'),
 ('d8000000-0000-4000-8000-000000000003','d8300000-0000-4000-8000-000000000001'),
 ('d8000000-0000-4000-8000-000000000004','d8300000-0000-4000-8000-000000000001'),
 ('d8000000-0000-4000-8000-000000000002','d8300000-0000-4000-8000-000000000003');
set local session_replication_role = origin;

set local role anon;
set local request.jwt.claim.sub = '';
do $$
declare v_labels record;
begin
  if (select count(*) from public.public_teacher_specialization_labels('d8000000-0000-4000-8000-000000000001')) <> 2 then
    raise exception 'public projection must include selected owned and shared labels but reject invalid/private pairs';
  end if;
  if not exists(select 1 from public.public_teacher_specialization_labels('d8000000-0000-4000-8000-000000000001')
      where offering_id='d8300000-0000-4000-8000-000000000001'
        and subject_name_ar='رياضيات' and subject_name_en='Math'
        and context_ar='طلاب الجامعة' and context_en='University Students') then
    raise exception 'selected archived teacher-owned offering must remain visible without a published group';
  end if;
  select * into v_labels from public.public_teacher_specialization_labels('d8000000-0000-4000-8000-000000000001')
  where offering_id='d8300000-0000-4000-8000-000000000004';
  if not found or v_labels.subject_name_en <> 'العلوم'
     or v_labels.context_ar <> 'مصر › Students › طلاب'
     or v_labels.context_en <> 'Egypt › Students › طلاب' then
    raise exception 'shared ancestor labels must fall back per label and aggregate root to leaf';
  end if;
  if exists(select 1 from public.public_teacher_specialization_labels('d8000000-0000-4000-8000-000000000001')
      where offering_id in ('d8300000-0000-4000-8000-000000000002','d8300000-0000-4000-8000-000000000003','d8300000-0000-4000-8000-000000000005','d8300000-0000-4000-8000-000000000006','d8300000-0000-4000-8000-000000000007')) then
    raise exception 'unselected, foreign-owned, foreign-ancestor, cyclic, or missing-parent labels leaked';
  end if;
  if (select count(*) from public.public_teacher_specialization_labels('d8000000-0000-4000-8000-000000000003')) <> 0
     or (select count(*) from public.public_teacher_specialization_labels('d8000000-0000-4000-8000-000000000004')) <> 0 then
    raise exception 'pending or suspended teacher labels must remain hidden';
  end if;
  if exists(select 1 from public.public_teacher_specializations('d8000000-0000-4000-8000-000000000001') where offering_id='d8300000-0000-4000-8000-000000000001') then
    raise exception 'legacy offering-id RPC behavior changed for unpublished owned offering';
  end if;
  if exists(select 1 from public.subjects where id in ('d8100000-0000-4000-8000-000000000001','d8100000-0000-4000-8000-000000000003'))
     or exists(select 1 from public.education_nodes where id in ('d8200000-0000-4000-8000-000000000001','d8200000-0000-4000-8000-000000000003'))
     or exists(select 1 from public.offerings where id in ('d8300000-0000-4000-8000-000000000001','d8300000-0000-4000-8000-000000000003')) then
    raise exception 'raw catalogue RLS exposed a teacher-owned row';
  end if;
end $$;
reset role;

set local role authenticated;
set local request.jwt.claim.sub = 'd8000000-0000-4000-8000-000000000002';
do $$
begin
  if exists(select 1 from public.subjects where id='d8100000-0000-4000-8000-000000000001')
     or exists(select 1 from public.education_nodes where id='d8200000-0000-4000-8000-000000000001')
     or exists(select 1 from public.offerings where id='d8300000-0000-4000-8000-000000000001') then
    raise exception 'foreign teacher raw catalogue reads exposed another teacher labels';
  end if;
  if (select count(*) from public.public_teacher_specialization_labels('d8000000-0000-4000-8000-000000000001')) <> 2 then
    raise exception 'authenticated public profile projection should retain its narrow approved labels';
  end if;
end $$;
reset role;

select 'public teacher specialization label assertions passed' as result;
rollback;
