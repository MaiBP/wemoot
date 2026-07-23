-- Fase 6: permisos por organización, aislamiento de datos sensibles y notificaciones.

create table if not exists public.organization_members (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  profile_id uuid not null references public.profiles(id) on delete cascade,
  role text not null check (role in ('owner','admin','registration_manager','coach','medical_staff','viewer')),
  status text not null default 'active' check (status in ('active','disabled')),
  invited_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, profile_id)
);

insert into public.organizations (owner_id, name, type)
select
  profile.id,
  coalesce(nullif(profile.full_name, ''), nullif(profile.email, ''), 'Equipo WeMoot'),
  'team'
from public.profiles profile
where exists (
  select 1 from public.events event
  where event.owner_id = profile.id and event.organization_id is null
)
and not exists (
  select 1 from public.organizations organization
  where organization.owner_id = profile.id
);

update public.events event
set organization_id = (
  select organization.id
  from public.organizations organization
  where organization.owner_id = event.owner_id
  order by organization.created_at
  limit 1
)
where event.organization_id is null;

insert into public.organization_members (organization_id, profile_id, role)
select organization.id, organization.owner_id, 'owner'
from public.organizations organization
on conflict (organization_id, profile_id) do update set role = 'owner', status = 'active';

create index if not exists organization_members_profile_idx
  on public.organization_members(profile_id, organization_id, role)
  where status = 'active';

create or replace function public.has_organization_role(target_organization_id uuid, allowed_roles text[])
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.organizations organization
    where organization.id = target_organization_id
      and (
        organization.owner_id = auth.uid()
        or exists (
          select 1
          from public.organization_members membership
          where membership.organization_id = organization.id
            and membership.profile_id = auth.uid()
            and membership.status = 'active'
            and membership.role = any(allowed_roles)
        )
      )
  );
$$;

create or replace function public.has_event_role(target_event_id uuid, allowed_roles text[])
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.events event
    where event.id = target_event_id
      and (
        event.owner_id = auth.uid()
        or exists (
          select 1
          from public.organization_members membership
          where membership.organization_id = event.organization_id
            and membership.profile_id = auth.uid()
            and membership.status = 'active'
            and membership.role = any(allowed_roles)
        )
      )
  );
$$;

create or replace function public.has_registration_role(target_registration_id uuid, allowed_roles text[])
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.registrations registration
    where registration.id = target_registration_id
      and public.has_event_role(registration.event_id, allowed_roles)
  );
$$;

