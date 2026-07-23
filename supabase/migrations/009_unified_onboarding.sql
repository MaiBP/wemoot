-- Onboarding unificado para web y Telegram.

alter table public.profiles
  add column if not exists profile_type text,
  add column if not exists phone text,
  add column if not exists country text,
  add column if not exists timezone text not null default 'Europe/Madrid',
  add column if not exists onboarding_status text not null default 'pending',
  add column if not exists onboarding_completed_at timestamptz,
  add column if not exists professional_name text,
  add column if not exists current_club text,
  add column if not exists specialty text;

alter table public.profiles drop constraint if exists profiles_profile_type_check;
alter table public.profiles add constraint profiles_profile_type_check
  check (profile_type is null or profile_type in ('club','academy','coach','sports_organizer','event_company','other'));
alter table public.profiles drop constraint if exists profiles_onboarding_status_check;
alter table public.profiles add constraint profiles_onboarding_status_check
  check (onboarding_status in ('pending','in_progress','completed'));

update public.profiles
set profile_type = case role
  when 'club' then 'club'
  when 'academy' then 'academy'
  when 'coach' then 'coach'
  when 'organizer' then 'sports_organizer'
  else profile_type
end
where profile_type is null;

alter table public.organizations
  add column if not exists contact_email text,
  add column if not exists contact_phone text,
  add column if not exists website_url text,
  add column if not exists instagram_url text,
  add column if not exists tax_id text,
  add column if not exists address_line_1 text,
  add column if not exists address_line_2 text,
  add column if not exists province text,
  add column if not exists postal_code text,
  add column if not exists country text;

create table if not exists public.organization_locations (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid references public.organizations(id) on delete cascade,
  owner_id uuid not null references public.profiles(id) on delete cascade,
  name text not null,
  location_type text not null default 'sports_facility'
    check (location_type in ('sports_facility','office','meeting_room','external_venue','online','other')),
  address_line_1 text,
  address_line_2 text,
  city text,
  province text,
  postal_code text,
  country text,
  latitude numeric(9,6),
  longitude numeric(9,6),
  google_maps_url text,
  contact_name text,
  contact_phone text,
  is_default boolean not null default false,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (latitude is null or latitude between -90 and 90),
  check (longitude is null or longitude between -180 and 180)
);

create unique index if not exists organization_locations_default_org_uidx
  on public.organization_locations(organization_id)
  where organization_id is not null and is_default and is_active;
create unique index if not exists organization_locations_default_personal_uidx
  on public.organization_locations(owner_id)
  where organization_id is null and is_default and is_active;
create index if not exists organization_locations_owner_idx
  on public.organization_locations(owner_id, is_active, is_default);
create index if not exists organization_locations_organization_idx
  on public.organization_locations(organization_id, is_active);

alter table public.events
  add column if not exists location_id uuid references public.organization_locations(id) on delete set null,
  add column if not exists contact_email text,
  add column if not exists contact_phone text;
create index if not exists events_location_idx on public.events(location_id);

create or replace function public.protect_owner_membership()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare organization_owner uuid;
begin
  if auth.role() = 'service_role' then
    return case when tg_op = 'DELETE' then old else new end;
  end if;

  select organization.owner_id into organization_owner
  from public.organizations organization
  where organization.id = coalesce(new.organization_id, old.organization_id);

  if tg_op = 'INSERT' then
    if new.role = 'owner'
      and (new.profile_id is distinct from organization_owner or auth.uid() is distinct from organization_owner) then
      raise exception 'The owner membership is protected';
    end if;
    return new;
  end if;

  if tg_op = 'DELETE' then
    if old.role = 'owner' and auth.uid() is distinct from organization_owner then
      raise exception 'The owner membership is protected';
    end if;
    return old;
  end if;

  if (old.role = 'owner' or new.role = 'owner')
    and auth.uid() is distinct from organization_owner then
    raise exception 'The owner membership is protected';
  end if;
  return new;
end;
$$;

alter table public.organization_locations enable row level security;

drop policy if exists "locations visible to owner and team" on public.organization_locations;
create policy "locations visible to owner and team" on public.organization_locations for select
using (
  owner_id = auth.uid()
  or (
    organization_id is not null
    and public.has_organization_role(
      organization_id,
      array['owner','admin','registration_manager','coach','medical_staff','viewer']::text[]
    )
  )
);

drop policy if exists "locations managed by owner and administrators" on public.organization_locations;
create policy "locations managed by owner and administrators" on public.organization_locations for all
using (
  owner_id = auth.uid()
  or (
    organization_id is not null
    and public.has_organization_role(organization_id, array['owner','admin']::text[])
  )
)
with check (
  owner_id = auth.uid()
  and (
    organization_id is null
    or public.has_organization_role(organization_id, array['owner','admin']::text[])
  )
);

drop trigger if exists organization_locations_updated_at on public.organization_locations;
create trigger organization_locations_updated_at before update on public.organization_locations
for each row execute procedure public.touch_pricing_updated_at();

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare raw_role text;
begin
  raw_role := coalesce(new.raw_user_meta_data ->> 'role', 'organizer');
  insert into public.profiles (
    id, full_name, email, role, profile_type, language, timezone, onboarding_status
  ) values (
    new.id,
    new.raw_user_meta_data ->> 'full_name',
    new.email,
    raw_role,
    case raw_role
      when 'club' then 'club'
      when 'academy' then 'academy'
      when 'coach' then 'coach'
      else 'sports_organizer'
    end,
    coalesce(new.raw_user_meta_data ->> 'language', 'es'),
    coalesce(new.raw_user_meta_data ->> 'timezone', 'Europe/Madrid'),
    'pending'
  );
  return new;
end;
$$;
