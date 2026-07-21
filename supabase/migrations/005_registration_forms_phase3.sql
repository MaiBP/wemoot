-- Fase 3: formularios configurables, respuestas, periodos y consentimientos.

create table if not exists public.registration_forms (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null unique references public.events(id) on delete cascade,
  name text not null,
  description text,
  template_key text,
  requires_account boolean not null default false,
  allow_guest_registration boolean not null default true,
  status text not null default 'draft' check (status in ('draft', 'published', 'archived')),
  settings jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.registration_form_sections (
  id uuid primary key default gen_random_uuid(),
  form_id uuid not null references public.registration_forms(id) on delete cascade,
  title text not null,
  description text,
  section_key text not null,
  sort_order integer not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  unique(form_id, section_key)
);

create table if not exists public.registration_form_fields (
  id uuid primary key default gen_random_uuid(),
  form_id uuid not null references public.registration_forms(id) on delete cascade,
  section_id uuid references public.registration_form_sections(id) on delete cascade,
  field_key text not null,
  label text not null,
  description text,
  placeholder text,
  field_type text not null check (field_type in ('text','textarea','email','phone','number','date','select','multiselect','radio','checkbox','boolean','file','signature','address','country','province','postal_code','image','heading','legal_text')),
  required boolean not null default false,
  options jsonb not null default '[]'::jsonb,
  validation_rules jsonb not null default '{}'::jsonb,
  conditional_logic jsonb not null default '{}'::jsonb,
  default_value jsonb,
  sort_order integer not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  unique(form_id, field_key)
);

create table if not exists public.event_included_items (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events(id) on delete cascade,
  program_id uuid references public.event_programs(id) on delete cascade,
  name text not null,
  description text,
  requires_size boolean not null default false,
  is_optional boolean not null default false,
  created_at timestamptz not null default now()
);
create unique index if not exists event_included_items_program_name_uidx
  on public.event_included_items(event_id, program_id, lower(name));

insert into public.event_included_items (event_id, program_id, name, requires_size)
select program.event_id, program.id, item.name,
  lower(item.name) ~ '(camiseta|pantal|equipaci|sudadera|calzado)'
from public.event_programs program
cross join lateral unnest(program.included_items) item(name)
on conflict do nothing;

create or replace function public.sync_program_included_items()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.event_included_items (event_id, program_id, name, requires_size)
  select new.event_id, new.id, item.name,
    lower(item.name) ~ '(camiseta|pantal|equipaci|sudadera|calzado)'
  from unnest(new.included_items) item(name)
  on conflict do nothing;
  return new;
end;
$$;

drop trigger if exists event_programs_included_items_sync on public.event_programs;
create trigger event_programs_included_items_sync
after insert or update of included_items on public.event_programs
for each row execute procedure public.sync_program_included_items();

alter table public.registrations
  add column if not exists form_id uuid references public.registration_forms(id),
  add column if not exists program_id uuid references public.event_programs(id),
  add column if not exists participant_type text not null default 'general',
  add column if not exists total_amount numeric(10,2),
  add column if not exists currency text not null default 'EUR',
  add column if not exists source text not null default 'web',
  add column if not exists submitted_at timestamptz;

alter table public.registrations drop constraint if exists registrations_registration_status_check;
alter table public.registrations add constraint registrations_registration_status_check
  check (registration_status in ('pending', 'pending_payment', 'requested', 'confirmed', 'cancelled'));

create table if not exists public.registration_answers (
  id uuid primary key default gen_random_uuid(),
  registration_id uuid not null references public.registrations(id) on delete cascade,
  field_id uuid not null references public.registration_form_fields(id) on delete cascade,
  field_key text not null,
  answer jsonb,
  created_at timestamptz not null default now(),
  unique(registration_id, field_id)
);

create table if not exists public.registration_periods (
  id uuid primary key default gen_random_uuid(),
  registration_id uuid not null references public.registrations(id) on delete cascade,
  period_id uuid not null references public.event_periods(id),
  program_id uuid not null references public.event_programs(id),
  price numeric(10,2),
  unique(registration_id, period_id, program_id)
);

create table if not exists public.registration_consents (
  id uuid primary key default gen_random_uuid(),
  registration_id uuid not null references public.registrations(id) on delete cascade,
  consent_key text not null,
  consent_version text not null,
  consent_text text not null,
  accepted boolean not null,
  accepted_at timestamptz,
  ip_address inet,
  user_agent text,
  guardian_identity text,
  created_at timestamptz not null default now(),
  unique(registration_id, consent_key)
);

create or replace function public.recount_program_period(target_program_id uuid, target_period_id uuid)
returns void language sql security definer set search_path = public as $$
  update public.event_program_periods relation
  set registered_count = (
    select count(distinct selection.registration_id)::integer
    from (
      select registration_id, program_id, period_id from public.registration_items
      union all
      select registration_id, program_id, period_id from public.registration_periods
    ) selection
    join public.registrations registration on registration.id = selection.registration_id
    where selection.program_id = target_program_id
      and selection.period_id = target_period_id
      and registration.payment_status <> 'cancelled'
  )
  where relation.program_id = target_program_id and relation.period_id = target_period_id;
$$;

drop trigger if exists registration_periods_program_period_count on public.registration_periods;
create trigger registration_periods_program_period_count
after insert or update or delete on public.registration_periods
for each row execute procedure public.sync_program_period_count_from_item();

create or replace function public.sync_program_period_count_from_registration()
returns trigger language plpgsql security definer set search_path = public as $$
declare item record;
begin
  for item in
    select distinct program_id, period_id from (
      select program_id, period_id from public.registration_items where registration_id = new.id
      union all
      select program_id, period_id from public.registration_periods where registration_id = new.id
    ) selections where period_id is not null
  loop
    perform public.recount_program_period(item.program_id, item.period_id);
  end loop;
  return new;
end;
$$;

create index if not exists registration_form_sections_form_idx on public.registration_form_sections(form_id, sort_order);
create index if not exists registration_form_fields_form_idx on public.registration_form_fields(form_id, section_id, sort_order);
create index if not exists registration_answers_registration_idx on public.registration_answers(registration_id);
create index if not exists registration_periods_registration_idx on public.registration_periods(registration_id);
create index if not exists event_included_items_event_idx on public.event_included_items(event_id, program_id);

alter table public.registration_forms enable row level security;
alter table public.registration_form_sections enable row level security;
alter table public.registration_form_fields enable row level security;
alter table public.event_included_items enable row level security;
alter table public.registration_answers enable row level security;
alter table public.registration_periods enable row level security;
alter table public.registration_consents enable row level security;

create or replace function public.owns_registration_form(target_form_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.registration_forms form
    join public.events event on event.id = form.event_id
    where form.id = target_form_id and event.owner_id = auth.uid()
  );
$$;

drop policy if exists "forms through event owner" on public.registration_forms;
create policy "forms through event owner" on public.registration_forms for all
using (exists (select 1 from public.events event where event.id = event_id and event.owner_id = auth.uid()))
with check (exists (select 1 from public.events event where event.id = event_id and event.owner_id = auth.uid()));

drop policy if exists "form sections through owner" on public.registration_form_sections;
create policy "form sections through owner" on public.registration_form_sections for all
using (public.owns_registration_form(form_id)) with check (public.owns_registration_form(form_id));

drop policy if exists "form fields through owner" on public.registration_form_fields;
create policy "form fields through owner" on public.registration_form_fields for all
using (public.owns_registration_form(form_id)) with check (public.owns_registration_form(form_id));

drop policy if exists "included items through owner" on public.event_included_items;
create policy "included items through owner" on public.event_included_items for all
using (exists (select 1 from public.events event where event.id = event_id and event.owner_id = auth.uid()))
with check (exists (select 1 from public.events event where event.id = event_id and event.owner_id = auth.uid()));

create or replace function public.owns_registration(target_registration_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.registrations registration
    join public.events event on event.id = registration.event_id
    where registration.id = target_registration_id and event.owner_id = auth.uid()
  );
$$;

drop policy if exists "answers through owner" on public.registration_answers;
create policy "answers through owner" on public.registration_answers for select
using (public.owns_registration(registration_id));
drop policy if exists "registration periods through owner" on public.registration_periods;
create policy "registration periods through owner" on public.registration_periods for select
using (public.owns_registration(registration_id));
drop policy if exists "consents through owner" on public.registration_consents;
create policy "consents through owner" on public.registration_consents for select
using (public.owns_registration(registration_id));

drop trigger if exists registration_forms_updated_at on public.registration_forms;
create trigger registration_forms_updated_at before update on public.registration_forms
for each row execute procedure public.touch_pricing_updated_at();
