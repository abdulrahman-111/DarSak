begin;

create or replace function private.teacher_catalogue_active(p_teacher_id uuid)
returns boolean language sql stable security definer
set search_path=pg_catalog,public
as $$
  select exists(
    select 1 from public.profiles p join public.teacher_profiles t on t.id=p.id
    where p.id=p_teacher_id and p.role='teacher' and p.status='active'
  )
$$;
revoke all on function private.teacher_catalogue_active(uuid) from public,anon,authenticated;

create or replace function private.validate_teacher_offering_ids(p_teacher_id uuid,p_ids uuid[])
returns void language plpgsql security definer
set search_path=pg_catalog,public
as $$
declare v_id uuid; v_old_ids uuid[];
begin
  if p_ids is null or cardinality(p_ids)<>(select count(distinct x) from unnest(p_ids) x)
     or cardinality(p_ids)<>(select count(*) from public.offerings o where o.id=any(p_ids)) then
    raise exception 'offering IDs must be distinct and valid';
  end if;
  select coalesce(array_agg(offering_id),array[]::uuid[]) into v_old_ids
  from public.teacher_specializations where teacher_id=p_teacher_id;

  perform 1 from public.subjects s join public.offerings o on o.subject_id=s.id
  where o.id=any(p_ids) order by s.id for share of s;
  perform 1 from public.education_nodes n join public.offerings o on o.node_id=n.id
  where o.id=any(p_ids) order by n.id for share of n;
  perform 1 from public.offerings o where o.id=any(p_ids) order by o.id for share;

  for v_id in select x from unnest(p_ids) x order by x loop
    if not exists(
      select 1 from public.offerings o
      join public.subjects s on s.id=o.subject_id
      join public.education_nodes n on n.id=o.node_id
      where o.id=v_id
        and (o.owner_teacher_id is null or o.owner_teacher_id=p_teacher_id)
        and (s.owner_teacher_id is null or s.owner_teacher_id=p_teacher_id)
        and (n.owner_teacher_id is null or n.owner_teacher_id=p_teacher_id)
        and (v_id=any(v_old_ids) or (o.archived_at is null and s.archived_at is null and n.archived_at is null))
    ) then raise exception 'offering is not an active shared or owned selection'; end if;
  end loop;
end
$$;
revoke all on function private.validate_teacher_offering_ids(uuid,uuid[]) from public,anon,authenticated;

create or replace function public.save_teacher_subject(p_id uuid,p_name_ar text,p_name_en text)
returns uuid language plpgsql security definer
set search_path=pg_catalog,public,auth
as $$
declare v_teacher uuid:=auth.uid(); v_id uuid:=coalesce(p_id,gen_random_uuid()); v_ar text:=btrim(coalesce(p_name_ar,'')); v_en text:=btrim(coalesce(p_name_en,''));
begin
  if not private.teacher_catalogue_active(v_teacher) then raise exception 'active teacher required' using errcode='42501'; end if;
  if length(v_ar)>120 or length(v_en)>120 or (v_ar='' and v_en='') then raise exception 'provide a label up to 120 characters in at least one language' using errcode='22023'; end if;
  perform pg_advisory_xact_lock(hashtextextended('teacher-calendar:'||v_teacher::text,0));
  if p_id is null then
    insert into public.subjects(id,owner_teacher_id,name_ar,name_en,slug) values(v_id,v_teacher,v_ar,v_en,v_id::text);
  else
    update public.subjects set name_ar=v_ar,name_en=v_en where id=p_id and owner_teacher_id=v_teacher and archived_at is null;
    if not found then raise exception 'active owned subject not found'; end if;
  end if;
  return v_id;
end
$$;
revoke all on function public.save_teacher_subject(uuid,text,text) from public,anon,authenticated;
grant execute on function public.save_teacher_subject(uuid,text,text) to authenticated;

