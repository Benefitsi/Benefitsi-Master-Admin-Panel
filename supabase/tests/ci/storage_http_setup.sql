-- Run only against the disposable PostgreSQL service after the official
-- Storage API has installed its own storage schema and roles.
insert into storage.buckets (id, name, public)
values ('partner-assets', 'partner-assets', true),
       ('menu-videos', 'menu-videos', true),
       ('ci-other-media', 'ci-other-media', true);

grant usage on schema storage to authenticated;
grant select on storage.buckets to authenticated;
grant select, insert, update, delete on storage.objects to authenticated;

create policy ci_bucket_read on storage.buckets
  for select to authenticated using (true);
-- Deliberately permissive legacy-style object access. The real restrictive
-- migration must close UPDATE and DELETE for the two protected buckets.
create policy ci_object_all on storage.objects
  for all to authenticated
  using (bucket_id in ('partner-assets', 'menu-videos', 'ci-other-media'))
  with check (bucket_id in ('partner-assets', 'menu-videos', 'ci-other-media'));