create or replace function public.can_view_sensitive_registration_data(target_registration_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.has_registration_role(
    target_registration_id,
    array['owner','admin','medical_staff']::text[]
  );
$$;

create or replace function public.get_event_role(target_event_id uuid)
returns text
language sql
stable
security definer
set search_path = public
as $$
  select case
    when event.owner_id = auth.uid() then 'owner'
    else (
      select membership.role
      from public.organization_members membership
      where membership.organization_id = event.organization_id
        and membership.profile_id = auth.uid()
        and membership.status = 'active'
      limit 1
    )
  end
  from public.events event
  where event.id = target_event_id;
$$;

create or replace function public.get_event_registration_stats(target_event_id uuid)
returns table (
  total bigint,
  paid bigint,
  pending bigint,
  cancelled bigint,
  revenue numeric
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.has_event_role(
    target_event_id,
    array['owner','admin','registration_manager','coach','medical_staff','viewer']::text[]
  ) then
    raise exception 'Not authorized';
  end if;

  return query
  select
    count(*)::bigint,
    count(*) filter (where registration.payment_status = 'paid')::bigint,
    count(*) filter (where registration.payment_status = 'pending')::bigint,
    count(*) filter (where registration.payment_status = 'cancelled')::bigint,
    coalesce(sum(registration.total_amount) filter (where registration.payment_status = 'paid'), 0)::numeric
  from public.registrations registration
  where registration.event_id = target_event_id;
end;
$$;

create table if not exists public.registration_sensitive_data (
  id uuid primary key default gen_random_uuid(),
  registration_id uuid not null unique references public.registrations(id) on delete cascade,
  allergies text,
  medical_notes text,
  data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.registration_sensitive_answers (
  id uuid primary key default gen_random_uuid(),
  registration_id uuid not null references public.registrations(id) on delete cascade,
  field_id uuid not null references public.registration_form_fields(id) on delete cascade,
  field_key text not null,
  answer jsonb,
  created_at timestamptz not null default now(),
  unique (registration_id, field_id)
);

insert into public.registration_sensitive_data (registration_id, allergies, medical_notes)
select registration.id, registration.allergies, registration.medical_notes
from public.registrations registration
where registration.allergies is not null or registration.medical_notes is not null
on conflict (registration_id) do update
set allergies = excluded.allergies,
    medical_notes = excluded.medical_notes,
    updated_at = now();

insert into public.registration_sensitive_answers (
  registration_id,
  field_id,
  field_key,
  answer,
  created_at
)
select
  answer.registration_id,
  answer.field_id,
  answer.field_key,
  answer.answer,
  answer.created_at
from public.registration_answers answer
join public.registration_form_fields field on field.id = answer.field_id
join public.registration_form_sections section on section.id = field.section_id
where section.section_key = 'medical'
on conflict (registration_id, field_id) do update
set answer = excluded.answer;

delete from public.registration_answers answer
using public.registration_form_fields field, public.registration_form_sections section
where answer.field_id = field.id
  and field.section_id = section.id
  and section.section_key = 'medical';

update public.registrations
set allergies = null,
    medical_notes = null
where allergies is not null or medical_notes is not null;

create table if not exists public.email_deliveries (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events(id) on delete cascade,
  registration_id uuid not null references public.registrations(id) on delete cascade,
  email_type text not null check (email_type in ('registration_received','payment_confirmed','registration_cancelled')),
  recipient text not null,
  status text not null default 'queued' check (status in ('queued','sending','sent','failed')),
  provider_message_id text,
  attempt_count integer not null default 0,
  last_error text,
  sent_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (registration_id, email_type)
);

create index if not exists email_deliveries_status_idx
  on public.email_deliveries(status, created_at);

create table if not exists public.data_export_audit (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events(id) on delete cascade,
  requested_by uuid not null references public.profiles(id) on delete cascade,
  export_type text not null check (export_type in ('participants','medical')),
  row_count integer not null default 0,
  created_at timestamptz not null default now()
);

create index if not exists data_export_audit_event_idx
  on public.data_export_audit(event_id, created_at desc);

alter table public.organization_members enable row level security;
alter table public.registration_sensitive_data enable row level security;
alter table public.registration_sensitive_answers enable row level security;
alter table public.email_deliveries enable row level security;
alter table public.data_export_audit enable row level security;

drop policy if exists "organizations by owner" on public.organizations;
drop policy if exists "organizations visible to team" on public.organizations;
create policy "organizations visible to team" on public.organizations for select
using (public.has_organization_role(id, array['owner','admin','registration_manager','coach','medical_staff','viewer']::text[]));
drop policy if exists "organizations created by owner" on public.organizations;
create policy "organizations created by owner" on public.organizations for insert
with check (owner_id = auth.uid());
drop policy if exists "organizations managed by administrators" on public.organizations;
create policy "organizations managed by administrators" on public.organizations for update
using (public.has_organization_role(id, array['owner','admin']::text[]))
with check (public.has_organization_role(id, array['owner','admin']::text[]));
drop policy if exists "organizations deleted by owner" on public.organizations;
create policy "organizations deleted by owner" on public.organizations for delete
using (owner_id = auth.uid());

drop policy if exists "organization members read" on public.organization_members;
create policy "organization members read" on public.organization_members for select
using (
  profile_id = auth.uid()
  or public.has_organization_role(organization_id, array['owner','admin']::text[])
);

drop policy if exists "organization members manage" on public.organization_members;
create policy "organization members manage" on public.organization_members for all
using (public.has_organization_role(organization_id, array['owner','admin']::text[]))
with check (public.has_organization_role(organization_id, array['owner','admin']::text[]));

drop policy if exists "events by owner" on public.events;
drop policy if exists "events visible to team" on public.events;
create policy "events visible to team" on public.events for select
using (public.has_event_role(id, array['owner','admin','registration_manager','coach','medical_staff','viewer']::text[]));
drop policy if exists "events created by owner" on public.events;
create policy "events created by owner" on public.events for insert
with check (owner_id = auth.uid());
drop policy if exists "events managed by administrators" on public.events;
create policy "events managed by administrators" on public.events for update
using (public.has_event_role(id, array['owner','admin']::text[]))
with check (public.has_event_role(id, array['owner','admin']::text[]));
drop policy if exists "events deleted by administrators" on public.events;
create policy "events deleted by administrators" on public.events for delete
using (public.has_event_role(id, array['owner','admin']::text[]));

drop policy if exists "event programs visible to team" on public.event_programs;
create policy "event programs visible to team" on public.event_programs for select
using (public.has_event_role(event_id, array['owner','admin','registration_manager','coach','medical_staff','viewer']::text[]));
drop policy if exists "event programs managed by administrators" on public.event_programs;
create policy "event programs managed by administrators" on public.event_programs for all
using (public.has_event_role(event_id, array['owner','admin']::text[]))
with check (public.has_event_role(event_id, array['owner','admin']::text[]));

drop policy if exists "event periods visible to team" on public.event_periods;
create policy "event periods visible to team" on public.event_periods for select
using (public.has_event_role(event_id, array['owner','admin','registration_manager','coach','medical_staff','viewer']::text[]));
drop policy if exists "event periods managed by administrators" on public.event_periods;
create policy "event periods managed by administrators" on public.event_periods for all
using (public.has_event_role(event_id, array['owner','admin']::text[]))
with check (public.has_event_role(event_id, array['owner','admin']::text[]));

drop policy if exists "event prices visible to team" on public.event_prices;
create policy "event prices visible to team" on public.event_prices for select
using (public.has_event_role(event_id, array['owner','admin','registration_manager','viewer']::text[]));
drop policy if exists "event prices managed by administrators" on public.event_prices;
create policy "event prices managed by administrators" on public.event_prices for all
using (public.has_event_role(event_id, array['owner','admin']::text[]))
with check (public.has_event_role(event_id, array['owner','admin']::text[]));

drop policy if exists "price rules visible to team" on public.event_price_rules;
create policy "price rules visible to team" on public.event_price_rules for select
using (public.has_event_role(event_id, array['owner','admin','registration_manager','viewer']::text[]));
drop policy if exists "price rules managed by administrators" on public.event_price_rules;
create policy "price rules managed by administrators" on public.event_price_rules for all
using (public.has_event_role(event_id, array['owner','admin']::text[]))
with check (public.has_event_role(event_id, array['owner','admin']::text[]));

drop policy if exists "discounts visible to team" on public.event_discounts;
create policy "discounts visible to team" on public.event_discounts for select
using (public.has_event_role(event_id, array['owner','admin','registration_manager','viewer']::text[]));
drop policy if exists "discounts managed by administrators" on public.event_discounts;
create policy "discounts managed by administrators" on public.event_discounts for all
using (public.has_event_role(event_id, array['owner','admin']::text[]))
with check (public.has_event_role(event_id, array['owner','admin']::text[]));

drop policy if exists "forms visible to team" on public.registration_forms;
create policy "forms visible to team" on public.registration_forms for select
using (public.has_event_role(event_id, array['owner','admin','registration_manager','viewer']::text[]));
drop policy if exists "forms managed by registration team" on public.registration_forms;
create policy "forms managed by registration team" on public.registration_forms for all
using (public.has_event_role(event_id, array['owner','admin','registration_manager']::text[]))
with check (public.has_event_role(event_id, array['owner','admin','registration_manager']::text[]));

drop policy if exists "included items visible to team" on public.event_included_items;
create policy "included items visible to team" on public.event_included_items for select
using (public.has_event_role(event_id, array['owner','admin','registration_manager','coach','medical_staff','viewer']::text[]));
drop policy if exists "included items managed by administrators" on public.event_included_items;
create policy "included items managed by administrators" on public.event_included_items for all
using (public.has_event_role(event_id, array['owner','admin']::text[]))
with check (public.has_event_role(event_id, array['owner','admin']::text[]));

drop policy if exists "program periods visible to team" on public.event_program_periods;
create policy "program periods visible to team" on public.event_program_periods for select
using (
  exists (
    select 1 from public.event_programs program
    where program.id = program_id
      and public.has_event_role(program.event_id, array['owner','admin','registration_manager','coach','medical_staff','viewer']::text[])
  )
);
drop policy if exists "program periods managed by administrators" on public.event_program_periods;
create policy "program periods managed by administrators" on public.event_program_periods for all
using (
  exists (
    select 1 from public.event_programs program
    where program.id = program_id
      and public.has_event_role(program.event_id, array['owner','admin']::text[])
  )
)
with check (
  exists (
    select 1 from public.event_programs program
    where program.id = program_id
      and public.has_event_role(program.event_id, array['owner','admin']::text[])
  )
);

drop policy if exists "form sections visible to team" on public.registration_form_sections;
create policy "form sections visible to team" on public.registration_form_sections for select
using (
  exists (
    select 1 from public.registration_forms form
    where form.id = form_id
      and public.has_event_role(form.event_id, array['owner','admin','registration_manager','viewer']::text[])
  )
);
drop policy if exists "form sections managed by registration team" on public.registration_form_sections;
create policy "form sections managed by registration team" on public.registration_form_sections for all
using (
  exists (
    select 1 from public.registration_forms form
    where form.id = form_id
      and public.has_event_role(form.event_id, array['owner','admin','registration_manager']::text[])
  )
)
with check (
  exists (
    select 1 from public.registration_forms form
    where form.id = form_id
      and public.has_event_role(form.event_id, array['owner','admin','registration_manager']::text[])
  )
);

drop policy if exists "form fields visible to team" on public.registration_form_fields;
create policy "form fields visible to team" on public.registration_form_fields for select
using (
  exists (
    select 1 from public.registration_forms form
    where form.id = form_id
      and public.has_event_role(form.event_id, array['owner','admin','registration_manager','viewer']::text[])
  )
);
drop policy if exists "form fields managed by registration team" on public.registration_form_fields;
create policy "form fields managed by registration team" on public.registration_form_fields for all
using (
  exists (
    select 1 from public.registration_forms form
    where form.id = form_id
      and public.has_event_role(form.event_id, array['owner','admin','registration_manager']::text[])
  )
)
with check (
  exists (
    select 1 from public.registration_forms form
    where form.id = form_id
      and public.has_event_role(form.event_id, array['owner','admin','registration_manager']::text[])
  )
);

drop policy if exists "registrations through event owner" on public.registrations;
drop policy if exists "registrations visible to operational team" on public.registrations;
create policy "registrations visible to operational team" on public.registrations for select
using (public.has_event_role(event_id, array['owner','admin','registration_manager','coach','medical_staff']::text[]));
drop policy if exists "registrations managed by registration team" on public.registrations;
create policy "registrations managed by registration team" on public.registrations for all
using (public.has_event_role(event_id, array['owner','admin','registration_manager']::text[]))
with check (public.has_event_role(event_id, array['owner','admin','registration_manager']::text[]));

drop policy if exists "registration items visible to operational team" on public.registration_items;
create policy "registration items visible to operational team" on public.registration_items for select
using (public.has_registration_role(registration_id, array['owner','admin','registration_manager','coach','medical_staff']::text[]));

drop policy if exists "payments through event owner" on public.payments;
drop policy if exists "payments managed by registration team" on public.payments;
create policy "payments managed by registration team" on public.payments for all
using (public.has_event_role(event_id, array['owner','admin','registration_manager']::text[]))
with check (public.has_event_role(event_id, array['owner','admin','registration_manager']::text[]));

drop policy if exists "certificates through event owner" on public.certificates;
drop policy if exists "certificates managed by registration team" on public.certificates;
create policy "certificates managed by registration team" on public.certificates for all
using (public.has_event_role(event_id, array['owner','admin','registration_manager']::text[]))
with check (public.has_event_role(event_id, array['owner','admin','registration_manager']::text[]));

drop policy if exists "capacity reservations visible to registration team" on public.capacity_reservations;
create policy "capacity reservations visible to registration team" on public.capacity_reservations for select
using (public.has_event_role(event_id, array['owner','admin','registration_manager']::text[]));

drop policy if exists "answers through owner" on public.registration_answers;
create policy "answers visible by responsibility" on public.registration_answers for select
using (
  public.has_registration_role(registration_id, array['owner','admin','registration_manager']::text[])
  or (
    public.has_registration_role(registration_id, array['coach']::text[])
    and exists (
      select 1
      from public.registration_form_fields field
      join public.registration_form_sections section on section.id = field.section_id
      where field.id = field_id and section.section_key = 'sports'
    )
  )
);

drop policy if exists "consents through owner" on public.registration_consents;
create policy "consents visible to registration team" on public.registration_consents for select
using (public.has_registration_role(registration_id, array['owner','admin','registration_manager']::text[]));

drop policy if exists "price snapshots through event owner" on public.registration_price_snapshots;
create policy "price snapshots visible to registration team" on public.registration_price_snapshots for select
using (public.has_registration_role(registration_id, array['owner','admin','registration_manager']::text[]));

drop policy if exists "discount uses through event owner" on public.registration_discount_uses;
create policy "discount uses visible to registration team" on public.registration_discount_uses for select
using (public.has_registration_role(registration_id, array['owner','admin','registration_manager']::text[]));

drop policy if exists "registration periods through owner" on public.registration_periods;
create policy "registration periods visible to operational team" on public.registration_periods for select
using (public.has_registration_role(registration_id, array['owner','admin','registration_manager','coach','medical_staff']::text[]));

drop policy if exists "sensitive registration data by medical role" on public.registration_sensitive_data;
create policy "sensitive registration data by medical role" on public.registration_sensitive_data for select
using (public.can_view_sensitive_registration_data(registration_id));
drop policy if exists "sensitive registration data managed by medical role" on public.registration_sensitive_data;
create policy "sensitive registration data managed by medical role" on public.registration_sensitive_data for all
using (public.can_view_sensitive_registration_data(registration_id))
with check (public.can_view_sensitive_registration_data(registration_id));

drop policy if exists "sensitive answers by medical role" on public.registration_sensitive_answers;
create policy "sensitive answers by medical role" on public.registration_sensitive_answers for select
using (public.can_view_sensitive_registration_data(registration_id));
drop policy if exists "sensitive answers managed by medical role" on public.registration_sensitive_answers;
create policy "sensitive answers managed by medical role" on public.registration_sensitive_answers for all
using (public.can_view_sensitive_registration_data(registration_id))
with check (public.can_view_sensitive_registration_data(registration_id));

drop policy if exists "email deliveries visible to registration team" on public.email_deliveries;
create policy "email deliveries visible to registration team" on public.email_deliveries for select
using (public.has_event_role(event_id, array['owner','admin','registration_manager']::text[]));

drop policy if exists "export audit visible to authorized team" on public.data_export_audit;
create policy "export audit visible to authorized team" on public.data_export_audit for select
using (public.has_event_role(event_id, array['owner','admin','registration_manager','medical_staff']::text[]));

create or replace function public.protect_organization_owner()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.owner_id <> old.owner_id and auth.uid() is distinct from old.owner_id then
    raise exception 'Only the organization owner can transfer ownership';
  end if;
  return new;
end;
$$;

create or replace function public.protect_owner_membership()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare organization_owner uuid;
begin
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

drop trigger if exists organizations_owner_protection on public.organizations;
create trigger organizations_owner_protection before update on public.organizations
for each row execute procedure public.protect_organization_owner();

drop trigger if exists organization_owner_membership_protection on public.organization_members;
create trigger organization_owner_membership_protection before insert or update or delete on public.organization_members
for each row execute procedure public.protect_owner_membership();

drop trigger if exists organization_members_updated_at on public.organization_members;
create trigger organization_members_updated_at before update on public.organization_members
for each row execute procedure public.touch_pricing_updated_at();

drop trigger if exists registration_sensitive_data_updated_at on public.registration_sensitive_data;
create trigger registration_sensitive_data_updated_at before update on public.registration_sensitive_data
for each row execute procedure public.touch_pricing_updated_at();

drop trigger if exists email_deliveries_updated_at on public.email_deliveries;
create trigger email_deliveries_updated_at before update on public.email_deliveries
for each row execute procedure public.touch_pricing_updated_at();

revoke all on function public.has_organization_role(uuid, text[]) from public, anon;
revoke all on function public.has_event_role(uuid, text[]) from public, anon;
revoke all on function public.has_registration_role(uuid, text[]) from public, anon;
revoke all on function public.can_view_sensitive_registration_data(uuid) from public, anon;
revoke all on function public.get_event_role(uuid) from public, anon;
revoke all on function public.get_event_registration_stats(uuid) from public, anon;
grant execute on function public.has_organization_role(uuid, text[]) to authenticated;
grant execute on function public.has_event_role(uuid, text[]) to authenticated;
grant execute on function public.has_registration_role(uuid, text[]) to authenticated;
grant execute on function public.can_view_sensitive_registration_data(uuid) to authenticated;
grant execute on function public.get_event_role(uuid) to authenticated;
grant execute on function public.get_event_registration_stats(uuid) to authenticated;
