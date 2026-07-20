alter table public.events
  add column if not exists event_mode text not null default 'simple' check (event_mode in ('simple', 'advanced')),
  add column if not exists organizer_name text,
  add column if not exists contact_email text,
  add column if not exists contact_phone text;

create table if not exists public.event_programs (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events(id) on delete cascade,
  name text not null,
  turn text not null default 'custom' check (turn in ('morning', 'afternoon', 'full_day', 'custom')),
  description text,
  start_time time,
  end_time time,
  min_age integer check (min_age is null or min_age >= 3),
  max_age integer check (max_age is null or max_age >= min_age),
  capacity integer not null check (capacity > 0),
  payment_timing text not null default 'immediate' check (payment_timing in ('immediate', 'reserve', 'deferred')),
  payment_due_date date,
  included_items text[] not null default '{}',
  active boolean not null default true,
  position integer not null default 0,
  created_at timestamptz not null default now()
);

create table if not exists public.event_periods (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events(id) on delete cascade,
  label text not null,
  start_date date not null,
  end_date date not null,
  active boolean not null default true,
  position integer not null default 0,
  created_at timestamptz not null default now(),
  check (end_date >= start_date)
);

create table if not exists public.event_prices (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events(id) on delete cascade,
  program_id uuid not null references public.event_programs(id) on delete cascade,
  period_id uuid references public.event_periods(id) on delete cascade,
  label text not null,
  audience text not null default 'all' check (audience in ('all', 'member', 'non_member')),
  amount numeric(10,2) not null check (amount >= 0),
  active boolean not null default true,
  position integer not null default 0,
  created_at timestamptz not null default now()
);

alter table public.registrations
  add column if not exists participant_birth_date date,
  add column if not exists guardian_name text,
  add column if not exists club_member boolean,
  add column if not exists current_club text,
  add column if not exists shirt_size text,
  add column if not exists allergies text,
  add column if not exists medical_notes text,
  add column if not exists image_consent boolean not null default false,
  add column if not exists registration_status text not null default 'confirmed'
    check (registration_status in ('requested', 'confirmed', 'cancelled'));

create table if not exists public.registration_items (
  id uuid primary key default gen_random_uuid(),
  registration_id uuid not null references public.registrations(id) on delete cascade,
  event_id uuid not null references public.events(id) on delete cascade,
  program_id uuid not null references public.event_programs(id) on delete restrict,
  period_id uuid references public.event_periods(id) on delete restrict,
  price_id uuid not null references public.event_prices(id) on delete restrict,
  amount numeric(10,2) not null check (amount >= 0),
  created_at timestamptz not null default now(),
  unique (registration_id)
);

create index if not exists event_programs_event_id_idx on public.event_programs(event_id);
create index if not exists event_periods_event_id_idx on public.event_periods(event_id);
create index if not exists event_prices_event_id_idx on public.event_prices(event_id);
create index if not exists event_prices_program_id_idx on public.event_prices(program_id);
create index if not exists registration_items_event_id_idx on public.registration_items(event_id);
create index if not exists registration_items_program_period_idx on public.registration_items(program_id, period_id);

alter table public.event_programs enable row level security;
alter table public.event_periods enable row level security;
alter table public.event_prices enable row level security;
alter table public.registration_items enable row level security;

create policy "event programs through owner" on public.event_programs for all
  using (exists (select 1 from public.events e where e.id = event_id and e.owner_id = auth.uid()))
  with check (exists (select 1 from public.events e where e.id = event_id and e.owner_id = auth.uid()));
create policy "event periods through owner" on public.event_periods for all
  using (exists (select 1 from public.events e where e.id = event_id and e.owner_id = auth.uid()))
  with check (exists (select 1 from public.events e where e.id = event_id and e.owner_id = auth.uid()));
create policy "event prices through owner" on public.event_prices for all
  using (exists (select 1 from public.events e where e.id = event_id and e.owner_id = auth.uid()))
  with check (exists (select 1 from public.events e where e.id = event_id and e.owner_id = auth.uid()));
create policy "registration items through owner" on public.registration_items for all
  using (exists (select 1 from public.events e where e.id = event_id and e.owner_id = auth.uid()))
  with check (exists (select 1 from public.events e where e.id = event_id and e.owner_id = auth.uid()));
