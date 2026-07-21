-- Fase 2: reglas de precio, descuentos y snapshots deterministas.
-- event_prices se conserva como capa de compatibilidad con el formulario actual.

create table if not exists public.event_price_rules (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events(id) on delete cascade,
  program_id uuid references public.event_programs(id) on delete cascade,
  period_id uuid references public.event_periods(id) on delete cascade,
  participant_type text not null default 'general'
    check (participant_type in ('general', 'member', 'non_member', 'player', 'goalkeeper', 'custom')),
  pricing_type text not null
    check (pricing_type in ('fixed', 'per_period', 'period_bundle', 'full_event', 'early_bird', 'manual')),
  quantity_from integer check (quantity_from is null or quantity_from > 0),
  quantity_to integer check (quantity_to is null or quantity_to > 0),
  amount numeric(10,2) not null check (amount >= 0),
  currency text not null default 'EUR',
  label text,
  description text,
  priority integer not null default 0,
  starts_at timestamptz,
  ends_at timestamptz,
  legacy_price_id uuid unique references public.event_prices(id) on delete set null,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (quantity_to is null or quantity_from is null or quantity_to >= quantity_from),
  check (ends_at is null or starts_at is null or ends_at >= starts_at),
  check (char_length(currency) = 3)
);

create table if not exists public.event_discounts (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events(id) on delete cascade,
  program_id uuid references public.event_programs(id) on delete cascade,
  code text,
  name text not null,
  description text,
  discount_type text not null
    check (discount_type in ('percentage', 'fixed_amount', 'full_event', 'bundle', 'manual')),
  discount_value numeric(10,2) not null check (discount_value >= 0),
  applies_to text not null default 'event'
    check (applies_to in ('event', 'program')),
  min_periods integer check (min_periods is null or min_periods > 0),
  starts_at timestamptz,
  ends_at timestamptz,
  usage_limit integer check (usage_limit is null or usage_limit > 0),
  usage_count integer not null default 0 check (usage_count >= 0),
  priority integer not null default 0,
  is_combinable boolean not null default false,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (ends_at is null or starts_at is null or ends_at >= starts_at),
  check (discount_type <> 'percentage' or discount_value <= 100)
);

create unique index if not exists event_discounts_event_code_uidx
  on public.event_discounts(event_id, lower(code))
  where code is not null;
create index if not exists event_price_rules_event_program_idx
  on public.event_price_rules(event_id, program_id, is_active);
create index if not exists event_discounts_event_program_idx
  on public.event_discounts(event_id, program_id, is_active);

insert into public.event_price_rules (
  event_id,
  program_id,
  period_id,
  participant_type,
  pricing_type,
  quantity_from,
  quantity_to,
  amount,
  currency,
  label,
  priority,
  legacy_price_id,
  is_active
)
select
  price.event_id,
  price.program_id,
  price.period_id,
  case price.audience
    when 'member' then 'member'
    when 'non_member' then 'non_member'
    else 'general'
  end,
  'fixed',
  1,
  1,
  price.amount,
  coalesce(event.currency, 'EUR'),
  price.label,
  100,
  price.id,
  price.active
from public.event_prices price
join public.events event on event.id = price.event_id
on conflict (legacy_price_id) do nothing;

create or replace function public.sync_legacy_event_price_rule()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  event_currency text;
begin
  if tg_op = 'DELETE' then
    delete from public.event_price_rules where legacy_price_id = old.id;
    return old;
  end if;

  select coalesce(currency, 'EUR') into event_currency
  from public.events where id = new.event_id;

  insert into public.event_price_rules (
    event_id, program_id, period_id, participant_type, pricing_type,
    quantity_from, quantity_to, amount, currency, label, priority,
    legacy_price_id, is_active
  ) values (
    new.event_id,
    new.program_id,
    new.period_id,
    case new.audience
      when 'member' then 'member'
      when 'non_member' then 'non_member'
      else 'general'
    end,
    'fixed', 1, 1, new.amount, event_currency, new.label, 100, new.id, new.active
  )
  on conflict (legacy_price_id) do update set
    event_id = excluded.event_id,
    program_id = excluded.program_id,
    period_id = excluded.period_id,
    participant_type = excluded.participant_type,
    amount = excluded.amount,
    currency = excluded.currency,
    label = excluded.label,
    is_active = excluded.is_active;
  return new;
end;
$$;

drop trigger if exists event_prices_rule_compatibility on public.event_prices;
create trigger event_prices_rule_compatibility
after insert or update or delete on public.event_prices
for each row execute procedure public.sync_legacy_event_price_rule();

