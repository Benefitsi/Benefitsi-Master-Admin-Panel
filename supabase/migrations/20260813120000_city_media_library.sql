-- City Media Library / manual media control
--
-- This migration intentionally keeps legacy image_url/hero_image_url fields
-- intact. The public resolver reads this catalog first and falls back to those
-- fields until every existing asset has been curated in the library.

do $$
begin
  if not exists (
    select 1 from pg_type where typname = 'city_media_source_type'
  ) then
    create type public.city_media_source_type as enum (
      'MANUAL_UPLOAD',
      'PARTNER_UPLOAD',
      'OFFICIAL_SOURCE',
      'TOURISM_SOURCE',
      'AGENT_DISCOVERED',
      'EXISTING_ASSET',
      'FALLBACK'
    );
  end if;

  if not exists (
    select 1 from pg_type where typname = 'city_media_status'
  ) then
    create type public.city_media_status as enum (
      'DRAFT',
      'REVIEW',
      'PUBLISHED',
      'ARCHIVED',
      'REJECTED'
    );
  end if;

  if not exists (
    select 1 from pg_type where typname = 'city_media_entity_type'
  ) then
    create type public.city_media_entity_type as enum (
      'CITY',
      'PLACE',
      'BUSINESS',
      'PARTNER_LOCATION',
      'EVENT',
      'ROUTE',
      'GUIDE',
      'COLLECTION',
      'HUB',
      'CITY_HOMEPAGE'
    );
  end if;

  if not exists (
    select 1 from pg_type where typname = 'city_media_role'
  ) then
    create type public.city_media_role as enum (
      'HERO',
      'CARD',
      'GALLERY',
      'THUMBNAIL',
      'OG',
      'SECTION',
      'BACKGROUND'
    );
  end if;
end;
$$;

create table if not exists public.city_media_assets (
  id uuid primary key default gen_random_uuid(),
  city_id uuid references public.cities(id) on delete set null,
  storage_bucket text not null default 'city-media',
  storage_path text,
  public_url text not null,
  media_type text not null default 'image',
  mime_type text not null,
  width integer,
  height integer,
  file_size_bytes bigint,
  content_hash text,
  title text,
  alt_text text,
  photographer text,
  copyright_holder text,
  license text,
  license_url text,
  source_type public.city_media_source_type not null default 'MANUAL_UPLOAD',
  source_url text,
  provenance_note text,
  status public.city_media_status not null default 'DRAFT',
  created_by uuid,
  updated_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint city_media_assets_url_not_blank check (length(btrim(public_url)) > 0),
  constraint city_media_assets_path_not_blank check (storage_path is null or length(btrim(storage_path)) > 0),
  constraint city_media_assets_media_type check (media_type in ('image', 'video')),
  constraint city_media_assets_dimensions check (
    (width is null and height is null) or (width > 0 and height > 0)
  ),
  constraint city_media_assets_file_size check (file_size_bytes is null or file_size_bytes > 0),
  constraint city_media_assets_hash_not_blank check (content_hash is null or length(btrim(content_hash)) > 0)
);

create table if not exists public.city_media_assignments (
  id uuid primary key default gen_random_uuid(),
  city_id uuid not null references public.cities(id) on delete cascade,
  media_asset_id uuid not null references public.city_media_assets(id) on delete restrict,
  entity_type public.city_media_entity_type not null,
  entity_id uuid,
  entity_key text,
  role public.city_media_role not null,
  sort_order integer not null default 0,
  is_primary boolean not null default false,
  manual_lock boolean not null default false,
  focal_x numeric(5,4) not null default 0.5,
  focal_y numeric(5,4) not null default 0.5,
  desktop_focal_x numeric(5,4),
  desktop_focal_y numeric(5,4),
  mobile_focal_x numeric(5,4),
  mobile_focal_y numeric(5,4),
  created_by uuid,
  updated_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint city_media_assignments_entity_ref check (
    entity_id is not null or (entity_key is not null and length(btrim(entity_key)) > 0)
  ),
  constraint city_media_assignments_sort_order check (sort_order >= 0),
  constraint city_media_assignments_focal_x check (focal_x between 0 and 1),
  constraint city_media_assignments_focal_y check (focal_y between 0 and 1),
  constraint city_media_assignments_desktop_focal_x check (desktop_focal_x is null or desktop_focal_x between 0 and 1),
  constraint city_media_assignments_desktop_focal_y check (desktop_focal_y is null or desktop_focal_y between 0 and 1),
  constraint city_media_assignments_mobile_focal_x check (mobile_focal_x is null or mobile_focal_x between 0 and 1),
  constraint city_media_assignments_mobile_focal_y check (mobile_focal_y is null or mobile_focal_y between 0 and 1)
);