create or replace function public.save_teacher_category(p_id uuid,p_kind text,p_name_ar text,p_name_en text)
returns uuid language plpgsql security definer
set search_path=pg_catalog,public,auth
as $$
declare v_teacher uuid:=auth.uid(); v_id uuid:=coalesce(p_id,gen_random_uuid()); v_ar text:=btrim(coalesce(p_name_ar,'')); v_en text:=btrim(coalesce(p_name_en,''));
begin
  if not private.teacher_catalogue_active(v_teacher) then raise exception 'active teacher required' using errcode='42501'; end if;
  if p_kind not in ('custom_year','student_category') then raise exception 'category kind must be custom_year or student_category' using errcode='22023'; end if;
  if length(v_ar)>120 or length(v_en)>120 or (v_ar='' and v_en='') then raise exception 'provide a label up to 120 characters in at least one language' using errcode='22023'; end if;
  perform pg_advisory_xact_lock(hashtextextended('teacher-calendar:'||v_teacher::text,0));
  if p_id is null then
    insert into public.education_nodes(id,parent_id,kind,name_ar,name_en,slug,owner_teacher_id)
    values(v_id,null,p_kind,v_ar,v_en,v_id::text,v_teacher);
  else
    update public.education_nodes set name_ar=v_ar,name_en=v_en
    where id=p_id and owner_teacher_id=v_teacher and kind=p_kind and parent_id is null and archived_at is null;
    if not found then raise exception 'active owned category of the requested kind not found'; end if;
  end if;
  return v_id;
end
$$;
revoke all on function public.save_teacher_category(uuid,text,text,text) from public,anon,authenticated;
grant execute on function public.save_teacher_category(uuid,text,text,text) to authenticated;

create or replace function public.set_teacher_catalogue_archived(p_kind text,p_id uuid,p_archived boolean)
returns void language plpgsql security definer
set search_path=pg_catalog,public,auth
as $$
declare v_teacher uuid:=auth.uid(); v_owner uuid; v_node uuid; v_subject uuid;
begin
  if not private.teacher_catalogue_active(v_teacher) then raise exception 'active teacher required' using errcode='42501'; end if;
  if p_kind not in ('subject','category','offering') or p_archived is null then raise exception 'invalid catalogue archive request' using errcode='22023'; end if;
  if p_kind='offering' then select owner_teacher_id,node_id,subject_id into v_owner,v_node,v_subject from public.offerings where id=p_id;
  elsif p_kind='subject' then select owner_teacher_id into v_owner from public.subjects where id=p_id;
  else select owner_teacher_id into v_owner from public.education_nodes where id=p_id; end if;
  if v_owner is distinct from v_teacher then raise exception 'owned catalogue row not found'; end if;
  perform pg_advisory_xact_lock(hashtextextended('teacher-calendar:'||v_teacher::text,0));
  if p_kind='offering' then
    perform 1 from public.subjects where id=v_subject for update;
    perform 1 from public.education_nodes where id=v_node for update;
    update public.offerings set archived_at=case when p_archived then clock_timestamp() else null end
      where id=p_id and owner_teacher_id=v_teacher;
  elsif p_kind='subject' then
    update public.subjects set archived_at=case when p_archived then clock_timestamp() else null end where id=p_id and owner_teacher_id=v_teacher;
  else
    update public.education_nodes set archived_at=case when p_archived then clock_timestamp() else null end where id=p_id and owner_teacher_id=v_teacher;
  end if;
  if not found then raise exception 'owned catalogue row changed'; end if;
end
$$;
revoke all on function public.set_teacher_catalogue_archived(text,uuid,boolean) from public,anon,authenticated;
grant execute on function public.set_teacher_catalogue_archived(text,uuid,boolean) to authenticated;

