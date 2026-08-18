-- Tighten the City Media policies after the initial library rollout.
-- Public SELECT remains the read path; admin writes are split by operation so
-- authenticated non-admin reads do not pay for an overlapping FOR ALL policy.

create index if not exists city_media_audit_assignment_idx
  on public.city_media_audit(assignment_id, created_at desc)
  where assignment_id is not null;

create index if not exists city_media_audit_city_idx
  on public.city_media_audit(city_id, created_at desc)
  where city_id is not null;

alter table public.city_media_audit
  drop constraint if exists city_media_audit_action;
alter table public.city_media_audit
  add constraint city_media_audit_action check (
    action in (
      'UPLOAD', 'UPDATE_METADATA', 'ASSIGN', 'UNASSIGN', 'REORDER',
      'LOCK', 'UNLOCK', 'REPLACE', 'ROLE_CHANGE', 'FOCAL_POINT',
      'ARCHIVE', 'DELETE_BLOCKED'
    )
  );

drop policy if exists city_media_assets_admin_write on public.city_media_assets;
create policy city_media_assets_admin_insert
  on public.city_media_assets
  for insert
  to authenticated
  with check ((select public.is_admin()));

create policy city_media_assets_admin_update
  on public.city_media_assets
  for update
  to authenticated
  using ((select public.is_admin()))
  with check ((select public.is_admin()));

create policy city_media_assets_admin_delete
  on public.city_media_assets
  for delete
  to authenticated
  using ((select public.is_admin()));

drop policy if exists city_media_assignments_admin_write on public.city_media_assignments;
create policy city_media_assignments_admin_insert
  on public.city_media_assignments
  for insert
  to authenticated
  with check ((select public.is_admin()));

create policy city_media_assignments_admin_update
  on public.city_media_assignments
  for update
  to authenticated
  using ((select public.is_admin()))
  with check ((select public.is_admin()));

create policy city_media_assignments_admin_delete
  on public.city_media_assignments
  for delete
  to authenticated
  using ((select public.is_admin()));

drop policy if exists city_media_admin_storage on storage.objects;
create policy city_media_admin_storage_insert
  on storage.objects
  for insert
  to authenticated
  with check (bucket_id = 'city-media' and (select public.is_admin()));

create policy city_media_admin_storage_update
  on storage.objects
  for update
  to authenticated
  using (bucket_id = 'city-media' and (select public.is_admin()))
  with check (bucket_id = 'city-media' and (select public.is_admin()));

create policy city_media_admin_storage_delete
  on storage.objects
  for delete
  to authenticated
  using (bucket_id = 'city-media' and (select public.is_admin()));
