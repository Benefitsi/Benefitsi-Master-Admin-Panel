-- Extend the existing append-only partner history. This migration does not touch
-- storage.objects, remove media, grant new access, or backfill invented actors.
alter table partner_configuration_private.history
  add column if not exists reason text;

alter table partner_configuration_private.history
  drop constraint if exists history_entity_type_check;
alter table partner_configuration_private.history
  add constraint history_entity_type_check check (
    entity_type = any (array[
      'deals', 'partner_reward_milestones', 'partners',
      'menu_items', 'menu_categories', 'menus',
      'microsites', 'microsite_versions'
    ])
  );

-- Fingerprints correlate changed draft/private sources without retaining URLs,
-- credentials, query tokens, data URIs or base64 in the append-only table.
-- A clear URL means only that it matches the production project's public
-- object path syntax; it is not an existence/rights/publication assertion.
create or replace function partner_configuration_private.media_ref(p_value text)
returns jsonb language plpgsql immutable set search_path = ''
as $$
declare raw_value text; base_url text; object_path text; fingerprint text;
        uuid_pattern constant text :=
          '[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}';
begin
  raw_value := pg_catalog.btrim(p_value);
  if raw_value is null or raw_value = '' then return null; end if;
  fingerprint := pg_catalog.encode(
    pg_catalog.sha256(pg_catalog.convert_to(raw_value, 'UTF8')), 'hex');
  base_url := pg_catalog.split_part(pg_catalog.split_part(raw_value, '?', 1), '#', 1);
  if pg_catalog.length(base_url) <= 2048 and
     base_url ~ '^https://slscoqdhbxftcournvut[.]supabase[.]co/storage/v1/object/public/(partner-assets|city-media|menu-videos)/[A-Za-z0-9._~/-]+$'
  then
    object_path := pg_catalog.substr(base_url,
      pg_catalog.length('https://slscoqdhbxftcournvut.supabase.co/storage/v1/object/public/') + 1);
    if object_path !~ '(^|/)[.]{1,2}(/|$)' and
       pg_catalog.strpos(object_path, '//') = 0 and (
         object_path ~ ('^partner-assets/microsites/' || uuid_pattern ||
           '/staging/' || uuid_pattern || '[.](png|jpe?g|webp)$')
         or object_path ~ ('^partner-assets/microsites/' || uuid_pattern ||
           '/(image|logo|badge|hero|deals_illustration|top_deal|about_hero|about_ingredient|about_location|about_prep|contact_location_icon|reward_5_image|reward_10_image|app_phone_screenshot|footer_benefitsi_logo)-' || uuid_pattern ||
           '-[0-9]{1,5}x[0-9]{1,5}[.]webp$')
         or object_path ~ ('^menu-videos/' || uuid_pattern || '/' ||
           uuid_pattern || '/' || uuid_pattern || '[.]mp4$')
       )
    then
      return pg_catalog.jsonb_build_object(
        'url', base_url, 'fingerprint', fingerprint,
        'suffix_redacted', base_url <> raw_value);
    end if;
  end if;
  return pg_catalog.jsonb_build_object('redacted', true, 'fingerprint', fingerprint);
end;
$$;

-- Keep the original configuration fields and add only public media references.
create or replace function partner_configuration_private.configuration(p_table text, p_row jsonb)
returns jsonb language sql immutable set search_path = ''
as $$
  select case when p_row is null then null when p_table = 'partners' then
    jsonb_build_object(
      'id', p_row->'id',
      'stamp_target', p_row->'stamp_target',
      'reward_text_primary', p_row->'reward_text_primary',
      'reward_text_secondary', p_row->'reward_text_secondary',
      'external_ordering_url', p_row->'external_ordering_url',
      'logo_url', partner_configuration_private.media_ref(p_row->>'logo_url'),
      'feature_card_url', partner_configuration_private.media_ref(p_row->>'feature_card_url'),
      'discover_card_image_url', partner_configuration_private.media_ref(p_row->>'discover_card_image_url'),
      'cover_urls', coalesce((
        select jsonb_agg(partner_configuration_private.media_ref(x.value) order by x.ordinality)
        from jsonb_array_elements_text(case when jsonb_typeof(p_row->'cover_urls') = 'array'
          then p_row->'cover_urls' else '[]'::jsonb end)
          with ordinality as x(value, ordinality)
      ), '[]'::jsonb)
    )
  else p_row-'updated_at'-'stock_remaining' end;
