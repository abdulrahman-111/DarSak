begin;

CREATE OR REPLACE FUNCTION public.save_teacher_group_draft(p_group_id uuid, p_subject_id uuid, p_category_id uuid, p_name text, p_description text, p_capacity integer, p_location text, p_expected_updated_at timestamp with time zone)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'auth'
AS $function$
declare
 v_teacher uuid:=auth.uid(); v_group public.groups; v_subject_owner uuid; v_subject_archived timestamptz; v_node_owner uuid; v_node_archived timestamptz;
 v_offering_owner uuid; v_offering_archived timestamptz; v_old_node uuid; v_old_subject uuid; v_old_offering uuid; v_offering uuid; v_existing_archived timestamptz;
 v_name text:=btrim(coalesce(p_name,'')); v_description text:=coalesce(p_description,''); v_location text:=btrim(coalesce(p_location,'')); v_accepted_count bigint;
begin
  if public.current_role() = 'teacher'::public.user_role and not coalesce(dars_private.teacher_has_access(auth.uid()), false) then
    raise exception 'teacher teaching access expired' using errcode = '42501';
  end if;
 if not private.teacher_catalogue_active(v_teacher) then raise exception 'active teacher required' using errcode='42501'; end if;
 if p_group_id is null and p_expected_updated_at is not null then raise exception 'new drafts cannot include an expected timestamp'; end if;
 if p_group_id is not null and p_expected_updated_at is null then raise exception 'group timestamp is required'; end if;
 if length(v_name) not between 2 and 120 or length(v_description)>2000 or p_capacity not between 1 and 500 or length(v_location)>200 then
   raise exception 'group fields are invalid';
 end if;
 perform pg_advisory_xact_lock(hashtextextended('teacher-calendar:'||v_teacher::text,0));
 if not private.teacher_catalogue_active(v_teacher) then raise exception 'active teacher required' using errcode='42501'; end if;
 if p_group_id is not null then
   select * into v_group from public.groups where id=p_group_id for update;
   if not found or v_group.teacher_id<>v_teacher or v_group.status not in ('draft','published') then raise exception 'owned editable group not found'; end if;
   if v_group.updated_at is distinct from p_expected_updated_at then raise exception 'group changed; refresh and retry' using errcode='40001'; end if;
   if v_group.status='published' then
     if not exists(select 1 from public.teacher_profiles tp where tp.id=v_teacher and tp.approved)
       then raise exception 'only an approved teacher may edit a published group' using errcode='42501'; end if;
     select count(*) into v_accepted_count from public.enrollments e where e.group_id=p_group_id and e.status='accepted';
     if p_capacity<v_accepted_count then raise exception 'capacity cannot be below accepted enrollment count'; end if;
   end if;
   v_old_offering:=v_group.offering_id;
   select node_id,subject_id into v_old_node,v_old_subject from public.offerings where id=v_old_offering;
 end if;
 -- Group ownership, editable status and CAS are checked before catalogue resolution or insertion.
 perform 1 from public.subjects where id=p_subject_id for update;
 if not found then raise exception 'subject is not selectable'; end if;
 perform 1 from public.education_nodes where id=p_category_id for update;
 if not found then raise exception 'category is not selectable'; end if;
 select owner_teacher_id,archived_at into v_subject_owner,v_subject_archived from public.subjects where id=p_subject_id;
 select owner_teacher_id,archived_at into v_node_owner,v_node_archived from public.education_nodes where id=p_category_id;
 if (v_subject_owner is not null and v_subject_owner<>v_teacher) or (v_node_owner is not null and v_node_owner<>v_teacher) then raise exception 'catalogue components belong to another teacher'; end if;
 if p_group_id is not null and p_subject_id=v_old_subject and p_category_id=v_old_node then
   v_offering:=v_old_offering;
   select owner_teacher_id,archived_at into v_offering_owner,v_offering_archived from public.offerings where id=v_offering for update;
 else
   if v_subject_archived is not null or v_node_archived is not null then raise exception 'choose active catalogue components'; end if;
   if v_subject_owner is null and v_node_owner is null then
     select id,archived_at into v_offering,v_existing_archived from public.offerings
       where owner_teacher_id is null and subject_id=p_subject_id and node_id=p_category_id for update;
     if v_existing_archived is not null then v_offering:=null; end if;
   end if;
   if v_offering is null then
     select id,archived_at into v_offering,v_existing_archived from public.offerings
       where owner_teacher_id=v_teacher and subject_id=p_subject_id and node_id=p_category_id for update;
   end if;
   if v_offering is not null then
     if v_existing_archived is not null then raise exception 'restore the archived specialization before selecting it'; end if;
   else
     insert into public.offerings(node_id,subject_id,owner_teacher_id) values(p_category_id,p_subject_id,v_teacher)
     on conflict(owner_teacher_id,node_id,subject_id) where owner_teacher_id is not null do nothing returning id into v_offering;
     if v_offering is null then
       select id,archived_at into v_offering,v_existing_archived from public.offerings
       where owner_teacher_id=v_teacher and subject_id=p_subject_id and node_id=p_category_id;
       if v_existing_archived is not null then raise exception 'restore the archived specialization before selecting it'; end if;
     end if;
   end if;
   select owner_teacher_id,archived_at into v_offering_owner,v_offering_archived from public.offerings where id=v_offering for update;
 end if;
 if (v_offering_owner is not null and v_offering_owner<>v_teacher) then raise exception 'offering belongs to another teacher'; end if;
 if p_group_id is null then
   insert into public.groups(teacher_id,offering_id,name,description,capacity,location,status)
   values(v_teacher,v_offering,v_name,v_description,p_capacity,v_location,'draft') returning id into v_group.id;
 else
   update public.groups set offering_id=v_offering,name=v_name,description=v_description,capacity=p_capacity,location=v_location
   where id=p_group_id returning * into v_group;
 end if;
 return v_group.id;
end
$function$;

revoke all on function public.save_teacher_group_draft(uuid,uuid,uuid,text,text,integer,text,timestamp with time zone) from public,anon,authenticated,service_role;
grant execute on function public.save_teacher_group_draft(uuid,uuid,uuid,text,text,integer,text,timestamp with time zone) to authenticated;

commit;
