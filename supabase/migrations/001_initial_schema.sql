create extension if not exists "pgcrypto";

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text,
  email text,
  role text check (role in ('club', 'academy', 'coach', 'organizer')),
  city text,
  language text not null default 'es' check (language in ('es', 'en')),
  created_at timestamptz not null default now()
);

create table public.organizations (
  id uuid primary key default gen_random_uuid(), owner_id uuid not null references public.profiles(id) on delete cascade,
  name text not null, type text, city text, logo_url text, created_at timestamptz not null default now()
);

create table public.telegram_accounts (
  id uuid primary key default gen_random_uuid(), profile_id uuid not null references public.profiles(id) on delete cascade,
  telegram_chat_id text not null unique, telegram_username text, created_at timestamptz not null default now()
);

create table public.events (
  id uuid primary key default gen_random_uuid(), owner_id uuid not null references public.profiles(id) on delete cascade,
  organization_id uuid references public.organizations(id) on delete set null, title text not null, slug text not null unique,
  event_type text not null, description text, city text not null, location text, start_date date not null, end_date date not null,
  schedule text, age_range text, price numeric(10,2) not null check (price >= 0), capacity integer not null check (capacity > 0),
  payment_mode text not null default 'manual', status text not null default 'draft' check (status in ('draft', 'published', 'cancelled')),
  social_copy text, whatsapp_message text, created_from text not null default 'telegram' check (created_from in ('telegram', 'web')),
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(), check (end_date >= start_date)
);

create table public.registrations (
  id uuid primary key default gen_random_uuid(), event_id uuid not null references public.events(id) on delete cascade,
  participant_name text not null, participant_email text, participant_phone text, participant_age integer,
  notes text, payment_status text not null default 'pending' check (payment_status in ('pending', 'paid', 'cancelled')),
  created_at timestamptz not null default now()
);

create table public.payments (
  id uuid primary key default gen_random_uuid(), registration_id uuid not null references public.registrations(id) on delete cascade,
  event_id uuid not null references public.events(id) on delete cascade, amount numeric(10,2) not null check (amount >= 0),
  status text not null default 'pending' check (status in ('pending', 'paid', 'cancelled')),
  method text not null default 'manual', created_at timestamptz not null default now(), unique(registration_id)
);

create table public.certificates (
  id uuid primary key default gen_random_uuid(), event_id uuid not null references public.events(id) on delete cascade,
  registration_id uuid not null references public.registrations(id) on delete cascade, certificate_url text,
  status text not null default 'pending' check (status in ('pending', 'ready', 'failed')), created_at timestamptz not null default now(),
  unique(event_id, registration_id)
);

create table public.conversation_states (
  id uuid primary key default gen_random_uuid(), telegram_chat_id text not null unique, profile_id uuid references public.profiles(id) on delete cascade,
  current_flow text, collected_data jsonb not null default '{}'::jsonb, missing_fields jsonb not null default '[]'::jsonb,
  last_message text, updated_at timestamptz not null default now()
);

create index events_owner_id_idx on public.events(owner_id);
create index registrations_event_id_idx on public.registrations(event_id);
create index payments_event_id_idx on public.payments(event_id);

create or replace function public.handle_new_user() returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, full_name, email, role, language)
  values (new.id, new.raw_user_meta_data ->> 'full_name', new.email, coalesce(new.raw_user_meta_data ->> 'role', 'organizer'), coalesce(new.raw_user_meta_data ->> 'language', 'es'));
  return new;
end;
$$;
create trigger on_auth_user_created after insert on auth.users for each row execute procedure public.handle_new_user();

create or replace function public.touch_updated_at() returns trigger language plpgsql as $$ begin new.updated_at = now(); return new; end; $$;
create trigger events_updated_at before update on public.events for each row execute procedure public.touch_updated_at();

alter table public.profiles enable row level security;
alter table public.organizations enable row level security;
alter table public.telegram_accounts enable row level security;
alter table public.events enable row level security;
alter table public.registrations enable row level security;
alter table public.payments enable row level security;
alter table public.certificates enable row level security;
alter table public.conversation_states enable row level security;

create policy "profiles own row" on public.profiles for all using (id = auth.uid()) with check (id = auth.uid());
create policy "organizations by owner" on public.organizations for all using (owner_id = auth.uid()) with check (owner_id = auth.uid());
create policy "telegram accounts by profile" on public.telegram_accounts for all using (profile_id = auth.uid()) with check (profile_id = auth.uid());
create policy "events by owner" on public.events for all using (owner_id = auth.uid()) with check (owner_id = auth.uid());
create policy "registrations through event owner" on public.registrations for all using (exists (select 1 from public.events e where e.id = event_id and e.owner_id = auth.uid())) with check (exists (select 1 from public.events e where e.id = event_id and e.owner_id = auth.uid()));
create policy "payments through event owner" on public.payments for all using (exists (select 1 from public.events e where e.id = event_id and e.owner_id = auth.uid())) with check (exists (select 1 from public.events e where e.id = event_id and e.owner_id = auth.uid()));
create policy "certificates through event owner" on public.certificates for all using (exists (select 1 from public.events e where e.id = event_id and e.owner_id = auth.uid())) with check (exists (select 1 from public.events e where e.id = event_id and e.owner_id = auth.uid()));
create policy "conversation state by profile" on public.conversation_states for all using (profile_id = auth.uid()) with check (profile_id = auth.uid());