$$;

create or replace function partner_configuration_private.capture_configuration()
returns trigger language plpgsql security definer set search_path = ''
as $$
declare before_config jsonb; after_config jsonb; row_data jsonb; change_reason text;
begin
  if tg_op <> 'INSERT' then
    before_config := partner_configuration_private.configuration(tg_table_name, to_jsonb(old));
  end if;
  if tg_op <> 'DELETE' then
    after_config := partner_configuration_private.configuration(tg_table_name, to_jsonb(new));
  end if;
  if before_config is not distinct from after_config then
    if tg_op = 'DELETE' then return old; else return new; end if;
  end if;
  row_data := coalesce(to_jsonb(new), to_jsonb(old));
  change_reason := case
    when tg_table_name = 'partners' and tg_op = 'UPDATE' and
      (before_config - 'id' - 'stamp_target' - 'reward_text_primary' -
       'reward_text_secondary' - 'external_ordering_url') is distinct from
      (after_config - 'id' - 'stamp_target' - 'reward_text_primary' -
       'reward_text_secondary' - 'external_ordering_url')
      then 'partner_media_reference_change'
    else 'configuration_change'
  end;
  insert into partner_configuration_private.history
    (partner_id, entity_type, entity_id, operation, actor_id,
     before_value, after_value, reason)
  values
    (case when tg_table_name = 'partners' then (row_data->>'id')::uuid
      else (row_data->>'partner_id')::uuid end,
     tg_table_name, (row_data->>'id')::uuid, lower(tg_op),
     case when auth.role() = 'authenticated' then auth.uid() else null end,
     before_config, after_config, change_reason);
  if tg_op = 'DELETE' then return old; else return new; end if;
end;
$$;

