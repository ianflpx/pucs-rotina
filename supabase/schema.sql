-- PUCS: schema do app. Rode este arquivo inteiro no SQL Editor do SEU projeto Supabase.
-- Antes, troque SEU-PROJETO e SUA-CHAVE-PUBLICA no bloco do cron (perto do fim do arquivo).
-- Modelo offline-first: o cliente gera os ids e o updated_at; o servidor carimba synced_at
-- para o pull incremental. Exclusão é soft (deleted = true). Toda tabela é por usuário (RLS).

create or replace function public.pucs_touch_synced()
returns trigger language plpgsql set search_path = '' as $$
begin
  new.synced_at := now();
  return new;
end $$;

create table if not exists public.projects (
  id uuid primary key,
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  updated_at timestamptz not null default now(),
  synced_at timestamptz not null default now(),
  deleted boolean not null default false,
  name text not null,
  color text,
  sort double precision default 0,
  archived boolean default false
);

create table if not exists public.labels (
  id uuid primary key,
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  updated_at timestamptz not null default now(),
  synced_at timestamptz not null default now(),
  deleted boolean not null default false,
  name text not null,
  color text
);

create table if not exists public.tasks (
  id uuid primary key,
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  updated_at timestamptz not null default now(),
  synced_at timestamptz not null default now(),
  deleted boolean not null default false,
  title text not null,
  description text,
  project_id uuid,
  parent_id uuid,
  due_date date,
  due_time text,
  priority int not null default 4,
  labels text[] not null default '{}',
  recurrence text,
  completed_at timestamptz,
  sort double precision default 0
);

create table if not exists public.meals (
  id uuid primary key,
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  updated_at timestamptz not null default now(),
  synced_at timestamptz not null default now(),
  deleted boolean not null default false,
  name text not null,
  time text,
  sort double precision default 0,
  items jsonb not null default '[]',
  notes text
);

create table if not exists public.meal_logs (
  id uuid primary key,
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  updated_at timestamptz not null default now(),
  synced_at timestamptz not null default now(),
  deleted boolean not null default false,
  date date not null,
  meal_id uuid not null,
  done boolean not null default false,
  done_at timestamptz,
  choices jsonb not null default '{}',
  dessert boolean default false
);

create table if not exists public.day_logs (
  id uuid primary key,
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  updated_at timestamptz not null default now(),
  synced_at timestamptz not null default now(),
  deleted boolean not null default false,
  date date not null,
  water_ml int default 0,
  weight_kg numeric,
  cardio_done boolean default false,
  cardio_min int,
  sleep_h numeric,
  notes text,
  habits jsonb not null default '[]'::jsonb,
  workout_rest boolean not null default false,
  cardio_rest boolean not null default false
);

create table if not exists public.splits (
  id uuid primary key,
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  updated_at timestamptz not null default now(),
  synced_at timestamptz not null default now(),
  deleted boolean not null default false,
  weekday int not null,
  name text not null,
  exercises jsonb not null default '[]',
  sort double precision default 0
);

create table if not exists public.workout_logs (
  id uuid primary key,
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  updated_at timestamptz not null default now(),
  synced_at timestamptz not null default now(),
  deleted boolean not null default false,
  date date not null,
  split_id uuid,
  name text,
  entries jsonb not null default '[]',
  started_at timestamptz,
  finished_at timestamptz
);

create table if not exists public.prefs (
  id uuid primary key,
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  updated_at timestamptz not null default now(),
  synced_at timestamptz not null default now(),
  deleted boolean not null default false,
  data jsonb not null default '{}'
);

do $$
declare
  t text;
begin
  foreach t in array array['projects','labels','tasks','meals','meal_logs','day_logs','splits','workout_logs','prefs']
  loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists "own rows" on public.%I', t);
    execute format('create policy "own rows" on public.%I for all to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()))', t);
    execute format('drop trigger if exists touch_synced on public.%I', t);
    execute format('create trigger touch_synced before insert or update on public.%I for each row execute function public.pucs_touch_synced()', t);
    execute format('create index if not exists %I on public.%I (user_id, synced_at)', t || '_user_synced_idx', t);
    execute format('grant select, insert, update, delete on public.%I to authenticated', t);
    execute format('revoke all on public.%I from anon', t);
  end loop;
end $$;

-- Financeiro (26/10/2026)
create table if not exists public.transactions (
  id uuid primary key,
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  updated_at timestamptz not null default now(),
  synced_at timestamptz not null default now(),
  deleted boolean not null default false,
  date date not null,
  description text not null,
  amount numeric not null,
  account text not null,
  kind text not null,
  category text not null,
  installment text,
  merchant text,
  oneoff boolean not null default false,
  note text
);
alter table public.transactions enable row level security;
drop policy if exists "own rows" on public.transactions;
create policy "own rows" on public.transactions for all to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
drop trigger if exists touch_synced on public.transactions;
create trigger touch_synced before insert or update on public.transactions for each row execute function public.pucs_touch_synced();
create index if not exists transactions_user_synced_idx on public.transactions (user_id, synced_at);
grant select, insert, update, delete on public.transactions to authenticated;
revoke all on public.transactions from anon;

-- Notificações e lembretes (26/10/2026)
alter table public.tasks add column if not exists reminder_at timestamptz;

create table if not exists public.push_subs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  ua text,
  created_at timestamptz not null default now()
);
alter table public.push_subs enable row level security;
drop policy if exists "own subs" on public.push_subs;
create policy "own subs" on public.push_subs for all to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
grant select, insert, update, delete on public.push_subs to authenticated;
revoke all on public.push_subs from anon;

-- configuração pública (chave VAPID pública) e segredos só do servidor (sem policy = só service role)
create table if not exists public.app_config (key text primary key, value text not null);
alter table public.app_config enable row level security;
drop policy if exists "read config" on public.app_config;
create policy "read config" on public.app_config for select to authenticated using (true);
grant select on public.app_config to authenticated;
revoke all on public.app_config from anon;

create table if not exists public.app_secrets (key text primary key, value text not null);
alter table public.app_secrets enable row level security;
revoke all on public.app_secrets from anon, authenticated;

create table if not exists public.notify_log (
  user_id uuid not null references auth.users on delete cascade,
  key text not null,
  sent_at timestamptz not null default now(),
  primary key (user_id, key)
);
alter table public.notify_log enable row level security;
revoke all on public.notify_log from anon, authenticated;

create extension if not exists pg_cron;
create extension if not exists pg_net;

-- Disparo das notificações: a cada minuto chama a função "notify" (código em supabase/functions/notify).
-- A função fica com a verificação de JWT ligada; o apikey público passa pelo gateway e o x-cron-secret
-- (gerado pela própria função em app_secrets) autoriza o modo cron.
select cron.schedule('pucs-notify', '* * * * *', $job$
  select net.http_post(
    url := 'https://SEU-PROJETO.supabase.co/functions/v1/notify',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'apikey', 'SUA-CHAVE-PUBLICA',
      'x-cron-secret', (select value from public.app_secrets where key = 'cron_secret')
    ),
    body := '{"action":"cron"}'::jsonb,
    timeout_milliseconds := 20000
  );
$job$);