create or replace function public.save_teacher_offering(p_subject_id uuid,p_category_id uuid)
returns uuid language plpgsql security definer
set search_path=pg_catalog,public,auth
as $$
declare v_teacher uuid:=auth.uid(); v_subject_owner uuid; v_subject_archived timestamptz; v_node_owner uuid; v_node_archived timestamptz; v_offering_id uuid; v_existing_archived timestamptz;
begin
  if not private.teacher_catalogue_active(v_teacher) then raise exception 'active teacher required' using errcode='42501'; end if;
  perform pg_advisory_xact_lock(hashtextextended('teacher-calendar:'||v_teacher::text,0));
  perform 1 from public.subjects where id=p_subject_id for update;
  if not found then raise exception 'subject is not selectable'; end if;
  perform 1 from public.education_nodes where id=p_category_id for update;
  if not found then raise exception 'category is not selectable'; end if;
  select owner_teacher_id,archived_at into v_subject_owner,v_subject_archived from public.subjects where id=p_subject_id;
  select owner_teacher_id,archived_at into v_node_owner,v_node_archived from public.education_nodes where id=p_category_id;
  if (v_subject_owner is not null and v_subject_owner<>v_teacher) or (v_node_owner is not null and v_node_owner<>v_teacher)
     or v_subject_archived is not null or v_node_archived is not null then raise exception 'choose active shared or owned catalogue components'; end if;
  if v_subject_owner is null and v_node_owner is null then
    select id,archived_at into v_offering_id,v_existing_archived from public.offerings
    where owner_teacher_id is null and subject_id=p_subject_id and node_id=p_category_id for update;
    if found then
      if v_existing_archived is not null then raise exception 'restore the archived specialization before adding it'; end if;
      return v_offering_id;
    end if;
    insert into public.offerings(node_id,subject_id) values(p_category_id,p_subject_id)
    on conflict(node_id,subject_id) where owner_teacher_id is null do nothing returning id into v_offering_id;
  else
    select id,archived_at into v_offering_id,v_existing_archived from public.offerings
    where owner_teacher_id=v_teacher and subject_id=p_subject_id and node_id=p_category_id for update;
    if found then
      if v_existing_archived is not null then raise exception 'restore the archived specialization before adding it'; end if;
      return v_offering_id;
    end if;
    insert into public.offerings(node_id,subject_id,owner_teacher_id) values(p_category_id,p_subject_id,v_teacher)
    on conflict(owner_teacher_id,node_id,subject_id) where owner_teacher_id is not null do nothing returning id into v_offering_id;
  end if;
  if v_offering_id is null then
    select id,archived_at into v_offering_id,v_existing_archived from public.offerings
    where owner_teacher_id is not distinct from case when v_subject_owner is null and v_node_owner is null then null else v_teacher end
      and subject_id=p_subject_id and node_id=p_category_id;
    if v_existing_archived is not null then raise exception 'restore the archived specialization before adding it'; end if;
  end if;
  return v_offering_id;
end
$$;
revoke all on function public.save_teacher_offering(uuid,uuid) from public,anon,authenticated;
grant execute on function public.save_teacher_offering(uuid,uuid) to authenticated;

create or replace function public.save_teacher_group_draft(
 p_group_id uuid,p_subject_id uuid,p_category_id uuid,p_name text,p_description text,p_capacity integer,p_location text,p_expected_updated_at timestamptz
)
returns uuid language plpgsql security definer
set search_path=pg_catalog,public,auth
as $$
declare
 v_teacher uuid:=auth.uid(); v_group public.groups; v_subject_owner uuid; v_subject_archived timestamptz; v_node_owner uuid; v_node_archived timestamptz;
 v_offering_owner uuid; v_offering_archived timestamptz; v_old_node uuid; v_old_subject uuid; v_old_offering uuid; v_offering uuid; v_existing_archived timestamptz;
 v_name text:=btrim(coalesce(p_name,'')); v_description text:=coalesce(p_description,''); v_location text:=btrim(coalesce(p_location,''));
begin
 if not private.teacher_catalogue_active(v_teacher) then raise exception 'active teacher required' using errcode='42501'; end if;
 if p_group_id is null and p_expected_updated_at is not null then raise exception 'new drafts cannot include an expected timestamp'; end if;
 if p_group_id is not null and p_expected_updated_at is null then raise exception 'draft timestamp is required'; end if;
 if length(v_name) not between 2 and 120 or length(v_description)>2000 or p_capacity not between 1 and 500 or length(v_location)>200 then
   raise exception 'draft fields are invalid';
 end if;
 perform pg_advisory_xact_lock(hashtextextended('teacher-calendar:'||v_teacher::text,0));
 if p_group_id is not null then
   select * into v_group from public.groups where id=p_group_id for update;
   if not found or v_group.teacher_id<>v_teacher or v_group.status<>'draft' then raise exception 'owned draft not found'; end if;
   if v_group.updated_at is distinct from p_expected_updated_at then raise exception 'draft changed; refresh and retry' using errcode='40001'; end if;
   v_old_offering:=v_group.offering_id;
   select node_id,subject_id into v_old_node,v_old_subject from public.offerings where id=v_old_offering;
 end if;
 -- Draft identity, status and CAS are checked before any pair resolution or insertion.
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
   else
     select id,archived_at into v_offering,v_existing_archived from public.offerings
       where owner_teacher_id=v_teacher and subject_id=p_subject_id and node_id=p_category_id for update;
   end if;
   if v_offering is not null then
     if v_existing_archived is not null then raise exception 'restore the archived specialization before selecting it'; end if;
   else
     if v_subject_owner is null and v_node_owner is null then
       insert into public.offerings(node_id,subject_id) values(p_category_id,p_subject_id)
       on conflict(node_id,subject_id) where owner_teacher_id is null do nothing returning id into v_offering;
     else
       insert into public.offerings(node_id,subject_id,owner_teacher_id) values(p_category_id,p_subject_id,v_teacher)
       on conflict(owner_teacher_id,node_id,subject_id) where owner_teacher_id is not null do nothing returning id into v_offering;
     end if;
     if v_offering is null then
       select id,archived_at into v_offering,v_existing_archived from public.offerings
       where owner_teacher_id is not distinct from case when v_subject_owner is null and v_node_owner is null then null else v_teacher end
         and subject_id=p_subject_id and node_id=p_category_id;
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
$$;
revoke all on function public.save_teacher_group_draft(uuid,uuid,uuid,text,text,integer,text,timestamptz) from public,anon,authenticated;
grant execute on function public.save_teacher_group_draft(uuid,uuid,uuid,text,text,integer,text,timestamptz) to authenticated;