create table if not exists public.registration_price_snapshots (
  id uuid primary key default gen_random_uuid(),
  registration_id uuid not null unique references public.registrations(id) on delete cascade,
  calculation jsonb not null,
  base_amount integer not null check (base_amount >= 0),
  discount_amount integer not null default 0 check (discount_amount >= 0),
  final_amount integer not null check (final_amount >= 0),
  currency text not null default 'EUR',
  created_at timestamptz not null default now()
);

create table if not exists public.registration_discount_uses (
  id uuid primary key default gen_random_uuid(),
  registration_id uuid not null references public.registrations(id) on delete cascade,
  discount_id uuid not null references public.event_discounts(id) on delete cascade,
  amount integer not null check (amount >= 0),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  unique(registration_id, discount_id)
);
create index if not exists registration_discount_uses_discount_idx
  on public.registration_discount_uses(discount_id);

alter table public.event_price_rules enable row level security;
alter table public.event_discounts enable row level security;
alter table public.registration_price_snapshots enable row level security;
alter table public.registration_discount_uses enable row level security;

drop policy if exists "price rules through event owner" on public.event_price_rules;
create policy "price rules through event owner"
on public.event_price_rules for all
using (
  exists (
    select 1 from public.events event
    where event.id = event_price_rules.event_id and event.owner_id = auth.uid()
  )
)
with check (
  exists (
    select 1 from public.events event
    where event.id = event_price_rules.event_id and event.owner_id = auth.uid()
  )
);

drop policy if exists "discounts through event owner" on public.event_discounts;
create policy "discounts through event owner"
on public.event_discounts for all
using (
  exists (
    select 1 from public.events event
    where event.id = event_discounts.event_id and event.owner_id = auth.uid()
  )
)
with check (
  exists (
    select 1 from public.events event
    where event.id = event_discounts.event_id and event.owner_id = auth.uid()
  )
);

drop policy if exists "price snapshots through event owner" on public.registration_price_snapshots;
create policy "price snapshots through event owner"
on public.registration_price_snapshots for select
using (
  exists (
    select 1
    from public.registrations registration
    join public.events event on event.id = registration.event_id
    where registration.id = registration_price_snapshots.registration_id
      and event.owner_id = auth.uid()
  )
);

drop policy if exists "discount uses through event owner" on public.registration_discount_uses;
create policy "discount uses through event owner"
on public.registration_discount_uses for select
using (
  exists (
    select 1
    from public.registrations registration
    join public.events event on event.id = registration.event_id
    where registration.id = registration_discount_uses.registration_id
      and event.owner_id = auth.uid()
  )
);

create or replace function public.sync_discount_usage_count()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  current_limit integer;
  current_count integer;
begin
  if (tg_op = 'INSERT' and new.is_active)
    or (tg_op = 'UPDATE' and new.is_active and not old.is_active) then
    select usage_limit, usage_count into current_limit, current_count
    from public.event_discounts
    where id = new.discount_id
    for update;
    if current_limit is not null and current_count >= current_limit then
      raise exception 'El descuento ha alcanzado su límite de usos';
    end if;
    update public.event_discounts
    set usage_count = usage_count + 1
    where id = new.discount_id;
  elsif (tg_op = 'DELETE' and old.is_active)
    or (tg_op = 'UPDATE' and old.is_active and not new.is_active) then
    update public.event_discounts
    set usage_count = greatest(usage_count - 1, 0)
    where id = old.discount_id;
  end if;
  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;

drop trigger if exists registration_discount_usage_count on public.registration_discount_uses;
create trigger registration_discount_usage_count
before insert or update of is_active or delete on public.registration_discount_uses
for each row execute procedure public.sync_discount_usage_count();

create or replace function public.sync_registration_discount_activity()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  update public.registration_discount_uses
  set is_active = new.payment_status <> 'cancelled'
  where registration_id = new.id
    and is_active is distinct from (new.payment_status <> 'cancelled');
  return new;
end;
$$;

drop trigger if exists registrations_discount_activity on public.registrations;
create trigger registrations_discount_activity
after update of payment_status on public.registrations
for each row
when (old.payment_status is distinct from new.payment_status)
execute procedure public.sync_registration_discount_activity();

create or replace function public.touch_pricing_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists event_price_rules_updated_at on public.event_price_rules;
create trigger event_price_rules_updated_at
before update on public.event_price_rules
for each row execute procedure public.touch_pricing_updated_at();

drop trigger if exists event_discounts_updated_at on public.event_discounts;
create trigger event_discounts_updated_at
before update on public.event_discounts
for each row execute procedure public.touch_pricing_updated_at();
