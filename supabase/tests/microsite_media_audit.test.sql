-- Run after the media audit migration as postgres. Fixtures and history roll back.
begin;
do $test$
declare
  actor uuid := gen_random_uuid();
  partner uuid := gen_random_uuid();
  menu uuid := gen_random_uuid();
  category uuid := gen_random_uuid();
  item uuid := gen_random_uuid();
  direct_item uuid := gen_random_uuid();
  microsite uuid := gen_random_uuid();
  version_one uuid := gen_random_uuid();
  version_two uuid := gen_random_uuid();
  before_count bigint;
  event_count bigint;
  audit_row record;
begin
  if not (select relrowsecurity from pg_class
    where oid = 'partner_configuration_private.history'::regclass) then
    raise exception 'audit history lost RLS';
  end if;
  if has_table_privilege('anon', 'partner_configuration_private.history', 'insert')
    or has_table_privilege('authenticated', 'partner_configuration_private.history', 'insert')
    or has_table_privilege('service_role', 'partner_configuration_private.history', 'update')
  then raise exception 'audit history privilege expanded'; end if;
  if not exists (select 1 from pg_trigger where tgrelid =
    'partner_configuration_private.history'::regclass
    and tgname = 'partner_history_append_only' and not tgisinternal) then
    raise exception 'append-only trigger missing';
  end if;

  -- A database/service actor has no verified user. Do not invent one.
  perform set_config('request.jwt.claim.sub', '', true);
  perform set_config('request.jwt.claim.role', 'service_role', true);
  insert into public.partners
    (id, name, slug, category, stamp_target, status, is_active,
     logo_url, cover_urls)
  values (partner, 'Audit fixture', partner::text, array['Restaurant'],
    10, 'draft', false, 'https://media.invalid/old-logo.png',
    array['https://media.invalid/old-cover.png']);
  select * into audit_row from partner_configuration_private.history
    where partner_id = partner and entity_type = 'partners'
    order by id desc limit 1;
  if audit_row.actor_id is not null
    or audit_row.after_value->>'logo_url' <> 'https://media.invalid/old-logo.png'
    or audit_row.after_value->'cover_urls' <> '["https://media.invalid/old-cover.png"]'::jsonb
  then raise exception 'partner media insert audit incorrect'; end if;
  begin
    update partner_configuration_private.history set reason = 'tampered'
      where id = audit_row.id;
    raise exception 'append-only history accepted UPDATE';
  exception when insufficient_privilege then null; end;

  insert into auth.users (id, email)
    values (actor, actor || '@media-audit.invalid');
  insert into public.users (id, is_admin) values (actor, true)
    on conflict (id) do update set is_admin = excluded.is_admin;
  perform set_config('request.jwt.claim.sub', actor::text, true);
  perform set_config('request.jwt.claim.role', 'authenticated', true);
  set local role authenticated;
  begin
    insert into partner_configuration_private.history
      (partner_id, entity_type, entity_id, operation, actor_id, reason)
    values (partner, 'partners', partner, 'update', actor, 'forged');
    raise exception 'authenticated actor forged history';
  exception when insufficient_privilege then null; end;
  update public.partners set logo_url = 'https://media.invalid/new-logo.png'
    where id = partner;
  reset role;
  select * into audit_row from partner_configuration_private.history
    where partner_id = partner and entity_type = 'partners'
    order by id desc limit 1;
  if audit_row.actor_id is distinct from actor
    or audit_row.reason <> 'partner_media_reference_change'
    or audit_row.before_value->>'logo_url' <> 'https://media.invalid/old-logo.png'
    or audit_row.after_value->>'logo_url' <> 'https://media.invalid/new-logo.png'
  then raise exception 'partner before/after or verified actor incorrect'; end if;
  perform set_config('request.jwt.claim.sub', '', true);
  perform set_config('request.jwt.claim.role', 'service_role', true);

  -- A no-op media update must not add a duplicate audit event.
  select count(*) into before_count from partner_configuration_private.history
    where partner_id = partner and entity_type = 'partners';
  update public.partners set updated_at = clock_timestamp() where id = partner;
  select count(*) into event_count from partner_configuration_private.history
    where partner_id = partner and entity_type = 'partners';
  if event_count <> before_count then raise exception 'no-op duplicated partner audit'; end if;

  -- Even a service request carrying a subject is not a verified user session.
  perform set_config('request.jwt.claim.sub', actor::text, true);
  perform set_config('request.jwt.claim.role', 'service_role', true);
  insert into public.menus (id, partner_id, name, status)
    values (menu, partner, 'Audit menu', 'published');
  insert into public.menu_categories (id, menu_id, name, slug, image_url)
    values (category, menu, 'Audit category', category::text,
      'https://media.invalid/category.png');
  insert into public.menu_items
    (id, menu_id, category_id, name, price, image_url, video_url)
  values (item, menu, category, 'Audit item', 1,
    'https://media.invalid/item-old.png', 'https://media.invalid/item.mp4');
  update public.menu_items set image_url = 'https://media.invalid/item-new.png'
    where id = item;
  select * into audit_row from partner_configuration_private.history
    where partner_id = partner and entity_type = 'menu_items'
      and entity_id = item and operation = 'update'
    order by id desc limit 1;
  if audit_row.before_value->>'image_url' <> 'https://media.invalid/item-old.png'
    or audit_row.after_value->>'image_url' <> 'https://media.invalid/item-new.png'
    or audit_row.before_value->>'video_url' <> 'https://media.invalid/item.mp4'
    or audit_row.actor_id is not null
  then raise exception 'menu reference audit incorrect'; end if;
  select count(*) into before_count from partner_configuration_private.history
    where entity_type = 'menu_items' and entity_id = item;
  update public.menu_items set price = 2 where id = item;
  select count(*) into event_count from partner_configuration_private.history
    where entity_type = 'menu_items' and entity_id = item;
  if event_count <> before_count then raise exception 'price change logged as media'; end if;
  insert into public.menu_items (id, menu_id, category_id, name, price, image_url)
    values (direct_item, menu, category, 'Direct delete', 1,
      'https://media.invalid/direct.png');
  delete from public.menu_items where id = direct_item;
  select * into audit_row from partner_configuration_private.history
    where partner_id = partner and entity_type = 'menu_items'
      and entity_id = direct_item and operation = 'delete'
    order by id desc limit 1;
  if audit_row.before_value->>'image_url' <> 'https://media.invalid/direct.png'
  then raise exception 'direct menu item deletion lost its image reference'; end if;
  delete from public.menus where id = menu;
  select * into audit_row from partner_configuration_private.history
    where partner_id = partner and entity_type = 'menus' and entity_id = menu
    order by id desc limit 1;
  if audit_row.reason <> 'menu_deleted_with_media_references'
    or jsonb_array_length(audit_row.before_value->'items') <> 1
    or jsonb_array_length(audit_row.before_value->'categories') <> 1
  then raise exception 'menu cascade lost media references'; end if;

  insert into public.microsites (id, partner_id, slug)
    values (microsite, partner, 'audit-' || microsite::text);
  insert into public.microsite_versions
    (id, microsite_id, version_number, status, config)
  values (version_one, microsite, 1, 'draft',
    '{"hero":{"backgroundImageUrl":"https://media.invalid/old-hero.png"},
      "elementText":{"content.aboutHeroImageUrl":"https://media.invalid/old-about.png"},
      "content":{"privateNote":"must not enter media audit"}}'::jsonb);
  insert into public.microsite_versions
    (id, microsite_id, version_number, status, config)
  values (version_two, microsite, 2, 'published',
    '{"hero":{"backgroundImageUrl":"https://media.invalid/new-hero.png"},
      "assets":{"library":[{"url":"https://media.invalid/unused.png","slot":"library"}]},
      "content":{"privateNote":"must not enter media audit"}}'::jsonb);
  select * into audit_row from partner_configuration_private.history
    where partner_id = partner and entity_type = 'microsite_versions'
      and entity_id = version_two and operation = 'insert'
    order by id desc limit 1;
  if audit_row.before_value->>'version_id' <> version_one::text
    or audit_row.before_value #>> '{media,hero.backgroundImageUrl}'
      <> 'https://media.invalid/old-hero.png'
    or audit_row.after_value #>> '{media,hero.backgroundImageUrl}'
      <> 'https://media.invalid/new-hero.png'
    or audit_row.after_value::text like '%privateNote%'
  then raise exception 'version media comparison or private-data minimization failed'; end if;
  update public.microsites set published_version_id = version_two,
    status = 'published' where id = microsite;
  select * into audit_row from partner_configuration_private.history
    where partner_id = partner and entity_type = 'microsites'
      and entity_id = microsite and operation = 'update'
    order by id desc limit 1;
  if audit_row.before_value->>'published_version_id' is not null
    or audit_row.after_value->>'published_version_id' <> version_two::text
    or audit_row.reason <> 'publication_pointer_change'
  then raise exception 'publication pointer before/after audit incorrect'; end if;
  update public.microsites set status = 'archived' where id = microsite;
  select * into audit_row from partner_configuration_private.history
    where partner_id = partner and entity_type = 'microsites'
      and entity_id = microsite and operation = 'update'
    order by id desc limit 1;
  if audit_row.before_value->>'status' <> 'published'
    or audit_row.after_value->>'status' <> 'archived'
    or audit_row.before_value->>'published_version_id' <> version_two::text
  then raise exception 'withdrawal status/pointer audit incorrect'; end if;
  update public.microsite_versions set status = 'archived'
    where id = version_one;
  select * into audit_row from partner_configuration_private.history
    where partner_id = partner and entity_type = 'microsite_versions'
      and entity_id = version_one and operation = 'update'
    order by id desc limit 1;
  if audit_row.before_value->>'status' <> 'draft'
    or audit_row.after_value->>'status' <> 'archived'
  then raise exception 'draft archive audit incorrect'; end if;
  delete from public.microsites where id = microsite;
  select * into audit_row from partner_configuration_private.history
    where partner_id = partner and entity_type = 'microsites'
      and entity_id = microsite and operation = 'delete'
    order by id desc limit 1;
  if jsonb_array_length(audit_row.before_value->'versions') <> 2
  then raise exception 'microsite cascade lost version media'; end if;
end
$test$;
rollback;
select 'Microsite media audit checks passed; all fixtures rolled back.' as result;