-- The legacy profile writer retains its signature and rich About compatibility trigger.
create or replace function public.save_teacher_profile(
 p_full_name text,p_headline text,p_bio text,p_offering_ids uuid[],p_phone_number text,p_whatsapp_number text,p_contact_email text,p_visibility text
)
returns void language plpgsql security definer set search_path=pg_catalog,public,auth as $$
declare v_teacher_id uuid:=auth.uid(); v_full_name text:=btrim(p_full_name); v_headline text:=btrim(coalesce(p_headline,'')); v_bio text:=btrim(coalesce(p_bio,''));
 v_phone text:=nullif(btrim(p_phone_number),''); v_whatsapp text:=nullif(btrim(p_whatsapp_number),''); v_email text:=nullif(btrim(p_contact_email),'');
begin
 if not private.teacher_catalogue_active(v_teacher_id) then raise exception 'active teacher required' using errcode='42501'; end if;
 if v_full_name is null or length(v_full_name) not between 2 and 100 then raise exception 'full name must be between 2 and 100 characters'; end if;
 if length(v_headline)>160 or length(v_bio)>5000 then raise exception 'profile text exceeds its limit'; end if;
 if p_visibility is null or p_visibility not in ('enrolled','public') then raise exception 'invalid contact visibility'; end if;
 if v_phone is not null and v_phone !~ '^\+[1-9][0-9]{7,14}$' then raise exception 'phone number must use E.164 format'; end if;
 if v_whatsapp is not null and v_whatsapp !~ '^\+[1-9][0-9]{7,14}$' then raise exception 'WhatsApp number must use E.164 format'; end if;
 if v_email is not null and (length(v_email) not between 3 and 254 or v_email !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$') then raise exception 'invalid contact email'; end if;
 perform pg_advisory_xact_lock(hashtextextended('teacher-calendar:'||v_teacher_id::text,0));
 perform private.validate_teacher_offering_ids(v_teacher_id,p_offering_ids);
 update public.profiles set full_name=v_full_name where id=v_teacher_id;
 update public.teacher_profiles set headline=v_headline,bio=v_bio where id=v_teacher_id;
 delete from public.teacher_specializations where teacher_id=v_teacher_id and not (offering_id=any(p_offering_ids));
 insert into public.teacher_specializations(teacher_id,offering_id)
 select v_teacher_id,x from unnest(p_offering_ids) x where not exists(select 1 from public.teacher_specializations s where s.teacher_id=v_teacher_id and s.offering_id=x);
 insert into public.teacher_contacts(teacher_id,phone_number,whatsapp_number,contact_email,visibility)
 values(v_teacher_id,v_phone,v_whatsapp,v_email,p_visibility)
 on conflict(teacher_id) do update set phone_number=excluded.phone_number,whatsapp_number=excluded.whatsapp_number,contact_email=excluded.contact_email,visibility=excluded.visibility;
end
$$;
revoke all on function public.save_teacher_profile(text,text,text,uuid[],text,text,text,text) from public,anon,authenticated;
grant execute on function public.save_teacher_profile(text,text,text,uuid[],text,text,text,text) to authenticated;

create or replace function public.save_teacher_profile_account(
 p_full_name text,p_headline text,p_offering_ids uuid[],p_phone_number text,p_whatsapp_number text,p_contact_email text,p_visibility text
)
returns void language plpgsql security definer set search_path=pg_catalog,public,auth as $$
declare v_teacher_id uuid:=auth.uid(); v_full_name text:=btrim(p_full_name); v_headline text:=btrim(coalesce(p_headline,''));
 v_phone text:=nullif(btrim(p_phone_number),''); v_whatsapp text:=nullif(btrim(p_whatsapp_number),''); v_email text:=nullif(btrim(p_contact_email),'');
begin
 if not private.teacher_catalogue_active(v_teacher_id) then raise exception 'active teacher required' using errcode='42501'; end if;
 if v_full_name is null or length(v_full_name) not between 2 and 100 then raise exception 'full name must be between 2 and 100 characters'; end if;
 if length(v_headline)>160 then raise exception 'headline exceeds 160 characters'; end if;
 if p_visibility is null or p_visibility not in ('enrolled','public') then raise exception 'invalid contact visibility'; end if;
 if v_phone is not null and v_phone !~ '^\+[1-9][0-9]{7,14}$' then raise exception 'phone number must use E.164 format'; end if;
 if v_whatsapp is not null and v_whatsapp !~ '^\+[1-9][0-9]{7,14}$' then raise exception 'WhatsApp number must use E.164 format'; end if;
 if v_email is not null and (length(v_email) not between 3 and 254 or v_email !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$') then raise exception 'invalid contact email'; end if;
 perform pg_advisory_xact_lock(hashtextextended('teacher-calendar:'||v_teacher_id::text,0));
 perform private.validate_teacher_offering_ids(v_teacher_id,p_offering_ids);
 update public.profiles set full_name=v_full_name where id=v_teacher_id;
 update public.teacher_profiles set headline=v_headline where id=v_teacher_id;
 delete from public.teacher_specializations where teacher_id=v_teacher_id and not (offering_id=any(p_offering_ids));
 insert into public.teacher_specializations(teacher_id,offering_id)
 select v_teacher_id,x from unnest(p_offering_ids) x where not exists(select 1 from public.teacher_specializations s where s.teacher_id=v_teacher_id and s.offering_id=x);
 insert into public.teacher_contacts(teacher_id,phone_number,whatsapp_number,contact_email,visibility)
 values(v_teacher_id,v_phone,v_whatsapp,v_email,p_visibility)
 on conflict(teacher_id) do update set phone_number=excluded.phone_number,whatsapp_number=excluded.whatsapp_number,contact_email=excluded.contact_email,visibility=excluded.visibility;
end
$$;
revoke all on function public.save_teacher_profile_account(text,text,uuid[],text,text,text,text) from public,anon,authenticated;
grant execute on function public.save_teacher_profile_account(text,text,uuid[],text,text,text,text) to authenticated;

-- Replace only the existing RPC body: publication still uses its established calendar lock and schedule checks.
create or replace function public.publish_group(p_group_id uuid,p_from date default null,p_until date default null)
returns integer language plpgsql security definer set search_path=pg_catalog,public as $$
declare v_teacher uuid; v_group public.groups; v_actor_role public.user_role; v_generated integer:=0; v_node uuid; v_subject uuid; v_owner uuid; v_archived timestamptz; v_component_owner uuid; v_component_archived timestamptz;
begin
 if (p_from is null) is distinct from (p_until is null) then raise exception 'publication range must provide both dates or neither'; end if;
 select teacher_id into v_teacher from public.groups where id=p_group_id;
 if v_teacher is null then raise exception 'group not found'; end if;
 v_actor_role:=public.current_role();
 if v_actor_role is null or (v_actor_role<>'admin' and not public.is_group_owner(p_group_id)) then raise exception 'not authorized'; end if;
 perform pg_advisory_xact_lock(hashtextextended('teacher-calendar:'||v_teacher::text,0));
 select * into v_group from public.groups where id=p_group_id for update;
 if not found or v_group.teacher_id<>v_teacher then raise exception 'group teacher changed'; end if;
 v_actor_role:=public.current_role();
 if v_actor_role is null or (v_actor_role<>'admin' and not public.is_group_owner(p_group_id)) then raise exception 'not authorized'; end if;
 if not private.teacher_catalogue_active(v_group.teacher_id) or not exists(select 1 from public.teacher_profiles t where t.id=v_teacher and t.approved) then raise exception 'only an active approved teacher may publish'; end if;
 select node_id,subject_id into v_node,v_subject from public.offerings where id=v_group.offering_id;
 perform 1 from public.subjects where id=v_subject for update;
 perform 1 from public.education_nodes where id=v_node for update;
 select owner_teacher_id,archived_at into v_owner,v_archived from public.offerings where id=v_group.offering_id for update;
 select owner_teacher_id,archived_at into v_component_owner,v_component_archived from public.subjects where id=v_subject;
 if (v_owner is not null and v_owner<>v_teacher) or (v_component_owner is not null and v_component_owner<>v_teacher) then raise exception 'saved catalogue selection belongs to another teacher'; end if;
 select owner_teacher_id,archived_at into v_component_owner,v_component_archived from public.education_nodes where id=v_node;
 if v_component_owner is not null and v_component_owner<>v_teacher then raise exception 'saved catalogue selection belongs to another teacher'; end if;
 if btrim(v_group.name)='' or length(btrim(v_group.name)) not between 2 and 120 or length(v_group.description)>2000 or v_group.capacity not between 1 and 500 or length(v_group.location)>200 then raise exception 'group fields are invalid'; end if;
 if not exists(select 1 from public.group_schedule_slots s where s.group_id=p_group_id) then raise exception 'a schedule slot is required before publishing'; end if;
 if p_from is not null then v_generated:=public.generate_lessons(p_group_id,p_from,p_until); end if;
 update public.groups set status='published' where id=p_group_id;
 return v_generated;
end
$$;
revoke all on function public.publish_group(uuid,date,date) from public,anon,authenticated;
grant execute on function public.publish_group(uuid,date,date) to authenticated;

create or replace function public.duplicate_group(p_group_id uuid)
returns uuid language plpgsql security definer set search_path=pg_catalog,public as $$
declare v_source public.groups; v_teacher uuid; v_actor_role public.user_role; v_node uuid; v_subject uuid; v_owner uuid; v_archived timestamptz; v_node_owner uuid; v_node_archived timestamptz; v_subject_owner uuid; v_subject_archived timestamptz; v_name text; v_duplicate uuid;
begin
 select * into v_source from public.groups where id=p_group_id;
 if not found then raise exception 'group not found'; end if;
 v_teacher:=v_source.teacher_id;
 v_actor_role:=public.current_role();
 if v_actor_role is null or (v_actor_role<>'admin' and not public.is_group_owner(p_group_id)) then raise exception 'not authorized'; end if;
 perform pg_advisory_xact_lock(hashtextextended('teacher-calendar:'||v_teacher::text,0));
 select * into v_source from public.groups where id=p_group_id for update;
 if not found or v_source.teacher_id<>v_teacher then raise exception 'group teacher changed'; end if;
 v_actor_role:=public.current_role();
 if v_actor_role is null or (v_actor_role<>'admin' and not public.is_group_owner(p_group_id)) then raise exception 'not authorized'; end if;
 if not private.teacher_catalogue_active(v_teacher) then raise exception 'source teacher must be active'; end if;
 select node_id,subject_id into v_node,v_subject from public.offerings where id=v_source.offering_id;
 perform 1 from public.subjects where id=v_subject for update;
 perform 1 from public.education_nodes where id=v_node for update;
 select owner_teacher_id,archived_at into v_owner,v_archived from public.offerings where id=v_source.offering_id for update;
 select owner_teacher_id,archived_at into v_subject_owner,v_subject_archived from public.subjects where id=v_subject;
 select owner_teacher_id,archived_at into v_node_owner,v_node_archived from public.education_nodes where id=v_node;
 if (v_owner is not null and v_owner<>v_teacher) or (v_subject_owner is not null and v_subject_owner<>v_teacher) or (v_node_owner is not null and v_node_owner<>v_teacher) then raise exception 'source selection belongs to another teacher'; end if;
 if v_archived is not null or v_subject_archived is not null or v_node_archived is not null then raise exception 'Update the original catalogue selection before duplicating this group.'; end if;
 v_name:=rtrim(left(btrim(v_source.name),113)); if v_name='' then v_name:='Group'; end if;
 insert into public.groups(teacher_id,offering_id,name,description,capacity,status,location)
 values(v_teacher,v_source.offering_id,v_name||' (copy)',v_source.description,v_source.capacity,'draft',v_source.location)
 returning id into v_duplicate;
 return v_duplicate;
end
$$;
revoke all on function public.duplicate_group(uuid) from public,anon,authenticated,service_role;
grant execute on function public.duplicate_group(uuid) to authenticated;

commit;
