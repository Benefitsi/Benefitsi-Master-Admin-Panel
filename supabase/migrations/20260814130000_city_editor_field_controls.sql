-- City Editor: field-level editorial controls and audit trail.
-- Content remains in the existing city tables. This table only stores the
-- maintenance mode for a field; it never duplicates the public field value.

create table if not exists public.city_content_field_controls (
  id uuid primary key default gen_random_uuid(),
  city_id uuid not null references public.cities(id) on delete cascade,
  entity_type text not null check (
    entity_type in (
      'CITY_HOMEPAGE', 'PLACE', 'EVENT', 'ROUTE', 'GUIDE',
      'PLAYGROUND', 'CLUB', 'CHALLENGE', 'BENEFIT', 'BUSINESS',
      'COLLECTION', 'HUB', 'EDITORIAL_ARTICLE', 'COMMUNITY', 'CITY_STAMP'
    )
  ),
  entity_id uuid not null,
  field_path text not null check (length(btrim(field_path)) between 1 and 180),
  mode text not null default 'AUTO' check (mode in ('AUTO', 'MANUAL', 'LOCKED')),
  reason text,
  updated_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (city_id, entity_type, entity_id, field_path)
);

create index if not exists city_content_field_controls_entity_idx
  on public.city_content_field_controls(city_id, entity_type, entity_id);

alter table public.city_content_field_controls enable row level security;
revoke all on public.city_content_field_controls from anon, authenticated;
grant all on public.city_content_field_controls to service_role;

drop policy if exists city_content_field_controls_admin on public.city_content_field_controls;
create policy city_content_field_controls_admin
  on public.city_content_field_controls
  for all
  to authenticated
  using ((select public.is_admin()))
  with check ((select public.is_admin()));

-- SEO overrides are part of the existing entity records, just like title and
-- description. The public City System reads these values through its normal
-- content source; no second CMS payload is introduced.
alter table public.city_events add column if not exists seo_title text;
alter table public.city_events add column if not exists seo_description text;
alter table public.city_places add column if not exists seo_title text;
alter table public.city_places add column if not exists seo_description text;
alter table public.city_routes add column if not exists seo_title text;
alter table public.city_routes add column if not exists seo_description text;
alter table public.city_guides add column if not exists seo_title text;
alter table public.city_guides add column if not exists seo_description text;
alter table public.city_playgrounds add column if not exists seo_title text;
alter table public.city_playgrounds add column if not exists seo_description text;
alter table public.city_clubs add column if not exists seo_title text;
alter table public.city_clubs add column if not exists seo_description text;
alter table public.city_challenges add column if not exists seo_title text;
alter table public.city_challenges add column if not exists seo_description text;
alter table public.city_partner_benefits add column if not exists seo_title text;
alter table public.city_partner_benefits add column if not exists seo_description text;

-- Keep relation fields in the existing guide model. The editor only stores
-- UUID references; guide content itself remains in city_guides.
alter table public.city_guides
  add column if not exists related_guide_ids uuid[] not null default '{}';

-- The established review audit is still the audit source for content edits.
-- Add a specific action so field-level changes are distinguishable from the
-- review reset that follows every manual save.
alter table public.city_content_review_audit
  drop constraint if exists city_content_review_audit_action_check;
alter table public.city_content_review_audit
  add constraint city_content_review_audit_action_check check (
    action = any (array[
      'draft_discovered', 'manual_edit', 'agent_reviewed',
      'correction_requested', 'rejected', 'published', 'archived'
    ])
  );

-- City homepages do not have a content review row. Keep their audit trail in
-- a small generic audit table rather than manufacturing a fake review.
create table if not exists public.city_editor_audit (
  id uuid primary key default gen_random_uuid(),
  city_id uuid not null references public.cities(id) on delete cascade,
  entity_type text not null,
  entity_id uuid not null,
  field_path text not null,
  action text not null check (action in ('SAVE', 'MODE_CHANGE', 'RESTORE')),
  before_value jsonb,
  after_value jsonb,
  mode_before text check (mode_before is null or mode_before in ('AUTO', 'MANUAL', 'LOCKED')),
  mode_after text check (mode_after is null or mode_after in ('AUTO', 'MANUAL', 'LOCKED')),
  actor_id uuid,
  actor_profile text,
  reason text,
  created_at timestamptz not null default now()
);

create index if not exists city_editor_audit_entity_idx
  on public.city_editor_audit(city_id, entity_type, entity_id, created_at desc);

alter table public.city_editor_audit enable row level security;
revoke all on public.city_editor_audit from anon, authenticated;
grant all on public.city_editor_audit to service_role;

drop policy if exists city_editor_audit_admin on public.city_editor_audit;
create policy city_editor_audit_admin
  on public.city_editor_audit
  for all
  to authenticated
  using ((select public.is_admin()))
  with check ((select public.is_admin()));

comment on table public.city_content_field_controls is
  'Field maintenance mode only. AUTO, MANUAL and LOCKED never duplicate the entity value.';
comment on table public.city_editor_audit is
  'Audit trail for City Editor changes that do not belong to a content review row, such as city homepage profile edits.';
