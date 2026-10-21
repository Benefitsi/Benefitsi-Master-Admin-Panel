-- Run after 20261016123339_protect_partner_media_objects.sql with
-- psql -v ON_ERROR_STOP=1. The transaction contains only a temporary probe;
-- it never writes storage.objects or actual Storage bytes.
begin;

do $test$
declare p record; result boolean; bucket text;
begin
  if not (select relrowsecurity from pg_catalog.pg_class
    where oid = 'storage.objects'::pg_catalog.regclass) then
    raise exception 'storage.objects RLS is disabled';
  end if;
  if (select count(*) from pg_catalog.pg_policies
      where schemaname = 'storage' and tablename = 'objects'
        and policyname in ('partner_media_immutable_update',
          'partner_media_immutable_delete')) is distinct from 2 then
    raise exception 'both storage media guards are required';
  end if;
  for p in select * from pg_catalog.pg_policies
    where schemaname = 'storage' and tablename = 'objects'
      and policyname in ('partner_media_immutable_update',
        'partner_media_immutable_delete')
  loop
    if p.permissive is distinct from 'RESTRICTIVE'
      or p.roles is distinct from array['public']::name[]
      or (p.policyname = 'partner_media_immutable_update' and
        (p.cmd is distinct from 'UPDATE' or p.with_check is null))
      or (p.policyname = 'partner_media_immutable_delete' and
        (p.cmd is distinct from 'DELETE' or p.with_check is not null))
    then raise exception 'storage guard has wrong scope or mode: %', p.policyname; end if;
    foreach bucket in array array['partner-assets', 'menu-videos',
      'city-media', 'city-memory-stamps'] loop
      execute pg_catalog.format('select (%s) from (values (%L)) as objects(bucket_id)',
        p.qual, bucket) into result;
      if result is distinct from (bucket not in ('partner-assets', 'menu-videos')) then
        raise exception 'storage guard % gave wrong result for %', p.policyname, bucket;
      end if;
      if p.with_check is not null then
        execute pg_catalog.format('select (%s) from (values (%L)) as objects(bucket_id)',
          p.with_check, bucket) into result;
        if result is distinct from (bucket not in ('partner-assets', 'menu-videos')) then
          raise exception 'storage update WITH CHECK gave wrong result for %', bucket;
        end if;
      end if;
    end loop;
  end loop;

  create temporary table media_guard_probe (
    bucket_id text not null, name text not null,
    changed boolean not null default false,
    primary key (bucket_id, name)
  );
  insert into media_guard_probe(bucket_id, name) values
    ('partner-assets', 'referenced-image.png'),
    ('menu-videos', 'referenced-video.mp4'),
    ('city-media', 'city-image.png'),
    ('city-memory-stamps', 'private-memory.png');
  alter table media_guard_probe enable row level security;
  grant select, insert, update, delete on media_guard_probe to anon, authenticated;
  create policy probe_allow_existing on media_guard_probe
    as permissive for all to public using (true) with check (true);
  select * into p from pg_catalog.pg_policies
    where schemaname = 'storage' and tablename = 'objects'
      and policyname = 'partner_media_immutable_update';
  execute pg_catalog.format(
    'create policy probe_update_guard on media_guard_probe as restrictive for update to public using (%s) with check (%s)',
    p.qual, p.with_check);
  select * into p from pg_catalog.pg_policies
    where schemaname = 'storage' and tablename = 'objects'
      and policyname = 'partner_media_immutable_delete';
  execute pg_catalog.format(
    'create policy probe_delete_guard on media_guard_probe as restrictive for delete to public using (%s)',
    p.qual);
end
$test$;

set local role authenticated;
do $test$
declare affected bigint;
begin
  -- Fresh immutable objects stay insertable even via an upsert statement.
  insert into pg_temp.media_guard_probe(bucket_id, name) values
    ('partner-assets', 'new-image.png'),
    ('menu-videos', 'new-video.mp4')
    on conflict (bucket_id, name) do update set changed = true;
  get diagnostics affected = row_count;
  if affected is distinct from 2 then raise exception 'new uploads were blocked'; end if;
  begin
    insert into pg_temp.media_guard_probe(bucket_id, name)
      values ('partner-assets', 'referenced-image.png')
      on conflict (bucket_id, name) do update set changed = true;
    raise exception 'upsert overwrote existing partner image';
  exception when insufficient_privilege then null; end;

  update pg_temp.media_guard_probe set changed = true
    where bucket_id = 'partner-assets';
  get diagnostics affected = row_count;
  if affected is distinct from 0 then raise exception 'partner image was mutable'; end if;
  update pg_temp.media_guard_probe set changed = true
    where bucket_id = 'menu-videos';
  get diagnostics affected = row_count;
  if affected is distinct from 0 then raise exception 'menu video was mutable'; end if;
  delete from pg_temp.media_guard_probe where bucket_id = 'partner-assets';
  get diagnostics affected = row_count;
  if affected is distinct from 0 then raise exception 'partner image was deletable'; end if;
  delete from pg_temp.media_guard_probe where bucket_id = 'menu-videos';
  get diagnostics affected = row_count;
  if affected is distinct from 0 then raise exception 'menu video was deletable'; end if;

  update pg_temp.media_guard_probe set changed = true
    where bucket_id = 'city-memory-stamps';
  get diagnostics affected = row_count;
  if affected is distinct from 1 then raise exception 'memory bucket update changed'; end if;
  delete from pg_temp.media_guard_probe where bucket_id = 'city-media';
  get diagnostics affected = row_count;
  if affected is distinct from 1 then raise exception 'city bucket delete changed'; end if;

  begin
    update pg_temp.media_guard_probe set bucket_id = 'partner-assets'
      where bucket_id = 'city-memory-stamps';
    raise exception 'move into immutable bucket passed UPDATE WITH CHECK';
  exception when insufficient_privilege then null; end;
end
$test$;
reset role;

set local role anon;
do $test$
declare affected bigint;
begin
  -- Even a later permissive anon policy cannot override these guards.
  update pg_temp.media_guard_probe set changed = true
    where bucket_id = 'partner-assets';
  get diagnostics affected = row_count;
  if affected is distinct from 0 then raise exception 'anon overwrote partner image'; end if;
  delete from pg_temp.media_guard_probe where bucket_id = 'menu-videos';
  get diagnostics affected = row_count;
  if affected is distinct from 0 then raise exception 'anon deleted menu video'; end if;
  update pg_temp.media_guard_probe set changed = false
    where bucket_id = 'city-memory-stamps';
  get diagnostics affected = row_count;
  if affected is distinct from 1 then raise exception 'anon probe blocked unrelated bucket'; end if;
end
$test$;
reset role;
rollback;
