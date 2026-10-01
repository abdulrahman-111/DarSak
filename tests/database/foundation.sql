\set ON_ERROR_STOP on
do $$
begin
 if not exists(select 1 from pg_type where typname='user_role') then raise exception 'foundation migration not applied'; end if;
 if (select count(*) from public.education_nodes where kind='system')<3 then raise exception 'catalogue seed incomplete'; end if;
 if (select count(*) from public.offerings)<3 then raise exception 'offering seed incomplete'; end if;
 if (select relrowsecurity from pg_class where oid='public.profiles'::regclass) is not true then raise exception 'profiles RLS missing'; end if;
 if (select relrowsecurity from pg_class where oid='public.lesson_materials'::regclass) is not true then raise exception 'materials RLS missing'; end if;
end $$;
do $$
begin
 if (select coalesce(proargnames,'{}'::text[]) && array['role','status'] from pg_proc where oid='public.public_teachers()'::regprocedure) then raise exception 'unsafe public projection'; end if;
 if not exists(select 1 from pg_policies where schemaname='public' and tablename='profiles' and policyname='profile_self_update') then raise exception 'profile update policy missing'; end if;
 if not exists(select 1 from pg_policies where schemaname='storage' and tablename='objects' and policyname='lesson_objects_read') then raise exception 'storage read policy missing'; end if;
 if position('for update' in lower((select prosrc from pg_proc where oid='public.decide_enrollment(uuid,text)'::regprocedure)))=0 then raise exception 'enrollment RPC does not lock capacity'; end if;
 if position('teacher-calendar:' in (select prosrc from pg_proc where oid='public.save_schedule_slot(uuid,integer,time without time zone,time without time zone,uuid)'::regprocedure))=0 then raise exception 'schedule RPC missing calendar lock'; end if;
end $$;
select 'foundation SQL assertions passed' as result;
