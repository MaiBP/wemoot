-- Fase 7: inscripciones multimodales y cola de preinscripcion.
-- Conserva el flujo de inscripcion directa como valor predeterminado.

alter table public.events
  add column if not exists registration_mode text not null default 'direct',
  add column if not exists allow_multiple_programs boolean not null default true,
  add column if not exists preregistration_limit integer,
  add column if not exists payment_invitation_hours integer not null default 24,
  add column if not exists payment_opened_at timestamptz;

alter table public.events drop constraint if exists events_registration_mode_check;
alter table public.events add constraint events_registration_mode_check
  check (registration_mode in ('direct', 'preregistration'));
alter table public.events drop constraint if exists events_preregistration_limit_check;
alter table public.events add constraint events_preregistration_limit_check
  check (preregistration_limit is null or preregistration_limit > 0);
alter table public.events drop constraint if exists events_payment_invitation_hours_check;
alter table public.events add constraint events_payment_invitation_hours_check
  check (payment_invitation_hours between 1 and 24);

alter table public.registrations
  add column if not exists queue_position bigint,
  add column if not exists public_token uuid not null default gen_random_uuid(),
  add column if not exists preregistered_at timestamptz,
  add column if not exists payment_invited_at timestamptz,
  add column if not exists payment_expires_at timestamptz;

create unique index if not exists registrations_public_token_uidx
  on public.registrations(public_token);
create unique index if not exists registrations_event_queue_position_uidx
  on public.registrations(event_id, queue_position)
  where queue_position is not null;
create index if not exists registrations_payment_queue_idx
  on public.registrations(event_id, registration_status, queue_position);
create index if not exists registrations_payment_expiry_idx
  on public.registrations(payment_expires_at)
  where registration_status in ('payment_invited', 'pending_payment');

alter table public.registrations
  drop constraint if exists registrations_registration_status_check;
alter table public.registrations
  add constraint registrations_registration_status_check
  check (
    registration_status in (
      'pending',
      'pending_payment',
      'requested',
      'preregistered',
      'waitlisted',
      'payment_invited',
      'confirmed',
      'expired',
      'cancelled'
    )
  );

create table if not exists public.registration_programs (
  id uuid primary key default gen_random_uuid(),
  registration_id uuid not null references public.registrations(id) on delete cascade,
  event_id uuid not null references public.events(id) on delete cascade,
  program_id uuid not null references public.event_programs(id) on delete restrict,
  amount numeric(10,2) not null default 0 check (amount >= 0),
  currency text not null default 'EUR',
  created_at timestamptz not null default now(),
  unique (registration_id, program_id)
);

insert into public.registration_programs (
  registration_id,
  event_id,
  program_id,
  amount,
  currency
)
select
  registration.id,
  registration.event_id,
  registration.program_id,
  coalesce(registration.total_amount, 0),
  registration.currency
from public.registrations registration
where registration.program_id is not null
on conflict (registration_id, program_id) do nothing;

create index if not exists registration_programs_event_idx
  on public.registration_programs(event_id, program_id);

alter table public.registration_programs enable row level security;
drop policy if exists "registration programs through owner"
  on public.registration_programs;
create policy "registration programs through owner"
on public.registration_programs for select
using (
  public.has_event_role(
    event_id,
    array[
      'owner',
      'admin',
      'registration_manager',
      'coach',
      'medical_staff',
      'viewer'
    ]::text[]
  )
);

create or replace function public.assign_preregistration_position()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  event_mode text;
  event_limit integer;
  active_count integer;
begin
  if new.registration_status not in ('preregistered', 'waitlisted') then
    return new;
  end if;

  select registration_mode, preregistration_limit
  into event_mode, event_limit
  from public.events
  where id = new.event_id;

  if event_mode <> 'preregistration' then
    return new;
  end if;

  perform pg_advisory_xact_lock(hashtextextended(new.event_id::text, 0));

  select count(*)::integer
  into active_count
  from public.registrations registration
  where registration.event_id = new.event_id
    and registration.id is distinct from new.id
    and registration.registration_status in (
      'preregistered',
      'waitlisted',
      'payment_invited',
      'pending_payment',
      'confirmed'
    );

  if event_limit is not null and active_count >= event_limit then
    raise exception 'PREREGISTRATION_FULL';
  end if;

  if new.queue_position is null then
    select coalesce(max(registration.queue_position), 0) + 1
    into new.queue_position
    from public.registrations registration
    where registration.event_id = new.event_id;
  end if;

  new.preregistered_at := coalesce(new.preregistered_at, now());
  return new;
end;
$$;

drop trigger if exists registrations_assign_preregistration_position
  on public.registrations;
create trigger registrations_assign_preregistration_position
before insert or update of registration_status
on public.registrations
for each row execute procedure public.assign_preregistration_position();

alter table public.email_deliveries
  drop constraint if exists email_deliveries_email_type_check;
alter table public.email_deliveries
  add constraint email_deliveries_email_type_check
  check (
    email_type in (
      'registration_received',
      'preregistration_received',
      'payment_invitation',
      'payment_confirmed',
      'payment_expired',
      'registration_cancelled'
    )
  );

-- Una inscripcion puede reservar capacidad en varias modalidades.
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
  if hold_minutes < 1 or hold_minutes > 1440 then
    raise exception 'CAPACITY_INVALID_SELECTION: invalid hold';
  end if;
  if not exists (
    select 1
    from public.registrations registration
    where registration.id = target_registration_id
      and registration.event_id = target_event_id
      and (
        registration.program_id = target_program_id
        or exists (
          select 1
          from public.registration_programs selection
          where selection.registration_id = registration.id
            and selection.program_id = target_program_id
            and selection.event_id = target_event_id
        )
      )
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
      when capacity_reservations.status = 'confirmed'
        then capacity_reservations.expires_at
      else excluded.expires_at
    end,
    cancelled_at = null,
    updated_at = now();

  return query
  select reservation.*
  from public.capacity_reservations reservation
  where reservation.registration_id = target_registration_id
  order by reservation.program_id, reservation.period_id;
end;
$$;

revoke all on function public.reserve_event_capacity(
  uuid, uuid, uuid[], uuid, integer
) from public;
grant execute on function public.reserve_event_capacity(
  uuid, uuid, uuid[], uuid, integer
) to service_role;
