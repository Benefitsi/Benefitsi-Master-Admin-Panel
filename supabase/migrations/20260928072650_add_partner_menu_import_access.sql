-- Keep entitlements outside the partner profile, which owners can edit.
-- No rows are seeded: every partner starts with the feature disabled.
create table public.partner_feature_flags (
  partner_id uuid not null references public.partners(id) on delete cascade,
  feature_key text not null check (feature_key in ('menu_ai_import')),
  enabled boolean not null default false,
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id) on delete set null,
  primary key (partner_id, feature_key)
);

alter table public.partner_feature_flags enable row level security;
revoke all on public.partner_feature_flags from public, anon, authenticated;
grant select, insert, update on public.partner_feature_flags to authenticated;

create policy admin_manage_partner_features on public.partner_feature_flags
  for all to authenticated
  using ((select public.is_admin()))
  with check ((select public.is_admin()));

create policy owner_read_partner_features on public.partner_feature_flags
  for select to authenticated
  using (public.owns_partner(partner_id));

-- Existing admin/public policies remain in place. Only explicitly enabled owners
-- gain menu access; staff membership alone is insufficient. The same live flag
-- is used by the server actions before both recognition and confirmation.
create policy enabled_owner_manage_menus on public.menus
  for all to authenticated
  using (
    public.owns_partner(partner_id)
    and exists (select 1 from public.partner_feature_flags f
      where f.partner_id = menus.partner_id and f.feature_key = 'menu_ai_import' and f.enabled)
  )
  with check (
    public.owns_partner(partner_id)
    and exists (select 1 from public.partner_feature_flags f
      where f.partner_id = menus.partner_id and f.feature_key = 'menu_ai_import' and f.enabled)
  );

create policy enabled_owner_manage_menu_categories on public.menu_categories
  for all to authenticated
  using (exists (
    select 1 from public.menus m join public.partner_feature_flags f on f.partner_id = m.partner_id
    where m.id = menu_categories.menu_id and public.owns_partner(m.partner_id)
      and f.feature_key = 'menu_ai_import' and f.enabled
  ))
  with check (exists (
    select 1 from public.menus m join public.partner_feature_flags f on f.partner_id = m.partner_id
    where m.id = menu_categories.menu_id and public.owns_partner(m.partner_id)
      and f.feature_key = 'menu_ai_import' and f.enabled
  ));

create policy enabled_owner_manage_menu_items on public.menu_items
  for all to authenticated
  using (exists (
    select 1 from public.menus m join public.partner_feature_flags f on f.partner_id = m.partner_id
    where m.id = menu_items.menu_id and public.owns_partner(m.partner_id)
      and f.feature_key = 'menu_ai_import' and f.enabled
  ))
  with check (
    exists (
      select 1 from public.menus m join public.partner_feature_flags f on f.partner_id = m.partner_id
      where m.id = menu_items.menu_id and public.owns_partner(m.partner_id)
        and f.feature_key = 'menu_ai_import' and f.enabled
    )
    and (category_id is null or exists (
      select 1 from public.menu_categories c
      where c.id = menu_items.category_id and c.menu_id = menu_items.menu_id
    ))
  );
