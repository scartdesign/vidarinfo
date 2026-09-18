-- VIDAR Info initial content schema
-- Public health-content database only. No personal health search history is stored.

create extension if not exists pgcrypto;

create table if not exists public.app_meta (
  key text primary key,
  value jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

create table if not exists public.health_topics (
  id text primary key,
  title text not null,
  category text,
  aliases text[] not null default '{}',
  content jsonb not null default '{}'::jsonb,
  is_published boolean not null default true,
  updated_at timestamptz not null default now()
);

create table if not exists public.medicines (
  id text primary key,
  name text not null,
  active_ingredient text,
  group_name text,
  aliases text[] not null default '{}',
  content jsonb not null default '{}'::jsonb,
  is_published boolean not null default true,
  updated_at timestamptz not null default now()
);

create table if not exists public.natural_claims (
  id text primary key,
  name text not null,
  group_name text,
  aliases text[] not null default '{}',
  evidence_status text check (evidence_status in ('supported','limited','none','avoid')),
  content jsonb not null default '{}'::jsonb,
  is_published boolean not null default true,
  updated_at timestamptz not null default now()
);

create table if not exists public.source_mentions (
  id uuid primary key default gen_random_uuid(),
  topic_id text references public.health_topics(id) on delete set null,
  natural_id text references public.natural_claims(id) on delete set null,
  platform text not null,
  url text,
  title text,
  excerpt text,
  published_at timestamptz,
  captured_at timestamptz not null default now(),
  raw jsonb not null default '{}'::jsonb,
  is_public boolean not null default true
);

create index if not exists health_topics_category_idx on public.health_topics(category);
create index if not exists health_topics_aliases_gin on public.health_topics using gin(aliases);
create index if not exists medicines_group_idx on public.medicines(group_name);
create index if not exists medicines_aliases_gin on public.medicines using gin(aliases);
create index if not exists natural_claims_group_idx on public.natural_claims(group_name);
create index if not exists natural_claims_aliases_gin on public.natural_claims using gin(aliases);
create index if not exists source_mentions_topic_idx on public.source_mentions(topic_id);
create index if not exists source_mentions_natural_idx on public.source_mentions(natural_id);
create index if not exists source_mentions_captured_idx on public.source_mentions(captured_at desc);

alter table public.app_meta enable row level security;
alter table public.health_topics enable row level security;
alter table public.medicines enable row level security;
alter table public.natural_claims enable row level security;
alter table public.source_mentions enable row level security;

drop policy if exists "public read app meta" on public.app_meta;
create policy "public read app meta" on public.app_meta for select to anon, authenticated using (true);

drop policy if exists "public read published topics" on public.health_topics;
create policy "public read published topics" on public.health_topics for select to anon, authenticated using (is_published);

drop policy if exists "public read published medicines" on public.medicines;
create policy "public read published medicines" on public.medicines for select to anon, authenticated using (is_published);

drop policy if exists "public read published natural claims" on public.natural_claims;
create policy "public read published natural claims" on public.natural_claims for select to anon, authenticated using (is_published);

drop policy if exists "public read public source mentions" on public.source_mentions;
create policy "public read public source mentions" on public.source_mentions for select to anon, authenticated using (is_public);

insert into public.app_meta(key,value)
values ('content_version','{"version":"2026.09.18-prod-4"}'::jsonb)
on conflict (key) do update set value=excluded.value, updated_at=now();
