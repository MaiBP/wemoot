-- Fase 1: contrato de eventos complejos y disponibilidad programa-periodo.
-- Es incremental y conserva las columnas utilizadas por el MVP actual.

alter table public.events
  add column if not exists complexity text not null default 'simple'
    check (complexity in ('simple', 'complex')),
  add column if not exists currency text not null default 'EUR',
  add column if not exists general_settings jsonb not null default '{}'::jsonb,
  add column if not exists cancellation_policy text,
  add column if not exists cover_image_url text;

update public.events
set complexity = case when event_mode = 'advanced' then 'complex' else 'simple' end;

create or replace function public.sync_event_complexity()
returns trigger
language plpgsql
as $$
begin
  if tg_op = 'UPDATE' and new.complexity is distinct from old.complexity then
    new.event_mode := case when new.complexity = 'complex' then 'advanced' else 'simple' end;
  elsif tg_op = 'UPDATE' and new.event_mode is distinct from old.event_mode then
    new.complexity := case when new.event_mode = 'advanced' then 'complex' else 'simple' end;
  elsif new.event_mode = 'advanced' or new.complexity = 'complex' then
    new.event_mode := 'advanced';
    new.complexity := 'complex';
  else
    new.event_mode := 'simple';
    new.complexity := 'simple';
  end if;
  return new;
end;
$$;

drop trigger if exists events_complexity_sync on public.events;
create trigger events_complexity_sync
before insert or update of event_mode, complexity on public.events
for each row execute procedure public.sync_event_complexity();

alter table public.event_programs
  add column if not exists slug text,
  add column if not exists category text,
  add column if not exists shift text
    check (shift in ('morning', 'afternoon', 'full_day', 'custom')),
  add column if not exists min_birth_year integer,
  add column if not exists max_birth_year integer,
  add column if not exists metadata jsonb not null default '{}'::jsonb,
  add column if not exists is_active boolean not null default true,
  add column if not exists sort_order integer not null default 0,
  add column if not exists updated_at timestamptz not null default now();

update public.event_programs
set
  slug = coalesce(
    slug,
    concat(
      trim(both '-' from lower(regexp_replace(trim(name), '[^a-zA-Z0-9]+', '-', 'g'))),
      '-',
      left(id::text, 8)
    )
  ),
  shift = coalesce(shift, turn),
  is_active = active,
  sort_order = position;

create unique index if not exists event_programs_event_slug_uidx
  on public.event_programs(event_id, slug);

create or replace function public.sync_event_program_compatibility()
returns trigger
language plpgsql
as $$
begin
  if tg_op = 'UPDATE' and new.shift is distinct from old.shift then
    new.turn := new.shift;
  elsif tg_op = 'UPDATE' and new.turn is distinct from old.turn then
    new.shift := new.turn;
  else
    new.shift := coalesce(new.shift, new.turn, 'custom');
    new.turn := new.shift;
  end if;
  new.slug := coalesce(
    nullif(new.slug, ''),
    concat(
      trim(both '-' from lower(regexp_replace(trim(new.name), '[^a-zA-Z0-9]+', '-', 'g'))),
      '-',
      left(new.id::text, 8)
    )
  );
  if tg_op = 'UPDATE' and new.is_active is distinct from old.is_active then
    new.active := new.is_active;
  elsif tg_op = 'UPDATE' and new.active is distinct from old.active then
    new.is_active := new.active;
  else
    new.is_active := coalesce(new.active, new.is_active, true);
    new.active := new.is_active;
  end if;
  if tg_op = 'UPDATE' and new.sort_order is distinct from old.sort_order then
    new.position := new.sort_order;
  elsif tg_op = 'UPDATE' and new.position is distinct from old.position then
    new.sort_order := new.position;
  else
    new.sort_order := coalesce(new.position, new.sort_order, 0);
    new.position := new.sort_order;
  end if;
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists event_programs_compatibility_sync on public.event_programs;
create trigger event_programs_compatibility_sync
before insert or update on public.event_programs
for each row execute procedure public.sync_event_program_compatibility();

alter table public.event_periods
  add column if not exists name text,
  add column if not exists is_active boolean not null default true,
  add column if not exists sort_order integer not null default 0;

update public.event_periods
set name = coalesce(name, label), is_active = active, sort_order = position;

alter table public.event_periods alter column name set not null;

