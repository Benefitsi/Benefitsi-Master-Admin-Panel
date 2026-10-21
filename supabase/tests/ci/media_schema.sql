-- Disposable PostgreSQL 17 CI scaffold. Synthetic rows only; no Supabase
-- project connection, Storage API or production credentials are involved.
-- Roles are cluster-wide, while this fixture is loaded into three databases.
do $$
begin
  if not exists (select 1 from pg_catalog.pg_roles where rolname = 'anon') then
    create role anon nologin;
  end if;
  if not exists (select 1 from pg_catalog.pg_roles where rolname = 'authenticated') then
    create role authenticated nologin;
  end if;
  if not exists (select 1 from pg_catalog.pg_roles where rolname = 'service_role') then
    create role service_role nologin bypassrls;
  end if;
end;
$$;
create schema auth;
create schema storage;
create schema private;

create function auth.uid() returns uuid language sql stable as $$
  select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
$$;
create function auth.role() returns text language sql stable as $$
  select nullif(current_setting('request.jwt.claim.role', true), '')
$$;
create table auth.users(id uuid primary key, email text);
create table public.users(id uuid primary key, is_admin boolean not null default false);

create table public.partners (
  id uuid primary key, name text not null, slug text not null,
  category text[], stamp_target integer, status text, is_active boolean,
  logo_url text, feature_card_url text, discover_card_image_url text,
  cover_urls text[], reward_text_primary text, reward_text_secondary text,
  external_ordering_url text, updated_at timestamptz default clock_timestamp()
);
create table public.deals (
  id uuid primary key, partner_id uuid references public.partners(id),
  updated_at timestamptz default clock_timestamp(), stock_remaining integer
);
create table public.partner_reward_milestones (
  id uuid primary key, partner_id uuid references public.partners(id),
  updated_at timestamptz default clock_timestamp(), stock_remaining integer
);
create table public.menus (
  id uuid primary key, partner_id uuid not null references public.partners(id),
  name text not null, status text not null
);
create table public.menu_categories (
  id uuid primary key, menu_id uuid not null references public.menus(id) on delete cascade,
  name text not null, slug text not null, image_url text
);
create table public.menu_items (
  id uuid primary key, menu_id uuid not null references public.menus(id) on delete cascade,
  category_id uuid references public.menu_categories(id) on delete cascade,
  name text not null, price numeric not null, image_url text, video_url text
);
create table public.microsites (
  id uuid primary key, partner_id uuid not null references public.partners(id),
  slug text not null, status text default 'draft', published_version_id uuid
);
create table public.microsite_versions (
  id uuid primary key,
  microsite_id uuid not null references public.microsites(id) on delete cascade,
  version_number integer not null, status text not null, config jsonb not null
);

create table storage.objects (
  bucket_id text not null, name text not null, primary key (bucket_id, name)
);
alter table storage.objects enable row level security;
-- Deliberately broad existing permission models stress the RESTRICTIVE guard.
-- These synthetic policies are not assertions about the live policy bodies.
create policy ci_existing_partner_all on storage.objects
  for all to authenticated
  using (bucket_id = 'partner-assets')
  with check (bucket_id = 'partner-assets');
create policy ci_existing_menu_delete on storage.objects
  for delete to authenticated using (bucket_id = 'menu-videos');
create policy ci_existing_menu_insert on storage.objects
  for insert to authenticated with check (bucket_id = 'menu-videos');
create policy ci_existing_menu_select on storage.objects
  for select to authenticated using (bucket_id = 'menu-videos');
create policy ci_existing_other_all on storage.objects
  for all to authenticated using (bucket_id in ('city-media', 'city-memory-stamps'))
  with check (bucket_id in ('city-media', 'city-memory-stamps'));

grant usage on schema public to authenticated;
grant select, update on public.partners to authenticated;
