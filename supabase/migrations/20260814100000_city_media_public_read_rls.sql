-- Keep public city media reads independent from the admin authorization helper.
-- `anon` intentionally cannot execute public.is_admin(); putting that helper in
-- the same public-read predicate makes published media return 401 instead of
-- the rows that are safe to expose.

drop policy if exists city_media_assets_public_read on public.city_media_assets;
create policy city_media_assets_public_read
  on public.city_media_assets
  for select
  to anon, authenticated
  using (status = 'PUBLISHED');

drop policy if exists city_media_assets_admin_read on public.city_media_assets;
create policy city_media_assets_admin_read
  on public.city_media_assets
  for select
  to authenticated
  using ((select public.is_admin()));

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
        and asset.status = 'PUBLISHED'
    )
  );

drop policy if exists city_media_assignments_admin_read on public.city_media_assignments;
create policy city_media_assignments_admin_read
  on public.city_media_assignments
  for select
  to authenticated
  using ((select public.is_admin()));
