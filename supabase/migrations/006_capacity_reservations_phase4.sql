-- Fase 4: reservas atómicas de capacidad y trazabilidad de Stripe.

alter table public.event_program_periods
  add column if not exists reserved_count integer not null default 0
  check (reserved_count >= 0);

alter table public.payments
  add column if not exists stripe_session_id text,
  add column if not exists stripe_payment_intent_id text,
  add column if not exists paid_at timestamptz;

create unique index if not exists payments_stripe_session_uidx
  on public.payments(stripe_session_id)
  where stripe_session_id is not null;

create table if not exists public.capacity_reservations (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events(id) on delete cascade,
  program_id uuid not null references public.event_programs(id) on delete cascade,
  period_id uuid not null references public.event_periods(id) on delete cascade,
  registration_id uuid not null references public.registrations(id) on delete cascade,
  quantity integer not null default 1 check (quantity > 0),
  status text not null default 'reserved'
    check (status in ('reserved', 'confirmed', 'expired', 'cancelled')),
  expires_at timestamptz not null,
  stripe_session_id text,
  confirmed_at timestamptz,
  cancelled_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(registration_id, program_id, period_id)
);

create index if not exists capacity_reservations_capacity_idx
  on public.capacity_reservations(program_id, period_id, status, expires_at);
create index if not exists capacity_reservations_registration_idx
  on public.capacity_reservations(registration_id);
create unique index if not exists capacity_reservations_stripe_session_period_uidx
  on public.capacity_reservations(stripe_session_id, program_id, period_id)
  where stripe_session_id is not null;

alter table public.capacity_reservations enable row level security;

drop policy if exists "capacity reservations through event owner" on public.capacity_reservations;
create policy "capacity reservations through event owner"
on public.capacity_reservations for all
using (
  exists (
    select 1 from public.events event
    where event.id = event_id and event.owner_id = auth.uid()
  )
)
with check (
  exists (
    select 1 from public.events event
    where event.id = event_id and event.owner_id = auth.uid()
  )
);

create or replace function public.refresh_program_period_capacity_counts(
  target_program_id uuid,
  target_period_id uuid
)
returns void language sql security definer set search_path = public as $$
  update public.event_program_periods relation
  set
    registered_count = coalesce((
      select sum(reservation.quantity)::integer
      from public.capacity_reservations reservation
      where reservation.program_id = target_program_id
        and reservation.period_id = target_period_id
        and reservation.status = 'confirmed'
    ), 0),
    reserved_count = coalesce((
      select sum(reservation.quantity)::integer
      from public.capacity_reservations reservation
      where reservation.program_id = target_program_id
        and reservation.period_id = target_period_id
        and reservation.status = 'reserved'
        and reservation.expires_at > now()
    ), 0)
  where relation.program_id = target_program_id
    and relation.period_id = target_period_id;
$$;

create or replace function public.recount_program_period(
  target_program_id uuid,
  target_period_id uuid
)
returns void language plpgsql security definer set search_path = public as $$
begin
  perform public.refresh_program_period_capacity_counts(target_program_id, target_period_id);
end;
$$;

create or replace function public.sync_capacity_reservation_counts()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op in ('DELETE', 'UPDATE') then
    perform public.refresh_program_period_capacity_counts(old.program_id, old.period_id);
  end if;
  if tg_op in ('INSERT', 'UPDATE') then
    perform public.refresh_program_period_capacity_counts(new.program_id, new.period_id);
  end if;
  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;

drop trigger if exists capacity_reservations_updated_at on public.capacity_reservations;
create trigger capacity_reservations_updated_at
before update on public.capacity_reservations
for each row execute procedure public.touch_pricing_updated_at();

drop trigger if exists capacity_reservations_count_sync on public.capacity_reservations;
create trigger capacity_reservations_count_sync
after insert or update or delete on public.capacity_reservations
for each row execute procedure public.sync_capacity_reservation_counts();

-- Las inscripciones existentes conservan su plaza al activar esta fase.
insert into public.capacity_reservations (
  event_id,
  program_id,
  period_id,
  registration_id,
  status,
  expires_at,
  confirmed_at
)
select
  selection.event_id,
  selection.program_id,
  selection.period_id,
  selection.registration_id,
  'confirmed',
  now(),
  coalesce(registration.submitted_at, registration.created_at, now())
from (
  select distinct
    program.event_id,
    selected.program_id,
    selected.period_id,
    selected.registration_id
  from (
    select registration_id, program_id, period_id
    from public.registration_items
    where period_id is not null
    union
    select registration_id, program_id, period_id
    from public.registration_periods
  ) selected
  join public.event_programs program on program.id = selected.program_id
  join public.event_periods period
    on period.id = selected.period_id and period.event_id = program.event_id
) selection
join public.registrations registration on registration.id = selection.registration_id
where registration.payment_status <> 'cancelled'
on conflict (registration_id, program_id, period_id) do nothing;

do $$
declare relation record;
begin
  for relation in select program_id, period_id from public.event_program_periods loop
    perform public.refresh_program_period_capacity_counts(relation.program_id, relation.period_id);
  end loop;
end;
$$;

create or replace function public.reserve_event_capacity(
  target_event_id uuid,
  target_program_id uuid,
  target_period_ids uuid[],
  target_registration_id uuid,
  hold_minutes integer default 35
)
returns setof public.capacity_reservations
language plpgsql security definer set search_path = public as $$
declare
  relation record;
  requested_count integer;
  selected_count integer := 0;
  occupied integer;
  hold_until timestamptz;
