-- Run after the migration as postgres, in the SAME session as staging setup.
-- The runner MUST stop on the first SQL error (psql -v ON_ERROR_STOP=1 or
-- equivalent). Never infer success from ROLLBACK alone.
begin;
create function pg_temp.require_history_event(
  p_partner uuid, p_entity text, p_entity_id uuid, p_operation text)
returns partner_configuration_private.history
language plpgsql set search_path = ''
as $$
declare event_row partner_configuration_private.history;
begin
  select * into event_row from partner_configuration_private.history
    where partner_id = p_partner and entity_type = p_entity
      and entity_id = p_entity_id and operation = p_operation
    order by id desc limit 1;
  if not found then
    raise exception 'required media audit event missing: %/%/%/%',
      p_partner, p_entity, p_entity_id, p_operation
      using errcode = 'P0002';
  end if;
  return event_row;
end;
$$;
create function pg_temp.public_image(p_name text)
returns text language sql immutable set search_path = ''
as $$
  select 'https://slscoqdhbxftcournvut.supabase.co/storage/v1/object/public/partner-assets/microsites/22222222-2222-4222-8222-222222222222/staging/' ||
    pg_catalog.substr(pg_catalog.md5(p_name), 1, 8) || '-' ||
    pg_catalog.substr(pg_catalog.md5(p_name), 9, 4) || '-4' ||
    pg_catalog.substr(pg_catalog.md5(p_name), 14, 3) || '-8' ||
    pg_catalog.substr(pg_catalog.md5(p_name), 18, 3) || '-' ||
    pg_catalog.substr(pg_catalog.md5(p_name), 21, 12) || '.png';
$$;
do $test$
declare
  actor uuid := gen_random_uuid();
  partner uuid := gen_random_uuid();
  menu uuid := gen_random_uuid();
  category uuid := gen_random_uuid();
  item uuid := gen_random_uuid();
  direct_item uuid := gen_random_uuid();
  negative_item uuid := gen_random_uuid();
  microsite uuid := gen_random_uuid();
  version_one uuid := gen_random_uuid();
  version_two uuid := gen_random_uuid();
  video_url text;
  before_count bigint;
  event_count bigint;
  audit_row record;
  redacted_ref jsonb;
  other_ref jsonb;
