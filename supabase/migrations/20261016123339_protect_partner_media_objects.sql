-- Public partner and menu media are immutable for RLS-bound clients. A saved
-- draft, published version, partner field or historical version can retain any
-- object path; an editor-visible reference scan cannot prove it is unused.
-- New object INSERTs, reads and every other bucket keep their existing policies.
-- This does not affect service_role/BYPASSRLS or direct privileged operations.
do $$
begin
  if not (select relrowsecurity from pg_catalog.pg_class
    where oid = 'storage.objects'::pg_catalog.regclass) then
    raise exception 'storage.objects RLS must be enabled before media guard';
  end if;
end;
$$;

drop policy if exists partner_media_immutable_update on storage.objects;
create policy partner_media_immutable_update on storage.objects
  as restrictive for update to public
  using (bucket_id not in ('partner-assets', 'menu-videos'))
  with check (bucket_id not in ('partner-assets', 'menu-videos'));

drop policy if exists partner_media_immutable_delete on storage.objects;
create policy partner_media_immutable_delete on storage.objects
  as restrictive for delete to public
  using (bucket_id not in ('partner-assets', 'menu-videos'));