-- Explicit image/video slots only. Unknown draft keys are never copied.
create or replace function partner_configuration_private.microsite_media_refs(p_config jsonb)
returns jsonb language sql immutable set search_path = ''
as $$
  select case when p_config is null then null else jsonb_build_object(
    'branding.logoUrl', partner_configuration_private.media_ref(p_config #>> '{branding,logoUrl}'),
    'branding.partnerBadgeUrl', partner_configuration_private.media_ref(p_config #>> '{branding,partnerBadgeUrl}'),
    'hero.backgroundImageUrl', partner_configuration_private.media_ref(p_config #>> '{hero,backgroundImageUrl}'),
    'deals.illustrationUrl', partner_configuration_private.media_ref(p_config #>> '{deals,illustrationUrl}'),
    'deals.topDealImageUrl', partner_configuration_private.media_ref(p_config #>> '{deals,topDealImageUrl}'),
    'seo.ogImageUrl', partner_configuration_private.media_ref(p_config #>> '{seo,ogImageUrl}'),
    'richMedia.url', partner_configuration_private.media_ref(p_config #>> '{richMedia,url}'),
    'richMedia.poster', partner_configuration_private.media_ref(p_config #>> '{richMedia,poster}'),
    'richMediaTour.url', partner_configuration_private.media_ref(p_config #>> '{richMediaTour,url}'),
    'richMediaTour.poster', partner_configuration_private.media_ref(p_config #>> '{richMediaTour,poster}'),
    'elementText', coalesce((
      select jsonb_object_agg(
        case when e.key ~ '^content[.]menuItem[.][a-z0-9_-]+[.]imageUrl$'
          then 'content.menuItem.sha256:' ||
            pg_catalog.encode(pg_catalog.sha256(pg_catalog.convert_to(e.key, 'UTF8')), 'hex') ||
            '.imageUrl'
          else e.key end,
        partner_configuration_private.media_ref(e.value))
      from jsonb_each_text(case when jsonb_typeof(p_config->'elementText') = 'object'
        then p_config->'elementText' else '{}'::jsonb end) e
      where e.key in (
        'branding.logo', 'contact.logo', 'footer.benefitsiLogo',
        'content.aboutHeroImageUrl', 'content.aboutIngredientImageUrl',
        'content.aboutLocationImageUrl', 'content.aboutPrepImageUrl',
        'content.appPhoneScreenshotUrl'
      ) or e.key ~ '^content[.]menuItem[.][a-z0-9_-]+[.]imageUrl$'
        or e.key ~ '^social[.](instagram|facebook|tiktok|youtube|whatsapp|website|google|linkedin)[.]iconUrl$'
        or e.key ~ '^stamps[.](number|reward)[.][0-9]+[.]image$'
    ), '{}'::jsonb),
    'assetLibrary', coalesce((
      select jsonb_agg(jsonb_build_object(
        'index', a.ordinality,
        'url', partner_configuration_private.media_ref(a.value->>'url'),
        'slot', case when a.value->>'slot' in (
          'branding.logoUrl', 'branding.partnerBadgeUrl', 'hero.backgroundImageUrl',
          'deals.illustrationUrl', 'deals.topDealImageUrl', 'seo.ogImageUrl',
          'content.aboutHeroImageUrl', 'content.aboutIngredientImageUrl',
          'content.aboutLocationImageUrl', 'content.aboutPrepImageUrl',
          'content.appPhoneScreenshotUrl'
        ) then a.value->>'slot' else null end,
        'slot_fingerprint', case when a.value->>'slot' is not null and
          a.value->>'slot' not in (
            'branding.logoUrl', 'branding.partnerBadgeUrl', 'hero.backgroundImageUrl',
            'deals.illustrationUrl', 'deals.topDealImageUrl', 'seo.ogImageUrl',
            'content.aboutHeroImageUrl', 'content.aboutIngredientImageUrl',
            'content.aboutLocationImageUrl', 'content.aboutPrepImageUrl',
            'content.appPhoneScreenshotUrl'
          ) then pg_catalog.encode(
            pg_catalog.sha256(pg_catalog.convert_to(a.value->>'slot', 'UTF8')), 'hex')
          else null end
      ) order by a.ordinality)
      from jsonb_array_elements(case when jsonb_typeof(p_config #> '{assets,library}') = 'array'
        then p_config #> '{assets,library}' else '[]'::jsonb end)
        with ordinality as a(value, ordinality)
      where a.value->>'url' is not null
    ), '[]'::jsonb)
  ) end;
$$;

create or replace function partner_configuration_private.capture_menu_media()
returns trigger language plpgsql security definer set search_path = ''
as $$
declare row_data jsonb; before_refs jsonb; after_refs jsonb; pid uuid;
begin
  if tg_op <> 'INSERT' then
    before_refs := jsonb_build_object(
      'menu_id', old.menu_id,
      'image_url', partner_configuration_private.media_ref(old.image_url));
    if tg_table_name = 'menu_items' then
      before_refs := before_refs || jsonb_build_object(
        'video_url', partner_configuration_private.media_ref(old.video_url));
    end if;
  end if;
  if tg_op <> 'DELETE' then
    after_refs := jsonb_build_object(
      'menu_id', new.menu_id,
      'image_url', partner_configuration_private.media_ref(new.image_url));
    if tg_table_name = 'menu_items' then
      after_refs := after_refs || jsonb_build_object(
        'video_url', partner_configuration_private.media_ref(new.video_url));
    end if;
  end if;
  if before_refs is not distinct from after_refs or
    (coalesce(before_refs->'image_url', 'null'::jsonb) = 'null'::jsonb
      and coalesce(before_refs->'video_url', 'null'::jsonb) = 'null'::jsonb
      and coalesce(after_refs->'image_url', 'null'::jsonb) = 'null'::jsonb
      and coalesce(after_refs->'video_url', 'null'::jsonb) = 'null'::jsonb)
  then
    if tg_op = 'DELETE' then return old; else return new; end if;
  end if;
  row_data := case when tg_op = 'DELETE' then to_jsonb(old) else to_jsonb(new) end;
  select m.partner_id into pid from public.menus m where m.id = (row_data->>'menu_id')::uuid;
  -- The parent BEFORE DELETE trigger records cascade references before they vanish.
  if pid is null then
    if tg_op = 'DELETE' then return old; end if;
    raise exception 'menu_media_audit_parent_missing' using errcode = '23503';
  end if;
  insert into partner_configuration_private.history
    (partner_id, entity_type, entity_id, operation, actor_id,
     before_value, after_value, reason)
  values
    (pid, tg_table_name, (row_data->>'id')::uuid, lower(tg_op),
     case when auth.role() = 'authenticated' then auth.uid() else null end,
     before_refs, after_refs, 'menu_media_reference_change');
  if tg_op = 'DELETE' then return old; else return new; end if;
end;
$$;

drop trigger if exists partner_media_history on public.menu_items;
create trigger partner_media_history after insert or update or delete on public.menu_items
for each row execute function partner_configuration_private.capture_menu_media();
drop trigger if exists partner_media_history on public.menu_categories;
create trigger partner_media_history after insert or update or delete on public.menu_categories
for each row execute function partner_configuration_private.capture_menu_media();

create or replace function partner_configuration_private.capture_menu_deletion()
returns trigger language plpgsql security definer set search_path = ''
as $$
declare media_refs jsonb;
begin
  select jsonb_build_object(
    'items', coalesce((select jsonb_agg(jsonb_build_object(
      'id', i.id,
      'image_url', partner_configuration_private.media_ref(i.image_url),
      'video_url', partner_configuration_private.media_ref(i.video_url)))
      from public.menu_items i where i.menu_id = old.id
        and (nullif(i.image_url, '') is not null or nullif(i.video_url, '') is not null)), '[]'::jsonb),
    'categories', coalesce((select jsonb_agg(jsonb_build_object(
      'id', c.id,
      'image_url', partner_configuration_private.media_ref(c.image_url)))
      from public.menu_categories c where c.menu_id = old.id
        and nullif(c.image_url, '') is not null), '[]'::jsonb)
  ) into media_refs;
  if media_refs->'items' <> '[]'::jsonb or media_refs->'categories' <> '[]'::jsonb then
    insert into partner_configuration_private.history
      (partner_id, entity_type, entity_id, operation, actor_id,
       before_value, after_value, reason)
    values (old.partner_id, 'menus', old.id, 'delete',
      case when auth.role() = 'authenticated' then auth.uid() else null end,
      media_refs, null, 'menu_deleted_with_media_references');
  end if;
  return old;
end;
$$;
drop trigger if exists partner_media_parent_history on public.menus;
create trigger partner_media_parent_history before delete on public.menus
for each row execute function partner_configuration_private.capture_menu_deletion();

create or replace function partner_configuration_private.capture_microsite_version()
returns trigger language plpgsql security definer set search_path = ''
as $$
declare pid uuid; before_refs jsonb; after_refs jsonb; previous_version record;
        row_data jsonb;
begin
  row_data := case when tg_op = 'DELETE' then to_jsonb(old) else to_jsonb(new) end;
  select m.partner_id into pid from public.microsites m
    where m.id = (row_data->>'microsite_id')::uuid;
  -- A parent deletion is captured before its versions cascade.
  if pid is null then
    if tg_op = 'DELETE' then return old; end if;
    raise exception 'microsite_media_audit_parent_missing' using errcode = '23503';
  end if;
  if tg_op = 'INSERT' then
    select v.id, v.status, v.config into previous_version
    from public.microsite_versions v
    where v.microsite_id = new.microsite_id and v.id <> new.id
      and v.version_number < new.version_number
    order by v.version_number desc limit 1;
    if previous_version.id is not null then
      before_refs := jsonb_build_object(
        'version_id', previous_version.id, 'microsite_id', new.microsite_id,
        'status', previous_version.status,
        'media', partner_configuration_private.microsite_media_refs(previous_version.config));
    end if;
  else
    before_refs := jsonb_build_object(
      'version_id', old.id, 'microsite_id', old.microsite_id,
      'status', old.status,
      'media', partner_configuration_private.microsite_media_refs(old.config));
  end if;
  if tg_op <> 'DELETE' then
    after_refs := jsonb_build_object(
      'version_id', new.id, 'microsite_id', new.microsite_id,
      'status', new.status,
      'media', partner_configuration_private.microsite_media_refs(new.config));
  end if;
  if before_refs is not distinct from after_refs then
    if tg_op = 'DELETE' then return old; else return new; end if;
  end if;
  insert into partner_configuration_private.history
    (partner_id, entity_type, entity_id, operation, actor_id,
     before_value, after_value, reason)
  values
    (pid, 'microsite_versions', (row_data->>'id')::uuid, lower(tg_op),
     case when auth.role() = 'authenticated' then auth.uid() else null end,
     before_refs, after_refs,
     case when tg_op = 'INSERT' then 'microsite_version_saved'
       when tg_op = 'DELETE' then 'microsite_version_deleted'
       else 'microsite_version_changed' end);
  if tg_op = 'DELETE' then return old; else return new; end if;
end;
$$;
drop trigger if exists partner_media_history on public.microsite_versions;
create trigger partner_media_history after insert or update or delete on public.microsite_versions
for each row execute function partner_configuration_private.capture_microsite_version();

create or replace function partner_configuration_private.capture_microsite_publication()
returns trigger language plpgsql security definer set search_path = ''
as $$
declare before_state jsonb; after_state jsonb; versions jsonb;
begin
  if tg_op = 'DELETE' then
    select coalesce(jsonb_agg(jsonb_build_object(
      'version_id', v.id, 'status', v.status,
      'media', partner_configuration_private.microsite_media_refs(v.config))), '[]'::jsonb)
    into versions from public.microsite_versions v where v.microsite_id = old.id;
    before_state := jsonb_build_object(
      'partner_id', old.partner_id,
      'status', old.status, 'published_version_id', old.published_version_id,
      'versions', versions);
  elsif tg_op = 'UPDATE' then
    before_state := jsonb_build_object(
      'partner_id', old.partner_id,
      'status', old.status, 'published_version_id', old.published_version_id);
  end if;
  if tg_op <> 'DELETE' then
    after_state := jsonb_build_object(
      'partner_id', new.partner_id,
      'status', new.status, 'published_version_id', new.published_version_id);
  end if;
  if before_state is not distinct from after_state then
    if tg_op = 'DELETE' then return old; else return new; end if;
  end if;
  insert into partner_configuration_private.history
    (partner_id, entity_type, entity_id, operation, actor_id,
     before_value, after_value, reason)
  values
    (case when tg_op = 'DELETE' then old.partner_id else new.partner_id end,
     'microsites', case when tg_op = 'DELETE' then old.id else new.id end,
     lower(tg_op),
     case when auth.role() = 'authenticated' then auth.uid() else null end,
     before_state, after_state,
     case when tg_op = 'DELETE' then 'microsite_deleted'
       when tg_op = 'UPDATE' and old.published_version_id is distinct from new.published_version_id
         then 'publication_pointer_change'
       when tg_op = 'UPDATE' and old.status is distinct from new.status
         then 'publication_status_change'
       else 'microsite_created' end);
  if tg_op = 'DELETE' then return old; else return new; end if;
end;
$$;
drop trigger if exists partner_media_history on public.microsites;
create trigger partner_media_history after insert or update on public.microsites
for each row execute function partner_configuration_private.capture_microsite_publication();
drop trigger if exists partner_media_parent_history on public.microsites;
create trigger partner_media_parent_history before delete on public.microsites
for each row execute function partner_configuration_private.capture_microsite_publication();

-- Trigger functions and reference-sanitizing helpers are private details.
revoke all on function partner_configuration_private.media_ref(text)
  from public, anon, authenticated;
revoke all on function partner_configuration_private.microsite_media_refs(jsonb)
  from public, anon, authenticated;
revoke all on function partner_configuration_private.capture_menu_media()
  from public, anon, authenticated;
revoke all on function partner_configuration_private.capture_menu_deletion()
  from public, anon, authenticated;
revoke all on function partner_configuration_private.capture_microsite_version()
  from public, anon, authenticated;
revoke all on function partner_configuration_private.capture_microsite_publication()
  from public, anon, authenticated;