begin
  -- Negative control: the shared assertion must fail on a missing event.
  begin
    perform pg_temp.require_history_event(partner, 'microsites',
      gen_random_uuid(), 'update');
    raise exception 'missing-event assertion returned success';
  exception when sqlstate 'P0002' then null; end;
  redacted_ref := partner_configuration_private.media_ref(
    'https://slscoqdhbxftcournvut.supabase.co/storage/v1/object/public/partner-assets/staged-covers/c3874193-549d-4714-ae48-7f7bca7549be-DO_NOT_LOG_PATH_TOKEN.png');
  if redacted_ref->>'redacted' is distinct from 'true'
    or redacted_ref->>'fingerprint' is null
    or redacted_ref::text ~ 'DO_NOT_LOG|staged-covers'
  then raise exception 'free filename leaked into media audit'; end if;
  redacted_ref := partner_configuration_private.media_ref(
    'https://user:DO_NOT_LOG_PASSWORD@slscoqdhbxftcournvut.supabase.co/storage/v1/object/public/partner-assets/private.png');
  if redacted_ref->>'redacted' is distinct from 'true'
    or redacted_ref::text ~ 'DO_NOT_LOG|user:'
  then raise exception 'URL credentials leaked into media audit'; end if;
  redacted_ref := partner_configuration_private.media_ref(
    pg_temp.public_image('signed') || '?token=DO_NOT_LOG_TOKEN_A');
  other_ref := partner_configuration_private.media_ref(
    pg_temp.public_image('signed') || '?token=DO_NOT_LOG_TOKEN_B');
  if redacted_ref->>'url' is distinct from pg_temp.public_image('signed')
    or other_ref->>'url' is distinct from pg_temp.public_image('signed')
    or redacted_ref->>'fingerprint' is not distinct from other_ref->>'fingerprint'
    or redacted_ref::text ~ 'DO_NOT_LOG'
    or other_ref::text ~ 'DO_NOT_LOG'
  then raise exception 'signed URL suffix was not redacted or correlated'; end if;
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
     logo_url, feature_card_url, discover_card_image_url, cover_urls)
  values (partner, 'Audit fixture', partner::text, array['Restaurant'],
    10, 'draft', false, pg_temp.public_image('old-logo'),
    pg_temp.public_image('feature') || '?token=DO_NOT_LOG_PARTNER',
    'https://private.invalid/discover?token=DO_NOT_LOG_DISCOVER',
    array[pg_temp.public_image('old-cover'),
      'https://slscoqdhbxftcournvut.supabase.co/storage/v1/object/public/partner-assets/staged-covers/c3874193-549d-4714-ae48-7f7bca7549be-DO_NOT_LOG_COVER.png']);
  select * into audit_row from pg_temp.require_history_event(
    partner, 'partners', partner, 'insert');
  if audit_row.actor_id is not null
    or audit_row.after_value #>> '{logo_url,url}'
      is distinct from pg_temp.public_image('old-logo')
    or audit_row.after_value #>> '{cover_urls,0,url}'
      is distinct from pg_temp.public_image('old-cover')
    or audit_row.after_value #>> '{feature_card_url,url}'
      is distinct from pg_temp.public_image('feature')
    or audit_row.after_value #>> '{feature_card_url,suffix_redacted}'
      is distinct from 'true'
    or audit_row.after_value #>> '{discover_card_image_url,redacted}'
      is distinct from 'true'
    or audit_row.after_value #>> '{cover_urls,1,redacted}'
      is distinct from 'true'
    or audit_row.after_value::text ~ 'DO_NOT_LOG'
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
  update public.partners set logo_url = pg_temp.public_image('new-logo')
    where id = partner;
  reset role;
  select * into audit_row from pg_temp.require_history_event(
    partner, 'partners', partner, 'update');
  if audit_row.actor_id is distinct from actor
    or audit_row.reason is distinct from 'partner_media_reference_change'
    or audit_row.before_value #>> '{logo_url,url}'
      is distinct from pg_temp.public_image('old-logo')
    or audit_row.after_value #>> '{logo_url,url}'
      is distinct from pg_temp.public_image('new-logo')
  then raise exception 'partner before/after or verified actor incorrect'; end if;
  perform set_config('request.jwt.claim.sub', '', true);
  perform set_config('request.jwt.claim.role', 'service_role', true);

  -- A no-op media update must not add a duplicate audit event.
  select count(*) into before_count from partner_configuration_private.history
    where partner_id = partner and entity_type = 'partners';
  update public.partners set updated_at = clock_timestamp() where id = partner;
  select count(*) into event_count from partner_configuration_private.history
    where partner_id = partner and entity_type = 'partners';
  if event_count is distinct from before_count then raise exception 'no-op duplicated partner audit'; end if;

  -- Even a service request carrying a subject is not a verified user session.
  perform set_config('request.jwt.claim.sub', actor::text, true);
  perform set_config('request.jwt.claim.role', 'service_role', true);
  insert into public.menus (id, partner_id, name, status)
    values (menu, partner, 'Audit menu', 'published');
  video_url := 'https://slscoqdhbxftcournvut.supabase.co/storage/v1/object/public/menu-videos/'
    || partner::text || '/' || menu::text ||
    '/c3874193-549d-4714-ae48-7f7bca7549be.mp4';
  insert into public.menu_categories (id, menu_id, name, slug, image_url)
    values (category, menu, 'Audit category', category::text,
      'data:image/png;base64,DO_NOT_LOG_CATEGORY');
  select * into audit_row from pg_temp.require_history_event(
    partner, 'menu_categories', category, 'insert');
  if audit_row.after_value #>> '{image_url,redacted}' is distinct from 'true'
    or audit_row.after_value::text ~ 'DO_NOT_LOG|base64'
  then raise exception 'category data URI leaked into media audit'; end if;
  -- Fault injection: suppress the exact audit trigger, then demand the event.
  -- The expected exception rolls back this nested DDL and fixture insert.
  begin
    alter table public.menu_items disable trigger partner_media_history;
    insert into public.menu_items (id, menu_id, category_id, name, price, image_url)
      values (negative_item, menu, category, 'Negative audit control', 1,
        pg_temp.public_image('negative'));
    perform pg_temp.require_history_event(partner, 'menu_items', negative_item, 'insert');
    raise exception 'disabled audit trigger passed the regression assertion';
  exception when sqlstate 'P0002' then null; end;
  insert into public.menu_items
    (id, menu_id, category_id, name, price, image_url, video_url)
  values (item, menu, category, 'Audit item', 1,
    pg_temp.public_image('item-old'), video_url || '?token=DO_NOT_LOG_MENU');
  update public.menu_items set image_url = pg_temp.public_image('item-new')
    where id = item;
  select * into audit_row from pg_temp.require_history_event(
    partner, 'menu_items', item, 'update');
  if audit_row.before_value #>> '{image_url,url}'
      is distinct from pg_temp.public_image('item-old')
    or audit_row.after_value #>> '{image_url,url}'
      is distinct from pg_temp.public_image('item-new')
    or audit_row.before_value #>> '{video_url,url}'
      is distinct from video_url
    or audit_row.before_value #>> '{video_url,suffix_redacted}'
      is distinct from 'true'
    or audit_row.before_value::text ~ 'DO_NOT_LOG'
    or audit_row.actor_id is not null
  then raise exception 'menu reference audit incorrect'; end if;
  select count(*) into before_count from partner_configuration_private.history
    where entity_type = 'menu_items' and entity_id = item;
  update public.menu_items set price = 2 where id = item;
  select count(*) into event_count from partner_configuration_private.history
    where entity_type = 'menu_items' and entity_id = item;
  if event_count is distinct from before_count then raise exception 'price change logged as media'; end if;
  insert into public.menu_items (id, menu_id, category_id, name, price, image_url)
    values (direct_item, menu, category, 'Direct delete', 1,
      pg_temp.public_image('direct'));
  delete from public.menu_items where id = direct_item;
  select * into audit_row from pg_temp.require_history_event(
    partner, 'menu_items', direct_item, 'delete');
  if audit_row.before_value #>> '{image_url,url}'
      is distinct from pg_temp.public_image('direct')
  then raise exception 'direct menu item deletion lost its image reference'; end if;
  delete from public.menus where id = menu;
  select * into audit_row from pg_temp.require_history_event(
    partner, 'menus', menu, 'delete');
  if audit_row.reason is distinct from 'menu_deleted_with_media_references'
    or jsonb_array_length(audit_row.before_value->'items') is distinct from 1
    or jsonb_array_length(audit_row.before_value->'categories') is distinct from 1
    or audit_row.before_value::text ~ 'DO_NOT_LOG'
  then raise exception 'menu cascade lost media references'; end if;

  insert into public.microsites (id, partner_id, slug)
    values (microsite, partner, 'audit-' || microsite::text);
  insert into public.microsite_versions
    (id, microsite_id, version_number, status, config)
  values (version_one, microsite, 1, 'draft',
    jsonb_build_object(
      'hero', jsonb_build_object('backgroundImageUrl', pg_temp.public_image('old-hero')),
      'deals', jsonb_build_object('topDealImageUrl',
        'https://private.invalid/photo-one.jpg?token=do-not-log-one'),
      'seo', jsonb_build_object('ogImageUrl', 'data:image/png;base64,DO_NOT_LOG_BASE64'),
      'elementText', jsonb_build_object(
        'content.aboutHeroImageUrl', pg_temp.public_image('old-about') || '?token=DO_NOT_LOG_TOKEN',
        'content.menuItem.private-secret.imageUrl', pg_temp.public_image('item-override'),
        'privateNoteUrl', 'https://private.invalid/DO_NOT_LOG_PRIVATE'),
      'content', jsonb_build_object('privateNote', 'DO_NOT_LOG_CONTENT')));
  insert into public.microsite_versions
    (id, microsite_id, version_number, status, config)
  values (version_two, microsite, 2, 'published',
    jsonb_build_object(
      'hero', jsonb_build_object('backgroundImageUrl', pg_temp.public_image('new-hero')),
      'deals', jsonb_build_object('topDealImageUrl',
        'https://private.invalid/photo-two.jpg?token=do-not-log-two'),
      'assets', jsonb_build_object('library', jsonb_build_array(
        jsonb_build_object('url', pg_temp.public_image('unused') || '?sig=DO_NOT_LOG_LIBRARY',
          'slot', 'DO_NOT_LOG_PRIVATE_SLOT'), 'DO_NOT_LOG_LEGACY_STRING')),
      'content', jsonb_build_object('privateNote', 'DO_NOT_LOG_CONTENT')));
  select * into audit_row from pg_temp.require_history_event(
    partner, 'microsite_versions', version_two, 'insert');
  if audit_row.before_value->>'version_id' is distinct from version_one::text
    or audit_row.before_value #>> '{media,hero.backgroundImageUrl,url}'
      is distinct from pg_temp.public_image('old-hero')
    or audit_row.after_value #>> '{media,hero.backgroundImageUrl,url}'
      is distinct from pg_temp.public_image('new-hero')
    or audit_row.before_value #>> '{media,elementText,content.aboutHeroImageUrl,url}'
      is distinct from pg_temp.public_image('old-about')
    or audit_row.before_value #>> '{media,elementText,content.aboutHeroImageUrl,suffix_redacted}'
      is distinct from 'true'
    or audit_row.after_value #>> '{media,assetLibrary,0,url,url}'
      is distinct from pg_temp.public_image('unused')
    or audit_row.after_value #> '{media,assetLibrary,0,slot}' is distinct from 'null'::jsonb
    or jsonb_array_length(audit_row.after_value #> '{media,assetLibrary}') is distinct from 1
    or audit_row.before_value #>> '{media,deals.topDealImageUrl,redacted}'
      is distinct from 'true'
    or audit_row.after_value #>> '{media,deals.topDealImageUrl,redacted}'
      is distinct from 'true'
    or audit_row.before_value #>> '{media,deals.topDealImageUrl,fingerprint}'
      is not distinct from audit_row.after_value #>> '{media,deals.topDealImageUrl,fingerprint}'
    or audit_row.before_value #>> '{media,seo.ogImageUrl,redacted}'
      is distinct from 'true'
    or audit_row.before_value #> '{media,elementText}' ? 'content.menuItem.private-secret.imageUrl'
    or not exists (
      select 1 from jsonb_object_keys(audit_row.before_value #> '{media,elementText}')
        as slots(slot_key)
      where slot_key like 'content.menuItem.sha256:%')
    or audit_row.before_value::text ~ 'DO_NOT_LOG|privateNoteUrl'
    or audit_row.before_value::text ~ 'private-secret'
    or audit_row.after_value::text ~ 'DO_NOT_LOG|privateNoteUrl'
  then raise exception 'version media comparison or private-data minimization failed'; end if;
  update public.microsites set published_version_id = version_two,
    status = 'published' where id = microsite;
  select * into audit_row from pg_temp.require_history_event(
    partner, 'microsites', microsite, 'update');
  if audit_row.before_value->>'published_version_id' is not null
    or audit_row.after_value->>'published_version_id' is distinct from version_two::text
    or audit_row.reason is distinct from 'publication_pointer_change'
  then raise exception 'publication pointer before/after audit incorrect'; end if;
  update public.microsites set status = 'archived' where id = microsite;
  select * into audit_row from pg_temp.require_history_event(
    partner, 'microsites', microsite, 'update');
  if audit_row.before_value->>'status' is distinct from 'published'
    or audit_row.after_value->>'status' is distinct from 'archived'
    or audit_row.before_value->>'published_version_id' is distinct from version_two::text
  then raise exception 'withdrawal status/pointer audit incorrect'; end if;
  update public.microsite_versions set status = 'archived'
    where id = version_one;
  select * into audit_row from pg_temp.require_history_event(
    partner, 'microsite_versions', version_one, 'update');
  if audit_row.before_value->>'status' is distinct from 'draft'
    or audit_row.after_value->>'status' is distinct from 'archived'
  then raise exception 'draft archive audit incorrect'; end if;
  delete from public.microsites where id = microsite;
  select * into audit_row from pg_temp.require_history_event(
    partner, 'microsites', microsite, 'delete');
  if jsonb_array_length(audit_row.before_value->'versions') is distinct from 2
  then raise exception 'microsite cascade lost version media'; end if;
end
$test$;
rollback;
