\set ON_ERROR_STOP on
begin;

do $$begin
 if to_regprocedure('public.discover_groups_rated(uuid,uuid,uuid,integer,boolean,text,integer,integer,text,integer)') is null then raise exception 'rated discovery RPC missing'; end if;
 if to_regprocedure('public.public_teachers_rated()') is null then raise exception 'rated teacher RPC missing'; end if;
 if has_function_privilege('anon','dars_private.public_teacher_rating_aggregate(uuid[])','EXECUTE') or has_function_privilege('authenticated','dars_private.public_teacher_rating_aggregate(uuid[])','EXECUTE') then raise exception 'private aggregate is executable by public roles'; end if;
 if has_table_privilege('anon','dars_private.group_feedback','SELECT') or has_table_privilege('authenticated','dars_private.group_feedback','SELECT') then raise exception 'feedback table is readable by public roles'; end if;
end$$;

insert into auth.users(id,aud,role,email,raw_user_meta_data) values
 ('82000000-0000-4000-8000-000000000001','authenticated','authenticated','rating-teacher-one@regression.test','{"full_name":"Rating Teacher One","requested_role":"teacher"}'),
 ('82000000-0000-4000-8000-000000000002','authenticated','authenticated','rating-teacher-two@regression.test','{"full_name":"Rating Teacher Two","requested_role":"teacher"}'),
 ('82000000-0000-4000-8000-000000000003','authenticated','authenticated','rating-teacher-three@regression.test','{"full_name":"Rating Teacher Three","requested_role":"teacher"}'),
 ('82000000-0000-4000-8000-000000000004','authenticated','authenticated','rating-teacher-four@regression.test','{"full_name":"Rating Teacher Four","requested_role":"teacher"}'),
 ('82000000-0000-4000-8000-000000000005','authenticated','authenticated','rating-student@regression.test','{"full_name":"Rating Student Private","requested_role":"student"}');
set local session_replication_role=replica;
update public.teacher_profiles set approved=true where id in ('82000000-0000-4000-8000-000000000001','82000000-0000-4000-8000-000000000002','82000000-0000-4000-8000-000000000003','82000000-0000-4000-8000-000000000004');
set local session_replication_role=origin;
insert into public.groups(id,teacher_id,offering_id,name,capacity,status) select x.id,x.teacher_id,o.id,x.name,5,'draft' from (values
 ('82100000-0000-4000-8000-000000000001'::uuid,'82000000-0000-4000-8000-000000000001'::uuid,'Rating one A'),
 ('82100000-0000-4000-8000-000000000002'::uuid,'82000000-0000-4000-8000-000000000001'::uuid,'Rating one B'),
 ('82100000-0000-4000-8000-000000000003'::uuid,'82000000-0000-4000-8000-000000000001'::uuid,'Rating one C'),
 ('82100000-0000-4000-8000-000000000004'::uuid,'82000000-0000-4000-8000-000000000002'::uuid,'Rating two A'),
 ('82100000-0000-4000-8000-000000000008'::uuid,'82000000-0000-4000-8000-000000000002'::uuid,'Rating two B'),
 ('82100000-0000-4000-8000-000000000009'::uuid,'82000000-0000-4000-8000-000000000002'::uuid,'Rating two C'),
 ('82100000-0000-4000-8000-000000000010'::uuid,'82000000-0000-4000-8000-000000000002'::uuid,'Rating two D'),
 ('82100000-0000-4000-8000-000000000005'::uuid,'82000000-0000-4000-8000-000000000003'::uuid,'Rating three A'),
 ('82100000-0000-4000-8000-000000000006'::uuid,'82000000-0000-4000-8000-000000000003'::uuid,'Rating three B'),
 ('82100000-0000-4000-8000-000000000007'::uuid,'82000000-0000-4000-8000-000000000004'::uuid,'Rating zero')) x(id,teacher_id,name) cross join lateral(select id from public.offerings order by id limit 1)o;