begin
  if target_period_ids is null or cardinality(target_period_ids) = 0 then
    raise exception 'CAPACITY_INVALID_SELECTION: no periods';
  end if;
  if hold_minutes < 1 or hold_minutes > 120 then
    raise exception 'CAPACITY_INVALID_SELECTION: invalid hold';
  end if;
  if not exists (
    select 1 from public.registrations registration
    where registration.id = target_registration_id
      and registration.event_id = target_event_id
      and registration.program_id = target_program_id
  ) then
    raise exception 'CAPACITY_INVALID_SELECTION: registration mismatch';
  end if;

  select count(*) into requested_count
  from (select distinct unnest(target_period_ids) as period_id) requested;
  hold_until := now() + make_interval(mins => hold_minutes);

  for relation in
    select
      availability.program_id,
      availability.period_id,
      coalesce(availability.capacity, program.capacity) as capacity,
      availability.is_available
    from public.event_program_periods availability
    join public.event_programs program on program.id = availability.program_id
    join public.event_periods period on period.id = availability.period_id
    where availability.program_id = target_program_id
      and availability.period_id = any(target_period_ids)
      and program.event_id = target_event_id
      and period.event_id = target_event_id
      and program.active = true
      and period.active = true
    order by availability.period_id
    for update of availability
  loop
    selected_count := selected_count + 1;
    if not relation.is_available then
      raise exception 'CAPACITY_UNAVAILABLE: %', relation.period_id;
    end if;

    update public.capacity_reservations reservation
    set status = 'expired', updated_at = now()
    where reservation.program_id = relation.program_id
      and reservation.period_id = relation.period_id
      and reservation.status = 'reserved'
      and reservation.expires_at <= now();

    select coalesce(sum(reservation.quantity), 0)::integer into occupied
    from public.capacity_reservations reservation
    where reservation.program_id = relation.program_id
      and reservation.period_id = relation.period_id
      and reservation.registration_id <> target_registration_id
      and (
        reservation.status = 'confirmed'
        or (reservation.status = 'reserved' and reservation.expires_at > now())
      );

    if occupied + 1 > relation.capacity then
      raise exception 'CAPACITY_FULL: %', relation.period_id;
    end if;
  end loop;

  if selected_count <> requested_count then
    raise exception 'CAPACITY_UNAVAILABLE: invalid periods';
  end if;

  insert into public.capacity_reservations (
    event_id,
    program_id,
    period_id,
    registration_id,
    quantity,
    status,
    expires_at
  )
  select
    target_event_id,
    target_program_id,
    requested.period_id,
    target_registration_id,
    1,
    'reserved',
    hold_until
  from (select distinct unnest(target_period_ids) as period_id) requested
  on conflict (registration_id, program_id, period_id) do update set
    quantity = 1,
    status = case
      when capacity_reservations.status = 'confirmed' then 'confirmed'
      else 'reserved'
    end,
    expires_at = case
      when capacity_reservations.status = 'confirmed' then capacity_reservations.expires_at
      else excluded.expires_at
    end,
    cancelled_at = null,
    updated_at = now();

  return query
  select reservation.*
  from public.capacity_reservations reservation
  where reservation.registration_id = target_registration_id
  order by reservation.period_id;
end;
$$;

create or replace function public.confirm_capacity_reservations(
  target_registration_id uuid
)
returns integer language plpgsql security definer set search_path = public as $$
declare affected integer;
begin
  perform 1 from public.capacity_reservations
  where registration_id = target_registration_id
  for update;

  if exists (
    select 1 from public.capacity_reservations
    where registration_id = target_registration_id
      and status = 'reserved'
      and expires_at <= now()
  ) then
    raise exception 'CAPACITY_UNAVAILABLE: reservation expired';
  end if;

  update public.capacity_reservations
  set status = 'confirmed', confirmed_at = coalesce(confirmed_at, now()), updated_at = now()
  where registration_id = target_registration_id
    and status = 'reserved';
  get diagnostics affected = row_count;

  if affected = 0 and not exists (
    select 1 from public.capacity_reservations
    where registration_id = target_registration_id and status = 'confirmed'
  ) then
    raise exception 'CAPACITY_UNAVAILABLE: reservation missing';
  end if;

  return affected;
end;
$$;

create or replace function public.cancel_capacity_reservations(
  target_registration_id uuid
)
returns integer language plpgsql security definer set search_path = public as $$
declare affected integer;
begin
  update public.capacity_reservations
  set status = 'cancelled', cancelled_at = coalesce(cancelled_at, now()), updated_at = now()
  where registration_id = target_registration_id
    and status in ('reserved', 'confirmed');
  get diagnostics affected = row_count;
  return affected;
end;
$$;

revoke all on function public.reserve_event_capacity(uuid, uuid, uuid[], uuid, integer) from public;
revoke all on function public.confirm_capacity_reservations(uuid) from public;
revoke all on function public.cancel_capacity_reservations(uuid) from public;
grant execute on function public.reserve_event_capacity(uuid, uuid, uuid[], uuid, integer) to service_role;
grant execute on function public.confirm_capacity_reservations(uuid) to service_role;
grant execute on function public.cancel_capacity_reservations(uuid) to service_role;
