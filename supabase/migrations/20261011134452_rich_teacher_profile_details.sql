create schema if not exists dars_private;
revoke all on schema dars_private from public, anon, authenticated;

create table public.teacher_profile_details (
  teacher_id uuid primary key references public.teacher_profiles(id) on delete cascade,
  details jsonb not null,
  version bigint not null default 0 check (version >= 0),
  updated_at timestamptz not null default now(),
  constraint teacher_profile_details_object check (jsonb_typeof(details) = 'object')
);
alter table public.teacher_profile_details enable row level security;
revoke all on public.teacher_profile_details from public, anon, authenticated;
grant select on public.teacher_profile_details to authenticated;
create policy teacher_profile_details_owner_read
  on public.teacher_profile_details for select to authenticated
  using (
    teacher_id = (select auth.uid())
    or exists (
      select 1 from public.profiles p
      where p.id = (select auth.uid())
        and p.role = 'admin'::public.user_role
        and p.status = 'active'::public.user_status
    )
  );

create or replace function dars_private.empty_teacher_profile_details()
returns jsonb
language sql immutable
set search_path = pg_catalog
as $$
  select '{
    "about":{"ar":"","en":""},
    "approach":{"ar":"","en":""},
    "goals":{"ar":"","en":""},
    "qualifications":[],"experience":[],"languages":[],
    "city":{"ar":"","en":""},"teaching_mode":null,
    "layout":"classic","palette":"teal",
    "section_order":["about","qualifications","experience","approach","goals"],
    "hidden_sections":[]
  }'::jsonb
$$;

create or replace function dars_private.jsonb_compact_utf8_bytes(p_value jsonb)
returns bigint
language plpgsql immutable strict
set search_path = pg_catalog
as $$
declare
  v_type text := jsonb_typeof(p_value);
  v_bytes bigint := 0;
  v_count bigint := 0;
  v_item record;
begin
  if v_type = 'object' then
    v_bytes := 2;
    for v_item in select key,value from jsonb_each(p_value) loop
      if v_count > 0 then v_bytes := v_bytes + 1; end if;
      v_bytes := v_bytes
        + octet_length(convert_to(to_jsonb(v_item.key)::text,'UTF8'))
        + 1
        + dars_private.jsonb_compact_utf8_bytes(v_item.value);
      v_count := v_count + 1;
    end loop;
    return v_bytes;
  elsif v_type = 'array' then
    v_bytes := 2;
    for v_item in select value from jsonb_array_elements(p_value) loop
      if v_count > 0 then v_bytes := v_bytes + 1; end if;
      v_bytes := v_bytes + dars_private.jsonb_compact_utf8_bytes(v_item.value);
      v_count := v_count + 1;
    end loop;
    return v_bytes;
  end if;
  return octet_length(convert_to(p_value::text,'UTF8'));
end;
$$;

create or replace function dars_private.validate_teacher_profile_details(p_details jsonb)
returns void
language plpgsql
set search_path = pg_catalog
as $$
declare
  v_section text;
  v_entry jsonb;
  v_field text;
  v_list_field text;
  v_language text;
  v_year numeric;
  v_ids text[] := array[]::text[];
  v_order text[] := array[]::text[];
  v_hidden text[] := array[]::text[];
  v_expected text[] := array['about','approach','goals','qualifications','experience','languages','city','teaching_mode','layout','palette','section_order','hidden_sections'];
  v_max_year integer := extract(year from (now() at time zone 'Africa/Cairo'))::integer + 1;
