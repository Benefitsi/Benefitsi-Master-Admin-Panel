-- P1 Welle 2B.1: structured City Editor surfaces.
-- This table stores editorial configuration only. Entity content continues to
-- live in the existing city tables and the Media Library remains the single
-- source of truth for media assignments.
create table if not exists public.city_page_configs (
  id uuid primary key default gen_random_uuid(),
  city_id uuid not null references public.cities(id) on delete cascade,
  scope_type text not null check (scope_type in ('HOMEPAGE', 'HUB', 'COLLECTION', 'NAVIGATION')),
  scope_key text not null check (length(btrim(scope_key)) between 1 and 120),
  status text not null default 'ACTIVE' check (status in ('ACTIVE', 'DRAFT', 'ARCHIVED')),
  title text,
  subtitle text,
  description text,
  eyebrow text,
  seo_title text,
  seo_description text,
  hero_image_alt text,
  primary_cta_label text,
  primary_cta_target jsonb,
  featured_refs jsonb not null default '[]'::jsonb,
  related_collection_slugs text[] not null default '{}'::text[],
  guide_relation_ids uuid[] not null default '{}'::uuid[],
  filter_visibility jsonb not null default '{}'::jsonb,
  section_visibility jsonb not null default '{}'::jsonb,
  navigation_items jsonb not null default '[]'::jsonb,
  index_policy text not null default 'index' check (index_policy in ('index', 'noindex')),
  updated_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (city_id, scope_type, scope_key)
);

create index if not exists city_page_configs_city_scope_idx
  on public.city_page_configs(city_id, scope_type, scope_key);

alter table public.city_page_configs enable row level security;
revoke all on public.city_page_configs from anon, authenticated;
grant select on public.city_page_configs to anon, authenticated;
grant all on public.city_page_configs to service_role;

drop policy if exists city_page_configs_public_read on public.city_page_configs;
create policy city_page_configs_public_read
  on public.city_page_configs
  for select
  to anon, authenticated
  using (status = 'ACTIVE');

drop policy if exists city_page_configs_admin on public.city_page_configs;
create policy city_page_configs_admin
  on public.city_page_configs
  for all
  to authenticated
  using ((select public.is_admin()))
  with check ((select public.is_admin()));

comment on table public.city_page_configs is
  'Structured editorial configuration for the shared City homepage, hubs, collections and navigation. Public source of truth after an admin save; code config remains compatibility fallback.';
comment on column public.city_page_configs.featured_refs is
  'Validated entity references in editorial order. Values are selected through the City Editor, never entered as arbitrary IDs.';
comment on column public.city_page_configs.navigation_items is
  'Validated overrides for the shared desktop/mobile navigation source.';