create or replace function public.sync_event_period_compatibility()
returns trigger
language plpgsql
as $$
begin
  if tg_op = 'UPDATE' and new.name is distinct from old.name then
    new.label := new.name;
  elsif tg_op = 'UPDATE' and new.label is distinct from old.label then
    new.name := new.label;
  else
    new.name := coalesce(nullif(new.name, ''), new.label);
    new.label := coalesce(nullif(new.label, ''), new.name);
  end if;
  if tg_op = 'UPDATE' and new.is_active is distinct from old.is_active then
    new.active := new.is_active;
  elsif tg_op = 'UPDATE' and new.active is distinct from old.active then
    new.is_active := new.active;
  else
    new.is_active := coalesce(new.active, new.is_active, true);
    new.active := new.is_active;
  end if;
  if tg_op = 'UPDATE' and new.sort_order is distinct from old.sort_order then
    new.position := new.sort_order;
  elsif tg_op = 'UPDATE' and new.position is distinct from old.position then
    new.sort_order := new.position;
  else
    new.sort_order := coalesce(new.position, new.sort_order, 0);
    new.position := new.sort_order;
  end if;
  return new;
end;
$$;

drop trigger if exists event_periods_compatibility_sync on public.event_periods;
create trigger event_periods_compatibility_sync
before insert or update on public.event_periods
for each row execute procedure public.sync_event_period_compatibility();

create table if not exists public.event_program_periods (
  id uuid primary key default gen_random_uuid(),
  program_id uuid not null references public.event_programs(id) on delete cascade,
  period_id uuid not null references public.event_periods(id) on delete cascade,
  capacity integer check (capacity is null or capacity > 0),
  registered_count integer not null default 0 check (registered_count >= 0),
  is_available boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(program_id, period_id)
);

insert into public.event_program_periods (program_id, period_id, capacity)
select program.id, period.id, program.capacity
from public.event_programs program
join public.event_periods period on period.event_id = program.event_id
on conflict (program_id, period_id) do nothing;

update public.event_program_periods relation
set registered_count = counts.total
from (
  select item.program_id, item.period_id, count(*)::integer as total
  from public.registration_items item
  join public.registrations registration on registration.id = item.registration_id
  where item.period_id is not null and registration.payment_status <> 'cancelled'
  group by item.program_id, item.period_id
) counts
where relation.program_id = counts.program_id
  and relation.period_id = counts.period_id;

create index if not exists event_program_periods_program_idx
  on public.event_program_periods(program_id);
create index if not exists event_program_periods_period_idx
  on public.event_program_periods(period_id);

alter table public.event_program_periods enable row level security;

drop policy if exists "program periods through event owner" on public.event_program_periods;
create policy "program periods through event owner"
on public.event_program_periods for all
using (
  exists (
    select 1
    from public.event_programs program
    join public.events event on event.id = program.event_id
    where program.id = event_program_periods.program_id and event.owner_id = auth.uid()
  )
)
with check (
  exists (
    select 1
    from public.event_programs program
    join public.events event on event.id = program.event_id
    where program.id = event_program_periods.program_id and event.owner_id = auth.uid()
  )
);

create or replace function public.touch_event_program_period_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists event_program_periods_updated_at on public.event_program_periods;
create trigger event_program_periods_updated_at
before update on public.event_program_periods
for each row execute procedure public.touch_event_program_period_updated_at();

create or replace function public.recount_program_period(
  target_program_id uuid,
  target_period_id uuid
)
returns void language sql security definer set search_path = public as $$
  update public.event_program_periods relation
  set registered_count = (
    select count(*)::integer
    from public.registration_items item
    join public.registrations registration on registration.id = item.registration_id
    where item.program_id = target_program_id
      and item.period_id = target_period_id
      and registration.payment_status <> 'cancelled'
  )
  where relation.program_id = target_program_id
    and relation.period_id = target_period_id;
$$;

create or replace function public.sync_program_period_count_from_item()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op in ('DELETE', 'UPDATE') and old.period_id is not null then
    perform public.recount_program_period(old.program_id, old.period_id);
  end if;
  if tg_op in ('INSERT', 'UPDATE') and new.period_id is not null then
    perform public.recount_program_period(new.program_id, new.period_id);
  end if;
  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

drop trigger if exists registration_items_program_period_count on public.registration_items;
create trigger registration_items_program_period_count
after insert or update or delete on public.registration_items
for each row execute procedure public.sync_program_period_count_from_item();

create or replace function public.sync_program_period_count_from_registration()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  item record;
begin
  for item in
    select distinct program_id, period_id
    from public.registration_items
    where registration_id = new.id and period_id is not null
  loop
    perform public.recount_program_period(item.program_id, item.period_id);
  end loop;
  return new;
end;
$$;

drop trigger if exists registrations_program_period_count on public.registrations;
create trigger registrations_program_period_count
after update of payment_status on public.registrations
for each row
when (old.payment_status is distinct from new.payment_status)
execute procedure public.sync_program_period_count_from_registration();