set local session_replication_role=replica;
update public.groups set status='published' where id between '82100000-0000-4000-8000-000000000001' and '82100000-0000-4000-8000-000000000010';
set local session_replication_role=origin;
insert into dars_private.group_feedback(group_id,student_id,rating,status,comment) values
 ('82100000-0000-4000-8000-000000000001','82000000-0000-4000-8000-000000000005',5,'approved','An approved private feedback comment.'),
 ('82100000-0000-4000-8000-000000000002','82000000-0000-4000-8000-000000000005',4,'approved','An approved private feedback comment.'),
 ('82100000-0000-4000-8000-000000000003','82000000-0000-4000-8000-000000000005',4,'approved','An approved private feedback comment.'),
 ('82100000-0000-4000-8000-000000000004','82000000-0000-4000-8000-000000000005',5,'approved','An approved private feedback comment.'),
 ('82100000-0000-4000-8000-000000000008','82000000-0000-4000-8000-000000000005',4,'approved','An approved private feedback comment.'),
 ('82100000-0000-4000-8000-000000000009','82000000-0000-4000-8000-000000000005',4,'approved','An approved private feedback comment.'),
 ('82100000-0000-4000-8000-000000000010','82000000-0000-4000-8000-000000000005',4,'approved','An approved private feedback comment.'),
 ('82100000-0000-4000-8000-000000000005','82000000-0000-4000-8000-000000000005',5,'approved','An approved private feedback comment.'),
 ('82100000-0000-4000-8000-000000000006','82000000-0000-4000-8000-000000000005',4,'pending','Pending private feedback comment.');

set local role anon;
set local request.jwt.claims='{}';
do $$declare r record; t jsonb;begin
 if not has_function_privilege('anon','public.discover_groups_rated(uuid,uuid,uuid,integer,boolean,text,integer,integer,text,integer)','EXECUTE') then raise exception 'anon cannot call rated discovery';end if;
 select * into r from public.discover_groups_rated(null,null,null,null,false,'',0,1,'rating',null);
 if r.teacher_id<>'82000000-0000-4000-8000-000000000002' or r.teacher_rating_average<>4.3 or r.teacher_rating_count<>4 then raise exception 'first rating summary incorrect: %',row_to_json(r);end if;
 select * into r from public.discover_groups_rated(null,null,null,null,false,'',4,1,'rating',null);
 if r.teacher_id<>'82000000-0000-4000-8000-000000000001' or r.teacher_rating_average<>4.3 or r.teacher_rating_count<>3 then raise exception 'unthresholded rating should not affect sort/page: %',row_to_json(r);end if;
 select * into r from public.discover_groups_rated(null,null,null,null,false,'',0,50,'default',null) where id='82100000-0000-4000-8000-000000000005';
 if r.teacher_rating_average is not null or r.teacher_rating_count<>0 then raise exception 'below-threshold rating leaked';end if;
 if exists(select 1 from public.discover_groups_rated(null,null,null,null,false,'',0,50,'default',4) where teacher_id='82000000-0000-4000-8000-000000000003') then raise exception 'two reviews passed minimum rating';end if;
 if not exists(select 1 from public.discover_groups_rated(null,null,null,null,false,'',0,50,'default',4) where teacher_id='82000000-0000-4000-8000-000000000001') then raise exception 'eligible teacher excluded by minimum rating';end if;
 begin perform * from public.discover_groups_rated(null,null,null,null,false,'',0,10,'unknown',null);raise exception 'invalid sort accepted';exception when invalid_parameter_value then null;end;
 begin perform * from public.discover_groups_rated(null,null,null,null,false,'',0,10,'default',6);raise exception 'invalid minimum accepted';exception when invalid_parameter_value then null;end;
 t:=(select to_jsonb(x) from public.public_teachers_rated() x where x.id='82000000-0000-4000-8000-000000000004');
 if t is null or t->>'teacher_rating_average' is not null or t->>'teacher_rating_count'<>'0' then raise exception 'teacher projection lost unrated public teacher';end if;
 if t::text like '%student%' or t::text like '%private feedback%' or t::text like '%admin_note%' then raise exception 'private review fields leaked';end if;
end$$;
reset role;
set local role authenticated;
set local request.jwt.claims='{"sub":"82000000-0000-4000-8000-000000000005","role":"authenticated"}';
do $$begin
 if (select count(*) from public.discover_groups_rated())=0 then raise exception 'authenticated rated discovery returned no groups';end if;
end$$;
reset role;
select 'teacher ratings fixture passed';
rollback;