create table if not exists public.city_media_audit (
  id uuid primary key default gen_random_uuid(),
  city_id uuid references public.cities(id) on delete set null,
  media_asset_id uuid references public.city_media_assets(id) on delete set null,
  assignment_id uuid references public.city_media_assignments(id) on delete set null,
  actor_id uuid,
  actor_email text,
  action text not null,
  entity_type public.city_media_entity_type,
  entity_id uuid,
  entity_key text,
  role public.city_media_role,
  previous_state jsonb,
  next_state jsonb,
  created_at timestamptz not null default now(),
  constraint city_media_audit_action check (
    action in (
      'UPLOAD', 'UPDATE_METADATA', 'ASSIGN', 'UNASSIGN', 'REORDER',
      'LOCK', 'UNLOCK', 'REPLACE', 'ROLE_CHANGE', 'FOCAL_POINT',
      'ARCHIVE', 'DELETE_BLOCKED'
    )
  )
);

create index if not exists city_media_assets_city_status_idx
  on public.city_media_assets(city_id, status, updated_at desc);
create index if not exists city_media_assets_hash_idx
  on public.city_media_assets(content_hash)
  where content_hash is not null;
create index if not exists city_media_assignments_lookup_idx
  on public.city_media_assignments(city_id, entity_type, role, sort_order);
create index if not exists city_media_assignments_asset_idx
  on public.city_media_assignments(media_asset_id);
create index if not exists city_media_audit_asset_idx
  on public.city_media_audit(media_asset_id, created_at desc);

create unique index if not exists city_media_assignments_entity_id_role_uidx
  on public.city_media_assignments(city_id, entity_type, entity_id, role)
  where entity_id is not null and role <> 'GALLERY';
create unique index if not exists city_media_assignments_entity_key_role_uidx
  on public.city_media_assignments(city_id, entity_type, entity_key, role)
  where entity_id is null and entity_key is not null and role <> 'GALLERY';

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'city-media',
  'city-media',
  true,
  10485760,
  array['image/jpeg', 'image/png', 'image/webp', 'image/avif']::text[]
)
on conflict (id) do update set
  name = excluded.name,
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

alter table public.city_media_assets enable row level security;
alter table public.city_media_assignments enable row level security;
alter table public.city_media_audit enable row level security;

grant select on public.city_media_assets to anon, authenticated;
grant select on public.city_media_assignments to anon, authenticated;
grant all on public.city_media_assets to service_role;
grant all on public.city_media_assignments to service_role;
grant all on public.city_media_audit to service_role;

drop policy if exists city_media_assets_public_read on public.city_media_assets;
create policy city_media_assets_public_read
  on public.city_media_assets
  for select
  to anon, authenticated
  using (status = 'PUBLISHED' or (select public.is_admin()));

drop policy if exists city_media_assets_admin_write on public.city_media_assets;
create policy city_media_assets_admin_write
  on public.city_media_assets
  for all
  to authenticated
  using ((select public.is_admin()))
  with check ((select public.is_admin()));

drop policy if exists city_media_assignments_public_read on public.city_media_assignments;
create policy city_media_assignments_public_read
  on public.city_media_assignments
  for select
  to anon, authenticated
  using (
    exists (
      select 1
      from public.city_media_assets asset
      where asset.id = media_asset_id
        and (asset.status = 'PUBLISHED' or (select public.is_admin()))
    )
  );

drop policy if exists city_media_assignments_admin_write on public.city_media_assignments;
create policy city_media_assignments_admin_write
  on public.city_media_assignments
  for all
  to authenticated
  using ((select public.is_admin()))
  with check ((select public.is_admin()));

drop policy if exists city_media_audit_admin_read on public.city_media_audit;
create policy city_media_audit_admin_read
  on public.city_media_audit
  for select
  to authenticated
  using ((select public.is_admin()));

drop policy if exists city_media_audit_admin_write on public.city_media_audit;
create policy city_media_audit_admin_write
  on public.city_media_audit
  for insert
  to authenticated
  with check ((select public.is_admin()));

drop policy if exists city_media_public_download on storage.objects;
create policy city_media_public_download
  on storage.objects
  for select
  to anon, authenticated
  using (bucket_id = 'city-media');

drop policy if exists city_media_admin_storage on storage.objects;
create policy city_media_admin_storage
  on storage.objects
  for all
  to authenticated
  using (bucket_id = 'city-media' and (select public.is_admin()))
  with check (bucket_id = 'city-media' and (select public.is_admin()));

comment on table public.city_media_assets is
  'Canonical city media catalog. Legacy image URL fields remain compatibility-read until migrated.';
comment on table public.city_media_assignments is
  'Role-scoped media assignments. manual_lock prevents later automated replacement for this role only.';
comment on table public.city_media_audit is
  'Audit trail for city media uploads, metadata changes and role assignments.';