begin
  if p_details is null or jsonb_typeof(p_details) <> 'object'
     or (select count(*) from jsonb_object_keys(p_details)) <> cardinality(v_expected)
     or exists(select 1 from jsonb_object_keys(p_details) k where not (k = any(v_expected))) then
    raise exception 'invalid profile details object or fields' using errcode = '22023';
  end if;
  if dars_private.jsonb_compact_utf8_bytes(p_details) > 65536 then
    raise exception 'profile details exceed 65536 UTF-8 bytes' using errcode = '22023';
  end if;

  foreach v_field in array array['about','approach','goals','city'] loop
    if jsonb_typeof(p_details->v_field) <> 'object'
       or (select count(*) from jsonb_object_keys(p_details->v_field)) <> 2
       or not (p_details->v_field ? 'ar' and p_details->v_field ? 'en') then
      raise exception 'invalid localized profile field: %', v_field using errcode = '22023';
    end if;
    foreach v_language in array array['ar','en'] loop
      if jsonb_typeof(p_details->v_field->v_language) <> 'string'
         or char_length(p_details->v_field->>v_language) > (case v_field when 'about' then 5000 when 'city' then 120 else 2000 end) then
        raise exception 'invalid or overlong localized profile field: %.%', v_field, v_language using errcode = '22023';
      end if;
    end loop;
  end loop;

  if jsonb_typeof(p_details->'qualifications') <> 'array'
     or jsonb_array_length(p_details->'qualifications') > 10
     or jsonb_typeof(p_details->'experience') <> 'array'
     or jsonb_array_length(p_details->'experience') > 10 then
    raise exception 'invalid qualifications or experience list' using errcode = '22023';
  end if;
  for v_list_field in select unnest(array['qualifications','experience']) loop
    for v_entry in select value from jsonb_array_elements(p_details->v_list_field) loop
      if jsonb_typeof(v_entry) <> 'object'
         or (select count(*) from jsonb_object_keys(v_entry)) <> 7
         or exists(select 1 from jsonb_object_keys(v_entry) k where not (k = any(array['id','title','organization','description','start_year','end_year','current']))) then
        raise exception 'invalid profile entry' using errcode = '22023';
      end if;
      if jsonb_typeof(v_entry->'id') <> 'string' or char_length(v_entry->>'id') not between 1 and 80
         or (v_entry->>'id') = any(v_ids) then
        raise exception 'invalid or duplicate profile entry ID' using errcode = '22023';
      end if;
      v_ids := array_append(v_ids, v_entry->>'id');
      foreach v_field in array array['title','organization','description'] loop
        if jsonb_typeof(v_entry->v_field) <> 'object'
           or (select count(*) from jsonb_object_keys(v_entry->v_field)) <> 2
           or not (v_entry->v_field ? 'ar' and v_entry->v_field ? 'en') then
          raise exception 'invalid profile entry text' using errcode = '22023';
        end if;
        foreach v_language in array array['ar','en'] loop
          if jsonb_typeof(v_entry->v_field->v_language) <> 'string'
             or char_length(v_entry->v_field->>v_language) > (case v_field when 'title' then 120 when 'organization' then 120 else 1500 end) then
            raise exception 'overlong profile entry text' using errcode = '22023';
          end if;
        end loop;
      end loop;
      if jsonb_typeof(v_entry->'current') <> 'boolean' then
        raise exception 'invalid current flag' using errcode = '22023';
      end if;
      foreach v_field in array array['start_year','end_year'] loop
        if jsonb_typeof(v_entry->v_field) <> 'null' then
          if jsonb_typeof(v_entry->v_field) <> 'number' then raise exception 'invalid profile year' using errcode = '22023'; end if;
          v_year := (v_entry->>v_field)::numeric;
          if v_year <> trunc(v_year) or v_year < 1900 or v_year > v_max_year then
            raise exception 'profile year outside supported range' using errcode = '22023';
          end if;
        end if;
      end loop;
      if v_entry->'start_year' <> 'null'::jsonb and v_entry->'end_year' <> 'null'::jsonb
         and (v_entry->>'end_year')::integer < (v_entry->>'start_year')::integer then
        raise exception 'profile end year precedes start year' using errcode = '22023';
      end if;
      if (v_entry->>'current')::boolean and v_entry->'end_year' <> 'null'::jsonb then
        raise exception 'current profile entry cannot have an end year' using errcode = '22023';
      end if;
    end loop;
  end loop;

  if jsonb_typeof(p_details->'languages') <> 'array' or jsonb_array_length(p_details->'languages') > 10 then
    raise exception 'invalid teaching languages' using errcode = '22023';
  end if;
  for v_entry in select value from jsonb_array_elements(p_details->'languages') loop
    if jsonb_typeof(v_entry) <> 'string' or char_length(btrim(v_entry #>> '{}')) not between 1 and 60 then
      raise exception 'invalid teaching language label' using errcode = '22023';
    end if;
  end loop;
  if p_details->'teaching_mode' <> 'null'::jsonb
     and p_details->>'teaching_mode' not in ('online','in_person','both') then
    raise exception 'invalid teaching mode' using errcode = '22023';
  end if;
  if jsonb_typeof(p_details->'layout') <> 'string' or p_details->>'layout' not in ('classic','compact')
     or jsonb_typeof(p_details->'palette') <> 'string' or p_details->>'palette' not in ('teal','indigo','olive') then
    raise exception 'invalid profile layout or palette' using errcode = '22023';
  end if;
  if jsonb_typeof(p_details->'section_order') <> 'array' or jsonb_array_length(p_details->'section_order') <> 5
     or jsonb_typeof(p_details->'hidden_sections') <> 'array' or jsonb_array_length(p_details->'hidden_sections') > 5 then
    raise exception 'invalid profile section configuration' using errcode = '22023';
  end if;
  for v_section in select value #>> '{}' from jsonb_array_elements(p_details->'section_order') loop
    if v_section is null or v_section not in ('about','qualifications','experience','approach','goals') or v_section = any(v_order) then
      raise exception 'invalid or duplicate profile section order' using errcode = '22023';
    end if;
    v_order := array_append(v_order,v_section);
  end loop;
  if not (v_order @> array['about','qualifications','experience','approach','goals']) then
    raise exception 'profile section order is incomplete' using errcode = '22023';
  end if;
  for v_section in select value #>> '{}' from jsonb_array_elements(p_details->'hidden_sections') loop
    if v_section is null or v_section not in ('about','qualifications','experience','approach','goals') or v_section = any(v_hidden) then
      raise exception 'invalid or duplicate hidden profile section' using errcode = '22023';
    end if;
    v_hidden := array_append(v_hidden,v_section);
  end loop;
end;
$$;
revoke all on function dars_private.empty_teacher_profile_details() from public, anon, authenticated;
revoke all on function dars_private.jsonb_compact_utf8_bytes(jsonb) from public, anon, authenticated;
revoke all on function dars_private.validate_teacher_profile_details(jsonb) from public, anon, authenticated;

create or replace function dars_private.ensure_teacher_profile_details()
returns trigger
language plpgsql security definer
set search_path = pg_catalog, public, dars_private
as $$
begin
  insert into public.teacher_profile_details(teacher_id,details,version)
  values(new.id,dars_private.empty_teacher_profile_details(),0)
  on conflict(teacher_id) do nothing;
  return new;
end;
$$;
revoke all on function dars_private.ensure_teacher_profile_details() from public, anon, authenticated;
create trigger teacher_profile_details_initialize
after insert on public.teacher_profiles
for each row execute function dars_private.ensure_teacher_profile_details();

-- Existing biographies become the owner's preferred-language About. Keeping
-- this idempotent helper also makes the upgrade behavior directly testable.
create or replace function dars_private.backfill_teacher_profile_details()
returns void
language sql security definer
set search_path = pg_catalog, public, dars_private
as $$
  insert into public.teacher_profile_details(teacher_id,details,version)
  select t.id,
    jsonb_set(
      jsonb_set(dars_private.empty_teacher_profile_details(),
        array['about',coalesce(p.preferred_language,'ar')],to_jsonb(t.bio),true),
        '{about,en}',
        case when p.preferred_language='en' then to_jsonb(t.bio) else '""'::jsonb end,
        true
    ),
    0
  from public.teacher_profiles t
  join public.profiles p on p.id=t.id
  on conflict(teacher_id) do nothing
$$;
revoke all on function dars_private.backfill_teacher_profile_details() from public, anon, authenticated;
select dars_private.backfill_teacher_profile_details();

create or replace function dars_private.sync_legacy_teacher_bio()
returns trigger
language plpgsql security definer
set search_path = pg_catalog, public, dars_private, auth
as $$
declare
  v_language text;
  v_details jsonb;
  v_visible_bio text;
begin
  if new.bio is not distinct from old.bio or current_setting('dars.profile_details_internal',true) = 'on' then
    return new;
  end if;
  if char_length(new.bio) > 5000 then raise exception 'bio exceeds 5000 characters' using errcode='22023'; end if;
  select coalesce(p.preferred_language,'ar') into v_language from public.profiles p where p.id=new.id;
  v_language := coalesce(v_language,'ar');
  select details into v_details from public.teacher_profile_details where teacher_id=new.id for update;
  if v_details is null then v_details := dars_private.empty_teacher_profile_details(); end if;
  v_details := jsonb_set(v_details,array['about',v_language],to_jsonb(new.bio),true);
  perform dars_private.validate_teacher_profile_details(v_details);
  update public.teacher_profile_details set details=v_details,version=version+1,updated_at=now() where teacher_id=new.id;
  if v_details->'hidden_sections' @> '["about"]'::jsonb then
    v_visible_bio := '';
  else
    v_visible_bio := coalesce(nullif(v_details->'about'->>v_language,''),v_details->'about'->>case when v_language='ar' then 'en' else 'ar' end,'');
  end if;
  new.bio := v_visible_bio;
  return new;
end;
$$;
revoke all on function dars_private.sync_legacy_teacher_bio() from public, anon, authenticated;
create trigger teacher_profiles_sync_canonical_bio
before update of bio on public.teacher_profiles
for each row execute function dars_private.sync_legacy_teacher_bio();

create or replace function public.public_teacher_profile_details(p_teacher_id uuid)
returns jsonb
language plpgsql stable security definer
set search_path = pg_catalog, public, dars_private
as $$
declare
  v_details jsonb;
  v_hidden jsonb;
  v_sections jsonb;
  v_projection jsonb;
begin
  if not exists (
    select 1 from public.profiles p join public.teacher_profiles t on t.id=p.id
    where p.id=p_teacher_id and p.role='teacher'::public.user_role
      and p.status='active'::public.user_status and t.approved
  ) then return null; end if;
  select details into v_details from public.teacher_profile_details where teacher_id=p_teacher_id;
  if v_details is null then return null; end if;
  v_hidden := coalesce(v_details->'hidden_sections','[]'::jsonb);
  select coalesce(jsonb_agg(jsonb_build_object('id',s.id,'value',v_details->s.id)
    order by s.ordinality),'[]'::jsonb) into v_sections
  from jsonb_array_elements_text(v_details->'section_order') with ordinality as s(id,ordinality)
  where not (v_hidden @> jsonb_build_array(s.id))
    and case s.id
      when 'about' then coalesce(v_details->'about'->>'ar','') <> '' or coalesce(v_details->'about'->>'en','') <> ''
      when 'approach' then coalesce(v_details->'approach'->>'ar','') <> '' or coalesce(v_details->'approach'->>'en','') <> ''
      when 'goals' then coalesce(v_details->'goals'->>'ar','') <> '' or coalesce(v_details->'goals'->>'en','') <> ''
      when 'qualifications' then jsonb_array_length(v_details->'qualifications') > 0
      when 'experience' then jsonb_array_length(v_details->'experience') > 0
      else false end;
  if jsonb_array_length(v_sections)=0
     and jsonb_array_length(v_details->'languages')=0
     and coalesce(v_details->'city'->>'ar','')=''
     and coalesce(v_details->'city'->>'en','')=''
     and v_details->'teaching_mode'='null'::jsonb then
    return null;
  end if;
  v_projection := jsonb_build_object(
    'sections',v_sections,
    'languages',v_details->'languages',
    'city',v_details->'city',
    'teaching_mode',v_details->'teaching_mode',
    'layout',v_details->'layout',
    'palette',v_details->'palette'
  );
  return v_projection;
end;
$$;
revoke all on function public.public_teacher_profile_details(uuid) from public, anon, authenticated;
grant execute on function public.public_teacher_profile_details(uuid) to anon, authenticated;

create or replace function public.save_teacher_profile_details(p_details jsonb,p_expected_version bigint)
returns bigint
language plpgsql security definer
set search_path = pg_catalog, public, dars_private, auth
as $$
declare
  v_teacher_id uuid := auth.uid();
  v_version bigint;
  v_language text;
  v_bio text;
  v_previous_setting text;
begin
  if v_teacher_id is null or not exists (
    select 1 from public.profiles p join public.teacher_profiles t on t.id=p.id
    where p.id=v_teacher_id and p.role='teacher'::public.user_role
      and p.status='active'::public.user_status
  ) then raise exception 'active teacher required' using errcode='42501'; end if;
  perform dars_private.validate_teacher_profile_details(p_details);
  perform 1 from public.teacher_profiles where id=v_teacher_id for update;
  select version into v_version from public.teacher_profile_details where teacher_id=v_teacher_id for update;
  if not found then raise exception 'teacher profile details missing' using errcode='P0002'; end if;
  if p_expected_version is null or p_expected_version <> v_version then
    raise exception 'profile details version conflict' using errcode='40001';
  end if;
  update public.teacher_profile_details set details=p_details,version=v_version+1,updated_at=now() where teacher_id=v_teacher_id;
  select preferred_language into v_language from public.profiles where id=v_teacher_id;
  if p_details->'hidden_sections' @> '["about"]'::jsonb then
    v_bio := '';
  else
    v_bio := coalesce(nullif(p_details->'about'->>v_language,''),p_details->'about'->>case when v_language='ar' then 'en' else 'ar' end,'');
  end if;
  v_previous_setting := current_setting('dars.profile_details_internal',true);
  perform set_config('dars.profile_details_internal','on',true);
  update public.teacher_profiles set bio=v_bio where id=v_teacher_id;
  perform set_config('dars.profile_details_internal',coalesce(v_previous_setting,'off'),true);
  return v_version+1;
end;
$$;
revoke all on function public.save_teacher_profile_details(jsonb,bigint) from public,anon,authenticated;
grant execute on function public.save_teacher_profile_details(jsonb,bigint) to authenticated;

create or replace function public.save_teacher_profile_account(
  p_full_name text,p_headline text,p_offering_ids uuid[],p_phone_number text,
  p_whatsapp_number text,p_contact_email text,p_visibility text
)
returns void
language plpgsql security definer
set search_path = pg_catalog, public, auth
as $$
declare
  v_teacher_id uuid := auth.uid();
  v_full_name text := btrim(p_full_name);
  v_headline text := btrim(coalesce(p_headline,''));
  v_phone text := nullif(btrim(p_phone_number),'');
  v_whatsapp text := nullif(btrim(p_whatsapp_number),'');
  v_email text := nullif(btrim(p_contact_email),'');
begin
  if v_teacher_id is null or not exists(select 1 from public.profiles p where p.id=v_teacher_id and p.role='teacher' and p.status='active') then
    raise exception 'active teacher required';
  end if;
  if v_full_name is null or length(v_full_name) not between 2 and 100 then raise exception 'full name must be between 2 and 100 characters'; end if;
  if length(v_headline)>160 then raise exception 'headline exceeds 160 characters'; end if;
  if p_visibility is null or p_visibility not in ('enrolled','public') then raise exception 'invalid contact visibility'; end if;
  if v_phone is not null and v_phone !~ '^\+[1-9][0-9]{7,14}$' then raise exception 'phone number must use E.164 format'; end if;
  if v_whatsapp is not null and v_whatsapp !~ '^\+[1-9][0-9]{7,14}$' then raise exception 'WhatsApp number must use E.164 format'; end if;
  if v_email is not null and (length(v_email) not between 3 and 254 or v_email !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$') then raise exception 'invalid contact email'; end if;
  if p_offering_ids is null or cardinality(p_offering_ids)<>(select count(distinct x) from unnest(p_offering_ids) x)
     or cardinality(p_offering_ids)<>(select count(*) from public.offerings o where o.id=any(p_offering_ids)) then
    raise exception 'offering IDs must be distinct and valid';
  end if;
  update public.profiles set full_name=v_full_name where id=v_teacher_id;
  update public.teacher_profiles set headline=v_headline where id=v_teacher_id;
  delete from public.teacher_specializations where teacher_id=v_teacher_id;
  insert into public.teacher_specializations(teacher_id,offering_id) select v_teacher_id,x from unnest(p_offering_ids) x;
  insert into public.teacher_contacts(teacher_id,phone_number,whatsapp_number,contact_email,visibility)
  values(v_teacher_id,v_phone,v_whatsapp,v_email,p_visibility)
  on conflict(teacher_id) do update set phone_number=excluded.phone_number,whatsapp_number=excluded.whatsapp_number,
    contact_email=excluded.contact_email,visibility=excluded.visibility;
end;
$$;
revoke all on function public.save_teacher_profile_account(text,text,uuid[],text,text,text,text) from public,anon,authenticated;
grant execute on function public.save_teacher_profile_account(text,text,uuid[],text,text,text,text) to authenticated;

-- The legacy public_teacher_profiles.bio column remains the About projection;
-- the existing save_teacher_profile(text,...) RPC is its compatibility writer.
