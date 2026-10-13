begin;

create or replace function public.handle_new_user() returns trigger language plpgsql security definer set search_path=pg_catalog,public as $$
declare requested text:=new.raw_user_meta_data->>'requested_role';
begin
 if requested is null or requested not in ('student','teacher') then requested:='student'; end if;
 insert into public.profiles(id,full_name,role) values(new.id,coalesce(nullif(btrim(new.raw_user_meta_data->>'full_name'),''),'New user'),requested::public.user_role);
 if requested='teacher' then insert into public.teacher_profiles(id) values(new.id); else insert into public.student_profiles(id) values(new.id); end if; return new;
end $$;

commit;
